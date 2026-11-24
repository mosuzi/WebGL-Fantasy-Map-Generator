import {findProvincePoleCell} from "./state-edit-commands.js";
import {packCellsByGrid} from "./grid-pack-index.js";
import {createChineseNameGenerator} from "../generator/names.js";
import {provinceFormForState} from "../generator/province-naming.js";
import {newObjectAffected, objectAffected, systemAffected} from "./edit-command-effects.js";

const PROVINCE_CELL_SURFACE_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze([
    "province-cells",
    "province-statistics",
    "city-provinces",
    "cell-colors",
    "political-boundaries",
    "political-selection",
    "object-panels"
  ])
});

export const PROVINCE_BRUSH_PREVIEW_EFFECTS = Object.freeze({
  render: "draw",
  cellAttributePatch: true,
  reuseResourceBinding: true,
  selection: "none",
  runtimeStats: false,
  pickPanel: false,
  derived: Object.freeze(["province-cells", "cell-colors"])
});

const PROVINCE_COLLECTION_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze([
    "province-cells",
    "province-statistics",
    "city-provinces",
    "state-statistics",
    "cell-colors",
    "political-boundaries",
    "political-selection",
    "object-panels",
    "object-index",
    "province-poles"
  ])
});

export function indexProvinceBrushMembers(map) {
  const cells = map?.pack?.cells;
  if (!cells?.i || !cells.province) return null;
  const members = new Map();
  const order = new Uint32Array(cells.province.length);
  for (let i = 0; i < cells.i.length; i++) {
    const cell = cells.i[i];
    order[cell] = i;
    if (cells.h?.[cell] < 20) continue;
    const id = normalizeProvinceId(cells.province[cell]);
    if (!members.has(id)) members.set(id, []);
    members.get(id).push(cell);
  }
  return {
    cells,
    candidates(ids, changed) {
      let count = changed.size;
      for (const id of ids) count += members.get(id)?.length || 0;
      if (count * 2 > cells.i.length) return cells.i;
      const selected = new Set(changed.keys());
      for (const id of ids) for (const cell of members.get(id) || []) selected.add(cell);
      return [...selected].sort((a, b) => order[a] - order[b]);
    }
  };
}

export function createApplyProvinceBrushCommand(changes, {label = "省份笔刷", originalPackProvinces = new Map(), memberIndex} = {}) {
  const normalized = normalizeChanges(changes);
  const affectedProvinces = [...new Set(normalized.flatMap(change => [change.before, change.after]).filter(Boolean))];
  let snapshot = null;
  return {
    label: `${label} ${normalized.length} cells`,
    domain: "province",
    effects: {
      ...PROVINCE_CELL_SURFACE_EFFECTS,
      derived: [...PROVINCE_CELL_SURFACE_EFFECTS.derived, "labels"],
      deferLabels: "after-paint",
      changedGridCells: normalized.map(change => change.gridCell),
      cellAttributePatch: true,
      affected: systemAffected("province-brush", affectedProvinces.length ? affectedProvinces.map(id => ({kind: "province", id})) : [{kind: "grid-cells", id: normalized.length}])
    },
    apply(context) {
      snapshot ??= captureProvinceSnapshot(context.map, normalized, originalPackProvinces);
      applyProvinceChanges(context.map, normalized, "after", originalPackProvinces);
      const ids = snapshot.provinces.map(item => item.provinceId);
      const index = memberIndex?.cells === context.map.pack?.cells ? memberIndex : null;
      memberIndex = null;
      repairProvinceDerivatives(context.map, normalized, originalPackProvinces, ids, index);
      this.effects.brushProvinceIds = snapshot.provinces.map(item => item.provinceId);
      for (const {id} of snapshot.burgs) {
        const burg = context.map.pack.burgs[id];
        burg.province = context.map.pack.cells.province[burg.cell];
      }
      if (snapshot.mirrors.length) {
        const updated = snapshotProvinces(context.map, snapshot.mirrors.map(item => item.provinceId));
        restoreProvinces(context.map, updated, context.map.pack.provinces);
      }
    },
    revert(context) {
      applyProvinceChanges(context.map, normalized, "before", originalPackProvinces);
      restoreProvinceSnapshot(context.map, snapshot);
    },
    getReplicaRows(map) {
      return {"grid.cells.province": normalized.map(change => change.gridCell),
        "pack.cells.province": [...originalPackProvinces.keys()],
        "politics.provinces": snapshot.provinces.map(item => item.provinceId),
        "pack.provinces": snapshot.provinces.map(item => item.provinceId).filter(id => map.pack.provinces?.[id]),
        "pack.burgs": snapshot.burgs.map(item => item.id),
        "settlements.cities": snapshot.cities.map(item => item.cityId)};
    },
    isNoop() {
      return normalized.length === 0;
    },
    getChanges() {
      return normalized;
    }
  };
}

