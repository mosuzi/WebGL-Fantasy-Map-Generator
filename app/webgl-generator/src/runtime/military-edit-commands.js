import {applyRegimentIconProfile, buildMilitary, MILITARY_STATUSES, MILITARY_UNITS, normalizeUnitRatios} from "../generator/military.js";
import {stableHash} from "../generator/random.js";
import {resolveWarzoneStatePair} from "../generator/war-consistency.js";
import {
  assertLockedMilitaryRegiments,
  captureMilitaryRegimentSnapshot,
  militaryLockConflict,
  prepareLockedMilitaryRegiments
} from "../generator/military-regeneration-locks.js";
import {objectAffected, systemAffected} from "./edit-command-effects.js";
import {
  compareMilitaryVariation,
  snapshotMilitaryVariation,
  syncMilitaryStateMirrors
} from "./military-regeneration-variation.js";

const MILITARY_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["point-layers", "line-layers", "object-index", "labels", "object-panels"])
});

const MILITARY_REGIMENT_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["point-layers", "object-index", "object-panels"])
});

const MILITARY_EVENT_EFFECTS = Object.freeze({
  render: "none",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["object-panels"])
});

const MILITARY_BATTLE_RESULT_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["point-layers", "object-index", "object-panels"])
});

const BATTLE_EVENT_TYPES = Object.freeze({
  skirmish: "遭遇战",
  siege: "攻城",
  raid: "袭扰",
  naval: "海战",
  retreat: "撤退",
  report: "战报"
});

const BATTLE_EVENT_OUTCOMES = Object.freeze({
  victory: "小胜",
  defeat: "受挫",
  draw: "相持",
  loss: "损耗",
  regroup: "重整"
});

const BATTLE_RESULT_RULES = Object.freeze({
  victory: Object.freeze({lossRate: 0.04, status: "resting", label: "小胜后整队"}),
  defeat: Object.freeze({lossRate: 0.18, status: "routed", label: "受挫败退"}),
  draw: Object.freeze({lossRate: 0.08, status: "resting", label: "相持修整"}),
  loss: Object.freeze({lossRate: 0.25, status: "routed", label: "损耗败退"}),
  regroup: Object.freeze({lossRate: 0.02, status: "mustering", label: "重整集结"})
});

const BATTLE_OPPONENT_RESULT_RULES = Object.freeze({
  victory: Object.freeze({lossRate: 0.18, status: "routed", label: "对手受挫"}),
  defeat: Object.freeze({lossRate: 0.04, status: "resting", label: "对手小胜"}),
  draw: Object.freeze({lossRate: 0.08, status: "resting", label: "对手相持"}),
  loss: Object.freeze({lossRate: 0.03, status: "resting", label: "对手追击"}),
  regroup: Object.freeze({lossRate: 0, status: null, label: "对手未变"})
});

export const MILITARY_RULE_ACTION = Object.freeze({
  RESOLVE_BATTLE: "military.resolve-battle"
});

export function inspectBattle(map, input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return rejectedBattle("invalid-battle-request", "战斗请求必须是结构化对象");
  }
  const attackerTarget = normalizeBattleRuleTarget(input.attacker);
  if (!attackerTarget) return rejectedBattle("invalid-attacker", "进攻方必须是有效军团目标");
  const defenderTarget = normalizeBattleRuleTarget(input.defender);
  if (!defenderTarget) return rejectedBattle("invalid-defender", "防守方必须是有效军团目标");
  if (attackerTarget.id === defenderTarget.id) return rejectedBattle("same-regiment", "同一军团不能与自己交战");

  const {state: attackerState, regiment: attackerRegiment} = findRegiment(map, attackerTarget);
  if (!attackerState?.i || !attackerRegiment) return rejectedBattle("attacker-regiment-not-found", "找不到进攻方军团");
  const {state: defenderState, regiment: defenderRegiment} = findRegiment(map, defenderTarget);
  if (!defenderState?.i || !defenderRegiment) return rejectedBattle("defender-regiment-not-found", "找不到防守方军团");
  if (Number(attackerState.i) === Number(defenderState.i)) return rejectedBattle("same-state", "同一国家的军团不能进行敌对结算");
  if (!statesAtWar(attackerState, defenderState)) return rejectedBattle("states-not-at-war", "双方国家没有处于双向战争关系");

  const attackerTroops = regimentTroops(attackerRegiment);
  const defenderTroops = regimentTroops(defenderRegiment);
  if (attackerTroops <= 0) return rejectedBattle("attacker-empty", "进攻方军团没有可参战兵力");
  if (defenderTroops <= 0) return rejectedBattle("defender-empty", "防守方军团没有可参战兵力");

  const outcomeProvided = hasOwn(input, "outcome");
  const seedProvided = hasOwn(input, "seed");
  if (!outcomeProvided && !seedProvided) return rejectedBattle("battle-result-required", "必须提供 outcome 或 seed");
  if (outcomeProvided && seedProvided) return rejectedBattle("battle-result-ambiguous", "outcome 与 seed 只能提供一个");
  const explicitOutcome = outcomeProvided ? String(input.outcome || "").trim() : "";
  if (outcomeProvided && !hasOwn(BATTLE_RESULT_RULES, explicitOutcome)) {
    return rejectedBattle("invalid-outcome", "战斗结果不在支持范围内");
  }
  const userSeed = seedProvided && typeof input.seed === "string" ? input.seed.trim() : "";
  if (seedProvided && !userSeed) return rejectedBattle("invalid-seed", "seed 必须是非空字符串");

  const attackerNaval = isNavalRegiment(attackerRegiment);
  const defenderNaval = isNavalRegiment(defenderRegiment);
  const defaultType = attackerNaval ? "naval" : "skirmish";
  const type = hasOwn(input, "type") ? String(input.type || "").trim() : defaultType;
  if (!hasOwn(BATTLE_EVENT_TYPES, type)) return rejectedBattle("invalid-battle-type", "战斗类型不在支持范围内");
  if (attackerNaval !== defenderNaval || (type === "naval") !== attackerNaval) {
    return rejectedBattle("battle-terrain-mismatch", "双方军团海陆属性或战斗类型不匹配");
  }

  const attackerCell = Number(attackerRegiment.cell);
  const defenderCell = Number(defenderRegiment.cell);
  if (!validBattleCell(map, attackerCell) || !validBattleCell(map, defenderCell)) {
    return rejectedBattle("battle-cell-missing", "双方军团必须有有效 pack cell 驻地");
  }

  const requestedWarzoneId = hasOwn(input, "warzoneId") ? input.warzoneId : null;
  const requestedWarzone = requestedWarzoneId === null || requestedWarzoneId === undefined || requestedWarzoneId === ""
    ? null
    : findBattleWarzone(map, requestedWarzoneId);
  if (requestedWarzoneId !== null && requestedWarzoneId !== undefined && requestedWarzoneId !== "" && !requestedWarzone) {
    return rejectedBattle("warzone-not-found", "找不到指定战区");
  }
  if (requestedWarzone && !warzoneMatchesStatePair(map, requestedWarzone, attackerState.i, defenderState.i)) {
    return rejectedBattle("warzone-pair-mismatch", "指定战区与参战国家对不匹配");
  }

  const adjacent = battleCellsTouch(map, attackerCell, defenderCell);
  const matchedWarzone = requestedWarzone || findMatchingBattleWarzone(map, attackerState.i, defenderState.i, attackerCell, defenderCell);
  const warzoneContact = Boolean(matchedWarzone && warzoneContainsCells(matchedWarzone, attackerCell, defenderCell));
  if (!adjacent && !warzoneContact) return rejectedBattle("battle-out-of-contact", "双方军团不在同一、相邻 cell 或同一匹配战区");

  const seedResolution = seedProvided
    ? resolveSeededBattleOutcome(map, userSeed, attackerTarget, attackerRegiment, defenderTarget, defenderRegiment)
    : {outcome: explicitOutcome, resolutionSeed: ""};
  const normalizedInput = {
    attacker: attackerTarget,
    defender: defenderTarget,
    ...(outcomeProvided ? {outcome: explicitOutcome} : {seed: userSeed}),
    type,
    ...(matchedWarzone ? {warzoneId: battleWarzoneId(matchedWarzone)} : {}),
    ...(String(input.description || "").trim() ? {description: String(input.description).trim().slice(0, 500)} : {})
  };
  return {
    valid: true,
    allowed: true,
    code: "ok",
    summary: `可结算 ${attackerRegiment.name || attackerTarget.id} 对 ${defenderRegiment.name || defenderTarget.id} 的单次战斗`,
    normalizedInput,
    requiresConfirm: true,
    affected: [
      {kind: "military", id: attackerTarget.id},
      {kind: "military", id: defenderTarget.id}
    ],
    resolvedOutcome: seedResolution.outcome,
    resolutionSeed: seedResolution.resolutionSeed,
    attackerStateId: Number(attackerState.i),
    defenderStateId: Number(defenderState.i),
    attackerCell,
    defenderCell,
    attackerTroops,
    defenderTroops
  };
}

