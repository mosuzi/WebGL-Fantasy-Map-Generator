import {captureLocalFields, localFieldPaths, restoreLocalFields} from "./local-edit-fields.js";
import {invalidateSuitabilityStats, readEditedSuitabilityStats, touchSuitabilityStats} from "./suitability-stat-index.js";
import {packCellsForGrid} from "./grid-pack-index.js";
import {
  applySuitabilityOverrides,
  ensureSuitabilityStores,
  mirrorSuitabilityPopulationToGrid,
  populationForSuitability,
  SUITABILITY_OVERRIDE_UNSET,
  SUITABILITY_VALUE_RANGE
} from "../generator/suitability.js";
import {BRUSH_RADIUS_ID, normalizeBrushRadius} from "./brush-radius-contract.js";
import {queryBrushCellsInRadius} from "./height-cell-spatial-index.js";
import {captureClimatePopulation, restoreClimatePopulation} from "./climate-population-preservation.js";
import {systemAffected} from "./edit-command-effects.js";

export const SUITABILITY_EDIT_MODE = Object.freeze({SET: "set", RESET: "reset"});
export const SUITABILITY_EDIT_SCOPE = Object.freeze({LAND: "land", WATER: "water", ALL: "all"});
export const SUITABILITY_PREVIEW_EFFECTS = Object.freeze({
  reuseResourceBinding: true,
  render: "draw",
  selection: "none",
  runtimeStats: false,
  pickPanel: true,
  cellAttributePatch: true,
  derived: Object.freeze(["suitability-cells", "population-carrying", "cell-colors"])
});

const meanAreas = new WeakMap();
const STALE_SYSTEMS = Object.freeze(["cities", "states", "provinces", "religions", "markers", "zones", "military", "economy", "diplomacy"]);
const STALE_SECTIONS = Object.freeze(["settlements", "markers", "zones", "military", "economy", "diplomacy"]);

export function normalizeSuitabilityMap(map) {
  if (!map?.pack?.cells || !map?.grid?.cells) return map;
  ensureSuitabilityStores(map.pack);
  refreshSuitabilityDerived(map, {markStale: false, preservePopulation: true});
  return map;
}

export function inspectSuitabilityEdit(map, gridCellIds, options = {}) {
  const request = normalizeRequest(options);
  if (!request.valid) return invalidInspection(request.code, request.reason, request);
  const gridCount = map?.grid?.cells?.h?.length || 0;
  const gridCells = [...new Set((gridCellIds || []).map(Number))].sort((a, b) => a - b);
  if (!gridCells.length) return invalidInspection("empty-cells", "至少需要一个 grid cell", request);
  if (gridCells.length > 4096) return invalidInspection("region-size", "单次适居度编辑最多允许 4096 个 grid cells", request);
  if (gridCells.some(cell => !Number.isInteger(cell) || cell < 0 || cell >= gridCount)) return invalidInspection("invalid-cell", "适居度编辑包含越界 grid cell", request);
  const mismatchedGrid = gridCells.filter(cell => !matchesScope(Number(map.grid.cells.h?.[cell]), request.scope));
  if (mismatchedGrid.length) return invalidInspection("land-water-mismatch", `有 ${mismatchedGrid.length} 个 grid cells 与作用范围不匹配`, request);
  const packCells = packCellsForGrid(map, gridCells);
  if (!packCells.length) return invalidInspection("missing-pack-cells", "目标 grid cells 没有对应 pack cells", request);
  const mismatchedPack = packCells.filter(cell => !matchesScope(Number(map.pack.cells.h?.[cell]), request.scope));
  if (mismatchedPack.length) return invalidInspection("land-water-mismatch", `有 ${mismatchedPack.length} 个 pack cells 与作用范围不匹配`, request);
  const changedPackCells = packCells.filter(cell => desiredPackState(map, cell, request).changed);
  const changedGrid = new Set(changedPackCells.map(cell => Number(map.pack.cells.g[cell])));
  const changedGridCells = gridCells.filter(cell => changedGrid.has(cell));
  return {
    valid: true,
    code: "ok",
    reason: "",
    mode: request.mode,
    scope: request.scope,
    value: request.value,
    gridCells,
    packCells,
    changedGridCells,
    changedPackCells,
    landPackCells: packCells.filter(cell => Number(map.pack.cells.h?.[cell]) >= 20).length,
    waterPackCells: packCells.filter(cell => Number(map.pack.cells.h?.[cell]) < 20).length,
    changed: changedPackCells.length > 0
  };
}

