import {systemAffected} from "./edit-command-effects.js";
import {provinceFormForState} from "../generator/province-naming.js";

const STATE_TOPOLOGY_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze([
    "state-cells",
    "pack-state-cells",
    "province-cells",
    "settlement-states",
    "state-statistics",
    "province-statistics",
    "cell-colors",
    "political-boundaries",
    "political-selection",
    "point-layers",
    "labels",
    "route-mesh",
    "object-index",
    "object-panels",
    "derived-stale",
    "defer:economy",
    "defer:diplomacy",
    "defer:military",
    "defer:zones",
    "defer:state-markers"
  ])
});

const STALE_SYSTEMS = Object.freeze(["economy", "diplomacy", "military", "zones", "state-markers"]);
const MAX_PROVINCE_ID = 65535;

export function inspectStateMerge(map, options = {}) {
  const survivorStateId = positiveInteger(options.survivorStateId ?? options.survivor ?? options.stateId);
  const victimStateId = positiveInteger(options.victimStateId ?? options.victim ?? options.otherStateId);
  if (!survivorStateId || !victimStateId || survivorStateId === victimStateId) {
    return invalidInspection("invalid-state-pair", "合并需要两个不同的有效国家，并明确保留方");
  }
  const survivor = readState(map, survivorStateId);
  const victim = readState(map, victimStateId);
  if (!isActiveState(survivor) || !isActiveState(victim)) {
    return invalidInspection("state-not-found", "合并双方都必须是未移除的有效国家");
  }
  if (!statesShareLandBoundary(map, survivorStateId, victimStateId)) {
    return invalidInspection("states-not-adjacent", "只能合并存在共同陆地边界的两个国家");
  }

  const affectedOldProvinceIds = activeProvinces(map)
    .filter(province => [survivorStateId, victimStateId].includes(numberId(province.state)))
    .map(provinceId)
    .sort(ascending);
  const cells = collectTopologyCells(map, stateId => stateId === survivorStateId || stateId === victimStateId);
  const cityIds = activeCities(map)
    .filter(city => [survivorStateId, victimStateId].includes(numberId(city.state)))
    .map(city => numberId(city.id))
    .sort(ascending);
  if (!cityIds.length) return invalidInspection("state-without-city", "合并后的国家至少需要一座城市");

  const nextProvinceId = nextPoliticalId(map, "provinces");
  const preservedProvinceNames = affectedOldProvinceIds.map(id => provinceNameSnapshot(readProvince(map, id)));
  const provinceCount = Math.max(targetProvinceCount(cityIds.length, map?.options?.provincesRatio), preservedProvinceNames.length);
  if (nextProvinceId + provinceCount - 1 > MAX_PROVINCE_ID) {
    return invalidInspection("province-id-overflow", `新省份编号不能超过 ${MAX_PROVINCE_ID}`);
  }

  return validInspection({
    operation: "merge",
    survivorStateId,
    victimStateId,
    selectedStateIds: [survivorStateId, victimStateId],
    resultStateIds: [survivorStateId],
    affectedOldProvinceIds,
    preservedProvinceNames,
    newProvinceIds: sequence(nextProvinceId, provinceCount),
    boundaryStateIds: collectBoundaryStateIds(map, landPackCells(map).filter(cell => numberId(map.pack.cells.state[cell]) === victimStateId), new Set([survivorStateId, victimStateId])),
    gridCells: cells.gridCells,
    packCells: cells.packCells,
    cityIds,
    capitalCityId: stateCapitalCityId(map, survivorStateId),
    selectionTarget: {kind: "state", id: survivorStateId},
    redirects: [{kind: "state", from: victimStateId, to: survivorStateId}],
    summary: `合并国家 #${victimStateId} 至 #${survivorStateId}`
  });
}

export function inspectStateSplit(map, options = {}) {
  const sourceStateId = positiveInteger(options.sourceStateId ?? options.stateId);
  const selectedProvinceIds = uniquePositiveIntegers(options.selectedProvinceIds ?? options.provinceIds).sort(ascending);
  const newCapitalCityId = nonNegativeInteger(options.newCapitalCityId ?? options.capitalCityId);
  const source = readState(map, sourceStateId);
  if (!sourceStateId || !isActiveState(source)) return invalidInspection("state-not-found", "拆分来源必须是未移除的有效国家");
  if (!selectedProvinceIds.length) return invalidInspection("province-selection-empty", "拆分必须选择至少一个完整旧省份");
  if (newCapitalCityId === null) return invalidInspection("capital-required", "拆分必须明确新国家首都");

  const sourceProvinces = activeProvinces(map).filter(province => numberId(province.state) === sourceStateId);
  const sourceProvinceIds = sourceProvinces.map(provinceId).sort(ascending);
  const sourceProvinceSet = new Set(sourceProvinceIds);
  if (selectedProvinceIds.some(id => !sourceProvinceSet.has(id))) {
    return invalidInspection("province-outside-source", "所选省份必须全部属于来源国家");
  }
  const remainderProvinceIds = sourceProvinceIds.filter(id => !selectedProvinceIds.includes(id));
  if (!remainderProvinceIds.length) return invalidInspection("source-would-be-empty", "拆分后来源国家至少需要保留一个完整旧省份");

  const selectedProvinceSet = new Set(selectedProvinceIds);
  const selectedPackCells = landPackCells(map).filter(cell => numberId(map.pack.cells.state[cell]) === sourceStateId && selectedProvinceSet.has(numberId(map.pack.cells.province?.[cell])));
  const remainderPackCells = landPackCells(map).filter(cell => numberId(map.pack.cells.state[cell]) === sourceStateId && !selectedProvinceSet.has(numberId(map.pack.cells.province?.[cell])));
  if (!selectedPackCells.length || !remainderPackCells.length) return invalidInspection("split-side-empty", "拆分两侧都必须包含陆地");
  if (!isConnectedCellSet(map.pack.cells, selectedPackCells) || !isConnectedCellSet(map.pack.cells, remainderPackCells)) {
    return invalidInspection("split-side-disconnected", "拆分选择与剩余领土都必须陆地连通");
  }

  const selectedCityIds = activeCities(map).filter(city => cityInPackCells(city, selectedPackCells)).map(city => numberId(city.id)).sort(ascending);
  const remainderCityIds = activeCities(map).filter(city => cityInPackCells(city, remainderPackCells)).map(city => numberId(city.id)).sort(ascending);
  if (!selectedCityIds.length || !remainderCityIds.length) {
    return invalidInspection("split-side-without-city", "拆分两侧都必须至少保留一座城市");
  }
  if (!selectedCityIds.includes(newCapitalCityId)) {
    return invalidInspection("capital-outside-selection", "新国家首都必须位于所选省份领土内");
  }

  const newStateId = nextPoliticalId(map, "states");
  const oldSourceCapitalCityId = stateCapitalCityId(map, sourceStateId);
  if (oldSourceCapitalCityId === null) return invalidInspection("source-capital-invalid", "来源国家缺少有效首都城市");
  const sourceCapitalRanking = selectedCityIds.includes(oldSourceCapitalCityId)
    ? rankCapitalCandidates(map, activeCities(map).filter(city => remainderCityIds.includes(numberId(city.id))))
    : [];
  const sourceCapitalCityId = selectedCityIds.includes(oldSourceCapitalCityId)
    ? sourceCapitalRanking[0]?.cityId ?? null
    : oldSourceCapitalCityId;
  if (sourceCapitalCityId === null) return invalidInspection("source-capital-candidate-missing", "拆分后来源国家找不到可用首都候选");
  const militaryInspection = inspectSplitMilitaryAssignments(map, sourceStateId, newStateId, new Set(selectedPackCells), new Set(remainderPackCells));
  if (!militaryInspection.valid) {
    return invalidInspection("military-owner-unresolved", `军团 ${militaryInspection.unresolved.map(item => item.oldId).join("、")} 无法从当前驻地或基地确定拆分后归属`, {
      unresolvedMilitary: militaryInspection.unresolved
    });
  }
  const sourceProvinceCount = targetProvinceCount(remainderCityIds.length, map?.options?.provincesRatio);
  const newProvinceCount = targetProvinceCount(selectedCityIds.length, map?.options?.provincesRatio);
  const nextProvinceId = nextPoliticalId(map, "provinces");
  const totalProvinceCount = sourceProvinceCount + newProvinceCount;
  if (nextProvinceId + totalProvinceCount - 1 > MAX_PROVINCE_ID) {
    return invalidInspection("province-id-overflow", `新省份编号不能超过 ${MAX_PROVINCE_ID}`);
  }

  const selectedGridCells = landGridCells(map).filter(cell => numberId(map.grid.cells.state[cell]) === sourceStateId && selectedProvinceSet.has(numberId(map.grid.cells.province?.[cell])));
  const newStateName = normalizeStateName(options.name) || deterministicSplitStateName(map, newCapitalCityId, newStateId);
  return validInspection({
    operation: "split",
    sourceStateId,
    newStateId,
    selectedStateIds: [sourceStateId],
    resultStateIds: [sourceStateId, newStateId],
    selectedProvinceIds,
    remainderProvinceIds,
    affectedOldProvinceIds: sourceProvinceIds,
    newProvinceIds: sequence(nextProvinceId, totalProvinceCount),
    sourceProvinceIds: sequence(nextProvinceId, sourceProvinceCount),
    splitProvinceIds: sequence(nextProvinceId + sourceProvinceCount, newProvinceCount),
    boundaryStateIds: collectBoundaryStateIds(map, selectedPackCells, new Set([sourceStateId])),
    gridCells: selectedGridCells,
    packCells: selectedPackCells,
    sourcePackCells: remainderPackCells,
    selectedCityIds,
    remainderCityIds,
    newCapitalCityId,
    oldSourceCapitalCityId,
    sourceCapitalCityId,
    sourceCapitalReason: selectedCityIds.includes(oldSourceCapitalCityId) ? "automatic" : "retained",
    sourceCapitalRanking,
    militaryAssignments: militaryInspection.assignments,
    newStateName,
    selectionTarget: {kind: "state", id: newStateId},
    redirects: [],
    summary: `从国家 #${sourceStateId} 拆出国家 #${newStateId}`
  });
}

