#!/usr/bin/env node
import assert from "node:assert/strict";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createMapDocument, parseMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {
  POPULATION_ADJUSTMENT_LIMITS,
  buildPopulationAdjustmentPlan,
  createApplyPopulationAdjustmentCommand,
  inspectPopulationAdjustment
} from "../app/webgl-generator/src/runtime/population-adjustment-commands.js";

const seed = "population-adjustment-regression";
const base = generatePlaceholderMap({seed, cellsTarget: 5000, heightmapTemplate: "continents", culturesNumber: 8, religionsNumber: 5});
const target = findTarget(base, "state", inspection => inspection.ruralBefore > 0 && inspection.urbanBefore > 0);
assert(target, "缺少同时含城乡人口的国家样本");

for (const scope of ["state", "province", "culture", "religion"]) {
  const scoped = findTarget(base, scope, inspection => inspection.totalBefore > 0);
  assert(scoped, `缺少可用的 ${scope} 人口目标`);
  assert.equal(inspectPopulationAdjustment(base, scoped, {delta: 1}).valid, true, `${scope} 预检失败`);
}

assert.equal(inspectPopulationAdjustment(base, target, null).code, "invalid-options");
assert.equal(inspectPopulationAdjustment(base, {scope: "world", id: 1}, {delta: 1}).code, "invalid-target");
assert.equal(inspectPopulationAdjustment(base, {scope: "state", id: 999999}, {delta: 1}).code, "missing-target");
assert.equal(inspectPopulationAdjustment(base, target, {delta: 0}).code, "invalid-delta");
assert.equal(inspectPopulationAdjustment(base, target, {delta: POPULATION_ADJUSTMENT_LIMITS.deltaMax + 1}).code, "delta-range");
const targetBefore = inspectPopulationAdjustment(base, target, {delta: 250});
assert.equal(inspectPopulationAdjustment(base, target, {delta: -targetBefore.totalBefore - 1}).code, targetBefore.totalBefore + 1 > Math.abs(POPULATION_ADJUSTMENT_LIMITS.deltaMin) ? "delta-range" : "negative-population");

const map = structuredClone(base);
const immutableBefore = immutableSnapshot(map);
const inspectBefore = transactionSnapshot(map);
const inspection = inspectPopulationAdjustment(map, target, {delta: 250});
assert.equal(inspection.valid, true, inspection.reason);
assert.deepEqual(transactionSnapshot(map), inspectBefore, "结构化预检修改了地图");
const gridPopulationBefore = [...map.grid.cells.pop];
const history = new EditHistory();
const plan = buildPopulationAdjustmentPlan(map, target, {delta: 250});
const command = createApplyPopulationAdjustmentCommand(plan);
history.execute(command, {map});
assert.equal(history.getStats().undo, 1, "一次区域人口增减没有形成单条历史");
const applied = inspectPopulationAdjustment(map, target, {delta: 1});
assertClose(applied.totalBefore, inspection.totalAfter, 0.02, "区域总人口增量不准确");
assertClose(applied.ruralBefore / applied.totalBefore, inspection.ruralBefore / inspection.totalBefore, 0.0001, "乡村人口比例漂移");
assertClose(applied.urbanBefore / applied.totalBefore, inspection.urbanBefore / inspection.totalBefore, 0.0001, "城市人口比例漂移");
assertZeroCarriersStayedZero(map, plan);
assertUnrelatedGridPopulationUnchanged(map, plan, gridPopulationBefore);
assertCityBurgMirrors(map);
assertPopulationStats(map);
assert(map.metadata.derivedStale.systems.every(Boolean), "人口调整没有写入下游 stale");
for (const system of ["economy", "military", "diplomacy", "zones"]) assert(map.metadata.derivedStale.systems.includes(system), `缺少 ${system} stale`);
assert.notDeepEqual(map.economy?.metadata?.demand, base.economy?.metadata?.demand, "经济需求摘要没有随人口更新");
assert.deepEqual(immutableSnapshot(map), immutableBefore, "人口调整修改了高度、适居度或归属");
const after = transactionSnapshot(map);
history.undo({map});
assert.deepEqual(transactionSnapshot(map), inspectBefore, "人口调整撤销没有精确恢复");
history.redo({map});
assert.deepEqual(transactionSnapshot(map), after, "人口调整重做没有精确恢复");

