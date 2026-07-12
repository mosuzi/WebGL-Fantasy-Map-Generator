export function createHeightCellSelection(map, options = {}) {
  const heights = map?.grid?.cells?.h;
  const scope = normalizeScope(options.scope);
  const lower = normalizeBound(options.lower, 20);
  const upper = normalizeBound(options.upper, 100);
  const base = {source: "height-band", scope, lower, upper, count: 0, heightRange: null, valid: false, notice: ""};
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

export function createHeightCursorRadiusSelection(map, centerCell, options = {}) {
  const cells = map?.grid?.cells;
  const points = map?.grid?.points;
  const scope = normalizeScope(options.scope);
  const radius = normalizeRadius(options.radius, 48);
  const maxCells = heightSelectionMaxCells(cells?.h?.length || 0);
  const normalizedCenter = Number.isInteger(centerCell) ? centerCell : null;
  const base = {source: "cursor-circle", scope, centerCell: normalizedCenter, radius, maxCells, count: 0, heightRange: null, valid: false, notice: ""};
  if (!cells?.h?.length || !cells?.p || !Array.isArray(points)) {
    return {cellIds: new Uint32Array(), summary: {...base, notice: "当前地图缺少高度或点位数据，无法生成光标圆形选区。"}};
  }
  if (!Number.isInteger(normalizedCenter) || normalizedCenter < 0 || normalizedCenter >= cells.h.length) {
    return {cellIds: new Uint32Array(), summary: {...base, centerCell: null, notice: "请先把鼠标停在地图上的有效 cell。"}};
  }
  const centerPoint = points[cells.p[normalizedCenter]];
  if (!centerPoint) return {cellIds: new Uint32Array(), summary: {...base, notice: "当前光标 cell 缺少点位，无法生成圆形选区。"}};

  const radiusSq = radius * radius;
  const cellIds = [];
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  for (let gridCell = 0; gridCell < cells.h.length; gridCell++) {
    const height = Number(cells.h[gridCell]) || 0;
    if (!matchesScope(height, scope)) continue;
    const point = points[cells.p[gridCell]];
    if (!point) continue;
    const dx = point[0] - centerPoint[0];
    const dy = point[1] - centerPoint[1];
    if (dx * dx + dy * dy > radiusSq) continue;
    cellIds.push(gridCell);
    if (cellIds.length > maxCells) {
      return {cellIds: new Uint32Array(), summary: {...base, notice: `光标圆形选区超过安全上限 ${maxCells} cells，已拒绝。`}};
    }
    minHeight = Math.min(minHeight, height);
    maxHeight = Math.max(maxHeight, height);
  }
  if (!cellIds.length) return {cellIds: new Uint32Array(), summary: {...base, notice: "当前圆形范围没有命中作用范围内的 cells。"}};
  const typedIds = Uint32Array.from(cellIds);
  return {
    cellIds: typedIds,
    summary: {
      ...base,
      count: typedIds.length,
      heightRange: [minHeight, maxHeight],
      valid: true,
      notice: `光标圆形候选 ${typedIds.length} cells（中心 #${normalizedCenter}，半径 ${radius}）。`
    }
  };
}

export function inspectHeightCursorRadiusSelection(map, centerCell, options = {}) {
  return createHeightCursorRadiusSelection(map, centerCell, options).summary;
}

export function createHeightRectangleSelection(map, fromPoint, toPoint, options = {}) {
  const cells = map?.grid?.cells;
  const points = map?.grid?.points;
  const scope = normalizeScope(options.scope);
  const start = normalizePoint(fromPoint);
  const end = normalizePoint(toPoint);
  const maxCells = heightSelectionMaxCells(cells?.h?.length || 0);
  const rawBounds = start && end ? {
    minX: Math.min(start.x, end.x),
    minY: Math.min(start.y, end.y),
    maxX: Math.max(start.x, end.x),
    maxY: Math.max(start.y, end.y)
  } : null;
  const width = rawBounds ? rawBounds.maxX - rawBounds.minX : 0;
  const height = rawBounds ? rawBounds.maxY - rawBounds.minY : 0;
  const base = {
    source: "rectangle",
    scope,
    bounds: rawBounds ? summarizeBounds(rawBounds) : null,
    width: roundCoordinate(width),
    height: roundCoordinate(height),
    maxCells,
    count: 0,
    heightRange: null,
    valid: false,
    notice: ""
  };
  if (!cells?.h?.length || !cells?.p || !Array.isArray(points)) {
    return {cellIds: new Uint32Array(), summary: {...base, notice: "当前地图缺少高度或点位数据，无法生成矩形选区。"}};
  }
  if (!rawBounds) return {cellIds: new Uint32Array(), summary: {...base, notice: "矩形选区需要两个有效角点。"}};
  if (width < 1 || height < 1) return {cellIds: new Uint32Array(), summary: {...base, notice: "矩形两个角过近，宽和高都必须至少为 1。"}};

  const cellIds = [];
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  for (let gridCell = 0; gridCell < cells.h.length; gridCell++) {
    const cellPoint = points[cells.p[gridCell]];
    if (!cellPoint) continue;
    if (cellPoint[0] < rawBounds.minX || cellPoint[0] > rawBounds.maxX || cellPoint[1] < rawBounds.minY || cellPoint[1] > rawBounds.maxY) continue;
    const cellHeight = Number(cells.h[gridCell]) || 0;
    if (!matchesScope(cellHeight, scope)) continue;
    cellIds.push(gridCell);
    if (cellIds.length > maxCells) {
      return {cellIds: new Uint32Array(), summary: {...base, notice: `矩形选区超过安全上限 ${maxCells} cells，已拒绝。`}};
    }
    minHeight = Math.min(minHeight, cellHeight);
    maxHeight = Math.max(maxHeight, cellHeight);
  }
  if (!cellIds.length) return {cellIds: new Uint32Array(), summary: {...base, notice: "当前矩形没有命中作用范围内的 cells。"}};
  const typedIds = Uint32Array.from(cellIds);
  return {
    cellIds: typedIds,
    summary: {
      ...base,
      count: typedIds.length,
      heightRange: [minHeight, maxHeight],
      valid: true,
      notice: `矩形候选 ${typedIds.length} cells（${base.width} × ${base.height}）。`
    }
  };
}

export function inspectHeightRectangleSelection(map, fromPoint, toPoint, options = {}) {
  return createHeightRectangleSelection(map, fromPoint, toPoint, options).summary;
}

export function createHeightConnectedSelection(map, centerCell, options = {}) {
  const cells = map?.grid?.cells;
  const scope = normalizeScope(options.scope);
  const tolerance = normalizeTolerance(options.tolerance, 6);
  const maxCells = heightSelectionMaxCells(cells?.h?.length || 0);
  const normalizedCenter = Number.isInteger(centerCell) ? centerCell : null;
  const startHeight = normalizedCenter !== null && cells?.h?.length && normalizedCenter >= 0 && normalizedCenter < cells.h.length
    ? Number(cells.h[normalizedCenter]) || 0
    : null;
  const base = {source: "connected-height", scope, centerCell: normalizedCenter, startHeight, tolerance, maxCells, count: 0, heightRange: null, valid: false, notice: ""};
  if (!cells?.h?.length || !Array.isArray(cells.c)) {
    return {cellIds: new Uint32Array(), summary: {...base, notice: "当前地图缺少高度或共享边邻接，无法生成连通等高区。"}};
  }
  if (normalizedCenter === null || normalizedCenter < 0 || normalizedCenter >= cells.h.length) {
    return {cellIds: new Uint32Array(), summary: {...base, centerCell: null, startHeight: null, notice: "连通等高区需要一个有效中心 cell。"}};
  }
  if (!matchesScope(startHeight, scope)) {
    return {cellIds: new Uint32Array(), summary: {...base, notice: "中心 cell 不属于当前作用范围。"}};
  }

  const queue = [normalizedCenter];
  const visited = new Set([normalizedCenter]);
  const cellIds = [];
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  for (let index = 0; index < queue.length; index++) {
    const gridCell = queue[index];
    const height = Number(cells.h[gridCell]) || 0;
    if (!matchesScope(height, scope) || Math.abs(height - startHeight) > tolerance) continue;
    cellIds.push(gridCell);
    if (cellIds.length > maxCells) {
      return {cellIds: new Uint32Array(), summary: {...base, notice: `连通等高区超过安全上限 ${maxCells} cells，已拒绝。`}};
    }
    minHeight = Math.min(minHeight, height);
    maxHeight = Math.max(maxHeight, height);
    for (const neighbor of cells.c[gridCell] || []) {
      if (!Number.isInteger(neighbor) || neighbor < 0 || neighbor >= cells.h.length || visited.has(neighbor)) continue;
      visited.add(neighbor);
      queue.push(neighbor);
    }
  }
  if (!cellIds.length) return {cellIds: new Uint32Array(), summary: {...base, notice: "当前中心没有命中可用的连通等高 cells。"}};
  const typedIds = Uint32Array.from(cellIds.sort((a, b) => a - b));
  return {
    cellIds: typedIds,
    summary: {
      ...base,
      count: typedIds.length,
      heightRange: [minHeight, maxHeight],
      valid: true,
      notice: `连通等高候选 ${typedIds.length} cells（中心 #${normalizedCenter}，高度 ${startHeight}±${tolerance}）。`
    }
  };
}

export function inspectHeightConnectedSelection(map, centerCell, options = {}) {
  return createHeightConnectedSelection(map, centerCell, options).summary;
}

export function composeHeightCellSelection(map, currentCellIds, options = {}) {
  const heights = map?.grid?.cells?.h;
  const operation = normalizeCompositionOperation(options.operation);
  const currentIds = normalizeCellIds(currentCellIds, heights?.length || 0);
  const source = normalizeSelectionSource(options.source);
  const candidate = source === "cursor-circle"
    ? createHeightCursorRadiusSelection(map, options.centerCell, options)
    : source === "connected-height"
      ? createHeightConnectedSelection(map, options.centerCell, options)
    : source === "rectangle"
      ? createHeightRectangleSelection(map, options.fromPoint, options.toPoint, options)
    : source === "height-band"
      ? createHeightCellSelection(map, options)
      : {cellIds: new Uint32Array(), summary: {source: String(options.source || ""), scope: normalizeScope(options.scope), count: 0, heightRange: null, valid: false, notice: "未知的地形选区来源。"}};
  const base = {
    operation,
    source: candidate.summary.source,
    scope: candidate.summary.scope,
    lower: candidate.summary.lower ?? null,
    upper: candidate.summary.upper ?? null,
    centerCell: candidate.summary.centerCell ?? null,
    radius: candidate.summary.radius ?? null,
    maxCells: candidate.summary.maxCells ?? null,
    bounds: candidate.summary.bounds ? {...candidate.summary.bounds} : null,
    width: candidate.summary.width ?? null,
    height: candidate.summary.height ?? null,
    startHeight: candidate.summary.startHeight ?? null,
    tolerance: candidate.summary.tolerance ?? null,
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

function normalizeSelectionSource(source) {
  if (source === undefined || source === null || source === "") return "height-band";
  return source === "height-band" || source === "cursor-circle" || source === "rectangle" || source === "connected-height" ? source : null;
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

function normalizeRadius(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(1, Math.min(256, Math.round(numeric))) : fallback;
}

function normalizeTolerance(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric))) : fallback;
}

function heightSelectionMaxCells(cellCount) {
  if (!cellCount) return 0;
  return Math.max(64, Math.min(5000, Math.floor(cellCount * 0.2)));
}

function normalizePoint(point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? {x, y} : null;
}

function summarizeBounds(bounds) {
  return {
    minX: roundCoordinate(bounds.minX),
    minY: roundCoordinate(bounds.minY),
    maxX: roundCoordinate(bounds.maxX),
    maxY: roundCoordinate(bounds.maxY)
  };
}

function roundCoordinate(value) {
  return Math.round(Number(value) * 10) / 10;
}