export function createMergeStatesCommand(options = {}) {
  return createTopologyCommand("merge", options);
}

export function createSplitStateCommand(options = {}) {
  return createTopologyCommand("split", options);
}

function createTopologyCommand(operation, options) {
  let frozenPlan = null;
  let beforeSnapshot = null;
  let result = null;
  const primaryId = operation === "merge"
    ? positiveInteger(options.survivorStateId ?? options.survivor ?? options.stateId) || 0
    : positiveInteger(options.sourceStateId ?? options.stateId) || 0;
  return {
    label: options.label || (operation === "merge" ? "合并国家" : "拆分国家"),
    domain: "state-topology",
    effects: {
      ...STATE_TOPOLOGY_EFFECTS,
      affected: systemAffected("state-topology", [{kind: "state", id: primaryId}])
    },
    apply(context) {
      const map = context?.map;
      const inspection = frozenPlan || (operation === "merge" ? inspectStateMerge(map, options) : inspectStateSplit(map, options));
      if (!inspection.valid) throw new Error(inspection.summary);
      if (!frozenPlan) frozenPlan = {...clonePlain(inspection), transactionTimestamp: options.timestamp || new Date().toISOString()};
      beforeSnapshot ??= captureTopologySnapshot(map);
      try {
        result = applyTopologyPlan(map, frozenPlan, options);
        this.effects.affected = systemAffected("state-topology", [
          ...result.stateIds.map(id => ({kind: "state", id})),
          ...(result.removedStateId ? [{kind: "state", id: result.removedStateId}] : []),
          ...result.provinceIds.map(id => ({kind: "province", id}))
        ]);
      } catch (error) {
        restoreTopologySnapshot(map, beforeSnapshot);
        throw error;
      }
    },
    revert(context) {
      if (beforeSnapshot) restoreTopologySnapshot(context?.map, beforeSnapshot);
    },
    isNoop(context) {
      const inspection = frozenPlan || (operation === "merge" ? inspectStateMerge(context?.map, options) : inspectStateSplit(context?.map, options));
      return !inspection.valid;
    },
    getInspection() {
      return frozenPlan ? clonePlain(frozenPlan) : null;
    },
    getResult() {
      return result ? clonePlain(result) : null;
    }
  };
}

function applyTopologyPlan(map, plan, options) {
  if (!map?.grid?.cells?.state || !map?.pack?.cells?.state) throw new Error("当前地图缺少国家拓扑数据");
  applyCellStateTopology(map, plan);
  injectFault(options, "after-topology");

  if (plan.operation === "merge") applyMergedStateRecord(map, plan);
  else applySplitStateRecord(map, plan);
  synchronizeCityOwnershipAndCapitals(map, plan);
  injectFault(options, "capital", {map, plan});
  const provinceResult = rebuildAffectedProvinces(map, plan);
  injectFault(options, "after-reprovince");

  refreshPoliticalTopology(map, plan);
  synchronizeDiplomacy(map, plan);
  injectFault(options, "diplomacy", {map, plan});
  const militaryResult = synchronizeMilitary(map, plan);
  injectFault(options, "military", {map, plan});
  synchronizeMarkets(map);
  injectFault(options, "market", {map, plan});
  synchronizeRoutes(map);
  injectFault(options, "route", {map, plan});
  synchronizeTopologyMetadata(map, plan);
  injectFault(options, "after-domains");

  injectFault(options, "before-validate");
  const validation = validateTopologyResult(map, plan, provinceResult, militaryResult);
  if (!validation.valid) throw new Error(`国家拓扑事务校验失败：${validation.errors.join("；")}`);
  return {
    operation: plan.operation,
    stateIds: [...plan.resultStateIds],
    removedStateId: plan.victimStateId || null,
    provinceIds: [...provinceResult.newProvinceIds],
    tombstonedProvinceIds: [...plan.affectedOldProvinceIds],
    selectionTarget: clonePlain(plan.selectionTarget),
    redirects: clonePlain(plan.redirects),
    topologyRefresh: {
      stateIds: [...new Set([...(plan.selectedStateIds || []), ...(plan.resultStateIds || [])])],
      provinceIds: [...provinceResult.newProvinceIds],
      gridCells: plan.operation === "merge" ? [...plan.gridCells] : [...plan.gridCells],
      packCells: plan.operation === "merge" ? [...plan.packCells] : [...plan.packCells],
      labels: true,
      picking: true
    },
    validation
  };
}

function applyCellStateTopology(map, plan) {
  if (plan.operation === "merge") {
    for (const cell of plan.gridCells) {
      if (numberId(map.grid.cells.state[cell]) === plan.victimStateId) map.grid.cells.state[cell] = plan.survivorStateId;
    }
    for (const cell of plan.packCells) {
      if (numberId(map.pack.cells.state[cell]) === plan.victimStateId) map.pack.cells.state[cell] = plan.survivorStateId;
    }
    return;
  }
  for (const cell of plan.gridCells) map.grid.cells.state[cell] = plan.newStateId;
  for (const cell of plan.packCells) map.pack.cells.state[cell] = plan.newStateId;
}

function applyMergedStateRecord(map, plan) {
  const victim = clonePlain(readState(map, plan.victimStateId));
  assignMirroredPoliticalFields(map, "states", plan.victimStateId, {
    removed: true,
    cells: 0,
    area: 0,
    burgs: 0,
    rural: 0,
    urban: 0,
    provinces: [],
    neighbors: [],
    campaigns: closeCampaignsForState(victim.campaigns, plan.victimStateId)
  });
}

function applySplitStateRecord(map, plan) {
  const source = clonePlain(readState(map, plan.sourceStateId));
  const capital = findCity(map, plan.newCapitalCityId);
  const splitState = {
    ...clonePlain(source),
    id: plan.newStateId,
    i: plan.newStateId,
    name: plan.newStateName,
    fullName: buildStateFullName(plan.newStateName, source),
    color: deterministicColor(`${map?.options?.seed}:state:${plan.newStateId}:${capital?.culture || 0}`),
    coa: deterministicStateCoa(map, plan.newStateId, capital),
    capital: capital?.burgId || 0,
    capitalName: capital?.name || "",
    center: capital?.packCell ?? 0,
    gridCenter: capital?.cell ?? 0,
    culture: capital?.culture ?? source.culture,
    religion: capital?.religion ?? source.religion,
    cells: 0,
    area: 0,
    burgs: 0,
    rural: 0,
    urban: 0,
    provinces: [],
    neighbors: [],
    campaigns: [],
    diplomacy: [],
    diplomacySummary: {},
    military: [],
    removed: false
  };
  writeMirroredPoliticalItem(map, "states", plan.newStateId, splitState);
}

function synchronizeCityOwnershipAndCapitals(map, plan) {
  const resultStates = new Set(plan.resultStateIds);
  for (const city of activeCities(map)) {
    const currentState = numberId(city.state);
    if (!plan.selectedStateIds.includes(currentState) && !resultStates.has(currentState)) continue;
    const packCell = cityPackCell(city);
    const nextState = Number.isInteger(packCell) ? numberId(map.pack.cells.state?.[packCell]) : numberId(map.grid.cells.state?.[city.cell]);
    if (!resultStates.has(nextState)) continue;
    replaceCity(map, city, {...city, state: nextState, capital: false, provincial: false, group: ordinaryCityGroup(city)});
    const burg = findBurgForCity(map, city);
    if (burg) replaceBurg(map, burg, {...burg, state: nextState, capital: 0, group: ordinaryCityGroup(city)});
  }

  if (plan.operation === "merge") {
    const capitalCityId = stateCapitalCityId(map, plan.survivorStateId) ?? plan.capitalCityId;
    setStateCapital(map, plan.survivorStateId, capitalCityId);
  } else {
    setStateCapital(map, plan.newStateId, plan.newCapitalCityId);
    if (plan.sourceCapitalCityId === null || plan.sourceCapitalCityId === undefined) throw new Error("拆分冻结计划缺少来源国家首都");
    setStateCapital(map, plan.sourceStateId, plan.sourceCapitalCityId);
  }
}

