import {generatePlaceholderMap} from "../generator/index.js";

self.addEventListener("message", event => {
  const {type, requestId, options} = event.data || {};
  if (type !== "generate-map") return;

  try {
    const map = generatePlaceholderMap(options, {
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
