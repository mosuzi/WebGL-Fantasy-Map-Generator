#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {
  finalizeSettlements,
  inspectRelocatedSettlementPort,
  isSettlementWaterRoutePathValid,
  traceSettlementWaterRoutePath
} from "../app/webgl-generator/src/generator/settlements.js";
import {
  createMapDocument,
  parseMapDocument,
  stringifyMapDocument
} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {
  inspectGridRefinement,
  prepareGridRefinement
} from "../app/webgl-generator/src/runtime/grid-topology-api.js";
import {OBJECT_KIND} from "../app/webgl-generator/src/runtime/object-kinds.js";
import {reconcileSettlementCellIdentity} from "../app/webgl-generator/src/runtime/settlement-cell-index.js";
import {
  applySettlementPortTopologyPlan,
  diagnoseSettlementPortTopology,
  inspectSettlementPortTopology,
  reconcileSettlementPortTopology
} from "../app/webgl-generator/src/runtime/settlement-port-topology.js";

const fixture = buildRefinedFixture();
const stale = makeInvalidPortFixture(fixture);
const staleFacts = portFacts(stale.map, stale.cityId);
const loaded = parseMapDocument(stringifyMapDocument(createMapDocument(stale.map))).map;
assert.deepEqual(portFacts(loaded, stale.cityId), staleFacts, "加载旧档不得静默搬迁、清港或改写港口事实");
assert(loaded.metadata.compatibility.settlementPortTopology.invalid > 0, "加载旧档没有记录失效港口诊断");
assert(loaded.metadata.derivedStale.systems.includes("routes"), "加载失效港口旧档没有把道路标记为待派生");

const loadedAgain = parseMapDocument(stringifyMapDocument(createMapDocument(loaded))).map;
assert.deepEqual(portFacts(loadedAgain, stale.cityId), staleFacts, "二次加载改变了旧档港口事实");
assert.deepEqual(
  loadedAgain.metadata.compatibility.settlementPortTopology,
  loaded.metadata.compatibility.settlementPortTopology,
  "港口加载诊断不是确定性幂等结果"
);

for (const missingSide of ["city", "burg"]) {
  const mirrorFixture = makeMissingPortMirrorFixture(fixture, missingSide);
  const mirrorCity = mirrorFixture.map.settlements.cities[mirrorFixture.cityId];
  const mirrorBurg = mirrorFixture.map.pack.burgs[mirrorCity.burgId];
  const manualVisual = {silhouette: "city", palette: "brick", cultureStyle: "agrarian", manual: true};
  mirrorCity.type = "Generic";
  mirrorBurg.type = "Generic";
  mirrorBurg.feature = -1;
  mirrorCity.visual = structuredClone(manualVisual);
  mirrorBurg.visual = structuredClone(manualVisual);
  const beforeFacts = portFacts(mirrorFixture.map, mirrorFixture.cityId);
  const mirrorLoaded = parseMapDocument(stringifyMapDocument(createMapDocument(mirrorFixture.map))).map;
  assert.deepEqual(portFacts(mirrorLoaded, mirrorFixture.cityId), beforeFacts, `${missingSide} 单侧 port 缺失在加载时被静默改写`);
  assert.equal(mirrorLoaded.metadata.compatibility.settlementPortTopology.syncable, 1, `${missingSide} 单侧 port 缺失没有被诊断为可原地补镜像`);
  const firstDiagnosis = structuredClone(mirrorLoaded.metadata.compatibility.settlementPortTopology);
  const mirrorLoadedAgain = parseMapDocument(stringifyMapDocument(createMapDocument(mirrorLoaded))).map;
  assert.deepEqual(mirrorLoadedAgain.metadata.compatibility.settlementPortTopology, firstDiagnosis, `${missingSide} 单侧 port 加载诊断不幂等`);
  const positionBefore = portPositionFacts(mirrorLoaded, mirrorFixture.cityId);
  const mirrorReport = reconcileSettlementPortTopology(mirrorLoaded, {mode: "routes"});
  assert.equal(mirrorReport.synced, 1, `${missingSide} 单侧 port 缺失没有原地补镜像`);
  assert.equal(mirrorReport.moved, 0, `${missingSide} 单侧 port 补镜像错误搬迁了城市`);
  assert.equal(mirrorReport.cleared, 0, `${missingSide} 单侧 port 补镜像错误清除了港口`);
  assert.deepEqual(portPositionFacts(mirrorLoaded, mirrorFixture.cityId), positionBefore, `${missingSide} 单侧 port 补镜像改变了 cell / 坐标`);
  const syncedFacts = portFacts(mirrorLoaded, mirrorFixture.cityId);
  assert.equal(Number(syncedFacts.city.port), mirrorFixture.port);
  assert.equal(Number(syncedFacts.burg.port), mirrorFixture.port);
  const syncedCity = mirrorLoaded.settlements.cities[mirrorFixture.cityId];
  const syncedBurg = mirrorLoaded.pack.burgs[syncedCity.burgId];
  assert.equal(syncedCity.type, "Naval", `${missingSide} 单侧 port 补镜像未重算 city.type`);
  assert.equal(syncedBurg.type, "Naval", `${missingSide} 单侧 port 补镜像未重算 burg.type`);
  assert.equal(Number(syncedBurg.feature), Number(mirrorLoaded.pack.cells.f[syncedCity.packCell]), `${missingSide} 单侧 port 补镜像未重算 burg.feature`);
  assert.deepEqual(syncedCity.visual, manualVisual, `${missingSide} 单侧 port 补镜像破坏 city 手工剪影`);
  assert.deepEqual(syncedBurg.visual, manualVisual, `${missingSide} 单侧 port 补镜像破坏 burg 手工剪影`);
}

