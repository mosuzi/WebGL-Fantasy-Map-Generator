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
  getMapDocumentUpgradeInfo,
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
import {decodeWebfmgV3Document, encodeWebfmgV3Document} from "../app/webgl-generator/src/runtime/webfmg-v3-container.js";
import {ensureLabelStore} from "../app/webgl-generator/src/runtime/label-edit-commands.js";
import {normalizeUnitPreferences} from "../app/webgl-generator/src/ui/display-units.js";
import {normalizeSavedBrushRadii} from "../app/webgl-generator/src/runtime/brush-radius-contract.js";

const fixtureText = await readFile(new URL("./fixtures/webgl-map-v1-minimal.json", import.meta.url), "utf8");
const v1UpgradeEvents = [];
const migrated = parseMapDocument(fixtureText, {onUpgrade: info => v1UpgradeEvents.push(info)});
const frozenV1Document = JSON.parse(fixtureText, (_key, value) => {
  const Constructor = value?.__webglGeneratorTypedArray && globalThis[value.__webglGeneratorTypedArray];
  return typeof Constructor === "function" ? new Constructor(value.data || []) : value;
});
const intermediateV2 = migrateMapDocumentWithRegistry(frozenV1Document, {targetVersion: 2});
assert.deepEqual([intermediateV2.version, intermediateV2.metadata.mapSchemaVersion, intermediateV2.map.metadata.schemaVersion], [2, 2, 2], "v1→v2 中间版本标记不一致");
assert.equal(intermediateV2.map.display?.brushRadii, undefined, "v1→v2 中间版本提前写入 v3 画笔字段");
assert.deepEqual(migrateMapDocumentWithRegistry(intermediateV2, {targetVersion: 3}).map.display.brushRadii,
  normalizeSavedBrushRadii(), "v2→v3 没有补齐六支画笔大小");
assert.deepEqual(getMapDocumentUpgradeInfo(migrated), {needed: true, sourceVersion: 1, targetVersion: 4}, "v1 迁移缺少打开提示来源");
assert.deepEqual(v1UpgradeEvents, [getMapDocumentUpgradeInfo(migrated)], "v1 迁移未及时发出升级进度");
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
  assert.deepEqual(document.map.display.brushRadii, normalizeSavedBrushRadii(), `${route} 未回填旧档画笔大小`);
  validateMapDocumentForExport(document);
}
const v2UpgradeEvents = [];
const legacyV2 = parseMapDocument(legacyV2Text, {onUpgrade: info => v2UpgradeEvents.push(info)});
assert.deepEqual(getMapDocumentUpgradeInfo(legacyV2), {needed: true, sourceVersion: 2, targetVersion: 4}, "旧版历史回填缺少打开提示来源");
assert.deepEqual(v2UpgradeEvents, [getMapDocumentUpgradeInfo(legacyV2)], "同版历史回填未及时发出升级进度");
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
const frozenHistoricalDocument = await parseBinaryMapDocumentPayload(view, frozenHistoricalBinary);
const landlessBytes = await readFile(new URL("./fixtures/webgl-map-v3-landless-state-0.5.158.webfmg", import.meta.url));
assert.equal(createHash("sha256").update(landlessBytes).digest("hex"), "726b18fd6f9e88b7bf5cb0afc51c8ac526ca0f4df1153587e5445646594dc8b4");
const landlessV3 = decodeWebfmgV3Document(landlessBytes);
assert.equal(landlessV3.version, 3);
const archivedText = stringifyMapDocument(landlessV3);
const storageRecord = JSON.stringify({type: BROWSER_MAP_STORAGE_TYPE, version: BROWSER_MAP_STORAGE_VERSION,
  encoding: "gzip-base64", data: gzipSync(archivedText).toString("base64")});
