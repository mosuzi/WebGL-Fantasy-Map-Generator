import {generatePlaceholderMap} from "../generator/index.js";
import {createSampledHeightmapFromPayload} from "../generator/heightmap.js";
import {createMapTemplateHeightmap} from "../generator/map-template-mapping.js";
import {executeRenderPreparationTask} from "../renderer/render-preparation.js";
import {collectWorkerTransferables} from "./worker-snapshot.js";

export const GENERATION_WORKER_TASK = "generation.compute";

export async function runGenerationWorkerTask(payload = {}, context = {}) {
  const options = payload.options;
  if (!options || typeof options !== "object") throw taskError("generation_options_missing", "整图生成缺少生成参数");
  checkpoint(context);
  const heightmap = payload.heightmap || (payload.mapTemplate
    ? createMapTemplateHeightmap(options, payload.mapTemplate.manifest, payload.mapTemplate.resource, payload.mapTemplate.historicalResource)
    : payload.heightmapPayload ? createSampledHeightmapFromPayload(options, payload.heightmapPayload) : null);
  const map = generatePlaceholderMap(options, {
    ...(heightmap ? {heightmap} : {}),
    onStageStart: stage => context.report?.("generation-stage", {phase: "start", stage}),
    onStageEnd: stage => context.report?.("generation-stage", {phase: "end", stage})
  });
  checkpoint(context);
  const preparedRender = payload.render
    ? await executeRenderPreparationTask({...payload.render, map}, context)
    : null;
  checkpoint(context);
  return {
    binding: context.binding || null,
    map,
    preparedRender
  };
}

export function collectGenerationWorkerTransferables(result) {
  return collectWorkerTransferables({map: result?.map || null, preparedRender: result?.preparedRender || null});
}

function checkpoint(context) {
  if (context.checkpoint?.() === false || context.signal?.aborted) {
    throw new DOMException(context.signal?.reason || "整图生成已取消", "AbortError");
  }
}

function taskError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
