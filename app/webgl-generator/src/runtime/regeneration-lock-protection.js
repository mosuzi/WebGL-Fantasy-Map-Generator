import {OBJECT_KIND} from "./object-kinds.js";
import {listRegenerationLocks, lockError, normalizeRegenerationLockReference} from "./regeneration-locks.js";
import {
  captureDiplomacyRelationSnapshot,
  diplomacyPairKey,
  parseDiplomacyPairIdentity
} from "../generator/diplomacy-regeneration-locks.js";
import {captureMilitaryRegimentSnapshot} from "../generator/military-regeneration-locks.js";
import {prepareRiverRegenerationLocks} from "../generator/river-regeneration-locks.js";
import {prepareSocialRegenerationLocks} from "../generator/social-regeneration-locks.js";
import {burgIdsAtPackCell, cityIdsAtGridCell} from "./settlement-cell-index.js";

export function captureLockedRegenerationObjects(map, kind, {filter = null} = {}) {
  const references = rawRegenerationLockReferences(map, kind);
  const staleLockReferences = [];
  const entries = references.map(reference => {
    const object = resolveProtectedObject(map, reference);
    if (!object) {
      staleLockReferences.push({...reference});
      return null;
    }
    if (filter && !filter(object, reference)) return null;
    return {reference: {...reference}, snapshot: clone(object), related: captureRelatedSnapshot(map, reference, object)};
  }).filter(Boolean);
  return {
    kind,
    entries,
    ids: new Set(entries.map(entry => String(entry.reference.id))),
    snapshots: entries.map(entry => clone(entry.snapshot)),
    staleLockReferences
  };
}

