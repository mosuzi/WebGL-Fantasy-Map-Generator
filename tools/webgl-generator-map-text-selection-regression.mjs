#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const [stylesSource, indexSource, shortcutsSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/index.html", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/keyboard-shortcuts.js", import.meta.url), "utf8")
]);

const selectionRule = extractRule(stylesSource, "#map-canvas");
const requiredDisplayLayers = [
  "#map-canvas",
  ".map-overlay",
  ".map-badge",
  ".generation-loading-bubble",
  ".map-toast",
  ".shortcut-toast",
  ".hover-overlay",
  ".map-legend",
  ".map-scale-bar",
  ".measurement-overlay"
];

for (const selector of requiredDisplayLayers) {
  assert(selectionRule.selectors.includes(selector), `地图展示层缺少禁选契约：${selector}`);
}
assert.match(selectionRule.body, /-webkit-user-select:\s*none;/);
assert.match(selectionRule.body, /(?<!-webkit-)user-select:\s*none;/);

for (const editableBoundary of [".floating-panel-layer", ".floating-panel", "input", "textarea", "[contenteditable]"]) {
  assert(!selectionRule.selectors.includes(editableBoundary), `可编辑边界被误纳入地图禁选契约：${editableBoundary}`);
}
assert.doesNotMatch(stylesSource, /\.map-stage\s*\{[^}]*user-select:\s*none/s, "不得让管理面板继承地图禁选契约");

for (const id of ["map-overlay", "map-badge", "map-toast", "shortcut-toast", "hover-overlay", "map-legend", "map-scale-bar", "measurement-overlay"]) {
  assert.match(indexSource, new RegExp(`id=["']${id}["']`), `页面缺少受保护的地图展示层：${id}`);
}
assert.doesNotMatch(shortcutsSource, /(?:KeyA|key\s*===\s*["']a["']).{0,160}preventDefault/s, "不得以全局 Ctrl+A 拦截替代选择边界");

console.log(JSON.stringify({
  ok: true,
  protectedLayers: requiredDisplayLayers.length,
  editableBoundaryInherited: false,
  globalSelectAllIntercepted: false
}, null, 2));

function extractRule(source, firstSelector) {
  const start = source.indexOf(firstSelector);
  assert.notEqual(start, -1, `缺少样式选择器：${firstSelector}`);
  const open = source.indexOf("{", start);
  const close = source.indexOf("}", open);
  assert(open > start && close > open, `无法解析样式规则：${firstSelector}`);
  return {
    selectors: source.slice(start, open).split(",").map(selector => selector.trim()),
    body: source.slice(open + 1, close)
  };
}
