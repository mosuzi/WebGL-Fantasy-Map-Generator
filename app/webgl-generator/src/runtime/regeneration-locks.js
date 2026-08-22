import {OBJECT_KIND} from "./object-kinds.js";

export const REGENERATION_LOCK_VERSION = 1;
export const REGENERATION_LOCK_KINDS = Object.freeze([
  OBJECT_KIND.STATE,
  OBJECT_KIND.PROVINCE,
  OBJECT_KIND.CITY,
  OBJECT_KIND.ROUTE,
  OBJECT_KIND.RIVER,
  OBJECT_KIND.MARKER,
  OBJECT_KIND.DIPLOMACY_RELATION,
  OBJECT_KIND.RELIGION,
  OBJECT_KIND.CULTURE,
  OBJECT_KIND.MILITARY,
  OBJECT_KIND.ZONE,
  OBJECT_KIND.FEATURE,
  OBJECT_KIND.OCEAN_CURRENT,
  OBJECT_KIND.ECONOMY_MARKET,
  OBJECT_KIND.TRADE_FLOW
]);

const NUMERIC_ID_KINDS = new Set([
  OBJECT_KIND.STATE,
  OBJECT_KIND.PROVINCE,
  OBJECT_KIND.CITY,
  OBJECT_KIND.ROUTE,
  OBJECT_KIND.RIVER,
  OBJECT_KIND.MARKER,
  OBJECT_KIND.RELIGION,
  OBJECT_KIND.CULTURE,
  OBJECT_KIND.ZONE,
  OBJECT_KIND.FEATURE,
  OBJECT_KIND.ECONOMY_MARKET,
  OBJECT_KIND.TRADE_FLOW
]);

export function createEmptyRegenerationLockStore() {
  return {version: REGENERATION_LOCK_VERSION, entries: []};
}

export function normalizeRegenerationLockStore(source, map = null, {strict = false} = {}) {
  const entries = Array.isArray(source?.entries) ? source.entries : [];
  const normalized = [];
  const rejected = [];
  const seen = new Set();
  const existenceIndex = map ? new Map() : null;

  for (let index = 0; index < entries.length; index++) {
    try {
      const entry = normalizeRegenerationLockReference(entries[index]);
      if (map && !regenerationLockObjectExists(map, entry, existenceIndex)) throw lockError("object_not_found", `找不到可锁定对象：${entry.kind} #${entry.id}`, {entry, index});
      const key = regenerationLockKey(entry);
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.push(entry);
    } catch (error) {
      rejected.push({index, entry: clonePlain(entries[index]), code: error.code || "lock_batch_invalid", message: error.message});
    }
  }

  if (strict && rejected.length) {
    throw lockError("lock_batch_invalid", "锁定批次包含非法或不存在的对象", {rejected});
  }

  normalized.sort(compareRegenerationLockEntries);
  return {
    store: {version: REGENERATION_LOCK_VERSION, entries: normalized},
    diagnostics: {
      input: entries.length,
      kept: normalized.length,
      removed: rejected.length,
      rejected
    }
  };
}

export function validateRegenerationLockStore(source, map = null) {
  if (!source || typeof source !== "object" || Array.isArray(source)) throw lockError("lock_batch_invalid", "重生成锁仓必须是对象");
  if (Number(source.version) !== REGENERATION_LOCK_VERSION) throw lockError("lock_batch_invalid", `不支持的重生成锁仓版本：${source.version}`);
  if (!Array.isArray(source.entries)) throw lockError("lock_batch_invalid", "重生成锁仓 entries 必须是数组");
  return normalizeRegenerationLockStore(source, map, {strict: true}).store;
}

export function normalizeRegenerationLockReference(reference) {
  if (!reference || typeof reference !== "object" || Array.isArray(reference)) {
    throw lockError("lock_batch_invalid", "锁定对象引用必须是 {kind, id}");
  }
  const kind = String(reference.kind || "").trim();
  if (!REGENERATION_LOCK_KINDS.includes(kind)) {
    throw lockError("unsupported_lock_kind", `不支持重生成锁定的对象类型：${kind || "(empty)"}`, {kind});
  }
  if (kind === OBJECT_KIND.DIPLOMACY_RELATION) return {kind, id: normalizeDiplomacyPairId(reference)};
  if (kind === OBJECT_KIND.MILITARY) return {kind, id: normalizeMilitaryId(reference)};
  if (kind === OBJECT_KIND.OCEAN_CURRENT) {
    const id = String(reference.id ?? "").trim();
    if (!id) throw lockError("lock_batch_invalid", "洋流锁定引用缺少 id");
    return {kind, id};
  }
  if (NUMERIC_ID_KINDS.has(kind)) {
    const id = Number(reference.id);
    if (!Number.isInteger(id) || id < 0 || ([OBJECT_KIND.STATE, OBJECT_KIND.PROVINCE, OBJECT_KIND.CULTURE, OBJECT_KIND.RELIGION, OBJECT_KIND.ECONOMY_MARKET].includes(kind) && id === 0)) {
      throw lockError("lock_batch_invalid", `${kind} 锁定 id 必须是有效整数`, {kind, id: reference.id});
    }
    return {kind, id};
  }
  throw lockError("unsupported_lock_kind", `不支持重生成锁定的对象类型：${kind}`, {kind});
}

