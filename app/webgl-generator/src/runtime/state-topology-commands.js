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

export const POLITICAL_TRANSFER_ACTION = Object.freeze({
  TERRITORY_TRANSFER: "politics.transfer-territory",
  ENSURE_PROVINCE_ASSIGNMENT: "politics.ensure-province-assignment",
  PROVINCE_TRANSFER: "politics.transfer-province"
});

export function inspectPoliticalTransferTransaction(map, actionId, input = {}) {
  if (actionId === POLITICAL_TRANSFER_ACTION.TERRITORY_TRANSFER) return inspectTerritoryTransfer(map, input);
  if (actionId === POLITICAL_TRANSFER_ACTION.ENSURE_PROVINCE_ASSIGNMENT) return inspectEnsureProvinceAssignment(map, input);
  if (actionId === POLITICAL_TRANSFER_ACTION.PROVINCE_TRANSFER) return inspectProvinceTransfer(map, input);
  return normalizePoliticalInspection(invalidInspection("unknown-action", "未知的政治领土事务"));
}

export function inspectTerritoryTransfer(map, input = {}) {
  return normalizePoliticalInspection(inspectTerritoryTransferPlan(map, input));
}

function inspectTerritoryTransferPlan(map, input = {}) {
  const mode = String(input.mode || "").trim().toLowerCase();
  if (!["conquer", "cede", "neutralize"].includes(mode)) {
    return invalidInspection("invalid-transfer-mode", "领土转移 mode 必须是 conquer、cede 或 neutralize");
  }
  const sourceStateId = positiveInteger(input.sourceStateId);
  const source = readState(map, sourceStateId);
  if (!sourceStateId || !isActiveState(source)) return invalidInspection("source-state-not-found", "来源国家必须是未移除的有效国家");
  const targetStateId = mode === "neutralize" ? 0 : positiveInteger(input.targetStateId);
  if (mode !== "neutralize" && targetStateId === sourceStateId) {
    return invalidInspection("same-state", "来源国家与目标国家不能相同");
  }
  if (mode !== "neutralize" && (!targetStateId || !isActiveState(readState(map, targetStateId)))) {
    return invalidInspection("target-state-not-found", "目标国家必须是有效国家");
  }
  if (mode === "neutralize" && positiveInteger(input.targetStateId)) {
    return invalidInspection("invalid-transfer-mode", "中立化领土不能指定目标国家");
  }

  const selection = inspectExactTerritorySelection(map, sourceStateId, input.gridCellIds, {
    emptyCode: "territory-empty",
    mismatchCode: "cell-owner-mismatch"
  });
  if (!selection.valid) return selection;
  if (targetStateId && !selectionTouchesState(map, selection.packCells, targetStateId)) {
    return invalidInspection("target-not-adjacent", "冻结选区必须与目标国家共享至少一条陆地边");
  }
  if (mode === "conquer" && !statesAreMutualEnemies(map, sourceStateId, targetStateId)) {
    return invalidInspection("war-required", "征服要求来源与目标双边关系均为 Enemy");
  }

  const sourcePackCells = landPackCells(map).filter(cell => numberId(map.pack.cells.state[cell]) === sourceStateId);
  const selectedSet = new Set(selection.packCells);
  const remainderPackCells = sourcePackCells.filter(cell => !selectedSet.has(cell));
  const sourceExtinguished = remainderPackCells.length === 0;
  const sourceCapitalCityId = validStateCapitalCityId(map, sourceStateId);
  const transferredCityIds = activeCities(map).filter(city => selectedSet.has(cityPackCell(city))).map(city => numberId(city.id));
  const sourceCapitalTransferred = transferredCityIds.includes(sourceCapitalCityId);
  const sourceCapitalPlan = sourceExtinguished
    ? null
    : sourceCapitalTransferred || sourceCapitalCityId === null
      ? rankCapitalCandidates(map, activeCities(map).filter(city => numberId(city.state) === sourceStateId && !selectedSet.has(cityPackCell(city))))[0] || null
      : {cityId: sourceCapitalCityId, reason: "retained"};
  if (!sourceExtinguished && !sourceCapitalPlan) {
    return invalidInspection("source-capital-candidate-missing", "部分划走后来源国家没有可用首都");
  }

  const retreat = inspectTransferMilitaryRetreat(map, sourceStateId, selectedSet, remainderPackCells, sourceCapitalPlan?.cityId);
  if (!sourceExtinguished && !retreat.valid) {
    return invalidInspection("military-relocation-unresolved", `军团 ${retreat.unresolved.join("、")} 无法撤离冻结选区`, {unresolvedMilitary: retreat.unresolved});
  }

  let provincePlan = null;
  if (mode !== "neutralize") {
    provincePlan = inspectProvinceAssignmentStrategy(map, {
      stateId: targetStateId,
      packCells: selection.packCells,
      gridCells: selection.gridCells,
      province: input.province || {},
      forceEnsure: false
    });
    if (!provincePlan.valid) return provincePlan;
  }
  const normalizedInput = {
    mode,
    sourceStateId,
    ...(targetStateId ? {targetStateId} : {}),
    gridCellIds: [...selection.gridCells],
    ...(provincePlan ? {province: normalizeProvinceInput(input.province, provincePlan)} : {})
  };
  return politicalValidInspection({
    operation: "territory-transfer",
    mode,
    sourceStateId,
    targetStateId,
    gridCells: selection.gridCells,
    packCells: selection.packCells,
    sourceExtinguished,
    sourceCapitalCityId,
    sourceCapitalCityIdAfter: sourceCapitalPlan?.cityId ?? null,
    transferredCityIds,
    militaryRetreats: retreat.assignments,
    provincePlan,
    affectedStateIds: targetStateId ? [sourceStateId, targetStateId] : [sourceStateId],
    summary: `${mode === "conquer" ? "征服" : mode === "cede" ? "割让" : "中立化"}国家 #${sourceStateId} 的 ${selection.gridCells.length} 个 grid cells`
  }, normalizedInput, [
    {kind: "state", id: sourceStateId},
    ...(targetStateId ? [{kind: "state", id: targetStateId}] : []),
    ...selection.gridCells.map(id => ({kind: "grid-cell", id}))
  ], true);
}

export function inspectEnsureProvinceAssignment(map, input = {}) {
  return normalizePoliticalInspection(inspectEnsureProvinceAssignmentPlan(map, input));
}

