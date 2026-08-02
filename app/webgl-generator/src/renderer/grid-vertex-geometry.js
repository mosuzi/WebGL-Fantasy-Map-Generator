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
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const precisePoints = group.map(vertex => preciseVoronoiVertex(grid, vertex));
    if (precisePoints.some(point => !point) || maximumPointSpread(precisePoints) > MAX_COLLAPSED_VERTEX_SPREAD) continue;
    for (const vertex of group) {
      resolved[vertex] = precisePoints[group.indexOf(vertex)];
    }
  }

  resolvedVertexCache.set(grid, resolved);
  return resolved;
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
