import {centripetalCatmullRomToBezier} from "./cubic-path.js";
import {isSeaRouteCurveClear, SEA_ROUTE_MAX_DETOUR, seaRouteAnchor, seaRouteDetour, seaRouteLegLength, seaRouteWater} from "./sea-route-water.js";

export const ROUTE_CURVE_MAX_OFFSET = 6;
export const ROUTE_CURVE_FINE_TOLERANCE = 0.075;
export const ROUTE_VISUAL_MAX_OFFSET = ROUTE_CURVE_MAX_OFFSET + SEA_ROUTE_MAX_DETOUR;
const MAX_SPLITS = 5;
const cache = new WeakMap();
const emptyPath = {points: [], spans: [], anchors: 0, invalid: 0, duplicates: 0};

export function routeCurveTolerance(cssPerWorld) {
  // 低倍画面以亚像素误差为界，固定档位便于缩放往返复用。
  if (cssPerWorld <= 0.5) return 1.2;
  if (cssPerWorld <= 1) return 0.6;
  if (cssPerWorld <= 2) return 0.3;
  if (cssPerWorld <= 4) return 0.15;
  return ROUTE_CURVE_FINE_TOLERANCE;
}

export function routeVisualPath(route, tolerance = ROUTE_CURVE_FINE_TOLERANCE, map) {
  const source = route?.points;
  if (!Array.isArray(source)) return emptyPath;
  const sea = route.type === "searoute";
  const water = sea ? seaRouteWater(map) : null;
  const key = water ? route : source;
  let entry = cache.get(key);
  if (entry?.sea !== sea || entry.source !== source || entry.water !== water || (water && (entry.cells !== route.cells || shoreChanged(entry, water)))) {
    if (water) water.visited = new Set();
    try {
      entry = createRouteCurve(source, sea, water, route);
      entry.shoreBuckets = water?.visited;
      entry.shoreRevision = water?.revision;
      cache.set(key, entry);
    } finally {
      if (water) water.visited = null;
    }
  }
  const previous = entry.paths.get(tolerance);
  if (previous) return previous;
  const {cubics, indexes, first, anchors, invalid, duplicates} = entry;
  const points = first ? [first] : [];
  const spans = [];
  for (const {startIndex: index, p0, p1, p2, p3} of cubics) {
    const start = points.length - 1;
    appendCurve(points, p0, p1, p2, p3, tolerance ** 2, MAX_SPLITS);
    for (const sourceIndex of indexes[index]) {
      spans[sourceIndex] = [spans[sourceIndex]?.[0] ?? start, points.length - 1];
    }
  }
  const path = {points, spans, anchors, invalid, duplicates};
  entry.paths.set(tolerance, path);
  return path;
}

function shoreChanged(entry, water) {
  if (entry.shoreRevision === water.revision) return false;
  // 只检查上次绕行和曲线检测访问过的岸区。
  for (const key of entry.shoreBuckets) {
    if (water.changed.get(key) > entry.shoreRevision) return true;
  }
  entry.shoreRevision = water.revision;
  return false;
}

