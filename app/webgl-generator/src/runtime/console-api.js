import {readControlPreferences, setActiveModeButton, updateControlPreferences, updateLayerPreference} from "../ui/panel.js";
import {formatArea as formatDisplayArea, formatDistance as formatDisplayDistance, normalizeUnitPreferences, precipitationUnitsToMillimeters} from "../ui/display-units.js";
import {createCanvasPngBlob, createCompressedMapDocumentBlob, createMapDocument, createMapFeatureGeoJson, createMapGeoJson, downloadCanvasPng, downloadCompressedMapDocument, downloadText, mapFileBaseName, stringifyMapDocument} from "./map-file-io.js";
import {apiCall} from "./api-result.js";
import {NAMEBASE_BINDING_TARGETS, createLegacyNamebaseText, createNamebaseDocument, getNamebaseBindingStatus, getNamebaseSummariesForMap} from "../generator/namebase-store.js";
import {measurementArea, measurementDisplayPoints, measurementDistance} from "./measurement-objects.js";
import {MEASUREMENT_ROUTE_FIT_ROADS, normalizeMeasurementRouteFit} from "./measurement-route-fit.js";
import {OBJECT_KIND_LABEL} from "./object-kinds.js";
import {resolveObject} from "./object-resolver.js";
import {normalizeVisualThemeId} from "../renderer/themes.js";

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
      version: () => apiCall(() => buildApiVersion()),
      capabilities: () => apiCall(() => buildCapabilities()),
      mapSummary: () => apiCall(() => buildMapSummary(state)),
      runtimeStats: () => apiCall(() => buildRuntimeStats(state, documentRef)),
      healthEvents: (options = {}) => apiCall(() => buildHealthEventsSnapshot(state, options))
    }),
    generate: Object.freeze({
      getOptions: () => apiCall(() => requireApiAction(actions.generate?.getOptions, "generate.getOptions")()),
      setOptions: (patch = {}) => apiCall(() => requireApiAction(actions.generate?.setOptions, "generate.setOptions")(patch)),
      newMap: (options = {}) => apiCall(() => requireApiAction(actions.generate?.newMap, "generate.newMap")(options)),
      rerollSeed: (options = {}) => apiCall(() => requireApiAction(actions.generate?.rerollSeed, "generate.rerollSeed")(options)),
      regenerate: (kind, options = {}) => apiCall(() => requireApiAction(actions.generate?.regenerate, "generate.regenerate")(kind, options))
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
      setVisible: (layer, visible) => apiCall(() => setLayerVisible(state, documentRef, layer, visible)),
      setTheme: themeId => apiCall(() => setLayerVisualTheme(state, documentRef, themeId)),
      fitView: () => apiCall(() => fitLayerView(state, documentRef))
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
        set: (object, body, options = {}) => apiCall(() => requireApiAction(actions.edit?.notes?.set, "edit.notes.set")(object, body, options)),
        delete: (noteId, options = {}) => apiCall(() => requireApiAction(actions.edit?.notes?.delete, "edit.notes.delete")(noteId, options))
      }),
      measurements: Object.freeze({
        save: (points, options = {}) => apiCall(() => requireApiAction(actions.edit?.measurements?.save, "edit.measurements.save")(points, options)),
        rename: (measurementId, name) => apiCall(() => requireApiAction(actions.edit?.measurements?.rename, "edit.measurements.rename")(measurementId, name)),
        updatePoints: (measurementId, points, options = {}) => apiCall(() => requireApiAction(actions.edit?.measurements?.updatePoints, "edit.measurements.updatePoints")(measurementId, points, options)),
        delete: measurementId => apiCall(() => requireApiAction(actions.edit?.measurements?.delete, "edit.measurements.delete")(measurementId))
      }),
      cities: Object.freeze({
        add: gridCell => apiCall(() => requireApiAction(actions.edit?.cities?.add, "edit.cities.add")(gridCell)),
        delete: cityId => apiCall(() => requireApiAction(actions.edit?.cities?.delete, "edit.cities.delete")(cityId)),
        rename: (cityId, name) => apiCall(() => requireApiAction(actions.edit?.cities?.rename, "edit.cities.rename")(cityId, name)),
        setPopulation: (cityId, population) => apiCall(() => requireApiAction(actions.edit?.cities?.setPopulation, "edit.cities.setPopulation")(cityId, population))
      }),
      provinces: Object.freeze({
        add: gridCell => apiCall(() => requireApiAction(actions.edit?.provinces?.add, "edit.provinces.add")(gridCell)),
        delete: provinceId => apiCall(() => requireApiAction(actions.edit?.provinces?.delete, "edit.provinces.delete")(provinceId)),
        rename: (provinceId, name) => apiCall(() => requireApiAction(actions.edit?.provinces?.rename, "edit.provinces.rename")(provinceId, name)),
        setColor: (provinceId, color) => apiCall(() => requireApiAction(actions.edit?.provinces?.setColor, "edit.provinces.setColor")(provinceId, color))
      }),
      states: Object.freeze({
        add: gridCell => apiCall(() => requireApiAction(actions.edit?.states?.add, "edit.states.add")(gridCell)),
        delete: stateId => apiCall(() => requireApiAction(actions.edit?.states?.delete, "edit.states.delete")(stateId)),
        rename: (stateId, name) => apiCall(() => requireApiAction(actions.edit?.states?.rename, "edit.states.rename")(stateId, name)),
        setColor: (stateId, color) => apiCall(() => requireApiAction(actions.edit?.states?.setColor, "edit.states.setColor")(stateId, color)),
        setGovernment: (stateId, governmentKey) => apiCall(() => requireApiAction(actions.edit?.states?.setGovernment, "edit.states.setGovernment")(stateId, governmentKey))
      }),
      cultures: Object.freeze({
        add: (options = {}) => apiCall(() => requireApiAction(actions.edit?.cultures?.add, "edit.cultures.add")(options)),
        delete: cultureId => apiCall(() => requireApiAction(actions.edit?.cultures?.delete, "edit.cultures.delete")(cultureId)),
        rename: (cultureId, name) => apiCall(() => requireApiAction(actions.edit?.cultures?.rename, "edit.cultures.rename")(cultureId, name)),
        setColor: (cultureId, color) => apiCall(() => requireApiAction(actions.edit?.cultures?.setColor, "edit.cultures.setColor")(cultureId, color)),
        setParent: (cultureId, parentId) => apiCall(() => requireApiAction(actions.edit?.cultures?.setParent, "edit.cultures.setParent")(cultureId, parentId))
      }),
      religions: Object.freeze({
        add: (options = {}) => apiCall(() => requireApiAction(actions.edit?.religions?.add, "edit.religions.add")(options)),
        delete: religionId => apiCall(() => requireApiAction(actions.edit?.religions?.delete, "edit.religions.delete")(religionId)),
        rename: (religionId, name) => apiCall(() => requireApiAction(actions.edit?.religions?.rename, "edit.religions.rename")(religionId, name)),
        setColor: (religionId, color) => apiCall(() => requireApiAction(actions.edit?.religions?.setColor, "edit.religions.setColor")(religionId, color)),
        setParent: (religionId, parentId) => apiCall(() => requireApiAction(actions.edit?.religions?.setParent, "edit.religions.setParent")(religionId, parentId))
      }),
      routes: Object.freeze({
        delete: routeId => apiCall(() => requireApiAction(actions.edit?.routes?.delete, "edit.routes.delete")(routeId)),
        setNote: (routeId, body, options = {}) => apiCall(() => requireApiAction(actions.edit?.routes?.setNote, "edit.routes.setNote")(routeId, body, options))
      }),
      rivers: Object.freeze({
        rename: (riverId, name) => apiCall(() => requireApiAction(actions.edit?.rivers?.rename, "edit.rivers.rename")(riverId, name)),
        setWidthFactor: (riverId, widthFactor) => apiCall(() => requireApiAction(actions.edit?.rivers?.setWidthFactor, "edit.rivers.setWidthFactor")(riverId, widthFactor)),
        setNote: (riverId, body, options = {}) => apiCall(() => requireApiAction(actions.edit?.rivers?.setNote, "edit.rivers.setNote")(riverId, body, options))
      }),
      lakes: Object.freeze({
        rename: (lakeId, name) => apiCall(() => requireApiAction(actions.edit?.lakes?.rename, "edit.lakes.rename")(lakeId, name))
      }),
      labels: Object.freeze({
        addCustom: (options = {}) => apiCall(() => requireApiAction(actions.edit?.labels?.addCustom, "edit.labels.addCustom")(options)),
        delete: label => apiCall(() => requireApiAction(actions.edit?.labels?.delete, "edit.labels.delete")(label)),
        moveCustom: (labelId, point) => apiCall(() => requireApiAction(actions.edit?.labels?.moveCustom, "edit.labels.moveCustom")(labelId, point)),
        renameCustom: (labelId, text) => apiCall(() => requireApiAction(actions.edit?.labels?.renameCustom, "edit.labels.renameCustom")(labelId, text)),
        setNote: (label, body, options = {}) => apiCall(() => requireApiAction(actions.edit?.labels?.setNote, "edit.labels.setNote")(label, body, options)),
        restore: label => apiCall(() => requireApiAction(actions.edit?.labels?.restore, "edit.labels.restore")(label))
      }),
      markers: Object.freeze({
        add: (options = {}) => apiCall(() => requireApiAction(actions.edit?.markers?.add, "edit.markers.add")(options)),
        delete: markerId => apiCall(() => requireApiAction(actions.edit?.markers?.delete, "edit.markers.delete")(markerId)),
        move: (markerId, packCell) => apiCall(() => requireApiAction(actions.edit?.markers?.move, "edit.markers.move")(markerId, packCell)),
        setNote: (markerId, body, options = {}) => apiCall(() => requireApiAction(actions.edit?.markers?.setNote, "edit.markers.setNote")(markerId, body, options)),
        setVisual: (markerId, patch) => apiCall(() => requireApiAction(actions.edit?.markers?.setVisual, "edit.markers.setVisual")(markerId, patch))
      })
    }),
    data: Object.freeze({
      exportAll: (options = {}) => apiCall(() => exportAllMapData(state, documentRef, options)),
      exportMap: (options = {}) => apiCall(() => exportAllMapData(state, documentRef, options)),
      exportGEO: (options = {}) => apiCall(() => exportPackGeoJson(state, documentRef, options)),
      exportFeatureGEO: (options = {}) => apiCall(() => exportFeatureGeoJsonData(state, documentRef, options)),
      exportCompressedAll: (options = {}) => apiCall(() => exportCompressedAllMapData(state, documentRef, options)),
      exportPNG: (options = {}) => apiCall(() => exportPngData(state, documentRef, options)),
      exportNotes: (options = {}) => apiCall(() => exportNotesData(state, documentRef, options)),
      exportMeasurements: (options = {}) => apiCall(() => exportMeasurementsData(state, documentRef, options)),
      importMap: (document, options = {}) => apiCall(() => requireApiAction(actions.data?.importMap, "data.importMap")(document, options)),
      importGEO: (document, options = {}) => apiCall(() => requireApiAction(actions.data?.importGEO, "data.importGEO")(document, options))
    }),
    namebases: Object.freeze({
      list: (options = {}) => apiCall(() => listNamebases(state, options)),
      export: (options = {}) => apiCall(() => exportNamebasesData(state, documentRef, options)),
      import: (document, options = {}) => apiCall(() => requireApiAction(actions.namebases?.import, "namebases.import")(document, options)),
      create: (payload = {}) => apiCall(() => requireApiAction(actions.namebases?.create, "namebases.create")(payload)),
      copyBuiltin: (baseId, options = {}) => apiCall(() => requireApiAction(actions.namebases?.copyBuiltin, "namebases.copyBuiltin")(baseId, options)),
      update: (baseId, patch = {}) => apiCall(() => requireApiAction(actions.namebases?.update, "namebases.update")(baseId, patch)),
      delete: baseId => apiCall(() => requireApiAction(actions.namebases?.delete, "namebases.delete")(baseId)),
      clear: (options = {}) => apiCall(() => requireApiAction(actions.namebases?.clear, "namebases.clear")(options)),
      bind: (scope, target, baseId, options = {}) => apiCall(() => requireApiAction(actions.namebases?.bind, "namebases.bind")(scope, target, baseId, options)),
      renameObjects: (kind, ids, options = {}) => apiCall(() => requireApiAction(actions.namebases?.renameObjects, "namebases.renameObjects")(kind, ids, options))
    }),
    debug: Object.freeze({
      snapshot: (options = {}) => apiCall(() => buildDebugSnapshot(state, documentRef, options)),
      renderer: () => apiCall(() => buildDebugRendererSnapshot(state)),
      health: (options = {}) => apiCall(() => buildDebugHealthSnapshot(state, options))
    })
  };
  return Object.freeze(api);
}

