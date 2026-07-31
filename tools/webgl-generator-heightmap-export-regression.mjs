#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {
  createHeightmapCanvas,
  createHeightmapPngBlob,
  heightToGrayscaleByte
} from "../app/webgl-generator/src/runtime/map-file-io.js";

const fixture = {
  metadata: {graphWidth: 4, graphHeight: 1, checksum: "heightmap-export-fixture"},
  grid: {
    cells: {
      h: [0, 20, 50, 100],
      v: [
        [0, 1, 2, 3],
        [1, 4, 5, 2],
        [4, 6, 7, 5],
        [6, 8, 9, 7]
      ]
    },
    vertices: {
      p: [
        [0, 0], [1, 0], [1, 1], [0, 1],
        [2, 0], [2, 1],
        [3, 0], [3, 1],
        [4, 0], [4, 1]
      ]
    }
  }
};

const fixtureDocument = createFakeDocument();
const fixtureResult = createHeightmapCanvas(fixtureDocument, fixture, {pixelScale: 2});
assert.equal(fixtureResult.width, 8);
assert.equal(fixtureResult.height, 2);
assert.equal(fixtureResult.pixelScale, 2);
assert.equal(fixtureResult.cellCount, 4);
assert.equal(fixtureResult.minHeight, 0);
assert.equal(fixtureResult.maxHeight, 100);
assert.equal(fixtureResult.encoding, "linear-height-0-100-to-gray-0-255");
assert.equal(fixtureDocument.context.closedPaths, 4, "灰度图没有覆盖全部 fixture cells");
assert.deepEqual([...fixtureDocument.context.fillColors].sort(), [
  "rgb(0, 0, 0)",
  "rgb(128, 128, 128)",
  "rgb(255, 255, 255)",
  "rgb(51, 51, 51)"
].sort());

assert.equal(heightToGrayscaleByte(0), 0);
assert.equal(heightToGrayscaleByte(20), 51);
assert.equal(heightToGrayscaleByte(50), 128);
assert.equal(heightToGrayscaleByte(100), 255);
assert.equal(heightToGrayscaleByte(-5), 0);
assert.equal(heightToGrayscaleByte(105), 255);
assert.throws(() => heightToGrayscaleByte(Number.NaN), /有限数/);

const generatedMap = generatePlaceholderMap({
  seed: "heightmap-export-regression",
  cellsTarget: 3000,
  heightmapTemplate: "continents"
});
const generatedChecksum = generatedMap.metadata.checksum;
const generatedDocument = createFakeDocument();
const generatedResult = await createHeightmapPngBlob(generatedDocument, generatedMap, {pixelScale: 1});
assert(generatedResult.blob.size > 0, "高度灰度 PNG blob 为空");
assert.equal(generatedResult.width, generatedMap.metadata.graphWidth);
assert.equal(generatedResult.height, generatedMap.metadata.graphHeight);
assert.equal(generatedResult.cellCount, generatedMap.grid.cells.h.length);
assert.equal(generatedDocument.context.closedPaths, generatedMap.grid.cells.h.length, "生成地图没有覆盖全部 Grid Cells");
assert.equal(generatedMap.metadata.checksum, generatedChecksum, "导出修改了地图 checksum");

const [controlSource, panelSource, appSource, consoleSource, contractSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/ControlPanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/panel.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/console-api.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/api-contract.js", import.meta.url), "utf8")
]);
assert.match(controlSource, /id="export-heightmap-image"[\s\S]*?>高度灰度图</);
assert.match(panelSource, /export-heightmap-image[\s\S]*onExportHeightmapImage/);
assert.match(appSource, /onExportHeightmapImage:[\s\S]*runtimeActions\.data\.exportHeightmapPNG/);
assert.match(appSource, /operation\.run\("data\.exportHeightmapPNG"/);
assert.match(consoleSource, /exportHeightmapPNG:[\s\S]*actions\.data\?\.exportHeightmapPNG/);
assert.match(contractSource, /"exportPNG", "exportHeightmapPNG"/);

assert.throws(
  () => createHeightmapCanvas(createFakeDocument(), {metadata: {graphWidth: 4, graphHeight: 1}, grid: {cells: {h: [1], v: [[]]}, vertices: {p: []}}}),
  /Voronoi 多边形/
);

console.log(JSON.stringify({
  ok: true,
  fixture: {
    size: [fixtureResult.width, fixtureResult.height],
    shades: [0, 51, 128, 255],
    cellCount: fixtureResult.cellCount
  },
  generated: {
    size: [generatedResult.width, generatedResult.height],
    cellCount: generatedResult.cellCount,
    minHeight: generatedResult.minHeight,
    maxHeight: generatedResult.maxHeight,
    bytes: generatedResult.blob.size,
    checksum: generatedChecksum
  },
  wiring: {
    ui: true,
    runtimeAction: true,
    publicApi: true
  }
}, null, 2));

function createFakeDocument() {
  const context = {
    fillColors: new Set(),
    closedPaths: 0,
    fillStyle: "",
    strokeStyle: "",
    imageSmoothingEnabled: true,
    lineJoin: "",
    lineWidth: 0,
    fillRect() {},
    save() {},
    restore() {},
    scale() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {
      this.closedPaths++;
    },
    fill() {
      this.fillColors.add(this.fillStyle);
    },
    stroke() {}
  };
  return {
    context,
    createElement(tagName) {
      assert.equal(tagName, "canvas");
      return {
        width: 0,
        height: 0,
        getContext: type => type === "2d" ? context : null,
        toBlob: callback => callback(new Blob(["heightmap"], {type: "image/png"}), "image/png")
      };
    }
  };
}
