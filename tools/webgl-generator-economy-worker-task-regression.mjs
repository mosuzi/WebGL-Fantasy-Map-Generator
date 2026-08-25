#!/usr/bin/env node
import {strict as assert} from "node:assert";
import {performance} from "node:perf_hooks";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {createDomainPatch, createDomainPatchCommand} from "../app/webgl-generator/src/runtime/domain-patch.js";
import {
  createApplyMarketAssignmentCommand,
  createRebuildEconomyCommand
} from "../app/webgl-generator/src/runtime/economy-edit-commands.js";
import {
  collectEconomyWorkerTransferables,
  fingerprintEconomySource,
  getEconomyWorkerPatchPolicy,
  runEconomyWorkerTask
} from "../app/webgl-generator/src/runtime/economy-worker-task.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createSetRegenerationLockCommand} from "../app/webgl-generator/src/runtime/regeneration-lock-commands.js";
import {OBJECT_KIND} from "../app/webgl-generator/src/runtime/object-kinds.js";
import {createRenderResourceBinding} from "../app/webgl-generator/src/renderer/render-resource-binding.js";

const tenK = await verifyTenThousandCells();
const hundredK = await verifyHundredThousandCells();

console.log(JSON.stringify({ok: true, tenK, hundredK}, null, 2));

