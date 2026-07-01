import {patchGlobalConfigPreferences, readGlobalConfigPreferences, setGlobalConfigLayerVisible} from "./vue/state-bridge.js";
import {OBJECT_KIND} from "../runtime/object-kinds.js";
import {DIPLOMACY_RELATIONS} from "../generator/diplomacy.js";
import {windDirectionLabelFromAngle} from "../generator/climate-options.js";
import {
  formatDistance as formatDisplayDistance,
  formatHeight as formatDisplayHeight,
  formatNumber as formatDisplayNumber,
  formatPopulation as formatDisplayPopulation,
  formatPrecipitation as formatDisplayPrecipitation,
  formatScaleLabel,
  formatScaleMultiplier,
  normalizeUnitPreferences
} from "./display-units.js";

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
  [OBJECT_KIND.CITY]: (object, units) => `${object.type} / pop ${formatDisplayPopulation(object.population, units)} / ${object.state}`,
  [OBJECT_KIND.LABEL]: object => `${object.targetKind} / ${object.targetName}`,
  [OBJECT_KIND.MARKER]: (object, units) => formatMarkerObjectSummary(object, units),
  [OBJECT_KIND.ROUTE]: (object, units) => `${object.type} / ${object.level} / distance ${formatDisplayDistance(object.distance, units)}`,
  [OBJECT_KIND.RIVER]: (object, units) => `${object.type} / flux ${formatDisplayNumber(object.flux, units)} / length ${formatDisplayDistance(object.length, units)}`,
  [OBJECT_KIND.STATE]: object => `${object.culture} / ${object.religion}`,
  [OBJECT_KIND.PROVINCE]: object => `${object.state}`,
  [OBJECT_KIND.CULTURE]: (object, units) => `${object.type} / cells ${formatDisplayNumber(object.cells, units)} / pop ${formatDisplayPopulation(object.population, units)}`,
  [OBJECT_KIND.RELIGION]: (object, units) => `${object.type} / ${object.form} / cells ${formatDisplayNumber(object.cells, units)}`,
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
  diplomacy: "外交",
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
  bindUnitPreferenceControls(documentRef, handlers.onUnitPreferences);
  bindClimateControls(documentRef, handlers.onClimateControls);
  documentRef.getElementById("open-height-panel")?.addEventListener("click", handlers.onOpenHeightPanel);
  documentRef.getElementById("open-state-panel")?.addEventListener("click", handlers.onOpenStatePanel);
  documentRef.getElementById("open-province-panel")?.addEventListener("click", handlers.onOpenProvincePanel);
  documentRef.getElementById("open-city-panel")?.addEventListener("click", handlers.onOpenCityPanel);
  documentRef.getElementById("open-culture-panel")?.addEventListener("click", handlers.onOpenCulturePanel);
  documentRef.getElementById("open-religion-panel")?.addEventListener("click", handlers.onOpenReligionPanel);
  documentRef.getElementById("open-diplomacy-panel")?.addEventListener("click", handlers.onOpenDiplomacyPanel);
  documentRef.getElementById("open-route-panel")?.addEventListener("click", handlers.onOpenRoutePanel);
  documentRef.getElementById("open-river-panel")?.addEventListener("click", handlers.onOpenRiverPanel);
  documentRef.getElementById("open-marker-panel")?.addEventListener("click", handlers.onOpenMarkerPanel);
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
    "#open-development-panel",
    "#fit-view",
    "#open-height-panel",
    "#open-state-panel",
    "#open-province-panel",
    "#open-city-panel",
    "#open-culture-panel",
    "#open-religion-panel",
    "#open-diplomacy-panel",
    "#open-route-panel",
    "#open-river-panel",
    "#open-marker-panel",
    "#open-label-naming-panel",
    "[data-regenerate-kind]",
    "#seed-input",
    "#cells-input",
    "#width-input",
    "#height-input",
    "#heightmap-template",
    "#culture-inheritance-mode",
    "#religion-inheritance-mode",
    "#auto-random-seed",
    "#show-ocean-height",
    "#smooth-cell-borders",
    "#show-hover-info",
    "#max-city-labels",
    "#distance-unit",
    "#area-unit",
    "#number-abbreviation",
    "#map-scale-km-per-cm",
    "#population-scale",
    "#precipitation-scale",
    "[data-layer]",
    "[data-mode]"
  ].join(", "));
}