const ambiguousMirror = makeMissingPortMirrorFixture(fixture, "burg");
ambiguousMirror.map.pack.burgs[ambiguousMirror.map.settlements.cities[ambiguousMirror.cityId].burgId].port = ambiguousMirror.port + 999_999;
const ambiguousPosition = portPositionFacts(ambiguousMirror.map, ambiguousMirror.cityId);
const ambiguousReport = reconcileSettlementPortTopology(ambiguousMirror.map, {mode: "routes"});
assert.equal(ambiguousReport.synced, 0, "双侧非零冲突被错误猜测为可补镜像");
assert.equal(ambiguousReport.cleared, 1, "双侧非零冲突没有按普通未锁失效港口双清");
assert.deepEqual(portPositionFacts(ambiguousMirror.map, ambiguousMirror.cityId), ambiguousPosition, "双侧非零冲突清港改变了 cell / 坐标");

const lockedMirror = makeMissingPortMirrorFixture(fixture, "burg");
lockedMirror.map.regenerationLocks = {version: 1, entries: [{kind: OBJECT_KIND.CITY, id: lockedMirror.cityId}]};
const lockedMirrorBefore = structuredClone(lockedMirror.map);
assert.throws(
  () => reconcileSettlementPortTopology(lockedMirror.map, {mode: "routes"}),
  error => error?.code === "regeneration_lock_conflict" && error?.details?.reason === "protected-port-invalid",
  "锁定城镇的单侧 port 缺失被静默补写"
);
assert.deepEqual(lockedMirror.map, lockedMirrorBefore, "锁定城镇单侧 port 冲突后地图发生写入");

const activeLockedMirror = makeMissingPortMirrorFixture(fixture, "burg");
activeLockedMirror.map.regenerationLocks = {version: 1, entries: [{kind: OBJECT_KIND.CITY, id: activeLockedMirror.cityId}]};
const activeLockedMirrorPosition = portPositionFacts(activeLockedMirror.map, activeLockedMirror.cityId);
const activeLockedMirrorLocks = structuredClone(activeLockedMirror.map.regenerationLocks);
const activeLockedMirrorReport = reconcileSettlementPortTopology(activeLockedMirror.map, {mode: "routes", repairProtectedDerived: true});
assert.equal(activeLockedMirrorReport.synced, 1, "主动道路重生成没有修复锁定城镇的单侧 port 镜像");
assert.equal(activeLockedMirrorReport.moved, 0, "主动道路重生成错误搬迁了锁定城镇");
assert.equal(activeLockedMirrorReport.cleared, 0, "主动道路重生成错误清除了可原地修复的锁定港口");
assert.deepEqual(portPositionFacts(activeLockedMirror.map, activeLockedMirror.cityId), activeLockedMirrorPosition, "主动修复锁定港口镜像改变了位置");
assert.deepEqual(activeLockedMirror.map.regenerationLocks, activeLockedMirrorLocks, "主动修复锁定港口镜像改写了锁存储");
const activeLockedMirrorFacts = portFacts(activeLockedMirror.map, activeLockedMirror.cityId);
assert.equal(Number(activeLockedMirrorFacts.city.port), Number(activeLockedMirrorFacts.burg.port), "主动修复后 city / burg port 仍不一致");

const lockedRouteMirror = makeLockedRouteMissingPortMirrorFixture(fixture);
const lockedRouteMirrorBefore = structuredClone(lockedRouteMirror);
assert.throws(
  () => reconcileSettlementPortTopology(lockedRouteMirror, {mode: "routes"}),
  error => error?.code === "regeneration_lock_conflict",
  "锁定路线端点的单侧 port 缺失被静默补写"
);
assert.deepEqual(lockedRouteMirror, lockedRouteMirrorBefore, "锁定路线端点单侧 port 冲突后地图发生写入");

const exactAndSyncable = makeDuplicatePortCellFixture(fixture, {anchorMode: "exact", guestMode: "syncable"});
const exactAndSyncableReport = reconcileSettlementPortTopology(exactAndSyncable.map, {mode: "routes"});
assert.equal(Number(exactAndSyncable.map.settlements.cities[exactAndSyncable.anchorId].port), exactAndSyncable.port, "完整合法港没有保留同 cell owner");
assert.equal(portOwnersAtCell(exactAndSyncable.map, exactAndSyncable.packCell).length, 1, "完整港 + 可补镜像港仍形成同 cell 双港");
assert.ok(exactAndSyncableReport.moved + exactAndSyncableReport.cleared >= 1, "完整港 + 可补镜像港的非 owner 没有迁移或清除");
assertPortTopology(exactAndSyncable.map, "完整港 + 可补镜像港");

