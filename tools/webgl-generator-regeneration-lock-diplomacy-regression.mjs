#!/usr/bin/env node
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {captureDiplomacyRelationSnapshot, diplomacyPairKey} from "../app/webgl-generator/src/generator/diplomacy-regeneration-locks.js";
import {createRegenerateDiplomacyCommand, createSetDiplomacyRelationCommand} from "../app/webgl-generator/src/runtime/diplomacy-edit-commands.js";

const base = generatePlaceholderMap({seed: "regeneration-lock-diplomacy", cellsTarget: 5000, heightmapTemplate: "continents"});
const states = activeStates(base);
assert(states.length >= 3, "固定图不足三个有效国家");
const left = states[0];
const right = states.at(-1);
const third = states.find(state => state.i !== left.i && state.i !== right.i);

createSetDiplomacyRelationCommand(left.i, right.i, "Enemy", {reason: "锁定战争样本"}).apply({map: base});
const pairKey = diplomacyPairKey(left.i, right.i);
base.regenerationLocks.entries.push({kind: "diplomacy-relation", id: `${right.i}:${left.i}`});
const lockedBefore = captureDiplomacyRelationSnapshot(base.pack, left.i, right.i);
const unlockedBefore = pairMatrix(base.pack.states, pairKey);
const partial = createRegenerateDiplomacyCommand({salt: 97});
partial.apply({map: base});
assertDeepEqual(captureDiplomacyRelationSnapshot(base.pack, left.i, right.i), lockedBefore, "部分锁定改变了关系、纪事、战役或战争派生");
assert(anyPairChanged(unlockedBefore, pairMatrix(base.pack.states, pairKey)), "部分锁定时其它国家对没有变化");
assertPoliticsMirror(base, left.i, right.i);

const allLockedMap = generatePlaceholderMap({seed: "regeneration-lock-diplomacy-all", cellsTarget: 3000, heightmapTemplate: "continents"});
const allStates = activeStates(allLockedMap);
for (let first = 0; first < allStates.length; first++) {
  for (let second = first + 1; second < allStates.length; second++) {
    allLockedMap.regenerationLocks.entries.push({
      kind: "diplomacy-relation",
      id: `${allStates[second].i}:${allStates[first].i}`
    });
  }
}
const allBefore = fullSnapshot(allLockedMap);
const allCommand = createRegenerateDiplomacyCommand({salt: 211});
assert(allCommand.isNoop({map: allLockedMap}), "全部有效国家对锁定时命令未报告 no-op");
allCommand.apply({map: allLockedMap});
assertDeepEqual(fullSnapshot(allLockedMap), allBefore, "全部有效国家对锁定时地图仍被修改");
assert(allCommand.getResult()?.executed === false, "全锁 no-op 结果不正确");

const missingMap = structuredClone(base);
missingMap.regenerationLocks.entries = [{kind: "diplomacy-relation", id: `${left.i}:99999`}];
assertConflict(() => createRegenerateDiplomacyCommand({salt: 1}).apply({map: missingMap}), "missing-state");

const inverseMap = structuredClone(base);
inverseMap.pack.states[left.i].diplomacy[right.i] = "Vassal";
inverseMap.pack.states[right.i].diplomacy[left.i] = "Vassal";
mirrorPair(inverseMap, left.i, right.i);
assertConflict(() => createRegenerateDiplomacyCommand({salt: 2}).apply({map: inverseMap}), "non-reciprocal");

const derivedMap = structuredClone(base);
const derivedPair = diplomacyPairKey(left.i, third.i);
derivedMap.pack.states[left.i].diplomacy[third.i] = "Neutral";
derivedMap.pack.states[third.i].diplomacy[left.i] = "Neutral";
const invalidCampaign = {name: "无效战争", attacker: left.i, defender: third.i, start: 1};
derivedMap.pack.states[left.i].campaigns.push(structuredClone(invalidCampaign));
derivedMap.pack.states[third.i].campaigns.push(structuredClone(invalidCampaign));
mirrorPair(derivedMap, left.i, third.i);
derivedMap.regenerationLocks.entries = [{kind: "diplomacy-relation", id: derivedPair}];
assertConflict(() => createRegenerateDiplomacyCommand({salt: 3}).apply({map: derivedMap}), "war-derived-conflict");

const faultMap = structuredClone(base);
const faultBefore = fullSnapshot(faultMap);
assertThrows(
  () => createRegenerateDiplomacyCommand({salt: 301, faultAt: "after-war-derived"}).apply({map: faultMap}),
  "after-war-derived",
  "外交故障注入未抛错"
);
assertDeepEqual(fullSnapshot(faultMap), faultBefore, "外交命令故障没有完整回滚");

console.log(JSON.stringify({
  ok: true,
  states: states.length,
  lockedPair: pairKey,
  compositeInput: `${right.i}:${left.i}`,
  relation: [lockedBefore.leftRelation, lockedBefore.rightRelation],
  chronicle: lockedBefore.chronicleEntries.length,
  campaigns: lockedBefore.campaigns.length,
  otherPairsChanged: true,
  allPairsNoop: allStates.length * (allStates.length - 1) / 2,
  conflicts: ["missing-state", "non-reciprocal", "war-derived-conflict"],
  rollback: "after-war-derived"
}, null, 2));

function activeStates(map) {
  return (map.pack.states || []).filter(state => state?.i && !state.removed);
}

function pairMatrix(states, excluded) {
  const values = {};
  const active = states.filter(state => state?.i && !state.removed);
  for (let left = 0; left < active.length; left++) {
    for (let right = left + 1; right < active.length; right++) {
      const key = diplomacyPairKey(active[left].i, active[right].i);
      if (key === excluded) continue;
      values[key] = [active[left].diplomacy?.[active[right].i], active[right].diplomacy?.[active[left].i]];
    }
  }
  return values;
}

function anyPairChanged(before, after) {
  return Object.keys(before).some(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

function mirrorPair(map, leftId, rightId) {
  if (!Array.isArray(map.politics?.states) || map.politics.states === map.pack.states) return;
  for (const id of [leftId, rightId]) {
    map.politics.states[id].diplomacy = [...map.pack.states[id].diplomacy];
    map.politics.states[id].campaigns = structuredClone(map.pack.states[id].campaigns || []);
  }
}

function assertPoliticsMirror(map, leftId, rightId) {
  if (!Array.isArray(map.politics?.states) || map.politics.states === map.pack.states) return;
  assert(map.politics.states[leftId].diplomacy[rightId] === map.pack.states[leftId].diplomacy[rightId], "politics 左向关系未同步");
  assert(map.politics.states[rightId].diplomacy[leftId] === map.pack.states[rightId].diplomacy[leftId], "politics 右向关系未同步");
}

function fullSnapshot(map) {
  return structuredClone({
    diplomacy: map.diplomacy,
    packDiplomacy: map.pack.diplomacy,
    packStates: map.pack.states,
    politicsStates: map.politics?.states,
    military: map.military,
    packMilitary: map.pack.military,
    zones: map.zones,
    packZones: map.pack.zones,
    salt: map.options?.diplomacyRegenerationSalt
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