export function buildSuitabilityChanges(map, gridCellIds, options = {}) {
  const inspection = inspectSuitabilityEdit(map, gridCellIds, options);
  if (!inspection.valid) throw inspectionError(inspection);
  const meanArea = meanCellArea(map.pack.cells.area);
  return inspection.changedGridCells.map(gridCell => createGridChange(map, gridCell, inspection, meanArea)).filter(change => change.packChanges.length);
}

export function getSuitabilityBrushChanges(map, point, brush, originals, anchorGridCell = null) {
  const request = normalizeRequest(brush);
  if (!request.valid) return [];
  const radius = normalizeBrushRadius(BRUSH_RADIUS_ID.SUITABILITY, brush?.radius);
  const meanArea = meanCellArea(map?.pack?.cells?.area);
  const changes = [];
  for (const {gridCell} of queryBrushCellsInRadius(map, point, radius, anchorGridCell)) {
    if (!matchesScope(Number(map.grid.cells.h?.[gridCell]), request.scope)) continue;
    const packCells = packCellsForGrid(map, [gridCell]);
    if (!packCells.length || packCells.some(cell => !matchesScope(Number(map.pack.cells.h?.[cell]), request.scope))) continue;
    if (!originals.has(gridCell)) originals.set(gridCell, captureGridOriginal(map, gridCell, packCells));
    const change = createGridChangeFromOriginal(map, gridCell, originals.get(gridCell), request, meanArea);
    if (change.packChanges.some(entry => !samePackState(readPackState(map, entry.packCell), entry.after))) changes.push(change);
  }
  return changes;
}

export function buildSuitabilityStrokeChanges(map, originals) {
  const changes = [];
  for (const [gridCell, original] of originals || []) {
    const packChanges = (original.packBefore || []).map(before => ({
      packCell: before.packCell,
      before: {...before},
      after: readPackState(map, before.packCell)
    })).filter(entry => !samePackState(entry.before, entry.after));
    if (packChanges.length) changes.push({gridCell, packChanges});
  }
  return changes.sort((a, b) => a.gridCell - b.gridCell);
}

export function applySuitabilityPreview(map, changes) {
  applySuitabilityChanges(map, normalizeChanges(changes), "after");
}

export function restoreSuitabilityPreview(map, changes, originals) {
  applySuitabilityChanges(map, normalizeChanges(changes), "before");
  if (originals) for (const [id, {gridBefore}] of originals) {
    map.grid.cells.s[id] = gridBefore.suitability;
    map.grid.cells.pop[id] = gridBefore.population;
  }
}

export function createApplySuitabilityCommand(changes, {label = "数值适居度笔刷", faultAt = null} = {}) {
  const normalized = normalizeChanges(changes);
  const grid = normalized.map(change => change.gridCell);
  const pack = normalized.flatMap(change => change.packChanges.map(entry => entry.packCell));
  const rows = {"grid.cells.s": grid, "grid.cells.pop": grid, "pack.cells.s": pack,
    "pack.cells.pop": pack, "pack.cells.suitabilityBase": pack, "pack.cells.suitabilityOverride": pack};
  let before, after, fields, result;
  return {
    label: `${label} ${normalized.length} cells`,
    domain: "suitability",
    effects: {
      render: "draw",
      selection: "refresh",
      runtimeStats: true,
      pickPanel: true,
      affected: systemAffected("suitability-edit", [{kind: "grid-cells", id: normalized.length}]),
      cellAttributePatch: true,
      changedGridCells: grid,
      derived: ["suitability-cells", "cell-colors", "population-carrying", "population-stats", "object-panels", "derived-stale"]
    },
    apply(context) {
      if (after) {
        restoreSuitabilityEdit(context.map, after, rows);
        return;
      }
      ensureSuitabilityStores(context.map.pack);
      const owners = affectedRuralOwners(context.map, pack);
      fields = localFieldPaths(context.map, [
        ...["manualCells", "positiveSuitabilityCells", "positivePopulationCells", "maxSuitability", "maxPopulation", "manualSuitabilityCells"]
          .map(key => "climate.metadata." + key),
        ...(context.map.settlements?.metadata ? ["settlements.metadata.populationCells"] : []),
        ...owners.flatMap(({paths}) => paths),
        "metadata.derivedStale",
        ...STALE_SECTIONS.filter(section => context.map[section]?.metadata).map(section => section + ".metadata.stale")
      ]);
      before = captureSuitabilityEdit(context.map, rows, fields);
      try {
        applySuitabilityChanges(context.map, normalized, "after");
        failAt(faultAt, "after-values");
        const summary = refreshEditedSuitabilityStats(context.map, grid, pack, owners);
        markSuitabilityStale(context.map);
        failAt(faultAt, "after-derived");
        result = {
          gridCells: normalized.length,
          packCells: normalized.reduce((sum, change) => sum + change.packChanges.length, 0),
          manualCells: summary.manualCells,
          positiveSuitabilityCells: summary.positiveSuitabilityCells,
          positivePopulationCells: summary.positivePopulationCells
        };
        after = captureSuitabilityEdit(context.map, rows, fields);
      } catch (error) {
        restoreSuitabilityEdit(context.map, before, rows);
        throw error;
      }
    },
    revert(context) {
      if (!before) throw new Error("缺少可撤销的适居度快照");
      restoreSuitabilityEdit(context.map, before, rows);
    },
    getReplicaRows: () => rows,
    getReplicaFields: () => fields,
    isNoop() {
      return !normalized.length || normalized.every(change => change.packChanges.every(entry => samePackState(entry.before, entry.after)));
    },
    getChanges() {
      return clone(normalized);
    },
    getResult() {
      return result ? {...result} : null;
    }
  };
}

