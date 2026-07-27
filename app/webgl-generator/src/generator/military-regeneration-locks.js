export function prepareLockedMilitaryRegiments(pack, options = {}) {
  const sources = [];
  const seen = new Set();
  for (const collection of [options.preservedRegiments, options.lockedMilitaryRegiments]) {
    if (collection !== undefined && !Array.isArray(collection)) throw militaryLockConflict("锁定军团约束必须是数组", {reason: "invalid-constraint"});
    for (const source of collection || []) {
      const identity = regimentIdentity(source);
      if (!identity || seen.has(identity.id)) {
        if (!identity) throw militaryLockConflict("锁定军团缺少有效复合 ID", {reason: "invalid-id"});
        throw militaryLockConflict(`锁定军团 ${identity.id} 重复`, {reason: "duplicate-id", id: identity.id});
      }
      const snapshot = captureMilitaryRegimentSnapshot(pack, identity);
      if (stableValue(source.regiment || source) !== stableValue(snapshot.regiment)) {
        throw militaryLockConflict(`锁定军团 ${identity.id} 与当前对象不一致`, {reason: "regiment-mismatch", id: identity.id});
      }
      sources.push({...snapshot, globalEvents: clonePlain(source.globalEvents ?? snapshot.globalEvents)});
      seen.add(identity.id);
    }
  }
  validateUniqueLocks(sources);
  return {
    regiments: new Map(sources.map(snapshot => [snapshot.id, snapshot])),
    byState: groupByState(sources),
    ids: new Set(sources.map(snapshot => snapshot.id))
  };
}

export function captureMilitaryRegimentSnapshot(pack, source) {
  const identity = regimentIdentity(source);
  if (!identity) throw militaryLockConflict("军团复合 ID 无效", {reason: "invalid-id"});
  const state = pack?.states?.[identity.stateId];
  if (!state?.i || state.removed) throw militaryLockConflict(`锁定军团 ${identity.id} 的国家不存在`, {reason: "missing-state", id: identity.id});
  const regiment = (state.military || []).find(item => Number(item?.i) === identity.regimentId || String(item?.id) === identity.id);
  if (!regiment) throw militaryLockConflict(`锁定军团 ${identity.id} 不存在`, {reason: "missing-regiment", id: identity.id});
  validateRegimentPlacement(pack, state, regiment, identity);
  const globalEvents = (pack?.military?.events || []).filter(event => eventMatchesRegiment(event, identity));
  validateEventAssociations(pack?.military, regiment, globalEvents, identity);
  return {id: identity.id, stateId: identity.stateId, regimentId: identity.regimentId, regiment: clonePlain(regiment), globalEvents: clonePlain(globalEvents)};
}

export function seedLockedStateRegiments(state, locked) {
  return (locked.byState.get(Number(state.i)) || []).map(snapshot => clonePlain(snapshot.regiment));
}

export function lockedRegimentOccupancy(locked, stateId) {
  const snapshots = locked.byState.get(Number(stateId)) || [];
  return {
    ids: new Set(snapshots.map(snapshot => snapshot.regimentId)),
    cells: new Set(snapshots.map(snapshot => Number(snapshot.regiment.cell))),
    positions: new Set(snapshots.map(snapshot => positionKey(snapshot.regiment.x, snapshot.regiment.y)))
  };
}

export function mergeLockedMilitaryEvents(result, locked) {
  const current = Array.isArray(result.events) ? result.events : [];
  const byId = new Map(current.map(event => [eventKey(event), event]));
  for (const snapshot of locked.regiments.values()) {
    for (const event of snapshot.globalEvents) byId.set(eventKey(event), clonePlain(event));
  }
  result.events = [...byId.values()];
}

export function assertLockedMilitaryRegiments(pack, locked) {
  for (const snapshot of locked.regiments.values()) {
    const current = captureMilitaryRegimentSnapshot(pack, snapshot);
    if (stableValue(current.regiment) !== stableValue(snapshot.regiment)) {
      throw militaryLockConflict(`锁定军团 ${snapshot.id} 被改写`, {reason: "locked-regiment-changed", id: snapshot.id});
    }
    if (stableValue(current.globalEvents) !== stableValue(snapshot.globalEvents)) {
      throw militaryLockConflict(`锁定军团 ${snapshot.id} 的事件摘要被改写`, {reason: "locked-event-changed", id: snapshot.id});
    }
  }
}

export function militaryLockConflict(message, details = {}) {
  const error = new Error(`regeneration_lock_conflict: ${message}`);
  error.code = "regeneration_lock_conflict";
  error.details = {kind: "military", ...details};
  return error;
}