function rawRegenerationLockReferences(map, kind) {
  if (!Array.isArray(map?.regenerationLocks?.entries)) return listRegenerationLocks(map, {kind});
  const references = [];
  const seen = new Set();
  for (const source of map.regenerationLocks.entries) {
    try {
      const reference = normalizeRegenerationLockReference(source);
      if (reference.kind !== kind) continue;
      const key = `${reference.kind}\u0000${String(reference.id)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      references.push(reference);
    } catch {
      // 损坏的锁元数据不是用户主动重生成的前置条件。
    }
  }
  return references;
}

export function lockedRegenerationObjects(map, kind) {
  return captureLockedRegenerationObjects(map, kind).snapshots;
}

export function mergeLockedRiverFeatureSnapshots(map, lockedFeatures = [], lockedRivers = []) {
  const byId = new Map();
  const add = feature => {
    const id = Number(feature?.i ?? feature?.id);
    if (Number.isSafeInteger(id) && id > 0 && !byId.has(id)) byId.set(id, clone(feature));
  };
  for (const feature of lockedFeatures || []) add(feature);
  if (!(lockedRivers || []).length) return [...byId.values()];
  const riverConstraints = prepareRiverRegenerationLocks(map?.pack, lockedRivers);
  for (const lakeId of riverConstraints.lakeGuards.keys()) add(map?.pack?.features?.[lakeId]);
  return [...byId.values()];
}

export function allRegenerationObjectsLocked(map, kind, objects = null) {
  const rows = objects || listRegenerationObjects(map, kind);
  if (!rows.length) return false;
  const locked = captureLockedRegenerationObjects(map, kind).ids;
  return rows.every(object => locked.has(String(objectId(kind, object))));
}

export function assertLockedRegenerationSnapshots(map, capture) {
  for (const entry of capture?.entries || []) {
    const object = resolveProtectedObject(map, entry.reference);
    if (!object && isSoftOrphanedCompositeLock(map, entry)) continue;
    if (!object) throw regenerationLockConflict(capture.kind, entry.reference, "locked_object_removed", "重生成结果删除了锁定对象");
    if (stableSnapshot(object) !== stableSnapshot(entry.snapshot)) {
      throw regenerationLockConflict(capture.kind, entry.reference, "locked_snapshot_changed", "重生成结果改写了锁定对象快照", {
        changedFields: changedTopLevelFields(entry.snapshot, object),
        changedSummary: summarizeTopLevelChanges(entry.snapshot, object)
      });
    }
  }
  return true;
}

function isSoftOrphanedCompositeLock(map, entry) {
  const activeState = (states, id) => Boolean(states?.[id] && !states[id].removed);
  const stateCollections = [map?.pack?.states, map?.politics?.states];
  if (entry?.reference?.kind === OBJECT_KIND.DIPLOMACY_RELATION) {
    const identity = parseDiplomacyPairIdentity(entry.reference);
    if (!identity) return false;
    return !stateCollections.some(states => activeState(states, identity.leftId) && activeState(states, identity.rightId));
  }
  if (entry?.reference?.kind === OBJECT_KIND.MILITARY) {
    const stateId = Number(entry?.snapshot?.stateId);
    return !stateCollections.some(states => activeState(states, stateId));
  }
  return false;
}

export function hideRegenerationLocks(map) {
  const hadStore = Object.prototype.hasOwnProperty.call(map || {}, "regenerationLocks");
  const store = map?.regenerationLocks;
  if (map && typeof map === "object") map.regenerationLocks = {version: 1, entries: []};
  return () => {
    if (!map || typeof map !== "object") return;
    if (hadStore) map.regenerationLocks = store;
    else delete map.regenerationLocks;
  };
}

export function restoreLockedRegenerationSnapshots(map, capture) {
  for (const entry of capture?.entries || []) restoreLockedRegenerationEntry(map, entry);
  return map;
}

export function hideLockedRegenerationSnapshots(map, capture) {
  for (const entry of capture?.entries || []) hideLockedRegenerationEntry(map, entry);
  return map;
}

export function assignReservedNumericIds(generated, reservedIds, {getId = item => item?.id ?? item?.i, setId = (item, id) => {
  item.id = id;
  item.i = id;
}, start = 0} = {}) {
  const used = new Set([...reservedIds].map(Number).filter(Number.isInteger));
  let cursor = Math.max(start, used.size ? Math.max(...used) + 1 : start);
  for (const item of generated || []) {
    let id = Number(getId(item));
    if (!Number.isInteger(id) || id < 0 || used.has(id)) {
      while (used.has(cursor)) cursor += 1;
      id = cursor++;
    }
    setId(item, id);
    used.add(id);
    cursor = Math.max(cursor, id + 1);
  }
  return generated;
}

export function regenerationLockConflict(kind, reference, reason, message, details = {}) {
  return lockError("regeneration_lock_conflict", message, {
    kind,
    reference: reference ? {...reference} : null,
    reason,
    ...details
  });
}

function listRegenerationObjects(map, kind) {
  if (kind === OBJECT_KIND.STATE) return map?.politics?.states || map?.pack?.states || [];
  if (kind === OBJECT_KIND.PROVINCE) return map?.politics?.provinces || map?.pack?.provinces || [];
  if (kind === OBJECT_KIND.CITY) return map?.settlements?.cities || [];
  if (kind === OBJECT_KIND.ROUTE) return map?.settlements?.routes || [];
  if (kind === OBJECT_KIND.RIVER) return map?.rivers?.rivers || [];
  if (kind === OBJECT_KIND.CULTURE) return map?.society?.cultures || map?.pack?.cultures || [];
  if (kind === OBJECT_KIND.RELIGION) return map?.society?.religions || map?.pack?.religions || [];
  if (kind === OBJECT_KIND.FEATURE) return map?.pack?.features || [];
  if (kind === OBJECT_KIND.MARKER) return map?.markers?.markers || [];
  if (kind === OBJECT_KIND.ZONE) return map?.zones?.zones || map?.pack?.zones || [];
  if (kind === OBJECT_KIND.OCEAN_CURRENT) return map?.oceanCurrents?.currents || [];
  if (kind === OBJECT_KIND.DIPLOMACY_RELATION) return diplomacyPairObjects(map);
  if (kind === OBJECT_KIND.MILITARY) return militaryRegimentObjects(map);
  if (kind === OBJECT_KIND.ECONOMY_MARKET) return map?.pack?.markets || map?.economy?.markets || [];
  if (kind === OBJECT_KIND.TRADE_FLOW) return map?.pack?.deals || map?.economy?.deals || [];
  return [];
}

function resolveProtectedObject(map, reference) {
  if (reference.kind === OBJECT_KIND.DIPLOMACY_RELATION) {
    const identity = parseDiplomacyPairIdentity(reference);
    return identity ? captureDiplomacyRelationSnapshotLoose(map, identity) : null;
  }
  if (reference.kind === OBJECT_KIND.MILITARY) {
    return captureMilitaryRegimentSnapshotLoose(map, reference);
  }
  return listRegenerationObjects(map, reference.kind)
    .find(object => String(objectId(reference.kind, object)) === String(reference.id)) || null;
}

function captureDiplomacyRelationSnapshotLoose(map, identity) {
  const left = map?.pack?.states?.[identity.leftId] || map?.politics?.states?.[identity.leftId];
  const right = map?.pack?.states?.[identity.rightId] || map?.politics?.states?.[identity.rightId];
  if (!left || !right) return null;
  const belongsToPair = record => diplomacyPairKey(record?.attacker ?? record?.fromState, record?.defender ?? record?.toState) === identity.key;
  const campaigns = [...(Array.isArray(left.campaigns) ? left.campaigns : []), ...(Array.isArray(right.campaigns) ? right.campaigns : [])]
    .filter(belongsToPair);
  return {
    id: identity.key,
    leftId: identity.leftId,
    rightId: identity.rightId,
    leftRelation: left.diplomacy?.[identity.rightId],
    rightRelation: right.diplomacy?.[identity.leftId],
    campaigns: uniqueSnapshots(campaigns),
    chronicleEntries: [],
    militaryCampaigns: clone((map?.military?.campaigns || map?.pack?.military?.campaigns || []).filter(belongsToPair)),
    fronts: clone((map?.military?.fronts || map?.pack?.military?.fronts || []).filter(belongsToPair)),
    warzones: clone((map?.zones?.zones || map?.pack?.zones || []).filter(zone => zone?.type === "Warzone" && belongsToPair(zone)))
  };
}

function captureMilitaryRegimentSnapshotLoose(map, reference) {
  const [storedStateId, storedRegimentId] = String(reference?.id || "").split(":");
  const stateId = Number(reference?.stateId ?? storedStateId);
  const regimentId = Number(reference?.regimentId ?? storedRegimentId);
  if (!Number.isInteger(stateId) || stateId <= 0 || !Number.isInteger(regimentId) || regimentId < 0) return null;
  const state = map?.pack?.states?.[stateId] || map?.politics?.states?.[stateId];
  const regiment = (Array.isArray(state?.military) ? state.military : [])
    .find(item => Number(item?.i) === regimentId || String(item?.id) === `${stateId}:${regimentId}`);
  if (!regiment) return null;
  const events = map?.military?.events || map?.pack?.military?.events || [];
  return {
    id: `${stateId}:${regimentId}`,
    stateId,
    regimentId,
    regiment: clone(regiment),
    globalEvents: clone((Array.isArray(events) ? events : []).filter(event =>
      String(event?.regimentObjectId || "") === `${stateId}:${regimentId}`
      || Number(event?.stateId) === stateId && Number(event?.regimentId) === regimentId
    ))
  };
}

function restoreLockedRegenerationEntry(map, entry) {
  const {reference, snapshot, related} = entry;
  if (reference.kind === OBJECT_KIND.STATE) {
    restoreIndexedObject(map?.politics?.states, snapshot);
    restoreIndexedObject(map?.pack?.states, snapshot);
    restoreMemberAssignments(map?.pack?.cells?.state, related?.packCells, Number(snapshot?.i ?? snapshot?.id));
    restoreMemberAssignments(map?.grid?.cells?.state, related?.gridCells, Number(snapshot?.i ?? snapshot?.id));
    return;
  }
  if (reference.kind === OBJECT_KIND.PROVINCE) {
    restoreIndexedObject(map?.politics?.provinces, snapshot);
    restoreIndexedObject(map?.pack?.provinces, snapshot);
    restoreMemberAssignments(map?.pack?.cells?.province, related?.packCells, Number(snapshot?.i ?? snapshot?.id));
    restoreMemberAssignments(map?.grid?.cells?.province, related?.gridCells, Number(snapshot?.i ?? snapshot?.id));
    return;
  }
  if (reference.kind === OBJECT_KIND.CITY) {
    restoreIndexedObject(map?.settlements?.cities, snapshot, Number(snapshot?.id ?? snapshot?.i));
    if (related?.packBurg) restoreIndexedObject(map?.pack?.burgs, related.packBurg);
    restoreCellValue(map?.pack?.cells?.burg, Number(snapshot?.packCell), related?.packCellBurg);
    restoreCellValue(map?.grid?.cells?.burg, Number(snapshot?.cell), related?.gridCellBurg);
    restorePoliticalAnchor(map, snapshot, related);
    return;
  }
  if (reference.kind === OBJECT_KIND.ROUTE) {
    restoreIndexedObject(map?.settlements?.routes, snapshot, Number(snapshot?.id ?? snapshot?.i));
    restoreIndexedValue(map?.pack?.routes, Number(snapshot?.id ?? snapshot?.i), related?.packRoute);
    for (const [from, to, value] of related?.links || []) restoreRouteLink(map?.pack?.cells?.routes, from, to, value);
    restoreNotes(map, reference, related?.notes);
    return;
  }
  if (reference.kind === OBJECT_KIND.RIVER) {
    restoreCollectionObject(map?.rivers?.rivers, snapshot, reference.kind);
    const riverId = Number(snapshot?.id ?? snapshot?.i);
    restoreCollectionObject(map?.pack?.rivers, related?.packRiver || snapshot, reference.kind);
    for (const cell of related?.cells || []) {
      restoreCellValue(map?.pack?.cells?.r, cell.cell, cell.r);
      restoreCellValue(map?.pack?.cells?.fl, cell.cell, cell.fl);
      restoreCellValue(map?.pack?.cells?.conf, cell.cell, cell.conf);
    }
    for (const edge of related?.lakeEdges || []) {
      const feature = map?.pack?.features?.[edge.id];
      if (!feature) continue;
      if (edge.river) feature.river = riverId;
      if (edge.outlet) feature.outlet = riverId;
      if (edge.inlet) feature.inlets = [...new Set([...(Array.isArray(feature.inlets) ? feature.inlets : []), riverId])];
    }
    restoreNotes(map, reference, related?.notes);
    return;
  }
  if (reference.kind === OBJECT_KIND.CULTURE || reference.kind === OBJECT_KIND.RELIGION) {
    const plural = reference.kind === OBJECT_KIND.CULTURE ? "cultures" : "religions";
    const field = reference.kind === OBJECT_KIND.CULTURE ? "culture" : "religion";
    restoreIndexedObject(map?.society?.[plural], snapshot);
    restoreIndexedObject(map?.pack?.[plural], snapshot);
    const id = Number(snapshot?.i ?? snapshot?.id);
    restoreMemberAssignments(map?.pack?.cells?.[field], related?.packCells, id);
    restoreMemberAssignments(map?.grid?.cells?.[field], related?.gridCells, id);
    return;
  }
  if (reference.kind === OBJECT_KIND.FEATURE) {
    const id = Number(snapshot?.i ?? snapshot?.id);
    restoreIndexedObject(map?.pack?.features, snapshot);
    if (related?.gridId > 0 && related?.gridFeature) {
      restoreIndexedObject(map?.features?.features, related.gridFeature, related.gridId);
      restoreIndexedObject(map?.grid?.features, related.gridFeature, related.gridId);
    }
    restoreCellAssignments(map?.pack?.cells, related?.packCells, related?.packAssignments);
    restoreCellAssignments(map?.grid?.cells, related?.gridCells, related?.gridAssignments);
    if (map?.pack?.features?.[id] && related?.shore?.pack !== undefined) map.pack.features[id].shoreline = clone(related.shore.pack);
    return;
  }
  if (reference.kind === OBJECT_KIND.MARKER) {
    restoreCollectionObject(map?.markers?.markers, snapshot, reference.kind);
    restoreCollectionObject(map?.pack?.markers, related?.packMarker || snapshot, reference.kind);
    return;
  }
  if (reference.kind === OBJECT_KIND.ZONE) {
    restoreCollectionObject(map?.zones?.zones, snapshot, reference.kind);
    restoreCollectionObject(map?.pack?.zones, related?.packZone || snapshot, reference.kind);
    return;
  }
  if (reference.kind === OBJECT_KIND.OCEAN_CURRENT) {
    restoreCollectionObject(map?.oceanCurrents?.currents, snapshot, reference.kind);
    return;
  }
  if (reference.kind === OBJECT_KIND.ECONOMY_MARKET) {
    restoreIndexedObject(map?.pack?.markets, snapshot);
    restoreIndexedObject(map?.economy?.markets, snapshot);
    restoreMemberAssignments(map?.pack?.cells?.market, related?.ownedCells, Number(snapshot?.i ?? snapshot?.id));
    return;
  }
  if (reference.kind === OBJECT_KIND.TRADE_FLOW) {
    restoreIndexedObject(map?.pack?.deals, snapshot, Number(snapshot?.i ?? snapshot?.id));
    restoreIndexedObject(map?.economy?.deals, snapshot, Number(snapshot?.i ?? snapshot?.id));
    return;
  }
  if (reference.kind === OBJECT_KIND.DIPLOMACY_RELATION) {
    restoreDiplomacyRelation(map, snapshot, related);
    return;
  }
  if (reference.kind === OBJECT_KIND.MILITARY) restoreMilitaryRegiment(map, snapshot, related);
}

function hideLockedRegenerationEntry(map, entry) {
  const {reference, snapshot, related} = entry;
  const id = Number(snapshot?.i ?? snapshot?.id);
  if (reference.kind === OBJECT_KIND.STATE) {
    hideIndexedObject(map?.politics?.states, id);
    hideIndexedObject(map?.pack?.states, id);
    clearMemberAssignments(map?.pack?.cells?.state, id, 0);
    clearMemberAssignments(map?.grid?.cells?.state, id, 0);
    return;
  }
  if (reference.kind === OBJECT_KIND.PROVINCE) {
    hideIndexedObject(map?.politics?.provinces, id);
    hideIndexedObject(map?.pack?.provinces, id);
    clearMemberAssignments(map?.pack?.cells?.province, id, 0);
    clearMemberAssignments(map?.grid?.cells?.province, id, 0);
    return;
  }
  if (reference.kind === OBJECT_KIND.CITY) {
    hideCollectionObject(map?.settlements?.cities, reference.kind, reference.id);
    const burgId = Number(snapshot?.burgId ?? related?.packBurg?.i ?? related?.packBurg?.id);
    hideIndexedObject(map?.pack?.burgs, burgId);
    clearMemberAssignments(map?.pack?.cells?.burg, burgId, 0);
    clearMemberAssignments(map?.grid?.cells?.burg, Number(snapshot?.id), -1);
    return;
  }
  if (reference.kind === OBJECT_KIND.ROUTE) {
    hideCollectionObject(map?.settlements?.routes, reference.kind, reference.id);
    hideIndexedObject(map?.pack?.routes, id);
    clearRouteOwner(map?.pack?.cells?.routes, id);
    return;
  }
  if (reference.kind === OBJECT_KIND.RIVER) {
    hideCollectionObject(map?.rivers?.rivers, reference.kind, reference.id);
    hideCollectionObject(map?.pack?.rivers, reference.kind, reference.id);
    clearMemberAssignments(map?.pack?.cells?.r, id, 0);
    return;
  }
  if (reference.kind === OBJECT_KIND.CULTURE || reference.kind === OBJECT_KIND.RELIGION) {
    const plural = reference.kind === OBJECT_KIND.CULTURE ? "cultures" : "religions";
    const field = reference.kind === OBJECT_KIND.CULTURE ? "culture" : "religion";
    hideIndexedObject(map?.society?.[plural], id);
    hideIndexedObject(map?.pack?.[plural], id);
    clearMemberAssignments(map?.pack?.cells?.[field], id, 0);
    clearMemberAssignments(map?.grid?.cells?.[field], id, 0);
    return;
  }
  if (reference.kind === OBJECT_KIND.FEATURE) {
    hideIndexedObject(map?.pack?.features, id);
    const gridId = Number(related?.gridId);
    hideIndexedObject(map?.features?.features, gridId);
    hideIndexedObject(map?.grid?.features, gridId);
    return;
  }
  if (reference.kind === OBJECT_KIND.MARKER) {
    hideCollectionObject(map?.markers?.markers, reference.kind, reference.id);
    hideCollectionObject(map?.pack?.markers, reference.kind, reference.id);
    return;
  }
  if (reference.kind === OBJECT_KIND.ZONE) {
    hideCollectionObject(map?.zones?.zones, reference.kind, reference.id);
    hideCollectionObject(map?.pack?.zones, reference.kind, reference.id);
    return;
  }
  if (reference.kind === OBJECT_KIND.OCEAN_CURRENT) {
    hideCollectionObject(map?.oceanCurrents?.currents, reference.kind, reference.id);
    return;
  }
  if (reference.kind === OBJECT_KIND.ECONOMY_MARKET) {
    hideIndexedObject(map?.pack?.markets, id);
    hideIndexedObject(map?.economy?.markets, id);
    clearMemberAssignments(map?.pack?.cells?.market, id, 0);
    return;
  }
  if (reference.kind === OBJECT_KIND.TRADE_FLOW) {
    hideCollectionObject(map?.pack?.deals, reference.kind, reference.id);
    hideCollectionObject(map?.economy?.deals, reference.kind, reference.id);
    return;
  }
  if (reference.kind === OBJECT_KIND.DIPLOMACY_RELATION) {
    hideDiplomacyRelation(map, snapshot);
    return;
  }
  if (reference.kind === OBJECT_KIND.MILITARY) hideMilitaryRegiment(map, snapshot);
}

function hideDiplomacyRelation(map, snapshot) {
  const leftId = Number(snapshot?.leftId);
  const rightId = Number(snapshot?.rightId);
  for (const states of [map?.pack?.states, map?.politics?.states]) {
    const left = states?.[leftId];
    const right = states?.[rightId];
    if (Array.isArray(left?.diplomacy)) left.diplomacy[rightId] = "x";
    if (Array.isArray(right?.diplomacy)) right.diplomacy[leftId] = "x";
    if (left) left.campaigns = replacePairRecords(left.campaigns, [], leftId, rightId);
    if (right) right.campaigns = replacePairRecords(right.campaigns, [], leftId, rightId);
  }
  for (const military of [map?.military, map?.pack?.military]) {
    if (!military) continue;
    military.campaigns = replacePairRecords(military.campaigns, [], leftId, rightId);
    military.fronts = replacePairRecords(military.fronts, [], leftId, rightId);
  }
  for (const zones of [map?.zones?.zones, map?.pack?.zones]) replacePairCollection(zones, [], leftId, rightId);
}

function hideMilitaryRegiment(map, snapshot) {
  const stateId = Number(snapshot?.stateId);
  const regimentId = Number(snapshot?.regimentId);
  for (const states of [map?.pack?.states, map?.politics?.states]) {
    const state = states?.[stateId];
    if (!state || !Array.isArray(state.military)) continue;
    state.military = state.military.filter(item => Number(item?.i) !== regimentId && String(item?.id) !== snapshot.id);
  }
  for (const military of [map?.military, map?.pack?.military]) {
    if (!military || !Array.isArray(military.events)) continue;
    military.events = military.events.filter(event => !(String(event?.regimentObjectId || "") === snapshot.id
      || Number(event?.stateId) === stateId && Number(event?.regimentId) === regimentId));
  }
}

function hideIndexedObject(collection, id) {
  if (!Array.isArray(collection) || !Number.isInteger(id) || id < 0 || id >= collection.length) return;
  collection[id] = null;
}

function hideCollectionObject(collection, kind, id) {
  if (!Array.isArray(collection)) return;
  const index = collection.findIndex(item => item && String(objectId(kind, item)) === String(id));
  if (index >= 0) collection[index] = null;
}

function clearMemberAssignments(values, id, replacement) {
  if (!values) return;
  for (let index = 0; index < values.length; index++) if (Number(values[index]) === Number(id)) values[index] = replacement;
}

function clearRouteOwner(routes, routeId) {
  if (!routes || typeof routes !== "object") return;
  for (const [from, links] of Object.entries(routes)) {
    if (!links || typeof links !== "object") continue;
    for (const [to, owner] of Object.entries(links)) if (Number(owner) === Number(routeId)) delete links[to];
    if (!Object.keys(links).length) delete routes[from];
  }
}

function restoreDiplomacyRelation(map, snapshot, related) {
  const leftId = Number(snapshot?.leftId);
  const rightId = Number(snapshot?.rightId);
  let restored = false;
  for (const states of [map?.pack?.states, map?.politics?.states]) {
    const left = states?.[leftId];
    const right = states?.[rightId];
    if (!left || left.removed || !right || right.removed) continue;
    restored = true;
    left.diplomacy ||= [];
    right.diplomacy ||= [];
    left.diplomacy[rightId] = clone(snapshot.leftRelation);
    right.diplomacy[leftId] = clone(snapshot.rightRelation);
    left.campaigns = replacePairRecords(left.campaigns, snapshot.campaigns, leftId, rightId);
    right.campaigns = replacePairRecords(right.campaigns, snapshot.campaigns, leftId, rightId);
  }
  if (!restored) return;
  for (const military of [map?.military, map?.pack?.military]) {
    if (!military) continue;
    military.campaigns = replacePairRecords(military.campaigns, snapshot.militaryCampaigns, leftId, rightId);
    military.fronts = replacePairRecords(military.fronts, snapshot.fronts, leftId, rightId);
  }
  for (const zones of [map?.zones?.zones, map?.pack?.zones]) replacePairCollection(zones, snapshot.warzones, leftId, rightId);
}

function restoreMilitaryRegiment(map, snapshot, related) {
  const stateId = Number(snapshot?.stateId);
  const regimentId = Number(snapshot?.regimentId);
  let restored = false;
  for (const states of [map?.pack?.states, map?.politics?.states]) {
    const state = states?.[stateId];
    if (!state || state.removed) continue;
    restored = true;
    state.military = Array.isArray(state.military) ? state.military : [];
    const index = state.military.findIndex(item => Number(item?.i) === regimentId || String(item?.id) === snapshot.id);
    if (index >= 0) state.military[index] = clone(snapshot.regiment);
    else state.military.push(clone(snapshot.regiment));
  }
  if (!restored) return;
  for (const military of [map?.military, map?.pack?.military]) {
    if (!military) continue;
    const current = Array.isArray(military.events) ? military.events : [];
    military.events = [
      ...current.filter(event => !(String(event?.regimentObjectId || "") === snapshot.id
        || Number(event?.stateId) === stateId && Number(event?.regimentId) === regimentId)),
      ...(snapshot.globalEvents || []).map(clone)
    ];
  }
}

function ensureStateEnvelope(states, id, identity = null) {
  if (!Array.isArray(states) || !Number.isInteger(id) || id <= 0) return null;
  if (!states[id]) {
    states[id] = {
      i: id,
      id,
      name: String(identity?.name || `#${id}`),
      fullName: String(identity?.name || `#${id}`),
      center: Number(identity?.center) || 0,
      capital: Number(identity?.capital) || 0,
      removed: false,
      diplomacy: [],
      campaigns: [],
      military: [],
      provinces: []
    };
  }
  return states[id];
}