export function refreshSuitabilityDerived(map, {markStale = true, preservePopulation = false} = {}) {
  invalidateSuitabilityStats(map);
  const populationSnapshot = preservePopulation ? captureClimatePopulation(map) : null;
  const suitability = applySuitabilityOverrides(map.pack);
  if (populationSnapshot) restoreClimatePopulation(map, populationSnapshot);
  mirrorSuitabilityPopulationToGrid(map.grid, map.pack);
  const packSuitability = map.pack.cells.s || [];
  const packPopulation = map.pack.cells.pop || [];
  const summary = {
    manualCells: suitability.manualCells,
    positiveSuitabilityCells: countPositive(packSuitability),
    positivePopulationCells: countPositive(packPopulation),
    maxSuitability: maxValue(packSuitability),
    maxPopulation: round(maxValue(packPopulation), 3)
  };
  map.climate ||= {};
  map.climate.metadata = {...(map.climate.metadata || {}), ...summary, manualSuitabilityCells: summary.manualCells};
  if (map.settlements?.metadata) map.settlements.metadata.populationCells = countPositive(map.grid.cells.pop);
  refreshRuralPopulationStores(map);
  if (markStale) markSuitabilityStale(map);
  return summary;
}

function normalizeRequest(options) {
  const mode = options?.mode === undefined ? SUITABILITY_EDIT_MODE.SET : String(options.mode);
  if (![SUITABILITY_EDIT_MODE.SET, SUITABILITY_EDIT_MODE.RESET].includes(mode)) return {valid: false, code: "invalid-mode", reason: "适居度模式必须是 set 或 reset", mode};
  const scope = options?.scope === undefined ? SUITABILITY_EDIT_SCOPE.LAND : String(options.scope);
  if (!Object.values(SUITABILITY_EDIT_SCOPE).includes(scope)) return {valid: false, code: "invalid-scope", reason: "作用范围必须是 land、water 或 all", mode, scope};
  const value = mode === SUITABILITY_EDIT_MODE.RESET ? null : Number(options?.value ?? options?.targetValue ?? SUITABILITY_VALUE_RANGE.defaultValue);
  if (mode === SUITABILITY_EDIT_MODE.SET && (!Number.isInteger(value) || value < SUITABILITY_VALUE_RANGE.min || value > SUITABILITY_VALUE_RANGE.max)) {
    return {valid: false, code: "invalid-value", reason: `适居度必须是 ${SUITABILITY_VALUE_RANGE.min}～${SUITABILITY_VALUE_RANGE.max} 的整数`, mode, scope, value};
  }
  return {valid: true, mode, scope, value};
}

function createGridChange(map, gridCell, inspection, meanArea) {
  const packCells = packCellsForGrid(map, [gridCell]);
  const original = captureGridOriginal(map, gridCell, packCells);
  return createGridChangeFromOriginal(map, gridCell, original, inspection, meanArea);
}

function createGridChangeFromOriginal(map, gridCell, original, request, meanArea) {
  const packChanges = (original.packBefore || []).map(before => {
    const override = request.mode === SUITABILITY_EDIT_MODE.RESET ? SUITABILITY_OVERRIDE_UNSET : request.value;
    const suitability = request.mode === SUITABILITY_EDIT_MODE.RESET ? before.base : request.value;
    return {
      packCell: before.packCell,
      before: {...before},
      after: {
        packCell: before.packCell,
        base: before.base,
        override,
        suitability,
        population: populationForSuitability(map.pack.cells, before.packCell, suitability, meanArea)
      }
    };
  });
  return {gridCell, packChanges};
}

