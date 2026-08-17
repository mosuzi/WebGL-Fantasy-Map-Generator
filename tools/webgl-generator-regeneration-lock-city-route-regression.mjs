#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {createGenerationSummary, generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {regenerateSettlementsWithinPolitics} from "../app/webgl-generator/src/generator/settlements.js";
import {createMapDocument, createMapFeatureGeoJson} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {
  assertLockedRegenerationSnapshots,
  captureLockedRegenerationObjects
} from "../app/webgl-generator/src/runtime/regeneration-lock-protection.js";
import {decodeWebfmgV3Document, encodeWebfmgV3Document} from "../app/webgl-generator/src/runtime/webfmg-v3-container.js";

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
  const lockedCity = activeCities(map).filter(city => !city.capital && !provinceAnchors.has(Number(city.burgId))).sort((left, right) => right.id - left.id)[0];
  const lockedRoute = activeRoutes(map).filter(route => route.packCells?.length >= 3).sort((left, right) => right.id - left.id)[0];
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
  assertStateCapitalMirrors(map);
  for (const [path, values] of [["settlements.cities", map.settlements.cities], ["pack.burgs", map.pack.burgs], ["pack.routes", map.pack.routes]]) {
    assertDenseArray(values, `${path} 不得因保留高编号锁定对象产生 hole`);
  }
  const summary = createGenerationSummary(
    map.options,
    map.grid,
    map.features,
    map.climate,
    map.society,
    map.politics,
    map.settlements,
    map.markers,
    map.pack,
    map.rivers,
    map.layers,
    map.military,
    map.zones,
    map.economy,
    map.diplomacy
  );
  assert(summary.settlements.sampleCities.every(city => Number.isInteger(city.id)), "生成摘要不得把显式 null 占位当作城镇读取");
  const featureGeoJson = createMapFeatureGeoJson(map, {layers: {city: true}});
  assert.equal(featureGeoJson.features.filter(feature => feature.properties?.layer === "city").length, activeCities(map).length, "GeoJSON 城镇导出不得读取显式 null 占位");
  const raw = encodeWebfmgV3Document(createMapDocument(map, map.options));
  const roundTrip = decodeWebfmgV3Document(raw).map;
  for (const [path, values] of [["settlements.cities", roundTrip.settlements.cities], ["pack.burgs", roundTrip.pack.burgs], ["pack.routes", roundTrip.pack.routes]]) {
    assertDenseArray(values, `${path} 紧凑保存往返后不得出现 hole`);
  }
  report.full = {
    lockedCity: lockedCity.id,
    lockedBurg: lockedCity.burgId,
    lockedRoute: lockedRoute.id,
    cities: activeCities(map).length,
    routes: activeRoutes(map).length,
    compactBytes: raw.byteLength
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

function assertDenseArray(values, message) {
  for (let index = 0; index < values.length; index++) assert(Object.hasOwn(values, index), `${message}：index ${index}`);
}

function assertStateCapitalMirrors(map) {
  const cities = activeCities(map);
  for (const state of activeStates(map)) {
    const stateCities = cities.filter(city => Number(city.state) === Number(state.i));
    const capitals = stateCities.filter(city => city.capital);
    if (!stateCities.length) {
      assert.equal(Number(state.capital || 0), 0, `空国家 ${state.i} 不得保留悬空首都`);
      assert.equal(Number(map.pack.states?.[state.i]?.capital || 0), 0, `空国家 ${state.i} 的 pack 镜像不得保留悬空首都`);
      continue;
    }
    assert.equal(capitals.length, 1, `国家 ${state.i} 必须恰好有一个首都`);
    const capital = capitals[0];
    assert.equal(Number(state.capital), Number(capital.burgId), `国家 ${state.i} 的 politics 首都镜像失配`);
    assert.equal(Number(map.pack.states?.[state.i]?.capital), Number(capital.burgId), `国家 ${state.i} 的 pack 首都镜像失配`);
    assert.equal(Boolean(map.pack.burgs?.[capital.burgId]?.capital), true, `国家 ${state.i} 的 burg 首都标记失配`);
  }
}
