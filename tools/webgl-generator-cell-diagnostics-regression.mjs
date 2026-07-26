#!/usr/bin/env node
import assert from "node:assert/strict";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {buildGridCellDiagnostics, gridCellBounds} from "../app/webgl-generator/src/renderer/grid-cell-diagnostics-layer.js";
import {scanCells} from "../app/webgl-generator/src/runtime/cell-query-api.js";
import {MapRevisionTracker} from "../app/webgl-generator/src/runtime/map-revision.js";

const map = generatePlaceholderMap({
  cellsTarget: 10000,
  seed: "cell-diagnostics-regression",
  graphWidth: 1200,
  graphHeight: 720
});
const version = new MapRevisionTracker({identityFactory: () => "cell-diagnostics-map"});
version.replaceMap();

let yields = 0;
const diagnostics = await buildGridCellDiagnostics(map, {
  sliceMs: 0.05,
  yieldToBrowser: async () => { yields++; }
});
assert.equal(diagnostics.aborted, false, "网格诊断 buffer 构建被意外取消");
assert(diagnostics.edgeCount > map.grid.cells.i.length, "网格共享边数量异常");
assert.equal(diagnostics.vertices.length, diagnostics.edgeCount * 2 * 6, "GL.LINES 顶点数量与共享边不一致");
assert.equal(diagnostics.bufferBytes, diagnostics.vertices.byteLength, "buffer 字节统计失真");
assert(yields > 0, "网格诊断 buffer 没有分片让出主线程");

const rawEdgeCount = Array.from(map.grid.cells.i).reduce((sum, cell) => sum + Number(map.grid.cells.v[cell]?.length || 0), 0);
assert(diagnostics.edgeCount < rawEdgeCount, "共享边没有去重");
const gridCell = Number(map.grid.cells.i[Math.floor(map.grid.cells.i.length / 2)]);
const bounds = gridCellBounds(map, gridCell);
assert(bounds && bounds.maxX > bounds.minX && bounds.maxY > bounds.minY, "Cell 定位 bbox 无效");

const legacyMap = structuredClone(map);
const legacyGridIds = Array.from(legacyMap.grid.cells.i);
for (let index = 0; index < legacyGridIds.length; index += 25) {
  const cell = legacyGridIds[index];
  legacyMap.grid.cells.h[cell] = legacyMap.grid.cells.h[cell] >= 20 ? 0 : 100;
}
delete legacyMap.grid.cells.pack;
legacyMap.pack.cells.g = Array.from(legacyMap.pack.cells.g, () => -1);

const scanQuery = {
  space: "grid",
  checks: ["terrain-consistency", "pack-mapping"],
  fields: ["id", "height", "featureId", "stateId", "consistency"],
  limit: 40
};
const firstPage = await scanCells(legacyMap, scanQuery, version, {sliceMs: 0.05});
assert.equal(firstPage.cancelled, false, "Cell 扫描被意外取消");
assert(firstPage.totalHits > firstPage.count, "Cell 扫描固定图没有形成分页");
assert(firstPage.counts["grid-pack-mapping-missing"] > 0, "缺失 Grid → Pack 映射没有被扫描发现");
assert(firstPage.counts["height-feature-mismatch"] > 0, "高度 / Feature 不一致没有被扫描发现");
assert(firstPage.nextCursor, "Cell 扫描没有返回继续 cursor");
const secondPage = await scanCells(legacyMap, {...scanQuery, cursor: firstPage.nextCursor}, version);
assert(secondPage.items.length > 0, "Cell 扫描第二页为空");
assert.notDeepEqual(secondPage.items, firstPage.items, "Cell 扫描 cursor 没有推进");
await assert.rejects(
  scanCells(legacyMap, {...scanQuery, cursor: `${firstPage.nextCursor.slice(0, -1)}x`}, version),
  error => error.code === "cursor-invalid",
  "篡改扫描 cursor 没有被拒绝"
);

const viewportPage = await scanCells(legacyMap, {
  ...scanQuery,
  filter: {bbox: bounds},
  limit: 100
}, version);
assert(viewportPage.scanned < legacyGridIds.length, "bbox 扫描没有限制候选范围");

const signal = {aborted: false};
const cancelled = await scanCells(legacyMap, scanQuery, version, {
  signal,
  sliceMs: 0.01,
  yieldToBrowser: async () => { signal.aborted = true; }
});
assert.equal(cancelled.cancelled, true, "Cell 扫描没有响应取消");
assert.equal(cancelled.code, "scan-cancelled", "取消扫描没有稳定 code");

const replacement = generatePlaceholderMap({
  cellsTarget: 2400,
  seed: "cell-diagnostics-replacement",
  graphWidth: 1200,
  graphHeight: 720
});
const replacementDiagnostics = await buildGridCellDiagnostics(replacement);
assert.notEqual(replacementDiagnostics.edgeCount, diagnostics.edgeCount, "换图后的诊断拓扑错误复用了旧 buffer");

const scaleResults = [{
  target: 10000,
  cells: map.grid.cells.i.length,
  edges: diagnostics.edgeCount,
  bufferBytes: diagnostics.bufferBytes,
  buildMs: diagnostics.buildMs,
  maxSliceMs: diagnostics.maxSliceMs
}];
for (const cellsTarget of [50000, 100000]) {
  const scaleMap = generatePlaceholderMap({
    cellsTarget,
    seed: `cell-diagnostics-scale-${cellsTarget}`,
    graphWidth: 1200,
    graphHeight: 720
  });
  const scaleDiagnostics = await buildGridCellDiagnostics(scaleMap, {sliceMs: 4});
  assert.equal(scaleDiagnostics.aborted, false, `${cellsTarget} cells 诊断 buffer 构建被意外取消`);
  assert(scaleDiagnostics.edgeCount > scaleMap.grid.cells.i.length, `${cellsTarget} cells 共享边数量异常`);
  assert.equal(scaleDiagnostics.vertices.length, scaleDiagnostics.edgeCount * 2 * 6, `${cellsTarget} cells 顶点数量失真`);
  assert(scaleDiagnostics.bufferBytes < 24 * 1024 * 1024, `${cellsTarget} cells 诊断 buffer 超过 24 MiB`);
  assert(scaleDiagnostics.maxSliceMs < 100, `${cellsTarget} cells 单次构建切片超过 100ms`);
  scaleResults.push({
    target: cellsTarget,
    cells: scaleMap.grid.cells.i.length,
    edges: scaleDiagnostics.edgeCount,
    bufferBytes: scaleDiagnostics.bufferBytes,
    buildMs: scaleDiagnostics.buildMs,
    maxSliceMs: scaleDiagnostics.maxSliceMs
  });
}

console.log(JSON.stringify({
  ok: true,
  grid: {
    cells: map.grid.cells.i.length,
    edges: diagnostics.edgeCount,
    rawEdges: rawEdgeCount,
    bufferBytes: diagnostics.bufferBytes,
    buildMs: diagnostics.buildMs,
    maxSliceMs: diagnostics.maxSliceMs,
    yields
  },
  scan: {
    totalHits: firstPage.totalHits,
    pageSize: firstPage.count,
    codes: firstPage.counts,
    bboxCandidates: viewportPage.scanned,
    cancelled: cancelled.cancelled
  },
  replacement: {
    cells: replacement.grid.cells.i.length,
    edges: replacementDiagnostics.edgeCount
  },
  scales: scaleResults
}, null, 2));
