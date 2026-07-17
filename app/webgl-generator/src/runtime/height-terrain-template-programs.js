import {
  getHeightTerrainTemplateChanges,
  heightTerrainTemplateLabel,
  heightTerrainTemplateUsesSeed,
  inspectHeightTerrainTemplate
} from "./height-terrain-templates.js";
import {MinPriorityQueue} from "../generator/priority-queue.js";
import {createRandom} from "../generator/random.js";

export const HEIGHT_TERRAIN_TEMPLATE_DOCUMENT_TYPE = "webgl-generator-height-terrain-templates";
export const HEIGHT_TERRAIN_TEMPLATE_DOCUMENT_VERSION = 1;
export const HEIGHT_TERRAIN_TEMPLATE_STORAGE_KEY = "webgl-generator-height-terrain-templates-v1";

const SOURCE_OPERATION_ALIASES = Object.freeze({
  Add: "source-add",
  Multiply: "source-multiply",
  Smooth: "source-smooth",
  Strait: "source-strait",
  Mask: "source-mask",
  Invert: "source-invert"
});

export const SOURCE_HEIGHT_TEMPLATE_COMPATIBILITY = Object.freeze({
  exact: Object.freeze(["Add", "Multiply", "Smooth", "Mask", "Invert"]),
  converted: Object.freeze(["Hill", "Pit", "Range", "Trough", "Strait"]),
  unsupported: Object.freeze([])
});

export const HEIGHT_TERRAIN_TEMPLATE_PROGRAM_PRESETS = Object.freeze([
  program({
    id: "layered-upland",
    name: "层叠高原",
    description: "先抬升收束，再叠加稳定起伏和浅阶地。",
    steps: [
      {operation: "plateau", intensity: 0.78, targetHeight: 72},
      {operation: "rugged", intensity: 0.42, amplitude: 10, seedOffset: 0},
      {operation: "terraces", intensity: 0.35, terraceStep: 6}
    ]
  }),
  program({
    id: "terraced-basin",
    name: "阶地盆地",
    description: "先形成盆地，再加入低幅起伏并收束成阶地。",
    steps: [
      {operation: "basin", intensity: 0.72, targetHeight: 30},
      {operation: "rugged", intensity: 0.28, amplitude: 7, seedOffset: 13},
      {operation: "terraces", intensity: 0.55, terraceStep: 5}
    ]
  }),
  program({
    id: "source-archipelago-converted",
    name: "Source 群岛（转换）",
    description: "由原版 Archipelago 模板转换：Add / Smooth 精确映射，Range / Hill / Trough 转为稳定破碎塑形，纵横 Strait 转为确定性选区通道。",
    source: {
      templateId: "archipelago",
      compatibility: "converted",
      exactOperations: ["Add", "Smooth"],
      convertedOperations: ["Range", "Hill", "Trough", "Strait"],
      unsupportedOperations: []
    },
    steps: [
      {operation: "source-add", value: 11, range: "all"},
      {operation: "rugged", intensity: 0.8, amplitude: 18, seedOffset: 29},
      {operation: "source-smooth", factor: 3, iterations: 1},
      {operation: "rugged", intensity: 0.35, amplitude: 8, seedOffset: 61},
      {operation: "source-strait", width: 2, direction: "vertical", scope: "all", seedOffset: 83},
      {operation: "source-strait", width: 2, direction: "horizontal", scope: "all", seedOffset: 109}
    ]
  })
]);

export function getHeightTerrainTemplateProgramChanges(map, programValue, options = {}) {
  return analyzeHeightTerrainTemplateProgram(map, programValue, options).changes;
}

export function inspectHeightTerrainTemplateProgram(map, programValue, options = {}) {
  const {changes, ...summary} = analyzeHeightTerrainTemplateProgram(map, programValue, options);
  return summary;
}

export function heightTerrainTemplateProgramUsesSeed(programValue) {
  try {
    return normalizeHeightTerrainTemplateProgram(programValue).steps.some(step => step.operation === "rugged" || step.operation === "source-strait" || step.operation === "source-invert" && step.probability < 1);
  } catch {
    return false;
  }
}

