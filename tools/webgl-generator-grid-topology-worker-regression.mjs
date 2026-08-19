import assert from "node:assert/strict";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {
  fingerprintGridStructure,
  validateRefinedMotherAdjacency
} from "../app/webgl-generator/src/generator/grid-refinement.js";
import {isSettlementWaterRoutePathValid} from "../app/webgl-generator/src/generator/settlements.js";
import {
  getGridStructureSnapshot,
  inspectGridRefinement,
  inspectGridStructureWrite
} from "../app/webgl-generator/src/runtime/grid-topology-api.js";
import {
  collectGridTopologyWorkerTransferables,
  fingerprintGridTopologyLocks,
  GRID_TOPOLOGY_WORKER_ACTION,
  runGridTopologyWorkerTask
} from "../app/webgl-generator/src/runtime/grid-topology-worker-task.js";
import {
  createMapDocument,
  parseMapDocument,
  stringifyMapDocument
} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {
  collectWorkerTransferables,
  createStagedWorkerSnapshot
} from "../app/webgl-generator/src/runtime/worker-snapshot.js";

const report = {cases: {}};

const parityMap = generatePlaceholderMap({seed: "grid-worker-parity", cellsTarget: 1_000});
const parityFormalBefore = structuredClone(parityMap);
const parityBinding = createBinding(parityMap, "grid-worker-parity");
const workerRequest = await createRefinementRequest(parityMap, parityBinding, 5_000, {transfer: true});
const fallbackRequest = await createRefinementRequest(parityMap, parityBinding, 5_000);
assertNoSourceMap(workerRequest, "Worker 请求");
assertNoSourceMap(fallbackRequest, "fallback 请求");
const workerResult = await runGridTopologyWorkerTask(workerRequest, createTaskContext(parityBinding, "worker"));
const fallbackResult = await runGridTopologyWorkerTask(fallbackRequest, createTaskContext(parityBinding, "fallback"));
assert.deepEqual(normalizeSemanticResult(workerResult), normalizeSemanticResult(fallbackResult), "Worker 与 fallback 必须由同一 handler 产生相同语义");
assert.deepEqual(parityMap, parityFormalBefore, "1k→5k 准备不得改写正式输入");
assertPreparedReplacement(workerResult, {sourceCells: parityMap.grid.points.length, targetCells: 5_000});
assertPreparedReplacement(fallbackResult, {sourceCells: parityMap.grid.points.length, targetCells: 5_000});
assertNoSourceMap(workerResult, "Worker 结果");
const workerTransferables = collectGridTopologyWorkerTransferables(workerResult);
assertTransferOwnership(parityMap, workerResult.replacementMap, workerTransferables);
const cloneProbe = structuredClone(workerResult);
assertPreparedReplacement(cloneProbe, {sourceCells: parityMap.grid.points.length, targetCells: 5_000});
const fallbackTransferables = collectGridTopologyWorkerTransferables(fallbackResult);
const transferProbe = structuredClone(fallbackResult, {transfer: fallbackTransferables});
assert.ok(fallbackTransferables.every(buffer => buffer.byteLength === 0), "Worker 结果 transfer 后原 buffer 必须脱离");
assertPreparedReplacement(transferProbe, {sourceCells: parityMap.grid.points.length, targetCells: 5_000});
report.cases.parity1kTo5k = {
  sourceCells: parityMap.grid.points.length,
  targetCells: workerResult.replacementMap.grid.points.length,
  transferables: workerTransferables.length
};

