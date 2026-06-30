import {colorForCell, isLandCell} from "./color-modes.js";
import {
  interpolateWorldPoint,
  isWorldPoint,
  midpoint,
  normalizeWorldVector,
  pointsNear,
  polygonArea,
  segmentsIntersect,
  smoothWorldPath,
  worldDistance
} from "./geometry.js";
import {pushWorldLine, pushWorldPolylineMesh, pushWorldVertex} from "./mesh-writer.js";
import {pickGridCell} from "./picking.js";
import {createRandom} from "../generator/random.js";

export const SHORE_VISUAL_STYLE = Object.freeze({
  bandWidthWorld: 13,
  minBandWidthWorld: 1.2,
  bandWidthFitSteps: 6,
  maxRenderDisplacementWorld: 5,
  maxRenderSegmentWorld: 14,
  spikeAngleCos: 0.86,
  hardSpikeAngleCos: 0.94,
  spikeDisplacementWorld: 2.5,
  smoothing: Object.freeze({iterations: 2, factor: 0.22}),
  coastlineWidthWorld: 0.42,
  lakeShoreWidthWorld: 0.34,
  coastlineStroke: Object.freeze([0.88, 0.84, 0.63, 0.68]),
  lakeShoreStroke: Object.freeze([0.58, 0.78, 0.84, 0.64])
});

export function boundaryLineModeForOptions(viewOptions, cellVisualMesh) {
  return viewOptions?.smoothCellBorders !== false && cellVisualMesh?.edgeCurves
    ? "visual-cell-shore + butt-join-political"
    : "hard-cell-shore + butt-join-political";
}

export function pushShoreLineLayers(vertices, context, visibility = {}, cellVisualMesh = null, viewOptions = {}) {
  const smoothCellBorders = viewOptions.smoothCellBorders !== false && cellVisualMesh?.edgeCurves;
  if (visibility.coastline !== false) {
    if (smoothCellBorders) pushCellVisualShoreLines(vertices, context, cellVisualMesh, "ocean", SHORE_VISUAL_STYLE.coastlineStroke, SHORE_VISUAL_STYLE.coastlineWidthWorld);
    else pushHardShoreLines(vertices, context, "ocean", SHORE_VISUAL_STYLE.coastlineStroke, SHORE_VISUAL_STYLE.coastlineWidthWorld);
  }
  if (visibility.lakeShore !== false) {
    if (smoothCellBorders) pushCellVisualShoreLines(vertices, context, cellVisualMesh, "lake", SHORE_VISUAL_STYLE.lakeShoreStroke, SHORE_VISUAL_STYLE.lakeShoreWidthWorld);
    else pushHardShoreLines(vertices, context, "lake", SHORE_VISUAL_STYLE.lakeShoreStroke, SHORE_VISUAL_STYLE.lakeShoreWidthWorld);
  }
}

function pushCellVisualShoreLines(vertices, context, cellVisualMesh, targetType, color, widthWorld) {
  const {map} = context;
  const cells = map?.grid?.cells;
  if (!cells?.i || !cells?.c) return;
  for (const cell of cells.i || []) {
    for (const neighbor of cells.c[cell] || []) {
      if (neighbor <= cell) continue;
      const cellLand = isLandCell(cell, map);
      const neighborLand = isLandCell(neighbor, map);
      if (cellLand === neighborLand) continue;
      const waterCell = cellLand ? neighbor : cell;
      const waterFeature = map.features.features[cells.f?.[waterCell]];
      const isOcean = waterFeature?.type === "ocean";
      if ((targetType === "ocean" && !isOcean) || (targetType === "lake" && isOcean)) continue;
      pushWorldPolylineMesh(vertices, context, visualSharedCellEdge(map, cell, neighbor, cellVisualMesh), color, widthWorld, {joinMode: "round"});
    }
  }
}

function pushHardShoreLines(vertices, context, targetType, color, widthWorld) {
  const {map} = context;
  const cells = map?.grid?.cells;
  if (!cells?.i || !cells?.c) return;
  for (const cell of cells.i || []) {
    for (const neighbor of cells.c[cell] || []) {
      if (neighbor <= cell) continue;
      const cellLand = isLandCell(cell, map);
      const neighborLand = isLandCell(neighbor, map);
      if (cellLand === neighborLand) continue;
      const waterCell = cellLand ? neighbor : cell;
      const waterFeature = map.features.features[cells.f?.[waterCell]];
      const isOcean = waterFeature?.type === "ocean";
      if ((targetType === "ocean" && !isOcean) || (targetType === "lake" && isOcean)) continue;
      const edge = sharedVoronoiEdge(map, cell, neighbor);
      if (edge) pushWorldPolylineMesh(vertices, context, edge, color, widthWorld, {joinMode: "caps"});
    }
  }
}

