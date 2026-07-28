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

export const DIPLOMACY_RULE_ACTION = Object.freeze({
  DECLARE_WAR: "diplomacy.declare-war",
  MAKE_PEACE: "diplomacy.make-peace",
  CHANGE_OVERLORD: "diplomacy.change-overlord"
});

const PEACE_RELATIONS = new Set(["Ally", "Friendly", "Neutral", "Suspicion", "Rival", "Unknown"]);

export function inspectDiplomacyRuleTransaction(map, actionId, input = {}) {
  if (actionId === DIPLOMACY_RULE_ACTION.DECLARE_WAR) return inspectDeclareWar(map, input);
  if (actionId === DIPLOMACY_RULE_ACTION.MAKE_PEACE) return inspectMakePeace(map, input);
  if (actionId === DIPLOMACY_RULE_ACTION.CHANGE_OVERLORD) return inspectOverlordChange(map, input);
  return rejectedRule("unknown-action", "未知的外交规则事务");
}

export function inspectDeclareWar(map, input = {}) {
  const attackerStateId = positiveInteger(input.attackerStateId);
  const defenderStateId = positiveInteger(input.defenderStateId);
  if (!attackerStateId || !defenderStateId) return rejectedRule("invalid-state-pair", "宣战双方必须是有效国家 ID");
  if (attackerStateId === defenderStateId) return rejectedRule("same-state", "国家不能向自己宣战");
  const states = diplomacyStates(map);
  const attacker = states[attackerStateId];
  const defender = states[defenderStateId];
  if (!isActiveState(attacker)) return rejectedRule("attacker-not-found", "进攻方国家不存在或已移除");
  if (!isActiveState(defender)) return rejectedRule("defender-not-found", "防守方国家不存在或已移除");
  if (isMutualRelation(attacker, defender, "Enemy")) return rejectedRule("war-already-active", "双方已经处于战争状态");
  if (isDirectOverlordPair(attacker, defender)) {
    return rejectedRule("direct-vassal-war-forbidden", "直接宗主与附庸不能互相宣战");
  }
  const reason = normalizeText(input.reason, 160);
  return allowedRule({
    operation: "declare-war",
    attackerStateId,
    defenderStateId,
    reason,
    summary: `国家 #${attackerStateId} 向国家 #${defenderStateId} 宣战`
  }, {attackerStateId, defenderStateId, ...(reason ? {reason} : {})}, [
    {kind: "state", id: attackerStateId},
    {kind: "state", id: defenderStateId}
  ]);
}

export function inspectMakePeace(map, input = {}) {
  const leftStateId = positiveInteger(input.leftStateId);
  const rightStateId = positiveInteger(input.rightStateId);
  if (!leftStateId || !rightStateId) return rejectedRule("invalid-state-pair", "议和双方必须是有效国家 ID");
  if (leftStateId === rightStateId) return rejectedRule("same-state", "国家不能与自己议和");
  const states = diplomacyStates(map);
  const left = states[leftStateId];
  const right = states[rightStateId];
  if (!isActiveState(left)) return rejectedRule("left-not-found", "议和左方国家不存在或已移除");
  if (!isActiveState(right)) return rejectedRule("right-not-found", "议和右方国家不存在或已移除");
  if (!isMutualRelation(left, right, "Enemy")) return rejectedRule("war-not-active", "双方当前没有可结束的直接战争");
  const relation = String(input.relation || "Neutral").trim();
  if (!PEACE_RELATIONS.has(relation)) {
    return rejectedRule("invalid-peace-relation", "战后关系必须是受支持的非战争、非宗藩关系");
  }
  const terms = normalizePeaceTerms(input.terms, leftStateId, rightStateId);
  if (!terms.valid) return rejectedRule(terms.code, terms.summary);
  return allowedRule({
    operation: "make-peace",
    leftStateId,
    rightStateId,
    relation,
    terms: terms.value,
    summary: `国家 #${leftStateId} 与国家 #${rightStateId} 议和`
  }, {
    leftStateId,
    rightStateId,
    relation,
    ...(terms.value ? {terms: terms.value} : {})
  }, [
    {kind: "state", id: leftStateId},
    {kind: "state", id: rightStateId}
  ]);
}

