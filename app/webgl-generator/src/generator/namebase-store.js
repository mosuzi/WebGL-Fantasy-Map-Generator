import {createNamebaseSourceEntry, formatNamebaseWeightedSample, generateNamebaseCandidate, getBuiltinNamebaseSummaries, normalizeNamebaseGenerationOptions, parseNamebaseWeightedSamples, summarizeNamebaseSource} from "./names.js";

export const NAMEBASE_DOCUMENT_TYPE = "webgl-generator-namebases";
export const NAMEBASE_DOCUMENT_VERSION = 1;
export const NAMEBASE_BINDING_TARGETS = Object.freeze([
  {key: "stateRoot", label: "国家根名"},
  {key: "place", label: "地名"},
  {key: "hydro", label: "水文"},
  {key: "culture", label: "文化"},
  {key: "religion", label: "宗教"}
]);

export function createNamebaseDocument(map = null, {includeUser = true, baseIds = null} = {}) {
  const selectedIds = normalizeNamebaseExportIds(baseIds);
  const builtinBases = getBuiltinNamebaseSummaries({includeSource: true}).map(row => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    category: row.category,
    builtin: true,
    samples: row.samples,
    weightedSamples: row.weightedSamples,
    weightedNameSamples: row.weightedNameSamples,
    maxSampleWeight: row.maxSampleWeight,
    chainDiversity: row.chainDiversity,
    uniqueSamples: row.uniqueSamples,
    duplicateSamples: row.duplicateSamples,
    minLength: row.minLength,
    maxLength: row.maxLength,
    sampleMinLength: row.sampleMinLength,
    sampleMaxLength: row.sampleMaxLength,
    sampleMeanLength: row.sampleMeanLength,
    sampleMedianLength: row.sampleMedianLength,
    lengthOutlierSamples: row.lengthOutlierSamples,
    lengthOutlierNames: row.lengthOutlierNames || [],
    disallowedRepeatSamples: row.disallowedRepeatSamples,
    disallowedRepeatNames: row.disallowedRepeatNames || [],
    doubledChars: row.doubledChars || [],
    unusualChars: row.unusualChars || [],
    duplicateChars: row.duplicateChars || "",
    legacyMultiwordRate: row.multiwordRate || 0,
    note: row.note,
    source: row.source || []
  }));
  const userBases = includeUser ? (map?.namebases?.bases || []).map(base => namebaseExportRecord(base)).filter(Boolean) : [];
  const bases = [...builtinBases, ...userBases].filter(base => !selectedIds || selectedIds.has(String(base.id)));
  return {
    type: NAMEBASE_DOCUMENT_TYPE,
    version: NAMEBASE_DOCUMENT_VERSION,
    exportMode: selectedIds ? "selected-namebases" : "all-namebases",
    exportedAt: new Date().toISOString(),
    metadata: {
      seed: map?.metadata?.seed || "",
      checksum: map?.metadata?.checksum || "",
      bases: bases.length,
      samples: bases.reduce((sum, base) => sum + base.samples, 0),
      builtin: bases.filter(base => base.builtin).length,
      user: bases.filter(base => !base.builtin).length
    },
    bases
  };
}

export function createBuiltinNamebaseDocument(map = null) {
  return createNamebaseDocument(map, {includeUser: false});
}

export function createLegacyNamebaseText(map = null, options = {}) {
  return createNamebaseDocument(map, options).bases
    .map(formatLegacyNamebaseLine)
    .filter(Boolean)
    .join("\r\n");
}

function normalizeNamebaseExportIds(baseIds) {
  if (!Array.isArray(baseIds)) return null;
  return new Set(baseIds.map(id => String(id || "").trim()).filter(Boolean));
}