const writeMap = generatePlaceholderMap({seed: "grid-worker-apply-write", cellsTarget: 1_000});
const writeBefore = structuredClone(writeMap);
const writeBinding = createBinding(writeMap, "grid-worker-apply-write");
const writeDocument = getGridStructureSnapshot(writeMap, revisionTracker(writeBinding));
const heightCell = writeDocument.cells.h.findIndex(height => Number(height) >= 21);
assert.ok(heightCell >= 0, "applyWrite 样本缺少可安全调整的陆地高度");
writeDocument.cells.h[heightCell] = Number(writeDocument.cells.h[heightCell]) - 1;
const writeInspection = inspectGridStructureWrite(writeMap, revisionTracker(writeBinding), writeDocument);
assert.equal(writeInspection.valid, true, "applyWrite 受控文档必须通过预检");
const writeDocumentBefore = structuredClone(writeDocument);
const writeRequest = {
  action: GRID_TOPOLOGY_WORKER_ACTION.APPLY_WRITE,
  map: await isolateMap(writeMap, {transfer: true}),
  document: structuredClone(writeDocument),
  binding: structuredClone(writeBinding),
  options: {confirm: true, inspectionToken: writeInspection.inspectionToken}
};
const writeResult = await runGridTopologyWorkerTask(writeRequest, createTaskContext(writeBinding, "worker"));
assert.deepEqual(writeMap, writeBefore, "applyWrite 准备不得改写正式输入");
assert.deepEqual(writeRequest.document, writeDocumentBefore, "applyWrite prepare 不得改写受控文档");
assertPreparedReplacement(writeResult, {sourceCells: writeMap.grid.points.length, targetCells: writeMap.grid.points.length, refinement: false});
assert.equal(Number(writeResult.replacementMap.grid.cells.h[heightCell]), Number(writeDocument.cells.h[heightCell]), "applyWrite 高度没有进入完整 replacement");
assertRouteMirrors(writeResult.replacementMap);
report.cases.applyWrite = {cells: writeResult.replacementMap.grid.points.length, heightCell};

const invalidWriteMap = generatePlaceholderMap({seed: "grid-worker-invalid-write", cellsTarget: 1_000});
const invalidWriteBinding = createBinding(invalidWriteMap, "grid-worker-invalid-write");
const invalidDocument = getGridStructureSnapshot(invalidWriteMap, revisionTracker(invalidWriteBinding));
const neighbor = invalidDocument.cells.c[0][0];
assert.ok(Number.isInteger(neighbor), "非法邻接样本缺少首邻接");
invalidDocument.cells.c[neighbor] = invalidDocument.cells.c[neighbor].filter(cell => cell !== 0);
await assert.rejects(
  runGridTopologyWorkerTask({
    action: GRID_TOPOLOGY_WORKER_ACTION.APPLY_WRITE,
    map: await isolateMap(invalidWriteMap),
    document: invalidDocument,
    binding: invalidWriteBinding,
    options: {confirm: true, inspectionToken: "invalid-structure"}
  }, createTaskContext(invalidWriteBinding, "fallback")),
  error => error?.code === "grid-structure-invalid",
  "非对称邻接必须在 Worker prepare 中拒绝"
);
report.cases.invalidAdjacency = "rejected";

const staleMap = generatePlaceholderMap({seed: "grid-worker-stale", cellsTarget: 1_000});
const staleBinding = createBinding(staleMap, "grid-worker-stale");
const staleRequest = await createRefinementRequest(staleMap, staleBinding, 5_000);
await assert.rejects(
  runGridTopologyWorkerTask(staleRequest, createTaskContext({...staleBinding, mapRevision: staleBinding.mapRevision + 1}, "worker")),
  error => error?.code === "grid-worker-binding-stale",
  "任务信封 revision 漂移必须拒绝"
);
staleRequest.binding.sourceFingerprint = "00000000";
await assert.rejects(
  runGridTopologyWorkerTask(staleRequest, createTaskContext(staleRequest.binding, "worker")),
  error => error?.code === "grid-worker-binding-stale",
  "快照网格指纹漂移必须拒绝"
);
report.cases.staleBinding = "rejected";

