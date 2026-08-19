#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {Worker} from "node:worker_threads";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {PlaceholderMapRenderer} from "../app/webgl-generator/src/renderer/placeholder-renderer.js";

import {
  MAP_FILE_IO_WORKER_OPERATIONS,
  collectMapFileIoWorkerTransferables,
  runMapFileIoWorkerTask
} from "../app/webgl-generator/src/runtime/map-file-io-worker-task.js";
import {
  prepareMapFileIoWorkerPayload,
  restoreMapFileIoWorkerResult
} from "../app/webgl-generator/src/runtime/map-file-io-worker-client.js";
import {
  BROWSER_MAP_STORAGE_BINARY_TYPE,
  BROWSER_MAP_STORAGE_TYPE,
  BROWSER_MAP_STORAGE_VERSION,
  createBrowserMapStorageBinaryImportSource,
  createBrowserMapStorageBinaryRecord,
  createBrowserMapStorageEnvelope,
  encodeBrowserMapStorageBytesPayload,
  isBrowserMapStorageBinaryRecord,
  shouldWriteBrowserMapStorageBinary
} from "../app/webgl-generator/src/runtime/browser-map-storage.js";

const fixtureText = await readFile(new URL("./fixtures/webgl-map-v1-minimal.json", import.meta.url), "utf8");
const preparedPresentationReceiver = {
  visualTheme: null,
  viewOptions: {visualTheme: null},
  unitPreferences: null
};
PlaceholderMapRenderer.prototype.setPreparedPresentation.call(preparedPresentationReceiver, {
  visualTheme: "ancient",
  unitPreferences: {militaryScale: 1.625}
});
assert.equal(preparedPresentationReceiver.visualTheme.id, "ancient");
assert.equal(preparedPresentationReceiver.viewOptions.visualTheme, preparedPresentationReceiver.visualTheme);
assert.equal(preparedPresentationReceiver.unitPreferences.militaryScale, 1.6);
const chunks = splitText(fixtureText, 7);
const clientLargeText = fixtureText.repeat(1000);
const preparedText = await prepareMapFileIoWorkerPayload({operation: "import", input: clientLargeText}, {chunkChars: 16 * 1024});
assert.equal(preparedText.payload.input.kind, "text-chunks");
assert.equal(preparedText.payload.input.chunks.join(""), clientLargeText);
assert.ok(preparedText.payload.input.chunks.length > 1, "客户端必须在进入图流前切分大字符串");
const clientAbort = new AbortController();
clientAbort.abort("client abort fixture");
await assert.rejects(
  prepareMapFileIoWorkerPayload({operation: "import", input: clientLargeText}, {signal: clientAbort.signal}),
  error => error?.code === "map-file-worker-client-aborted"
);

const directProgress = [];
const directImport = await runMapFileIoWorkerTask({
  operation: MAP_FILE_IO_WORKER_OPERATIONS.IMPORT,
  input: fixtureText
}, {report: (stage, details) => directProgress.push({stage, ...details})});
const workerImport = await runTaskInWorker({
  operation: MAP_FILE_IO_WORKER_OPERATIONS.IMPORT,
  input: {kind: "text-chunks", chunks}
});

assert.equal(directImport.document.version, 2);
assert.equal(workerImport.result.document.version, 2);
assert.ok(directImport.map.grid.cells.h instanceof Uint8Array, "fallback plain JSON 没有恢复 typed array");
assert.ok(workerImport.result.map.grid.cells.h instanceof Uint8Array, "Worker plain JSON 没有恢复 typed array");
assert.deepEqual([...workerImport.result.map.grid.cells.h], [...directImport.map.grid.cells.h]);
assert.equal(directImport.map, directImport.document.map, "fallback import DTO 没有保留 document/map 别名");
assert.equal(workerImport.result.map, workerImport.result.document.map, "Worker import DTO 没有保留 document/map 别名");
assert.equal(workerImport.result.metadata.checksum, directImport.metadata.checksum);
assert.deepEqual(workerImport.progress.map(item => item.stage), directProgress.map(item => item.stage));

