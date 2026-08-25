#!/usr/bin/env node
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {captureMilitaryRegimentSnapshot} from "../app/webgl-generator/src/generator/military-regeneration-locks.js";
import {createRegenerateMilitaryCommand} from "../app/webgl-generator/src/runtime/military-edit-commands.js";
import {snapshotMilitaryVariation} from "../app/webgl-generator/src/runtime/military-regeneration-variation.js";

const base = generatePlaceholderMap({seed: "regeneration-lock-military", cellsTarget: 10000, heightmapTemplate: "continents"});
const regiments = activeRegiments(base);
const land = regiments.find(({regiment}) => !regiment.n && regiment.type !== "fleet");
const fleet = regiments.find(({regiment}) => regiment.n || regiment.type === "fleet");
assert(land && fleet, "固定图不足一支陆军和一支舰队");

replaceRegimentIdentity(base, land.state.i, land.regiment.i, 50000);
const sparseId = `${land.state.i}:50000`;
const fleetId = `${fleet.state.i}:${fleet.regiment.i}`;
base.regenerationLocks.entries.push({kind: "military", id: sparseId}, {kind: "military", id: fleetId});
const lockedBefore = [
  captureMilitaryRegimentSnapshot(base.pack, {id: sparseId}),
  captureMilitaryRegimentSnapshot(base.pack, {id: fleetId})
];
const unlockedBefore = unlockedSnapshot(base, new Set([sparseId, fleetId]));
const partial = createRegenerateMilitaryCommand({seed: "regeneration-lock-military:partial"});
partial.apply({map: base});
for (const snapshot of lockedBefore) {
  assertDeepEqual(captureMilitaryRegimentSnapshot(base.pack, snapshot), snapshot, `部分锁定改变了军团 ${snapshot.id}`);
}
assert(partial.getResult()?.variation?.changed, "部分锁定时其它军团没有变化");
assert(anyVariationChanged(unlockedBefore, unlockedSnapshot(base, new Set([sparseId, fleetId]))), "部分锁定的纯快照未观察到变化");
assertPoliticsMilitaryMirror(base);
assert(!activeRegiments(base).some(({regiment}) => regiment.i === 50000 && regiment.id !== sparseId), "稀疏军团 ID 被重复分配");

const allLockedMap = structuredClone(base);
allLockedMap.regenerationLocks.entries = activeRegiments(allLockedMap).map(({state, regiment}) => ({
  kind: "military",
  id: `${state.i}:${regiment.i}`
}));
const allBefore = fullSnapshot(allLockedMap);
const allCommand = createRegenerateMilitaryCommand({seed: "regeneration-lock-military:all"});
assert(allCommand.isNoop({map: allLockedMap}), "全部军团锁定时命令未报告 no-op");
allCommand.apply({map: allLockedMap});
assertDeepEqual(fullSnapshot(allLockedMap), allBefore, "全部军团锁定时地图仍被修改");
assert(allCommand.getResult()?.attempts === 0, "全锁 no-op 推进了重试");

const missingStateMap = structuredClone(base);
missingStateMap.pack.states[land.state.i].removed = true;
assertConflict(() => createRegenerateMilitaryCommand().apply({map: missingStateMap}), "missing-state");

const invalidCellMap = structuredClone(base);
findRegiment(invalidCellMap, sparseId).cell = invalidCellMap.pack.cells.i.length + 10;
mirrorMilitaryState(invalidCellMap, land.state.i);
assertConflict(() => createRegenerateMilitaryCommand().apply({map: invalidCellMap}), "invalid-cell");

const waterStationMap = structuredClone(base);
const waterStation = findRegiment(waterStationMap, sparseId);
waterStation.cell = waterStationMap.pack.cells.i.find(cell => waterStationMap.pack.cells.h[cell] < 20);
mirrorMilitaryState(waterStationMap, land.state.i);
const waterStationBefore = captureMilitaryRegimentSnapshot(waterStationMap.pack, {id: sparseId});
createRegenerateMilitaryCommand({seed: "regeneration-lock-military:water-station"}).apply({map: waterStationMap});
assertDeepEqual(captureMilitaryRegimentSnapshot(waterStationMap.pack, {id: sparseId}), waterStationBefore, "水域或跨国驻地锁军团没有原样直通");

