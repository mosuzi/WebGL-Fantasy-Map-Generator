import {
  PERSISTED_DOCUMENT_IDENTITY_VERSION,
  normalizePersistedDocumentId,
  resolvePersistedDocumentIdentity,
  validatePersistedDocumentIdentity
} from "./persisted-document-identity.js";

export const WHOLE_MAP_PROFILE_OWNERS = Object.freeze([
  Object.freeze({id: "generation-adoption", task: "generation.compute", resultKind: "map-generation-adoption-result", owner: "generation", effect: "new-session"}),
  Object.freeze({id: "persistence-import", task: "map-file-io", resultKind: "map-file-import-result", owner: "persistence", effect: "new-session"}),
  Object.freeze({id: "persistence-export", task: "regeneration.compute", resultKind: "archive-export", owner: "persistence", effect: "read-only"}),
  Object.freeze({id: "headless-write", task: "headless-write", resultKind: "headless-write-commit", owner: "headless", effect: "revision-commit"})
]);

const ADOPTION_RESULT_KIND = Object.freeze({
  "generation-adoption": "map-generation-adoption-result",
  "persistence-import": "map-file-import-result"
});
const BINDING_KEYS = Object.freeze([
  "mapIdentity", "mapRevision", "topologyRevision", "generationToken", "lockFingerprint", "operationId", "operationName", "sourceFingerprint"
]);
const PROFILE_IDS = new Set(["generation-adoption", "persistence-import", "persistence-export", "headless-write"]);
const PROFILE_OWNERS = new Set(["generation", "persistence", "headless"]);
const PROFILE_EFFECTS = new Set(["new-session", "read-only", "revision-commit"]);

export function validateWholeMapProfileOwnerRegistry(descriptors = WHOLE_MAP_PROFILE_OWNERS) {
  if (!Array.isArray(descriptors) || descriptors.length !== 4) throw protocolError("whole-map-profile-registry-invalid", "整图 profile owner 登记不完整");
  const ids = new Set();
  const results = new Set();
  for (const descriptor of descriptors) {
    const value = record(descriptor, "wholeMapProfile.owner");
    for (const key of ["id", "task", "resultKind", "owner", "effect"]) {
      if (typeof value[key] !== "string" || !value[key]) throw protocolError("whole-map-profile-registry-invalid", `整图 profile owner 缺少 ${key}`);
    }
    if (!PROFILE_IDS.has(value.id) || !PROFILE_OWNERS.has(value.owner) || !PROFILE_EFFECTS.has(value.effect)) {
      throw protocolError("whole-map-profile-registry-invalid", `整图 profile ${value.id} 的 owner / effect 无效`);
    }
    if (ids.has(value.id)) throw protocolError("whole-map-profile-owner-duplicate", `整图 profile ${value.id} 重复登记`);
    const resultKey = `${value.task}:${value.resultKind}`;
    if (results.has(resultKey)) throw protocolError("whole-map-profile-result-owner-duplicate", `整图结果 ${resultKey} 存在多个 owner`);
    ids.add(value.id);
    results.add(resultKey);
  }
  return Object.freeze(descriptors.slice());
}

export function createWholeMapDocumentMetadata(document) {
  const source = record(document, "wholeMap.document");
  const map = record(source.map, "wholeMap.document.map");
  const identity = validatePersistedDocumentIdentity(source);
  const checksum = documentChecksum(source);
  if (!checksum) throw protocolError("whole-map-document-checksum-missing", "整图文档缺少 checksum");
  return Object.freeze({
    type: String(source.type || ""),
    version: safeInteger(source.version, "wholeMap.document.version", {positive: true}),
    documentId: identity.documentId,
    documentIdentityVersion: identity.version,
    name: String(source.metadata?.name || map.metadata?.name || map.options?.mapName || ""),
    schemaVersion: safeInteger(map.metadata?.schemaVersion, "wholeMap.document.map.metadata.schemaVersion", {positive: true}),
    seed: String(map.metadata?.seed || source.metadata?.seed || ""),
    checksum,
    gridCells: wholeMapCellCount(map, "grid"),
    packCells: wholeMapCellCount(map, "pack")
  });
}

