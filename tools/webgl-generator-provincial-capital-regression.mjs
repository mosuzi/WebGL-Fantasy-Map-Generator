#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {finalizeSettlements} from "../app/webgl-generator/src/generator/settlements.js";
import {
  applyProvincialCapitalPlan,
  inspectProvincialCapitalReassessment
} from "../app/webgl-generator/src/generator/provincial-capitals.js";
import {createReassessProvincialCapitalsCommand} from "../app/webgl-generator/src/runtime/provincial-capital-edit-commands.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";

const counterexample = createFixture({
  cities: [
    city(150, 151, 0, 1.179, {provincial: true, manual: true}),
    city(284, 285, 1, 3.997, {suitability: 60, resource: 8, port: 1})
  ],
  provinceBurg: 151,
  pole: [10, 0]
});
const counterPreview = inspectProvincialCapitalReassessment(counterexample, {provinceIds: [1]});
assert.equal(counterPreview.allowed, true, "#150 / #284 反例应形成可执行预览");
assert.equal(counterPreview.changes[0].currentCityId, 150);
assert.equal(counterPreview.changes[0].nextCityId, 284, "1.179 的旧锚点不得压过 3.997 的城市");
assert.equal(counterPreview.changes[0].candidateBand.length, 1, "明显落后的 #150 不应进入 75% 候选带");

const closePopulation = createFixture({
  cities: [
    city(10, 11, 0, 10, {provincial: true, suitability: 5}),
    city(20, 21, 1, 9.8, {suitability: 100, resource: 20, port: 1})
  ],
  provinceBurg: 11,
  pole: [10, 0]
});
const closePreview = inspectProvincialCapitalReassessment(closePopulation, {provinceId: 1});
assert.equal(closePreview.changes[0].nextCityId, 20, "人口接近时中心性、适居度、资源与可达性应可胜出");
assert(closePreview.changes[0].selected.score > closePreview.changes[0].candidateBand.find(item => item.cityId === 10).score);

const deterministicA = inspectProvincialCapitalReassessment(clone(closePopulation), {provinceIds: [1]});
const deterministicB = inspectProvincialCapitalReassessment(clone(closePopulation), {provinceIds: [1]});
assert.deepEqual(deterministicA, deterministicB, "相同输入的选择、得分和 fingerprint 必须一致");

const nationalCapital = clone(closePopulation);
nationalCapital.politics.states[1].capital = 11;
nationalCapital.pack.states[1].capital = 11;
const nationalPreview = inspectProvincialCapitalReassessment(nationalCapital, {provinceId: 1});
assert.equal(nationalPreview.allowed, false);
assert.equal(nationalPreview.unchanged[0].selectionReason, "national-capital", "国家首都必须默认兼任省会");

