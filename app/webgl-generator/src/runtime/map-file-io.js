import {readObjectNote} from "./object-notes.js";
import {normalizeVisualThemeDocument} from "../renderer/themes.js";
import {normalizeLabelStyleStore, validateLabelStyleStore} from "./label-style-registry.js";
import {normalizeLabelLayoutStore, validateLabelLayoutStore} from "./label-layout-registry.js";
import {PNG_FIXED_TEXT_ELEMENT_IDS, PNG_MILITARY_TEXT_SELECTOR, PNG_SEMANTIC_LABEL_SELECTORS} from "./canvas-text-contract.js";
import {normalizeSocialExpansionMap} from "./social-expansion-edit-commands.js";
import {backfillEconomyDisplayProperties, normalizeEconomyDisplayMap} from "../generator/economy-display-properties.js";
import {resolveBiomeDescriptor} from "../generator/biome-registry.js";
import {backfillProvinceNames} from "../generator/province-naming.js";
import {normalizeDiplomacyMap} from "./diplomacy-map-compatibility.js";
import {normalizeUnitPreferences} from "../ui/display-units.js";
import {normalizeOceanCurrentModel, OCEAN_CURRENT_MODEL_VERSION} from "../generator/ocean-currents.js";
import {normalizeRiverNetwork} from "../generator/river-network.js";
import {normalizeRiverControlPoints} from "./river-control-points.js";
import {isSharedCubicCurve, normalizeRiverVisualCurve, sampleCentripetalCatmullRom} from "../geometry/cubic-path.js";
import {normalizeLakeOverflowDiagnostics} from "../generator/lake-overflow.js";
import {normalizeRegenerationLockStore, validateRegenerationLockStore} from "./regeneration-locks.js";
import {normalizeZoneMap, resolveZoneContext} from "./zone-context.js";
import {normalizeZoneTypeRecord} from "./zone-types.js";
import {
  NETWORK_GEOJSON_PROPERTY_SCHEMA_ID,
  NETWORK_GEOJSON_PROPERTY_SCHEMA_VERSION,
  serializeRiverGeoJsonProperties,
  serializeRouteGeoJsonProperties
} from "./network-geojson-properties.js";
import {isCompressedMapDocumentFilename, mapBaseFilename, synchronizeMapName} from "./map-filename.js";
import {reconcileSettlementCellIdentity} from "./settlement-cell-index.js";
import {diagnoseSettlementPortTopology} from "./settlement-port-topology.js";
import {MAP_CELLS_MAX, normalizeMapCellTarget} from "../generator/map-size.js";
import {
  decodeWebfmgV3Document,
  encodeWebfmgV3Document,
  gunzipWebfmgV3Bytes,
  gzipWebfmgV3Bytes,
  isWebfmgV3Bytes
} from "./webfmg-v3-container.js";

export const MAP_DOCUMENT_TYPE = "webgl-generator-map";
export const MAP_DOCUMENT_VERSION = 2;
export const MAP_SCHEMA_VERSION = 2;
export const PNG_OVERLAY_KEYS = Object.freeze(["labels", "cityIcons", "markers", "military", "measurements", "legend", "scaleBar"]);
export const GEOJSON_RANGE_MODES = Object.freeze(["full", "viewport", "bbox"]);

const PNG_OVERLAY_DEFAULTS = Object.freeze({labels: true, cityIcons: true, markers: true, military: true, measurements: false, legend: true, scaleBar: true});
const PNG_CROP_MODES = new Set(["viewport", "map", "pixel", "world"]);
const GEOJSON_RANGE_MODE_SET = new Set(GEOJSON_RANGE_MODES);

const TYPED_ARRAYS = Object.freeze({
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  BigInt64Array: typeof BigInt64Array === "function" ? BigInt64Array : null,
  BigUint64Array: typeof BigUint64Array === "function" ? BigUint64Array : null
});

export function createMapDocument(map, options = {}) {
  if (!map) throw new Error("当前没有可导出的地图");
  const documentOptions = {...(options || {})};
  const display = documentOptions.display;
  delete documentOptions.display;
  const normalizedMap = normalizeMapSchemaV2(map, {...documentOptions, display});
  return {
    type: MAP_DOCUMENT_TYPE,
    version: MAP_DOCUMENT_VERSION,
    exportedAt: new Date().toISOString(),
    app: "fmg-webgl-reimplementation",
    metadata: {
      name: normalizedMap.metadata?.name || normalizedMap.options?.mapName,
      seed: normalizedMap.metadata?.seed || documentOptions.seed,
      checksum: normalizedMap.metadata?.checksum || null,
      generatorStage: normalizedMap.metadata?.generatorStage || null,
      mapSchemaVersion: MAP_SCHEMA_VERSION
    },
    options: documentOptions,
    map: normalizedMap
  };
}

export function stringifyMapDocument(document) {
  return JSON.stringify(document, typedArrayReplacer);
}

export function parseMapDocument(text) {
  const document = JSON.parse(text, typedArrayReviver);
  return migrateMapDocument(document);
}

export async function parseMapDocumentPayload(documentRef, payload) {
  if (typeof payload === "string") return parseMapDocument(payload);
  if (payload instanceof ArrayBuffer || ArrayBuffer.isView(payload)) return parseBinaryMapDocumentPayload(documentRef, payload);
  if (isMapDocumentFileLike(payload)) return parseMapDocumentFile(documentRef, payload);
  if (isGzipBase64MapPayload(payload)) {
    const data = payload.base64 ?? payload.data;
    return parseBinaryMapDocumentPayload(documentRef, await decompressGzipBase64Bytes(documentRef, data));
  }
  if (payload?.encoding === "plain") return parseMapDocument(String(payload.data || ""));
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("地图导入文档必须是 JSON 字符串、对象、File/Blob 或 gzip-base64 payload");
  }
  return parseMapDocument(JSON.stringify(payload));
}

export async function parseMapDocumentFile(documentRef, file) {
  if (!file) throw new Error("未选择地图文件");
  if (typeof file.arrayBuffer === "function") return parseBinaryMapDocumentPayload(documentRef, await file.arrayBuffer());
  const text = isCompressedMapDocumentFile(file) ? await decompressMapDocumentFile(documentRef, file) : await file.text();
  return parseMapDocument(text);
}

export async function downloadCompressedMapDocument(documentRef, document, filename) {
  const result = await createCompressedMapDocumentBlob(documentRef, document);
  downloadBlob(documentRef, result.blob, filename);
  return {
    originalBytes: result.originalBytes,
    compressedBytes: result.compressedBytes
  };
}

export async function createCompressedMapDocumentBlob(documentRef, document) {
  const view = documentRef?.defaultView || globalThis;
  const raw = encodeWebfmgV3Document(document);
  const compressed = await gzipWebfmgV3Bytes(raw, view);
  return {
    blob: new view.Blob([compressed], {type: "application/gzip"}),
    originalBytes: raw.byteLength,
    compressedBytes: compressed.byteLength,
    encoding: "webfmg-v3",
    mimeType: "application/gzip"
  };
}

export async function parseBinaryMapDocumentPayload(documentRef, source) {
  const view = documentRef?.defaultView || globalThis;
  const bytes = source instanceof Uint8Array
    ? source
    : source instanceof ArrayBuffer
      ? new Uint8Array(source)
      : new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  if (isWebfmgV3Bytes(bytes)) return migrateMapDocument(decodeWebfmgV3Document(bytes));
  if (isGzipBytes(bytes)) {
    const decompressed = await gunzipWebfmgV3Bytes(bytes, view);
    if (isWebfmgV3Bytes(decompressed)) return migrateMapDocument(decodeWebfmgV3Document(decompressed));
    return parseMapDocument(new view.TextDecoder().decode(decompressed));
  }
  return parseMapDocument(new view.TextDecoder().decode(bytes));
}

export async function createCompressedMapTextBlob(documentRef, text) {
  const source = String(text || "");
  const originalBytes = textByteLength(documentRef, source);
  const blob = await createGzipTextBlob(documentRef, source);
  return {
    blob,
    originalBytes,
    compressedBytes: blob.size
  };
}

export function validateMapDocumentForExport(document) {
  validateCurrentMapDocument(document);
  return document;
}

export function migrateMapDocument(document) {
  const versioned = migrateMapDocumentWithRegistry(document, {
    targetVersion: MAP_DOCUMENT_VERSION,
    registry: MAP_DOCUMENT_MIGRATORS
  });
  assertMapDocumentCellLimit(versioned.map);
  const migrated = normalizeMapDocumentDisplay({
    ...versioned,
    metadata: {...(versioned.metadata || {}), mapSchemaVersion: MAP_SCHEMA_VERSION},
    options: {...(versioned.options || {})},
    map: normalizeCurrentMapSchemaV2(versioned.map, versioned.options)
  });
  backfillEconomyDisplayProperties(migrated.map);
  backfillProvinceNames(migrated.map);
  migrated.map = normalizeDiplomacyMap(migrated.map);
  migrated.map.oceanCurrents = normalizeOceanCurrentModel(migrated.map.oceanCurrents);
  migrated.map = normalizeLakeOverflowMap(migrated.map);
  migrated.map = normalizeZoneMap(migrated.map);
  applyRegenerationLockCompatibility(migrated.map, versioned.map?.regenerationLocks);
  reconcileSettlementCellIdentity(migrated.map);
  diagnoseSettlementPortTopology(migrated.map);
  validateCurrentMapDocument(migrated);
  return migrated;
}

export function migrateMapDocumentWithRegistry(document, options = {}) {
  if (document?.type !== MAP_DOCUMENT_TYPE) throw new Error("文件不是当前地图保存格式");
  if (!document.map || typeof document.map !== "object") throw new Error("地图文件缺少 map 数据");
  const targetVersion = Number(options.targetVersion ?? MAP_DOCUMENT_VERSION);
  if (!Number.isInteger(targetVersion) || targetVersion < 1) throw new Error(`迁移目标版本无效：${options.targetVersion}`);
  const registry = options.registry || MAP_DOCUMENT_MIGRATORS;
  const sourceVersion = Number(document.version);
  if (!Number.isInteger(sourceVersion) || sourceVersion < 1) throw new Error(`暂不支持的地图格式版本：${document.version ?? "未知"}`);
  if (sourceVersion > targetVersion) throw new Error(`暂不支持的地图格式版本：${document.version}`);
  let migrated = document;
  for (let version = sourceVersion; version < targetVersion; version += 1) {
    migrated = migrateMapDocumentStep(migrated, version, registry);
  }
  if (typeof options.validate === "function") options.validate(migrated);
  return migrated;
}

export function createMapDocumentMigrationRegistry(entries = {}) {
  const registry = new Map();
  for (const [version, migrator] of entries instanceof Map ? entries : Object.entries(entries)) {
    registerMapDocumentMigrator(registry, version, migrator);
  }
  return registry;
}

export function registerMapDocumentMigrator(registry, version, migrator) {
  if (!(registry instanceof Map)) throw new Error("地图迁移 registry 必须是 Map");
  const sourceVersion = Number(version);
  if (!Number.isInteger(sourceVersion) || sourceVersion < 1) throw new Error(`地图迁移源版本无效：${version}`);
  if (typeof migrator !== "function") throw new Error(`地图格式 v${sourceVersion} 迁移器必须是函数`);
  if (registry.has(sourceVersion)) throw new Error(`地图格式 v${sourceVersion} 迁移器重复注册`);
  registry.set(sourceVersion, migrator);
  return registry;
}

export function parseGeoJsonMeasurements(text, map, options = {}) {
  const document = JSON.parse(text);
  const features = geoJsonFeatures(document);
  if (!features.length) throw new Error("GEO 数据中没有可导入的 GeoJSON Feature");
  const measurements = [];
  const limit = Math.max(1, Number(options.limit) || 500);
  let convertedFeatureCount = 0;
  for (const feature of features) {
    if (measurements.length >= limit) break;
    const featureMeasurements = measurementsFromFeature(feature, map, limit - measurements.length);
    if (featureMeasurements.length) convertedFeatureCount += 1;
    measurements.push(...featureMeasurements);
  }
  if (!measurements.length) throw new Error("GEO 数据中没有可转换为测量对象的几何");
  return {
    type: "webgl-generator-geo-measurements-import",
    sourceType: document?.type || "FeatureCollection",
    featureCount: features.length,
    importedCount: measurements.length,
    skippedCount: Math.max(0, features.length - convertedFeatureCount),
    measurements
  };
}

export function createMapGeoJson(map, options = {}) {
  if (!map) throw new Error("当前没有可导出的地图");
  const cells = map.pack?.cells;
  const vertices = map.pack?.vertices?.p;
  if (!cells?.i || !vertices) throw new Error("当前地图缺少 pack cell 地理数据");
  const range = normalizeGeoJsonExportRange(map, options.range, {viewportBbox: options.viewportBbox});
  const features = [];
  for (let index = 0; index < cells.i.length; index += 1) {
    const vertexIds = cells.v?.[index];
    if (!Array.isArray(vertexIds) || vertexIds.length < 3) continue;
    const ring = vertexIds.map(vertexId => projectWorldPoint(vertices[vertexId], map)).filter(Boolean);
    if (ring.length < 3) continue;
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
    const stateId = Number(cells.state?.[index]) || 0;
    const provinceId = Number(cells.province?.[index]) || 0;
    const cultureId = Number(cells.culture?.[index]) || 0;
    const religionId = Number(cells.religion?.[index]) || 0;
    const biomeId = Number(cells.biome?.[index]) || 0;
    const biome = resolveBiomeDescriptor(biomeId, map.climate?.biomes);
    const feature = {
      type: "Feature",
      id: Number(cells.i[index]) || index,
      properties: {
        cell: Number(cells.i[index]) || index,
        height: Number(cells.h?.[index]) || 0,
        isWater: (Number(cells.h?.[index]) || 0) < 20,
        feature: Number(cells.f?.[index]) || 0,
        biome: biomeId,
        biomeName: biome.name,
        biomeCanonicalName: biome.canonicalName,
        state: stateId,
        stateName: map.politics?.states?.[stateId]?.name || "",
        province: provinceId,
        provinceName: map.politics?.provinces?.[provinceId]?.name || "",
        culture: cultureId,
        cultureName: map.society?.cultures?.[cultureId]?.name || "",
        religion: religionId,
        religionName: map.society?.religions?.[religionId]?.name || "",
        population: Number(cells.pop?.[index]) || 0
      },
      geometry: {
        type: "Polygon",
        coordinates: [ring]
      }
    };
    if (range.mode !== "full" && !geometryIntersectsBbox(feature.geometry, range.coordinateBbox)) continue;
    features.push(feature);
  }

  return attachGeoJsonBboxes(withGeoJsonSpatialMetadata({
    type: "FeatureCollection",
    name: map.metadata?.seed ? `fmg-${map.metadata.seed}` : "fmg-webgl-map",
    properties: {
      source: "fmg-webgl-reimplementation",
      seed: map.metadata?.seed || "",
      checksum: map.metadata?.checksum || "",
      generatedAt: map.metadata?.generatedAt || "",
      graphWidth: map.metadata?.graphWidth || 0,
      graphHeight: map.metadata?.graphHeight || 0,
      coordinateReference: "approximate-equirectangular"
    },
    features
  }, map, range));
}

