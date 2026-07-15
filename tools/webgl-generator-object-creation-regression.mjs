#!/usr/bin/env node
import assert from "node:assert/strict";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {buildObjectPickingIndex, pickGridCell} from "../app/webgl-generator/src/renderer/picking.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createExcavateLakeCommand, inspectLakeCreation} from "../app/webgl-generator/src/runtime/lake-edit-commands.js";
import {createMapDocument, createMapFeatureGeoJson} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {resolveObject} from "../app/webgl-generator/src/runtime/object-resolver.js";
import {createAddRiverCommand, inspectRiverCreation} from "../app/webgl-generator/src/runtime/river-edit-commands.js";
import {createAddRouteCommand, inspectRouteCreation} from "../app/webgl-generator/src/runtime/route-edit-commands.js";

const map = generatePlaceholderMap({seed: "object-creation-regression", cellsTarget: 3000, heightmapTemplate: "continents"});
const history = new EditHistory();

const routePreview = findRoutePreview(map);
assert.equal(inspectRouteCreation(map, {startPackCell: routePreview.startPackCell, endPackCell: routePreview.startPackCell}).code, "same-endpoint");
const routeBefore = snapshotRoute(map);
const routeSegmentsBefore = buildObjectPickingIndex(map).routeSegmentCount;
const routeCommand = createAddRouteCommand(routePreview);
history.execute(routeCommand, {map});
const routeResult = routeCommand.getResult();
assert.ok(resolveObject(map, {kind: "route", id: routeResult.routeId}), "新路线必须能被对象解析器读取");
assert.ok(createMapFeatureGeoJson(map, {layers: {route: true}}).features.some(feature => feature.properties.id === routeResult.routeId), "新路线必须进入要素导出");
assert.equal(buildObjectPickingIndex(map).routeSegmentCount, routeSegmentsBefore + routePreview.path.length - 1, "新路线必须进入拾取索引");
assert.equal(history.getStats().undo, 1);
history.undo({map});
assert.deepEqual(snapshotRoute(map), routeBefore, "撤销必须恢复路线、索引和 stale 状态");
history.redo({map});
assert.ok(resolveObject(map, {kind: "route", id: routeResult.routeId}));

const riverPreview = findRiverPreview(map);
const riverBefore = snapshotRiver(map);
const riverSegmentsBefore = buildObjectPickingIndex(map).riverSegmentCount;
const riverCommand = createAddRiverCommand(riverPreview);
history.execute(riverCommand, {map});
const riverResult = riverCommand.getResult();
const river = map.rivers.rivers.find(item => item.id === riverResult.riverId);
assert.ok(river && resolveObject(map, {kind: "river", id: riverResult.riverId}), "新河流必须能被对象解析器读取");
assertStrictlyDownhill(map, river.cells);
assert.ok(createMapFeatureGeoJson(map, {layers: {river: true}}).features.some(feature => feature.properties.id === riverResult.riverId), "新河流必须进入要素导出");
assert.equal(buildObjectPickingIndex(map).riverSegmentCount, riverSegmentsBefore + riverPreview.path.length - 1, "新河流必须进入拾取索引");
history.undo({map});
assert.deepEqual(snapshotRiver(map), riverBefore, "撤销必须恢复河流、cell 水文和 stale 状态");
history.redo({map});
assert.ok(resolveObject(map, {kind: "river", id: riverResult.riverId}));

const lakePreview = findLakePreview(map);
const lakeBefore = snapshotLake(map);
const lakeCommand = createExcavateLakeCommand(lakePreview);
history.execute(lakeCommand, {map});
const lakeResult = lakeCommand.getResult();
const lake = resolveObject(map, {kind: "lake", id: lakeResult.lakeId});
assert.ok(lake, "新湖泊必须能被对象解析器读取");
assert.ok(lakePreview.packCells.every(cell => map.pack.cells.h[cell] < 20 && map.pack.cells.f[cell] === lakeResult.lakeId));
assert.equal(map.features.metadata.lakeShoreSegments, map.features.shore.lakeShore.length);
const lakePickPoint = map.grid.points[lakePreview.gridCells[0]];
assert.equal(pickGridCell(map, lakePickPoint[0], lakePickPoint[1]).featureType, "lake", "新湖泊必须能通过画布拾取");
assert.ok(createMapDocument(map, map.options).map.pack.features[lakeResult.lakeId]?.type === "lake", "新湖泊必须进入完整地图导出");
history.undo({map});
assert.deepEqual(snapshotLake(map), lakeBefore, "撤销必须恢复湖泊高度、feature、岸线和 stale 状态");
history.redo({map});
assert.ok(resolveObject(map, {kind: "lake", id: lakeResult.lakeId}));

