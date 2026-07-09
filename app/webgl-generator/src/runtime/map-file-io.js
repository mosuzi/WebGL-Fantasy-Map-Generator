import {readObjectNote} from "./object-notes.js";

export const MAP_DOCUMENT_TYPE = "webgl-generator-map";
export const MAP_DOCUMENT_VERSION = 1;

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
  return {
    type: MAP_DOCUMENT_TYPE,
    version: MAP_DOCUMENT_VERSION,
    exportedAt: new Date().toISOString(),
    app: "fmg-webgl-reimplementation",
    metadata: {
      seed: map.metadata?.seed || options.seed,
      checksum: map.metadata?.checksum || null,
      generatorStage: map.metadata?.generatorStage || null
    },
    options: {...options},
    map
  };
}

export function stringifyMapDocument(document) {
  return JSON.stringify(document, typedArrayReplacer);
}

export function parseMapDocument(text) {
  const document = JSON.parse(text, typedArrayReviver);
  return migrateMapDocument(document);
}

export async function parseMapDocumentFile(documentRef, file) {
  if (!file) throw new Error("未选择地图文件");
  const text = isCompressedMapDocumentFile(file)
    ? await decompressMapDocumentFile(documentRef, file)
    : await file.text();
  return parseMapDocument(text);
}

export async function downloadCompressedMapDocument(documentRef, document, filename) {
  const text = stringifyMapDocument(document);
  const originalBytes = textByteLength(documentRef, text);
  const blob = await createGzipTextBlob(documentRef, text);
  downloadBlob(documentRef, blob, filename);
  return {
    originalBytes,
    compressedBytes: blob.size
  };
}