for (const entry of [{kind: "province", id: 1}, {kind: "city", id: 10}]) {
  const locked = clone(closePopulation);
  locked.regenerationLocks.entries = [entry];
  const preview = inspectProvincialCapitalReassessment(locked, {provinceId: 1});
  assert.equal(preview.code, "protected", `${entry.kind} 锁没有保护当前省会`);
  assert.equal(preview.changes.length, 0);
}
const candidateLocked = clone(closePopulation);
candidateLocked.regenerationLocks.entries = [{kind: "city", id: 20}];
const candidateLockedPreview = inspectProvincialCapitalReassessment(candidateLocked, {provinceId: 1});
assert.equal(candidateLockedPreview.allowed, false, "锁定非现任候选不得被提升");
assert.equal(candidateLockedPreview.unchanged[0].nextCityId, 10);
const dirtyLocked = clone(closePopulation);
dirtyLocked.regenerationLocks.entries = [{kind: "province", id: 1}];
dirtyLocked.pack.burgs[11].provincial = false;
const dirtyLockedPreview = inspectProvincialCapitalReassessment(dirtyLocked, {provinceId: 1});
assert.equal(dirtyLockedPreview.code, "rejected", "锁定脏数据不应被误报为 protected");
assert.equal(dirtyLockedPreview.rejected[0].code, "locked-capital-inconsistent");
const dirtyLockedCenter = clone(closePopulation);
dirtyLockedCenter.regenerationLocks.entries = [{kind: "province", id: 1}];
dirtyLockedCenter.politics.provinces[1].center = 1;
dirtyLockedCenter.politics.provinces[1].gridCenter = 1;
dirtyLockedCenter.pack.provinces[1].center = 1;
dirtyLockedCenter.pack.provinces[1].gridCenter = 1;
const dirtyLockedCenterPreview = inspectProvincialCapitalReassessment(dirtyLockedCenter, {provinceId: 1});
assert.equal(dirtyLockedCenterPreview.code, "rejected", "锁定省份的中心字段共同指错时不得误报 protected");
assert.equal(dirtyLockedCenterPreview.rejected[0].code, "locked-capital-inconsistent");
const duplicateLockedCapital = clone(closePopulation);
duplicateLockedCapital.settlements.cities[20].provincial = true;
duplicateLockedCapital.pack.burgs[21].provincial = true;
duplicateLockedCapital.regenerationLocks.entries = [{kind: "city", id: 20}];
const duplicateLockedCapitalPreview = inspectProvincialCapitalReassessment(duplicateLockedCapital, {provinceId: 1});
assert.equal(duplicateLockedCapitalPreview.code, "rejected", "非现任锁定城市的重复省会标记不得被静默清除");
assert.equal(duplicateLockedCapitalPreview.rejected[0].code, "locked-capital-inconsistent");

const transactionMap = clone(counterexample);
const beforeTransaction = fingerprintProbe(transactionMap);
const transactionRefs = {
  province: transactionMap.politics.provinces[1],
  packProvince: transactionMap.pack.provinces[1],
  city: transactionMap.settlements.cities[150],
  burg: transactionMap.pack.burgs[151],
  route: transactionMap.settlements.routes[0],
  packRoute: transactionMap.pack.routes[0]
};
const history = new EditHistory();
const command = createReassessProvincialCapitalsCommand(
  {provinceId: 1},
  {expectedFingerprint: counterPreview.fingerprint}
);
assert.equal(command.isNoop({map: transactionMap}), false);
history.execute(command, {map: transactionMap});
assert.equal(history.getStats().undo, 1, "成功重评必须恰好写一条历史");
assertProvinceCapital(transactionMap, 1, 284);
assert.equal(transactionMap.settlements.cities[150].visual.manual, true, "旧省会手工视觉被改写");
assert.equal(transactionMap.settlements.cities[150].population, 1.179);
assert.equal(transactionMap.settlements.cities[284].population, 3.997);
assert.equal(transactionMap.settlements.routes[0].toProvincial, true, "道路端点省会优先级没有刷新");
assert.equal(transactionMap.settlements.routes[0].administrativePriority, "provincial");
const afterTransaction = fingerprintProbe(transactionMap);
history.undo({map: transactionMap});
assert.deepEqual(fingerprintProbe(transactionMap), beforeTransaction, "撤销没有恢复省会与路线优先级完整快照");
assert.equal(transactionMap.politics.provinces[1], transactionRefs.province, "撤销替换了 politics province 对象引用");
assert.equal(transactionMap.pack.provinces[1], transactionRefs.packProvince, "撤销替换了 pack province 对象引用");
assert.equal(transactionMap.settlements.cities[150], transactionRefs.city, "撤销替换了 city 对象引用");
assert.equal(transactionMap.pack.burgs[151], transactionRefs.burg, "撤销替换了 burg 对象引用");
assert.equal(transactionMap.settlements.routes[0], transactionRefs.route, "撤销替换了 route 对象引用");
assert.equal(transactionMap.pack.routes[0], transactionRefs.packRoute, "撤销替换了 pack route 对象引用");
history.redo({map: transactionMap});
assert.deepEqual(fingerprintProbe(transactionMap), afterTransaction, "重做没有恢复完整结果");

