#!/usr/bin/env node
import {strict as assert} from "node:assert";
import {performance} from "node:perf_hooks";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {createDomainPatchCommand} from "../app/webgl-generator/src/runtime/domain-patch.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {
  createApplyCultureExpansionCommand,
  createApplyReligionExpansionCommand,
  inspectSocialExpansion
} from "../app/webgl-generator/src/runtime/social-expansion-edit-commands.js";
import {
  collectSocialExpansionWorkerTransferables,
  fingerprintSocialExpansionSource,
  getSocialExpansionPatchPolicy,
  runSocialExpansionWorkerTask
} from "../app/webgl-generator/src/runtime/social-expansion-worker-task.js";

const tenK = await verifyTenThousandCells();
const hundredK = await verifyHundredThousandCells();

console.log(JSON.stringify({
  ok: true,
  tenK,
  hundredK
}, null, 2));

async function verifyTenThousandCells() {
  const base = createMap("social-expansion-worker-10k", 10000);
  const culture = active(base.society.cultures)[0];
  const religion = active(base.society.religions).find(item => item.type !== "Folk");
  assert.ok(culture && religion, "10k 缺少文化或非 Folk 宗教样本");
  const binding = createBinding("social-worker-10k", 4);
  const cultureRequest = {
    kind: "culture",
    id: culture.i,
    mode: "reexpand",
    expansionism: culture.expansionism >= 9.5 ? 0.2 : 9.5,
    includeReligions: true,
    confirm: true
  };
  const expectedInspection = inspectSocialExpansion(base, cultureRequest);
  assert.equal(expectedInspection.valid, true, expectedInspection.reason);
  assert.equal(expectedInspection.changed, true, "10k 文化联动样本没有变化");

  const shadow = structuredClone(base);
  const sourceCultureBuffer = shadow.pack.cells.culture.buffer;
  const sourceReligionBuffer = shadow.pack.cells.religion.buffer;
  const output = await runSocialExpansionWorkerTask(
    {
      map: shadow,
      request: cultureRequest,
      binding,
      sourceFingerprint: fingerprintSocialExpansionSource(shadow, cultureRequest)
    },
    taskContext(binding, "worker")
  );
  assert.equal(output.result.executed, true, "10k Worker 未执行文化联动扩张");
  assert.deepEqual(normalizeInspection(output.inspection), normalizeInspection(expectedInspection), "Worker 预检与正式 inspector 不同源");
  assert.equal(output.plan.binding.mapRevision, binding.mapRevision, "Worker plan 未绑定 revision");
  assert.equal(output.plan.sourceFingerprint, fingerprintSocialExpansionSource(base, cultureRequest), "Worker plan 来源指纹错误");
  assert.ok(output.patch.writeSet.length > 0, "10k Worker 没有返回领域补丁");
  assert.equal(output.patch.writeSet.some(path => path === "summary" || path.startsWith("summary.")), false, "Worker 补丁越权写 summary");
  assert.equal(output.patch.writeSet.some(path => path.startsWith("routes") || path.startsWith("rivers")), false, "社会扩张补丁触碰路线或河流");
  assert.equal(countRanges(output.result.affected.packCells.culture), output.result.changedPackCells, "文化 affected ranges 与结果计数不一致");
  assert.equal(countRanges(output.result.affected.packCells.religion), output.result.linkedReligionPackCells, "宗教联动 affected ranges 与结果计数不一致");

  const transfers = collectSocialExpansionWorkerTransferables(output);
  assert.equal(sourceCultureBuffer.byteLength > 0 && sourceReligionBuffer.byteLength > 0, true, "Worker 输入 buffer 被 detach");
  assert.equal(transfers.includes(sourceCultureBuffer) || transfers.includes(sourceReligionBuffer), false, "Worker 输出错误转移正式输入 buffer");

  const target = structuredClone(base);
  const identities = captureIdentities(target);
  const targetBefore = dataSnapshot(target);
  const history = new EditHistory();
  const patchCommand = createDomainPatchCommand({
    patch: output.patch,
    policy: getSocialExpansionPatchPolicy(target, cultureRequest),
    label: "Worker 文化联动扩张"
  });
  history.execute(patchCommand, {map: target});
  assert.deepEqual(dataSnapshot(target), dataSnapshot(shadow), "Worker 补丁没有精确复现 shadow 结果");
  assertIdentities(target, identities);
  assert.equal(target.society.cultures === target.pack.cultures, identities.sharedCultures, "文化双 store alias 漂移");
  assert.equal(target.society.religions === target.pack.religions, identities.sharedReligions, "宗教双 store alias 漂移");

  const formal = structuredClone(base);
  createApplyCultureExpansionCommand(cultureRequest.id, cultureRequest).apply({map: formal});
  assert.deepEqual(normalizeVolatile(dataSnapshot(target)), normalizeVolatile(dataSnapshot(formal)), "Worker 与 legacy formal command 结果不一致");
  history.undo({map: target});
  assert.deepEqual(dataSnapshot(target), targetBefore, "Worker 领域补丁撤销不精确");
  assertIdentities(target, identities);
  history.redo({map: target});
  assert.deepEqual(dataSnapshot(target), dataSnapshot(shadow), "Worker 领域补丁重做不精确");

  const fallbackOutput = await runSocialExpansionWorkerTask(
    {map: structuredClone(base), request: cultureRequest, binding},
    taskContext(binding, "fallback")
  );
  assert.deepEqual(normalizeVolatile(output), normalizeVolatile(fallbackOutput), "Worker / fallback handler 不同源");

  const religionRequest = {
    kind: "religion",
    id: religion.i,
    mode: "reexpand",
    expansion: religion.expansion === "global" ? "state" : "global",
    expansionism: religion.expansionism >= 8 ? 0.2 : 8,
    confirm: true
  };
  const religionShadow = structuredClone(base);
  const religionOutput = await runSocialExpansionWorkerTask(
    {map: religionShadow, request: religionRequest, binding},
    taskContext(binding, "worker")
  );
  const religionFormal = structuredClone(base);
  createApplyReligionExpansionCommand(religionRequest.id, religionRequest).apply({map: religionFormal});
  assert.deepEqual(normalizeVolatile(dataSnapshot(religionShadow)), normalizeVolatile(dataSnapshot(religionFormal)), "宗教 Worker 与 legacy formal command 不一致");
  assert.equal(religionOutput.patch.writeSet.some(path => path.includes("culture") && !path.includes("religion")), false, "宗教扩张补丁越权改文化");

  await assertLockSemantics(base, binding, cultureRequest);
  await assertCancelFaultAndStale(base, binding, cultureRequest);

  return {
    cells: base.grid.points.length,
    packCells: base.pack.cells.i.length,
    cultureChanged: output.result.changedPackCells,
    linkedReligionChanged: output.result.linkedReligionPackCells,
    religionChanged: religionOutput.result.changedPackCells,
    patchPaths: output.patch.writeSet.length,
    undoRedo: true,
    aliases: true,
    lockCancelFaultStale: true,
    workerFallbackParity: true
  };
}