export function migrateMapDocument(document) {
  if (document?.type !== MAP_DOCUMENT_TYPE) throw new Error("文件不是当前地图保存格式");
  const sourceVersion = Number(document.version);
  if (!Number.isInteger(sourceVersion) || sourceVersion < 1) throw new Error(`暂不支持的地图格式版本：${document.version ?? "未知"}`);
  if (sourceVersion > MAP_DOCUMENT_VERSION) throw new Error(`暂不支持的地图格式版本：${document.version}`);
  let migrated = document;
  for (let version = sourceVersion; version < MAP_DOCUMENT_VERSION; version += 1) {
    migrated = migrateMapDocumentStep(migrated, version);
  }
  if (!migrated.map || typeof migrated.map !== "object") throw new Error("地图文件缺少 map 数据");
  return migrated;
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

export function createMapGeoJson(map) {
  if (!map) throw new Error("当前没有可导出的地图");
  const cells = map.pack?.cells;
  const vertices = map.pack?.vertices?.p;
  if (!cells?.i || !vertices) throw new Error("当前地图缺少 pack cell 地理数据");
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
    features.push({
      type: "Feature",
      id: Number(cells.i[index]) || index,
      properties: {
        cell: Number(cells.i[index]) || index,
        height: Number(cells.h?.[index]) || 0,
        isWater: (Number(cells.h?.[index]) || 0) < 20,
        feature: Number(cells.f?.[index]) || 0,
        biome: Number(cells.biome?.[index]) || 0,
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
    });
  }

  return attachGeoJsonBboxes({
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
  });
}

export function createMapFeatureGeoJson(map, options = {}) {
  if (!map) throw new Error("当前没有可导出的地图");
  const layers = normalizeFeatureLayerOptions(options.layers);
  const features = [
    ...(layers.state ? stateFeatures(map) : []),
    ...(layers.province ? provinceFeatures(map) : []),
    ...(layers.city ? cityFeatures(map) : []),
    ...(layers.route ? routeFeatures(map) : []),
    ...(layers.river ? riverFeatures(map) : []),
    ...(layers.marker ? markerFeatures(map) : []),
    ...(layers.zone ? zoneFeatures(map) : [])
  ];
  const layerSet = selectedFeatureLayerNames(layers);

  return attachGeoJsonBboxes({
    type: "FeatureCollection",
    name: map.metadata?.seed ? `fmg-${map.metadata.seed}-features` : "fmg-webgl-map-features",
    properties: {
      source: "fmg-webgl-reimplementation",
      layerSet: layerSet.length ? layerSet.join("-") : "none",
      seed: map.metadata?.seed || "",
      checksum: map.metadata?.checksum || "",
      generatedAt: map.metadata?.generatedAt || "",
      states: layers.state ? countValidPoliticalObjects(map.politics?.states) : 0,
      provinces: layers.province ? countValidPoliticalObjects(map.politics?.provinces) : 0,
      cities: layers.city ? map.settlements?.cities?.length || 0 : 0,
      routes: layers.route ? map.settlements?.routes?.length || 0 : 0,
      rivers: layers.river ? map.rivers?.rivers?.length || 0 : 0,
      markers: layers.marker ? map.markers?.markers?.length || 0 : 0,
      zones: layers.zone ? map.zones?.zones?.length || 0 : 0
    },
    features
  });
}

export function downloadJson(documentRef, data, filename, replacer = null) {
  const text = JSON.stringify(data, replacer);
  downloadBlob(documentRef, new Blob([text], {type: "application/json;charset=utf-8"}), filename);
}

export function downloadText(documentRef, text, filename, type = "text/plain;charset=utf-8") {
  downloadBlob(documentRef, new Blob([text], {type}), filename);
}

export async function downloadCanvasPng(documentRef, canvas, filename, options = {}) {
  if (!canvas?.toBlob) throw new Error("当前浏览器不支持 canvas 图片导出");
  const exportCanvas = options.includeMapOverlays || options.renderer
    ? await composeMapExportCanvas(documentRef, canvas, options)
    : canvas;
  const blob = await canvasToBlob(exportCanvas);
  downloadBlob(documentRef, blob, filename);
}

export function mapFileBaseName(map) {
  const seed = sanitizeFilename(map?.metadata?.seed || "map");
  const checksum = sanitizeFilename(map?.metadata?.checksum || "");
  return checksum ? `fmg-${seed}-${checksum}` : `fmg-${seed}`;
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

function migrateMapDocumentStep(document, version) {
  const migrator = MAP_DOCUMENT_MIGRATORS[version];
  if (typeof migrator !== "function") throw new Error(`缺少地图格式 v${version} 迁移器`);
  return migrator(document);
}

const MAP_DOCUMENT_MIGRATORS = Object.freeze({});

function isCompressedMapDocumentFile(file) {
  const name = String(file?.name || "").toLowerCase();
  const type = String(file?.type || "").toLowerCase();
  return name.endsWith(".gz") || type.includes("gzip") || type === "application/x-gzip";
}

function textByteLength(documentRef, text) {
  const view = documentRef.defaultView || window;
  if (typeof view.Blob === "function") return new view.Blob([text], {type: "application/json;charset=utf-8"}).size;
  if (typeof TextEncoder === "function") return new TextEncoder().encode(text).byteLength;
  return text.length;
}

async function decompressMapDocumentFile(documentRef, file) {
  const view = documentRef.defaultView || window;
  if (typeof view.DecompressionStream !== "function" || typeof view.Response !== "function" || typeof view.Blob !== "function") {
    throw new Error("当前浏览器不支持读取压缩地图文件");
  }
  const stream = file.stream().pipeThrough(new view.DecompressionStream("gzip"));
  return new view.Response(stream).text();
}

async function createGzipTextBlob(documentRef, text) {
  const view = documentRef.defaultView || window;
  if (typeof view.CompressionStream !== "function" || typeof view.Response !== "function" || typeof view.Blob !== "function") {
    throw new Error("当前浏览器不支持导出压缩地图文件");
  }
  const stream = new view.Blob([text], {type: "application/json;charset=utf-8"}).stream().pipeThrough(new view.CompressionStream("gzip"));
  const buffer = await new view.Response(stream).arrayBuffer();
  return new view.Blob([buffer], {type: "application/gzip"});
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

function stateFeatures(map) {
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
    return {
      type: "Feature",
      id: `state-${id}`,
      properties: {
        layer: "state",
        id,
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
        dissolved: false,
        hasNote: Boolean(note?.body),
        note: note?.body || ""
      },
      geometry: {
        type: "MultiPolygon",
        coordinates: group.polygons
      }
    };
  }).filter(Boolean);
}

function provinceFeatures(map) {
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
    return {
      type: "Feature",
      id: `province-${id}`,
      properties: {
        layer: "province",
        id,
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
        dissolved: false,
        hasNote: Boolean(note?.body),
        note: note?.body || ""
      },
      geometry: {
        type: "MultiPolygon",
        coordinates: group.polygons
      }
    };
  }).filter(Boolean);
}

