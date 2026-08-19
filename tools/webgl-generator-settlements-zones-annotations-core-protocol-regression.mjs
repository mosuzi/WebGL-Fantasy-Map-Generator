#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createServer} from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vite = await createServer({configFile: false, root: path.join(repoRoot, "app/webgl-generator"), server: {middlewareMode: true}, appType: "custom", logLevel: "error"});

try {
  const {validateSettlementZoneWorkerOutput} = await vite.ssrLoadModule("/src/domains/settlements/worker-runtime.ts");
  const {SETTLEMENTS_WORKER_WRITE_SET, settlementsManifest} = await vite.ssrLoadModule("/src/domains/settlements/manifest.ts");
  const {ZONES_WORKER_WRITE_SET, zonesManifest} = await vite.ssrLoadModule("/src/domains/zones/manifest.ts");
  const {labelsManifest} = await vite.ssrLoadModule("/src/domains/labels/manifest.ts");
  const {measurementsManifest} = await vite.ssrLoadModule("/src/domains/measurements/manifest.ts");
  const {generatePlaceholderMap} = await vite.ssrLoadModule("/src/generator/index.js");
  const {createFoundationWorkerBinding} = await vite.ssrLoadModule("/src/domains/foundation/worker-runtime.ts");
  const {runRegenerationWorkerTask, getRegenerationPatchPolicy} = await vite.ssrLoadModule("/src/runtime/regeneration-worker-task.js");
  const {createDomainPatchCommand} = await vite.ssrLoadModule("/src/runtime/domain-patch.js");
  const {MapRevisionTracker} = await vite.ssrLoadModule("/src/runtime/map-revision.js");
  const {EditHistory} = await vite.ssrLoadModule("/src/runtime/edit-history.js");
  const {createAddCustomLabelCommand, createSetLabelNoteCommand} = await vite.ssrLoadModule("/src/runtime/label-edit-commands.js");
  const {createImportMeasurementsCommand, createSaveMeasurementCommand} = await vite.ssrLoadModule("/src/runtime/measurement-edit-commands.js");

  assert.equal(settlementsManifest.workerTasks[0].task, "regeneration.compute");
  assert.equal(zonesManifest.workerTasks[0].task, "regeneration.compute");
  assert.deepEqual(settlementsManifest.workerTasks[0].resultKinds, ["cities"]);
  assert.deepEqual(zonesManifest.workerTasks[0].resultKinds, ["zones"]);
  assert.equal(labelsManifest.capabilities.worker, "not-required");
  assert.equal(measurementsManifest.capabilities.regeneration, "unsupported");

  const owner = new MapRevisionTracker({identityFactory: () => "settlement-zone-map"});
  owner.replaceMap();
  owner.advance();
  const binding = createFoundationWorkerBinding({
    revision: owner.getCoreSnapshot(), generationToken: 5, lockFingerprint: "settlement-zone-locks",
    operation: {id: 23, name: "settlement-zone-regression"}
  });
  const outputs = {};
  for (const kind of ["cities", "zones"]) {
    const sourceMap = generatePlaceholderMap({seed: `settlement-zone-${kind}`, cellsTarget: 2000, heightmapTemplate: "continents"});
    const output = await runRegenerationWorkerTask({map: sourceMap, kind}, {binding, checkpoint() {}, report() {}});
    const policy = getRegenerationPatchPolicy(kind);
    const validated = validateSettlementZoneWorkerOutput({kind, binding, output, policy});
    const expected = kind === "zones" ? ZONES_WORKER_WRITE_SET.filter(pathValue => pathValue !== "zones.metadata.stale") : SETTLEMENTS_WORKER_WRITE_SET;
    assert.deepEqual([...validated.writeSet].sort(), [...expected].sort(), `${kind} 实际 patch 写集不符合领域契约`);
    assert.equal(validated.binding.sourceRevision.topologyRevision, 1, `${kind} core binding 丢失 topology revision`);
    outputs[kind] = {sourceMap, output, policy};
  }

  const stale = structuredClone(outputs.cities.output);
  stale.binding.topologyRevision += 1;
  assertProtocol(() => validateSettlementZoneWorkerOutput({kind: "cities", binding, output: stale, policy: outputs.cities.policy}), "settlement-zone-worker-binding-stale");

  const partial = structuredClone(outputs.cities.output);
  partial.patch.writeSet.pop();
  partial.patch.operations.pop();
  assertProtocol(() => validateSettlementZoneWorkerOutput({kind: "cities", binding, output: partial, policy: outputs.cities.policy}), "settlement-zone-worker-write-set-incomplete");

  const deleted = structuredClone(outputs.cities.output);
  const deletedOperation = operation(deleted.patch, "settlements");
  deletedOperation.exists = false;
  delete deletedOperation.value;
  assertProtocol(() => validateSettlementZoneWorkerOutput({kind: "cities", binding, output: deleted, policy: outputs.cities.policy}), "settlement-zone-worker-operation-value-invalid");

  const dataView = structuredClone(outputs.cities.output);
  operation(dataView.patch, "grid.cells.burg").value = new DataView(new ArrayBuffer(8));
  assertProtocol(() => validateSettlementZoneWorkerOutput({kind: "cities", binding, output: dataView, policy: outputs.cities.policy}), "settlement-zone-worker-operation-value-invalid");

  const nativeRecord = structuredClone(outputs.cities.output);
  operation(nativeRecord.patch, "settlements").value = new Map();
  assertProtocol(() => validateSettlementZoneWorkerOutput({kind: "cities", binding, output: nativeRecord, policy: outputs.cities.policy}), "settlement-zone-worker-operation-value-invalid");

  const cityMirror = structuredClone(outputs.cities.output);
  const city = operationValue(cityMirror.patch, "settlements").cities.find(row => row && !row.removed);
  operationValue(cityMirror.patch, "pack.burgs")[city.burgId].name = "镜像漂移";
  assertProtocol(() => validateSettlementZoneWorkerOutput({kind: "cities", binding, output: cityMirror, policy: outputs.cities.policy}), "settlement-city-burg-mirror-invalid");

  const routeMirror = structuredClone(outputs.cities.output);
  const route = operationValue(routeMirror.patch, "settlements").routes.find(row => row && !row.removed);
  operationValue(routeMirror.patch, "pack.routes")[route.id].to = Number(route.to) + 1;
  assertProtocol(() => validateSettlementZoneWorkerOutput({kind: "cities", binding, output: routeMirror, policy: outputs.cities.policy}), "settlement-route-mirror-invalid");

  const cityHole = structuredClone(outputs.cities.output);
  delete operationValue(cityHole.patch, "settlements").cities[1];
  assertProtocol(() => validateSettlementZoneWorkerOutput({kind: "cities", binding, output: cityHole, policy: outputs.cities.policy}), "settlement-zone-array-hole-invalid");

  const zoneMirror = structuredClone(outputs.zones.output);
  const zoneMirrorOperation = operation(zoneMirror.patch, "pack.zones");
  zoneMirrorOperation.value = structuredClone(zoneMirrorOperation.value);
  zoneMirrorOperation.value[0].name = "镜像漂移";
  assertProtocol(() => validateSettlementZoneWorkerOutput({kind: "zones", binding, output: zoneMirror, policy: outputs.zones.policy}), "zone-pack-mirror-invalid");

  const zoneIdentity = structuredClone(outputs.zones.output);
  operationValue(zoneIdentity.patch, "zones").zones[0].i = 7;
  operationValue(zoneIdentity.patch, "pack.zones")[0].i = 7;
  assertProtocol(() => validateSettlementZoneWorkerOutput({kind: "zones", binding, output: zoneIdentity, policy: outputs.zones.policy}), "zone-identity-invalid");

  const policyDrift = structuredClone(outputs.zones.policy);
  policyDrift.allowedPaths.pop();
  assertProtocol(() => validateSettlementZoneWorkerOutput({kind: "zones", binding, output: outputs.zones.output, policy: policyDrift}), "settlement-zone-worker-policy-drift");

  const canonical = generatePlaceholderMap({seed: "settlement-zone-commit", cellsTarget: 2000, heightmapTemplate: "continents"});
  const commitOutput = await runRegenerationWorkerTask({map: structuredClone(canonical), kind: "cities"}, {binding, checkpoint() {}, report() {}});
  validateSettlementZoneWorkerOutput({kind: "cities", binding, output: commitOutput, policy: getRegenerationPatchPolicy("cities")});
  const history = new EditHistory({onMutation: () => owner.advance(), onSnapshot: () => owner.createSnapshot(), onRestore: snapshot => owner.restoreSnapshot(snapshot)});
  history.execute(createDomainPatchCommand({patch: commitOutput.patch, policy: getRegenerationPatchPolicy("cities"), label: "城镇 Worker 提交", historyDomain: "settlements", result: commitOutput.result}), {map: canonical});
  assert.equal(history.getStats().undo, 1, "城镇 Worker 提交没有形成单条历史");
  const committed = structuredClone(canonical);
  history.undo({map: canonical});
  history.redo({map: canonical});
  assert.deepEqual(canonical, committed, "城镇 Worker 重做没有恢复提交结果");

  const annotationHistory = new EditHistory();
  const annotationContext = {map: canonical};
  const labelCommand = createAddCustomLabelCommand({text: "协议标签", x: 12, y: 34});
  annotationHistory.execute(labelCommand, annotationContext);
  const labelId = labelCommand.getCreatedLabel().id;
  annotationHistory.execute(createSetLabelNoteCommand({targetKind: "custom", targetId: labelId}, "标签备注"), annotationContext);
  assert.equal(canonical.notes.notes.some(note => note.body === "标签备注"), true, "标签备注没有进入 notes 文档");
  annotationHistory.execute(createSaveMeasurementCommand([[1, 2], [3, 4]], {name: "协议测量"}), annotationContext);
  const measurement = canonical.measurements.items.at(-1);
  assert.equal(measurement.name, "协议测量", "测量 command 没有写入 canonical 文档");
  const importMeasurementCommand = createImportMeasurementsCommand([{...measurement, name: "导入测量"}]);
  annotationHistory.execute(importMeasurementCommand, annotationContext);
  assert.equal(importMeasurementCommand.getImported().some(item => item.name === "导入测量"), true, "纯 Node 测量导入没有写入 canonical 文档");
  const annotationsCommitted = structuredClone(canonical.measurements.items);
  annotationHistory.undo(annotationContext);
  annotationHistory.redo(annotationContext);
  assert.deepEqual(canonical.measurements.items, annotationsCommitted, "测量导入撤销重做没有闭环");

  const appSource = await readFile(path.join(repoRoot, "app/webgl-generator/src/runtime/app.js"), "utf8");
  assert.match(appSource, /\["cities", "zones"\]\.includes\(targetKind\)[\s\S]*?validateSettlementZoneWorkerOutput/u, "正式城镇地区 Worker 入口未接统一 pre-commit validator");

  console.log(JSON.stringify({
    ok: true,
    manifests: [settlementsManifest.id, zonesManifest.id, labelsManifest.id, measurementsManifest.id],
    writes: {cities: SETTLEMENTS_WORKER_WRITE_SET.length, zones: outputs.zones.output.patch.writeSet.length},
    commit: {revision: owner.getCoreSnapshot(), history: history.getStats(), annotationsHistory: annotationHistory.getStats()},
    rejected: ["stale-binding", "partial-write-set", "delete-required", "data-view", "native-record", "city-burg-mirror", "route-mirror", "city-hole", "zone-mirror", "zone-identity", "policy-drift"],
    browserRuns: 0
  }, null, 2));
} finally {
  await vite.close();
}

function operationValue(patch, pathValue) {
  return operation(patch, pathValue).value;
}

function operation(patch, pathValue) {
  const matched = patch.operations.find(item => item.path.join(".") === pathValue);
  assert(matched, `patch 缺少 ${pathValue}`);
  return matched;
}

function assertProtocol(callback, code) {
  assert.throws(callback, error => error?.code === code);
}