const negativeMap = structuredClone(base);
const negativeTarget = findTarget(negativeMap, "province", candidate => candidate.totalBefore > 0 && candidate.totalBefore <= Math.abs(POPULATION_ADJUSTMENT_LIMITS.deltaMin));
assert(negativeTarget, "缺少可减到零的省份样本");
const negativeInspection = inspectPopulationAdjustment(negativeMap, negativeTarget, {delta: -negativeTarget.totalBefore});
assert.equal(negativeInspection.valid, true, negativeInspection.reason);
createApplyPopulationAdjustmentCommand(buildPopulationAdjustmentPlan(negativeMap, negativeTarget, {delta: -negativeTarget.totalBefore})).apply({map: negativeMap});
const zeroResult = inspectPopulationAdjustment(negativeMap, negativeTarget, {delta: 1});
assert.equal(zeroResult.code, "zero-population", "精确减到零后仍存在目标人口");

const zeroMap = structuredClone(base);
zeroTargetPopulation(zeroMap, target);
assert.equal(inspectPopulationAdjustment(zeroMap, target, {delta: 1}).code, "zero-population", "全零目标没有被拒绝");

const overflowMap = structuredClone(base);
const overflowCell = targetPackCells(overflowMap, target)[0];
assert(Number.isInteger(overflowCell), "缺少溢出测试 cell");
for (const cell of targetPackCells(overflowMap, target)) overflowMap.pack.cells.pop[cell] = 0;
for (const city of targetCities(overflowMap, target)) setCityPopulation(overflowMap, city, 0);
overflowMap.pack.cells.pop[overflowCell] = POPULATION_ADJUSTMENT_LIMITS.totalMax;
assert.equal(inspectPopulationAdjustment(overflowMap, target, {delta: 1}).code, "population-overflow", "人口总量溢出没有被拒绝");

for (const faultAt of ["after-values", "after-derived"]) {
  const faultMap = structuredClone(base);
  const before = transactionSnapshot(faultMap);
  const faultPlan = buildPopulationAdjustmentPlan(faultMap, target, {delta: 10});
  assert.throws(() => createApplyPopulationAdjustmentCommand(faultPlan, {faultAt}).apply({map: faultMap}), new RegExp(faultAt));
  assert.deepEqual(transactionSnapshot(faultMap), before, `${faultAt} 故障没有完整回滚`);
}

const legacy = structuredClone(base);
delete legacy.economy;
delete legacy.pack.goods;
const legacyBefore = transactionSnapshot(legacy);
const legacyHistory = new EditHistory();
legacyHistory.execute(createApplyPopulationAdjustmentCommand(buildPopulationAdjustmentPlan(legacy, target, {delta: 15})), {map: legacy});
assert.equal(Object.prototype.hasOwnProperty.call(legacy.pack, "goods"), false, "旧图人口调整错误新增 goods");
legacyHistory.undo({map: legacy});
assert.deepEqual(transactionSnapshot(legacy), legacyBefore, "稀疏旧图撤销没有精确恢复");
legacyHistory.redo({map: legacy});
assert.equal(Object.prototype.hasOwnProperty.call(legacy, "economy"), false, "稀疏旧图重做错误新增 economy");

const roundtrip = parseMapDocument(stringifyMapDocument(createMapDocument(map, map.options))).map;
assert.deepEqual([...roundtrip.pack.cells.pop], [...map.pack.cells.pop], "完整地图往返丢失 pack 人口");
assert.deepEqual(cityPopulationSnapshot(roundtrip), cityPopulationSnapshot(map), "完整地图往返丢失城市人口");
assertPopulationStats(roundtrip);

assertRangeLimits(base, target);

console.log(JSON.stringify({
  ok: true,
  seed,
  target,
  adjustment: {delta: 250, before: inspection.totalBefore, after: applied.totalBefore, rural: applied.ruralBefore, urban: applied.urbanBefore},
  limits: POPULATION_ADJUSTMENT_LIMITS,
  compatibility: {undoRedo: true, fullMapRoundtrip: true, sparseOldMap: true, faultStages: 2, heightAndSuitabilityUnaffected: true},
  history: history.getStats()
}, null, 2));

