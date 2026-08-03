#!/usr/bin/env node
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";

import {MARKER_TYPE_OPTIONS} from "../app/webgl-generator/src/generator/markers.js";
import {
  CANVAS_ICON_COUNTS,
  CITY_BASE_ICON_SVGS,
  CITY_ROLE_BADGE_SVGS,
  LEGACY_MARKER_SYMBOLS,
  MARKER_CATEGORY_ICONS,
  MARKER_SYMBOL_OPTIONS,
  MARKER_TYPE_ICONS,
  MILITARY_ICON_KEYS,
  MILITARY_ICON_SVGS,
  cityBaseIconSvg,
  cityRoleBadgeSvg,
  markerIconSvg,
  militaryIconSvg,
  resolveMarkerIconVisual
} from "../app/webgl-generator/src/renderer/canvas-icon-registry.js";

const [rendererSource, panelSource, generatorSource, militaryAssetsSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/renderer/placeholder-renderer.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/MarkerPanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/generator/markers.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/renderer/military-icon-assets.js", import.meta.url), "utf8")
]);

assert.deepEqual(CANVAS_ICON_COUNTS, {
  cityBases: 9,
  cityRoles: 3,
  markerTypes: 58,
  markerCategories: 9,
  legacyMarkerSymbols: 16,
  military: 10,
  total: 80
});

const generatorTypes = new Set(MARKER_TYPE_OPTIONS.map(option => option.type));
const registryTypes = new Set(Object.keys(MARKER_TYPE_ICONS));
assert.deepEqual([...registryTypes].sort(), [...generatorTypes].sort(), "生成器与图标注册表的 Marker 类型双向差集不为 0");
for (const option of MARKER_TYPE_OPTIONS) {
  assert.equal(MARKER_TYPE_ICONS[option.type].category, option.category, `${option.type} 的类别映射不一致`);
}
assert.equal(MARKER_TYPE_OPTIONS.filter(option => option.category === "resource").length, 26, "资源点分母应为 26");
assert.equal(new Set(MARKER_TYPE_OPTIONS.map(option => option.category)).size, 9, "Marker 类别分母应为 9");
assert.deepEqual(new Set(Object.keys(MARKER_CATEGORY_ICONS)), new Set(MARKER_TYPE_OPTIONS.map(option => option.category)), "Marker 类别注册表双向差集不为 0");

const markerFingerprints = new Map();
for (const option of MARKER_TYPE_OPTIONS) {
  const svg = markerIconSvg({type: option.type, category: option.category, visual: option.visual});
  assertSvgContract(svg, `Marker ${option.type}`);
  assert.match(svg, new RegExp(`data-icon-type="${option.type}"`));
  const fingerprint = geometryFingerprint(MARKER_TYPE_ICONS[option.type].svg);
  assert(!markerFingerprints.has(fingerprint), `${option.type} 与 ${markerFingerprints.get(fingerprint)} 意外复用同一内部几何`);
  markerFingerprints.set(fingerprint, option.type);
}

const autoLegacy = resolveMarkerIconVisual("tea-hills", {
  shape: "pin",
  symbol: "life",
  palette: "resource",
  cultureStyle: "legacy",
  manual: false,
  categoryColor: [0.1, 0.2, 0.3, 1]
});
assert.equal(autoLegacy.symbol, "type:tea-hills", "旧自动 symbol 不得阻止按 type 升级");
assert.equal(autoLegacy.palette, "resource");
assert.equal(autoLegacy.shape, "pin");
assert.equal(autoLegacy.cultureStyle, "legacy");
assert.deepEqual(autoLegacy.categoryColor, [0.1, 0.2, 0.3, 1], "自动解析不得丢失旧 categoryColor");

const manualLegacy = resolveMarkerIconVisual("tea-hills", {
  shape: "pin",
  symbol: "gem",
  palette: "hazard",
  cultureStyle: "manual-style",
  manual: true,
  categoryColor: [0.8, 0.2, 0.1, 1]
});
assert.equal(manualLegacy.symbol, "gem");
assert.equal(manualLegacy.palette, "hazard");
assert.equal(manualLegacy.svg, LEGACY_MARKER_SYMBOLS.gem);
assert.equal(manualLegacy.cultureStyle, "manual-style");
assert.deepEqual(manualLegacy.categoryColor, [0.8, 0.2, 0.1, 1]);
assert.equal(resolveMarkerIconVisual("unknown-old-type", {symbol: "unknown", manual: true}).symbol, "marker", "损坏手工 symbol 必须安全回退");

