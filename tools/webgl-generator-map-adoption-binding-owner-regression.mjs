#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createMapAdoptionBindingOwner, finalizeCommittedMapAdoptionInstall} from "../app/webgl-generator/src/runtime/map-adoption-binding-owner.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requestBinding = binding({mapIdentity: "source-map", operationId: 17});
const owner = createMapAdoptionBindingOwner({
  kind: "generation",
  targetMapIdentity: "generated:3",
  requestBinding,
  operationId: 17
});

assert.equal(owner.snapshot().status, "request");
assert.deepEqual(owner.currentBinding(), requestBinding);
assert.equal(owner.currentBinding(18), null, "其它 operation 不得借用 pending owner");
owner.acceptWorkerResult({sessionId: "session-generation", binding: requestBinding, targetMapIdentity: "generated:3"});
assert.equal(owner.snapshot().status, "worker-pending");
owner.beginLoad({sessionId: "session-generation", targetMapIdentity: "generated:3"});
assert.equal(owner.snapshot().status, "loading");
const committedBinding = binding({mapIdentity: "committed-map", operationId: 17});
owner.beginCommit(committedBinding);
assert.deepEqual(owner.currentBinding(17), committedBinding, "committing 阶段必须切到正式 binding");
const committed = owner.commit();
assert.equal(committed.status, "committed");
assert.equal(owner.currentBinding(), null, "终态 owner 不得继续提供 binding");

const invalidatedOwner = createMapAdoptionBindingOwner({
  kind: "import",
  targetMapIdentity: "imported:9",
  requestBinding: binding({mapIdentity: "imported:9", operationId: 21}),
  operationId: 21
});
const invalidated = invalidatedOwner.invalidate("preload-failed");
assert.equal(invalidated.status, "invalidated");
assert.equal(invalidated.terminalReason, "preload-failed");
assert.equal(invalidatedOwner.currentBinding(), null);

const contestedOwner = createMapAdoptionBindingOwner({
  kind: "generation",
  targetMapIdentity: "generated:10",
  requestBinding: binding({operationId: 31}),
  operationId: 31
});
assert.equal(contestedOwner.invalidateForOperation(32, "busy-finalize").status, "request", "竞争任务不得失效当前 owner");
assert.equal(contestedOwner.currentBinding(31)?.operationId, 31);
assert.equal(contestedOwner.invalidateForOperation(31, "owned-finalize").status, "invalidated", "owner 任务必须能结束自身生命周期");

let finalizeCalls = 0;
const finalizedInstall = finalizeCommittedMapAdoptionInstall({finalize() { finalizeCalls++; }});
assert.deepEqual({...finalizedInstall}, {finalized: true, skipped: false, error: null});
assert.equal(finalizeCalls, 1);
const finalizeError = new Error("release-failed");
const failedFinalization = finalizeCommittedMapAdoptionInstall({finalize() { throw finalizeError; }});
assert.equal(failedFinalization.finalized, false);
assert.equal(failedFinalization.skipped, false);
assert.equal(failedFinalization.error, finalizeError, "post-commit finalize 失败必须被吸收并保留诊断");

assertCode(() => createMapAdoptionBindingOwner({kind: "generation", targetMapIdentity: "generated:0", requestBinding, operationId: 17}), "map_adoption_target_identity_invalid");
assertCode(() => createMapAdoptionBindingOwner({kind: "unknown", targetMapIdentity: "generated:3", requestBinding, operationId: 17}), "map_adoption_target_identity_invalid");
assertCode(() => createMapAdoptionBindingOwner({kind: "generation", targetMapIdentity: "generated:3", requestBinding, operationId: 18}), "map_adoption_operation_mismatch");