export function inspectOverlordChange(map, input = {}) {
  const vassalStateId = positiveInteger(input.vassalStateId);
  if (!vassalStateId || !isActiveState(diplomacyStates(map)[vassalStateId])) {
    return rejectedRule("vassal-not-found", "附庸国家不存在或已移除");
  }
  const overlordStateId = input.overlordStateId === null ? null : positiveInteger(input.overlordStateId);
  if (input.overlordStateId !== null && !overlordStateId) {
    return rejectedRule("overlord-not-found", "宗主国家不存在或已移除");
  }
  if (overlordStateId === vassalStateId) return rejectedRule("same-state", "国家不能成为自己的宗主");
  const states = diplomacyStates(map);
  if (overlordStateId && !isActiveState(states[overlordStateId])) {
    return rejectedRule("overlord-not-found", "宗主国家不存在或已移除");
  }
  const currentOverlordId = directOverlordId(states, vassalStateId);
  if (overlordStateId === null && !currentOverlordId) {
    return rejectedRule("overlord-missing", "该国家当前没有可解除的直接宗主");
  }
  if (overlordStateId && currentOverlordId === overlordStateId) {
    return rejectedRule("overlord-unchanged", "直接宗主没有变化");
  }
  const releaseRelation = String(input.releaseRelation || "Neutral").trim();
  if (!PEACE_RELATIONS.has(releaseRelation)) {
    return rejectedRule("invalid-release-relation", "解除旧宗藩后的关系必须是普通非战争关系");
  }
  if (overlordStateId && isMutualRelation(states[vassalStateId], states[overlordStateId], "Enemy")) {
    return rejectedRule("overlord-war-conflict", "直接战争双方不能建立宗藩关系");
  }
  if (overlordStateId && wouldCreateOverlordCycle(states, vassalStateId, overlordStateId)) {
    return rejectedRule("overlord-cycle", "宗藩变更会形成循环");
  }
  const operation = overlordStateId === null ? "release" : currentOverlordId ? "transfer" : "vassalize";
  return allowedRule({
    operation,
    vassalStateId,
    overlordStateId,
    previousOverlordStateId: currentOverlordId || null,
    releaseRelation,
    summary: operation === "release"
      ? `解除国家 #${vassalStateId} 的宗藩关系`
      : `国家 #${vassalStateId} 改奉国家 #${overlordStateId} 为宗主`
  }, {vassalStateId, overlordStateId, releaseRelation}, [
    {kind: "state", id: vassalStateId},
    ...(currentOverlordId ? [{kind: "state", id: currentOverlordId}] : []),
    ...(overlordStateId ? [{kind: "state", id: overlordStateId}] : [])
  ]);
}

export function createDeclareWarCommand(input = {}, options = {}) {
  return createDiplomacyRuleCommand(DIPLOMACY_RULE_ACTION.DECLARE_WAR, input, options);
}

export function createMakePeaceCommand(input = {}, options = {}) {
  return createDiplomacyRuleCommand(DIPLOMACY_RULE_ACTION.MAKE_PEACE, input, options);
}

export function createChangeOverlordCommand(input = {}, options = {}) {
  return createDiplomacyRuleCommand(DIPLOMACY_RULE_ACTION.CHANGE_OVERLORD, input, options);
}

