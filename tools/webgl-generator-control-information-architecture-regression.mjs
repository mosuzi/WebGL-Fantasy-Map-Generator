#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const [controlPanelSource, toolbarSource, shortcutSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/ControlPanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/MapToolbar.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/keyboard-shortcuts.js", import.meta.url), "utf8")
]);

const expectedGroups = Object.freeze({
  terrain: {label: "地形环境", actions: ["open-height-panel", "open-climate-panel", "open-biome-panel", "open-feature-panel", "open-river-panel", "open-lake-panel"]},
  politics: {label: "政治社会", actions: ["open-state-panel", "open-government-panel", "open-province-panel", "open-city-panel", "open-population-panel", "open-culture-panel", "open-religion-panel", "open-diplomacy-panel"]},
  network: {label: "网络经济", actions: ["open-economy-panel", "open-military-panel", "open-route-panel"]},
  annotation: {label: "标注对象", actions: ["open-zone-panel", "open-marker-panel", "open-label-naming-panel", "open-notes-panel", "open-measurement-panel"]},
  system: {label: "系统工具", actions: ["open-namebase-panel"]},
  experimental: {label: "实验功能", actions: ["open-emblem-panel"]}
});

const groupSource = sliceBetween(controlPanelSource, "const managementGroups", "const regenerationActions");
assert(groupSource, "找不到管理入口分组定义");
assert.match(controlPanelSource, /v-for="group in managementGroups"/, "管理页没有按领域组渲染");
assert.match(controlPanelSource, /:data-management-group="group\.id"/, "管理领域组缺少稳定标识");

const actionIds = [];
for (const [groupId, group] of Object.entries(expectedGroups)) {
  assert(groupSource.includes(`managementGroup("${groupId}", "${group.label}"`), `缺少管理领域组：${group.label}`);
  for (const actionId of group.actions) {
    assert(groupSource.includes(`["${actionId}",`), `${group.label} 缺少入口 ${actionId}`);
    actionIds.push(actionId);
  }
}
assert.equal(actionIds.length, 24, "管理首层入口数量漂移");
assert.equal(new Set(actionIds).size, actionIds.length, "管理入口被重复分组");
assert.equal(countMatches(groupSource, /\["open-[^"]+"/g), actionIds.length, "存在未登记或重复的管理入口");
assert(!groupSource.includes("fit-view"), "适配视图仍在管理入口中");
assert(groupSource.indexOf("open-emblem-panel") > groupSource.indexOf('managementGroup("experimental"'), "纹章没有降到实验功能组");

assert.equal(countMatches(toolbarSource, /id="fit-view"/g), 1, "地图工具栏中的适配视图入口数量不为 1");
assert.match(shortcutSource, /id: "selection\.fit-view"[\s\S]*?selector: "#fit-view"[\s\S]*?path: "layers\.fitView"/, "适配视图快捷键没有继续调用既有 action");

assert.match(controlPanelSource, /<details class="generation-climate-section">/, "高级气候没有使用默认收起容器");
assert(!controlPanelSource.includes('<details class="generation-climate-section" open'), "高级气候不应默认展开");
assert.match(controlPanelSource, /<summary id="generation-climate-title">高级气候<\/summary>/, "高级气候摘要入口缺失");
for (const controlId of ["climate-latitude-toggle", "temperature-equator", "temperature-north-pole", "temperature-south-pole", "climate-latitude-center-slider"]) {
  assert(controlPanelSource.includes(`input-id="${controlId}"`) || controlPanelSource.includes(`id="${controlId}"`), `高级气候能力缺少控件 ${controlId}`);
}

for (const label of ["地图种子", "地图规模", "宽度", "高度", "地形", "生成地图"]) assert(controlPanelSource.includes(label), `生成首层缺少中文业务字段：${label}`);
for (const legacyLabel of ['label="Seed"', 'label="目标 cells"', ">生成 grid 地图<", ">换 seed<"]) assert(!controlPanelSource.includes(legacyLabel), `普通界面仍使用内部术语：${legacyLabel}`);

console.log(JSON.stringify({
  ok: true,
  managementGroups: Object.values(expectedGroups).map(group => ({label: group.label, actions: group.actions.length})),
  managementActions: actionIds.length,
  fitViewEntries: 1,
  advancedClimateDefault: "collapsed"
}, null, 2));

function sliceBetween(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start);
  return start >= 0 && end > start ? source.slice(start, end) : "";
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}
