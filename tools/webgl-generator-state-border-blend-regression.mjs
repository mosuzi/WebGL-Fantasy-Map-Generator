#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {buildStateVisualPaths, emptyPoliticalVisualPaths} from "../app/webgl-generator/src/renderer/political-layer.js";
import {buildLineVertices} from "../app/webgl-generator/src/renderer/placeholder-renderer.js";
import {createPreparedDisplayIntent} from "../app/webgl-generator/src/renderer/prepared-display-intent.js";
import {DEFAULT_STATE_BORDER_BLEND, normalizeStateBorderBlendStyle} from "../app/webgl-generator/src/renderer/state-border-blend-style.js";
import {createUserVisualThemeDocument, resolveVisualTheme} from "../app/webgl-generator/src/renderer/themes.js";

assert.deepEqual(normalizeStateBorderBlendStyle(), DEFAULT_STATE_BORDER_BLEND);
assert.deepEqual(normalizeStateBorderBlendStyle({enabled: true, widthWorld: 40, strength: -1}), {
  enabled: true,
  widthWorld: 24,
  strength: 0
});
assert.deepEqual(normalizeStateBorderBlendStyle({enabled: "true", widthWorld: "bad", strength: "bad"}), DEFAULT_STATE_BORDER_BLEND);

const themeDocument = createUserVisualThemeDocument({label: "独立配置边界", baseThemeId: "default"});
const resolvedTheme = resolveVisualTheme("default");
assert.equal(Object.hasOwn(themeDocument, "stateBorderBlend"), false, "国界晕染不得写入用户主题文档");
assert.equal(Object.hasOwn(resolvedTheme.effects || {}, "stateBorderBlend"), false, "国界晕染不得由主题材质拥有");

const map = generatePlaceholderMap({seed: "state-border-blend-regression", cellsTarget: 3000, heightmapTemplate: "continents"});
const statePaths = buildStateVisualPaths(map);
assert.ok(statePaths.boundaries.length > 0, "回归地图没有可验证的国家边界");
const hiddenLineVisibility = {
  zones: false,
  zoneEvents: false,
  zoneNatural: false,
  zoneWilderness: false,
  oceanCurrents: false,
  provinceBorders: false,
  stateBorders: false,
  warFronts: false
};
const emptyPoliticalPaths = emptyPoliticalVisualPaths();
const baseViewOptions = {visualTheme: resolvedTheme, stateBorderBlend: DEFAULT_STATE_BORDER_BLEND};
const disabled = buildLineVertices(map, hiddenLineVisibility, "states", null, statePaths, emptyPoliticalPaths, null, baseViewOptions);
const enabledStyle = {enabled: true, widthWorld: 12, strength: 0.5};
const enabled = buildLineVertices(map, hiddenLineVisibility, "states", null, statePaths, emptyPoliticalPaths, null, {
  ...baseViewOptions,
  stateBorderBlend: enabledStyle
});

assert.equal(disabled.vertices.length, disabled.mapEdgeFadeVertexCount * 6, "关闭国界晕染后仍生成了政治颜色羽化层");
assert.ok(enabled.vertices.length > disabled.vertices.length, "开启国界晕染后没有生成独立羽化层");
const alphaValues = [];
for (let offset = enabled.mapEdgeFadeVertexCount * 6 + 5; offset < enabled.vertices.length; offset += 6) alphaValues.push(enabled.vertices[offset]);
const uniqueAlphas = [...new Set(alphaValues.map(value => Number(value.toFixed(6))))].sort((a, b) => a - b);
assert.equal(uniqueAlphas[0], 0, "羽化外沿没有衰减到完全透明");
assert.ok(uniqueAlphas.length >= 5, "国界颜色仍是突兀的等透明色带，而不是多级羽化");
assert.ok(uniqueAlphas.at(-1) <= enabledStyle.strength * 0.42 + 1e-6, "羽化中心强度超过柔和曲线约束");
assert.ok(uniqueAlphas.at(-1) < enabledStyle.strength, "羽化层错误使用了整条满强度色带");

