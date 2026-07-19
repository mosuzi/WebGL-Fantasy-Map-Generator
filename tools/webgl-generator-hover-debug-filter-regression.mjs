import assert from "node:assert/strict";
import fs from "node:fs";
import {buildHoverRowEntries} from "../app/webgl-generator/src/ui/hover-overlay-content.js";

const pick = {
  gridCell: 81,
  packCell: 42,
  featureId: 7,
  featureType: "island",
  featureLand: true,
  height: 64,
  temperature: 18,
  precipitation: 93,
  biome: "温带落叶阔叶林",
  packBiome: "温带落叶阔叶林",
  packHeight: 57,
  suitability: 88,
  flux: 31,
  resource: {name: "铁矿", value: 12, supply: 3},
  culture: "河谷文化",
  religion: "群山信仰",
  state: "青岚国",
  province: "临川郡",
  population: 3250,
  label: {text: "青岚", targetKind: "state"}
};

const normalRows = buildHoverRowEntries(pick, {}, {debugEnabled: false});
const normalText = JSON.stringify(normalRows);
assert.deepEqual(normalRows.map(row => row.label), ["对象", "地貌", "气候", "政区", "社会", "人口"]);
assert.match(normalText, /岛屿 \/ 温带落叶阔叶林/);
for (const internalToken of ["grid", "pack", "targetKind", "state\"", "#7", "内部高度", "适宜度", "流量", "resource", "v12", "x3"]) {
  assert.equal(normalText.includes(internalToken), false, `普通模式泄露内部信息：${internalToken}`);
}
assert.equal(normalRows.some(row => !String(row.label).trim() || !String(row.value).trim()), false);

const debugRows = buildHoverRowEntries(pick, {}, {debugEnabled: true});
const debugText = JSON.stringify(debugRows);
assert.deepEqual(debugRows.slice(-3).map(row => row.label), ["诊断·位置", "诊断·地形", "诊断·原始值"]);
for (const diagnostic of ["grid 81", "pack 42", "island #7", "h 1,521 米", "s 88", "流量 186 m³/s", "resource 铁矿 v12 x3", "state"]) {
  assert.match(debugText, new RegExp(diagnostic));
}
assert.equal(debugRows.some(row => !String(row.label).trim() || !String(row.value).trim()), false);

const invalidPick = {
  invalidMapArea: true,
  invalidReason: "outside-map",
  worldX: -12,
  worldY: 8,
  graphWidth: 1000,
  graphHeight: 700
};
assert.deepEqual(buildHoverRowEntries(invalidPick, {}, {debugEnabled: false}).map(row => row.label), ["状态", "说明"]);
assert.deepEqual(buildHoverRowEntries(invalidPick, {}, {debugEnabled: true}).map(row => row.label), ["状态", "位置", "范围", "说明"]);

const panelSource = fs.readFileSync(new URL("../app/webgl-generator/src/ui/panel.js", import.meta.url), "utf8");
const appSource = fs.readFileSync(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8");
assert.match(panelSource, /addEventListener\("webgl-generator-debug-change", \(\) => handlers\.onDebugModeChange\?\.\(\)\)/);
assert.match(appSource, /onDebugModeChange: \(\) => updatePickPanel\(documentRef, state\)/);

console.log("悬停面板调试过滤回归通过：普通模式仅保留玩家信息，调试模式恢复诊断且切换即时刷新。");
