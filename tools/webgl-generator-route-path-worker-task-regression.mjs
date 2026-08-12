#!/usr/bin/env node
import {strict as assert} from "node:assert";
import {performance} from "node:perf_hooks";
import {readFile} from "node:fs/promises";
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
import {
  createMoveCityCommand,
  importCityMovePreflight,
  inspectCityMoveAsync,
  inspectCityMoveFast
} from "../app/webgl-generator/src/runtime/city-relocation.js";

await verifyFormalEntryContracts();
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
  const workerMap = structuredClone(base);
  const output = await runRoutePathWorkerTask(
    {map: workerMap, request: createRequest, binding, sourceFingerprint: fingerprintRoutePathSource(base, createRequest), render: createRenderRequest(binding)},
    taskContext(binding, "worker")
  );
  assert.deepEqual(output.plan.inspection, expectedCreate, "create Worker 与正式 inspector 不同源");
  assert.equal(Object.isFrozen(output.plan), true, "路线 plan 顶层未冻结");
  assert.equal(Object.isFrozen(output.plan.inspection.path), true, "路线 plan 路径未深冻结");
  assert.equal(inputBuffer.byteLength > 0, true, "路线 Worker 输入 buffer 被 detach");
  assert.equal(collectRoutePathWorkerTransferables(output).includes(inputBuffer), false, "路线 Worker 输出错误转移输入 buffer");
  assertRoutePathWorkerPlan(output.plan, base, binding);
  assert.equal(workerMap.settlements.routes.length, base.settlements.routes.length + 1, "Worker 镜像未应用路线结果");
  assert(output.preparedRender?.layers?.route?.vertices instanceof Float32Array, "路线 Worker 缺少 route prepared render");
  assert(output.preparedRender?.layers?.picking, "路线 Worker 缺少 picking prepared render");
  assert(output.history?.beforePatch && output.history?.afterPatch, "路线 Worker 缺少可复制历史补丁");

  const undoBinding = {...binding, mapRevision: binding.mapRevision + 1, operationId: binding.operationId + 1};
  const undo = await runRoutePathWorkerTask({
    map: workerMap,
    binding: undoBinding,
    historyTransition: {action: "undo", label: "绘制路线", request: createRequest, patch: output.history.beforePatch},
    render: createRenderRequest(undoBinding)
  }, taskContext(undoBinding, "history-undo"));
  assert.equal(undo.kind, "route-path-history", "路线撤销未走 Worker 历史模式");
  assert.deepEqual(routeSnapshot(workerMap), routeSnapshot(base), "Worker 镜像撤销不精确");
  const redoBinding = {...undoBinding, mapRevision: undoBinding.mapRevision + 1, operationId: undoBinding.operationId + 1};
  const redo = await runRoutePathWorkerTask({
    map: workerMap,
    binding: redoBinding,
    historyTransition: {action: "redo", label: "绘制路线", request: createRequest, patch: output.history.afterPatch},
    render: createRenderRequest(redoBinding)
  }, taskContext(redoBinding, "history-redo"));
  assert.equal(redo.kind, "route-path-history", "路线重做未走 Worker 历史模式");
  assert.equal(workerMap.settlements.routes.length, base.settlements.routes.length + 1, "Worker 镜像重做未恢复路线");

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
  const editPlanOnlyMap = structuredClone(base);
  const editPlanOnlyBefore = routeSnapshot(editPlanOnlyMap);
  const editPlanOnlyOutput = await runRoutePathWorkerTask(
    {map: editPlanOnlyMap, request: editSample, binding, planOnly: true},
    taskContext(binding, "edit-plan-only")
  );
  assert.deepEqual(editPlanOnlyOutput.inspection, expectedEdit, "edit plan-only Worker 与正式 inspector 不同源");
  assert.deepEqual(routeSnapshot(editPlanOnlyMap), editPlanOnlyBefore, "edit plan-only Worker 不得改写镜像");
  assert.equal(editPlanOnlyOutput.history, undefined, "edit plan-only Worker 不得生成历史补丁");
  const editOutput = await runRoutePathWorkerTask(
    {map: structuredClone(base), request: editSample, binding},
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

  const cityRequest = findCityMoveRequest(base);
  const expectedCityMove = await inspectCityMoveAsync(base, cityRequest.cityId, cityRequest.target, {shouldContinue: () => true});
  const cityWorkerMap = structuredClone(base);
  const cityOutput = await runRoutePathWorkerTask({
    map: cityWorkerMap,
    request: cityRequest,
    binding,
    render: createRenderRequest(binding, ["point", "labels", "route", "picking"])
  }, taskContext(binding, "city-relocation-worker"));
  assert.deepEqual(cityOutput.inspection, structuredClone(expectedCityMove), "城市迁移 Worker 与正式 async inspector 不同源");
  const cityPreflight = importCityMovePreflight(cityOutput.cityPreflight);
  assert.equal(cityPreflight.phase, "full", "城市迁移 Worker 未返回可用冻结预检");
  assert.equal(cityWorkerMap.settlements.cities.find(city => Number(city?.id) === cityRequest.cityId)?.packCell, cityPreflight.target.packCell, "Worker 镜像未应用城市迁移");
  for (const layer of ["point", "labels", "route", "picking"]) {
    assert(cityOutput.preparedRender?.layers?.[layer], `城市迁移 Worker 缺少 ${layer} prepared render`);
  }
  assert(cityOutput.history?.beforePatch && cityOutput.history?.afterPatch, "城市迁移 Worker 缺少历史补丁");

  const cityUndoBinding = {...binding, mapRevision: binding.mapRevision + 3, operationId: binding.operationId + 3};
  await runRoutePathWorkerTask({
    map: cityWorkerMap,
    binding: cityUndoBinding,
    historyTransition: {action: "undo", label: "移动城市", request: cityRequest, patch: cityOutput.history.beforePatch},
    render: createRenderRequest(cityUndoBinding, ["point", "labels", "route", "picking"])
  }, taskContext(cityUndoBinding, "city-history-undo"));
  assert.deepEqual(cityMoveSnapshot(cityWorkerMap), cityMoveSnapshot(base), "城市迁移 Worker 镜像撤销不精确");
  const cityRedoBinding = {...cityUndoBinding, mapRevision: cityUndoBinding.mapRevision + 1, operationId: cityUndoBinding.operationId + 1};
  await runRoutePathWorkerTask({
    map: cityWorkerMap,
    binding: cityRedoBinding,
    historyTransition: {action: "redo", label: "移动城市", request: cityRequest, patch: cityOutput.history.afterPatch},
    render: createRenderRequest(cityRedoBinding, ["point", "labels", "route", "picking"])
  }, taskContext(cityRedoBinding, "city-history-redo"));
  assert.equal(cityWorkerMap.settlements.cities.find(city => Number(city?.id) === cityRequest.cityId)?.packCell, cityPreflight.target.packCell, "城市迁移 Worker 镜像重做未恢复目标");

  const cityTarget = structuredClone(base);
  const cityBefore = cityMoveSnapshot(cityTarget);
  const cityHistory = new EditHistory();
  cityHistory.execute(createMoveCityCommand(cityRequest.cityId, cityRequest.target, {preflight: cityPreflight}), {map: cityTarget});
  const cityAfter = cityMoveSnapshot(cityTarget);
  assert.notDeepEqual(cityAfter, cityBefore, "冻结城市迁移计划未应用");
  cityHistory.undo({map: cityTarget});
  assert.deepEqual(cityMoveSnapshot(cityTarget), cityBefore, "冻结城市迁移计划撤销不精确");
  cityHistory.redo({map: cityTarget});
  assert.deepEqual(cityMoveSnapshot(cityTarget), cityAfter, "冻结城市迁移计划重做不精确");

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

  const fallback = await runRoutePathWorkerTask({map: structuredClone(base), request: createRequest, binding}, taskContext(binding, "fallback"));
  assert.deepEqual(fallback.plan, output.plan, "route-path Worker / fallback handler 不同源");

  return {
    cells: base.grid.points.length,
    packCells: base.pack.cells.i.length,
    createCells: output.result.cells,
    editCells: editOutput.result.cells,
    cityMove: {
      cityId: cityRequest.cityId,
      associatedRoutes: cityOutput.result.routes?.associated || 0,
      undoRedo: true
    },
    relocationAction: relocationOutput.plan.inspection.action,
    frozenPlan: true,
    undoRedoAliases: true,
    cancelLateFaultStale: true,
    inputBuffersIntact: true,
    workerFallbackParity: true
  };
}

