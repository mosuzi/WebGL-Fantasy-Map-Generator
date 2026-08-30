import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  classifyViewportWheelIntent,
  installViewportInputController,
  normalizeViewportWheelDelta
} from "../app/webgl-generator/src/renderer/viewport-input-controller.js";

class FakeTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(name, handler) {
    const handlers = this.listeners.get(name) || [];
    handlers.push(handler);
    this.listeners.set(name, handlers);
  }

  removeEventListener(name, handler) {
    this.listeners.set(name, (this.listeners.get(name) || []).filter(candidate => candidate !== handler));
  }

  emit(name, patch = {}) {
    const event = {
      type: name,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      ...patch
    };
    for (const handler of [...(this.listeners.get(name) || [])]) handler(event);
    return event;
  }
}

class FakeCanvas extends FakeTarget {
  constructor(ownerDocument) {
    super();
    this.ownerDocument = ownerDocument;
    this.dataset = {};
    this.captures = new Set();
    const classes = new Set();
    this.classList = {
      add: value => classes.add(value),
      remove: value => classes.delete(value),
      toggle: (value, enabled) => enabled ? classes.add(value) : classes.delete(value)
    };
  }

  getBoundingClientRect() {
    return {left: 0, top: 0, width: 800, height: 600};
  }

  setPointerCapture(pointerId) {
    this.captures.add(pointerId);
  }

  hasPointerCapture(pointerId) {
    return this.captures.has(pointerId);
  }

  releasePointerCapture(pointerId) {
    this.captures.delete(pointerId);
  }
}

assert.equal(classifyViewportWheelIntent({ctrlKey: true, deltaMode: 0, deltaX: 0, deltaY: 12}), "zoom");
assert.equal(classifyViewportWheelIntent({ctrlKey: false, deltaMode: 0, deltaX: 3, deltaY: 100}), "pan");
assert.equal(classifyViewportWheelIntent({ctrlKey: false, deltaMode: 1, deltaX: 3, deltaY: 1}), "zoom");
assert.equal(classifyViewportWheelIntent({ctrlKey: false, deltaMode: 0, deltaX: 0, deltaY: 12}), "pan");
assert.equal(classifyViewportWheelIntent({ctrlKey: false, deltaMode: 0, deltaX: 0, deltaY: 60.5}), "pan");
assert.equal(classifyViewportWheelIntent({ctrlKey: false, deltaMode: 0, deltaX: 0, deltaY: 100}), "zoom");
assert.deepEqual(normalizeViewportWheelDelta({deltaMode: 1, deltaX: 2, deltaY: -3}, {height: 600}), {x: 32, y: -48});
assert.deepEqual(normalizeViewportWheelDelta({deltaMode: 2, deltaX: 0, deltaY: 3}, {height: 600}), {x: 0, y: 1200});

const mouse = createHarness();
mouse.canvas.emit("pointerdown", pointer({pointerId: 1, clientX: 100, clientY: 100}));
mouse.canvas.emit("pointerup", pointer({pointerId: 1, clientX: 100, clientY: 100}));
assert.equal(mouse.selections.length, 1, "主键无移动应保持选择");
assert.deepEqual(mouse.camera, {scale: 1, offsetX: 0, offsetY: 0}, "主键点击不得移动相机");

mouse.canvas.emit("pointerdown", pointer({pointerId: 2, clientX: 100, clientY: 100}));
mouse.canvas.emit("pointermove", pointer({pointerId: 2, clientX: 103, clientY: 102}));
assert.equal(mouse.changes.length, 0, "阈值内移动不得提前平移");
mouse.canvas.emit("pointermove", pointer({pointerId: 2, clientX: 112, clientY: 108}));
mouse.canvas.emit("pointerup", pointer({pointerId: 2, clientX: 112, clientY: 108}));
assert.equal(mouse.selections.length, 1, "主键拖动不得误触选择");
assert.equal(mouse.starts.length, 1, "跨阈值后应只启动一次导航");
assert.equal(mouse.ends.length, 1, "主键平移应只结束一次导航");
assert.notEqual(mouse.camera.offsetX, 0, "主键拖动应改变相机");