function bindClimateControls(documentRef, handler) {
  if (!handler) return;
  const view = documentRef.defaultView || window;
  let pending = 0;
  const schedule = () => {
    if (pending) view.cancelAnimationFrame?.(pending);
    pending = view.requestAnimationFrame?.(() => {
      pending = 0;
      handler(readOptionsFromPanel(documentRef, {}));
    }) || view.setTimeout(() => {
      pending = 0;
      handler(readOptionsFromPanel(documentRef, {}));
    }, 16);
  };

  for (const id of ["temperature-equator", "temperature-north-pole", "temperature-south-pole", "climate-latitude-center-slider"]) {
    documentRef.getElementById(id)?.addEventListener("input", schedule);
  }
  documentRef.addEventListener("climate-controls-change", schedule);
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
  applyUnitPreferences(documentRef, preferences.units);
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

function bindUnitPreferenceControls(documentRef, handler) {
  const controls = ["number-abbreviation", "distance-unit", "area-unit", "map-scale-km-per-cm", "population-scale", "precipitation-scale"]
    .map(id => documentRef.getElementById(id))
    .filter(Boolean);
  for (const control of controls) {
    const eventName = control.type === "range" ? "input" : "change";
    control.addEventListener(eventName, () => {
      const units = readUnitPreferencesFromControls(documentRef);
      applyUnitPreferences(documentRef, units);
      updateControlPreferences(documentRef, {units});
      handler?.(units);
    });
  }
}

function readUnitPreferencesFromControls(documentRef) {
  const current = readControlPreferences(documentRef).units || {};
  return normalizeUnitPreferences({
    ...current,
    numberAbbreviation: documentRef.getElementById("number-abbreviation")?.value ?? current.numberAbbreviation,
    distanceUnit: documentRef.getElementById("distance-unit")?.value ?? current.distanceUnit,
    areaUnit: documentRef.getElementById("area-unit")?.value ?? current.areaUnit,
    mapScaleKmPerCm: documentRef.getElementById("map-scale-km-per-cm")?.value ?? current.mapScaleKmPerCm,
    populationScale: documentRef.getElementById("population-scale")?.value ?? current.populationScale,
    precipitationScale: documentRef.getElementById("precipitation-scale")?.value ?? current.precipitationScale
  });
}

function applyUnitPreferences(documentRef, preferences = {}) {
  const units = normalizeUnitPreferences(preferences);
  setControlValue(documentRef, "distance-unit", units.distanceUnit);
  setControlValue(documentRef, "area-unit", units.areaUnit);
  setControlValue(documentRef, "number-abbreviation", units.numberAbbreviation);
  setControlValue(documentRef, "map-scale-km-per-cm", units.mapScaleKmPerCm);
  setControlValue(documentRef, "population-scale", units.populationScale);
  setControlValue(documentRef, "precipitation-scale", units.precipitationScale);
  setOutputText(documentRef, "map-scale-km-per-cm-value", `${units.mapScaleKmPerCm} km`);
  setOutputText(documentRef, "population-scale-value", formatScaleMultiplier(units.populationScale));
  setOutputText(documentRef, "precipitation-scale-value", formatScaleMultiplier(units.precipitationScale));
}

function setControlValue(documentRef, id, value) {
  const control = documentRef.getElementById(id);
  if (!control) return;
  control.value = String(value);
}

function setOutputText(documentRef, id, value) {
  const output = documentRef.getElementById(id);
  if (output) output.textContent = String(value);
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
      units: patch.units ? {...(current.units || {}), ...patch.units} : current.units || {},
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
  normalized.units = normalizeUnitPreferences(normalized.units);
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
  if (status) status.textContent = result.status || "";
  if (constraint) constraint.textContent = result.constraint || "国家、省份、城镇、道路、河流、资源点和外交会按各自生成约束逐步接入；marker / zone 的完整局部重算另行推进。";
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
    climateLatitudeMode: documentRef.getElementById("climate-latitude-mode")?.value || previousOptions?.climateLatitudeMode,
    climateLatitudeCenter: documentRef.getElementById("climate-latitude-center-slider")?.value || documentRef.getElementById("climate-latitude-center")?.value || previousOptions?.climateLatitudeCenter,
    climateLatitudeSpan: documentRef.getElementById("climate-latitude-span")?.value || previousOptions?.climateLatitudeSpan,
    atmosphereDirection: documentRef.getElementById("atmosphere-direction")?.value || previousOptions?.atmosphereDirection,
    winds: parseWindProfileInput(documentRef.getElementById("atmosphere-winds")?.value, previousOptions?.winds),
    temperatureEquator: documentRef.getElementById("temperature-equator")?.value || previousOptions?.temperatureEquator,
    temperatureNorthPole: documentRef.getElementById("temperature-north-pole")?.value || previousOptions?.temperatureNorthPole,
    temperatureSouthPole: documentRef.getElementById("temperature-south-pole")?.value || previousOptions?.temperatureSouthPole,
    cultureInheritanceMode: documentRef.getElementById("culture-inheritance-mode")?.value || previousOptions?.cultureInheritanceMode,
    religionInheritanceMode: documentRef.getElementById("religion-inheritance-mode")?.value || previousOptions?.religionInheritanceMode,
    cellsTarget: documentRef.getElementById("cells-input").value,
    graphWidth: documentRef.getElementById("width-input").value,
    graphHeight: documentRef.getElementById("height-input").value
  };
}