const renderMap = generatePlaceholderMap({seed: "task322-map-file-render", cellsTarget: 1000, graphWidth: 800, graphHeight: 600});
const renderDocument = await runMapFileIoWorkerTask({operation: "export", map: renderMap, encoding: "plain", resultType: "text"});
const renderedImport = await runTaskInWorker({
  operation: MAP_FILE_IO_WORKER_OPERATIONS.IMPORT,
  input: renderDocument.data,
  render: {
    binding: {mapIdentity: "import-fixture", mapRevision: 0},
    layers: ["point"],
    unitPreferences: {distanceUnit: "mi"},
    visualTheme: {id: "default"}
  }
});
assert.deepEqual(renderedImport.progress.map(item => item.stage), ["read", "parse", "render", "render-prepare", "complete"]);
assert.deepEqual(renderedImport.result.preparedRender.binding, {mapIdentity: "import-fixture", mapRevision: 0, topologyRevision: 0});
assert.deepEqual(Object.keys(renderedImport.result.preparedRender.layers), ["point"]);
assert.ok(renderedImport.result.preparedRender.layers.point.vertices instanceof Float32Array);

const directGeoJson = await runMapFileIoWorkerTask({
  operation: MAP_FILE_IO_WORKER_OPERATIONS.EXPORT_GEOJSON,
  map: renderMap,
  options: {range: {mode: "full"}}
});
const workerGeoJson = await runTaskInWorker({
  operation: MAP_FILE_IO_WORKER_OPERATIONS.EXPORT_GEOJSON,
  map: renderMap,
  options: {range: {mode: "full"}}
});
assert.ok(workerGeoJson.result.data instanceof Uint8Array);
assert.deepEqual(workerGeoJson.result.data, directGeoJson.data, "Worker/fallback GeoJSON 字节不一致");
assert.equal(workerGeoJson.result.metadata.features, renderMap.pack.cells.i.length);
assert.equal(JSON.parse(new TextDecoder().decode(workerGeoJson.result.data)).type, "FeatureCollection");
assert.equal(collectMapFileIoWorkerTransferables(workerGeoJson.result).length, 1, "GeoJSON DTO 应只传输一个字节 buffer");

const directExport = await runMapFileIoWorkerTask({
  operation: MAP_FILE_IO_WORKER_OPERATIONS.EXPORT,
  document: directImport.document,
  encoding: "plain",
  resultType: "bytes"
});
const workerExport = await runTaskInWorker({
  operation: MAP_FILE_IO_WORKER_OPERATIONS.EXPORT,
  document: directImport.document,
  encoding: "plain",
  resultType: "bytes"
});

assert.ok(directExport.data instanceof Uint8Array);
assert.ok(workerExport.result.data instanceof Uint8Array);
for (const key of ["normalizeMs", "stringifyMs", "compressMs", "packageMs", "totalMs"]) {
  assert.ok(Number.isFinite(directExport.timings[key]) && directExport.timings[key] >= 0, `存档导出缺少 ${key} 阶段计时`);
}
assert.equal(directExport.timings.serializationPasses, 1, "地图导出必须只序列化一次正式 JSON 文本");
assert.equal(directExport.timings.gzipMs, directExport.timings.compressMs, "兼容 gzipMs 与 compressMs 漂移");
for (const key of ["parseMs", "renderPrepareMs", "totalMs"]) {
  assert.ok(Number.isFinite(directImport.timings[key]) && directImport.timings[key] >= 0, `地图导入缺少 ${key} 阶段计时`);
}
assert.deepEqual(workerExport.result.data, directExport.data, "Worker/fallback plain JSON 字节不一致");
const exportedText = new TextDecoder().decode(workerExport.result.data);
const exported = await runMapFileIoWorkerTask({operation: "import", input: exportedText});
assert.equal(exported.metadata.checksum, directImport.metadata.checksum);
assert.ok(exported.map.grid.cells.h instanceof Uint8Array);

