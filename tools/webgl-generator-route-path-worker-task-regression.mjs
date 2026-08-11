#!/usr/bin/env node
import {strict as assert} from "node:assert";
import {performance} from "node:perf_hooks";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {
  createAddRouteCommand,
  createEditRouteCommand,
  inspectRouteCreation,
  inspectRouteEdit,
  planRouteRelocationAsync
} from "../app/webgl-generator/src/runtime/route-edit-commands.js";
import {
  assertRoutePathWorkerPlan,
  collectRoutePathWorkerTransferables,
  fingerprintRoutePathSource,
  runRoutePathWorkerTask
} from "../app/webgl-generator/src/runtime/route-path-worker-task.js";

const tenK = await verifyTenThousandCells();
const hundredK = await verifyHundredThousandCells();

console.log(JSON.stringify({ok: true, tenK, hundredK}, null, 2));

async function verifyTenThousandCells() {
  const base = createMap("route-path-worker-10k", 10000);
  const binding = createBinding("route-path-10k", 4);
  const createRequest = findCreateRequest(base);
  const expectedCreate = inspectRouteCreation(base, createRequest.options);
  assert.equal(expectedCreate.valid, true, expectedCreate.reason);
  const inputBuffer = base.pack.cells.h.buffer;
  const output = await runRoutePathWorkerTask(
    {map: base, request: createRequest, binding, sourceFingerprint: fingerprintRoutePathSource(base, createRequest)},
    taskContext(binding, "worker")
  );
  assert.deepEqual(output.plan.inspection, expectedCreate, "create Worker 与正式 inspector 不同源");
  assert.equal(Object.isFrozen(output.plan), true, "路线 plan 顶层未冻结");
  assert.equal(Object.isFrozen(output.plan.inspection.path), true, "路线 plan 路径未深冻结");
  assert.equal(inputBuffer.byteLength > 0, true, "路线 Worker 输入 buffer 被 detach");
  assert.equal(collectRoutePathWorkerTransferables(output).includes(inputBuffer), false, "路线 Worker 输出错误转移输入 buffer");
  assertRoutePathWorkerPlan(output.plan, base, binding);

  const target = structuredClone(base);
  const identities = captureRouteIdentities(target);
  const before = routeSnapshot(target);
  const history = new EditHistory();
  history.execute(createAddRouteCommand(output.plan.request.options), {map: target});
  assert.equal(target.settlements.routes.length, before.routes.length + 1, "冻结 create plan 未能正式应用");
  assertRouteAliases(target);
  assertRouteIdentities(target, identities);
  const created = routeSnapshot(target);
  history.undo({map: target});
  assert.deepEqual(routeSnapshot(target), before, "create plan 撤销不精确");
  assertRouteAliases(target);
  history.redo({map: target});
  assert.deepEqual(routeSnapshot(target), created, "create plan 重做不精确");
  assertRouteAliases(target);

  const editSample = findEditRequest(base);
  const expectedEdit = inspectRouteEdit(base, editSample.routeId, editSample.patch);
  const editOutput = await runRoutePathWorkerTask(
    {map: base, request: editSample, binding},
    taskContext(binding, "edit-worker")
  );
  assert.deepEqual(editOutput.plan.inspection, expectedEdit, "edit Worker 与正式 inspector 不同源");
  assert.equal(editOutput.plan.valid, true, expectedEdit.reason);
  const editTarget = structuredClone(base);
  const editHistory = new EditHistory();
  editHistory.execute(createEditRouteCommand(editSample.routeId, editOutput.plan.request.patch), {map: editTarget});
  assert.deepEqual(editTarget.settlements.routes.find(route => route.id === editSample.routeId).packCells, expectedEdit.path, "edit plan 应用路径漂移");
  editHistory.undo({map: editTarget});
  assert.deepEqual(routeSnapshot(editTarget), routeSnapshot(base), "edit plan 撤销不精确");
  editHistory.redo({map: editTarget});
  assert.deepEqual(editTarget.settlements.routes.find(route => route.id === editSample.routeId).packCells, expectedEdit.path, "edit plan 重做路径漂移");
  assertRouteAliases(editTarget);

  const relocationRequest = findRelocationRequest(base);
  const route = base.settlements.routes.find(item => item.id === relocationRequest.routeId);
  const expectedRelocation = await planRouteRelocationAsync(base, route, relocationRequest.cityId, relocationRequest.target, {shouldContinue: () => true});
  const relocationOutput = await runRoutePathWorkerTask(
    {map: base, request: relocationRequest, binding},
    taskContext(binding, "relocation-worker")
  );
  assert.deepEqual(relocationOutput.plan.inspection, expectedRelocation, "relocation Worker 与正式 async planner 不同源");

  const staleMap = structuredClone(base);
  staleMap.settlements.routes[0].level = staleMap.settlements.routes[0].level === "primary" ? "secondary" : "primary";
  assert.throws(() => assertRoutePathWorkerPlan(output.plan, staleMap, binding), error => error?.code === "route-path-worker-plan-stale");
  assert.throws(() => assertRoutePathWorkerPlan(output.plan, base, {...binding, mapRevision: binding.mapRevision + 1}), error => error?.code === "route-path-worker-binding-stale");
  await assertCancelFaultAndLate(base, binding, createRequest);

  const fallback = await runRoutePathWorkerTask({map: base, request: createRequest, binding}, taskContext(binding, "fallback"));
  assert.deepEqual(fallback.plan, output.plan, "route-path Worker / fallback handler 不同源");

  return {
    cells: base.grid.points.length,
    packCells: base.pack.cells.i.length,
    createCells: output.result.cells,
    editCells: editOutput.result.cells,
    relocationAction: relocationOutput.plan.inspection.action,
    frozenPlan: true,
    undoRedoAliases: true,
    cancelLateFaultStale: true,
    inputBuffersIntact: true,
    workerFallbackParity: true
  };
}

