#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {colorForHeight} from "../app/webgl-generator/src/renderer/color-modes.js";
import {
  createUserVisualThemeDocument,
  exportVisualThemeDocument,
  listUserVisualThemeDocuments,
  normalizeVisualThemeDocument,
  replaceUserVisualThemes,
  resolveVisualTheme,
  updateUserVisualThemeDocument,
  upsertUserVisualTheme
} from "../app/webgl-generator/src/renderer/themes.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createMapDocument, parseMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {captureVisualThemeState, createSetUserVisualThemesCommand} from "../app/webgl-generator/src/runtime/visual-theme-edit-commands.js";
import {loadUserVisualThemes, persistUserVisualThemes} from "../app/webgl-generator/src/runtime/visual-theme-storage.js";

replaceUserVisualThemes([]);
const beforeInvalid = JSON.stringify(listUserVisualThemeDocuments());
assert.throws(() => normalizeVisualThemeDocument("{bad"), /有效 JSON/);
assert.throws(() => normalizeVisualThemeDocument({type: "webgl-generator-visual-theme", version: 1, id: "user-bad", label: "坏主题", base: "default", colors: {}, texture: "paper"}), /未知主题字段/);

const seedDocument = createUserVisualThemeDocument({label: "回归主题", baseThemeId: "default"});
assert.throws(() => normalizeVisualThemeDocument({...seedDocument, colors: {...seedDocument.colors, glow: "#ffffff"}}), /未知主题颜色 token/);
assert.throws(() => normalizeVisualThemeDocument({...seedDocument, colors: {...seedDocument.colors, land: "rgb(999,0,0)"}}), /#rrggbb/);
assert.equal(JSON.stringify(listUserVisualThemeDocuments()), beforeInvalid, "非法主题不得修改 registry");

upsertUserVisualTheme(seedDocument);
const createdTheme = resolveVisualTheme(seedDocument.id);
assert.deepEqual(colorForHeight(40, {ocean: [0, 0, 0, 1]}, {visualTheme: createdTheme}), createdTheme.land.fill, "陆地编辑 token 没有进入 cell 颜色");
assert.deepEqual(createdTheme.water.fill.slice(0, 3), createdTheme.canvas.background.slice(0, 3), "水域与画布海洋背景没有共用颜色");
assert.deepEqual(createdTheme.lines.routePrimary.slice(0, 3), createdTheme.lines.routeSecondary.slice(0, 3), "道路颜色没有覆盖全部路线等级");
assert.deepEqual(createdTheme.labels.city.slice(0, 3), createdTheme.legend.text.slice(0, 3), "主要标签与图例没有共用颜色 token");
assert.deepEqual(createdTheme.scaleBar.foreground.slice(0, 3), createdTheme.scaleBar.text.slice(0, 3), "比例尺前景与文字没有共用颜色 token");

const map = generatePlaceholderMap({seed: "visual-theme-regression", cellsTarget: 3000, heightmapTemplate: "continents"});
map.visualTheme = {version: 2, preset: "default", overrides: {}, userThemes: []};
const history = new EditHistory();
replaceUserVisualThemes([]);
const beforeCreate = captureVisualThemeState(map, "default");
const afterCreate = {preset: seedDocument.id, userThemes: [seedDocument]};
history.execute(createSetUserVisualThemesCommand(beforeCreate, afterCreate, {label: "创建回归主题"}), {map});
assert.equal(map.visualTheme.preset, seedDocument.id);
assert.equal(map.visualTheme.userThemes.length, 1);

const updatedDocument = updateUserVisualThemeDocument(seedDocument.id, {
  land: "#123456",
  water: "#234567",
  stateBorder: "#345678",
  provinceBorder: "#456789",
  roads: "#56789a",
  primaryLabel: "#6789ab",
  scaleBarForeground: "#789abc",
  scaleBarBackground: "#102030"
});
const beforeUpdate = captureVisualThemeState(map, seedDocument.id);
const afterUpdate = {preset: seedDocument.id, userThemes: [updatedDocument]};
history.execute(createSetUserVisualThemesCommand(beforeUpdate, afterUpdate, {label: "编辑回归主题"}), {map});
assert.equal(resolveVisualTheme(seedDocument.id).land.fill[0], 0x12 / 255);
history.undo({map});
assert.equal(exportVisualThemeDocument(seedDocument.id).colors.land, seedDocument.colors.land, "撤销没有恢复用户主题颜色");
history.redo({map});
assert.equal(exportVisualThemeDocument(seedDocument.id).colors.land, "#123456", "重做没有恢复用户主题颜色");

const roundTrip = parseMapDocument(stringifyMapDocument(createMapDocument(map, map.options)));
assert.equal(roundTrip.map.visualTheme.preset, seedDocument.id);
assert.equal(roundTrip.map.visualTheme.userThemes[0].colors.land, "#123456");

const oldFixture = JSON.parse(await readFile(new URL("./fixtures/webgl-map-v1-minimal.json", import.meta.url), "utf8"));
const migratedOld = parseMapDocument(JSON.stringify(oldFixture));
assert.deepEqual(migratedOld.map.visualTheme.userThemes, [], "旧地图迁移没有补空用户主题列表");
const oldV2 = createMapDocument(map, map.options);
delete oldV2.map.visualTheme.userThemes;
const parsedOldV2 = parseMapDocument(stringifyMapDocument(oldV2));
assert.equal(parsedOldV2.map.visualTheme.userThemes, undefined, "旧 v2 地图不应因缺少新字段而拒绝");
assert.deepEqual(createMapDocument(parsedOldV2.map, parsedOldV2.options).map.visualTheme.userThemes, [], "旧 v2 地图再导出没有补用户主题列表");

const storageValues = new Map();
const storage = {
  getItem: key => storageValues.get(key) ?? null,
  setItem: (key, value) => storageValues.set(key, value)
};
persistUserVisualThemes(storage);
replaceUserVisualThemes([]);
loadUserVisualThemes(storage);
assert.equal(exportVisualThemeDocument(seedDocument.id).colors.land, "#123456", "本地用户主题持久化没有恢复颜色");

const rendererSource = await readFile(new URL("../app/webgl-generator/src/renderer/placeholder-renderer.js", import.meta.url), "utf8");
const mapIoSource = await readFile(new URL("../app/webgl-generator/src/runtime/map-file-io.js", import.meta.url), "utf8");
const controlPanelSource = await readFile(new URL("../app/webgl-generator/src/ui/vue/components/ControlPanel.vue", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../app/webgl-generator/src/styles.css", import.meta.url), "utf8");
assert.match(rendererSource, /setThemeCssColor\(stage, "--theme-legend-text", legend\.text\)/, "图例 CSS token 链路缺失");
assert.match(rendererSource, /setThemeCssColor\(stage, "--theme-scale-line", scaleBar\.foreground\)/, "比例尺 CSS token 链路缺失");
assert.match(mapIoSource, /context\.filter = filter;[\s\S]*context\.drawImage\(scratch, 0, 0\)/, "PNG 没有复用主题画布滤镜");
assert.match(controlPanelSource, /<UiColorActionPanel[\s\S]*@apply="applyVisualThemeColor"/, "主题编辑没有复用共享颜色二级面板");
assert.equal([...controlPanelSource.matchAll(/class="[^"]*visual-theme-action-button[^"]*"/g)].length, 3, "主题动作组没有统一按钮类");
assert.match(controlPanelSource, /<label class="[^"]*visual-theme-action-button[^"]*">\s*<span>导入主题<\/span>\s*<input id="import-visual-theme-file"/s, "主题导入没有保留文件输入行为");
const actionStyle = stylesSource.match(/\.visual-theme-action-row > \.visual-theme-action-button\s*\{([^}]+)\}/)?.[1] || "";
for (const contract of ["height: 36px", "min-height: 36px", "padding: 8px 15px", "font-size: 14px", "font-weight: 700", "line-height: 1"]) {
  assert(actionStyle.includes(contract), `主题动作组缺少统一样式契约：${contract}`);
}
assert.match(stylesSource, /\.visual-theme-action-button\.el-button > span,[\s\S]*\.visual-theme-action-button\.file-import-action > span\s*\{[\s\S]*font:\s*inherit;[\s\S]*line-height:\s*inherit;/, "主题动作文字内盒没有继承统一规格");

console.log(JSON.stringify({
  ok: true,
  themeId: seedDocument.id,
  colors: exportVisualThemeDocument(seedDocument.id).colors,
  history: history.getStats(),
  roundTripThemes: roundTrip.map.visualTheme.userThemes.length,
  invalidRegistryUnchanged: true,
  actionTypographyUnified: true
}, null, 2));