function createDiplomacyRuleCommand(actionId, input, options) {
  let frozenPlan = null;
  let snapshot = null;
  let result = null;
  return {
    label: options.label || diplomacyRuleLabel(actionId),
    domain: "diplomacy-rule",
    effects: {
      ...DIPLOMACY_EFFECTS,
      affected: systemAffected("diplomacy-rule")
    },
    apply(context) {
      const map = context?.map;
      const inspection = frozenPlan || inspectDiplomacyRuleTransaction(map, actionId, input);
      if (!inspection.allowed) throw diplomacyRuleError(inspection);
      frozenPlan ??= clonePlain(inspection);
      snapshot ??= snapshotDiplomacyRule(map);
      try {
        prepareDiplomacyRuleMap(map);
        if (actionId === DIPLOMACY_RULE_ACTION.DECLARE_WAR) result = applyDeclareWar(map, frozenPlan, options);
        else if (actionId === DIPLOMACY_RULE_ACTION.MAKE_PEACE) result = applyMakePeace(map, frozenPlan, options);
        else result = applyOverlordChange(map, frozenPlan, options);
        options.refreshSummary?.(map);
        this.effects.affected = systemAffected("diplomacy-rule", frozenPlan.affected);
      } catch (error) {
        restoreDiplomacyRule(map, snapshot);
        result = null;
        throw error;
      }
    },
    revert(context) {
      if (!snapshot) throw new Error("缺少可撤销的外交规则事务快照");
      restoreDiplomacyRule(context?.map, snapshot);
    },
    isNoop() {
      return false;
    },
    getInspection() {
      return frozenPlan ? clonePlain(frozenPlan) : null;
    },
    getResult() {
      return result ? clonePlain(result) : null;
    }
  };
}

function applyDeclareWar(map, plan, options) {
  setDiplomacyRelation(map.pack, plan.attackerStateId, plan.defenderStateId, "Enemy", {
    record: true,
    reason: plan.reason || "正式宣战"
  });
  injectRuleFault(options, "after-relation");
  syncDiplomacy(map);
  ensureMilitaryCampaignContext(map, plan.attackerStateId, plan.defenderStateId);
  injectRuleFault(options, "after-war-context");
  const reconciliation = reconcileWarDerivedData(map);
  injectRuleFault(options, "after-reconcile");
  validateDiplomacyRuleResult(map, plan);
  return diplomacyRuleResult(plan, reconciliation);
}

function applyMakePeace(map, plan, options) {
  setDiplomacyRelation(map.pack, plan.leftStateId, plan.rightStateId, plan.relation, {
    record: true,
    reason: peaceReason(plan.terms)
  });
  injectRuleFault(options, "after-relation");
  syncDiplomacy(map);
  recordPeaceTerms(map, plan);
  injectRuleFault(options, "after-terms");
  const reconciliation = reconcileWarDerivedData(map);
  injectRuleFault(options, "after-reconcile");
  validateDiplomacyRuleResult(map, plan);
  return diplomacyRuleResult(plan, reconciliation);
}

function applyOverlordChange(map, plan, options) {
  if (plan.previousOverlordStateId) {
    setDiplomacyRelation(map.pack, plan.previousOverlordStateId, plan.vassalStateId, plan.releaseRelation, {
      record: true,
      reason: plan.operation === "transfer" ? "宗藩转移，解除旧宗主" : "解除宗藩"
    });
  }
  injectRuleFault(options, "after-release");
  if (plan.overlordStateId) {
    setDiplomacyRelation(map.pack, plan.overlordStateId, plan.vassalStateId, "Vassal", {
      record: true,
      reason: plan.operation === "transfer" ? "宗藩转移" : "建立宗藩"
    });
  }
  injectRuleFault(options, "after-vassalize");
  syncDiplomacy(map);
  const reconciliation = reconcileWarDerivedData(map);
  injectRuleFault(options, "after-reconcile");
  validateDiplomacyRuleResult(map, plan);
  return diplomacyRuleResult(plan, reconciliation);
}

function normalizePeaceTerms(value, leftStateId, rightStateId) {
  if (value === undefined || value === null) return {valid: true, value: null};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {valid: false, code: "invalid-peace-terms", summary: "和平条款必须是结构化对象"};
  }
  const unsupported = Object.keys(value).filter(key => !["reparations", "note"].includes(key));
  if (unsupported.length) {
    return {valid: false, code: "peace-term-rejected", summary: `首版不安全执行条款：${unsupported.join("、")}`};
  }
  const note = normalizeText(value.note, 240);
  let reparations = null;
  if (value.reparations !== undefined) {
    const source = value.reparations;
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      return {valid: false, code: "invalid-peace-terms", summary: "赔款条款必须是对象"};
    }
    const fromStateId = positiveInteger(source.fromStateId);
    const toStateId = positiveInteger(source.toStateId);
    const amount = Number(source.amount);
    if (![leftStateId, rightStateId].includes(fromStateId)
      || ![leftStateId, rightStateId].includes(toStateId)
      || fromStateId === toStateId
      || !Number.isFinite(amount)
      || amount <= 0) {
      return {valid: false, code: "invalid-peace-terms", summary: "赔款双方必须是议和双方且金额为正数"};
    }
    reparations = {
      fromStateId,
      toStateId,
      amount: Math.round(amount * 100) / 100,
      unit: normalizeText(source.unit, 40) || "记账单位",
      note: normalizeText(source.note, 160)
    };
  }
  return {valid: true, value: note || reparations ? {reparations, note} : null};
}

