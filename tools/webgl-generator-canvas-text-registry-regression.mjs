#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {
  ANNOTATION_TEXT_EXPORT_CONTRACT,
  PNG_FIXED_TEXT_ELEMENT_IDS,
  PNG_MILITARY_TEXT_SELECTOR,
  PNG_SEMANTIC_LABEL_SELECTORS,
  SEMANTIC_LABEL_CSS_BASE_SELECTORS,
  SEMANTIC_LABEL_TEXT_CONTRACT
} from "../app/webgl-generator/src/runtime/canvas-text-contract.js";
import {
  CANVAS_TEXT_EDITABILITY,
  CANVAS_TEXT_LAYER,
  CANVAS_TEXT_REGISTRY,
  CANVAS_TEXT_STYLE_PERSISTENCE,
  listCanvasTextEntries,
  validateCanvasTextRegistry
} from "../app/webgl-generator/src/runtime/canvas-text-registry.js";
import {LABEL_STYLE_TYPES} from "../app/webgl-generator/src/runtime/label-style-registry.js";
import {auditCanvasTextSources} from "./lib/canvas-text-source-audit.mjs";

const rootDir = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, rootDir), "utf8");
const [renderer, styles, mapIo, index, hover, picking, riverPanel, markerPanel, networkGeoJson] = await Promise.all([
  read("app/webgl-generator/src/renderer/placeholder-renderer.js"),
  read("app/webgl-generator/src/styles.css"),
  read("app/webgl-generator/src/runtime/map-file-io.js"),
  read("app/webgl-generator/index.html"),
  read("app/webgl-generator/src/ui/hover-overlay-content.js"),
  read("app/webgl-generator/src/renderer/picking.js"),
  read("app/webgl-generator/src/ui/vue/components/RiverPanel.vue"),
  read("app/webgl-generator/src/ui/vue/components/MarkerPanel.vue"),
  read("app/webgl-generator/src/runtime/network-geojson-properties.js")
]);

assert.equal(validateCanvasTextRegistry(), true);
const byLayer = layer => listCanvasTextEntries({layer});
const semantic = byLayer(CANVAS_TEXT_LAYER.SEMANTIC);
const annotation = byLayer(CANVAS_TEXT_LAYER.ANNOTATION);
const hud = byLayer(CANVAS_TEXT_LAYER.HUD);
const diagnostic = byLayer(CANVAS_TEXT_LAYER.DIAGNOSTIC);
const notRendered = byLayer(CANVAS_TEXT_LAYER.NOT_RENDERED);

assertSetEqual(ids(semantic), SEMANTIC_LABEL_TEXT_CONTRACT.map(entry => entry.id), "语义 registry 与 renderer 生产契约存在差集");
assertSetEqual(ids(semantic), LABEL_STYLE_TYPES, "语义 registry 与 LABEL_STYLE_TYPES 存在差集");
assertSetEqual(ids(annotation), ANNOTATION_TEXT_EXPORT_CONTRACT.map(entry => entry.id), "注记 registry 与 PNG 生产契约存在差集");
assert.equal(hud.length, 9);
assertSetEqual(ids(diagnostic), ["grid-cell-id"], "诊断文字分母错误");
assertSetEqual(ids(notRendered), ["river-name", "route-name", "marker-name"], "未渲染文字分母错误");

