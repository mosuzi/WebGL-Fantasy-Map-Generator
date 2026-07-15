import {expandRouteMeasurementPoints, normalizeMeasurementRouteFit} from "./measurement-route-fit.js";
import {sampleMeasurementCurve} from "./measurement-geometry.js";

export const MEASUREMENTS_VERSION = 1;
export const MEASUREMENT_DRAW_RULER = "ruler";
export const MEASUREMENT_DRAW_CURVE = "curve";
export const MEASUREMENT_DRAW_ROUTE = "route";
export const MEASUREMENT_DRAW_AREA = "area";

export function ensureMeasurementStore(map) {
  if (!map.measurements || typeof map.measurements !== "object") {
    map.measurements = {
      version: MEASUREMENTS_VERSION,
      items: [],
      metadata: {measurements: 0, nextId: 1}
    };
  }
  if (!Array.isArray(map.measurements.items)) map.measurements.items = [];
  if (!map.measurements.metadata || typeof map.measurements.metadata !== "object") map.measurements.metadata = {};
  map.measurements.version = MEASUREMENTS_VERSION;
  map.measurements.items = map.measurements.items.map(item => normalizeMeasurementItem(item, map));
  refreshMeasurementsMetadata(map.measurements);
  return map.measurements;
}

export function refreshMeasurementsMetadata(store) {
  const items = Array.isArray(store?.items) ? store.items : [];
  const maxNumericId = items.reduce((max, item) => Math.max(max, measurementNumericId(item?.id)), 0);
  store.metadata = {
    ...(store?.metadata || {}),
    measurements: items.length,
    nextId: Math.max(Number(store?.metadata?.nextId) || 1, maxNumericId + 1)
  };
}

export function createMeasurementFromPoints(map, points, {name = "", routeFit = "none", drawMode, closed, smooth, sampling} = {}) {
  const store = ensureMeasurementStore(map);
  const idNumber = Math.max(1, Number(store.metadata.nextId) || 1);
  const now = new Date().toISOString();
  const measurementRouteFit = normalizeMeasurementRouteFit(routeFit);
  return normalizeMeasurementItem({
    id: `measurement-${idNumber}`,
    drawMode,
    name: normalizeMeasurementName(name) || `测量 ${idNumber}`,
    points,
    closed,
    smooth,
    sampling,
    routeFit: measurementRouteFit,
    createdAt: now,
    updatedAt: now
  }, map);
}

export function normalizeMeasurementItem(item, map) {
  const sourcePoints = Array.isArray(item?.points) ? item.points : [];
  const points = normalizeMeasurementPoints(sourcePoints, map);
  const routeFit = normalizeMeasurementRouteFit(item?.routeFit);
  const drawMode = normalizeMeasurementDrawMode(item?.drawMode, item, points, routeFit);
  const closed = normalizeMeasurementClosed(item, points, drawMode, routeFit);
  const smooth = normalizeMeasurementSmooth(item, drawMode, routeFit);
  const sampling = normalizeMeasurementSampling(item?.sampling, {drawMode, points});
  const type = measurementTypeForGeometry(points, {closed});
  const now = new Date().toISOString();
  const normalized = {
    id: String(item?.id || ""),
    type,
    name: normalizeMeasurementName(item?.name) || "未命名测量",
    points,
    drawMode,
    closed,
    smooth,
    sampling,
    routeFit,
    cellStops: routeFit === "roads" ? normalizeMeasurementCellStops(item?.cellStops, sourcePoints, points) : [],
    createdAt: item?.createdAt || now,
    updatedAt: item?.updatedAt || item?.createdAt || now
  };
  const displayPoints = measurementDisplayPoints(normalized, map);
  const distance = measurementDistance(displayPoints, {closed: normalized.closed});
  const area = normalized.closed && displayPoints.length >= 3 ? measurementArea(displayPoints) : 0;
  normalized.summary = {
    pointCount: points.length,
    displayPointCount: displayPoints.length,
    routeStopCount: normalized.cellStops.filter(Boolean).length,
    rawPointCount: normalized.sampling.rawPointCount,
    distanceMapUnits: roundMeasurementValue(distance),
    areaMapUnits: roundMeasurementValue(area)
  };
  return normalized;
}