function rebuildAffectedProvinces(map, plan) {
  for (const id of plan.affectedOldProvinceIds) {
    const old = readProvince(map, id);
    if (!old) continue;
    writeMirroredPoliticalItem(map, "provinces", id, {
      ...clonePlain(old),
      removed: true,
      cells: 0,
      area: 0,
      burgs: 0,
      rural: 0,
      urban: 0,
      neighbors: []
    });
  }

  const plans = [];
  let provinceCursor = plan.newProvinceIds[0];
  for (const stateId of plan.resultStateIds) {
    const cells = landPackCells(map).filter(cell => numberId(map.pack.cells.state[cell]) === stateId);
    const cities = activeCities(map).filter(city => numberId(city.state) === stateId && cells.includes(cityPackCell(city)));
    if (!cells.length || !cities.length) throw new Error(`国家 #${stateId} 缺少可重新分省的陆地或城市`);
    const count = plan.operation === "merge"
      ? plan.newProvinceIds.length
      : targetProvinceCount(cities.length, map?.options?.provincesRatio);
    const provinceIds = sequence(provinceCursor, count);
    provinceCursor += count;
    const preservedProvinceNames = plan.operation === "merge" && stateId === plan.survivorStateId ? plan.preservedProvinceNames || [] : [];
    const centers = preservedProvinceNames.length
      ? chooseMergeProvinceCenters(map, stateId, cells, cities, count, preservedProvinceNames)
      : chooseProvinceCenters(map, stateId, cities, count);
    const assignment = assignConnectedProvinces(map.pack.cells, cells, centers.map((city, index) => ({cell: cityPackCell(city), provinceId: provinceIds[index]})));
    plans.push({
      stateId,
      cells,
      cities,
      centers,
      provinceIds,
      assignment,
      preservedProvinceNames
    });
  }

  const expectedIds = plans.flatMap(item => item.provinceIds);
  if (!sameNumberArray(expectedIds, plan.newProvinceIds)) throw new Error("冻结计划的新省份编号与实施结果不一致");
  for (const item of plans) {
    for (const [cell, provinceId] of item.assignment) map.pack.cells.province[cell] = provinceId;
  }
  synchronizeGridProvinces(map, new Set(plan.resultStateIds));
  synchronizeCityProvinces(map, new Set(plan.resultStateIds));

  for (const item of plans) {
    for (let index = 0; index < item.provinceIds.length; index++) {
      const provinceId = item.provinceIds[index];
      const centerCity = item.centers[index];
      const centerCell = cityPackCell(centerCity);
      const provinceCells = item.cells.filter(cell => numberId(map.pack.cells.province[cell]) === provinceId);
      const record = buildProvinceRecord(map, item.stateId, provinceId, centerCity, centerCell, provinceCells, item.preservedProvinceNames[index]);
      writeMirroredPoliticalItem(map, "provinces", provinceId, record);
      setCityProvincial(map, centerCity.id, true);
    }
  }
  refreshProvinceNeighbors(map, expectedIds, plan.affectedOldProvinceIds);
  return {plans, newProvinceIds: expectedIds};
}

function chooseProvinceCenters(map, stateId, cities, count) {
  const capitalCityId = stateCapitalCityId(map, stateId);
  const ranked = [...cities].sort((a, b) => {
    if (numberId(a.id) === capitalCityId) return -1;
    if (numberId(b.id) === capitalCityId) return 1;
    return Number(b.population || 0) - Number(a.population || 0)
      || Number(packCellSuitability(map, cityPackCell(b))) - Number(packCellSuitability(map, cityPackCell(a)))
      || numberId(a.burgId) - numberId(b.burgId)
      || numberId(a.id) - numberId(b.id);
  });
  return ranked.slice(0, count);
}

function chooseMergeProvinceCenters(map, stateId, stateCells, cities, count, preservedProvinceNames) {
  const allowed = new Set(stateCells);
  const usedCells = new Set();
  const centers = [];
  for (const preserved of preservedProvinceNames) {
    const preferredCell = numberId(preserved.center);
    const centerCell = allowed.has(preferredCell)
      ? preferredCell
      : stateCells.find(cell => numberId(map.pack.cells.province?.[cell]) === numberId(preserved.id));
    if (!Number.isInteger(centerCell) || usedCells.has(centerCell)) continue;
    const city = cities.find(item => numberId(item.burgId) === numberId(preserved.burg))
      || cities.find(item => cityPackCell(item) === centerCell);
    centers.push(city || {
      id: null,
      burgId: numberId(preserved.burg),
      name: preserved.name,
      state: stateId,
      packCell: centerCell,
      cell: numberId(map.pack.cells.g?.[centerCell])
    });
    usedCells.add(centerCell);
  }

  for (const city of centers.length >= count ? [] : chooseProvinceCenters(map, stateId, cities, cities.length)) {
    const cell = cityPackCell(city);
    if (!Number.isInteger(cell) || usedCells.has(cell)) continue;
    centers.push(city);
    usedCells.add(cell);
    if (centers.length >= count) break;
  }
  if (centers.length !== count) throw new Error(`合并后找不到足够的唯一省份中心以保留全部既有省名：${centers.length} / ${count}`);
  return centers;
}

function assignConnectedProvinces(cells, ownedCells, seeds) {
  const allowed = new Set(ownedCells);
  const assignment = new Map();
  let frontier = [];
  for (const seed of [...seeds].sort((a, b) => a.provinceId - b.provinceId)) {
    if (!allowed.has(seed.cell)) throw new Error("省会不在所属国家陆地内");
    const previous = assignment.get(seed.cell);
    if (previous === undefined || seed.provinceId < previous) assignment.set(seed.cell, seed.provinceId);
  }
  frontier = [...assignment].map(([cell, provinceId]) => ({cell, provinceId}));

  while (frontier.length) {
    const candidates = new Map();
    for (const item of frontier) {
      for (const neighbor of cells.c?.[item.cell] || []) {
        if (!allowed.has(neighbor) || assignment.has(neighbor)) continue;
        const previous = candidates.get(neighbor);
        if (previous === undefined || item.provinceId < previous) candidates.set(neighbor, item.provinceId);
      }
    }
    if (!candidates.size) break;
    frontier = [...candidates].sort((a, b) => a[0] - b[0]).map(([cell, provinceId]) => ({cell, provinceId}));
    for (const item of frontier) assignment.set(item.cell, item.provinceId);
  }
  if (assignment.size !== allowed.size) throw new Error("局部重新分省无法覆盖全部国家陆地");
  return assignment;
}

function synchronizeGridProvinces(map, stateIds) {
  const countsByGrid = new Map();
  for (const packCell of landPackCells(map)) {
    const stateId = numberId(map.pack.cells.state[packCell]);
    if (!stateIds.has(stateId)) continue;
    const gridCell = numberId(map.pack.cells.g?.[packCell]);
    const provinceId = numberId(map.pack.cells.province?.[packCell]);
    if (!Number.isInteger(gridCell) || !provinceId) continue;
    const counts = countsByGrid.get(gridCell) || new Map();
    counts.set(provinceId, (counts.get(provinceId) || 0) + 1);
    countsByGrid.set(gridCell, counts);
  }
  for (const gridCell of landGridCells(map)) {
    if (!stateIds.has(numberId(map.grid.cells.state[gridCell]))) continue;
    const counts = countsByGrid.get(gridCell);
    const provinceId = counts
      ? [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] || 0
      : 0;
    map.grid.cells.province[gridCell] = provinceId;
  }
}

function synchronizeCityProvinces(map, stateIds) {
  for (const city of activeCities(map)) {
    if (!stateIds.has(numberId(city.state))) continue;
    const provinceId = numberId(map.pack.cells.province?.[cityPackCell(city)] ?? map.grid.cells.province?.[city.cell]);
    replaceCity(map, city, {...city, province: provinceId, provincial: false, group: city.capital ? "capital" : ordinaryCityGroup(city)});
    const burg = findBurgForCity(map, city);
    if (burg) replaceBurg(map, burg, {...burg, province: provinceId, group: city.capital ? "capital" : ordinaryCityGroup(city)});
  }
}

function buildProvinceRecord(map, stateId, provinceId, centerCity, centerCell, cells, preservedName = null) {
  const state = readState(map, stateId);
  const name = String(preservedName?.name || centerCity?.name || `新省${provinceId}`);
  const formName = String(preservedName?.formName || provinceFormForState(state, map?.society?.cultures || map?.pack?.cultures) || "州");
  const fullName = String(preservedName?.fullName || `${name}${formName}`);
  const area = roundValue(cells.reduce((sum, cell) => sum + Number(map.pack.cells.area?.[cell] || 0), 0), 2);
  const provinceCities = activeCities(map).filter(city => cells.includes(cityPackCell(city)));
  const urban = roundValue(provinceCities.reduce((sum, city) => sum + Number(city.population || 0), 0), 2);
  const rural = roundValue(cells.reduce((sum, cell) => sum + Number(map.pack.cells.pop?.[cell] || 0), 0), 2);
  return {
    id: provinceId,
    i: provinceId,
    state: stateId,
    center: centerCell,
    gridCenter: numberId(map.pack.cells.g?.[centerCell] ?? centerCity?.cell),
    burg: numberId(centerCity?.burgId),
    name,
    formName,
    fullName,
    color: deterministicColor(`${map?.options?.seed}:province:${provinceId}:${stateId}`),
    cells: cells.length,
    area,
    pole: clonePoint(map.pack.cells.p?.[centerCell]),
    neighbors: [],
    burgs: provinceCities.length,
    rural,
    urban,
    religion: numberId(map.pack.cells.religion?.[centerCell] ?? state?.religion)
  };
}

function provinceNameSnapshot(province) {
  return {
    id: numberId(province?.i ?? province?.id),
    center: numberId(province?.center),
    burg: numberId(province?.burg),
    name: String(province?.name || ""),
    formName: String(province?.formName || ""),
    fullName: String(province?.fullName || province?.name || "")
  };
}

