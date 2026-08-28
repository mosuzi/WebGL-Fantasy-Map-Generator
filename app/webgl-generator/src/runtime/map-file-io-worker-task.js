import {
  createCompressedMapTextBlob,
  createMapDocument,
  createMapGeoJson,
  parseMapDocument,
  parseMapDocumentPayloadWithAdoptionBytes,
  stringifyMapDocument,
  validateMapDocumentForExport
} from "./map-file-io.js";
import {
  decodeBrowserMapStorageImportPayload
} from "./browser-map-storage.js";
import {isCompressedMapDocumentFilename} from "./map-filename.js";
import {encodeWebfmgV3Document, gzipWebfmgV3Bytes} from "./webfmg-v3-container.js";
import {createParsedMapAdoptionPackage} from "./map-adoption-handoff.js";
import {applyMainThreadMapProjection} from "./main-thread-map-projection.js";
import {normalizeMapForRuntimeAdoption} from "./map-runtime-adoption.js";
import {executeRenderPreparationTask} from "../renderer/render-preparation.js";
import {mergeUserVisualThemes, normalizeVisualThemeId, resolveVisualTheme} from "../renderer/themes.js";
import {createWholeMapDocumentMetadata} from "./whole-map-profile-protocol.js";

export const MAP_FILE_IO_WORKER_TASK_TYPE = "map-file-io";
export const MAP_FILE_IO_WORKER_OPERATIONS = Object.freeze({
  IMPORT: "import",
  EXPORT: "export",
  EXPORT_GEOJSON: "export-geojson"
});

export async function runMapFileIoWorkerTask(payload, context = {}) {
  const operation = String(payload?.operation || "");
  if (operation === MAP_FILE_IO_WORKER_OPERATIONS.IMPORT) return importMapFile(payload, context);
  if (operation === MAP_FILE_IO_WORKER_OPERATIONS.EXPORT) return exportMapFile(payload, context);
  if (operation === MAP_FILE_IO_WORKER_OPERATIONS.EXPORT_GEOJSON) return exportMapGeoJson(payload, context);
  throw new Error(`不支持的地图存档操作：${operation || "未知"}`);
}

async function exportMapGeoJson(payload, context) {
  const startedAt = taskNow();
  await taskCheckpoint(context);
  reportTaskProgress(context, "geojson-build", 0.2, "构建地图 GeoJSON");
  const geoJson = createMapGeoJson(payload.map, payload.options || {});
  await taskCheckpoint(context);
  reportTaskProgress(context, "geojson-stringify", 0.72, "序列化地图 GeoJSON");
  const text = JSON.stringify(geoJson);
  const data = new (runtimeView().TextEncoder)().encode(text);
  await taskCheckpoint(context);
  reportTaskProgress(context, "complete", 1, "地图 GeoJSON 已整理完成");
  return {
    kind: "map-file-geojson-export-result",
    mimeType: "application/geo+json;charset=utf-8",
    bytes: data.byteLength,
    data,
    metadata: {
      type: geoJson.type,
      name: geoJson.name || "",
      seed: geoJson.properties?.seed || "",
      checksum: geoJson.properties?.checksum || "",
      features: geoJson.features?.length || 0,
      coordinateReference: geoJson.properties?.coordinateReference || "",
      worldBounds: geoJson.properties?.worldBounds || null,
      coordinateBounds: geoJson.properties?.coordinateBounds || null,
      exportRange: geoJson.properties?.exportRange || null
    },
    timings: {totalMs: roundTaskMs(taskNow() - startedAt)}
  };
}

export function collectMapFileIoWorkerTransferables(result) {
  const buffers = new Set();
  const visited = new WeakSet();
  visitTransferableValues(result, buffers, visited);
  return [...buffers];
}