export function normalizeMeasurementDrawMode(value, item = {}, points = [], routeFit = item?.routeFit) {
  if (normalizeMeasurementRouteFit(routeFit) === "roads") return MEASUREMENT_DRAW_ROUTE;
  const requested = String(value || "").trim().toLowerCase();
  if (requested === MEASUREMENT_DRAW_CURVE) return MEASUREMENT_DRAW_CURVE;
  if (requested === MEASUREMENT_DRAW_RULER) return MEASUREMENT_DRAW_RULER;
  if (requested === MEASUREMENT_DRAW_AREA) return points.length >= 3 ? MEASUREMENT_DRAW_AREA : MEASUREMENT_DRAW_RULER;
  if (requested === MEASUREMENT_DRAW_ROUTE) return MEASUREMENT_DRAW_RULER;
  if (item?.type === "curve") return MEASUREMENT_DRAW_CURVE;
  if (item?.type === "polygon" || item?.closed === true) return points.length >= 3 ? MEASUREMENT_DRAW_AREA : MEASUREMENT_DRAW_RULER;
  return MEASUREMENT_DRAW_RULER;
}

export function normalizeMeasurementSampling(value, {drawMode = MEASUREMENT_DRAW_RULER, points = []} = {}) {
  const source = value && typeof value === "object" ? value : {};
  const continuous = drawMode === MEASUREMENT_DRAW_CURVE;
  return {
    mode: continuous ? "continuous" : "click",
    minDistancePx: roundMeasurementValue(clampNumber(source.minDistancePx, 1, 32, 4)),
    simplifyTolerance: roundMeasurementValue(clampNumber(source.simplifyTolerance, 0, Infinity, 0)),
    rawPointCount: Math.max(points.length, Math.round(clampNumber(source.rawPointCount, 0, 1000000, points.length))),
    segmentsPerSpan: Math.round(clampNumber(source.segmentsPerSpan, 2, 24, 6))
  };
}

export function normalizeMeasurementClosed(item, points, drawMode, routeFit = item?.routeFit) {
  if (normalizeMeasurementRouteFit(routeFit) === "roads" || points.length < 3) return false;
  if (typeof item?.closed === "boolean") return item.closed;
  return drawMode === MEASUREMENT_DRAW_AREA;
}

export function normalizeMeasurementSmooth(item, drawMode, routeFit = item?.routeFit) {
  if (normalizeMeasurementRouteFit(routeFit) === "roads") return false;
  if (typeof item?.smooth === "boolean") return item.smooth;
  if (typeof item?.smoothClosed === "boolean") return item.smoothClosed;
  return drawMode === MEASUREMENT_DRAW_CURVE;
}

export function measurementDisplayPoints(item, map = null) {
  const points = normalizeMeasurementPoints(item?.points, map);
  const routeFit = normalizeMeasurementRouteFit(item?.routeFit);
  if (routeFit !== "roads") {
    const drawMode = normalizeMeasurementDrawMode(item?.drawMode, item, points, routeFit);
    const closed = normalizeMeasurementClosed(item, points, drawMode, routeFit);
    const smooth = normalizeMeasurementSmooth(item, drawMode, routeFit);
    const sampling = normalizeMeasurementSampling(item?.sampling, {drawMode, points});
    return smooth && points.length >= 3
      ? normalizeMeasurementPoints(sampleMeasurementCurve(points, {closed, segmentsPerSpan: sampling.segmentsPerSpan}), map)
      : points;
  }
  const cellStops = Array.isArray(item?.cellStops) ? item.cellStops : normalizeMeasurementCellStops([], item?.points, points);
  return expandRouteMeasurementPoints(map, points, cellStops);
}