const lockedRouteMap = clone(counterexample);
lockedRouteMap.regenerationLocks.entries = [{kind: "route", id: 0}];
delete lockedRouteMap.settlements.routes[0].fromProvincial;
delete lockedRouteMap.settlements.routes[0].toProvincial;
delete lockedRouteMap.settlements.routes[0].administrativePriority;
delete lockedRouteMap.pack.routes[0].fromProvincial;
delete lockedRouteMap.pack.routes[0].toProvincial;
delete lockedRouteMap.pack.routes[0].administrativePriority;
const lockedRouteBefore = {
  route: clone(lockedRouteMap.settlements.routes[0]),
  packRoute: clone(lockedRouteMap.pack.routes[0])
};
const lockedRoutePreview = inspectProvincialCapitalReassessment(lockedRouteMap, {provinceId: 1});
const lockedRouteHistory = new EditHistory();
lockedRouteHistory.execute(createReassessProvincialCapitalsCommand(
  {provinceId: 1},
  {expectedFingerprint: lockedRoutePreview.fingerprint}
), {map: lockedRouteMap});
assertProvinceCapital(lockedRouteMap, 1, 284);
assert.deepEqual(lockedRouteMap.settlements.routes[0], lockedRouteBefore.route, "显式省会重评改写了锁定 route");
assert.deepEqual(lockedRouteMap.pack.routes[0], lockedRouteBefore.packRoute, "显式省会重评改写了锁定 pack route");

const staleMap = clone(counterexample);
const staleCommand = createReassessProvincialCapitalsCommand(
  {provinceId: 1},
  {expectedFingerprint: "pcap-v1-stale"}
);
assert.throws(() => staleCommand.isNoop({map: staleMap}), error => error?.code === "preview-stale");

const noOpMap = clone(transactionMap);
const noOpPreview = inspectProvincialCapitalReassessment(noOpMap, {provinceId: 1});
const noOpHistory = new EditHistory();
const noOpCommand = createReassessProvincialCapitalsCommand(
  {provinceId: 1},
  {expectedFingerprint: noOpPreview.fingerprint}
);
assert.equal(noOpCommand.isNoop({map: noOpMap}), true);
assert.equal(noOpHistory.getStats().undo, 0, "no-op 不得写历史");

const brokenMap = clone(counterexample);
brokenMap.politics.provinces[1].burg = 999;
brokenMap.pack.provinces[1].burg = 999;
const brokenBefore = clone(brokenMap);
const brokenPreview = inspectProvincialCapitalReassessment(brokenMap, {provinceId: 1});
assert.equal(brokenPreview.code, "rejected");
assert.equal(brokenPreview.rejected[0].code, "current-capital-inconsistent");
assert.deepEqual(brokenMap, brokenBefore, "只读预览修改了旧图或破损图");

for (const mutate of [
  map => { map.pack.provinces[1].center = 999; },
  map => { map.pack.cells.burg[0] = 0; },
  map => { map.grid.cells.burg[0] = -1; },
  map => { map.pack.cells.g[0] = 1; }
]) {
  const inconsistent = clone(counterexample);
  mutate(inconsistent);
  const before = clone(inconsistent);
  const preview = inspectProvincialCapitalReassessment(inconsistent, {provinceId: 1});
  assert.equal(preview.allowed, false, "政治或 burg cell 镜像分歧被静默接受");
  assert.equal(preview.code, "rejected");
  assert.deepEqual(inconsistent, before, "镜像分歧预检修改了地图");
}

