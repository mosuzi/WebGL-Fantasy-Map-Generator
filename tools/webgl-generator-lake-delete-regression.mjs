#!/usr/bin/env node
import assert from "node:assert/strict";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {pickGridCell} from "../app/webgl-generator/src/renderer/picking.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createDeleteLakeCommand} from "../app/webgl-generator/src/runtime/lake-edit-commands.js";
import {createMapDocument, createMapGeoJson, parseMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {objectNoteId, restoreObjectNote} from "../app/webgl-generator/src/runtime/object-notes.js";
import {resolveObject} from "../app/webgl-generator/src/runtime/object-resolver.js";
import {SelectionStore} from "../app/webgl-generator/src/runtime/selection-store.js";

const map = generatePlaceholderMap({seed: "lake-delete-regression", cellsTarget: 3000, heightmapTemplate: "continents"});
const lake = map.pack.features.find(feature => feature?.type === "lake");
assert.ok(lake, "固定 seed 应生成至少一个湖泊");
const lakeId = Number(lake.i ?? lake.id);
const lakeRecordBefore = JSON.parse(JSON.stringify(lake));
const packLakeCells = cellsWithFeature(map.pack.cells, lakeId);
const firstGridCell = map.pack.cells.g[packLakeCells[0]];
const gridLakeId = Number(map.grid.cells.f[firstGridCell]);
const gridLakeCells = cellsWithFeature(map.grid.cells, gridLakeId);
const lakeCountBefore = countLakes(map.pack.features);
const lakeShoreBefore = map.features.shore.lakeShore.length;

restoreObjectNote(map, {
  id: objectNoteId({kind: "lake", id: lakeId}),
  kind: "lake",
  objectId: lakeId,
  name: lake.name || `湖泊 #${lakeId}`,
  body: "湖泊删除回归备注",
  format: "plain",
  pinned: false
});

const before = snapshot(map);
const history = new EditHistory();
const selection = new SelectionStore(() => {}, object => resolveObject(map, object));
selection.setSelection({object: {kind: "lake", id: lakeId}});
const command = createDeleteLakeCommand(lakeId);
history.execute(command, {map});
selection.refresh();

const result = command.getResult();
assert.equal(result.lakeId, lakeId);
assert.equal(result.packCells, packLakeCells.length);
assert.equal(result.gridCells, gridLakeCells.length);
assert.equal(countLakes(map.pack.features), lakeCountBefore - 1);
assertFeatureTombstone(map.pack.features[lakeId], lakeId, result.packTargetFeature, lakeRecordBefore);
assertFeatureTombstone(map.features.features[gridLakeId], gridLakeId, result.gridTargetFeature);
assert.ok(packLakeCells.every(cell => map.pack.cells.h[cell] >= 20));
assert.ok(gridLakeCells.every(cell => map.grid.cells.h[cell] >= 20));
assert.ok(packLakeCells.every(cell => map.pack.cells.f[cell] === result.packTargetFeature));
assert.ok(gridLakeCells.every(cell => map.grid.cells.f[cell] === result.gridTargetFeature));
assertFeatureReferencesValid(map.pack.cells, map.pack.features, "pack");
assertFeatureReferencesValid(map.grid.cells, map.features.features, "grid");
assert.equal(map.features.metadata.lakeShoreSegments, map.features.shore.lakeShore.length);
assert.equal(map.pack.metadata.havenCells, countPositive(map.pack.cells.haven));
assert.equal(map.pack.metadata.harborCells, countPositive(map.pack.cells.harbor));
assert.ok((map.pack.portDiagnostics?.features || []).every(item => item.feature !== lakeId), "港口诊断不得残留已删除湖泊 feature");
assert.ok(map.features.shore.lakeShore.length < lakeShoreBefore, "填平后原湖岸线应消失");
assert.equal(resolveObject(map, {kind: "lake", id: lakeId}), null);
assert.equal(selection.getSnapshot().selection, null);
assert.equal(map.notes.notes.some(note => note.id === `lake:${lakeId}` && note.body === "湖泊删除回归备注"), true);
assert.ok(map.metadata.derivedStale.systems.includes("rivers"));
assert.ok(map.metadata.derivedStale.systems.includes("features"));

const pickPoint = map.grid.points[firstGridCell];
const picked = pickGridCell(map, pickPoint[0], pickPoint[1]);
assert.notEqual(picked.featureType, "lake");
assert.equal(picked.featureLand, true);
const packGeoJson = createMapGeoJson(map);
for (const cell of packLakeCells) {
  const feature = packGeoJson.features.find(item => item.properties.cell === cell);
  assert.ok(feature, `pack GeoJSON 应包含 cell #${cell}`);
  assert.equal(feature.properties.isWater, false);
  assert.notEqual(feature.properties.feature, lakeId);
}
const document = createMapDocument(map, map.options);
assertFeatureTombstone(document.map.pack.features[lakeId], lakeId, result.packTargetFeature, lakeRecordBefore);
assertFeatureTombstone(document.map.features.features[gridLakeId], gridLakeId, result.gridTargetFeature);
const roundtrip = parseMapDocument(stringifyMapDocument(document)).map;
assertFeatureTombstone(roundtrip.pack.features[lakeId], lakeId, result.packTargetFeature, lakeRecordBefore);
assertFeatureTombstone(roundtrip.features.features[gridLakeId], gridLakeId, result.gridTargetFeature);
assert.equal(roundtrip.notes.notes.some(note => note.id === `lake:${lakeId}` && note.body === "湖泊删除回归备注"), true, "完整地图往返必须保留退役湖泊备注");
assert.equal(resolveObject(roundtrip, {kind: "lake", id: lakeId}), null, "完整地图往返后 tombstone 不得恢复为活动湖泊");
assertFeatureReferencesValid(roundtrip.pack.cells, roundtrip.pack.features, "roundtrip pack");
assertFeatureReferencesValid(roundtrip.grid.cells, roundtrip.features.features, "roundtrip grid");
assert.equal(history.getStats().lastDomain, "lake");
assert.deepEqual(history.getStats().lastAffected, [{kind: "lake", id: lakeId}]);

history.undo({map});
assert.deepEqual(snapshot(map), before, "撤销必须完整恢复高度、feature、岸线、水文、备注和 stale 状态");
assert.ok(resolveObject(map, {kind: "lake", id: lakeId}));
assert.equal(map.notes.notes.some(note => note.id === `lake:${lakeId}`), true);

history.redo({map});
assert.equal(resolveObject(map, {kind: "lake", id: lakeId}), null);
assert.equal(countLakes(map.pack.features), lakeCountBefore - 1);
assertFeatureTombstone(map.pack.features[lakeId], lakeId, result.packTargetFeature, lakeRecordBefore);
assert.equal(map.notes.notes.some(note => note.id === `lake:${lakeId}` && note.body === "湖泊删除回归备注"), true);

const retired = createDeleteLakeCommand(lakeId);
assert.equal(retired.isNoop({map}), true, "退役湖泊不得再次进入填平事务");

const missingBefore = snapshot(map);
const missing = createDeleteLakeCommand(999999);
assert.equal(missing.isNoop({map}), true);
assert.deepEqual(snapshot(map), missingBefore);

console.log(JSON.stringify({
  ok: true,
  lakeId,
  gridLakeId,
  packCells: result.packCells,
  gridCells: result.gridCells,
  fillHeight: result.fillHeight,
  lakeCountBefore,
  lakeCountAfter: countLakes(map.pack.features),
  lakeShoreBefore,
  lakeShoreAfter: map.features.shore.lakeShore.length,
  staleSystems: map.metadata.derivedStale.systems
}, null, 2));

function cellsWithFeature(cells, featureId) {
  const result = [];
  for (let cell = 0; cell < cells.f.length; cell += 1) if (Number(cells.f[cell]) === featureId) result.push(cell);
  return result;
}

function countLakes(features) {
  return features.filter(feature => feature?.type === "lake" && !feature.removed).length;
}

function assertFeatureReferencesValid(cells, features, label) {
  for (let cell = 0; cell < cells.f.length; cell += 1) {
    const feature = features[cells.f[cell]];
    assert.ok(feature && !feature.removed, `${label} cell #${cell} 引用了不存在或已退役的 feature #${cells.f[cell]}`);
  }
}

function assertFeatureTombstone(feature, featureId, redirectTo, source = null) {
  assert.ok(feature, `Feature #${featureId} tombstone 不得被清空`);
  assert.equal(feature.id, featureId);
  assert.equal(feature.i, featureId);
  assert.equal(feature.removed, true);
  assert.equal(feature.tombstone, true);
  assert.equal(feature.redirectTo, redirectTo);
  if (source) {
    assert.equal(feature.type, source.type);
    assert.equal(feature.name, source.name);
    assert.equal(feature.group, source.group);
  }
}

function countPositive(values) {
  return Array.from(values || []).filter(value => Number(value) > 0).length;
}

function snapshot(map) {
  return {
    packFeatures: JSON.parse(JSON.stringify(map.pack.features)),
    packMetadata: JSON.parse(JSON.stringify(map.pack.metadata)),
    packCells: cellSnapshot(map.pack.cells, ["h", "f", "t", "haven", "harbor", "type", "r", "fl", "conf"]),
    gridFeatures: JSON.parse(JSON.stringify(map.features.features)),
    gridFeaturesShared: map.grid.features === map.features.features,
    featureMetadata: JSON.parse(JSON.stringify(map.features.metadata)),
    featureShore: JSON.parse(JSON.stringify(map.features.shore)),
    gridCells: cellSnapshot(map.grid.cells, ["h", "f", "t"]),
    notes: JSON.parse(JSON.stringify(map.notes || null)),
    derivedStale: JSON.parse(JSON.stringify(map.metadata.derivedStale || null)),
    staleFlags: ["markers", "zones", "military", "economy", "diplomacy"].map(kind => map[kind]?.metadata?.stale)
  };
}

function cellSnapshot(cells, fields) {
  return Object.fromEntries(fields.map(field => [field, Array.from(cells[field] || [])]));
}
