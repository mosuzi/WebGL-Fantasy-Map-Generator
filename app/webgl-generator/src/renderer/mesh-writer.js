import {isWorldPoint, pointsNear, worldDistance} from "./geometry.js";
import {screenPixelToClip, worldToNdcPoint, worldToScreenPixel} from "./render-context.js";

export function pushRect(vertices, left, bottom, right, top, color) {
  pushVertex(vertices, left, bottom, color);
  pushVertex(vertices, right, bottom, color);
  pushVertex(vertices, right, top, color);
  pushVertex(vertices, left, bottom, color);
  pushVertex(vertices, right, top, color);
  pushVertex(vertices, left, top, color);
}

export function pushWorldLine(vertices, context, segment, color) {
  pushWorldVertex(vertices, context, segment[0], color);
  pushWorldVertex(vertices, context, segment[1], color);
}

export function pushWorldPolylineMesh(vertices, context, points, color, widthWorld, {closed = false, joinSegments = 10, maxSegmentWorld = Infinity, joinMode = "round", dashWorld = null} = {}) {
  const source = normalizeWorldPathPoints(points);
  if (source.length < 2) return;
  const ringClosed = closed && source.length > 2;
  const path = ringClosed && pointsNear(source[0], source[source.length - 1]) ? source.slice(0, -1) : source;
  const radius = Math.max(0.05, widthWorld / 2);
  const segmentCount = ringClosed ? path.length : path.length - 1;

  if (dashWorld && pushDashedWorldPolylineMesh(vertices, context, path, segmentCount, color, radius, maxSegmentWorld, dashWorld)) return;

  for (let index = 0; index < segmentCount; index++) {
    const start = path[index];
    const end = path[(index + 1) % path.length];
    if (worldDistance(start, end) > maxSegmentWorld) continue;
    pushWorldLineQuad(vertices, context, start, end, color, radius);
  }

  if (joinMode === "none") return;

  for (let index = 0; index < path.length; index++) {
    const isCap = !ringClosed && (index === 0 || index === path.length - 1);
    if (joinMode === "caps" && !isCap) continue;
    pushWorldCircle(vertices, context, path[index], radius, color, isCap ? Math.max(8, joinSegments) : joinSegments);
  }
}

function pushDashedWorldPolylineMesh(vertices, context, path, segmentCount, color, radius, maxSegmentWorld, dash) {
  const dashLength = Math.max(0, Number(dash.dashWorld) || 0);
  const gapLength = Math.max(0, Number(dash.gapWorld) || 0);
  const patternLength = dashLength + gapLength;
  if (!Number.isFinite(patternLength) || patternLength <= 0.0001) return false;

  let phase = 0;
  for (let index = 0; index < segmentCount; index++) {
    const start = path[index];
    const end = path[(index + 1) % path.length];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const length = Math.hypot(dx, dy);
    if (length <= 0.000001 || length > maxSegmentWorld) continue;
    let position = 0;
    while (position < length) {
      const phaseInPattern = phase % patternLength;
      const drawing = phaseInPattern < dashLength;
      const remainingPattern = (drawing ? dashLength : patternLength) - phaseInPattern;
      const step = Math.min(remainingPattern, length - position);
      if (!Number.isFinite(step) || step <= 0.000001) break;
      if (drawing) {
        const from = position / length;
        const to = (position + step) / length;
        pushWorldLineQuad(vertices, context, [start[0] + dx * from, start[1] + dy * from], [start[0] + dx * to, start[1] + dy * to], color, radius);
      }
      position += step;
      phase = (phase + step) % patternLength;
    }
  }
  return true;
}

function normalizeWorldPathPoints(points) {
  const result = [];
  let previous = null;
  for (const point of points || []) {
    if (!isWorldPoint(point)) continue;
    if (previous && pointsNear(previous, point)) continue;
    result.push(point);
    previous = point;
  }
  if (result.length > 2 && pointsNear(result[0], result[result.length - 1])) result[result.length - 1] = result[0];
  return result;
}

function pushWorldLineQuad(vertices, context, start, end, color, halfWidth) {
  if (!isWorldPoint(start) || !isWorldPoint(end)) return;
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  if (length <= 0.000001) return;
  const nx = -dy / length;
  const ny = dx / length;
  const a = [start[0] + nx * halfWidth, start[1] + ny * halfWidth];
  const b = [end[0] + nx * halfWidth, end[1] + ny * halfWidth];
  const c = [end[0] - nx * halfWidth, end[1] - ny * halfWidth];
  const d = [start[0] - nx * halfWidth, start[1] - ny * halfWidth];
  pushWorldVertex(vertices, context, a, color);
  pushWorldVertex(vertices, context, b, color);
  pushWorldVertex(vertices, context, c, color);
  pushWorldVertex(vertices, context, a, color);
  pushWorldVertex(vertices, context, c, color);
  pushWorldVertex(vertices, context, d, color);
}

