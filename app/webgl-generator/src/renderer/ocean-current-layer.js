import {sampleOceanCurrent} from "../generator/ocean-currents.js";
import {pushWorldPolylineMesh, pushWorldVertex} from "./mesh-writer.js";

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
    const widthWorld = oceanCurrentWidth(current.strength, {highlighted});
    const color = highlighted ? CURRENT_HIGHLIGHT_COLOR : CURRENT_COLOR;
    const before = vertices.length;
    pushWorldPolylineMesh(vertices, context, points, color, widthWorld, {joinSegments: 7});
    pushArrowhead(vertices, context, points, 0.58, color, widthWorld);
    pushArrowhead(vertices, context, points, 0.84, color, widthWorld);
    if (vertices.length === before) continue;
    stats.minWidth = stats.currents ? Math.min(stats.minWidth, widthWorld) : widthWorld;
    stats.currents++;
    stats.arrowheads += 2;
    stats.highlighted += highlighted ? 1 : 0;
    stats.maxWidth = Math.max(stats.maxWidth, widthWorld);
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
  return Math.round((0.65 + normalized * 1.45) * (highlighted ? 1.45 : 1) * 1000) / 1000;
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

function pushArrowhead(vertices, context, points, ratio, color, widthWorld) {
  const index = Math.max(1, Math.min(points.length - 1, Math.round((points.length - 1) * ratio)));
  const tip = points[index];
  const previous = points[index - 1];
  const dx = tip[0] - previous[0];
  const dy = tip[1] - previous[1];
  const length = Math.hypot(dx, dy);
  if (length <= 0.0001) return;
  const tx = dx / length;
  const ty = dy / length;
  const nx = -ty;
  const ny = tx;
  const arrowLength = 2.3 + widthWorld * 4.2;
  const halfWidth = 1.1 + widthWorld * 1.8;
  const base = [tip[0] - tx * arrowLength, tip[1] - ty * arrowLength];
  pushWorldVertex(vertices, context, tip, color);
  pushWorldVertex(vertices, context, [base[0] + nx * halfWidth, base[1] + ny * halfWidth], color);
  pushWorldVertex(vertices, context, [base[0] - nx * halfWidth, base[1] - ny * halfWidth], color);
}