export function createMapFeatureGeoJson(map, options = {}) {
  if (!map) throw new Error("当前没有可导出的地图");
  const layers = normalizeFeatureLayerOptions(options.layers);
  const dissolvePolitical = options.dissolvePolitical === true;
  const range = normalizeGeoJsonExportRange(map, options.range, {viewportBbox: options.viewportBbox});
  const allFeatures = [
    ...(layers.state ? stateFeatures(map, {dissolve: dissolvePolitical}) : []),
    ...(layers.province ? provinceFeatures(map, {dissolve: dissolvePolitical}) : []),
    ...(layers.city ? cityFeatures(map) : []),
    ...(layers.route ? routeFeatures(map) : []),
    ...(layers.river ? riverFeatures(map) : []),
    ...(layers.marker ? markerFeatures(map) : []),
    ...(layers.zone ? zoneFeatures(map, {dissolve: dissolvePolitical}) : [])
  ];
  const features = range.mode === "full"
    ? allFeatures
    : allFeatures.filter(feature => geometryIntersectsBbox(feature.geometry, range.coordinateBbox));
  const layerSet = selectedFeatureLayerNames(layers);

  return attachGeoJsonBboxes(withGeoJsonSpatialMetadata({
    type: "FeatureCollection",
    name: map.metadata?.seed ? `fmg-${map.metadata.seed}-features` : "fmg-webgl-map-features",
    properties: {
      source: "fmg-webgl-reimplementation",
      layerSet: layerSet.length ? layerSet.join("-") : "none",
      seed: map.metadata?.seed || "",
      checksum: map.metadata?.checksum || "",
      generatedAt: map.metadata?.generatedAt || "",
      coordinateReference: "approximate-equirectangular",
      networkPropertySchema: NETWORK_GEOJSON_PROPERTY_SCHEMA_ID,
      networkPropertySchemaVersion: NETWORK_GEOJSON_PROPERTY_SCHEMA_VERSION,
      dissolvedPolitical: dissolvePolitical,
      states: layers.state ? countValidPoliticalObjects(map.politics?.states) : 0,
      provinces: layers.province ? countValidPoliticalObjects(map.politics?.provinces) : 0,
      cities: layers.city ? map.settlements?.cities?.length || 0 : 0,
      routes: layers.route ? map.settlements?.routes?.length || 0 : 0,
      rivers: layers.river ? map.rivers?.rivers?.length || 0 : 0,
      markers: layers.marker ? map.markers?.markers?.length || 0 : 0,
      zones: layers.zone ? map.zones?.zones?.length || 0 : 0
    },
    features
  }, map, range));
}

export function normalizeGeoJsonExportRange(map, source = null, options = {}) {
  if (!map) throw new Error("当前没有可导出的地图");
  const width = Number(map.metadata?.graphWidth) || Number(map.options?.graphWidth) || 0;
  const height = Number(map.metadata?.graphHeight) || Number(map.options?.graphHeight) || 0;
  if (!(width > 0) || !(height > 0)) throw new Error("当前地图缺少有效世界边界");
  const input = source == null ? {mode: "full"} : source;
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("GeoJSON 导出范围必须是对象");
  const requestedMode = String(input.mode || "full").toLowerCase();
  const mode = requestedMode === "world" ? "bbox" : requestedMode;
  if (!GEOJSON_RANGE_MODE_SET.has(mode)) throw new Error(`不支持的 GeoJSON 导出范围：${requestedMode}`);
  const worldBounds = [0, 0, width, height];
  let worldBbox = worldBounds;
  if (mode === "bbox") worldBbox = normalizeExplicitWorldBbox(input.bbox, worldBounds);
  if (mode === "viewport") worldBbox = normalizeViewportWorldBbox(options.viewportBbox, worldBounds);
  return {
    mode,
    worldBounds: worldBounds.map(roundCoordinate),
    worldBbox: worldBbox.map(roundCoordinate),
    coordinateBounds: projectWorldBbox(worldBounds, map),
    coordinateBbox: projectWorldBbox(worldBbox, map),
    inclusion: "intersects-complete-feature",
    geometriesClipped: false
  };
}

export function downloadJson(documentRef, data, filename, replacer = null) {
  const text = JSON.stringify(data, replacer);
  downloadBlob(documentRef, new Blob([text], {type: "application/json;charset=utf-8"}), filename);
}

export function downloadText(documentRef, text, filename, type = "text/plain;charset=utf-8") {
  downloadBlob(documentRef, new Blob([text], {type}), filename);
}

export async function downloadCanvasPng(documentRef, canvas, filename, options = {}) {
  const result = await createCanvasPngBlob(documentRef, canvas, options);
  downloadBlob(documentRef, result.blob, filename);
  return {
    bytes: result.blob.size,
    width: result.width,
    height: result.height,
    pixelScale: result.pixelScale,
    includeMapOverlays: result.includeMapOverlays,
    transparentBackground: result.transparentBackground,
    crop: result.crop,
    overlays: result.overlays
  };
}

export async function downloadHeightmapPng(documentRef, map, filename, options = {}) {
  const result = await createHeightmapPngBlob(documentRef, map, options);
  downloadBlob(documentRef, result.blob, filename);
  return {
    bytes: result.blob.size,
    width: result.width,
    height: result.height,
    pixelScale: result.pixelScale,
    cellCount: result.cellCount,
    minHeight: result.minHeight,
    maxHeight: result.maxHeight,
    encoding: result.encoding
  };
}

export async function createHeightmapPngBlob(documentRef, map, options = {}) {
  const result = createHeightmapCanvas(documentRef, map, options);
  return {
    ...result,
    blob: await canvasToBlob(result.canvas)
  };
}

export function createHeightmapCanvas(documentRef, map, options = {}) {
  if (!map) throw new Error("当前没有可导出的地图");
  const graphWidth = Number(map.metadata?.graphWidth ?? map.options?.graphWidth);
  const graphHeight = Number(map.metadata?.graphHeight ?? map.options?.graphHeight);
  if (!(graphWidth > 0) || !(graphHeight > 0)) throw new Error("当前地图缺少有效世界尺寸");

  const grid = map.grid;
  const cellVertices = grid?.cells?.v;
  const heights = grid?.cells?.h;
  const vertices = grid?.vertices?.p;
  if (!Array.isArray(cellVertices) || !heights || !Array.isArray(vertices) || cellVertices.length !== heights.length) {
    throw new Error("当前地图缺少完整的 Grid 高度或 Voronoi 几何");
  }

  const pixelScale = normalizePngPixelScale(options.pixelScale);
  const width = Math.max(1, Math.round(graphWidth * pixelScale));
  const height = Math.max(1, Math.round(graphHeight * pixelScale));
  const canvas = documentRef.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器不支持高度灰度图导出");

  context.imageSmoothingEnabled = false;
  context.fillStyle = "#000000";
  context.fillRect(0, 0, width, height);
  context.save();
  context.scale(pixelScale, pixelScale);
  context.lineJoin = "round";
  context.lineWidth = 1 / pixelScale;

  const shadeBuckets = Array.from({length: 256}, () => []);
  let minHeight = 100;
  let maxHeight = 0;
  for (let cell = 0; cell < cellVertices.length; cell++) {
    const heightValue = clampHeightmapHeight(heights[cell]);
    minHeight = Math.min(minHeight, heightValue);
    maxHeight = Math.max(maxHeight, heightValue);
    shadeBuckets[heightToGrayscaleByte(heightValue)].push(cell);
  }

  for (let shade = 0; shade < shadeBuckets.length; shade++) {
    const cells = shadeBuckets[shade];
    if (!cells.length) continue;
    context.beginPath();
    for (const cell of cells) appendHeightmapCellPath(context, cellVertices[cell], vertices, cell);
    const color = `rgb(${shade}, ${shade}, ${shade})`;
    context.fillStyle = color;
    context.strokeStyle = color;
    context.fill();
    context.stroke();
  }
  context.restore();

  return {
    canvas,
    width,
    height,
    pixelScale,
    cellCount: cellVertices.length,
    minHeight,
    maxHeight,
    encoding: "linear-height-0-100-to-gray-0-255"
  };
}

export function heightToGrayscaleByte(height) {
  return Math.round(clampHeightmapHeight(height) * 255 / 100);
}

export async function createCanvasPngBlob(documentRef, canvas, options = {}) {
  if (!canvas?.toBlob) throw new Error("当前浏览器不支持 canvas 图片导出");
  const normalizedOptions = normalizePngExportOptions(options);
  const composed = normalizedOptions.includeMapOverlays || normalizedOptions.transparentBackground || normalizedOptions.pixelScale !== 1 || normalizedOptions.crop.mode !== "viewport" || options.renderer
    ? await composeMapExportCanvas(documentRef, canvas, {...options, ...normalizedOptions})
    : {canvas, crop: normalizedOptions.crop};
  const exportCanvas = composed.canvas;
  const blob = await canvasToBlob(exportCanvas);
  return {
    blob,
    width: exportCanvas.width || canvas.width || 0,
    height: exportCanvas.height || canvas.height || 0,
    ...normalizedOptions,
    crop: composed.crop
  };
}

function appendHeightmapCellPath(context, vertexIds, vertices, cell) {
  if (!Array.isArray(vertexIds) || vertexIds.length < 3) throw new Error(`Grid cell #${cell} 缺少有效 Voronoi 多边形`);
  for (let index = 0; index < vertexIds.length; index++) {
    const point = vertices[vertexIds[index]];
    if (!Array.isArray(point) || !Number.isFinite(Number(point[0])) || !Number.isFinite(Number(point[1]))) {
      throw new Error(`Grid cell #${cell} 含无效 Voronoi 顶点`);
    }
    if (index === 0) context.moveTo(Number(point[0]), Number(point[1]));
    else context.lineTo(Number(point[0]), Number(point[1]));
  }
  context.closePath();
}

function clampHeightmapHeight(value) {
  const height = Number(value);
  if (!Number.isFinite(height)) throw new Error("Grid 高度必须是有限数");
  return Math.max(0, Math.min(100, height));
}

export function normalizePngExportOptions(options = {}) {
  const includeMapOverlays = options.includeMapOverlays !== false;
  return {
    pixelScale: normalizePngPixelScale(options.pixelScale),
    includeMapOverlays,
    transparentBackground: options.transparentBackground === true,
    crop: normalizePngCropOptions(options.crop),
    overlays: normalizePngOverlayOptions(options.overlays, includeMapOverlays)
  };
}

export function normalizePngCropOptions(crop = {}) {
  const source = crop && typeof crop === "object" ? crop : {};
  const mode = String(source.mode || "viewport").trim().toLowerCase();
  if (!PNG_CROP_MODES.has(mode)) throw new Error(`PNG 裁剪模式不受支持：${source.mode}`);
  if (mode === "viewport" || mode === "map") return {mode, rect: null};
  const rectSource = source.rect && typeof source.rect === "object" ? source.rect : source;
  const rect = {
    x: Number(rectSource.x),
    y: Number(rectSource.y),
    width: Number(rectSource.width),
    height: Number(rectSource.height)
  };
  if (!Object.values(rect).every(Number.isFinite)) throw new Error("PNG 裁剪矩形必须提供有限的 x、y、width、height");
  if (rect.width <= 0 || rect.height <= 0) throw new Error("PNG 裁剪矩形不能为空");
  return {mode, rect};
}

export function normalizePngOverlayOptions(overlays = {}, includeMapOverlays = true) {
  const source = overlays && typeof overlays === "object" ? overlays : {};
  return Object.fromEntries(PNG_OVERLAY_KEYS.map(key => [key, includeMapOverlays && (Object.hasOwn(source, key) ? source[key] !== false : PNG_OVERLAY_DEFAULTS[key])]));
}

export function mapFileBaseName(map) {
  return mapBaseFilename(map);
}

function typedArrayReplacer(_key, value) {
  if (!ArrayBuffer.isView(value) || value instanceof DataView) return value;
  return {
    __webglGeneratorTypedArray: value.constructor.name,
    data: Array.from(value)
  };
}

function typedArrayReviver(_key, value) {
  const type = value?.__webglGeneratorTypedArray;
  if (!type) return value;
  const Constructor = TYPED_ARRAYS[type];
  if (typeof Constructor !== "function") throw new Error(`无法读取 typed array：${type}`);
  return new Constructor(value.data || []);
}

function migrateMapDocumentStep(document, version, registry) {
  const migrator = registry instanceof Map ? registry.get(version) : registry?.[version];
  if (typeof migrator !== "function") throw new Error(`缺少地图格式 v${version} 迁移器`);
  const migrated = migrator(document);
  if (Number(migrated?.version) !== version + 1) throw new Error(`地图格式 v${version} 迁移器没有产出 v${version + 1}`);
  return migrated;
}

const MAP_DOCUMENT_MIGRATORS = createMapDocumentMigrationRegistry({
  1: migrateMapDocumentV1ToV2
});

function migrateMapDocumentV1ToV2(document) {
  return {
    ...document,
    version: 2,
    metadata: {
      ...(document.metadata || {}),
      mapSchemaVersion: MAP_SCHEMA_VERSION
    },
    options: {...(document.options || {})},
    map: normalizeMapSchemaV2(document.map, document.options)
  };
}

