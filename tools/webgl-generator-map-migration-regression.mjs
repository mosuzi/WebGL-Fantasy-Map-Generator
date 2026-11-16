#!/usr/bin/env node
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {gzipSync} from "node:zlib";

import {
  MAP_DOCUMENT_TYPE,
  MAP_DOCUMENT_VERSION,
  MAP_SCHEMA_VERSION,
  createMapDocumentMigrationRegistry,
  createMapDocument,
  migrateMapDocument,
  migrateMapDocumentWithRegistry,
  parseMapDocument,
  parseMapDocumentPayload,
  parseMapDocumentPayloadAsync,
  parseBinaryMapDocumentPayload,
  registerMapDocumentMigrator,
  stringifyMapDocument,
  validateMapDocumentForExport
} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {BROWSER_MAP_STORAGE_TYPE, BROWSER_MAP_STORAGE_VERSION, decodeBrowserMapStoragePayload} from "../app/webgl-generator/src/runtime/browser-map-storage.js";
import {createHeadlessMapApi, loadHeadlessMapDocument} from "../app/webgl-generator/src/runtime/headless-map-api.js";
import {encodeWebfmgV3Document} from "../app/webgl-generator/src/runtime/webfmg-v3-container.js";
import {ensureLabelStore} from "../app/webgl-generator/src/runtime/label-edit-commands.js";

