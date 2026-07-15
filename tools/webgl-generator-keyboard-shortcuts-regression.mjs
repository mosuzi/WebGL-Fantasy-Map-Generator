#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {
  installKeyboardShortcuts,
  isEditableShortcutTarget,
  KEYBOARD_SHORTCUTS,
  resolveShortcut,
  shortcutAriaLabel,
  shortcutBindingLabel,
  validateShortcutRegistry
} from "../app/webgl-generator/src/runtime/keyboard-shortcuts.js";

const summary = validateShortcutRegistry();
assert.equal(summary.shortcuts, 22);
assert.equal(summary.bindings, 23);
assert.deepEqual(summary.conflicts, []);
assert.deepEqual(new Set(KEYBOARD_SHORTCUTS.map(item => item.group)), new Set(["file", "history", "editing", "selection", "view", "layers", "generation", "panels"]));
assert(!KEYBOARD_SHORTCUTS.some(item => item.action?.path === "generate.newMap" || item.action?.path === "generate.rerollSeed"), "破坏性生成动作不应默认绑定快捷键");

const save = KEYBOARD_SHORTCUTS.find(item => item.id === "file.save-browser");
assert.equal(shortcutBindingLabel(save.bindings[0], "default"), "Ctrl+S");
assert.equal(shortcutBindingLabel(save.bindings[0], "mac"), "⌘S");
assert.equal(shortcutAriaLabel(save.bindings[0], "default"), "Control+S");
assert.equal(resolveShortcut(keyEvent("KeyS", {ctrlKey: true}), KEYBOARD_SHORTCUTS, {platform: "default", scopes: ["global"]})?.id, "file.save-browser");
assert.equal(resolveShortcut(keyEvent("KeyS", {metaKey: true}), KEYBOARD_SHORTCUTS, {platform: "mac", scopes: ["global"]})?.id, "file.save-browser");
assert.equal(resolveShortcut(keyEvent("KeyS", {shiftKey: true}), KEYBOARD_SHORTCUTS, {platform: "default", scopes: ["global"]})?.id, "panel.states");

const scopedRegistry = [
  {id: "global", label: "全局", group: "test", scope: "global", priority: 0, bindings: [{code: "KeyK"}], action: {type: "test"}},
  {id: "panel", label: "面板", group: "test", scope: "panel", priority: 10, bindings: [{code: "KeyK"}], action: {type: "test"}}
];
validateShortcutRegistry(scopedRegistry);
assert.equal(resolveShortcut(keyEvent("KeyK"), scopedRegistry, {scopes: ["global", "panel"]})?.id, "panel");
assert.throws(() => validateShortcutRegistry([
  {...scopedRegistry[0], id: "left"},
  {...scopedRegistry[0], id: "right"}
]), /快捷键冲突/);

assert.equal(isEditableShortcutTarget({tagName: "INPUT"}), true);
assert.equal(isEditableShortcutTarget({tagName: "TEXTAREA"}), true);
assert.equal(isEditableShortcutTarget({tagName: "SELECT"}), true);
assert.equal(isEditableShortcutTarget({tagName: "DIV", isContentEditable: true}), true);
assert.equal(isEditableShortcutTarget({tagName: "BUTTON", closest: () => null}), false);

