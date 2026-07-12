export function getHeightBrushChanges(map, point, brush, stroke) {
  const cells = map?.grid?.cells;
  const points = map?.grid?.points;
  const originals = stroke?.originals;
  if (!cells?.p || !cells?.h || !Array.isArray(points) || !(originals instanceof Map)) return [];
  if (brush?.action === "fill") {
    if (stroke.fillApplied) return [];
    stroke.fillApplied = true;
    return getHeightFillChanges(map, point, brush, stroke);
  }

  const radius = Math.max(1, Number(brush?.radius) || 1);
  const radiusSq = radius * radius;
  const scope = normalizeBrushScope(brush?.scope);
  const affected = [];
  let nearest = null;

  for (let gridCell = 0; gridCell < cells.p.length; gridCell++) {
    const scopeHeight = originals.has(gridCell) ? originals.get(gridCell) : cells.h[gridCell];
    if (!matchesBrushScope(scopeHeight, scope)) continue;
    const cellPoint = points[cells.p[gridCell]];
    if (!cellPoint) continue;
    const dx = cellPoint[0] - point.x;
    const dy = cellPoint[1] - point.y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq > radiusSq) continue;
    const distance = Math.sqrt(distanceSq);
    const factor = brush.falloff && brush.action !== "smooth" ? brushFalloff(distance, radius) : 1;
    const item = {gridCell, factor, distanceSq};
    affected.push(item);
    if (!nearest || distanceSq < nearest.distanceSq) nearest = item;
  }

  if (!affected.length) return [];
  if (brush.action === "smooth") {
    const average = affected.reduce((sum, item) => sum + cells.h[item.gridCell], 0) / affected.length;
    return affected.map(({gridCell}) => heightChange(cells, originals, gridCell, cells.h[gridCell] * 0.62 + average * 0.38)).filter(Boolean);
  }
  if (brush.action === "flatten") {
    if (!Number.isFinite(stroke.targetHeight)) stroke.targetHeight = cells.h[nearest.gridCell];
    const targetHeight = clampHeight(stroke.targetHeight);
    const strength = Math.max(1, Number(brush.strength) || 1);
    return affected.map(({gridCell, factor}) => {
      const current = cells.h[gridCell];
      const difference = targetHeight - current;
      const step = Math.sign(difference) * Math.min(Math.abs(difference), strength * factor);
      return heightChange(cells, originals, gridCell, current + step);
    }).filter(Boolean);
  }
  if (brush.action === "disrupt") {
    const strength = Math.max(1, Number(brush.strength) || 1);
    const seed = Number.isFinite(stroke.seed) ? Math.trunc(stroke.seed) : 0;
    const iteration = Math.max(0, Math.trunc(Number(stroke.iteration) || 0));
    stroke.iteration = iteration + 1;
    return affected.map(({gridCell, factor}) => {
      const delta = stableSignedNoise(gridCell, seed, iteration) * strength * factor;
      return heightChange(cells, originals, gridCell, cells.h[gridCell] + delta);
    }).filter(Boolean);
  }

  const strength = Math.max(1, Number(brush.strength) || 1);
  const delta = brush.action === "lower" ? -strength : strength;
  return affected.map(({gridCell, factor}) => heightChange(cells, originals, gridCell, cells.h[gridCell] + delta * factor)).filter(Boolean);
}

