#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createDeleteNotesBatchCommand, createImportNotesCommand, inspectNotesImport, NOTES_SUMMARY_TYPE, NOTES_SUMMARY_VERSION} from "../app/webgl-generator/src/runtime/note-import.js";

const map = createMap();
const originalNotes = clone(map.notes);
const consoleApiSource = readFileSync(new URL("../app/webgl-generator/src/runtime/console-api.js", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8");
const notesPanelSource = readFileSync(new URL("../app/webgl-generator/src/ui/vue/components/NotesPanel.vue", import.meta.url), "utf8");
const notesPanelWrapperSource = readFileSync(new URL("../app/webgl-generator/src/ui/panels/notes-panel.js", import.meta.url), "utf8");
assert.match(consoleApiSource, /format: note\.format \|\| "plain",\s*pinned: Boolean\(note\.pinned\)/, "备注摘要导出缺少持久格式或 pinned 字段");
assert.match(consoleApiSource, /notes\.import[\s\S]*notes\.deleteBatch/, "控制台 API 缺少备注导入或批量删除");
assert.match(appSource, /import: \(document, options = \{\}\) => importNotesViaApi[\s\S]*deleteBatch: \(noteIds, options = \{\}\) => deleteNotesBatchViaApi/, "备注 UI/API 没有共用运行时 action");
assert.match(appSource, /onImportPreview:[\s\S]*runtimeActions\.edit\.notes\.import[\s\S]*onDeleteBatch:[\s\S]*runtimeActions\.edit\.notes\.deleteBatch/, "备注面板没有接入公共导入或批量删除 action");
assert.match(notesPanelSource, /select-orphans[\s\S]*delete-batch/, "备注面板缺少只选孤儿或批量删除动作");
assert.match(notesPanelSource, /备注导入影响[\s\S]*onConfirmImport/, "备注面板缺少导入影响确认区");
assert.match(notesPanelWrapperSource, /pendingImportFile[\s\S]*onCancelImport/, "备注面板缺少可取消的待导入文件状态");
const exportedDocument = {
  type: NOTES_SUMMARY_TYPE,
  version: NOTES_SUMMARY_VERSION,
  notes: originalNotes.notes.map(clone)
};
assert.equal(exportedDocument.type, "webgl-generator-notes-summary");
assert.equal(exportedDocument.version, 1);
assert.equal(exportedDocument.notes[0].format, "plain");
assert.equal(exportedDocument.notes[0].pinned, true);

const roundtripMap = createMap();
roundtripMap.notes.notes = [];
roundtripMap.notes.metadata.notes = 0;
const roundtripHistory = new EditHistory();
const roundtripCommand = createImportNotesCommand(exportedDocument, {mode: "replace"});
roundtripHistory.execute(roundtripCommand, {map: roundtripMap});
assert.deepEqual(persistedNotes(roundtripMap.notes.notes), persistedNotes(originalNotes.notes), "当前备注摘要必须无损导回持久字段");

const mixedDocument = {
  type: "webgl-generator-notes-summary",
  version: 1,
  notes: [
    {...exportedDocument.notes[0], body: "导入后的国家正文"},
    note("state:999", "state", 999, "孤儿备注", "对象已经缺失"),
    note("state:999", "state", 999, "重复孤儿", "重复 id"),
    {kind: "state", objectId: 2, body: "缺少 id"}
  ]
};
const beforePreview = clone(map);
const preview = inspectNotesImport(mixedDocument, map, {mode: "append"});
assert.equal(preview.canImport, true);
assert.equal(preview.valid, 2);
assert.equal(preview.invalid, 2);
assert.equal(preview.duplicateIds, 1);
assert.equal(preview.missingObjects, 1);
assert.equal(preview.existingConflicts, 1);
assert(preview.diagnostics.some(item => item.code === "duplicate-id"));
assert(preview.diagnostics.some(item => item.code === "missing-object" && item.severity === "warning"));
assert.deepEqual(map, beforePreview, "预检不得修改地图");

const badVersion = inspectNotesImport({...mixedDocument, version: 2}, map, {mode: "replace"});
assert.equal(badVersion.canImport, false);
assert.equal(badVersion.diagnostics[0].code, "unsupported-version");
assert.deepEqual(map, beforePreview, "坏版本预检不得修改地图");

const history = new EditHistory();
const importCommand = createImportNotesCommand(mixedDocument, {mode: "append"});
history.execute(importCommand, {map});
assert.equal(history.getStats().undo, 1, "混合记录导入只能形成一条历史");
assert.equal(map.notes.notes.find(item => item.id === "state:1").body, "导入后的国家正文");
assert.equal(map.notes.notes.some(item => item.id === "state:999"), true);
assert.equal(map.notes.metadata.notes, 3);
history.undo({map});
assert.deepEqual(map.notes, originalNotes, "撤销备注导入必须恢复完整存储");
history.redo({map});
assert.equal(map.notes.notes.length, 3);

const orphanIds = ["state:404", "state:999"];
const beforeBatchDelete = clone(map.notes);
const deleteCommand = createDeleteNotesBatchCommand(orphanIds);
history.execute(deleteCommand, {map});
assert.equal(history.getStats().undo, 2, "批量删除只能新增一条历史");
assert.equal(map.notes.notes.some(item => orphanIds.includes(item.id)), false);
history.undo({map});
assert.deepEqual(map.notes, beforeBatchDelete, "撤销批量删除必须恢复完整存储、顺序和元数据");
history.redo({map});
assert.equal(map.notes.notes.some(item => orphanIds.includes(item.id)), false);

const legacyMap = createMap();
delete legacyMap.notes;
const legacyHistory = new EditHistory();
const legacyDocument = {type: "webgl-generator-notes-summary", version: 1, notes: [note("state:1", "state", 1, "旧图导入", "兼容正文")]};
legacyHistory.execute(createImportNotesCommand(legacyDocument), {map: legacyMap});
assert.equal(legacyMap.notes.notes.length, 1);
legacyHistory.undo({map: legacyMap});
assert.equal(Object.prototype.hasOwnProperty.call(legacyMap, "notes"), false, "旧图撤销导入后不得伪造原本不存在的存储");

console.log(JSON.stringify({
  ok: true,
  roundtrip: exportedDocument.notes.length,
  preview: {
    valid: preview.valid,
    invalid: preview.invalid,
    duplicateIds: preview.duplicateIds,
    missingObjects: preview.missingObjects,
    existingConflicts: preview.existingConflicts
  },
  importHistory: history.getStats(),
  legacyUndoRestoredMissingStore: !Object.prototype.hasOwnProperty.call(legacyMap, "notes")
}, null, 2));

function createMap() {
  return {
    metadata: {seed: "note-import-regression", checksum: "note-regression", graphWidth: 1440, graphHeight: 960},
    notes: {
      notes: [
        {...note("state:1", "state", 1, "现存国家", "原国家正文"), pinned: true},
        note("state:404", "state", 404, "旧孤儿", "旧孤儿正文")
      ],
      metadata: {notes: 2, formatVersion: 1}
    },
    politics: {states: [null, {i: 1, id: 1, name: "现存国家", fullName: "现存国家", capital: 0, culture: 0, religion: 0, center: 0}], provinces: []},
    society: {cultures: [{name: "混合"}], religions: [{name: "混合"}]},
    settlements: {cities: [], routes: []},
    pack: {cells: {i: [0], p: [[720, 480]]}, burgs: []},
    markers: {markers: []},
    rivers: {rivers: []},
    labels: {custom: []}
  };
}

function note(id, kind, objectId, name, body) {
  return {
    id,
    kind,
    objectId,
    name,
    body,
    format: "plain",
    pinned: false,
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T01:00:00.000Z"
  };
}

function persistedNotes(notes) {
  return notes.map(item => ({
    id: item.id,
    kind: item.kind,
    objectId: item.objectId,
    name: item.name,
    body: item.body,
    format: item.format,
    pinned: item.pinned,
    standalone: item.standalone,
    packCell: item.packCell,
    x: item.x,
    y: item.y,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  }));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
