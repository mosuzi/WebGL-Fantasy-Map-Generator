#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createServer} from "vite";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {createDomainPatchCommand} from "../app/webgl-generator/src/runtime/domain-patch.js";
import {
  fingerprintPopulationSource,
  getPopulationWorkerPatchPolicy,
  runPopulationWorkerTask
} from "../app/webgl-generator/src/runtime/population-worker-task.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vite = await createServer({configFile: false, root: path.join(repoRoot, "app/webgl-generator"), server: {middlewareMode: true}, appType: "custom", logLevel: "error"});

try {
  const {
    adaptPopulationWorkerBinding,
    validatePopulationWorkerOutput,
    validatePopulationWorkerPatch
  } = await vite.ssrLoadModule("/src/domains/population/worker-runtime.ts");

  const source = generatePlaceholderMap({seed: "population-core-protocol", cellsTarget: 1000});
  const stateId = source.pack.states.find(state => state?.i > 0)?.i;
  assert.ok(stateId, "population core fixture 缺少国家");
  const request = {kind: "adjustment", target: {scope: "state", id: stateId}, delta: 15};
  const binding = createBinding(31);
  const sourceFingerprint = fingerprintPopulationSource(source, request);
  const driftCases = [
    ["settlement routes", map => map.settlements.routes.push({id: "drift-route", points: [[0, 0], [1, 1]], packCells: [0, 1]})],
    ["grid points", map => { map.grid.points[0][0] += 0.25; }],
    ["grid height", map => { map.grid.cells.h[0] = Number(map.grid.cells.h[0]) + 1; }],
    ["grid burg", map => { map.grid.cells.burg[0] = Number(map.grid.cells.burg[0]) + 1; }],
    ["grid feature", map => { map.grid.cells.f[0] = Number(map.grid.cells.f[0]) + 1; }],
    ["features", map => { map.features.features[0] = {...map.features.features[0], land: !map.features.features[0]?.land}; }],
    ["pack grid binding", map => { map.pack.cells.g[0] = Number(map.pack.cells.g[0]) + 1; }],
    ["politics mirror", map => { map.politics.states = structuredClone(map.politics.states); map.politics.states[1].name += "-drift"; }],
    ["society mirror", map => { map.society.cultures = structuredClone(map.society.cultures); map.society.cultures[1].name += "-drift"; }],
    ["economy metadata", map => { map.economy.metadata = {...map.economy.metadata, demand: {drift: true}}; }],
    ["stale metadata", map => { map.military.metadata = {...map.military.metadata, stale: !map.military.metadata?.stale}; }]
  ];
  for (const [label, mutate] of driftCases) {
    const drifted = structuredClone(source);
    mutate(drifted);
    assert.notEqual(fingerprintPopulationSource(drifted, request), sourceFingerprint, `来源指纹漏掉 ${label}`);
  }
  const staleRouteMap = structuredClone(source);
  driftCases[0][1](staleRouteMap);
  await assert.rejects(
    runPopulationWorkerTask({map: staleRouteMap, request, binding, sourceFingerprint}, taskContext(binding)),
    error => error?.code === "population-worker-source-stale"
  );
  const workerMap = structuredClone(source);
  const output = await runPopulationWorkerTask({map: workerMap, request, binding, sourceFingerprint}, taskContext(binding));
  const accepted = validatePopulationWorkerOutput({
    binding,
    output,
    expectation: {kind: "population", requestKind: "adjustment", sourceFingerprint}
  });
  assert.equal(accepted.binding.bindingKind, "compute");
  assert.equal(accepted.binding.bindingPhase, "pre-commit");
  assert.equal(accepted.binding.sourceRevision.canonicalRevision, binding.mapRevision);
  assert.equal(accepted.binding.sourceRevision.domainRevisions.population, binding.mapRevision);
  assert.deepEqual(accepted.writeSet, output.patch.writeSet);

  const target = structuredClone(source);
  const command = createDomainPatchCommand({
    patch: output.patch,
    policy: getPopulationWorkerPatchPolicy(target, output.patch),
    label: "population core protocol",
    historyDomain: "population-adjustment",
    effects: {}
  });
  command.apply({map: target});
  const undoPatch = command.getHistoryPatch("undo");
  validatePopulationWorkerPatch(undoPatch);
  const historyBinding = createBinding(32);
  const historyOutput = await runPopulationWorkerTask({
    map: target,
    binding: historyBinding,
    historyTransition: {action: "undo", request, patch: undoPatch}
  }, taskContext(historyBinding));
  const historyAccepted = validatePopulationWorkerOutput({
    binding: historyBinding,
    output: historyOutput,
    expectation: {kind: "population-history", requestKind: "adjustment", action: "undo"}
  });
  assert.equal(historyAccepted.resultKind, "population-history");

  assertProtocolCode(() => adaptPopulationWorkerBinding({...binding, generationToken: -1}), "population-worker-binding-invalid");
  assertProtocolCode(() => validatePopulationWorkerOutput({
    binding,
    output: {...output, binding: {...output.binding, mapRevision: output.binding.mapRevision + 1}},
    expectation: {kind: "population", requestKind: "adjustment", sourceFingerprint}
  }), "population-worker-binding-stale");
  assertProtocolCode(() => validatePopulationWorkerOutput({
    binding,
    output: {...output, plan: {...output.plan, binding: {...output.plan.binding, operationId: output.plan.binding.operationId + 1}}},
    expectation: {kind: "population", requestKind: "adjustment", sourceFingerprint}
  }), "population-worker-binding-stale");
  assertProtocolCode(() => validatePopulationWorkerOutput({
    binding,
    output,
    expectation: {kind: "population", requestKind: "adjustment", sourceFingerprint: "stale-source"}
  }), "population-worker-source-stale");
  assertProtocolCode(() => validatePopulationWorkerOutput({
    binding,
    output: {...output, kind: "population-history"},
    expectation: {kind: "population", requestKind: "adjustment", sourceFingerprint}
  }), "population-worker-result-kind-invalid");

  const unknownPatch = structuredClone(output.patch);
  unknownPatch.writeSet.push("routes");
  unknownPatch.operations.push({path: ["routes"], exists: true, value: []});
  assertProtocolCode(() => validatePopulationWorkerPatch(unknownPatch), "population-worker-patch-write-set-violation");
  const duplicatePatch = structuredClone(output.patch);
  duplicatePatch.writeSet.push(duplicatePatch.writeSet[0]);
  duplicatePatch.operations.push(structuredClone(duplicatePatch.operations[0]));
  assertProtocolCode(() => validatePopulationWorkerPatch(duplicatePatch), "population-worker-patch-write-set-mismatch");
  const unsafePatch = {version: 1, domain: "population-mutation", writeSet: ["pack.states.0.constructor"], operations: [{path: ["pack", "states", "0", "constructor"], exists: true, value: {}}]};
  assertProtocolCode(() => validatePopulationWorkerPatch(unsafePatch), "population-worker-patch-operation-invalid");
  const overlapPatch = {version: 1, domain: "population-mutation", writeSet: ["pack.states", "pack.states.0"], operations: [{path: ["pack", "states"], exists: true, value: []}, {path: ["pack", "states", "0"], exists: true, value: {}}]};
  assertProtocolCode(() => validatePopulationWorkerPatch(overlapPatch), "population-worker-patch-write-set-overlap");

  const cancelMap = structuredClone(source);
  const beforeCancel = fingerprintPopulationSource(cancelMap, request);
  await assert.rejects(
    runPopulationWorkerTask({map: cancelMap, request, binding: createBinding(33)}, {binding: createBinding(33), checkpoint: ({stage}) => stage !== "after-apply", report: () => {}}),
    error => error?.name === "AbortError"
  );
  assert.equal(fingerprintPopulationSource(cancelMap, request), beforeCancel, "取消后人口 Worker 留下部分写入");

  console.log(JSON.stringify({
    ok: true,
    task: "population.compute",
    resultKinds: [accepted.resultKind, historyAccepted.resultKind],
    writePaths: accepted.writeSet.length,
    binding: {
      kind: accepted.binding.bindingKind,
      phase: accepted.binding.bindingPhase,
      revision: accepted.binding.sourceRevision.canonicalRevision
    },
    rejected: ["generation", "stale", "gap", "checksum", "read-dependency-drift", "result-kind", "unknown-write", "duplicate-write", "unsafe-write", "overlap-write", "cancel-rollback"]
  }, null, 2));
} finally {
  await vite.close();
}

function createBinding(operationId) {
  return {
    mapIdentity: "population-core-session",
    mapRevision: 9,
    generationToken: 4,
    lockFingerprint: "population-core-locks",
    operationId,
    operationName: "population.compute"
  };
}

function taskContext(binding) {
  return {binding, checkpoint: () => true, report: () => {}};
}

function assertProtocolCode(callback, code) {
  assert.throws(callback, error => error?.code === code, `应拒绝为 ${code}`);
}
