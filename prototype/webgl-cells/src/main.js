import {GraphicsMapRenderer, installCanvasInteractions} from "./renderer.js";
import {MapOverlayManager} from "./overlays.js";
import {DemoEditorController} from "./editors.js";

const canvas = document.getElementById("map-canvas");
const overlayContainer = document.getElementById("map-overlay");
const summary = document.getElementById("summary");
const stats = document.getElementById("stats");
const hoverStats = document.getElementById("hover-stats");
const modeButtons = Array.from(document.querySelectorAll("[data-mode]"));
const fitButton = document.getElementById("fit-view");
const showLandmassInput = document.getElementById("show-landmass");
const showLakesInput = document.getElementById("show-lakes");
const showCoastlineInput = document.getElementById("show-coastline");
const showStateBordersInput = document.getElementById("show-state-borders");
const showProvinceBordersInput = document.getElementById("show-province-borders");
const showRoutesInput = document.getElementById("show-routes");
const showRiversInput = document.getElementById("show-rivers");
const showPrecipitationInput = document.getElementById("show-precipitation");
const showPopulationInput = document.getElementById("show-population");
const showBurgIconsInput = document.getElementById("show-burg-icons");
const showMarkersInput = document.getElementById("show-markers");
const showBurgLabelsInput = document.getElementById("show-burg-labels");
const showStateLabelsInput = document.getElementById("show-state-labels");
const showEmblemsInput = document.getElementById("show-emblems");
const editorElements = {
  toolButtons: Array.from(document.querySelectorAll("[data-editor-tool]")),
  heightButtons: Array.from(document.querySelectorAll("[data-height-action]")),
  stateButtons: Array.from(document.querySelectorAll("[data-state-action]")),
  heightPanel: document.getElementById("height-editor-panel"),
  riverPanel: document.getElementById("river-editor-panel"),
  statePanel: document.getElementById("state-editor-panel"),
  heightRadius: document.getElementById("height-radius"),
  heightStrength: document.getElementById("height-strength"),
  riverAction: document.getElementById("river-action"),
  riverWidth: document.getElementById("river-width"),
  stateColor: document.getElementById("state-color"),
  undo: document.getElementById("editor-undo"),
  reset: document.getElementById("editor-reset"),
  status: document.getElementById("editor-status")
};

const renderer = new GraphicsMapRenderer(canvas);
const overlays = new MapOverlayManager(overlayContainer, renderer);
const editors = new DemoEditorController({renderer, overlays, elements: editorElements, onChange: () => renderStats(renderer.getStats())});
window.__fmgCellRenderer = renderer;
window.__graphicsMapRenderer = renderer;
window.__fmgMapOverlays = overlays;
window.__fmgDemoEditors = editors;
installCanvasInteractions(renderer, {
  onHover: renderHover,
  onPointerDown: event => editors.handlePointerDown(event),
  onPointerMove: event => editors.handlePointerMove(event),
  onPointerUp: event => editors.handlePointerUp(event)
});

const resizeObserver = new ResizeObserver(() => {
  renderer.resize();
  renderStats(renderer.getStats());
});
resizeObserver.observe(canvas);

try {
  const snapshot = await loadSnapshot();
  renderer.loadSnapshot(snapshot);
  overlays.loadSnapshot(snapshot);
  editors.loadSnapshot(snapshot);
  renderer.resize();
  renderSummary(snapshot);
  renderStats(renderer.getStats());
} catch (error) {
  summary.textContent = error instanceof Error ? error.message : String(error);
  console.error(error);
}

for (const button of modeButtons) {
  button.addEventListener("click", () => {
    const mode = button.dataset.mode;
    renderer.setColorMode(mode);
    for (const item of modeButtons) item.classList.toggle("active", item === button);
    renderStats(renderer.getStats());
  });
}

fitButton.addEventListener("click", () => {
  renderer.fitToView();
  renderStats(renderer.getStats());
});

showStateBordersInput.addEventListener("change", () => {
  renderer.setLayerVisible("stateBorders", showStateBordersInput.checked);
  renderStats(renderer.getStats());
});

showProvinceBordersInput.addEventListener("change", () => {
  renderer.setLayerVisible("provinceBorders", showProvinceBordersInput.checked);
  renderStats(renderer.getStats());
});

showRoutesInput.addEventListener("change", () => {
  renderer.setLayerVisible("routes", showRoutesInput.checked);
  renderStats(renderer.getStats());
});

showRiversInput.addEventListener("change", () => {
  renderer.setLayerVisible("rivers", showRiversInput.checked);
  renderStats(renderer.getStats());
});

