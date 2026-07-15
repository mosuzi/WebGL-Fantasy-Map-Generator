#!/usr/bin/env node
import assert from "node:assert/strict";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {buildSelectionMeshVertices} from "../app/webgl-generator/src/renderer/selection-layer.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createMapDocument, createMapFeatureGeoJson} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {createAddMarkerCommand, createDeleteMarkerCommand, createSetMarkerNoteCommand, inspectMarkerCreation} from "../app/webgl-generator/src/runtime/marker-edit-commands.js";
import {createDeleteNoteCommand, createStandaloneNoteCommand, inspectStandaloneNoteCreation} from "../app/webgl-generator/src/runtime/note-edit-commands.js";
import {readObjectNote, restoreObjectNote} from "../app/webgl-generator/src/runtime/object-notes.js";
import {createSetObjectNoteCommand} from "../app/webgl-generator/src/runtime/object-edit-commands.js";
import {resolveObject} from "../app/webgl-generator/src/runtime/object-resolver.js";
import {createAddZoneCommand, createDeleteZoneCommand, inspectZoneCreation} from "../app/webgl-generator/src/runtime/zone-edit-commands.js";

const map = generatePlaceholderMap({seed: "auxiliary-object-creation-regression", cellsTarget: 3000, heightmapTemplate: "continents"});
const history = new EditHistory();

const zoneOptions = findZoneOptions(map);
const zoneBefore = snapshotZone(map);
const addZone = createAddZoneCommand(zoneOptions);
history.execute(addZone, {map});
const zoneResult = addZone.getResult();
assert.ok(resolveObject(map, {kind: "zone", id: zoneResult.zoneId}), "新地区必须能被对象解析器读取");
assert.equal(map.zones.metadata.zones, map.zones.zones.length);
assert.ok(createMapFeatureGeoJson(map, {layers: {zone: true}}).features.some(feature => feature.id === `zone-${zoneResult.zoneId}`), "新地区必须进入要素导出");
history.undo({map});
assert.deepEqual(snapshotZone(map), zoneBefore, "撤销必须恢复地区集合与 metadata");
history.redo({map});
assert.ok(resolveObject(map, {kind: "zone", id: zoneResult.zoneId}));
assert.equal(inspectZoneCreation(map, {...zoneOptions, id: zoneResult.zoneId}).code, "duplicate-id");
assert.equal(inspectZoneCreation(map, {packCells: findDisconnectedCells(map), type: "Disaster"}).code, "disconnected-cells");

restoreObjectNote(map, objectNote("zone", zoneResult.zoneId, "地区关联备注"));
const deleteZone = createDeleteZoneCommand(zoneResult.zoneId);
history.execute(deleteZone, {map});
assert.equal(resolveObject(map, {kind: "zone", id: zoneResult.zoneId}), null);
assert.equal(readObjectNote(map, {kind: "zone", id: zoneResult.zoneId}), null, "删除地区必须清理关联备注");
history.undo({map});
assert.ok(resolveObject(map, {kind: "zone", id: zoneResult.zoneId}));
assert.equal(readObjectNote(map, {kind: "zone", id: zoneResult.zoneId})?.body, "地区关联备注");

const markerId = 9000;
const markerPackCell = findFreeMarkerCell(map);
const markerBefore = snapshotMarker(map);
const addMarker = createAddMarkerCommand({id: markerId, type: "encounters", packCell: markerPackCell, name: "通用标记回归"});
history.execute(addMarker, {map});
assert.equal(addMarker.getCreatedMarker().category, "mystery", "通用标记不得被强制为资源类别");
assert.ok(resolveObject(map, {kind: "marker", id: markerId}), "稳定 marker id 必须能被解析");
assert.ok(createMapFeatureGeoJson(map, {layers: {marker: true}}).features.some(feature => feature.id === `marker-${markerId}`), "通用标记必须进入要素导出");
assert.equal(inspectMarkerCreation(map, {id: markerId, type: "encounters", packCell: markerPackCell}).code, "duplicate-id");
assert.equal(inspectMarkerCreation(map, {type: "encounters", packCell: -1}).code, "invalid-pack-cell");
history.undo({map});
assert.deepEqual(snapshotMarker(map), markerBefore, "撤销必须恢复 marker 集合、metadata 和备注");
history.redo({map});
assert.ok(resolveObject(map, {kind: "marker", id: markerId}));

history.execute(createSetMarkerNoteCommand(markerId, "通用标记备注"), {map});
const deleteMarker = createDeleteMarkerCommand(markerId);
history.execute(deleteMarker, {map});
assert.equal(resolveObject(map, {kind: "marker", id: markerId}), null);
assert.equal(readObjectNote(map, {kind: "marker", id: markerId}), null, "删除标记必须清理关联备注");
history.undo({map});
assert.ok(resolveObject(map, {kind: "marker", id: markerId}));
assert.equal(readObjectNote(map, {kind: "marker", id: markerId})?.body, "通用标记备注");

