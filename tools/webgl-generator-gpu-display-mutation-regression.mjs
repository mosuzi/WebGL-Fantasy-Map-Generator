import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PlaceholderMapRenderer, buildPointLayer, buildPointVertices} from "../app/webgl-generator/src/renderer/placeholder-renderer.js";
import {resolveVisualTheme} from "../app/webgl-generator/src/renderer/themes.js";

const prototype = PlaceholderMapRenderer.prototype;
const layerRenderer = {
  layerVisibility: {routes: true, rivers: true, labels: true, cities: true, population: true, markers: true, resources: true, military: true, coastline: true},
  pointDrawRanges: [], pointBufferVertexCount: 0,
  dynamicBuffersDirty: {routes: false, rivers: false}
};
for (const [entries, expected] of [
  [[["labels", false]], true], [[ ["routes", false], ["rivers", false] ], true],
  [[["cities", false]], true], [[["population", false], ["resources", false], ["military", false]], true], [[["coastline", false]], false]
]) assert.equal(prototype.canApplyGpuResidentLayerVisibility.call(layerRenderer, entries), expected);
layerRenderer.dynamicBuffersDirty.routes = true;
assert.equal(prototype.canApplyGpuResidentLayerVisibility.call(layerRenderer, [["routes", true]]), false);
assert.equal(prototype.canApplyGpuResidentLayerVisibility.call(layerRenderer, [["routes", false]]), true);

const pointMap = {metadata: {graphWidth: 100, graphHeight: 100}, settlements: {metadata: {maxPopulation: 20},
  populationPoints: [{point: [10, 10], population: 10}], cities: [{x: 20, y: 20, capital: true}]},
markers: {markers: [{x: 30, y: 30, category: "resource"}, {x: 40, y: 40, category: "natural"}, {x: 50, y: 50, category: "resource"}]},
politics: {states: [null, {i: 1, military: [{x: 60, y: 60}]}]}};
const pointLayer = buildPointLayer(pointMap);
assert.deepEqual(pointLayer.drawRanges.map(({layer, first, count}) => [layer, first, count]), [
  ["population", 0, 1], ["cities", 1, 1], ["resources", 2, 1], ["markers", 3, 1], ["resources", 4, 1], ["military", 5, 1]
]);
assert.deepEqual([...buildPointVertices(pointMap, {cities: false, resources: false})], [
  ...pointLayer.vertices.subarray(0, 6), ...pointLayer.vertices.subarray(18, 24), ...pointLayer.vertices.subarray(30, 36)
]);
let pointDraws = 0, pointRefreshes = 0, cityOverlayRefreshes = 0, pointDrawOptions = null;
const pointBuffer = {}, pointRenderer = {map: pointMap, pointBuffer, pointBufferVertexCount: 6, pointVertexCount: 6,
  pointDrawRanges: pointLayer.drawRanges, layerVisibility: {...layerRenderer.layerVisibility}, dynamicBuffersDirty: {...layerRenderer.dynamicBuffersDirty},
  deferWorkerRenderMutation: () => false, refreshPointLayers: () => pointRefreshes++, refreshCityLayerOverlay: () => cityOverlayRefreshes++, draw: options => { pointDraws++; pointDrawOptions = options; }};
assert.deepEqual(prototype.setLayersVisible.call(pointRenderer, [["cities", false], ["resources", false]]), ["cities", "resources"]);
assert.deepEqual([pointRenderer.pointBuffer === pointBuffer, pointRenderer.pointVertexCount, pointDraws, pointRefreshes], [true, 3, 1, 0]);
assert.deepEqual(prototype.setLayersVisible.call(pointRenderer, [["cities", true]]), ["cities"]);
assert.deepEqual([cityOverlayRefreshes, pointDrawOptions], [1, {updateOverlay: false}]);

let oceanDraws = 0;
const oceanRenderer = {viewOptions: {showOceanHeight: false, smoothCellBorders: false}, map: {}, deferWorkerRenderMutation: () => false,
  canApplyGpuResidentOceanHeight: () => true, refreshCellSurface: () => assert.fail("不应刷新 surface"),
  refreshLineLayers: () => assert.fail("不应刷新 line"), draw: () => oceanDraws++};