export function captureWholeMapPersistedIdentity(document) {
  const identity = validatePersistedDocumentIdentity(document);
  return Object.freeze({documentId: identity.documentId, version: identity.version});
}

export function validateWholeMapAdoptionEnvelope({profile, binding, output, renderBinding = null, externalCanonical = false}) {
  const expectedKind = ADOPTION_RESULT_KIND[profile];
  if (!expectedKind) throw protocolError("whole-map-adoption-profile-invalid", `未知整图 adoption profile：${String(profile || "")}`);
  const expectedBinding = validateLegacyBinding(binding, "wholeMap.adoption.requestBinding");
  const result = record(output, "wholeMap.adoption.output");
  if (result.kind !== expectedKind) throw protocolError("whole-map-adoption-result-kind-invalid", `${profile} 返回了未登记结果类型`);
  assertSameLegacyBinding(result.binding, expectedBinding, "wholeMap.adoption.output.binding");
  if (Object.hasOwn(result, "map") || Object.hasOwn(result, "document") || Object.hasOwn(result, "replacementMap")) {
    throw protocolError("whole-map-adoption-full-document-leak", "整图 adoption 结果不得重复携带 map / document");
  }
  if (externalCanonical) {
    if (result.canonicalDocumentMode !== "parallel-main-decode" || result.handoff !== null) {
      throw protocolError("whole-map-adoption-canonical-mode-invalid", "整图 adoption 外部 canonical 文档契约无效");
    }
  } else {
    validateAdoptionHandoff(result.handoff);
  }
  validateDocumentMetadataShape(result.metadata, "wholeMap.adoption.output.metadata");
  validatePreparedRender(result.preparedRender, renderBinding);
  validateTimings(result.timings, "wholeMap.adoption.output.timings");
  return Object.freeze({profile, binding: expectedBinding, resultKind: expectedKind, effect: "new-session"});
}

export function validateWholeMapAdoptionDocument({profile, metadata, document}) {
  if (!ADOPTION_RESULT_KIND[profile]) throw protocolError("whole-map-adoption-profile-invalid", `未知整图 adoption profile：${String(profile || "")}`);
  const actual = createWholeMapDocumentMetadata(document);
  assertDocumentMetadata(metadata, actual, "wholeMap.adoption.output.metadata");
  return Object.freeze({profile, binding: Object.freeze({documentId: actual.documentId, identityVersion: actual.documentIdentityVersion}), checksum: actual.checksum, gridCells: actual.gridCells, packCells: actual.packCells, effect: "new-session"});
}

