#!/usr/bin/env node
import assert from "node:assert/strict";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {
  collectLockedWarzoneDiplomacySupport,
  oceanCurrentWorldStageConstraints,
  rebuildOceanCurrentWorldStage
} from "../app/webgl-generator/src/generator/ocean-current-world.js";
import {captureDiplomacyRelationSnapshot} from "../app/webgl-generator/src/generator/diplomacy-regeneration-locks.js";
import {reconcileWarDerivedData, resolveWarzoneStatePair} from "../app/webgl-generator/src/generator/war-consistency.js";
import {captureRegenerationConstraintBundle} from "../app/webgl-generator/src/runtime/regeneration-constraint-bundle.js";

const stageKeys = {
  "ocean-currents": ["lockedOceanCurrents"],
  climate: [],
  rivers: ["lockedRivers"],
  "biomes-population": [],
  cultures: ["lockedCultures"],
  "cities-routes": ["lockedCities", "lockedRoutes"],
  "states-provinces": ["lockedStates", "lockedProvinces", "lockedCities", "lockedRoutes"],
  religions: ["lockedReligions"],
  "markers-economy": ["lockedFeatures", "lockedMarkers", "lockedMarkets", "lockedDeals"],
  diplomacy: ["lockedDiplomacyRelations"],
  "military-zones": ["lockedMilitaryRegiments", "lockedZones"]
};
const stageDomains = {
  "ocean-currents": ["ocean-current"],
  rivers: ["river"],
  cultures: ["culture"],
  "cities-routes": ["city", "route"],
  "states-provinces": ["state", "province", "city", "route"],
  religions: ["religion"],
  "markers-economy": ["feature", "marker", "economy-market", "trade-flow"],
  diplomacy: ["diplomacy-relation"],
  "military-zones": ["military", "zone"]
};

const calls = [];
const bundleValues = Object.fromEntries(
  [...new Set(Object.values(stageKeys).flat())].map((key, index) => [key, Object.freeze([{key, index}])])
);
const bundle = Object.freeze({
  ...bundleValues,
  isDomainFullyLocked(domain, context) {
    assert.equal(context.constraintBundle, bundle, `${context.system}/${domain} 未贯穿同一 bundle`);
    assertStageSlice(context.system, context.constraints);
    return true;
  },
  assertDomain(domain, context) {
    assert.equal(context.constraintBundle, bundle, `${context.system}/${domain}/${context.phase} bundle 身份变化`);
    assertStageSlice(context.system, context.constraints);
    calls.push(`${context.system}:${domain}:${context.phase}`);
  }
});

const map = generatePlaceholderMap({seed: "ocean-current-world-bundle", cellsTarget: 1000, heightmapTemplate: "continents"});
for (const system of Object.keys(stageDomains)) {
  const before = lightweightSnapshot(map);
  const result = await rebuildOceanCurrentWorldStage(map, system, {
    seed: `bundle:${system}`,
    constraintBundle: bundle
  });
  assert.equal(result.executed, false, `${system} 全锁 stage 未跳过`);
  assert.equal(result.reason, "domain-fully-locked", `${system} 跳过原因不稳定`);
  assert.deepEqual(lightweightSnapshot(map), before, `${system} 全锁跳过仍改写地图`);
}
for (const system of ["climate", "biomes-population"]) {
  const result = await rebuildOceanCurrentWorldStage(map, system, {
    seed: `bundle:${system}`,
    constraintBundle: bundle
  });
  assert.equal(result.executed, true, `${system} 无锁域 stage 被误跳过`);
  assertStageSlice(system, oceanCurrentWorldStageConstraints(system, bundle));
}

for (const [system, domains] of Object.entries(stageDomains)) {
  for (const domain of domains) {
    assert(calls.includes(`${system}:${domain}:before`), `${system}/${domain} 缺少前置断言`);
    assert(calls.includes(`${system}:${domain}:after`), `${system}/${domain} 缺少后置断言`);
  }
}

