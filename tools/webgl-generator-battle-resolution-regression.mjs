#!/usr/bin/env node
import assert from "node:assert/strict";

import {
  createResolveBattleCommand,
  inspectBattle
} from "../app/webgl-generator/src/runtime/military-edit-commands.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";

const outcomes = ["victory", "defeat", "draw", "loss", "regroup"];
for (const outcome of outcomes) {
  const map = createFixture();
  const beforeAuthority = authoritySnapshot(map);
  const inspection = inspectBattle(map, battleRequest({outcome}));
  assert.equal(inspection.allowed, true, `${outcome} 预检失败`);
  assert.equal(inspection.requiresConfirm, true);
  const attackerCell = map.pack.states[1].military[0].cell;
  const defenderCell = map.pack.states[2].military[0].cell;
  const history = new EditHistory();
  history.execute(createResolveBattleCommand(inspection.normalizedInput), {map});
  const event = map.military.events.at(-1);
  assert.equal(event.outcome, outcome);
  assert.equal(event.result.outcome, outcome);
  assert.equal(event.result.opponent.stateId, 2);
  assert.equal(event.result.opponent.regimentId, 0);
  assert.equal(map.pack.states[1].military[0].cell, attackerCell, `${outcome} 隐式移动了进攻军团`);
  assert.equal(map.pack.states[2].military[0].cell, defenderCell, `${outcome} 隐式移动了防守军团`);
  assert.ok(map.pack.states[1].military[0].a >= 0);
  assert.ok(map.pack.states[2].military[0].a >= 0);
  const globalEvents = map.military.events.filter(item => item.id === event.id);
  const attackerEvents = map.pack.states[1].military[0].events.filter(item => item.id === event.id);
  const defenderEvents = map.pack.states[2].military[0].events.filter(item => item.id === event.id);
  assert.equal(globalEvents.length, 1, `${outcome} 全局战报不是恰好一条`);
  assert.equal(attackerEvents.length, 1, `${outcome} 进攻方战报不是恰好一条`);
  assert.equal(defenderEvents.length, 1, `${outcome} 防守方战报不是恰好一条`);
  assert.deepEqual(attackerEvents[0], globalEvents[0], `${outcome} 进攻方战报与全局战报不一致`);
  assert.deepEqual(defenderEvents[0], globalEvents[0], `${outcome} 防守方战报与全局战报不一致`);
  assert.deepEqual(authoritySnapshot(map), beforeAuthority, `${outcome} 修改了人口、领土、外交或时间`);
}

const historyMap = createFixture();
historyMap.summary = {checksum: "before-battle", marker: "original"};
const historyBefore = snapshot(historyMap);
const history = new EditHistory();
let summaryRefreshes = 0;
history.execute(createResolveBattleCommand(battleRequest({outcome: "victory"}), {
  refreshSummary(map) {
    summaryRefreshes += 1;
    map.summary = battleSummary(map);
  }
}), {map: historyMap});
const historyAfter = snapshot(historyMap);
const afterChecksum = historyMap.summary.checksum;
assert.notEqual(afterChecksum, "before-battle");
assertBattleMirrors(historyMap);
history.undo({map: historyMap});
assert.equal(snapshot(historyMap), historyBefore, "undo 未完整恢复战斗前地图");
assertBattleMirrors(historyMap);
history.redo({map: historyMap});
assert.equal(snapshot(historyMap), historyAfter, "redo 未重放一致战斗结果");
assert.equal(historyMap.summary.checksum, afterChecksum);
assert.equal(summaryRefreshes, 2);

const seededA = createFixture();
const seededB = createFixture();
const seedRequest = battleRequest({seed: "deterministic-seed"});
const seededInspectionA = inspectBattle(seededA, seedRequest);
const seededInspectionB = inspectBattle(seededB, seedRequest);
assert.equal(seededInspectionA.allowed, true);
assert.equal(seededInspectionA.resolvedOutcome, seededInspectionB.resolvedOutcome);
assert.equal(seededInspectionA.resolutionSeed, seededInspectionB.resolutionSeed);
new EditHistory().execute(createResolveBattleCommand(seededInspectionA.normalizedInput), {map: seededA});
new EditHistory().execute(createResolveBattleCommand(seededInspectionB.normalizedInput), {map: seededB});
assert.deepEqual(seededDigest(seededA), seededDigest(seededB), "相同事实输入的 seed 结算不一致");

