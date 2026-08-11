import {
  createCompressedMapDocumentBlob,
  createMapDocument,
  parseMapDocument,
  parseMapDocumentPayload,
  stringifyMapDocument
} from "./map-file-io.js";
import {
  BROWSER_MAP_STORAGE_TYPE,
  decodeBrowserMapStoragePayload
} from "./browser-map-storage.js";
import {isCompressedMapDocumentFilename} from "./map-filename.js";

export const MAP_FILE_IO_WORKER_TASK_TYPE = "map-file-io";
export const MAP_FILE_IO_WORKER_OPERATIONS = Object.freeze({
  IMPORT: "import",
  EXPORT: "export"
});

export async function runMapFileIoWorkerTask(payload, context = {}) {
  const operation = String(payload?.operation || "");
  if (operation === MAP_FILE_IO_WORKER_OPERATIONS.IMPORT) return importMapFile(payload, context);
  if (operation === MAP_FILE_IO_WORKER_OPERATIONS.EXPORT) return exportMapFile(payload, context);
  throw new Error(`不支持的地图存档 Worker 操作：${operation || "未知"}`);
}

export function collectMapFileIoWorkerTransferables(result) {
  const buffers = new Set();
  const visited = new WeakSet();
  visitTransferableValues(result, buffers, visited);
  return [...buffers];
}

async function importMapFile(payload, context) {
  await taskCheckpoint(context);
  reportTaskProgress(context, "read", 0.05, "读取地图存档输入");
  const source = normalizeImportSource(payload);
  await taskCheckpoint(context);

  reportTaskProgress(context, "parse", 0.45, "解析、迁移并校验地图文档");
  const document = await parseImportSource(source, payload);
  await taskCheckpoint(context);

  reportTaskProgress(context, "complete", 1, "地图存档解析完成");
  return {
    kind: "map-file-import-result",
    document,
    map: document.map,
    metadata: mapDocumentMetadata(document)
  };
}

async function exportMapFile(payload, context) {
  await taskCheckpoint(context);
  reportTaskProgress(context, "normalize", 0.08, "规范化并校验地图文档");
  const document = normalizeExportDocument(payload);
  await taskCheckpoint(context);

  reportTaskProgress(context, "stringify", 0.42, "序列化地图文档");
  const text = stringifyMapDocument(document);
  await taskCheckpoint(context);

  const encoding = normalizeExportEncoding(payload);
  const resultType = normalizeExportResultType(payload);
  const view = runtimeView();
  let blob;
  let originalBytes;
  if (encoding === "gzip") {
    reportTaskProgress(context, "compress", 0.68, "压缩地图文档");
    const compressed = await createCompressedMapDocumentBlob({defaultView: view}, document);
    blob = compressed.blob;
    originalBytes = compressed.originalBytes;
  } else {
    originalBytes = new view.TextEncoder().encode(text).byteLength;
    blob = new view.Blob([text], {type: "application/json;charset=utf-8"});
  }
  await taskCheckpoint(context);

  reportTaskProgress(context, "package", 0.9, "封装地图存档输出");
  const data = await createExportData(blob, text, resultType);
  await taskCheckpoint(context);
  reportTaskProgress(context, "complete", 1, "地图存档序列化完成");
  return {
    kind: "map-file-export-result",
    encoding,
    resultType,
    mimeType: encoding === "gzip" ? "application/gzip" : "application/json;charset=utf-8",
    originalBytes,
    bytes: blob.size,
    data,
    metadata: mapDocumentMetadata(document)
  };
}

function normalizeImportSource(payload) {
  if (!payload || typeof payload !== "object") throw new Error("地图存档 Worker 输入必须是对象");
  const source = payload.input ?? payload.source;
  if (source === undefined || source === null) throw new Error("地图存档 Worker 缺少输入数据");
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
  if (typeof source === "string") {
    const text = await decodeBrowserStorageEnvelope(source, view);
    return parseMapDocument(text);
  }
  if (source?.type === BROWSER_MAP_STORAGE_TYPE) {
    const text = await decodeBrowserMapStoragePayload({defaultView: view}, JSON.stringify(source));
    return parseMapDocument(text);
  }
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
      return parseMapDocumentPayload({defaultView: view}, new view.Blob([blob], {type: "application/gzip"}));
    }
    return parseMapDocumentPayload({defaultView: view}, blob);
  }
  if (source?.encoding === "plain" || source?.encoding === "gzip-base64" || typeof source?.base64 === "string") {
    return parseMapDocumentPayload({defaultView: view}, source);
  }
  if (typeof source === "object" && !Array.isArray(source)) {
    return parseMapDocument(stringifyMapDocument(source));
  }
  throw new Error("地图存档 Worker 输入必须是 JSON、File/Blob、字节或分片字符串");
}

async function decodeBrowserStorageEnvelope(text, view) {
  if (!text.includes(BROWSER_MAP_STORAGE_TYPE)) return text;
  return decodeBrowserMapStoragePayload({defaultView: view}, text);
}

function normalizeExportDocument(payload) {
  if (payload?.document && typeof payload.document === "object") {
    return parseMapDocument(stringifyMapDocument(payload.document));
  }
  if (payload?.map && typeof payload.map === "object") {
    const created = createMapDocument(payload.map, payload.options || payload.map.options || {});
    return parseMapDocument(stringifyMapDocument(created));
  }
  throw new Error("地图存档 Worker 导出缺少 document 或 map");
}

function normalizeExportEncoding(payload) {
  const encoding = String(payload?.encoding || "plain").toLowerCase();
  if (encoding === "plain" || encoding === "json") return "plain";
  if (encoding === "gzip" || encoding === "webfmg") return "gzip";
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

function mapDocumentMetadata(document) {
  return {
    version: Number(document?.version) || 0,
    schemaVersion: Number(document?.map?.metadata?.schemaVersion) || 0,
    seed: String(document?.map?.metadata?.seed || document?.metadata?.seed || ""),
    checksum: String(document?.map?.metadata?.checksum || document?.map?.summary?.checksum || document?.metadata?.checksum || ""),
    gridCells: Number(document?.map?.metadata?.gridCells || document?.map?.grid?.metadata?.actualCells || document?.map?.grid?.cells?.i?.length || document?.map?.grid?.cells?.h?.length || 0),
    packCells: Number(document?.map?.metadata?.packCells || document?.map?.pack?.metadata?.cells || document?.map?.pack?.cells?.i?.length || 0)
  };
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
  const error = new Error(reason instanceof Error ? reason.message : String(reason || "地图存档 Worker 任务已取消"));
  error.name = "AbortError";
  if (reason instanceof Error) error.cause = reason;
  return error;
}
