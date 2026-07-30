#!/usr/bin/env node
import assert from "node:assert/strict";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {createCityScaleContext, deriveCityScale} from "../app/webgl-generator/src/runtime/city-visuals.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createMapDocument, parseMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {
  POPULATION_ADJUSTMENT_LIMITS,
  buildPopulationTransferPlan,
  createApplyPopulationTransferCommand,
  inspectPopulationAdjustment,
  inspectPopulationTransfer
} from "../app/webgl-generator/src/runtime/population-adjustment-commands.js";

const seed = "population-transfer-regression";
const base = generatePlaceholderMap({seed, cellsTarget: 6000, heightmapTemplate: "continents", culturesNumber: 8, religionsNumber: 5});
const amount = 50;
const [source, target] = findPair(base, "state", amount);
assert(source && target, "缺少两个可安全转移人口的国家样本");

for (const scope of ["state", "province", "culture", "religion"]) {
  const pair = findPair(base, scope, 1);
  assert(pair[0] && pair[1], `缺少 ${scope} 同类型转移样本`);
  assert.equal(inspectPopulationTransfer(base, pair[0], pair[1], {amount: 1}).valid, true, `${scope} 转移预检失败`);
}

assert.equal(inspectPopulationTransfer(base, source, target, null).code, "invalid-options");
assert.equal(inspectPopulationTransfer(base, source, source, {amount}).code, "same-target");
assert.equal(inspectPopulationTransfer(base, source, findTarget(base, "province"), {amount}).code, "scope-mismatch");
assert.equal(inspectPopulationTransfer(base, source, target, {amount: 0}).code, "invalid-amount");
assert.equal(inspectPopulationTransfer(base, source, target, {amount: POPULATION_ADJUSTMENT_LIMITS.deltaMax + 1}).code, "amount-range");

const map = structuredClone(base);
const before = digest(map);
const globalBefore = globalPopulation(map);
const inspection = inspectPopulationTransfer(map, source, target, {amount});
assert.equal(inspection.valid, true, inspection.reason);
assert.deepEqual(digest(map), before, "人口转移预检修改了地图");
assert.equal(inspection.actualAmount, amount);
assert(inspection.sourceTransferable >= amount, "来源可转移人口小于实际转移量");
assert(inspection.targetCapacity >= amount, "目标容量小于实际转移量");

const plan = buildPopulationTransferPlan(map, source, target, {amount});
const history = new EditHistory();
history.execute(createApplyPopulationTransferCommand(plan), {map});
assert.equal(history.getStats().undo, 1, "一次人口转移没有形成单条历史");
assert.equal(history.getStats().lastDomain, "population-transfer");
const globalAfter = globalPopulation(map);
assertClose(globalAfter, globalBefore, 0.05, "全图人口未守恒");
const sourceAfter = inspectPopulationAdjustment(map, source, {delta: 1});
const targetAfter = inspectPopulationAdjustment(map, target, {delta: 1});
assert.equal(sourceAfter.valid, true, sourceAfter.reason);
assert.equal(targetAfter.valid, true, targetAfter.reason);
assertClose(sourceAfter.totalBefore, inspection.sourceAfter, 0.03, "来源人口减少不准确");
assertClose(targetAfter.totalBefore, inspection.targetAfter, 0.03, "目标人口增加不准确");
assertRatioPreserved(inspection.sourceRuralBefore, inspection.sourceUrbanBefore, sourceAfter.ruralBefore, sourceAfter.urbanBefore, "来源");
assertRatioPreserved(inspection.targetRuralBefore, inspection.targetUrbanBefore, targetAfter.ruralBefore, targetAfter.urbanBefore, "目标");
assertCityBurgMirrors(map);
assertCityScaleContract(map);
assert(map.metadata?.derivedStale?.systems?.includes("economy"), "人口转移没有标记经济 stale");
const after = digest(map);
history.undo({map});
assert.deepEqual(digest(map), before, "人口转移撤销没有精确恢复");
history.redo({map});
assert.deepEqual(digest(map), after, "人口转移重做没有精确恢复");

