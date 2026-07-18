import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {colorForProvince} from "../app/webgl-generator/src/renderer/color-modes.js";
import {createCanvasToolModeManager} from "../app/webgl-generator/src/runtime/canvas-tool-mode-manager.js";
import {restoreCanvasToolStrokePreview} from "../app/webgl-generator/src/runtime/canvas-tool-preview-rollback.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {applyHeightBrushPreview, createApplyHeightBrushCommand} from "../app/webgl-generator/src/runtime/height-edit-commands.js";
import {applyProvinceBrushPreview, createApplyProvinceBrushCommand} from "../app/webgl-generator/src/runtime/province-edit-commands.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appSource = await readFile(path.join(root, "app/webgl-generator/src/runtime/app.js"), "utf8");
const markerPanelSource = await readFile(path.join(root, "app/webgl-generator/src/ui/panels/marker-panel.js"), "utf8");
const measurementPanelSource = await readFile(path.join(root, "app/webgl-generator/src/ui/panels/measurement-panel.js"), "utf8");
const brushCursorSource = await readFile(path.join(root, "app/webgl-generator/src/ui/brush-cursor-preview.js"), "utf8");
assert.match(brushCursorSource, /HEIGHT_BRUSH_ACTIONS = new Set\(\["raise", "lower", "smooth", "flatten", "disrupt"\]\)/, "共享光标缺少高度动作白名单");
assert.ok(appSource.indexOf("state.brushCursorPreview = createBrushCursorPreview") < appSource.indexOf("bindHeightEditing(canvas, state, documentRef)"), "共享光标监听注册晚于编辑监听");

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
  "city:move",
  "culture:assign",
  "religion:assign",
  "biome:assign",
  "economy:market-assign",
  "measurement:draw",
  "marker:add",
  "marker:move",
  "route:draw",
  "route:edit-waypoint",
  "river:add",
  "lake:excavate",
  "feature:patch-select",
  "zone:add",
  "note:add"
];

testSingleActiveAndRepeatedEnter();
testCancelCompleteAndMetadata();
testReentrantTransitionQueue();
testEnterErrorCleanup();
testLifecycleCleanup();
testPreviewRollback();
testHeightBrushCommitAndCancel();
testProvinceBrushCommitAndCancel();
testRuntimeIntegrationContract();

console.log(`画布工具模式管理器回归通过：${expectedModes.length} 个模式，互斥 / 重入 / 取消 / 完成 / 异常 / 面板关闭 / 地图替换及高度 / 省份笔刷提交 / 取消契约完整。`);

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

function testHeightBrushCommitAndCancel() {
  const map = generatePlaceholderMap({seed: "canvas-tool-height-pointer", cellsTarget: 3000, heightmapTemplate: "continents"});
  const fixture = findHeightBrushFixture(map);
  const {gridCell, packCells, before, after} = fixture;
  const changes = [{gridCell, before, after}];
  const history = new EditHistory();
  const context = {map};
  const snapshotBefore = captureHeightSnapshot(map);

  applyHeightBrushPreview(map, changes);
  assert.equal(map.grid.cells.h[gridCell], after, "高度预览必须先更新 grid 高度");
  assert.ok(packCells.every(packCell => map.pack.cells.h[packCell] === after), "高度预览必须同步全部 pack 高度");
  assert.equal(history.getStats().undo, 0, "高度预览不得写入历史");

  history.execute(createApplyHeightBrushCommand(changes), context);
  assert.equal(history.getStats().undo, 1, "高度 pointerup 提交必须只增加一条历史");
  assert.equal(history.getStats().redo, 0, "高度 pointerup 提交不得产生重做残留");
  const snapshotAfter = captureHeightSnapshot(map);

  history.undo(context);
  assert.deepEqual(captureHeightSnapshot(map), snapshotBefore, "高度提交撤销必须恢复 grid / pack 高度");
  history.redo(context);
  assert.deepEqual(captureHeightSnapshot(map), snapshotAfter, "高度提交重做必须恢复 grid / pack 高度");
  history.undo(context);

  const historyBeforeCancel = history.getStats();
  applyHeightBrushPreview(map, changes);
  const rollback = restoreCanvasToolStrokePreview(map, "height", {originals: new Map([[gridCell, before]])});
  assert.deepEqual(rollback, {restoredGridCells: 1, restoredPackCells: packCells.length}, "高度 pointercancel 必须恢复完整 grid / pack 预览");
  assert.deepEqual(captureHeightSnapshot(map), snapshotBefore, "高度 pointercancel 必须恢复取消前完整快照");
  assert.deepEqual(history.getStats(), historyBeforeCancel, "高度 pointercancel 不得改变历史深度或状态");
}

