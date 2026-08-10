import assert from "node:assert/strict";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {isSettlementWaterRoutePathValid, traceSettlementWaterRoutePath} from "../app/webgl-generator/src/generator/settlements.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {executeMapSnapshotTransaction} from "../app/webgl-generator/src/runtime/map-snapshot-transaction.js";
import {createMapDocument, parseMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {
  commitPreparedGridTopology,
  getGridStructureSnapshot,
  inspectGridRefinement,
  inspectGridStructureWrite,
  prepareGridRefinement,
  prepareGridStructureWrite,
  selectUniqueWaterFeatureRedirects
} from "../app/webgl-generator/src/runtime/grid-topology-api.js";
import {validateRefinedMotherAdjacency} from "../app/webgl-generator/src/generator/grid-refinement.js";
import {burgIdsAtPackCell, cityIdsAtGridCell, rebuildSettlementCellIndex} from "../app/webgl-generator/src/runtime/settlement-cell-index.js";
import {pickGridCell} from "../app/webgl-generator/src/renderer/picking.js";

const source = generatePlaceholderMap({seed: "grid-topology-298", cellsTarget: 10_000});
const sourceCells = source.grid.points.length;
const sourceHeights = [...source.grid.cells.h];
const sourcePoints = source.grid.points.map(point => [...point]);
const sourceComponents = componentCounts(source.grid);
const sourceQuantiles = quantiles(sourceHeights);
const sourceCoastlineSegments = source.features.shore.coastline.length;
const sourceLakeShoreSegments = source.features.shore.lakeShore.length;
const sourceObjectCounts = {cities: source.settlements.cities.length, routes: source.settlements.routes.length, rivers: source.rivers.rivers.length};
const revision = {getSnapshot: () => ({mapIdentity: "grid-topology-regression", mapRevision: 0})};

const snapshot = getGridStructureSnapshot(source, revision);
assert.equal(snapshot.schema, "webgl-grid-structure@1");
assert.notEqual(snapshot.points, source.grid.points);
snapshot.points[0][0] += 1;
assert.deepEqual(source.grid.points[0], sourcePoints[0], "受控快照不得泄露运行时引用");
snapshot.points[0][0] -= 1;

const validWrite = inspectGridStructureWrite(source, revision, snapshot);
assert.equal(validWrite.valid, true);
const staleSnapshot = structuredClone(snapshot);
staleSnapshot.binding.mapRevision++;
assert.equal(inspectGridStructureWrite(source, revision, staleSnapshot).valid, false);
const asymmetric = structuredClone(snapshot);
const firstNeighbor = asymmetric.cells.c[0][0];
asymmetric.cells.c[firstNeighbor] = asymmetric.cells.c[firstNeighbor].filter(cell => cell !== 0);
assert.equal(inspectGridStructureWrite(source, revision, asymmetric).valid, false);

const inspection = inspectGridRefinement(source, revision, {targetCells: 100_000});
assert.equal(inspection.valid, true);
assert.equal(inspection.target.cells, 100_000);
assert.throws(
  () => prepareGridRefinement(source, revision, {targetCells: 100_000, confirm: true, inspectionToken: "stale"}),
  error => error.code === "inspection_stale"
);

source.notes ||= {notes: [], metadata: {notes: 0, formatVersion: 1}};
source.notes.notes.push(...source.settlements.routes.map(route => ({
  id: `route:${route.id}`,
  kind: "route",
  objectId: route.id,
  name: `匿名道路 ${route.id}`,
  body: "网格细分备注往返门",
  format: "plain",
  pinned: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
})));
source.notes.metadata.notes = source.notes.notes.length;

const heapBefore = process.memoryUsage().heapUsed;
const startedAt = performance.now();
const prepared = prepareGridRefinement(source, revision, {
  targetCells: 100_000,
  confirm: true,
  inspectionToken: inspection.inspectionToken
});
const prepareMs = performance.now() - startedAt;
const target = prepared.map;
assert.equal(source.grid.points.length, sourceCells, "准备阶段不得改写当前地图");
assert.equal(target.grid.points.length, 100_000);
assert.deepEqual(target.grid.points.slice(0, sourceCells), sourcePoints);
assert.deepEqual(target.grid.cells.h.slice(0, sourceCells), sourceHeights);
assert.equal(prepared.result.refinement.landSignViolations, 0);
assert.equal(prepared.result.refinement.motherAdjacencyViolations, 0);
assert.equal(validateRefinedMotherAdjacency(source.grid.cells.c, target.grid.cells.c, target.grid.refinement.mother).valid, true);
assert.equal(validateRefinedMotherAdjacency([[1], [0], []], [[1, 2], [0], [0]], [0, 1, 2]).valid, false, "跨母邻接反例没有被拒绝");
assert.deepEqual(componentCounts(target.grid), sourceComponents, "海陆连通分量必须保持");
assertQuantilesClose(sourceQuantiles, quantiles(target.grid.cells.h), 4);
assert.ok(target.features.shore.coastline.length >= sourceCoastlineSegments && target.features.shore.coastline.length <= sourceCoastlineSegments * 15, "海岸细分线段倍率异常");
assert.ok(sourceLakeShoreSegments === 0 || target.features.shore.lakeShore.length >= sourceLakeShoreSegments, "湖岸细分丢失");
assert.equal(target.settlements.cities.length, sourceObjectCounts.cities, "城市数量发生漂移");
assert.equal(target.rivers.rivers.length, sourceObjectCounts.rivers, "河流数量发生漂移");
assert.equal(target.settlements.routes.length, sourceObjectCounts.routes - prepared.result.migration.routesRemoved, "路线移除数量与迁移报告不一致");
const retainedRouteIds = new Set(target.settlements.routes.map(route => Number(route.id)));
for (const route of source.settlements.routes) {
  const hasNote = target.notes.notes.some(note => note?.id === `route:${route.id}`);
  assert.equal(hasNote, retainedRouteIds.has(Number(route.id)), `道路 ${route.id} 的备注与迁移结果不一致`);
}
assertSpatialReferences(target);
assertReachableWaterFeaturesHaveSeaRoutes(target);
assertUniqueWaterFeatureRedirects();
for (const cell of [0, sourceCells, Math.floor(target.grid.points.length / 2), target.grid.points.length - 1]) {
  const point = target.grid.points[cell];
  assert.ok(Number.isInteger(pickGridCell(target, point[0], point[1])?.gridCell), `细分后 cell #${cell} 的世界坐标无法被重新拾取`);
}
for (const city of target.settlements.cities.filter(Boolean)) {
  assert.ok(Number.isInteger(pickGridCell(target, city.x, city.y)?.gridCell), `细分后城市 #${city.id} 的位置无法拾取 grid cell`);
}
const targetRoundtrip = parseMapDocument(stringifyMapDocument(createMapDocument(target))).map;
assertSpatialReferences(targetRoundtrip);
assertReachableWaterFeaturesHaveSeaRoutes(targetRoundtrip);

const history = new EditHistory();
const originalFingerprint = snapshot.binding.sourceFingerprint;
const execution = executeMapSnapshotTransaction({
  map: source,
  editHistory: history,
  label: "测试网格细分",
  domain: "grid-topology",
  effects: {derived: ["render-mesh"]},
  execute: () => commitPreparedGridTopology(source, prepared),
  executeCommand: command => ({executed: Boolean(history.execute(command, {map: source}))})
});
assert.equal(execution.executed, true);
assert.equal(source.grid.points.length, 100_000);
history.undo({map: source});
assert.equal(source.grid.points.length, sourceCells);
assert.equal(getGridStructureSnapshot(source, revision).binding.sourceFingerprint, originalFingerprint);
history.redo({map: source});
assert.equal(source.grid.points.length, 100_000);

const lockedRouteMap = generatePlaceholderMap({seed: "lock-a", cellsTarget: 1_000});
const lockedRoute = lockedRouteMap.settlements.routes.find(route => route?.id === 25 && route.type === "searoute" && route.from >= 0 && route.to === -1);
assert(lockedRoute, "锁定 partial 海路反例缺失");
const lockedIdentity = {
  from: lockedRoute.from,
  to: lockedRoute.to,
  feature: lockedRoute.feature,
  fromProvincial: lockedRoute.fromProvincial,
  toProvincial: lockedRoute.toProvincial,
  administrativePriority: lockedRoute.administrativePriority
};
lockedRouteMap.regenerationLocks = {version: 1, entries: [{kind: "route", id: lockedRoute.id}]};
const lockedRevision = {getSnapshot: () => ({mapIdentity: "grid-topology-locked-route", mapRevision: 0})};
const lockedInspection = inspectGridRefinement(lockedRouteMap, lockedRevision, {targetCells: 5_000});
const lockedPrepared = prepareGridRefinement(lockedRouteMap, lockedRevision, {
  targetCells: 5_000,
  confirm: true,
  inspectionToken: lockedInspection.inspectionToken
});
const migratedLockedRoute = lockedPrepared.map.settlements.routes.find(route => route?.id === lockedRoute.id);
assert(migratedLockedRoute, "合法锁定 partial 海路在细分后丢失");
assert.deepEqual({
  from: migratedLockedRoute.from,
  to: migratedLockedRoute.to,
  feature: migratedLockedRoute.feature,
  fromProvincial: migratedLockedRoute.fromProvincial,
  toProvincial: migratedLockedRoute.toProvincial,
  administrativePriority: migratedLockedRoute.administrativePriority
}, lockedIdentity, "锁定 partial 海路的端点身份被重新绑定");
assert.deepEqual(lockedPrepared.map.regenerationLocks.entries, [{kind: "route", id: lockedRoute.id}], "锁定 partial 海路的锁记录发生漂移");
assert.equal(isSettlementWaterRoutePathValid(lockedPrepared.map.pack, migratedLockedRoute.packCells), true, "锁定 partial 海路没有迁移为正式可航路径");

const conflictingPortMap = generatePlaceholderMap({seed: "port-feature-conflict", cellsTarget: 1_000});
const conflictingPortCity = conflictingPortMap.settlements.cities.find(city => city && !city.removed && Number(city.port) > 0);
assert(conflictingPortCity, "grid port 双镜像冲突反例缺少港口城市");
const conflictingPortBurg = conflictingPortMap.pack.burgs[conflictingPortCity.burgId];
const conflictingWater = conflictingPortMap.pack.features.find(feature => feature
  && !feature.removed
  && feature.land === false
  && Number(feature.id ?? feature.i) !== Number(conflictingPortCity.port));
assert(conflictingWater, "grid port 双镜像冲突反例缺少第二水体");
conflictingPortBurg.port = Number(conflictingWater.id ?? conflictingWater.i);
const conflictingRevision = {getSnapshot: () => ({mapIdentity: "grid-port-feature-conflict", mapRevision: 0})};
const conflictingInspection = inspectGridRefinement(conflictingPortMap, conflictingRevision, {targetCells: 5_000});
const conflictingPrepared = prepareGridRefinement(conflictingPortMap, conflictingRevision, {
  targetCells: 5_000,
  confirm: true,
  inspectionToken: conflictingInspection.inspectionToken
});
const clearedConflictCity = conflictingPrepared.map.settlements.cities[conflictingPortCity.id];
const clearedConflictBurg = conflictingPrepared.map.pack.burgs[clearedConflictCity.burgId];
assert.equal(conflictingPrepared.result.migration.waterFeatures.conflictingPortMirrors, 1, "grid port 双镜像冲突没有记为 unresolved");
assert.equal(Number(clearedConflictCity.port), 0, "grid port 双镜像冲突错误选择了 city 水体");
assert.equal(Number(clearedConflictBurg.port), 0, "grid port 双镜像冲突错误选择了 burg 水体");

const rollbackMap = generatePlaceholderMap({seed: "grid-topology-rollback", cellsTarget: 1_000});
const rollbackRevision = {getSnapshot: () => ({mapIdentity: "grid-topology-rollback", mapRevision: 0})};
const controlledDocument = getGridStructureSnapshot(rollbackMap, rollbackRevision);
const controlledInspection = inspectGridStructureWrite(rollbackMap, rollbackRevision, controlledDocument);
const controlledPrepared = prepareGridStructureWrite(rollbackMap, rollbackRevision, controlledDocument, {confirm: true, inspectionToken: controlledInspection.inspectionToken});
assert.equal(controlledPrepared.map.grid.points.length, rollbackMap.grid.points.length, "受控结构写入准备改变了 cell 数");
assert.deepEqual(controlledPrepared.map.grid.cells.h, rollbackMap.grid.cells.h, "受控结构写入准备改变了高度");
const [sharedCellAnchor, sharedCellMover] = rollbackMap.settlements.cities.filter(city => city && !city.removed).slice(0, 2);
assert(sharedCellAnchor && sharedCellMover, "grid 细分样本缺少同 cell 多城候选");
Object.assign(sharedCellMover, {cell: sharedCellAnchor.cell, packCell: sharedCellAnchor.packCell, x: sharedCellAnchor.x, y: sharedCellAnchor.y});
Object.assign(rollbackMap.pack.burgs[sharedCellMover.burgId], {cell: sharedCellAnchor.packCell, x: sharedCellAnchor.x, y: sharedCellAnchor.y});
rebuildSettlementCellIndex(rollbackMap, {syncLegacy: true});
const rollbackInspection = inspectGridRefinement(rollbackMap, rollbackRevision, {targetCells: 10_000});
const rollbackPrepared = prepareGridRefinement(rollbackMap, rollbackRevision, {targetCells: 10_000, confirm: true, inspectionToken: rollbackInspection.inspectionToken});
const refinedSharedCell = rollbackPrepared.map.settlements.cities[sharedCellAnchor.id].cell;
const refinedSharedPackCell = rollbackPrepared.map.settlements.cities[sharedCellAnchor.id].packCell;
assert.deepEqual(cityIdsAtGridCell(rollbackPrepared.map, refinedSharedCell), [sharedCellAnchor.id, sharedCellMover.id].sort((a, b) => a - b), "grid 细分丢失同 cell 多城索引");
assert.deepEqual(burgIdsAtPackCell(rollbackPrepared.map, refinedSharedPackCell), [sharedCellAnchor.burgId, sharedCellMover.burgId].sort((a, b) => a - b), "grid 细分丢失同 cell 多 burg 索引");
const rollbackCells = rollbackMap.grid.points.length;
const refinedRoundtrip = parseMapDocument(stringifyMapDocument(createMapDocument(rollbackPrepared.map)));
assert.equal(refinedRoundtrip.map.grid.points.length, 10_000, "细分地图保存再读取丢失网格");
assert.equal(refinedRoundtrip.map.grid.refinement.targetCells, 10_000, "细分元数据保存再读取失败");
const legacyRoundtrip = parseMapDocument(stringifyMapDocument(createMapDocument(rollbackMap)));
assert.equal(legacyRoundtrip.map.grid.refinement, undefined, "旧地图不得被伪造为已细分地图");
assert.throws(() => executeMapSnapshotTransaction({
  map: rollbackMap,
  editHistory: new EditHistory(),
  label: "故障注入",
  domain: "grid-topology",
  execute() {
    commitPreparedGridTopology(rollbackMap, rollbackPrepared);
    throw new Error("injected-grid-failure");
  },
  executeCommand() {
    throw new Error("不应执行");
  }
}), /injected-grid-failure/);
assert.equal(rollbackMap.grid.points.length, rollbackCells, "故障后必须恢复原网格");

console.log(JSON.stringify({
  passed: true,
  sourceCells,
  targetCells: target.grid.points.length,
  sourcePackCells: prepared.result.source.packCells,
  targetPackCells: prepared.result.target.packCells,
  sourceComponents,
  targetComponents: componentCounts(target.grid),
  sourceQuantiles,
  targetQuantiles: quantiles(target.grid.cells.h),
  coastlineSegments: {source: sourceCoastlineSegments, target: target.features.shore.coastline.length},
  lakeShoreSegments: {source: sourceLakeShoreSegments, target: target.features.shore.lakeShore.length},
  removedCrossMotherEdges: prepared.result.refinement.removedCrossMotherEdges,
  prepareMs: Math.round(prepareMs * 100) / 100,
  heapDeltaMb: Math.round((process.memoryUsage().heapUsed - heapBefore) / 1048576),
  migration: prepared.result.migration
}, null, 2));

function componentCounts(grid) {
  const seen = new Uint8Array(grid.points.length);
  const result = {land: 0, water: 0};
  for (let start = 0; start < grid.points.length; start++) {
    if (seen[start]) continue;
    const land = grid.cells.h[start] >= 20;
    result[land ? "land" : "water"]++;
    const queue = [start];
    seen[start] = 1;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      for (const neighbor of grid.cells.c[queue[cursor]] || []) {
        if (seen[neighbor] || (grid.cells.h[neighbor] >= 20) !== land) continue;
        seen[neighbor] = 1;
        queue.push(neighbor);
      }
    }
  }
  return result;
}

