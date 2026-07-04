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

export function expandRouteMeasurementPoints(map, points = [], cellStops = []) {
  const sourcePoints = Array.isArray(points) ? points : [];
  if (sourcePoints.length < 2 || !Array.isArray(cellStops) || cellStops.length < 2) return sourcePoints;
  const routes = routeLookup(map);
  const expanded = [];

  for (let index = 0; index < sourcePoints.length; index += 1) {
    const current = sourcePoints[index];
    if (!isFinitePoint(current)) continue;
    if (!expanded.length) pushRoutePoint(expanded, current);
    if (index >= sourcePoints.length - 1) continue;

    const next = sourcePoints[index + 1];
    const currentStop = normalizeRouteStop(cellStops[index]);
    const nextStop = normalizeRouteStop(cellStops[index + 1]);
    const route = currentStop && nextStop && currentStop.routeId === nextStop.routeId ? routes.get(currentStop.routeId) : null;
    if (!route || !Array.isArray(route.points) || route.points.length < 2) {
      pushRoutePoint(expanded, next);
      continue;
    }

    appendRouteSegmentPoints(expanded, route.points, currentStop.segmentIndex, nextStop.segmentIndex);
    pushRoutePoint(expanded, next);
  }

  return expanded.length >= sourcePoints.length ? expanded : sourcePoints;
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

function routeLookup(map) {
  const routes = new Map();
  for (const route of map?.settlements?.routes || []) {
    if (!route || route.id === undefined || route.id === null) continue;
    routes.set(Number(route.id), route);
  }
  return routes;
}

function appendRouteSegmentPoints(target, routePoints, fromSegment, toSegment) {
  if (!Number.isInteger(fromSegment) || !Number.isInteger(toSegment)) return;
  const maxSegment = routePoints.length - 2;
  const from = Math.max(0, Math.min(maxSegment, fromSegment));
  const to = Math.max(0, Math.min(maxSegment, toSegment));
  if (to > from) {
    for (let index = from + 1; index <= to; index += 1) pushRoutePoint(target, normalizeRoutePoint(routePoints[index]));
    return;
  }
  if (to < from) {
    for (let index = from; index >= to + 1; index -= 1) pushRoutePoint(target, normalizeRoutePoint(routePoints[index]));
  }
}

function pushRoutePoint(points, point) {
  if (!isFinitePoint(point)) return;
  const next = {x: roundRoutePoint(point.x), y: roundRoutePoint(point.y)};
  const previous = points.at(-1);
  if (previous && pointsNear(previous, next)) return;
  points.push(next);
}

function normalizeRouteStop(stop) {
  if (!stop || typeof stop !== "object") return null;
  const routeId = Number(stop.routeId ?? stop.route);
  const segmentIndex = Number(stop.segmentIndex ?? stop.segment);
  if (!Number.isInteger(routeId) || !Number.isInteger(segmentIndex)) return null;
  return {routeId, segmentIndex};
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