const twoSyncable = makeDuplicatePortCellFixture(fixture, {anchorMode: "syncable", guestMode: "syncable"});
const stableSyncOwner = Math.min(twoSyncable.anchorId, twoSyncable.guestId);
reconcileSettlementPortTopology(twoSyncable.map, {mode: "routes"});
assert.equal(Number(twoSyncable.map.settlements.cities[stableSyncOwner].port), twoSyncable.port, "两个可补镜像港没有按稳定最小 ID 保留 owner");
assert.equal(portOwnersAtCell(twoSyncable.map, twoSyncable.packCell).length, 1, "两个可补镜像港仍形成同 cell 双港");
assertPortTopology(twoSyncable.map, "两个可补镜像港");

const lockedExactOwner = makeDuplicatePortCellFixture(fixture, {anchorMode: "exact", guestMode: "exact", lockGuest: true});
assert(lockedExactOwner.guestId > lockedExactOwner.anchorId, "锁定高 ID 港口反例构造失败");
reconcileSettlementPortTopology(lockedExactOwner.map, {mode: "routes"});
const lockedOwnerCity = lockedExactOwner.map.settlements.cities[lockedExactOwner.guestId];
assert.equal(Number(lockedOwnerCity.packCell), lockedExactOwner.packCell, "锁定完整港没有优先保留原 cell");
assert.equal(Number(lockedOwnerCity.port), lockedExactOwner.port, "锁定完整港被迁移或清除");
assert.equal(portOwnersAtCell(lockedExactOwner.map, lockedExactOwner.packCell).length, 1, "锁定完整港与未锁港仍形成同 cell 双港");
assertPortTopology(lockedExactOwner.map, "锁定完整港 owner");

const explicit = structuredClone(loaded);
const explicitCity = explicit.settlements.cities[stale.cityId];
explicitCity.visual = {silhouette: "city", palette: "brick", cultureStyle: "agrarian", manual: true};
explicit.pack.burgs[explicitCity.burgId].visual = structuredClone(explicitCity.visual);
const manualVisual = structuredClone(explicitCity.visual);
const explicitReport = reconcileSettlementPortTopology(explicit, {mode: "routes"});
assert(explicitReport.moved > 0, "显式道路重算前没有迁移可确定修复的失效港口");
assert.deepEqual(explicit.settlements.cities[stale.cityId].visual, manualVisual, "港口拓扑修复破坏了手工剪影样式");
assertPortTopology(explicit, "显式港口修复");
finalizeSettlements(explicit.grid, explicit.features, explicit.politics, explicit.settlements, explicit.pack, {
  ...explicit.options,
  routeRegenerationSalt: 16,
  lockedRoutes: []
});
const explicitCoverage = assertReachablePortCoverage(explicit, "显式道路 salt16");
assert(explicit.settlements.routes.some(route => route?.type === "searoute"), "显式道路 salt16 没有生成海路");

const explicitRoundTrip = parseMapDocument(stringifyMapDocument(createMapDocument(explicit))).map;
assertPortTopology(explicitRoundTrip, "显式修复保存往返");
assertRouteEndpoints(explicitRoundTrip, "显式修复保存往返");

const cityLocked = makeInvalidPortFixture(fixture).map;
const lockedCity = cityLocked.settlements.cities[stale.cityId];
cityLocked.regenerationLocks = {version: 1, entries: [{kind: OBJECT_KIND.CITY, id: lockedCity.id}]};
const cityLockedBefore = structuredClone(cityLocked);
assert.throws(
  () => reconcileSettlementPortTopology(cityLocked, {mode: "routes"}),
  error => error?.code === "regeneration_lock_conflict" && error?.details?.reason === "protected-port-invalid",
  "锁定城镇的失效港口没有在写入前冲突"
);
assert.deepEqual(cityLocked, cityLockedBefore, "锁定城镇港口冲突后地图发生写入");

const activeCityLocked = makeInvalidPortFixture(fixture).map;
const activeCityLockedId = stale.cityId;
activeCityLocked.regenerationLocks = {version: 1, entries: [{kind: OBJECT_KIND.CITY, id: activeCityLockedId}]};
const activeCityLockedPosition = portPositionFacts(activeCityLocked, activeCityLockedId);
const activeCityLockedReport = reconcileSettlementPortTopology(activeCityLocked, {mode: "routes", repairProtectedDerived: true});
assert.equal(activeCityLockedReport.cleared, 1, "主动道路重生成没有清理无法原地修复的锁定港口派生关系");
assert.deepEqual(portPositionFacts(activeCityLocked, activeCityLockedId), activeCityLockedPosition, "清理锁定港口派生关系改变了城镇位置");
assert.equal(Number(activeCityLocked.settlements.cities[activeCityLockedId].port), 0, "锁定城镇失效 city.port 未清理");
assert.equal(Number(activeCityLocked.pack.burgs[activeCityLocked.settlements.cities[activeCityLockedId].burgId].port), 0, "锁定城镇失效 burg.port 未清理");

