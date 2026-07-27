import {buildDiplomacy, normalizeDiplomacyRelation, setDiplomacyRelation} from "../generator/diplomacy.js";
import {
  assertLockedDiplomacyRelations,
  captureDiplomacyRelationSnapshot,
  diplomacyLockConflict,
  diplomacyPairKey,
  parseDiplomacyPairIdentity,
  prepareLockedDiplomacyRelations
} from "../generator/diplomacy-regeneration-locks.js";
import {reconcileWarDerivedData} from "../generator/war-consistency.js";
import {objectAffected, systemAffected} from "./edit-command-effects.js";

const DIPLOMACY_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["diplomacy", "cell-colors", "point-layers", "object-panels", "object-index"])
});

export function createSetDiplomacyRelationCommand(subjectId, objectId, relation, {label = "外交关系", reason = "手动关系编辑"} = {}) {
  const normalizedSubjectId = Number(subjectId);
  const normalizedObjectId = Number(objectId);
  const normalizedRelation = normalizeDiplomacyRelation(relation);
  const historyReason = normalizeRelationReason(reason);
  let snapshot = null;
  let lastResult = null;

  return {
    label: `${label} #${normalizedSubjectId}-#${normalizedObjectId}`,
    domain: "diplomacy",
    effects: {
      ...DIPLOMACY_EFFECTS,
      affected: [
        ...objectAffected("state", normalizedSubjectId),
        ...objectAffected("state", normalizedObjectId)
      ]
    },
    apply(context) {
      if (!normalizedRelation) throw new Error("不支持的外交关系");
      snapshot ??= snapshotDiplomacy(context.map);
      const changed = setDiplomacyRelation(context.map?.pack, normalizedSubjectId, normalizedObjectId, normalizedRelation, {record: true, reason: historyReason});
      if (!changed) throw new Error("无法设置外交关系");
      syncDiplomacy(context.map);
      lastResult = reconcileWarDerivedData(context.map);
      this.effects.affected = [
        ...systemAffected("diplomacy-relation"),
        ...objectAffected("state", normalizedSubjectId),
        ...objectAffected("state", normalizedObjectId),
        ...lastResult.removedWarzoneIds.filter(id => id !== undefined).flatMap(id => objectAffected("zone", id))
      ];
    },
    revert(context) {
      if (!snapshot) throw new Error("缺少可撤销的外交快照");
      restoreDiplomacy(context.map, snapshot);
    },
    isNoop(context) {
      const state = context.map?.pack?.states?.[normalizedSubjectId] || context.map?.politics?.states?.[normalizedSubjectId];
      return !state || !normalizedRelation || state.diplomacy?.[normalizedObjectId] === normalizedRelation || normalizedSubjectId === normalizedObjectId;
    },
    getResult() {
      return lastResult;
    }
  };
}

function normalizeRelationReason(reason) {
  const text = String(reason || "").trim();
  return text ? text.slice(0, 80) : "手动关系编辑";
}

export function createRegenerateDiplomacyCommand({
  salt = 0,
  label = "重生成外交",
  faultAt = "",
  preservedRelations = [],
  lockedDiplomacyRelations = []
} = {}) {
  let snapshot = null;
  let result = null;
  return {
    label,
    domain: "diplomacy",
    effects: {
      ...DIPLOMACY_EFFECTS,
      affected: systemAffected("diplomacy-regeneration", [{kind: "state", id: "all"}])
    },
    apply(context) {
      const lockedSnapshots = collectLockedDiplomacyRelations(context.map, {preservedRelations, lockedDiplomacyRelations});
      const locked = prepareLockedDiplomacyRelations(context.map.pack, {lockedDiplomacyRelations: lockedSnapshots});
      assertLockedPoliticsMirrors(context.map, locked);
      if (allDiplomacyPairsLocked(context.map, locked.ids)) {
        result = {executed: false, reason: "all-pairs-locked"};
        return;
      }
      snapshot ??= snapshotDiplomacy(context.map);
      try {
        context.map.options = {...context.map.options, diplomacyRegenerationSalt: salt};
        context.map.diplomacy = buildDiplomacy(context.map.pack, context.map.society, {
          ...context.map.options,
          lockedDiplomacyRelations: lockedSnapshots
        });
        injectFault(faultAt, "after-build");
        syncDiplomacy(context.map);
        injectFault(faultAt, "after-sync");
        reconcileWarDerivedData(context.map);
        injectFault(faultAt, "after-war-derived");
        const currentLocked = prepareLockedDiplomacyRelations(context.map.pack, {lockedDiplomacyRelations: lockedSnapshots});
        assertLockedDiplomacyRelations(context.map.pack, currentLocked);
        assertLockedPoliticsMirrors(context.map, currentLocked);
        this.effects.affected = diplomacyRegenerationAffected(context.map);
        result = {executed: true, lockedPairs: currentLocked.ids.size};
      } catch (error) {
        restoreDiplomacy(context.map, snapshot);
        throw error;
      }
    },
    revert(context) {
      if (!snapshot) throw new Error("缺少可撤销的外交快照");
      restoreDiplomacy(context.map, snapshot);
    },
    isNoop(context) {
      const states = context.map?.pack?.states || context.map?.politics?.states || [];
      if (states.filter(state => state?.i && !state.removed).length < 2) return true;
      const lockedSnapshots = collectLockedDiplomacyRelations(context.map, {preservedRelations, lockedDiplomacyRelations});
      const locked = prepareLockedDiplomacyRelations(context.map.pack, {lockedDiplomacyRelations: lockedSnapshots});
      assertLockedPoliticsMirrors(context.map, locked);
      return allDiplomacyPairsLocked(context.map, locked.ids);
    },
    getResult() {
      return result ? {...result} : null;
    }
  };
}

