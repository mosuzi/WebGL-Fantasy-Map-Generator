import {getBuiltinNamebaseSummaries, summarizeNamebaseSource} from "./names.js";

export const NAMEBASE_DOCUMENT_TYPE = "webgl-generator-namebases";
export const NAMEBASE_DOCUMENT_VERSION = 1;

export function createNamebaseDocument(map = null, {includeUser = true} = {}) {
  const builtinBases = getBuiltinNamebaseSummaries({includeSource: true}).map(row => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    category: row.category,
    builtin: true,
    samples: row.samples,
    uniqueSamples: row.uniqueSamples,
    duplicateSamples: row.duplicateSamples,
    minLength: row.minLength,
    maxLength: row.maxLength,
    note: row.note,
    source: row.source || []
  }));
  const userBases = includeUser ? (map?.namebases?.bases || []).map(base => namebaseExportRecord(base)).filter(Boolean) : [];
  const bases = [...builtinBases, ...userBases];
  return {
    type: NAMEBASE_DOCUMENT_TYPE,
    version: NAMEBASE_DOCUMENT_VERSION,
    exportedAt: new Date().toISOString(),
    metadata: {
      seed: map?.metadata?.seed || "",
      checksum: map?.metadata?.checksum || "",
      bases: bases.length,
      samples: bases.reduce((sum, base) => sum + base.samples, 0),
      builtin: builtinBases.length,
      user: userBases.length
    },
    bases
  };
}

export function createBuiltinNamebaseDocument(map = null) {
  return createNamebaseDocument(map, {includeUser: false});
}

export function parseNamebaseDocument(text) {
  const document = JSON.parse(text);
  if (document?.type !== NAMEBASE_DOCUMENT_TYPE) throw new Error("文件不是当前名称库格式");
  if (document.version !== NAMEBASE_DOCUMENT_VERSION) throw new Error(`暂不支持的名称库格式版本：${document.version}`);
  if (!Array.isArray(document.bases)) throw new Error("名称库文件缺少 bases 数据");
  return document;
}

export function importNamebaseDocument(map, document, {filename = ""} = {}) {
  if (!map) throw new Error("当前没有可导入名称库的地图");
  const store = ensureNamebaseStore(map);
  const existingIds = new Set(store.bases.map(base => base.id));
  const importedAt = new Date().toISOString();
  const bases = document.bases
    .map((base, index) => normalizeImportedBase(base, {
      existingIds,
      importedAt,
      filename,
      index
    }))
    .filter(Boolean);

  store.bases.push(...bases);
  store.metadata = {
    ...(store.metadata || {}),
    bases: store.bases.length,
    imported: store.bases.filter(base => base.origin === "导入").length,
    updatedAt: importedAt
  };
  return {
    imported: bases.length,
    total: store.bases.length
  };
}

export function clearUserNamebases(map) {
  if (!map?.namebases || !Array.isArray(map.namebases.bases)) return {removed: 0, total: 0};
  const removed = map.namebases.bases.length;
  map.namebases.bases = [];
  updateNamebaseMetadata(map.namebases);
  return {removed, total: 0};
}

export function deleteUserNamebase(map, id) {
  if (!map?.namebases || !Array.isArray(map.namebases.bases)) return {removed: false, total: 0, name: ""};
  const index = map.namebases.bases.findIndex(base => base?.id === id && base?.builtin !== true);
  if (index < 0) return {removed: false, total: map.namebases.bases.length, name: ""};
  const [removed] = map.namebases.bases.splice(index, 1);
  updateNamebaseMetadata(map.namebases);
  return {
    removed: true,
    total: map.namebases.bases.length,
    name: removed?.name || removed?.id || ""
  };
}

export function getNamebaseSummariesForMap(map, options = {}) {
  const builtinRows = getBuiltinNamebaseSummaries(options).map(row => ({
    ...row,
    builtin: true,
    origin: "内置"
  }));
  const customRows = (map?.namebases?.bases || []).map(base => ({
    ...summarizeNamebaseSource(base, options),
    builtin: false,
    origin: base.origin || "导入"
  }));
  return [...builtinRows, ...customRows].map((row, index) => ({...row, index}));
}

function ensureNamebaseStore(map) {
  if (!map.namebases || typeof map.namebases !== "object") {
    map.namebases = {
      version: 1,
      bases: [],
      bindings: {},
      metadata: {bases: 0}
    };
  }
  if (!Array.isArray(map.namebases.bases)) map.namebases.bases = [];
  if (!map.namebases.bindings || typeof map.namebases.bindings !== "object") map.namebases.bindings = {};
  if (!map.namebases.metadata || typeof map.namebases.metadata !== "object") map.namebases.metadata = {};
  return map.namebases;
}

function updateNamebaseMetadata(store) {
  store.metadata = {
    ...(store.metadata || {}),
    bases: store.bases.length,
    imported: store.bases.filter(base => base?.origin === "导入").length,
    updatedAt: new Date().toISOString()
  };
}

function normalizeImportedBase(base, {existingIds, importedAt, filename, index}) {
  const source = Array.isArray(base?.source)
    ? base.source
    : String(base?.source || "").split(/[,，\n\r]+/u);
  const values = source.map(value => String(value || "").trim()).filter(Boolean);
  if (!values.length) return null;
  const id = uniqueId(`imported-${sanitizeId(base?.id || base?.name || `namebase-${index + 1}`)}`, existingIds);
  existingIds.add(id);
  return {
    id,
    sourceId: String(base?.id || ""),
    name: base?.name ? `${base.name}` : `导入名称库 ${index + 1}`,
    kind: base?.kind || "generic",
    category: base?.category || "用户名称库",
    note: base?.note || "",
    source: values,
    builtin: false,
    origin: "导入",
    importedAt,
    importedFrom: filename || ""
  };
}

function namebaseExportRecord(base) {
  const summary = summarizeNamebaseSource(base, {includeSource: true});
  if (!summary.source?.length) return null;
  return {
    id: summary.id,
    sourceId: base.sourceId || "",
    name: summary.name,
    kind: summary.kind,
    category: summary.category,
    builtin: false,
    origin: base.origin || "导入",
    samples: summary.samples,
    uniqueSamples: summary.uniqueSamples,
    duplicateSamples: summary.duplicateSamples,
    minLength: summary.minLength,
    maxLength: summary.maxLength,
    note: summary.note,
    importedAt: base.importedAt || "",
    importedFrom: base.importedFrom || "",
    source: summary.source
  };
}

function uniqueId(id, existingIds) {
  let candidate = id || "imported-namebase";
  let index = 2;
  while (existingIds.has(candidate)) {
    candidate = `${id}-${index}`;
    index += 1;
  }
  return candidate;
}

function sanitizeId(value) {
  return String(value || "namebase")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "namebase";
}
