import {packCellsByGrid} from "./grid-pack-index.js";
import {chooseRenameCandidate, collectRenameChanges, createRenameGenerator, prepareRenameChanges} from "./namebase-redraw.js";
import {GOVERNMENT_BY_KEY, applyStateGovernment, chooseStateGovernment, governmentAllowsSuffix, setStateGovernment} from "../generator/governments.js";
import {chooseNewStateColor} from "../generator/politics.js";
import {createChineseNameGenerator, getStateFullName} from "../generator/names.js";
import {provinceFormForState, provinceFormsForState} from "../generator/province-naming.js";
import {createRandom} from "../generator/random.js";
import {createCityScaleContext, defaultCityVisual, deriveCityScale, refreshCityScaleVisuals} from "./city-visuals.js";
import {namebaseRenameAffected, newObjectAffected, objectAffected, systemAffected} from "./edit-command-effects.js";
import {findLandlessStates, retireLandlessStates} from "./landless-states.js";

const STATE_CELL_SURFACE_EFFECTS = Object.freeze({
  pointsOnlyPicking: true,
  render: "draw",
  cellAttributePatch: true,
  deferLabels: "after-paint",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze([
    "state-cells",
    "pack-state-cells",
    "settlement-states",
    "state-statistics",
    "province-cells",
    "province-statistics",
    "cell-colors",
    "political-boundaries",
    "political-selection",
    "labels",
    "object-panels",
    "derived-stale",
    "province-poles",
    "defer:military",
    "defer:zones",
    "defer:state-markers"
  ])
});

export const STATE_BRUSH_PREVIEW_EFFECTS = Object.freeze({
  render: "draw",
  cellAttributePatch: true,
  reuseResourceBinding: true,
  selection: "none",
  runtimeStats: false,
  pickPanel: false,
  derived: Object.freeze(["state-cells", "cell-colors"])
});

function roundBrushMs(value) {
  return Math.round(value * 10) / 10;
}

function measureStateAddStage(profile, name, action) {
  if (!profile) return action();
  const startedAt = performance.now();
  try {
    return action();
  } finally {
    profile[name] = roundBrushMs(performance.now() - startedAt);
  }
}

const STATE_COLOR_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["state-color", "cell-colors", "object-panels"])
});

const STATE_GOVERNMENT_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["state-government", "object-name", "labels", "object-panels", "defer:economy", "defer:diplomacy", "defer:military"])
});

const STATE_NAME_BATCH_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["object-name", "labels", "object-panels"])
});

const STATE_PROVINCE_SUFFIX_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["object-name", "labels", "object-panels"])
});

const STATE_COLLECTION_EFFECTS = Object.freeze({
  render: "draw",
  cellAttributePatch: true,
  deferLabels: "after-paint",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze([
    "state-cells",
    "pack-state-cells",
    "settlement-states",
    "state-statistics",
    "province-cells",
    "province-statistics",
    "cell-colors",
    "political-boundaries",
    "political-selection",
    "point-layers",
    "labels",
    "object-panels",
    "object-index",
    "derived-stale",
    "province-poles",
    "defer:military",
    "defer:zones",
    "defer:state-markers",
    "defer:economy",
    "defer:diplomacy"
  ])
});

export function createStateBrushPreparation(map) {
  const cells = map?.pack?.cells;
  if (!cells?.i || !cells.state || !cells.province) return null;
  const land = new Uint8Array(cells.h.length);
  const interior = new Uint8Array(land.length);
  for (const cell of cells.i) land[cell] = Number(isPackLandCell(map, cell));
  let provincePlan = null;
  let repeatedCell = false;
  let cursor = 0;
  return {
    cells, land, interior,
    record(changes, originalPackStates) {
      if (repeatedCell || !map.grid?.cells?.province) return;
      provincePlan ??= createStrokeProvincePlan(map);
      if (!provincePlan.record(changes, originalPackStates)) {
        repeatedCell = true;
        provincePlan = null;
      }
    },
    provincePlanFor(changes) {
      return provincePlan?.matches(changes) ? provincePlan : null;
    },
    advance() {
      if (!this.provinces) {
        this.provinces = snapshotProvinces(map);
        this.states = map.politics.states.map(state => state && snapshotState(map, state.i ?? state.id));
        this.scale = createCityScaleContext(map.settlements?.cities, map.pack?.burgs);
      }
      const end = Math.min(cursor + 4096, cells.i.length);
      for (; cursor < end; cursor++) {
        const cell = cells.i[cursor];
        if (!land[cell]) continue;
        interior[cell] = 1;
        for (const neighbor of cells.c?.[cell] || []) {
          if (!land[neighbor] || cells.province[neighbor] !== cells.province[cell] || cells.state[neighbor] !== cells.state[cell]) {
            interior[cell] = 0;
            break;
          }
        }
      }
    }
  };
}

function createStrokeProvincePlan(map) {
  const shadow = {...map,
    grid: {...map.grid, cells: {...map.grid.cells, province: map.grid.cells.province.slice()}},
    pack: {...map.pack, cells: {...map.pack.cells, province: map.pack.cells.province.slice()}}
  };
  const owners = new Map();
  const affected = new Set();
  const largestProvinces = new Map();
  const gridProvinces = [], packProvinces = [], packStates = [];
  return {
    gridProvinces, packProvinces, packStates,
    record(changes, originals) {
      const stamp = [];
      for (const {gridCell, after} of changes) {
        if (owners.has(gridCell)) return false;
        owners.set(gridCell, after);
        gridProvinces.push([gridCell, map.grid.cells.province[gridCell]]);
        for (const cell of getPackCellsForGrid(map, gridCell)) {
          const entry = [cell, map.pack.cells.province[cell]];
          stamp.push(entry);
          packProvinces.push(entry);
          packStates.push([cell, originals.get(cell) ?? map.pack.cells.state[cell]]);
        }
      }
      repairProvinceCells(shadow, changes, stamp, affected, largestProvinces);
      return true;
    },
    matches(changes) {
      return owners.size === changes.length && changes.every(({gridCell, after}) => owners.get(gridCell) === after);
    },
    apply() {
      for (const [id] of gridProvinces) map.grid.cells.province[id] = shadow.grid.cells.province[id];
      for (const [id] of packProvinces) map.pack.cells.province[id] = shadow.pack.cells.province[id];
      return affected;
    }
  };
}

export function createApplyStateBrushCommand(changes, {label = "国家笔刷", originalPackStates, boundaryScan} = {}) {
  const normalized = normalizeChanges(changes);
  const affectedStates = [...new Set(normalized.flatMap(change => [change.before, change.after]).filter(stateId => stateId > 0))];
  let settlementSnapshot = null;
  let politicalSnapshot = null;
  let lastApplyPerformance = null;
  let summaryBefore;
  let committedStale;
  let replica;
  let retirement = [];
  const restoreRetirement = () => {
    for (const {table, key, before} of retirement.reverse()) table[key] = before;
    retirement = [];
  };
  return {
    label: `${label} ${normalized.length} cells`,
    domain: "state",
    effects: {
      ...STATE_CELL_SURFACE_EFFECTS,
      changedGridCells: normalized.map(change => change.gridCell),
      affected: systemAffected("state-brush", affectedStates.length ? affectedStates.map(id => ({kind: "state", id})) : [{kind: "grid-cells", id: normalized.length}])
    },
    apply(context) {
      const startedAt = performance.now();
      const detail = {};
      const prepared = boundaryScan?.cells === context.map.pack?.cells ? boundaryScan : null;
      const provincePlan = prepared?.provincePlanFor(normalized);
      boundaryScan = null;
      settlementSnapshot ??= captureSettlementSnapshot(context.map, normalized);
      politicalSnapshot ??= capturePoliticalDerivativeSnapshot(context.map, normalized, settlementSnapshot, originalPackStates, prepared?.provinces, provincePlan);
      summaryBefore ??= prepared?.states || context.map.politics.states.map(state => state && snapshotState(context.map, state.i ?? state.id));
      const capturedAt = performance.now();
      settlementSnapshot.createdCapitalCells = [];
      let transferredAt;
      let repairedAt;
      let summarizedAt;
      try {
        applyStateChanges(context.map, normalized, "after");
        let scale = prepared?.scale;
        let cityCount = context.map.settlements?.cities?.length;
        const currentScale = () => {
          if (!scale || cityCount !== context.map.settlements?.cities?.length) {
            cityCount = context.map.settlements?.cities?.length;
            scale = createCityScaleContext(context.map.settlements?.cities, context.map.pack?.burgs);
          }
          return scale;
        };
        applySettlementTransfers(context.map, settlementSnapshot, currentScale);
        transferredAt = performance.now();
        const affectedProvinces = measureStateAddStage(detail, "provinceRepairMs", () => repairPoliticalDerivativesForStateBrush(context.map, normalized, settlementSnapshot, politicalSnapshot.packProvinces, provincePlan));
        this.effects.brushProvinceIds = [...affectedProvinces];
        const withoutPackLand = [];
        const createdCapitals = measureStateAddStage(detail, "capitalMs", () => reconcileStateCapitals(context.map, affectedStates, settlementSnapshot, withoutPackLand, currentScale));
        if (withoutPackLand.length) retireLandlessStates(context.map, findLandlessStates(context.map, withoutPackLand), retirement);
        if (retirement.length) markDerivedStale(context.map, ["economy", "diplomacy"]);
        assertAffectedStateCapitals(context.map, affectedStates);
        const poleGroups = affectedProvinces.size ? new Map([...affectedProvinces].map(id => [id, {cells: [], boundary: []}])) : null;
        const scan = retirement.length ? null : prepared;
        const grouped = measureStateAddStage(detail, "politicalSummaryMs", () => refreshPoliticalSummaries(context.map, retirement.length ? null : politicalSnapshot, poleGroups, scan));
        measureStateAddStage(detail, "provincePoleMs", () => refreshProvincePoles(context.map, affectedProvinces, grouped));
        repairedAt = performance.now();
        const recoloredStates = repairStateColorConflicts(context.map, affectedStates);
        for (const item of summaryBefore) {
          if (item?.packState) syncChangedBrushFields(context.map.pack.states[item.stateId], context.map.politics.states[item.stateId], item.state);
        }
        for (const item of politicalSnapshot.provinces) {
          if (item.packProvince) syncChangedBrushFields(context.map.pack.provinces[item.provinceId], context.map.politics.provinces[item.provinceId], item.province);
        }
        const changedCapitals = settlementSnapshot.capitalCitySnapshots.filter(item => {
          const city = context.map?.settlements?.cities?.[item.cityId];
          const burg = context.map?.pack?.burgs?.[item.burgId];
          return Boolean(city?.capital) !== Boolean(item.city.capital) || Boolean(burg?.capital) !== Boolean(item.burg?.capital);
        });
        this.effects.brushCityIds = [...new Set([...settlementSnapshot.createdCapitalCells, ...changedCapitals,
          ...settlementSnapshot.movedCities.filter(item => item.city.provincial !== context.map.settlements.cities[item.cityId]?.provincial)].map(item => item.cityId))];
        const capitalVisualsChanged = this.effects.brushCityIds.length > 0;
        const extraDerived = [
          ...(capitalVisualsChanged ? ["point-layers"] : []),
          ...(createdCapitals || retirement.length ? ["object-index"] : []),
          ...(retirement.length ? ["defer:economy", "defer:diplomacy"] : []),
          ...(recoloredStates.length ? ["state-color"] : [])
        ];
        this.effects.derived = extraDerived.length ? [...STATE_CELL_SURFACE_EFFECTS.derived, ...extraDerived] : STATE_CELL_SURFACE_EFFECTS.derived;
        if (committedStale) restoreDerivedStale(context.map, committedStale);
        else committedStale = snapshotDerivedStale(context.map);
        replica ??= captureStateBrushReplica(context.map, normalized, settlementSnapshot, politicalSnapshot, summaryBefore, retirement);
        summarizedAt = performance.now();
      } catch (error) {
        restoreRetirement();
        applyStateChanges(context.map, normalized, "before");
        restoreSettlementSnapshot(context.map, settlementSnapshot);
        restorePoliticalDerivativeSnapshot(context.map, politicalSnapshot);
        for (const item of summaryBefore) if (item) restoreState(context.map, item);
        throw error;
      }
      lastApplyPerformance = {
        snapshotMs: roundBrushMs(capturedAt - startedAt),
        transferMs: roundBrushMs(transferredAt - capturedAt),
        provinceMs: roundBrushMs(repairedAt - transferredAt),
        summaryMs: roundBrushMs(summarizedAt - repairedAt),
        ...detail
      };
    },
    revert(context) {
      restoreRetirement();
      applyStateChanges(context.map, normalized, "before");
      restoreSettlementSnapshot(context.map, settlementSnapshot);
      restorePoliticalDerivativeSnapshot(context.map, politicalSnapshot);
      for (const item of summaryBefore) if (item) restoreState(context.map, item);
    },
    isNoop() {
      return normalized.length === 0;
    },
    getChanges() {
      return normalized;
    },
    getReplicaRows: () => replica.rows,
    getReplicaFields: () => replica.fields,
    getReplicaSplices(map) {
      return replica.tables.map(({path, start, before, after}) => {
        const applied = map.settlements.cities.length > settlementSnapshot.cityLength;
        return {path, start, removed: (applied ? before : after) - start, added: (applied ? after : before) - start};
      });
    },
    getLastApplyPerformance() {
      return lastApplyPerformance;
    }
  };
}

export function createSetStateColorCommand(stateId, color, {beforeColor = null, label = "国家颜色"} = {}) {
  const normalizedStateId = normalizeStateId(stateId);
  const after = normalizeHexColor(color);
  const before = normalizeHexColor(beforeColor);
  return {
    label: `${label} #${normalizedStateId}`,
    domain: "state",
    effects: {
      ...STATE_COLOR_EFFECTS,
      affected: objectAffected("state", normalizedStateId)
    },
    apply(context) {
      setStateColor(context.map, normalizedStateId, after);
    },
    revert(context) {
      setStateColor(context.map, normalizedStateId, before);
    },
    isNoop() {
      return normalizedStateId <= 0 || !after || before === after;
    }
  };
}