async function verifyHundredThousandCells() {
  const map = createMap("social-expansion-worker-100k", 100000);
  const culture = active(map.society.cultures)[0];
  assert.ok(culture, "100k 缺少文化样本");
  const request = {
    kind: "culture",
    id: culture.i,
    mode: "reexpand",
    expansionism: culture.expansionism >= 9.8 ? 0.2 : 9.8,
    includeReligions: true,
    confirm: true
  };
  const binding = createBinding("social-worker-100k", 12);
  const sourceCultureBuffer = map.pack.cells.culture.buffer;
  const sourceReligionBuffer = map.pack.cells.religion.buffer;
  const started = performance.now();
  const output = await runSocialExpansionWorkerTask(
    {map, request, binding, sourceFingerprint: fingerprintSocialExpansionSource(map, request)},
    taskContext(binding, "worker-100k")
  );
  const durationMs = Math.round((performance.now() - started) * 10) / 10;
  assert.equal(output.result.executed, true, "100k 社会扩张 Worker 未执行");
  assert.ok(durationMs < 20000, `100k 社会扩张 Worker 超出 20s 预算：${durationMs}ms`);
  assert.equal(sourceCultureBuffer.byteLength > 0 && sourceReligionBuffer.byteLength > 0, true, "100k 输入 buffer 被 detach");
  assert.equal(countRanges(output.result.affected.packCells.culture), output.result.changedPackCells, "100k 文化 affected 不精确");
  assert.equal(countRanges(output.result.affected.packCells.religion), output.result.linkedReligionPackCells, "100k 宗教 affected 不精确");
  assert.ok(output.patch.writeSet.length > 0, "100k 没有领域补丁");
  return {
    cells: map.grid.points.length,
    packCells: map.pack.cells.i.length,
    durationMs,
    cultureChanged: output.result.changedPackCells,
    linkedReligionChanged: output.result.linkedReligionPackCells,
    patchPaths: output.patch.writeSet.length,
    inputBuffersIntact: true
  };
}

