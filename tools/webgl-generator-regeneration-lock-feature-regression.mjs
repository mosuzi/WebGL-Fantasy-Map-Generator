#!/usr/bin/env node
import assert from "node:assert/strict";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {rebuildFeatureTopology} from "../app/webgl-generator/src/runtime/feature-topology-edit-commands.js";

const options = {seed: "regeneration-lock-feature", cellsTarget: 5000, heightmapTemplate: "continents"};
const report = {ok: true, locked: [], unlockedChanged: false, conflictCodes: []};

testOrdinaryRebuildAndSparseIds();
testConflictsAndRollback();

console.log(JSON.stringify(report, null, 2));

function testOrdinaryRebuildAndSparseIds() {
  const map = generatePlaceholderMap(options);
  const lake = selectFeature(map, feature => feature.type === "lake");
  const island = selectFeature(map, feature => feature.land && feature.type === "island");
  assert.ok(lake && island, "真实固定图缺少湖泊或岛屿 Feature");

  const sparseLake = movePackFeatureId(map, lake.i, Math.max(map.pack.features.length + 41, 101));
  const sparseIsland = movePackFeatureId(map, island.i, sparseLake.i + 37);
  const locks = [structuredClone(sparseLake), structuredClone(sparseIsland)];
  const snapshots = locks.map(feature => captureLockSnapshot(map, feature.i));

  const lockedGridIds = new Set(snapshots.map(snapshot => snapshot.gridId));
  const victim = map.features.features.find(feature => feature?.i && !feature.removed && !lockedGridIds.has(feature.i) && feature.cells?.length > 2);
  assert.ok(victim, "真实固定图缺少远处未锁 Feature");
  const victimCell = victim.cells.find(cell => cell !== victim.firstCell);
  const wrongFeature = map.features.features.find(feature => feature?.i && !feature.removed && feature.i !== victim.i && !lockedGridIds.has(feature.i));
  assert.ok(Number.isInteger(victimCell) && wrongFeature, "未锁 Feature 扰动样本不足");
  map.grid.cells.f[victimCell] = wrongFeature.i;
  const packVictims = packCellsForGrid(map, victimCell).filter(cell => !snapshots.some(snapshot => snapshot.packCells.includes(cell)));
  for (const cell of packVictims) map.pack.cells.f[cell] = wrongFeature.i;
  const corruptedGridAssignment = Number(map.grid.cells.f[victimCell]);

  rebuildFeatureTopology(map, {lockedFeatures: locks});

  for (const snapshot of snapshots) {
    assert.deepEqual(captureLockSnapshot(map, snapshot.id), snapshot, `锁定 Feature #${snapshot.id} 在普通重建中被改写`);
    report.locked.push({
      id: snapshot.id,
      type: snapshot.packFeature.type,
      packCells: snapshot.packCells.length,
      gridCells: snapshot.gridCells.length
    });
  }
  assert.notEqual(Number(map.grid.cells.f[victimCell]), corruptedGridAssignment, "远处未锁 Feature assignment 没有被普通重建纠正");
  report.unlockedChanged = true;
}

function testConflictsAndRollback() {
  testSplitConflict();
  testMergeConflict();
  testTypeConflict();
}

function testSplitConflict() {
  const map = generatePlaceholderMap({...options, seed: "regeneration-lock-feature-split"});
  const feature = selectFeature(map, item => item.land && item.type === "island" && memberCells(map.grid.cells.f, gridFeatureIdForPack(map, item.i)).length > 1);
  assert.ok(feature, "拆分冲突缺少多 cell 岛屿");
  const lock = structuredClone(feature);
  const packCell = memberCells(map.pack.cells.f, feature.i)[0];
  const gridCell = Number(map.pack.cells.g[packCell]);
  map.grid.cells.h[gridCell] = 19;
  for (const cell of packCellsForGrid(map, gridCell)) map.pack.cells.h[cell] = 19;
  assertConflictRollback(map, lock, "locked-feature-split");
}

function testMergeConflict() {
  const map = generatePlaceholderMap({...options, seed: "regeneration-lock-feature-merge"});
  const lake = selectFeature(map, item => item.type === "lake");
  assert.ok(lake, "合并冲突缺少湖泊");
  const lock = structuredClone(lake);
  const gridId = gridFeatureIdForPack(map, lake.i);
  const adjacentLand = memberCells(map.grid.cells.f, gridId)
    .flatMap(cell => map.grid.cells.c[cell] || [])
    .find(cell => map.grid.cells.h[cell] >= 20);
  assert.ok(Number.isInteger(adjacentLand), "合并冲突缺少湖岸 cell");
  map.grid.cells.h[adjacentLand] = 19;
  for (const cell of packCellsForGrid(map, adjacentLand)) map.pack.cells.h[cell] = 19;
  assertConflictRollback(map, lock, "locked-feature-merged");
}

