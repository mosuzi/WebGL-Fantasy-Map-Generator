import {createRandom, stableHash} from "./random.js";

export const OCEAN_CURRENT_MODEL_VERSION = 1;
export const OCEAN_CURRENT_ALGORITHM = "surface-gyres-v2";

const WATER_LEVEL = 20;
const MAX_CURRENTS_PER_BASIN = 12;
const LARGE_BASIN_CELL_THRESHOLD = 1200;
const CURRENT_DENSITY_DIVISOR = 28;

export function createEmptyOceanCurrentModel({reason = "empty"} = {}) {
  return {
    version: OCEAN_CURRENT_MODEL_VERSION,
    algorithm: OCEAN_CURRENT_ALGORITHM,
    seed: "",
    currents: [],
    metadata: {
      generated: false,
      reason,
      count: 0,
      basins: 0,
      pathSegments: 0,
      controlPoints: 0,
      inputChecksum: ""
    }
  };
}

export function normalizeOceanCurrentModel(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return createEmptyOceanCurrentModel({reason: "legacy-backfill"});
  const sourceVersion = Number(source.version || OCEAN_CURRENT_MODEL_VERSION);
  if (!Number.isInteger(sourceVersion) || sourceVersion < 1 || sourceVersion > OCEAN_CURRENT_MODEL_VERSION) {
    throw new Error(`暂不支持的洋流模型版本：${source.version ?? "未知"}`);
  }
  const currents = (Array.isArray(source.currents) ? source.currents : [])
    .map(normalizeCurrent)
    .filter(Boolean);
  const generated = Boolean(source.metadata?.generated);
  return {
    version: OCEAN_CURRENT_MODEL_VERSION,
    algorithm: String(source.algorithm || OCEAN_CURRENT_ALGORITHM),
    seed: String(source.seed || ""),
    currents,
    metadata: {
      ...(source.metadata && typeof source.metadata === "object" ? source.metadata : {}),
      generated,
      reason: generated ? String(source.metadata?.reason || "generated") : String(source.metadata?.reason || "empty"),
      count: currents.length,
      basins: new Set(currents.map(current => current.basinFeatureId)).size,
      pathSegments: currents.reduce((sum, current) => sum + current.path.segments.length, 0),
      controlPoints: currents.reduce((sum, current) => sum + current.path.segments.length * 4, 0),
      inputChecksum: String(source.metadata?.inputChecksum || "")
    }
  };
}

export function buildOceanCurrents(map, {seed} = {}) {
  assertInputs(map);
  const resolvedSeed = String(seed ?? `${map.metadata?.seed || map.options?.seed || "map"}|ocean-currents`);
  const random = createRandom(resolvedSeed);
  const oceanBasins = collectOceanBasins(map);
  const oceanMask = createOceanMask(map, oceanBasins);
  const coastDistance = buildCoastDistance(map.grid.cells.c, oceanMask);
  const spatialIndex = createGridSpatialIndex(map.grid);
  const currents = [];

  for (const basin of oceanBasins) {
    currents.push(...buildBasinCurrents(map, basin, coastDistance, spatialIndex, random, resolvedSeed));
  }

  return {
    version: OCEAN_CURRENT_MODEL_VERSION,
    algorithm: OCEAN_CURRENT_ALGORITHM,
    seed: resolvedSeed,
    currents,
    metadata: {
      generated: true,
      reason: "generated",
      count: currents.length,
      basins: oceanBasins.length,
      pathSegments: currents.reduce((sum, current) => sum + current.path.segments.length, 0),
      controlPoints: currents.reduce((sum, current) => sum + current.path.segments.length * 4, 0),
      inputChecksum: oceanCurrentInputChecksum(map),
      maxStrength: round(currents.reduce((max, current) => Math.max(max, current.strength), 0), 3)
    }
  };
}