export function normalizeMeasurementPoints(points, map = null) {
  const width = Number(map?.metadata?.graphWidth) || Number(map?.options?.graphWidth) || Infinity;
  const height = Number(map?.metadata?.graphHeight) || Number(map?.options?.graphHeight) || Infinity;
  return (Array.isArray(points) ? points : [])
    .map(point => {
      const source = Array.isArray(point) ? {x: point[0], y: point[1]} : point;
      const x = clampFinite(source?.x, 0, width);
      const y = clampFinite(source?.y, 0, height);
      return Number.isFinite(x) && Number.isFinite(y) ? {x: roundMeasurementValue(x), y: roundMeasurementValue(y)} : null;
    })
    .filter(Boolean);
}

export function normalizeMeasurementCellStops(cellStops = [], sourcePoints = [], normalizedPoints = []) {
  return normalizedPoints.map((point, index) => {
    const source = Array.isArray(cellStops) ? cellStops[index] : null;
    const pointStop = sourcePoints[index]?.cellStop || sourcePoints[index]?.routeStop || sourcePoints[index];
    return normalizeMeasurementCellStop(source || pointStop, point);
  });
}

export function measurementDistance(points, {closed = false} = {}) {
  let total = 0;
  for (let index = 1; index < (points || []).length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    total += Math.hypot(current.x - previous.x, current.y - previous.y);
  }
  if (closed && points?.length > 2) {
    const first = points[0];
    const last = points.at(-1);
    total += Math.hypot(first.x - last.x, first.y - last.y);
  }
  return total;
}

export function measurementArea(points) {
  let sum = 0;
  for (let index = 0; index < (points || []).length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
}

export function measurementBounds(item, padding = 48, map = null) {
  const points = measurementDisplayPoints(item, map);
  let bounds = null;
  for (const point of points) bounds = includePoint(bounds, point.x, point.y);
  return bounds ? {
    minX: bounds.minX - padding,
    minY: bounds.minY - padding,
    maxX: bounds.maxX + padding,
    maxY: bounds.maxY + padding
  } : null;
}

export function cloneMeasurementStore(store) {
  return store ? JSON.parse(JSON.stringify(store)) : null;
}

export function restoreMeasurementStore(map, snapshot) {
  map.measurements = snapshot ? cloneMeasurementStore(snapshot) : {
    version: MEASUREMENTS_VERSION,
    items: [],
    metadata: {measurements: 0, nextId: 1}
  };
  ensureMeasurementStore(map);
}

export function findMeasurement(map, measurementId) {
  return (map?.measurements?.items || []).find(item => item?.id === measurementId) || null;
}

function normalizeMeasurementName(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function normalizeMeasurementCellStop(value, point) {
  if (!value || typeof value !== "object") return null;
  const routeId = integerOrNull(value.routeId ?? value.route);
  const segmentIndex = integerOrNull(value.segmentIndex ?? value.segment);
  const packCell = integerOrNull(value.packCell ?? value.cell);
  if (routeId === null && segmentIndex === null && packCell === null) return null;
  return {
    routeId,
    routeType: typeof value.routeType === "string" && value.routeType.trim() ? value.routeType.trim() : "route",
    segmentIndex,
    packCell,
    x: roundMeasurementValue(Number(value.x ?? point?.x ?? 0)),
    y: roundMeasurementValue(Number(value.y ?? point?.y ?? 0))
  };
}

function integerOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function measurementNumericId(id) {
  const match = String(id || "").match(/(\d+)$/);
  return match ? Number(match[1]) || 0 : 0;
}

function measurementTypeForGeometry(points, {closed = false} = {}) {
  if (points.length === 1) return "point";
  return closed ? "polygon" : "polyline";
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function clampFinite(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return NaN;
  return Math.max(min, Math.min(max, number));
}

function roundMeasurementValue(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function includePoint(bounds, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return bounds;
  if (!bounds) return {minX: x, minY: y, maxX: x, maxY: y};
  bounds.minX = Math.min(bounds.minX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.maxY = Math.max(bounds.maxY, y);
  return bounds;
}
