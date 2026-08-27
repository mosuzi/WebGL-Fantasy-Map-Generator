#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createServer} from "vite";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {captureRegenerationConstraintBundle, createRegenerationPostMergeSession} from "../app/webgl-generator/src/runtime/regeneration-constraint-bundle.js";
import {createRegenerationLockPriorityBundle} from "../app/webgl-generator/src/runtime/regeneration-lock-priority.js";
import {captureLockedRegenerationObjects} from "../app/webgl-generator/src/runtime/regeneration-lock-protection.js";
import {REGENERATION_LOCK_KINDS} from "../app/webgl-generator/src/runtime/regeneration-locks.js";
import {REGENERATION_WORKER_KINDS, getRegenerationPatchPolicy, runRegenerationWorkerTask, validateOceanCurrentRegenerationOutput} from "../app/webgl-generator/src/runtime/regeneration-worker-task.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vite = await createServer({configFile: false, root: path.join(repoRoot, "app/webgl-generator"), server: {middlewareMode: true}, appType: "custom", logLevel: "error"});
const {validateFeaturesNetworksResourcesWorkerOutput} = await vite.ssrLoadModule("/src/domains/features/worker-runtime.ts");
const {validateSettlementZoneWorkerOutput} = await vite.ssrLoadModule("/src/domains/settlements/worker-runtime.ts");
const {validateSocietyPoliticsWorkerOutput} = await vite.ssrLoadModule("/src/domains/society-politics/worker-runtime.ts");
const {validateEconomyDiplomacyMilitaryWorkerOutput} = await vite.ssrLoadModule("/src/domains/economy/worker-runtime.ts");

const base = generatePlaceholderMap({
  seed: "task-365-regeneration-tolerance-model",
  cellsTarget: 3000,
  heightmapTemplate: "continents"
});

const references = Object.fromEntries(REGENERATION_LOCK_KINDS.map(kind => [kind, pickReference(base, kind)]));
assert.deepEqual(Object.entries(references).filter(([, reference]) => !reference), [], "正常地图缺少锁类型样本");

const captureResults = [];
for (const [kind, reference] of Object.entries(references)) {
  const map = structuredClone(base);
  corruptLockObject(map, reference);
  map.regenerationLocks = {version: 1, entries: [reference]};
  const capture = captureLockedRegenerationObjects(map, kind);
  assert.equal(capture.snapshots.length, 1, `内部错误的 ${kind} 锁没有被最小捕获`);
  assert.equal(capture.staleLockReferences.length, 0, `${kind} 锁被误判成陈旧锁`);
  captureResults.push({kind, captured: capture.snapshots.length});
}

const staleMap = structuredClone(base);
staleMap.regenerationLocks = {version: 1, entries: [{kind: "city", id: 999999}]};
const staleCapture = captureLockedRegenerationObjects(staleMap, "city");
assert.equal(staleCapture.entries.length, 0, "不存在对象的陈旧锁仍进入生成约束");
assert.deepEqual(staleCapture.staleLockReferences, [{kind: "city", id: 999999}], "陈旧锁诊断不精确");

const closureMap = structuredClone(base);
closureMap.regenerationLocks = {version: 1, entries: [references.city]};
const explicitBundle = captureRegenerationConstraintBundle(closureMap, {closure: ["world"]});
const priorityBundle = createRegenerationLockPriorityBundle(closureMap, explicitBundle);
assert.equal(priorityBundle.lockedCities.length, 1, "显式城镇锁丢失");
for (const key of ["lockedStates", "lockedProvinces", "lockedRoutes", "lockedFeatures", "lockedMarkers", "lockedDiplomacyRelations", "lockedMilitaryRegiments"]) {
  assert.equal(priorityBundle[key].length, 0, `显式城镇锁仍扩张出 ${key} 支撑闭包`);
}
const postMergeSession = createRegenerationPostMergeSession(closureMap, {closure: ["world"]});
assert.equal(postMergeSession.preserved.lockedCities.length, 1, "后置合并会话没有捕获显式锁");
for (const kind of REGENERATION_LOCK_KINDS) assert.equal(postMergeSession.generation.snapshots(kind).length, 0, `${kind} 锁泄漏进生成输入`);
postMergeSession.close();

