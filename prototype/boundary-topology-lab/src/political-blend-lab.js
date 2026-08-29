import {FIXTURE_BY_ID} from "./fixtures.js";
import {composeRawRing} from "./topology.js";

const VIEW_WIDTH = 760;
const VIEW_HEIGHT = 340;
const EPSILON = 1e-6;
const MIN_DECAY_BLUR_PX = 0.75;
const MAX_DECAY_BLUR_RATIO = 0.42;
const MIN_COLOR_BLUR_RATIO = 0.08;
const MAX_COLOR_BLUR_RATIO = 0.58;
const BASE_COLOR = "#dce5e8";
const JUNCTION_INFLUENCE_POWER = 2;
const SCREEN_HAZE_SOURCE_CACHE = new WeakMap();
const COLORS = Object.freeze({west: "#dfa9ce", east: "#f0d49a", south: "#a7d8d3"});
const FEATHER_PROFILE = Object.freeze([
  Object.freeze({offset: -1, alpha: 0}),
  Object.freeze({offset: -0.82, alpha: 0.025}),
  Object.freeze({offset: -0.58, alpha: 0.1}),
  Object.freeze({offset: -0.3, alpha: 0.26}),
  Object.freeze({offset: 0, alpha: 0.42}),
  Object.freeze({offset: 0.3, alpha: 0.26}),
  Object.freeze({offset: 0.58, alpha: 0.1}),
  Object.freeze({offset: 0.82, alpha: 0.025}),
  Object.freeze({offset: 1, alpha: 0})
]);

export const POLITICAL_BLEND_OPTIONS = Object.freeze({width: 24, strength: 1, smoothness: 2, decaySoftness: 0.65});

const topBoundary = freezePoints([[385, 0], [358, 28], [410, 54], [348, 80], [415, 109], [350, 138], [380, 170]]);
const leftBoundary = freezePoints([[380, 170], [338, 190], [357, 213], [304, 239], [329, 263], [274, 291], [245, 340]]);
const rightBoundary = freezePoints([[380, 170], [425, 190], [404, 216], [464, 240], [441, 266], [510, 292], [550, 340]]);
const junction = Object.freeze([380, 170]);

export const POLITICAL_BLEND_FIXTURE = Object.freeze({
  id: "administrative-acute-junction",
  name: "行政锐角、凹角与三方交汇",
  description: "专门放大九轨方案在连续锐角、凹角与三方交汇处的几何突变。",
  paths: Object.freeze([
    boundary("top", topBoundary, COLORS.west, COLORS.east, [80, 90]),
    boundary("left", leftBoundary, COLORS.west, COLORS.south, [80, 270]),
    boundary("right", rightBoundary, COLORS.south, COLORS.east, [680, 265])
  ]),
  regions: Object.freeze([
    Object.freeze({id: "west", color: COLORS.west, points: freezePoints([[0, 0], ...topBoundary, ...leftBoundary.slice(1), [0, VIEW_HEIGHT]])}),
    Object.freeze({id: "east", color: COLORS.east, points: freezePoints([
      topBoundary[0], [VIEW_WIDTH, 0], [VIEW_WIDTH, VIEW_HEIGHT], rightBoundary.at(-1),
      ...rightBoundary.slice(0, -1).toReversed(), ...topBoundary.slice(0, -1).toReversed()
    ])}),
    Object.freeze({id: "south", color: COLORS.south, points: freezePoints([
      leftBoundary.at(-1), ...leftBoundary.slice(0, -1).toReversed(), ...rightBoundary.slice(1)
    ])})
  ]),
  junctions: Object.freeze([Object.freeze({point: junction, pathIds: Object.freeze(["top", "left", "right"])})])
});

export const POLITICAL_BLEND_FIXTURES = Object.freeze([
  POLITICAL_BLEND_FIXTURE,
  adaptTopologyFixture("tri-state-junction", "三国交界"),
  adaptTopologyFixture("cross-state-province", "跨国省界"),
  adaptTopologyFixture("map-boundary", "贴图边缘国界")
]);

const POLITICAL_BLEND_FIXTURE_BY_ID = new Map(POLITICAL_BLEND_FIXTURES.map(fixture => [fixture.id, fixture]));

export const POLITICAL_BLEND_CANDIDATES = Object.freeze([
  Object.freeze({id: "nine-track", name: "第 370 项九轨", geometry: "offset-before-smooth"}),
  Object.freeze({id: "historical-band", name: "v0.5.4 需求前基线", geometry: "two-rail-offset-before-smooth"}),
  Object.freeze({id: "continuous-ribbon", name: "连续中心线色带", geometry: "smooth-before-offset"}),
  Object.freeze({id: "screen-haze", name: "屏幕空间朦胧", geometry: "raster-mask"})
]);

