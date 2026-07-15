import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {createCanvasToolModeManager} from "../app/webgl-generator/src/runtime/canvas-tool-mode-manager.js";
import {restoreCanvasToolStrokePreview} from "../app/webgl-generator/src/runtime/canvas-tool-preview-rollback.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appSource = await readFile(path.join(root, "app/webgl-generator/src/runtime/app.js"), "utf8");
const markerPanelSource = await readFile(path.join(root, "app/webgl-generator/src/ui/panels/marker-panel.js"), "utf8");
const measurementPanelSource = await readFile(path.join(root, "app/webgl-generator/src/ui/panels/measurement-panel.js"), "utf8");

const expectedModes = [
  "height:brush",
  "state:brush",
  "state:add",
  "state:delete",
  "province:brush",
  "province:add",
  "province:delete",
  "city:add",
  "city:delete",
  "culture:assign",
  "religion:assign",
  "measurement:draw",
  "marker:add",
  "marker:move",
  "route:draw",
  "river:add",
  "lake:excavate",
  "zone:add",
  "note:add"
];

testSingleActiveAndRepeatedEnter();
testCancelCompleteAndMetadata();
testReentrantTransitionQueue();
testEnterErrorCleanup();
testLifecycleCleanup();
testPreviewRollback();
testRuntimeIntegrationContract();

console.log(`画布工具模式管理器回归通过：${expectedModes.length} 个模式，互斥 / 重入 / 取消 / 完成 / 异常 / 面板关闭 / 地图替换契约完整。`);

function testSingleActiveAndRepeatedEnter() {
  const manager = createCanvasToolModeManager();
  const events = [];
  for (const id of expectedModes) {
    manager.register(id, {
      allowedPanelIds: [`${id.split(":")[0]}-panel`],
      onEnter: () => events.push(`enter:${id}`),
      onRepeat: ({context}) => events.push(`repeat:${id}:${context.variant || "same"}`),
      onCancel: ({reason}) => events.push(`cancel:${id}:${reason}`)
    });
  }
  const first = manager.enter(expectedModes[0]);
  assert.equal(first.changed, true);
  assert.equal(manager.getActive().id, expectedModes[0]);
  const repeated = manager.enter(expectedModes[0], {variant: "updated"});
  assert.equal(repeated.changed, false);
  assert.equal(events.filter(event => event === `enter:${expectedModes[0]}`).length, 1);
  assert.equal(manager.getActive().context.variant, "updated");
  assert.equal(events.includes(`repeat:${expectedModes[0]}:updated`), true);

  for (const id of expectedModes.slice(1)) {
    manager.enter(id);
    assert.equal(manager.getActive().id, id);
  }
  assert.equal(events.filter(event => event.startsWith("cancel:")).length, expectedModes.length - 1);
  assert.equal(manager.getSnapshot().registeredModeIds.length, expectedModes.length);
}

function testCancelCompleteAndMetadata() {
  const manager = createCanvasToolModeManager();
  let completionHooks = 0;
  let historyCommands = 0;
  manager.register("city:add", {
    allowedPanelIds: ["city-panel", "city-panel"],
    onComplete: ({detail}) => {
      completionHooks++;
      assert.equal(detail.command, "新增城市");
    }
  });
  manager.register("measurement:draw", {locksInteraction: false, allowedPanelIds: ["measurement-panel"]});

  manager.enter("city:add");
  historyCommands++;
  assert.deepEqual(manager.getActive().allowedPanelIds, ["city-panel"]);
  assert.equal(manager.complete("city:add", {command: "新增城市"}).changed, true);
  assert.equal(manager.complete("city:add", {command: "重复完成"}).changed, false);
  assert.equal(historyCommands, 1);
  assert.equal(completionHooks, 1);
  assert.equal(manager.getActive(), null);

  manager.enter("measurement:draw");
  assert.equal(manager.getActive().locksInteraction, false);
  assert.equal(manager.cancel("city:add", "panel-close").changed, false);
  assert.equal(manager.reset("map-replace").changed, true);
  assert.equal(manager.getSnapshot().lastTransition.reason, "map-replace");
}

