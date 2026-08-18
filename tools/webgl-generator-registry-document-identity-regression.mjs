#!/usr/bin/env node
import assert from "node:assert/strict";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {resolveCanonicalMapWriteDescriptor} from "../app/webgl-generator/src/runtime/canonical-map-field-registry.js";
import {createMapDocument, migrateMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {
  computeAppliedMapReplicaPatchTargetChecksum,
  computeCanonicalMapReplicaChecksum,
  computeMapReplicaPatchTargetChecksum
} from "../app/webgl-generator/src/runtime/map-replica-checksum.js";
import {applyMapReplicaPatch, createMapReplicaPatch} from "../app/webgl-generator/src/runtime/map-replica-journal.js";
import {decodeWebfmgV3Document, encodeWebfmgV3Document, inspectWebfmgV3Container} from "../app/webgl-generator/src/runtime/webfmg-v3-container.js";

const source = generatePlaceholderMap({seed: "registry-document-identity-a", cellsTarget: 1000, heightmapTemplate: "continents"});
const normalized = createMapDocument(source, source.options).map;
const fieldValues = {
  notes: {...normalized.notes, notes: [{id: "note-1", name: "港口", body: "登记正文"}]},
  measurements: {...normalized.measurements, items: [{id: "measurement-7", kind: "distance", points: [[1, 2], [3, 4]]}]},
  labels: {...normalized.labels, custom: [{id: "label-1", text: "关隘", x: 10, y: 20}]},
  visualTheme: {...normalized.visualTheme, preset: "night", overrides: {water: "#123456"}},
  display: {units: {distanceUnit: "km"}, grid: {visible: true}}
};
const document = createMapDocument({...normalized, ...fieldValues}, normalized.options);

assert.equal(document.metadata.documentId, document.map.metadata.documentId);
assert.equal(document.metadata.documentIdentityVersion, 1);
for (const path of Object.keys(fieldValues)) assert.ok(resolveCanonicalMapWriteDescriptor(path), `${path} 未进入 canonical registry`);

const raw = encodeWebfmgV3Document(document);
const decoded = migrateMapDocument(decodeWebfmgV3Document(raw));
for (const path of Object.keys(fieldValues)) assert.deepEqual(decoded.map[path], document.map[path], `${path} 的 webfmg v3 往返漂移`);
assert.equal(decoded.metadata.documentId, document.metadata.documentId, "webfmg v3 往返没有保持普通 document identity");
assert.equal(inspectWebfmgV3Container(raw).sections, 29, "五个字段齐备时必须写出全部 29 个顶层分区");

const baseMap = structuredClone(document.map);
const targetValues = {
  notes: {...baseMap.notes, notes: [...baseMap.notes.notes, {id: "note-2", name: "山口", body: "第二条"}]},
  measurements: {...baseMap.measurements, items: [...baseMap.measurements.items, {id: "measurement-8", kind: "area", points: [[5, 6], [7, 8], [9, 10]]}]},
  labels: {...baseMap.labels, hidden: {...baseMap.labels.hidden, city: [1]}},
  visualTheme: {...baseMap.visualTheme, preset: "ancient"},
  display: {...baseMap.display, grid: {visible: false}}
};
const writes = Object.entries(targetValues).map(([path, value]) => ({path, mode: "replace", value}));
const baseChecksum = await computeCanonicalMapReplicaChecksum(baseMap, {revision: 0});
const targetChecksum = await computeMapReplicaPatchTargetChecksum(baseChecksum, writes);
const patch = createMapReplicaPatch({
  mapIdentity: "registry-document-map",
  patchId: "registry-five-fields",
  baseRevision: 0,
  targetRevision: 1,
  baseChecksum,
  targetChecksum,
  writes
});
const patchedMap = applyMapReplicaPatch(structuredClone(baseMap), patch);
assert.equal(await computeAppliedMapReplicaPatchTargetChecksum(patchedMap, patch), targetChecksum, "五字段 applied patch checksum 不一致");
assert.notEqual(await computeCanonicalMapReplicaChecksum(patchedMap, {revision: 1}), baseChecksum, "五字段修改没有改变 full canonical checksum");
const cachedPresentationMap = structuredClone(document.map);
const beforePresentationChecksum = await computeCanonicalMapReplicaChecksum(cachedPresentationMap, {revision: 7});
cachedPresentationMap.visualTheme = {...cachedPresentationMap.visualTheme, preset: "default"};
cachedPresentationMap.options = {...cachedPresentationMap.options, visualTheme: "default"};
const afterPresentationChecksum = await computeCanonicalMapReplicaChecksum(cachedPresentationMap, {revision: 7});
const freshPresentationChecksum = await computeCanonicalMapReplicaChecksum(structuredClone(cachedPresentationMap), {revision: 7});
assert.notEqual(afterPresentationChecksum, beforePresentationChecksum, "同 canonical revision 的 persisted presentation 修改没有失效 checksum cache");
assert.equal(afterPresentationChecksum, freshPresentationChecksum, "persisted presentation 修改后的缓存 checksum 与 fresh map 不一致");
assert.throws(
  () => createMapReplicaPatch({mapIdentity: "registry-document-map", patchId: "unknown", baseRevision: 1, targetRevision: 2, writes: [{path: "unknown.value", value: 1}]}),
  error => error?.code === "map_replica_path_unregistered",
  "registry 之外的 patch path 必须拒绝"
);

const repeated = createMapDocument(source, source.options);
assert.equal(repeated.metadata.documentId, createMapDocument(source, source.options).metadata.documentId, "旧 map 重复导出的派生 identity 不稳定");
const editedSource = structuredClone(source);
editedSource.metadata.checksum = "after-edit-checksum";
editedSource.summary = {...editedSource.summary, checksum: "after-edit-checksum"};
assert.equal(createMapDocument(editedSource, editedSource.options).metadata.documentId, repeated.metadata.documentId, "同一旧 map 编辑后不得改变派生 identity");
const refinedSource = structuredClone(source);
refinedSource.grid.metadata = {...(refinedSource.grid.metadata || {}), actualCells: Number(refinedSource.grid.metadata?.actualCells || 0) + 1};
refinedSource.pack.metadata = {...(refinedSource.pack.metadata || {}), cells: Number(refinedSource.pack.metadata?.cells || 0) + 1};
assert.equal(createMapDocument(refinedSource, refinedSource.options).metadata.documentId, repeated.metadata.documentId, "同一旧 map 拓扑细分后不得改变派生 identity");
const different = createMapDocument(generatePlaceholderMap({seed: "registry-document-identity-b", cellsTarget: 1000}), {});
assert.notEqual(different.metadata.documentId, repeated.metadata.documentId, "不同旧 map 不得派生相同 identity");
const custom = createMapDocument({...source, metadata: {...source.metadata, documentId: "custom-document:42"}}, source.options);
assert.equal(custom.metadata.documentId, "custom-document:42", "已有普通 document identity 没有保留");
const invalidVersion = structuredClone(custom);
invalidVersion.metadata.documentIdentityVersion = 2;
assert.throws(
  () => migrateMapDocument(invalidVersion),
  error => error?.code === "persisted_document_identity_version_invalid",
  "未知 document identity 版本必须拒绝"
);
const invalidIdentity = structuredClone(custom);
invalidIdentity.metadata.documentId = " invalid identity ";
assert.throws(
  () => migrateMapDocument(invalidIdentity),
  error => error?.code === "persisted_document_identity_invalid",
  "显式非法 document identity 必须拒绝"
);
assert.throws(
  () => createMapDocument({...source, metadata: {...source.metadata, documentId: " invalid identity "}}, source.options),
  error => error?.code === "persisted_document_identity_invalid",
  "直接导出必须拒绝显式非法 document identity"
);
assert.throws(
  () => createMapDocument({...source, metadata: {...source.metadata, documentIdentityVersion: 2}}, source.options),
  error => error?.code === "persisted_document_identity_version_invalid",
  "直接导出必须拒绝没有 id 的未知 identity version"
);

console.log(JSON.stringify({
  ok: true,
  registryFields: Object.keys(fieldValues),
  webfmgSections: 29,
  documentIdentityVersion: document.metadata.documentIdentityVersion,
  patchChecksumValidated: true,
  presentationCacheInvalidationValidated: true,
  unknownPatchPathRejected: true
}, null, 2));
