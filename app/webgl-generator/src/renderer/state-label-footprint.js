// Interior cell edges cancel in pairs. The remaining rings include lakes,
// enclaves and the map frame. Index by latitude for repeated glyph queries.
const outlines = new WeakMap();

export function homelandOutline(map, cells) {
  if (!cells?.size || !map.pack?.vertices?.p || !map.pack.cells?.v) return null;
  if (outlines.has(cells)) return outlines.get(cells);
  const step = Math.max(1, map.metadata.graphHeight / 96);
  const outline = indexEdges(cells, map.pack.cells.v, map.pack.vertices.p, step);
  if (outline && map.grid?.cells?.state && map.grid?.vertices?.p) {
    const grid = map.grid.cells;
    const queue = [], territory = new Set();
    let state;
    // Seed from the selected pack component only. Multiple pack cells can
    // map to one grid cell, and coastal grid cells may have no pack center.
    for (const cell of cells) {
      state = map.pack.cells.state[cell];
      const seed = map.pack.cells.g?.[cell];
      if (grid.state[seed] !== state || grid.h[seed] < 20 || territory.has(seed)) continue;
      queue.push(seed);
      territory.add(seed);
    }
    for (let i = 0; i < queue.length; i++) {
      for (const next of grid.c[queue[i]] || []) {
        if (territory.has(next) || grid.state[next] !== state || grid.h[next] < 20) continue;
        territory.add(next);
        queue.push(next);
      }
    }
    outline.grid = indexEdges(queue, grid.v, map.grid.vertices.p, step);
  }
  outlines.set(cells, outline);
  return outline;
}

function indexEdges(cells, rings, vertices, step) {
  const edges = new Set();
  for (const cell of cells) {
    const ring = rings[cell];
    if (!ring?.length) continue;
    let previous = ring[ring.length - 1];
    for (const current of ring) {
      const key = Math.min(previous, current) * vertices.length + Math.max(previous, current);
      if (!edges.delete(key)) edges.add(key);
      previous = current;
    }
  }
  const rows = new Map();
  for (const key of edges) {
    const a = vertices[Math.floor(key / vertices.length)], b = vertices[key % vertices.length];
    if (!a || !b) continue;
    const segment = {a, b, left: Math.min(a[0], b[0]), right: Math.max(a[0], b[0]), top: Math.min(a[1], b[1]), bottom: Math.max(a[1], b[1])};
    for (let i = Math.floor(segment.top / step); i <= Math.floor(segment.bottom / step); i++) {
      if (!rows.has(i)) rows.set(i, []);
      rows.get(i).push(segment);
    }
  }
  return rows.size ? {rows, step} : null;
}

export function homelandContainsBox(outline, left, top, right, bottom) {
  if (!outline) return false;
  if (outline.grid !== undefined && !homelandContainsBox(outline.grid, left, top, right, bottom)) return false;
  const {rows, step} = outline;
  let inside = false;
  // Test the top-left corner, then reject any boundary touching the closed
  // rectangle. This also detects a small enclave entirely inside a glyph.
  const first = Math.floor(top / step), last = Math.floor(bottom / step);
  for (let i = first; i <= last; i++) {
    const segments = rows.get(i);
    if (!segments) return false;
    for (const {a, b, left: x0, right: x1, top: y0, bottom: y1} of segments) {
      if (x1 < left || y1 < top || y0 > bottom) continue;
      const dx = b[0] - a[0], dy = b[1] - a[1];
      if (i === first && (a[1] > top) !== (b[1] > top) && left < a[0] + (top - a[1]) * dx / dy) inside = !inside;
      if (x0 > right) continue;
      const cross = dx * ((top + bottom) / 2 - a[1]) - dy * ((left + right) / 2 - a[0]);
      if (Math.abs(cross) <= (Math.abs(dx) * (bottom - top) + Math.abs(dy) * (right - left)) / 2) return false;
    }
  }
  return inside;
}