const fixtureText = await readFile(new URL("./fixtures/webgl-map-v1-minimal.json", import.meta.url), "utf8");
const migrated = parseMapDocument(fixtureText);
const legacyV2Text = await readFile(new URL("./fixtures/webgl-map-v2-legacy-city.json", import.meta.url), "utf8");
const legacyV2Source = JSON.parse(legacyV2Text);
assert.equal(legacyV2Source.version, 2, "历史 v2 夹具的文档版本被改写");
assert.equal(legacyV2Source.metadata.mapSchemaVersion, 2, "历史 v2 夹具的地图 schema 被改写");
assert.equal(legacyV2Source.map.pack.burgs[1], undefined, "历史 v2 夹具必须保留缺失 burg 的旧形态");
const legacyV2Original = structuredClone(legacyV2Source);
const oldCity = legacyV2Source.map.settlements.cities[0];
function assertLegacyV2Result(document, route) {
  assert.equal(document.version, MAP_DOCUMENT_VERSION, `${route} 未迁移到当前文档版本`);
  assert.equal(document.map.metadata.schemaVersion, MAP_SCHEMA_VERSION, `${route} 未迁移到当前地图 schema`);
  assert.ok(document.map.grid.cells.h instanceof Uint8Array, `${route} 丢失高度数组类型`);
  assert.deepEqual([...document.map.grid.cells.h], [12, 33, 40], `${route} 改写了高度数据`);
  const city = document.map.settlements.cities[0];
  assert.deepEqual([city.name, city.population, city.culture, city.visual.shape],
    [oldCity.name, oldCity.population, oldCity.culture, oldCity.visual.shape], `${route} 改写了旧城市自有资料`);
  assert.equal(document.map.pack.burgs[1]?.cityId, 0, `${route} 未补齐旧城镇记录`);
  assert.equal(document.map.pack.cells.burg[1], 1, `${route} 未补齐 pack cell 镜像`);
  assert.equal(document.map.grid.cells.burg[1], 0, `${route} 未补齐 grid cell 镜像`);
  validateMapDocumentForExport(document);
}
const legacyV2 = parseMapDocument(legacyV2Text);
assertLegacyV2Result(legacyV2, "完整 JSON");
const view = {defaultView: globalThis};
assertLegacyV2Result(await parseMapDocumentPayload(view, legacyV2Text), "公开导入入口");
assertLegacyV2Result(await parseBinaryMapDocumentPayload(view, gzipSync(legacyV2Text)), "旧压缩 JSON");
const legacyV2BinarySource = JSON.parse(legacyV2Text, (_key, value) => {
  const Constructor = value?.__webglGeneratorTypedArray && globalThis[value.__webglGeneratorTypedArray];
  return typeof Constructor === "function" ? new Constructor(value.data || []) : value;
});
assertLegacyV2Result(await parseBinaryMapDocumentPayload(view, gzipSync(encodeWebfmgV3Document(legacyV2BinarySource))), "WEBFMG3 旧文档");
const frozenHistoricalBinary = await readFile(new URL("./fixtures/webgl-map-v2-legacy-city-0.2.12.webfmg", import.meta.url));
assert.equal(createHash("sha256").update(frozenHistoricalBinary).digest("hex"), "afdfcdc9b040db4c73e080266c902aacdb97bdf577591e1ff8e8ffc714164a46", "历史二进制夹具被改写");
assertLegacyV2Result(await parseBinaryMapDocumentPayload(view, frozenHistoricalBinary), "0.2.12 冻结 WEBFMG3");
assertLegacyV2Result(await parseBinaryMapDocumentPayload(view, gzipSync(frozenHistoricalBinary)), "0.2.12 冻结压缩 WEBFMG3");
const futureContainer = encodeWebfmgV3Document(legacyV2BinarySource).slice();
new DataView(futureContainer.buffer, futureContainer.byteOffset, futureContainer.byteLength).setUint16(10, MAP_SCHEMA_VERSION + 1, true);
for (const [route, load] of [
  ["WEBFMG3 同步解码", () => parseBinaryMapDocumentPayload(view, futureContainer)],
  ["WEBFMG3 异步解码", () => parseMapDocumentPayloadAsync(view, futureContainer)],
  ["WEBFMG3 压缩解码", () => parseBinaryMapDocumentPayload(view, gzipSync(futureContainer))]
]) {
  await assert.rejects(load, error => error?.code === "map_schema_version_unsupported" && error?.details?.scope === "container", `${route} 静默降级未来 schema`);
}
for (const encoded of [
  {encoding: "plain", data: legacyV2Text},
  {encoding: "gzip-base64", data: gzipSync(legacyV2Text).toString("base64")}
]) {
  const envelope = JSON.stringify({type: BROWSER_MAP_STORAGE_TYPE, version: BROWSER_MAP_STORAGE_VERSION, savedAt: "2026-07-10T00:00:00.000Z", ...encoded});
  const decoded = await decodeBrowserMapStoragePayload(view, envelope);
  assertLegacyV2Result(await parseMapDocumentPayload(view, decoded), `浏览器 ${encoded.encoding}`);
}
const legacyV2Saved = createMapDocument(legacyV2.map, legacyV2.options);
assertLegacyV2Result(parseMapDocument(stringifyMapDocument(legacyV2Saved)), "升级后保存回读");
assert.deepEqual(legacyV2Source, legacyV2Original, "迁移改写了历史夹具输入");
const legacyHeaderOnly = JSON.parse(fixtureText, (_key, value) => {
  const Constructor = value?.__webglGeneratorTypedArray && globalThis[value.__webglGeneratorTypedArray];
  return typeof Constructor === "function" ? new Constructor(value.data || []) : value;
});
legacyHeaderOnly.metadata.documentId = "legacy-header-only:1";
legacyHeaderOnly.metadata.documentIdentityVersion = 1;
const migratedLegacyHeaderOnly = migrateMapDocument(legacyHeaderOnly);
assert.equal(migratedLegacyHeaderOnly.metadata.documentId, "legacy-header-only:1", "v1 header-only identity 没有保留");
assert.equal(migratedLegacyHeaderOnly.map.metadata.documentId, "legacy-header-only:1", "v1 header-only identity 没有在 normalization 前传给 map");
const objectV1 = await parseMapDocumentPayload(view, legacyHeaderOnly);
const objectV2 = await parseMapDocumentPayload(view, legacyV2);
for (const [route, document] of [["v1 对象导入", objectV1], ["v2 对象导入", objectV2]]) {
  assert.ok(document.map.grid.cells.h instanceof Uint8Array, `${route} 把 typed array 降成普通对象`);
  assert.deepEqual([...document.map.grid.cells.h], route.startsWith("v1") ? [12, 20, 48] : [12, 33, 40], `${route} 改写了高度数据`);
  assert.equal(createHeadlessMapApi(document).terrain.get().data.height.count, 3, `${route} 无头读取丢失高度数据`);
}
const headlessV1 = loadHeadlessMapDocument(legacyHeaderOnly);
assert.ok(headlessV1.map.grid.cells.h instanceof Uint8Array, "无头对象载入把旧 v1 typed array 降成普通对象");
assert.equal(createHeadlessMapApi(headlessV1).terrain.get().data.height.count, 3, "无头对象载入后高度统计丢失");

