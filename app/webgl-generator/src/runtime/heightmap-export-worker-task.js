import {createHeightmapPngBlob} from "./map-file-io.js";

export const HEIGHTMAP_EXPORT_WORKER_REQUEST = "heightmap-export";
export const HEIGHTMAP_EXPORT_WORKER_RESULT = "heightmap-export-result";

export async function runHeightmapExportWorkerTask(request, options = {}) {
  if (request?.type !== HEIGHTMAP_EXPORT_WORKER_REQUEST) throw workerError("heightmap_export_worker_protocol", "高度图导出 Worker 请求无效");
  const documentRef = options.documentRef || createWorkerDocument();
  const result = await createHeightmapPngBlob(documentRef, request.map, request.options || {});
  const {canvas: _canvas, ...transferableResult} = result;
  return transferableResult;
}

function createWorkerDocument() {
  return {
    defaultView: globalThis,
    createElement() {
      throw workerError("heightmap_export_worker_unsupported", "当前 Worker 不支持 OffscreenCanvas 高度图导出");
    }
  };
}

function workerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
