import {readControlPreferences} from "../ui/panel.js";
import {createCanvasPngBlob, createCompressedMapDocumentBlob, createMapDocument, createMapFeatureGeoJson, createMapGeoJson, downloadCanvasPng, downloadCompressedMapDocument, downloadText, mapFileBaseName, stringifyMapDocument} from "./map-file-io.js";
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
    namespaces: ["info", "selection", "layers", "data"],
    methods: {
      info: ["capabilities", "mapSummary", "runtimeStats"],
      selection: ["get"],
      layers: ["get"],
      data: ["exportAll", "exportGEO", "exportFeatureGEO", "exportCompressedAll", "exportPNG"]
    },
    sideEffects: {
      info: "readonly",
      selection: "readonly",
      layers: "readonly",
      data: "readonly-download"
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
