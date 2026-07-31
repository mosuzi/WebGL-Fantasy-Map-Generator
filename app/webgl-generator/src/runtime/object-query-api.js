import {diplomacyRelationId} from "./diplomacy-relations.js";
import {LABEL_TARGET_KIND, OBJECT_KIND, OBJECT_KIND_LABEL} from "./object-kinds.js";
import {resolveObject} from "./object-resolver.js";
import {REGENERATION_LOCK_KINDS, regenerationLockKey} from "./regeneration-locks.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const FIELD_WHITELISTS = Object.freeze({
  [OBJECT_KIND.CITY]: ["kind", "id", "name", "type", "population", "stateId", "state", "provinceId", "province", "emblem"],
  [OBJECT_KIND.LABEL]: ["kind", "id", "text", "targetKind", "targetId", "targetName", "rank", "x", "y"],
  [OBJECT_KIND.MARKER]: ["kind", "id", "type", "label", "icon", "category", "categoryLabel", "resourceKey", "resourceLabel", "economicValue", "name", "cell", "packCell", "stateId", "state", "provinceId", "province", "x", "y"],
  [OBJECT_KIND.NOTE]: ["kind", "id", "noteId", "name", "body", "packCell", "x", "y", "standalone"],
  [OBJECT_KIND.ROUTE]: ["kind", "id", "type", "level", "fromId", "toId", "from", "to", "length", "points"],
  [OBJECT_KIND.TRADE_FLOW]: ["kind", "id", "goodId", "goodName", "sellerType", "sellerId", "sellerName", "buyerType", "buyerId", "buyerName", "units", "basePrice", "price", "value", "tradeDistance", "distanceCost", "distanceMultiplier", "tax", "source", "sourceLabel", "from", "to"],
  [OBJECT_KIND.ECONOMY_MARKET]: ["kind", "id", "name", "stateId", "state", "centerBurgId", "centerBurg", "cell", "color", "goods", "demand", "supply", "shortage", "surplus"],
  [OBJECT_KIND.RIVER]: ["kind", "id", "name", "type", "parentId", "parentName", "parentExists", "basinId", "basinName", "confluence", "outletKind", "outletFeatureId", "networkStatus", "networkIssue", "flux", "discharge", "length", "segments", "widthFactor", "hydrology", "source", "mouth", "points"],
  [OBJECT_KIND.LAKE]: ["kind", "id", "name", "type", "cells", "area", "height", "flux", "evaporation", "firstCell"],
  [OBJECT_KIND.FEATURE]: ["kind", "id", "name", "type", "group", "land", "border", "cells", "area", "height", "firstCell"],
  [OBJECT_KIND.OCEAN_CURRENT]: ["kind", "id", "name", "temperature", "hemisphere", "circulation", "strength", "basinFeatureId", "westernBoundary", "points"],
  [OBJECT_KIND.MEASUREMENT]: ["kind", "id", "name", "type", "pointCount", "displayPointCount", "distance", "area", "points", "summary"],
  [OBJECT_KIND.MILITARY]: ["kind", "id", "regimentId", "stateId", "name", "state", "type", "status", "statusLabel", "dominantUnit", "dominantUnitLabel", "troops", "units", "icon", "iconVariant", "iconLabel", "x", "y", "cell", "suitability", "movementSpeed"],
  [OBJECT_KIND.DIPLOMACY_RELATION]: ["kind", "id", "subjectId", "objectId", "subjectName", "objectName", "name", "relation", "relationLabel", "relationColor", "relationPolarity", "from", "to"],
  [OBJECT_KIND.STATE]: ["kind", "id", "name", "fullName", "formName", "governmentKey", "government", "capitalId", "capitalName", "cultureId", "culture", "religionId", "religion", "centerCell", "emblem"],
  [OBJECT_KIND.PROVINCE]: ["kind", "id", "name", "state", "stateId", "centerCell", "pole"],
  [OBJECT_KIND.CULTURE]: ["kind", "id", "name", "type", "nameStyle", "centerCell", "gridCenterCell", "cells", "population"],
  [OBJECT_KIND.RELIGION]: ["kind", "id", "name", "type", "form", "cultureId", "culture", "centerCell", "gridCenterCell", "cells", "population"],
  [OBJECT_KIND.REGION]: ["kind", "id", "name", "type"],
  [OBJECT_KIND.ZONE]: ["kind", "id", "name", "type", "category", "source", "customTypeName", "description", "coverage", "effects", "pattern", "color", "cells", "status", "statusLabel", "summary", "participants", "missingRoles", "context"]
});
for (const kind of REGENERATION_LOCK_KINDS) {
  if (FIELD_WHITELISTS[kind] && !FIELD_WHITELISTS[kind].includes("regenerationLocked")) FIELD_WHITELISTS[kind].push("regenerationLocked");
}