function cityFeatures(map) {
  return (map.settlements?.cities || []).map(city => {
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
      group = {cells: 0, area: 0, population: 0, polygons: []};
      groups.set(ownerId, group);
    }
    group.cells += 1;
    group.area += Number(cells.area?.[cellId]) || 0;
    group.population += Number(cells.pop?.[cellId]) || 0;
    group.polygons.push(polygon);
  }

  return groups;
}

function countValidPoliticalObjects(objects = []) {
  return objects.filter(object => {
    const id = Number(object?.i ?? object?.id) || 0;
    return id && !object?.removed;
  }).length;
}

function routeFeatures(map) {
  return (map.settlements?.routes || []).map(route => {
    const coordinates = lineCoordinates(route.points, map);
    if (coordinates.length < 2) return null;
    const note = readObjectNote(map, {kind: "route", id: route.id});
    return {
      type: "Feature",
      id: `route-${route.id}`,
      properties: {
        layer: "route",
        id: route.id,
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
        note: note?.body || ""
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
    const coordinates = lineCoordinates(river.points, map);
    if (coordinates.length < 2) return null;
    const note = readObjectNote(map, {kind: "river", id: river.id});
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
        length: river.length || roundCoordinate(worldLineLength(river.points)),
        width: river.width || 0,
        widthFactor: river.widthFactor || 1,
        hasNote: Boolean(note?.body),
        note: note?.body || ""
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

function zoneFeatures(map) {
  return (map.zones?.zones || []).map(zone => {
    const polygons = (zone.cells || []).map(cell => packCellPolygon(map, cell)).filter(Boolean);
    if (!polygons.length) return null;
    return {
      type: "Feature",
      id: `zone-${zone.i ?? zone.id}`,
      properties: {
        layer: "zone",
        id: zone.i ?? zone.id,
        name: zone.name || "",
        type: zone.type || "",
        hidden: Boolean(zone.hidden),
        cells: zone.cells?.length || 0,
        color: zone.color || "",
        pattern: zone.pattern || "",
        hexColor: zone.hexColor || ""
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

function downloadBlob(documentRef, blob, filename) {
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
  const output = documentRef.createElement("canvas");
  output.width = canvas.width;
  output.height = canvas.height;
  const context = output.getContext("2d");
  if (!context) return canvas;
  if (!copyWebglCanvasTo2d(context, canvas, options.renderer)) {
    context.drawImage(canvas, 0, 0, output.width, output.height);
  }

  const canvasRect = canvas.getBoundingClientRect();
  if (!canvasRect.width || !canvasRect.height) return output;
  const scale = {
    x: output.width / canvasRect.width,
    y: output.height / canvasRect.height
  };

  await drawMapOverlayElements(documentRef, context, canvasRect, scale, options);
  return output;
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

function copyWebglCanvasTo2d(context, canvas, renderer) {
  if (!renderer?.draw) return false;
  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  if (!gl?.readPixels) return false;
  renderer.draw();
  const width = gl.drawingBufferWidth || canvas.width;
  const height = gl.drawingBufferHeight || canvas.height;
  if (!width || !height) return false;
  try {
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const imageData = context.createImageData(width, height);
    const rowBytes = width * 4;
    for (let y = 0; y < height; y += 1) {
      const sourceOffset = (height - y - 1) * rowBytes;
      const targetOffset = y * rowBytes;
      imageData.data.set(pixels.subarray(sourceOffset, sourceOffset + rowBytes), targetOffset);
    }
    if (context.canvas.width === width && context.canvas.height === height) {
      context.putImageData(imageData, 0, 0);
      return true;
    }
    const scratch = canvas.ownerDocument.createElement("canvas");
    scratch.width = width;
    scratch.height = height;
    const scratchContext = scratch.getContext("2d");
    if (!scratchContext) return false;
    scratchContext.putImageData(imageData, 0, 0);
    context.drawImage(scratch, 0, 0, context.canvas.width, context.canvas.height);
    return true;
  } catch {
    return false;
  }
}

async function drawMapOverlayElements(documentRef, context, canvasRect, scale, options = {}) {
  const overlay = options.renderer?.overlay || documentRef.querySelector(".map-overlay");
  if (!overlay) return;
  const elements = Array.from(overlay.querySelectorAll([
    ".city-map-icon.visible",
    ".marker-map-icon.visible",
    ".military-map-icon.visible",
    ".state-label.visible",
    ".city-label.visible",
    ".custom-label.visible"
  ].join(", "))).filter(isVisibleElement);
  elements.sort((a, b) => overlayZIndex(a) - overlayZIndex(b));

  for (const element of elements) {
    if (element.matches(".city-map-icon, .marker-map-icon")) {
      await drawSvgOverlayElement(context, element, canvasRect, scale);
    } else if (element.matches(".military-map-icon")) {
      await drawMilitaryOverlayElement(context, element, canvasRect, scale);
    } else {
      drawTextOverlayElement(context, element, canvasRect, scale);
    }
  }
}

function overlayZIndex(element) {
  const value = Number(element.ownerDocument.defaultView.getComputedStyle(element).zIndex);
  return Number.isFinite(value) ? value : 0;
}

function drawTextOverlayElement(context, element, canvasRect, scale) {
  const text = element.textContent?.trim();
  if (!text) return;
  const box = elementBox(element, canvasRect, scale);
  if (!box || !boxIntersectsCanvas(box, context.canvas)) return;
  const style = element.ownerDocument.defaultView.getComputedStyle(element);
  const opacity = exportOverlayOpacity(element, style);
  if (opacity <= 0) return;
  const isStateLabel = element.classList.contains("state-label");
  const isCustomLabel = element.classList.contains("custom-label");
  const background = style.backgroundColor;
  const borderColor = style.borderColor;

  context.save();
  context.globalAlpha = opacity;
  if (!isStateLabel && isPaintedColor(background)) {
    drawPanel(context, box, cssPixelValue(style.borderRadius, scale.x), background, isPaintedColor(borderColor) ? borderColor : "transparent");
  }
  context.font = cssCanvasFont(style, scale.y);
  context.fillStyle = style.color || "#111";
  context.textBaseline = "middle";
  context.textAlign = "center";

  if (isStateLabel) {
    const rotation = cssRotationDegrees(element);
    context.translate(box.x + box.width / 2, box.y + box.height / 2);
    context.rotate(rotation * Math.PI / 180);
    drawTextShadow(context, element, scale);
    context.fillText(text, 0, 0, Math.max(40, box.width * 0.92));
  } else {
    drawTextShadow(context, element, scale);
    const maxWidth = Math.max(20, box.width - (isCustomLabel ? 10 * scale.x : 0));
    context.fillText(text, box.x + box.width / 2, box.y + box.height / 2, maxWidth);
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
  if (element.classList.contains("city-map-icon")) {
    context.shadowColor = "rgba(10, 13, 12, 0.38)";
    context.shadowBlur = 2.5 * Math.min(scale.x, scale.y);
    context.shadowOffsetY = 1.5 * scale.y;
  } else {
    context.shadowColor = "rgba(3, 6, 7, 0.42)";
    context.shadowBlur = 3 * Math.min(scale.x, scale.y);
    context.shadowOffsetY = 2 * scale.y;
  }
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
  if (isPaintedColor(background)) {
    drawPanel(context, box, cssPixelValue(style.borderRadius, scale.x), background, isPaintedColor(borderColor) ? borderColor : "transparent");
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

function drawTextShadow(context, element, scale) {
  if (element.classList.contains("state-label")) {
    drawShadowedText(context, "rgba(4, 7, 8, 0.82)", 4 * Math.min(scale.x, scale.y), 0, 2 * scale.y);
    return;
  }
  if (element.classList.contains("city-label")) {
    drawShadowedText(context, "rgba(246, 239, 216, 0.72)", 3.5 * Math.min(scale.x, scale.y), 0, 1 * scale.y);
    return;
  }
  drawShadowedText(context, "rgba(4, 7, 8, 0.62)", 2 * Math.min(scale.x, scale.y), 0, 1 * scale.y);
}

function drawShadowedText(context, color, blur, offsetX, offsetY) {
  context.shadowColor = color;
  context.shadowBlur = blur;
  context.shadowOffsetX = offsetX;
  context.shadowOffsetY = offsetY;
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

function drawPanel(context, box, radius, fillStyle, strokeStyle) {
  context.save();
  context.fillStyle = fillStyle;
  context.strokeStyle = strokeStyle;
  context.lineWidth = 1;
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
