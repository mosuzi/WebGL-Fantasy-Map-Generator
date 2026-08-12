#!/usr/bin/env node
import {strict as assert} from "node:assert";
import {performance} from "node:perf_hooks";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {normalizeUnitRatios} from "../app/webgl-generator/src/generator/military.js";
import {createDomainPatchCommand} from "../app/webgl-generator/src/runtime/domain-patch.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createSetMilitaryRatiosCommand} from "../app/webgl-generator/src/runtime/military-edit-commands.js";
import {
  collectMilitaryPolicyWorkerTransferables,
  fingerprintMilitaryPolicySource,
  getMilitaryPolicyWorkerPatchPolicy,
  runMilitaryPolicyWorkerTask
} from "../app/webgl-generator/src/runtime/military-policy-worker-task.js";

const tenK = await verifyTenThousandCells();
const hundredK = await verifyHundredThousandCells();

console.log(JSON.stringify({ok: true, tenK, hundredK}, null, 2));

async function verifyTenThousandCells() {
  const base = createMap("military-policy-worker-10k", 10000);
  const state = activeState(base);
  const request = createChangedRequest(state);
  const binding = createBinding("military-policy-10k", 5);
  const regiment = state.military?.[0];
  assert.ok(regiment, "10k 缺少可锁定军团样本");
  base.regenerationLocks ||= {version: 1, entries: []};
  base.regenerationLocks.entries.push({kind: "military", id: `${state.i}:${regiment.i}`});
  base.regenerationLocks.version = Number(base.regenerationLocks.version || 0) + 1;
  const lockedBefore = structuredClone(regiment);
  const inputBuffer = base.pack.cells.h.buffer;

  const shadow = structuredClone(base);
  const output = await runMilitaryPolicyWorkerTask(
    {map: shadow, request, binding, sourceFingerprint: fingerprintMilitaryPolicySource(shadow, request), render: createRenderRequest(binding)},
    taskContext(binding, "worker")
  );
  assert.equal(output.result.executed, true, "军事策略 Worker 未执行");
  assert.equal(Object.isFrozen(output.plan), true, "军事策略 plan 未冻结");
  assert.equal(Object.isFrozen(output.plan.request.ratios), true, "军事比例请求未深冻结");
  assert.ok(output.patch.writeSet.length > 0, "军事策略 Worker 没有返回领域补丁");
  assert.equal(output.patch.writeSet.some(path => path === "summary" || path.startsWith("summary.")), false, "军事策略补丁越权写 summary");
  assert.equal(output.patch.writeSet.some(path => path.startsWith("routes") || path.startsWith("rivers") || path.startsWith("settlements")), false, "军事策略补丁越权写路线、河流或城镇");
  assert.deepEqual(findRegiment(shadow, state.i, regiment.i), lockedBefore, "锁定军团被军事比例调整改写");
  assert.equal(inputBuffer.byteLength > 0, true, "军事策略输入 buffer 被 detach");
  assert.equal(collectMilitaryPolicyWorkerTransferables(output).includes(inputBuffer), false, "军事策略输出错误转移正式输入 buffer");
  for (const layer of ["point", "line", "labels", "picking"]) {
    assert.ok(output.preparedRender?.layers?.[layer], `军事策略 Worker 缺少 ${layer} prepared render`);
  }

  const formal = structuredClone(base);
  createSetMilitaryRatiosCommand(state.i, request.ratios).apply({map: formal});
  assert.deepEqual(normalizeVolatile(militarySnapshot(shadow)), normalizeVolatile(militarySnapshot(formal)), "军事策略 Worker 与 legacy formal command 不一致");

  const target = structuredClone(base);
  const identities = captureIdentities(target);
  const before = militarySnapshot(target);
  const history = new EditHistory();
  const patchCommand = createDomainPatchCommand({
    patch: output.patch,
    policy: getMilitaryPolicyWorkerPatchPolicy(target, output.patch),
    label: "应用 Worker 军事策略"
  });
  history.execute(patchCommand, {map: target});
  assert.deepEqual(normalizeVolatile(militarySnapshot(target)), normalizeVolatile(militarySnapshot(shadow)), "军事策略补丁没有精确复现 shadow");
  assertIdentities(target, identities);
  assertMilitaryAliases(target);
  assert.deepEqual(findRegiment(target, state.i, regiment.i), lockedBefore, "补丁应用改写锁定军团");
  const applied = militarySnapshot(target);
  const undoPatch = patchCommand.getHistoryPatch("undo");
  history.undo({map: target});
  assert.deepEqual(normalizeVolatile(militarySnapshot(target)), normalizeVolatile(before), "军事策略补丁撤销不精确");
  assertIdentities(target, identities);
  assertMilitaryAliases(target);
  history.redo({map: target});
  assert.deepEqual(normalizeVolatile(militarySnapshot(target)), normalizeVolatile(applied), "军事策略补丁重做不精确");
  assertIdentities(target, identities);
  assertMilitaryAliases(target);

  const historyShadow = structuredClone(shadow);
  const undoBinding = {...binding, mapRevision: binding.mapRevision + 1, operationId: binding.operationId + 1};
  const workerUndo = await runMilitaryPolicyWorkerTask({
    map: historyShadow,
    binding: undoBinding,
    historyTransition: {action: "undo", label: "调整兵种比例", request, patch: undoPatch},
    render: createRenderRequest(undoBinding)
  }, taskContext(undoBinding, "history-undo"));
  assert.equal(workerUndo.kind, "military-policy-history", "军事策略撤销未走 Worker 历史模式");
  assert.deepEqual(normalizeVolatile(militarySnapshot(historyShadow)), normalizeVolatile(before), "军事策略 Worker 镜像撤销不精确");
  const redoBinding = {...undoBinding, mapRevision: undoBinding.mapRevision + 1, operationId: undoBinding.operationId + 1};
  const workerRedo = await runMilitaryPolicyWorkerTask({
    map: historyShadow,
    binding: redoBinding,
    historyTransition: {action: "redo", label: "调整兵种比例", request, patch: output.patch},
    render: createRenderRequest(redoBinding)
  }, taskContext(redoBinding, "history-redo"));
  assert.equal(workerRedo.kind, "military-policy-history", "军事策略重做未走 Worker 历史模式");
  assert.deepEqual(normalizeVolatile(militarySnapshot(historyShadow)), normalizeVolatile(applied), "军事策略 Worker 镜像重做不精确");
  for (const transition of [workerUndo, workerRedo]) {
    for (const layer of ["point", "line", "labels", "picking"]) assert.ok(transition.preparedRender?.layers?.[layer], `军事策略历史缺少 ${layer} prepared render`);
  }

  const fallbackShadow = structuredClone(base);
  const fallback = await runMilitaryPolicyWorkerTask({map: fallbackShadow, request, binding, render: createRenderRequest(binding)}, taskContext(binding, "fallback"));
  assert.deepEqual(normalizeVolatile(output), normalizeVolatile(fallback), "军事策略 Worker / fallback handler 不同源");
  assert.deepEqual(normalizeVolatile(militarySnapshot(shadow)), normalizeVolatile(militarySnapshot(fallbackShadow)), "军事策略 Worker / fallback shadow 不同源");

  const noOpMap = structuredClone(base);
  const noOpState = noOpMap.pack.states[state.i];
  const noOpRequest = {stateId: state.i, ratios: noOpState.militaryPolicy.unitRatios, confirm: true};
  const noOp = await runMilitaryPolicyWorkerTask({map: noOpMap, request: noOpRequest, binding}, taskContext(binding, "no-op"));
  assert.equal(noOp.result.executed, false, "相同比例未走 no-op");
  assert.equal(noOp.patch.operations.length, 0, "相同比例 no-op 返回了补丁");

  await assertCancelFaultAndStale(base, binding, request);
  return {
    cells: base.grid.points.length,
    packCells: base.pack.cells.i.length,
    stateId: state.i,
    lockedRegiments: output.result.lockedRegiments,
    changedPaths: output.patch.writeSet.length,
    legacyParity: true,
    undoRedoAliases: true,
    workerHistoryPrepared: true,
    lockCancelLateFaultStale: true,
    inputBuffersIntact: true,
    workerFallbackParity: true
  };
}

