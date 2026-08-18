#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile, readdir} from "node:fs/promises";
import path from "node:path";

import {resolveCanonicalMapWriteDescriptor} from "../app/webgl-generator/src/runtime/canonical-map-field-registry.js";
import {API_METHODS} from "../app/webgl-generator/src/runtime/api-contract.js";
import {listWorkerTasks} from "../app/webgl-generator/src/runtime/worker-task-registry.js";

const compiledRoot = new URL("../.cache/core-manifest-test/", import.meta.url);
const {DomainManifestError, createDomainManifestRegistry} = await import(new URL("core/domain-manifest-registry.js", compiledRoot));
const {notesManifest} = await import(new URL("domains/notes/manifest.js", compiledRoot));
const {markersManifest} = await import(new URL("domains/markers/manifest.js", compiledRoot));
const {populationManifest} = await import(new URL("domains/population/manifest.js", compiledRoot));

const workerTasks = new Set(listWorkerTasks());
const repoRoot = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, value => value.slice(1)));
const packageDocument = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
const regressionGates = new Set(Object.keys(packageDocument.scripts || {}));
const apiMethods = new Set(Object.entries(API_METHODS).flatMap(([namespace, methods]) => methods.map(method => `${namespace}.${method}`)));
const context = {
  resolveCanonicalPath: pathValue => resolveCanonicalMapWriteDescriptor(pathValue),
  hasWorkerTask: task => workerTasks.has(task),
  hasRegressionGate: gate => regressionGates.has(gate),
  hasApiMethod: method => apiMethods.has(method)
};
const registry = createDomainManifestRegistry(context);
for (const manifest of [notesManifest, markersManifest, populationManifest]) registry.register(manifest);

assert.deepEqual(registry.snapshot().ids, ["markers", "notes", "population"]);
assert.equal(registry.snapshot().domains, 3);
assert.equal(registry.get("notes"), registry.list().find(manifest => manifest.id === "notes"));
assert.ok(Object.isFrozen(registry.get("notes")) && Object.isFrozen(registry.get("notes").commands));
assert.equal(registry.get("notes").capabilities.worker, "not-required");
assert.equal(registry.get("markers").layers[0].picking, true);
assert.equal(registry.get("population").workerTasks[0].id, "population.compute");

function expectManifestError(callback, code, pathValue) {
  assert.throws(callback, error => {
    assert.ok(error instanceof DomainManifestError);
    assert.equal(error.code, code);
    assert.equal(error.path, pathValue);
    return true;
  });
}

const clone = value => structuredClone(value);
const missingPersistence = clone(notesManifest);
delete missingPersistence.persistence;
expectManifestError(() => createDomainManifestRegistry(context).register(missingPersistence), "MANIFEST_INVALID", "manifest.persistence");

const unknownField = clone(notesManifest);
unknownField.canonicalSections = ["unknown.section"];
expectManifestError(() => createDomainManifestRegistry(context).register(unknownField), "MANIFEST_FIELD_UNREGISTERED", "manifest.canonicalSections.unknown.section");

const emptyWriteSet = clone(notesManifest);
emptyWriteSet.commands[0].writeSet = [];
expectManifestError(() => createDomainManifestRegistry(context).register(emptyWriteSet), "MANIFEST_INVALID", "manifest.commands[0].writeSet");

const requiredWorkerMissing = clone(notesManifest);
requiredWorkerMissing.capabilities.worker = "required";
delete requiredWorkerMissing.capabilityReasons.worker;
expectManifestError(() => createDomainManifestRegistry(context).register(requiredWorkerMissing), "MANIFEST_CAPABILITY_MISMATCH", "notes.capabilities.worker");

const unknownWorker = clone(populationManifest);
unknownWorker.workerTasks[0].id = "population.unknown";
expectManifestError(() => createDomainManifestRegistry(context).register(unknownWorker), "MANIFEST_WORKER_TASK_UNKNOWN", "population.workerTasks.population.unknown");

const layerWrites = clone(markersManifest);
layerWrites.layers[0].writes = ["markers"];
expectManifestError(() => createDomainManifestRegistry(context).register(layerWrites), "MANIFEST_INVALID", "manifest.layers[0].writes");

const missingPanelCommand = clone(notesManifest);
missingPanelCommand.panels[0].commands = ["notes.missing"];
expectManifestError(() => createDomainManifestRegistry(context).register(missingPanelCommand), "MANIFEST_REFERENCE_MISSING", "notes.panels.notes.panel.commands");

const duplicateRegistry = createDomainManifestRegistry(context);
duplicateRegistry.register(notesManifest);
expectManifestError(() => duplicateRegistry.register(notesManifest), "MANIFEST_DUPLICATE_ID", "manifest.notes");

const atomicRegistry = createDomainManifestRegistry(context);
atomicRegistry.register(notesManifest);
const collidingMarkers = clone(markersManifest);
collidingMarkers.commands[4].id = "notes.set";
collidingMarkers.panels[0].commands[4] = "notes.set";
collidingMarkers.api.methods[4].target = "notes.set";
expectManifestError(() => atomicRegistry.register(collidingMarkers), "MANIFEST_DUPLICATE_ID", "markers.command.notes.set");
assert.deepEqual(atomicRegistry.snapshot(), {domains: 1, ids: ["notes"], descriptors: 14});

const hiddenLayer = clone(notesManifest);
hiddenLayer.layers = [{...clone(markersManifest.layers[0]), reads: ["notes"]}];
expectManifestError(() => createDomainManifestRegistry(context).register(hiddenLayer), "MANIFEST_CAPABILITY_MISMATCH", "notes.capabilities.renderLayer");

