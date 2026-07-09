import {readControlPreferences, setActiveModeButton, updateControlPreferences, updateLayerPreference} from "../ui/panel.js";
import {normalizeUnitPreferences} from "../ui/display-units.js";
import {createCanvasPngBlob, createCompressedMapDocumentBlob, createMapDocument, createMapFeatureGeoJson, createMapGeoJson, downloadCanvasPng, downloadCompressedMapDocument, downloadText, mapFileBaseName, stringifyMapDocument} from "./map-file-io.js";
import {apiCall} from "./api-result.js";

const API_VERSION = "0.1.0";
const API_STABILITY = "experimental";

export function installConsoleApi(documentRef, state, options = {}) {
  const view = documentRef.defaultView || window;
  const api = createConsoleApi(documentRef, state, options.actions || {});
  view.webglGeneratorApi = api;
  if (!view.api) view.api = api;
  return api;
}

function createConsoleApi(documentRef, state, actions = {}) {
  const api = {
    version: API_VERSION,
    stability: API_STABILITY,
    info: Object.freeze({
      capabilities: () => apiCall(() => buildCapabilities()),
      mapSummary: () => apiCall(() => buildMapSummary(state)),
      runtimeStats: () => apiCall(() => buildRuntimeStats(state, documentRef))
    }),
    selection: Object.freeze({
      get: () => apiCall(() => buildSelectionSnapshot(state)),
      resolve: object => apiCall(() => requireApiAction(actions.selection?.resolve, "selection.resolve")(object)),
      select: object => apiCall(() => requireApiAction(actions.selection?.select, "selection.select")(object)),
      clear: () => apiCall(() => requireApiAction(actions.selection?.clear, "selection.clear")()),
      locate: object => apiCall(() => requireApiAction(actions.selection?.locate, "selection.locate")(object)),
      pick: (clientX, clientY) => apiCall(() => requireApiAction(actions.selection?.pick, "selection.pick")(clientX, clientY))
    }),
    layers: Object.freeze({
      get: () => apiCall(() => buildLayerSnapshot(state, documentRef)),
      setViewMode: mode => apiCall(() => setLayerViewMode(state, documentRef, mode)),
      setVisible: (layer, visible) => apiCall(() => setLayerVisible(state, documentRef, layer, visible))
    }),
    units: Object.freeze({
      get: () => apiCall(() => buildUnitSnapshot(state, documentRef)),
      apply: (preferences = {}) => apiCall(() => applyUnitPreferences(state, documentRef, preferences))
    }),
    climate: Object.freeze({
      get: section => apiCall(() => buildClimateSnapshot(state, section)),
      getOptions: () => apiCall(() => buildClimateOptionsSnapshot(state)),
      getTemperature: () => apiCall(() => buildClimateTemperatureSnapshot(state)),
      getPrecipitation: () => apiCall(() => buildClimatePrecipitationSnapshot(state)),
      getLatitude: () => apiCall(() => buildClimateLatitudeSnapshot(state)),
      getAtmosphere: () => apiCall(() => buildClimateAtmosphereSnapshot(state)),
      getBiomes: () => apiCall(() => buildClimateBiomeSnapshot(state)),
      apply: (patch = {}, options = {}) => apiCall(() => requireApiAction(actions.climate?.apply, "climate.apply")(patch, options)),
      setLatitude: (value, options = {}) => apiCall(() => requireApiAction(actions.climate?.setLatitude, "climate.setLatitude")(value, options)),
      setLatitudeRange: (percent, options = {}) => apiCall(() => requireApiAction(actions.climate?.setLatitudeRange, "climate.setLatitudeRange")(percent, options)),
      setLongitudeRange: (percent, options = {}) => apiCall(() => requireApiAction(actions.climate?.setLongitudeRange, "climate.setLongitudeRange")(percent, options)),
      setTemperature: (patch, options = {}) => apiCall(() => requireApiAction(actions.climate?.setTemperature, "climate.setTemperature")(patch, options)),
      setPrecipitation: (scale, options = {}) => apiCall(() => requireApiAction(actions.climate?.setPrecipitation, "climate.setPrecipitation")(scale, options)),
      setWind: (index, direction, options = {}) => apiCall(() => requireApiAction(actions.climate?.setWind, "climate.setWind")(index, direction, options))
    }),
    history: Object.freeze({
      get: () => apiCall(() => actions.history?.get?.() || state?.editHistory?.getStats?.() || null),
      undo: () => apiCall(() => requireApiAction(actions.history?.undo, "history.undo")()),
      redo: () => apiCall(() => requireApiAction(actions.history?.redo, "history.redo")())
    }),
    edit: Object.freeze({
      notes: Object.freeze({
        delete: (noteId, options = {}) => apiCall(() => requireApiAction(actions.edit?.notes?.delete, "edit.notes.delete")(noteId, options))
      }),
      measurements: Object.freeze({
        rename: (measurementId, name) => apiCall(() => requireApiAction(actions.edit?.measurements?.rename, "edit.measurements.rename")(measurementId, name)),
        delete: measurementId => apiCall(() => requireApiAction(actions.edit?.measurements?.delete, "edit.measurements.delete")(measurementId))
      }),
      cities: Object.freeze({
        add: gridCell => apiCall(() => requireApiAction(actions.edit?.cities?.add, "edit.cities.add")(gridCell)),
        delete: cityId => apiCall(() => requireApiAction(actions.edit?.cities?.delete, "edit.cities.delete")(cityId))
      }),
      provinces: Object.freeze({
        add: gridCell => apiCall(() => requireApiAction(actions.edit?.provinces?.add, "edit.provinces.add")(gridCell)),
        delete: provinceId => apiCall(() => requireApiAction(actions.edit?.provinces?.delete, "edit.provinces.delete")(provinceId))
      }),
      states: Object.freeze({
        add: gridCell => apiCall(() => requireApiAction(actions.edit?.states?.add, "edit.states.add")(gridCell)),
        delete: stateId => apiCall(() => requireApiAction(actions.edit?.states?.delete, "edit.states.delete")(stateId))
      }),
      routes: Object.freeze({
        delete: routeId => apiCall(() => requireApiAction(actions.edit?.routes?.delete, "edit.routes.delete")(routeId))
      }),
      labels: Object.freeze({
        delete: label => apiCall(() => requireApiAction(actions.edit?.labels?.delete, "edit.labels.delete")(label)),
        restore: label => apiCall(() => requireApiAction(actions.edit?.labels?.restore, "edit.labels.restore")(label))
      }),
      markers: Object.freeze({
        add: (options = {}) => apiCall(() => requireApiAction(actions.edit?.markers?.add, "edit.markers.add")(options)),
        delete: markerId => apiCall(() => requireApiAction(actions.edit?.markers?.delete, "edit.markers.delete")(markerId)),
        move: (markerId, packCell) => apiCall(() => requireApiAction(actions.edit?.markers?.move, "edit.markers.move")(markerId, packCell))
      })
    }),
    data: Object.freeze({
      exportAll: (options = {}) => apiCall(() => exportAllMapData(state, documentRef, options)),
      exportGEO: (options = {}) => apiCall(() => exportPackGeoJson(state, documentRef, options)),
      exportFeatureGEO: (options = {}) => apiCall(() => exportFeatureGeoJsonData(state, documentRef, options)),
      exportCompressedAll: (options = {}) => apiCall(() => exportCompressedAllMapData(state, documentRef, options)),
      exportPNG: (options = {}) => apiCall(() => exportPngData(state, documentRef, options))
    })
  };
  return Object.freeze(api);
}

