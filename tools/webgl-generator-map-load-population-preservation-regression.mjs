#!/usr/bin/env node
import assert from "node:assert/strict";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {normalizeSuitabilityMap} from "../app/webgl-generator/src/runtime/suitability-edit-commands.js";

const map = generatePlaceholderMap({seed: "map-load-population-preservation", cellsTarget: 3000, heightmapTemplate: "continents"});
normalizeSuitabilityMap(map);
const landCells = Array.from(map.pack.cells.i).filter(cell => Number(map.pack.cells.h[cell]) >= 20).slice(0, 5);
assert.equal(landCells.length, 5);
for (const [index, cell] of landCells.entries()) map.pack.cells.pop[cell] = 1000 + index * 17;
const beforePack = Array.from(map.pack.cells.pop);

normalizeSuitabilityMap(map);

assert.deepEqual(Array.from(map.pack.cells.pop), beforePack, "加载归一化不得覆盖存档中的人口调整");
for (const cell of landCells) {
  const gridCell = Number(map.pack.cells.g[cell]);
  const expected = Math.max(...Array.from(map.pack.cells.i).filter(packCell => Number(map.pack.cells.g[packCell]) === gridCell).map(packCell => Number(map.pack.cells.pop[packCell]) || 0));
  assert.equal(Number(map.grid.cells.pop[gridCell]), Math.round(expected * 1000) / 1000, "grid 人口镜像必须来自保存后的 pack 人口");
}
assertRuralStores(map);

const ruralBeforeSecondLoad = ruralStoreSnapshot(map);
normalizeSuitabilityMap(map);
assert.deepEqual(ruralStoreSnapshot(map), ruralBeforeSecondLoad, "重复加载不得累加零号未归属人口聚合");

console.log("地图加载保留人口调整回归通过。");

function assertRuralStores(targetMap) {
  const configs = [
    {field: "state", stores: [targetMap.politics?.states, targetMap.pack?.states]},
    {field: "province", stores: [targetMap.politics?.provinces, targetMap.pack?.provinces]},
    {field: "culture", stores: [targetMap.society?.cultures, targetMap.pack?.cultures]},
    {field: "religion", stores: [targetMap.society?.religions, targetMap.pack?.religions]}
  ];
  for (const {field, stores} of configs) {
    const expected = new Map();
    for (const cell of targetMap.pack.cells.i) {
      const id = Number(targetMap.pack.cells[field]?.[cell]) || 0;
      expected.set(id, (expected.get(id) || 0) + (Number(targetMap.pack.cells.pop?.[cell]) || 0));
    }
    for (const store of [...new Set(stores.filter(Array.isArray))]) {
      for (const [id, value] of expected) {
        const item = store[id];
        if (!item || item.removed) continue;
        assert.equal(Number(item.rural), Math.round(value * 100) / 100, `${field} #${id} 农村人口聚合与保存人口不一致`);
      }
    }
  }
}

function ruralStoreSnapshot(targetMap) {
  return {
    politicsStates: targetMap.politics?.states?.map(item => item?.rural),
    politicsProvinces: targetMap.politics?.provinces?.map(item => item?.rural),
    societyCultures: targetMap.society?.cultures?.map(item => item?.rural),
    societyReligions: targetMap.society?.religions?.map(item => item?.rural),
    packStates: targetMap.pack?.states?.map(item => item?.rural),
    packProvinces: targetMap.pack?.provinces?.map(item => item?.rural),
    packCultures: targetMap.pack?.cultures?.map(item => item?.rural),
    packReligions: targetMap.pack?.religions?.map(item => item?.rural)
  };
}