const gzipExport = await runTaskInWorker({
  operation: MAP_FILE_IO_WORKER_OPERATIONS.EXPORT,
  document: directImport.document,
  encoding: "webfmg",
  resultType: "blob"
});
assert.ok(gzipExport.result.data instanceof Blob, "Worker .webfmg 导出没有返回 Blob");
assert.equal(gzipExport.result.encoding, "webfmg-v3", "`.webfmg` 必须导出 v3 分区容器");
assert.equal(gzipExport.result.originalCharacters, 0, "v3 导出不得先生成完整 JSON 字符串");
assert.equal(gzipExport.result.data.type, "application/gzip");
const gzipBytes = new Uint8Array(await gzipExport.result.data.arrayBuffer());
const preparedBlob = await prepareMapFileIoWorkerPayload({
  operation: "import",
  input: gzipExport.result.data,
  filename: "legacy.webfmg"
});
assert.equal(preparedBlob.payload.input.kind, "bytes");
assert.deepEqual(preparedBlob.payload.input.bytes, gzipBytes, "Blob 必须在进入图流前转换为字节");
const gzipBase64 = Buffer.from(gzipBytes).toString("base64");
const browserBinaryRecord = createBrowserMapStorageBinaryRecord(gzipBytes, directImport.map, {originalBytes: directExport.bytes});
assert.equal(browserBinaryRecord.type, BROWSER_MAP_STORAGE_BINARY_TYPE);
assert.equal(isBrowserMapStorageBinaryRecord(browserBinaryRecord), true);
assert.equal(shouldWriteBrowserMapStorageBinary(0), false);
assert.equal(shouldWriteBrowserMapStorageBinary(1), true);
const binaryRecordImport = await runMapFileIoWorkerTask({
  operation: MAP_FILE_IO_WORKER_OPERATIONS.IMPORT,
  input: createBrowserMapStorageBinaryImportSource(browserBinaryRecord)
});
assert.equal(binaryRecordImport.metadata.checksum, directImport.metadata.checksum);
const gzipFallback = await runMapFileIoWorkerTask({
  operation: MAP_FILE_IO_WORKER_OPERATIONS.IMPORT,
  input: gzipExport.result.data,
  filename: "legacy.webfmg"
});
const gzipWorker = await runTaskInWorker({
  operation: MAP_FILE_IO_WORKER_OPERATIONS.IMPORT,
  input: {encoding: "gzip-base64", chunks: splitText(gzipBase64, 5)}
});
assert.equal(gzipFallback.metadata.checksum, directImport.metadata.checksum);
assert.equal(gzipWorker.result.metadata.checksum, directImport.metadata.checksum);
assert.ok(gzipWorker.result.map.grid.cells.h instanceof Uint8Array);

const browserEnvelope = createBrowserMapStorageEnvelope(exportedText, directImport.map, {
  encoding: "gzip-base64",
  data: gzipBase64,
  bytes: gzipBytes.byteLength
});
const browserBytesEnvelope = await encodeBrowserMapStorageBytesPayload({defaultView: globalThis}, gzipBytes, directImport.map, {
  originalBytes: gzipExport.result.originalBytes,
  originalCharacters: exportedText.length
});
assert.equal(browserBytesEnvelope.type, BROWSER_MAP_STORAGE_TYPE);
assert.equal(browserBytesEnvelope.encoding, "gzip-base64");
assert.equal(browserBytesEnvelope.originalBytes, gzipExport.result.originalBytes);
assert.equal(browserBytesEnvelope.bytes, gzipBytes.byteLength);
assert.equal(Buffer.from(browserBytesEnvelope.data, "base64").byteLength, gzipBytes.byteLength);
const envelopeFallback = await runMapFileIoWorkerTask({operation: "import", input: browserEnvelope});
const envelopeWorker = await runTaskInWorker({operation: "import", input: JSON.stringify(browserEnvelope)});
assert.equal(envelopeFallback.metadata.checksum, directImport.metadata.checksum);
assert.equal(envelopeWorker.result.metadata.checksum, directImport.metadata.checksum);