export function inspectSourceHeightTemplateOperations(operations = []) {
  if (!Array.isArray(operations)) throw new Error("Source 操作清单必须是数组。");
  const exact = new Set(SOURCE_HEIGHT_TEMPLATE_COMPATIBILITY.exact);
  const converted = new Set(SOURCE_HEIGHT_TEMPLATE_COMPATIBILITY.converted);
  const unsupported = new Set(SOURCE_HEIGHT_TEMPLATE_COMPATIBILITY.unsupported);
  const results = operations.map(value => {
    const operation = String(value || "").trim();
    const status = exact.has(operation) ? "exact" : converted.has(operation) ? "converted" : unsupported.has(operation) ? "unsupported" : "unknown";
    return {
      operation,
      status,
      internalOperation: SOURCE_OPERATION_ALIASES[operation] || null,
      supported: status === "exact" || status === "converted"
    };
  });
  return {
    valid: results.every(result => result.supported),
    operations: results,
    exact: results.filter(result => result.status === "exact").map(result => result.operation),
    converted: results.filter(result => result.status === "converted").map(result => result.operation),
    unsupported: results.filter(result => result.status === "unsupported").map(result => result.operation),
    unknown: results.filter(result => result.status === "unknown").map(result => result.operation)
  };
}

export function normalizeHeightTerrainTemplateProgram(value, {user = false} = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("地形模板必须是对象。");
  const id = normalizeId(value.id);
  const name = normalizeText(value.name, "模板名称", 60);
  const description = normalizeOptionalText(value.description, 240);
  if (!Array.isArray(value.steps) || value.steps.length < 1 || value.steps.length > 12) throw new Error("地形模板必须包含 1 到 12 个步骤。");
  const normalized = {
    id,
    name,
    description,
    user: Boolean(user || value.user),
    steps: value.steps.map((step, index) => normalizeProgramStep(step, index))
  };
  if (value.source) normalized.source = normalizeSourceMetadata(value.source);
  return normalized;
}

export function createHeightTerrainTemplateDocument(templates = []) {
  if (!Array.isArray(templates)) throw new Error("用户模板列表必须是数组。");
  const normalized = templates.map(template => normalizeHeightTerrainTemplateProgram(template, {user: true}));
  const ids = new Set();
  for (const template of normalized) {
    if (ids.has(template.id)) throw new Error(`用户模板 id 重复：${template.id}`);
    ids.add(template.id);
  }
  return {
    documentType: HEIGHT_TERRAIN_TEMPLATE_DOCUMENT_TYPE,
    version: HEIGHT_TERRAIN_TEMPLATE_DOCUMENT_VERSION,
    templates: normalized
  };
}

export function parseHeightTerrainTemplateDocument(input) {
  let document;
  try {
    document = typeof input === "string" ? JSON.parse(input) : input;
  } catch {
    throw new Error("地形模板文件不是有效 JSON。");
  }
  if (!document || typeof document !== "object" || Array.isArray(document)) throw new Error("地形模板文档必须是对象。");
  if (document.documentType !== HEIGHT_TERRAIN_TEMPLATE_DOCUMENT_TYPE) throw new Error("文件不是 WebGL Generator 地形模板文档。");
  if (document.version !== HEIGHT_TERRAIN_TEMPLATE_DOCUMENT_VERSION) throw new Error(`不支持地形模板文档版本 ${String(document.version)}。`);
  return createHeightTerrainTemplateDocument(document.templates);
}

export function stringifyHeightTerrainTemplateDocument(templates = []) {
  return JSON.stringify(createHeightTerrainTemplateDocument(templates), null, 2);
}

export function loadHeightTerrainTemplateDocument(storage, key = HEIGHT_TERRAIN_TEMPLATE_STORAGE_KEY) {
  if (!storage?.getItem) throw new Error("当前环境不支持模板存储。");
  const raw = storage.getItem(key);
  return raw ? parseHeightTerrainTemplateDocument(raw) : createHeightTerrainTemplateDocument([]);
}

export function saveHeightTerrainTemplateDocument(storage, templates = [], key = HEIGHT_TERRAIN_TEMPLATE_STORAGE_KEY) {
  if (!storage?.setItem) throw new Error("当前环境不支持模板存储。");
  const document = createHeightTerrainTemplateDocument(templates);
  storage.setItem(key, JSON.stringify(document));
  return document;
}