const riverMap = generatePlaceholderMap({seed: "ocean-current-world-bundle-river", cellsTarget: 2000, heightmapTemplate: "continents"});
const lockedRiver = structuredClone(riverMap.rivers.rivers.find(Boolean));
assert(lockedRiver, "真实小图缺少锁定河流样本");
const lockedRiverBefore = JSON.stringify(lockedRiver);
const riverBundle = Object.freeze({
  lockedRivers: Object.freeze([lockedRiver]),
  isDomainFullyLocked: () => false,
  assertDomain(domain, context) {
    assert.equal(domain, "river");
    assert.equal(context.constraintBundle, riverBundle);
    assert.equal(context.constraints.lockedRivers, riverBundle.lockedRivers);
  }
});
const riverResult = await rebuildOceanCurrentWorldStage(riverMap, "rivers", {
  seed: "ocean-current-world-bundle-river:next",
  constraintBundle: riverBundle
});
assert.equal(riverResult.executed, true, "真实河流 stage 未执行");
assert.equal(
  JSON.stringify(riverMap.rivers.rivers.find(river => Number(river.i ?? river.id) === Number(lockedRiver.i ?? lockedRiver.id))),
  lockedRiverBefore,
  "真实河流 stage 未透传 lockedRivers"
);

const politicsMap = generatePlaceholderMap({seed: "ocean-current-world-bundle-politics", cellsTarget: 2000, heightmapTemplate: "continents"});
politicsMap.politics.states = structuredClone(politicsMap.politics.states);
politicsMap.politics.provinces = structuredClone(politicsMap.politics.provinces);
assert.notEqual(politicsMap.politics.states, politicsMap.pack.states, "政治红门必须模拟分离国家镜像");
assert.notEqual(politicsMap.politics.provinces, politicsMap.pack.provinces, "政治红门必须模拟分离省份镜像");
const lockedState = politicsMap.politics.states.find(state => state?.i && !state.removed);
const lockedProvince = politicsMap.politics.provinces.find(province => province?.i && !province.removed);
const lockedCity = politicsMap.settlements.cities.find(city => city && !city.removed);
const lockedRoute = politicsMap.settlements.routes.find(route => route && !route.removed);
assert(lockedState && lockedProvince && lockedCity && lockedRoute, "真实政治小图缺少锁定样本");
politicsMap.regenerationLocks = {
  version: 1,
  entries: [
    {kind: "state", id: lockedState.i},
    {kind: "province", id: lockedProvince.i},
    {kind: "city", id: lockedCity.id},
    {kind: "route", id: lockedRoute.id}
  ]
};
const politicsBundle = captureRegenerationConstraintBundle(politicsMap, {closure: ["states-provinces"]});
const politicsBefore = {
  state: JSON.stringify(lockedState),
  province: JSON.stringify(lockedProvince),
  city: JSON.stringify(lockedCity),
  route: JSON.stringify(lockedRoute)
};
const politicsResult = await rebuildOceanCurrentWorldStage(politicsMap, "states-provinces", {
  seed: "ocean-current-world-bundle-politics:next",
  constraintBundle: politicsBundle
});
assert.equal(politicsResult.executed, true, "真实政治 stage 未执行");
politicsBundle.assertDomain(politicsMap, "states-provinces", "after");
assert.equal(politicsMap.politics.states, politicsMap.pack.states, "政治 stage 未重新统一国家镜像 owner");
assert.equal(politicsMap.politics.provinces, politicsMap.pack.provinces, "政治 stage 未重新统一省份镜像 owner");
assert.equal(JSON.stringify(politicsMap.politics.states[lockedState.i]), politicsBefore.state, "锁定国家完整快照变化");
assert.equal(JSON.stringify(politicsMap.politics.provinces[lockedProvince.i]), politicsBefore.province, "锁定省份完整快照变化");
assert.equal(JSON.stringify(politicsMap.pack.states[lockedState.i]), politicsBefore.state, "锁定国家 pack 镜像完整快照变化");
assert.equal(JSON.stringify(politicsMap.pack.provinces[lockedProvince.i]), politicsBefore.province, "锁定省份 pack 镜像完整快照变化");
assert.equal(JSON.stringify(politicsMap.settlements.cities.find(city => city?.id === lockedCity.id)), politicsBefore.city, "锁定城镇完整快照变化");
assert.equal(JSON.stringify(politicsMap.settlements.routes.find(route => route?.id === lockedRoute.id)), politicsBefore.route, "锁定道路完整快照变化");

