#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {apiCall} from "../app/webgl-generator/src/runtime/api-result.js";
import {
  BROWSER_MAP_STORAGE_TYPE,
  createBrowserMapStorageEnvelope,
  decodeBrowserMapStorageImportPayload,
  decodeBrowserMapStoragePayload,
  encodeBrowserMapStoragePayload,
  parseBrowserMapStorageEnvelope
} from "../app/webgl-generator/src/runtime/browser-map-storage.js";
import {
  MAP_DOCUMENT_VERSION,
  MAP_SCHEMA_VERSION,
  createMapDocument,
  parseMapDocument,
  stringifyMapDocument
} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {createRuntimeOperationManager} from "../app/webgl-generator/src/runtime/runtime-operation.js";

const fixtureText = await readFile(new URL("./fixtures/webgl-map-v1-minimal.json", import.meta.url), "utf8");
const oldImported = parseMapDocument(fixtureText);
const oldSummary = compatibilitySummary(oldImported);
const oldExported = createMapDocument(oldImported.map, oldImported.options);
const oldReimported = parseMapDocument(stringifyMapDocument(oldExported));
assert.equal(oldImported.version, MAP_DOCUMENT_VERSION);
assert.equal(oldImported.map.metadata.schemaVersion, MAP_SCHEMA_VERSION);
assert.deepEqual(oldImported.map.regenerationLocks, {version: 1, entries: []});
assert.deepEqual(compatibilitySummary(oldReimported), oldSummary);

const currentRuntimeMap = {
  metadata: {seed: "api-data-current", checksum: "compat-v2"},
  options: {seed: "api-data-current", visualTheme: "night"},
  grid: {cells: {h: new Uint8Array([8, 20, 44, 81])}},
  notes: {notes: [{id: "note-1", body: "当前版本备注"}]},
  measurements: {items: [{id: "measurement-2", name: "当前量尺", points: [[0, 0], [1, 1]]}]},
  labels: {hidden: {state: [2], city: [3]}, custom: []},
  visualTheme: {preset: "night", overrides: {}}
};
const currentDocument = createMapDocument(currentRuntimeMap, currentRuntimeMap.options);
assert.equal(currentRuntimeMap.metadata.schemaVersion, undefined);
assert.equal(currentRuntimeMap.notes.metadata, undefined);
const currentImported = parseMapDocument(stringifyMapDocument(currentDocument));
currentImported.map.pack = {...(currentImported.map.pack || {}), features: [null, {i: 1, id: 1, type: "island", land: true}]};
currentImported.map.regenerationLocks = {version: 1, entries: [{kind: "feature", id: 1}]};
const currentReexported = createMapDocument(currentImported.map, currentImported.options);
const currentReimported = parseMapDocument(stringifyMapDocument(currentReexported));
assert.deepEqual(compatibilitySummary(currentReimported), compatibilitySummary(currentImported));
assert.deepEqual(currentReimported.map.regenerationLocks, {version: 1, entries: [{kind: "feature", id: 1}]});

const damagedLockDocument = JSON.parse(stringifyMapDocument(currentDocument));
damagedLockDocument.map.regenerationLocks = {version: 9, entries: [{kind: "feature", id: 999}, {kind: "unknown", id: 1}]};
const repairedLocks = parseMapDocument(JSON.stringify(damagedLockDocument));
assert.deepEqual(repairedLocks.map.regenerationLocks, {version: 1, entries: []});
assert.equal(repairedLocks.map.metadata.compatibility?.regenerationLocks?.removed, 2);

const fakeDocument = {defaultView: {}};
const plainEnvelope = await encodeBrowserMapStoragePayload(fakeDocument, stringifyMapDocument(currentDocument), currentDocument.map);
assert.equal(plainEnvelope.type, BROWSER_MAP_STORAGE_TYPE);
assert.equal(plainEnvelope.encoding, "plain");
const envelopeText = JSON.stringify(plainEnvelope);
assert.equal(await decodeBrowserMapStoragePayload(fakeDocument, envelopeText), stringifyMapDocument(currentDocument));
assert.equal(await decodeBrowserMapStoragePayload(fakeDocument, fixtureText), fixtureText);
assert.equal(await decodeBrowserMapStorageImportPayload(fakeDocument, envelopeText), stringifyMapDocument(currentDocument));
assert.equal(await decodeBrowserMapStorageImportPayload(fakeDocument, plainEnvelope), stringifyMapDocument(currentDocument));
assert.equal(await decodeBrowserMapStorageImportPayload(fakeDocument, fixtureText), fixtureText);
assert.equal(parseBrowserMapStorageEnvelope(envelopeText).legacy, false);
assert.equal(parseBrowserMapStorageEnvelope(fixtureText).legacy, true);
assert.throws(() => parseBrowserMapStorageEnvelope(JSON.stringify({...plainEnvelope, version: 99})), /暂不支持的浏览器存档版本：99/);
assert.throws(() => parseBrowserMapStorageEnvelope(JSON.stringify({...plainEnvelope, encoding: "brotli"})), /暂不支持的浏览器存档编码：brotli/);
const explicitEnvelope = createBrowserMapStorageEnvelope("{}", currentDocument.map, {encoding: "plain", data: "{}", bytes: 2});
assert.equal(explicitEnvelope.metadata.checksum, "compat-v2");
let compressedEnvelopeVerified = false;
if (["CompressionStream", "DecompressionStream", "Response", "Blob", "btoa", "atob"].every(name => typeof globalThis[name] === "function")) {
  const compressedDocument = {defaultView: globalThis};
  const compressedEnvelope = await encodeBrowserMapStoragePayload(compressedDocument, fixtureText, oldImported.map);
  assert.equal(compressedEnvelope.encoding, "gzip-base64");
  assert.equal(await decodeBrowserMapStoragePayload(compressedDocument, JSON.stringify(compressedEnvelope)), fixtureText);
  assert.equal(await decodeBrowserMapStorageImportPayload(compressedDocument, JSON.stringify(compressedEnvelope)), fixtureText);
  compressedEnvelopeVerified = true;
}

