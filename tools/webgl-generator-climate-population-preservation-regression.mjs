#!/usr/bin/env node
import assert from "node:assert/strict";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {captureClimatePopulation, restoreClimatePopulation} from "../app/webgl-generator/src/runtime/climate-population-preservation.js";

const map = generatePlaceholderMap({seed: "climate-population-preservation", cellsTarget: 3000, heightmapTemplate: "continents"});
const beforePack = Array.from(map.pack.cells.pop);
const beforeGrid = Array.from(map.grid.cells.pop);
const packConstructor = map.pack.cells.pop.constructor;
const snapshot = captureClimatePopulation(map);

map.pack.cells.pop = new Float32Array(map.pack.cells.pop.length).fill(123);
map.grid.cells.pop = new Array(map.grid.cells.pop.length).fill(456);
assert.equal(restoreClimatePopulation(map, snapshot), true);
assert.deepEqual(Array.from(map.pack.cells.pop), beforePack);
assert.deepEqual(Array.from(map.grid.cells.pop), beforeGrid);
assert.equal(map.pack.cells.pop.constructor, packConstructor);

snapshot.pack[0] = Number(snapshot.pack[0] || 0) + 1;
assert.notEqual(Number(map.pack.cells.pop[0]), Number(snapshot.pack[0]), "恢复结果与快照共享了可变引用");
assert.equal(restoreClimatePopulation(map, null), false);

console.log("气候重算保留人口快照回归通过。");