function refreshProvinceNeighbors(map, newProvinceIds, oldProvinceIds = []) {
  const newSet = new Set(newProvinceIds);
  const oldSet = new Set(oldProvinceIds);
  const neighborSets = new Map(newProvinceIds.map(id => [id, new Set()]));
  const externalUpdates = new Map();
  for (const cell of landPackCells(map)) {
    const provinceId = numberId(map.pack.cells.province?.[cell]);
    if (!newSet.has(provinceId)) continue;
    for (const neighbor of map.pack.cells.c?.[cell] || []) {
      if (map.pack.cells.h?.[neighbor] < 20) continue;
      const otherId = numberId(map.pack.cells.province?.[neighbor]);
      if (!otherId || otherId === provinceId) continue;
      neighborSets.get(provinceId)?.add(otherId);
      if (!newSet.has(otherId)) {
        const set = externalUpdates.get(otherId) || new Set((readProvince(map, otherId)?.neighbors || []).filter(id => !newSet.has(numberId(id)) && !oldSet.has(numberId(id))));
        set.add(provinceId);
        externalUpdates.set(otherId, set);
      }
    }
  }
  for (const id of newProvinceIds) {
    const province = clonePlain(readProvince(map, id));
    province.neighbors = [...neighborSets.get(id)].sort(ascending);
    writeMirroredPoliticalItem(map, "provinces", id, province);
  }
  for (const [id, neighbors] of externalUpdates) {
    const province = readProvince(map, id);
    if (!province || province.removed) continue;
    writeMirroredPoliticalItem(map, "provinces", id, {...clonePlain(province), neighbors: [...neighbors].sort(ascending)});
  }
}

function refreshPoliticalTopology(map, plan) {
  const activeStateIds = new Set(activeStates(map).map(state => stateId(state)));
  const stateNeighbors = new Map([...activeStateIds].map(id => [id, new Set()]));
  for (const cell of landPackCells(map)) {
    const current = numberId(map.pack.cells.state[cell]);
    if (!activeStateIds.has(current)) continue;
    for (const neighbor of map.pack.cells.c?.[cell] || []) {
      if (map.pack.cells.h?.[neighbor] < 20) continue;
      const other = numberId(map.pack.cells.state[neighbor]);
      if (activeStateIds.has(other) && other !== current) stateNeighbors.get(current).add(other);
    }
  }

  for (const stateIdValue of plan.resultStateIds) {
    const state = readState(map, stateIdValue);
    const ownedCells = landPackCells(map).filter(cell => numberId(map.pack.cells.state[cell]) === stateIdValue);
    const cities = activeCities(map).filter(city => numberId(city.state) === stateIdValue);
    const provinces = activeProvinces(map).filter(province => numberId(province.state) === stateIdValue).map(provinceId).sort(ascending);
    assignMirroredPoliticalFields(map, "states", stateIdValue, {
      cells: ownedCells.length,
      area: roundValue(ownedCells.reduce((sum, cell) => sum + Number(map.pack.cells.area?.[cell] || 0), 0), 2),
      burgs: cities.length,
      rural: roundValue(ownedCells.reduce((sum, cell) => sum + Number(map.pack.cells.pop?.[cell] || 0), 0), 2),
      urban: roundValue(cities.reduce((sum, city) => sum + Number(city.population || 0), 0), 2),
      provinces,
      neighbors: [...stateNeighbors.get(stateIdValue)].sort(ascending),
      pole: clonePoint(map.pack.cells.p?.[state.center] || map.grid.cells.p?.[state.gridCenter])
    });
  }
  for (const stateIdValue of plan.boundaryStateIds || []) {
    if (!activeStateIds.has(stateIdValue) || plan.resultStateIds.includes(stateIdValue)) continue;
    assignMirroredPoliticalFields(map, "states", stateIdValue, {
      neighbors: [...(stateNeighbors.get(stateIdValue) || [])].sort(ascending)
    });
  }
  refreshPoliticsMetadata(map);
  refreshSettlementMetadata(map);
}

function synchronizeDiplomacy(map, plan) {
  const states = readStateArray(map);
  const size = Math.max(states.length, ...(plan.resultStateIds || []).map(id => id + 1));
  const activeIds = new Set(activeStates(map).map(stateId));
  const chronicleEntry = plan.operation === "merge"
    ? ["国家合并", `国家 #${plan.victimStateId} 并入国家 #${plan.survivorStateId}；涉及前国家的活动战争已终止。`]
    : ["国家拆分", `国家 #${plan.newStateId} 从国家 #${plan.sourceStateId} 拆出，初始外交关系为中立。`];

  for (const state of states) {
    if (!state || state.removed || !stateId(state)) continue;
    const id = stateId(state);
    const diplomacy = normalizeDiplomacyArray(state.diplomacy, size, id);
    let campaigns = clonePlain(state.campaigns || []);
    if (plan.operation === "merge") {
      if (id === plan.victimStateId) continue;
      diplomacy[plan.victimStateId] = "x";
      if (id === plan.survivorStateId) diplomacy[plan.victimStateId] = "x";
      else {
        const survivor = readState(map, plan.survivorStateId);
        diplomacy[plan.survivorStateId] = inverseDiplomacy(survivor?.diplomacy?.[id] || "Neutral");
      }
      campaigns = closeCampaignsForState(campaigns, plan.victimStateId);
    } else {
      diplomacy[plan.newStateId] = id === plan.newStateId ? "x" : "Neutral";
      if (id === plan.newStateId) {
        for (const otherId of activeIds) diplomacy[otherId] = otherId === id ? "x" : "Neutral";
        campaigns = [];
      }
    }
    const summaryState = {i: id, diplomacy};
    assignMirroredPoliticalFields(map, "states", id, {
      diplomacy,
      campaigns,
      diplomacySummary: summarizeStateDiplomacy(summaryState, activeIds)
    });
  }

  const diplomacy = clonePlain(map?.diplomacy || map?.pack?.diplomacy || {relations: {}, chronicle: [], metadata: {}});
  diplomacy.chronicle = [...(diplomacy.chronicle || []), chronicleEntry];
  diplomacy.metadata = summarizeDiplomacyMetadata(map, diplomacy);
  writeMirroredRoot(map, "diplomacy", diplomacy);
  const zero = readState(map, 0);
  if (zero) assignMirroredPoliticalFields(map, "states", 0, {diplomacy: diplomacy.chronicle});
}

function synchronizeMilitary(map, plan) {
  const affectedStateIds = new Set(plan.operation === "merge"
    ? [plan.survivorStateId, plan.victimStateId]
    : [plan.sourceStateId, plan.newStateId]);
  const sourceRegiments = [];
  for (const stateIdValue of affectedStateIds) {
    const state = readState(map, stateIdValue);
    for (const regiment of state?.military || []) {
      sourceRegiments.push({oldStateId: numberId(regiment.state ?? stateIdValue), oldRegimentId: numberId(regiment.i), regiment: clonePlain(regiment)});
    }
  }

  const grouped = new Map(plan.resultStateIds.map(id => [id, []]));
  const frozenAssignments = new Map((plan.militaryAssignments || []).map(item => [`${item.oldStateId}:${item.oldRegimentId}`, item.ownerStateId]));
  for (const item of sourceRegiments) {
    const key = `${item.oldStateId}:${item.oldRegimentId}`;
    const owner = plan.operation === "merge" ? plan.survivorStateId : frozenAssignments.get(key);
    if (!plan.resultStateIds.includes(owner)) throw new Error(`冻结计划缺少军团 ${key} 的拆分后归属`);
    grouped.get(owner)?.push(item);
  }

  const regimentMapping = new Map();
  const prepared = new Map();
  for (const stateIdValue of plan.resultStateIds) {
    const items = (grouped.get(stateIdValue) || []).sort((a, b) => a.oldStateId - b.oldStateId || a.oldRegimentId - b.oldRegimentId);
    prepared.set(stateIdValue, items);
    items.forEach((item, index) => {
      const nextId = `${stateIdValue}:${index}`;
      regimentMapping.set(`${item.oldStateId}:${item.oldRegimentId}`, {stateId: stateIdValue, regimentId: index, id: nextId});
    });
  }
  const stateMapping = plan.operation === "merge" ? new Map([[plan.victimStateId, plan.survivorStateId]]) : new Map();
  for (const stateIdValue of plan.resultStateIds) {
    const state = readState(map, stateIdValue);
    const military = (prepared.get(stateIdValue) || []).map((item, index) => {
      const remapped = remapMilitaryReferences(item.regiment, regimentMapping, stateMapping);
      return remapMilitaryRegiment(remapped, stateIdValue, index);
    });
    assignMirroredPoliticalFields(map, "states", stateIdValue, {
      military,
      ...(state?.militaryPolicy ? {militaryPolicy: {...clonePlain(state.militaryPolicy), state: stateIdValue, generatedTroops: sumRegimentTroops(military)}} : {}),
      ...(state?.militaryDiagnostics ? {militaryDiagnostics: {...clonePlain(state.militaryDiagnostics), state: stateIdValue, regiments: military.length, generatedTroops: sumRegimentTroops(military)}} : {})
    });
  }
  if (plan.operation === "merge") {
    assignMirroredPoliticalFields(map, "states", plan.victimStateId, {military: []});
  }

  const military = clonePlain(map?.military || map?.pack?.military || {campaigns: [], fronts: [], events: [], metadata: {}});
  const remapped = remapMilitaryReferences(military, regimentMapping, stateMapping);
  if (plan.operation === "merge") {
    remapped.campaigns = closeMilitaryCampaigns(remapped.campaigns, plan.victimStateId);
    remapped.fronts = closeMilitaryCampaigns(remapped.fronts, plan.victimStateId);
  }
  remapped.metadata = refreshMilitaryMetadata(map, remapped);
  writeMirroredRoot(map, "military", remapped);
  return {
    changedRegimentIds: new Set([...regimentMapping.entries()]
      .filter(([oldId, mapping]) => oldId !== mapping.id)
      .map(([oldId]) => oldId)),
    transferredRegimentIds: new Set([...regimentMapping.entries()]
      .filter(([oldId, mapping]) => numberId(oldId.split(":")[0]) !== mapping.stateId)
      .map(([, mapping]) => mapping.id))
  };
}