function testTypeConflict() {
  const map = generatePlaceholderMap({...options, seed: "regeneration-lock-feature-type"});
  const lake = selectFeature(map, item => item.type === "lake" && memberCells(map.grid.cells.f, gridFeatureIdForPack(map, item.i)).length === 1)
    || selectFeature(map, item => item.type === "lake");
  assert.ok(lake, "类型冲突缺少湖泊");
  const lock = structuredClone(lake);
  const gridId = gridFeatureIdForPack(map, lake.i);
  for (const gridCell of memberCells(map.grid.cells.f, gridId)) {
    map.grid.cells.h[gridCell] = 20;
    for (const cell of packCellsForGrid(map, gridCell)) map.pack.cells.h[cell] = 20;
  }
  assertConflictRollback(map, lock, "locked-feature-type-changed");
}

function assertConflictRollback(map, lock, expectedReason) {
  const before = captureRollbackState(map);
  assert.throws(
    () => rebuildFeatureTopology(map, {lockedFeatures: [lock]}),
    error => {
      assert.equal(error?.code, "regeneration_lock_conflict");
      assert.equal(error?.details?.reason, expectedReason);
      report.conflictCodes.push(expectedReason);
      return true;
    }
  );
  assert.deepEqual(captureRollbackState(map), before, `${expectedReason} 冲突没有回滚命令内拓扑改写`);
}

function movePackFeatureId(map, oldId, nextId) {
  const feature = structuredClone(map.pack.features[oldId]);
  feature.id = nextId;
  feature.i = nextId;
  map.pack.features[oldId] = null;
  map.pack.features[nextId] = feature;
  for (let cell = 0; cell < map.pack.cells.f.length; cell++) {
    if (Number(map.pack.cells.f[cell]) === oldId) map.pack.cells.f[cell] = nextId;
  }
  const remap = object => {
    if (!object || typeof object !== "object") return;
    if (Number(object.feature) === oldId) object.feature = nextId;
    if (Number(object.port) === oldId) object.port = nextId;
    if (Number(object.data?.feature) === oldId) object.data.feature = nextId;
  };
  for (const collection of [map.pack.burgs, map.pack.routes, map.settlements?.cities, map.settlements?.routes, map.markers?.markers, map.pack?.portDiagnostics?.features]) {
    for (const object of collection || []) remap(object);
  }
  return feature;
}

function captureLockSnapshot(map, id) {
  const gridId = gridFeatureIdForPack(map, id);
  const packCells = memberCells(map.pack.cells.f, id);
  const gridCells = memberCells(map.grid.cells.f, gridId);
  return {
    id,
    gridId,
    packFeature: structuredClone(map.pack.features[id]),
    gridFeature: structuredClone(map.features.features[gridId]),
    packCells,
    gridCells,
    packAssignments: captureAssignments(map.pack.cells, packCells, ["f", "haven", "harbor", "type"]),
    gridAssignments: captureAssignments(map.grid.cells, gridCells, ["f"])
  };
}

function captureRollbackState(map) {
  return {
    gridFeatures: structuredClone(map.features.features),
    packFeatures: structuredClone(map.pack.features),
    gridF: Array.from(map.grid.cells.f),
    gridT: Array.from(map.grid.cells.t),
    packF: Array.from(map.pack.cells.f),
    packT: Array.from(map.pack.cells.t),
    haven: Array.from(map.pack.cells.haven),
    harbor: Array.from(map.pack.cells.harbor)
  };
}

function captureAssignments(cells, members, fields) {
  return Object.fromEntries(fields.map(field => [field, members.map(cell => cells[field]?.[cell])]));
}

function gridFeatureIdForPack(map, packFeatureId) {
  const ids = new Set(memberCells(map.pack.cells.f, packFeatureId).map(cell => Number(map.grid.cells.f[map.pack.cells.g[cell]])));
  assert.equal(ids.size, 1, `pack Feature #${packFeatureId} 没有唯一 grid 镜像`);
  return [...ids][0];
}

function selectFeature(map, predicate) {
  return (map.pack.features || []).find(feature => feature?.i && !feature.removed && predicate(feature));
}

function memberCells(values, id) {
  const cells = [];
  for (let cell = 0; cell < (values?.length || 0); cell++) if (Number(values[cell]) === id) cells.push(cell);
  return cells;
}

function packCellsForGrid(map, gridCell) {
  const cells = [];
  for (let cell = 0; cell < map.pack.cells.g.length; cell++) if (Number(map.pack.cells.g[cell]) === gridCell) cells.push(cell);
  return cells;
}