function restorePoliticalAnchor(map, snapshot, related) {
  const burgId = Number(snapshot?.burgId);
  const stateId = Number(snapshot?.state);
  const provinceId = Number(snapshot?.province);
  if (related?.stateAnchor) for (const states of [map?.politics?.states, map?.pack?.states]) {
    const state = states?.[stateId];
    if (state) Object.assign(state, clone(related.stateAnchor), {capital: burgId});
  }
  if (related?.provinceAnchor) for (const provinces of [map?.politics?.provinces, map?.pack?.provinces]) {
    const province = provinces?.[provinceId];
    if (province) Object.assign(province, clone(related.provinceAnchor), {burg: burgId});
  }
}

function replacePairRecords(current, snapshots, leftId, rightId) {
  const retained = (Array.isArray(current) ? current : []).filter(record =>
    diplomacyPairKey(record?.attacker ?? record?.fromState, record?.defender ?? record?.toState) !== diplomacyPairKey(leftId, rightId)
  );
  return [...retained, ...(Array.isArray(snapshots) ? snapshots.map(clone) : [])];
}

function replacePairCollection(collection, snapshots, leftId, rightId) {
  if (!Array.isArray(collection)) return;
  const next = replacePairRecords(collection, snapshots, leftId, rightId);
  collection.splice(0, collection.length, ...next);
}

