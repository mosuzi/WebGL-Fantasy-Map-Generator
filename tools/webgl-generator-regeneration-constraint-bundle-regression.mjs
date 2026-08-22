#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {
  captureRegenerationConstraintBundle,
  isRegenerationConstraintDomainFullyLocked,
  REGENERATION_CONSTRAINT_DOMAIN_KINDS
} from "../app/webgl-generator/src/runtime/regeneration-constraint-bundle.js";
import {REGENERATION_LOCK_KINDS} from "../app/webgl-generator/src/runtime/regeneration-locks.js";

const map = generatePlaceholderMap({
  seed: "regeneration-constraint-bundle",
  cellsTarget: 6000,
  graphWidth: 1200,
  graphHeight: 760,
  heightmapTemplate: "continents"
});
const references = sampleReferences(map);
assert.equal(references.length, REGENERATION_LOCK_KINDS.length, "固定图未覆盖 15 类锁仓");
map.regenerationLocks = {version: 1, entries: references};

const bundle = captureRegenerationConstraintBundle(map);
assert(Object.isFrozen(bundle), "bundle 顶层未冻结");
assert(Object.isFrozen(bundle.domains), "domain slices 未冻结");
assert.deepEqual(bundle.selectedKinds, REGENERATION_LOCK_KINDS, "默认 bundle 未一次捕获全部 15 类");
for (const reference of references) {
  assert.equal(bundle.snapshots(reference.kind).length, 1, `${reference.kind} 未捕获锁定快照`);
  assert.deepEqual(bundle.ids(reference.kind), [String(reference.id)], `${reference.kind} 未捕获稳定 ID`);
  assert(Object.isFrozen(bundle.snapshots(reference.kind)), `${reference.kind} 快照数组未冻结`);
  assert(Object.isFrozen(bundle.snapshots(reference.kind)[0]), `${reference.kind} 快照未深冻结`);
}

const statesProvinces = bundle.domains["states-provinces"];
assert.deepEqual(
  Object.keys(statesProvinces),
  ["lockedStates", "lockedProvinces", "lockedCities", "lockedRoutes"],
  "states-provinces slice 不精确"
);
assert.equal(statesProvinces.lockedStates, bundle.lockedStates);
assert.equal(statesProvinces.lockedProvinces, bundle.lockedProvinces);
assert.equal(statesProvinces.lockedCities, bundle.lockedCities);
assert.equal(statesProvinces.lockedRoutes, bundle.lockedRoutes);
assert.deepEqual(
  Object.keys(bundle.domains.economy),
  ["lockedMarkets", "lockedDeals"],
  "economy slice 不精确"
);
assert.deepEqual(REGENERATION_CONSTRAINT_DOMAIN_KINDS.economy, ["economy-market", "trade-flow"]);

const cityReference = references.find(reference => reference.kind === "city");
const capturedCityName = bundle.lockedCities[0].name;
map.regenerationLocks = {version: 1, entries: []};
findById(map.settlements.cities, cityReference.id).name = `${capturedCityName}:changed-after-capture`;
assert.equal(bundle.lockedCities[0].name, capturedCityName, "捕获后修改地图基线污染了 bundle");
assert.deepEqual(bundle.ids("city"), [String(cityReference.id)], "捕获后修改锁仓污染了 bundle IDs");
assert.throws(
  () => bundle.assertDomain(map, "cities", "after"),
  error => error?.code === "regeneration_lock_conflict" && error?.details?.reason === "locked_snapshot_changed",
  "直接 assertDomain 未原样外抛锁冲突"
);
assert.throws(
  () => bundle.assertDomain("city", {map, phase: "after"}),
  error => error?.code === "regeneration_lock_conflict",
  "E4 assertDomain 调用形态未原样外抛锁冲突"
);