export function getHeightLineChanges(map, fromPoint, toPoint, brush, stroke) {
  const cells = map?.grid?.cells;
  const points = map?.grid?.points;
  const originals = stroke?.originals;
  if (!cells?.p || !cells?.h || !Array.isArray(points) || !(originals instanceof Map)) return [];

  const fromCell = findNearestGridCell(cells, points, fromPoint);
  const toCell = findNearestGridCell(cells, points, toPoint);
  const dx = toPoint.x - fromPoint.x;
  const dy = toPoint.y - fromPoint.y;
  const lengthSq = dx * dx + dy * dy;
  if (fromCell === null || toCell === null || fromCell === toCell || lengthSq < 1) {
    stroke.notice = "线段起点与终点过近，未执行。";
    return [];
  }

  const power = normalizeLinePower(brush?.linePower);
  if (!power) {
    stroke.notice = "线段增量不能为 0。";
    return [];
  }
  const width = normalizeLineWidth(brush?.lineWidth);
  const scope = normalizeBrushScope(brush?.scope);
  const maxCells = heightEditMaxCells(cells);
  const selection = [];
  for (let gridCell = 0; gridCell < cells.p.length; gridCell++) {
    const scopeHeight = originals.has(gridCell) ? originals.get(gridCell) : cells.h[gridCell];
    if (!matchesBrushScope(scopeHeight, scope)) continue;
    const cellPoint = points[cells.p[gridCell]];
    if (!cellPoint) continue;
    const distance = pointToSegmentDistance(cellPoint[0], cellPoint[1], fromPoint, toPoint, lengthSq);
    if (distance > width) continue;
    selection.push({gridCell, factor: brush?.falloff ? brushFalloff(distance, width) : 1});
    if (selection.length > maxCells) {
      stroke.notice = `线段选区超过安全上限 ${maxCells} cells，未执行。`;
      return [];
    }
  }
  if (!selection.length) {
    stroke.notice = "线段没有命中当前作用范围内的 cells。";
    return [];
  }

  const changes = selection.map(({gridCell, factor}) => heightChange(cells, originals, gridCell, cells.h[gridCell] + power * factor)).filter(Boolean);
  stroke.notice = changes.length ? `已生成线段地形 ${changes.length} cells。` : "线段选区高度没有变化。";
  return changes;
}

export function inspectHeightFillTarget(map, gridCell, brush = {}) {
  const {selection, ...summary} = analyzeHeightFillTarget(map, gridCell, brush);
  return summary;
}

export function getGlobalHeightChanges(map, options = {}) {
  return analyzeGlobalHeightChanges(map, options).changes;
}

export function inspectGlobalHeightChanges(map, options = {}) {
  const {changes, ...summary} = analyzeGlobalHeightChanges(map, options);
  return summary;
}

function analyzeGlobalHeightChanges(map, {action, scope: scopeValue, seed = 0, allowedCells = null} = {}) {
  const cells = map?.grid?.cells;
  const scope = normalizeBrushScope(scopeValue);
  const normalizedSeed = Math.trunc(Number(seed) || 0);
  const allowedCellSet = normalizeAllowedCells(allowedCells);
  const allowedSummary = summarizeAllowedCells(allowedCellSet);
  const base = {action: action || "", scope, seed: normalizedSeed, selectionLimited: Boolean(allowedCellSet), ...allowedSummary, selectedCount: 0, changeCount: 0, unchangedCount: 0, raisedCount: 0, loweredCount: 0, beforeRange: null, afterRange: null, averageDelta: 0, valid: false, notice: "", changes: []};
  if (!cells?.h || !Array.isArray(cells.c)) return {...base, notice: "当前地图缺少高度或邻接数据，无法预览全局工具。"};
  if (action !== "smooth" && action !== "disrupt") return {...base, notice: "未知的全局高度工具。"};
  const heights = Array.from(cells.h, value => Number(value) || 0);
  const changes = [];
  let selectedCount = 0;
  let raisedCount = 0;
  let loweredCount = 0;
  let minBefore = Infinity;
  let maxBefore = -Infinity;
  let minAfter = Infinity;
  let maxAfter = -Infinity;
  let deltaSum = 0;

  for (let gridCell = 0; gridCell < heights.length; gridCell++) {
    const selectionWeight = allowedCellWeight(allowedCellSet, gridCell);
    if (selectionWeight <= 0) continue;
    const before = heights[gridCell];
    if (!matchesBrushScope(before, scope)) continue;
    selectedCount += 1;
    minBefore = Math.min(minBefore, before);
    maxBefore = Math.max(maxBefore, before);
    let next = before;
    if (action === "smooth") {
      const neighbors = (cells.c[gridCell] || []).filter(cell => Number.isInteger(cell) && cell >= 0 && cell < heights.length && matchesBrushScope(heights[cell], scope));
      if (neighbors.length) {
        const neighborMean = neighbors.reduce((sum, cell) => sum + heights[cell], 0) / neighbors.length;
        next = (before * 3 + neighborMean + 1.5) / 4;
      }
    } else {
      if (before >= 15) next = before + 0.5 + stableSignedNoise(gridCell, normalizedSeed, 0) * 2;
    }
    const fullAfter = clampHeightToScope(next, scope);
    const after = clampHeightToScope(before + (fullAfter - before) * selectionWeight, scope);
    minAfter = Math.min(minAfter, after);
    maxAfter = Math.max(maxAfter, after);
    if (after === before) continue;
    deltaSum += after - before;
    if (after > before) raisedCount += 1;
    else loweredCount += 1;
    changes.push({gridCell, before, after});
  }

  if (!selectedCount) return {...base, notice: "当前作用范围没有可预览的 cells。"};
  const summary = {
    ...base,
    selectedCount,
    changeCount: changes.length,
    unchangedCount: selectedCount - changes.length,
    raisedCount,
    loweredCount,
    beforeRange: [minBefore, maxBefore],
    afterRange: [minAfter, maxAfter],
    averageDelta: changes.length ? Math.round(deltaSum / changes.length * 10) / 10 : 0,
    changes
  };
  if (!changes.length) return {...summary, notice: `候选 ${selectedCount} cells 的高度不会变化。`};
  const label = action === "smooth" ? "全局平滑" : "全局扰动";
  const signedAverage = summary.averageDelta > 0 ? `+${summary.averageDelta}` : String(summary.averageDelta);
  const featherNotice = summary.selectionFeathered ? `，选区权重 ${summary.selectionWeightRange.join("..")}` : "";
  return {...summary, valid: true, notice: `可${label} ${changes.length}/${selectedCount} cells，高度 ${minBefore}..${maxBefore} → ${minAfter}..${maxAfter}，均变 ${signedAverage}${featherNotice}。`};
}

