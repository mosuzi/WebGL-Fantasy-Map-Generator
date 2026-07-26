#!/usr/bin/env node
import assert from "node:assert/strict";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {
  getCellAtPoint,
  getCellNeighbors,
  getCellSnapshot,
  listCellQueryFields,
  queryCells
} from "../app/webgl-generator/src/runtime/cell-query-api.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {MapRevisionTracker} from "../app/webgl-generator/src/runtime/map-revision.js";
import {executeMapSnapshotTransaction} from "../app/webgl-generator/src/runtime/map-snapshot-transaction.js";

const map = generatePlaceholderMap({
  cellsTarget: 2400,
  seed: "cell-read-api-regression",
  graphWidth: 1000,
  graphHeight: 600
});
let identitySequence = 0;
const version = new MapRevisionTracker({identityFactory: () => `fixture-map-${++identitySequence}`});
assert.deepEqual(version.replaceMap(), {mapIdentity: "fixture-map-1", mapRevision: 0}, "新地图没有从 revision 0 开始");

const gridIds = Array.from(map.grid.cells.i);
const landGrid = gridIds.find(id => map.grid.cells.h[id] >= 20 && Number.isInteger(map.grid.cells.pack?.[id]));
const waterGrid = gridIds.find(id => map.grid.cells.h[id] < 20);
const boundaryGrid = gridIds.find(id => Boolean(map.grid.cells.b?.[id]));
assert(Number.isInteger(landGrid), "固定图缺少带 Pack 映射的陆地 Grid cell");
assert(Number.isInteger(waterGrid), "固定图缺少水域 Grid cell");
assert(Number.isInteger(boundaryGrid), "固定图缺少边界 Grid cell");

const gridSnapshot = getCellSnapshot(map, {space: "grid", id: landGrid}, {
  includeGeometry: true,
  includeNeighbors: true,
  includeDiagnostics: true
}, version);
assert.deepEqual(gridSnapshot.ref, {space: "grid", id: landGrid}, "Grid CellRef 失真");
assert(gridSnapshot.geometry.vertexCount >= 3, "Grid polygon 顶点不足");
assert.equal(gridSnapshot.geometry.vertices.length, gridSnapshot.geometry.vertexCount, "显式 geometry 没有返回全部顶点");
assert.equal(gridSnapshot.terrain.heightLand, true, "陆地高度语义错误");
assert.equal(version.getSnapshot().mapRevision, 0, "只读查询错误改变 revision");
assert(Number.isInteger(gridSnapshot.mapping.primaryPackCell), "Grid → Pack 主映射缺失");
const waterSnapshot = getCellSnapshot(map, {space: "grid", id: waterGrid}, {
  includeDiagnostics: true
}, version);
assert.equal(waterSnapshot.terrain.heightLand, false, "水域高度语义错误");
const boundarySnapshot = getCellSnapshot(map, {space: "grid", id: boundaryGrid}, {
  includeGeometry: true,
  includeNeighbors: true
}, version);
assert(boundarySnapshot.geometry.vertexCount >= 3, "边界 Cell 没有合法 polygon");
assert(boundarySnapshot.neighbors.length > 0, "边界 Cell 没有返回有限邻接");

const packCell = gridSnapshot.mapping.primaryPackCell;
const packSnapshot = getCellSnapshot(map, {space: "pack", id: packCell}, {
  includeDiagnostics: true
}, version);
assert.equal(packSnapshot.mapping.gridCell, landGrid, "Pack → Grid 映射没有往返");
assert.equal(packSnapshot.geometry.vertices, null, "默认查询不应返回 polygon 坐标");

const repeated = getCellSnapshot(map, {space: "grid", id: landGrid}, {
  includeGeometry: true,
  includeNeighbors: true,
  includeDiagnostics: true
}, version);
assert.deepEqual(repeated, gridSnapshot, "相同 revision 下 Cell 查询不确定");
gridSnapshot.center.x = -999;
assert.notEqual(getCellSnapshot(map, {space: "grid", id: landGrid}, {}, version).center.x, -999, "结果泄漏内部引用");

const worldHit = getCellAtPoint(map, {
  coordinateSpace: "world",
  x: repeated.center.x,
  y: repeated.center.y
}, {}, {revision: version});
assert.equal(worldHit.found, true, "世界点没有命中 Cell");
assert.deepEqual(worldHit.cell.ref, {space: "grid", id: landGrid}, "世界点命中错误 Cell");