showPrecipitationInput.addEventListener("change", () => {
  renderer.setLayerVisible("precipitation", showPrecipitationInput.checked);
  renderStats(renderer.getStats());
});

showPopulationInput.addEventListener("change", () => {
  renderer.setLayerVisible("population", showPopulationInput.checked);
  renderStats(renderer.getStats());
});

showBurgIconsInput.addEventListener("change", () => {
  renderer.setLayerVisible("burgIcons", showBurgIconsInput.checked);
  renderStats(renderer.getStats());
});

showMarkersInput.addEventListener("change", () => {
  renderer.setLayerVisible("markers", showMarkersInput.checked);
  renderStats(renderer.getStats());
});

showBurgLabelsInput.addEventListener("change", () => {
  overlays.setVisible("burgLabels", showBurgLabelsInput.checked);
  renderStats(renderer.getStats());
});

showStateLabelsInput.addEventListener("change", () => {
  overlays.setVisible("stateLabels", showStateLabelsInput.checked);
  renderStats(renderer.getStats());
});

showEmblemsInput.addEventListener("change", () => {
  overlays.setVisible("emblems", showEmblemsInput.checked);
  renderStats(renderer.getStats());
});

showLandmassInput.addEventListener("change", () => {
  renderer.setLayerVisible("landmass", showLandmassInput.checked);
  renderStats(renderer.getStats());
});

showLakesInput.addEventListener("change", () => {
  renderer.setLayerVisible("lakes", showLakesInput.checked);
  renderStats(renderer.getStats());
});

showCoastlineInput.addEventListener("change", () => {
  renderer.setLayerVisible("coastline", showCoastlineInput.checked);
  renderStats(renderer.getStats());
});

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
  const gridCells = metadata.gridCells ? `，渲染 ${metadata.gridCells} grid cells` : "";
  summary.textContent = `真实 FMG 快照，目标 ${metadata.cellsTarget} cells，实际 ${metadata.packCells} pack cells${gridCells}。`;
}

function renderStats(rendererStats) {
  if (!rendererStats) return;
  const {metadata, geometry, picking, performance, theme} = rendererStats;
  const overlayStats = overlays.getStats();
  const items = [
    ["当前专题", theme.label],
    ["专题字段", theme.source],
    ["专题值数", formatNumber(theme.stats?.values ?? 0)],
    ["geometry 复用", theme.geometryReuse],
    ["颜色顶点", formatNumber(theme.colorBufferVertices)],
    ["目标 cells", formatNumber(metadata.cellsTarget)],
    ["pack cells", formatNumber(metadata.packCells)],
    ["grid cells", formatNumber(metadata.gridCells ?? geometry.renderCellCount)],
    ["渲染来源", geometry.renderSource],
    ["渲染 cells", formatNumber(geometry.renderCellCount)],
    ["渲染顶点", formatNumber(geometry.renderVertexCount)],
    ["三角形", formatNumber(geometry.triangles)],
    ["GPU 顶点", formatNumber(geometry.vertexCount)],
    ["feature 数", formatNumber(geometry.featureStats.features)],
    ["陆地 feature", formatNumber(geometry.featureStats.landFeatures)],
    ["湖泊 feature", formatNumber(geometry.featureStats.lakeFeatures)],
    ["湖中岛 feature", formatNumber(geometry.featureStats.lakeIslandFeatures)],
    ["湖泊三角形", formatNumber(geometry.lakeTriangles)],
    ["湖中岛三角形", formatNumber(geometry.lakeIslandTriangles)],
    ["海岸线段", formatNumber(geometry.coastlineSegments)],
    ["湖岸线段", formatNumber(geometry.lakeShoreSegments)],
    ["湖泊分组", formatLakeGroups(geometry.featureStats.lakeGroups)],
    ["国家边界线段", formatNumber(geometry.stateBorderSegments)],
    ["省份边界线段", formatNumber(geometry.provinceBorderSegments)],
    ["路线数量", formatNumber(geometry.routeCount)],
    ["路线线段", formatNumber(geometry.routeSegments)],
    ["路线三角形", formatNumber(geometry.routeTriangles)],
    ["路线分组", formatRouteGroups(geometry.routeGroups)],
    ["河流数量", formatNumber(geometry.riverCount)],
    ["河流线段", formatNumber(geometry.riverSegments)],
    ["河流三角形", formatNumber(geometry.riverTriangles)],
    ["河口裁剪", formatNumber(geometry.riverMouthsClipped)],
    ["未入海河段", formatNumber(geometry.riverOpenEnds)],
    ["河流宽度范围", `${formatNumber(geometry.riverMinWidth)} - ${formatNumber(geometry.riverMaxWidth)}`],
    ["降水点", formatNumber(geometry.pointStats.precipitationPoints)],
    ["最大降水", formatNumber(geometry.pointStats.precipitationMax)],
    ["人口 instances", formatNumber(geometry.pointStats.populationInstances)],
    ["农村人口点", formatNumber(geometry.pointStats.ruralPopulationPoints)],
    ["城市人口点", formatNumber(geometry.pointStats.urbanPopulationPoints)],
    ["城市/港口点", formatNumber(geometry.pointStats.burgIcons)],
    ["港口点", formatNumber(geometry.pointStats.portIcons)],
    ["marker 点", formatNumber(geometry.pointStats.markerCount)],
    ["marker 分组", formatPointGroups(geometry.pointStats.markerGroups)],
    ["城市标签", `${formatNumber(overlayStats.burgLabelsVisible)} / ${formatNumber(overlayStats.burgLabelsRendered)} 可见`],
    ["国家标签占位", `${formatNumber(overlayStats.stateLabelsVisible)} / ${formatNumber(overlayStats.stateLabelsRendered)} 可见`],
    ["中文国家/城市名", `${formatNumber(overlayStats.chineseStateLabels)} / ${formatNumber(overlayStats.chineseBurgLabels)}`],
    ["纹章占位", `${formatNumber(overlayStats.emblemsVisible)} / ${formatNumber(overlayStats.emblemsRendered)} 可见`],
    ["overlay 策略", overlayStats.strategy],
    ["索引桶", formatNumber(picking.buckets)],
    ["平均候选", formatNumber(picking.avgCandidates)],
    ["最大候选", formatNumber(picking.maxCandidates)],
    ["构建 ms", formatNumber(performance.buildMs)],
    ["上传 ms", formatNumber(performance.uploadMs)],
    ["专题更新 ms", formatNumber(performance.themeUpdateMs ?? 0)],
    ["绘制 ms", formatNumber(performance.drawMs ?? 0)],
    ["地图尺寸", `${formatNumber(metadata.graphWidth)} x ${formatNumber(metadata.graphHeight)}`]
  ];

  renderDefinitionList(stats, items);
}

