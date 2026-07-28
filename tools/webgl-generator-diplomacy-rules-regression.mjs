import assert from "node:assert/strict";

import {setDiplomacyRelation} from "../app/webgl-generator/src/generator/diplomacy.js";
import {
  createChangeOverlordCommand,
  createDeclareWarCommand,
  createMakePeaceCommand,
  inspectDeclareWar,
  inspectMakePeace,
  inspectOverlordChange
} from "../app/webgl-generator/src/runtime/diplomacy-edit-commands.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";

const warMap = createFixture();
warMap.summary = {checksum: "before-diplomacy-rule", marker: "original"};
const warBefore = snapshot(warMap);
const warBeforeChecksum = warMap.summary.checksum;
let warSummaryRefreshes = 0;
const warInspection = inspectDeclareWar(warMap, {attackerStateId: 1, defenderStateId: 2, reason: "边境争端"});
assert.equal(warInspection.allowed, true);
assert.equal(warInspection.requiresConfirm, true);
const warHistory = new EditHistory();
warHistory.execute(createDeclareWarCommand(warInspection.normalizedInput, {
  refreshSummary(map) {
    warSummaryRefreshes += 1;
    refreshTestSummary(map);
  }
}), {map: warMap});
assert.notEqual(warMap.summary.checksum, warBeforeChecksum, "外交事务执行后必须在命令内刷新摘要 checksum");
assert.equal(warMap.pack.states[1].diplomacy[2], "Enemy");
assert.equal(warMap.pack.states[2].diplomacy[1], "Enemy");
assert.equal(warMap.pack.states[1].campaigns.length, 1);
assert.equal(warMap.military.campaigns.length, 1);
assert.match(warMap.diplomacy.chronicle.at(-1)[1], /边境争端/);
assertMirrors(warMap);
const warAfter = snapshot(warMap);
const warAfterChecksum = warMap.summary.checksum;
warHistory.undo({map: warMap});
assert.equal(snapshot(warMap), warBefore);
assert.equal(warMap.summary.checksum, warBeforeChecksum, "撤销必须恢复执行前摘要 checksum");
assert.equal(warMap.pack.diplomacy, warMap.diplomacy, "共享外交根对象撤销后必须保持同一引用");
assert.equal(warMap.diplomacy.chronicle, warMap.pack.states[0].diplomacy, "外交纪事撤销后必须重新指向国家零号外交数组");
assert.equal(warMap.pack.military, warMap.military, "共享军事根对象撤销后必须保持同一引用");
assert.equal(warMap.pack.zones, warMap.zones.zones, "共享区域数组撤销后必须保持同一引用");
warHistory.redo({map: warMap});
assert.equal(snapshot(warMap), warAfter);
assert.equal(warMap.summary.checksum, warAfterChecksum, "重做必须重新计算出一致的摘要 checksum");
assert.equal(warSummaryRefreshes, 2, "摘要刷新回调应在执行与重做时各调用一次");
assert.equal(warMap.pack.diplomacy, warMap.diplomacy, "共享外交根对象重做后必须保持同一引用");
assert.equal(warMap.diplomacy.chronicle, warMap.pack.states[0].diplomacy, "外交纪事重做后必须指向国家零号外交数组");
assert.equal(warMap.pack.military, warMap.military, "共享军事根对象重做后必须保持同一引用");
assert.equal(warMap.pack.zones, warMap.zones.zones, "共享区域数组重做后必须保持同一引用");

const summarylessMap = createFixture();
const summarylessHistory = new EditHistory();
summarylessHistory.execute(createDeclareWarCommand({attackerStateId: 1, defenderStateId: 2}, {
  refreshSummary: refreshTestSummary
}), {map: summarylessMap});
assert.equal(Object.hasOwn(summarylessMap, "summary"), true);
summarylessHistory.undo({map: summarylessMap});
assert.equal(Object.hasOwn(summarylessMap, "summary"), false, "撤销不得为原本无摘要的旧图伪造 summary");

