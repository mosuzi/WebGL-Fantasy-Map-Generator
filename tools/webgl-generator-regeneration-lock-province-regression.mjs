#!/usr/bin/env node
import assert from "node:assert/strict";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {regeneratePackProvincesWithinStates} from "../app/webgl-generator/src/generator/politics.js";

const options = {
  seed: "regeneration-lock-province",
  cellsTarget: 5000,
  heightmapTemplate: "continents",
  provincesRatio: 45
};

const report = {
  ok: true,
  locked: {},
  conflictCodes: []
};

testLockedSparseProvince();
testConflicts();

console.log(JSON.stringify(report, null, 2));

function testLockedSparseProvince() {
  const map = generatePlaceholderMap(options);
  const source = selectLockCandidate(map);
  assert.ok(source, "真实生成图缺少可锁定省份");

  const sparseId = Math.max(map.pack.provinces.length + 31, 97);
  const locked = structuredClone(source);
  locked.id = sparseId;
  locked.i = sparseId;
  map.pack.provinces[source.i] = null;
  map.pack.provinces[sparseId] = locked;
  const state = map.pack.states[locked.state];
  state.provinces = state.provinces.map(id => id === source.i ? sparseId : id);
  for (const cell of map.pack.cells.i) {
    if (map.pack.cells.province[cell] === source.i) map.pack.cells.province[cell] = sparseId;
  }
  for (let cell = 0; cell < map.grid.cells.province.length; cell++) {
    if (map.grid.cells.province[cell] === source.i) map.grid.cells.province[cell] = sparseId;
  }
  for (const burg of map.pack.burgs || []) {
    if (burg?.province === source.i) burg.province = sparseId;
  }

  const snapshot = structuredClone(locked);
  const packCellsBefore = ownedCells(map.pack.cells.province, sparseId);
  const gridCellsBefore = ownedCells(map.grid.cells.province, sparseId);
  const unlockedBefore = snapshotUnlocked(map.pack.provinces, sparseId);
  const result = regeneratePackProvincesWithinStates(
    map.grid,
    map.society,
    {...map.options, lockedProvinces: [snapshot]},
    map.pack,
    {salt: 73}
  );

  assert.ok(result?.provinces?.[sparseId], "稀疏 ID 锁省在重算后丢失");
  assert.deepEqual(result.provinces[sparseId], snapshot, "锁省对象快照被改写");
  assert.deepEqual(ownedCells(map.pack.cells.province, sparseId), packCellsBefore, "锁省 pack cell 领土被改写");
  assert.deepEqual(ownedCells(map.grid.cells.province, sparseId), gridCellsBefore, "锁省 grid cell 镜像被改写");
  assert.ok(result.provinces.some((province, id) => province?.i && id !== sparseId), "锁省之外没有生成省份");
  assert.notEqual(snapshotUnlocked(result.provinces, sparseId), unlockedBefore, "未锁省份没有随 salt 重算");
  assert.equal(result.provinces[sparseId].burg, snapshot.burg, "锁省省会 burg 被改写");
  assert.equal(result.provinces[sparseId].center, snapshot.center, "锁省中心被改写");

  report.locked = {
    provinceId: sparseId,
    stateId: snapshot.state,
    burgId: snapshot.burg,
    packCells: packCellsBefore.length,
    gridCells: gridCellsBefore.length,
    generated: result.provinces.filter(province => province?.i).length
  };
}

function testConflicts() {
  const parentMap = generatePlaceholderMap({...options, seed: "regeneration-lock-province-parent"});
  const parentProvince = selectLockCandidate(parentMap);
  assertConflict(parentMap, [{...structuredClone(parentProvince), state: 999999}], "invalid-parent-state");

  const waterMap = generatePlaceholderMap({...options, seed: "regeneration-lock-province-water"});
  const waterProvince = selectLockCandidate(waterMap);
  const waterCell = waterMap.pack.cells.i.find(cell => waterMap.pack.cells.h[cell] < 20);
  assert.ok(Number.isInteger(waterCell), "冲突样本缺少水域 cell");
  assertConflict(waterMap, [{...structuredClone(waterProvince), center: waterCell, burg: 0}], "invalid-center");

  const overlapMap = generatePlaceholderMap({...options, seed: "regeneration-lock-province-overlap"});
  const [first, second] = selectSameStatePair(overlapMap);
  assert.ok(first && second, "冲突样本缺少同国双省");
  assertConflict(overlapMap, [
    structuredClone(first),
    {...structuredClone(second), center: first.center, burg: 0}
  ], "overlapping-center");
}

function assertConflict(map, lockedProvinces, reason) {
  assert.throws(
    () => regeneratePackProvincesWithinStates(
      map.grid,
      map.society,
      {...map.options, lockedProvinces},
      map.pack,
      {salt: 5}
    ),
    error => {
      assert.equal(error?.code, "regeneration_lock_conflict");
      assert.equal(error?.details?.reason, reason);
      report.conflictCodes.push(reason);
      return true;
    }
  );
}

function selectLockCandidate(map) {
  return (map.pack.provinces || []).find(province => {
    if (!province?.i || province.removed || !province.burg) return false;
    const burg = map.pack.burgs?.[province.burg];
    return burg && !burg.removed && burg.cell === province.center
      && ownedCells(map.pack.cells.province, province.i).length > 2
      && ownedCells(map.grid.cells.province, province.i).length > 0;
  });
}

function selectSameStatePair(map) {
  const byState = new Map();
  for (const province of map.pack.provinces || []) {
    if (!province?.i || province.removed || !province.burg) continue;
    if (!byState.has(province.state)) byState.set(province.state, []);
    byState.get(province.state).push(province);
  }
  return Array.from(byState.values()).find(provinces => provinces.length >= 2)?.slice(0, 2) || [];
}

function ownedCells(values, id) {
  const cells = [];
  for (let cell = 0; cell < (values?.length || 0); cell++) {
    if (Number(values[cell]) === id) cells.push(cell);
  }
  return cells;
}

function snapshotUnlocked(provinces, lockedId) {
  return JSON.stringify((provinces || [])
    .filter(province => province?.i && province.i !== lockedId)
    .map(province => [province.i, province.state, province.center, province.name]));
}
