import {createRandom} from "./random.js";

export const DIPLOMACY_RELATIONS = Object.freeze({
  Ally: Object.freeze({value: "Ally", label: "盟友", color: "#2fa85a", polarity: 3}),
  Friendly: Object.freeze({value: "Friendly", label: "友好", color: "#95d76f", polarity: 2}),
  Neutral: Object.freeze({value: "Neutral", label: "中立", color: "#d9ded7", polarity: 0}),
  Suspicion: Object.freeze({value: "Suspicion", label: "猜疑", color: "#d98a76", polarity: -1}),
  Rival: Object.freeze({value: "Rival", label: "宿敌", color: "#a95f24", polarity: -2}),
  Enemy: Object.freeze({value: "Enemy", label: "战争", color: "#d6423a", polarity: -3}),
  Vassal: Object.freeze({value: "Vassal", label: "附庸", color: "#76b9e8", polarity: 1}),
  Suzerain: Object.freeze({value: "Suzerain", label: "宗主", color: "#2c5aa8", polarity: 1}),
  Unknown: Object.freeze({value: "Unknown", label: "未知", color: "#9ca3a8", polarity: -0.5})
});

export const DIPLOMACY_RELATION_OPTIONS = Object.freeze(
  Object.values(DIPLOMACY_RELATIONS).map(({value, label}) => Object.freeze({value, label}))
);

const INVERSE_RELATION = Object.freeze({
  Vassal: "Suzerain",
  Suzerain: "Vassal"
});

const NEIGHBOR_WEIGHTS = Object.freeze({Ally: 1, Friendly: 2, Neutral: 1, Suspicion: 10, Rival: 9});
const NEIGHBOR_OF_NEIGHBOR_WEIGHTS = Object.freeze({Ally: 10, Friendly: 8, Neutral: 5, Suspicion: 1});
const FAR_WEIGHTS = Object.freeze({Friendly: 1, Neutral: 12, Suspicion: 2, Unknown: 6});
const NAVAL_WEIGHTS = Object.freeze({Neutral: 1, Suspicion: 2, Rival: 1, Unknown: 1});

export function buildDiplomacy(pack, society, options = {}) {
  const startedAt = performance.now();
  const states = pack?.states || [];
  const validStates = states.filter(state => state?.i && !state.removed);
  const random = createRandom(`${options.seed}:diplomacy:${options.diplomacyRegenerationSalt ?? 0}`);
  const chronicle = [];

  if (states[0]) states[0].diplomacy = chronicle;
  for (const state of validStates) {
    state.diplomacy = new Array(states.length).fill("x");
    state.diplomacy[state.i] = "x";
    state.campaigns = [];
  }

  if (validStates.length >= 2) {
    const context = createDiplomacyContext(pack, society, validStates);
    assignPairRelations({pack, society, states, validStates, random, context});
    declareRivalWars({states, validStates, random, context, chronicle, options});
  }

  refreshDiplomacySummaries(states);
  const metadata = summarizeDiplomacy(states, roundMs(performance.now() - startedAt));
  const diplomacy = {relations: DIPLOMACY_RELATIONS, chronicle, metadata};
  if (pack) pack.diplomacy = diplomacy;
  return diplomacy;
}

export function setDiplomacyRelation(pack, subjectId, objectId, relation, {record = true, reason = "manual"} = {}) {
  const states = pack?.states || [];
  const subject = states[Number(subjectId)];
  const object = states[Number(objectId)];
  const normalized = normalizeDiplomacyRelation(relation);
  if (!subject?.i || !object?.i || subject.i === object.i || !normalized) return false;

  ensureDiplomacyArrays(states);
  const oldRelation = subject.diplomacy?.[object.i] || "Neutral";
  if (oldRelation === normalized) return false;
  subject.diplomacy[object.i] = normalized;
  object.diplomacy[subject.i] = inverseRelation(normalized);

  if (record) {
    if (!states[0]) states[0] = {id: 0, i: 0, name: "中立"};
    if (!Array.isArray(states[0].diplomacy)) states[0].diplomacy = [];
    states[0].diplomacy.push(createRelationHistoryEntry(subject, object, oldRelation, normalized, reason));
  }

  refreshDiplomacySummaries(states);
  if (pack?.diplomacy) {
    pack.diplomacy.chronicle = states[0]?.diplomacy || [];
    pack.diplomacy.metadata = summarizeDiplomacy(states, pack.diplomacy.metadata?.buildMs || 0);
  }
  return true;
}

