import {GOVERNMENT_BY_KEY, applyStateGovernment, setStateGovernment} from "../generator/governments.js";
import {createChineseNameGenerator, getStateFullName} from "../generator/names.js";
import {createRandom} from "../generator/random.js";
import {defaultCityVisual} from "./city-visuals.js";
import {namebaseRenameAffected, systemAffected} from "./edit-command-effects.js";

const STATE_CELL_SURFACE_EFFECTS = Object.freeze({
  render: "draw",
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
  selection: "none",
  runtimeStats: false,
  pickPanel: false,
  derived: Object.freeze(["state-cells", "cell-colors"])
});

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

const STATE_COLLECTION_EFFECTS = Object.freeze({
  render: "draw",
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
    "route-mesh",
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

export function createApplyStateBrushCommand(changes, {label = "国家笔刷"} = {}) {
  const normalized = normalizeChanges(changes);
  const affectedStates = [...new Set(normalized.flatMap(change => [change.before, change.after]).filter(stateId => stateId > 0))];
  let settlementSnapshot = null;
  let politicalSnapshot = null;
  return {
    label: `${label} ${normalized.length} cells`,
    domain: "state",
    effects: {
      ...STATE_CELL_SURFACE_EFFECTS,
      affected: systemAffected("state-brush", affectedStates.length ? affectedStates.map(id => ({kind: "state", id})) : [{kind: "grid-cells", id: normalized.length}])
    },
    apply(context) {
      settlementSnapshot ??= captureSettlementSnapshot(context.map, normalized);
      politicalSnapshot ??= capturePoliticalDerivativeSnapshot(context.map, normalized, settlementSnapshot);
      applyStateChanges(context.map, normalized, "after");
      applySettlementTransfers(context.map, settlementSnapshot);
      repairPoliticalDerivativesForStateBrush(context.map, normalized, settlementSnapshot);
      refreshStateSummaries(context.map);
    },
    revert(context) {
      applyStateChanges(context.map, normalized, "before");
      restoreSettlementSnapshot(context.map, settlementSnapshot);
      restorePoliticalDerivativeSnapshot(context.map, politicalSnapshot);
      refreshStateSummaries(context.map);
    },
    isNoop() {
      return normalized.length === 0;
    },
    getChanges() {
      return normalized;
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
      affected: [{kind: "state", id: normalizedStateId}]
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

export function createSetStateGovernmentCommand(stateId, governmentKey, {label = "国家政体"} = {}) {
  const normalizedStateId = normalizeStateId(stateId);
  const normalizedGovernmentKey = String(governmentKey || "").trim();
  let previous = null;
  return {
    label: `${label} #${normalizedStateId}`,
    domain: "state",
    effects: {
      ...STATE_GOVERNMENT_EFFECTS,
      affected: [{kind: "state", id: normalizedStateId}]
    },
    apply(context) {
      previous ??= snapshotStateGovernment(context.map, normalizedStateId);
      setStateGovernment(context.map, normalizedStateId, normalizedGovernmentKey);
      markDerivedStale(context.map, ["economy", "diplomacy", "military"]);
    },
    revert(context) {
      if (!previous) throw new Error("缺少可撤销的政体快照");
      restoreStateGovernment(context.map, previous);
      markDerivedStale(context.map, ["economy", "diplomacy", "military"]);
    },
    isNoop(context) {
      const state = context.map?.politics?.states?.[normalizedStateId];
      return normalizedStateId <= 0 || !state || !normalizedGovernmentKey || state.governmentKey === normalizedGovernmentKey;
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
      affected: normalizedStateIds.map(id => ({kind: "state", id}))
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

export function createRenameStatesFromNamebaseCommand(stateIds, {label = "按名称库重命名国家"} = {}) {
  const normalizedStateIds = uniqueStateIds(stateIds);
  let changes = null;

  return {
    label: `${label} ${normalizedStateIds.length}国`,
    domain: "state",
    effects: {
      ...STATE_NAME_BATCH_EFFECTS,
      affected: namebaseRenameAffected("state", normalizedStateIds)
    },
    apply(context) {
      changes ??= buildStateRenameChanges(context.map, normalizedStateIds);
      if (!changes.length) throw new Error("没有可重命名的国家");
      for (const change of changes) writeStateNameSnapshot(context.map, change.stateId, change.after);
    },
    revert(context) {
      if (!changes) throw new Error("缺少可撤销的国家名称快照");
      for (const change of changes) writeStateNameSnapshot(context.map, change.stateId, change.before);
    },
    isNoop(context) {
      return !normalizedStateIds.length || !buildStateRenameChanges(context.map, normalizedStateIds).length;
    },
    getResult() {
      return {renamed: changes?.length || 0, total: normalizedStateIds.length};
    }
  };
}

export function createAddStateAtCellCommand(gridCell, {label = "新增国家"} = {}) {
  const targetGridCell = normalizeGridCell(gridCell);
  let snapshot = null;
  let result = null;
  return {
    label,
    domain: "state",
    effects: {
      ...STATE_COLLECTION_EFFECTS,
      affected: [{kind: "state", id: "new"}]
    },
    apply(context) {
      snapshot ??= captureStateCollectionSnapshot(context.map);
      result = addStateAtGridCell(context.map, targetGridCell);
    },
    revert(context) {
      if (!snapshot) throw new Error("缺少可撤销的国家新增快照");
      restoreStateCollectionSnapshot(context.map, snapshot);
    },
    isNoop(context) {
      return !isValidStateSeedCell(context.map, targetGridCell);
    },
    getResult() {
      return result;
    }
  };
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
      affected: [{kind: "state", id: normalizedStateId}]
    },
    apply(context) {
      snapshot ??= captureStateCollectionSnapshot(context.map);
      result = deleteState(context.map, normalizedStateId);
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

export function applyStateBrushPreview(map, changes) {
  applyStateChanges(map, normalizeChanges(changes), "after");
}

function buildStateRenameChanges(map, stateIds) {
  const states = map?.politics?.states || [];
  if (!states.length) return [];
  const generator = createChineseNameGenerator(`${map.metadata?.seed || map.options?.seed || "map"}|explicit-state-rename|${map.metadata?.checksum || ""}`, {namebases: map.namebases});
  const targets = new Set(stateIds);
  const occupied = new Set(states
    .filter(state => state && !state.removed && !targets.has(normalizeStateId(state.id ?? state.i)))
    .map(state => normalizeStateRoot(state.name))
    .filter(Boolean));
  const changes = [];

  for (const stateId of stateIds) {
    const state = states[stateId];
    if (!state || state.removed || stateId <= 0) continue;
    const before = snapshotStateName(map, stateId);
    const afterRoot = nextStateRootFromNamebase(map, state, generator, occupied);
    if (!afterRoot || afterRoot === before.name) continue;
    const after = {
      name: afterRoot,
      fullName: getStateFullName(afterRoot, state.formName),
      nameOrientation: undefined
    };
    occupied.add(normalizeStateRoot(afterRoot));
    changes.push({stateId, before, after});
  }

  return changes;
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

function addStateAtGridCell(map, gridCell) {
  const packCell = choosePackCellForGridCell(map, gridCell);
  if (!Number.isInteger(packCell)) throw new Error("无法在当前 cell 创建国家");
  const stateId = nextPoliticalId(map?.politics?.states || map?.pack?.states || []);
  const provinceId = nextPoliticalId(map?.politics?.provinces || map?.pack?.provinces || []);
  const point = map.pack?.cells?.p?.[packCell] || map.grid?.points?.[map.grid.cells.p?.[gridCell]] || [0, 0];
  const cultureId = normalizeCultureId(map.pack?.cells?.culture?.[packCell] ?? map.grid?.cells?.culture?.[gridCell]);
  const religionId = normalizeCultureId(map.pack?.cells?.religion?.[packCell] ?? map.grid?.cells?.religion?.[gridCell]);
  const culture = map?.society?.cultures?.[cultureId] || map?.pack?.cultures?.[cultureId] || null;
  const random = createRandom(`${map.metadata?.seed || map.options?.seed || "map"}|add-state|${stateId}|${gridCell}`);
  const generator = createChineseNameGenerator(`${map.metadata?.seed || map.options?.seed || "map"}|add-state-name|${stateId}`, {namebases: map.namebases});
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
  const capital = ensureCapitalCityForNewState(map, {
    stateId,
    provinceId,
    packCell,
    gridCell,
    cultureId,
    religionId,
    nameGenerator: generator
  });
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
    color: fallbackStateColor(stateId),
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
  applyStateGovernment(state, "monarchy", {states: map?.politics?.states || []});
  writePoliticalItem(map, "states", stateId, state);
  const provinceName = generator.makeProvinceName({
    id: provinceId,
    cell: packCell,
    culture: cultureId,
    cultureType: culture?.nameStyle || culture?.type,
    state: stateId,
    baseName: root
  });
  const province = {
    id: provinceId,
    i: provinceId,
    state: stateId,
    center: packCell,
    gridCenter: gridCell,
    burg: capital.burgId,
    name: provinceName.name,
    formName: provinceName.formName,
    fullName: provinceName.fullName,
    color: state.color,
    cells: 0,
    area: 0,
    neighbors: [],
    pole: point.map(value => roundValue(value, 2))
  };
  writePoliticalItem(map, "provinces", provinceId, province);
  const changes = initialStateCells(map, gridCell).map(cell => ({
    gridCell: cell,
    before: normalizeStateId(map.grid.cells.state?.[cell]),
    after: stateId
  }));
  applyStateChanges(map, changes, "after");
  for (const change of changes) {
    if (map.grid?.cells?.province) map.grid.cells.province[change.gridCell] = provinceId;
    for (const cell of getPackCellsForGrid(map, change.gridCell)) {
      if (map.pack?.cells?.h?.[cell] >= 20) map.pack.cells.province[cell] = provinceId;
    }
  }
  writeCityOwnerForNewState(map, capital.cityId, stateId, provinceId);
  refreshProvinceSummaries(map);
  refreshProvincePoles(map, new Set([provinceId]));
  refreshStateSummaries(map);
  refreshSettlementMetadata(map);
  refreshPoliticsMetadata(map);
  markDerivedStale(map, ["military", "zones", "state-markers", "economy", "diplomacy"]);
  return {stateId, provinceId, cityId: capital.cityId, burgId: capital.burgId, cells: changes.length};
}

function deleteState(map, stateId) {
  const state = map?.politics?.states?.[stateId];
  if (!state || state.removed) throw new Error(`找不到国家 #${stateId}`);
  const changes = [];
  for (const gridCell of map?.grid?.cells?.i || []) {
    if (normalizeStateId(map.grid.cells.state?.[gridCell]) !== stateId) continue;
    changes.push({gridCell, before: stateId, after: 0});
  }
  applyStateChanges(map, changes, "after");
  for (const change of changes) {
    if (map.grid?.cells?.province) map.grid.cells.province[change.gridCell] = 0;
    for (const cell of getPackCellsForGrid(map, change.gridCell)) {
      if (map.pack?.cells?.h?.[cell] >= 20) map.pack.cells.province[cell] = 0;
    }
  }
  for (const province of map?.politics?.provinces || []) {
    if (province && normalizeStateId(province.state) === stateId) province.removed = true;
  }
  for (const province of map?.pack?.provinces || []) {
    if (province && normalizeStateId(province.state) === stateId) province.removed = true;
  }
  for (const city of map?.settlements?.cities || []) {
    if (!city || normalizeStateId(city.state) !== stateId) continue;
    const burg = findBurgForCity(map, city);
    city.state = 0;
    city.province = 0;
    city.capital = false;
    city.provincial = false;
    city.group = city.port ? "city" : "town";
    if (burg) {
      burg.state = 0;
      burg.province = 0;
      burg.capital = 0;
      burg.group = burg.port ? "city" : "town";
    }
  }
  state.removed = true;
  state.provinces = [];
  const packState = map?.pack?.states?.[stateId];
  if (packState && packState !== state) {
    packState.removed = true;
    packState.provinces = [];
  }
  refreshProvinceSummaries(map);
  refreshProvincePoles(map);
  refreshStateSummaries(map);
  refreshSettlementMetadata(map);
  refreshPoliticsMetadata(map);
  markDerivedStale(map, ["military", "zones", "state-markers", "economy", "diplomacy"]);
  return {stateId, cells: changes.length};
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

function applyStateChanges(map, changes, key) {
  if (!map?.grid?.cells?.state) return;
  for (const change of changes) {
    const stateId = normalizeStateId(change[key]);
    map.grid.cells.state[change.gridCell] = stateId;
    for (const packCell of getPackCellsForGrid(map, change.gridCell)) {
      if (map.pack.cells.h?.[packCell] < 20) continue;
      map.pack.cells.state[packCell] = stateId;
    }
  }
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
    states: [...affectedStates].map(stateId => snapshotState(map, stateId)).filter(Boolean)
  };
}

function capturePoliticalDerivativeSnapshot(map, changes, settlementSnapshot) {
  const packCells = uniquePackCellsForChanges(map, changes);
  return {
    gridProvinces: changes.map(change => [change.gridCell, map?.grid?.cells?.province?.[change.gridCell] ?? 0]),
    packStates: packCells.map(packCell => [packCell, map?.pack?.cells?.state?.[packCell] ?? 0]),
    packProvinces: packCells.map(packCell => [packCell, map?.pack?.cells?.province?.[packCell] ?? 0]),
    cities: (settlementSnapshot?.movedCities || []).map(item => {
      const city = map?.settlements?.cities?.[item.cityId];
      return city ? {cityId: item.cityId, province: city.province} : null;
    }).filter(Boolean),
    provinces: snapshotProvinces(map),
    stale: snapshotDerivedStale(map)
  };
}

function applySettlementTransfers(map, snapshot) {
  if (!snapshot?.movedCities?.length) return;
  const statesNeedingCapital = new Set();

  for (const item of snapshot.movedCities) {
    const city = map?.settlements?.cities?.[item.cityId];
    const burg = map?.pack?.burgs?.[item.burgId] || findBurgForCity(map, city);
    if (!city) continue;
    const wasCapital = Boolean(city.capital || burg?.capital || map?.politics?.states?.[item.previousState]?.capital === item.burgId);

    city.state = item.nextState;
    if (wasCapital) {
      city.capital = false;
      city.group = city.port ? "city" : city.provincial ? "town" : "town";
      statesNeedingCapital.add(item.previousState);
    }

    if (burg) {
      burg.state = item.nextState;
      if (wasCapital) {
        burg.capital = 0;
        burg.group = burg.port ? "city" : "town";
      }
    }
  }

  for (const stateId of statesNeedingCapital) {
    chooseReplacementCapital(map, stateId);
  }
}

function repairPoliticalDerivativesForStateBrush(map, changes, settlementSnapshot) {
  const affectedProvinces = repairProvinceCells(map, changes);
  syncMovedCityProvinces(map, settlementSnapshot);
  refreshProvinceSummaries(map);
  refreshProvincePoles(map, affectedProvinces);
  markDerivedStale(map, ["military", "zones", "state-markers"]);
}

function repairProvinceCells(map, changes) {
  const affectedProvinces = new Set();
  const packCells = uniquePackCellsForChanges(map, changes);
  for (const packCell of packCells) {
    if (map?.pack?.cells?.h?.[packCell] < 20) continue;
    const stateId = normalizeStateId(map.pack.cells.state?.[packCell]);
    const provinceId = normalizeProvinceId(map.pack.cells.province?.[packCell]);
    if (provinceId) affectedProvinces.add(provinceId);
    if (!stateId) {
      map.pack.cells.province[packCell] = 0;
      continue;
    }
    if (provinceBelongsToState(map, provinceId, stateId)) continue;
    const nextProvince = chooseProvinceForState(map, stateId, packCell);
    map.pack.cells.province[packCell] = nextProvince;
    if (nextProvince) affectedProvinces.add(nextProvince);
  }

  for (const change of changes) {
    if (!map?.grid?.cells?.province) continue;
    map.grid.cells.province[change.gridCell] = chooseGridProvince(map, change.gridCell);
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
  }
}

function restoreSettlementSnapshot(map, snapshot) {
  if (!snapshot) return;
  for (const stateSnapshot of snapshot.states || []) restoreState(map, stateSnapshot);
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
    if (burg && item.burg) Object.assign(burg, item.burg);
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
    state.capital = 0;
    state.center = 0;
    state.gridCenter = 0;
    return;
  }

  const burg = findBurgForCity(map, candidate);
  if (!burg) return;
  candidate.capital = true;
  candidate.group = "capital";
  burg.capital = 1;
  burg.group = "capital";
  state.capital = burg.i ?? candidate.burgId;
  state.center = burg.cell ?? candidate.packCell;
  state.gridCenter = map?.pack?.cells?.g?.[burg.cell] ?? candidate.cell;
  state.religion = map?.pack?.cells?.religion?.[burg.cell] ?? state.religion;
}

function chooseReplacementCapitalCandidate(map, stateId, excludedCityIds = new Set()) {
  return (map?.settlements?.cities || [])
    .filter(city => city && city.state === stateId && !excludedCityIds.has(city.id))
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
    if (cells.h?.[cell] < 20) continue;
    const provinceId = normalizeProvinceId(cells.province[cell]);
    const province = provinces[provinceId];
    if (!province) continue;
    province.cells++;
    province.area += cells.area?.[cell] || 0;

    for (const neighbor of cells.c?.[cell] || []) {
      if (cells.h?.[neighbor] < 20) continue;
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

function refreshProvincePoles(map, targetProvinceIds = null) {
  const provinces = map?.politics?.provinces || map?.pack?.provinces;
  const cells = map?.pack?.cells;
  if (!provinces || !cells?.province || !cells?.p) return;
  const targets = targetProvinceIds?.size ? targetProvinceIds : new Set(provinces.map(province => normalizeProvinceId(province?.i ?? province?.id)).filter(Boolean));
  const provinceCells = new Map();
  const provinceBoundaryCells = new Map();

  for (const cell of cells.i || []) {
    if (cells.h?.[cell] < 20) continue;
    const provinceId = normalizeProvinceId(cells.province[cell]);
    if (!provinceId || !targets.has(provinceId)) continue;
    if (!provinceCells.has(provinceId)) provinceCells.set(provinceId, []);
    provinceCells.get(provinceId).push(cell);

    const isBoundary = (cells.c?.[cell] || []).some(neighbor => cells.h?.[neighbor] < 20 || normalizeProvinceId(cells.province?.[neighbor]) !== provinceId);
    if (isBoundary) {
      if (!provinceBoundaryCells.has(provinceId)) provinceBoundaryCells.set(provinceId, []);
      provinceBoundaryCells.get(provinceId).push(cell);
    }
  }

  for (const provinceId of targets) {
    const province = provinces[provinceId];
    if (!province || province.removed) continue;
    const ownCells = provinceCells.get(provinceId) || [];
    if (!ownCells.length) {
      province.pole = null;
      continue;
    }
    const boundaryCells = provinceBoundaryCells.get(provinceId) || ownCells;
    const poleCell = findProvincePoleCell(cells, ownCells, boundaryCells, province.center);
    province.pole = cells.p[poleCell].map(value => roundValue(value, 2));
  }
}

function findProvincePoleCell(cells, ownCells, boundaryCells, fallbackCell) {
  if (ownCells.length <= 2) return fallbackCell && ownCells.includes(fallbackCell) ? fallbackCell : ownCells[0];
  let bestCell = ownCells[0];
  let bestScore = -Infinity;
  for (const cell of ownCells) {
    const point = cells.p[cell];
    if (!point) continue;
    const minBoundaryDistance = getMinDistanceSquared(point, boundaryCells, cells);
    const populationScore = cells.pop?.[cell] || cells.s?.[cell] || 0;
    const burgScore = cells.burg?.[cell] ? 5 : 0;
    const score = minBoundaryDistance + populationScore * 0.02 + burgScore;
    if (score <= bestScore) continue;
    bestCell = cell;
    bestScore = score;
  }
  return bestCell;
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
    if (cells.h?.[cell] < 20) continue;
    const stateId = cells.state[cell] || 0;
    const state = states[stateId];
    if (!state) continue;
    state.cells++;
    state.area += cells.area?.[cell] || 0;
    state.rural += cells.pop?.[cell] || 0;
    for (const neighbor of cells.c?.[cell] || []) {
      if (cells.h?.[neighbor] < 20) continue;
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
    if (cells.h?.[cell] < 20) continue;
    const stateId = cells.state[cell] || 0;
    const state = states[stateId];
    if (!state) continue;
    state.cells++;
    state.rural += cells.pop?.[cell] || 0;
    for (const neighbor of cells.c?.[cell] || []) {
      if (cells.h?.[neighbor] < 20) continue;
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
  if (!map.__stateEditorPackCellsByGrid) {
    const byGrid = new Map();
    for (let packCell = 0; packCell < map.pack.cells.g.length; packCell++) {
      const mappedGrid = map.pack.cells.g[packCell];
      if (!Number.isInteger(mappedGrid) || mappedGrid < 0) continue;
      if (!byGrid.has(mappedGrid)) byGrid.set(mappedGrid, []);
      byGrid.get(mappedGrid).push(packCell);
    }
    map.__stateEditorPackCellsByGrid = byGrid;
  }
  return map.__stateEditorPackCellsByGrid.get(gridCell) || [];
}

function chooseGridProvince(map, gridCell) {
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
  return bestProvince || chooseProvinceForState(map, stateId, null) || normalizeProvinceId(map?.grid?.cells?.province?.[gridCell]);
}

function chooseProvinceForState(map, stateId, packCell) {
  if (!stateId) return 0;
  const neighborProvince = chooseNeighborProvinceForState(map, stateId, packCell);
  if (neighborProvince) return neighborProvince;
  const stateProvince = largestProvinceForState(map, stateId);
  return stateProvince || 0;
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

function snapshotProvinces(map) {
  return (map?.politics?.provinces || map?.pack?.provinces || []).map(province => province ? {
    provinceId: province.i ?? province.id,
    province: {
      cells: province.cells,
      area: province.area,
      pole: Array.isArray(province.pole) ? [...province.pole] : province.pole,
      neighbors: Array.isArray(province.neighbors) ? [...province.neighbors] : []
    }
  } : null).filter(Boolean);
}

function restoreProvinces(map, snapshots = []) {
  const provinces = map?.politics?.provinces || map?.pack?.provinces;
  if (!provinces) return;
  for (const snapshot of snapshots) {
    const province = provinces[snapshot.provinceId];
    if (province) Object.assign(province, snapshot.province, {neighbors: [...(snapshot.province.neighbors || [])]});
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
  if (map?.military?.metadata && snapshot.military !== undefined) map.military.metadata.stale = snapshot.military;
  if (map?.zones?.metadata && snapshot.zones !== undefined) map.zones.metadata.stale = snapshot.zones;
  if (map?.markers?.metadata && snapshot.markers !== undefined) map.markers.metadata.stale = snapshot.markers;
  if (map?.economy?.metadata && snapshot.economy !== undefined) map.economy.metadata.stale = snapshot.economy;
  if (map?.diplomacy?.metadata && snapshot.diplomacy !== undefined) map.diplomacy.metadata.stale = snapshot.diplomacy;
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
    capital: burg.capital,
    group: burg.group
  } : null;
}

function snapshotState(map, stateId) {
  const state = map?.politics?.states?.[stateId];
  return state ? {
    stateId,
    state: {
      capital: state.capital,
      center: state.center,
      gridCenter: state.gridCenter,
      religion: state.religion,
      cells: state.cells,
      area: state.area,
      burgs: state.burgs,
      rural: state.rural,
      urban: state.urban,
      neighbors: Array.isArray(state.neighbors) ? [...state.neighbors] : []
    }
  } : null;
}

function restoreState(map, snapshot) {
  const state = map?.politics?.states?.[snapshot.stateId];
  if (state) Object.assign(state, snapshot.state, {neighbors: [...(snapshot.state.neighbors || [])]});
}

function captureStateCollectionSnapshot(map) {
  return {
    states: clonePlain(map?.politics?.states || []),
    packStates: map?.pack?.states === map?.politics?.states ? null : clonePlain(map?.pack?.states || []),
    provinces: clonePlain(map?.politics?.provinces || []),
    packProvinces: map?.pack?.provinces === map?.politics?.provinces ? null : clonePlain(map?.pack?.provinces || []),
    gridState: cloneArrayLike(map?.grid?.cells?.state),
    gridProvince: cloneArrayLike(map?.grid?.cells?.province),
    packState: cloneArrayLike(map?.pack?.cells?.state),
    packProvince: cloneArrayLike(map?.pack?.cells?.province),
    packBurg: cloneArrayLike(map?.pack?.cells?.burg),
    burgs: clonePlain(map?.pack?.burgs || []),
    cities: clonePlain(map?.settlements?.cities || []),
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
    map.pack.burgs = clonePlain(snapshot.burgs);
  }
  restoreArrayLike(map?.grid?.cells, "state", snapshot.gridState);
  restoreArrayLike(map?.grid?.cells, "province", snapshot.gridProvince);
  restoreArrayLike(map?.pack?.cells, "state", snapshot.packState);
  restoreArrayLike(map?.pack?.cells, "province", snapshot.packProvince);
  restoreArrayLike(map?.pack?.cells, "burg", snapshot.packBurg);
  if (map.settlements) {
    map.settlements.cities = clonePlain(snapshot.cities);
    map.settlements.metadata = clonePlain(snapshot.settlementsMetadata);
  }
  delete map.__stateEditorPackCellsByGrid;
  restoreDerivedStale(map, snapshot.stale);
}

function isValidStateSeedCell(map, gridCell) {
  return Number.isInteger(gridCell) && gridCell >= 0 && isGridLandCell(map, gridCell) && Number.isInteger(choosePackCellForGridCell(map, gridCell));
}

function normalizeGridCell(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : -1;
}

function choosePackCellForGridCell(map, gridCell) {
  const directPackCell = map?.grid?.cells?.pack?.[gridCell];
  const candidates = [
    ...(Number.isInteger(directPackCell) ? [directPackCell] : []),
    ...getPackCellsForGrid(map, gridCell)
  ].filter((cell, index, list) => list.indexOf(cell) === index && isPackLandCell(map, cell));
  if (candidates.length) {
    return candidates.sort((a, b) => rankPackCellForStateSeed(map, gridCell, b) - rankPackCellForStateSeed(map, gridCell, a) || a - b)[0];
  }
  return findNearestPackLandCellForGridCell(map, gridCell);
}

function rankPackCellForStateSeed(map, gridCell, packCell) {
  const sourceState = normalizeStateId(map?.grid?.cells?.state?.[gridCell]);
  const packState = normalizeStateId(map?.pack?.cells?.state?.[packCell]);
  const ownerMatch = packState === sourceState ? 4 : 0;
  const burgBonus = normalizePoliticalId(map?.pack?.cells?.burg?.[packCell]) ? 1 : 0;
  return ownerMatch + burgBonus;
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
  return Number.isInteger(packCell) && packCell >= 0 && map?.pack?.cells?.h?.[packCell] >= 20;
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

function ensureCapitalCityForNewState(map, context) {
  const existingBurgId = normalizePoliticalId(map?.pack?.cells?.burg?.[context.packCell]);
  if (existingBurgId) {
    const burg = map.pack.burgs?.[existingBurgId];
    const city = (map?.settlements?.cities || []).find(item => item?.burgId === existingBurgId) || null;
    if (burg) {
      burg.state = context.stateId;
      burg.province = context.provinceId;
      burg.capital = 1;
      burg.group = "capital";
    }
    if (city) {
      city.state = context.stateId;
      city.province = context.provinceId;
      city.capital = true;
      city.group = "capital";
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
  const [x, y] = map.pack.cells.p[packCell];
  const culture = map?.society?.cultures?.[cultureId] || map?.pack?.cultures?.[cultureId] || null;
  const population = Math.max(8, roundValue((map.pack.cells.pop?.[packCell] || map.grid?.cells?.pop?.[gridCell] || 8) + 18, 2));
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
  const visual = defaultCityVisual({capital: true, provincial: false, port: 0, population, type: "Generic", group: "capital"}, culture);
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
    group: "capital",
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
    group: "capital",
    visual: clonePlain(visual)
  };
  map.pack.burgs[burgId] = burg;
  map.settlements.cities.push(city);
  if (map.pack.cells.burg) map.pack.cells.burg[packCell] = burgId;
  return {cityId, burgId, name};
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

function fallbackStateColor(id) {
  const palette = ["#b7c8f3", "#f6b6c8", "#abe7c1", "#f8dda1", "#cbbdf1", "#aee3e8", "#f3b7a8", "#d5eda2"];
  return palette[Math.abs(Number(id) || 0) % palette.length];
}

function nextPoliticalId(items = []) {
  let max = 0;
  for (const item of items) {
    const id = normalizePoliticalId(item?.i ?? item?.id);
    if (id > max) max = id;
  }
  return max + 1;
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
  if (ArrayBuffer.isView(target[key]) && ArrayBuffer.isView(snapshot) && target[key].length === snapshot.length) {
    target[key].set(snapshot);
    return;
  }
  target[key] = cloneArrayLike(snapshot);
}

function isGridLandCell(map, gridCell) {
  if (map?.grid?.cells?.h?.[gridCell] < 20) return false;
  const featureId = map?.grid?.cells?.f?.[gridCell];
  const feature = map?.features?.features?.[featureId];
  return feature ? Boolean(feature.land) : true;
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