export function analyzePoliticalBlendFixtureTopology(fixture = POLITICAL_BLEND_FIXTURE) {
  const unexpectedIntersections = [];
  let junctionPairIntersections = 0;
  for (let firstPathIndex = 0; firstPathIndex < fixture.paths.length; firstPathIndex++) {
    const firstPath = fixture.paths[firstPathIndex];
    unexpectedIntersections.push(...selfIntersections(firstPath.points).map(hit => ({...hit, paths: [firstPath.id, firstPath.id]})));
    for (let secondPathIndex = firstPathIndex + 1; secondPathIndex < fixture.paths.length; secondPathIndex++) {
      const secondPath = fixture.paths[secondPathIndex];
      for (let firstSegment = 0; firstSegment < firstPath.points.length - 1; firstSegment++) {
        for (let secondSegment = 0; secondSegment < secondPath.points.length - 1; secondSegment++) {
          const first = [firstPath.points[firstSegment], firstPath.points[firstSegment + 1]];
          const second = [secondPath.points[secondSegment], secondPath.points[secondSegment + 1]];
          if (!segmentsIntersect(first[0], first[1], second[0], second[1])) continue;
          if (fixture.junctions.some(item => item.pathIds.includes(firstPath.id) && item.pathIds.includes(secondPath.id) && segmentsShareOnlyJunction(first, second, item.point))) {
            junctionPairIntersections++;
            continue;
          }
          unexpectedIntersections.push({paths: [firstPath.id, secondPath.id], segments: [firstSegment, secondSegment]});
        }
      }
    }
  }
  const regionSelfIntersections = fixture.regions.flatMap(region => selfIntersections(region.points, true).map(hit => ({...hit, region: region.id})));
  const expectedJunctionPairIntersections = fixture.junctions.reduce((total, item) => total + item.pathIds.length * (item.pathIds.length - 1) / 2, 0);
  return {
    valid: unexpectedIntersections.length === 0 && regionSelfIntersections.length === 0 && junctionPairIntersections === expectedJunctionPairIntersections,
    junctionPairIntersections,
    expectedJunctionPairIntersections,
    unexpectedIntersections,
    regionSelfIntersections
  };
}

export function evaluatePoliticalBlendCandidates(input = {}, fixtureOrId = POLITICAL_BLEND_FIXTURE) {
  const fixture = resolveFixture(fixtureOrId);
  const options = normalizeOptions(input);
  return {
    fixtureId: fixture.id,
    topology: analyzePoliticalBlendFixtureTopology(fixture),
    options,
    candidates: POLITICAL_BLEND_CANDIDATES.map(candidate => {
      if (candidate.id === "screen-haze") {
        return {...candidate, tracks: 0, invertedTriangles: 0, degenerateTriangles: 0, widthVariation: 0, junctionMode: "normalized-adjacent", anchorMode: "raw-ownership-boundary", decayMask: resolveScreenHazeDecayMask(options), finite: true};
      }
      const reports = fixture.paths.map(path => analyzeCandidatePath(path, candidate.id, options));
      return {
        ...candidate,
        tracks: candidate.id === "nine-track" ? FEATHER_PROFILE.length : candidate.id === "continuous-ribbon" ? 3 : 2,
        invertedTriangles: sum(reports, "invertedTriangles"),
        degenerateTriangles: sum(reports, "degenerateTriangles"),
        widthVariation: Math.max(...reports.map(report => report.widthVariation)),
        junctionMode: candidate.id === "continuous-ribbon" ? "round-union" : "independent-caps",
        finite: reports.every(report => report.finite)
      };
    })
  };
}