export function createAddProvinceAtCellCommand(gridCell, {label = "新增省份", faultInjector = null} = {}) {
  const targetGridCell = normalizeGridCell(gridCell);
  let snapshot = null;
  let result = null;
  let inspection = null;
  return {
    label,
    domain: "province",
    effects: {
      ...PROVINCE_COLLECTION_EFFECTS,
      affected: newObjectAffected("province")
    },
    apply(context) {
      inspection = inspectProvinceCreation(context.map, targetGridCell);
      if (!inspection.valid) throw new Error(inspection.summary);
      snapshot ??= captureProvinceCollectionSnapshot(context.map);
      try {
        result = addProvinceAtGridCell(context.map, targetGridCell);
        faultInjector?.({stage: "after-create", result, map: context.map});
      } catch (error) {
        restoreProvinceCollectionSnapshot(context.map, snapshot);
        throw error;
      }
      this.effects.affected = objectAffected("province", result.provinceId);
    },
    revert(context) {
      if (!snapshot) throw new Error("缺少可撤销的省份新增快照");
      restoreProvinceCollectionSnapshot(context.map, snapshot);
    },
    isNoop(context) {
      inspection = inspectProvinceCreation(context.map, targetGridCell);
      return !inspection.valid;
    },
    getInspection() {
      return inspection;
    },
    getResult() {
      return result;
    }
  };
}

export function inspectProvinceCreation(map, gridCell) {
  const targetGridCell = normalizeGridCell(gridCell);
  if (targetGridCell < 0 || targetGridCell >= (map?.grid?.cells?.i?.length || 0)) {
    return creationInspection(false, "grid-cell-invalid", "目标 grid cell 无效。", {gridCell: targetGridCell});
  }
  if (!isGridLandCell(map, targetGridCell)) {
    return creationInspection(false, "grid-cell-water", "目标 grid cell 不是陆地。", {gridCell: targetGridCell});
  }
  const stateId = normalizeStateId(map?.grid?.cells?.state?.[targetGridCell]);
  if (stateId <= 0 || !map?.politics?.states?.[stateId] || map.politics.states[stateId].removed) {
    return creationInspection(false, "state-missing", "目标 cell 不属于可用国家。", {gridCell: targetGridCell, stateId});
  }
  const packCell = choosePackCellForGridCell(map, targetGridCell, {readOnly: true});
  if (!Number.isInteger(packCell)) {
    return creationInspection(false, "pack-cell-missing", "目标 grid cell 没有可用的陆地 pack cell。", {gridCell: targetGridCell, stateId});
  }
  return creationInspection(true, "ok", "可以在目标 cell 创建省份。", {gridCell: targetGridCell, packCell, stateId});
}