assert.match(renderer, /import \{markDynamicCanvasTextNode, semanticLabelClassName, setDynamicCanvasTextContent\} from "\.\.\/runtime\/canvas-text-contract\.js";/, "renderer 未消费语义标签和动态文字生产契约");
assert.match(renderer, /node\.className = semanticLabelClassName\(item\.targetKind, item\.city\)/, "renderer 未通过生产契约解析标签 class");
assert.doesNotMatch(renderer, /function labelClassName\(/, "renderer 仍保留与生产契约平行的标签 class 清单");
assert.match(renderer, /markDynamicCanvasTextNode\(node, styleType\)/, "renderer 未通过 helper 登记语义文字实际 ID");

const cssSemanticSelectors = extractCssContractSelectors(styles, "/* canvas-text-contract: semantic-label-base */");
assertSetEqual(cssSemanticSelectors, SEMANTIC_LABEL_CSS_BASE_SELECTORS, "CSS 语义标签显式契约与生产契约存在差集");
assertSetEqual(unique(semantic.map(entry => baseSelector(entry.selector))), cssSemanticSelectors, "registry 与 CSS 实际语义 selector 存在差集");

assert.match(mapIo, /import \{PNG_FIXED_TEXT_ELEMENT_IDS, PNG_MILITARY_TEXT_SELECTOR, PNG_SEMANTIC_LABEL_SELECTORS\} from "\.\/canvas-text-contract\.js";/, "PNG 未导入文字生产契约");
assert.match(mapIo, /selectors\.push\(\.\.\.PNG_SEMANTIC_LABEL_SELECTORS\)/, "PNG 标签通道未消费生产契约");
assert.match(mapIo, /selectors\.push\(PNG_MILITARY_TEXT_SELECTOR\)/, "PNG 军事通道未消费生产契约");
assert.match(mapIo, /PNG_FIXED_TEXT_ELEMENT_IDS\.legend[\s\S]*PNG_FIXED_TEXT_ELEMENT_IDS\.scaleBar/, "PNG 固定注记通道未消费生产契约");
assertSetEqual(unique(semantic.map(entry => entry.exportSelector)), PNG_SEMANTIC_LABEL_SELECTORS, "registry 与 PNG 语义 selector 存在差集");
assertSetEqual(annotation.map(entry => entry.exportSelector), ANNOTATION_TEXT_EXPORT_CONTRACT.map(entry => entry.exportSelector), "registry 与 PNG 注记 selector 存在差集");
assert.equal(PNG_MILITARY_TEXT_SELECTOR, annotation.find(entry => entry.id === "military-count").exportSelector);
assert.equal(PNG_FIXED_TEXT_ELEMENT_IDS.legend, annotation.find(entry => entry.id === "legend").exportSelector);
assert.equal(PNG_FIXED_TEXT_ELEMENT_IDS.scaleBar, annotation.find(entry => entry.id === "scale-bar").exportSelector);

const sourceAudit = auditCanvasTextSources({indexSource: index, rendererSource: renderer, stylesSource: styles, registry: CANVAS_TEXT_REGISTRY});
assert.equal(sourceAudit.violationCount, 0, "真实源码存在未登记画布文字");
assertSetEqual(sourceAudit.declaredFixedIds, [...ids(hud), "legend", "scale-bar"], "map-stage 固定文字 ID 与 registry 存在差集");
assertSetEqual(unique(sourceAudit.dynamicHelperCalls.map(call => call.id)), ["<semantic-style-type>", "military-count", "grid-cell-id"], "renderer 动态文字 helper 与 registry 存在差集");

for (const entry of semantic) {
  assert.equal(entry.rendered, true);
  assert.equal(entry.stylePersistence, CANVAS_TEXT_STYLE_PERSISTENCE.DIRECT_MAP);
  assert.equal(entry.editability, CANVAS_TEXT_EDITABILITY.DIRECT);
  assert.equal(entry.exported, true);
  assert.match(entry.styleSource, new RegExp(`^labels\\.styles\\.${entry.id}$`));
  assert.equal(Object.hasOwn(entry, "persisted"), false, `${entry.id} 仍暴露误导的 persisted 二值`);
  assert.equal(Object.hasOwn(entry, "userEditable"), false, `${entry.id} 仍暴露误导的 userEditable 二值`);
}

const military = annotation.find(entry => entry.id === "military-count");
assert.equal(military.stylePersistence, CANVAS_TEXT_STYLE_PERSISTENCE.RUNTIME_PALETTE);
assert.equal(military.editability, CANVAS_TEXT_EDITABILITY.INDIRECT);
assert.match(military.styleSource, /state\.color -> military-label-palette/);
for (const id of ["legend", "scale-bar"]) {
  const entry = annotation.find(candidate => candidate.id === id);
  assert.equal(entry.stylePersistence, CANVAS_TEXT_STYLE_PERSISTENCE.VISUAL_THEME);
  assert.equal(entry.editability, CANVAS_TEXT_EDITABILITY.INDIRECT);
  assert.match(entry.styleSource, /^visualTheme\./);
}

for (const entry of [...hud, ...diagnostic]) {
  assert.equal(entry.stylePersistence, CANVAS_TEXT_STYLE_PERSISTENCE.NONE);
  assert.equal(entry.editability, CANVAS_TEXT_EDITABILITY.NONE);
  assert.equal(entry.exported, false);
  assert.equal(mapIo.includes(entry.selector), false, `${entry.id} 错误进入 PNG 文字 selector`);
}

const markerBlock = sourceBlock(renderer, "this.markerIconItems = getMarkerIconItems", "this.militaryIconItems = getMilitaryIconItems");
assert.match(markerBlock, /node\.title = item\.tooltip/);
assert.match(markerBlock, /node\.setAttribute\("aria-label", item\.tooltip\)/);
assert.match(markerBlock, /content\.innerHTML = markerIconSvg\(item\)/);
assert.doesNotMatch(markerBlock, /textContent|appendLabelNodeText/, "marker 名称被当作画布文字渲染");
assert.doesNotMatch(renderer, /(?:river|route)-(?:name|label)/i, "河流或道路名称出现画布文字 renderer");
assert.doesNotMatch(styles, /\.(?:river|route|marker)-(?:label|name-label)(?:\W|$)/i, "未渲染名称出现画布文字 CSS");
assert.doesNotMatch(mapIo, /\.(?:river|route|marker)-(?:label|name-label)(?:\W|$)/i, "未渲染名称进入 PNG 文字通道");
assert.match(picking, /kind: "river"[\s\S]*name: river\.name/, "河流名称缺少 hover / picking 证据");
assert.match(hover, /const name = river\.name/, "河流名称缺少 hover 文案证据");
assert.match(riverPanel, /class-name="river-name-editor"/, "河流名称缺少面板证据");
assert.match(networkGeoJson, /const displayName = nonEmptyText\(route\?\.name\)[\s\S]*name: displayName,[\s\S]*displayName,/, "道路显示名缺少 data-only / GeoJSON 派生证据");
assert.match(mapIo, /const stable = serializeRouteGeoJsonProperties\(map, route\)[\s\S]*name: stable\.displayName/, "道路显示名没有进入 GeoJSON properties 链");
assert.match(picking, /kind: "marker"[\s\S]*name: marker\.name/, "marker 名称缺少 hover / picking 证据");
assert.match(markerPanel, /class-name="marker-name-editor"/, "marker 名称缺少面板证据");
for (const entry of notRendered) {
  assert.equal(entry.rendered, false);
  assert.equal(entry.stylePersistence, CANVAS_TEXT_STYLE_PERSISTENCE.NONE);
  assert.equal(entry.editability, CANVAS_TEXT_EDITABILITY.NONE);
  assert.equal(entry.exported, false);
  assert.ok(entry.evidence.length >= 3, `${entry.id} 缺少可复核证据`);
}

const unregisteredHtml = '<div class="unregistered-map-text">未登记文字</div>';
const mutatedIndex = index.replace(/<\/section>\s*<\/main>/, `${unregisteredHtml}\n      </section>\n    </main>`);
assert.notEqual(mutatedIndex, index, "固定 DOM 故障注入失败");
const fixedMutationAudit = auditCanvasTextSources({indexSource: mutatedIndex, rendererSource: renderer, stylesSource: styles, registry: CANVAS_TEXT_REGISTRY});
assert(fixedMutationAudit.unregisteredFixedTextNodes.length > 0, "门禁没有发现 map-stage 未标记固定文字");

const mutatedRenderer = `${renderer}\nfunction injectUnregisteredOverlayText(documentRef, overlay) {\n  const node = documentRef.createElement("span");\n  node.textContent = "未登记动态文字";\n  overlay.append(node);\n}\n`;
const rendererMutationAudit = auditCanvasTextSources({indexSource: index, rendererSource: mutatedRenderer, stylesSource: styles, registry: CANVAS_TEXT_REGISTRY});
assert(rendererMutationAudit.directDynamicTextWrites.length > 0, "门禁没有发现绕过 helper 的 renderer 动态文字");

const mutatedStyles = `${styles}\n.unregistered-map-text { color: red; }\n`;
const cssMutationAudit = auditCanvasTextSources({indexSource: mutatedIndex, rendererSource: renderer, stylesSource: mutatedStyles, registry: CANVAS_TEXT_REGISTRY});
assert(cssMutationAudit.cssContractViolations.length > 0, "门禁没有发现 marker 外未登记固定文字 CSS");
const gateDetectsMutation = fixedMutationAudit.violationCount > 0
  && rendererMutationAudit.violationCount > 0
  && cssMutationAudit.violationCount > 0;
assert.equal(gateDetectsMutation, true, "画布文字源码门禁故障注入未闭合");

console.log(JSON.stringify({
  ok: true,
  total: CANVAS_TEXT_REGISTRY.length,
  layers: {semantic: semantic.length, annotation: annotation.length, hud: hud.length, diagnostic: diagnostic.length, notRendered: notRendered.length},
  differences: {renderer: 0, css: 0, png: 0, fixedDom: 0},
  sourceAudit: {fixedTextNodes: sourceAudit.fixedTextNodes.length, dynamicHelperCalls: sourceAudit.dynamicHelperCalls.length, violationCount: sourceAudit.violationCount},
  faultInjection: {
    fixedDomViolations: fixedMutationAudit.unregisteredFixedTextNodes.length,
    rendererViolations: rendererMutationAudit.directDynamicTextWrites.length,
    cssViolations: cssMutationAudit.cssContractViolations.length,
    gateDetectsMutation
  },
  annotationSemantics: Object.fromEntries(annotation.map(entry => [entry.id, {stylePersistence: entry.stylePersistence, editability: entry.editability}]))
}, null, 2));

function ids(entries) {
  return entries.map(entry => entry.id);
}

function unique(values) {
  return [...new Set(values)];
}

function baseSelector(selector) {
  return selector.match(/^\.[\w-]+/)?.[0] || selector;
}

function extractCssContractSelectors(source, marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `CSS 缺少显式契约标记：${marker}`);
  const tail = source.slice(start + marker.length);
  const selectorBlock = tail.slice(0, tail.indexOf("{"));
  return unique(selectorBlock.match(/\.[a-z][\w-]*/g) || []);
}

function sourceBlock(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert(start >= 0 && end > start, `无法提取源码块：${startToken}`);
  return source.slice(start, end);
}

function assertSetEqual(actualValues, expectedValues, message) {
  const actual = new Set(actualValues);
  const expected = new Set(expectedValues);
  const missing = [...expected].filter(value => !actual.has(value)).sort();
  const extra = [...actual].filter(value => !expected.has(value)).sort();
  assert.deepEqual({missing, extra}, {missing: [], extra: []}, message);
}
