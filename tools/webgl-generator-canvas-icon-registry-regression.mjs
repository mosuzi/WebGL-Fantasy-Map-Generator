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

const [rendererSource, cityLayerSource, panelSource, generatorSource, militaryAssetsSource, stylesSource, cityVisualsSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/renderer/placeholder-renderer.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/renderer/city-icon-layer.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/MarkerPanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/generator/markers.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/renderer/military-icon-assets.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/city-visuals.js", import.meta.url), "utf8")
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
  hamlet: ["primary-outline"],
  village: ["primary-outline"],
  town: ["primary-outline"],
  city: ["primary-outline", "inner-ring"],
  capital: ["primary-outline"],
  provincial: ["primary-outline"],
  port: ["primary-outline", "water-gap"],
  fort: ["primary-outline"],
  camp: ["primary-outline"]
};
const primaryOutlineGeometries = {};
const cityDrawableCounts = {};
assert.deepEqual(new Set(Object.keys(CITY_BASE_ICON_SVGS)), new Set(cityBaseKeys), "九个城市基础剪影键的双向差集不为 0");
for (const key of cityBaseKeys) {
  const svg = cityBaseIconSvg(key);
  assertSvgContract(svg, `城市 ${key}`);
  assert.match(svg, /viewBox="0 0 34 26"/, `${key} 必须保持 34×26 观察盒`);
  assert.match(svg, /data-city-language="a-minimal-top-down"/, `${key} 未登记方案 A 极简俯视语言`);
  assert.match(svg, new RegExp(`data-city-kind="${key}"`), `${key} 的稳定基础键标记不一致`);
  for (const part of cityRequiredParts[key]) {
    assert.match(svg, new RegExp(`data-city-part="${part}"`), `${key} 缺少结构 ${part}`);
  }
  primaryOutlineGeometries[key] = cityPartGeometry(svg, "primary-outline");
  cityDrawableCounts[key] = (svg.match(/<(?:path|circle|ellipse|rect|polygon|polyline|line)\b/g) || []).length;
  assert(cityDrawableCounts[key] >= 1 && cityDrawableCounts[key] <= 2, `${key} 的可绘制元素不在极简上限内：${cityDrawableCounts[key]}`);
  assert(!/\sfill=(?!"none")/i.test(svg), `${key} 不得包含实心填充`);
  assert.equal((svg.match(/class="city-icon-line(?: city-icon-line--thin)?"/g) || []).length, cityDrawableCounts[key], `${key} 存在未使用极简空心线条类的元素`);
}
for (const forbiddenPart of ["door", "gate", "gate-opening", "tower-window", "tower-windows", "central-tower", "capital-tower", "provincial-hall", "harbor-tower", "spire", "sail", "flag"]) {
  assert(!new RegExp(`data-city-part="${forbiddenPart}"`).test(Object.values(CITY_BASE_ICON_SVGS).join("\n")), `俯视图标仍包含立面结构 ${forbiddenPart}`);
}
assert.equal(new Set(Object.values(primaryOutlineGeometries).map(geometryFingerprint)).size, 9, "九个城市一级主体轮廓必须真实不同");
assert.match(primaryOutlineGeometries.hamlet, /^<circle\b/, "小城镇必须使用小圆环");
assert.match(primaryOutlineGeometries.village, /M17 5 26 20H8Z/, "村镇必须使用三角形");
assert.match(primaryOutlineGeometries.town, /m17 3\.5 11 9\.5-11 9\.5L6 13Z/, "城镇必须使用菱形");
assert.equal((CITY_BASE_ICON_SVGS.city.match(/<ellipse\b/g) || []).length, 2, "大城必须使用双环");
assert.match(primaryOutlineGeometries.capital, /2\.8 6\.8h7\.5l-6 4\.5/, "首都必须使用五角星");
assert((cityPartPath(CITY_BASE_ICON_SVGS.port, "primary-outline").match(/[Mm]/g) || []).length >= 2, "港口必须保留方案 B 的断口马蹄");
const scaleKeys = ["hamlet", "village", "town", "city"];
const cityScaleFingerprints = new Set(scaleKeys.map(key => geometryFingerprint(cityBaseIconSvg(key))));
assert.equal(cityScaleFingerprints.size, 4, "城市四级基础轮廓必须各自唯一");
assert.equal(new Set(cityBaseKeys.map(key => geometryFingerprint(cityBaseIconSvg(key)))).size, 9, "九个城市基础剪影必须各自唯一");
for (const role of Object.keys(CITY_ROLE_BADGE_SVGS)) assertSvgContract(`<svg>${cityRoleBadgeSvg([role])}</svg>`, `城市角色 ${role}`);
assert.match(rendererSource, /createCityIconWebglLayer\(this\.gl\)/, "正式地图没有创建 WebGL 城镇实例层");
assert.match(rendererSource, /this\.cityIconLayer\.setInstances\(this\.cityIconItems/, "城镇模型没有批量上传到实例层");
assert.match(rendererSource, /this\.cityIconLayer\.draw\(/, "正式绘制没有调用城镇实例层");
assert.match(rendererSource, /visual\.manual \? visual\.silhouette : cityRoleSilhouette\(roles, visual\.silhouette\)/, "自动首都、省会和港口没有使用角色主体图形");
assert.match(rendererSource, /\["capital", "provincial", "port"\]\.find\(role => roles\.includes\(role\)\)/, "角色主体图形的优先级漂移");
assert.match(cityLayerSource, /additionalRoleBits\(shape,/, "附加角色没有进入实例数据");
assert.match(cityLayerSource, /bits &= ~CITY_ICON_ROLE_BITS\.capital/, "首都主体仍会重复叠加首都徽记");
assert.doesNotMatch(rendererSource, /createElement\("span"\)[\s\S]{0,240}city-map-icon/, "正式地图仍在创建城镇 DOM 图标");
assert.doesNotMatch(rendererSource, /renderCityBaseIconSvg|renderCityRoleBadgeSvg/, "正式地图仍依赖 SVG 城镇图形");
assert.match(stylesSource, /\.city-icon-line\s*\{[\s\S]*?fill: none;[\s\S]*?stroke:/, "极简主体没有固定为空心线条");
for (const label of ["首都五角星", "港口断口马蹄", "大城双环", "城镇菱形", "村镇三角", "小城镇圆环"]) assert(cityVisualsSource.includes(label), `手工视觉选项仍使用旧图形名称：${label}`);
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
  cityPrimaryOutlineFingerprints: 9,
  cityDrawableCounts,
  formalCityRenderer: "webgl-instanced",
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

function cityPartGeometry(svg, part) {
  const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(svg).match(new RegExp(`<(?:path|circle|ellipse|rect|polygon|polyline|line)\\b[^>]*data-city-part="${escaped}"[^>]*>`));
  assert(match, `城市图标缺少 ${part} 的实际几何`);
  return match[0];
}

function cityPartPath(svg, part) {
  const geometry = cityPartGeometry(svg, part);
  const match = geometry.match(/\sd="([^"]+)"/);
  assert(match, `城市图标 ${part} 不是 path`);
  return match[1];
}

function containsEmoji(value) {
  return /\p{Extended_Pictographic}/u.test(String(value));
}