function visualSharedCellEdge(map, cell, neighbor, cellVisualMesh) {
  const shared = sharedVoronoiEdgeVertexIds(map, cell, neighbor);
  if (!shared) return [];
  const first = Math.min(shared[0], shared[1]);
  const second = Math.max(shared[0], shared[1]);
  const curve = cellVisualMesh?.edgeCurves?.get(`${first}:${second}`);
  if (curve?.length) return shared[0] <= shared[1] ? curve : [...curve].reverse();
  return shared.map(vertex => map.grid.vertices.p[vertex]).filter(isWorldPoint);
}

export function sharedVoronoiEdge(map, cell, neighbor) {
  const shared = sharedVoronoiEdgeVertexIds(map, cell, neighbor);
  if (!shared) return null;
  return [map.grid.vertices.p[shared[0]], map.grid.vertices.p[shared[1]]];
}

export function sharedVoronoiEdgeVertexIds(map, cell, neighbor) {
  const ownVertices = map.grid.cells.v[cell] || [];
  const neighborVertices = new Set(map.grid.cells.v[neighbor] || []);
  const shared = ownVertices.filter(vertex => neighborVertices.has(vertex));
  if (shared.length < 2) return null;
  return [shared[0], shared[1]];
}

export function pushShoreVisualBands(vertices, context, colorMode, viewOptions, paths) {
  for (const path of paths.coastline) pushShoreVisualBand(vertices, path, context, colorMode, viewOptions);
  for (const path of paths.lakeShore) pushShoreVisualBand(vertices, path, context, colorMode, viewOptions);
}

function pushShoreVisualBand(vertices, path, context, colorMode, viewOptions) {
  const {map} = context;
  const visual = buildSmoothedShoreVisual(path, map, colorMode, viewOptions);
  if (!visual || visual.land.points.length < 2 || visual.water.points.length !== visual.land.points.length) return;

  for (let index = 0; index < visual.land.points.length - 1; index++) {
    if (visual.breakBefore?.[index + 1]) continue;
    const landA = visual.land.points[index];
    const landB = visual.land.points[index + 1];
    const waterA = visual.water.points[index];
    const waterB = visual.water.points[index + 1];
    const centerA = midpoint(landA, waterA);
    const centerB = midpoint(landB, waterB);
    if (!isShoreBandSegmentSafe(map, {centerA, centerB, landA, landB, waterA, waterB})) continue;
    const landColorA = visual.land.colors[index];
    const landColorB = visual.land.colors[index + 1];
    const waterColorA = visual.water.colors[index];
    const waterColorB = visual.water.colors[index + 1];
    pushWorldVertex(vertices, context, centerA, waterColorA);
    pushWorldVertex(vertices, context, waterA, waterColorA);
    pushWorldVertex(vertices, context, waterB, waterColorB);
    pushWorldVertex(vertices, context, centerA, waterColorA);
    pushWorldVertex(vertices, context, waterB, waterColorB);
    pushWorldVertex(vertices, context, centerB, waterColorB);
    pushWorldVertex(vertices, context, centerA, landColorA);
    pushWorldVertex(vertices, context, centerB, landColorB);
    pushWorldVertex(vertices, context, landB, landColorB);
    pushWorldVertex(vertices, context, centerA, landColorA);
    pushWorldVertex(vertices, context, landB, landColorB);
    pushWorldVertex(vertices, context, landA, landColorA);
  }
}

function isShoreBandSegmentSafe(map, segment) {
  const {centerA, centerB, landA, landB, waterA, waterB} = segment;
  const maxSegment = SHORE_VISUAL_STYLE.maxRenderSegmentWorld;
  if (worldDistance(centerA, centerB) > maxSegment) return false;
  if (worldDistance(landA, landB) > maxSegment || worldDistance(waterA, waterB) > maxSegment) return false;
  if (worldDistance(landA, waterB) > maxSegment * 1.6 || worldDistance(waterA, landB) > maxSegment * 1.6) return false;
  if (segmentsIntersect(landA, landB, waterA, waterB)) return false;

  const area = Math.abs(polygonArea([landA, landB, waterB, waterA]));
  const expectedArea = Math.max(1, worldDistance(centerA, centerB) * SHORE_VISUAL_STYLE.bandWidthWorld);
  if (area > expectedArea * 2.5) return false;

  return isShoreBandSideSamplingSafe(map, landA, landB, waterA, waterB);
}

function isShoreBandSideSamplingSafe(map, landA, landB, waterA, waterB) {
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    if (!isLandSample(map, interpolateWorldPoint(landA, landB, t))) return false;
    if (!isWaterSample(map, interpolateWorldPoint(waterA, waterB, t))) return false;
  }
  return true;
}

