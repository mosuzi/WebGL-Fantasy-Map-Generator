#!/usr/bin/env node
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {API_METHODS, CONFIRM_REQUIRED_METHODS} from "../app/webgl-generator/src/runtime/api-contract.js";
import {buildApiMethodDescriptionRegistry} from "../app/webgl-generator/src/runtime/api-schema-registry.js";
import {
  assertExistingRuleInspection,
  EXISTING_RULE_ACTION,
  inspectExistingRuleAction
} from "../app/webgl-generator/src/runtime/existing-rule-inspectors.js";
import {MapRevisionTracker} from "../app/webgl-generator/src/runtime/map-revision.js";

const map = generatePlaceholderMap({
  seed: "object-creation-regression",
  cellsTarget: 3000,
  heightmapTemplate: "continents"
});
const revision = new MapRevisionTracker({identityFactory: () => "existing-rule-inspectors-map"});
revision.replaceMap();
const before = mapDigest(map);

const heightCell = 0;
const currentHeight = Number(map.grid.cells.h[heightCell]);
const heightAfter = currentHeight === 100 ? 99 : currentHeight + 1;
const landGridCell = map.grid.cells.i.find(cell => Number(map.grid.cells.h[cell]) >= 20);
const currentBiome = Number(map.grid.cells.biome[landGridCell]);
const targetBiome = map.climate.biomes.find(biome => Number(biome.id) > 0 && Number(biome.id) !== currentBiome)?.id;
assert.ok(Number.isInteger(Number(targetBiome)), "固定地图找不到可替换的陆地生物群系");

const riverCreateInput = findAllowedInput(EXISTING_RULE_ACTION.RIVER_CREATE, Array.from(map.pack.cells.i)
  .filter(cell => Number(map.pack.cells.h[cell]) >= 30 && !Number(map.pack.cells.r[cell]))
  .sort((a, b) => Number(map.pack.cells.h[b]) - Number(map.pack.cells.h[a]))
  .map(sourcePackCell => ({options: {sourcePackCell}})));
const lakeCreateInput = findAllowedInput(EXISTING_RULE_ACTION.LAKE_EXCAVATE, Array.from(map.pack.cells.i)
  .map(packCell => ({options: {packCell, radius: 0, waterHeight: 19}})));
const occupiedZoneCells = new Set((map.zones?.zones || map.pack?.zones || []).flatMap(zone => zone?.cells || []).map(Number));
const freeZoneCell = map.pack.cells.i.find(cell => !occupiedZoneCells.has(Number(cell)));
assert.ok(Number.isInteger(freeZoneCell), "固定地图找不到可用地区 cell");

const cases = [
  [EXISTING_RULE_ACTION.HEIGHT_EDIT_REGION, {changes: [{gridCell: heightCell, after: heightAfter}]}],
  [EXISTING_RULE_ACTION.RIVER_CREATE, riverCreateInput],
  [EXISTING_RULE_ACTION.RIVER_DELETE, {id: objectId(map.rivers.rivers.find(Boolean))}],
  [EXISTING_RULE_ACTION.LAKE_EXCAVATE, lakeCreateInput],
  [EXISTING_RULE_ACTION.LAKE_DELETE, {id: objectId(map.pack.features.find(feature => feature?.type === "lake"))}],
  [EXISTING_RULE_ACTION.BIOME_ASSIGN, {biomeId: Number(targetBiome), gridCellIds: [Number(landGridCell)], options: {scope: "land"}}],
  [EXISTING_RULE_ACTION.STATE_DELETE, {id: objectId(map.politics.states.find(item => rawObjectId(item) > 0))}],
  [EXISTING_RULE_ACTION.PROVINCE_DELETE, {id: objectId(map.politics.provinces.find(item => rawObjectId(item) > 0))}],
  [EXISTING_RULE_ACTION.CITY_DELETE, {id: objectId(map.settlements.cities.find(Boolean))}],
  [EXISTING_RULE_ACTION.ROUTE_DELETE, {id: objectId(map.settlements.routes.find(Boolean))}],
  [EXISTING_RULE_ACTION.ZONE_MANAGE, {operation: "create", options: {packCells: [Number(freeZoneCell)]}}],
  [EXISTING_RULE_ACTION.ZONE_MANAGE, {operation: "delete", id: objectId((map.zones?.zones || map.pack?.zones || []).find(Boolean))}]
];

