#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {isActiveEnemyPair, reconcileWarDerivedData} from "../app/webgl-generator/src/generator/war-consistency.js";
import {createMapFeatureGeoJson} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {createSetDiplomacyRelationCommand} from "../app/webgl-generator/src/runtime/diplomacy-edit-commands.js";

for (const relation of ["Neutral", "Friendly", "Ally", "Vassal", "Suzerain"]) {
  const map = createFixtureMap();
  const command = createSetDiplomacyRelationCommand(1, 2, relation, {reason: "一致性回归"});
  command.apply({map});
  assert.equal(map.pack.states[1].campaigns.length, 0, `${relation} 应清理进攻方 campaign`);
  assert.equal(map.pack.states[2].campaigns.length, 0, `${relation} 应清理防守方 campaign`);
  assert.equal(map.military.campaigns.length, 0, `${relation} 应清理军事 campaign`);
  assert.equal(map.military.fronts.length, 0, `${relation} 应清理军事 front`);
  assert.deepEqual(map.zones.zones.map(zone => zone.type), ["Flood"], `${relation} 应只移除冲突 Warzone`);
  assert.strictEqual(map.pack.military, map.military, `${relation} 应保持 map/pack military 同步`);
  assert.strictEqual(map.pack.zones, map.zones.zones, `${relation} 应保持 map/pack zones 同步`);
  assert.equal(map.zones.metadata.zones, 1);
  assert.equal(map.zones.metadata.types.Warzone, undefined);
  assert.deepEqual(command.getResult().removedWarzoneIds, [7]);

  command.revert({map});
  assert.equal(map.pack.states[1].diplomacy[2], "Enemy", `${relation} 撤销应恢复战争关系`);
  assert.equal(map.pack.states[2].diplomacy[1], "Enemy", `${relation} 撤销应恢复反向战争关系`);
  assert.equal(map.pack.states[1].campaigns.length, 1, `${relation} 撤销应恢复 campaign`);
  assert.equal(map.military.fronts.length, 2, `${relation} 撤销应恢复 front`);
  assert.equal(map.zones.zones.filter(zone => zone.type === "Warzone").length, 1, `${relation} 撤销应恢复 Warzone`);

  command.apply({map});
  assert.equal(map.zones.zones.some(zone => zone.type === "Warzone"), false, `${relation} 重做应再次清理 Warzone`);
}

const oldEnemyMap = createFixtureMap({omitWarzonePair: true});
const legalResult = reconcileWarDerivedData(oldEnemyMap);
const legalWarzone = oldEnemyMap.zones.zones.find(zone => zone.type === "Warzone");
assert.equal(legalResult.backfilledWarzones, 1, "旧 Warzone 应从唯一战争国家对安全回填参与国");
assert.deepEqual({attacker: legalWarzone.attacker, defender: legalWarzone.defender}, {attacker: 1, defender: 2});
assert.equal(legalWarzone.pattern, "dots", "旧 Warzone 用户样式应保留");
assert.equal(legalWarzone.hexColor, "#123456", "旧 Warzone 用户颜色应保留");

const geo = createMapFeatureGeoJson(oldEnemyMap, {
  layers: {state: false, province: false, city: false, route: false, river: false, marker: false, zone: true}
});
const zoneFeature = geo.features.find(feature => feature.properties.type === "Warzone");
assert.equal(zoneFeature.properties.attacker, 1, "GeoJSON 应导出 Warzone 进攻方");
assert.equal(zoneFeature.properties.defender, 2, "GeoJSON 应导出 Warzone 防守方");

const invalidMap = createFixtureMap({omitWarzonePair: true});
invalidMap.pack.states[2].removed = true;
const invalidResult = reconcileWarDerivedData(invalidMap);
assert.equal(invalidResult.removedWarzones, 1, "已删除国家参与的旧 Warzone 应剔除");
assert.equal(invalidMap.zones.zones.some(zone => zone.type === "Warzone"), false);
assert.equal(isActiveEnemyPair(invalidMap.pack.states, 1, 2), false);