function captureGridOriginal(map, gridCell, packCells) {
  return {
    gridBefore: {suitability: Number(map.grid.cells.s?.[gridCell]) || 0, population: Number(map.grid.cells.pop?.[gridCell]) || 0},
    packBefore: packCells.map(packCell => readPackState(map, packCell))
  };
}

function readPackState(map, packCell) {
  const cells = map.pack.cells;
  return {
    packCell,
    base: Number(cells.suitabilityBase?.[packCell] ?? cells.s?.[packCell]) || 0,
    override: Number(cells.suitabilityOverride?.[packCell] ?? SUITABILITY_OVERRIDE_UNSET),
    suitability: Number(cells.s?.[packCell]) || 0,
    population: Number(cells.pop?.[packCell]) || 0
  };
}

function desiredPackState(map, packCell, request) {
  const before = readPackState(map, packCell);
  const override = request.mode === SUITABILITY_EDIT_MODE.RESET ? SUITABILITY_OVERRIDE_UNSET : request.value;
  const suitability = request.mode === SUITABILITY_EDIT_MODE.RESET ? before.base : request.value;
  return {changed: before.override !== override || before.suitability !== suitability};
}

function normalizeChanges(changes) {
  const byGrid = new Map();
  for (const change of changes || []) {
    const gridCell = Number(change?.gridCell);
    if (!Number.isInteger(gridCell) || gridCell < 0) continue;
    const packChanges = (change.packChanges || []).map(entry => ({
      packCell: Number(entry?.packCell),
      before: normalizePackState(entry?.before, entry?.packCell),
      after: normalizePackState(entry?.after, entry?.packCell)
    })).filter(entry => Number.isInteger(entry.packCell) && entry.packCell >= 0 && entry.before && entry.after);
    if (packChanges.length) byGrid.set(gridCell, {gridCell, packChanges});
  }
  return [...byGrid.values()].sort((a, b) => a.gridCell - b.gridCell);
}

function normalizePackState(value, fallbackCell) {
  if (!value || typeof value !== "object") return null;
  const packCell = Number(value.packCell ?? fallbackCell);
  const base = Number(value.base);
  const override = Number(value.override);
  const suitability = Number(value.suitability);
  const population = Number(value.population);
  if (![packCell, base, override, suitability, population].every(Number.isFinite)) return null;
  return {packCell, base, override, suitability, population};
}

function applySuitabilityChanges(map, changes, side) {
  ensureSuitabilityStores(map.pack);
  const affectedGrid = new Set();
  for (const change of changes) {
    affectedGrid.add(change.gridCell);
    for (const entry of change.packChanges) {
      const value = entry[side];
      map.pack.cells.suitabilityBase[entry.packCell] = value.base;
      map.pack.cells.suitabilityOverride[entry.packCell] = value.override;
      map.pack.cells.s[entry.packCell] = value.suitability;
      map.pack.cells.pop[entry.packCell] = value.population;
    }
  }
  for (const gridCell of affectedGrid) refreshSuitabilityGridCell(map, gridCell);
}

export function refreshSuitabilityGridCell(map, gridCell) {
  let suitability = 0;
  let population = 0;
  for (const packCell of packCellsForGrid(map, [gridCell])) {
    suitability = Math.max(suitability, Number(map.pack.cells.s?.[packCell]) || 0);
    population = Math.max(population, Number(map.pack.cells.pop?.[packCell]) || 0);
  }
  map.grid.cells.s[gridCell] = suitability;
  map.grid.cells.pop[gridCell] = round(population, 3);
}

function refreshRuralPopulationStores(map) {
  const configs = [
    {field: "state", stores: [map.politics?.states, map.pack?.states]},
    {field: "province", stores: [map.politics?.provinces, map.pack?.provinces]},
    {field: "culture", stores: [map.society?.cultures, map.pack?.cultures]},
    {field: "religion", stores: [map.society?.religions, map.pack?.religions]}
  ];
  for (const config of configs) {
    for (const store of uniqueArrays(config.stores)) {
      for (const item of store) if (item && !item.removed && Number(item.i ?? item.id) >= 0) item.rural = 0;
      for (const cell of map.pack.cells.i || []) {
        const id = Number(map.pack.cells[config.field]?.[cell]) || 0;
        const item = store[id];
        if (item && !item.removed) item.rural = (Number(item.rural) || 0) + (Number(map.pack.cells.pop?.[cell]) || 0);
      }
      for (const item of store) if (item && !item.removed && Number(item.i ?? item.id) >= 0) item.rural = round(Number(item.rural) || 0, 2);
    }
  }
}

