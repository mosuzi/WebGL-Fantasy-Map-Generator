#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile, readdir} from "node:fs/promises";
import path from "node:path";
import {createServer} from "vite";

import {resolveCanonicalMapWriteDescriptor} from "../app/webgl-generator/src/runtime/canonical-map-field-registry.js";
import {API_METHODS, buildApiContract} from "../app/webgl-generator/src/runtime/api-contract.js";
import {buildApiMethodDescriptionRegistry} from "../app/webgl-generator/src/runtime/api-schema-registry.js";
import {HEADLESS_WRITE_METHODS} from "../app/webgl-generator/src/runtime/headless-write-api.js";
import {listWorkerTasks} from "../app/webgl-generator/src/runtime/worker-task-registry.js";

const compiledRoot = new URL("../.cache/core-manifest-test/", import.meta.url);
const {DomainManifestError, createDomainManifestRegistry} = await import(new URL("core/domain-manifest-registry.js", compiledRoot));
const {notesManifest} = await import(new URL("domains/notes/manifest.js", compiledRoot));
const {markersManifest} = await import(new URL("domains/markers/manifest.js", compiledRoot));
const {populationManifest} = await import(new URL("domains/population/manifest.js", compiledRoot));
const {foundationManifest} = await import(new URL("domains/foundation/manifest.js", compiledRoot));
const {SOCIETY_POLITICS_WRITE_SETS, societyPoliticsManifest} = await import(new URL("domains/society-politics/manifest.js", compiledRoot));

const workerTasks = new Set(listWorkerTasks());
const repoRoot = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, value => value.slice(1)));
const packageDocument = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
const regressionGates = new Set(Object.keys(packageDocument.scripts || {}));
const vite = await createServer({
  configFile: path.join(repoRoot, "vite.config.mjs"),
  server: {middlewareMode: true},
  ssr: {noExternal: ["element-plus", /@element-plus/]},
  appType: "custom",
  logLevel: "silent"
});
let apiDescriptions;
try {
  const {buildMethodMetadata} = await vite.ssrLoadModule("/src/runtime/console-api.js");
  const contract = buildApiContract(API_METHODS, buildMethodMetadata());
  apiDescriptions = buildApiMethodDescriptionRegistry(API_METHODS, contract.methodMetadata);
} finally {
  await vite.close();
}
const context = {
  resolveCanonicalPath: pathValue => resolveCanonicalMapWriteDescriptor(pathValue),
  hasWorkerTask: task => workerTasks.has(task),
  hasRegressionGate: gate => regressionGates.has(gate),
  resolveApiMethod: method => {
    const description = apiDescriptions[method];
    return description ? {
      schemaVersion: description.schemaVersion,
      businessCodes: description.businessCodes,
      documentation: true,
      metadata: description.metadata
    } : null;
  }
};
const registry = createDomainManifestRegistry(context);
for (const manifest of [notesManifest, markersManifest, populationManifest, foundationManifest, societyPoliticsManifest]) registry.register(manifest);

assert.deepEqual(registry.snapshot().ids, ["foundation", "markers", "notes", "population", "society-politics"]);
assert.equal(registry.snapshot().domains, 5);
assert.equal(registry.get("notes"), registry.list().find(manifest => manifest.id === "notes"));
assert.ok(Object.isFrozen(registry.get("notes")) && Object.isFrozen(registry.get("notes").commands));
assert.equal(registry.get("notes").capabilities.worker, "not-required");
assert.equal(registry.get("markers").layers[0].picking, true);
assert.equal(registry.get("population").workerTasks[0].id, "population.compute");
assert.equal(registry.get("population").workerTasks[0].task, "population.compute");
assert.equal(registry.get("foundation").workerTasks.length, 4);
assert.equal(registry.get("society-politics").workerTasks[0].id, "society-politics.regeneration-worker");
assert.equal(registry.get("society-politics").workerTasks[0].task, "regeneration.compute");
assert.equal(registry.snapshot().descriptors, 78);

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

