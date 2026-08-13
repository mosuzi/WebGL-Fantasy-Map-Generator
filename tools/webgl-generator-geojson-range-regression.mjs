#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {createMapFeatureGeoJson, createMapGeoJson, normalizeGeoJsonExportRange} from "../app/webgl-generator/src/runtime/map-file-io.js";

const map = generatePlaceholderMap({
  seed: "geojson-range-regression",
  heightmapTemplate: "continents",
  cellsTarget: 5000,
  graphWidth: 1440,
  graphHeight: 960,
  randomSeed: false
});
const bbox = [360, 240, 1080, 720];
const range = {mode: "bbox", bbox};
const featureLayers = {state: true, province: true, city: true, route: true, river: true, marker: true, zone: true};

const packDefault = createMapGeoJson(map);
const packFull = createMapGeoJson(map, {range: {mode: "full"}});
const packRange = createMapGeoJson(map, {range});
const packRangeAgain = createMapGeoJson(map, {range});
const packViewport = createMapGeoJson(map, {range: {mode: "viewport"}, viewportBbox: bbox});

assert.deepEqual(featureIds(packDefault), featureIds(packFull), "默认全图导出必须保持原 feature 集合");
assert.deepEqual(featureIds(packRange), featureIds(packRangeAgain), "同一 bbox 的 pack cell 集合必须稳定");
assert.deepEqual(featureIds(packRange), featureIds(packViewport), "显式 bbox 与同范围视口必须得到相同 pack cell 集合");
assert.ok(packRange.features.length > 0 && packRange.features.length < packDefault.features.length, "固定 bbox 必须筛出非空 pack cell 子集");
assertSpatialContract(packDefault, "full");
assertSpatialContract(packRange, "bbox", bbox);
assertFeaturesIntersectRange(packRange);
assert.ok(packRange.features.some(feature => feature.bbox[0] < packRange.properties.exportRange.coordinateBbox[0]
  || feature.bbox[1] < packRange.properties.exportRange.coordinateBbox[1]
  || feature.bbox[2] > packRange.properties.exportRange.coordinateBbox[2]
  || feature.bbox[3] > packRange.properties.exportRange.coordinateBbox[3]), "范围导出必须保留相交 feature 的完整几何，而不是裁切到 bbox");

const rawFeatures = createMapFeatureGeoJson(map, {layers: featureLayers, dissolvePolitical: false, range});
const rawFeaturesAgain = createMapFeatureGeoJson(map, {layers: featureLayers, dissolvePolitical: false, range});
const dissolvedFeatures = createMapFeatureGeoJson(map, {layers: featureLayers, dissolvePolitical: true, range});
assert.deepEqual(featureIds(rawFeatures), featureIds(rawFeaturesAgain), "同一 bbox 的要素集合必须稳定");
assertSpatialContract(rawFeatures, "bbox", bbox);
assertSpatialContract(dissolvedFeatures, "bbox", bbox);
assertFeaturesIntersectRange(rawFeatures);
assertFeaturesIntersectRange(dissolvedFeatures);
assert.deepEqual(politicalIds(rawFeatures), politicalIds(dissolvedFeatures), "普通与 dissolve 政治面在同一 bbox 下必须筛出相同对象");

assert.throws(() => normalizeGeoJsonExportRange(map, {mode: "bbox", bbox: [1, 1, 1, 5]}), /不能为空/);
assert.throws(() => normalizeGeoJsonExportRange(map, {mode: "bbox", bbox: [-1, 0, 10, 10]}), /超出地图世界边界/);
assert.throws(() => normalizeGeoJsonExportRange(map, {mode: "bbox", bbox: [0, 0, 2000, 10]}), /超出地图世界边界/);
assert.throws(() => normalizeGeoJsonExportRange(map, {mode: "viewport"}, {viewportBbox: [1500, 1000, 1600, 1100]}), /没有交集/);