function inspectEnsureProvinceAssignmentPlan(map, input = {}) {
  const stateIdValue = positiveInteger(input.stateId);
  if (!stateIdValue || !isActiveState(readState(map, stateIdValue))) {
    return invalidInspection("state-not-found", "分省目标必须是未移除的有效国家");
  }
  const selection = inspectExactTerritorySelection(map, stateIdValue, input.gridCellIds, {
    emptyCode: "assignment-empty",
    mismatchCode: "cell-state-mismatch"
  });
  if (!selection.valid) return selection;
  const province = {
    mode: input.mode,
    provinceId: input.provinceId,
    anchorGridCell: input.anchorGridCell
  };
  const provincePlan = inspectProvinceAssignmentStrategy(map, {
    stateId: stateIdValue,
    packCells: selection.packCells,
    gridCells: selection.gridCells,
    province,
    forceEnsure: String(input.mode || "").trim().toLowerCase() === "ensure"
  });
  if (!provincePlan.valid) return provincePlan;
  const unchanged = selection.packCells.every(cell => numberId(map.pack.cells.province?.[cell]) === provincePlan.provinceId)
    && selection.gridCells.every(cell => numberId(map.grid.cells.province?.[cell]) === provincePlan.provinceId);
  if (unchanged) return invalidInspection("province-assignment-unchanged", "冻结选区已经属于目标省份");
  const oldProvinceIds = [...new Set(selection.packCells.map(cell => numberId(map.pack.cells.province?.[cell])).filter(Boolean))];
  const willTombstoneProvince = oldProvinceIds.some(id => landPackCells(map)
    .filter(cell => numberId(map.pack.cells.province?.[cell]) === id)
    .every(cell => selection.packCells.includes(cell)));
  const normalizedInput = {
    stateId: stateIdValue,
    gridCellIds: [...selection.gridCells],
    ...normalizeEnsureProvinceInput(input, provincePlan)
  };
  return politicalValidInspection({
    operation: "ensure-province-assignment",
    stateId: stateIdValue,
    gridCells: selection.gridCells,
    packCells: selection.packCells,
    provincePlan,
    affectedStateIds: [stateIdValue],
    summary: `将国家 #${stateIdValue} 的 ${selection.gridCells.length} 个 grid cells 精确分配到省份 #${provincePlan.provinceId}`
  }, normalizedInput, [
    {kind: "state", id: stateIdValue},
    {kind: "province", id: provincePlan.provinceId},
    ...selection.gridCells.map(id => ({kind: "grid-cell", id}))
  ], provincePlan.created || willTombstoneProvince);
}

export function inspectProvinceTransfer(map, input = {}) {
  return normalizePoliticalInspection(inspectProvinceTransferPlan(map, input));
}

function inspectProvinceTransferPlan(map, input = {}) {
  const provinceIdValue = positiveInteger(input.provinceId);
  const province = readProvince(map, provinceIdValue);
  if (!provinceIdValue || !province || province.removed) return invalidInspection("province-not-found", "待转移省份必须是未移除的有效省份");
  const sourceStateId = positiveInteger(province.state);
  const targetStateId = positiveInteger(input.targetStateId);
  if (!sourceStateId || !isActiveState(readState(map, sourceStateId))) return invalidInspection("source-state-not-found", "省份来源国家无效");
  if (!targetStateId || targetStateId === sourceStateId || !isActiveState(readState(map, targetStateId))) {
    return invalidInspection(targetStateId === sourceStateId ? "same-state" : "target-state-not-found", targetStateId === sourceStateId ? "省份已经属于目标国家" : "省份目标国家无效");
  }
  const packCells = landPackCells(map).filter(cell => numberId(map.pack.cells.province?.[cell]) === provinceIdValue && numberId(map.pack.cells.state?.[cell]) === sourceStateId);
  const allProvinceCells = landPackCells(map).filter(cell => numberId(map.pack.cells.province?.[cell]) === provinceIdValue);
  if (!allProvinceCells.length) return invalidInspection("province-territory-empty", "待转移省份没有有效领土");
  if (packCells.length !== allProvinceCells.length) return invalidInspection("province-owner-mismatch", "省份领土与省档案的来源国家不一致");
  if (!selectionTouchesState(map, packCells, targetStateId)) return invalidInspection("target-not-adjacent", "待转移省份必须与目标国家共享陆地边");
  const gridCells = landGridCells(map).filter(cell => numberId(map.grid.cells.province?.[cell]) === provinceIdValue && numberId(map.grid.cells.state?.[cell]) === sourceStateId);
  const selectedSet = new Set(packCells);
  const remainderPackCells = landPackCells(map).filter(cell => numberId(map.pack.cells.state?.[cell]) === sourceStateId && !selectedSet.has(cell));
  const sourceExtinguished = remainderPackCells.length === 0;
  const sourceCapitalCityId = validStateCapitalCityId(map, sourceStateId);
  const sourceCapitalTransferred = activeCities(map).some(city => numberId(city.id) === sourceCapitalCityId && selectedSet.has(cityPackCell(city)));
  const sourceCapitalPlan = sourceExtinguished
    ? null
    : sourceCapitalTransferred || sourceCapitalCityId === null
      ? rankCapitalCandidates(map, activeCities(map).filter(city => numberId(city.state) === sourceStateId && !selectedSet.has(cityPackCell(city))))[0] || null
      : {cityId: sourceCapitalCityId, reason: "retained"};
  if (!sourceExtinguished && !sourceCapitalPlan) return invalidInspection("source-capital-candidate-missing", "整省转移后来源国家没有可用首都");
  const retreat = inspectTransferMilitaryRetreat(map, sourceStateId, selectedSet, remainderPackCells, sourceCapitalPlan?.cityId);
  if (!sourceExtinguished && !retreat.valid) {
    return invalidInspection("military-relocation-unresolved", `军团 ${retreat.unresolved.join("、")} 无法撤离待转移省份`, {unresolvedMilitary: retreat.unresolved});
  }
  const normalizedInput = {provinceId: provinceIdValue, targetStateId};
  return politicalValidInspection({
    operation: "province-transfer",
    provinceId: provinceIdValue,
    sourceStateId,
    targetStateId,
    gridCells,
    packCells,
    sourceExtinguished,
    sourceCapitalCityId,
    sourceCapitalCityIdAfter: sourceCapitalPlan?.cityId ?? null,
    militaryRetreats: retreat.assignments,
    affectedStateIds: [sourceStateId, targetStateId],
    summary: `将省份 #${provinceIdValue} 从国家 #${sourceStateId} 转移到国家 #${targetStateId}`
  }, normalizedInput, [
    {kind: "province", id: provinceIdValue},
    {kind: "state", id: sourceStateId},
    {kind: "state", id: targetStateId}
  ], true);
}