const inspections = cases.map(([actionId, input]) => {
  const inspection = inspectExistingRuleAction(map, revision, actionId, input);
  assert.equal(inspection.allowed, true, `${actionId} 固定样本预检未通过：${inspection.code}`);
  assert.equal(inspection.code, "ok");
  assert.ok(inspection.summary);
  assert.ok(inspection.inspectionToken);
  assert.deepEqual(inspection.expectedRevision, {mapIdentity: "existing-rule-inspectors-map", mapRevision: 0});
  assertExistingRuleInspection(revision, actionId, input, inspection);
  return inspection;
});

assert.equal(mapDigest(map), before, "规则预检改变了地图快照");
assert.throws(
  () => assertExistingRuleInspection(revision, cases[1][0], cases[1][1], inspections[0]),
  error => error?.code === "inspection-action-mismatch",
  "跨动作预检令牌没有被拒绝"
);
assert.throws(
  () => assertExistingRuleInspection(revision, cases[0][0], {changes: [{gridCell: heightCell, after: heightAfter + 1}]}, inspections[0]),
  error => error?.code === "inspection-input-mismatch",
  "输入变化没有使预检令牌失效"
);
assert.throws(
  () => assertExistingRuleInspection(revision, cases[0][0], cases[0][1], {
    inspectionToken: "",
    expectedRevision: inspections[0].expectedRevision
  }),
  error => error?.code === "inspection-required",
  "显式空令牌被误当成旧调用绕过"
);
revision.advance();
assert.throws(
  () => assertExistingRuleInspection(revision, cases[0][0], cases[0][1], inspections[0]),
  error => error?.code === "inspection-stale",
  "地图 revision 变化没有使预检令牌失效"
);
assert.deepEqual(
  assertExistingRuleInspection(revision, cases[0][0], cases[0][1]),
  {valid: true, code: "legacy-call", legacy: true},
  "旧 API 调用兼容路径失效"
);

const syntheticMetadata = Object.fromEntries(Object.entries(API_METHODS).map(([namespace, methods]) => [
  namespace,
  Object.fromEntries(methods.map(method => [method, {
    requiresConfirm: CONFIRM_REQUIRED_METHODS.includes(`${namespace}.${method}`)
  }]))
]));
const descriptions = buildApiMethodDescriptionRegistry(API_METHODS, syntheticMetadata);
const inspectorCodes = {
  "edit.height.inspectChanges": "height-changes-empty",
  "edit.biomes.inspectAssignment": "invalid-biome",
  "edit.rivers.inspectCreate": "invalid-source",
  "edit.rivers.inspectDelete": "delete-not-found",
  "edit.lakes.inspectCreate": "invalid-cell",
  "edit.lakes.inspectDelete": "delete-not-found",
  "edit.states.inspectDelete": "delete-not-found",
  "edit.provinces.inspectDelete": "delete-not-found",
  "edit.cities.inspectDelete": "delete-not-found",
  "edit.routes.inspectDelete": "delete-not-found",
  "edit.zones.inspectCreate": "occupied-cell",
  "edit.zones.inspectDelete": "delete-not-found"
};
for (const [method, actionCode] of Object.entries(inspectorCodes)) {
  const description = descriptions[method];
  const required = description?.resultSchema?.properties?.data?.required || [];
  for (const field of [
    "allowed", "code", "summary", "normalizedInput", "affected", "requiresConfirm",
    "expectedRevision", "inspectionToken", "inspectorSchemaVersion"
  ]) {
    assert.ok(required.includes(field), `${method} 的 info.describe 缺少 ${field}`);
  }
  assert.ok(description.businessCodes.includes(actionCode), `${method} 缺少 action-specific code ${actionCode}`);
  assert.ok(description.businessCodes.includes("invalid-argument"), `${method} 缺少规则规范化错误码 invalid-argument`);
}
assert.ok(descriptions["edit.rivers.inspectCreate"].businessCodes.includes("path-limit"), "河流创建预检缺少 path-limit");
assert.ok(descriptions["edit.rivers.create"].businessCodes.includes("path-limit"), "河流创建执行缺少 path-limit");

