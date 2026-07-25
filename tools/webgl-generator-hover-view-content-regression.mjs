#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {buildHoverRowEntries, HOVER_VIEW_MODES, hoverViewTitle} from "../app/webgl-generator/src/ui/hover-overlay-content.js";

const pick = {
  gridCell: 81,
  packCell: 42,
  featureId: 7,
  featureType: "island",
  featureLand: true,
  height: 64,
  packHeight: 57,
  temperature: 18,
  precipitation: 93,
  biomeId: 6,
  biome: "温带落叶阔叶林",
  biomeDescription: "温带湿润地区的落叶阔叶森林。",
  packBiome: "温带落叶阔叶林",
  packBiomeDescription: "温带湿润地区的落叶阔叶森林。",
  suitability: 88,
  flux: 31,
  cultureId: 2,
  religionId: 3,
  stateId: 1,
  provinceId: 4,
  regionId: 5,
  culture: "河谷文化",
  religion: "群山信仰",
  state: "青岚",
  province: "临川",
  region: "北境",
  city: "none",
  population: 3250
};
const map = {
  politics: {
    states: [null, {i: 1, name: "青岚", fullName: "青岚王国", formName: "王国", diplomacy: ["x", "x", "Friendly"]}, null, null, null, null, {i: 6, name: "白沙", fullName: "白沙共和国", diplomacy: ["x", "Friendly"]}],
    provinces: [null, null, null, null, {i: 4, name: "临川", fullName: "临川郡"}],
    regions: [null, null, null, null, null, {i: 5, name: "北境"}]
  }
};

const expectedLabels = {
  height: ["高度", "地貌", "温度", "降水"],
  temperature: ["温度", "地貌", "高度", "降水"],
  precipitation: ["降水", "地貌", "高度", "温度"],
  biomes: ["生物群系", "说明", "高度", "地貌", "温度", "降水"],
  cultures: ["文化", "高度", "地貌", "温度", "降水"],
  religions: ["宗教", "文化", "高度", "地貌", "温度", "降水"],
  diplomacy: ["参照国家", "国家", "外交关系", "高度", "地貌", "温度", "降水"],
  governments: ["国家", "政体", "高度", "地貌", "温度", "降水"],
  states: ["国家", "省份", "高度", "地貌", "温度", "降水"],
  provinces: ["省份", "国家", "高度", "地貌", "温度", "降水"],
  regions: ["区域", "国家", "高度", "地貌", "温度", "降水"],
  population: ["人口", "适居度", "高度", "地貌", "温度", "降水"]
};
const basicLabels = ["高度", "地貌", "温度", "降水"];

assert.deepEqual(HOVER_VIEW_MODES, Object.keys(expectedLabels), "悬停 registry 与视图分母不一致");
for (const mode of HOVER_VIEW_MODES) {
  const rows = buildHoverRowEntries(pick, {}, {colorMode: mode, map, viewOptions: {diplomacySubjectId: 6}});
  assert.deepEqual(rows.map(row => row.label), expectedLabels[mode], `${mode} 视图行集合不正确`);
  for (const label of basicLabels) assert.equal(rows.filter(row => row.label === label).length, 1, `${mode} 视图没有恰好一条${label}基础信息`);
  assert(rows.every(row => String(row.value).trim() && !String(row.value).includes("[object Object]")), `${mode} 视图含空值或隐式对象文本`);
  assert(hoverViewTitle(mode) !== "地图信息", `${mode} 视图缺少标题`);
}

const biomeRows = buildHoverRowEntries({...pick, city: "临川城", object: {kind: "city", id: 8, name: "临川城"}}, {}, {colorMode: "biomes", map});
assert.deepEqual(biomeRows, [
  {label: "生物群系", value: "温带落叶阔叶林"},
  {label: "说明", value: "温带湿润地区的落叶阔叶森林。"},
  {label: "高度", value: "1,521 米"},
  {label: "地貌", value: "岛屿"},
  {label: "温度", value: "18°C"},
  {label: "降水", value: "9,300 mm"}
], "生物群系视图没有保留主题说明与统一基础信息");

const stateWithCity = buildHoverRowEntries({...pick, city: "临川城", object: {kind: "city", id: 8, name: "临川城"}}, {}, {colorMode: "states", map});
assert.equal(stateWithCity[0].label, "对象", "国家视图没有保留必要的城市对象摘要");
const diplomacyRows = buildHoverRowEntries(pick, {}, {colorMode: "diplomacy", map, viewOptions: {diplomacySubjectId: 6}});
assert.equal(diplomacyRows.find(row => row.label === "外交关系")?.value, "友好");

const fallback = buildHoverRowEntries(pick, {}, {colorMode: "future-view", map});
assert.deepEqual(fallback.map(row => row.label), ["地貌", "气候", "政区", "社会", "人口"], "未知视图没有安全回退");
assert.doesNotMatch(JSON.stringify(buildHoverRowEntries({...pick, culture: {legacy: true}}, {}, {colorMode: "future-view", map})), /\[object Object\]/, "旧结构值被隐式字符串化");
const debug = buildHoverRowEntries(pick, {}, {colorMode: "biomes", map, debugEnabled: true});
assert.deepEqual(debug.slice(-3).map(row => row.label), ["诊断·位置", "诊断·地形", "诊断·原始值"], "调试诊断没有独立附加");
assert.deepEqual(debug.slice(0, 6).map(row => row.label), expectedLabels.biomes, "调试模式破坏了生物群系主题或基础行");

const [controlSource, pickingSource, panelSource, appSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/ControlPanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/renderer/picking.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/panel.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8")
]);
const controlModes = [...controlSource.matchAll(/\{value: "([^"]+)", label: "(?:高度|温度|降水|生物群系|文化|宗教|外交|政体|国家|省份|区域|人口)"\}/g)].map(match => match[1]);
assert.deepEqual(controlModes, HOVER_VIEW_MODES, "控制面板视图与悬停 registry 漂移");
for (const id of ["cultureId", "religionId", "stateId", "provinceId", "regionId", "packBiomeDescription"]) assert.match(pickingSource, new RegExp(`\\b${id}\\b`), `pick 结果缺少 ${id}`);
assert.match(panelSource, /buildHoverRowEntries\(pick, preferences\.units, \{debugEnabled, colorMode, map: state\?\.map, viewOptions: rendererStats\.viewOptions\}\)/);
assert.match(appSource, /state\.renderer\?\.setColorMode\?\.\(nextMode\);[\s\S]{0,160}updatePickPanel\(documentRef, state\);/, "切换视图后没有即时刷新现有悬停内容");

console.log(JSON.stringify({ok: true, modes: HOVER_VIEW_MODES, biomeRows, fallbackRows: fallback.length, diagnostics: debug.slice(-3).map(row => row.label)}, null, 2));
