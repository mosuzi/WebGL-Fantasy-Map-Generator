#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {
  isSelectionForLabelItem,
  shouldShowDefaultSelectionMarker
} from "../app/webgl-generator/src/renderer/selection-marker-policy.js";

const visible = item => ({...item, visible: true});
const hidden = item => ({...item, visible: false});

assert.equal(shouldShowDefaultSelectionMarker({kind: "city", id: 7}, {
  cities: [visible({id: "7"})]
}), true, "城市标签隐藏时没有用圆环强化可见城镇图标");
assert.equal(shouldShowDefaultSelectionMarker({kind: "city", id: 7}, {
  cities: [visible({id: "7"})],
  labels: [visible({targetKind: "city", targetId: 7})]
}), false, "可见城市标签已有红色高亮时仍显示圆环");
assert.equal(shouldShowDefaultSelectionMarker({kind: "city", id: 7}, {
  cities: [hidden({id: 7})],
  labels: [visible({targetKind: "city", targetId: 7})]
}), false, "可见城镇标签已有高亮时仍显示默认圆点");
assert.equal(shouldShowDefaultSelectionMarker({kind: "city", id: 7}, {
  cities: [hidden({id: 7})],
  labels: [hidden({targetKind: "city", targetId: 7})]
}), true, "城镇自身反馈不可见时没有恢复默认圆点");

const customLabel = {targetKind: "custom", targetId: 12};
const labelSelection = {kind: "label", id: 12, targetKind: "custom", targetId: "12"};
assert.equal(isSelectionForLabelItem(labelSelection, customLabel), true, "标签目标没有兼容字符串与数字 id");
assert.equal(shouldShowDefaultSelectionMarker(labelSelection, {labels: [visible(customLabel)]}), false, "可见标签已有高亮时仍显示默认圆点");
assert.equal(shouldShowDefaultSelectionMarker(labelSelection, {labels: [hidden(customLabel)]}), true, "标签不可见时没有恢复默认圆点");

assert.equal(shouldShowDefaultSelectionMarker({kind: "marker", id: "mine:2"}, {
  markers: [visible({id: "mine:2"})]
}), false, "可见地图标记已有高亮时仍显示默认圆点");
assert.equal(shouldShowDefaultSelectionMarker({kind: "marker", id: "mine:2"}, {
  markers: [hidden({id: "mine:2"})]
}), true, "地图标记不可见时没有恢复默认圆点");
assert.equal(shouldShowDefaultSelectionMarker({kind: "military", id: "3:8"}, {
  military: [visible({id: "3:8"})]
}), false, "可见军事标签已有高亮时仍显示默认圆点");
assert.equal(shouldShowDefaultSelectionMarker({kind: "military", id: "3:8"}, {
  military: [hidden({id: "3:8"})]
}), true, "军事标签不可见时没有恢复默认圆点");
assert.equal(shouldShowDefaultSelectionMarker({kind: "note", id: 4}), true, "独立备注丢失默认圆点反馈");
assert.equal(shouldShowDefaultSelectionMarker({kind: "route", id: 4}), false, "非点对象错误启用了默认圆点");
assert.equal(shouldShowDefaultSelectionMarker(null), false, "空选择错误启用了默认圆点");

const [rendererSource, stylesSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/renderer/placeholder-renderer.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/styles.css", import.meta.url), "utf8")
]);

assert.match(rendererSource, /updateMilitaryIcons\([\s\S]*updateSelectionMarker\(rect\)/, "默认圆点策略没有在各类自身高亮完成后执行");
assert.match(rendererSource, /shouldShowDefaultSelectionMarker\(this\.selection,\s*\{[\s\S]*military:\s*this\.militaryIconItems/, "渲染器没有向默认圆点策略提供各类可见状态");
assert.match(rendererSource, /classList\.toggle\("selection-marker--city", this\.selection\?\.kind === OBJECT_KIND\.CITY\)/, "城市圆环没有独立红色语义类");
for (const selector of ["city-label.selected", "custom-label.selected", "city-map-icon.selected", "marker-map-icon.selected", "military-map-icon.selected"]) {
  assert.match(stylesSource, new RegExp(selector.replaceAll(".", "\\.")), `${selector} 缺少自身选中样式`);
}
assert.match(stylesSource, /\.city-label\.selected \.map-label-content\s*\{[^}]*background:\s*transparent;[^}]*color:\s*#ff2f45;[^}]*text-shadow:/, "城市标签仍使用网页选区式矩形或缺少红色高亮");
assert.match(stylesSource, /\.selection-marker\.selection-marker--city\s*\{[^}]*border-color:\s*#ff2f45;[^}]*box-shadow:/, "城市标签隐藏时的圆环没有红色定位样式");

console.log(JSON.stringify({
  ok: true,
  intrinsicKinds: ["city", "label", "marker", "military"],
  fallbackKind: "note",
  hiddenIntrinsicFallsBack: true
}, null, 2));