const cancelMap = generatePlaceholderMap({seed: "grid-worker-cancel", cellsTarget: 1_000});
const cancelBinding = createBinding(cancelMap, "grid-worker-cancel");
const cancelRequest = await createRefinementRequest(cancelMap, cancelBinding, 5_000);
const cancelInputBefore = structuredClone(cancelRequest.map);
const abortController = new AbortController();
await assert.rejects(
  runGridTopologyWorkerTask(cancelRequest, {
    binding: cancelBinding,
    signal: abortController.signal,
    checkpoint(detail) {
      if (detail?.phase === "grid-refinement" && detail?.stage === "voronoi") abortController.abort("grid-worker-cancel-fixture");
    }
  }),
  error => error?.name === "AbortError" && error?.code === "grid-preparation-aborted",
  "Voronoi 前取消必须由 checkpoint 中断"
);
assert.deepEqual(cancelRequest.map, cancelInputBefore, "取消不得留下半成品输入改写");
report.cases.cancellationCheckpoint = "voronoi";

const lockConflictMap = generatePlaceholderMap({seed: "grid-worker-lock-conflict", cellsTarget: 1_000});
const invalidLockedRoute = lockConflictMap.settlements.routes.find(route => route && route.cells?.length > 1);
assert(invalidLockedRoute, "锁冲突样本缺少道路");
invalidLockedRoute.cells = [];
lockConflictMap.regenerationLocks = {version: 1, entries: [{kind: "route", id: invalidLockedRoute.id}]};
const lockConflictBinding = createBinding(lockConflictMap, "grid-worker-lock-conflict");
const lockConflictRequest = await createRefinementRequest(lockConflictMap, lockConflictBinding, 5_000);
await assert.rejects(
  runGridTopologyWorkerTask(lockConflictRequest, createTaskContext(lockConflictBinding, "worker")),
  error => error?.code === "regeneration_lock_conflict",
  "无法保留的锁定道路必须拒绝完整 replacement"
);
report.cases.lockConflict = {routeId: invalidLockedRoute.id, rejected: true};

const lockedRouteMap = generatePlaceholderMap({seed: "lock-a", cellsTarget: 1_000});
const lockedRoute = lockedRouteMap.settlements.routes.find(route => route?.id === 25 && route.type === "searoute" && route.from >= 0 && route.to === -1);
assert(lockedRoute, "锁定 partial 海路样本缺失");
const lockedRouteIdentity = routeIdentity(lockedRoute);
lockedRouteMap.regenerationLocks = {version: 1, entries: [{kind: "route", id: lockedRoute.id}]};
const lockedRouteBinding = createBinding(lockedRouteMap, "grid-worker-locked-route");
const lockedRouteRequest = await createRefinementRequest(lockedRouteMap, lockedRouteBinding, 5_000);
const lockedRouteResult = await runGridTopologyWorkerTask(lockedRouteRequest, createTaskContext(lockedRouteBinding, "worker"));
const migratedLockedRoute = lockedRouteResult.replacementMap.settlements.routes.find(route => route?.id === lockedRoute.id);
assert(migratedLockedRoute, "合法锁定 partial 海路在 replacement 中丢失");
assert.deepEqual(routeIdentity(migratedLockedRoute), lockedRouteIdentity, "锁定 partial 海路的稳定身份发生漂移");
assert.deepEqual(lockedRouteResult.replacementMap.regenerationLocks.entries, [{kind: "route", id: lockedRoute.id}], "锁记录发生漂移");
assert.equal(isSettlementWaterRoutePathValid(lockedRouteResult.replacementMap.pack, migratedLockedRoute.packCells), true, "锁定 partial 海路没有正式可航路径");
assertRouteMirrors(lockedRouteResult.replacementMap);
report.cases.lockedRouteIdentity = {routeId: lockedRoute.id, cells: migratedLockedRoute.packCells.length};

const portMap = generatePlaceholderMap({seed: "port-feature-conflict", cellsTarget: 1_000});
const portCity = portMap.settlements.cities.find(city => city && !city.removed && Number(city.port) > 0);
assert(portCity, "港口双镜像冲突样本缺少港口城市");
const portBurg = portMap.pack.burgs[portCity.burgId];
const conflictingWater = portMap.pack.features.find(feature => feature
  && !feature.removed
  && feature.land === false
  && Number(feature.id ?? feature.i) !== Number(portCity.port));