const mixedRejectedMap = clone(counterexample);
mixedRejectedMap.politics.provinces[2] = {
  i: 2,
  id: 2,
  state: 1,
  burg: 999,
  center: 0,
  gridCenter: 0,
  name: "破损省",
  fullName: "破损省",
  pole: [0, 0]
};
mixedRejectedMap.pack.provinces[2] = clone(mixedRejectedMap.politics.provinces[2]);
const mixedRejectedBefore = clone(mixedRejectedMap);
const mixedRejectedPreview = inspectProvincialCapitalReassessment(mixedRejectedMap, {all: true});
assert.equal(mixedRejectedPreview.changes.length, 1, "混合请求应保留有效省份的只读诊断");
assert.equal(mixedRejectedPreview.rejected.length, 1);
assert.equal(mixedRejectedPreview.allowed, false, "任一省份拒绝时不得允许批量请求部分执行");
assert.equal(mixedRejectedPreview.code, "rejected");
assert.throws(
  () => applyProvincialCapitalPlan(mixedRejectedMap, mixedRejectedPreview),
  error => error?.code === "plan-rejected"
);
assert.deepEqual(mixedRejectedMap, mixedRejectedBefore, "包含拒绝项的批量计划发生了部分迁都");

const orphanBurgMap = clone(counterexample);
orphanBurgMap.pack.burgs[999] = {i: 999, id: 999, province: 1, state: 1, provincial: true};
const orphanPreview = inspectProvincialCapitalReassessment(orphanBurgMap, {provinceId: 1});
assert.equal(orphanPreview.allowed, true, "重复 burg 省会标记必须形成可执行同步计划");
applyProvincialCapitalPlan(orphanBurgMap, orphanPreview);
assert.equal(orphanBurgMap.pack.burgs[999].provincial, false, "孤立 burg 遗留了重复省会标记");
assert.equal(orphanBurgMap.pack.burgs.filter(item => item?.province === 1 && item.provincial).length, 1);

const faultMap = clone(counterexample);
const faultBefore = clone(faultMap);
delete faultMap.settlements.routes[0].fromProvincial;
delete faultMap.settlements.routes[0].toProvincial;
delete faultMap.settlements.routes[0].administrativePriority;
const faultBeforeWithLegacyRoutes = clone(faultMap);
const faultRefs = {
  province: faultMap.politics.provinces[1],
  city: faultMap.settlements.cities[150],
  burg: faultMap.pack.burgs[151],
  route: faultMap.settlements.routes[0]
};
const faultPreview = inspectProvincialCapitalReassessment(faultMap, {provinceId: 1});
const faultHistory = new EditHistory();
const faultCommand = createReassessProvincialCapitalsCommand(
  {provinceId: 1},
  {
    expectedFingerprint: faultPreview.fingerprint,
    faultInjector: ({stage}) => {
      if (stage === "after-derived-stale") throw new Error("fault-after-derived-stale");
    }
  }
);
assert.throws(() => faultHistory.execute(faultCommand, {map: faultMap}), /fault-after-derived-stale/);
assert.deepEqual(faultMap, faultBeforeWithLegacyRoutes, "故障后地图没有原子回滚或恢复旧字段存在性");
assert.equal(faultMap.politics.provinces[1], faultRefs.province);
assert.equal(faultMap.settlements.cities[150], faultRefs.city);
assert.equal(faultMap.pack.burgs[151], faultRefs.burg);
assert.equal(faultMap.settlements.routes[0], faultRefs.route);
assert.equal(faultHistory.getStats().undo, 0, "故障执行不得写历史");