const compositeMap = generatePlaceholderMap({
  seed: "regeneration-constraint-bundle:composite",
  cellsTarget: 3000,
  heightmapTemplate: "continents"
});
const cities = active(compositeMap.settlements.cities);
const routes = active(compositeMap.settlements.routes);
assert(cities.length > 1 && routes.length > 1, "组合全锁固定图缺少城镇或道路");
compositeMap.regenerationLocks = {
  version: 1,
  entries: [
    ...cities.map(city => ({kind: "city", id: city.id ?? city.i})),
    ...routes.slice(0, -1).map(route => ({kind: "route", id: route.id ?? route.i}))
  ]
};
const partial = captureRegenerationConstraintBundle(compositeMap, {domains: ["cities-routes"]});
assert.equal(partial.isDomainFullyLocked("city"), true, "单域全锁未识别");
assert.equal(partial.isDomainFullyLocked("route"), false, "单域部分锁被误判为全锁");
assert.equal(partial.isDomainFullyLocked("cities-routes"), false, "组合域任一 kind 未全锁时被误跳过");

compositeMap.regenerationLocks.entries.push({
  kind: "route",
  id: routes.at(-1).id ?? routes.at(-1).i
});
const full = captureRegenerationConstraintBundle(compositeMap, {closure: ["cities-routes"]});
assert.equal(full.isDomainFullyLocked("cities-routes"), true, "组合域全部可写 kind 全锁后未识别");
const fullIds = full.ids("route");
compositeMap.regenerationLocks.entries = [];
assert.deepEqual(full.ids("route"), fullIds, "捕获后锁仓变化污染组合 bundle");

const fastWorldMap = generatePlaceholderMap({
  seed: "lock-compound-noop",
  cellsTarget: 2000,
  heightmapTemplate: "continents"
});
const fastWorldReferences = allReferences(fastWorldMap);
assert(fastWorldReferences.length > 10_000, `全锁 fast precheck 未达到万级样本：${fastWorldReferences.length}`);
fastWorldMap.regenerationLocks = {version: 1, entries: fastWorldReferences};
const fastWorldStore = fastWorldMap.regenerationLocks;
const fastWorldStartedAt = performance.now();
assert.equal(isRegenerationConstraintDomainFullyLocked(fastWorldMap, "world"), true, "15 类全锁 world 未被 fast precheck 识别");
const fastWorldMs = performance.now() - fastWorldStartedAt;
assert(fastWorldMs < 200, `15 类全锁 fast precheck 超过 200ms：${fastWorldMs.toFixed(1)}ms`);
assert.equal(fastWorldMap.regenerationLocks, fastWorldStore, "fast precheck 改写了锁仓 owner");
const removedFastReference = fastWorldMap.regenerationLocks.entries.pop();
assert(removedFastReference, "fast precheck 部分锁反例缺少可移除引用");
assert.equal(isRegenerationConstraintDomainFullyLocked(fastWorldMap, "world"), false, "缺少一个活动引用的 world 被误判为全锁");
fastWorldMap.regenerationLocks.entries.push(removedFastReference);

