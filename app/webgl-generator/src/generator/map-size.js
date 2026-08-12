export const MAP_CELLS_MIN = 1;
export const MAP_CELLS_MAX = 100_000;

export function normalizeMapCellTarget(value, {fallback = 10_000, invalid = "fallback"} = {}) {
  const parsed = parseFiniteNumber(value);
  if (parsed === null) {
    if (invalid === "throw") throw new TypeError("地图规模必须是有限数字");
    const fallbackValue = parseFiniteNumber(fallback);
    return clampMapCellTarget(fallbackValue === null ? 10_000 : fallbackValue);
  }
  return clampMapCellTarget(parsed);
}

function parseFiniteNumber(value) {
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampMapCellTarget(value) {
  return Math.max(MAP_CELLS_MIN, Math.min(MAP_CELLS_MAX, Math.trunc(value)));
}