for (const opened of [migrateMapDocument(landlessV3), parseMapDocument(archivedText),
  await parseMapDocumentPayload(view, await decodeBrowserMapStoragePayload(view, storageRecord)),
  await parseBinaryMapDocumentPayload(view, landlessBytes), await parseMapDocumentPayloadAsync(view, gzipSync(landlessBytes))]) {
  assert.deepEqual(getMapDocumentUpgradeInfo(opened), {needed: true, sourceVersion: 3, targetVersion: 4});
  assert.equal(opened.map.politics.states[2].removed, true);
  assert.equal(opened.map.pack.states[2].capital, 0);
  assert.equal(opened.map.politics.states[2].custom, "保留史料");
  assert.equal(opened.map.politics.states[1].removed, undefined);
  assert.deepEqual(opened.map.settlements.cities[0], landlessV3.map.settlements.cities[0]);
  const savedAgain = await parseBinaryMapDocumentPayload(view, encodeWebfmgV3Document(createMapDocument(opened.map)));
  assert.deepEqual(savedAgain.map.politics.states[2], opened.map.politics.states[2]);
  assert.equal(getMapDocumentUpgradeInfo(savedAgain), null);
}
assert.equal(landlessV3.map.politics.states[2].removed, undefined);
for (const layer of ["grid", "pack"]) {
  const partial = structuredClone(landlessV3);
  partial.map[layer].cells.state[1] = 2;
  assert.equal(migrateMapDocument(partial).map.politics.states[2].removed, undefined, "任一地图层仍有实际陆地须保留国家");
}
assertLegacyV2Result(frozenHistoricalDocument, "0.2.12 冻结 WEBFMG3");
assert.equal(getMapDocumentUpgradeInfo(frozenHistoricalDocument)?.needed, true, "历史 WEBFMG3 缺少升级提示来源");
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
const legacyV2Reopened = parseMapDocument(stringifyMapDocument(legacyV2Saved));
assertLegacyV2Result(legacyV2Reopened, "升级后保存回读");
assert.equal(getMapDocumentUpgradeInfo(legacyV2Reopened), null, "升级后保存回读再次提示升级");
const missingBurgOnly = structuredClone(legacyV2Saved);
missingBurgOnly.map.pack.burgs[1] = null;
const burgUpgradeEvents = [];
const repairedBurgDocument = migrateMapDocument(missingBurgOnly, {onUpgrade: info => burgUpgradeEvents.push(info)});
assert.equal(repairedBurgDocument.map.pack.burgs[1]?.cityId, 0, "同版城镇修复未补回 burg");
assert.deepEqual(burgUpgradeEvents, [getMapDocumentUpgradeInfo(repairedBurgDocument)], "单独缺失 burg 未在修复前发出升级进度");
const missingCityMirrorOnly = structuredClone(legacyV2Saved);
missingCityMirrorOnly.map.grid.cells.burg[1] = -1;
const mirrorUpgradeEvents = [];
const repairedMirrorDocument = migrateMapDocument(missingCityMirrorOnly, {onUpgrade: info => mirrorUpgradeEvents.push(info)});
assert.equal(repairedMirrorDocument.map.grid.cells.burg[1], 0, "同版城镇镜像修复未补回 grid cell");
assert.deepEqual(mirrorUpgradeEvents, [getMapDocumentUpgradeInfo(repairedMirrorDocument)], "单独缺失城镇镜像未提示整理");
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

assert.equal(MAP_DOCUMENT_VERSION, 4);
assert.equal(MAP_SCHEMA_VERSION, 4);
assert.equal(migrated.version, 4);
assert.equal(migrated.metadata.mapSchemaVersion, 4);
assert.match(migrated.metadata.documentId, /^fmg-doc-v1-[0-9a-f]{16}$/u);
assert.equal(migrated.metadata.documentId, migrated.map.metadata.documentId);
assert.equal(migrated.metadata.documentIdentityVersion, 1);
assert.equal(migrated.map.metadata.schemaVersion, 4);
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
assert.equal(current.version, 4);
assert.equal(current.metadata.documentId, current.map.metadata.documentId);
assert.equal(current.metadata.documentIdentityVersion, 1);
assert.equal(current.metadata.documentId, currentAgain.metadata.documentId, "同一无 identity map 重复导出必须稳定派生");
assert.equal(current.map.metadata.schemaVersion, 4);
assert.deepEqual(current.map.display.brushRadii, normalizeSavedBrushRadii(), "新地图未写入画笔默认值");
assert.equal(current.map.visualTheme.preset, "night");
assert.equal(sourceMap.metadata.schemaVersion, undefined, "导出不得原地改写运行时 map metadata");
assert.equal(sourceMap.metadata.documentId, undefined, "导出不得原地写入运行时 document identity");
assert.equal(sourceMap.measurements, undefined, "导出不得向运行时 map 注入缺失存储");
const currentRoundtrip = parseMapDocument(stringifyMapDocument(current));
assert.equal(getMapDocumentUpgradeInfo(currentRoundtrip), null, "当前版本存档错误提示升级");
const customRadii = {state: 1, province: 32, culture: 7, religion: 13, biome: 2, suitability: 31};
const customDocument = createMapDocument(current.map, {...current.options, display: {brushRadii: customRadii}});
assert.deepEqual(parseMapDocument(stringifyMapDocument(customDocument)).map.display.brushRadii, customRadii, "JSON 未保存六支独立画笔大小");
assert.deepEqual((await parseBinaryMapDocumentPayload(view, encodeWebfmgV3Document(customDocument))).map.display.brushRadii,
  customRadii, "WEBFMG3 未保存六支独立画笔大小");
