export function simplifyMeasurementPoints(points, tolerance = 0, {closed = false} = {}) {
  const source = normalizeGeometryPoints(points);
  const minimum = closed ? 3 : 2;
  if (source.length <= minimum || !(Number(tolerance) > 0)) return source;
  const simplified = closed
    ? simplifyClosedPoints(source, Number(tolerance))
    : simplifyOpenPoints(source, Number(tolerance));
  return simplified.length >= minimum ? simplified : source;
}

export function sampleMeasurementCurve(points, {closed = false, segmentsPerSpan = 6} = {}) {
  const source = normalizeGeometryPoints(points);
  if (source.length < 3) return source;
  const segments = Math.max(2, Math.min(24, Math.round(Number(segmentsPerSpan) || 6)));
  const output = [];
  const spanCount = closed ? source.length : source.length - 1;
  for (let index = 0; index < spanCount; index++) {
    const p0 = source[closed ? wrap(index - 1, source.length) : Math.max(0, index - 1)];
    const p1 = source[index];
    const p2 = source[closed ? wrap(index + 1, source.length) : index + 1];
    const p3 = source[closed ? wrap(index + 2, source.length) : Math.min(source.length - 1, index + 2)];
    for (let step = 0; step < segments; step++) {
      const t = step / segments;
      output.push(catmullRomPoint(p0, p1, p2, p3, t));
    }
  }
  if (!closed) output.push({...source.at(-1)});
  return output;
}

function simplifyClosedPoints(points, tolerance) {
  let splitA = 0;
  let splitB = 1;
  let maxDistance = -1;
  for (let left = 0; left < points.length; left++) {
    for (let right = left + 1; right < points.length; right++) {
      const distance = squaredDistance(points[left], points[right]);
      if (distance > maxDistance) {
        maxDistance = distance;
        splitA = left;
        splitB = right;
      }
    }
  }
  const forward = circularSlice(points, splitA, splitB);
  const backward = circularSlice(points, splitB, splitA);
  const first = simplifyOpenPoints(forward, tolerance);
  const second = simplifyOpenPoints(backward, tolerance);
  return [...first.slice(0, -1), ...second.slice(0, -1)];
}

function simplifyOpenPoints(points, tolerance) {
  if (points.length <= 2) return points.map(point => ({...point}));
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  const toleranceSquared = tolerance * tolerance;
  while (stack.length) {
    const [start, end] = stack.pop();
    let farthestIndex = -1;
    let farthestDistance = toleranceSquared;
    for (let index = start + 1; index < end; index++) {
      const distance = squaredSegmentDistance(points[index], points[start], points[end]);
      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthestIndex = index;
      }
    }
    if (farthestIndex < 0) continue;
    keep[farthestIndex] = 1;
    stack.push([start, farthestIndex], [farthestIndex, end]);
  }
  return points.filter((point, index) => keep[index]).map(point => ({...point}));
}

function circularSlice(points, start, end) {
  const output = [{...points[start]}];
  let index = start;
  while (index !== end) {
    index = wrap(index + 1, points.length);
    output.push({...points[index]});
  }
  return output;
}

function squaredSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (!dx && !dy) return squaredDistance(point, start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return squaredDistance(point, {x: start.x + dx * t, y: start.y + dy * t});
}

function squaredDistance(left, right) {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return dx * dx + dy * dy;
}

function catmullRomPoint(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: roundGeometryValue(0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3)),
    y: roundGeometryValue(0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3))
  };
}

function normalizeGeometryPoints(points) {
  return (Array.isArray(points) ? points : [])
    .map(point => ({...point, x: roundGeometryValue(Number(point?.x)), y: roundGeometryValue(Number(point?.y))}))
    .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function roundGeometryValue(value) {
  return Math.round(value * 1000) / 1000;
}

function wrap(value, length) {
  return (value % length + length) % length;
}