const notePackCell = map.pack.cells.i.find(cell => Number.isFinite(map.pack.cells.p?.[cell]?.[0]));
const noteBefore = snapshotNotes(map);
const addNote = createStandaloneNoteCommand({id: "regression", name: "独立备注回归", body: "初始正文", packCell: notePackCell});
history.execute(addNote, {map});
const noteResult = addNote.getResult();
const noteObject = {kind: "note", id: noteResult.objectId};
assert.ok(resolveObject(map, noteObject), "独立备注必须能被对象解析器读取");
const highlightVertices = buildSelectionMeshVertices(map, {scale: 1, offsetX: 0, offsetY: 0}, {width: 1000, height: 700, clientWidth: 1000, clientHeight: 700}, noteObject, null, [noteObject]);
assert.ok(highlightVertices.length > 0, "独立备注必须生成选择 / 高亮网格");
const exportedNote = createMapDocument(map, map.options).map.notes.notes.find(note => note.id === noteResult.id);
assert.deepEqual({standalone: exportedNote.standalone, packCell: exportedNote.packCell, x: exportedNote.x, y: exportedNote.y}, {
  standalone: true,
  packCell: notePackCell,
  x: noteResult.x,
  y: noteResult.y
}, "独立备注必须携带位置随完整地图导出");

const updateNote = createSetObjectNoteCommand(noteObject, "更新正文", {name: "独立备注回归"});
history.execute(updateNote, {map});
assert.equal(readObjectNote(map, noteResult.id)?.body, "更新正文");
history.undo({map});
assert.equal(readObjectNote(map, noteResult.id)?.body, "初始正文");

const deleteNote = createDeleteNoteCommand(noteResult.id);
history.execute(deleteNote, {map});
assert.equal(resolveObject(map, noteObject), null);
history.undo({map});
assert.ok(resolveObject(map, noteObject));
history.undo({map});
assert.deepEqual(snapshotNotes(map), noteBefore, "撤销独立备注创建必须恢复备注存储");

assert.equal(inspectStandaloneNoteCreation(map, {x: -1, y: 0}).code, "invalid-coordinate");
history.redo({map});
assert.equal(inspectStandaloneNoteCreation(map, {id: "regression", packCell: notePackCell}).code, "duplicate-id");
restoreObjectNote(map, {id: "note:legacy-orphan", kind: "note", objectId: "legacy-orphan", name: "旧孤儿备注", body: "缺少坐标", standalone: true});
assert.equal(resolveObject(map, {kind: "note", id: "legacy-orphan"}), null, "缺少位置的旧独立备注必须按孤儿展示而不是伪造位置");
const orphanExport = createMapDocument(map, map.options).map.notes.notes.find(note => note.id === "note:legacy-orphan");
assert.equal(orphanExport.standalone, true);
assert.equal(Number.isFinite(orphanExport.x) && Number.isFinite(orphanExport.y), false, "孤儿备注不得在完整地图导出中伪造坐标");

console.log(JSON.stringify({
  ok: true,
  zone: zoneResult,
  marker: {id: markerId, packCell: markerPackCell},
  note: {id: noteResult.id, packCell: notePackCell, highlightVertices: highlightVertices.length},
  history: history.getStats()
}, null, 2));

function findZoneOptions(targetMap) {
  const occupied = new Set((targetMap.zones?.zones || []).flatMap(zone => zone.cells || []));
  for (const centerPackCell of targetMap.pack.cells.i) {
    if (occupied.has(centerPackCell)) continue;
    const preview = inspectZoneCreation(targetMap, {centerPackCell, radius: 0, type: "Disaster", name: "回归地区"});
    if (preview.valid) return {centerPackCell, radius: 0, type: "Disaster", name: "回归地区"};
  }
  throw new Error("固定地图找不到可用地区 cell");
}

function findDisconnectedCells(targetMap) {
  const first = targetMap.pack.cells.i[0];
  const adjacent = new Set([first, ...(targetMap.pack.cells.c[first] || [])]);
  const second = targetMap.pack.cells.i.find(cell => !adjacent.has(cell));
  return [first, second];
}

function findFreeMarkerCell(targetMap) {
  const occupied = new Set((targetMap.markers?.markers || []).map(marker => marker.packCell));
  return targetMap.pack.cells.i.find(cell => !occupied.has(cell));
}

function objectNote(kind, id, body) {
  return {id: `${kind}:${id}`, kind, objectId: id, name: `${kind} #${id}`, body, format: "plain", pinned: false};
}

function snapshotZone(targetMap) {
  return clone({zones: targetMap.zones, packZones: targetMap.pack.zones});
}

function snapshotMarker(targetMap) {
  return clone({markers: targetMap.markers, packMarkers: targetMap.pack.markers, markerNotes: (targetMap.notes?.notes || []).filter(note => note.kind === "marker")});
}

function snapshotNotes(targetMap) {
  return clone(targetMap.notes);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