export function createSetStateGovernmentCommand(stateId, governmentKey, {formName = "", label = "国家政体"} = {}) {
  const normalizedStateId = normalizeStateId(stateId);
  const normalizedGovernmentKey = String(governmentKey || "").trim();
  const normalizedFormName = String(formName || "").trim();
  let previous = null;
  return {
    label: `${label} #${normalizedStateId}`,
    domain: "state",
    effects: {
      ...STATE_GOVERNMENT_EFFECTS,
      affected: objectAffected("state", normalizedStateId)
    },
    apply(context) {
      previous ??= snapshotStateGovernment(context.map, normalizedStateId);
      setStateGovernment(context.map, normalizedStateId, normalizedGovernmentKey, {formName: normalizedFormName});
      markDerivedStale(context.map, ["economy", "diplomacy", "military"]);
    },
    revert(context) {
      if (!previous) throw new Error("缺少可撤销的政体快照");
      restoreStateGovernment(context.map, previous);
      markDerivedStale(context.map, ["economy", "diplomacy", "military"]);
    },
    isNoop(context) {
      const state = context.map?.politics?.states?.[normalizedStateId];
      if (normalizedStateId <= 0 || !state || !hasGovernmentKey(normalizedGovernmentKey)) return true;
      if (normalizedFormName && !governmentAllowsSuffix(normalizedGovernmentKey, normalizedFormName)) return true;
      return state.governmentKey === normalizedGovernmentKey && (!normalizedFormName || state.formName === normalizedFormName);
    }
  };
}

export function createSetStatesGovernmentBatchCommand(stateIds, governmentKey, {label = "批量调整政体"} = {}) {
  const normalizedStateIds = uniqueStateIds(stateIds);
  const normalizedGovernmentKey = String(governmentKey || "").trim();
  let previous = null;
  return {
    label: `${label} ${normalizedStateIds.length}国`,
    domain: "state",
    effects: {
      ...STATE_GOVERNMENT_EFFECTS,
      affected: systemAffected("state-government-batch", normalizedStateIds.map(id => ({kind: "state", id})))
    },
    apply(context) {
      previous ??= snapshotBatchStateGovernments(context.map, normalizedStateIds, normalizedGovernmentKey);
      let changed = 0;
      for (const item of previous) {
        if (!setStateGovernment(context.map, item.stateId, normalizedGovernmentKey)) continue;
        changed++;
      }
      if (!changed) throw new Error("没有可调整政体的国家");
      markDerivedStale(context.map, ["economy", "diplomacy", "military"]);
    },
    revert(context) {
      if (!previous) throw new Error("缺少可撤销的批量政体快照");
      for (const item of previous) restoreStateGovernment(context.map, item);
      markDerivedStale(context.map, ["economy", "diplomacy", "military"]);
    },
    isNoop(context) {
      if (!normalizedStateIds.length || !hasGovernmentKey(normalizedGovernmentKey)) return true;
      return normalizedStateIds.every(stateId => {
        const state = context.map?.politics?.states?.[stateId] || context.map?.pack?.states?.[stateId];
        return !state || state.removed || state.governmentKey === normalizedGovernmentKey;
      });
    }
  };
}

export function createSetStateProvinceSuffixCommand(stateId, formName, {overwriteCustom = false, label = "调整辖下省份后缀"} = {}) {
  const normalizedStateId = normalizeStateId(stateId);
  const normalizedFormName = String(formName || "").trim();
  const shouldOverwriteCustom = Boolean(overwriteCustom);
  let plan = null;

  return {
    label: `${label} #${normalizedStateId}`,
    domain: "province",
    effects: {
      ...STATE_PROVINCE_SUFFIX_EFFECTS,
      affected: systemAffected("state-province-suffix", [{kind: "state", id: normalizedStateId}])
    },
    apply(context) {
      plan ??= buildStateProvinceSuffixPlan(context.map, normalizedStateId, normalizedFormName, shouldOverwriteCustom);
      if (!plan.valid || !plan.changes.length) throw new Error(plan.summary);
      for (const change of plan.changes) writeProvinceNameFields(context.map, change.provinceId, change.after);
      this.effects.affected = systemAffected("state-province-suffix", [
        {kind: "state", id: normalizedStateId},
        ...plan.changes.map(change => ({kind: "province", id: change.provinceId}))
      ]);
    },
    revert(context) {
      if (!plan?.changes?.length) throw new Error("缺少可撤销的省份后缀快照");
      for (const change of plan.changes) restoreProvinceNameFields(context.map, change.provinceId, change.before);
    },
    isNoop(context) {
      plan ??= buildStateProvinceSuffixPlan(context.map, normalizedStateId, normalizedFormName, shouldOverwriteCustom);
      return !plan.valid || !plan.changes.length;
    },
    getResult() {
      return plan ? provinceSuffixPlanResult(plan) : null;
    }
  };
}

export function createRenameStatesFromNamebaseCommand(stateIds, {label = "按名称库重命名国家", drawSeed = "", allowEmpty = false} = {}) {
  const normalizedStateIds = uniqueStateIds(stateIds);
  let changes = null;

  return {
    label: `${label} ${normalizedStateIds.length}国`,
    domain: "state",
    effects: {
      ...STATE_NAME_BATCH_EFFECTS,
      affected: namebaseRenameAffected("state", normalizedStateIds)
    },
    async prepare(context, checkpoint) {
      changes ??= await prepareRenameChanges(buildStateRenameChanges(context.map, normalizedStateIds, drawSeed), checkpoint);
    },
    apply(context) {
      changes ??= collectRenameChanges(buildStateRenameChanges(context.map, normalizedStateIds, drawSeed));
      if (!changes.length && !allowEmpty) throw new Error("没有可重命名的国家");
      for (const change of changes) writeStateNameSnapshot(context.map, change.stateId, change.after);
    },
    revert(context) {
      if (!changes) throw new Error("缺少可撤销的国家名称快照");
      for (const change of changes) writeStateNameSnapshot(context.map, change.stateId, change.before);
    },
    isNoop(context) {
      return !normalizedStateIds.length || !collectRenameChanges(buildStateRenameChanges(context.map, normalizedStateIds, drawSeed)).length;
    },
    getResult() {
      return {renamed: changes?.length || 0, total: normalizedStateIds.length};
    }
  };
}

export function createAddStateAtCellCommand(gridCell, {label = "新增国家", faultInjector = null} = {}) {
  const targetGridCell = normalizeGridCell(gridCell);
  let snapshot = null;
  let result = null;
  let inspection = null;
  let lastApplyPerformance = null;
  let lastNoopCheckMs = 0;
  return {
    label,
    domain: "state",
    effects: {
      ...STATE_COLLECTION_EFFECTS,
      changedGridCells: [],
      affected: newObjectAffected("state")
    },
    apply(context) {
      const startedAt = performance.now();
      const profile = {};
      inspection = measureStateAddStage(profile, "inspectMs", () => inspectStateCreation(context.map, targetGridCell));
      if (!inspection.valid) throw new Error(inspection.summary);
      snapshot ??= measureStateAddStage(profile, "snapshotMs", () => captureStateCollectionSnapshot(context.map));
      try {
        result = measureStateAddStage(profile, "createMs", () => addStateAtGridCell(context.map, targetGridCell, inspection, profile));
        faultInjector?.({stage: "after-create", result, map: context.map});
      } catch (error) {
        restoreStateCollectionSnapshot(context.map, snapshot);
        throw error;
      } finally {
        lastApplyPerformance = {...profile, totalMs: roundBrushMs(performance.now() - startedAt)};
      }
      this.effects.changedGridCells = result.changedGridCells;
      this.effects.politicalPaletteEntries = {stateId: result.stateId, provinceId: result.provinceId, gridCell: targetGridCell};
      this.effects.affected = [...objectAffected("state", result.stateId), ...result.previousStateIds.map(id => ({kind: "state", id}))];
    },
    revert(context) {
      if (!snapshot) throw new Error("缺少可撤销的国家新增快照");
      restoreStateCollectionSnapshot(context.map, snapshot);
    },
    isNoop(context) {
      const startedAt = performance.now();
      inspection = inspectStateCreation(context.map, targetGridCell);
      lastNoopCheckMs = roundBrushMs(performance.now() - startedAt);
      return !inspection.valid;
    },
    getInspection() {
      return inspection;
    },
    getResult() {
      return result;
    },
    getLastApplyPerformance() {
      return lastApplyPerformance ? {noopCheckMs: lastNoopCheckMs, ...lastApplyPerformance} : null;
    }
  };
}

export function inspectStateCreation(map, gridCell) {
  const targetGridCell = normalizeGridCell(gridCell);
  if (targetGridCell < 0 || targetGridCell >= (map?.grid?.cells?.i?.length || 0)) {
    return stateCreationInspection(false, "grid-cell-invalid", "目标 grid cell 无效。", {gridCell: targetGridCell});
  }
  if (!isGridLandCell(map, targetGridCell)) {
    return stateCreationInspection(false, "grid-cell-water", "目标 grid cell 不是陆地。", {gridCell: targetGridCell});
  }
  const packCell = choosePackCellForGridCell(map, targetGridCell, {readOnly: true});
  if (!Number.isInteger(packCell)) {
    return stateCreationInspection(false, "pack-cell-missing", "目标 grid cell 没有可用的陆地 pack cell。", {gridCell: targetGridCell});
  }
  const provinceId = normalizeProvinceId(map?.grid?.cells?.province?.[targetGridCell] || map?.pack?.cells?.province?.[packCell]);
  return stateCreationInspection(true, "ok", "可以在目标 cell 创建国家。", {gridCell: targetGridCell, packCell, provinceId});
}

export function createDeleteStateCommand(stateId, {label = "删除国家"} = {}) {
  const normalizedStateId = normalizeStateId(stateId);
  let snapshot = null;
  let result = null;
  return {
    label: `${label} #${normalizedStateId}`,
    domain: "state",
    effects: {
      ...STATE_COLLECTION_EFFECTS,
      changedGridCells: [],
      affected: objectAffected("state", normalizedStateId)
    },
    apply(context) {
      snapshot ??= captureStateCollectionSnapshot(context.map, {deletedStateId: normalizedStateId});
      try {
        result = deleteState(context.map, normalizedStateId);
      } catch (error) {
        restoreStateCollectionSnapshot(context.map, snapshot);
        throw error;
      }
      this.effects.changedGridCells = result.changedGridCells;
    },
    revert(context) {
      if (!snapshot) throw new Error("缺少可撤销的国家删除快照");
      restoreStateCollectionSnapshot(context.map, snapshot);
    },
    isNoop(context) {
      const state = context.map?.politics?.states?.[normalizedStateId];
      return normalizedStateId <= 0 || !state || state.removed;
    },
    getResult() {
      return result;
    }
  };
}

export function applyStateBrushPreview(map, changes, originalPackStates) {
  applyStateChanges(map, normalizeChanges(changes), "after", originalPackStates);
}

function* buildStateRenameChanges(map, stateIds, drawSeed) {
  const states = map?.politics?.states || [];
  if (!states.length) return [];
  const generator = createRenameGenerator(map, "state", drawSeed);
  const targets = new Set(stateIds);
  const occupied = new Set(states
    .filter(state => state && !state.removed && !targets.has(normalizeStateId(state.id ?? state.i)))
    .map(state => normalizeStateRoot(state.name))
    .filter(Boolean));

  for (const stateId of stateIds) {
    const state = states[stateId];
    if (!state || state.removed || stateId <= 0) continue;
    const before = snapshotStateName(map, stateId);
    const afterRoot = chooseRenameCandidate(before.name, drawSeed, () => nextStateRootFromNamebase(map, state, generator, occupied));
    if (!afterRoot) continue;
    const after = {
      name: afterRoot,
      fullName: getStateFullName(afterRoot, state.formName),
      nameOrientation: undefined
    };
    occupied.add(normalizeStateRoot(afterRoot));
    yield {stateId, before, after};
  }

}

function nextStateRootFromNamebase(map, state, generator, occupied) {
  const baseOptions = stateNameOptions(map, state);
  let fallbackRoot = "";
  for (let attempt = 0; attempt < 96; attempt++) {
    const root = normalizeStateRoot(generator.makeStateRoot({...baseOptions, id: `${state.id ?? state.i}:${attempt}`}));
    fallbackRoot ||= nonDirectionalBase(root, occupied) || root;
    if (!root || occupied.has(root)) continue;
    if (isDirectionalVariantCollision(root, occupied)) continue;
    return root;
  }
  return makeOrdinalStateRoot(fallbackRoot || normalizeStateRoot(generator.makeStateRoot(baseOptions)), occupied);
}

function stateNameOptions(map, state) {
  const cultureId = Number(state.culture || 0);
  const culture = map?.society?.cultures?.[cultureId] || map?.pack?.cultures?.[cultureId];
  const capital = findCityByBurgId(map, state.capital);
  return {
    id: state.id ?? state.i,
    cell: state.center ?? state.gridCenter,
    culture: cultureId,
    cultureRoot: culture?.root || culture?.name,
    cultureType: culture?.nameStyle || culture?.type,
    capitalName: capital?.name || "",
    allowCapitalName: false,
    type: state.type || culture?.type || "Generic"
  };
}

function snapshotStateName(map, stateId) {
  const state = map?.politics?.states?.[stateId];
  return {
    name: state?.name || "",
    fullName: state?.fullName || state?.name || "",
    nameOrientation: clonePlain(state?.nameOrientation)
  };
}

function writeStateNameSnapshot(map, stateId, snapshot) {
  const state = map?.politics?.states?.[stateId];
  if (!state) throw new Error(`找不到国家 #${stateId}`);
  applyStateNameSnapshot(state, snapshot);
  const packState = map?.pack?.states?.[stateId];
  if (packState && packState !== state) applyStateNameSnapshot(packState, snapshot);
}

