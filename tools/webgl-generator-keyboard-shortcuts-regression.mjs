#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {
  buildShortcutDisplayModel,
  hasOpenFrameworkPopup,
  installKeyboardShortcuts,
  isEditableShortcutTarget,
  KEYBOARD_SHORTCUTS,
  SCENARIO_SHORTCUTS,
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

const defaultDisplay = buildShortcutDisplayModel({platform: "default"});
const macDisplay = buildShortcutDisplayModel({platform: "mac"});
assert.equal(defaultDisplay.globalShortcutCount, 22, "展示模型改变了全局快捷键分母");
assert.equal(defaultDisplay.globalBindingCount, 23, "展示模型改变了全局按键组分母");
assert.equal(defaultDisplay.scenarioShortcutCount, 2, "展示模型缺少场景快捷键");
assert.equal(defaultDisplay.totalDescriptionCount, 24, "展示模型说明项总数不是 24");
assert.deepEqual(defaultDisplay.groups.map(group => group.id), ["file", "editing", "view", "panels", "scenario"], "展示模型没有按用途稳定分组");
const defaultDisplayItems = defaultDisplay.groups.flatMap(group => group.items);
const defaultGlobalItems = defaultDisplayItems.filter(item => item.kind === "global");
const defaultScenarioItems = defaultDisplayItems.filter(item => item.kind === "scenario");
assert.deepEqual(defaultGlobalItems.map(item => item.id), KEYBOARD_SHORTCUTS.map(item => item.id), "展示模型没有完整派生 KEYBOARD_SHORTCUTS");
assert.deepEqual(defaultScenarioItems.map(item => item.id), SCENARIO_SHORTCUTS.map(item => item.id), "展示模型没有完整派生场景快捷键");
for (const item of KEYBOARD_SHORTCUTS) {
  const display = defaultGlobalItems.find(candidate => candidate.id === item.id);
  assert.equal(display.label, item.label, `${item.id} 展示文案没有复用 registry`);
  assert.deepEqual(display.bindingLabels, item.bindings.map(itemBinding => shortcutBindingLabel(itemBinding, "default")), `${item.id} 展示按键没有复用 shortcutBindingLabel`);
}
assert.deepEqual(defaultScenarioItems.map(item => [item.id, item.bindingLabel]), [
  ["scenario.measurement.delete-point", "Delete / Backspace"],
  ["scenario.color.confirm-hex", "Enter"]
]);
assert.equal(macDisplay.groups.flatMap(group => group.items).find(item => item.id === "file.save-browser").bindingLabel, "⌘S", "Mac 展示模型没有复用 platform 标签");
assert(Object.isFrozen(defaultDisplay) && Object.isFrozen(defaultDisplay.groups) && defaultDisplay.groups.every(group => Object.isFrozen(group.items)), "展示模型没有保持只读");

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
fake.dispatch("keydown", keyEvent("KeyS", {ctrlKey: true, target: fake.action, defaultPrevented: true}));
fake.frameworkPopups = [visiblePopup()];
assert.equal(hasOpenFrameworkPopup(fake.documentRef), true);
fake.dispatch("keydown", keyEvent("KeyS", {ctrlKey: true, target: fake.action}));
fake.frameworkPopups = [];
fake.exclusiveModals = [visiblePopup()];
fake.dispatch("keydown", keyEvent("KeyS", {ctrlKey: true, target: fake.action}));
fake.exclusiveModals = [];
await tick();
assert.equal(executions, 1, "已消费事件、repeat / IME、输入控件、popup 或独占浮层触发了普通快捷键");

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

const cancel = KEYBOARD_SHORTCUTS.find(item => item.id === "selection.cancel");
let cancelExecutions = 0;
const cancelController = installKeyboardShortcuts(fake.documentRef, {
  registry: [cancel],
  execute: () => cancelExecutions++
});
const editableEscape = keyEvent("Escape", {key: "Escape", target: {tagName: "INPUT"}});
fake.dispatch("keydown", editableEscape);
await tick();
assert.equal(editableEscape.defaultPrevented, true, "输入控件内 Escape 没有进入逐级退出仲裁");
assert.equal(cancelExecutions, 1, "输入控件内 Escape 未执行唯一退出动作");
cancelController.destroy();