function quantiles(values) {
  const sorted = Array.from(values, Number).sort((a, b) => a - b);
  const pick = ratio => sorted[Math.floor((sorted.length - 1) * ratio)];
  return {p10: pick(0.1), p25: pick(0.25), p50: pick(0.5), p75: pick(0.75), p90: pick(0.9)};
}

function assertQuantilesClose(left, right, tolerance) {
  for (const key of Object.keys(left)) assert.ok(Math.abs(left[key] - right[key]) <= tolerance, `${key} 分位数偏差过大：${left[key]} -> ${right[key]}`);
}

function assertSpatialReferences(map) {
  const gridCount = map.grid.points.length;
  const packCount = map.pack.cells.i.length;
  const gridRepresentatives = new Map();
  const packRepresentatives = new Map();
  for (const city of map.settlements?.cities || []) {
    if (!city || city.removed) continue;
    assert.ok(Number.isInteger(city.cell) && city.cell >= 0 && city.cell < gridCount, `城市 ${city.id} grid cell 无效`);
    assert.ok(Number.isInteger(city.packCell) && city.packCell >= 0 && city.packCell < packCount, `城市 ${city.id} pack cell 无效`);
    assert.equal(Number(map.pack.cells.g[city.packCell]), Number(city.cell), `城市 ${city.id} grid / pack 身份错位`);
    const burg = map.pack.burgs?.[city.burgId];
    assert(burg && !burg.removed, `城市 ${city.id} 缺少活动 burg #${city.burgId}`);
    assert.equal(Number(burg.cell), Number(city.packCell), `城市 ${city.id} burg cell 未迁移到新 pack`);
    assert.deepEqual([burg.x, burg.y], [city.x, city.y], `城市 ${city.id} burg 坐标未与城市同步`);
    rememberMin(gridRepresentatives, city.cell, city.id);
    rememberMin(packRepresentatives, city.packCell, city.burgId);
  }
  for (let cell = 0; cell < gridCount; cell++) assert.equal(Number(map.grid.cells.burg[cell]), gridRepresentatives.get(cell) ?? -1, `grid burg mirror #${cell} 异常`);
  for (let cell = 0; cell < packCount; cell++) assert.equal(Number(map.pack.cells.burg[cell]), packRepresentatives.get(cell) ?? 0, `pack burg mirror #${cell} 异常`);
  for (const river of map.rivers?.rivers || []) {
    assert.ok((river.gridCells || []).every(cell => Number.isInteger(cell) && cell >= 0 && cell < gridCount), `河流 ${river.id} grid path 无效`);
    assertPathAdjacency(map.grid, river.gridCells || [], `河流 ${river.id}`);
    assert.ok((river.cells || []).every(cell => Number.isInteger(cell) && cell >= 0 && cell < packCount), `河流 ${river.id} pack path 无效`);
  }
  for (const route of map.settlements?.routes || []) {
    assert.ok((route.cells || []).every(cell => Number.isInteger(cell) && cell >= 0 && cell < gridCount), `道路 ${route.id} grid path 无效`);
    assert.ok((route.packCells || []).every(cell => Number.isInteger(cell) && cell >= 0 && cell < packCount), `道路 ${route.id} pack path 无效`);
    assert.equal(route.cells.length, route.packCells.length, `道路 ${route.id} grid / pack path 长度不一致`);
    assert.equal(route.points.length, route.packCells.length, `道路 ${route.id} display points 长度不一致`);
    for (let index = 0; index < route.packCells.length; index++) {
      const packCell = Number(route.packCells[index]);
      assert.equal(Number(route.cells[index]), Number(map.pack.cells.g[packCell]), `道路 ${route.id} display / cell identity 在 #${index} 错位`);
      if (index > 0) assert.ok(map.pack.cells.c[route.packCells[index - 1]]?.includes(packCell), `道路 ${route.id} pack path 在 ${index - 1} → ${index} 处断裂`);
      const point = route.points[index];
      const center = map.pack.cells.p[packCell];
      const cityPoints = (map.settlements?.cities || [])
        .filter(city => city && !city.removed && Number(city.packCell) === packCell)
        .map(city => [Number(city.x), Number(city.y)]);
      assert.ok([center, ...cityPoints].some(candidate => pointDistance(point, candidate) <= 1e-6), `道路 ${route.id} display point #${index} 与 pack cell 脱离`);
    }
    assertRouteEndpointIdentity(map, route, "from", 0);
    assertRouteEndpointIdentity(map, route, "to", route.packCells.length - 1);
    if (route.type === "searoute") assert.equal(isSettlementWaterRoutePathValid(map.pack, route.packCells), true, `海路 ${route.id} 未通过正式水路门`);
    else assert.ok(route.packCells.every(cell => Number(map.pack.cells.h[cell]) >= 20), `陆路 ${route.id} 穿过水体`);
  }
}