const directApplyMap = clone(counterexample);
const directPreview = inspectProvincialCapitalReassessment(directApplyMap, {provinceId: 1});
const preserved = {
  name: directApplyMap.politics.provinces[1].name,
  cityIds: directApplyMap.settlements.cities.filter(Boolean).map(item => item.id),
  populations: directApplyMap.settlements.cities.filter(Boolean).map(item => item.population),
  visuals: directApplyMap.settlements.cities.filter(Boolean).map(item => clone(item.visual)),
  owners: Array.from(directApplyMap.pack.cells.province)
};
applyProvincialCapitalPlan(directApplyMap, directPreview);
assert.equal(directApplyMap.politics.provinces[1].name, preserved.name);
assert.deepEqual(directApplyMap.settlements.cities.filter(Boolean).map(item => item.id), preserved.cityIds);
assert.deepEqual(directApplyMap.settlements.cities.filter(Boolean).map(item => item.population), preserved.populations);
assert.deepEqual(directApplyMap.settlements.cities.filter(Boolean).map(item => item.visual), preserved.visuals);
assert.deepEqual(Array.from(directApplyMap.pack.cells.province), preserved.owners, "省会重评不得重画省界");

const generationMatrix = [];
for (const cellsTarget of [10000, 50000, 100000]) {
  const map = generatePlaceholderMap({
    seed: "provincial-capital-matrix",
    cellsTarget,
    heightmapTemplate: "continents"
  });
  const failures = [];
  for (const province of map.politics.provinces || []) {
    if (!province?.i || province.removed) continue;
    const capitals = map.settlements.cities.filter(item => item && !item.removed && Number(item.province) === province.i && item.provincial);
    if (capitals.length !== 1) failures.push({provinceId: province.i, capitals: capitals.length});
    else {
      const capital = capitals[0];
      const burg = map.pack.burgs[capital.burgId];
      if (province.burg !== capital.burgId
        || province.center !== capital.packCell
        || province.gridCenter !== capital.cell
        || !burg?.provincial
        || burg?.province !== province.i
        || burg?.state !== province.state) {
        failures.push({provinceId: province.i, code: "mirror-mismatch"});
      }
    }
  }
  assert.deepEqual(failures, [], `${cellsTarget} cells 生成存在省会缺失、重复或镜像不一致`);
  const preview = inspectProvincialCapitalReassessment(map, {all: true});
  assert.equal(preview.changes.length, 0, `${cellsTarget} cells 生成后仍可静默迁都`);
  generationMatrix.push({
    cellsTarget,
    provinces: map.politics.provinces.filter(Boolean).length,
    cities: map.settlements.cities.filter(Boolean).length,
    deterministicFingerprint: preview.fingerprint
  });
}

const collisionMap = generatePlaceholderMap({
  seed: "regeneration-lock-state",
  cellsTarget: 5000,
  heightmapTemplate: "continents",
  provincesRatio: 45
});
const collisionProvince = collisionMap.politics.provinces[348];
const collisionCapital = collisionMap.settlements.cities.find(city => city && city.province === 348 && city.provincial);
const collisionRelocatedCity = collisionMap.settlements.cities[122];
assert(collisionProvince && collisionCapital, "共用 grid 落点的极小省份没有获得唯一省会");
assert.equal(collisionProvince.burg, collisionCapital.burgId);
assert.equal(collisionCapital.packCell, 3329);
assert.equal(collisionCapital.cell, 4315);
assert.equal(collisionRelocatedCity.id, 122);
assert.equal(collisionRelocatedCity.population, 10.806, "落点腾挪改写了既有城市人口");
assert.equal(collisionRelocatedCity.visual.manual, false);
assert.notEqual(collisionRelocatedCity.packCell, 3330, "阻塞城市没有确定性腾出极小省份的唯一 grid 落点");