function isLandSample(map, point) {
  const cell = pickGridCell(map, point[0], point[1])?.gridCell;
  return cell !== null && cell !== undefined && isLandCell(cell, map);
}

function isWaterSample(map, point) {
  const cell = pickGridCell(map, point[0], point[1])?.gridCell;
  return cell !== null && cell !== undefined && !isLandCell(cell, map);
}

export function pushShoreVisualLines(vertices, paths, context, color) {
  const {map} = context;
  for (const path of paths) {
    const visual = buildSmoothedShoreVisual(path, map, "height", {});
    if (!visual || visual.land.points.length < 2 || visual.water.points.length !== visual.land.points.length) continue;
    for (let index = 0; index < visual.land.points.length - 1; index++) {
      if (visual.breakBefore?.[index + 1]) continue;
      pushWorldLine(vertices, context, [midpoint(visual.land.points[index], visual.water.points[index]), midpoint(visual.land.points[index + 1], visual.water.points[index + 1])], color);
    }
  }
}

export function pushOriginalShoreContourLines(vertices, paths, context, color, widthWorld) {
  for (const path of paths || []) {
    const points = clampedShoreRenderPoints(path).map(entry => entry.point);
    pushWorldPolylineMesh(vertices, context, points, color, widthWorld, {closed: pointsNear(points?.[0], points?.[points.length - 1]), maxSegmentWorld: SHORE_VISUAL_STYLE.maxRenderSegmentWorld});
  }
}

function buildSmoothedShoreVisual(path, map, colorMode, viewOptions) {
  if (!path.points?.length || path.points.length !== path.sideVectors?.length) return null;
  const preferredHalfWidth = SHORE_VISUAL_STYLE.bandWidthWorld / 2;
  const renderPoints = clampedShoreRenderPoints(path);
  const landPoints = [];
  const waterPoints = [];
  const landColors = [];
  const waterColors = [];
  const breakBefore = [];
  let previousAcceptedRenderIndex = -1;

  for (let renderIndex = 0; renderIndex < renderPoints.length; renderIndex++) {
    const entry = renderPoints[renderIndex];
    const point = entry.point;
    const sourceIndex = entry.sourceIndex;
    const side = entry.side || path.sideVectors[sourceIndex] || {x: 0, y: 0};
    const halfWidth = fitShoreHalfWidth(map, point, side, preferredHalfWidth);
    if (halfWidth <= 0) continue;
    landPoints.push([point[0] + side.x * halfWidth, point[1] + side.y * halfWidth]);
    waterPoints.push([point[0] - side.x * halfWidth, point[1] - side.y * halfWidth]);
    landColors.push(colorForCell(entry.landCell ?? path.landCells[sourceIndex], map, colorMode, viewOptions));
    waterColors.push(colorForCell(entry.waterCell ?? path.waterCells[sourceIndex], map, colorMode, viewOptions));
    breakBefore.push(previousAcceptedRenderIndex !== -1 && renderIndex !== previousAcceptedRenderIndex + 1);
    previousAcceptedRenderIndex = renderIndex;
  }

  return {
    land: {points: landPoints, colors: landColors},
    water: {points: waterPoints, colors: waterColors},
    breakBefore
  };
}

function fitShoreHalfWidth(map, point, side, preferredHalfWidth) {
  if (!isWorldPoint(point) || !side || (Math.abs(side.x) <= 0.000001 && Math.abs(side.y) <= 0.000001)) return 0;
  const minHalfWidth = SHORE_VISUAL_STYLE.minBandWidthWorld / 2;
  let halfWidth = preferredHalfWidth;
  for (let step = 0; step < SHORE_VISUAL_STYLE.bandWidthFitSteps; step++) {
    if (isShoreOffsetSafe(map, point, side, halfWidth)) return halfWidth;
    halfWidth *= 0.5;
    if (halfWidth < minHalfWidth) break;
  }
  return isShoreOffsetSafe(map, point, side, minHalfWidth) ? minHalfWidth : 0;
}

function isShoreOffsetSafe(map, point, side, halfWidth) {
  const landPoint = [point[0] + side.x * halfWidth, point[1] + side.y * halfWidth];
  const waterPoint = [point[0] - side.x * halfWidth, point[1] - side.y * halfWidth];
  return isLandSample(map, landPoint) && isWaterSample(map, waterPoint);
}

