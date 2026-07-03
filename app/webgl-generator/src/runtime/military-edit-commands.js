import {applyRegimentIconProfile, buildMilitary, MILITARY_STATUSES, MILITARY_UNITS, normalizeUnitRatios} from "../generator/military.js";

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

export function createSetMilitaryRatiosCommand(stateId, ratios, {label = "调整兵种比例"} = {}) {
  const normalizedStateId = Number(stateId);
  const normalizedRatios = normalizeUnitRatios(ratios);
  let snapshot = null;

  return {
    label: `${label} #${normalizedStateId}`,
    effects: {
      ...MILITARY_EFFECTS,
      affected: [{kind: "state", id: normalizedStateId}, {kind: "military", id: normalizedStateId}]
    },
    apply(context) {
      const state = context.map?.pack?.states?.[normalizedStateId] || context.map?.politics?.states?.[normalizedStateId];
      if (!state?.i) throw new Error("找不到国家");
      snapshot ??= snapshotMilitary(context.map);
      state.militaryPolicy = {...(state.militaryPolicy || {}), unitRatios: normalizedRatios};
      context.map.military = buildMilitary(context.map.pack, context.map.options);
      syncMilitary(context.map);
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
    effects: {
      ...MILITARY_REGIMENT_EFFECTS,
      affected: [{kind: "military", id: normalizedTarget.id || `${normalizedTarget.stateId}:${normalizedTarget.regimentId}`}]
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
    effects: {
      ...MILITARY_REGIMENT_EFFECTS,
      affected: normalizedTargets.map(target => ({kind: "military", id: target.id || `${target.stateId}:${target.regimentId}`}))
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
    effects: {
      ...effects,
      affected: [{kind: "military", id: normalizedTarget.id || `${normalizedTarget.stateId}:${normalizedTarget.regimentId}`}]
    },
    apply(context) {
      const {state, regiment} = findRegiment(context.map, normalizedTarget);
      if (!state?.i || !regiment) throw new Error("找不到军团");
      previous ??= snapshotBattleEvents(context.map, state, regiment);
      nextEvent ??= createBattleEvent(context.map, state, regiment, eventInput);
      if (eventInput.applyResult) applyBattleResult(context.map, state, regiment, nextEvent, eventInput);
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

export function createMoveMilitaryStationCommand(target, destination, {label = "移动军团驻地"} = {}) {
  const normalizedTarget = normalizeRegimentTarget(target);
  const normalizedDestination = normalizeRegimentDestination(destination);
  let previous = null;

  return {
    label: `${label} #${normalizedTarget.stateId}:${normalizedTarget.regimentId}`,
    effects: {
      ...MILITARY_REGIMENT_EFFECTS,
      affected: [{kind: "military", id: normalizedTarget.id || `${normalizedTarget.stateId}:${normalizedTarget.regimentId}`}]
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
    effects: {
      ...MILITARY_REGIMENT_EFFECTS,
      affected: [{kind: "military", id: normalizedTarget.id || `${normalizedTarget.stateId}:${normalizedTarget.regimentId}`}]
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
    effects: {
      ...MILITARY_REGIMENT_EFFECTS,
      affected: [{kind: "military", id: normalizedTarget.id || `${normalizedTarget.stateId}:${normalizedTarget.regimentId}`}]
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
}

function syncMilitary(map) {
  if (!map?.pack?.military) return;
  map.military = map.pack.military;
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
    applyResult: Boolean(event.applyResult)
  };
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

function snapshotBattleEvents(map, state, regiment) {
  const military = map?.pack?.military || map?.military || {};
  return {
    militaryEvents: Array.isArray(military.events) ? clonePlain(military.events) : null,
    regimentEvents: Array.isArray(regiment.events) ? clonePlain(regiment.events) : null,
    metadata: military.metadata ? clonePlain(military.metadata) : null,
    regiment: snapshotRegimentBattleResult(regiment),
    stateMilitaryPolicy: state?.militaryPolicy ? clonePlain(state.militaryPolicy) : null
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
  return {
    id: `${regiment.id || `${state.i}:${regiment.i}`}:battle:${sequence}`,
    sequence,
    kind: "battle",
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

function applyBattleResult(map, state, regiment, event, eventInput) {
  const rule = BATTLE_RESULT_RULES[eventInput.outcome] || BATTLE_RESULT_RULES.draw;
  const beforeTroops = Math.max(0, Math.round(Number(regiment.a || sumUnitTroops(regiment.u))));
  const casualties = getBattleCasualties(beforeTroops, rule.lossRate);
  const afterTroops = Math.max(beforeTroops > 0 ? 1 : 0, beforeTroops - casualties);
  const beforeUnits = clonePlain(regiment.u || {});
  const nextUnits = scaleUnitsToTroops(beforeUnits, afterTroops);
  const unitLosses = getUnitLosses(beforeUnits, nextUnits);
  const previousStatus = {
    status: regiment.status,
    statusLabel: regiment.statusLabel,
    order: regiment.order ? clonePlain(regiment.order) : null
  };

  regiment.u = nextUnits;
  regiment.a = Object.values(nextUnits).reduce((sum, value) => sum + Number(value || 0), 0);
  regiment.dominantUnit = dominantUnitName(nextUnits);
  regiment.dominantUnitLabel = unitLabel(regiment.dominantUnit);
  regiment.status = rule.status;
  regiment.statusLabel = MILITARY_STATUSES[rule.status]?.label || rule.status;
  regiment.order = createManualOrder(map, state, regiment, rule.status);
  applyRegimentIconProfile(regiment);
  refreshStateGeneratedTroops(state);

  event.resultApplied = true;
  event.result = {
    label: rule.label,
    summary: buildBattleResultSummary({
      label: rule.label,
      troopBefore: beforeTroops,
      troopAfter: regiment.a,
      casualties: beforeTroops - regiment.a,
      statusAfterLabel: regiment.statusLabel
    }),
    unitLossSummary: formatUnitLossSummary(unitLosses),
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

function buildBattleResultSummary(result) {
  return `${result.label || "战斗结果"}：${formatNumber(result.troopBefore)} -> ${formatNumber(result.troopAfter)}，损耗 ${formatNumber(result.casualties)}，态势改为${result.statusAfterLabel || "未知"}`;
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