export function normalizeDiplomacyRelation(relation) {
  return DIPLOMACY_RELATIONS[relation] ? relation : null;
}

export function diplomacyRelationLabel(relation) {
  return DIPLOMACY_RELATIONS[relation]?.label || relation || "未知";
}

export function diplomacyRelationColor(relation) {
  return DIPLOMACY_RELATIONS[relation]?.color || "#9ca3a8";
}

function assignPairRelations({pack, society, states, validStates, random, context}) {
  for (let fIndex = 0; fIndex < validStates.length; fIndex++) {
    const from = validStates[fIndex];
    for (let tIndex = fIndex + 1; tIndex < validStates.length; tIndex++) {
      const to = validStates[tIndex];
      const relation = choosePairRelation({pack, society, states, from, to, random, context});
      setPairRelation(from, to, relation);
    }
  }
}

function choosePairRelation({pack, society, states, from, to, random, context}) {
  const naval = isRemoteNavalPair(pack, from, to);
  const neighbors = !naval && (from.neighbors || []).includes(to.i);
  const neighborsOfNeighbors = !naval && !neighbors && (from.neighbors || []).some(id => (states[id]?.neighbors || []).includes(to.i));
  const weights = naval ? NAVAL_WEIGHTS : neighbors ? NEIGHBOR_WEIGHTS : neighborsOfNeighbors ? NEIGHBOR_OF_NEIGHBOR_WEIGHTS : FAR_WEIGHTS;
  let relation = weightedChoice(random, weights);

  const sharedCulture = sharesHeritage(society?.cultures, from.culture, to.culture);
  const sharedReligion = sharesHeritage(society?.religions, from.religion, to.religion);
  const sameType = from.type && from.type === to.type;
  const powerRatio = statePower(context, from.i) / Math.max(1, statePower(context, to.i));
  const resourceCompetition = Math.min(from.resourcePotential || 0, to.resourcePotential || 0) > context.averageResource * 0.8;

  if (sharedCulture && random.next() < 0.5) relation = improveRelation(relation, random);
  if (sharedReligion && random.next() < 0.38) relation = improveRelation(relation, random);
  if (sameType && !neighbors && random.next() < 0.2) relation = improveRelation(relation, random);
  if (neighbors && !sharedCulture && random.next() < 0.38) relation = worsenRelation(relation, random);
  if (neighbors && !sharedReligion && random.next() < 0.24) relation = worsenRelation(relation, random);
  if (neighbors && resourceCompetition && random.next() < 0.35) relation = worsenRelation(relation, random);
  if (!neighbors && !neighborsOfNeighbors && !sharedCulture && !sharedReligion && random.next() < 0.2) relation = "Unknown";

  const stronger = powerRatio >= 1 ? from : to;
  const weaker = stronger === from ? to : from;
  const strongerPower = statePower(context, stronger.i);
  const weakerPower = statePower(context, weaker.i);
  const canVassalize = neighbors && strongerPower > context.averagePower && weakerPower < context.averagePower && strongerPower / Math.max(1, weakerPower) > 2.25;
  if (canVassalize && random.next() < 0.32) return stronger === from ? "Suzerain" : "Vassal";
  return relation;
}