export function createTerritoryTransferCommand(input = {}, options = {}) {
  return createPoliticalTransferCommand(POLITICAL_TRANSFER_ACTION.TERRITORY_TRANSFER, input, options);
}

export function createEnsureProvinceAssignmentCommand(input = {}, options = {}) {
  return createPoliticalTransferCommand(POLITICAL_TRANSFER_ACTION.ENSURE_PROVINCE_ASSIGNMENT, input, options);
}

export function createProvinceTransferCommand(input = {}, options = {}) {
  return createPoliticalTransferCommand(POLITICAL_TRANSFER_ACTION.PROVINCE_TRANSFER, input, options);
}

function createPoliticalTransferCommand(actionId, input, options) {
  let frozenPlan = null;
  let beforeSnapshot = null;
  let result = null;
  const actionOptions = {...input, ...options};
  return {
    label: options.label || politicalTransferLabel(actionId),
    domain: "political-transfer",
    effects: {
      ...STATE_TOPOLOGY_EFFECTS,
      affected: systemAffected("political-transfer")
    },
    apply(context) {
      const map = context?.map;
      const inspection = frozenPlan || inspectPoliticalTransferTransaction(map, actionId, input);
      if (!inspection.valid) throw politicalTransferError(inspection);
      frozenPlan ??= {...clonePlain(inspection), transactionTimestamp: options.timestamp || new Date().toISOString()};
      beforeSnapshot ??= captureTopologySnapshot(map);
      try {
        result = applyPoliticalTransferPlan(map, frozenPlan, actionOptions);
        this.effects.affected = systemAffected("political-transfer", [
          ...(result.stateIds || []).map(id => ({kind: "state", id})),
          ...(result.provinceIds || []).map(id => ({kind: "province", id})),
          ...(result.gridCells || []).map(id => ({kind: "grid-cell", id}))
        ]);
      } catch (error) {
        restoreTopologySnapshot(map, beforeSnapshot);
        throw error;
      }
    },
    revert(context) {
      if (!beforeSnapshot) throw new Error("缺少可撤销的政治领土事务快照");
      restoreTopologySnapshot(context?.map, beforeSnapshot);
    },
    isNoop(context) {
      const inspection = frozenPlan || inspectPoliticalTransferTransaction(context?.map, actionId, input);
      return !inspection.valid && ["province-assignment-unchanged", "province-transfer-unchanged"].includes(inspection.code);
    },
    getInspection() {
      return frozenPlan ? clonePlain(frozenPlan) : null;
    },
    getResult() {
      return result ? clonePlain(result) : null;
    }
  };
}

function applyPoliticalTransferPlan(map, plan, options) {
  if (!map?.grid?.cells?.state || !map?.pack?.cells?.state || !map?.grid?.cells?.province || !map?.pack?.cells?.province) {
    throw new Error("当前地图缺少政治领土事务所需的 state/province cells");
  }
  if (plan.operation === "ensure-province-assignment") {
    const changedProvinceIds = applyExactProvinceAssignment(map, plan.stateId, plan.gridCells, plan.packCells, plan.provincePlan);
    injectFault(options, "after-province");
    synchronizeSelectedCities(map, new Set(plan.packCells), plan.stateId, plan.provincePlan.provinceId, {preserveCapital: true});
    refreshTransferredProvinceRecords(map, changedProvinceIds);
    refreshPoliticalTopology(map, {
      resultStateIds: [plan.stateId],
      boundaryStateIds: [],
      selectedStateIds: [plan.stateId]
    });
    synchronizeMarkets(map);
    synchronizeRoutes(map);
    synchronizeTopologyMetadata(map, plan);
    injectFault(options, "after-domains");
    validatePoliticalTransferResult(map, plan, changedProvinceIds);
    return politicalTransferResult(plan, [...changedProvinceIds]);
  }

  const selectedPack = new Set(plan.packCells);
  const oldProvinceIds = new Set(plan.packCells.map(cell => numberId(map.pack.cells.province?.[cell])).filter(Boolean));
  const nextStateId = plan.operation === "province-transfer" ? plan.targetStateId : plan.targetStateId;
  for (const cell of plan.gridCells) map.grid.cells.state[cell] = nextStateId;
  for (const cell of plan.packCells) map.pack.cells.state[cell] = nextStateId;
  injectFault(options, "after-territory");

  let destinationProvinceId = 0;
  const changedProvinceIds = new Set(oldProvinceIds);
  if (plan.operation === "province-transfer") {
    destinationProvinceId = plan.provinceId;
    replaceMirroredPoliticalFields(map, "provinces", plan.provinceId, {state: plan.targetStateId});
    changedProvinceIds.add(plan.provinceId);
  } else if (plan.mode !== "neutralize") {
    destinationProvinceId = plan.provincePlan.provinceId;
    for (const cell of plan.gridCells) map.grid.cells.province[cell] = destinationProvinceId;
    for (const cell of plan.packCells) map.pack.cells.province[cell] = destinationProvinceId;
    if (plan.provincePlan.created) createEnsuredProvinceRecord(map, plan.targetStateId, plan.provincePlan);
    changedProvinceIds.add(destinationProvinceId);
  } else {
    for (const cell of plan.gridCells) map.grid.cells.province[cell] = 0;
    for (const cell of plan.packCells) map.pack.cells.province[cell] = 0;
  }
  injectFault(options, "after-province");

  synchronizeSelectedCities(map, selectedPack, nextStateId, destinationProvinceId);
  if (plan.sourceExtinguished) tombstoneTransferredState(map, plan.sourceStateId);
  else if (plan.sourceCapitalCityIdAfter !== plan.sourceCapitalCityId) setStateCapital(map, plan.sourceStateId, plan.sourceCapitalCityIdAfter);
  injectFault(options, "capital", {map, plan});

  refreshTransferredProvinceRecords(map, changedProvinceIds);
  refreshProvinceNeighbors(map, [...changedProvinceIds].filter(id => readProvince(map, id) && !readProvince(map, id).removed));
  const boundaryStateIds = collectBoundaryStateIds(map, plan.packCells, new Set(plan.affectedStateIds || []));
  const resultStateIds = (plan.affectedStateIds || []).filter(id => isActiveState(readState(map, id)));
  refreshPoliticalTopology(map, {
    resultStateIds,
    boundaryStateIds,
    selectedStateIds: plan.affectedStateIds || []
  });

  if (plan.sourceExtinguished && plan.targetStateId) {
    synchronizeDiplomacy(map, {
      operation: "merge",
      survivorStateId: plan.targetStateId,
      victimStateId: plan.sourceStateId,
      resultStateIds: [plan.targetStateId]
    });
    synchronizeMilitary(map, {
      operation: "merge",
      survivorStateId: plan.targetStateId,
      victimStateId: plan.sourceStateId,
      resultStateIds: [plan.targetStateId]
    });
  } else if (plan.sourceExtinguished) {
    neutralizeExtinguishedStateDomains(map, plan.sourceStateId);
  } else {
    applyMilitaryRetreats(map, plan.sourceStateId, plan.militaryRetreats || []);
  }
  injectFault(options, "military", {map, plan});
  synchronizeMarkets(map);
  injectFault(options, "market", {map, plan});
  synchronizeRoutes(map);
  injectFault(options, "route", {map, plan});
  synchronizeTopologyMetadata(map, plan);
  injectFault(options, "after-domains");
  validatePoliticalTransferResult(map, plan, changedProvinceIds);
  return politicalTransferResult(plan, [...changedProvinceIds]);
}

