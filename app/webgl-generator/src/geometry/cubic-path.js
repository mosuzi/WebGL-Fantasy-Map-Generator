const EPSILON = 1e-9;

export const RIVER_VISUAL_CURVE_KIND = "centripetal-catmull-rom-cubic";
export const RIVER_VISUAL_CURVE_VERSION = 1;

export function createRiverVisualCurveDescriptor() {
  return {
    kind: RIVER_VISUAL_CURVE_KIND,
    version: RIVER_VISUAL_CURVE_VERSION,
    alpha: 0.5,
    samplingVersion: 1
  };
}

export function isSharedCubicCurve(value) {
  return value?.kind === RIVER_VISUAL_CURVE_KIND && Number(value?.version) === RIVER_VISUAL_CURVE_VERSION;
}

export function normalizeRiverVisualCurve(value) {
  return isSharedCubicCurve(value) ? createRiverVisualCurveDescriptor() : null;
}

export function centripetalCatmullRomToBezier(points, {alpha = 0.5} = {}) {
  const source = normalizePoints(points);
  if (source.length < 2) return [];
  const segments = [];
  for (let index = 0; index < source.length - 1; index++) {
    const p1 = source[index];
    const p2 = source[index + 1];
    const p0 = index > 0 ? source[index - 1] : reflectPoint(p1, p2);
    const p3 = index + 2 < source.length ? source[index + 2] : reflectPoint(p2, p1);
    const d1 = parameterDistance(p0, p1, alpha);
    const d2 = parameterDistance(p1, p2, alpha);
    const d3 = parameterDistance(p2, p3, alpha);
    const firstTangent = segmentTangent(p0, p1, p2, d1, d2, d2);
    const secondTangent = segmentTangent(p1, p2, p3, d2, d3, d2);
    const coincident = distance(p1, p2) <= EPSILON;
    segments.push({
      startIndex: index,
      p0: [...p1],
      p1: coincident ? [...p1] : [p1[0] + firstTangent[0] / 3, p1[1] + firstTangent[1] / 3],
      p2: coincident ? [...p2] : [p2[0] - secondTangent[0] / 3, p2[1] - secondTangent[1] / 3],
      p3: [...p2]
    });
  }
  return segments;
}

export function evaluateCubicBezier(segment, amount) {
  const t = clamp(Number(amount), 0, 1);
  const inverse = 1 - t;
  const a = inverse ** 3;
  const b = 3 * inverse ** 2 * t;
  const c = 3 * inverse * t ** 2;
  const d = t ** 3;
  return [
    segment.p0[0] * a + segment.p1[0] * b + segment.p2[0] * c + segment.p3[0] * d,
    segment.p0[1] * a + segment.p1[1] * b + segment.p2[1] * c + segment.p3[1] * d
  ];
}

export function sampleCubicBezierPath(segments, {values = null, maxSegmentLength = 4, minSamples = 4, maxSamples = 64} = {}) {
  if (!Array.isArray(segments) || !segments.length) return {points: [], values: Array.isArray(values) ? [] : null, spans: []};
  const sampledPoints = [];
  const sampledValues = Array.isArray(values) ? [] : null;
  const sampledSpans = [];
  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
    const segment = segments[segmentIndex];
    const estimate = controlPolygonLength(segment);
    const samples = clamp(Math.ceil(estimate / Math.max(0.25, Number(maxSegmentLength) || 4)), minSamples, maxSamples);
    for (let sample = segmentIndex === 0 ? 0 : 1; sample <= samples; sample++) {
      const amount = sample / samples;
      if (sampledPoints.length) {
        sampledSpans.push({sourceSegmentIndex: segment.startIndex, startAmount: (sample - 1) / samples, endAmount: amount});
      }
      sampledPoints.push(evaluateCubicBezier(segment, amount));
      if (sampledValues) sampledValues.push(interpolateValue(values[segment.startIndex], values[segment.startIndex + 1], amount));
    }
  }
  return {points: sampledPoints, values: sampledValues, spans: sampledSpans};
}

export function sampleCentripetalCatmullRom(points, options = {}) {
  const source = normalizePoints(points);
  if (source.length < 2) return {points: source, values: Array.isArray(options.values) ? [...options.values] : null, spans: [], segments: []};
  const segments = centripetalCatmullRomToBezier(source, options);
  return {...sampleCubicBezierPath(segments, options), segments};
}

export function sampledPathLength(points) {
  let length = 0;
  for (let index = 1; index < (points?.length || 0); index++) {
    length += Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]);
  }
  return length;
}

function normalizePoints(points) {
  return (points || []).filter(point => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]))
    .map(point => [Number(point[0]), Number(point[1])]);
}

function parameterDistance(a, b, alpha) {
  return Math.max(EPSILON, Math.hypot(b[0] - a[0], b[1] - a[1]) ** clamp(Number(alpha), 0, 1));
}

function segmentTangent(previous, point, next, beforeSpan, afterSpan, segmentSpan) {
  const combined = Math.max(EPSILON, beforeSpan + afterSpan);
  return [0, 1].map(axis => segmentSpan * (
    (point[axis] - previous[axis]) / Math.max(EPSILON, beforeSpan)
    - (next[axis] - previous[axis]) / combined
    + (next[axis] - point[axis]) / Math.max(EPSILON, afterSpan)
  ));
}

function reflectPoint(origin, other) {
  return [origin[0] * 2 - other[0], origin[1] * 2 - other[1]];
}

function controlPolygonLength(segment) {
  return distance(segment.p0, segment.p1) + distance(segment.p1, segment.p2) + distance(segment.p2, segment.p3);
}

function distance(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function interpolateValue(left, right, amount) {
  if (Array.isArray(left) || Array.isArray(right)) {
    const a = Array.isArray(left) ? left : right;
    const b = Array.isArray(right) ? right : left;
    return a.map((value, index) => interpolateNumber(value, b[index], amount));
  }
  return interpolateNumber(left, right, amount);
}

function interpolateNumber(left, right, amount) {
  const a = Number(left);
  const b = Number(right);
  if (!Number.isFinite(a) && !Number.isFinite(b)) return 0;
  if (!Number.isFinite(a)) return b;
  if (!Number.isFinite(b)) return a;
  return a + (b - a) * amount;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