function remapMilitaryRegiment(regiment, stateIdValue, regimentId) {
  const next = {...regiment, state: stateIdValue, i: regimentId, id: `${stateIdValue}:${regimentId}`};
  if (next.order?.targetCell !== undefined) next.order = clonePlain(next.order);
  return next;
}

function remapMilitaryReferences(value, regimentMapping, stateMapping) {
  if (Array.isArray(value)) return value.map(item => remapMilitaryReferences(item, regimentMapping, stateMapping));
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && regimentMapping.has(value)) return regimentMapping.get(value).id;
    return value;
  }
  const next = {};
  for (const [key, item] of Object.entries(value)) next[key] = remapMilitaryReferences(item, regimentMapping, stateMapping);
  remapMilitaryReferencePair(next, value, regimentMapping, "stateId", "regimentId", ["id", "regimentObjectId", "targetId"]);
  remapMilitaryReferencePair(next, value, regimentMapping, "state", "i", ["id"]);
  remapMilitaryReferencePair(next, value, regimentMapping, "opponentStateId", "opponentRegimentId", ["opponentRegimentObjectId"]);
  remapMilitaryReferencePair(next, value, regimentMapping, "attackerStateId", "attackerRegimentId", ["attackerRegimentObjectId"]);
  remapMilitaryReferencePair(next, value, regimentMapping, "defenderStateId", "defenderRegimentId", ["defenderRegimentObjectId"]);
  for (const key of ["attackerStateId", "defenderStateId", "attacker", "defender", "fromState", "toState", "stateId"]) {
    const old = optionalInteger(value[key]);
    if (old !== null && stateMapping.has(old)) next[key] = stateMapping.get(old);
  }
  if (isBattleEvent(value)) {
    for (const key of ["id", "chainKey"]) {
      if (typeof value[key] === "string") next[key] = remapRegimentTokens(value[key], regimentMapping);
    }
    const owner = militaryReferenceMapping(value, regimentMapping, "stateId", "regimentId", "regimentObjectId");
    if (owner && value.chainSide === "attacker") next.attackerStateId = owner.stateId;
    if (owner && value.chainSide === "defender") next.defenderStateId = owner.stateId;
    const opponent = militaryReferenceMapping(value, regimentMapping, "opponentStateId", "opponentRegimentId", "opponentRegimentObjectId");
    if (opponent) next.opponentStateId = opponent.stateId;
  }
  return next;
}

function isBattleEvent(value) {
  return value?.kind === "battle"
    || (Number.isInteger(Number(value?.sequence)) && typeof value?.chainKey === "string" && typeof value?.regimentObjectId === "string");
}

function remapRegimentTokens(value, regimentMapping) {
  return value.replace(/\d+:\d+/gu, oldId => regimentMapping.get(oldId)?.id || oldId);
}

function militaryReferenceMapping(source, mappingByOldId, stateKey, regimentKey, objectIdKey) {
  const stateIdValue = optionalInteger(source[stateKey]);
  const regimentId = optionalInteger(source[regimentKey]);
  if (stateIdValue !== null && regimentId !== null) {
    const mapping = mappingByOldId.get(`${stateIdValue}:${regimentId}`);
    if (mapping) return mapping;
  }
  return typeof source[objectIdKey] === "string" ? mappingByOldId.get(source[objectIdKey]) || null : null;
}

function remapMilitaryReferencePair(next, source, mappingByOldId, stateKey, regimentKey, objectIdKeys) {
  const stateIdValue = optionalInteger(source[stateKey]);
  const regimentId = optionalInteger(source[regimentKey]);
  if (stateIdValue === null || regimentId === null) return;
  const mapping = mappingByOldId.get(`${stateIdValue}:${regimentId}`);
  if (!mapping) return;
  next[stateKey] = mapping.stateId;
  next[regimentKey] = mapping.regimentId;
  for (const key of objectIdKeys) {
    if (typeof source[key] === "string" && /^\d+:\d+$/u.test(source[key])) next[key] = mapping.id;
  }
}

function synchronizeMarkets(map) {
  const packMarkets = map?.pack?.markets;
  const economyMarkets = map?.economy?.markets;
  const length = Math.max(packMarkets?.length || 0, economyMarkets?.length || 0);
  for (let index = 0; index < length; index++) {
    const market = packMarkets?.[index] || economyMarkets?.[index];
    if (!market) continue;
    const burg = map.pack?.burgs?.[market.centerBurgId];
    const state = numberId(burg?.state);
    if (packMarkets?.[index] && numberId(packMarkets[index].state) !== state) packMarkets[index] = {...clonePlain(packMarkets[index]), state};
    if (economyMarkets?.[index] && economyMarkets !== packMarkets && numberId(economyMarkets[index].state) !== state) {
      economyMarkets[index] = {...clonePlain(economyMarkets[index]), state};
    }
  }
}

function synchronizeRoutes(map) {
  const routes = map?.settlements?.routes;
  if (!Array.isArray(routes)) return;
  for (let index = 0; index < routes.length; index++) {
    const route = routes[index];
    if (!route) continue;
    const fromCity = findCity(map, route.from);
    const anchorCell = fromCity ? cityPackCell(fromCity) : (route.packCells || []).find(cell => map.pack.cells.h?.[cell] >= 20);
    const state = fromCity ? numberId(fromCity.state) : numberId(map.pack.cells.state?.[anchorCell]);
    const province = fromCity ? numberId(fromCity.province) : numberId(map.pack.cells.province?.[anchorCell]);
    if (numberId(route.state) !== state || numberId(route.province) !== province) routes[index] = {...clonePlain(route), state, province};
    const id = numberId(route.id);
    if (!Number.isInteger(id) || !map?.pack) continue;
    if (!Array.isArray(map.pack.routes)) map.pack.routes = [];
    const packRoute = map.pack.routes[id];
    if (packRoute) map.pack.routes[id] = {...clonePlain(packRoute), state, province};
    else {
      map.pack.routes[id] = {
        i: id,
        group: route.type === "road" ? "roads" : route.type === "trail" ? "trails" : "searoutes",
        feature: route.feature,
        state,
        province,
        resourceCells: route.resourceCells || 0,
        markerResourceCells: route.markerResourceCells || 0,
        points: (route.points || []).map((point, pointIndex) => [point[0], point[1], route.packCells?.[pointIndex]])
      };
    }
  }
}

function synchronizeTopologyMetadata(map, plan) {
  if (!map.metadata || typeof map.metadata !== "object") map.metadata = {};
  const stale = map.metadata.derivedStale && typeof map.metadata.derivedStale === "object" ? map.metadata.derivedStale : {};
  map.metadata.derivedStale = {
    ...stale,
    systems: [...new Set([...(stale.systems || []), ...STALE_SYSTEMS])],
    reason: "state-topology",
    updatedAt: plan.transactionTimestamp
  };
}