function analyzeHeightTerrainTemplateProgram(map, programValue, options) {
  let templateProgram;
  try {
    templateProgram = normalizeHeightTerrainTemplateProgram(programValue);
  } catch (error) {
    const diagnostic = sourceDiagnostic(error.code || "invalid-terrain-template-program", "rejected", "unsupported", error.message || String(error));
    return {...invalidProgramSummary(programValue, diagnostic.message), diagnostics: [diagnostic]};
  }
  const cells = map?.grid?.cells;
  const heights = cells?.h;
  if (!heights?.length || !Array.isArray(cells.c)) return invalidProgramSummary(templateProgram, "当前地图缺少高度或共享边邻接，无法预览地形模板程序。");
  const allowedCells = normalizeAllowedCells(options.allowedCells);
  if (!allowedCells) return invalidProgramSummary(templateProgram, "地形模板程序需要先锁定一个地形选区。");

  const original = Array.from(heights, value => Number(value) || 0);
  const working = [...original];
  const workingMap = {...map, grid: {...map.grid, cells: {...cells, h: working}}};
  const baseSeed = Math.trunc(Number(options.seed) || 0);
  const scope = normalizeScope(options.scope);
  const stepSummaries = [];
  const diagnostics = [];
  for (let index = 0; index < templateProgram.steps.length; index++) {
    const step = templateProgram.steps[index];
    const stepScope = step.scope || scope;
    const stepSeed = baseSeed + (step.seedOffset || 0) + index;
    let stepChanges;
    let label;
    let diagnostic = null;
    try {
      if (isPresetOperation(step.operation)) {
        const stepOptions = {
          templateId: step.operation,
          intensity: step.intensity,
          targetHeight: step.targetHeight,
          terraceStep: step.terraceStep,
          amplitude: step.amplitude,
          seed: stepSeed,
          scope: stepScope,
          allowedCells
        };
        const preview = inspectHeightTerrainTemplate(workingMap, stepOptions);
        stepChanges = getHeightTerrainTemplateChanges(workingMap, stepOptions);
        label = preview.label || heightTerrainTemplateLabel(step.operation);
      } else {
        const result = getSourceCompatibleStepResult(workingMap, step, {scope: stepScope, allowedCells, seed: stepSeed});
        stepChanges = result.changes;
        diagnostic = result.diagnostic;
        label = sourceStepLabel(step);
      }
    } catch (error) {
      const rejected = sourceDiagnostic(error.code || "source-step-rejected", "rejected", "unsupported", error.message || String(error));
      diagnostics.push({index, operation: step.operation, ...rejected});
      return {
        ...invalidProgramSummary(templateProgram, `第 ${index + 1} 步${sourceStepLabel(step)}无法执行：${rejected.message}`),
        scope,
        seed: baseSeed,
        stepSummaries: [...stepSummaries, {index, operation: step.operation, label: sourceStepLabel(step), changeCount: 0, status: "rejected", compatibility: "unsupported", diagnostic: rejected}],
        diagnostics
      };
    }
    applyWorkingChanges(working, stepChanges);
    if (diagnostic) diagnostics.push({index, operation: step.operation, ...diagnostic});
    stepSummaries.push({
      index,
      operation: step.operation,
      label,
      changeCount: stepChanges.length,
      status: diagnostic?.status || "supported",
      compatibility: diagnostic?.compatibility || "native",
      ...(diagnostic ? {diagnostic} : {})
    });
  }

  const changes = [];
  let raisedCount = 0;
  let loweredCount = 0;
  let minBefore = Infinity;
  let maxBefore = -Infinity;
  let minAfter = Infinity;
  let maxAfter = -Infinity;
  let deltaSum = 0;
  for (let gridCell = 0; gridCell < original.length; gridCell++) {
    if (allowedCellWeight(allowedCells, gridCell) <= 0) continue;
    const before = original[gridCell];
    const after = working[gridCell];
    if (before === after) continue;
    changes.push({gridCell, before, after});
    const delta = after - before;
    if (delta > 0) raisedCount += 1;
    else loweredCount += 1;
    deltaSum += delta;
    minBefore = Math.min(minBefore, before);
    maxBefore = Math.max(maxBefore, before);
    minAfter = Math.min(minAfter, after);
    maxAfter = Math.max(maxAfter, after);
  }
  if (!changes.length) {
    return {
      ...invalidProgramSummary(templateProgram, `${templateProgram.name}不会改变当前锁定选区。`),
      scope,
      seed: baseSeed,
      stepSummaries,
      diagnostics
    };
  }
  const averageDelta = round(deltaSum / changes.length);
  return {
    programId: templateProgram.id,
    name: templateProgram.name,
    source: templateProgram.source || null,
    scope,
    seed: baseSeed,
    stepCount: templateProgram.steps.length,
    stepSummaries,
    diagnostics,
    changeCount: changes.length,
    changeChecksum: checksumChanges(changes),
    raisedCount,
    loweredCount,
    beforeRange: [minBefore, maxBefore],
    afterRange: [minAfter, maxAfter],
    averageDelta,
    valid: true,
    notice: `可应用${templateProgram.name} ${changes.length} cells，${templateProgram.steps.length} 步，高度 ${minBefore}..${maxBefore} → ${minAfter}..${maxAfter}，均变 ${averageDelta > 0 ? "+" : ""}${averageDelta}。`,
    changes
  };
}

