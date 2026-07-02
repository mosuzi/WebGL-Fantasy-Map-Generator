import {buildMilitary, normalizeUnitRatios} from "../generator/military.js";

const MILITARY_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["point-layers", "line-layers", "object-index", "labels", "object-panels"])
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

function ratiosEqual(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const key of keys) if (Math.abs(Number(a?.[key] || 0) - Number(b?.[key] || 0)) > 0.0001) return false;
  return true;
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}
