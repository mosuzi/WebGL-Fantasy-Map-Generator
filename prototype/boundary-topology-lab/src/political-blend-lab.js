const VIEW_WIDTH = 760;
const VIEW_HEIGHT = 340;
const EPSILON = 1e-6;
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

export const POLITICAL_BLEND_OPTIONS = Object.freeze({width: 30, strength: 0.75, smoothness: 2});

const topBoundary = freezePoints([[370, 0], [350, 27], [409, 50], [325, 77], [419, 103], [330, 132], [380, 170]]);
const leftBoundary = freezePoints([[380, 170], [326, 184], [405, 208], [294, 234], [370, 261], [247, 289], [230, 340]]);
const rightBoundary = freezePoints([[380, 170], [438, 187], [367, 214], [492, 238], [414, 264], [540, 291], [560, 340]]);
const junction = Object.freeze([380, 170]);

export const POLITICAL_BLEND_FIXTURE = Object.freeze({
  id: "administrative-acute-junction",
  name: "行政锐角、凹角与三方交汇",
  paths: Object.freeze([
    boundary("top", topBoundary, "west", "east", [80, 90]),
    boundary("left", leftBoundary, "west", "south", [80, 270]),
    boundary("right", rightBoundary, "south", "east", [680, 265])
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
  ])
});

export const POLITICAL_BLEND_CANDIDATES = Object.freeze([
  Object.freeze({id: "nine-track", name: "第 370 项九轨", geometry: "offset-before-smooth"}),
  Object.freeze({id: "historical-band", name: "v0.5.67 历史单带", geometry: "two-rail-offset-before-smooth"}),
  Object.freeze({id: "continuous-ribbon", name: "连续中心线色带", geometry: "smooth-before-offset"}),
  Object.freeze({id: "screen-haze", name: "屏幕空间朦胧", geometry: "raster-mask"})
]);

