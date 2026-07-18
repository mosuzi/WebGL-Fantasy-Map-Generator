import {refreshPopulationDemandDiagnostics} from "../generator/economy.js";
import {refreshRelocatedSettlementDerived} from "../generator/settlements.js";
import {systemAffected} from "./edit-command-effects.js";

export const POPULATION_ADJUSTMENT_SCOPE = Object.freeze({
  STATE: "state",
  PROVINCE: "province",
  CULTURE: "culture",
  RELIGION: "religion"
});

export const POPULATION_ADJUSTMENT_LIMITS = Object.freeze({
  deltaMin: -1_000_000,
  deltaMax: 1_000_000,
  totalMax: 1_000_000_000,
  packCellsMax: 20_000,
  citiesMax: 4_096
});

const STALE_SYSTEMS = Object.freeze(["economy", "military", "diplomacy", "zones"]);
const STALE_SECTIONS = Object.freeze(["economy", "military", "diplomacy", "zones"]);

export function inspectPopulationAdjustment(map, target, options = {}) {
  if (!map?.pack?.cells || !map?.grid?.cells) return invalidInspection("missing-map", "当前地图缺少人口调整所需的数据");
  if (!options || typeof options !== "object" || Array.isArray(options)) return invalidInspection("invalid-options", "人口调整参数必须是对象");
  const normalizedTarget = normalizePopulationTarget(target);
  if (!normalizedTarget) return invalidInspection("invalid-target", "人口调整目标必须是有效的国家、省份、文化或宗教 ID");
  const object = resolveTargetObject(map, normalizedTarget);
  if (!object || object.removed) return invalidInspection("missing-target", "人口调整目标不存在或已删除", normalizedTarget);
  const delta = Number(options?.delta);
  if (!Number.isFinite(delta) || delta === 0) return invalidInspection("invalid-delta", "人口增减量必须是非零有限数", normalizedTarget, delta);
  if (delta < POPULATION_ADJUSTMENT_LIMITS.deltaMin || delta > POPULATION_ADJUSTMENT_LIMITS.deltaMax) {
    return invalidInspection("delta-range", `人口增减量必须在 ${POPULATION_ADJUSTMENT_LIMITS.deltaMin}～${POPULATION_ADJUSTMENT_LIMITS.deltaMax} 之间`, normalizedTarget, delta);
  }

  const packCells = collectTargetPackCells(map, normalizedTarget);
  const cities = collectTargetCities(map, normalizedTarget);
  if (!packCells.length && !cities.length) return invalidInspection("empty-target", "目标区域没有可调整的人口载体", normalizedTarget, delta);
  if (packCells.length > POPULATION_ADJUSTMENT_LIMITS.packCellsMax) {
    return invalidInspection("pack-range", `单次人口调整最多允许 ${POPULATION_ADJUSTMENT_LIMITS.packCellsMax} 个 pack cells`, normalizedTarget, delta);
  }
  if (cities.length > POPULATION_ADJUSTMENT_LIMITS.citiesMax) {
    return invalidInspection("city-range", `单次人口调整最多允许 ${POPULATION_ADJUSTMENT_LIMITS.citiesMax} 个城市`, normalizedTarget, delta);
  }

  const ruralBefore = sum(packCells.map(cell => Number(map.pack.cells.pop?.[cell]) || 0));
  const urbanBefore = sum(cities.map(city => Number(city.population) || 0));
  const totalBefore = ruralBefore + urbanBefore;
  if (totalBefore <= 0) return invalidInspection("zero-population", "目标区域当前人口为 0，首期不自动选择新人口落点", normalizedTarget, delta);
  const totalAfter = totalBefore + delta;
  if (totalAfter < -1e-6) return invalidInspection("negative-population", "人口减少量不能超过目标区域当前总人口", normalizedTarget, delta);
  if (totalAfter > POPULATION_ADJUSTMENT_LIMITS.totalMax) return invalidInspection("population-overflow", `目标区域总人口不能超过 ${POPULATION_ADJUSTMENT_LIMITS.totalMax}`, normalizedTarget, delta);

  const safeTotalAfter = Math.max(0, totalAfter);
  const ruralAfter = ruralBefore > 0 ? safeTotalAfter * (ruralBefore / totalBefore) : 0;
  const urbanAfter = urbanBefore > 0 ? safeTotalAfter - ruralAfter : 0;
  const changedPackCells = packCells.filter(cell => Number(map.pack.cells.pop?.[cell]) > 0);
  const changedCities = cities.filter(city => Number(city.population) > 0);
  return {
    valid: true,
    code: "ok",
    reason: "",
    target: normalizedTarget,
    targetName: object.fullName || object.name || `${scopeLabel(normalizedTarget.scope)} #${normalizedTarget.id}`,
    delta,
    packCells,
    cityIds: cities.map(city => Number(city.id)),
    changedPackCells,
    changedCityIds: changedCities.map(city => Number(city.id)),
    ruralBefore: round(ruralBefore, 6),
    ruralAfter: round(ruralAfter, 6),
    urbanBefore: round(urbanBefore, 6),
    urbanAfter: round(urbanAfter, 6),
    totalBefore: round(totalBefore, 6),
    totalAfter: round(safeTotalAfter, 6),
    changed: changedPackCells.length > 0 || changedCities.length > 0
  };
}

