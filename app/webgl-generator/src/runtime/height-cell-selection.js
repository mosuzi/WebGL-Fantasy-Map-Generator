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

export function composeHeightCellSelection(map, currentCellIds, options = {}) {
  const heights = map?.grid?.cells?.h;
  const operation = normalizeCompositionOperation(options.operation);
  const currentIds = normalizeCellIds(currentCellIds, heights?.length || 0);
  const candidate = createHeightCellSelection(map, options);
  const base = {
    operation,
    scope: candidate.summary.scope,
    lower: candidate.summary.lower,
    upper: candidate.summary.upper,
    previousCount: currentIds.length,
    incomingCount: candidate.cellIds.length,
    count: currentIds.length,
    addedCount: 0,
    removedCount: 0,
    heightRange: heightRangeForIds(heights, currentIds),
    valid: false,
    notice: ""
  };
  if (!operation) return compositionResult(currentIds, {...base, operation: String(options.operation || ""), notice: "未知的地形选区组合方式。"});
  if ((operation === "intersect" || operation === "subtract") && !currentIds.length) {
    return compositionResult(currentIds, {...base, notice: "当前没有可执行交集或排除的锁定选区。"});
  }
  if (!candidate.summary.valid) return compositionResult(currentIds, {...base, notice: candidate.summary.notice});

  const currentSet = new Set(currentIds);
  const candidateSet = new Set(candidate.cellIds);
  let resultSet;
  if (operation === "replace") resultSet = candidateSet;
  else if (operation === "union") resultSet = new Set([...currentSet, ...candidateSet]);
  else if (operation === "intersect") resultSet = new Set([...currentSet].filter(gridCell => candidateSet.has(gridCell)));
  else resultSet = new Set([...currentSet].filter(gridCell => !candidateSet.has(gridCell)));

  const resultIds = Uint32Array.from([...resultSet].sort((a, b) => a - b));
  if (!resultIds.length) {
    return compositionResult(currentIds, {...base, notice: "选区组合结果为空，已保留原锁定选区；如需清空请使用“清除选区”。"});
  }
  const addedCount = resultIds.reduce((count, gridCell) => count + (currentSet.has(gridCell) ? 0 : 1), 0);
  const removedCount = currentIds.reduce((count, gridCell) => count + (resultSet.has(gridCell) ? 0 : 1), 0);
  const label = compositionOperationLabel(operation);
  const unchanged = addedCount === 0 && removedCount === 0;
  return compositionResult(resultIds, {
    ...base,
    count: resultIds.length,
    addedCount,
    removedCount,
    heightRange: heightRangeForIds(heights, resultIds),
    valid: true,
    notice: unchanged
      ? `${label}后选区保持 ${resultIds.length} cells。`
      : `${label}后选区 ${resultIds.length} cells（新增 ${addedCount}，移除 ${removedCount}）。`
  });
}

export function inspectHeightCellSelectionComposition(map, currentCellIds, options = {}) {
  return composeHeightCellSelection(map, currentCellIds, options).summary;
}

export function createHeightCellSelectionSet(cellIds) {
  const result = new Set();
  for (const value of cellIds || []) {
    const gridCell = Number(value);
    if (Number.isInteger(gridCell) && gridCell >= 0) result.add(gridCell);
  }
  return result;
}

function compositionResult(cellIds, summary) {
  return {cellIds: Uint32Array.from(cellIds || []), summary};
}

function normalizeCellIds(cellIds, limit) {
  const result = new Set();
  for (const value of cellIds || []) {
    const gridCell = Number(value);
    if (Number.isInteger(gridCell) && gridCell >= 0 && gridCell < limit) result.add(gridCell);
  }
  return Uint32Array.from([...result].sort((a, b) => a - b));
}

function heightRangeForIds(heights, cellIds) {
  if (!heights?.length || !cellIds?.length) return null;
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  for (const gridCell of cellIds) {
    const height = Number(heights[gridCell]) || 0;
    minHeight = Math.min(minHeight, height);
    maxHeight = Math.max(maxHeight, height);
  }
  return [minHeight, maxHeight];
}

function normalizeCompositionOperation(operation) {
  return operation === "replace" || operation === "union" || operation === "intersect" || operation === "subtract" ? operation : null;
}

function compositionOperationLabel(operation) {
  if (operation === "replace") return "覆盖锁定";
  if (operation === "union") return "并入区间";
  if (operation === "intersect") return "保留交集";
  return "排除区间";
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