const sameCell = createFixture();
sameCell.pack.states[2].military[0].cell = 0;
sameCell.politics.states[2].military = sameCell.pack.states[2].military;
assert.equal(inspectBattle(sameCell, battleRequest({outcome: "draw"})).allowed, true);

const warzoneMap = createFixture();
warzoneMap.pack.states[2].military[0].cell = 3;
warzoneMap.politics.states[2].military = warzoneMap.pack.states[2].military;
warzoneMap.pack.zones.push({i: 9, type: "Warzone", attacker: 1, defender: 2, cells: [0, 3]});
assert.equal(inspectBattle(warzoneMap, battleRequest({outcome: "draw", warzoneId: 9})).allowed, true);

const codes = {
  invalidRequest: inspectBattle(createFixture(), null).code,
  invalidAttacker: inspectBattle(createFixture(), {...battleRequest({outcome: "draw"}), attacker: {}}).code,
  invalidDefender: inspectBattle(createFixture(), {...battleRequest({outcome: "draw"}), defender: {}}).code,
  sameRegiment: inspectBattle(createFixture(), {
    ...battleRequest({outcome: "draw"}),
    defender: {stateId: 1, regimentId: 0}
  }).code,
  attackerMissing: inspectBattle(createFixture(), {
    ...battleRequest({outcome: "draw"}),
    attacker: {stateId: 1, regimentId: 99}
  }).code,
  defenderMissing: inspectBattle(createFixture(), {
    ...battleRequest({outcome: "draw"}),
    defender: {stateId: 2, regimentId: 99}
  }).code,
  sameState: inspectBattle(sameStateFixture(), battleRequest({outcome: "draw", defender: {stateId: 1, regimentId: 1}})).code,
  notAtWar: inspectBattle(nonWarFixture(), battleRequest({outcome: "draw"})).code,
  attackerEmpty: inspectBattle(emptyFixture("attacker"), battleRequest({outcome: "draw"})).code,
  defenderEmpty: inspectBattle(emptyFixture("defender"), battleRequest({outcome: "draw"})).code,
  resultRequired: inspectBattle(createFixture(), battleRequest()).code,
  resultAmbiguous: inspectBattle(createFixture(), battleRequest({outcome: "draw", seed: "x"})).code,
  invalidOutcome: inspectBattle(createFixture(), battleRequest({outcome: "annihilation"})).code,
  invalidSeed: inspectBattle(createFixture(), battleRequest({seed: " "})).code,
  invalidType: inspectBattle(createFixture(), battleRequest({outcome: "draw", type: "ambush"})).code,
  terrainMismatch: inspectBattle(navalMismatchFixture(), battleRequest({outcome: "draw"})).code,
  cellMissing: inspectBattle(missingCellFixture(), battleRequest({outcome: "draw"})).code,
  warzoneMissing: inspectBattle(createFixture(), battleRequest({outcome: "draw", warzoneId: 999})).code,
  warzonePair: inspectBattle(warzonePairMismatchFixture(), battleRequest({outcome: "draw", warzoneId: 7})).code,
  outOfContact: inspectBattle(outOfContactFixture(), battleRequest({outcome: "draw"})).code
};
assert.deepEqual(codes, {
  invalidRequest: "invalid-battle-request",
  invalidAttacker: "invalid-attacker",
  invalidDefender: "invalid-defender",
  sameRegiment: "same-regiment",
  attackerMissing: "attacker-regiment-not-found",
  defenderMissing: "defender-regiment-not-found",
  sameState: "same-state",
  notAtWar: "states-not-at-war",
  attackerEmpty: "attacker-empty",
  defenderEmpty: "defender-empty",
  resultRequired: "battle-result-required",
  resultAmbiguous: "battle-result-ambiguous",
  invalidOutcome: "invalid-outcome",
  invalidSeed: "invalid-seed",
  invalidType: "invalid-battle-type",
  terrainMismatch: "battle-terrain-mismatch",
  cellMissing: "battle-cell-missing",
  warzoneMissing: "warzone-not-found",
  warzonePair: "warzone-pair-mismatch",
  outOfContact: "battle-out-of-contact"
});

