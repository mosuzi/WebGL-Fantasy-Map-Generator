import {generatePlaceholderMap} from "../generator/index.js";
import {createSampledHeightmapFromPayload} from "../generator/heightmap.js";
import {createMapTemplateHeightmap} from "../generator/map-template-mapping.js";

self.addEventListener("message", event => {
  const {type, requestId, options, heightmapPayload, mapTemplate} = event.data || {};
  if (type !== "generate-map") return;

  try {
    const heightmap = mapTemplate
      ? createMapTemplateHeightmap(options, mapTemplate.manifest, mapTemplate.resource, mapTemplate.historicalResource)
      : heightmapPayload ? createSampledHeightmapFromPayload(options, heightmapPayload) : null;
    const map = generatePlaceholderMap(options, {
      ...(heightmap ? {heightmap} : {}),
      onStageStart: stage => self.postMessage({type: "generation-stage", requestId, stage}),
      onStageEnd: stage => self.postMessage({type: "generation-stage-complete", requestId, stage})
    });
    self.postMessage({type: "generated-map", requestId, map});
  } catch (error) {
    self.postMessage({
      type: "generation-error",
      requestId,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : ""
    });
  }
});