let activeMap = currentImported.map;
const loading = [];
const manager = createRuntimeOperationManager({setLoading: visible => loading.push(visible)});
const badImport = await apiCall(() => manager.run("data.importMap", context => {
  context.report("parse", {message: "读取地图文档"});
  parseMapDocument("{bad json");
  activeMap = null;
}, {
  snapshot: () => activeMap,
  rollback: snapshot => {
    activeMap = snapshot;
  }
}));
assert.equal(badImport.ok, false);
assert.equal(badImport.error.code, "operation_invalid_input");
assert.equal(badImport.error.stage, "parse");
assert.ok(badImport.error.suggestion);
assert.strictEqual(activeMap, currentImported.map);
assert.equal(loading.at(-1), false);

const [appSource, apiSource, diagnosticSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/console-api.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/map-import-diagnostics.js", import.meta.url), "utf8")
]);
for (const name of ["saveBrowserMap", "restoreBrowserMap", "importHeightmap", "exportImportDiagnostic"]) {
  assert.match(apiSource, new RegExp(`${name}:`));
  assert.match(appSource, new RegExp(`${name}:`));
}
assert.match(appSource, /onSaveBrowserStorage:[\s\S]*runtimeActions\.data\.saveBrowserMap/);
assert.match(appSource, /onImportHeightmapImage:[\s\S]*runtimeActions\.data\.importHeightmap/);
assert.match(appSource, /onExportMapImportDiagnostic:[\s\S]*runtimeActions\.data\.exportImportDiagnostic/);
assert.match(appSource, /restoreBrowserMap: \(options = \{\}\) => runMapReplace\("data\.restoreBrowserMap"/);
assert.match(appSource, /importHeightmap: \(payload, options = \{\}\) => runMapReplace\("data\.importHeightmap"/);
assert.match(appSource, /importMap: \(document, options = \{\}\) => runMapReplace\("data\.importMap"/);
assert.match(appSource, /MAP_FILE_IO_WORKER_TASK_TYPE/);
assert.match(appSource, /exportMapArchiveViaWorker\(state, documentRef/);
assert.match(appSource, /parseMapDocumentViaWorker\(state, documentRef/);
assert.match(appSource, /decodeBrowserMapStorageImportPayload\(documentRef, unwrapped\)/, "主线程 canonical 解析没有复用浏览器存档解包入口");
assert.match(appSource, /shouldUseMapImportWorkerCanonicalHandoff\(canonicalInput\)/, "非二进制旧档没有切换到可分片 canonical handoff");
assert.match(appSource, /materializeMapAdoptionHandoff\(output\.handoff/, "非二进制旧档没有复用分片 handoff 解码");
assert.match(appSource, /encodeBrowserMapStorageBytesPayload\(documentRef, exported\.data/);
assert.doesNotMatch(appSource, /const exported = exportAllMapData\(state, documentRef, \{download: false, includeText: true\}\)/);
assert.match(appSource, /restoreBrowserMap\(\{confirm: true, startup: true, toast: false\}\)/, "启动恢复没有使用非破坏性参数");
assert.doesNotMatch(appSource, /storage\.removeItem\(BROWSER_MAP_STORAGE_KEY\)/, "恢复失败仍会删除浏览器原始存档");
assert.match(appSource, /浏览器地图恢复失败，原存档已保留/, "恢复失败没有明确说明原存档仍保留");
assert.doesNotMatch(appSource, /function createPersistableMapDocument/);
assert.doesNotMatch(appSource, /lastMapImportDiagnostic:\s*state\.lastMapImportDiagnostic/);
assert.match(diagnosticSource, /code, stage, suggestion/);

console.log(JSON.stringify({
  ok: true,
  oldSample: {sourceVersion: 1, targetVersion: oldReimported.version, summary: oldSummary},
  currentSample: {version: currentReimported.version, summary: compatibilitySummary(currentReimported)},
  browserStorage: {legacy: true, envelope: true, encoding: plainEnvelope.encoding, compressedEnvelopeVerified},
  failedRestorePreservesRawStorage: true,
  badInput: {code: badImport.error.code, stage: badImport.error.stage, loadingClosed: loading.at(-1) === false},
  publicDataMethodsAdded: 4
}, null, 2));

function compatibilitySummary(document) {
  const map = document.map;
  return {
    version: document.version,
    schemaVersion: map.metadata?.schemaVersion,
    seed: map.metadata?.seed || map.options?.seed || "",
    checksum: map.metadata?.checksum || map.summary?.checksum || "",
    heights: Array.from(map.grid?.cells?.h || []),
    notes: (map.notes?.notes || []).map(note => ({id: note.id, body: note.body || ""})),
    measurements: (map.measurements?.items || []).map(item => ({id: item.id, name: item.name || "", points: item.points?.length || 0})),
    hiddenLabels: {
      state: [...(map.labels?.hidden?.state || [])],
      city: [...(map.labels?.hidden?.city || [])]
    },
    visualTheme: map.visualTheme?.preset || ""
    ,
    regenerationLocks: (map.regenerationLocks?.entries || []).map(entry => ({...entry}))
  };
}