async function verifyHundredThousandCells() {
  const map = createMap("route-path-worker-100k", 100000);
  const binding = createBinding("route-path-100k", 12);
  const request = findCreateRequest(map);
  const inputBuffer = map.pack.cells.h.buffer;
  const started = performance.now();
  const output = await runRoutePathWorkerTask({map, request, binding}, taskContext(binding, "worker-100k"));
  const durationMs = Math.round((performance.now() - started) * 10) / 10;
  assert.equal(output.plan.valid, true, output.plan.inspection.reason);
  assert.ok(durationMs < 20000, `100k 路线规划超过 20s 预算：${durationMs}ms`);
  assert.equal(inputBuffer.byteLength > 0, true, "100k 路线输入 buffer 被 detach");
  assertRoutePathWorkerPlan(output.plan, map, binding);
  return {
    cells: map.grid.points.length,
    packCells: map.pack.cells.i.length,
    durationMs,
    pathCells: output.result.cells,
    inputBuffersIntact: true
  };
}

async function assertCancelFaultAndLate(base, binding, request) {
  await assert.rejects(
    runRoutePathWorkerTask({map: base, request, binding}, {...taskContext(binding, "cancel"), checkpoint: () => false}),
    error => error?.name === "AbortError"
  );
  let checkpoints = 0;
  await assert.rejects(
    runRoutePathWorkerTask({map: base, request, binding}, {...taskContext(binding, "late"), checkpoint: () => ++checkpoints < 2}),
    error => error?.name === "AbortError"
  );
  await assert.rejects(
    runRoutePathWorkerTask({map: base, request, binding, faultAt: "after-compute"}, taskContext(binding, "fault")),
    error => error?.code === "route-path-worker-fault"
  );
  await assert.rejects(
    runRoutePathWorkerTask({map: base, request, binding}, taskContext({...binding, generationToken: binding.generationToken + 1}, "binding-stale")),
    error => error?.code === "route-path-worker-binding-stale"
  );
  await assert.rejects(
    runRoutePathWorkerTask({map: base, request, binding, sourceFingerprint: "00000000"}, taskContext(binding, "source-stale")),
    error => error?.code === "route-path-worker-source-stale"
  );
}

function findCreateRequest(map) {
  const cells = map.pack.cells;
  const land = [];
  for (let index = 0; index < cells.i.length && land.length < 220; index++) if (Number(cells.h[index]) >= 20) land.push(index);
  for (let left = 0; left < land.length; left += 3) {
    for (let right = left + 5; right < land.length; right += 11) {
      const request = {kind: "create", options: {startPackCell: land[left], endPackCell: land[right], type: "trail"}};
      if (inspectRouteCreation(map, request.options).valid) return request;
    }
  }
  throw new Error("找不到可创建路线样本");
}

