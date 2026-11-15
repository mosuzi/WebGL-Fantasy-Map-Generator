import {buildCellBuffers} from "./buffers.js";
import {buildThemeColors} from "./themes.js";
import {buildComplexScene} from "./webgpu-scene.js";

self.onmessage = async event => {
  if (event.data?.type !== "load") return;
  try {
    const response = await fetch(new URL("../data/sample-map.json", import.meta.url));
    if (!response.ok) throw new Error(`固定快照加载失败（HTTP ${response.status}）`);
    const parseStart = performance.now();
    const snapshot = await response.json();
    const parseMs = performance.now() - parseStart;
    const buildStart = performance.now();
    const buffers = buildCellBuffers(snapshot, "height");
    const buildMs = performance.now() - buildStart;
    const colorsStart = performance.now();
    const statesColors = buildThemeColors(snapshot, buffers.cellRanges, "states");
    const colorsMs = performance.now() - colorsStart;
    const sceneStart = performance.now();
    const scene = buildComplexScene(snapshot, buffers);
    const sceneMs = performance.now() - sceneStart;
    const geometry = {
      positions: buffers.positions,
      heightColors: buffers.themeColors,
      statesColors,
      vertexCount: buffers.vertexCount,
      renderCellCount: buffers.renderCellCount,
      scene
    };
    const transfer = [geometry.positions.buffer, geometry.heightColors.buffer, geometry.statesColors.buffer, scene.rawStateBorders.buffer];
    for (const layer of Object.values(scene.layers)) {
      for (const mesh of [layer.hard, layer.smooth, layer].filter(Boolean)) {
        if (!mesh.positions || !mesh.colors) continue;
        transfer.push(mesh.positions.buffer, mesh.colors.buffer);
      }
    }
    self.postMessage({type: "ready", metadata: snapshot.metadata, geometry, timings: {parseMs, buildMs, colorsMs, sceneMs}}, transfer);
  } catch (error) {
    self.postMessage({type: "error", message: error.message || String(error)});
  }
};