async function importMapFile(payload, context) {
  const startedAt = taskNow();
  await taskCheckpoint(context);
  reportTaskProgress(context, "read", 0.05, "读取地图存档输入");
  const source = normalizeImportSource(payload);
  await taskCheckpoint(context);

  reportTaskProgress(context, "parse", 0.45, "解析、迁移并校验地图文档");
  const parseStartedAt = taskNow();
  const parsed = await parseImportSource(source, payload);
  const parsedDocument = parsed.document;
  const parseMs = roundTaskMs(taskNow() - parseStartedAt);
  await taskCheckpoint(context);

  const adoption = typeof context.adoptMap === "function";
  const handoffStartedAt = adoption ? taskNow() : 0;
  const adoptionPackage = adoption && payload.omitAdoptionHandoff !== true
    ? createParsedMapAdoptionPackage(parsedDocument, {adoptionBytes: parsed.adoptionBytes})
    : null;
  const document = adoptionPackage?.document || parsedDocument;
  if (adoption && !adoptionPackage) applyMainThreadMapProjection(document.map);
  normalizeMapForRuntimeAdoption(document.map);
  const handoffEncodeMs = adoption ? roundTaskMs(taskNow() - handoffStartedAt) : 0;

  const renderPrepareStartedAt = taskNow();
  const preparedRender = payload.render
    ? await prepareImportedMapRender(document, payload.render, context)
    : null;
  const renderPrepareMs = roundTaskMs(taskNow() - renderPrepareStartedAt);
  await taskCheckpoint(context);

  reportTaskProgress(context, "complete", 1, "地图存档解析完成");
  if (adoption) {
    context.adoptMap(document.map);
    await taskCheckpoint(context);
    return {
      kind: "map-file-import-result",
      binding: context.binding || null,
      handoff: adoptionPackage?.handoff || null,
      canonicalDocumentMode: adoptionPackage ? "handoff" : "parallel-main-decode",
      preparedRender,
      metadata: createWholeMapDocumentMetadata(document),
      timings: {
        parseMs,
        renderPrepareMs,
        handoffEncodeMs,
        totalMs: roundTaskMs(taskNow() - startedAt)
      }
    };
  }
  if (payload.renderOnly === true) {
    return {
      kind: "map-file-import-render-result",
      binding: context.binding || null,
      preparedRender,
      metadata: createWholeMapDocumentMetadata(document),
      timings: {
        parseMs,
        renderPrepareMs,
        handoffEncodeMs: 0,
        totalMs: roundTaskMs(taskNow() - startedAt)
      }
    };
  }
  return {
    kind: "map-file-import-result",
    binding: context.binding || null,
    document,
    map: document.map,
    preparedRender,
    metadata: createWholeMapDocumentMetadata(document),
    timings: {parseMs, renderPrepareMs, totalMs: roundTaskMs(taskNow() - startedAt)}
  };
}

async function exportMapFile(payload, context) {
  const startedAt = taskNow();
  await taskCheckpoint(context);
  reportTaskProgress(context, "normalize", 0.08, "规范化并校验地图文档");
  const normalizeStartedAt = taskNow();
  const document = normalizeExportDocument(payload);
  const normalizeMs = roundTaskMs(taskNow() - normalizeStartedAt);
  await taskCheckpoint(context);

  const encoding = normalizeExportEncoding(payload);
  reportTaskProgress(context, "stringify", 0.42, encoding === "webfmg-v3" ? "编排紧凑地图分区" : "序列化地图文档");
  const stringifyStartedAt = taskNow();
  const text = encoding === "webfmg-v3" ? "" : stringifyMapDocument(document);
  const binary = encoding === "webfmg-v3" ? encodeWebfmgV3Document(document) : null;
  const stringifyMs = roundTaskMs(taskNow() - stringifyStartedAt);
  await taskCheckpoint(context);

  const resultType = normalizeExportResultType(payload);
  const view = runtimeView();
  let blob;
  let originalBytes;
  let compressMs = 0;
  if (encoding === "webfmg-v3") {
    reportTaskProgress(context, "compress", 0.68, "压缩紧凑地图分区");
    const gzipStartedAt = taskNow();
    const compressed = await gzipWebfmgV3Bytes(binary, view);
    compressMs = roundTaskMs(taskNow() - gzipStartedAt);
    blob = new view.Blob([compressed], {type: "application/gzip"});
    originalBytes = binary.byteLength;
  } else if (encoding === "gzip") {
    reportTaskProgress(context, "compress", 0.68, "压缩地图文档");
    const gzipStartedAt = taskNow();
    const compressed = await createCompressedMapTextBlob({defaultView: view}, text);
    compressMs = roundTaskMs(taskNow() - gzipStartedAt);
    blob = compressed.blob;
    originalBytes = compressed.originalBytes;
  } else {
    originalBytes = new view.TextEncoder().encode(text).byteLength;
    blob = new view.Blob([text], {type: "application/json;charset=utf-8"});
  }
  await taskCheckpoint(context);

  reportTaskProgress(context, "package", 0.9, "封装地图存档输出");
  const packageStartedAt = taskNow();
  const data = await createExportData(blob, text, resultType);
  const packageMs = roundTaskMs(taskNow() - packageStartedAt);
  await taskCheckpoint(context);
  reportTaskProgress(context, "complete", 1, "地图存档序列化完成");
  return {
    kind: "map-file-export-result",
    binding: context.binding || null,
    encoding,
    resultType,
    mimeType: encoding === "webfmg-v3" || encoding === "gzip" ? "application/gzip" : "application/json;charset=utf-8",
    originalBytes,
    originalCharacters: text.length,
    bytes: blob.size,
    data,
    metadata: createWholeMapDocumentMetadata(document),
    timings: {
      normalizeMs,
      stringifyMs,
      compressMs,
      gzipMs: compressMs,
      packageMs,
      serializationPasses: 1,
      totalMs: roundTaskMs(taskNow() - startedAt)
    }
  };
}