const missingDependencyScope = clone(notesManifest);
delete missingDependencyScope.derivedSystems[0].scope;
expectManifestError(() => createDomainManifestRegistry(context).register(missingDependencyScope), "MANIFEST_INVALID", "manifest.derivedSystems[0].scope");

const undeclaredInvalidationRead = clone(notesManifest);
undeclaredInvalidationRead.derivedSystems[0].invalidatedBy = ["markers"];
expectManifestError(() => createDomainManifestRegistry(context).register(undeclaredInvalidationRead), "MANIFEST_INVALID", "manifest.derivedSystems[0].invalidatedBy");

const unknownDerivedVerifier = clone(notesManifest);
unknownDerivedVerifier.derivedSystems[0].verify = "regress:missing-derived-verifier";
expectManifestError(() => createDomainManifestRegistry(context).register(unknownDerivedVerifier), "MANIFEST_REFERENCE_MISSING", "notes.derivedSystems.notes.object-panels.verify");

const requiredWorkerMissing = clone(notesManifest);
requiredWorkerMissing.capabilities.worker = "required";
delete requiredWorkerMissing.capabilityReasons.worker;
expectManifestError(() => createDomainManifestRegistry(context).register(requiredWorkerMissing), "MANIFEST_CAPABILITY_MISMATCH", "notes.capabilities.worker");

const unknownWorker = clone(populationManifest);
unknownWorker.workerTasks[0].task = "population.unknown";
expectManifestError(() => createDomainManifestRegistry(context).register(unknownWorker), "MANIFEST_WORKER_TASK_UNKNOWN", "population.workerTasks.population.compute.task");

const missingWorkerTaskBinding = clone(populationManifest);
delete missingWorkerTaskBinding.workerTasks[0].task;
expectManifestError(() => createDomainManifestRegistry(context).register(missingWorkerTaskBinding), "MANIFEST_INVALID", "manifest.workerTasks[0].task");

const sharedWorkerRegistry = createDomainManifestRegistry(context);
sharedWorkerRegistry.register(societyPoliticsManifest);
const sharedWorkerManifest = clone(societyPoliticsManifest);
sharedWorkerManifest.id = "settlements-worker-test";
sharedWorkerManifest.derivedSystems = [];
sharedWorkerManifest.commands = [];
delete sharedWorkerManifest.regeneration;
sharedWorkerManifest.workerTasks[0].id = "settlements-worker-test.regeneration-worker";
sharedWorkerManifest.workerTasks[0].resultKinds = ["cities"];
sharedWorkerManifest.queries = [];
sharedWorkerManifest.views = [];
sharedWorkerManifest.capabilities.regeneration = "unsupported";
sharedWorkerManifest.capabilities.view = "not-required";
sharedWorkerManifest.capabilityReasons.regeneration = "共享 transport 的 result owner 测试不登记重生成入口。";
sharedWorkerManifest.capabilityReasons.view = "共享 transport 的 result owner 测试不登记视图。";
sharedWorkerManifest.regression.coverage = ["save", "worker", "failure"];
sharedWorkerRegistry.register(sharedWorkerManifest);
assert.equal(sharedWorkerRegistry.get("settlements-worker-test").workerTasks[0].task, "regeneration.compute");
const overlappingWorkerManifest = clone(sharedWorkerManifest);
overlappingWorkerManifest.id = "overlapping-worker-test";
overlappingWorkerManifest.workerTasks[0].id = "overlapping-worker-test.regeneration-worker";
overlappingWorkerManifest.workerTasks[0].resultKinds = ["states"];
expectManifestError(() => sharedWorkerRegistry.register(overlappingWorkerManifest), "MANIFEST_DUPLICATE_ID", "overlapping-worker-test.worker.regeneration.compute.states");
assert.equal(sharedWorkerRegistry.snapshot().domains, 2, "重叠 Worker result claim 失败后 registry 必须原子不变");
const intraManifestOverlap = clone(sharedWorkerManifest);
intraManifestOverlap.id = "intra-worker-overlap-test";
intraManifestOverlap.workerTasks.push({...clone(intraManifestOverlap.workerTasks[0]), id: "intra-worker-overlap-test.second-worker"});
expectManifestError(() => createDomainManifestRegistry(context).register(intraManifestOverlap), "MANIFEST_DUPLICATE_ID", "intra-worker-overlap-test.worker.regeneration.compute.cities");

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