export function buildPopulationAdjustmentPlan(map, target, options = {}) {
  const inspection = inspectPopulationAdjustment(map, target, options);
  if (!inspection.valid) throw inspectionError(inspection);
  const packChanges = distributeChanges(
    inspection.packCells.map(packCell => ({id: packCell, before: Number(map.pack.cells.pop?.[packCell]) || 0})),
    inspection.ruralAfter,
    value => Math.fround(Math.max(0, value))
  ).map(change => ({packCell: change.id, before: change.before, after: change.after}));
  const cities = collectTargetCities(map, inspection.target);
  const cityChanges = distributeChanges(
    cities.map(city => ({id: Number(city.id), before: Number(city.population) || 0, city, burg: findBurg(map, city)})),
    inspection.urbanAfter,
    value => round(Math.max(0, value), 6)
  ).map(change => ({
    cityId: change.id,
    burgId: Number(change.burg?.i ?? change.city?.burgId ?? 0),
    beforeCity: change.before,
    beforeBurg: change.burg ? Number(change.burg.population) || 0 : null,
    after: change.after
  }));
  return {...inspection, packChanges, cityChanges};
}

export function inspectPopulationTransfer(map, source, target, options = {}) {
  if (!map?.pack?.cells || !map?.grid?.cells) return invalidTransferInspection("missing-map", "当前地图缺少人口转移所需的数据");
  if (!options || typeof options !== "object" || Array.isArray(options)) return invalidTransferInspection("invalid-options", "人口转移参数必须是对象");
  const normalizedSource = normalizePopulationTarget(source);
  const normalizedTarget = normalizePopulationTarget(target);
  if (!normalizedSource) return invalidTransferInspection("invalid-source", "人口转移来源必须是有效的国家、省份、文化或宗教 ID");
  if (!normalizedTarget) return invalidTransferInspection("invalid-target", "人口转移目标必须是有效的国家、省份、文化或宗教 ID", normalizedSource);
  if (normalizedSource.scope !== normalizedTarget.scope) return invalidTransferInspection("scope-mismatch", "人口转移只允许在两个同类型区域之间进行", normalizedSource, normalizedTarget);
  if (normalizedSource.id === normalizedTarget.id) return invalidTransferInspection("same-target", "人口转移的来源与目标不能相同", normalizedSource, normalizedTarget);
  const amount = Number(options.amount);
  if (!Number.isFinite(amount) || amount <= 0) return invalidTransferInspection("invalid-amount", "人口转移量必须是正有限数", normalizedSource, normalizedTarget, amount);
  if (amount > POPULATION_ADJUSTMENT_LIMITS.deltaMax) return invalidTransferInspection("amount-range", `单次人口转移最多允许 ${POPULATION_ADJUSTMENT_LIMITS.deltaMax}`, normalizedSource, normalizedTarget, amount);

  const sourceInspection = inspectPopulationAdjustment(map, normalizedSource, {delta: -amount});
  if (!sourceInspection.valid) return invalidTransferInspection(`source-${sourceInspection.code}`, `来源区域不可转移：${sourceInspection.reason}`, normalizedSource, normalizedTarget, amount);
  const targetInspection = inspectPopulationAdjustment(map, normalizedTarget, {delta: amount});
  if (!targetInspection.valid) return invalidTransferInspection(`target-${targetInspection.code}`, `目标区域不可接收：${targetInspection.reason}`, normalizedSource, normalizedTarget, amount);
  const sourcePackCells = new Set(sourceInspection.packCells);
  if (targetInspection.packCells.some(packCell => sourcePackCells.has(packCell))) {
    return invalidTransferInspection("overlapping-carriers", "来源与目标存在重叠人口载体，无法安全转移", normalizedSource, normalizedTarget, amount);
  }
  const sourceCityIds = new Set(sourceInspection.cityIds);
  if (targetInspection.cityIds.some(cityId => sourceCityIds.has(cityId))) {
    return invalidTransferInspection("overlapping-carriers", "来源与目标存在重叠人口载体，无法安全转移", normalizedSource, normalizedTarget, amount);
  }
  return {
    valid: true,
    code: "ok",
    reason: "",
    source: normalizedSource,
    target: normalizedTarget,
    sourceName: sourceInspection.targetName,
    targetName: targetInspection.targetName,
    requestedAmount: amount,
    actualAmount: amount,
    sourceTransferable: round(Math.min(sourceInspection.totalBefore, POPULATION_ADJUSTMENT_LIMITS.deltaMax), 6),
    targetCapacity: round(Math.min(POPULATION_ADJUSTMENT_LIMITS.deltaMax, Math.max(0, POPULATION_ADJUSTMENT_LIMITS.totalMax - targetInspection.totalBefore)), 6),
    sourceBefore: sourceInspection.totalBefore,
    sourceAfter: sourceInspection.totalAfter,
    targetBefore: targetInspection.totalBefore,
    targetAfter: targetInspection.totalAfter,
    sourceRuralBefore: sourceInspection.ruralBefore,
    sourceRuralAfter: sourceInspection.ruralAfter,
    sourceUrbanBefore: sourceInspection.urbanBefore,
    sourceUrbanAfter: sourceInspection.urbanAfter,
    targetRuralBefore: targetInspection.ruralBefore,
    targetRuralAfter: targetInspection.ruralAfter,
    targetUrbanBefore: targetInspection.urbanBefore,
    targetUrbanAfter: targetInspection.urbanAfter,
    packCells: sourceInspection.packCells.length + targetInspection.packCells.length,
    cities: sourceInspection.cityIds.length + targetInspection.cityIds.length,
    changed: sourceInspection.changed || targetInspection.changed
  };
}

