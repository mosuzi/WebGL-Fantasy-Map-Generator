import {centripetalCatmullRomToBezier} from "./cubic-path.js";

export const ROUTE_CURVE_MAX_OFFSET = 6;
export const ROUTE_CURVE_FINE_TOLERANCE = 0.075;
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

export function routeVisualPath(route, tolerance = ROUTE_CURVE_FINE_TOLERANCE) {
  const source = route?.points;
  if (!Array.isArray(source)) return emptyPath;
  const sea = route.type === "searoute";
  let entry = cache.get(source);
  if (entry?.sea !== sea) {
    entry = createRouteCurve(source, sea);
    cache.set(source, entry);
  }
  const previous = entry.paths.get(tolerance);
  if (previous) return previous;
  const {cubics, indexes, first, anchors, invalid, duplicates} = entry;
  const points = first ? [first] : [];
  const spans = [];
  for (const {startIndex: index, p0, p1, p2, p3} of cubics) {
    const start = points.length - 1;
    appendCurve(points, p0, p1, p2, p3, tolerance ** 2, MAX_SPLITS);
    spans[indexes[index]] = [start, points.length - 1];
  }
  const path = {points, spans, anchors, invalid, duplicates};
  entry.paths.set(tolerance, path);
  return path;
}

function createRouteCurve(source, sea) {
  const knots = [];
  const indexes = [];
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
  }
  return {sea, cubics, indexes, first: knots[0], anchors: knots.length, invalid, duplicates, paths: new Map()};
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