const preservedCityLocked = makeInvalidPortFixture(fixture).map;
const preservedCityLockedId = stale.cityId;
preservedCityLocked.regenerationLocks = {version: 1, entries: [{kind: OBJECT_KIND.CITY, id: preservedCityLockedId}]};
const preservedCityLockedBefore = structuredClone(preservedCityLocked.settlements.cities[preservedCityLockedId]);
const preservedBurgLockedBefore = structuredClone(preservedCityLocked.pack.burgs[preservedCityLockedBefore.burgId]);
const preservedLocksBefore = structuredClone(preservedCityLocked.regenerationLocks);
const preservedCityLockedReport = reconcileSettlementPortTopology(preservedCityLocked, {mode: "routes", preserveProtected: true});
assert.equal(preservedCityLockedReport.skipped, 1, "锁定最高优先模式没有报告跳过失效锁定港口");
assert.deepEqual(preservedCityLocked.settlements.cities[preservedCityLockedId], preservedCityLockedBefore, "锁定最高优先模式改写了锁定城镇");
assert.deepEqual(preservedCityLocked.pack.burgs[preservedCityLockedBefore.burgId], preservedBurgLockedBefore, "锁定最高优先模式改写了锁定 burg 镜像");
assert.deepEqual(preservedCityLocked.regenerationLocks, preservedLocksBefore, "锁定最高优先模式改写了锁存储");

const lockedEndpoint = makeInvalidLockedSeaEndpoint(fixture);
const lockedEndpointBefore = structuredClone(lockedEndpoint);
assert.throws(
  () => reconcileSettlementPortTopology(lockedEndpoint, {mode: "routes"}),
  error => error?.code === "regeneration_lock_conflict",
  "锁定海路端点失效没有拒绝"
);
assert.deepEqual(lockedEndpoint, lockedEndpointBefore, "锁定海路端点冲突后地图发生写入");

const oneSided = makeOneSidedLockedSeaRoute(fixture);
reconcileSettlementPortTopology(oneSided, {mode: "routes"});
const reversed = makeOneSidedLockedSeaRoute(fixture);
const reversedRoute = lockedRoute(reversed);
reversedRoute.packCells.reverse();
reversedRoute.cells.reverse();
reversedRoute.points.reverse();
const reversedBefore = structuredClone(reversed);
assert.throws(
  () => reconcileSettlementPortTopology(reversed, {mode: "routes"}),
  error => error?.code === "regeneration_lock_conflict" && error?.details?.reason === "locked-searoute-endpoint-mismatch",
  "单侧已知端点的锁定海路没有按 from 方向校验 cell"
);
assert.deepEqual(reversed, reversedBefore, "单侧锁定海路端点冲突后地图发生写入");

for (const failure of ["feature", "path"]) {
  const emptyCityLoad = makeEmptyCityLockedSeaRoute(fixture, failure);
  const emptyCityLoadFacts = emptyCityLockedRouteFacts(emptyCityLoad);
  const loadReport = diagnoseSettlementPortTopology(emptyCityLoad);
  assert.equal(loadReport.conflicts, 1, `空城旧档的锁海路 ${failure} 失效没有记录加载诊断`);
  assert.deepEqual(loadReport.lockConflictReasons, [`locked-searoute-${failure}-invalid`], `空城旧档的锁海路 ${failure} 加载诊断原因错误`);
  assert.deepEqual(emptyCityLockedRouteFacts(emptyCityLoad), emptyCityLoadFacts, `空城旧档的锁海路 ${failure} 加载诊断改写了路线或锁`);
  assert(emptyCityLoad.metadata.derivedStale.systems.includes("routes"), `空城旧档的锁海路 ${failure} 失效没有标 routes stale`);
  const loadReportAgain = diagnoseSettlementPortTopology(emptyCityLoad);
  assert.deepEqual(loadReportAgain, loadReport, `空城旧档的锁海路 ${failure} 加载诊断不幂等`);

  const emptyCityLockedRoute = makeEmptyCityLockedSeaRoute(fixture, failure);
  const emptyCityBefore = structuredClone(emptyCityLockedRoute);
  assert.throws(
    () => reconcileSettlementPortTopology(emptyCityLockedRoute, {mode: "routes"}),
    error => error?.code === "regeneration_lock_conflict" && error?.details?.reason === `locked-searoute-${failure}-invalid`,
    `空城地图的锁海路 ${failure} 失效没有拒绝`
  );
  assert.deepEqual(emptyCityLockedRoute, emptyCityBefore, `空城地图的锁海路 ${failure} 冲突后发生写入`);
}

const invalidFeature = makeInvalidPortFixture(fixture).map;
const invalidFeatureCity = invalidFeature.settlements.cities[stale.cityId];
invalidFeatureCity.port = 999_999;
invalidFeature.pack.burgs[invalidFeatureCity.burgId].port = 999_999;
const clearReport = reconcileSettlementPortTopology(invalidFeature, {mode: "routes"});
assert(clearReport.cleared > 0, "无确定候选的普通失效港口没有在显式操作中清除");
assert.equal(invalidFeatureCity.port, 0);
assert.equal(invalidFeature.pack.burgs[invalidFeatureCity.burgId].port, 0);

