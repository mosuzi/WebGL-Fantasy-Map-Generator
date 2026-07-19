#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {
  DEFAULT_UNIT_PREFERENCES,
  deleteCustomUnitDefinition,
  distanceUnitOptionsForPreferences,
  formatArea,
  formatDistance,
  normalizeUnitPreferences,
  upsertCustomUnitDefinition
} from "../app/webgl-generator/src/ui/display-units.js";
import {createMapDocument, parseMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";

const cssPxPerCm = 96 / 2.54;
const base = {...DEFAULT_UNIT_PREFERENCES, numberAbbreviation: "none", mapScaleKmPerCm: cssPxPerCm};
const builtIns = [
  ["mm", "mm²", 0.000001],
  ["cm", "cm²", 0.00001],
  ["mi", "mi²", 1.609344],
  ["ft", "ft²", 0.0003048],
  ["yd", "yd²", 0.0009144],
  ["nmi", "nmi²", 1.852]
];

for (const [distanceUnit, areaSymbol, kmPerUnit] of builtIns) {
  const preferences = normalizeUnitPreferences({...base, distanceUnit});
  assert.equal(formatDistance(kmPerUnit, preferences), `1 ${distanceUnit}`, `${distanceUnit} 距离换算不准确`);
  assert.equal(formatArea(kmPerUnit ** 2, preferences), `1 ${areaSymbol}`, `${distanceUnit} 面积换算不准确`);
}

let custom = upsertCustomUnitDefinition(base, {id: "li", name: "里", symbol: "里", kmPerUnit: 0.5});
assert.equal(custom.distanceUnit, "custom:li");
assert.equal(custom.areaUnit, "custom-area:li");
assert.equal(custom.customUnits[0].areaMode, "derived");
assert.equal(formatDistance(0.5, custom), "1 里");
assert.equal(formatArea(0.25, custom), "1 里²");
assert.deepEqual(distanceUnitOptionsForPreferences(custom).at(-1), {value: "custom:li", label: "里（里）"});

custom = upsertCustomUnitDefinition(custom, {
  id: "li",
  name: "制图里",
  symbol: "里",
  kmPerUnit: 0.6,
  areaMode: "custom",
  areaName: "方里",
  areaSymbol: "方里",
  squareKmPerUnit: 2
});
assert.equal(custom.customUnits.length, 1, "编辑自定义单位不应产生重复定义");
assert.equal(custom.customUnits[0].areaMode, "custom");
assert.equal(formatDistance(0.6, custom), "1 里");
assert.equal(formatArea(2, custom), "1 方里");

const deleted = deleteCustomUnitDefinition(custom, "li");
assert.equal(deleted.distanceUnit, DEFAULT_UNIT_PREFERENCES.distanceUnit);
assert.equal(deleted.areaUnit, DEFAULT_UNIT_PREFERENCES.areaUnit);
assert.deepEqual(deleted.customUnits, []);

const invalid = normalizeUnitPreferences({
  ...base,
  distanceUnit: "custom:broken",
  customUnits: [{id: "broken", name: "坏单位", symbol: "坏", kmPerUnit: 0}]
});
assert.equal(invalid.distanceUnit, DEFAULT_UNIT_PREFERENCES.distanceUnit, "非法自定义单位应回退默认距离单位");
assert.equal(invalid.areaUnit, DEFAULT_UNIT_PREFERENCES.areaUnit, "非法自定义单位应回退默认面积单位");
assert.equal(formatDistance(1, {...base, distanceUnit: "km-cn"}), "1 千米", "旧中文千米标识不兼容");
assert.equal(formatDistance(0.001, {...base, distanceUnit: "m"}), "1 m", "旧英文米标识不兼容");

const sourceMap = {metadata: {seed: "custom-unit-roundtrip"}, options: {visualTheme: "night"}, grid: {cells: {h: new Uint8Array([20, 21])}}};
const document = createMapDocument(sourceMap, {...sourceMap.options, display: {units: custom}});
const roundtrip = parseMapDocument(stringifyMapDocument(document));
assert.deepEqual(roundtrip.map.display.units, custom, "完整地图 JSON 没有回灌自定义单位显示配置");
assert.equal(sourceMap.display, undefined, "完整地图导出不得原地改写运行时地图");

const changedAfterImport = upsertCustomUnitDefinition(base, {id: "league", name: "里格", symbol: "lea", kmPerUnit: 4.828032});
const reexported = createMapDocument({...sourceMap, display: {units: custom}}, {...sourceMap.options, display: {units: changedAfterImport}});
assert.deepEqual(reexported.map.display.units, changedAfterImport, "再次导出没有以当前面板偏好覆盖运行时旧单位配置");

const legacyDocument = createMapDocument(sourceMap, sourceMap.options);
const legacyRoundtrip = parseMapDocument(stringifyMapDocument(legacyDocument));
assert.equal(legacyRoundtrip.map.display, undefined, "旧地图没有显示配置时不应覆盖当前用户单位偏好");

const [consoleApiSource, appSource, controlPanelSource, economyPanelSource, panelSource, mapFileSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/runtime/console-api.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/ControlPanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/EconomyPanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/panel.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/map-file-io.js", import.meta.url), "utf8")
]);
assert.equal((consoleApiSource.match(/display: \{units\}/g) || []).length, 2, "JSON 与 gzip 完整地图导出没有共用单位显示配置");
assert.match(consoleApiSource, /customUnits: units\.customUnits/, "测量集合导出缺少自定义单位定义");
assert.match(appSource, /document\.map\.display\?\.units/, "完整地图导入没有恢复单位显示配置");
assert.match(appSource, /customUnits: units\.customUnits/, "当前测量导出缺少自定义单位定义");
assert.match(controlPanelSource, /新增自定义单位/);
assert.match(controlPanelSource, /编辑当前单位/);
assert.match(controlPanelSource, /删除当前单位/);
assert.match(economyPanelSource, /units: unitPreferences\.value/, "距离相关表格 JSON 没有保存单位定义");
assert.match(economyPanelSource, /key: "distanceLabel", label: "距离（显示单位）"/, "距离相关表格没有使用共享换算结果");
assert.doesNotMatch(controlPanelSource, /unit-scale-readout|1 cm =/, "单位面板仍显示重复厘米换算关系");
assert.match(controlPanelSource, /unit-label="km\/cm"/, "比例滑动条没有保留唯一 km\/cm 单位说明");
assert.match(panelSource, /label\.textContent = formatDisplayDistance\(distance, unitPreferences\)/, "实时画布比例尺没有继续使用共享单位换算");
assert.match(mapFileSource, /element\.querySelector\("\.map-scale-label"\)/, "PNG 没有继续复刻实时比例尺标签");

console.log(JSON.stringify({
  ok: true,
  builtInUnits: builtIns.map(([id]) => id),
  customUnit: custom.customUnits[0],
  jsonRoundtrip: roundtrip.map.display.units.distanceUnit,
  legacyFallback: legacyRoundtrip.map.display === undefined,
  sharedConsumers: ["比例尺", "测量", "悬停", "统计面板", "完整地图", "测量导出"]
}, null, 2));