function addStateAtGridCell(map, gridCell, inspection = inspectStateCreation(map, gridCell), profile = null) {
  if (!inspection.valid) throw new Error(inspection.summary);
  const packCell = inspection.packCell;
  const previousStateId = normalizeStateId(map?.pack?.cells?.state?.[packCell] ?? map?.grid?.cells?.state?.[gridCell]);
  const previousCapital = map?.politics?.states?.[previousStateId]?.capital;
  const seedBurgId = normalizePoliticalId(map?.pack?.cells?.burg?.[packCell]);
  const stateId = nextPoliticalId(map?.politics?.states || map?.pack?.states || []);
  const provinceId = nextPoliticalId(map?.politics?.provinces || map?.pack?.provinces || []);
  ensurePoliticalCellCapacity(map, {stateId, provinceId});
  const point = map.pack?.cells?.p?.[packCell] || map.grid?.points?.[map.grid.cells.p?.[gridCell]] || [0, 0];
  const cultureId = normalizeCultureId(map.pack?.cells?.culture?.[packCell] ?? map.grid?.cells?.culture?.[gridCell]);
  const religionId = normalizeCultureId(map.pack?.cells?.religion?.[packCell] ?? map.grid?.cells?.religion?.[gridCell]);
  const culture = map?.society?.cultures?.[cultureId] || map?.pack?.cultures?.[cultureId] || null;
  const random = createRandom(`${map.metadata?.seed || map.options?.seed || "map"}|add-state|${stateId}|${gridCell}`);
  const generator = createChineseNameGenerator(`${map.metadata?.seed || map.options?.seed || "map"}|add-state-name|${stateId}`, {
    namebases: map.namebases,
    provinceNames: (map?.politics?.provinces || map?.pack?.provinces || []).filter(item => item && !item.removed).map(item => item.name)
  });
  const occupied = new Set((map?.politics?.states || [])
    .filter(state => state && !state.removed)
    .map(state => normalizeStateRoot(state.name))
    .filter(Boolean));
  const root = nextStateRootFromNamebase(map, {
    id: stateId,
    i: stateId,
    center: packCell,
    gridCenter: gridCell,
    culture: cultureId,
    type: culture?.type || "Generic"
  }, generator, occupied);
  const previousCityCount = map?.settlements?.cities?.length || 0;
  const capital = measureStateAddStage(profile, "capitalMs", () => ensureCapitalCityForNewState(map, {
    stateId,
    provinceId,
    packCell,
    gridCell,
    cultureId,
    religionId,
    nameGenerator: generator
  }));
  const state = {
    id: stateId,
    i: stateId,
    name: root,
    center: packCell,
    gridCenter: gridCell,
    capital: capital.burgId,
    capitalName: capital.name,
    culture: cultureId,
    religion: religionId,
    type: culture?.type || "Generic",
    nameStyle: culture?.nameStyle || null,
    expansionism: roundValue(random.range(1, 2), 1),
    cells: 0,
    area: 0,
    burgs: 0,
    rural: 0,
    urban: 0,
    neighbors: [],
    provinces: [provinceId],
    color: "",
    coa: generator.makeEmblem({
      id: stateId,
      kind: "state",
      cell: packCell,
      culture: cultureId,
      type: culture?.type || "Generic",
      x: point[0],
      y: point[1]
    })
  };
  writePoliticalItem(map, "states", stateId, state);
  const province = {
    id: provinceId,
    i: provinceId,
    state: stateId,
    center: packCell,
    gridCenter: gridCell,
    burg: capital.burgId,
    name: root,
    formName: "",
    fullName: root,
    color: "",
    cells: 0,
    area: 0,
    neighbors: [],
    pole: point.map(value => roundValue(value, 2))
  };
  writePoliticalItem(map, "provinces", provinceId, province);
  const affectedGridCells = new Set(initialStateCells(map, gridCell));
  const seedGridCell = Number(map.pack?.cells?.g?.[packCell]);
  if (Number.isInteger(seedGridCell) && isGridLandCell(map, seedGridCell)) affectedGridCells.add(seedGridCell);
  const changes = [...affectedGridCells].map(cell => ({
    gridCell: cell,
    before: normalizeStateId(map.grid.cells.state?.[cell]),
    after: stateId
  }));
  applyStateChanges(map, changes, "after");
  for (const change of changes) {
    if (map.grid?.cells?.province) map.grid.cells.province[change.gridCell] = provinceId;
    for (const cell of getPackCellsForGrid(map, change.gridCell)) {
      if (isPackLandCell(map, cell)) map.pack.cells.province[cell] = provinceId;
    }
  }
  const movedGridCells = new Set(changes.map(change => change.gridCell));
  const changedCityIds = new Set([capital.cityId]);
  const statesNeedingCapital = new Set();
  if (previousStateId && previousCapital === seedBurgId) statesNeedingCapital.add(previousStateId);
  const affectedProvinces = new Set();
  for (const city of map?.settlements?.cities || []) {
    if (!city || !movedGridCells.has(city.cell)) continue;
    changedCityIds.add(city.id);
    const burg = findBurgForCity(map, city);
    const formerStateId = normalizeStateId(city.state);
    const formerProvinceId = normalizeProvinceId(city.province);
    if (formerProvinceId && formerProvinceId !== provinceId) affectedProvinces.add(formerProvinceId);
    if (formerStateId && formerStateId !== stateId && map?.politics?.states?.[formerStateId]?.capital === city.burgId) {
      statesNeedingCapital.add(formerStateId);
    }
    writeCityOwnerForNewState(map, city.id, stateId, provinceId);
    if (city.id !== capital.cityId) {
      city.capital = false;
      city.provincial = false;
      if (burg) burg.capital = 0;
    }
  }
  const capitalCity = map?.settlements?.cities?.[capital.cityId];
  if (capitalCity) capitalCity.provincial = true;
  for (const oldStateId of statesNeedingCapital) {
    ensureReplacementCapitalForState(map, oldStateId);
    const replacement = findCityByBurgId(map, map?.politics?.states?.[oldStateId]?.capital);
    if (replacement) changedCityIds.add(replacement.id);
  }
  measureStateAddStage(profile, "politicalSummaryMs", () => refreshPoliticalSummaries(map));
  for (const cityId of measureStateAddStage(profile, "provinceRepairMs", () => repairProvincesAfterStateCreation(map, affectedProvinces))) changedCityIds.add(cityId);
  refreshCityScaleVisuals(map, capital.cityId >= previousCityCount ? {} : {cityIds: [...changedCityIds]});
  measureStateAddStage(profile, "provincePoleMs", () => refreshProvincePoles(map, new Set([provinceId, ...affectedProvinces])));
  const formerOwners = changes.map(c => c.before).filter(id => id && !map.politics.states[id]?.cells);
  if (formerOwners.length) retireLandlessStates(map, findLandlessStates(map, formerOwners));
  state.neighbors = [...new Set([...state.neighbors, ...findNewStateGridNeighbors(map, changes, stateId)])];
  state.color = chooseNewStateColor(state, map.politics.states);
  const validStates = map.politics.states.filter(item => item && !item.removed && normalizeStateId(item.i ?? item.id) > 0);
  const areas = validStates.map(item => item.area || 0).sort((a, b) => a - b);
  const medianArea = areas[Math.floor(areas.length / 2)] || 1;
  const empireThreshold = [...areas].sort((a, b) => b - a)[Math.max(Math.ceil(validStates.length ** 0.4) - 2, 0)] || medianArea;
  const governmentContext = {seed: map.metadata?.seed || map.options?.seed, medianArea, empireThreshold, states: validStates};
  applyStateGovernment(state, chooseStateGovernment(state, governmentContext), governmentContext);
  province.color = state.color;
  const finalProvinceName = generator.makeProvinceName({
    id: provinceId, cell: packCell, culture: cultureId, cultureType: culture?.nameStyle || culture?.type,
    state: stateId, baseName: root, formName: provinceFormForState(state, map?.society?.cultures || map?.pack?.cultures)
  });
  Object.assign(province, {name: finalProvinceName.name, formName: finalProvinceName.formName, fullName: finalProvinceName.fullName});
  refreshSettlementMetadata(map);
  refreshPoliticsMetadata(map);
  syncPackPoliticalRecords(map);
  markDerivedStale(map, ["military", "zones", "state-markers", "economy", "diplomacy"]);
  assertCreatedStateCoherent(map, {stateId, provinceId, capital, changes, statesNeedingCapital});
  return {stateId, provinceId, cityId: capital.cityId, burgId: capital.burgId, cells: changes.length,
    changedGridCells: changes.map(change => change.gridCell), previousStateIds: [...statesNeedingCapital]};
}

function assertCreatedStateCoherent(map, {stateId, provinceId, capital, changes, statesNeedingCapital}) {
  const state = map?.politics?.states?.[stateId];
  const province = map?.politics?.provinces?.[provinceId];
  const capitalCity = map?.settlements?.cities?.[capital.cityId];
  if (!state || !province || state.capital !== capital.burgId || province.state !== stateId
    || !capitalCity || capitalCity.state !== stateId || capitalCity.province !== provinceId) {
    throw new Error("新国家或首都资料未能补齐");
  }
  for (const change of changes) {
    if (map.grid.cells.state[change.gridCell] !== stateId || map.grid.cells.province?.[change.gridCell] !== provinceId) {
      throw new Error("新国家 grid 归属未能同步");
    }
    for (const cell of getPackCellsForGrid(map, change.gridCell)) {
      if (!isPackLandCell(map, cell)) continue;
      if (map.pack.cells.state[cell] !== stateId || map.pack.cells.province?.[cell] !== provinceId) {
        throw new Error("新国家 pack 归属未能同步");
      }
    }
  }
  for (const oldStateId of statesNeedingCapital) {
    const oldState = map?.politics?.states?.[oldStateId];
    if (!oldState || oldState.removed) continue;
    const city = findCityByBurgId(map, oldState.capital);
    if (!city || city.state !== oldStateId) throw new Error("旧国家首都未能补齐");
  }
}

function deleteState(map, stateId) {
  const state = map?.politics?.states?.[stateId];
  if (!state || state.removed) throw new Error(`找不到国家 #${stateId}`);
  const grid = map.grid.cells, pack = map.pack.cells;
  const changedGridCells = new Set();
  for (let cell = 0; cell < (grid.state?.length || 0); cell++) {
    if (normalizeStateId(grid.state[cell]) !== stateId) continue;
    grid.state[cell] = 0;
    if (grid.province) grid.province[cell] = 0;
    changedGridCells.add(cell);
  }
  const cells = changedGridCells.size;
  // 边界处两层地块的归属可能不同，分别按实际归属释放领土。
  for (let cell = 0; cell < (pack.state?.length || 0); cell++) {
    if (normalizeStateId(pack.state[cell]) !== stateId) continue;
    pack.state[cell] = 0;
    if (pack.province) pack.province[cell] = 0;
    const gridCell = pack.g?.[cell];
    if (Number.isInteger(gridCell) && gridCell >= 0) changedGridCells.add(gridCell);
  }
  for (const province of map?.politics?.provinces || []) {
    if (province && normalizeStateId(province.state) === stateId) province.removed = true;
  }
  for (const province of map?.pack?.provinces || []) {
    if (province && normalizeStateId(province.state) === stateId) province.removed = true;
  }
  const cityScaleContext = createCityScaleContext(map?.settlements?.cities, map?.pack?.burgs);
  for (const city of map?.settlements?.cities || []) {
    if (!city || normalizeStateId(city.state) !== stateId) continue;
    const burg = findBurgForCity(map, city);
    city.state = 0;
    city.province = 0;
    city.capital = false;
    city.provincial = false;
    const scale = deriveCityScale(city, cityScaleContext, burg);
    city.group = scale;
    if (burg) {
      burg.state = 0;
      burg.province = 0;
      burg.capital = 0;
      burg.group = scale;
    }
  }
  removePoliticalItem(map, "states", stateId);
  refreshProvinceSummaries(map);
  refreshStateSummaries(map);
  refreshSettlementMetadata(map);
  refreshPoliticsMetadata(map);
  syncPackPoliticalRecords(map);
  markDerivedStale(map, ["military", "zones", "state-markers", "economy", "diplomacy"]);
  return {stateId, cells, changedGridCells: [...changedGridCells]};
}

function applyStateNameSnapshot(state, snapshot) {
  state.name = snapshot.name;
  state.fullName = snapshot.fullName || getStateFullName(snapshot.name, state.formName);
  if (snapshot.nameOrientation === undefined) delete state.nameOrientation;
  else state.nameOrientation = clonePlain(snapshot.nameOrientation);
}

function findCityByBurgId(map, burgId) {
  const target = Number(burgId);
  if (!Number.isInteger(target)) return null;
  return (map?.settlements?.cities || []).find(city => city?.burgId === target) || null;
}

function normalizeStateRoot(value) {
  return String(value || "").trim().replace(/\s+/gu, "");
}

function isDirectionalVariantCollision(root, occupied) {
  return Boolean(nonDirectionalBase(root, occupied));
}

function nonDirectionalBase(root, occupied) {
  const normalized = normalizeStateRoot(root);
  if (!/^[东南西北]/u.test(normalized)) return "";
  const base = normalized.slice(1);
  return base && occupied.has(base) ? base : "";
}

function makeOrdinalStateRoot(root, occupied) {
  const base = nonDirectionalBase(root, occupied) || normalizeStateRoot(root) || "新国";
  if (!occupied.has(base)) return base;
  for (let ordinal = 2; ordinal < 100; ordinal += 1) {
    const candidate = `${base}${toChineseOrdinal(ordinal)}`;
    if (!occupied.has(candidate)) return candidate;
  }
  return `${base}${occupied.size + 1}`;
}

