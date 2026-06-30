export function worldDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function normalizeWorldVector(x, y) {
  const length = Math.hypot(x, y);
  if (length <= 0.000001) return {x: 0, y: 0};
  return {x: x / length, y: y / length};
}

export function interpolatePoint(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export function midpoint(a, b) {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

export function pointsNear(a, b) {
  if (!isWorldPoint(a) || !isWorldPoint(b)) return false;
  return Math.hypot(a[0] - b[0], a[1] - b[1]) <= 0.001;
}

export function polygonArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index++) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area / 2;
}

export function segmentsIntersect(a, b, c, d) {
  const abC = orient(a, b, c);
  const abD = orient(a, b, d);
  const cdA = orient(c, d, a);
  const cdB = orient(c, d, b);
  if (Math.abs(abC) <= 0.000001 && pointOnSegment(c, a, b)) return true;
  if (Math.abs(abD) <= 0.000001 && pointOnSegment(d, a, b)) return true;
  if (Math.abs(cdA) <= 0.000001 && pointOnSegment(a, c, d)) return true;
  if (Math.abs(cdB) <= 0.000001 && pointOnSegment(b, c, d)) return true;
  return (abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0);
}

function orient(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function pointOnSegment(point, a, b) {
  return point[0] >= Math.min(a[0], b[0]) - 0.000001 &&
    point[0] <= Math.max(a[0], b[0]) + 0.000001 &&
    point[1] >= Math.min(a[1], b[1]) - 0.000001 &&
    point[1] <= Math.max(a[1], b[1]) + 0.000001;
}

export function smoothWorldPath(points, options) {
  return smoothWorldPathWithValues(points, null, options).points;
}

export function smoothWorldPathAndColors(points, colors, {iterations = 1, factor = 0.2} = {}) {
  if (points.length < 3 || iterations <= 0) return {
    points,
    colors
  };

  const closed = pointsNear(points[0], points[points.length - 1]);
  let resultPoints = closed ? points.slice(0, -1) : [...points];
  let resultColors = closed ? colors.slice(0, -1) : [...colors];
  if (resultPoints.length < 3) return {points, colors};

  for (let index = 0; index < iterations; index++) {
    const result = chaikinWorldPathAndColors(resultPoints, resultColors, factor, closed);
    resultPoints = result.points;
    resultColors = result.colors;
    if (resultPoints.length < 3) break;
  }

  if (closed) {
    resultPoints = [...resultPoints, resultPoints[0]];
    resultColors = [...resultColors, resultColors[0]];
  }

  return {
    points: resultPoints,
    colors: resultColors
  };
}

function chaikinWorldPathAndColors(points, colors, factor, closed) {
  const nextPoints = [];
  const nextColors = [];
  const count = points.length;
  if (!closed) {
    nextPoints.push(points[0]);
    nextColors.push(colors[0]);
  }

  const segments = closed ? count : count - 1;
  for (let index = 0; index < segments; index++) {
    const a = points[index];
    const b = points[(index + 1) % count];
    const colorA = colors[index];
    const colorB = colors[(index + 1) % count];
    nextPoints.push(interpolateWorldPoint(a, b, factor));
    nextPoints.push(interpolateWorldPoint(a, b, 1 - factor));
    nextColors.push(mix(colorA, colorB, factor));
    nextColors.push(mix(colorA, colorB, 1 - factor));
  }

  if (!closed) {
    nextPoints.push(points[count - 1]);
    nextColors.push(colors[count - 1]);
  }

  return {points: nextPoints, colors: nextColors};
}

export function smoothWorldPathWithValues(points, values, {iterations = 1, factor = 0.2} = {}) {
  const sourcePoints = (points || []).filter(isWorldPoint);
  if (sourcePoints.length < 3 || iterations <= 0) return {
    points: sourcePoints,
    widths: values || []
  };

  let resultPoints = sourcePoints.map(point => Array.isArray(point) ? [...point] : point);
  let resultValues = Array.isArray(values) ? [...values] : null;

  for (let index = 0; index < iterations; index++) {
    const result = chaikinOpenWorldPath(resultPoints, resultValues, factor);
    resultPoints = result.points;
    resultValues = result.values;
    if (resultPoints.length < 3) break;
  }

  return {
    points: resultPoints,
    widths: resultValues || values || []
  };
}

function chaikinOpenWorldPath(points, values, factor) {
  const nextPoints = [points[0]];
  const nextValues = values ? [values[0]] : null;

  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index];
    const b = points[index + 1];
    nextPoints.push(interpolateWorldPoint(a, b, factor));
    nextPoints.push(interpolateWorldPoint(a, b, 1 - factor));
    if (nextValues) {
      nextValues.push(interpolateValue(values[index], values[index + 1], factor));
      nextValues.push(interpolateValue(values[index], values[index + 1], 1 - factor));
    }
  }

  nextPoints.push(points[points.length - 1]);
  if (nextValues) nextValues.push(values[values.length - 1]);
  return {points: nextPoints, values: nextValues};
}

export function interpolateWorldPoint(a, b, t) {
  const point = interpolatePoint(a, b, t);
  if (Number.isFinite(a?.[2]) || Number.isFinite(b?.[2])) point[2] = interpolateValue(a?.[2], b?.[2], t);
  return point;
}

function interpolateValue(a, b, t) {
  const av = Number.isFinite(a) ? a : b;
  const bv = Number.isFinite(b) ? b : a;
  if (!Number.isFinite(av) && !Number.isFinite(bv)) return 0;
  if (!Number.isFinite(av)) return bv;
  if (!Number.isFinite(bv)) return av;
  return av + (bv - av) * t;
}

export function isWorldPoint(point) {
  return Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]);
}

export function mix(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
    1
  ];
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
