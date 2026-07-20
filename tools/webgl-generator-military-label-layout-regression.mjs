#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {
  MILITARY_CITY_LABEL_AVOID_SCALE,
  resolveMilitaryLabelPlacement
} from "../app/webgl-generator/src/renderer/military-label-layout.js";

const cityLabel = {left: 70, right: 130, top: 70, bottom: 94};
const placement = resolveMilitaryLabelPlacement({
  screen: {x: 100, y: 94},
  width: 64,
  height: 24,
  cityLabelBoxes: [cityLabel],
  viewport: {width: 300, height: 220},
  padding: 4
});
assert.equal(MILITARY_CITY_LABEL_AVOID_SCALE, 1.25, "军事标签城市名避让缩放阈值发生漂移");
assert.equal(placement.avoided, true, "军事标签与城市名相交时没有找到避让位置");
assert.equal(placement.blocked, false, "已有可用避让位置却被标为阻断");
assert.ok(placement.box.top >= cityLabel.bottom + 4, "军事标签没有优先移动到城市名下方");

const clear = resolveMilitaryLabelPlacement({
  screen: {x: 220, y: 160},
  width: 64,
  height: 24,
  cityLabelBoxes: [cityLabel],
  viewport: {width: 300, height: 220}
});
assert.equal(clear.avoided, false, "未相交军事标签发生无意义偏移");
assert.equal(clear.blocked, false, "未相交军事标签被错误阻断");

const [rendererSource, stylesSource, exportSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/renderer/placeholder-renderer.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/map-file-io.js", import.meta.url), "utf8")
]);

assert.match(rendererSource, /node\.append\(symbol, count\)/, "军事标签 DOM 没有保持军种图标在兵力数字左侧");
assert.match(rendererSource, /occupiedCityLabels[\s\S]*resolveMilitaryLabelPlacement/, "军事标签没有读取可见城市名碰撞盒");
assert.match(rendererSource, /setOverlayNodePosition\(item\.node, placement\.screen\.x, placement\.screen\.y\)/, "军事标签没有应用避让后的屏幕位置");
assert.match(stylesSource, /\.military-map-icon-symbol\s*\{[^}]*flex:\s*0 0 22px;[^}]*margin-right:\s*6px;/s, "军种图标没有固定在标签最左侧");

const cityLabelLayer = zIndexOf(stylesSource, ".city-label");
const cityIconLayer = zIndexOf(stylesSource, ".city-map-icon");
const militaryLayer = zIndexOf(stylesSource, ".military-map-icon");
assert.ok(cityLabelLayer > cityIconLayer, "城市名文字层级没有高于城市图标");
assert.ok(cityLabelLayer > militaryLayer, "城市名文字层级没有高于军事标签");
assert.match(exportSource, /isPaintedColor\(background\) \|\| isPaintedColor\(borderColor\)/, "PNG 导出没有单独保留透明底板上的国家色边框");

console.log(JSON.stringify({
  ok: true,
  avoidScale: MILITARY_CITY_LABEL_AVOID_SCALE,
  shiftedBy: {
    x: placement.screen.x - 100,
    y: placement.screen.y - 94
  },
  layers: {cityLabel: cityLabelLayer, cityIcon: cityIconLayer, military: militaryLayer}
}, null, 2));

function zIndexOf(source, selector) {
  const match = source.match(new RegExp(`(?:^|\\n)${escapeRegExp(selector)}\\s*\\{([\\s\\S]*?)\\}`));
  assert.ok(match, `缺少 ${selector} 样式规则`);
  const zIndex = match[1].match(/z-index:\s*(\d+);/);
  assert.ok(zIndex, `${selector} 缺少显式 z-index`);
  return Number(zIndex[1]);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