function validateRegimentPlacement(pack, state, regiment, identity) {
  const cell = Number(regiment.cell);
  const count = pack?.cells?.i?.length || pack?.cells?.h?.length || 0;
  if (!Number.isInteger(cell) || cell < 0 || cell >= count) throw militaryLockConflict(`锁定军团 ${identity.id} 的驻地越界`, {reason: "invalid-cell", id: identity.id});
  if (Number(pack.cells.state?.[cell]) !== Number(state.i)) throw militaryLockConflict(`锁定军团 ${identity.id} 的驻地不属于所属国家`, {reason: "state-ownership", id: identity.id, cell});
  if (Number(pack.cells.h?.[cell]) < 20) throw militaryLockConflict(`锁定军团 ${identity.id} 的驻地位于水域`, {reason: "land-water-conflict", id: identity.id, cell});
  if (regiment.n || regiment.type === "fleet") {
    const haven = Number(pack.cells.haven?.[cell]);
    if (!Number.isInteger(haven) || haven < 0 || Number(pack.cells.h?.[haven]) >= 20 || !pack.cells.p?.[haven]) {
      throw militaryLockConflict(`锁定舰队 ${identity.id} 缺少合法港湾`, {reason: "land-water-conflict", id: identity.id, cell});
    }
  }
  if (!Number.isFinite(Number(regiment.x)) || !Number.isFinite(Number(regiment.y))) {
    throw militaryLockConflict(`锁定军团 ${identity.id} 缺少有效坐标`, {reason: "invalid-position", id: identity.id});
  }
}

function validateUniqueLocks(snapshots) {
  const ids = new Set();
  for (const snapshot of snapshots) {
    if (ids.has(snapshot.id)) throw militaryLockConflict(`锁定军团 ${snapshot.id} 重复`, {reason: "duplicate-id", id: snapshot.id});
    ids.add(snapshot.id);
  }
}

function validateEventAssociations(military, regiment, globalEvents, identity) {
  const events = [...(regiment.events || []), ...globalEvents];
  for (const event of events) {
    const chainKey = String(event?.chainKey || event?.campaignKey || "");
    if (!chainKey.startsWith("campaign:")) continue;
    const campaign = (military?.campaigns || []).find(item => String(item?.chainKey || item?.id || "") === chainKey);
    if (!campaign) throw militaryLockConflict(`锁定军团 ${identity.id} 的事件引用缺失战役`, {reason: "campaign-reference-conflict", id: identity.id, chainKey});
    if (!Number.isInteger(Number(campaign.attacker)) || !Number.isInteger(Number(campaign.defender))) {
      throw militaryLockConflict(`锁定军团 ${identity.id} 的战役国家引用无效`, {reason: "campaign-reference-conflict", id: identity.id, chainKey});
    }
    for (const frontId of campaign.frontIds || []) {
      if (!(military?.fronts || []).some(front => String(front?.id) === String(frontId))) {
        throw militaryLockConflict(`锁定军团 ${identity.id} 的战役引用缺失战线`, {reason: "front-reference-conflict", id: identity.id, frontId});
      }
    }
  }
}

function regimentIdentity(source) {
  const regiment = source?.regiment || source;
  const [idState, idRegiment] = String(source?.id ?? regiment?.id ?? "").split(":");
  const stateId = Number(source?.stateId ?? regiment?.state ?? idState);
  const regimentId = Number(source?.regimentId ?? regiment?.i ?? idRegiment);
  if (!Number.isInteger(stateId) || stateId <= 0 || !Number.isInteger(regimentId) || regimentId < 0) return null;
  return {id: `${stateId}:${regimentId}`, stateId, regimentId};
}

function eventMatchesRegiment(event, identity) {
  return String(event?.regimentObjectId || "") === identity.id
    || Number(event?.stateId) === identity.stateId && Number(event?.regimentId) === identity.regimentId;
}

function groupByState(snapshots) {
  const result = new Map();
  for (const snapshot of snapshots) {
    if (!result.has(snapshot.stateId)) result.set(snapshot.stateId, []);
    result.get(snapshot.stateId).push(snapshot);
  }
  for (const values of result.values()) values.sort((left, right) => left.regimentId - right.regimentId);
  return result;
}

function eventKey(event) {
  return String(event?.id || `${event?.stateId}:${event?.regimentId}:${event?.sequence}:${event?.at}`);
}

function positionKey(x, y) {
  return `${Number(x).toFixed(4)}:${Number(y).toFixed(4)}`;
}

function stableValue(value) {
  return JSON.stringify(value);
}

function clonePlain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
