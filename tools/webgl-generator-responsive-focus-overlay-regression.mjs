import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {captureControlPanelLaunchGeometry, unionRects, visibleRowUnion} from "../app/webgl-generator/src/ui/control-panel-launch-geometry.js";
import {PanelManager} from "../app/webgl-generator/src/ui/panel-manager.js";
import {chooseSecondaryPanelPlacement, constrainUserSecondaryPanelPosition, findSecondaryActionAnchor} from "../app/webgl-generator/src/ui/vue/components/base/secondary-panel-placement.js";
import {buildComplexWorkspaceAudit} from "./webgl-generator-interaction-complex-workspace-audit.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  styles: "app/webgl-generator/src/styles.css",
  toolbar: "app/webgl-generator/src/ui/vue/components/MapToolbar.vue",
  control: "app/webgl-generator/src/ui/vue/components/ControlPanel.vue",
  actionDock: "app/webgl-generator/src/ui/vue/components/base/UiActionDock.vue",
  app: "app/webgl-generator/src/runtime/app.js",
  panel: "app/webgl-generator/src/ui/panel.js",
  panelManager: "app/webgl-generator/src/ui/panel-manager.js",
  labelTrigger: "app/webgl-generator/src/ui/label-naming-panel-trigger.js"
};
const source = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, readFileSync(join(ROOT, file), "utf8")]));

const toolbarIds = [...source.toolbar.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]).filter(id => id !== "map-global-tool-actions");
assert.deepEqual(toolbarIds, ["open-generation-panel", "fit-view", "toggle-measurement", "open-development-panel", "collapse-global-tools", "expand-global-tools"]);
assert.equal(toolbarIds.filter(id => id !== "open-development-panel").length, 5, "MapToolbar 用户入口必须保持 5 个");
for (const token of ["flex-wrap: wrap", "min-width: 0", "overflow-wrap: anywhere", "white-space: normal"]) assert.ok(cssRule(source.styles, ".map-toolbar").includes(token) || source.styles.includes(token), `工具栏长文本契约缺少 ${token}`);