prototype.setViewOptions.call(oceanRenderer, {showOceanHeight: true});
assert.deepEqual([oceanRenderer.viewOptions.showOceanHeight, oceanDraws], [true, 1]);

let smoothRefreshes = 0;
const smoothRenderer = {viewOptions: {smoothCellBorders: false}, map: {}, deferWorkerRenderMutation: () => false,
  canApplyGpuResidentSmoothCellBorders: () => true, refreshGpuResidentSmoothCellBorders: () => smoothRefreshes++,
  refreshCellSurface: () => assert.fail("不应刷新完整 surface"), refreshLineLayers: () => assert.fail("不应刷新完整 line")};
prototype.setViewOptions.call(smoothRenderer, {smoothCellBorders: true});
assert.deepEqual([smoothRenderer.viewOptions.smoothCellBorders, smoothRefreshes], [true, 1]);

let edgeDraws = 0, edgeDrawOptions = null;
const edgeRenderer = {viewOptions: {mapEdgeFade: false}, map: {}, deferWorkerRenderMutation: () => false,
  canApplyGpuResidentOceanHeight: () => false, canApplyGpuResidentSmoothCellBorders: () => false,
  refreshCellSurface: () => assert.fail("地图边缘渐隐不得刷新 surface"), refreshLineLayers: () => assert.fail("地图边缘渐隐不得重建 line"),
  draw: options => { edgeDraws++; edgeDrawOptions = options; }};
prototype.setViewOptions.call(edgeRenderer, {mapEdgeFade: true});
assert.deepEqual([edgeRenderer.viewOptions.mapEdgeFade, edgeDraws], [true, 1]);
assert.deepEqual(edgeDrawOptions, {updateDynamicBuffers: false, updateOverlay: false, drawDirtyDynamicBuffers: false}, "地图边缘渐隐不得顺带刷新动态路线、河流或 overlay");

let deferredEdgeDraws = 0, deferredEdgeDrawOptions = null, deferredEdgeSurfaceRefreshes = 0, deferredEdgeLineRefreshes = 0;
const deferredEdgeRenderer = {
  viewOptions: {mapEdgeFade: false}, map: {}, colorMode: "states", visualTheme: resolveVisualTheme("default"),
  labelOptions: {}, unitPreferences: {}, layerVisibility: {routes: false, tradeFlows: false}, oceanCurrentHighlights: new Set(),
  politicalMeshDebugMode: "off", dynamicBuffersDirty: {tradeFlows: false, selection: false, routes: false},
  workerRenderInstallSuspended: 1, workerRenderInstallApplyingDeferred: false, workerRenderInstallPendingDraw: true,
  workerRenderInstallViewportChanged: false, workerRenderInstallEnsureGridDiagnostics: false,
  workerRenderInstallDeferredMutations: new Map([["view-options", {key: "view-options", value: {mapEdgeFade: true}, sequence: 1}]]),
  applyDeferredWorkerRenderMutations: prototype.applyDeferredWorkerRenderMutations,
  applyWorkerRenderMutationBatch: prototype.applyWorkerRenderMutationBatch,
  refreshCellSurface: () => deferredEdgeSurfaceRefreshes++, refreshLineLayers: () => deferredEdgeLineRefreshes++,
  draw: options => { deferredEdgeDraws++; deferredEdgeDrawOptions = options; }, onViewChange() {},
  clearTradeFlowBuffer() {}, updateTradeFlowBuffer() {}, updateSelectionBuffer() {}, scheduleRouteBufferRefresh() {}, cancelViewportCommitForWorkerInstall() {}
};
assert.equal(prototype.resumeWorkerRenderInstall.call(deferredEdgeRenderer, {draw: true}), true);
assert.deepEqual([
  deferredEdgeRenderer.viewOptions.mapEdgeFade, deferredEdgeSurfaceRefreshes, deferredEdgeLineRefreshes, deferredEdgeDraws
], [true, 0, 0, 1], "延迟合并的地图边缘渐隐也不得重建 surface 或 line");
assert.deepEqual(deferredEdgeDrawOptions, {updateDynamicBuffers: false, updateOverlay: false, drawDirtyDynamicBuffers: false}, "延迟边缘渐隐不得顺带刷新动态层或 overlay");