function restoreCollectionObject(collection, snapshot, kind) {
  if (!Array.isArray(collection) || !snapshot) return;
  const id = String(objectId(kind, snapshot));
  const index = collection.findIndex(item => item && String(objectId(kind, item)) === id);
  if (index >= 0) collection[index] = clone(snapshot);
  else collection.push(clone(snapshot));
}

function restoreIndexedObject(collection, snapshot, explicitId = null) {
  if (!Array.isArray(collection) || !snapshot) return;
  const id = explicitId ?? Number(snapshot?.i ?? snapshot?.id);
  if (!Number.isInteger(Number(id)) || Number(id) < 0) return;
  collection[Number(id)] = clone(snapshot);
}

function restoreIndexedValue(collection, id, value) {
  if (!Array.isArray(collection) || !Number.isInteger(id) || id < 0) return;
  collection[id] = clone(value);
}

function restoreMemberAssignments(values, members, id) {
  if (!values || !Array.isArray(members)) return;
  for (const cell of members) restoreCellValue(values, cell, id);
}

function restoreCellAssignments(cells, members, assignments) {
  if (!cells || !Array.isArray(members) || !assignments) return;
  for (const [field, values] of Object.entries(assignments)) {
    for (let index = 0; index < members.length; index++) restoreCellValue(cells[field], members[index], values?.[index]);
  }
}

function restoreCellValue(values, cell, value) {
  const index = Number(cell);
  if (!values || !Number.isInteger(index) || index < 0 || index >= values.length) return;
  values[index] = clone(value);
}

function restoreRouteLink(routes, from, to, value) {
  if (!routes || !Number.isInteger(Number(from)) || !Number.isInteger(Number(to))) return;
  routes[from] ||= {};
  if (value === null || value === undefined) delete routes[from][to];
  else routes[from][to] = clone(value);
}

function restoreNotes(map, reference, snapshots) {
  const notes = map?.notes?.notes;
  if (!Array.isArray(notes) || !Array.isArray(snapshots)) return;
  const retained = notes.filter(note => !(note?.kind === reference.kind && String(note?.objectId) === String(reference.id)));
  notes.splice(0, notes.length, ...retained, ...snapshots.map(clone));
}

function uniqueSnapshots(values) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    const key = stableSnapshot(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clone(value));
  }
  return result;
}

function objectId(kind, object) {
  if (kind === OBJECT_KIND.OCEAN_CURRENT) return object?.id;
  if (kind === OBJECT_KIND.DIPLOMACY_RELATION || kind === OBJECT_KIND.MILITARY) return object?.id;
  return object?.id ?? object?.i;
}

