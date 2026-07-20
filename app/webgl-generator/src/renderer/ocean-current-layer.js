import {sampleOceanCurrent} from "../generator/ocean-currents.js";
import {pushWorldVertex} from "./mesh-writer.js";

const CURRENT_COLOR = Object.freeze([0.34, 0.77, 0.96, 0.58]);
const CURRENT_HIGHLIGHT_COLOR = Object.freeze([1, 0.78, 0.28, 0.92]);

export function pushOceanCurrentLayer(vertices, context, map, visibility = {}, highlightedIds = new Set()) {
  if (visibility.oceanCurrents === false) return emptyOceanCurrentLayerStats();
  const currents = map?.oceanCurrents?.currents || [];
  const highlights = highlightedIds instanceof Set ? highlightedIds : new Set(highlightedIds || []);
  const stats = emptyOceanCurrentLayerStats();
  const layerStart = vertices.length;
  for (const current of currents) {
    const points = sampleOceanCurrent(current, 28);
    if (points.length < 2) continue;
    const highlighted = highlights.has(String(current.id));
    const arrowStyle = oceanCurrentArrowStyle(current.strength, {highlighted});
    const color = highlighted ? CURRENT_HIGHLIGHT_COLOR : CURRENT_COLOR;
    const before = vertices.length;
    pushTaperedArrowMesh(vertices, context, points, color, arrowStyle);
    if (vertices.length === before) continue;
    stats.minWidth = stats.currents ? Math.min(stats.minWidth, arrowStyle.bodyWidth) : arrowStyle.bodyWidth;
    stats.currents++;
    stats.arrowheads++;
    stats.highlighted += highlighted ? 1 : 0;
    stats.maxWidth = Math.max(stats.maxWidth, arrowStyle.bodyWidth);
  }
  stats.vertexCount = (vertices.length - layerStart) / 6;
  if (!stats.currents) {
    stats.minWidth = 0;
    stats.maxWidth = 0;
  }
  return stats;
}

export function oceanCurrentWidth(strength, {highlighted = false} = {}) {
  const normalized = Math.max(0.05, Math.min(1, Number(strength) || 0.5));
  return round((1 + normalized * 3) * (highlighted ? 1.3 : 1));
}

export function oceanCurrentArrowStyle(strength, {highlighted = false} = {}) {
  const bodyWidth = oceanCurrentWidth(strength, {highlighted});
  return Object.freeze({
    bodyWidth,
    tailWidth: round(Math.max(0.08, bodyWidth * 0.06)),
    headLength: round(10 + bodyWidth * 5.2),
    headWidth: round(5 + bodyWidth * 3.1)
  });
}

export function oceanCurrentBounds(current) {
  const points = sampleOceanCurrent(current, 32);
  if (!points.length) return null;
  return {
    minX: Math.min(...points.map(point => point[0])),
    minY: Math.min(...points.map(point => point[1])),
    maxX: Math.max(...points.map(point => point[0])),
    maxY: Math.max(...points.map(point => point[1]))
  };
}

export function emptyOceanCurrentLayerStats() {
  return {currents: 0, arrowheads: 0, highlighted: 0, vertexCount: 0, minWidth: 0, maxWidth: 0};
}

function pushTaperedArrowMesh(vertices, context, points, color, style) {
  if (points.length < 3) return;
  const {bodyPoints, tip} = splitArrowPath(points, style.headLength);
  if (bodyPoints.length < 2) return;
  const sections = bodyPoints.map((point, index) => arrowBodySection(bodyPoints, index, style));
  for (let index = 0; index < sections.length - 1; index++) {
    const start = sections[index];
    const end = sections[index + 1];
    pushTriangle(vertices, context, start.left, end.left, end.right, color);
    pushTriangle(vertices, context, start.left, end.right, start.right, color);
  }

  const base = bodyPoints.at(-1);
  const tangent = normalizedDirection(points.at(-2), tip);
  if (!tangent) return;
  const normal = [-tangent[1], tangent[0]];
  const headHalfWidth = style.headWidth / 2;
  pushTriangle(
    vertices,
    context,
    tip,
    [base[0] + normal[0] * headHalfWidth, base[1] + normal[1] * headHalfWidth],
    [base[0] - normal[0] * headHalfWidth, base[1] - normal[1] * headHalfWidth],
    color
  );
}

function splitArrowPath(points, headLength) {
  const tip = points.at(-1);
  let remaining = headLength;
  for (let index = points.length - 1; index >= 1; index--) {
    const end = points[index];
    const start = points[index - 1];
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    if (length <= 0.0001) continue;
    if (remaining <= length && index >= 2) {
      const ratio = remaining / length;
      const base = [end[0] + (start[0] - end[0]) * ratio, end[1] + (start[1] - end[1]) * ratio];
      return {bodyPoints: [...points.slice(0, index), base], tip};
    }
    remaining -= length;
  }
  return {bodyPoints: points.slice(0, 2), tip};
}

function arrowBodySection(points, index, style) {
  const point = points[index];
  const previous = points[Math.max(0, index - 1)];
  const next = points[Math.min(points.length - 1, index + 1)];
  const tangent = normalizedDirection(previous, next) || [1, 0];
  const normal = [-tangent[1], tangent[0]];
  const progress = index / Math.max(1, points.length - 1);
  const eased = Math.sin(progress * Math.PI / 2);
  const width = style.tailWidth + (style.bodyWidth - style.tailWidth) * eased;
  const halfWidth = width / 2;
  return {
    left: [point[0] + normal[0] * halfWidth, point[1] + normal[1] * halfWidth],
    right: [point[0] - normal[0] * halfWidth, point[1] - normal[1] * halfWidth]
  };
}

function normalizedDirection(start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  return length > 0.0001 ? [dx / length, dy / length] : null;
}

function pushTriangle(vertices, context, a, b, c, color) {
  pushWorldVertex(vertices, context, a, color);
  pushWorldVertex(vertices, context, b, color);
  pushWorldVertex(vertices, context, c, color);
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