const zeroBurgMap = generatePlaceholderMap({
  seed: "ocean-current-world-bundle-zero-burg-province",
  cellsTarget: 10000,
  heightmapTemplate: "continents"
});
const zeroBurgProvince = zeroBurgMap.politics.provinces.find(
  province => province?.i
    && !province.removed
    && Number(province.state) > 0
    && zeroBurgMap.settlements.cities.some(city => city
      && !city.removed
      && Number(city.state) === Number(province.state)
      && Number(city.province) === Number(province.i))
);
assert(zeroBurgProvince, "10k 真实地图缺少可构造的锁国无省会省份样本");
const zeroBurgProvinceId = Number(zeroBurgProvince.i);
for (const collection of [zeroBurgMap.politics.provinces, zeroBurgMap.pack.provinces]) {
  const province = collection?.[Number(zeroBurgProvince.i)];
  if (province) province.burg = 0;
}
for (const city of zeroBurgMap.settlements.cities || []) {
  if (!city || Number(city.province) !== Number(zeroBurgProvince.i)) continue;
  city.provincial = false;
  const burg = zeroBurgMap.pack.burgs?.[Number(city.burgId)];
  if (burg) burg.provincial = 0;
}
zeroBurgMap.regenerationLocks = {
  version: 1,
  entries: [{kind: "state", id: zeroBurgProvince.state}]
};
const zeroBurgBundle = captureRegenerationConstraintBundle(zeroBurgMap, {closure: ["world"]});
const zeroBurgEnvelopeBefore = JSON.stringify(captureStateSupportEnvelope(zeroBurgMap, zeroBurgProvince.state));
const zeroBurgResult = await rebuildOceanCurrentWorldStage(zeroBurgMap, "cities-routes", {
  seed: "ocean-current-world-bundle-zero-burg-province:next",
  constraintBundle: zeroBurgBundle
});
assert.equal(zeroBurgResult.executed, true, "10k 锁国 cities-routes stage 未执行");
zeroBurgBundle.assertDomain(zeroBurgMap, "state", "after");
const zeroBurgProvinceAfter = zeroBurgMap.politics.provinces.find(
  province => Number(province?.i ?? province?.id) === Number(zeroBurgProvince.i)
);
assert.equal(Number(zeroBurgProvinceAfter?.burg || 0), 0, "锁国无省会省份被 cities-routes 新建省会");
assert.equal(
  JSON.stringify(captureStateSupportEnvelope(zeroBurgMap, zeroBurgProvince.state)),
  zeroBurgEnvelopeBefore,
  "锁国完整 state/province/city 支撑包络变化"
);
if (process.argv.includes("--society-politics-only")) {
  console.log(JSON.stringify({
    ok: true,
    politics: {state: lockedState.i, province: lockedProvince.i, city: lockedCity.id, route: lockedRoute.id},
    zeroBurg: {state: zeroBurgProvince.state, province: zeroBurgProvinceId, capital: Number(zeroBurgProvinceAfter?.burg || 0)},
    browserRuns: 0
  }, null, 2));
  process.exit(0);
}

const stageStateCases = [
  {
    system: "markers-economy",
    cellsTarget: 10000,
    seed: "regeneration-lock-stage-f-scale-valid-10000",
    nextSeed: "stage-f-world-10000"
  },
  {
    system: "religions",
    cellsTarget: 50000,
    seed: "regeneration-lock-stage-f-scale-valid-50000",
    nextSeed: "stage-f-world-50000"
  }
];
const stageStateResults = [];
for (const stageCase of stageStateCases) {
  const stageMap = generatePlaceholderMap({
    seed: stageCase.seed,
    cellsTarget: stageCase.cellsTarget,
    heightmapTemplate: "continents"
  });
  const stateId = 1;
  assert(stageMap.politics?.states?.[stateId] && !stageMap.politics.states[stateId].removed, `${stageCase.system} 缺少 state #1`);
  stageMap.regenerationLocks = {version: 1, entries: [{kind: "state", id: stateId}]};
  const stageBundle = captureRegenerationConstraintBundle(stageMap, {closure: ["world"]});
  const before = JSON.stringify(captureStateSupportEnvelope(stageMap, stateId));
  const stageResult = await rebuildOceanCurrentWorldStage(stageMap, stageCase.system, {
    seed: stageCase.nextSeed,
    constraintBundle: stageBundle
  });
  assert.equal(stageResult.executed, true, `${stageCase.cellsTarget} ${stageCase.system} stage 未执行`);
  stageBundle.assertDomain(stageMap, "state", "after");
  assert.equal(
    JSON.stringify(captureStateSupportEnvelope(stageMap, stateId)),
    before,
    `${stageCase.cellsTarget} ${stageCase.system} 改写锁国支撑包络`
  );
  stageStateResults.push({system: stageCase.system, cellsTarget: stageCase.cellsTarget, state: stateId});
}

