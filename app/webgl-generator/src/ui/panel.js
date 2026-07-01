import {patchGlobalConfigPreferences, readGlobalConfigPreferences, setGlobalConfigLayerVisible} from "./vue/state-bridge.js";
import {OBJECT_KIND} from "../runtime/object-kinds.js";

const CONTROL_PREFERENCES_KEY = "webgl-generator-control-preferences";

const OBJECT_TITLE_FORMATTERS = Object.freeze({
  [OBJECT_KIND.CITY]: object => `城市 ${object.name}`,
  [OBJECT_KIND.LABEL]: object => `标签 ${object.text}`,
  [OBJECT_KIND.MARKER]: object => `标记 ${object.name}`,
  [OBJECT_KIND.ROUTE]: object => `路线 ${object.from} -> ${object.to}`,
  [OBJECT_KIND.RIVER]: object => `河流 #${object.id}`,
  [OBJECT_KIND.STATE]: object => `国家 ${object.name}`,
  [OBJECT_KIND.PROVINCE]: object => `省份 ${object.name}`,
  [OBJECT_KIND.CULTURE]: object => `文化 ${object.name}`,
  [OBJECT_KIND.RELIGION]: object => `宗教 ${object.name}`,
  [OBJECT_KIND.REGION]: object => `区域 ${object.name}`
});

const OBJECT_DETAIL_FORMATTERS = Object.freeze({
  [OBJECT_KIND.CITY]: object => `${object.type} / pop ${object.population} / ${object.state}`,
  [OBJECT_KIND.LABEL]: object => `${object.targetKind} / ${object.targetName}`,
  [OBJECT_KIND.MARKER]: object => formatMarkerObjectSummary(object),
  [OBJECT_KIND.ROUTE]: object => `${object.type} / ${object.level} / distance ${formatDistance(object.distance)}`,
  [OBJECT_KIND.RIVER]: object => `${object.type} / flux ${object.flux} / length ${object.length}`,
  [OBJECT_KIND.STATE]: object => `${object.culture} / ${object.religion}`,
  [OBJECT_KIND.PROVINCE]: object => `${object.state}`,
  [OBJECT_KIND.CULTURE]: object => `${object.type} / cells ${object.cells} / pop ${object.population}`,
  [OBJECT_KIND.RELIGION]: object => `${object.type} / ${object.form} / cells ${object.cells}`,
  [OBJECT_KIND.REGION]: object => `region #${object.id}`
});

const DERIVED_STALE_LABELS = Object.freeze({
  cities: "城镇",
  provinces: "省份",
  states: "国家",
  religions: "宗教",
  markers: "标记",
  zones: "区域",
  military: "军事",
  economy: "经济",
  "state-markers": "国家中心标记"
});