function prepareDiplomacyRuleMap(map) {
  if (!map?.pack) throw new Error("地图缺少 pack 数据");
  const states = diplomacyStates(map);
  if (!Array.isArray(map.pack.states)) map.pack.states = states;
  if (!map.pack.states[0]) map.pack.states[0] = {id: 0, i: 0, name: "中立", diplomacy: []};
  if (!Array.isArray(map.pack.states[0].diplomacy)) map.pack.states[0].diplomacy = [];
  if (!map.pack.diplomacy) {
    map.pack.diplomacy = {relations: {}, chronicle: map.pack.states[0].diplomacy, metadata: {}};
  }
  map.diplomacy = map.pack.diplomacy;
  if (!map.military && map.pack.military) map.military = map.pack.military;
  if (!map.military) map.military = {campaigns: [], fronts: [], events: [], metadata: {}};
  map.pack.military = map.military;
}

function ensureMilitaryCampaignContext(map, attackerStateId, defenderStateId) {
  const attacker = map.pack.states[attackerStateId];
  const stateCampaign = (attacker.campaigns || []).find(item =>
    Number(item.attacker) === attackerStateId && Number(item.defender) === defenderStateId
  );
  if (!stateCampaign) throw validationError("宣战后没有建立国家战争 campaign");
  const military = map.military;
  const exists = (military.campaigns || []).some(item => sameStatePair(item, attackerStateId, defenderStateId));
  if (!exists) {
    const id = `campaign:${attackerStateId}:${defenderStateId}:${stableHash(stateCampaign.name || "")}`;
    military.campaigns.push({
      id,
      key: id,
      chainKey: id,
      name: stateCampaign.name,
      start: stateCampaign.start || null,
      status: "active",
      attacker: attackerStateId,
      attackerName: attacker.fullName || attacker.name || `国家 #${attackerStateId}`,
      defender: defenderStateId,
      defenderName: map.pack.states[defenderStateId].fullName || map.pack.states[defenderStateId].name || `国家 #${defenderStateId}`,
      cause: stateCampaign.cause || "manual",
      causeLabel: stateCampaign.causeLabel || "外交宣战",
      causeDetail: stateCampaign.causeDetail || "",
      resourceKeys: [],
      fronts: 0,
      frontIds: [],
      hasSharedLandFront: false,
      statusLabel: "进行中"
    });
  }
  military.metadata = {...(military.metadata || {}), campaigns: military.campaigns.length, fronts: (military.fronts || []).length};
}

function recordPeaceTerms(map, plan) {
  if (!plan.terms) return;
  const chronicle = map.pack.states[0].diplomacy;
  chronicle.push([
    "和平条款",
    JSON.stringify({
      leftStateId: plan.leftStateId,
      rightStateId: plan.rightStateId,
      relation: plan.relation,
      terms: plan.terms,
      economicSettlement: "record-only"
    })
  ]);
  map.pack.diplomacy.chronicle = chronicle;
}