export function inspectHeightRangeTransform(map, options = {}) {
  const {changes, ...summary} = analyzeHeightRangeTransform(map, options);
  return summary;
}

export function getHeightRangeTransformChanges(map, options = {}) {
  return analyzeHeightRangeTransform(map, options).changes;
}

function analyzeHeightRangeTransform(map, options) {
  const heights = map?.grid?.cells?.h;
  const scope = normalizeBrushScope(options?.scope);
  const lower = normalizeRangeBound(options?.lower, 20);
  const upper = normalizeRangeBound(options?.upper, 100);
  const operator = String(options?.operator || "multiply");
  const operand = Number(options?.operand);
  const allowedCellSet = normalizeAllowedCells(options?.allowedCells);
  const allowedSummary = summarizeAllowedCells(allowedCellSet);
  const base = {scope, lower, upper, operator, operand, selectionLimited: Boolean(allowedCellSet), ...allowedSummary, selectedCount: 0, changeCount: 0, unchangedCount: 0, raisedCount: 0, loweredCount: 0, beforeRange: null, afterRange: null, averageDelta: 0, valid: false, notice: "", changes: []};
  if (!heights?.length) return {...base, notice: "当前地图缺少高度数据，无法预检条件变换。"};
  if (lower > upper) return {...base, notice: "高度区间下限不能高于上限。"};
  const validationError = validateHeightRangeOperation(operator, operand);
  if (validationError) return {...base, notice: validationError};

  let selectedCount = 0;
  let minBefore = Infinity;
  let maxBefore = -Infinity;
  let minAfter = Infinity;
  let maxAfter = -Infinity;
  let deltaSum = 0;
  let raisedCount = 0;
  let loweredCount = 0;
  const changes = [];
  for (let gridCell = 0; gridCell < heights.length; gridCell++) {
    const selectionWeight = allowedCellWeight(allowedCellSet, gridCell);
    if (selectionWeight <= 0) continue;
    const before = Number(heights[gridCell]) || 0;
    if (!matchesBrushScope(before, scope) || before < lower || before > upper) continue;
    selectedCount += 1;
    minBefore = Math.min(minBefore, before);
    maxBefore = Math.max(maxBefore, before);
    const next = transformHeightValue(before, operator, operand, scope);
    const fullAfter = clampHeightToScope(next, scope);
    const after = clampHeightToScope(before + (fullAfter - before) * selectionWeight, scope);
    minAfter = Math.min(minAfter, after);
    maxAfter = Math.max(maxAfter, after);
    if (after === before) continue;
    deltaSum += after - before;
    if (after > before) raisedCount += 1;
    else loweredCount += 1;
    changes.push({gridCell, before, after});
  }

  if (!selectedCount) return {...base, notice: "当前作用范围与高度区间没有候选 cells。"};
  const summary = {
    ...base,
    selectedCount,
    changeCount: changes.length,
    unchangedCount: selectedCount - changes.length,
    raisedCount,
    loweredCount,
    beforeRange: [minBefore, maxBefore],
    afterRange: [minAfter, maxAfter],
    averageDelta: changes.length ? Math.round(deltaSum / changes.length * 10) / 10 : 0,
    changes
  };
  if (!changes.length) return {...summary, notice: `候选 ${selectedCount} cells 的高度不会变化。`};
  const label = heightRangeOperatorLabel(operator);
  const signedAverage = summary.averageDelta > 0 ? `+${summary.averageDelta}` : String(summary.averageDelta);
  const featherNotice = summary.selectionFeathered ? `，选区权重 ${summary.selectionWeightRange.join("..")}` : "";
  return {...summary, valid: true, notice: `可${label} ${changes.length}/${selectedCount} cells，高度 ${minBefore}..${maxBefore} → ${minAfter}..${maxAfter}，均变 ${signedAverage}${featherNotice}。`};
}