function toChineseOrdinal(value) {
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const numeric = Math.max(1, Math.floor(Number(value) || 1));
  if (numeric < 10) return digits[numeric];
  if (numeric === 10) return "十";
  if (numeric < 20) return `十${digits[numeric - 10]}`;
  if (numeric < 100) {
    const tens = Math.floor(numeric / 10);
    const ones = numeric % 10;
    return `${digits[tens]}十${ones ? digits[ones] : ""}`;
  }
  return String(numeric);
}

function normalizeChanges(changes) {
  const byCell = new Map();
  for (const change of changes || []) {
    const gridCell = Number(change.gridCell);
    const before = normalizeStateId(change.before);
    const after = normalizeStateId(change.after);
    if (!Number.isInteger(gridCell) || before === after) continue;
    const previous = byCell.get(gridCell);
    byCell.set(gridCell, {
      gridCell,
      before: previous?.before ?? before,
      after
    });
  }
  return [...byCell.values()];
}

function applyStateChanges(map, changes, key, originalPackStates) {
  if (!map?.grid?.cells?.state) return;
  for (const change of changes) {
    const stateId = normalizeStateId(change[key]);
    map.grid.cells.state[change.gridCell] = stateId;
    for (const packCell of getPackCellsForGrid(map, change.gridCell)) {
      if (!isPackLandCell(map, packCell)) continue;
      if (originalPackStates && !originalPackStates.has(packCell)) originalPackStates.set(packCell, map.pack.cells.state[packCell]);
      map.pack.cells.state[packCell] = stateId;
    }
  }
}

function fieldsChanged(current, before) {
  if (!current || !before) return false;
  return Object.entries(before).some(([key, value]) => Array.isArray(value)
    ? !Array.isArray(current[key]) || value.length !== current[key].length || value.some((v, i) => v !== current[key][i])
    : current[key] !== value);
}

function captureStateBrushReplica(map, changes, settlements, politics, statesBefore, retirement) {
  const grid = changes.map(change => change.gridCell);
  const pack = politics.packStates.map(([id]) => id);
  const states = statesBefore.filter(item => item && (fieldsChanged(map.politics.states[item.stateId], item.state)
    || fieldsChanged(map.pack.states?.[item.stateId], item.packState))).map(item => item.stateId);
  const provinces = politics.provinces.filter(item => fieldsChanged(map.politics.provinces[item.provinceId], item.province)
    || fieldsChanged(map.pack.provinces?.[item.provinceId], item.packProvince)).map(item => item.provinceId);
  const cities = new Set(), burgs = new Set();
  for (const item of [...settlements.capitalCitySnapshots, ...settlements.replacementCapitalSnapshots, ...settlements.movedCities]) {
    if (fieldsChanged(map.settlements.cities[item.cityId], item.city)) cities.add(item.cityId);
    if (fieldsChanged(map.pack.burgs[item.burgId], item.burg) || (item.burg && Object.hasOwn(map.pack.burgs[item.burgId], "province") !== Object.hasOwn(item.burg, "province"))) burgs.add(item.burgId);
  }
  for (const item of settlements.capitalBurgSnapshots) {
    if (fieldsChanged(map.pack.burgs[item.burgId], item.burg)) burgs.add(item.burgId);
  }
  const rows = {"grid.cells.state": grid, "grid.cells.province": grid, "pack.cells.state": pack, "pack.cells.province": pack,
    "politics.states": states, "pack.states": states.filter(id => map.pack.states?.[id]),
    "politics.provinces": provinces, "pack.provinces": provinces.filter(id => map.pack.provinces?.[id]),
    "settlements.cities": [...cities], "pack.burgs": [...burgs]};
  const fields = ["metadata.derivedStale", ...["military", "zones", "markers", "economy", "diplomacy"]
    .filter(kind => map[kind]?.metadata).map(kind => kind + ".metadata.stale")];
  const tables = [];
  if (retirement.length) {
    for (const path of ["politics.states", "pack.states", "politics.provinces", "pack.provinces", "settlements.cities", "pack.burgs"]) {
      const [section, key] = path.split(".");
      for (const edit of retirement) if (edit.table === map[section]?.[key]) rows[path].push(edit.key);
    }
    if (map.politics.metadata) fields.push("politics.metadata");
  }
  const created = settlements.createdCapitalCells;
  if ((retirement.length || created.length) && map.settlements.metadata) fields.push("settlements.metadata");
  if (created.length) {
    if (map.grid.cells.burg) rows["grid.cells.burg"] = created.map(item => item.gridCell);
    if (settlements.packBurgArray !== map.pack.cells.burg) fields.push("pack.cells.burg");
    else if (map.pack.cells.burg) rows["pack.cells.burg"] = created.map(item => item.packCell);
    for (const [path, before, after] of [["settlements.cities", settlements.cityLength, map.settlements.cities.length],
      ["pack.burgs", settlements.burgLength, map.pack.burgs.length]]) {
      const start = rows[path].reduce((lowest, id) => Math.min(lowest, id), before);
      tables.push({path, start, before, after});
      delete rows[path];
    }
  }
  return {rows, fields, tables};
}

function captureSettlementSnapshot(map, changes) {
  const nextStateByGrid = new Map(changes.map(change => [change.gridCell, normalizeStateId(change.after)]));
  const movedCities = [];
  const affectedStates = new Set(changes.flatMap(change => [change.before, change.after]).filter(stateId => stateId > 0));

  for (const city of map?.settlements?.cities || []) {
    if (!city) continue;
    if (!nextStateByGrid.has(city.cell)) continue;
    const nextState = nextStateByGrid.get(city.cell);
    if (city.state === nextState) continue;
    const burg = findBurgForCity(map, city);
    const previousState = normalizeStateId(city.state);
    movedCities.push({
      cityId: city.id,
      burgId: city.burgId,
      previousState,
      nextState,
      city: snapshotCity(city),
      burg: snapshotBurg(burg)
    });
    if (previousState) affectedStates.add(previousState);
    affectedStates.add(nextState);
  }

  const movedCityIds = new Set(movedCities.map(item => item.cityId));
  const replacementCapitalSnapshots = [];
  const capturedReplacementCities = new Set();
  for (const item of movedCities) {
    const state = map?.politics?.states?.[item.previousState];
    const movedCapital = Boolean(item.city.capital || item.burg?.capital || state?.capital === item.burgId);
    if (!movedCapital) continue;
    const candidate = chooseReplacementCapitalCandidate(map, item.previousState, movedCityIds);
    if (!candidate || capturedReplacementCities.has(candidate.id)) continue;
    const burg = findBurgForCity(map, candidate);
    replacementCapitalSnapshots.push({
      cityId: candidate.id,
      burgId: candidate.burgId,
      city: snapshotCity(candidate),
      burg: snapshotBurg(burg)
    });
    capturedReplacementCities.add(candidate.id);
  }

  return {
    movedCities,
    replacementCapitalSnapshots,
    capitalCitySnapshots: (map?.settlements?.cities || [])
      .filter(city => city && affectedStates.has(normalizeStateId(city.state)))
      .map(city => ({cityId: city.id, burgId: city.burgId, city: snapshotCity(city), burg: snapshotBurg(findBurgForCity(map, city))})),
    capitalBurgSnapshots: (map?.pack?.burgs || [])
      .map((burg, burgId) => burg && affectedStates.has(normalizeStateId(burg.state)) ? {burgId, burg: snapshotBurg(burg)} : null)
      .filter(Boolean),
    cityLength: map?.settlements?.cities?.length || 0,
    burgLength: map?.pack?.burgs?.length || 0,
    packBurgArray: map?.pack?.cells?.burg || null,
    settlementMetadata: clonePlain(map?.settlements?.metadata),
    createdCapitalCells: [],
    states: [...affectedStates].map(stateId => snapshotState(map, stateId)).filter(Boolean)
  };
}

function capturePoliticalDerivativeSnapshot(map, changes, settlementSnapshot, originalPackStates, provinces, plan) {
  const packCells = plan ? null : uniquePackCellsForChanges(map, changes);
  return {
    gridProvinces: plan?.gridProvinces || changes.map(change => [change.gridCell, map?.grid?.cells?.province?.[change.gridCell] ?? 0]),
    packStates: plan?.packStates || packCells.map(packCell => [packCell, originalPackStates?.get(packCell) ?? map?.pack?.cells?.state?.[packCell] ?? 0]),
    packProvinces: plan?.packProvinces || packCells.map(packCell => [packCell, map?.pack?.cells?.province?.[packCell] ?? 0]),
    cities: (settlementSnapshot?.movedCities || []).map(item => {
      const city = map?.settlements?.cities?.[item.cityId];
      return city ? {cityId: item.cityId, province: city.province} : null;
    }).filter(Boolean),
    provinces: provinces || snapshotProvinces(map),
    stale: snapshotDerivedStale(map)
  };
}

function applySettlementTransfers(map, snapshot, currentScale) {
  if (!snapshot?.movedCities?.length) return;

  for (const item of snapshot.movedCities) {
    const city = map?.settlements?.cities?.[item.cityId];
    const burg = map?.pack?.burgs?.[item.burgId] || findBurgForCity(map, city);
    if (!city) continue;
    const wasCapital = Boolean(city.capital || burg?.capital || map?.politics?.states?.[item.previousState]?.capital === item.burgId);

    city.state = item.nextState;
    if (wasCapital) {
      city.capital = false;
      city.group = deriveCityScale(city, currentScale(), burg);
    }

    if (burg) {
      burg.state = item.nextState;
      if (wasCapital) {
        burg.capital = 0;
        burg.group = city.group;
      }
    }
  }
}

function reconcileStateCapitals(map, stateIds, snapshot, withoutPackLand, currentScale) {
  let created = 0;
  for (const stateId of stateIds) {
    const state = map?.politics?.states?.[stateId];
    if (!state || state.removed) continue;
    const current = findCityByBurgId(map, state.capital);
    const validCurrent = isCityInStateLand(map, current, stateId) ? current : null;
    for (const city of map?.settlements?.cities || []) {
      if (!city || normalizeStateId(city.state) !== stateId) continue;
      city.capital = false;
      const burg = findBurgForCity(map, city);
      if (burg) burg.capital = 0;
    }
    for (const burg of map?.pack?.burgs || []) {
      if (burg && normalizeStateId(burg.state) === stateId) burg.capital = 0;
    }
    if (!validCurrent && !chooseEmptyStateAnchor(map, stateId, state.center)) {
      withoutPackLand.push(stateId);
      assignStateCapitalAnchor(map, stateId, {capital: 0, capitalName: "", center: 0, gridCenter: 0});
      continue;
    }
    if (validCurrent) {
      setStateCapitalCity(map, stateId, validCurrent, currentScale());
      continue;
    }
    const beforeCityLength = map.settlements.cities.length;
    const createdCapital = ensureReplacementCapitalForState(map, stateId);
    if (map.settlements.cities.length > beforeCityLength) {
      snapshot.createdCapitalCells.push(createdCapital);
      created++;
    }
    const replacement = findCityByBurgId(map, map.politics.states[stateId].capital);
    if (!isCityInStateLand(map, replacement, stateId)) throw new Error(`国家 #${stateId} 有领土但无法补齐首都`);
    setStateCapitalCity(map, stateId, replacement, currentScale());
  }
  if (created) refreshSettlementMetadata(map);
  return created;
}

function assertAffectedStateCapitals(map, stateIds) {
  for (const stateId of stateIds) {
    const state = map?.politics?.states?.[stateId];
    if (!state || state.removed) continue;
    const cityCapitals = (map?.settlements?.cities || []).filter(city => city?.state === stateId && city.capital);
    const burgCapitals = (map?.pack?.burgs || []).filter(burg => burg?.state === stateId && burg.capital);
    const validCapital = cityCapitals.length === 1 && isCityInStateLand(map, cityCapitals[0], stateId);
    const hasLand = validCapital || Boolean(chooseEmptyStateAnchor(map, stateId, state.center));
    if (!hasLand) {
      if (state.capital || cityCapitals.length || burgCapitals.length) throw new Error(`国家 #${stateId} 已无领土但仍有首都`);
      continue;
    }
    if (cityCapitals.length !== 1 || burgCapitals.length !== 1 || cityCapitals[0].burgId !== state.capital
      || (burgCapitals[0].i ?? burgCapitals[0].id) !== state.capital
      || !validCapital
      || map?.pack?.states?.[stateId]?.capital !== state.capital) {
      throw new Error(`国家 #${stateId} 首都归属或数量未能补齐`);
    }
  }
}

function isCityInStateLand(map, city, stateId) {
  const burg = findBurgForCity(map, city);
  return Boolean(city && burg && normalizeStateId(city.state) === stateId && normalizeStateId(burg.state) === stateId
    && isPackLandCell(map, burg.cell) && normalizeStateId(map.pack.cells.state?.[burg.cell]) === stateId);
}

function setStateCapitalCity(map, stateId, city, scaleContext) {
  const burg = findBurgForCity(map, city);
  if (!burg) return;
  const scale = deriveCityScale(city, scaleContext, burg);
  city.capital = true;
  city.group = scale;
  burg.capital = 1;
  burg.group = scale;
  assignStateCapitalAnchor(map, stateId, {
    capital: burg.i ?? city.burgId,
    capitalName: city.name || burg.name || "",
    center: burg.cell,
    gridCenter: map.pack.cells.g?.[burg.cell] ?? city.cell
  });
}

function repairStateColorConflicts(map, stateIds) {
  const recolored = [];
  for (const stateId of [...stateIds].sort((a, b) => b - a)) {
    const state = map?.politics?.states?.[stateId];
    if (!state || state.removed || !state.color) continue;
    if (!(state.neighbors || []).some(id => map.politics.states[id]?.color?.toLowerCase() === state.color.toLowerCase())) continue;
    const next = chooseNewStateColor(state, map.politics.states);
    if (next.toLowerCase() === state.color.toLowerCase()) continue;
    state.color = next;
    const packState = map?.pack?.states?.[stateId];
    if (packState && packState !== state) packState.color = next;
    recolored.push(stateId);
  }
  return recolored;
}

