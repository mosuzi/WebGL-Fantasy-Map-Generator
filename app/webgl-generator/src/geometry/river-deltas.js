import {riverShorePoints, sharedShore} from "./river-shores.js";
import {pointInGridCell} from "./grid-point.js";
import {isSharedCubicCurve, sampleCentripetalCatmullRom} from "./cubic-path.js";
import {smoothWorldPath} from "../renderer/geometry.js";

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
const edgeKey = (a, b) => a < b ? `${a}/${b}` : `${b}/${a}`;

function intersects(a, b, p, q) {
  if (Math.max(a[0], b[0]) < Math.min(p[0], q[0]) || Math.max(p[0], q[0]) < Math.min(a[0], b[0]) ||
      Math.max(a[1], b[1]) < Math.min(p[1], q[1]) || Math.max(p[1], q[1]) < Math.min(a[1], b[1])) return false;
  return cross(a, b, p) * cross(a, b, q) <= 0 && cross(p, q, a) * cross(p, q, b) <= 0;
}

// Search only the low, connected floodplain within reach of this mouth.
function coastalPlain(map, river, land, water, mouth, spacing) {
  const grid = map.grid;
  const {cells, vertices} = grid, queue = [land], depth = new Map([[land, 0]]);
  const shores = [], boundary = new Map(), sites = [], riverIds = new Set(), packCells = new Set();
  for (const cell of queue) {
    const ids = cells.v[cell];
    if (!ids?.length) continue;
    sites.push(grid.points[cell]);
    const packed = cells.pack?.[cell];
    if (packed >= 0) {
      packCells.add(packed);
      for (const n of map.pack.cells.c?.[packed] || []) packCells.add(n);
    }
    for (let i = 0; i < ids.length; i++) {
      const a = ids[i], b = ids[(i + 1) % ids.length], key = edgeKey(a, b);
      if (!boundary.delete(key)) boundary.set(key, [vertices.p[a], vertices.p[b]]);
    }
    for (const n of cells.c[cell] || []) {
      const h = cells.h[n];
      if (h < 20) {
        if (h < 12 || cells.f[n] !== cells.f[water]) continue;
        const shore = sharedShore(grid, cell, n, mouth);
        if (!shore) continue;
        const [a, b] = shore.edge.map(v => vertices.p[v]);
        // Coastal towns can settle near an edge midpoint. Keep that landing
        // dry and offer the river two distinct positions along the same shore.
        sites.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
        for (const t of [0.21, 0.79]) {
          const x = a[0] + t * (b[0] - a[0]), y = a[1] + t * (b[1] - a[1]);
          // Continue inside this water cell so the visual land mask trims even
          // a rounded coastline without leaving a gap at the distributary.
          const site = grid.points[n];
          shores.push({edge: shore.edge, point: [x + (site[0] - x) * 0.4, y + (site[1] - y) * 0.4]});
        }
      } else if (h <= 26 && Math.abs(h - cells.h[cell]) <= 4 && depth.get(cell) < 4 && !depth.has(n)) {
        depth.set(n, depth.get(cell) + 1);
        queue.push(n);
      }
    }
  }
  // Several packed sites can share a coastal grid cell. Towns can occupy any
  // of those sites, including ones offset from the visible polygon's center.
  for (const id of packCells) {
    const pack = map.pack.cells;
    if (!depth.has(pack.g[id])) continue;
    const site = pack.p?.[id], center = grid.points[pack.g[id]];
    if (site && (site[0] !== center[0] || site[1] !== center[1])) sites.push(site);
    const owner = pack.r?.[id];
    if (owner > 0 && owner !== (river.id ?? river.i)) riverIds.add(owner);
  }
  const channels = [];
  if (riverIds.size) {
    for (const other of map.rivers?.rivers || []) {
      if (!riverIds.has(other?.id ?? other?.i) || !other.points?.length) continue;
      const points = isSharedCubicCurve(other.visualCurve) ? sampleCentripetalCatmullRom(other.points).points :
        smoothWorldPath(riverShorePoints(map, other));
      const range = 5 * spacing;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        if (Math.min(a[0], b[0]) <= mouth[0] + range && Math.max(a[0], b[0]) >= mouth[0] - range &&
            Math.min(a[1], b[1]) <= mouth[1] + range && Math.max(a[1], b[1]) >= mouth[1] - range) channels.push([a, b]);
      }
    }
  }
  return {shores, landCells: queue, boundary, sites, channels};
}

