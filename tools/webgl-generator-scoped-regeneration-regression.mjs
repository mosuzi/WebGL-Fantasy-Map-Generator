#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {regenerateSettlementsWithinPolitics} from "../app/webgl-generator/src/generator/settlements.js";
import {regenerateProvincesForStates} from "../app/webgl-generator/src/runtime/state-topology-commands.js";

const options = {
  seed: "scoped-regeneration-regression",
  cellsTarget: 6000,
  graphWidth: 1200,
  graphHeight: 760,
  heightmapTemplate: "continents"
};
const report = {ok: true, provinces: {}, citiesByState: {}, citiesByProvince: {}};

testProvinceScope();
testCityScope("state");
testCityScope("province");
await testUiAndApiContract();

console.log(JSON.stringify(report, null, 2));

function testProvinceScope() {
  const map = generatePlaceholderMap(options);
  const state = activeStates(map).find(item => activeCities(map).some(city => Number(city.state) === Number(item.i)));
  assert(state, "固定样本缺少可局部重设省份的国家");
  const stateId = Number(state.i);
  const outsideBefore = activeProvinces(map)
    .filter(province => Number(province.state) !== stateId)
    .map(provinceSnapshot);
  const outsideCellsBefore = Array.from(map.pack.cells.province, (provinceId, cell) => Number(map.pack.cells.state[cell]) === stateId ? null : Number(provinceId));
  const oldProvinceIds = activeProvinces(map).filter(province => Number(province.state) === stateId).map(province => Number(province.i));
  const riversRef = map.rivers.rivers;
  const riverItemRefs = [...riversRef];
  const riversBefore = JSON.stringify(riversRef);
  const routesRef = map.pack.routes;
  const routeItemRefs = [...routesRef];
  const routesBefore = JSON.stringify(routesRef);

  const result = regenerateProvincesForStates(map, [stateId]);
  assert(result.provinceIds.length > 0, "局部重设没有生成新省份");
  assert(result.provinceIds.every(id => !oldProvinceIds.includes(id)), "局部重设复用了应冻结的旧省份编号");
  assert(oldProvinceIds.every(id => map.politics.provinces[id]?.removed), "目标国家旧省份没有全部进入墓碑状态");
  assert.deepEqual(
    activeProvinces(map).filter(province => Number(province.state) !== stateId).map(provinceSnapshot),
    outsideBefore,
    "局部重设省份改写了目标国家外的省份记录"
  );
  assert.deepEqual(
    Array.from(map.pack.cells.province, (provinceId, cell) => Number(map.pack.cells.state[cell]) === stateId ? null : Number(provinceId)),
    outsideCellsBefore,
    "局部重设省份改写了目标国家外的单元格归属"
  );
  assert(result.riverBoundaries?.model?.candidates > 0, "局部重设没有返回逐河结构化诊断");
  assert.equal(result.riverBoundaries.model.rivers.length, result.riverBoundaries.model.candidates);
  assert.equal(map.politics.metadata.riverBoundaries.candidates, result.riverBoundaries.model.candidates);
  assert.equal(Object.hasOwn(map.politics.metadata.riverBoundaries, "rivers"), false, "持久 metadata 不得重复逐河大数组");
  assert.equal(map.rivers.rivers, riversRef, "局部重设替换了 canonical 河流数组");
  assert.deepEqual(map.rivers.rivers, riverItemRefs, "局部重设替换了 canonical 河流对象");
  assert.equal(JSON.stringify(map.rivers.rivers), riversBefore, "局部重设改写了 canonical 河网");
  assert.equal(map.pack.routes, routesRef, "局部重设替换了道路数组");
  assert.deepEqual(map.pack.routes, routeItemRefs, "局部重设替换了道路对象");
  assert.equal(JSON.stringify(map.pack.routes), routesBefore, "局部重设改写了道路数据");

  const repeatedMap = generatePlaceholderMap(options);
  const repeated = regenerateProvincesForStates(repeatedMap, [stateId]);
  assert.equal(repeated.riverBoundaries.model.checksum, result.riverBoundaries.model.checksum, "同 seed 河障 checksum 不确定");
  assert.deepEqual(Array.from(repeatedMap.pack.cells.province), Array.from(map.pack.cells.province), "同 seed 局部重分省结果不确定");
  report.provinces = {
    stateId,
    oldProvinceIds,
    newProvinceIds: result.provinceIds,
    riverBoundaries: {
      candidates: result.riverBoundaries.model.candidates,
      strong: result.riverBoundaries.model.strong,
      checksum: result.riverBoundaries.model.checksum,
      adoptionRate: result.riverBoundaries.provinces.adoptionRate
    }
  };
}

