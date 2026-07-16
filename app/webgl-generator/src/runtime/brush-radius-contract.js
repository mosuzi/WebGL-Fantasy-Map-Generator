export const BRUSH_RADIUS_ID = Object.freeze({
  HEIGHT: "height",
  HEIGHT_SELECTION: "height-selection",
  STATE: "state",
  PROVINCE: "province",
  CULTURE: "culture",
  RELIGION: "religion",
  BIOME: "biome",
  ECONOMY_MARKET: "economy-market"
});

const BRUSH_RADIUS_CONTRACTS = Object.freeze({
  [BRUSH_RADIUS_ID.HEIGHT]: freezeContract(28, 6, 96, 2),
  [BRUSH_RADIUS_ID.HEIGHT_SELECTION]: freezeContract(48, 8, 160, 4),
  [BRUSH_RADIUS_ID.STATE]: freezeContract(28, 4, 120, 2),
  [BRUSH_RADIUS_ID.PROVINCE]: freezeContract(28, 4, 120, 2),
  [BRUSH_RADIUS_ID.CULTURE]: freezeContract(28, 4, 120, 2),
  [BRUSH_RADIUS_ID.RELIGION]: freezeContract(28, 4, 120, 2),
  [BRUSH_RADIUS_ID.BIOME]: freezeContract(28, 4, 120, 2),
  [BRUSH_RADIUS_ID.ECONOMY_MARKET]: freezeContract(18, 2, 120, 2)
});

export function readBrushRadiusContract(id) {
  const contract = BRUSH_RADIUS_CONTRACTS[id];
  if (!contract) throw new Error(`未知画笔半径契约：${id}`);
  return contract;
}

export function normalizeBrushRadius(id, value) {
  const contract = readBrushRadiusContract(id);
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return contract.defaultValue;
  return Math.max(contract.min, Math.min(contract.max, numeric));
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

function freezeContract(defaultValue, min, max, step) {
  return Object.freeze({defaultValue, min, max, step});
}

function isFinitePoint(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.y);
}