async function assertLockSemantics(base, binding, request) {
  const lockedTarget = structuredClone(base);
  lock(lockedTarget, "culture", request.id);
  const lockedBefore = dataSnapshot(lockedTarget);
  const lockedOutput = await runSocialExpansionWorkerTask(
    {map: lockedTarget, request, binding},
    taskContext(binding, "locked-target")
  );
  assert.equal(lockedOutput.result.executed, false, "锁定目标仍执行了重扩");
  assert.equal(lockedOutput.result.reason, "regeneration-locked-noop", "锁定目标 no-op 原因错误");
  assert.equal(lockedOutput.patch.operations.length, 0, "锁定目标返回了补丁");
  assert.deepEqual(dataSnapshot(lockedTarget), lockedBefore, "锁定目标 Worker 改写了输入");

  const guarded = structuredClone(base);
  const otherCulture = active(guarded.society.cultures).find(item => item.i !== request.id);
  const guardedReligion = active(guarded.society.religions)[0];
  assert.ok(otherCulture && guardedReligion, "缺少锁保护样本");
  lock(guarded, "culture", otherCulture.i);
  lock(guarded, "religion", guardedReligion.i);
  const cultureGuard = lockedEnvelope(guarded, "culture", otherCulture.i);
  const religionGuard = lockedEnvelope(guarded, "religion", guardedReligion.i);
  const output = await runSocialExpansionWorkerTask(
    {map: guarded, request, binding},
    taskContext(binding, "locked-domain")
  );
  assert.equal(output.result.executed, true, "非目标锁错误阻断整个社会扩张");
  assert.deepEqual(lockedEnvelope(guarded, "culture", otherCulture.i), cultureGuard, "Worker 改写锁定文化");
  assert.deepEqual(lockedEnvelope(guarded, "religion", guardedReligion.i), religionGuard, "Worker 改写锁定宗教");
}

async function assertCancelFaultAndStale(base, binding, request) {
  const cancelled = structuredClone(base);
  const cancelledBefore = dataSnapshot(cancelled);
  await assert.rejects(
    runSocialExpansionWorkerTask(
      {map: cancelled, request, binding},
      {...taskContext(binding, "cancel"), checkpoint: () => false}
    ),
    error => error?.name === "AbortError"
  );
  assert.deepEqual(dataSnapshot(cancelled), cancelledBefore, "取消前 Worker 改写了输入");

  const faulted = structuredClone(base);
  const faultedBefore = dataSnapshot(faulted);
  await assert.rejects(
    runSocialExpansionWorkerTask(
      {map: faulted, request: {...request, faultAt: "after-ownership"}, binding},
      taskContext(binding, "fault")
    ),
    /after-ownership/
  );
  assert.deepEqual(dataSnapshot(faulted), faultedBefore, "正式故障阶段没有完整回滚 Worker shadow");

  const lateCancelled = structuredClone(base);
  const lateCancelledBefore = dataSnapshot(lateCancelled);
  let checkpoints = 0;
  await assert.rejects(
    runSocialExpansionWorkerTask(
      {map: lateCancelled, request, binding},
      {...taskContext(binding, "late-cancel"), checkpoint: () => ++checkpoints < 3}
    ),
    error => error?.name === "AbortError"
  );
  assert.deepEqual(dataSnapshot(lateCancelled), lateCancelledBefore, "应用后的取消没有回滚 Worker shadow");

  const lateFaulted = structuredClone(base);
  const lateFaultedBefore = dataSnapshot(lateFaulted);
  await assert.rejects(
    runSocialExpansionWorkerTask(
      {map: lateFaulted, request, binding, faultAt: "after-apply"},
      taskContext(binding, "late-fault")
    ),
    error => error?.code === "social-expansion-worker-fault"
  );
  assert.deepEqual(dataSnapshot(lateFaulted), lateFaultedBefore, "应用后的故障没有回滚 Worker shadow");

  await assert.rejects(
    runSocialExpansionWorkerTask(
      {map: structuredClone(base), request, binding},
      taskContext({...binding, mapRevision: binding.mapRevision + 1}, "stale")
    ),
    error => error?.code === "social-expansion-worker-binding-stale"
  );
  await assert.rejects(
    runSocialExpansionWorkerTask(
      {map: structuredClone(base), request, binding, sourceFingerprint: "00000000"},
      taskContext(binding, "source-stale")
    ),
    error => error?.code === "social-expansion-worker-source-stale"
  );
}

