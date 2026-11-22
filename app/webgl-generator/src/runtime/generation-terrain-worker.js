import {executeRenderPreparationTask, collectRenderPreparationTransfers} from "../renderer/render-preparation.js";
import {attachGeneratedGeometry, packGeneratedGridRanges} from "./generated-map-geometry-handoff.js";
import {prepareShoreVisualPaths} from "../renderer/shore-layer.js";

let map;
let render;
let surface;
let shore;
let finishShorePaths;
const context = {renderCache: {}};
const durations = {};
let pending = Promise.resolve();
self.postMessage({ready: true});
self.onmessage = ({data}) => {
  pending = pending.then(() => prepare(data)).catch(error => {
    self.postMessage({error: error.message});
    self.close();
  });
};

async function prepare(data) {
  const start = performance.now();
  durations[data.stage + "QueueMs"] = Math.max(0, Date.now() - data.sentAt);
  if (data.stage === "terrain") {
    map = data.map;
    render = data.render;
    await attachGeneratedGeometry(map, data.columns, null, true);
    const result = await executeRenderPreparationTask({...render, layers: ["surface"], map}, context);
    surface = result.layers.surface;
    surface.surfaceCellRanges = packGeneratedGridRanges(surface.surfaceCellRanges);
    durations.surfaceMs = performance.now() - start;
    finishShorePaths = prepareShoreVisualPaths(map);
    durations.shoreGeometryMs = performance.now() - start - durations.surfaceMs;
  } else if (data.stage === "objects") {
    map.settlements = data.settlements;
    map.rivers = data.rivers;
    context.renderCache.shore = finishShorePaths();
    finishShorePaths = null;
    const result = await executeRenderPreparationTask({...render, layers: ["shore"], map}, context);
    shore = result.layers.shore;
    durations.shoreMs = performance.now() - start;
  } else if (data.stage === "finish") {
    map.layers = data.layers;
    const fill = await executeRenderPreparationTask({...render, colorMode: "height", layers: ["shore-surface"], map}, context);
    durations.fillMs = performance.now() - start;
    const result = await executeRenderPreparationTask({...render, layers: ["line"], lineComposition: "shore", map}, context);
    const layers = {...result.layers, ...fill.layers, surface, shore};
    durations.lineMs = performance.now() - start - durations.fillMs;
    self.postMessage({layers, durations}, collectRenderPreparationTransfers(layers));
    self.close();
  }
}