export function normalizeRegenerationLockReferences(references, map, {allowEmpty = false} = {}) {
  if (!Array.isArray(references)) throw lockError("lock_batch_invalid", "锁定批次必须是数组");
  if (!allowEmpty && !references.length) throw lockError("lock_batch_empty", "锁定批次不能为空");
  return normalizeRegenerationLockStore({version: REGENERATION_LOCK_VERSION, entries: references}, map, {strict: true}).store.entries;
}

export function listRegenerationLocks(map, {kind = null} = {}) {
  const store = ensureRegenerationLockStore(map);
  const normalizedKind = kind == null ? null : assertRegenerationLockKind(kind);
  return store.entries.filter(entry => !normalizedKind || entry.kind === normalizedKind).map(entry => ({...entry}));
}

export function getRegenerationLockStatus(map, reference) {
  const entry = normalizeRegenerationLockReference(reference);
  if (!regenerationLockObjectExists(map, entry)) throw lockError("object_not_found", `找不到可锁定对象：${entry.kind} #${entry.id}`, {entry});
  const locked = ensureRegenerationLockStore(map).entries.some(item => regenerationLockKey(item) === regenerationLockKey(entry));
  return {reference: entry, locked};
}

export function ensureRegenerationLockStore(map) {
  if (!map || typeof map !== "object") throw lockError("map_unavailable", "当前没有可用地图");
  const normalized = normalizeRegenerationLockStore(map.regenerationLocks, map);
  if (isCanonicalRegenerationLockStore(map.regenerationLocks, normalized)) return map.regenerationLocks;
  map.regenerationLocks = normalized.store;
  return map.regenerationLocks;
}

function isCanonicalRegenerationLockStore(source, normalized) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return false;
  if (source.version !== REGENERATION_LOCK_VERSION || !Array.isArray(source.entries)) return false;
  if (Object.keys(source).length !== 2
    || !Object.prototype.hasOwnProperty.call(source, "version")
    || !Object.prototype.hasOwnProperty.call(source, "entries")) return false;
  if (normalized.diagnostics.removed || source.entries.length !== normalized.store.entries.length) return false;
  return source.entries.every((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    if (Object.keys(entry).length !== 2
      || !Object.prototype.hasOwnProperty.call(entry, "kind")
      || !Object.prototype.hasOwnProperty.call(entry, "id")) return false;
    const expected = normalized.store.entries[index];
    return entry.kind === expected.kind && Object.is(entry.id, expected.id);
  });
}

export function regenerationLockObjectExists(map, reference, existenceIndex = null) {
  const {kind, id} = normalizeRegenerationLockReference(reference);
  if (existenceIndex) return regenerationLockExistenceSet(map, kind, existenceIndex).has(existenceKey(kind, id));
  if (kind === OBJECT_KIND.STATE) return activeIndexed(map?.politics?.states, id);
  if (kind === OBJECT_KIND.PROVINCE) return activeIndexed(map?.politics?.provinces, id);
  if (kind === OBJECT_KIND.CITY) return findById(map?.settlements?.cities, id);
  if (kind === OBJECT_KIND.ROUTE) return findById(map?.settlements?.routes, id);
  if (kind === OBJECT_KIND.RIVER) return findById(map?.rivers?.rivers, id);
  if (kind === OBJECT_KIND.MARKER) return findById(map?.markers?.markers, id);
  if (kind === OBJECT_KIND.CULTURE) return activeIndexed(map?.society?.cultures, id);
  if (kind === OBJECT_KIND.RELIGION) return activeIndexed(map?.society?.religions, id);
  if (kind === OBJECT_KIND.ZONE) return findById(map?.zones?.zones || map?.pack?.zones, id);
  if (kind === OBJECT_KIND.FEATURE) return activeIndexed(map?.pack?.features, id);
  if (kind === OBJECT_KIND.OCEAN_CURRENT) return (map?.oceanCurrents?.currents || []).some(item => String(item?.id) === String(id));
  if (kind === OBJECT_KIND.ECONOMY_MARKET) return activeIndexed(map?.pack?.markets || map?.economy?.markets, id);
  if (kind === OBJECT_KIND.TRADE_FLOW) return findById(map?.pack?.deals, id);
  if (kind === OBJECT_KIND.DIPLOMACY_RELATION) {
    const [left, right] = String(id).split(":").map(Number);
    return activeIndexed(map?.politics?.states, left) && activeIndexed(map?.politics?.states, right);
  }
  if (kind === OBJECT_KIND.MILITARY) {
    const [stateId, regimentId] = String(id).split(":").map(Number);
    const state = map?.politics?.states?.[stateId] || map?.pack?.states?.[stateId];
    return Boolean(state && !state.removed && (state.military || []).some(item => Number(item?.i) === regimentId || String(item?.id) === String(id)));
  }
  return false;
}