async function verifyFormalEntryContracts() {
  const [appSource, panelSource, consoleSource] = await Promise.all([
    readFile(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8"),
    readFile(new URL("../app/webgl-generator/src/ui/panels/route-panel.js", import.meta.url), "utf8"),
    readFile(new URL("../app/webgl-generator/src/runtime/console-api.js", import.meta.url), "utf8")
  ]);
  assert.doesNotMatch(appSource, /onInspectEdit:\s*\([^)]*\)\s*=>\s*inspectRouteEdit\(/, "路线面板不得回退主线程同步寻路");
  assert.doesNotMatch(appSource, /inspectCityMove\(state\.map/, "城市公开预检不得回退主线程同步寻路");
  assert.match(panelSource, /Promise\.resolve\(pending\)\.then/, "路线面板未等待异步 Worker 预检");
  assert.match(panelSource, /requestId !== panelState\.editRequestId/, "路线面板缺少晚到预检隔离");
  assert.match(consoleSource, /"cities\.inspectMove": \{[^\n]+async: true/);
  assert.match(consoleSource, /"routes\.inspectEdit": \{[^\n]+async: true/);
  const routeHistorySource = appSource.match(/async function executeRoutePathWorkerHistory[\s\S]+?\n}\n\nfunction synchronizeFeatureTopologyHistoryUi/)?.[0] || "";
  assert.match(routeHistorySource, /createCommand: \(\) => command,\s*skipCommandNoopCheck: true,\s*commitCommand:/, "路线 / 城市 Worker 历史不得重复执行正式命令 no-op 预检");
  assert.match(appSource, /mutation\.skipCommandNoopCheck !== true && command\.isNoop/, "通用 Worker 提交未限制历史 no-op 跳过范围");
}

async function verifyHundredThousandCells() {
  const map = createMap("route-path-worker-100k", 100000);
  const workerMap = structuredClone(map);
  const binding = createBinding("route-path-100k", 12);
  const request = findCreateRequest(map);
  const inputBuffer = map.pack.cells.h.buffer;
  const started = performance.now();
  const output = await runRoutePathWorkerTask({map: workerMap, request, binding}, taskContext(binding, "worker-100k"));
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

function findCityMoveRequest(map) {
  const cities = (map.settlements?.cities || []).filter(city => city && !city.removed && !city.capital && !city.provincial).slice(0, 80);
  const packCells = map.pack?.cells;
  for (const city of cities) {
    for (let packCell = 0; packCell < (packCells?.i?.length || 0); packCell++) {
      if (Number(packCells.h?.[packCell]) < 20 || Number(packCells.burg?.[packCell]) > 0) continue;
      const gridCell = Number(packCells.g?.[packCell]);
      if (!Number.isInteger(gridCell) || gridCell === Number(city.cell)) continue;
      const target = {gridCell, packCell};
      const preview = inspectCityMoveFast(map, city.id, target);
      if (preview.valid && preview.changed) return {kind: "city-relocation", cityId: Number(city.id), target};
    }
  }
  throw new Error("找不到可迁移城市样本");
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

function createRenderRequest(binding, layers = ["route", "picking"]) {
  return {
    binding: {mapIdentity: binding.mapIdentity, mapRevision: binding.mapRevision},
    layers,
    camera: {scale: 1, offsetX: 0, offsetY: 0},
    canvas: {width: 1200, height: 720, clientWidth: 1200, clientHeight: 720},
    visibility: {},
    visualTheme: {},
    unitPreferences: {},
    viewOptions: {},
    labelOptions: {}
  };
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

function cityMoveSnapshot(map) {
  const snapshot = structuredClone({
    cities: map.settlements.cities,
    routes: map.settlements.routes,
    settlementsMetadata: map.settlements.metadata,
    burgs: map.pack.burgs,
    packRoutes: map.pack.routes,
    states: map.pack.states,
    provinces: map.pack.provinces,
    markets: map.pack.markets,
    packBurg: map.pack.cells.burg,
    packCellRoutes: map.pack.cells.routes,
    packMarket: map.pack.cells.market,
    gridBurg: map.grid.cells.burg,
    politics: map.politics,
    economy: map.economy,
    diplomacy: map.diplomacy,
    military: map.military,
    zones: map.zones,
    derivedStale: map.metadata?.derivedStale,
    notes: map.notes
  });
  if (snapshot.derivedStale?.updatedAt) snapshot.derivedStale.updatedAt = "<timestamp>";
  return snapshot;
}