export function parseNamebaseDocument(text) {
  const rawText = String(text || "");
  const trimmed = rawText.trim();
  if (!trimmed) throw new Error("名称库文件为空");
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return parseLegacyNamebaseText(trimmed);
  const document = JSON.parse(trimmed);
  if (document?.type !== NAMEBASE_DOCUMENT_TYPE) throw new Error("文件不是当前名称库格式");
  if (document.version !== NAMEBASE_DOCUMENT_VERSION) throw new Error(`暂不支持的名称库格式版本：${document.version}`);
  if (!Array.isArray(document.bases)) throw new Error("名称库文件缺少 bases 数据");
  return document;
}

export function importNamebaseDocument(map, document, {filename = "", mode = "append"} = {}) {
  if (!map) throw new Error("当前没有可导入名称库的地图");
  const store = ensureNamebaseStore(map);
  const replaced = mode === "replace" ? store.bases.length : 0;
  if (mode === "replace") store.bases = [];
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
  updateNamebaseMetadata(store);
  return {
    imported: bases.length,
    total: store.bases.length,
    replaced
  };
}

export function createNamebaseImportPreview(map, document, {filename = "", mode = "append"} = {}) {
  if (!map) throw new Error("当前没有可导入名称库的地图");
  const userBases = Array.isArray(map.namebases?.bases) ? map.namebases.bases : [];
  const existingNameKeys = new Set(userBases.map(base => normalizeNamebaseKey(base?.name)).filter(Boolean));
  const existingSourceKeys = new Set(userBases.flatMap(base => [
    normalizeNamebaseKey(base?.id),
    normalizeNamebaseKey(base?.sourceId)
  ]).filter(Boolean));
  const nameCounts = new Map();
  const candidates = document.bases.map((base, index) => {
    const values = normalizeSourceValues(base?.source);
    const name = base?.name ? String(base.name) : `导入名称库 ${index + 1}`;
    const sourceKey = normalizeNamebaseKey(base?.id || base?.sourceId);
    const nameKey = normalizeNamebaseKey(name);
    if (nameKey) nameCounts.set(nameKey, (nameCounts.get(nameKey) || 0) + 1);
    return {
      index,
      valid: values.length > 0,
      name,
      id: String(base?.id || ""),
      kind: base?.kind || "generic",
      category: base?.category || "用户名称库",
      builtin: base?.builtin === true,
      samples: values.length,
      duplicateSamples: Math.max(0, values.length - new Set(values).size),
      conflictsExistingName: existingNameKeys.has(nameKey),
      conflictsExistingSource: sourceKey ? existingSourceKeys.has(sourceKey) : false
    };
  });
  const validCandidates = candidates.filter(item => item.valid);
  const repeatedNames = validCandidates.filter(item => (nameCounts.get(normalizeNamebaseKey(item.name)) || 0) > 1);
  return {
    filename: filename || "未命名文件",
    mode: mode === "replace" ? "replace" : "append",
    total: document.bases.length,
    valid: validCandidates.length,
    skipped: candidates.length - validCandidates.length,
    samples: validCandidates.reduce((sum, item) => sum + item.samples, 0),
    duplicateSamples: validCandidates.reduce((sum, item) => sum + item.duplicateSamples, 0),
    builtinRecords: validCandidates.filter(item => item.builtin).length,
    format: document.metadata?.format || "webgl-json",
    legacyErrors: Number(document.metadata?.legacyErrors) || 0,
    existingUserBases: userBases.length,
    replaceCount: mode === "replace" ? userBases.length : 0,
    existingConflicts: validCandidates.filter(item => item.conflictsExistingName || item.conflictsExistingSource).length,
    repeatedNames: repeatedNames.length,
    examples: validCandidates.slice(0, 6).map(item => ({
      name: item.name,
      samples: item.samples,
      category: item.category,
      conflict: item.conflictsExistingName || item.conflictsExistingSource
    }))
  };
}

