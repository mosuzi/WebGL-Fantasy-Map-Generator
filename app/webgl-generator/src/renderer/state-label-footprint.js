// Interior cell edges cancel in pairs. The remaining rings include lakes,
// enclaves and the map frame. Index by latitude for repeated glyph queries.
const outlines = new WeakMap();

export function homelandOutline(map, cells) {
  if (!cells?.size || !map.pack?.vertices?.p || !map.pack.cells?.v) return null;
  if (outlines.has(cells)) return outlines.get(cells);
  const step = Math.max(1, map.metadata.graphHeight / 96);
  const outline = indexEdges(cells, map.pack.cells.v, map.pack.vertices.p, step);
  if (outline && map.pack.cells.p) {
    let weight = 0, cx = 0, cy = 0;
    for (const cell of cells) {
      const [px, py] = map.pack.cells.p[cell], area = map.pack.cells.area?.[cell] || 1;
      weight += area;
      cx += area * px;
      cy += area * py;
    }
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const edge of outline.segments) {
      x0 = Math.min(x0, edge.left); x1 = Math.max(x1, edge.right);
      y0 = Math.min(y0, edge.top); y1 = Math.max(y1, edge.bottom);
    }
    outline.frame = {cx: cx / weight, cy: cy / weight, x0, x1, y0, y1, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0)};
  }
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
  const segments = [];
  for (const key of edges) {
    const a = vertices[Math.floor(key / vertices.length)], b = vertices[key % vertices.length];
    if (!a || !b) continue;
    const segment = {a, b, left: Math.min(a[0], b[0]), right: Math.max(a[0], b[0]), top: Math.min(a[1], b[1]), bottom: Math.max(a[1], b[1])};
    segments.push(segment);
    for (let i = Math.floor(segment.top / step); i <= Math.floor(segment.bottom / step); i++) {
      if (!rows.has(i)) rows.set(i, []);
      rows.get(i).push(segment);
    }
  }
  return rows.size ? {rows, step, segments} : null;
}

// Sample inland spans along the country's long axis. Split at bays, holes
// and enclaves, using both the homeland and the visible grid shoreline.
export function homelandLabelSites(outline, x, y, rotation) {
  if (!outline) return {sites: [], banks: []};
  const cached = outline.labelSites;
  if (cached && cached.x === x && cached.y === y && cached.rotation === rotation) return cached;
  const angle = rotation * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const project = ({a, b}) => [
    a[0] * cos + a[1] * sin, a[1] * cos - a[0] * sin,
    b[0] * cos + b[1] * sin, b[1] * cos - b[0] * sin
  ];
  const pack = outline.segments.map(project);
  const grid = outline.grid?.segments.map(project);
  let low = Infinity, high = -Infinity;
  for (const [, firstY, , lastY] of pack) {
    low = Math.min(low, firstY, lastY);
    high = Math.max(high, firstY, lastY);
  }
  const candidates = [];
  const banks = [];
  const centerAlong = x * cos + y * sin;
  const scanRows = 45;
  for (let row = 0; row < scanRows; row++) {
    const across = low + (row + 0.5) / scanRows * (high - low);
    const packCuts = scanCrossings(pack, across);
    const gridCuts = grid ? scanCrossings(grid, across) : packCuts;
    const sampleInterior = row % 3 === 1;
    if (!sampleInterior && packCuts.length <= 2 && gridCuts.length <= 2) continue;
    const spans = [];
    for (let i = 0, j = 0; i + 1 < packCuts.length && j + 1 < gridCuts.length;) {
      const start = Math.max(packCuts[i], gridCuts[j]);
      const packEnd = packCuts[i + 1], gridEnd = gridCuts[j + 1];
      const end = Math.min(packEnd, gridEnd);
      if (end > start) {
        const along = (start + end) / 2;
        const px = along * cos - across * sin, py = along * sin + across * cos;
        const halfSpan = (end - start) / 2;
        const room = inlandClearance(outline, px, py, halfSpan);
        const score = Math.min(halfSpan, room * 2.5) - 0.18 * Math.hypot(px - x, py - y);
        if (room > 0) {
          if (sampleInterior) candidates.push({x: px, y: py, room, score});
          spans.push({start, end, room, along});
        }
      }
      if (packEnd <= gridEnd) i += 2;
      if (gridEnd <= packEnd) j += 2;
    }
    // A name can straddle a bay when useful inland spans flank the centre.
    // Ignore narrow shoreline fragments when identifying the two banks.
    const substantial = spans.filter(span => span.room >= (high - low) / 25);
    for (let i = 1; i < substantial.length; i++) {
      const left = substantial[i - 1], right = substantial[i];
      const gap = right.start - left.end;
      if (left.along >= centerAlong || right.along <= centerAlong || gap <= 0) continue;
      if (gap > Math.min(left.end - left.start, right.end - right.start)) continue;
      const along = (left.end + right.start) / 2;
      const px = along * cos - across * sin, py = along * sin + across * cos;
      const score = Math.min(left.room, right.room) - 0.35 * Math.hypot(px - x, py - y);
      banks.push({x: px, y: py, gap, score});
    }
  }
  const sites = homelandContainsBox(outline, x, y, x, y) ? [{x, y}] : [];
  for (const candidate of candidates.sort((a, b) => b.score - a.score)) {
    const separation = Math.max(candidate.room, (high - low) / 12);
    if (sites.every(site => Math.hypot(site.x - candidate.x, site.y - candidate.y) > separation)) sites.push(candidate);
    if (sites.length === 5) break;
  }
  banks.sort((a, b) => b.score - a.score);
  outline.labelSites = {x, y, rotation, sites, banks: banks.slice(0, 8)};
  return outline.labelSites;
}

function inlandClearance(outline, x, y, limit) {
  let room = 0;
  for (let step = 0; step < 6; step++) {
    const r = (room + limit) / 2;
    if (homelandContainsBox(outline, x - r, y - r, x + r, y + r)) room = r;
    else limit = r;
  }
  return room;
}

function scanCrossings(edges, across) {
  const cuts = [];
  for (const [x0, y0, x1, y1] of edges) {
    if ((y0 > across) !== (y1 > across)) cuts.push(x0 + (across - y0) * (x1 - x0) / (y1 - y0));
  }
  return cuts.sort((a, b) => a - b);
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
