import {packCellsForGrid} from "./grid-pack-index.js";
import {BIOMES, resourceRankScore, suitabilityForPackCell, suitabilityRankInputs} from "../generator/biomes.js";
import {ensureSuitabilityStores, populationForSuitability} from "../generator/suitability.js";
import {captureSuitabilityEdit, restoreSuitabilityEdit, refreshSuitabilityGridCell} from "./suitability-edit-commands.js";
import {localFieldPaths} from "./local-edit-fields.js";
import {touchSuitabilityStats} from "./suitability-stat-index.js";
import {BRUSH_RADIUS_ID, normalizeBrushRadius} from "./brush-radius-contract.js";
import {queryBrushCellsInRadius} from "./height-cell-spatial-index.js";
import {systemAffected} from "./edit-command-effects.js";

const WATER_LEVEL = 20;
const BIOME_ASSIGNMENT_STALE = Object.freeze(["cities", "states", "provinces", "religions", "markers", "zones", "military", "economy", "diplomacy"]);

export const BIOME_ASSIGNMENT_PREVIEW_EFFECTS = Object.freeze({
  cellAttributePatch: true,
  reuseResourceBinding: true,
  render: "draw",
  selection: "none",
  runtimeStats: false,
  pickPanel: false,
  derived: Object.freeze(["biome-cells", "cell-colors"])
});

export function inspectBiomeAssignment(map, biomeId, gridCellIds, options = {}) {
  const target = Number(biomeId);
  const biomes = map?.climate?.biomes || [];
  if (!Number.isInteger(target) || !biomes.some(biome => Number(biome?.id) === target)) return invalidPreview("invalid-biome", `找不到生物群系 #${biomeId}`);
  const expectedScope = target === 0 ? "water" : "land";
  const scope = String(options.scope || expectedScope).trim().toLowerCase();
  if (!new Set(["land", "water"]).has(scope)) return invalidPreview("invalid-scope", "作用范围必须是 land 或 water");
  if (scope !== expectedScope) return invalidPreview("target-scope-mismatch", target === 0 ? "海洋群系只能用于水域" : "陆地群系不能用于水域");
  const ids = [...new Set((gridCellIds || []).map(Number))];
  const gridCount = map?.grid?.cells?.h?.length || 0;
  if (!ids.length) return invalidPreview("empty-cells", "至少需要一个 grid cell");
  if (ids.length > 4096) return invalidPreview("region-size", "单次生物群系编辑最多允许 4096 个 grid cells");
  if (ids.some(cell => !Number.isInteger(cell) || cell < 0 || cell >= gridCount)) return invalidPreview("invalid-cell", "生物群系编辑包含越界 grid cell");
  const mismatched = ids.filter(cell => (Number(map.grid.cells.h[cell]) < WATER_LEVEL) !== (scope === "water"));
  if (mismatched.length) return invalidPreview("land-water-mismatch", `有 ${mismatched.length} 个 cells 与目标陆水范围不匹配`);
  const packCells = packCellsForGrid(map, ids);
  if (!packCells.length) return invalidPreview("missing-pack-cells", "目标 grid cells 没有对应 pack cells");
  const packMismatch = packCells.filter(cell => (Number(map.pack.cells.h?.[cell]) < WATER_LEVEL) !== (scope === "water"));
  if (packMismatch.length) return invalidPreview("land-water-mismatch", `有 ${packMismatch.length} 个 pack cells 与目标陆水范围不匹配`);
  const changedGridCells = ids.filter(cell => Number(map.grid.cells.biome?.[cell]) !== target);
  const changedPackCells = packCells.filter(cell => Number(map.pack.cells.biome?.[cell]) !== target);
  const warnings = inspectClimateWarnings(map, target, changedGridCells);
  return {
    valid: true,
    code: "ok",
    reason: "",
    biomeId: target,
    scope,
    gridCells: ids,
    packCells,
    changedGridCells,
    changedPackCells,
    warningCells: warnings.cells,
    warnings: warnings.reasons,
    changed: Boolean(changedGridCells.length || changedPackCells.length)
  };
}

export function buildBiomeAssignmentChanges(map, biomeId, gridCellIds, options = {}) {
  const preview = inspectBiomeAssignment(map, biomeId, gridCellIds, options);
  if (!preview.valid) throw previewError(preview);
  return preview.gridCells.map(gridCell => ({
    gridCell,
    before: Number(map.grid.cells.biome?.[gridCell]) || 0,
    after: preview.biomeId,
    packBefore: packCellsForGrid(map, [gridCell])
      .map(packCell => ({packCell, before: Number(map.pack.cells.biome?.[packCell]) || 0}))
  })).filter(change => change.before !== change.after || change.packBefore.some(entry => entry.before !== change.after));
}