function renderHover(cell) {
  if (!cell) {
    const pick = renderer.lastPick;
    const items = [["状态", "未选中"]];
    if (pick) {
      items.push(["候选 cells", formatNumber(pick.pickCandidates)]);
      items.push(["picking ms", formatNumber(pick.pickMs)]);
    }
    renderDefinitionList(hoverStats, items);
    return;
  }

  renderDefinitionList(hoverStats, [
    ["cell id", formatNumber(cell.id)],
    ["高度", formatNumber(cell.height)],
    ["国家", `${cell.stateName} (${cell.stateId})`],
    ["生物群系", `${cell.biomeName} (${cell.biomeId ?? "无"})`],
    ["省份", `${cell.provinceName} (${cell.provinceId ?? "无"})`],
    ["文化", `${cell.cultureName} (${cell.cultureId ?? "无"})`],
    ["宗教", `${cell.religionName} (${cell.religionId ?? "无"})`],
    ["温度", cell.temperature === undefined ? "无" : formatNumber(cell.temperature)],
    ["候选 cells", formatNumber(cell.pickCandidates)],
    ["picking ms", formatNumber(cell.pickMs)],
    ["坐标", `${formatNumber(cell.x)}, ${formatNumber(cell.y)}`]
  ]);
}

function renderDefinitionList(target, items) {
  target.replaceChildren(
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
  return new Intl.NumberFormat("zh-CN", {maximumFractionDigits: 2}).format(value);
}

function formatLakeGroups(groups) {
  const entries = Object.entries(groups || {}).filter(([, count]) => count);
  if (!entries.length) return "无";
  return entries.map(([group, count]) => `${group}:${formatNumber(count)}`).join("，");
}

function formatRouteGroups(groups) {
  const entries = Object.entries(groups || {}).filter(([, count]) => count);
  if (!entries.length) return "无";
  return entries.map(([group, count]) => `${group}:${formatNumber(count)}`).join("，");
}

function formatPointGroups(groups) {
  const entries = Object.entries(groups || {}).filter(([, count]) => count);
  if (!entries.length) return "无";
  return entries
    .slice(0, 6)
    .map(([group, count]) => `${group}:${formatNumber(count)}`)
    .join("，");
}