function inspectExactTerritorySelection(map, stateIdValue, values, {emptyCode = "territory-empty", mismatchCode = "cell-owner-mismatch"} = {}) {
  if (!Array.isArray(values) || !values.length) return invalidInspection(emptyCode, "必须冻结至少一个 grid cell");
  const gridCells = [...new Set(values.map(optionalInteger).filter(value => value !== null))].sort(ascending);
  if (gridCells.length !== values.length) return invalidInspection("grid-cell-invalid", "gridCellIds 必须是互不重复的整数");
  const validGrid = new Set(landGridCells(map));
  for (const cell of gridCells) {
    if (!Array.from(map?.grid?.cells?.i || []).includes(cell)) return invalidInspection("grid-cell-invalid", `grid cell #${cell} 无效`);
    if (!validGrid.has(cell)) return invalidInspection("grid-cell-water", `grid cell #${cell} 不是陆地`);
    if (numberId(map.grid.cells.state?.[cell]) !== stateIdValue) {
      return invalidInspection(mismatchCode, `grid cell #${cell} 不是指定国家陆地`);
    }
  }
  const gridSet = new Set(gridCells);
  const packCells = landPackCells(map)
    .filter(cell => gridSet.has(packGridCell(map, cell)) && numberId(map.pack.cells.state?.[cell]) === stateIdValue)
    .sort(ascending);
  if (!packCells.length) return invalidInspection("grid-cell-invalid", "冻结 grid 选区没有对应来源国家 pack cells");
  for (const gridCell of gridCells) {
    if (!packCells.some(cell => packGridCell(map, cell) === gridCell)) {
      return invalidInspection("grid-cell-invalid", `grid cell #${gridCell} 没有对应来源国家 pack cell`);
    }
  }
  return validInspection({gridCells, packCells});
}

function inspectProvinceAssignmentStrategy(map, {stateId: stateIdValue, packCells, gridCells, province, forceEnsure}) {
  let mode = String(province?.mode || "auto").trim().toLowerCase();
  if (!["auto", "existing", "ensure"].includes(mode)) {
    return invalidInspection("invalid-province-mode", "省策略 mode 必须是 auto、existing 或 ensure");
  }
  if (forceEnsure) mode = "ensure";
  if (mode === "existing") {
    const provinceIdValue = positiveInteger(province?.provinceId);
    const target = readProvince(map, provinceIdValue);
    if (!provinceIdValue || !target || target.removed) return invalidInspection("province-not-found", "existing 省份必须有效");
    if (numberId(target.state) !== stateIdValue) return invalidInspection("province-state-mismatch", "existing 省份必须属于目标国家");
    return validInspection({mode, provinceId: provinceIdValue, created: false, anchorGridCell: null});
  }
  if (mode === "auto") {
    const candidates = rankAdjacentProvinceCandidates(map, stateIdValue, packCells);
    if (candidates.length) {
      return validInspection({mode, provinceId: candidates[0].provinceId, created: false, anchorGridCell: null, candidates});
    }
    mode = "ensure";
  }
  const anchorGridCell = province?.anchorGridCell === undefined || province?.anchorGridCell === null
    ? gridCells[0]
    : optionalInteger(province.anchorGridCell);
  if (anchorGridCell === null || !gridCells.includes(anchorGridCell)) {
    return invalidInspection("province-anchor-invalid", "新省 anchorGridCell 必须位于冻结选区");
  }
  const provinceIdValue = nextPoliticalId(map, "provinces");
  if (provinceIdValue > MAX_PROVINCE_ID) return invalidInspection("province-id-overflow", `新省份编号不能超过 ${MAX_PROVINCE_ID}`);
  const anchorPackCell = packCells.find(cell => packGridCell(map, cell) === anchorGridCell) ?? packCells[0];
  return validInspection({mode: "ensure", provinceId: provinceIdValue, created: true, anchorGridCell, anchorPackCell});
}

function rankAdjacentProvinceCandidates(map, stateIdValue, packCells) {
  const selected = new Set(packCells);
  const edgeCounts = new Map();
  for (const cell of selected) {
    for (const neighbor of map?.pack?.cells?.c?.[cell] || []) {
      if (selected.has(neighbor) || map.pack.cells.h?.[neighbor] < 20 || numberId(map.pack.cells.state?.[neighbor]) !== stateIdValue) continue;
      const provinceIdValue = numberId(map.pack.cells.province?.[neighbor]);
      const province = readProvince(map, provinceIdValue);
      if (!provinceIdValue || !province || province.removed || numberId(province.state) !== stateIdValue) continue;
      edgeCounts.set(provinceIdValue, (edgeCounts.get(provinceIdValue) || 0) + 1);
    }
  }
  return [...edgeCounts].map(([provinceIdValue, edges]) => ({
    provinceId: provinceIdValue,
    edges,
    area: Number(readProvince(map, provinceIdValue)?.area || 0)
  })).sort((a, b) => b.edges - a.edges || b.area - a.area || a.provinceId - b.provinceId);
}