async function verifyHundredThousandCells() {
  const map = createMap("military-policy-worker-100k", 100000);
  const state = activeState(map);
  const request = createChangedRequest(state);
  const binding = createBinding("military-policy-100k", 13);
  const inputBuffer = map.pack.cells.h.buffer;
  const started = performance.now();
  const output = await runMilitaryPolicyWorkerTask({map, request, binding}, taskContext(binding, "worker-100k"));
  const durationMs = Math.round((performance.now() - started) * 10) / 10;
  assert.equal(output.result.executed, true, "100k 军事策略 Worker 未执行");
  assert.ok(durationMs < 20000, `100k 军事策略 Worker 超出 20s 预算：${durationMs}ms`);
  assert.equal(inputBuffer.byteLength > 0, true, "100k 军事策略输入 buffer 被 detach");
  assert.ok(output.patch.writeSet.length > 0, "100k 军事策略缺少领域补丁");
  return {
    cells: map.grid.points.length,
    packCells: map.pack.cells.i.length,
    durationMs,
    changedPaths: output.patch.writeSet.length,
    inputBuffersIntact: true
  };
}

async function assertCancelFaultAndStale(base, binding, request) {
  const cancelled = structuredClone(base);
  const cancelledBefore = militarySnapshot(cancelled);
  await assert.rejects(
    runMilitaryPolicyWorkerTask({map: cancelled, request, binding}, {...taskContext(binding, "cancel"), checkpoint: () => false}),
    error => error?.name === "AbortError"
  );
  assert.deepEqual(normalizeVolatile(militarySnapshot(cancelled)), normalizeVolatile(cancelledBefore), "前置取消改写军事输入");

  const late = structuredClone(base);
  const lateBefore = militarySnapshot(late);
  let checkpoints = 0;
  await assert.rejects(
    runMilitaryPolicyWorkerTask({map: late, request, binding}, {...taskContext(binding, "late"), checkpoint: () => ++checkpoints < 2}),
    error => error?.name === "AbortError"
  );
  assert.deepEqual(normalizeVolatile(militarySnapshot(late)), normalizeVolatile(lateBefore), "应用后的取消没有回滚军事 shadow");

  const faulted = structuredClone(base);
  const faultedBefore = militarySnapshot(faulted);
  await assert.rejects(
    runMilitaryPolicyWorkerTask({map: faulted, request, binding, faultAt: "after-patch"}, taskContext(binding, "fault")),
    error => error?.code === "military-policy-worker-fault"
  );
  assert.deepEqual(normalizeVolatile(militarySnapshot(faulted)), normalizeVolatile(faultedBefore), "补丁后的故障没有回滚军事 shadow");

  await assert.rejects(
    runMilitaryPolicyWorkerTask({map: structuredClone(base), request, binding}, taskContext({...binding, mapRevision: binding.mapRevision + 1}, "binding-stale")),
    error => error?.code === "military-policy-worker-binding-stale"
  );
  await assert.rejects(
    runMilitaryPolicyWorkerTask({map: structuredClone(base), request, binding, sourceFingerprint: "00000000"}, taskContext(binding, "source-stale")),
    error => error?.code === "military-policy-worker-source-stale"
  );
  await assert.rejects(
    runMilitaryPolicyWorkerTask({map: structuredClone(base), request: {...request, confirm: false}, binding}, taskContext(binding, "confirm")),
    error => error?.code === "confirmation_required"
  );
}