const targetResults = [];
for (const kind of REGENERATION_WORKER_KINDS) {
  const map = structuredClone(base);
  corruptTarget(map, kind);
  const sourceMap = structuredClone(map);
  const binding = operationBinding(`corrupt-target:${kind}`);
  const output = await runRegenerationWorkerTask({map, kind, options: {scope: "all"}}, {binding, checkpoint() {}, report() {}});
  validateWorkerOutput(kind, sourceMap, binding, output);
  const result = output.result;
  assert.equal(result.executed, true, `${kind} 没有从损坏旧目标空白重建`);
  assertBasicHardGates(map, kind);
  targetResults.push({kind, executed: result.executed, count: domainCount(map, kind)});
}

const badLockedCityMap = structuredClone(base);
const lockedCity = badLockedCityMap.settlements.cities.find(Boolean);
lockedCity.cell = 999999;
lockedCity.packCell = 999999;
lockedCity.x = Number.NaN;
badLockedCityMap.regenerationLocks = {version: 1, entries: [{kind: "city", id: lockedCity.id}]};
const lockedCityBefore = structuredClone(lockedCity);
const lockedCitySource = structuredClone(badLockedCityMap);
const lockedCityBinding = operationBinding("corrupt-lock:city:routes");
const lockedCityOutput = await runRegenerationWorkerTask({map: badLockedCityMap, kind: "routes", options: {scope: "all"}}, {binding: lockedCityBinding, checkpoint() {}, report() {}});
validateWorkerOutput("routes", lockedCitySource, lockedCityBinding, lockedCityOutput);
const lockedCityResult = lockedCityOutput.result;
const lockedCityAfter = badLockedCityMap.settlements.cities.find(city => Number(city?.id) === Number(lockedCity.id));
assert.equal(lockedCityResult.executed, true, "内部错误的锁定城镇仍阻断道路重生成");
assert.deepEqual(lockedCityAfter, lockedCityBefore, "内部错误的锁定城镇没有后置原样并回");
assert(badLockedCityMap.settlements.routes.length > 0, "忽略错误锁后没有生成道路");

await vite.close();

console.log(JSON.stringify({
  ok: true,
  minimalLockCapture: captureResults,
  staleLockReferences: staleCapture.staleLockReferences,
  supportClosure: {
    explicitCities: priorityBundle.lockedCities.length,
    expandedSlices: 0,
    generationVisibleLocks: 0
  },
  corruptedTargets: targetResults,
  lockedBadUpstream: {
    kind: "city",
    routeRegenerationExecuted: lockedCityResult.executed,
    beforeImagePreserved: true,
    routes: badLockedCityMap.settlements.routes.length
  }
}, null, 2));

function corruptTarget(map, kind) {
  if (kind === "features") map.pack.features.find(feature => feature?.i).shoreline = "broken";
  else if (kind === "routes") Object.assign(map.settlements.routes.find(Boolean), {packCells: [999999], cells: [999999], points: [[Number.NaN, 0]]});
  else if (kind === "rivers") map.rivers.rivers.find(Boolean).cells = [999999];
  else if (kind === "cities") Object.assign(map.settlements.cities.find(Boolean), {cell: 999999, packCell: 999999});
  else if (kind === "states") Object.assign(map.politics.states.find(state => state?.i), {capital: 999999, center: 999999});
  else if (kind === "provinces") Object.assign(map.politics.provinces.find(province => province?.i), {state: 999999, center: 999999});
  else if (kind === "markers") {
    const source = map.markers.markers.find(Boolean);
    map.markers.markers.push({...structuredClone(source), id: 999999, i: 999999, category: "resource", packCell: 999999});
  }
  else if (kind === "diplomacy") map.pack.states.find(state => state?.i).diplomacy = [null, "Broken"];
  else if (kind === "religions") Object.assign(map.society.religions.find(religion => religion?.i), {center: 999999, parent: 999999});
  else if (kind === "military") {
    const regiment = map.pack.states.find(state => state?.military?.length)?.military?.[0];
    if (regiment) Object.assign(regiment, {cell: 999999, x: Number.NaN});
  } else if (kind === "zones") {
    const zone = map.zones.zones.find(Boolean);
    if (zone) Object.assign(zone, {cells: [999999], attacker: 999999});
  }
}

function operationBinding(label) {
  return Object.freeze({
    mapIdentity: "task-365-tolerance-model",
    mapRevision: 1,
    topologyRevision: 1,
    generationToken: 1,
    lockFingerprint: label,
    operationId: 1,
    operationName: `regeneration.compute:${label}`
  });
}