export function diplomacyRegenerationAffected(map) {
  const states = map?.pack?.states || map?.politics?.states || [];
  const targets = states
    .filter(state => state && !state.removed && Number(state.i ?? state.id) > 0)
    .flatMap(state => objectAffected("state", Number(state.i ?? state.id)));
  return systemAffected("diplomacy-regeneration", targets);
}

function snapshotDiplomacy(map) {
  const states = map?.pack?.states || map?.politics?.states || [];
  return {
    diplomacy: map?.diplomacy ? clonePlain(map.diplomacy) : null,
    military: map?.military ? clonePlain(map.military) : null,
    packMilitary: map?.pack?.military ? clonePlain(map.pack.military) : null,
    zones: map?.zones ? clonePlain(map.zones) : null,
    packZones: Array.isArray(map?.pack?.zones) ? clonePlain(map.pack.zones) : null,
    optionsSalt: map?.options?.diplomacyRegenerationSalt,
    states: states.map(state => state ? {
      id: state.i ?? state.id,
      diplomacy: Array.isArray(state.diplomacy) ? [...state.diplomacy] : null,
      diplomacySummary: state.diplomacySummary ? {...state.diplomacySummary} : null,
      campaigns: Array.isArray(state.campaigns) ? clonePlain(state.campaigns) : null
    } : null)
  };
}

function restoreDiplomacy(map, snapshot) {
  const states = map?.pack?.states || map?.politics?.states || [];
  for (const stateSnapshot of snapshot.states || []) {
    if (!stateSnapshot) continue;
    const state = states[stateSnapshot.id];
    if (!state) continue;
    if (stateSnapshot.diplomacy) state.diplomacy = [...stateSnapshot.diplomacy];
    else delete state.diplomacy;
    if (stateSnapshot.diplomacySummary) state.diplomacySummary = {...stateSnapshot.diplomacySummary};
    else delete state.diplomacySummary;
    if (stateSnapshot.campaigns) state.campaigns = clonePlain(stateSnapshot.campaigns);
    else delete state.campaigns;
  }
  map.diplomacy = snapshot.diplomacy ? clonePlain(snapshot.diplomacy) : null;
  if (map?.pack) map.pack.diplomacy = map.diplomacy;
  restoreWarDerivedData(map, snapshot);
  if (map?.options) {
    if (snapshot.optionsSalt === undefined) delete map.options.diplomacyRegenerationSalt;
    else map.options.diplomacyRegenerationSalt = snapshot.optionsSalt;
  }
  syncDiplomacyStateMirrors(states, map?.politics?.states);
}

function restoreWarDerivedData(map, snapshot) {
  const military = snapshot.military || snapshot.packMilitary;
  map.military = military ? clonePlain(military) : null;
  if (map?.pack) map.pack.military = map.military;

  map.zones = snapshot.zones ? clonePlain(snapshot.zones) : null;
  const zones = map.zones?.zones || snapshot.packZones;
  if (map?.pack) map.pack.zones = zones ? clonePlain(zones) : [];
  if (map.zones) map.zones.zones = map.pack?.zones || map.zones.zones || [];
}