function pushWorldCircle(vertices, context, center, radius, color, segments = 10) {
  if (!isWorldPoint(center)) return;
  const count = Math.max(6, Math.round(segments));
  for (let index = 0; index < count; index++) {
    const a = (index / count) * Math.PI * 2;
    const b = ((index + 1) / count) * Math.PI * 2;
    pushWorldVertex(vertices, context, center, color);
    pushWorldVertex(vertices, context, [center[0] + Math.cos(a) * radius, center[1] + Math.sin(a) * radius], color);
    pushWorldVertex(vertices, context, [center[0] + Math.cos(b) * radius, center[1] + Math.sin(b) * radius], color);
  }
}

export function pushScreenPolyline(vertices, context, points, color, widthPx, dash = null) {
  const screenPoints = points
    .map(point => worldToScreenPixel(context, point))
    .filter((point, index, list) => index === 0 || Math.hypot(point.x - list[index - 1].x, point.y - list[index - 1].y) > 0.5);
  if (screenPoints.length < 2) return;
  if (dash) {
    pushDashedScreenPolyline(vertices, context, screenPoints, color, widthPx, dash);
    return;
  }
  pushSolidScreenPolyline(vertices, context, screenPoints, color, widthPx);
}

export function pushVariableScreenPolyline(vertices, context, points, widths, color, colors = null) {
  const screenPoints = [];
  const screenWidths = [];
  const screenColors = Array.isArray(colors) ? [] : null;
  for (let index = 0; index < points.length; index++) {
    const screenPoint = worldToScreenPixel(context, points[index]);
    const previous = screenPoints[screenPoints.length - 1];
    if (previous && Math.hypot(screenPoint.x - previous.x, screenPoint.y - previous.y) <= 0.5) continue;
    screenPoints.push(screenPoint);
    screenWidths.push(widths[index] || widths[widths.length - 1] || 1);
    if (screenColors) screenColors.push(colors[index] || colors[colors.length - 1] || color);
  }
  if (screenPoints.length < 2) return;
  pushVariableSolidScreenPolyline(vertices, context, screenPoints, screenWidths, color, screenColors);
}

function pushDashedScreenPolyline(vertices, context, screenPoints, color, widthPx, dash) {
  const dashPx = Math.max(0, Number(dash.dashPx) || 0);
  const gapPx = Math.max(0, Number(dash.gapPx) || 0);
  const pattern = dashPx + gapPx;
  if (!Number.isFinite(pattern) || pattern <= 0.5) {
    pushSolidScreenPolyline(vertices, context, screenPoints, color, widthPx);
    return;
  }
  const maxPieces = Math.max(1, Math.round(Number(dash.maxPieces) || 20000));
  let pieces = 0;
  let phase = 0;
  for (let index = 0; index < screenPoints.length - 1; index++) {
    const start = screenPoints[index];
    const end = screenPoints[index + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length <= 0.5) continue;
    let position = 0;
    while (position < length) {
      if (pieces >= maxPieces) return;
      const phaseInPattern = phase % pattern;
      const drawing = phaseInPattern < dashPx;
      const remainingPattern = (drawing ? dashPx : pattern) - phaseInPattern;
      const step = Math.min(remainingPattern, length - position);
      if (!Number.isFinite(step) || step <= 0.0001) break;
      if (drawing && step > 0.5) {
        pushSolidScreenPolyline(vertices, context, [
          interpolateScreenPoint(start, dx, dy, position / length),
          interpolateScreenPoint(start, dx, dy, (position + step) / length)
        ], color, widthPx);
        pieces++;
      }
      position += step;
      phase += step;
    }
  }
}

function pushSolidScreenPolyline(vertices, context, screenPoints, color, widthPx) {
  const half = widthPx / 2;
  const left = [];
  const right = [];

  for (let index = 0; index < screenPoints.length; index++) {
    const previous = screenPoints[Math.max(0, index - 1)];
    const current = screenPoints[index];
    const next = screenPoints[Math.min(screenPoints.length - 1, index + 1)];
    const before = normalizeScreenVector(current.x - previous.x, current.y - previous.y);
    const after = normalizeScreenVector(next.x - current.x, next.y - current.y);
    const blended = normalizeScreenVector(before.x + after.x, before.y + after.y);
    const tangent = index === 0 ? after : index === screenPoints.length - 1 ? before : (blended.x || blended.y ? blended : after);
    const normalBefore = normalForVector(before.x || after.x, before.y || after.y);
    const normalAfter = normalForVector(after.x || before.x, after.y || before.y);
    const miter = normalForVector(tangent.x, tangent.y);
    const dot = Math.max(0.3, Math.abs(miter.x * normalAfter.x + miter.y * normalAfter.y));
    const length = Math.min(half / dot, half * 2.6);
    const capShift = index === 0 ? -half : index === screenPoints.length - 1 ? half : 0;
    const capBase = {
      x: current.x + tangent.x * capShift,
      y: current.y + tangent.y * capShift
    };
    const normal = index === 0 ? normalAfter : index === screenPoints.length - 1 ? normalBefore : miter;
    left.push({x: capBase.x + normal.x * length, y: capBase.y + normal.y * length});
    right.push({x: capBase.x - normal.x * length, y: capBase.y - normal.y * length});
  }

  for (let index = 0; index < left.length - 1; index++) {
    pushScreenTriangle(vertices, context, left[index], left[index + 1], right[index + 1], color);
    pushScreenTriangle(vertices, context, left[index], right[index + 1], right[index], color);
  }
}