const legacyFinalizeMap = generatePlaceholderMap({
  seed: "provincial-capital-legacy-finalize",
  cellsTarget: 5000,
  heightmapTemplate: "continents"
});
const legacyProvince = legacyFinalizeMap.politics.provinces.find(province => {
  if (!province?.i) return false;
  const cities = legacyFinalizeMap.settlements.cities.filter(city => city && city.province === province.i);
  return cities.length >= 2 && !cities.some(city => city.capital);
});
assert(legacyProvince, "没有找到可验证默认 finalize 边界的多城市省份");
const legacyCities = legacyFinalizeMap.settlements.cities.filter(city => city && city.province === legacyProvince.i);
const legacyCurrent = legacyCities.find(city => city.burgId === legacyProvince.burg);
const legacyChallenger = legacyCities.find(city => city.id !== legacyCurrent.id);
legacyChallenger.population = Math.max(legacyCurrent.population * 4, legacyCurrent.population + 10);
legacyFinalizeMap.pack.burgs[legacyChallenger.burgId].population = legacyChallenger.population;
const legacyCapitalBefore = provinceCapitalProbe(legacyFinalizeMap, legacyProvince.i);
finalizeSettlements(
  legacyFinalizeMap.grid,
  legacyFinalizeMap.features,
  legacyFinalizeMap.politics,
  legacyFinalizeMap.settlements,
  legacyFinalizeMap.pack,
  {...legacyFinalizeMap.options, pruneNeutralSettlements: true}
);
assert.deepEqual(
  provinceCapitalProbe(legacyFinalizeMap, legacyProvince.i),
  legacyCapitalBefore,
  "默认 finalize / 旧图导入路径发生了静默迁都"
);

const sparseMirrorMap = clone(legacyFinalizeMap);
sparseMirrorMap.pack.provinces = clone(sparseMirrorMap.politics.provinces);
const sparseProvince = sparseMirrorMap.politics.provinces.find(province => province?.i
  && sparseMirrorMap.settlements.cities.some(city => city && city.province === province.i));
assert(sparseProvince, "没有找到可验证空省补城镜像的省份");
const outsideCityIdsBefore = sparseMirrorMap.settlements.cities
  .filter(city => city && city.province !== sparseProvince.i)
  .map(city => city.id);
for (const city of sparseMirrorMap.settlements.cities.filter(item => item && item.province === sparseProvince.i)) {
  if (Number.isInteger(city.packCell)) sparseMirrorMap.pack.cells.burg[city.packCell] = 0;
  if (Number.isInteger(city.cell)) sparseMirrorMap.grid.cells.burg[city.cell] = -1;
  sparseMirrorMap.pack.burgs[city.burgId] = null;
  sparseMirrorMap.settlements.cities[city.id] = null;
}
for (const collection of [sparseMirrorMap.politics.provinces, sparseMirrorMap.pack.provinces]) {
  collection[sparseProvince.i].burg = 0;
}
finalizeSettlements(
  sparseMirrorMap.grid,
  sparseMirrorMap.features,
  sparseMirrorMap.politics,
  sparseMirrorMap.settlements,
  sparseMirrorMap.pack,
  {
    ...sparseMirrorMap.options,
    reassessProvincialCapitals: true,
    settlementScope: {kind: "province", id: sparseProvince.i}
  }
);
const sparsePoliticsProvince = sparseMirrorMap.politics.provinces[sparseProvince.i];
const sparsePackProvince = sparseMirrorMap.pack.provinces[sparseProvince.i];
assert(sparsePoliticsProvince.burg > 0, "空省补城没有产生省会");
assert.deepEqual(
  [sparsePackProvince.burg, sparsePackProvince.center, sparsePackProvince.gridCenter],
  [sparsePoliticsProvince.burg, sparsePoliticsProvince.center, sparsePoliticsProvince.gridCenter],
  "空省补城没有同步 politics / pack 省份中心镜像"
);
assert.deepEqual(
  sparseMirrorMap.settlements.cities.filter(city => city && city.province !== sparseProvince.i).map(city => city.id),
  outsideCityIdsBefore,
  "省份范围补城改动了范围外城市集合"
);