function validateDiplomacyRuleResult(map, plan) {
  const states = map.pack.states;
  const errors = [];
  if (plan.operation === "declare-war") {
    if (!isMutualRelation(states[plan.attackerStateId], states[plan.defenderStateId], "Enemy")) errors.push("宣战关系未双向同步");
    if (!(states[plan.attackerStateId].campaigns || []).some(item => sameStatePair(item, plan.attackerStateId, plan.defenderStateId))) {
      errors.push("宣战 campaign 缺失");
    }
  } else if (plan.operation === "make-peace") {
    if (states[plan.leftStateId].diplomacy?.[plan.rightStateId] !== plan.relation
      || states[plan.rightStateId].diplomacy?.[plan.leftStateId] !== plan.relation) errors.push("战后关系未双向同步");
    if ((states[plan.leftStateId].campaigns || []).some(item => sameStatePair(item, plan.leftStateId, plan.rightStateId))) errors.push("国家 campaign 未清理");
    if ((map.military?.campaigns || []).some(item => sameStatePair(item, plan.leftStateId, plan.rightStateId))) errors.push("军事 campaign 未清理");
    if ((map.military?.fronts || []).some(item => sameStatePair(item, plan.leftStateId, plan.rightStateId))) errors.push("军事 front 未清理");
    if ((map.pack?.zones || []).some(item => item?.type === "Warzone" && sameStatePair(item, plan.leftStateId, plan.rightStateId))) errors.push("战区未清理");
  } else {
    const current = directOverlordId(states, plan.vassalStateId);
    if (plan.overlordStateId && current !== plan.overlordStateId) errors.push("新宗主未同步");
    if (!plan.overlordStateId && current) errors.push("宗藩关系未解除");
    if (plan.previousOverlordStateId
      && states[plan.previousOverlordStateId].diplomacy?.[plan.vassalStateId] !== plan.releaseRelation) errors.push("旧宗主关系未复原");
  }
  for (const state of states.filter(isActiveState)) {
    if (directOverlordIds(states, Number(state.i ?? state.id)).length > 1) errors.push(`国家 #${state.i ?? state.id} 存在多个直接宗主`);
  }
  if (Array.isArray(map.politics?.states) && map.politics.states !== states) {
    for (const state of states.filter(isActiveState)) {
      const id = Number(state.i ?? state.id);
      if (JSON.stringify(state.diplomacy) !== JSON.stringify(map.politics.states[id]?.diplomacy)
        || JSON.stringify(state.campaigns || []) !== JSON.stringify(map.politics.states[id]?.campaigns || [])) {
        errors.push(`国家 #${id} 的 politics 镜像未同步`);
        break;
      }
    }
  }
  if (errors.length) throw validationError(errors.join("；"));
}

function snapshotDiplomacyRule(map) {
  const pack = map?.pack;
  const states = diplomacyStates(map);
  const stateChronicle = states[0]?.diplomacy;
  const mapDiplomacyPresent = hasOwn(map, "diplomacy");
  const packDiplomacyPresent = hasOwn(pack, "diplomacy");
  const mapDiplomacy = mapDiplomacyPresent ? map.diplomacy : undefined;
  const packDiplomacy = packDiplomacyPresent ? pack.diplomacy : undefined;
  const mapMilitaryPresent = hasOwn(map, "military");
  const packMilitaryPresent = hasOwn(pack, "military");
  const mapMilitary = mapMilitaryPresent ? map.military : undefined;
  const packMilitary = packMilitaryPresent ? pack.military : undefined;
  const mapZonesPresent = hasOwn(map, "zones");
  const packZonesPresent = hasOwn(pack, "zones");
  const mapZones = mapZonesPresent ? map.zones : undefined;
  const packZones = packZonesPresent ? pack.zones : undefined;
  const mapZoneListPresent = hasOwn(mapZones, "zones");
  const mapZoneList = mapZoneListPresent ? mapZones.zones : undefined;
  const summaryPresent = hasOwn(map, "summary");
  return {
    base: snapshotDiplomacy(map),
    packStatesPresent: Array.isArray(map?.pack?.states),
    mapDiplomacyPresent,
    packDiplomacyPresent,
    mapDiplomacy: cloneOptional(mapDiplomacy),
    packDiplomacy: cloneOptional(packDiplomacy),
    diplomacyRootsShared: mapDiplomacyPresent && packDiplomacyPresent && mapDiplomacy === packDiplomacy,
    diplomacyChroniclesShared: hasOwn(mapDiplomacy, "chronicle")
      && hasOwn(packDiplomacy, "chronicle")
      && mapDiplomacy.chronicle === packDiplomacy.chronicle,
    mapChronicleUsesStateZero: hasOwn(mapDiplomacy, "chronicle") && mapDiplomacy.chronicle === stateChronicle,
    packChronicleUsesStateZero: hasOwn(packDiplomacy, "chronicle") && packDiplomacy.chronicle === stateChronicle,
    mapMilitaryPresent,
    packMilitaryPresent,
    mapMilitary: cloneOptional(mapMilitary),
    packMilitary: cloneOptional(packMilitary),
    militaryRootsShared: mapMilitaryPresent && packMilitaryPresent && mapMilitary === packMilitary,
    mapZonesPresent,
    packZonesPresent,
    mapZones: cloneOptional(mapZones),
    packZones: cloneOptional(packZones),
    mapZoneListPresent,
    mapZoneList: cloneOptional(mapZoneList),
    zoneListsShared: mapZoneListPresent && packZonesPresent && mapZoneList === packZones,
    summaryPresent,
    summary: summaryPresent ? cloneOptional(map.summary) : undefined
  };
}