function parseWindProfileInput(value, fallback) {
  const values = String(value || "")
    .split(",")
    .map(item => Number(item.trim()))
    .filter(Number.isFinite);
  return values.length ? values : fallback;
}

export function setSeedInput(documentRef, seed) {
  documentRef.getElementById("seed-input").value = seed;
}

export function updateRuntimePanel(documentRef, state) {
  const {map, renderer} = state;
  if (!map || !renderer) return;
  const stats = renderer.getStats();
  const unitPreferences = readControlPreferences(documentRef).units;
  syncLabelLimitControlBounds(documentRef, map, stats);
  documentRef.getElementById("app-status").textContent = `${map.status.message}，seed ${map.metadata.seed}`;
  documentRef.getElementById("map-badge").textContent = `${formatDisplayDistance(map.metadata.graphWidth, unitPreferences)} x ${formatDisplayDistance(map.metadata.graphHeight, unitPreferences)}`;
  updateMapLegend(documentRef, map, stats);
  updateMapScaleBar(documentRef, map, stats, unitPreferences);
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
    statRow(documentRef, "地图比例", formatScaleLabel(unitPreferences)),
    statRow(documentRef, "地图尺寸", `${formatDisplayDistance(map.metadata.graphWidth, unitPreferences)} x ${formatDisplayDistance(map.metadata.graphHeight, unitPreferences)}`),
    statRow(documentRef, "grid 布局", `${formatDisplayNumber(map.grid.metadata.columns, unitPreferences)} x ${formatDisplayNumber(map.grid.metadata.rows, unitPreferences)}`),
    statRow(documentRef, "grid 邻接", `${map.grid.metadata.neighborMode} / avg ${map.grid.metadata.averageNeighborDegree}`),
    statRow(documentRef, "Voronoi 顶点", map.grid.metadata.vertexCount),
    statRow(documentRef, "cell 三角形", map.grid.metadata.triangles),
    statRow(documentRef, "grid 构建", `${map.grid.metadata.buildMs}ms`),
    statRow(documentRef, "feature 数", map.features.metadata.featureCount),
    statRow(documentRef, "海洋/陆地/湖泊", `${map.features.metadata.oceanFeatures} / ${map.features.metadata.landFeatures} / ${map.features.metadata.lakeFeatures}`),
    statRow(documentRef, "海岸线段", map.features.metadata.coastlineSegments),
    statRow(documentRef, "湖岸线段", map.features.metadata.lakeShoreSegments),
    statRow(documentRef, "温度范围", `${map.climate.metadata.temperatureMin}°C .. ${map.climate.metadata.temperatureMax}°C`),
    statRow(documentRef, "降水范围", `${formatDisplayPrecipitation(map.climate.metadata.precipitationMin, unitPreferences)} .. ${formatDisplayPrecipitation(map.climate.metadata.precipitationMax, unitPreferences)}`),
    statRow(documentRef, "气候纬度", formatClimateLatitude(map.climate)),
    statRow(documentRef, "大气方向", formatAtmosphereDirection(map.climate)),
    statRow(documentRef, "biome 数", Object.keys(map.climate.metadata.biomeCounts).length),
    statRow(documentRef, "河流", `${map.rivers.metadata.rivers} / ${map.rivers.metadata.segments}`),
    statRow(documentRef, "文化/宗教", `${map.society.metadata.cultures} / ${map.society.metadata.religions}`),
    statRow(documentRef, "文化继承", formatInheritanceStats(map.options.cultureInheritanceMode, map.society.metadata.cultureTree, unitPreferences)),
    statRow(documentRef, "宗教继承", formatInheritanceStats(map.options.religionInheritanceMode, map.society.metadata.religionTree, unitPreferences)),
    statRow(documentRef, "国家/省份/区域", `${map.politics.metadata.states} / ${map.politics.metadata.provinces} / ${map.politics.metadata.regions}`),
    statRow(documentRef, "外交", formatDiplomacyStats(map.diplomacy?.metadata, unitPreferences)),
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
    statRow(documentRef, "城市图标", `${stats.visibleCityIconCount} / ${stats.cityIconCount}，阈值 x${stats.cityIconScaleThreshold}`),
    statRow(documentRef, "marker", stats.markerCount),
    statRow(documentRef, "marker 图标", `${stats.visibleMarkerIconCount} / ${stats.markerIconCount}，阈值 x${stats.markerIconScaleThreshold}`),
    statRow(documentRef, "marker 资源", formatMarkerResources(map, unitPreferences)),
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

function updateMapLegend(documentRef, map, stats) {
  const legend = documentRef.getElementById("map-legend");
  if (!legend) return;
  const unitPreferences = readControlPreferences(documentRef).units;
  const colorMode = stats.colorMode;

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
      legendTicks(
        documentRef,
        formatDisplayPrecipitation(map.climate.metadata.precipitationMin, unitPreferences),
        formatDisplayPrecipitation(50, unitPreferences),
        formatDisplayPrecipitation(map.climate.metadata.precipitationMax, unitPreferences)
      )
    );
    return;
  }

  if (colorMode === "diplomacy") {
    const subjectId = Number(stats.viewOptions?.diplomacySubjectId) || firstDiplomacyStateId(map);
    const subject = map.politics.states?.[subjectId];
    legend.hidden = false;
    legend.replaceChildren(
      legendTitle(documentRef, `外交：${subject?.fullName || subject?.name || "未选主体"}`),
      diplomacyLegendList(documentRef)
    );
    return;
  }

  legend.hidden = true;
  legend.replaceChildren();
}

