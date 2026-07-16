#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {OverlayRegistry} from "../app/webgl-generator/src/ui/overlay-registry.js";
import {
  chooseLastOpenMainPanel,
  chooseLaterOpenedPanelRole,
  chooseRemainingPanelLeft,
  constrainPanelRuntimePosition,
  normalizePanelPositionState,
  panelDragHasMoved,
  panelsCanCoexist,
  restoreManagedPanelViewportOrigin
} from "../app/webgl-generator/src/ui/panel-manager.js";

class FakeDocument extends EventTarget {
  constructor() {
    super();
    this.body = {};
    this.documentElement = {clientWidth: 1280, clientHeight: 720};
    this.activeElement = null;
    this.defaultView = new EventTarget();
    this.defaultView.innerWidth = 1280;
    this.defaultView.innerHeight = 720;
    this.defaultView.requestAnimationFrame = callback => callback();
  }
  querySelector() {
    return null;
  }
}

class FakeElement extends EventTarget {
  constructor(documentRef, id) {
    super();
    this.id = id;
    this.ownerDocument = documentRef;
    this.dataset = {};
    this.attributes = new Map();
    this.style = new FakeStyle();
    this.isConnected = true;
    this.offsetWidth = 320;
    this.offsetHeight = 220;
  }
  hasAttribute(name) {
    return this.attributes.has(name);
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  getBoundingClientRect() {
    const left = Number.parseFloat(this.style.left) || 0;
    const top = Number.parseFloat(this.style.top) || 0;
    return {left, top, right: left + this.offsetWidth, bottom: top + this.offsetHeight, width: this.offsetWidth, height: this.offsetHeight};
  }
  focus() {
    this.ownerDocument.activeElement = this;
  }
}

class FakeStyle {
  setProperty(name, value) {
    this[name] = String(value);
  }
}

function keyEvent(key) {
  const event = new Event("keydown", {cancelable: true});
  Object.defineProperty(event, "key", {value: key});
  return event;
}

assert.equal(panelsCanCoexist(1280, 820, 320), true, "1280 宽视口应容纳主面板与对象详情");
assert.equal(panelsCanCoexist(720, 600, 320), false, "窄视口不应强行叠放主面板与对象详情");
assert.equal(chooseLastOpenMainPanel([{id: "state", openedAt: 10}, {id: "city", openedAt: 20}], null), "city");
assert.equal(chooseLastOpenMainPanel([{id: "state", openedAt: 10}, {id: "city", openedAt: 20}], "state"), "state");
assert.equal(chooseLastOpenMainPanel([], "state"), null);
assert.equal(normalizePanelPositionState({left: 180, top: 96}, {left: 24, top: 24}).positionMode, "manual", "旧面板坐标必须迁移为手动偏好");
assert.deepEqual(
  constrainPanelRuntimePosition({left: 900, top: 600, hostWidth: 720, hostHeight: 576, panelWidth: 560, headerHeight: 44}),
  {left: 152, top: 524},
  "运行时钳制只应保证标题栏与关闭按钮可达"
);
assert.equal(chooseRemainingPanelLeft({hostWidth: 1280, protectedLeft: 8, protectedWidth: 560, movingWidth: 320}), 952, "自动详情必须避让左侧手动主面板");
assert.equal(panelDragHasMoved(100, 80, 100, 80), false, "仅点按不得写入手动偏好");
assert.equal(panelDragHasMoved(100, 80, 120, 90), true, "有效拖动必须写入手动偏好");
assert.equal(chooseLaterOpenedPanelRole(1, 2), "detail", "缩窄后必须保留序号更大的详情");
assert.equal(chooseLaterOpenedPanelRole(2, 1), "main", "缩窄后必须保留序号更大的主面板");
assert.equal(chooseLaterOpenedPanelRole(0, 0), "detail", "同序号必须使用稳定详情优先规则");
let viewportRestores = 0;
const fakeScrolledWindow = {scrollX: 0, scrollY: 124.44, scrollTo: () => viewportRestores++};
assert.equal(restoreManagedPanelViewportOrigin(fakeScrolledWindow), true, "受管面板必须恢复 document viewport 原点");
assert.equal(viewportRestores, 1);
assert.equal(restoreManagedPanelViewportOrigin({scrollX: 0, scrollY: 0, scrollTo: () => viewportRestores++}), false, "原点守卫不得重复写入");
assert.equal(viewportRestores, 1);

const focusDocument = new FakeDocument();
const trigger = new FakeElement(focusDocument, "trigger");
const panel = new FakeElement(focusDocument, "panel");
focusDocument.activeElement = trigger;
const registry = new OverlayRegistry(focusDocument);
let closeRequests = 0;
const handle = registry.register("test-overlay", panel, {
  kind: "fixed",
  role: "advanced",
  onRequestClose: () => {
    closeRequests++;
  }
});
handle.show();
assert.equal(focusDocument.activeElement, panel, "打开浮层后焦点没有进入浮层");
assert.equal(panel.dataset.overlayKind, "fixed");
assert.equal(panel.dataset.overlayRole, "advanced");
assert(Number(panel.style.zIndex) >= 900, "浮层没有使用统一层级");
focusDocument.dispatchEvent(keyEvent("Escape"));
assert.equal(closeRequests, 1, "Esc 没有请求关闭顶层浮层");
assert.equal(focusDocument.activeElement, trigger, "关闭浮层后焦点没有返回触发入口");

const [managerSource, detailsSource, developmentSource, controlSource, heightSource, treeSource, styleSource, browserRegressionSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/ui/panel-manager.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/panels/object-details-panel.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/panels/development-panel.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/ControlPanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/HeightPanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/base/UiTreeDisplayPanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/styles.css", import.meta.url), "utf8"),
  readFile(new URL("./webgl-generator-panel-overlay-browser-regression.mjs", import.meta.url), "utf8")
]);