const invalidRiverSource = map.pack.cells.i.find(cell => map.pack.cells.h[cell] < 20);
assert.equal(inspectRiverCreation(map, {sourcePackCell: invalidRiverSource}).code, "source-water");
const landRouteCell = map.pack.cells.i.find(cell => map.pack.cells.h[cell] >= 20);
assert.equal(inspectRouteCreation(map, {startPackCell: landRouteCell, endPackCell: invalidRiverSource, type: "road"}).code, "terrain-mismatch");
const confluencePreview = inspectRiverCreation(createRiverRelationshipFixture(), {sourcePackCell: 0});
assert.deepEqual(
  {valid: confluencePreview.valid, path: confluencePreview.path, parent: confluencePreview.parent, termination: confluencePreview.termination},
  {valid: true, path: [0, 1, 2], parent: 5, termination: "confluence"},
  "支流必须沿严格下坡关系汇入既有下游河流"
);
assert.equal(inspectRiverCreation(createRiverSinkFixture(), {sourcePackCell: 0}).code, "downhill-blocked", "无严格下坡出口的坏河源必须拒绝");
const coastCell = map.pack.cells.i.find(cell => map.pack.cells.h[cell] >= 20 && (map.pack.cells.c[cell] || []).some(neighbor => map.pack.cells.h[neighbor] < 20));
assert.notEqual(inspectLakeCreation(map, {packCell: coastCell}).valid, true, "连接现有水域的湖盆必须拒绝");

console.log(JSON.stringify({
  ok: true,
  route: routeResult,
  river: riverResult,
  lake: lakeResult,
  history: history.getStats()
}, null, 2));

function findRoutePreview(targetMap) {
  const byFeature = new Map();
  for (const cell of targetMap.pack.cells.i) {
    if (targetMap.pack.cells.h[cell] < 20) continue;
    const feature = targetMap.pack.cells.f[cell];
    if (!byFeature.has(feature)) byFeature.set(feature, []);
    byFeature.get(feature).push(cell);
  }
  for (const land of [...byFeature.values()].sort((a, b) => b.length - a.length)) {
    for (let left = 0; left < Math.min(land.length, 80); left += 5) {
      for (let right = land.length - 1; right > Math.max(left, land.length - 120); right -= 7) {
        const preview = inspectRouteCreation(targetMap, {startPackCell: land[left], endPackCell: land[right], type: "road"});
        if (preview.valid && preview.path.length >= 4) return preview;
      }
    }
  }
  throw new Error("固定地图找不到可用路线样本");
}

function findRiverPreview(targetMap) {
  const candidates = targetMap.pack.cells.i
    .filter(cell => targetMap.pack.cells.h[cell] >= 30 && !targetMap.pack.cells.r[cell])
    .sort((a, b) => targetMap.pack.cells.h[b] - targetMap.pack.cells.h[a]);
  for (const sourcePackCell of candidates) {
    const preview = inspectRiverCreation(targetMap, {sourcePackCell});
    if (preview.valid && preview.path.length >= 3) return preview;
  }
  throw new Error("固定地图找不到可用河源样本");
}

function findLakePreview(targetMap) {
  for (const packCell of targetMap.pack.cells.i) {
    const preview = inspectLakeCreation(targetMap, {packCell, radius: 0, waterHeight: 19});
    if (preview.valid) return preview;
  }
  throw new Error("固定地图找不到可用湖盆样本");
}

function createRiverRelationshipFixture() {
  return {
    pack: {
      cells: {
        i: new Uint8Array([0, 1, 2, 3]),
        h: new Uint8Array([50, 40, 30, 20]),
        c: [[1], [0, 2], [1, 3], [2]],
        r: new Uint8Array([0, 0, 5, 5])
      }
    }
  };
}

function createRiverSinkFixture() {
  return {
    pack: {
      cells: {
        i: new Uint8Array([0, 1, 2]),
        h: new Uint8Array([50, 50, 51]),
        c: [[1, 2], [0], [0]],
        r: new Uint8Array(3)
      }
    }
  };
}

function assertStrictlyDownhill(targetMap, cells) {
  for (let index = 0; index < cells.length - 1; index += 1) {
    assert.ok(targetMap.pack.cells.h[cells[index + 1]] < targetMap.pack.cells.h[cells[index]], `河段 ${index} 不是严格下坡`);
  }
}

function snapshotRoute(targetMap) {
  return clone({routes: targetMap.settlements.routes, metadata: targetMap.settlements.metadata, packRoutes: targetMap.pack.routes, links: targetMap.pack.cells.routes, stale: targetMap.metadata.derivedStale});
}

function snapshotRiver(targetMap) {
  return clone({rivers: targetMap.rivers, packRivers: targetMap.pack.rivers, r: targetMap.pack.cells.r, fl: targetMap.pack.cells.fl, conf: targetMap.pack.cells.conf, features: targetMap.pack.features, stale: targetMap.metadata.derivedStale});
}

function snapshotLake(targetMap) {
  return clone({packFeatures: targetMap.pack.features, packMetadata: targetMap.pack.metadata, packH: targetMap.pack.cells.h, packF: targetMap.pack.cells.f, packT: targetMap.pack.cells.t, haven: targetMap.pack.cells.haven, harbor: targetMap.pack.cells.harbor, gridFeatures: targetMap.features, gridH: targetMap.grid.cells.h, gridF: targetMap.grid.cells.f, gridT: targetMap.grid.cells.t, stale: targetMap.metadata.derivedStale});
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
