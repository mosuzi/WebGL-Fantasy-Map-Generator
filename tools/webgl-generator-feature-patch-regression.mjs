#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {
  createApplyFeaturePatchCommand,
  createSetLakeOutletCommand,
  inspectFeaturePatch,
  inspectLakeOutletChange
} from "../app/webgl-generator/src/runtime/lake-edit-commands.js";
import {createMapDocument, createMapGeoJson} from "../app/webgl-generator/src/runtime/map-file-io.js";

const appSource = readFileSync(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8");
const consoleApiSource = readFileSync(new URL("../app/webgl-generator/src/runtime/console-api.js", import.meta.url), "utf8");
const lakePanelSource = readFileSync(new URL("../app/webgl-generator/src/ui/vue/components/LakePanel.vue", import.meta.url), "utf8");
assert.match(appSource, /FEATURE_PATCH_SELECT: "feature:patch-select"/, "局部修正缺少画布选点模式");
assert.match(appSource, /createSetLakeOutletCommand\(id, outlet/, "UI 与 API 没有共用湖泊出口命令");
assert.match(appSource, /createApplyFeaturePatchCommand\(options/, "UI 与 API 没有共用局部修正命令");
assert.match(consoleApiSource, /inspectOutlet: \(lakeId, outletRiverId\)/, "控制台 API 缺少湖泊出口预检");
assert.match(consoleApiSource, /features: Object\.freeze\(\{/, "控制台 API 缺少 feature 编辑命名空间");
assert.match(lakePanelSource, /<template #outlet>/, "湖泊面板缺少出口编辑入口");
assert.match(lakePanelSource, /<template #shore>/, "湖泊面板缺少局部水陆修正入口");

const map = generatePlaceholderMap({seed: "feature-a", cellsTarget: 5000, heightmapTemplate: "continents"});
const lakes = map.pack.features.filter(feature => feature?.type === "lake");
assert(lakes.length >= 2, "固定 seed 应生成多个湖泊");

const outletLake = lakes.find(lake => lake.outlet);
assert(outletLake, "固定 seed 应生成带出口的湖泊");
const outletId = Number(outletLake.outlet);
const outletPreview = inspectLakeOutletChange(map, outletLake.i, outletId);
assert.equal(outletPreview.valid, true);
assert.equal(outletPreview.changed, false);
const unrelatedRiver = (map.rivers.rivers || []).find(river => Number(river.i) !== outletId && !inspectLakeOutletChange(map, outletLake.i, river.i).valid);
assert(unrelatedRiver, "固定 seed 应存在不能作为该湖出口的河流");
assert.equal(inspectLakeOutletChange(map, outletLake.i, unrelatedRiver.i).code, "invalid-outlet-path");
assert.equal(inspectLakeOutletChange(map, outletLake.i, 999999).code, "missing-river");

const outletBefore = outletSnapshot(map, outletLake.i);
const outletHistory = new EditHistory();
outletHistory.execute(createSetLakeOutletCommand(outletLake.i, 0), {map});
assert.equal(map.pack.features[outletLake.i].outlet, undefined);
assert.equal(outletHistory.getStats().undo, 1);
assert((map.pack.features[outletLake.i].inlets || []).every(id => findRiver(map, id)?.parent === 0));
const outletCleared = outletSnapshot(map, outletLake.i);
outletHistory.undo({map});
assert.deepEqual(outletSnapshot(map, outletLake.i), outletBefore, "撤销必须恢复湖泊出口与河流父级");
outletHistory.redo({map});
assert.deepEqual(outletSnapshot(map, outletLake.i), outletCleared, "重做必须恢复相同出口快照");
outletHistory.undo({map});

const patchLake = lakes.find(lake => Number(lake.cells) >= 8);
assert(patchLake, "固定 seed 应生成可局部修正的湖泊");
const waterTarget = findValidPatch(map, patchLake.i, "water");
const landTarget = findValidPatch(map, patchLake.i, "land");
assert(waterTarget && landTarget, "固定 seed 应存在合法的扩湖和收岸 cell");

const invalidRadius = inspectFeaturePatch(map, {lakeId: patchLake.i, centerPackCell: waterTarget.centerPackCell, radius: 3, target: "water"});
assert.equal(invalidRadius.code, "invalid-radius");
const wholeLake = lakes.find(lake => Number(lake.cells) === 1);
assert(wholeLake, "固定 seed 应包含单 cell 湖泊用于整湖拒绝");
assert.equal(inspectFeaturePatch(map, {lakeId: wholeLake.i, centerPackCell: wholeLake.firstCell, target: "land"}).code, "remove-whole-lake");
const openWaterMap = structuredCloneMap(map);
const openPreview = inspectFeaturePatch(openWaterMap, {lakeId: patchLake.i, centerPackCell: waterTarget.centerPackCell, target: "water"});
const selected = new Set(openPreview.packCells);
const external = openPreview.packCells.flatMap(cell => openWaterMap.pack.cells.c[cell] || []).find(cell => !selected.has(cell) && openWaterMap.pack.cells.f[cell] !== patchLake.i);
assert(Number.isInteger(external));
const ocean = openWaterMap.pack.features.find(feature => feature?.type === "ocean");
openWaterMap.pack.cells.h[external] = 19;
openWaterMap.pack.cells.f[external] = ocean.i;
assert.equal(inspectFeaturePatch(openWaterMap, {lakeId: patchLake.i, centerPackCell: waterTarget.centerPackCell, target: "water"}).code, "open-water-conflict");

const waterBefore = featureSnapshot(map);
const waterHistory = new EditHistory();
const waterCommand = createApplyFeaturePatchCommand({lakeId: patchLake.i, centerPackCell: waterTarget.centerPackCell, radius: 0, target: "water"});
waterHistory.execute(waterCommand, {map});
const waterResult = waterCommand.getResult();
assert.equal(waterHistory.getStats().undo, 1);
assert(waterResult.packCells > 0 && waterResult.gridCells > 0);
assert(waterTarget.packCells.every(cell => map.pack.cells.h[cell] < 20 && map.pack.cells.f[cell] === patchLake.i));
assert(waterTarget.gridCells.every(cell => map.grid.cells.h[cell] < 20 && map.grid.cells.f[cell] === waterTarget.gridLakeId));
assert.equal(map.pack.metadata.havenCells, countPositive(map.pack.cells.haven));
assert.equal(map.pack.metadata.harborCells, countPositive(map.pack.cells.harbor));
assert.equal(map.features.metadata.lakeShoreSegments, map.features.shore.lakeShore.length);
assert(map.metadata.derivedStale.systems.includes("rivers"));
const waterAfter = featureSnapshot(map);
waterHistory.undo({map});
assert.deepEqual(featureSnapshot(map), waterBefore, "扩湖撤销必须恢复高度、feature、岸线、港湾和 stale");
waterHistory.redo({map});
assert.deepEqual(featureSnapshot(map), waterAfter, "扩湖重做必须恢复相同局部修正结果");
waterHistory.undo({map});

const landBefore = featureSnapshot(map);
const landHistory = new EditHistory();
const landCommand = createApplyFeaturePatchCommand({lakeId: patchLake.i, centerPackCell: landTarget.centerPackCell, radius: 0, target: "land"});
landHistory.execute(landCommand, {map});
const landResult = landCommand.getResult();
assert(landTarget.packCells.every(cell => map.pack.cells.h[cell] >= 20 && map.pack.cells.f[cell] === landTarget.packTargetFeature));
assert(landTarget.gridCells.every(cell => map.grid.cells.h[cell] >= 20 && map.grid.cells.f[cell] === landTarget.gridTargetFeature));
assertFeatureReferencesValid(map.pack.cells, map.pack.features, "pack");
assertFeatureReferencesValid(map.grid.cells, map.features.features, "grid");
const landAfter = featureSnapshot(map);
landHistory.undo({map});
assert.deepEqual(featureSnapshot(map), landBefore, "收岸撤销必须完整恢复");
landHistory.redo({map});
assert.deepEqual(featureSnapshot(map), landAfter, "收岸重做必须完整恢复");

const document = createMapDocument(map, map.options);
assert.equal(document.map.pack.features[patchLake.i].type, "lake");
assert.equal(document.map.pack.features[outletLake.i].outlet, outletId);
const geo = createMapGeoJson(map);
for (const cell of landTarget.packCells) {
  const feature = geo.features.find(item => item.properties.cell === cell);
  assert(feature && feature.properties.isWater === false, `pack cell #${cell} 的 GeoJSON 水陆状态必须同步`);
}

console.log(JSON.stringify({
  ok: true,
  outlet: {lakeId: outletLake.i, riverId: outletId, affectedInlets: outletPreview.affectedInlets},
  waterPatch: waterResult,
  landPatch: landResult,
  rejected: ["invalid-outlet-path", "missing-river", "invalid-radius", "remove-whole-lake", "open-water-conflict"],
  synchronized: {grid: true, pack: true, shoreline: true, haven: true, harbor: true, geojson: true, stale: true, roundtrip: true}
}, null, 2));

function findValidPatch(targetMap, lakeId, target) {
  for (const centerPackCell of targetMap.pack.cells.i) {
    const preview = inspectFeaturePatch(targetMap, {lakeId, centerPackCell, radius: 0, target});
    if (preview.valid) return preview;
  }
  return null;
}

function findRiver(targetMap, riverId) {
  return (targetMap.rivers.rivers || []).find(river => Number(river.i ?? river.id) === Number(riverId));
}

function outletSnapshot(targetMap, lakeId) {
  const lake = targetMap.pack.features[lakeId];
  return {
    outlet: lake.outlet ?? null,
    rivers: (targetMap.rivers.rivers || []).map(river => ({id: river.i, parent: river.parent, basin: river.basin, type: river.type})),
    stale: JSON.parse(JSON.stringify(targetMap.metadata.derivedStale || null))
  };
}

function featureSnapshot(targetMap) {
  return {
    packFeatures: JSON.parse(JSON.stringify(targetMap.pack.features)),
    packMetadata: JSON.parse(JSON.stringify(targetMap.pack.metadata)),
    packCells: cellSnapshot(targetMap.pack.cells, ["h", "f", "t", "haven", "harbor", "type", "r", "fl", "conf"]),
    gridFeatures: JSON.parse(JSON.stringify(targetMap.features.features)),
    gridFeaturesShared: targetMap.grid.features === targetMap.features.features,
    featureMetadata: JSON.parse(JSON.stringify(targetMap.features.metadata)),
    featureShore: JSON.parse(JSON.stringify(targetMap.features.shore)),
    gridCells: cellSnapshot(targetMap.grid.cells, ["h", "f", "t"]),
    stale: JSON.parse(JSON.stringify(targetMap.metadata.derivedStale || null)),
    staleFlags: ["markers", "zones", "military", "economy", "diplomacy"].map(kind => targetMap[kind]?.metadata?.stale)
  };
}

function cellSnapshot(cells, fields) {
  return Object.fromEntries(fields.map(field => [field, Array.from(cells[field] || [])]));
}

function countPositive(values) {
  return Array.from(values || []).filter(value => Number(value) > 0).length;
}

function assertFeatureReferencesValid(cells, features, label) {
  for (let cell = 0; cell < cells.f.length; cell++) assert(features[cells.f[cell]], `${label} cell #${cell} 引用了不存在的 feature #${cells.f[cell]}`);
}

function structuredCloneMap(source) {
  const cloned = structuredClone(source);
  cloned.grid.features = cloned.features.features;
  if (cloned.rivers?.rivers && cloned.pack?.rivers) cloned.pack.rivers = cloned.rivers.rivers;
  return cloned;
}