function createMap(seed, cellsTarget) {
  return generatePlaceholderMap({seed, cellsTarget, heightmapTemplate: "continents"});
}

function activeState(map) {
  const state = map.pack.states.find(item => item?.i && !item.removed && item.military?.length);
  if (!state) throw new Error("地图缺少有效军事国家");
  return state;
}

function createChangedRequest(state) {
  const current = normalizeUnitRatios(state.militaryPolicy?.unitRatios || {});
  return {
    stateId: state.i,
    ratios: normalizeUnitRatios({...current, infantry: current.infantry + 0.7, cavalry: current.cavalry * 0.35}),
    confirm: true
  };
}

function createBinding(mapIdentity, mapRevision) {
  return {mapIdentity, mapRevision, generationToken: 3, lockFingerprint: "military-locks", operationId: 32, operationName: "military-policy.compute"};
}

function taskContext(binding, source) {
  return {binding, source, checkpoint: () => true, report: () => {}};
}

function createRenderRequest(binding) {
  return {
    binding: {mapIdentity: binding.mapIdentity, mapRevision: binding.mapRevision},
    layers: ["point", "line", "labels", "picking"],
    camera: {scale: 1, offsetX: 0, offsetY: 0},
    canvas: {width: 1200, height: 720, clientWidth: 1200, clientHeight: 720},
    visibility: {}, visualTheme: {}, unitPreferences: {}, viewOptions: {}, labelOptions: {}
  };
}