assert(conflictingWater, "港口双镜像冲突样本缺少第二水体");
portBurg.port = Number(conflictingWater.id ?? conflictingWater.i);
const portBinding = createBinding(portMap, "grid-worker-port-conflict");
const portRequest = await createRefinementRequest(portMap, portBinding, 5_000);
const portResult = await runGridTopologyWorkerTask(portRequest, createTaskContext(portBinding, "worker"));
const clearedPortCity = portResult.replacementMap.settlements.cities[portCity.id];
const clearedPortBurg = portResult.replacementMap.pack.burgs[clearedPortCity.burgId];
assert.equal(portResult.result.migration.waterFeatures.conflictingPortMirrors, 1, "港口双镜像冲突未写入迁移报告");
assert.equal(Number(clearedPortCity.port), 0, "港口双镜像冲突错误保留了 city 水体");
assert.equal(Number(clearedPortBurg.port), 0, "港口双镜像冲突错误保留了 burg 水体");
report.cases.portTopology = {conflictingPortMirrors: 1, clearedCityId: portCity.id};

const roundtripDocument = createMapDocument(workerResult.replacementMap);
const roundtrip = parseMapDocument(stringifyMapDocument(roundtripDocument)).map;
assert.equal(roundtrip.grid.points.length, 5_000, "replacement 保存往返丢失网格规模");
assert.equal(roundtrip.grid.refinement.targetCells, 5_000, "replacement 保存往返丢失细分元数据");
assert.equal(roundtrip.metadata.checksum, workerResult.replacementMap.metadata.checksum, "replacement 保存往返 checksum 漂移");
assertRouteIdentitiesEqual(workerResult.replacementMap, roundtrip);
assertRouteMirrors(roundtrip);
assert.ok(roundtrip.grid.cells.i instanceof Uint32Array, "保存往返后 grid cells.i 类型丢失");
assert.ok(roundtrip.grid.refinement.mother instanceof Uint32Array, "保存往返后 mother 类型丢失");
report.cases.saveRoundtrip = {routes: roundtrip.settlements.routes.length, checksum: roundtrip.metadata.checksum};

let largeMap = generatePlaceholderMap({seed: "grid-worker-10k-100k", cellsTarget: 10_000});
const largeSourceCells = largeMap.grid.points.length;
const largeSourcePoints = largeMap.grid.points.map(point => [...point]);
const largeSourceHeights = Array.from(largeMap.grid.cells.h, Number);
const largeObjectCounts = {
  cities: largeMap.settlements.cities.length,
  rivers: largeMap.rivers.rivers.length,
  markers: largeMap.markers.markers.length,
  states: largeMap.politics.states.length,
  provinces: largeMap.politics.provinces.length,
  routes: largeMap.settlements.routes.length
};
const largeInputState = captureInputState(largeMap);
const largeBinding = createBinding(largeMap, "grid-worker-10k-100k");
const largeRequest = await createRefinementRequest(largeMap, largeBinding, 100_000, {transfer: true});
const largeStartedAt = performance.now();
const largeResult = await runGridTopologyWorkerTask(largeRequest, createTaskContext(largeBinding, "worker"));
const largeElapsedMs = Math.round((performance.now() - largeStartedAt) * 100) / 100;
assertInputStateUnchanged(largeMap, largeInputState);
assertPreparedReplacement(largeResult, {sourceCells: largeSourceCells, targetCells: 100_000});
assert.deepEqual(largeResult.replacementMap.grid.points.slice(0, largeSourceCells), largeSourcePoints, "10k→100k 没有精确保留旧点");
assert.deepEqual(largeResult.replacementMap.grid.cells.h.slice(0, largeSourceCells), largeSourceHeights, "10k→100k 没有精确保留旧高度");
assert.equal(validateRefinedMotherAdjacency(
  largeMap.grid.cells.c,
  largeResult.replacementMap.grid.cells.c,
  largeResult.replacementMap.grid.refinement.mother
).valid, true, "10k→100k 产生非法跨母邻接");
assert.equal(largeResult.result.refinement.motherAdjacencyViolations, 0);
assert.equal(largeResult.result.refinement.landSignViolations, 0);
assert.deepEqual(largeResult.result.migration.invalid, [], "10k→100k 对象迁移留下非法引用");
assert.equal(largeResult.replacementMap.settlements.cities.length, largeObjectCounts.cities, "10k→100k 城镇数量漂移");
assert.equal(largeResult.replacementMap.rivers.rivers.length, largeObjectCounts.rivers, "10k→100k 河流数量漂移");
assert.equal(largeResult.replacementMap.markers.markers.length, largeObjectCounts.markers, "10k→100k Marker 数量漂移");
assert.equal(largeResult.replacementMap.politics.states.length, largeObjectCounts.states, "10k→100k 国家数量漂移");
assert.equal(largeResult.replacementMap.politics.provinces.length, largeObjectCounts.provinces, "10k→100k 省份数量漂移");
assert.equal(largeResult.replacementMap.settlements.routes.length, largeObjectCounts.routes - largeResult.result.migration.routesRemoved, "10k→100k route 移除数与报告不一致");
assertMigratedReferences(largeResult.replacementMap);
assertRouteMirrors(largeResult.replacementMap);
assertTransferOwnership(largeMap, largeResult.replacementMap, collectGridTopologyWorkerTransferables(largeResult));
report.cases.refine10kTo100k = {
  sourceCells: largeSourceCells,
  targetCells: largeResult.replacementMap.grid.points.length,
  packCells: largeResult.replacementMap.pack.cells.i.length,
  routes: largeResult.replacementMap.settlements.routes.length,
  prepareMs: largeElapsedMs
};
largeMap = null;

