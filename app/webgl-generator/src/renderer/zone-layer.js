import {isWorldPoint} from "./geometry.js";
import {pushWorldPolylineMesh, pushWorldVertex} from "./mesh-writer.js";

const MAX_ZONE_PATTERN_CELLS = 720;

const ZONE_STYLE_BY_TYPE = Object.freeze({
  Warzone: Object.freeze({pattern: "cross", color: "#d65a42", alpha: 0.62}),
  Invasion: Object.freeze({pattern: "diagonal", color: "#d98238", alpha: 0.58}),
  Rebels: Object.freeze({pattern: "cross", color: "#c79735", alpha: 0.55}),
  Proselytism: Object.freeze({pattern: "dots", color: "#9b76d6", alpha: 0.52}),
  Crusade: Object.freeze({pattern: "cross", color: "#b48be2", alpha: 0.54}),
  Disease: Object.freeze({pattern: "dots", color: "#668f5a", alpha: 0.52}),
  Disaster: Object.freeze({pattern: "diagonal", color: "#b26852", alpha: 0.5}),
  Eruption: Object.freeze({pattern: "cross", color: "#c85b38", alpha: 0.56}),
  Avalanche: Object.freeze({pattern: "diagonal", color: "#c4ced2", alpha: 0.54}),
  Fault: Object.freeze({pattern: "diagonal", color: "#8d7d70", alpha: 0.54}),
  Flood: Object.freeze({pattern: "dots", color: "#4e9ac9", alpha: 0.5}),
  Tsunami: Object.freeze({pattern: "cross", color: "#4a9dbe", alpha: 0.52})
});

const HATCH_PATTERN_BY_ID = Object.freeze({
  hatch1: "diagonal",
  hatch2: "diagonal",
  hatch3: "cross",
  hatch5: "diagonal",
  hatch6: "cross",
  hatch7: "cross",
  hatch12: "dots",
  hatch13: "dots"
});

export const ZONE_PATTERN_OPTIONS = Object.freeze([
  Object.freeze({value: "diagonal", label: "斜线"}),
  Object.freeze({value: "cross", label: "交叉线"}),
  Object.freeze({value: "dots", label: "圆点阵列"})
]);

export function pushZoneTextureLayer(vertices, context, map, visibility = {}) {
  if (visibility.zones === false) return;
  const zones = map?.zones?.zones || map?.pack?.zones || [];
  if (!zones.length) return;

  for (const zone of zones) {
    if (!zone || zone.hidden) continue;
    pushZoneTexture(vertices, context, map, zone);
  }
}

function pushZoneTexture(vertices, context, map, zone) {
  const style = resolveZoneStyle(zone);
  const cells = zonePatternCells(zone.cells || []);
  const strokeColor = [...style.color.slice(0, 3), Math.min(0.86, Math.max(0.72, style.color[3] + 0.22))];
  const pattern = normalizeZonePattern(zone.pattern || style.pattern);

  for (const cell of cells) {
    const polygon = packCellPolygon(map, cell);
    if (polygon.length < 3) continue;
    pushZoneCellPattern(vertices, context, polygon, pattern, strokeColor);
  }
}

function zonePatternCells(cells) {
  const valid = cells.filter(Number.isInteger);
  if (valid.length <= MAX_ZONE_PATTERN_CELLS) return valid;
  const stride = valid.length / MAX_ZONE_PATTERN_CELLS;
  const sampled = [];
  for (let index = 0; sampled.length < MAX_ZONE_PATTERN_CELLS && index < valid.length; index += stride) sampled.push(valid[Math.floor(index)]);
  return sampled;
}

function pushZoneCellPattern(vertices, context, polygon, pattern, color) {
  const bounds = polygonBounds(polygon);
  const center = polygonCentroid(polygon);
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const minor = Math.min(width, height);
  const length = Math.min(Math.max(width, height) * 0.68, Math.min(width + height, 18));
  const stroke = Math.max(0.32, Math.min(0.82, minor * 0.09));

  if (pattern === "dots") {
    pushDotPattern(vertices, context, center, minor, color);
    return;
  }

  pushDiagonalPattern(vertices, context, center, length, stroke, minor, color, 1, 1);
  if (pattern === "cross") pushDiagonalPattern(vertices, context, center, length, stroke, minor, color, 1, -1);
}