const damagedJson = await compareFailure({operation: "import", input: "{bad json"});
assert.match(damagedJson.message, /JSON/);
const futureDocument = JSON.parse(fixtureText);
futureDocument.version = 99;
const futureVersion = await compareFailure({operation: "import", input: JSON.stringify(futureDocument)});
assert.match(futureVersion.message, /暂不支持的地图格式版本：99/);
const futureEnvelope = {...browserEnvelope, version: BROWSER_MAP_STORAGE_VERSION + 1};
const browserVersion = await compareFailure({operation: "import", input: futureEnvelope});
assert.match(browserVersion.message, /暂不支持的浏览器存档版本：2/);
const damagedGzip = await compareFailure({
  operation: "import",
  input: new Blob([new Uint8Array([1, 2, 3, 4])], {type: "application/gzip"}),
  filename: "damaged.webfmg"
});
assert.ok(damagedGzip.message);

const largeMap = createLargeMapFixture(100_000);
const largePlain = await runMapFileIoWorkerTask({
  operation: "export",
  map: largeMap,
  encoding: "plain",
  resultType: "bytes"
});
const largeWorkerImport = await runTaskInWorker({
  operation: "import",
  input: {kind: "bytes", bytes: largePlain.data, mimeType: largePlain.mimeType}
});
assertLargeMap(largeWorkerImport.result, 100_000);
const largeGzip = await runTaskInWorker({
  operation: "export",
  document: largeWorkerImport.result.document,
  encoding: "gzip",
  resultType: "bytes"
});
const largeFallbackImport = await runMapFileIoWorkerTask({
  operation: "import",
  input: {kind: "bytes", bytes: largeGzip.result.data, mimeType: "application/gzip"},
  filename: "large.webfmg"
});
assertLargeMap(largeFallbackImport, 100_000);
const largeTransferList = collectMapFileIoWorkerTransferables(largeFallbackImport);
assert.ok(largeTransferList.length >= 6, "100k import DTO 没有暴露 typed array transfer list");
const transferredLargeImport = structuredClone(largeFallbackImport, {transfer: largeTransferList});
assertLargeMap(transferredLargeImport, 100_000);

const exportTransferList = collectMapFileIoWorkerTransferables(largeGzip.result);
assert.equal(exportTransferList.length, 1, "gzip bytes DTO 应只暴露一个 transferable buffer");
const preparedBlobExport = await prepareMapFileIoWorkerPayload({
  operation: "export",
  document: directImport.document,
  encoding: "gzip",
  resultType: "blob"
});
assert.equal(preparedBlobExport.payload.resultType, "bytes", "正式协议不得在 accepted 后传回 Blob");
const restoredBlobExport = await restoreMapFileIoWorkerResult(largeGzip.result, preparedBlobExport);
assert.ok(restoredBlobExport.data instanceof Blob);
assert.equal(restoredBlobExport.data.size, largeGzip.result.data.byteLength);
const preparedTextExport = await prepareMapFileIoWorkerPayload({
  operation: "export",
  document: directImport.document,
  encoding: "plain",
  resultType: "text"
});
const restoredTextExport = await restoreMapFileIoWorkerResult(directExport, preparedTextExport);
assert.equal(restoredTextExport.data, new TextDecoder().decode(directExport.data));

console.log(JSON.stringify({
  ok: true,
  plainJson: {
    sourceVersion: 1,
    targetVersion: workerImport.result.document.version,
    checksum: workerImport.result.metadata.checksum,
    typedArray: workerImport.result.map.grid.cells.h.constructor.name,
    bytes: workerExport.result.bytes,
    progressStages: workerImport.progress.map(item => item.stage)
  },
  compressed: {
    webfmgBytes: gzipBytes.byteLength,
    blob: gzipExport.result.data.constructor.name,
    gzipBase64: true,
    browserEnvelope: browserEnvelope.type === BROWSER_MAP_STORAGE_TYPE
  },
  failures: {
    damagedJson: damagedJson.message,
    futureVersion: futureVersion.message,
    browserVersion: browserVersion.message,
    damagedGzip: damagedGzip.message
  },
  largeMap: {
    gridCells: largeWorkerImport.result.metadata.gridCells,
    checksum: largeWorkerImport.result.metadata.checksum,
    plainBytes: largePlain.bytes,
    gzipBytes: largeGzip.result.bytes,
    typedArrays: [
      largeWorkerImport.result.map.grid.cells.i.constructor.name,
      largeWorkerImport.result.map.grid.cells.h.constructor.name,
      largeWorkerImport.result.map.grid.cells.temperature.constructor.name,
      largeWorkerImport.result.map.grid.cells.prec.constructor.name
    ],
    riverAlias: largeWorkerImport.result.map.pack.rivers === largeWorkerImport.result.map.rivers.rivers,
    transferableBuffers: largeTransferList.length
  }
}, null, 2));

