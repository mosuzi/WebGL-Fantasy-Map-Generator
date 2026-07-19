import {DIPLOMACY_RELATIONS, normalizeDiplomacyRelation} from "../generator/diplomacy.js";

export function normalizeDiplomacyMap(map) {
  if (!map || typeof map !== "object") return map;
  const chronicle = diplomacyChronicle(map);
  const politicsStates = normalizeStateStore(map.politics?.states, map.pack?.states, chronicle);
  const packStates = normalizeStateStore(map.pack?.states, politicsStates, chronicle);
  const states = packStates.length ? packStates : politicsStates;
  const normalizedChronicle = diplomacyChronicle(map, states);
  const diplomacy = normalizeDiplomacyStore(map.diplomacy || map.pack?.diplomacy, states, normalizedChronicle);
  return {
    ...map,
    politics: map.politics ? {...map.politics, states: politicsStates} : map.politics,
    pack: map.pack ? {...map.pack, states: packStates, diplomacy} : map.pack,
    diplomacy
  };
}

function normalizeStateStore(source, fallback, chronicle) {
  const sourceStates = Array.isArray(source) ? source : [];
  const fallbackStates = Array.isArray(fallback) ? fallback : [];
  const size = Math.max(sourceStates.length, fallbackStates.length);
  if (!size) return [];
  const states = Array.from({length: size}, (_, id) => {
    const primary = sourceStates[id];
    const secondary = fallbackStates[id];
    if (!primary && !secondary) return primary ?? secondary ?? null;
    const state = {...(primary || secondary)};
    if (id === 0) return {...state, diplomacy: cloneChronicle(chronicle)};
    const relations = Array.isArray(primary?.diplomacy)
      ? [...primary.diplomacy]
      : Array.isArray(secondary?.diplomacy) ? [...secondary.diplomacy] : null;
    return {
      ...state,
      diplomacy: relations,
      campaigns: cloneCampaigns(Array.isArray(primary?.campaigns) ? primary.campaigns : secondary?.campaigns)
    };
  });

  const activeIds = states.map((state, id) => state && !state.removed && politicalId(state) > 0 ? id : 0).filter(Boolean);
  const activeIdSet = new Set(activeIds);
  for (const id of activeIds) {
    const state = states[id];
    const current = Array.isArray(state.diplomacy) ? state.diplomacy : [];
    state.diplomacy = Array.from({length: size}, (_, targetId) => {
      if (targetId === id) return "x";
      if (!activeIdSet.has(targetId)) return current[targetId] ?? "x";
      return normalizeDiplomacyRelation(current[targetId]) || null;
    });
  }

  for (let leftIndex = 0; leftIndex < activeIds.length; leftIndex++) {
    const leftId = activeIds[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < activeIds.length; rightIndex++) {
      const rightId = activeIds[rightIndex];
      const left = states[leftId];
      const right = states[rightId];
      const leftRelation = normalizeDiplomacyRelation(left.diplomacy[rightId]);
      const rightRelation = normalizeDiplomacyRelation(right.diplomacy[leftId]);
      if (!leftRelation && !rightRelation) {
        left.diplomacy[rightId] = "Unknown";
        right.diplomacy[leftId] = "Unknown";
      } else if (!leftRelation) left.diplomacy[rightId] = inverseRelation(rightRelation);
      else if (!rightRelation) right.diplomacy[leftId] = inverseRelation(leftRelation);
    }
  }

  for (const id of activeIds) {
    states[id].diplomacySummary = states[id].diplomacySummary && typeof states[id].diplomacySummary === "object"
      ? {...states[id].diplomacySummary}
      : diplomacySummary(states[id], activeIds);
  }
  return states;
}

function normalizeDiplomacyStore(source, states, chronicle) {
  const metadata = diplomacyMetadata(states, chronicle);
  return {
    ...(source && typeof source === "object" ? source : {}),
    relations: source?.relations && typeof source.relations === "object" ? source.relations : DIPLOMACY_RELATIONS,
    chronicle: cloneChronicle(chronicle),
    metadata: {...metadata, ...(source?.metadata || {})}
  };
}

function diplomacyChronicle(map, states = null) {
  const candidates = [
    map?.diplomacy?.chronicle,
    map?.pack?.diplomacy?.chronicle,
    states?.[0]?.diplomacy,
    map?.pack?.states?.[0]?.diplomacy,
    map?.politics?.states?.[0]?.diplomacy
  ];
  return cloneChronicle(candidates.find(Array.isArray));
}

function diplomacyMetadata(states, chronicle) {
  const active = states.map((state, id) => state && !state.removed && politicalId(state) > 0 ? id : 0).filter(Boolean);
  const relationCounts = {};
  for (let leftIndex = 0; leftIndex < active.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < active.length; rightIndex++) {
      const leftId = active[leftIndex];
      const rightId = active[rightIndex];
      const relation = canonicalPairRelation(states[leftId]?.diplomacy?.[rightId], states[rightId]?.diplomacy?.[leftId]);
      relationCounts[relation] = (relationCounts[relation] || 0) + 1;
    }
  }
  return {
    states: active.length,
    pairs: active.length * (active.length - 1) / 2,
    relationCounts,
    allies: relationCounts.Ally || 0,
    rivals: relationCounts.Rival || 0,
    enemies: relationCounts.Enemy || 0,
    vassals: relationCounts.Vassal || 0,
    unknown: relationCounts.Unknown || 0,
    chronicle: chronicle.length,
    buildMs: 0
  };
}

function diplomacySummary(state, activeIds) {
  const summary = {};
  for (const targetId of activeIds) {
    if (targetId === politicalId(state)) continue;
    const relation = normalizeDiplomacyRelation(state.diplomacy?.[targetId]) || "Unknown";
    summary[relation] = (summary[relation] || 0) + 1;
  }
  return summary;
}

function canonicalPairRelation(left, right) {
  if ([left, right].includes("Vassal") || [left, right].includes("Suzerain")) return "Vassal";
  return normalizeDiplomacyRelation(left) || normalizeDiplomacyRelation(right) || "Unknown";
}

function inverseRelation(relation) {
  if (relation === "Vassal") return "Suzerain";
  if (relation === "Suzerain") return "Vassal";
  return relation || "Unknown";
}

function cloneChronicle(source) {
  return Array.isArray(source) ? source.map(entry => Array.isArray(entry) ? [...entry] : clonePlain(entry)) : [];
}

function cloneCampaigns(source) {
  return Array.isArray(source) ? source.map(clonePlain) : [];
}

function clonePlain(value) {
  if (!value || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value));
}

function politicalId(state) {
  const id = Number(state?.i ?? state?.id);
  return Number.isInteger(id) ? id : 0;
}
