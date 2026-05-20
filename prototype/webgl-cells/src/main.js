import {CellWebGLRenderer, installCanvasInteractions} from "./renderer.js";

const canvas = document.getElementById("map-canvas");
const summary = document.getElementById("summary");
const stats = document.getElementById("stats");
const modeButtons = Array.from(document.querySelectorAll("[data-mode]"));
const fitButton = document.getElementById("fit-view");

const renderer = new CellWebGLRenderer(canvas);
window.__fmgCellRenderer = renderer;
installCanvasInteractions(renderer);

const resizeObserver = new ResizeObserver(() => renderer.resize());
resizeObserver.observe(canvas);

try {
  const snapshot = await loadSnapshot();
  renderer.setData(snapshot);
  renderer.resize();
  renderSummary(snapshot);
  renderStats(snapshot, renderer.buffers);
} catch (error) {
  summary.textContent = error instanceof Error ? error.message : String(error);
  console.error(error);
}

for (const button of modeButtons) {
  button.addEventListener("click", () => {
    const mode = button.dataset.mode;
    renderer.setMode(mode);
    for (const item of modeButtons) item.classList.toggle("active", item === button);
  });
}

fitButton.addEventListener("click", () => renderer.fitToView());
window.addEventListener("resize", () => renderer.resize());

async function loadSnapshot() {
  const response = await fetch("./data/sample-map.json");
  if (!response.ok) {
    throw new Error("无法加载 data/sample-map.json，请先运行地图快照导出脚本。");
  }
  return await response.json();
}

function renderSummary(snapshot) {
  const {metadata} = snapshot;
  summary.textContent = `真实 FMG 快照，目标 ${metadata.cellsTarget} cells，实际 ${metadata.packCells} cells。`;
}

function renderStats(snapshot, buffers) {
  const {metadata} = snapshot;
  const items = [
    ["目标 cells", formatNumber(metadata.cellsTarget)],
    ["实际 cells", formatNumber(metadata.packCells)],
    ["顶点数", formatNumber(metadata.vertices)],
    ["三角形", formatNumber(buffers.vertexCount / 3)],
    ["GPU 顶点", formatNumber(buffers.vertexCount)],
    ["地图尺寸", `${formatNumber(metadata.graphWidth)} x ${formatNumber(metadata.graphHeight)}`]
  ];

  stats.replaceChildren(
    ...items.map(([label, value]) => {
      const row = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = label;
      dd.textContent = value;
      row.append(dt, dd);
      return row;
    })
  );
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN", {maximumFractionDigits: 0}).format(value);
}