function repairPoliticalDerivativesForStateBrush(map, changes, settlementSnapshot, packProvinces, plan) {
  const affectedProvinces = plan ? plan.apply() : repairProvinceCells(map, changes, packProvinces);
  syncMovedCityProvinces(map, settlementSnapshot);
  markDerivedStale(map, ["military", "zones", "state-markers"]);
  return affectedProvinces;
}

function repairProvinceCells(map, changes, packProvinces, affectedProvinces = new Set(), largestProvinces = new Map()) {
  for (const [packCell] of packProvinces) {
    if (!isPackLandCell(map, packCell)) continue;
    const stateId = normalizeStateId(map.pack.cells.state?.[packCell]);
    const provinceId = normalizeProvinceId(map.pack.cells.province?.[packCell]);
    if (provinceId) affectedProvinces.add(provinceId);
    if (!stateId) {
      map.pack.cells.province[packCell] = 0;
      continue;
    }
    if (provinceBelongsToState(map, provinceId, stateId)) continue;
    const nextProvince = chooseProvinceForState(map, stateId, packCell, largestProvinces);
    map.pack.cells.province[packCell] = nextProvince;
    if (nextProvince) affectedProvinces.add(nextProvince);
  }

  for (const change of changes) {
    if (!map?.grid?.cells?.province) continue;
    map.grid.cells.province[change.gridCell] = chooseGridProvince(map, change.gridCell, largestProvinces);
    if (map.grid.cells.province[change.gridCell]) affectedProvinces.add(map.grid.cells.province[change.gridCell]);
  }
  return affectedProvinces;
}

function syncMovedCityProvinces(map, settlementSnapshot) {
  for (const item of settlementSnapshot?.movedCities || []) {
    const city = map?.settlements?.cities?.[item.cityId];
    if (!city) continue;
    const packProvince = Number.isInteger(city.packCell) ? map?.pack?.cells?.province?.[city.packCell] : null;
    if (packProvince !== null && packProvince !== undefined) city.province = normalizeProvinceId(packProvince);
    else if (Number.isInteger(city.cell)) city.province = normalizeProvinceId(map?.grid?.cells?.province?.[city.cell]);
    const burg = findBurgForCity(map, city);
    if (burg) burg.province = city.province;
    if (item.city.province !== city.province) city.provincial = Boolean(city.province && map.politics.provinces?.[city.province]?.burg === city.burgId);
  }
}

function restoreSettlementSnapshot(map, snapshot) {
  if (!snapshot) return;
  for (const stateSnapshot of snapshot.states || []) restoreState(map, stateSnapshot);
  for (const {packCell, previousPackBurg, gridCell, previousGridBurg} of [...(snapshot.createdCapitalCells || [])].reverse()) {
    if (map?.pack?.cells?.burg) map.pack.cells.burg[packCell] = previousPackBurg;
    if (map?.grid?.cells?.burg) map.grid.cells.burg[gridCell] = previousGridBurg;
  }
  if (map?.pack?.cells && snapshot.packBurgArray && map.pack.cells.burg !== snapshot.packBurgArray) map.pack.cells.burg = snapshot.packBurgArray;
  if (map?.settlements?.cities) map.settlements.cities.length = snapshot.cityLength;
  if (map?.pack?.burgs) map.pack.burgs.length = snapshot.burgLength;
  if (map?.settlements?.metadata && snapshot.settlementMetadata) Object.assign(map.settlements.metadata, snapshot.settlementMetadata);
  for (const item of snapshot.capitalCitySnapshots || []) {
    const city = map?.settlements?.cities?.[item.cityId];
    const burg = map?.pack?.burgs?.[item.burgId];
    if (city) Object.assign(city, item.city);
    if (burg && item.burg) Object.assign(burg, item.burg);
  }
  for (const item of snapshot.capitalBurgSnapshots || []) {
    const burg = map?.pack?.burgs?.[item.burgId];
    if (burg) Object.assign(burg, item.burg);
  }
  for (const item of snapshot.replacementCapitalSnapshots || []) {
    const city = map?.settlements?.cities?.[item.cityId];
    const burg = map?.pack?.burgs?.[item.burgId];
    if (city) Object.assign(city, item.city);
    if (burg && item.burg) Object.assign(burg, item.burg);
  }
  for (const item of snapshot.movedCities || []) {
    const city = map?.settlements?.cities?.[item.cityId];
    const burg = map?.pack?.burgs?.[item.burgId];
    if (city) Object.assign(city, item.city);
    if (burg && item.burg) {
      Object.assign(burg, item.burg);
      if (!Object.hasOwn(item.burg, "province")) delete burg.province;
    }
  }
}

function restorePoliticalDerivativeSnapshot(map, snapshot) {
  if (!snapshot) return;
  for (const [gridCell, provinceId] of snapshot.gridProvinces || []) {
    if (map?.grid?.cells?.province) map.grid.cells.province[gridCell] = provinceId;
  }
  for (const [packCell, provinceId] of snapshot.packProvinces || []) {
    if (map?.pack?.cells?.province) map.pack.cells.province[packCell] = provinceId;
  }
  for (const [packCell, stateId] of snapshot.packStates || []) {
    if (map?.pack?.cells?.state) map.pack.cells.state[packCell] = stateId;
  }
  for (const item of snapshot.cities || []) {
    const city = map?.settlements?.cities?.[item.cityId];
    if (city) city.province = item.province;
  }
  restoreProvinces(map, snapshot.provinces);
  restoreDerivedStale(map, snapshot.stale);
}

function chooseReplacementCapital(map, stateId) {
  const state = map?.politics?.states?.[stateId];
  if (!state) return;
  const candidate = chooseReplacementCapitalCandidate(map, stateId);

  if (!candidate) {
    const anchor = chooseEmptyStateAnchor(map, stateId, state.center);
    assignStateCapitalAnchor(map, stateId, {
      capital: 0,
      capitalName: "",
      center: anchor?.center ?? 0,
      gridCenter: anchor?.gridCenter ?? 0
    });
    return;
  }

  const burg = findBurgForCity(map, candidate);
  if (!burg) return;
  const scale = cityScaleForMap(map, candidate, burg);
  candidate.capital = true;
  candidate.group = scale;
  burg.capital = 1;
  burg.group = scale;
  assignStateCapitalAnchor(map, stateId, {
    capital: burg.i ?? candidate.burgId,
    capitalName: candidate.name || burg.name || "",
    center: burg.cell ?? candidate.packCell,
    gridCenter: map?.pack?.cells?.g?.[burg.cell] ?? candidate.cell,
    religion: map?.pack?.cells?.religion?.[burg.cell] ?? state.religion
  });
}

function ensureReplacementCapitalForState(map, stateId) {
  chooseReplacementCapital(map, stateId);
  const state = map?.politics?.states?.[stateId];
  if (!state || state.capital) return;
  const cells = map?.pack?.cells;
  const packCell = (cells?.i || []).find(cell => isPackLandCell(map, cell)
    && normalizeStateId(cells.state?.[cell]) === stateId
    && !normalizePoliticalId(cells.burg?.[cell]));
  if (!Number.isInteger(packCell)) return;
  const gridCell = Number(cells.g?.[packCell]);
  const provinceId = normalizeProvinceId(cells.province?.[packCell]);
  const nameGenerator = createChineseNameGenerator(`${map.metadata?.seed || map.options?.seed || "map"}|replacement-capital|${stateId}`, {namebases: map.namebases});
  const capital = createCapitalCity(map, {
    stateId, provinceId, packCell, gridCell,
    cultureId: normalizeCultureId(cells.culture?.[packCell]),
    religionId: normalizeCultureId(cells.religion?.[packCell]), nameGenerator
  });
  assignStateCapitalAnchor(map, stateId, {
    capital: capital.burgId, capitalName: capital.name, center: packCell, gridCenter: gridCell
  });
  return capital;
}

function repairProvincesAfterStateCreation(map, provinceIds) {
  const changedCityIds = new Set();
  for (const provinceId of provinceIds) {
    const province = map?.politics?.provinces?.[provinceId];
    if (!province || province.removed) continue;
    if (!province.cells) {
      province.burg = 0;
      province.removed = true;
      const parent = map?.politics?.states?.[normalizeStateId(province.state)];
      if (parent?.provinces) parent.provinces = parent.provinces.filter(id => normalizeProvinceId(id) !== provinceId);
      continue;
    }
    if (normalizeProvinceId(map?.pack?.cells?.province?.[province.center]) !== provinceId) {
      const anchor = (map?.pack?.cells?.i || []).find(cell => isPackLandCell(map, cell)
        && normalizeProvinceId(map.pack.cells.province?.[cell]) === provinceId);
      if (Number.isInteger(anchor)) {
        province.center = anchor;
        province.gridCenter = map.pack.cells.g?.[anchor] ?? province.gridCenter;
      }
    }
    const current = findCityByBurgId(map, province.burg);
    if (current && normalizeProvinceId(current.province) === provinceId) continue;
    const candidate = (map?.settlements?.cities || [])
      .filter(city => city && normalizeProvinceId(city.province) === provinceId)
      .sort((a, b) => Number(b.provincial) - Number(a.provincial) || (b.population || 0) - (a.population || 0) || a.id - b.id)[0];
    province.burg = candidate?.burgId || 0;
    if (candidate) {
      candidate.provincial = true;
      changedCityIds.add(candidate.id);
    }
  }
  return changedCityIds;
}

function findNewStateGridNeighbors(map, changes, stateId) {
  const result = new Set();
  for (const change of changes) {
    for (const neighbor of map?.grid?.cells?.c?.[change.gridCell] || []) {
      if (!isGridLandCell(map, neighbor)) continue;
      const otherId = normalizeStateId(map.grid.cells.state?.[neighbor]);
      if (otherId > 0 && otherId !== stateId && map.politics.states?.[otherId] && !map.politics.states[otherId].removed) result.add(otherId);
    }
  }
  return result;
}

function chooseEmptyStateAnchor(map, stateId, preferredCenter) {
  const cells = map?.pack?.cells;
  const isValid = cell => Number.isInteger(cell)
    && cell >= 0
    && cell < Number(cells?.i?.length || 0)
    && isPackLandCell(map, cell)
    && Number(cells?.state?.[cell]) === stateId
    && Number.isInteger(Number(cells?.g?.[cell]));
  const preferred = Number(preferredCenter);
  if (isValid(preferred)) return {center: preferred, gridCenter: Number(cells.g[preferred])};
  let center = null;
  for (const packCell of cells?.i || []) {
    const cell = Number(packCell);
    if (isValid(cell) && (center === null || cell < center)) center = cell;
  }
  return center === null ? null : {center, gridCenter: Number(cells.g[center])};
}

function assignStateCapitalAnchor(map, stateId, anchor) {
  const politicsState = map?.politics?.states?.[stateId];
  const packState = map?.pack?.states?.[stateId];
  if (politicsState) Object.assign(politicsState, anchor);
  if (packState && packState !== politicsState) Object.assign(packState, anchor);
}

function chooseReplacementCapitalCandidate(map, stateId, excludedCityIds = new Set()) {
  return (map?.settlements?.cities || [])
    .filter(city => city && isCityInStateLand(map, city, stateId) && !excludedCityIds.has(city.id))
    .sort((a, b) => Number(b.provincial) - Number(a.provincial) || (b.population || 0) - (a.population || 0) || a.id - b.id)[0];
}

function refreshProvinceSummaries(map) {
  const provinces = map?.politics?.provinces || map?.pack?.provinces;
  const cells = map?.pack?.cells;
  if (!provinces || !cells?.province) return;
  const neighborSets = provinces.map(() => new Set());

  for (const province of provinces) {
    if (!province) continue;
    province.cells = 0;
    province.area = 0;
    province.neighbors = [];
  }

  for (const cell of cells.i || []) {
    if (!isPackLandCell(map, cell)) continue;
    const provinceId = normalizeProvinceId(cells.province[cell]);
    const province = provinces[provinceId];
    if (!province) continue;
    province.cells++;
    province.area += cells.area?.[cell] || 0;

    for (const neighbor of cells.c?.[cell] || []) {
      if (!isPackLandCell(map, neighbor)) continue;
      const neighborProvince = normalizeProvinceId(cells.province[neighbor]);
      if (neighborProvince && neighborProvince !== provinceId && provinces[neighborProvince]) {
        neighborSets[provinceId]?.add(neighborProvince);
      }
    }
  }

  for (const province of provinces) {
    if (!province) continue;
    province.area = roundValue(province.area || 0, 2);
    province.neighbors = Array.from(neighborSets[province.i ?? province.id] || []);
  }
}

function refreshProvincePoles(map, targetProvinceIds = null, preparedGroups = null) {
  const provinces = map?.politics?.provinces || map?.pack?.provinces;
  const cells = map?.pack?.cells;
  if (!provinces || !cells?.province || !cells?.p) return;
  const targets = targetProvinceIds?.size ? targetProvinceIds : new Set(provinces.map(province => normalizeProvinceId(province?.i ?? province?.id)).filter(Boolean));
  const groups = preparedGroups || new Map([...targets].map(id => [id, {cells: [], boundary: []}]));
  if (!preparedGroups) {
    for (const cell of cells.i || []) {
      if (!isPackLandCell(map, cell)) continue;
      const provinceId = normalizeProvinceId(cells.province[cell]);
      const group = groups.get(provinceId);
      if (!group) continue;
      group.cells.push(cell);
      if ((cells.c?.[cell] || []).some(neighbor => !isPackLandCell(map, neighbor) || normalizeProvinceId(cells.province?.[neighbor]) !== provinceId)) group.boundary.push(cell);
    }
  }

  for (const provinceId of targets) {
    const province = provinces[provinceId];
    if (!province || province.removed) continue;
    const group = groups.get(provinceId);
    const ownCells = group?.cells || [];
    if (!ownCells.length) {
      province.pole = null;
      continue;
    }
    const boundaryCells = group.boundary.length ? group.boundary : ownCells;
    const poleCell = findProvincePoleCell(cells, ownCells, boundaryCells, province.center);
    province.pole = cells.p[poleCell].map(value => roundValue(value, 2));
  }
}