warMap.military.fronts.push({id: "front-1", attacker: 1, defender: 2});
warMap.pack.zones.push({i: 7, type: "Warzone", attacker: 1, defender: 2, cells: [0, 1]});
warMap.zones.zones = warMap.pack.zones;
const peaceInspection = inspectMakePeace(warMap, {
  leftStateId: 1,
  rightStateId: 2,
  relation: "Friendly",
  terms: {reparations: {fromStateId: 2, toStateId: 1, amount: 25, unit: "金衡"}, note: "边境复原"}
});
assert.equal(peaceInspection.allowed, true);
const peaceBefore = snapshot(warMap);
const peaceHistory = new EditHistory();
peaceHistory.execute(createMakePeaceCommand(peaceInspection.normalizedInput), {map: warMap});
assert.equal(warMap.pack.states[1].diplomacy[2], "Friendly");
assert.equal(warMap.pack.states[1].campaigns.length, 0);
assert.equal(warMap.military.campaigns.length, 0);
assert.equal(warMap.military.fronts.length, 0);
assert.equal(warMap.pack.zones.some(zone => zone.type === "Warzone"), false);
assert.match(warMap.diplomacy.chronicle.at(-1)[1], /economicSettlement/);
assertMirrors(warMap);
const peaceAfter = snapshot(warMap);
peaceHistory.undo({map: warMap});
assert.equal(snapshot(warMap), peaceBefore);
peaceHistory.redo({map: warMap});
assert.equal(snapshot(warMap), peaceAfter);

const overlordMap = createFixture();
const vassalize = inspectOverlordChange(overlordMap, {vassalStateId: 2, overlordStateId: 1});
assert.equal(vassalize.allowed, true);
const overlordHistory = new EditHistory();
overlordHistory.execute(createChangeOverlordCommand(vassalize.normalizedInput), {map: overlordMap});
assert.equal(overlordMap.pack.states[1].diplomacy[2], "Vassal");
assert.equal(overlordMap.pack.states[2].diplomacy[1], "Suzerain");
assert.match(overlordMap.diplomacy.chronicle.at(-1)[1], /甲国使乙国成为附庸/);
const transfer = inspectOverlordChange(overlordMap, {vassalStateId: 2, overlordStateId: 4, releaseRelation: "Friendly"});
assert.equal(transfer.allowed, true);
overlordHistory.execute(createChangeOverlordCommand(transfer.normalizedInput), {map: overlordMap});
assert.equal(overlordMap.pack.states[1].diplomacy[2], "Friendly");
assert.equal(overlordMap.pack.states[2].diplomacy[1], "Friendly");
assert.equal(overlordMap.pack.states[4].diplomacy[2], "Vassal");
assert.equal(overlordMap.pack.states[2].diplomacy[4], "Suzerain");
assertMirrors(overlordMap);
const transferAfter = snapshot(overlordMap);
overlordHistory.undo({map: overlordMap});
assert.equal(overlordMap.pack.states[1].diplomacy[2], "Vassal");
overlordHistory.redo({map: overlordMap});
assert.equal(snapshot(overlordMap), transferAfter);

const release = inspectOverlordChange(overlordMap, {vassalStateId: 2, overlordStateId: null});
assert.equal(release.allowed, true);
overlordHistory.execute(createChangeOverlordCommand(release.normalizedInput), {map: overlordMap});
assert.equal(overlordMap.pack.states[4].diplomacy[2], "Neutral");
assert.equal(overlordMap.pack.states[2].diplomacy[4], "Neutral");

const faultMap = createFixture();
faultMap.summary = {checksum: "before-fault", marker: "untouched"};
const faultBefore = snapshot(faultMap);
const faultHistory = new EditHistory();
let faultSummaryRefreshes = 0;
assert.throws(
  () => faultHistory.execute(createDeclareWarCommand({attackerStateId: 1, defenderStateId: 2}, {
    faultAt: "after-war-context",
    refreshSummary(map) {
      faultSummaryRefreshes += 1;
      refreshTestSummary(map);
    }
  }), {map: faultMap}),
  /故障注入/
);
assert.equal(snapshot(faultMap), faultBefore);
assert.equal(faultSummaryRefreshes, 0, "事务校验完成前故障不得刷新摘要");
assert.equal(faultHistory.getStats().undo, 0);
assertMirrors(faultMap);