function buildCapabilities() {
  return {
    apiVersion: API_VERSION,
    stability: API_STABILITY,
    namespaces: ["info", "selection", "layers", "units", "climate", "history", "edit", "data"],
    methods: {
      info: ["capabilities", "mapSummary", "runtimeStats"],
      selection: ["get", "resolve", "select", "clear", "locate", "pick"],
      layers: ["get", "setViewMode", "setVisible"],
      units: ["get", "apply"],
      climate: ["get", "getOptions", "getTemperature", "getPrecipitation", "getLatitude", "getAtmosphere", "getBiomes", "apply", "setLatitude", "setLatitudeRange", "setLongitudeRange", "setTemperature", "setPrecipitation", "setWind"],
      history: ["get", "undo", "redo"],
      edit: ["notes.delete", "measurements.rename", "measurements.delete", "cities.add", "cities.delete", "provinces.add", "provinces.delete", "states.add", "states.delete", "routes.delete", "labels.delete", "labels.restore", "markers.add", "markers.delete", "markers.move"],
      data: ["exportAll", "exportGEO", "exportFeatureGEO", "exportCompressedAll", "exportPNG"]
    },
    sideEffects: {
      info: "readonly",
      selection: "readonly",
      layers: "display-preference",
      units: "display-preference",
      climate: "readonly-and-climate-update",
      history: "edit-history",
      edit: "edit-command",
      data: "readonly-download"
    }
  };
}

