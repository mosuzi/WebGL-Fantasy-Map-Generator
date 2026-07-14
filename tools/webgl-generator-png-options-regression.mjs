#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {clearOutsideMapBounds, normalizePngExportOptions} from "../app/webgl-generator/src/runtime/map-file-io.js";

assert.deepEqual(normalizePngExportOptions({}), {pixelScale: 1, includeMapOverlays: true, transparentBackground: false});
assert.deepEqual(normalizePngExportOptions({pixelScale: 9, includeMapOverlays: false, transparentBackground: true}), {
  pixelScale: 4,
  includeMapOverlays: false,
  transparentBackground: true
});

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
assert.ok(fileIoSource.indexOf("drawFixedMapUiElements(documentRef, context, canvasRect, scale)") < fileIoSource.indexOf("if (options.transparentBackground) clearOutsideMapBounds"), "透明清除必须在 overlay 合成后执行");
assert.match(appSource, /export-png-overlays/);
assert.match(appSource, /export-png-transparent/);
assert.match(apiSource, /options\.transparentBackground \?\?/);
assert.match(controlSource, /input-id="export-png-overlays"[^>]*:checked="true"/);
assert.match(controlSource, /input-id="export-png-transparent"/);

console.log(JSON.stringify({
  ok: true,
  defaultOptions: normalizePngExportOptions({}),
  explicitOptions: normalizePngExportOptions({pixelScale: 4, includeMapOverlays: false, transparentBackground: true}),
  transparentClearRects: cleared.length,
  uiAndApiWired: true
}, null, 2));
