#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {OverlayRegistry} from "../app/webgl-generator/src/ui/overlay-registry.js";
import {chooseLastOpenMainPanel, panelsCanCoexist} from "../app/webgl-generator/src/ui/panel-manager.js";

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

const [managerSource, detailsSource, developmentSource, controlSource, heightSource, treeSource, styleSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/ui/panel-manager.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/panels/object-details-panel.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/panels/development-panel.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/ControlPanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/HeightPanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/base/UiTreeDisplayPanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/styles.css", import.meta.url), "utf8")
]);

for (const signature of ["closeOtherMainPanels(id)", "resolvePanelCoexistence(id)", "lastMainStorageKey", "chooseLastOpenMainPanel"]) {
  assert(managerSource.includes(signature), `主面板策略缺少 ${signature}`);
}
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
  panelPolicy: {main: 1, optionalDetails: 1, narrowViewport: "last-opened-wins"},
  persistence: "last-main-only",
  fixedOverlays: ["project-export", "heightmap-import-workbench", "tree-display"],
  focusReturn: true,
  escapeClose: true
}, null, 2));