const managementBlock = sourceBlock(source.control, "const managementGroups = Object.freeze([", "\n]);");
const managementIds = [...managementBlock.matchAll(/\["(open-[^"]+-panel)",/g)].map(match => match[1]);
assert.equal(new Set(managementIds).size, 25, "管理 Tab 必须保持 6 组 25 个唯一入口");
assert.equal((managementBlock.match(/managementGroup\(/g) || []).length, 6);
const handlerBlock = sourceBlock(source.app, "const CONTROL_PANEL_CHILD_OPEN_HANDLERS = Object.freeze([", "\n]);");
const handlers = [...handlerBlock.matchAll(/"(onOpen[^"]+Panel)"/g)].map(match => match[1]);
assert.equal(new Set(handlers).size, 25, "child opener handler 必须保持 25 个");
const discoveredPanelBindings = new Set([
  ...source.panel.matchAll(/(?:bindDelegatedButton\(documentRef,\s*"[^"]+",\s*handlers\.|getElementById\("[^"]+"\)\?\.addEventListener\("click",\s*handlers\.)(onOpen\w+Panel)/g),
  ...source.panel.matchAll(/bindLabelNamingPanelTrigger\(documentRef,\s*handlers\.(onOpen\w+Panel)\)/g)
].map(match => match[1]));
const panelBindings = new Set([...discoveredPanelBindings].filter(name => handlers.includes(name)));
assert.equal(panelBindings.size, 25, "25 个管理入口必须全部接入 child handler");
assert.deepEqual([...new Set(handlers)].filter(name => !panelBindings.has(name)), [], "handler 与管理入口绑定差集必须为 0");
const wrapper = sourceBlock(source.app, "function wrapControlPanelChildOpeners(", "\n}");
for (const token of ["captureControlPanelLaunchGeometry", "withReturnParent(returnParentId", "{launchGeometry}"]) assert.ok(wrapper.includes(token), `child opener wrapper 缺少 ${token}`);
assert.match(source.labelTrigger, /handler\?\.\(\{currentTarget: trigger, target: event\.target, originalEvent: event\}\)/, "标签管理 delegated trigger 必须转发真实 currentTarget");
assert.match(source.panelManager, /PANEL_MIN_BODY_HEIGHT = 96[\s\S]*launchSafeTopPending[\s\S]*Object\.hasOwn\(panel\.dataset, "launchSafeTop"\)[\s\S]*panel\.dataset\.launchSafeTop = String\(effectiveSafeTop\)[\s\S]*writePanelAvailableHeight\(panel, panelAvailableHeight\(hostHeight, position\.top\)\)/, "launch safeTop 必须保留正文预算、首帧后释放，并与 215 finalTop / availableHeight 共用 constrain 出口");

const complex = buildComplexWorkspaceAudit();
assert.deepEqual({
  hosts: complex.actionDockHosts.length,
  actions: complex.actionDockActions.length,
  secondary: complex.totals.secondaryPanelActions
}, {hosts: 18, actions: 68, secondary: 55});
for (const token of ["ResizeObserver", "requestAnimationFrame", "positionObserver.observe(panel.value)", "positionObserver.observe(panelBody.value)", "naturalPanelHeight", "panel.value?.scrollHeight", "panelBody.value?.scrollHeight", "chooseSecondaryPanelPlacement", "findSecondaryActionAnchor", "constrainUserSecondaryPanelPosition", 'side: "user"', ":data-placement-side", ":data-available-height"]) assert.ok(source.actionDock.includes(token), `UiActionDock 缺少 ${token}`);
assert.doesNotMatch(source.actionDock, /minHeight\s*=\s*180|Math\.max\(minHeight/, "二级面板不得保留 180px 高度 floor");

const modeAnchor = {dataset: {actionId: "state-panel:edit"}};
const secondaryAnchor = {dataset: {actionId: "state-panel:rename"}};
const multipleActiveRoot = {querySelectorAll: () => [modeAnchor, secondaryAnchor]};
assert.equal(findSecondaryActionAnchor(multipleActiveRoot, "state-panel:rename"), secondaryAnchor, "多个 active 动作并存时必须锚定当前二级动作 identity");
assert.equal(findSecondaryActionAnchor(multipleActiveRoot, "state-panel:missing"), multipleActiveRoot, "找不到稳定 identity 时只允许回退到动作坞根");

assert.equal(chooseSecondaryPanelPlacement({anchorRect: {top: 100, bottom: 132}, panelHeight: 180, viewportHeight: 720, safeTop: 80}).side, "below");
assert.equal(chooseSecondaryPanelPlacement({anchorRect: {top: 600, bottom: 632}, panelHeight: 260, viewportHeight: 720, safeTop: 80}).side, "above");
const aboveViewport = chooseSecondaryPanelPlacement({anchorRect: {top: -50, bottom: -20}, panelHeight: 180, viewportHeight: 720, safeTop: 80});
assert.equal(aboveViewport.side, "below");
assert.equal(aboveViewport.top, 80, "视口上方锚点不得产生小于 safeTop 的 top");
const belowViewport = chooseSecondaryPanelPlacement({anchorRect: {top: 800, bottom: 832}, panelHeight: 180, viewportHeight: 720, safeTop: 80});
assert.equal(belowViewport.side, "above");
assert.ok(belowViewport.top >= 80 && belowViewport.top + Math.min(180, belowViewport.available) <= 712, "视口下方锚点不得让弹框越过 viewportBottom");
const neither = chooseSecondaryPanelPlacement({anchorRect: {top: 350, bottom: 382}, panelHeight: 480, viewportHeight: 620, safeTop: 100});
assert.equal(neither.side, "above");
assert.ok(neither.aboveAvailable > neither.belowAvailable);
const asyncAnchor = {top: 400, bottom: 432};
assert.equal(chooseSecondaryPanelPlacement({anchorRect: asyncAnchor, panelHeight: 100, viewportHeight: 720, safeTop: 100}).side, "below");
assert.equal(chooseSecondaryPanelPlacement({anchorRect: asyncAnchor, panelHeight: 400, viewportHeight: 720, safeTop: 100}).side, "above", "异步内容增高后必须重选可用空间更大的上侧");
assert.deepEqual(constrainUserSecondaryPanelPosition({
  rect: {left: -20, top: 690, width: 360},
  viewportWidth: 720,
  viewportHeight: 720,
  safeTop: 100,
  headerHeight: 42
}), {left: 10, top: 668, width: 360, maxHeight: 42, side: "user"}, "用户定位只钳制，不得重新选择自动上下侧");

const reference = fakeElement({left: 10, top: 20, right: 120, bottom: 65});
const sameRow = fakeElement({left: 130, top: 20, right: 250, bottom: 65});
const nextRow = fakeElement({left: 10, top: 72, right: 120, bottom: 117});
const expandedRow = visibleRowUnion({children: [reference, sameRow, nextRow]}, reference);
assert.deepEqual(expandedRow, {left: 10, top: 20, right: 250, bottom: 65, width: 240, height: 45}, "150% 字体行 union 必须按真实 y 相交而非固定高度");
assert.deepEqual(unionRects([{left: 0, top: 10, right: 100, bottom: 40}, expandedRow]), {left: 0, top: 10, right: 250, bottom: 65, width: 250, height: 55});
const launchFixture = createLaunchFixture();
const launchGeometry = captureControlPanelLaunchGeometry(launchFixture.documentRef, launchFixture.trigger);
assert.equal(launchGeometry.union.bottom, 552, "低位管理入口仍必须进入三行真实矩形取证");
assert.equal(launchGeometry.occupiedHeight, 152, "启动预算必须只累计三行实际高度、两段明确间距和 margin");
assert.equal(launchGeometry.safeTop, 160, "低位入口前的滚动空白不得膨胀启动 safeTop");
const launchManager = createLaunchPanelManager();
launchManager.withReturnParent("generation-panel", () => launchManager.open("child-panel"), {launchGeometry});
const launchedPanel = launchManager.panels.get("child-panel").panel;
assert.equal(launchManager.panels.get("child-panel").returnParentId, "generation-panel");
assert.equal(Number(launchedPanel.dataset.launchSafeTop), 160, "三行占用预算必须作为首帧最终 safeTop");
assert.equal(Number.parseFloat(launchedPanel.style.top), 160);
assert.equal(launchedPanel.style["--floating-panel-available-height"], "408px");
assert.ok(Number.parseFloat(launchedPanel.style["--floating-panel-available-height"]) - 38 >= 96, "低位入口样本的首帧正文必须有正高度并可内部滚动");
const inheritedPlacement = chooseSecondaryPanelPlacement({
  anchorRect: {top: 250, bottom: 270},
  panelHeight: 100,
  viewportHeight: 576,
  safeTop: Number(launchedPanel.dataset.launchSafeTop)
});
assert.ok(inheritedPlacement.available > 0, "ActionDock 继承最终 safeTop 后不得得到零高度");
assert.ok(inheritedPlacement.top >= 160 && inheritedPlacement.top + inheritedPlacement.available <= 568, "ActionDock 不得越出最终安全区");
launchManager.releaseAnimationFrames();
assert.equal(Number(launchedPanel.dataset.launchSafeTop), 8, "首帧后 reflow 必须释放启动安全带并同步子弹框继承值");
assert.equal(launchManager.reflowCount, 1, "rAF 释放必须主动进入统一 reflow 出口");
assert.equal(launchManager.preferredPositionCalls, 1, "rAF 释放不得绕过共存布局再次只调用单面板 preferred position");
assert.equal(Number.parseFloat(launchedPanel.style.left), 472, "共存主面板必须保持统一右侧 dock");
assert.equal(Number.parseFloat(launchManager.panels.get("detail-panel").panel.style.left), 8, "共存详情面板必须保持统一左侧 dock");
const reopenManager = createLaunchPanelManager();
reopenManager.withReturnParent("generation-panel", () => reopenManager.open("child-panel"), {launchGeometry});
reopenManager.open("child-panel");
reopenManager.releaseAnimationFrames();
assert.equal(Object.hasOwn(reopenManager.panels.get("child-panel").panel.dataset, "launchSafeTop"), false, "旧 rAF 不得污染无 launch 的重开生命周期");
assert.equal(Object.hasOwn(reopenManager.panels.get("child-panel").panel.dataset, "launchSafeTopPending"), false, "无 launch 重开必须同时清理 pending 标记");
const normalPanel = fakePanel({hidden: false});
launchManager.constrain(normalPanel, {top: 24});
assert.equal(Object.hasOwn(normalPanel.dataset, "launchSafeTop"), false, "普通面板不得被写入 launchSafeTop");

for (const token of ["--ui-focus-color", "--ui-focus-width", "--ui-focus-offset", "--ui-focus-shadow"]) assert.ok(source.styles.includes(token));
const focusSelectors = [
  ":is(.map-toolbar .primary-action, .map-toolbar .secondary-action, .map-toolbar-edge-trigger):focus-visible",
  ".ui-icon-action.el-button:focus-visible",
  ".object-table-selection-checkbox:focus-visible",
  ".ui-secondary-action-close:focus-visible",
  ".object-table-column-resize-handle:focus-visible",
  ".object-table-sort-button:focus-visible",
  ".object-table-empty-action:focus-visible",
  ".wind-band-button.el-button:focus-visible",
  ".inheritance-tree-open.el-button:focus-visible"
];
const focusBlock = focusSelectors.join(",\n");
assert.ok(source.styles.includes(focusBlock), "9 个 focus selector 家族必须消费同一规则");
for (const selector of focusSelectors) assert.doesNotMatch(cssRulesContaining(source.styles, selector), /outline:\s*none/, `${selector} 不得清除焦点环`);

console.log(JSON.stringify({
  management: {groups: 6, entries: 25, handlers: 25},
  actionDock: {hosts: 18, actions: 68, secondary: 55},
  focusFamilies: 9,
  toolbar: {ids: 6, userEntries: 5}
}, null, 2));

function readRect(rect) {
  return {...rect, width: rect.right - rect.left, height: rect.bottom - rect.top};
}

function fakeElement(rect) {
  const value = readRect(rect);
  return {getBoundingClientRect: () => value};
}

function createLaunchFixture() {
  const toolbarTrigger = fakeElement({left: 8, top: 8, right: 110, bottom: 42});
  const toolbarPeer = fakeElement({left: 118, top: 8, right: 220, bottom: 42});
  const toolbarActions = {children: [toolbarTrigger, toolbarPeer]};
  toolbarTrigger.closest = selector => selector === ".map-toolbar-actions" ? toolbarActions : null;
  const tabHeader = fakeElement({left: 20, top: 450, right: 430, bottom: 492});
  const managementPeer = fakeElement({left: 220, top: 500, right: 420, bottom: 552});
  const trigger = fakeElement({left: 20, top: 500, right: 210, bottom: 552});
  const managementActions = {children: [trigger, managementPeer]};
  const floatingPanel = {querySelector: selector => selector === ".control-panel-tabs .el-tabs__header" ? tabHeader : null};
  trigger.closest = selector => selector === ".floating-panel" ? floatingPanel : selector === ".management-panel-actions" ? managementActions : null;
  return {
    documentRef: {getElementById: id => id === "open-generation-panel" ? toolbarTrigger : null},
    trigger
  };
}

function createLaunchPanelManager() {
  const manager = Object.create(PanelManager.prototype);
  const animationFrames = [];
  manager.documentRef = {
    activeElement: null,
    querySelector: () => null,
    defaultView: {
      scrollX: 0,
      scrollY: 0,
      requestAnimationFrame(callback) {
        animationFrames.push(callback);
        return animationFrames.length;
      }
    }
  };
  manager.host = {clientWidth: 800, clientHeight: 576, getBoundingClientRect: () => ({width: 800, height: 576})};
  manager.panels = new Map([
    ["generation-panel", {panel: fakePanel({hidden: false}), role: "main", returnParentId: null}],
    ["child-panel", {
      panel: fakePanel({hidden: true}),
      role: "main",
      returnParentId: null,
      preferredLeft: 24,
      preferredTop: 64,
      positionMode: "auto",
      overlayId: "panel:child-panel",
      onClose() {}
    }],
    ["detail-panel", {
      panel: fakePanel({hidden: false}),
      role: "detail",
      returnParentId: null,
      openSequence: 1,
      preferredLeft: 24,
      preferredTop: 64,
      positionMode: "auto",
      overlayId: "panel:detail-panel",
      onClose() {}
    }]
  ]);
  manager.openSequence = 0;
  manager.returnParentContext = null;
  manager.launchGeometryContext = null;
  manager.closeOtherMainPanels = () => manager.panels.get("generation-panel").panel.classList.add("hidden");
  manager.resolvePanelCoexistence = () => {};
  manager.startHeaderRefresh = () => {};
  manager.savePanelState = () => {};
  const applyPreferredPosition = manager.applyPreferredPosition.bind(manager);
  manager.preferredPositionCalls = 0;
  manager.applyPreferredPosition = (...args) => {
    manager.preferredPositionCalls += 1;
    return applyPreferredPosition(...args);
  };
  const reflowPanels = manager.reflowPanels.bind(manager);
  manager.reflowCount = 0;
  manager.reflowPanels = () => {
    manager.reflowCount += 1;
    return reflowPanels();
  };
  manager.releaseAnimationFrames = () => animationFrames.splice(0).forEach(callback => callback());
  return manager;
}

function fakePanel({hidden}) {
  const classes = new Set(hidden ? ["hidden"] : []);
  const style = {
    left: "",
    top: "",
    getPropertyValue(name) {
      return this[name] || "";
    },
    setProperty(name, value) {
      this[name] = value;
    }
  };
  return {
    dataset: {},
    style,
    offsetHeight: 300,
    offsetWidth: 320,
    classList: {
      contains: name => classes.has(name),
      add: name => classes.add(name),
      remove: name => classes.delete(name)
    },
    querySelector: selector => selector === ".floating-panel-header" ? {offsetHeight: 38} : null,
    getBoundingClientRect() {
      const left = Number.parseFloat(style.left) || 0;
      const top = Number.parseFloat(style.top) || 0;
      return {left, top, right: left + 320, bottom: top + 300, width: 320, height: 300};
    }
  };
}

function cssRule(styles, selector) {
  const start = styles.indexOf(`${selector} {`);
  if (start < 0) return "";
  const end = styles.indexOf("}", start);
  return styles.slice(start, end + 1);
}

function cssRulesContaining(styles, selector) {
  return styles.split("}").filter(block => block.includes(selector)).join("}");
}

function sourceBlock(value, startToken, endToken) {
  const start = value.indexOf(startToken);
  const end = value.indexOf(endToken, start + startToken.length);
  assert.ok(start >= 0 && end > start, `无法读取源码片段：${startToken}`);
  return value.slice(start, end);
}