function validateHeightRangeOperation(operator, operand) {
  if (!["add", "subtract", "multiply", "divide", "exponent"].includes(operator)) return "未知的高度条件运算。";
  if (!Number.isFinite(operand)) return "条件变换操作数必须是有限数字。";
  if ((operator === "add" || operator === "subtract") && (!Number.isInteger(operand) || operand < 0 || operand > 100)) return "加减操作数必须是 0..100 的整数。";
  if (operator === "multiply" && (operand < 0 || operand > 10)) return "乘算操作数必须在 0..10 之间。";
  if (operator === "divide" && (operand <= 0 || operand > 10)) return "除算操作数必须大于 0 且不超过 10。";
  if (operator === "exponent" && (operand <= 0 || operand > 2)) return "指数操作数必须大于 0 且不超过 2。";
  return "";
}

function transformHeightValue(height, operator, operand, scope) {
  const baseline = scope === "land" ? 20 : 0;
  const value = height - baseline;
  if (operator === "add") return height + operand;
  if (operator === "subtract") return height - operand;
  if (operator === "multiply") return value * operand + baseline;
  if (operator === "divide") return value / operand + baseline;
  return value ** operand + baseline;
}

function heightRangeOperatorLabel(operator) {
  if (operator === "add") return "加高";
  if (operator === "subtract") return "降低";
  if (operator === "multiply") return "乘算";
  if (operator === "divide") return "除算";
  return "指数变换";
}

function normalizeRangeBound(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric))) : fallback;
}

function getHeightFillChanges(map, point, brush, stroke) {
  const {cells, points} = map.grid;
  const start = findNearestGridCell(cells, points, point);
  const analysis = analyzeHeightFillTarget(map, start, brush);
  stroke.notice = analysis.notice;
  if (!analysis.valid) return [];
  const changes = applyConeToSelection(cells, analysis.selection, analysis.water, analysis.startHeight, brush.strength, stroke.originals);
  stroke.notice = changes.length ? `已锥形填充 ${changes.length} cells。` : "连通区域高度没有变化。";
  return changes;
}