const missingRegenerationLock = clone(markersManifest);
delete missingRegenerationLock.regeneration.lockPolicy;
expectManifestError(() => createDomainManifestRegistry(context).register(missingRegenerationLock), "MANIFEST_INVALID", "manifest.regeneration.lockPolicy");

const missingWorkerResult = clone(populationManifest);
missingWorkerResult.workerTasks[0].resultKinds = [];
expectManifestError(() => createDomainManifestRegistry(context).register(missingWorkerResult), "MANIFEST_INVALID", "manifest.workerTasks[0].resultKinds");

const missingWorkerPatch = clone(populationManifest);
delete missingWorkerPatch.workerTasks[0].patchPolicy;
expectManifestError(() => createDomainManifestRegistry(context).register(missingWorkerPatch), "MANIFEST_INVALID", "manifest.workerTasks[0].patchPolicy");

const missingBackfill = clone(notesManifest);
delete missingBackfill.persistence.backfill;
expectManifestError(() => createDomainManifestRegistry(context).register(missingBackfill), "MANIFEST_INVALID", "manifest.persistence.backfill");

const missingApiSchema = clone(notesManifest);
delete missingApiSchema.api.methods[0].schema;
expectManifestError(() => createDomainManifestRegistry(context).register(missingApiSchema), "MANIFEST_INVALID", "manifest.api.methods[0].schema");

const missingApiTarget = clone(notesManifest);
missingApiTarget.api.methods[0].target = "notes.missing";
expectManifestError(() => createDomainManifestRegistry(context).register(missingApiTarget), "MANIFEST_REFERENCE_MISSING", "notes.api.edit.notes.createStandalone.target");

const unknownApiMethod = clone(markersManifest);
unknownApiMethod.api.methods.at(-1).method = "generate.regenerateMarkers";
expectManifestError(() => createDomainManifestRegistry(context).register(unknownApiMethod), "MANIFEST_REFERENCE_MISSING", "markers.api.markers.regenerationApi.method");

const missingRegressionCoverage = clone(populationManifest);
missingRegressionCoverage.regression.coverage = missingRegressionCoverage.regression.coverage.filter(item => item !== "worker");
expectManifestError(() => createDomainManifestRegistry(context).register(missingRegressionCoverage), "MANIFEST_CAPABILITY_MISMATCH", "population.regression.coverage");

const unknownCapabilityReason = clone(notesManifest);
unknownCapabilityReason.capabilityReasons.database = "不存在的能力";
expectManifestError(() => createDomainManifestRegistry(context).register(unknownCapabilityReason), "MANIFEST_INVALID", "manifest.capabilityReasons.database");

const evidence = {
  notes: await joinSources([
    "app/webgl-generator/src/runtime/note-edit-commands.js",
    "app/webgl-generator/src/runtime/note-import.js",
    "app/webgl-generator/src/runtime/object-edit-commands.js",
    "app/webgl-generator/src/runtime/console-api.js",
    "app/webgl-generator/src/ui/panels/notes-panel.js"
  ]),
  markers: await joinSources([
    "app/webgl-generator/src/runtime/marker-edit-commands.js",
    "app/webgl-generator/src/runtime/console-api.js",
    "app/webgl-generator/src/ui/panels/marker-panel.js"
  ]),
  population: await joinSources([
    "app/webgl-generator/src/runtime/population-worker-task.js",
    "app/webgl-generator/src/runtime/console-api.js",
    "app/webgl-generator/src/ui/panels/population-panel.js"
  ])
};
for (const token of ["createStandaloneNoteCommand", "createDeleteNoteCommand", "createImportNotesCommand", "createSetObjectNoteCommand", "edit.notes.createStandalone", "createNotesPanel"]) assert.ok(evidence.notes.includes(token), `notes shadow evidence 缺少 ${token}`);
for (const token of ["createAddMarkerCommand", "createDeleteMarkerCommand", "createMoveMarkerCommand", "createSetMarkerNoteCommand", "createSetMarkerVisualCommand", "createRegenerateResourceMarkersCommand", "edit.markers.add", "createMarkerPanel"]) assert.ok(evidence.markers.includes(token), `markers shadow evidence 缺少 ${token}`);
for (const token of ["POPULATION_WORKER_TASK", "population.compute", "kind: \"population\"", "getPopulationWorkerPatchPolicy", "edit.population.applyAdjustment", "createPopulationPanel"]) assert.ok(evidence.population.includes(token), `population shadow evidence 缺少 ${token}`);
for (const pathValue of populationManifest.workerTasks[0].writeSet) assert.ok(evidence.population.includes(`\"${pathValue}\"`), `population Worker 源码未声明 ${pathValue}`);

const runtimeDir = path.join(repoRoot, "app/webgl-generator/src/runtime");
const runtimeEntries = await readdir(runtimeDir, {recursive: true, withFileTypes: true});
const runtimeFiles = runtimeEntries.filter(entry => entry.isFile() && entry.name.endsWith(".js"));
for (const entry of runtimeFiles) {
  const filename = path.join(entry.parentPath || entry.path, entry.name);
  const text = await readFile(filename, "utf8");
  assert.doesNotMatch(text, /core\/domain-manifest-registry|domains\/(?:notes|markers|population)\/manifest/u, `${filename} 不得在 shadow 阶段接入运行路由`);
}

console.log(JSON.stringify({
  ok: true,
  registry: registry.snapshot(),
  domains: registry.list().map(manifest => ({id: manifest.id, status: manifest.status, capabilities: manifest.capabilities})),
  workerTaskVerified: "population.compute",
  runtimeRouteImports: 0,
  negativeCases: 19
}, null, 2));

async function joinSources(files) {
  return (await Promise.all(files.map(file => readFile(path.join(repoRoot, file), "utf8")))).join("\n");
}
