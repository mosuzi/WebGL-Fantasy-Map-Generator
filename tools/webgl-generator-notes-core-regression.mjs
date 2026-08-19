#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createServer} from "vite";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {MapRevisionTracker} from "../app/webgl-generator/src/runtime/map-revision.js";
import {createDeleteNoteCommand, createStandaloneNoteCommand} from "../app/webgl-generator/src/runtime/note-edit-commands.js";
import {createDeleteNotesBatchCommand, createImportNotesCommand, NOTES_SUMMARY_TYPE, NOTES_SUMMARY_VERSION} from "../app/webgl-generator/src/runtime/note-import.js";
import {createSetObjectNoteCommand} from "../app/webgl-generator/src/runtime/object-edit-commands.js";
import {createMapDocument, parseMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vite = await createServer({
  configFile: false,
  root: path.join(repoRoot, "app/webgl-generator"),
  server: {middlewareMode: true},
  appType: "custom",
  logLevel: "error"
});

try {
  const {createNotesDomainRuntime, NOTES_COMMAND_IDS} = await vite.ssrLoadModule("/src/domains/notes/runtime.ts");
  const {notesManifest} = await vite.ssrLoadModule("/src/domains/notes/manifest.ts");
  const map = createFixtureMap();
  const tracker = new MapRevisionTracker({identityFactory: () => "notes-runtime-session"});
  tracker.replaceMap();
  const history = new EditHistory({
    onMutation: () => tracker.advance(),
    onSnapshot: () => tracker.createSnapshot(),
    onRestore: snapshot => tracker.restoreSnapshot(snapshot)
  });
  let operationSequence = 0;
  let commitSequence = 0;
  const runtime = createNotesDomainRuntime({
    getMap: () => map,
    getLegacyRevision: () => tracker.getSnapshot(),
    getHistoryFingerprint: () => JSON.stringify(history.getStats({affectedLimit: 50})),
    createOperationId: () => `notes-regression-operation-${++operationSequence}`,
    createTransactionId: () => `notes-regression-transaction-${operationSequence}`,
    createCommitId: () => `notes-regression-commit-${++commitSequence}`
  });

  assert.equal(notesManifest.status, "active");
  assert.deepEqual([...NOTES_COMMAND_IDS], ["notes.createStandalone", "notes.set", "notes.delete", "notes.import", "notes.deleteBatch"]);
  assert.equal(notesManifest.workerTasks, undefined);
  assert.equal(notesManifest.regeneration, undefined);
  assert.equal(notesManifest.layers, undefined);

  const createCommand = createStandaloneNoteCommand({id: "core", name: "核心备注", body: "初始正文", packCell: 1});
  let legacyCreateResult;
  const createResult = runtime.executeCommand({
    commandId: "notes.createStandalone",
    command: createCommand,
    source: "api",
    execute: () => (legacyCreateResult = executeLegacy(history, map, createCommand))
  });
  assert.equal(createResult, legacyCreateResult, "adapter 必须保持既有 API execution result 引用与形状");
  assert.equal(tracker.getSnapshot().mapRevision, 1);
  assert.equal(history.getStats().undo, 1);
  assert.equal(runtime.get("note:core").body, "初始正文");
  assert.equal(runtime.getLastCommit().lifecycle, "projections-settled");
  assert.deepEqual(runtime.getLastCommit().writeSet, ["notes"]);
  assert.equal(runtime.getLastCommit().projections.every(item => item.state === "ready"), true);

  const detachedList = runtime.list();
  assert.throws(() => {
    detachedList[0].body = "外部篡改";
  }, TypeError, "query snapshot 必须拒绝外部篡改");
  assert.equal(runtime.get("note:core").body, "初始正文", "query 结果必须与 canonical owner 脱离");

  const setCommand = createSetObjectNoteCommand({kind: "note", id: "core"}, "更新正文", {name: "核心备注"});
  runtime.executeCommand({commandId: "notes.set", command: setCommand, execute: () => executeLegacy(history, map, setCommand)});
  assert.equal(runtime.get("note:core").body, "更新正文");
  assert.equal(tracker.getSnapshot().mapRevision, 2);

  const undoCommand = history.peek("undo");
  assert.equal(runtime.ownsCommand(undoCommand), true);
  runtime.executeHistory({action: "undo", command: undoCommand, execute: () => executeLegacyHistory(history, map, "undo")});
  assert.equal(runtime.get("note:core").body, "初始正文");
  assert.equal(tracker.getSnapshot().mapRevision, 3, "undo 必须产生新的单调 revision");
  const redoCommand = history.peek("redo");
  runtime.executeHistory({action: "redo", command: redoCommand, execute: () => executeLegacyHistory(history, map, "redo")});
  assert.equal(runtime.get("note:core").body, "更新正文");
  assert.equal(tracker.getSnapshot().mapRevision, 4, "redo 必须产生新的单调 revision");

  const deleteCommand = createDeleteNoteCommand("note:core");
  runtime.executeCommand({commandId: "notes.delete", command: deleteCommand, execute: () => executeLegacy(history, map, deleteCommand)});
  assert.equal(runtime.get("note:core"), null);
  runtime.executeHistory({action: "undo", command: history.peek("undo"), execute: () => executeLegacyHistory(history, map, "undo")});
  assert.equal(runtime.get("note:core").body, "更新正文");

  const importDocument = {
    type: NOTES_SUMMARY_TYPE,
    version: NOTES_SUMMARY_VERSION,
    notes: [{
      id: "note:imported",
      kind: "note",
      objectId: "imported",
      name: "导入备注",
      body: "导入正文",
      format: "plain",
      standalone: true,
      packCell: 0,
      x: 0,
      y: 0
    }]
  };
  const importCommand = createImportNotesCommand(importDocument, {mode: "append"});
  runtime.executeCommand({commandId: "notes.import", command: importCommand, execute: () => executeLegacy(history, map, importCommand)});
  assert.equal(runtime.get("note:imported").body, "导入正文");

  const batchCommand = createDeleteNotesBatchCommand(["note:core", "note:imported"]);
  runtime.executeCommand({commandId: "notes.deleteBatch", command: batchCommand, execute: () => executeLegacy(history, map, batchCommand)});
  assert.equal(runtime.list().length, 0);
  runtime.executeHistory({action: "undo", command: history.peek("undo"), execute: () => executeLegacyHistory(history, map, "undo")});
  assert.equal(runtime.list().length, 2);

  const persistence = runtime.persistenceSnapshot();
  const saved = createMapDocument(map, map.options);
  assert.deepEqual(saved.map.notes, persistence, "notes core persistence snapshot 必须与正式 save 同源");
  const roundtrip = parseMapDocument(stringifyMapDocument(saved));
  assert.deepEqual(roundtrip.map.notes, persistence, "notes save / load roundtrip 必须保持 core snapshot");

  const beforeFailureRevision = tracker.getSnapshot().mapRevision;
  const beforeFailureHistory = history.getStats();
  const beforeFailureNotes = runtime.persistenceSnapshot();
  const duplicateCommand = createStandaloneNoteCommand({id: "core", packCell: 1});
  assert.throws(() => runtime.executeCommand({
    commandId: "notes.createStandalone",
    command: duplicateCommand,
    execute: () => executeLegacy(history, map, duplicateCommand)
  }), error => error?.code === "duplicate-id");
  assert.equal(tracker.getSnapshot().mapRevision, beforeFailureRevision);
  assert.deepEqual(history.getStats(), beforeFailureHistory);
  assert.deepEqual(runtime.persistenceSnapshot(), beforeFailureNotes);
  assert.equal(commitSequence, 9, "invalid / no-op 不得产生 commitId");

  const oldDocumentText = await readFile(path.join(repoRoot, "tools/fixtures/webgl-map-v1-minimal.json"), "utf8");
  const oldMap = parseMapDocument(oldDocumentText).map;
  assert.deepEqual(oldMap.notes, {
    notes: [{id: "state:1", kind: "state", objectId: 1, name: "旧样本备注", body: "保留正文"}],
    metadata: {notes: 1, formatVersion: 1}
  }, "旧地图 notes 保留 / backfill 漂移");

  const appSource = await readFile(path.join(repoRoot, "app/webgl-generator/src/runtime/app.js"), "utf8");
  const consoleApiSource = await readFile(path.join(repoRoot, "app/webgl-generator/src/runtime/console-api.js"), "utf8");
  const panelSource = await readFile(path.join(repoRoot, "app/webgl-generator/src/ui/panels/notes-panel.js"), "utf8");
  assert.match(appSource, /createNotesDomainRuntime/u);
  for (const commandId of NOTES_COMMAND_IDS) assert.match(appSource, new RegExp(`executeNotesDomainCommand\\(state, "${escapeRegExp(commandId)}"`, "u"));
  assert.match(appSource, /state\.notesDomain\.executeHistory/u);
  assert.match(appSource, /listNotes: \(\) => state\.notesDomain/u);
  assert.equal((appSource.match(/createSetObjectNoteCommand\(/gu) || []).length, 1, "领域面板不得绕过正式 notes.set API");
  assert.match(appSource, /object\?\.kind === OBJECT_KIND\.NOTE\) executeNotesDomainCommand\(state, "notes\.set"/u);
  assert.match(appSource, /row\.object\.kind === OBJECT_KIND\.NOTE\) executeNotesDomainCommand\(state, "notes\.set"/u);
  assert.match(consoleApiSource, /state\.notesDomain\?\.list/u);
  assert.match(panelSource, /callbacks\.listNotes/u);

  console.log(JSON.stringify({
    ok: true,
    manifest: notesManifest.status,
    commands: NOTES_COMMAND_IDS,
    commits: commitSequence,
    revision: tracker.getSnapshot().mapRevision,
    history: history.getStats(),
    notes: runtime.list().length,
    lifecycle: runtime.getLastCommit().lifecycle,
    projections: runtime.getLastCommit().projections,
    oldDataBackfill: oldMap.notes.metadata.formatVersion,
    browserRuns: 0
  }, null, 2));
} finally {
  await vite.close();
}

function executeLegacy(history, map, command) {
  const context = {map};
  if (command.isNoop?.(context)) return {executed: false, command, result: null, error: null};
  const executed = history.execute(command, context);
  return {executed: true, command: executed, result: executed.getResult?.() ?? null, error: null};
}

function executeLegacyHistory(history, map, action) {
  const command = action === "redo" ? history.redo({map}) : history.undo({map});
  return {executed: Boolean(command), action, command, label: command?.label || "", history: history.getStats()};
}

function createFixtureMap() {
  return {
    metadata: {name: "notes-core", seed: "notes-core", graphWidth: 100, graphHeight: 100, checksum: "notes-core"},
    options: {mapName: "notes-core", seed: "notes-core", cellsTarget: 2},
    grid: {cells: {i: new Uint16Array([0, 1])}},
    pack: {cells: {i: new Uint16Array([0, 1]), p: [[0, 0], [50, 50]]}},
    notes: {notes: [], metadata: {notes: 0, formatVersion: 1}}
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