export function mountPoliticalBlendLab(root = document) {
  const host = root.getElementById("political-blend-lab");
  if (!host || host.dataset.mounted === "true") return null;
  host.dataset.mounted = "true";
  const options = {...POLITICAL_BLEND_OPTIONS};
  let fixtureId = POLITICAL_BLEND_FIXTURE.id;
  const fixtureList = root.getElementById("blend-fixture-list");
  fixtureList.innerHTML = POLITICAL_BLEND_FIXTURES.map((fixture, index) => `<button class="fixture-button" data-blend-fixture="${fixture.id}"><span>${fixture.name}</span><small>${String(index + 1).padStart(2, "0")}</small></button>`).join("");
  const controls = {
    width: root.getElementById("blend-width"),
    strength: root.getElementById("blend-strength"),
    smoothness: root.getElementById("blend-smoothness"),
    decaySoftness: root.getElementById("blend-decay-softness")
  };
  const outputs = {
    width: root.getElementById("blend-width-value"),
    strength: root.getElementById("blend-strength-value"),
    smoothness: root.getElementById("blend-smoothness-value"),
    decaySoftness: root.getElementById("blend-decay-softness-value")
  };
  let scheduled = false;
  const render = () => {
    scheduled = false;
    const fixture = resolveFixture(fixtureId);
    const report = evaluatePoliticalBlendCandidates(options, fixture);
    root.querySelectorAll("[data-blend-fixture]").forEach(button => button.classList.toggle("active", button.dataset.blendFixture === fixture.id));
    for (const candidate of report.candidates) {
      drawCandidate(root.getElementById(`blend-${candidate.id}`), candidate.id, report.options, fixture);
      root.getElementById(`blend-${candidate.id}-metrics`).innerHTML = metricsMarkup(candidate);
    }
    const current = report.candidates[0];
    const continuous = report.candidates[2];
    root.getElementById("blend-lab-note").textContent = `九轨基线：反向三角 ${current.invertedTriangles}、截面宽度突变 ${(current.widthVariation * 100).toFixed(1)}%；连续中心线：反向三角 ${continuous.invertedTriangles}、截面宽度突变 ${(continuous.widthVariation * 100).toFixed(1)}%。屏幕空间候选按原始国家边界归一化相邻边影响，总混合量不随交汇边数叠加。`;
    root.getElementById("blend-fixture-summary").innerHTML = `<strong>${fixture.name}</strong><span>${fixture.description}</span><br><span class="${report.topology.valid ? "pass" : "fail"}">${report.topology.valid ? "拓扑合法" : "拓扑非法"} · 国界 ${fixture.paths.length} 条 · 交汇 ${fixture.junctions.filter(item => item.pathIds.length >= 3).length} 处</span>`;
    root.dispatchEvent(new CustomEvent("boundarylab:blendchange", {detail: {
      text: `${fixture.name} · ${report.topology.valid ? "拓扑合法" : "拓扑非法"}`,
      passed: report.topology.valid
    }}));
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(render);
  };
  for (const [key, control] of Object.entries(controls)) {
    control.addEventListener("input", () => {
      options[key] = Number(control.value);
      updateOutputs(outputs, options);
      schedule();
    });
  }
  fixtureList.addEventListener("click", event => {
    const button = event.target.closest("[data-blend-fixture]");
    if (!button || !POLITICAL_BLEND_FIXTURE_BY_ID.has(button.dataset.blendFixture)) return;
    fixtureId = button.dataset.blendFixture;
    schedule();
  });
  updateOutputs(outputs, options);
  render();
  const api = Object.freeze({
    fixtures: POLITICAL_BLEND_FIXTURES,
    candidates: POLITICAL_BLEND_CANDIDATES,
    evaluate: evaluatePoliticalBlendCandidates,
    inspectTopology: analyzePoliticalBlendFixtureTopology,
    currentFixture: () => resolveFixture(fixtureId),
    selectFixture: nextFixtureId => {
      if (!POLITICAL_BLEND_FIXTURE_BY_ID.has(nextFixtureId)) return false;
      fixtureId = nextFixtureId;
      render();
      return true;
    }
  });
  window.boundaryPoliticalBlendLab = api;
  return api;
}

function drawCandidate(canvas, candidateId, options, fixture) {
  if (!canvas) return;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  drawBase(context, fixture);
  if (candidateId === "nine-track") drawNineTrack(context, options, fixture);
  if (candidateId === "historical-band") drawHistoricalBand(context, options, fixture);
  if (candidateId === "continuous-ribbon") drawContinuousRibbon(context, options, fixture);
  if (candidateId === "screen-haze") {
    drawBoundaryInk(context, fixture);
    drawScreenHaze(context, options, fixture);
  } else {
    drawBoundaryInk(context, fixture);
  }
  drawJunctions(context, fixture);
}

function drawBase(context, fixture) {
  context.fillStyle = BASE_COLOR;
  context.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  for (const region of fixture.regions) fillPolygon(context, region.points, region.color);
}

function drawNineTrack(context, options, fixture) {
  for (const path of fixture.paths) {
    const tracks = FEATHER_PROFILE.map(sample => ({
      points: chaikin(offsetPath(path.points, path.sidePointA, options.width * 0.5 * sample.offset), 1, 0.18),
      color: sample.offset < 0 ? path.colorA : sample.offset > 0 ? path.colorB : mixHex(path.colorA, path.colorB, 0.5),
      alpha: options.strength * sample.alpha
    }));
    fillTrackSet(context, tracks);
  }
}

function drawHistoricalBand(context, options, fixture) {
  for (const path of fixture.paths) {
    fillTrackSet(context, [
      {points: chaikin(offsetPath(path.points, path.sidePointA, options.width * 0.5), 1, 0.18), color: path.colorA, alpha: 0.25 * options.strength},
      {points: chaikin(offsetPath(path.points, path.sidePointA, -options.width * 0.5), 1, 0.18), color: path.colorB, alpha: 0.25 * options.strength}
    ]);
  }
}

function drawContinuousRibbon(context, options, fixture) {
  for (const path of fixture.paths) {
    const center = chaikin(path.points, options.smoothness, 0.2);
    fillTrackSet(context, [
      {points: offsetPath(center, path.sidePointA, -options.width * 0.5), color: path.colorA, alpha: 0},
      {points: center, color: mixHex(path.colorA, path.colorB, 0.5), alpha: 0.34 * options.strength},
      {points: offsetPath(center, path.sidePointA, options.width * 0.5), color: path.colorB, alpha: 0}
    ]);
  }
  for (const item of fixture.junctions.filter(candidate => candidate.pathIds.length >= 3)) {
    const radius = options.width * 0.52;
    const colors = fixture.paths.filter(path => item.pathIds.includes(path.id)).flatMap(path => [path.colorA, path.colorB]);
    const mixed = mixMany(colors);
    const gradient = context.createRadialGradient(item.point[0], item.point[1], 0, item.point[0], item.point[1], radius);
    gradient.addColorStop(0, rgba(mixed, 0.28 * options.strength));
    gradient.addColorStop(1, rgba(mixed, 0));
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(item.point[0], item.point[1], radius, 0, Math.PI * 2);
    context.fill();
  }
}