const independentRootsMap = createFixture();
independentRootsMap.military = {
  campaigns: [],
  fronts: [],
  events: [{type: "Note", text: "map military"}],
  metadata: {campaigns: 0, fronts: 0, owner: "map"}
};
independentRootsMap.pack.military = {
  campaigns: [],
  fronts: [],
  events: [{type: "Note", text: "pack military"}],
  metadata: {campaigns: 0, fronts: 0, owner: "pack"}
};
independentRootsMap.zones = {
  zones: [{i: 21, type: "Note", name: "map note", cells: [0]}],
  metadata: {zones: 1, types: {Note: 1}, cells: 1, hidden: 0, invalidCells: 0}
};
independentRootsMap.pack.zones = [{i: 22, type: "Note", name: "pack note", cells: [1]}];
const independentRootsBefore = snapshot(independentRootsMap);
const independentRootsHistory = new EditHistory();
independentRootsHistory.execute(createDeclareWarCommand({attackerStateId: 1, defenderStateId: 2}), {map: independentRootsMap});
independentRootsHistory.undo({map: independentRootsMap});
assert.equal(snapshot(independentRootsMap), independentRootsBefore, "独立军事与区域根撤销后必须恢复各自值");
assert.notEqual(independentRootsMap.military, independentRootsMap.pack.military, "独立军事根撤销后不得合并");
assert.equal(independentRootsMap.military.metadata.owner, "map");
assert.equal(independentRootsMap.pack.military.metadata.owner, "pack");
assert.notEqual(independentRootsMap.zones.zones, independentRootsMap.pack.zones, "独立区域数组撤销后不得合并");
assert.equal(independentRootsMap.zones.zones[0].name, "map note");
assert.equal(independentRootsMap.pack.zones[0].name, "pack note");

const oldMap = createFixture();
delete oldMap.pack.states;
delete oldMap.pack.diplomacy;
delete oldMap.pack.military;
delete oldMap.pack.zones;
delete oldMap.diplomacy;
delete oldMap.military;
delete oldMap.zones;
const oldBefore = snapshot(oldMap);
const oldHistory = new EditHistory();
oldHistory.execute(createDeclareWarCommand({attackerStateId: 1, defenderStateId: 2}), {map: oldMap});
assert.equal(oldMap.politics.states[1].diplomacy[2], "Enemy");
assert.ok(oldMap.pack.states, "旧图执行后应补齐运行时 pack.states 镜像");
oldHistory.undo({map: oldMap});
assert.equal(snapshot(oldMap), oldBefore, "旧图撤销必须恢复缺失镜像形态");
assert.equal(Object.hasOwn(oldMap, "military"), false, "旧图撤销后不得伪造 map.military");
assert.equal(Object.hasOwn(oldMap.pack, "military"), false, "旧图撤销后不得伪造 pack.military");
assert.equal(Object.hasOwn(oldMap, "zones"), false, "旧图撤销后不得伪造 map.zones");
assert.equal(Object.hasOwn(oldMap.pack, "zones"), false, "旧图撤销后不得伪造 pack.zones");

const packOnlyMap = createFixture();
delete packOnlyMap.diplomacy;
const packOnlyBefore = snapshot(packOnlyMap);
const packOnlyHistory = new EditHistory();
packOnlyHistory.execute(createDeclareWarCommand({attackerStateId: 1, defenderStateId: 2}), {map: packOnlyMap});
packOnlyHistory.undo({map: packOnlyMap});
assert.equal(Object.hasOwn(packOnlyMap, "diplomacy"), false, "pack-only 旧图撤销后不得伪造 map.diplomacy");
assert.ok(packOnlyMap.pack.diplomacy, "pack-only 旧图撤销后必须保留 pack.diplomacy");
assert.equal(snapshot(packOnlyMap), packOnlyBefore, "pack-only 旧图撤销必须恢复原始根对象值");
assert.equal(packOnlyMap.pack.diplomacy.chronicle, packOnlyMap.pack.states[0].diplomacy, "pack-only 外交纪事必须恢复国家零号引用");

const splitRootsMap = createFixture();
splitRootsMap.diplomacy = {
  ...structuredClone(splitRootsMap.diplomacy),
  chronicle: splitRootsMap.pack.states[0].diplomacy
};
assert.notEqual(splitRootsMap.diplomacy, splitRootsMap.pack.diplomacy);
assert.equal(splitRootsMap.diplomacy.chronicle, splitRootsMap.pack.diplomacy.chronicle);
const splitRootsBefore = snapshot(splitRootsMap);
const splitRootsHistory = new EditHistory();
splitRootsHistory.execute(createDeclareWarCommand({attackerStateId: 1, defenderStateId: 2}), {map: splitRootsMap});
splitRootsHistory.undo({map: splitRootsMap});
assert.equal(snapshot(splitRootsMap), splitRootsBefore, "分离外交根对象撤销后必须恢复各自值");
assert.notEqual(splitRootsMap.diplomacy, splitRootsMap.pack.diplomacy, "分离外交根对象撤销后不得合并");
assert.equal(splitRootsMap.diplomacy.chronicle, splitRootsMap.pack.diplomacy.chronicle, "共享纪事引用撤销后必须保持共享");
assert.equal(splitRootsMap.diplomacy.chronicle, splitRootsMap.pack.states[0].diplomacy, "共享纪事引用必须恢复国家零号外交数组");