function validateProtectedObject(map, reference, object) {
  if (reference.kind === OBJECT_KIND.STATE) return validateState(map, reference, object);
  if (reference.kind === OBJECT_KIND.PROVINCE) return validateProvince(map, reference, object);
  if (reference.kind === OBJECT_KIND.CITY) return validateCity(map, reference, object);
  if (reference.kind === OBJECT_KIND.ROUTE) return validateRoute(map, reference, object);
  if (reference.kind === OBJECT_KIND.RIVER) return validateRiver(map, reference, object);
  if (reference.kind === OBJECT_KIND.CULTURE) return validateSocialObject(map, reference, object, {
    field: "culture",
    plural: "cultures",
    label: "文化"
  });
  if (reference.kind === OBJECT_KIND.RELIGION) return validateSocialObject(map, reference, object, {
    field: "religion",
    plural: "religions",
    label: "宗教"
  });
  if (reference.kind === OBJECT_KIND.FEATURE) return validateFeature(map, reference, object);
  if (reference.kind === OBJECT_KIND.MARKER) return validateMarker(map, reference, object);
  if (reference.kind === OBJECT_KIND.ZONE) return validateZone(map, reference, object);
  if (reference.kind === OBJECT_KIND.OCEAN_CURRENT) return validateOceanCurrent(map, reference, object);
  if (reference.kind === OBJECT_KIND.DIPLOMACY_RELATION) return validateDiplomacyRelation(map, reference);
  if (reference.kind === OBJECT_KIND.MILITARY) return validateMilitaryRegiment(map, reference);
  if (reference.kind === OBJECT_KIND.ECONOMY_MARKET) return validateEconomyMarket(map, reference, object);
  if (reference.kind === OBJECT_KIND.TRADE_FLOW) return validateTradeFlow(map, reference, object);
}

function validateState(map, reference, state) {
  const id = Number(state.id ?? state.i);
  const center = Number(state.center);
  const capital = Number(state.capital);
  const burg = map?.pack?.burgs?.[capital];
  if (!Number.isInteger(id) || id <= 0 || !map?.pack?.states?.[id] || map.pack.states[id].removed) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_state_mirror", "锁定国家缺少一致的 pack 对象", {id});
  }
  if (!Number.isInteger(center) || center < 0 || center >= Number(map?.pack?.cells?.i?.length || 0)) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_state_center", "锁定国家引用了无效中心", {id, center});
  }
  if (capital !== 0 && (!Number.isInteger(capital) || capital <= 0 || !burg || burg.removed)) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_state_capital", "锁定国家引用了不存在的首都", {id, capital});
  }
}

function validateProvince(map, reference, province) {
  const id = Number(province.id ?? province.i);
  const stateId = Number(province.state);
  const center = Number(province.center);
  const burgId = Number(province.burg || 0);
  if (!Number.isInteger(id) || id <= 0 || !map?.pack?.provinces?.[id] || map.pack.provinces[id].removed) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_province_mirror", "锁定省份缺少一致的 pack 对象", {id});
  }
  if (!map?.pack?.states?.[stateId] || map.pack.states[stateId].removed) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_province_parent", "锁定省份引用了无效父国", {id, stateId});
  }
  if (!Number.isInteger(center) || center < 0 || center >= Number(map?.pack?.cells?.i?.length || 0)) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_province_center", "锁定省份引用了无效中心", {id, stateId, center});
  }
  if (burgId) {
    const burg = map?.pack?.burgs?.[burgId];
    if (!burg || burg.removed) {
      throw regenerationLockConflict(reference.kind, reference, "invalid_province_burg", "锁定省份引用了不存在的省会 burg", {id, burgId});
    }
  }
}

function validateRiver(map, reference, river) {
  try {
    prepareRiverRegenerationLocks(map?.pack, [river]);
  } catch (error) {
    if (error?.code === "regeneration_lock_conflict") throw error;
    throw regenerationLockConflict(reference.kind, reference, "invalid_river_constraint", "锁定河流约束无效", {cause: error?.message || String(error)});
  }
}

function validateSocialObject(map, reference, object, config) {
  const id = Number(object?.i ?? object?.id);
  const societyObject = map?.society?.[config.plural]?.[id];
  const packObject = map?.pack?.[config.plural]?.[id];
  if (!Number.isInteger(id) || id <= 0 || !societyObject || societyObject.removed || !packObject || packObject.removed) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_social_mirror", `锁定${config.label}缺少 society / pack 对象`, {id});
  }
  if (stableSnapshot(societyObject) !== stableSnapshot(packObject) || stableSnapshot(object) !== stableSnapshot(societyObject)) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_social_mirror", `锁定${config.label}的 society / pack 镜像不一致`, {id});
  }
  try {
    prepareSocialRegenerationLocks({
      grid: map.grid,
      pack: map.pack,
      objects: [object],
      ...config
    });
  } catch (error) {
    if (error?.code === "regeneration_lock_conflict") throw error;
    throw regenerationLockConflict(reference.kind, reference, "invalid_social_constraint", `锁定${config.label}约束无效`, {
      id,
      cause: error?.message || String(error)
    });
  }
}

function validateFeature(map, reference, feature) {
  const id = Number(feature?.i ?? feature?.id);
  const packFeature = map?.pack?.features?.[id];
  const packCells = memberCells(map?.pack?.cells?.f, id);
  if (!Number.isInteger(id) || id <= 0 || !packFeature || packFeature.removed || !packCells.length) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_feature_mirror", "锁定 Feature 缺少 pack 对象或成员 cell", {id});
  }
  if (stableSnapshot(feature) !== stableSnapshot(packFeature)) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_feature_mirror", "锁定 Feature 对象与 pack 镜像不一致", {id});
  }
  const gridIds = [...new Set(packCells.map(cell => Number(map?.grid?.cells?.f?.[map?.pack?.cells?.g?.[cell]])).filter(value => value > 0))];
  if (!gridIds.length) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_feature_grid_mirror", "锁定 Feature 缺少可读取的 grid 镜像", {id, gridIds});
  }
  for (const gridId of gridIds) {
    const gridFeature = map?.features?.features?.[gridId] || map?.grid?.features?.[gridId];
    const gridCells = memberCells(map?.grid?.cells?.f, gridId);
    if (!gridFeature || gridFeature.removed || !gridCells.length || Boolean(gridFeature.land) !== Boolean(packFeature.land)) {
      throw regenerationLockConflict(reference.kind, reference, "invalid_feature_grid_mirror", "锁定 Feature 的 pack / grid 对象镜像不一致", {id, gridId});
    }
  }
}

function validateCity(map, reference, city) {
  const packCell = Number(city.packCell);
  const gridCell = Number(city.cell);
  const burgId = Number(city.burgId);
  if (!Number.isInteger(packCell) || packCell < 0 || packCell >= Number(map?.pack?.cells?.i?.length || 0)) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_city_pack_cell", "锁定城镇引用了无效 pack cell", {packCell});
  }
  if (!Number.isInteger(gridCell) || gridCell < 0 || gridCell >= Number(map?.grid?.cells?.h?.length || 0)) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_city_grid_cell", "锁定城镇引用了无效 grid cell", {gridCell});
  }
  const burg = map?.pack?.burgs?.[burgId];
  if (!Number.isInteger(burgId) || burgId <= 0 || !burg || burg.removed || Number(burg.cell) !== packCell) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_city_burg", "锁定城镇缺少一致的 pack burg 镜像", {burgId, packCell});
  }
  const packBurgIds = burgIdsAtPackCell(map, packCell);
  const gridCityIds = cityIdsAtGridCell(map, gridCell);
  if (!packBurgIds.includes(burgId) || !gridCityIds.includes(Number(city.id))
    || Number(map?.pack?.cells?.burg?.[packCell]) !== packBurgIds[0]
    || Number(map?.grid?.cells?.burg?.[gridCell]) !== gridCityIds[0]) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_city_cell_mirror", "锁定城镇与 pack cell 的 burg 镜像不一致", {burgId, packCell});
  }
}