const narrow = buildLineVertices(map, hiddenLineVisibility, "states", null, statePaths, emptyPoliticalPaths, null, {
  ...baseViewOptions,
  stateBorderBlend: {...enabledStyle, widthWorld: 4}
});
const wide = buildLineVertices(map, hiddenLineVisibility, "states", null, statePaths, emptyPoliticalPaths, null, {
  ...baseViewOptions,
  stateBorderBlend: {...enabledStyle, widthWorld: 20}
});
const blendStart = narrow.mapEdgeFadeVertexCount * 6;
assert.notDeepEqual(
  Array.from(narrow.vertices.slice(blendStart, blendStart + 72)),
  Array.from(wide.vertices.slice(blendStart, blendStart + 72)),
  "晕染宽度没有改变羽化几何"
);

const provinceMode = buildLineVertices(map, hiddenLineVisibility, "provinces", null, statePaths, emptyPoliticalPaths, null, {
  ...baseViewOptions,
  stateBorderBlend: enabledStyle
});
assert.equal(provinceMode.vertices.length, provinceMode.mapEdgeFadeVertexCount * 6, "国界晕染错误进入了省份视图");

const binding = {
  mapIdentity: "state-border-blend-regression",
  sourceRevision: 0,
  topologyRevision: 0,
  renderGeneration: 1,
  renderPreparationId: "state-border-blend:initial"
};
const disabledIntent = createPreparedDisplayIntent({binding, colorMode: "states", viewOptions: baseViewOptions}, binding);
const enabledIntent = createPreparedDisplayIntent({
  binding,
  colorMode: "states",
  viewOptions: {...baseViewOptions, stateBorderBlend: enabledStyle}
}, binding);
assert.notEqual(disabledIntent.fingerprint, enabledIntent.fingerprint, "首屏显示意图没有锁定独立国界晕染配置");

const controlPanelSource = await readFile(new URL("../app/webgl-generator/src/ui/vue/components/ControlPanel.vue", import.meta.url), "utf8");
const configStoreSource = await readFile(new URL("../app/webgl-generator/src/ui/vue/stores/global-config-store.js", import.meta.url), "utf8");
const rendererSource = await readFile(new URL("../app/webgl-generator/src/renderer/placeholder-renderer.js", import.meta.url), "utf8");
assert.match(controlPanelSource, /id="state-border-blend-title">国界晕染<[\s\S]*>独立显示样式<[\s\S]*:checked="preferences\.stateBorderBlend\.enabled"/, "内置主题下没有直接提供独立国界晕染控件");
assert.doesNotMatch(controlPanelSource, /activeUserThemeDocument\.stateBorderBlend|复制为用户主题，再调整晕染参数/, "国界晕染仍被用户主题门禁阻断");
assert.match(configStoreSource, /stateBorderBlend:[\s\S]*normalizeStateBorderBlendStyle/, "独立显示偏好没有持久化与兼容归一化");
assert.match(rendererSource, /pushPoliticalColorFeather\(vertices, context, statePaths, stateBorderBlend\)/, "正式国家线层没有使用羽化绘制入口");
assert.match(rendererSource, /const surfaceKeys = changedKeys\.filter\(key => !\["mapEdgeFade", "stateBorderBlend"\]\.includes\(key\)\)/, "晕染调整错误触发整张政治 surface 重建");
assert.match(rendererSource, /if \(resolveStateBorderBlendStyle\(this\.colorMode, this\.viewOptions\.stateBorderBlend\)\) this\.refreshLineLayers\(\{draw: false\}\);/, "主题切换可能把国家色羽化顶点误当主题线色原位改写");

console.log(JSON.stringify({
  ok: true,
  boundaries: statePaths.boundaries.length,
  featherVertices: (enabled.vertices.length - enabled.mapEdgeFadeVertexCount * 6) / 6,
  alphaProfile: uniqueAlphas,
  independentPreference: true,
  provinceModeUnchanged: true,
  preparedIntentBound: true
}, null, 2));
