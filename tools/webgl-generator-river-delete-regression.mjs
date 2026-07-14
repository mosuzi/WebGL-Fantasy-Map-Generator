#!/usr/bin/env node
import assert from "node:assert/strict";
import {buildObjectPickingIndex} from "../app/webgl-generator/src/renderer/picking.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createMapFeatureGeoJson} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {resolveObject} from "../app/webgl-generator/src/runtime/object-resolver.js";
import {createDeleteRiverCommand} from "../app/webgl-generator/src/runtime/river-edit-commands.js";
import {SelectionStore} from "../app/webgl-generator/src/runtime/selection-store.js";

const map = createFixture();
const before = snapshot(map);
const history = new EditHistory();
const selection = new SelectionStore(() => {}, object => resolveObject(map, object));
selection.setSelection({object: {kind: "river", id: 2}});

const command = createDeleteRiverCommand(2);
history.execute(command, {map});
selection.refresh();

assert.deepEqual(command.getResult(), {riverId: 2, removedIds: [2, 3], removed: 2, tributaries: 1});
assert.deepEqual(map.rivers.rivers.map(river => river.id), [1, 4]);
assert.equal(map.pack.rivers, map.rivers.rivers);
assert.equal(map.pack.cells.r[2], 1, "共享河段应由存活主河重新占用");
assert.equal(map.pack.cells.r[3], 0);
assert.equal(map.pack.cells.r[4], 0);
assert.equal(map.pack.cells.fl[3], 8, "删除河段流量应回退到 grid 降水");
assert.deepEqual(map.pack.features[1].inlets, [4]);
assert.equal("outlet" in map.pack.features[1], false);
assert.equal("river" in map.pack.features[1], false);
assert.equal("enteringFlux" in map.pack.features[1], false);
assert.deepEqual(map.notes.notes.map(note => note.id), ["river:4"]);
assert.equal(map.rivers.metadata.rivers, 2);
assert.equal(map.rivers.metadata.segments, 4);
assert.ok(map.metadata.derivedStale.systems.includes("rivers"));
assert.ok(map.metadata.derivedStale.systems.includes("economy"));
assert.equal(map.economy.metadata.stale, true);
assert.equal(selection.getSnapshot().selection, null);

const affected = history.getStats().lastAffected.map(item => `${item.kind}:${item.id}`);
assert.deepEqual(affected, ["river:2", "river:3"]);
const pickingAfterDelete = buildObjectPickingIndex(map);
assert.equal(pickingAfterDelete.riverSegmentCount, 4);
assert.equal(pickingRiverIds(pickingAfterDelete).has(2), false);
assert.equal(pickingRiverIds(pickingAfterDelete).has(3), false);
const exportAfterDelete = createMapFeatureGeoJson(map, {layers: {river: true}});
assert.deepEqual(exportAfterDelete.features.map(feature => feature.properties.id), [1, 4]);

history.undo({map});
assert.deepEqual(snapshot(map), before, "撤销必须恢复河流、cell、湖泊、备注和 stale 状态");
assert.deepEqual(createMapFeatureGeoJson(map, {layers: {river: true}}).features.map(feature => feature.properties.id), [1, 2, 3, 4]);
assert.equal(buildObjectPickingIndex(map).riverSegmentCount, 6);

history.redo({map});
assert.deepEqual(map.rivers.rivers.map(river => river.id), [1, 4]);
assert.deepEqual(createMapFeatureGeoJson(map, {layers: {river: true}}).features.map(feature => feature.properties.id), [1, 4]);

const missingBefore = snapshot(map);
const missing = createDeleteRiverCommand(99);
assert.equal(missing.isNoop({map}), true);
assert.deepEqual(snapshot(map), missingBefore, "不存在的河流不得改变地图");