function createMap(seed, cellsTarget) {
  return generatePlaceholderMap({
    seed,
    cellsTarget,
    heightmapTemplate: "continents",
    culturesNumber: 10,
    religionsNumber: 6
  });
}

function createBinding(mapIdentity, mapRevision) {
  return {
    mapIdentity,
    mapRevision,
    generationToken: 3,
    lockFingerprint: "social-locks",
    operationId: 22,
    operationName: "edit.social-expansion"
  };
}

function taskContext(binding, source) {
  return {binding, source, checkpoint: () => true, report: () => {}};
}

function active(items) {
  return (items || []).filter(item => item && !item.removed && Number(item.i ?? item.id) > 0);
}

function lock(map, kind, id) {
  map.regenerationLocks ||= {version: 1, entries: []};
  map.regenerationLocks.entries.push({kind, id});
  map.regenerationLocks.version = (Number(map.regenerationLocks.version) || 0) + 1;
}

function captureIdentities(map) {
  return {
    cultureArray: map.society.cultures,
    religionArray: map.society.religions,
    cultureObjects: map.society.cultures.filter(Boolean),
    religionObjects: map.society.religions.filter(Boolean),
    burgs: map.pack.burgs,
    burgObjects: map.pack.burgs.filter(Boolean),
    states: map.pack.states,
    stateObjects: map.pack.states.filter(Boolean),
    sharedCultures: map.society.cultures === map.pack.cultures,
    sharedReligions: map.society.religions === map.pack.religions,
    summary: map.summary,
    routes: map.routes,
    rivers: map.rivers
  };
}

function assertIdentities(map, identities) {
  assert.equal(map.society.cultures, identities.cultureArray, "文化数组身份被替换");
  assert.equal(map.society.religions, identities.religionArray, "宗教数组身份被替换");
  assertIdentityList(map.society.cultures.filter(Boolean), identities.cultureObjects, "文化对象身份被替换");
  assertIdentityList(map.society.religions.filter(Boolean), identities.religionObjects, "宗教对象身份被替换");
  assert.equal(map.pack.burgs, identities.burgs, "burg 数组身份被替换");
  assertIdentityList(map.pack.burgs.filter(Boolean), identities.burgObjects, "burg 对象身份被替换");
  assert.equal(map.pack.states, identities.states, "国家数组身份被替换");
  assertIdentityList(map.pack.states.filter(Boolean), identities.stateObjects, "国家对象身份被替换");
  assert.equal(map.summary, identities.summary, "summary 身份被替换");
  assert.equal(map.routes, identities.routes, "路线身份被替换");
  assert.equal(map.rivers, identities.rivers, "河流身份被替换");
}

function assertIdentityList(actual, expected, message) {
  assert.equal(actual.length, expected.length, message);
  for (let index = 0; index < actual.length; index++) assert.equal(actual[index], expected[index], `${message} #${index}`);
}

function lockedEnvelope(map, kind, id) {
  const plural = `${kind}s`;
  return {
    society: structuredClone(map.society[plural][id]),
    pack: structuredClone(map.pack[plural][id]),
    packCells: ownedCells(map.pack.cells[kind], id),
    gridCells: ownedCells(map.grid.cells[kind], id)
  };
}

function ownedCells(values, id) {
  const result = [];
  for (let index = 0; index < (values?.length || 0); index++) if (Number(values[index]) === Number(id)) result.push(index);
  return result;
}

function dataSnapshot(map) {
  return structuredClone(map);
}

function normalizeInspection(value) {
  const copy = structuredClone(value);
  if (copy?.request) delete copy.request.faultAt;
  return copy;
}

function normalizeVolatile(value) {
  const copy = structuredClone(value);
  stripUpdatedAt(copy);
  return copy;
}

function stripUpdatedAt(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Object.prototype.hasOwnProperty.call(value, "updatedAt")) value.updatedAt = "<timestamp>";
  for (const item of Object.values(value)) stripUpdatedAt(item, seen);
}

function countRanges(ranges = []) {
  return ranges.reduce((sum, range) => sum + Number(range[1] - range[0] + 1), 0);
}
