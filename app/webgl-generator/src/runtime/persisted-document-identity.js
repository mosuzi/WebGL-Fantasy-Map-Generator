export const PERSISTED_DOCUMENT_IDENTITY_VERSION = 1;

const DOCUMENT_ID_PREFIX = "fmg-doc-v1-";
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function resolvePersistedDocumentIdentity(map) {
  const source = map && typeof map === "object" ? map : {};
  const existing = inspectPersistedDocumentIdentityMetadata(source.metadata, {scope: "map"});
  if (existing.documentId) return Object.freeze({documentId: existing.documentId, version: PERSISTED_DOCUMENT_IDENTITY_VERSION, source: "existing"});
  return Object.freeze({
    documentId: `${DOCUMENT_ID_PREFIX}${hashIdentitySource(identitySource(source, false))}${hashIdentitySource(identitySource(source, true))}`,
    version: PERSISTED_DOCUMENT_IDENTITY_VERSION,
    source: "legacy-derived"
  });
}

export function inspectPersistedDocumentIdentityMetadata(metadata, {scope = "document"} = {}) {
  const source = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
  const hasDocumentId = Object.hasOwn(source, "documentId") && source.documentId !== undefined && source.documentId !== null;
  const hasVersion = Object.hasOwn(source, "documentIdentityVersion") && source.documentIdentityVersion !== undefined && source.documentIdentityVersion !== null;
  const documentId = normalizePersistedDocumentId(source.documentId);
  if (hasDocumentId && !documentId) throw identityError("persisted_document_identity_invalid", `${scope} 的持久身份无效`);
  if (hasVersion && Number(source.documentIdentityVersion) !== PERSISTED_DOCUMENT_IDENTITY_VERSION) {
    throw identityError("persisted_document_identity_version_invalid", `${scope} 的持久身份版本无效`);
  }
  return Object.freeze({documentId, version: hasVersion ? PERSISTED_DOCUMENT_IDENTITY_VERSION : null});
}

export function normalizePersistedDocumentId(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > 160 || !/^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(normalized)) return null;
  return normalized;
}

export function validatePersistedDocumentIdentity(document) {
  const documentIdentity = inspectPersistedDocumentIdentityMetadata(document?.metadata, {scope: "document"});
  const mapIdentity = inspectPersistedDocumentIdentityMetadata(document?.map?.metadata, {scope: "map"});
  const documentId = documentIdentity.documentId;
  const mapDocumentId = mapIdentity.documentId;
  const documentVersion = Number(document?.metadata?.documentIdentityVersion);
  const mapVersion = Number(document?.map?.metadata?.documentIdentityVersion);
  if (!documentId || !mapDocumentId) throw identityError("persisted_document_identity_missing", "地图文档缺少持久身份");
  if (documentId !== mapDocumentId) throw identityError("persisted_document_identity_mismatch", "地图文档与 map 的持久身份不一致");
  if (documentVersion !== PERSISTED_DOCUMENT_IDENTITY_VERSION || mapVersion !== PERSISTED_DOCUMENT_IDENTITY_VERSION) {
    throw identityError("persisted_document_identity_version_invalid", "地图文档持久身份版本无效");
  }
  return Object.freeze({documentId, version: documentVersion});
}

function identitySource(map, reverse) {
  const values = [
    map.metadata?.seed ?? map.options?.seed ?? "",
    map.metadata?.generatedAt ?? ""
  ].map(value => String(value));
  if (reverse) values.reverse();
  return values.map(value => `${value.length}:${value}`).join("|");
}

function hashIdentitySource(value) {
  let hash = FNV_OFFSET;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    hash ^= code & 0xff;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
    hash ^= code >>> 8;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function identityError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