function drawScreenHaze(context, options, fixture) {
  const decayMask = resolveScreenHazeDecayMask(options);
  const overlay = makeCanvas();
  const overlayContext = overlay.getContext("2d");
  const overlayImage = overlayContext.createImageData(VIEW_WIDTH, VIEW_HEIGHT);
  const source = resolveScreenHazeSource(fixture);
  const {palette, regionByPixel} = source;
  const paths = resolveScreenHazePaths(fixture, source);
  const pathDistanceSquared = paths.map(() => {
    const distances = new Float32Array(VIEW_WIDTH * VIEW_HEIGHT);
    distances.fill(Number.POSITIVE_INFINITY);
    return distances;
  });
  for (let pathIndex = 0; pathIndex < paths.length; pathIndex++) {
    const path = paths[pathIndex];
    for (let segmentIndex = 0; segmentIndex < path.points.length - 1; segmentIndex++) {
      rasterizeAdjacentSegmentDistance({
        a: path.points[segmentIndex],
        b: path.points[segmentIndex + 1],
        colorAIndex: path.colorAIndex,
        colorBIndex: path.colorBIndex,
        radius: decayMask.effectiveHalfExtentPx,
        regionByPixel,
        pathDistanceSquared: pathDistanceSquared[pathIndex]
      });
    }
  }
  const coreHalfWidth = decayMask.coreWidthPx * 0.5;
  for (let pixelIndex = 0; pixelIndex < regionByPixel.length; pixelIndex++) {
    const ownColorIndex = regionByPixel[pixelIndex];
    let minimumDistance = Number.POSITIVE_INFINITY;
    let totalWeight = 0;
    let neighborRed = 0;
    let neighborGreen = 0;
    let neighborBlue = 0;
    for (let pathIndex = 0; pathIndex < paths.length; pathIndex++) {
      const distanceSquared = pathDistanceSquared[pathIndex][pixelIndex];
      if (!Number.isFinite(distanceSquared)) continue;
      const path = paths[pathIndex];
      const distanceToPath = Math.sqrt(distanceSquared);
      minimumDistance = Math.min(minimumDistance, distanceToPath);
      const influence = screenHazeInfluence(distanceToPath, decayMask.colorBlurPx);
      if (influence <= 0) continue;
      const weight = influence ** JUNCTION_INFLUENCE_POWER;
      const neighborColorIndex = ownColorIndex === path.colorAIndex ? path.colorBIndex : path.colorAIndex;
      const neighbor = palette[neighborColorIndex].rgb;
      totalWeight += weight;
      neighborRed += neighbor[0] * weight;
      neighborGreen += neighbor[1] * weight;
      neighborBlue += neighbor[2] * weight;
    }
    if (!Number.isFinite(minimumDistance)) continue;
    const distanceToBoundary = minimumDistance;
    if (distanceToBoundary > decayMask.effectiveHalfExtentPx) continue;
    const colorMix = 0.5 * screenHazeInfluence(distanceToBoundary, decayMask.colorBlurPx);
    const maskAlpha = distanceToBoundary <= coreHalfWidth
      ? 1
      : 1 - smoothstep(coreHalfWidth, decayMask.effectiveHalfExtentPx, distanceToBoundary);
    const own = palette[ownColorIndex].rgb;
    const neighbor = totalWeight > EPSILON
      ? [neighborRed / totalWeight, neighborGreen / totalWeight, neighborBlue / totalWeight]
      : own;
    const offset = pixelIndex * 4;
    overlayImage.data[offset] = Math.round(own[0] * (1 - colorMix) + neighbor[0] * colorMix);
    overlayImage.data[offset + 1] = Math.round(own[1] * (1 - colorMix) + neighbor[1] * colorMix);
    overlayImage.data[offset + 2] = Math.round(own[2] * (1 - colorMix) + neighbor[2] * colorMix);
    overlayImage.data[offset + 3] = Math.round(255 * options.strength * maskAlpha);
  }
  overlayContext.putImageData(overlayImage, 0, 0);
  context.drawImage(overlay, 0, 0);
}

function resolveScreenHazeSource(fixture) {
  const cached = SCREEN_HAZE_SOURCE_CACHE.get(fixture);
  if (cached) return cached;
  const source = makeCanvas();
  const sourceContext = source.getContext("2d");
  drawBase(sourceContext, fixture);
  const sourceImage = sourceContext.getImageData(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  const palette = [...new Set([...fixture.regions.map(region => region.color), BASE_COLOR])].map(color => ({color, rgb: hexToRgb(color)}));
  const value = {
    palette,
    paletteIndex: new Map(palette.map((entry, index) => [entry.color, index])),
    paths: null,
    regionByPixel: classifySourcePixels(sourceImage.data, palette)
  };
  SCREEN_HAZE_SOURCE_CACHE.set(fixture, value);
  return value;
}

function resolveScreenHazePaths(fixture, source) {
  if (source.paths) return source.paths;
  source.paths = fixture.paths.map(path => ({
    colorAIndex: source.paletteIndex.get(path.colorA),
    colorBIndex: source.paletteIndex.get(path.colorB),
    points: path.points
  }));
  return source.paths;
}

function classifySourcePixels(sourcePixels, palette) {
  const result = new Uint8Array(VIEW_WIDTH * VIEW_HEIGHT);
  for (let pixelIndex = 0; pixelIndex < result.length; pixelIndex++) {
    const offset = pixelIndex * 4;
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let paletteIndex = 0; paletteIndex < palette.length; paletteIndex++) {
      const rgb = palette[paletteIndex].rgb;
      const dr = sourcePixels[offset] - rgb[0];
      const dg = sourcePixels[offset + 1] - rgb[1];
      const db = sourcePixels[offset + 2] - rgb[2];
      const colorDistance = dr * dr + dg * dg + db * db;
      if (colorDistance >= bestDistance) continue;
      bestDistance = colorDistance;
      bestIndex = paletteIndex;
    }
    result[pixelIndex] = bestIndex;
  }
  return result;
}