const OBJECT_TYPES = Object.freeze(Object.keys(FIELD_WHITELISTS));
const HEAVY_FIELDS = new Set(["points", "hydrology", "summary", "units", "cells"]);

export function listObjectTypes() {
  return OBJECT_TYPES.map(type => ({
    type,
    label: OBJECT_KIND_LABEL[type] || type,
    reference: {kind: type, id: "string-or-number"},
    fields: [...FIELD_WHITELISTS[type]]
  }));
}

export function getObjectSnapshot(map, reference) {
  assertMap(map);
  const normalized = normalizeReference(reference);
  const resolved = resolveObject(map, normalized);
  if (!resolved) throw apiError("not_found", `找不到对象 ${normalized.kind} #${normalized.id}`);
  return projectObject(normalized.kind, resolved, FIELD_WHITELISTS[normalized.kind], map);
}

export function listObjectSnapshots(map, type, options = {}) {
  const normalizedType = normalizeType(type);
  return queryObjectSnapshots(map, {type: normalizedType}, options);
}

export function queryObjectSnapshots(map, query = {}, options = {}) {
  assertMap(map);
  const normalizedQuery = normalizeQuery(query);
  const limit = normalizeLimit(options.limit);
  const fields = normalizeProjectionFields(normalizedQuery.types, options.fields);
  const signature = querySignature(normalizedQuery, fields);
  const cursor = decodeCursor(options.cursor, signature);
  const references = normalizedQuery.types
    .flatMap(type => collectObjectReferences(map, type))
    .sort(compareReferences);
  const afterIndex = cursor?.lastKey ? references.findIndex(reference => referenceKey(reference) > cursor.lastKey) : 0;
  const start = afterIndex < 0 ? references.length : afterIndex;
  const items = [];
  let scanIndex = start;
  let lastKey = cursor?.lastKey || "";
  while (scanIndex < references.length && items.length < limit) {
    const reference = references[scanIndex++];
    lastKey = referenceKey(reference);
    const resolved = resolveObject(map, reference);
    if (!resolved) continue;
    const full = projectObject(reference.kind, resolved, FIELD_WHITELISTS[reference.kind], map);
    if (!matchesQuery(full, normalizedQuery)) continue;
    items.push(projectObject(reference.kind, resolved, fields, map));
  }
  let hasMore = false;
  for (let index = scanIndex; index < references.length; index++) {
    const resolved = resolveObject(map, references[index]);
    if (resolved && matchesQuery(projectObject(references[index].kind, resolved, FIELD_WHITELISTS[references[index].kind], map), normalizedQuery)) {
      hasMore = true;
      break;
    }
  }
  return {
    items,
    page: {
      limit,
      returned: items.length,
      hasMore,
      nextCursor: hasMore ? encodeCursor({signature, lastKey}) : null,
      fields: [...fields]
    },
    query: {
      types: [...normalizedQuery.types],
      text: normalizedQuery.text,
      where: {...normalizedQuery.where}
    }
  };
}

export function assertJsonSafeObjectSnapshot(value) {
  const stack = [value];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    if (current instanceof Map || current instanceof Set || ArrayBuffer.isView(current)) throw new Error("对象查询结果包含内部容器");
    stack.push(...Object.values(current));
  }
  JSON.stringify(value);
  return true;
}

