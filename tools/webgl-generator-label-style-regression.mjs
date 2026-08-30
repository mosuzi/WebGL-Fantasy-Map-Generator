#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createPatchLabelStyleCommand, createResetAllLabelStylesCommand, createResetLabelStyleCommand} from "../app/webgl-generator/src/runtime/label-style-edit-commands.js";
import {ensureLabelStore, isGeneratedLabelHidden} from "../app/webgl-generator/src/runtime/label-edit-commands.js";
import {
  LABEL_FONT_FAMILIES,
  LABEL_FONT_FALLBACK,
  LABEL_STYLE_DEFAULTS,
  LABEL_STYLE_TYPES,
  LOCAL_LABEL_FONT_ID,
  estimateLabelTextBox,
  hasVisibleLabelShadow,
  labelStyleTypeForTarget,
  normalizeLabelStyleStore,
  normalizeLocalFontFamilyName,
  patchLabelStyle,
  resolveLabelFontFamily,
  resolveLabelStyle
} from "../app/webgl-generator/src/runtime/label-style-registry.js";
import {createCompressedMapDocumentBlob, createMapDocument, parseMapDocument, parseMapDocumentPayload, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {PNG_SEMANTIC_LABEL_SELECTORS} from "../app/webgl-generator/src/runtime/canvas-text-contract.js";
import {createLocalFontFamilyOptions} from "../app/webgl-generator/src/runtime/local-font-catalog.js";
import {LABEL_TARGET_KIND} from "../app/webgl-generator/src/runtime/object-kinds.js";
import {resolveVisualTheme} from "../app/webgl-generator/src/renderer/themes.js";

const map = {
  metadata: {seed: "label-style-regression", checksum: "checksum-must-stay"},
  options: {},
  grid: {points: [[0, 0], [24, 36]], cells: {i: [0, 1], h: [30, 30], burg: [0, -1]}},
  settlements: {cities: [{id: 0, burgId: 1, cell: 0, packCell: 0, name: "王城", capital: true, x: 20, y: 30}], routes: []},
  politics: {
    states: [null, {i: 1, name: "北国", fullName: "北境王国", center: 1}],
    provinces: [null, {i: 1, state: 1, name: "霜原", pole: [24, 36], center: 1}]
  },
  pack: {cells: {i: [0, 1], g: [0, 1], burg: [1, 0], p: [[0, 0], [24, 36]]}, burgs: [null, {i: 1, id: 1, cityId: 0, cell: 0, name: "王城", capital: 1, x: 20, y: 30}], routes: []}
};
const store = ensureLabelStore(map);
assert.equal(store.styles.version, 1);
assert.deepEqual(Object.keys(store.styles.overrides), []);
assert.deepEqual(map.labels.hidden.province, []);
assert.equal(LABEL_STYLE_TYPES.length, 6);
assert.deepEqual(LABEL_STYLE_TYPES, ["state", "province", "capital", "city", "custom", "zone"]);
const cartographicFont = LABEL_FONT_FAMILIES.cartographic;
assert.match(cartographicFont, /KaiTi[\s\S]*Noto Serif SC[\s\S]*Noto Serif CJK SC[\s\S]*SimSun/, "舆图楷体没有提供跨平台中文楷宋回退");
const historicalFont = LABEL_FONT_FAMILIES.historical;
assert.match(historicalFont, /Source Han Serif SC[\s\S]*Noto Serif SC[\s\S]*Noto Serif CJK SC[\s\S]*Songti SC[\s\S]*SimSun/, "历史图册宋体没有提供跨平台中文宋体回退");
assert.doesNotMatch(historicalFont, /KaiTi|Kaiti|STKaiti/, "历史图册宋体错误混入楷体");
const historicalDisplayFont = LABEL_FONT_FAMILIES.historicalDisplay;
assert.match(historicalDisplayFont, /Source Han Sans SC[\s\S]*Noto Sans SC[\s\S]*Noto Sans CJK SC[\s\S]*Microsoft YaHei[\s\S]*PingFang SC/, "历史图册黑体没有提供跨平台中文黑体回退");
assert.doesNotMatch(historicalDisplayFont, /KaiTi|Kaiti|STKaiti/, "历史图册黑体错误混入楷体");
for (const styleType of LABEL_STYLE_TYPES) {
  const style = resolveLabelStyle(map, styleType);
  assert.ok(Object.hasOwn(LABEL_FONT_FAMILIES, style.fontFamilyId), `${styleType} 字体 id 不稳定`);
  for (const field of ["fontSize", "fontWeight", "letterSpacing", "opacity", "strokeWidth", "shadowOffsetX", "shadowOffsetY", "shadowBlur"]) {
    assert.ok(Number.isFinite(style[field]), `${styleType}.${field} 不是有限数值`);
  }
  assert.equal(hasVisibleLabelShadow(style), false, `${styleType} 默认样式仍启用阴影`);
  assert.deepEqual(
    [LABEL_STYLE_DEFAULTS[styleType].shadowOffsetX, LABEL_STYLE_DEFAULTS[styleType].shadowOffsetY, LABEL_STYLE_DEFAULTS[styleType].shadowBlur],
    [0, 0, 0],
    `${styleType} 默认阴影参数没有归零`
  );
  const expectedFont = ["state", "capital", "custom", "zone"].includes(styleType) ? "historicalDisplay" : "historical";
  assert.equal(style.fontFamilyId, expectedFont, `${styleType} 默认字体没有使用现代历史图册分级字体`);
  if (["province", "capital", "city"].includes(styleType)) assert.equal(style.strokeWidth, 0, `${styleType} 默认标签仍有描边`);
  else assert.ok(style.strokeWidth > 0 && style.strokeWidth <= 0.8, `${styleType} 默认净空边超出现代历史图册范围`);
}
assert.deepEqual(LABEL_STYLE_DEFAULTS.zone, LABEL_STYLE_DEFAULTS.custom, "地区默认样式没有显式继承手工标签默认值");
assert.ok(LABEL_STYLE_DEFAULTS.state.fontSize > LABEL_STYLE_DEFAULTS.province.fontSize, "国家和省份字号层级不清");
assert.ok(LABEL_STYLE_DEFAULTS.province.fontSize > LABEL_STYLE_DEFAULTS.city.fontSize, "省份和城市字号层级不清");
assert.ok(LABEL_STYLE_DEFAULTS.state.letterSpacing > LABEL_STYLE_DEFAULTS.province.letterSpacing, "区域标签没有形成大而疏排的层级");
assert.ok(LABEL_STYLE_DEFAULTS.province.letterSpacing > LABEL_STYLE_DEFAULTS.city.letterSpacing, "城市标签没有保持小而紧凑");
const explicitLegacyCartographic = resolveLabelStyle({version: 1, overrides: {state: {fontFamilyId: "cartographic"}}}, "state");
assert.equal(explicitLegacyCartographic.fontFamilyId, "cartographic", "旧图显式舆图楷体被新默认覆盖");
assert.match(explicitLegacyCartographic.fontFamily, /KaiTi|Kaiti|STKaiti/, "旧图显式舆图楷体没有继续解析为楷体栈");

const defaultTheme = resolveVisualTheme("default");
const defaultStateStyle = resolveLabelStyle(map, "state", defaultTheme);
const defaultProvinceStyle = resolveLabelStyle(map, "province", defaultTheme);
const defaultCityStyle = resolveLabelStyle(map, "city", defaultTheme);
const defaultCustomStyle = resolveLabelStyle(map, "custom", defaultTheme);
const defaultZoneStyle = resolveLabelStyle(map, "zone", defaultTheme);
assert.equal(defaultStateStyle.color, "#293038", "默认国家标签没有使用炭黑墨色");
assert.equal(defaultProvinceStyle.color, "#734750", "默认省份标签没有使用克制酒红色");
assert.equal(defaultProvinceStyle.opacity, 0.82, "默认省份标签透明度没有收敛");
assert.equal(LABEL_STYLE_DEFAULTS.province.strokeWidth, 0, "默认省份标签仍被浅色描边冲淡");
assert.equal(LABEL_STYLE_DEFAULTS.city.fontWeight, 600, "默认普通城市名没有使用中等字重");
assert.equal(LABEL_STYLE_DEFAULTS.capital.strokeWidth, 0, "默认首都名仍有描边");
assert.equal(LABEL_STYLE_DEFAULTS.city.strokeWidth, 0, "默认普通城市名仍有描边");
assert.equal(defaultCityStyle.color, "#20252a", "默认城市标签没有使用深色中性墨色");
assert.equal(defaultZoneStyle.color, defaultCustomStyle.color, "默认地区标签没有继承手工标签主题颜色");
assert.equal(defaultZoneStyle.strokeColor, defaultCustomStyle.strokeColor, "默认地区标签没有继承手工标签主题衬边");
assert.equal(hasVisibleLabelShadow(defaultStateStyle), false, "默认主题重新引入了国家标签阴影");
assert.ok(defaultTheme.labels.customBackground[3] >= 0.8, "手工标签没有使用稳定中性浅底");
assert.ok(Math.abs(defaultTheme.labels.customBorder[0] - defaultTheme.labels.customBorder[1]) < 0.05, "手工标签边框仍带明显仿旧褐色");

const theme = {labels: {state: [0.2, 0.4, 0.6, 0.7], stateShadow: [0.05, 0.1, 0.15, 1], city: [0.7, 0.8, 0.9, 0.85], cityHalo: [0.1, 0.1, 0.1, 1], custom: [0.9, 0.7, 0.5, 0.9], customBorder: [0.2, 0.1, 0.05, 1]}};
assert.equal(resolveLabelStyle(map, "province", theme).color, resolveLabelStyle(map, "state", theme).color, "省份没有继承国家主题层");
assert.equal(resolveLabelStyle(map, "capital", theme).color, resolveLabelStyle(map, "city", theme).color, "首都没有继承城市主题层");
assert.equal(resolveLabelStyle(map, "zone", theme).color, resolveLabelStyle(map, "custom", theme).color, "地区没有显式继承手工标签主题层");
assert.equal(resolveLabelStyle(map, "zone", theme).strokeColor, resolveLabelStyle(map, "custom", theme).strokeColor, "地区没有继承手工标签主题衬边");
patchLabelStyle(map, "province", {fontSize: 999, opacity: -2, letterSpacing: 4, color: "#123456"});
assert.equal(resolveLabelStyle(map, "province", theme).fontSize, 72, "字号没有 clamp");
assert.equal(resolveLabelStyle(map, "province", theme).opacity, 0, "不透明度没有 clamp");
assert.equal(resolveLabelStyle(map, "province", theme).color, "#123456", "地图覆盖没有高于主题层");
assert.throws(() => patchLabelStyle(map, "city", {fontFamilyId: "remote-font"}), /不支持的标签字体/);
assert.throws(() => patchLabelStyle(map, "city", {fontFamilyId: LOCAL_LABEL_FONT_ID, fontFamilyName: ""}), /本机字体/);
patchLabelStyle(map, "city", {fontFamilyId: LOCAL_LABEL_FONT_ID, fontFamilyName: "  Example   Local Font  "});
const localCityStyle = resolveLabelStyle(map, "city");
assert.equal(localCityStyle.fontFamilyId, LOCAL_LABEL_FONT_ID);
assert.equal(localCityStyle.fontFamilyName, "Example Local Font");
assert.equal(localCityStyle.fontFamily, `"Example Local Font", ${LABEL_FONT_FALLBACK}`, "本机字体没有追加系统 fallback");
assert.equal(resolveLabelFontFamily(LOCAL_LABEL_FONT_ID, "Missing Font").endsWith(LABEL_FONT_FALLBACK), true);
assert.equal(normalizeLocalFontFamilyName("bad\u0000font"), "", "控制字符字体名没有拒绝");
patchLabelStyle(map, "city", {fontFamilyId: "sans", fontFamilyName: null});
assert.equal(resolveLabelStyle(map, "city").fontFamilyId, "sans");
assert.equal(resolveLabelStyle(map, "city").fontFamilyName, null, "切回内置字体仍残留本机字体名");
const customColorBeforeZoneOverride = resolveLabelStyle(map, "custom", theme).color;
patchLabelStyle(map, "zone", {fontSize: 27, color: "#654321", opacity: 0.55, strokeColor: "#abcdef", strokeWidth: 0.45});
assert.equal(resolveLabelStyle(map, "zone", theme).color, "#654321", "地区覆盖没有高于主题继承层");
assert.equal(resolveLabelStyle(map, "zone", theme).fontSize, 27);
assert.equal(resolveLabelStyle(map, "custom", theme).color, customColorBeforeZoneOverride, "地区覆盖污染了手工标签样式");

const localFontOptions = createLocalFontFamilyOptions([
  {family: "KaiTi", fullName: "楷体", postscriptName: "KaiTi", style: "Regular"},
  {family: "KaiTi", fullName: "楷体 粗体", postscriptName: "KaiTi-Bold", style: "Bold"},
  {family: "Fallback Sans", fullName: "", postscriptName: "FallbackSans-Regular", style: "Regular"},
  {family: "", fullName: "", postscriptName: "IdOnly-Regular", style: "Regular"}
]);
assert.equal(localFontOptions.length, 3, "本机字体没有按字体族去重");
assert.deepEqual(localFontOptions.find(font => font.family === "KaiTi"), {family: "KaiTi", displayName: "楷体", id: "KaiTi"}, "本机字体没有优先使用可读完整名称");
assert.equal(localFontOptions.find(font => font.family === "Fallback Sans")?.displayName, "Fallback Sans", "缺少完整名称时没有回退字体族标识");
assert.equal(localFontOptions.find(font => font.family === "IdOnly-Regular")?.displayName, "IdOnly-Regular", "缺少名称和字体族时没有回退字体 ID");

const history = new EditHistory();
const context = {map};
const checksum = map.metadata.checksum;
history.execute(createPatchLabelStyleCommand("state", {fontSize: 41}), context);
assert.equal(resolveLabelStyle(map, "state").fontSize, 41);
history.execute(createResetLabelStyleCommand("state"), context);
assert.equal(resolveLabelStyle(map, "state").fontSize, LABEL_STYLE_DEFAULTS.state.fontSize);
history.undo(context);
assert.equal(resolveLabelStyle(map, "state").fontSize, 41, "重置撤销没有恢复覆盖");
history.redo(context);
assert.equal(resolveLabelStyle(map, "state").fontSize, LABEL_STYLE_DEFAULTS.state.fontSize, "重置重做没有清除覆盖");
history.execute(createResetAllLabelStylesCommand(), context);
assert.deepEqual(map.labels.styles.overrides, {});
assert.equal(map.metadata.checksum, checksum, "样式命令不应改写地图 checksum");
history.execute(createPatchLabelStyleCommand("custom", {fontFamilyId: LOCAL_LABEL_FONT_ID, fontFamilyName: "Archive Only Font"}), context);
assert.equal(resolveLabelStyle(map, "custom").fontFamilyName, "Archive Only Font");
history.undo(context);
assert.equal(resolveLabelStyle(map, "custom").fontFamilyId, "historicalDisplay", "本机字体撤销没有恢复历史图册黑体");
history.redo(context);
assert.equal(resolveLabelStyle(map, "custom").fontFamilyName, "Archive Only Font", "本机字体重做没有恢复字体族名称");
history.execute(createPatchLabelStyleCommand("custom", {strokeWidth: 0.01, shadowOffsetX: 0.1, shadowOffsetY: -0.1, shadowBlur: 0.1}), context);
const fineEffectStyle = resolveLabelStyle(map, "custom");
assert.equal(fineEffectStyle.strokeWidth, 0.01, "0.01px 描边被归零或四舍五入");
assert.equal(fineEffectStyle.shadowOffsetX, 0.1, "阴影横移细步长没有保留");
assert.equal(fineEffectStyle.shadowOffsetY, -0.1, "阴影纵移细步长没有保留负值");
assert.equal(fineEffectStyle.shadowBlur, 0.1, "阴影模糊细步长没有保留");
assert.equal(hasVisibleLabelShadow(fineEffectStyle), true, "显式非零阴影被错误关闭");
history.undo(context);
assert.equal(resolveLabelStyle(map, "custom").strokeWidth, LABEL_STYLE_DEFAULTS.custom.strokeWidth, "细效果撤销没有恢复默认细衬边");
history.redo(context);
assert.equal(resolveLabelStyle(map, "custom").strokeWidth, 0.01, "细效果重做没有恢复描边");
assert.equal(resolveLabelStyle(map, "custom").shadowOffsetY, -0.1, "细效果重做没有恢复阴影");
history.execute(createPatchLabelStyleCommand("zone", {fontSize: 31, color: "#102030"}), context);
assert.equal(resolveLabelStyle(map, "zone").fontSize, 31);
assert.equal(resolveLabelStyle(map, "custom").fontSize, LABEL_STYLE_DEFAULTS.custom.fontSize, "地区命令污染了手工标签默认字号");
history.undo(context);
assert.equal(resolveLabelStyle(map, "zone").fontSize, LABEL_STYLE_DEFAULTS.zone.fontSize, "地区样式撤销没有恢复原覆盖");
history.redo(context);
assert.equal(resolveLabelStyle(map, "zone").fontSize, 31, "地区样式重做没有恢复新覆盖");

assert.equal(labelStyleTypeForTarget(LABEL_TARGET_KIND.CITY, map.settlements.cities[0]), "capital", "首都样式拆分改变了 city target identity");
assert.equal(labelStyleTypeForTarget(LABEL_TARGET_KIND.ZONE), "zone", "地区 target 没有映射到独立样式类型");
assert.equal(LABEL_TARGET_KIND.CITY, "city");
map.labels.hidden.province.push(1);
assert.equal(isGeneratedLabelHidden(map, LABEL_TARGET_KIND.PROVINCE, 1), true);
map.labels.hidden.province.length = 0;

const smallStyle = resolveLabelStyle({version: 1, overrides: {city: {fontSize: 12, letterSpacing: 0}}}, "city");
const largeStyle = resolveLabelStyle({version: 1, overrides: {city: {fontSize: 30, letterSpacing: 6}}}, "city");
const smallBox = estimateLabelTextBox("北境城", smallStyle);
const largeBox = estimateLabelTextBox("北境城", largeStyle);
assert.ok(largeBox.width > smallBox.width && largeBox.height > smallBox.height, "字号/字距没有改变碰撞盒");
const zoneSmallBox = estimateLabelTextBox("北境荒原", resolveLabelStyle({version: 1, overrides: {zone: {fontSize: 10}}}, "zone"));
const zoneLargeBox = estimateLabelTextBox("北境荒原", resolveLabelStyle({version: 1, overrides: {zone: {fontSize: 38, letterSpacing: 5}}}, "zone"));
assert.ok(zoneLargeBox.width > zoneSmallBox.width && zoneLargeBox.height > zoneSmallBox.height, "地区字号没有进入共享碰撞盒");

const document = createMapDocument(map, map.options);
const roundTrip = parseMapDocument(stringifyMapDocument(document));
assert.equal(roundTrip.map.labels.styles.version, 1);
assert.equal(roundTrip.map.labels.styles.overrides.custom.fontFamilyName, "Archive Only Font", "完整地图没有保存本机字体族名称");
assert.equal(roundTrip.map.labels.styles.overrides.custom.strokeWidth, 0.01, "完整地图没有保留 0.01px 描边");
assert.equal(roundTrip.map.labels.styles.overrides.custom.shadowOffsetX, 0.1, "完整地图没有保留细阴影横移");
assert.equal(roundTrip.map.labels.styles.overrides.custom.shadowOffsetY, -0.1, "完整地图没有保留细阴影纵移");
assert.equal(roundTrip.map.labels.styles.overrides.custom.shadowBlur, 0.1, "完整地图没有保留细阴影模糊");
assert.equal(roundTrip.map.labels.styles.overrides.zone.fontSize, 31, "完整地图没有保存地区样式覆盖");
assert.equal(roundTrip.map.labels.styles.overrides.zone.color, "#102030", "完整地图没有保存地区文字颜色");
const legacyFiveTypeStore = normalizeLabelStyleStore({version: 1, overrides: {state: {fontSize: 25}, province: {fontSize: 15}, capital: {fontSize: 14}, city: {fontSize: 12}, custom: {fontSize: 16}}}, {strict: true});
assert.equal(legacyFiveTypeStore.version, 1, "五类型旧样式存储不应升级版本");
assert.equal(Object.hasOwn(legacyFiveTypeStore.overrides, "zone"), false, "五类型旧样式存储被伪造地区覆盖");
const oldV2 = structuredClone(document);
delete oldV2.map.labels.styles;
delete oldV2.map.labels.hidden.province;
const parsedOldV2 = parseMapDocument(stringifyMapDocument(oldV2));
assert.equal(parsedOldV2.map.labels.styles.version, 1, "旧 v2 没有补样式存储");
assert.deepEqual(parsedOldV2.map.labels.hidden.province, [], "旧 v2 没有补省份隐藏表");
const normalizedOldV2 = createMapDocument(parsedOldV2.map, parsedOldV2.options);
assert.equal(normalizedOldV2.map.labels.styles.version, 1, "旧 v2 再导出没有补样式存储");
assert.deepEqual(normalizedOldV2.map.labels.hidden.province, [], "旧 v2 再导出没有补省份隐藏表");

const oldV1 = JSON.parse(await readFile(new URL("./fixtures/webgl-map-v1-minimal.json", import.meta.url), "utf8"));
const migratedV1 = parseMapDocument(JSON.stringify(oldV1));
assert.equal(migratedV1.map.labels.styles.version, 1);
assert.deepEqual(migratedV1.map.labels.hidden.province, []);

const documentRef = {defaultView: globalThis};
const compressed = await createCompressedMapDocumentBlob(documentRef, document);
const gzipBase64 = Buffer.from(await compressed.blob.arrayBuffer()).toString("base64");
const parsedGzip = await parseMapDocumentPayload(documentRef, {encoding: "gzip-base64", data: gzipBase64});
assert.equal(parsedGzip.map.labels.styles.version, 1, "gzip 全图链没有保留标签样式");
assert.equal(parsedGzip.map.labels.styles.overrides.custom.fontFamilyName, "Archive Only Font", "gzip 没有保存本机字体族名称");
assert.equal(parsedGzip.map.labels.styles.overrides.zone.fontSize, 31, "gzip 没有保存地区样式覆盖");

const [rendererSource, controlPanelSource, mapIoSource, stylesSource, switchFieldSource, appSource, consoleApiSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/renderer/placeholder-renderer.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/ControlPanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/map-file-io.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/base/UiSwitchField.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/console-api.js", import.meta.url), "utf8")
]);
assert.match(rendererSource, /getLabelStates\(map\), \.\.\.getLabelProvinces\(map\), \.\.\.getLabelCities/, "标签固定层序不是国家→省份→城市");
assert.match(rendererSource, /isWorldPoint\(province\.pole\)[\s\S]*province\.center/, "省份标签没有 pole→center 回退");
assert.match(rendererSource, /provinceLabel[\s\S]*boxesOverlapAny\(occupiedStates/, "省份标签没有避让国家名称");
assert.match(controlPanelSource, /data-control-panel="styles"[\s\S]*reset-all-label-styles/, "样式页或全部重置入口缺失");
assert.match(controlPanelSource, /class="style-scope-navigation"[\s\S]*id="style-scope-navigation-title">编辑内容<[\s\S]*class="style-scope-segmented"/, "样式类别没有收敛为紧凑内联入口");
assert.doesNotMatch(controlPanelSource, /选择样式类别|边界效果与地图文字分别调整，互不改变/, "样式类别仍保留占位过大的标题说明块");
assert.match(controlPanelSource, /v-show="activeStyleSection === 'labels'"[^>]*class="style-category-card label-style-editor"[\s\S]*id="label-style-editor-title">地图标签<[\s\S]*>当前地图样式 · 按标签类型</, "标签控件没有归入独立的当前地图样式层级");
assert.match(controlPanelSource, /调整地图上的国家、省份、城市等文字外观；不会改变国界颜色过渡/, "标签样式没有明确与国界效果分离");
assert.match(controlPanelSource, /\{value: "zone", label: "地区名称"\}/, "样式页没有地区名称类型");
assert.match(controlPanelSource, /load-local-label-fonts[\s\S]*queryLocalFonts/, "样式页没有用户触发的本机字体读取入口");
assert.match(controlPanelSource, /本机未检测到[\s\S]*系统字体/, "样式页没有缺失字体 fallback 状态");
assert.match(controlPanelSource, /input-id="label-style-stroke-width"[^>]*:step="0\.01"/, "描边步长不是 0.01");
assert.match(controlPanelSource, /cartographic:\s*"舆图楷体"/, "样式页没有显示舆图楷体名称");
assert.match(controlPanelSource, /historical:\s*"历史图册宋体"/, "样式页没有显示历史图册宋体名称");
assert.match(controlPanelSource, /historicalDisplay:\s*"历史图册黑体"/, "样式页没有显示历史图册黑体名称");
assert.match(controlPanelSource, /input-id="label-style-shadow-x"[^>]*:step="0\.1"/, "阴影横移步长不是 0.1");
assert.match(controlPanelSource, /input-id="label-style-shadow-y"[^>]*:step="0\.1"/, "阴影纵移步长不是 0.1");
assert.match(controlPanelSource, /input-id="label-style-shadow-blur"[^>]*:step="0\.1"/, "阴影模糊步长不是 0.1");
assert.match(controlPanelSource, /input-id="label-style-italic"[^>]*compact-hit-area/, "斜体开关没有启用紧凑热区");
assert.match(switchFieldSource, /compactHitArea:[\s\S]*default: false/, "共享开关的紧凑热区没有保持默认兼容");
assert.match(switchFieldSource, /compactHitArea && !event\.target\.closest\?\.\("\.ui-switch-label"\)/, "紧凑热区没有忽略行尾空白");
assert.match(switchFieldSource, /if \(event\.target\.closest\?\.\("\.el-switch"\)\) return;/, "开关本体点击可能被根行重复切换");
assert.match(switchFieldSource, /<ElSwitch[\s\S]*:aria-label="label"[\s\S]*@change="commitValue"/, "Element Plus 开关的键盘与可访问入口丢失");
const stylePanelSource = controlPanelSource.match(/class="control-panel-section label-style-panel"[\s\S]*?data-control-panel="units"/)?.[0] || "";
assert.equal(stylePanelSource.match(/unit-label="px"/g)?.length, 6, "样式页 px 滑动条数量发生漂移");
assert.match(stylesSource, /\.label-style-panel \.ui-slider-field\s*\{[^}]*grid-template-columns:\s*72px minmax\(0, 1fr\) 84px;/, "样式页无单位滑动条没有为长标签保留列宽");
assert.match(stylesSource, /\.label-style-panel \.ui-slider-field-has-unit\s*\{[^}]*grid-template-columns:\s*72px minmax\(0, 1fr\) 84px max-content;/, "样式页带单位滑动条没有保持数值与单位独立列");
assert.match(stylesSource, /\.label-style-panel \.ui-slider-field > span:first-child\s*\{[^}]*white-space:\s*nowrap;/, "样式页滑动条标签仍可能折行");
assert.match(stylesSource, /\.style-scope-navigation,\s*\.style-category-card\s*\{[^}]*min-width:\s*0;/, "二级样式层级没有防止窄面板横向溢出");
assert.match(stylesSource, /\.style-scope-navigation\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;[^}]*padding:\s*2px 0 4px;/, "样式类别入口没有使用低占位的可换行布局");
assert.match(stylesSource, /\.control-panel-tabs,\s*\.style-scope-segmented\s*\{[^}]*--control-panel-tab-height:\s*30px;[^}]*--control-panel-tab-gap:\s*6px;[^}]*--control-panel-tab-border:\s*#33444f;[^}]*--control-panel-tab-radius:\s*6px;[^}]*--control-panel-tab-active-background:\s*#2b2415;/, "两级 tab 没有共享同一套视觉 token");
assert.match(stylesSource, /\.style-scope-segmented\s*\{[^}]*flex:\s*0 1 216px;[^}]*--ui-segmented-height:\s*var\(--control-panel-tab-height\);/, "样式类别按钮没有保持紧凑宽度并对齐顶层 tab 高度");
assert.match(stylesSource, /\.style-scope-segmented \.ui-segmented-el\s*\{[^}]*padding:\s*0;[^}]*background:\s*transparent;/, "二级 tab 最外层容器与标签之间仍有空隙");
assert.match(stylesSource, /\.style-scope-segmented \.ui-segmented-el \.el-segmented__group\s*\{[^}]*gap:\s*var\(--control-panel-tab-gap\);[^}]*padding:\s*0;[^}]*border:\s*0;[^}]*background:\s*transparent;/, "二级 tab 容器与首尾标签之间仍有内缩空隙");
assert.match(stylesSource, /\.style-scope-segmented \.ui-segmented-el \.el-segmented__item\s*\{[^}]*padding:\s*0;/, "二级 tab 项仍保留组件默认的左右内缩空隙");
assert.match(stylesSource, /\.style-scope-segmented \.ui-segmented-el \.el-segmented__item-label\s*\{[^}]*height:\s*var\(--control-panel-tab-height\);[^}]*border-color:\s*var\(--control-panel-tab-border\);[^}]*border-radius:\s*var\(--control-panel-tab-radius\);[^}]*background:\s*var\(--control-panel-tab-background\) !important;[^}]*font-weight:\s*700;[^}]*line-height:\s*calc\(var\(--control-panel-tab-height\) - 2px\);/, "二级 tab 标签没有复用顶层描边按钮样式与真实高度");
assert.match(stylesSource, /\.state-border-blend-editor\s*\{[^}]*border-color:[^}]*box-shadow:[^}]*\}[\s\S]*\.label-style-editor\s*\{[^}]*border-color:[^}]*box-shadow:/, "国界与标签样式卡没有形成可辨识的视觉层级");
assert.match(stylesSource, /\.custom-label \.map-label-content\s*\{[^}]*padding:\s*2px 5px;[^}]*border-radius:\s*2px;/, "手工标签没有使用现代图册窄注记底板");
assert.ok(PNG_SEMANTIC_LABEL_SELECTORS.includes(".province-label.visible"), "PNG overlay 没有纳入省份名称");
assert.ok(PNG_SEMANTIC_LABEL_SELECTORS.includes(".zone-label.visible"), "PNG overlay 没有纳入地区名称");
assert.match(mapIoSource, /selectors\.push\(\.\.\.PNG_SEMANTIC_LABEL_SELECTORS\)/, "PNG overlay 没有消费语义标签生产契约");
assert.doesNotMatch(stylesSource, /\.zone-label\s*\{[^}]*color:\s*var\(--theme-custom-label/, "地区标签仍用固定主题颜色覆盖 resolved style");
assert.doesNotMatch(stylesSource, /\.zone-label\s*\{[^}]*font-size:\s*calc\(var\(--label-font-size\)\s*\*\s*0\.86\)/, "地区标签仍把 resolved 字号缩小为 0.86 倍");
assert.match(rendererSource, /--label-stroke-width[\s\S]*--label-shadow-offset-x[\s\S]*--label-shadow-blur/, "实时标签没有把细效果值写入共享 CSS 变量");
assert.match(rendererSource, /hasVisibleLabelShadow\(style\) \? style\.shadowColor : "transparent"/, "实时标签没有显式关闭零效果阴影");
assert.match(controlPanelSource, /textShadow:\s*hasVisibleLabelShadow\(activeLabelStyle\.value\)[\s\S]*:\s*"none"/, "样式预览没有显式关闭零效果阴影");
assert.match(mapIoSource, /--label-stroke-width[\s\S]*--label-shadow-blur[\s\S]*--label-shadow-offset-x[\s\S]*--label-shadow-offset-y/, "PNG 没有读取实时标签的共享效果值");
assert.match(mapIoSource, /context\.strokeText\([\s\S]*context\.fillText\(/, "PNG 文字没有按描边→填充绘制");
assert.match(appSource, /getStyles:\s*\(\) => getRuntimeLabelStyles\(state\)[\s\S]*setStyle:\s*\(styleType, patch\) => setLabelStyleViaApi/, "既有标签样式 action 没有直接消费六类型 registry");
assert.match(consoleApiSource, /labels:\s*Object\.freeze\(\{[\s\S]*getStyles[\s\S]*setStyle[\s\S]*resetStyle[\s\S]*resetStyles/, "既有标签样式公开 API 接线缺失");

console.log(JSON.stringify({
  ok: true,
  styleTypes: LABEL_STYLE_TYPES,
  checksumUnchanged: map.metadata.checksum === checksum,
  boxResponse: {small: smallBox, large: largeBox},
  oldV1Migrated: migratedV1.map.labels.styles.version,
  oldV2Normalized: normalizedOldV2.map.labels.styles.version,
  gzipRoundTrip: parsedGzip.map.labels.styles.version,
  history: history.getStats()
}, null, 2));
