#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const [stylesSource, indexSource, panelSource, overlayRegistrySource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/index.html", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/panel.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/overlay-registry.js", import.meta.url), "utf8")
]);

const layers = {
  province: zIndexOf(stylesSource, ".province-label"),
  state: zIndexOfCombinedRule(stylesSource, [".state-label", ".province-label"]),
  city: zIndexOf(stylesSource, ".city-label"),
  custom: zIndexOf(stylesSource, ".custom-label"),
  military: zIndexOf(stylesSource, ".military-map-icon"),
  measurement: zIndexOf(stylesSource, ".measurement-overlay"),
  hover: zIndexOf(stylesSource, ".hover-overlay"),
  scaleBar: zIndexOf(stylesSource, ".map-scale-bar"),
  toolbar: zIndexOf(stylesSource, ".map-toolbar")
};

const highestMapLabel = Math.max(layers.state, layers.province, layers.city, layers.custom);
const highestMapTextLabel = Math.max(highestMapLabel, layers.military);
const panelBaseZIndex = overlayPanelBaseZIndex(overlayRegistrySource);
assert(layers.measurement > highestMapTextLabel, "测量层没有高于全部地图文字标签");
assert.equal(layers.hover, layers.scaleBar, "悬停信息层与比例尺没有保持同级");
assert(layers.hover > layers.measurement, "悬停信息层与比例尺没有高于测量层");
assert(panelBaseZIndex > layers.hover, "编辑面板基础层没有高于地图只读信息层");
assert(layers.hover < layers.toolbar, "悬停信息层不应覆盖地图工具栏");

const mapStageMarkup = indexSource.slice(indexSource.indexOf('<section class="map-stage"'), indexSource.indexOf("</section>"));
const mapOverlayIndex = mapStageMarkup.indexOf('id="map-overlay"');
const hoverOverlayIndex = mapStageMarkup.indexOf('id="hover-overlay"');
assert(mapOverlayIndex >= 0 && hoverOverlayIndex > mapOverlayIndex, "悬停信息层与地图标签层的 DOM 顺序异常");

const hoverRule = ruleBody(stylesSource, ".hover-overlay");
assert.match(hoverRule, /pointer-events:\s*none;/, "只读悬停信息层不应截获地图操作");
assert.match(panelSource, /function updateHoverOverlay\(documentRef, pick\)/, "悬停信息更新入口缺失");
assert.match(panelSource, /overlay\.hidden = !visible;[\s\S]*overlay\.replaceChildren\(title, rows\);/, "悬停信息显示与内容更新契约异常");

console.log(JSON.stringify({
  ok: true,
  layers,
  highestMapTextLabel,
  panelBaseZIndex,
  pointerEvents: "none",
  mapInteractionPreserved: true
}, null, 2));

function overlayPanelBaseZIndex(source) {
  const match = source.match(/this\.nextZIndex\s*=\s*(\d+);/);
  assert(match, "缺少编辑面板统一浮层基础层级");
  assert.match(source, /entry\.element\.style\.zIndex\s*=\s*String\(entry\.zIndex\);/, "编辑面板没有应用统一浮层层级");
  return Number(match[1]);
}

function zIndexOf(source, selector) {
  const bodies = [...source.matchAll(new RegExp(`(?:^|\\n)${escapeRegExp(selector)}\\s*\\{([\\s\\S]*?)\\}`, "g"))].map(match => match[1]);
  const body = bodies.find(candidate => /z-index:\s*\d+;/.test(candidate));
  assert(body, `缺少 ${selector} 的显式 z-index`);
  return Number(body.match(/z-index:\s*(\d+);/)[1]);
}

function zIndexOfCombinedRule(source, selectors) {
  const pattern = selectors.map(escapeRegExp).join("\\s*,\\s*");
  const bodies = [...source.matchAll(new RegExp(`(?:^|\\n)${pattern}\\s*\\{([\\s\\S]*?)\\}`, "g"))].map(match => match[1]);
  assert(bodies.length, `缺少组合规则：${selectors.join(", ")}`);
  const zIndex = bodies.map(body => body.match(/z-index:\s*(\d+);/)).find(Boolean);
  assert(zIndex, `组合规则缺少显式 z-index：${selectors.join(", ")}`);
  return Number(zIndex[1]);
}

function ruleBody(source, selector) {
  const match = source.match(new RegExp(`(?:^|\\n)${escapeRegExp(selector)}\\s*\\{([\\s\\S]*?)\\}`));
  assert(match, `缺少样式规则：${selector}`);
  return match[1];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