export function buildPopulationTransferPlan(map, source, target, options = {}) {
  const inspection = inspectPopulationTransfer(map, source, target, options);
  if (!inspection.valid) throw inspectionError(inspection);
  const sourcePlan = buildPopulationAdjustmentPlan(map, inspection.source, {delta: -inspection.actualAmount});
  const targetPlan = buildPopulationAdjustmentPlan(map, inspection.target, {delta: inspection.actualAmount});
  return {
    ...inspection,
    packChanges: [...sourcePlan.packChanges, ...targetPlan.packChanges],
    cityChanges: [...sourcePlan.cityChanges, ...targetPlan.cityChanges]
  };
}

export function createApplyPopulationTransferCommand(plan, {label = "区域人口转移", faultAt = null} = {}) {
  const normalized = normalizeTransferPlan(plan);
  let before = null;
  let after = null;
  let result = null;
  return {
    label: `${label} ${scopeLabel(normalized.source.scope)} #${normalized.source.id} → #${normalized.target.id}`,
    domain: "population-transfer",
    effects: {
      render: "draw",
      selection: "refresh",
      runtimeStats: true,
      pickPanel: true,
      affected: systemAffected("population-adjustment", [
        {kind: normalized.source.scope, id: normalized.source.id},
        {kind: normalized.target.scope, id: normalized.target.id}
      ]),
      derived: ["population-carrying", "population-stats", "point-layers", "labels", "object-panels", "economy-demand", "derived-stale"]
    },
    apply(context) {
      if (after) {
        restoreSnapshot(context.map, after);
        return;
      }
      before = captureSnapshot(context.map);
      try {
        applyPopulationPlan(context.map, normalized);
        failAt(faultAt, "after-values");
        const summary = refreshPopulationDerived(context.map, normalized);
        failAt(faultAt, "after-derived");
        result = {
          source: {...normalized.source},
          target: {...normalized.target},
          amount: normalized.actualAmount,
          packCells: normalized.packChanges.length,
          cities: normalized.cityChanges.length,
          ...summary
        };
        after = captureSnapshot(context.map);
      } catch (error) {
        restoreSnapshot(context.map, before);
        throw error;
      }
    },
    revert(context) {
      if (!before) throw new Error("缺少可撤销的人口转移快照");
      restoreSnapshot(context.map, before);
    },
    isNoop() {
      return !normalized.packChanges.length && !normalized.cityChanges.length;
    },
    getPlan() {
      return clone(normalized);
    },
    getResult() {
      return result ? clone(result) : null;
    }
  };
}