const regenerationRegistry = createDomainManifestRegistry(context);
regenerationRegistry.register(markersManifest);
const duplicateRegeneration = clone(notesManifest);
duplicateRegeneration.id = "notes-two";
duplicateRegeneration.derivedSystems = [];
duplicateRegeneration.commands = [];
duplicateRegeneration.queries = [];
duplicateRegeneration.panels = [];
duplicateRegeneration.api = {methods: []};
duplicateRegeneration.regeneration = {...clone(markersManifest.regeneration), writeSet: ["notes"]};
duplicateRegeneration.capabilities.regeneration = "optional";
duplicateRegeneration.regression.coverage = ["save", "regeneration", "failure"];
expectManifestError(() => regenerationRegistry.register(duplicateRegeneration), "MANIFEST_DUPLICATE_ID", "notes-two.regeneration.markers.regenerateResources");

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
delete missingApiSchema.api.methods[0].schemaVersion;
expectManifestError(() => createDomainManifestRegistry(context).register(missingApiSchema), "MANIFEST_INVALID", "manifest.api.methods[0].schemaVersion");

const missingApiTarget = clone(notesManifest);
missingApiTarget.api.methods[0].target = "notes.missing";
expectManifestError(() => createDomainManifestRegistry(context).register(missingApiTarget), "MANIFEST_REFERENCE_MISSING", "notes.api.edit.notes.createStandalone.target");

const unknownApiMethod = clone(markersManifest);
unknownApiMethod.api.methods.at(-1).method = "generate.regenerateMarkers";
expectManifestError(() => createDomainManifestRegistry(context).register(unknownApiMethod), "MANIFEST_REFERENCE_MISSING", "markers.api.markers.regenerationApi.method");

const apiSchemaDrift = clone(notesManifest);
apiSchemaDrift.api.methods[0].schemaVersion = "9.9.9";
expectManifestError(() => createDomainManifestRegistry(context).register(apiSchemaDrift), "MANIFEST_CAPABILITY_MISMATCH", "notes.api.edit.notes.createStandalone.schemaVersion");

const apiCapabilityDrift = clone(notesManifest);
apiCapabilityDrift.api.methods[0].mutates = "none";
expectManifestError(() => createDomainManifestRegistry(context).register(apiCapabilityDrift), "MANIFEST_CAPABILITY_MISMATCH", "notes.api.edit.notes.createStandalone.capability");

const apiErrorsDrift = clone(notesManifest);
apiErrorsDrift.api.methods[0].errorCodes = apiErrorsDrift.api.methods[0].errorCodes.slice(1);
expectManifestError(() => createDomainManifestRegistry(context).register(apiErrorsDrift), "MANIFEST_CAPABILITY_MISMATCH", "notes.api.edit.notes.createStandalone.errorCodes");

const apiDocumentationDrift = clone(notesManifest);
apiDocumentationDrift.api.methods[0].documentation = "invented-documentation";
expectManifestError(() => createDomainManifestRegistry(context).register(apiDocumentationDrift), "MANIFEST_INVALID", "manifest.api.methods[0].documentation");

const missingRegressionCoverage = clone(populationManifest);
missingRegressionCoverage.regression.coverage = missingRegressionCoverage.regression.coverage.filter(item => item !== "worker");
expectManifestError(() => createDomainManifestRegistry(context).register(missingRegressionCoverage), "MANIFEST_CAPABILITY_MISMATCH", "population.regression.coverage");

const unknownCapabilityReason = clone(notesManifest);
unknownCapabilityReason.capabilityReasons.database = "不存在的能力";
expectManifestError(() => createDomainManifestRegistry(context).register(unknownCapabilityReason), "MANIFEST_INVALID", "manifest.capabilityReasons.database");