console.log(JSON.stringify(report, null, 2));

function createBinding(map, mapIdentity, mapRevision = 0) {
  return {
    mapIdentity,
    mapRevision,
    sourceFingerprint: fingerprintGridStructure(map.grid),
    lockFingerprint: fingerprintGridTopologyLocks(map)
  };
}

function revisionTracker(binding) {
  return {getSnapshot: () => ({mapIdentity: binding.mapIdentity, mapRevision: binding.mapRevision})};
}

async function createRefinementRequest(map, binding, targetCells, options = {}) {
  const inspection = inspectGridRefinement(map, revisionTracker(binding), {targetCells});
  assert.equal(inspection.valid, true, `grid.refine ${map.grid.points.length}→${targetCells} 预检失败`);
  return {
    action: GRID_TOPOLOGY_WORKER_ACTION.REFINE,
    map: await isolateMap(map, options),
    binding: structuredClone(binding),
    options: {targetCells, confirm: true, inspectionToken: inspection.inspectionToken}
  };
}

async function isolateMap(map, options = {}) {
  const staged = await createStagedWorkerSnapshot(map, {
    yieldToMain: async () => {},
    sliceBytes: 1024 * 1024,
    budgetMs: 50
  });
  if (!options.transfer) return staged.snapshot;
  const isolated = structuredClone(staged.snapshot, {transfer: staged.transferables});
  assert.ok(staged.transferables.every(buffer => buffer.byteLength === 0), "Worker 输入 transfer 后 staging buffer 必须脱离");
  return isolated;
}

function createTaskContext(binding, mode) {
  return {
    binding: structuredClone(binding),
    checkpoint: () => true,
    report: () => {},
    mode
  };
}

function assertPreparedReplacement(output, {sourceCells, targetCells, refinement = true}) {
  assert.deepEqual(Object.keys(output).sort(), ["action", "binding", "executed", "kind", "preparedRender", "replacementMap", "result"], "Worker 结果只能携带完整 replacement 与可选 renderer source，不得夹带 deep patch");
  assert.equal(output.preparedRender, null, "未请求 renderer source 时必须显式返回 null");
  assert.equal(output.kind, "grid-topology-worker-result");
  assert.equal(output.executed, true);
  assert(output.replacementMap && typeof output.replacementMap === "object", "Worker 必须返回完整 replacementMap");
  assert.equal(output.replacementMap.grid.points.length, targetCells);
  assert.equal(output.result.source.cells, sourceCells);
  assert.equal(output.result.target.cells, targetCells);
  assertNoSourceMap(output, "prepared replacement");
  assertMapAliases(output.replacementMap);
  assertTypedTopology(output.replacementMap, refinement);
}