export function createApplyPopulationAdjustmentCommand(plan, {label = "区域人口增减", faultAt = null} = {}) {
  const normalized = normalizePlan(plan);
  let before = null;
  let after = null;
  let result = null;
  return {
    label: `${label} ${scopeLabel(normalized.target.scope)} #${normalized.target.id}`,
    domain: "population-adjustment",
    effects: {
      render: "draw",
      selection: "refresh",
      runtimeStats: true,
      pickPanel: true,
      affected: systemAffected("population-adjustment", [{kind: normalized.target.scope, id: normalized.target.id}]),
      derived: ["population-carrying", "population-stats", "point-layers", "labels", "object-panels", "economy-demand", "derived-stale"]
    },
    apply(context) {
      if (after) {
        restoreSnapshot(context.map, after);
        return;
      }
      before = captureSnapshot(context.map);
      try {
        applyPopulationPlan(context.map, normalized);
        failAt(faultAt, "after-values");
        const summary = refreshPopulationDerived(context.map, normalized);
        failAt(faultAt, "after-derived");
        result = {
          target: {...normalized.target},
          delta: normalized.delta,
          packCells: normalized.packChanges.length,
          cities: normalized.cityChanges.length,
          ...summary
        };
        after = captureSnapshot(context.map);
      } catch (error) {
        restoreSnapshot(context.map, before);
        throw error;
      }
    },
    revert(context) {
      if (!before) throw new Error("缺少可撤销的人口调整快照");
      restoreSnapshot(context.map, before);
    },
    isNoop() {
      return !normalized.packChanges.length && !normalized.cityChanges.length;
    },
    getPlan() {
      return clone(normalized);
    },
    getResult() {
      return result ? clone(result) : null;
    }
  };
}

export function normalizePopulationTarget(target) {
  if (typeof target === "string") {
    const [scope, id] = target.split(":");
    return normalizePopulationTarget({scope, id});
  }
  const scope = String(target?.scope || "");
  const id = Number(target?.id ?? target?.idNumber);
  if (!Object.values(POPULATION_ADJUSTMENT_SCOPE).includes(scope) || !Number.isInteger(id) || id <= 0) return null;
  return {scope, id};
}