export function getBiomeBrushChanges(map, point, brush, originals, anchorGridCell = null) {
  const target = Number(brush?.targetId);
  const scope = String(brush?.scope || (target === 0 ? "water" : "land"));
  const radius = normalizeBrushRadius(BRUSH_RADIUS_ID.BIOME, brush?.radius);
  const changes = [];
  for (const {gridCell} of queryBrushCellsInRadius(map, point, radius, anchorGridCell)) {
    const water = Number(map.grid.cells.h?.[gridCell]) < WATER_LEVEL;
    if (water !== (scope === "water")) continue;
    if (originals.has(gridCell)) continue;
    const packCells = packCellsForGrid(map, [gridCell]);
    if (packCells.some(cell => (map.pack.cells.h[cell] < WATER_LEVEL) !== water)) continue;
    if (Number(map.grid.cells.biome?.[gridCell]) === target && packCells.every(cell => map.pack.cells.biome[cell] === target)) continue;
    const gridBefore = Number(map.grid.cells.biome?.[gridCell]) || 0;
    const packBefore = packCells.map(packCell => ({packCell, before: Number(map.pack.cells.biome?.[packCell]) || 0}));
    originals.set(gridCell, {gridBefore, packBefore});
    changes.push({gridCell, before: gridBefore, after: target, packBefore});
  }
  return changes;
}

export function applyBiomeAssignmentPreview(map, changes) {
  applyBiomeChanges(map, normalizeChanges(changes), "after");
}

export function createApplyBiomeAssignmentCommand(changes, {label = "生物群系归属"} = {}) {
  const normalized = normalizeChanges(changes);
  const grid = normalized.map(change => change.gridCell);
  const pack = normalized.flatMap(change => change.packBefore.map(entry => entry.packCell));
  const rows = {"grid.cells.biome": grid, "grid.cells.s": grid, "grid.cells.pop": grid,
    "pack.cells.biome": pack, "pack.cells.s": pack, "pack.cells.pop": pack, "pack.cells.suitabilityBase": pack};
  let fields;
  let before = null;
  let after = null;
  let result = null;
  return {
    label: `${label} ${normalized.length} cells`,
    domain: "biome",
    effects: {
      render: "draw",
      selection: "refresh",
      runtimeStats: true,
      pickPanel: true,
      cellAttributePatch: true,
      changedGridCells: normalized.map(change => change.gridCell),
      affected: systemAffected("biome-assignment", [{kind: "grid-cells", id: normalized.length}]),
      derived: ["biome-cells", "cell-colors", "population-carrying", "object-panels", "derived-stale"]
    },
    apply(context) {
      if (after) {
        restoreSuitabilityEdit(context.map, after, rows);
        return;
      }
      const target = normalized[0]?.after;
      const preview = inspectBiomeAssignment(context.map, target, normalized.map(change => change.gridCell));
      if (!preview.valid) throw previewError(preview);
      ensureSuitabilityStores(context.map.pack);
      fields = localFieldPaths(context.map, ["climate.metadata.biomeCounts", "climate.metadata.maxPopulation",
        "climate.metadata.maxSuitability", "climate.metadata.positiveSuitabilityCells", "climate.metadata.positivePopulationCells",
        "climate.metadata.manualSuitabilityCells", "climate.metadata.rankCellsInputs", "pack.metadata.rankCellsInputs",
        "metadata.derivedStale", ...["settlements", "markers", "zones", "military", "economy", "diplomacy"]
          .filter(section => context.map[section]?.metadata).map(section => section + ".metadata.stale")]);
      before = captureSuitabilityEdit(context.map, rows, fields);
      try {
        applyBiomeChanges(context.map, normalized, "after");
        refreshBiomeDerived(context.map, grid, pack);
        after = captureSuitabilityEdit(context.map, rows, fields);
      } catch (error) {
        restoreSuitabilityEdit(context.map, before, rows);
        throw error;
      }
      result = {biomeId: target, gridCells: normalized.length, packCells: preview.packCells.length, warningCells: preview.warningCells, warnings: [...preview.warnings]};
    },
    revert(context) {
      if (!before) throw new Error("缺少可撤销的生物群系归属快照");
      restoreSuitabilityEdit(context.map, before, rows);
    },
    getReplicaFields: () => fields,
    getReplicaRows: () => rows,
    isNoop() {
      return !normalized.length || normalized.every(change => change.before === change.after && change.packBefore.every(entry => entry.before === change.after));
    },
    getChanges() {
      return normalized.map(change => ({...change, packBefore: change.packBefore.map(entry => ({...entry}))}));
    },
    getResult() {
      return result ? {...result, warnings: [...result.warnings]} : null;
    }
  };
}

