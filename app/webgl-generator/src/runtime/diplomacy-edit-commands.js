import {buildDiplomacy, normalizeDiplomacyRelation, setDiplomacyRelation} from "../generator/diplomacy.js";
import {objectAffected, systemAffected} from "./edit-command-effects.js";

const DIPLOMACY_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["diplomacy", "cell-colors", "object-panels"])
});

export function createSetDiplomacyRelationCommand(subjectId, objectId, relation, {label = "外交关系", reason = "手动关系编辑"} = {}) {
  const normalizedSubjectId = Number(subjectId);
  const normalizedObjectId = Number(objectId);
  const normalizedRelation = normalizeDiplomacyRelation(relation);
  const historyReason = normalizeRelationReason(reason);
  let snapshot = null;

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
    },
    revert(context) {
      if (!snapshot) throw new Error("缺少可撤销的外交快照");
      restoreDiplomacy(context.map, snapshot);
    },
    isNoop(context) {
      const state = context.map?.pack?.states?.[normalizedSubjectId] || context.map?.politics?.states?.[normalizedSubjectId];
      return !state || !normalizedRelation || state.diplomacy?.[normalizedObjectId] === normalizedRelation || normalizedSubjectId === normalizedObjectId;
    }
  };
}

function normalizeRelationReason(reason) {
  const text = String(reason || "").trim();
  return text ? text.slice(0, 80) : "手动关系编辑";
}

export function createRegenerateDiplomacyCommand({salt = 0, label = "重生成外交"} = {}) {
  let snapshot = null;
  return {
    label,
    domain: "diplomacy",
    effects: {
      ...DIPLOMACY_EFFECTS,
      affected: systemAffected("diplomacy-regeneration", [{kind: "state", id: "all"}])
    },
    apply(context) {
      snapshot ??= snapshotDiplomacy(context.map);
      context.map.options = {...context.map.options, diplomacyRegenerationSalt: salt};
      context.map.diplomacy = buildDiplomacy(context.map.pack, context.map.society, context.map.options);
      syncDiplomacy(context.map);
      this.effects.affected = diplomacyRegenerationAffected(context.map);
    },
    revert(context) {
      if (!snapshot) throw new Error("缺少可撤销的外交快照");
      restoreDiplomacy(context.map, snapshot);
    },
    isNoop(context) {
      const states = context.map?.pack?.states || context.map?.politics?.states || [];
      return states.filter(state => state?.i && !state.removed).length < 2;
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
  if (map?.options) {
    if (snapshot.optionsSalt === undefined) delete map.options.diplomacyRegenerationSalt;
    else map.options.diplomacyRegenerationSalt = snapshot.optionsSalt;
  }
  syncDiplomacyStateMirrors(states, map?.politics?.states);
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
