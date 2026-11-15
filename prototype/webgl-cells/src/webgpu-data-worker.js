import {buildCellBuffers} from "./buffers.js";
import {buildThemeColors} from "./themes.js";

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
    const geometry = {
      positions: buffers.positions,
      heightColors: buffers.themeColors,
      statesColors,
      vertexCount: buffers.vertexCount,
      renderCellCount: buffers.renderCellCount
    };
    self.postMessage({type: "ready", metadata: snapshot.metadata, geometry, timings: {parseMs, buildMs, colorsMs}}, [geometry.positions.buffer, geometry.heightColors.buffer, geometry.statesColors.buffer]);
  } catch (error) {
    self.postMessage({type: "error", message: error.message || String(error)});
  }
};