function clampedShoreRenderPoints(path) {
  const sourcePoints = path?.points || [];
  const renderPoints = path?.originalCoastlinePoints?.length ? path.originalCoastlinePoints : sourcePoints;
  const result = [];
  for (const point of renderPoints || []) {
    const projection = nearestPathProjection(point, sourcePoints);
    const clamped = clampShoreRenderPoint(point, projection.point);
    if (isWorldPoint(clamped)) {
      result.push({
        point: clamped,
        projected: projection.point,
        sourceIndex: projection.sourceIndex,
        side: interpolateShoreSide(path, projection.sourceIndex, projection.t),
        landCell: nearestPathCell(path.landCells, projection.sourceIndex, projection.t),
        waterCell: nearestPathCell(path.waterCells, projection.sourceIndex, projection.t)
      });
    }
  }
  return filterShoreRenderSpikes(result);
}

function clampShoreRenderPoint(point, sourcePoint) {
  if (!isWorldPoint(point) || !isWorldPoint(sourcePoint)) return point;
  const distance = worldDistance(point, sourcePoint);
  const maxDistance = SHORE_VISUAL_STYLE.maxRenderDisplacementWorld;
  if (distance <= maxDistance || distance <= 0.000001) return point;
  const ratio = maxDistance / distance;
  return [
    sourcePoint[0] + (point[0] - sourcePoint[0]) * ratio,
    sourcePoint[1] + (point[1] - sourcePoint[1]) * ratio
  ];
}

function nearestPathProjection(point, sourcePoints = []) {
  if (!isWorldPoint(point) || !sourcePoints.length) return {point, sourceIndex: 0, t: 0};
  if (sourcePoints.length === 1) return {point: sourcePoints[0], sourceIndex: 0, t: 0};
  const segmentCount = sourcePoints.length - 1;
  let best = {point: sourcePoints[0], sourceIndex: 0, t: 0, distance: Infinity};
  for (let index = 0; index < segmentCount; index++) {
    const a = sourcePoints[index];
    const b = sourcePoints[index + 1];
    if (!isWorldPoint(a) || !isWorldPoint(b)) continue;
    const projected = projectPointToSegment(point, a, b);
    if (projected.distance >= best.distance) continue;
    best = {point: projected.point, sourceIndex: index, t: projected.t, distance: projected.distance};
  }
  return best;
}

function projectPointToSegment(point, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return {point: a, t: 0, distance: (point[0] - a[0]) ** 2 + (point[1] - a[1]) ** 2};
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared));
  const projected = [a[0] + dx * t, a[1] + dy * t];
  return {
    point: projected,
    t,
    distance: (point[0] - projected[0]) ** 2 + (point[1] - projected[1]) ** 2
  };
}

function interpolateShoreSide(path, sourceIndex, t) {
  const a = path.sideVectors?.[sourceIndex] || {x: 0, y: 0};
  const b = path.sideVectors?.[Math.min(sourceIndex + 1, (path.sideVectors?.length || 1) - 1)] || a;
  return normalizeWorldVector(a.x * (1 - t) + b.x * t, a.y * (1 - t) + b.y * t);
}

function nearestPathCell(cells, sourceIndex, t) {
  if (!cells?.length) return 0;
  const nextIndex = Math.min(sourceIndex + 1, cells.length - 1);
  return t < 0.5 ? cells[sourceIndex] : cells[nextIndex];
}

function filterShoreRenderSpikes(entries) {
  if (entries.length < 3) return entries;
  let currentEntries = entries;
  for (let pass = 0; pass < 2; pass++) {
    const result = [];
    for (let index = 0; index < currentEntries.length; index++) {
      const previous = currentEntries[index - 1];
      const current = currentEntries[index];
      const next = currentEntries[index + 1];
      if (previous && next && isShoreRenderSpike(previous, current, next)) continue;
      result.push(current);
    }
    if (result.length === currentEntries.length) return result;
    currentEntries = result;
  }
  return currentEntries;
}

function isShoreRenderSpike(previous, current, next) {
  const a = normalizeWorldVector(previous.point[0] - current.point[0], previous.point[1] - current.point[1]);
  const b = normalizeWorldVector(next.point[0] - current.point[0], next.point[1] - current.point[1]);
  const angleCos = a.x * b.x + a.y * b.y;
  const displacement = current.projected ? worldDistance(current.point, current.projected) : 0;
  return angleCos > SHORE_VISUAL_STYLE.hardSpikeAngleCos ||
    (angleCos > SHORE_VISUAL_STYLE.spikeAngleCos && displacement > SHORE_VISUAL_STYLE.spikeDisplacementWorld);
}

export function buildShoreVisualPaths(map) {
  const edges = collectShoreVisualEdges(map);
  const paths = {
    coastline: buildShorePathsFromEdges(edges.coastline),
    lakeShore: buildShorePathsFromEdges(edges.lakeShore)
  };
  attachOriginalCoastlinePoints(paths.coastline, map, "coastline");
  attachOriginalCoastlinePoints(paths.lakeShore, map, "lake");
  return paths;
}