function validateWorkerOutput(kind, sourceMap, binding, output) {
  const input = {kind, sourceMap, binding, output, policy: getRegenerationPatchPolicy(kind)};
  if (kind === "ocean-current") return validateOceanCurrentRegenerationOutput(input);
  if (["features", "routes", "rivers", "markers"].includes(kind)) return validateFeaturesNetworksResourcesWorkerOutput(input);
  if (["cities", "zones"].includes(kind)) return validateSettlementZoneWorkerOutput(input);
  if (["states", "provinces", "religions"].includes(kind)) return validateSocietyPoliticsWorkerOutput(input);
  return validateEconomyDiplomacyMilitaryWorkerOutput(input);
}

function corruptLockObject(map, reference) {
  const object = lockObject(map, reference);
  if (reference.kind === "state") Object.assign(object, {capital: 999999, center: 999999});
  else if (reference.kind === "province") Object.assign(object, {state: 999999, burg: 999999, center: 999999});
  else if (reference.kind === "city") Object.assign(object, {cell: 999999, packCell: 999999, x: Number.NaN});
  else if (reference.kind === "route") Object.assign(object, {packCells: [999999], cells: [], points: []});
  else if (reference.kind === "river") Object.assign(object, {cells: [999999], sourceFeatureId: 999999});
  else if (reference.kind === "marker") object.packCell = 999999;
  else if (reference.kind === "religion" || reference.kind === "culture") Object.assign(object, {center: 999999, parent: 999999, origins: "broken"});
  else if (reference.kind === "zone") Object.assign(object, {cells: [999999], attacker: 999999});
  else if (reference.kind === "feature") Object.assign(object, {land: !object.land, shoreline: "broken"});
  else if (reference.kind === "ocean-current") Object.assign(object, {basinFeatureId: 999999, path: {segments: []}});
  else if (reference.kind === "economy-market") Object.assign(object, {centerBurgId: 999999, cell: 999999});
  else if (reference.kind === "trade-flow") Object.assign(object, {good: 999999, seller: 999999, path: [999999]});
  else if (reference.kind === "diplomacy-relation") {
    const [left, right] = String(reference.id).split(":").map(Number);
    map.pack.states[left].diplomacy[right] = "Broken";
    map.pack.states[right].diplomacy[left] = undefined;
  } else if (reference.kind === "military") Object.assign(object, {cell: 999999, x: Number.NaN});
}

function lockObject(map, reference) {
  const id = Number(reference.id);
  if (reference.kind === "state") return map.politics.states[id];
  if (reference.kind === "province") return map.politics.provinces[id];
  if (reference.kind === "city") return map.settlements.cities.find(item => Number(item?.id) === id);
  if (reference.kind === "route") return map.settlements.routes.find(item => Number(item?.id ?? item?.i) === id);
  if (reference.kind === "river") return map.rivers.rivers.find(item => Number(item?.id ?? item?.i) === id);
  if (reference.kind === "marker") return map.markers.markers.find(item => Number(item?.id ?? item?.i) === id);
  if (reference.kind === "religion") return map.society.religions[id];
  if (reference.kind === "culture") return map.society.cultures[id];
  if (reference.kind === "zone") return map.zones.zones.find(item => Number(item?.id ?? item?.i) === id);
  if (reference.kind === "feature") return map.pack.features[id];
  if (reference.kind === "ocean-current") return map.oceanCurrents.currents.find(item => String(item?.id) === String(reference.id));
  if (reference.kind === "economy-market") return map.pack.markets[id];
  if (reference.kind === "trade-flow") return map.pack.deals.find(item => Number(item?.id ?? item?.i) === id);
  if (reference.kind === "military") {
    const [stateId, regimentId] = String(reference.id).split(":").map(Number);
    return map.pack.states[stateId].military.find(item => Number(item?.i) === regimentId);
  }
  return null;
}