async function prepareImportedMapRender(document, render, context) {
  reportTaskProgress(context, "render", 0.72, "准备地图画面");
  const map = document.map;
  const userThemes = Array.isArray(map?.visualTheme?.userThemes) ? map.visualTheme.userThemes : [];
  if (userThemes.length) mergeUserVisualThemes(userThemes);
  const themeId = normalizeVisualThemeId(map?.visualTheme?.preset || map?.options?.visualTheme || document?.options?.visualTheme);
  return executeRenderPreparationTask({
    ...render,
    map,
    selection: null,
    objectHighlights: [],
    unitPreferences: map?.display?.units || render.unitPreferences,
    visualTheme: resolveVisualTheme(themeId)
  }, context);
}

function normalizeImportSource(payload) {
  if (!payload || typeof payload !== "object") throw new Error("地图存档输入必须是对象");
  const source = payload.input ?? payload.source;
  if (source === undefined || source === null) throw new Error("地图存档缺少输入数据");
  if (Array.isArray(source)) {
    if (!source.every(chunk => typeof chunk === "string")) throw new Error("地图存档字符串分片必须全部是字符串");
    return source.join("");
  }
  if (source?.kind === "text-chunks" && !isTextChunkPacket(source)) {
    throw new Error("地图存档字符串分片必须全部是字符串");
  }
  if (isTextChunkPacket(source)) return source.chunks.join("");
  if (source?.encoding === "plain" && Array.isArray(source.chunks)) {
    assertStringChunks(source.chunks);
    return {...source, data: source.chunks.join("")};
  }
  if (source?.encoding === "gzip-base64" && Array.isArray(source.chunks)) {
    assertStringChunks(source.chunks);
    return {...source, data: source.chunks.join("")};
  }
  return source;
}

async function parseImportSource(source, payload) {
  const view = runtimeView();
  const decodedBrowserStorage = await decodeBrowserMapStorageImportPayload({defaultView: view}, source);
  if (decodedBrowserStorage !== source) {
    return parseMapDocumentPayloadWithAdoptionBytes({defaultView: view}, decodedBrowserStorage);
  }
  if (typeof source === "string") return parseMapDocumentPayloadWithAdoptionBytes({defaultView: view}, source);
  if (isBinarySource(source)) {
    const bytes = binarySourceBytes(source);
    if (source?.kind === "bytes" && !isBinarySourceValue(bytes)) throw new Error("地图存档字节 packet 缺少有效 bytes");
    const blob = source instanceof view.Blob
      ? source
      : new view.Blob([bytes], {type: payload.mimeType || source.mimeType || ""});
    const filename = String(payload.filename || source.name || source.filename || "");
    const compressed = payload.encoding === "gzip"
      || isCompressedMapDocumentFilename(filename)
      || /gzip/i.test(String(payload.mimeType || source.type || source.mimeType || ""));
    if (compressed && !/gzip/i.test(blob.type)) {
      return parseMapDocumentPayloadWithAdoptionBytes({defaultView: view}, new view.Blob([blob], {type: "application/gzip"}));
    }
    return parseMapDocumentPayloadWithAdoptionBytes({defaultView: view}, blob);
  }
  if (source?.encoding === "plain" || source?.encoding === "gzip-base64" || typeof source?.base64 === "string") {
    return parseMapDocumentPayloadWithAdoptionBytes({defaultView: view}, source);
  }
  if (typeof source === "object" && !Array.isArray(source)) {
    return {document: parseMapDocument(stringifyMapDocument(source)), adoptionBytes: null};
  }
  throw new Error("地图存档输入必须是 JSON、File/Blob、字节或分片字符串");
}