function inspectTransferMilitaryRetreat(map, sourceStateId, selectedCells, remainderCells, capitalCityId) {
  const affected = [];
  for (const regiment of readState(map, sourceStateId)?.military || []) {
    const station = optionalInteger(regiment.cell);
    const base = optionalInteger(regiment.baseCell ?? regiment.bcell);
    if (selectedCells.has(station) || selectedCells.has(base)) affected.push(regiment);
  }
  if (!affected.length) return {valid: true, assignments: [], unresolved: []};
  const remainder = new Set(remainderCells);
  const capitalCell = cityPackCell(findCity(map, capitalCityId));
  const stateCenter = optionalInteger(readState(map, sourceStateId)?.center);
  const retreatCell = remainder.has(capitalCell) ? capitalCell : remainder.has(stateCenter) ? stateCenter : null;
  if (retreatCell === null) {
    return {
      valid: false,
      assignments: [],
      unresolved: affected.map(regiment => regiment.id || `${sourceStateId}:${numberId(regiment.i)}`)
    };
  }
  return {
    valid: true,
    assignments: affected.map(regiment => ({
      id: regiment.id || `${sourceStateId}:${numberId(regiment.i)}`,
      regimentId: numberId(regiment.i),
      retreatCell
    })),
    unresolved: []
  };
}

function selectionTouchesState(map, packCells, targetStateId) {
  const selected = new Set(packCells);
  return packCells.some(cell => (map?.pack?.cells?.c?.[cell] || []).some(neighbor => (
    !selected.has(neighbor)
    && map.pack.cells.h?.[neighbor] >= 20
    && numberId(map.pack.cells.state?.[neighbor]) === targetStateId
  )));
}

function statesAreMutualEnemies(map, left, right) {
  return readState(map, left)?.diplomacy?.[right] === "Enemy" && readState(map, right)?.diplomacy?.[left] === "Enemy";
}

function applyExactProvinceAssignment(map, stateIdValue, gridCells, packCells, provincePlan) {
  const changed = new Set(packCells.map(cell => numberId(map.pack.cells.province?.[cell])).filter(Boolean));
  for (const cell of gridCells) map.grid.cells.province[cell] = provincePlan.provinceId;
  for (const cell of packCells) map.pack.cells.province[cell] = provincePlan.provinceId;
  if (provincePlan.created) createEnsuredProvinceRecord(map, stateIdValue, provincePlan);
  changed.add(provincePlan.provinceId);
  return changed;
}

function createEnsuredProvinceRecord(map, stateIdValue, provincePlan) {
  const centerCell = provincePlan.anchorPackCell;
  const centerCity = activeCities(map).find(city => cityPackCell(city) === centerCell);
  const state = readState(map, stateIdValue);
  const name = centerCity?.name || `新省${provincePlan.provinceId}`;
  const formName = provinceFormForState(state, map?.society?.cultures || map?.pack?.cultures) || "州";
  writeMirroredPoliticalItem(map, "provinces", provincePlan.provinceId, {
    id: provincePlan.provinceId,
    i: provincePlan.provinceId,
    state: stateIdValue,
    center: centerCell,
    gridCenter: provincePlan.anchorGridCell,
    burg: numberId(centerCity?.burgId),
    name,
    formName,
    fullName: `${name}${formName}`,
    color: deterministicColor(`${map?.options?.seed}:province:${provincePlan.provinceId}:${stateIdValue}`),
    cells: 0,
    area: 0,
    pole: clonePoint(map.pack.cells.p?.[centerCell]),
    neighbors: [],
    burgs: 0,
    rural: 0,
    urban: 0,
    religion: numberId(map.pack.cells.religion?.[centerCell] ?? state?.religion),
    removed: false
  });
}

function synchronizeSelectedCities(map, selectedPackCells, stateIdValue, provinceIdValue, {preserveCapital = false} = {}) {
  for (const city of activeCities(map)) {
    if (!selectedPackCells.has(cityPackCell(city))) continue;
    const next = {
      ...city,
      state: stateIdValue,
      province: provinceIdValue,
      capital: preserveCapital ? Boolean(city.capital) : false,
      provincial: false,
      group: preserveCapital && city.capital ? "capital" : ordinaryCityGroup(city)
    };
    replaceCity(map, city, next);
    const burg = findBurgForCity(map, city);
    if (burg) replaceBurg(map, burg, {
      ...burg,
      state: stateIdValue,
      province: provinceIdValue,
      capital: preserveCapital ? Number(Boolean(burg.capital)) : 0,
      group: preserveCapital && burg.capital ? "capital" : ordinaryCityGroup(city)
    });
  }
}

function refreshTransferredProvinceRecords(map, provinceIds) {
  for (const id of provinceIds) {
    const province = readProvince(map, id);
    if (!province) continue;
    const cells = landPackCells(map).filter(cell => numberId(map.pack.cells.province?.[cell]) === id);
    if (!cells.length) {
      for (const city of activeCities(map).filter(item => numberId(item.province) === id && item.provincial)) {
        setCityProvincial(map, city.id, false);
      }
      replaceMirroredPoliticalFields(map, "provinces", id, {
        removed: true,
        cells: 0,
        area: 0,
        burgs: 0,
        rural: 0,
        urban: 0,
        neighbors: []
      });
      continue;
    }
    const stateIdValue = numberId(map.pack.cells.state?.[cells[0]]);
    const cities = activeCities(map).filter(city => cells.includes(cityPackCell(city)));
    let center = cells.includes(numberId(province.center)) ? numberId(province.center) : cityPackCell(cities[0]) ?? cells[0];
    if (!cells.includes(center)) center = cells[0];
    const centerCity = cities.find(city => cityPackCell(city) === center) || cities[0];
    replaceMirroredPoliticalFields(map, "provinces", id, {
      state: stateIdValue,
      center,
      gridCenter: packGridCell(map, center),
      burg: numberId(centerCity?.burgId),
      cells: cells.length,
      area: roundValue(cells.reduce((sum, cell) => sum + Number(map.pack.cells.area?.[cell] || 0), 0), 2),
      pole: clonePoint(map.pack.cells.p?.[center]),
      burgs: cities.length,
      rural: roundValue(cells.reduce((sum, cell) => sum + Number(map.pack.cells.pop?.[cell] || 0), 0), 2),
      urban: roundValue(cities.reduce((sum, city) => sum + Number(city.population || 0), 0), 2),
      removed: false
    });
    for (const city of cities) setCityProvincial(map, city.id, numberId(city.id) === numberId(centerCity?.id));
  }
}