const staleOwner = createMapAdoptionBindingOwner({kind: "generation", targetMapIdentity: "generated:4", requestBinding, operationId: 17});
assertCode(() => staleOwner.acceptWorkerResult({sessionId: "session-stale", binding: {...requestBinding, mapRevision: 2}, targetMapIdentity: "generated:4"}), "map_adoption_worker_binding_mismatch");
assertCode(() => staleOwner.beginLoad({sessionId: "session-stale", targetMapIdentity: "generated:4"}), "map_adoption_lifecycle_invalid");

const sessionOwner = createMapAdoptionBindingOwner({kind: "import", targetMapIdentity: "imported:4", requestBinding, operationId: 17});
sessionOwner.acceptWorkerResult({sessionId: "session-import", binding: requestBinding, targetMapIdentity: "imported:4"});
assertCode(() => sessionOwner.beginLoad({sessionId: "other-session", targetMapIdentity: "imported:4"}), "map_adoption_session_mismatch");

for (const [overrides, code] of [
  [{operationName: "other-operation"}, "map_adoption_operation_mismatch"],
  [{generationToken: requestBinding.generationToken + 1}, "map_adoption_generation_token_mismatch"],
  [{mapRevision: 1}, "map_adoption_commit_revision_invalid"],
  [{topologyRevision: 1}, "map_adoption_commit_revision_invalid"]
]) {
  const commitOwner = createMapAdoptionBindingOwner({kind: "generation", targetMapIdentity: "generated:8", requestBinding, operationId: 17});
  commitOwner.acceptWorkerResult({sessionId: "session-commit", binding: requestBinding, targetMapIdentity: "generated:8"});
  commitOwner.beginLoad({sessionId: "session-commit", targetMapIdentity: "generated:8"});
  assertCode(() => commitOwner.beginCommit(binding({mapIdentity: "committed-map", operationId: 17, ...overrides})), code);
}

const appSource = await readFile(path.join(repoRoot, "app/webgl-generator/src/runtime/app.js"), "utf8");
for (const pattern of [
  /pendingMapAdoptionBindingOwner: null/u,
  /beginPendingMapAdoptionBindingOwner\(state, \{kind: "generation"/u,
  /beginPendingMapAdoptionBindingOwner\(state, \{kind: "import"/u,
  /acceptPendingMapAdoptionWorkerResult\(state, output, renderBinding\)/u,
  /beginPendingMapAdoptionLoad\(state, workerAdoption, renderBinding \|\| preparedRender\?\.binding\)/u,
  /state\.mapRevision\.replaceMap\(runtimeMapIdentity\);[\s\S]*?beginPendingMapAdoptionCommit\(state, adoptedBinding\)[\s\S]*?commitSession/u,
  /completePendingMapAdoptionBindingOwner\(state\)/u,
  /mapReplaceOperationId = context\.id/u,
  /invalidatePendingMapAdoptionBindingOwner\(state, `\$\{name\}-finalize`, mapReplaceOperationId\)/u,
  /finalizeCommittedMapAdoptionInstall\(preparedInstall\)/u,
  /invalidatePendingMapAdoptionBindingOwner\(state, reason, operationId = null\)/u
]) assert.match(appSource, pattern, `正式接线缺少 ${pattern}`);

console.log(JSON.stringify({
  ok: true,
  lifecycle: ["request", "worker-pending", "loading", "committing", "committed"],
  rejected: ["target", "kind", "operation", "worker-binding", "order", "session", "commit-operation", "commit-token", "commit-revision", "foreign-operation-finalize"],
  cleanup: {finalizeCalls, throwingFinalizeAbsorbed: failedFinalization.error === finalizeError},
  terminal: [committed.status, invalidated.status]
}, null, 2));

function binding(overrides = {}) {
  return {
    mapIdentity: "map-a",
    mapRevision: 0,
    topologyRevision: 0,
    generationToken: 2,
    lockFingerprint: "locks-a",
    operationId: 1,
    operationName: "generate.newMap",
    ...overrides
  };
}

function assertCode(callback, code) {
  assert.throws(callback, error => error?.code === code, `预期错误 ${code}`);
}