function testReentrantTransitionQueue() {
  const manager = createCanvasToolModeManager();
  const events = [];
  manager.register("height:brush", {
    onCancel: () => {
      events.push("height:cancel");
      manager.enter("culture:assign");
    }
  });
  manager.register("state:brush", {onEnter: () => events.push("state:enter"), onCancel: () => events.push("state:cancel")});
  manager.register("culture:assign", {onEnter: () => events.push("culture:enter")});
  manager.enter("height:brush");
  manager.enter("state:brush");
  assert.equal(manager.getActive().id, "culture:assign");
  assert.deepEqual(events, ["height:cancel", "state:enter", "state:cancel", "culture:enter"]);
  assert.equal(manager.getSnapshot().transitioning, false);
}

function testEnterErrorCleanup() {
  const manager = createCanvasToolModeManager();
  const events = [];
  manager.register("marker:add", {
    onEnter: () => {
      events.push("enter");
      throw new Error("模拟进入失败");
    },
    onCancel: ({reason}) => events.push(`cleanup:${reason}`),
    onError: ({phase}) => events.push(`error:${phase}`)
  });
  assert.throws(() => manager.enter("marker:add"), /模拟进入失败/);
  assert.equal(manager.getActive(), null);
  assert.deepEqual(events, ["enter", "cleanup:enter-error", "error:onEnter"]);
  assert.equal(manager.getSnapshot().lastTransition.type, "error");

  const repeatManager = createCanvasToolModeManager();
  let repeatCleanup = 0;
  repeatManager.register("marker:add", {
    onRepeat: () => {
      throw new Error("模拟重复进入失败");
    },
    onCancel: ({reason}) => {
      if (reason === "repeat-error") repeatCleanup++;
    }
  });
  repeatManager.enter("marker:add");
  assert.throws(() => repeatManager.enter("marker:add", {type: "forest"}), /模拟重复进入失败/);
  assert.equal(repeatManager.getActive(), null);
  assert.equal(repeatCleanup, 1);
}

function testLifecycleCleanup() {
  const manager = createCanvasToolModeManager();
  const states = Object.fromEntries(expectedModes.map(id => [id, {active: false, preview: false, lock: false, exitReason: null}]));
  for (const id of expectedModes) {
    manager.register(id, {
      onEnter: () => Object.assign(states[id], {active: true, preview: true, lock: id !== "measurement:draw"}),
      onCancel: ({reason}) => Object.assign(states[id], {active: false, preview: false, lock: false, exitReason: reason}),
      onComplete: ({reason}) => Object.assign(states[id], {active: false, preview: false, lock: false, exitReason: reason})
    });
  }

  manager.enter("height:brush");
  manager.enter("state:brush");
  assert.deepEqual(states["height:brush"], {active: false, preview: false, lock: false, exitReason: "switch"});
  assert.equal(states["state:brush"].active, true);
  assert.equal(Object.values(states).filter(value => value.active).length, 1);

  manager.cancel("state:brush", "panel-close");
  assert.deepEqual(states["state:brush"], {active: false, preview: false, lock: false, exitReason: "panel-close"});
  manager.enter("culture:assign");
  manager.reset("map-replace");
  assert.deepEqual(states["culture:assign"], {active: false, preview: false, lock: false, exitReason: "map-replace"});
  assert.equal(Object.values(states).some(value => value.preview || value.lock), false);
}

function testPreviewRollback() {
  const map = {
    grid: {cells: {
      h: [91, 50],
      state: [9, 2],
      province: [8, 4],
      culture: [7, 6],
      religion: [5, 4]
    }},
    pack: {cells: {
      g: [0, 0, 1],
      h: [91, 91, 50],
      state: [9, 9, 2],
      province: [8, 8, 4],
      culture: [7, 7, 6],
      religion: [5, 5, 4]
    }}
  };
  assert.deepEqual(
    restoreCanvasToolStrokePreview(map, "height", {originals: new Map([[0, 31]])}),
    {restoredGridCells: 1, restoredPackCells: 2}
  );
  assert.deepEqual([map.grid.cells.h[0], ...map.pack.cells.h.slice(0, 2)], [31, 31, 31]);

  restoreCanvasToolStrokePreview(map, "state", {originals: new Map([[0, 1]])});
  restoreCanvasToolStrokePreview(map, "province", {originals: new Map([[0, 3]])});
  assert.deepEqual([map.grid.cells.state[0], ...map.pack.cells.state.slice(0, 2)], [1, 1, 1]);
  assert.deepEqual([map.grid.cells.province[0], ...map.pack.cells.province.slice(0, 2)], [3, 3, 3]);

  const cultureStroke = {originals: new Map([[0, {gridBefore: 2, packBefore: [{packCell: 0, before: 2}, {packCell: 1, before: 3}]}]])};
  restoreCanvasToolStrokePreview(map, "culture", cultureStroke);
  assert.deepEqual([map.grid.cells.culture[0], ...map.pack.cells.culture.slice(0, 2)], [2, 2, 3]);
  const religionStroke = {originals: new Map([[0, {gridBefore: 1, packBefore: [{packCell: 0, before: 1}, {packCell: 1, before: 2}]}]])};
  restoreCanvasToolStrokePreview(map, "religion", religionStroke);
  assert.deepEqual([map.grid.cells.religion[0], ...map.pack.cells.religion.slice(0, 2)], [1, 1, 2]);
}

