#!/usr/bin/env node
import {strict as assert} from "node:assert";
import {performance} from "node:perf_hooks";
import {createGenerationSummary, generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {createDomainPatch, createDomainPatchCommand} from "../app/webgl-generator/src/runtime/domain-patch.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createSetRegenerationLockCommand} from "../app/webgl-generator/src/runtime/regeneration-lock-commands.js";
import {OBJECT_KIND} from "../app/webgl-generator/src/runtime/object-kinds.js";
import {
  buildPopulationAdjustmentPlan,
  buildPopulationTransferPlan,
  createApplyPopulationAdjustmentCommand,
  createApplyPopulationTransferCommand,
  inspectPopulationAdjustment,
  inspectPopulationTransfer
} from "../app/webgl-generator/src/runtime/population-adjustment-commands.js";
import {
  collectPopulationWorkerTransferables,
  fingerprintPopulationSource,
  fingerprintPopulationSourceAsync,
  getPopulationWorkerPatchPolicy,
  runPopulationWorkerTask
} from "../app/webgl-generator/src/runtime/population-worker-task.js";

const tenK = await verifyTenThousandCells();
const hundredK = await verifyHundredThousandCells();

console.log(JSON.stringify({ok: true, tenK, hundredK}, null, 2));

async function verifyTenThousandCells() {
  const base = createMap("population-worker-10k", 10000);
  const binding = createBinding("population-worker-10k", 14);
  const [sourceState, targetState] = chooseStatePair(base, 120);
  const adjustmentRequest = {kind: "adjustment", target: {scope: "state", id: sourceState}, delta: 120};
  let fingerprintYields = 0;
  assert.equal(
    await fingerprintPopulationSourceAsync(base, adjustmentRequest, {budgetMs: 1, yieldToMain: async () => { fingerprintYields++; }}),
    fingerprintPopulationSource(base, adjustmentRequest),
    "分片人口来源指纹与同步 Worker 指纹不一致"
  );
  assert.ok(fingerprintYields > 0, "分片人口来源指纹没有主动让出主线程");
  const sourceSnapshot = structuredClone(base);
  const sourcePackBuffer = base.pack.cells.pop.buffer;
  await verifyDetachedMirrorFingerprint(base, binding, adjustmentRequest, sourceState);

  const adjustmentShadow = structuredClone(base);
  const shadowPackBuffer = adjustmentShadow.pack.cells.pop.buffer;
  const expectedInspection = inspectPopulationAdjustment(adjustmentShadow, adjustmentRequest.target, {delta: adjustmentRequest.delta});
  assert.equal(expectedInspection.valid, true, expectedInspection.reason);
  const adjustmentOutput = await runPopulationWorkerTask({
    map: adjustmentShadow,
    request: adjustmentRequest,
    binding,
    sourceFingerprint: fingerprintPopulationSource(adjustmentShadow, adjustmentRequest),
    render: populationRenderRequest(binding)
  }, taskContext(binding));
  assert.equal(adjustmentOutput.result.executed, true, "10k 人口增减 Worker 未执行");
  assert.deepEqual(adjustmentOutput.inspection, expectedInspection, "人口 Worker 与正式 inspector 不同源");
  assert.equal(adjustmentOutput.plan.binding.mapRevision, binding.mapRevision, "人口 plan 未绑定 revision");
  assert.ok(adjustmentOutput.patch.writeSet.length > 0, "人口增减没有返回领域补丁");
  assert.equal(adjustmentOutput.patch.writeSet.some(path => path === "summary" || path.startsWith("summary.")), false, "人口补丁触碰 summary");
  assert.deepEqual(adjustmentOutput.preparedRender?.layers?.picking?.components, ["cities"], "人口 Worker 必须只准备城市 picking 对象族");
  assert.deepEqual(adjustmentOutput.preparedRender?.binding, populationRenderRequest(binding).binding, "人口 Worker picking binding 漂移");
  assert.equal(shadowPackBuffer.byteLength > 0, true, "人口 Worker 输入 buffer 被 detach");
  const adjustmentTransfers = collectPopulationWorkerTransferables(adjustmentOutput);
  assert.equal(adjustmentTransfers.includes(shadowPackBuffer), false, "人口输出复用了 Worker 输入 buffer");

  const adjustmentFormal = structuredClone(base);
  const adjustmentPlan = buildPopulationAdjustmentPlan(adjustmentFormal, adjustmentRequest.target, {delta: adjustmentRequest.delta});
  createApplyPopulationAdjustmentCommand(adjustmentPlan).apply({map: adjustmentFormal});
  refreshGenerationSummary(adjustmentShadow);
  refreshGenerationSummary(adjustmentFormal);
  assert.deepEqual(normalizeVolatile(adjustmentShadow), normalizeVolatile(adjustmentFormal), "人口增减 Worker 与 legacy 正式命令不一致");

  const target = structuredClone(base);
  const targetBefore = structuredClone(target);
  const identities = captureContainerIdentities(target);
  const history = new EditHistory();
  const patchCommand = createDomainPatchCommand({
    patch: adjustmentOutput.patch,
    policy: getPopulationWorkerPatchPolicy(target, adjustmentOutput.patch),
    label: "Worker 人口增减补丁",
    effects: {}
  });
  history.execute(patchCommand, {map: target});
  refreshGenerationSummary(target);
  assert.deepEqual(target, adjustmentShadow, "人口领域补丁没有精确复现 Worker shadow");
  assertContainerIdentities(target, identities);
  assertPopulationAliases(target, "补丁应用");
  history.undo({map: target});
  refreshGenerationSummary(target);
  assert.deepEqual(target, targetBefore, "人口领域补丁撤销不精确");
  assertContainerIdentities(target, identities);
  assertPopulationAliases(target, "补丁撤销");
  history.redo({map: target});
  refreshGenerationSummary(target);
  assert.deepEqual(target, adjustmentShadow, "人口领域补丁重做不精确");
  assertContainerIdentities(target, identities);
  assertPopulationAliases(target, "补丁重做");

  const historyShadow = structuredClone(adjustmentShadow);
  const undoOutput = await runPopulationWorkerTask({
    map: historyShadow,
    binding,
    historyTransition: {action: "undo", request: adjustmentRequest, patch: patchCommand.getHistoryPatch("undo")}
  }, taskContext(binding, "history-undo"));
  refreshGenerationSummary(historyShadow);
  assert.equal(undoOutput.kind, "population-history");
  assert.deepEqual(historyShadow, targetBefore, "人口 Worker 镜像撤销不精确");
  history.undo({map: target});
  const redoOutput = await runPopulationWorkerTask({
    map: historyShadow,
    binding,
    historyTransition: {action: "redo", request: adjustmentRequest, patch: patchCommand.getHistoryPatch("redo")}
  }, taskContext(binding, "history-redo"));
  refreshGenerationSummary(historyShadow);
  assert.equal(redoOutput.kind, "population-history");
  assert.deepEqual(historyShadow, adjustmentShadow, "人口 Worker 镜像重做不精确");
  history.redo({map: target});

  const transferRequest = {
    kind: "transfer",
    source: {scope: "state", id: sourceState},
    target: {scope: "state", id: targetState},
    amount: 75,
    confirm: true
  };
  const transferShadow = structuredClone(base);
  const transferInspection = inspectPopulationTransfer(transferShadow, transferRequest.source, transferRequest.target, {amount: transferRequest.amount});
  assert.equal(transferInspection.valid, true, transferInspection.reason);
  const transferOutput = await runPopulationWorkerTask({map: transferShadow, request: transferRequest, binding, render: populationRenderRequest(binding)}, taskContext(binding, "transfer"));
  assert.deepEqual(transferOutput.preparedRender?.layers?.picking?.components, ["cities"], "人口转移 Worker 必须只准备城市 picking 对象族");
  assert.deepEqual(transferOutput.preparedRender?.binding, populationRenderRequest(binding).binding, "人口转移 Worker picking binding 漂移");
  const transferFormal = structuredClone(base);
  const transferPlan = buildPopulationTransferPlan(transferFormal, transferRequest.source, transferRequest.target, {amount: transferRequest.amount});
  createApplyPopulationTransferCommand(transferPlan).apply({map: transferFormal});
  refreshGenerationSummary(transferShadow);
  refreshGenerationSummary(transferFormal);
  assert.deepEqual(normalizeVolatile(transferShadow), normalizeVolatile(transferFormal), "人口转移 Worker 与 legacy 正式命令不一致");
  assert.equal(transferOutput.result.amount, transferRequest.amount, "人口转移结果数量错误");

  const fallbackMap = structuredClone(base);
  const fallback = await runPopulationWorkerTask({map: fallbackMap, request: adjustmentRequest, binding}, taskContext(binding, "fallback"));
  refreshGenerationSummary(fallbackMap);
  assert.deepEqual(normalizeVolatile(fallbackMap), normalizeVolatile(adjustmentShadow), "人口 Worker / fallback handler 数据不同源");
  assert.deepEqual(fallback.result, adjustmentOutput.result, "人口 Worker / fallback 摘要不同源");

  await verifyLockCancellationFaultAndStale(base, binding, adjustmentRequest, sourceState);
  await verifyInvalidNoopSemantics(base, binding, sourceState);
  verifyIllegalWriteSet(base, adjustmentOutput);
  assert.deepEqual(base, sourceSnapshot, "人口 Worker 测试改写了正式源图");
  assert.equal(sourcePackBuffer.byteLength > 0, true, "正式人口 buffer 被 detach");

  return {
    cells: base.grid.points.length,
    packCells: base.pack.cells.i.length,
    adjustmentState: sourceState,
    transferTargetState: targetState,
    adjustedPackCells: adjustmentOutput.result.packCells,
    adjustedCities: adjustmentOutput.result.cities,
    transferPackCells: transferOutput.result.packCells,
    transferCities: transferOutput.result.cities,
    patchPaths: adjustmentOutput.patch.writeSet.length,
    legacyParity: true,
    aliases: true,
    objectIdentity: true,
    undoRedo: true,
    workerHistory: true,
    chunkedFingerprintParity: true,
    aliasInsensitiveSourceFingerprint: true,
    locksCancelFaultStale: true,
    zeroInputRejectedWithoutWrites: true
  };
}

async function verifyDetachedMirrorFingerprint(base, binding, request, stateId) {
  const expected = fingerprintPopulationSource(base, request);
  const detached = structuredClone(base);
  detached.politics.states = structuredClone(detached.pack.states);
  assert.notStrictEqual(detached.pack.states, detached.politics.states, "人口来源指纹反例没有分离 states 镜像引用");
  assert.deepEqual(detached.pack.states, detached.politics.states, "人口来源指纹反例的 states 内容不一致");
  assert.equal(fingerprintPopulationSource(detached, request), expected, "人口来源指纹错误依赖 states 镜像引用身份");
  const accepted = await runPopulationWorkerTask({
    map: detached,
    request,
    binding,
    sourceFingerprint: expected
  }, taskContext(binding, "detached-state-mirror"));
  assert.equal(accepted.result.executed, true, "值一致的分离 states 镜像被人口 Worker 拒绝");
  assert.deepEqual(detached.pack.states, detached.politics.states, "人口 Worker 改写后分离 states 镜像内容漂移");

  const drift = structuredClone(base);
  drift.politics.states = structuredClone(drift.pack.states);
  drift.politics.states[stateId].rural = Number(drift.politics.states[stateId].rural || 0) + 1;
  assert.notEqual(fingerprintPopulationSource(drift, request), expected, "states 镜像值漂移未改变人口来源指纹");
  await assert.rejects(
    runPopulationWorkerTask({map: drift, request, binding, sourceFingerprint: expected}, taskContext(binding, "drifted-state-mirror")),
    error => error?.code === "population-worker-source-stale" && error?.details?.aliases?.states === false
  );
}

async function verifyHundredThousandCells() {
  const map = createMap("population-worker-100k", 100000);
  const [stateId] = chooseStatePair(map, 240);
  const request = {kind: "adjustment", target: {scope: "state", id: stateId}, delta: 240};
  const binding = createBinding("population-worker-100k", 27);
  const packBuffer = map.pack.cells.pop.buffer;
  const started = performance.now();
  const output = await runPopulationWorkerTask({
    map,
    request,
    binding,
    sourceFingerprint: fingerprintPopulationSource(map, request),
    render: populationRenderRequest(binding)
  }, taskContext(binding, "100k"));
  const durationMs = Math.round((performance.now() - started) * 10) / 10;
  assert.equal(map.grid.cells.i.length, 99846, "100k 固定夹具 grid cell 数漂移");
  assert.ok(map.pack.cells.i.length >= 50000 && map.pack.cells.i.length <= 100000, "100k pack cell 数异常");
  assert.equal(output.result.executed, true, "100k 人口增减 Worker 未执行");
  assert.ok(output.patch.writeSet.length > 0, "100k 人口 Worker 没有领域补丁");
  assert.deepEqual(output.preparedRender?.layers?.picking?.components, ["cities"], "100k 人口 Worker 必须准备城市 picking 对象族");
  assert.deepEqual(output.preparedRender?.binding, populationRenderRequest(binding).binding, "100k 人口 Worker picking binding 漂移");
  assert.ok(durationMs < 30000, `100k 人口 Worker 超出 30s 预算：${durationMs}ms`);
  assert.equal(packBuffer.byteLength > 0, true, "100k 人口输入 buffer 被 detach");
  const transfers = collectPopulationWorkerTransferables(output);
  assert.equal(transfers.includes(packBuffer), false, "100k 人口输出错误复用输入 buffer");
  assertPopulationAliases(map, "100k Worker");
  return {
    cells: map.grid.cells.i.length,
    packCells: map.pack.cells.i.length,
    stateId,
    durationMs,
    adjustedPackCells: output.result.packCells,
    adjustedCities: output.result.cities,
    patchPaths: output.patch.writeSet.length,
    inputBuffersIntact: true
  };
}

async function verifyLockCancellationFaultAndStale(base, binding, request, stateId) {
  const locked = structuredClone(base);
  createSetRegenerationLockCommand({kind: OBJECT_KIND.STATE, id: stateId}, true).apply({map: locked});
  const locksBefore = structuredClone(locked.regenerationLocks);
  const lockedOutput = await runPopulationWorkerTask({map: locked, request, binding}, taskContext(binding, "locked-explicit"));
  assert.equal(lockedOutput.result.executed, true, "显式人口调整被再生锁错误阻断");
  assert.deepEqual(locked.regenerationLocks, locksBefore, "显式人口调整改写再生锁仓");

  await assertRollbackCase(base, binding, request, {checkpoint: () => false}, "早期取消");
  let checkpoints = 0;
  await assertRollbackCase(base, binding, request, {checkpoint: () => ++checkpoints < 2}, "应用后取消");
  for (const faultAt of ["before-apply", "after-apply", "after-patch"]) {
    await assertRollbackCase(base, binding, request, {faultAt}, `故障 ${faultAt}`);
  }

  const stale = structuredClone(base);
  const staleBefore = structuredClone(stale);
  await assert.rejects(
    runPopulationWorkerTask({map: stale, request, binding, sourceFingerprint: "00000000"}, taskContext(binding, "source-stale")),
    error => error?.code === "population-worker-source-stale"
  );
  assert.deepEqual(stale, staleBefore, "人口来源 stale 拒绝后改写地图");
  const bindingStale = structuredClone(base);
  const bindingStaleBefore = structuredClone(bindingStale);
  await assert.rejects(
    runPopulationWorkerTask({map: bindingStale, request, binding}, taskContext({...binding, generationToken: binding.generationToken + 1}, "binding-stale")),
    error => error?.code === "population-worker-binding-stale"
  );
  assert.deepEqual(bindingStale, bindingStaleBefore, "人口 binding stale 拒绝后改写地图");
}

async function verifyInvalidNoopSemantics(base, binding, stateId) {
  const zeroAdjustment = structuredClone(base);
  const zeroAdjustmentBefore = structuredClone(zeroAdjustment);
  await assert.rejects(
    runPopulationWorkerTask({
      map: zeroAdjustment,
      request: {kind: "adjustment", target: {scope: "state", id: stateId}, delta: 0},
      binding
    }, taskContext(binding, "zero-adjustment")),
    error => error?.code === "population-worker-invalid-delta"
  );
  assert.deepEqual(zeroAdjustment, zeroAdjustmentBefore, "人口 delta=0 非法输入改写地图");

  const pair = chooseStatePair(base, 10);
  const zeroTransfer = structuredClone(base);
  const zeroTransferBefore = structuredClone(zeroTransfer);
  await assert.rejects(
    runPopulationWorkerTask({
      map: zeroTransfer,
      request: {
        kind: "transfer",
        source: {scope: "state", id: pair[0]},
        target: {scope: "state", id: pair[1]},
        amount: 0,
        confirm: true
      },
      binding
    }, taskContext(binding, "zero-transfer")),
    error => error?.code === "population-worker-invalid-amount"
  );
  assert.deepEqual(zeroTransfer, zeroTransferBefore, "人口 amount=0 非法输入改写地图");
}

async function assertRollbackCase(base, binding, request, options, label) {
  const map = structuredClone(base);
  const before = structuredClone(map);
  const context = taskContext(binding, label);
  if (options.checkpoint) context.checkpoint = options.checkpoint;
  await assert.rejects(
    runPopulationWorkerTask({map, request, binding, ...(options.faultAt ? {faultAt: options.faultAt} : {})}, context),
    options.faultAt ? /故障注入/ : error => error?.name === "AbortError"
  );
  assert.deepEqual(map, before, `${label} 没有完整回滚人口 shadow`);
  assertPopulationAliases(map, `${label} 回滚`);
}

function verifyIllegalWriteSet(base, output) {
  const forged = createDomainPatch("population-mutation", ["summary"], {...base, summary: {forged: true}});
  assert.throws(
    () => getPopulationWorkerPatchPolicy(base, forged),
    error => error?.code === "population-worker-policy-path-invalid"
  );
  assert.equal(output.patch.writeSet.some(path => ["routes", "rivers", "features", "pack.routes", "pack.cells.routes"].some(root => path === root || path.startsWith(`${root}.`))), false, "人口补丁越过领域边界");
}

function chooseStatePair(map, amount) {
  const candidates = (map.pack.states || [])
    .filter(item => item?.i && !item.removed)
    .map(item => Number(item.i))
    .filter(id => inspectPopulationAdjustment(map, {scope: "state", id}, {delta: amount}).valid
      && inspectPopulationAdjustment(map, {scope: "state", id}, {delta: -amount}).valid);
  for (let left = 0; left < candidates.length; left++) {
    for (let right = left + 1; right < candidates.length; right++) {
      const inspection = inspectPopulationTransfer(map, {scope: "state", id: candidates[left]}, {scope: "state", id: candidates[right]}, {amount});
      if (inspection.valid) return [candidates[left], candidates[right]];
    }
  }
  throw new Error("没有可用于人口回归的国家对");
}

function normalizeVolatile(map) {
  const value = structuredClone(map);
  if (value.metadata?.derivedStale?.updatedAt) value.metadata.derivedStale.updatedAt = "<time>";
  return value;
}

function refreshGenerationSummary(map) {
  map.summary = createGenerationSummary(
    map.options,
    map.grid,
    map.features,
    map.climate,
    map.society,
    map.politics,
    map.settlements,
    map.markers,
    map.pack,
    map.rivers,
    map.layers,
    map.military,
    map.zones,
    map.economy,
    map.diplomacy
  );
}

function captureContainerIdentities(map) {
  return {
    map,
    grid: map.grid,
    pack: map.pack,
    packCells: map.pack.cells,
    politics: map.politics,
    society: map.society,
    settlements: map.settlements,
    economy: map.economy,
    routes: map.routes,
    rivers: map.rivers,
    features: map.features,
    metadata: map.metadata,
    regenerationLocks: map.regenerationLocks,
    domain: {
      packPopulation: map.pack.cells.pop,
      gridPopulation: map.grid.cells.pop,
      burgs: map.pack.burgs,
      burgObjects: map.pack.burgs.filter(Boolean),
      cities: map.settlements.cities,
      cityObjects: map.settlements.cities.filter(Boolean),
      states: map.pack.states,
      stateObjects: map.pack.states.filter(Boolean),
      provinces: map.pack.provinces,
      provinceObjects: map.pack.provinces.filter(Boolean),
      cultures: map.pack.cultures,
      cultureObjects: map.pack.cultures.filter(Boolean),
      religions: map.pack.religions,
      religionObjects: map.pack.religions.filter(Boolean),
      markets: map.pack.markets,
      marketObjects: map.pack.markets.filter(Boolean),
      economy: map.economy
    }
  };
}

function assertContainerIdentities(map, identities) {
  for (const [key, value] of Object.entries(identities)) {
    if (key === "domain") continue;
    const current = key === "map" ? map : key === "packCells" ? map.pack.cells : map[key];
    assert.strictEqual(current, value, `人口补丁改写了容器身份：${key}`);
  }
  const domain = identities.domain;
  assert.strictEqual(map.pack.cells.pop, domain.packPopulation, "人口补丁替换 pack population TypedArray 身份");
  assert.strictEqual(map.grid.cells.pop, domain.gridPopulation, "人口补丁替换 grid population 数组身份");
  assertIdentityStore(map.pack.burgs, domain.burgs, domain.burgObjects, "burgs");
  assertIdentityStore(map.settlements.cities, domain.cities, domain.cityObjects, "cities");
  assertIdentityStore(map.pack.states, domain.states, domain.stateObjects, "states");
  assertIdentityStore(map.pack.provinces, domain.provinces, domain.provinceObjects, "provinces");
  assertIdentityStore(map.pack.cultures, domain.cultures, domain.cultureObjects, "cultures");
  assertIdentityStore(map.pack.religions, domain.religions, domain.religionObjects, "religions");
  assertIdentityStore(map.pack.markets, domain.markets, domain.marketObjects, "markets");
  assert.strictEqual(map.economy, domain.economy, "人口补丁替换 economy 对象身份");
}

function assertIdentityStore(current, expectedStore, expectedObjects, label) {
  assert.strictEqual(current, expectedStore, `人口补丁替换 ${label} 数组身份`);
  const objects = current.filter(Boolean);
  assert.equal(objects.length, expectedObjects.length, `${label} 对象数量漂移`);
  for (let index = 0; index < objects.length; index++) {
    assert.strictEqual(objects[index], expectedObjects[index], `人口补丁替换 ${label} 对象身份 #${index}`);
  }
}

function assertPopulationAliases(map, stage) {
  assert.strictEqual(map.pack.states, map.politics.states, `${stage} pack/politics states alias 漂移`);
  assert.strictEqual(map.pack.provinces, map.politics.provinces, `${stage} pack/politics provinces alias 漂移`);
  assert.strictEqual(map.pack.cultures, map.society.cultures, `${stage} pack/society cultures alias 漂移`);
  assert.strictEqual(map.pack.religions, map.society.religions, `${stage} pack/society religions alias 漂移`);
  assert.strictEqual(map.pack.markets, map.economy.markets, `${stage} pack/economy markets alias 漂移`);
}

function createMap(seed, cellsTarget) {
  const map = generatePlaceholderMap({seed, cellsTarget, heightmapTemplate: "continents"});
  assertPopulationAliases(map, "生成夹具");
  return map;
}

function createBinding(mapIdentity, operationId) {
  return {mapIdentity, mapRevision: 6, generationToken: 4, lockFingerprint: `${mapIdentity}-locks`, operationId, operationName: "population.compute"};
}

function populationRenderRequest(binding) {
  return {
    binding: {mapIdentity: binding.mapIdentity, mapRevision: binding.mapRevision, topologyRevision: 2},
    layers: ["picking"],
    pickingComponents: ["cities"],
    camera: {scale: 1, offsetX: 0, offsetY: 0},
    canvas: {width: 1280, height: 820, clientWidth: 1280, clientHeight: 820}
  };
}

function taskContext(binding, label = "worker") {
  return {binding, checkpoint: () => true, report: () => {}, label};
}
