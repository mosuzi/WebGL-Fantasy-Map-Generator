#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {resizeCanvasToDisplaySize} from "../app/webgl-generator/src/renderer/canvas-display-size.js";

const rendererSource = await readFile(new URL("../app/webgl-generator/src/renderer/placeholder-renderer.js", import.meta.url), "utf8");
const viewport = {width: 800, height: 600};
const view = {devicePixelRatio: 1.25};
const stage = {
  clientWidth: viewport.width,
  clientHeight: viewport.height,
  getBoundingClientRect: () => ({width: viewport.width, height: viewport.height})
};
const canvas = {
  style: {},
  width: 0,
  height: 0,
  clientWidth: viewport.width,
  clientHeight: viewport.height,
  parentElement: stage,
  ownerDocument: {defaultView: view}
};
const overlay = {style: {}};

const initial = resizeCanvasToDisplaySize(canvas, overlay, stage);
assert.equal(initial.changed, true);
assert.deepEqual(initial.size, {cssWidth: 800, cssHeight: 600, width: 1000, height: 750, pixelRatio: 1.25});
assert.equal(canvas.style.width, "800px");
assert.equal(canvas.style.height, "600px");
assert.equal(overlay.style.width, "800px");
assert.equal(overlay.style.height, "600px");
assert.equal(resizeCanvasToDisplaySize(canvas, overlay, stage).changed, false, "尺寸未变时不应重复触发重绘");

viewport.width = 1200;
viewport.height = 700;
view.devicePixelRatio = 2;
const resized = resizeCanvasToDisplaySize(canvas, overlay, stage);
assert.equal(resized.changed, true);
assert.deepEqual(resized.size, {cssWidth: 1200, cssHeight: 700, width: 1800, height: 1050, pixelRatio: 1.5});
assert.equal(canvas.style.width, "1200px");
assert.equal(canvas.style.height, "700px");
assert.equal(overlay.style.width, "1200px");
assert.equal(overlay.style.height, "700px");

assert.doesNotMatch(rendererSource, /lockCanvasToInitialDisplaySize/, "renderer 仍把画布永久锁定在首次显示尺寸");
assert.match(rendererSource, /this\.resizeObserver\.observe\(this\.stage\)/, "renderer 没有观察地图容器尺寸变化");
assert.match(rendererSource, /view\.addEventListener\("resize", this\.handleDisplayResize/, "renderer 没有监听窗口或浏览器缩放变化");
assert.match(rendererSource, /view\.requestAnimationFrame\(\(\) => \{[\s\S]*?this\.resizeToDisplaySize\(\);/, "连续 resize 没有按动画帧收敛");
assert.match(rendererSource, /this\.markViewportBuffersDirty\(\);[\s\S]*?this\.draw\(\);[\s\S]*?this\.onViewChange\(\);/, "尺寸变化后没有同步 GPU、overlay 与视图状态");

console.log(JSON.stringify({
  ok: true,
  initial: initial.size,
  resized: resized.size,
  observer: "ResizeObserver + window.resize",
  scheduling: "requestAnimationFrame"
}, null, 2));