function refreshBiomeDerived(map, gridIds, packIds) {
  const cells = map.pack.cells;
  const inputs = suitabilityRankInputs(map.pack);
  for (const cell of packIds) {
    const base = Math.max(0, Math.min(32767, suitabilityForPackCell(map.pack, cell, inputs)));
    cells.suitabilityBase[cell] = base;
    cells.s[cell] = cells.suitabilityOverride[cell] >= 0 ? cells.suitabilityOverride[cell] : base;
    cells.pop[cell] = Math.fround(populationForSuitability(cells, cell, cells.s[cell], inputs.meanArea || 1));
  }
  for (const id of gridIds) refreshSuitabilityGridCell(map, id);
  touchSuitabilityStats(map, gridIds, packIds);
  const rank = {hasGoodsAtRankTime: Boolean(cells.good), resourceRankBonusCells: 0, resourceRankBonusTotal: 0};
  const metadata = {biomeCounts: {}, positiveSuitabilityCells: 0, positivePopulationCells: 0,
    maxSuitability: 0, maxPopulation: 0, manualSuitabilityCells: 0, rankCellsInputs: rank};
  for (const id of cells.i) {
    const biome = cells.biome[id];
    metadata.biomeCounts[biome] = (metadata.biomeCounts[biome] || 0) + 1;
    if (cells.s[id] > 0) metadata.positiveSuitabilityCells++;
    if (cells.pop[id] > 0) metadata.positivePopulationCells++;
    if (cells.suitabilityOverride[id] >= 0) metadata.manualSuitabilityCells++;
    metadata.maxSuitability = Math.max(metadata.maxSuitability, cells.s[id]);
    metadata.maxPopulation = Math.max(metadata.maxPopulation, cells.pop[id]);
    if (cells.h[id] < WATER_LEVEL || !BIOMES[biome]?.habitability) continue;
    const bonus = resourceRankScore(map.pack, id);
    if (bonus > 0) {
      rank.resourceRankBonusCells++;
      rank.resourceRankBonusTotal += bonus;
    }
  }
  rank.resourceRankBonusTotal = Math.round(rank.resourceRankBonusTotal * 100) / 100;
  map.pack.metadata.rankCellsInputs = rank;
  metadata.maxPopulation = Math.round(metadata.maxPopulation * 1000) / 1000;
  map.climate.metadata = {...(map.climate.metadata || {}), ...metadata};
  map.metadata.derivedStale = {
    ...(map.metadata.derivedStale || {}),
    systems: [...new Set([...(map.metadata.derivedStale?.systems || []), ...BIOME_ASSIGNMENT_STALE])],
    updatedAt: new Date().toISOString()
  };
  for (const kind of ["settlements", "markers", "zones", "military", "economy", "diplomacy"]) {
    if (map[kind]?.metadata) map[kind].metadata.stale = true;
  }
}

export function inspectClimateWarnings(map, biomeId, gridCellIds) {
  const reasons = new Set();
  let cells = 0;
  for (const gridCell of gridCellIds) {
    const temperature = Number(map.grid.cells.temp?.[gridCell]) || 0;
    const precipitation = Number(map.grid.cells.prec?.[gridCell]) || 0;
    const height = Number(map.grid.cells.h?.[gridCell]) || 0;
    const warnings = [];
    if (biomeId === 11 && temperature > 0) warnings.push("冰川温度偏高");
    if (biomeId === 1 && (temperature < 15 || precipitation > 24)) warnings.push("热沙漠气候不匹配");
    if ([2, 9, 10].includes(biomeId) && temperature > 18) warnings.push("寒冷群系温度偏高");
    if ([5, 7].includes(biomeId) && temperature < 12) warnings.push("热带群系温度偏低");
    if ([7, 8].includes(biomeId) && precipitation < 18) warnings.push("雨林降水偏低");
    if (biomeId === 12 && (temperature <= -2 || height >= 60)) warnings.push("湿地高度或温度不匹配");
    if (!warnings.length) continue;
    cells++;
    for (const warning of warnings) reasons.add(warning);
  }
  return {cells, reasons: [...reasons]};
}

function normalizeChanges(changes) {
  const byGrid = new Map();
  for (const change of changes || []) {
    const gridCell = Number(change?.gridCell);
    const before = Number(change?.before);
    const after = Number(change?.after);
    if (!Number.isInteger(gridCell) || !Number.isInteger(before) || !Number.isInteger(after)) continue;
    byGrid.set(gridCell, {
      gridCell,
      before,
      after,
      packBefore: (change.packBefore || []).map(entry => ({packCell: Number(entry.packCell), before: Number(entry.before) || 0})).filter(entry => Number.isInteger(entry.packCell))
    });
  }
  return [...byGrid.values()].sort((a, b) => a.gridCell - b.gridCell);
}

function applyBiomeChanges(map, changes, key) {
  for (const change of changes) {
    const value = Number(change[key]);
    map.grid.cells.biome[change.gridCell] = value;
    for (const entry of change.packBefore) map.pack.cells.biome[entry.packCell] = value;
  }
}


function invalidPreview(code, reason) {
  return {valid: false, code, reason, changed: false, gridCells: [], packCells: [], changedGridCells: [], changedPackCells: [], warningCells: 0, warnings: []};
}

function previewError(preview) {
  const error = new Error(preview.reason);
  error.code = preview.code;
  return error;
}