export function findProvincePoleCell(cells, ownCells, boundaryCells, fallbackCell) {
  if (ownCells.length <= 2) return fallbackCell && ownCells.includes(fallbackCell) ? fallbackCell : ownCells[0];
  const boundaryTree = ownCells.length * boundaryCells.length >= 4096
    ? createProvinceBoundaryTree(boundaryCells, cells)
    : null;
  const boundary = boundaryTree && new Set(boundaryCells);
  let bestCell = ownCells[0];
  let bestScore = -Infinity;
  for (const cell of ownCells) {
    const point = cells.p[cell];
    if (!point) continue;
    const minBoundaryDistance = boundary?.has(cell) ? 0 : boundaryTree
      ? nearestProvinceBoundaryDistanceSquared(point, boundaryTree)
      : getMinDistanceSquared(point, boundaryCells, cells);
    const populationScore = cells.pop?.[cell] || cells.s?.[cell] || 0;
    const burgScore = cells.burg?.[cell] ? 5 : 0;
    const score = minBoundaryDistance + populationScore * 0.02 + burgScore;
    if (score <= bestScore) continue;
    bestCell = cell;
    bestScore = score;
  }
  return bestCell;
}

function createProvinceBoundaryTree(boundaryCells, cells) {
  const points = boundaryCells.flatMap(cell => {
    const point = cells.p[cell];
    return point ? [{x: point[0], y: point[1], cell}] : [];
  });
  const build = (items, axis) => {
    if (!items.length) return null;
    items.sort((a, b) => axis ? a.y - b.y || a.x - b.x || a.cell - b.cell : a.x - b.x || a.y - b.y || a.cell - b.cell);
    const middle = Math.floor(items.length / 2);
    return {point: items[middle], axis, left: build(items.slice(0, middle), 1 - axis), right: build(items.slice(middle + 1), 1 - axis)};
  };
  return build(points, 0);
}

function nearestProvinceBoundaryDistanceSquared(point, tree) {
  if (!tree) return 0;
  const nearest = (node, best) => {
    if (!node) return best;
    const dx = point[0] - node.point.x;
    const dy = point[1] - node.point.y;
    const distance = dx ** 2 + dy ** 2;
    if (distance < best) best = distance;
    const axisDistance = node.axis ? dy : dx;
    best = nearest(axisDistance < 0 ? node.left : node.right, best);
    if (axisDistance ** 2 <= best) best = nearest(axisDistance < 0 ? node.right : node.left, best);
    return best;
  };
  return nearest(tree, Infinity);
}

function getMinDistanceSquared(point, boundaryCells, cells) {
  let min = Infinity;
  for (const cell of boundaryCells) {
    const nextPoint = cells.p[cell];
    if (!nextPoint) continue;
    const next = (point[0] - nextPoint[0]) ** 2 + (point[1] - nextPoint[1]) ** 2;
    if (next < min) min = next;
  }
  return Number.isFinite(min) ? min : 0;
}

function refreshPoliticalSummaries(map, stroke = null, poleGroups = null, scan = null) {
  const provinces = map?.politics?.provinces || map?.pack?.provinces;
  const states = map?.politics?.states;
  const cells = map?.pack?.cells;
  if (!provinces || !states || !cells?.province || !cells?.state) {
    refreshProvinceSummaries(map);
    refreshStateSummaries(map);
    return;
  }
  // 归属变化只会影响原属、新属及共边对象的相邻关系。
  const provinceIds = stroke && new Set();
  const stateIds = stroke && new Set();
  const interior = scan?.interior;
  if (stroke) {
    for (let i = 0; i < stroke.packProvinces.length; i++) {
      const [cell, province] = stroke.packProvinces[i];
      provinceIds.add(province).add(cells.province[cell]);
      stateIds.add(stroke.packStates[i][1]).add(cells.state[cell]);
      if (interior) interior[cell] = 0;
      for (const neighbor of cells.c[cell] || []) {
        provinceIds.add(cells.province[neighbor]);
        stateIds.add(cells.state[neighbor]);
        if (interior) interior[neighbor] = 0;
      }
    }
  }
  const provinceTargets = provinceIds ? [...provinceIds].map(id => provinces[id]).filter(Boolean) : provinces;
  const stateTargets = stateIds ? [...stateIds].map(id => states[id]).filter(Boolean) : states;
  const provinceNeighbors = provinces.map((province, id) => province && (!provinceIds || provinceIds.has(id)) && new Set());
  const stateNeighbors = states.map((state, id) => state && (!stateIds || stateIds.has(id)) && new Set());
  const land = scan?.land || new Uint8Array(cells.h.length);
  if (!scan) for (const cell of cells.i || []) land[cell] = Number(isPackLandCell(map, cell));
  for (const province of provinceTargets) {
    if (!province) continue;
    province.cells = 0;
    province.area = 0;
    province.neighbors = [];
  }
  for (const state of stateTargets) {
    if (!state) continue;
    state.cells = 0;
    state.area = 0;
    state.burgs = 0;
    state.rural = 0;
    state.urban = 0;
    state.neighbors = [];
  }
  for (const cell of cells.i || []) {
    if (!land[cell]) continue;
    const provinceId = normalizeProvinceId(cells.province[cell]);
    const province = provinceNeighbors[provinceId] && provinces[provinceId];
    const stateId = cells.state[cell] || 0;
    const state = stateNeighbors[stateId] && states[stateId];
    const poleGroup = poleGroups?.get(provinceId);
    if (!province && !state && !poleGroup) continue;
    if (province) {
      province.cells++;
      province.area += cells.area?.[cell] || 0;
    }
    if (state) {
      state.cells++;
      state.area += cells.area?.[cell] || 0;
      state.rural += cells.pop?.[cell] || 0;
    }
    if (poleGroup) poleGroup.cells.push(cell);
    if (interior?.[cell]) continue;
    let boundary = false;
    for (const neighbor of cells.c?.[cell] || []) {
      if (!land[neighbor]) {
        boundary = true;
        continue;
      }
      if (province || poleGroup) {
        const neighborProvince = normalizeProvinceId(cells.province[neighbor]);
        if (neighborProvince !== provinceId) boundary = true;
        if (province && neighborProvince && neighborProvince !== provinceId && provinces[neighborProvince]) provinceNeighbors[provinceId].add(neighborProvince);
      }
      if (state) {
        const neighborState = cells.state[neighbor] || 0;
        if (neighborState && neighborState !== stateId) stateNeighbors[stateId]?.add(neighborState);
      }
    }
    if (poleGroup && boundary) poleGroup.boundary.push(cell);
  }
  for (const burg of map.pack.burgs || []) {
    if (!burg?.i || burg.removed) continue;
    const state = stateNeighbors[burg.state] && states[burg.state];
    if (!state) continue;
    state.urban += burg.population || 0;
    state.burgs++;
  }
  for (const province of provinceTargets) {
    if (!province) continue;
    province.area = roundValue(province.area || 0, 2);
    province.neighbors = Array.from(provinceNeighbors[province.i ?? province.id] || []);
  }
  finalizeStateSummaries(stateTargets, stateNeighbors);
  return poleGroups;
}

function refreshStateSummaries(map) {
  const states = map?.politics?.states;
  if (!states) return;
  for (const state of states) {
    if (!state) continue;
    state.cells = 0;
    state.area = 0;
    state.burgs = 0;
    state.rural = 0;
    state.urban = 0;
    state.neighbors = [];
  }

  if (map?.pack?.cells?.state) {
    refreshPackStateSummaries(map);
  } else {
    refreshGridStateSummaries(map);
  }
}

function refreshPackStateSummaries(map) {
  const {cells} = map.pack;
  const states = map.politics.states;
  const neighborSets = states.map(() => new Set());

  for (const cell of cells.i || []) {
    if (!isPackLandCell(map, cell)) continue;
    const stateId = cells.state[cell] || 0;
    const state = states[stateId];
    if (!state) continue;
    state.cells++;
    state.area += cells.area?.[cell] || 0;
    state.rural += cells.pop?.[cell] || 0;
    for (const neighbor of cells.c?.[cell] || []) {
      if (!isPackLandCell(map, neighbor)) continue;
      const neighborState = cells.state[neighbor] || 0;
      if (neighborState && neighborState !== stateId) neighborSets[stateId]?.add(neighborState);
    }
  }

  for (const burg of map.pack.burgs || []) {
    if (!burg?.i || burg.removed) continue;
    const state = states[burg.state];
    if (!state) continue;
    state.urban += burg.population || 0;
    state.burgs++;
  }

  finalizeStateSummaries(states, neighborSets);
}

function refreshGridStateSummaries(map) {
  const {cells} = map.grid;
  const states = map.politics.states;
  const neighborSets = states.map(() => new Set());

  for (const cell of cells.i || []) {
    if (!isGridLandCell(map, cell)) continue;
    const stateId = cells.state[cell] || 0;
    const state = states[stateId];
    if (!state) continue;
    state.cells++;
    state.rural += cells.pop?.[cell] || 0;
    for (const neighbor of cells.c?.[cell] || []) {
      if (!isGridLandCell(map, neighbor)) continue;
      const neighborState = cells.state[neighbor] || 0;
      if (neighborState && neighborState !== stateId) neighborSets[stateId]?.add(neighborState);
    }
  }

  for (const city of map.settlements?.cities || []) {
    if (!city) continue;
    const state = states[city.state];
    if (!state) continue;
    state.urban += city.population || 0;
    state.burgs++;
  }

  finalizeStateSummaries(states, neighborSets);
}

function finalizeStateSummaries(states, neighborSets) {
  for (const state of states) {
    if (!state) continue;
    state.area = roundValue(state.area || state.cells || 0, 2);
    state.rural = roundValue(state.rural || 0, 2);
    state.urban = roundValue(state.urban || 0, 2);
    state.neighbors = Array.from(neighborSets[state.i ?? state.id] || []);
  }
}

function uniquePackCellsForChanges(map, changes) {
  const cells = new Set();
  for (const change of changes) {
    for (const packCell of getPackCellsForGrid(map, change.gridCell)) cells.add(packCell);
  }
  return [...cells];
}

function getPackCellsForGrid(map, gridCell) {
  if (!map?.pack?.cells?.g || !map?.pack?.cells?.state) return [];
  return packCellsByGrid(map, "__stateEditorPackCellsByGrid").get(gridCell) || [];
}

function chooseGridProvince(map, gridCell, largestProvinces) {
  const stateId = normalizeStateId(map?.grid?.cells?.state?.[gridCell]);
  if (!stateId) return 0;
  let bestProvince = 0;
  let bestScore = -Infinity;
  for (const packCell of getPackCellsForGrid(map, gridCell)) {
    const provinceId = normalizeProvinceId(map?.pack?.cells?.province?.[packCell]);
    if (!provinceBelongsToState(map, provinceId, stateId)) continue;
    const score = map.pack.cells.pop?.[packCell] || map.pack.cells.s?.[packCell] || 0;
    if (score < bestScore) continue;
    bestProvince = provinceId;
    bestScore = score;
  }
  return bestProvince || chooseProvinceForState(map, stateId, null, largestProvinces) || normalizeProvinceId(map?.grid?.cells?.province?.[gridCell]);
}

function chooseProvinceForState(map, stateId, packCell, largestProvinces) {
  if (!stateId) return 0;
  const neighborProvince = chooseNeighborProvinceForState(map, stateId, packCell);
  if (neighborProvince) return neighborProvince;
  if (!largestProvinces.has(stateId)) largestProvinces.set(stateId, largestProvinceForState(map, stateId));
  return largestProvinces.get(stateId);
}

function chooseNeighborProvinceForState(map, stateId, packCell) {
  if (!Number.isInteger(packCell)) return 0;
  for (const neighbor of map?.pack?.cells?.c?.[packCell] || []) {
    const provinceId = normalizeProvinceId(map.pack.cells.province?.[neighbor]);
    if (provinceBelongsToState(map, provinceId, stateId)) return provinceId;
  }
  return 0;
}

function largestProvinceForState(map, stateId) {
  const stateProvinceIds = new Set((map?.politics?.states?.[stateId]?.provinces || []).map(normalizeProvinceId).filter(Boolean));
  const provinces = map?.politics?.provinces || map?.pack?.provinces || [];
  return provinces
    .filter(province => province && normalizeStateId(province.state) === stateId && (!stateProvinceIds.size || stateProvinceIds.has(normalizeProvinceId(province.i ?? province.id))))
    .sort((a, b) => (b.cells || 0) - (a.cells || 0) || normalizeProvinceId(a.i ?? a.id) - normalizeProvinceId(b.i ?? b.id))
    .map(province => normalizeProvinceId(province.i ?? province.id))[0] || 0;
}

function provinceBelongsToState(map, provinceId, stateId) {
  const province = map?.politics?.provinces?.[provinceId] || map?.pack?.provinces?.[provinceId];
  return Boolean(province && normalizeStateId(province.state) === stateId);
}

const provinceBrushFields = ["cells", "area", "pole", "neighbors"];
const stateBrushFields = ["capital", "color", "capitalName", "center", "gridCenter", "religion", "cells", "area", "burgs", "rural", "urban", "neighbors"];

function snapshotBrushFields(record, keys) {
  if (!record) return null;
  return Object.fromEntries(keys.map(key => [key, Array.isArray(record[key]) ? [...record[key]] : record[key]]));
}

function restoreBrushFields(record, fields) {
  if (!record || !fields) return;
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) delete record[key];
    else record[key] = Array.isArray(value) ? [...value] : value;
  }
}

function syncChangedBrushFields(mirror, record, before) {
  if (!record || !mirror) return;
  for (const [key, value] of Object.entries(before)) {
    const next = record[key];
    if (value === next || (Array.isArray(value) && value.length === next?.length && value.every((v, i) => v === next[i]))) continue;
    restoreBrushFields(mirror, {[key]: next});
  }
}