function getSourceCompatibleStepResult(map, step, {scope, allowedCells, seed}) {
  const cells = map.grid.cells;
  const heights = Array.from(cells.h, value => Number(value) || 0);
  if (step.operation === "source-smooth") return sourceStepResult(smoothChanges(heights, cells.c, step, {scope, allowedCells}), "exact", "Source 平滑已按共享边邻接执行");
  if (step.operation === "source-strait") return sourceStraitResult(map, heights, step, {scope, allowedCells, seed});
  if (step.operation === "source-mask") return sourceStepResult(maskChanges(map, heights, step, {scope, allowedCells}), "exact", "Source 边缘遮罩已按全图归一化坐标执行");
  if (step.operation === "source-invert") return sourceInvertResult(map, heights, step, {scope, allowedCells, seed});
  if (step.operation !== "source-add" && step.operation !== "source-multiply") throw sourceStepError("source-operation-unsupported", `未支持的 Source 操作：${step.operation}`);
  const changes = [];
  for (let gridCell = 0; gridCell < heights.length; gridCell++) {
    const weight = allowedCellWeight(allowedCells, gridCell);
    if (weight <= 0) continue;
    const before = heights[gridCell];
    if (!matchesScopeAndRange(before, scope, step.range)) continue;
    let target = before;
    if (step.operation === "source-add") target = sourceAdd(before, step.value, step.range);
    else if (step.operation === "source-multiply") target = sourceMultiply(before, step.factor, step.range);
    const after = clampSourceHeight(before + (target - before) * weight, scope);
    if (after !== before) changes.push({gridCell, before, after});
  }
  const message = step.operation === "source-add" ? "Source 加值已精确映射" : "Source 乘算已精确映射";
  return sourceStepResult(changes, "exact", message);
}

function smoothChanges(initial, neighborsByCell, step, {scope, allowedCells}) {
  let working = [...initial];
  for (let iteration = 0; iteration < step.iterations; iteration++) {
    const source = [...working];
    working = source.map((before, gridCell) => {
      const weight = allowedCellWeight(allowedCells, gridCell);
      if (weight <= 0 || !matchesScopeAndRange(before, scope, step.range)) return before;
      const neighbors = (neighborsByCell[gridCell] || []).filter(neighbor => Number.isInteger(neighbor) && neighbor >= 0 && neighbor < source.length);
      const mean = (before + neighbors.reduce((sum, neighbor) => sum + source[neighbor], 0)) / (neighbors.length + 1);
      const target = step.factor === 1 ? mean : (before * (step.factor - 1) + mean) / step.factor;
      return clampSourceHeight(before + (target - before) * weight, scope);
    });
  }
  return working.flatMap((after, gridCell) => after === initial[gridCell] ? [] : [{gridCell, before: initial[gridCell], after}]);
}

