#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createServer} from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vite = await createServer({configFile: false, root: path.join(repoRoot, "app/webgl-generator"), server: {middlewareMode: true}, appType: "custom", logLevel: "error"});

try {
  const {
    adaptFoundationWorkerBinding,
    validateFoundationDocumentShape,
    validateFoundationWorkerOutput,
    validateFoundationWorkerPatch
  } = await vite.ssrLoadModule("/src/domains/foundation/worker-runtime.ts");

  const binding = Object.freeze({
    mapIdentity: "foundation-map",
    mapRevision: 7,
    topologyRevision: 3,
    generationToken: 2,
    lockFingerprint: "foundation-locks",
    operationId: 9,
    operationName: "foundation-regression"
  });
  const preparedRender = Object.freeze({
    schemaVersion: 1,
    binding: {mapIdentity: binding.mapIdentity, mapRevision: binding.mapRevision, topologyRevision: binding.topologyRevision},
    layers: {}
  });
  const replacementMap = Object.freeze({heightmap: {}, grid: {cells: {}}, climate: {}, oceanCurrents: {}, pack: {}});

  const coreBinding = adaptFoundationWorkerBinding("height-derived.compute", binding);
  assert.equal(coreBinding.bindingKind, "compute");
  assert.equal(coreBinding.bindingPhase, "pre-commit");
  assert.equal(coreBinding.sourceRevision.topologyRevision, 3);

  const height = validateFoundationWorkerOutput({
    task: "height-derived.compute",
    binding,
    output: workerPatchOutput("height-derived", "height-derived", "grid.cells.h", binding, preparedRender)
  });
  assert.deepEqual(height.writeSet, ["grid.cells.h"]);

  const climate = validateFoundationWorkerOutput({
    task: "climate-downstream.compute",
    binding,
    output: workerPatchOutput("climate-downstream", "climate-downstream", "climate", binding, preparedRender)
  });
  assert.deepEqual(climate.writeSet, ["climate"]);

  const ocean = validateFoundationWorkerOutput({
    task: "ocean-current-world.compute",
    binding,
    output: {kind: "ocean-current-world", binding, result: {executed: true}, replacementMap, preparedRender}
  });
  assert.equal(ocean.replacement, true);

  const topology = validateFoundationWorkerOutput({
    task: "grid-topology.prepare",
    binding,
    output: {kind: "grid-topology-worker-result", binding, executed: true, result: {executed: true}, replacementMap, preparedRender}
  });
  assert.equal(topology.replacement, true);

  assertProtocol(() => adaptFoundationWorkerBinding("unknown.compute", binding), "foundation-worker-task-unknown");
  assertProtocol(() => adaptFoundationWorkerBinding("height-derived.compute", {...binding, topologyRevision: -1}), "foundation-worker-binding-invalid");
  assertProtocol(() => validateFoundationWorkerOutput({
    task: "height-derived.compute",
    binding,
    output: workerPatchOutput("height-derived", "height-derived", "grid.cells.h", {...binding, topologyRevision: 4}, preparedRender)
  }), "foundation-worker-binding-stale");
  assertProtocol(() => validateFoundationWorkerOutput({
    task: "height-derived.compute",
    binding,
    output: workerPatchOutput("height-derived", "height-derived", "grid.cells.h", binding, {...preparedRender, binding: {...preparedRender.binding, topologyRevision: 4}})
  }), "foundation-worker-render-binding-stale");
  assertProtocol(() => validateFoundationWorkerPatch(domainPatch("height-derived", "rogue.path"), "height-derived.compute", "height-derived"), "foundation-worker-patch-write-set-violation");
  assertProtocol(() => validateFoundationWorkerPatch({
    version: 1,
    domain: "height-derived",
    writeSet: ["grid", "grid.cells.h"],
    operations: [operation("grid"), operation("grid.cells.h")]
  }, "height-derived.compute", "height-derived"), "foundation-worker-patch-write-set-overlap");
  assertProtocol(() => validateFoundationWorkerOutput({
    task: "ocean-current-world.compute",
    binding,
    output: {kind: "ocean-current-world", binding, result: {executed: true}, replacementMap: {grid: {cells: {}}}, preparedRender}
  }), "foundation-worker-map-section-missing");

  const oldDocument = JSON.parse(await readFile(path.join(repoRoot, "tools/fixtures/webgl-map-v1-minimal.json"), "utf8"));
  const legacy = validateFoundationDocumentShape(oldDocument.map, {allowLegacy: true});
  assert.deepEqual(legacy.legacyDefaults, {heightmap: true, climate: true, oceanCurrents: true, topologyRevision: 0});
  assertProtocol(() => validateFoundationDocumentShape(oldDocument.map, {allowLegacy: false}), "foundation-worker-map-section-missing");

  const appSource = await readFile(path.join(repoRoot, "app/webgl-generator/src/runtime/app.js"), "utf8");
  assert.equal((appSource.match(/validateFoundationWorkerOutput\(/g) || []).length, 4, "四个基础 Worker 正式入口必须经过统一 validator");
  assert.match(appSource, /topologyRevision \?\? 0\).*topologyRevision \?\? 0/s, "通用 Worker binding 必须比较 topology revision");
  for (const relative of [
    "app/webgl-generator/src/renderer/render-preparation.js",
    "app/webgl-generator/src/renderer/render-cache-dto.js",
    "app/webgl-generator/src/renderer/picking-dto.js",
    "app/webgl-generator/src/renderer/surface-base-buffer-set.js"
  ]) {
    const source = await readFile(path.join(repoRoot, relative), "utf8");
    assert.match(source, /topologyRevision/, `${relative} 未携带 topology revision`);
  }

  console.log(JSON.stringify({
    ok: true,
    tasks: [height.task, climate.task, ocean.task, topology.task],
    topologyRevision: coreBinding.sourceRevision.topologyRevision,
    rendererSources: 4,
    legacyDefaults: legacy.legacyDefaults,
    rejected: ["task", "binding", "worker-stale", "renderer-stale", "write", "overlap", "replacement", "strict-old-data"]
  }, null, 2));
} finally {
  await vite.close();
}

function workerPatchOutput(kind, domain, pathValue, binding, preparedRender) {
  return {kind, binding, result: {executed: true}, patch: domainPatch(domain, pathValue), preparedRender};
}

function domainPatch(domain, pathValue) {
  return {version: 1, domain, writeSet: [pathValue], operations: [operation(pathValue)]};
}

function operation(pathValue) {
  return {path: pathValue.split("."), exists: true, value: null};
}

function assertProtocol(callback, code) {
  assert.throws(callback, error => error?.code === code);
}