assert.equal(MAP_DOCUMENT_VERSION, 2);
assert.equal(MAP_SCHEMA_VERSION, 2);
assert.equal(migrated.version, 2);
assert.equal(migrated.metadata.mapSchemaVersion, 2);
assert.match(migrated.metadata.documentId, /^fmg-doc-v1-[0-9a-f]{16}$/u);
assert.equal(migrated.metadata.documentId, migrated.map.metadata.documentId);
assert.equal(migrated.metadata.documentIdentityVersion, 1);
assert.equal(migrated.map.metadata.schemaVersion, 2);
assert.ok(migrated.map.grid.cells.h instanceof Uint8Array, "v1 typed array 应在迁移后保持类型");
assert.deepEqual([...migrated.map.grid.cells.h], [12, 20, 48]);
assert.equal(migrated.map.notes.notes[0].body, "保留正文");
assert.equal(migrated.map.notes.metadata.notes, 1);
assert.equal(migrated.map.notes.metadata.formatVersion, 1);
assert.deepEqual(migrated.map.measurements, {version: 1, items: [], metadata: {measurements: 0, nextId: 1}});
assert.deepEqual(migrated.map.labels.hidden, {state: [1], city: [], province: []});
assert.deepEqual(migrated.map.labels.metadata, {custom: 0, hidden: 1});
assert.deepEqual(migrated.map.labels.styles, {version: 1, overrides: {}});
assert.deepEqual(migrated.map.visualTheme, {version: 2, preset: "ancient", overrides: {}, userThemes: []});
assert.equal(migrated.map.options.visualTheme, "ancient");
assert.equal(migrated.map.options.seed, "legacy-v1-sample", "map options 应优先于同名文档 options");
assert.deepEqual(migrateMapDocument(migrated), migrated, "当前版本重复迁移应保持数据幂等");

const sourceMap = {metadata: {seed: "new-map"}, options: {visualTheme: "night"}, grid: {cells: {h: new Uint8Array([20, 21])}}};
const current = createMapDocument(sourceMap, sourceMap.options);
const currentAgain = createMapDocument(sourceMap, sourceMap.options);
assert.equal(current.version, 2);
assert.equal(current.metadata.documentId, current.map.metadata.documentId);
assert.equal(current.metadata.documentIdentityVersion, 1);
assert.equal(current.metadata.documentId, currentAgain.metadata.documentId, "同一无 identity map 重复导出必须稳定派生");
assert.equal(current.map.metadata.schemaVersion, 2);
assert.equal(current.map.visualTheme.preset, "night");
assert.equal(sourceMap.metadata.schemaVersion, undefined, "导出不得原地改写运行时 map metadata");
assert.equal(sourceMap.metadata.documentId, undefined, "导出不得原地写入运行时 document identity");
assert.equal(sourceMap.measurements, undefined, "导出不得向运行时 map 注入缺失存储");
const currentRoundtrip = parseMapDocument(stringifyMapDocument(current));
assert.equal(currentRoundtrip.metadata.documentId, current.metadata.documentId, "v2 往返没有保留 document identity");
assert.deepEqual([...currentRoundtrip.map.grid.cells.h], [20, 21], "v2 stringify / parse 应保持 typed array");

