#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {
  PanelManager,
  chooseLaterOpenedPanelRole,
  chooseRemainingPanelLeft,
  constrainPanelRuntimePosition,
  normalizePanelPositionState,
  panelDragHasMoved,
  restoreManagedPanelViewportOrigin
} from "../app/webgl-generator/src/ui/panel-manager.js";

const defaults = {left: 24, top: 36};
assert.deepEqual(normalizePanelPositionState(null, defaults), {positionMode: "auto", ...defaults}, "无记录必须回退默认自动位置");
assert.deepEqual(
  normalizePanelPositionState({left: 180, top: 96, width: 420, open: true}, defaults),
  {left: 180, top: 96, width: 420, open: true, positionMode: "manual"},
  "旧版有限坐标必须保守迁移为手动偏好"
);
assert.deepEqual(
  normalizePanelPositionState({positionMode: "manual", left: 240, top: 128, openedAt: 9}, defaults),
  {positionMode: "manual", left: 240, top: 128, openedAt: 9},
  "合法手动记录必须保留偏好"
);
for (const state of [
  {positionMode: "auto", left: 900, top: 500},
  {positionMode: "floating", left: 180, top: 96},
  {positionMode: "manual", left: null, top: 96}
]) {
  const normalized = normalizePanelPositionState(state, defaults);
  assert.equal(normalized.positionMode, "auto", "非法模式或坐标必须回退 auto");
  assert.deepEqual([normalized.left, normalized.top], [24, 36], "auto 必须使用面板默认坐标");
}

const preferred = {left: 650, top: 500};
const constrained = constrainPanelRuntimePosition({
  ...preferred,
  hostWidth: 500,
  hostHeight: 300,
  panelWidth: 320,
  headerHeight: 44
});
assert.deepEqual(constrained, {left: 172, top: 248}, "窄视口只应把运行时位置钳制到标题栏与关闭按钮可达");
const restored = constrainPanelRuntimePosition({
  ...preferred,
  hostWidth: 1280,
  hostHeight: 720,
  panelWidth: 320,
  headerHeight: 44
});
assert.deepEqual(restored, preferred, "视口恢复后必须能从原偏好坐标恢复");
const farLeft = constrainPanelRuntimePosition({left: -1000, top: -100, hostWidth: 500, hostHeight: 300, panelWidth: 320, headerHeight: 44});
assert.deepEqual(farLeft, {left: -256, top: 8}, "最小钳制必须保留可操作标题区域而非强制完整回正");

assert.equal(chooseRemainingPanelLeft({hostWidth: 1280, protectedLeft: 8, protectedWidth: 560, movingWidth: 320}), 952, "手动主面板在左侧时详情应移到右侧");
assert.equal(chooseRemainingPanelLeft({hostWidth: 1280, protectedLeft: 712, protectedWidth: 560, movingWidth: 320}), 8, "手动主面板在右侧时详情应移到左侧");
assert.equal(chooseRemainingPanelLeft({hostWidth: 1280, protectedLeft: 360, protectedWidth: 560, movingWidth: 320}), 8, "手动主面板在中央时详情应选择可容纳的剩余侧");
assert.equal(chooseRemainingPanelLeft({hostWidth: 1280, protectedLeft: 8, protectedWidth: 320, movingWidth: 560, prefer: "right"}), 712, "手动详情在左侧时自动主面板应移到右侧");
assert.equal(chooseLaterOpenedPanelRole(2, 1), "main", "主面板序号更大时必须保留主面板");
assert.equal(chooseLaterOpenedPanelRole(1, 2), "detail", "详情序号更大时必须保留详情");
assert.equal(chooseLaterOpenedPanelRole(0, 0), "detail", "初始化或同序号必须稳定保留详情");

assert.equal(panelDragHasMoved(100, 80, 100, 80), false, "仅点按不得切换手动模式");
assert.equal(panelDragHasMoved(100, 80, 100.2, 80.2), false, "亚阈值抖动不得切换手动模式");
assert.equal(panelDragHasMoved(100, 80, 101, 80), true, "实际位移必须切换手动模式");

let viewportRestoreCalls = 0;
const scrolledWindow = {
  scrollX: 0,
  scrollY: 124.44,
  scrollTo(x, y) {
    viewportRestoreCalls++;
    this.scrollX = x;
    this.scrollY = y;
  }
};
assert.equal(restoreManagedPanelViewportOrigin(scrolledWindow), true, "受管面板交互必须恢复 document viewport 原点");
assert.deepEqual([scrolledWindow.scrollX, scrolledWindow.scrollY, viewportRestoreCalls], [0, 0, 1]);
assert.equal(restoreManagedPanelViewportOrigin(scrolledWindow), false, "viewport 已在原点时不得重复写入");
assert.equal(viewportRestoreCalls, 1, "原点守卫必须幂等");
assert.equal(restoreManagedPanelViewportOrigin({scrollX: 0, scrollY: 80}), false, "无 scrollTo 的 fake window 必须安全跳过");