function tombstoneTransferredState(map, sourceStateId) {
  assignMirroredPoliticalFields(map, "states", sourceStateId, {
    removed: true,
    capital: 0,
    capitalName: "",
    cells: 0,
    area: 0,
    burgs: 0,
    rural: 0,
    urban: 0,
    provinces: [],
    neighbors: []
  });
}

function replaceMirroredPoliticalFields(map, key, id, fields) {
  const current = key === "provinces" ? readProvince(map, id) : readState(map, id);
  if (!current) throw new Error(`地图缺少 ${key} #${id}`);
  writeMirroredPoliticalItem(map, key, id, {...clonePlain(current), ...clonePlain(fields)});
}

function applyMilitaryRetreats(map, sourceStateId, assignments) {
  if (!assignments.length) return;
  const byId = new Map(assignments.map(item => [item.id, item]));
  const state = readState(map, sourceStateId);
  const military = (state?.military || []).map(regiment => {
    const id = regiment.id || `${sourceStateId}:${numberId(regiment.i)}`;
    const assignment = byId.get(id);
    if (!assignment) return clonePlain(regiment);
    const next = {...clonePlain(regiment), cell: assignment.retreatCell, baseCell: assignment.retreatCell};
    if (Object.hasOwn(regiment, "bcell")) next.bcell = assignment.retreatCell;
    return next;
  });
  assignMirroredPoliticalFields(map, "states", sourceStateId, {military});
}

function neutralizeExtinguishedStateDomains(map, sourceStateId) {
  assignMirroredPoliticalFields(map, "states", sourceStateId, {military: [], campaigns: []});
  for (const state of activeStates(map)) {
    const diplomacy = clonePlain(state.diplomacy || []);
    diplomacy[sourceStateId] = "x";
    assignMirroredPoliticalFields(map, "states", stateId(state), {
      diplomacy,
      campaigns: closeCampaignsForState(state.campaigns, sourceStateId),
      diplomacySummary: summarizeStateDiplomacy({i: stateId(state), diplomacy}, new Set(activeStates(map).map(stateId)))
    });
  }
  const diplomacy = clonePlain(map?.diplomacy || map?.pack?.diplomacy || {relations: {}, chronicle: [], metadata: {}});
  diplomacy.chronicle = [...(diplomacy.chronicle || []), ["国家解散", `国家 #${sourceStateId} 的最后领土被中立化，军团与活动关系已清理。`]];
  diplomacy.metadata = summarizeDiplomacyMetadata(map, diplomacy);
  writeMirroredRoot(map, "diplomacy", diplomacy);
  const military = clonePlain(map?.military || map?.pack?.military || {campaigns: [], fronts: [], events: [], metadata: {}});
  military.campaigns = closeMilitaryCampaigns(military.campaigns, sourceStateId);
  military.fronts = closeMilitaryCampaigns(military.fronts, sourceStateId);
  military.events = (military.events || []).filter(event => !campaignInvolvesState(event, sourceStateId));
  military.metadata = refreshMilitaryMetadata(map, military);
  writeMirroredRoot(map, "military", military);
}

function validatePoliticalTransferResult(map, plan, changedProvinceIds) {
  const errors = [];
  for (const cell of plan.gridCells) {
    const expectedState = plan.operation === "ensure-province-assignment" ? plan.stateId : plan.targetStateId;
    if (numberId(map.grid.cells.state?.[cell]) !== expectedState) errors.push(`grid cell #${cell} 国家未同步`);
  }
  for (const cell of plan.packCells) {
    const expectedState = plan.operation === "ensure-province-assignment" ? plan.stateId : plan.targetStateId;
    if (numberId(map.pack.cells.state?.[cell]) !== expectedState) errors.push(`pack cell #${cell} 国家未同步`);
  }
  const expectedProvince = plan.operation === "province-transfer"
    ? plan.provinceId
    : plan.operation === "ensure-province-assignment"
      ? plan.provincePlan.provinceId
      : plan.mode === "neutralize" ? 0 : plan.provincePlan.provinceId;
  for (const cell of plan.packCells) {
    if (numberId(map.pack.cells.province?.[cell]) !== expectedProvince) errors.push(`pack cell #${cell} 省份未同步`);
  }
  for (const city of activeCities(map)) {
    const cell = cityPackCell(city);
    if (!plan.packCells.includes(cell)) continue;
    const expectedState = plan.operation === "ensure-province-assignment" ? plan.stateId : plan.targetStateId;
    if (numberId(city.state) !== expectedState || numberId(city.province) !== expectedProvince) errors.push(`城市 #${city.id} 归属未同步`);
  }
  const changedProvinceSet = new Set([...changedProvinceIds].map(numberId).filter(Boolean));
  for (const province of activeProvinces(map).filter(item => changedProvinceSet.has(provinceId(item)))) {
    const id = provinceId(province);
    const cities = activeCities(map).filter(city => numberId(city.province) === id);
    const centerCity = numberId(province.burg) ? findCityByBurgId(map, province.burg) : null;
    if (numberId(province.burg) && (!centerCity || numberId(centerCity.province) !== id || !centerCity.provincial)) {
      errors.push(`省份 #${id} 的省会城市标记未同步`);
    }
    if (cities.some(city => city.provincial && numberId(city.burgId) !== numberId(province.burg))) {
      errors.push(`省份 #${id} 存在非省会城市的省会标记`);
    }
  }
  validateMirrorItems(map, "states", plan.affectedStateIds || [plan.stateId], errors);
  const provinceIds = [expectedProvince, ...(plan.packCells || []).map(cell => numberId(map.pack.cells.province?.[cell]))].filter(Boolean);
  validateMirrorItems(map, "provinces", [...new Set(provinceIds)], errors);
  if (plan.sourceExtinguished && !readState(map, plan.sourceStateId)?.removed) errors.push("来源国家最后领土转移后未墓碑化");
  if (errors.length) {
    const error = new Error(`政治领土事务校验失败：${errors.join("；")}`);
    error.code = "source-province-repair-failed";
    throw error;
  }
}

function politicalTransferResult(plan, provinceIds) {
  return {
    operation: plan.operation,
    mode: plan.mode || null,
    stateIds: [...(plan.affectedStateIds || [plan.stateId])],
    provinceIds: [...new Set(provinceIds.filter(Boolean))].sort(ascending),
    gridCells: [...plan.gridCells],
    packCells: [...plan.packCells],
    sourceExtinguished: Boolean(plan.sourceExtinguished),
    selectionTarget: plan.targetStateId ? {kind: "state", id: plan.targetStateId} : null
  };
}