function attachOriginalCoastlinePoints(paths, map, featureType) {
  for (let index = 0; index < paths.length; index++) {
    paths[index].originalCoastlinePoints = buildOriginalCoastlineRenderPoints(paths[index].points, map, featureType, index);
  }
}

const ORIGINAL_COASTLINE_STYLE = Object.freeze({
  enabled: true,
  maxDepth: 4,
  baseAmplitude: 1.5,
  amplitudeDecay: 0.9,
  minEdge: 1,
  smoothThreshold: 0.25,
  roughnessContrast: 1.5,
  profileHarmonics: 4,
  lakeSmoothThreshMult: 2,
  simplifyTolerance: 0.3,
  smoothSamples: 4,
  jaggedSamples: 4
});

const COASTLINE_PROFILE_SIZE = 256;

function buildOriginalCoastlineRenderPoints(points, map, featureType, pathIndex) {
  const source = normalizeWorldPathPoints(points);
  if (source.length < 3 || !ORIGINAL_COASTLINE_STYLE.enabled) return source;
  const closed = pointsNear(source[0], source[source.length - 1]);
  const ring = closed ? source.slice(0, -1) : source;
  const simplified = simplifyWorldPath(ring, ORIGINAL_COASTLINE_STYLE.simplifyTolerance);
  if (simplified.length < 3) return source;
  const seed = `${map?.metadata?.seed || "map"}:coastline:${featureType}:${pathIndex}`;
  const random = createRandom(seed);
  const shape = fractalizeOriginalCoastline(simplified, map, featureType, random, closed);
  return buildOriginalCoastlineCurvePoints(shape, closed);
}

function normalizeWorldPathPoints(points) {
  const result = [];
  for (const point of points || []) {
    if (!isWorldPoint(point)) continue;
    const previous = result[result.length - 1];
    if (previous && pointsNear(previous, point)) continue;
    result.push([point[0], point[1]]);
  }
  if (result.length > 2 && pointsNear(result[0], result[result.length - 1])) result[result.length - 1] = result[0];
  return result;
}

function simplifyWorldPath(points, tolerance) {
  if (!points?.length || points.length <= 2 || tolerance <= 0) return points || [];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  simplifyWorldPathSection(points, 0, points.length - 1, tolerance * tolerance, keep);
  return points.filter((_, index) => keep[index]);
}

function simplifyWorldPathSection(points, first, last, toleranceSquared, keep) {
  if (last <= first + 1) return;
  let maxDistance = 0;
  let split = -1;
  for (let index = first + 1; index < last; index++) {
    const distance = pointSegmentDistanceSquared(points[index], points[first], points[last]);
    if (distance > maxDistance) {
      maxDistance = distance;
      split = index;
    }
  }
  if (maxDistance <= toleranceSquared || split === -1) return;
  keep[split] = 1;
  simplifyWorldPathSection(points, first, split, toleranceSquared, keep);
  simplifyWorldPathSection(points, split, last, toleranceSquared, keep);
}

function pointSegmentDistanceSquared(point, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return (point[0] - a[0]) ** 2 + (point[1] - a[1]) ** 2;
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared));
  const x = a[0] + dx * t;
  const y = a[1] + dy * t;
  return (point[0] - x) ** 2 + (point[1] - y) ** 2;
}

function fractalizeOriginalCoastline(points, map, featureType, random, closed) {
  const settings = featureType === "lake"
    ? {...ORIGINAL_COASTLINE_STYLE, smoothThreshold: Math.min(1, ORIGINAL_COASTLINE_STYLE.smoothThreshold * ORIGINAL_COASTLINE_STYLE.lakeSmoothThreshMult)}
    : ORIGINAL_COASTLINE_STYLE;
  const profile = makeCoastlineRoughnessProfile(() => random.next(), settings.roughnessContrast, settings.profileHarmonics);
  const segments = closed ? points.length : points.length - 1;
  let perimeter = 0;
  const lengths = new Array(segments);
  for (let index = 0; index < segments; index++) {
    lengths[index] = worldDistance(points[index], points[(index + 1) % points.length]);
    perimeter += lengths[index];
  }
  if (perimeter <= 0.000001) return {points, origIndices: points.map((_, index) => index)};

  let cumulative = 0;
  const tParams = new Array(points.length);
  for (let index = 0; index < points.length; index++) {
    tParams[index] = cumulative / perimeter;
    if (index < lengths.length) cumulative += lengths[index];
  }

  const result = [];
  const origIndices = [];
  for (let index = 0; index < points.length; index++) {
    origIndices.push(result.length);
    result.push(points[index]);
    if (!closed && index === points.length - 1) break;
    const nextIndex = (index + 1) % points.length;
    if (isOnMapBorderPoint(points[index], map) && isOnMapBorderPoint(points[nextIndex], map)) continue;
    subdivideOriginalCoastlineEdge(points[index], points[nextIndex], tParams[index], tParams[nextIndex] ?? 1, settings.maxDepth, settings.baseAmplitude, profile, () => random.next(), result, settings);
  }

  return {points: result, origIndices};
}