const writes = [];
const manager = Object.create(PanelManager.prototype);
manager.panels = new Map();
manager.readPanelState = () => ({positionMode: "manual", left: 120, top: 88, openedAt: 11});
manager.writePanelState = (id, state) => writes.push({id, state});
manager.readLastMainPanelId = () => null;
manager.writeLastMainPanelId = () => {};
const runtimePanel = {
  classList: {contains: name => name === "hidden" ? false : false},
  style: {left: "860px", top: "244px", width: "560px"},
  offsetWidth: 560
};
manager.panels.set("state-panel", {
  panel: runtimePanel,
  persistOpen: true,
  role: "main",
  positionMode: "auto",
  preferredLeft: 24,
  preferredTop: 24,
  defaultLeft: 24,
  defaultTop: 24
});
manager.savePanelState("state-panel");
assert.equal(writes[0].state.positionMode, "auto");
assert.deepEqual([writes[0].state.left, writes[0].state.top], [24, 24], "自动重排后的 DOM 坐标不得污染持久化偏好");

writes.length = 0;
manager.panels.set("object-details", {
  panel: {...runtimePanel, classList: {contains: () => false}},
  persistOpen: false,
  role: "detail",
  positionMode: "manual",
  preferredLeft: 48,
  preferredTop: 72,
  defaultLeft: 24,
  defaultTop: 24
});
manager.savePanelState("object-details");
assert.deepEqual([writes[0].state.left, writes[0].state.top], [48, 72], "persistOpen:false 详情仍应保存位置偏好");
assert.equal(Object.hasOwn(writes[0].state, "open"), false, "persistOpen:false 详情不得写 open");

assert.equal(runNarrowReflow({mainSequence: 1, detailSequence: 2}), "main-panel", "桌面共存缩窄后必须关闭较早打开的主面板");
assert.equal(runNarrowReflow({mainSequence: 3, detailSequence: 2}), "object-details", "桌面共存缩窄后必须关闭较早打开的详情");
assert.equal(runNarrowReflow({mainSequence: 0, detailSequence: 0}), "main-panel", "同序号必须按稳定规则关闭主面板");

const managerSource = await readFile(new URL("../app/webgl-generator/src/ui/panel-manager.js", import.meta.url), "utf8");
const pointerUpSource = sourceBetween(managerSource, 'handle.addEventListener("pointerup"', 'handle.addEventListener("pointercancel"');
const pointerCancelSource = sourceBetween(managerSource, 'handle.addEventListener("pointercancel"', "function writePanelRuntimePosition");
const saveSource = sourceBetween(managerSource, "  savePanelState(id) {", "  readPanelState(id");
const toolbarSource = sourceBetween(managerSource, "keepPanelClearOfToolbar(record)", "visiblePanelByRole(role)");
assert.match(pointerUpSource, /panelDragHasMoved[\s\S]*commitManualPosition/, "pointerup 必须只在实际位移后提交手动偏好");
assert.doesNotMatch(pointerCancelSource, /savePanelState|commitManualPosition/, "pointercancel 不得提交新手动偏好");
assert.match(pointerCancelSource, /startLeft[\s\S]*startTop[\s\S]*reflowPanels/, "pointercancel 必须恢复拖动开始位置并重排");
assert.match(saveSource, /preferredLeft[\s\S]*preferredTop/, "持久化必须读取偏好坐标");
assert.doesNotMatch(saveSource, /parseFloat\(record\.panel\.style\.(left|top)\)/, "持久化不得从运行时 DOM 反推偏好");
assert.match(toolbarSource, /PANEL_POSITION_MANUAL[\s\S]*applyPreferredPosition[\s\S]*return/, "手动面板必须跳过工具栏强制避让");
assert.match(managerSource, /ResizeObserverCtor[\s\S]{0,500}?reflowPanels\(\)/, "ResizeObserver 只能触发运行时重排");
assert.match(managerSource, /if \(panel\.style\.left !== left\)[\s\S]{0,100}?if \(panel\.style\.top !== top\)/, "运行时 style 写入必须保持幂等");
assert.match(managerSource, /record\.openSequence = \+\+this\.openSequence/, "每次 open 必须更新仅运行时序号");
assert.match(managerSource, /chooseLaterOpenedPanelRole\(main\.openSequence, detail\.openSequence\)[\s\S]{0,180}?restoreFocus: false/, "缩窄重排必须按打开序号关闭较早面板");
assert.match(managerSource, /panel\.addEventListener\("pointerdown"[\s\S]{0,180}?restoreManagedPanelViewportOrigin/, "受管面板 pointerdown 必须恢复 document viewport 原点");
assert.match(managerSource, /reflowPanels\(\) \{[\s\S]{0,100}?restoreManagedPanelViewportOrigin/, "reflow 必须兜底恢复 document viewport 原点");

console.log(JSON.stringify({
  ok: true,
  migration: "legacy-finite-to-manual",
  persistence: "preferred-position-only",
  drag: "actual-pointerup-only",
  coexistence: "manual-protected-auto-remainder",
  documentViewport: "origin-guarded",
  viewportRestore: {constrained, restored}
}, null, 2));

function runNarrowReflow({mainSequence, detailSequence}) {
  const main = {openSequence: mainSequence, panel: {offsetWidth: 600}};
  const detail = {openSequence: detailSequence, panel: {offsetWidth: 320}};
  const closed = [];
  const resizeManager = Object.create(PanelManager.prototype);
  resizeManager.host = {clientWidth: 720, getBoundingClientRect: () => ({width: 720})};
  resizeManager.visiblePanelByRole = role => role === "main" ? main : detail;
  resizeManager.panelIdForRecord = record => record === main ? "main-panel" : "object-details";
  resizeManager.close = id => closed.push(id);
  resizeManager.reflowPanels();
  assert.equal(closed.length, 1, "缩窄重排必须只关闭一个面板");
  return closed[0];
}

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `无法读取源码片段：${start}`);
  return source.slice(startIndex, endIndex);
}
