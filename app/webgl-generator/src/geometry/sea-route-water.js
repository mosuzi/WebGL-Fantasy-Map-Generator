import {locateGridPoint} from "./grid-point.js";
import {segmentsIntersect, worldDistance} from "../renderer/geometry.js";
import {buildShoreSurfaceCorrectionTriangles, sharedVoronoiEdge} from "../renderer/shore-layer.js";

export const SEA_ROUTE_MAX_DETOUR = 24;
const clearance = 0.4;
const bucketSize = 16;
const atlases = new WeakMap();

export function invalidateSeaRouteWater(map, cells) {
  const atlas = atlases.get(map);
  if (!atlas) return;
  if (!cells) {
    atlases.delete(map);
    return;
  }
  const affected = new Set(cells);
  for (const cell of cells) for (const neighbor of atlas.grid.cells.c[cell] || []) affected.add(neighbor);
  atlas.revision++;
  for (const cell of affected) {
    for (const record of atlas.rawEdges.get(cell) || []) updateBuckets(atlas, atlas.buckets, record, false);
    populateRawEdges(map, atlas, cell);
    const center = atlas.grid.points[cell];
    if (center) forBuckets(center, center, 0, key => { atlas.changed.set(key, atlas.revision); });
  }
}

export function setSeaRouteShoreSurface(map, paths, vertices, ends) {
  const routes = map?.settlements?.routes;
  const pathSource = paths?.topology ? paths : vertices;
  if (!pathSource || !routes) return;
  const current = atlases.get(map);
  if (current?.paths === pathSource && current.routes === routes && current.heights === map.grid.cells.h) return;
  if (!routes.some(route => route?.type === "searoute")) return;
  const atlas = seaRouteWater(map, paths);
  if (!atlas || atlas.paths === pathSource) return;
  const ordered = paths?.topology ? [...paths.coastline, ...paths.lakeShore] : [vertices];
  const ranges = paths?.topology ? ends : [vertices.length];
  const remaining = new Set(ordered);
  const previous = atlas.shoreParts;
  const parts = new Map();
  // 同时避开原始陆面和平滑新增的陆面，切换显示精度时可以沿用航线。
  atlas.revision++;
  for (const path of previous.keys()) {
    if (remaining.has(path)) continue;
    for (const record of previous.get(path)) updateBuckets(atlas, atlas.land, record, false);
  }
  const {graphWidth, graphHeight} = map.metadata;
  const fromClip = (x, y) => [(x + 1) * graphWidth / 2, (1 - y) * graphHeight / 2];
  const toDrawnPoint = ([x, y]) => fromClip(Math.fround(x / graphWidth * 2 - 1), Math.fround(1 - y / graphHeight * 2));
  ordered.forEach((path, index) => {
    let records = previous.get(path);
    if (!records) {
      records = [];
      if (ranges?.length === ordered.length && vertices) {
        for (let start = ranges[index - 1] || 0; start < ranges[index]; start += 18) {
          records.push(landRecord([0, 6, 12].map(offset => fromClip(vertices[start + offset], vertices[start + offset + 1]))));
        }
      } else {
        for (const triangle of buildShoreSurfaceCorrectionTriangles(path, map)) {
          if (triangle.side === "land") records.push(landRecord(triangle.points.map(toDrawnPoint)));
        }
      }
      for (const record of records) updateBuckets(atlas, atlas.land, record, true);
    }
    parts.set(path, records);
  });
  atlas.paths = pathSource;
  atlas.shoreParts = parts;
}