function collectObjectReferences(map, type) {
  if (type === OBJECT_KIND.CITY) return compactArray(map?.settlements?.cities).map(item => reference(type, item.id ?? item.i));
  if (type === OBJECT_KIND.MARKER) return compactArray(map?.markers?.markers).map(item => reference(type, item.id ?? item.i));
  if (type === OBJECT_KIND.ROUTE) return compactArray(map?.settlements?.routes).map(item => reference(type, item.id ?? item.i));
  if (type === OBJECT_KIND.TRADE_FLOW) return compactArray(map?.pack?.deals).map(item => reference(type, item.i ?? item.id));
  if (type === OBJECT_KIND.ECONOMY_MARKET) return compactArray(map?.pack?.markets || map?.economy?.markets).filter(item => !item.removed).map(item => reference(type, item.i ?? item.id));
  if (type === OBJECT_KIND.RIVER) return compactArray(map?.rivers?.rivers).map(item => reference(type, item.id ?? item.i));
  if (type === OBJECT_KIND.LAKE) return compactArray(map?.pack?.features).filter(item => item.type === "lake" && !item.removed).map(item => reference(type, item.i ?? item.id));
  if (type === OBJECT_KIND.FEATURE) return compactArray(map?.pack?.features).filter(item => !item.removed).map(item => reference(type, item.i ?? item.id));
  if (type === OBJECT_KIND.OCEAN_CURRENT) return compactArray(map?.oceanCurrents?.currents).map(item => reference(type, item.id));
  if (type === OBJECT_KIND.MEASUREMENT) return compactArray(map?.measurements?.items).map(item => reference(type, item.id));
  if (type === OBJECT_KIND.STATE) return indexedReferences(map?.politics?.states, type, item => !item.removed);
  if (type === OBJECT_KIND.PROVINCE) return indexedReferences(map?.politics?.provinces, type, item => !item.removed);
  if (type === OBJECT_KIND.CULTURE) return indexedReferences(map?.society?.cultures, type, item => Number(item.i ?? item.id) > 0 && !item.removed);
  if (type === OBJECT_KIND.RELIGION) return indexedReferences(map?.society?.religions, type, item => Number(item.i ?? item.id) > 0 && !item.removed);
  if (type === OBJECT_KIND.REGION) return indexedReferences(map?.politics?.regions, type, item => !item.removed);
  if (type === OBJECT_KIND.ZONE) return compactArray(map?.zones?.zones || map?.pack?.zones).map(item => reference(type, item.i ?? item.id));
  if (type === OBJECT_KIND.NOTE) {
    return compactArray(map?.notes?.notes)
      .filter(item => item.kind === OBJECT_KIND.NOTE && item.standalone === true)
      .map(item => reference(type, item.objectId ?? item.id));
  }
  if (type === OBJECT_KIND.MILITARY) {
    return compactArray(map?.politics?.states).flatMap(state => compactArray(state.military).map(item => ({
      kind: type,
      id: item.id ?? `${state.id ?? state.i}:${item.i}`,
      stateId: state.id ?? state.i,
      regimentId: item.i
    })));
  }
  if (type === OBJECT_KIND.DIPLOMACY_RELATION) {
    const states = compactArray(map?.politics?.states).filter(item => Number(item.id ?? item.i) > 0 && !item.removed);
    return states.flatMap(subject => states
      .filter(target => Number(target.id ?? target.i) !== Number(subject.id ?? subject.i))
      .map(target => {
        const subjectId = Number(subject.id ?? subject.i);
        const objectId = Number(target.id ?? target.i);
        return {kind: type, id: diplomacyRelationId(subjectId, objectId), subjectId, objectId};
      }));
  }
  if (type === OBJECT_KIND.LABEL) return collectLabelReferences(map);
  return [];
}

function collectLabelReferences(map) {
  return [
    ...compactArray(map?.labels?.custom).map(item => ({kind: OBJECT_KIND.LABEL, id: item.id, targetKind: LABEL_TARGET_KIND.CUSTOM, targetId: item.id})),
    ...indexedReferences(map?.politics?.states, OBJECT_KIND.LABEL, item => Number(item.id ?? item.i) > 0 && !item.removed)
      .map(item => ({...item, targetKind: LABEL_TARGET_KIND.STATE, targetId: item.id})),
    ...indexedReferences(map?.politics?.provinces, OBJECT_KIND.LABEL, item => Number(item.id ?? item.i) > 0 && !item.removed)
      .map(item => ({...item, targetKind: LABEL_TARGET_KIND.PROVINCE, targetId: item.id})),
    ...compactArray(map?.zones?.zones || map?.pack?.zones).map(item => ({kind: OBJECT_KIND.LABEL, id: item.i ?? item.id, targetKind: LABEL_TARGET_KIND.ZONE, targetId: item.i ?? item.id})),
    ...compactArray(map?.settlements?.cities).map(item => ({kind: OBJECT_KIND.LABEL, id: item.id, targetKind: LABEL_TARGET_KIND.CITY, targetId: item.id}))
  ];
}

function indexedReferences(values, kind, include) {
  return compactArray(values)
    .filter(include)
    .map((item, index) => reference(kind, item.id ?? item.i ?? index));
}

function compactArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function reference(kind, id) {
  return {kind, id};
}

function normalizeReference(value) {
  if (!value || typeof value !== "object") throw apiError("invalid_argument", "对象引用必须是 {kind, id}");
  const kind = normalizeType(value.kind);
  if (value.id === undefined || value.id === null || value.id === "") throw apiError("invalid_argument", "对象引用缺少 id");
  return {...toJsonValue(value), kind};
}

function normalizeType(value) {
  const type = String(value || "").trim();
  if (!FIELD_WHITELISTS[type]) throw apiError("invalid_argument", `不支持的对象类型：${type || "(empty)"}`);
  return type;
}