function validateTopologyResult(map, plan, provinceResult, militaryResult) {
  const errors = [];
  if (plan.operation === "merge") {
    if (landPackCells(map).some(cell => numberId(map.pack.cells.state[cell]) === plan.victimStateId)) errors.push("pack cells 残留被合并国家");
    if (landGridCells(map).some(cell => numberId(map.grid.cells.state[cell]) === plan.victimStateId)) errors.push("grid cells 残留被合并国家");
    if (!readState(map, plan.victimStateId)?.removed) errors.push("被合并国家未墓碑化");
  }
  for (const stateIdValue of plan.resultStateIds) {
    const cells = landPackCells(map).filter(cell => numberId(map.pack.cells.state[cell]) === stateIdValue);
    if (!isConnectedCellSet(map.pack.cells, cells)) errors.push(`国家 #${stateIdValue} 陆地不连通`);
    const state = readState(map, stateIdValue);
    const capital = findCityByBurgId(map, state?.capital);
    if (!capital || numberId(capital.state) !== stateIdValue || !capital.capital) errors.push(`国家 #${stateIdValue} 首都不同步`);
  }
  for (const provinceIdValue of provinceResult.newProvinceIds) {
    if (provinceIdValue > MAX_PROVINCE_ID) errors.push(`省份 #${provinceIdValue} 超过 Uint16 上限`);
    const province = readProvince(map, provinceIdValue);
    const cells = landPackCells(map).filter(cell => numberId(map.pack.cells.province?.[cell]) === provinceIdValue);
    if (!province || province.removed || !cells.length) errors.push(`省份 #${provinceIdValue} 缺少有效档案或领土`);
    else {
      if (!isConnectedCellSet(map.pack.cells, cells)) errors.push(`省份 #${provinceIdValue} 不连通`);
      if (!cells.includes(numberId(province.center))) errors.push(`省份 #${provinceIdValue} 不包含省会`);
    }
  }
  const affectedStateSet = new Set(plan.resultStateIds);
  for (const cell of landPackCells(map)) {
    if (affectedStateSet.has(numberId(map.pack.cells.state[cell])) && !numberId(map.pack.cells.province?.[cell])) errors.push(`pack cell #${cell} 未分省`);
  }
  for (const city of activeCities(map)) {
    if (!affectedStateSet.has(numberId(city.state))) continue;
    const cell = cityPackCell(city);
    if (numberId(city.province) !== numberId(map.pack.cells.province?.[cell])) errors.push(`城市 #${city.id} 省份不同步`);
  }
  validateMirrorItems(map, "states", [...new Set([...(plan.selectedStateIds || []), ...(plan.resultStateIds || [])])], errors);
  validateMirrorItems(map, "provinces", [...plan.affectedOldProvinceIds, ...provinceResult.newProvinceIds], errors);
  for (const stateIdValue of plan.resultStateIds) {
    const regiments = readState(map, stateIdValue)?.military || [];
    for (let index = 0; index < regiments.length; index++) {
      if (regiments[index]?.i !== index || regiments[index]?.id !== `${stateIdValue}:${index}` || regiments[index]?.state !== stateIdValue) {
        errors.push(`国家 #${stateIdValue} 军团编号链不一致`);
        break;
      }
    }
  }
  const validRegimentIds = new Set(activeStates(map).flatMap(state => (state.military || []).map(regiment => regiment.id || `${stateId(state)}:${regiment.i}`)));
  const danglingMilitary = [];
  for (const stateIdValue of plan.resultStateIds) collectDanglingMilitaryReferences(readState(map, stateIdValue)?.military || [], validRegimentIds, danglingMilitary, `state:${stateIdValue}:military`);
  collectDanglingMilitaryReferences(map?.military || map?.pack?.military, validRegimentIds, danglingMilitary, "military");
  if (danglingMilitary.length) errors.push(`军团引用悬空：${danglingMilitary.slice(0, 3).join("、")}`);
  const activeStateIds = new Set(activeStates(map).map(state => stateId(state)));
  const militaryEventErrors = [];
  for (const stateIdValue of plan.resultStateIds) {
    const regiments = readState(map, stateIdValue)?.military || [];
    for (const regiment of regiments) {
      collectMilitaryEventIntegrity(regiment?.events, activeStateIds, militaryResult, militaryEventErrors, `state:${stateIdValue}:military:${regiment.i}:events`);
    }
  }
  collectMilitaryEventIntegrity((map?.military || map?.pack?.military)?.events, activeStateIds, militaryResult, militaryEventErrors, "military.events");
  if (militaryEventErrors.length) errors.push(`军团活动链无效：${militaryEventErrors.slice(0, 3).join("、")}`);
  return {valid: errors.length === 0, errors};
}

function collectMilitaryEventIntegrity(events, activeStateIds, militaryResult, errors, path) {
  if (!Array.isArray(events)) return;
  events.forEach((event, index) => {
    if (!event || typeof event !== "object") return;
    const eventPath = `${path}[${index}]`;
    for (const key of ["stateId", "opponentStateId", "attackerStateId", "defenderStateId"]) {
      const stateIdValue = optionalInteger(event[key]);
      if (stateIdValue !== null && stateIdValue > 0 && !activeStateIds.has(stateIdValue)) errors.push(`${eventPath}.${key}=${stateIdValue}`);
    }
    for (const key of ["id", "chainKey"]) {
      if (typeof event[key] !== "string") continue;
      const staleId = event[key].match(/\d+:\d+/gu)?.find(id => militaryResult?.changedRegimentIds?.has(id));
      if (staleId) errors.push(`${eventPath}.${key}=${staleId}`);
    }
    const regimentObjectId = typeof event.regimentObjectId === "string"
      ? event.regimentObjectId
      : optionalInteger(event.stateId) !== null && optionalInteger(event.regimentId) !== null
        ? `${optionalInteger(event.stateId)}:${optionalInteger(event.regimentId)}`
        : null;
    if (!militaryResult?.transferredRegimentIds?.has(regimentObjectId)) return;
    if (event.chainSide === "attacker" && optionalInteger(event.attackerStateId) !== optionalInteger(event.stateId)) {
      errors.push(`${eventPath}.attackerStateId!=stateId`);
    }
    if (event.chainSide === "defender" && optionalInteger(event.defenderStateId) !== optionalInteger(event.stateId)) {
      errors.push(`${eventPath}.defenderStateId!=stateId`);
    }
  });
}

function collectDanglingMilitaryReferences(value, validIds, errors, path) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectDanglingMilitaryReferences(item, validIds, errors, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [stateKey, regimentKey] of [
    ["stateId", "regimentId"],
    ["state", "i"],
    ["opponentStateId", "opponentRegimentId"],
    ["attackerStateId", "attackerRegimentId"],
    ["defenderStateId", "defenderRegimentId"]
  ]) {
    const stateIdValue = optionalInteger(value[stateKey]);
    const regimentId = optionalInteger(value[regimentKey]);
    if (stateIdValue === null || regimentId === null) continue;
    const id = `${stateIdValue}:${regimentId}`;
    if (!validIds.has(id)) errors.push(`${path}.${stateKey}/${regimentKey}=${id}`);
  }
  for (const key of ["regimentObjectId", "targetId", "opponentRegimentObjectId", "attackerRegimentObjectId", "defenderRegimentObjectId"]) {
    const id = value[key];
    if (typeof id === "string" && /^\d+:\d+$/u.test(id) && !validIds.has(id)) errors.push(`${path}.${key}=${id}`);
  }
  for (const [key, item] of Object.entries(value)) collectDanglingMilitaryReferences(item, validIds, errors, `${path}.${key}`);
}

function captureTopologySnapshot(map) {
  return {
    gridState: cloneTypedArray(map?.grid?.cells?.state),
    gridProvince: cloneTypedArray(map?.grid?.cells?.province),
    packState: cloneTypedArray(map?.pack?.cells?.state),
    packProvince: cloneTypedArray(map?.pack?.cells?.province),
    politicsStates: snapshotArray(map?.politics?.states),
    packStates: map?.pack?.states === map?.politics?.states ? null : snapshotArray(map?.pack?.states),
    politicsStateValues: snapshotObjectValues(map?.politics?.states),
    packStateValues: map?.pack?.states === map?.politics?.states ? null : snapshotObjectValues(map?.pack?.states),
    politicsProvinces: snapshotArray(map?.politics?.provinces),
    packProvinces: map?.pack?.provinces === map?.politics?.provinces ? null : snapshotArray(map?.pack?.provinces),
    cities: snapshotArray(map?.settlements?.cities),
    burgs: snapshotArray(map?.pack?.burgs),
    routes: snapshotArray(map?.settlements?.routes),
    packRoutes: snapshotArray(map?.pack?.routes),
    packRoutesPresent: Array.isArray(map?.pack?.routes),
    packMarkets: snapshotArray(map?.pack?.markets),
    economyMarkets: map?.economy?.markets === map?.pack?.markets ? null : snapshotArray(map?.economy?.markets),
    diplomacy: map?.diplomacy,
    packDiplomacy: map?.pack?.diplomacy,
    military: map?.military,
    packMilitary: map?.pack?.military,
    derivedStale: clonePlain(map?.metadata?.derivedStale),
    politicsMetadata: clonePlain(map?.politics?.metadata),
    packPoliticsMetadata: clonePlain(map?.pack?.politicsMetadata),
    settlementMetadata: clonePlain(map?.settlements?.metadata)
  };
}

function restoreTopologySnapshot(map, snapshot) {
  if (!map || !snapshot) return;
  restoreTypedArray(map?.grid?.cells?.state, snapshot.gridState);
  restoreTypedArray(map?.grid?.cells?.province, snapshot.gridProvince);
  restoreTypedArray(map?.pack?.cells?.state, snapshot.packState);
  restoreTypedArray(map?.pack?.cells?.province, snapshot.packProvince);
  restoreArray(map?.politics?.states, snapshot.politicsStates);
  if (snapshot.packStates) restoreArray(map?.pack?.states, snapshot.packStates);
  restoreObjectValues(snapshot.politicsStateValues);
  restoreObjectValues(snapshot.packStateValues);
  restoreArray(map?.politics?.provinces, snapshot.politicsProvinces);
  if (snapshot.packProvinces) restoreArray(map?.pack?.provinces, snapshot.packProvinces);
  restoreArray(map?.settlements?.cities, snapshot.cities);
  restoreArray(map?.pack?.burgs, snapshot.burgs);
  restoreArray(map?.settlements?.routes, snapshot.routes);
  if (snapshot.packRoutesPresent) restoreArray(map?.pack?.routes, snapshot.packRoutes);
  else if (map?.pack) delete map.pack.routes;
  restoreArray(map?.pack?.markets, snapshot.packMarkets);
  if (snapshot.economyMarkets) restoreArray(map?.economy?.markets, snapshot.economyMarkets);
  if (map) map.diplomacy = snapshot.diplomacy;
  if (map?.pack) map.pack.diplomacy = snapshot.packDiplomacy;
  if (map) map.military = snapshot.military;
  if (map?.pack) map.pack.military = snapshot.packMilitary;
  if (map?.metadata) map.metadata.derivedStale = clonePlain(snapshot.derivedStale);
  if (map?.politics) map.politics.metadata = clonePlain(snapshot.politicsMetadata);
  if (map?.pack) map.pack.politicsMetadata = clonePlain(snapshot.packPoliticsMetadata);
  if (map?.settlements) map.settlements.metadata = clonePlain(snapshot.settlementMetadata);
}