const featureMarkerMap = generatePlaceholderMap({
  seed: "regeneration-lock-stage-f-scale-valid-10000",
  cellsTarget: 10000,
  heightmapTemplate: "continents"
});
const lockedFeatureId = 1;
assert(featureMarkerMap.pack.features?.[lockedFeatureId], "10k 固定图缺少 feature #1");
const lockedFeatureMarkerIds = featureMarkerMap.markers.markers
  .filter(marker => Number(marker?.data?.feature) === lockedFeatureId)
  .map(marker => marker.id);
assert(lockedFeatureMarkerIds.length > 0, "10k 固定图 feature #1 缺少 marker 引用样本");
featureMarkerMap.regenerationLocks = {version: 1, entries: [{kind: "feature", id: lockedFeatureId}]};
const featureMarkerBundle = captureRegenerationConstraintBundle(featureMarkerMap, {closure: ["world"]});
const featureMarkerResult = await rebuildOceanCurrentWorldStage(featureMarkerMap, "markers-economy", {
  seed: "stage-f-world-10000",
  constraintBundle: featureMarkerBundle
});
assert.equal(featureMarkerResult.executed, true, "锁 feature markers-economy stage 未执行");
featureMarkerBundle.assertDomain(featureMarkerMap, "feature", "after");
assert.deepEqual(
  featureMarkerMap.markers.markers
    .filter(marker => Number(marker?.data?.feature) === lockedFeatureId)
    .map(marker => marker.id),
  lockedFeatureMarkerIds,
  "锁 feature 的 marker 引用顺序变化"
);

const coLocatedMilitaryMap = generatePlaceholderMap({
  seed: "regeneration-lock-stage-f-scale-valid-10000",
  cellsTarget: 10000,
  heightmapTemplate: "continents"
});
const coLocatedStateId = findCoLocatedMilitaryState(coLocatedMilitaryMap);
assert(coLocatedStateId > 0, "10k 固定图缺少既有合法共驻军团国家");
coLocatedMilitaryMap.regenerationLocks = {version: 1, entries: [{kind: "state", id: coLocatedStateId}]};
const coLocatedMilitaryBundle = captureRegenerationConstraintBundle(coLocatedMilitaryMap, {closure: ["world"]});
const coLocatedMilitaryBefore = JSON.stringify(coLocatedMilitaryMap.pack.states[coLocatedStateId].military);
const coLocatedMilitaryResult = await rebuildOceanCurrentWorldStage(coLocatedMilitaryMap, "military-zones", {
  seed: "stage-f-world-10000",
  constraintBundle: coLocatedMilitaryBundle
});
assert.equal(coLocatedMilitaryResult.executed, true, "锁国共驻军团 military-zones stage 未执行");
coLocatedMilitaryBundle.assertDomain(coLocatedMilitaryMap, "state", "after");
assert.equal(
  JSON.stringify(coLocatedMilitaryMap.pack.states[coLocatedStateId].military),
  coLocatedMilitaryBefore,
  "锁国既有合法共驻军团未完整保留"
);

const compositeMap = generatePlaceholderMap({
  seed: "regeneration-lock-stage-f-scale-valid-10000",
  cellsTarget: 10000,
  heightmapTemplate: "continents"
});
ensureWarzoneRepresentative(compositeMap);
const compositeReferences = representativeWorldReferences(compositeMap);
assert.equal(compositeReferences.length, 15, "10k 复合 world 未覆盖 15 类锁");
compositeMap.regenerationLocks = {version: 1, entries: compositeReferences};
const compositeBundle = captureRegenerationConstraintBundle(compositeMap, {closure: ["world"]});
const compositeLockedFeatureId = Number(compositeBundle.lockedFeatures[0]?.i ?? compositeBundle.lockedFeatures[0]?.id);
const lockedFeatureBurgTombstones = (compositeMap.pack.burgs || [])
  .filter(burg => burg?.removed && (Number(burg.feature) === compositeLockedFeatureId || Number(burg.port) === compositeLockedFeatureId || Number(burg.data?.feature) === compositeLockedFeatureId))
  .map(burg => ({index: Number(burg.i ?? burg.id), value: structuredClone(burg)}));
