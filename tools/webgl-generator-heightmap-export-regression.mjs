#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {
  createHeightmapCanvas,
  createHeightmapPngBlob,
  heightToGrayscaleByte
} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {runHeightmapExportWorkerTask} from "../app/webgl-generator/src/runtime/heightmap-export-worker-task.js";

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

let exportYieldCount = 0;
const exportYieldCellCounts = [];
const slicedCellCount = 600;
let slicedDocument = null;
slicedDocument = createFakeDocument({
  yieldToMain: async () => {
    exportYieldCount++;
    exportYieldCellCounts.push(slicedDocument.context.closedPaths);
  }
});
const slicedResult = await createHeightmapPngBlob(slicedDocument, {
  metadata: {graphWidth: 4, graphHeight: 1, checksum: "heightmap-export-sliced-fixture"},
  grid: {
    cells: {
      h: Array.from({length: slicedCellCount}, () => 50),
      v: Array.from({length: slicedCellCount}, () => [0, 1, 2, 3])
    },
    vertices: {p: fixture.grid.vertices.p.slice(0, 4)}
  }
}, {pixelScale: 2});
assert.equal(exportYieldCount, 3, "正式高度图 blob 导出没有逐批让出主线程");
assert.deepEqual(exportYieldCellCounts, [256, 512, 600], "正式高度图 blob 导出的让出时点没有锁定在 256-cell 批次后");
assert.deepEqual(slicedDocument.context.fillBatchSizes, [256, 256, 88], "正式高度图 blob 导出没有把单次路径绘制限制在最多 256 cells");
assert.equal(slicedDocument.context.closedPaths, slicedCellCount, "异步切片导出没有覆盖全部 cells");
assert.equal(slicedResult.cellCount, slicedCellCount);

const offscreenDocument = createFakeDocument({offscreenCanvas: true});
const offscreenResult = await createHeightmapPngBlob(offscreenDocument, fixture, {pixelScale: 2});
assert.equal(offscreenDocument.offscreenCanvasCount, 1, "正式高度图 blob 导出没有优先创建 OffscreenCanvas");
assert.equal(offscreenDocument.domCanvasCount, 0, "支持 OffscreenCanvas 时仍创建了 DOM canvas");
assert.equal(offscreenDocument.offscreenConvertCount, 1, "OffscreenCanvas 高度图没有通过 convertToBlob 编码");
assert.equal(offscreenResult.blob.size, 19);

const incompleteOffscreenDocument = createFakeDocument({offscreenCanvas: "without-convert"});
const incompleteOffscreenResult = await createHeightmapPngBlob(incompleteOffscreenDocument, fixture, {pixelScale: 2});
assert.equal(incompleteOffscreenDocument.offscreenCanvasCount, 1, "未构造半支持 OffscreenCanvas 反例");
assert.equal(incompleteOffscreenDocument.offscreenConvertCount, 0);
assert.equal(incompleteOffscreenDocument.domCanvasCount, 1, "OffscreenCanvas 缺少 convertToBlob 时没有回退 DOM canvas");
assert.equal(incompleteOffscreenResult.blob.size, 9);

const synchronousDocument = createFakeDocument({offscreenCanvas: true});
createHeightmapCanvas(synchronousDocument, fixture, {pixelScale: 2});
assert.equal(synchronousDocument.domCanvasCount, 1, "公开同步高度图 helper 不应切换到 OffscreenCanvas");
assert.equal(synchronousDocument.offscreenCanvasCount, 0, "公开同步高度图 helper 错误创建了 OffscreenCanvas");

let workerRequest = null;
let workerTerminateCount = 0;
const workerDocument = createFakeDocument({offscreenCanvas: true});
const workerResult = await createHeightmapPngBlob(workerDocument, fixture, {
  pixelScale: 2,
  heightmapExportWorkerFactory: () => ({
    onmessage: null,
    onerror: null,
    postMessage(request) {
      workerRequest = request;
      queueMicrotask(() => this.onmessage?.({data: {
        type: "heightmap-export-result",
        ok: true,
        result: {
          blob: new Blob(["heightmap-worker"], {type: "image/png"}),
          width: 8,
          height: 2,
          pixelScale: 2,
          cellCount: 4,
          minHeight: 0,
          maxHeight: 100,
          encoding: "linear-height-0-100-to-gray-0-255"
        }
      }}));
    },
    terminate() {
      workerTerminateCount++;
    }
  })
});
assert.equal(workerRequest?.type, "heightmap-export");
assert.equal(workerRequest?.map?.grid?.cells?.h, fixture.grid.cells.h, "Worker 请求没有复用权威高度数组");
assert.equal(workerRequest?.map?.grid?.cells?.v, fixture.grid.cells.v, "Worker 请求没有复用权威 cell 几何");
assert.equal(workerRequest?.map?.grid?.vertices?.p, fixture.grid.vertices.p, "Worker 请求没有复用权威顶点几何");
assert.equal(workerTerminateCount, 1, "高度图 Worker 成功后没有终止");
assert.equal(workerDocument.domCanvasCount, 0, "Worker 路径仍在主线程创建 DOM canvas");
assert.equal(workerDocument.offscreenCanvasCount, 0, "Worker 路径仍在主线程创建 OffscreenCanvas");
assert.equal(workerResult.blob.size, 16);