function rasterizeAdjacentSegmentDistance({a, b, colorAIndex, colorBIndex, radius, regionByPixel, pathDistanceSquared}) {
  const minimumX = Math.max(0, Math.floor(Math.min(a[0], b[0]) - radius));
  const maximumX = Math.min(VIEW_WIDTH - 1, Math.ceil(Math.max(a[0], b[0]) + radius));
  const minimumY = Math.max(0, Math.floor(Math.min(a[1], b[1]) - radius));
  const maximumY = Math.min(VIEW_HEIGHT - 1, Math.ceil(Math.max(a[1], b[1]) + radius));
  const radiusSquared = radius * radius;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = Math.max(EPSILON, dx * dx + dy * dy);
  for (let y = minimumY; y <= maximumY; y++) {
    for (let x = minimumX; x <= maximumX; x++) {
      const pixelIndex = y * VIEW_WIDTH + x;
      const regionIndex = regionByPixel[pixelIndex];
      if (regionIndex !== colorAIndex && regionIndex !== colorBIndex) continue;
      const px = x + 0.5;
      const py = y + 0.5;
      const ratio = clamp(((px - a[0]) * dx + (py - a[1]) * dy) / lengthSquared, 0, 1);
      const offsetX = px - (a[0] + dx * ratio);
      const offsetY = py - (a[1] + dy * ratio);
      const distanceSquared = offsetX * offsetX + offsetY * offsetY;
      if (distanceSquared > radiusSquared || distanceSquared >= pathDistanceSquared[pixelIndex]) continue;
      pathDistanceSquared[pixelIndex] = distanceSquared;
    }
  }
}

function drawBoundaryInk(context, fixture) {
  context.save();
  context.strokeStyle = "rgba(78, 72, 66, 0.34)";
  context.lineWidth = 0.8;
  context.lineJoin = "round";
  context.lineCap = "round";
  for (const path of fixture.paths) strokePath(context, path.points);
  context.restore();
}