export function validateWholeMapExportResult({binding, output, sourceMap}) {
  const expectedBinding = validateLegacyBinding(binding, "wholeMap.export.requestBinding");
  const result = record(output, "wholeMap.export.output");
  if (result.kind !== "map-file-export-result") throw protocolError("whole-map-export-result-kind-invalid", "整图导出返回了未登记结果类型");
  assertSameLegacyBinding(result.binding, expectedBinding, "wholeMap.export.output.binding");
  if (!["plain", "gzip", "webfmg-v3"].includes(result.encoding)) throw protocolError("whole-map-export-encoding-invalid", "整图导出 encoding 无效");
  if (!["blob", "bytes", "text"].includes(result.resultType)) throw protocolError("whole-map-export-result-type-invalid", "整图导出 resultType 无效");
  if (result.resultType === "text" && result.encoding !== "plain") throw protocolError("whole-map-export-result-type-invalid", "压缩整图导出不得返回 text");
  const expectedMimeType = result.encoding === "plain" ? "application/json;charset=utf-8" : "application/gzip";
  if (result.mimeType !== expectedMimeType) throw protocolError("whole-map-export-mime-type-invalid", "整图导出 mimeType 与 encoding 不一致");
  const bytes = safeInteger(result.bytes, "wholeMap.export.output.bytes");
  const actualBytes = exportDataBytes(result.data, result.resultType);
  if (bytes !== actualBytes) throw protocolError("whole-map-export-byte-length-mismatch", "整图导出 data 与 bytes 不一致");
  safeInteger(result.originalBytes, "wholeMap.export.output.originalBytes");
  safeInteger(result.originalCharacters, "wholeMap.export.output.originalCharacters");
  const metadata = validateDocumentMetadataShape(result.metadata, "wholeMap.export.output.metadata");
  const identity = resolvePersistedDocumentIdentity(sourceMap);
  const checksum = mapChecksum(sourceMap);
  if (metadata.documentId !== identity.documentId || metadata.documentIdentityVersion !== PERSISTED_DOCUMENT_IDENTITY_VERSION) {
    throw protocolError("whole-map-export-document-identity-mismatch", "整图导出 identity 与 canonical map 不一致");
  }
  if (!checksum || metadata.checksum !== checksum) throw protocolError("whole-map-export-checksum-mismatch", "整图导出 checksum 与 canonical map 不一致");
  if (metadata.gridCells !== wholeMapCellCount(sourceMap, "grid") || metadata.packCells !== wholeMapCellCount(sourceMap, "pack")) {
    throw protocolError("whole-map-export-cell-count-mismatch", "整图导出 cell 计数与 canonical map 不一致");
  }
  validateTimings(result.timings, "wholeMap.export.output.timings");
  return Object.freeze({profile: "persistence-export", binding: Object.freeze({documentId: metadata.documentId, identityVersion: metadata.documentIdentityVersion}), checksum, gridCells: metadata.gridCells, packCells: metadata.packCells, effect: "read-only", bytes});
}

export function validateHeadlessWriteCommit({documentId, revisionBefore, revisionAfter, beforeDocument = null, beforeIdentity: identityReceipt = null, afterDocument, result}) {
  const beforeIdentity = beforeDocument ? validatePersistedDocumentIdentity(beforeDocument) : validatePersistedIdentityReceipt(identityReceipt);
  const afterIdentity = validatePersistedDocumentIdentity(afterDocument);
  if (beforeIdentity.documentId !== afterIdentity.documentId || beforeIdentity.version !== afterIdentity.version) {
    throw protocolError("headless-write-persisted-identity-drift", "headless write 不得改变持久文档 identity");
  }
  const expectedDocumentId = String(documentId || "");
  if (!expectedDocumentId) throw protocolError("headless-write-document-id-invalid", "headless write 缺少隔离文档 identity");
  const before = safeInteger(revisionBefore, "headlessWrite.revisionBefore");
  const after = safeInteger(revisionAfter, "headlessWrite.revisionAfter");
  if (after !== before + 1) throw protocolError("headless-write-revision-delta-invalid", "headless write revision 必须精确推进一次");
  const receipt = record(result, "headlessWrite.result");
  if (receipt.executed !== true || receipt.replayed !== false || receipt.documentId !== expectedDocumentId
    || Number(receipt.revisionBefore) !== before || Number(receipt.revisionAfter) !== after) {
    throw protocolError("headless-write-receipt-mismatch", "headless write 回执与事务 identity / revision 不一致");
  }
  const metadata = record(afterDocument?.metadata?.headlessWrite, "headlessWrite.document.metadata.headlessWrite");
  if (metadata.documentId !== expectedDocumentId || Number(metadata.revision) !== after) {
    throw protocolError("headless-write-document-metadata-mismatch", "headless write 文档 metadata 未绑定已提交 revision");
  }
  for (const forbidden of ["runtimeMapSessionId", "mapIdentity", "renderPreparationId", "presentationRevision"]) {
    if (Object.hasOwn(receipt, forbidden)) throw protocolError("headless-write-profile-identity-leak", `headless write 回执不得携带 ${forbidden}`);
  }
  return Object.freeze({profile: "headless-write", effect: "revision-commit", persisted: Object.freeze({before: beforeIdentity.documentId, after: afterIdentity.documentId}), headlessDocumentId: expectedDocumentId, revisionBefore: before, revisionAfter: after});
}

