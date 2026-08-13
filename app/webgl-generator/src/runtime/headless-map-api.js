import {apiCall} from "./api-result.js";
import {getCellAtPoint, getCellNeighbors, getCellSnapshot, queryCells, scanCells} from "./cell-query-api.js";
import {parseMapDocument, parseMapDocumentPayload} from "./map-file-io.js";
import {getObjectSnapshot, listObjectSnapshots, listObjectTypes, queryObjectSnapshots} from "./object-query-api.js";
import {getPlannerRecipe, listPlannerRecipes} from "./planner-recipe-registry.js";
import {buildMapSummary} from "./read-only-map-core.js";
import {compareAnalysisRegions, compareRegionPower, defineAnalysisRegion, describeAnalysisRegion, diagnoseRegionPopulation, diagnoseRegionTerrain, explainRegionPrecipitation} from "./map-analysis-api.js";
import {getPlaceDirection, measurePlaceDistance, resolvePlace} from "./place-analysis-api.js";
import {normalizeUnitPreferences} from "../ui/display-units.js";

export const HEADLESS_API_VERSION = "1.0.0";

export function createHeadlessMapApi(document) {
  const normalized = normalizeLoadedDocument(document);
  const map = normalized.map;
  const sourceChecksum = map.metadata?.checksum || map.summary?.checksum || normalized.metadata?.checksum || "";
  const metadata = method => ({runtime: "headless", method, sourceChecksum, mutates: "none"});
  return Object.freeze({
    version: HEADLESS_API_VERSION,
    runtime: "headless",
    info: Object.freeze({
      mapSummary: () => apiCall(() => buildMapSummary(map), metadata("info.mapSummary")),
      document: () => apiCall(() => buildDocumentSummary(normalized), metadata("info.document"))
    }),
    objects: Object.freeze({
      types: () => apiCall(() => listObjectTypes(), metadata("objects.types")),
      get: reference => apiCall(() => getObjectSnapshot(map, reference), metadata("objects.get")),
      list: (type, options = {}) => apiCall(() => listObjectSnapshots(map, type, options), metadata("objects.list")),
      query: (query = {}, options = {}) => apiCall(() => queryObjectSnapshots(map, query, options), metadata("objects.query"))
    }),
    cells: Object.freeze({
      get: (reference, options = {}) => apiCall(() => getCellSnapshot(map, reference, options), metadata("cells.get")),
      getAtPoint: (point, options = {}) => apiCall(() => {
        if (point?.coordinateSpace === "client") throw codedError("unsupported_coordinate_space", "无头运行时不支持 client 屏幕坐标，请使用 world 坐标");
        return getCellAtPoint(map, {...point, coordinateSpace: "world"}, options);
      }, metadata("cells.getAtPoint")),
      neighbors: (reference, options = {}) => apiCall(() => getCellNeighbors(map, reference, options), metadata("cells.neighbors")),
      query: (query = {}) => apiCall(() => queryCells(map, query, null), metadata("cells.query")),
      scan: (query = {}) => apiCall(() => scanCells(map, query, null, {signal: query?.signal}), metadata("cells.scan"))
    }),
    climate: Object.freeze({
      get: () => apiCall(() => buildClimateSummary(map), metadata("climate.get"))
    }),
    terrain: Object.freeze({
      get: () => apiCall(() => buildTerrainSummary(map), metadata("terrain.get"))
    }),
    population: Object.freeze({
      get: () => apiCall(() => buildPopulationSummary(map), metadata("population.get"))
    }),
    analysis: Object.freeze({
      defineRegion: specification => apiCall(() => defineAnalysisRegion(map, specification), metadata("analysis.defineRegion")),
      describeRegion: (specification, options = {}) => apiCall(() => describeAnalysisRegion(map, specification, options), metadata("analysis.describeRegion")),
      compareRegions: (left, right, options = {}) => apiCall(() => compareAnalysisRegions(map, left, right, options), metadata("analysis.compareRegions")),
      explainPrecipitation: (specification, options = {}) => apiCall(() => explainRegionPrecipitation(map, specification, options), metadata("analysis.explainPrecipitation")),
      diagnosePopulation: (specification, options = {}) => apiCall(() => diagnoseRegionPopulation(map, specification, options), metadata("analysis.diagnosePopulation")),
      comparePower: (left, right, options = {}) => apiCall(() => compareRegionPower(map, left, right, options), metadata("analysis.comparePower")),
      diagnoseTerrain: (specification, options = {}) => apiCall(() => diagnoseRegionTerrain(map, specification, options), metadata("analysis.diagnoseTerrain")),
      resolvePlace: (reference, options = {}) => apiCall(() => resolvePlace(map, reference), metadata("analysis.resolvePlace")),
      measureDistance: (from, to, options = {}) => apiCall(
        () => measurePlaceDistance(map, from, to, headlessPlaceAnalysisOptions(map, options)),
        metadata("analysis.measureDistance")
      ),
      getDirection: (from, to, options = {}) => apiCall(
        () => getPlaceDirection(map, from, to, headlessPlaceAnalysisOptions(map, options)),
        metadata("analysis.getDirection")
      )
    }),
    planner: Object.freeze({
      listRecipes: () => apiCall(() => listPlannerRecipes(), metadata("planner.listRecipes")),
      getRecipe: recipeId => apiCall(() => getPlannerRecipe(recipeId), metadata("planner.getRecipe"))
    })
  });
}

