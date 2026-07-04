const ROUTE_INDEX_CACHE = new WeakMap();

export const MEASUREMENT_ROUTE_FIT_NONE = "none";
export const MEASUREMENT_ROUTE_FIT_ROADS = "roads";

export function normalizeMeasurementRouteFit(value) {
  return value === MEASUREMENT_ROUTE_FIT_ROADS ? MEASUREMENT_ROUTE_FIT_ROADS : MEASUREMENT_ROUTE_FIT_NONE;
}

export function findNearestRouteMeasurementPoint(map, worldPoint, maxDistanceWorld) {
  if (!isFinitePoint(worldPoint) || !Number.isFinite(maxDistanceWorld) || maxDistanceWorld <= 0) return null;
  const index = getRouteMeasurementIndex(map);
  if (!index.segments.length) return null;

  let best = null;
  for (const segment of index.segments) {
    if (!segmentNearPoint(segment, worldPoint, maxDistanceWorld)) continue;
    const projected = projectPointToSegment(worldPoint, segment.a, segment.b);
    if (!projected || projected.distance > maxDistanceWorld || (best && projected.distance >= best.distance)) continue;
    const packCell = projected.t <= 0.5 ? segment.fromPackCell : segment.toPackCell;
    best = {
      point: {
        x: roundRoutePoint(projected.x),
        y: roundRoutePoint(projected.y)
      },
      distance: projected.distance,
      routeId: segment.routeId,
      routeType: segment.routeType,
      segmentIndex: segment.segmentIndex,
      packCell: Number.isInteger(packCell) ? packCell : null
    };
  }

  return best;
}

function getRouteMeasurementIndex(map) {
  if (!map || typeof map !== "object") return {segments: []};
  const cached = ROUTE_INDEX_CACHE.get(map);
  const signature = routeIndexSignature(map);
  if (cached?.signature === signature) return cached;

  const segments = [];
  for (const route of map.settlements?.routes || []) {
    const points = Array.isArray(route?.points) ? route.points : [];
    if (points.length < 2) continue;
    for (let index = 0; index < points.length - 1; index += 1) {
      const a = normalizeRoutePoint(points[index]);
      const b = normalizeRoutePoint(points[index + 1]);
      if (!a || !b || pointsNear(a, b)) continue;
      segments.push({
        routeId: route.id,
        routeType: route.type || "route",
        segmentIndex: index,
        fromPackCell: route.packCells?.[index],
        toPackCell: route.packCells?.[index + 1],
        a,
        b,
        minX: Math.min(a.x, b.x),
        maxX: Math.max(a.x, b.x),
        minY: Math.min(a.y, b.y),
        maxY: Math.max(a.y, b.y)
      });
    }
  }

  const next = {signature, segments};
  ROUTE_INDEX_CACHE.set(map, next);
  return next;
}

function routeIndexSignature(map) {
  const routes = map?.settlements?.routes || [];
  const routeSegments = Number(map?.settlements?.metadata?.routeSegments) || 0;
  return `${routes.length}:${routeSegments}:${routes.map(route => `${route?.id}:${route?.points?.length || 0}`).join("|")}`;
}

function segmentNearPoint(segment, point, padding) {
  return point.x >= segment.minX - padding
    && point.x <= segment.maxX + padding
    && point.y >= segment.minY - padding
    && point.y <= segment.maxY + padding;
}

function projectPointToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0) return null;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  const x = a.x + dx * t;
  const y = a.y + dy * t;
  return {x, y, t, distance: Math.hypot(point.x - x, point.y - y)};
}

function normalizeRoutePoint(point) {
  if (Array.isArray(point)) return isFinitePoint({x: point[0], y: point[1]}) ? {x: point[0], y: point[1]} : null;
  return isFinitePoint(point) ? {x: point.x, y: point.y} : null;
}

function isFinitePoint(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.y);
}

function pointsNear(a, b) {
  return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
}

function roundRoutePoint(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}