function assertMapAliases(map) {
  const aliases = [
    [map.pack.rivers, map.rivers.rivers, "pack.rivers / rivers.rivers"],
    [map.pack.states, map.politics.states, "pack.states / politics.states"],
    [map.pack.provinces, map.politics.provinces, "pack.provinces / politics.provinces"],
    [map.pack.markers, map.markers.markers, "pack.markers / markers.markers"],
    [map.pack.zones, map.zones.zones, "pack.zones / zones.zones"],
    [map.pack.cultures, map.society.cultures, "pack.cultures / society.cultures"],
    [map.pack.religions, map.society.religions, "pack.religions / society.religions"],
    [map.pack.goods, map.economy.goods, "pack.goods / economy.goods"],
    [map.pack.markets, map.economy.markets, "pack.markets / economy.markets"],
    [map.pack.deals, map.economy.deals, "pack.deals / economy.deals"],
    [map.pack.diplomacy, map.diplomacy, "pack.diplomacy / diplomacy"],
    [map.pack.military, map.military, "pack.military / military"]
  ];
  for (const [left, right, label] of aliases) assert.equal(left, right, `${label} alias 丢失`);
}

function assertTypedTopology(map, refinement) {
  assert.ok(map.grid.cells.i instanceof Uint32Array, "grid.cells.i 必须保留 Uint32Array");
  assert.ok(map.pack.cells.i instanceof Uint32Array, "pack.cells.i 必须保留 Uint32Array");
  assert.ok(map.pack.cells.g instanceof Uint32Array, "pack.cells.g 必须保留 Uint32Array");
  assert.ok(map.pack.cells.h instanceof Uint8Array, "pack.cells.h 必须保留 Uint8Array");
  if (!refinement) return;
  assert.ok(map.grid.refinement?.mother instanceof Uint32Array, "grid.refinement.mother 必须保留 Uint32Array");
  assert.equal(map.grid.refinement.children.length, map.grid.refinement.sourceCells);
  assert.ok(map.grid.refinement.children.every(children => children instanceof Uint32Array), "grid.refinement.children 必须全部为 Uint32Array");
}

function assertTransferOwnership(formalMap, replacementMap, transferables) {
  assert.ok(transferables.length > 0, "replacement 必须暴露 Worker 自有 transferable");
  assert.equal(new Set(transferables).size, transferables.length, "transferable collector 不得重复 buffer");
  const formalBuffers = new Set(collectWorkerTransferables(formalMap));
  for (const buffer of transferables) {
    assert.ok(buffer instanceof ArrayBuffer && buffer.byteLength > 0, "replacement transferable 必须是未脱离 ArrayBuffer");
    assert.equal(formalBuffers.has(buffer), false, "replacement transferable 不得借用正式输入 buffer");
  }
  const replacementBuffers = new Set(collectWorkerTransferables(replacementMap));
  assert.ok(transferables.every(buffer => replacementBuffers.has(buffer)), "collector 返回了 replacement 之外的 buffer");
  assert.ok([...formalBuffers].every(buffer => buffer.byteLength > 0), "正式输入 buffer 不得因 Worker 结果收集而脱离");
}