const duplicateMap = structuredClone(base);
const duplicateSnapshot = captureMilitaryRegimentSnapshot(duplicateMap.pack, {id: sparseId});
const duplicateSame = createRegenerateMilitaryCommand({
  seed: "regeneration-lock-military:duplicate-same",
  preservedRegiments: [structuredClone(duplicateSnapshot)]
});
duplicateSame.apply({map: duplicateMap});
assertDeepEqual(
  captureMilitaryRegimentSnapshot(duplicateMap.pack, duplicateSnapshot),
  duplicateSnapshot,
  "锁仓与显式 preservedRegiments 的同源同 ID 快照未正确去重"
);
const conflictingSnapshot = structuredClone(duplicateSnapshot);
conflictingSnapshot.regiment.name = `${conflictingSnapshot.regiment.name}-conflict`;
assertConflict(() => createRegenerateMilitaryCommand({
  lockedMilitaryRegiments: [duplicateSnapshot, conflictingSnapshot]
}).apply({map: duplicateMap}), "duplicate-id");

const coLocatedMap = generatePlaceholderMap({
  seed: "regeneration-lock-military",
  cellsTarget: 10000,
  heightmapTemplate: "continents"
});
const coLocated = findCoLocatedRegiments(coLocatedMap);
assert(coLocated.length >= 2, "固定图缺少既有合法共驻军团样本");
const coLocatedIds = new Set(coLocated.map(({state, regiment}) => `${state.i}:${regiment.i}`));
coLocatedMap.regenerationLocks.entries = [...coLocatedIds].map(id => ({kind: "military", id}));
const coLocatedBefore = coLocated.map(({state, regiment}) =>
  captureMilitaryRegimentSnapshot(coLocatedMap.pack, {id: `${state.i}:${regiment.i}`})
);
const coLocatedPosition = `${Number(coLocated[0].regiment.x).toFixed(4)}:${Number(coLocated[0].regiment.y).toFixed(4)}`;
const coLocatedCommand = createRegenerateMilitaryCommand({seed: "regeneration-lock-military:co-located"});
coLocatedCommand.apply({map: coLocatedMap});
for (const snapshot of coLocatedBefore) {
  assertDeepEqual(
    captureMilitaryRegimentSnapshot(coLocatedMap.pack, snapshot),
    snapshot,
    `共驻军团 ${snapshot.id} 未完整保留`
  );
}
const postRegenerationOccupants = activeRegiments(coLocatedMap)
  .filter(({regiment}) => `${Number(regiment.x).toFixed(4)}:${Number(regiment.y).toFixed(4)}` === coLocatedPosition)
  .map(({state, regiment}) => `${state.i}:${regiment.i}`);
assert(
  postRegenerationOccupants.every(id => coLocatedIds.has(id)),
  `未锁军团侵占共驻保护位置：${postRegenerationOccupants.join(",")}`
);

const campaignMap = structuredClone(base);
findRegiment(campaignMap, sparseId).events = [{id: "invalid-campaign", chainKey: "campaign:missing"}];
mirrorMilitaryState(campaignMap, land.state.i);
assertConflict(() => createRegenerateMilitaryCommand().apply({map: campaignMap}), "campaign-reference-conflict");

const faultMap = structuredClone(base);
faultMap.regenerationLocks.entries = [{kind: "military", id: sparseId}];
const faultBefore = fullSnapshot(faultMap);
assertThrows(
  () => createRegenerateMilitaryCommand({seed: "regeneration-lock-military:fault", faultAt: "after-events"}).apply({map: faultMap}),
  "after-events",
  "军事故障注入未抛错"
);
assertDeepEqual(fullSnapshot(faultMap), faultBefore, "军事命令故障没有完整回滚");

