#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {regenerateSettlementsWithinPolitics} from "../app/webgl-generator/src/generator/settlements.js";
import {
  assertLockedRegenerationSnapshots,
  captureLockedRegenerationObjects
} from "../app/webgl-generator/src/runtime/regeneration-lock-protection.js";

const options = {
  seed: "regeneration-lock-city-route",
  cellsTarget: 6000,
  graphWidth: 1200,
  graphHeight: 760,
  heightmapTemplate: "continents"
};
const report = {ok: true, full: {}, scoped: {}, conflict: {}, contract: {}};

testFullRegeneration();
testLegacyRouteMirrorBackfill();
testScopedRegeneration();
testConflict();
await testFormalEntryContract();

console.log(JSON.stringify(report, null, 2));

function testFullRegeneration() {
  const map = generatePlaceholderMap(options);
  const provinceAnchors = new Set(activeProvinces(map).map(province => Number(province.burg)));
  const lockedCity = activeCities(map).find(city => !city.capital && !provinceAnchors.has(Number(city.burgId)));
  const lockedRoute = activeRoutes(map).find(route => route.packCells?.length >= 3);
  assert(lockedCity && lockedRoute, "固定地图缺少可锁定的普通城镇或道路");
  map.regenerationLocks = {
    version: 1,
    entries: [
      {kind: "city", id: lockedCity.id},
      {kind: "route", id: lockedRoute.id}
    ]
  };
  const cityCapture = captureLockedRegenerationObjects(map, "city");
  const routeCapture = captureLockedRegenerationObjects(map, "route");
  const unlockedBefore = JSON.stringify(activeCities(map).filter(city => city.id !== lockedCity.id));

  regenerateSettlementsWithinPolitics(map.grid, map.features, map.politics, map.settlements, map.pack, {
    ...map.options,
    namebases: map.namebases,
    settlementRegenerationSalt: 17,
    routeRegenerationSalt: 17,
    lockedCities: cityCapture.snapshots,
    lockedRoutes: routeCapture.snapshots
  });

  assertLockedRegenerationSnapshots(map, cityCapture);
  assertLockedRegenerationSnapshots(map, routeCapture);
  assert.notEqual(JSON.stringify(activeCities(map).filter(city => city.id !== lockedCity.id)), unlockedBefore, "未锁城镇必须继续发生变化");
  assert.equal(new Set(activeCities(map).map(city => city.id)).size, activeCities(map).length, "新城镇不得复用锁定 city ID");
  assert.equal(new Set(activeCities(map).map(city => city.burgId)).size, activeCities(map).length, "新城镇不得复用锁定 burg ID");
  report.full = {
    lockedCity: lockedCity.id,
    lockedBurg: lockedCity.burgId,
    lockedRoute: lockedRoute.id,
    cities: activeCities(map).length,
    routes: activeRoutes(map).length
  };
}

function testLegacyRouteMirrorBackfill() {
  const map = generatePlaceholderMap({...options, seed: `${options.seed}:legacy-route-mirror`});
  const route = activeRoutes(map).find(item => item.packCells?.length >= 3);
  assert(route, "旧图镜像用例缺少道路");
  const mirror = map.pack.routes[route.id];
  delete mirror.from;
  delete mirror.to;
  delete mirror.fromProvincial;
  delete mirror.toProvincial;
  delete mirror.administrativePriority;
  mirror.feature = Number(route.feature || 0) + 100;
  map.regenerationLocks = {version: 1, entries: [{kind: "route", id: route.id}]};
  const capture = captureLockedRegenerationObjects(map, "route");
  const routeBefore = clone(route);

  regenerateSettlementsWithinPolitics(map.grid, map.features, map.politics, map.settlements, map.pack, {
    ...map.options,
    namebases: map.namebases,
    settlementRegenerationSalt: 19,
    routeRegenerationSalt: 19,
    lockedRoutes: capture.snapshots
  });

  assertLockedRegenerationSnapshots(map, capture);
  assert.deepEqual(activeRoutes(map).find(item => item.id === route.id), routeBefore, "旧图锁路对象不得因镜像字段补齐而改变");
  report.legacyMirror = {lockedRoute: route.id, backfilled: true};
}