function pushDiagonalPattern(vertices, context, center, length, stroke, minor, color, dx, dy) {
  const spacing = Math.max(2.1, Math.min(4.2, minor * 0.32));
  const offsets = [-spacing, 0, spacing];
  for (const offset of offsets) pushPatternSegment(vertices, context, center, length, stroke, color, dx, dy, offset);
}

function pushPatternSegment(vertices, context, center, length, stroke, color, dx, dy, offset = 0) {
  const normalLength = Math.hypot(dx, dy) || 1;
  const normal = [-dy / normalLength, dx / normalLength];
  const shiftedCenter = [center[0] + normal[0] * offset, center[1] + normal[1] * offset];
  const scale = length / Math.hypot(dx, dy) / 2;
  const a = [shiftedCenter[0] - dx * scale, shiftedCenter[1] - dy * scale];
  const b = [shiftedCenter[0] + dx * scale, shiftedCenter[1] + dy * scale];
  pushWorldPolylineMesh(vertices, context, [a, b], color, stroke, {joinMode: "caps", joinSegments: 6});
}

function pushDotPattern(vertices, context, center, minor, color) {
  const spacing = Math.max(2.2, Math.min(4, minor * 0.34));
  const radius = Math.max(0.48, Math.min(0.92, minor * 0.105));
  pushZoneDot(vertices, context, center, radius, color);
  pushZoneDot(vertices, context, [center[0] - spacing, center[1] - spacing * 0.55], radius, color);
  pushZoneDot(vertices, context, [center[0] + spacing, center[1] + spacing * 0.55], radius, color);
}

function pushZoneDot(vertices, context, center, radius, color) {
  const points = [
    [center[0], center[1] - radius],
    [center[0] + radius, center[1]],
    [center[0], center[1] + radius],
    [center[0] - radius, center[1]]
  ];
  pushWorldVertex(vertices, context, center, color);
  pushWorldVertex(vertices, context, points[0], color);
  pushWorldVertex(vertices, context, points[1], color);
  pushWorldVertex(vertices, context, center, color);
  pushWorldVertex(vertices, context, points[1], color);
  pushWorldVertex(vertices, context, points[2], color);
  pushWorldVertex(vertices, context, center, color);
  pushWorldVertex(vertices, context, points[2], color);
  pushWorldVertex(vertices, context, points[3], color);
  pushWorldVertex(vertices, context, center, color);
  pushWorldVertex(vertices, context, points[3], color);
  pushWorldVertex(vertices, context, points[0], color);
}

function resolveZoneStyle(zone) {
  const base = ZONE_STYLE_BY_TYPE[zone.type] || ZONE_STYLE_BY_TYPE.Disaster;
  const pattern = normalizeZonePattern(zone.pattern || patternFromLegacyColor(zone.color) || base.pattern);
  const color = hexToRgba(zone.hexColor || zone.fill || (isHexColor(zone.color) ? zone.color : base.color), base.alpha);
  return {pattern, color};
}

function normalizeZonePattern(value) {
  return ZONE_PATTERN_OPTIONS.some(option => option.value === value) ? value : "diagonal";
}

function patternFromLegacyColor(color) {
  const match = /^url\(#([^)]+)\)$/i.exec(String(color || "").trim());
  return match ? HATCH_PATTERN_BY_ID[match[1]] : null;
}

function packCellPolygon(map, cell) {
  const vertexIds = map?.pack?.cells?.v?.[cell];
  const vertices = map?.pack?.vertices?.p;
  if (!Array.isArray(vertexIds) || vertexIds.length < 3 || !vertices) return [];
  return vertexIds.map(vertex => vertices[vertex]).filter(isWorldPoint);
}

function polygonCentroid(points) {
  const sum = points.reduce((total, point) => [total[0] + point[0], total[1] + point[1]], [0, 0]);
  return [sum[0] / points.length, sum[1] / points.length];
}

function polygonBounds(points) {
  return points.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point[0]),
    minY: Math.min(bounds.minY, point[1]),
    maxX: Math.max(bounds.maxX, point[0]),
    maxY: Math.max(bounds.maxY, point[1])
  }), {minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity});
}

function isHexColor(color) {
  return /^#?[0-9a-f]{6}$/i.test(String(color || "").trim());
}

function hexToRgba(color, alpha = 0.56) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(color || "").trim());
  if (!match) return [0.84, 0.38, 0.28, alpha];
  const value = Number.parseInt(match[1], 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255, alpha];
}
