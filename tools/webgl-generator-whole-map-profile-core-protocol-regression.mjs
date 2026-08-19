import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {runGenerationWorkerTask} from "../app/webgl-generator/src/runtime/generation-worker-task.js";
import {createHeadlessWriteSession} from "../app/webgl-generator/src/runtime/headless-write-api.js";
import {materializeMapAdoptionHandoff} from "../app/webgl-generator/src/runtime/map-adoption-handoff.js";
import {stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {runMapFileIoWorkerTask} from "../app/webgl-generator/src/runtime/map-file-io-worker-task.js";
import {
  WHOLE_MAP_PROFILE_OWNERS,
  validateHeadlessWriteCommit,
  validateWholeMapAdoptionDocument,
  validateWholeMapAdoptionEnvelope,
  validateWholeMapExportResult,
  validateWholeMapProfileOwnerRegistry
} from "../app/webgl-generator/src/runtime/whole-map-profile-protocol.js";

const binding = Object.freeze({
  mapIdentity: "whole-map-profile-fixture",
  mapRevision: 3,
  topologyRevision: 2,
  generationToken: 7,
  lockFingerprint: "00000000",
  operationId: 19,
  operationName: "whole-map-profile-regression"
});

assert.equal(validateWholeMapProfileOwnerRegistry().length, 4);
const duplicateOwner = [...WHOLE_MAP_PROFILE_OWNERS, {...WHOLE_MAP_PROFILE_OWNERS[0]}];
assertProtocol(() => validateWholeMapProfileOwnerRegistry(duplicateOwner), "whole-map-profile-registry-invalid");
const duplicateResult = WHOLE_MAP_PROFILE_OWNERS.map((item, index) => index === 1
  ? {...item, task: WHOLE_MAP_PROFILE_OWNERS[0].task, resultKind: WHOLE_MAP_PROFILE_OWNERS[0].resultKind}
  : item);
assertProtocol(() => validateWholeMapProfileOwnerRegistry(duplicateResult), "whole-map-profile-result-owner-duplicate");

const generation = await runGenerationWorkerTask({
  options: {seed: "whole-map-generation", cellsTarget: 1000, heightmapTemplate: "continents"}
}, {binding, checkpoint() {}, adoptMap() {}});
validateWholeMapAdoptionEnvelope({profile: "generation-adoption", binding, output: generation});
const generatedDocument = await materializeMapAdoptionHandoff(generation.handoff);
const generationReceipt = validateWholeMapAdoptionDocument({profile: "generation-adoption", metadata: generation.metadata, document: generatedDocument});
assert.equal(generationReceipt.effect, "new-session");
assert.equal(generationReceipt.binding.documentId, generatedDocument.metadata.documentId);

const sourceMap = generatedDocument.map;
const sourceBeforeExport = stringifyMapDocument({map: sourceMap});
const exported = await runMapFileIoWorkerTask({operation: "export", map: sourceMap, encoding: "plain", resultType: "text"}, {binding, checkpoint() {}});
const exportReceipt = validateWholeMapExportResult({binding, output: exported, sourceMap});
assert.equal(exportReceipt.effect, "read-only");
assert.equal(exportReceipt.bytes, new TextEncoder().encode(exported.data).byteLength);
assert.equal(stringifyMapDocument({map: sourceMap}), sourceBeforeExport, "整图导出改写了 canonical map");

const imported = await runMapFileIoWorkerTask({operation: "import", input: exported.data}, {binding, checkpoint() {}, adoptMap() {}});
validateWholeMapAdoptionEnvelope({profile: "persistence-import", binding, output: imported});
const importedDocument = await materializeMapAdoptionHandoff(imported.handoff);
const importReceipt = validateWholeMapAdoptionDocument({profile: "persistence-import", metadata: imported.metadata, document: importedDocument});
assert.equal(importReceipt.checksum, exportReceipt.checksum);
assert.equal(importReceipt.binding.documentId, exportReceipt.binding.documentId);

const legacy = structuredClone(importedDocument);
legacy.version = 1;
delete legacy.metadata.documentId;
delete legacy.metadata.documentIdentityVersion;
delete legacy.map.metadata.documentId;
delete legacy.map.metadata.documentIdentityVersion;
const legacyImported = await runMapFileIoWorkerTask({operation: "import", input: stringifyMapDocument(legacy)}, {binding, checkpoint() {}, adoptMap() {}});
validateWholeMapAdoptionEnvelope({profile: "persistence-import", binding, output: legacyImported});
const legacyDocument = await materializeMapAdoptionHandoff(legacyImported.handoff);
validateWholeMapAdoptionDocument({profile: "persistence-import", metadata: legacyImported.metadata, document: legacyDocument});
assert.match(legacyDocument.metadata.documentId, /^fmg-doc-v1-/u);

const staleBinding = structuredClone(await generationEnvelopeFixture());
staleBinding.binding.mapRevision += 1;
assertProtocol(() => validateWholeMapAdoptionEnvelope({profile: "generation-adoption", binding, output: staleBinding}), "whole-map-profile-binding-stale");
const fullDocumentLeak = structuredClone(await generationEnvelopeFixture());
fullDocumentLeak.map = sourceMap;
assertProtocol(() => validateWholeMapAdoptionEnvelope({profile: "generation-adoption", binding, output: fullDocumentLeak}), "whole-map-adoption-full-document-leak");
const wrongEnvelopeChecksum = structuredClone(await generationEnvelopeFixture());
wrongEnvelopeChecksum.metadata.checksum = "wrong-checksum";
const wrongEnvelopeDocument = await materializeMapAdoptionHandoff(wrongEnvelopeChecksum.handoff);
assertProtocol(() => validateWholeMapAdoptionDocument({profile: "generation-adoption", metadata: wrongEnvelopeChecksum.metadata, document: wrongEnvelopeDocument}), "whole-map-adoption-document-mismatch");

const wrongExportBinding = structuredClone(exported);
wrongExportBinding.binding.generationToken += 1;
assertProtocol(() => validateWholeMapExportResult({binding, output: wrongExportBinding, sourceMap}), "whole-map-profile-binding-stale");
const wrongExportChecksum = structuredClone(exported);
wrongExportChecksum.metadata.checksum = "wrong-checksum";
assertProtocol(() => validateWholeMapExportResult({binding, output: wrongExportChecksum, sourceMap}), "whole-map-export-checksum-mismatch");
const wrongExportBytes = structuredClone(exported);
wrongExportBytes.bytes += 1;
assertProtocol(() => validateWholeMapExportResult({binding, output: wrongExportBytes, sourceMap}), "whole-map-export-byte-length-mismatch");
const wrongExportCells = structuredClone(exported);
wrongExportCells.metadata.packCells += 1;
assertProtocol(() => validateWholeMapExportResult({binding, output: wrongExportCells, sourceMap}), "whole-map-export-cell-count-mismatch");
const wrongExportMime = structuredClone(exported);
wrongExportMime.mimeType = "application/octet-stream";
assertProtocol(() => validateWholeMapExportResult({binding, output: wrongExportMime, sourceMap}), "whole-map-export-mime-type-invalid");

const city = sourceMap.settlements.cities.find(item => item && Number(item.id) > 0);
assert.ok(city, "headless 整图 fixture 缺少城市");
const headless = createHeadlessWriteSession(generatedDocument);
const headlessBefore = headless.getDocument();
const renameArgs = [{kind: "city", id: city.id}, `${city.name}·整图契约`];
const inspection = headless.inspect("edit.objects.inspectRename", renameArgs);
assert.equal(inspection.ok, true);
const applied = headless.apply("edit.objects.applyRename", renameArgs, {
  documentId: headless.documentId,
  expectedRevision: headless.revision,
  inspectionToken: inspection.data.inspectionToken,
  requestId: "whole-map-headless-1"
});
assert.equal(applied.ok, true);
const headlessAfter = headless.getDocument();
const headlessReceipt = validateHeadlessWriteCommit({
  documentId: headless.documentId,
  revisionBefore: applied.data.revisionBefore,
  revisionAfter: applied.data.revisionAfter,
  beforeDocument: headlessBefore,
  afterDocument: headlessAfter,
  result: applied.data
});
assert.equal(headlessReceipt.persisted.before, headlessReceipt.persisted.after);
assertProtocol(() => validateHeadlessWriteCommit({
  documentId: headless.documentId,
  revisionBefore: applied.data.revisionBefore,
  revisionAfter: applied.data.revisionAfter + 1,
  beforeDocument: headlessBefore,
  afterDocument: headlessAfter,
  result: applied.data
}), "headless-write-revision-delta-invalid");
const identityDrift = structuredClone(headlessAfter);
identityDrift.metadata.documentId = `${identityDrift.metadata.documentId}-drift`;
identityDrift.map.metadata.documentId = identityDrift.metadata.documentId;
assertProtocol(() => validateHeadlessWriteCommit({
  documentId: headless.documentId,
  revisionBefore: applied.data.revisionBefore,
  revisionAfter: applied.data.revisionAfter,
  beforeDocument: headlessBefore,
  afterDocument: identityDrift,
  result: applied.data
}), "headless-write-persisted-identity-drift");

const appSource = readFileSync(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8");
const generationFlow = appSource.slice(appSource.indexOf("async function generateMapOffMainThread"), appSource.indexOf("function setGenerationStatus"));
assert.ok(generationFlow.indexOf("validateWholeMapAdoptionEnvelope") < generationFlow.indexOf("materializeMapAdoptionHandoff"), "生成必须先验 envelope 再解包");
assert.ok(generationFlow.indexOf("materializeMapAdoptionHandoff") < generationFlow.indexOf("validateWholeMapAdoptionDocument"), "生成必须在解包后核对文档回执");
const importFlow = appSource.slice(appSource.indexOf("async function parseMapDocumentViaWorker"), appSource.indexOf("function storageClock"));
assert.ok(importFlow.indexOf("validateWholeMapAdoptionEnvelope") < importFlow.indexOf("materializeMapAdoptionHandoff"), "导入必须先验 envelope 再解包");
assert.ok(importFlow.indexOf("materializeMapAdoptionHandoff") < importFlow.indexOf("validateWholeMapAdoptionDocument"), "导入必须在解包后核对文档回执");
const exportFlow = appSource.slice(appSource.indexOf("async function exportMapArchiveViaWorker"), appSource.indexOf("async function parseMapDocumentViaWorker"));
assert.ok(exportFlow.indexOf("validateWholeMapExportResult") < exportFlow.indexOf("commitRegenerationWorkerSession"), "导出必须在 session commit 前校验整图回执");

console.log(JSON.stringify({
  status: "pass",
  owners: WHOLE_MAP_PROFILE_OWNERS.length,
  negativeCases: 12,
  generationCells: generationReceipt.gridCells,
  importDocumentId: importReceipt.binding.documentId,
  legacyDocumentId: legacyDocument.metadata.documentId,
  exportBytes: exportReceipt.bytes,
  headlessRevision: headlessReceipt.revisionAfter,
  browserRuns: 0
}, null, 2));

async function generationEnvelopeFixture() {
  return runGenerationWorkerTask({
    options: {seed: `whole-map-envelope-${Math.random()}`, cellsTarget: 1000, heightmapTemplate: "continents"}
  }, {binding, checkpoint() {}, adoptMap() {}});
}

function assertProtocol(callback, code) {
  assert.throws(callback, error => error?.code === code, `预期协议错误 ${code}`);
}