const provincePanelSource = await readFile(
  new URL("../app/webgl-generator/src/ui/panels/province-panel.js", import.meta.url),
  "utf8"
);
const settlementSource = await readFile(
  new URL("../app/webgl-generator/src/generator/settlements.js", import.meta.url),
  "utf8"
);
assert.match(settlementSource, /const burg = pack\.burgs\?\.\[city\.burgId\][\s\S]{0,700}?burg\.capital[\s\S]{0,220}?burg\.provincial[\s\S]{0,220}?burg\.visual\?\.manual/, "落点腾挪没有同时保护 burg 行政与手工视觉镜像");
assert.match(settlementSource, /validateCityRelocationPlan\(pack, relocationPlan, cityByGrid\)[\s\S]{0,120}?continue/, "落点腾挪链没有在执行前整体预检");
assert.match(provincePanelSource, /onSelect: row => \{[\s\S]{0,220}?clearCapitalPreviewState/, "切换表格选中省份没有使预览失效");
assert.match(provincePanelSource, /onEdit: row => \{[\s\S]{0,260}?clearCapitalPreviewState/, "通过编辑入口切换省份没有使预览失效");
assert.match(provincePanelSource, /onTargetProvinceId:[\s\S]{0,260}?clearCapitalPreviewState/, "切换目标省份没有使预览失效");
assert.match(provincePanelSource, /update\(map, selection, history[\s\S]{0,260}?clearCapitalPreviewState/, "地图刷新没有使预览失效");
assert.match(provincePanelSource, /setSelectedProvinceId\(provinceId\)[\s\S]{0,320}?clearCapitalPreviewState/, "运行时切换省份没有使预览失效");
const geoImportSource = await readFile(
  new URL("../app/webgl-generator/src/runtime/fmg-cells-geojson-import.js", import.meta.url),
  "utf8"
);
const geoFinalizeCall = /finalizeSettlements\([^;]+;/.exec(geoImportSource)?.[0] || "";
assert(geoFinalizeCall && !geoFinalizeCall.includes("reassessProvincialCapitals"), "GEO 导入不得开启自动省会重评");

console.log(JSON.stringify({
  ok: true,
  counterexample: {
    from: counterPreview.changes[0].currentCityId,
    to: counterPreview.changes[0].nextCityId,
    fingerprint: counterPreview.fingerprint
  },
  closePopulation: {
    selected: closePreview.changes[0].nextCityId,
    score: closePreview.changes[0].selected.score
  },
  history: history.getStats(),
  collisionResolution: {
    provinceId: collisionProvince.i,
    capitalCityId: collisionCapital.id,
    relocatedCityId: collisionRelocatedCity.id,
    relocatedPackCell: collisionRelocatedCity.packCell
  },
  generationMatrix
}, null, 2));

function createFixture({cities, provinceBurg, pole}) {
  const packPoints = cities.map((item, index) => [index * 10, 0]);
  const count = cities.length;
  const politicsProvinces = [null, {
    id: 1,
    i: 1,
    state: 1,
    burg: provinceBurg,
    center: cities.find(item => item.burgId === provinceBurg)?.packCell ?? 0,
    gridCenter: cities.find(item => item.burgId === provinceBurg)?.cell ?? 0,
    name: "测试省",
    fullName: "测试省",
    pole
  }];
  const packProvinces = clone(politicsProvinces);
  const states = [null, {id: 1, i: 1, capital: 0, provinces: [1]}];
  const burgs = [null];
  const cityArray = [];
  const packBurg = new Uint16Array(count);
  const gridBurg = new Array(count).fill(-1);
  for (const item of cities) {
    cityArray[item.id] = item;
    burgs[item.burgId] = {
      i: item.burgId,
      id: item.burgId,
      cityId: item.id,
      cell: item.packCell,
      state: 1,
      province: 1,
      population: item.population,
      provincial: item.provincial,
      port: item.port,
      resourceScore: item.resourceScore,
      name: item.name
    };
    packBurg[item.packCell] = item.burgId;
    gridBurg[item.cell] = item.id;
  }
  const routes = [{
    id: 0,
    from: cities[0].id,
    to: cities[1]?.id ?? cities[0].id,
    fromProvincial: Boolean(cities[0].provincial),
    toProvincial: Boolean(cities[1]?.provincial),
    administrativePriority: "provincial",
    packCells: [0, Math.max(0, count - 1)],
    points: [packPoints[0], packPoints.at(-1)]
  }];
  const packRoutes = [clone({...routes[0], i: 0})];
  return {
    metadata: {seed: "fixture"},
    grid: {
      cells: {
        i: Array.from({length: count}, (_, index) => index),
        h: new Uint8Array(count).fill(40),
        state: new Uint16Array(count).fill(1),
        province: new Uint16Array(count).fill(1)
        ,
        burg: gridBurg
      }
    },
    pack: {
      cells: {
        i: Array.from({length: count}, (_, index) => index),
        p: packPoints,
        g: Array.from({length: count}, (_, index) => index),
        h: new Uint8Array(count).fill(40),
        state: new Uint16Array(count).fill(1),
        province: new Uint16Array(count).fill(1),
        burg: packBurg,
        s: cities.map(item => item.suitability),
        r: cities.map(item => item.port ? 1 : 0)
      },
      burgs,
      provinces: packProvinces,
      states: clone(states),
      routes: packRoutes
    },
    politics: {
      provinces: politicsProvinces,
      states
    },
    settlements: {
      cities: cityArray,
      routes
    },
    regenerationLocks: {version: 1, entries: []}
  };
}

function city(id, burgId, cell, population, options = {}) {
  return {
    id,
    burgId,
    name: `城市 #${id}`,
    cell,
    packCell: cell,
    x: cell * 10,
    y: 0,
    population,
    state: 1,
    province: 1,
    capital: false,
    provincial: Boolean(options.provincial),
    port: options.port || 0,
    suitability: options.suitability || 10,
    resourceScore: options.resource || 0,
    visual: {silhouette: "town", palette: "default", cultureStyle: "default", manual: Boolean(options.manual)}
  };
}

function assertProvinceCapital(map, provinceId, cityId) {
  const province = map.politics.provinces[provinceId];
  const city = map.settlements.cities[cityId];
  const burg = map.pack.burgs[city.burgId];
  assert.equal(city.provincial, true);
  assert.equal(burg.provincial, true);
  assert.equal(province.burg, city.burgId);
  assert.equal(province.center, city.packCell);
  assert.equal(province.gridCenter, city.cell);
  assert.equal(map.pack.provinces[provinceId].burg, city.burgId);
  assert.equal(map.settlements.cities.filter(item => item && item.province === provinceId && item.provincial).length, 1);
}

function fingerprintProbe(map) {
  return {
    province: clone(map.politics.provinces[1]),
    packProvince: clone(map.pack.provinces[1]),
    cities: map.settlements.cities.filter(Boolean).map(item => clone(item)),
    burgs: map.pack.burgs.filter(Boolean).map(item => clone(item)),
    routes: clone(map.settlements.routes),
    packRoutes: clone(map.pack.routes),
    derivedStale: clone(map.metadata.derivedStale ?? null)
  };
}

function provinceCapitalProbe(map, provinceId) {
  const politics = map.politics.provinces[provinceId];
  const pack = map.pack.provinces[provinceId];
  return {
    politics: {
      burg: politics.burg,
      center: politics.center,
      gridCenter: politics.gridCenter
    },
    pack: {
      burg: pack.burg,
      center: pack.center,
      gridCenter: pack.gridCenter
    },
    cities: map.settlements.cities
      .filter(city => city && city.province === provinceId)
      .map(city => ({id: city.id, provincial: city.provincial})),
    burgs: map.pack.burgs
      .filter(burg => burg && burg.province === provinceId)
      .map(burg => ({id: burg.i, provincial: burg.provincial}))
  };
}

function clone(value) {
  return structuredClone(value);
}