function findHeightBrushFixture(map) {
  for (let gridCell = 0; gridCell < map.grid.cells.h.length; gridCell++) {
    const before = Number(map.grid.cells.h[gridCell]);
    if (before < 20) continue;
    const after = before < 100 ? before + 1 : before - 1;
    const packCells = [];
    for (let packCell = 0; packCell < map.pack.cells.g.length; packCell++) {
      if (Number(map.pack.cells.g[packCell]) === gridCell) packCells.push(packCell);
    }
    if (packCells.length && packCells.every(packCell => Number(map.pack.cells.h[packCell]) === before)) {
      return {gridCell, packCells, before, after};
    }
  }
  throw new Error("固定 seed 没有找到 grid / pack 高度一致的普通笔刷样本");
}

function captureHeightSnapshot(map) {
  return {
    grid: Array.from(map.grid.cells.h),
    pack: Array.from(map.pack.cells.h)
  };
}

function testProvinceBrushCommitAndCancel() {
  const map = generatePlaceholderMap({seed: "canvas-tool-province-pointer", cellsTarget: 3000, heightmapTemplate: "continents"});
  const fixture = findProvinceBrushFixture(map);
  const {gridCell, packCells, sourceProvince, targetProvince} = fixture;
  const sourceProvinceId = sourceProvince.i;
  const targetProvinceId = targetProvince.i;
  const changes = [{gridCell, before: sourceProvinceId, after: targetProvinceId}];
  const history = new EditHistory();
  const context = {map};
  const before = captureProvinceOwnershipSnapshot(map, fixture);
  const sourceColor = colorForProvince(sourceProvinceId, map);
  const targetColor = colorForProvince(targetProvinceId, map);

  assert.equal(sourceProvince.state, targetProvince.state, "省份笔刷样本必须是同国两省");
  assert.notDeepEqual(sourceColor, targetColor, "省份笔刷样本必须能区分两省颜色");
  assertProvinceSummaryMatchesPack(map, sourceProvinceId);
  assertProvinceSummaryMatchesPack(map, targetProvinceId);

  applyProvinceBrushPreview(map, changes);
  assert.equal(map.grid.cells.province[gridCell], targetProvinceId, "省份预览必须先更新 grid 归属");
  assert.ok(packCells.every(packCell => map.pack.cells.province[packCell] === targetProvinceId), "省份预览必须同步全部陆地 pack 归属");
  assert.equal(history.getStats().undo, 0, "省份预览不得写入历史");

  const command = createApplyProvinceBrushCommand(changes);
  assert.equal(command.effects.runtimeStats, true, "省份提交必须刷新运行时统计");
  for (const effect of ["province-cells", "province-statistics", "cell-colors"]) {
    assert.ok(command.effects.derived.includes(effect), `省份提交缺少派生刷新：${effect}`);
  }
  history.execute(command, context);
  assert.equal(history.getStats().undo, 1, "省份 pointerup 提交必须只增加一条历史");
  assert.equal(history.getStats().redo, 0, "省份 pointerup 提交不得产生重做残留");
  assertProvinceSummaryMatchesPack(map, sourceProvinceId);
  assertProvinceSummaryMatchesPack(map, targetProvinceId);
  assert.deepEqual(colorForProvince(map.grid.cells.province[gridCell], map), targetColor, "省份提交后的 cell 颜色必须来自目标省份");
  assert.equal(map.politics.provinces[sourceProvinceId].color, sourceProvince.color, "省份提交不得改写来源省份颜色");
  assert.equal(map.politics.provinces[targetProvinceId].color, targetProvince.color, "省份提交不得改写目标省份颜色");
  const after = captureProvinceOwnershipSnapshot(map, fixture);

  history.undo(context);
  assert.deepEqual(captureProvinceOwnershipSnapshot(map, fixture), before, "省份提交撤销必须完整恢复归属、统计、颜色与关联城市");
  history.redo(context);
  assert.deepEqual(captureProvinceOwnershipSnapshot(map, fixture), after, "省份提交重做必须完整恢复归属、统计、颜色与关联城市");
  history.undo(context);

  const historyBeforeCancel = history.getStats();
  applyProvinceBrushPreview(map, changes);
  const rollback = restoreCanvasToolStrokePreview(map, "province", {originals: new Map([[gridCell, sourceProvinceId]])});
  assert.deepEqual(rollback, {restoredGridCells: 1, restoredPackCells: packCells.length}, "省份 pointercancel 必须恢复完整 grid / pack 预览");
  assert.deepEqual(captureProvinceOwnershipSnapshot(map, fixture), before, "省份 pointercancel 必须恢复取消前完整快照");
  assert.deepEqual(history.getStats(), historyBeforeCancel, "省份 pointercancel 不得改变历史深度或状态");
}

