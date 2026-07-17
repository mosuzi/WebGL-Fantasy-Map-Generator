#!/usr/bin/env node
import assert from "node:assert/strict";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {createMapFeatureGeoJson} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {
  NETWORK_GEOJSON_FIELD_DICTIONARY,
  NETWORK_GEOJSON_PROPERTY_SCHEMA_ID,
  NETWORK_GEOJSON_PROPERTY_SCHEMA_VERSION,
  serializeRiverGeoJsonProperties,
  serializeRouteGeoJsonProperties
} from "../app/webgl-generator/src/runtime/network-geojson-properties.js";

const map = generatePlaceholderMap({seed: "network-geojson-properties", cellsTarget: 3000, heightmapTemplate: "continents"});
const layers = {state: false, province: false, city: false, route: true, river: true, marker: false, zone: false};
const full = createMapFeatureGeoJson(map, {layers});
const bounded = createMapFeatureGeoJson(map, {layers, range: {mode: "bbox", bbox: [0, 0, map.metadata.graphWidth, map.metadata.graphHeight]}});

assert.equal(full.properties.networkPropertySchema, NETWORK_GEOJSON_PROPERTY_SCHEMA_ID);
assert.equal(full.properties.networkPropertySchemaVersion, NETWORK_GEOJSON_PROPERTY_SCHEMA_VERSION);
assert.equal(full.features.every(feature => feature.properties.layer === "route" || feature.properties.layer === "river"), true, "网络专项导出混入其它图层");
assert(full.features.some(feature => feature.properties.layer === "route"), "固定图没有路线样本");
assert(full.features.some(feature => feature.properties.layer === "river"), "固定图没有河流样本");
assert.deepEqual(bounded.features.map(featureSignature), full.features.map(featureSignature), "全图与等价 bbox 没有共用同一 serializer");
for (const layer of ["route", "river"]) {
  const layerFeatures = full.features.filter(feature => feature.properties.layer === layer);
  const expectedKeys = Object.keys(layerFeatures[0].properties).sort();
  for (const feature of layerFeatures) assert.deepEqual(Object.keys(feature.properties).sort(), expectedKeys, `${layer} 层内字段集合不一致`);
}

for (const feature of full.features) {
  const properties = feature.properties;
  const dictionary = NETWORK_GEOJSON_FIELD_DICTIONARY[properties.layer];
  assert.equal(properties.networkSchema, NETWORK_GEOJSON_PROPERTY_SCHEMA_ID);
  assert.equal(properties.networkSchemaVersion, NETWORK_GEOJSON_PROPERTY_SCHEMA_VERSION);
  validateDictionaryFields(properties, dictionary.legacy, `${properties.layer} legacy`);
  validateDictionaryFields(properties, dictionary.stableV1, `${properties.layer} stableV1`);
  assert.equal(typeof properties.displayName, "string");
  assert(properties.displayName.length > 0, `${properties.layer} 缺少稳定显示名`);
  assert.equal(typeof properties.typeCode, "string");
  assert.equal(typeof properties.typeLabel, "string");
  assert.equal(typeof properties.levelCode, "string");
  assert.equal(typeof properties.levelLabel, "string");
  assert.equal(properties.lengthUnit, "map-world-unit");
  assert(Number.isFinite(properties.lengthWorld) && properties.lengthWorld >= 0, `${properties.layer} 世界长度无效`);
  assert(Number.isInteger(properties.segmentCount) && properties.segmentCount >= 1, `${properties.layer} 段数无效`);
  assert(Number.isInteger(properties.gridCellCount) && properties.gridCellCount >= 0, `${properties.layer} grid cell 数无效`);
  assert(Number.isInteger(properties.packCellCount) && properties.packCellCount >= 0, `${properties.layer} pack cell 数无效`);
  if (properties.layer === "route") {
    assert.equal(properties.name, properties.displayName, "路线名称与稳定显示名不一致");
    assert.equal(properties.distance, properties.lengthWorld, "路线旧 distance 与稳定长度不一致");
    assert.equal(properties.cells, properties.gridCellCount, "路线旧 cells 与稳定 gridCellCount 不一致");
  } else {
    assert.equal(properties.length, properties.lengthWorld, "河流旧 length 与稳定长度不一致");
    assert.equal(properties.flux, properties.discharge, "河流旧 flux 与稳定 discharge 不一致");
  }
}