const unknownRegressionGate = clone(notesManifest);
unknownRegressionGate.regression.gates = ["regress:missing"];
expectManifestError(() => createDomainManifestRegistry(context).register(unknownRegressionGate), "MANIFEST_REFERENCE_MISSING", "notes.regression.gates.regress:missing");

for (const resolver of ["hasWorkerTask", "hasRegressionGate", "resolveApiMethod"]) {
  const incompleteContext = {...context};
  delete incompleteContext[resolver];
  expectManifestError(() => createDomainManifestRegistry(incompleteContext).register(notesManifest), "MANIFEST_INVALID", `context.${resolver}`);
}

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
  ]),
  societyPolitics: await joinSources([
    "app/webgl-generator/src/runtime/regeneration-worker-task.js",
    "app/webgl-generator/src/runtime/app.js",
    "app/webgl-generator/src/generator/settlements.js",
    "app/webgl-generator/src/generator/ocean-current-world.js"
  ])
};
for (const token of ["createStandaloneNoteCommand", "createDeleteNoteCommand", "createImportNotesCommand", "createSetObjectNoteCommand", "edit.notes.createStandalone", "createNotesPanel"]) assert.ok(evidence.notes.includes(token), `notes shadow evidence 缺少 ${token}`);
for (const token of ["createAddMarkerCommand", "createDeleteMarkerCommand", "createMoveMarkerCommand", "createSetMarkerNoteCommand", "createSetMarkerVisualCommand", "createRegenerateResourceMarkersCommand", "edit.markers.add", "createMarkerPanel"]) assert.ok(evidence.markers.includes(token), `markers shadow evidence 缺少 ${token}`);
for (const token of ["POPULATION_WORKER_TASK", "population.compute", "kind: \"population\"", "getPopulationWorkerPatchPolicy", "edit.population.applyAdjustment", "createPopulationPanel"]) assert.ok(evidence.population.includes(token), `population shadow evidence 缺少 ${token}`);
for (const pathValue of populationManifest.workerTasks[0].writeSet) assert.ok(evidence.population.includes(`\"${pathValue}\"`), `population Worker 源码未声明 ${pathValue}`);
for (const token of ["regeneration.compute", "getRegenerationPatchPolicy", "validateSocietyPoliticsWorkerOutput", "repairInconsistentProvincialCapitals"]) assert.ok(evidence.societyPolitics.includes(token), `society-politics evidence 缺少 ${token}`);
for (const [kind, writeSet] of Object.entries(SOCIETY_POLITICS_WRITE_SETS)) for (const pathValue of writeSet) {
  assert.ok(evidence.societyPolitics.includes(`\"${pathValue}\"`), `${kind} Worker 源码未声明 ${pathValue}`);
  assert.ok(societyPoliticsManifest.regeneration.writeSet.includes(pathValue), `${kind} 写集未纳入 manifest union: ${pathValue}`);
}
assert.ok(markersManifest.commands.find(command => command.id === "markers.delete").writeSet.includes("notes"), "markers.delete 必须覆盖真实备注删除写集");

const headlessMethods = new Set(HEADLESS_WRITE_METHODS);
for (const manifest of [notesManifest, markersManifest, populationManifest, societyPoliticsManifest]) {
  for (const descriptor of [...manifest.commands, ...(manifest.queries || [])]) {
    const api = manifest.api?.methods.find(method => method.target === descriptor.id);
    if (!api) continue;
    assert.equal(descriptor.profiles.includes("headless"), headlessMethods.has(api.method), `${manifest.id}.${descriptor.id} headless profile 与真实 registry 漂移`);
  }
}

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
  workerTasksVerified: ["population.compute", "regeneration.compute"],
  runtimeRouteImports: 0,
  sharedWorkerTransport: {task: "regeneration.compute", owners: ["society-politics", "settlements-worker-test"], overlappingResultRejected: "states"},
  negativeCases: 35
}, null, 2));

async function joinSources(files) {
  return (await Promise.all(files.map(file => readFile(path.join(repoRoot, file), "utf8")))).join("\n");
}
