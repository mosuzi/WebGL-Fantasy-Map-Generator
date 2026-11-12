import {buildProvinceVisualPaths, buildStateVisualPaths, PROVINCE_VISUAL_STYLE, STATE_VISUAL_STYLE, pushPoliticalBoundaryStrokes} from "./political-layer.js";
import {createRenderContext} from "./render-context.js";

let map = null;

self.onmessage = event => {
  const data = event.data;
  if (data.type === "init") {
    map = {
      metadata: data.metadata,
      features: {features: data.features},
      grid: {
        points: new Array(data.pointCount),
        vertices: {p: new Array(data.vertexCount), c: new Array(data.vertexCount)},
        cells: {
          i: data.indices,
          c: new Array(data.cellCount), v: new Array(data.cellCount),
          p: new Array(data.cellCount), f: new Array(data.cellCount),
          state: new Array(data.cellCount), province: new Array(data.cellCount)
        }
      }
    };
    return;
  }
  if (data.type === "chunk" && map) {
    const target = data.kind === "cells" ? map.grid.cells : data.kind === "vertices" ? map.grid.vertices : map.grid;
    for (const [field, values] of Object.entries(data.values)) {
      const array = target[field];
      for (let index = 0; index < values.length; index++) array[data.start + index] = values[index];
    }
    return;
  }
  if (data.type !== "refresh" || !map) return;
  try {
    for (const change of data.cells) {
      map.grid.cells.state[change[0]] = change[1];
      map.grid.cells.province[change[0]] = change[2];
    }
    const statePaths = buildStateVisualPaths(map);
    const provincePaths = buildProvinceVisualPaths(map);
    const vertices = [];
    const context = createRenderContext(map);
    if (data.visibility.provinceBorders) {
      pushPoliticalBoundaryStrokes(vertices, provincePaths, context, data.colors.province, PROVINCE_VISUAL_STYLE.borderWidthWorld, PROVINCE_VISUAL_STYLE.borderDashWorld);
    }
    if (data.visibility.stateBorders) {
      pushPoliticalBoundaryStrokes(vertices, statePaths, context, data.colors.state, STATE_VISUAL_STYLE.borderWidthWorld);
    }
    const politicalVertices = new Float32Array(vertices);
    self.postMessage({type: "result", generation: data.generation, request: data.request, statePaths, provincePaths, politicalVertices}, [politicalVertices.buffer]);
  } catch (error) {
    self.postMessage({type: "error", generation: data.generation, request: data.request, message: error?.message || String(error)});
  }
};