function setStateCapital(map, stateIdValue, cityId) {
  const city = findCity(map, cityId);
  if (!city || numberId(city.state) !== stateIdValue) throw new Error(`国家 #${stateIdValue} 的首都城市无效`);
  const burg = findBurgForCity(map, city);
  if (!burg) throw new Error(`首都城市 #${cityId} 缺少 burg 镜像`);
  for (const other of activeCities(map)) {
    if (numberId(other.state) !== stateIdValue || numberId(other.id) === numberId(city.id) || !other.capital) continue;
    replaceCity(map, other, {...other, capital: false, group: ordinaryCityGroup(other)});
    const otherBurg = findBurgForCity(map, other);
    if (otherBurg) replaceBurg(map, otherBurg, {...otherBurg, capital: 0, group: ordinaryCityGroup(other)});
  }
  replaceCity(map, city, {...city, capital: true, group: "capital"});
  replaceBurg(map, burg, {...burg, capital: 1, group: "capital"});
  const state = readState(map, stateIdValue);
  assignMirroredPoliticalFields(map, "states", stateIdValue, {
    capital: numberId(city.burgId),
    capitalName: city.name || burg.name || "",
    center: cityPackCell(city),
    gridCenter: numberId(city.cell ?? map.pack.cells.g?.[cityPackCell(city)]),
    religion: numberId(map.pack.cells.religion?.[cityPackCell(city)] ?? city.religion ?? state?.religion)
  });
}

function setCityProvincial(map, cityId, value) {
  const city = findCity(map, cityId);
  if (!city) return;
  replaceCity(map, city, {...city, provincial: Boolean(value), group: city.capital ? "capital" : value ? "town" : ordinaryCityGroup(city)});
  const burg = findBurgForCity(map, city);
  if (burg) replaceBurg(map, burg, {...burg, group: city.capital ? "capital" : value ? "town" : ordinaryCityGroup(city)});
}

function rankCapitalCandidates(map, cities) {
  return cities.map(city => ({
    cityId: numberId(city.id),
    burgId: numberId(city.burgId),
    provincial: Boolean(city.provincial),
    population: Number(city.population || 0),
    suitability: Number(packCellSuitability(map, cityPackCell(city))),
    port: Boolean(city.port)
  })).sort(compareCapitalEvidence).map((item, index) => ({...item, rank: index + 1}));
}

function compareCapitalEvidence(a, b) {
  return Number(b.provincial) - Number(a.provincial)
    || b.population - a.population
    || b.suitability - a.suitability
    || Number(b.port) - Number(a.port)
    || a.burgId - b.burgId
    || a.cityId - b.cityId;
}

function inspectSplitMilitaryAssignments(map, sourceStateId, newStateId, selectedCells, remainderCells) {
  const assignments = [];
  const unresolved = [];
  for (const regiment of readState(map, sourceStateId)?.military || []) {
    const currentCell = optionalInteger(regiment.cell);
    const baseCell = optionalInteger(regiment.baseCell ?? regiment.bcell);
    const currentOwner = splitCellOwner(map, currentCell, sourceStateId, newStateId, selectedCells, remainderCells);
    const baseOwner = splitCellOwner(map, baseCell, sourceStateId, newStateId, selectedCells, remainderCells);
    const ownerStateId = currentOwner || baseOwner;
    const oldRegimentId = numberId(regiment.i);
    const oldId = regiment.id || `${sourceStateId}:${oldRegimentId}`;
    if (!ownerStateId) {
      unresolved.push({oldId, oldStateId: sourceStateId, oldRegimentId, currentCell, baseCell});
      continue;
    }
    assignments.push({
      oldId,
      oldStateId: sourceStateId,
      oldRegimentId,
      ownerStateId,
      reason: currentOwner ? "current" : "base",
      currentCell,
      baseCell
    });
  }
  return {valid: unresolved.length === 0, assignments, unresolved};
}

function splitCellOwner(map, cell, sourceStateId, newStateId, selectedCells, remainderCells) {
  if (cell === null || map?.pack?.cells?.h?.[cell] < 20) return 0;
  if (selectedCells.has(cell)) return newStateId;
  if (remainderCells.has(cell)) return sourceStateId;
  return 0;
}

function refreshPoliticsMetadata(map) {
  const states = activeStates(map);
  const provinces = activeProvinces(map);
  const metadata = {
    ...(map?.politics?.metadata || map?.pack?.politicsMetadata || {}),
    states: states.length,
    provinces: provinces.length,
    stateCells: landPackCells(map).filter(cell => numberId(map.pack.cells.state[cell]) > 0).length,
    provinceCells: landPackCells(map).filter(cell => numberId(map.pack.cells.province?.[cell]) > 0).length
  };
  if (map?.politics) map.politics.metadata = clonePlain(metadata);
  if (map?.pack) map.pack.politicsMetadata = clonePlain(metadata);
}

function refreshSettlementMetadata(map) {
  if (!map?.settlements?.metadata) return;
  const cities = activeCities(map);
  map.settlements.metadata = {
    ...map.settlements.metadata,
    cities: cities.length,
    capitals: cities.filter(city => city.capital).length,
    provincialCapitals: cities.filter(city => city.provincial).length
  };
}

function normalizeDiplomacyArray(source, size, selfId) {
  const next = new Array(size).fill("x");
  for (let index = 0; index < Math.min(size, source?.length || 0); index++) next[index] = source[index];
  next[selfId] = "x";
  return next;
}

function closeCampaignsForState(campaigns, victimStateId) {
  return (campaigns || []).map(campaign => campaignInvolvesState(campaign, victimStateId)
    ? {...clonePlain(campaign), status: "closed", ended: true, endReason: "state-merged"}
    : clonePlain(campaign));
}

function closeMilitaryCampaigns(campaigns, victimStateId) {
  return (campaigns || []).map(campaign => campaignInvolvesState(campaign, victimStateId)
    ? {...clonePlain(campaign), status: "closed", ended: true, endReason: "state-merged"}
    : campaign);
}

function campaignInvolvesState(campaign, stateIdValue) {
  return [campaign?.attacker, campaign?.defender, campaign?.fromState, campaign?.toState, campaign?.state, campaign?.stateId]
    .some(value => numberId(value) === stateIdValue);
}

function summarizeStateDiplomacy(state, activeIds) {
  const counts = {};
  for (const id of activeIds) {
    if (id === stateId(state)) continue;
    const relation = state.diplomacy?.[id] || "Unknown";
    counts[relation] = (counts[relation] || 0) + 1;
  }
  return counts;
}

function summarizeDiplomacyMetadata(map, diplomacy) {
  const states = activeStates(map);
  const relationCounts = {};
  let pairs = 0;
  for (let left = 0; left < states.length; left++) {
    for (let right = left + 1; right < states.length; right++) {
      const relation = states[left].diplomacy?.[stateId(states[right])] || "Unknown";
      relationCounts[relation] = (relationCounts[relation] || 0) + 1;
      pairs++;
    }
  }
  return {
    ...(diplomacy.metadata || {}),
    states: states.length,
    pairs,
    relationCounts,
    allies: relationCounts.Ally || 0,
    rivals: relationCounts.Rival || 0,
    enemies: relationCounts.Enemy || 0,
    vassals: relationCounts.Vassal || 0,
    unknown: relationCounts.Unknown || 0,
    chronicle: diplomacy.chronicle?.length || 0
  };
}

function inverseDiplomacy(relation) {
  if (relation === "Vassal") return "Suzerain";
  if (relation === "Suzerain") return "Vassal";
  return relation;
}

function refreshMilitaryMetadata(map, military) {
  const states = activeStates(map);
  const regiments = states.flatMap(state => state.military || []);
  const statuses = {};
  for (const regiment of regiments) statuses[regiment.status || "unknown"] = (statuses[regiment.status || "unknown"] || 0) + 1;
  return {
    ...(military.metadata || {}),
    statesWithMilitary: states.filter(state => state.military?.length).length,
    regiments: regiments.length,
    troops: sumRegimentTroops(regiments),
    navalRegiments: regiments.filter(regiment => regiment.n).length,
    campaigns: (military.campaigns || []).filter(campaign => !campaign.ended).length,
    fronts: (military.fronts || []).filter(front => !front.ended).length,
    events: military.events?.length || military.metadata?.events || 0,
    statuses
  };
}

function sumRegimentTroops(regiments) {
  return roundValue((regiments || []).reduce((sum, regiment) => sum + Number(regiment.a || 0), 0), 0);
}

function writeMirroredPoliticalItem(map, key, id, value) {
  const politicsArray = map?.politics?.[key];
  const packArray = map?.pack?.[key];
  if (!Array.isArray(politicsArray) && !Array.isArray(packArray)) throw new Error(`地图缺少 ${key} 集合`);
  if (politicsArray === packArray) {
    politicsArray[id] = value;
    return;
  }
  const sharedObject = politicsArray?.[id] && politicsArray?.[id] === packArray?.[id];
  if (Array.isArray(politicsArray)) politicsArray[id] = value;
  if (Array.isArray(packArray)) packArray[id] = sharedObject ? value : clonePlain(value);
}

function assignMirroredPoliticalFields(map, key, id, fields) {
  const targets = [map?.politics?.[key]?.[id], map?.pack?.[key]?.[id]].filter((item, index, items) => item && items.indexOf(item) === index);
  if (!targets.length) throw new Error(`地图缺少 ${key} #${id}`);
  for (const target of targets) Object.assign(target, clonePlain(fields));
}

function writeMirroredRoot(map, key, value) {
  const shared = map?.[key] && map?.[key] === map?.pack?.[key];
  map[key] = value;
  if (map?.pack) map.pack[key] = shared ? value : clonePlain(value);
}

