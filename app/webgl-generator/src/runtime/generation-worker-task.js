import {generatePlaceholderMap} from "../generator/index.js";
import {createSampledHeightmapFromPayload} from "../generator/heightmap.js";
import {createMapTemplateHeightmap} from "../generator/map-template-mapping.js";
import {executeRenderPreparationTask} from "../renderer/render-preparation.js";
import {createMapAdoptionHandoff} from "./map-adoption-handoff.js";
import {createMapDocument} from "./map-file-io.js";
import {collectWorkerTransferables} from "./worker-snapshot.js";
import {createWholeMapDocumentMetadata} from "./whole-map-profile-protocol.js";

export const GENERATION_WORKER_TASK = "generation.compute";

export async function runGenerationWorkerTask(payload = {}, context = {}) {
  const options = payload.options;
  if (!options || typeof options !== "object") throw taskError("generation_options_missing", "整图生成缺少生成参数");
  checkpoint(context);
  const heightmap = payload.heightmap || (payload.mapTemplate
    ? createMapTemplateHeightmap(options, payload.mapTemplate.manifest, payload.mapTemplate.resource, payload.mapTemplate.historicalResource)
    : payload.heightmapPayload ? createSampledHeightmapFromPayload(options, payload.heightmapPayload) : null);
  const generatedMap = generatePlaceholderMap(options, {
    ...(heightmap ? {heightmap} : {}),
    onStageStart: stage => context.report?.("generation-stage", {phase: "start", stage}),
    onStageEnd: stage => context.report?.("generation-stage", {phase: "end", stage})
  });
  checkpoint(context);
  const adoption = typeof context.adoptMap === "function";
  const document = adoption ? createMapDocument(generatedMap, generatedMap.options || options) : null;
  const map = document?.map || generatedMap;
  const preparedRender = payload.render
    ? await executeRenderPreparationTask({...payload.render, map}, context)
    : null;
  checkpoint(context);
  if (adoption) {
    const handoffStartedAt = taskNow();
    const handoff = createMapAdoptionHandoff(document);
    context.adoptMap(map);
    checkpoint(context);
    return {
      kind: "map-generation-adoption-result",
      binding: context.binding || null,
      handoff,
      preparedRender,
      metadata: createWholeMapDocumentMetadata(document),
      timings: {handoffEncodeMs: roundTaskMs(taskNow() - handoffStartedAt)}
    };
  }
  return {
    binding: context.binding || null,
    map,
    preparedRender
  };
}

export function collectGenerationWorkerTransferables(result) {
  return collectWorkerTransferables({map: result?.map || null, handoff: result?.handoff || null, preparedRender: result?.preparedRender || null});
}

function taskNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function roundTaskMs(value) {
  return Number(Math.max(0, Number(value) || 0).toFixed(1));
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