console.log(JSON.stringify({
  ok: true,
  locked: {land: sparseId, fleet: fleetId},
  attempts: partial.getResult()?.attempts,
  unlockedChanged: partial.getResult()?.variation?.changedRegiments,
  allLockedNoop: allLockedMap.regenerationLocks.entries.length,
  duplicateSources: "deduplicated",
  coLocated: {
    locked: [...coLocatedIds],
    protectedOccupants: postRegenerationOccupants
  },
  bypassedGenerationConstraints: ["water-or-foreign-station"],
  conflicts: ["missing-state", "invalid-cell", "duplicate-id", "campaign-reference-conflict"],
  rollback: "after-events"
}, null, 2));

function activeRegiments(map) {
  return (map.pack.states || [])
    .filter(state => state?.i && !state.removed)
    .flatMap(state => (state.military || []).map(regiment => ({state, regiment})));
}

function findCoLocatedRegiments(map) {
  const groups = new Map();
  for (const entry of activeRegiments(map)) {
    const key = `${entry.state.i}:${Number(entry.regiment.x).toFixed(4)}:${Number(entry.regiment.y).toFixed(4)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  return [...groups.values()].find(group => group.length >= 2) || [];
}

function replaceRegimentIdentity(map, stateId, previousId, nextId) {
  const regiment = (map.pack.states[stateId].military || []).find(item => item.i === previousId);
  assert(regiment, "找不到待改为稀疏 ID 的军团");
  const previousObjectId = `${stateId}:${previousId}`;
  regiment.i = nextId;
  regiment.id = `${stateId}:${nextId}`;
  for (const event of map.military?.events || []) {
    if (event.regimentObjectId === previousObjectId) event.regimentObjectId = regiment.id;
    if (Number(event.stateId) === stateId && Number(event.regimentId) === previousId) event.regimentId = nextId;
  }
  mirrorMilitaryState(map, stateId);
}

function findRegiment(map, id) {
  const [stateId, regimentId] = id.split(":").map(Number);
  return (map.pack.states[stateId]?.military || []).find(item => Number(item.i) === regimentId);
}

function mirrorMilitaryState(map, stateId) {
  if (!Array.isArray(map.politics?.states) || map.politics.states === map.pack.states) return;
  const source = map.pack.states[stateId];
  const target = map.politics.states[stateId];
  target.military = structuredClone(source.military || []);
  target.militaryPolicy = structuredClone(source.militaryPolicy || {});
  target.militaryDiagnostics = structuredClone(source.militaryDiagnostics || {});
  target.alert = source.alert;
}

function assertPoliticsMilitaryMirror(map) {
  if (!Array.isArray(map.politics?.states) || map.politics.states === map.pack.states) return;
  for (const state of map.pack.states || []) {
    if (!state?.i || state.removed) continue;
    assertDeepEqual(map.politics.states[state.i]?.military, state.military, `国家 ${state.i} 的 politics 军事镜像未同步`);
  }
}

function unlockedSnapshot(map, lockedIds) {
  return snapshotMilitaryVariation(map).filter(item => !lockedIds.has(item.id));
}

function anyVariationChanged(before, after) {
  return JSON.stringify(before) !== JSON.stringify(after);
}

function fullSnapshot(map) {
  return structuredClone({
    military: map.military,
    packMilitary: map.pack.military,
    packStates: map.pack.states,
    politicsStates: map.politics?.states
  });
}

function assertConflict(action, reason) {
  try {
    action();
  } catch (error) {
    assert(error?.code === "regeneration_lock_conflict", `${reason} 未返回 regeneration_lock_conflict`);
    assert(error?.details?.reason === reason, `${reason} 返回了错误原因 ${error?.details?.reason}`);
    return;
  }
  throw new Error(`${reason} 未触发冲突`);
}

function assertThrows(action, pattern, message) {
  try {
    action();
  } catch (error) {
    assert(String(error?.message || error).includes(pattern), `${message}：${error?.message || error}`);
    return;
  }
  throw new Error(message);
}

function assertDeepEqual(actual, expected, message) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
