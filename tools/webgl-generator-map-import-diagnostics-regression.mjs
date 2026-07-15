#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {
  MAP_IMPORT_DIAGNOSTIC_TYPE,
  attachImportDiagnostic,
  classifyMapImportError,
  createHeightmapSourceSummary,
  createImportFailureDiagnostic,
  createImportSuccessDiagnostic,
  createMapImportDiagnostic,
  formatMapImportDiagnosticLines,
  inspectGeoImportSource,
  stringifyMapImportDiagnostic
} from "../app/webgl-generator/src/runtime/map-import-diagnostics.js";
import {normalizeRuntimeOperationError} from "../app/webgl-generator/src/runtime/runtime-operation.js";

const cases = [
  ["文件不是当前地图保存格式", "wrong-document-type", "validate-document"],
  ["暂不支持的地图格式版本：99", "unsupported-version", "migrate-document"],
  ["地图数据的 labels 隐藏表不完整", "invalid-schema", "validate-schema"],
  ["地图文件缺少 map 数据", "missing-map", "validate-document"],
  ["无法读取 typed array：MysteryArray", "unsupported-typed-array", "decode-map"],
  ["Unexpected token } in JSON at position 8", "invalid-json", "parse-json"],
  ["当前浏览器不支持读取压缩地图文件", "unsupported-decompression", "decompress"],
  ["incorrect header check", "invalid-gzip", "decompress"],
  ["renderer load failed", "unknown-import-error", "import-runtime"]
];

for (const [message, code, stage] of cases) {
  assert.deepEqual(classifyMapImportError(message), {
    code,
    stage,
    suggestion: classifyMapImportError(message).suggestion
  });
  assert.ok(classifyMapImportError(message).suggestion.length > 8);
}

const file = {name: "broken.webgl-map.json.gz", size: 4096, type: "application/gzip"};
const diagnostic = createMapImportDiagnostic(new SyntaxError("Unexpected token } in JSON"), file, {
  source: "file",
  occurredAt: "2026-07-14T00:00:00.000Z"
});
assert.equal(diagnostic.type, MAP_IMPORT_DIAGNOSTIC_TYPE);
assert.equal(diagnostic.version, 2);
assert.deepEqual(diagnostic.import, {kind: "map", label: "完整地图", status: "failed"});
assert.equal(diagnostic.expected.documentType, "webgl-generator-map");
assert.equal(diagnostic.expected.documentVersion, 2);
assert.equal(diagnostic.expected.mapSchemaVersion, 2);
assert.equal(diagnostic.file.inferredFormat, "gzip 压缩地图 JSON");
assert.equal(diagnostic.error.code, "invalid-json");
assert.ok(formatMapImportDiagnosticLines(diagnostic).some(line => line === "诊断代码：invalid-json"));
assert.ok(formatMapImportDiagnosticLines(diagnostic).at(-1).startsWith("建议："));
assert.equal(JSON.parse(stringifyMapImportDiagnostic(diagnostic)).file.size, 4096);

const geoDocument = {
  type: "FeatureCollection",
  features: [{type: "Feature", properties: {name: "隐私哨兵-不得进入诊断"}, geometry: {type: "LineString", coordinates: [[1, 2], [3, 4]]}}]
};
const geoInspection = inspectGeoImportSource(JSON.stringify(geoDocument));
assert.equal(geoInspection.kind, "geojson");
assert.deepEqual(geoInspection.summary.geometryTypes, {LineString: 1});
assert.deepEqual(geoInspection.summary.bbox, {minX: 1, minY: 2, maxX: 3, maxY: 4});
const geoSuccess = createImportSuccessDiagnostic("geojson", {name: "measurements.geojson", size: 512, type: "application/geo+json"}, geoInspection.summary, {occurredAt: "2026-07-15T00:00:00.000Z"});
assert.equal(geoSuccess.error, null);
assert.equal(geoSuccess.import.status, "success");
assert.doesNotMatch(stringifyMapImportDiagnostic(geoSuccess), /隐私哨兵/, "诊断不得包含 GEO properties 或原文件正文");

