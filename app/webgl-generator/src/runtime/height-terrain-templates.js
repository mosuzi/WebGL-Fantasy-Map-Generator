export const HEIGHT_TERRAIN_TEMPLATE_PRESETS = Object.freeze([
  Object.freeze({id: "plateau", label: "高原塑形", description: "把选区向目标高度收束，并保留少量邻域起伏。"}),
  Object.freeze({id: "basin", label: "盆地塑形", description: "把选区向较低目标高度收束，形成平缓洼地。"}),
  Object.freeze({id: "terraces", label: "阶地量化", description: "把高度吸附到固定间隔，形成层级地貌。"}),
  Object.freeze({id: "rugged", label: "破碎地形", description: "用稳定 seed 叠加连续局部起伏。"})
]);

const TEMPLATE_IDS = new Set(HEIGHT_TERRAIN_TEMPLATE_PRESETS.map(template => template.id));

export function getHeightTerrainTemplateChanges(map, options = {}) {
  return analyzeHeightTerrainTemplate(map, options).changes;
}

export function inspectHeightTerrainTemplate(map, options = {}) {
  const {changes, ...summary} = analyzeHeightTerrainTemplate(map, options);
  return summary;
}

export function heightTerrainTemplateLabel(templateId) {
  return HEIGHT_TERRAIN_TEMPLATE_PRESETS.find(template => template.id === templateId)?.label || "地形模板";
}

export function heightTerrainTemplateUsesSeed(templateId) {
  return templateId === "rugged";
}

function analyzeHeightTerrainTemplate(map, options) {
  const cells = map?.grid?.cells;
  const heights = cells?.h;
  const templateId = normalizeTemplateId(options.templateId);
  const scope = normalizeScope(options.scope);
  const intensity = normalizeIntensity(options.intensity);
  const targetHeight = normalizeHeight(options.targetHeight, templateId === "basin" ? 28 : 68);
  const terraceStep = normalizeInteger(options.terraceStep, 2, 25, 10);
  const amplitude = normalizeInteger(options.amplitude, 1, 30, 12);
  const seed = Math.trunc(Number(options.seed) || 0);
  const allowedCells = normalizeAllowedCells(options.allowedCells);
  const allowedSummary = summarizeAllowedCells(allowedCells);
  const base = {
    templateId: templateId || String(options.templateId || ""),
    label: heightTerrainTemplateLabel(templateId),
    scope,
    intensity,
    targetHeight,
    terraceStep,
    amplitude,
    seed,
    selectionLimited: Boolean(allowedCells),
    ...allowedSummary,
    selectedCount: 0,
    changeCount: 0,
    unchangedCount: 0,
    raisedCount: 0,
    loweredCount: 0,
    beforeRange: null,
    afterRange: null,
    averageDelta: 0,
    valid: false,
    notice: "",
    changes: []
  };
  if (!heights?.length || !Array.isArray(cells.c)) return {...base, notice: "当前地图缺少高度或共享边邻接，无法预览地形模板。"};
  if (!templateId) return {...base, notice: "未知的地形模板。"};
  if (!allowedCells) return {...base, notice: "地形模板需要先锁定一个地形选区。"};

  const sourceHeights = Array.from(heights, value => Number(value) || 0);
  const changes = [];
  let selectedCount = 0;
  let raisedCount = 0;
  let loweredCount = 0;
  let minBefore = Infinity;
  let maxBefore = -Infinity;
  let minAfter = Infinity;
  let maxAfter = -Infinity;
  let deltaSum = 0;
  for (let gridCell = 0; gridCell < sourceHeights.length; gridCell++) {
    const selectionWeight = allowedCellWeight(allowedCells, gridCell);
    if (selectionWeight <= 0) continue;
    const before = sourceHeights[gridCell];
    if (!matchesScope(before, scope)) continue;
    selectedCount += 1;
    minBefore = Math.min(minBefore, before);
    maxBefore = Math.max(maxBefore, before);
    const fullTarget = templateTargetHeight(templateId, gridCell, sourceHeights, cells.c, {
      scope,
      targetHeight,
      terraceStep,
      amplitude,
      seed
    });
    const after = clampHeightToScope(before + (fullTarget - before) * intensity * selectionWeight, scope);
    minAfter = Math.min(minAfter, after);
    maxAfter = Math.max(maxAfter, after);
    if (after === before) continue;
    const delta = after - before;
    deltaSum += delta;
    if (delta > 0) raisedCount += 1;
    else loweredCount += 1;
    changes.push({gridCell, before, after});
  }

  if (!selectedCount) return {...base, notice: "锁定选区与当前作用范围没有可预览的 cells。"};
  const summary = {
    ...base,
    selectedCount,
    changeCount: changes.length,
    unchangedCount: selectedCount - changes.length,
    raisedCount,
    loweredCount,
    beforeRange: [minBefore, maxBefore],
    afterRange: [minAfter, maxAfter],
    averageDelta: changes.length ? round(deltaSum / changes.length) : 0,
    changes
  };
  if (!changes.length) return {...summary, notice: `${summary.label}不会改变当前 ${selectedCount} cells。`};
  const featherNotice = summary.selectionFeathered ? `，选区权重 ${summary.selectionWeightRange.join("..")}` : "";
  const signedAverage = summary.averageDelta > 0 ? `+${summary.averageDelta}` : String(summary.averageDelta);
  return {
    ...summary,
    valid: true,
    notice: `可应用${summary.label} ${changes.length}/${selectedCount} cells，高度 ${minBefore}..${maxBefore} → ${minAfter}..${maxAfter}，均变 ${signedAverage}${featherNotice}。`
  };
}

