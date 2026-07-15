import {recalculateBiomeSuitability} from "../generator/biomes.js";
import {systemAffected} from "./edit-command-effects.js";

const WATER_LEVEL = 20;
const BIOME_ASSIGNMENT_STALE = Object.freeze(["cities", "states", "provinces", "religions", "markers", "zones", "military", "economy", "diplomacy"]);

export const BIOME_ASSIGNMENT_PREVIEW_EFFECTS = Object.freeze({
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
    packBefore: preview.packCells
      .filter(packCell => Number(map.pack.cells.g?.[packCell]) === gridCell)
      .map(packCell => ({packCell, before: Number(map.pack.cells.biome?.[packCell]) || 0}))
  })).filter(change => change.before !== change.after || change.packBefore.some(entry => entry.before !== change.after));
}

export function getBiomeBrushChanges(map, point, brush, originals) {
  const target = Number(brush?.targetId);
  const scope = String(brush?.scope || (target === 0 ? "water" : "land"));
  const radius = Math.max(1, Number(brush?.radius) || 1);
  const radiusSq = radius * radius;
  const changes = [];
  for (let gridCell = 0; gridCell < (map?.grid?.cells?.p?.length || 0); gridCell++) {
    const water = Number(map.grid.cells.h?.[gridCell]) < WATER_LEVEL;
    if (water !== (scope === "water")) continue;
    const pointIndex = map.grid.cells.p[gridCell];
    const cellPoint = map.grid.points?.[pointIndex];
    if (!cellPoint) continue;
    const dx = cellPoint[0] - point.x;
    const dy = cellPoint[1] - point.y;
    if (dx * dx + dy * dy > radiusSq || Number(map.grid.cells.biome?.[gridCell]) === target) continue;
    if (!originals.has(gridCell)) {
      originals.set(gridCell, {
        gridBefore: Number(map.grid.cells.biome?.[gridCell]) || 0,
        packBefore: packCellsForGrid(map, [gridCell]).map(packCell => ({packCell, before: Number(map.pack.cells.biome?.[packCell]) || 0}))
      });
    }
    changes.push({gridCell, before: originals.get(gridCell).gridBefore, after: target, packBefore: originals.get(gridCell).packBefore});
  }
  return changes;
}

export function applyBiomeAssignmentPreview(map, changes) {
  applyBiomeChanges(map, normalizeChanges(changes), "after");
}

export function createApplyBiomeAssignmentCommand(changes, {label = "生物群系归属"} = {}) {
  const normalized = normalizeChanges(changes);
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
      affected: systemAffected("biome-assignment", [{kind: "grid-cells", id: normalized.length}]),
      derived: ["biome-cells", "cell-colors", "population-carrying", "object-panels", "derived-stale"]
    },
    apply(context) {
      if (after) {
        restoreSnapshot(context.map, after);
        return;
      }
      const target = normalized[0]?.after;
      const preview = inspectBiomeAssignment(context.map, target, normalized.map(change => change.gridCell));
      if (!preview.valid) throw previewError(preview);
      before = captureSnapshot(context.map);
      applyBiomeChanges(context.map, normalized, "after");
      refreshBiomeDerived(context.map);
      result = {biomeId: target, gridCells: normalized.length, packCells: preview.packCells.length, warningCells: preview.warningCells, warnings: [...preview.warnings]};
      after = captureSnapshot(context.map);
    },
    revert(context) {
      if (!before) throw new Error("缺少可撤销的生物群系归属快照");
      restoreSnapshot(context.map, before);
    },
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

function refreshBiomeDerived(map) {
  const metadata = recalculateBiomeSuitability(map.grid, map.pack);
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

function inspectClimateWarnings(map, biomeId, gridCellIds) {
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

function packCellsForGrid(map, gridCellIds) {
  const selected = new Set(gridCellIds);
  const result = [];
  for (let packCell = 0; packCell < (map?.pack?.cells?.g?.length || 0); packCell++) if (selected.has(Number(map.pack.cells.g[packCell]))) result.push(packCell);
  return result;
}

function captureSnapshot(map) {
  return {
    gridBiome: Array.from(map.grid.cells.biome || []),
    gridSuitability: Array.from(map.grid.cells.s || []),
    gridPopulation: Array.from(map.grid.cells.pop || []),
    packBiome: Array.from(map.pack.cells.biome || []),
    packSuitability: Array.from(map.pack.cells.s || []),
    packPopulation: Array.from(map.pack.cells.pop || []),
    packRankInputs: clone(map.pack.metadata?.rankCellsInputs),
    climateMetadata: clone(map.climate?.metadata || {}),
    derivedStale: clone(map.metadata?.derivedStale),
    sectionStale: Object.fromEntries(["settlements", "markers", "zones", "military", "economy", "diplomacy"].map(kind => [kind, map[kind]?.metadata?.stale]))
  };
}

function restoreSnapshot(map, snapshot) {
  restoreField(map.grid.cells, "biome", snapshot.gridBiome);
  restoreField(map.grid.cells, "s", snapshot.gridSuitability);
  restoreField(map.grid.cells, "pop", snapshot.gridPopulation);
  restoreField(map.pack.cells, "biome", snapshot.packBiome);
  restoreField(map.pack.cells, "s", snapshot.packSuitability);
  restoreField(map.pack.cells, "pop", snapshot.packPopulation);
  if (snapshot.packRankInputs === undefined) delete map.pack.metadata.rankCellsInputs;
  else map.pack.metadata.rankCellsInputs = clone(snapshot.packRankInputs);
  map.climate.metadata = clone(snapshot.climateMetadata);
  if (snapshot.derivedStale === undefined) delete map.metadata.derivedStale;
  else map.metadata.derivedStale = clone(snapshot.derivedStale);
  for (const [kind, stale] of Object.entries(snapshot.sectionStale)) {
    if (!map[kind]?.metadata) continue;
    if (stale === undefined) delete map[kind].metadata.stale;
    else map[kind].metadata.stale = stale;
  }
}

function restoreField(owner, key, values) {
  const current = owner[key];
  if (Array.isArray(current)) owner[key] = [...values];
  else if (current?.constructor?.from) owner[key] = current.constructor.from(values);
  else owner[key] = [...values];
}

function invalidPreview(code, reason) {
  return {valid: false, code, reason, changed: false, gridCells: [], packCells: [], changedGridCells: [], changedPackCells: [], warningCells: 0, warnings: []};
}

function previewError(preview) {
  const error = new Error(preview.reason);
  error.code = preview.code;
  return error;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