async function verifyTenThousandCells() {
  const base = createMap("economy-worker-10k", 10000);
  const binding = createBinding("economy-worker-10k", 8);
  const sourceSnapshot = structuredClone(base);
  const sourceBuffer = base.pack.cells.market.buffer;

  const rebuildRequest = {kind: "rebuild", confirm: true};
  const rebuildShadow = structuredClone(base);
  const rebuildInputBuffer = rebuildShadow.pack.cells.market.buffer;
  const rebuildOutput = await runEconomyWorkerTask({
    map: rebuildShadow,
    request: rebuildRequest,
    binding,
    sourceFingerprint: fingerprintEconomySource(rebuildShadow, rebuildRequest),
    render: economyRenderRequest(binding)
  }, taskContext(binding));
  assert.equal(rebuildOutput.result.executed, true, "10k 经济重算 Worker 未执行");
  assert.equal(rebuildOutput.plan.binding.mapRevision, binding.mapRevision, "经济 plan 未绑定 revision");
  assert.equal(rebuildOutput.patch.writeSet.some(path => path === "summary" || path.startsWith("summary.")), false, "经济补丁触碰 summary");
  assert.deepEqual(rebuildOutput.preparedRender?.layers?.picking?.components, ["cities"], "经济 Worker 必须只准备城市 picking 对象族");
  assert.deepEqual(rebuildOutput.preparedRender?.binding, economyRenderRequest(binding).binding, "经济 Worker picking binding 漂移");
  assert.equal(rebuildInputBuffer.byteLength > 0, true, "经济 Worker 输入 buffer 被 detach");
  assert.equal(collectEconomyWorkerTransferables(rebuildOutput).includes(rebuildInputBuffer), false, "经济输出复用了 Worker 输入 buffer");

  const rebuildFormal = structuredClone(base);
  createRebuildEconomyCommand().apply({map: rebuildFormal});
  assert.deepEqual(rebuildShadow, rebuildFormal, "经济 rebuild Worker 与 legacy 正式命令不一致");

  const assignment = chooseMarketAssignment(base);
  const assignmentRequest = {kind: "market-assignment", changes: [assignment], confirm: true};
  const assignmentShadow = structuredClone(base);
  const assignmentBuffer = assignmentShadow.pack.cells.market.buffer;
  const assignmentOutput = await runEconomyWorkerTask({
    map: assignmentShadow,
    request: assignmentRequest,
    binding,
    sourceFingerprint: fingerprintEconomySource(assignmentShadow, assignmentRequest),
    render: economyRenderRequest(binding)
  }, taskContext(binding));
  assert.equal(assignmentOutput.result.executed, true, "10k 市场归属 Worker 未执行");
  assert.ok(assignmentOutput.patch.writeSet.length > 0, "市场归属没有返回精确补丁");
  assert.deepEqual(assignmentOutput.preparedRender?.layers?.picking?.components, ["cities"], "市场归属 Worker 必须只准备城市 picking 对象族");
  assert.deepEqual(assignmentOutput.preparedRender?.binding, economyRenderRequest(binding).binding, "市场归属 Worker picking binding 漂移");
  assert.equal(collectEconomyWorkerTransferables(assignmentOutput).includes(assignmentBuffer), false, "市场归属输出复用了输入 buffer");

  const assignmentFormal = structuredClone(base);
  createApplyMarketAssignmentCommand([assignment]).apply({map: assignmentFormal});
  assert.deepEqual(assignmentShadow, assignmentFormal, "市场归属 Worker 与 legacy 正式命令不一致");

  const target = structuredClone(base);
  const targetBefore = structuredClone(target);
  const identities = captureContainerIdentities(target);
  const history = new EditHistory();
  const patchCommand = createDomainPatchCommand({
    patch: assignmentOutput.patch,
    policy: getEconomyWorkerPatchPolicy(target, assignmentOutput.patch),
    label: "Worker 市场归属补丁",
    effects: {}
  });
  history.execute(patchCommand, {map: target});
  assert.deepEqual(target, assignmentShadow, "经济领域补丁没有精确复现 Worker shadow");
  assertContainerIdentities(target, identities);
  assertEconomyAliases(target, "补丁应用");
  const historyMirror = structuredClone(assignmentShadow);
  const undoOutput = await runEconomyWorkerTask({
    map: historyMirror,
    binding,
    historyTransition: {action: "undo", request: assignmentRequest, patch: patchCommand.getHistoryPatch("undo")}
  }, taskContext(binding, "history-undo"));
  assert.equal(undoOutput.kind, "economy-history", "经济 Worker 撤销结果类型错误");
  assert.deepEqual(historyMirror, targetBefore, "经济 Worker 镜像撤销不精确");
  history.undo({map: target});
  assert.deepEqual(target, targetBefore, "经济领域补丁撤销不精确");
  assertContainerIdentities(target, identities);
  assertEconomyAliases(target, "补丁撤销");
  const redoOutput = await runEconomyWorkerTask({
    map: historyMirror,
    binding,
    historyTransition: {action: "redo", request: assignmentRequest, patch: patchCommand.getHistoryPatch("redo")}
  }, taskContext(binding, "history-redo"));
  assert.equal(redoOutput.history.action, "redo", "经济 Worker 重做动作错误");
  assert.deepEqual(historyMirror, assignmentShadow, "经济 Worker 镜像重做不精确");
  history.redo({map: target});
  assert.deepEqual(target, assignmentShadow, "经济领域补丁重做不精确");
  assertContainerIdentities(target, identities);
  assertEconomyAliases(target, "补丁重做");

  const fallbackMap = structuredClone(base);
  const fallback = await runEconomyWorkerTask({map: fallbackMap, request: assignmentRequest, binding}, taskContext(binding, "fallback"));
  assert.deepEqual(fallbackMap, assignmentShadow, "经济 Worker / fallback handler 数据不同源");
  assert.deepEqual(fallback.result, assignmentOutput.result, "经济 Worker / fallback 摘要不同源");

  await verifyLocksCancellationFaultsAndStale(base, binding, assignmentRequest);
  verifyIllegalWriteSet(base, assignmentOutput);
  assert.deepEqual(base, sourceSnapshot, "经济 Worker 测试改写了正式源图");
  assert.equal(sourceBuffer.byteLength > 0, true, "正式源图 market buffer 被 detach");

  return {
    cells: base.grid.points.length,
    packCells: base.pack.cells.i.length,
    markets: base.pack.markets.filter(Boolean).length,
    deals: base.pack.deals.filter(Boolean).length,
    assignmentCell: assignment.packCell,
    patchPaths: assignmentOutput.patch.writeSet.length,
    legacyParity: true,
    aliases: true,
    objectIdentity: true,
    undoRedo: true,
    locksCancelFaultStale: true
  };
}