function assertNoSourceMap(value, label) {
  const seen = new WeakSet();
  visit(value, "$", seen);

  function visit(item, path, visited) {
    if (!item || typeof item !== "object" || visited.has(item)) return;
    visited.add(item);
    assert.equal(Object.prototype.hasOwnProperty.call(item, "sourceMap"), false, `${label} 不得携带 ${path}.sourceMap`);
    if (item instanceof ArrayBuffer || ArrayBuffer.isView(item) || item instanceof Date) return;
    if (item instanceof Map) {
      for (const [key, entry] of item) {
        visit(key, `${path}.<key>`, visited);
        visit(entry, `${path}.<value>`, visited);
      }
      return;
    }
    if (item instanceof Set) {
      for (const entry of item) visit(entry, `${path}.<set>`, visited);
      return;
    }
    for (const [key, entry] of Object.entries(item)) visit(entry, `${path}.${key}`, visited);
  }
}

function normalizeSemanticResult(value) {
  const normalized = structuredClone(value);
  delete normalized.replacementMap.metadata.checksum;
  delete normalized.replacementMap.summary.checksum;
  scrubNonSemanticTelemetry(normalized);
  return normalized;
}

function scrubNonSemanticTelemetry(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const key of Object.keys(value)) {
    if (["performance", "timing", "featureTiming", "prepareMs", "buildMs", "totalMs", "completedAt"].includes(key)) {
      delete value[key];
      continue;
    }
    scrubNonSemanticTelemetry(value[key], seen);
  }
}

function routeIdentity(route) {
  return {
    id: Number(route.id),
    type: route.type,
    from: Number(route.from),
    to: Number(route.to),
    feature: Number(route.feature),
    state: Number(route.state),
    province: Number(route.province),
    fromProvincial: Boolean(route.fromProvincial),
    toProvincial: Boolean(route.toProvincial),
    administrativePriority: route.administrativePriority || null
  };
}

function assertRouteIdentitiesEqual(leftMap, rightMap) {
  const left = leftMap.settlements.routes.map(routeIdentity).sort((a, b) => a.id - b.id);
  const right = rightMap.settlements.routes.map(routeIdentity).sort((a, b) => a.id - b.id);
  assert.deepEqual(right, left, "保存往返后 route 稳定身份漂移");
}

function assertRouteMirrors(map) {
  const packRoutes = new Map((map.pack.routes || []).filter(Boolean).map(route => [Number(route.i ?? route.id), route]));
  for (const route of map.settlements.routes || []) {
    const mirror = packRoutes.get(Number(route.id));
    assert(mirror, `route #${route.id} 缺少 pack mirror`);
    assert.equal(Number(mirror.from), Number(route.from), `route #${route.id} from mirror 漂移`);
    assert.equal(Number(mirror.to), Number(route.to), `route #${route.id} to mirror 漂移`);
    assert.equal(Number(mirror.feature), Number(route.feature), `route #${route.id} feature mirror 漂移`);
    assert.equal(mirror.points.length, route.packCells.length, `route #${route.id} pack mirror path 长度漂移`);
    for (let index = 0; index < route.packCells.length; index++) {
      assert.equal(Number(mirror.points[index]?.[2]), Number(route.packCells[index]), `route #${route.id} pack cell #${index} mirror 漂移`);
    }
  }
}

