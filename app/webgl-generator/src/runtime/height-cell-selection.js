export function createHeightCellSelection(map, options = {}) {
  const heights = map?.grid?.cells?.h;
  const scope = normalizeScope(options.scope);
  const lower = normalizeBound(options.lower, 20);
  const upper = normalizeBound(options.upper, 100);
  const base = {scope, lower, upper, count: 0, heightRange: null, valid: false, notice: ""};
  if (!heights?.length) return {cellIds: new Uint32Array(), summary: {...base, notice: "当前地图缺少高度数据，无法锁定地形选区。"}};
  if (lower > upper) return {cellIds: new Uint32Array(), summary: {...base, notice: "地形选区高度下限不能高于上限。"}};

  const cellIds = [];
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  for (let gridCell = 0; gridCell < heights.length; gridCell++) {
    const height = Number(heights[gridCell]) || 0;
    if (!matchesScope(height, scope) || height < lower || height > upper) continue;
    cellIds.push(gridCell);
    minHeight = Math.min(minHeight, height);
    maxHeight = Math.max(maxHeight, height);
  }
  if (!cellIds.length) return {cellIds: new Uint32Array(), summary: {...base, notice: "当前作用范围与高度区间没有可锁定的 cells。"}};
  const typedIds = Uint32Array.from(cellIds);
  return {
    cellIds: typedIds,
    summary: {
      ...base,
      count: typedIds.length,
      heightRange: [minHeight, maxHeight],
      valid: true,
      notice: `已锁定地形选区 ${typedIds.length} cells（高度 ${minHeight}..${maxHeight}）。`
    }
  };
}

export function inspectHeightCellSelection(map, options = {}) {
  return createHeightCellSelection(map, options).summary;
}

export function createHeightCellSelectionSet(cellIds) {
  const result = new Set();
  for (const value of cellIds || []) {
    const gridCell = Number(value);
    if (Number.isInteger(gridCell) && gridCell >= 0) result.add(gridCell);
  }
  return result;
}

function normalizeScope(scope) {
  return scope === "land" || scope === "water" ? scope : "all";
}

function matchesScope(height, scope) {
  if (scope === "land") return height >= 20;
  if (scope === "water") return height < 20;
  return true;
}

function normalizeBound(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric))) : fallback;
}