assert.equal(lockedFeatureBurgTombstones.length, 16, "10k 复合 world 未覆盖锁定 Feature 的历史 burg 引用槽");
const lockedZoneBefore = JSON.stringify(compositeBundle.lockedZones[0]);
const lockedWarzoneId = Number(compositeBundle.lockedZones[0]?.i ?? compositeBundle.lockedZones[0]?.id);
assert(Number.isInteger(lockedWarzoneId), "复合 world 未捕获有效战区 ID");
assert.equal(compositeBundle.lockedZones[0]?.type, "Warzone", "10k 复合 world 未捕获战区代表样本");
const lockedWarzonePair = resolveWarzoneStatePair(compositeMap.pack, compositeBundle.lockedZones[0]);
assert(lockedWarzonePair, "锁定 Warzone 未解析出有效国家对");
const supportingDiplomacyBefore = collectLockedWarzoneDiplomacySupport(compositeMap.pack, compositeBundle.lockedZones);
assert.equal(supportingDiplomacyBefore.length, 1, "锁定 Warzone 未形成唯一外交支撑");
const supportingPairBefore = captureWarSupportEnvelope(
  captureDiplomacyRelationSnapshot(compositeMap.pack, lockedWarzonePair.attacker, lockedWarzonePair.defender)
);
assert.equal(supportingPairBefore.leftRelation, "Enemy", "锁定 Warzone 外交支撑不是敌对关系");
assert.equal(supportingPairBefore.rightRelation, "Enemy", "锁定 Warzone 反向外交支撑不是敌对关系");
for (const system of Object.keys(stageKeys)) {
  const stageResult = await rebuildOceanCurrentWorldStage(compositeMap, system, {
    seed: "stage-f-world-10000",
    constraintBundle: compositeBundle
  });
  assert.equal(stageResult.executed, true, `复合 world ${system} stage 未执行`);
  if (system === "cities-routes") {
    for (const tombstone of lockedFeatureBurgTombstones) {
      assert.deepEqual(compositeMap.pack.burgs[tombstone.index], tombstone.value, `锁定 Feature 的历史 burg #${tombstone.index} 引用槽被复用`);
    }
  }
}
compositeBundle.assertDomain(compositeMap, "world", "after");
const supportingPairAfter = captureWarSupportEnvelope(
  captureDiplomacyRelationSnapshot(compositeMap.pack, lockedWarzonePair.attacker, lockedWarzonePair.defender)
);
assert.deepEqual(supportingPairAfter, supportingPairBefore, "复合 world 未保留锁定 Warzone 的敌对关系与战役支撑");
const warConsistency = reconcileWarDerivedData(compositeMap);
assert.equal(warConsistency.removedWarzones, 0, "战争一致性清理误删锁定 Warzone");
assert(!warConsistency.removedWarzoneIds.map(Number).includes(lockedWarzoneId), `战争一致性清理报告误删 zone #${lockedWarzoneId}`);
assert.equal(
  JSON.stringify(compositeMap.zones.zones.find(zone => Number(zone?.i ?? zone?.id) === lockedWarzoneId)),
  lockedZoneBefore,
  `复合 world 未保留 zone #${lockedWarzoneId}`
);
assert.equal(
  JSON.stringify(compositeMap.pack.zones.find(zone => Number(zone?.i ?? zone?.id) === lockedWarzoneId)),
  lockedZoneBefore,
  `复合 world 未保留 pack zone #${lockedWarzoneId} 镜像`
);

const conflict = new Error("bundle-domain-conflict");
conflict.code = "regeneration_lock_conflict";
await assert.rejects(
  rebuildOceanCurrentWorldStage(
    generatePlaceholderMap({seed: "ocean-current-world-bundle-conflict", cellsTarget: 1000, heightmapTemplate: "continents"}),
    "rivers",
    {
      constraintBundle: Object.freeze({
        lockedRivers: Object.freeze([]),
        assertDomain() {
          throw conflict;
        }
      })
    }
  ),
  error => error === conflict && error.code === "regeneration_lock_conflict"
);