export function seaRouteWater(map, paths) {
  const grid = map?.grid;
  if (!grid?.cells?.c || !grid.cells.h || !grid.cells.v || !grid.vertices?.p || !grid.points || !grid.metadata) return null;
  const routes = map.settlements?.routes;
  const previous = atlases.get(map);
  if (previous?.grid === grid && previous.heights === grid.cells.h && previous.routes === routes) return previous;
  const heights = grid.cells.h;
  const reuse = previous?.grid === grid && previous.heights === heights;
  const buckets = reuse ? previous.buckets : new Map();
  const land = reuse ? previous.land : new Map();
  const {graphWidth, graphHeight} = grid.metadata;
  const locate = ([x, y]) => {
    forBuckets([x, y], [x, y], 0, key => { atlas.visited?.add(key); });
    return x >= 0 && y >= 0 && x <= graphWidth && y <= graphHeight ? locateGridPoint(grid, x, y).cell : null;
  };
  const junctions = new Set();
  for (const route of routes || []) {
    if (route?.type !== "searoute" || !route.points?.length) continue;
    if (Array.isArray(route.points[0])) junctions.add(route.points[0].join(","));
    if (Array.isArray(route.points.at(-1))) junctions.add(route.points.at(-1).join(","));
  }
  const isWater = cell => {
    const point = atlas.visited && grid.points[cell];
    if (point) forBuckets(point, point, 0, key => { atlas.visited.add(key); });
    return cell != null && heights[cell] < 20;
  };
  const clear = (a, b, margin = clearance) => {
    const limit = margin * margin;
    return !forBuckets(a, b, margin, key => {
      atlas.visited?.add(key);
      for (const {edge: [c, d]} of buckets.get(key) || []) if (hitsEdge(a, b, c, d, limit)) return true;
      for (const {points: [c, d, e]} of land.get(key) || []) {
        if (hitsEdge(a, b, c, d, limit) || hitsEdge(a, b, d, e, limit) || hitsEdge(a, b, e, c, limit)
          || insideTriangle(a, c, d, e) || insideTriangle(b, c, d, e)) return true;
      }
      return false;
    });
  };
  const atlas = {grid, heights, routes, locate, isWater, clear, junctions, buckets, land,
    rawEdges: new Map(), shoreParts: new Map(), revision: 0, changed: new Map()};
  if (reuse) {
    for (const name of ["buckets", "land", "rawEdges", "shoreParts", "paths", "changed", "revision"]) atlas[name] = previous[name];
  } else {
    const shorePaths = paths && [...paths.coastline, ...paths.lakeShore];
    if (shorePaths?.length && shorePaths.every(path => Array.isArray(path.sourceEdges))) {
      for (const path of shorePaths) for (const {a, b, landCell, waterCell} of path.sourceEdges) {
        const record = {edge: [a, b], bounds: [a, b], water: waterCell};
        let records = atlas.rawEdges.get(landCell);
        if (!records) atlas.rawEdges.set(landCell, records = []);
        records.push(record);
        updateBuckets(atlas, atlas.buckets, record, true);
      }
    } else {
      for (let cell = 0; cell < heights.length; cell++) populateRawEdges(map, atlas, cell);
    }
  }
  atlases.set(map, atlas);
  return atlas;
}

function populateRawEdges(map, atlas, cell) {
  const records = [];
  if (!atlas.isWater(cell)) for (const water of atlas.grid.cells.c[cell] || []) {
    if (!atlas.isWater(water)) continue;
    const edge = sharedVoronoiEdge(map, cell, water);
    if (edge?.[0] && edge[1]) records.push({edge, bounds: edge, water});
  }
  if (records.length) atlas.rawEdges.set(cell, records);
  else atlas.rawEdges.delete(cell);
  for (const record of records) updateBuckets(atlas, atlas.buckets, record, true);
}

function landRecord(points) {
  const x = points.map(point => point[0]), y = points.map(point => point[1]);
  return {points, bounds: [[Math.min(...x), Math.min(...y)], [Math.max(...x), Math.max(...y)]]};
}

function updateBuckets(atlas, buckets, record, add) {
  forBuckets(...record.bounds, 0, key => {
    let members = buckets.get(key);
    if (add) {
      if (!members) buckets.set(key, members = new Set());
      members.add(record);
    } else {
      members.delete(record);
      if (!members.size) buckets.delete(key);
    }
    if (atlas.revision) atlas.changed.set(key, atlas.revision);
  });
}

function hitsEdge(a, b, c, d, limit) {
  return segmentsIntersect(a, b, c, d)
    || Math.min(distanceSquaredToSegment(a, c, d), distanceSquaredToSegment(b, c, d),
      distanceSquaredToSegment(c, a, b), distanceSquaredToSegment(d, a, b)) <= limit;
}

function insideTriangle(point, a, b, c) {
  const side = (p, q) => (q[0] - p[0]) * (point[1] - p[1]) - (q[1] - p[1]) * (point[0] - p[0]);
  const ab = side(a, b), bc = side(b, c), ca = side(c, a);
  return (ab > 0 && bc > 0 && ca > 0) || (ab < 0 && bc < 0 && ca < 0);
}

export function seaRouteAnchor(atlas, route, index, point) {
  const actual = atlas.locate(point);
  const declared = route.cells?.[index];
  if (actual === null || (!atlas.isWater(actual) && !atlas.isWater(declared))) return {point, water: false, cell: actual};
  if (atlas.isWater(actual) && atlas.clear(point, point, 0)) return {point, water: true, cell: actual};

  const cells = new Set([actual, declared, ...(atlas.grid.cells.c[actual] || []), ...(atlas.grid.cells.c[declared] || [])]);
  let closest = null;
  let distance = SEA_ROUTE_MAX_DETOUR;
  for (const cell of cells) {
    const center = atlas.grid.points[cell];
    if (!atlas.isWater(cell) || !center || !atlas.clear(center, center)) continue;
    let low = 0, high = 1;
    for (let step = 0; step < 8; step++) {
      const t = (low + high) / 2;
      const candidate = interpolate(center, point, t);
      if (atlas.clear(center, candidate)) low = t;
      else high = t;
    }
    const candidate = interpolate(center, point, low);
    const length = worldDistance(point, candidate);
    if (length >= distance) continue;
    distance = length;
    closest = {point: candidate, water: true, cell: atlas.locate(candidate)};
  }
  return closest ? {...closest, originalDry: true, junction: atlas.junctions.has(point.join(","))}
    : {point, water: false, cell: actual};
}