function requireApiAction(action, name) {
  if (typeof action !== "function") throw new Error(`API action 未安装：${name}`);
  return action;
}

function buildMapSummary(state) {
  const map = state?.map;
  if (!map) return {ready: false};
  return {
    ready: true,
    seed: map.metadata?.seed || map.options?.seed || state.options?.seed || "",
    checksum: map.metadata?.checksum || map.summary?.checksum || "",
    generatedAt: map.metadata?.generatedAt || "",
    generatorStage: map.metadata?.generatorStage || "",
    graphWidth: numberOrZero(map.metadata?.graphWidth ?? map.options?.graphWidth),
    graphHeight: numberOrZero(map.metadata?.graphHeight ?? map.options?.graphHeight),
    gridCells: numberOrZero(map.metadata?.gridCells ?? map.grid?.metadata?.actualCells ?? map.grid?.cells?.i?.length),
    packCells: numberOrZero(map.metadata?.packCells ?? map.pack?.metadata?.cells ?? map.pack?.cells?.i?.length),
    features: numberOrZero(map.features?.metadata?.features ?? countArrayItems(map.features?.features)),
    states: countPoliticalItems(map.politics?.states),
    provinces: countPoliticalItems(map.politics?.provinces),
    cities: numberOrZero(map.settlements?.metadata?.cities ?? countArrayItems(map.settlements?.burgs)),
    routes: numberOrZero(map.settlements?.metadata?.routes ?? countArrayItems(map.settlements?.routes)),
    rivers: numberOrZero(map.rivers?.metadata?.rivers ?? countArrayItems(map.rivers?.rivers)),
    lakes: numberOrZero(map.features?.metadata?.lakes),
    cultures: countArrayItems(map.society?.cultures),
    religions: countArrayItems(map.society?.religions),
    markers: numberOrZero(map.markers?.metadata?.markers ?? countArrayItems(map.markers?.markers)),
    zones: numberOrZero(map.zones?.metadata?.zones ?? countArrayItems(map.zones?.zones)),
    regiments: numberOrZero(map.military?.metadata?.regiments ?? countArrayItems(map.military?.regiments)),
    measurements: numberOrZero(map.measurements?.metadata?.measurements ?? countArrayItems(map.measurements?.items)),
    notes: numberOrZero(map.notes?.metadata?.notes ?? countArrayItems(map.notes?.notes)),
    visualTheme: map.visualTheme?.preset || map.options?.visualTheme || state.options?.visualTheme || "default",
    staleSystems: [...(map.metadata?.derivedStale?.systems || [])]
  };
}

function buildRuntimeStats(state, documentRef) {
  const rendererStats = state?.renderer?.getStats?.() || null;
  const history = state?.editHistory?.getStats?.() || null;
  const health = state?.healthMonitor?.getEvents?.(20) || [];
  const loading = documentRef.getElementById("generation-loading");
  return {
    renderer: rendererStats,
    editHistory: history,
    selection: buildSelectionSnapshot(state),
    health: {
      events: health.length,
      latest: health.slice(-5)
    },
    loading: {
      visible: Boolean(loading && !loading.hidden),
      text: documentRef.getElementById("generation-loading-text")?.textContent?.trim() || ""
    }
  };
}

function buildSelectionSnapshot(state) {
  const snapshot = state?.selectionStore?.getSnapshot?.() || {
    selection: state?.selection || null,
    editingObject: state?.editingObject || null
  };
  return {
    selection: summarizeSelection(snapshot.selection),
    editingObject: summarizeObject(snapshot.editingObject)
  };
}