function splitText(text, chunkCount) {
  const size = Math.max(1, Math.ceil(text.length / chunkCount));
  const chunks = [];
  for (let offset = 0; offset < text.length; offset += size) chunks.push(text.slice(offset, offset + size));
  return chunks;
}

function runTaskInWorker(payload) {
  const moduleUrl = new URL("../app/webgl-generator/src/runtime/map-file-io-worker-task.js", import.meta.url).href;
  const source = `
    import {parentPort} from "node:worker_threads";
    import {runMapFileIoWorkerTask} from ${JSON.stringify(moduleUrl)};
    parentPort.on("message", async payload => {
      const progress = [];
      try {
        const result = await runMapFileIoWorkerTask(payload, {report: (stage, details) => progress.push({stage, ...details})});
        parentPort.postMessage({ok: true, result, progress});
      } catch (error) {
        parentPort.postMessage({ok: false, error: {name: error?.name || "Error", message: error?.message || String(error)}, progress});
      }
    });
  `;
  const workerUrl = new URL(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  const worker = new Worker(workerUrl, {type: "module"});
  return new Promise((resolve, reject) => {
    worker.once("message", message => {
      void worker.terminate();
      if (message.ok) resolve(message);
      else reject(Object.assign(new Error(message.error.message), {name: message.error.name}));
    });
    worker.once("error", reject);
    worker.postMessage(payload);
  });
}

async function compareFailure(payload) {
  const [fallback, worker] = await Promise.all([
    captureFailure(() => runMapFileIoWorkerTask(payload)),
    captureFailure(() => runTaskInWorker(payload))
  ]);
  assert.deepEqual(worker, fallback, `Worker/fallback 错误不一致：${fallback.message}`);
  return fallback;
}

async function captureFailure(run) {
  try {
    await run();
  } catch (error) {
    return {name: error?.name || "Error", message: error?.message || String(error)};
  }
  assert.fail("预期地图存档 Worker 任务失败");
}

function createLargeMapFixture(count) {
  const i = new Uint32Array(count);
  const h = new Uint8Array(count);
  const temperature = new Int8Array(count);
  const prec = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    i[index] = index;
    h[index] = index % 101;
    temperature[index] = index % 61 - 30;
    prec[index] = (index % 1000) / 10;
  }
  return {
    metadata: {
      seed: "task-322-io-100k",
      checksum: "task-322-io-100k-checksum",
      gridCells: count,
      packCells: 1
    },
    summary: {checksum: "task-322-io-100k-checksum"},
    options: {seed: "task-322-io-100k"},
    grid: {metadata: {actualCells: count}, cells: {i, h, temperature, prec}},
    pack: {
      metadata: {cells: 1},
      cells: {i: new Uint32Array([0]), g: new Uint32Array([0])},
      features: [],
      rivers: []
    },
    rivers: {rivers: [], metadata: {rivers: 0}}
  };
}

function assertLargeMap(result, expectedCount) {
  assert.equal(result.metadata.gridCells, expectedCount);
  assert.equal(result.metadata.checksum, "task-322-io-100k-checksum");
  assert.equal(result.map.grid.cells.i.length, expectedCount);
  assert.ok(result.map.grid.cells.i instanceof Uint32Array);
  assert.ok(result.map.grid.cells.h instanceof Uint8Array);
  assert.ok(result.map.grid.cells.temperature instanceof Int8Array);
  assert.ok(result.map.grid.cells.prec instanceof Float32Array);
  assert.equal(result.map, result.document.map, "100k document/map 别名丢失");
  assert.equal(result.map.pack.rivers, result.map.rivers.rivers, "100k pack/rivers 正式别名没有恢复");
}