function validateMirrorItems(map, key, ids, errors) {
  const left = map?.politics?.[key];
  const right = map?.pack?.[key];
  if (!Array.isArray(left) || !Array.isArray(right)) return;
  for (const id of ids) {
    if (JSON.stringify(left[id]) !== JSON.stringify(right[id])) {
      errors.push(`${key} #${id} 的 politics/pack 镜像不一致`);
      break;
    }
  }
}

function readState(map, id) {
  return map?.politics?.states?.[id] || map?.pack?.states?.[id] || null;
}

function readProvince(map, id) {
  return map?.politics?.provinces?.[id] || map?.pack?.provinces?.[id] || null;
}

function readStateArray(map) {
  return map?.politics?.states || map?.pack?.states || [];
}

function activeStates(map) {
  return readStateArray(map).filter(isActiveState);
}

function activeProvinces(map) {
  return (map?.politics?.provinces || map?.pack?.provinces || []).filter(province => province && !province.removed && provinceId(province) > 0);
}

function activeCities(map) {
  return (map?.settlements?.cities || []).filter(city => city && !city.removed);
}

function isActiveState(state) {
  return Boolean(state && !state.removed && stateId(state) > 0);
}

function stateId(state) {
  return numberId(state?.i ?? state?.id);
}

function provinceId(province) {
  return numberId(province?.i ?? province?.id);
}

function findCity(map, cityId) {
  const id = optionalInteger(cityId);
  if (id === null) return null;
  return activeCities(map).find(city => numberId(city.id) === id) || null;
}

function findCityByBurgId(map, burgId) {
  const id = optionalInteger(burgId);
  if (id === null) return null;
  return activeCities(map).find(city => numberId(city.burgId) === id) || null;
}

function findBurgForCity(map, city) {
  if (!city) return null;
  return map?.pack?.burgs?.[numberId(city.burgId)] || (map?.pack?.burgs || []).find(burg => numberId(burg?.cityId) === numberId(city.id)) || null;
}

function replaceCity(map, city, next) {
  const index = (map?.settlements?.cities || []).indexOf(city);
  if (index >= 0) map.settlements.cities[index] = next;
}

function replaceBurg(map, burg, next) {
  const index = (map?.pack?.burgs || []).indexOf(burg);
  if (index >= 0) map.pack.burgs[index] = next;
}

function stateCapitalCityId(map, stateIdValue) {
  const state = readState(map, stateIdValue);
  const city = findCityByBurgId(map, state?.capital);
  return city ? numberId(city.id) : null;
}

function cityPackCell(city) {
  return optionalInteger(city?.packCell ?? city?.cell);
}

function cityInPackCells(city, cells) {
  return new Set(cells).has(cityPackCell(city));
}

function ordinaryCityGroup(city) {
  return city?.port ? "city" : "town";
}

function landPackCells(map) {
  return Array.from(map?.pack?.cells?.i || []).filter(cell => Number(map.pack.cells.h?.[cell] || 0) >= 20);
}

function landGridCells(map) {
  return Array.from(map?.grid?.cells?.i || []).filter(cell => Number(map.grid.cells.h?.[cell] || 0) >= 20);
}

function statesShareLandBoundary(map, left, right) {
  for (const cell of landPackCells(map)) {
    if (numberId(map.pack.cells.state[cell]) !== left) continue;
    if ((map.pack.cells.c?.[cell] || []).some(neighbor => map.pack.cells.h?.[neighbor] >= 20 && numberId(map.pack.cells.state[neighbor]) === right)) return true;
  }
  return false;
}

function collectTopologyCells(map, predicate) {
  return {
    gridCells: landGridCells(map).filter(cell => predicate(numberId(map.grid.cells.state[cell]))),
    packCells: landPackCells(map).filter(cell => predicate(numberId(map.pack.cells.state[cell])))
  };
}

function collectBoundaryStateIds(map, cells, excluded) {
  const boundary = new Set();
  const selected = new Set(cells);
  for (const cell of selected) {
    for (const neighbor of map?.pack?.cells?.c?.[cell] || []) {
      if (map.pack.cells.h?.[neighbor] < 20 || selected.has(neighbor)) continue;
      const stateIdValue = numberId(map.pack.cells.state?.[neighbor]);
      if (stateIdValue && !excluded.has(stateIdValue) && isActiveState(readState(map, stateIdValue))) boundary.add(stateIdValue);
    }
  }
  return [...boundary].sort(ascending);
}

function isConnectedCellSet(cells, input) {
  if (!input.length) return false;
  const allowed = new Set(input);
  const visited = new Set([input[0]]);
  const queue = [input[0]];
  for (let index = 0; index < queue.length; index++) {
    for (const neighbor of cells.c?.[queue[index]] || []) {
      if (!allowed.has(neighbor) || visited.has(neighbor)) continue;
      visited.add(neighbor);
      queue.push(neighbor);
    }
  }
  return visited.size === allowed.size;
}

function targetProvinceCount(cityCount, ratioValue) {
  const count = Math.max(0, Number(cityCount) || 0);
  if (count === 0) throw new Error("没有城市时不能重新分省");
  if (count === 1) return 1;
  const ratio = Math.max(0, Math.min(100, Number(ratioValue ?? 20)));
  return Math.max(2, Math.min(count, Math.ceil(count * ratio / 100)));
}

function nextPoliticalId(map, key) {
  const arrays = [map?.politics?.[key], map?.pack?.[key]].filter(Array.isArray);
  let max = 0;
  for (const items of arrays) {
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      max = Math.max(max, index, numberId(item?.i ?? item?.id));
    }
  }
  return max + 1;
}

function packCellSuitability(map, cell) {
  return Number(map?.pack?.cells?.s?.[cell] ?? map?.pack?.cells?.suitability?.[cell] ?? 0);
}

function deterministicSplitStateName(map, cityId, stateIdValue) {
  const city = findCity(map, cityId);
  const base = String(city?.name || `新国${stateIdValue}`).trim().replace(/(城|镇|州|郡)$/u, "");
  return base || `新国${stateIdValue}`;
}

function deterministicColor(key) {
  const hash = stableHash(key);
  const hue = hash % 360;
  const saturation = 48 + (hash >>> 9) % 24;
  const lightness = 62 + (hash >>> 17) % 14;
  return hslToHex(hue, saturation, lightness);
}

function deterministicStateCoa(map, stateIdValue, capital) {
  const field = deterministicColor(`${map?.options?.seed}:coa:field:${stateIdValue}:${capital?.culture || 0}`);
  const charge = deterministicColor(`${map?.options?.seed}:coa:charge:${stateIdValue}:${capital?.religion || 0}`);
  return {
    size: 1.25,
    x: roundValue(capital?.x || 0, 2),
    y: roundValue(capital?.y || 0, 2),
    shield: "round",
    tinctures: {field, charge},
    charges: [{charge: "star", tincture: charge}]
  };
}

function buildStateFullName(name, source) {
  return `${name}${source?.formName || source?.governmentLabel || "国"}`;
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r, g, b].map(value => Math.round((value + m) * 255).toString(16).padStart(2, "0")).join("")}`;
}

function validInspection(plan) {
  return {valid: true, code: "ok", ...plan};
}

function invalidInspection(code, summary, details = {}) {
  return {valid: false, code, summary, ...details};
}

function injectFault(options, stage, context = {}) {
  if (typeof options?.faultInjector === "function") options.faultInjector(stage, context);
  if (options?.faultAt === stage) throw new Error(`国家拓扑故障注入：${stage}`);
}

function normalizeStateName(value) {
  return typeof value === "string" ? value.trim() : "";
}

function numberId(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

function positiveInteger(value) {
  const number = optionalInteger(value);
  return number !== null && number > 0 ? number : null;
}

function nonNegativeInteger(value) {
  const number = optionalInteger(value);
  return number !== null && number >= 0 ? number : null;
}

function optionalInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function uniquePositiveIntegers(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(positiveInteger).filter(Boolean))];
}

function sequence(start, count) {
  return Array.from({length: count}, (_, index) => start + index);
}

function ascending(a, b) {
  return a - b;
}

function sameNumberArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function roundValue(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function clonePoint(value) {
  return Array.isArray(value) ? value.slice(0, 2).map(item => roundValue(item, 2)) : [0, 0];
}

function cloneTypedArray(value) {
  return value?.slice ? value.slice() : null;
}

function restoreTypedArray(target, snapshot) {
  if (!target || !snapshot) return;
  if (typeof target.set === "function") {
    target.set(snapshot);
    return;
  }
  if (Array.isArray(target)) {
    target.length = snapshot.length;
    for (let index = 0; index < snapshot.length; index++) target[index] = snapshot[index];
  }
}

function snapshotArray(value) {
  return Array.isArray(value) ? {length: value.length, items: value.slice()} : null;
}

function restoreArray(target, snapshot) {
  if (!Array.isArray(target) || !snapshot) return;
  target.length = snapshot.length;
  for (let index = 0; index < snapshot.length; index++) target[index] = snapshot.items[index];
}

function snapshotObjectValues(items) {
  return Array.isArray(items)
    ? items.filter(item => item && typeof item === "object").map(ref => ({ref, value: clonePlain(ref)}))
    : null;
}

function restoreObjectValues(snapshots) {
  for (const snapshot of snapshots || []) {
    for (const key of Object.keys(snapshot.ref)) delete snapshot.ref[key];
    Object.assign(snapshot.ref, clonePlain(snapshot.value));
  }
}

function clonePlain(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}