function declareRivalWars({states, validStates, random, context, chronicle, options}) {
  const maxWars = Math.max(1, Math.floor(validStates.length / 8));
  let wars = 0;
  const year = Number(options.year) || 1000;

  for (const attacker of validStates) {
    if (wars >= maxWars) break;
    if ((attacker.diplomacy || []).includes("Vassal") || (attacker.diplomacy || []).includes("Enemy")) continue;
    const rivalIds = (attacker.diplomacy || [])
      .map((relation, id) => (relation === "Rival" && !states[id]?.diplomacy?.includes("Vassal") ? id : 0))
      .filter(Boolean);
    if (!rivalIds.length || random.next() > 0.34) continue;

    const defender = states[rivalIds[Math.floor(random.next() * rivalIds.length)]];
    if (!defender?.i) continue;
    const attackerPower = statePower(context, attacker.i) * Math.max(0.5, attacker.expansionism || 1);
    const defenderPower = statePower(context, defender.i) * Math.max(0.5, defender.expansionism || 1);
    if (attackerPower < defenderPower * random.range(1.25, 2.2)) continue;

    setPairRelation(attacker, defender, "Enemy");
    const name = `${attacker.name}-${defender.name}之战`;
    const campaign = {name, start: Math.max(1, Math.round(year - random.range(1, 10))), attacker: attacker.i, defender: defender.i};
    attacker.campaigns.push(campaign);
    defender.campaigns.push(campaign);
    chronicle.push(["战争爆发", `${attacker.name}向宿敌${defender.name}宣战`]);
    wars++;
  }
}

function createDiplomacyContext(pack, society, validStates) {
  const powers = new Map();
  for (const state of validStates) {
    const population = Number(state.rural || 0) + Number(state.urban || 0);
    const fallbackPower = Math.sqrt(Math.max(0, state.area || state.cells || 0)) + Math.sqrt(Math.max(0, population)) * 6 + Number(state.burgs || 0) * 2;
    powers.set(state.i, Math.max(1, Number(state.powerScore || 0) || fallbackPower));
  }

  return {
    powers,
    averagePower: average([...powers.values()]),
    averageResource: average(validStates.map(state => Number(state.resourcePotential || 0))),
    cultureItems: society?.cultures || [],
    religionItems: society?.religions || [],
    features: pack?.features || []
  };
}

function statePower(context, stateId) {
  return context.powers.get(stateId) || 1;
}

function setPairRelation(subject, object, relation) {
  const normalized = normalizeDiplomacyRelation(relation) || "Neutral";
  subject.diplomacy[object.i] = normalized;
  object.diplomacy[subject.i] = inverseRelation(normalized);
}

function inverseRelation(relation) {
  return INVERSE_RELATION[relation] || relation;
}

function ensureDiplomacyArrays(states) {
  const validStates = states.filter(state => state?.i && !state.removed);
  for (const state of validStates) {
    if (!Array.isArray(state.diplomacy) || state.diplomacy.length < states.length) {
      const next = new Array(states.length).fill("x");
      for (let index = 0; index < state.diplomacy?.length; index++) next[index] = state.diplomacy[index];
      state.diplomacy = next;
    }
    state.diplomacy[state.i] = "x";
  }
}

function refreshDiplomacySummaries(states) {
  const validIds = new Set((states || []).filter(state => state?.i && !state.removed).map(state => state.i));
  for (const state of states || []) {
    if (!state?.i || state.removed) continue;
    const counts = {};
    for (let id = 1; id < (states || []).length; id++) {
      if (id === state.i || !validIds.has(id)) continue;
      const relation = state.diplomacy?.[id] || "Unknown";
      counts[relation] = (counts[relation] || 0) + 1;
    }
    state.diplomacySummary = counts;
  }
}

function summarizeDiplomacy(states, buildMs = 0) {
  const validStates = (states || []).filter(state => state?.i && !state.removed);
  const relationCounts = {};
  let pairs = 0;

  for (let aIndex = 0; aIndex < validStates.length; aIndex++) {
    const a = validStates[aIndex];
    for (let bIndex = aIndex + 1; bIndex < validStates.length; bIndex++) {
      const b = validStates[bIndex];
      const relation = canonicalPairRelation(a.diplomacy?.[b.i], b.diplomacy?.[a.i]);
      relationCounts[relation] = (relationCounts[relation] || 0) + 1;
      pairs++;
    }
  }

  return {
    states: validStates.length,
    pairs,
    relationCounts,
    allies: relationCounts.Ally || 0,
    rivals: relationCounts.Rival || 0,
    enemies: relationCounts.Enemy || 0,
    vassals: relationCounts.Vassal || 0,
    unknown: relationCounts.Unknown || 0,
    chronicle: Array.isArray(states?.[0]?.diplomacy) ? states[0].diplomacy.length : 0,
    buildMs: roundMs(buildMs)
  };
}

