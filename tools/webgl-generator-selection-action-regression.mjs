import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {SelectionStore} from "../app/webgl-generator/src/runtime/selection-store.js";
import {describeObjectDetailsActions, OBJECT_DETAILS_EDIT_MODE} from "../app/webgl-generator/src/runtime/object-details-actions.js";
import {OBJECT_KIND} from "../app/webgl-generator/src/runtime/object-kinds.js";

const objects = new Map([
  ["state:1", {kind: "state", id: 1, name: "甲"}],
  ["state:2", {kind: "state", id: 2, name: "乙"}]
]);
const resolveObject = object => objects.get(`${object?.kind}:${object?.id}`) || null;
const events = [];
const store = new SelectionStore((snapshot, metadata) => events.push({snapshot, metadata}), resolveObject);

store.setSelection({object: {kind: "state", id: 1}});
store.setSelection({object: {kind: "state", id: 1}});
assert.equal(events.length, 2, "单次选择调用应保留同步通知语义");

store.startEditing({kind: "state", id: 1}, {select: true});
assert.equal(events.length, 3, "原子进入编辑态只应新增一次通知");
assert.equal(events.at(-1).snapshot.editingObject.name, "甲");

store.batch(() => {
  store.setSelection({object: {kind: "state", id: 2}});
  store.setSelection({object: {kind: "state", id: 2}}, {sourcePanelId: "state-panel"});
  store.startEditing({kind: "state", id: 2});
  store.refresh();
});
assert.equal(events.length, 4, "批次内选择、编辑和刷新只应合并为一次通知");
assert.equal(events.at(-1).snapshot.selection.object.id, 2);
assert.equal(events.at(-1).snapshot.editingObject.id, 2);
assert.equal(events.at(-1).metadata.sourcePanelId, "state-panel", "批次通知应保留来源面板语义");

objects.delete("state:2");
store.batch(() => store.refresh());
assert.equal(events.length, 5, "对象删除后的刷新应通知一次");
assert.equal(events.at(-1).snapshot.selection, null);
assert.equal(events.at(-1).snapshot.editingObject, null);
store.clear();
assert.equal(events.length, 6, "单次 clear 调用应保留同步通知语义");

store.setSelection({object: {kind: "state", id: 1}});
store.startEditing({kind: "state", id: 999}, {select: true});
assert.equal(events.at(-1).snapshot.selection, null, "进入不存在对象的编辑态时不得保留旧选择");
assert.equal(events.at(-1).snapshot.editingObject, null, "进入不存在对象的编辑态时不得保留旧编辑对象");

const appSource = await readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8");
const statePanelSource = await readFile(new URL("../app/webgl-generator/src/ui/panels/state-panel.js", import.meta.url), "utf8");
assert.match(appSource, /selectionStore\.startEditing\(object, \{select\}\)/, "进入编辑应原子设置选择与编辑态");
assert.match(appSource, /selectionStore\.setSelection\(\{object\}, \{sourcePanelId: panelId\}\)/, "批次选择应把来源面板作为通知元数据保存");
assert.match(
  appSource,
  /state\.selectionStore\.batch\(\(\) => \{[\s\S]*?preparePanelRefresh[\s\S]*?reconcilePersistentObjectHighlights[\s\S]*?refresh\(state, executedCommand\);[\s\S]*?\}\);/,
  "编辑执行应把状态准备、高亮校正和刷新合并为一个选择通知批次"
);