async function verifyHundredThousandCells() {
  const map = createMap("economy-worker-100k", 100000);
  const request = {kind: "market-assignment", changes: [chooseMarketAssignment(map)], confirm: true};
  const binding = createBinding("economy-worker-100k", 21);
  const inputBuffer = map.pack.cells.market.buffer;
  const started = performance.now();
  const output = await runEconomyWorkerTask({
    map,
    request,
    binding,
    sourceFingerprint: fingerprintEconomySource(map, request),
    render: economyRenderRequest(binding)
  }, taskContext(binding, "100k"));
  const durationMs = Math.round((performance.now() - started) * 10) / 10;
  assert.equal(map.grid.cells.i.length, 99846, "100k 固定夹具 grid cell 数漂移");
  assert.ok(map.pack.cells.i.length >= 50000 && map.pack.cells.i.length <= 100000, "100k pack cell 数异常");
  assert.equal(output.result.executed, true, "100k 市场归属 / 经济 rebuild 未执行");
  assert.ok(output.patch.writeSet.length > 0, "100k 经济 Worker 没有领域补丁");
  assert.deepEqual(output.preparedRender?.layers?.picking?.components, ["cities"], "100k 经济 Worker 必须准备城市 picking 对象族");
  assert.deepEqual(output.preparedRender?.binding, economyRenderRequest(binding).binding, "100k 经济 Worker picking binding 漂移");
  assert.ok(durationMs < 30000, `100k 经济 Worker 超出 30s 预算：${durationMs}ms`);
  assert.equal(inputBuffer.byteLength > 0, true, "100k 输入 buffer 被 detach");
  assert.equal(collectEconomyWorkerTransferables(output).includes(inputBuffer), false, "100k 输出错误复用输入 buffer");
  assertEconomyAliases(map, "100k Worker");
  return {
    cells: map.grid.cells.i.length,
    packCells: map.pack.cells.i.length,
    markets: map.pack.markets.filter(Boolean).length,
    deals: map.pack.deals.filter(Boolean).length,
    durationMs,
    patchPaths: output.patch.writeSet.length,
    inputBuffersIntact: true
  };
}

async function verifyLocksCancellationFaultsAndStale(base, binding, assignmentRequest) {
  const lockedAssignment = structuredClone(base);
  const lockedMarket = Number(lockedAssignment.pack.cells.market[assignmentRequest.changes[0].packCell]);
  createSetRegenerationLockCommand({kind: OBJECT_KIND.ECONOMY_MARKET, id: lockedMarket}, true).apply({map: lockedAssignment});
  const lockedAssignmentBefore = structuredClone(lockedAssignment);
  await assert.rejects(
    runEconomyWorkerTask({map: lockedAssignment, request: assignmentRequest, binding}, taskContext(binding, "locked-assignment")),
    error => error?.code === "regeneration_lock_conflict"
  );
  assert.deepEqual(lockedAssignment, lockedAssignmentBefore, "锁定市场冲突没有回滚 shadow");
  assertEconomyAliases(lockedAssignment, "锁冲突回滚");

  const guarded = structuredClone(base);
  const guardedMarket = guarded.pack.markets.find(Boolean);
  const guardedDeal = guarded.pack.deals.find(Boolean);
  createSetRegenerationLockCommand({kind: OBJECT_KIND.ECONOMY_MARKET, id: guardedMarket.i}, true).apply({map: guarded});
  createSetRegenerationLockCommand({kind: OBJECT_KIND.TRADE_FLOW, id: guardedDeal.i}, true).apply({map: guarded});
  const marketSnapshot = structuredClone(guarded.pack.markets[guardedMarket.i]);
  const dealSnapshot = structuredClone(guarded.pack.deals.find(item => Number(item?.i) === Number(guardedDeal.i)));
  const guardedRequest = {kind: "rebuild", confirm: true};
  const guardedResult = await runEconomyWorkerTask({map: guarded, request: guardedRequest, binding}, taskContext(binding, "guarded"));
  assert.equal(guardedResult.result.executed, true, "局部锁错误阻断整个经济重算");
  assert.deepEqual(guarded.pack.markets[guardedMarket.i], marketSnapshot, "经济重算改写锁定市场");
  assert.deepEqual(guarded.pack.deals.find(item => Number(item?.i) === Number(guardedDeal.i)), dealSnapshot, "经济重算改写锁定交易流");

  const fullyLocked = structuredClone(base);
  fullyLocked.regenerationLocks = {
    version: 1,
    entries: [
      ...fullyLocked.pack.markets.filter(Boolean).map(item => ({kind: OBJECT_KIND.ECONOMY_MARKET, id: Number(item.i ?? item.id)})),
      ...fullyLocked.pack.deals.filter(Boolean).map(item => ({kind: OBJECT_KIND.TRADE_FLOW, id: Number(item.i ?? item.id)}))
    ]
  };
  const fullyLockedBefore = structuredClone(fullyLocked);
  const fullyLockedOutput = await runEconomyWorkerTask({map: fullyLocked, request: guardedRequest, binding}, taskContext(binding, "fully-locked"));
  assert.equal(fullyLockedOutput.result.executed, false, "全锁经济领域仍执行重算");
  assert.equal(fullyLockedOutput.patch.operations.length, 0, "全锁经济领域返回了补丁");
  assert.deepEqual(fullyLocked, fullyLockedBefore, "全锁 no-op 改写地图");

  const emptyAssignment = structuredClone(base);
  const emptyBefore = structuredClone(emptyAssignment);
  const emptyOutput = await runEconomyWorkerTask({
    map: emptyAssignment,
    request: {kind: "market-assignment", changes: [], confirm: true},
    binding
  }, taskContext(binding, "no-op"));
  assert.equal(emptyOutput.result.executed, false, "空市场归属未按 no-op 返回");
  assert.equal(emptyOutput.patch.operations.length, 0, "空市场归属返回补丁");
  assert.deepEqual(emptyAssignment, emptyBefore, "空市场归属改写地图");

  await assertRollbackCase(base, binding, assignmentRequest, {checkpoint: () => false}, "早期取消");
  let checkpoints = 0;
  await assertRollbackCase(base, binding, assignmentRequest, {checkpoint: () => ++checkpoints < 2}, "应用后取消");
  for (const faultAt of ["before-apply", "after-apply", "after-patch"]) {
    await assertRollbackCase(base, binding, assignmentRequest, {faultAt}, `故障 ${faultAt}`);
  }

  const stale = structuredClone(base);
  const staleBefore = structuredClone(stale);
  await assert.rejects(
    runEconomyWorkerTask({map: stale, request: assignmentRequest, binding, sourceFingerprint: "00000000"}, taskContext(binding, "source-stale")),
    error => error?.code === "economy-worker-source-stale"
  );
  assert.deepEqual(stale, staleBefore, "经济来源 stale 拒绝后改写地图");
  const bindingStale = structuredClone(base);
  const bindingStaleBefore = structuredClone(bindingStale);
  await assert.rejects(
    runEconomyWorkerTask({map: bindingStale, request: assignmentRequest, binding}, taskContext({...binding, mapRevision: binding.mapRevision + 1}, "binding-stale")),
    error => error?.code === "economy-worker-binding-stale"
  );
  assert.deepEqual(bindingStale, bindingStaleBefore, "经济 binding stale 拒绝后改写地图");
}