const workerTaskDocument = createFakeDocument({offscreenCanvas: true});
const workerTaskResult = await runHeightmapExportWorkerTask({
  type: "heightmap-export",
  map: fixture,
  options: {pixelScale: 2}
}, {documentRef: workerTaskDocument});
assert.equal(workerTaskDocument.offscreenCanvasCount, 1, "Worker task 没有在 Worker 侧创建 OffscreenCanvas");
assert.equal(workerTaskDocument.domCanvasCount, 0);
assert.equal(workerTaskDocument.offscreenConvertCount, 1);
assert.equal(workerTaskResult.blob.size, 19);
assert.equal(workerTaskResult.canvas, undefined, "Worker task 不应回传 OffscreenCanvas");

let unsupportedWorkerTerminateCount = 0;
const unsupportedWorkerDocument = createFakeDocument({offscreenCanvas: true});
const unsupportedWorkerResult = await createHeightmapPngBlob(unsupportedWorkerDocument, fixture, {
  pixelScale: 2,
  heightmapExportWorkerFactory: () => createReplyWorker({
    type: "heightmap-export-result",
    ok: false,
    error: {code: "heightmap_export_worker_unsupported", message: "worker offscreen unsupported"}
  }, () => unsupportedWorkerTerminateCount++)
});
assert.equal(unsupportedWorkerTerminateCount, 1, "Worker 不支持回退时没有终止 Worker");
assert.equal(unsupportedWorkerDocument.offscreenCanvasCount, 1, "Worker 不支持时没有回退主线程 OffscreenCanvas");
assert.equal(unsupportedWorkerResult.blob.size, 19);

let failedWorkerTerminateCount = 0;
const failedWorkerDocument = createFakeDocument({offscreenCanvas: true});
await assert.rejects(
  () => createHeightmapPngBlob(failedWorkerDocument, fixture, {
    pixelScale: 2,
    heightmapExportWorkerFactory: () => createReplyWorker({
      type: "heightmap-export-result",
      ok: false,
      error: {code: "heightmap_export_worker_encode_failed", message: "encode failed"}
    }, () => failedWorkerTerminateCount++)
  }),
  error => error?.code === "heightmap_export_worker_encode_failed" && /encode failed/u.test(error.message)
);
assert.equal(failedWorkerTerminateCount, 1, "Worker 错误回包后没有终止 Worker");
assert.equal(failedWorkerDocument.offscreenCanvasCount, 0, "非兼容性 Worker 错误不应回退主线程编码");

let fakeBlobWorkerTerminateCount = 0;
await assert.rejects(
  () => createHeightmapPngBlob(createFakeDocument({offscreenCanvas: true}), fixture, {
    pixelScale: 2,
    heightmapExportWorkerFactory: () => createReplyWorker({
      type: "heightmap-export-result",
      ok: true,
      result: {
        blob: {size: 7, type: "image/png"},
        width: 8,
        height: 2,
        pixelScale: 2,
        cellCount: 4,
        minHeight: 0,
        maxHeight: 100,
        encoding: "linear-height-0-100-to-gray-0-255"
      }
    }, () => fakeBlobWorkerTerminateCount++)
  }),
  error => error?.code === "heightmap_export_worker_protocol" && /PNG Blob/u.test(error.message)
);
assert.equal(fakeBlobWorkerTerminateCount, 1, "Worker 伪 Blob 回包被拒绝后没有终止 Worker");