function testRuntimeIntegrationContract() {
  for (const id of expectedModes) assert.match(appSource, new RegExp(escapeRegex(`"${id}"`)), `缺少模式常量：${id}`);
  assert.match(appSource, /registerCanvasToolModes\(state, documentRef, \{stopObjectEditing\}\)/);
  assert.match(appSource, /state\.canvasToolModes\.reset\("map-replace"\)/);
  assert.match(appSource, /function rollbackCanvasToolStroke\(state, kind\)/);
  assert.match(appSource, /restoreCanvasToolStrokePreview\(state\.map, kind, stroke\)/);
  for (const kind of ["height", "state", "province"]) {
    assert.match(appSource, new RegExp(escapeRegex(`rollbackCanvasToolStroke(state, "${kind}")`)));
  }
  assert.match(appSource, /function registerSocialAssignmentMode[\s\S]{0,900}?rollbackCanvasToolStroke\(state, kind\)/);
  assert.equal(countMatches(appSource, /completeCanvasToolMode\(state,[\s\S]{0,160}?CANVAS_TOOL_MODE\.(?:STATE|PROVINCE|CITY)_(?:ADD|DELETE)/g), 6);
  assert.match(appSource, /const activeModeId = state\.markerEdit\.mode === "move"[\s\S]{0,700}?completeCanvasToolMode\(state, documentRef, activeModeId/);
  assert.match(appSource, /function bindObjectCreationTools[\s\S]*?CANVAS_TOOL_MODE\.ROUTE_DRAW[\s\S]*?CANVAS_TOOL_MODE\.RIVER_ADD[\s\S]*?CANVAS_TOOL_MODE\.LAKE_EXCAVATE[\s\S]*?CANVAS_TOOL_MODE\.ZONE_ADD[\s\S]*?CANVAS_TOOL_MODE\.NOTE_ADD/);
  assert.match(appSource, /canvasToolMode: state\.canvasToolModes\.getSnapshot\(\)/);
  assert.match(appSource, /return Boolean\(state\.canvasToolModes\.getActive\(\)\?\.locksInteraction \|\| state\.editingObject\)/);
  assert.match(markerPanelSource, /onClose:[\s\S]{0,120}?callbacks\.onClose\?\.\(\)/);
  assert.match(measurementPanelSource, /onClose:[\s\S]{0,120}?callbacks\.onClose\?\.\(\)/);
  assert.match(appSource, /stopMarkerEditMode\(state, documentRef, "panel-close"\)/);
  assert.match(appSource, /stopMeasurementMode\(state, documentRef, "panel-close"\)/);
  const measurementStop = sourceBetween(appSource, "function stopMeasurementMode", "function bindMeasurementTool");
  const markerStop = sourceBetween(appSource, "function stopMarkerEditMode", "function clearMarkerEditMode");
  assert.doesNotMatch(measurementStop, /setFileOperationStatus/, "退出测量不得写入错误的完成提示");
  assert.doesNotMatch(markerStop, /setFileOperationStatus/, "退出标记不得写入错误的完成提示");
}

function countMatches(value, pattern) {
  return [...value.matchAll(pattern)].length;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.equal(startIndex >= 0 && endIndex > startIndex, true, `无法读取源码片段：${start}`);
  return source.slice(startIndex, endIndex);
}