for (const faultAt of ["after-result", "after-events", "after-sync", "after-summary", "after-validation"]) {
  const map = createFixture();
  map.summary = {checksum: `before-${faultAt}`};
  const before = snapshot(map);
  assert.throws(
    () => new EditHistory().execute(createResolveBattleCommand(battleRequest({outcome: "victory"}), {
      faultAt,
      refreshSummary(target) {
        target.summary = battleSummary(target);
      }
    }), {map}),
    new RegExp(faultAt)
  );
  assert.equal(snapshot(map), before, `${faultAt} 未完整回滚`);
  assertBattleMirrors(map);
}

const validationMap = createFixture();
const validationBefore = snapshot(validationMap);
assert.throws(
  () => new EditHistory().execute(createResolveBattleCommand(battleRequest({outcome: "draw"}), {
    refreshSummary(map) {
      map.pack.states[1].military[0].cell = 2;
    }
  }), {map: validationMap}),
  error => error?.code === "battle-validation-failed"
);
assert.equal(snapshot(validationMap), validationBefore, "最终一致性失败未完整回滚");

const oldMap = createFixture();
delete oldMap.military;
delete oldMap.pack.military.events;
delete oldMap.pack.military.metadata;
delete oldMap.summary;
const oldBefore = snapshot(oldMap);
const oldHistory = new EditHistory();
oldHistory.execute(createResolveBattleCommand(battleRequest({outcome: "regroup"}), {
  refreshSummary(map) {
    map.summary = battleSummary(map);
  }
}), {map: oldMap});
oldHistory.undo({map: oldMap});
assert.equal(snapshot(oldMap), oldBefore, "旧图 undo 未恢复缺失字段形态");
assert.equal(Object.hasOwn(oldMap, "military"), false);
assert.equal(Object.hasOwn(oldMap.pack.military, "events"), false);
assert.equal(Object.hasOwn(oldMap.pack.military, "metadata"), false);
assert.equal(Object.hasOwn(oldMap, "summary"), false);

console.log(JSON.stringify({
  ok: true,
  outcomes,
  seededOutcome: seededInspectionA.resolvedOutcome,
  resolutionSeed: seededInspectionA.resolutionSeed,
  summaryRefreshes,
  contact: {sameCell: true, adjacent: true, warzone: true},
  faults: ["after-result", "after-events", "after-sync", "after-summary", "after-validation"],
  oldMapUndo: snapshot(oldMap) === oldBefore,
  codes
}, null, 2));

function createFixture() {
  const states = [
    {id: 0, i: 0, name: "中立", diplomacy: []},
    state(1, "甲国", 2),
    state(2, "乙国", 3),
    state(3, "丙国", 4)
  ];
  setPair(states, 1, 2, "Enemy");
  const military = {
    campaigns: [{id: "war-1-2", attacker: 1, defender: 2}],
    fronts: [],
    events: [],
    metadata: {regiments: 2, troops: 180, navalRegiments: 0, events: 0, eventSequence: 0}
  };
  const zones = {
    zones: [],
    metadata: {zones: 0, types: {}, cells: 0, hidden: 0, invalidCells: 0}
  };
  const politicsStates = structuredClone(states);
  for (let id = 0; id < states.length; id++) {
    if (!states[id] || !politicsStates[id]) continue;
    politicsStates[id].military = states[id].military;
    politicsStates[id].militaryPolicy = states[id].militaryPolicy;
  }
  return {
    metadata: {seed: "battle-resolution", checksum: "unchanged"},
    options: {seed: "battle-resolution", year: 1234},
    pack: {
      states,
      military,
      zones: zones.zones,
      cells: {
        i: [0, 1, 2, 3, 4],
        c: [[1], [0, 2], [1, 3], [2, 4], [3]],
        p: [[0, 0], [10, 0], [20, 0], [30, 0], [40, 0]],
        state: [1, 2, 1, 2, 3],
        pop: [10, 20, 30, 40, 50]
      }
    },
    politics: {states: politicsStates},
    military,
    zones,
    population: {total: 150},
    time: {year: 1234}
  };
}