let throwingWorkerTerminateCount = 0;
await assert.rejects(
  () => createHeightmapPngBlob(createFakeDocument({offscreenCanvas: true}), fixture, {
    pixelScale: 2,
    heightmapExportWorkerFactory: () => ({
      postMessage() {
        throw Object.assign(new Error("post failed"), {code: "heightmap_export_worker_post_failed"});
      },
      terminate() {
        throwingWorkerTerminateCount++;
      }
    })
  }),
  error => error?.code === "heightmap_export_worker_post_failed"
);
assert.equal(throwingWorkerTerminateCount, 1, "Worker postMessage 抛错后没有终止 Worker");

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
assert.equal(generatedDocument.domCanvasCount, 1, "无 OffscreenCanvas 环境没有使用 DOM canvas fallback");
assert.equal(generatedDocument.offscreenCanvasCount, 0);

const [controlSource, panelSource, appSource, consoleSource, contractSource, workerSource, workerTaskSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/ControlPanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/panel.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/console-api.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/api-contract.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/heightmap-export-worker.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/heightmap-export-worker-task.js", import.meta.url), "utf8")
]);
assert.match(controlSource, /id="export-heightmap-image"[\s\S]*?>高度灰度图</);
assert.match(panelSource, /export-heightmap-image[\s\S]*onExportHeightmapImage/);
assert.match(appSource, /onExportHeightmapImage:[\s\S]*runtimeActions\.data\.exportHeightmapPNG/);
assert.match(appSource, /operation\.run\("data\.exportHeightmapPNG"/);
assert.match(appSource, /HeightmapExportWorker from "\.\/heightmap-export-worker\.js\?worker"/);
assert.match(appSource, /heightmapExportWorkerFactory: \(\) => new HeightmapExportWorker\(\)/);
assert.match(workerSource, /self\.onmessage = async event =>/);
assert.match(workerSource, /runHeightmapExportWorkerTask\(request\)/);
assert.match(workerSource, /self\.postMessage\(\{type: HEIGHTMAP_EXPORT_WORKER_RESULT, ok: true, result\}\)/);
assert.match(workerTaskSource, /createHeightmapPngBlob\(documentRef, request\.map, request\.options \|\| \{\}\)/);
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

function createFakeDocument({yieldToMain = null, offscreenCanvas = false} = {}) {
  const context = {
    fillColors: new Set(),
    fillBatchSizes: [],
    closedPaths: 0,
    currentPathCells: 0,
    fillStyle: "",
    strokeStyle: "",
    imageSmoothingEnabled: true,
    lineJoin: "",
    lineWidth: 0,
    fillRect() {},
    save() {},
    restore() {},
    scale() {},
    beginPath() {
      this.currentPathCells = 0;
    },
    moveTo() {},
    lineTo() {},
    closePath() {
      this.closedPaths++;
      this.currentPathCells++;
    },
    fill() {
      this.fillColors.add(this.fillStyle);
      this.fillBatchSizes.push(this.currentPathCells);
    },
    stroke() {}
  };
  const documentRef = {
    context,
    domCanvasCount: 0,
    offscreenCanvasCount: 0,
    offscreenConvertCount: 0,
    createElement(tagName) {
      assert.equal(tagName, "canvas");
      this.domCanvasCount++;
      return {
        width: 0,
        height: 0,
        getContext: type => type === "2d" ? context : null,
        toBlob: callback => callback(new Blob(["heightmap"], {type: "image/png"}), "image/png")
      };
    }
  };
  if (yieldToMain || offscreenCanvas) {
    let OffscreenCanvasConstructor = null;
    if (offscreenCanvas) {
      OffscreenCanvasConstructor = class {
        constructor(width, height) {
          documentRef.offscreenCanvasCount++;
          this.width = width;
          this.height = height;
        }

        getContext(type) {
          return type === "2d" ? context : null;
        }
      };
      if (offscreenCanvas !== "without-convert") {
        OffscreenCanvasConstructor.prototype.convertToBlob = async () => {
          documentRef.offscreenConvertCount++;
          return new Blob(["heightmap-offscreen"], {type: "image/png"});
        };
      }
    }
    documentRef.defaultView = {
      ...(yieldToMain ? {scheduler: {yield: yieldToMain}} : {}),
      ...(OffscreenCanvasConstructor ? {OffscreenCanvas: OffscreenCanvasConstructor} : {})
    };
  }
  return documentRef;
}

function createReplyWorker(message, onTerminate) {
  return {
    onmessage: null,
    onerror: null,
    postMessage() {
      queueMicrotask(() => this.onmessage?.({data: message}));
    },
    terminate: onTerminate
  };
}