export function createDeleteProvinceCommand(provinceId, {label = "删除省份"} = {}) {
  const normalizedProvinceId = normalizeProvinceId(provinceId);
  let snapshot = null;
  let result = null;
  return {
    label: `${label} #${normalizedProvinceId}`,
    domain: "province",
    effects: {
      ...PROVINCE_COLLECTION_EFFECTS,
      affected: objectAffected("province", normalizedProvinceId)
    },
    apply(context) {
      snapshot ??= captureProvinceCollectionSnapshot(context.map);
      result = deleteProvince(context.map, normalizedProvinceId);
    },
    revert(context) {
      if (!snapshot) throw new Error("缺少可撤销的省份删除快照");
      restoreProvinceCollectionSnapshot(context.map, snapshot);
    },
    isNoop(context) {
      const province = getProvince(context.map, normalizedProvinceId);
      return normalizedProvinceId <= 0 || !province || province.removed;
    },
    getResult() {
      return result;
    }
  };
}

export function applyProvinceBrushPreview(map, changes, originalPackProvinces) {
  applyProvinceChanges(map, normalizeChanges(changes), "after", originalPackProvinces);
}

function addProvinceAtGridCell(map, gridCell) {
  const packCell = choosePackCellForGridCell(map, gridCell);
  if (!Number.isInteger(packCell)) throw new Error("无法在当前 cell 创建省份");
  const stateId = normalizeStateId(map?.grid?.cells?.state?.[gridCell] || map?.pack?.cells?.state?.[packCell]);
  if (!stateId) throw new Error("新增省份必须位于已有国家内");
  const state = map?.politics?.states?.[stateId] || map?.pack?.states?.[stateId] || null;
  const provinceId = nextProvinceId(map);
  const point = map?.pack?.cells?.p?.[packCell] || [0, 0];
  const cultureId = normalizeProvinceId(map?.pack?.cells?.culture?.[packCell] ?? map?.grid?.cells?.culture?.[gridCell]);
  const culture = map?.society?.cultures?.[cultureId] || map?.pack?.cultures?.[cultureId] || null;
  const generator = createChineseNameGenerator(`${map?.metadata?.seed || map?.options?.seed || "map"}|add-province|${provinceId}`, {
    namebases: map?.namebases,
    provinceNames: (map?.politics?.provinces || map?.pack?.provinces || []).filter(item => item && !item.removed).map(item => item.name)
  });
  const provinceName = generator.makeProvinceName({
    id: provinceId,
    cell: packCell,
    culture: cultureId,
    cultureType: culture?.nameStyle || culture?.type,
    state: stateId,
    baseName: state?.name || state?.fullName || `国家 #${stateId}`,
    formName: provinceFormForState(state, map?.society?.cultures || map?.pack?.cultures)
  });
  const province = {
    id: provinceId,
    i: provinceId,
    state: stateId,
    center: packCell,
    gridCenter: gridCell,
    burg: normalizeProvinceId(map?.pack?.cells?.burg?.[packCell]),
    name: provinceName.name,
    formName: provinceName.formName,
    fullName: provinceName.fullName,
    color: state?.color || fallbackProvinceColor(provinceId),
    religion: map?.pack?.cells?.religion?.[packCell] ?? map?.grid?.cells?.religion?.[gridCell] ?? 0,
    cells: 0,
    area: 0,
    neighbors: [],
    pole: point.map(value => roundValue(value, 2))
  };
  writeProvince(map, provinceId, province);
  attachProvinceToState(map, stateId, provinceId);
  const changes = initialProvinceCells(map, gridCell, stateId).map(cell => ({
    gridCell: cell,
    before: normalizeProvinceId(map?.grid?.cells?.province?.[cell]),
    after: provinceId
  }));
  applyProvinceChanges(map, changes, "after");
  repairProvinceDerivatives(map, changes);
  syncBurgProvincesForChanges(map, changes);
  markProvinceCapitalCity(map, provinceId, packCell, gridCell);
  refreshStateProvinceLists(map);
  refreshPoliticsMetadata(map);
  delete map.__provinceEditorPackCellsByGrid;
  return {provinceId, stateId, cells: changes.length};
}