function validateCurrentMapDocument(document) {
  assertMapDocumentCellLimit(document.map);
  if (Number(document?.metadata?.mapSchemaVersion) !== MAP_SCHEMA_VERSION) throw new Error("地图文件缺少当前文档 schema 标记");
  if (Number(document?.map?.metadata?.schemaVersion) !== MAP_SCHEMA_VERSION) throw new Error("地图数据缺少当前 schema 标记");
  if (!Array.isArray(document.map.notes?.notes)) throw new Error("地图数据缺少 notes 存储");
  if (!Array.isArray(document.map.measurements?.items)) throw new Error("地图数据缺少 measurements 存储");
  if (Number(document.map.measurements?.version) !== 1 || !Number.isInteger(Number(document.map.measurements?.metadata?.nextId))) {
    throw new Error("地图数据的 measurements 存储不完整");
  }
  if (!Array.isArray(document.map.labels?.custom)) throw new Error("地图数据缺少 labels 存储");
  if (!Array.isArray(document.map.labels?.hidden?.city) || !Array.isArray(document.map.labels?.hidden?.state)) {
    throw new Error("地图数据的 labels 隐藏表不完整");
  }
  if (document.map.labels.hidden.province !== undefined && !Array.isArray(document.map.labels.hidden.province)) {
    throw new Error("地图数据的 labels 省份隐藏表无效");
  }
  if (document.map.labels.styles !== undefined) validateLabelStyleStore(document.map.labels.styles);
  if (document.map.labels.layout !== undefined) validateLabelLayoutStore(document.map.labels.layout);
  if (!document.map.visualTheme || typeof document.map.visualTheme !== "object") throw new Error("地图数据缺少 visualTheme 存储");
  if (!document.map.visualTheme.preset || !document.map.visualTheme.overrides || typeof document.map.visualTheme.overrides !== "object") {
    throw new Error("地图数据的 visualTheme 存储不完整");
  }
  if (document.map.visualTheme.userThemes !== undefined && !Array.isArray(document.map.visualTheme.userThemes)) throw new Error("地图数据的用户主题列表无效");
  if (!document.map.diplomacy || !Array.isArray(document.map.diplomacy.chronicle) || typeof document.map.diplomacy.relations !== "object") {
    throw new Error("地图数据缺少 diplomacy 存储");
  }
  if (document.map.display?.units && !Array.isArray(document.map.display.units.customUnits)) throw new Error("地图数据的自定义单位列表无效");
  if (Number(document.map.oceanCurrents?.version) !== OCEAN_CURRENT_MODEL_VERSION || !Array.isArray(document.map.oceanCurrents?.currents)) {
    throw new Error("地图数据缺少 oceanCurrents 存储");
  }
  validateRegenerationLockStore(document.map.regenerationLocks, document.map);
  for (const states of [document.map.politics?.states, document.map.pack?.states]) {
    for (const state of states || []) {
      if (!state || state.removed || Number(state.i ?? state.id) <= 0) continue;
      if (!Array.isArray(state.diplomacy) || !Array.isArray(state.campaigns)) throw new Error(`国家 #${state.i ?? state.id} 的 diplomacy 存储不完整`);
    }
  }
}

export function assertMapDocumentCellLimit(map) {
  const pointsCells = Number(map?.grid?.points?.length);
  const legacyCells = Number(map?.grid?.cells?.i?.length ?? map?.grid?.cells?.h?.length);
  const actualCells = Number.isInteger(pointsCells) && pointsCells >= 1 ? pointsCells : legacyCells;
  if (!Number.isInteger(actualCells) || actualCells < 1) throw new Error("地图数据缺少有效的 grid cells");
  if (actualCells <= MAP_CELLS_MAX) return actualCells;
  const error = new Error(`地图包含 ${actualCells} 个 grid cells，超过当前 ${MAP_CELLS_MAX} 上限，未替换当前地图`);
  error.code = "map-cell-limit-exceeded";
  error.stage = "map-import-validate";
  error.suggestion = `请选择不超过 ${MAP_CELLS_MAX} 个 grid cells 的地图存档。`;
  error.details = {actualCells, maximum: MAP_CELLS_MAX};
  throw error;
}

function normalizeMapSchemaV2(map, documentOptions = {}) {
  const source = map && typeof map === "object" ? map : {};
  const normalizedCurrent = normalizeCurrentMapSchemaV2(source, documentOptions);
  const societyCultures = cloneSocialStore(source.society?.cultures);
  const societyReligions = cloneSocialStore(source.society?.religions);
  const packCultures = normalizedCurrent.pack?.cultures === source.society?.cultures ? societyCultures : cloneSocialStore(normalizedCurrent.pack?.cultures);
  const packReligions = normalizedCurrent.pack?.religions === source.society?.religions ? societyReligions : cloneSocialStore(normalizedCurrent.pack?.religions);
  const normalized = {
    ...normalizedCurrent,
    notes: normalizeNotesStoreV2(source.notes),
    measurements: normalizeMeasurementStoreV2(source.measurements),
    labels: normalizeLabelStoreV2(source.labels),
    visualTheme: normalizeVisualThemeStoreV2(source.visualTheme, normalizedCurrent.options.visualTheme),
    society: source.society ? {...source.society, cultures: societyCultures, religions: societyReligions, metadata: {...(source.society.metadata || {})}} : source.society,
    pack: normalizedCurrent.pack ? {...normalizedCurrent.pack, cultures: packCultures, religions: packReligions} : normalizedCurrent.pack
  };
  const compatible = normalizeZoneMap(normalizeLakeOverflowMap(normalizeDiplomacyMap(normalizeEconomyDisplayMap(normalizeSocialExpansionMap(normalized)))));
  applyRegenerationLockCompatibility(compatible, source.regenerationLocks);
  return normalizeCanonicalIdentityArrays(compatible);
}

function normalizeCanonicalIdentityArrays(map) {
  const cities = copyIdentityArrayWithExplicitHoles(map?.settlements?.cities);
  const burgs = copyIdentityArrayWithExplicitHoles(map?.pack?.burgs);
  const routes = copyIdentityArrayWithExplicitHoles(map?.pack?.routes);
  if (cities === map?.settlements?.cities && burgs === map?.pack?.burgs && routes === map?.pack?.routes) return map;
  return {
    ...map,
    ...(map.settlements ? {settlements: {...map.settlements, cities}} : {}),
    ...(map.pack ? {pack: {...map.pack, burgs, routes}} : {})
  };
}

function copyIdentityArrayWithExplicitHoles(values) {
  if (!Array.isArray(values)) return values;
  let hasHoles = false;
  for (let index = 0; index < values.length; index++) {
    if (!Object.hasOwn(values, index)) {
      hasHoles = true;
      break;
    }
  }
  if (!hasHoles) return values;
  return Array.from({length: values.length}, (_, index) => Object.hasOwn(values, index) ? values[index] : null);
}

function normalizeCurrentMapSchemaV2(map, documentOptions = {}) {
  const source = map && typeof map === "object" ? map : {};
  const actualCells = Number(source.grid?.points?.length);
  const fallbackCells = Number.isInteger(actualCells) && actualCells > 0 ? actualCells : 10_000;
  const cellsTarget = normalizeMapCellTarget(source.options?.cellsTarget ?? documentOptions?.cellsTarget ?? source.metadata?.cellsTarget, {fallback: fallbackCells});
  const options = {...(documentOptions || {}), ...(source.options || {}), cellsTarget};
  delete options.display;
  const displaySource = documentOptions.display ?? source.display;
  const normalizedRiverStore = normalizeRiverStore(source.rivers, source.pack);
  return synchronizeMapName({
    ...source,
    metadata: {...(source.metadata || {}), cellsTarget, schemaVersion: MAP_SCHEMA_VERSION},
    options,
    ...(displaySource && typeof displaySource === "object" ? {display: normalizeMapDisplayConfig(displaySource)} : {}),
    notes: backfillNotesStoreV2(source.notes),
    measurements: backfillMeasurementStoreV2(source.measurements),
    labels: backfillLabelStoreV2(source.labels),
    visualTheme: backfillVisualThemeStoreV2(source.visualTheme, options.visualTheme),
    regenerationLocks: normalizeRegenerationLockStore(source.regenerationLocks).store,
    oceanCurrents: normalizeOceanCurrentModel(source.oceanCurrents),
    ...(normalizedRiverStore ? {
      rivers: normalizedRiverStore,
      pack: source.pack ? {...source.pack, rivers: normalizedRiverStore.rivers} : source.pack
    } : {})
  }, documentOptions, {legacyFallback: source.metadata?.name == null && source.options?.mapName == null && documentOptions?.mapName == null});
}

function normalizeRiverStore(store, pack) {
  if (!store || typeof store !== "object" || !Array.isArray(store.rivers)) return store;
  const rivers = store.rivers.map(river => river && typeof river === "object" ? {
    ...river,
    cells: Array.isArray(river.cells) ? [...river.cells] : river.cells,
    gridCells: Array.isArray(river.gridCells) ? [...river.gridCells] : river.gridCells,
    points: Array.isArray(river.points) ? river.points.map(point => Array.isArray(point) ? [...point] : point) : river.points,
    ...(Array.isArray(river.controlPoints) ? {controlPoints: normalizeRiverControlPoints(river, pack?.cells)} : {}),
    ...(normalizeRiverVisualCurve(river.visualCurve) ? {visualCurve: normalizeRiverVisualCurve(river.visualCurve)} : {}),
    hydrology: river.hydrology && typeof river.hydrology === "object" ? {...river.hydrology} : river.hydrology
  } : river);
  const normalized = normalizeRiverNetwork(rivers, pack, {dropIncomplete: false});
  return {
    ...store,
    rivers: normalized.rivers,
    metadata: {
      ...(store.metadata || {}),
      networkDiagnostics: normalized.diagnostics
    }
  };
}

function normalizeLakeOverflowMap(map) {
  if (!map?.pack?.features) return map;
  const pack = {
    ...map.pack,
    features: map.pack.features.map(feature => feature && typeof feature === "object"
      ? {...feature, ...(feature.overflow && typeof feature.overflow === "object" ? {overflow: {...feature.overflow}} : {})}
      : feature)
  };
  normalizeLakeOverflowDiagnostics(pack);
  return {...map, pack};
}

function applyRegenerationLockCompatibility(map, source) {
  const normalized = normalizeRegenerationLockStore(source, map);
  map.regenerationLocks = normalized.store;
  if (!normalized.diagnostics.removed) return normalized;
  map.metadata = {
    ...(map.metadata || {}),
    compatibility: {
      ...(map.metadata?.compatibility || {}),
      regenerationLocks: normalized.diagnostics
    }
  };
  return normalized;
}

function normalizeMapDocumentDisplay(document) {
  const display = document?.map?.display ?? document?.display;
  if (!display || typeof display !== "object") return document;
  return {
    ...document,
    map: {
      ...document.map,
      display: normalizeMapDisplayConfig(display)
    }
  };
}

function normalizeMapDisplayConfig(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  return {
    ...source,
    units: normalizeUnitPreferences(source.units)
  };
}

function cloneSocialStore(store) {
  if (!Array.isArray(store)) return store;
  return store.map(item => item ? {
    ...item,
    children: Array.isArray(item.children) ? [...item.children] : item.children,
    lineage: Array.isArray(item.lineage) ? [...item.lineage] : item.lineage,
    origins: Array.isArray(item.origins) ? [...item.origins] : item.origins
  } : item);
}

function normalizeNotesStoreV2(source) {
  const notes = Array.isArray(source?.notes) ? [...source.notes] : [];
  return {
    ...(source && typeof source === "object" ? source : {}),
    notes,
    metadata: {
      ...(source?.metadata || {}),
      notes: notes.length,
      formatVersion: 1
    }
  };
}

function backfillNotesStoreV2(source) {
  if (source == null) return normalizeNotesStoreV2(source);
  if (typeof source !== "object" || Array.isArray(source)) return source;
  const notes = source.notes === undefined ? [] : source.notes;
  return {
    ...source,
    notes,
    metadata: {
      ...(source.metadata || {}),
      notes: Array.isArray(notes) ? notes.length : Number(source.metadata?.notes) || 0,
      formatVersion: 1
    }
  };
}

function normalizeMeasurementStoreV2(source) {
  const items = Array.isArray(source?.items) ? [...source.items] : [];
  const maxId = items.reduce((max, item) => Math.max(max, measurementNumericId(item?.id)), 0);
  return {
    ...(source && typeof source === "object" ? source : {}),
    version: 1,
    items,
    metadata: {
      ...(source?.metadata || {}),
      measurements: items.length,
      nextId: Math.max(Number(source?.metadata?.nextId) || 1, maxId + 1)
    }
  };
}

function backfillMeasurementStoreV2(source) {
  if (source == null) return normalizeMeasurementStoreV2(source);
  if (typeof source !== "object" || Array.isArray(source)) return source;
  const items = source.items === undefined ? [] : source.items;
  const maxId = Array.isArray(items) ? items.reduce((max, item) => Math.max(max, measurementNumericId(item?.id)), 0) : 0;
  return {
    ...source,
    version: source.version === undefined ? 1 : source.version,
    items,
    metadata: {
      ...(source.metadata || {}),
      measurements: Array.isArray(items) ? items.length : Number(source.metadata?.measurements) || 0,
      nextId: source.metadata?.nextId === undefined ? maxId + 1 : source.metadata.nextId
    }
  };
}

function normalizeLabelStoreV2(source) {
  const custom = Array.isArray(source?.custom) ? [...source.custom] : [];
  const city = Array.isArray(source?.hidden?.city) ? [...source.hidden.city] : [];
  const state = Array.isArray(source?.hidden?.state) ? [...source.hidden.state] : [];
  const province = Array.isArray(source?.hidden?.province) ? [...source.hidden.province] : [];
  return {
    ...(source && typeof source === "object" ? source : {}),
    custom,
    hidden: {...(source?.hidden || {}), city, state, province},
    styles: normalizeLabelStyleStore(source?.styles),
    layout: normalizeLabelLayoutStore(source?.layout),
    metadata: {custom: custom.length, hidden: city.length + state.length + province.length}
  };
}