const zeroTargetMap = structuredClone(base);
zeroPopulation(zeroTargetMap, target);
assert.equal(inspectPopulationTransfer(zeroTargetMap, source, target, {amount}).code, "target-zero-population", "零人口目标没有被拒绝");

for (const faultAt of ["after-values", "after-derived"]) {
  const faultMap = structuredClone(base);
  const faultBefore = digest(faultMap);
  const faultPlan = buildPopulationTransferPlan(faultMap, source, target, {amount});
  assert.throws(() => createApplyPopulationTransferCommand(faultPlan, {faultAt}).apply({map: faultMap}), new RegExp(faultAt));
  assert.deepEqual(digest(faultMap), faultBefore, `${faultAt} 故障没有完整回滚`);
}

const legacy = structuredClone(base);
delete legacy.economy;
delete legacy.pack.goods;
const legacyBefore = digest(legacy);
const legacyHistory = new EditHistory();
legacyHistory.execute(createApplyPopulationTransferCommand(buildPopulationTransferPlan(legacy, source, target, {amount})), {map: legacy});
assert.equal(Object.prototype.hasOwnProperty.call(legacy, "economy"), false, "旧图人口转移错误新增 economy");
assert.equal(Object.prototype.hasOwnProperty.call(legacy.pack, "goods"), false, "旧图人口转移错误新增 goods");
legacyHistory.undo({map: legacy});
assert.deepEqual(digest(legacy), legacyBefore, "稀疏旧图撤销没有精确恢复");
legacyHistory.redo({map: legacy});
assert.equal(Object.prototype.hasOwnProperty.call(legacy, "economy"), false, "稀疏旧图重做错误新增 economy");

const roundtrip = parseMapDocument(stringifyMapDocument(createMapDocument(map, map.options))).map;
assert.deepEqual([...roundtrip.pack.cells.pop], [...map.pack.cells.pop], "完整地图往返丢失 pack 人口");
assert.deepEqual(cityPopulations(roundtrip), cityPopulations(map), "完整地图往返丢失城市人口");
assertCityScaleContract(roundtrip);

console.log(JSON.stringify({
  ok: true,
  seed,
  source,
  target,
  amount,
  conservationError: Number((globalAfter - globalBefore).toFixed(6)),
  inspection: {
    sourceTransferable: inspection.sourceTransferable,
    targetCapacity: inspection.targetCapacity,
    actualAmount: inspection.actualAmount
  },
  compatibility: {undoRedo: true, fullMapRoundtrip: true, sparseOldMap: true, faultStages: 2, cityScaleContract: true},
  history: history.getStats()
}, null, 2));

function findPair(map, scope, transferAmount) {
  const targets = [];
  for (const item of targetStore(map, scope) || []) {
    const id = Number(item?.i ?? item?.id);
    if (!item || item.removed || id <= 0) continue;
    const candidate = {scope, id};
    if (inspectPopulationAdjustment(map, candidate, {delta: transferAmount}).valid) targets.push(candidate);
  }
  for (const sourceTarget of targets) {
    for (const targetTarget of targets) {
      if (inspectPopulationTransfer(map, sourceTarget, targetTarget, {amount: transferAmount}).valid) return [sourceTarget, targetTarget];
    }
  }
  return [null, null];
}

function findTarget(map, scope) {
  for (const item of targetStore(map, scope) || []) {
    const id = Number(item?.i ?? item?.id);
    if (item && !item.removed && id > 0) return {scope, id};
  }
  return null;
}

function targetStore(map, scope) {
  if (scope === "state" || scope === "province") return map.politics?.[`${scope}s`] || map.pack?.[`${scope}s`];
  return map.society?.[`${scope}s`] || map.pack?.[`${scope}s`];
}

