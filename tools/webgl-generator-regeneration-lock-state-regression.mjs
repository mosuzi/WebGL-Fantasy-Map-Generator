#!/usr/bin/env node
import assert from "node:assert/strict";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {regeneratePackStatesAndProvinces} from "../app/webgl-generator/src/generator/politics.js";
import {OBJECT_KIND} from "../app/webgl-generator/src/runtime/object-kinds.js";
import {captureLockedRegenerationObjects} from "../app/webgl-generator/src/runtime/regeneration-lock-protection.js";

const options = {
  seed: "regeneration-lock-state",
  cellsTarget: 5000,
  heightmapTemplate: "continents",
  provincesRatio: 45
};

const report = {ok: true, locked: {}, provinceParentSlot: {}, bypassedGenerationConstraints: [], conflictCodes: []};

testLockedSparseStateAndProvince();
testLockedProvinceParentSlot();
testConflicts();

console.log(JSON.stringify(report, null, 2));

function testLockedSparseStateAndProvince() {
  const map = generatePlaceholderMap(options);
  const source = selectStateCandidate(map);
  assert.ok(source, "真实生成图缺少含省份的可锁国家");
  const sourceProvince = map.pack.provinces.find(province => province?.i && !province.removed && province.state === source.i && province.burg);
  assert.ok(sourceProvince, "真实生成图缺少可随国家锁定的省份");

  const oldStateId = source.i;
  const sparseId = Math.max(map.pack.states.length + 37, 101);
  const lockedState = structuredClone(source);
  lockedState.id = sparseId;
  lockedState.i = sparseId;
  map.pack.states[oldStateId] = null;
  map.pack.states[sparseId] = lockedState;
  for (const cell of map.pack.cells.i) {
    if (map.pack.cells.state[cell] === oldStateId) map.pack.cells.state[cell] = sparseId;
  }
  for (let cell = 0; cell < map.grid.cells.state.length; cell++) {
    if (map.grid.cells.state[cell] === oldStateId) map.grid.cells.state[cell] = sparseId;
  }
  for (const burg of map.pack.burgs || []) {
    if (burg?.state === oldStateId) burg.state = sparseId;
  }
  for (const province of map.pack.provinces || []) {
    if (province?.state === oldStateId) province.state = sparseId;
  }

  const lockedProvince = structuredClone(map.pack.provinces[sourceProvince.i]);
  const stateSnapshot = structuredClone(lockedState);
  const provinceSnapshot = structuredClone(lockedProvince);
  const capitalSnapshot = structuredClone(map.pack.burgs[lockedState.capital]);
  const packCellsBefore = ownedCells(map.pack.cells.state, sparseId);
  const gridCellsBefore = ownedCells(map.grid.cells.state, sparseId);
  const provinceCellsBefore = ownedCells(map.pack.cells.province, lockedProvince.i);
  const supportingProvinceGridCellsBefore = new Map((stateSnapshot.provinces || []).map(id => [id, ownedCells(map.grid.cells.province, id)]));
  const unlockedBefore = snapshotUnlockedStates(map.pack.states, sparseId);

  const result = regeneratePackStatesAndProvinces(
    map.grid,
    map.society,
    {
      ...map.options,
      lockedStates: [stateSnapshot],
      lockedProvinces: [provinceSnapshot]
    },
    map.pack,
    map.settlements,
    {salt: 83}
  );

  assert.ok(result?.states?.[sparseId], "稀疏 ID 锁国在重算后丢失");
  assert.deepEqual(result.states[sparseId], stateSnapshot, "锁国对象快照被改写");
  assert.deepEqual(map.pack.burgs[lockedState.capital], capitalSnapshot, "锁国首都 burg 被改写");
  assert.deepEqual(ownedCells(map.pack.cells.state, sparseId), packCellsBefore, "锁国 pack cell 领土被改写");
  assert.deepEqual(ownedCells(map.grid.cells.state, sparseId), gridCellsBefore, "锁国 grid cell 镜像被改写");
  assert.notEqual(snapshotUnlockedStates(result.states, sparseId), unlockedBefore, "未锁国家没有随 salt 重算");
  assert.deepEqual(result.provinces[lockedProvince.i], provinceSnapshot, "同时锁定的省份对象被改写");
  assert.deepEqual(ownedCells(map.pack.cells.province, lockedProvince.i), provinceCellsBefore, "同时锁定的省份领土被改写");
  assert.equal(result.states[sparseId].capital, capitalSnapshot.i, "锁国首都引用被改写");
  assert.equal(result.states[sparseId].center, capitalSnapshot.cell, "锁国中心被改写");
  for (const provinceId of stateSnapshot.provinces || []) {
    assert.ok(result.provinces[provinceId]?.i, `锁国引用的省份 #${provinceId} 在重算后丢失`);
    assert.equal(result.provinces[provinceId].state, sparseId, `锁国引用的省份 #${provinceId} 被复用给其它国家`);
    assert.deepEqual(
      ownedCells(map.grid.cells.province, provinceId),
      supportingProvinceGridCellsBefore.get(provinceId),
      `锁国引用的省份 #${provinceId} grid ownership 被改写`
    );
  }

  report.locked = {
    stateId: sparseId,
    capitalBurgId: capitalSnapshot.i,
    provinceId: lockedProvince.i,
    packCells: packCellsBefore.length,
    gridCells: gridCellsBefore.length,
    generatedStates: result.states.filter(state => state?.i).length,
    preservedProvinceSlots: stateSnapshot.provinces?.length || 0
  };
}