function restoreDiplomacyRule(map, snapshot) {
  restoreDiplomacy(map, snapshot.base);
  restoreDiplomacyRoots(map, snapshot);
  restoreMilitaryRoots(map, snapshot);
  restoreZoneRoots(map, snapshot);
  if (!snapshot.packStatesPresent && map?.pack) delete map.pack.states;
  if (snapshot.summaryPresent) map.summary = cloneOptional(snapshot.summary);
  else delete map.summary;
}

function restoreDiplomacyRoots(map, snapshot) {
  const pack = map?.pack;
  if (snapshot.diplomacyRootsShared && snapshot.mapDiplomacyPresent && snapshot.packDiplomacyPresent) {
    const diplomacy = cloneOptional(snapshot.mapDiplomacy);
    map.diplomacy = diplomacy;
    if (pack) pack.diplomacy = diplomacy;
  } else {
    if (snapshot.mapDiplomacyPresent) map.diplomacy = cloneOptional(snapshot.mapDiplomacy);
    else delete map.diplomacy;
    if (pack) {
      if (snapshot.packDiplomacyPresent) pack.diplomacy = cloneOptional(snapshot.packDiplomacy);
      else delete pack.diplomacy;
    }
  }

  const mapDiplomacy = map.diplomacy;
  const packDiplomacy = pack?.diplomacy;
  const stateChronicle = diplomacyStates(map)[0]?.diplomacy;
  if (snapshot.mapChronicleUsesStateZero && hasOwn(mapDiplomacy, "chronicle")) mapDiplomacy.chronicle = stateChronicle;
  if (snapshot.packChronicleUsesStateZero && hasOwn(packDiplomacy, "chronicle")) packDiplomacy.chronicle = stateChronicle;
  if (snapshot.diplomacyChroniclesShared
    && hasOwn(mapDiplomacy, "chronicle")
    && hasOwn(packDiplomacy, "chronicle")) {
    const chronicle = snapshot.mapChronicleUsesStateZero || snapshot.packChronicleUsesStateZero
      ? stateChronicle
      : mapDiplomacy.chronicle;
    mapDiplomacy.chronicle = chronicle;
    packDiplomacy.chronicle = chronicle;
  }
}

function restoreMilitaryRoots(map, snapshot) {
  const pack = map?.pack;
  if (snapshot.militaryRootsShared && snapshot.mapMilitaryPresent && snapshot.packMilitaryPresent) {
    const military = cloneOptional(snapshot.mapMilitary);
    map.military = military;
    if (pack) pack.military = military;
    return;
  }
  if (snapshot.mapMilitaryPresent) map.military = cloneOptional(snapshot.mapMilitary);
  else delete map.military;
  if (pack) {
    if (snapshot.packMilitaryPresent) pack.military = cloneOptional(snapshot.packMilitary);
    else delete pack.military;
  }
}

function restoreZoneRoots(map, snapshot) {
  const pack = map?.pack;
  if (snapshot.mapZonesPresent) map.zones = cloneOptional(snapshot.mapZones);
  else delete map.zones;
  if (pack) {
    if (snapshot.packZonesPresent) pack.zones = cloneOptional(snapshot.packZones);
    else delete pack.zones;
  }

  const mapZones = map.zones;
  if (snapshot.mapZoneListPresent && mapZones) mapZones.zones = cloneOptional(snapshot.mapZoneList);
  else if (mapZones) delete mapZones.zones;
  if (snapshot.zoneListsShared && mapZones && pack) pack.zones = mapZones.zones;
}

