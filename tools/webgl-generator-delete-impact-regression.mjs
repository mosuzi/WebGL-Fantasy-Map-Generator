import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {createDeleteBatchCommand, inspectDeleteImpact, requestDeleteConfirmation} from "../app/webgl-generator/src/runtime/delete-impact.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {OBJECT_KIND} from "../app/webgl-generator/src/runtime/object-kinds.js";
import {objectNoteId, restoreObjectNote} from "../app/webgl-generator/src/runtime/object-notes.js";
import {createDeleteRouteCommand} from "../app/webgl-generator/src/runtime/route-edit-commands.js";

const riverMap = createRiverPreviewFixture();
const riverBefore = JSON.stringify(riverMap);
const cancelledHistory = new EditHistory();
const cancelledHistoryBefore = cancelledHistory.getStats();
const riverPreview = inspectDeleteImpact(riverMap, OBJECT_KIND.RIVER, [2, 99, "bad", 2]);
assert.deepEqual(riverPreview.validIds, [2]);
assert.deepEqual(riverPreview.deleteIds, [2, 3]);
assert.deepEqual(riverPreview.cascadeIds, [3]);
assert.equal(riverPreview.dependencies.tributaries, 1);
assert.equal(riverPreview.dependencies.lakeReferences, 3);
assert.equal(riverPreview.dependencies.notes, 2);
assert.equal(riverPreview.skipped.length, 3);
assert(riverPreview.requiresConfirm && riverPreview.summary.includes("支流 1") && riverPreview.confirmationMessage.includes("#2、#3"));

let confirmationText = "";
assert.equal(requestDeleteConfirmation(riverPreview, message => (confirmationText = message, false)), false, "取消确认必须阻止删除");
assert.equal(confirmationText, riverPreview.confirmationMessage);
assert.equal(JSON.stringify(riverMap), riverBefore, "预检与取消确认不得改变地图");
assert.deepEqual(cancelledHistory.getStats(), cancelledHistoryBefore, "取消确认不得写入编辑历史");

const statePreview = inspectDeleteImpact(createStatePreviewFixture(), OBJECT_KIND.STATE, [1]);
assert.deepEqual(statePreview.dependencies, {
  packCells: 2,
  gridCells: 2,
  provinces: 1,
  cities: 1,
  regiments: 1,
  notes: 1
});
assert(statePreview.requiresConfirm && statePreview.summary.includes("省份 1") && statePreview.summary.includes("军团 1"));

const routeMap = createRouteFixture();
const routeBefore = snapshotRouteMap(routeMap);
const history = new EditHistory();
const batch = createDeleteBatchCommand({
  kind: OBJECT_KIND.ROUTE,
  ids: [1, 999, 2, "bad"],
  createCommand: id => createDeleteRouteCommand(id),
  label: "批量删除路线"
});
history.execute(batch, {map: routeMap});
assert.deepEqual(routeMap.settlements.routes, [], "批量路线删除没有移除两个有效对象");
assert.equal(routeMap.notes.notes.length, 0, "批量路线删除没有清理备注");
assert.equal(history.getStats().undo, 1, "批量删除必须只形成一条历史");
assert.deepEqual(batch.getResult(), {
  requested: 4,
  succeeded: 2,
  deleted: 2,
  deletedIds: [1, 2],
  skipped: [
    {id: "bad", code: "invalid-id", reason: "id 不是有效整数"},
    {id: 999, code: "not-found", reason: "对象不存在或已被同批级联删除"}
  ],
  failed: [],
  subresults: [{id: 1, result: null}, {id: 2, result: null}]
});
history.undo({map: routeMap});
assert.deepEqual(snapshotRouteMap(routeMap), routeBefore, "一次撤销必须恢复批量删除的路线、备注和索引");
history.redo({map: routeMap});
assert.deepEqual(routeMap.settlements.routes, [], "重做必须复现批量删除");

const failureOptions = {seed: "delete-impact-failure"};
const failureMap = {items: [1, 2], options: failureOptions, nested: {value: "before"}};
const failureHistory = new EditHistory();
const failingBatch = createDeleteBatchCommand({
  kind: "fixture",
  ids: [1, 2],
  createCommand: id => fixtureDeleteCommand(id, {failAfterWrite: id === 2})
});
assert.throws(() => failureHistory.execute(failingBatch, {map: failureMap}), /fixture failure 2/);
assert.deepEqual(failureMap.items, [1, 2], "批次中途失败必须回滚此前已删对象");
assert.equal(failureMap.options, failureOptions, "批次中途失败必须保留 map.options 引用");
assert.deepEqual(failureMap.nested, {value: "before"}, "失败子命令先部分写入再抛错时必须恢复整图");
assert.equal(failureHistory.getStats().undo, 0, "失败批次不得进入历史");
assert.deepEqual(failingBatch.getResult().failed, [{id: 2, code: "delete-failed", reason: "fixture failure 2"}], "失败批次必须返回结构化失败摘要");