function testCityScope(kind) {
  const map = generatePlaceholderMap({...options, seed: `${options.seed}:${kind}`});
  const provinceAnchors = new Set(activeProvinces(map).map(province => Number(province.burg)));
  const candidates = kind === "state" ? activeStates(map) : activeProvinces(map);
  const target = candidates.find(item => {
    const id = Number(item.i);
    return activeCities(map).some(city => cityInScope(map, city, {kind, id}) && !city.capital && !provinceAnchors.has(Number(city.burgId)));
  });
  assert(target, `固定样本缺少可按${kind === "state" ? "国家" : "省份"}重设的普通城镇`);
  const scope = {kind, id: Number(target.i)};
  const outsideBefore = activeCities(map).filter(city => !cityInScope(map, city, scope)).map(citySnapshot);
  const anchorBefore = activeCities(map)
    .filter(city => cityInScope(map, city, scope) && (city.capital || provinceAnchors.has(Number(city.burgId))))
    .map(citySnapshot);
  const replaceableBefore = activeCities(map)
    .filter(city => cityInScope(map, city, scope) && !city.capital && !provinceAnchors.has(Number(city.burgId)))
    .map(citySnapshot);

  regenerateSettlementsWithinPolitics(map.grid, map.features, map.politics, map.settlements, map.pack, {
    ...map.options,
    namebases: map.namebases,
    settlementRegenerationSalt: 1,
    routeRegenerationSalt: 1,
    settlementScope: scope
  });

  assert.deepEqual(activeCities(map).filter(city => !cityInScope(map, city, scope)).map(citySnapshot), outsideBefore, "局部重设城镇改写了目标范围外城镇");
  assert.deepEqual(
    activeCities(map).filter(city => cityInScope(map, city, scope) && (city.capital || provinceAnchors.has(Number(city.burgId)))).map(citySnapshot),
    anchorBefore,
    "局部重设城镇改写了目标范围内首都或省会锚点"
  );
  const replaceableAfter = replaceableBefore.map(before => citySnapshot(map.settlements.cities[before.id]));
  assert.deepEqual(replaceableAfter.map(city => city.id), replaceableBefore.map(city => city.id), "局部重设城镇没有复用原 city 编号");
  assert.deepEqual(replaceableAfter.map(city => city.burgId), replaceableBefore.map(city => city.burgId), "局部重设城镇没有复用原 burg 编号");
  assert(replaceableAfter.some((city, index) => city.packCell !== replaceableBefore[index].packCell || city.name !== replaceableBefore[index].name), "局部重设没有产生可观察的城镇变化");

  report[kind === "state" ? "citiesByState" : "citiesByProvince"] = {
    scope,
    replaced: replaceableAfter.length,
    preservedOutside: outsideBefore.length,
    preservedAnchors: anchorBefore.length
  };
}

async function testUiAndApiContract() {
  const [controlSource, appSource] = await Promise.all([
    readFile(new URL("../app/webgl-generator/src/ui/vue/components/ControlPanel.vue", import.meta.url), "utf8"),
    readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8")
  ]);
  assert.match(controlSource, /label="重设范围"[\s\S]*label="目标国家"[\s\S]*label="目标省份"/, "控制面板缺少局部重设范围与目标选择器");
  assert.match(controlSource, /data-regeneration-scope[\s\S]*data-regeneration-state-id[\s\S]*data-regeneration-province-id/, "重设按钮没有携带范围参数");
  assert.match(controlSource, /@click="requestRegeneration"[\s\S]*webglGeneratorApi\?\.generate\?\.regenerate[\s\S]*confirm: true,[\s\S]*stateId:[\s\S]*provinceId:/, "控制面板没有通过公开 API 把局部范围传给运行时");
  assert.match(appSource, /normalizeRegenerationScope\(state\.map, targetKind, options\)/, "公开 API 没有校验局部重设范围");
  assert.match(appSource, /regenerateProvincesForStates\(map, \[scope\.id\]\)/, "省份重设没有走国家范围核心路径");
  assert.match(appSource, /settlementScope,[\s\S]{0,300}\}\);/, "城镇重设没有传递国家或省份范围");
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

function cityInScope(map, city, scope) {
  if (scope.kind === "state") return Number(city.state) === scope.id;
  return Number(city.province) === scope.id || Number(map.pack.cells.province?.[city.packCell]) === scope.id;
}

function provinceSnapshot(province) {
  return {
    id: Number(province.i),
    state: Number(province.state),
    center: Number(province.center),
    burg: Number(province.burg),
    name: province.name,
    fullName: province.fullName,
    cells: Number(province.cells)
  };
}

function citySnapshot(city) {
  return {
    id: Number(city.id),
    burgId: Number(city.burgId),
    name: city.name,
    packCell: Number(city.packCell),
    cell: Number(city.cell),
    x: Number(city.x),
    y: Number(city.y),
    state: Number(city.state),
    province: Number(city.province),
    capital: Boolean(city.capital),
    provincial: Boolean(city.provincial),
    population: Number(city.population)
  };
}