function templateTargetHeight(templateId, gridCell, heights, neighborsByCell, options) {
  const before = heights[gridCell];
  if (templateId === "plateau" || templateId === "basin") {
    const neighborMean = meanNeighborHeight(gridCell, heights, neighborsByCell, options.scope, before);
    const targetMix = templateId === "plateau" ? 0.72 : 0.64;
    return clampHeight(before * (1 - targetMix) + options.targetHeight * targetMix + (neighborMean - before) * 0.12);
  }
  if (templateId === "terraces") {
    const baseline = options.scope === "land" ? 20 : 0;
    return clampHeight(baseline + Math.round((before - baseline) / options.terraceStep) * options.terraceStep);
  }
  const ownNoise = stableSignedNoise(gridCell, options.seed);
  const neighbors = (neighborsByCell[gridCell] || []).filter(neighbor => Number.isInteger(neighbor) && neighbor >= 0 && neighbor < heights.length);
  const neighborNoise = neighbors.length ? neighbors.reduce((sum, neighbor) => sum + stableSignedNoise(neighbor, options.seed), 0) / neighbors.length : ownNoise;
  return clampHeight(before + (ownNoise * 0.72 + neighborNoise * 0.28) * options.amplitude);
}

function meanNeighborHeight(gridCell, heights, neighborsByCell, scope, fallback) {
  const neighbors = (neighborsByCell[gridCell] || []).filter(neighbor => Number.isInteger(neighbor) && neighbor >= 0 && neighbor < heights.length && matchesScope(heights[neighbor], scope));
  return neighbors.length ? neighbors.reduce((sum, neighbor) => sum + heights[neighbor], 0) / neighbors.length : fallback;
}

function normalizeTemplateId(value) {
  const templateId = String(value || "");
  return TEMPLATE_IDS.has(templateId) ? templateId : null;
}

function normalizeScope(value) {
  return value === "land" || value === "water" ? value : "all";
}

function normalizeIntensity(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0.1, Math.min(1, numeric)) : 0.7;
}

function normalizeHeight(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric))) : fallback;
}

function normalizeInteger(value, min, max, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, Math.round(numeric))) : fallback;
}

function normalizeAllowedCells(value) {
  if (value instanceof Map || value instanceof Set) return value;
  if (Array.isArray(value) || ArrayBuffer.isView(value)) return new Set(value);
  return null;
}

function allowedCellWeight(allowedCells, gridCell) {
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
  return {selectionFeathered: found && min < 1, selectionWeightRange: found ? [round(min), round(max)] : null};
}

function matchesScope(height, scope) {
  if (scope === "land") return height >= 20;
  if (scope === "water") return height < 20;
  return true;
}

function clampHeightToScope(value, scope) {
  const height = clampHeight(value);
  if (scope === "land") return Math.max(20, height);
  if (scope === "water") return Math.min(19, height);
  return height;
}

function clampHeight(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function stableSignedNoise(gridCell, seed) {
  let value = (Math.trunc(gridCell) + 1) ^ Math.imul(Math.trunc(seed) + 1, 0x9e3779b1);
  value = Math.imul(value ^ value >>> 16, 0x21f0aaad);
  value = Math.imul(value ^ value >>> 15, 0x735a2d97);
  value ^= value >>> 15;
  return (value >>> 0) / 0xffffffff * 2 - 1;
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}
