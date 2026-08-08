#!/usr/bin/env node
import assert from "node:assert/strict";

import {buildObjectPickingIndex, pickGridCell, pickRiver} from "../app/webgl-generator/src/renderer/picking.js";

const map = createFixture();
const pick = pickGridCell(map, 5, 5);
assert.deepEqual(
  {gridCell: pick.gridCell, worldX: pick.worldX, worldY: pick.worldY},
  {gridCell: null, worldX: 5, worldY: 5},
  "缺失 Voronoi 顶点的候选 cell 不得抛异常，也不得伪造 cell 命中"
);

const index = buildObjectPickingIndex(map);
const river = pickRiver(map, index, 5, 5, 2);
assert.equal(river?.kind, "river", "即使 grid cell 无法命中，河流仍必须可通过世界坐标拾取");
assert.equal(river?.id, 1);

console.log(JSON.stringify({ok: true, invalidGridCell: pick.gridCell, river: {id: river.id, distance: river.distance}}, null, 2));

function createFixture() {
  return {
    metadata: {graphWidth: 10, graphHeight: 10},
    grid: {
      metadata: {columns: 1, rows: 1},
      cells: {v: [undefined]},
      vertices: {p: []}
    },
    settlements: {cities: [], routes: []},
    markers: {markers: []},
    politics: {states: []},
    rivers: {
      rivers: [{id: 1, name: "测试河", parent: 0, cells: [0], points: [[0, 5], [10, 5]], flux: 10}],
      metadata: {maxFlux: 10}
    }
  };
}
