export const BRUSH_RADIUS_ID = Object.freeze({
  HEIGHT: "height",
  HEIGHT_LINE: "height-line",
  HEIGHT_SELECTION: "height-selection",
  STATE: "state",
  PROVINCE: "province",
  CULTURE: "culture",
  RELIGION: "religion",
  BIOME: "biome",
  SUITABILITY: "suitability",
  ECONOMY_MARKET: "economy-market"
});

const RADIUS = Object.freeze({defaultValue: 8, min: 1, max: 32, step: 1});
export const SAVED_BRUSH_RADIUS_IDS = Object.freeze(Object.values(BRUSH_RADIUS_ID));

// 高度标尺为 0～100；连续落笔每次最多改变五级，等高扰动控制在三级内。
export const HEIGHT_BRUSH_STRENGTH = Object.freeze({
  strength: Object.freeze({min: 1, max: 5, defaultValue: 2}),
  levelPerturbation: Object.freeze({min: 0, max: 3, defaultValue: 0}),
  linePower: Object.freeze({min: -5, max: 5, defaultValue: 2})
});

function normalizeSetting(contract, value) {
  if (value == null || value === "" || !Number.isFinite(Number(value))) return contract.defaultValue;
  return Math.max(contract.min, Math.min(contract.max, Math.round(Number(value))));
}

export function normalizeBrushStrength(key, value) {
  return normalizeSetting(HEIGHT_BRUSH_STRENGTH[key], value);
}

export function normalizeSavedBrushStrengths(source) {
  return Object.fromEntries(Object.keys(HEIGHT_BRUSH_STRENGTH).map(key => [key, normalizeBrushStrength(key, source?.[key])]));
}

export function hasCompleteSavedBrushStrengths(source) {
  return Object.keys(HEIGHT_BRUSH_STRENGTH).every(key => Number.isInteger(source?.[key]) && source[key] === normalizeBrushStrength(key, source[key]));
}

export function normalizeSavedBrushRadii(source) {
  const values = source && typeof source === "object" ? source : {};
  return Object.fromEntries(SAVED_BRUSH_RADIUS_IDS.map(id => [id, normalizeBrushRadius(id, values[id])]));
}

export function hasCompleteSavedBrushRadii(source) {
  return Boolean(source && typeof source === "object" && SAVED_BRUSH_RADIUS_IDS.every(id =>
    Number.isInteger(source[id]) && source[id] >= RADIUS.min && source[id] <= RADIUS.max
  ));
}

export function readBrushRadiusContract(id) {
  if (!SAVED_BRUSH_RADIUS_IDS.includes(id)) throw new Error(`未知画笔半径契约：${id}`);
  return RADIUS;
}

export function normalizeBrushRadius(id, value) {
  return normalizeSetting(readBrushRadiusContract(id), value);
}

export function projectWorldRadiusToScreen(center, radius, projectWorldPoint) {
  if (!center || typeof projectWorldPoint !== "function") return null;
  const worldRadius = Number(radius);
  if (!Number.isFinite(center.x) || !Number.isFinite(center.y) || !Number.isFinite(worldRadius) || worldRadius <= 0) return null;
  const projectedCenter = projectWorldPoint(center);
  const projectedX = projectWorldPoint({x: center.x + worldRadius, y: center.y});
  const projectedY = projectWorldPoint({x: center.x, y: center.y + worldRadius});
  if (![projectedCenter, projectedX, projectedY].every(isFinitePoint)) return null;
  return {
    center: projectedCenter,
    radiusX: Math.hypot(projectedX.x - projectedCenter.x, projectedX.y - projectedCenter.y),
    radiusY: Math.hypot(projectedY.x - projectedCenter.x, projectedY.y - projectedCenter.y)
  };
}

function isFinitePoint(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.y);
}
