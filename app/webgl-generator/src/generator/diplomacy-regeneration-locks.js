const INVERSE = Object.freeze({Vassal: "Suzerain", Suzerain: "Vassal"});
const RELATIONS = new Set(["Ally", "Friendly", "Neutral", "Suspicion", "Rival", "Enemy", "Vassal", "Suzerain", "Unknown"]);

export function diplomacyPairKey(leftId, rightId) {
  const left = Number(leftId);
  const right = Number(rightId);
  if (!Number.isInteger(left) || !Number.isInteger(right) || left <= 0 || right <= 0 || left === right) return "";
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

export function parseDiplomacyPairIdentity(source) {
  const [idLeft, idRight] = String(source?.id ?? source?.pairId ?? "").split(":");
  const subject = Number(source?.subjectId ?? source?.leftId ?? idLeft);
  const object = Number(source?.objectId ?? source?.rightId ?? source?.targetId ?? idRight);
  const key = diplomacyPairKey(subject, object);
  if (!key) return null;
  const [leftId, rightId] = key.split(":").map(Number);
  return {key, leftId, rightId, subjectId: subject, objectId: object};
}

export function captureDiplomacyRelationSnapshot(pack, subjectId, objectId) {
  const identity = parseDiplomacyPairIdentity({subjectId, objectId});
  if (!identity) throw diplomacyLockConflict("外交锁包含非法国家对", {reason: "invalid-pair"});
  const states = pack?.states || [];
  const left = states[identity.leftId];
  const right = states[identity.rightId];
  if (!activeState(left) || !activeState(right)) {
    throw diplomacyLockConflict(`外交锁 ${identity.key} 的国家端点不存在`, {reason: "missing-state", pair: identity.key});
  }
  const leftRelation = left.diplomacy?.[identity.rightId];
  const rightRelation = right.diplomacy?.[identity.leftId];
  const campaigns = pairCampaigns(left, right, identity.leftId, identity.rightId);
  const chronicleEntries = pairChronicleEntries(states[0]?.diplomacy, left, right);
  const militaryCampaigns = pairRecords(pack?.military?.campaigns, identity.leftId, identity.rightId);
  const fronts = pairRecords(pack?.military?.fronts, identity.leftId, identity.rightId);
  const warzones = pairRecords(pack?.zones, identity.leftId, identity.rightId);
  return {
    id: identity.key,
    leftId: identity.leftId,
    rightId: identity.rightId,
    leftRelation,
    rightRelation,
    campaigns,
    chronicleEntries,
    militaryCampaigns,
    fronts,
    warzones
  };
}

export function prepareLockedDiplomacyRelations(pack, options = {}) {
  const sources = [];
  const seenInputs = new Set();
  for (const collection of [options.preservedRelations, options.lockedDiplomacyRelations]) {
    if (collection !== undefined && !Array.isArray(collection)) {
      throw diplomacyLockConflict("锁定外交关系约束必须是数组", {reason: "invalid-constraint"});
    }
    for (const source of collection || []) {
      const identity = parseDiplomacyPairIdentity(source);
      if (!identity) throw diplomacyLockConflict("锁定外交关系包含非法国家对", {reason: "invalid-pair"});
      if (seenInputs.has(identity.key)) continue;
      seenInputs.add(identity.key);
      const current = captureDiplomacyRelationSnapshot(pack, identity.leftId, identity.rightId);
      const normalized = normalizeProvidedSnapshot(source, identity, current);
      sources.push(normalized);
    }
  }
  return {pairs: new Map(sources.map(snapshot => [snapshot.id, snapshot])), ids: new Set(sources.map(snapshot => snapshot.id))};
}

export function seedLockedDiplomacyRelations(states, chronicle, locked) {
  const chronicleSeen = new Set((chronicle || []).map(stableValue));
  for (const snapshot of locked.pairs.values()) {
    const left = states[snapshot.leftId];
    const right = states[snapshot.rightId];
    left.diplomacy[snapshot.rightId] = snapshot.leftRelation;
    right.diplomacy[snapshot.leftId] = snapshot.rightRelation;
    for (const campaign of snapshot.campaigns) {
      const clone = clonePlain(campaign);
      left.campaigns.push(clone);
      right.campaigns.push(clone);
    }
    for (const entry of snapshot.chronicleEntries) {
      const key = stableValue(entry);
      if (chronicleSeen.has(key)) continue;
      chronicle.push(clonePlain(entry));
      chronicleSeen.add(key);
    }
  }
}

export function assertLockedDiplomacyRelations(pack, locked) {
  for (const snapshot of locked.pairs.values()) {
    const current = captureDiplomacyRelationSnapshot(pack, snapshot.leftId, snapshot.rightId);
    for (const key of ["leftRelation", "rightRelation", "campaigns", "chronicleEntries", "militaryCampaigns", "fronts", "warzones"]) {
      if (stableValue(current[key]) !== stableValue(snapshot[key])) {
        throw diplomacyLockConflict(`锁定外交关系 ${snapshot.id} 的 ${key} 被改写`, {reason: "locked-derived-changed", pair: snapshot.id, field: key});
      }
    }
  }
}

export function diplomacyLockConflict(message, details = {}) {
  const error = new Error(`regeneration_lock_conflict: ${message}`);
  error.code = "regeneration_lock_conflict";
  error.details = {kind: "diplomacy-relation", ...details};
  return error;
}

function normalizeProvidedSnapshot(source, identity, current) {
  const directional = relationFromSource(source, identity);
  const leftRelation = directional.leftRelation || current.leftRelation;
  const rightRelation = directional.rightRelation || current.rightRelation;
  if (leftRelation !== current.leftRelation || rightRelation !== current.rightRelation) {
    throw diplomacyLockConflict(`锁定外交关系 ${identity.key} 与当前矩阵矛盾`, {reason: "matrix-mismatch", pair: identity.key});
  }
  const snapshot = {
    id: identity.key,
    leftId: identity.leftId,
    rightId: identity.rightId,
    leftRelation,
    rightRelation,
    campaigns: clonePlain(source.campaigns ?? current.campaigns),
    chronicleEntries: clonePlain(source.chronicleEntries ?? current.chronicleEntries),
    militaryCampaigns: clonePlain(source.militaryCampaigns ?? current.militaryCampaigns),
    fronts: clonePlain(source.fronts ?? current.fronts),
    warzones: clonePlain(source.warzones ?? current.warzones)
  };
  return snapshot;
}

function relationFromSource(source, identity) {
  const leftRelation = normalizeDiplomacyRelation(source.leftRelation);
  const rightRelation = normalizeDiplomacyRelation(source.rightRelation);
  if (leftRelation || rightRelation) return {leftRelation, rightRelation};
  const relation = normalizeDiplomacyRelation(source.relation);
  const inverse = normalizeDiplomacyRelation(source.inverseRelation);
  if (!relation) return {};
  if (identity.subjectId === identity.leftId) return {leftRelation: relation, rightRelation: inverse || inverseRelation(relation)};
  return {leftRelation: inverse || inverseRelation(relation), rightRelation: relation};
}

function pairCampaigns(left, right, leftId, rightId) {
  const leftCampaigns = pairRecords(left?.campaigns, leftId, rightId);
  const rightCampaigns = pairRecords(right?.campaigns, leftId, rightId);
  if (stableValue(leftCampaigns) !== stableValue(rightCampaigns)) {
    throw diplomacyLockConflict(`外交锁 ${diplomacyPairKey(leftId, rightId)} 的国家战役镜像矛盾`, {
      reason: "campaign-mirror-mismatch",
      pair: diplomacyPairKey(leftId, rightId)
    });
  }
  return leftCampaigns;
}

function pairChronicleEntries(entries, left, right) {
  const leftName = String(left?.name || left?.fullName || "").trim();
  const rightName = String(right?.name || right?.fullName || "").trim();
  if (!leftName || !rightName) return [];
  return clonePlain((entries || []).filter(entry => {
    const text = Array.isArray(entry) ? entry.join(" ") : String(entry || "");
    return text.includes(leftName) && text.includes(rightName);
  }));
}

function pairRecords(records, leftId, rightId) {
  return clonePlain((records || []).filter(record => {
    const first = Number(record?.attacker ?? record?.fromState);
    const second = Number(record?.defender ?? record?.toState);
    return diplomacyPairKey(first, second) === diplomacyPairKey(leftId, rightId);
  }));
}

function pairWarzones(zones, leftId, rightId) {
  return pairRecords((zones || []).filter(zone => zone?.type === "Warzone"), leftId, rightId);
}

function inverseRelation(relation) {
  return INVERSE[relation] || relation;
}

function normalizeDiplomacyRelation(relation) {
  return RELATIONS.has(relation) ? relation : null;
}

function activeState(state) {
  return Boolean(state?.i && !state.removed);
}

function stableValue(value) {
  return JSON.stringify(value);
}

function clonePlain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
