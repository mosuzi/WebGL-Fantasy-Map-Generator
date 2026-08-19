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
    createCommittedFoundationWorkerBinding,
    createFoundationWorkerBinding,
    validateFoundationDocumentShape,
    validateFoundationWorkerOutput,
    validateFoundationWorkerPatch
  } = await vite.ssrLoadModule("/src/domains/foundation/worker-runtime.ts");
  const {generatePlaceholderMap} = await vite.ssrLoadModule("/src/generator/index.js");
  const {createMapDocument, parseMapDocument, stringifyMapDocument} = await vite.ssrLoadModule("/src/runtime/map-file-io.js");
  const {EditHistory} = await vite.ssrLoadModule("/src/runtime/edit-history.js");
  const {MapRevisionTracker} = await vite.ssrLoadModule("/src/runtime/map-revision.js");

  const revisionOwner = new MapRevisionTracker({identityFactory: () => "foundation-map"});
  revisionOwner.replaceMap();
  for (let index = 0; index < 3; index++) revisionOwner.advance();
  const ownerRollback = revisionOwner.createSnapshot();
  revisionOwner.advance();
  assert.equal(revisionOwner.getCoreSnapshot().topologyRevision, 4, "canonical mutation 没有推进 topology revision");
  revisionOwner.restoreSnapshot(ownerRollback);
  assert.deepEqual(revisionOwner.getCoreSnapshot(), {mapIdentity: "foundation-map", mapRevision: 3, topologyRevision: 3}, "事务 rollback 没有恢复 topology revision owner");
  const binding = createFoundationWorkerBinding({
    revision: revisionOwner.getCoreSnapshot(),
    generationToken: 2,
    lockFingerprint: "foundation-locks",
    operation: {id: 9, name: "foundation-regression"}
  });
  const preparedRender = Object.freeze({
    schemaVersion: 1,
    binding: {mapIdentity: binding.mapIdentity, mapRevision: binding.mapRevision, topologyRevision: binding.topologyRevision},
    layers: {}
  });
  const generatedMap = generatePlaceholderMap({seed: "foundation-complete-map", cellsTarget: 1_000});
  const replacementMap = parseMapDocument(stringifyMapDocument(createMapDocument(generatedMap, generatedMap.options))).map;

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

  const commitMap = structuredClone(replacementMap);
  const commitHistory = new EditHistory({
    onMutation: () => revisionOwner.advance(),
    onSnapshot: () => revisionOwner.createSnapshot(),
    onRestore: snapshot => revisionOwner.restoreSnapshot(snapshot)
  });
  commitHistory.execute({
    label: "基础域提交安装回归",
    domain: "foundation-regression",
    apply: ({map}) => { map.status.message = "committed"; },
    revert: ({map}) => { map.status.message = replacementMap.status.message; }
  }, {map: commitMap});
  const committedBinding = createCommittedFoundationWorkerBinding(binding, revisionOwner.getCoreSnapshot());
  const installIsCurrent = () => committedBinding.mapIdentity === revisionOwner.getCoreSnapshot().mapIdentity
    && committedBinding.mapRevision === revisionOwner.getCoreSnapshot().mapRevision
    && committedBinding.topologyRevision === revisionOwner.getCoreSnapshot().topologyRevision;
  assert.equal(installIsCurrent(), true, "canonical commit 后 renderer install binding 立即过期");
  const settledRevision = revisionOwner.getCoreSnapshot();
  assert.deepEqual(
    {mapIdentity: committedBinding.mapIdentity, mapRevision: committedBinding.mapRevision, topologyRevision: committedBinding.topologyRevision},
    settledRevision,
    "renderer install settle 后 binding 未保持 owner 当前态"
  );
  assertProtocol(() => createCommittedFoundationWorkerBinding(binding, {...settledRevision, topologyRevision: binding.topologyRevision}), "foundation-worker-commit-revision-invalid");

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
  const partialReplacement = structuredClone(replacementMap);
  delete partialReplacement.politics;
  const emptiedOceanReplacement = structuredClone(replacementMap);
  emptiedOceanReplacement.oceanCurrents = {};
  const emptiedGridReplacement = structuredClone(replacementMap);
  emptiedGridReplacement.grid = {};
  const emptiedEconomyReplacement = structuredClone(replacementMap);
  emptiedEconomyReplacement.economy = {};
  const canonical = structuredClone(replacementMap);
  const canonicalBefore = structuredClone(canonical);
  const revisionBefore = revisionOwner.getCoreSnapshot();
  const history = new EditHistory({onMutation: () => revisionOwner.advance(), onSnapshot: () => revisionOwner.createSnapshot(), onRestore: snapshot => revisionOwner.restoreSnapshot(snapshot)});
  const historyBefore = history.getStats();
  for (const [task, kind] of [["ocean-current-world.compute", "ocean-current-world"], ["grid-topology.prepare", "grid-topology-worker-result"]]) {
    assertProtocol(() => validateFoundationWorkerOutput({
      task,
      binding,
      output: {kind, binding, executed: true, result: {executed: true}, replacementMap: partialReplacement, preparedRender}
    }), "foundation-worker-map-section-missing");
  }
  for (const [task, kind, invalidMap] of [
    ["ocean-current-world.compute", "ocean-current-world", emptiedOceanReplacement],
    ["grid-topology.prepare", "grid-topology-worker-result", emptiedGridReplacement],
    ["ocean-current-world.compute", "ocean-current-world", emptiedEconomyReplacement],
    ["grid-topology.prepare", "grid-topology-worker-result", emptiedEconomyReplacement]
  ]) {
    assertProtocol(() => validateFoundationWorkerOutput({
      task,
      binding,
      output: {kind, binding, executed: true, result: {executed: true}, replacementMap: invalidMap, preparedRender}
    }), task === "grid-topology.prepare" && invalidMap === emptiedGridReplacement
      ? "foundation-worker-map-grid-missing"
      : "foundation-worker-map-structure-invalid");
  }
  assert.deepEqual(canonical, canonicalBefore, "残缺 replacement pre-commit 拒绝后改写了 canonical map");
  assert.deepEqual(revisionOwner.getCoreSnapshot(), revisionBefore, "残缺 replacement pre-commit 拒绝后推进了 revision owner");
  assert.deepEqual(history.getStats(), historyBefore, "残缺 replacement pre-commit 拒绝后写入了 history");
  const invalidStructure = structuredClone(replacementMap);
  invalidStructure.notes.notes = null;
  assertProtocol(() => validateFoundationDocumentShape(invalidStructure), "foundation-worker-map-structure-invalid");

  const oldDocument = JSON.parse(await readFile(path.join(repoRoot, "tools/fixtures/webgl-map-v1-minimal.json"), "utf8"));
  const legacy = validateFoundationDocumentShape(oldDocument.map, {allowLegacy: true});
  assert.deepEqual(legacy.legacyDefaults, {heightmap: true, climate: true, oceanCurrents: true, topologyRevision: 0});
  assertProtocol(() => validateFoundationDocumentShape(oldDocument.map, {allowLegacy: false}), "foundation-worker-map-section-missing");

  const appSource = await readFile(path.join(repoRoot, "app/webgl-generator/src/runtime/app.js"), "utf8");
  assert.equal((appSource.match(/validateFoundationWorkerOutput\(/g) || []).length, 4, "四个基础 Worker 正式入口必须经过统一 validator");
  assert.match(appSource, /createFoundationWorkerBinding\(\{[\s\S]*?getCoreSnapshot\(\)/u, "正式 Worker binding factory 未读取 revision owner 的 topology revision");
  assert.match(appSource, /createCommittedFoundationWorkerBinding\(binding, state\.mapRevision\.getCoreSnapshot\(\)\)/u, "正式 commit 后未从 revision owner 创建 renderer install binding");
  assert.doesNotMatch(appSource, /committedBinding = \{\.\.\.(?:binding|output\.binding), mapRevision:/u, "正式 commit 仍在手工预测单轴 revision");
  assert.match(appSource, /binding: \{mapIdentity: binding\.mapIdentity, mapRevision: binding\.mapRevision, topologyRevision: binding\.topologyRevision\}/u, "正式 renderer request 未携带 topology revision");
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
    commitRenderSettle: settledRevision,
    rejected: ["task", "binding", "worker-stale", "renderer-stale", "write", "overlap", "replacement", "emptied-domain", "replacement-atomicity", "commit-revision", "strict-old-data"]
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
