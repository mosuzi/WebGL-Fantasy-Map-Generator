#!/usr/bin/env node
import assert from "node:assert/strict";
import {readdir, readFile} from "node:fs/promises";

const componentDir = new URL("../app/webgl-generator/src/ui/vue/components/", import.meta.url);
const componentNames = (await readdir(componentDir)).filter(name => name.endsWith(".vue"));
const componentEntries = await Promise.all(componentNames.map(async name => [name, await readFile(new URL(name, componentDir), "utf8")]));
const components = new Map(componentEntries);
const read = path => readFile(new URL(path, import.meta.url), "utf8");

const [tableSource, legacyTableSource, controlSource, panelSource, appSource, actionSource, buttonSource, managerSource, styleSource] = await Promise.all([
  read("../app/webgl-generator/src/ui/vue/components/base/UiObjectTable.vue"),
  read("../app/webgl-generator/src/ui/components/object-table.js"),
  read("../app/webgl-generator/src/ui/vue/components/ControlPanel.vue"),
  read("../app/webgl-generator/src/ui/panel.js"),
  read("../app/webgl-generator/src/runtime/app.js"),
  read("../app/webgl-generator/src/ui/vue/components/base/UiPanelIoActions.vue"),
  read("../app/webgl-generator/src/ui/vue/components/base/UiButton.vue"),
  read("../app/webgl-generator/src/ui/panel-manager.js"),
  read("../app/webgl-generator/src/styles.css")
]);

assert(tableSource.includes('default: "none"'), "对象表格双击默认动作没有关闭");
assert(tableSource.includes('validator: value => ["none", "edit"].includes(value)'), "对象表格仍允许双击定位");
assert(!legacyTableSource.includes('addEventListener("dblclick"'), "旧对象表格仍绑定双击定位");
assert(tableSource.includes("<Location />"), "逐行定位没有使用统一图标");

const duplicateLocateActions = componentEntries.flatMap(([name, source]) => source.includes('key: "locate"') ? [name] : []);
assert.deepEqual(duplicateLocateActions, [], `仍有底部定位动作：${duplicateLocateActions.join(", ")}`);

assert.equal((controlSource.match(/data-regenerate-kind/g) || []).length, 1, "控制面板不是单一重生成入口");
assert(controlSource.includes('input-id="regeneration-kind"'), "控制面板缺少重生成领域选择");
assert(controlSource.includes('data-default-constraint="selectedRegenerationAction.impact"'), "控制面板缺少重生成影响摘要");
assert(panelSource.includes("constraint?.dataset.defaultConstraint"), "运行时没有保留当前影响摘要");

const regenerationPanels = new Map([
  ["states", "StatePanel.vue"],
  ["provinces", "ProvincePanel.vue"],
  ["cities", "CityPanel.vue"],
  ["routes", "RoutePanel.vue"],
  ["rivers", "RiverPanel.vue"],
  ["markers", "MarkerPanel.vue"],
  ["diplomacy", "DiplomacyPanel.vue"],
  ["military", "MilitaryPanel.vue"]
]);
for (const [kind, name] of regenerationPanels) {
  const source = components.get(name) || "";
  assert(/重新生成|重算道路/.test(source), `${name} 缺少领域重生成入口`);
  assert(appSource.includes(`runtimeActions.generate.regenerate("${kind}", {confirm: true})`), `${name} 没有复用公共重生成 action`);
}

for (const signature of ["safeActions", "dangerActions", "ui-panel-action-divider", "resolveActionIcon", "ui-panel-danger-action"]) {
  assert(actionSource.includes(signature), `统一动作区缺少 ${signature}`);
}
assert(buttonSource.includes('props.variant === "danger"'), "公共按钮缺少危险操作样式");
assert(styleSource.includes(".danger-action.el-button"), "危险操作样式未落地");

assert(managerSource.includes('close.className = "ui-close-button floating-panel-close"'), "主面板关闭按钮未接入统一类");
assert(managerSource.includes('close.textContent = "×"'), "主面板关闭符号未统一");
for (const name of ["ControlPanel.vue", "HeightPanel.vue"]) assert(components.get(name)?.includes("ui-close-button"), `${name} 关闭按钮未接入统一类`);
const treeSource = await read("../app/webgl-generator/src/ui/vue/components/base/UiTreeDisplayPanel.vue");
assert(treeSource.includes("ui-close-button ui-tree-display-close"), "树状浮层关闭按钮未接入统一类");

console.log(JSON.stringify({
  ok: true,
  locate: {rowAction: "Location", duplicateBottomActions: 0, defaultDoubleClick: "none"},
  regeneration: {controlEntries: 1, domainPanels: [...regenerationPanels.keys()], sharedAction: true},
  actions: {safeDangerSeparated: true, iconVocabulary: true},
  closeButton: {className: "ui-close-button", glyph: "×"}
}, null, 2));