function deleteProvince(map, provinceId) {
  const province = getProvince(map, provinceId);
  if (!province || province.removed) throw new Error(`找不到省份 #${provinceId}`);
  const changes = [];
  for (const gridCell of map?.grid?.cells?.i || []) {
    if (normalizeProvinceId(map.grid.cells.province?.[gridCell]) !== provinceId) continue;
    changes.push({gridCell, before: provinceId, after: 0});
  }
  applyProvinceChanges(map, changes, "after");
  repairProvinceDerivatives(map, changes);
  syncBurgProvincesForChanges(map, changes);
  for (const city of map?.settlements?.cities || []) {
    if (!city || normalizeProvinceId(city.province) !== provinceId) continue;
    city.province = 0;
    city.provincial = false;
  }
  for (const burg of map?.pack?.burgs || []) {
    if (!burg || normalizeProvinceId(burg.province) !== provinceId) continue;
    burg.province = 0;
  }
  markProvinceRemoved(map, provinceId);
  detachProvinceFromStates(map, provinceId);
  refreshStateProvinceLists(map);
  refreshPoliticsMetadata(map);
  delete map.__provinceEditorPackCellsByGrid;
  return {provinceId, cells: changes.length};
}

function normalizeChanges(changes) {
  const byCell = new Map();
  for (const change of changes || []) {
    const gridCell = Number(change.gridCell);
    const before = normalizeProvinceId(change.before);
    const after = normalizeProvinceId(change.after);
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

function captureProvinceSnapshot(map, changes, originalPackProvinces) {
  const packCells = uniquePackCellsForChanges(map, changes);
  const affectedProvinceIds = new Set(changes.flatMap(change => [change.before, change.after]));
  for (const packCell of packCells) {
    const provinceId = normalizeProvinceId(originalPackProvinces?.get(packCell) ?? map?.pack?.cells?.province?.[packCell]);
    affectedProvinceIds.add(provinceId);
    for (const neighbor of map.pack.cells.c?.[packCell] || []) affectedProvinceIds.add(map.pack.cells.province[neighbor]);
  }
  const cityIds = new Set();
  const changedGridCells = new Set(changes.map(change => change.gridCell));
  const changedPackCells = new Set(packCells);
  for (const city of map?.settlements?.cities || []) {
    if (!city) continue;
    if (changedGridCells.has(city.cell) || changedPackCells.has(city.packCell)) cityIds.add(city.id);
  }

  return {
    cities: [...cityIds].map(cityId => {
      const city = map?.settlements?.cities?.[cityId];
      return city ? {cityId, province: city.province, provincial: city.provincial} : null;
    }).filter(Boolean),
    provinces: snapshotProvinces(map, affectedProvinceIds),
    mirrors: map.pack.provinces && map.pack.provinces !== map.politics?.provinces
      ? snapshotProvinces(map, affectedProvinceIds, map.pack.provinces) : [],
    burgs: (map.pack.burgs || []).flatMap((burg, id) => burg && changedPackCells.has(burg.cell)
      ? [{id, province: burg.province, present: Object.hasOwn(burg, "province")}] : [])
  };
}

function applyProvinceChanges(map, changes, key, originalPackProvinces) {
  if (!map?.grid?.cells?.province) return;
  for (const change of changes) {
    const provinceId = normalizeProvinceId(change[key]);
    const wasPreviewed = key === "after" && map.grid.cells.province[change.gridCell] === provinceId;
    map.grid.cells.province[change.gridCell] = provinceId;
    for (const packCell of getPackCellsForGrid(map, change.gridCell)) {
      if (map?.pack?.cells?.h?.[packCell] < 20) continue;
      if (originalPackProvinces && !originalPackProvinces.has(packCell)) {
        originalPackProvinces.set(packCell, wasPreviewed ? change.before : map.pack.cells.province[packCell]);
      }
      map.pack.cells.province[packCell] = key === "before" ? originalPackProvinces?.get(packCell) ?? provinceId : provinceId;
    }
  }
}

function repairProvinceDerivatives(map, changes, originalPackProvinces, summaryIds, memberIndex) {
  const affectedProvinces = new Set(changes.flatMap(change => [change.before, change.after]).filter(Boolean));
  if (originalPackProvinces) for (const id of originalPackProvinces.values()) if (id) affectedProvinces.add(id);
  for (const packCell of uniquePackCellsForChanges(map, changes)) {
    const provinceId = normalizeProvinceId(map?.pack?.cells?.province?.[packCell]);
    if (provinceId) affectedProvinces.add(provinceId);
  }
  syncCityProvinces(map, changes);
  const targetIds = summaryIds && new Set(summaryIds);
  const candidates = memberIndex && affectedProvinces.size
    ? memberIndex.candidates(new Set([...targetIds, ...affectedProvinces]), originalPackProvinces) : null;
  const groups = refreshProvinceSummaries(map, targetIds, affectedProvinces, candidates);
  repairProvinceCenters(map, affectedProvinces, groups);
  refreshProvincePoles(map, groups);
}

function syncCityProvinces(map, changes) {
  const changedGridCells = new Set(changes.map(change => change.gridCell));
  const changedPackCells = new Set(uniquePackCellsForChanges(map, changes));
  for (const city of map?.settlements?.cities || []) {
    if (!city) continue;
    if (!changedGridCells.has(city.cell) && !changedPackCells.has(city.packCell)) continue;
    if (Number.isInteger(city.packCell) && city.packCell >= 0 && map?.pack?.cells?.province) {
      city.province = normalizeProvinceId(map.pack.cells.province[city.packCell]);
    } else if (Number.isInteger(city.cell) && map?.grid?.cells?.province) {
      city.province = normalizeProvinceId(map.grid.cells.province[city.cell]);
    }
  }
}

function repairProvinceCenters(map, provinceIds, groups) {
  const provinces = map?.politics?.provinces || map?.pack?.provinces;
  const cells = map?.pack?.cells;
  if (!provinces || !cells?.province) return;
  for (const provinceId of provinceIds || []) {
    const province = provinces[provinceId];
    if (!province || province.removed) continue;
    const currentCenter = normalizePackCell(province.center);
    if (currentCenter >= 0 && normalizeProvinceId(cells.province?.[currentCenter]) === provinceId) continue;
    const city = (map?.settlements?.cities || [])
      .filter(item => item && item.province === provinceId)
      .sort((a, b) => Number(b.provincial) - Number(a.provincial) || (b.population || 0) - (a.population || 0) || a.id - b.id)[0];
    if (city?.packCell >= 0 && normalizeProvinceId(cells.province?.[city.packCell]) === provinceId) {
      setProvinceCenter(map, province, city.packCell);
      continue;
    }
    const fallback = groups?.get(provinceId)?.cells.find(cell => cells.h?.[cell] >= 20);
    if (fallback !== undefined) setProvinceCenter(map, province, fallback);
  }
}

function setProvinceCenter(map, province, packCell) {
  province.center = packCell;
  province.gridCenter = map?.pack?.cells?.g?.[packCell] ?? province.gridCenter;
  province.religion = map?.pack?.cells?.religion?.[packCell] ?? province.religion;
}

function restoreProvinceSnapshot(map, snapshot) {
  if (!snapshot) return;
  for (const item of snapshot.cities || []) {
    const city = map?.settlements?.cities?.[item.cityId];
    if (city) {
      city.province = item.province;
      city.provincial = item.provincial;
    }
  }
  restoreProvinces(map, snapshot.provinces);
  restoreProvinces(map, snapshot.mirrors, map.pack.provinces);
  for (const {id, province, present} of snapshot.burgs) {
    if (present) map.pack.burgs[id].province = province;
    else delete map.pack.burgs[id].province;
  }
}

function refreshProvinceSummaries(map, targetIds, poleIds, candidates) {
  const provinces = map?.politics?.provinces || map?.pack?.provinces;
  const cells = map?.pack?.cells;
  if (!provinces || !cells?.province) return;
  const targets = targetIds ? [...targetIds].map(id => provinces[id]).filter(Boolean) : provinces;
  const neighborSets = new Map(targets.filter(Boolean).map(item => [item.i ?? item.id, new Set()]));
  const poles = poleIds.size ? poleIds : provinces.map(province => normalizeProvinceId(province?.i ?? province?.id)).filter(Boolean);
  const groups = new Map([...poles].map(id => [id, {cells: [], boundary: []}]));

  for (const province of targets) {
    if (!province) continue;
    province.cells = 0;
    province.area = 0;
    province.neighbors = [];
  }

  for (const cell of candidates || cells.i || []) {
    if (cells.h?.[cell] < 20) continue;
    const provinceId = normalizeProvinceId(cells.province[cell]);
    const province = (!targetIds || targetIds.has(provinceId)) && provinces[provinceId];
    const group = groups.get(provinceId);
    if (!province && !group) continue;
    if (province) {
      province.cells++;
      province.area += cells.area?.[cell] || 0;
    }
    let boundary = false;
    for (const neighbor of cells.c?.[cell] || []) {
      if (cells.h?.[neighbor] < 20) {
        boundary = true;
        continue;
      }
      const neighborProvince = normalizeProvinceId(cells.province[neighbor]);
      if (neighborProvince !== provinceId) boundary = true;
      if (province && neighborProvince && neighborProvince !== provinceId && provinces[neighborProvince]) {
        neighborSets.get(provinceId)?.add(neighborProvince);
      }
    }
    if (group) {
      group.cells.push(cell);
      if (boundary) group.boundary.push(cell);
    }
  }

  for (const province of targets) {
    if (!province) continue;
    province.area = roundValue(province.area || 0, 2);
    province.neighbors = Array.from(neighborSets.get(province.i ?? province.id) || []);
  }
  return groups;
}

function refreshProvincePoles(map, groups) {
  const provinces = map?.politics?.provinces || map?.pack?.provinces;
  const cells = map?.pack?.cells;
  if (!groups || !cells?.p) return;
  for (const [provinceId, group] of groups) {
    const province = provinces[provinceId];
    if (!province || province.removed) continue;
    const ownCells = group.cells;
    if (!ownCells.length) {
      province.pole = null;
      continue;
    }
    const boundaryCells = group.boundary.length ? group.boundary : ownCells;
    const poleCell = findProvincePoleCell(cells, ownCells, boundaryCells, province.center);
    province.pole = cells.p[poleCell].map(value => roundValue(value, 2));
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
  if (!map?.pack?.cells?.g || !map?.pack?.cells?.province) return [];
  return packCellsByGrid(map, "__provinceEditorPackCellsByGrid").get(gridCell) || [];
}

function snapshotProvinces(map, provinceIds, provinces = map?.politics?.provinces || map?.pack?.provinces || []) {
  return [...(provinceIds || [])].map(provinceId => {
    const province = provinces[provinceId];
    return province ? {
      provinceId,
      province: {
        cells: province.cells,
        area: province.area,
        center: province.center,
        gridCenter: province.gridCenter,
        religion: province.religion,
        pole: Array.isArray(province.pole) ? [...province.pole] : province.pole,
        neighbors: Array.isArray(province.neighbors) ? [...province.neighbors] : []
      }
    } : null;
  }).filter(Boolean);
}

function restoreProvinces(map, snapshots = [], provinces = map?.politics?.provinces || map?.pack?.provinces) {
  if (!provinces) return;
  for (const snapshot of snapshots) {
    const province = provinces[snapshot.provinceId];
    if (province) Object.assign(province, snapshot.province, {neighbors: [...(snapshot.province.neighbors || [])]});
  }
}

function captureProvinceCollectionSnapshot(map) {
  return {
    provinces: clonePlain(map?.politics?.provinces || []),
    packProvinces: map?.pack?.provinces === map?.politics?.provinces ? null : clonePlain(map?.pack?.provinces || []),
    states: clonePlain(map?.politics?.states || []),
    packStates: map?.pack?.states === map?.politics?.states ? null : clonePlain(map?.pack?.states || []),
    gridProvince: cloneArrayLike(map?.grid?.cells?.province),
    packProvince: cloneArrayLike(map?.pack?.cells?.province),
    cities: clonePlain(map?.settlements?.cities || []),
    burgs: clonePlain(map?.pack?.burgs || []),
    politicsMetadata: clonePlain(map?.politics?.metadata || null)
  };
}

function restoreProvinceCollectionSnapshot(map, snapshot) {
  if (!map || !snapshot) return;
  if (map.politics) {
    map.politics.provinces = clonePlain(snapshot.provinces);
    map.politics.states = clonePlain(snapshot.states);
    map.politics.metadata = clonePlain(snapshot.politicsMetadata);
  }
  if (map.pack) {
    map.pack.provinces = snapshot.packProvinces ? clonePlain(snapshot.packProvinces) : map.politics?.provinces;
    map.pack.states = snapshot.packStates ? clonePlain(snapshot.packStates) : map.politics?.states;
    map.pack.burgs = clonePlain(snapshot.burgs);
  }
  if (map.settlements) map.settlements.cities = clonePlain(snapshot.cities);
  restoreArrayLike(map?.grid?.cells, "province", snapshot.gridProvince);
  restoreArrayLike(map?.pack?.cells, "province", snapshot.packProvince);
  delete map.__provinceEditorPackCellsByGrid;
}

function isValidProvinceSeedCell(map, gridCell) {
  return inspectProvinceCreation(map, gridCell).valid;
}

function creationInspection(valid, code, summary, details) {
  return {valid, allowed: valid, code, summary, details};
}

function normalizeGridCell(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : -1;
}

function choosePackCellForGridCell(map, gridCell, {readOnly = false} = {}) {
  const candidates = (readOnly ? findPackCellsForGrid(map, gridCell) : getPackCellsForGrid(map, gridCell))
    .filter(cell => map?.pack?.cells?.h?.[cell] >= 20);
  if (candidates.length) return candidates.sort((a, b) => a - b)[0];
  const byGrid = map?.pack?.cells?.g || [];
  for (let cell = 0; cell < byGrid.length; cell += 1) {
    if (byGrid[cell] === gridCell && map?.pack?.cells?.h?.[cell] >= 20) return cell;
  }
  return null;
}

function findPackCellsForGrid(map, gridCell) {
  return packCellsByGrid(map)?.get(gridCell) || [];
}

function initialProvinceCells(map, centerGridCell, stateId) {
  const cells = map?.grid?.cells;
  const result = new Set([centerGridCell]);
  for (const neighbor of cells?.c?.[centerGridCell] || []) {
    if (!isGridLandCell(map, neighbor)) continue;
    if (normalizeStateId(cells?.state?.[neighbor]) !== stateId) continue;
    result.add(neighbor);
  }
  return [...result];
}

function writeProvince(map, provinceId, province) {
  if (map?.politics?.provinces) map.politics.provinces[provinceId] = province;
  if (map?.pack?.provinces) map.pack.provinces[provinceId] = map?.politics?.provinces?.[provinceId] || clonePlain(province);
}

function attachProvinceToState(map, stateId, provinceId) {
  for (const state of [map?.politics?.states?.[stateId], map?.pack?.states?.[stateId]]) {
    if (!state) continue;
    if (!Array.isArray(state.provinces)) state.provinces = [];
    if (!state.provinces.includes(provinceId)) state.provinces.push(provinceId);
  }
}

function detachProvinceFromStates(map, provinceId) {
  for (const states of [map?.politics?.states, map?.pack?.states]) {
    for (const state of states || []) {
      if (!state || !Array.isArray(state.provinces)) continue;
      state.provinces = state.provinces.filter(id => normalizeProvinceId(id) !== provinceId);
    }
  }
}

function refreshStateProvinceLists(map) {
  const provinces = map?.politics?.provinces || map?.pack?.provinces || [];
  for (const states of [map?.politics?.states, map?.pack?.states]) {
    for (const state of states || []) {
      if (!state) continue;
      state.provinces = provinces
        .filter(province => province && !province.removed && normalizeStateId(province.state) === normalizeStateId(state.i ?? state.id))
        .map(province => province.i ?? province.id);
    }
  }
}

function markProvinceRemoved(map, provinceId) {
  for (const province of [map?.politics?.provinces?.[provinceId], map?.pack?.provinces?.[provinceId]]) {
    if (!province) continue;
    province.removed = true;
    province.cells = 0;
    province.area = 0;
    province.neighbors = [];
    province.pole = null;
  }
}

function syncBurgProvincesForChanges(map, changes) {
  const changedPackCells = new Set(uniquePackCellsForChanges(map, changes));
  for (const burg of map?.pack?.burgs || []) {
    if (!burg || !changedPackCells.has(burg.cell)) continue;
    burg.province = normalizeProvinceId(map?.pack?.cells?.province?.[burg.cell]);
  }
}

function markProvinceCapitalCity(map, provinceId, packCell, gridCell) {
  const city = (map?.settlements?.cities || []).find(item => item && (item.packCell === packCell || item.cell === gridCell));
  if (!city) return;
  city.province = provinceId;
  city.provincial = true;
  const province = getProvince(map, provinceId);
  if (province) province.burg = city.burgId || province.burg || 0;
  const burg = map?.pack?.burgs?.[city.burgId];
  if (burg) burg.province = provinceId;
}

function refreshPoliticsMetadata(map) {
  const metadata = map?.politics?.metadata;
  if (!metadata) return;
  const provinces = map?.politics?.provinces || [];
  metadata.provinces = provinces.filter(item => item && !item.removed && normalizeProvinceId(item.i ?? item.id) > 0).length;
  metadata.provinceNames = provinces.filter(item => item && !item.removed && normalizeProvinceId(item.i ?? item.id) > 0).map(item => item.fullName || item.name);
}

function getProvince(map, provinceId) {
  return map?.politics?.provinces?.[provinceId] || map?.pack?.provinces?.[provinceId] || null;
}

function nextProvinceId(map) {
  let max = 0;
  for (const province of map?.politics?.provinces || map?.pack?.provinces || []) {
    const id = normalizeProvinceId(province?.i ?? province?.id);
    if (id > max) max = id;
  }
  return max + 1;
}

function fallbackProvinceColor(provinceId) {
  const palette = ["#b7c8f3", "#f6b6c8", "#abe7c1", "#f8dda1", "#cbbdf1", "#aee3e8", "#f3b7a8", "#d5eda2"];
  return palette[Math.abs(Number(provinceId) || 0) % palette.length];
}

function isGridLandCell(map, gridCell) {
  if (map?.grid?.cells?.h?.[gridCell] < 20) return false;
  const featureId = map?.grid?.cells?.f?.[gridCell];
  const feature = map?.features?.features?.[featureId];
  return feature ? Boolean(feature.land) : true;
}

function normalizeProvinceId(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? Math.max(0, numeric) : 0;
}

function normalizeStateId(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? Math.max(0, numeric) : 0;
}

function normalizePackCell(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : -1;
}

function roundValue(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function clonePlain(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
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