function collectLockedDiplomacyRelations(map, options = {}) {
  const snapshots = [];
  const seen = new Set();
  const add = source => {
    const identity = parseDiplomacyPairIdentity(source);
    if (!identity || seen.has(identity.key)) return;
    snapshots.push(source?.leftRelation || source?.rightRelation
      ? clonePlain(source)
      : captureDiplomacyRelationSnapshot(map.pack, identity.leftId, identity.rightId));
    seen.add(identity.key);
  };
  for (const source of [...(options.preservedRelations || []), ...(options.lockedDiplomacyRelations || [])]) add(source);
  for (const entry of map?.regenerationLocks?.entries || []) {
    if (entry?.kind !== "diplomacy-relation") continue;
    const identity = parseDiplomacyPairIdentity(entry);
    if (!identity) throw diplomacyLockConflict("外交锁仓包含非法国家对", {reason: "invalid-pair", id: entry?.id});
    add(captureDiplomacyRelationSnapshot(map.pack, identity.leftId, identity.rightId));
  }
  return snapshots;
}

function allDiplomacyPairsLocked(map, lockedIds) {
  const states = (map?.pack?.states || map?.politics?.states || []).filter(state => state?.i && !state.removed);
  const expected = new Set();
  for (let left = 0; left < states.length; left++) {
    for (let right = left + 1; right < states.length; right++) expected.add(diplomacyPairKey(states[left].i, states[right].i));
  }
  return expected.size > 0 && [...expected].every(key => lockedIds.has(key));
}

function assertLockedPoliticsMirrors(map, locked) {
  const packStates = map?.pack?.states;
  const politicsStates = map?.politics?.states;
  if (!Array.isArray(packStates) || !Array.isArray(politicsStates) || packStates === politicsStates) return;
  for (const snapshot of locked.pairs.values()) {
    const packLeft = packStates[snapshot.leftId];
    const packRight = packStates[snapshot.rightId];
    const politicsLeft = politicsStates[snapshot.leftId];
    const politicsRight = politicsStates[snapshot.rightId];
    if (!politicsLeft || !politicsRight
      || politicsLeft.diplomacy?.[snapshot.rightId] !== packLeft.diplomacy?.[snapshot.rightId]
      || politicsRight.diplomacy?.[snapshot.leftId] !== packRight.diplomacy?.[snapshot.leftId]
      || JSON.stringify(pairCampaigns(politicsLeft, snapshot.leftId, snapshot.rightId)) !== JSON.stringify(pairCampaigns(packLeft, snapshot.leftId, snapshot.rightId))
      || JSON.stringify(pairCampaigns(politicsRight, snapshot.leftId, snapshot.rightId)) !== JSON.stringify(pairCampaigns(packRight, snapshot.leftId, snapshot.rightId))) {
      throw diplomacyLockConflict(`外交锁 ${snapshot.id} 的 politics 镜像矛盾`, {reason: "politics-mirror-mismatch", pair: snapshot.id});
    }
  }
}

function pairCampaigns(state, leftId, rightId) {
  const key = diplomacyPairKey(leftId, rightId);
  return (state?.campaigns || []).filter(campaign => diplomacyPairKey(campaign?.attacker, campaign?.defender) === key);
}

function injectFault(actual, expected) {
  if (actual === expected) throw new Error(`diplomacy regeneration fault: ${expected}`);
}

function syncDiplomacy(map) {
  if (map?.pack?.diplomacy) map.diplomacy = map.pack.diplomacy;
  syncDiplomacyStateMirrors(map?.pack?.states, map?.politics?.states);
}

function syncDiplomacyStateMirrors(sourceStates, targetStates) {
  if (!Array.isArray(sourceStates) || !Array.isArray(targetStates) || sourceStates === targetStates) return;
  for (const source of sourceStates) {
    if (!source) continue;
    const id = Number(source.i ?? source.id);
    const target = targetStates[id];
    if (!target) continue;
    if (Array.isArray(source.diplomacy)) target.diplomacy = [...source.diplomacy];
    else delete target.diplomacy;
    if (source.diplomacySummary) target.diplomacySummary = {...source.diplomacySummary};
    else delete target.diplomacySummary;
    if (Array.isArray(source.campaigns)) target.campaigns = clonePlain(source.campaigns);
    else delete target.campaigns;
  }
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}
