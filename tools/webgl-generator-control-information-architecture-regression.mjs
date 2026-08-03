#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {bindLabelNamingPanelTrigger} from "../app/webgl-generator/src/ui/label-naming-panel-trigger.js";
import {DEFAULT_LAYER_VISIBILITY} from "../app/webgl-generator/src/runtime/display-defaults.js";

const [controlPanelSource, toolbarSource, shortcutSource, runtimePanelSource, runtimeAppSource, labelPanelSource, stylesSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/ControlPanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/MapToolbar.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/keyboard-shortcuts.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/panel.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/panels/label-naming-panel.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/styles.css", import.meta.url), "utf8")
]);

const expectedGroups = Object.freeze({
  terrain: {label: "地形环境", actions: ["open-height-panel", "open-climate-panel", "open-biome-panel", "open-feature-panel", "open-river-panel", "open-ocean-current-panel", "open-lake-panel"]},
  politics: {label: "政治社会", actions: ["open-state-panel", "open-government-panel", "open-province-panel", "open-city-panel", "open-population-panel", "open-culture-panel", "open-religion-panel", "open-diplomacy-panel"]},
  network: {label: "网络经济", actions: ["open-economy-panel", "open-military-panel", "open-route-panel"]},
  annotation: {label: "标注对象", actions: ["open-zone-panel", "open-marker-panel", "open-label-naming-panel", "open-notes-panel", "open-measurement-panel"]},
  system: {label: "系统工具", actions: ["open-namebase-panel"]}
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
assert(!groupSource.includes("open-emblem-panel") && !groupSource.includes('managementGroup("experimental"'), "纹章实验入口仍然可见");
assert(runtimeAppSource.includes('"emblem-panel": () => state.panels.emblem?.open(map, history)'), "隐藏入口时不得移除纹章内部面板注册");

const layerSource = sliceBetween(controlPanelSource, "const layerGroups", "const managementGroups");
for (const [id, label] of [["terrain", "地形水文"], ["politics", "政治边界"], ["objects", "地图对象"], ["zones", "地区"], ["annotation", "标注辅助"]]) {
  assert(layerSource.includes(`layerGroup("${id}", "${label}"`), `图层页缺少语义组：${label}`);
}
assert.equal(countMatches(layerSource, /layerGroup\("/g), 5, "图层页语义组数量漂移");
assert(layerSource.includes('layers: ["resources", "markers"]'), "资源点与通用标记没有合并为首层入口");
assert(layerSource.includes('{id: "zoneComposite", label: "全部地区", layers: ["zones", "zoneEvents", "zoneNatural", "zoneWilderness", "zoneLabels"]}'), "全部地区没有覆盖五个既有地区状态键");
for (const [id, label] of [["zoneEvents", "事件地区"], ["zoneNatural", "自然地区"], ["zoneWilderness", "自动无人区"], ["zoneLabels", "地区名称"]]) {
  assert(layerSource.includes(`{id: "${id}", label: "${label}"}`), `地区图层缺少独立入口：${label}`);
}
assert.equal(DEFAULT_LAYER_VISIBILITY.gridCells, false, "网格单元无偏好默认值没有关闭");
assert.match(controlPanelSource, /function isLayerVisible\(layer\)\s*\{[\s\S]*?typeof preferred === "boolean"[\s\S]*?return DEFAULT_LAYER_VISIBILITY\[layer\] !== false;/, "Vue 图层状态没有按显式偏好优先、集中默认值兜底");
assert.match(controlPanelSource, /function layerToggleState\(layer\)\s*\{[\s\S]*?members\.filter\(isLayerVisible\)[\s\S]*?return "mixed";/, "复合图层的 Vue 计算路径没有复用独立底层状态");
assert.match(runtimePanelSource, /querySelectorAll\("\[data-layer-group\]"\)[\s\S]*?aria-pressed[\s\S]*?"mixed"/, "复合图层入口缺少三态同步");
assert.match(stylesSource, /\.ui-select-el \.el-select__wrapper\s*\{[\s\S]*?padding:\s*0 8px 0 10px/, "共享下拉箭头没有靠近右边框");
assert.match(stylesSource, /@media \(max-width: 430px\)\s*\{[\s\S]*?:is\(\.floating-panel, \.vue-control-panel-root\) \.ui-select-field\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)[\s\S]*?gap:\s*5px/, "窄视口下共享下拉框没有切换为上下布局");

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

assert.match(runtimePanelSource, /bindLabelNamingPanelTrigger\(documentRef, handlers\.onOpenLabelNamingPanel\)/, "标签管理入口没有使用生命周期安全的受限委托");
assert.doesNotMatch(runtimePanelSource, /getElementById\("open-label-naming-panel"\).*addEventListener\("click"/, "标签管理入口仍保留会失效或重复触发的直接绑定");
assert.match(runtimeAppSource, /onOpenLabelNamingPanel:[\s\S]*state\.panels\.labelNaming\.open\(state\.map, state\.selection, state\.editHistory\.getStats\(\)\)/, "标签管理入口没有进入既有 panel wrapper open 链");
assert.match(labelPanelSource, /manager\.open\("label-naming-panel"\)/, "标签管理 wrapper 没有调用 PanelManager.open");
const delegatedDocument = createDelegatedDocument();
let labelPanelOpenCount = 0;
const unbindLabelTrigger = bindLabelNamingPanelTrigger(delegatedDocument, () => labelPanelOpenCount++);
const initialButton = createTrigger("open-label-naming-panel");
delegatedDocument.mount(initialButton);
delegatedDocument.click(createTriggerChild(initialButton));
assert.equal(labelPanelOpenCount, 1, "后挂载标签管理按钮没有触发一次 handler");
const replacementButton = createTrigger("open-label-naming-panel");
delegatedDocument.mount(replacementButton);
delegatedDocument.click(createTriggerChild(replacementButton));
assert.equal(labelPanelOpenCount, 2, "替换后的标签管理按钮没有继续单次触发 handler");
delegatedDocument.click(createTriggerChild(initialButton));
delegatedDocument.click(createTrigger("open-notes-panel"));
assert.equal(labelPanelOpenCount, 2, "已脱离文档或无关按钮误触发标签管理 handler");
unbindLabelTrigger();
delegatedDocument.click(replacementButton);
assert.equal(labelPanelOpenCount, 2, "解除标签管理入口委托后仍触发 handler");

console.log(JSON.stringify({
  ok: true,
  managementGroups: Object.values(expectedGroups).map(group => ({label: group.label, actions: group.actions.length})),
  managementActions: actionIds.length,
  fitViewEntries: 1,
  advancedClimateDefault: "collapsed",
  labelPanelDelegatedClicks: labelPanelOpenCount
}, null, 2));

function createDelegatedDocument() {
  const listeners = new Set();
  let mounted = null;
  return {
    addEventListener(type, listener) {
      if (type === "click") listeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === "click") listeners.delete(listener);
    },
    contains(node) {
      return node === mounted;
    },
    mount(node) {
      mounted = node;
    },
    click(target) {
      for (const listener of listeners) listener({target});
    }
  };
}

function createTrigger(id) {
  return {
    id,
    closest(selector) {
      return selector === `#${id}` ? this : null;
    }
  };
}

function createTriggerChild(parent) {
  return {
    closest(selector) {
      return selector === `#${parent.id}` ? parent : null;
    }
  };
}

function sliceBetween(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start);
  return start >= 0 && end > start ? source.slice(start, end) : "";
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}
