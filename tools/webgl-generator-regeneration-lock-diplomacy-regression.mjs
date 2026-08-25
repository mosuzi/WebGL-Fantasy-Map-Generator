#!/usr/bin/env node
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {normalizeDiplomacyHierarchy} from "../app/webgl-generator/src/generator/diplomacy.js";
import {captureDiplomacyRelationSnapshot, diplomacyPairKey} from "../app/webgl-generator/src/generator/diplomacy-regeneration-locks.js";
import {createRegenerateDiplomacyCommand, createSetDiplomacyRelationCommand} from "../app/webgl-generator/src/runtime/diplomacy-edit-commands.js";

const doubleOverlordA = hierarchyFixture();
setHierarchyPair(doubleOverlordA, 1, 3);
setHierarchyPair(doubleOverlordA, 1, 2);
const doubleResult = normalizeDiplomacyHierarchy(doubleOverlordA);
assertHierarchyPair(doubleOverlordA, 1, 2, true);
assertHierarchyPair(doubleOverlordA, 1, 3, false);
assertDeepEqual(doubleResult.removed, [{vassalId: 1, overlordId: 3, reason: "multiple-overlords"}], "双宗主未按稳定 ID 顺序裁剪");

const doubleOverlordB = hierarchyFixture();
setHierarchyPair(doubleOverlordB, 1, 2);
setHierarchyPair(doubleOverlordB, 1, 3);
normalizeDiplomacyHierarchy(doubleOverlordB);
assertDeepEqual(hierarchyMatrix(doubleOverlordB), hierarchyMatrix(doubleOverlordA), "宗藩规范化结果受写入顺序影响");

const cycleStates = hierarchyFixture();
setHierarchyPair(cycleStates, 3, 1);
setHierarchyPair(cycleStates, 2, 3);
setHierarchyPair(cycleStates, 1, 2);
const cycleResult = normalizeDiplomacyHierarchy(cycleStates);
assertHierarchyPair(cycleStates, 1, 2, true);
assertHierarchyPair(cycleStates, 2, 3, true);
assertHierarchyPair(cycleStates, 3, 1, false);
assertDeepEqual(cycleResult.removed, [{vassalId: 3, overlordId: 1, reason: "cycle"}], "三节点环未按稳定顺序断开末边");

const normalHierarchy = hierarchyFixture();
setHierarchyPair(normalHierarchy, 2, 1);
const normalBefore = hierarchyMatrix(normalHierarchy);
const normalResult = normalizeDiplomacyHierarchy(normalHierarchy);
assertDeepEqual(hierarchyMatrix(normalHierarchy), normalBefore, "合法宗藩图被意外改写");
assert(normalResult.removed.length === 0, "合法宗藩图报告了错误裁剪");

const base = generatePlaceholderMap({seed: "regeneration-lock-diplomacy", cellsTarget: 5000, heightmapTemplate: "continents"});
const states = activeStates(base);
assert(states.length >= 3, "固定图不足三个有效国家");
assertValidHierarchy(base.pack.states);
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
const inverseBefore = captureDiplomacyRelationSnapshot(inverseMap.pack, left.i, right.i);
createRegenerateDiplomacyCommand({salt: 2}).apply({map: inverseMap});
assertDeepEqual(captureDiplomacyRelationSnapshot(inverseMap.pack, left.i, right.i), inverseBefore, "非互逆锁定外交没有原样直通");

const derivedMap = structuredClone(base);
const derivedPair = diplomacyPairKey(left.i, third.i);
derivedMap.pack.states[left.i].diplomacy[third.i] = "Neutral";
derivedMap.pack.states[third.i].diplomacy[left.i] = "Neutral";
const invalidCampaign = {name: "无效战争", attacker: left.i, defender: third.i, start: 1};
derivedMap.pack.states[left.i].campaigns.push(structuredClone(invalidCampaign));
derivedMap.pack.states[third.i].campaigns.push(structuredClone(invalidCampaign));
mirrorPair(derivedMap, left.i, third.i);
derivedMap.regenerationLocks.entries = [{kind: "diplomacy-relation", id: derivedPair}];
const derivedBefore = captureDiplomacyRelationSnapshot(derivedMap.pack, left.i, third.i);
const derivedUnlockedBefore = pairMatrix(derivedMap.pack.states, derivedPair);
createRegenerateDiplomacyCommand({salt: 3}).apply({map: derivedMap});
assertDeepEqual(captureDiplomacyRelationSnapshot(derivedMap.pack, left.i, third.i), derivedBefore, "锁定外交的既有战争派生没有原样保留");
assert(anyPairChanged(derivedUnlockedBefore, pairMatrix(derivedMap.pack.states, derivedPair)), "既有战争派生锁定时其它国家对没有重生成");

