#!/usr/bin/env node
import assert from "node:assert/strict";
import {existsSync, readFileSync, statSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {DEFAULT_LAYER_VISIBILITY, DEFAULT_MAX_CITY_LABELS} from "../app/webgl-generator/src/runtime/display-defaults.js";
import {LABEL_FONT_FAMILIES, LABEL_STYLE_DEFAULTS} from "../app/webgl-generator/src/runtime/label-style-registry.js";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const toolSource = read("tools/webgl-generator-readme-showcase.mjs");
const layoutSource = read("app/webgl-generator/src/renderer/political-label-layout.js");
const controlSource = read("app/webgl-generator/src/ui/vue/components/ControlPanel.vue");
const rendererSource = read("app/webgl-generator/src/renderer/placeholder-renderer.js");
const storeSource = read("app/webgl-generator/src/ui/vue/stores/global-config-store.js");
const packageJson = JSON.parse(read("package.json"));
const readmes = ["README.md", "README.en.md"].map(path => ({path, source: read(path)}));

assert.equal(
  packageJson.scripts["capture:readme-showcase"],
  "vite build --config vite.config.mjs && node --no-warnings ./tools/webgl-generator-readme-showcase.mjs",
  "README 单命令不应嵌套调用包管理器"
);

assert.equal(DEFAULT_MAX_CITY_LABELS, 128, "fresh session 城市标签上限不是 128");
assert.deepEqual(DEFAULT_LAYER_VISIBILITY, {
  routes: true,
  tradeFlows: false,
  rivers: true,
  oceanCurrents: false,
  cities: true,
  labels: true,
  stateLabels: true,
  provinceLabels: false,
  population: true,
  markers: false,
  resources: false,
  military: false,
  warFronts: false,
  zones: false,
  zoneEvents: false,
  zoneNatural: false,
  zoneWilderness: false,
  zoneLabels: false,
  measurements: false,
  scaleBar: true,
  mapBadge: false,
  coastline: true,
  lakeShore: true,
  stateBorders: true,
  provinceBorders: false,
  gridCells: false
}, "集中默认图层表与任务冻结值不一致");
assert.match(rendererSource, /createDefaultLayerVisibility\(\)/, "renderer 没有消费集中默认图层表");
assert.match(controlSource, /DEFAULT_LAYER_VISIBILITY\[layer\] !== false/, "图层面板没有消费集中默认图层表");
assert.match(storeSource, /maxCityLabels: DEFAULT_MAX_CITY_LABELS/, "持久化配置没有使用集中城市标签默认值");

assert.match(LABEL_FONT_FAMILIES.historical, /Noto Serif SC/, "宋体栈缺少 Windows Noto Serif SC family");
assert.match(LABEL_FONT_FAMILIES.historicalDisplay, /Noto Sans SC/, "黑体栈缺少 Windows Noto Sans SC family");
assert.deepEqual(pickStyle("state"), {fontSize: 22, fontWeight: 650, letterSpacing: 2.4, opacity: 0.9});
assert.deepEqual(pickStyle("province"), {fontSize: 12, fontWeight: 500, letterSpacing: 0.7, opacity: 0.82});
assert.deepEqual(pickStyle("capital"), {fontSize: 13, fontWeight: 650, letterSpacing: 0.1, opacity: 0.96});
assert.deepEqual(pickStyle("city"), {fontSize: 11, fontWeight: 600, letterSpacing: 0.05, opacity: 0.9});
assert.equal(LABEL_STYLE_DEFAULTS.province.color, "#734750", "省份默认色没有收敛为克制酒红");
assert.match(layoutSource, /STATE_MIN_LETTER_SPACING = 2\.4/, "国家标签布局硬下限未同步");
assert.match(layoutSource, /PROVINCE_MIN_LETTER_SPACING = 0\.7/, "省份标签布局硬下限未同步");

for (const pattern of [
  /launchPersistentContext/,
  /newCDPSession/,
  /Emulation\.setDeviceMetricsOverride/,
  /mkdtempSync\(join\(profileBaseDir, "fmg-readme-showcase-"\)\)/,
  /seed = "mountains-and-seas"/,
  /randomSeed: false/,
  /heightmapTemplate: "continents"/,
  /statesNumber: 12/,
  /provincesRatio: 30/,
  /maxCityLabels = 128/,
  /id: "relief"[\s\S]*?viewMode: "height"[\s\S]*?labels: false, cityIcons: false/,
  /id: "states"[\s\S]*?viewMode: "states"[\s\S]*?labels: true, cityIcons: true/,
  /setViewMode\(scene\.viewMode\)/,
  /Object\.entries\(scene\.layers\)/,
  /capture\.layers, scene\.layers/,
  /capture\.visible, \{states: 0, provinces: 0, cities: 0\}/,
  /webglGeneratorApi\.data\.exportPNG/,
  /crop: \{mode: "viewport"/,
  /generation\.defaults\.layers, DEFAULT_LAYER_VISIBILITY/,
  /generation\.defaults\.labelStyleOverrides, \{\}/,
  /runtime\.labelStyleOverrides, \{\}/,
  /performanceEvents/,
  /__fmg_readme_showcase_storage_initialized__/,
  /verifySavedPreferenceCompatibility/,
  /maxCityLabels: 5000/,
  /setMaxCityLabels\(173\)/,
  /FMG_README_SHOWCASE_FAIL_AFTER_BROWSER/,
  /browserContext\.close\(\)/,
  /removeOwnedProfile\(profileDir\)/
]) assert.match(toolSource, pattern, `README 生成工具缺少契约：${pattern}`);
for (const [pattern, message] of [
  [/page\.screenshot|Page\.captureScreenshot/, "README 工具绕过正式 PNG 合成链截图"],
  [/\b(?:9222|9333)\b/, "README 工具使用固定 CDP 端口"],
  [/(?:127\.0\.0\.1|localhost):541[01]/, "README 工具依赖既有开发服务"],
  [/labels\.setStyle|edit\.labels\.setStyle/, "README 工具写入地图级标签样式覆盖"]
]) assert.doesNotMatch(toolSource, pattern, message);
assert.match(toolSource, /serverInstance\.listen\(0, host/, "README 工具没有为静态服务使用动态端口");

const assets = ["showcase-relief-overview.png", "showcase-atlas-overview.png"];
for (const filename of assets) {
  const relative = `./docs/assets/readme/${filename}`;
  for (const readme of readmes) assert.ok(readme.source.includes(relative), `${readme.path} 缺少 ${relative}`);
  const path = join(rootDir, "docs", "assets", "readme", filename);
  assert.ok(existsSync(path) && statSync(path).size > 10000, `${filename} 不存在或内容过小`);
  assert.deepEqual(inspectPng(path), {width: 1440, height: 960}, `${filename} 尺寸错误`);
}
assert.match(readmes[0].source, /\| 自然地貌 \| 国家视角 \|/, "中文 README 没有区分自然地貌与国家视角");
assert.match(readmes[0].source, /无政治标签的山海自然地貌/, "中文 relief alt 没有说明无政治标签");
assert.match(readmes[0].source, /浅色国家视角下的国界、国名与城镇/, "中文国家视角 alt 不准确");
assert.match(readmes[1].source, /\| Natural relief \| State view \|/, "英文 README 没有区分自然地貌与国家视角");
assert.match(readmes[1].source, /Natural terrain without political labels/, "英文 relief alt 没有说明无政治标签");
assert.match(readmes[1].source, /State view with borders, names, and settlements/, "英文国家视角 alt 不准确");

console.log(JSON.stringify({
  ok: true,
  defaultVisible: Object.entries(DEFAULT_LAYER_VISIBILITY).filter(([, visible]) => visible).map(([layer]) => layer),
  defaultHidden: Object.entries(DEFAULT_LAYER_VISIBILITY).filter(([, visible]) => !visible).map(([layer]) => layer),
  maxCityLabels: {fresh: DEFAULT_MAX_CITY_LABELS, showcase: 128},
  assets
}, null, 2));

function read(path) {
  return readFileSync(join(rootDir, path), "utf8");
}

function pickStyle(type) {
  const style = LABEL_STYLE_DEFAULTS[type];
  return {fontSize: style.fontSize, fontWeight: style.fontWeight, letterSpacing: style.letterSpacing, opacity: style.opacity};
}

function inspectPng(path) {
  const bytes = readFileSync(path);
  assert.equal(bytes.toString("hex", 0, 8), "89504e470d0a1a0a", `${path} 不是 PNG`);
  return {width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
}