function buildLayerSnapshot(state, documentRef) {
  const preferences = readControlPreferences(documentRef);
  const rendererStats = state?.renderer?.getStats?.() || {};
  return {
    colorMode: rendererStats.colorMode || preferences.colorMode || "height",
    visualTheme: rendererStats.visualTheme || preferences.visualTheme || state?.options?.visualTheme || "default",
    layers: {...(preferences.layers || {})},
    units: {...(preferences.units || {})}
  };
}

function setLayerViewMode(state, documentRef, mode) {
  const nextMode = String(mode || "").trim();
  if (!nextMode) throw new Error("缺少视图模式");
  const availableModes = [...documentRef.querySelectorAll("[data-mode]")].map(item => item.dataset.mode).filter(Boolean);
  if (availableModes.length && !availableModes.includes(nextMode)) throw new Error(`未知视图模式：${nextMode}`);
  setActiveModeButton(documentRef, nextMode);
  state?.renderer?.setColorMode?.(nextMode);
  return buildLayerSnapshot(state, documentRef);
}

function setLayerVisible(state, documentRef, layer, visible) {
  const nextLayer = String(layer || "").trim();
  if (!nextLayer) throw new Error("缺少图层名称");
  const rendererLayers = state?.renderer?.getStats?.()?.layerVisibility || {};
  if (!Object.prototype.hasOwnProperty.call(rendererLayers, nextLayer)) throw new Error(`未知图层：${nextLayer}`);
  const nextVisible = Boolean(visible);
  updateLayerPreference(documentRef, nextLayer, nextVisible);
  updateLayerControlState(documentRef, nextLayer, nextVisible);
  state?.renderer?.setLayerVisible?.(nextLayer, nextVisible);
  return buildLayerSnapshot(state, documentRef);
}

function buildUnitSnapshot(state, documentRef) {
  const preferences = readControlPreferences(documentRef);
  const units = normalizeUnitPreferences(preferences.units);
  return {
    units,
    rendererApplied: Boolean(state?.renderer)
  };
}

function applyUnitPreferences(state, documentRef, preferences = {}) {
  if (!preferences || typeof preferences !== "object") throw new Error("单位偏好必须是对象");
  const current = buildUnitSnapshot(state, documentRef).units;
  const units = normalizeUnitPreferences({...current, ...preferences});
  updateUnitControls(documentRef, units);
  updateControlPreferences(documentRef, {units});
  state?.renderer?.setUnitPreferences?.(units);
  return buildUnitSnapshot(state, documentRef);
}

function buildClimateSnapshot(state, section) {
  if (section !== undefined && section !== null && section !== "") return buildClimateSectionSnapshot(state, section);
  return {
    options: buildClimateOptionsSnapshot(state),
    temperature: buildClimateTemperatureSnapshot(state),
    precipitation: buildClimatePrecipitationSnapshot(state),
    latitude: buildClimateLatitudeSnapshot(state),
    atmosphere: buildClimateAtmosphereSnapshot(state),
    biomes: buildClimateBiomeSnapshot(state)
  };
}

function buildClimateSectionSnapshot(state, section) {
  const key = String(section || "").trim().toLowerCase();
  const builders = {
    options: buildClimateOptionsSnapshot,
    option: buildClimateOptionsSnapshot,
    temperature: buildClimateTemperatureSnapshot,
    temp: buildClimateTemperatureSnapshot,
    precipitation: buildClimatePrecipitationSnapshot,
    precip: buildClimatePrecipitationSnapshot,
    latitude: buildClimateLatitudeSnapshot,
    lat: buildClimateLatitudeSnapshot,
    atmosphere: buildClimateAtmosphereSnapshot,
    wind: buildClimateAtmosphereSnapshot,
    winds: buildClimateAtmosphereSnapshot,
    biomes: buildClimateBiomeSnapshot,
    biome: buildClimateBiomeSnapshot
  };
  const builder = builders[key];
  if (!builder) throw new Error(`未知气候快照分区：${section}`);
  return builder(state);
}

function buildClimateContext(state) {
  const map = assertApiMap(state);
  const climate = map.climate || {};
  const metadata = climate.metadata || {};
  const coordinates = map.mapCoordinates || climate.mapCoordinates || {};
  const options = {...(state.options || {}), ...(map.options || {})};
  return {map, climate, metadata, coordinates, options};
}