function passesSite(a, b, site, clearance) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((site[0] - a[0]) * dx + (site[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(site[0] - a[0] - t * dx, site[1] - a[1] - t * dy) < clearance;
}

function distributaryPath(fork, control, end) {
  const path = [fork];
  for (let i = 1; i <= 8; i++) {
    const t = i / 8, u = 1 - t;
    path.push([u * u * fork[0] + 2 * u * t * control[0] + t * t * end[0],
      u * u * fork[1] + 2 * u * t * control[1] + t * t * end[1]]);
  }
  return path;
}

export function riverDeltaBranches(map, river, shorePoints) {
  const flow = Number(river?.discharge ?? river?.flux);
  const threshold = Math.max(200, (map?.rivers?.metadata?.maxFlux || 0) * 0.15);
  if (!(flow >= threshold) || river.parent || river.outletKind !== "ocean" || river.cells?.length < 8 ||
      river.visualCurve || river.controlPoints?.length || river.hydrology?.method === "manual-downhill") return [];
  const grid = map?.grid, ids = map?.pack?.cells?.g, cells = grid?.cells;
  if (!ids || !cells?.f || !cells.c || !cells.v || !cells.h || !grid.vertices?.p || !river.cells?.length) return [];
  const land = ids[river.cells.at(-2)], water = ids[river.cells.at(-1)];
  if (!(cells.h[water] >= 12 && cells.h[water] < 20) || grid.features?.[cells.f[water]]?.type !== "ocean") return [];
  const heights = river.cells.slice(-4, -1).map(cell => cells.h[ids[cell]]);
  if (!heights.every(h => h >= 20 && h <= 26) || Math.max(...heights) - Math.min(...heights) > 4) return [];
  const points = shorePoints ?? riverShorePoints(map, river), mouth = points?.at(-1);
  if (!mouth || !sharedShore(grid, land, water, mouth)) return [];
  const spacing = grid.metadata?.spacing || Math.sqrt(map.metadata.graphWidth * map.metadata.graphHeight / grid.points.length);
  const plain = coastalPlain(map, river, land, water, mouth, spacing);
  const forks = [];
  // A segment midpoint belongs to both the raw line and its corner-cut rendering.
  for (let index = points.length - 2; index >= 0; index--) {
    const a = points[index], b = points[index + 1];
    const fork = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], reach = distance(fork, mouth);
    if (reach > 3.1 * spacing) break;
    if (reach >= spacing && plain.landCells.some(id => pointInGridCell(grid, id, ...fork))) forks.push({index, fork, reach});
  }
  const preferred = 1.8 * spacing;
  forks.sort((a, b) => Math.abs(a.reach - preferred) - Math.abs(b.reach - preferred));
  for (const fork of forks) {
    const branches = findDistributaries(points, fork, plain, spacing, flow >= 2 * threshold);
    if (branches.length) return branches;
  }
  return [];
}

function findDistributaries(points, {index, fork, reach}, {shores, boundary, sites, channels}, spacing, allowTwo) {
  const mouth = points.at(-1), dx = (mouth[0] - fork[0]) / reach, dy = (mouth[1] - fork[1]) / reach;
  const candidates = [];
  for (const shore of shores) {
    const end = shore.point, ex = end[0] - fork[0], ey = end[1] - fork[1];
    const forward = ex * dx + ey * dy, side = ey * dx - ex * dy;
    if (forward < reach * 0.48 || forward > reach * 1.65 ||
        Math.abs(side) < spacing * 0.85 || Math.abs(side) > Math.min(forward * 1.6, spacing * 2.7)) continue;
    const score = Math.abs(forward - reach) + Math.abs(Math.abs(side) - reach * 0.8);
    candidates.push({end, side, score, edge: edgeKey(...shore.edge)});
  }
  const branches = [], sides = new Set();
  for (const {end, side, edge} of candidates.sort((a, b) => a.score - b.score)) {
    if (sides.has(Math.sign(side))) continue;
    // Start angled downstream, then bend towards the separate receiving shore.
    for (const bend of [0.25, 0.55, -0.18]) {
      const control = [fork[0] * 0.6 + end[0] * 0.4 + dx * reach * bend,
        fork[1] * 0.6 + end[1] * 0.4 + dy * reach * bend];
      const path = distributaryPath(fork, control, end);
      const obstructed = path.slice(1).some((b, i) => {
        const a = path[i];
        for (const [key, [p, q]] of boundary) if (key !== edge && intersects(a, b, p, q)) return true;
        for (let k = index + 1; k < points.length - 1; k++) if (intersects(a, b, points[k], points[k + 1])) return true;
        for (const [p, q] of channels) if (intersects(a, b, p, q)) return true;
        // Leave dry ground at settlement sites even on maps without cities yet.
        return sites.some(site => passesSite(a, b, site, spacing * 0.17));
      });
      if (obstructed) continue;
      branches.push(path);
      sides.add(Math.sign(side));
      break;
    }
    if (branches.length === 2 || (branches.length && !allowTwo)) break;
  }
  return branches;
}