function assertRouteEndpointIdentity(map, route, key, pointIndex) {
  const cityId = Number(route[key]);
  if (!Number.isInteger(cityId) || cityId < 0) return;
  const city = map.settlements?.cities?.[cityId];
  assert(city && !city.removed && Number(city.id) === cityId, `道路 ${route.id} 的 ${key} 城市无效`);
  assert.equal(Number(route.packCells[pointIndex]), Number(city.packCell), `道路 ${route.id} 的 ${key} 端点 cell 与城市不一致`);
  assert.ok(pointDistance(route.points[pointIndex], [city.x, city.y]) <= 1e-6, `道路 ${route.id} 的 ${key} display 端点与城市坐标不一致`);
  if (route.type === "searoute") assert.equal(Number(city.port), Number(route.feature), `海路 ${route.id} 的 ${key} 港口水体与路线不一致`);
}

function pointDistance(left, right) {
  return Math.hypot(Number(left?.[0]) - Number(right?.[0]), Number(left?.[1]) - Number(right?.[1]));
}

function assertReachableWaterFeaturesHaveSeaRoutes(map) {
  const portsByFeature = new Map();
  for (const city of map.settlements?.cities || []) {
    if (!city || city.removed || !(Number(city.port) > 0)) continue;
    const ports = portsByFeature.get(Number(city.port)) || [];
    ports.push(city);
    portsByFeature.set(Number(city.port), ports);
  }
  for (const [feature, ports] of portsByFeature) {
    let reachable = false;
    for (let left = 0; left < ports.length && !reachable; left++) {
      for (let right = left + 1; right < ports.length; right++) {
        if (traceSettlementWaterRoutePath(map.pack, ports[left].packCell, ports[right].packCell).length > 1) {
          reachable = true;
          break;
        }
      }
    }
    if (!reachable) continue;
    assert.ok((map.settlements?.routes || []).some(route => route.type === "searoute"
      && Number(route.feature) === feature
      && isSettlementWaterRoutePathValid(map.pack, route.packCells)), `可达水体 #${feature} 没有保留正式海路`);
  }
}