const appSource = await readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8");
const routeComponent = await readFile(new URL("../app/webgl-generator/src/ui/vue/components/RoutePanel.vue", import.meta.url), "utf8");
const riverComponent = await readFile(new URL("../app/webgl-generator/src/ui/vue/components/RiverPanel.vue", import.meta.url), "utf8");
const lakeComponent = await readFile(new URL("../app/webgl-generator/src/ui/vue/components/LakePanel.vue", import.meta.url), "utf8");
const deleteRunner = sourceBetween(appSource, "function executeDeleteWithPreflight", "function executeEditCommand");
assert.match(deleteRunner, /inspectDeleteImpact[\s\S]*?requestDeleteConfirmation[\s\S]*?createDeleteBatchCommand[\s\S]*?executeEditCommand/, "UI 删除必须按预检、确认、事务命令顺序执行");
assert.match(deleteRunner, /return \{executed: false, cancelled: true/, "取消确认必须在命令创建前返回结构化结果");
for (const kind of ["STATE", "PROVINCE", "CITY", "CULTURE", "RELIGION"]) {
  assert.match(appSource, new RegExp(`kind: OBJECT_KIND\\.${kind}[\\s\\S]{0,180}?executeDeleteWithPreflight|executeDeleteWithPreflight[\\s\\S]{0,180}?kind: OBJECT_KIND\\.${kind}`), `${kind} 高影响删除入口没有接入统一预检`);
}
for (const [label, source] of [["路线", routeComponent], ["河流", riverComponent], ["湖泊", lakeComponent]]) {
  assert.match(source, /delete-selected[\s\S]*?onDeleteMany/, `${label}面板缺少批量删除入口`);
}

console.log(JSON.stringify({
  riverDeleteIds: riverPreview.deleteIds,
  riverTributaries: riverPreview.dependencies.tributaries,
  riverSkipped: riverPreview.skipped,
  cancellationPreservedMap: JSON.stringify(riverMap) === riverBefore,
  cancellationPreservedHistory: cancelledHistory.getStats().undo === 0,
  stateDependencies: statePreview.dependencies,
  batchResult: batch.getResult(),
  singleTransaction: history.getStats().undo
}, null, 2));

function createRiverPreviewFixture() {
  const map = {
    rivers: {rivers: [
      {id: 1, parent: 0, basin: 1, cells: [0, 1]},
      {id: 2, parent: 1, basin: 1, cells: [2, 3]},
      {id: 3, parent: 2, basin: 1, cells: [4]},
      {id: 4, parent: 0, basin: 4, cells: [5]}
    ]},
    pack: {features: [null, {type: "lake", inlets: [2, 4], outlet: 3, river: 2}]},
    notes: {notes: [], metadata: {count: 0, pinned: 0}}
  };
  restoreObjectNote(map, note("river", 2));
  restoreObjectNote(map, note("river", 3));
  return map;
}

function createRouteFixture() {
  const map = {
    settlements: {
      routes: [
        {id: 1, type: "road", points: [[0, 0], [1, 0]], packCells: [0, 1]},
        {id: 2, type: "trail", points: [[1, 0], [2, 0]], packCells: [1, 2]}
      ],
      metadata: {routes: 2, routeSegments: 2, routeResourceCells: 0, routeMarkerResourceCells: 0, routesWithResources: 0}
    },
    pack: {
      routes: [
        null,
        {i: 1, group: "roads", resourceCells: 0, markerResourceCells: 0, points: [[0, 0, 0], [1, 0, 1]]},
        {i: 2, group: "trails", resourceCells: 0, markerResourceCells: 0, points: [[1, 0, 1], [2, 0, 2]]}
      ],
      cells: {routes: {0: {1: 1}, 1: {0: 1, 2: 2}, 2: {1: 2}}}
    },
    notes: {notes: [], metadata: {count: 0, pinned: 0}}
  };
  restoreObjectNote(map, note("route", 1));
  restoreObjectNote(map, note("route", 2));
  return map;
}

function createStatePreviewFixture() {
  const map = {
    politics: {
      states: [null, {id: 1, name: "测试国", military: [{i: 0}]}],
      provinces: [null, {id: 1, state: 1}]
    },
    society: {cultures: [null], religions: [null]},
    settlements: {cities: [null, {id: 1, state: 1}]},
    grid: {cells: {state: [1, 1, 0]}},
    pack: {cells: {state: [1, 0, 1]}},
    notes: {notes: [], metadata: {count: 0, pinned: 0}}
  };
  restoreObjectNote(map, note("state", 1));
  return map;
}

function note(kind, id) {
  return {
    id: objectNoteId({kind, id}),
    kind,
    objectId: id,
    name: `${kind} #${id}`,
    body: "删除预检回归备注",
    format: "plain",
    pinned: false
  };
}

function snapshotRouteMap(map) {
  const snapshot = JSON.parse(JSON.stringify({
    routes: map.settlements.routes,
    metadata: map.settlements.metadata,
    packRoutes: map.pack.routes,
    cellRoutes: map.pack.cells.routes,
    notes: map.notes
  }));
  snapshot.notes.notes.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return snapshot;
}

function fixtureDeleteCommand(id, {failAfterWrite = false} = {}) {
  let index = -1;
  return {
    label: `fixture ${id}`,
    domain: "fixture",
    effects: {render: "none", selection: "refresh", affected: [{kind: "fixture", id}]},
    apply(context) {
      index = context.map.items.indexOf(id);
      context.map.items.splice(index, 1);
      context.map.nested.value = `written-${id}`;
      context.map.options = {seed: `written-${id}`};
      if (failAfterWrite) throw new Error(`fixture failure ${id}`);
    },
    revert(context) {
      context.map.items.splice(index, 0, id);
    },
    isNoop(context) {
      return !context.map.items.includes(id);
    }
  };
}

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `无法读取源码片段：${start}`);
  return source.slice(startIndex, endIndex);
}
