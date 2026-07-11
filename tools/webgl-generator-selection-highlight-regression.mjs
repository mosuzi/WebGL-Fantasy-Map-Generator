#!/usr/bin/env node
import {buildSelectionMeshVertices, selectionHighlightMode} from "../app/webgl-generator/src/renderer/selection-layer.js";

const map = createSyntheticMap();
const camera = {scale: 1, offsetX: 0, offsetY: 0};
const canvas = {width: 100, height: 100, clientWidth: 100};
const state = {kind: "state", id: 1};
const highlights = [
  state,
  {kind: "lake", id: 2},
  {kind: "river", id: 3}
];

const single = buildSelectionMeshVertices(map, camera, canvas, state, null, []);
const combined = buildSelectionMeshVertices(map, camera, canvas, null, null, highlights);
const deduplicated = buildSelectionMeshVertices(map, camera, canvas, state, null, highlights);

assert(single.length / 6 === 12, `单国家顶点数异常：${single.length / 6}`);
assert(combined.length / 6 === 30, `三对象顶点数异常：${combined.length / 6}`);
assert(deduplicated.length / 6 === combined.length / 6, "当前 selection 与持久高亮重复绘制");
assert(selectionHighlightMode(null, null, highlights) === "multi-object highlight (3)", "多对象高亮模式摘要异常");
assert(selectionHighlightMode(state, null, []) === "state translucent cells", "单对象 selection 模式发生回归");

console.log(JSON.stringify({
  ok: true,
  singleVertices: single.length / 6,
  combinedVertices: combined.length / 6,
  duplicateSafeVertices: deduplicated.length / 6,
  mode: selectionHighlightMode(null, null, highlights)
}, null, 2));

function createSyntheticMap() {
  return {
    metadata: {graphWidth: 100, graphHeight: 100},
    grid: {
      points: [[25, 25]],
      cells: {
        v: [[0, 1, 2, 3]],
        p: [0],
        state: [1],
        province: [1],
        culture: [1],
        religion: [1],
        region: [1]
      },
      vertices: {p: [[0, 0], [50, 0], [50, 50], [0, 50]]}
    },
    pack: {
      cells: {
        i: [0],
        v: [[0, 1, 2, 3]],
        p: [[75, 75]],
        f: [2],
        h: [10]
      },
      vertices: {p: [[50, 50], [100, 50], [100, 100], [50, 100]]}
    },
    rivers: {
      metadata: {maxFlux: 10},
      rivers: [{id: 3, flux: 10, points: [[0, 100], [100, 0]]}]
    },
    zones: {zones: []}
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