function testLockedProvinceParentSlot() {
  const map = generatePlaceholderMap({...options, seed: "regeneration-lock-state-parent-slot"});
  const state = selectStateCandidate(map);
  const province = map.pack.provinces.find(item => item?.i && !item.removed && item.state === state.i && item.burg);
  assert.ok(province, "父国槽测试缺少锁定省份");
  const snapshot = structuredClone(province);
  const result = regeneratePackStatesAndProvinces(
    map.grid,
    map.society,
    {...map.options, lockedProvinces: [snapshot]},
    map.pack,
    map.settlements,
    {salt: 91}
  );
  assert.ok(result.states[state.i]?.i, "仅锁省时父国 ID 槽在国家重算中丢失");
  assert.deepEqual(result.provinces[province.i], snapshot, "仅锁省时省份快照被改写");
  assert.equal(result.provinces[province.i].state, state.i, "仅锁省时父国引用被改写");
  report.provinceParentSlot = {provinceId: province.i, stateId: state.i};
}

function testConflicts() {
  const waterMap = generatePlaceholderMap({...options, seed: "regeneration-lock-state-water"});
  const waterState = selectStateCandidate(waterMap);
  const waterCell = waterMap.pack.cells.i.find(cell => waterMap.pack.cells.h[cell] < 20);
  assert.ok(Number.isInteger(waterCell), "冲突样本缺少水域 cell");
  waterMap.politics.states[waterState.i].center = waterCell;
  waterMap.regenerationLocks = {version: 1, entries: [{kind: OBJECT_KIND.STATE, id: waterState.i}]};
  const waterSnapshot = captureLockedRegenerationObjects(waterMap, OBJECT_KIND.STATE).snapshots[0];
  const waterResult = regeneratePackStatesAndProvinces(
    waterMap.grid,
    waterMap.society,
    {...waterMap.options, lockedStates: [waterSnapshot]},
    waterMap.pack,
    waterMap.settlements,
    {salt: 9}
  );
  assert.deepEqual(waterResult.states[waterState.i], waterSnapshot, "水域中心锁国没有原样直通");
  report.bypassedGenerationConstraints.push("water-center");

  const duplicateMap = generatePlaceholderMap({...options, seed: "regeneration-lock-state-duplicate"});
  const duplicateState = selectStateCandidate(duplicateMap);
  assertConflict(duplicateMap, {
    lockedStates: [structuredClone(duplicateState), structuredClone(duplicateState)]
  }, "invalid-id");

  const capitalMap = generatePlaceholderMap({...options, seed: "regeneration-lock-state-capital"});
  const capitalState = selectStateCandidate(capitalMap);
  assertConflict(capitalMap, {
    lockedStates: [{...structuredClone(capitalState), capital: 999999}]
  }, "invalid-capital");

  const parentMap = generatePlaceholderMap({...options, seed: "regeneration-lock-state-parent"});
  const parentState = selectStateCandidate(parentMap);
  const province = parentMap.pack.provinces.find(item => item?.i && !item.removed && item.state === parentState.i);
  assert.ok(province, "冲突样本缺少省份");
  assertConflict(parentMap, {
    lockedProvinces: [{...structuredClone(province), state: 999999}]
  }, "invalid-parent-state");
}

function assertConflict(map, lockOptions, reason) {
  assert.throws(
    () => regeneratePackStatesAndProvinces(
      map.grid,
      map.society,
      {...map.options, ...lockOptions},
      map.pack,
      map.settlements,
      {salt: 9}
    ),
    error => {
      assert.equal(error?.code, "regeneration_lock_conflict");
      assert.equal(error?.details?.reason, reason);
      report.conflictCodes.push(reason);
      return true;
    }
  );
}

function selectStateCandidate(map) {
  return (map.pack.states || []).find(state => {
    if (!state?.i || state.removed || !state.capital) return false;
    const capital = map.pack.burgs?.[state.capital];
    if (!capital || capital.removed || capital.cell !== state.center) return false;
    return (map.pack.provinces || []).some(province => province?.i && !province.removed && province.state === state.i && province.burg)
      && ownedCells(map.pack.cells.state, state.i).length > 3
      && ownedCells(map.grid.cells.state, state.i).length > 0;
  });
}

function ownedCells(values, id) {
  const cells = [];
  for (let cell = 0; cell < (values?.length || 0); cell++) {
    if (Number(values[cell]) === id) cells.push(cell);
  }
  return cells;
}

function snapshotUnlockedStates(states, lockedId) {
  return JSON.stringify((states || [])
    .filter(state => state?.i && state.i !== lockedId)
    .map(state => [state.i, state.capital, state.center, state.name]));
}
