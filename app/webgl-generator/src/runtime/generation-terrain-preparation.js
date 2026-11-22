import {detachGeneratedGeometry} from "./generated-map-geometry-handoff.js";
import {recolorShoreSurfaceVertexLayers} from "../renderer/shore-layer.js";
import {unpackShoreVisualPaths} from "../renderer/render-cache-dto.js";

export function startGenerationTerrainPreparation(render) {
  const worker = new Worker(new URL("./generation-terrain-worker.js", import.meta.url), {type: "module"});
  let gridGeometry;
  let signalReady;
  const ready = new Promise(resolve => { signalReady = resolve; });
  const result = new Promise((resolve, reject) => {
    worker.onmessage = ({data}) => {
      if (data.ready) signalReady();
      else if (data.error) reject(new Error(data.error));
      else resolve(data);
    };
    worker.onerror = event => reject(new Error(event.message || "地形准备失败"));
    worker.onmessageerror = () => reject(new Error("地形准备结果无效"));
  });
  result.catch(() => {}); // 生成本身可能先失败，统一在作用域退出时释放。
  return {
    get gridGeometry() { return gridGeometry; },
    ready: Promise.race([ready, result]),
    onTerrainReady({grid, features, options}) {
      const {i, p, h, f, c, v} = grid.cells;
      const map = {metadata: {seed: options.seed, graphWidth: options.graphWidth, graphHeight: options.graphHeight},
        grid: {metadata: grid.metadata, points: grid.points, vertices: grid.vertices, boundary: grid.boundary, cells: {i, p, h, f, c, v}},
        features: {features: features.features.map(entry => entry && {land: entry.land, type: entry.type})}};
      const geometry = detachGeneratedGeometry({map}, true);
      gridGeometry = {grid, columns: geometry.columns};
      worker.postMessage({stage: "terrain", sentAt: Date.now(), render, map: geometry.document.map, columns: geometry.columns});
    },
    onShoreObjectsReady({settlements, rivers}) {
      worker.postMessage({stage: "objects", sentAt: Date.now(), settlements: {
        cities: settlements.cities.map(city => city && {x: city.x, y: city.y}),
        routes: settlements.routes.map(route => route && {points: route.points})
      }, rivers: {rivers: rivers.rivers.map(river => river && {points: river.points})}});
    },
    finish(layers) { worker.postMessage({stage: "finish", sentAt: Date.now(), layers}); },
    async merge(prepared, map, cache) {
      const {layers: terrain, durations} = await result;
      const {shoreVertices, gpuResidentSmoothShoreVertices, gpuResidentHardShoreVertices, shorePathCache} = terrain.line;
      Object.assign(prepared.layers.line, {shoreVertices, gpuResidentSmoothShoreVertices, gpuResidentHardShoreVertices, shorePathCache});
      prepared.layers.surface = terrain.surface;
      prepared.layers.shore = terrain.shore;
      prepared.layers.shoreSurface = render.colorMode === "height" ? terrain.shoreSurface
        : await recolorShoreSurfaceVertexLayers(terrain.shoreSurface, map, render.colorMode, render.viewOptions, {yieldToMain: () => Promise.resolve()});
      if (!prepared.layers.shoreSurface) throw new Error("岸线颜色范围无效");
      if (cache) cache.shore = unpackShoreVisualPaths(terrain.shore, render.binding);
      prepared.cache.shore = true;
      return durations;
    },
    close() { worker.terminate(); }
  };
}
