#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {
  PNG_OVERLAY_KEYS,
  clearOutsideMapBounds,
  createCanvasPngBlob,
  normalizePngExportOptions,
  pngCameraForWorldRect,
  resolvePngCropRect
} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {PNG_FIXED_TEXT_ELEMENT_IDS, PNG_MILITARY_TEXT_SELECTOR, PNG_SEMANTIC_LABEL_SELECTORS} from "../app/webgl-generator/src/runtime/canvas-text-contract.js";

const defaultOverlays = {labels: true, cityIcons: true, markers: true, military: true, measurements: false, legend: true, scaleBar: true};
assert.deepEqual(normalizePngExportOptions({}), {
  pixelScale: 1,
  includeMapOverlays: true,
  transparentBackground: false,
  crop: {mode: "viewport", rect: null},
  overlays: defaultOverlays
});
assert.deepEqual(normalizePngExportOptions({pixelScale: 9, includeMapOverlays: false, transparentBackground: true}), {
  pixelScale: 4,
  includeMapOverlays: false,
  transparentBackground: true,
  crop: {mode: "viewport", rect: null},
  overlays: Object.fromEntries(PNG_OVERLAY_KEYS.map(key => [key, false]))
});
assert.deepEqual(normalizePngExportOptions({overlays: {military: false, measurements: true, legend: false}}).overlays, {...defaultOverlays, military: false, measurements: true, legend: false});

assert.deepEqual(resolvePngCropRect({mode: "viewport"}, {width: 800, height: 600}), {
  mode: "viewport",
  rect: {x: 0, y: 0, width: 800, height: 600}
});
assert.deepEqual(resolvePngCropRect({mode: "map"}, {width: 800, height: 600, mapWidth: 1440, mapHeight: 960}), {
  mode: "map",
  rect: {x: 0, y: 0, width: 1440, height: 960}
});
assert.deepEqual(resolvePngCropRect({mode: "pixel", rect: {x: 20, y: 10, width: 40, height: 30}}, {width: 100, height: 80}), {
  mode: "pixel",
  rect: {x: 20, y: 10, width: 40, height: 30}
});
assert.deepEqual(pngCameraForWorldRect({x: 360, y: 240, width: 720, height: 480}, 1440, 960), {scale: 2, offsetX: 0, offsetY: 0});
assert.throws(() => resolvePngCropRect({mode: "pixel", rect: {x: 0, y: 0, width: 0, height: 20}}, {width: 100, height: 80}), /不能为空/);
assert.throws(() => resolvePngCropRect({mode: "pixel", rect: {x: 80, y: 10, width: 30, height: 20}}, {width: 100, height: 80}), /超出有效范围/);
assert.throws(() => resolvePngCropRect({mode: "world", rect: {x: -1, y: 0, width: 10, height: 10}}, {width: 100, height: 80, mapWidth: 1440, mapHeight: 960}), /超出有效范围/);

const imageDraws = [];
const outputContext = {
  canvas: null,
  drawImage: (...args) => imageDraws.push(args),
  save() {},
  restore() {},
  clearRect() {}
};
const outputCanvas = {
  width: 1,
  height: 1,
  getContext: type => type === "2d" ? outputContext : null,
  toBlob: callback => callback(new Blob([new Uint8Array([137, 80, 78, 71])], {type: "image/png"}))
};
outputContext.canvas = outputCanvas;
const sourceCanvas = {
  width: 200,
  height: 160,
  toBlob() {},
  getContext: () => null,
  getBoundingClientRect: () => ({left: 5, top: 7, width: 100, height: 80}),
  ownerDocument: null
};
const fakeDocument = {
  defaultView: {getComputedStyle: () => ({filter: "none"})},
  createElement: tag => {
    assert.equal(tag, "canvas");
    return outputCanvas;
  }
};
sourceCanvas.ownerDocument = fakeDocument;
const croppedImage = await createCanvasPngBlob(fakeDocument, sourceCanvas, {
  includeMapOverlays: false,
  pixelScale: 2,
  crop: {mode: "pixel", rect: {x: 20, y: 10, width: 40, height: 30}}
});
assert.equal(croppedImage.width, 160);
assert.equal(croppedImage.height, 120);
assert.deepEqual(croppedImage.crop.pixelRect, {x: 40, y: 20, width: 80, height: 60});
assert.deepEqual(imageDraws[0], [sourceCanvas, 40, 20, 80, 60, 0, 0, 160, 120]);