function state(id, name, center) {
  const diplomacy = new Array(4).fill("Neutral");
  diplomacy[0] = "x";
  diplomacy[id] = "x";
  const military = id <= 2 ? [regiment(id, id === 1 ? 0 : 1, id === 1 ? 100 : 80)] : [];
  return {
    id,
    i: id,
    name,
    fullName: name,
    center,
    removed: false,
    diplomacy,
    military,
    militaryPolicy: {generatedTroops: military.reduce((sum, item) => sum + item.a, 0)}
  };
}

function regiment(stateId, cell, troops) {
  return {
    id: `${stateId}:0`,
    i: 0,
    state: stateId,
    name: `${stateId}国军团`,
    a: troops,
    u: {infantry: troops},
    cell,
    x: cell * 10,
    y: 0,
    n: false,
    status: "marching",
    statusLabel: "行军中",
    order: {kind: "advance", targetCell: cell},
    events: []
  };
}

function setPair(states, leftId, rightId, relation) {
  states[leftId].diplomacy[rightId] = relation;
  states[rightId].diplomacy[leftId] = relation;
}

function battleRequest(overrides = {}) {
  return {
    attacker: {stateId: 1, regimentId: 0},
    defender: {stateId: 2, regimentId: 0},
    ...overrides
  };
}

function sameStateFixture() {
  const map = createFixture();
  map.pack.states[1].military.push({
    ...structuredClone(map.pack.states[1].military[0]),
    id: "1:1",
    i: 1,
    cell: 1,
    name: "甲国第二军团"
  });
  map.politics.states[1].military = map.pack.states[1].military;
  return map;
}

function nonWarFixture() {
  const map = createFixture();
  setPair(map.pack.states, 1, 2, "Neutral");
  setPair(map.politics.states, 1, 2, "Neutral");
  return map;
}

function emptyFixture(side) {
  const map = createFixture();
  const stateId = side === "attacker" ? 1 : 2;
  map.pack.states[stateId].military[0].a = 0;
  map.pack.states[stateId].military[0].u = {};
  return map;
}

function navalMismatchFixture() {
  const map = createFixture();
  map.pack.states[2].military[0].n = true;
  return map;
}

function missingCellFixture() {
  const map = createFixture();
  map.pack.states[2].military[0].cell = 99;
  return map;
}

function warzonePairMismatchFixture() {
  const map = createFixture();
  map.pack.zones.push({i: 7, type: "Warzone", attacker: 1, defender: 3, cells: [0, 1]});
  return map;
}

function outOfContactFixture() {
  const map = createFixture();
  map.pack.states[2].military[0].cell = 3;
  return map;
}

function authoritySnapshot(map) {
  return {
    population: structuredClone(map.population),
    cellPopulation: [...map.pack.cells.pop],
    cellStates: [...map.pack.cells.state],
    diplomacy: map.pack.states.map(state => state ? [...state.diplomacy] : null),
    year: map.time.year,
    optionYear: map.options.year
  };
}

function battleSummary(map) {
  const event = map.military?.events?.at(-1);
  return {
    checksum: `battle:${event?.id || "none"}:${event?.outcome || "none"}`,
    events: map.military?.events?.length || 0
  };
}

function seededDigest(map) {
  const event = map.military.events.at(-1);
  return {
    outcome: event.outcome,
    resolutionSeed: event.resolutionSeed,
    attackerTroops: map.pack.states[1].military[0].a,
    defenderTroops: map.pack.states[2].military[0].a,
    attackerStatus: map.pack.states[1].military[0].status,
    defenderStatus: map.pack.states[2].military[0].status,
    result: structuredClone(event.result)
  };
}

function assertBattleMirrors(map) {
  assert.equal(map.military, map.pack.military);
  assert.equal(map.pack.zones, map.zones.zones);
  for (let id = 1; id <= 2; id++) {
    assert.equal(map.pack.states[id].military, map.politics.states[id].military);
  }
}

function snapshot(value) {
  return JSON.stringify(value, (_key, item) => ArrayBuffer.isView(item) ? Array.from(item) : item);
}