const atomic = makeInvalidPortFixture(fixture).map;
const atomicPlan = inspectSettlementPortTopology(atomic, {mode: "routes"});
assert(atomicPlan.patches.length > 0, "原子失败样本缺少港口 patch");
atomicPlan.patches[0].nextCity.packCell = atomicPlan.patches[0].nextCity.packCell === 0 ? 1 : 0;
const atomicBefore = structuredClone(atomic);
assert.throws(() => applySettlementPortTopologyPlan(atomic, atomicPlan), /城镇|cell|身份/);
assert.deepEqual(atomic, atomicBefore, "港口 apply 后置失败没有完整回滚");

assertFormalPortRules(fixture);
assertFrozenWaterFinalEdgeRejected(fixture);

const optionalReal = await auditOptionalAnonymousRealSave();

console.log(JSON.stringify({
  ok: true,
  fixture: {
    gridCells: fixture.grid.points.length,
    packCells: fixture.pack.cells.i.length,
    ports: fixture.settlements.cities.filter(city => city?.port).length
  },
  load: {
    invalid: loaded.metadata.compatibility.settlementPortTopology.invalid,
    factsPreserved: true,
    idempotent: true
  },
  explicit: {
    moved: explicitReport.moved,
    cleared: explicitReport.cleared,
    searoutes: explicit.settlements.routes.filter(route => route?.type === "searoute").length,
    ...explicitCoverage
  },
  optionalReal
}, null, 2));

function buildRefinedFixture() {
  const source = generatePlaceholderMap({seed: "port-topology-anonymous", cellsTarget: 10_000, heightmapTemplate: "continents"});
  const revision = {getSnapshot: () => ({mapIdentity: "port-topology-anonymous", mapRevision: 0})};
  const inspection = inspectGridRefinement(source, revision, {targetCells: 50_000});
  return prepareGridRefinement(source, revision, {
    targetCells: 50_000,
    confirm: true,
    inspectionToken: inspection.inspectionToken
  }).map;
}

function makeInvalidPortFixture(source) {
  const map = structuredClone(source);
  const occupied = new Set(activeCities(map).map(city => Number(city.packCell)));
  for (const city of activeCities(map).filter(city => Number(city.port) > 0)) {
    const burg = map.pack.burgs[city.burgId];
    const mother = motherOf(map, city.cell);
    const sourceFeature = Number(map.pack.cells.f[city.packCell]);
    const state = Number(map.pack.cells.state?.[city.packCell] || 0);
    const province = Number(map.pack.cells.province?.[city.packCell] || 0);
    for (const packCell of map.pack.cells.i) {
      if (occupied.has(packCell)
        || motherOf(map, map.pack.cells.g[packCell]) !== mother
        || Number(map.pack.cells.h[packCell]) < 20
        || Number(map.pack.cells.f[packCell]) !== sourceFeature
        || Number(map.pack.cells.state?.[packCell] || 0) !== state
        || Number(map.pack.cells.province?.[packCell] || 0) !== province) continue;
      const placement = inspectRelocatedSettlementPort(map.grid, map.pack, packCell, {
        wasPort: city.port,
        capital: Boolean(city.capital || burg.capital),
        burgId: city.burgId,
        options: map.options
      });
      if (Number(placement.port) === Number(city.port)) continue;
      const sourceFacts = portFacts(map, city.id);
      Object.assign(city, {cell: Number(map.pack.cells.g[packCell]), packCell});
      Object.assign(burg, {cell: packCell});
      reconcileSettlementCellIdentity(map);
      return {map, cityId: Number(city.id), sourceFacts, invalidPackCell: packCell};
    }
  }
  throw new Error("匿名样本没有可构造的同 mother 失效港口");
}

function makeMissingPortMirrorFixture(source, missingSide) {
  const map = structuredClone(source);
  const city = activeCities(map).find(candidate => {
    if (!(Number(candidate.port) > 0)) return false;
    const burg = map.pack.burgs[candidate.burgId];
    return Number(inspectRelocatedSettlementPort(map.grid, map.pack, candidate.packCell, {
      wasPort: candidate.port,
      capital: Boolean(candidate.capital || burg.capital),
      burgId: candidate.burgId,
      options: map.options
    }).port) === Number(candidate.port);
  });
  assert(city, "匿名样本缺少可构造单侧 port 镜像的合法港口");
  const burg = map.pack.burgs[city.burgId];
  const port = Number(city.port);
  if (missingSide === "city") city.port = 0;
  else burg.port = 0;
  return {map, cityId: Number(city.id), port};
}