function normalizePlan(plan) {
  const target = normalizePopulationTarget(plan?.target);
  const delta = Number(plan?.delta);
  if (!target || !Number.isFinite(delta) || delta === 0 || delta < POPULATION_ADJUSTMENT_LIMITS.deltaMin || delta > POPULATION_ADJUSTMENT_LIMITS.deltaMax) throw new Error("人口调整计划无效");
  if (!Array.isArray(plan?.packChanges) || !Array.isArray(plan?.cityChanges)) throw new Error("人口调整计划缺少变更列表");
  const packChanges = plan.packChanges.map(change => ({
    packCell: Number(change.packCell),
    before: Number(change.before),
    after: Number(change.after)
  }));
  const cityChanges = plan.cityChanges.map(change => ({
    cityId: Number(change.cityId),
    burgId: Number(change.burgId || 0),
    beforeCity: Number(change.beforeCity),
    beforeBurg: change.beforeBurg === null ? null : Number(change.beforeBurg),
    after: Number(change.after)
  }));
  if (packChanges.length > POPULATION_ADJUSTMENT_LIMITS.packCellsMax || cityChanges.length > POPULATION_ADJUSTMENT_LIMITS.citiesMax) throw new Error("人口调整计划超过单次范围上限");
  if (packChanges.some(change => ![change.packCell, change.before, change.after].every(Number.isFinite) || !Number.isInteger(change.packCell) || change.packCell < 0 || change.before < 0 || change.after < 0 || Math.abs(change.after - change.before) <= 1e-6)) throw new Error("人口调整计划包含无效 pack cell 变更");
  if (cityChanges.some(change => ![change.cityId, change.beforeCity, change.after].every(Number.isFinite) || !Number.isInteger(change.cityId) || change.cityId < 0 || change.beforeCity < 0 || change.after < 0 || Math.abs(change.after - change.beforeCity) <= 1e-6)) throw new Error("人口调整计划包含无效城市变更");
  return {target, delta, packChanges, cityChanges};
}

function normalizeTransferPlan(plan) {
  const source = normalizePopulationTarget(plan?.source);
  const target = normalizePopulationTarget(plan?.target);
  const actualAmount = Number(plan?.actualAmount);
  if (!source || !target || source.scope !== target.scope || source.id === target.id) throw new Error("人口转移计划目标无效");
  if (!Number.isFinite(actualAmount) || actualAmount <= 0 || actualAmount > POPULATION_ADJUSTMENT_LIMITS.deltaMax) throw new Error("人口转移计划数量无效");
  if (!Array.isArray(plan?.packChanges) || !Array.isArray(plan?.cityChanges)) throw new Error("人口转移计划缺少变更列表");
  const packChanges = plan.packChanges.map(change => ({packCell: Number(change.packCell), before: Number(change.before), after: Number(change.after)}));
  const cityChanges = plan.cityChanges.map(change => ({
    cityId: Number(change.cityId),
    burgId: Number(change.burgId || 0),
    beforeCity: Number(change.beforeCity),
    beforeBurg: change.beforeBurg === null ? null : Number(change.beforeBurg),
    after: Number(change.after)
  }));
  if (packChanges.length > POPULATION_ADJUSTMENT_LIMITS.packCellsMax * 2 || cityChanges.length > POPULATION_ADJUSTMENT_LIMITS.citiesMax * 2) throw new Error("人口转移计划超过单次范围上限");
  if (new Set(packChanges.map(change => change.packCell)).size !== packChanges.length || new Set(cityChanges.map(change => change.cityId)).size !== cityChanges.length) throw new Error("人口转移计划包含重叠载体");
  if (packChanges.some(change => ![change.packCell, change.before, change.after].every(Number.isFinite) || !Number.isInteger(change.packCell) || change.packCell < 0 || change.before < 0 || change.after < 0 || Math.abs(change.after - change.before) <= 1e-6)) throw new Error("人口转移计划包含无效 pack cell 变更");
  if (cityChanges.some(change => ![change.cityId, change.beforeCity, change.after].every(Number.isFinite) || !Number.isInteger(change.cityId) || change.cityId < 0 || change.beforeCity < 0 || change.after < 0 || Math.abs(change.after - change.beforeCity) <= 1e-6)) throw new Error("人口转移计划包含无效城市变更");
  return {source, target, actualAmount, packChanges, cityChanges};
}

function applyPopulationPlan(map, plan) {
  for (const change of plan.packChanges) map.pack.cells.pop[change.packCell] = change.after;
  for (const change of plan.cityChanges) {
    const city = (map.settlements?.cities || []).find(item => Number(item?.id) === change.cityId);
    if (!city || city.removed) throw new Error(`找不到城市 #${change.cityId}`);
    city.population = change.after;
    const burg = change.burgId > 0 ? map.pack?.burgs?.[change.burgId] : findBurg(map, city);
    if (burg && !burg.removed) burg.population = change.after;
  }
}