function findTarget(map, scope, predicate) {
  const store = targetStore(map, scope);
  for (const item of store || []) {
    const id = Number(item?.i ?? item?.id);
    if (!item || item.removed || id <= 0) continue;
    const target = {scope, id};
    const inspection = inspectPopulationAdjustment(map, target, {delta: 1});
    if (inspection.valid && predicate(inspection)) return {
      ...target,
      totalBefore: inspection.totalBefore,
      ruralBefore: inspection.ruralBefore,
      urbanBefore: inspection.urbanBefore
    };
  }
  return null;
}

function targetStore(map, scope) {
  if (scope === "state") return map.politics?.states || map.pack?.states;
  if (scope === "province") return map.politics?.provinces || map.pack?.provinces;
  return map.society?.[`${scope}s`] || map.pack?.[`${scope}s`];
}

function targetPackCells(map, target) {
  return (map.pack.cells.i || []).filter(cell => map.pack.cells.h[cell] >= 20 && Number(map.pack.cells[target.scope]?.[cell]) === Number(target.id));
}

function targetCities(map, target) {
  return (map.settlements?.cities || []).filter(city => city && !city.removed && Number(city[target.scope]) === Number(target.id));
}

function zeroTargetPopulation(map, target) {
  for (const cell of targetPackCells(map, target)) map.pack.cells.pop[cell] = 0;
  for (const city of targetCities(map, target)) setCityPopulation(map, city, 0);
}

function setCityPopulation(map, city, population) {
  city.population = population;
  const burg = map.pack.burgs?.[city.burgId] || map.pack.burgs?.find(item => item?.cityId === city.id);
  if (burg) burg.population = population;
}

function assertZeroCarriersStayedZero(map, plan) {
  const changedCells = new Set(plan.packChanges.map(change => change.packCell));
  for (const cell of plan.packCells) if (plan.packChanges.find(change => change.packCell === cell)?.before === 0 || (!changedCells.has(cell) && Number(base.pack.cells.pop[cell]) === 0)) assert.equal(Number(map.pack.cells.pop[cell]), 0, `零人口 cell #${cell} 获得了人口`);
  const changedCities = new Set(plan.cityChanges.map(change => change.cityId));
  for (const cityId of plan.cityIds) if (!changedCities.has(cityId)) {
    const city = map.settlements.cities.find(item => Number(item?.id) === cityId);
    if (Number(base.settlements.cities.find(item => Number(item?.id) === cityId)?.population || 0) === 0) assert.equal(Number(city?.population || 0), 0, `零人口城市 #${cityId} 获得了人口`);
  }
}

function assertCityBurgMirrors(map) {
  for (const city of map.settlements?.cities || []) {
    if (!city || city.removed) continue;
    const burg = map.pack.burgs?.[city.burgId] || map.pack.burgs?.find(item => item?.cityId === city.id);
    if (burg && !burg.removed) assertClose(Number(city.population) || 0, Number(burg.population) || 0, 1e-6, `城市 #${city.id} 与 burg 人口不一致`);
  }
}

function assertUnrelatedGridPopulationUnchanged(map, plan, before) {
  const targetGridCells = new Set(plan.packChanges.map(change => Number(map.pack.cells.g?.[change.packCell])));
  for (let gridCell = 0; gridCell < before.length; gridCell++) {
    if (targetGridCells.has(gridCell)) continue;
    assert.equal(Number(map.grid.cells.pop[gridCell]), Number(before[gridCell]), `无关 grid cell #${gridCell} 人口被改写`);
  }
}

function assertPopulationStats(map) {
  for (const scope of ["state", "province", "culture", "religion"]) {
    for (const store of [...new Set([targetStore(map, scope), map.pack?.[`${scope}s`]].filter(Array.isArray))]) {
      for (const item of store) {
        const id = Number(item?.i ?? item?.id);
        if (!item || item.removed || id <= 0) continue;
        const rural = targetPackCells(map, {scope, id}).reduce((sum, cell) => sum + (Number(map.pack.cells.pop[cell]) || 0), 0);
        const urban = targetCities(map, {scope, id}).reduce((sum, city) => sum + (Number(city.population) || 0), 0);
        assertClose(Number(item.rural) || 0, rural, 0.011, `${scope} #${id} 乡村汇总不一致`);
        assertClose(Number(item.urban) || 0, urban, 0.011, `${scope} #${id} 城市汇总不一致`);
      }
    }
  }
}