function sourceStraitResult(map, heights, step, {scope, allowedCells, seed}) {
  const points = map.grid?.points;
  const neighbors = map.grid?.cells?.c;
  if (!Array.isArray(points) || points.length !== heights.length || !Array.isArray(neighbors)) throw sourceStepError("source-strait-geometry", "当前地图缺少海峡转换所需的点位或共享边邻接");
  const selected = selectedCellIds(allowedCells, heights.length);
  if (selected.length < 2) throw sourceStepError("source-strait-selection", "海峡转换至少需要两个已锁定 cell");
  const bounds = pointBounds(points, selected);
  const primarySpan = step.direction === "vertical" ? bounds.height : bounds.width;
  if (!(primarySpan > 0)) throw sourceStepError("source-strait-span", "锁定选区在海峡方向上没有有效跨度");

  const random = createRandom(`terrain-strait:${seed}:${step.direction}:${Array.isArray(step.width) ? step.width.join("-") : step.width}`);
  const resolvedWidth = Array.isArray(step.width) ? random.integer(step.width[0], step.width[1]) : step.width;
  const crossStart = 0.3 + random.next() * 0.4;
  const crossEnd = clamp01(1 - crossStart + (random.next() - 0.5) * 0.2);
  const startPoint = step.direction === "vertical"
    ? [bounds.minX + bounds.width * crossStart, bounds.minY]
    : [bounds.minX, bounds.minY + bounds.height * crossStart];
  const endPoint = step.direction === "vertical"
    ? [bounds.minX + bounds.width * crossEnd, bounds.maxY]
    : [bounds.maxX, bounds.minY + bounds.height * crossEnd];
  const allowedSet = new Set(selected);
  const start = closestSelectedCell(points, selected, startPoint);
  const end = closestSelectedCell(points, selected, endPoint, start);
  const path = findSelectionPath(points, neighbors, allowedSet, start, end, seed);
  if (path.length < 2) throw sourceStepError("source-strait-disconnected", "锁定选区无法形成贯穿两侧的共享边通道");

  const channel = [];
  const used = new Set();
  let frontier = [...path];
  for (let layer = 0; layer < resolvedWidth && frontier.length; layer++) {
    const next = new Set();
    for (const cell of frontier) {
      if (!allowedSet.has(cell) || used.has(cell)) continue;
      used.add(cell);
      channel.push({cell, layer});
      for (const neighbor of neighbors[cell] || []) if (allowedSet.has(neighbor) && !used.has(neighbor)) next.add(neighbor);
    }
    frontier = [...next];
  }

  const changes = [];
  for (const {cell, layer} of channel) {
    const before = heights[cell];
    if (!matchesScopeAndRange(before, scope, "all")) continue;
    const exponent = 0.8 + layer * (0.1 / Math.max(1, resolvedWidth));
    const target = Math.max(0, Math.min(100, before ** exponent));
    const weight = allowedCellWeight(allowedCells, cell);
    const after = clampSourceHeight(before + (target - before) * weight, scope);
    if (after !== before) changes.push({gridCell: cell, before, after});
  }
  return sourceStepResult(changes, "converted", `已生成${step.direction === "vertical" ? "纵向" : "横向"}确定性海峡，主路径 ${path.length} cells，宽度 ${resolvedWidth}`, {
    direction: step.direction,
    requestedWidth: Array.isArray(step.width) ? [...step.width] : step.width,
    width: resolvedWidth,
    pathCells: path.length,
    channelCells: channel.length
  });
}

function maskChanges(map, heights, step, {scope, allowedCells}) {
  const points = map.grid?.points;
  if (!Array.isArray(points) || points.length !== heights.length) throw sourceStepError("source-mask-geometry", "当前地图缺少遮罩所需的全图点位");
  const graphWidth = Number(map.grid?.metadata?.graphWidth) || Number(map.metadata?.graphWidth) || maxPointCoordinate(points, 0);
  const graphHeight = Number(map.grid?.metadata?.graphHeight) || Number(map.metadata?.graphHeight) || maxPointCoordinate(points, 1);
  if (!(graphWidth > 0) || !(graphHeight > 0)) throw sourceStepError("source-mask-bounds", "当前地图缺少遮罩所需的有效图幅尺寸");
  const factor = Math.abs(step.power) || 1;
  const changes = [];
  for (let gridCell = 0; gridCell < heights.length; gridCell++) {
    const weight = allowedCellWeight(allowedCells, gridCell);
    if (weight <= 0) continue;
    const before = heights[gridCell];
    if (!matchesScopeAndRange(before, scope, "all")) continue;
    const [x, y] = points[gridCell];
    const nx = 2 * x / graphWidth - 1;
    const ny = 2 * y / graphHeight - 1;
    let distance = (1 - nx ** 2) * (1 - ny ** 2);
    if (step.power < 0) distance = 1 - distance;
    const masked = before * distance;
    const target = (before * (factor - 1) + masked) / factor;
    const after = clampSourceHeight(before + (target - before) * weight, scope);
    if (after !== before) changes.push({gridCell, before, after});
  }
  return changes;
}

function sourceInvertResult(map, heights, step, {scope, allowedCells, seed}) {
  const columns = Number(map.grid?.metadata?.columns);
  const rows = Number(map.grid?.metadata?.rows);
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns <= 0 || rows <= 0 || columns * rows !== heights.length) {
    throw sourceStepError("source-invert-layout", "轴向镜像只支持带完整 columns / rows 的规则 grid；当前地图无法证明镜像索引");
  }
  const roll = createRandom(`terrain-invert:${seed}:${step.axes}`).next();
  if (step.probability <= 0 || step.probability < 1 && roll >= step.probability) {
    return {
      changes: [],
      diagnostic: sourceDiagnostic("source-invert-skipped", "skipped", "exact", `镜像概率门未命中（概率 ${step.probability}，固定采样 ${round(roll)}）`, {probability: step.probability, roll})
    };
  }
  const invertX = step.axes !== "y";
  const invertY = step.axes !== "x";
  const changes = [];
  for (let gridCell = 0; gridCell < heights.length; gridCell++) {
    const weight = allowedCellWeight(allowedCells, gridCell);
    if (weight <= 0) continue;
    const before = heights[gridCell];
    if (!matchesScopeAndRange(before, scope, "all")) continue;
    const column = gridCell % columns;
    const row = Math.floor(gridCell / columns);
    const sourceColumn = invertX ? columns - column - 1 : column;
    const sourceRow = invertY ? rows - row - 1 : row;
    const target = heights[sourceRow * columns + sourceColumn];
    const after = clampSourceHeight(before + (target - before) * weight, scope);
    if (after !== before) changes.push({gridCell, before, after});
  }
  return sourceStepResult(changes, "exact", `已按规则 grid 执行 ${step.axes} 轴镜像`, {axes: step.axes, probability: step.probability, roll});
}

