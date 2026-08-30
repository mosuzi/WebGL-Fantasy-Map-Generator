#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {buildStateVisualPaths, emptyPoliticalVisualPaths} from "../app/webgl-generator/src/renderer/political-layer.js";
import {buildLineVertices} from "../app/webgl-generator/src/renderer/placeholder-renderer.js";
import {createPreparedDisplayIntent} from "../app/webgl-generator/src/renderer/prepared-display-intent.js";
import {DEFAULT_STATE_BORDER_BLEND, normalizeStateBorderBlendStyle} from "../app/webgl-generator/src/renderer/state-border-blend-style.js";
import {projectRawBoundaryPoint, resolveStateBorderHazePixelProfile} from "../app/webgl-generator/src/renderer/state-border-haze-compositor.js";
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
assert.deepEqual(enabled.vertices, disabled.vertices, "正式晕染仍把偏移色带三角形写入线层");

const narrow = buildLineVertices(map, hiddenLineVisibility, "states", null, statePaths, emptyPoliticalPaths, null, {
  ...baseViewOptions,
  stateBorderBlend: {...enabledStyle, widthWorld: 4}
});
const wide = buildLineVertices(map, hiddenLineVisibility, "states", null, statePaths, emptyPoliticalPaths, null, {
  ...baseViewOptions,
  stateBorderBlend: {...enabledStyle, widthWorld: 20}
});
assert.deepEqual(narrow.vertices, wide.vertices, "晕染宽度仍在移动线层几何，而不是约束屏幕空间衰减");
const camera = {scale: 2.4, offsetX: 0.15, offsetY: -0.2};
const target = {width: 960, height: 640};
const narrowProfile = resolveStateBorderHazePixelProfile({widthWorld: 4, map, camera, ...target});
const wideProfile = resolveStateBorderHazePixelProfile({widthWorld: 24, map, camera, ...target});
assert.ok(wideProfile.effectiveHalfExtentPx > narrowProfile.effectiveHalfExtentPx * 5, "最大宽度没有按原始边界距离扩大屏幕衰减范围");
assert.ok(wideProfile.coreWidthPx > 0 && wideProfile.maskBlurPx > 0 && wideProfile.colorBlurPx > 0, "最大宽度没有形成连续的颜色与蒙版衰减");
const rawPoint = statePaths.boundaries.find(path => path.points?.length)?.points[0];
assert.ok(rawPoint, "回归地图缺少可投影的原始国界点");
const projected = projectRawBoundaryPoint(rawPoint, map, camera, target);
const expectedNdcX = ((rawPoint[0] / map.metadata.graphWidth) * 2 - 1) * camera.scale + camera.offsetX;
const expectedNdcY = (1 - (rawPoint[1] / map.metadata.graphHeight) * 2) * camera.scale + camera.offsetY;
assert.deepEqual(projected, [((expectedNdcX + 1) * 0.5) * target.width, ((1 - expectedNdcY) * 0.5) * target.height], "晕染蒙版没有锚定 renderer 使用的原始边界投影");

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
const compositorSource = await readFile(new URL("../app/webgl-generator/src/renderer/state-border-haze-compositor.js", import.meta.url), "utf8");
assert.match(controlPanelSource, /\{value: "borders", label: "国界效果"\}[\s\S]*\{value: "labels", label: "地图标签"\}/, "样式页没有区分国界效果与地图标签二级入口");
assert.match(controlPanelSource, /v-show="activeStyleSection === 'borders'"[\s\S]*id="state-border-blend-title">国界晕染<[\s\S]*>全局显示偏好 · 仅国家视图<[\s\S]*:checked="preferences\.stateBorderBlend\.enabled"/, "国界晕染没有归入独立的国家视图效果层级");
assert.match(controlPanelSource, /const activeStyleSection = ref\("labels"\)[\s\S]*function selectStyleSection\(value\)/, "样式类别切换没有保持本地选择且可能误触配置事件");
assert.doesNotMatch(controlPanelSource, /activeUserThemeDocument\.stateBorderBlend|复制为用户主题，再调整晕染参数/, "国界晕染仍被用户主题门禁阻断");
assert.match(configStoreSource, /stateBorderBlend:[\s\S]*normalizeStateBorderBlendStyle/, "独立显示偏好没有持久化与兼容归一化");
assert.doesNotMatch(rendererSource, /pushPoliticalColorFeather/, "正式国家线层仍在生成九轨连接三角网格");
assert.match(rendererSource, /stateBorderHazeCompositor\.render\(\{[\s\S]*paths: this\.stateVisualPaths,[\s\S]*style: resolveStateBorderBlendStyle/, "正式国家色面没有进入屏幕空间晕染合成器");
assert.match(compositorSource, /context\.beginPath\(\);[\s\S]*for \(const path of boundaries\)[\s\S]*context\.stroke\(\);/, "多条国界没有先合并成单一饱和蒙版，交汇处可能继续叠加强度");
assert.match(compositorSource, /globalCompositeOperation = "destination-in"/, "模糊后的国家色面没有受原始国界蒙版约束");
assert.match(compositorSource, /pipeline: "screen-raster-normalized"[\s\S]*anchor: "raw-state-boundary"[\s\S]*junction: "single-saturated-mask"/, "正式合成器没有声明实验室确认的边界锚定与交汇不叠加语义");
assert.match(rendererSource, /const surfaceKeys = changedKeys\.filter\(key => !\["mapEdgeFade", "stateBorderBlend"\]\.includes\(key\)\)/, "晕染调整错误触发整张政治 surface 重建");
assert.doesNotMatch(rendererSource, /stateBorderBlend[\s\S]{0,180}refreshLineLayers|refreshLineLayers[\s\S]{0,180}stateBorderBlend/, "晕染调整仍错误重建政治线层");

console.log(JSON.stringify({
  ok: true,
  boundaries: statePaths.boundaries.length,
  featherVertices: 0,
  pipeline: "screen-raster-normalized",
  narrowProfile,
  wideProfile,
  independentPreference: true,
  provinceModeUnchanged: true,
  preparedIntentBound: true
}, null, 2));