function backfillLabelStoreV2(source) {
  if (source == null) return normalizeLabelStoreV2(source);
  if (typeof source !== "object" || Array.isArray(source)) return source;
  const custom = source.custom === undefined ? [] : source.custom;
  const hidden = source.hidden === undefined
    ? {city: [], state: [], province: []}
    : source.hidden && typeof source.hidden === "object" && !Array.isArray(source.hidden)
      ? {
          ...source.hidden,
          city: source.hidden.city === undefined ? [] : source.hidden.city,
          state: source.hidden.state === undefined ? [] : source.hidden.state,
          province: source.hidden.province === undefined ? [] : source.hidden.province
        }
      : source.hidden;
  const hiddenCount = hidden && typeof hidden === "object"
    ? [hidden.city, hidden.state, hidden.province].reduce((sum, value) => sum + (Array.isArray(value) ? value.length : 0), 0)
    : 0;
  return {
    ...source,
    custom,
    hidden,
    styles: source.styles === undefined ? normalizeLabelStyleStore() : source.styles,
    layout: source.layout === undefined ? normalizeLabelLayoutStore() : source.layout,
    metadata: {
      ...(source.metadata || {}),
      custom: Array.isArray(custom) ? custom.length : Number(source.metadata?.custom) || 0,
      hidden: hiddenCount
    }
  };
}

function normalizeVisualThemeStoreV2(source, fallbackPreset) {
  const userThemes = Array.isArray(source?.userThemes) ? source.userThemes.map(normalizeVisualThemeDocument) : [];
  return {
    ...(source && typeof source === "object" ? source : {}),
    version: 2,
    preset: String(source?.preset || fallbackPreset || "default"),
    overrides: source?.overrides && typeof source.overrides === "object" ? {...source.overrides} : {},
    userThemes
  };
}

function backfillVisualThemeStoreV2(source, fallbackPreset) {
  if (source == null) return normalizeVisualThemeStoreV2(source, fallbackPreset);
  if (typeof source !== "object" || Array.isArray(source)) return source;
  return {
    ...source,
    version: source.version === undefined ? 2 : source.version,
    preset: source.preset === undefined ? String(fallbackPreset || "default") : source.preset,
    overrides: source.overrides === undefined ? {} : source.overrides,
    userThemes: source.userThemes === undefined ? [] : source.userThemes
  };
}

function measurementNumericId(id) {
  const match = String(id ?? "").match(/(\d+)$/);
  return match ? Number(match[1]) || 0 : 0;
}

function isCompressedMapDocumentFile(file) {
  const name = String(file?.name || "").toLowerCase();
  const type = String(file?.type || "").toLowerCase();
  return isCompressedMapDocumentFilename(name) || type.includes("gzip") || type === "application/x-gzip";
}

function textByteLength(documentRef, text) {
  const view = documentRef?.defaultView || globalThis;
  if (typeof view.Blob === "function") return new view.Blob([text], {type: "application/json;charset=utf-8"}).size;
  if (typeof TextEncoder === "function") return new TextEncoder().encode(text).byteLength;
  return text.length;
}

async function decompressMapDocumentFile(documentRef, file) {
  const view = documentRef?.defaultView || globalThis;
  if (typeof view.DecompressionStream !== "function" || typeof view.Response !== "function" || typeof view.Blob !== "function") {
    throw new Error("当前浏览器不支持读取压缩地图文件");
  }
  const stream = file.stream().pipeThrough(new view.DecompressionStream("gzip"));
  return new view.Response(stream).text();
}

export async function decompressGzipBase64Text(documentRef, data) {
  const view = documentRef?.defaultView || globalThis;
  return new view.TextDecoder().decode(await decompressGzipBase64Bytes(documentRef, data));
}

export async function decompressGzipBase64Bytes(documentRef, data) {
  const view = documentRef?.defaultView || globalThis;
  if (typeof view.DecompressionStream !== "function" || typeof view.Response !== "function" || typeof view.Blob !== "function") {
    throw new Error("当前浏览器不支持读取压缩地图文件");
  }
  const bytes = base64ToUint8Array(view, data);
  const stream = new view.Blob([bytes], {type: "application/gzip"}).stream().pipeThrough(new view.DecompressionStream("gzip"));
  return new Uint8Array(await new view.Response(stream).arrayBuffer());
}

async function createGzipTextBlob(documentRef, text) {
  const view = documentRef?.defaultView || globalThis;
  if (typeof view.CompressionStream !== "function" || typeof view.Response !== "function" || typeof view.Blob !== "function") {
    throw new Error("当前浏览器不支持导出压缩地图文件");
  }
  const stream = new view.Blob([text], {type: "application/json;charset=utf-8"}).stream().pipeThrough(new view.CompressionStream("gzip"));
  const buffer = await new view.Response(stream).arrayBuffer();
  return new view.Blob([buffer], {type: "application/gzip"});
}

function isMapDocumentFileLike(value) {
  return Boolean(value && typeof value === "object" && typeof value.text === "function" && typeof value.stream === "function");
}

function isGzipBase64MapPayload(value) {
  if (!value || typeof value !== "object") return false;
  if (value.encoding === "gzip-base64" && typeof value.data === "string") return true;
  if (typeof value.base64 !== "string") return false;
  const filename = String(value.filename || value.name || "").toLowerCase();
  const type = String(value.mimeType || value.type || "").toLowerCase();
  return isCompressedMapDocumentFilename(filename) || type.includes("gzip") || type === "application/x-gzip";
}