const [appSource, controlPanelSource, colorFieldSource, indexSource, stylesSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/ControlPanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/base/UiColorField.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/index.html", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/styles.css", import.meta.url), "utf8")
]);
assert.match(appSource, /installKeyboardShortcuts\(documentRef/);
assert.match(appSource, /executeKeyboardShortcut\(state, documentRef, item, runtimePanelHandlers\)/);
assert.match(appSource, /const activeModeId = state\.canvasToolModes\.getActive\(\)\?\.id/);
assert.match(appSource, /if \(activeModeId\) return cancelCanvasToolMode\(state, documentRef, activeModeId, "escape"\)/);
assert.match(appSource, /if \(state\.editingObject\) return invokePublicApi\(documentRef, "selection\.stopEditing"\)/);
assert.match(appSource, /if \(state\.selection\) return invokePublicApi\(documentRef, "selection\.clear"\)/);
assert.doesNotMatch(appSource.slice(appSource.indexOf("function canExecuteKeyboardShortcut"), appSource.indexOf("async function invokePublicApi")), /CANVAS_TOOL_MODE\./, "Escape 退出仍依赖具体画布模式白名单");
const canvasModeBlock = appSource.slice(appSource.indexOf("export const CANVAS_TOOL_MODE"), appSource.indexOf("export function createGeneratorApp"));
const canvasModeKeys = [...canvasModeBlock.matchAll(/^\s{2}([A-Z0-9_]+):\s*"[^"]+"/gm)].map(match => match[1]);
const registrationScope = appSource.slice(appSource.indexOf("function registerCanvasToolModes"), appSource.indexOf("function enterCanvasToolMode"));
const registeredCanvasModeKeys = [...registrationScope.matchAll(/CANVAS_TOOL_MODE\.([A-Z0-9_]+)/g)].map(match => match[1]);
assert.equal(canvasModeKeys.length, 29, "当前运行时画布模式分母漂移时必须重新冻结 Escape 验收");
assert.deepEqual([...new Set(registeredCanvasModeKeys)].sort(), [...canvasModeKeys].sort(), "存在未接入通用注册器的画布模式");
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
assert.match(appSource, /if \(event\.key !== "Delete" && event\.key !== "Backspace"\) return;[\s\S]*deleteMeasurementPoint\(state, documentRef, index\);/, "测量点场景文案没有 Delete / Backspace 的真实行为证据");
assert.match(colorFieldSource, /@keydown\.enter\.prevent="commitHexDraft"/, "HEX 颜色场景文案没有 Enter 提交的真实行为证据");

console.log(JSON.stringify({
  ok: true,
  shortcuts: summary.shortcuts,
  bindings: summary.bindings,
  displayDescriptions: defaultDisplay.totalDescriptionCount,
  scenarioShortcuts: defaultDisplay.scenarioShortcutCount,
  groups: [...new Set(KEYBOARD_SHORTCUTS.map(item => item.group))],
  platformLabels: {default: "Ctrl+S", mac: "⌘S"},
  hintDelayCovered: true,
  mapToastPriorityCovered: true,
  scenarioBehaviorEvidence: true,
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
    querySelectorAll: selector => {
      if (selector === "#save-browser-storage") return [action];
      if (selector.includes(".el-select__popper")) return fakeResult.frameworkPopups;
      if (selector.includes("[aria-modal")) return fakeResult.exclusiveModals;
      return [];
    },
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
  const fakeResult = {
    documentRef,
    hint,
    mapToast,
    action,
    frameworkPopups: [],
    exclusiveModals: [],
    dispatch(type, event) {
      for (const handler of listeners.get(type) || []) handler(event);
    }
  };
  return fakeResult;
}

function tick() {
  return Promise.resolve();
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function visiblePopup() {
  return {
    hidden: false,
    isConnected: true,
    style: {},
    getAttribute: () => "false",
    getClientRects: () => [{}]
  };
}