function analyzeHeightFillTarget(map, gridCell, brush) {
  const cells = map?.grid?.cells;
  const maxCells = cells?.h ? heightEditMaxCells(cells) : 0;
  if (!cells?.h || !Array.isArray(cells.c)) return fillAnalysis({gridCell, maxCells, notice: "当前 grid 缺少连通邻接，无法执行填充。"});
  if (!Number.isInteger(gridCell) || gridCell < 0 || gridCell >= cells.h.length) return fillAnalysis({gridCell: null, maxCells, notice: "当前指针没有命中可填充的 grid cell。"});

  const scope = normalizeBrushScope(brush.scope);
  const startHeight = cells.h[gridCell];
  const water = startHeight < 20;
  const tolerance = water ? 0 : normalizeFillTolerance(brush.fillTolerance);
  if (!matchesBrushScope(startHeight, scope)) return fillAnalysis({gridCell, startHeight, water, tolerance, maxCells, notice: "落点不属于当前笔刷作用范围。"});
  if (water && !cells.b) return fillAnalysis({gridCell, startHeight, water, tolerance, maxCells, notice: "当前 grid 缺少边界标记，无法确认水域是否封闭。"});

  const {selection, reachedBorder, exceededLimit} = collectFillSelection(cells, gridCell, water, startHeight, tolerance, maxCells);
  if (exceededLimit) return fillAnalysis({gridCell, startHeight, water, tolerance, maxCells, selection, notice: `连通区域超过安全上限 ${maxCells} cells，未执行填充。`});
  if (selection.length < 3) return fillAnalysis({gridCell, startHeight, water, tolerance, maxCells, selection, notice: "连通区域少于 3 cells，未执行填充。"});
  if (water && reachedBorder) return fillAnalysis({gridCell, startHeight, water, tolerance, maxCells, selection, reachedBorder, notice: "水域连通到地图边界，开放海域不能执行填充。"});
  const label = water ? "封闭水域" : `陆地高度 ${startHeight}±${tolerance}`;
  return fillAnalysis({gridCell, startHeight, water, tolerance, maxCells, selection, reachedBorder, valid: true, notice: `可填充 ${selection.length} cells（${label}）。`});
}

function fillAnalysis({gridCell = null, startHeight = null, water = false, tolerance = 0, maxCells = 0, selection = [], reachedBorder = false, valid = false, notice = ""}) {
  return {
    gridCell,
    startHeight,
    terrain: water ? "water" : "land",
    water,
    tolerance,
    maxCells,
    selection,
    selectionCount: selection.length,
    reachedBorder,
    valid,
    notice
  };
}

function findNearestGridCell(cells, points, point) {
  let nearest = null;
  for (let gridCell = 0; gridCell < cells.p.length; gridCell++) {
    const cellPoint = points[cells.p[gridCell]];
    if (!cellPoint) continue;
    const dx = cellPoint[0] - point.x;
    const dy = cellPoint[1] - point.y;
    const distanceSq = dx * dx + dy * dy;
    if (!nearest || distanceSq < nearest.distanceSq) nearest = {gridCell, distanceSq};
  }
  return nearest?.gridCell ?? null;
}

function collectFillSelection(cells, start, water, targetHeight, tolerance, maxCells) {
  const visited = new Uint8Array(cells.h.length);
  const stack = [start];
  const selection = [];
  let reachedBorder = false;
  while (stack.length) {
    const cell = stack.pop();
    if (visited[cell]) continue;
    visited[cell] = 1;
    const matches = water ? cells.h[cell] < 20 : Math.abs(cells.h[cell] - targetHeight) <= tolerance;
    if (!matches) continue;
    selection.push(cell);
    if (selection.length > maxCells) return {selection, reachedBorder, exceededLimit: true};
    if (cells.b?.[cell]) reachedBorder = true;
    for (const next of cells.c[cell] || []) {
      if (!visited[next]) stack.push(next);
    }
  }
  return {selection, reachedBorder, exceededLimit: false};
}

function normalizeFillTolerance(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(12, Math.round(numeric))) : 6;
}

function normalizeLinePower(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(-30, Math.min(30, Math.round(numeric))) : 12;
}

function normalizeLineWidth(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0.5, Math.min(96, numeric)) : 12;
}

function heightEditMaxCells(cells) {
  return Math.max(64, Math.min(5000, Math.floor(cells.h.length * 0.2)));
}

function pointToSegmentDistance(x, y, fromPoint, toPoint, lengthSq) {
  const projection = ((x - fromPoint.x) * (toPoint.x - fromPoint.x) + (y - fromPoint.y) * (toPoint.y - fromPoint.y)) / lengthSq;
  const t = Math.max(0, Math.min(1, projection));
  const closestX = fromPoint.x + (toPoint.x - fromPoint.x) * t;
  const closestY = fromPoint.y + (toPoint.y - fromPoint.y) * t;
  return Math.hypot(x - closestX, y - closestY);
}