function makeLockedRouteMissingPortMirrorFixture(source) {
  const map = structuredClone(source);
  const route = map.settlements.routes.find(item => item?.type === "searoute" && [item.from, item.to].some(value => {
    const city = map.settlements.cities?.[Number(value)];
    return city && !city.removed && Number(city.port) > 0;
  }));
  assert(route, "匿名样本缺少带正式港口端点的锁海路");
  const cityId = [route.from, route.to].map(Number).find(id => id >= 0 && Number(map.settlements.cities?.[id]?.port) > 0);
  const city = map.settlements.cities[cityId];
  map.pack.burgs[city.burgId].port = 0;
  map.regenerationLocks = {version: 1, entries: [{kind: OBJECT_KIND.ROUTE, id: Number(route.id)}]};
  return map;
}

function makeDuplicatePortCellFixture(source, {anchorMode, guestMode, lockGuest = false}) {
  const map = structuredClone(source);
  const anchor = activeCities(map).find(city => Number(city.port) > 0 && !city.capital && !city.provincial
    && activeCities(map).some(candidate => !candidate.capital && !candidate.provincial && Number(candidate.id) > Number(city.id)));
  assert(anchor, "同 cell 港口 owner 反例缺少低 ID 普通港口");
  const guest = activeCities(map).find(city => !city.capital && !city.provincial && Number(city.id) > Number(anchor.id));
  assert(guest, "同 cell 港口 owner 反例缺少高 ID 普通城市");
  const anchorBurg = map.pack.burgs[anchor.burgId];
  const guestBurg = map.pack.burgs[guest.burgId];
  const port = Number(anchor.port);
  Object.assign(guest, {
    cell: anchor.cell,
    packCell: anchor.packCell,
    x: anchor.x,
    y: anchor.y,
    port
  });
  Object.assign(guestBurg, {cell: anchor.packCell, x: anchor.x, y: anchor.y, port: guestMode === "exact" ? port : 0});
  anchor.port = port;
  anchorBurg.port = anchorMode === "exact" ? port : 0;
  reconcileSettlementCellIdentity(map);
  if (lockGuest) map.regenerationLocks = {version: 1, entries: [{kind: OBJECT_KIND.CITY, id: Number(guest.id)}]};
  return {
    map,
    anchorId: Number(anchor.id),
    guestId: Number(guest.id),
    packCell: Number(anchor.packCell),
    port
  };
}

function portOwnersAtCell(map, packCell) {
  return activeCities(map).filter(city => Number(city.packCell) === Number(packCell) && Number(city.port) > 0);
}

function makeInvalidLockedSeaEndpoint(source) {
  const map = structuredClone(source);
  const route = map.settlements.routes.find(item => item?.type === "searoute" && (Number(item.from) >= 0 || Number(item.to) >= 0));
  assert(route, "匿名样本缺少带城市端点的海路");
  const cityId = Number(route.from) >= 0 ? Number(route.from) : Number(route.to);
  const city = map.settlements.cities[cityId];
  const burg = map.pack.burgs[city.burgId];
  city.port = 999_999;
  burg.port = 999_999;
  map.regenerationLocks = {version: 1, entries: [{kind: OBJECT_KIND.ROUTE, id: Number(route.id)}]};
  return map;
}

function makeOneSidedLockedSeaRoute(source) {
  const map = structuredClone(source);
  const route = map.settlements.routes.find(item => item?.type === "searoute" && (Number(item.from) >= 0 || Number(item.to) >= 0));
  assert(route, "匿名样本缺少单侧锁海路反例");
  if (Number(route.from) < 0) {
    route.packCells.reverse();
    route.cells.reverse();
    route.points.reverse();
    route.from = Number(route.to);
  }
  route.to = -1;
  map.regenerationLocks = {version: 1, entries: [{kind: OBJECT_KIND.ROUTE, id: Number(route.id)}]};
  return map;
}

function lockedRoute(map) {
  const id = Number(map.regenerationLocks.entries[0].id);
  return map.settlements.routes.find(route => Number(route.id) === id);
}

function makeEmptyCityLockedSeaRoute(source, failure) {
  const map = structuredClone(source);
  const route = map.settlements.routes.find(item => item?.type === "searoute" && item.packCells?.length >= 2);
  assert(route, "空城锁海路反例缺少海路");
  route.from = -1;
  route.to = -1;
  if (failure === "feature") route.feature = 999_999;
  else {
    route.packCells = [route.packCells[0], route.packCells[0]];
    route.cells = [route.cells[0], route.cells[0]];
    route.points = [route.points[0], route.points[0]];
  }
  map.settlements.cities = [];
  map.settlements.burgs = [null];
  map.pack.burgs = [null];
  map.regenerationLocks = {version: 1, entries: [{kind: OBJECT_KIND.ROUTE, id: Number(route.id)}]};
  return map;
}

function emptyCityLockedRouteFacts(map) {
  return structuredClone({
    routes: map.settlements.routes,
    cities: map.settlements.cities,
    settlementBurgs: map.settlements.burgs,
    packBurgs: map.pack.burgs,
    regenerationLocks: map.regenerationLocks
  });
}