function assertBasicHardGates(map, kind) {
  if (["cities", "states", "provinces"].includes(kind)) {
    for (const city of map.settlements.cities.filter(Boolean)) {
      assert(Number(map.pack.cells.h?.[city.packCell]) >= 20, `新城镇 #${city.id} 落在水域`);
      assert(Number.isFinite(Number(city.x)) && Number.isFinite(Number(city.y)), `新城镇 #${city.id} 坐标无效`);
    }
  }
  if (["routes", "cities", "states", "provinces"].includes(kind)) {
    for (const route of map.settlements.routes.filter(Boolean)) {
      assert(Array.isArray(route.packCells) && route.packCells.length >= 2, `新路线 #${route.id} 路径为空`);
      for (let index = 0; index < route.packCells.length; index++) {
        const cell = Number(route.packCells[index]);
        assert(Number.isInteger(cell) && cell >= 0 && cell < map.pack.cells.i.length, `新路线 #${route.id} cell 越界`);
        if (index) assert(map.pack.cells.c[route.packCells[index - 1]].includes(cell), `新路线 #${route.id} 路径不相邻`);
        const land = Number(map.pack.cells.h[cell]) >= 20;
        if (route.type !== "searoute") assert(land, `${kind} 新陆路 #${route.id} 穿越水域`);
      }
    }
  }
  if (kind === "rivers") for (const river of map.rivers.rivers.filter(Boolean)) {
    assert(Array.isArray(river.cells) && river.cells.length >= 2, `新河流 #${river.id} 路径为空`);
    for (let index = 0; index < river.cells.length - 1; index++) assert(Number(map.pack.cells.h[river.cells[index]]) >= 20, `新河流 #${river.id} 在海洋内部延伸`);
  }
}

function domainCount(map, kind) {
  if (kind === "features") return map.pack.features.filter(Boolean).length;
  if (kind === "routes") return map.settlements.routes.filter(Boolean).length;
  if (kind === "rivers") return map.rivers.rivers.filter(Boolean).length;
  if (kind === "cities") return map.settlements.cities.filter(Boolean).length;
  if (kind === "states") return map.politics.states.filter(state => state?.i && !state.removed).length;
  if (kind === "provinces") return map.politics.provinces.filter(province => province?.i && !province.removed).length;
  if (kind === "markers") return map.markers.markers.filter(marker => marker?.category === "resource").length;
  if (kind === "diplomacy") return Number(map.diplomacy?.metadata?.pairs) || 0;
  if (kind === "religions") return map.society.religions.filter(religion => religion?.i && !religion.removed).length;
  if (kind === "military") return map.pack.states.flatMap(state => state?.military || []).length;
  if (kind === "zones") return map.zones.zones.filter(Boolean).length;
  return 0;
}

function pickReference(map, kind) {
  const active = rows => (rows || []).filter(item => item && !item.removed);
  const positive = rows => active(rows).find(item => Number(item.i ?? item.id) > 0);
  if (kind === "state") return numeric(kind, positive(map.politics?.states));
  if (kind === "province") return numeric(kind, positive(map.politics?.provinces));
  if (kind === "city") return numeric(kind, active(map.settlements?.cities)[0]);
  if (kind === "route") return numeric(kind, active(map.settlements?.routes)[0]);
  if (kind === "river") return numeric(kind, active(map.rivers?.rivers)[0]);
  if (kind === "marker") return numeric(kind, active(map.markers?.markers).find(marker => marker.category === "resource") || active(map.markers?.markers)[0]);
  if (kind === "religion") return numeric(kind, positive(map.society?.religions));
  if (kind === "culture") return numeric(kind, positive(map.society?.cultures));
  if (kind === "zone") return numeric(kind, active(map.zones?.zones)[0]);
  if (kind === "feature") return numeric(kind, positive(map.pack?.features));
  if (kind === "ocean-current") return {kind, id: String(active(map.oceanCurrents?.currents)[0].id)};
  if (kind === "economy-market") return numeric(kind, positive(map.pack?.markets));
  if (kind === "trade-flow") return numeric(kind, active(map.pack?.deals)[0]);
  if (kind === "diplomacy-relation") {
    const states = active(map.pack?.states).filter(state => Number(state.i) > 0);
    return {kind, id: `${Math.min(states[0].i, states[1].i)}:${Math.max(states[0].i, states[1].i)}`};
  }
  if (kind === "military") {
    const state = active(map.pack?.states).find(item => item.military?.length);
    return {kind, id: `${state.i}:${state.military[0].i}`};
  }
  return null;
}

function numeric(kind, object) {
  const id = Number(object?.id ?? object?.i);
  return Number.isInteger(id) ? {kind, id} : null;
}
