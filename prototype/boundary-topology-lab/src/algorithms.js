const EPSILON = 1e-9;

export const ALGORITHMS = Object.freeze([
  {id: "raw", name: "原始折线"},
  {id: "douglas-peucker", name: "Douglas-Peucker"},
  {id: "visvalingam", name: "Visvalingam"},
  {id: "chaikin", name: "有限 Chaikin"},
  {id: "catmull-rom", name: "Catmull-Rom"},
  {id: "b-spline", name: "B-spline"},
  {id: "recommended", name: "推荐共享管线"}
]);

export const DEFAULT_OPTIONS = Object.freeze({
  threshold: 1,
  smoothness: 0.04,
  maxDisplacement: 7
});

export function transformArc(points, algorithmId, options = {}, closed = isClosed(points)) {
  const settings = {...DEFAULT_OPTIONS, ...options};
  const source = normalizePoints(points, closed);
  let transformed;

  switch (algorithmId) {
    case "raw": transformed = source.map(copyPoint); break;
    case "douglas-peucker": transformed = douglasPeucker(source, settings.threshold, closed); break;
    case "visvalingam": transformed = visvalingamWhyatt(source, settings.threshold, closed); break;
    case "chaikin": transformed = limitedChaikin(source, settings.smoothness, closed); break;
    case "catmull-rom": transformed = catmullRom(source, settings.smoothness, closed); break;
    case "b-spline": transformed = bSpline(source, settings.smoothness, closed); break;
    case "recommended": {
      const simplified = visvalingamWhyatt(source, settings.threshold, closed);
      transformed = limitedChaikin(simplified, Math.min(settings.smoothness, 0.25), closed);
      break;
    }
    default: throw new Error(`未知算法：${algorithmId}`);
  }

  transformed = limitDisplacement(transformed, source, settings.maxDisplacement);
  return lockArcEndpoints(transformed, source, closed);
}

export function douglasPeucker(points, tolerance, closed = isClosed(points)) {
  if (closed) return simplifyClosed(points, tolerance, simplifyOpenDouglas);
  return simplifyOpenDouglas(points, tolerance);
}

function simplifyOpenDouglas(points, tolerance) {
  if (points.length <= 2 || tolerance <= 0) return points.map(copyPoint);
  let maxDistance = -1;
  let split = -1;
  for (let index = 1; index < points.length - 1; index++) {
    const distance = pointSegmentDistance(points[index], points[0], points.at(-1));
    if (distance > maxDistance) {
      maxDistance = distance;
      split = index;
    }
  }
  if (maxDistance <= tolerance) return [copyPoint(points[0]), copyPoint(points.at(-1))];
  const left = simplifyOpenDouglas(points.slice(0, split + 1), tolerance);
  const right = simplifyOpenDouglas(points.slice(split), tolerance);
  return [...left.slice(0, -1), ...right];
}

export function visvalingamWhyatt(points, threshold, closed = isClosed(points)) {
  if (closed) return simplifyClosed(points, threshold, simplifyOpenVisvalingam);
  return simplifyOpenVisvalingam(points, threshold);
}

function simplifyOpenVisvalingam(points, threshold) {
  if (points.length <= 2 || threshold <= 0) return points.map(copyPoint);
  const result = points.map(copyPoint);
  const areaLimit = threshold * threshold;
  while (result.length > 2) {
    let minArea = Infinity;
    let minIndex = -1;
    for (let index = 1; index < result.length - 1; index++) {
      const area = triangleArea(result[index - 1], result[index], result[index + 1]);
      if (area < minArea) {
        minArea = area;
        minIndex = index;
      }
    }
    if (minArea >= areaLimit) break;
    result.splice(minIndex, 1);
  }
  return result;
}

function simplifyClosed(points, threshold, simplifyOpen) {
  const unique = stripClosure(points);
  if (unique.length <= 4) return closeRing(unique);
  const rotated = [...unique, unique[0]];
  const simplified = simplifyOpen(rotated, threshold);
  return simplified.length >= 4 ? closeRing(stripClosure(simplified)) : closeRing(rotated.slice(0, 3));
}

export function limitedChaikin(points, coefficient, closed = isClosed(points)) {
  const ratio = clamp(coefficient, 0, 0.25);
  if (ratio <= EPSILON || points.length < 3) return points.map(copyPoint);
  const unique = closed ? stripClosure(points) : points;
  const result = [];
  if (!closed) result.push(copyPoint(unique[0]));
  const edgeCount = closed ? unique.length : unique.length - 1;
  for (let index = 0; index < edgeCount; index++) {
    const a = unique[index];
    const b = unique[(index + 1) % unique.length];
    result.push(lerpPoint(a, b, ratio), lerpPoint(a, b, 1 - ratio));
  }
  if (!closed) result.push(copyPoint(unique.at(-1)));
  return closed ? closeRing(result) : result;
}

export function catmullRom(points, smoothness, closed = isClosed(points)) {
  const unique = closed ? stripClosure(points) : points;
  if (unique.length < 3) return points.map(copyPoint);
  const tension = clamp(smoothness * 2, 0, 0.9);
  const result = [];
  const segmentCount = closed ? unique.length : unique.length - 1;
  for (let segment = 0; segment < segmentCount; segment++) {
    const p0 = unique[closed ? (segment - 1 + unique.length) % unique.length : Math.max(0, segment - 1)];
    const p1 = unique[segment];
    const p2 = unique[(segment + 1) % unique.length];
    const p3 = unique[closed ? (segment + 2) % unique.length : Math.min(unique.length - 1, segment + 2)];
    const steps = 5;
    for (let step = 0; step < steps; step++) {
      if (segment > 0 && step === 0) continue;
      const t = step / steps;
      result.push(catmullPoint(p0, p1, p2, p3, t, tension));
    }
  }
  if (!closed) result.push(copyPoint(unique.at(-1)));
  return closed ? closeRing(result) : result;
}