function selectedCellIds(allowedCells, length) {
  const result = [];
  for (let cell = 0; cell < length; cell++) if (allowedCellWeight(allowedCells, cell) > 0) result.push(cell);
  return result;
}

function pointBounds(points, cells) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const cell of cells) {
    const [x, y] = points[cell];
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return {minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY};
}

function maxPointCoordinate(points, axis) {
  let max = 0;
  for (const point of points) max = Math.max(max, Number(point?.[axis]) || 0);
  return max;
}

function closestSelectedCell(points, cells, target, excluded = -1) {
  let closest = -1;
  let best = Infinity;
  for (const cell of cells) {
    if (cell === excluded && cells.length > 1) continue;
    const distance = pointDistanceSquared(points[cell], target);
    if (distance < best || distance === best && cell < closest) {
      closest = cell;
      best = distance;
    }
  }
  return closest;
}

function findSelectionPath(points, neighbors, allowed, start, end, seed) {
  const size = points.length;
  const best = new Float64Array(size);
  best.fill(Infinity);
  const previous = new Int32Array(size);
  previous.fill(-1);
  const closed = new Uint8Array(size);
  const queue = new MinPriorityQueue();
  best[start] = 0;
  queue.push(start, 0);
  let visited = 0;
  while (queue.length && visited < allowed.size) {
    const current = queue.pop();
    if (closed[current]) continue;
    closed[current] = 1;
    visited++;
    if (current === end) return reconstructPath(previous, end);
    for (const neighbor of neighbors[current] || []) {
      if (!allowed.has(neighbor) || closed[neighbor]) continue;
      const distance = Math.sqrt(pointDistanceSquared(points[current], points[neighbor]));
      const step = distance * (0.9 + deterministicUnit(seed, current, neighbor) * 0.2);
      const tentative = best[current] + step;
      if (tentative >= best[neighbor]) continue;
      best[neighbor] = tentative;
      previous[neighbor] = current;
      const heuristic = Math.sqrt(pointDistanceSquared(points[neighbor], points[end]));
      queue.push(neighbor, tentative + heuristic);
    }
  }
  return [];
}

function reconstructPath(previous, end) {
  const path = [];
  let current = end;
  while (current >= 0) {
    path.push(current);
    current = previous[current];
  }
  return path.reverse();
}

function pointDistanceSquared(left, right) {
  const dx = Number(left?.[0]) - Number(right?.[0]);
  const dy = Number(left?.[1]) - Number(right?.[1]);
  return dx * dx + dy * dy;
}

