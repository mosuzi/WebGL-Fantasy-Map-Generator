import {readControlPreferences} from "../ui/panel.js";
import {apiCall} from "./api-result.js";

const API_VERSION = "0.1.0";
const API_STABILITY = "experimental";

export function installConsoleApi(documentRef, state) {
  const view = documentRef.defaultView || window;
  const api = createConsoleApi(documentRef, state);
  view.webglGeneratorApi = api;
  if (!view.api) view.api = api;
  return api;
}

function createConsoleApi(documentRef, state) {
  const api = {
    version: API_VERSION,
    stability: API_STABILITY,
    info: Object.freeze({
      capabilities: () => apiCall(() => buildCapabilities()),
      mapSummary: () => apiCall(() => buildMapSummary(state)),
      runtimeStats: () => apiCall(() => buildRuntimeStats(state, documentRef))
    }),
    selection: Object.freeze({
      get: () => apiCall(() => buildSelectionSnapshot(state))
    }),
    layers: Object.freeze({
      get: () => apiCall(() => buildLayerSnapshot(state, documentRef))
    })
  };
  return Object.freeze(api);
}

function buildCapabilities() {
  return {
    apiVersion: API_VERSION,
    stability: API_STABILITY,
    namespaces: ["info", "selection", "layers"],
    methods: {
      info: ["capabilities", "mapSummary", "runtimeStats"],
      selection: ["get"],
      layers: ["get"]
    },
    sideEffects: {
      info: "readonly",
      selection: "readonly",
      layers: "readonly"
    }
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
