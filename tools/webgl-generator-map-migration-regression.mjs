#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {
  MAP_DOCUMENT_TYPE,
  MAP_DOCUMENT_VERSION,
  MAP_SCHEMA_VERSION,
  createMapDocumentMigrationRegistry,
  createMapDocument,
  migrateMapDocument,
  migrateMapDocumentWithRegistry,
  parseMapDocument,
  registerMapDocumentMigrator,
  stringifyMapDocument
} from "../app/webgl-generator/src/runtime/map-file-io.js";

const fixtureText = await readFile(new URL("./fixtures/webgl-map-v1-minimal.json", import.meta.url), "utf8");
const migrated = parseMapDocument(fixtureText);

assert.equal(MAP_DOCUMENT_VERSION, 2);
assert.equal(MAP_SCHEMA_VERSION, 2);
assert.equal(migrated.version, 2);
assert.equal(migrated.metadata.mapSchemaVersion, 2);
assert.equal(migrated.map.metadata.schemaVersion, 2);
assert.ok(migrated.map.grid.cells.h instanceof Uint8Array, "v1 typed array 应在迁移后保持类型");
assert.deepEqual([...migrated.map.grid.cells.h], [12, 20, 48]);
assert.equal(migrated.map.notes.notes[0].body, "保留正文");
assert.equal(migrated.map.notes.metadata.notes, 1);
assert.equal(migrated.map.notes.metadata.formatVersion, 1);
assert.deepEqual(migrated.map.measurements, {version: 1, items: [], metadata: {measurements: 0, nextId: 1}});
assert.deepEqual(migrated.map.labels.hidden, {state: [1], city: []});
assert.deepEqual(migrated.map.labels.metadata, {custom: 0, hidden: 1});
assert.deepEqual(migrated.map.visualTheme, {version: 2, preset: "ancient", overrides: {}, userThemes: []});
assert.equal(migrated.map.options.visualTheme, "ancient");
assert.equal(migrated.map.options.seed, "legacy-v1-sample", "map options 应优先于同名文档 options");
assert.strictEqual(migrateMapDocument(migrated), migrated, "当前版本迁移应保持幂等且不复制文档");

const sourceMap = {metadata: {seed: "new-map"}, options: {visualTheme: "night"}, grid: {cells: {h: new Uint8Array([20, 21])}}};
const current = createMapDocument(sourceMap, sourceMap.options);
assert.equal(current.version, 2);
assert.equal(current.map.metadata.schemaVersion, 2);
assert.equal(current.map.visualTheme.preset, "night");
assert.equal(sourceMap.metadata.schemaVersion, undefined, "导出不得原地改写运行时 map metadata");
assert.equal(sourceMap.measurements, undefined, "导出不得向运行时 map 注入缺失存储");
const currentRoundtrip = parseMapDocument(stringifyMapDocument(current));
assert.deepEqual([...currentRoundtrip.map.grid.cells.h], [20, 21], "v2 stringify / parse 应保持 typed array");

assert.throws(() => migrateMapDocument({type: MAP_DOCUMENT_TYPE, version: 3, map: {}}), /暂不支持的地图格式版本：3/);
assert.throws(() => migrateMapDocument({type: MAP_DOCUMENT_TYPE, version: 1}), /缺少 map 数据/);
assert.throws(() => migrateMapDocument({type: MAP_DOCUMENT_TYPE, version: 2, metadata: {mapSchemaVersion: 2}, map: {metadata: {schemaVersion: 2}}}), /缺少 notes 存储/);
const incompleteV2 = structuredClone(current);
delete incompleteV2.map.labels.hidden.city;
assert.throws(() => migrateMapDocument(incompleteV2), /labels 隐藏表不完整/);

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
