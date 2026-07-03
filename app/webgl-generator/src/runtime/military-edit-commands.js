import {buildMilitary, MILITARY_STATUSES, normalizeUnitRatios} from "../generator/military.js";

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

function ratiosEqual(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const key of keys) if (Math.abs(Number(a?.[key] || 0) - Number(b?.[key] || 0)) > 0.0001) return false;
  return true;
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}