function canonicalPairRelation(a, b) {
  if (a === "Vassal" || a === "Suzerain" || b === "Vassal" || b === "Suzerain") return "Vassal";
  return normalizeDiplomacyRelation(a) || normalizeDiplomacyRelation(b) || "Unknown";
}

function createRelationHistoryEntry(subject, object, oldRelation, relation, reason) {
  const subjectName = subject.name || `#${subject.i}`;
  const objectName = object.name || `#${object.i}`;
  if (oldRelation === "Enemy") return ["停战", `${subjectName}与${objectName}结束战争，关系改为${diplomacyRelationLabel(relation)}`];
  if (relation === "Enemy") return ["战争爆发", `${subjectName}向${objectName}宣战`];
  if (relation === "Ally") return ["防御盟约", `${subjectName}与${objectName}缔结同盟`];
  if (relation === "Vassal") return ["附庸关系", `${subjectName}成为${objectName}的附庸`];
  if (relation === "Suzerain") return ["附庸关系", `${subjectName}使${objectName}成为附庸`];
  if (relation === "Rival") return ["宿敌关系", `${subjectName}与${objectName}成为宿敌`];
  if (relation === "Unknown") return ["断绝往来", `${subjectName}与${objectName}断绝正式往来`];
  return ["外交变化", `${subjectName}与${objectName}的关系改为${diplomacyRelationLabel(relation)}（${reason}）`];
}

function isRemoteNavalPair(pack, from, to) {
  if (from.type !== "Naval" || to.type !== "Naval") return false;
  const fromFeature = pack?.cells?.f?.[from.center];
  const toFeature = pack?.cells?.f?.[to.center];
  return fromFeature !== undefined && toFeature !== undefined && fromFeature !== toFeature;
}

function sharesHeritage(items = [], aId, bId) {
  const a = items?.[aId];
  const b = items?.[bId];
  if (!aId || !bId || !a || !b) return false;
  if (aId === bId) return true;
  const aLine = new Set([aId, ...(Array.isArray(a.lineage) ? a.lineage : []), ...(Array.isArray(a.origins) ? a.origins : [])].filter(Number.isInteger));
  const bLine = new Set([bId, ...(Array.isArray(b.lineage) ? b.lineage : []), ...(Array.isArray(b.origins) ? b.origins : [])].filter(Number.isInteger));
  for (const id of aLine) if (bLine.has(id)) return true;
  return false;
}

function improveRelation(relation, random) {
  if (relation === "Unknown") return "Neutral";
  if (relation === "Rival") return random.next() < 0.5 ? "Suspicion" : "Neutral";
  if (relation === "Suspicion") return "Neutral";
  if (relation === "Neutral") return "Friendly";
  if (relation === "Friendly" && random.next() < 0.28) return "Ally";
  return relation;
}

function worsenRelation(relation, random) {
  if (relation === "Ally") return "Friendly";
  if (relation === "Friendly") return "Neutral";
  if (relation === "Neutral") return random.next() < 0.55 ? "Suspicion" : "Rival";
  if (relation === "Suspicion") return "Rival";
  if (relation === "Unknown") return "Suspicion";
  return relation;
}

function weightedChoice(random, weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random.next() * total;
  for (const [key, weight] of entries) {
    if (roll < weight) return key;
    roll -= weight;
  }
  return entries[0]?.[0] || "Neutral";
}

function average(values) {
  const filtered = values.map(Number).filter(Number.isFinite);
  return filtered.length ? filtered.reduce((sum, value) => sum + value, 0) / filtered.length : 0;
}

function roundMs(value) {
  return Math.round(value * 100) / 100;
}