const mouseButtons = createHarness();
mouseButtons.canvas.emit("pointerdown", pointer({pointerId: 30, button: 1, buttons: 4, clientX: 200, clientY: 200}));
mouseButtons.canvas.emit("pointermove", pointer({pointerId: 30, button: -1, buttons: 4, clientX: 230, clientY: 215}));
mouseButtons.canvas.emit("pointerup", pointer({pointerId: 30, button: 1, buttons: 0, clientX: 230, clientY: 215}));
assert.equal(mouseButtons.starts.length, 1, "中键应立即启动平移");
assert.notEqual(mouseButtons.camera.offsetX, 0, "中键拖动应保持既有平移");
mouseButtons.canvas.emit("pointerdown", pointer({pointerId: 31, button: 2, buttons: 2, clientX: 200, clientY: 200}));
mouseButtons.canvas.emit("pointermove", pointer({pointerId: 31, button: -1, buttons: 2, clientX: 220, clientY: 210}));
mouseButtons.canvas.emit("pointerup", pointer({pointerId: 31, button: 2, buttons: 0, clientX: 220, clientY: 210}));
assert.equal(mouseButtons.starts.length, 2, "右键应继续启动平移");
assert.equal(mouseButtons.selections.length, 0, "中 / 右键不得触发选择");

const space = createHarness();
space.canvas.emit("pointerenter", pointer());
const keydown = space.documentRef.emit("keydown", {code: "Space", target: {tagName: "BODY"}});
assert.equal(keydown.defaultPrevented, true, "指针位于地图时空格应阻止页面滚动");
space.canvas.emit("pointerdown", pointer({pointerId: 3, clientX: 40, clientY: 40}));
assert.equal(space.starts.length, 1, "空格 + 主键应立即启动平移");
space.canvas.emit("pointermove", pointer({pointerId: 3, clientX: 60, clientY: 55}));
space.canvas.emit("pointerup", pointer({pointerId: 3, clientX: 60, clientY: 55}));
space.documentRef.emit("keyup", {code: "Space", target: {tagName: "BODY"}});
assert.equal(space.selections.length, 0, "空格拖动不得选择对象");

const wheel = createHarness();
const scaleBeforePan = wheel.camera.scale;
wheel.canvas.emit("wheel", wheelEvent({deltaY: 12, timeStamp: 10}));
assert.equal(wheel.camera.scale, scaleBeforePan, "触摸板普通滚动不得缩放");
assert.notEqual(wheel.camera.offsetY, 0, "触摸板纵向滚动应平移");
const anchorRect = wheel.canvas.getBoundingClientRect();
const anchorClient = {x: 350, y: 220};
const worldBefore = worldAtClient(wheel.camera, anchorRect, anchorClient);
wheel.canvas.emit("wheel", wheelEvent({ctrlKey: true, deltaY: -80, clientX: anchorClient.x, clientY: anchorClient.y, timeStamp: 200}));
const worldAfter = worldAtClient(wheel.camera, anchorRect, anchorClient);
assert.ok(wheel.camera.scale > scaleBeforePan, "触摸板捏合应缩放");
assert.ok(Math.abs(worldBefore.x - worldAfter.x) < 1e-9 && Math.abs(worldBefore.y - worldAfter.y) < 1e-9, "捏合缩放应保持指针锚点");
const mouseScale = wheel.camera.scale;
wheel.canvas.emit("wheel", wheelEvent({deltaY: 100, timeStamp: 400}));
assert.ok(wheel.camera.scale < mouseScale, "鼠标滚轮应保持缩放");

const touch = createHarness();
touch.canvas.emit("pointerdown", pointer({pointerId: 10, pointerType: "touch", clientX: 200, clientY: 200}));
touch.canvas.emit("pointerdown", pointer({pointerId: 11, pointerType: "touch", clientX: 300, clientY: 200}));
assert.equal(touch.controller.snapshot().pointerCount, 2, "双触点不得互相覆盖");
touch.canvas.emit("pointermove", pointer({pointerId: 11, pointerType: "touch", clientX: 340, clientY: 220}));
assert.ok(touch.camera.scale > 1, "双指距离增加应放大地图");
assert.equal(touch.starts.length, 1, "双指手势只启动一次导航");
touch.canvas.emit("pointerup", pointer({pointerId: 11, pointerType: "touch", clientX: 340, clientY: 220}));
assert.equal(touch.controller.snapshot().pointerCount, 1, "抬起一指后应保留另一触点继续平移");
const touchOffsetBefore = touch.camera.offsetX;
touch.canvas.emit("pointermove", pointer({pointerId: 10, pointerType: "touch", clientX: 220, clientY: 210}));
assert.notEqual(touch.camera.offsetX, touchOffsetBefore, "双指退回单指后应继续平移");
touch.canvas.emit("pointerup", pointer({pointerId: 10, pointerType: "touch", clientX: 220, clientY: 210}));
assert.equal(touch.ends.length, 1, "完整触摸手势只结束一次导航");

