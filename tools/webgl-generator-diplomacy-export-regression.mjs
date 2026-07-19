#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {setDiplomacyRelation} from "../app/webgl-generator/src/generator/diplomacy.js";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {
  createCompressedMapDocumentBlob,
  createMapDocument,
  createMapFeatureGeoJson,
  createMapGeoJson,
  parseMapDocument,
  parseMapDocumentPayload,
  stringifyMapDocument
} from "../app/webgl-generator/src/runtime/map-file-io.js";

const map = generatePlaceholderMap({seed: "diplomacy-export-contract", cellsTarget: 3000, heightmapTemplate: "continents"});
const activeStateCount = map.politics.states.filter(state => state?.i && !state.removed).length;
const stateIds = map.politics.states.filter(state => state?.i && !state.removed).slice(0, 3).map(state => state.i);
assert.equal(stateIds.length, 3, "外交导出夹具缺少三个国家");
const [subjectId, enemyId, vassalId] = stateIds;

setDiplomacyRelation(map.pack, subjectId, enemyId, "Friendly", {record: false});
assert.equal(setDiplomacyRelation(map.pack, subjectId, enemyId, "Enemy", {record: true, reason: "导出战争夹具"}), true);
assert.equal(setDiplomacyRelation(map.pack, subjectId, vassalId, "Vassal", {record: true, reason: "导出附庸夹具"}), true);
map.diplomacy = map.pack.diplomacy;
map.diplomacy.metadata.auditMarker = "必须完整往返";

const expected = diplomacyDigest(map, stateIds);
assert.ok(expected.subjectCampaigns.length > 0, "战争关系没有形成 campaign 夹具");
assert.ok(expected.chronicle.length >= 2, "外交变更没有形成历史夹具");

const document = createMapDocument(map, map.options);
const jsonText = stringifyMapDocument(document);
const parsedJson = parseMapDocument(jsonText);
assert.deepEqual(diplomacyDigest(parsedJson.map, stateIds), expected, "完整 JSON 没有精确恢复外交关系、战争或历史");

const documentRef = {defaultView: globalThis};
const compressed = await createCompressedMapDocumentBlob(documentRef, document);
const base64 = Buffer.from(await compressed.blob.arrayBuffer()).toString("base64");
const parsedGzip = await parseMapDocumentPayload(documentRef, {encoding: "gzip-base64", data: base64});
assert.deepEqual(diplomacyDigest(parsedGzip.map, stateIds), expected, "gzip 完整地图没有精确恢复外交关系、战争或历史");

const missingDiplomacy = structuredClone(document);
delete missingDiplomacy.map.diplomacy;
delete missingDiplomacy.map.pack.diplomacy;
for (const store of [missingDiplomacy.map.politics.states, missingDiplomacy.map.pack.states]) {
  for (const state of store || []) {
    if (!state) continue;
    delete state.diplomacy;
    delete state.diplomacySummary;
    delete state.campaigns;
  }
}
const backfilled = parseMapDocument(JSON.stringify(missingDiplomacy)).map;
assert.ok(Array.isArray(backfilled.diplomacy.chronicle));
assert.ok(backfilled.diplomacy.relations.Unknown);
assert.equal(backfilled.pack.states[subjectId].diplomacy[enemyId], "Unknown");
assert.equal(backfilled.politics.states[enemyId].diplomacy[subjectId], "Unknown");
assert.deepEqual(backfilled.pack.states[subjectId].campaigns, []);
assert.equal(backfilled.diplomacy.metadata.states, activeStateCount);

const oldV1 = JSON.parse(await readFile(new URL("./fixtures/webgl-map-v1-minimal.json", import.meta.url), "utf8"));
const migratedV1 = parseMapDocument(JSON.stringify(oldV1)).map;
assert.ok(migratedV1.diplomacy && Array.isArray(migratedV1.diplomacy.chronicle), "旧 v1 没有安全回填外交存储");
for (const state of migratedV1.pack?.states || []) {
  if (!state?.i || state.removed) continue;
  assert.ok(Array.isArray(state.diplomacy), `旧 v1 国家 #${state.i} 缺少外交数组`);
  assert.ok(Array.isArray(state.campaigns), `旧 v1 国家 #${state.i} 缺少战争数组`);
}

const cellGeoJson = createMapGeoJson(map);
const featureGeoJson = createMapFeatureGeoJson(map, {layers: {state: true, province: true, city: true}});
assert.equal(Object.hasOwn(cellGeoJson.properties, "diplomacy"), false, "普通 GeoJSON 不应硬塞外交矩阵");
assert.equal(Object.hasOwn(featureGeoJson.properties, "diplomacy"), false, "要素 GeoJSON 不应硬塞外交矩阵");
assert.ok(cellGeoJson.features.every(feature => !Object.hasOwn(feature.properties || {}, "diplomacy")));
assert.ok(featureGeoJson.features.every(feature => !Object.hasOwn(feature.properties || {}, "diplomacy")));

const [controlSource, diplomacyPanelSource, consoleApiSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/ControlPanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/ui/vue/components/DiplomacyPanel.vue", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/console-api.js", import.meta.url), "utf8")
]);
assert.match(controlSource, /完整地图数据（JSON）与压缩完整地图数据（gzip）包含外交关系、战争和历史/);
assert.match(controlSource, /GeoJSON 只含空间要素，图片只含当前画面/);
assert.match(diplomacyPanelSource, /CSV \/ JSON 是外交摘要/);
assert.match(consoleApiSource, /exportAllMapData[\s\S]*createMapDocument\(map/);
assert.match(consoleApiSource, /exportCompressedAllMapData[\s\S]*createMapDocument\(map/);

console.log(JSON.stringify({
  ok: true,
  states: stateIds,
  relations: expected.relations,
  campaigns: expected.subjectCampaigns.length,
  chronicle: expected.chronicle.length,
  jsonBytes: jsonText.length,
  gzipBytes: compressed.compressedBytes,
  oldV1Backfilled: Boolean(migratedV1.diplomacy),
  geoJsonDiplomacyFields: 0
}, null, 2));

function diplomacyDigest(sourceMap, ids) {
  const [subject, enemy, vassal] = ids;
  const states = sourceMap.pack.states;
  return {
    relations: {
      enemy: states[subject].diplomacy[enemy],
      enemyInverse: states[enemy].diplomacy[subject],
      vassal: states[subject].diplomacy[vassal],
      vassalInverse: states[vassal].diplomacy[subject]
    },
    subjectCampaigns: structuredClone(states[subject].campaigns || []),
    enemyCampaigns: structuredClone(states[enemy].campaigns || []),
    subjectSummary: structuredClone(states[subject].diplomacySummary || {}),
    chronicle: structuredClone(sourceMap.diplomacy?.chronicle || []),
    metadata: structuredClone(sourceMap.diplomacy?.metadata || {}),
    packChronicle: structuredClone(sourceMap.pack?.diplomacy?.chronicle || []),
    packMetadata: structuredClone(sourceMap.pack?.diplomacy?.metadata || {})
  };
}