function buildClimateOptionsSnapshot(state) {
  const {options} = buildClimateContext(state);
  return {
    climateLatitudeMode: options.climateLatitudeMode || "",
    climateLatitudeCenter: numberOrNull(options.climateLatitudeCenter),
    climateLatitudeSpan: numberOrNull(options.climateLatitudeSpan),
    climateMapSizePercent: numberOrNull(options.climateMapSizePercent),
    climateLatitudeRangePercent: numberOrNull(options.climateLatitudeRangePercent),
    climateLongitudeRangePercent: numberOrNull(options.climateLongitudeRangePercent),
    atmosphereDirection: options.atmosphereDirection || "",
    winds: Array.isArray(options.winds) ? [...options.winds] : [],
    temperatureEquator: numberOrNull(options.temperatureEquator),
    temperatureNorthPole: numberOrNull(options.temperatureNorthPole),
    temperatureSouthPole: numberOrNull(options.temperatureSouthPole),
    precipitation: numberOrNull(options.precipitation)
  };
}

function buildClimateTemperatureSnapshot(state) {
  const {metadata, options} = buildClimateContext(state);
  return {
    min: numberOrNull(metadata.temperatureMin),
    max: numberOrNull(metadata.temperatureMax),
    equator: numberOrNull(options.temperatureEquator),
    northPole: numberOrNull(options.temperatureNorthPole),
    southPole: numberOrNull(options.temperatureSouthPole)
  };
}

function buildClimatePrecipitationSnapshot(state) {
  const {metadata, options} = buildClimateContext(state);
  return {
    min: numberOrNull(metadata.precipitationMin),
    max: numberOrNull(metadata.precipitationMax),
    scale: numberOrNull(options.precipitation)
  };
}

function buildClimateLatitudeSnapshot(state) {
  const {metadata, coordinates} = buildClimateContext(state);
  return {
    mode: metadata.latitudeMode || coordinates.latitudeMode || "",
    label: metadata.latitudeLabel || coordinates.latitudeLabel || "",
    center: numberOrNull(metadata.latitudeCenter ?? coordinates.latCenter),
    mapSizePercent: numberOrNull(metadata.mapSizePercent ?? coordinates.mapSizePercent),
    latitudeRangePercent: numberOrNull(metadata.latitudeRangePercent ?? coordinates.latitudeRangePercent),
    longitudeRangePercent: numberOrNull(metadata.longitudeRangePercent ?? coordinates.longitudeRangePercent),
    latN: numberOrNull(coordinates.latN),
    latS: numberOrNull(coordinates.latS),
    lonW: numberOrNull(coordinates.lonW),
    lonE: numberOrNull(coordinates.lonE)
  };
}

function buildClimateAtmosphereSnapshot(state) {
  const {metadata, coordinates, options} = buildClimateContext(state);
  return {
    direction: metadata.atmosphereDirection || options.atmosphereDirection || "",
    label: metadata.atmosphereLabel || coordinates.atmosphereLabel || "",
    windAngle: numberOrNull(metadata.windAngle),
    windProfile: Array.isArray(metadata.windProfile) ? [...metadata.windProfile] : []
  };
}

function buildClimateBiomeSnapshot(state) {
  const {metadata} = buildClimateContext(state);
  return {
    counts: {...(metadata.biomeCounts || {})},
    total: Object.values(metadata.biomeCounts || {}).reduce((sum, value) => sum + (Number(value) || 0), 0)
  };
}

function exportAllMapData(state, documentRef, options = {}) {
  const map = assertApiMap(state);
  const document = createMapDocument(map, {
    ...(state.options || {}),
    visualTheme: currentVisualThemeId(state, documentRef)
  });
  const text = stringifyMapDocument(document);
  const filename = `${mapFileBaseName(map)}.webgl-map.json`;
  if (options.download === true) {
    downloadText(documentRef, text, filename, "application/json;charset=utf-8");
  }
  return withOptionalText(options, {
    filename,
    mimeType: "application/json;charset=utf-8",
    text,
    bytes: text.length,
    metadata: {
      type: document.type,
      version: document.version,
      seed: document.metadata.seed || "",
      checksum: document.metadata.checksum || ""
    }
  });
}

