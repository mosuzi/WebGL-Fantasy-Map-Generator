const CONTROL_POINT_ID_PATTERN = /^river-(\d+)-control-(\d+)$/;

export const RIVER_CONTROL_POINT_SCHEMA_VERSION = 1;

export function normalizeRiverControlPoints(river, packCells = null) {
  if (!Array.isArray(river?.controlPoints)) return undefined;
  const points = Array.isArray(river.points) ? river.points : [];
  const usedIds = new Set();
  const usedPointIndexes = new Set();
  let nextOrdinal = 1;
  const normalized = [];

  for (const raw of river.controlPoints) {
    const source = Array.isArray(raw) ? {point: raw} : raw;
    if (!source || typeof source !== "object") continue;
    const x = finite(source.x ?? source.point?.[0] ?? source[0]);
    const y = finite(source.y ?? source.point?.[1] ?? source[1]);
    if (x === null || y === null) continue;
    const pointIndex = resolvePointIndex(points, source.pointIndex, x, y, usedPointIndexes);
    if (pointIndex < 0) continue;
    const id = uniqueControlPointId(source.id, Number(river.id ?? river.i), usedIds, () => nextOrdinal++);
    usedIds.add(id);
    usedPointIndexes.add(pointIndex);
    const packCell = normalizePackCell(source.packCell, packCells, x, y);
    const flux = finite(source.flux ?? points[pointIndex]?.[2]);
    normalized.push({
      id,
      x,
      y,
      ...(flux === null ? {} : {flux}),
      ...(packCell < 0 ? {} : {packCell}),
      pointIndex,
      schemaVersion: RIVER_CONTROL_POINT_SCHEMA_VERSION
    });
  }

  return normalized;
}

export function createRiverControlPoint(river, pointIndex, point, packCells = null, id = null, derivedPackCell = undefined) {
  const x = finite(point?.[0]);
  const y = finite(point?.[1]);
  if (x === null || y === null || !Number.isInteger(pointIndex) || pointIndex < 0) return null;
  const controls = normalizeRiverControlPoints(river, packCells) || [];
  const usedIds = new Set(controls.map(control => control.id));
  const controlId = uniqueControlPointId(id, Number(river?.id ?? river?.i), usedIds, () => nextControlOrdinal(controls));
  const packCell = derivedPackCell === null
    ? -1
    : normalizeDerivedPackCell(derivedPackCell, packCells) ?? nearestPackCell(packCells, x, y);
  const flux = finite(point?.[2]);
  return {
    id: controlId,
    x,
    y,
    ...(flux === null ? {} : {flux}),
    ...(packCell < 0 ? {} : {packCell}),
    pointIndex,
    schemaVersion: RIVER_CONTROL_POINT_SCHEMA_VERSION
  };
}

export function cloneRiverControlPoints(controls) {
  return Array.isArray(controls) ? controls.map(control => ({...control})) : controls;
}

export function updateRiverControlPointIndexes(controls, removedPointIndex = null, insertedPointIndex = null) {
  return (controls || []).map(control => {
    let pointIndex = Number(control.pointIndex);
    if (Number.isInteger(insertedPointIndex) && pointIndex >= insertedPointIndex) pointIndex += 1;
    if (Number.isInteger(removedPointIndex)) {
      if (pointIndex === removedPointIndex) return null;
      if (pointIndex > removedPointIndex) pointIndex -= 1;
    }
    return {...control, pointIndex};
  }).filter(Boolean);
}

export function normalizeControlPointId(value, riverId, usedIds = new Set(), allocate = () => 1) {
  return uniqueControlPointId(value, riverId, usedIds, allocate);
}

export function findNearestRiverPackCell(packCells, x, y) {
  return nearestPackCell(packCells, x, y);
}

export function findRiverControlPointAtWorld(map, river, x, y, maxDistance = Infinity, controls = null) {
  const normalized = controls || normalizeRiverControlPoints(river, map?.pack?.cells) || [];
  let best = null;
  for (const control of normalized) {
    const distance = Math.hypot(Number(control.x) - Number(x), Number(control.y) - Number(y));
    if (!Number.isFinite(distance) || distance > maxDistance || (best && distance >= best.distance)) continue;
    best = {...control, distance};
  }
  return best;
}

function uniqueControlPointId(value, riverId, usedIds, allocate) {
  const candidate = typeof value === "string" && value.trim() ? value.trim() : "";
  if (candidate && !usedIds.has(candidate)) return candidate;
  let ordinal = Math.max(1, Number(allocate()) || 1);
  let next = `river-${Number.isInteger(riverId) ? riverId : 0}-control-${ordinal}`;
  while (usedIds.has(next)) {
    ordinal += 1;
    next = `river-${Number.isInteger(riverId) ? riverId : 0}-control-${ordinal}`;
  }
  return next;
}

function nextControlOrdinal(controls) {
  let next = 1;
  for (const control of controls || []) {
    const match = CONTROL_POINT_ID_PATTERN.exec(String(control?.id || ""));
    if (match) next = Math.max(next, Number(match[2]) + 1);
  }
  return next;
}

function resolvePointIndex(points, rawIndex, x, y, usedIndexes) {
  const index = Number(rawIndex);
  if (Number.isInteger(index) && index >= 0 && index < points.length && !usedIndexes.has(index)) {
    const point = points[index];
    if (Math.hypot(Number(point?.[0]) - x, Number(point?.[1]) - y) < 0.001) return index;
  }
  let best = -1;
  let bestDistance = Infinity;
  for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
    if (usedIndexes.has(pointIndex)) continue;
    const point = points[pointIndex];
    const distance = Math.hypot(Number(point?.[0]) - x, Number(point?.[1]) - y);
    if (!Number.isFinite(distance) || distance >= bestDistance) continue;
    best = pointIndex;
    bestDistance = distance;
  }
  return best;
}

function normalizePackCell(value, packCells, x, y) {
  if (value === null) return -1;
  const count = packCells?.p?.length || packCells?.i?.length || 0;
  const cell = Number(value);
  if (Number.isInteger(cell) && cell >= 0 && cell < count) return cell;
  return nearestPackCell(packCells, x, y);
}

function normalizeDerivedPackCell(value, packCells) {
  if (value === undefined) return null;
  const count = packCells?.p?.length || packCells?.i?.length || 0;
  const cell = Number(value);
  return Number.isInteger(cell) && cell >= 0 && cell < count ? cell : -1;
}

function nearestPackCell(packCells, x, y) {
  const points = packCells?.p || [];
  let nearest = -1;
  let minimum = Infinity;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const distance = (Number(point?.[0]) - x) ** 2 + (Number(point?.[1]) - y) ** 2;
    if (!Number.isFinite(distance) || distance >= minimum) continue;
    minimum = distance;
    nearest = index;
  }
  return nearest;
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