function refreshPopulationDerived(map, plan) {
  mirrorPackPopulationToGrid(map, plan.packChanges.map(change => change.packCell));
  if (map.settlements && map.pack) {
    refreshRelocatedSettlementDerived(map.grid, map.features, map.politics, map.settlements, map.pack);
  }
  syncPopulationStats(map);
  const demand = (map.economy || map.pack?.markets?.length) ? refreshPopulationDemandDiagnostics(map.pack, map.economy) : null;
  markPopulationStale(map);
  return {
    rural: round(sum(Array.from(map.pack.cells.pop || [])), 6),
    urban: round(sum((map.settlements?.cities || []).filter(city => city && !city.removed).map(city => Number(city.population) || 0)), 6),
    populationCells: Array.from(map.pack.cells.pop || []).filter(value => Number(value) > 0).length,
    demandTotal: demand ? Number(demand.totalDemand || 0) : null
  };
}

function mirrorPackPopulationToGrid(map, changedPackCells) {
  const length = map.grid?.cells?.h?.length || map.grid?.points?.length || 0;
  const targetGridCells = new Set(changedPackCells.map(packCell => Number(map.pack.cells.g?.[packCell])).filter(gridCell => Number.isInteger(gridCell) && gridCell >= 0 && gridCell < length));
  for (const gridCell of targetGridCells) {
    let population = 0;
    for (const packCell of map.pack?.cells?.i || []) {
      if (Number(map.pack.cells.g?.[packCell]) !== gridCell) continue;
      population = Math.max(population, round(Number(map.pack.cells.pop?.[packCell]) || 0, 3));
    }
    map.grid.cells.pop[gridCell] = population;
  }
}

function syncPopulationStats(map) {
  for (const {field, stores} of [
    {field: "state", stores: uniqueArrays([map.politics?.states, map.pack?.states])},
    {field: "province", stores: uniqueArrays([map.politics?.provinces, map.pack?.provinces])},
    {field: "culture", stores: uniqueArrays([map.society?.cultures, map.pack?.cultures])},
    {field: "religion", stores: uniqueArrays([map.society?.religions, map.pack?.religions])}
  ]) {
    for (const store of stores) {
      for (const item of store) {
        if (!item || item.removed || Number(item.i ?? item.id) <= 0) continue;
        item.rural = 0;
        item.urban = 0;
      }
      for (const packCell of map.pack.cells.i || []) {
        const item = store[Number(map.pack.cells[field]?.[packCell]) || 0];
        if (item && !item.removed) item.rural += Number(map.pack.cells.pop?.[packCell]) || 0;
      }
      const urbanCarriers = map.settlements?.cities || map.pack?.burgs || [];
      for (const carrier of urbanCarriers) {
        if (!carrier || carrier.removed) continue;
        const item = store[Number(carrier[field]) || 0];
        if (item && !item.removed) item.urban += Number(carrier.population) || 0;
      }
      for (const item of store) {
        if (!item || item.removed || Number(item.i ?? item.id) <= 0) continue;
        item.rural = round(item.rural, 2);
        item.urban = round(item.urban, 2);
      }
    }
  }
}

function markPopulationStale(map) {
  map.metadata ||= {};
  map.metadata.derivedStale = {
    ...(map.metadata.derivedStale || {}),
    systems: [...new Set([...(map.metadata.derivedStale?.systems || []), ...STALE_SYSTEMS])],
    updatedAt: new Date().toISOString()
  };
  for (const section of STALE_SECTIONS) if (map[section]?.metadata) map[section].metadata.stale = true;
}