assert.equal(MARKER_SYMBOL_OPTIONS.length, 16);
assert.deepEqual(new Set(MARKER_SYMBOL_OPTIONS.map(option => option.value)), new Set(Object.keys(LEGACY_MARKER_SYMBOLS)), "面板手工图形选项必须由旧 symbol 注册表派生");
assert.match(panelSource, /import \{MARKER_SYMBOL_OPTIONS, resolveMarkerIconVisual\} from "\.\.\/\.\.\/\.\.\/renderer\/canvas-icon-registry\.js";/);
assert.match(panelSource, /const symbolOptions = MARKER_SYMBOL_OPTIONS;/);
assert(!panelSource.includes("type:${"), "MarkerPanel 不得把自动 type:* 键写回手工 select");

const cityBaseKeys = ["hamlet", "village", "town", "city", "capital", "provincial", "port", "fort", "camp"];
const cityRequiredParts = {
  hamlet: ["dwelling", "roof", "homestead-boundary"],
  village: ["dwellings", "roofs", "village-boundary"],
  town: ["dwellings", "central-tower", "spire", "partial-wall", "gate"],
  city: ["ring-wall", "dwellings", "central-tower", "spire", "gate"],
  capital: ["ring-wall", "dwellings", "capital-tower", "spire", "gate"],
  provincial: ["dwellings", "provincial-hall", "hall-roof", "partial-wall", "gate"],
  port: ["water", "harbor-wall", "dwelling", "harbor-tower", "sail"],
  fort: ["fortress-wall", "corner-towers", "keep", "gate"],
  camp: ["palisade", "side-tent", "main-tent", "flag"]
};
assert.deepEqual(new Set(Object.keys(CITY_BASE_ICON_SVGS)), new Set(cityBaseKeys), "九个城市基础剪影键的双向差集不为 0");
for (const key of cityBaseKeys) {
  const svg = cityBaseIconSvg(key);
  assertSvgContract(svg, `城市 ${key}`);
  assert.match(svg, /viewBox="0 0 34 26"/, `${key} 必须保持 34×26 观察盒`);
  assert.match(svg, /data-city-language="a-settlement"/, `${key} 未登记 A 方案统一城池语言`);
  assert.match(svg, new RegExp(`data-city-kind="${key}"`), `${key} 的稳定基础键标记不一致`);
  for (const part of cityRequiredParts[key]) {
    assert.match(svg, new RegExp(`data-city-part="${part}"`), `${key} 缺少结构 ${part}`);
  }
}
assert.match(CITY_BASE_ICON_SVGS.city, /data-city-part="ring-wall" fill-rule="evenodd"/, "大型城市必须保留完整镂空椭圆环城墙");
const cityStructurePaths = Object.fromEntries(["ring-wall", "gate", "central-tower", "dwellings"].map(part => [part, cityPartPath(CITY_BASE_ICON_SVGS.city, part)]));
assert.equal((cityStructurePaths["ring-wall"].match(/[Mm]/g) || []).length, 2, "大型城市环墙必须包含内外两条实际子路径");
assert.equal((cityStructurePaths["ring-wall"].match(/[Zz]/g) || []).length, 2, "大型城市环墙内外轮廓必须分别闭合");
assert((cityStructurePaths.gate.match(/[A-Za-z]/g) || []).length >= 3, "大型城市正门缺少实际几何命令");
assert((cityStructurePaths["central-tower"].match(/[A-Za-z]/g) || []).length >= 3, "大型城市中央高塔缺少实际几何命令");
assert.equal((cityStructurePaths.dwellings.match(/[Mm]/g) || []).length, 2, "大型城市墙内必须有两组独立屋舍几何");
assert.equal(new Set(Object.values(cityStructurePaths).map(path => geometryFingerprint(`<path d="${path}"/>`))).size, 4, "大型城市城墙、门、塔与屋舍不得复用同一几何");
const scaleKeys = ["hamlet", "village", "town", "city"];
const cityScaleFingerprints = new Set(scaleKeys.map(key => geometryFingerprint(cityBaseIconSvg(key))));
assert.equal(cityScaleFingerprints.size, 4, "城市四级基础轮廓必须各自唯一");
assert.equal(new Set(cityBaseKeys.map(key => geometryFingerprint(cityBaseIconSvg(key)))).size, 9, "九个城市基础剪影必须各自唯一");
for (const role of Object.keys(CITY_ROLE_BADGE_SVGS)) assertSvgContract(`<svg>${cityRoleBadgeSvg([role])}</svg>`, `城市角色 ${role}`);
assert.match(rendererSource, /renderCityBaseIconSvg\(item\.silhouette\)/);
assert.match(rendererSource, /renderCityRoleBadgeSvg\(item\.roles\)/);
assert.match(rendererSource, /resolveMarkerIconVisual\(marker\.type,/);
assert.match(rendererSource, /renderMarkerIconSvg\(item\)/);
assert(!rendererSource.includes("function cityBaseIconSvg("), "renderer 不得保留第二套城市基础几何");
assert(!rendererSource.includes("function cityRoleBadgeSvg("), "renderer 不得保留第二套城市角色几何");

assert.equal(MILITARY_ICON_KEYS.length, 10);
assert.deepEqual(new Set(Object.keys(MILITARY_ICON_SVGS)), new Set(MILITARY_ICON_KEYS), "军事图形注册表与十键分母不一致");
for (const key of MILITARY_ICON_KEYS) {
  const svg = militaryIconSvg(key);
  assertSvgContract(svg, `军事 ${key}`);
  assert.match(svg, new RegExp(`data-icon-variant="${key}"`));
  assert(militaryAssetsSource.includes(`"${key}"`) || militaryAssetsSource.includes(`${key}:`), `军事资产兼容表缺少 ${key}`);
}
for (const legacyAlias of ["步", "弓", "骑", "械", "舟", "▴", "▴🛡", "🏹", "🏹⋯", "♞", "♞◈", "⚙", "⛵", "🚢", "👒"]) {
  assert(militaryAssetsSource.includes(`"${legacyAlias}"`), `军事旧字符别名丢失：${legacyAlias}`);
}
assert.equal(new Set(MILITARY_ICON_KEYS.map(key => geometryFingerprint(MILITARY_ICON_SVGS[key]))).size, 10, "军事十键必须各自具有稳定轮廓");
assert.match(rendererSource, /militaryIconDataUrl\(item\.iconVariant\)/, "军事观察图必须使用受控扁平 SVG");
assert(!rendererSource.includes("militaryIconUrlForVariant"), "正式 renderer 不得继续把旧军事 PNG 打入 bundle");
assert(!militaryAssetsSource.includes("assets/military-icons"), "军事兼容模块不得静态导入旧 PNG");

assert(!generatorSource.includes("canvas-icon-registry"), "generation worker 不得导入含 SVG 的 renderer 注册表");
assert.match(generatorSource, /MARKER_SYMBOL_BY_TYPE\[config\.type\]/, "生成数据必须继续保留旧 symbol 元数据");
assert.match(generatorSource, /manual: Boolean\(visual\.manual\)/, "生成数据必须继续保留手工图标标志");

console.log(JSON.stringify({
  ok: true,
  denominator: CANVAS_ICON_COUNTS,
  resources: 26,
  markerGeometryFingerprints: markerFingerprints.size,
  cityScaleFingerprints: cityScaleFingerprints.size,
  cityBaseFingerprints: 9,
  militaryFingerprints: 10,
  generationWorkerImportsRegistry: false
}, null, 2));

function assertSvgContract(svg, label) {
  assert(!/<text\b/i.test(svg), `${label} 不得包含文字节点`);
  assert(!/<foreignObject\b/i.test(svg), `${label} 不得包含任意 HTML`);
  assert(!/<use\b[^>]+(?:href|xlink:href)=/i.test(svg), `${label} 不得引用外部图形`);
  assert(!/font-family|@font-face/i.test(svg), `${label} 不得依赖字体`);
  assert(!/https?:\/\/(?!www\.w3\.org\/2000\/svg)/i.test(svg), `${label} 不得依赖外部网络资源`);
  assert(!containsEmoji(svg), `${label} 不得包含 emoji`);
}

function geometryFingerprint(svg) {
  return createHash("sha256")
    .update(String(svg)
      .replace(/\s(?:class|id|role|focusable|aria-[\w:-]+|data-[\w:-]+)="[^"]*"/gi, "")
      .replace(/\s+/g, " ")
      .trim())
    .digest("hex");
}

function cityPartPath(svg, part) {
  const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(svg).match(new RegExp(`<path[^>]*data-city-part="${escaped}"[^>]*d="([^"]+)"`));
  assert(match, `大型城市缺少 ${part} 的实际 path`);
  return match[1];
}

function containsEmoji(value) {
  return /\p{Extended_Pictographic}/u.test(String(value));
}
