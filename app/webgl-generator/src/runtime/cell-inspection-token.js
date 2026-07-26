const TOKEN_VERSION = "celli1";
const INSPECTOR_SCHEMA_VERSION = 1;

export function issueCellInspectionToken(revision, actionId, input) {
  const snapshot = revisionSnapshot(revision);
  const actionHash = fingerprint(String(actionId));
  const inputHash = fingerprint(stableStringify(input));
  const context = `${snapshot.mapIdentity ?? "none"}:${snapshot.mapRevision}:${INSPECTOR_SCHEMA_VERSION}:${actionHash}:${inputHash}`;
  const signature = sign(revision, context);
  return {
    inspectionToken: `${TOKEN_VERSION}.${actionHash}.${inputHash}.${snapshot.mapRevision.toString(36)}.${signature}`,
    expectedRevision: snapshot,
    inspectorSchemaVersion: INSPECTOR_SCHEMA_VERSION
  };
}

export function validateCellInspectionToken(revision, token, actionId, input, expectedRevision) {
  const snapshot = revisionSnapshot(revision);
  const expected = normalizeExpectedRevision(expectedRevision);
  if (!expected || expected.mapIdentity !== snapshot.mapIdentity || expected.mapRevision !== snapshot.mapRevision) {
    return {valid: false, code: "inspection-stale", snapshot};
  }
  if (typeof token !== "string") return {valid: false, code: "inspection-required", snapshot};
  const match = /^celli1\.([0-9a-f]{8})\.([0-9a-f]{8})\.([0-9a-z]+)\.([0-9a-f]{8})$/.exec(token);
  if (!match) return {valid: false, code: "inspection-token-invalid", snapshot};
  const [, actionHash, inputHash, revisionText, signature] = match;
  const actualActionHash = fingerprint(String(actionId));
  const actualInputHash = fingerprint(stableStringify(input));
  if (actionHash !== actualActionHash || inputHash !== actualInputHash) return {valid: false, code: "inspection-token-mismatch", snapshot};
  if (Number.parseInt(revisionText, 36) !== snapshot.mapRevision) return {valid: false, code: "inspection-stale", snapshot};
  const context = `${snapshot.mapIdentity ?? "none"}:${snapshot.mapRevision}:${INSPECTOR_SCHEMA_VERSION}:${actionHash}:${inputHash}`;
  if (sign(revision, context) !== signature) return {valid: false, code: "inspection-token-invalid", snapshot};
  return {valid: true, code: "ok", snapshot};
}

export function normalizeCellCreateInput(input) {
  if (Number.isSafeInteger(Number(input)) && Number(input) >= 0) {
    return {cell: {space: "grid", id: Number(input)}};
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) throw inputError("创建输入必须是 grid CellRef 或包含 cell 的对象");
  const cell = input.cell || input;
  if (!cell || typeof cell !== "object" || Array.isArray(cell)) throw inputError("创建输入缺少 cell");
  const space = String(cell.space || "");
  const id = Number(cell.id);
  if (space !== "grid") throw inputError("创建入口只支持 grid CellRef", "cell-space-not-supported");
  if (!Number.isSafeInteger(id) || id < 0) throw inputError("grid CellRef id 必须是非负安全整数");
  return {cell: {space: "grid", id}};
}

function normalizeExpectedRevision(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const mapIdentity = value.mapIdentity === null || value.mapIdentity === undefined ? null : String(value.mapIdentity);
  const mapRevision = Number(value.mapRevision);
  if (!Number.isSafeInteger(mapRevision) || mapRevision < 0) return null;
  return {mapIdentity, mapRevision};
}

function revisionSnapshot(revision) {
  const snapshot = typeof revision?.getSnapshot === "function" ? revision.getSnapshot() : revision || {};
  return {
    mapIdentity: snapshot.mapIdentity === null || snapshot.mapIdentity === undefined ? null : String(snapshot.mapIdentity),
    mapRevision: Number.isSafeInteger(Number(snapshot.mapRevision)) && Number(snapshot.mapRevision) >= 0 ? Number(snapshot.mapRevision) : 0
  };
}

function sign(revision, value) {
  return typeof revision?.signCursor === "function"
    ? revision.signCursor(`inspection:${value}`)
    : fingerprint(`inspection-fallback:${value}`);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value) {
  let hash = 0x811c9dc5;
  const text = String(value);
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function inputError(message, code = "invalid_argument") {
  const error = new Error(message);
  error.code = code;
  return error;
}
