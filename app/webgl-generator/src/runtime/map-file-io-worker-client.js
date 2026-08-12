import {MAP_FILE_IO_WORKER_OPERATIONS} from "./map-file-io-worker-task.js";

export async function prepareMapFileIoWorkerPayload(payload, options = {}) {
  if (!payload || typeof payload !== "object") throw new Error("地图存档输入必须是对象");
  const operation = String(payload.operation || "");
  const prepared = {...payload};
  const requestedResultType = operation === MAP_FILE_IO_WORKER_OPERATIONS.EXPORT
    ? String(payload.resultType || "bytes").toLowerCase()
    : null;
  if (operation === MAP_FILE_IO_WORKER_OPERATIONS.IMPORT) {
    prepared.input = await prepareImportInput(payload.input ?? payload.source, payload, options);
    delete prepared.source;
  } else if (operation === MAP_FILE_IO_WORKER_OPERATIONS.EXPORT) {
    if (["blob", "text"].includes(requestedResultType)) prepared.resultType = "bytes";
  }
  return {payload: prepared, requestedResultType};
}

export async function restoreMapFileIoWorkerResult(result, prepared, options = {}) {
  const requestedResultType = prepared?.requestedResultType;
  if (!result || requestedResultType === null || requestedResultType === undefined || requestedResultType === "bytes") return result;
  if (!(result.data instanceof Uint8Array)) throw new Error("地图存档处理未返回可恢复的字节结果");
  const BlobType = options.Blob || globalThis.Blob;
  if (typeof BlobType !== "function") throw new Error("当前环境缺少 Blob，无法恢复地图存档输出");
  const blob = new BlobType([result.data], {type: result.mimeType || "application/octet-stream"});
  if (requestedResultType === "blob") return {...result, resultType: "blob", data: blob};
  if (requestedResultType === "text") return {...result, resultType: "text", data: await blob.text()};
  throw new Error(`不支持恢复地图存档输出类型：${requestedResultType}`);
}

async function prepareImportInput(source, payload, options) {
  if (source === undefined || source === null) throw new Error("地图存档缺少输入数据");
  if (typeof source === "string") return chunkText(source, options);
  const BlobType = options.Blob || globalThis.Blob;
  if (typeof BlobType === "function" && source instanceof BlobType) {
    assertNotAborted(options.signal);
    const bytes = new Uint8Array(await source.arrayBuffer());
    assertNotAborted(options.signal);
    return {
      kind: "bytes",
      bytes,
      mimeType: payload.mimeType || source.type || "",
      filename: payload.filename || source.name || ""
    };
  }
  if (Array.isArray(source) && source.every(chunk => typeof chunk === "string")) {
    return {kind: "text-chunks", chunks: [...source]};
  }
  if (source?.kind === "text-chunks" || source?.kind === "bytes" || ArrayBuffer.isView(source) || source instanceof ArrayBuffer) {
    return source;
  }
  return source;
}

async function chunkText(text, options) {
  const chunkChars = Math.max(16 * 1024, Number(options.chunkChars) || 256 * 1024);
  const budgetMs = Math.max(1, Number(options.budgetMs) || 6);
  const yieldToMain = typeof options.yieldToMain === "function" ? options.yieldToMain : defaultYield;
  const chunks = [];
  let deadline = now() + budgetMs;
  for (let offset = 0; offset < text.length; offset += chunkChars) {
    assertNotAborted(options.signal);
    chunks.push(text.slice(offset, offset + chunkChars));
    if (now() < deadline) continue;
    await yieldToMain();
    assertNotAborted(options.signal);
    deadline = now() + budgetMs;
  }
  return {kind: "text-chunks", chunks};
}

function assertNotAborted(signal) {
  if (!signal?.aborted) return true;
  const error = new Error(signal.reason instanceof Error ? signal.reason.message : String(signal.reason || "地图存档任务已取消"));
  error.name = "AbortError";
  error.code = "map-file-worker-client-aborted";
  throw error;
}

function defaultYield() {
  if (typeof globalThis.scheduler?.yield === "function") return globalThis.scheduler.yield();
  return new Promise(resolve => setTimeout(resolve, 0));
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}