function regenerationLockExistenceSet(map, kind, existenceIndex) {
  const cached = existenceIndex.get(kind);
  if (cached) return cached;
  let values;
  if (kind === OBJECT_KIND.STATE) values = activeIndexedIds(map?.politics?.states);
  else if (kind === OBJECT_KIND.PROVINCE) values = activeIndexedIds(map?.politics?.provinces);
  else if (kind === OBJECT_KIND.CITY) values = objectIds(map?.settlements?.cities);
  else if (kind === OBJECT_KIND.ROUTE) values = objectIds(map?.settlements?.routes);
  else if (kind === OBJECT_KIND.RIVER) values = objectIds(map?.rivers?.rivers);
  else if (kind === OBJECT_KIND.MARKER) values = objectIds(map?.markers?.markers);
  else if (kind === OBJECT_KIND.CULTURE) values = activeIndexedIds(map?.society?.cultures);
  else if (kind === OBJECT_KIND.RELIGION) values = activeIndexedIds(map?.society?.religions);
  else if (kind === OBJECT_KIND.ZONE) values = objectIds(map?.zones?.zones || map?.pack?.zones);
  else if (kind === OBJECT_KIND.FEATURE) values = activeIndexedIds(map?.pack?.features);
  else if (kind === OBJECT_KIND.OCEAN_CURRENT) values = stringIds(map?.oceanCurrents?.currents);
  else if (kind === OBJECT_KIND.ECONOMY_MARKET) values = activeIndexedIds(map?.pack?.markets || map?.economy?.markets);
  else if (kind === OBJECT_KIND.TRADE_FLOW) values = objectIds(map?.pack?.deals);
  else if (kind === OBJECT_KIND.DIPLOMACY_RELATION) values = diplomacyPairIds(map, existenceIndex);
  else if (kind === OBJECT_KIND.MILITARY) values = militaryIds(map);
  else values = new Set();
  existenceIndex.set(kind, values);
  return values;
}

function activeIndexedIds(items) {
  const ids = new Set();
  const occupiedSlots = new Set();
  for (let index = 0; index < (items?.length || 0); index++) {
    const item = items[index];
    if (!item) continue;
    occupiedSlots.add(index);
    if (!item.removed) ids.add(index);
  }
  const matchedIds = new Set();
  for (const item of items || []) {
    if (!item) continue;
    const id = Number(item.id ?? item.i);
    if (!Number.isInteger(id) || occupiedSlots.has(id) || matchedIds.has(id)) continue;
    matchedIds.add(id);
    if (!item.removed) ids.add(id);
  }
  return ids;
}

function objectIds(items) {
  const ids = new Set();
  for (const item of items || []) {
    if (!item || item.removed) continue;
    const id = Number(item.id ?? item.i);
    if (Number.isInteger(id)) ids.add(id);
  }
  return ids;
}

function stringIds(items) {
  const ids = new Set();
  for (const item of items || []) {
    if (!item) continue;
    const id = String(item.id ?? "").trim();
    if (id) ids.add(id);
  }
  return ids;
}

function diplomacyPairIds(map, existenceIndex) {
  const stateIds = regenerationLockExistenceSet(map, OBJECT_KIND.STATE, existenceIndex);
  const ids = [...stateIds].filter(id => Number.isInteger(id) && id > 0).sort((left, right) => left - right);
  const pairs = new Set();
  for (let left = 0; left < ids.length; left++) {
    for (let right = left + 1; right < ids.length; right++) pairs.add(`${ids[left]}:${ids[right]}`);
  }
  return pairs;
}

function militaryIds(map) {
  const ids = new Set();
  const politicsStates = map?.politics?.states;
  const packStates = map?.pack?.states;
  const length = Math.max(politicsStates?.length || 0, packStates?.length || 0);
  for (let stateId = 0; stateId < length; stateId++) {
    const state = politicsStates?.[stateId] || packStates?.[stateId];
    if (!state || state.removed) continue;
    for (const regiment of state.military || []) {
      const regimentId = Number(regiment?.i);
      if (Number.isInteger(regimentId) && regimentId >= 0) ids.add(`${stateId}:${regimentId}`);
      const storedId = String(regiment?.id ?? "");
      if (storedId.startsWith(`${stateId}:`)) ids.add(storedId);
    }
  }
  return ids;
}

