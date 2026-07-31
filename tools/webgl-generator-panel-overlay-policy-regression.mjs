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
  resolvePanelRegistrationPosition,
  restoreManagedPanelViewportOrigin
} from "../app/webgl-generator/src/ui/panel-manager.js";

class FakeDocument extends EventTarget {
  constructor() {
    super();
    this.body = {};
    this.documentElement = {clientWidth: 1280, clientHeight: 720};
    this.activeElement = null;
    this.frameworkPopups = [];
    this.defaultView = new EventTarget();
    this.defaultView.innerWidth = 1280;
    this.defaultView.innerHeight = 720;
    this.defaultView.requestAnimationFrame = callback => callback();
  }
  querySelector() {
    return null;
  }
  querySelectorAll() {
    return this.frameworkPopups;
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
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
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

function keyEvent(key, patch = {}) {
  const event = new Event("keydown", {cancelable: true});
  Object.defineProperty(event, "key", {value: key});
  for (const [name, value] of Object.entries(patch)) Object.defineProperty(event, name, {value});
  return event;
}

assert.equal(panelsCanCoexist(1280, 820, 320), true, "1280 宽视口应容纳主面板与对象详情");
assert.equal(panelsCanCoexist(720, 600, 320), false, "窄视口不应强行叠放主面板与对象详情");
assert.equal(chooseLastOpenMainPanel([{id: "state", openedAt: 10}, {id: "city", openedAt: 20}], null), "city");
assert.equal(chooseLastOpenMainPanel([{id: "state", openedAt: 10}, {id: "city", openedAt: 20}], "state"), "state");
assert.equal(chooseLastOpenMainPanel([], "state"), null);
assert.equal(normalizePanelPositionState({left: 180, top: 96}, {left: 24, top: 24}).positionMode, "manual", "旧面板坐标必须迁移为手动偏好");
assert.deepEqual(
  resolvePanelRegistrationPosition({role: "main", persistOpen: true, savedState: null, defaults: {left: 500, top: 136}}),
  {positionMode: "auto", left: 8, top: 64, defaultLeft: 8, defaultTop: 64, initialPlacement: "left"},
  "新主面板必须从左侧安全区首次打开"
);
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
let leakedEscapeEvents = 0;
focusDocument.addEventListener("keydown", () => leakedEscapeEvents++, true);
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
assert.equal(panel.getAttribute("data-keyboard-exclusive"), "true");
assert.equal(panel.dataset.overlayOpen, "true");
assert(Number(panel.style.zIndex) >= 900, "浮层没有使用统一层级");
focusDocument.dispatchEvent(keyEvent("Escape", {repeat: true}));
assert.equal(closeRequests, 0, "重复 Escape 不得关闭浮层");
focusDocument.frameworkPopups = [{
  hidden: false,
  isConnected: true,
  style: {},
  getAttribute: () => "false",
  getClientRects: () => [{}]
}];
focusDocument.dispatchEvent(keyEvent("Escape"));
assert.equal(closeRequests, 0, "框架 popup 展开时 managed overlay 抢先关闭");
focusDocument.frameworkPopups = [];
leakedEscapeEvents = 0;
focusDocument.dispatchEvent(keyEvent("Escape"));
assert.equal(closeRequests, 1, "Esc 没有请求关闭顶层浮层");
assert.equal(leakedEscapeEvents, 0, "已关闭浮层的 Escape 继续穿透到同节点后续消费者");
assert.equal(panel.dataset.overlayOpen, "false");
assert.equal(focusDocument.activeElement, trigger, "关闭浮层后焦点没有返回触发入口");

const mainPanel = new FakeElement(focusDocument, "main-panel");
const secondary = new FakeElement(focusDocument, "secondary");
let mainCloseRequests = 0;
let secondaryCloseRequests = 0;
const mainHandle = registry.register("main-panel", mainPanel, {kind: "panel", role: "main", onRequestClose: () => mainCloseRequests++});
const secondaryHandle = registry.register("secondary", secondary, {kind: "fixed", role: "advanced", onRequestClose: () => secondaryCloseRequests++});
mainHandle.show({focus: false});
secondaryHandle.show({focus: false});
mainHandle.activate();
focusDocument.dispatchEvent(keyEvent("Escape"));
assert.equal(secondaryCloseRequests, 1, "fixed / secondary 浮层必须先于主面板关闭");
assert.equal(mainCloseRequests, 0, "首次 Escape 不得同时关闭主面板");
focusDocument.dispatchEvent(keyEvent("Escape"));
assert.equal(mainCloseRequests, 1, "第二次 Escape 才能关闭主面板");

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
assert.match(browserRegressionSource, /keyboard\.press\("Shift\+H"\)[\s\S]*重设海底[\s\S]*windowScroll/, "浏览器回归必须真实展开高度面板详情并检查 document viewport");
assert.match(managerSource, /panel\.addEventListener\("pointerdown"[\s\S]{0,180}?restoreManagedPanelViewportOrigin/, "受管面板交互必须恢复 document viewport 原点");
assert.match(managerSource, /reflowPanels\(\) \{[\s\S]{0,100}?restoreManagedPanelViewportOrigin/, "reflow 必须兜底恢复 document viewport 原点");
assert.match(managerSource, /options\.minWidth[\s\S]{0,120}?style\.minWidth = `min\(\$\{options\.minWidth\}px, calc\(100% - 16px\)\)`/, "面板管理器必须支持响应式宽度下限");
assert(detailsSource.includes('role: "detail"'), "对象详情没有登记为可选详情面板");
assert(developmentSource.includes("persistOpen: false"), "开发面板不应覆盖用户最后打开的主面板记录");
for (const token of ["width: 760", "minWidth: 680", "maxWidth: 1100"]) assert(developmentSource.includes(token), `开发面板宽屏契约缺少 ${token}`);
assert.match(styleSource, /\.development-load-trace li,[\s\S]{0,180}?white-space:\s*nowrap/, "开发追踪列表必须局部单行滚动");
assert.match(styleSource, /#runtime-stats \.development-generation-log dd[\s\S]{0,500}?overflow:\s*auto[\s\S]{0,300}?white-space:\s*pre/, "生成日志必须按条保留单行并局部滚动");
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