function findProvinceBrushFixture(map) {
  const provinces = map.politics.provinces.filter(province => province?.i && !province.removed);
  for (const sourceProvince of provinces) {
    if (sourceProvince.cells < 2) continue;
    const targetProvince = provinces.find(candidate => candidate.i !== sourceProvince.i
      && candidate.state === sourceProvince.state
      && candidate.color !== sourceProvince.color);
    if (!targetProvince) continue;
    for (let gridCell = 0; gridCell < map.grid.cells.province.length; gridCell++) {
      if (map.grid.cells.h[gridCell] < 20 || map.grid.cells.province[gridCell] !== sourceProvince.i) continue;
      const packCells = [];
      for (let packCell = 0; packCell < map.pack.cells.g.length; packCell++) {
        if (map.pack.cells.g[packCell] === gridCell && map.pack.cells.h[packCell] >= 20) packCells.push(packCell);
      }
      if (!packCells.length || packCells.some(packCell => map.pack.cells.province[packCell] !== sourceProvince.i)) continue;
      return {gridCell, packCells, sourceProvince, targetProvince};
    }
  }
  throw new Error("固定 seed 没有找到颜色不同的同国两省笔刷样本");
}

function captureProvinceOwnershipSnapshot(map, fixture) {
  const provinceIds = [fixture.sourceProvince.i, fixture.targetProvince.i];
  return {
    grid: Array.from(map.grid.cells.province),
    pack: Array.from(map.pack.cells.province),
    provinces: provinceIds.map(provinceId => structuredClone(map.politics.provinces[provinceId])),
    packProvinces: provinceIds.map(provinceId => structuredClone(map.pack.provinces[provinceId])),
    cities: (map.settlements.cities || []).filter(Boolean).map(city => ({id: city.id, province: city.province, provincial: city.provincial})),
    changedCellColor: colorForProvince(map.grid.cells.province[fixture.gridCell], map)
  };
}

function assertProvinceSummaryMatchesPack(map, provinceId) {
  let cells = 0;
  let area = 0;
  const neighbors = new Set();
  for (const packCell of map.pack.cells.i) {
    if (map.pack.cells.h[packCell] < 20 || map.pack.cells.province[packCell] !== provinceId) continue;
    cells++;
    area += map.pack.cells.area?.[packCell] || 0;
    for (const neighbor of map.pack.cells.c?.[packCell] || []) {
      if (map.pack.cells.h[neighbor] < 20) continue;
      const neighborProvinceId = map.pack.cells.province[neighbor];
      if (neighborProvinceId && neighborProvinceId !== provinceId) neighbors.add(neighborProvinceId);
    }
  }
  const province = map.politics.provinces[provinceId];
  assert.equal(province.cells, cells, `省份 #${provinceId} cells 统计必须匹配 pack 归属`);
  assert.equal(province.area, Math.round(area * 100) / 100, `省份 #${provinceId} area 统计必须匹配 pack 归属`);
  assert.deepEqual([...province.neighbors].sort((a, b) => a - b), [...neighbors].sort((a, b) => a - b), `省份 #${provinceId} 邻省派生必须匹配 pack 邻接`);
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
  const heightBinding = sourceBetween(appSource, "function bindHeightEditing", "function updateHeightFillPreviewAtEvent");
  const heightPointerUp = sourceBetween(heightBinding, 'canvas.addEventListener("pointerup"', 'canvas.addEventListener("pointercancel"');
  const heightPointerCancel = heightBinding.slice(heightBinding.indexOf('canvas.addEventListener("pointercancel"'));
  assert.match(heightPointerUp, /finishHeightStroke\(state, documentRef\)/, "高度 pointerup 必须正式提交笔刷");
  assert.doesNotMatch(heightPointerUp, /rollbackCanvasToolStroke\(state, "height"\)/, "高度 pointerup 不得回滚预览");
  assert.match(heightPointerCancel, /rollbackCanvasToolStroke\(state, "height"\)/, "高度 pointercancel 必须完整回滚预览");
  assert.doesNotMatch(heightPointerCancel, /finishHeightStroke\(state, documentRef\)/, "高度 pointercancel 不得提交历史");
  const provinceBinding = sourceBetween(appSource, "function bindProvinceEditing", "function bindSocialAssignmentEditing");
  const provincePointerUp = sourceBetween(provinceBinding, 'canvas.addEventListener("pointerup"', 'canvas.addEventListener("pointercancel"');
  const provincePointerCancel = provinceBinding.slice(provinceBinding.indexOf('canvas.addEventListener("pointercancel"'));
  assert.match(provincePointerUp, /finishProvinceStroke\(state, documentRef\)/, "省份 pointerup 必须正式提交笔刷");
  assert.doesNotMatch(provincePointerUp, /rollbackCanvasToolStroke\(state, "province"\)/, "省份 pointerup 不得回滚预览");
  assert.match(provincePointerCancel, /rollbackCanvasToolStroke\(state, "province"\)/, "省份 pointercancel 必须完整回滚预览");
  assert.doesNotMatch(provincePointerCancel, /finishProvinceStroke\(state, documentRef\)/, "省份 pointercancel 不得提交历史");
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
