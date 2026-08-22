import {
  HEIGHTMAP_EXPORT_WORKER_REQUEST,
  HEIGHTMAP_EXPORT_WORKER_RESULT,
  runHeightmapExportWorkerTask
} from "./heightmap-export-worker-task.js";

self.onmessage = async event => {
  const request = event?.data;
  if (request?.type !== HEIGHTMAP_EXPORT_WORKER_REQUEST) return;
  try {
    const result = await runHeightmapExportWorkerTask(request);
    self.postMessage({type: HEIGHTMAP_EXPORT_WORKER_RESULT, ok: true, result});
  } catch (error) {
    self.postMessage({
      type: HEIGHTMAP_EXPORT_WORKER_RESULT,
      ok: false,
      error: {
        name: String(error?.name || "Error"),
        code: String(error?.code || "heightmap_export_worker_error"),
        message: String(error?.message || error || "高度图导出 Worker 失败")
      }
    });
  }
};