function drawJunctions(context, fixture) {
  context.save();
  context.fillStyle = "rgba(255,255,255,0.92)";
  context.strokeStyle = "rgba(57,76,83,0.72)";
  context.lineWidth = 1;
  for (const item of fixture.junctions.filter(candidate => candidate.pathIds.length >= 3)) {
    context.beginPath();
    context.arc(item.point[0], item.point[1], 3.3, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }
  context.restore();
}

function analyzeCandidatePath(path, candidateId, options) {
  const center = candidateId === "continuous-ribbon" ? chaikin(path.points, options.smoothness, 0.2) : chaikin(path.points, 1, 0.18);
  const offsets = candidateId === "nine-track" ? FEATHER_PROFILE.map(sample => sample.offset) : [-1, 1];
  const tracks = candidateId === "continuous-ribbon"
    ? offsets.map(offset => offsetPath(center, path.sidePointA, options.width * 0.5 * offset))
    : offsets.map(offset => chaikin(offsetPath(path.points, path.sidePointA, options.width * 0.5 * offset), 1, 0.18));
  const triangles = [];
  for (let trackIndex = 0; trackIndex < tracks.length - 1; trackIndex++) {
    for (let pointIndex = 0; pointIndex < tracks[trackIndex].length - 1; pointIndex++) {
      const a0 = tracks[trackIndex][pointIndex];
      const a1 = tracks[trackIndex][pointIndex + 1];
      const b0 = tracks[trackIndex + 1][pointIndex];
      const b1 = tracks[trackIndex + 1][pointIndex + 1];
      triangles.push(signedArea(a0, b0, b1), signedArea(a0, b1, a1));
    }
  }
  const nonzero = triangles.filter(area => Math.abs(area) > 0.01);
  const dominant = Math.sign(nonzero.reduce((total, value) => total + Math.sign(value), 0)) || Math.sign(nonzero[0] || 1);
  let widthVariation = 0;
  const firstRail = tracks[0];
  const lastRail = tracks.at(-1);
  for (let index = 0; index < Math.min(firstRail.length, lastRail.length); index++) {
    widthVariation = Math.max(widthVariation, Math.abs(distance(firstRail[index], lastRail[index]) / options.width - 1));
  }
  return {
    invertedTriangles: nonzero.filter(area => Math.sign(area) !== dominant).length,
    degenerateTriangles: triangles.filter(area => Math.abs(area) <= 0.01).length,
    widthVariation,
    finite: tracks.flat().flat().every(Number.isFinite)
  };
}

function fillTrackSet(context, tracks) {
  for (let trackIndex = 0; trackIndex < tracks.length - 1; trackIndex++) {
    const first = tracks[trackIndex];
    const second = tracks[trackIndex + 1];
    const segments = Math.min(first.points.length, second.points.length) - 1;
    for (let index = 0; index < segments; index++) fillGradientQuad(context, first, second, index);
  }
}

function fillGradientQuad(context, first, second, index) {
  const a0 = first.points[index];
  const a1 = first.points[index + 1];
  const b0 = second.points[index];
  const b1 = second.points[index + 1];
  const from = midpoint(a0, a1);
  const to = midpoint(b0, b1);
  const gradient = context.createLinearGradient(from[0], from[1], to[0], to[1]);
  gradient.addColorStop(0, rgba(first.color, first.alpha));
  gradient.addColorStop(1, rgba(second.color, second.alpha));
  context.fillStyle = gradient;
  context.beginPath();
  context.moveTo(a0[0], a0[1]);
  context.lineTo(b0[0], b0[1]);
  context.lineTo(b1[0], b1[1]);
  context.lineTo(a1[0], a1[1]);
  context.closePath();
  context.fill();
}

function offsetPath(points, sidePointA, distanceValue) {
  const normals = vertexNormals(points, sidePointA);
  return points.map((point, index) => [point[0] + normals[index][0] * distanceValue, point[1] + normals[index][1] * distanceValue]);
}

function vertexNormals(points, sidePointA) {
  const segmentNormals = [];
  for (let index = 0; index < points.length - 1; index++) {
    const dx = points[index + 1][0] - points[index][0];
    const dy = points[index + 1][1] - points[index][1];
    const length = Math.max(EPSILON, Math.hypot(dx, dy));
    let normal = [-dy / length, dx / length];
    if (!segmentNormals.length) {
      const mid = midpoint(points[index], points[index + 1]);
      if (dot(normal, [sidePointA[0] - mid[0], sidePointA[1] - mid[1]]) < 0) normal = [-normal[0], -normal[1]];
    } else if (dot(normal, segmentNormals.at(-1)) < 0) {
      normal = [-normal[0], -normal[1]];
    }
    segmentNormals.push(normal);
  }
  return points.map((point, index) => {
    const before = segmentNormals[Math.max(0, index - 1)];
    const after = segmentNormals[Math.min(segmentNormals.length - 1, index)];
    const length = Math.max(EPSILON, Math.hypot(before[0] + after[0], before[1] + after[1]));
    return [(before[0] + after[0]) / length, (before[1] + after[1]) / length];
  });
}

function chaikin(points, iterations, factor) {
  let result = points.map(point => [...point]);
  for (let pass = 0; pass < iterations && result.length >= 3; pass++) {
    const next = [result[0]];
    for (let index = 0; index < result.length - 1; index++) {
      next.push(interpolate(result[index], result[index + 1], factor));
      next.push(interpolate(result[index], result[index + 1], 1 - factor));
    }
    next.push(result.at(-1));
    result = next;
  }
  return result;
}

function adaptTopologyFixture(sourceId, name) {
  const source = FIXTURE_BY_ID.get(sourceId);
  if (!source) throw new Error(`缺少国界夹具来源：${sourceId}`);
  const sourceRegions = source.regions.map((region, index) => {
    const group = region.state || region.id;
    const points = composeRawRing(region.rings[0], source);
    return {...region, group, points, index};
  });
  const groupOrder = [...new Set(sourceRegions.map(region => region.group))];
  const palette = [COLORS.west, COLORS.east, COLORS.south, "#baa7d9"];
  const groupColors = new Map(groupOrder.map((group, index) => [group, palette[index % palette.length]]));
  const transform = point => {
    const scale = VIEW_HEIGHT / 220;
    const offsetX = (VIEW_WIDTH - 320 * scale) * 0.5;
    return [offsetX + point[0] * scale, point[1] * scale];
  };
  const regions = sourceRegions.map(region => Object.freeze({
    id: region.id,
    color: groupColors.get(region.group),
    points: freezePoints(region.points.map(transform))
  }));
  const stateArcs = source.arcs.filter(arcItem => arcItem.kind === "state");
  const paths = stateArcs.map(arcItem => {
    const adjacent = sourceRegions.filter(region => region.rings.flat().some(arcRef => arcRef.arcId === arcItem.id));
    if (adjacent.length !== 2) throw new Error(`${sourceId}/${arcItem.id} 必须恰有两个行政侧`);
    return boundary(
      arcItem.id,
      freezePoints(arcItem.points.map(transform)),
      groupColors.get(adjacent[0].group),
      groupColors.get(adjacent[1].group),
      transform(polygonCentroid(adjacent[0].points))
    );
  });
  if (!paths.length) throw new Error(`${sourceId} 不含可用于颜色过渡的 state arc`);
  const endpointGroups = new Map();
  for (const path of paths) {
    for (const point of [path.points[0], path.points.at(-1)]) {
      const key = `${point[0].toFixed(6)},${point[1].toFixed(6)}`;
      const item = endpointGroups.get(key) || {point, pathIds: []};
      item.pathIds.push(path.id);
      endpointGroups.set(key, item);
    }
  }
  const junctions = [...endpointGroups.values()]
    .filter(item => item.pathIds.length >= 2)
    .map(item => Object.freeze({point: Object.freeze([...item.point]), pathIds: Object.freeze([...item.pathIds])}));
  return Object.freeze({
    id: source.id,
    name,
    description: source.description,
    paths: Object.freeze(paths),
    regions: Object.freeze(regions),
    junctions: Object.freeze(junctions)
  });
}

function resolveFixture(fixtureOrId) {
  if (typeof fixtureOrId === "string") return POLITICAL_BLEND_FIXTURE_BY_ID.get(fixtureOrId) || POLITICAL_BLEND_FIXTURE;
  return fixtureOrId?.paths?.length ? fixtureOrId : POLITICAL_BLEND_FIXTURE;
}

function polygonCentroid(points) {
  const unique = points.length > 1 && samePoint(points[0], points.at(-1)) ? points.slice(0, -1) : points;
  const total = unique.reduce((result, point) => [result[0] + point[0], result[1] + point[1]], [0, 0]);
  return [total[0] / unique.length, total[1] / unique.length];
}

function boundary(id, points, colorA, colorB, sidePointA) {
  return Object.freeze({id, points, colorA, colorB, sidePointA: Object.freeze(sidePointA)});
}

function fillPolygon(context, points, color) {
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);
  for (const point of points.slice(1)) context.lineTo(point[0], point[1]);
  context.closePath();
  context.fill();
}