function assertRangeLimits(map, target) {
  const packRangeMap = minimalRangeMap(map, target);
  packRangeMap.pack.cells.i = Array.from({length: POPULATION_ADJUSTMENT_LIMITS.packCellsMax + 1}, (_, index) => index);
  packRangeMap.pack.cells.h = new Uint8Array(packRangeMap.pack.cells.i.length).fill(20);
  packRangeMap.pack.cells[target.scope] = new Uint16Array(packRangeMap.pack.cells.i.length).fill(target.id);
  packRangeMap.pack.cells.pop = new Float32Array(packRangeMap.pack.cells.i.length).fill(1);
  assert.equal(inspectPopulationAdjustment(packRangeMap, target, {delta: 1}).code, "pack-range", "pack cell 范围上限没有生效");

  const cityRangeMap = minimalRangeMap(map, target);
  cityRangeMap.settlements.cities = Array.from({length: POPULATION_ADJUSTMENT_LIMITS.citiesMax + 1}, (_, id) => ({id, [target.scope]: target.id, population: 1}));
  assert.equal(inspectPopulationAdjustment(cityRangeMap, target, {delta: 1}).code, "city-range", "城市范围上限没有生效");
}

function minimalRangeMap(map, target) {
  const object = structuredClone(targetStore(map, target.scope)[target.id]);
  const result = {
    grid: {cells: {h: new Uint8Array(1)}},
    pack: {cells: {i: [], h: new Uint8Array(0), pop: new Float32Array(0), [target.scope]: new Uint16Array(0)}},
    settlements: {cities: []},
    politics: {},
    society: {}
  };
  if (target.scope === "state" || target.scope === "province") result.politics[`${target.scope}s`] = Array.from({length: target.id + 1}, (_, id) => id === target.id ? object : null);
  else result.society[`${target.scope}s`] = Array.from({length: target.id + 1}, (_, id) => id === target.id ? object : null);
  return result;
}

function immutableSnapshot(map) {
  return {
    gridHeight: [...map.grid.cells.h],
    packHeight: [...map.pack.cells.h],
    gridSuitability: [...map.grid.cells.s],
    packSuitability: [...map.pack.cells.s],
    state: [...map.pack.cells.state],
    province: [...map.pack.cells.province],
    culture: [...map.pack.cells.culture],
    religion: [...map.pack.cells.religion]
  };
}

function transactionSnapshot(map) {
  return JSON.parse(JSON.stringify({
    packPopulation: [...map.pack.cells.pop],
    gridPopulation: [...map.grid.cells.pop],
    cities: cityPopulationSnapshot(map),
    burgs: (map.pack.burgs || []).map(item => item && ({i: item.i, population: item.population})),
    states: groupSnapshot(map.politics?.states),
    packStates: groupSnapshot(map.pack?.states),
    provinces: groupSnapshot(map.politics?.provinces),
    packProvinces: groupSnapshot(map.pack?.provinces),
    cultures: groupSnapshot(map.society?.cultures),
    packCultures: groupSnapshot(map.pack?.cultures),
    religions: groupSnapshot(map.society?.religions),
    packReligions: groupSnapshot(map.pack?.religions),
    settlements: map.settlements ? {populationPoints: map.settlements.populationPoints, metadata: map.settlements.metadata} : null,
    markets: map.pack.markets,
    economy: map.economy?.metadata || null,
    goodsPresent: Object.prototype.hasOwnProperty.call(map.pack, "goods"),
    stale: map.metadata?.derivedStale || null,
    sectionStale: ["economy", "military", "diplomacy", "zones"].map(section => map[section]?.metadata?.stale)
  }));
}

function groupSnapshot(items) {
  return (items || []).map(item => item && ({i: item.i ?? item.id, rural: item.rural, urban: item.urban, burgs: item.burgs, civilizationProfile: item.civilizationProfile, civilizationType: item.civilizationType, civilizationLabel: item.civilizationLabel}));
}

function cityPopulationSnapshot(map) {
  return (map.settlements?.cities || []).map(item => item && ({id: item.id, population: item.population}));
}

function assertClose(actual, expected, tolerance, message) {
  assert(Math.abs(Number(actual) - Number(expected)) <= tolerance, `${message}：${actual} !== ${expected}`);
}