function findRegiment(map, stateId, regimentId) {
  return map.pack.states[stateId]?.military?.find(item => Number(item?.i) === Number(regimentId)) || null;
}

function captureIdentities(map) {
  return {
    packStates: map.pack.states,
    packStateObjects: map.pack.states.filter(Boolean),
    politicsStates: map.politics?.states,
    politicsStateObjects: map.politics?.states?.filter(Boolean) || [],
    packCells: map.pack.cells,
    settlements: map.settlements,
    routes: map.settlements.routes,
    rivers: map.rivers,
    summary: map.summary
  };
}

function assertIdentities(map, identities) {
  assert.equal(map.pack.states, identities.packStates, "pack states 数组身份被替换");
  assertIdentityList(map.pack.states.filter(Boolean), identities.packStateObjects, "pack state 对象身份被替换");
  assert.equal(map.politics?.states, identities.politicsStates, "politics states 数组身份被替换");
  assertIdentityList(map.politics?.states?.filter(Boolean) || [], identities.politicsStateObjects, "politics state 对象身份被替换");
  assert.equal(map.pack.cells, identities.packCells, "pack cells 身份被替换");
  assert.equal(map.settlements, identities.settlements, "settlements 身份被替换");
  assert.equal(map.settlements.routes, identities.routes, "路线身份被替换");
  assert.equal(map.rivers, identities.rivers, "河流身份被替换");
  assert.equal(map.summary, identities.summary, "summary 身份被替换");
}

function assertIdentityList(actual, expected, message) {
  assert.equal(actual.length, expected.length, message);
  for (let index = 0; index < actual.length; index++) assert.equal(actual[index], expected[index], `${message} #${index}`);
}

function assertMilitaryAliases(map) {
  assert.equal(map.military, map.pack.military, "map / pack military alias 漂移");
  if (!Array.isArray(map.politics?.states) || map.politics.states === map.pack.states) return;
  for (const state of map.pack.states.filter(Boolean)) {
    const mirror = map.politics.states[state.i];
    if (!mirror) continue;
    assert.equal(mirror.military, state.military, `国家 #${state.i} military 镜像未共享`);
    assert.equal(mirror.militaryPolicy, state.militaryPolicy, `国家 #${state.i} policy 镜像未共享`);
    assert.equal(mirror.militaryDiagnostics, state.militaryDiagnostics, `国家 #${state.i} diagnostics 镜像未共享`);
    assert.equal(mirror.alert, state.alert, `国家 #${state.i} alert 镜像漂移`);
  }
}

function militarySnapshot(map) {
  return structuredClone({
    military: map.military,
    packMilitary: map.pack.military,
    packStates: map.pack.states.map(state => state ? {
      i: state.i,
      alert: state.alert,
      military: state.military,
      militaryPolicy: state.militaryPolicy,
      militaryDiagnostics: state.militaryDiagnostics
    } : null),
    politicsStates: map.politics?.states?.map(state => state ? {
      i: state.i,
      alert: state.alert,
      military: state.military,
      militaryPolicy: state.militaryPolicy,
      militaryDiagnostics: state.militaryDiagnostics
    } : null)
  });
}

function normalizeVolatile(value) {
  const copy = structuredClone(value);
  walk(copy);
  return copy;
}

function walk(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (value.metadata && Object.prototype.hasOwnProperty.call(value.metadata, "buildMs")) value.metadata.buildMs = "<duration>";
  for (const child of Object.values(value)) walk(child, seen);
}
