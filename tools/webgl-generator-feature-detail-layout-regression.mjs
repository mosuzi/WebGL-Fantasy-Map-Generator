#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {buildFeatureDetailRows} from "../app/webgl-generator/src/ui/vue/components/feature-detail-layout.js";

const featureKinds = [
  {id: 1, typeLabel: "海洋", groupLabel: "大洋", land: false},
  {id: 2, typeLabel: "湖泊", groupLabel: "淡水湖", land: false},
  {id: 3, typeLabel: "岛屿", groupLabel: "岛屿", land: true}
];
const numericFields = {
  border: true,
  cells: 2310,
  area: 77250000,
  shorelineCells: 1282,
  havenCells: 18,
  harborScore: 2726,
  height: 0,
  flux: 0,
  evaporation: 0,
  firstCell: 7
};
const expectedKeys = ["id", "type", "group", "land", "border", "cells", "area", "shoreline", "haven", "harbor", "height", "flux", "evaporation", "first-cell"];
const expectedGroups = ["identity", "identity", "identity", "identity", "identity", "identity", "coast", "coast", "hydrology", "hydrology", "hydrology", "hydrology", "hydrology", "debug"];

for (const feature of featureKinds) {
  const rows = buildFeatureDetailRows({...numericFields, ...feature}, {
    formatNumber: value => Number(value).toLocaleString("zh-CN"),
    formatArea: value => `${Number(value).toLocaleString("zh-CN")} 平方公里`
  });
  assert.deepEqual(rows.map(row => row.key), expectedKeys, `${feature.typeLabel} 详情字段顺序漂移`);
  assert.deepEqual(rows.map(row => row.group), expectedGroups, `${feature.typeLabel} 详情分组漂移`);
  assert.deepEqual(rows.filter(row => row.wide).map(row => row.key), ["area"], `${feature.typeLabel} 不应让逗号数值自动扩列`);
  assert.equal(rows.find(row => row.key === "area").value, "77,250,000 平方公里");
  assert.equal(rows.find(row => row.key === "harbor").value, "2,726");
  assert.equal(rows.at(-1).debug, true);
  assert(rows.every(row => row.value !== undefined && row.value !== null), `${feature.typeLabel} 出现空详情值`);
}
assert.deepEqual(buildFeatureDetailRows(null), []);

const [componentSource, stylesSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/FeaturePanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/styles.css", import.meta.url), "utf8")
]);
assert.match(componentSource, /<UiDetailGrid[^>]*class-name="feature-panel-details"[^>]*:auto-wide="false"/, "Feature 详情仍会按逗号自动扩列");
assert.match(stylesSource, /\.feature-panel-details\s*\{[^}]*grid-template-columns:\s*repeat\(3,[^}]*column-gap:\s*12px;[^}]*row-gap:\s*6px;/s, "桌面三列紧凑布局契约缺失");
assert.match(stylesSource, /@container \(max-width: 520px\)[\s\S]*?\.feature-panel-details\s*\{[^}]*repeat\(2,/s, "中窄面板双列回退缺失");
assert.match(stylesSource, /@container \(max-width: 320px\)[\s\S]*?\.feature-panel-details\s*\{[^}]*minmax\(0, 1fr\)/s, "窄面板单列回退缺失");

console.log(JSON.stringify({
  ok: true,
  featureKinds: featureKinds.map(feature => feature.typeLabel),
  rows: expectedKeys.length - 1,
  wideFields: ["area"],
  responsiveColumns: [3, 2, 1]
}, null, 2));