assert.throws(() => migrateMapDocument({type: MAP_DOCUMENT_TYPE, version: 3, map: {}}), /暂不支持的地图格式版本：3/);
assert.throws(() => migrateMapDocument({type: MAP_DOCUMENT_TYPE, version: 1}), /缺少 map 数据/);
for (const [scope, metadata] of [
  ["document", {document: true, map: false}],
  ["map", {document: false, map: true}],
  ["document", {document: true, map: true}]
]) {
  const futureSchema = structuredClone(current);
  if (metadata.document) futureSchema.metadata.mapSchemaVersion = MAP_SCHEMA_VERSION + 1;
  if (metadata.map) futureSchema.map.metadata.schemaVersion = MAP_SCHEMA_VERSION + 1;
  assert.throws(() => migrateMapDocument(futureSchema), error => error?.code === "map_schema_version_unsupported" && error?.details?.scope === scope, "未来 schema 不得降级导入");
}
const futureExportMap = structuredClone(current.map);
futureExportMap.metadata.schemaVersion = MAP_SCHEMA_VERSION + 1;
assert.throws(() => createMapDocument(futureExportMap, current.options), error => error?.code === "map_schema_version_unsupported" && error?.details?.scope === "map", "未来 schema 不得降级导出");
const incompleteV2 = structuredClone(current);
delete incompleteV2.map.labels.hidden.city;
delete incompleteV2.map.labels.hidden.state;
const normalizedIncompleteV2 = migrateMapDocument(incompleteV2);
assert.deepEqual(normalizedIncompleteV2.map.labels.hidden.city, [], "旧 v2 缺少城市隐藏表时没有回填");
assert.deepEqual(normalizedIncompleteV2.map.labels.hidden.state, [], "旧 v2 缺少国家隐藏表时没有回填");
const oldCurrentV2 = structuredClone(current);
delete oldCurrentV2.map.labels.styles;
delete oldCurrentV2.map.labels.hidden.province;
const normalizedOldCurrentV2 = migrateMapDocument(oldCurrentV2);
ensureLabelStore(normalizedOldCurrentV2.map);
assert.deepEqual(normalizedOldCurrentV2.map.labels.hidden.province, [], "旧 v2 迁移没有回填省份隐藏表");
assert.deepEqual(normalizedOldCurrentV2.map.labels.styles, {version: 1, overrides: {}}, "旧 v2 迁移没有回填标签样式存储");

const invalidProvinceHiddenV2 = structuredClone(current);
invalidProvinceHiddenV2.map.labels.hidden.province = "1";
assert.throws(() => migrateMapDocument(invalidProvinceHiddenV2), /省份隐藏表无效/);

const emptyStylesV2 = structuredClone(current);
emptyStylesV2.map.labels.styles = {};
assert.throws(() => migrateMapDocument(emptyStylesV2), /标签样式存储版本无效/);

const missingStyleVersionV2 = structuredClone(current);
missingStyleVersionV2.map.labels.styles = {overrides: {}};
assert.throws(() => migrateMapDocument(missingStyleVersionV2), /标签样式存储版本无效/);

const missingStyleOverridesV2 = structuredClone(current);
missingStyleOverridesV2.map.labels.styles = {version: 1};
assert.throws(() => migrateMapDocument(missingStyleOverridesV2), /标签样式覆盖表无效/);

for (const invalidOverride of [null, false, 0, "", []]) {
  const invalidStyleOverrideV2 = structuredClone(current);
  invalidStyleOverrideV2.map.labels.styles = {version: 1, overrides: {city: invalidOverride}};
  assert.throws(() => migrateMapDocument(invalidStyleOverrideV2), /标签样式覆盖无效/);
}

const sparseLegacyV2 = structuredClone(current);
delete sparseLegacyV2.metadata.mapSchemaVersion;
delete sparseLegacyV2.metadata.documentId;
delete sparseLegacyV2.metadata.documentIdentityVersion;
delete sparseLegacyV2.map.metadata.schemaVersion;
delete sparseLegacyV2.map.metadata.documentId;
delete sparseLegacyV2.map.metadata.documentIdentityVersion;
delete sparseLegacyV2.map.notes;
delete sparseLegacyV2.map.measurements;
delete sparseLegacyV2.map.labels;
delete sparseLegacyV2.map.visualTheme;
delete sparseLegacyV2.map.diplomacy;
delete sparseLegacyV2.map.oceanCurrents;
sparseLegacyV2.map.display = {units: {distanceUnit: "km"}};
const backfilledLegacyV2 = migrateMapDocument(sparseLegacyV2);
assert.equal(backfilledLegacyV2.metadata.mapSchemaVersion, MAP_SCHEMA_VERSION, "旧 v2 文档 schema 标记没有回填");
assert.match(backfilledLegacyV2.metadata.documentId, /^fmg-doc-v1-[0-9a-f]{16}$/u, "旧 v2 document identity 没有派生");
assert.equal(backfilledLegacyV2.metadata.documentId, backfilledLegacyV2.map.metadata.documentId, "旧 v2 文档与 map identity 不一致");
assert.equal(backfilledLegacyV2.map.metadata.schemaVersion, MAP_SCHEMA_VERSION, "旧 v2 地图 schema 标记没有回填");
assert.ok(backfilledLegacyV2.map.grid.cells.h instanceof Uint8Array, "旧 v2 typed array 在回填时丢失");
assert.deepEqual(backfilledLegacyV2.map.notes.notes, [], "旧 v2 notes 没有回填");
assert.deepEqual(backfilledLegacyV2.map.measurements, {version: 1, items: [], metadata: {measurements: 0, nextId: 1}}, "旧 v2 measurements 没有回填");
assert.deepEqual(backfilledLegacyV2.map.labels.hidden, {city: [], state: [], province: []}, "旧 v2 labels 没有回填");
assert.equal(backfilledLegacyV2.map.visualTheme.preset, "night", "旧 v2 visualTheme 没有沿用原选项回填");
assert.ok(Array.isArray(backfilledLegacyV2.map.oceanCurrents.currents), "旧 v2 oceanCurrents 没有回填");
assert.ok(backfilledLegacyV2.map.diplomacy && Array.isArray(backfilledLegacyV2.map.diplomacy.chronicle), "旧 v2 diplomacy 没有回填");
assert.ok(Array.isArray(backfilledLegacyV2.map.display.units.customUnits), "旧 v2 自定义单位表没有回填");
assert.deepEqual(migrateMapDocument(backfilledLegacyV2), backfilledLegacyV2, "旧 v2 回填结果重复迁移不幂等");