function validateRoute(map, reference, route) {
  const id = Number(route.id ?? route.i);
  const packCells = route.packCells;
  if (!Number.isInteger(id) || id < 0 || !Array.isArray(packCells) || packCells.length < 2) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_route_path", "锁定道路缺少有效 ID 或路径", {id});
  }
  if (!Array.isArray(route.points) || route.points.length !== packCells.length || !Array.isArray(route.cells) || route.cells.length !== packCells.length) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_route_mirror", "锁定道路路径镜像不完整", {id});
  }
  for (let index = 0; index < packCells.length; index++) {
    const cell = Number(packCells[index]);
    if (!Number.isInteger(cell) || cell < 0 || cell >= Number(map?.pack?.cells?.i?.length || 0)) {
      throw regenerationLockConflict(reference.kind, reference, "invalid_route_cell", "锁定道路包含无效 pack cell", {id, cell});
    }
    if (index && !(map?.pack?.cells?.c?.[packCells[index - 1]] || []).includes(cell)) {
      throw regenerationLockConflict(reference.kind, reference, "invalid_route_topology", "锁定道路路径不连续", {
        id,
        from: packCells[index - 1],
        to: cell
      });
    }
  }
}

function diplomacyPairObjects(map) {
  const states = (map?.pack?.states || map?.politics?.states || [])
    .filter(state => state?.i && !state.removed);
  const pairs = [];
  for (let left = 0; left < states.length; left++) {
    for (let right = left + 1; right < states.length; right++) {
      pairs.push({
        id: diplomacyPairKey(states[left].i, states[right].i),
        leftId: Number(states[left].i),
        rightId: Number(states[right].i)
      });
    }
  }
  return pairs;
}

function militaryRegimentObjects(map) {
  return (map?.pack?.states || map?.politics?.states || [])
    .filter(state => state?.i && !state.removed)
    .flatMap(state => (state.military || []).map(regiment => ({
      id: `${state.i}:${regiment.i}`,
      stateId: Number(state.i),
      regimentId: Number(regiment.i)
    })));
}

function validateDiplomacyRelation(map, reference) {
  const identity = parseDiplomacyPairIdentity(reference);
  if (!identity) {
    throw regenerationLockConflict(reference.kind, reference, "invalid-pair", "锁定外交关系缺少有效国家对");
  }
  captureDiplomacyRelationSnapshot(map?.pack, identity.leftId, identity.rightId);
}

function validateMilitaryRegiment(map, reference) {
  captureMilitaryRegimentSnapshot(map?.pack, reference);
}

function validateEconomyMarket(map, reference, market) {
  const id = Number(market?.i ?? market?.id);
  const centerBurgId = Number(market?.centerBurgId);
  const cell = Number(market?.cell);
  const burg = map?.pack?.burgs?.[centerBurgId];
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(centerBurgId) || centerBurgId <= 0
    || !Number.isInteger(cell) || cell < 0 || cell >= Number(map?.pack?.cells?.i?.length || 0)
    || !burg?.i || burg.removed) {
    throw regenerationLockConflict(reference.kind, reference, "invalid-market-center", "锁定市场引用了不存在的中心城市或越界 cell", {
      marketId: id,
      centerBurgId,
      cell
    });
  }
}

function validateTradeFlow(map, reference, deal) {
  const id = Number(deal?.i ?? deal?.id);
  const goodId = Number(deal?.good);
  if (!Number.isInteger(id) || id < 0 || !findNumericObject(map?.pack?.goods, goodId)) {
    throw regenerationLockConflict(reference.kind, reference, "missing-deal-good", "锁定交易引用了不存在的商品", {dealId: id, goodId});
  }
  validateTradeParty(map, reference, deal, "seller");
  validateTradeParty(map, reference, deal, "buyer");
  if (deal.path === undefined || deal.path === null) return;
  if (!Array.isArray(deal.path) || !deal.path.length) {
    throw regenerationLockConflict(reference.kind, reference, "invalid-deal-path", "锁定交易路径无效", {dealId: id});
  }
  for (let index = 0; index < deal.path.length; index++) {
    const cell = Number(deal.path[index]);
    if (!Number.isInteger(cell) || cell < 0 || cell >= Number(map?.pack?.cells?.i?.length || 0)) {
      throw regenerationLockConflict(reference.kind, reference, "invalid-deal-path-cell", "锁定交易路径包含无效 cell", {dealId: id, cell});
    }
  }
}

function validateTradeParty(map, reference, deal, side) {
  const type = deal?.[`${side}Type`];
  const id = Number(deal?.[side]);
  if (type === "market" && findNumericObject(map?.pack?.markets, id)) return;
  if (type === "burg") {
    const burg = map?.pack?.burgs?.[id];
    if (burg?.i && !burg.removed) return;
  }
  throw regenerationLockConflict(reference.kind, reference, type === "burg" ? "missing-deal-burg" : "missing-deal-market", "锁定交易引用了无效端点", {
    dealId: Number(deal?.i ?? deal?.id),
    side,
    type,
    id
  });
}

function findNumericObject(collection, id) {
  if (!Number.isInteger(id)) return null;
  return (collection || []).find(object => Number(object?.i ?? object?.id) === id) || null;
}

function captureRelatedSnapshot(map, reference, object) {
  if (reference.kind === OBJECT_KIND.STATE) return captureStateMirrors(map, object);
  if (reference.kind === OBJECT_KIND.PROVINCE) return captureProvinceMirrors(map, object);
  if (reference.kind === OBJECT_KIND.CITY) return captureCityMirrors(map, object);
  if (reference.kind === OBJECT_KIND.ROUTE) return captureRouteMirrors(map, object);
  if (reference.kind === OBJECT_KIND.RIVER) return captureRiverMirrors(map, object);
  if (reference.kind === OBJECT_KIND.CULTURE) return captureSocialMirrors(map, object, "culture", "cultures");
  if (reference.kind === OBJECT_KIND.RELIGION) return captureSocialMirrors(map, object, "religion", "religions");
  if (reference.kind === OBJECT_KIND.FEATURE) return captureFeatureMirrors(map, object);
  if (reference.kind === OBJECT_KIND.MARKER) {
    return {packMarker: clone((map?.pack?.markers || []).find(marker => String(marker?.id ?? marker?.i) === String(reference.id)) || null)};
  }
  if (reference.kind === OBJECT_KIND.ZONE) {
    return {packZone: clone((map?.pack?.zones || []).find(zone => String(zone?.id ?? zone?.i) === String(reference.id)) || null)};
  }
  if (reference.kind === OBJECT_KIND.DIPLOMACY_RELATION) return captureDiplomacyMirrors(map, object);
  if (reference.kind === OBJECT_KIND.MILITARY) return captureMilitaryMirrors(map, object);
  if (reference.kind === OBJECT_KIND.ECONOMY_MARKET) return captureEconomyMarketMirrors(map, object);
  if (reference.kind === OBJECT_KIND.TRADE_FLOW) return captureTradeFlowMirrors(map, object);
  return null;
}

function captureDiplomacyMirrors(map, snapshot) {
  return {
    politics: [snapshot.leftId, snapshot.rightId].map(id => {
      const state = map?.politics?.states?.[id];
      return {
        id,
        relation: state?.diplomacy?.[id === snapshot.leftId ? snapshot.rightId : snapshot.leftId],
        campaigns: clone((state?.campaigns || []).filter(campaign =>
          diplomacyPairKey(campaign?.attacker, campaign?.defender) === snapshot.id
        ))
      };
    })
  };
}

function captureMilitaryMirrors(map, snapshot) {
  const politicsState = map?.politics?.states?.[snapshot.stateId];
  const mirror = (politicsState?.military || []).find(regiment => Number(regiment?.i) === snapshot.regimentId);
  return {
    politicsRegiment: clone(mirror || null),
    politicsState: politicsState ? pickFields(politicsState, ["i", "id", "name", "center", "capital", "removed"]) : null
  };
}

