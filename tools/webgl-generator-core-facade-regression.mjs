#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile, readdir} from "node:fs/promises";
import path from "node:path";

const compiledRoot = new URL("../.cache/core-facade-test/core/", import.meta.url);
const {CoreFacadeError, createMapCoreEngine} = await import(new URL("map-core-engine.js", compiledRoot));
const {createMapRuntimeCoordinator} = await import(new URL("map-runtime-coordinator.js", compiledRoot));

const accessorRaw = [11];
let map = {
  name: "first",
  cells: [1, 2, 3],
  typed: new Uint8Array([7, 8]),
  buffer: new ArrayBuffer(4),
  get accessorLeak() {
    return accessorRaw;
  }
};
let revision = interactiveRevision(0);
let historyFingerprint = "history:0";
let commitIdsCreated = 0;
const owner = {
  getMap: () => map,
  getRevision: () => revision,
  getHistoryFingerprint: () => historyFingerprint
};
const core = createMapCoreEngine({
  owner,
  createCommitId: () => `commit-${++commitIdsCreated}`
});

assert.equal(core.readCanonical(current => current.name), "first");
expectFacadeError(() => core.readCanonical(current => {
  current.cells[0] = 99;
  return current.cells[0];
}), "FACADE_OWNER_ESCAPE");
assert.deepEqual(map.cells, [1, 2, 3], "readonly borrow 不得同步改写 owner 的嵌套字段");
expectFacadeError(() => core.readCanonical(current => ({nested: current.cells})), "FACADE_OWNER_ESCAPE");
expectFacadeError(() => core.readCanonical(current => Object.getOwnPropertyDescriptor(current, "cells").value), "FACADE_OWNER_ESCAPE");
core.readCanonical(current => {
  const detachedBuffer = current.typed.buffer;
  new Uint8Array(detachedBuffer)[0] = 42;
  return current.typed[0];
});
assert.equal(map.typed[0], 7, "typed array buffer borrow 必须与 owner backing store 隔离");
expectFacadeError(() => core.readCanonical(current => current.typed.forEach((_value, _index, rawView) => {
  rawView[0] = 41;
})), "FACADE_OWNER_ESCAPE");
assert.equal(map.typed[0], 7, "原生容器 callback 不得收到真实 typed array owner");
let accessorGetter;
core.readCanonical(current => {
  accessorGetter = Object.getOwnPropertyDescriptor(current, "accessorLeak").get;
  return current.name;
});
expectFacadeError(() => accessorGetter(), "FACADE_OWNER_ESCAPE");
assert.deepEqual(accessorRaw, [11], "accessor descriptor 不得暴露捕获真实 owner 的 getter");
expectFacadeError(() => core.readCanonical(current => current.buffer.transfer()), "FACADE_OWNER_ESCAPE");
assert.equal(map.buffer.byteLength, 4, "ArrayBuffer transfer 不得 detach owner backing store");
let escapedCells;
core.readCanonical(current => {
  escapedCells = current.cells;
  return current.name;
});
assert.throws(() => escapedCells[0], TypeError, "未返回但被闭包捕获的 borrow 必须在同步读取后失效");
map = {name: "second", cells: [4, 5], typed: new Uint8Array([9])};
assert.equal(core.readCanonical(current => current.name), "second", "facade 不得缓存旧 map owner");
expectFacadeError(() => core.readCanonical(current => current), "FACADE_OWNER_ESCAPE");
expectFacadeError(() => core.readCanonical(async current => current.name), "FACADE_ASYNC_BORROW");
expectFacadeError(() => core.readCanonical(current => {
  map = {name: "third", cells: [], typed: new Uint8Array()};
  return current.name;
}), "FACADE_OWNER_DRIFT");
map = {name: "second", cells: [4, 5], typed: new Uint8Array([9])};