class FakeElement {
  constructor(id) {
    this.id = id;
    this.tagName = "BUTTON";
    this.dataset = {};
    this.attributes = new Map();
    this.hidden = false;
    this.disabled = false;
    this.isConnected = true;
    this.textContent = "";
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
  closest(selector) {
    if (selector === "[data-shortcut-id]" && this.dataset.shortcutId) return this;
    if (selector === `#${this.id}`) return this;
    return null;
  }
  contains(target) {
    return target === this;
  }
}

const fake = createFakeDocument();
let executions = 0;
let enabled = true;
let lastError = null;
const controller = installKeyboardShortcuts(fake.documentRef, {
  registry: [save],
  hintDelayMs: 10,
  hintDurationMs: 30,
  canExecute: () => enabled,
  execute: () => {
    executions += 1;
  },
  onError: error => {
    lastError = error;
  }
});
assert.equal(fake.action.dataset.shortcutId, save.id);
assert.equal(fake.action.getAttribute("aria-keyshortcuts"), "Control+S");

const firstKey = keyEvent("KeyS", {ctrlKey: true, target: fake.action});
fake.dispatch("keydown", firstKey);
await tick();
assert.equal(firstKey.defaultPrevented, true);
assert.equal(executions, 1);

for (const patch of [{repeat: true}, {isComposing: true}, {keyCode: 229}, {target: {tagName: "INPUT"}}]) {
  fake.dispatch("keydown", keyEvent("KeyS", {ctrlKey: true, target: fake.action, ...patch}));
}
await tick();
assert.equal(executions, 1, "repeat / IME / 输入控件触发了快捷键");

enabled = false;
const disabledKey = keyEvent("KeyS", {ctrlKey: true, target: fake.action});
fake.dispatch("keydown", disabledKey);
await tick();
assert.equal(disabledKey.defaultPrevented, true);
assert.equal(executions, 1, "禁用动作仍被执行");
enabled = true;

fake.dispatch("pointerover", {target: fake.action, relatedTarget: null});
await delay(5);
assert.equal(fake.hint.hidden, true, "悬停未到阈值就显示提示");
await delay(10);
assert.equal(fake.hint.hidden, false);
assert.match(fake.hint.textContent, /保存到浏览器 · Ctrl\+S/);
enabled = false;
controller.refreshAvailability();
assert.equal(fake.hint.hidden, true, "动作禁用后没有清理已显示提示");
enabled = true;
fake.dispatch("pointerover", {target: fake.action, relatedTarget: null});
await delay(15);
assert.equal(fake.hint.hidden, false);
fake.dispatch("pointerout", {target: fake.action, relatedTarget: null});
assert.equal(fake.hint.hidden, true, "离开后没有清理提示");

fake.mapToast.hidden = false;
fake.dispatch("pointerover", {target: fake.action, relatedTarget: null});
await delay(15);
assert.equal(fake.hint.hidden, true, "普通地图 toast 显示时快捷键提示抢占了优先级");
fake.mapToast.hidden = true;
fake.dispatch("pointerover", {target: fake.action, relatedTarget: null});
await delay(15);
assert.equal(fake.hint.hidden, false);
fake.dispatch("webgl-generator-map-toast-change", {detail: {visible: true}});
assert.equal(fake.hint.hidden, true, "地图 toast 出现后没有清理快捷键提示");
fake.dispatch("click", {target: fake.action});
assert.equal(fake.hint.hidden, true);
assert.equal(lastError, null);
controller.destroy();

const [appSource, controlPanelSource, indexSource, stylesSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/ControlPanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/index.html", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/styles.css", import.meta.url), "utf8")
]);
assert.match(appSource, /installKeyboardShortcuts\(documentRef/);
assert.match(appSource, /executeKeyboardShortcut\(state, documentRef, item, runtimePanelHandlers\)/);
assert.match(appSource, /invokePublicApi\(documentRef/);
assert.doesNotMatch(appSource.slice(appSource.indexOf("async function executeKeyboardShortcut"), appSource.indexOf("async function invokePublicApi")), /\.click\(/, "快捷键通过 DOM click 执行动作");
for (const item of KEYBOARD_SHORTCUTS.filter(item => item.action.type === "panel")) {
  assert(appSource.includes(`${item.action.handler}:`), `面板公共 action 缺失：${item.action.handler}`);
}
assert.match(controlPanelSource, /id="save-browser-storage"/);
assert.match(indexSource, /id="shortcut-toast"/);
assert.match(stylesSource, /\.shortcut-toast\s*\{/);
assert.match(stylesSource, /background:\s*rgba\(245, 247, 250, 0\.82\)/);
assert.match(appSource, /webgl-generator-map-toast-change/);

console.log(JSON.stringify({
  ok: true,
  shortcuts: summary.shortcuts,
  bindings: summary.bindings,
  groups: [...new Set(KEYBOARD_SHORTCUTS.map(item => item.group))],
  platformLabels: {default: "Ctrl+S", mac: "⌘S"},
  hintDelayCovered: true,
  mapToastPriorityCovered: true,
  destructiveGenerationBound: false
}, null, 2));

function keyEvent(code, patch = {}) {
  return {
    code,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
    keyCode: 0,
    target: {tagName: "BUTTON", closest: () => null},
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {},
    ...patch
  };
}

function createFakeDocument() {
  const listeners = new Map();
  const hint = new FakeElement("shortcut-toast");
  const mapToast = new FakeElement("map-toast");
  const action = new FakeElement("save-browser-storage");
  hint.hidden = true;
  mapToast.hidden = true;
  const elements = {"shortcut-toast": hint, "map-toast": mapToast, "save-browser-storage": action};
  const view = {
    navigator: {platform: "Win32"},
    setTimeout,
    clearTimeout,
    queueMicrotask,
    MutationObserver: class {
      observe() {}
      disconnect() {}
    }
  };
  const documentRef = {
    defaultView: view,
    body: {},
    getElementById: id => elements[id] || null,
    querySelectorAll: selector => selector === "#save-browser-storage" ? [action] : [],
    querySelector: () => null,
    addEventListener(type, handler) {
      const handlers = listeners.get(type) || [];
      handlers.push(handler);
      listeners.set(type, handlers);
    },
    removeEventListener(type, handler) {
      listeners.set(type, (listeners.get(type) || []).filter(item => item !== handler));
    }
  };
  return {
    documentRef,
    hint,
    mapToast,
    action,
    dispatch(type, event) {
      for (const handler of listeners.get(type) || []) handler(event);
    }
  };
}

function tick() {
  return Promise.resolve();
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