const clientHit = getCellAtPoint(map, {
  coordinateSpace: "client",
  x: 120,
  y: 80
}, {space: "pack"}, {
  revision: version,
  screenToWorld: () => ({x: repeated.center.x, y: repeated.center.y})
});
assert.equal(clientHit.found, true, "client 点换算后没有命中 Cell");
assert.deepEqual(clientHit.cell.ref, {space: "pack", id: packCell}, "client 点没有返回请求的 Pack Cell");

const outside = getCellAtPoint(map, {coordinateSpace: "world", x: -10, y: -10}, {}, {revision: version});
assert.deepEqual({found: outside.found, code: outside.code}, {found: false, code: "cell-not-found"}, "地图外点没有稳定未命中结果");

const neighbors = getCellNeighbors(map, {space: "grid", id: landGrid}, {depth: 3, limit: 24}, version);
assert(neighbors.returned > 0 && neighbors.returned <= 24, "邻接结果没有遵守 limit");
assert(neighbors.levels.every((level, index) => level.depth === index + 1), "邻接层级顺序错误");
assert(neighbors.levels.every(level => level.cells.every(ref => ref.space === "grid")), "邻接结果混入其它 Cell 空间");

const query = {
  space: "grid",
  filter: {land: true},
  fields: ["id", "height", "featureId", "stateId", "consistency"],
  limit: 3
};
const firstPage = queryCells(map, query, version);
assert.equal(firstPage.items.length, 3, "Cell query 分页数量错误");
assert(firstPage.nextCursor, "Cell query 没有返回继续 cursor");
const secondPage = queryCells(map, {...query, cursor: firstPage.nextCursor}, version);
assert.equal(secondPage.items.length, 3, "Cell query 第二页数量错误");
assert.notDeepEqual(secondPage.items, firstPage.items, "Cell query cursor 没有推进");
assert.deepEqual(queryCells(map, query, version), firstPage, "相同查询的 cursor 不稳定");
assert.throws(
  () => queryCells(map, {...query, cursor: `${firstPage.nextCursor.slice(0, -1)}x`}, version),
  error => error.code === "cursor-invalid",
  "篡改 cursor 没有被拒绝"
);
assert.throws(
  () => queryCells(map, {...query, filter: {land: false}, cursor: firstPage.nextCursor}, version),
  error => error.code === "cursor-stale",
  "跨查询条件 cursor 没有被拒绝"
);
assert.throws(
  () => queryCells(map, {...query, fields: ["id", "internalTypedArray"]}, version),
  error => error.code === "invalid_argument",
  "未知投影字段没有被拒绝"
);
assert(listCellQueryFields().includes("consistency"), "字段白名单缺少一致性字段");

version.advance();
assert.throws(
  () => queryCells(map, {...query, cursor: firstPage.nextCursor}, version),
  error => error.code === "cursor-stale",
  "跨 revision cursor 没有失效"
);
assert.throws(
  () => getCellSnapshot(map, landGrid, {}, version),
  error => error.code === "invalid_argument",
  "新 Cells API 错误接受了旧数字引用"
);
assert.throws(
  () => getCellSnapshot(map, {space: "grid", id: Number.MAX_SAFE_INTEGER}, {}, version),
  error => error.code === "not_found",
  "越界 CellRef 没有返回 not_found"
);

const legacyMap = structuredClone(map);
delete legacyMap.grid.cells.pack;
legacyMap.pack.cells.g = Array.from(legacyMap.pack.cells.g, () => -1);
legacyMap.grid.cells.v[landGrid] = [];
const legacySnapshot = getCellSnapshot(legacyMap, {space: "grid", id: landGrid}, {
  includeDiagnostics: true
}, version);
const legacyCodes = legacySnapshot.diagnostics.map(item => item.code);
assert(legacyCodes.includes("grid-pack-mapping-missing"), "旧图缺映射没有结构化诊断");
assert(legacyCodes.includes("invalid-polygon"), "旧图缺 polygon 没有结构化诊断");
assert.equal(JSON.parse(JSON.stringify(legacySnapshot)).ref.id, landGrid, "旧图诊断结果不可 JSON 序列化");