function pushVariableSolidScreenPolyline(vertices, context, screenPoints, widthPxByPoint, color, colors = null) {
  const left = [];
  const right = [];

  for (let index = 0; index < screenPoints.length; index++) {
    const half = Math.max(0.5, widthPxByPoint[index] / 2);
    const previous = screenPoints[Math.max(0, index - 1)];
    const current = screenPoints[index];
    const next = screenPoints[Math.min(screenPoints.length - 1, index + 1)];
    const before = normalizeScreenVector(current.x - previous.x, current.y - previous.y);
    const after = normalizeScreenVector(next.x - current.x, next.y - current.y);
    const blended = normalizeScreenVector(before.x + after.x, before.y + after.y);
    const tangent = index === 0 ? after : index === screenPoints.length - 1 ? before : (blended.x || blended.y ? blended : after);
    const normalBefore = normalForVector(before.x || after.x, before.y || after.y);
    const normalAfter = normalForVector(after.x || before.x, after.y || before.y);
    const miter = normalForVector(tangent.x, tangent.y);
    const dot = Math.max(0.3, Math.abs(miter.x * normalAfter.x + miter.y * normalAfter.y));
    const length = Math.min(half / dot, half * 2.6);
    const capShift = index === 0 ? -half : index === screenPoints.length - 1 ? half : 0;
    const capBase = {
      x: current.x + tangent.x * capShift,
      y: current.y + tangent.y * capShift
    };
    const normal = index === 0 ? normalAfter : index === screenPoints.length - 1 ? normalBefore : miter;
    left.push({x: capBase.x + normal.x * length, y: capBase.y + normal.y * length});
    right.push({x: capBase.x - normal.x * length, y: capBase.y - normal.y * length});
  }

  for (let index = 0; index < left.length - 1; index++) {
    const startColor = colors?.[index] || color;
    const endColor = colors?.[index + 1] || startColor;
    pushScreenGradientTriangle(vertices, context, left[index], left[index + 1], right[index + 1], startColor, endColor, endColor);
    pushScreenGradientTriangle(vertices, context, left[index], right[index + 1], right[index], startColor, endColor, startColor);
  }
}

function interpolateScreenPoint(start, dx, dy, t) {
  return {
    x: start.x + dx * t,
    y: start.y + dy * t
  };
}

export function pushScreenTriangle(vertices, context, a, b, c, color) {
  pushScreenVertex(vertices, context, a, color);
  pushScreenVertex(vertices, context, b, color);
  pushScreenVertex(vertices, context, c, color);
}

function pushScreenGradientTriangle(vertices, context, a, b, c, colorA, colorB, colorC) {
  pushScreenVertex(vertices, context, a, colorA);
  pushScreenVertex(vertices, context, b, colorB);
  pushScreenVertex(vertices, context, c, colorC);
}

function pushScreenVertex(vertices, context, point, color) {
  const clip = screenPixelToClip(context, point);
  pushVertex(vertices, clip[0], clip[1], color);
}

function normalizeScreenVector(x, y) {
  const length = Math.hypot(x, y);
  if (length <= 0.000001) return {x: 0, y: 0};
  return {x: x / length, y: y / length};
}

function normalForVector(x, y) {
  const vector = normalizeScreenVector(x, y);
  return {x: -vector.y, y: vector.x};
}

export function pushVertex(vertices, x, y, color) {
  vertices.push(x, y, color[0], color[1], color[2], color[3]);
}

export function writeVertex(vertices, offset, x, y, color) {
  vertices[offset++] = x;
  vertices[offset++] = y;
  vertices[offset++] = color[0];
  vertices[offset++] = color[1];
  vertices[offset++] = color[2];
  vertices[offset++] = color[3];
  return offset;
}

export function pushWorldVertex(vertices, context, point, color) {
  const [x, y] = worldToNdcPoint(context, point);
  pushVertex(vertices, x, y, color);
}
