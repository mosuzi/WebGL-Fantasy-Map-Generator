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
  const {createRenderResourceBinding} = await vite.ssrLoadModule("/src/renderer/render-resource-binding.js");
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
    if (kind === "cities") {
      sourceMap.politics.states = structuredClone(sourceMap.politics.states);
      sourceMap.politics.provinces = structuredClone(sourceMap.politics.provinces);
      assert.notEqual(sourceMap.politics.states, sourceMap.pack.states, "城镇夹具必须覆盖非同引用国家镜像");
      assert.notEqual(sourceMap.politics.provinces, sourceMap.pack.provinces, "城镇夹具必须覆盖非同引用省份镜像");
    }
    const sourceBefore = structuredClone(sourceMap);
    const workerMap = structuredClone(sourceMap);
    const output = await runRegenerationWorkerTask({map: workerMap, kind}, {binding, checkpoint() {}, report() {}});
    const policy = getRegenerationPatchPolicy(kind);
    assert.deepEqual(sourceMap, sourceBefore, `${kind} Worker 执行前后改写了 canonical source`);
    const validated = validateSettlementZoneWorkerOutput({kind, sourceMap, binding, output, policy});
    assert.deepEqual(sourceMap, sourceBefore, `${kind} pre-commit validator 改写了 canonical source`);
    const expected = kind === "zones" ? ZONES_WORKER_WRITE_SET.filter(pathValue => pathValue !== "zones.metadata.stale") : SETTLEMENTS_WORKER_WRITE_SET;
    assert.deepEqual([...validated.writeSet].sort(), [...expected].sort(), `${kind} 实际 patch 写集不符合领域契约`);
    assert.equal(validated.binding.sourceRevision.topologyRevision, 1, `${kind} core binding 丢失 topology revision`);
    outputs[kind] = {sourceMap, output, policy};
  }
  const renderBinding = createRenderResourceBinding({
    mapIdentity: binding.mapIdentity,
    sourceRevision: binding.mapRevision + 1,
    topologyRevision: binding.topologyRevision + 1
  }, {renderPreparationId: "settlement-zone:render:1", renderGeneration: 3});
  const renderedCities = structuredClone(outputs.cities.output);
  renderedCities.preparedRender = {schemaVersion: 1, binding: renderBinding, layers: {}};
  validateSettlementZoneWorkerOutput({kind: "cities", sourceMap: outputs.cities.sourceMap, binding, renderBinding, output: renderedCities, policy: outputs.cities.policy});
  assertProtocol(() => validateSettlementZoneWorkerOutput({kind: "cities", sourceMap: outputs.cities.sourceMap, binding, output: renderedCities, policy: outputs.cities.policy}), "settlement-zone-render-binding-invalid");
  const staleRenderedCities = structuredClone(renderedCities);
  staleRenderedCities.preparedRender.binding.renderGeneration += 1;
  assertProtocol(() => validateSettlementZoneWorkerOutput({kind: "cities", sourceMap: outputs.cities.sourceMap, binding, renderBinding, output: staleRenderedCities, policy: outputs.cities.policy}), "settlement-zone-render-binding-stale");

  const stale = structuredClone(outputs.cities.output);
  stale.binding.topologyRevision += 1;
  assertProtocol(() => validateSettlementZoneWorkerOutput({kind: "cities", sourceMap: outputs.cities.sourceMap, binding, output: stale, policy: outputs.cities.policy}), "settlement-zone-worker-binding-stale");

  const partial = structuredClone(outputs.cities.output);
  partial.patch.writeSet.pop();
  partial.patch.operations.pop();
  assertProtocol(() => validateSettlementZoneWorkerOutput({kind: "cities", sourceMap: outputs.cities.sourceMap, binding, output: partial, policy: outputs.cities.policy}), "settlement-zone-worker-write-set-incomplete");

  const deleted = structuredClone(outputs.cities.output);
  const deletedOperation = operation(deleted.patch, "settlements");
  deletedOperation.exists = false;
  delete deletedOperation.value;
  assertProtocol(() => validateSettlementZoneWorkerOutput({kind: "cities", sourceMap: outputs.cities.sourceMap, binding, output: deleted, policy: outputs.cities.policy}), "settlement-zone-worker-operation-value-invalid");

  const dataView = structuredClone(outputs.cities.output);
  operation(dataView.patch, "grid.cells.burg").value = new DataView(new ArrayBuffer(8));
  assertProtocol(() => validateSettlementZoneWorkerOutput({kind: "cities", sourceMap: outputs.cities.sourceMap, binding, output: dataView, policy: outputs.cities.policy}), "settlement-zone-worker-operation-value-invalid");

  const nativeRecord = structuredClone(outputs.cities.output);
  operation(nativeRecord.patch, "settlements").value = new Map();
  assertProtocol(() => validateSettlementZoneWorkerOutput({kind: "cities", sourceMap: outputs.cities.sourceMap, binding, output: nativeRecord, policy: outputs.cities.policy}), "settlement-zone-worker-operation-value-invalid");

  const cityMirror = structuredClone(outputs.cities.output);
  const city = operationValue(cityMirror.patch, "settlements").cities.find(row => row && !row.removed);
  operationValue(cityMirror.patch, "pack.burgs")[city.burgId].name = "镜像漂移";
  assert.doesNotThrow(() => validateSettlementZoneWorkerOutput({kind: "cities", sourceMap: outputs.cities.sourceMap, binding, output: cityMirror, policy: outputs.cities.policy}), "名称等软镜像不得阻止城镇提交");

  const routeMirror = structuredClone(outputs.cities.output);
  const route = operationValue(routeMirror.patch, "settlements").routes.find(row => row && !row.removed);
  operationValue(routeMirror.patch, "pack.routes")[route.id].to = Number(route.to) + 1;
  assert.doesNotThrow(() => validateSettlementZoneWorkerOutput({kind: "cities", sourceMap: outputs.cities.sourceMap, binding, output: routeMirror, policy: outputs.cities.policy}), "路线镜像漂移不得反向阻止城镇重生成");

  const cityHole = structuredClone(outputs.cities.output);
  delete operationValue(cityHole.patch, "settlements").cities[1];
  assert.doesNotThrow(() => validateSettlementZoneWorkerOutput({kind: "cities", sourceMap: outputs.cities.sourceMap, binding, output: cityHole, policy: outputs.cities.policy}), "稀疏稳定 ID 槽不是提交错误");

  const danglingCapital = structuredClone(outputs.cities.output);
  const danglingPolitics = operationValue(danglingCapital.patch, "politics");
  const danglingPackStates = operationValue(danglingCapital.patch, "pack.states");
  const danglingState = danglingPolitics.states.find(row => row && !row.removed && Number(row.i) > 0);
  const danglingBurgId = operationValue(danglingCapital.patch, "pack.burgs").length + 10;
  danglingState.capital = danglingBurgId;
  danglingPackStates[danglingState.i].capital = danglingBurgId;
  assert.doesNotThrow(() => validateSettlementZoneWorkerOutput({kind: "cities", sourceMap: outputs.cities.sourceMap, binding, output: danglingCapital, policy: outputs.cities.policy}), "陈旧首都引用是软关系");

  const zeroCapital = structuredClone(outputs.cities.output);
  const zeroPolitics = operationValue(zeroCapital.patch, "politics");
  const zeroPackStates = operationValue(zeroCapital.patch, "pack.states");
  const zeroState = zeroPolitics.states.find(row => row && !row.removed && Number(row.capital) > 0);
  zeroState.capital = 0;
  zeroPackStates[zeroState.i].capital = 0;
  assert.doesNotThrow(() => validateSettlementZoneWorkerOutput({kind: "cities", sourceMap: outputs.cities.sourceMap, binding, output: zeroCapital, policy: outputs.cities.policy}), "零首都是允许的降级结果");

  const duplicateCapital = structuredClone(outputs.cities.output);
  const duplicatePolitics = operationValue(duplicateCapital.patch, "politics");
  const duplicateState = duplicatePolitics.states.find(row => row && !row.removed && Number(row.capital) > 0);
  const duplicateCity = operationValue(duplicateCapital.patch, "settlements").cities.find(row => row && !row.removed && Number(row.state) === Number(duplicateState.i) && Number(row.burgId) !== Number(duplicateState.capital));
  assert(duplicateCity, "夹具缺少可构造重复国家首都反向引用的非首都城市");
  duplicateCity.capital = 1;
  operationValue(duplicateCapital.patch, "pack.burgs")[duplicateCity.burgId].capital = 1;
  assert.doesNotThrow(() => validateSettlementZoneWorkerOutput({kind: "cities", sourceMap: outputs.cities.sourceMap, binding, output: duplicateCapital, policy: outputs.cities.policy}), "首都反向标记不是城镇提交硬门");

  const gridCellMirror = structuredClone(outputs.cities.output);
  const gridCity = operationValue(gridCellMirror.patch, "settlements").cities.find(row => row && !row.removed);
  operationValue(gridCellMirror.patch, "grid.cells.burg")[gridCity.cell] = -1;
  assert.doesNotThrow(() => validateSettlementZoneWorkerOutput({kind: "cities", sourceMap: outputs.cities.sourceMap, binding, output: gridCellMirror, policy: outputs.cities.policy}), "grid 城镇反向索引不是提交硬门");

  const packCellMirror = structuredClone(outputs.cities.output);
  const packCity = operationValue(packCellMirror.patch, "settlements").cities.find(row => row && !row.removed);
  operationValue(packCellMirror.patch, "pack.cells.burg")[packCity.packCell] = 0;
  assert.doesNotThrow(() => validateSettlementZoneWorkerOutput({kind: "cities", sourceMap: outputs.cities.sourceMap, binding, output: packCellMirror, policy: outputs.cities.policy}), "pack 城镇反向索引不是提交硬门");

  const zoneMirror = structuredClone(outputs.zones.output);
  const zoneMirrorOperation = operation(zoneMirror.patch, "pack.zones");
  zoneMirrorOperation.value = structuredClone(zoneMirrorOperation.value);
  zoneMirrorOperation.value[0].name = "镜像漂移";
  assert.doesNotThrow(() => validateSettlementZoneWorkerOutput({kind: "zones", sourceMap: outputs.zones.sourceMap, binding, output: zoneMirror, policy: outputs.zones.policy}), "地区镜像漂移不是基础物理硬门");

  const zoneIdentity = structuredClone(outputs.zones.output);
  const zoneIdentityRows = operationValue(zoneIdentity.patch, "zones").zones;
  const zoneIdentityPackRows = operationValue(zoneIdentity.patch, "pack.zones");
  const duplicateZoneId = Number(zoneIdentityRows[1]?.i ?? zoneIdentityRows[1]?.id ?? zoneIdentityRows[0]?.i ?? 0);
  assert.notEqual(duplicateZoneId, Number(zoneIdentityRows[0]?.i ?? zoneIdentityRows[0]?.id), "地区重复身份负例没有形成身份冲突");
  zoneIdentityRows[0].i = duplicateZoneId;
  if (zoneIdentityRows[0].id !== undefined) zoneIdentityRows[0].id = duplicateZoneId;
  if (zoneIdentityPackRows !== zoneIdentityRows) {
    zoneIdentityPackRows[0].i = duplicateZoneId;
    if (zoneIdentityPackRows[0].id !== undefined) zoneIdentityPackRows[0].id = duplicateZoneId;
  }
  assertProtocol(() => validateSettlementZoneWorkerOutput({kind: "zones", sourceMap: outputs.zones.sourceMap, binding, output: zoneIdentity, policy: outputs.zones.policy}), "zone-identity-invalid");

  const negativeZoneIdentity = structuredClone(outputs.zones.output);
  const negativeZoneRows = operationValue(negativeZoneIdentity.patch, "zones").zones;
  const negativePackRows = operationValue(negativeZoneIdentity.patch, "pack.zones");
  negativeZoneRows[0].i = -1;
  if (negativeZoneRows[0].id !== undefined) negativeZoneRows[0].id = -1;
  if (negativePackRows !== negativeZoneRows) {
    negativePackRows[0].i = -1;
    if (negativePackRows[0].id !== undefined) negativePackRows[0].id = -1;
  }
  assertProtocol(() => validateSettlementZoneWorkerOutput({kind: "zones", sourceMap: outputs.zones.sourceMap, binding, output: negativeZoneIdentity, policy: outputs.zones.policy}), "zone-identity-invalid");

  const conflictingZoneIdentity = structuredClone(outputs.zones.output);
  const conflictingZoneRows = operationValue(conflictingZoneIdentity.patch, "zones").zones;
  const conflictingPackRows = operationValue(conflictingZoneIdentity.patch, "pack.zones");
  const conflictingZoneId = Number(conflictingZoneRows[0].i ?? conflictingZoneRows[0].id);
  conflictingZoneRows[0].i = conflictingZoneId;
  conflictingZoneRows[0].id = conflictingZoneId + 1;
  if (conflictingPackRows !== conflictingZoneRows) {
    conflictingPackRows[0].i = conflictingZoneId;
    conflictingPackRows[0].id = conflictingZoneId + 1;
  }
  assertProtocol(() => validateSettlementZoneWorkerOutput({kind: "zones", sourceMap: outputs.zones.sourceMap, binding, output: conflictingZoneIdentity, policy: outputs.zones.policy}), "zone-identity-invalid");

  for (const [label, mutate] of [
    ["missing", row => { delete row.i; delete row.id; }],
    ["null", row => { row.i = null; if (row.id !== undefined) row.id = null; }],
    ["boolean", row => { row.i = false; if (row.id !== undefined) row.id = false; }],
    ["empty-string", row => { row.i = ""; if (row.id !== undefined) row.id = ""; }],
    ["numeric-string", row => {
      const stringId = String(row.i ?? row.id);
      row.i = stringId;
      if (row.id !== undefined) row.id = stringId;
    }]
  ]) {
    const invalidZoneIdentity = structuredClone(outputs.zones.output);
    const invalidZoneRows = operationValue(invalidZoneIdentity.patch, "zones").zones;
    const invalidPackRows = operationValue(invalidZoneIdentity.patch, "pack.zones");
    mutate(invalidZoneRows[0]);
    if (invalidPackRows !== invalidZoneRows) mutate(invalidPackRows[0]);
    assertProtocol(
      () => validateSettlementZoneWorkerOutput({kind: "zones", sourceMap: outputs.zones.sourceMap, binding, output: invalidZoneIdentity, policy: outputs.zones.policy}),
      "zone-identity-invalid",
      `地区 ${label} 身份负例没有被拒绝`
    );
  }

  const compactZones = structuredClone(outputs.zones.output);
  const compactZoneRows = operationValue(compactZones.patch, "zones").zones;
  const compactPackRows = operationValue(compactZones.patch, "pack.zones");
  assert.ok(compactZoneRows.length > 1, "地区紧凑身份正例缺少多个地区");
  compactZoneRows.shift();
  if (compactPackRows !== compactZoneRows) compactPackRows.shift();
  assert.notEqual(Number(compactZoneRows[0]?.i ?? compactZoneRows[0]?.id), 0, "地区紧凑身份正例首 id 没有形成非零值");
  validateSettlementZoneWorkerOutput({kind: "zones", sourceMap: outputs.zones.sourceMap, binding, output: compactZones, policy: outputs.zones.policy});

  const zoneCellBounds = structuredClone(outputs.zones.output);
  const zoneCellCount = outputs.zones.sourceMap.pack.cells.i.length;
  operationValue(zoneCellBounds.patch, "zones").zones[0].cells[0] = zoneCellCount;
  operationValue(zoneCellBounds.patch, "pack.zones")[0].cells[0] = zoneCellCount;
  assertProtocol(() => validateSettlementZoneWorkerOutput({kind: "zones", sourceMap: outputs.zones.sourceMap, binding, output: zoneCellBounds, policy: outputs.zones.policy}), "zone-cells-invalid");

  const policyDrift = structuredClone(outputs.zones.policy);
  policyDrift.allowedPaths.pop();
  assertProtocol(() => validateSettlementZoneWorkerOutput({kind: "zones", sourceMap: outputs.zones.sourceMap, binding, output: outputs.zones.output, policy: policyDrift}), "settlement-zone-worker-policy-drift");

  const canonical = generatePlaceholderMap({seed: "settlement-zone-commit", cellsTarget: 2000, heightmapTemplate: "continents"});
  const commitOutput = await runRegenerationWorkerTask({map: structuredClone(canonical), kind: "cities"}, {binding, checkpoint() {}, report() {}});
  validateSettlementZoneWorkerOutput({kind: "cities", sourceMap: canonical, binding, output: commitOutput, policy: getRegenerationPatchPolicy("cities")});
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
    acceptedSoftRelations: ["city-burg-mirror", "route-mirror", "city-sparse-id-slot", "dangling-capital", "zero-capital", "duplicate-capital", "grid-cell-mirror", "pack-cell-mirror", "zone-mirror"],
    rejected: ["stale-binding", "partial-write-set", "delete-required", "data-view", "native-record", "zone-identity-duplicate", "zone-identity-negative", "zone-identity-conflict", "zone-identity-missing", "zone-identity-null", "zone-identity-boolean", "zone-identity-empty-string", "zone-identity-numeric-string", "zone-cell-bounds", "policy-drift"],
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

function assertProtocol(callback, code, message) {
  assert.throws(callback, error => error?.code === code, message);
}