const historyVersion = new MapRevisionTracker({identityFactory: () => `history-map-${++identitySequence}`});
historyVersion.replaceMap();
const editHistory = new EditHistory({
  onMutation: () => historyVersion.advance(),
  onSnapshot: () => historyVersion.createSnapshot(),
  onRestore: snapshot => historyVersion.restoreSnapshot(snapshot)
});
const context = {map: {value: 0}};
const command = {
  label: "测试编辑",
  apply({map: target}) { target.value += 1; },
  revert({map: target}) { target.value -= 1; }
};
editHistory.execute(command, context);
assert.equal(historyVersion.getSnapshot().mapRevision, 1, "成功编辑没有令 revision +1");
editHistory.undo(context);
assert.equal(historyVersion.getSnapshot().mapRevision, 2, "undo 没有令 revision +1");
editHistory.redo(context);
assert.equal(historyVersion.getSnapshot().mapRevision, 3, "redo 没有令 revision +1");
const rollbackSnapshot = editHistory.createSnapshot();
editHistory.execute({
  label: "待回滚编辑",
  apply({map: target}) { target.value += 10; },
  revert({map: target}) { target.value -= 10; }
}, context);
assert.equal(historyVersion.getSnapshot().mapRevision, 4, "事务内编辑没有先记录 revision");
editHistory.restoreSnapshot(rollbackSnapshot);
assert.equal(historyVersion.getSnapshot().mapRevision, 3, "完整回滚没有恢复 revision");
assert.throws(() => editHistory.execute({
  label: "失败编辑",
  apply() { throw new Error("fault"); },
  revert() {}
}, context), /fault/, "故障注入没有抛出");
assert.equal(historyVersion.getSnapshot().mapRevision, 3, "失败编辑错误递增 revision");
const compoundContext = {map: {value: 0, options: {seed: "compound"}}};
const compound = executeMapSnapshotTransaction({
  map: compoundContext.map,
  editHistory,
  label: "复合地图事务",
  execute: () => {
    editHistory.execute({
      label: "内部步骤一",
      apply({map: target}) { target.value += 1; },
      revert({map: target}) { target.value -= 1; }
    }, compoundContext);
    editHistory.execute({
      label: "内部步骤二",
      apply({map: target}) { target.value += 2; },
      revert({map: target}) { target.value -= 2; }
    }, compoundContext);
    return {executed: true};
  },
  executeCommand: outerCommand => ({
    executed: Boolean(editHistory.execute(outerCommand, compoundContext))
  })
});
assert.equal(compound.executed, true, "复合地图事务没有执行");
assert.equal(historyVersion.getSnapshot().mapRevision, 4, "复合地图事务没有折叠为 revision 恰好 +1");
const beforeFaultRevision = historyVersion.getSnapshot().mapRevision;
assert.throws(() => executeMapSnapshotTransaction({
  map: compoundContext.map,
  editHistory,
  label: "失败复合地图事务",
  execute: () => {
    editHistory.execute({
      label: "失败前内部步骤",
      apply({map: target}) { target.value += 10; },
      revert({map: target}) { target.value -= 10; }
    }, compoundContext);
    throw new Error("compound-fault");
  },
  executeCommand: outerCommand => ({
    executed: Boolean(editHistory.execute(outerCommand, compoundContext))
  })
}), /compound-fault/, "失败复合事务没有抛出");
assert.equal(historyVersion.getSnapshot().mapRevision, beforeFaultRevision, "失败复合事务错误递增 revision");
const beforeReplace = historyVersion.getSnapshot();
const afterReplace = historyVersion.replaceMap();
assert.notEqual(afterReplace.mapIdentity, beforeReplace.mapIdentity, "换图没有生成新 identity");
assert.equal(afterReplace.mapRevision, 0, "换图 revision 没有归零");
const failedReplaceSnapshot = editHistory.createSnapshot();
const beforeFailedReplace = historyVersion.getSnapshot();
historyVersion.replaceMap();
editHistory.restoreSnapshot(failedReplaceSnapshot);
assert.deepEqual(historyVersion.getSnapshot(), beforeFailedReplace, "失败换图没有恢复原 identity / revision");

assert.equal("mapIdentity" in map, false, "运行时 identity 污染了地图对象");
assert.equal("mapRevision" in map, false, "运行时 revision 污染了地图对象");

console.log(JSON.stringify({
  ok: true,
  map: {
    gridCells: map.grid.cells.i.length,
    packCells: map.pack.cells.i.length,
    landGrid,
    waterGrid,
    boundaryGrid,
    packCell
  },
  cells: {
    gridPackRoundtrip: true,
    geometryOptIn: true,
    neighbors: neighbors.returned,
    queryFields: listCellQueryFields().length,
    cursorTamperRejected: true,
    legacyDiagnostics: legacyCodes
  },
  revision: {
    editUndoRedo: true,
    rollbackStable: true,
    compoundExactlyOnce: true,
    replacementIdentity: afterReplace.mapIdentity
  }
}, null, 2));
