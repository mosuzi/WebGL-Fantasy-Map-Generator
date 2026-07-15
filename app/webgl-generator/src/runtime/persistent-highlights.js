import {OBJECT_KIND} from "./object-kinds.js";
import {resolveObject} from "./object-resolver.js";

export const MAX_PERSISTENT_OBJECT_HIGHLIGHTS = 100;

export const PERSISTENT_HIGHLIGHT_OBJECT_KINDS = Object.freeze([
  OBJECT_KIND.CITY,
  OBJECT_KIND.LABEL,
  OBJECT_KIND.MARKER,
  OBJECT_KIND.NOTE,
  OBJECT_KIND.ROUTE,
  OBJECT_KIND.TRADE_FLOW,
  OBJECT_KIND.RIVER,
  OBJECT_KIND.LAKE,
  OBJECT_KIND.MEASUREMENT,
  OBJECT_KIND.MILITARY,
  OBJECT_KIND.DIPLOMACY_RELATION,
  OBJECT_KIND.STATE,
  OBJECT_KIND.PROVINCE,
  OBJECT_KIND.CULTURE,
  OBJECT_KIND.RELIGION,
  OBJECT_KIND.REGION,
  OBJECT_KIND.ZONE
]);

const PERSISTENT_HIGHLIGHT_KIND_SET = new Set(PERSISTENT_HIGHLIGHT_OBJECT_KINDS);

export function isPersistentHighlightObjectKind(kind) {
  return PERSISTENT_HIGHLIGHT_KIND_SET.has(kind);
}

export function normalizePersistentHighlights(map, objects) {
  const highlights = [];
  const rejected = [];
  const seen = new Set();
  let duplicates = 0;

  for (const source of Array.isArray(objects) ? objects : []) {
    if (!source?.kind || !isPersistentHighlightObjectKind(source.kind)) {
      rejected.push({object: source || null, reason: "unsupported-kind"});
      continue;
    }
    const resolved = resolveObject(map, source);
    if (!resolved || resolved === source) {
      rejected.push({object: source, reason: "missing-object"});
      continue;
    }
    const key = persistentHighlightKey(resolved);
    if (!key) {
      rejected.push({object: source, reason: "missing-id"});
      continue;
    }
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    highlights.push(resolved);
  }

  return {highlights, rejected, duplicates};
}

export function persistentHighlightKey(object) {
  if (!object?.kind) return "";
  const targetId = object.targetId ?? object.id;
  if (targetId === undefined || targetId === null || targetId === "") return "";
  return `${object.kind}:${object.targetKind || ""}:${targetId}`;
}

export function samePersistentHighlightMembership(current, next) {
  const currentKeys = new Set((Array.isArray(current) ? current : []).map(persistentHighlightKey).filter(Boolean));
  const nextKeys = new Set((Array.isArray(next) ? next : []).map(persistentHighlightKey).filter(Boolean));
  if (currentKeys.size !== nextKeys.size) return false;
  for (const key of currentKeys) {
    if (!nextKeys.has(key)) return false;
  }
  return true;
}