const cellsDocument = {
  type: "FeatureCollection",
  features: Array.from({length: 100}, (_, id) => ({
    type: "Feature",
    properties: {id, height: id % 2 ? 30 : 10, biome: 1, neighbors: []},
    geometry: {type: "Polygon", coordinates: [[[id, 0], [id + 0.5, 0], [id, 0.5], [id, 0]]]}
  }))
};
const cellsInspection = inspectGeoImportSource(cellsDocument);
assert.equal(cellsInspection.kind, "fmg-cells-geojson");
assert.equal(cellsInspection.summary.validFieldRows, 100);
const invalidCells = structuredClone(cellsDocument);
for (const feature of invalidCells.features.slice(0, 30)) delete feature.properties.neighbors;
assert.throws(() => inspectGeoImportSource(invalidCells), error => error.code === "invalid-cells-fields" && error.stage === "validate-fields");

const invalidGeometry = {type: "FeatureCollection", features: [{type: "Feature", properties: {}, geometry: {type: "LineString", coordinates: [["secret-body", null]]}}]};
assert.throws(() => inspectGeoImportSource(invalidGeometry), error => error.code === "invalid-geometry" && error.stage === "validate-geometry");
const geoFailureError = new Error("GEO 数据没有有效几何坐标");
const geoFailure = createImportFailureDiagnostic("geojson", geoFailureError, null, {features: 1});
const attached = attachImportDiagnostic(geoFailureError, geoFailure);
assert.equal(attached.code, "invalid-geometry");
assert.equal(attached.stage, "validate-geometry");
assert.ok(attached.suggestion.length > 8);
const operationError = normalizeRuntimeOperationError(attached, "import");
assert.deepEqual({code: operationError.code, stage: operationError.stage, suggestion: operationError.suggestion}, {
  code: "invalid-geometry",
  stage: "validate-geometry",
  suggestion: attached.suggestion
});

const heightSummary = createHeightmapSourceSummary({name: "terrain.png", size: 2048, type: "image/png"}, {kind: "image-palette", fitMode: "crop", mappingMode: "manual"}, {width: 320, height: 200});
const heightSuccess = createImportSuccessDiagnostic("heightmap", {name: "terrain.png", size: 2048, type: "image/png"}, heightSummary);
assert.deepEqual(heightSuccess.summary.image, {width: 320, height: 200, kind: "image-palette", fitMode: "crop", mappingMode: "manual", invert: false});
const heightFailure = createImportFailureDiagnostic("heightmap", new Error("图片读取失败"), {name: "broken.png", size: 12, type: "image/png"}, heightSummary);
assert.deepEqual({code: heightFailure.error.code, stage: heightFailure.error.stage}, {code: "image-decode-failed", stage: "decode-image"});

const [appSource, panelSource, controlPanelSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/panel.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/ControlPanel.vue", import.meta.url), "utf8")
]);
assert.match(appSource, /lastMapImportDiagnostic:\s*null/);
assert.match(appSource, /reportMapImportError\(state, documentRef, error,/);
assert.match(appSource, /const source = options\.source === "ui" \? "ui" : "api"/);
assert.match(appSource, /exportImportDiagnostic:/);
assert.match(appSource, /exportMapImportDiagnosticViaApi/);
assert.match(appSource, /inspectGeoImportSource\(text\)/);
assert.match(appSource, /createImportSuccessDiagnostic\("heightmap"/);
assert.match(appSource, /createImportFailureDiagnostic\("heightmap"/);
assert.match(appSource, /downloadText\(documentRef, text, filename/);
assert.match(panelSource, /export-map-import-diagnostic/);
assert.match(controlPanelSource, /id="export-map-import-diagnostic"[^>]*hidden/);

console.log(JSON.stringify({
  ok: true,
  categories: cases.length + 5,
  diagnosticType: diagnostic.type,
  diagnosticVersion: diagnostic.version,
  importKinds: ["map", geoInspection.kind, cellsInspection.kind, "heightmap"],
  documentVersion: diagnostic.expected.documentVersion,
  mapSchemaVersion: diagnostic.expected.mapSchemaVersion,
  exportWired: true
}, null, 2));