const hierarchyLockMap = generatePlaceholderMap({seed: "regeneration-lock-diplomacy-hierarchy", cellsTarget: 3000, heightmapTemplate: "continents"});
const hierarchyLockStates = activeStates(hierarchyLockMap).slice(0, 3);
assert(hierarchyLockStates.length === 3, "宗藩锁冲突夹具不足三个国家");
const [lockedVassal, firstOverlord, secondOverlord] = hierarchyLockStates;
createSetDiplomacyRelationCommand(firstOverlord.i, lockedVassal.i, "Vassal", {reason: "首个锁定宗主"}).apply({map: hierarchyLockMap});
createSetDiplomacyRelationCommand(secondOverlord.i, lockedVassal.i, "Vassal", {reason: "第二个锁定宗主"}).apply({map: hierarchyLockMap});
for (const overlord of [firstOverlord, secondOverlord]) {
  hierarchyLockMap.regenerationLocks.entries.push({
    kind: "diplomacy-relation",
    id: diplomacyPairKey(lockedVassal.i, overlord.i)
  });
}
const hierarchyLockedBefore = [firstOverlord, secondOverlord].map(overlord =>
  captureDiplomacyRelationSnapshot(hierarchyLockMap.pack, lockedVassal.i, overlord.i)
);
createRegenerateDiplomacyCommand({salt: 4}).apply({map: hierarchyLockMap});
for (const snapshot of hierarchyLockedBefore) {
  assertDeepEqual(
    captureDiplomacyRelationSnapshot(hierarchyLockMap.pack, snapshot.leftId, snapshot.rightId),
    snapshot,
    `多宗主锁定外交 ${snapshot.id} 没有原样直通`
  );
}

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
  hierarchyNormalization: {
    doubleOverlordKept: [1, 2],
    cycleRemoved: [3, 1],
    deterministic: true,
    validGeneration: true
  },
  bypassedGenerationConstraints: ["non-reciprocal", "multiple-overlords"],
  conflicts: ["missing-state"],
  preservedReadableWarDerived: derivedPair,
  rollback: "after-war-derived"
}, null, 2));

function hierarchyFixture() {
  return Array.from({length: 5}, (_, id) => ({
    id,
    i: id,
    name: id ? `国家 ${id}` : "中立",
    removed: false,
    diplomacy: id ? Array.from({length: 5}, (_, targetId) => targetId === id ? "x" : "Neutral") : []
  }));
}

function setHierarchyPair(states, vassalId, overlordId) {
  states[vassalId].diplomacy[overlordId] = "Suzerain";
  states[overlordId].diplomacy[vassalId] = "Vassal";
}

function assertHierarchyPair(states, vassalId, overlordId, retained) {
  const expectedVassal = retained ? "Suzerain" : "Neutral";
  const expectedOverlord = retained ? "Vassal" : "Neutral";
  assert(states[vassalId].diplomacy[overlordId] === expectedVassal, `国家 #${vassalId} 对 #${overlordId} 的宗藩方向错误`);
  assert(states[overlordId].diplomacy[vassalId] === expectedOverlord, `国家 #${overlordId} 对 #${vassalId} 的宗藩逆向错误`);
}

function hierarchyMatrix(states) {
  return states.map(state => state ? [...state.diplomacy] : null);
}

function assertValidHierarchy(states) {
  const active = states.filter(state => state?.i && !state.removed);
  const overlordByVassal = new Map();
  for (const vassal of active) {
    const overlords = active.filter(overlord =>
      vassal.diplomacy?.[overlord.i] === "Suzerain"
      && overlord.diplomacy?.[vassal.i] === "Vassal"
    );
    assert(overlords.length <= 1, `国家 #${vassal.i} 仍有多个直接宗主`);
    if (overlords[0]) overlordByVassal.set(vassal.i, overlords[0].i);
  }
  for (const vassal of active) {
    const visited = new Set([vassal.i]);
    let current = overlordByVassal.get(vassal.i);
    while (current) {
      assert(!visited.has(current), `国家 #${vassal.i} 的宗藩链仍有环`);
      visited.add(current);
      current = overlordByVassal.get(current);
    }
  }
}

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