function captureEconomyMarketMirrors(map, market) {
  const id = Number(market?.i ?? market?.id);
  const centerBurgId = Number(market?.centerBurgId);
  const burg = map?.pack?.burgs?.[centerBurgId];
  return {
    packMarket: clone(findNumericObject(map?.pack?.markets, id)),
    economyMarket: clone(findNumericObject(map?.economy?.markets, id)),
    ownedCells: memberCells(map?.pack?.cells?.market, id),
    centerBurg: captureBurgIdentity(burg),
    centerCity: captureCityIdentity(map, burg)
  };
}

function captureTradeFlowMirrors(map, deal) {
  const id = Number(deal?.i ?? deal?.id);
  return {
    packDeal: clone(findNumericObject(map?.pack?.deals, id)),
    economyDeal: clone(findNumericObject(map?.economy?.deals, id)),
    good: captureGoodIdentity(findNumericObject(map?.pack?.goods, Number(deal?.good))),
    seller: captureTradePartyIdentity(map, deal?.sellerType, deal?.seller),
    buyer: captureTradePartyIdentity(map, deal?.buyerType, deal?.buyer),
    path: clone(deal?.path || null),
    pathAssignments: Array.isArray(deal?.path)
      ? captureCellAssignments(map?.pack?.cells, deal.path, ["market", "state", "burg"])
      : null
  };
}

function captureTradePartyIdentity(map, type, value) {
  const id = Number(value);
  if (type === "market") {
    const market = findNumericObject(map?.pack?.markets, id);
    const burg = map?.pack?.burgs?.[Number(market?.centerBurgId)];
    return {
      type,
      id,
      market: market ? pickFields(market, ["i", "id", "centerBurgId", "cell", "state"]) : null,
      burg: captureBurgIdentity(burg),
      city: captureCityIdentity(map, burg),
      state: capturePoliticalStateIdentity(map, Number(market?.state))
    };
  }
  const burg = map?.pack?.burgs?.[id];
  return {
    type,
    id,
    burg: captureBurgIdentity(burg),
    city: captureCityIdentity(map, burg),
    state: capturePoliticalStateIdentity(map, Number(burg?.state))
  };
}

function captureBurgIdentity(burg) {
  return burg ? pickFields(burg, ["i", "id", "cell", "state", "province", "market", "cityId", "removed"]) : null;
}

function captureCityIdentity(map, burg) {
  const city = (map?.settlements?.cities || []).find(item =>
    Number(item?.burgId) === Number(burg?.i) || item?.id === burg?.cityId
  );
  return city ? pickFields(city, ["id", "burgId", "packCell", "cell", "state", "province", "removed"]) : null;
}

function capturePoliticalStateIdentity(map, id) {
  const packState = map?.pack?.states?.[id];
  const politicsState = map?.politics?.states?.[id];
  return {
    pack: packState ? pickFields(packState, ["i", "id", "center", "capital", "removed"]) : null,
    politics: politicsState ? pickFields(politicsState, ["i", "id", "center", "capital", "removed"]) : null
  };
}

function captureGoodIdentity(good) {
  return good ? pickFields(good, ["i", "id", "name", "type", "category", "removed"]) : null;
}

function captureSocialMirrors(map, object, field, plural) {
  const id = Number(object?.i ?? object?.id);
  const references = [Number(object?.parent) || 0, ...(Array.isArray(object?.origins) ? object.origins : []).map(Number)]
    .filter(reference => Number.isInteger(reference) && reference >= 0);
  return {
    societyObject: clone(map?.society?.[plural]?.[id] || null),
    packObject: clone(map?.pack?.[plural]?.[id] || null),
    packCells: memberCells(map?.pack?.cells?.[field], id),
    gridCells: memberCells(map?.grid?.cells?.[field], id),
    center: Number(object?.center),
    gridCenter: Number(object?.gridCenter),
    inheritance: references.map(reference => ({
      id: reference,
      societyExists: Boolean(map?.society?.[plural]?.[reference] && !map.society[plural][reference].removed),
      packExists: Boolean(map?.pack?.[plural]?.[reference] && !map.pack[plural][reference].removed)
    }))
  };
}

function captureFeatureMirrors(map, feature) {
  const id = Number(feature?.i ?? feature?.id);
  const packCells = memberCells(map?.pack?.cells?.f, id);
  const gridId = [...new Set(packCells.map(cell => Number(map?.grid?.cells?.f?.[map?.pack?.cells?.g?.[cell]])).filter(value => value > 0))][0] || 0;
  const gridCells = memberCells(map?.grid?.cells?.f, gridId);
  return {
    packFeature: clone(map?.pack?.features?.[id] || null),
    gridFeature: clone(map?.features?.features?.[gridId] || map?.grid?.features?.[gridId] || null),
    gridId,
    packCells,
    gridCells,
    packAssignments: captureCellAssignments(map?.pack?.cells, packCells, ["f", "h", "type", "haven", "harbor"]),
    gridAssignments: captureCellAssignments(map?.grid?.cells, gridCells, ["f", "h"]),
    shore: {
      pack: clone(map?.pack?.features?.[id]?.shoreline || null),
      grid: clone((map?.features?.features?.[gridId] || map?.grid?.features?.[gridId])?.shoreline || null)
    }
  };
}

function captureCellAssignments(cells, members, fields) {
  return Object.fromEntries(fields.map(field => [field, members.map(cell => clone(cells?.[field]?.[cell]))]));
}

function captureStateMirrors(map, state) {
  const id = Number(state.id ?? state.i);
  const capital = Number(state.capital);
  return {
    packState: clone(map?.pack?.states?.[id] || null),
    packCells: memberCells(map?.pack?.cells?.state, id),
    gridCells: memberCells(map?.grid?.cells?.state, id),
    capitalBurg: clone(map?.pack?.burgs?.[capital] || null),
    supportingCities: capturePoliticalCities(map, {stateId: id}),
    supportingProvinces: (Array.isArray(state.provinces) ? state.provinces : []).map(provinceId => {
      const province = map?.pack?.provinces?.[provinceId] || map?.politics?.provinces?.[provinceId];
      return {
        province: clone(province || null),
        packCells: memberCells(map?.pack?.cells?.province, Number(provinceId)),
        gridCells: memberCells(map?.grid?.cells?.province, Number(provinceId))
      };
    })
  };
}

function captureProvinceMirrors(map, province) {
  const id = Number(province.id ?? province.i);
  const stateId = Number(province.state);
  const burgId = Number(province.burg || 0);
  return {
    packProvince: clone(map?.pack?.provinces?.[id] || null),
    packCells: memberCells(map?.pack?.cells?.province, id),
    gridCells: memberCells(map?.grid?.cells?.province, id),
    parentStateId: stateId,
    centerStateId: Number(map?.pack?.cells?.state?.[province.center]),
    centerBurg: clone(burgId ? map?.pack?.burgs?.[burgId] || null : null),
    supportingCities: capturePoliticalCities(map, {provinceId: id})
  };
}

function memberCells(values, id) {
  const cells = [];
  for (let cell = 0; cell < (values?.length || 0); cell++) if (Number(values[cell]) === id) cells.push(cell);
  return cells;
}

function changedTopLevelFields(before, after) {
  const fields = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...fields].filter(field => stableSnapshot(before?.[field]) !== stableSnapshot(after?.[field]));
}