function normalizeExportDocument(payload) {
  if (payload?.document && typeof payload.document === "object") {
    return parseMapDocument(stringifyMapDocument(payload.document));
  }
  if (payload?.map && typeof payload.map === "object") {
    const created = createMapDocument(payload.map, payload.options || payload.map.options || {}, payload.presentation || {});
    return validateMapDocumentForExport(created);
  }
  throw new Error("地图存档 Worker 导出缺少 document 或 map");
}

function normalizeExportEncoding(payload) {
  const encoding = String(payload?.encoding || "plain").toLowerCase();
  if (encoding === "plain" || encoding === "json") return "plain";
  if (encoding === "gzip") return "gzip";
  if (encoding === "webfmg" || encoding === "webfmg-v3") return "webfmg-v3";
  throw new Error(`不支持的地图存档导出编码：${payload?.encoding || "未知"}`);
}

function normalizeExportResultType(payload) {
  const resultType = String(payload?.resultType || "bytes").toLowerCase();
  if (["blob", "bytes"].includes(resultType)) return resultType;
  if (resultType === "text" && normalizeExportEncoding(payload) === "plain") return resultType;
  throw new Error(`不支持的地图存档导出结果类型：${payload?.resultType || "未知"}`);
}

async function createExportData(blob, text, resultType) {
  if (resultType === "blob") return blob;
  if (resultType === "text") return text;
  return new Uint8Array(await blob.arrayBuffer());
}

function taskNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function roundTaskMs(value) {
  return Number(Math.max(0, Number(value) || 0).toFixed(1));
}

function isTextChunkPacket(value) {
  return Boolean(value && typeof value === "object" && value.kind === "text-chunks" && Array.isArray(value.chunks)
    && value.chunks.every(chunk => typeof chunk === "string"));
}

function isBinarySource(value) {
  const view = runtimeView();
  return value instanceof view.Blob
    || isBinarySourceValue(value)
    || value?.kind === "bytes";
}

function isBinarySourceValue(value) {
  return value instanceof ArrayBuffer || ArrayBuffer.isView(value);
}

function binarySourceBytes(value) {
  if (value?.kind === "bytes") return value.bytes ?? value.data;
  return value;
}

function assertStringChunks(chunks) {
  if (!chunks.every(chunk => typeof chunk === "string")) throw new Error("地图存档字符串分片必须全部是字符串");
}

function visitTransferableValues(value, buffers, visited) {
  if (!value || typeof value !== "object") return;
  if (value instanceof ArrayBuffer) {
    buffers.add(value);
    return;
  }
  if (ArrayBuffer.isView(value)) {
    if (value.buffer instanceof ArrayBuffer) buffers.add(value.buffer);
    return;
  }
  if (visited.has(value)) return;
  visited.add(value);
  if (value instanceof Blob) return;
  if (value instanceof Map || value instanceof Set) {
    for (const item of value instanceof Map ? [...value.keys(), ...value.values()] : value.values()) {
      visitTransferableValues(item, buffers, visited);
    }
    return;
  }
  for (const item of Object.values(value)) visitTransferableValues(item, buffers, visited);
}

function runtimeView() {
  const view = globalThis;
  if (typeof view.Blob !== "function" || typeof view.TextEncoder !== "function") {
    throw new Error("当前运行环境缺少地图存档 Worker 所需的 Blob 或 TextEncoder");
  }
  return view;
}

async function taskCheckpoint(context) {
  if (context?.signal?.aborted) throw abortError(context.signal.reason);
  if (typeof context?.checkpoint === "function") await context.checkpoint();
  if (context?.signal?.aborted) throw abortError(context.signal.reason);
}

function reportTaskProgress(context, stage, progress, message) {
  if (typeof context?.report === "function") context.report(stage, {progress, message});
}

function abortError(reason) {
  const error = new Error(reason instanceof Error ? reason.message : String(reason || "地图存档任务已取消"));
  error.name = "AbortError";
  if (reason instanceof Error) error.cause = reason;
  return error;
}