const measurementStart = sourceBetween("function startMeasurementMode", "function stopMeasurementMode");
assert.match(measurementStart, /enterCanvasToolMode\(state, documentRef, CANVAS_TOOL_MODE\.MEASUREMENT_DRAW\)/, "测量应进入统一画布模式管理器");
const measurementObjectEdit = sourceBetween("function startMeasurementObjectEdit", "function locateMeasurement");
assert.match(measurementObjectEdit, /startMeasurementMode\(state, documentRef, \{status: ""\}\)/, "测量对象编辑应复用测量模式入口");
assert.doesNotMatch(measurementObjectEdit, /state\.measurement\.active\s*=\s*true/, "测量对象编辑不得绕过统一入口");
const markerStart = sourceBetween("function startMarkerEditMode", "function stopMarkerEditMode");
assert.match(markerStart, /CANVAS_TOOL_MODE\.MARKER_MOVE[\s\S]*?CANVAS_TOOL_MODE\.MARKER_ADD/, "标记新增与移动应映射为统一画布模式");
assert.match(markerStart, /enterCanvasToolMode\(state, documentRef, modeId, \{type, markerId\}\)/, "标记应进入统一画布模式管理器");
assert.match(appSource, /register\(CANVAS_TOOL_MODE\.MEASUREMENT_DRAW[\s\S]*?register\(CANVAS_TOOL_MODE\.MARKER_ADD[\s\S]*?register\(CANVAS_TOOL_MODE\.MARKER_MOVE/, "测量与标记必须注册到同一模式管理器");

const stateEditorEntry = sourceBetween("const enterStateEditor", "state.startObjectEditing");
assert.match(stateEditorEntry, /state\.panels\.state\.setTargetStateId\(object\.id\)/, "国家编辑入口必须锁定当前国家");
assert.match(stateEditorEntry, /state\.panels\.state\.open\(state\.map, state\.editHistory\.getStats\(\)\)/, "国家编辑入口必须打开国家面板");
assert.match(stateEditorEntry, /enterCanvasToolMode\(state, documentRef, CANVAS_TOOL_MODE\.STATE_BRUSH\)/, "国家编辑入口必须启用国家归属画笔");
assert.match(stateEditorEntry, /startObjectEditing\(object, \{select: false\}\)/, "国家编辑入口必须同步当前编辑对象且不得重复选择");
assert.match(appSource, /onEdit: object => \{\s*const action = describeObjectDetailsActions\(object\)\.edit;[\s\S]*?OBJECT_DETAILS_EDIT_MODE\.INLINE_NAME[\s\S]*?startObjectEditing\(object, \{select: false\}\);[\s\S]*?OBJECT_DETAILS_EDIT_MODE\.DOMAIN_PANEL[\s\S]*?openObjectEditorFromDetails/, "对象详情编辑必须按显式能力路由到行内名称或真实领域面板");
assert.equal(describeObjectDetailsActions({kind: OBJECT_KIND.ROUTE}).edit?.mode, OBJECT_DETAILS_EDIT_MODE.DOMAIN_PANEL, "道路详情必须进入真实路线面板");
assert.equal(describeObjectDetailsActions({kind: OBJECT_KIND.RIVER}).edit?.mode, OBJECT_DETAILS_EDIT_MODE.DOMAIN_PANEL, "河流详情必须进入真实河流面板");
assert.equal(describeObjectDetailsActions({kind: OBJECT_KIND.CITY}).edit?.mode, OBJECT_DETAILS_EDIT_MODE.INLINE_NAME, "城镇详情应保留行内名称编辑");
assert.equal(describeObjectDetailsActions({kind: OBJECT_KIND.REGION}).edit, null, "没有真实编辑器的 region 不得显示伪编辑入口");
assert.equal(describeObjectDetailsActions({kind: OBJECT_KIND.TRADE_FLOW}).edit, null, "贸易流不得显示伪编辑入口");
assert.match(statePanelSource, /onEdit: row => \{[\s\S]*?callbacks\.onActiveChange\?\.\(nextActive\);[\s\S]*?if \(nextActive\) callbacks\.onEdit\?\.\(stateObject\(row\)\);[\s\S]*?\}/, "国家面板必须由 active 变化统一进入 / 退出画笔，只在进入时同步编辑对象");
assert.match(appSource, /statePanel = createStatePanel[\s\S]*?onActiveChange: active => \{[\s\S]*?CANVAS_TOOL_MODE\.STATE_BRUSH[\s\S]*?onEdit: object => \{\s*startObjectEditing\(object, \{/, "国家面板入口必须保持画笔与编辑对象的单向职责分工");

console.log(JSON.stringify({
  selectionEvents: events.length,
  directSelectionCalls: 2,
  batchEvents: 1,
  deletedObjectSelection: events.at(-3).snapshot.selection,
  preservedSourcePanelId: events.at(3).metadata.sourcePanelId,
  unifiedCanvasModeEntry: true,
  stateEditorEntry: "state-panel + state:brush + editingObject",
  objectDetailsPolicy: "inline-name | domain-panel | hidden"
}, null, 2));

function sourceBetween(start, end) {
  const startIndex = appSource.indexOf(start);
  const endIndex = appSource.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `无法读取源码片段：${start}`);
  return appSource.slice(startIndex, endIndex);
}
