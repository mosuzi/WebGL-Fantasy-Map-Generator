import {
  getHeightTerrainTemplateChanges,
  heightTerrainTemplateLabel,
  heightTerrainTemplateUsesSeed,
  inspectHeightTerrainTemplate
} from "./height-terrain-templates.js";

export const HEIGHT_TERRAIN_TEMPLATE_DOCUMENT_TYPE = "webgl-generator-height-terrain-templates";
export const HEIGHT_TERRAIN_TEMPLATE_DOCUMENT_VERSION = 1;
export const HEIGHT_TERRAIN_TEMPLATE_STORAGE_KEY = "webgl-generator-height-terrain-templates-v1";

export const SOURCE_HEIGHT_TEMPLATE_COMPATIBILITY = Object.freeze({
  exact: Object.freeze(["Add", "Multiply", "Smooth"]),
  converted: Object.freeze(["Hill", "Pit", "Range", "Trough"]),
  unsupported: Object.freeze(["Strait", "Mask", "Invert"])
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
    description: "由原版 Archipelago 模板转换：Add / Smooth 精确映射，Range / Hill / Trough 转为稳定破碎塑形，Strait 明确省略。",
    source: {
      templateId: "archipelago",
      compatibility: "converted",
      exactOperations: ["Add", "Smooth"],
      convertedOperations: ["Range", "Hill", "Trough"],
      unsupportedOperations: ["Strait"]
    },
    steps: [
      {operation: "source-add", value: 11, range: "all"},
      {operation: "rugged", intensity: 0.8, amplitude: 18, seedOffset: 29},
      {operation: "source-smooth", factor: 3, iterations: 1},
      {operation: "rugged", intensity: 0.35, amplitude: 8, seedOffset: 61}
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
    return normalizeHeightTerrainTemplateProgram(programValue).steps.some(step => step.operation === "rugged");
  } catch {
    return false;
  }
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
    return invalidProgramSummary(programValue, error.message);
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
  for (let index = 0; index < templateProgram.steps.length; index++) {
    const step = templateProgram.steps[index];
    const stepScope = step.scope || scope;
    const stepSeed = baseSeed + (step.seedOffset || 0) + index;
    let stepChanges;
    let label;
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
      stepChanges = getSourceCompatibleStepChanges(workingMap, step, {scope: stepScope, allowedCells});
      label = sourceStepLabel(step);
    }
    applyWorkingChanges(working, stepChanges);
    stepSummaries.push({index, operation: step.operation, label, changeCount: stepChanges.length});
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
      stepSummaries
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

function getSourceCompatibleStepChanges(map, step, {scope, allowedCells}) {
  const cells = map.grid.cells;
  const heights = Array.from(cells.h, value => Number(value) || 0);
  if (step.operation === "source-smooth") return smoothChanges(heights, cells.c, step, {scope, allowedCells});
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
  return changes;
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

function normalizeProgramStep(value, index) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`地形模板第 ${index + 1} 步必须是对象。`);
  const operation = String(value.operation || value.templateId || "");
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
  throw new Error(`地形模板第 ${index + 1} 步操作未知：${operation || "空"}`);
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
  return "Source 平滑";
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