async function assertRollbackCase(base, binding, request, options, label) {
  const map = structuredClone(base);
  const before = structuredClone(map);
  const context = taskContext(binding, label);
  if (options.checkpoint) context.checkpoint = options.checkpoint;
  await assert.rejects(
    runEconomyWorkerTask({map, request, binding, ...(options.faultAt ? {faultAt: options.faultAt} : {})}, context),
    options.faultAt ? /故障注入/ : error => error?.name === "AbortError"
  );
  assert.deepEqual(map, before, `${label} 没有完整回滚经济 shadow`);
  assertEconomyAliases(map, `${label} 回滚`);
}

function verifyIllegalWriteSet(base, output) {
  const forged = createDomainPatch("economy-mutation", ["summary"], {...base, summary: {forged: true}});
  assert.throws(
    () => getEconomyWorkerPatchPolicy(base, forged),
    error => error?.code === "economy-worker-policy-path-invalid"
  );
  assert.equal(output.patch.writeSet.some(path => ["routes", "rivers", "features", "grid", "society"].some(root => path === root || path.startsWith(`${root}.`))), false, "经济补丁越过领域边界");
}

function chooseMarketAssignment(map) {
  const marketIds = map.pack.markets.filter(Boolean).map(item => Number(item.i ?? item.id));
  for (const packCell of map.pack.cells.i) {
    if (Number(map.pack.cells.h[packCell]) < 20) continue;
    const before = Number(map.pack.cells.market[packCell] || 0);
    const after = marketIds.find(id => id !== before);
    if (before > 0 && after > 0) return {packCell: Number(packCell), before, after};
  }
  throw new Error("没有可用于市场归属回归的陆地 cell");
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
    routes: map.routes,
    rivers: map.rivers,
    features: map.features,
    metadata: map.metadata,
    regenerationLocks: map.regenerationLocks,
    domain: {
      marketCells: map.pack.cells.market,
      goods: map.pack.goods,
      goodObjects: map.pack.goods.filter(Boolean),
      markets: map.pack.markets,
      marketObjects: map.pack.markets.filter(Boolean),
      burgs: map.pack.burgs,
      burgObjects: map.pack.burgs.filter(Boolean),
      states: map.pack.states,
      stateObjects: map.pack.states.filter(Boolean),
      provinces: map.pack.provinces,
      provinceObjects: map.pack.provinces.filter(Boolean),
      cities: map.settlements.cities,
      cityObjects: map.settlements.cities.filter(Boolean),
      economy: map.economy
    }
  };
}