function exportPackGeoJson(state, documentRef, options = {}) {
  const map = assertApiMap(state);
  const geoJson = createMapGeoJson(map);
  const text = JSON.stringify(geoJson);
  const filename = `${mapFileBaseName(map)}.geojson`;
  if (options.download === true) {
    downloadText(documentRef, text, filename, "application/geo+json;charset=utf-8");
  }
  return withOptionalText(options, {
    filename,
    mimeType: "application/geo+json;charset=utf-8",
    text,
    bytes: text.length,
    metadata: {
      type: geoJson.type,
      name: geoJson.name || "",
      seed: geoJson.properties?.seed || "",
      checksum: geoJson.properties?.checksum || "",
      features: geoJson.features?.length || 0,
      coordinateReference: geoJson.properties?.coordinateReference || ""
    }
  });
}

async function exportCompressedAllMapData(state, documentRef, options = {}) {
  const map = assertApiMap(state);
  const document = createMapDocument(map, {
    ...(state.options || {}),
    visualTheme: currentVisualThemeId(state, documentRef)
  });
  const filename = `${mapFileBaseName(map)}.webgl-map.json.gz`;
  const metadata = {
    type: document.type,
    version: document.version,
    seed: document.metadata.seed || "",
    checksum: document.metadata.checksum || ""
  };
  if (options.download === true) {
    const result = await downloadCompressedMapDocument(documentRef, document, filename);
    return {
      filename,
      mimeType: "application/gzip",
      originalBytes: result.originalBytes,
      compressedBytes: result.compressedBytes,
      metadata
    };
  }

  const result = await createCompressedMapDocumentBlob(documentRef, document);
  const data = {
    filename,
    mimeType: "application/gzip",
    originalBytes: result.originalBytes,
    compressedBytes: result.compressedBytes,
    metadata
  };
  if (options.includeBase64 !== false) data.base64 = await blobToBase64(documentRef, result.blob);
  return data;
}

function exportFeatureGeoJsonData(state, documentRef, options = {}) {
  const map = assertApiMap(state);
  const layers = options.layers && typeof options.layers === "object" ? {...options.layers} : readFeatureGeoJsonLayerOptions(documentRef);
  const dissolvePolitical = typeof options.dissolvePolitical === "boolean" ? options.dissolvePolitical : readFeatureGeoJsonDissolveOption(documentRef);
  const geoJson = createMapFeatureGeoJson(map, {layers, dissolvePolitical});
  const text = JSON.stringify(geoJson);
  const filename = `${mapFileBaseName(map)}.features.geojson`;
  if (options.download === true) {
    downloadText(documentRef, text, filename, "application/geo+json;charset=utf-8");
  }
  return withOptionalText(options, {
    filename,
    mimeType: "application/geo+json;charset=utf-8",
    text,
    bytes: text.length,
    metadata: {
      type: geoJson.type,
      name: geoJson.name || "",
      seed: geoJson.properties?.seed || "",
      checksum: geoJson.properties?.checksum || "",
      features: geoJson.features?.length || 0,
      layerSet: geoJson.properties?.layerSet || "",
      dissolvedPolitical: Boolean(geoJson.properties?.dissolvedPolitical)
    }
  });
}

async function exportPngData(state, documentRef, options = {}) {
  const map = assertApiMap(state);
  const canvas = documentRef.getElementById("map-canvas");
  const filename = `${mapFileBaseName(map)}.png`;
  const pixelScale = normalizePngApiScale(options.pixelScale ?? options.scale ?? readPngExportScale(documentRef));
  const includeMapOverlays = options.includeMapOverlays !== false;
  const pngOptions = {includeMapOverlays, pixelScale, renderer: state.renderer};
  if (options.download === true) {
    const result = await downloadCanvasPng(documentRef, canvas, filename, pngOptions);
    return {
      filename,
      mimeType: "image/png",
      bytes: result.bytes,
      width: result.width,
      height: result.height,
      pixelScale: result.pixelScale,
      includeMapOverlays
    };
  }

  const result = await createCanvasPngBlob(documentRef, canvas, pngOptions);
  const data = {
    filename,
    mimeType: "image/png",
    bytes: result.blob.size,
    width: result.width,
    height: result.height,
    pixelScale: result.pixelScale,
    includeMapOverlays
  };
  if (options.includeDataUrl !== false) data.dataUrl = await blobToDataUrl(documentRef, result.blob);
  return data;
}