function makeCoastlineRoughnessProfile(rand, contrast, harmonics = 4) {
  const profile = new Float32Array(COASTLINE_PROFILE_SIZE);
  for (let harmonic = 1; harmonic <= harmonics; harmonic++) {
    const amplitude = rand();
    const phase = rand() * Math.PI * 2;
    for (let index = 0; index < COASTLINE_PROFILE_SIZE; index++) {
      profile[index] += amplitude * Math.cos((2 * Math.PI * harmonic * index) / COASTLINE_PROFILE_SIZE + phase);
    }
  }
  let min = Infinity;
  let max = -Infinity;
  for (const value of profile) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  const range = max - min || 1;
  for (let index = 0; index < COASTLINE_PROFILE_SIZE; index++) profile[index] = ((profile[index] - min) / range) ** contrast;
  return profile;
}

function sampleCoastlineProfile(profile, t) {
  const position = (((t % 1) + 1) % 1) * COASTLINE_PROFILE_SIZE;
  const index = Math.floor(position) % COASTLINE_PROFILE_SIZE;
  const f = position - Math.floor(position);
  return profile[index] * (1 - f) + profile[(index + 1) % COASTLINE_PROFILE_SIZE] * f;
}

function coastlineMidT(a, b) {
  const diff = b - a;
  if (Math.abs(diff) <= 0.5) return a + diff / 2;
  return ((a + (diff - Math.sign(diff)) / 2) % 1 + 1) % 1;
}

function subdivideOriginalCoastlineEdge(a, b, t0, t1, depth, amplitude, profile, rand, result, settings) {
  const length = worldDistance(a, b);
  if (depth === 0 || length < settings.minEdge) return;
  const tm = coastlineMidT(t0, t1);
  const roughness = sampleCoastlineProfile(profile, tm);
  if (roughness < settings.smoothThreshold) return;
  const normal = normalizeWorldVector(-(b[1] - a[1]), b[0] - a[0]);
  const displacement = (rand() - 0.5) * Math.sqrt(length) * amplitude * roughness;
  const middle = [(a[0] + b[0]) / 2 + normal.x * displacement, (a[1] + b[1]) / 2 + normal.y * displacement];
  const nextAmplitude = amplitude * settings.amplitudeDecay;
  subdivideOriginalCoastlineEdge(a, middle, t0, tm, depth - 1, nextAmplitude, profile, rand, result, settings);
  result.push(middle);
  subdivideOriginalCoastlineEdge(middle, b, tm, t1, depth - 1, nextAmplitude, profile, rand, result, settings);
}

function isOnMapBorderPoint(point, map) {
  const width = map?.metadata?.graphWidth || 0;
  const height = map?.metadata?.graphHeight || 0;
  return point[0] <= 0 || point[1] <= 0 || point[0] >= width || point[1] >= height;
}

function buildOriginalCoastlineCurvePoints(shape, closed) {
  if (!closed) return sampleCatmullRomWorldPath(shape.points, false, ORIGINAL_COASTLINE_STYLE.jaggedSamples);
  const {points, origIndices} = shape;
  const count = points.length;
  const originalCount = origIndices.length;
  if (count < 3 || originalCount < 3) return points;

  const smooth = new Array(originalCount);
  for (let index = 0; index < originalCount; index++) {
    const a = origIndices[index];
    const b = origIndices[(index + 1) % originalCount];
    smooth[index] = (b > a ? b - a : b + count - a) === 1;
  }

  const output = [];
  const first = points[origIndices[0]];
  const last = points[origIndices[originalCount - 1]];
  let atMid = smooth[originalCount - 1];
  output.push(atMid ? midpoint(last, first) : first);

  for (let index = 0; index < originalCount; index++) {
    const currentIndex = origIndices[index];
    const nextIndex = origIndices[(index + 1) % originalCount];
    const current = points[currentIndex];
    if (smooth[index]) {
      const next = points[nextIndex];
      const end = midpoint(current, next);
      if (atMid) appendQuadraticSamples(output, current, end, ORIGINAL_COASTLINE_STYLE.smoothSamples);
      else appendPointIfDistinct(output, end);
      atMid = true;
      continue;
    }

    if (atMid) appendPointIfDistinct(output, current);
    const end = nextIndex > currentIndex ? nextIndex : nextIndex + count;
    for (let sampleIndex = currentIndex; sampleIndex < end; sampleIndex++) {
      const a = points[sampleIndex % count];
      const b = points[(sampleIndex + 1) % count];
      const previous = points[(sampleIndex - 1 + count) % count];
      const next = points[(sampleIndex + 2) % count];
      const cp1 = [a[0] + (b[0] - previous[0]) / 8, a[1] + (b[1] - previous[1]) / 8];
      const cp2 = [b[0] - (next[0] - a[0]) / 8, b[1] - (next[1] - a[1]) / 8];
      appendCubicSamples(output, cp1, cp2, b, ORIGINAL_COASTLINE_STYLE.jaggedSamples);
    }
    atMid = false;
  }

  appendPointIfDistinct(output, output[0]);
  return output;
}