export function bindRuntimePanel(documentRef, handlers) {
  applyControlPreferences(documentRef);
  documentRef.getElementById("generate-map").addEventListener("click", handlers.onGenerate);
  documentRef.getElementById("random-seed").addEventListener("click", handlers.onRandomSeed);
  documentRef.getElementById("open-generation-panel")?.addEventListener("click", handlers.onOpenGenerationPanel);
  documentRef.getElementById("fit-view").addEventListener("click", handlers.onFitView);
  documentRef.getElementById("show-ocean-height")?.addEventListener("change", event => {
    updateControlPreferences(documentRef, {showOceanHeight: event.target.checked});
    handlers.onShowOceanHeight?.(event.target.checked);
  });
  documentRef.getElementById("smooth-cell-borders")?.addEventListener("change", event => {
    updateControlPreferences(documentRef, {smoothCellBorders: event.target.checked});
    handlers.onSmoothCellBorders?.(event.target.checked);
  });
  bindBooleanPreferenceButton(documentRef, "show-hover-info", "showHoverInfo", handlers.onShowHoverInfo);
  documentRef.getElementById("max-city-labels")?.addEventListener("input", event => {
    const value = normalizeMaxCityLabels(event.target.value);
    setLabelLimitControlValue(documentRef, value);
    updateControlPreferences(documentRef, {maxCityLabels: value});
    handlers.onMaxCityLabels?.(value);
  });
  documentRef.getElementById("open-height-panel")?.addEventListener("click", handlers.onOpenHeightPanel);
  documentRef.getElementById("open-state-panel")?.addEventListener("click", handlers.onOpenStatePanel);
  documentRef.getElementById("open-province-panel")?.addEventListener("click", handlers.onOpenProvincePanel);
  documentRef.getElementById("open-city-panel")?.addEventListener("click", handlers.onOpenCityPanel);
  documentRef.getElementById("open-culture-panel")?.addEventListener("click", handlers.onOpenCulturePanel);
  documentRef.getElementById("open-religion-panel")?.addEventListener("click", handlers.onOpenReligionPanel);
  documentRef.getElementById("open-route-panel")?.addEventListener("click", handlers.onOpenRoutePanel);
  documentRef.getElementById("open-river-panel")?.addEventListener("click", handlers.onOpenRiverPanel);
  documentRef.getElementById("open-label-naming-panel")?.addEventListener("click", handlers.onOpenLabelNamingPanel);
  for (const button of documentRef.querySelectorAll("[data-regenerate-kind]")) {
    button.addEventListener("click", () => handlers.onRegenerate?.(button.dataset.regenerateKind));
  }
  for (const control of documentRef.querySelectorAll("[data-layer]")) {
    if (control.tagName === "BUTTON") {
      control.addEventListener("click", () => {
        const visible = control.getAttribute("aria-pressed") !== "true";
        setLayerControlState(control, visible);
        updateLayerPreference(documentRef, control.dataset.layer, visible);
        handlers.onLayerVisible?.(control.dataset.layer, visible);
      });
    } else {
      control.addEventListener("change", () => {
        updateLayerPreference(documentRef, control.dataset.layer, control.checked);
        handlers.onLayerVisible?.(control.dataset.layer, control.checked);
      });
    }
  }
  for (const button of documentRef.querySelectorAll("[data-mode]")) {
    button.addEventListener("click", () => {
      setActiveModeButton(documentRef, button.dataset.mode);
      handlers.onMode(button.dataset.mode);
    });
  }
}

export function setActiveModeButton(documentRef, mode) {
  documentRef.querySelectorAll("[data-mode]").forEach(item => item.classList.toggle("active", item.dataset.mode === mode));
  updateControlPreferences(documentRef, {colorMode: mode});
}