function existenceKey(kind, id) {
  if (kind === OBJECT_KIND.DIPLOMACY_RELATION || kind === OBJECT_KIND.MILITARY || kind === OBJECT_KIND.OCEAN_CURRENT) return String(id);
  return Number(id);
}

export function regenerationLockKey(reference) {
  const entry = normalizeRegenerationLockReference(reference);
  return `${entry.kind}\u0000${String(entry.id)}`;
}

export function removeRegenerationLocks(map, references) {
  const store = ensureRegenerationLockStore(map);
  const keys = new Set((references || []).map(regenerationLockKey));
  if (!keys.size) return [];
  const removed = store.entries.filter(entry => keys.has(regenerationLockKey(entry)));
  if (removed.length) store.entries = store.entries.filter(entry => !keys.has(regenerationLockKey(entry)));
  return removed.map(entry => ({...entry}));
}

export function restoreRegenerationLocks(map, entries) {
  const current = ensureRegenerationLockStore(map).entries;
  map.regenerationLocks = normalizeRegenerationLockStore({
    version: REGENERATION_LOCK_VERSION,
    entries: [...current, ...(entries || [])]
  }, map, {strict: true}).store;
}

export function assertRegenerationLockKind(kind) {
  const value = String(kind || "").trim();
  if (!REGENERATION_LOCK_KINDS.includes(value)) throw lockError("unsupported_lock_kind", `不支持重生成锁定的对象类型：${value || "(empty)"}`, {kind: value});
  return value;
}

export function createRegenerationLockInspection(map, revision, references, locked) {
  const normalized = normalizeRegenerationLockReferences(references, map);
  const store = ensureRegenerationLockStore(map);
  const current = new Set(store.entries.map(regenerationLockKey));
  const changed = normalized.filter(reference => current.has(regenerationLockKey(reference)) !== Boolean(locked));
  return {
    revision: Number(revision) || 0,
    locked: Boolean(locked),
    references: normalized,
    changed: changed.length,
    unchanged: normalized.length - changed.length,
    inspectionToken: `${Number(revision) || 0}:${simpleHash(JSON.stringify({locked: Boolean(locked), references: normalized}))}`
  };
}

export function assertRegenerationLockInspection(inspection, revision, references, locked) {
  if (!inspection) return;
  const normalized = references.map(normalizeRegenerationLockReference).sort(compareRegenerationLockEntries);
  const currentToken = `${Number(revision) || 0}:${simpleHash(JSON.stringify({locked: Boolean(locked), references: normalized}))}`;
  const expected = String(inspection.inspectionToken || inspection);
  if (Number(inspection.revision ?? revision) !== Number(revision) || expected !== currentToken) {
    throw lockError("inspection_stale", "重生成锁定预检已过期，请重新预检");
  }
}

export function lockError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  if (details) error.details = details;
  return error;
}

function normalizeDiplomacyPairId(reference) {
  const raw = String(reference.id ?? "");
  const parts = raw.split(":");
  const left = Number(reference.subjectId ?? parts[0]);
  const right = Number(reference.objectId ?? reference.targetId ?? parts[1]);
  if (!Number.isInteger(left) || !Number.isInteger(right) || left <= 0 || right <= 0 || left === right) {
    throw lockError("lock_batch_invalid", "外交关系锁定引用必须包含两个不同的有效国家 id");
  }
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

function normalizeMilitaryId(reference) {
  const raw = String(reference.id ?? "");
  const parts = raw.split(":");
  const stateId = Number(reference.stateId ?? reference.state ?? parts[0]);
  const regimentId = Number(reference.regimentId ?? reference.i ?? parts[1]);
  if (!Number.isInteger(stateId) || stateId <= 0 || !Number.isInteger(regimentId) || regimentId < 0) {
    throw lockError("lock_batch_invalid", "军事锁定引用必须包含有效的国家和军团 id");
  }
  return `${stateId}:${regimentId}`;
}

function compareRegenerationLockEntries(left, right) {
  return left.kind.localeCompare(right.kind) || compareIds(left.id, right.id);
}

function compareIds(left, right) {
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right), "en", {numeric: true});
}

function activeIndexed(items, id) {
  const item = items?.[Number(id)] || (items || []).find(entry => Number(entry?.id ?? entry?.i) === Number(id));
  return Boolean(item && !item.removed);
}

function findById(items, id) {
  return Boolean((items || []).find(item => item && !item.removed && Number(item.id ?? item.i) === Number(id)));
}

function clonePlain(value) {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function simpleHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