function base64ToUint8Array(view, base64) {
  const binary = view.atob(String(base64 || ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function isGzipBytes(bytes) {
  return bytes.byteLength >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

function projectWorldPoint(point, map) {
  if (!Array.isArray(point) || point.length < 2) return null;
  const x = Number(point[0]);
  const y = Number(point[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const width = Math.max(1, Number(map.metadata?.graphWidth) || Number(map.options?.graphWidth) || 1);
  const height = Math.max(1, Number(map.metadata?.graphHeight) || Number(map.options?.graphHeight) || 1);
  const coordinates = map.mapCoordinates || {};
  const lonW = Number.isFinite(Number(coordinates.lonW)) ? Number(coordinates.lonW) : 0;
  const lonE = Number.isFinite(Number(coordinates.lonE)) ? Number(coordinates.lonE) : width;
  const latN = Number.isFinite(Number(coordinates.latN)) ? Number(coordinates.latN) : 0;
  const latS = Number.isFinite(Number(coordinates.latS)) ? Number(coordinates.latS) : height;
  const lon = lonW + (x / width) * (lonE - lonW);
  const lat = latN + (y / height) * (latS - latN);
  return [roundCoordinate(lon), roundCoordinate(lat)];
}

function projectWorldBbox(bbox, map) {
  const corners = [
    [bbox[0], bbox[1]],
    [bbox[2], bbox[1]],
    [bbox[2], bbox[3]],
    [bbox[0], bbox[3]]
  ].map(point => projectWorldPoint(point, map)).filter(Boolean);
  const projected = createEmptyBbox();
  for (const point of corners) expandBboxWithPoint(projected, point);
  return finalizeBbox(projected);
}

function normalizeExplicitWorldBbox(source, worldBounds) {
  const bbox = normalizeWorldBboxArray(source, "显式世界坐标 bbox");
  if (bbox[0] < worldBounds[0] || bbox[1] < worldBounds[1] || bbox[2] > worldBounds[2] || bbox[3] > worldBounds[3]) {
    throw new Error("显式世界坐标 bbox 超出地图世界边界");
  }
  return bbox;
}

function normalizeViewportWorldBbox(source, worldBounds) {
  const bbox = normalizeWorldBboxArray(source, "当前视口 bbox");
  const clipped = [
    Math.max(worldBounds[0], bbox[0]),
    Math.max(worldBounds[1], bbox[1]),
    Math.min(worldBounds[2], bbox[2]),
    Math.min(worldBounds[3], bbox[3])
  ];
  if (clipped[0] >= clipped[2] || clipped[1] >= clipped[3]) throw new Error("当前视口与地图世界边界没有交集");
  return clipped;
}

function normalizeWorldBboxArray(source, label) {
  if (!Array.isArray(source) || source.length !== 4) throw new Error(`${label} 必须是 [minX, minY, maxX, maxY] 四项数组`);
  const bbox = source.map(Number);
  if (!bbox.every(Number.isFinite)) throw new Error(`${label} 必须使用有限数值`);
  if (bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) throw new Error(`${label} 不能为空，且最小值必须小于最大值`);
  return bbox;
}

function unprojectGeoPoint(coordinate, map) {
  if (!Array.isArray(coordinate) || coordinate.length < 2) return null;
  const lon = Number(coordinate[0]);
  const lat = Number(coordinate[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  const width = Math.max(1, Number(map.metadata?.graphWidth) || Number(map.options?.graphWidth) || 1);
  const height = Math.max(1, Number(map.metadata?.graphHeight) || Number(map.options?.graphHeight) || 1);
  const coordinates = map.mapCoordinates || {};
  const lonW = Number.isFinite(Number(coordinates.lonW)) ? Number(coordinates.lonW) : 0;
  const lonE = Number.isFinite(Number(coordinates.lonE)) ? Number(coordinates.lonE) : width;
  const latN = Number.isFinite(Number(coordinates.latN)) ? Number(coordinates.latN) : 0;
  const latS = Number.isFinite(Number(coordinates.latS)) ? Number(coordinates.latS) : height;
  const xRatio = lonE === lonW ? 0 : (lon - lonW) / (lonE - lonW);
  const yRatio = latS === latN ? 0 : (lat - latN) / (latS - latN);
  const x = clampWorldCoordinate(xRatio * width, width);
  const y = clampWorldCoordinate(yRatio * height, height);
  return {x: roundMeasurementImportValue(x), y: roundMeasurementImportValue(y)};
}

function geoJsonFeatures(document) {
  if (document?.type === "FeatureCollection") return Array.isArray(document.features) ? document.features : [];
  if (document?.type === "Feature") return [document];
  if (document?.type && document?.coordinates) return [{type: "Feature", properties: {}, geometry: document}];
  return [];
}

function measurementsFromFeature(feature, map, limit) {
  const geometry = feature?.geometry;
  if (!geometry || limit <= 0) return [];
  const properties = feature.properties && typeof feature.properties === "object" ? feature.properties : {};
  const baseName = geoFeatureName(feature, properties);
  return measurementsFromGeometry(geometry, map, baseName, limit);
}

function measurementsFromGeometry(geometry, map, baseName, limit) {
  if (!geometry || limit <= 0) return [];
  const type = geometry.type;
  const coordinates = geometry.coordinates;
  if (type === "GeometryCollection") {
    const geometries = Array.isArray(geometry.geometries) ? geometry.geometries : [];
    return geometries.flatMap((item, index) => measurementsFromGeometry(item, map, `${baseName} ${index + 1}`, limit)).slice(0, limit);
  }
  if (type === "Point") return pointMeasurement(coordinates, map, baseName);
  if (type === "MultiPoint") return (Array.isArray(coordinates) ? coordinates : []).flatMap((point, index) => pointMeasurement(point, map, `${baseName} 点 ${index + 1}`)).slice(0, limit);
  if (type === "LineString") return lineMeasurement(coordinates, map, baseName);
  if (type === "MultiLineString") return (Array.isArray(coordinates) ? coordinates : []).flatMap((line, index) => lineMeasurement(line, map, `${baseName} 线 ${index + 1}`)).slice(0, limit);
  if (type === "Polygon") return polygonMeasurement(coordinates, map, baseName);
  if (type === "MultiPolygon") return (Array.isArray(coordinates) ? coordinates : []).flatMap((polygon, index) => polygonMeasurement(polygon, map, `${baseName} 面 ${index + 1}`)).slice(0, limit);
  return [];
}

function pointMeasurement(coordinates, map, name) {
  const point = unprojectGeoPoint(coordinates, map);
  if (!point) return [];
  return [{
    type: "point",
    name,
    points: [point],
    closed: false,
    routeFit: "none"
  }];
}

function lineMeasurement(coordinates, map, name) {
  const points = coordinatesToMeasurementPoints(coordinates, map);
  if (points.length < 2) return [];
  return [{
    type: "polyline",
    name,
    points,
    closed: false,
    routeFit: "none"
  }];
}

function polygonMeasurement(rings, map, name) {
  const outerRing = Array.isArray(rings) ? rings[0] : [];
  const points = coordinatesToMeasurementPoints(outerRing, map);
  if (points.length < 3) return [];
  return [{
    type: "polygon",
    name,
    points: dropClosingPoint(points),
    closed: true,
    routeFit: "none"
  }];
}

function coordinatesToMeasurementPoints(coordinates, map) {
  return (Array.isArray(coordinates) ? coordinates : [])
    .map(point => unprojectGeoPoint(point, map))
    .filter(Boolean);
}

function dropClosingPoint(points) {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (first.x !== last.x || first.y !== last.y) return points;
  return points.slice(0, -1);
}

function geoFeatureName(feature, properties) {
  return String(properties.name || properties.NAME || properties.title || feature.id || "GEO 要素").trim().slice(0, 60) || "GEO 要素";
}

function clampWorldCoordinate(value, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(max, number));
}

function roundMeasurementImportValue(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function normalizeFeatureLayerOptions(layers = {}) {
  const source = layers && typeof layers === "object" ? layers : {};
  return {
    state: source.state === true,
    province: source.province === true,
    city: source.city !== false,
    route: source.route !== false,
    river: source.river !== false,
    marker: source.marker !== false,
    zone: source.zone !== false
  };
}

function selectedFeatureLayerNames(layers) {
  return [
    layers.state ? "states" : "",
    layers.province ? "provinces" : "",
    layers.city ? "cities" : "",
    layers.route ? "routes" : "",
    layers.river ? "rivers" : "",
    layers.marker ? "markers" : "",
    layers.zone ? "zones" : ""
  ].filter(Boolean);
}

function stateFeatures(map, options = {}) {
  const groups = collectPoliticalCellGroups(map, "state");
  return (map.politics?.states || []).map(state => {
    const id = Number(state?.i ?? state?.id) || 0;
    if (!id || state?.removed) return null;
    const group = groups.get(id);
    if (!group?.polygons?.length) return null;
    const capital = map.pack?.burgs?.[state.capital];
    const note = readObjectNote(map, {kind: "state", id});
    const cultureId = Number(state.culture) || 0;
    const religionId = Number(state.religion) || 0;
    const coordinates = politicalGroupCoordinates(map, group, options);
    if (!coordinates.length) return null;
    return {
      type: "Feature",
      id: `state-${id}`,
      properties: {
        layer: "state",
        id: `state-${id}`,
        numericId: id,
        name: state.name || "",
        fullName: state.fullName || state.name || "",
        formName: state.formName || "",
        governmentKey: state.governmentKey || "",
        governmentLabel: state.governmentLabel || "",
        governmentCategory: state.governmentCategory || "",
        governmentFamily: state.governmentFamily || "",
        capital: state.capital || 0,
        capitalName: capital?.name || "",
        culture: cultureId,
        cultureName: map.society?.cultures?.[cultureId]?.name || "",
        religion: religionId,
        religionName: map.society?.religions?.[religionId]?.name || "",
        cells: group.cells,
        area: roundCoordinate(group.area || state.area || 0),
        population: roundCoordinate((state.rural || 0) + (state.urban || 0) || group.population),
        rural: state.rural || 0,
        urban: state.urban || 0,
        burgs: state.burgs || 0,
        color: state.color || "",
        neighbors: Array.isArray(state.neighbors) ? state.neighbors.filter(Boolean) : [],
        dissolved: options.dissolve === true,
        hasNote: Boolean(note?.body),
        note: note?.body || ""
      },
      geometry: {
        type: "MultiPolygon",
        coordinates
      }
    };
  }).filter(Boolean);
}

function provinceFeatures(map, options = {}) {
  const groups = collectPoliticalCellGroups(map, "province");
  return (map.politics?.provinces || []).map(province => {
    const id = Number(province?.i ?? province?.id) || 0;
    if (!id || province?.removed) return null;
    const group = groups.get(id);
    if (!group?.polygons?.length) return null;
    const stateId = Number(province.state) || 0;
    const state = map.politics?.states?.[stateId];
    const burg = map.pack?.burgs?.[province.burg];
    const note = readObjectNote(map, {kind: "province", id});
    const coordinates = politicalGroupCoordinates(map, group, options);
    if (!coordinates.length) return null;
    return {
      type: "Feature",
      id: `province-${id}`,
      properties: {
        layer: "province",
        id: `province-${id}`,
        numericId: id,
        name: province.name || "",
        fullName: province.fullName || province.name || "",
        state: stateId,
        stateName: state?.fullName || state?.name || "",
        burg: province.burg || 0,
        burgName: burg?.name || "",
        cells: group.cells,
        area: roundCoordinate(group.area || province.area || 0),
        population: roundCoordinate(group.population),
        color: province.color || "",
        neighbors: Array.isArray(province.neighbors) ? province.neighbors.filter(Boolean) : [],
        dissolved: options.dissolve === true,
        hasNote: Boolean(note?.body),
        note: note?.body || ""
      },
      geometry: {
        type: "MultiPolygon",
        coordinates
      }
    };
  }).filter(Boolean);
}

function cityFeatures(map) {
  return (map.settlements?.cities || []).filter(Boolean).map(city => {
    const burg = findCityBurg(map, city);
    const coordinate = projectWorldPoint([city.x ?? burg?.x, city.y ?? burg?.y], map);
    if (!coordinate) return null;
    const note = readObjectNote(map, {kind: "city", id: city.id});
    const stateId = Number(city.state ?? burg?.state) || 0;
    const provinceId = Number(city.province ?? burg?.province) || 0;
    const cultureId = Number(city.culture ?? burg?.culture) || 0;
    const religionId = Number(city.religion ?? burg?.religion) || 0;
    return {
      type: "Feature",
      id: `city-${city.id}`,
      properties: {
        layer: "city",
        id: city.id,
        burg: city.burgId ?? burg?.i ?? -1,
        name: city.name || burg?.name || "",
        type: city.type || burg?.type || "",
        group: city.group || burg?.group || "",
        population: city.population ?? burg?.population ?? 0,
        capital: Boolean(city.capital || burg?.capital),
        provincial: Boolean(city.provincial),
        port: Boolean(city.port || burg?.port),
        state: stateId,
        stateName: map.politics?.states?.[stateId]?.name || "",
        province: provinceId,
        provinceName: map.politics?.provinces?.[provinceId]?.name || "",
        culture: cultureId,
        cultureName: map.society?.cultures?.[cultureId]?.name || "",
        religion: religionId,
        religionName: map.society?.religions?.[religionId]?.name || "",
        cell: city.cell ?? -1,
        packCell: city.packCell ?? burg?.cell ?? -1,
        resourceCells: city.resourceCells ?? burg?.resourceCells ?? 0,
        markerResourceCells: city.markerResourceCells ?? burg?.markerResourceCells ?? 0,
        resourceGoodIds: city.resourceGoodIds || burg?.resourceGoodIds || [],
        hasNote: Boolean(note?.body),
        note: note?.body || ""
      },
      geometry: {
        type: "Point",
        coordinates: coordinate
      }
    };
  }).filter(Boolean);
}

function collectPoliticalCellGroups(map, field) {
  const cells = map.pack?.cells;
  const groups = new Map();
  if (!cells?.i || !cells?.[field]) return groups;

  for (const cell of cells.i) {
    const cellId = Number(cell);
    if (!Number.isInteger(cellId) || (Number(cells.h?.[cellId]) || 0) < 20) continue;
    const ownerId = Number(cells[field]?.[cellId]) || 0;
    if (!ownerId) continue;
    const polygon = packCellPolygon(map, cellId);
    if (!polygon) continue;
    let group = groups.get(ownerId);
    if (!group) {
      group = {cells: 0, area: 0, population: 0, polygons: [], cellIds: []};
      groups.set(ownerId, group);
    }
    group.cells += 1;
    group.area += Number(cells.area?.[cellId]) || 0;
    group.population += Number(cells.pop?.[cellId]) || 0;
    group.polygons.push(polygon);
    group.cellIds.push(cellId);
  }

  return groups;
}

function politicalGroupCoordinates(map, group, options = {}) {
  if (options.dissolve !== true) return group.polygons || [];
  return dissolvePackCellPolygons(map, group.cellIds || []);
}

export function dissolvePackCellPolygons(map, cellIds = []) {
  const cells = map?.pack?.cells;
  const vertices = map?.pack?.vertices?.p;
  if (!cells?.v || !vertices) return [];
  const boundaryEdges = new Map();
  const selected = new Set(cellIds.map(Number).filter(Number.isInteger));
  for (const cellId of selected) {
    const vertexIds = cells.v?.[cellId];
    if (!Array.isArray(vertexIds) || vertexIds.length < 3) continue;
    for (let index = 0; index < vertexIds.length; index += 1) {
      const from = Number(vertexIds[index]);
      const to = Number(vertexIds[(index + 1) % vertexIds.length]);
      if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) continue;
      const key = edgeKey(from, to);
      if (boundaryEdges.has(key)) boundaryEdges.delete(key);
      else boundaryEdges.set(key, {from, to});
    }
  }
  const rings = stitchBoundaryRings(boundaryEdges, map);
  return ringsToMultiPolygon(rings);
}

function countValidPoliticalObjects(objects = []) {
  return objects.filter(object => {
    const id = Number(object?.i ?? object?.id) || 0;
    return id && !object?.removed;
  }).length;
}

function edgeKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function stitchBoundaryRings(edgeMap, map) {
  const unused = new Map(edgeMap);
  const outgoing = new Map();
  for (const [key, edge] of unused) {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    outgoing.get(edge.from).push(key);
  }
  const rings = [];
  while (unused.size) {
    const [startKey, startEdge] = unused.entries().next().value;
    const vertexIds = [startEdge.from, startEdge.to];
    removeBoundaryEdge(unused, outgoing, startKey);
    let current = startEdge.to;
    let guard = 0;
    while (current !== startEdge.from && guard < edgeMap.size + 1) {
      guard += 1;
      const nextKey = firstUnusedOutgoingKey(outgoing, unused, current);
      if (!nextKey) break;
      const edge = unused.get(nextKey);
      removeBoundaryEdge(unused, outgoing, nextKey);
      vertexIds.push(edge.to);
      current = edge.to;
    }
    if (current !== startEdge.from || vertexIds.length < 4) continue;
    const ring = vertexIds.map(vertexId => projectWorldPoint(map.pack.vertices.p?.[vertexId], map)).filter(Boolean);
    if (ring.length >= 4 && sameCoordinate(ring[0], ring[ring.length - 1])) rings.push(ring);
  }
  return rings;
}

function removeBoundaryEdge(unused, outgoing, key) {
  const edge = unused.get(key);
  unused.delete(key);
  const keys = outgoing.get(edge?.from) || [];
  const index = keys.indexOf(key);
  if (index >= 0) keys.splice(index, 1);
}

function firstUnusedOutgoingKey(outgoing, unused, vertexId) {
  const keys = outgoing.get(vertexId) || [];
  while (keys.length && !unused.has(keys[0])) keys.shift();
  return keys[0] || null;
}

function ringsToMultiPolygon(rings) {
  const entries = rings
    .map(ring => ({ring, area: ringSignedArea(ring), parent: -1}))
    .filter(entry => Math.abs(entry.area) > 0)
    .sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
  for (let index = 0; index < entries.length; index += 1) {
    const point = firstRingPoint(entries[index].ring);
    let parent = -1;
    let parentArea = Infinity;
    for (let candidateIndex = 0; candidateIndex < index; candidateIndex += 1) {
      const candidate = entries[candidateIndex];
      const area = Math.abs(candidate.area);
      if (area >= parentArea || !pointInRing(point, candidate.ring)) continue;
      parent = candidateIndex;
      parentArea = area;
    }
    entries[index].parent = parent;
  }
  const polygons = [];
  const outerIndexes = [];
  entries.forEach((entry, index) => {
    if (ringDepth(entries, index) % 2 !== 0) return;
    outerIndexes.push(index);
    polygons.push([orientRing(entry.ring, true)]);
  });
  entries.forEach((entry, index) => {
    if (ringDepth(entries, index) % 2 === 0) return;
    const outerIndex = nearestOuterIndex(entries, outerIndexes, index);
    const polygonIndex = outerIndexes.indexOf(outerIndex);
    if (polygonIndex >= 0) polygons[polygonIndex].push(orientRing(entry.ring, false));
  });
  return polygons;
}

function ringDepth(entries, index) {
  let depth = 0;
  let current = entries[index]?.parent ?? -1;
  while (current >= 0) {
    depth += 1;
    current = entries[current]?.parent ?? -1;
  }
  return depth;
}

function nearestOuterIndex(entries, outerIndexes, holeIndex) {
  const point = firstRingPoint(entries[holeIndex].ring);
  let best = -1;
  let bestArea = Infinity;
  for (const index of outerIndexes) {
    const area = Math.abs(entries[index].area);
    if (area >= bestArea || !pointInRing(point, entries[index].ring)) continue;
    best = index;
    bestArea = area;
  }
  return best;
}

function orientRing(ring, ccw) {
  const area = ringSignedArea(ring);
  const shouldReverse = ccw ? area < 0 : area > 0;
  return shouldReverse ? [...ring].reverse() : ring;
}

function ringSignedArea(ring) {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const a = ring[index];
    const b = ring[index + 1];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area / 2;
}

function firstRingPoint(ring) {
  return ring.find((point, index) => index === 0 || !sameCoordinate(point, ring[0])) || ring[0];
}

function sameCoordinate(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a[0] === b[0] && a[1] === b[1];
}

function pointInRing(point, ring) {
  if (!point || !ring?.length) return false;
  let inside = false;
  const x = point[0];
  const y = point[1];
  for (let index = 0, prev = ring.length - 1; index < ring.length; prev = index, index += 1) {
    const a = ring[index];
    const b = ring[prev];
    const intersects = ((a[1] > y) !== (b[1] > y)) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0];
    if (intersects) inside = !inside;
  }
  return inside;
}

function routeFeatures(map) {
  return (map.settlements?.routes || []).map(route => {
    const coordinates = lineCoordinates(route.points, map);
    if (coordinates.length < 2) return null;
    const note = readObjectNote(map, {kind: "route", id: route.id});
    const stable = serializeRouteGeoJsonProperties(map, route);
    return {
      type: "Feature",
      id: `route-${route.id}`,
      properties: {
        layer: "route",
        id: route.id,
        name: stable.displayName,
        type: route.type,
        level: route.level,
        state: route.state || 0,
        province: route.province || 0,
        from: route.from ?? -1,
        to: route.to ?? -1,
        cells: route.cells?.length || 0,
        resourceCells: route.resourceCells || 0,
        markerResourceCells: route.markerResourceCells || 0,
        resourceGoodIds: route.resourceGoodIds || [],
        distance: roundCoordinate(worldLineLength(route.points)),
        hasNote: Boolean(note?.body),
        note: note?.body || "",
        ...stable
      },
      geometry: {
        type: "LineString",
        coordinates
      }
    };
  }).filter(Boolean);
}

function riverFeatures(map) {
  return (map.rivers?.rivers || []).map(river => {
    const visualPoints = isSharedCubicCurve(river.visualCurve) ? sampleCentripetalCatmullRom(river.points).points : river.points;
    const coordinates = lineCoordinates(visualPoints, map);
    if (coordinates.length < 2) return null;
    const note = readObjectNote(map, {kind: "river", id: river.id});
    const stable = {
      ...serializeRiverGeoJsonProperties(map, river),
      ...(isSharedCubicCurve(river.visualCurve) ? {segmentCount: Math.max(0, visualPoints.length - 1)} : {})
    };
    return {
      type: "Feature",
      id: `river-${river.id}`,
      properties: {
        layer: "river",
        id: river.id,
        name: river.name || "",
        type: river.type || "",
        source: river.source ?? -1,
        mouth: river.mouth ?? -1,
        parent: river.parent || 0,
        basin: river.basin || river.id,
        flux: river.flux || river.discharge || 0,
        length: river.length || roundCoordinate(worldLineLength(visualPoints)),
        width: river.width || 0,
        widthFactor: river.widthFactor || 1,
        catchmentArea: river.hydrology?.catchmentArea || 0,
        catchmentCells: river.hydrology?.catchmentCells || 0,
        averagePrecipitation: river.hydrology?.averagePrecipitation || 0,
        hydrologyMethod: river.hydrology?.method || "flow-accumulation",
        hasNote: Boolean(note?.body),
        note: note?.body || "",
        ...stable
      },
      geometry: {
        type: "LineString",
        coordinates
      }
    };
  }).filter(Boolean);
}

function markerFeatures(map) {
  return (map.markers?.markers || []).map(marker => {
    const coordinate = projectWorldPoint([marker.x, marker.y], map);
    if (!coordinate) return null;
    const note = readObjectNote(map, {kind: "marker", id: marker.id});
    return {
      type: "Feature",
      id: `marker-${marker.id}`,
      properties: {
        layer: "marker",
        id: marker.id,
        name: marker.name || marker.label || "",
        type: marker.type || "",
        label: marker.label || "",
        category: marker.category || "",
        categoryLabel: marker.categoryLabel || "",
        resourceKey: marker.resourceKey || "",
        resourceLabel: marker.resourceLabel || "",
        economicValue: marker.economicValue || 0,
        state: marker.data?.state || 0,
        province: marker.data?.province || 0,
        cell: marker.cell ?? -1,
        packCell: marker.packCell ?? -1,
        hasNote: Boolean(note?.body),
        note: note?.body || ""
      },
      geometry: {
        type: "Point",
        coordinates: coordinate
      }
    };
  }).filter(Boolean);
}

function zoneFeatures(map, options = {}) {
  return (map.zones?.zones || []).map(zone => {
    const id = zone.i ?? zone.id;
    const context = resolveZoneContext(map, zone);
    const model = normalizeZoneTypeRecord(zone);
    const polygons = options.dissolve === true
      ? dissolvePackCellPolygons(map, zone.cells || [])
      : (zone.cells || []).map(cell => packCellPolygon(map, cell)).filter(Boolean);
    if (!polygons.length) return null;
    return {
      type: "Feature",
      id: `zone-${id}`,
      properties: {
        layer: "zone",
        id: `zone-${id}`,
        numericId: id,
        name: zone.name || "",
        type: zone.type || "",
        category: model.category,
        source: model.source,
        customTypeName: model.customTypeName,
        description: model.description,
        coverage: model.coverage,
        effects: model.effects,
        attacker: Number(zone.attacker) || 0,
        defender: Number(zone.defender) || 0,
        hidden: Boolean(zone.hidden),
        cells: zone.cells?.length || 0,
        color: zone.color || "",
        pattern: zone.pattern || "",
        hexColor: zone.hexColor || "",
        status: context.status,
        statusLabel: context.statusLabel,
        summary: context.summary,
        context: {
          status: context.status,
          participants: context.participants.map(({role, ref}) => ({role, ref}))
        },
        dissolved: options.dissolve === true
      },
      geometry: {
        type: "MultiPolygon",
        coordinates: polygons
      }
    };
  }).filter(Boolean);
}

function findCityBurg(map, city) {
  return map?.pack?.burgs?.[city?.burgId] || (map?.pack?.burgs || []).find(burg => burg?.cityId === city?.id) || null;
}

function packCellPolygon(map, cell) {
  const vertexIds = map.pack?.cells?.v?.[cell];
  const vertices = map.pack?.vertices?.p;
  if (!Array.isArray(vertexIds) || vertexIds.length < 3 || !vertices) return null;
  const ring = vertexIds.map(vertexId => projectWorldPoint(vertices[vertexId], map)).filter(Boolean);
  if (ring.length < 3) return null;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
  return [ring];
}

function lineCoordinates(points, map) {
  return (points || []).map(point => projectWorldPoint(point, map)).filter(Boolean);
}

function worldLineLength(points) {
  let length = 0;
  for (let index = 1; index < (points || []).length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    if (!Array.isArray(a) || !Array.isArray(b)) continue;
    length += Math.hypot(Number(b[0]) - Number(a[0]), Number(b[1]) - Number(a[1]));
  }
  return length;
}

function roundCoordinate(value) {
  return Math.round(value * 1e6) / 1e6;
}

function attachGeoJsonBboxes(collection) {
  const collectionBbox = createEmptyBbox();
  for (const feature of collection.features || []) {
    const featureBbox = geometryBbox(feature.geometry);
    if (!featureBbox) continue;
    feature.bbox = featureBbox;
    expandBboxWithBbox(collectionBbox, featureBbox);
  }
  const bbox = finalizeBbox(collectionBbox);
  if (bbox) collection.bbox = bbox;
  return collection;
}

function withGeoJsonSpatialMetadata(collection, map, range) {
  collection.properties = {
    ...(collection.properties || {}),
    coordinateReference: "approximate-equirectangular",
    coordinateReferenceDetail: {
      method: "approximate-equirectangular",
      authority: null,
      identifier: null,
      axisOrder: ["longitude", "latitude"],
      coordinateUnits: "degrees",
      sourceWorldUnits: "map-units"
    },
    worldBounds: [...range.worldBounds],
    coordinateBounds: [...range.coordinateBounds],
    exportRange: {
      mode: range.mode,
      worldBbox: [...range.worldBbox],
      coordinateBbox: [...range.coordinateBbox],
      inclusion: range.inclusion,
      geometriesClipped: range.geometriesClipped
    }
  };
  return collection;
}

function geometryIntersectsBbox(geometry, bbox) {
  if (!geometry || !Array.isArray(bbox) || bbox.length !== 4) return false;
  if (geometry.type === "Point") return pointInsideBbox(geometry.coordinates, bbox);
  if (geometry.type === "MultiPoint") return (geometry.coordinates || []).some(point => pointInsideBbox(point, bbox));
  if (geometry.type === "LineString") return lineIntersectsBbox(geometry.coordinates, bbox);
  if (geometry.type === "MultiLineString") return (geometry.coordinates || []).some(line => lineIntersectsBbox(line, bbox));
  if (geometry.type === "Polygon") return polygonIntersectsBbox(geometry.coordinates, bbox);
  if (geometry.type === "MultiPolygon") return (geometry.coordinates || []).some(polygon => polygonIntersectsBbox(polygon, bbox));
  if (geometry.type === "GeometryCollection") return (geometry.geometries || []).some(child => geometryIntersectsBbox(child, bbox));
  return false;
}

function lineIntersectsBbox(points, bbox) {
  if (!Array.isArray(points) || !points.length) return false;
  if (points.some(point => pointInsideBbox(point, bbox))) return true;
  for (let index = 1; index < points.length; index += 1) {
    if (segmentIntersectsBbox(points[index - 1], points[index], bbox)) return true;
  }
  return false;
}

function polygonIntersectsBbox(rings, bbox) {
  if (!Array.isArray(rings) || !rings.length) return false;
  if (rings.some(ring => lineIntersectsBbox(ring, bbox))) return true;
  const corners = [
    [bbox[0], bbox[1]],
    [bbox[2], bbox[1]],
    [bbox[2], bbox[3]],
    [bbox[0], bbox[3]]
  ];
  return corners.some(point => pointInsidePolygon(point, rings));
}

function pointInsideBbox(point, bbox) {
  const x = Number(point?.[0]);
  const y = Number(point?.[1]);
  return Number.isFinite(x) && Number.isFinite(y) && x >= bbox[0] && x <= bbox[2] && y >= bbox[1] && y <= bbox[3];
}

function segmentIntersectsBbox(a, b, bbox) {
  const ax = Number(a?.[0]);
  const ay = Number(a?.[1]);
  const bx = Number(b?.[0]);
  const by = Number(b?.[1]);
  if (![ax, ay, bx, by].every(Number.isFinite)) return false;
  const dx = bx - ax;
  const dy = by - ay;
  let start = 0;
  let end = 1;
  for (const [p, q] of [[-dx, ax - bbox[0]], [dx, bbox[2] - ax], [-dy, ay - bbox[1]], [dy, bbox[3] - ay]]) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const ratio = q / p;
    if (p < 0) start = Math.max(start, ratio);
    else end = Math.min(end, ratio);
    if (start > end) return false;
  }
  return true;
}

function pointInsidePolygon(point, rings) {
  if (!pointInsideRing(point, rings[0])) return false;
  for (let index = 1; index < rings.length; index += 1) {
    if (pointInsideRing(point, rings[index])) return false;
  }
  return true;
}

function pointInsideRing(point, ring) {
  const x = Number(point?.[0]);
  const y = Number(point?.[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Array.isArray(ring) || ring.length < 3) return false;
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const currentX = Number(ring[current]?.[0]);
    const currentY = Number(ring[current]?.[1]);
    const previousX = Number(ring[previous]?.[0]);
    const previousY = Number(ring[previous]?.[1]);
    if (![currentX, currentY, previousX, previousY].every(Number.isFinite)) continue;
    const crosses = (currentY > y) !== (previousY > y)
      && x < ((previousX - currentX) * (y - currentY)) / (previousY - currentY) + currentX;
    if (crosses) inside = !inside;
  }
  return inside;
}

function geometryBbox(geometry) {
  if (!geometry?.coordinates) return null;
  const bbox = createEmptyBbox();
  expandBboxWithCoordinates(bbox, geometry.coordinates);
  return finalizeBbox(bbox);
}

function createEmptyBbox() {
  return [Infinity, Infinity, -Infinity, -Infinity];
}

function expandBboxWithCoordinates(bbox, coordinates) {
  if (!Array.isArray(coordinates) || !coordinates.length) return;
  if (typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
    expandBboxWithPoint(bbox, coordinates);
    return;
  }
  for (const child of coordinates) expandBboxWithCoordinates(bbox, child);
}

function expandBboxWithPoint(bbox, point) {
  const lon = Number(point[0]);
  const lat = Number(point[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
  bbox[0] = Math.min(bbox[0], lon);
  bbox[1] = Math.min(bbox[1], lat);
  bbox[2] = Math.max(bbox[2], lon);
  bbox[3] = Math.max(bbox[3], lat);
}

function expandBboxWithBbox(target, source) {
  if (!Array.isArray(source) || source.length < 4) return;
  expandBboxWithPoint(target, [source[0], source[1]]);
  expandBboxWithPoint(target, [source[2], source[3]]);
}

function finalizeBbox(bbox) {
  return bbox.every(Number.isFinite) ? bbox.map(roundCoordinate) : null;
}

export function downloadBlob(documentRef, blob, filename) {
  const view = documentRef.defaultView || window;
  const url = view.URL.createObjectURL(blob);
  const link = documentRef.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noreferrer";
  documentRef.body.append(link);
  link.click();
  link.remove();
  view.setTimeout(() => view.URL.revokeObjectURL(url), 0);
}

async function composeMapExportCanvas(documentRef, canvas, options = {}) {
  const exportFrame = preparePngExportFrame(canvas, options.renderer, options.crop);
  try {
    const output = documentRef.createElement("canvas");
    const pixelScale = normalizePngPixelScale(options.pixelScale);
    output.width = Math.max(1, exportFrame.sourceRect.width * pixelScale);
    output.height = Math.max(1, exportFrame.sourceRect.height * pixelScale);
    const context = output.getContext("2d");
    if (!context) return {canvas, crop: exportFrame.crop};
    if (!copyWebglCanvasTo2d(context, canvas, options.renderer, exportFrame.sourceRect, options.overlays?.cityIcons !== false)) {
      context.drawImage(canvas, exportFrame.sourceRect.x, exportFrame.sourceRect.y, exportFrame.sourceRect.width, exportFrame.sourceRect.height, 0, 0, output.width, output.height);
    }
    applyCanvasCssFilterToExport(documentRef, output, canvas);

    const canvasRect = exportFrame.domRect;
    const scale = {
      x: output.width / canvasRect.width,
      y: output.height / canvasRect.height
    };

    if (options.includeMapOverlays) {
      await drawMapOverlayElements(documentRef, context, canvasRect, scale, options);
      await drawMeasurementOverlay(documentRef, context, canvasRect, scale, options);
      drawFixedMapUiElements(documentRef, context, canvasRect, scale, options);
    }
    if (options.transparentBackground) clearOutsideMapBounds(context, options.renderer, exportFrame.fullDomRect, scale, exportFrame.cssRect);
    return {canvas: output, crop: exportFrame.crop};
  } finally {
    exportFrame.restore();
  }
}

export function resolvePngCropRect(crop, bounds) {
  const normalized = normalizePngCropOptions(crop);
  const width = Number(bounds?.width);
  const height = Number(bounds?.height);
  if (!(width > 0) || !(height > 0)) throw new Error("PNG 导出画布尺寸无效");
  if (normalized.mode === "viewport") return {mode: "viewport", rect: {x: 0, y: 0, width, height}};
  if (normalized.mode === "pixel") {
    assertPngRectInBounds(normalized.rect, {width, height}, "像素");
    return normalized;
  }
  const mapWidth = Number(bounds?.mapWidth);
  const mapHeight = Number(bounds?.mapHeight);
  if (!(mapWidth > 0) || !(mapHeight > 0)) throw new Error("PNG 世界坐标裁剪需要有效地图尺寸");
  const rect = normalized.mode === "map" ? {x: 0, y: 0, width: mapWidth, height: mapHeight} : normalized.rect;
  assertPngRectInBounds(rect, {width: mapWidth, height: mapHeight}, "世界坐标");
  return {mode: normalized.mode, rect};
}

function preparePngExportFrame(canvas, renderer, crop) {
  const fullDomRect = canvas.getBoundingClientRect();
  if (!(fullDomRect.width > 0) || !(fullDomRect.height > 0)) throw new Error("PNG 导出画布不可见或尺寸为空");
  const mapWidth = Number(renderer?.map?.metadata?.graphWidth);
  const mapHeight = Number(renderer?.map?.metadata?.graphHeight);
  const resolved = resolvePngCropRect(crop, {width: fullDomRect.width, height: fullDomRect.height, mapWidth, mapHeight});
  let cssRect = resolved.rect;
  let restore = () => {};

  if (resolved.mode === "map" || resolved.mode === "world") {
    if (!renderer?.camera || typeof renderer?.worldToScreen !== "function" || typeof renderer?.draw !== "function") {
      throw new Error("PNG 世界坐标裁剪需要可用的地图渲染器");
    }
    const previousCamera = {...renderer.camera};
    const camera = pngCameraForWorldRect(resolved.rect, mapWidth, mapHeight);
    const restoreCamera = () => {
      Object.assign(renderer.camera, previousCamera);
      renderer.markViewportBuffersDirty?.();
      renderer.draw({updateDynamicBuffers: true, updateOverlay: true});
    };
    restore = restoreCamera;
    try {
      Object.assign(renderer.camera, camera);
      renderer.markViewportBuffersDirty?.();
      renderer.draw({updateDynamicBuffers: true, updateOverlay: true});
      const start = renderer.worldToScreen(resolved.rect.x, resolved.rect.y, fullDomRect);
      const end = renderer.worldToScreen(resolved.rect.x + resolved.rect.width, resolved.rect.y + resolved.rect.height, fullDomRect);
      cssRect = {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y)
      };
    } catch (error) {
      try {
        restoreCamera();
      } catch {}
      throw error;
    }
  }

  const sourceRect = cssRectToBackingRect(cssRect, fullDomRect, canvas);
  const domRect = {
    left: fullDomRect.left + cssRect.x,
    top: fullDomRect.top + cssRect.y,
    right: fullDomRect.left + cssRect.x + cssRect.width,
    bottom: fullDomRect.top + cssRect.y + cssRect.height,
    width: cssRect.width,
    height: cssRect.height
  };
  return {
    fullDomRect,
    domRect,
    cssRect,
    sourceRect,
    crop: {
      mode: resolved.mode,
      rect: {...resolved.rect},
      pixelRect: {...sourceRect}
    },
    restore
  };
}

export function pngCameraForWorldRect(rect, mapWidth, mapHeight) {
  assertPngRectInBounds(rect, {width: mapWidth, height: mapHeight}, "世界坐标");
  const scale = Math.min(mapWidth / rect.width, mapHeight / rect.height);
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const centerNdcX = centerX / mapWidth * 2 - 1;
  const centerNdcY = 1 - centerY / mapHeight * 2;
  return {scale, offsetX: -centerNdcX * scale || 0, offsetY: -centerNdcY * scale || 0};
}

function assertPngRectInBounds(rect, bounds, label) {
  const epsilon = 1e-7;
  if (!rect || !Object.values(rect).every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) throw new Error(`PNG ${label}裁剪矩形不能为空`);
  if (rect.x < -epsilon || rect.y < -epsilon || rect.x + rect.width > bounds.width + epsilon || rect.y + rect.height > bounds.height + epsilon) {
    throw new Error(`PNG ${label}裁剪矩形超出有效范围`);
  }
}

function cssRectToBackingRect(rect, fullDomRect, canvas) {
  const scaleX = (canvas.width || 1) / fullDomRect.width;
  const scaleY = (canvas.height || 1) / fullDomRect.height;
  const left = Math.max(0, Math.round(rect.x * scaleX));
  const top = Math.max(0, Math.round(rect.y * scaleY));
  const right = Math.min(canvas.width || 1, Math.round((rect.x + rect.width) * scaleX));
  const bottom = Math.min(canvas.height || 1, Math.round((rect.y + rect.height) * scaleY));
  if (right <= left || bottom <= top) throw new Error("PNG 裁剪矩形在输出像素中为空");
  return {x: left, y: top, width: right - left, height: bottom - top};
}

export function clearOutsideMapBounds(context, renderer, canvasRect, scale, cropRect = {x: 0, y: 0}) {
  const width = Number(renderer?.map?.metadata?.graphWidth);
  const height = Number(renderer?.map?.metadata?.graphHeight);
  if (!Number.isFinite(width) || !Number.isFinite(height) || typeof renderer?.worldToScreen !== "function") return;
  const start = renderer.worldToScreen(0, 0, canvasRect);
  const end = renderer.worldToScreen(width, height, canvasRect);
  const left = clampExportCoordinate((Math.min(start.x, end.x) - cropRect.x) * scale.x, context.canvas.width);
  const top = clampExportCoordinate((Math.min(start.y, end.y) - cropRect.y) * scale.y, context.canvas.height);
  const right = clampExportCoordinate((Math.max(start.x, end.x) - cropRect.x) * scale.x, context.canvas.width);
  const bottom = clampExportCoordinate((Math.max(start.y, end.y) - cropRect.y) * scale.y, context.canvas.height);
  context.clearRect(0, 0, context.canvas.width, top);
  context.clearRect(0, bottom, context.canvas.width, context.canvas.height - bottom);
  context.clearRect(0, top, left, Math.max(0, bottom - top));
  context.clearRect(right, top, context.canvas.width - right, Math.max(0, bottom - top));
}

function clampExportCoordinate(value, limit) {
  return Math.max(0, Math.min(limit, Number(value) || 0));
}

function normalizePngPixelScale(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.max(1, Math.min(4, Math.round(number)));
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error("图片导出失败"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

function copyWebglCanvasTo2d(context, canvas, renderer, sourceRect = null, includeCityIcons = true) {
  if (!renderer?.draw) return false;
  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  if (!gl?.readPixels) return false;
  try {
    renderer.draw({drawCityIcons: includeCityIcons});
    const width = gl.drawingBufferWidth || canvas.width;
    const height = gl.drawingBufferHeight || canvas.height;
    if (!width || !height) return false;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const imageData = context.createImageData(width, height);
    const rowBytes = width * 4;
    for (let y = 0; y < height; y += 1) {
      const sourceOffset = (height - y - 1) * rowBytes;
      const targetOffset = y * rowBytes;
      imageData.data.set(pixels.subarray(sourceOffset, sourceOffset + rowBytes), targetOffset);
    }
    const crop = sourceRect || {x: 0, y: 0, width, height};
    if (context.canvas.width === width && context.canvas.height === height && crop.x === 0 && crop.y === 0 && crop.width === width && crop.height === height) {
      context.putImageData(imageData, 0, 0);
      return true;
    }
    const scratch = canvas.ownerDocument.createElement("canvas");
    scratch.width = width;
    scratch.height = height;
    const scratchContext = scratch.getContext("2d");
    if (!scratchContext) return false;
    scratchContext.putImageData(imageData, 0, 0);
    context.drawImage(scratch, crop.x, crop.y, crop.width, crop.height, 0, 0, context.canvas.width, context.canvas.height);
    return true;
  } catch {
    return false;
  } finally {
    if (!includeCityIcons) renderer.draw({updateDynamicBuffers: false, updateOverlay: false, drawDirtyDynamicBuffers: false, drawCityIcons: true});
  }
}

function applyCanvasCssFilterToExport(documentRef, output, sourceCanvas) {
  const context = output.getContext("2d");
  if (!context || !("filter" in context)) return;
  const filter = computedCanvasFilter(documentRef, sourceCanvas);
  if (!filter) return;
  const scratch = documentRef.createElement("canvas");
  scratch.width = output.width;
  scratch.height = output.height;
  const scratchContext = scratch.getContext("2d");
  if (!scratchContext) return;
  scratchContext.drawImage(output, 0, 0);
  context.save();
  context.clearRect(0, 0, output.width, output.height);
  context.filter = filter;
  context.drawImage(scratch, 0, 0);
  context.restore();
}

function computedCanvasFilter(documentRef, canvas) {
  const view = documentRef.defaultView || window;
  const filter = view.getComputedStyle?.(canvas)?.filter || canvas?.style?.filter || "";
  return filter && filter !== "none" ? filter : "";
}

async function drawMapOverlayElements(documentRef, context, canvasRect, scale, options = {}) {
  const overlay = options.renderer?.overlay || documentRef.querySelector(".map-overlay");
  if (!overlay) return;
  const selectors = [];
  if (options.overlays?.markers !== false) selectors.push(".marker-map-icon.visible");
  if (options.overlays?.military !== false) selectors.push(PNG_MILITARY_TEXT_SELECTOR);
  if (options.overlays?.labels !== false) selectors.push(...PNG_SEMANTIC_LABEL_SELECTORS);
  const elements = selectors.length ? Array.from(overlay.querySelectorAll(selectors.join(", "))).filter(isVisibleElement) : [];
  elements.sort((a, b) => overlayZIndex(a) - overlayZIndex(b));

  for (const element of elements) {
    if (element.matches(".marker-map-icon")) {
      await drawSvgOverlayElement(context, element, canvasRect, scale);
    } else if (element.matches(".military-map-icon")) {
      await drawMilitaryOverlayElement(context, element, canvasRect, scale);
    } else {
      drawTextOverlayElement(context, element, canvasRect, scale);
    }
  }
}

async function drawMeasurementOverlay(documentRef, context, canvasRect, scale, options = {}) {
  if (options.overlays?.measurements === false) return;
  const overlay = documentRef.getElementById("measurement-overlay");
  const svg = documentRef.getElementById("measurement-svg");
  if (!isVisibleElement(overlay) || !svg) return;
  const box = elementBox(svg, canvasRect, scale);
  if (!box || !boxIntersectsCanvas(box, context.canvas)) return;
  const viewBox = svg.viewBox?.baseVal;
  const viewWidth = Number(viewBox?.width) || svg.getBoundingClientRect().width || 1;
  const viewHeight = Number(viewBox?.height) || svg.getBoundingClientRect().height || 1;
  const point = value => ({x: box.x + value.x / viewWidth * box.width, y: box.y + value.y / viewHeight * box.height});
  for (const shape of svg.querySelectorAll("polygon, polyline, circle")) {
    const style = shape.ownerDocument.defaultView.getComputedStyle(shape);
    context.save();
    context.globalAlpha = cssOpacity(style);
    context.strokeStyle = style.stroke || "transparent";
    context.fillStyle = style.fill || "transparent";
    context.lineWidth = Math.max(1, cssPixelValue(style.strokeWidth, Math.min(scale.x, scale.y)));
    if (shape.localName === "circle") {
      const center = point({x: Number(shape.getAttribute("cx")) || 0, y: Number(shape.getAttribute("cy")) || 0});
      const radius = (Number(shape.getAttribute("r")) || 0) * Math.min(box.width / viewWidth, box.height / viewHeight);
      context.beginPath();
      context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    } else {
      const points = parseSvgPoints(shape.getAttribute("points")).map(point);
      if (!points.length) {
        context.restore();
        continue;
      }
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      for (const item of points.slice(1)) context.lineTo(item.x, item.y);
      if (shape.localName === "polygon") context.closePath();
    }
    if (isPaintedColor(style.fill)) context.fill();
    if (isPaintedColor(style.stroke)) context.stroke();
    context.restore();
  }
}

function parseSvgPoints(value) {
  const numbers = String(value || "").trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
  const points = [];
  for (let index = 0; index + 1 < numbers.length; index += 2) points.push({x: numbers[index], y: numbers[index + 1]});
  return points;
}

function drawFixedMapUiElements(documentRef, context, canvasRect, scale, options = {}) {
  for (const element of fixedMapUiElements(documentRef, options.overlays)) {
    if (element.id === "map-scale-bar") {
      drawScaleBarElement(context, element, canvasRect, scale);
    } else if (element.id === "map-legend") {
      drawLegendElement(context, element, canvasRect, scale);
    }
  }
}

function fixedMapUiElements(documentRef, overlays = PNG_OVERLAY_DEFAULTS) {
  const ids = [];
  if (overlays.legend !== false) ids.push(PNG_FIXED_TEXT_ELEMENT_IDS.legend);
  if (overlays.scaleBar !== false) ids.push(PNG_FIXED_TEXT_ELEMENT_IDS.scaleBar);
  return ids
    .map(id => documentRef.getElementById(id))
    .filter(isVisibleElement);
}

function drawScaleBarElement(context, element, canvasRect, scale) {
  const box = elementBox(element, canvasRect, scale);
  if (!box || !boxIntersectsCanvas(box, context.canvas)) return;
  const style = element.ownerDocument.defaultView.getComputedStyle(element);
  drawStyledPanel(context, box, style, scale);

  const line = element.querySelector(".map-scale-line");
  const lineBox = elementBox(line, canvasRect, scale);
  if (lineBox) {
    const lineStyle = element.ownerDocument.defaultView.getComputedStyle(line);
    const stroke = lineStyle.borderBottomColor || lineStyle.borderLeftColor || style.color;
    context.save();
    context.strokeStyle = stroke;
    context.lineWidth = Math.max(1, cssPixelValue(lineStyle.borderBottomWidth || "2px", scale.y));
    context.beginPath();
    context.moveTo(lineBox.x, lineBox.y);
    context.lineTo(lineBox.x, lineBox.y + lineBox.height);
    context.lineTo(lineBox.x + lineBox.width, lineBox.y + lineBox.height);
    context.lineTo(lineBox.x + lineBox.width, lineBox.y);
    context.stroke();
    context.restore();
  }

  const label = element.querySelector(".map-scale-label");
  drawSimpleTextElement(context, label, canvasRect, scale, {align: "left"});
}

function drawLegendElement(context, element, canvasRect, scale) {
  const box = elementBox(element, canvasRect, scale);
  if (!box || !boxIntersectsCanvas(box, context.canvas)) return;
  const style = element.ownerDocument.defaultView.getComputedStyle(element);
  drawStyledPanel(context, box, style, scale);

  drawSimpleTextElement(context, element.querySelector(".legend-title"), canvasRect, scale, {align: "left"});
  drawLegendBarElement(context, element.querySelector(".legend-bar"), canvasRect, scale);
  for (const tick of element.querySelectorAll(".legend-ticks span")) {
    drawSimpleTextElement(context, tick, canvasRect, scale, {align: "center"});
  }
  for (const item of element.querySelectorAll(".legend-swatch-item")) {
    drawLegendSwatchItem(context, item, canvasRect, scale);
  }
}

function drawStyledPanel(context, box, style, scale) {
  const background = style.backgroundColor;
  const borderColor = style.borderColor;
  if (!isPaintedColor(background)) return;
  drawPanel(
    context,
    box,
    cssPixelValue(style.borderRadius, Math.min(scale.x, scale.y)),
    background,
    isPaintedColor(borderColor) ? borderColor : "transparent"
  );
}

function drawLegendBarElement(context, element, canvasRect, scale) {
  const box = elementBox(element, canvasRect, scale);
  if (!box || !boxIntersectsCanvas(box, context.canvas)) return;
  const gradient = context.createLinearGradient(box.x, box.y, box.x + box.width, box.y);
  if (element.classList.contains("precipitation")) {
    gradient.addColorStop(0, "#d8c179");
    gradient.addColorStop(0.52, "#75a663");
    gradient.addColorStop(1, "#1f7c8f");
  } else {
    gradient.addColorStop(0, "#b9d8f0");
    gradient.addColorStop(0.46, "#f4f1cf");
    gradient.addColorStop(1, "#d27a56");
  }
  context.save();
  context.fillStyle = gradient;
  roundedRectPath(context, box.x, box.y, box.width, box.height, cssPixelValue(element.ownerDocument.defaultView.getComputedStyle(element).borderRadius, scale.x));
  context.fill();
  context.restore();
}

function drawLegendSwatchItem(context, item, canvasRect, scale) {
  const swatch = item.querySelector("i");
  const swatchBox = elementBox(swatch, canvasRect, scale);
  if (swatchBox) {
    const style = item.ownerDocument.defaultView.getComputedStyle(swatch);
    drawPanel(context, swatchBox, cssPixelValue(style.borderRadius, scale.x), style.backgroundColor, style.borderColor);
  }
  const textNodeType = item.ownerDocument.defaultView.Node.TEXT_NODE;
  const text = Array.from(item.childNodes).find(node => node.nodeType === textNodeType)?.textContent?.trim();
  if (!text) return;
  const itemBox = elementBox(item, canvasRect, scale);
  if (!itemBox) return;
  const itemStyle = item.ownerDocument.defaultView.getComputedStyle(item);
  context.save();
  context.fillStyle = itemStyle.color || "#cbd7dc";
  context.font = cssCanvasFont(itemStyle, scale.y);
  context.textBaseline = "middle";
  context.textAlign = "left";
  const x = swatchBox ? swatchBox.x + swatchBox.width + 6 * scale.x : itemBox.x;
  context.fillText(text, x, itemBox.y + itemBox.height / 2, Math.max(20, itemBox.x + itemBox.width - x));
  context.restore();
}

function drawSimpleTextElement(context, element, canvasRect, scale, options = {}) {
  if (!element) return;
  const text = element.textContent?.trim();
  const box = elementBox(element, canvasRect, scale);
  if (!text || !box || !boxIntersectsCanvas(box, context.canvas)) return;
  const style = element.ownerDocument.defaultView.getComputedStyle(element);
  context.save();
  context.fillStyle = style.color || "#dfe9ed";
  context.font = cssCanvasFont(style, scale.y);
  context.textBaseline = "middle";
  context.textAlign = options.align || "left";
  const x = context.textAlign === "center" ? box.x + box.width / 2 : box.x;
  context.fillText(text, x, box.y + box.height / 2, box.width);
  context.restore();
}

function overlayZIndex(element) {
  const value = Number(element.ownerDocument.defaultView.getComputedStyle(element).zIndex);
  return Number.isFinite(value) ? value : 0;
}

function drawTextOverlayElement(context, element, canvasRect, scale) {
  const text = element.textContent?.trim();
  if (!text) return;
  const isStateLabel = element.classList.contains("state-label");
  const isProvinceLabel = element.classList.contains("province-label");
  const content = element.querySelector(".map-label-content") || element;
  const politicalGlyphs = isStateLabel || isProvinceLabel ? Array.from(element.querySelectorAll(".political-label-glyph")) : [];
  const box = politicalGlyphs.length ? unionElementBoxes(politicalGlyphs, canvasRect, scale) : elementBox(content, canvasRect, scale);
  if (!box || !boxIntersectsCanvas(box, context.canvas)) return;
  const outerStyle = element.ownerDocument.defaultView.getComputedStyle(element);
  const style = element.ownerDocument.defaultView.getComputedStyle(content);
  const opacity = exportOverlayOpacity(element, outerStyle);
  if (opacity <= 0) return;
  const isCustomLabel = element.classList.contains("custom-label");
  const background = style.backgroundColor;
  const borderColor = style.borderColor;

  context.save();
  context.globalAlpha = opacity;
  if (!isStateLabel && !isProvinceLabel && isPaintedColor(background)) {
    drawPanel(context, box, cssPixelValue(style.borderRadius, scale.x), background, isPaintedColor(borderColor) ? borderColor : "transparent");
  }
  context.font = cssCanvasFont(style, scale.y);
  if ("letterSpacing" in context) context.letterSpacing = `${cssPixelValue(style.letterSpacing, scale.x)}px`;
  context.fillStyle = style.color || "#111";
  context.textBaseline = "middle";
  context.textAlign = "center";

  if (politicalGlyphs.length) {
    const glyphMaxWidth = Math.max(12, cssPixelValue(style.fontSize, scale.y) * 1.35);
    for (const glyph of politicalGlyphs) {
      const glyphBox = elementBox(glyph, canvasRect, scale);
      if (!glyphBox) continue;
      context.save();
      context.translate(glyphBox.x + glyphBox.width / 2, glyphBox.y + glyphBox.height / 2);
      context.rotate(cssRotationDegrees(glyph) * Math.PI / 180);
      drawTextWithResolvedStyle(context, content, glyph.textContent || "", 0, 0, glyphMaxWidth, scale);
      context.restore();
    }
  } else if (isStateLabel || isProvinceLabel) {
    const rotation = cssRotationDegrees(element);
    context.translate(box.x + box.width / 2, box.y + box.height / 2);
    context.rotate(rotation * Math.PI / 180);
    drawTextWithResolvedStyle(context, content, text, 0, 0, Math.max(40, box.width * 0.92), scale);
  } else {
    const maxWidth = Math.max(20, box.width - (isCustomLabel ? 10 * scale.x : 0));
    drawTextWithResolvedStyle(context, content, text, box.x + box.width / 2, box.y + box.height / 2, maxWidth, scale);
  }
  context.restore();
}

async function drawSvgOverlayElement(context, element, canvasRect, scale) {
  const box = elementBox(element, canvasRect, scale);
  if (!box || !boxIntersectsCanvas(box, context.canvas)) return;
  const svg = element.querySelector("svg");
  if (!svg) return;
  const dataUrl = svgElementDataUrl(svg);
  if (!dataUrl) return;
  const image = await loadImage(element.ownerDocument, dataUrl);
  if (!image) return;
  const style = element.ownerDocument.defaultView.getComputedStyle(element);
  context.save();
  context.globalAlpha = exportOverlayOpacity(element, style);
  context.shadowColor = "rgba(3, 6, 7, 0.42)";
  context.shadowBlur = 3 * Math.min(scale.x, scale.y);
  context.shadowOffsetY = 2 * scale.y;
  context.drawImage(image, box.x, box.y, box.width, box.height);
  context.restore();
}

async function drawMilitaryOverlayElement(context, element, canvasRect, scale) {
  const box = elementBox(element, canvasRect, scale);
  if (!box || !boxIntersectsCanvas(box, context.canvas)) return;
  const style = element.ownerDocument.defaultView.getComputedStyle(element);
  const opacity = exportOverlayOpacity(element, style);
  if (opacity <= 0) return;

  const background = style.backgroundColor;
  const borderColor = style.borderColor;
  const iconNode = element.querySelector(".military-map-icon-image");
  const countNode = element.querySelector(".military-map-icon-count");
  const countText = countNode?.textContent?.trim() || "";

  context.save();
  context.globalAlpha = opacity;
  context.shadowColor = "rgba(3, 6, 7, 0.42)";
  context.shadowBlur = 3 * Math.min(scale.x, scale.y);
  context.shadowOffsetY = 2 * scale.y;
  if (isPaintedColor(background) || isPaintedColor(borderColor)) {
    drawPanel(
      context,
      box,
      cssPixelValue(style.borderRadius, scale.x),
      isPaintedColor(background) ? background : "transparent",
      isPaintedColor(borderColor) ? borderColor : "transparent",
      cssPixelValue(style.borderTopWidth, Math.min(scale.x, scale.y))
    );
  }
  context.shadowColor = "transparent";
  context.shadowBlur = 0;
  context.shadowOffsetY = 0;

  if (iconNode) {
    const image = await loadImage(element.ownerDocument, iconNode.currentSrc || iconNode.src || iconNode.getAttribute("src"));
    const iconBox = elementBox(iconNode, canvasRect, scale);
    if (image && iconBox) {
      context.shadowColor = "rgba(1, 4, 4, 0.5)";
      context.shadowBlur = 1.4 * Math.min(scale.x, scale.y);
      context.shadowOffsetY = 0.8 * scale.y;
      context.drawImage(image, iconBox.x, iconBox.y, iconBox.width, iconBox.height);
      context.shadowColor = "transparent";
      context.shadowBlur = 0;
      context.shadowOffsetY = 0;
    }
  }

  if (countText && countNode) {
    const countBox = elementBox(countNode, canvasRect, scale);
    const countStyle = element.ownerDocument.defaultView.getComputedStyle(countNode);
    if (countBox) {
      context.font = cssCanvasFont(style, scale.y);
      context.fillStyle = countStyle.color || style.color || "#f7e5ad";
      context.textAlign = "right";
      context.textBaseline = "middle";
      context.fillText(countText, countBox.x + countBox.width, box.y + box.height / 2, countBox.width);
    }
  }

  context.restore();
}

function svgElementDataUrl(svg) {
  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  inlineSvgStyles(svg, clone);
  const text = new XMLSerializer().serializeToString(clone);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
}

function inlineSvgStyles(source, target) {
  const style = source.ownerDocument.defaultView.getComputedStyle(source);
  const declarations = SVG_STYLE_PROPERTIES
    .map(property => {
      const value = style.getPropertyValue(property);
      return value ? `${property}:${value}` : "";
    })
    .filter(Boolean)
    .join(";");
  if (declarations) target.setAttribute("style", declarations);
  const sourceChildren = Array.from(source.children || []);
  const targetChildren = Array.from(target.children || []);
  for (let index = 0; index < sourceChildren.length; index += 1) {
    if (targetChildren[index]) inlineSvgStyles(sourceChildren[index], targetChildren[index]);
  }
}

const SVG_STYLE_PROPERTIES = Object.freeze([
  "fill",
  "fill-opacity",
  "filter",
  "opacity",
  "stroke",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-opacity",
  "stroke-width",
  "transform"
]);

function loadImage(documentRef, src) {
  return new Promise(resolve => {
    const image = new documentRef.defaultView.Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function cssCanvasFont(style, scaleY) {
  const fontSize = Math.max(8, cssPixelValue(style.fontSize, scaleY));
  const weight = style.fontWeight || "400";
  const family = style.fontFamily || "system-ui, sans-serif";
  const fontStyle = style.fontStyle && style.fontStyle !== "normal" ? `${style.fontStyle} ` : "";
  return `${fontStyle}${weight} ${fontSize}px ${family}`;
}

function drawTextWithResolvedStyle(context, element, text, x, y, maxWidth, scale) {
  const style = element.ownerDocument.defaultView.getComputedStyle(element);
  const strokeWidth = cssPixelValue(style.getPropertyValue("--label-stroke-width") || style.webkitTextStrokeWidth, Math.min(scale.x, scale.y));
  context.shadowColor = style.getPropertyValue("--label-shadow-color").trim() || "rgba(4, 7, 8, 0.62)";
  context.shadowBlur = cssPixelValue(style.getPropertyValue("--label-shadow-blur"), Math.min(scale.x, scale.y));
  context.shadowOffsetX = cssPixelValue(style.getPropertyValue("--label-shadow-offset-x"), scale.x);
  context.shadowOffsetY = cssPixelValue(style.getPropertyValue("--label-shadow-offset-y"), scale.y);
  if (strokeWidth > 0) {
    context.lineWidth = strokeWidth * 2;
    context.lineJoin = "round";
    context.strokeStyle = style.getPropertyValue("--label-stroke-color").trim() || style.webkitTextStrokeColor || "transparent";
    context.strokeText(text, x, y, maxWidth);
  }
  context.fillText(text, x, y, maxWidth);
}

function cssRotationDegrees(element) {
  const raw = element.style.getPropertyValue("--label-rotation") || "0";
  const number = Number(String(raw).replace("deg", "").trim());
  return Number.isFinite(number) ? number : 0;
}

function cssOpacity(style) {
  const opacity = Number(style.opacity);
  return Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1;
}

function exportOverlayOpacity(element, style) {
  const current = cssOpacity(style);
  if (current > 0 || !element.classList.contains("visible")) return current;
  if (element.classList.contains("state-label")) {
    const labelOpacity = Number(style.getPropertyValue("--state-label-opacity"));
    return Number.isFinite(labelOpacity) ? Math.max(0, Math.min(1, labelOpacity)) : 1;
  }
  if (element.classList.contains("marker-map-icon--resource") && element.classList.contains("city-overlap")) {
    return element.classList.contains("selected") ? 0.72 : 0.42;
  }
  return 1;
}

function isPaintedColor(color) {
  return Boolean(color) && color !== "transparent" && !/rgba?\([^)]*,\s*0\)$/i.test(color);
}

function boxIntersectsCanvas(box, canvas) {
  return box.x < canvas.width && box.y < canvas.height && box.x + box.width > 0 && box.y + box.height > 0;
}

function cssPixelValue(value, scale = 1) {
  const number = Number(String(value || "").replace("px", ""));
  return Number.isFinite(number) ? number * scale : 0;
}

function isVisibleElement(element) {
  if (!element || element.hidden) return false;
  const style = element.ownerDocument.defaultView.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function elementBox(element, canvasRect, scale) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    x: (rect.left - canvasRect.left) * scale.x,
    y: (rect.top - canvasRect.top) * scale.y,
    width: rect.width * scale.x,
    height: rect.height * scale.y
  };
}

function unionElementBoxes(elements, canvasRect, scale) {
  let result = null;
  for (const element of elements) {
    const box = elementBox(element, canvasRect, scale);
    if (!box) continue;
    if (!result) result = {...box};
    else {
      const right = Math.max(result.x + result.width, box.x + box.width);
      const bottom = Math.max(result.y + result.height, box.y + box.height);
      result.x = Math.min(result.x, box.x);
      result.y = Math.min(result.y, box.y);
      result.width = right - result.x;
      result.height = bottom - result.y;
    }
  }
  return result;
}

function drawPanel(context, box, radius, fillStyle, strokeStyle, lineWidth = 1) {
  context.save();
  context.fillStyle = fillStyle;
  context.strokeStyle = strokeStyle;
  context.lineWidth = Math.max(0.5, lineWidth);
  roundedRectPath(context, box.x, box.y, box.width, box.height, radius);
  context.fill();
  context.stroke();
  context.restore();
}

function drawText(context, text, x, y, options) {
  if (!text) return;
  context.save();
  context.fillStyle = options.color;
  context.font = `${options.fontWeight || 400} ${Math.max(8, options.fontSize)}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  context.textBaseline = options.baseline || "alphabetic";
  context.fillText(text, x, y, options.maxWidth);
  context.restore();
}

function roundedRectPath(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function sanitizeFilename(value) {
  return String(value || "map").replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72) || "map";
}