const ambiguousMap = createFixtureMap({omitWarzonePair: true});
ambiguousMap.pack.states.push({i: 3, name: "丙国", diplomacy: ["x", "Neutral", "Neutral", "x"], campaigns: []});
ambiguousMap.pack.states[1].diplomacy[3] = "Neutral";
ambiguousMap.pack.states[2].diplomacy[3] = "Neutral";
ambiguousMap.pack.cells.i.push(2);
ambiguousMap.pack.cells.state.push(3);
ambiguousMap.pack.cells.h.push(30);
ambiguousMap.pack.cells.c.push([1]);
ambiguousMap.pack.cells.v.push([2, 3, 4]);
ambiguousMap.pack.vertices.p.push([20, 10]);
ambiguousMap.zones.zones[0].cells.push(2);
const ambiguousResult = reconcileWarDerivedData(ambiguousMap);
assert.equal(ambiguousResult.removedWarzones, 1, "覆盖第三国的旧 Warzone 参与国不明确，必须剔除");
assert.equal(ambiguousMap.zones.zones.some(zone => zone.type === "Warzone"), false);

const zonesSource = await readFile(new URL("../app/webgl-generator/src/generator/zones.js", import.meta.url), "utf8");
const militarySource = await readFile(new URL("../app/webgl-generator/src/generator/military.js", import.meta.url), "utf8");
const appSource = await readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8");
assert.match(zonesSource, /isActiveEnemyPair\(pack\.states, item\.attacker, item\.defender\)/, "front 生成 Warzone 前应复核当前关系");
assert.match(zonesSource, /attacker: front\.attacker, defender: front\.defender/, "新 Warzone 应写入参与国");
assert.match(militarySource, /isActiveEnemyPair\(pack\.states, campaign\.attacker, campaign\.defender\)/, "军事 front/campaign 应复核当前关系");
assert.match(appSource, /normalizeMapForRuntimeAdoption\(map\)/, "旧地图进入运行时前应执行共享 adoption 规范化");

console.log(JSON.stringify({
  ok: true,
  peacefulRelations: 5,
  legacyBackfilled: legalResult.backfilledWarzones,
  invalidRemoved: invalidResult.removedWarzones,
  ambiguousRemoved: ambiguousResult.removedWarzones,
  geoJsonPair: [zoneFeature.properties.attacker, zoneFeature.properties.defender]
}, null, 2));

function createFixtureMap({omitWarzonePair = false} = {}) {
  const campaign = {
    name: "甲乙之战",
    start: 999,
    attacker: 1,
    defender: 2,
    cause: "border"
  };
  const states = [
    {i: 0, name: "中立", diplomacy: []},
    {i: 1, name: "甲国", diplomacy: ["x", "x", "Enemy"], campaigns: [{...campaign}]},
    {i: 2, name: "乙国", diplomacy: ["x", "Enemy", "x"], campaigns: [{...campaign}]}
  ];
  const military = {
    campaigns: [{...campaign}],
    fronts: [
      {id: "attack", attacker: 1, defender: 2, borderCellPairs: [[0, 1]]},
      {id: "defense", attacker: 1, defender: 2, borderCellPairs: [[1, 0]]}
    ],
    metadata: {campaigns: 1, fronts: 2, regiments: 0}
  };
  const warzone = {
    i: 7,
    name: "甲国-乙国战区",
    type: "Warzone",
    cells: [0, 1],
    pattern: "dots",
    hexColor: "#123456",
    hidden: false,
    ...(omitWarzonePair ? {} : {attacker: 1, defender: 2})
  };
  const zones = {
    zones: [warzone, {i: 8, name: "河谷洪水", type: "Flood", cells: [0], hidden: false}],
    metadata: {zones: 2, target: 2, types: {Warzone: 1, Flood: 1}, cells: 3, hidden: 0, invalidCells: 0}
  };
  const pack = {
    states,
    military,
    zones: zones.zones,
    diplomacy: {chronicle: [], metadata: {pairs: 1, enemies: 1}},
    cells: {
      i: [0, 1],
      state: [1, 2],
      h: [30, 30],
      c: [[1], [0]],
      v: [[0, 1, 2], [1, 3, 2]]
    },
    vertices: {p: [[0, 0], [10, 0], [0, 10], [10, 10]]}
  };
  return {
    metadata: {seed: "warzone-consistency"},
    options: {seed: "warzone-consistency", graphWidth: 10, graphHeight: 10},
    pack,
    politics: {states},
    diplomacy: pack.diplomacy,
    military,
    zones
  };
}