function captureSnapshot(map) {
  return {
    packPopulation: cloneArray(map.pack.cells.pop),
    gridPopulation: cloneArray(map.grid.cells.pop),
    cityPopulation: (map.settlements?.cities || []).map(city => city ? {id: city.id, population: city.population} : null),
    burgPopulation: (map.pack?.burgs || []).map(burg => burg ? {i: burg.i, population: burg.population} : null),
    groupStats: captureGroupStats(map),
    settlementPopulationPoints: clone(map.settlements?.populationPoints),
    settlementMetadata: captureSectionMetadata(map, "settlements"),
    markets: uniqueArrays([map.pack?.markets, map.economy?.markets]).map(store => ({store, value: clone(store)})),
    economyMetadata: captureSectionMetadata(map, "economy"),
    derivedStale: clone(map.metadata?.derivedStale),
    sectionStale: Object.fromEntries(STALE_SECTIONS.map(section => [section, {
      present: Object.prototype.hasOwnProperty.call(map[section]?.metadata || {}, "stale"),
      value: map[section]?.metadata?.stale
    }]))
  };
}

function restoreSnapshot(map, snapshot) {
  restoreField(map.pack.cells, "pop", snapshot.packPopulation);
  restoreField(map.grid.cells, "pop", snapshot.gridPopulation);
  restorePopulationValues(map.settlements?.cities, snapshot.cityPopulation, "id");
  restorePopulationValues(map.pack?.burgs, snapshot.burgPopulation, "i");
  restoreGroupStats(snapshot.groupStats);
  if (snapshot.settlementPopulationPoints === undefined) {
    if (map.settlements) delete map.settlements.populationPoints;
  }
  else if (map.settlements) map.settlements.populationPoints = clone(snapshot.settlementPopulationPoints);
  restoreSectionMetadata(map, "settlements", snapshot.settlementMetadata);
  for (const entry of snapshot.markets || []) restoreObjectArray(entry.store, entry.value);
  restoreSectionMetadata(map, "economy", snapshot.economyMetadata);
  map.metadata ||= {};
  if (snapshot.derivedStale === undefined) delete map.metadata.derivedStale;
  else map.metadata.derivedStale = clone(snapshot.derivedStale);
  for (const [section, entry] of Object.entries(snapshot.sectionStale)) {
    if (!map[section]?.metadata) continue;
    if (entry.present) map[section].metadata.stale = entry.value;
    else delete map[section].metadata.stale;
  }
}

function captureGroupStats(map) {
  return uniqueArrays([
    map.politics?.states,
    map.pack?.states,
    map.politics?.provinces,
    map.pack?.provinces,
    map.society?.cultures,
    map.pack?.cultures,
    map.society?.religions,
    map.pack?.religions
  ]).map(store => ({
    store,
    values: store.map(item => item ? clone({
      rural: propertySnapshot(item, "rural"),
      urban: propertySnapshot(item, "urban"),
      burgs: propertySnapshot(item, "burgs"),
      civilizationProfile: propertySnapshot(item, "civilizationProfile"),
      civilizationType: propertySnapshot(item, "civilizationType"),
      civilizationLabel: propertySnapshot(item, "civilizationLabel")
    }) : null)
  }));
}

function restoreGroupStats(entries) {
  for (const {store, values} of entries || []) {
    for (let index = 0; index < values.length; index++) {
      const item = store[index];
      const snapshot = values[index];
      if (!item || !snapshot) continue;
      for (const [key, value] of Object.entries(snapshot)) restoreProperty(item, key, value);
    }
  }
}

function propertySnapshot(owner, key) {
  return {present: Object.prototype.hasOwnProperty.call(owner, key), value: clone(owner[key])};
}

function restoreProperty(owner, key, snapshot) {
  if (snapshot.present) owner[key] = clone(snapshot.value);
  else delete owner[key];
}

function restorePopulationValues(store, snapshots, key) {
  if (!Array.isArray(store)) return;
  const byId = new Map((snapshots || []).filter(Boolean).map(item => [Number(item[key]), item]));
  for (const item of store) {
    const snapshot = item && byId.get(Number(item[key]));
    if (snapshot) item.population = snapshot.population;
  }
}

function captureSectionMetadata(map, section) {
  const value = map[section];
  return {
    sectionPresent: Boolean(value),
    metadataPresent: Boolean(value && Object.prototype.hasOwnProperty.call(value, "metadata")),
    value: clone(value?.metadata)
  };
}