function politicalTransferLabel(actionId) {
  if (actionId === POLITICAL_TRANSFER_ACTION.TERRITORY_TRANSFER) return "转移国家领土";
  if (actionId === POLITICAL_TRANSFER_ACTION.ENSURE_PROVINCE_ASSIGNMENT) return "确保选区省份归属";
  return "转移完整省份";
}

function politicalTransferError(inspection) {
  const error = new Error(inspection.summary);
  error.code = inspection.code;
  error.inspection = clonePlain(inspection);
  return error;
}

function politicalValidInspection(plan, normalizedInput, affected, requiresConfirm) {
  return {
    ...validInspection(plan),
    allowed: true,
    normalizedInput: clonePlain(normalizedInput),
    affected: affected.map(item => ({...item})),
    requiresConfirm: Boolean(requiresConfirm)
  };
}

function normalizePoliticalInspection(inspection) {
  return {
    ...inspection,
    allowed: inspection?.valid === true,
    normalizedInput: inspection?.normalizedInput ? clonePlain(inspection.normalizedInput) : null,
    affected: Array.isArray(inspection?.affected) ? inspection.affected.map(item => ({...item})) : [],
    requiresConfirm: inspection?.requiresConfirm === true
  };
}

function normalizeProvinceInput(input, plan) {
  const requestedMode = String(input?.mode || "auto").trim().toLowerCase();
  if (requestedMode === "existing") return {mode: "existing", provinceId: plan.provinceId};
  if (plan.created) return {mode: "ensure", anchorGridCell: plan.anchorGridCell};
  return {mode: "auto"};
}

function normalizeEnsureProvinceInput(input, plan) {
  const requestedMode = String(input?.mode || "auto").trim().toLowerCase();
  if (requestedMode === "existing") return {mode: "existing", provinceId: plan.provinceId};
  if (plan.created) return {mode: "ensure", anchorGridCell: plan.anchorGridCell};
  return {mode: "auto"};
}

function packGridCell(map, packCell) {
  const mapped = optionalInteger(map?.pack?.cells?.g?.[packCell]);
  return mapped === null ? packCell : mapped;
}

const scopedProvinceRegenerationOptions = new WeakMap();

export function withScopedProvinceRegenerationOptions(map, options, callback) {
  scopedProvinceRegenerationOptions.set(map, options || {});
  try {
    return callback();
  } finally {
    scopedProvinceRegenerationOptions.delete(map);
  }
}

export function regenerateProvincesForStates(map, stateIds, options = scopedProvinceRegenerationOptions.get(map) || {}) {
  const resultStateIds = uniquePositiveIntegers(stateIds).sort(ascending);
  if (!resultStateIds.length) throw new Error("按国家重设省份时必须指定至少一个有效国家");
  for (const stateIdValue of resultStateIds) {
    if (!isActiveState(readState(map, stateIdValue))) throw new Error(`国家 #${stateIdValue} 不存在或已移除`);
  }

  const locked = prepareScopedLockedProvinces(map, resultStateIds, options);
  for (const province of activeProvinces(map)) {
    if (!resultStateIds.includes(numberId(province.state))) locked.allIds.add(provinceId(province));
  }
  const affectedOldProvinceIds = activeProvinces(map)
    .filter(province => resultStateIds.includes(numberId(province.state)))
    .map(provinceId)
    .filter(id => !locked.selectedIds.has(id))
    .sort(ascending);
  const provinceCounts = resultStateIds.map(stateIdValue => {
    const cities = activeCities(map).filter(city => numberId(city.state) === stateIdValue);
    const cells = landPackCells(map).filter(cell => numberId(map.pack.cells.state[cell]) === stateIdValue);
    if (!cities.length || !cells.length) throw new Error(`国家 #${stateIdValue} 缺少可重新分省的城镇或陆地`);
    const lockedCount = locked.byState.get(stateIdValue)?.length || 0;
    const unlockedCells = cells.filter(cell => !locked.packOwners.has(cell));
    return Math.max(unlockedCells.length ? 1 : 0, targetProvinceCount(cities.length, map?.options?.provincesRatio) - lockedCount);
  });
  const nextProvinceId = nextPoliticalId(map, "provinces");
  const totalProvinceCount = provinceCounts.reduce((sum, count) => sum + count, 0);
  if (nextProvinceId + totalProvinceCount - 1 > MAX_PROVINCE_ID) {
    throw new Error(`新省份编号不能超过 ${MAX_PROVINCE_ID}`);
  }

  const plan = {
    operation: "regenerate",
    selectedStateIds: resultStateIds,
    resultStateIds,
    affectedOldProvinceIds,
    newProvinceIds: sequence(nextProvinceId, totalProvinceCount),
    newProvinceCounts: Object.fromEntries(resultStateIds.map((id, index) => [id, provinceCounts[index]])),
    lockedProvinces: locked,
    boundaryStateIds: []
  };
  const provinceResult = rebuildAffectedProvinces(map, plan);
  refreshPoliticalTopology(map, plan);
  return {
    stateIds: [...resultStateIds],
    provinceIds: [...locked.selectedIds, ...provinceResult.newProvinceIds].sort(ascending),
    tombstonedProvinceIds: [...affectedOldProvinceIds]
  };
}

