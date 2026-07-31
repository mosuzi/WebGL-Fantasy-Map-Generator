#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const [heightSource, militarySource, controlSource, styleSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/HeightPanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/MilitaryPanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/ControlPanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/styles.css", import.meta.url), "utf8")
]);

const heightTemplate = templateOf(heightSource);
const heightAdvanced = detailsBlock(heightTemplate, "height-advanced-section");
for (const label of ["选区地形模板", "多步骤地形模板", "高度区间条件变换", "GPU 预览"]) {
  assert(heightAdvanced.includes(label), `高度高级区缺少 ${label}`);
}
const heightBeforeAdvanced = heightTemplate.slice(0, heightTemplate.indexOf(heightAdvanced));
const heightAfterAdvanced = heightTemplate.slice(heightTemplate.indexOf(heightAdvanced) + heightAdvanced.length);
for (const label of ["高度编辑动作", "高度笔刷作用范围", "全局微调", "常用选区", "height-selection-source"]) assert(heightBeforeAdvanced.includes(label), `高度首层缺少 ${label}`);
assert(heightAfterAdvanced.includes("打开导入工作台"), "高度图导入没有保留在首层");

const militaryTemplate = templateOf(militarySource);
const militaryAdvanced = detailsBlock(militaryTemplate, "military-advanced-section");
for (const label of ["战报档案导入导出", "military-event-chain-filter", "military-battle-event-type", "记录轻量结算", "记录战报与轻量结算"]) {
  assert(militaryAdvanced.includes(label), `军事高级区缺少 ${label}`);
}
const militaryPrimary = militaryTemplate.replace(militaryAdvanced, "");
for (const label of ["重新生成军事", "UiObjectTable"]) assert(militaryPrimary.includes(label), `军事首层缺少 ${label}`);
for (const label of ["调整态势", "兵种比例"]) assert(militarySource.includes(label), `军事首层动作缺少 ${label}`);
assert(!militaryPrimary.includes('input-id="military-event-chain-filter"'), "战报链筛选仍在军事首层");
assert(!/key: "battle"/.test(militarySource), "军事首层动作栏仍保留战报入口");

const controlTemplate = templateOf(controlSource);
const exportAdvanced = detailsBlock(controlTemplate, "project-export-advanced-section");
for (const id of ["export-heightmap-image", "export-map-data-compressed", "export-map-geojson", "export-map-features-geojson", "export-png-scale", "feature-export-layer-state"]) {
  assert(exportAdvanced.includes(id), `导出高级区缺少 ${id}`);
}
const exportBeforeAdvanced = controlTemplate.slice(0, controlTemplate.indexOf(exportAdvanced));
for (const id of ["export-map-image", "export-map-data"]) assert(exportBeforeAdvanced.includes(id), `快速导出缺少 ${id}`);
assert(exportBeforeAdvanced.includes("快速导出"), "导出首层缺少快速导出标识");

for (const source of [heightAdvanced, militaryAdvanced, exportAdvanced]) assert(!/^<details[^>]*\sopen(?:\s|>)/.test(source), "高级区不应默认展开");
for (const signature of [".panel-advanced-section", ".panel-advanced-section-body", ".military-advanced-editor"]) {
  assert(styleSource.includes(signature), `分层样式缺少 ${signature}`);
}

console.log(JSON.stringify({
  ok: true,
  height: {primary: ["brush", "scope", "global-tools", "import"], advanced: ["terrain-template", "program", "conditional-transform", "gpu-stats"]},
  military: {primary: ["regiments", "locate", "status", "ratios", "regenerate"], advanced: ["battle-archive", "chain-filters", "light-resolution"]},
  export: {quick: ["png", "map-json"], advanced: ["heightmap-png", "compressed-json", "geojson", "png-options", "feature-layers"]},
  defaultCollapsed: true
}, null, 2));

function templateOf(source) {
  const end = source.lastIndexOf("</template>");
  assert(end >= 0, "Vue 组件缺少 template");
  return source.slice(0, end);
}

function detailsBlock(source, className) {
  const start = source.indexOf(`<details class="panel-advanced-section ${className}">`);
  assert(start >= 0, `缺少 ${className}`);
  const end = source.indexOf("</details>", start);
  assert(end > start, `${className} 没有闭合`);
  return source.slice(start, end + "</details>".length);
}
