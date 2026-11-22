import {generateMapStages, generatePlaceholderMap} from "../generator/index.js";
import {createSampledHeightmapFromPayload} from "../generator/heightmap.js";
import {createMapTemplateHeightmap} from "../generator/map-template-mapping.js";
import {executeRenderPreparationTask} from "../renderer/render-preparation.js";
import {createGeneratedMapAdoptionPackage, generatedHandoffDigest} from "./map-adoption-handoff.js";
import {createMapDocument} from "./map-file-io.js";
import {normalizeMapForRuntimeAdoption} from "./map-runtime-adoption.js";
import {collectWorkerTransferables} from "./worker-snapshot.js";
import {createWholeMapDocumentMetadata} from "./whole-map-profile-protocol.js";
import {startGenerationTerrainPreparation} from "./generation-terrain-preparation.js";
import {packGeneratedGridRanges, packShoreCellRanges} from "./generated-map-geometry-handoff.js";
import {buildCellAttributeSnapshot} from "../renderer/cell-attribute-store.js";

export const GENERATION_WORKER_TASK = "generation.compute";

export async function runGenerationWorkerTask(payload = {}, context = {}) {
  const render = payload.render;
  const terrain = typeof Worker === "function" && typeof context.adoptMap === "function" && payload.options?.cellsTarget >= 20000
    && render?.surfaceTransferMode === "gpu-resident-compact" && render.surfaceComposition === "core"
    && Array.isArray(render.layers) && !render.layers.includes("political")
    && ["shore", "shore-surface", "surface", "line"].every(layer => render.layers.includes(layer))
    ? startGenerationTerrainPreparation(render) : null;
  try {
    if (terrain) await terrain.ready;
    return await generateAndPrepare(payload, context, terrain);
  } finally {
    terrain?.close();
  }
}

async function generateAndPrepare(payload, context, terrain) {
  const options = payload.options;
  if (!options || typeof options !== "object") throw taskError("generation_options_missing", "整图生成缺少生成参数");
  checkpoint(context);
  const heightmap = payload.heightmap || (payload.mapTemplate
    ? createMapTemplateHeightmap(options, payload.mapTemplate.manifest, payload.mapTemplate.resource, payload.mapTemplate.historicalResource)
    : payload.heightmapPayload ? createSampledHeightmapFromPayload(options, payload.heightmapPayload) : null);
  const overrides = {
    ...(heightmap ? {heightmap} : {}),
    onStageStart: stage => context.report?.("generation-stage", {phase: "start", stage}),
    onStageEnd: stage => context.report?.("generation-stage", {phase: "end", stage})
  };
  let generatedMap;
  if (terrain) {
    const stages = generateMapStages(options, overrides);
    terrain.onTerrainReady(stages.next().value);
    await yieldToTerrain();
    terrain.onShoreObjectsReady(stages.next().value);
    await yieldToTerrain();
    generatedMap = stages.next().value;
  } else {
    generatedMap = generatePlaceholderMap(options, overrides);
  }
  terrain?.finish(generatedMap.layers);
  if (terrain) await yieldToTerrain();
  checkpoint(context);
  const adoption = typeof context.adoptMap === "function";
  const handoffStartedAt = adoption ? taskNow() : 0;
  const adoptionPackage = adoption
    ? createGeneratedMapAdoptionPackage(createMapDocument(generatedMap, generatedMap.options || options), terrain?.gridGeometry)
    : null;
  const document = adoptionPackage?.document || null;
  let handoffDigest = null;
  if (adoptionPackage && payload.parallelHandoff && context.sendGeneratedHandoff && globalThis.crypto?.subtle) {
    handoffDigest = await generatedHandoffDigest(adoptionPackage.handoff);
    context.sendGeneratedHandoff(adoptionPackage.handoff);
  }
  const map = normalizeMapForRuntimeAdoption(document?.map || generatedMap);
  const handoffEncodeMs = adoption ? roundTaskMs(taskNow() - handoffStartedAt) : 0;
  const render = terrain ? {...payload.render, layers: payload.render.layers.filter(layer => !["shore", "shore-surface", "surface"].includes(layer)), lineComposition: "core"} : payload.render;
  const preparedRender = render
    ? await executeRenderPreparationTask({...render, map}, context)
    : null;
  if (render?.surfaceTransferMode === "gpu-resident-compact") preparedRender.layers.cellAttributes = buildCellAttributeSnapshot(map, render.viewOptions);
  const terrainTimings = terrain ? await terrain.merge(preparedRender, map, context.renderCache) : null;
  if (payload.render?.surfaceComposition === "core" && preparedRender?.layers.shoreSurface) {
    const {surface, shoreSurface} = preparedRender.layers;
    const {cellRanges, ...vertices} = shoreSurface;
    Object.assign(surface, vertices, {
      shoreSurfaceCellRanges: packShoreCellRanges(cellRanges),
      smoothShoreSurfaceKey: preparedRender.presentation.display.shoreSurfaceKey,
      shoreSurfaceEnabled: preparedRender.presentation.display.smoothCellBorders
    });
    delete preparedRender.layers.shoreSurface;
    // 连续 grid 范围的起点就是上一格终点，无需传输十万个对象。
    if (surface.surfaceCellRangesMode === "grid-cells" && surface.surfaceCellRanges instanceof Map) {
      surface.surfaceCellRanges = packGeneratedGridRanges(surface.surfaceCellRanges);
    }
  }
  checkpoint(context);
  if (adoption) {
    context.adoptMap(map);
    checkpoint(context);
    return {
      kind: "map-generation-adoption-result",
      binding: context.binding || null,
      handoff: handoffDigest ? null : adoptionPackage.handoff,
      ...(handoffDigest ? {handoffDigest, canonicalDocumentMode: "parallel-main-decode"} : {}),
      preparedRender,
      metadata: createWholeMapDocumentMetadata(document),
      timings: {handoffEncodeMs, ...terrainTimings}
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

function yieldToTerrain() {
  return new Promise(resolve => setTimeout(resolve, 0));
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
