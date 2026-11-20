// Horizontal intervals where a glyph can be translated without crossing a
// boundary. Cutting out each edge's projection through the ink's full height
// also removes narrow bays and enclaves between the top and bottom edges.
function interiorStrip(outline, top, bottom, segments) {
  const mid = (top + bottom) / 2, cuts = [], blocked = [];
  for (const {a, b, left, right, top: ymin, bottom: ymax} of segments) {
    if (ymax < top || ymin > bottom) continue;
    if (a[1] === b[1]) { blocked.push([left, right]); continue; }
    const slope = (b[0] - a[0]) / (b[1] - a[1]);
    const xAt = y => a[0] + slope * (y - a[1]);
    if (ymin <= mid && mid < ymax) cuts.push(xAt(mid));
    const p = xAt(Math.max(ymin, top)), q = xAt(Math.min(ymax, bottom));
    blocked.push([Math.min(p, q), Math.max(p, q)]);
  }
  cuts.sort((a, b) => a - b);
  blocked.sort((a, b) => a[0] - b[0]);
  const clear = [];
  let index = 0;
  for (let i = 0; i + 1 < cuts.length; i += 2) {
    let x = cuts[i];
    const end = cuts[i+1];
    while (index < blocked.length && blocked[index][1] <= x) index++;
    for (let j = index; j < blocked.length && blocked[j][0] < end; j++) {
      if (blocked[j][0] > x) clear.push([x, blocked[j][0]]);
      x = Math.max(x, blocked[j][1]);
    }
    if (x < end) clear.push([x, end]);
  }
  return clear;
}

function intersect(a, b) {
  const result = [];
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    const start = Math.max(a[i][0], b[j][0]), end = Math.min(a[i][1], b[j][1]);
    if (start < end) result.push([start, end]);
    if (a[i][1] < b[j][1]) i++; else j++;
  }
  return result;
}

// These slabs depend only on the coastline. Share them between sizes and zoom
// levels instead of sorting the same edges again for every new glyph height.
function landBetween(outline, top, bottom) {
  const step = outline.step / 4;
  const cache = outline.landSlabs ??= new Map();
  let land = null;
  for (let i = Math.ceil(top / step); i < Math.floor(bottom / step); i++) {
    if (!cache.has(i)) {
      const y = i * step, row = Math.floor((i + 0.5) / 4);
      let spans = interiorStrip(outline, y, y + step, outline.rows.get(row) ?? []);
      if (spans.length && outline.grid) spans = intersect(spans, interiorStrip(outline.grid, y, y + step, outline.grid.rows.get(row) ?? []));
      cache.set(i, spans);
    }
    land = land === null ? cache.get(i) : intersect(land, cache.get(i));
    if (!land.length) break;
  }
  // A very thin glyph can fall entirely between consecutive slab boundaries.
  return land ?? [[outline.frame.x0 - step, outline.frame.x1 + step]];
}

function exactLandBetween(outline, top, bottom) {
  const step = outline.step / 4;
  let land = landBetween(outline, top, bottom);
  const endOfFirst = Math.min(bottom, Math.ceil(top / step) * step);
  const startOfLast = Math.max(top, endOfFirst, Math.floor(bottom / step) * step);
  for (const [a, b] of [[top, endOfFirst], [startOfLast, bottom]]) {
    if (!land.length || b <= a) continue;
    const row = Math.floor((a + b) / (2 * outline.step));
    land = intersect(land, interiorStrip(outline, a, b, outline.rows.get(row) ?? []));
    if (land.length && outline.grid) land = intersect(land, interiorStrip(outline.grid, a, b, outline.grid.rows.get(row) ?? []));
  }
  return land;
}

export function* homelandAnchorBands(outline, layout, fontSize, sx, sy) {
  const {frame} = outline;
  const margin = Math.max(2, fontSize * 0.12);
  const pitch = Math.max(0.25, 1 / sy);
  const steps = Math.ceil(frame.height / pitch);
  const ink = layout.glyphs.map(({box}) => ({
    left: (box.left - margin) / sx, right: (box.right + margin) / sx,
    top: (box.top - margin) / sy, bottom: (box.bottom + margin) / sy
  }));
  // Visit rows from the homeland centre out. Stop scanning as soon as
  // the caller accepts a position shared by every glyph of both lines.
  for (let k = 0; k <= 2 * steps; k++) {
    const y = frame.cy + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * pitch;
    if (y < frame.y0 || y > frame.y1) continue;
    let ranges = [[frame.x0, frame.x1]];
    for (const box of ink) {
      const spans = exactLandBetween(outline, y + box.top, y + box.bottom);
      ranges = intersect(ranges, spans.map(([a, b]) => [a - box.left, b - box.right]));
      if (!ranges.length) break;
    }
    for (const [left, right] of ranges) yield {y, left, right};
  }
}