export function createResolveBattleCommand(input = {}, options = {}) {
  let frozenPlan = null;
  let snapshot = null;
  let event = null;
  let result = null;
  return {
    label: options.label || "结算单次战斗",
    domain: "military-rule",
    effects: {
      ...MILITARY_BATTLE_RESULT_EFFECTS,
      affected: militarySystemAffected("military-battle")
    },
    apply(context) {
      const map = context?.map;
      const inspection = frozenPlan || inspectBattle(map, input);
      if (!inspection.allowed) throw battleRuleError(inspection);
      frozenPlan ??= clonePlain(inspection);
      snapshot ??= snapshotBattleRule(map);
      try {
        const attacker = findRegiment(map, frozenPlan.normalizedInput.attacker);
        const defender = findRegiment(map, frozenPlan.normalizedInput.defender);
        if (!attacker.regiment || !defender.regiment) throw battleValidationError("参战军团在执行前消失");
        const eventInput = normalizeBattleEventInput({
          type: frozenPlan.normalizedInput.type,
          outcome: frozenPlan.resolvedOutcome,
          description: frozenPlan.normalizedInput.description,
          applyResult: true,
          chainKey: `battle:${frozenPlan.normalizedInput.attacker.id}:${frozenPlan.normalizedInput.defender.id}`,
          chainLabel: "单次战斗结算",
          chainSide: "attacker",
          opponentStateId: defender.state.i,
          opponentStateName: stateName(defender.state),
          attackerStateId: attacker.state.i,
          attackerStateName: stateName(attacker.state),
          defenderStateId: defender.state.i,
          defenderStateName: stateName(defender.state)
        });
        event ??= createBattleEvent(map, attacker.state, attacker.regiment, eventInput);
        applyBattleResult(map, attacker.state, attacker.regiment, event, eventInput, defender);
        event.seed = frozenPlan.normalizedInput.seed || null;
        event.resolutionSeed = frozenPlan.resolutionSeed || null;
        event.warzoneId = frozenPlan.normalizedInput.warzoneId ?? null;
        event.result = {
          ...event.result,
          outcome: frozenPlan.resolvedOutcome,
          seed: event.seed,
          resolutionSeed: event.resolutionSeed,
          warzoneId: event.warzoneId
        };
        injectBattleRuleFault(options.faultAt, "after-result");
        appendBattleEvent(map, attacker.regiment, event);
        appendBattleEvent(map, defender.regiment, event);
        injectBattleRuleFault(options.faultAt, "after-events");
        syncMilitary(map);
        refreshMilitaryTroopMetadata(map);
        refreshMilitaryStatusMetadata(map);
        refreshMilitaryEventMetadata(map);
        injectBattleRuleFault(options.faultAt, "after-sync");
        options.refreshSummary?.(map);
        injectBattleRuleFault(options.faultAt, "after-summary");
        validateBattleResult(map, frozenPlan, event);
        injectBattleRuleFault(options.faultAt, "after-validation");
        this.effects.affected = militarySystemAffected("military-battle", frozenPlan.affected);
        result = {
          executed: true,
          summary: event.result.summary,
          outcome: frozenPlan.resolvedOutcome,
          seed: event.seed,
          resolutionSeed: event.resolutionSeed,
          warzoneId: event.warzoneId,
          eventId: event.id,
          attacker: clonePlain(event.result),
          defender: clonePlain(event.result.opponent)
        };
      } catch (error) {
        restoreBattleRule(map, snapshot);
        result = null;
        throw error;
      }
    },
    revert(context) {
      if (!snapshot) throw new Error("缺少可撤销的战斗规则快照");
      restoreBattleRule(context?.map, snapshot);
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

export function createRegenerateMilitaryCommand({
  seed = "",
  maxAttempts = 6,
  label = "重生成军事",
  faultAt = "",
  preservedRegiments = [],
  lockedMilitaryRegiments = [],
  lockedStates = []
} = {}) {
  let snapshot = null;
  let result = null;
  return {
    label,
    domain: "military",
    effects: {
      ...MILITARY_EFFECTS,
      affected: systemAffected("military-regeneration", [{kind: "military", id: "all"}])
    },
    apply(context) {
      const previousEvents = clonePlain(context.map?.military?.events || context.map?.pack?.military?.events || []);
      const previousEventSequence = Number(context.map?.military?.metadata?.eventSequence || context.map?.pack?.military?.metadata?.eventSequence || 0);
      const previousEventArchiveGeneration = Number(context.map?.military?.metadata?.eventArchiveGeneration || context.map?.pack?.military?.metadata?.eventArchiveGeneration || 0);
      const lockedSnapshots = collectLockedMilitaryRegiments(context.map, {preservedRegiments, lockedMilitaryRegiments});
      const lockedIds = new Set(lockedSnapshots.map(snapshot => snapshot.id));
      if (allMilitaryRegimentsLocked(context.map, lockedIds)) {
        result = {executed: false, reason: "all-regiments-locked", attempts: 0, lockedRegiments: lockedIds.size};
        return;
      }
      const locked = prepareLockedMilitaryRegiments(context.map.pack, {lockedMilitaryRegiments: lockedSnapshots});
      assertLockedMilitaryPoliticsMirrors(context.map, locked);
      snapshot ??= snapshotMilitary(context.map);
      const before = unlockedMilitaryVariationSnapshot(context.map, locked.ids);
      const attemptLimit = Math.max(1, Math.min(20, Number(maxAttempts) || 6));
      const baseSeed = String(seed || `${context.map?.options?.seed || "map"}:regenerate-military`);
      let attempts = 0;
      let variation = compareMilitaryVariation(before, before);
      try {
        do {
          attempts += 1;
          const attemptSeed = attempts === 1 ? baseSeed : `${baseSeed}:retry:${attempts}`;
          context.map.military = buildMilitary(context.map.pack, {
            ...context.map.options,
            seed: attemptSeed,
            lockedStates,
            lockedMilitaryRegiments: lockedSnapshots
          });
          injectMilitaryRegenerationFault(faultAt, "after-build");
          syncMilitary(context.map);
          injectMilitaryRegenerationFault(faultAt, "after-sync");
          variation = compareMilitaryVariation(before, unlockedMilitaryVariationSnapshot(context.map, locked.ids));
        } while (!variation.changed && attempts < attemptLimit);

        const archivedEvents = archiveMilitaryRegenerationEvents(context.map, previousEvents, previousEventSequence, previousEventArchiveGeneration);
        injectMilitaryRegenerationFault(faultAt, "after-events");
        const currentLocked = prepareLockedMilitaryRegiments(context.map.pack, {lockedMilitaryRegiments: lockedSnapshots});
        assertLockedMilitaryRegiments(context.map.pack, currentLocked);
        assertLockedMilitaryPoliticsMirrors(context.map, currentLocked);
        this.effects.affected = militaryRegenerationAffected(context.map);
        result = {
          executed: true,
          attempts,
          lockedRegiments: currentLocked.ids.size,
          preservedBattleEvents: archivedEvents.length,
          variation
        };
      } catch (error) {
        restoreMilitary(context.map, snapshot);
        throw error;
      }
    },
    revert(context) {
      if (!snapshot) throw new Error("缺少可撤销的军事快照");
      restoreMilitary(context.map, snapshot);
    },
    isNoop(context) {
      const validStates = (context.map?.pack?.states || []).filter(state => state?.i && !state.removed);
      if (!context.map?.pack?.cells?.i?.length || !validStates.length) return true;
      const lockedSnapshots = collectLockedMilitaryRegiments(context.map, {preservedRegiments, lockedMilitaryRegiments});
      const lockedIds = new Set(lockedSnapshots.map(snapshot => snapshot.id));
      if (allMilitaryRegimentsLocked(context.map, lockedIds)) return true;
      const locked = prepareLockedMilitaryRegiments(context.map.pack, {lockedMilitaryRegiments: lockedSnapshots});
      assertLockedMilitaryPoliticsMirrors(context.map, locked);
      return false;
    },
    getResult() {
      return result ? clonePlain(result) : null;
    }
  };
}

function archiveMilitaryRegenerationEvents(map, previousEvents, previousEventSequence, previousEventArchiveGeneration) {
  const archiveGeneration = Number(previousEventArchiveGeneration || 0) + 1;
  const archivedEvents = (previousEvents || []).map(event => ({...clonePlain(event), archived: true, archiveReason: "military-regeneration", archiveGeneration}));
  map.military ||= {};
  map.military.events = archivedEvents;
  map.military.metadata ||= {};
  map.military.metadata.events = archivedEvents.length;
  map.military.metadata.eventSequence = previousEventSequence;
  map.military.metadata.eventArchiveGeneration = archiveGeneration;
  if (map.pack) map.pack.military = map.military;
  return archivedEvents;
}

export function createSetMilitaryRatiosCommand(stateId, ratios, {label = "调整兵种比例"} = {}) {
  const normalizedStateId = Number(stateId);
  const normalizedRatios = normalizeUnitRatios(ratios);
  let snapshot = null;

  return {
    label: `${label} #${normalizedStateId}`,
    domain: "military",
    effects: {
      ...MILITARY_EFFECTS,
      affected: [
        ...objectAffected("state", normalizedStateId),
        ...objectAffected("military", normalizedStateId)
      ]
    },
    apply(context) {
      const state = context.map?.pack?.states?.[normalizedStateId] || context.map?.politics?.states?.[normalizedStateId];
      if (!state?.i) throw new Error("找不到国家");
      const lockedSnapshots = collectLockedMilitaryRegiments(context.map);
      const locked = prepareLockedMilitaryRegiments(context.map.pack, {lockedMilitaryRegiments: lockedSnapshots});
      assertLockedMilitaryPoliticsMirrors(context.map, locked);
      snapshot ??= snapshotMilitary(context.map);
      try {
        state.militaryPolicy = {...(state.militaryPolicy || {}), unitRatios: normalizedRatios};
        context.map.military = buildMilitary(context.map.pack, {
          ...context.map.options,
          lockedMilitaryRegiments: lockedSnapshots,
          lockedStates: (context.map.pack.states || []).filter(candidate => candidate?.i && Number(candidate.i) !== normalizedStateId).map(candidate => ({i: Number(candidate.i)}))
        });
        restoreMilitaryPolicyProtectedMetadata(context.map.military, snapshot.packMilitary || snapshot.military);
        syncMilitary(context.map);
        const currentLocked = prepareLockedMilitaryRegiments(context.map.pack, {lockedMilitaryRegiments: lockedSnapshots});
        assertLockedMilitaryRegiments(context.map.pack, currentLocked);
        assertLockedMilitaryPoliticsMirrors(context.map, currentLocked);
      } catch (error) {
        restoreMilitary(context.map, snapshot);
        throw error;
      }
    },
    revert(context) {
      if (!snapshot) throw new Error("缺少可撤销的军事快照");
      restoreMilitary(context.map, snapshot);
    },
    isNoop(context) {
      const state = context.map?.pack?.states?.[normalizedStateId] || context.map?.politics?.states?.[normalizedStateId];
      if (!state?.i) return true;
      return ratiosEqual(normalizeUnitRatios(state.militaryPolicy?.unitRatios), normalizedRatios);
    }
  };
}

export function createSetMilitaryStatusCommand(target, status, {label = "调整军团态势"} = {}) {
  const normalizedTarget = normalizeRegimentTarget(target);
  const nextStatus = String(status || "");
  const nextStatusLabel = MILITARY_STATUSES[nextStatus]?.label || nextStatus || "未知";
  let previous = null;

  return {
    label: `${label} #${normalizedTarget.stateId}:${normalizedTarget.regimentId}`,
    domain: "military",
    effects: {
      ...MILITARY_REGIMENT_EFFECTS,
      affected: objectAffected("military", militaryTargetId(normalizedTarget))
    },
    apply(context) {
      const {state, regiment} = findRegiment(context.map, normalizedTarget);
      if (!state?.i || !regiment) throw new Error("找不到军团");
      previous ??= snapshotRegimentStatus(regiment);
      regiment.status = nextStatus;
      regiment.statusLabel = nextStatusLabel;
      regiment.order = createManualOrder(context.map, state, regiment, nextStatus);
      syncMilitary(context.map);
      refreshMilitaryStatusMetadata(context.map);
    },
    revert(context) {
      if (!previous) throw new Error("缺少可撤销的军团态势快照");
      const {regiment} = findRegiment(context.map, normalizedTarget);
      if (!regiment) throw new Error("找不到军团");
      restoreRegimentStatus(regiment, previous);
      syncMilitary(context.map);
      refreshMilitaryStatusMetadata(context.map);
    },
    isNoop(context) {
      const {regiment} = findRegiment(context.map, normalizedTarget);
      if (!regiment) return true;
      return String(regiment.status || "") === nextStatus;
    }
  };
}

export function createSetMilitaryStatusBatchCommand(targets, status, {label = "批量调整军团态势"} = {}) {
  const normalizedTargets = uniqueRegimentTargets(targets);
  const nextStatus = String(status || "");
  const nextStatusLabel = MILITARY_STATUSES[nextStatus]?.label || nextStatus || "未知";
  let previous = null;

  return {
    label: `${label} ${normalizedTargets.length}支`,
    domain: "military",
    effects: {
      ...MILITARY_REGIMENT_EFFECTS,
      affected: militarySystemAffected("military-status", normalizedTargets.map(militaryTargetAffected))
    },
    apply(context) {
      previous ??= snapshotRegimentStatuses(context.map, normalizedTargets);
      let changed = 0;
      for (const target of normalizedTargets) {
        const {state, regiment} = findRegiment(context.map, target);
        if (!state?.i || !regiment || String(regiment.status || "") === nextStatus) continue;
        regiment.status = nextStatus;
        regiment.statusLabel = nextStatusLabel;
        regiment.order = createManualOrder(context.map, state, regiment, nextStatus);
        changed++;
      }
      if (!changed) throw new Error("没有可调整态势的军团");
      syncMilitary(context.map);
      refreshMilitaryStatusMetadata(context.map);
    },
    revert(context) {
      if (!previous) throw new Error("缺少可撤销的批量军团态势快照");
      for (const item of previous) {
        const {regiment} = findRegiment(context.map, item.target);
        if (!regiment) continue;
        restoreRegimentStatus(regiment, item.snapshot);
      }
      syncMilitary(context.map);
      refreshMilitaryStatusMetadata(context.map);
    },
    isNoop(context) {
      if (!normalizedTargets.length || !nextStatus) return true;
      return normalizedTargets.every(target => {
        const {regiment} = findRegiment(context.map, target);
        return !regiment || String(regiment.status || "") === nextStatus;
      });
    }
  };
}

export function createRecordMilitaryBattleEventCommand(target, event = {}, {label = "记录军团战斗事件"} = {}) {
  const normalizedTarget = normalizeRegimentTarget(target);
  const eventInput = normalizeBattleEventInput(event);
  let previous = null;
  let nextEvent = null;
  const effects = eventInput.applyResult ? MILITARY_BATTLE_RESULT_EFFECTS : MILITARY_EVENT_EFFECTS;

  return {
    label: `${label} #${normalizedTarget.stateId}:${normalizedTarget.regimentId}`,
    domain: "military",
    effects: {
      ...effects,
      affected: militarySystemAffected("military-events", [militaryTargetAffected(normalizedTarget)])
    },
    apply(context) {
      const {state, regiment} = findRegiment(context.map, normalizedTarget);
      if (!state?.i || !regiment) throw new Error("找不到军团");
      const opponent = eventInput.applyResult ? findOpponentBattleRegiment(context.map, state, regiment, eventInput) : null;
      previous ??= snapshotBattleEvents(context.map, state, regiment, opponent);
      nextEvent ??= createBattleEvent(context.map, state, regiment, eventInput);
      if (eventInput.applyResult) applyBattleResult(context.map, state, regiment, nextEvent, eventInput, opponent);
      appendBattleEvent(context.map, regiment, nextEvent);
      syncMilitary(context.map);
      refreshMilitaryTroopMetadata(context.map);
      refreshMilitaryStatusMetadata(context.map);
      refreshMilitaryEventMetadata(context.map);
    },
    revert(context) {
      if (!previous) throw new Error("缺少可撤销的军团战斗事件快照");
      const {state, regiment} = findRegiment(context.map, normalizedTarget);
      if (!regiment) throw new Error("找不到军团");
      restoreBattleEvents(context.map, state, regiment, previous);
      syncMilitary(context.map);
      refreshMilitaryTroopMetadata(context.map);
      refreshMilitaryStatusMetadata(context.map);
      refreshMilitaryEventMetadata(context.map);
    },
    isNoop(context) {
      const {regiment} = findRegiment(context.map, normalizedTarget);
      return !regiment || !eventInput.type || !eventInput.outcome;
    }
  };
}

export function createImportMilitaryBattleEventsCommand(document, {label = "导入军团战斗事件"} = {}) {
  let previous = null;
  let preparedEvents = null;
  let lastResult = null;

  return {
    label,
    domain: "military",
    effects: {
      ...MILITARY_EVENT_EFFECTS,
      affected: militarySystemAffected("military-events", objectAffected("military", "events"))
    },
    apply(context) {
      const prepared = preparedEvents ?? prepareImportedBattleEvents(context.map, document);
      preparedEvents = prepared;
      if (!prepared.events.length) throw new Error("没有可导入的战斗事件");
      previous ??= snapshotMilitary(context.map);
      for (const item of prepared.events) {
        const {regiment} = findRegiment(context.map, item.target);
        if (regiment) appendBattleEvent(context.map, regiment, item.event);
      }
      syncMilitary(context.map);
      refreshMilitaryEventMetadata(context.map);
      lastResult = {
        total: prepared.total,
        imported: prepared.events.length,
        skipped: prepared.skipped
      };
    },
    revert(context) {
      if (!previous) throw new Error("缺少可撤销的战斗事件导入快照");
      restoreMilitary(context.map, previous);
    },
    isNoop(context) {
      preparedEvents ??= prepareImportedBattleEvents(context.map, document);
      return !preparedEvents.events.length;
    },
    getResult() {
      return lastResult || {
        total: preparedEvents?.total || 0,
        imported: preparedEvents?.events?.length || 0,
        skipped: preparedEvents?.skipped || 0
      };
    }
  };
}

export function createClearMilitaryBattleEventsCommand(target, {label = "清空军团战斗事件", eventIds = null} = {}) {
  const normalizedTarget = normalizeRegimentTarget(target);
  const scopedEventIds = eventIds?.length ? new Set(eventIds.filter(Boolean).map(String)) : null;
  let previous = null;
  let removed = 0;

  return {
    label: `${label} #${normalizedTarget.stateId}:${normalizedTarget.regimentId}`,
    domain: "military",
    effects: {
      ...MILITARY_EVENT_EFFECTS,
      affected: militarySystemAffected("military-events", [militaryTargetAffected(normalizedTarget)])
    },
    apply(context) {
      const {state, regiment} = findRegiment(context.map, normalizedTarget);
      if (!state?.i || !regiment) throw new Error("找不到军团");
      previous ??= snapshotBattleEvents(context.map, state, regiment);
      const military = ensureMilitaryEventStore(context.map);
      const beforeGlobal = military.events.length;
      military.events = military.events.filter(event => !battleEventMatchesClearScope(event, normalizedTarget, scopedEventIds));
      removed = beforeGlobal - military.events.length;
      if (Array.isArray(regiment.events)) {
        const beforeRegiment = regiment.events.length;
        regiment.events = regiment.events.filter(event => !battleEventMatchesClearScope(event, normalizedTarget, scopedEventIds));
        removed = Math.max(removed, beforeRegiment - regiment.events.length);
      }
      if (!removed) throw new Error("当前军团没有可清空的战斗事件");
      syncMilitary(context.map);
      refreshMilitaryEventMetadata(context.map);
    },
    revert(context) {
      if (!previous) throw new Error("缺少可撤销的军团战斗事件快照");
      const {state, regiment} = findRegiment(context.map, normalizedTarget);
      if (!regiment) throw new Error("找不到军团");
      restoreBattleEvents(context.map, state, regiment, previous);
      syncMilitary(context.map);
      refreshMilitaryEventMetadata(context.map);
    },
    isNoop(context) {
      const {regiment} = findRegiment(context.map, normalizedTarget);
      return !regiment || !countBattleEventsForTarget(context.map, normalizedTarget, regiment, scopedEventIds);
    },
    getResult() {
      return {removed};
    }
  };
}

export function createMoveMilitaryStationCommand(target, destination, {label = "移动军团驻地"} = {}) {
  const normalizedTarget = normalizeRegimentTarget(target);
  const normalizedDestination = normalizeRegimentDestination(destination);
  let previous = null;

  return {
    label: `${label} #${normalizedTarget.stateId}:${normalizedTarget.regimentId}`,
    domain: "military",
    effects: {
      ...MILITARY_REGIMENT_EFFECTS,
      affected: objectAffected("military", militaryTargetId(normalizedTarget))
    },
    apply(context) {
      const {state, regiment} = findRegiment(context.map, normalizedTarget);
      if (!state?.i || !regiment) throw new Error("找不到军团");
      const destinationPoint = resolveRegimentDestination(context.map, normalizedDestination);
      if (!destinationPoint) throw new Error("找不到可移动的驻地目标");
      previous ??= snapshotRegimentStation(regiment);
      regiment.cell = destinationPoint.cell;
      regiment.x = destinationPoint.x;
      regiment.y = destinationPoint.y;
      regiment.status = "garrisoned";
      regiment.statusLabel = MILITARY_STATUSES.garrisoned?.label || "驻防中";
      regiment.order = {
        kind: "garrison",
        targetCell: destinationPoint.cell,
        targetName: destinationPoint.name || getOrderTargetName(context.map, state, destinationPoint.cell)
      };
      syncMilitary(context.map);
      refreshMilitaryStatusMetadata(context.map);
    },
    revert(context) {
      if (!previous) throw new Error("缺少可撤销的军团驻地快照");
      const {regiment} = findRegiment(context.map, normalizedTarget);
      if (!regiment) throw new Error("找不到军团");
      restoreRegimentStation(regiment, previous);
      syncMilitary(context.map);
      refreshMilitaryStatusMetadata(context.map);
    },
    isNoop(context) {
      const {regiment} = findRegiment(context.map, normalizedTarget);
      if (!regiment) return true;
      const destinationPoint = resolveRegimentDestination(context.map, normalizedDestination);
      if (!destinationPoint) return true;
      return Number(regiment.cell) === destinationPoint.cell
        && nearlyEqual(regiment.x, destinationPoint.x)
        && nearlyEqual(regiment.y, destinationPoint.y)
        && String(regiment.status || "") === "garrisoned";
    }
  };
}

export function createSetMilitaryBaseCommand(target, {label = "设置军团基地"} = {}) {
  const normalizedTarget = normalizeRegimentTarget(target);
  let previous = null;

  return {
    label: `${label} #${normalizedTarget.stateId}:${normalizedTarget.regimentId}`,
    domain: "military",
    effects: {
      ...MILITARY_REGIMENT_EFFECTS,
      affected: objectAffected("military", militaryTargetId(normalizedTarget))
    },
    apply(context) {
      const {regiment} = findRegiment(context.map, normalizedTarget);
      if (!regiment) throw new Error("找不到军团");
      if (!Number.isFinite(Number(regiment.x)) || !Number.isFinite(Number(regiment.y))) throw new Error("军团没有可用驻地坐标");
      previous ??= snapshotRegimentBase(regiment);
      regiment.baseCell = Number.isFinite(Number(regiment.cell)) ? Number(regiment.cell) : undefined;
      regiment.bcell = regiment.baseCell;
      regiment.bx = roundValue(regiment.x, 2);
      regiment.by = roundValue(regiment.y, 2);
      syncMilitary(context.map);
    },
    revert(context) {
      if (!previous) throw new Error("缺少可撤销的军团基地快照");
      const {regiment} = findRegiment(context.map, normalizedTarget);
      if (!regiment) throw new Error("找不到军团");
      restoreRegimentBase(regiment, previous);
      syncMilitary(context.map);
    },
    isNoop(context) {
      const {regiment} = findRegiment(context.map, normalizedTarget);
      if (!regiment) return true;
      const cell = Number(regiment.cell);
      return Number(regiment.baseCell ?? regiment.bcell) === cell
        && nearlyEqual(regiment.bx, regiment.x)
        && nearlyEqual(regiment.by, regiment.y);
    }
  };
}

export function createRenameMilitaryRegimentCommand(target, name, {label = "重命名军团"} = {}) {
  const normalizedTarget = normalizeRegimentTarget(target);
  const nextName = String(name || "").trim();
  let previousName = null;

  return {
    label: `${label} #${normalizedTarget.stateId}:${normalizedTarget.regimentId}`,
    domain: "military",
    effects: {
      ...MILITARY_REGIMENT_EFFECTS,
      affected: objectAffected("military", militaryTargetId(normalizedTarget))
    },
    apply(context) {
      const {regiment} = findRegiment(context.map, normalizedTarget);
      if (!regiment) throw new Error("找不到军团");
      if (!nextName) throw new Error("军团名称不能为空");
      previousName ??= regiment.name;
      regiment.name = nextName;
      syncMilitary(context.map);
    },
    revert(context) {
      const {regiment} = findRegiment(context.map, normalizedTarget);
      if (!regiment) throw new Error("找不到军团");
      if (previousName === undefined) delete regiment.name;
      else regiment.name = previousName;
      syncMilitary(context.map);
    },
    isNoop(context) {
      const {regiment} = findRegiment(context.map, normalizedTarget);
      if (!regiment) return true;
      return !nextName || String(regiment.name || "").trim() === nextName;
    }
  };
}

function militarySystemAffected(system, targets = []) {
  return systemAffected(system, targets);
}

function militaryTargetAffected(target) {
  return objectAffected("military", militaryTargetId(target))[0];
}

function militaryTargetId(target) {
  return target.id || `${target.stateId}:${target.regimentId}`;
}

function collectLockedMilitaryRegiments(map, options = {}) {
  const snapshots = [];
  const byId = new Map();
  const add = source => {
    const identity = militaryLockIdentity(source);
    if (!identity) throw militaryLockConflict("军事锁仓包含非法军团复合 ID", {reason: "invalid-id", id: source?.id});
    const snapshot = source?.regiment ? clonePlain(source) : captureMilitaryRegimentSnapshot(map.pack, identity);
    const existing = byId.get(identity.id);
    if (existing) {
      if (JSON.stringify(existing) === JSON.stringify(snapshot)) return;
      throw militaryLockConflict(`锁定军团 ${identity.id} 重复且快照矛盾`, {reason: "duplicate-id", id: identity.id});
    }
    snapshots.push(snapshot);
    byId.set(identity.id, snapshot);
  };
  for (const source of [...(options.preservedRegiments || []), ...(options.lockedMilitaryRegiments || [])]) add(source);
  for (const entry of map?.regenerationLocks?.entries || []) {
    if (entry?.kind !== "military") continue;
    add(entry);
  }
  return snapshots;
}

function militaryLockIdentity(source = {}) {
  const regiment = source?.regiment || source;
  const [idState, idRegiment] = String(source?.id ?? regiment?.id ?? "").split(":");
  const stateId = Number(source?.stateId ?? regiment?.state ?? idState);
  const regimentId = Number(source?.regimentId ?? regiment?.i ?? idRegiment);
  if (!Number.isInteger(stateId) || stateId <= 0 || !Number.isInteger(regimentId) || regimentId < 0) return null;
  return {id: `${stateId}:${regimentId}`, stateId, regimentId};
}

function allMilitaryRegimentsLocked(map, lockedIds) {
  const ids = (map?.pack?.states || [])
    .filter(state => state?.i && !state.removed)
    .flatMap(state => (state.military || []).map(regiment => `${state.i}:${regiment.i}`));
  return ids.length > 0 && ids.every(id => lockedIds.has(id));
}

function unlockedMilitaryVariationSnapshot(map, lockedIds) {
  return snapshotMilitaryVariation(map).filter(item => !lockedIds.has(item.id));
}

function assertLockedMilitaryPoliticsMirrors(map, locked) {
  const packStates = map?.pack?.states;
  const politicsStates = map?.politics?.states;
  if (!Array.isArray(packStates) || !Array.isArray(politicsStates) || packStates === politicsStates) return;
  for (const snapshot of locked.regiments.values()) {
    const mirror = politicsStates[snapshot.stateId];
    const regiment = (mirror?.military || []).find(item =>
      Number(item?.i) === snapshot.regimentId || String(item?.id) === snapshot.id
    );
    if (!regiment || JSON.stringify(regiment) !== JSON.stringify(snapshot.regiment)) {
      throw militaryLockConflict(`军事锁 ${snapshot.id} 的 politics 镜像矛盾`, {reason: "politics-mirror-mismatch", id: snapshot.id});
    }
  }
}

function militaryRegenerationAffected(map) {
  const targets = (map?.pack?.states || [])
    .filter(state => state?.i && !state.removed)
    .flatMap(state => (state.military || []).flatMap(regiment => objectAffected("military", `${state.i}:${regiment.i}`)));
  return systemAffected("military-regeneration", targets);
}

function injectMilitaryRegenerationFault(actual, expected) {
  if (actual === expected) throw new Error(`military regeneration fault: ${expected}`);
}

function snapshotMilitary(map) {
  const states = map?.pack?.states || map?.politics?.states || [];
  return {
    military: map?.military ? clonePlain(map.military) : null,
    packMilitary: map?.pack?.military ? clonePlain(map.pack.military) : null,
    states: states.map(state => state ? {
      id: state.i ?? state.id,
      military: Array.isArray(state.military) ? clonePlain(state.military) : null,
      militaryPolicy: state.militaryPolicy ? clonePlain(state.militaryPolicy) : null,
      militaryDiagnostics: state.militaryDiagnostics ? clonePlain(state.militaryDiagnostics) : null,
      alert: state.alert
    } : null)
  };
}

function restoreMilitaryPolicyProtectedMetadata(target, source) {
  if (!target || typeof target !== "object" || !source || typeof source !== "object") return;
  if (hasOwn(source, "events")) target.events = clonePlain(source.events);
  else delete target.events;
  target.metadata ||= {};
  const sourceMetadata = source.metadata && typeof source.metadata === "object" ? source.metadata : {};
  for (const field of ["events", "eventSequence", "eventArchiveGeneration", "stale"]) {
    if (hasOwn(sourceMetadata, field)) target.metadata[field] = clonePlain(sourceMetadata[field]);
    else delete target.metadata[field];
  }
}

function restoreMilitary(map, snapshot) {
  const states = map?.pack?.states || map?.politics?.states || [];
  for (const stateSnapshot of snapshot.states || []) {
    if (!stateSnapshot) continue;
    const state = states[stateSnapshot.id];
    if (!state) continue;
    if (stateSnapshot.military) state.military = clonePlain(stateSnapshot.military);
    else delete state.military;
    if (stateSnapshot.militaryPolicy) state.militaryPolicy = clonePlain(stateSnapshot.militaryPolicy);
    else delete state.militaryPolicy;
    if (stateSnapshot.militaryDiagnostics) state.militaryDiagnostics = clonePlain(stateSnapshot.militaryDiagnostics);
    else delete state.militaryDiagnostics;
    if (stateSnapshot.alert === undefined) delete state.alert;
    else state.alert = stateSnapshot.alert;
  }
  map.military = snapshot.military ? clonePlain(snapshot.military) : null;
  if (map?.pack) map.pack.military = snapshot.packMilitary ? clonePlain(snapshot.packMilitary) : map.military;
  syncMilitaryStateMirrors(map);
}

function snapshotBattleRule(map) {
  const pack = map?.pack;
  const packStates = pack?.states;
  const politicsStates = map?.politics?.states;
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
    mapMilitaryPresent,
    packMilitaryPresent,
    mapMilitary: cloneOptional(mapMilitary),
    packMilitary: cloneOptional(packMilitary),
    militaryRootsShared: mapMilitaryPresent && packMilitaryPresent && mapMilitary === packMilitary,
    packStateFields: snapshotBattleStateStore(packStates),
    politicsStateFields: snapshotBattleStateStore(politicsStates),
    stateStoresShared: Array.isArray(packStates) && packStates === politicsStates,
    stateFieldAliases: snapshotBattleStateAliases(packStates, politicsStates),
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

function restoreBattleRule(map, snapshot) {
  const pack = map?.pack;
  if (snapshot.militaryRootsShared && snapshot.mapMilitaryPresent && snapshot.packMilitaryPresent) {
    const military = cloneOptional(snapshot.mapMilitary);
    map.military = military;
    if (pack) pack.military = military;
  } else {
    restoreOwnValue(map, "military", snapshot.mapMilitaryPresent, snapshot.mapMilitary);
    if (pack) restoreOwnValue(pack, "military", snapshot.packMilitaryPresent, snapshot.packMilitary);
  }

  restoreBattleStateStore(pack?.states, snapshot.packStateFields);
  if (!snapshot.stateStoresShared) restoreBattleStateStore(map?.politics?.states, snapshot.politicsStateFields);
  restoreBattleStateAliases(pack?.states, map?.politics?.states, snapshot.stateFieldAliases);

  restoreOwnValue(map, "zones", snapshot.mapZonesPresent, snapshot.mapZones);
  if (pack) restoreOwnValue(pack, "zones", snapshot.packZonesPresent, snapshot.packZones);
  if (snapshot.mapZoneListPresent && map?.zones) map.zones.zones = cloneOptional(snapshot.mapZoneList);
  else if (map?.zones) delete map.zones.zones;
  if (snapshot.zoneListsShared && map?.zones && pack) pack.zones = map.zones.zones;

  restoreOwnValue(map, "summary", snapshot.summaryPresent, snapshot.summary);
}

function snapshotBattleStateStore(states) {
  if (!Array.isArray(states)) return null;
  return states.map(state => state ? {
    military: snapshotOwnValue(state, "military"),
    militaryPolicy: snapshotOwnValue(state, "militaryPolicy"),
    militaryDiagnostics: snapshotOwnValue(state, "militaryDiagnostics"),
    alert: snapshotOwnValue(state, "alert")
  } : null);
}

function restoreBattleStateStore(states, snapshots) {
  if (!Array.isArray(states) || !Array.isArray(snapshots)) return;
  for (let id = 0; id < snapshots.length; id++) {
    const state = states[id];
    const snapshot = snapshots[id];
    if (!state || !snapshot) continue;
    for (const key of ["military", "militaryPolicy", "militaryDiagnostics", "alert"]) {
      restoreOwnValue(state, key, snapshot[key].present, snapshot[key].value);
    }
  }
}

function snapshotBattleStateAliases(packStates, politicsStates) {
  if (!Array.isArray(packStates) || !Array.isArray(politicsStates) || packStates === politicsStates) return [];
  return packStates.map((state, id) => {
    const mirror = politicsStates[id];
    if (!state || !mirror) return null;
    return {
      military: hasOwn(state, "military") && hasOwn(mirror, "military") && state.military === mirror.military,
      militaryPolicy: hasOwn(state, "militaryPolicy") && hasOwn(mirror, "militaryPolicy") && state.militaryPolicy === mirror.militaryPolicy,
      militaryDiagnostics: hasOwn(state, "militaryDiagnostics") && hasOwn(mirror, "militaryDiagnostics") && state.militaryDiagnostics === mirror.militaryDiagnostics
    };
  });
}

function restoreBattleStateAliases(packStates, politicsStates, aliases) {
  if (!Array.isArray(packStates) || !Array.isArray(politicsStates) || packStates === politicsStates) return;
  for (let id = 0; id < aliases.length; id++) {
    const alias = aliases[id];
    const source = packStates[id];
    const target = politicsStates[id];
    if (!alias || !source || !target) continue;
    for (const key of ["military", "militaryPolicy", "militaryDiagnostics"]) {
      if (alias[key]) target[key] = source[key];
    }
  }
}

function snapshotOwnValue(target, key) {
  const present = hasOwn(target, key);
  return {present, value: present ? cloneOptional(target[key]) : undefined};
}

function restoreOwnValue(target, key, present, value) {
  if (present) target[key] = cloneOptional(value);
  else delete target[key];
}

function syncMilitary(map) {
  if (!map?.pack?.military) return;
  map.military = map.pack.military;
  syncMilitaryStateMirrors(map);
}

function normalizeRegimentTarget(target = {}) {
  const idParts = String(target.id || "").split(":");
  const stateId = Number(target.stateId ?? target.state ?? idParts[0]);
  const regimentId = Number(target.regimentId ?? target.i ?? idParts[1]);
  return {
    id: target.id || (Number.isFinite(stateId) && Number.isFinite(regimentId) ? `${stateId}:${regimentId}` : ""),
    stateId,
    regimentId
  };
}

function normalizeRegimentDestination(destination = {}) {
  return {
    cell: Number(destination.cell ?? destination.packCell),
    x: optionalNumber(destination.x),
    y: optionalNumber(destination.y),
    name: String(destination.name || destination.targetName || destination.label || "")
  };
}

function normalizeBattleEventInput(event = {}) {
  const type = String(event.type || "skirmish");
  const outcome = String(event.outcome || "victory");
  return {
    type,
    typeLabel: BATTLE_EVENT_TYPES[type] || event.typeLabel || type,
    outcome,
    outcomeLabel: BATTLE_EVENT_OUTCOMES[outcome] || event.outcomeLabel || outcome,
    description: String(event.description || event.note || "").trim(),
    applyResult: Boolean(event.applyResult),
    chainKey: String(event.chainKey || event.chainId || event.campaignKey || "").trim(),
    chainLabel: String(event.chainLabel || event.campaignLabel || event.chainName || "").trim(),
    chainSide: String(event.chainSide || event.side || "").trim(),
    chainSideLabel: String(event.chainSideLabel || event.sideLabel || "").trim(),
    opponentStateId: optionalNumber(event.opponentStateId ?? event.opponentId),
    opponentStateName: String(event.opponentStateName || event.opponentName || "").trim(),
    attackerStateId: optionalNumber(event.attackerStateId ?? event.attacker),
    attackerStateName: String(event.attackerStateName || event.attackerName || "").trim(),
    defenderStateId: optionalNumber(event.defenderStateId ?? event.defender),
    defenderStateName: String(event.defenderStateName || event.defenderName || "").trim()
  };
}

function prepareImportedBattleEvents(map, document) {
  const imported = importedBattleEventItems(document);
  const military = map?.pack?.military || map?.military || {};
  const existingEvents = Array.isArray(military.events) ? military.events : [];
  let nextSequence = Math.max(0, Number(military.metadata?.eventSequence || 0), ...(existingEvents.map(event => Number(event.sequence || 0))));
  const events = [];

  for (const source of imported) {
    const target = importedBattleEventTarget(source);
    const {state, regiment} = findRegiment(map, target);
    if (!state?.i || !regiment) continue;
    const sequence = Number(source.sequence) > 0 ? Number(source.sequence) : ++nextSequence;
    const input = normalizeBattleEventInput(source);
    const chain = resolveBattleEventChain(map, state, regiment, input);
    const event = {
      id: String(source.id || `${regiment.id || `${state.i}:${regiment.i}`}:battle:${sequence}`),
      sequence,
      kind: "battle",
      chainKey: chain.chainKey,
      chainLabel: chain.chainLabel,
      chainSide: chain.chainSide,
      chainSideLabel: chain.chainSideLabel,
      opponentStateId: chain.opponentStateId,
      opponentStateName: chain.opponentStateName,
      attackerStateId: chain.attackerStateId,
      attackerStateName: chain.attackerStateName,
      defenderStateId: chain.defenderStateId,
      defenderStateName: chain.defenderStateName,
      type: input.type,
      typeLabel: source.typeLabel || input.typeLabel,
      outcome: input.outcome,
      outcomeLabel: source.outcomeLabel || input.outcomeLabel,
      description: input.description,
      stateId: state.i,
      stateName: state.name || state.fullName || `国家 #${state.i}`,
      regimentId: regiment.i,
      regimentObjectId: regiment.id || `${state.i}:${regiment.i}`,
      regimentName: regiment.name || `军团 #${regiment.i}`,
      cell: Number.isInteger(source.cell) ? source.cell : regiment.cell,
      x: Number.isFinite(Number(source.x)) ? Number(source.x) : regiment.x,
      y: Number.isFinite(Number(source.y)) ? Number(source.y) : regiment.y,
      at: source.at || new Date().toISOString()
    };
    if (source.resultApplied !== undefined) event.resultApplied = Boolean(source.resultApplied);
    if (source.result && typeof source.result === "object") event.result = clonePlain(source.result);
    events.push({event, target: {id: regiment.id || `${state.i}:${regiment.i}`, stateId: state.i, regimentId: regiment.i}});
  }

  return {
    total: imported.length,
    skipped: imported.length - events.length,
    events
  };
}

function importedBattleEventItems(document) {
  const source = document?.events || document?.military?.events || document?.pack?.military?.events || document;
  return (Array.isArray(source) ? source : [])
    .filter(event => event && typeof event === "object")
    .filter(event => !event.kind || event.kind === "battle");
}

function importedBattleEventTarget(event = {}) {
  const idParts = String(event.regimentObjectId || event.id || "").split(":");
  return normalizeRegimentTarget({
    id: event.regimentObjectId || (idParts.length >= 2 ? `${idParts[0]}:${idParts[1]}` : ""),
    stateId: event.stateId ?? idParts[0],
    regimentId: event.regimentId ?? idParts[1]
  });
}

function countBattleEventsForTarget(map, target, regiment, eventIds = null) {
  const military = map?.pack?.military || map?.military || {};
  const globalCount = (Array.isArray(military.events) ? military.events : []).filter(event => battleEventMatchesClearScope(event, target, eventIds)).length;
  const regimentCount = (Array.isArray(regiment?.events) ? regiment.events : []).filter(event => battleEventMatchesClearScope(event, target, eventIds)).length;
  return Math.max(globalCount, regimentCount);
}

function battleEventMatchesTarget(event, target) {
  if (!event || event.kind !== "battle") return false;
  if ((event.affectedRegiments || []).some(item =>
    item?.regimentObjectId === target.id
    || (Number(item?.stateId) === target.stateId && Number(item?.regimentId) === target.regimentId)
  )) return true;
  if (event.regimentObjectId && target.id && event.regimentObjectId === target.id) return true;
  return Number(event.stateId) === target.stateId && Number(event.regimentId) === target.regimentId;
}

function battleEventMatchesClearScope(event, target, eventIds = null) {
  if (!battleEventMatchesTarget(event, target)) return false;
  return !eventIds || eventIds.has(String(event.id || ""));
}

function uniqueRegimentTargets(targets = []) {
  const result = [];
  const seen = new Set();
  for (const target of targets || []) {
    const normalized = normalizeRegimentTarget(target);
    if (!Number.isFinite(normalized.stateId) || !Number.isFinite(normalized.regimentId)) continue;
    const key = `${normalized.stateId}:${normalized.regimentId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({...normalized, id: normalized.id || key});
  }
  return result;
}

function findRegiment(map, target) {
  const state = map?.pack?.states?.[target.stateId] || map?.politics?.states?.[target.stateId];
  const regiment = (state?.military || []).find(item => item.i === target.regimentId || item.id === target.id) || null;
  return {state, regiment};
}

function normalizeBattleRuleTarget(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const target = normalizeRegimentTarget(value);
  if (!Number.isInteger(target.stateId) || target.stateId <= 0
    || !Number.isInteger(target.regimentId) || target.regimentId < 0) return null;
  return {...target, id: `${target.stateId}:${target.regimentId}`};
}

function statesAtWar(left, right) {
  return left?.diplomacy?.[right?.i] === "Enemy" && right?.diplomacy?.[left?.i] === "Enemy";
}

function regimentTroops(regiment) {
  const value = Number(regiment?.a ?? sumUnitTroops(regiment?.u || {}));
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function isNavalRegiment(regiment) {
  return Boolean(regiment?.n || regiment?.type === "fleet");
}

function validBattleCell(map, cell) {
  if (!Number.isInteger(cell) || cell < 0) return false;
  const cells = map?.pack?.cells;
  const length = Math.max(cells?.i?.length || 0, cells?.c?.length || 0, cells?.p?.length || 0);
  return cell < length;
}

function battleCellsTouch(map, leftCell, rightCell) {
  if (leftCell === rightCell) return true;
  return (map?.pack?.cells?.c?.[leftCell] || []).includes(rightCell)
    || (map?.pack?.cells?.c?.[rightCell] || []).includes(leftCell);
}

function battleWarzones(map) {
  const zones = map?.zones?.zones;
  return Array.isArray(zones) ? zones : Array.isArray(map?.pack?.zones) ? map.pack.zones : [];
}

function battleWarzoneId(zone) {
  return zone?.i ?? zone?.id ?? null;
}

function findBattleWarzone(map, id) {
  return battleWarzones(map).find(zone => String(battleWarzoneId(zone)) === String(id)) || null;
}

function warzoneMatchesStatePair(map, zone, leftStateId, rightStateId) {
  if (zone?.type !== "Warzone") return false;
  const pair = resolveWarzoneStatePair(map?.pack, zone);
  if (!pair) return false;
  return (Number(pair.attacker) === Number(leftStateId) && Number(pair.defender) === Number(rightStateId))
    || (Number(pair.attacker) === Number(rightStateId) && Number(pair.defender) === Number(leftStateId));
}

function warzoneContainsCells(zone, leftCell, rightCell) {
  const cells = new Set((zone?.cells || []).map(Number));
  return cells.has(leftCell) && cells.has(rightCell);
}

function findMatchingBattleWarzone(map, leftStateId, rightStateId, leftCell, rightCell) {
  return battleWarzones(map).find(zone =>
    warzoneMatchesStatePair(map, zone, leftStateId, rightStateId)
    && warzoneContainsCells(zone, leftCell, rightCell)
  ) || null;
}

function resolveSeededBattleOutcome(map, userSeed, attackerTarget, attacker, defenderTarget, defender) {
  const regiments = [
    {id: attackerTarget.id, troops: regimentTroops(attacker), cell: Number(attacker.cell)},
    {id: defenderTarget.id, troops: regimentTroops(defender), cell: Number(defender.cell)}
  ].sort((left, right) => left.id.localeCompare(right.id, "en", {numeric: true}));
  const resolutionSeed = stableHash(JSON.stringify({
    mapSeed: String(map?.options?.seed || map?.metadata?.seed || ""),
    userSeed,
    regiments
  }));
  const outcomes = ["victory", "defeat", "draw"];
  return {outcome: outcomes[Number.parseInt(resolutionSeed, 16) % outcomes.length], resolutionSeed};
}

function rejectedBattle(code, summary) {
  return {valid: false, allowed: false, code, summary, normalizedInput: null, affected: [], requiresConfirm: false};
}

function battleRuleError(inspection) {
  const error = new Error(inspection.summary || "战斗规则事务不允许执行");
  error.code = inspection.code || "battle-rule-rejected";
  error.details = clonePlain(inspection);
  return error;
}

function battleValidationError(message) {
  const error = new Error(`battle-validation-failed: ${message}`);
  error.code = "battle-validation-failed";
  return error;
}

function injectBattleRuleFault(actual, expected) {
  if (actual === expected) throw new Error(`battle rule fault: ${expected}`);
}

function validateBattleResult(map, plan, event) {
  const attacker = findRegiment(map, plan.normalizedInput.attacker);
  const defender = findRegiment(map, plan.normalizedInput.defender);
  const errors = [];
  if (!attacker.regiment || !defender.regiment) errors.push("参战军团缺失");
  if ([attacker.regiment, defender.regiment].some(regiment => !Number.isFinite(Number(regiment?.a)) || Number(regiment.a) < 0)) {
    errors.push("军团兵力非法");
  }
  if (!statesAtWar(attacker.state, defender.state)) errors.push("国家战争关系被改写");
  if (Number(attacker.regiment?.cell) !== plan.attackerCell || Number(defender.regiment?.cell) !== plan.defenderCell) errors.push("军团被隐式移动");
  const military = map?.pack?.military || map?.military;
  if (!(military?.events || []).some(item => item?.id === event.id)) errors.push("全局战报缺失");
  if (!(attacker.regiment?.events || []).some(item => item?.id === event.id)) errors.push("进攻方战报缺失");
  if (!(defender.regiment?.events || []).some(item => item?.id === event.id)) errors.push("防守方战报缺失");
  if (Number(event?.result?.opponent?.stateId) !== Number(defender.state?.i)
    || Number(event?.result?.opponent?.regimentId) !== Number(defender.regiment?.i)) errors.push("战报对手不精确");
  for (const regiment of [attacker.regiment, defender.regiment]) {
    if (Object.values(regiment?.u || {}).some(value => Number(value) < 0)) errors.push("兵种兵力为负");
    if (regiment?.status === "routed"
      && (regiment.order?.kind !== "retreat" || Number(regiment.order?.targetCell) !== Number((regiment === attacker.regiment ? attacker.state : defender.state)?.center))) {
      errors.push("败退命令未指向本国中心");
    }
  }
  if (errors.length) throw battleValidationError(errors.join("；"));
}

function snapshotRegimentStatus(regiment) {
  return {
    status: regiment.status,
    statusLabel: regiment.statusLabel,
    order: regiment.order ? clonePlain(regiment.order) : null
  };
}

function snapshotRegimentStation(regiment) {
  return {
    cell: regiment.cell,
    x: regiment.x,
    y: regiment.y,
    status: regiment.status,
    statusLabel: regiment.statusLabel,
    order: regiment.order ? clonePlain(regiment.order) : null
  };
}

function snapshotRegimentBase(regiment) {
  return {
    baseCell: regiment.baseCell,
    bcell: regiment.bcell,
    bx: regiment.bx,
    by: regiment.by
  };
}

function snapshotBattleEvents(map, state, regiment, opponent = null) {
  const military = map?.pack?.military || map?.military || {};
  return {
    militaryEvents: Array.isArray(military.events) ? clonePlain(military.events) : null,
    regimentEvents: Array.isArray(regiment.events) ? clonePlain(regiment.events) : null,
    metadata: military.metadata ? clonePlain(military.metadata) : null,
    regiment: snapshotRegimentBattleResult(regiment),
    stateMilitaryPolicy: state?.militaryPolicy ? clonePlain(state.militaryPolicy) : null,
    opponent: opponent?.regiment ? {
      target: {
        id: opponent.regiment.id || `${opponent.state.i}:${opponent.regiment.i}`,
        stateId: opponent.state.i,
        regimentId: opponent.regiment.i
      },
      regiment: snapshotRegimentBattleResult(opponent.regiment),
      stateMilitaryPolicy: opponent.state?.militaryPolicy ? clonePlain(opponent.state.militaryPolicy) : null
    } : null
  };
}

function snapshotRegimentBattleResult(regiment) {
  return {
    a: regiment.a,
    u: regiment.u ? clonePlain(regiment.u) : null,
    status: regiment.status,
    statusLabel: regiment.statusLabel,
    order: regiment.order ? clonePlain(regiment.order) : null,
    dominantUnit: regiment.dominantUnit,
    dominantUnitLabel: regiment.dominantUnitLabel,
    icon: regiment.icon,
    iconVariant: regiment.iconVariant,
    iconLabel: regiment.iconLabel
  };
}

function snapshotRegimentStatuses(map, targets) {
  return targets
    .map(target => {
      const {regiment} = findRegiment(map, target);
      return regiment ? {target, snapshot: snapshotRegimentStatus(regiment)} : null;
    })
    .filter(Boolean);
}

function restoreRegimentStatus(regiment, snapshot) {
  if (snapshot.status === undefined) delete regiment.status;
  else regiment.status = snapshot.status;
  if (snapshot.statusLabel === undefined) delete regiment.statusLabel;
  else regiment.statusLabel = snapshot.statusLabel;
  if (snapshot.order) regiment.order = clonePlain(snapshot.order);
  else delete regiment.order;
}

function restoreRegimentStation(regiment, snapshot) {
  if (snapshot.cell === undefined) delete regiment.cell;
  else regiment.cell = snapshot.cell;
  if (snapshot.x === undefined) delete regiment.x;
  else regiment.x = snapshot.x;
  if (snapshot.y === undefined) delete regiment.y;
  else regiment.y = snapshot.y;
  restoreRegimentStatus(regiment, snapshot);
}

function restoreRegimentBase(regiment, snapshot) {
  if (snapshot.baseCell === undefined) delete regiment.baseCell;
  else regiment.baseCell = snapshot.baseCell;
  if (snapshot.bcell === undefined) delete regiment.bcell;
  else regiment.bcell = snapshot.bcell;
  if (snapshot.bx === undefined) delete regiment.bx;
  else regiment.bx = snapshot.bx;
  if (snapshot.by === undefined) delete regiment.by;
  else regiment.by = snapshot.by;
}

function restoreBattleEvents(map, state, regiment, snapshot) {
  const military = ensureMilitaryEventStore(map);
  if (snapshot.militaryEvents) military.events = clonePlain(snapshot.militaryEvents);
  else delete military.events;
  if (snapshot.regimentEvents) regiment.events = clonePlain(snapshot.regimentEvents);
  else delete regiment.events;
  if (snapshot.metadata) military.metadata = clonePlain(snapshot.metadata);
  if (snapshot.regiment) restoreRegimentBattleResult(regiment, snapshot.regiment);
  if (state && snapshot.stateMilitaryPolicy) state.militaryPolicy = clonePlain(snapshot.stateMilitaryPolicy);
  if (snapshot.opponent) {
    const {state: opponentState, regiment: opponentRegiment} = findRegiment(map, snapshot.opponent.target);
    if (opponentRegiment && snapshot.opponent.regiment) restoreRegimentBattleResult(opponentRegiment, snapshot.opponent.regiment);
    if (opponentState && snapshot.opponent.stateMilitaryPolicy) opponentState.militaryPolicy = clonePlain(snapshot.opponent.stateMilitaryPolicy);
  }
}

function restoreRegimentBattleResult(regiment, snapshot) {
  if (snapshot.a === undefined) delete regiment.a;
  else regiment.a = snapshot.a;
  if (snapshot.u) regiment.u = clonePlain(snapshot.u);
  else delete regiment.u;
  restoreRegimentStatus(regiment, snapshot);
  if (snapshot.dominantUnit === undefined) delete regiment.dominantUnit;
  else regiment.dominantUnit = snapshot.dominantUnit;
  if (snapshot.dominantUnitLabel === undefined) delete regiment.dominantUnitLabel;
  else regiment.dominantUnitLabel = snapshot.dominantUnitLabel;
  if (snapshot.icon === undefined) delete regiment.icon;
  else regiment.icon = snapshot.icon;
  if (snapshot.iconVariant === undefined) delete regiment.iconVariant;
  else regiment.iconVariant = snapshot.iconVariant;
  if (snapshot.iconLabel === undefined) delete regiment.iconLabel;
  else regiment.iconLabel = snapshot.iconLabel;
}

function resolveRegimentDestination(map, destination) {
  const cell = Number(destination.cell);
  if (!Number.isInteger(cell) || !map?.pack?.cells?.p?.[cell]) return null;
  const point = map.pack.cells.p[cell];
  const x = Number.isFinite(destination.x) ? destination.x : point[0];
  const y = Number.isFinite(destination.y) ? destination.y : point[1];
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    cell,
    x: roundValue(x, 2),
    y: roundValue(y, 2),
    name: destination.name
  };
}

function appendBattleEvent(map, regiment, event) {
  const military = ensureMilitaryEventStore(map);
  military.metadata.eventSequence = Math.max(Number(military.metadata.eventSequence || 0), Number(event.sequence || 0));
  military.events = (military.events || []).filter(item => item?.id !== event.id);
  military.events.push(clonePlain(event));
  regiment.events = (regiment.events || []).filter(item => item?.id !== event.id);
  regiment.events.push(clonePlain(event));
}

function createBattleEvent(map, state, regiment, eventInput) {
  const military = ensureMilitaryEventStore(map);
  const sequence = Number(military.metadata.eventSequence || 0) + 1;
  military.metadata.eventSequence = sequence;
  const chain = resolveBattleEventChain(map, state, regiment, eventInput);
  return {
    id: `${regiment.id || `${state.i}:${regiment.i}`}:battle:${sequence}`,
    sequence,
    kind: "battle",
    chainKey: chain.chainKey,
    chainLabel: chain.chainLabel,
    chainSide: chain.chainSide,
    chainSideLabel: chain.chainSideLabel,
    opponentStateId: chain.opponentStateId,
    opponentStateName: chain.opponentStateName,
    attackerStateId: chain.attackerStateId,
    attackerStateName: chain.attackerStateName,
    defenderStateId: chain.defenderStateId,
    defenderStateName: chain.defenderStateName,
    type: eventInput.type,
    typeLabel: eventInput.typeLabel,
    outcome: eventInput.outcome,
    outcomeLabel: eventInput.outcomeLabel,
    description: eventInput.description,
    stateId: state.i,
    stateName: state.name || state.fullName || `国家 #${state.i}`,
    regimentId: regiment.i,
    regimentObjectId: regiment.id || `${state.i}:${regiment.i}`,
    regimentName: regiment.name || `军团 #${regiment.i}`,
    cell: regiment.cell,
    x: regiment.x,
    y: regiment.y,
    at: new Date().toISOString()
  };
}

function resolveBattleEventChain(map, state, regiment, eventInput = {}) {
  if (eventInput.chainKey || eventInput.chainLabel) {
    const fallback = eventInput.chainLabel || eventInput.chainKey || "战报链";
    return {
      chainKey: eventInput.chainKey || `manual:${state.i}:${slugText(fallback)}`,
      chainLabel: eventInput.chainLabel || eventInput.chainKey,
      ...resolveExplicitBattleChainSide(eventInput)
    };
  }
  const campaign = firstStateCampaign(state);
  if (campaign) {
    const attacker = map?.pack?.states?.[campaign.attacker] || map?.politics?.states?.[campaign.attacker];
    const defender = map?.pack?.states?.[campaign.defender] || map?.politics?.states?.[campaign.defender];
    const side = Number(state.i) === Number(campaign.attacker) ? "attacker" : Number(state.i) === Number(campaign.defender) ? "defender" : "participant";
    const opponent = side === "attacker" ? defender : side === "defender" ? attacker : null;
    const key = campaign.id ?? campaign.i ?? campaign.key ?? `${campaign.attacker}:${campaign.defender}:${campaign.start || ""}:${campaign.cause || campaign.causeLabel || campaign.name || "campaign"}`;
    return {
      chainKey: `campaign:${slugText(key)}`,
      chainLabel: campaign.name || campaign.label || campaign.causeLabel || campaign.cause || "战争战报",
      chainSide: side,
      chainSideLabel: battleChainSideLabel(side),
      opponentStateId: opponent?.i ?? null,
      opponentStateName: stateName(opponent),
      attackerStateId: attacker?.i ?? campaign.attacker ?? null,
      attackerStateName: stateName(attacker),
      defenderStateId: defender?.i ?? campaign.defender ?? null,
      defenderStateName: stateName(defender)
    };
  }
  return {
    chainKey: `regiment:${state.i}:${regiment.i}:local`,
    chainLabel: "本地战报",
    chainSide: "local",
    chainSideLabel: "本地",
    opponentStateId: null,
    opponentStateName: "",
    attackerStateId: null,
    attackerStateName: "",
    defenderStateId: null,
    defenderStateName: ""
  };
}

function resolveExplicitBattleChainSide(eventInput = {}) {
  const side = eventInput.chainSide || "manual";
  return {
    chainSide: side,
    chainSideLabel: eventInput.chainSideLabel || battleChainSideLabel(side),
    opponentStateId: Number.isFinite(eventInput.opponentStateId) ? eventInput.opponentStateId : null,
    opponentStateName: eventInput.opponentStateName || "",
    attackerStateId: Number.isFinite(eventInput.attackerStateId) ? eventInput.attackerStateId : null,
    attackerStateName: eventInput.attackerStateName || "",
    defenderStateId: Number.isFinite(eventInput.defenderStateId) ? eventInput.defenderStateId : null,
    defenderStateName: eventInput.defenderStateName || ""
  };
}

function battleChainSideLabel(side) {
  if (side === "attacker") return "进攻方";
  if (side === "defender") return "防守方";
  if (side === "participant") return "参战方";
  if (side === "local") return "本地";
  return "手动";
}

function oppositeBattleSide(side) {
  if (side === "attacker") return "defender";
  if (side === "defender") return "attacker";
  return "participant";
}

function stateName(state) {
  return state?.fullName || state?.name || (state?.i ? `国家 #${state.i}` : "");
}

function firstStateCampaign(state) {
  return (state?.campaigns || []).find(campaign => campaign && (campaign.name || campaign.label || campaign.causeLabel || campaign.cause || campaign.id || campaign.i)) || null;
}

function slugText(value) {
  return String(value || "chain").trim().replace(/\s+/g, "-").replace(/[^\w\u4e00-\u9fa5:-]/g, "").slice(0, 48) || "chain";
}

function findOpponentBattleRegiment(map, state, regiment, eventInput) {
  const side = normalizeBattleChainSide(eventInput.chainSide || "local");
  if (side !== "attacker" && side !== "defender") return null;
  const opponentStateId = Number(eventInput.opponentStateId);
  const opponentState = Number.isInteger(opponentStateId)
    ? map?.pack?.states?.[opponentStateId] || map?.politics?.states?.[opponentStateId]
    : null;
  if (!opponentState?.i || opponentState.i === state.i || !Array.isArray(opponentState.military)) return null;
  const naval = Boolean(regiment.n || regiment.type === "fleet" || eventInput.type === "naval");
  const candidates = opponentState.military
    .filter(item => item && Number(item.a || 0) > 0 && Boolean(item.n || item.type === "fleet") === naval)
    .sort((a, b) => distanceBetweenRegiments(regiment, a) - distanceBetweenRegiments(regiment, b) || Number(b.a || 0) - Number(a.a || 0));
  const fallback = opponentState.military
    .filter(item => item && Number(item.a || 0) > 0)
    .sort((a, b) => distanceBetweenRegiments(regiment, a) - distanceBetweenRegiments(regiment, b) || Number(b.a || 0) - Number(a.a || 0));
  const opponentRegiment = candidates[0] || fallback[0] || null;
  return opponentRegiment ? {state: opponentState, regiment: opponentRegiment} : null;
}

function distanceBetweenRegiments(a = {}, b = {}) {
  const ax = Number(a.x);
  const ay = Number(a.y);
  const bx = Number(b.x);
  const by = Number(b.y);
  if (![ax, ay, bx, by].every(Number.isFinite)) return Infinity;
  return Math.hypot(ax - bx, ay - by);
}

function battleEventRegimentReference(state, regiment, side, sideLabel, casualties) {
  return {
    stateId: state.i,
    stateName: stateName(state),
    regimentId: regiment.i,
    regimentObjectId: regiment.id || `${state.i}:${regiment.i}`,
    regimentName: regiment.name || `军团 #${regiment.i}`,
    side,
    sideLabel,
    casualties
  };
}

function applyBattleResult(map, state, regiment, event, eventInput, opponent = null) {
  const rule = BATTLE_RESULT_RULES[eventInput.outcome] || BATTLE_RESULT_RULES.draw;
  const ownResult = applyBattleResultRule(map, state, regiment, rule);
  const side = normalizeBattleChainSide(event.chainSide || eventInput.chainSide || "local");
  const affectedRegiments = [battleEventRegimentReference(state, regiment, side, battleChainSideLabel(side), ownResult.casualties)];
  const sideCasualties = createEmptyBattleSideCasualties();
  sideCasualties[side] += ownResult.casualties;
  let opponentResult = null;

  if (opponent?.state && opponent.regiment) {
    const opponentSide = oppositeBattleSide(side);
    const opponentRule = BATTLE_OPPONENT_RESULT_RULES[eventInput.outcome] || BATTLE_OPPONENT_RESULT_RULES.draw;
    opponentResult = applyBattleResultRule(map, opponent.state, opponent.regiment, opponentRule);
    affectedRegiments.push(battleEventRegimentReference(opponent.state, opponent.regiment, opponentSide, battleChainSideLabel(opponentSide), opponentResult.casualties));
    sideCasualties[opponentSide] += opponentResult.casualties;
  }

  event.resultApplied = true;
  event.affectedRegiments = affectedRegiments;
  event.result = {
    label: rule.label,
    summary: buildBattleResultSummary({
      label: rule.label,
      troopBefore: ownResult.troopBefore,
      troopAfter: ownResult.troopAfter,
      casualties: ownResult.casualties,
      statusAfterLabel: ownResult.statusAfterLabel,
      opponent: opponentResult
    }),
    unitLossSummary: formatUnitLossSummary(ownResult.unitLosses),
    lossRate: rule.lossRate,
    troopBefore: ownResult.troopBefore,
    troopAfter: ownResult.troopAfter,
    troopDelta: ownResult.troopDelta,
    casualties: ownResult.casualties,
    unitLosses: ownResult.unitLosses,
    statusBefore: ownResult.statusBefore,
    statusBeforeLabel: ownResult.statusBeforeLabel,
    statusAfter: ownResult.statusAfter,
    statusAfterLabel: ownResult.statusAfterLabel,
    sideCasualties,
    opponent: opponentResult ? {
      stateId: opponent.state.i,
      stateName: stateName(opponent.state),
      regimentId: opponent.regiment.i,
      regimentObjectId: opponent.regiment.id || `${opponent.state.i}:${opponent.regiment.i}`,
      regimentName: opponent.regiment.name || `军团 #${opponent.regiment.i}`,
      side: oppositeBattleSide(side),
      sideLabel: battleChainSideLabel(oppositeBattleSide(side)),
      label: opponentResult.label,
      summary: buildBattleResultSummary(opponentResult),
      unitLossSummary: formatUnitLossSummary(opponentResult.unitLosses),
      lossRate: opponentResult.lossRate,
      troopBefore: opponentResult.troopBefore,
      troopAfter: opponentResult.troopAfter,
      troopDelta: opponentResult.troopDelta,
      casualties: opponentResult.casualties,
      unitLosses: opponentResult.unitLosses,
      statusBefore: opponentResult.statusBefore,
      statusBeforeLabel: opponentResult.statusBeforeLabel,
      statusAfter: opponentResult.statusAfter,
      statusAfterLabel: opponentResult.statusAfterLabel
    } : null
  };
}

function buildBattleResultSummary(result) {
  const primary = `${result.label || "战斗结果"}：${formatNumber(result.troopBefore)} -> ${formatNumber(result.troopAfter)}，损耗 ${formatNumber(result.casualties)}，态势改为${result.statusAfterLabel || "未知"}`;
  const opponent = result.opponent ? `；对手 ${formatNumber(result.opponent.troopBefore)} -> ${formatNumber(result.opponent.troopAfter)}，损耗 ${formatNumber(result.opponent.casualties)}` : "";
  return `${primary}${opponent}`;
}

function applyBattleResultRule(map, state, regiment, rule) {
  const beforeTroops = Math.max(0, Math.round(Number(regiment.a || sumUnitTroops(regiment.u))));
  const casualties = getBattleCasualties(beforeTroops, rule.lossRate);
  const afterTroops = Math.max(beforeTroops > 0 ? 1 : 0, beforeTroops - casualties);
  const beforeUnits = clonePlain(regiment.u || {});
  const nextUnits = scaleUnitsToTroops(beforeUnits, afterTroops);
  const unitLosses = getUnitLosses(beforeUnits, nextUnits);
  const previousStatus = {
    status: regiment.status,
    statusLabel: regiment.statusLabel
  };

  regiment.u = nextUnits;
  regiment.a = Object.values(nextUnits).reduce((sum, value) => sum + Number(value || 0), 0);
  regiment.dominantUnit = dominantUnitName(nextUnits);
  regiment.dominantUnitLabel = unitLabel(regiment.dominantUnit);
  if (rule.status) {
    regiment.status = rule.status;
    regiment.statusLabel = MILITARY_STATUSES[rule.status]?.label || rule.status;
    regiment.order = createManualOrder(map, state, regiment, rule.status);
  }
  applyRegimentIconProfile(regiment);
  refreshStateGeneratedTroops(state);

  return {
    label: rule.label,
    lossRate: rule.lossRate,
    troopBefore: beforeTroops,
    troopAfter: regiment.a,
    troopDelta: regiment.a - beforeTroops,
    casualties: beforeTroops - regiment.a,
    unitLosses,
    statusBefore: previousStatus.status,
    statusBeforeLabel: previousStatus.statusLabel,
    statusAfter: regiment.status,
    statusAfterLabel: regiment.statusLabel
  };
}

function formatUnitLossSummary(unitLosses = {}) {
  const parts = Object.entries(unitLosses)
    .filter(([, value]) => Number(value || 0) > 0)
    .map(([unit, value]) => `${unitLabel(unit)} ${formatNumber(value)}`);
  return parts.length ? parts.join(" / ") : "无兵种损耗";
}

function formatNumber(value) {
  return String(Math.round(Number(value || 0)));
}

function getBattleCasualties(troops, lossRate) {
  if (troops <= 1 || lossRate <= 0) return 0;
  return Math.min(troops - 1, Math.max(1, Math.round(troops * lossRate)));
}

function scaleUnitsToTroops(units = {}, targetTroops) {
  const entries = Object.entries(units).filter(([, value]) => Number(value || 0) > 0);
  if (!entries.length || targetTroops <= 0) return {};
  const total = entries.reduce((sum, [, value]) => sum + Number(value || 0), 0);
  const scale = targetTroops / Math.max(1, total);
  const result = {};
  for (const [unit, value] of entries) result[unit] = Math.max(0, Math.round(Number(value || 0) * scale));
  const current = Object.values(result).reduce((sum, value) => sum + value, 0);
  const delta = targetTroops - current;
  if (delta !== 0) {
    const dominant = dominantUnitName(units);
    result[dominant] = Math.max(0, Number(result[dominant] || 0) + delta);
  }
  return result;
}

function getUnitLosses(before = {}, after = {}) {
  return Object.fromEntries(Object.keys({...before, ...after})
    .map(unit => [unit, Math.max(0, Number(before[unit] || 0) - Number(after[unit] || 0))])
    .filter(([, value]) => value > 0));
}

function ensureMilitaryEventStore(map) {
  if (!map.military || typeof map.military !== "object") map.military = {};
  const military = map?.pack?.military && typeof map.pack.military === "object" ? map.pack.military : map.military;
  map.military = military;
  if (map?.pack) map.pack.military = military;
  if (!Array.isArray(military.events)) military.events = [];
  if (!military.metadata || typeof military.metadata !== "object") military.metadata = {};
  return military;
}

function createManualOrder(map, state, regiment, status) {
  const kind = {
    patrolling: "patrol",
    marching: "advance",
    resting: "rest",
    mustering: "muster",
    routed: "retreat",
    garrisoned: "garrison"
  }[status] || "garrison";
  const cell = status === "routed" ? state.center : regiment.cell;
  return {
    kind,
    targetCell: cell,
    targetName: getOrderTargetName(map, state, cell)
  };
}

function getOrderTargetName(map, state, cell) {
  const burgId = map?.pack?.cells?.burg?.[cell];
  const provinceId = map?.pack?.cells?.province?.[cell];
  return map?.pack?.burgs?.[burgId]?.name || map?.pack?.provinces?.[provinceId]?.name || state.name || `国家 #${state.i}`;
}

function refreshMilitaryStatusMetadata(map) {
  const military = map?.pack?.military || map?.military;
  if (!military?.metadata) return;
  const states = map?.pack?.states || map?.politics?.states || [];
  const regiments = states.flatMap(state => state?.military || []);
  military.metadata.statuses = regiments.reduce((counts, regiment) => {
    const status = regiment.status || "unknown";
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
}

function refreshMilitaryTroopMetadata(map) {
  const military = map?.pack?.military || map?.military;
  if (!military?.metadata) return;
  const states = map?.pack?.states || map?.politics?.states || [];
  const regiments = states.flatMap(state => state?.military || []);
  military.metadata.regiments = regiments.length;
  military.metadata.troops = roundValue(regiments.reduce((sum, regiment) => sum + Number(regiment.a || 0), 0), 0);
  military.metadata.navalRegiments = regiments.filter(regiment => regiment.n).length;
  for (const state of states) refreshStateGeneratedTroops(state);
}

function refreshStateGeneratedTroops(state) {
  if (!state?.militaryPolicy) return;
  state.militaryPolicy.generatedTroops = roundValue((state.military || []).reduce((sum, regiment) => sum + Number(regiment.a || 0), 0), 0);
}

function refreshMilitaryEventMetadata(map) {
  const military = map?.pack?.military || map?.military;
  if (!military?.metadata) return;
  military.metadata.events = Array.isArray(military.events) ? military.events.length : 0;
  refreshMilitaryCampaignEventSummaries(map, military);
}

function refreshMilitaryCampaignEventSummaries(map, military = map?.pack?.military || map?.military) {
  if (!Array.isArray(military?.campaigns)) return;
  const campaignByKey = new Map();
  for (const campaign of military.campaigns) {
    resetCampaignEventSummary(map, campaign);
    for (const key of campaignEventKeys(campaign)) campaignByKey.set(key, campaign);
  }

  const events = Array.isArray(military.events) ? military.events : [];
  for (const event of events) {
    if (!event || event.kind !== "battle") continue;
    const campaign = campaignByKey.get(String(event.chainKey || event.campaignKey || ""));
    if (!campaign) continue;
    campaign.events += 1;
    if (event.resultApplied) campaign.appliedEvents += 1;
    else campaign.pendingEvents += 1;
    if (event.resultApplied) addCampaignBattleEventCasualties(campaign, event);
    if (!campaign.latestEvent || Number(event.sequence || 0) >= Number(campaign.latestEvent.sequence || 0)) {
      campaign.latestEvent = summarizeBattleEvent(event);
    }
  }

  for (const campaign of military.campaigns) {
    campaign.casualties = roundValue(campaign.casualties, 0);
    campaign.attackerCasualties = roundValue(campaign.attackerCasualties, 0);
    campaign.defenderCasualties = roundValue(campaign.defenderCasualties, 0);
    campaign.participantCasualties = roundValue(campaign.participantCasualties, 0);
    campaign.localCasualties = roundValue(campaign.localCasualties, 0);
    campaign.manualCasualties = roundValue(campaign.manualCasualties, 0);
    updateCampaignPhaseSummary(campaign);
  }
}

function resetCampaignEventSummary(map, campaign) {
  const attacker = map?.pack?.states?.[campaign.attacker] || map?.politics?.states?.[campaign.attacker];
  const defender = map?.pack?.states?.[campaign.defender] || map?.politics?.states?.[campaign.defender];
  const attackerRegiments = attacker?.military || [];
  const defenderRegiments = defender?.military || [];
  campaign.attackerRegiments = attackerRegiments.length;
  campaign.defenderRegiments = defenderRegiments.length;
  campaign.attackerTroops = roundValue(attackerRegiments.reduce((sum, regiment) => sum + Number(regiment.a || 0), 0), 0);
  campaign.defenderTroops = roundValue(defenderRegiments.reduce((sum, regiment) => sum + Number(regiment.a || 0), 0), 0);
  campaign.troopBalance = roundValue(campaign.attackerTroops - campaign.defenderTroops, 0);
  campaign.events = 0;
  campaign.appliedEvents = 0;
  campaign.pendingEvents = 0;
  campaign.casualties = 0;
  campaign.sideCasualties = createEmptyBattleSideCasualties();
  campaign.attackerCasualties = 0;
  campaign.defenderCasualties = 0;
  campaign.participantCasualties = 0;
  campaign.localCasualties = 0;
  campaign.manualCasualties = 0;
  campaign.latestEvent = null;
  updateCampaignPhaseSummary(campaign);
}

function updateCampaignPhaseSummary(campaign) {
  if (!Number(campaign.events || 0)) {
    const momentum = campaignMomentum(campaign);
    campaign.phaseKey = "mobilizing";
    campaign.phaseLabel = "动员对峙";
    campaign.momentumKey = momentum.key;
    campaign.momentumLabel = momentum.label;
    campaign.progress = 0;
    campaign.progressLabel = "0%";
    return;
  }
  const attackerInitial = Math.max(0, Number(campaign.attackerTroops || 0) + Number(campaign.attackerCasualties || 0));
  const defenderInitial = Math.max(0, Number(campaign.defenderTroops || 0) + Number(campaign.defenderCasualties || 0));
  const initialTotal = Math.max(1, attackerInitial + defenderInitial);
  const casualtyRatio = Number(campaign.casualties || 0) / initialTotal;
  const eventPressure = Math.min(40, Number(campaign.appliedEvents || 0) * 8 + Number(campaign.pendingEvents || 0) * 3);
  const lossPressure = Math.min(45, casualtyRatio * 180);
  const balancePressure = Math.min(15, Math.abs(Number(campaign.troopBalance || 0)) / Math.max(1, Math.max(Number(campaign.attackerTroops || 0), Number(campaign.defenderTroops || 0))) * 30);
  const progress = roundValue(Math.min(100, eventPressure + lossPressure + balancePressure), 0);
  const phase = campaignPhaseForProgress(campaign, progress);
  const momentum = campaignMomentum(campaign);
  campaign.phaseKey = phase.key;
  campaign.phaseLabel = phase.label;
  campaign.momentumKey = momentum.key;
  campaign.momentumLabel = momentum.label;
  campaign.progress = progress;
  campaign.progressLabel = `${progress}%`;
}

function campaignPhaseForProgress(campaign, progress) {
  if (!Number(campaign.events || 0)) return {key: "mobilizing", label: "动员对峙"};
  if (!Number(campaign.appliedEvents || 0)) return {key: "probing", label: "前哨接触"};
  if (progress < 25) return {key: "skirmishing", label: "边境交战"};
  if (progress < 55) return {key: "engaged", label: "战线胶着"};
  if (progress < 80) return {key: "decisive", label: "决战推进"};
  return {key: "exhausted", label: "战役消耗"};
}

function campaignMomentum(campaign) {
  const attackerTroops = Number(campaign.attackerTroops || 0);
  const defenderTroops = Number(campaign.defenderTroops || 0);
  const attackerInitial = Math.max(1, attackerTroops + Number(campaign.attackerCasualties || 0));
  const defenderInitial = Math.max(1, defenderTroops + Number(campaign.defenderCasualties || 0));
  const attackerRemaining = attackerTroops / attackerInitial;
  const defenderRemaining = defenderTroops / defenderInitial;
  const remainingDelta = attackerRemaining - defenderRemaining;
  const troopDelta = (attackerTroops - defenderTroops) / Math.max(1, Math.max(attackerTroops, defenderTroops));
  if (remainingDelta > 0.08 || troopDelta > 0.18) return {key: "attacker", label: "攻方占优"};
  if (remainingDelta < -0.08 || troopDelta < -0.18) return {key: "defender", label: "守方占优"};
  if (Number(campaign.appliedEvents || 0)) return {key: "contested", label: "拉锯"};
  return {key: "balanced", label: "均势"};
}

function campaignEventKeys(campaign = {}) {
  return [campaign.chainKey, campaign.id, campaign.key ? `campaign:${slugText(campaign.key)}` : ""]
    .filter(Boolean)
    .map(String);
}

function battleEventCasualties(event) {
  const result = event?.result || {};
  const sideTotal = sumBattleSideCasualties(result.sideCasualties);
  if (sideTotal > 0) return sideTotal;
  const direct = Number(result.casualties);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const delta = Math.abs(Number(result.troopDelta || 0));
  return Number.isFinite(delta) ? delta : 0;
}

function addCampaignBattleEventCasualties(campaign, event) {
  const result = event?.result || {};
  const sideCasualties = normalizeBattleSideCasualties(result.sideCasualties);
  const sideTotal = sumBattleSideCasualties(sideCasualties);
  if (sideTotal > 0) {
    for (const [side, casualties] of Object.entries(sideCasualties)) campaign.sideCasualties[side] += casualties;
    campaign.casualties += sideTotal;
  } else {
    const casualties = battleEventCasualties(event);
    if (!casualties) return;
    const side = normalizeBattleChainSide(event.chainSide || event.side || "local");
    campaign.sideCasualties[side] += casualties;
    campaign.casualties += casualties;
  }
  campaign.attackerCasualties = campaign.sideCasualties.attacker;
  campaign.defenderCasualties = campaign.sideCasualties.defender;
  campaign.participantCasualties = campaign.sideCasualties.participant;
  campaign.localCasualties = campaign.sideCasualties.local;
  campaign.manualCasualties = campaign.sideCasualties.manual;
}

function normalizeBattleSideCasualties(sideCasualties = {}) {
  const result = createEmptyBattleSideCasualties();
  for (const side of Object.keys(result)) {
    const value = Number(sideCasualties?.[side] || 0);
    result[side] = Number.isFinite(value) && value > 0 ? value : 0;
  }
  return result;
}

function sumBattleSideCasualties(sideCasualties = {}) {
  return Object.values(sideCasualties || {}).reduce((sum, value) => sum + Math.max(0, Number(value || 0)), 0);
}

function normalizeBattleChainSide(side) {
  if (side === "attacker" || side === "defender" || side === "participant" || side === "manual") return side;
  return "local";
}

function createEmptyBattleSideCasualties() {
  return {attacker: 0, defender: 0, participant: 0, local: 0, manual: 0};
}

function summarizeBattleEvent(event) {
  return {
    id: event.id || "",
    sequence: Number(event.sequence || 0),
    chainSide: event.chainSide || event.side || "local",
    chainSideLabel: event.chainSideLabel || battleChainSideLabel(event.chainSide || event.side || "local"),
    type: event.type || "",
    typeLabel: event.typeLabel || event.type || "事件",
    outcome: event.outcome || "",
    outcomeLabel: event.outcomeLabel || event.outcome || "结果",
    resultApplied: Boolean(event.resultApplied),
    casualties: event.resultApplied ? battleEventCasualties(event) : 0,
    at: event.at || ""
  };
}

function sumUnitTroops(units = {}) {
  return Object.values(units).reduce((sum, value) => sum + Number(value || 0), 0);
}

function dominantUnitName(units = {}) {
  let best = "infantry";
  let bestValue = -1;
  for (const [unit, value] of Object.entries(units || {})) {
    if (Number(value || 0) > bestValue) {
      best = unit;
      bestValue = Number(value || 0);
    }
  }
  return best;
}

function unitLabel(unitName) {
  return MILITARY_UNITS.find(unit => unit.name === unitName)?.label || unitName || "未知";
}

function ratiosEqual(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const key of keys) if (Math.abs(Number(a?.[key] || 0) - Number(b?.[key] || 0)) > 0.0001) return false;
  return true;
}

function nearlyEqual(a, b) {
  return Math.abs(Number(a || 0) - Number(b || 0)) < 0.01;
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === "") return NaN;
  return Number(value);
}

function roundValue(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
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