function validatePersistedIdentityReceipt(value) {
  const identity = record(value, "wholeMap.persistedIdentity");
  const documentId = normalizePersistedDocumentId(identity.documentId);
  if (!documentId || Number(identity.version) !== PERSISTED_DOCUMENT_IDENTITY_VERSION) {
    throw protocolError("whole-map-document-identity-invalid", "整图持久 identity 回执无效");
  }
  return Object.freeze({documentId, version: PERSISTED_DOCUMENT_IDENTITY_VERSION});
}

function validateAdoptionHandoff(value) {
  const handoff = record(value, "wholeMap.adoption.output.handoff");
  if (handoff.kind !== "map-adoption-v3-sections" || handoff.encoding !== "webfmg-v3" || !Array.isArray(handoff.chunks) || !handoff.chunks.length) {
    throw protocolError("whole-map-adoption-handoff-invalid", "整图 adoption handoff 描述无效");
  }
  const chunks = handoff.chunks.map((chunk, index) => binaryView(chunk, `wholeMap.adoption.output.handoff.chunks.${index}`));
  const byteLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  if (!byteLength || byteLength !== Number(handoff.byteLength)) throw protocolError("whole-map-adoption-handoff-length-mismatch", "整图 adoption handoff 长度不一致");
  safeInteger(handoff.sections, "wholeMap.adoption.output.handoff.sections", {positive: true});
  safeInteger(handoff.schemaVersion, "wholeMap.adoption.output.handoff.schemaVersion", {positive: true});
}

function validatePreparedRender(value, expected) {
  if (value === undefined || value === null) return;
  const prepared = record(value, "wholeMap.adoption.output.preparedRender");
  if (prepared.schemaVersion !== 1) throw protocolError("whole-map-adoption-render-schema-invalid", "整图 adoption render schema 无效");
  if (!expected) return;
  const binding = record(prepared.binding, "wholeMap.adoption.output.preparedRender.binding");
  if (binding.mapIdentity !== expected.mapIdentity
    || Number(binding.mapRevision) !== Number(expected.mapRevision)
    || Number(binding.topologyRevision) !== Number(expected.topologyRevision)) {
    throw protocolError("whole-map-adoption-render-binding-mismatch", "整图 adoption render binding 与临时接纳身份不一致");
  }
}

function validateDocumentMetadataShape(value, path) {
  const metadata = record(value, path);
  const documentId = normalizePersistedDocumentId(metadata.documentId);
  if (!documentId || Number(metadata.documentIdentityVersion) !== PERSISTED_DOCUMENT_IDENTITY_VERSION) {
    throw protocolError("whole-map-document-identity-invalid", `${path} 的持久 identity 无效`);
  }
  const checksum = String(metadata.checksum || "");
  if (!checksum) throw protocolError("whole-map-document-checksum-missing", `${path} 缺少 checksum`);
  return Object.freeze({
    ...metadata,
    documentId,
    documentIdentityVersion: PERSISTED_DOCUMENT_IDENTITY_VERSION,
    version: safeInteger(metadata.version, `${path}.version`, {positive: true}),
    schemaVersion: safeInteger(metadata.schemaVersion, `${path}.schemaVersion`, {positive: true}),
    checksum,
    gridCells: safeInteger(metadata.gridCells, `${path}.gridCells`, {positive: true}),
    packCells: safeInteger(metadata.packCells, `${path}.packCells`, {positive: true})
  });
}

function assertDocumentMetadata(value, expected, path) {
  const actual = validateDocumentMetadataShape(value, path);
  for (const key of ["type", "version", "documentId", "documentIdentityVersion", "schemaVersion", "seed", "checksum", "gridCells", "packCells"]) {
    if (actual[key] !== expected[key]) throw protocolError("whole-map-adoption-document-mismatch", `${path}.${key} 与 handoff 文档不一致`);
  }
}