export function copyBuiltinNamebaseToUser(map, id) {
  if (!map) throw new Error("当前没有可复制名称库的地图");
  const sourceBase = getBuiltinNamebaseSummaries({includeSource: true}).find(base => base.id === id);
  if (!sourceBase?.source?.length) return {copied: false, total: map.namebases?.bases?.length || 0, name: ""};
  const store = ensureNamebaseStore(map);
  const existingIds = new Set(store.bases.map(base => base.id));
  const copiedAt = new Date().toISOString();
  const copy = {
    id: uniqueId(`user-${sanitizeId(sourceBase.id)}`, existingIds),
    sourceId: sourceBase.id,
    name: `${sourceBase.name} 副本`,
    kind: sourceBase.kind,
    category: sourceBase.category,
    note: sourceBase.note || "",
    source: [...sourceBase.source],
    builtin: false,
    origin: "复制",
    importedAt: copiedAt,
    importedFrom: "内置名称库",
    minLength: sourceBase.minLength,
    maxLength: sourceBase.maxLength,
    duplicateChars: sourceBase.duplicateChars || "",
    legacyMultiwordRate: sourceBase.multiwordRate || 0
  };
  store.bases.push(copy);
  updateNamebaseMetadata(store);
  return {
    copied: true,
    total: store.bases.length,
    name: copy.name,
    id: copy.id
  };
}