const directionMap = createFixture();
setDiplomacyRelation(directionMap.pack, 1, 2, "Suzerain", {reason: "方向验证"});
assert.match(directionMap.pack.states[0].diplomacy.at(-1)[1], /甲国成为乙国的附庸/);

const codes = {
  declareInvalidPair: inspectDeclareWar(createFixture(), {}).code,
  declareSame: inspectDeclareWar(createFixture(), {attackerStateId: 1, defenderStateId: 1}).code,
  attackerMissing: inspectDeclareWar(createFixture(), {attackerStateId: 9, defenderStateId: 2}).code,
  defenderMissing: inspectDeclareWar(createFixture(), {attackerStateId: 1, defenderStateId: 9}).code,
  warActive: inspectDeclareWar(enemyFixture(), {attackerStateId: 1, defenderStateId: 2}).code,
  vassalWar: inspectDeclareWar(vassalFixture(), {attackerStateId: 1, defenderStateId: 3}).code,
  peaceInvalidPair: inspectMakePeace(createFixture(), {}).code,
  peaceSame: inspectMakePeace(createFixture(), {leftStateId: 1, rightStateId: 1}).code,
  leftMissing: inspectMakePeace(createFixture(), {leftStateId: 9, rightStateId: 2}).code,
  rightMissing: inspectMakePeace(createFixture(), {leftStateId: 1, rightStateId: 9}).code,
  warMissing: inspectMakePeace(createFixture(), {leftStateId: 1, rightStateId: 2}).code,
  peaceRelation: inspectMakePeace(enemyFixture(), {leftStateId: 1, rightStateId: 2, relation: "Enemy"}).code,
  peaceTerms: inspectMakePeace(enemyFixture(), {leftStateId: 1, rightStateId: 2, terms: []}).code,
  peaceTermRejected: inspectMakePeace(enemyFixture(), {leftStateId: 1, rightStateId: 2, terms: {territory: {}}}).code,
  vassalMissing: inspectOverlordChange(createFixture(), {vassalStateId: 9, overlordStateId: 1}).code,
  overlordMissing: inspectOverlordChange(createFixture(), {vassalStateId: 2, overlordStateId: 9}).code,
  overlordSame: inspectOverlordChange(createFixture(), {vassalStateId: 2, overlordStateId: 2}).code,
  unchanged: inspectOverlordChange(vassalFixture(), {vassalStateId: 3, overlordStateId: 1}).code,
  releaseMissing: inspectOverlordChange(createFixture(), {vassalStateId: 2, overlordStateId: null}).code,
  cycle: inspectOverlordChange(vassalFixture(), {vassalStateId: 1, overlordStateId: 3}).code,
  warConflict: inspectOverlordChange(enemyFixture(), {vassalStateId: 2, overlordStateId: 1}).code,
  releaseRelation: inspectOverlordChange(vassalFixture(), {vassalStateId: 3, overlordStateId: null, releaseRelation: "Enemy"}).code
};
assert.deepEqual(codes, {
  declareInvalidPair: "invalid-state-pair",
  declareSame: "same-state",
  attackerMissing: "attacker-not-found",
  defenderMissing: "defender-not-found",
  warActive: "war-already-active",
  vassalWar: "direct-vassal-war-forbidden",
  peaceInvalidPair: "invalid-state-pair",
  peaceSame: "same-state",
  leftMissing: "left-not-found",
  rightMissing: "right-not-found",
  warMissing: "war-not-active",
  peaceRelation: "invalid-peace-relation",
  peaceTerms: "invalid-peace-terms",
  peaceTermRejected: "peace-term-rejected",
  vassalMissing: "vassal-not-found",
  overlordMissing: "overlord-not-found",
  overlordSame: "same-state",
  unchanged: "overlord-unchanged",
  releaseMissing: "overlord-missing",
  cycle: "overlord-cycle",
  warConflict: "overlord-war-conflict",
  releaseRelation: "invalid-release-relation"
});