const firstBinding = binding("operation-1", revision);
core.beginShadowOperation({binding: firstBinding, kind: "edit", source: "ui", projections: ["worker", "renderer", "persistence", "ui"]});
assert.equal(commitIdsCreated, 0, "pre-commit 阶段不得提前分配 commitId");
assert.equal(core.getOperation("operation-1").historyBefore, "history:0");
core.observeComputed("operation-1");
core.observeValidated("operation-1");
core.observeProjectionsPrepared("operation-1");
core.beginShadowOperation({binding: binding("operation-1-competitor", revision), kind: "edit", source: "api", projections: []});
core.observeComputed("operation-1-competitor");
core.observeValidated("operation-1-competitor");
core.observeProjectionsPrepared("operation-1-competitor");
assert.equal(revision.canonicalRevision, 0, "facade 不得推进 legacy revision");
assert.equal(historyFingerprint, "history:0", "facade 不得写 legacy history");

revision = interactiveRevision(1);
historyFingerprint = "history:1";
const firstCommit = core.observeCanonicalCommit("operation-1", commitFacts(revision));
assert.equal(firstCommit.commitId, "commit-1");
assert.equal(commitIdsCreated, 1);
assert.equal(firstCommit.lifecycle, "canonical-committed");
expectFacadeError(() => core.observeCanonicalCommit("operation-1-competitor", commitFacts(revision)), "FACADE_LIFECYCLE_INVALID");
assert.equal(commitIdsCreated, 1, "重复认领 owner transition 不得消耗 commitId");
assert.equal(core.getLastCommit(), null, "未 published 的 commit 不能成为 last commit");
core.observePublished(firstCommit.commitId);
assert.equal(core.getLastCommit().commitId, firstCommit.commitId);
expectFacadeError(() => core.observeProjectionUpdate({commitId: firstCommit.commitId, projections: []}), "FACADE_LIFECYCLE_INVALID");
expectFacadeError(() => core.observeProjectionUpdate({
  commitId: firstCommit.commitId,
  projections: firstCommit.projections.map(status => status.projection === "renderer" ? {...status, state: "resyncing"} : status)
}), "FACADE_LIFECYCLE_INVALID");
expectFacadeError(() => core.observeProjectionUpdate({
  commitId: firstCommit.commitId,
  projections: firstCommit.projections.map(status => status.projection === "renderer" ? {...status, state: "degraded"} : status)
}), "FACADE_LIFECYCLE_INVALID");

const coordinator = createMapRuntimeCoordinator({core});
coordinator.attach(firstCommit.commitId);
coordinator.transition(firstCommit.commitId, "renderer", "ready");
coordinator.transition(firstCommit.commitId, "worker", "degraded", "replica ACK 超时");
coordinator.transition(firstCommit.commitId, "persistence", "ready");
coordinator.transition(firstCommit.commitId, "ui", "ready");
assert.equal(core.getOperation("operation-1").lifecycle, "projections-settled");
assert.equal(core.getCommit(firstCommit.commitId).projections.find(item => item.projection === "worker").state, "degraded");
expectFacadeError(() => core.observeRollback("operation-1", "renderer failed"), "FACADE_ROLLBACK_AFTER_PUBLISH");
assert.equal(revision.canonicalRevision, 1, "发布后投影失败不得反向修改 canonical revision");
assert.equal(historyFingerprint, "history:1", "发布后投影失败不得反向修改 history");

await assert.rejects(coordinator.recover(firstCommit.commitId, "worker", "invalid-mode", async () => {}), error => error?.code === "FACADE_LIFECYCLE_INVALID");
assert.equal(coordinator.snapshot().recoveries, 0, "非法 recovery mode 不得残留并发锁");
assert.equal(core.getCommit(firstCommit.commitId).projections.find(item => item.projection === "worker").state, "degraded");
await assert.rejects(coordinator.recover(firstCommit.commitId, "worker", "retrying", async () => { throw new Error(""); }), error => error instanceof Error);
assert.equal(coordinator.snapshot().recoveries, 0, "空错误消息的 recovery 失败不得残留并发锁");
assert.equal(core.getCommit(firstCommit.commitId).projections.find(item => item.projection === "worker").state, "degraded");
assert.ok(core.getCommit(firstCommit.commitId).projections.find(item => item.projection === "worker").detail, "recovery 失败必须保留非空 degraded 原因");

