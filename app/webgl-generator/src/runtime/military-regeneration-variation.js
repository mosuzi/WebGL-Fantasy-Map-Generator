export function snapshotMilitaryVariation(map) {
  return (map?.pack?.states || [])
    .filter(state => state?.i && !state.removed)
    .flatMap(state => (state.military || []).map(regiment => ({
      id: `${state.i}:${regiment.i}`,
      state: state.i,
      regiment: regiment.i,
      troops: numberOrZero(regiment.a),
      cell: numberOrZero(regiment.cell),
      x: numberOrZero(regiment.x),
      y: numberOrZero(regiment.y),
      status: String(regiment.status || ""),
      dominantUnit: String(regiment.dominantUnit || ""),
      units: normalizeUnitMap(regiment.u),
      order: normalizeOrder(regiment.order)
    })))
    .sort((left, right) => left.id.localeCompare(right.id, "en", {numeric: true}));
}

export function compareMilitaryVariation(beforeSnapshot, afterSnapshot) {
  const before = new Map((beforeSnapshot || []).map(item => [item.id, item]));
  const after = new Map((afterSnapshot || []).map(item => [item.id, item]));
  const ids = new Set([...before.keys(), ...after.keys()]);
  const result = {
    beforeRegiments: before.size,
    afterRegiments: after.size,
    changedRegiments: 0,
    addedRegiments: 0,
    removedRegiments: 0,
    troopChanges: 0,
    compositionChanges: 0,
    statusChanges: 0,
    positionChanges: 0,
    orderChanges: 0
  };

  for (const id of ids) {
    const previous = before.get(id);
    const current = after.get(id);
    if (!previous || !current) {
      result.changedRegiments += 1;
      if (current) result.addedRegiments += 1;
      else result.removedRegiments += 1;
      continue;
    }

    const troopChanged = previous.troops !== current.troops;
    const compositionChanged = previous.dominantUnit !== current.dominantUnit || previous.units !== current.units;
    const statusChanged = previous.status !== current.status;
    const positionChanged = previous.cell !== current.cell || previous.x !== current.x || previous.y !== current.y;
    const orderChanged = previous.order !== current.order;
    if (troopChanged) result.troopChanges += 1;
    if (compositionChanged) result.compositionChanges += 1;
    if (statusChanged) result.statusChanges += 1;
    if (positionChanged) result.positionChanges += 1;
    if (orderChanged) result.orderChanges += 1;
    if (troopChanged || compositionChanged || statusChanged || positionChanged || orderChanged) result.changedRegiments += 1;
  }

  result.changed = result.changedRegiments > 0;
  return result;
}

export function syncMilitaryStateMirrors(map) {
  const packStates = map?.pack?.states;
  const politicsStates = map?.politics?.states;
  if (!Array.isArray(packStates) || !Array.isArray(politicsStates) || packStates === politicsStates) return 0;

  const packById = new Map(packStates.filter(Boolean).map(state => [Number(state.i), state]));
  let synced = 0;
  for (const state of politicsStates) {
    const source = packById.get(Number(state?.i));
    if (!state || !source || state === source) continue;
    state.military = source.military;
    state.militaryPolicy = source.militaryPolicy;
    state.militaryDiagnostics = source.militaryDiagnostics;
    state.alert = source.alert;
    synced += 1;
  }
  return synced;
}

function normalizeUnitMap(units) {
  return JSON.stringify(Object.entries(units || {}).sort(([left], [right]) => left.localeCompare(right)));
}

function normalizeOrder(order) {
  if (!order) return "";
  return JSON.stringify(Object.entries(order).sort(([left], [right]) => left.localeCompare(right)));
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