const headerOnlyIdentity = structuredClone(current);
delete headerOnlyIdentity.map.metadata.documentId;
delete headerOnlyIdentity.map.metadata.documentIdentityVersion;
const migratedHeaderOnlyIdentity = migrateMapDocument(headerOnlyIdentity);
assert.equal(migratedHeaderOnlyIdentity.map.metadata.documentId, current.metadata.documentId, "header identity 没有迁移到 map metadata");

const conflictingIdentity = structuredClone(current);
conflictingIdentity.map.metadata.documentId = "fmg-doc-v1-fedcba9876543210";
assert.throws(
  () => migrateMapDocument(conflictingIdentity),
  error => error?.code === "persisted_document_identity_mismatch",
  "冲突 document identity 必须拒绝"
);

const versionWithoutIdentity = structuredClone(current);
delete versionWithoutIdentity.metadata.documentId;
delete versionWithoutIdentity.map.metadata.documentId;
versionWithoutIdentity.metadata.documentIdentityVersion = 2;
assert.throws(
  () => migrateMapDocument(versionWithoutIdentity),
  error => error?.code === "persisted_document_identity_version_invalid",
  "没有 id 的未知 document identity version 也必须拒绝"
);

const futureRegistry = createMapDocumentMigrationRegistry({
  1: document => ({...document, version: 2, map: {...document.map, migrationPath: ["v1-v2"]}})
});
registerMapDocumentMigrator(futureRegistry, 2, document => ({...document, version: 3, map: {...document.map, migrationPath: [...document.map.migrationPath, "v2-v3"]}}));
const chained = migrateMapDocumentWithRegistry({type: MAP_DOCUMENT_TYPE, version: 1, map: {}}, {
  targetVersion: 3,
  registry: futureRegistry,
  validate: document => assert.deepEqual(document.map.migrationPath, ["v1-v2", "v2-v3"])
});
assert.equal(chained.version, 3, "模拟下一版本必须逐步执行迁移链");
assert.throws(() => registerMapDocumentMigrator(futureRegistry, 2, () => null), /重复注册/);
assert.throws(() => migrateMapDocumentWithRegistry({type: MAP_DOCUMENT_TYPE, version: 1, map: {}}, {
  targetVersion: 4,
  registry: futureRegistry
}), /缺少地图格式 v3 迁移器/);
assert.throws(() => migrateMapDocumentWithRegistry({type: MAP_DOCUMENT_TYPE, version: 4, map: {}}, {
  targetVersion: 3,
  registry: futureRegistry
}), /暂不支持的地图格式版本：4/);

console.log(JSON.stringify({
  ok: true,
  sourceVersion: 1,
  targetVersion: migrated.version,
  mapSchemaVersion: migrated.map.metadata.schemaVersion,
  typedArray: migrated.map.grid.cells.h.constructor.name,
  notes: migrated.map.notes.metadata.notes,
  measurements: migrated.map.measurements.metadata.measurements,
  hiddenLabels: migrated.map.labels.metadata.hidden,
  visualTheme: migrated.map.visualTheme.preset,
  currentDocumentIdempotent: true,
  simulatedMigrationPath: chained.map.migrationPath,
  futureVersionRejected: true
}, null, 2));