function prepareScopedLockedProvinces(map, selectedStateIds, options = {}) {
  const provided = options.lockedProvinces ?? options.preservedProvinces ?? [];
  if (!Array.isArray(provided)) throw scopedProvinceLockConflict("锁定省份约束必须是数组", {reason: "invalid-constraint"});
  const allIds = new Set();
  const selectedIds = new Set();
  const byState = new Map();
  const packOwners = new Map();
  const gridOwners = new Map();
  const selected = new Set(selectedStateIds);
  for (const source of provided) {
    const id = numberId(source?.id ?? source?.i);
    const stateIdValue = numberId(source?.state);
    if (!id || allIds.has(id)) throw scopedProvinceLockConflict("锁定省份缺少唯一 ID", {reason: "invalid-id", id});
    allIds.add(id);
    if (!selected.has(stateIdValue)) continue;
    const current = readProvince(map, id);
    const center = numberId(source.center);
    const burgId = numberId(source.burg);
    if (!current || current.removed || numberId(current.state) !== stateIdValue || !isActiveState(readState(map, stateIdValue))) {
      throw scopedProvinceLockConflict(`锁定省份 #${id} 缺少一致对象或父国`, {reason: "invalid-parent-state", id, stateId: stateIdValue});
    }
    if (map.pack.cells.h?.[center] < 20 || numberId(map.pack.cells.state?.[center]) !== stateIdValue || numberId(map.pack.cells.province?.[center]) !== id) {
      throw scopedProvinceLockConflict(`锁定省份 #${id} 缺少一致中心`, {reason: "invalid-center", id, center});
    }
    const burg = burgId ? map.pack.burgs?.[burgId] : null;
    if (burgId && (!burg || burg.removed || numberId(burg.cell) !== center)) {
      throw scopedProvinceLockConflict(`锁定省份 #${id} 缺少一致省会`, {reason: "invalid-burg", id, burgId, center});
    }
    const stateLocks = byState.get(stateIdValue) || [];
    stateLocks.push(structuredClone(source));
    byState.set(stateIdValue, stateLocks);
    selectedIds.add(id);
    for (const cell of landPackCells(map)) {
      if (numberId(map.pack.cells.province?.[cell]) !== id) continue;
      if (numberId(map.pack.cells.state?.[cell]) !== stateIdValue || packOwners.has(cell)) {
        throw scopedProvinceLockConflict(`锁定省份 #${id} 领土重叠或跨国`, {reason: "overlapping-territory", id, cell});
      }
      packOwners.set(cell, id);
    }
    for (const cell of landGridCells(map)) if (numberId(map.grid.cells.province?.[cell]) === id) gridOwners.set(cell, id);
  }
  return {allIds, selectedIds, byState, packOwners, gridOwners};
}

function scopedProvinceLockConflict(message, details = {}) {
  const error = new Error(message);
  error.code = "regeneration_lock_conflict";
  error.details = {kind: "province", ...details};
  return error;
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
  let provinceCursor = 0;
  for (const stateId of plan.resultStateIds) {
    const cells = landPackCells(map).filter(cell => numberId(map.pack.cells.state[cell]) === stateId);
    const cities = activeCities(map).filter(city => numberId(city.state) === stateId && cells.includes(cityPackCell(city)));
    if (!cells.length || !cities.length) throw new Error(`国家 #${stateId} 缺少可重新分省的陆地或城市`);
    const count = plan.operation === "regenerate" && plan.newProvinceCounts
      ? numberId(plan.newProvinceCounts[stateId])
      : plan.operation === "merge"
      ? plan.newProvinceIds.length
      : targetProvinceCount(cities.length, map?.options?.provincesRatio);
    const provinceIds = plan.newProvinceIds.slice(provinceCursor, provinceCursor + count);
    provinceCursor += count;
    const preservedProvinceNames = plan.operation === "merge" && stateId === plan.survivorStateId ? plan.preservedProvinceNames || [] : [];
    const fixedAssignments = plan.lockedProvinces?.packOwners || new Map();
    const availableCities = cities.filter(city => !fixedAssignments.has(cityPackCell(city)));
    const centers = preservedProvinceNames.length
      ? chooseMergeProvinceCenters(map, stateId, cells, cities, count, preservedProvinceNames)
      : chooseProvinceCenters(map, stateId, availableCities, count);
    if (centers.length !== count) throw new Error(`国家 #${stateId} 缺少足够的未锁省会候选`);
    const stateFixedAssignments = new Map([...fixedAssignments].filter(([cell]) => numberId(map.pack.cells.state?.[cell]) === stateId));
    const assignment = assignConnectedProvinces(
      map.pack.cells,
      cells,
      centers.map((city, index) => ({cell: cityPackCell(city), provinceId: provinceIds[index]})),
      stateFixedAssignments,
      plan.lockedProvinces?.selectedIds || new Set()
    );
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
  synchronizeGridProvinces(map, new Set(plan.resultStateIds), plan.lockedProvinces?.gridOwners, plan.lockedProvinces?.selectedIds);
  synchronizeCityProvinces(map, new Set(plan.resultStateIds), plan.lockedProvinces?.selectedIds);

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
  refreshProvinceNeighbors(map, expectedIds, plan.affectedOldProvinceIds, plan.lockedProvinces?.allIds);
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

function assignConnectedProvinces(cells, ownedCells, seeds, fixedAssignments = new Map(), protectedIds = new Set()) {
  const allowed = new Set(ownedCells);
  const assignment = new Map(fixedAssignments);
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
      if (protectedIds.has(item.provinceId)) continue;
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

function synchronizeGridProvinces(map, stateIds, fixedOwners = new Map(), protectedProvinceIds = new Set()) {
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
      ? [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0]).find(([id]) => !protectedProvinceIds.has(id))?.[0] || 0
      : 0;
    map.grid.cells.province[gridCell] = fixedOwners?.has(gridCell) ? fixedOwners.get(gridCell) : provinceId;
  }
}

function synchronizeCityProvinces(map, stateIds, protectedProvinceIds = new Set()) {
  for (const city of activeCities(map)) {
    if (!stateIds.has(numberId(city.state))) continue;
    const provinceId = numberId(map.pack.cells.province?.[cityPackCell(city)] ?? map.grid.cells.province?.[city.cell]);
    if (protectedProvinceIds.has(numberId(city.province)) || protectedProvinceIds.has(provinceId)) continue;
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

function refreshProvinceNeighbors(map, newProvinceIds, oldProvinceIds = [], protectedIds = new Set()) {
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
      if (!newSet.has(otherId) && !protectedIds.has(otherId)) {
        const set = externalUpdates.get(otherId) || new Set((readProvince(map, otherId)?.neighbors || []).filter(id => !newSet.has(numberId(id)) && !oldSet.has(numberId(id))));
        set.add(provinceId);
        externalUpdates.set(otherId, set);
      }
    }
  }
  for (const id of newProvinceIds) {
    if (protectedIds.has(id)) continue;
    const province = clonePlain(readProvince(map, id));
    province.neighbors = [...neighborSets.get(id)].sort(ascending);
    writeMirroredPoliticalItem(map, "provinces", id, province);
  }
  for (const [id, neighbors] of externalUpdates) {
    if (protectedIds.has(id)) continue;
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

function validStateCapitalCityId(map, stateIdValue) {
  const cityId = stateCapitalCityId(map, stateIdValue);
  const city = findCity(map, cityId);
  const packCell = cityPackCell(city);
  return city
    && numberId(city.state) === stateIdValue
    && Number.isInteger(packCell)
    && numberId(map?.pack?.cells?.state?.[packCell]) === stateIdValue
    ? cityId
    : null;
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