function snapshotProvinces(map) {
  return (map?.politics?.provinces || map?.pack?.provinces || []).flatMap(province => {
    if (!province) return [];
    const provinceId = province.i ?? province.id;
    const mirror = map.pack?.provinces?.[provinceId];
    return [{provinceId, province: snapshotBrushFields(province, provinceBrushFields),
      packProvince: mirror !== province ? snapshotBrushFields(mirror, provinceBrushFields) : null}];
  });
}

function restoreProvinces(map, snapshots = []) {
  const provinces = map?.politics?.provinces || map?.pack?.provinces;
  if (!provinces) return;
  for (const snapshot of snapshots) {
    const province = provinces[snapshot.provinceId];
    restoreBrushFields(province, snapshot.province);
    restoreBrushFields(map.pack?.provinces?.[snapshot.provinceId], snapshot.packProvince);
  }
}

function markDerivedStale(map, systems) {
  const stale = {
    systems: [...new Set([...(map?.metadata?.derivedStale?.systems || []), ...systems])],
    reason: "state-brush-political-derivatives",
    updatedAt: new Date().toISOString()
  };
  if (map?.metadata) map.metadata.derivedStale = stale;
  if (map?.military?.metadata) map.military.metadata.stale = stale.systems.includes("military");
  if (map?.zones?.metadata) map.zones.metadata.stale = stale.systems.includes("zones");
  if (map?.markers?.metadata) map.markers.metadata.stale = stale.systems.includes("state-markers");
  if (map?.economy?.metadata) map.economy.metadata.stale = stale.systems.includes("economy");
  if (map?.diplomacy?.metadata) map.diplomacy.metadata.stale = stale.systems.includes("diplomacy");
}

function snapshotDerivedStale(map) {
  return {
    map: map?.metadata?.derivedStale ? {...map.metadata.derivedStale, systems: [...(map.metadata.derivedStale.systems || [])]} : null,
    military: map?.military?.metadata ? map.military.metadata.stale : undefined,
    zones: map?.zones?.metadata ? map.zones.metadata.stale : undefined,
    markers: map?.markers?.metadata ? map.markers.metadata.stale : undefined,
    economy: map?.economy?.metadata ? map.economy.metadata.stale : undefined,
    diplomacy: map?.diplomacy?.metadata ? map.diplomacy.metadata.stale : undefined
  };
}

function restoreDerivedStale(map, snapshot) {
  if (!snapshot) return;
  if (map?.metadata) {
    if (snapshot.map) map.metadata.derivedStale = {...snapshot.map, systems: [...(snapshot.map.systems || [])]};
    else delete map.metadata.derivedStale;
  }
  for (const section of ["military", "zones", "markers", "economy", "diplomacy"]) {
    restoreBrushFields(map[section]?.metadata, {stale: snapshot[section]});
  }
}

function normalizeStateId(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? Math.max(0, numeric) : 0;
}

function uniqueStateIds(stateIds) {
  return [...new Set((stateIds || []).map(normalizeStateId).filter(stateId => stateId > 0))];
}

function normalizeProvinceId(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? Math.max(0, numeric) : 0;
}

function setStateColor(map, stateId, color) {
  const state = map?.politics?.states?.[stateId];
  if (!state || !color) return;
  state.color = color;
}

function snapshotStateGovernment(map, stateId) {
  return {
    stateId,
    politics: snapshotGovernmentFields(map?.politics?.states?.[stateId]),
    pack: map?.pack?.states?.[stateId] === map?.politics?.states?.[stateId] ? null : snapshotGovernmentFields(map?.pack?.states?.[stateId])
  };
}

function buildStateProvinceSuffixPlan(map, stateId, formName, overwriteCustom) {
  const state = map?.politics?.states?.[stateId] || map?.pack?.states?.[stateId];
  const cultures = map?.society?.cultures || map?.pack?.cultures || [];
  const allowedForms = state ? provinceFormsForState(state, cultures) : [];
  if (stateId <= 0 || !state || state.removed) {
    return provinceSuffixPlan(false, stateId, formName, overwriteCustom, [], 0, 0, "目标国家不存在。");
  }
  if (!formName || !allowedForms.includes(formName)) {
    return provinceSuffixPlan(false, stateId, formName, overwriteCustom, [], 0, 0, "所选后缀不属于该国当前文化的省份后缀集合。");
  }

  const provinces = map?.politics?.provinces || map?.pack?.provinces || [];
  const changes = [];
  let unchanged = 0;
  let skippedCustom = 0;
  let total = 0;
  for (const province of provinces) {
    const provinceId = normalizeProvinceId(province?.id ?? province?.i);
    if (!provinceId || !province || province.removed || normalizeStateId(province.state) !== stateId) continue;
    total++;
    const name = String(province.name || "").trim();
    const currentFormName = String(province.formName || "").trim();
    const currentFullName = String(province.fullName || "").trim();
    const standardFullName = `${name}${currentFormName}`;
    const customFullName = Boolean(currentFullName && currentFullName !== standardFullName);
    if (customFullName && !overwriteCustom) {
      skippedCustom++;
      continue;
    }
    const next = {formName, fullName: `${name}${formName}`};
    if (currentFormName === next.formName && currentFullName === next.fullName) {
      unchanged++;
      continue;
    }
    changes.push({
      provinceId,
      before: snapshotProvinceNameFields(map, provinceId),
      after: next
    });
  }
  const summary = changes.length
    ? `将更新 ${changes.length} 个省份，${unchanged} 个无需变化，${skippedCustom} 个定制全名保持不变。`
    : `没有需要更新的省份：${unchanged} 个无需变化，${skippedCustom} 个定制全名保持不变。`;
  return provinceSuffixPlan(true, stateId, formName, overwriteCustom, changes, unchanged, skippedCustom, summary, total);
}

function provinceSuffixPlan(valid, stateId, formName, overwriteCustom, changes, unchanged, skippedCustom, summary, total = 0) {
  return {valid, stateId, formName, overwriteCustom, changes, unchanged, skippedCustom, total, summary};
}

function provinceSuffixPlanResult(plan) {
  return {
    valid: plan.valid,
    stateId: plan.stateId,
    formName: plan.formName,
    overwriteCustom: plan.overwriteCustom,
    total: plan.total,
    changed: plan.changes.length,
    unchanged: plan.unchanged,
    skippedCustom: plan.skippedCustom,
    summary: plan.summary
  };
}

function snapshotProvinceNameFields(map, provinceId) {
  const politicsProvince = map?.politics?.provinces?.[provinceId];
  const packProvince = map?.pack?.provinces?.[provinceId];
  return {
    politics: provinceNameFields(politicsProvince),
    pack: packProvince === politicsProvince ? null : provinceNameFields(packProvince)
  };
}

function provinceNameFields(province) {
  if (!province) return null;
  return {formName: province.formName, fullName: province.fullName};
}

function writeProvinceNameFields(map, provinceId, fields) {
  applyProvinceNameFields(map?.politics?.provinces?.[provinceId], fields);
  const packProvince = map?.pack?.provinces?.[provinceId];
  if (packProvince && packProvince !== map?.politics?.provinces?.[provinceId]) applyProvinceNameFields(packProvince, fields);
}

function restoreProvinceNameFields(map, provinceId, snapshot) {
  applyProvinceNameFields(map?.politics?.provinces?.[provinceId], snapshot?.politics);
  if (snapshot?.pack) applyProvinceNameFields(map?.pack?.provinces?.[provinceId], snapshot.pack);
}

function applyProvinceNameFields(province, fields) {
  if (!province || !fields) return;
  for (const key of ["formName", "fullName"]) {
    if (fields[key] === undefined) delete province[key];
    else province[key] = fields[key];
  }
}

function snapshotBatchStateGovernments(map, stateIds, governmentKey) {
  return stateIds
    .map(stateId => {
      const state = map?.politics?.states?.[stateId] || map?.pack?.states?.[stateId];
      if (!state || state.removed || state.governmentKey === governmentKey) return null;
      return snapshotStateGovernment(map, stateId);
    })
    .filter(Boolean);
}

function hasGovernmentKey(governmentKey) {
  return Boolean(governmentKey && GOVERNMENT_BY_KEY[governmentKey]);
}

function snapshotGovernmentFields(state) {
  if (!state) return null;
  return {
    governmentKey: state.governmentKey,
    governmentLabel: state.governmentLabel,
    governmentFamily: state.governmentFamily,
    governmentCategory: state.governmentCategory,
    governmentEra: state.governmentEra,
    governmentSize: state.governmentSize,
    selfStyledGreat: state.selfStyledGreat,
    government: clonePlain(state.government),
    form: state.form,
    formName: state.formName,
    fullName: state.fullName,
    governmentEconomicModifier: state.governmentEconomicModifier,
    governmentTradeModifier: state.governmentTradeModifier
  };
}

function restoreStateGovernment(map, snapshot) {
  restoreGovernmentFields(map?.politics?.states?.[snapshot.stateId], snapshot.politics);
  if (snapshot.pack) restoreGovernmentFields(map?.pack?.states?.[snapshot.stateId], snapshot.pack);
}

function restoreGovernmentFields(state, snapshot) {
  if (!state || !snapshot) return;
  for (const key of Object.keys(snapshot)) {
    if (snapshot[key] === undefined) delete state[key];
    else state[key] = clonePlain(snapshot[key]);
  }
}

function clonePlain(value) {
  if (value === undefined || value === null || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value));
}

function findBurgForCity(map, city) {
  if (!city) return null;
  return map?.pack?.burgs?.[city.burgId] || (map?.pack?.burgs || []).find(burg => burg?.cityId === city.id) || null;
}

function snapshotCity(city) {
  return {
    state: city.state,
    province: city.province,
    capital: city.capital,
    group: city.group,
    provincial: city.provincial
  };
}

function snapshotBurg(burg) {
  return burg ? {
    state: burg.state,
    ...(Object.hasOwn(burg, "province") ? {province: burg.province} : {}),
    capital: burg.capital,
    group: burg.group
  } : null;
}

function snapshotState(map, stateId) {
  const state = map?.politics?.states?.[stateId];
  const mirror = map?.pack?.states?.[stateId];
  return state ? {stateId, state: snapshotBrushFields(state, stateBrushFields),
    packState: mirror !== state ? snapshotBrushFields(mirror, stateBrushFields) : null} : null;
}

function restoreState(map, snapshot) {
  restoreBrushFields(map.politics?.states?.[snapshot.stateId], snapshot.state);
  restoreBrushFields(map.pack?.states?.[snapshot.stateId], snapshot.packState);
}

function captureStateCollectionSnapshot(map, {deletedStateId = null} = {}) {
  const partialSettlement = deletedStateId !== null;
  return {
    states: clonePlain(map?.politics?.states || []),
    packStates: map?.pack?.states === map?.politics?.states ? null : clonePlain(map?.pack?.states || []),
    provinces: clonePlain(map?.politics?.provinces || []),
    packProvinces: map?.pack?.provinces === map?.politics?.provinces ? null : clonePlain(map?.pack?.provinces || []),
    gridState: cloneArrayLike(map?.grid?.cells?.state),
    gridProvince: cloneArrayLike(map?.grid?.cells?.province),
    gridBurg: partialSettlement ? null : cloneArrayLike(map?.grid?.cells?.burg),
    packState: cloneArrayLike(map?.pack?.cells?.state),
    packProvince: cloneArrayLike(map?.pack?.cells?.province),
    packBurg: partialSettlement ? null : cloneArrayLike(map?.pack?.cells?.burg),
    burgs: partialSettlement ? null : cloneSettlementObjects(map?.pack?.burgs || []),
    cities: partialSettlement ? null : cloneSettlementObjects(map?.settlements?.cities || []),
    changedBurgs: partialSettlement ? (map?.pack?.burgs || []).flatMap((burg, index) => burg && normalizeStateId(burg.state) === deletedStateId ? [[index, clonePlain(burg)]] : []) : null,
    changedCities: partialSettlement ? (map?.settlements?.cities || []).flatMap((city, index) => city && normalizeStateId(city.state) === deletedStateId ? [[index, clonePlain(city)]] : []) : null,
    settlementsMetadata: clonePlain(map?.settlements?.metadata || null),
    politicsMetadata: clonePlain(map?.politics?.metadata || null),
    stale: snapshotDerivedStale(map)
  };
}

function restoreStateCollectionSnapshot(map, snapshot) {
  if (!map || !snapshot) return;
  if (map.politics) {
    map.politics.states = clonePlain(snapshot.states);
    map.politics.provinces = clonePlain(snapshot.provinces);
    map.politics.metadata = clonePlain(snapshot.politicsMetadata);
  }
  if (map.pack) {
    map.pack.states = snapshot.packStates ? clonePlain(snapshot.packStates) : map.politics?.states;
    map.pack.provinces = snapshot.packProvinces ? clonePlain(snapshot.packProvinces) : map.politics?.provinces;
    if (snapshot.burgs) map.pack.burgs = cloneSettlementObjects(snapshot.burgs);
    else for (const [index, burg] of snapshot.changedBurgs || []) map.pack.burgs[index] = clonePlain(burg);
  }
  restoreArrayLike(map?.grid?.cells, "state", snapshot.gridState);
  restoreArrayLike(map?.grid?.cells, "province", snapshot.gridProvince);
  restoreArrayLike(map?.grid?.cells, "burg", snapshot.gridBurg);
  restoreArrayLike(map?.pack?.cells, "state", snapshot.packState);
  restoreArrayLike(map?.pack?.cells, "province", snapshot.packProvince);
  restoreArrayLike(map?.pack?.cells, "burg", snapshot.packBurg);
  if (map.settlements) {
    if (snapshot.cities) map.settlements.cities = cloneSettlementObjects(snapshot.cities);
    else for (const [index, city] of snapshot.changedCities || []) map.settlements.cities[index] = clonePlain(city);
    map.settlements.metadata = clonePlain(snapshot.settlementsMetadata);
  }
  delete map.__stateEditorPackCellsByGrid;
  restoreDerivedStale(map, snapshot.stale);
}

