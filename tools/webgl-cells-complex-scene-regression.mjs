#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join, resolve} from "node:path";
import {buildCellBuffers} from "../prototype/webgl-cells/src/buffers.js";
import {buildComplexScene, SCENE_LAYER_ORDER} from "../prototype/webgl-cells/src/webgpu-scene.js";

const root = resolve(import.meta.dirname, "..");
const snapshot = JSON.parse(readFileSync(join(root, "prototype", "webgl-cells", "data", "sample-map.json"), "utf8"));
const buffers = buildCellBuffers(snapshot, "states");
const scene = buildComplexScene(snapshot, buffers);
assert.equal(buffers.renderCellCount, 99846);
assert.equal(buffers.vertexCount, 1795563);
assert.ok(scene.rawStateBorderSegments > 2000);
assert.equal(scene.labels.states.length, 15);
assert.equal(scene.labels.burgs.length, 128);
for (const id of SCENE_LAYER_ORDER) {
  const layer = scene.layers[id];
  assert.ok(layer, `缺少图层：${id}`);
  for (const mesh of [layer.hard, layer.smooth, layer].filter(item => item?.positions)) {
    assert.ok(mesh.vertexCount > 0, `${id} 没有实际绘制顶点`);
    assert.equal(mesh.positions.length, mesh.vertexCount * 2, `${id} 坐标数量不匹配`);
    assert.equal(mesh.colors.length, mesh.vertexCount * 3, `${id} 颜色数量不匹配`);
  }
}
for (const id of ["coastline", "lakeShore", "stateBorders", "provinceBorders"]) {
  assert.ok(scene.counts[id].smoothVertices > scene.counts[id].hardVertices, `${id} 平滑未增加采样`);
}
const report = {
  ok: true,
  gridCells: buffers.renderCellCount,
  packCells: snapshot.cells.i.length,
  cellVertices: buffers.vertexCount,
  rawStateBorderSegments: scene.rawStateBorderSegments,
  layerCounts: scene.counts,
  labels: {states: scene.labels.states.length, burgs: scene.labels.burgs.length}
};
console.log(JSON.stringify(report, null, 2));