const cleared = [];
const context = {
  canvas: {width: 400, height: 300},
  clearRect: (...args) => cleared.push(args)
};
const renderer = {
  map: {metadata: {graphWidth: 100, graphHeight: 80}},
  worldToScreen: (x, y) => x === 0 && y === 0 ? {x: 25, y: 20} : {x: 175, y: 130}
};
clearOutsideMapBounds(context, renderer, {width: 200, height: 150}, {x: 2, y: 2});
assert.deepEqual(cleared, [
  [0, 0, 400, 40],
  [0, 260, 400, 40],
  [0, 40, 50, 220],
  [350, 40, 50, 220]
]);

const [fileIoSource, appSource, apiSource, controlSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/runtime/map-file-io.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/console-api.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/ControlPanel.vue", import.meta.url), "utf8")
]);
assert.match(fileIoSource, /if \(options\.includeMapOverlays\) \{[\s\S]*?drawMapOverlayElements[\s\S]*?drawFixedMapUiElements/);
assert.deepEqual(PNG_SEMANTIC_LABEL_SELECTORS, [".state-label.visible", ".province-label.visible", ".city-label.visible", ".custom-label.visible", ".zone-label.visible"], "PNG 标签生产契约没有完整覆盖六类语义标签");
assert.match(fileIoSource, /overlays\?\.labels[\s\S]*selectors\.push\(\.\.\.PNG_SEMANTIC_LABEL_SELECTORS\)/, "PNG 标签通道没有消费生产契约");
assert.equal(PNG_MILITARY_TEXT_SELECTOR, ".military-map-icon.visible", "军事兵力注记生产契约错误");
assert.match(fileIoSource, /overlays\?\.military[\s\S]*selectors\.push\(PNG_MILITARY_TEXT_SELECTOR\)/, "军事兵力注记没有保留独立 PNG 通道");
assert.deepEqual(PNG_FIXED_TEXT_ELEMENT_IDS, {legend: "map-legend", scaleBar: "map-scale-bar"}, "图例或比例尺生产契约错误");
assert.match(fileIoSource, /ids\.push\(PNG_FIXED_TEXT_ELEMENT_IDS\.legend\)[\s\S]*ids\.push\(PNG_FIXED_TEXT_ELEMENT_IDS\.scaleBar\)/, "图例或比例尺没有保留独立 PNG 通道");
assert.doesNotMatch(fileIoSource, /selectors\.push\([^\n]*(?:map-badge|hover-overlay|grid-cell-diagnostic-label|measurement-readout)/, "HUD 或诊断文字误入 PNG overlay selector");
assert.ok(fileIoSource.indexOf("drawFixedMapUiElements(documentRef, context, canvasRect, scale, options)") < fileIoSource.indexOf("if (options.transparentBackground) clearOutsideMapBounds"), "透明清除必须在 overlay 合成后执行");
assert.match(appSource, /export-png-overlays/);
assert.match(appSource, /export-png-transparent/);
assert.match(apiSource, /options\.transparentBackground \?\?/);
assert.match(apiSource, /options\.crop \?\? readPngExportCrop/);
assert.match(apiSource, /options\.overlays \?\? readPngExportOverlays/);
assert.match(controlSource, /input-id="export-png-overlays"[^>]*:checked="true"/);
assert.match(controlSource, /input-id="export-png-transparent"/);
assert.match(controlSource, /id="export-png-crop-mode"/);
for (const id of ["labels", "city-icons", "markers", "military", "measurements", "legend", "scale-bar"]) {
  assert.match(controlSource, new RegExp(`input-id="export-png-overlay-${id}"`));
}

console.log(JSON.stringify({
  ok: true,
  defaultOptions: normalizePngExportOptions({}),
  explicitOptions: normalizePngExportOptions({pixelScale: 4, includeMapOverlays: false, transparentBackground: true}),
  cropModes: ["viewport", "map", "pixel", "world"],
  overlayKeys: PNG_OVERLAY_KEYS,
  croppedImage: {width: croppedImage.width, height: croppedImage.height, sourceRect: croppedImage.crop.pixelRect},
  transparentClearRects: cleared.length,
  uiAndApiWired: true
}, null, 2));