function validateLegacyBinding(value, path) {
  const source = record(value, path);
  const binding = {
    mapIdentity: typeof source.mapIdentity === "string" ? source.mapIdentity : "",
    mapRevision: Number(source.mapRevision),
    topologyRevision: Number(source.topologyRevision ?? 0),
    generationToken: Number(source.generationToken),
    lockFingerprint: typeof source.lockFingerprint === "string" ? source.lockFingerprint : "",
    operationId: Number(source.operationId),
    operationName: typeof source.operationName === "string" ? source.operationName : "",
    ...(typeof source.sourceFingerprint === "string" && source.sourceFingerprint ? {sourceFingerprint: source.sourceFingerprint} : {})
  };
  if (!binding.mapIdentity || !Number.isSafeInteger(binding.mapRevision) || binding.mapRevision < 0
    || !Number.isSafeInteger(binding.topologyRevision) || binding.topologyRevision < 0
    || !Number.isSafeInteger(binding.generationToken) || binding.generationToken < 0
    || !binding.lockFingerprint || !Number.isSafeInteger(binding.operationId) || binding.operationId < 0) {
    throw protocolError("whole-map-profile-binding-invalid", `${path} 缺少 identity / revision / topology / token / lock`);
  }
  return Object.freeze(binding);
}

function assertSameLegacyBinding(value, expected, path) {
  const actual = validateLegacyBinding(value, path);
  for (const key of BINDING_KEYS) {
    if ((actual[key] ?? "") !== (expected[key] ?? "")) throw protocolError("whole-map-profile-binding-stale", `${path}.${key} 与请求绑定不一致`);
  }
}

function validateTimings(value, path) {
  const timings = record(value, path);
  for (const [key, entry] of Object.entries(timings)) {
    if (!Number.isFinite(Number(entry)) || Number(entry) < 0) throw protocolError("whole-map-profile-timing-invalid", `${path}.${key} 必须是非负有限数`);
  }
}

function wholeMapCellCount(map, kind) {
  const identityCells = kind === "grid" ? map?.grid?.cells?.i : map?.pack?.cells?.i;
  const fallbackCells = kind === "grid" ? map?.grid?.cells?.h : null;
  const count = collectionLength(identityCells) || collectionLength(fallbackCells);
  const actual = safeInteger(count, `wholeMap.document.${kind}Cells`, {positive: true});
  const declared = kind === "grid"
    ? [map?.metadata?.gridCells, map?.grid?.metadata?.actualCells]
    : [map?.metadata?.packCells, map?.pack?.metadata?.cells];
  for (const value of declared) {
    if (value === undefined || value === null || value === "") continue;
    if (safeInteger(value, `wholeMap.document.${kind}CellsMetadata`, {positive: true}) !== actual) {
      throw protocolError("whole-map-document-cell-count-mismatch", `整图文档 ${kind} cell metadata 与 identity 容器不一致`);
    }
  }
  return actual;
}

function documentChecksum(document) {
  const canonical = mapChecksum(document?.map);
  const documentValue = String(document?.metadata?.checksum || "");
  if (canonical && documentValue && canonical !== documentValue) {
    throw protocolError("whole-map-document-checksum-mismatch", "整图 document / map checksum 不一致");
  }
  return canonical || documentValue;
}

function mapChecksum(map) {
  return String(map?.metadata?.checksum || map?.summary?.checksum || "");
}

function collectionLength(value) {
  return Array.isArray(value) || ArrayBuffer.isView(value) ? value.length : 0;
}

function exportDataBytes(value, resultType) {
  if (resultType === "text") return new TextEncoder().encode(String(value)).byteLength;
  if (resultType === "blob") {
    if (!value || typeof value.size !== "number") throw protocolError("whole-map-export-data-invalid", "整图导出 blob 无效");
    return Number(value.size);
  }
  return binaryView(value, "wholeMap.export.output.data").byteLength;
}

function binaryView(value, path) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw protocolError("whole-map-profile-binary-invalid", `${path} 必须是二进制数据`);
}

function safeInteger(value, path, {positive = false} = {}) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < (positive ? 1 : 0)) throw protocolError("whole-map-profile-integer-invalid", `${path} 必须是${positive ? "正" : "非负"}安全整数`);
  return number;
}

function record(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw protocolError("whole-map-profile-record-invalid", `${path} 必须是对象`);
  return value;
}

function protocolError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

validateWholeMapProfileOwnerRegistry();