function deterministicUnit(seed, left, right) {
  const text = `${seed}:${Math.min(left, right)}:${Math.max(left, right)}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0xffffffff;
}

function sourceStepResult(changes, compatibility, message, details = {}) {
  return {
    changes,
    diagnostic: sourceDiagnostic(`source-step-${compatibility}`, changes.length ? "applied" : "no-change", compatibility, message, details)
  };
}

function sourceDiagnostic(code, status, compatibility, message, details = {}) {
  return {code, status, compatibility, message, ...details};
}

function sourceStepError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function normalizeProgramStep(value, index) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`地形模板第 ${index + 1} 步必须是对象。`);
  const sourceOperation = String(value.operation || value.templateId || "");
  const operation = SOURCE_OPERATION_ALIASES[sourceOperation] || sourceOperation;
  const scope = value.scope === undefined ? undefined : normalizeStrictScope(value.scope, index);
  const range = normalizeRange(value.range, index);
  if (isPresetOperation(operation)) {
    const step = {
      operation,
      intensity: numberInRange(value.intensity, 0.1, 1, 0.7, index, "强度")
    };
    if (scope) step.scope = scope;
    if (operation === "plateau" || operation === "basin") step.targetHeight = integerInRange(value.targetHeight, 0, 100, operation === "basin" ? 28 : 68, index, "目标高度");
    if (operation === "terraces") step.terraceStep = integerInRange(value.terraceStep, 2, 25, 10, index, "阶地间隔");
    if (operation === "rugged") {
      step.amplitude = integerInRange(value.amplitude, 1, 30, 12, index, "起伏幅度");
      step.seedOffset = integerInRange(value.seedOffset, -1000000, 1000000, 0, index, "seed 偏移");
    }
    return step;
  }
  if (operation === "source-add") return compactStep({operation, value: numberInRange(value.value, -100, 100, 0, index, "加值"), scope, range});
  if (operation === "source-multiply") return compactStep({operation, factor: numberInRange(value.factor, 0, 10, 1, index, "倍率"), scope, range});
  if (operation === "source-smooth") return compactStep({
    operation,
    factor: numberInRange(value.factor, 1, 10, 2, index, "平滑系数"),
    iterations: integerInRange(value.iterations, 1, 5, 1, index, "迭代次数"),
    scope,
    range
  });
  if (operation === "source-strait") return compactStep({
    operation,
    width: normalizeStraitWidth(value.width, index),
    direction: normalizeDirection(value.direction, index),
    seedOffset: integerInRange(value.seedOffset, -1000000, 1000000, 0, index, "seed 偏移"),
    scope
  });
  if (operation === "source-mask") return compactStep({
    operation,
    power: numberInRange(value.power, -10, 10, 1, index, "遮罩幂次"),
    scope
  });
  if (operation === "source-invert") return compactStep({
    operation,
    probability: numberInRange(value.probability ?? value.count, 0, 1, 1, index, "镜像概率"),
    axes: normalizeInvertAxes(value.axes, index),
    seedOffset: integerInRange(value.seedOffset, -1000000, 1000000, 0, index, "seed 偏移"),
    scope
  });
  const error = new Error(`地形模板第 ${index + 1} 步操作未知或尚未转换：${sourceOperation || "空"}`);
  error.code = "unknown-terrain-operation";
  throw error;
}

function program(value) {
  return Object.freeze(normalizeHeightTerrainTemplateProgram(value));
}

function normalizeId(value) {
  const id = String(value || "").trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(id)) throw new Error("地形模板 id 必须由 1 到 64 个字母、数字、点、下划线或连字符组成。");
  return id;
}

function normalizeText(value, label, maxLength) {
  const text = String(value || "").trim();
  if (!text || text.length > maxLength) throw new Error(`${label}长度必须为 1 到 ${maxLength} 个字符。`);
  return text;
}

function normalizeOptionalText(value, maxLength) {
  const text = String(value || "").trim();
  if (text.length > maxLength) throw new Error(`模板说明不能超过 ${maxLength} 个字符。`);
  return text;
}

function normalizeSourceMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("source 元数据必须是对象。");
  return {
    templateId: normalizeText(value.templateId, "source 模板 id", 60),
    compatibility: value.compatibility === "exact" ? "exact" : "converted",
    exactOperations: normalizeStringList(value.exactOperations),
    convertedOperations: normalizeStringList(value.convertedOperations),
    unsupportedOperations: normalizeStringList(value.unsupportedOperations)
  };
}

function normalizeStringList(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) throw new Error("source 操作列表必须是最多 20 项的数组。");
  return value.map(item => normalizeText(item, "source 操作", 30));
}

function normalizeRange(value, index) {
  if (value === undefined || value === null || value === "") return "all";
  if (value === "all" || value === "land" || value === "water") return value;
  if (!Array.isArray(value) || value.length !== 2) throw new Error(`地形模板第 ${index + 1} 步高度范围无效。`);
  const lower = integerInRange(value[0], 0, 100, null, index, "范围下限");
  const upper = integerInRange(value[1], 0, 100, null, index, "范围上限");
  if (lower > upper) throw new Error(`地形模板第 ${index + 1} 步高度范围下限不能大于上限。`);
  return [lower, upper];
}

function normalizeStrictScope(value, index) {
  if (value === "all" || value === "land" || value === "water") return value;
  throw new Error(`地形模板第 ${index + 1} 步作用范围无效。`);
}

function normalizeDirection(value, index) {
  const direction = value === undefined ? "vertical" : String(value);
  if (direction === "vertical" || direction === "horizontal") return direction;
  throw new Error(`地形模板第 ${index + 1} 步海峡方向必须是 vertical 或 horizontal。`);
}

function normalizeStraitWidth(value, index) {
  if (value === undefined || value === null || value === "") return 1;
  if (Array.isArray(value) && value.length === 2 || typeof value === "string" && /^\d+\s*-\s*\d+$/.test(value.trim())) {
    const [rawMin, rawMax] = Array.isArray(value) ? value : value.trim().split("-");
    const min = integerInRange(rawMin, 1, 50, null, index, "海峡宽度下限");
    const max = integerInRange(rawMax, 1, 50, null, index, "海峡宽度上限");
    if (min > max) throw new Error(`地形模板第 ${index + 1} 步海峡宽度下限不能大于上限。`);
    return [min, max];
  }
  return integerInRange(value, 1, 50, 1, index, "海峡宽度");
}

function normalizeInvertAxes(value, index) {
  const axes = value === undefined ? "both" : String(value);
  if (axes === "x" || axes === "y" || axes === "both") return axes;
  throw new Error(`地形模板第 ${index + 1} 步镜像轴必须是 x、y 或 both。`);
}

function normalizeScope(value) {
  return value === "land" || value === "water" ? value : "all";
}

function normalizeAllowedCells(value) {
  if (value instanceof Map || value instanceof Set) return value;
  if (Array.isArray(value) || ArrayBuffer.isView(value)) return new Set(value);
  return null;
}

function numberInRange(value, min, max, fallback, index, label) {
  const numeric = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) throw new Error(`地形模板第 ${index + 1} 步${label}必须在 ${min} 到 ${max} 之间。`);
  return numeric;
}

function integerInRange(value, min, max, fallback, index, label) {
  const numeric = numberInRange(value, min, max, fallback, index, label);
  if (!Number.isInteger(numeric)) throw new Error(`地形模板第 ${index + 1} 步${label}必须是整数。`);
  return numeric;
}

function compactStep(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function isPresetOperation(operation) {
  return operation === "plateau" || operation === "basin" || operation === "terraces" || operation === "rugged";
}

function sourceStepLabel(step) {
  if (step.operation === "source-add") return "Source 加值";
  if (step.operation === "source-multiply") return "Source 乘算";
  if (step.operation === "source-smooth") return "Source 平滑";
  if (step.operation === "source-strait") return `Source ${step.direction === "horizontal" ? "横向" : "纵向"}海峡`;
  if (step.operation === "source-mask") return "Source 边缘遮罩";
  if (step.operation === "source-invert") return "Source 轴向镜像";
  return "Source 操作";
}

function sourceAdd(before, value, range) {
  const target = before + value;
  return range === "land" ? Math.max(20, target) : target;
}

function sourceMultiply(before, factor, range) {
  return range === "land" ? (before - 20) * factor + 20 : before * factor;
}

function matchesScopeAndRange(height, scope, range) {
  if (scope === "land" && height < 20 || scope === "water" && height >= 20) return false;
  if (range === "land") return height >= 20;
  if (range === "water") return height < 20;
  if (Array.isArray(range)) return height >= range[0] && height <= range[1];
  return true;
}

function allowedCellWeight(allowedCells, gridCell) {
  if (allowedCells instanceof Map) {
    const value = Number(allowedCells.get(gridCell));
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  }
  return allowedCells.has(gridCell) ? 1 : 0;
}

function clampSourceHeight(value, scope) {
  let height = Math.max(0, Math.min(100, Math.trunc(Number(value) || 0)));
  if (scope === "land") height = Math.max(20, height);
  if (scope === "water") height = Math.min(19, height);
  return height;
}

function applyWorkingChanges(working, changes) {
  for (const change of changes) working[change.gridCell] = change.after;
}

function invalidProgramSummary(programValue, notice) {
  return {
    programId: programValue?.id || "",
    name: programValue?.name || "地形模板程序",
    source: programValue?.source || null,
    scope: "all",
    seed: 0,
    stepCount: Array.isArray(programValue?.steps) ? programValue.steps.length : 0,
    stepSummaries: [],
    diagnostics: [],
    changeCount: 0,
    changeChecksum: null,
    raisedCount: 0,
    loweredCount: 0,
    beforeRange: null,
    afterRange: null,
    averageDelta: 0,
    valid: false,
    notice,
    changes: []
  };
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function checksumChanges(changes) {
  let hash = 0x811c9dc5;
  for (const change of changes) {
    hash ^= Math.trunc(change.gridCell) >>> 0;
    hash = Math.imul(hash, 0x01000193);
    hash ^= Math.trunc(change.before) >>> 0;
    hash = Math.imul(hash, 0x01000193);
    hash ^= Math.trunc(change.after) >>> 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