function normalizeQuery(query) {
  if (!query || typeof query !== "object" || Array.isArray(query)) throw apiError("invalid_argument", "对象查询必须是对象");
  const requested = query.types ?? (query.type ? [query.type] : OBJECT_TYPES);
  if (!Array.isArray(requested) || !requested.length) throw apiError("invalid_argument", "对象查询至少需要一个类型");
  const types = [...new Set(requested.map(normalizeType))].sort();
  const text = String(query.text || "").trim().toLocaleLowerCase();
  const where = query.where && typeof query.where === "object" && !Array.isArray(query.where) ? {...query.where} : {};
  for (const [field, value] of Object.entries(where)) {
    if (!types.every(type => FIELD_WHITELISTS[type].includes(field))) throw apiError("invalid_argument", `查询字段未进入全部目标类型白名单：${field}`);
    if (value !== null && !["string", "number", "boolean"].includes(typeof value)) throw apiError("invalid_argument", `查询字段只支持标量：${field}`);
  }
  return {types, text, where};
}

function matchesQuery(item, query) {
  if (query.text) {
    const haystack = [item.name, item.text, item.label, item.type, item.kind].filter(value => value !== undefined).join("\n").toLocaleLowerCase();
    if (!haystack.includes(query.text)) return false;
  }
  return Object.entries(query.where).every(([field, value]) => item[field] === value);
}

function projectObject(kind, object, selectedFields = FIELD_WHITELISTS[kind], map = null) {
  const fields = FIELD_WHITELISTS[kind].filter(field => selectedFields.includes(field));
  const result = {};
  for (const field of fields) {
    if (object[field] === undefined) continue;
    result[field] = toJsonValue(object[field]);
  }
  result.kind = kind;
  if (result.id === undefined) result.id = toJsonValue(object.id);
  if (selectedFields.includes("regenerationLocked") && REGENERATION_LOCK_KINDS.includes(kind)) {
    try {
      const keys = new Set((map?.regenerationLocks?.entries || []).map(regenerationLockKey));
      result.regenerationLocked = keys.has(regenerationLockKey(object));
    } catch {
      result.regenerationLocked = false;
    }
  }
  assertJsonSafeObjectSnapshot(result);
  return result;
}

function toJsonValue(value) {
  if (value === null || value === undefined || ["string", "number", "boolean"].includes(typeof value)) return value;
  if (ArrayBuffer.isView(value)) return Array.from(value, item => toJsonValue(item));
  if (Array.isArray(value)) return value.map(item => toJsonValue(item));
  if (value instanceof Map) return Object.fromEntries([...value.entries()].map(([key, item]) => [String(key), toJsonValue(item)]));
  if (value instanceof Set) return [...value].map(item => toJsonValue(item));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJsonValue(item)]));
  return String(value);
}

function normalizeLimit(value) {
  const number = Number(value ?? DEFAULT_LIMIT);
  if (!Number.isInteger(number) || number < 1 || number > MAX_LIMIT) throw apiError("invalid_argument", `limit 必须是 1..${MAX_LIMIT} 的整数`);
  return number;
}

function normalizeProjectionFields(types, value) {
  if (value === undefined || value === null) {
    return [...new Set(types.flatMap(type => FIELD_WHITELISTS[type].filter(field => !HEAVY_FIELDS.has(field))))].sort();
  }
  if (!Array.isArray(value) || !value.length) throw apiError("invalid_argument", "fields 必须是非空字段数组");
  const available = new Set(types.flatMap(type => FIELD_WHITELISTS[type]));
  const fields = [...new Set(value.map(field => String(field || "").trim()))];
  const unknown = fields.filter(field => !available.has(field));
  if (unknown.length) throw apiError("invalid_argument", `对象查询字段不在白名单：${unknown.join(", ")}`);
  return [...new Set(["kind", "id", ...fields])].sort();
}

function querySignature(query, fields) {
  return JSON.stringify({types: query.types, text: query.text, where: Object.entries(query.where).sort(([left], [right]) => left.localeCompare(right)), fields});
}

function referenceKey(value) {
  const targetKind = value.targetKind ? `:${value.targetKind}` : "";
  return `${value.kind}${targetKind}:${String(value.id).padStart(16, "0")}`;
}

function compareReferences(left, right) {
  return referenceKey(left).localeCompare(referenceKey(right));
}

function encodeCursor(value) {
  return `v1:${encodeURIComponent(JSON.stringify(value))}`;
}

function decodeCursor(value, signature) {
  if (!value) return null;
  try {
    if (!String(value).startsWith("v1:")) throw new Error();
    const decoded = JSON.parse(decodeURIComponent(String(value).slice(3)));
    if (decoded.signature !== signature || typeof decoded.lastKey !== "string") throw new Error();
    return decoded;
  } catch {
    throw apiError("invalid_argument", "cursor 无效或不属于当前查询");
  }
}

function apiError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertMap(map) {
  if (!map) throw apiError("not_found", "当前没有可查询的地图");
}
