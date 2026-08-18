export const PERSISTED_DOCUMENT_IDENTITY_VERSION = 1;

const DOCUMENT_ID_PREFIX = "fmg-doc-v1-";
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function resolvePersistedDocumentIdentity(map) {
  const source = map && typeof map === "object" ? map : {};
  const existing = normalizePersistedDocumentId(source.metadata?.documentId);
  if (existing) return Object.freeze({documentId: existing, version: PERSISTED_DOCUMENT_IDENTITY_VERSION, source: "existing"});
  return Object.freeze({
    documentId: `${DOCUMENT_ID_PREFIX}${hashIdentitySource(identitySource(source, false))}${hashIdentitySource(identitySource(source, true))}`,
    version: PERSISTED_DOCUMENT_IDENTITY_VERSION,
    source: "legacy-derived"
  });
}

export function normalizePersistedDocumentId(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > 160 || !/^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(normalized)) return null;
  return normalized;
}

export function validatePersistedDocumentIdentity(document) {
  const documentId = normalizePersistedDocumentId(document?.metadata?.documentId);
  const mapDocumentId = normalizePersistedDocumentId(document?.map?.metadata?.documentId);
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
    map.metadata?.generatedAt ?? "",
    map.metadata?.graphWidth ?? map.options?.graphWidth ?? "",
    map.metadata?.graphHeight ?? map.options?.graphHeight ?? "",
    map.grid?.metadata?.actualCells ?? map.grid?.points?.length ?? map.grid?.cells?.h?.length ?? "",
    map.pack?.metadata?.cells ?? map.pack?.cells?.i?.length ?? ""
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