function buildCapabilities() {
  return {
    apiVersion: API_VERSION,
    stability: API_STABILITY,
    namespaces: ["info", "generate", "selection", "layers", "units", "climate", "history", "edit", "data", "namebases", "debug"],
    methods: {
      info: ["version", "capabilities", "mapSummary", "runtimeStats", "healthEvents"],
      generate: ["getOptions", "setOptions", "newMap", "rerollSeed", "regenerate"],
      selection: ["get", "resolve", "select", "clear", "locate", "pick"],
      layers: ["get", "setViewMode", "setVisible", "setTheme", "fitView"],
      units: ["get", "apply"],
      climate: ["get", "getOptions", "getTemperature", "getPrecipitation", "getLatitude", "getAtmosphere", "getBiomes", "apply", "setLatitude", "setLatitudeRange", "setLongitudeRange", "setTemperature", "setPrecipitation", "setWind"],
      history: ["get", "undo", "redo"],
      edit: ["notes.set", "notes.delete", "measurements.save", "measurements.rename", "measurements.updatePoints", "measurements.delete", "cities.add", "cities.delete", "cities.rename", "cities.setPopulation", "provinces.add", "provinces.delete", "provinces.rename", "provinces.setColor", "states.add", "states.delete", "states.rename", "states.setColor", "states.setGovernment", "cultures.add", "cultures.delete", "cultures.rename", "cultures.setColor", "cultures.setParent", "religions.add", "religions.delete", "religions.rename", "religions.setColor", "religions.setParent", "routes.delete", "routes.setNote", "rivers.rename", "rivers.setWidthFactor", "rivers.setNote", "lakes.rename", "labels.addCustom", "labels.delete", "labels.moveCustom", "labels.renameCustom", "labels.setNote", "labels.restore", "markers.add", "markers.delete", "markers.move", "markers.setNote", "markers.setVisual"],
      data: ["exportAll", "exportMap", "exportGEO", "exportFeatureGEO", "exportCompressedAll", "exportPNG", "exportNotes", "exportMeasurements", "importMap", "importGEO"],
      namebases: ["list", "export", "import", "create", "copyBuiltin", "update", "delete", "clear", "bind", "renameObjects"],
      debug: ["snapshot", "renderer", "health"]
    },
    sideEffects: {
      info: "readonly",
      generate: "map-regeneration",
      selection: "readonly",
      layers: "display-preference",
      units: "display-preference",
      climate: "readonly-and-climate-update",
      history: "edit-history",
      edit: "edit-command",
      data: "readonly-download-and-map-import",
      namebases: "readonly-download-and-edit-command",
      debug: "readonly-diagnostics"
    }
  };
}