const clampedDocument = createMapDocument(current.map, {...current.options, display: {brushRadii: {...customRadii, state: 0, province: 120}}});
assert.deepEqual([clampedDocument.map.display.brushRadii.state, clampedDocument.map.display.brushRadii.province], [1, 32], "历史画笔大小未归入新区间");
const currentWithUnits = structuredClone(currentRoundtrip);
currentWithUnits.map.display = {...currentWithUnits.map.display, units: normalizeUnitPreferences({distanceUnit: "km"})};
assert.equal(getMapDocumentUpgradeInfo(migrateMapDocument(structuredClone(currentWithUnits))), null, "完整单位设置错误提示升级");
const currentWithEconomy = createMapDocument({
  ...currentRoundtrip.map,
  pack: {
    ...(currentRoundtrip.map.pack || {}),
    goods: [null, {i: 1, name: "Salt", visible: true, color: "#d7a84f", icon: "●", label: "Salt"}],
    markets: [null, {i: 1, name: "Market", color: "#4f9cc9"}]
  }
}, currentRoundtrip.options);
assert.equal(getMapDocumentUpgradeInfo(migrateMapDocument(structuredClone(currentWithEconomy))), null, "完整商品展示字段错误提示升级");
for (const [label, source, remove] of [
  ["备注内部版本", currentRoundtrip, document => { delete document.map.notes.metadata.formatVersion; }],
  ["显示单位存储", currentWithUnits, document => { delete document.map.display.units; }],
  ["自定义单位列表", currentWithUnits, document => { delete document.map.display.units.customUnits; }],
  ["商品颜色", currentWithEconomy, document => { delete document.map.pack.goods[1].color; }],
  ["市场颜色", currentWithEconomy, document => { delete document.map.pack.markets[1].color; }]
]) {
  const document = structuredClone(source);
  remove(document);
  const notices = [];
  const upgraded = migrateMapDocument(document, {onUpgrade: info => notices.push(info)});
  assert.equal(getMapDocumentUpgradeInfo(upgraded)?.needed, true, `同版旧档仅缺${label}时未标记升级`);
  assert.deepEqual(notices, [getMapDocumentUpgradeInfo(upgraded)], `同版旧档仅缺${label}时未及时提示`);
}
const playableBinary = await readFile(new URL("./fixtures/webgl-map-v2-playable-legacy-notes.webfmg", import.meta.url));
assert.equal(createHash("sha256").update(playableBinary).digest("hex"), "e0418f77d6aff1b5bc5e93926542b69bf242d2ee03672c7d84c1aac87393ded3", "完整地图夹具被改写");
const playableLegacy = await parseBinaryMapDocumentPayload(view, playableBinary);
const playableCurrent = createMapDocument(playableLegacy.map, playableLegacy.options);
assert.equal(getMapDocumentUpgradeInfo(migrateMapDocument(structuredClone(playableCurrent))), null, "完整当前地图错误提示整理");
const lakeIndex = playableCurrent.map.pack.features.findIndex(feature => feature?.type === "lake");
assert.ok(lakeIndex >= 0 && playableCurrent.map.rivers.rivers.length && playableCurrent.map.zones.zones.length, "完整地图夹具须覆盖湖泊、河流及地区");
const burgIndex = playableCurrent.map.settlements.cities.find(city => city && !city.removed)?.burgId;
assert.ok(playableCurrent.map.pack.burgs[burgIndex]?.id >= 0, "完整地图夹具须覆盖已存在的 burg 身份");
for (const [label, remove, read] of [
  ["湖泊溢流", document => { delete document.map.pack.features[lakeIndex].overflow; }, document => document.map.pack.features[lakeIndex].overflow],
  ["河网状态", document => { delete document.map.rivers.rivers[0].networkStatus; }, document => document.map.rivers.rivers[0].networkStatus],
  ["河网诊断", document => { delete document.map.rivers.metadata.networkDiagnostics; }, document => document.map.rivers.metadata.networkDiagnostics],
  ["地区覆盖", document => { delete document.map.zones.zones[0].coverage; }, document => document.map.zones.zones[0].coverage],
  ["洋流算法", document => { delete document.map.oceanCurrents.algorithm; }, document => document.map.oceanCurrents.algorithm],
  ["洋流数量", document => { delete document.map.oceanCurrents.metadata.count; }, document => document.map.oceanCurrents.metadata.count],
  ["地图名称", document => { delete document.map.metadata.name; }, document => document.map.metadata.name],
  ["地图选项名称", document => { delete document.map.options.mapName; }, document => document.map.options.mapName],
  ["外交关系统计", document => { delete document.map.diplomacy.metadata.relationCounts; }, document => document.map.diplomacy.metadata.relationCounts],
  ["外交镜像", document => { delete document.map.pack.diplomacy; }, document => document.map.pack.diplomacy],
  ["国家外交关系", document => { delete document.map.politics.states[1].diplomacy[2]; }, document => document.map.politics.states[1].diplomacy[2]],
  ["旧式显示设置", document => {
    document.options.display = {units: normalizeUnitPreferences({})};
    delete document.map.display;
  }, document => document.map.display?.units?.distanceUnit],
  ["地图种子选项", document => { delete document.map.options.seed; }, document => document.map.options.seed],
  ["地图宽度选项", document => { delete document.map.options.graphWidth; }, document => document.map.options.graphWidth],
  ["河流镜像", document => { delete document.map.pack.rivers; }, document => document.map.pack.rivers],
  ["重复锁", document => { document.map.regenerationLocks.entries = [{kind: "city", id: 0}, {kind: "city", id: 0}]; }, document => document.map.regenerationLocks.entries[0]?.id],
  ["字符串锁编号", document => { document.map.regenerationLocks.entries = [{kind: "city", id: "0"}]; }, document => document.map.regenerationLocks.entries[0]?.id],
  ["城镇所属城市", document => { delete document.map.pack.burgs[burgIndex].cityId; }, document => document.map.pack.burgs[burgIndex].cityId],
  ["城镇格点", document => { delete document.map.pack.burgs[burgIndex].cell; }, document => document.map.pack.burgs[burgIndex].cell],
  ["城镇横坐标", document => { delete document.map.pack.burgs[burgIndex].x; }, document => document.map.pack.burgs[burgIndex].x],
  ["城镇纵坐标", document => { delete document.map.pack.burgs[burgIndex].y; }, document => document.map.pack.burgs[burgIndex].y],
  ["城镇身份编号", document => { delete document.map.pack.burgs[burgIndex].i; }, document => document.map.pack.burgs[burgIndex].i]
]) {
  const source = structuredClone(playableCurrent);
  remove(source);
  const notices = [];
  const upgraded = migrateMapDocument(source, {onUpgrade: info => notices.push(info)});
  assert.ok(read(upgraded) !== undefined, `同版旧档缺${label}未被整理`);
  assert.equal(getMapDocumentUpgradeInfo(upgraded)?.needed, true, `同版旧档缺${label}未标记升级`);
  assert.deepEqual(notices, [getMapDocumentUpgradeInfo(upgraded)], `同版旧档缺${label}未提示整理或重复提示`);
}
assert.equal(currentRoundtrip.metadata.documentId, current.metadata.documentId, "v2 往返没有保留 document identity");
assert.deepEqual([...currentRoundtrip.map.grid.cells.h], [20, 21], "v2 stringify / parse 应保持 typed array");

assert.throws(() => migrateMapDocument({type: MAP_DOCUMENT_TYPE, version: 5, map: {}}), /暂不支持的地图格式版本：5/);
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
assert.equal(getMapDocumentUpgradeInfo(normalizedIncompleteV2)?.needed, true, "同版标签回填缺少升级提示来源");
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
