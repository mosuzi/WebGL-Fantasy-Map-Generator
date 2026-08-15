import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PlaceholderMapRenderer} from "../app/webgl-generator/src/renderer/placeholder-renderer.js";
import {resolveVisualTheme} from "../app/webgl-generator/src/renderer/themes.js";

const prototype = PlaceholderMapRenderer.prototype;
const layerRenderer = {
  layerVisibility: {routes: true, rivers: true, labels: true, cities: true, coastline: true},
  dynamicBuffersDirty: {routes: false, rivers: false}
};
for (const [entries, expected] of [
  [[["labels", false]], true], [[ ["routes", false], ["rivers", false] ], true],
  [[["cities", false]], false], [[["coastline", false]], false]
]) assert.equal(prototype.canApplyGpuResidentLayerVisibility.call(layerRenderer, entries), expected);
layerRenderer.dynamicBuffersDirty.routes = true;
assert.equal(prototype.canApplyGpuResidentLayerVisibility.call(layerRenderer, [["routes", true]]), false);
assert.equal(prototype.canApplyGpuResidentLayerVisibility.call(layerRenderer, [["routes", false]]), true);

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
console.log(JSON.stringify({ok: true, directLayers: 3, oceanDraws, smoothRefreshes, themeCalls: calls.length}));
