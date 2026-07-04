import {normalizeMeasurementRouteFit} from "./measurement-route-fit.js";

export const MEASUREMENTS_VERSION = 1;

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

export function createMeasurementFromPoints(map, points, {name = "", routeFit = "none"} = {}) {
  const store = ensureMeasurementStore(map);
  const idNumber = Math.max(1, Number(store.metadata.nextId) || 1);
  const now = new Date().toISOString();
  const normalizedPoints = normalizeMeasurementPoints(points, map);
  const type = normalizedPoints.length >= 3 ? "polygon" : "polyline";
  return normalizeMeasurementItem({
    id: `measurement-${idNumber}`,
    type,
    name: normalizeMeasurementName(name) || `测量 ${idNumber}`,
    points,
    closed: type === "polygon",
    routeFit: normalizeMeasurementRouteFit(routeFit),
    createdAt: now,
    updatedAt: now
  }, map);
}

export function normalizeMeasurementItem(item, map) {
  const sourcePoints = Array.isArray(item?.points) ? item.points : [];
  const points = normalizeMeasurementPoints(sourcePoints, map);
  const type = item?.type === "polygon" || item?.closed ? "polygon" : "polyline";
  const routeFit = normalizeMeasurementRouteFit(item?.routeFit);
  const now = new Date().toISOString();
  const normalized = {
    id: String(item?.id || ""),
    type,
    name: normalizeMeasurementName(item?.name) || "未命名测量",
    points,
    closed: type === "polygon",
    routeFit,
    cellStops: routeFit === "roads" ? normalizeMeasurementCellStops(item?.cellStops, sourcePoints, points) : [],
    createdAt: item?.createdAt || now,
    updatedAt: item?.updatedAt || item?.createdAt || now
  };
  const distance = measurementDistance(points);
  const area = points.length >= 3 ? measurementArea(points) : 0;
  normalized.summary = {
    pointCount: points.length,
    routeStopCount: normalized.cellStops.filter(Boolean).length,
    distanceMapUnits: roundMeasurementValue(distance),
    areaMapUnits: roundMeasurementValue(area)
  };
  return normalized;
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

export function measurementDistance(points) {
  let total = 0;
  for (let index = 1; index < (points || []).length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    total += Math.hypot(current.x - previous.x, current.y - previous.y);
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

export function measurementBounds(item, padding = 48) {
  const points = item?.points || [];
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