function summarizeTopLevelChanges(before, after) {
  return Object.fromEntries(changedTopLevelFields(before, after).map(field => {
    const previous = before?.[field];
    const current = after?.[field];
    if (Array.isArray(previous) && Array.isArray(current) && previous.every(Number.isFinite) && current.every(Number.isFinite)) {
      const previousSet = new Set(previous);
      const currentSet = new Set(current);
      return [field, {
        before: previous.length,
        after: current.length,
        removed: previous.filter(value => !currentSet.has(value)).slice(0, 12),
        added: current.filter(value => !previousSet.has(value)).slice(0, 12)
      }];
    }
    if (Array.isArray(previous) && Array.isArray(current)) {
      const previousRows = previous.map(stableSnapshot);
      const currentRows = current.map(stableSnapshot);
      const previousSet = new Set(previousRows);
      const currentSet = new Set(currentRows);
      return [field, {
        before: previous.length,
        after: current.length,
        removed: previousRows.filter(value => !currentSet.has(value)).slice(0, 6),
        added: currentRows.filter(value => !previousSet.has(value)).slice(0, 6)
      }];
    }
    if (previous && current && typeof previous === "object" && typeof current === "object") {
      const fields = changedTopLevelFields(previous, current);
      return [field, {
        fields,
        changes: Object.fromEntries(fields.slice(0, 12).map(key => [key, {
          before: String(stableSnapshot(previous[key])).slice(0, 120),
          after: String(stableSnapshot(current[key])).slice(0, 120)
        }]))
      }];
    }
    return [field, {before: String(stableSnapshot(previous)).slice(0, 240), after: String(stableSnapshot(current)).slice(0, 240)}];
  }));
}

function capturePoliticalCities(map, {stateId = null, provinceId = null} = {}) {
  return (map?.settlements?.cities || []).filter(city => {
    if (!city || city.removed) return false;
    const packCell = Number(city.packCell);
    const ownerState = Number.isInteger(packCell) ? Number(map?.pack?.cells?.state?.[packCell]) : Number(city.state);
    const ownerProvince = Number.isInteger(packCell) ? Number(map?.pack?.cells?.province?.[packCell]) : Number(city.province);
    return (stateId !== null && ownerState === stateId) || (provinceId !== null && ownerProvince === provinceId);
  }).map(city => ({
    city: clone(city),
    mirror: captureCityMirrors(map, city)
  }));
}

function captureRiverMirrors(map, river) {
  const id = Number(river.id ?? river.i);
  const memberCells = (Array.isArray(river.cells) ? river.cells : []).filter(cell => Number.isInteger(cell) && cell >= 0);
  const notes = (map?.notes?.notes || []).filter(note => note?.kind === OBJECT_KIND.RIVER && String(note.objectId) === String(id));
  const lakeEdges = (map?.pack?.features || []).filter(feature => feature?.type === "lake" && (
    Number(feature.river) === id || Number(feature.outlet) === id || (feature.inlets || []).map(Number).includes(id)
  )).map(feature => ({
    id: Number(feature.i ?? feature.id),
    river: Number(feature.river) === id,
    outlet: Number(feature.outlet) === id,
    inlet: (feature.inlets || []).map(Number).includes(id)
  }));
  return {
    packRiver: clone((map?.pack?.rivers || []).find(item => Number(item?.id ?? item?.i) === id) || null),
    cells: memberCells.map(cell => ({
      cell,
      r: Number(map?.pack?.cells?.r?.[cell]) || 0,
      fl: Number(map?.pack?.cells?.fl?.[cell]) || 0,
      conf: Number(map?.pack?.cells?.conf?.[cell]) || 0
    })),
    lakeEdges,
    notes: clone(notes)
  };
}

function captureCityMirrors(map, city) {
  const burgId = Number(city.burgId);
  const packCell = Number(city.packCell);
  const gridCell = Number(city.cell);
  const state = map?.politics?.states?.[Number(city.state)] || map?.pack?.states?.[Number(city.state)];
  const province = map?.politics?.provinces?.[Number(city.province)] || map?.pack?.provinces?.[Number(city.province)];
  const provinceId = Number(province?.i ?? province?.id);
  const provinceCenter = Number(province?.center);
  const packProvince = map?.pack?.provinces?.[provinceId] || null;
  const packBurg = clone(map?.pack?.burgs?.[burgId] || null);
  if (packBurg) packBurg.provincial = Boolean(packBurg.provincial);
  const consistentProvinceAnchor = province
    && packProvince
    && Number(province.burg) === burgId
    && provinceCenter === packCell
    && Number(province.state) === Number(city.state)
    && ["state", "burg", "center", "gridCenter"].every(key => Number(packProvince[key] ?? 0) === Number(province[key] ?? 0))
    && Number(map?.pack?.cells?.province?.[provinceCenter]) === provinceId
    && Number(map?.pack?.cells?.state?.[provinceCenter]) === Number(province.state);
  return {
    packBurg,
    packCellBurg: Number(map?.pack?.cells?.burg?.[packCell]) || 0,
    packCellBurgIds: burgIdsAtPackCell(map, packCell),
    gridCellBurg: Number(map?.grid?.cells?.burg?.[gridCell]) || 0,
    gridCellCityIds: cityIdsAtGridCell(map, gridCell),
    stateAnchor: state && Number(state.capital) === burgId ? pickFields(state, ["capital", "center", "gridCenter", "capitalName"]) : null,
    provinceAnchor: consistentProvinceAnchor ? pickFields(province, ["burg", "center", "gridCenter"]) : null
  };
}

function captureRouteMirrors(map, route) {
  const id = Number(route.id ?? route.i);
  const packCells = Array.isArray(route.packCells) ? route.packCells : [];
  const links = [];
  for (let index = 0; index < packCells.length - 1; index++) {
    const from = packCells[index];
    const to = packCells[index + 1];
    links.push([from, to, map?.pack?.cells?.routes?.[from]?.[to] ?? null]);
  }
  const notes = (map?.notes?.notes || []).filter(note => note?.kind === OBJECT_KIND.ROUTE && String(note.objectId) === String(id));
  return {
    packRoute: captureRoutePackMirror(map?.pack?.routes?.[id]),
    links,
    notes: clone(notes)
  };
}

function captureRoutePackMirror(route) {
  if (!route) return null;
  return pickFields(route, ["i", "points"]);
}

function pickFields(source, fields) {
  return Object.fromEntries(fields.map(field => [field, clone(source?.[field])]));
}

function validateMarker(map, reference, marker) {
  const cell = Number(marker.packCell);
  const cells = map?.pack?.cells;
  if (!Number.isInteger(cell) || cell < 0 || cell >= Number(cells?.i?.length || 0)) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_marker_cell", "锁定资源点引用了无效地形 cell", {cell});
  }
  const point = cells?.p?.[cell];
  if (!Array.isArray(point) || point.length < 2 || point.some(value => !Number.isFinite(Number(value)))) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_marker_position", "锁定资源点缺少有效地图位置", {cell});
  }
}

function validateZone(map, reference, zone) {
  const cellCount = Number(map?.pack?.cells?.i?.length || 0);
  if (!Array.isArray(zone.cells) || zone.cells.some(cell => !Number.isInteger(cell) || cell < 0 || cell >= cellCount)) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_zone_cells", "锁定地区包含无效地形 cell");
  }
  for (const field of ["attacker", "defender"]) {
    const stateId = Number(zone[field]);
    if (!stateId) continue;
    const state = map?.politics?.states?.[stateId] || map?.pack?.states?.[stateId];
    if (!state || state.removed) {
      throw regenerationLockConflict(reference.kind, reference, "invalid_zone_reference", `锁定地区引用了不存在的国家：${field} #${stateId}`, {field, stateId});
    }
  }
}

function validateOceanCurrent(map, reference, current) {
  const features = map?.features?.features || map?.grid?.features || [];
  const basin = features?.[Number(current.basinFeatureId)];
  if (!basin) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_current_basin", "锁定洋流引用了不存在的 Feature", {basinFeatureId: current.basinFeatureId});
  }
  const segments = current?.path?.segments;
  if (!Array.isArray(segments) || !segments.length || segments.some(segment =>
    ["start", "control1", "control2", "end"].some(field =>
      !Array.isArray(segment?.[field]) || segment[field].length < 2 || segment[field].some(value => !Number.isFinite(Number(value)))
  ))) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_current_path", "锁定洋流缺少有效路径");
  }
}

function stableSnapshot(value) {
  return JSON.stringify(sortPlain(clone(value))) ?? "undefined";
}

function sortPlain(value) {
  if (Array.isArray(value)) return value.map(sortPlain);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortPlain(value[key])]));
}

function clone(value) {
  return structuredClone(value);
}