function findEditRequest(map) {
  for (const route of map.settlements.routes) {
    if (route.type === "searoute" || route.packCells.length < 4) continue;
    const pathSet = new Set(route.packCells);
    for (const anchor of route.packCells.slice(1, -1)) {
      for (const neighbor of map.pack.cells.c[anchor] || []) {
        if (pathSet.has(neighbor) || Number(map.pack.cells.h[neighbor]) < 20) continue;
        const request = {kind: "edit", routeId: route.id, patch: {viaPackCells: [neighbor]}};
        const inspection = inspectRouteEdit(map, route.id, request.patch);
        if (inspection.valid && inspection.changed) return request;
      }
    }
  }
  throw new Error("找不到可编辑路线样本");
}

function findRelocationRequest(map) {
  const route = map.settlements.routes.find(item => item.type !== "searoute" && (item.from >= 0 || item.to >= 0));
  if (!route) throw new Error("找不到城市关联陆路样本");
  const cityId = route.from >= 0 ? route.from : route.to;
  const city = map.settlements.cities.find(item => Number(item?.id) === Number(cityId));
  if (!city) throw new Error("关联路线缺少城市样本");
  return {
    kind: "relocation",
    routeId: route.id,
    cityId,
    target: {packCell: city.packCell, point: [city.x, city.y], portFeature: city.port || 0, seaAnchor: null}
  };
}

function createMap(seed, cellsTarget) {
  return generatePlaceholderMap({seed, cellsTarget, heightmapTemplate: "continents"});
}

function createBinding(mapIdentity, mapRevision) {
  return {mapIdentity, mapRevision, generationToken: 3, lockFingerprint: "route-locks", operationId: 31, operationName: "route-path.compute"};
}

function taskContext(binding, source) {
  return {binding, source, checkpoint: () => true, report: () => {}, shouldContinue: () => true};
}

function captureRouteIdentities(map) {
  return {
    routes: map.settlements.routes,
    routeObjects: [...map.settlements.routes],
    pack: map.pack,
    packCells: map.pack.cells,
    cities: map.settlements.cities,
    burgs: map.pack.burgs
  };
}

function assertRouteIdentities(map, identities) {
  assert.equal(map.settlements.routes, identities.routes, "路线数组身份被替换");
  assert.equal(map.pack, identities.pack, "pack 身份被替换");
  assert.equal(map.pack.cells, identities.packCells, "pack cells 身份被替换");
  assert.equal(map.settlements.cities, identities.cities, "城市数组身份被替换");
  assert.equal(map.pack.burgs, identities.burgs, "burg 数组身份被替换");
  for (const route of identities.routeObjects) assert.ok(map.settlements.routes.includes(route), `既有路线 #${route.id} 对象身份被替换`);
}

function assertRouteAliases(map) {
  const routes = map.settlements.routes;
  assert.equal(map.pack.routes.filter(Boolean).length, routes.length, "pack.routes 与 settlements.routes 数量不一致");
  for (const route of routes) {
    assert.deepEqual(map.pack.routes[route.id]?.points?.map(point => point[2]), route.packCells, `路线 #${route.id} pack 镜像漂移`);
  }
  const byId = new Map(routes.map(route => [Number(route.id), route]));
  for (const [fromKey, neighbors] of Object.entries(map.pack.cells.routes || {})) {
    for (const [toKey, routeIdValue] of Object.entries(neighbors || {})) {
      const route = byId.get(Number(routeIdValue));
      assert.ok(route, `邻接镜像引用不存在路线 #${routeIdValue}`);
      const from = Number(fromKey);
      const to = Number(toKey);
      assert.ok(route.packCells.some((cell, index) => Number(cell) === from && Number(route.packCells[index + 1]) === to)
        || route.packCells.some((cell, index) => Number(cell) === to && Number(route.packCells[index + 1]) === from), `路线 #${route.id} 邻接镜像不在正式路径`);
    }
  }
}

function routeSnapshot(map) {
  const snapshot = structuredClone({
    routes: map.settlements.routes,
    packRoutes: map.pack.routes,
    links: map.pack.cells.routes,
    metadata: map.settlements.metadata,
    derivedStale: map.metadata?.derivedStale
  });
  if (snapshot.derivedStale?.updatedAt) snapshot.derivedStale.updatedAt = "<timestamp>";
  return snapshot;
}