function requireApiAction(action, name) {
  if (typeof action !== "function") throw new Error(`API action 未安装：${name}`);
  return action;
}

function buildApiVersion() {
  return {
    apiVersion: API_VERSION,
    stability: API_STABILITY
  };
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
  const health = buildHealthEventsSnapshot(state, {limit: 20}).events;
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

function buildDebugSnapshot(state, documentRef, options = {}) {
  const health = buildDebugHealthSnapshot(state, {limit: options.limit ?? 20, severity: options.severity});
  const renderer = buildDebugRendererSummary(state);
  const loading = buildLoadingSnapshot(documentRef);
  return {
    api: buildApiVersion(),
    location: buildDocumentLocationSnapshot(documentRef),
    app: {
      ready: Boolean(state),
      mapReady: Boolean(state?.map),
      rendererReady: Boolean(state?.renderer),
      loading
    },
    map: buildMapSummary(state),
    layers: buildLayerSnapshot(state, documentRef),
    units: buildUnitSnapshot(state, documentRef),
    selection: buildSelectionSnapshot(state),
    history: state?.editHistory?.getStats?.() || null,
    renderer,
    health
  };
}

function buildDebugRendererSnapshot(state) {
  const stats = state?.renderer?.getStats?.() || null;
  if (!stats) return {ready: false};
  return {
    ready: true,
    stats
  };
}

function buildDebugRendererSummary(state) {
  const stats = state?.renderer?.getStats?.() || null;
  if (!stats) return {ready: false};
  return {
    ready: true,
    webgl2: Boolean(stats.webgl2),
    colorMode: stats.colorMode || "",
    visualTheme: stats.viewOptions?.visualTheme?.id || "",
    vertexCount: numberOrZero(stats.vertexCount),
    lineVertexCount: numberOrZero(stats.lineVertexCount),
    pointVertexCount: numberOrZero(stats.pointVertexCount),
    routeVertexCount: numberOrZero(stats.routeVertexCount),
    riverVertexCount: numberOrZero(stats.riverVertexCount),
    camera: {...(stats.camera || {})},
    canvasSize: {...(stats.canvasSize || {})},
    draw: {...(stats.draw || {})},
    loadMap: stats.loadMap || null,
    dynamicMeshCache: {...(stats.dynamicMeshCache || {})}
  };
}

function buildDebugHealthSnapshot(state, options = {}) {
  const monitor = state?.healthMonitor || null;
  return {
    ...buildHealthEventsSnapshot(state, options),
    storageKey: monitor?.storageKey || "",
    thresholds: monitor?.thresholds || {},
    currentOperation: monitor?.currentOperation || null
  };
}

function buildDocumentLocationSnapshot(documentRef) {
  const view = documentRef.defaultView || window;
  return {
    href: view.location?.href || "",
    path: view.location?.pathname || "",
    search: view.location?.search || "",
    visibilityState: documentRef.visibilityState || "unknown",
    userAgent: view.navigator?.userAgent || ""
  };
}

function buildLoadingSnapshot(documentRef) {
  const loading = documentRef.getElementById("generation-loading");
  return {
    visible: Boolean(loading && !loading.hidden),
    text: documentRef.getElementById("generation-loading-text")?.textContent?.trim() || ""
  };
}

function buildHealthEventsSnapshot(state, options = {}) {
  const limit = normalizeHealthEventLimit(options.limit);
  const severity = normalizeHealthEventSeverity(options.severity ?? options.level);
  const rawEvents = state?.healthMonitor?.getEvents?.(limit) || [];
  const events = severity ? rawEvents.filter(event => event?.severity === severity || event?.level === severity) : rawEvents;
  const counts = events.reduce((summary, event) => {
    const key = event?.severity || event?.level || "unknown";
    summary[key] = (summary[key] || 0) + 1;
    return summary;
  }, {});
  return {
    events,
    total: events.length,
    counts,
    limit,
    severity: severity || "all"
  };
}

function normalizeHealthEventLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 20;
  return Math.max(1, Math.min(180, Math.round(number)));
}

