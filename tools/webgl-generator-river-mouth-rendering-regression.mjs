#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {
  buildSelectionMeshBundle,
  drawSelectionMeshBatches
} from "../app/webgl-generator/src/renderer/selection-layer.js";
import {drawLandMaskedTriangles, SURFACE_SIDE_ALPHA} from "../app/webgl-generator/src/renderer/surface-side-depth.js";

const map = createFixture();
const before = structuredClone(map.rivers.rivers[0]);
const camera = {scale: 1, offsetX: 0, offsetY: 0};
const canvas = {width: 1000, height: 600, clientWidth: 1000, clientHeight: 600};
const preview = {
  valid: true,
  riverId: 7,
  insertIndex: 1,
  points: [[100, 200, 10], [500, 230, 20], [900, 200, 30]]
};

const riverOnly = buildSelectionMeshBundle(map, camera, canvas, {kind: "river", id: 7}, null, [], preview);
assert.ok(riverOnly.drawRanges.landMasked.count > 0, "河流选择与有效折点预览必须进入陆地遮罩 range");
assert.equal(riverOnly.drawRanges.ordinary.count, 0, "纯河流选择不得进入未遮罩 range");
assert.equal(riverOnly.vertices.length / 6, riverOnly.drawRanges.landMasked.count);

const mixed = buildSelectionMeshBundle(map, camera, canvas, {kind: "note", id: "note-1"}, null, [{kind: "river", id: 7}], null);
assert.ok(mixed.drawRanges.landMasked.count > 0, "河流批量高亮必须进入陆地遮罩 range");
assert.ok(mixed.drawRanges.ordinary.count > 0, "非河流选择必须继续进入普通 range");
assert.equal(mixed.drawRanges.ordinary.first, mixed.drawRanges.landMasked.count, "普通 range 必须紧随遮罩 range");

const riverGl = createMockGl();
drawLandMaskedTriangles(riverGl, {first: 0, count: 24});
assert.deepEqual(riverGl.calls, [
  ["enable", "DEPTH_TEST"],
  ["depthMask", false],
  ["depthFunc", "GREATER"],
  ["drawArrays", "TRIANGLES", 0, 24],
  ["disable", "DEPTH_TEST"],
  ["depthMask", false],
  ["depthFunc", "LESS"]
], "普通河流必须只通过最终视觉陆地并恢复 overlay depth 状态");

const selectionGl = createMockGl();
drawSelectionMeshBatches(selectionGl, mixed.drawRanges);
assert.deepEqual(selectionGl.calls, [
  ["enable", "DEPTH_TEST"],
  ["depthMask", false],
  ["depthFunc", "GREATER"],
  ["drawArrays", "TRIANGLES", mixed.drawRanges.landMasked.first, mixed.drawRanges.landMasked.count],
  ["disable", "DEPTH_TEST"],
  ["depthMask", false],
  ["depthFunc", "LESS"],
  ["drawArrays", "TRIANGLES", mixed.drawRanges.ordinary.first, mixed.drawRanges.ordinary.count]
], "河流 selection 必须先受陆地遮罩，普通 selection 随后不受裁切");

const hardSurface = [SURFACE_SIDE_ALPHA.land, SURFACE_SIDE_ALPHA.land, SURFACE_SIDE_ALPHA.water, SURFACE_SIDE_ALPHA.water];
const smoothSurface = [SURFACE_SIDE_ALPHA.land, SURFACE_SIDE_ALPHA.land, SURFACE_SIDE_ALPHA.land, SURFACE_SIDE_ALPHA.water];
assert.deepEqual(maskRiverPixels(hardSurface), [true, true, false, false], "硬岸线必须在最终 surface 交点裁断河流");
assert.deepEqual(maskRiverPixels(smoothSurface), [true, true, true, false], "平滑岸线移动后河口必须直接跟随最终 surface");
assert.deepEqual(map.rivers.rivers[0], before, "渲染裁切不得改写河流 canonical 数据");

const rendererSource = await readFile(new URL("../app/webgl-generator/src/renderer/placeholder-renderer.js", import.meta.url), "utf8");
const drawSource = sourceBetween(rendererSource, "draw({updateDynamicBuffers", "pickClientPoint(clientX");
assert.ok(drawSource.indexOf("drawSurfaceDepthBatch") < drawSource.indexOf("drawLandMaskedTriangles"), "最终 surface depth 必须先于河流遮罩绘制");
assert.match(drawSource, /drawLandMaskedTriangles\(gl, \{first: 0, count: this\.riverVertexCount\}\)/, "正式河流 draw 必须走陆地遮罩 helper");
assert.match(drawSource, /drawSelectionMeshBatches\(gl, this\.selectionDrawRanges\)/, "选择层必须按河流 / 普通 ranges 绘制");

console.log(JSON.stringify({
  ok: true,
  riverVertices: riverOnly.vertices.length / 6,
  mixedRanges: mixed.drawRanges,
  hardVisiblePixels: maskRiverPixels(hardSurface).filter(Boolean).length,
  smoothVisiblePixels: maskRiverPixels(smoothSurface).filter(Boolean).length,
  canonicalRiverDataUnchanged: true
}, null, 2));

function createFixture() {
  const river = {
    id: 7,
    points: [[100, 200, 10], [900, 200, 30]],
    cells: [0, 1],
    parent: 0,
    basin: 7,
    flux: 30,
    discharge: 30
  };
  return {
    metadata: {graphWidth: 1000, graphHeight: 600},
    pack: {cells: {p: [[100, 200], [900, 200]], h: [30, 20], i: [0, 1]}, rivers: [river]},
    rivers: {rivers: [river], metadata: {maxFlux: 30}},
    notes: {notes: [{kind: "note", objectId: "note-1", x: 300, y: 320}]}
  };
}

function createMockGl() {
  const calls = [];
  return {
    calls,
    TRIANGLES: "TRIANGLES",
    DEPTH_TEST: "DEPTH_TEST",
    GREATER: "GREATER",
    LESS: "LESS",
    enable: value => calls.push(["enable", value]),
    disable: value => calls.push(["disable", value]),
    depthMask: value => calls.push(["depthMask", value]),
    depthFunc: value => calls.push(["depthFunc", value]),
    drawArrays: (...args) => calls.push(["drawArrays", ...args])
  };
}

function maskRiverPixels(surfaceDepths) {
  return surfaceDepths.map(depth => 0.5 > depth);
}

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `无法读取源码片段：${start}`);
  return source.slice(startIndex, endIndex);
}