function testScopedRegeneration() {
  const map = generatePlaceholderMap({...options, seed: `${options.seed}:scoped`});
  const provinceAnchors = new Set(activeProvinces(map).map(province => Number(province.burg)));
  const target = activeStates(map).find(state =>
    activeCities(map).some(city => Number(city.state) === Number(state.i) && !city.capital && !provinceAnchors.has(Number(city.burgId)))
  );
  assert(target, "固定地图缺少可局部重生成的国家");
  const scope = {kind: "state", id: Number(target.i)};
  const candidates = activeCities(map).filter(city => cityInScope(map, city, scope) && !city.capital && !provinceAnchors.has(Number(city.burgId)));
  const lockedCity = candidates[0];
  assert(lockedCity && candidates.length > 1, "目标国家缺少锁定与未锁对照城镇");
  map.regenerationLocks = {version: 1, entries: [{kind: "city", id: lockedCity.id}]};
  const capture = captureLockedRegenerationObjects(map, "city");
  const outsideBefore = activeCities(map).filter(city => !cityInScope(map, city, scope)).map(clone);
  const unlockedBefore = candidates.slice(1).map(clone);

  regenerateSettlementsWithinPolitics(map.grid, map.features, map.politics, map.settlements, map.pack, {
    ...map.options,
    namebases: map.namebases,
    settlementRegenerationSalt: 23,
    routeRegenerationSalt: 23,
    settlementScope: scope,
    lockedCities: capture.snapshots
  });

  assertLockedRegenerationSnapshots(map, capture);
  assert.deepEqual(activeCities(map).filter(city => !cityInScope(map, city, scope)), outsideBefore, "局部重生成改写了范围外城镇");
  assert(
    unlockedBefore.some(before => JSON.stringify(map.settlements.cities[before.id]) !== JSON.stringify(before)),
    "范围内未锁城镇必须继续发生变化"
  );
  report.scoped = {stateId: scope.id, lockedCity: lockedCity.id, outside: outsideBefore.length, unlocked: unlockedBefore.length};
}

function testConflict() {
  const map = generatePlaceholderMap({...options, seed: `${options.seed}:conflict`});
  const route = activeRoutes(map).find(item => item.packCells?.length >= 3);
  assert(route, "冲突地图缺少道路");
  const duplicate = {...clone(route), id: Math.max(...activeRoutes(map).map(item => item.id)) + 100};
  assert.throws(
    () => regenerateSettlementsWithinPolitics(map.grid, map.features, map.politics, map.settlements, map.pack, {
      ...map.options,
      settlementRegenerationSalt: 29,
      routeRegenerationSalt: 29,
      lockedRoutes: [clone(route), duplicate]
    }),
    error => error?.code === "regeneration_lock_conflict" && error?.details?.reason === "duplicate-edge"
  );
  report.conflict = {code: "regeneration_lock_conflict", reason: "duplicate-edge"};
}

async function testFormalEntryContract() {
  const [appSource, packageSource] = await Promise.all([
    readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8")
  ]);
  assert.match(appSource, /function regenerateRoutes[\s\S]*allRegenerationObjectsLocked\(map, OBJECT_KIND\.ROUTE[\s\S]*captureLockedRegenerationObjects\(map, OBJECT_KIND\.ROUTE\)[\s\S]*lockedRoutes: routeLocks\.snapshots[\s\S]*assertLockedRegenerationSnapshots\(map, routeLocks\)/);
  assert.match(appSource, /function regenerateCities[\s\S]*allRegenerationObjectsLocked\(map, OBJECT_KIND\.CITY[\s\S]*captureLockedRegenerationObjects\(map, OBJECT_KIND\.CITY\)[\s\S]*lockedCities: cityLocks\.snapshots,[\s\S]*lockedRoutes: routeLocks\.snapshots[\s\S]*assertLockedRegenerationSnapshots\(map, cityLocks\)/);
  assert.match(appSource, /function regenerateMapAttributeViaApi[\s\S]*executeMapSnapshotTransaction/);
  assert.match(packageSource, /regress:regeneration-lock-route-generator/);
  report.contract = {formalEntry: "generate.regenerate", transaction: "executeMapSnapshotTransaction", routeGeneratorGate: true};
}

function activeStates(map) {
  return (map.politics?.states || []).filter(state => state?.i && !state.removed);
}

function activeProvinces(map) {
  return (map.politics?.provinces || []).filter(province => province?.i && !province.removed);
}

function activeCities(map) {
  return (map.settlements?.cities || []).filter(city => city && !city.removed);
}

function activeRoutes(map) {
  return (map.settlements?.routes || []).filter(Boolean);
}

function cityInScope(map, city, scope) {
  if (scope.kind === "state") return Number(city.state) === scope.id;
  return Number(city.province) === scope.id || Number(map.pack.cells.province?.[city.packCell]) === scope.id;
}

function clone(value) {
  return structuredClone(value);
}