console.log(JSON.stringify({
  ok: true,
  bundleIdentity: true,
  stages: Object.keys(stageKeys).length,
  assertedDomains: calls.length / 2,
  fullLockSkipped: Object.keys(stageDomains).length,
  unlockedStage: "rivers",
  zeroBurgProvince: {
    cellsTarget: 10000,
    state: zeroBurgProvince.state,
    province: zeroBurgProvince.i,
    burg: zeroBurgProvinceAfter.burg
  },
  stageStateResults,
  featureMarker: {
    cellsTarget: 10000,
    feature: lockedFeatureId,
    markers: lockedFeatureMarkerIds.length
  },
  coLocatedMilitary: {
    cellsTarget: 10000,
    state: coLocatedStateId,
    regiments: coLocatedMilitaryMap.pack.states[coLocatedStateId].military.length
  },
  compositeWorld: {
    cellsTarget: 10000,
    kinds: compositeReferences.length,
    zone: lockedWarzoneId,
    supportingDiplomacyPair: supportingPairBefore.id,
    warConsistencyRemovedZones: warConsistency.removedWarzones,
    stages: Object.keys(stageKeys).length
  },
  conflict: conflict.code
}, null, 2));

function assertStageSlice(system, constraints) {
  const expected = stageKeys[system];
  assert.deepEqual(Object.keys(constraints), expected, `${system} 收到错误约束 slice`);
  for (const key of expected) assert.equal(constraints[key], bundle[key], `${system}.${key} 未保留 bundle slice 引用`);
}

function lightweightSnapshot(value) {
  return JSON.parse(JSON.stringify({
    features: value.features,
    pack: value.pack,
    society: value.society,
    settlements: value.settlements,
    politics: value.politics,
    rivers: value.rivers,
    markers: value.markers,
    economy: value.economy,
    diplomacy: value.diplomacy,
    military: value.military,
    zones: value.zones,
    oceanCurrents: value.oceanCurrents
  }));
}

function findCoLocatedMilitaryState(map) {
  for (const state of map.pack.states || []) {
    if (!state?.i || state.removed) continue;
    const positions = new Set();
    for (const regiment of state.military || []) {
      const key = `${Number(regiment.x).toFixed(4)}:${Number(regiment.y).toFixed(4)}`;
      if (positions.has(key)) return Number(state.i);
      positions.add(key);
    }
  }
  return 0;
}

function representativeWorldReferences(map) {
  const states = activeRows(map.pack.states, true);
  const river = findLakeBoundRiver(map) || activeRows(map.rivers.rivers)[0];
  const religion = activeRows(map.society.religions, true).find(item => {
    const center = Number(item.center);
    return Number.isInteger(center)
      && center >= 0
      && center < (map.pack.cells.i?.length || 0)
      && Number(map.pack.cells.h?.[center]) >= 20
      && Number(map.pack.cells.religion?.[center]) === Number(item.i ?? item.id);
  });
  const diplomacy = reciprocalDiplomacyPair(states);
  const military = states.flatMap(state =>
    (state.military || []).map(regiment => ({kind: "military", id: `${state.i}:${regiment.i}`}))
  )[0];
  const warzone = activeRows(map.zones.zones).find(zone => zone.type === "Warzone" && resolveWarzoneStatePair(map.pack, zone));
  const references = [
    firstReference("state", map.politics.states, true),
    firstReference("province", map.politics.provinces, true),
    firstReference("city", map.settlements.cities),
    firstReference("route", map.settlements.routes),
    river ? {kind: "river", id: river.id ?? river.i} : null,
    firstReference("marker", map.markers.markers),
    diplomacy ? {kind: "diplomacy-relation", id: diplomacy} : null,
    religion ? {kind: "religion", id: religion.id ?? religion.i} : null,
    firstReference("culture", map.society.cultures, true),
    military,
    warzone ? {kind: "zone", id: warzone.id ?? warzone.i} : null,
    firstReference("feature", map.pack.features),
    firstReference("ocean-current", map.oceanCurrents.currents),
    firstReference("economy-market", map.pack.markets, true),
    firstReference("trade-flow", map.pack.deals)
  ].filter(Boolean);
  return [...new Map(references.map(reference => [reference.kind, reference])).values()];
}