const appSource = readFileSync(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8");
const worldActionSource = appSource.slice(
  appSource.indexOf("async function applyOceanCurrentWorldRebuildViaAction"),
  appSource.indexOf("function normalizeClimateApiPatch")
);
assert.match(worldActionSource, /const worldFullyLocked = isRegenerationConstraintDomainFullyLocked\(map, "world"\)/u, "world action 未使用无快照全锁预检");
assert.match(worldActionSource, /const constraintBundle = worldFullyLocked \? null : captureRegenerationConstraintBundle\(map, \{closure: \["world"\]\}\)/u, "world action 全锁时仍捕获完整主线程 bundle");
assert.match(worldActionSource, /worldFullyLocked && output\?\.result\?\.executed !== false/u, "world fast precheck 与 Worker 执行矛盾时未在提交前拒绝");
assert.match(worldActionSource, /if \(!constraintBundle\) throw /u, "world 实际提交未强制持有完整 constraint bundle");

console.log(JSON.stringify({
  ok: true,
  capturedKinds: bundle.selectedKinds.length,
  immutable: true,
  exactSlices: ["states-provinces", "economy"],
  compositeFullLock: true,
  fastWorld: {locks: fastWorldReferences.length, durationMs: Number(fastWorldMs.toFixed(1)), partialRejected: true},
  conflict: "regeneration_lock_conflict"
}, null, 2));

function sampleReferences(value) {
  const states = active(value.politics.states, true);
  const regimentalState = states.find(state => active(state.military).length);
  const regiment = active(regimentalState?.military)[0];
  const left = states[0];
  const right = states[1];
  const samples = [
    ["state", active(value.politics.states, true)[0]],
    ["province", active(value.politics.provinces, true)[0]],
    ["city", active(value.settlements.cities)[0]],
    ["route", active(value.settlements.routes)[0]],
    ["river", active(value.rivers.rivers)[0]],
    ["marker", active(value.markers.markers)[0]],
    ["religion", active(value.society.religions, true)[0]],
    ["culture", active(value.society.cultures, true)[0]],
    ["zone", active(value.zones.zones)[0]],
    ["feature", active(value.pack.features)[0]],
    ["ocean-current", active(value.oceanCurrents.currents)[0]],
    ["economy-market", active(value.pack.markets, true)[0]],
    ["trade-flow", active(value.pack.deals)[0]]
  ];
  const references = samples.map(([kind, object]) => {
    assert(object, `固定图缺少 ${kind} 样本`);
    return {kind, id: object.id ?? object.i};
  });
  assert(left && right, "固定图缺少外交国家对");
  references.push({
    kind: "diplomacy-relation",
    id: `${Math.min(left.i, right.i)}:${Math.max(left.i, right.i)}`
  });
  assert(regimentalState && regiment, "固定图缺少军团");
  references.push({
    kind: "military",
    id: `${regimentalState.i}:${regiment.i}`
  });
  return REGENERATION_LOCK_KINDS.map(kind => references.find(reference => reference.kind === kind));
}

function active(rows, positive = false) {
  return (rows || []).filter(object => object && !object.removed && (!positive || Number(object.i ?? object.id) > 0));
}

function findById(rows, id) {
  return (rows || []).find(object => String(object?.id ?? object?.i) === String(id));
}

function allReferences(value) {
  const states = active(value.politics?.states, true);
  const references = [
    ...active(value.politics?.states, true).map(object => ({kind: "state", id: object.i})),
    ...active(value.politics?.provinces, true).map(object => ({kind: "province", id: object.i})),
    ...active(value.settlements?.cities).map(object => ({kind: "city", id: object.id ?? object.i})),
    ...active(value.settlements?.routes).map(object => ({kind: "route", id: object.id ?? object.i})),
    ...active(value.rivers?.rivers).map(object => ({kind: "river", id: object.id ?? object.i})),
    ...active(value.markers?.markers).map(object => ({kind: "marker", id: object.id ?? object.i})),
    ...active(value.society?.religions, true).map(object => ({kind: "religion", id: object.i})),
    ...active(value.society?.cultures, true).map(object => ({kind: "culture", id: object.i})),
    ...active(value.zones?.zones).map(object => ({kind: "zone", id: object.id ?? object.i})),
    ...active(value.pack?.features).map(object => ({kind: "feature", id: object.id ?? object.i})),
    ...active(value.oceanCurrents?.currents).map(object => ({kind: "ocean-current", id: object.id})),
    ...active(value.pack?.markets, true).map(object => ({kind: "economy-market", id: object.i})),
    ...active(value.pack?.deals).map(object => ({kind: "trade-flow", id: object.id ?? object.i}))
  ];
  for (let left = 0; left < states.length; left++) {
    for (let right = left + 1; right < states.length; right++) {
      references.push({kind: "diplomacy-relation", id: `${states[left].i}:${states[right].i}`});
    }
  }
  for (const state of states) {
    for (const regiment of active(state.military)) references.push({kind: "military", id: `${state.i}:${regiment.i}`});
  }
  return references;
}
