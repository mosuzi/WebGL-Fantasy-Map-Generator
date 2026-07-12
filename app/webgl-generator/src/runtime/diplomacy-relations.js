import {DIPLOMACY_RELATIONS} from "../generator/diplomacy.js";
import {OBJECT_KIND} from "./object-kinds.js";

export function diplomacyRelationId(subjectId, objectId) {
  const subject = positiveInteger(subjectId);
  const object = positiveInteger(objectId);
  return subject && object && subject !== object ? `${subject}:${object}` : "";
}

export function parseDiplomacyRelationIdentity(object) {
  const [idSubject, idObject] = String(object?.id || "").split(":");
  const subjectId = positiveInteger(object?.subjectId ?? idSubject);
  const objectId = positiveInteger(object?.objectId ?? object?.targetId ?? idObject);
  return subjectId && objectId && subjectId !== objectId ? {subjectId, objectId} : null;
}

export function diplomacyRelationObject(row) {
  const id = diplomacyRelationId(row?.subjectId, row?.id ?? row?.objectId);
  return id ? {
    kind: OBJECT_KIND.DIPLOMACY_RELATION,
    id,
    subjectId: Number(row.subjectId),
    objectId: Number(row.id ?? row.objectId),
    subjectName: row.subjectName || "",
    objectName: row.name || row.objectName || "",
    name: `${row.subjectName || `国家 #${row.subjectId}`} -> ${row.name || row.objectName || `国家 #${row.id ?? row.objectId}`}`,
    relation: row.relation || "Unknown",
    relationLabel: row.relationLabel || row.relation || "未知"
  } : null;
}

export function resolveDiplomacyRelation(map, object) {
  const identity = parseDiplomacyRelationIdentity(object);
  if (!identity) return null;
  const subject = stateItem(map, identity.subjectId);
  const target = stateItem(map, identity.objectId);
  if (!subject || !target || subject.removed || target.removed) return null;
  const relation = subject.diplomacy?.[identity.objectId] || object.relation || "Unknown";
  const relationMeta = DIPLOMACY_RELATIONS[relation] || DIPLOMACY_RELATIONS.Unknown;
  const subjectName = subject.fullName || subject.name || `国家 #${identity.subjectId}`;
  const objectName = target.fullName || target.name || `国家 #${identity.objectId}`;
  return {
    ...object,
    kind: OBJECT_KIND.DIPLOMACY_RELATION,
    id: diplomacyRelationId(identity.subjectId, identity.objectId),
    subjectId: identity.subjectId,
    objectId: identity.objectId,
    subjectName,
    objectName,
    name: `${subjectName} -> ${objectName}`,
    relation,
    relationLabel: relationMeta.label,
    relationColor: relationMeta.color,
    relationPolarity: relationMeta.polarity,
    from: diplomacyStatePoint(map, identity.subjectId),
    to: diplomacyStatePoint(map, identity.objectId)
  };
}

export function diplomacyStatePoint(map, stateId) {
  const state = stateItem(map, stateId);
  const packPoint = map?.pack?.cells?.p?.[state?.center];
  if (worldPoint(packPoint)) return packPoint;
  const gridPointIndex = map?.grid?.cells?.p?.[state?.gridCenter];
  const gridPoint = map?.grid?.points?.[gridPointIndex];
  return worldPoint(gridPoint) ? gridPoint : null;
}

function stateItem(map, stateId) {
  return map?.politics?.states?.[stateId] || map?.pack?.states?.[stateId] || null;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function worldPoint(point) {
  return Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]);
}