function catmullPoint(p0, p1, p2, p3, t, tension) {
  const t2 = t * t;
  const t3 = t2 * t;
  const scale = 1 - tension;
  const m1 = [(p2[0] - p0[0]) * 0.5 * scale, (p2[1] - p0[1]) * 0.5 * scale];
  const m2 = [(p3[0] - p1[0]) * 0.5 * scale, (p3[1] - p1[1]) * 0.5 * scale];
  return [
    (2 * t3 - 3 * t2 + 1) * p1[0] + (t3 - 2 * t2 + t) * m1[0] + (-2 * t3 + 3 * t2) * p2[0] + (t3 - t2) * m2[0],
    (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1[1] + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2[1]
  ];
}

export function bSpline(points, smoothness, closed = isClosed(points)) {
  const unique = closed ? stripClosure(points) : points;
  if (unique.length < 3) return points.map(copyPoint);
  const blended = [];
  const segmentCount = closed ? unique.length : unique.length - 1;
  const weight = clamp(smoothness * 1.6, 0, 0.5);
  for (let segment = 0; segment < segmentCount; segment++) {
    const p0 = unique[closed ? (segment - 1 + unique.length) % unique.length : Math.max(0, segment - 1)];
    const p1 = unique[segment];
    const p2 = unique[(segment + 1) % unique.length];
    const p3 = unique[closed ? (segment + 2) % unique.length : Math.min(unique.length - 1, segment + 2)];
    for (let step = 0; step < 5; step++) {
      if (segment > 0 && step === 0) continue;
      const t = step / 5;
      const linear = lerpPoint(p1, p2, t);
      const cubic = uniformBSplinePoint(p0, p1, p2, p3, t);
      blended.push(lerpPoint(linear, cubic, weight));
    }
  }
  if (!closed) blended.push(copyPoint(unique.at(-1)));
  return closed ? closeRing(blended) : blended;
}

function uniformBSplinePoint(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const weights = [(-t3 + 3 * t2 - 3 * t + 1) / 6, (3 * t3 - 6 * t2 + 4) / 6, (-3 * t3 + 3 * t2 + 3 * t + 1) / 6, t3 / 6];
  return [
    p0[0] * weights[0] + p1[0] * weights[1] + p2[0] * weights[2] + p3[0] * weights[3],
    p0[1] * weights[0] + p1[1] * weights[1] + p2[1] * weights[2] + p3[1] * weights[3]
  ];
}

function limitDisplacement(points, source, maxDisplacement) {
  if (!Number.isFinite(maxDisplacement) || maxDisplacement < 0) return points.map(copyPoint);
  return points.map(candidate => {
    const closest = closestPointOnPolyline(candidate, source);
    const distance = pointDistance(candidate, closest);
    if (distance <= maxDisplacement + EPSILON) return copyPoint(candidate);
    return lerpPoint(closest, candidate, maxDisplacement / distance);
  });
}

function lockArcEndpoints(points, source, closed) {
  if (closed) {
    const ring = closeRing(stripClosure(points));
    ring[0] = copyPoint(source[0]);
    ring[ring.length - 1] = copyPoint(source[0]);
    return ring;
  }
  const result = points.map(copyPoint);
  result[0] = copyPoint(source[0]);
  result[result.length - 1] = copyPoint(source.at(-1));
  return result;
}

export function closestPointOnPolyline(pointValue, line) {
  let closest = copyPoint(line[0]);
  let minDistance = Infinity;
  for (let index = 0; index < line.length - 1; index++) {
    const candidate = closestPointOnSegment(pointValue, line[index], line[index + 1]);
    const distance = pointDistance(pointValue, candidate);
    if (distance < minDistance) {
      minDistance = distance;
      closest = candidate;
    }
  }
  return closest;
}

function closestPointOnSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= EPSILON) return copyPoint(a);
  const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSquared, 0, 1);
  return [a[0] + dx * t, a[1] + dy * t];
}

export function maxDistanceFromPolyline(points, source) {
  return Math.max(0, ...points.map(pointValue => pointDistance(pointValue, closestPointOnPolyline(pointValue, source))));
}

export function pointDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function pointSegmentDistance(p, a, b) {
  return pointDistance(p, closestPointOnSegment(p, a, b));
}

function triangleArea(a, b, c) {
  return Math.abs((a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1])) / 2);
}

function normalizePoints(points, closed) {
  const copied = points.map(copyPoint);
  return closed ? closeRing(stripClosure(copied)) : copied;
}

export function isClosed(points) {
  return points.length > 2 && samePoint(points[0], points.at(-1));
}

export function samePoint(a, b, tolerance = 1e-7) {
  return pointDistance(a, b) <= tolerance;
}

export function stripClosure(points) {
  return isClosed(points) ? points.slice(0, -1).map(copyPoint) : points.map(copyPoint);
}

export function closeRing(points) {
  const result = points.map(copyPoint);
  if (result.length && !samePoint(result[0], result.at(-1))) result.push(copyPoint(result[0]));
  return result;
}

function lerpPoint(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function copyPoint(value) {
  return [value[0], value[1]];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