function headlessPlaceAnalysisOptions(map, options = {}) {
  if (options?.includeScreenDistance === true) throw codedError("unsupported_coordinate_space", "无头运行时不支持屏幕像素距离");
  const explicitUnits = options?.units && typeof options.units === "object" ? options.units : null;
  const savedUnits = map.display?.units && typeof map.display.units === "object" ? map.display.units : null;
  return {
    ...options,
    revision: {mapIdentity: null, mapRevision: 0},
    units: normalizeUnitPreferences(explicitUnits || savedUnits || {}),
    unitSource: explicitUnits ? "explicit" : savedUnits ? "saved" : "defaulted"
  };
}

export function loadHeadlessMapDocument(input) {
  if (typeof input === "string") return parseMapDocument(input);
  if (!input || typeof input !== "object") throw codedError("invalid_document", "必须提供地图文档对象或 JSON 文本");
  return parseMapDocument(JSON.stringify(input));
}

export async function loadHeadlessMapDocumentPayload(payload) {
  return parseMapDocumentPayload(null, payload);
}

function normalizeLoadedDocument(document) {
  if (!document || typeof document !== "object") throw codedError("invalid_document", "必须提供地图文档对象");
  if (document.type === "webgl-generator-map" && document.map && typeof document.map === "object") return document;
  throw codedError("invalid_document", "文件不是当前地图保存格式");
}

function buildDocumentSummary(document) {
  return {
    type: document.type,
    version: document.version,
    exportedAt: document.exportedAt || "",
    checksum: document.metadata?.checksum || document.map?.metadata?.checksum || "",
    mapSchemaVersion: document.metadata?.mapSchemaVersion || null
  };
}

function buildClimateSummary(map) {
  const cells = map.grid?.cells || {};
  return {
    temperature: numericSummary(cells.temp ?? cells.temperature),
    precipitation: numericSummary(cells.prec ?? cells.precipitation),
    options: clonePlain(map.climate?.options || map.options?.climate || {}),
    latitude: clonePlain(map.climate?.latitude || map.coordinates || {}),
    atmosphere: clonePlain(map.climate?.atmosphere || {})
  };
}

function buildTerrainSummary(map) {
  const height = map.grid?.cells?.h || [];
  const values = Array.from(height, Number).filter(Number.isFinite);
  return {
    height: numericSummary(values),
    landCells: values.filter(value => value >= 20).length,
    waterCells: values.filter(value => value < 20).length,
    seaLevel: 20
  };
}

function buildPopulationSummary(map) {
  const rural = map.pack?.cells?.pop || [];
  const burgs = (map.settlements?.burgs || []).filter(item => item && !item.removed);
  const urbanValues = burgs.map(item => Number(item.population ?? item.pop)).filter(Number.isFinite);
  return {
    rural: numericSummary(rural),
    urban: numericSummary(urbanValues),
    cities: burgs.length,
    total: sumFinite(rural) + sumFinite(urbanValues)
  };
}

function numericSummary(source) {
  const values = Array.from(source || [], Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!values.length) return {count: 0, min: null, max: null, mean: null, p50: null, p90: null, total: 0};
  const total = values.reduce((sum, value) => sum + value, 0);
  return {count: values.length, min: values[0], max: values.at(-1), mean: total / values.length, p50: percentile(values, 0.5), p90: percentile(values, 0.9), total};
}

function percentile(values, ratio) {
  return values[Math.min(values.length - 1, Math.max(0, Math.round((values.length - 1) * ratio)))];
}

function sumFinite(source) {
  return Array.from(source || [], Number).filter(Number.isFinite).reduce((sum, value) => sum + value, 0);
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