function sampleCatmullRomWorldPath(points, closed, samplesPerSegment) {
  if (points.length < 3) return points;
  const output = [points[0]];
  const end = closed ? points.length : points.length - 1;
  for (let index = 0; index < end; index++) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const previous = closed ? points[(index - 1 + points.length) % points.length] : points[index - 1] || a;
    const next = closed ? points[(index + 2) % points.length] : points[index + 2] || b;
    const cp1 = [a[0] + (b[0] - previous[0]) / 8, a[1] + (b[1] - previous[1]) / 8];
    const cp2 = [b[0] - (next[0] - a[0]) / 8, b[1] - (next[1] - a[1]) / 8];
    appendCubicSamples(output, cp1, cp2, b, samplesPerSegment);
  }
  return output;
}

function appendQuadraticSamples(output, control, end, samples) {
  const start = output[output.length - 1];
  for (let step = 1; step <= samples; step++) {
    const t = step / samples;
    const mt = 1 - t;
    appendPointIfDistinct(output, [
      mt * mt * start[0] + 2 * mt * t * control[0] + t * t * end[0],
      mt * mt * start[1] + 2 * mt * t * control[1] + t * t * end[1]
    ]);
  }
}

function appendCubicSamples(output, controlA, controlB, end, samples) {
  const start = output[output.length - 1];
  for (let step = 1; step <= samples; step++) {
    const t = step / samples;
    const mt = 1 - t;
    appendPointIfDistinct(output, [
      mt ** 3 * start[0] + 3 * mt * mt * t * controlA[0] + 3 * mt * t * t * controlB[0] + t ** 3 * end[0],
      mt ** 3 * start[1] + 3 * mt * mt * t * controlA[1] + 3 * mt * t * t * controlB[1] + t ** 3 * end[1]
    ]);
  }
}

function appendPointIfDistinct(points, point) {
  const previous = points[points.length - 1];
  if (!previous || !pointsNear(previous, point)) points.push(point);
}

export function emptyShoreVisualPaths() {
  return {coastline: [], lakeShore: []};
}

export function summarizeShoreVisualPaths(paths) {
  const coastlinePoints = countPathPoints(paths?.coastline);
  const lakeShorePoints = countPathPoints(paths?.lakeShore);
  return {
    coastlinePaths: paths?.coastline?.length || 0,
    lakeShorePaths: paths?.lakeShore?.length || 0,
    coastlinePoints,
    lakeShorePoints,
    bandWidthWorld: SHORE_VISUAL_STYLE.bandWidthWorld,
    smoothing: {...SHORE_VISUAL_STYLE.smoothing},
    coastlineStroke: [...SHORE_VISUAL_STYLE.coastlineStroke],
    lakeShoreStroke: [...SHORE_VISUAL_STYLE.lakeShoreStroke]
  };
}

function countPathPoints(paths = []) {
  return paths.reduce((sum, path) => sum + (path.points?.length || 0), 0);
}

export function buildSmoothedShoreBoundaryPoints(path, map) {
  if (!path?.points?.length || path.points.length !== path.sideVectors?.length) return [];
  const preferredHalfWidth = SHORE_VISUAL_STYLE.bandWidthWorld / 2;
  const renderPoints = clampedShoreRenderPoints(path);
  const points = [];

  for (const entry of renderPoints) {
    const point = entry.point;
    const sourceIndex = entry.sourceIndex;
    const side = entry.side || path.sideVectors[sourceIndex] || {x: 0, y: 0};
    const halfWidth = fitShoreHalfWidth(map, point, side, preferredHalfWidth);
    if (halfWidth <= 0) continue;
    points.push([point[0] + side.x * halfWidth, point[1] + side.y * halfWidth]);
  }

  return smoothWorldPath(points, SHORE_VISUAL_STYLE.smoothing);
}