function assertUniqueWaterFeatureRedirects() {
  const water = id => ({id, i: id, land: false, type: "ocean", cells: 10});
  const oldFeatures = [null, water(1), water(2)];
  const newFeatures = [null, water(1), water(2)];
  const swapped = selectUniqueWaterFeatureRedirects(oldFeatures, newFeatures, new Map([
    [1, new Map([[1, 1], [2, 8]])],
    [2, new Map([[1, 9]])]
  ]));
  assert.deepEqual([...swapped], [[1, 2], [2, 1]], "water feature 数值 ID 别名覆盖了空间映射");
  const ambiguous = selectUniqueWaterFeatureRedirects(oldFeatures, newFeatures, new Map([[1, new Map([[1, 5], [2, 5]])]]));
  assert.equal(ambiguous.has(1), false, "water feature 等量 split 被错误猜测映射");
  const merged = selectUniqueWaterFeatureRedirects(oldFeatures, newFeatures, new Map([
    [1, new Map([[1, 8]])],
    [2, new Map([[1, 7]])]
  ]));
  assert.equal(merged.size, 0, "多个旧水体 merge 到同一新水体时未标记 unresolved");
  const nonReciprocal = selectUniqueWaterFeatureRedirects(
    oldFeatures,
    newFeatures,
    new Map([[1, new Map([[1, 8], [2, 1]])]]),
    new Map([[1, new Map([[1, 8], [2, 12]])]])
  );
  assert.equal(nonReciprocal.has(1), false, "非互为主导 overlap 的 water feature 被错误映射");
}

function rememberMin(map, cell, id) {
  const current = map.get(Number(cell));
  if (current === undefined || Number(id) < current) map.set(Number(cell), Number(id));
}

function assertPathAdjacency(grid, path, label) {
  for (let index = 1; index < path.length; index++) {
    assert.ok(path[index] === path[index - 1] || grid.cells.c[path[index - 1]]?.includes(path[index]), `${label} 在 ${index - 1} → ${index} 处断裂`);
  }
}