function cloneSettlementObjects(items) {
  // 建国只改城镇与 burg 的顶层归属、首都和视觉对象引用；嵌套的城镇自有数据保持原样。
  return items.map(item => item && typeof item === "object" ? {...item} : item);
}

function stateCreationInspection(valid, code, summary, details = {}) {
  return {valid, allowed: valid, code, summary, details: {...details}, ...details};
}

function normalizeGridCell(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : -1;
}

function choosePackCellForGridCell(map, gridCell, {readOnly = false} = {}) {
  const directPackCell = map?.grid?.cells?.pack?.[gridCell];
  const candidates = [
    ...(Number.isInteger(directPackCell) ? [directPackCell] : []),
    ...(readOnly ? findPackCellsForGrid(map, gridCell) : getPackCellsForGrid(map, gridCell))
  ].filter((cell, index, list) => list.indexOf(cell) === index && isPackLandCell(map, cell));
  if (candidates.length) {
    return candidates.sort((a, b) => rankPackCellForStateSeed(map, gridCell, b) - rankPackCellForStateSeed(map, gridCell, a) || a - b)[0];
  }
  return findNearestPackLandCellForGridCell(map, gridCell);
}

function findPackCellsForGrid(map, gridCell) {
  return packCellsByGrid(map)?.get(gridCell) || [];
}

function rankPackCellForStateSeed(map, gridCell, packCell) {
  const sourceState = normalizeStateId(map?.grid?.cells?.state?.[gridCell]);
  const packState = normalizeStateId(map?.pack?.cells?.state?.[packCell]);
  const ownerMatch = packState === sourceState ? 4 : 0;
  const burgId = normalizePoliticalId(map?.pack?.cells?.burg?.[packCell]);
  const burgBonus = burgId ? 1 : 0;
  const capitalBonus = burgId && map?.politics?.states?.[sourceState]?.capital === burgId ? 8 : 0;
  return ownerMatch + burgBonus + capitalBonus;
}

function findNearestPackLandCellForGridCell(map, gridCell) {
  const point = getGridPoint(map, gridCell);
  if (!point) return null;
  const sourceState = normalizeStateId(map?.grid?.cells?.state?.[gridCell]);
  const sourceFeature = map?.grid?.cells?.f?.[gridCell];
  let bestCell = null;
  let bestScore = Infinity;

  for (const packCell of map?.pack?.cells?.i || []) {
    if (!isPackLandCell(map, packCell)) continue;
    const packPoint = map.pack.cells.p?.[packCell];
    if (!packPoint) continue;
    const packState = normalizeStateId(map.pack.cells.state?.[packCell]);
    const ownerPenalty = packState === sourceState ? 0 : 1e8;
    const featurePenalty = map.pack.cells.f?.[packCell] === sourceFeature ? 0 : 1e7;
    const occupiedPenalty = packState !== sourceState && normalizePoliticalId(map.pack.cells.burg?.[packCell]) ? 1e6 : 0;
    const distance = (point[0] - packPoint[0]) ** 2 + (point[1] - packPoint[1]) ** 2;
    const score = ownerPenalty + featurePenalty + occupiedPenalty + distance;
    if (score >= bestScore) continue;
    bestCell = packCell;
    bestScore = score;
  }

  return bestCell;
}

function getGridPoint(map, gridCell) {
  return map?.grid?.points?.[map.grid.cells.p?.[gridCell]] || map?.grid?.points?.[gridCell] || null;
}

function isPackLandCell(map, packCell) {
  if (!Number.isInteger(packCell) || packCell < 0) return false;
  const featureId = map?.pack?.cells?.f?.[packCell];
  const feature = map?.features?.features?.[featureId];
  return feature ? Boolean(feature.land) : map?.pack?.cells?.h?.[packCell] >= 20;
}

function initialStateCells(map, centerGridCell) {
  const cells = map?.grid?.cells;
  const sourceState = normalizeStateId(cells?.state?.[centerGridCell]);
  const result = new Set([centerGridCell]);
  for (const neighbor of cells?.c?.[centerGridCell] || []) {
    if (!isGridLandCell(map, neighbor)) continue;
    if (normalizeStateId(cells.state?.[neighbor]) !== sourceState) continue;
    result.add(neighbor);
  }
  return [...result];
}

function writePoliticalItem(map, collection, id, item) {
  if (map?.politics?.[collection]) map.politics[collection][id] = item;
  if (map?.pack?.[collection]) map.pack[collection][id] = map?.politics?.[collection]?.[id] || clonePlain(item);
}

function syncPackPoliticalRecords(map) {
  if (map?.pack?.states && map?.politics?.states && map.pack.states !== map.politics.states) {
    map.pack.states = clonePlain(map.politics.states);
  }
  if (map?.pack?.provinces && map?.politics?.provinces && map.pack.provinces !== map.politics.provinces) {
    map.pack.provinces = clonePlain(map.politics.provinces);
  }
}

function removePoliticalItem(map, collection, id) {
  const politicsItems = map?.politics?.[collection];
  const packItems = map?.pack?.[collection];
  if (politicsItems) politicsItems[id] = null;
  if (packItems && packItems !== politicsItems) packItems[id] = null;
}

function ensureCapitalCityForNewState(map, context) {
  const existingBurgId = normalizePoliticalId(map?.pack?.cells?.burg?.[context.packCell]);
  if (existingBurgId) {
    const burg = map.pack.burgs?.[existingBurgId];
    const city = (map?.settlements?.cities || []).find(item => item?.burgId === existingBurgId) || null;
    if (burg) {
      burg.state = context.stateId;
      burg.province = context.provinceId;
      burg.capital = 1;
      burg.group = cityScaleForMap(map, city || burg, burg);
    }
    if (city) {
      city.state = context.stateId;
      city.province = context.provinceId;
      city.capital = true;
      city.group = burg?.group || cityScaleForMap(map, city, burg);
      return {cityId: city.id, burgId: existingBurgId, name: city.name || burg?.name || `都城 #${existingBurgId}`};
    }
  }
  return createCapitalCity(map, context);
}

function createCapitalCity(map, {stateId, provinceId, packCell, gridCell, cultureId, religionId, nameGenerator}) {
  if (!map?.pack?.burgs || !map?.settlements?.cities || !map?.pack?.cells?.p?.[packCell]) {
    throw new Error("当前地图缺少可创建首都的城市数据");
  }
  const burgId = map.pack.burgs.length;
  const cityId = map.settlements.cities.length;
  ensureUnsignedCellCapacity(map.pack.cells, "burg", burgId);
  const [x, y] = map.pack.cells.p[packCell];
  const culture = map?.society?.cultures?.[cultureId] || map?.pack?.cultures?.[cultureId] || null;
  const population = Math.max(8, roundValue((map.pack.cells.pop?.[packCell] || map.grid?.cells?.pop?.[gridCell] || 8) + 18, 2));
  const provisionalCity = {population};
  const scaleContext = createCityScaleContext([...(map?.settlements?.cities || []), provisionalCity], map?.pack?.burgs);
  const scale = deriveCityScale(provisionalCity, scaleContext);
  const name = nameGenerator.makePlaceName({
    id: cityId,
    cell: packCell,
    culture: cultureId,
    cultureType: culture?.nameStyle || culture?.type,
    state: stateId,
    capital: true,
    group: "capital",
    population
  }) || `新都${burgId}`;
  const visual = defaultCityVisual({capital: true, provincial: false, port: 0, population, type: "Generic", group: scale}, culture, scaleContext);
  const burg = {
    i: burgId,
    id: burgId,
    cityId,
    cell: packCell,
    x,
    y,
    state: stateId,
    province: provinceId,
    culture: cultureId,
    religion: religionId,
    name,
    feature: map.pack.cells.f?.[packCell],
    capital: 1,
    port: 0,
    population,
    group: scale,
    type: "Generic",
    civilizationType: "agrarian",
    civilizationLabel: "农耕",
    visual: clonePlain(visual)
  };
  const city = {
    id: cityId,
    burgId,
    name,
    cell: gridCell,
    packCell,
    x,
    y,
    population,
    state: stateId,
    province: provinceId,
    culture: cultureId,
    religion: religionId,
    capital: true,
    provincial: false,
    port: 0,
    type: "Generic",
    civilizationType: "agrarian",
    civilizationLabel: "农耕",
    group: scale,
    visual: clonePlain(visual)
  };
  map.pack.burgs[burgId] = burg;
  map.settlements.cities.push(city);
  const previousPackBurg = map.pack.cells.burg?.[packCell];
  const previousGridBurg = map.grid?.cells?.burg?.[gridCell];
  if (map.pack.cells.burg) map.pack.cells.burg[packCell] = burgId;
  if (map.grid?.cells?.burg) {
    const representative = map.settlements.cities.reduce((id, item) => item && !item.removed && Number(item.cell) === gridCell
      ? Math.min(id, Number(item.id)) : id, Number.POSITIVE_INFINITY);
    map.grid.cells.burg[gridCell] = Number.isFinite(representative) ? representative : cityId;
  }
  return {cityId, burgId, name, packCell, gridCell, previousPackBurg, previousGridBurg};
}

function cityScaleForMap(map, city, burg = null) {
  const context = createCityScaleContext(map?.settlements?.cities, map?.pack?.burgs);
  return deriveCityScale(city, context, burg);
}

function writeCityOwnerForNewState(map, cityId, stateId, provinceId) {
  const city = map?.settlements?.cities?.[cityId];
  if (!city) return;
  city.state = stateId;
  city.province = provinceId;
  const burg = findBurgForCity(map, city);
  if (burg) {
    burg.state = stateId;
    burg.province = provinceId;
  }
}

function refreshSettlementMetadata(map) {
  const metadata = map?.settlements?.metadata;
  if (!metadata) return;
  const cities = map?.settlements?.cities || [];
  metadata.cities = cities.length;
  metadata.capitals = cities.filter(city => city?.capital).length;
  metadata.ports = cities.filter(city => city?.port).length;
  metadata.maxPopulation = cities.reduce((max, city) => Math.max(max, Number(city?.population || 0)), 0);
  metadata.packBurgs = map?.pack?.burgs ? Math.max(0, map.pack.burgs.length - 1) : metadata.packBurgs;
}

function refreshPoliticsMetadata(map) {
  const metadata = map?.politics?.metadata;
  if (!metadata) return;
  const states = map?.politics?.states || [];
  const provinces = map?.politics?.provinces || [];
  metadata.states = states.filter(item => item && !item.removed && normalizeStateId(item.i ?? item.id) > 0).length;
  metadata.provinces = provinces.filter(item => item && !item.removed && normalizeProvinceId(item.i ?? item.id) > 0).length;
  metadata.stateNames = states.filter(item => item && !item.removed && normalizeStateId(item.i ?? item.id) > 0).map(item => item.fullName || item.name);
  metadata.provinceNames = provinces.filter(item => item && !item.removed && normalizeProvinceId(item.i ?? item.id) > 0).map(item => item.fullName || item.name);
}

function nextPoliticalId(items = []) {
  let max = 0;
  for (const item of items) {
    const id = normalizePoliticalId(item?.i ?? item?.id);
    if (id > max) max = id;
  }
  return max + 1;
}

function ensurePoliticalCellCapacity(map, {stateId, provinceId}) {
  for (const cells of [map?.grid?.cells, map?.pack?.cells]) {
    ensureUnsignedCellCapacity(cells, "state", stateId);
    ensureUnsignedCellCapacity(cells, "province", provinceId);
  }
}

function ensureUnsignedCellCapacity(cells, key, requiredValue) {
  const current = cells?.[key];
  if (!ArrayBuffer.isView(current) || current instanceof DataView) return;
  const required = normalizePoliticalId(requiredValue);
  if (typedArrayCanRepresentUnsigned(current, required)) return;
  const TypedArray = required <= 0xffff ? Uint16Array : required <= 0xffffffff ? Uint32Array : null;
  if (!TypedArray) throw new Error(`${key} ID 超出当前地图支持范围：${required}`);
  cells[key] = TypedArray.from(current, value => normalizePoliticalId(value));
}

function typedArrayCanRepresentUnsigned(array, value) {
  if (array instanceof Uint8Array || array instanceof Uint8ClampedArray) return value <= 0xff;
  if (array instanceof Int8Array) return value <= 0x7f;
  if (array instanceof Uint16Array) return value <= 0xffff;
  if (array instanceof Int16Array) return value <= 0x7fff;
  if (array instanceof Uint32Array) return value <= 0xffffffff;
  if (array instanceof Int32Array) return value <= 0x7fffffff;
  return array instanceof Float32Array || array instanceof Float64Array;
}

function normalizePoliticalId(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? Math.max(0, numeric) : 0;
}

function normalizeCultureId(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? Math.max(0, numeric) : 0;
}

function cloneArrayLike(value) {
  if (!value) return null;
  if (ArrayBuffer.isView(value)) return new value.constructor(value);
  return Array.isArray(value) ? [...value] : null;
}

function restoreArrayLike(target, key, snapshot) {
  if (!target || !snapshot) return;
  if (
    ArrayBuffer.isView(target[key])
    && ArrayBuffer.isView(snapshot)
    && target[key].constructor === snapshot.constructor
    && target[key].length === snapshot.length
  ) {
    target[key].set(snapshot);
    return;
  }
  target[key] = cloneArrayLike(snapshot);
}

function isGridLandCell(map, gridCell) {
  const featureId = map?.grid?.cells?.f?.[gridCell];
  const feature = map?.features?.features?.[featureId];
  return feature ? Boolean(feature.land) : map?.grid?.cells?.h?.[gridCell] >= 20;
}

function roundValue(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function normalizeHexColor(color) {
  if (typeof color !== "string") return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}