function assertContainerIdentities(map, identities) {
  for (const [key, value] of Object.entries(identities)) {
    if (key === "domain") continue;
    const current = key === "map" ? map : key === "packCells" ? map.pack.cells : map[key];
    assert.strictEqual(current, value, `经济补丁改写了容器身份：${key}`);
  }
  const domain = identities.domain;
  assert.strictEqual(map.pack.cells.market, domain.marketCells, "经济补丁替换 market TypedArray 身份");
  assertIdentityStore(map.pack.goods, domain.goods, domain.goodObjects, "goods");
  assertIdentityStore(map.pack.markets, domain.markets, domain.marketObjects, "markets");
  assertIdentityStore(map.pack.burgs, domain.burgs, domain.burgObjects, "burgs");
  assertIdentityStore(map.pack.states, domain.states, domain.stateObjects, "states");
  assertIdentityStore(map.pack.provinces, domain.provinces, domain.provinceObjects, "provinces");
  assertIdentityStore(map.settlements.cities, domain.cities, domain.cityObjects, "cities");
  assert.strictEqual(map.economy, domain.economy, "经济补丁替换 economy 对象身份");
}

function assertIdentityStore(current, expectedStore, expectedObjects, label) {
  assert.strictEqual(current, expectedStore, `经济补丁替换 ${label} 数组身份`);
  const objects = current.filter(Boolean);
  assert.equal(objects.length, expectedObjects.length, `${label} 对象数量漂移`);
  for (let index = 0; index < objects.length; index++) {
    assert.strictEqual(objects[index], expectedObjects[index], `经济补丁替换 ${label} 对象身份 #${index}`);
  }
}

function assertEconomyAliases(map, stage) {
  assert.strictEqual(map.pack.goods, map.economy.goods, `${stage} pack/economy goods alias 漂移`);
  assert.strictEqual(map.pack.markets, map.economy.markets, `${stage} pack/economy markets alias 漂移`);
  assert.strictEqual(map.pack.deals, map.economy.deals, `${stage} pack/economy deals alias 漂移`);
  assert.strictEqual(map.pack.states, map.politics.states, `${stage} pack/politics states alias 漂移`);
  assert.strictEqual(map.pack.provinces, map.politics.provinces, `${stage} pack/politics provinces alias 漂移`);
}

function createMap(seed, cellsTarget) {
  const map = generatePlaceholderMap({seed, cellsTarget, heightmapTemplate: "continents"});
  assertEconomyAliases(map, "生成夹具");
  return map;
}

function createBinding(mapIdentity, operationId) {
  return {mapIdentity, mapRevision: 5, generationToken: 3, lockFingerprint: `${mapIdentity}-locks`, operationId, operationName: "economy.compute"};
}

function economyRenderRequest(binding) {
  return {
    binding: createRenderResourceBinding({
      mapIdentity: binding.mapIdentity,
      sourceRevision: binding.mapRevision + 1,
      topologyRevision: 2
    }, {
      renderPreparationId: `economy:${binding.mapIdentity}:${binding.operationId}`,
      renderGeneration: binding.operationId
    }),
    layers: ["picking"],
    pickingComponents: ["cities"],
    camera: {scale: 1, offsetX: 0, offsetY: 0},
    canvas: {width: 1280, height: 820, clientWidth: 1280, clientHeight: 820}
  };
}

function taskContext(binding, label = "worker") {
  return {binding, checkpoint: () => true, report: () => {}, label};
}