export function evaluatePoliticalBlendCandidates(input = {}) {
  const options = normalizeOptions(input);
  return {
    fixtureId: POLITICAL_BLEND_FIXTURE.id,
    options,
    candidates: POLITICAL_BLEND_CANDIDATES.map(candidate => {
      if (candidate.id === "screen-haze") {
        return {...candidate, tracks: 0, invertedTriangles: 0, degenerateTriangles: 0, widthVariation: 0, junctionMode: "round-mask", finite: true};
      }
      const reports = POLITICAL_BLEND_FIXTURE.paths.map(path => analyzeCandidatePath(path, candidate.id, options));
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
  const controls = {
    width: root.getElementById("blend-width"),
    strength: root.getElementById("blend-strength"),
    smoothness: root.getElementById("blend-smoothness")
  };
  const outputs = {
    width: root.getElementById("blend-width-value"),
    strength: root.getElementById("blend-strength-value"),
    smoothness: root.getElementById("blend-smoothness-value")
  };
  let scheduled = false;
  const render = () => {
    scheduled = false;
    const report = evaluatePoliticalBlendCandidates(options);
    for (const candidate of report.candidates) {
      drawCandidate(root.getElementById(`blend-${candidate.id}`), candidate.id, report.options);
      root.getElementById(`blend-${candidate.id}-metrics`).innerHTML = metricsMarkup(candidate);
    }
    const current = report.candidates[0];
    const continuous = report.candidates[2];
    root.getElementById("blend-lab-note").textContent = `九轨基线：反向三角 ${current.invertedTriangles}、截面宽度突变 ${(current.widthVariation * 100).toFixed(1)}%；连续中心线：反向三角 ${continuous.invertedTriangles}、截面宽度突变 ${(continuous.widthVariation * 100).toFixed(1)}%。屏幕空间候选使用圆角联合蒙版，不生成偏移网格。`;
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
  updateOutputs(outputs, options);
  render();
  const api = Object.freeze({fixture: POLITICAL_BLEND_FIXTURE, candidates: POLITICAL_BLEND_CANDIDATES, evaluate: evaluatePoliticalBlendCandidates});
  window.boundaryPoliticalBlendLab = api;
  return api;
}

function drawCandidate(canvas, candidateId, options) {
  if (!canvas) return;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  drawBase(context);
  if (candidateId === "nine-track") drawNineTrack(context, options);
  if (candidateId === "historical-band") drawHistoricalBand(context, options);
  if (candidateId === "continuous-ribbon") drawContinuousRibbon(context, options);
  if (candidateId === "screen-haze") drawScreenHaze(context, options);
  drawBoundaryInk(context);
  drawJunction(context);
}

function drawBase(context) {
  context.fillStyle = "#dce5e8";
  context.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
  for (const region of POLITICAL_BLEND_FIXTURE.regions) fillPolygon(context, region.points, region.color);
}

function drawNineTrack(context, options) {
  for (const path of POLITICAL_BLEND_FIXTURE.paths) {
    const tracks = FEATHER_PROFILE.map(sample => ({
      points: chaikin(offsetPath(path.points, path.sidePointA, options.width * 0.5 * sample.offset), 1, 0.18),
      color: sample.offset < 0 ? COLORS[path.colorA] : sample.offset > 0 ? COLORS[path.colorB] : mixHex(COLORS[path.colorA], COLORS[path.colorB], 0.5),
      alpha: options.strength * sample.alpha
    }));
    fillTrackSet(context, tracks);
  }
}

function drawHistoricalBand(context, options) {
  for (const path of POLITICAL_BLEND_FIXTURE.paths) {
    fillTrackSet(context, [
      {points: chaikin(offsetPath(path.points, path.sidePointA, options.width * 0.5), 1, 0.18), color: COLORS[path.colorA], alpha: 0.25 * options.strength},
      {points: chaikin(offsetPath(path.points, path.sidePointA, -options.width * 0.5), 1, 0.18), color: COLORS[path.colorB], alpha: 0.25 * options.strength}
    ]);
  }
}

function drawContinuousRibbon(context, options) {
  for (const path of POLITICAL_BLEND_FIXTURE.paths) {
    const center = chaikin(path.points, options.smoothness, 0.2);
    fillTrackSet(context, [
      {points: offsetPath(center, path.sidePointA, -options.width * 0.5), color: COLORS[path.colorA], alpha: 0},
      {points: center, color: mixHex(COLORS[path.colorA], COLORS[path.colorB], 0.5), alpha: 0.34 * options.strength},
      {points: offsetPath(center, path.sidePointA, options.width * 0.5), color: COLORS[path.colorB], alpha: 0}
    ]);
  }
  const radius = options.width * 0.52;
  const mixed = mixHex(mixHex(COLORS.west, COLORS.east, 0.5), COLORS.south, 1 / 3);
  const gradient = context.createRadialGradient(junction[0], junction[1], 0, junction[0], junction[1], radius);
  gradient.addColorStop(0, rgba(mixed, 0.28 * options.strength));
  gradient.addColorStop(1, rgba(mixed, 0));
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(junction[0], junction[1], radius, 0, Math.PI * 2);
  context.fill();
}

function drawScreenHaze(context, options) {
  const source = makeCanvas();
  const sourceContext = source.getContext("2d");
  for (const region of POLITICAL_BLEND_FIXTURE.regions) fillPolygon(sourceContext, region.points, region.color);
  const haze = makeCanvas();
  const hazeContext = haze.getContext("2d");
  hazeContext.filter = `blur(${Math.max(2, options.width * 0.32).toFixed(1)}px)`;
  hazeContext.drawImage(source, 0, 0);
  hazeContext.filter = "none";
  const mask = makeCanvas();
  const maskContext = mask.getContext("2d");
  maskContext.strokeStyle = "#fff";
  maskContext.lineWidth = options.width * 1.7;
  maskContext.lineJoin = "round";
  maskContext.lineCap = "round";
  for (const path of POLITICAL_BLEND_FIXTURE.paths) strokePath(maskContext, chaikin(path.points, options.smoothness, 0.2));
  maskContext.fillStyle = "#fff";
  maskContext.beginPath();
  maskContext.arc(junction[0], junction[1], options.width, 0, Math.PI * 2);
  maskContext.fill();
  hazeContext.globalCompositeOperation = "destination-in";
  hazeContext.drawImage(mask, 0, 0);
  hazeContext.globalCompositeOperation = "source-over";
  context.save();
  context.globalAlpha = Math.min(0.92, options.strength * 0.88);
  context.drawImage(haze, 0, 0);
  context.restore();
}

function drawBoundaryInk(context) {
  context.save();
  context.strokeStyle = "rgba(99, 90, 83, 0.72)";
  context.lineWidth = 1.2;
  context.lineJoin = "round";
  context.lineCap = "round";
  for (const path of POLITICAL_BLEND_FIXTURE.paths) strokePath(context, path.points);
  context.restore();
}

function drawJunction(context) {
  context.save();
  context.fillStyle = "rgba(255,255,255,0.92)";
  context.strokeStyle = "rgba(57,76,83,0.72)";
  context.lineWidth = 1;
  context.beginPath();
  context.arc(junction[0], junction[1], 3.3, 0, Math.PI * 2);
  context.fill();
  context.stroke();
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
  const offsetValue = candidate.geometry === "raster-mask" ? "连续蒙版" : `${(candidate.widthVariation * 100).toFixed(1)}%`;
  const junctionValue = candidate.junctionMode === "round-mask" ? "圆角蒙版" : candidate.junctionMode === "round-union" ? "圆角联合" : "独立端帽";
  return `<div><dt>反向三角</dt><dd>${triangleValue}</dd></div><div><dt>宽度突变</dt><dd>${offsetValue}</dd></div><div><dt>三方交汇</dt><dd>${junctionValue}</dd></div>`;
}

function updateOutputs(outputs, options) {
  outputs.width.value = `${options.width.toFixed(0)} px`;
  outputs.strength.value = options.strength.toFixed(2);
  outputs.smoothness.value = `${options.smoothness.toFixed(0)} 轮`;
}

function normalizeOptions(input) {
  return {
    width: clamp(Number(input.width ?? POLITICAL_BLEND_OPTIONS.width), 8, 56),
    strength: clamp(Number(input.strength ?? POLITICAL_BLEND_OPTIONS.strength), 0, 1),
    smoothness: Math.round(clamp(Number(input.smoothness ?? POLITICAL_BLEND_OPTIONS.smoothness), 0, 3))
  };
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

function rgba(hex, alpha) {
  const number = Number.parseInt(hex.replace("#", ""), 16);
  return `rgba(${number >> 16}, ${(number >> 8) & 255}, ${number & 255}, ${clamp(alpha, 0, 1).toFixed(4)})`;
}

function mixHex(first, second, ratio) {
  const a = Number.parseInt(first.slice(1), 16);
  const b = Number.parseInt(second.slice(1), 16);
  const mix = shift => Math.round(((a >> shift) & 255) * (1 - ratio) + ((b >> shift) & 255) * ratio);
  return `#${[16, 8, 0].map(shift => mix(shift).toString(16).padStart(2, "0")).join("")}`;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

function sum(values, key) {
  return values.reduce((total, value) => total + value[key], 0);
}

if (typeof document !== "undefined") mountPoliticalBlendLab();