function markSuitabilityStale(map) {
  map.metadata ||= {};
  map.metadata.derivedStale = {
    ...(map.metadata.derivedStale || {}),
    systems: [...new Set([...(map.metadata.derivedStale?.systems || []), ...STALE_SYSTEMS])],
    updatedAt: new Date().toISOString()
  };
  for (const section of STALE_SECTIONS) if (map[section]?.metadata) map[section].metadata.stale = true;
}

export function captureSuitabilityEdit(map, rows, fields) {
  const values = Object.entries(rows).map(([path, ids]) => {
    const [section, , field] = path.split(".");
    const column = map[section].cells[field];
    return ids.map(id => column[id]);
  });
  return {values, fields: captureLocalFields(map, fields)};
}

export function restoreSuitabilityEdit(map, snapshot, rows) {
  Object.entries(rows).forEach(([path, ids], index) => {
    const [section, , field] = path.split(".");
    const column = map[section].cells[field];
    ids.forEach((id, i) => { column[id] = snapshot.values[index][i]; });
  });
  restoreLocalFields(map, snapshot.fields);
  touchSuitabilityStats(map, rows["grid.cells.s"], rows["pack.cells.s"]);
}

function affectedRuralOwners(map, packIds) {
  const owners = [];
  for (const [field, section, table] of [
    ["state", "politics", "states"], ["province", "politics", "provinces"],
    ["culture", "society", "cultures"], ["religion", "society", "religions"]
  ]) {
    const ids = new Set(packIds.map(cell => Number(map.pack.cells[field]?.[cell]) || 0));
    const totals = new Map();
    const paths = [];
    for (const id of ids) {
      for (const parent of [section, "pack"]) {
        const item = map[parent]?.[table]?.[id];
        if (!item || item.removed) continue;
        paths.push(`${parent}.${table}.${id}.rural`);
        totals.set(id, 0);
      }
    }
    owners.push({field, section, table, totals, paths});
  }
  return owners;
}

function refreshEditedSuitabilityStats(map, gridIds, packIds, owners) {
  const {summary, gridPopulated} = readEditedSuitabilityStats(map, gridIds, packIds, owners);
  for (const {section, table, totals} of owners) {
    for (const [id, total] of totals) {
      for (const parent of [section, "pack"]) {
        const item = map[parent]?.[table]?.[id];
        if (item && !item.removed) item.rural = round(total, 2);
      }
    }
  }
  summary.maxPopulation = round(summary.maxPopulation, 3);
  map.climate ??= {};
  map.climate.metadata ??= {};
  Object.assign(map.climate.metadata, summary, {manualSuitabilityCells: summary.manualCells});
  if (map.settlements?.metadata) map.settlements.metadata.populationCells = gridPopulated;
  return summary;
}

function matchesScope(height, scope) {
  if (scope === SUITABILITY_EDIT_SCOPE.ALL) return true;
  return (height >= 20) === (scope === SUITABILITY_EDIT_SCOPE.LAND);
}

function samePackState(left, right) {
  return Number(left?.base) === Number(right?.base)
    && Number(left?.override) === Number(right?.override)
    && Number(left?.suitability) === Number(right?.suitability)
    && Math.abs(Number(left?.population) - Number(right?.population)) < 1e-6;
}

function invalidInspection(code, reason, request = {}) {
  return {valid: false, code, reason, mode: request.mode, scope: request.scope, value: request.value, changed: false, gridCells: [], packCells: [], changedGridCells: [], changedPackCells: []};
}

function inspectionError(inspection) {
  const error = new Error(inspection.reason);
  error.code = inspection.code;
  return error;
}

function failAt(actual, expected) {
  if (actual === expected) throw new Error(`suitability fault: ${expected}`);
}

function uniqueArrays(arrays) {
  return arrays.filter((value, index) => Array.isArray(value) && arrays.indexOf(value) === index);
}

function countPositive(values = []) {
  let count = 0;
  for (const value of values) if (Number(value) > 0) count++;
  return count;
}

function maxValue(values = []) {
  let max = 0;
  for (const value of values) max = Math.max(max, Number(value) || 0);
  return max;
}

function meanCellArea(values) {
  if (!values?.length) return 1;
  if (meanAreas.has(values)) return meanAreas.get(values);
  const mean = average(values) || 1;
  meanAreas.set(values, mean);
  return mean;
}

function average(values = []) {
  const length = values?.length || 0;
  if (!length) return 0;
  let total = 0;
  for (const value of values) total += Number(value) || 0;
  return total / length;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function round(value, digits = 0) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