export function readControlPreferences(documentRef) {
  const storePreferences = readGlobalConfigPreferences();
  if (storePreferences) return storePreferences;
  try {
    const raw = documentRef.defaultView?.localStorage?.getItem(CONTROL_PREFERENCES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return normalizeControlPreferences(parsed);
  } catch {
    return {};
  }
}

export function setEditingInteractionLock(documentRef, locked, {allowedPanelIds = []} = {}) {
  documentRef.body.classList.toggle("editing-locked", locked);
  for (const control of editLockControls(documentRef)) {
    control.disabled = locked;
    control.dataset.editLockDisabled = locked ? "true" : "false";
  }
  for (const panel of documentRef.querySelectorAll(".floating-panel[data-panel-id]")) {
    const allowed = !locked || allowedPanelIds.includes(panel.dataset.panelId);
    panel.classList.toggle("editing-panel-disabled", !allowed);
    for (const control of panel.querySelectorAll("button, input, select, textarea")) {
      if (control.classList.contains("floating-panel-close")) continue;
      control.disabled = !allowed;
      control.dataset.editLockDisabled = !allowed ? "true" : "false";
    }
  }
}

function editLockControls(documentRef) {
  return documentRef.querySelectorAll([
    "#generate-map",
    "#random-seed",
    "#open-generation-panel",
    "#fit-view",
    "#open-height-panel",
    "#open-state-panel",
    "#open-province-panel",
    "#open-city-panel",
    "#open-culture-panel",
    "#open-religion-panel",
    "#open-route-panel",
    "#open-river-panel",
    "#open-label-naming-panel",
    "[data-regenerate-kind]",
    "#seed-input",
    "#cells-input",
    "#width-input",
    "#height-input",
    "#heightmap-template",
    "#auto-random-seed",
    "#show-ocean-height",
    "#smooth-cell-borders",
    "#show-hover-info",
    "#max-city-labels",
    "[data-layer]",
    "[data-mode]"
  ].join(", "));
}

function applyControlPreferences(documentRef) {
  const preferences = readControlPreferences(documentRef);
  if (typeof preferences.colorMode === "string") {
    documentRef.querySelectorAll("[data-mode]").forEach(item => item.classList.toggle("active", item.dataset.mode === preferences.colorMode));
  }
  if (typeof preferences.showOceanHeight === "boolean") {
    const input = documentRef.getElementById("show-ocean-height");
    if (input) input.checked = preferences.showOceanHeight;
  }
  if (typeof preferences.smoothCellBorders === "boolean") {
    const input = documentRef.getElementById("smooth-cell-borders");
    if (input) input.checked = preferences.smoothCellBorders;
  }
  if (typeof preferences.showHoverInfo === "boolean") {
    const control = documentRef.getElementById("show-hover-info");
    if (control) setBooleanControlState(control, preferences.showHoverInfo);
  }
  if (typeof preferences.maxCityLabels === "number") {
    setLabelLimitControlValue(documentRef, preferences.maxCityLabels);
  }
  for (const [layer, visible] of Object.entries(preferences.layers || {})) {
    const control = documentRef.querySelector(`[data-layer="${cssEscape(layer)}"]`);
    if (!control) continue;
    if (control.tagName === "BUTTON") setLayerControlState(control, visible);
    else control.checked = Boolean(visible);
  }
}

function setLabelLimitControlValue(documentRef, value) {
  const normalized = normalizeMaxCityLabels(value);
  const input = documentRef.getElementById("max-city-labels");
  const output = documentRef.getElementById("max-city-labels-value");
  if (input) input.value = String(normalized);
  if (output) output.textContent = String(normalized);
}

function normalizeMaxCityLabels(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 5000;
  return Math.max(8, Math.min(5000, Math.round(number)));
}

function setLayerControlState(control, visible) {
  setBooleanControlState(control, visible);
}

function setBooleanControlState(control, visible) {
  const enabled = Boolean(visible);
  if (control.tagName === "BUTTON") {
    control.classList.toggle("active", enabled);
    control.setAttribute("aria-pressed", enabled ? "true" : "false");
    return;
  }
  control.checked = enabled;
}

function bindBooleanPreferenceButton(documentRef, id, preferenceKey, handler) {
  const control = documentRef.getElementById(id);
  if (!control) return;
  if (control.tagName === "BUTTON") {
    control.addEventListener("click", () => {
      const enabled = control.getAttribute("aria-pressed") !== "true";
      setBooleanControlState(control, enabled);
      updateControlPreferences(documentRef, {[preferenceKey]: enabled});
      handler?.(enabled);
    });
    return;
  }
  control.addEventListener("change", event => {
    updateControlPreferences(documentRef, {[preferenceKey]: event.target.checked});
    handler?.(event.target.checked);
  });
}

function updateLayerPreference(documentRef, layer, visible) {
  if (!layer) return;
  const patch = layerVisibilityPreferencePatch(layer, visible);
  if (setGlobalConfigLayerVisible(layer, visible)) return;
  const preferences = readControlPreferences(documentRef);
  updateControlPreferences(documentRef, {layers: {...(preferences.layers || {}), ...patch}});
}

function layerVisibilityPreferencePatch(layer, visible) {
  const value = Boolean(visible);
  return layer === "coastline" ? {coastline: value, lakeShore: value} : {[layer]: value};
}

function updateControlPreferences(documentRef, patch) {
  if (patchGlobalConfigPreferences(patch)) return;
  try {
    const storage = documentRef.defaultView?.localStorage;
    if (!storage) return;
    const current = readControlPreferences(documentRef);
    const preferences = normalizeControlPreferences({
      ...current,
      ...patch,
      layers: patch.layers ? {...(current.layers || {}), ...patch.layers} : current.layers || {}
    });
    storage.setItem(CONTROL_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // localStorage may be unavailable in restricted browser modes.
  }
}

function normalizeControlPreferences(preferences) {
  if (!preferences || typeof preferences !== "object") return {};
  const normalized = {...preferences};
  if (normalized.layers && typeof normalized.layers === "object") {
    normalized.layers = {...normalized.layers};
    if (Object.prototype.hasOwnProperty.call(normalized.layers, "coastline")) {
      normalized.layers.lakeShore = normalized.layers.coastline;
    }
  }
  return normalized;
}

function cssEscape(value) {
  if (globalThis.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}

export function updateRegenerationSection(documentRef, result = {}) {
  const status = documentRef.getElementById("regeneration-status");
  const constraint = documentRef.getElementById("regeneration-constraint");
  if (status) status.textContent = result.status || "待命";
  if (constraint) constraint.textContent = result.constraint || "国家、省份、城镇、道路、河流会按各自生成约束逐步接入；资源 marker 已随生成接入，marker / zone 的局部重算另行推进。";
}

export function setGenerationLoading(documentRef, visible, message = "正在生成地图") {
  const bubble = documentRef.getElementById("generation-loading");
  if (!bubble) return;
  const text = documentRef.getElementById("generation-loading-text");
  if (text) text.textContent = message;
  bubble.hidden = !visible;
}

export function readOptionsFromPanel(documentRef, previousOptions) {
  return {
    ...previousOptions,
    seed: documentRef.getElementById("seed-input").value,
    randomSeed: documentRef.getElementById("auto-random-seed").checked,
    heightmapTemplate: documentRef.getElementById("heightmap-template").value,
    cellsTarget: documentRef.getElementById("cells-input").value,
    graphWidth: documentRef.getElementById("width-input").value,
    graphHeight: documentRef.getElementById("height-input").value
  };
}

export function setSeedInput(documentRef, seed) {
  documentRef.getElementById("seed-input").value = seed;
}

export function updateRuntimePanel(documentRef, state) {
  const {map, renderer} = state;
  const stats = renderer.getStats();
  syncLabelLimitControlBounds(documentRef, map, stats);
  documentRef.getElementById("app-status").textContent = `${map.status.message}，seed ${map.metadata.seed}`;
  documentRef.getElementById("map-badge").textContent = `${map.metadata.graphWidth} x ${map.metadata.graphHeight} / ${map.metadata.cellsTarget} cells`;
  updateMapLegend(documentRef, map, stats.colorMode);
  documentRef.getElementById("runtime-stats").replaceChildren(
    statRow(documentRef, "阶段", map.metadata.generatorStage),
    statRow(documentRef, "生成耗时", formatGenerationTiming(map.metadata.generationTiming)),
    statRow(documentRef, "WebGL 加载", formatGenerationTiming(stats.loadMap)),
    statRow(documentRef, "Seed", map.metadata.seed),
    statRow(documentRef, "自动随机", map.options.randomSeed ? "是" : "否"),
    statRow(documentRef, "地形模板", map.heightmap.name),
    statRow(documentRef, "目标 cells", map.metadata.cellsTarget),
    statRow(documentRef, "实际 grid cells", map.metadata.gridCells),
    statRow(documentRef, "pack cells", map.metadata.packCells),
    statRow(documentRef, "地图尺寸", `${map.metadata.graphWidth} x ${map.metadata.graphHeight}`),
    statRow(documentRef, "grid 布局", `${map.grid.metadata.columns} x ${map.grid.metadata.rows}`),
    statRow(documentRef, "grid 邻接", `${map.grid.metadata.neighborMode} / avg ${map.grid.metadata.averageNeighborDegree}`),
    statRow(documentRef, "Voronoi 顶点", map.grid.metadata.vertexCount),
    statRow(documentRef, "cell 三角形", map.grid.metadata.triangles),
    statRow(documentRef, "grid 构建", `${map.grid.metadata.buildMs}ms`),
    statRow(documentRef, "feature 数", map.features.metadata.featureCount),
    statRow(documentRef, "海洋/陆地/湖泊", `${map.features.metadata.oceanFeatures} / ${map.features.metadata.landFeatures} / ${map.features.metadata.lakeFeatures}`),
    statRow(documentRef, "海岸线段", map.features.metadata.coastlineSegments),
    statRow(documentRef, "湖岸线段", map.features.metadata.lakeShoreSegments),
    statRow(documentRef, "温度范围", `${map.climate.metadata.temperatureMin}°C .. ${map.climate.metadata.temperatureMax}°C`),
    statRow(documentRef, "降水范围", `${map.climate.metadata.precipitationMin} .. ${map.climate.metadata.precipitationMax}`),
    statRow(documentRef, "biome 数", Object.keys(map.climate.metadata.biomeCounts).length),
    statRow(documentRef, "河流", `${map.rivers.metadata.rivers} / ${map.rivers.metadata.segments}`),
    statRow(documentRef, "文化/宗教", `${map.society.metadata.cultures} / ${map.society.metadata.religions}`),
    statRow(documentRef, "国家/省份/区域", `${map.politics.metadata.states} / ${map.politics.metadata.provinces} / ${map.politics.metadata.regions}`),
    statRow(documentRef, "城市/首都/港口", `${map.settlements.metadata.cities} / ${map.settlements.metadata.capitals} / ${map.settlements.metadata.ports}`),
    statRow(documentRef, "道路", `${map.settlements.metadata.routes} / ${map.settlements.metadata.routeSegments}`),
    statRow(documentRef, "军事", `${map.military?.metadata?.statesWithMilitary || 0} / ${map.military?.metadata?.regiments || 0}`),
    statRow(documentRef, "人口点", `${map.settlements.metadata.ruralPopulationPoints} / ${map.settlements.metadata.populationCells}`),
    statRow(documentRef, "摘要校验", map.summary.checksum),
    statRow(documentRef, "随机预览", map.summary.randomPreview.join(", ")),
    statRow(documentRef, "视图", stats.colorMode),
    statRow(documentRef, "海底高度", stats.viewOptions?.showOceanHeight ? "显示" : "隐藏"),
    statRow(documentRef, "单元格边界", stats.cellSurfaceMode === "visual-cells" ? "平滑" : "硬边界"),
    statRow(documentRef, "边界线来源", formatBoundaryLineMode(stats.boundaryLineMode)),
    statRow(documentRef, "图层", formatLayerVisibility(stats.layerVisibility)),
    statRow(documentRef, "GPU 顶点", stats.vertexCount),
    statRow(documentRef, "道路三角形", stats.routeTriangleCount),
    statRow(documentRef, "道路 mesh", `${stats.routeWidthMode}, ${stats.routeBuildMs}ms`),
    statRow(documentRef, "道路样式", stats.routeStyleMode),
    statRow(documentRef, "河流三角形", stats.riverTriangleCount),
    statRow(documentRef, "河流 mesh", `${stats.riverWidthMode}, ${stats.riverBuildMs}ms`),
    statRow(documentRef, "河流宽度", `${stats.riverWidthStats.minWidthPx} - ${stats.riverWidthStats.maxWidthPx}px / ${stats.riverWidthStats.rivers} 条`),
    statRow(documentRef, "河流流量", `${stats.riverWidthStats.minFlux} - ${stats.riverWidthStats.maxFlux}`),
    statRow(documentRef, "选中高亮", `${stats.selectionHighlightMode}, ${stats.selectionTriangleCount} tris, ${stats.selectionBuildMs}ms`),
    statRow(documentRef, "定位状态", stats.locateStatus),
    statRow(documentRef, "编辑历史", formatEditHistory(state.editHistory?.getStats())),
    statRow(documentRef, "编辑刷新", formatEditRefresh(state.lastEditRefresh)),
    statRow(documentRef, "派生过期", formatDerivedStale(map)),
    statRow(documentRef, "对象索引", stats.objectPickingIndex ? `${stats.objectPickingIndex.buckets} buckets / ${stats.objectPickingIndex.markers} markers / ${stats.objectPickingIndex.routeSegments} routes / ${stats.objectPickingIndex.riverSegments} rivers` : "none"),
    statRow(documentRef, "轮廓三角形", stats.lineTriangleCount ?? Math.round((stats.lineVertexCount || 0) / 3)),
    statRow(documentRef, "点顶点", stats.pointVertexCount),
    statRow(documentRef, "marker", stats.markerCount),
    statRow(documentRef, "marker 图标", `${stats.visibleMarkerIconCount} / ${stats.markerIconCount}，阈值 x${stats.markerIconScaleThreshold}`),
    statRow(documentRef, "marker 资源", formatMarkerResources(map)),
    statRow(documentRef, "标签", `城市 ${stats.visibleCityLabelCount} / ${stats.cityLabelCount} / 上限 ${formatCityLabelLimit(map, stats)}；国家 ${stats.visibleStateLabelCount} / ${stats.stateLabelCount}`),
    statRow(documentRef, "相机", `x ${stats.camera.scale.toFixed(2)}, ${stats.camera.offsetX.toFixed(2)}, ${stats.camera.offsetY.toFixed(2)}`),
    statRow(documentRef, "绘制耗时", `${stats.draw.drawMs}ms`),
    statRow(documentRef, "WebGL error", stats.draw.glError),
    statRow(documentRef, "source 依赖", map.status.sourceDependency ? "是" : "否"),
    statRow(documentRef, "快照依赖", map.status.snapshotDependency ? "是" : "否"),
    statRow(documentRef, "生成日志", map.generationLog.join(" / "))
  );
}

function syncLabelLimitControlBounds(documentRef, map, stats) {
  const input = documentRef.getElementById("max-city-labels");
  const output = documentRef.getElementById("max-city-labels-value");
  if (!input) return;
  const cityTotal = map.settlements?.cities?.length || map.settlements?.metadata?.cities || 48;
  const max = Math.max(8, Math.min(5000, cityTotal));
  input.max = String(max);
  const current = normalizeMaxCityLabels(stats.labelOptions?.maxCityLabels ?? input.value);
  const displayValue = Math.min(current, max);
  input.value = String(displayValue);
  if (output) output.textContent = String(displayValue);
}

function formatCityLabelLimit(map, stats) {
  const cityTotal = map.settlements?.cities?.length || map.settlements?.metadata?.cities || 0;
  const configured = normalizeMaxCityLabels(stats.labelOptions?.maxCityLabels ?? 5000);
  return String(cityTotal ? Math.min(configured, cityTotal) : configured);
}

function updateMapLegend(documentRef, map, colorMode) {
  const legend = documentRef.getElementById("map-legend");
  if (!legend) return;

  if (colorMode === "temperature") {
    legend.hidden = false;
    legend.replaceChildren(
      legendTitle(documentRef, "温度"),
      legendBar(documentRef, "temperature"),
      legendTicks(documentRef, `${map.climate.metadata.temperatureMin}°C`, "0°C", `${map.climate.metadata.temperatureMax}°C`)
    );
    return;
  }

  if (colorMode === "precipitation") {
    legend.hidden = false;
    legend.replaceChildren(
      legendTitle(documentRef, "降水"),
      legendBar(documentRef, "precipitation"),
      legendTicks(documentRef, `${map.climate.metadata.precipitationMin}`, "50", `${map.climate.metadata.precipitationMax}`)
    );
    return;
  }

  legend.hidden = true;
  legend.replaceChildren();
}

function legendTitle(documentRef, text) {
  const title = documentRef.createElement("div");
  title.className = "legend-title";
  title.textContent = text;
  return title;
}

function legendBar(documentRef, type) {
  const bar = documentRef.createElement("div");
  bar.className = `legend-bar ${type}`;
  return bar;
}

function legendTicks(documentRef, min, mid, max) {
  const ticks = documentRef.createElement("div");
  ticks.className = "legend-ticks";
  for (const value of [min, mid, max]) {
    const item = documentRef.createElement("span");
    item.textContent = value;
    ticks.append(item);
  }
  return ticks;
}

export function updatePickPanel(documentRef, state) {
  const pick = state.pick;
  const selectionRows = state.selection?.object
    ? [
        statRow(documentRef, "选中对象", formatObjectTitle(state.selection.object)),
        statRow(documentRef, "选中详情", formatObjectDetails(state.selection.object)),
        statRow(documentRef, "编辑对象", state.editingObject ? formatObjectTitle(state.editingObject) : "none")
      ]
    : [statRow(documentRef, "选中对象", "none"), statRow(documentRef, "编辑对象", state.editingObject ? formatObjectTitle(state.editingObject) : "none")];
  documentRef.getElementById("pick-stats").replaceChildren(...selectionRows);
  updateHoverOverlay(documentRef, pick);
}

function updateHoverOverlay(documentRef, pick) {
  const overlay = documentRef.getElementById("hover-overlay");
  if (!overlay) return;
  const preferences = readControlPreferences(documentRef);
  const visible = preferences.showHoverInfo !== false && pick && pick.gridCell !== null;
  overlay.hidden = !visible;
  overlay.replaceChildren();
  if (!visible) return;

  const title = documentRef.createElement("div");
  title.className = "hover-overlay-title";
  title.textContent = formatHoverTitle(pick);
  const rows = documentRef.createElement("dl");
  rows.className = "hover-overlay-list";
  rows.replaceChildren(...compactHoverRows(documentRef, pick));
  overlay.replaceChildren(title, rows);
}

function formatHoverTitle(pick) {
  if (pick.label) return `标签 ${pick.label.text}`;
  if (pick.city && pick.city !== "none") return `城市 ${pick.city}`;
  if (pick.marker) return `标记 ${formatMarkerTitle(pick.marker)}`;
  if (pick.river) return `河流 #${pick.river.id}`;
  if (isNamedRoute(pick.route)) return `路线 ${pick.route.from} -> ${pick.route.to}`;
  if (pick.object && pick.object.kind !== OBJECT_KIND.ROUTE) return formatObjectTitle(pick.object);
  if (pick.politicalObject) return formatObjectTitle(pick.politicalObject);
  return pick.featureLand ? "陆地 cell" : "水域 cell";
}

function compactHoverRows(documentRef, pick) {
  const rows = [
    hoverRow(documentRef, "位置", `grid ${pick.gridCell} / pack ${pick.packCell ?? "none"}`),
    hoverRow(documentRef, "地形", `${pick.featureType} #${pick.featureId} / 高度 ${pick.height}`),
    hoverRow(documentRef, "气候", `${pick.temperature}°C / 降水 ${pick.precipitation}`),
    hoverRow(documentRef, "政区", `${pick.state} / ${pick.province}`),
    hoverRow(documentRef, "社会", `${pick.culture} / ${pick.religion}`),
    hoverRow(documentRef, "人口", pick.population)
  ];

  const objectText = formatHoverObjectLine(pick);
  if (objectText) rows.unshift(hoverRow(documentRef, "对象", objectText));
  return rows;
}

function formatHoverObjectLine(pick) {
  if (pick.label) return `${pick.label.text} / ${pick.label.targetKind}`;
  if (pick.city && pick.city !== "none") return pick.city;
  if (pick.marker) return formatMarkerObjectSummary(pick.marker);
  if (isNamedRoute(pick.route)) return `${pick.route.from} -> ${pick.route.to}`;
  if (pick.river) return `河流 #${pick.river.id} / flux ${pick.river.flux}`;
  if (pick.object && pick.object.kind !== OBJECT_KIND.ROUTE) return formatObjectTitle(pick.object);
  if (pick.politicalObject) return formatObjectTitle(pick.politicalObject);
  return "";
}

function isNamedRoute(route) {
  return Boolean(route?.from && route?.to && route.from !== "unknown" && route.to !== "unknown");
}

function hoverRow(documentRef, label, value) {
  const row = documentRef.createElement("div");
  const term = documentRef.createElement("dt");
  const desc = documentRef.createElement("dd");
  term.textContent = label;
  desc.textContent = String(value);
  row.append(term, desc);
  return row;
}

function formatObjectTitle(object) {
  return OBJECT_TITLE_FORMATTERS[object?.kind]?.(object) || "unknown";
}

function formatObjectDetails(object) {
  return OBJECT_DETAIL_FORMATTERS[object?.kind]?.(object) || "unknown";
}

function formatMarkerTitle(marker = {}) {
  const icon = marker.icon ? `${marker.icon} ` : "";
  return `${icon}${marker.name || marker.label || marker.type || "unknown"}`;
}

function formatMarkerObjectSummary(marker = {}) {
  const label = marker.label || marker.type || "标记";
  const category = marker.categoryLabel || marker.category || "未知";
  const resource = marker.resourceLabel ? ` / ${marker.resourceLabel}` : "";
  const economic = Number(marker.economicValue || 0) > 0 ? ` / 潜力 ${marker.economicValue}` : "";
  return `${label} / ${category}${resource}${economic} / cell ${marker.cell}`;
}

function formatMarkerResources(map) {
  const metadata = map.markers?.metadata || {};
  const resourceMarkers = Number(metadata.resourceMarkers || 0);
  const resourcePotential = Number(metadata.resourcePotential || 0);
  const economicPotential = Number(metadata.economicPotential || 0);
  return `${resourceMarkers} 处 / 资源潜力 ${resourcePotential} / 经济潜力 ${economicPotential}`;
}

function formatEditHistory(stats) {
  if (!stats) return "none";
  return `undo ${stats.undo} / redo ${stats.redo} / ${stats.lastLabel}`;
}

function formatEditRefresh(refresh) {
  if (!refresh) return "none";
  const pending = refresh.pendingDerived && refresh.pendingDerived !== "none" ? ` / 待派生 ${refresh.pendingDerived}` : "";
  return `${refresh.render} / ${refresh.selection} / ${refresh.derived} / ${refresh.affected}${pending}`;
}

function formatDerivedStale(map) {
  const systems = map.metadata?.derivedStale?.systems || [];
  return systems.length ? systems.map(system => DERIVED_STALE_LABELS[system] || system).join("、") : "none";
}

function formatGenerationTiming(timing) {
  if (!timing) return "none";
  const slowest = timing.slowest ? ` / 最慢 ${timing.slowest.label} ${timing.slowest.ms}ms` : "";
  return `${timing.totalMs}ms${slowest}`;
}

function formatLayerVisibility(visibility = {}) {
  const labels = {
    routes: "道路",
    rivers: "河流",
    cities: "城市",
    resources: "资源点",
    markers: "标记",
    labels: "标签",
    stateLabels: "国家名",
    stateBorders: "国界",
    provinceBorders: "省界",
    coastline: "水陆线"
  };
  return Object.entries(labels)
    .filter(([key]) => visibility[key] !== false)
    .map(([, label]) => label)
    .join(", ") || "none";
}

function formatBoundaryLineMode(mode) {
  if (mode === "original-coastline + round-join-political") return "原版海岸 / 圆角政区";
  if (mode === "visual-cell-curves") return "平滑共享边";
  if (mode === "hard-cell-edges") return "硬共享边";
  if (mode === "legacy-visual-paths") return "兼容路径";
  return mode || "未知";
}

function formatDistance(value) {
  return Number.isFinite(value) ? value.toFixed(1) : "n/a";
}

function statRow(documentRef, label, value) {
  const row = documentRef.createElement("div");
  const term = documentRef.createElement("dt");
  const desc = documentRef.createElement("dd");
  term.textContent = label;
  desc.textContent = String(value);
  row.append(term, desc);
  return row;
}