await coordinator.recover(firstCommit.commitId, "worker", "resyncing", async () => {});
coordinator.transition(firstCommit.commitId, "renderer", "degraded", "context lost");
await coordinator.recover(firstCommit.commitId, "renderer", "retrying", () => true);
coordinator.transition(firstCommit.commitId, "worker", "degraded", "replica lost again");
await assert.rejects(coordinator.recover(firstCommit.commitId, "worker", "retrying", async () => { throw new Error("retry failed"); }), /retry failed/);
assert.equal(core.getCommit(firstCommit.commitId).projections.find(item => item.projection === "worker").state, "degraded");
assert.equal(revision.canonicalRevision, 1, "projection recovery 失败不得回滚 canonical revision");
assert.equal(historyFingerprint, "history:1", "projection recovery 失败不得回滚 history");
await coordinator.recover(firstCommit.commitId, "worker", "resyncing", async () => {});
assert.equal(core.getCommit(firstCommit.commitId).projections.every(item => item.state === "ready"), true);

const secondBinding = binding("operation-2", revision);
core.beginShadowOperation({binding: secondBinding, kind: "edit", source: "api", projections: []});
core.observeComputed("operation-2");
core.observeValidated("operation-2");
core.observeProjectionsPrepared("operation-2");
revision = interactiveRevision(2);
historyFingerprint = "history:2";
const secondCommit = core.observeCanonicalCommit("operation-2", commitFacts(revision));
revision = interactiveRevision(1);
historyFingerprint = "history:1";
expectFacadeError(() => core.observePublished(secondCommit.commitId), "FACADE_OWNER_DRIFT");
const rolledBack = core.observeRollback("operation-2", "legacy publish 前恢复");
assert.equal(rolledBack.outcome, "rolled-back");
assert.equal(rolledBack.rollback.stage, "canonical-committed");
expectFacadeError(() => core.observePublished(secondCommit.commitId), "FACADE_LIFECYCLE_INVALID");
assert.equal(core.getLastCommit().commitId, firstCommit.commitId);

const releasedClaimBinding = binding("operation-2-retry", revision);
core.beginShadowOperation({binding: releasedClaimBinding, kind: "edit", source: "api", projections: []});
core.observeComputed("operation-2-retry");
core.observeValidated("operation-2-retry");
core.observeProjectionsPrepared("operation-2-retry");
revision = interactiveRevision(2);
historyFingerprint = "history:2";
const releasedClaimCommit = core.observeCanonicalCommit("operation-2-retry", commitFacts(revision));
assert.equal(releasedClaimCommit.commitId, "commit-3", "rollback 必须释放 owner transition claim");
revision = interactiveRevision(1);
historyFingerprint = "history:1";
core.observeRollback("operation-2-retry", "claim release verified");

const thirdBinding = binding("operation-3", revision);
core.beginShadowOperation({binding: thirdBinding, kind: "edit", source: "worker", projections: []});
core.observeComputed("operation-3");
const preCommitRollback = core.observeRollback("operation-3", "legacy compute cancelled");
assert.equal(preCommitRollback.outcome, "rolled-back");
assert.deepEqual(preCommitRollback.lifecycleTrace, ["planned", "computed"]);

const preparedRollbackBinding = binding("operation-prepared-rollback", revision);
core.beginShadowOperation({binding: preparedRollbackBinding, kind: "edit", source: "ui", projections: []});
core.observeComputed("operation-prepared-rollback");
core.observeValidated("operation-prepared-rollback");
core.observeProjectionsPrepared("operation-prepared-rollback");
core.observeRollback("operation-prepared-rollback", "cancelled before legacy commit");
const commitIdsBeforeResurrection = commitIdsCreated;
expectFacadeError(() => core.observeCanonicalCommit("operation-prepared-rollback", commitFacts(interactiveRevision(2))), "FACADE_LIFECYCLE_INVALID");
assert.equal(commitIdsCreated, commitIdsBeforeResurrection, "rolled-back operation 不得复活或消耗 commitId");

expectFacadeError(() => core.beginShadowOperation({binding: binding("operation-bad", interactiveRevision(9)), kind: "edit", source: "ui", projections: []}), "FACADE_OWNER_DRIFT");
expectFacadeError(() => core.beginShadowOperation({binding: binding("operation-dup-projection", revision), kind: "edit", source: "ui", projections: ["ui", "ui"]}), "FACADE_LIFECYCLE_INVALID");

const headlessOutcome = replayAlternateProfile({
  before: headlessRevision("headless-document-1", 4),
  after: headlessRevision("headless-document-1", 5),
  kind: "edit",
  source: "headless"
});
assert.equal(headlessOutcome.commit.after.headlessDocumentRevision, 5);

