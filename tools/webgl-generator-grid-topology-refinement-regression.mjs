import assert from "node:assert/strict";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {executeMapSnapshotTransaction} from "../app/webgl-generator/src/runtime/map-snapshot-transaction.js";
import {createMapDocument, parseMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {
  commitPreparedGridTopology,
  getGridStructureSnapshot,
  inspectGridRefinement,
  inspectGridStructureWrite,
  prepareGridRefinement,
  prepareGridStructureWrite
} from "../app/webgl-generator/src/runtime/grid-topology-api.js";
import {validateRefinedMotherAdjacency} from "../app/webgl-generator/src/generator/grid-refinement.js";

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
assert.deepEqual({cities: target.settlements.cities.length, routes: target.settlements.routes.length, rivers: target.rivers.rivers.length}, sourceObjectCounts, "空间对象数量发生漂移");
assertSpatialReferences(target);

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

const rollbackMap = generatePlaceholderMap({seed: "grid-topology-rollback", cellsTarget: 1_000});
const rollbackRevision = {getSnapshot: () => ({mapIdentity: "grid-topology-rollback", mapRevision: 0})};
const controlledDocument = getGridStructureSnapshot(rollbackMap, rollbackRevision);
const controlledInspection = inspectGridStructureWrite(rollbackMap, rollbackRevision, controlledDocument);
const controlledPrepared = prepareGridStructureWrite(rollbackMap, rollbackRevision, controlledDocument, {confirm: true, inspectionToken: controlledInspection.inspectionToken});
assert.equal(controlledPrepared.map.grid.points.length, rollbackMap.grid.points.length, "受控结构写入准备改变了 cell 数");
assert.deepEqual(controlledPrepared.map.grid.cells.h, rollbackMap.grid.cells.h, "受控结构写入准备改变了高度");
const rollbackInspection = inspectGridRefinement(rollbackMap, rollbackRevision, {targetCells: 10_000});
const rollbackPrepared = prepareGridRefinement(rollbackMap, rollbackRevision, {targetCells: 10_000, confirm: true, inspectionToken: rollbackInspection.inspectionToken});
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
  for (const city of map.settlements?.cities || []) {
    assert.ok(Number.isInteger(city.cell) && city.cell >= 0 && city.cell < gridCount, `城市 ${city.id} grid cell 无效`);
    assert.ok(Number.isInteger(city.packCell) && city.packCell >= 0 && city.packCell < packCount, `城市 ${city.id} pack cell 无效`);
  }
  for (const river of map.rivers?.rivers || []) {
    assert.ok((river.gridCells || []).every(cell => Number.isInteger(cell) && cell >= 0 && cell < gridCount), `河流 ${river.id} grid path 无效`);
    assertPathAdjacency(map.grid, river.gridCells || [], `河流 ${river.id}`);
    assert.ok((river.cells || []).every(cell => Number.isInteger(cell) && cell >= 0 && cell < packCount), `河流 ${river.id} pack path 无效`);
  }
  for (const route of map.settlements?.routes || []) {
    assert.ok((route.cells || []).every(cell => Number.isInteger(cell) && cell >= 0 && cell < gridCount), `道路 ${route.id} grid path 无效`);
    assertPathAdjacency(map.grid, route.cells || [], `道路 ${route.id}`);
    assert.ok((route.packCells || []).every(cell => Number.isInteger(cell) && cell >= 0 && cell < packCount), `道路 ${route.id} pack path 无效`);
  }
}

function assertPathAdjacency(grid, path, label) {
  for (let index = 1; index < path.length; index++) {
    assert.ok(path[index] === path[index - 1] || grid.cells.c[path[index - 1]]?.includes(path[index]), `${label} 在 ${index - 1} → ${index} 处断裂`);
  }
}