function collectShoreVisualEdges(map) {
  const coastline = [];
  const lakeShore = [];
  const cells = map?.grid?.cells;
  if (!cells?.c || !cells?.v || !cells?.h) return {coastline, lakeShore};

  for (const cell of cells.i || []) {
    for (const neighbor of cells.c[cell] || []) {
      if (neighbor <= cell) continue;
      const cellLand = isLandCell(cell, map);
      const neighborLand = isLandCell(neighbor, map);
      if (cellLand === neighborLand) continue;
      const landCell = cellLand ? cell : neighbor;
      const waterCell = cellLand ? neighbor : cell;
      const edge = sharedVoronoiEdge(map, cell, neighbor);
      if (!edge) continue;
      const waterFeature = map.features.features[cells.f?.[waterCell]];
      const target = waterFeature?.type === "ocean" ? coastline : lakeShore;
      const landCenter = cellCenterPoint(map.grid, landCell);
      const waterCenter = cellCenterPoint(map.grid, waterCell);
      const side = normalizeWorldVector(landCenter[0] - waterCenter[0], landCenter[1] - waterCenter[1]);
      target.push({
        a: edge[0],
        b: edge[1],
        landCell,
        waterCell,
        side
      });
    }
  }

  return {coastline, lakeShore};
}

function buildShorePathsFromEdges(edges) {
  const graph = buildShoreGraph(edges);
  const paths = [];
  const visited = new Uint8Array(graph.edges.length);

  for (const node of graph.nodes.values()) {
    if (node.edges.length === 2) continue;
    for (const edgeIndex of node.edges) {
      if (visited[edgeIndex]) continue;
      paths.push(createShorePath(graph, walkShorePath(graph, node.key, edgeIndex, visited)));
    }
  }

  for (let edgeIndex = 0; edgeIndex < graph.edges.length; edgeIndex++) {
    if (visited[edgeIndex]) continue;
    paths.push(createShorePath(graph, walkShorePath(graph, graph.edges[edgeIndex].a, edgeIndex, visited)));
  }

  return paths.filter(path => path.points.length >= 2);
}

function buildShoreGraph(edges) {
  const nodes = new Map();
  const graphEdges = [];
  for (const edge of edges) {
    if (!isWorldPoint(edge.a) || !isWorldPoint(edge.b)) continue;
    const a = shorePointKey(edge.a);
    const b = shorePointKey(edge.b);
    if (a === b) continue;
    const edgeIndex = graphEdges.length;
    ensureShoreNode(nodes, a, edge.a).edges.push(edgeIndex);
    ensureShoreNode(nodes, b, edge.b).edges.push(edgeIndex);
    graphEdges.push({...edge, a, b});
  }
  return {nodes, edges: graphEdges};
}

function ensureShoreNode(nodes, key, point) {
  if (!nodes.has(key)) nodes.set(key, {key, point: [point[0], point[1]], edges: []});
  return nodes.get(key);
}

function shorePointKey(point) {
  return `${Math.round(point[0] * 1000)}:${Math.round(point[1] * 1000)}`;
}

function walkShorePath(graph, startKey, firstEdgeIndex, visited) {
  const keys = [startKey];
  const edgeIndexes = [];
  let currentKey = startKey;
  let edgeIndex = firstEdgeIndex;

  while (edgeIndex !== -1 && !visited[edgeIndex]) {
    visited[edgeIndex] = 1;
    edgeIndexes.push(edgeIndex);
    const edge = graph.edges[edgeIndex];
    const nextKey = edge.a === currentKey ? edge.b : edge.a;
    keys.push(nextKey);
    const nextNode = graph.nodes.get(nextKey);
    if (!nextNode || (nextNode.edges.length !== 2 && nextKey !== startKey)) break;
    currentKey = nextKey;
    edgeIndex = nextNode.edges.find(index => !visited[index]) ?? -1;
  }

  return {keys, edgeIndexes};
}

function createShorePath(graph, walk) {
  const points = [];
  const sideVectors = [];
  const landCells = [];
  const waterCells = [];

  for (let index = 0; index < walk.keys.length; index++) {
    const node = graph.nodes.get(walk.keys[index]);
    const adjacentEdges = [
      walk.edgeIndexes[index - 1],
      walk.edgeIndexes[index]
    ].filter(edgeIndex => edgeIndex !== undefined);
    const edge = graph.edges[adjacentEdges[0]] || graph.edges[walk.edgeIndexes[0]];
    points.push(node.point);
    sideVectors.push(averageEdgeSide(graph, adjacentEdges));
    landCells.push(edge?.landCell ?? 0);
    waterCells.push(edge?.waterCell ?? 0);
  }

  return {points, sideVectors, landCells, waterCells};
}

function averageEdgeSide(graph, edgeIndexes) {
  let x = 0;
  let y = 0;
  for (const edgeIndex of edgeIndexes) {
    const side = graph.edges[edgeIndex]?.side;
    if (!side) continue;
    x += side.x;
    y += side.y;
  }
  return normalizeWorldVector(x, y);
}

function cellCenterPoint(grid, cell) {
  return grid.points[grid.cells.p?.[cell]] || [0, 0];
}