for (const signature of ["closeOtherMainPanels(id)", "resolvePanelCoexistence(id)", "lastMainStorageKey", "chooseLastOpenMainPanel", "positionMode", "preferredLeft", "commitManualPosition", "openSequence"]) {
  assert(managerSource.includes(signature), `主面板策略缺少 ${signature}`);
}
assert.match(managerSource, /positionMode:\s*record\.positionMode[\s\S]{0,120}?left:\s*Math\.round\(record\.preferredLeft\)/, "持久化必须保存偏好而非临时 DOM 坐标");
assert.match(managerSource, /if \(record\.positionMode === PANEL_POSITION_MANUAL\)[\s\S]{0,160}?applyPreferredPosition\(record\)[\s\S]{0,80}?return/, "手动面板必须跳过工具栏自动避让");
assert.match(managerSource, /chooseLaterOpenedPanelRole\(main\.openSequence, detail\.openSequence\)[\s\S]{0,180}?this\.close/, "resize 不可共存时必须关闭较早打开者");
assert.match(browserRegressionSource, /keyboard\.press\("Shift\+C"\)[\s\S]{0,180}?visibleMainPanelIds/, "城市面板重开必须使用真实 Shift+C 路径并验证唯一主面板");
assert.match(browserRegressionSource, /setViewportSize\(\{width: 720[\s\S]{0,500}?object-details/, "浏览器回归必须覆盖桌面共存缩窄后保留对象详情");
assert.doesNotMatch(browserRegressionSource, /locator\(`#\$\{triggerId\}`\)\.click/, "浏览器回归不得强点隐藏的面板入口");
assert.match(browserRegressionSource, /keyboard\.press\("Shift\+H"\)[\s\S]*高级地形程序与条件变换[\s\S]*windowScroll/, "浏览器回归必须真实展开高度面板深层 summary 并检查 document viewport");
assert.match(managerSource, /panel\.addEventListener\("pointerdown"[\s\S]{0,180}?restoreManagedPanelViewportOrigin/, "受管面板交互必须恢复 document viewport 原点");
assert.match(managerSource, /reflowPanels\(\) \{[\s\S]{0,100}?restoreManagedPanelViewportOrigin/, "reflow 必须兜底恢复 document viewport 原点");
assert(detailsSource.includes('role: "detail"'), "对象详情没有登记为可选详情面板");
assert(developmentSource.includes("persistOpen: false"), "开发面板不应覆盖用户最后打开的主面板记录");
for (const [source, id] of [[controlSource, "project-export"], [heightSource, "heightmap-import-workbench"], [treeSource, "tree-display"]]) {
  assert(source.includes("useManagedOverlay"), `${id} 没有接入统一浮层注册表`);
  assert(source.includes(`id: "${id}"`), `${id} 缺少稳定浮层 id`);
}
for (const legacyZIndex of ["z-index: 980", "z-index: 940", "z-index: 850"]) assert(!styleSource.includes(legacyZIndex), `仍保留固定浮层硬编码层级 ${legacyZIndex}`);
assert.equal((styleSource.match(/var\(--managed-overlay-z-index, 900\)/g) || []).length, 3, "三个固定高级浮层没有共享层级变量");

console.log(JSON.stringify({
  ok: true,
  panelPolicy: {main: 1, optionalDetails: 1, narrowViewport: "runtime-open-sequence-wins", manualPosition: "preferred-first"},
  persistence: "last-main-and-position-preference",
  fixedOverlays: ["project-export", "heightmap-import-workbench", "tree-display"],
  focusReturn: true,
  escapeClose: true
}, null, 2));