const touchSingle = createHarness();
touchSingle.canvas.emit("pointerdown", pointer({pointerId: 12, pointerType: "touch", clientX: 100, clientY: 100}));
touchSingle.canvas.emit("pointerup", pointer({pointerId: 12, pointerType: "touch", clientX: 100, clientY: 100}));
assert.equal(touchSingle.selections.length, 1, "单指轻点应保持选择");
touchSingle.canvas.emit("pointerdown", pointer({pointerId: 13, pointerType: "touch", clientX: 100, clientY: 100}));
touchSingle.canvas.emit("pointermove", pointer({pointerId: 13, pointerType: "touch", clientX: 120, clientY: 115}));
touchSingle.canvas.emit("pointercancel", pointer({pointerId: 13, pointerType: "touch", clientX: 120, clientY: 115}));
assert.equal(touchSingle.controller.snapshot().pointerCount, 0, "单指 pointercancel 必须清理状态");
assert.equal(touchSingle.selections.length, 1, "取消的单指拖动不得误选");

const cancelled = createHarness();
cancelled.canvas.emit("pointerdown", pointer({pointerId: 20, button: 1, buttons: 4}));
cancelled.canvas.emit("lostpointercapture", pointer({pointerId: 20, button: 1, buttons: 0}));
assert.deepEqual(cancelled.controller.snapshot(), {
  pointerCount: 0,
  interactionActive: false,
  spacePanActive: false,
  wheelIntent: null
}, "捕获丢失必须清空导航状态");
assert.equal(cancelled.ends.length, 1, "捕获丢失应结束活动平移");

const [rendererSource, storeSource, panelSource, controlSource, appSource, stylesSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/renderer/placeholder-renderer.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/stores/global-config-store.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/panel.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/ControlPanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/styles.css", import.meta.url), "utf8")
]);
assert.match(rendererSource, /installViewportInputController/u, "renderer 未接入统一导航控制器");
assert.doesNotMatch(rendererSource, /setNavigationInputMode/u, "renderer 不应暴露输入模式设置");
assert.doesNotMatch(storeSource, /navigationInputMode/u, "全局偏好不应保存输入模式");
assert.doesNotMatch(panelSource, /navigation-input-mode|onNavigationInputMode/u, "旧 UI bridge 不应绑定输入模式控件");
assert.doesNotMatch(controlSource, /navigation-input-mode|navigationInputModeOptions|地图导航/u, "控制面板不应展示输入模式配置");
assert.doesNotMatch(appSource, /setNavigationInputMode|onNavigationInputMode/u, "runtime 不应应用输入模式偏好");
assert.match(stylesSource, /#map-canvas\s*\{[\s\S]*?touch-action:\s*none/u, "touch-action 未限制在地图 canvas");

for (const harness of [mouse, mouseButtons, space, wheel, touch, touchSingle, cancelled]) harness.controller.destroy();

console.log(JSON.stringify({
  ok: true,
  wheel: {intent: wheel.controller.snapshot().wheelIntent, changes: wheel.changes.length},
  mouse: {selections: mouse.selections.length, starts: mouse.starts.length, ends: mouse.ends.length},
  touch: {starts: touch.starts.length, ends: touch.ends.length, scale: touch.camera.scale}
}, null, 2));

function createHarness() {
  const view = new FakeTarget();
  view.performance = {now: () => 1};
  const documentRef = new FakeTarget();
  documentRef.defaultView = view;
  const canvas = new FakeCanvas(documentRef);
  const camera = {scale: 1, offsetX: 0, offsetY: 0};
  const changes = [];
  const selections = [];
  const starts = [];
  const ends = [];
  const controller = installViewportInputController({
    canvas,
    camera,
    onChange: event => changes.push(event),
    onSelect: event => selections.push(event),
    onInteractionStart: event => starts.push(event),
    onInteractionEnd: event => ends.push(event),
    getViewportSize: () => ({width: 800, height: 600})
  });
  return {view, documentRef, canvas, camera, changes, selections, starts, ends, controller};
}

function pointer(patch = {}) {
  return {
    pointerId: 1,
    pointerType: "mouse",
    button: 0,
    buttons: 1,
    clientX: 0,
    clientY: 0,
    ...patch
  };
}

function wheelEvent(patch = {}) {
  return {
    ctrlKey: false,
    deltaMode: 0,
    deltaX: 0,
    deltaY: 0,
    clientX: 400,
    clientY: 300,
    timeStamp: 0,
    ...patch
  };
}

function worldAtClient(camera, rect, client) {
  const x = ((client.x - rect.left) / rect.width) * 2 - 1;
  const y = 1 - ((client.y - rect.top) / rect.height) * 2;
  return {x: (x - camera.offsetX) / camera.scale, y: (y - camera.offsetY) / camera.scale};
}