function assertFormalPortRules(map) {
  const coast = activeCities(map).find(city => {
    if (!city.port) return false;
    const burg = map.pack.burgs[city.burgId];
    return inspectRelocatedSettlementPort(map.grid, map.pack, city.packCell, {
      wasPort: city.port,
      capital: Boolean(city.capital || burg.capital),
      burgId: city.burgId,
      options: map.options
    }).source === "coast";
  });
  assert(coast, "匿名样本缺少海岸港口");
  const frozen = structuredClone(map);
  const frozenCity = frozen.settlements.cities[coast.id];
  const frozenBurg = frozen.pack.burgs[frozenCity.burgId];
  frozen.grid.cells.temp[frozenCity.cell] = 0;
  frozen.pack.cells.r[frozenCity.packCell] = 0;
  assert.equal(inspectRelocatedSettlementPort(frozen.grid, frozen.pack, frozenCity.packCell, {
    wasPort: frozenCity.port,
    capital: Boolean(frozenCity.capital || frozenBurg.capital),
    burgId: frozenCity.burgId,
    options: frozen.options
  }).port, 0, "冰封港口没有走正式温度门");

  const wrongHaven = structuredClone(map);
  const wrongCity = wrongHaven.settlements.cities[coast.id];
  const wrongBurg = wrongHaven.pack.burgs[wrongCity.burgId];
  wrongHaven.pack.cells.haven[wrongCity.packCell] = 0;
  wrongHaven.pack.cells.r[wrongCity.packCell] = 0;
  assert.equal(inspectRelocatedSettlementPort(wrongHaven.grid, wrongHaven.pack, wrongCity.packCell, {
    wasPort: wrongCity.port,
    capital: Boolean(wrongCity.capital || wrongBurg.capital),
    burgId: wrongCity.burgId,
    options: wrongHaven.options
  }).port, 0, "错误 haven 仍被宽松旁路认作港口");

  const river = activeCities(map).find(city => {
    if (!city.port) return false;
    const burg = map.pack.burgs[city.burgId];
    return inspectRelocatedSettlementPort(map.grid, map.pack, city.packCell, {
      wasPort: city.port,
      capital: Boolean(city.capital || burg.capital),
      burgId: city.burgId,
      options: map.options
    }).source === "river";
  });
  if (!river) return;
  const broken = structuredClone(map);
  const brokenCity = broken.settlements.cities[river.id];
  const brokenBurg = broken.pack.burgs[brokenCity.burgId];
  broken.pack.cells.r[brokenCity.packCell] = 0;
  broken.pack.cells.fl[brokenCity.packCell] = 0;
  assert.equal(inspectRelocatedSettlementPort(broken.grid, broken.pack, brokenCity.packCell, {
    wasPort: brokenCity.port,
    capital: Boolean(brokenCity.capital || brokenBurg.capital),
    burgId: brokenCity.burgId,
    options: broken.options
  }).port, 0, "断河入口仍被认作可航港口");
}

function assertFrozenWaterFinalEdgeRejected(map) {
  const route = map.settlements.routes.find(item => item?.type === "searoute" && item.packCells?.some((cell, index) => index > 0
    && map.pack.cells.h[item.packCells[index - 1]] < 20
    && map.pack.cells.h[cell] < 20));
  assert(route, "匿名样本缺少 water→water 路径反例");
  const index = route.packCells.findIndex((cell, offset) => offset > 0
    && map.pack.cells.h[route.packCells[offset - 1]] < 20
    && map.pack.cells.h[cell] < 20);
  const pack = structuredClone(map.pack);
  const path = [route.packCells[index - 1], route.packCells[index]];
  pack.cells.c[path[0]] = [path[1]];
  pack.cells.c[path[1]] = [path[0]];
  pack.cells.temp[path[1]] = -10;
  assert.equal(isSettlementWaterRoutePathValid(pack, path), false, "最终 water→water 边错误使用陆地出口豁免跳过温度门");
  assert.deepEqual(traceSettlementWaterRoutePath(pack, path[0], path[1]), [], "正式寻路的最终 water→water 边跳过了温度门");

  const coast = activeCities(map).find(city => {
    const haven = Number(map.pack.cells.haven?.[city.packCell]);
    return Number(city.port) > 0 && haven > 0 && map.pack.cells.c?.[city.packCell]?.includes(haven);
  });
  assert(coast, "匿名样本缺少正式海岸港口入口");
  const land = Number(coast.packCell);
  const water = Number(map.pack.cells.haven[land]);
  const coastPack = structuredClone(map.pack);
  coastPack.cells.c[land] = [water];
  coastPack.cells.c[water] = [land];
  coastPack.cells.r[land] = 0;
  coastPack.cells.fl[land] = 0;
  coastPack.cells.haven[land] = 0;
  assert.deepEqual(traceSettlementWaterRoutePath(coastPack, land, water), [], "缺少 haven 的陆地起点仍可任意入水");
  assert.deepEqual(traceSettlementWaterRoutePath(coastPack, water, land), [], "缺少 haven 的陆地终点仍可任意离水");
  coastPack.cells.haven[land] = water;
  assert.deepEqual(traceSettlementWaterRoutePath(coastPack, land, water), [land, water], "正式 haven 起点无法入水");
  assert.deepEqual(traceSettlementWaterRoutePath(coastPack, water, land), [water, land], "正式 haven 终点无法离水");
}