function diplomacyStates(map) {
  return map?.pack?.states || map?.politics?.states || [];
}

function isActiveState(state) {
  return Boolean(state && !state.removed && Number(state.i ?? state.id) > 0);
}

function isMutualRelation(left, right, relation) {
  const leftId = Number(left?.i ?? left?.id);
  const rightId = Number(right?.i ?? right?.id);
  return left?.diplomacy?.[rightId] === relation && right?.diplomacy?.[leftId] === relation;
}

function isDirectOverlordPair(left, right) {
  const leftId = Number(left?.i ?? left?.id);
  const rightId = Number(right?.i ?? right?.id);
  return (left?.diplomacy?.[rightId] === "Vassal" && right?.diplomacy?.[leftId] === "Suzerain")
    || (left?.diplomacy?.[rightId] === "Suzerain" && right?.diplomacy?.[leftId] === "Vassal");
}

function directOverlordIds(states, vassalStateId) {
  const vassal = states[vassalStateId];
  return states.filter(isActiveState)
    .map(state => Number(state.i ?? state.id))
    .filter(id => vassal?.diplomacy?.[id] === "Suzerain" && states[id]?.diplomacy?.[vassalStateId] === "Vassal");
}

function directOverlordId(states, vassalStateId) {
  return directOverlordIds(states, vassalStateId)[0] || 0;
}

function wouldCreateOverlordCycle(states, vassalStateId, overlordStateId) {
  const visited = new Set([vassalStateId]);
  let current = overlordStateId;
  while (current) {
    if (visited.has(current)) return true;
    visited.add(current);
    current = directOverlordId(states, current);
  }
  return false;
}

function sameStatePair(value, leftId, rightId) {
  const attacker = Number(value?.attacker ?? value?.fromState);
  const defender = Number(value?.defender ?? value?.toState);
  return (attacker === leftId && defender === rightId) || (attacker === rightId && defender === leftId);
}

function allowedRule(plan, normalizedInput, affected) {
  return {
    valid: true,
    allowed: true,
    code: "ok",
    ...plan,
    normalizedInput,
    affected,
    requiresConfirm: true
  };
}

function rejectedRule(code, summary) {
  return {valid: false, allowed: false, code, summary, normalizedInput: null, affected: [], requiresConfirm: false};
}

function diplomacyRuleResult(plan, reconciliation) {
  return {
    operation: plan.operation,
    stateIds: plan.affected.filter(item => item.kind === "state").map(item => item.id),
    relation: plan.relation || (plan.operation === "declare-war" ? "Enemy" : null),
    terms: plan.terms || null,
    reconciliation,
    summary: plan.summary
  };
}

function diplomacyRuleLabel(actionId) {
  if (actionId === DIPLOMACY_RULE_ACTION.DECLARE_WAR) return "宣战";
  if (actionId === DIPLOMACY_RULE_ACTION.MAKE_PEACE) return "议和";
  return "变更宗藩关系";
}

function diplomacyRuleError(inspection) {
  const error = new Error(inspection.summary);
  error.code = inspection.code;
  error.inspection = clonePlain(inspection);
  return error;
}

function validationError(message) {
  const error = new Error(`外交规则事务一致性校验失败：${message}`);
  error.code = "diplomacy-validation-failed";
  return error;
}

function injectRuleFault(options, stage) {
  if (typeof options?.faultInjector === "function") options.faultInjector(stage);
  if (options?.faultAt === stage) throw new Error(`外交规则故障注入：${stage}`);
}

function peaceReason(terms) {
  if (!terms) return "正式议和";
  return terms.note ? `正式议和：${terms.note}` : "正式议和并记录结构化条款";
}

function normalizeText(value, limit) {
  return String(value || "").trim().slice(0, limit);
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

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

function cloneOptional(value) {
  return value === undefined ? undefined : clonePlain(value);
}

function hasOwn(value, key) {
  return Boolean(value && Object.prototype.hasOwnProperty.call(value, key));
}