const controlPanelSource = readFileSync(new URL("../app/webgl-generator/src/ui/vue/components/ControlPanel.vue", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8");
const consoleApiSource = readFileSync(new URL("../app/webgl-generator/src/runtime/console-api.js", import.meta.url), "utf8");
assert.match(controlPanelSource, /id="geojson-export-range-mode"/);
assert.match(controlPanelSource, /id="geojson-export-bbox-min-x"/);
assert.match(controlPanelSource, /保留与 bbox 相交的完整要素/);
assert.match(appSource, /exportAction\(\{download: true, includeText: false, range\}\)/, "pack UI 必须把共享 range 传给 runtime action");
assert.match(appSource, /exportAction\(\{download: true, includeText: false, layers, dissolvePolitical, range\}\)/, "feature UI 必须把共享 range 传给 runtime action");
assert.match(appSource, /exportGEO: \(options = \{\}\) => \{[\s\S]*?resolveGeoJsonRangeOptions\(state, options\.range\);[\s\S]*?normalizeGeoJsonExportRange\(state\.map, rangeOptions\.range, \{viewportBbox: rangeOptions\.viewportBbox\}\);[\s\S]*?return operation\.run\("data\.exportGEO"/, "pack GeoJSON 必须在 runtime operation 前完成权威范围预检");
assert.match(consoleApiSource, /resolveGeoJsonRangeOptions\(state, options\.range\)/, "pack / feature API 必须共用范围解析器");
assert.match(consoleApiSource, /renderer\.screenToWorld\(rect\.left, rect\.top\)/, "API 当前视口范围必须来自 renderer 世界坐标转换");

console.log(JSON.stringify({
  ok: true,
  map: {gridCells: map.grid.points.length, packCells: map.pack.cells.i.length},
  range: packRange.properties.exportRange,
  pack: {full: packDefault.features.length, ranged: packRange.features.length},
  features: {
    raw: rawFeatures.features.length,
    dissolved: dissolvedFeatures.features.length,
    layers: layerCounts(dissolvedFeatures)
  }
}, null, 2));

function featureIds(document) {
  return (document.features || []).map(feature => String(feature.id)).sort();
}

function politicalIds(document) {
  return (document.features || [])
    .filter(feature => ["state", "province", "zone"].includes(feature.properties?.layer))
    .map(feature => String(feature.id))
    .sort();
}

function assertSpatialContract(document, mode, expectedWorldBbox = null) {
  assert.equal(document.properties?.coordinateReference, "approximate-equirectangular");
  assert.equal(document.properties?.coordinateReferenceDetail?.method, "approximate-equirectangular");
  assert.equal(document.properties?.coordinateReferenceDetail?.authority, null, "不得伪造 CRS authority");
  assert.equal(document.properties?.coordinateReferenceDetail?.identifier, null, "不得伪造 EPSG identifier");
  assert.deepEqual(document.properties?.worldBounds, [0, 0, 1440, 960]);
  assert.equal(document.properties?.exportRange?.mode, mode);
  assert.equal(document.properties?.exportRange?.inclusion, "intersects-complete-feature");
  assert.equal(document.properties?.exportRange?.geometriesClipped, false);
  assert.ok(document.properties?.coordinateBounds?.every(Number.isFinite));
  assert.ok(document.properties?.exportRange?.coordinateBbox?.every(Number.isFinite));
  if (expectedWorldBbox) assert.deepEqual(document.properties.exportRange.worldBbox, expectedWorldBbox);
  assertValidBbox(document.bbox, "FeatureCollection.bbox");
  const aggregate = aggregateFeatureBbox(document.features);
  assert.deepEqual(document.bbox, aggregate, "FeatureCollection bbox 必须精确包围筛选后 features");
}

function assertFeaturesIntersectRange(document) {
  const rangeBbox = document.properties.exportRange.coordinateBbox;
  for (const feature of document.features) {
    assertValidBbox(feature.bbox, `${feature.id}.bbox`);
    assert.ok(bboxesIntersect(feature.bbox, rangeBbox), `${feature.id} bbox 必须与导出范围相交`);
  }
}

function aggregateFeatureBbox(features) {
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const feature of features) {
    bbox[0] = Math.min(bbox[0], feature.bbox[0]);
    bbox[1] = Math.min(bbox[1], feature.bbox[1]);
    bbox[2] = Math.max(bbox[2], feature.bbox[2]);
    bbox[3] = Math.max(bbox[3], feature.bbox[3]);
  }
  return bbox;
}

function assertValidBbox(bbox, label) {
  assert.ok(Array.isArray(bbox) && bbox.length === 4 && bbox.every(Number.isFinite), `${label} 必须是四项有限数组`);
  assert.ok(bbox[0] <= bbox[2] && bbox[1] <= bbox[3], `${label} 顺序无效`);
}

function bboxesIntersect(left, right) {
  return left[0] <= right[2] && left[2] >= right[0] && left[1] <= right[3] && left[3] >= right[1];
}

function layerCounts(document) {
  const counts = {};
  for (const feature of document.features) {
    const layer = feature.properties?.layer || "pack";
    counts[layer] = (counts[layer] || 0) + 1;
  }
  return counts;
}