console.log(JSON.stringify({
  ok: true,
  warCampaigns: warMap.military.campaigns.length,
  peaceRelation: warMap.pack.states[1].diplomacy[2],
  transferOverlord: 4,
  rollback: snapshot(faultMap) === faultBefore,
  summaryRefreshes: warSummaryRefreshes,
  independentRootsUndo: snapshot(independentRootsMap) === independentRootsBefore,
  oldMapUndo: snapshot(oldMap) === oldBefore,
  packOnlyUndo: snapshot(packOnlyMap) === packOnlyBefore,
  splitRootsUndo: snapshot(splitRootsMap) === splitRootsBefore,
  codes
}, null, 2));

function enemyFixture() {
  const map = createFixture();
  setPair(map, 1, 2, "Enemy", "Enemy");
  const campaign = {name: "甲乙之战", attacker: 1, defender: 2, start: 1000, cause: "border"};
  map.pack.states[1].campaigns = [{...campaign}];
  map.pack.states[2].campaigns = [{...campaign}];
  map.politics.states[1].campaigns = [{...campaign}];
  map.politics.states[2].campaigns = [{...campaign}];
  map.military.campaigns = [{...campaign}];
  map.military.fronts = [{id: "front", attacker: 1, defender: 2}];
  map.pack.zones.push({i: 7, type: "Warzone", attacker: 1, defender: 2, cells: [0, 1]});
  map.zones.zones = map.pack.zones;
  return map;
}

function vassalFixture() {
  const map = createFixture();
  setPair(map, 1, 3, "Vassal", "Suzerain");
  return map;
}

function setPair(map, left, right, leftRelation, rightRelation) {
  for (const states of [map.pack.states, map.politics.states]) {
    states[left].diplomacy[right] = leftRelation;
    states[right].diplomacy[left] = rightRelation;
  }
}

function createFixture() {
  const packStates = [
    {id: 0, i: 0, name: "中立", diplomacy: []},
    state(1, "甲国"),
    state(2, "乙国"),
    state(3, "丙国"),
    state(4, "丁国")
  ];
  const politicsStates = structuredClone(packStates);
  const diplomacy = {relations: {}, chronicle: packStates[0].diplomacy, metadata: {pairs: 6}};
  const military = {campaigns: [], fronts: [], events: [], metadata: {campaigns: 0, fronts: 0}};
  const zones = {zones: [], metadata: {zones: 0, types: {}, cells: 0, hidden: 0, invalidCells: 0}};
  return {
    metadata: {seed: "diplomacy-rules"},
    options: {seed: "diplomacy-rules"},
    pack: {
      states: packStates,
      diplomacy,
      military,
      zones: zones.zones,
      cells: {i: [0, 1, 2, 3], h: [30, 30, 30, 30], state: [1, 2, 3, 4], c: [[1], [0, 2], [1, 3], [2]]}
    },
    politics: {states: politicsStates},
    diplomacy,
    military,
    zones
  };
}

function state(id, name) {
  const diplomacy = new Array(5).fill("Neutral");
  diplomacy[0] = "x";
  diplomacy[id] = "x";
  return {id, i: id, name, fullName: name, removed: false, diplomacy, diplomacySummary: {}, campaigns: [], military: []};
}

function assertMirrors(map) {
  for (let id = 1; id < map.pack.states.length; id++) {
    assert.deepEqual(map.pack.states[id].diplomacy, map.politics.states[id].diplomacy, `国家 #${id} 外交镜像不一致`);
    assert.deepEqual(map.pack.states[id].campaigns, map.politics.states[id].campaigns, `国家 #${id} campaign 镜像不一致`);
  }
  assert.equal(map.pack.diplomacy, map.diplomacy);
  assert.equal(map.pack.military, map.military);
  assert.equal(map.pack.zones, map.zones.zones);
}

function snapshot(value) {
  return JSON.stringify(value, (_key, item) => ArrayBuffer.isView(item) ? Array.from(item) : item);
}

function refreshTestSummary(map) {
  const relation = map.pack.states[1].diplomacy[2];
  const campaigns = map.military?.campaigns?.length || 0;
  const chronicle = map.diplomacy?.chronicle?.length || 0;
  map.summary = {
    checksum: `diplomacy:${relation}:${campaigns}:${chronicle}`,
    marker: "refreshed"
  };
}
