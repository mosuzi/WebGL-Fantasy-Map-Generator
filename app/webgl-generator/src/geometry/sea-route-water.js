import {locateGridPoint} from "./grid-point.js";
import {segmentsIntersect, worldDistance} from "../renderer/geometry.js";
import {sharedVoronoiEdge} from "../renderer/shore-layer.js";

export const SEA_ROUTE_MAX_DETOUR = 24;
const clearance = 0.4;
const bucketSize = 16;
const atlases = new WeakMap();

export function invalidateSeaRouteWater(map) {
  if (map) atlases.delete(map);
}

export function seaRouteWater(map) {
  const grid = map?.grid;
  if (!grid?.cells?.c || !grid.cells.h || !grid.cells.v || !grid.vertices?.p || !grid.points || !grid.metadata) return null;
  const routes = map.settlements?.routes;
  const previous = atlases.get(map);
  if (previous?.grid === grid && previous.heights === grid.cells.h && previous.routes === routes) return previous;
  const heights = grid.cells.h;
  const buckets = new Map();
  for (let land = 0; land < heights.length; land++) {
    if (heights[land] < 20) continue;
    for (const water of grid.cells.c[land] || []) {
      if (!(heights[water] < 20)) continue;
      const edge = sharedVoronoiEdge(map, land, water);
      if (!edge?.[0] || !edge[1]) continue;
      forBuckets(edge[0], edge[1], 0, key => {
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push({edge, water});
      });
    }
  }
  const {graphWidth, graphHeight} = grid.metadata;
  const locate = ([x, y]) => x >= 0 && y >= 0 && x <= graphWidth && y <= graphHeight
    ? locateGridPoint(grid, x, y).cell : null;
  const junctions = new Set();
  for (const route of routes || []) {
    if (route?.type !== "searoute" || !route.points?.length) continue;
    if (Array.isArray(route.points[0])) junctions.add(route.points[0].join(","));
    if (Array.isArray(route.points.at(-1))) junctions.add(route.points.at(-1).join(","));
  }
  const isWater = cell => cell !== null && heights[cell] < 20;
  const clear = (a, b, margin = clearance) => {
    const limit = margin * margin;
    return !forBuckets(a, b, margin, key => (buckets.get(key) || []).some(({edge: [c, d]}) =>
      segmentsIntersect(a, b, c, d)
      || Math.min(distanceSquaredToSegment(a, c, d), distanceSquaredToSegment(b, c, d),
        distanceSquaredToSegment(c, a, b), distanceSquaredToSegment(d, a, b)) <= limit));
  };
  const atlas = {grid, heights, routes, locate, isWater, clear, junctions, buckets};
  atlases.set(map, atlas);
  return atlas;
}

export function seaRouteAnchor(atlas, route, index, point) {
  const actual = atlas.locate(point);
  const declared = route.cells?.[index];
  if (actual === null || (!atlas.isWater(actual) && !atlas.isWater(declared))) return {point, water: false, cell: actual};
  if (atlas.isWater(actual)) return {point, water: true, cell: actual};

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
  return closest ? {...closest, originalDry: !atlas.isWater(actual), junction: atlas.junctions.has(point.join(","))}
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
