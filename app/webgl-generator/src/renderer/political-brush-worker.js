import {buildPoliticalPathsFromEdges, collectPoliticalVisualEdges, PROVINCE_VISUAL_STYLE, STATE_VISUAL_STYLE, pushPoliticalBoundaryStrokes} from "./political-layer.js";
import {createRenderContext} from "./render-context.js";
import {prepareHeightShoreGeometry} from "./shore-layer.js";

let map = null;
let shoreObjects = null;
const boundaries = new Map();

function refreshPaths(field, changed) {
  let index = boundaries.get(field);
  const cells = map.grid.cells;
  if (!index) {
    index = new Map();
    for (const edge of collectPoliticalVisualEdges(map, field)) index.set(edge.cell + ":" + edge.neighbor, edge);
    boundaries.set(field, index);
  } else {
    const candidates = new Set();
    for (const cell of changed) for (const n of cells.c[cell]) {
      const [a, b] = cell < n ? [cell, n] : [n, cell];
      candidates.add(a);
      index.delete(a + ":" + b);
    }
    for (const edge of collectPoliticalVisualEdges(map, field, candidates)) index.set(edge.cell + ":" + edge.neighbor, edge);
  }
  const edges = [...index.values()].sort((a, b) => a.cell - b.cell || cells.c[a.cell].indexOf(a.neighbor) - cells.c[b.cell].indexOf(b.neighbor));
  return {boundaries: buildPoliticalPathsFromEdges(edges)};
}

self.onmessage = event => {
  const data = event.data;
  if (data.type === "init") {
    boundaries.clear();
    map = {
      metadata: data.metadata,
      layers: {ocean: [0, 0, 0, 1]},
      features: {features: data.features},
      grid: {
        metadata: data.gridMetadata,
        refinement: {children: []},
        points: new Array(data.pointCount),
        vertices: {p: new Array(data.vertexCount), c: new Array(data.vertexCount)},
        cells: {
          i: data.indices,
          c: new Array(data.cellCount), v: new Array(data.cellCount),
          p: new Array(data.cellCount), f: new Array(data.cellCount), h: new Array(data.cellCount),
          state: new Array(data.cellCount), province: new Array(data.cellCount)
        }
      }
    };
    return;
  }
  if (data.type === "chunk" && map) {
    const target = data.kind === "cells" ? map.grid.cells : data.kind === "vertices" ? map.grid.vertices : data.kind === "refinement" ? map.grid.refinement : map.grid;
    for (const [field, values] of Object.entries(data.values)) {
      const array = target[field];
      for (let index = 0; index < values.length; index++) array[data.start + index] = values[index];
    }
    return;
  }
  if (data.type === "shore-objects") {
    shoreObjects = data.objects;
    return;
  }
  if (data.type === "prepare-shore" && map) {
    const previous = data.heights.map(([cell]) => map.grid.cells.h[cell]);
    try {
      for (const [cell, height] of data.heights) map.grid.cells.h[cell] = height;
      const result = prepareHeightShoreGeometry(map, data.sources, shoreObjects, data.colors, data.viewOptions);
      const transfers = [...result.lines, ...Object.values(result.surface).filter(ArrayBuffer.isView)].map(array => array.buffer);
      self.postMessage({type: "shore-result", id: data.id, result}, transfers);
    } catch (error) {
      self.postMessage({type: "shore-result", id: data.id, error: error.message});
    } finally {
      data.heights.forEach(([cell], i) => { map.grid.cells.h[cell] = previous[i]; });
    }
    return;
  }
  if (!["refresh", "height"].includes(data.type) || !map) return;
  try {
    for (const change of data.cells) {
      map.grid.cells.state[change[0]] = change[1];
      map.grid.cells.province[change[0]] = change[2];
      map.grid.cells.h[change[0]] = change[3];
    }
    if (data.type === "height") return;
    const changed = data.cells.map(change => change[0]);
    const statePaths = refreshPaths("state", changed);
    const provincePaths = refreshPaths("province", changed);
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