function createRouteCurve(source, sea, water, route) {
  let knots = [];
  let indexes = [];
  let invalid = 0;
  let duplicates = 0;
  for (let index = 0; index < source.length; index++) {
    const point = source[index];
    if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
      invalid++;
      continue;
    }
    const last = knots.at(-1);
    if (last && last[0] === point[0] && last[1] === point[1]) {
      duplicates++;
      indexes[indexes.length - 1] = index;
      continue;
    }
    knots.push(point);
    indexes.push(index);
  }

  const anchors = knots.length;
  let wet = [];
  if (water && knots.length) {
    const resolved = knots.map((point, index) => seaRouteAnchor(water, route, indexes[index], point));
    const navigation = [resolved[0]];
    const spans = [];
    let previous = 0;
    for (let index = 1; index < resolved.length; index++) {
      const a = resolved[previous], next = resolved[index + 1];
      let b = resolved[index];
      let detour = null;
      // 旧水路被陆角占用的中间点无需贴着岸边绕回原位。两端、会合点与接岸段仍保留。
      if (b.originalDry && !b.junction && a.water && next?.water) {
        detour = seaRouteDetour(water, a, next, knots[previous], knots[index + 1]);
        if (detour) {
          b = next;
          index++;
          const following = resolved[index + 1];
          // 绕过陆角后紧接着折返的旁侧水点，可以随这次绕岸一起略过。
          if (detour.length && following?.water && !water.junctions.has(knots[index].join(","))) {
            const shorter = seaRouteDetour(water, a, following, knots[previous], knots[index + 1]);
            const withReturn = seaRouteLegLength(a, detour, b) + seaRouteLegLength(b, [], following);
            if (shorter && seaRouteLegLength(a, shorter, following) + 4 < withReturn) {
              detour = shorter;
              b = following;
              index++;
            }
          }
        }
      }
      const sourceIndexes = indexes.slice(previous, index);
      if (a.water && b.water) {
        detour ??= seaRouteDetour(water, a, b, knots[previous], knots[index]);
        for (const point of detour || []) {
          navigation.push({point, water: true});
          spans.push(sourceIndexes);
        }
      }
      navigation.push(b);
      spans.push(sourceIndexes);
      previous = index;
    }
    knots = navigation.map(({point}) => point);
    wet = navigation.map(({water}) => water);
    indexes = spans;
  } else {
    indexes = indexes.map(index => [index]);
  }
  const cubics = centripetalCatmullRomToBezier(knots, {alpha: sea ? 0.5 : 0.1});
  const scales = new Float64Array(knots.length).fill(1);
  // 一个节点两侧共用切线缩放，避免限制外扩时产生新的折角。
  for (const {startIndex: index, p0, p1, p2, p3} of cubics) {
    scales[index] = Math.min(scales[index], handleScale(p0, p1, p3));
    scales[index + 1] = Math.min(scales[index + 1], handleScale(p3, p2, p0));
  }
  for (const segment of cubics) {
    const {startIndex: index, p0, p1, p2, p3} = segment;
    segment.p1 = towards(p0, p1, scales[index]);
    segment.p2 = towards(p3, p2, scales[index + 1]);
    if (wet[index] && wet[index + 1] && !isSeaRouteCurveClear(water, p0, segment.p1, segment.p2, p3)) {
      let low = 0, high = 1;
      for (let test = 0; test < 5; test++) {
        const scale = (low + high) / 2;
        if (isSeaRouteCurveClear(water, p0, towards(p0, segment.p1, scale), towards(p3, segment.p2, scale), p3)) low = scale;
        else high = scale;
      }
      segment.p1 = towards(p0, segment.p1, low);
      segment.p2 = towards(p3, segment.p2, low);
    }
  }
  return {sea, source, water, cells: route.cells, cubics, indexes, first: knots[0], anchors, invalid, duplicates, paths: new Map()};
}

function handleScale(start, handle, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const hx = handle[0] - start[0];
  const hy = handle[1] - start[1];
  const length = Math.hypot(dx, dy);
  const along = (dx * hx + dy * hy) / length;
  if (along < 0) return 0;
  const across = Math.abs(dx * hy - dy * hx) / length;
  return Math.min(1, length / (2 * along), Math.min(ROUTE_CURVE_MAX_OFFSET, length * 0.25) / across);
}

function appendCurve(points, a, b, c, d, toleranceSquared, splits) {
  const dx = d[0] - a[0];
  const dy = d[1] - a[1];
  const crossB = dx * (b[1] - a[1]) - dy * (b[0] - a[0]);
  const crossC = dx * (c[1] - a[1]) - dy * (c[0] - a[0]);
  const tolerance = toleranceSquared * (dx * dx + dy * dy);
  if (!splits || Math.max(crossB * crossB, crossC * crossC) <= tolerance) {
    points.push(d);
    return;
  }
  const ab = towards(a, b, 0.5), bc = towards(b, c, 0.5), cd = towards(c, d, 0.5);
  const abc = towards(ab, bc, 0.5), bcd = towards(bc, cd, 0.5);
  const middle = towards(abc, bcd, 0.5);
  appendCurve(points, a, ab, abc, middle, toleranceSquared, splits - 1);
  appendCurve(points, middle, bcd, cd, d, toleranceSquared, splits - 1);
}

function towards(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