export function seaRouteDetour(atlas, start, end, sourceStart, sourceEnd) {
  // 余量只用于新插入的绕行点。原来合法的狭窄水道不应为增加余量而折返。
  if (atlas.clear(start.point, end.point, 0)) return [];
  const corner = offshoreCorner(atlas, start.point, end.point, sourceStart, sourceEnd);
  if (corner) return [corner];
  const {grid} = atlas;
  const queue = [{cell: start.cell, point: start.point, previous: null, cost: 0, estimate: worldDistance(start.point, end.point)}];
  const costs = new Map([[start.cell, 0]]);
  const limit = SEA_ROUTE_MAX_DETOUR ** 2;
  for (let count = 0; queue.length && count < 96; count++) {
    queue.sort((left, right) => right.estimate - left.estimate);
    const node = queue.pop();
    if (node.cost !== costs.get(node.cell)) continue;
    if (atlas.clear(node.point, end.point, 0)) {
      const reversed = [];
      for (let current = node; current.previous; current = current.previous) reversed.push(current.point);
      const points = [...reversed.reverse(), end.point];
      const reduced = [];
      let previous = start.point;
      for (let index = 0; index < points.length - 1; index++) {
        if (atlas.clear(previous, points[index + 1], 0)) continue;
        reduced.push(points[index]);
        previous = points[index];
      }
      return reduced;
    }
    for (const neighbor of grid.cells.c[node.cell] || []) {
      const point = grid.points[neighbor];
      if (!point || !atlas.isWater(neighbor) || distanceSquaredToSegment(point, sourceStart, sourceEnd) > limit) continue;
      if (!atlas.clear(node.point, point, 0)) continue;
      const cost = node.cost + worldDistance(node.point, point);
      if (cost >= (costs.get(neighbor) ?? Infinity)) continue;
      costs.set(neighbor, cost);
      queue.push({cell: neighbor, point, previous: node, cost, estimate: cost + worldDistance(point, end.point)});
    }
  }
  return null;
}

function offshoreCorner(atlas, start, end, sourceStart, sourceEnd) {
  const nearby = new Set();
  const limit = SEA_ROUTE_MAX_DETOUR ** 2;
  forBuckets(sourceStart, sourceEnd, SEA_ROUTE_MAX_DETOUR, key => {
    atlas.visited?.add(key);
    for (const edge of atlas.buckets.get(key) || []) nearby.add(edge);
  });
  let nearest = null;
  let length = Infinity;
  for (const {edge, water} of nearby) {
    const center = atlas.grid.points[water];
    if (!center) continue;
    for (const vertex of edge) {
      const offset = Math.min(1, 2.5 / worldDistance(vertex, center));
      const candidate = interpolate(vertex, center, offset);
      if (distanceSquaredToSegment(candidate, sourceStart, sourceEnd) > limit) continue;
      const cost = worldDistance(start, candidate) + worldDistance(candidate, end);
      if (cost >= length || !atlas.clear(candidate, candidate) || !atlas.isWater(atlas.locate(candidate))
        || !atlas.clear(start, candidate, 0) || !atlas.clear(candidate, end, 0)) continue;
      nearest = candidate;
      length = cost;
    }
  }
  return nearest;
}

export function isSeaRouteCurveClear(atlas, a, b, c, d) {
  const spread = Math.sqrt(Math.max(distanceSquaredToSegment(b, a, d), distanceSquaredToSegment(c, a, d)));
  return atlas.clear(a, d, spread);
}

export function seaRouteLegLength(start, via, end) {
  let point = start.point;
  let length = 0;
  for (const next of via) {
    length += worldDistance(point, next);
    point = next;
  }
  return length + worldDistance(point, end.point);
}

function interpolate(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function forBuckets(a, b, margin, visit) {
  const minX = Math.floor((Math.min(a[0], b[0]) - margin) / bucketSize);
  const maxX = Math.floor((Math.max(a[0], b[0]) + margin) / bucketSize);
  const minY = Math.floor((Math.min(a[1], b[1]) - margin) / bucketSize);
  const maxY = Math.floor((Math.max(a[1], b[1]) + margin) / bucketSize);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) if (visit(y * 65536 + x)) return true;
  }
  return false;
}

function distanceSquaredToSegment(point, a, b) {
  const x = b[0] - a[0];
  const y = b[1] - a[1];
  const length = x * x + y * y;
  const dx = point[0] - a[0];
  const dy = point[1] - a[1];
  const t = length ? Math.max(0, Math.min(1, (dx * x + dy * y) / length)) : 0;
  return (dx - t * x) ** 2 + (dy - t * y) ** 2;
}