function assertPortTopology(map, label) {
  const seen = new Set();
  for (const city of activeCities(map).filter(city => Number(city.port) > 0)) {
    const burg = map.pack.burgs[city.burgId];
    assert.equal(Number(burg.port), Number(city.port), `${label} city / burg port 镜像不一致`);
    assert(!seen.has(Number(city.packCell)), `${label} 两个港口占用同一 pack cell`);
    seen.add(Number(city.packCell));
    const placement = inspectRelocatedSettlementPort(map.grid, map.pack, city.packCell, {
      wasPort: city.port,
      capital: Boolean(city.capital || burg.capital),
      burgId: city.burgId,
      options: map.options
    });
    assert.equal(Number(placement.port), Number(city.port), `${label} 港口不再满足正式 haven / river / temperature 规则`);
  }
}

function assertReachablePortCoverage(map, label) {
  const groups = Map.groupBy(activeCities(map).filter(city => Number(city.port) > 0), city => Number(city.port));
  const routeFeatures = new Set(map.settlements.routes.filter(route => route?.type === "searoute").map(route => Number(route.feature)));
  let reachable = 0;
  let missing = 0;
  for (const [feature, cities] of groups) {
    let hasPath = false;
    for (let from = 0; from < cities.length && !hasPath; from++) {
      for (let to = from + 1; to < cities.length && !hasPath; to++) {
        hasPath = traceSettlementWaterRoutePath(map.pack, cities[from].packCell, cities[to].packCell).length > 1;
      }
    }
    if (!hasPath) continue;
    reachable++;
    if (!routeFeatures.has(feature)) missing++;
  }
  assert.equal(missing, 0, `${label} 有正式可达港口对的水体缺少海路`);
  return {reachableFeatures: reachable, missingReachableFeatures: missing};
}

function assertRouteEndpoints(map, label) {
  for (const route of map.settlements.routes || []) {
    if (Number(route.from) >= 0) {
      const city = map.settlements.cities[Number(route.from)];
      assert(city && !city.removed, `${label} route.from 不是活动城市`);
      assert.equal(Number(route.packCells[0]), Number(city.packCell), `${label} route.from 与首 pack cell 错位`);
      assert.deepEqual(route.points[0], [Number(city.x), Number(city.y)], `${label} route.from 显示点错位`);
    }
    if (Number(route.to) >= 0) {
      const city = map.settlements.cities[Number(route.to)];
      assert(city && !city.removed, `${label} route.to 不是活动城市`);
      assert.equal(Number(route.packCells.at(-1)), Number(city.packCell), `${label} route.to 与末 pack cell 错位`);
      assert.deepEqual(route.points.at(-1), [Number(city.x), Number(city.y)], `${label} route.to 显示点错位`);
    }
    for (let index = 1; index < route.packCells.length; index++) {
      assert(map.pack.cells.c[route.packCells[index - 1]].includes(route.packCells[index]), `${label} route pack path 不邻接`);
    }
  }
}

async function auditOptionalAnonymousRealSave() {
  const path = process.env.FMG_PORT_TOPOLOGY_REAL_SAVE;
  if (!path) return {executed: false};
  const map = parseMapDocument(await readFile(path, "utf8")).map;
  const startedAt = performance.now();
  const report = reconcileSettlementPortTopology(map, {mode: "routes"});
  const planMs = Number((performance.now() - startedAt).toFixed(1));
  finalizeSettlements(map.grid, map.features, map.politics, map.settlements, map.pack, {
    ...map.options,
    routeRegenerationSalt: 16,
    lockedRoutes: []
  });
  assertPortTopology(map, "匿名真实旧档");
  const coverage = assertReachablePortCoverage(map, "匿名真实旧档 salt16");
  assert(map.settlements.routes.some(route => route?.type === "searoute"), "匿名真实旧档 salt16 仍没有海路");
  return {
    executed: true,
    inspected: report.inspected,
    moved: report.moved,
    cleared: report.cleared,
    planMs,
    routes: map.settlements.routes.length,
    searoutes: map.settlements.routes.filter(route => route?.type === "searoute").length,
    ...coverage
  };
}

function activeCities(map) {
  return (map.settlements?.cities || []).filter(city => city && !city.removed);
}

function motherOf(map, gridCell) {
  return Number(map.grid.refinement?.mother?.[gridCell] ?? gridCell);
}

function portFacts(map, cityId) {
  const city = map.settlements.cities[cityId];
  const burg = map.pack.burgs[city.burgId];
  return {
    city: {cell: city.cell, packCell: city.packCell, x: city.x, y: city.y, port: city.port},
    burg: {cell: burg.cell, x: burg.x, y: burg.y, port: burg.port}
  };
}

function portPositionFacts(map, cityId) {
  const city = map.settlements.cities[cityId];
  const burg = map.pack.burgs[city.burgId];
  return {
    city: {cell: city.cell, packCell: city.packCell, x: city.x, y: city.y, coa: structuredClone(city.coa)},
    burg: {cell: burg.cell, x: burg.x, y: burg.y, coa: structuredClone(burg.coa)}
  };
}
