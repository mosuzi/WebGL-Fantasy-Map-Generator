import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  beginDirectManipulationSession,
  cancelAllDirectManipulationSessions,
  getDirectManipulationSessionSnapshot
} from "../app/webgl-generator/src/runtime/direct-manipulation-session.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = await Promise.all([
  "app/webgl-generator/src/runtime/app.js",
  "app/webgl-generator/src/ui/panel-manager.js",
  "app/webgl-generator/src/ui/vue/components/base/UiActionDock.vue",
  "app/webgl-generator/src/ui/vue/composables/use-draggable-floating-panel.js",
  "app/webgl-generator/src/ui/vue/components/base/UiObjectTable.vue",
  "app/webgl-generator/src/ui/vue/components/HeightPanel.vue",
  "app/webgl-generator/src/ui/vue/components/ControlPanel.vue",
  "app/webgl-generator/src/ui/panels/label-naming-panel.js"
].map(file => readFile(path.join(root, file), "utf8")));
const [appSource, panelSource, dockSource, floatingSource, tableSource, heightSource, controlSource, labelPanelSource] = files;

testCommitAndRollback();
testGlobalCancellation();
testScopedCancellation();
testRuntimeConnections();

console.log("直接操控会话回归通过：六类路径统一接入，仅 pointerup 提交，取消 / 捕获丢失 / 关面板 / 换图 / 卸载回滚且清理幂等。");

function testCommitAndRollback() {
  const events = [];
  const capture = fakeCapture();
  const committed = beginDirectManipulationSession({
    kind: "commit",
    pointerId: 1,
    captureTarget: capture,
    onCommit: () => events.push("commit"),
    onRollback: () => events.push("rollback"),
    onCleanup: () => events.push("cleanup")
  });
  assert.equal(committed.finish("pointerup"), true);
  assert.equal(committed.finish("pointercancel"), false);
  assert.deepEqual(events, ["commit", "cleanup"]);
  assert.deepEqual(capture.released, [1]);

  const cancelled = beginDirectManipulationSession({
    kind: "rollback",
    onCommit: () => events.push("bad-commit"),
    onRollback: ({reason}) => events.push(reason),
    onCleanup: () => events.push("cancel-cleanup")
  });
  assert.equal(cancelled.finish("lostpointercapture"), true);
  assert.deepEqual(events.slice(-2), ["lostpointercapture", "cancel-cleanup"]);
}

function testGlobalCancellation() {
  const reasons = [];
  for (const kind of ["label", "measurement", "panel", "dock", "floating", "column"]) {
    beginDirectManipulationSession({kind, onRollback: ({reason}) => reasons.push(`${kind}:${reason}`)});
  }
  assert.equal(getDirectManipulationSessionSnapshot().length, 6);
  assert.equal(cancelAllDirectManipulationSessions("map-replace"), 6);
  assert.equal(cancelAllDirectManipulationSessions("map-replace"), 0);
  assert.equal(reasons.every(value => value.endsWith(":map-replace")), true);
}

function testScopedCancellation() {
  const leftScope = {};
  const rightScope = {};
  const reasons = [];
  beginDirectManipulationSession({kind: "left", scopeElement: leftScope, onRollback: ({reason}) => reasons.push(`left:${reason}`)});
  beginDirectManipulationSession({kind: "right", scopeElement: rightScope, onRollback: ({reason}) => reasons.push(`right:${reason}`)});
  beginDirectManipulationSession({kind: "label", ownerId: "label-naming-panel", onRollback: ({reason}) => reasons.push(`label:${reason}`)});
  assert.equal(cancelAllDirectManipulationSessions("panel-close", {scopeElement: leftScope}), 1);
  assert.deepEqual(reasons, ["left:panel-close"]);
  assert.equal(cancelAllDirectManipulationSessions("panel-close", {ownerId: "label-naming-panel"}), 1);
  assert.deepEqual(reasons, ["left:panel-close", "label:panel-close"]);
  assert.equal(getDirectManipulationSessionSnapshot().length, 1);
  assert.equal(cancelAllDirectManipulationSessions("cleanup"), 1);
}

function testRuntimeConnections() {
  assert.match(appSource, /cancelAllDirectManipulationSessions\("map-replace"\)[\s\S]{0,120}?canvasToolModes\.reset\("map-replace"\)/);
  assert.match(appSource, /async function loadMapIntoRuntime[\s\S]{0,500}?pendingCustomLabelPlacement = null[\s\S]{0,120}?customLabelDrag = null/);
  assert.match(appSource, /kind: "measurement-point"[\s\S]{0,900}?onRollback:/);
  assert.match(appSource, /kind: "custom-label"[\s\S]{0,500}?onCommit:[\s\S]{0,200}?onRollback:/);
  assert.match(appSource, /ownerId: "label-naming-panel"/);
  assert.match(appSource, /cancelAllDirectManipulationSessions\("panel-close", \{ownerId: "label-naming-panel"\}\)[\s\S]{0,120}?pendingCustomLabelPlacement = null/);
  assert.match(labelPanelSource, /onClose: \(\) => \{[\s\S]{0,120}?callbacks\.onClose\?\.\(\)/);
  assert.match(panelSource, /kind: "panel-manager"[\s\S]{0,500}?onCommit:[\s\S]{0,400}?onRollback:/);
  assert.match(panelSource, /cancelAllDirectManipulationSessions\("panel-close", \{scopeElement: record\.panel\}\)/);
  assert.match(panelSource, /new CustomEventCtor\("fmg:panel-close"/);
  assert.match(panelSource, /lostpointercapture/);
  assert.match(dockSource, /kind: "ui-action-dock"[\s\S]{0,500}?onRollback:/);
  assert.match(dockSource, /scopeElement: root\.value\?\.closest\("\.floating-panel"\) \|\| null/);
  assert.match(dockSource, /cancel\("panel-close"\)|cancel\("unmount"\)/);
  assert.match(floatingSource, /kind: "vue-floating-panel"[\s\S]{0,500}?onCommit:[\s\S]{0,200}?onRollback:/);
  assert.match(tableSource, /kind: "object-table-column"/);
  assert.doesNotMatch(sourceBetween(tableSource, "function handleColumnResizeMove", "function stopColumnResize"), /emit\("column-resize"/);
  assert.match(tableSource, /onCommit:[\s\S]{0,200}?emit\("column-resize"/);
  assert.match(heightSource, /kind: "height-workbench"[\s\S]{0,500}?onRollback:/);
  assert.match(heightSource, /lostpointercapture/);
  assert.match(controlSource, /watch\(exportPanelOpen,[\s\S]{0,120}?stopExportPanelDrag/);
}

function sourceBetween(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from);
  return source.slice(from, to);
}

function fakeCapture() {
  return {
    released: [],
    hasPointerCapture: () => true,
    releasePointerCapture(pointerId) {
      this.released.push(pointerId);
    }
  };
}