console.log(JSON.stringify({
  ok: true,
  removedIds: command.getResult().removedIds,
  remainingIds: map.rivers.rivers.map(river => river.id),
  affected,
  pickingRiverSegments: buildObjectPickingIndex(map).riverSegmentCount,
  staleSystems: map.metadata.derivedStale.systems
}, null, 2));

function createFixture() {
  const rivers = [
    river(1, 0, 1, [0, 1, 2], [[0, 10], [10, 10], [20, 10]]),
    river(2, 1, 1, [2, 3], [[20, 10], [30, 20]]),
    river(3, 2, 1, [3, 4], [[30, 20], [40, 30]]),
    river(4, 0, 4, [5, 6], [[50, 40], [60, 50], [70, 60]])
  ];
  return {
    metadata: {graphWidth: 100, graphHeight: 80, seed: "river-delete-regression", checksum: "fixture"},
    options: {graphWidth: 100, graphHeight: 80},
    mapCoordinates: {lonW: 0, lonE: 100, latN: 0, latS: 80},
    grid: {cells: {prec: new Uint8Array([5, 6, 7, 8, 9, 10, 11])}},
    rivers: {
      rivers,
      metadata: {rivers: 4, segments: 6, sources: 4, longest: 3, maxFlux: 90, confluences: 2, cellsWithRiver: 7}
    },
    pack: {
      rivers,
      features: [null, {i: 1, type: "lake", inlets: [2, 4], outlet: 3, river: 2, enteringFlux: 55}],
      cells: {
        i: new Uint16Array([0, 1, 2, 3, 4, 5, 6]),
        g: new Uint16Array([0, 1, 2, 3, 4, 5, 6]),
        h: new Uint8Array([40, 38, 35, 32, 28, 42, 30]),
        c: [[1], [0, 2], [1, 3], [2, 4], [3], [6], [5]],
        r: new Uint16Array([1, 1, 2, 2, 3, 4, 4]),
        fl: new Uint16Array([20, 30, 50, 60, 70, 80, 90]),
        conf: new Uint16Array([0, 0, 1, 1, 0, 0, 0])
      }
    },
    notes: {
      notes: [note(2), note(3), note(4)],
      metadata: {notes: 3, formatVersion: 1}
    },
    settlements: {cities: [], routes: []},
    markers: {markers: [], metadata: {stale: false}},
    zones: {zones: [], metadata: {stale: false}},
    military: {regiments: [], metadata: {stale: false}},
    economy: {metadata: {stale: false}},
    diplomacy: {metadata: {stale: false}},
    politics: {states: [], provinces: []},
    society: {cultures: [], religions: []}
  };
}

function river(id, parent, basin, cells, points) {
  return {
    id,
    i: id,
    parent,
    basin,
    cells,
    points,
    source: cells[0],
    mouth: cells.at(-1),
    flux: id * 20,
    name: `河流 ${id}`,
    type: parent ? "Branch" : "River"
  };
}

function note(id) {
  return {id: `river:${id}`, kind: "river", objectId: id, name: `河流 ${id}`, body: `备注 ${id}`, format: "plain", pinned: false};
}

function snapshot(map) {
  return {
    rivers: JSON.parse(JSON.stringify(map.rivers)),
    packRiverIds: map.pack.rivers.map(river => river.id),
    cells: {
      r: Array.from(map.pack.cells.r),
      fl: Array.from(map.pack.cells.fl),
      conf: Array.from(map.pack.cells.conf)
    },
    lake: JSON.parse(JSON.stringify(map.pack.features[1])),
    notes: JSON.parse(JSON.stringify(map.notes)),
    derivedStale: JSON.parse(JSON.stringify(map.metadata.derivedStale || null)),
    staleFlags: ["markers", "zones", "military", "economy", "diplomacy"].map(kind => map[kind].metadata.stale)
  };
}

function pickingRiverIds(index) {
  const ids = new Set();
  for (const bucket of index.buckets.values()) {
    for (const segment of bucket.riverSegments) ids.add(segment.river.id);
  }
  return ids;
}