function restoreSectionMetadata(map, section, snapshot) {
  if (!snapshot?.sectionPresent) {
    delete map[section];
    return;
  }
  map[section] ||= {};
  if (snapshot.metadataPresent) map[section].metadata = clone(snapshot.value);
  else delete map[section].metadata;
}

function restoreObjectArray(store, snapshot) {
  if (!Array.isArray(store) || !Array.isArray(snapshot)) return;
  store.length = snapshot.length;
  for (let index = 0; index < snapshot.length; index++) {
    const value = snapshot[index];
    if (value === null || value === undefined) {
      store[index] = value;
      continue;
    }
    if (!store[index] || typeof store[index] !== "object") store[index] = clone(value);
    else restoreObject(store[index], value);
  }
}

function restoreObject(target, snapshot) {
  for (const key of Object.keys(target)) if (!Object.prototype.hasOwnProperty.call(snapshot, key)) delete target[key];
  for (const [key, value] of Object.entries(snapshot)) target[key] = clone(value);
}

function restoreField(owner, key, values) {
  const current = owner[key];
  if (Array.isArray(current)) owner[key] = [...values];
  else if (current?.constructor?.from) owner[key] = current.constructor.from(values);
  else owner[key] = [...values];
}

function collectTargetPackCells(map, target) {
  return Array.from(map.pack?.cells?.i || []).filter(packCell => Number(map.pack.cells.h?.[packCell]) >= 20 && Number(map.pack.cells[target.scope]?.[packCell]) === target.id);
}

function collectTargetCities(map, target) {
  return (map.settlements?.cities || []).filter(city => city && !city.removed && Number(city[target.scope]) === target.id);
}

function resolveTargetObject(map, target) {
  const stores = {
    state: map.politics?.states || map.pack?.states,
    province: map.politics?.provinces || map.pack?.provinces,
    culture: map.society?.cultures || map.pack?.cultures,
    religion: map.society?.religions || map.pack?.religions
  };
  return stores[target.scope]?.[target.id] || null;
}

function findBurg(map, city) {
  return map.pack?.burgs?.[city?.burgId] || (map.pack?.burgs || []).find(burg => burg?.cityId === city?.id) || null;
}

function distributeChanges(entries, targetTotal, normalize) {
  const positive = entries.filter(entry => entry.before > 0);
  const beforeTotal = sum(positive.map(entry => entry.before));
  if (!positive.length || beforeTotal <= 0) return [];
  const changes = [];
  let assigned = 0;
  for (let index = 0; index < positive.length; index++) {
    const entry = positive[index];
    const raw = index === positive.length - 1 ? targetTotal - assigned : targetTotal * (entry.before / beforeTotal);
    const after = normalize(raw);
    assigned += after;
    if (Math.abs(after - entry.before) > 1e-6) changes.push({...entry, after});
  }
  return changes;
}

function invalidInspection(code, reason, target = null, delta = null) {
  return {valid: false, code, reason, target, delta, packCells: [], cityIds: [], changedPackCells: [], changedCityIds: [], changed: false};
}

function invalidTransferInspection(code, reason, source = null, target = null, requestedAmount = null) {
  return {
    valid: false,
    code,
    reason,
    source,
    target,
    requestedAmount,
    actualAmount: 0,
    sourceTransferable: 0,
    targetCapacity: 0,
    changed: false
  };
}

function inspectionError(inspection) {
  const error = new Error(inspection.reason);
  error.code = inspection.code;
  return error;
}

function scopeLabel(scope) {
  if (scope === "state") return "国家";
  if (scope === "province") return "省份";
  if (scope === "culture") return "文化";
  return "宗教";
}

function failAt(actual, expected) {
  if (actual === expected) throw new Error(`population adjustment fault: ${expected}`);
}

function uniqueArrays(arrays) {
  return arrays.filter((value, index) => Array.isArray(value) && arrays.indexOf(value) === index);
}

function cloneArray(value) {
  return value?.slice ? value.slice() : Array.from(value || []);
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sum(values = []) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function round(value, digits = 0) {
  const scale = 10 ** digits;
  return Math.round((Number(value) || 0) * scale) / scale;
}