function strokePath(context, points) {
  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);
  for (const point of points.slice(1)) context.lineTo(point[0], point[1]);
  context.stroke();
}

function makeCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = VIEW_WIDTH;
  canvas.height = VIEW_HEIGHT;
  return canvas;
}

function metricsMarkup(candidate) {
  const triangleValue = candidate.geometry === "raster-mask" ? "无网格" : String(candidate.invertedTriangles);
  const offsetValue = candidate.geometry === "raster-mask" ? "连续像素带" : `${(candidate.widthVariation * 100).toFixed(1)}%`;
  const junctionValue = candidate.junctionMode === "normalized-adjacent" ? "归一化邻边" : candidate.junctionMode === "round-union" ? "圆角联合" : "独立端帽";
  return `<div><dt>反向三角</dt><dd>${triangleValue}</dd></div><div><dt>宽度突变</dt><dd>${offsetValue}</dd></div><div><dt>三方交汇</dt><dd>${junctionValue}</dd></div>`;
}

function updateOutputs(outputs, options) {
  outputs.width.value = `${options.width.toFixed(0)} px`;
  outputs.strength.value = options.strength.toFixed(2);
  outputs.smoothness.value = `${options.smoothness.toFixed(0)} 轮`;
  outputs.decaySoftness.value = `${Math.round(options.decaySoftness * 100)}%`;
}

function normalizeOptions(input) {
  return {
    width: clamp(Number(input.width ?? POLITICAL_BLEND_OPTIONS.width), 8, 56),
    strength: clamp(Number(input.strength ?? POLITICAL_BLEND_OPTIONS.strength), 0, 1),
    smoothness: Math.round(clamp(Number(input.smoothness ?? POLITICAL_BLEND_OPTIONS.smoothness), 0, 3)),
    decaySoftness: clamp(Number(input.decaySoftness ?? POLITICAL_BLEND_OPTIONS.decaySoftness), 0, 1)
  };
}

export function resolveScreenHazeDecayMask(input = POLITICAL_BLEND_OPTIONS) {
  const options = normalizeOptions(input);
  const easedSoftness = options.decaySoftness * options.decaySoftness * (3 - 2 * options.decaySoftness);
  const targetHalfExtent = options.width * 0.85;
  const maximumBlur = Math.max(MIN_DECAY_BLUR_PX, options.width * MAX_DECAY_BLUR_RATIO);
  const blurPx = MIN_DECAY_BLUR_PX + (maximumBlur - MIN_DECAY_BLUR_PX) * easedSoftness;
  const colorBlurPx = options.width * (MIN_COLOR_BLUR_RATIO + (MAX_COLOR_BLUR_RATIO - MIN_COLOR_BLUR_RATIO) * easedSoftness);
  const coreWidthPx = Math.max(2, (targetHalfExtent - blurPx) * 2);
  const effectiveHalfExtentPx = coreWidthPx * 0.5 + blurPx;
  return Object.freeze({
    softness: options.decaySoftness,
    blurPx,
    colorBlurPx,
    coreWidthPx,
    effectiveHalfExtentPx,
    junctionCoreRadiusPx: coreWidthPx * 0.5,
    junctionEffectiveRadiusPx: effectiveHalfExtentPx
  });
}