function zeroPopulation(map, target) {
  for (const cell of map.pack.cells.i || []) if (Number(map.pack.cells[target.scope]?.[cell]) === target.id) map.pack.cells.pop[cell] = 0;
  for (const city of map.settlements?.cities || []) {
    if (!city || city.removed || Number(city[target.scope]) !== target.id) continue;
    city.population = 0;
    const burg = map.pack?.burgs?.[city.burgId] || map.pack?.burgs?.find(item => item?.cityId === city.id);
    if (burg) burg.population = 0;
  }
}

function globalPopulation(map) {
  return [...(map.pack?.cells?.pop || [])].reduce((sum, value) => sum + (Number(value) || 0), 0)
    + (map.settlements?.cities || []).reduce((sum, city) => sum + (Number(city?.population) || 0), 0);
}

function assertRatioPreserved(ruralBefore, urbanBefore, ruralAfter, urbanAfter, label) {
  const before = ruralBefore + urbanBefore;
  const after = ruralAfter + urbanAfter;
  if (before <= 0 || after <= 0) return;
  assertClose(ruralAfter / after, ruralBefore / before, 0.0001, `${label}城乡比例漂移`);
}

function assertCityBurgMirrors(map) {
  for (const city of map.settlements?.cities || []) {
    if (!city || city.removed) continue;
    const burg = map.pack?.burgs?.[city.burgId] || map.pack?.burgs?.find(item => item?.cityId === city.id);
    if (burg && !burg.removed) assertClose(Number(city.population) || 0, Number(burg.population) || 0, 1e-6, `城市 #${city.id} 与 burg 人口不一致`);
  }
}

function assertCityScaleContract(map) {
  const context = createCityScaleContext(map.settlements?.cities, map.pack?.burgs);
  for (const city of map.settlements?.cities || []) {
    if (!city || city.removed) continue;
    const burg = map.pack?.burgs?.[city.burgId] || map.pack?.burgs?.find(item => Number(item?.cityId) === Number(city.id));
    const expected = deriveCityScale(city, context, burg);
    assert.equal(city.group, expected, `城市 #${city.id} 规模分组未随人口转移更新`);
    if (!city.visual?.manual) assert.equal(city.visual?.silhouette, expected, `城市 #${city.id} 自动剪影未随人口转移更新`);
    if (!burg || burg.removed) continue;
    assert.equal(burg.group, expected, `burg #${city.burgId} 规模分组未随人口转移更新`);
    if (!burg.visual?.manual) assert.equal(burg.visual?.silhouette, expected, `burg #${city.burgId} 自动剪影未随人口转移更新`);
    assert.deepEqual(burg.visual, city.visual, `城市 #${city.id} 与 burg 视觉镜像不一致`);
  }
}

function digest(map) {
  const stale = structuredClone(map.metadata?.derivedStale || null);
  if (stale) delete stale.updatedAt;
  return JSON.parse(JSON.stringify({
    gridPopulation: [...map.grid.cells.pop],
    packPopulation: [...map.pack.cells.pop],
    cities: cityPopulations(map),
    burgs: (map.pack?.burgs || []).map(burg => burg && ({i: burg.i, population: burg.population, group: burg.group, visual: burg.visual})),
    states: stats(map.politics?.states),
    provinces: stats(map.politics?.provinces),
    cultures: stats(map.society?.cultures),
    religions: stats(map.society?.religions),
    populationPoints: map.settlements?.populationPoints,
    settlementMetadata: map.settlements?.metadata,
    markets: map.pack?.markets,
    economyMetadata: map.economy?.metadata,
    stale
  }));
}

function cityPopulations(map) {
  return (map.settlements?.cities || []).map(city => city && ({id: city.id, population: city.population, group: city.group, visual: city.visual}));
}

function stats(items) {
  return (items || []).map(item => item && ({i: item.i ?? item.id, rural: item.rural, urban: item.urban, burgs: item.burgs}));
}

function assertClose(actual, expected, tolerance, message) {
  assert(Math.abs(Number(actual) - Number(expected)) <= tolerance, `${message}: ${actual} != ${expected}`);
}