function ensureWarzoneRepresentative(map) {
  const states = activeRows(map.pack?.states, true);
  let pair = null;
  for (let left = 0; left < states.length && !pair; left++) {
    for (let right = left + 1; right < states.length; right++) {
      if (states[left].diplomacy?.[states[right].i] === "Enemy"
        && states[right].diplomacy?.[states[left].i] === "Enemy") {
        pair = {attacker: Number(states[left].i), defender: Number(states[right].i)};
        break;
      }
    }
  }
  assert(pair, "10k 真实地图缺少可构造战区的敌对国家对");
  const source = activeRows(map.zones?.zones || map.pack?.zones)[0];
  assert(source, "10k 真实地图缺少可构造战区的地区对象");
  const id = Number(source.i ?? source.id);
  const warzone = {...structuredClone(source), type: "Warzone", ...pair};
  for (const collection of [...new Set([map.zones?.zones, map.pack?.zones].filter(Array.isArray))]) {
    const index = collection.findIndex(zone => Number(zone?.i ?? zone?.id) === id);
    if (index >= 0) collection[index] = structuredClone(warzone);
  }
}

function firstReference(kind, rows, positive = false) {
  const object = activeRows(rows, positive)[0];
  return object ? {kind, id: object.id ?? object.i} : null;
}

function activeRows(rows, positive = false) {
  return (rows || []).filter(object =>
    object && !object.removed && (!positive || Number(object.i ?? object.id) > 0)
  );
}

function findLakeBoundRiver(map) {
  const rivers = activeRows(map.rivers.rivers);
  for (const lake of (map.pack.features || []).filter(feature => feature?.type === "lake")) {
    const lakeId = Number(lake.i ?? lake.id);
    for (const inletId of lake.inlets || []) {
      const river = rivers.find(item => Number(item.id ?? item.i) === Number(inletId));
      if (river?.outletKind === "lake" && Number(river.outletFeatureId) === lakeId) return river;
    }
  }
  return null;
}

function reciprocalDiplomacyPair(states) {
  const inverse = relation => ({Vassal: "Suzerain", Suzerain: "Vassal"})[relation] || relation;
  for (let left = 0; left < states.length; left++) {
    for (let right = left + 1; right < states.length; right++) {
      const leftState = states[left];
      const rightState = states[right];
      const leftRelation = leftState.diplomacy?.[rightState.i];
      const rightRelation = rightState.diplomacy?.[leftState.i];
      if (leftRelation && leftRelation !== "Enemy"
        && inverse(leftRelation) === rightRelation && inverse(rightRelation) === leftRelation) {
        return `${Math.min(leftState.i, rightState.i)}:${Math.max(leftState.i, rightState.i)}`;
      }
    }
  }
  return null;
}

function captureStateSupportEnvelope(map, stateId) {
  const normalizedStateId = Number(stateId);
  const state = map.politics?.states?.find(item => Number(item?.i ?? item?.id) === normalizedStateId) || null;
  const provinceIds = [...new Set((state?.provinces || []).map(Number))].sort((left, right) => left - right);
  const cities = (map.settlements?.cities || [])
    .filter(city => {
      if (!city || city.removed) return false;
      return Number(map.pack?.cells?.state?.[Number(city.packCell)]) === normalizedStateId;
    })
    .sort((left, right) => String(left.id).localeCompare(String(right.id), "en"));

  return {
    state,
    packState: map.pack?.states?.find(item => Number(item?.i ?? item?.id) === normalizedStateId) || null,
    stateCells: {
      pack: memberCells(map.pack?.cells?.state, normalizedStateId),
      grid: memberCells(map.grid?.cells?.state, normalizedStateId)
    },
    provinces: provinceIds.map(id => ({
      province: map.politics?.provinces?.[id] || null,
      packProvince: map.pack?.provinces?.[id] || null,
      packCells: memberCells(map.pack?.cells?.province, id),
      gridCells: memberCells(map.grid?.cells?.province, id)
    })),
    cities: cities.map(city => ({
      city,
      packBurg: map.pack?.burgs?.[Number(city.burgId)] || null,
      packCellBurg: Number(map.pack?.cells?.burg?.[Number(city.packCell)]) || 0,
      gridCellBurg: Number(map.grid?.cells?.burg?.[Number(city.cell)]) || 0
    }))
  };
}

function memberCells(values, id) {
  const members = [];
  for (let cell = 0; cell < (values?.length || 0); cell += 1) {
    if (Number(values[cell]) === Number(id)) members.push(cell);
  }
  return members;
}

function captureWarSupportEnvelope(snapshot) {
  return {
    id: snapshot.id,
    leftId: snapshot.leftId,
    rightId: snapshot.rightId,
    leftRelation: snapshot.leftRelation,
    rightRelation: snapshot.rightRelation,
    campaigns: snapshot.campaigns,
    chronicleEntries: snapshot.chronicleEntries
  };
}