export function oceanCurrentInputChecksum(map) {
  let hash = 2166136261;
  const features = map.features?.features || map.grid?.features || [];
  for (let cell = 0; cell < map.grid.cells.h.length; cell++) {
    const feature = features[map.grid.cells.f[cell]];
    const ocean = feature?.type === "ocean" && map.grid.cells.h[cell] < WATER_LEVEL;
    hash ^= ocean ? map.grid.cells.h[cell] + 1 : 0;
    hash = Math.imul(hash, 16777619);
  }
  for (const value of [map.mapCoordinates?.latN, map.mapCoordinates?.latS, map.mapCoordinates?.latT, map.options?.graphWidth, map.options?.graphHeight]) {
    hash ^= hashText(String(value ?? ""));
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function sampleOceanCurrent(current, samplesPerSegment = 24) {
  const points = [];
  for (const segment of current?.path?.segments || []) {
    for (let step = 0; step <= samplesPerSegment; step++) {
      if (points.length && step === 0) continue;
      points.push(sampleCubicSegment(segment, step / samplesPerSegment));
    }
  }
  return points;
}

function buildBasinCurrents(map, basin, coastDistance, spatialIndex, random, seed) {
  if (basin.cells.length < 24) return [];
  const deepCells = basin.cells.filter(cell => coastDistance[cell] >= 3 && map.grid.cells.h[cell] <= 16);
  const candidates = deepCells.length >= 8 ? deepCells : basin.cells;
  const bounds = cellBounds(map.grid, basin.cells);
  const center = basinCentroid(map.grid, basin.cells);
  const basinSet = new Set(basin.cells);
  const baseCount = basin.cells.length >= LARGE_BASIN_CELL_THRESHOLD ? 3 : 2;
  const targetCount = clamp(Math.round(Math.sqrt(basin.cells.length) / CURRENT_DENSITY_DIVISOR) + baseCount, 2, MAX_CURRENTS_PER_BASIN);
  const starts = chooseSeparatedStarts(map.grid, candidates, center, bounds, targetCount, random, seed, basin.featureId);
  const currents = [];

  for (let index = 0; index < starts.length; index++) {
    const start = starts[index];
    const latitude = latitudeAtPoint(map, pointForCell(map.grid, start));
    const hemisphere = hemisphereForLatitude(latitude);
    const circulation = hemisphere === "south" ? "counterclockwise" : "clockwise";
    const pathCells = traceCurrentCells(map, basinSet, start, center, coastDistance, circulation, seed, index);
    const segment = fitSafeCubic(map, basin.featureId, pathCells, spatialIndex);
    if (!segment) continue;
    const startPoint = segment.start;
    const endPoint = segment.end;
    const endLatitude = latitudeAtPoint(map, endPoint);
    const temperature = currentTemperature(latitude, endLatitude);
    const westernBoundary = startPoint[0] <= bounds.minX + bounds.width * 0.32 && coastDistance[start] <= 9;
    const strength = round(clamp((westernBoundary ? 0.72 : 0.34) + random.next() * (westernBoundary ? 0.25 : 0.34), 0.2, 1), 3);
    const id = `current-${basin.featureId}-${basin.componentIndex}-${index + 1}`;
    currents.push({
      id,
      name: currentName({hemisphere, temperature, westernBoundary, index}),
      basinFeatureId: basin.featureId,
      hemisphere,
      circulation,
      temperature,
      strength,
      westernBoundary,
      path: {kind: "cubic", segments: [segment]},
      metadata: {
        seed: stableHash(`${seed}|${id}`),
        startLatitude: round(latitude, 2),
        endLatitude: round(endLatitude, 2),
        sourceDepth: Number(map.grid.cells.h[start])
      }
    });
  }
  return currents;
}

function collectOceanBasins(map) {
  const features = map.features?.features || map.grid?.features || [];
  const oceanMask = new Uint8Array(map.grid.cells.h.length);
  for (let cell = 0; cell < map.grid.cells.h.length; cell++) {
    const featureId = Number(map.grid.cells.f[cell]);
    if (map.grid.cells.h[cell] >= WATER_LEVEL || features[featureId]?.type !== "ocean") continue;
    oceanMask[cell] = 1;
  }
  const visited = new Uint8Array(oceanMask.length);
  const componentCounts = new Map();
  const basins = [];
  for (let start = 0; start < oceanMask.length; start++) {
    if (!oceanMask[start] || visited[start]) continue;
    const featureId = Number(map.grid.cells.f[start]);
    const cells = [];
    const queue = [start];
    visited[start] = 1;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const cell = queue[cursor];
      cells.push(cell);
      for (const neighbor of map.grid.cells.c[cell] || []) {
        if (visited[neighbor] || !oceanMask[neighbor] || Number(map.grid.cells.f[neighbor]) !== featureId) continue;
        visited[neighbor] = 1;
        queue.push(neighbor);
      }
    }
    const componentIndex = (componentCounts.get(featureId) || 0) + 1;
    componentCounts.set(featureId, componentIndex);
    basins.push({featureId, componentIndex, cells});
  }
  return basins.sort((a, b) => a.featureId - b.featureId || a.componentIndex - b.componentIndex);
}

function createOceanMask(map, basins) {
  const mask = new Uint8Array(map.grid.cells.h.length);
  for (const basin of basins) for (const cell of basin.cells) mask[cell] = 1;
  return mask;
}

function buildCoastDistance(neighbors, oceanMask) {
  const distance = new Uint16Array(oceanMask.length);
  const queue = new Uint32Array(oceanMask.length);
  let head = 0;
  let tail = 0;
  for (let cell = 0; cell < oceanMask.length; cell++) {
    if (!oceanMask[cell]) continue;
    if ((neighbors[cell] || []).every(neighbor => oceanMask[neighbor])) continue;
    distance[cell] = 1;
    queue[tail++] = cell;
  }
  while (head < tail) {
    const cell = queue[head++];
    for (const neighbor of neighbors[cell] || []) {
      if (!oceanMask[neighbor] || distance[neighbor]) continue;
      distance[neighbor] = distance[cell] + 1;
      queue[tail++] = neighbor;
    }
  }
  return distance;
}

function chooseSeparatedStarts(grid, candidates, center, bounds, count, random, seed, featureId) {
  const starts = [];
  const radiusX = Math.max(1, bounds.width * 0.38);
  const radiusY = Math.max(1, bounds.height * 0.38);
  for (let index = 0; index < count; index++) {
    const angle = (index / count) * Math.PI * 2 + (random.next() - 0.5) * 0.35;
    const target = [center[0] + Math.cos(angle) * radiusX, center[1] + Math.sin(angle) * radiusY];
    let best = null;
    let bestScore = Infinity;
    for (const cell of candidates) {
      if (starts.some(start => squaredDistance(pointForCell(grid, start), pointForCell(grid, cell)) < Math.max(bounds.width, bounds.height) ** 2 * 0.015)) continue;
      const point = pointForCell(grid, cell);
      const score = squaredDistance(point, target) * (0.92 + hashUnit(seed, featureId, cell + index * 997) * 0.16);
      if (score >= bestScore) continue;
      best = cell;
      bestScore = score;
    }
    if (best !== null) starts.push(best);
  }
  return starts;
}

function traceCurrentCells(map, basinSet, start, center, coastDistance, circulation, seed, currentIndex) {
  const {grid} = map;
  const path = [start];
  const visited = new Set(path);
  const maxSteps = clamp(Math.round(Math.sqrt(basinSet.size) * 0.8), 14, 56);
  let previousDirection = null;
  for (let step = 0; step < maxSteps; step++) {
    const cell = path.at(-1);
    const point = pointForCell(grid, cell);
    const latitude = latitudeAtPoint(map, point);
    const radial = normalizeVector([point[0] - center[0], point[1] - center[1]]);
    const tangent = circulation === "clockwise" ? [-radial[1], radial[0]] : [radial[1], -radial[0]];
    const wind = zonalWind(latitude);
    const desired = normalizeVector([tangent[0] * 0.78 + wind * 0.22, tangent[1] * 0.78]);
    let best = null;
    let bestScore = -Infinity;
    for (const neighbor of grid.cells.c[cell] || []) {
      if (!basinSet.has(neighbor) || visited.has(neighbor)) continue;
      const nextPoint = pointForCell(grid, neighbor);
      const direction = normalizeVector([nextPoint[0] - point[0], nextPoint[1] - point[1]]);
      const forward = dot(direction, desired);
      const continuity = previousDirection ? dot(direction, previousDirection) : 1;
      if (continuity < -0.25) continue;
      const shelfPenalty = coastDistance[neighbor] <= 1 ? 0.7 : coastDistance[neighbor] === 2 ? 0.22 : 0;
      const depthBonus = (19 - Number(grid.cells.h[neighbor])) / 120;
      const jitter = hashUnit(seed, neighbor, currentIndex * 97 + step) * 0.08;
      const score = forward + continuity * 0.2 + depthBonus + jitter - shelfPenalty;
      if (score <= bestScore) continue;
      best = neighbor;
      bestScore = score;
    }
    if (best === null || bestScore < -0.1) break;
    previousDirection = normalizeVector(subtract(pointForCell(grid, best), point));
    path.push(best);
    visited.add(best);
    if (path.length >= 14 && squaredDistance(pointForCell(grid, best), pointForCell(grid, start)) < averageCellSpacing(map) ** 2 * 5) break;
  }
  return path;
}

function fitSafeCubic(map, featureId, pathCells, spatialIndex) {
  if (pathCells.length < 2) return null;
  let endIndex = pathCells.length - 1;
  while (endIndex >= 1) {
    const segment = cubicFromPath(map.grid, pathCells.slice(0, endIndex + 1));
    if (directionIsContinuous(segment) && cubicStaysInBasin(map, featureId, segment, spatialIndex)) return segment;
    endIndex = Math.floor(endIndex * 0.75);
  }
  return null;
}

function cubicFromPath(grid, cells) {
  const start = pointForCell(grid, cells[0]);
  const end = pointForCell(grid, cells.at(-1));
  if (cells.length === 2) {
    return roundedSegment({start, control1: lerpPoint(start, end, 1 / 3), control2: lerpPoint(start, end, 2 / 3), end});
  }
  const control1 = pointForCell(grid, cells[Math.max(1, Math.floor((cells.length - 1) / 3))]);
  const control2 = pointForCell(grid, cells[Math.min(cells.length - 2, Math.ceil(((cells.length - 1) * 2) / 3))]);
  return roundedSegment({start, control1, control2, end});
}

function cubicStaysInBasin(map, featureId, segment, spatialIndex) {
  for (let step = 0; step <= 32; step++) {
    const point = sampleCubicSegment(segment, step / 32);
    const cell = nearestGridCell(spatialIndex, point);
    if (cell === null || Number(map.grid.cells.f[cell]) !== featureId || map.grid.cells.h[cell] >= WATER_LEVEL) return false;
  }
  return true;
}

function directionIsContinuous(segment) {
  const start = normalizeVector(subtract(segment.control1, segment.start));
  const end = normalizeVector(subtract(segment.end, segment.control2));
  return dot(start, end) > -0.35 && vectorLength(start) > 0 && vectorLength(end) > 0;
}

function createGridSpatialIndex(grid) {
  const bounds = pointBounds(grid.points);
  const bucketSize = Math.max(1e-6, Math.sqrt(Math.max(1e-6, bounds.width * bounds.height) / Math.max(1, grid.cells.h.length)) * 2.5);
  const buckets = new Map();
  for (let cell = 0; cell < grid.cells.h.length; cell++) {
    const point = pointForCell(grid, cell);
    const x = Math.floor((point[0] - bounds.minX) / bucketSize);
    const y = Math.floor((point[1] - bounds.minY) / bucketSize);
    const key = `${x}:${y}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(cell);
  }
  return {grid, bounds, bucketSize, buckets};
}

function nearestGridCell(index, point) {
  const bx = Math.floor((point[0] - index.bounds.minX) / index.bucketSize);
  const by = Math.floor((point[1] - index.bounds.minY) / index.bucketSize);
  let best = null;
  let bestDistance = Infinity;
  for (let ring = 0; ring <= 3; ring++) {
    for (let y = by - ring; y <= by + ring; y++) {
      for (let x = bx - ring; x <= bx + ring; x++) {
        if (ring && x !== bx - ring && x !== bx + ring && y !== by - ring && y !== by + ring) continue;
        for (const cell of index.buckets.get(`${x}:${y}`) || []) {
          const distance = squaredDistance(point, pointForCell(index.grid, cell));
          if (distance >= bestDistance) continue;
          best = cell;
          bestDistance = distance;
        }
      }
    }
    if (best !== null) return best;
  }
  return best;
}

function normalizeCurrent(source) {
  if (!source || typeof source !== "object") return null;
  const segments = (Array.isArray(source.path?.segments) ? source.path.segments : []).map(normalizeSegment).filter(Boolean);
  if (!segments.length) return null;
  const basinFeatureId = Number(source.basinFeatureId);
  if (!Number.isInteger(basinFeatureId) || basinFeatureId <= 0) return null;
  return {
    id: String(source.id || `current-${basinFeatureId}`),
    name: String(source.name || source.id || "未命名洋流").slice(0, 80),
    basinFeatureId,
    hemisphere: ["north", "south", "equatorial"].includes(source.hemisphere) ? source.hemisphere : "equatorial",
    circulation: source.circulation === "counterclockwise" ? "counterclockwise" : "clockwise",
    temperature: ["warm", "cold", "neutral"].includes(source.temperature) ? source.temperature : "neutral",
    strength: round(clamp(Number(source.strength) || 0.5, 0.05, 1), 3),
    westernBoundary: Boolean(source.westernBoundary),
    path: {kind: "cubic", segments},
    metadata: source.metadata && typeof source.metadata === "object" ? {...source.metadata} : {}
  };
}

function normalizeSegment(source) {
  if (!source || typeof source !== "object") return null;
  const points = [source.start, source.control1, source.control2, source.end].map(normalizePoint);
  if (points.some(point => !point)) return null;
  return {start: points[0], control1: points[1], control2: points[2], end: points[3]};
}

function normalizePoint(source) {
  if (!Array.isArray(source) || source.length < 2) return null;
  const x = Number(source[0]);
  const y = Number(source[1]);
  return Number.isFinite(x) && Number.isFinite(y) ? [round(x, 3), round(y, 3)] : null;
}

function currentName({hemisphere, temperature, westernBoundary, index}) {
  const prefix = hemisphere === "north" ? "北" : hemisphere === "south" ? "南" : "赤道";
  const thermal = temperature === "warm" ? "暖流" : temperature === "cold" ? "寒流" : "漂流";
  const role = westernBoundary ? "西岸" : index % 3 === 0 ? "环海" : index % 3 === 1 ? "信风" : "外洋";
  return `${prefix}${role}${thermal}`;
}

function currentTemperature(startLatitude, endLatitude) {
  const delta = Math.abs(endLatitude) - Math.abs(startLatitude);
  if (delta > 1.5) return "warm";
  if (delta < -1.5) return "cold";
  return "neutral";
}

function hemisphereForLatitude(latitude) {
  if (latitude > 4) return "north";
  if (latitude < -4) return "south";
  return "equatorial";
}

function zonalWind(latitude) {
  const absolute = Math.abs(latitude);
  if (absolute < 30) return -1;
  if (absolute < 60) return 1;
  return -0.7;
}

function latitudeAtPoint(map, point) {
  const graphHeight = Number(map.options?.graphHeight || map.metadata?.graphHeight || map.grid?.metadata?.height || 1);
  const latN = Number(map.mapCoordinates?.latN ?? 90);
  const latT = Number(map.mapCoordinates?.latT ?? 180);
  return latN - (point[1] / Math.max(1e-6, graphHeight)) * latT;
}

function basinCentroid(grid, cells) {
  const sum = cells.reduce((result, cell) => {
    const point = pointForCell(grid, cell);
    result[0] += point[0];
    result[1] += point[1];
    return result;
  }, [0, 0]);
  return [sum[0] / cells.length, sum[1] / cells.length];
}

function cellBounds(grid, cells) {
  return pointBounds(cells.map(cell => pointForCell(grid, cell)));
}

function pointBounds(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return {minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY};
}

function pointForCell(grid, cell) {
  return grid.points[grid.cells.p?.[cell] ?? cell] || grid.points[cell] || [cell, 0];
}

function sampleCubicSegment(segment, t) {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return [
    segment.start[0] * a + segment.control1[0] * b + segment.control2[0] * c + segment.end[0] * d,
    segment.start[1] * a + segment.control1[1] * b + segment.control2[1] * c + segment.end[1] * d
  ];
}

function roundedSegment(segment) {
  return Object.fromEntries(Object.entries(segment).map(([key, point]) => [key, [round(point[0], 3), round(point[1], 3)]]));
}

function averageCellSpacing(map) {
  const width = Number(map.options?.graphWidth || map.metadata?.graphWidth || map.grid.metadata?.graphWidth || map.grid.metadata?.width || 1);
  const height = Number(map.options?.graphHeight || map.metadata?.graphHeight || map.grid.metadata?.graphHeight || map.grid.metadata?.height || 1);
  return Math.sqrt(Math.max(1, width * height) / Math.max(1, map.grid.cells.h.length));
}

function normalizeVector(vector) {
  const length = vectorLength(vector);
  return length ? [vector[0] / length, vector[1] / length] : [0, 0];
}

function vectorLength(vector) {
  return Math.hypot(vector[0], vector[1]);
}

function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1]];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1];
}

function squaredDistance(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function lerpPoint(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function hashUnit(seed, a, b) {
  return Number.parseInt(stableHash(`${seed}|${a}|${b}`), 16) / 0xffffffff;
}

function hashText(value) {
  return Number.parseInt(stableHash(value), 16) >>> 0;
}

function round(value, digits = 0) {
  const scale = 10 ** digits;
  return Math.round(Number(value) * scale) / scale;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function assertInputs(map) {
  if (!map?.grid?.points?.length || !map.grid.cells?.h || !map.grid.cells?.f || !map.grid.cells?.c) throw new Error("地图缺少生成洋流所需的网格与 Feature 数据");
}