function assertApiMap(state) {
  if (!state?.map) throw new Error("当前没有可导出的地图");
  return state.map;
}

function withOptionalText(options, payload) {
  if (options.includeText === false || options.download === true && options.includeText !== true) {
    const {text: _text, ...summary} = payload;
    return summary;
  }
  return payload;
}

function currentVisualThemeId(state, documentRef) {
  const preferences = readControlPreferences(documentRef);
  return preferences.visualTheme || state?.map?.visualTheme?.preset || state?.options?.visualTheme || "default";
}

function updateLayerControlState(documentRef, layer, visible) {
  const patch = layer === "coastline" ? {coastline: visible, lakeShore: visible} : {[layer]: visible};
  for (const [item, enabled] of Object.entries(patch)) {
    const control = documentRef.querySelector(`[data-layer="${cssEscape(item)}"]`);
    if (!control) continue;
    if (control.tagName === "BUTTON") {
      control.classList.toggle("active", enabled);
      control.setAttribute("aria-pressed", enabled ? "true" : "false");
    } else {
      control.checked = enabled;
    }
  }
}

function updateUnitControls(documentRef, units) {
  const normalized = normalizeUnitPreferences(units);
  setControlValue(documentRef, "distance-unit", normalized.distanceUnit);
  setControlValue(documentRef, "area-unit", normalized.areaUnit);
  setControlValue(documentRef, "number-abbreviation", normalized.numberAbbreviation);
  setControlValue(documentRef, "map-scale-km-per-cm", normalized.mapScaleKmPerCm);
  setControlValue(documentRef, "population-scale", normalized.populationScale);
  setControlValue(documentRef, "military-scale", normalized.militaryScale);
  setControlValue(documentRef, "precipitation-scale", normalized.precipitationScale);
}

function setControlValue(documentRef, id, value) {
  const control = documentRef.getElementById(id);
  if (control) control.value = String(value);
}

function readFeatureGeoJsonLayerOptions(documentRef) {
  return {
    state: documentRef.getElementById("feature-export-layer-state")?.checked === true,
    province: documentRef.getElementById("feature-export-layer-province")?.checked === true,
    city: documentRef.getElementById("feature-export-layer-city")?.checked !== false,
    route: documentRef.getElementById("feature-export-layer-route")?.checked !== false,
    river: documentRef.getElementById("feature-export-layer-river")?.checked !== false,
    marker: documentRef.getElementById("feature-export-layer-marker")?.checked !== false,
    zone: documentRef.getElementById("feature-export-layer-zone")?.checked !== false
  };
}

function readFeatureGeoJsonDissolveOption(documentRef) {
  return documentRef.getElementById("feature-export-dissolve-political")?.checked === true;
}

function readPngExportScale(documentRef) {
  const value = Number(documentRef.getElementById("export-png-scale")?.value);
  return Number.isFinite(value) ? value : 1;
}

function normalizePngApiScale(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.max(1, Math.min(4, Math.round(number)));
}

function blobToDataUrl(documentRef, blob) {
  const view = documentRef.defaultView || window;
  return new Promise((resolve, reject) => {
    const reader = new view.FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")), {once: true});
    reader.addEventListener("error", () => reject(reader.error || new Error("PNG data URL 读取失败")), {once: true});
    reader.readAsDataURL(blob);
  });
}

async function blobToBase64(documentRef, blob) {
  const view = documentRef.defaultView || window;
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return view.btoa(binary);
}

function cssEscape(value) {
  if (globalThis.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}

function summarizeSelection(selection) {
  if (!selection) return null;
  return {
    object: summarizeObject(selection.object),
    cell: numberOrNull(selection.cell),
    x: numberOrNull(selection.x),
    y: numberOrNull(selection.y)
  };
}

function summarizeObject(object) {
  if (!object) return null;
  return {
    kind: object.kind || "",
    id: object.id ?? object.i ?? null,
    name: object.name || object.fullName || object.label || ""
  };
}

function countPoliticalItems(items) {
  if (!Array.isArray(items)) return 0;
  return items.filter(item => item && !item.removed && numberOrZero(item.i ?? item.id) > 0).length;
}

function countArrayItems(items) {
  if (!Array.isArray(items)) return 0;
  return items.filter(Boolean).length;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