function normalizeHealthEventSeverity(value) {
  const severity = String(value || "").trim().toLowerCase();
  if (!severity || severity === "all" || severity === "*") return "";
  if (["info", "warn", "warning", "error"].includes(severity)) return severity === "warning" ? "warn" : severity;
  throw new Error(`未知 health event 级别：${value}`);
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

function setLayerVisualTheme(state, documentRef, themeId) {
  const rawThemeId = String(themeId || "").trim();
  if (!rawThemeId) throw new Error("缺少视觉主题");
  const nextThemeId = normalizeVisualThemeId(rawThemeId);
  if (nextThemeId !== rawThemeId) throw new Error(`未知视觉主题：${themeId}`);
  setControlValue(documentRef, "visual-theme-preset", nextThemeId);
  updateControlPreferences(documentRef, {visualTheme: nextThemeId});
  state?.renderer?.setVisualTheme?.(nextThemeId);
  return buildLayerSnapshot(state, documentRef);
}

function fitLayerView(state, documentRef) {
  const renderer = state?.renderer;
  if (typeof renderer?.fitToView !== "function") throw new Error("当前 renderer 不支持适配视图");
  renderer.fitToView();
  const stats = renderer.getStats?.() || {};
  return {
    fitted: true,
    camera: {...(stats.camera || {})},
    layer: buildLayerSnapshot(state, documentRef)
  };
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
  const min = numberOrNull(metadata.precipitationMin);
  const max = numberOrNull(metadata.precipitationMax);
  return {
    min,
    max,
    unit: "internal-precipitation-index",
    millimetersPerUnit: 100,
    minMillimeters: min === null ? null : precipitationUnitsToMillimeters(min),
    maxMillimeters: max === null ? null : precipitationUnitsToMillimeters(max),
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

function listNamebases(state, options = {}) {
  const map = state?.map || null;
  const includeSource = options.includeSource === true;
  const summaries = getNamebaseSummariesForMap(map, {includeSource}).map(row => summarizeNamebaseApiRow(row, includeSource));
  const bindingStatus = getNamebaseBindingStatus(map);
  return {
    ready: Boolean(map),
    metadata: {
      version: numberOrNull(map?.namebases?.version) ?? 1,
      ...(map?.namebases?.metadata && typeof map.namebases.metadata === "object" ? {...map.namebases.metadata} : {}),
      builtinBases: summaries.filter(row => row.builtin).length,
      userBases: summaries.filter(row => !row.builtin).length,
      totalBases: summaries.length,
      totalSamples: summaries.reduce((sum, row) => sum + row.samples, 0)
    },
    bindingTargets: NAMEBASE_BINDING_TARGETS.map(target => ({...target})),
    bindings: cloneNamebaseBindings(bindingStatus.bindings),
    bindingUsage: cloneNamebaseUsage(bindingStatus.usageById),
    invalidBindings: bindingStatus.invalid.map(entry => ({...entry})),
    invalidBindingCount: bindingStatus.invalidCount,
    usedBindingCount: bindingStatus.used,
    bases: summaries
  };
}

function summarizeNamebaseApiRow(row, includeSource) {
  const summary = {
    index: numberOrZero(row.index),
    id: String(row.id || ""),
    name: String(row.name || row.id || ""),
    kind: String(row.kind || ""),
    category: String(row.category || ""),
    builtin: row.builtin === true,
    origin: String(row.origin || ""),
    samples: numberOrZero(row.samples),
    weightedSamples: numberOrZero(row.weightedSamples),
    weightedNameSamples: numberOrZero(row.weightedNameSamples),
    maxSampleWeight: numberOrZero(row.maxSampleWeight),
    chainDiversity: numberOrZero(row.chainDiversity),
    uniqueSamples: numberOrZero(row.uniqueSamples),
    duplicateSamples: numberOrZero(row.duplicateSamples),
    duplicateNames: cloneStringArray(row.duplicateNames),
    minLength: numberOrZero(row.minLength),
    maxLength: numberOrZero(row.maxLength),
    sampleMinLength: numberOrZero(row.sampleMinLength),
    sampleMaxLength: numberOrZero(row.sampleMaxLength),
    sampleMeanLength: numberOrZero(row.sampleMeanLength),
    sampleMedianLength: numberOrZero(row.sampleMedianLength),
    lengthOutlierSamples: numberOrZero(row.lengthOutlierSamples),
    lengthOutlierNames: cloneStringArray(row.lengthOutlierNames),
    disallowedRepeatSamples: numberOrZero(row.disallowedRepeatSamples),
    disallowedRepeatNames: cloneStringArray(row.disallowedRepeatNames),
    doubledChars: cloneStringArray(row.doubledChars),
    unusualChars: cloneStringArray(row.unusualChars),
    duplicateChars: String(row.duplicateChars || ""),
    examples: cloneStringArray(row.examples),
    note: String(row.note || ""),
    importedAt: String(row.importedAt || ""),
    bindingUsageCount: numberOrZero(row.bindingUsageCount),
    bindingUsageLabel: String(row.bindingUsageLabel || "")
  };
  if (includeSource) summary.source = cloneStringArray(row.source);
  return summary;
}

function cloneNamebaseBindings(bindings) {
  const source = bindings && typeof bindings === "object" ? bindings : {};
  const cultures = source.cultures && typeof source.cultures === "object" ? source.cultures : {};
  return {
    global: {...(source.global || {})},
    cultures: Object.fromEntries(Object.entries(cultures).map(([cultureId, cultureBindings]) => [
      String(cultureId),
      {...(cultureBindings || {})}
    ]))
  };
}

function cloneNamebaseUsage(usageById) {
  return Object.fromEntries(Object.entries(usageById || {}).map(([id, entries]) => [
    String(id),
    Array.isArray(entries) ? entries.map(entry => ({...entry})) : []
  ]));
}

function exportNamebasesData(state, documentRef, options = {}) {
  const map = assertApiMap(state);
  const format = normalizeNamebaseExportFormat(options.format);
  const baseIds = normalizeNamebaseApiBaseIds(options.baseIds ?? options.ids);
  const exportOptions = {
    includeUser: options.includeUser !== false,
    baseIds
  };
  if (format === "legacy") return exportLegacyNamebasesData(map, documentRef, options, exportOptions, baseIds);
  return exportJsonNamebasesData(map, documentRef, options, exportOptions, baseIds);
}

function exportJsonNamebasesData(map, documentRef, options, exportOptions, baseIds) {
  const document = createNamebaseDocument(map, exportOptions);
  const text = JSON.stringify(document, null, options.pretty === false ? 0 : 2);
  const filename = `${mapFileBaseName(map)}${baseIds ? ".namebases-selected.json" : ".namebases.json"}`;
  if (options.download === true) {
    downloadText(documentRef, text, filename, "application/json;charset=utf-8");
  }
  return withOptionalText(options, {
    filename,
    mimeType: "application/json;charset=utf-8",
    format: "json",
    text,
    bytes: text.length,
    metadata: {
      type: document.type,
      version: document.version,
      exportMode: document.exportMode,
      seed: document.metadata.seed || "",
      checksum: document.metadata.checksum || "",
      bases: numberOrZero(document.metadata.bases),
      samples: numberOrZero(document.metadata.samples),
      builtin: numberOrZero(document.metadata.builtin),
      user: numberOrZero(document.metadata.user)
    }
  });
}

function exportLegacyNamebasesData(map, documentRef, options, exportOptions, baseIds) {
  const text = createLegacyNamebaseText(map, exportOptions);
  const lines = text ? text.split(/\r?\n/g).filter(Boolean).length : 0;
  const filename = `${mapFileBaseName(map)}${baseIds ? ".namebases-selected.txt" : ".namebases.txt"}`;
  if (options.download === true) {
    downloadText(documentRef, text, filename, "text/plain;charset=utf-8");
  }
  return withOptionalText(options, {
    filename,
    mimeType: "text/plain;charset=utf-8",
    format: "legacy",
    text,
    bytes: text.length,
    metadata: {
      exportMode: baseIds ? "selected-namebases" : "all-namebases",
      seed: map.metadata?.seed || "",
      checksum: map.metadata?.checksum || "",
      bases: lines
    }
  });
}

function normalizeNamebaseExportFormat(format) {
  const value = String(format || "json").trim().toLowerCase();
  if (["legacy", "txt", "text", "fmg"].includes(value)) return "legacy";
  return "json";
}

function normalizeNamebaseApiBaseIds(baseIds) {
  if (!Array.isArray(baseIds)) return null;
  return baseIds.map(id => String(id || "").trim()).filter(Boolean);
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

function exportNotesData(state, documentRef, options = {}) {
  const map = assertApiMap(state);
  const ids = normalizeApiIdFilter(options.noteIds ?? options.ids);
  const notes = buildApiNoteRows(map, ids);
  const payload = {
    type: "webgl-generator-notes-summary",
    version: 1,
    exportedAt: new Date().toISOString(),
    metadata: {
      seed: map.metadata?.seed || "",
      checksum: map.metadata?.checksum || "",
      notes: notes.length,
      totalNotes: map.notes?.metadata?.notes || map.notes?.notes?.length || 0,
      exportMode: ids ? "selected-notes" : "all-notes"
    },
    notes
  };
  const text = JSON.stringify(payload, null, options.pretty === false ? 0 : 2);
  const filename = `${mapFileBaseName(map)}${ids ? ".notes-selected.json" : ".notes.json"}`;
  if (options.download === true) {
    downloadText(documentRef, text, filename, "application/json;charset=utf-8");
  }
  return withOptionalText(options, {
    filename,
    mimeType: "application/json;charset=utf-8",
    text,
    bytes: text.length,
    metadata: {...payload.metadata, type: payload.type, version: payload.version}
  });
}

function exportMeasurementsData(state, documentRef, options = {}) {
  const map = assertApiMap(state);
  const ids = normalizeApiIdFilter(options.measurementIds ?? options.ids);
  const units = normalizeUnitPreferences(readControlPreferences(documentRef).units);
  const measurements = buildApiMeasurementRows(map, units, ids);
  const payload = {
    type: "webgl-generator-measurements",
    version: 1,
    exportedAt: new Date().toISOString(),
    metadata: {
      seed: map.metadata?.seed || "",
      checksum: map.metadata?.checksum || "",
      measurements: measurements.length,
      totalMeasurements: map.measurements?.metadata?.measurements || map.measurements?.items?.length || 0,
      exportMode: ids ? "selected-measurements" : "all-measurements"
    },
    units: {
      distanceUnit: units.distanceUnit,
      areaUnit: units.areaUnit,
      mapScaleKmPerCm: units.mapScaleKmPerCm
    },
    measurements
  };
  const text = JSON.stringify(payload, null, options.pretty === false ? 0 : 2);
  const filename = `${mapFileBaseName(map)}${ids ? ".measurements-selected.json" : ".measurements.json"}`;
  if (options.download === true) {
    downloadText(documentRef, text, filename, "application/json;charset=utf-8");
  }
  return withOptionalText(options, {
    filename,
    mimeType: "application/json;charset=utf-8",
    text,
    bytes: text.length,
    metadata: {...payload.metadata, type: payload.type, version: payload.version}
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

function buildApiNoteRows(map, ids = null) {
  const idSet = ids ? new Set(ids) : null;
  return (map.notes?.notes || [])
    .filter(note => note?.id && (!idSet || idSet.has(String(note.id))))
    .map(note => {
      const object = objectFromNote(note);
      const resolved = object ? resolveObject(map, object) : null;
      const body = String(note.body || "");
      return {
        id: String(note.id),
        kind: note.kind || object?.kind || "",
        kindLabel: OBJECT_KIND_LABEL[note.kind] || note.kind || "备注",
        objectId: note.objectId ?? object?.id ?? "",
        name: note.name || resolved?.name || resolved?.fullName || resolved?.targetName || resolved?.text || note.id,
        body,
        bodyLength: body.length,
        orphan: Boolean(!object || !resolved),
        createdAt: note.createdAt || "",
        updatedAt: note.updatedAt || note.createdAt || ""
      };
    });
}

function objectFromNote(note) {
  const kind = String(note.kind || "").trim();
  if (!kind) return null;
  if (kind === "label") return labelObjectFromNote(note);
  const id = parseApiObjectId(note.objectId ?? suffixAfterKind(note.id, kind));
  if (id === null || id === "") return null;
  return {kind, id};
}

function labelObjectFromNote(note) {
  const objectId = String(note.objectId || suffixAfterKind(note.id, "label") || "");
  const [targetKind, rawTargetId] = objectId.split(":");
  if (!targetKind || rawTargetId === undefined) return null;
  const targetId = parseApiObjectId(rawTargetId);
  if (targetId === null || targetId === "") return null;
  return {
    kind: "label",
    id: targetId,
    targetKind,
    targetId,
    targetName: note.name || ""
  };
}

function buildApiMeasurementRows(map, units, ids = null) {
  const idSet = ids ? new Set(ids) : null;
  return (map.measurements?.items || [])
    .filter(item => item?.id && (!idSet || idSet.has(String(item.id))))
    .map(item => {
      const points = Array.isArray(item.points) ? item.points : [];
      const routeFit = normalizeMeasurementRouteFit(item.routeFit);
      const displayPoints = measurementDisplayPoints(item, map);
      const distance = Number(item.summary?.distanceMapUnits) || measurementDistance(displayPoints);
      const area = Number(item.summary?.areaMapUnits) || (routeFit !== MEASUREMENT_ROUTE_FIT_ROADS && displayPoints.length >= 3 ? measurementArea(displayPoints) : 0);
      const cellStops = Array.isArray(item.cellStops) ? item.cellStops : [];
      return {
        id: String(item.id),
        name: item.name || item.id,
        type: item.type || (item.closed ? "polygon" : "polyline"),
        routeFit,
        pointCount: points.length,
        displayPointCount: displayPoints.length,
        routeStopCount: cellStops.filter(Boolean).length,
        distanceMapUnits: roundApiExport(distance),
        distanceLabel: formatDisplayDistance(distance, units),
        areaMapUnits: roundApiExport(area),
        areaLabel: area ? formatDisplayArea(area, units) : "",
        cellStops,
        points: points.map((point, index) => ({
          index,
          x: roundApiExport(point.x),
          y: roundApiExport(point.y)
        })),
        createdAt: item.createdAt || "",
        updatedAt: item.updatedAt || item.createdAt || ""
      };
    });
}

function normalizeApiIdFilter(ids) {
  if (!Array.isArray(ids)) return null;
  const normalized = ids.map(id => String(id ?? "").trim()).filter(Boolean);
  return normalized.length ? normalized : null;
}

function suffixAfterKind(id, kind) {
  const prefix = `${kind}:`;
  return String(id || "").startsWith(prefix) ? String(id).slice(prefix.length) : "";
}

function parseApiObjectId(value) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value);
  return /^\d+$/.test(text) ? Number(text) : text;
}

function roundApiExport(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
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

function cloneStringArray(values) {
  return Array.isArray(values) ? values.map(value => String(value || "")) : [];
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