export function createUserNamebase(map) {
  if (!map) throw new Error("当前没有可新建名称库的地图");
  const store = ensureNamebaseStore(map);
  const existingIds = new Set(store.bases.map(base => base.id));
  const createdAt = new Date().toISOString();
  const index = store.bases.length + 1;
  const base = {
    id: uniqueId(`user-namebase-${index}`, existingIds),
    name: `用户名称库 ${index}`,
    kind: "generic",
    category: "用户名称库",
    note: "手动创建的用户名称库",
    source: ["青川", "云泽", "鹿原", "玄岭", "白沙"],
    builtin: false,
    origin: "手动",
    importedAt: createdAt,
    importedFrom: "",
    minLength: 2,
    maxLength: 4,
    duplicateChars: "",
    legacyMultiwordRate: 0
  };
  store.bases.push(base);
  updateNamebaseMetadata(store);
  return {
    created: true,
    id: base.id,
    name: base.name,
    total: store.bases.length,
    samples: base.source.length
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

export function renameUserNamebase(map, id, name) {
  if (!map?.namebases || !Array.isArray(map.namebases.bases)) return {renamed: false, total: 0, name: ""};
  const nextName = String(name || "").trim();
  if (!nextName) throw new Error("名称库名称不能为空");
  const base = map.namebases.bases.find(item => item?.id === id && item?.builtin !== true);
  if (!base) return {renamed: false, total: map.namebases.bases.length, name: ""};
  const previousName = base.name || base.id || "";
  if (previousName === nextName) return {renamed: false, unchanged: true, total: map.namebases.bases.length, name: previousName};
  base.name = nextName;
  base.updatedAt = new Date().toISOString();
  updateNamebaseMetadata(map.namebases);
  return {
    renamed: true,
    total: map.namebases.bases.length,
    name: base.name,
    previousName
  };
}

export function updateUserNamebaseSource(map, id, sourceText) {
  if (!map?.namebases || !Array.isArray(map.namebases.bases)) return {updated: false, total: 0, samples: 0};
  const base = map.namebases.bases.find(item => item?.id === id && item?.builtin !== true);
  if (!base) return {updated: false, total: map.namebases.bases.length, samples: 0};
  const values = normalizeSourceValues(sourceText);
  if (!values.length) throw new Error("名称库至少需要一个样本");
  base.source = values;
  base.updatedAt = new Date().toISOString();
  updateNamebaseMetadata(map.namebases);
  return {
    updated: true,
    total: map.namebases.bases.length,
    samples: values.length,
    name: base.name || base.id || ""
  };
}

export function updateUserNamebaseOptions(map, id, options = {}) {
  if (!map?.namebases || !Array.isArray(map.namebases.bases)) return {updated: false, total: 0, name: ""};
  const base = map.namebases.bases.find(item => item?.id === id && item?.builtin !== true);
  if (!base) return {updated: false, total: map.namebases.bases.length, name: ""};
  const next = normalizeNamebaseGenerationOptions(options, summarizeNamebaseSource(base));
  base.minLength = next.minLength;
  base.maxLength = next.maxLength;
  base.duplicateChars = next.duplicateChars;
  base.legacyMultiwordRate = next.multiwordRate;
  base.multiwordRate = next.multiwordRate;
  base.updatedAt = new Date().toISOString();
  updateNamebaseMetadata(map.namebases);
  return {
    updated: true,
    total: map.namebases.bases.length,
    name: base.name || base.id || "",
    minLength: base.minLength,
    maxLength: base.maxLength,
    duplicateChars: base.duplicateChars,
    legacyMultiwordRate: base.legacyMultiwordRate
  };
}

export function getNamebaseSummariesForMap(map, options = {}) {
  const bindingStatus = getNamebaseBindingStatus(map);
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
  return [...builtinRows, ...customRows].map((row, index) => {
    const usage = bindingStatus.usageById[row.id] || [];
    return {
      ...row,
      index,
      bindingUsageCount: usage.length,
      bindingUsageLabel: usage.length ? usage.map(item => item.label).join("、") : "未绑定"
    };
  });
}

export function getNamebaseBindings(map) {
  return normalizeNamebaseBindings(map?.namebases?.bindings);
}

export function setNamebaseBinding(map, target, value, {cultureId = ""} = {}) {
  if (!map) throw new Error("当前没有可设置名称库绑定的地图");
  const store = ensureNamebaseStore(map);
  const targetKey = String(target || "").trim();
  if (!NAMEBASE_BINDING_TARGETS.some(item => item.key === targetKey)) throw new Error(`未知名称库绑定目标：${targetKey}`);
  const bindingValue = String(value || "").trim();
  if (cultureId !== "") {
    const cultureKey = String(cultureId);
    if (!store.bindings.cultures || typeof store.bindings.cultures !== "object") store.bindings.cultures = {};
    if (!store.bindings.cultures[cultureKey] || typeof store.bindings.cultures[cultureKey] !== "object") store.bindings.cultures[cultureKey] = {};
    store.bindings.cultures[cultureKey][targetKey] = bindingValue;
  } else {
    if (!store.bindings.global || typeof store.bindings.global !== "object") store.bindings.global = {};
    store.bindings.global[targetKey] = bindingValue;
  }
  updateNamebaseMetadata(store);
  return getNamebaseBindingStatus(map);
}

export function getNamebaseBindingStatus(map) {
  const bindings = getNamebaseBindings(map);
  const rows = [
    ...getBuiltinNamebaseSummaries({includeSource: false}),
    ...(map?.namebases?.bases || []).map(base => summarizeNamebaseSource(base, {includeSource: false}))
  ];
  const validIds = new Set(rows.map(row => row.id).filter(Boolean));
  const usageById = {};
  const invalid = [];
  const addUsage = (id, entry) => {
    if (!id) return;
    if (!validIds.has(id)) {
      invalid.push({...entry, id});
      return;
    }
    if (!usageById[id]) usageById[id] = [];
    usageById[id].push(entry);
  };
  for (const target of NAMEBASE_BINDING_TARGETS) {
    addUsage(bindings.global[target.key], {
      scope: "global",
      target: target.key,
      label: `全局${target.label}`
    });
  }
  for (const [cultureId, cultureBindings] of Object.entries(bindings.cultures)) {
    if (!cultureBindings || typeof cultureBindings !== "object") continue;
    for (const target of NAMEBASE_BINDING_TARGETS) {
      if (!["stateRoot", "place", "hydro"].includes(target.key)) continue;
      addUsage(cultureBindings[target.key], {
        scope: "culture",
        cultureId,
        target: target.key,
        label: `文化 #${cultureId} ${target.label}`
      });
    }
  }
  const used = Object.values(usageById).reduce((sum, entries) => sum + entries.length, 0);
  return {
    bindings,
    usageById,
    used,
    invalid,
    invalidCount: invalid.length
  };
}

export function createNamebaseGeneratedExamples(source, {count = 16, seed = "", salt = 0} = {}) {
  const entry = createNamebaseSourceEntry(source);
  const records = entry.records;
  if (!records.length) return [];
  const rng = createPreviewRng(`${seed}|${salt}|${records.map(formatNamebaseWeightedSample).join("|")}`);
  const result = [];
  const seen = new Set();
  const maxAttempts = Math.max(80, count * 24);
  for (let attempt = 0; result.length < count && attempt < maxAttempts; attempt += 1) {
    const candidate = generateNamebaseCandidate(rng, entry);
    const normalized = normalizePreviewName(candidate, entry);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  for (const record of records) {
    if (result.length >= count) break;
    const normalized = normalizePreviewName(record.value, entry);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
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

function normalizeNamebaseBindings(bindings) {
  const source = bindings && typeof bindings === "object" ? bindings : {};
  const global = source.global && typeof source.global === "object" ? source.global : {};
  const cultures = source.cultures && typeof source.cultures === "object" ? source.cultures : {};
  const normalizedCultures = {};
  for (const [cultureId, cultureBindings] of Object.entries(cultures)) {
    if (!cultureBindings || typeof cultureBindings !== "object") continue;
    normalizedCultures[String(cultureId)] = {};
    for (const target of NAMEBASE_BINDING_TARGETS) {
      normalizedCultures[String(cultureId)][target.key] = String(cultureBindings[target.key] || "").trim();
    }
  }
  return {
    global: Object.fromEntries(NAMEBASE_BINDING_TARGETS.map(target => [target.key, String(global[target.key] || "").trim()])),
    cultures: normalizedCultures
  };
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
  const values = normalizeSourceValues(base?.source);
  if (!values.length) return null;
  const id = uniqueId(`imported-${sanitizeId(base?.id || base?.name || `namebase-${index + 1}`)}`, existingIds);
  existingIds.add(id);
  const generationOptions = normalizeNamebaseGenerationOptions(base, summarizeNamebaseSource({source: values}));
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
    importedFrom: filename || "",
    legacyMultiwordRate: generationOptions.multiwordRate,
    ...generationOptions
  };
}

function normalizeSourceValues(source) {
  return parseNamebaseWeightedSamples(source, {dedupe: false})
    .map(formatNamebaseWeightedSample)
    .filter(Boolean);
}

function normalizePreviewName(value, options = {}) {
  const minLength = Math.max(1, Number(options.minLength) || 1);
  const maxLength = Math.max(minLength, Number(options.maxLength) || 12);
  const words = String(value || "").trim().split(/\s+/gu).filter(Boolean);
  const normalized = [];
  for (const word of words) {
    const chars = Array.from(word).slice(0, maxLength);
    if (chars.length < minLength || hasAdjacentRepeatedChar(chars, options.duplicateChars)) return "";
    normalized.push(chars.join(""));
  }
  return normalized.join(" ");
}

function hasAdjacentRepeatedChar(chars, duplicateChars = "") {
  const allowed = new Set(Array.from(String(duplicateChars || "")));
  for (let index = 1; index < chars.length; index += 1) {
    if (chars[index] === chars[index - 1] && !allowed.has(chars[index])) return true;
  }
  return false;
}

function createPreviewRng(seed) {
  let state = hashPreviewSeed(seed) || 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hashPreviewSeed(value) {
  let hash = 2166136261;
  for (const char of String(value || "")) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
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
    weightedSamples: summary.weightedSamples,
    weightedNameSamples: summary.weightedNameSamples,
    maxSampleWeight: summary.maxSampleWeight,
    chainDiversity: summary.chainDiversity,
    uniqueSamples: summary.uniqueSamples,
    duplicateSamples: summary.duplicateSamples,
    minLength: summary.minLength,
    maxLength: summary.maxLength,
    sampleMinLength: summary.sampleMinLength,
    sampleMaxLength: summary.sampleMaxLength,
    sampleMeanLength: summary.sampleMeanLength,
    sampleMedianLength: summary.sampleMedianLength,
    lengthOutlierSamples: summary.lengthOutlierSamples,
    lengthOutlierNames: summary.lengthOutlierNames || [],
    disallowedRepeatSamples: summary.disallowedRepeatSamples,
    disallowedRepeatNames: summary.disallowedRepeatNames || [],
    doubledChars: summary.doubledChars || [],
    unusualChars: summary.unusualChars || [],
    duplicateChars: summary.duplicateChars || "",
    multiwordRate: summary.multiwordRate || 0,
    note: summary.note,
    importedAt: base.importedAt || "",
    importedFrom: base.importedFrom || "",
    legacyMultiwordRate: summary.multiwordRate || 0,
    source: summary.source
  };
}

function parseLegacyNamebaseText(text) {
  const lines = text.replace(/\r\n|\r/g, "\n").split("\n").map(line => line.trim()).filter(Boolean);
  const bases = [];
  let legacyErrors = 0;
  lines.forEach((line, index) => {
    const parts = line.split("|");
    if (parts.length < 6) {
      legacyErrors += 1;
      return;
    }
    const [rawName, rawMin, rawMax, rawDuplicateChars, rawMultiwordRate, ...rawNamesParts] = parts;
    const name = sanitizeLegacyField(rawName);
    const source = normalizeSourceValues(rawNamesParts.join("|"));
    if (!name || !source.length) {
      legacyErrors += 1;
      return;
    }
    const minLength = Number(rawMin);
    const maxLength = Number(rawMax);
    bases.push({
      id: `legacy-${sanitizeId(name || `namebase-${index + 1}`)}`,
      name,
      kind: "generic",
      category: "原版名称库",
      builtin: false,
      minLength: Number.isFinite(minLength) ? minLength : 1,
      maxLength: Number.isFinite(maxLength) ? maxLength : 8,
      duplicateChars: sanitizeLegacyField(rawDuplicateChars),
      legacyMultiwordRate: Number(rawMultiwordRate) || 0,
      note: "从原版 name|min|max|d|m|names 文本导入",
      source
    });
  });
  if (!bases.length) throw new Error("未找到可导入的原版名称库行");
  return {
    type: NAMEBASE_DOCUMENT_TYPE,
    version: NAMEBASE_DOCUMENT_VERSION,
    importedAt: new Date().toISOString(),
    metadata: {
      format: "legacy-text",
      bases: bases.length,
      legacyLines: lines.length,
      legacyErrors
    },
    bases
  };
}

function formatLegacyNamebaseLine(base) {
  if (!base?.source?.length) return "";
  const records = parseNamebaseWeightedSamples(base.source, {dedupe: false});
  const names = records.map(record => sanitizeLegacyName(record.value)).filter(Boolean).join(",");
  if (!names) return "";
  const name = sanitizeLegacyField(base.name || base.id || "Namebase");
  const minLength = Math.max(1, Math.floor(Number(base.minLength ?? base.min ?? 1) || 1));
  const maxLength = Math.max(minLength, Math.floor(Number(base.maxLength ?? base.max ?? minLength) || minLength));
  const duplicateChars = sanitizeLegacyField(base.duplicateChars ?? base.d ?? "");
  const multiwordRate = Number(base.legacyMultiwordRate ?? base.m) || 0;
  return `${name}|${minLength}|${maxLength}|${duplicateChars}|${multiwordRate}|${names}`;
}

function sanitizeLegacyField(value) {
  return String(value || "").replace(/[|,\r\n]/g, "").trim();
}

function sanitizeLegacyName(value) {
  return String(value || "").replace(/[|,\r\n]/g, "").trim();
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

function normalizeNamebaseKey(value) {
  return String(value || "").trim().toLowerCase();
}