const adoptionOutcome = replayAlternateProfile({
  before: interactiveRevision(7, "runtime-session-old"),
  after: interactiveRevision(0, "runtime-session-adopted"),
  kind: "adoption",
  source: "storage"
});
assert.equal(adoptionOutcome.commit.after.canonicalRevision, 0);
assert.equal(adoptionOutcome.commit.after.runtimeMapSessionId, "runtime-session-adopted");

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, value => value.slice(1)));
const runtimeDir = path.join(repoRoot, "app/webgl-generator/src/runtime");
const runtimeEntries = await readdir(runtimeDir, {recursive: true, withFileTypes: true});
let runtimeImports = 0;
for (const entry of runtimeEntries.filter(item => item.isFile() && item.name.endsWith(".js"))) {
  const filename = path.join(entry.parentPath || entry.path, entry.name);
  const source = await readFile(filename, "utf8");
  if (/core\/(?:map-core-engine|map-runtime-coordinator)/u.test(source)) runtimeImports++;
}
assert.equal(runtimeImports, 0, "349-5 shadow facade 不得接管 runtime 路由");

console.log(JSON.stringify({
  ok: true,
  lifecycle: core.getOperation("operation-1").lifecycleTrace,
  projectionRecovery: core.getCommit(firstCommit.commitId).projections,
  rollbackBeforePublish: rolledBack.rollback,
  ownerCached: false,
  nestedBorrowProtected: true,
  nativeCallbackProtected: true,
  accessorDescriptorProtected: true,
  backingStoreProtected: true,
  transitionClaimExclusive: true,
  rollbackTerminal: true,
  projectionBypassRejected: true,
  legacyRevisionWrites: 0,
  legacyHistoryWrites: 0,
  runtimeImports,
  commitsCreated: commitIdsCreated,
  alternateProfiles: [headlessOutcome.commit.after.profile, adoptionOutcome.commit.kind]
}, null, 2));

function interactiveRevision(value, runtimeMapSessionId = "runtime-session-1") {
  return {
    profile: "interactive",
    runtimeMapSessionId,
    canonicalRevision: value,
    topologyRevision: 0,
    domainRevisions: {notes: value}
  };
}

function headlessRevision(headlessDocumentId, value) {
  return {
    profile: "headless",
    headlessDocumentId,
    headlessDocumentRevision: value,
    domainRevisions: {notes: value}
  };
}

function replayAlternateProfile({before, after, kind, source}) {
  let alternateRevision = before;
  let alternateHistory = "alternate:before";
  let alternateCommitId = 0;
  const alternateCore = createMapCoreEngine({
    owner: {
      getMap: () => ({profile: alternateRevision.profile}),
      getRevision: () => alternateRevision,
      getHistoryFingerprint: () => alternateHistory
    },
    createCommitId: () => `alternate-commit-${++alternateCommitId}`
  });
  const operationId = `operation-${kind}-${source}`;
  alternateCore.beginShadowOperation({binding: binding(operationId, before), kind, source, projections: []});
  alternateCore.observeComputed(operationId);
  alternateCore.observeValidated(operationId);
  alternateCore.observeProjectionsPrepared(operationId);
  alternateRevision = after;
  alternateHistory = "alternate:after";
  const commit = alternateCore.observeCanonicalCommit(operationId, commitFacts(after));
  alternateCore.observePublished(commit.commitId);
  return {commit, operation: alternateCore.getOperation(operationId)};
}

function binding(operationId, sourceRevision) {
  return {
    bindingPhase: "pre-commit",
    bindingKind: "compute",
    operationId,
    transactionId: `transaction-${operationId}`,
    operationName: "shadow.edit",
    sourceRevision,
    generationToken: 1,
    lockFingerprint: "locks:none"
  };
}

function commitFacts(after) {
  return {
    after,
    writeSet: ["notes"],
    affected: {note: ["1"]},
    invalidated: ["object-panels"],
    rebuilt: [],
    timings: {legacyCommit: 1}
  };
}

function expectFacadeError(callback, code) {
  assert.throws(callback, error => {
    assert.ok(error instanceof CoreFacadeError);
    assert.equal(error.code, code);
    return true;
  });
}