const calls = [], themeRenderer = {map: {layers: {background: [0, 0, 0, 1]}}, stage: {style: {backgroundColor: "", setProperty() {}, removeProperty() {}}},
  visualTheme: {id: "default"}, viewOptions: {smoothCellBorders: false}, layerVisibility: {routes: false}, dynamicBuffersDirty: {routes: false},
  canApplyGpuResidentVisualTheme: () => true, refreshVisualThemeLineColors: () => calls.push(["lines"]),
  refreshLabelThemeStyles: async () => calls.push(["labels"]), draw: options => calls.push(["draw", options])};
await prototype.setVisualThemeGpuResident.call(themeRenderer, "ancient", {yieldToMain: async () => {}});
assert.deepEqual([themeRenderer.visualTheme.id, themeRenderer.dynamicBuffersDirty.routes, calls.map(([name]) => name)], ["ancient", true, ["lines", "labels", "draw"]]);
assert.deepEqual(calls[2][1], {updateDynamicBuffers: false});

const defaultTheme = resolveVisualTheme("default"), ancientTheme = resolveVisualTheme("ancient"), vertex = color => [0, 0, ...color];
const recolorRenderer = {lineVertices: new Float32Array([...vertex(defaultTheme.lines.stateBorder), ...vertex(defaultTheme.lines.provinceBorder), ...vertex(defaultTheme.canvas.background)]),
  shoreLineVertices: new Float32Array([...vertex(defaultTheme.lines.coastline), ...vertex(defaultTheme.lines.lakeShore)]), lineVertexCount: 3, shoreLineVertexCount: 2,
  gl: {ARRAY_BUFFER: 1, bindBuffer() {}, bufferSubData() {}}, lineBuffer: {}, shoreLineBuffer: {}, recordBufferUpload(name, task) { task(); return {ms: 0}; }, refreshLineLayers: () => assert.fail("不应重建线几何")};
assert.equal(prototype.refreshVisualThemeLineColors.call(recolorRenderer, defaultTheme, ancientTheme).reused, true);
assert.deepEqual([...recolorRenderer.lineVertices.slice(2, 6)], ancientTheme.lines.stateBorder.map(Math.fround));
assert.deepEqual([...recolorRenderer.shoreLineVertices.slice(2, 6)], ancientTheme.lines.coastline.map(Math.fround));

const appSource = readFileSync(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8");
for (const pattern of [/setTheme:[\s\S]+canApplyGpuResidentVisualTheme/, /setShowOceanHeight:[\s\S]+canApplyGpuResidentOceanHeight/,
  /setSmoothCellBorders:[\s\S]+canApplyGpuResidentSmoothCellBorders/, /setVisible:[\s\S]+canApplyGpuResidentLayerVisibility/,
  /const result = await apply\(\)/, /await rollback\?\.\(\)/]) assert.match(appSource, pattern);
const rendererSource = readFileSync(new URL("../app/webgl-generator/src/renderer/placeholder-renderer.js", import.meta.url), "utf8");
for (const [mode, code] of Object.entries({
  height: 1, biomes: 2, population: 3, states: 4, provinces: 5, temperature: 6,
  precipitation: 7, cultures: 8, religions: 9, regions: 10, governments: 11, diplomacy: 12
})) assert.match(rendererSource, new RegExp(`${mode}: ${code}`), `${mode} 未登记 GPU 常驻模式`);
for (const code of [6, 7, 8, 9, 10, 11, 12]) assert.match(rendererSource, new RegExp(`u_cellColorMode == ${code}`), `shader 缺少 GPU 模式 ${code}`);
assert.match(rendererSource, /mode === "diplomacy"\) refreshCellAttributePalette/u, "首次外交切换必须按当前主体刷新小 palette");
assert.match(rendererSource, /canPresentGpuResidentColorMode\("diplomacy"\)[\s\S]*?refreshCellAttributePalette[\s\S]*?this\.draw\(\)/u, "外交主体变化不得重建完整 surface");
console.log(JSON.stringify({ok: true, directLayers: 3, gpuColorModes: 12, oceanDraws, smoothRefreshes, edgeDraws, themeCalls: calls.length}));