function assertMigratedReferences(map) {
  const gridCount = map.grid.points.length;
  const packCount = map.pack.cells.i.length;
  for (const city of map.settlements.cities || []) {
    if (!city || city.removed) continue;
    assertGridAndPackReference(map, city.cell, city.packCell, `city #${city.id}`);
    const burg = map.pack.burgs?.[Number(city.burgId)];
    assert(burg && !burg.removed, `city #${city.id} 缺少活动 burg`);
    assert.equal(Number(burg.cell), Number(city.packCell), `city #${city.id} burg cell 漂移`);
  }
  for (const marker of map.markers.markers || []) {
    if (!marker || marker.removed) continue;
    assert.ok(inRange(marker.cell, gridCount), `marker #${marker.id} grid cell 越界`);
    assert.ok(inRange(marker.packCell, packCount), `marker #${marker.id} pack cell 越界`);
    assert.equal(Number(marker.data?.packCell), Number(marker.packCell), `marker #${marker.id} pack 双镜像漂移`);
  }
  for (const collection of [map.politics.states, map.politics.provinces]) {
    for (const object of collection || []) {
      if (!object || object.removed || Number(object.id ?? object.i) === 0) continue;
      assertGridAndPackReference(map, object.gridCenter, object.center, `administrative #${object.id ?? object.i}`);
    }
  }
  for (const river of map.rivers.rivers || []) {
    assert.ok((river.gridCells || []).every(cell => inRange(cell, gridCount)), `river #${river.id} grid path 越界`);
    assert.ok((river.cells || []).every(cell => inRange(cell, packCount)), `river #${river.id} pack path 越界`);
    assertAdjacentPath(map.grid.cells.c, river.gridCells || [], `river #${river.id}`);
  }
  for (const route of map.settlements.routes || []) {
    assert.ok((route.cells || []).every(cell => inRange(cell, gridCount)), `route #${route.id} grid path 越界`);
    assert.ok((route.packCells || []).every(cell => inRange(cell, packCount)), `route #${route.id} pack path 越界`);
    assert.equal(route.cells.length, route.packCells.length, `route #${route.id} grid / pack path 长度漂移`);
    assertAdjacentPath(map.pack.cells.c, route.packCells || [], `route #${route.id}`);
    for (let index = 0; index < route.packCells.length; index++) {
      assert.equal(Number(route.cells[index]), Number(map.pack.cells.g[route.packCells[index]]), `route #${route.id} cell mirror #${index} 漂移`);
    }
  }
  for (const zone of map.zones.zones || []) {
    assert.ok((zone?.cells || []).every(cell => inRange(cell, packCount)), `zone #${zone?.i} pack cell 越界`);
  }
}

function assertGridAndPackReference(map, gridCell, packCell, label) {
  assert.ok(inRange(gridCell, map.grid.points.length), `${label} grid cell 越界`);
  assert.ok(inRange(packCell, map.pack.cells.i.length), `${label} pack cell 越界`);
  assert.equal(Number(map.pack.cells.g[packCell]), Number(gridCell), `${label} grid / pack 身份错位`);
}

function assertAdjacentPath(neighbors, path, label) {
  for (let index = 1; index < path.length; index++) {
    const previous = Number(path[index - 1]);
    const current = Number(path[index]);
    assert.ok(previous === current || neighbors[previous]?.includes(current), `${label} 在 ${index - 1}→${index} 断连`);
  }
}

function inRange(value, count) {
  const cell = Number(value);
  return Number.isInteger(cell) && cell >= 0 && cell < count;
}

function captureInputState(map) {
  return {
    gridFingerprint: fingerprintGridStructure(map.grid),
    lockFingerprint: fingerprintGridTopologyLocks(map),
    checksum: map.metadata.checksum,
    summaryChecksum: map.summary.checksum,
    cells: map.grid.points.length,
    packCells: map.pack.cells.i.length,
    routes: map.settlements.routes.length,
    rivers: map.rivers.rivers.length,
    buffers: collectWorkerTransferables(map).map(buffer => ({buffer, byteLength: buffer.byteLength}))
  };
}

function assertInputStateUnchanged(map, state) {
  assert.equal(fingerprintGridStructure(map.grid), state.gridFingerprint, "正式输入 grid 指纹变化");
  assert.equal(fingerprintGridTopologyLocks(map), state.lockFingerprint, "正式输入 lock 指纹变化");
  assert.equal(map.metadata.checksum, state.checksum, "正式输入 metadata checksum 变化");
  assert.equal(map.summary.checksum, state.summaryChecksum, "正式输入 summary checksum 变化");
  assert.equal(map.grid.points.length, state.cells, "正式输入 cell 数变化");
  assert.equal(map.pack.cells.i.length, state.packCells, "正式输入 pack cell 数变化");
  assert.equal(map.settlements.routes.length, state.routes, "正式输入 route 数变化");
  assert.equal(map.rivers.rivers.length, state.rivers, "正式输入 river 数变化");
  for (const item of state.buffers) assert.equal(item.buffer.byteLength, item.byteLength, "正式输入 buffer 被脱离");
}