for (const method of [
  "edit.height.applyChanges", "edit.biomes.assignCells", "edit.rivers.create", "edit.rivers.delete",
  "edit.lakes.create", "edit.lakes.delete", "edit.states.delete", "edit.provinces.delete",
  "edit.cities.delete", "edit.routes.delete", "edit.zones.create", "edit.zones.delete"
]) {
  const options = descriptions[method]?.inputSchema?.prefixItems?.find(item => item.title === "options");
  assert.ok(options?.properties?.inspectionToken, `${method} 没有描述 inspectionToken`);
  assert.ok(options?.properties?.expectedRevision, `${method} 没有描述 expectedRevision`);
}

const appSource = readFileSync(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8");
const consoleApiSource = readFileSync(new URL("../app/webgl-generator/src/runtime/console-api.js", import.meta.url), "utf8");
for (const method of Object.keys(inspectorCodes)) {
  assert.ok(consoleApiSource.includes(`"${method}"`), `${method} 没有穿过公开 console API`);
}
for (const [functionName, actionId] of [
  ["applyHeightChangesViaApi", "HEIGHT_EDIT_REGION"],
  ["assignBiomeCellsViaApi", "BIOME_ASSIGN"],
  ["createRiverViaApi", "RIVER_CREATE"],
  ["deleteRiverViaApi", "RIVER_DELETE"],
  ["createLakeViaApi", "LAKE_EXCAVATE"],
  ["deleteLakeViaApi", "LAKE_DELETE"],
  ["deleteStateViaApi", "STATE_DELETE"],
  ["deleteProvinceViaApi", "PROVINCE_DELETE"],
  ["deleteCityViaApi", "CITY_DELETE"],
  ["deleteRouteViaApi", "ROUTE_DELETE"],
  ["createZoneViaApi", "ZONE_MANAGE"],
  ["deleteZoneViaApi", "ZONE_MANAGE"]
]) {
  const source = functionSource(appSource, functionName);
  assert.match(source, new RegExp(`assertExistingRuleInspection\\(state\\.mapRevision, EXISTING_RULE_ACTION\\.${actionId}`, "u"), `${functionName} 没有消费对应预检`);
}

console.log(JSON.stringify({
  ok: true,
  actions: cases.length,
  uniqueActionFamilies: new Set(cases.map(([actionId]) => actionId)).size,
  publicInspectors: Object.keys(inspectorCodes).length,
  describedExecutors: 12,
  readonly: mapDigest(map) === before,
  staleRejected: true
}, null, 2));

function findAllowedInput(actionId, candidates) {
  for (const input of candidates) {
    const inspection = inspectExistingRuleAction(map, revision, actionId, input);
    if (inspection.allowed) return input;
  }
  throw new Error(`${actionId} 固定地图找不到合法样本`);
}

function objectId(object) {
  const id = rawObjectId(object);
  assert.ok(Number.isInteger(id) && id >= 0, "固定地图对象缺少有效 ID");
  return id;
}

function rawObjectId(object) {
  return Number(object?.id ?? object?.i);
}

function mapDigest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `找不到 ${name}`);
  const next = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, next < 0 ? source.length : next);
}
