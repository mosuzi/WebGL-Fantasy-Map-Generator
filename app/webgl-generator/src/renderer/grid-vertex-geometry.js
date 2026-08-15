const resolvedVertexCache = new WeakMap();
const MAX_COLLAPSED_VERTEX_SPREAD = 0.25;

export function resolvedGridVertexPoints(grid) {
  if (!grid || typeof grid !== "object") return [];
  const cached = resolvedVertexCache.get(grid);
  if (cached) return cached;

  const storedPoints = grid?.vertices?.p || [];
  const groups = new Map();
  for (let vertex = 0; vertex < storedPoints.length; vertex++) {
    const point = storedPoints[vertex];
    if (!isWorldPoint(point)) continue;
    const key = `${point[0]}:${point[1]}`;
    const group = groups.get(key);
    if (group) group.push(vertex);
    else groups.set(key, [vertex]);
  }

  const resolved = storedPoints.slice();
  const refinedGroupsByVertex = new Map();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const precisePoints = group.map(vertex => preciseVoronoiVertex(grid, vertex));
    if (precisePoints.some(point => !point) || maximumPointSpread(precisePoints) > MAX_COLLAPSED_VERTEX_SPREAD) continue;
    for (let index = 0; index < group.length; index++) {
      const vertex = group[index];
      resolved[vertex] = precisePoints[index];
      refinedGroupsByVertex.set(vertex, group);
    }
  }

  stabilizeResolvedGridVertexPoints(storedPoints, resolved, grid?.cells?.v, refinedGroupsByVertex);

  resolvedVertexCache.set(grid, resolved);
  return resolved;
}

export function stabilizeResolvedGridVertexPoints(storedPoints, resolvedPoints, cellVertices, refinedGroupsByVertex) {
  if (!Array.isArray(storedPoints) || !Array.isArray(resolvedPoints) || !Array.isArray(cellVertices)) return resolvedPoints;
  const unsafeGroups = new Set();
  for (const vertices of cellVertices) {
    if (!Array.isArray(vertices) || vertices.length < 4) continue;
    const points = vertices.map(vertex => resolvedPoints[vertex]);
    if (!cellBoundarySelfIntersects(points)) continue;
    for (const vertex of vertices) {
      const group = refinedGroupsByVertex?.get(vertex);
      if (group) unsafeGroups.add(group);
    }
  }
  for (const group of unsafeGroups) {
    for (const vertex of group) resolvedPoints[vertex] = storedPoints[vertex];
  }
  return resolvedPoints;
}

export function resolvedGridVertexPoint(grid, vertex) {
  return resolvedGridVertexPoints(grid)[vertex] || grid?.vertices?.p?.[vertex] || null;
}

function preciseVoronoiVertex(grid, vertex) {
  const cellIds = grid?.vertices?.c?.[vertex];
  if (!Array.isArray(cellIds) || cellIds.length !== 3) return null;
  const points = cellIds.map(cell => grid?.points?.[cell]);
  if (!points.every(isWorldPoint)) return null;

  const [[ax, ay], [bx, by], [cx, cy]] = points;
  const ad = ax * ax + ay * ay;
  const bd = bx * bx + by * by;
  const cd = cx * cx + cy * cy;
  const divisor = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (!Number.isFinite(divisor) || Math.abs(divisor) <= 1e-12) return null;

  const x = (ad * (by - cy) + bd * (cy - ay) + cd * (ay - by)) / divisor;
  const y = (ad * (cx - bx) + bd * (ax - cx) + cd * (bx - ax)) / divisor;
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
}

function maximumPointSpread(points) {
  let maximum = 0;
  for (let first = 0; first < points.length; first++) {
    for (let second = first + 1; second < points.length; second++) {
      maximum = Math.max(maximum, Math.hypot(
        points[first][0] - points[second][0],
        points[first][1] - points[second][1]
      ));
    }
  }
  return maximum;
}

function isWorldPoint(point) {
  return Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]);
}

function cellBoundarySelfIntersects(points) {
  if (points.some(point => !isWorldPoint(point))) return true;
  for (let first = 0; first < points.length; first++) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second++) {
      const secondNext = (second + 1) % points.length;
      if (first === secondNext || firstNext === second) continue;
      if (segmentsIntersect(points[first], points[firstNext], points[second], points[secondNext])) return true;
    }
  }
  return false;
}

function segmentsIntersect(a, b, c, d) {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (abC * abD < 0 && cdA * cdB < 0) return true;
  return (abC === 0 && pointOnSegment(c, a, b))
    || (abD === 0 && pointOnSegment(d, a, b))
    || (cdA === 0 && pointOnSegment(a, c, d))
    || (cdB === 0 && pointOnSegment(b, c, d));
}

function orientation(a, b, c) {
  const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return Math.abs(cross) <= 1e-12 ? 0 : Math.sign(cross);
}

function pointOnSegment(point, start, end) {
  return point[0] >= Math.min(start[0], end[0]) - 1e-12
    && point[0] <= Math.max(start[0], end[0]) + 1e-12
    && point[1] >= Math.min(start[1], end[1]) - 1e-12
    && point[1] <= Math.max(start[1], end[1]) + 1e-12;
}