function applyConeToSelection(cells, selection, water, targetHeight, strengthValue, originals) {
  const inSelection = new Uint8Array(cells.h.length);
  const edgeDistance = new Uint16Array(cells.h.length);
  for (const cell of selection) inSelection[cell] = 1;

  const queue = [];
  for (const cell of selection) {
    const neighbors = cells.c[cell] || [];
    if (!cells.b?.[cell] && !neighbors.some(next => !inSelection[next])) continue;
    inSelection[cell] = 2;
    queue.push(cell);
  }
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    const nextDistance = edgeDistance[cell] + 1;
    for (const next of cells.c[cell] || []) {
      if (inSelection[next] !== 1) continue;
      inSelection[next] = 2;
      edgeDistance[next] = nextDistance;
      queue.push(next);
    }
  }

  let maxDistance = 0;
  for (const cell of selection) maxDistance = Math.max(maxDistance, edgeDistance[cell]);
  const peakRise = Math.max(1, Number(strengthValue) || 1) * 3;
  const baseHeight = water ? 20 : targetHeight;
  return selection.map(cell => {
    const ratio = maxDistance ? edgeDistance[cell] / maxDistance : 1;
    const rise = Math.max(1, Math.round(peakRise * ratio));
    return heightChange(cells, originals, cell, Math.max(cells.h[cell], baseHeight + rise));
  }).filter(Boolean);
}

function normalizeBrushScope(scope) {
  return scope === "land" || scope === "water" ? scope : "all";
}

function matchesBrushScope(height, scope) {
  if (scope === "land") return height >= 20;
  if (scope === "water") return height < 20;
  return true;
}

function stableSignedNoise(gridCell, seed, iteration) {
  let value = Math.imul(gridCell + 1, 0x9e3779b1) ^ Math.imul(seed + 1, 0x85ebca6b) ^ Math.imul(iteration + 1, 0xc2b2ae35);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  value = (value ^ (value >>> 16)) >>> 0;
  return value / 0xffffffff * 2 - 1;
}

function heightChange(cells, originals, gridCell, nextValue) {
  const after = clampHeight(nextValue);
  if (after === cells.h[gridCell]) return null;
  if (!originals.has(gridCell)) originals.set(gridCell, cells.h[gridCell]);
  return {
    gridCell,
    before: originals.get(gridCell),
    after
  };
}

function brushFalloff(distance, radius) {
  const t = Math.max(0, Math.min(1, 1 - distance / Math.max(1, radius)));
  return t * t * (3 - 2 * t);
}

function clampHeight(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function clampHeightToScope(value, scope) {
  const height = clampHeight(value);
  if (scope === "land") return Math.max(20, height);
  if (scope === "water") return Math.min(19, height);
  return height;
}

function normalizeAllowedCells(value) {
  if (value instanceof Map || value instanceof Set) return value;
  if (Array.isArray(value) || ArrayBuffer.isView(value)) return new Set(value);
  return null;
}

function allowedCellWeight(allowedCells, gridCell) {
  if (!allowedCells) return 1;
  if (allowedCells instanceof Map) {
    const value = Number(allowedCells.get(gridCell));
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  }
  return allowedCells.has(gridCell) ? 1 : 0;
}

function summarizeAllowedCells(allowedCells) {
  if (!(allowedCells instanceof Map)) return {selectionFeathered: false, selectionWeightRange: null};
  let min = 1;
  let max = 0;
  let found = false;
  for (const value of allowedCells.values()) {
    const weight = Number(value);
    if (!Number.isFinite(weight) || weight <= 0) continue;
    found = true;
    min = Math.min(min, Math.min(1, weight));
    max = Math.max(max, Math.min(1, weight));
  }
  return {
    selectionFeathered: found && min < 1,
    selectionWeightRange: found ? [Math.round(min * 1000) / 1000, Math.round(max * 1000) / 1000] : null
  };
}