function updateMapScaleBar(documentRef, map, stats, unitPreferences) {
  const scaleBar = documentRef.getElementById("map-scale-bar");
  const line = scaleBar?.querySelector(".map-scale-line");
  const label = scaleBar?.querySelector(".map-scale-label");
  const canvas = documentRef.getElementById("map-canvas");
  if (!scaleBar || !line || !label || !canvas || !map || stats.layerVisibility?.scaleBar === false) {
    if (scaleBar) scaleBar.hidden = true;
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const cameraScale = Math.max(0.001, Number(stats.camera?.scale) || 1);
  const worldPerPixel = map.metadata.graphWidth / Math.max(1, rect.width * cameraScale);
  const targetPixels = Math.max(86, Math.min(180, rect.width * 0.12));
  const distance = niceScaleDistance(worldPerPixel * targetPixels);
  const widthPx = Math.max(72, Math.min(220, distance / worldPerPixel));

  line.style.width = `${Math.round(widthPx)}px`;
  label.textContent = formatDisplayDistance(distance, unitPreferences);
  scaleBar.hidden = false;
}

function niceScaleDistance(distance) {
  if (!Number.isFinite(distance) || distance <= 0) return 1;
  const exponent = Math.floor(Math.log10(distance));
  const base = 10 ** exponent;
  const normalized = distance / base;
  const step = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1;
  return step * base;
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

function diplomacyLegendList(documentRef) {
  const list = documentRef.createElement("div");
  list.className = "legend-list diplomacy";
  list.append(legendSwatch(documentRef, "#ffbf42", "主体"));
  for (const key of ["Ally", "Friendly", "Neutral", "Suspicion", "Rival", "Enemy", "Vassal", "Suzerain", "Unknown"]) {
    const relation = DIPLOMACY_RELATIONS[key];
    list.append(legendSwatch(documentRef, relation.color, relation.label));
  }
  return list;
}

function legendSwatch(documentRef, color, label) {
  const item = documentRef.createElement("span");
  item.className = "legend-swatch-item";
  const swatch = documentRef.createElement("i");
  swatch.style.background = color;
  item.append(swatch, documentRef.createTextNode(label));
  return item;
}

function firstDiplomacyStateId(map) {
  return (map?.politics?.states || []).find(state => state?.i && !state.removed)?.i || 0;
}

export function updatePickPanel(documentRef, state) {
  const pick = state.pick;
  const unitPreferences = readControlPreferences(documentRef).units;
  const selectionRows = state.selection?.object
    ? [
        statRow(documentRef, "选中对象", formatObjectTitle(state.selection.object)),
        statRow(documentRef, "选中详情", formatObjectDetails(state.selection.object, unitPreferences)),
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
  title.textContent = formatHoverTitle(pick, preferences.units);
  const rows = documentRef.createElement("dl");
  rows.className = "hover-overlay-list";
  rows.replaceChildren(...compactHoverRows(documentRef, pick, preferences.units));
  overlay.replaceChildren(title, rows);
}

function formatHoverTitle(pick, unitPreferences = {}) {
  if (pick.label) return `标签 ${pick.label.text}`;
  if (pick.city && pick.city !== "none") return `城市 ${pick.city}`;
  if (pick.marker) return `标记 ${formatMarkerObjectSummary(pick.marker, unitPreferences)}`;
  if (pick.river) return `河流 #${pick.river.id}`;
  if (isNamedRoute(pick.route)) return `路线 ${pick.route.from} -> ${pick.route.to}`;
  if (pick.object && pick.object.kind !== OBJECT_KIND.ROUTE) return formatObjectTitle(pick.object);
  if (pick.politicalObject) return formatObjectTitle(pick.politicalObject);
  return pick.featureLand ? "陆地 cell" : "水域 cell";
}

function compactHoverRows(documentRef, pick, unitPreferences) {
  const rows = [
    hoverRow(documentRef, "位置", `grid ${pick.gridCell} / pack ${pick.packCell ?? "none"}`),
    hoverRow(documentRef, "地形", `${pick.featureType} #${pick.featureId} / 高度 ${formatDisplayHeight(pick.height, unitPreferences)}`),
    hoverRow(documentRef, "气候", `${pick.temperature}°C / 降水 ${formatDisplayPrecipitation(pick.precipitation, unitPreferences)}`),
    hoverRow(documentRef, "政区", `${pick.state} / ${pick.province}`),
    hoverRow(documentRef, "社会", `${pick.culture} / ${pick.religion}`),
    hoverRow(documentRef, "人口", formatDisplayPopulation(pick.population, unitPreferences))
  ];

  const objectText = formatHoverObjectLine(pick, unitPreferences);
  if (objectText) rows.unshift(hoverRow(documentRef, "对象", objectText));
  return rows;
}

function formatHoverObjectLine(pick, unitPreferences = {}) {
  if (pick.label) return `${pick.label.text} / ${pick.label.targetKind}`;
  if (pick.city && pick.city !== "none") return pick.city;
  if (pick.marker) return formatMarkerObjectSummary(pick.marker, unitPreferences);
  if (isNamedRoute(pick.route)) return `${pick.route.from} -> ${pick.route.to}`;
  if (pick.river) return `河流 #${pick.river.id} / flux ${formatDisplayNumber(pick.river.flux, unitPreferences)}`;
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

function formatObjectDetails(object, unitPreferences) {
  return OBJECT_DETAIL_FORMATTERS[object?.kind]?.(object, unitPreferences) || "unknown";
}

function formatMarkerTitle(marker = {}) {
  const icon = marker.icon ? `${marker.icon} ` : "";
  return `${icon}${marker.name || marker.label || marker.type || "unknown"}`;
}

function formatMarkerObjectSummary(marker = {}, unitPreferences = {}) {
  const label = marker.label || marker.type || "标记";
  const category = marker.categoryLabel || marker.category || "未知";
  const resource = marker.resourceLabel ? ` / ${marker.resourceLabel}` : "";
  const economic = Number(marker.economicValue || 0) > 0 ? ` / 潜力 ${formatDisplayNumber(marker.economicValue, unitPreferences)}` : "";
  return `${label} / ${category}${resource}${economic} / cell ${marker.cell}`;
}

function formatMarkerResources(map, unitPreferences = {}) {
  const metadata = map.markers?.metadata || {};
  const resourceMarkers = Number(metadata.resourceMarkers || 0);
  const resourcePotential = Number(metadata.resourcePotential || 0);
  const economicPotential = Number(metadata.economicPotential || 0);
  return `${formatDisplayNumber(resourceMarkers, unitPreferences)} 处 / 资源潜力 ${formatDisplayNumber(resourcePotential, unitPreferences)} / 经济潜力 ${formatDisplayNumber(economicPotential, unitPreferences)}`;
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

function formatClimateLatitude(climate = {}) {
  const coordinates = climate.mapCoordinates || {};
  const metadata = climate.metadata || {};
  const label = metadata.latitudeLabel || coordinates.latitudeLabel || "自动纬度";
  if (!Number.isFinite(coordinates.latS) || !Number.isFinite(coordinates.latN)) return label;
  return `${label} / ${formatLatitude(coordinates.latS)} .. ${formatLatitude(coordinates.latN)}`;
}

function formatAtmosphereDirection(climate = {}) {
  const metadata = climate.metadata || {};
  const label = metadata.atmosphereLabel || climate.mapCoordinates?.atmosphereLabel || "自动风带";
  const angle = Number.isFinite(metadata.windAngle) ? ` / ${metadata.windAngle}°` : "";
  const profile = Array.isArray(metadata.windProfile) && metadata.windProfile.length
    ? ` / ${metadata.windProfile.map(windDirectionLabelFromAngle).join("、")}`
    : "";
  return `${label}${angle}${profile}`;
}

function formatInheritanceStats(mode, tree = {}, unitPreferences = {}) {
  const labels = {
    flat: "平铺",
    regional: "区域浅树",
    branching: "分支树"
  };
  return `${labels[mode] || mode || "分支树"} / 根 ${formatDisplayNumber(tree.roots || 0, unitPreferences)} / 派生 ${formatDisplayNumber(tree.derived || 0, unitPreferences)} / 深 ${formatDisplayNumber(tree.maxDepth || 0, unitPreferences)}`;
}

function formatDiplomacyStats(metadata = {}, unitPreferences = {}) {
  return `关系 ${formatDisplayNumber(metadata.pairs || 0, unitPreferences)} / 盟友 ${formatDisplayNumber(metadata.allies || 0, unitPreferences)} / 宿敌 ${formatDisplayNumber(metadata.rivals || 0, unitPreferences)} / 战争 ${formatDisplayNumber(metadata.enemies || 0, unitPreferences)} / 附庸 ${formatDisplayNumber(metadata.vassals || 0, unitPreferences)}`;
}

function formatLatitude(value) {
  if (value > 0) return `北纬 ${Math.abs(value)}°`;
  if (value < 0) return `南纬 ${Math.abs(value)}°`;
  return "赤道 0°";
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

function statRow(documentRef, label, value) {
  const row = documentRef.createElement("div");
  const term = documentRef.createElement("dt");
  const desc = documentRef.createElement("dd");
  term.textContent = label;
  desc.textContent = formatStatValue(documentRef, value);
  row.append(term, desc);
  return row;
}

function formatStatValue(documentRef, value) {
  if (typeof value !== "number") return String(value);
  return formatDisplayNumber(value, readControlPreferences(documentRef).units);
}