const unknownRoute = serializeRouteGeoJsonProperties({settlements: {cities: []}, politics: {states: [], provinces: []}}, {
  id: 7,
  type: "warp",
  level: "gold",
  state: 0,
  province: 0,
  from: -1,
  to: -1,
  points: [[0, 0], [3, 4]],
  cells: Uint32Array.of(1, 2),
  packCells: [4, 5]
});
assert.deepEqual({
  name: unknownRoute.name,
  typeCode: unknownRoute.typeCode,
  typeLabel: unknownRoute.typeLabel,
  levelCode: unknownRoute.levelCode,
  levelLabel: unknownRoute.levelLabel,
  fromName: unknownRoute.fromName,
  toName: unknownRoute.toName,
  lengthWorld: unknownRoute.lengthWorld
}, {
  name: "未知路线 #7",
  typeCode: "unknown",
  typeLabel: "未知路线",
  levelCode: "unclassified",
  levelLabel: "未分级",
  fromName: null,
  toName: null,
  lengthWorld: 5
}, "未知路线或空关系的稳定规则错误");

const unknownRiver = serializeRiverGeoJsonProperties(null, {
  id: 8,
  type: "",
  parent: 2,
  points: [[0, 0], [0, 4]],
  cells: [1, 2],
  gridCells: Uint32Array.of(3, 4),
  flux: null
});
assert.deepEqual({
  displayName: unknownRiver.displayName,
  typeCode: unknownRiver.typeCode,
  typeLabel: unknownRiver.typeLabel,
  levelCode: unknownRiver.levelCode,
  levelLabel: unknownRiver.levelLabel,
  lengthWorld: unknownRiver.lengthWorld,
  discharge: unknownRiver.discharge
}, {
  displayName: "支流 #8",
  typeCode: "branch",
  typeLabel: "支流",
  levelCode: "tributary",
  levelLabel: "支流",
  lengthWorld: 4,
  discharge: 0
}, "河流层级或缺省统计规则错误");

const parsed = JSON.parse(JSON.stringify(full));
assert.equal(parsed.type, "FeatureCollection");
assert.deepEqual(parsed.features.map(featureSignature), full.features.map(featureSignature), "GeoJSON JSON 往返改变稳定属性");

console.log(JSON.stringify({
  ok: true,
  schema: {id: NETWORK_GEOJSON_PROPERTY_SCHEMA_ID, version: NETWORK_GEOJSON_PROPERTY_SCHEMA_VERSION},
  counts: countLayers(full.features),
  routeFields: Object.keys(NETWORK_GEOJSON_FIELD_DICTIONARY.route.stableV1),
  riverFields: Object.keys(NETWORK_GEOJSON_FIELD_DICTIONARY.river.stableV1),
  unknownRoute,
  unknownRiver
}, null, 2));

function featureSignature(feature) {
  return {id: feature.id, properties: feature.properties, geometry: feature.geometry, bbox: feature.bbox};
}

function validateDictionaryFields(properties, dictionary, label) {
  for (const [field, type] of Object.entries(dictionary)) {
    assert(Object.hasOwn(properties, field), `${label} 缺少字段 ${field}`);
    assertValueType(properties[field], type, `${label}.${field}`);
  }
}

function assertValueType(value, type, label) {
  if (type.endsWith("|null") && value === null) return;
  if (type === "integer") assert(Number.isInteger(value), `${label} 必须是 integer`);
  else if (type === "number") assert(Number.isFinite(value), `${label} 必须是 number`);
  else if (type === "string") assert.equal(typeof value, "string", `${label} 必须是 string`);
  else if (type === "boolean") assert.equal(typeof value, "boolean", `${label} 必须是 boolean`);
  else if (type === "integer[]") assert(Array.isArray(value) && value.every(Number.isInteger), `${label} 必须是 integer[]`);
  else if (type === "string|null") assert.equal(typeof value, "string", `${label} 必须是 string|null`);
  else throw new Error(`测试没有处理字段类型 ${type}`);
}

function countLayers(features) {
  return Object.fromEntries(["route", "river"].map(layer => [layer, features.filter(feature => feature.properties.layer === layer).length]));
}
