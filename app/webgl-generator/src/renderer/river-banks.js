const geometryCache = new WeakMap();
const MAX_RIVER_FRACTION = 0.45;

export function riverGridSpacing(map) {
  const grid = map.grid;
  const spacing = grid?.metadata?.spacing;
  if (Number.isFinite(spacing) && spacing > 0) return spacing;
  return Math.sqrt(map.metadata.graphWidth * map.metadata.graphHeight / (grid?.points?.length || 1));
}

function bankGeometry(map, spacing) {
  const grid = map.grid;
  const rings = grid?.cells?.v, vertices = grid?.vertices?.p;
  if (!rings || !vertices || !grid.cells.h) return null;
  const cached = geometryCache.get(rings);
  if (cached?.vertices === vertices) return cached;
  const step = spacing * 3;
  const columns = Math.max(1, Math.ceil(map.metadata.graphWidth / step));
  const rows = Math.max(1, Math.ceil(map.metadata.graphHeight / step));
  const column = x => Math.max(0, Math.min(columns - 1, Math.floor(x / step)));
  const row = y => Math.max(0, Math.min(rows - 1, Math.floor(y / step)));
  const bins = new Array(rows * columns);
  const bounds = new Float64Array(rings.length * 5);
  for (let id = 0; id < rings.length; id++) {
    const ring = rings[id];
    if (!ring || ring.length < 3) continue;
    let previous = vertices[ring[ring.length - 1]];
    if (!previous) continue;
    let loX = Infinity, loY = Infinity, hiX = -Infinity, hiY = -Infinity;
    let twiceArea = 0;
    for (const v of ring) {
      const p = vertices[v];
      if (!p) {
        twiceArea = 0;
        break;
      }
      twiceArea += previous[0] * p[1] - previous[1] * p[0];
      loX = Math.min(loX, p[0]);
      hiX = Math.max(hiX, p[0]);
      loY = Math.min(loY, p[1]);
      hiY = Math.max(hiY, p[1]);
      previous = p;
    }
    if (!twiceArea || !Number.isFinite(twiceArea)) continue;
    bounds.set([loX, loY, hiX, hiY, Math.abs(twiceArea) / 2], id * 5);
    for (let y = row(loY); y <= row(hiY); y++) {
      for (let x = column(loX); x <= column(hiX); x++) (bins[y * columns + x] ??= []).push(id);
    }
  }
  const geometry = {vertices, bins, bounds, columns, column, row};
  geometryCache.set(rings, geometry);
  return geometry;
}

// Portion of the segment that can paint this cell, clipped in both axes
// against its bounding box expanded by the maximum shoulder radius.
function segmentAreaInBox(bounds, k, a, b, length, radius) {
  let start = 0, end = 1;
  for (let axis = 0; axis < 2; axis++) {
    const low = bounds[k + axis] - radius, high = bounds[k + axis + 2] + radius;
    const delta = b[axis] - a[axis];
    if (delta === 0) {
      if (a[axis] < low || a[axis] > high) return 0;
      continue;
    }
    const u = (low - a[axis]) / delta, v = (high - a[axis]) / delta;
    start = Math.max(start, Math.min(u, v));
    end = Math.min(end, Math.max(u, v));
    if (start > end) return 0;
  }
  return 2 * radius * (length * (end - start) + 2 * radius);
}

// Bound the combined painted area of every channel touching each land polygon.
// The joins stay inside the segment capsule. Scaling both endpoint widths by s
// reduces its area bound by at least s, including at confluences and hairpins.
export function createRiverBankBudget(map, spacing, projection) {
  const geometry = bankGeometry(map, spacing);
  if (!geometry) return null;
  const {bins, bounds, columns, column, row} = geometry;
  const anisotropy = projection.cssPerWorld * projection.backingPerCss / Math.min(
    projection.cssPerWorldX * projection.backingPerCssX, projection.cssPerWorldY * projection.backingPerCssY);
  const cells = new Map();
  const visited = new Uint32Array(map.grid.cells.v.length);
  let segment = 0;
  return {
    include({points, widths, scales}) {
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        const radius = Math.max(widths[i - 1], widths[i]) * anisotropy / 2;
        const loX = Math.min(a[0], b[0]) - radius, hiX = Math.max(a[0], b[0]) + radius;
        const loY = Math.min(a[1], b[1]) - radius, hiY = Math.max(a[1], b[1]) + radius;
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (!length || !radius) continue;
        segment++;
        for (let y = row(loY); y <= row(hiY); y++) {
          for (let x = column(loX); x <= column(hiX); x++) {
            for (const id of bins[y * columns + x] || []) {
              if (map.grid.cells.h[id] < 20 || visited[id] === segment) continue;
              visited[id] = segment;
              const area = segmentAreaInBox(bounds, id * 5, a, b, length, radius);
              if (!area) continue;
              let cell = cells.get(id);
              if (!cell) {
                cell = {area: 0, strokes: []};
                cells.set(id, cell);
              }
              cell.area += area;
              cell.strokes.push(scales, i);
            }
          }
        }
      }
    },
    apply() {
      for (const [id, {area, strokes}] of cells) {
        const scale = bounds[id * 5 + 4] * MAX_RIVER_FRACTION / area;
        if (scale >= 1) continue;
        for (let k = 0; k < strokes.length; k += 2) {
          const values = strokes[k], i = strokes[k + 1];
          values[i - 1] = Math.min(values[i - 1], scale);
          values[i] = Math.min(values[i], scale);
        }
      }
    }
  };
}