export function resolveScreenHazeJunctionWeights(distances = [], colorBlurPx = 1) {
  const normalizedDistances = distances.map(distanceValue => Math.max(0, Number.isFinite(distanceValue) ? distanceValue : Number.POSITIVE_INFINITY));
  const influences = normalizedDistances.map(distanceValue => screenHazeInfluence(distanceValue, colorBlurPx));
  const rawWeights = influences.map(influence => influence ** JUNCTION_INFLUENCE_POWER);
  const totalWeight = rawWeights.reduce((total, weight) => total + weight, 0);
  const minimumDistance = normalizedDistances.reduce((minimum, distanceValue) => Math.min(minimum, distanceValue), Number.POSITIVE_INFINITY);
  return Object.freeze({
    weights: Object.freeze(rawWeights.map(weight => totalWeight > EPSILON ? weight / totalWeight : 0)),
    totalNeighborMix: 0.5 * screenHazeInfluence(minimumDistance, colorBlurPx)
  });
}

function freezePoints(points) {
  return Object.freeze(points.map(point => Object.freeze([...point])));
}

function signedArea(a, b, c) {
  return ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) * 0.5;
}

function interpolate(a, b, ratio) {
  return [a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio];
}

function midpoint(a, b) {
  return [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5];
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1];
}

function selfIntersections(points, closed = false) {
  const normalizedPoints = closed && points.length > 1 && samePoint(points[0], points.at(-1)) ? points.slice(0, -1) : points;
  const segments = [];
  for (let index = 0; index < normalizedPoints.length - 1; index++) segments.push([normalizedPoints[index], normalizedPoints[index + 1]]);
  if (closed) segments.push([normalizedPoints.at(-1), normalizedPoints[0]]);
  const intersections = [];
  for (let first = 0; first < segments.length; first++) {
    for (let second = first + 1; second < segments.length; second++) {
      if (second === first + 1 || (closed && first === 0 && second === segments.length - 1)) continue;
      if (segmentsIntersect(segments[first][0], segments[first][1], segments[second][0], segments[second][1])) intersections.push({segments: [first, second]});
    }
  }
  return intersections;
}

function segmentsShareOnlyJunction(first, second, point) {
  const firstTouches = first.some(endpoint => samePoint(endpoint, point));
  const secondTouches = second.some(endpoint => samePoint(endpoint, point));
  return firstTouches && secondTouches;
}

function segmentsIntersect(a, b, c, d) {
  const abC = signedArea(a, b, c);
  const abD = signedArea(a, b, d);
  const cdA = signedArea(c, d, a);
  const cdB = signedArea(c, d, b);
  if (((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON))
    && ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON))) return true;
  return (Math.abs(abC) <= EPSILON && pointOnSegment(c, a, b))
    || (Math.abs(abD) <= EPSILON && pointOnSegment(d, a, b))
    || (Math.abs(cdA) <= EPSILON && pointOnSegment(a, c, d))
    || (Math.abs(cdB) <= EPSILON && pointOnSegment(b, c, d));
}

function pointOnSegment(point, a, b) {
  return point[0] >= Math.min(a[0], b[0]) - EPSILON
    && point[0] <= Math.max(a[0], b[0]) + EPSILON
    && point[1] >= Math.min(a[1], b[1]) - EPSILON
    && point[1] <= Math.max(a[1], b[1]) + EPSILON;
}

function samePoint(a, b) {
  return Math.abs(a[0] - b[0]) <= EPSILON && Math.abs(a[1] - b[1]) <= EPSILON;
}

function rgba(hex, alpha) {
  const number = Number.parseInt(hex.replace("#", ""), 16);
  return `rgba(${number >> 16}, ${(number >> 8) & 255}, ${number & 255}, ${clamp(alpha, 0, 1).toFixed(4)})`;
}

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return Object.freeze([value >> 16, (value >> 8) & 255, value & 255]);
}

function mixHex(first, second, ratio) {
  const a = Number.parseInt(first.slice(1), 16);
  const b = Number.parseInt(second.slice(1), 16);
  const mix = shift => Math.round(((a >> shift) & 255) * (1 - ratio) + ((b >> shift) & 255) * ratio);
  return `#${[16, 8, 0].map(shift => mix(shift).toString(16).padStart(2, "0")).join("")}`;
}

function mixMany(colors) {
  const unique = [...new Set(colors)];
  if (!unique.length) return "#b8c8ca";
  const total = unique.reduce((result, color) => {
    const value = Number.parseInt(color.slice(1), 16);
    return [result[0] + (value >> 16), result[1] + ((value >> 8) & 255), result[2] + (value & 255)];
  }, [0, 0, 0]);
  return `#${total.map(value => Math.round(value / unique.length).toString(16).padStart(2, "0")).join("")}`;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

function smoothstep(minimum, maximum, value) {
  const ratio = clamp((value - minimum) / Math.max(EPSILON, maximum - minimum), 0, 1);
  return ratio * ratio * (3 - 2 * ratio);
}

function screenHazeInfluence(distanceValue, radius) {
  return 1 - smoothstep(0, Math.max(EPSILON, radius), distanceValue);
}

function sum(values, key) {
  return values.reduce((total, value) => total + value[key], 0);
}

if (typeof document !== "undefined") mountPoliticalBlendLab();
