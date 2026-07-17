#!/usr/bin/env node
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {inspectRelocatedSettlementPort} from "../app/webgl-generator/src/generator/settlements.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createMapDocument, parseMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {
  createApplyFeatureTopologyCommand,
  FEATURE_TOPOLOGY_MODE,
  inspectFeatureTopology,
  rebuildFeatureTopology
} from "../app/webgl-generator/src/runtime/feature-topology-edit-commands.js";
import {createApplyHeightBrushCommand} from "../app/webgl-generator/src/runtime/height-edit-commands.js";

const seed = "feature-topology-regression";
const operationResults = {};

const carveMap = createCleanMap();
const carve = findSingleCellInspection(carveMap, FEATURE_TOPOLOGY_MODE.CARVE_COAST);
assert(carve?.valid, "没有找到可执行的海岸雕刻样本");
const carveGridFeature = Number(carveMap.grid.cells.f[carve.gridCells[0]]);
const carvePackFeature = Number(carveMap.pack.cells.f[carve.packCells[0]]);
const carveAsStrait = inspectFeatureTopology(carveMap, {mode: FEATURE_TOPOLOGY_MODE.OPEN_STRAIT, gridCells: carve.gridCells});
assert(!carveAsStrait.valid && carveAsStrait.code === "strait-does-not-split-land", "普通海岸雕刻被错误放行为开海峡");
const carveBefore = topologySnapshot(carveMap);
const carveCommand = createApplyFeatureTopologyCommand(carve);
const carveHistory = new EditHistory();
carveHistory.execute(carveCommand, {map: carveMap});
assert(carveHistory.getStats().undo === 1 && carveHistory.getStats().lastDomain === "feature-topology", "海岸雕刻没有写入唯一历史记录");
assert(carveMap.grid.cells.h[carve.gridCells[0]] === 19, "海岸雕刻没有把 grid 高度写为 19");
assert(carve.packCells.every(cell => carveMap.pack.cells.h[cell] === 19), "海岸雕刻没有同步全部 pack cells");
assert(carveMap.features.features[carveGridFeature] && !carveMap.features.features[carveGridFeature].removed, "未分裂的 grid Feature 没有保留 ID");
assert(carveMap.pack.features[carvePackFeature] && !carveMap.pack.features[carvePackFeature].removed, "未分裂的 pack Feature 没有保留 ID");
assert(carveMap.metadata.derivedStale.systems.includes("rivers"), "海岸雕刻没有标记水文待派生");
const carveAfter = topologySnapshot(carveMap);
carveHistory.undo({map: carveMap});
assertDeepEqual(topologySnapshot(carveMap), carveBefore, "海岸雕刻撤销没有精确恢复");
carveHistory.redo({map: carveMap});
assertDeepEqual(topologySnapshot(carveMap), carveAfter, "海岸雕刻重做没有恢复首次结果");
operationResults.carve = {gridCell: carve.gridCells[0], packCells: carve.packCells.length, featureId: carvePackFeature};

const reclaimMap = createCleanMap();
const reclaim = findSingleCellInspection(reclaimMap, FEATURE_TOPOLOGY_MODE.RECLAIM_COAST);
assert(reclaim?.valid, "没有找到可执行的填岸样本");
const reclaimCommand = createApplyFeatureTopologyCommand(reclaim);
reclaimCommand.apply({map: reclaimMap});
assert(reclaimMap.grid.cells.h[reclaim.gridCells[0]] === 20, "填岸没有把 grid 高度写为 20");
assert(reclaim.packCells.every(cell => reclaimMap.pack.cells.h[cell] === 20), "填岸没有同步全部 pack cells");
operationResults.reclaim = {gridCell: reclaim.gridCells[0], packCells: reclaim.packCells.length};

const straitMap = createCleanMap();
const openStrait = findSingleCellInspection(straitMap, FEATURE_TOPOLOGY_MODE.OPEN_STRAIT);
assert(openStrait?.valid, "没有找到可执行的开海峡样本");
const openStraitCommand = createApplyFeatureTopologyCommand(openStrait);
openStraitCommand.apply({map: straitMap});
const openedAsReclaim = inspectFeatureTopology(straitMap, {mode: FEATURE_TOPOLOGY_MODE.RECLAIM_COAST, gridCells: openStrait.gridCells});
assert(!openedAsReclaim.valid, "已打开的海峡被错误放行为普通填岸");
const closeStrait = inspectFeatureTopology(straitMap, {mode: FEATURE_TOPOLOGY_MODE.CLOSE_STRAIT, gridCells: openStrait.gridCells});
assert(closeStrait.valid, `已打开的海峡不能闭合：${closeStrait.reason}`);
const landFeatureIds = adjacentLandPackFeatures(straitMap, closeStrait.packCells);
const expectedLandSurvivor = [...landFeatureIds].sort((a, b) => Number(straitMap.pack.features[b]?.area || 0) - Number(straitMap.pack.features[a]?.area || 0) || a - b)[0];
const closeStraitCommand = createApplyFeatureTopologyCommand(closeStrait);
closeStraitCommand.apply({map: straitMap});
assert(straitMap.grid.cells.h[openStrait.gridCells[0]] === 20, "闭海峡没有恢复陆地高度");
assert(straitMap.pack.features[expectedLandSurvivor] && !straitMap.pack.features[expectedLandSurvivor].removed, "闭海峡没有按实际面积保留陆地 Feature ID");
for (const id of landFeatureIds) if (id !== expectedLandSurvivor) assert(straitMap.pack.features[id]?.removed && Number(straitMap.pack.features[id].redirectTo) === expectedLandSurvivor, "闭海峡 loser 缺少 tombstone 重定向");
closeStraitCommand.revert({map: straitMap});
assert(straitMap.grid.cells.h[openStrait.gridCells[0]] === 19, "闭海峡撤销没有恢复水道");
openStraitCommand.revert({map: straitMap});
assert(straitMap.grid.cells.h[openStrait.gridCells[0]] >= 20, "开海峡撤销没有恢复原陆地");
operationResults.strait = {gridCell: openStrait.gridCells[0], width: 1};

const channelMap = createCleanMap();
const channelFixture = createLakeChannelFixture(channelMap);
const gridLakeId = Number(channelMap.grid.cells.f[channelFixture.lakeCell]);
const lakePackCell = packCellsForGrid(channelMap, channelFixture.lakeCell)[0];
const packLakeId = Number(channelMap.pack.cells.f[lakePackCell]);
const oceanPackId = adjacentOpenWaterFeature(channelMap, channelFixture.corridor, packLakeId);
const portFixture = attachLakePort(channelMap, packLakeId, channelFixture.corridor);
const otherLakeId = channelMap.pack.features.find(feature => feature && !feature.removed && feature.type === "lake" && Number(feature.i ?? feature.id) !== packLakeId)?.i;
const tombstoneFeatureId = channelMap.pack.features.length;
channelMap.pack.features.push({id: tombstoneFeatureId, i: tombstoneFeatureId, removed: true, tombstone: true, cells: 0});
channelMap.pack.features[packLakeId].type = "ocean";
channelMap.pack.features[oceanPackId].type = "lake";
const channel = inspectFeatureTopology(channelMap, {
  mode: FEATURE_TOPOLOGY_MODE.OPEN_LAKE_TO_SEA,
  gridCells: [channelFixture.corridor],
  featureId: packLakeId
});
assert(channel.valid, `湖海开渠预检失败：${channel.reason}`);
const wrongChannelFeature = inspectFeatureTopology(channelMap, {
  mode: FEATURE_TOPOLOGY_MODE.OPEN_LAKE_TO_SEA,
  gridCells: [channelFixture.corridor],
  featureId: oceanPackId
});
assert(!wrongChannelFeature.valid && wrongChannelFeature.code === "feature-mismatch", "湖海开渠错误接受了开放海域 featureId");
if (Number.isInteger(otherLakeId)) {
  const otherLakeChannel = inspectFeatureTopology(channelMap, {mode: FEATURE_TOPOLOGY_MODE.OPEN_LAKE_TO_SEA, gridCells: [channelFixture.corridor], featureId: otherLakeId});
  assert(!otherLakeChannel.valid && otherLakeChannel.code === "feature-mismatch", "湖海开渠错误接受了其它湖泊 featureId");
}
const tombstoneChannel = inspectFeatureTopology(channelMap, {mode: FEATURE_TOPOLOGY_MODE.OPEN_LAKE_TO_SEA, gridCells: [channelFixture.corridor], featureId: tombstoneFeatureId});
assert(!tombstoneChannel.valid && tombstoneChannel.code === "feature-mismatch", "湖海开渠错误接受了 tombstone featureId");
const portBefore = portState(portFixture);
const channelCommand = createApplyFeatureTopologyCommand(channel);
channelCommand.apply({map: channelMap});
assert(channelMap.features.features[gridLakeId]?.removed, "湖海合并后 grid 湖泊没有保留 tombstone");
assert(channelMap.pack.features[packLakeId]?.removed, "湖海合并后 pack 湖泊没有保留 tombstone");
assert(Number(channelMap.pack.features[packLakeId]?.redirectTo) === oceanPackId, "开放海域存续被失真的旧 type 覆盖");
assert(channelMap.pack.features[oceanPackId] && !channelMap.pack.features[oceanPackId].removed, "真实开放海域 ID 没有存续");
assert(portFixture.city.port === oceanPackId && portFixture.burg.port === oceanPackId, "港口双镜像没有按新水体重定向");
assert(!channelMap.pack.features[portFixture.city.port].removed, "港口仍指向 tombstone");
channelCommand.revert({map: channelMap});
assertDeepEqual(portState(portFixture), portBefore, "湖海开渠撤销没有恢复港口 port / x / y");
channelCommand.apply({map: channelMap});
operationResults.channel = {corridor: channelFixture.corridor, lakeCell: channelFixture.lakeCell, lakeId: packLakeId};

const roundtrip = parseMapDocument(stringifyMapDocument(createMapDocument(channelMap, channelMap.options)));
assert(roundtrip.map.pack.features[packLakeId]?.removed, "完整地图往返丢失 Feature tombstone");
assert(Number(roundtrip.map.settlements.cities.find(city => Number(city.id) === portFixture.city.id)?.port) === oceanPackId, "完整地图往返丢失港口重定向");

const protectedMap = createCleanMap();
const protectedDraft = findSingleCellInspection(protectedMap, FEATURE_TOPOLOGY_MODE.CARVE_COAST);
assert(protectedDraft?.valid, "保护对象测试缺少海岸样本");
protectedMap.pack.cells.burg[protectedDraft.packCells[0]] = 999;
const protectedInspection = inspectFeatureTopology(protectedMap, {
  mode: FEATURE_TOPOLOGY_MODE.CARVE_COAST,
  gridCells: protectedDraft.gridCells
});
assert(!protectedInspection.valid && protectedInspection.code === "protected-burg", "城市保护门禁没有拒绝操作");

const independentBurgMap = createCleanMap();
const independentDraft = findSingleCellInspection(independentBurgMap, FEATURE_TOPOLOGY_MODE.CARVE_COAST);
independentBurgMap.pack.cells.burg[independentDraft.packCells[0]] = 0;
independentBurgMap.pack.burgs.push({i: 7777, cell: independentDraft.packCells[0], port: 0});
const independentBurgInspection = inspectFeatureTopology(independentBurgMap, {mode: FEATURE_TOPOLOGY_MODE.CARVE_COAST, gridCells: independentDraft.gridCells});
assert(!independentBurgInspection.valid && independentBurgInspection.code === "protected-city", "独立 pack burg 镜像没有被保护门禁识别");

const distantPortMap = createCleanMap();
const distantCarve = findSingleCellInspection(distantPortMap, FEATURE_TOPOLOGY_MODE.CARVE_COAST);
const distantCell = distantPortMap.pack.cells.i.find(cell => {
  const gridCell = Number(distantPortMap.pack.cells.g[cell]);
  return distantPortMap.pack.cells.h[cell] >= 20
    && !distantCarve.gridCells.includes(gridCell)
    && !(distantPortMap.pack.cells.c?.[cell] || []).some(neighbor => distantCarve.gridCells.includes(Number(distantPortMap.pack.cells.g[neighbor])));
});
const distantBurg = {i: 8888, cell: distantCell, port: 999999};
const distantCity = {id: 8888, burgId: 8888, packCell: distantCell, port: 999999};
distantPortMap.pack.burgs.push(distantBurg);
distantPortMap.settlements.cities.push(distantCity);
const distantPortInspection = inspectFeatureTopology(distantPortMap, {mode: FEATURE_TOPOLOGY_MODE.CARVE_COAST, gridCells: distantCarve.gridCells});
assert(distantPortInspection.valid, `远端旧港口不应阻断局部海岸雕刻：${distantPortInspection.reason}`);

const disconnectedMap = createCleanMap();
const landCells = disconnectedMap.grid.cells.i.filter(cell => disconnectedMap.grid.cells.h[cell] >= 20);
const disconnected = inspectFeatureTopology(disconnectedMap, {
  mode: FEATURE_TOPOLOGY_MODE.CARVE_COAST,
  gridCells: [landCells[0], landCells.at(-1)]
});
assert(!disconnected.valid && disconnected.code === "disconnected-selection", "非共享边选择没有被拒绝");

const sharedMap = createCleanMap();
assert(sharedMap.grid.features === sharedMap.features.features, "生成地图应使用共享 grid Feature 镜像");
rebuildFeatureTopology(sharedMap);
assert(sharedMap.grid.features === sharedMap.features.features, "重建破坏了共享 grid Feature 镜像");
sharedMap.grid.features = structuredClone(sharedMap.features.features);
rebuildFeatureTopology(sharedMap);
assert(sharedMap.grid.features !== sharedMap.features.features, "重建破坏了独立 grid Feature 镜像");
assertDeepEqual(sharedMap.grid.features, sharedMap.features.features, "独立 grid Feature 镜像内容不一致");

const legacyMap = createCleanMap();
delete legacyMap.pack.cells.type;
const legacyTombstoneId = legacyMap.pack.features.length;
legacyMap.pack.features.push({id: legacyTombstoneId, i: legacyTombstoneId, removed: true, tombstone: true, cells: 0});
rebuildFeatureTopology(legacyMap);
assert(legacyMap.pack.cells.type.length === legacyMap.pack.cells.h.length, "旧图缺失 pack.cells.type 没有自动回填");
assert(legacyMap.pack.features[legacyTombstoneId]?.removed, "旧图既有 tombstone 没有保留");

for (const stage of ["after-heights", "after-rebuild", "after-references", "before-validate"]) {
  const map = createCleanMap();
  const inspection = findSingleCellInspection(map, FEATURE_TOPOLOGY_MODE.CARVE_COAST);
  const before = topologySnapshot(map);
  const history = new EditHistory();
  const command = createApplyFeatureTopologyCommand({...inspection, faultAt: stage});
  assertThrows(() => history.execute(command, {map}), stage, `故障阶段 ${stage} 没有抛错`);
  assertDeepEqual(topologySnapshot(map), before, `故障阶段 ${stage} 没有完整回滚`);
  assert(history.getStats().undo === 0, `故障阶段 ${stage} 不应写入历史`);
}

const portFaultMap = createCleanMap();
const portFaultFixture = createLakeChannelFixture(portFaultMap);
const portFaultPackCell = packCellsForGrid(portFaultMap, portFaultFixture.lakeCell)[0];
const portFaultLakeId = Number(portFaultMap.pack.cells.f[portFaultPackCell]);
attachLakePort(portFaultMap, portFaultLakeId, portFaultFixture.corridor);
const portFaultInspection = inspectFeatureTopology(portFaultMap, {
  mode: FEATURE_TOPOLOGY_MODE.OPEN_LAKE_TO_SEA,
  gridCells: [portFaultFixture.corridor],
  featureId: portFaultLakeId
});
assert(portFaultInspection.valid, `端口故障回滚样本无效：${portFaultInspection.reason}`);
const portFaultBefore = topologySnapshot(portFaultMap);
const portFaultHistory = new EditHistory();
assertThrows(
  () => portFaultHistory.execute(createApplyFeatureTopologyCommand({...portFaultInspection, faultAt: "after-references"}), {map: portFaultMap}),
  "after-references",
  "端口引用故障没有抛错"
);
assertDeepEqual(topologySnapshot(portFaultMap), portFaultBefore, "after-references 故障没有恢复端口双镜像字段");
assert(portFaultHistory.getStats().undo === 0, "端口引用故障不应写入历史");

const nonCrossingMap = heightFixture();
createApplyHeightBrushCommand([{gridCell: 0, before: 30, after: 31}]).apply({map: nonCrossingMap});
assert(!nonCrossingMap.metadata.derivedStale, "未跨海平面的普通高度编辑不应标记 Feature 待派生");
const crossingMap = heightFixture();
const crossingCommand = createApplyHeightBrushCommand([{gridCell: 0, before: 20, after: 19}]);
crossingCommand.apply({map: crossingMap});
assert(crossingMap.metadata.derivedStale.systems[0] === "features", "跨海平面的普通高度编辑应先标记 Feature 待派生");
assert(crossingMap.pack.cells.h[0] === 19 && crossingMap.pack.cells.h[1] === 19, "普通高度编辑没有同步全部 pack 镜像");
crossingCommand.revert({map: crossingMap});
assert(crossingMap.grid.cells.h[0] === 20 && crossingMap.pack.cells.h[0] === 20, "跨海平面高度撤销失败");

console.log(JSON.stringify({
  ok: true,
  operations: operationResults,
  invalid: {protected: protectedInspection.code, disconnected: disconnected.code},
  height: {nonCrossingStale: false, crossingFirstStale: "features"},
  compatibility: {independentBurg: independentBurgInspection.code, distantPortIgnored: true, legacyTypeBackfill: true, faultStages: 5, roundtrip: true}
}, null, 2));

function createCleanMap() {
  const map = generatePlaceholderMap({seed, cellsTarget: 10000, heightmapTemplate: "continents"});
  if (map.settlements) {
    map.settlements.cities = [];
    map.settlements.routes = [];
  }
  if (map.pack) {
    map.pack.burgs = [];
    map.pack.routes = [];
    map.pack.rivers = [];
  }
  if (map.rivers) map.rivers.rivers = [];
  fillArray(map.pack.cells.burg, 0);
  fillArray(map.pack.cells.r, 0);
  return map;
}

function findSingleCellInspection(map, mode) {
  for (const cell of map.grid.cells.i) {
    const land = map.grid.cells.h[cell] >= 20;
    const sourceLand = mode !== FEATURE_TOPOLOGY_MODE.RECLAIM_COAST && mode !== FEATURE_TOPOLOGY_MODE.CLOSE_STRAIT;
    if (land !== sourceLand) continue;
    const inspection = inspectFeatureTopology(map, {mode, gridCells: [cell]});
    if (inspection.valid) return inspection;
  }
  return null;
}

function createLakeChannelFixture(map) {
  const {h, c, f, b} = map.grid.cells;
  const features = map.features.features;
  for (const corridor of map.grid.cells.i) {
    if (h[corridor] < 20) continue;
    if (!(c[corridor] || []).some(neighbor => h[neighbor] < 20 && features[f[neighbor]]?.type === "ocean")) continue;
    for (const lakeCell of c[corridor] || []) {
      if (h[lakeCell] < 20 || b[lakeCell]) continue;
      if ((c[lakeCell] || []).some(neighbor => neighbor !== corridor && h[neighbor] < 20)) continue;
      const lakeCells = [lakeCell];
      for (const neighbor of c[lakeCell] || []) {
        if (neighbor === corridor || h[neighbor] < 20 || b[neighbor]) continue;
        if ((c[neighbor] || []).some(next => !lakeCells.includes(next) && next !== lakeCell && h[next] < 20)) continue;
        lakeCells.push(neighbor);
        if (lakeCells.length >= 3) break;
      }
      for (const target of lakeCells) {
        map.grid.cells.h[target] = 19;
        for (const packCell of packCellsForGrid(map, target)) map.pack.cells.h[packCell] = 19;
      }
      rebuildFeatureTopology(map);
      if (map.features.features[map.grid.cells.f[lakeCell]]?.type === "lake") return {corridor, lakeCell, lakeCells};
      throw new Error("构造的内陆水体没有被识别为湖泊");
    }
  }
  throw new Error("没有找到可构造湖海渠道的海岸样本");
}

function packCellsForGrid(map, gridCell) {
  const result = [];
  for (let cell = 0; cell < map.pack.cells.g.length; cell++) if (Number(map.pack.cells.g[cell]) === gridCell) result.push(cell);
  return result;
}

function adjacentLandPackFeatures(map, packCells) {
  const selected = new Set(packCells);
  const ids = new Set();
  for (const cell of packCells) {
    for (const neighbor of map.pack.cells.c?.[cell] || []) {
      if (selected.has(neighbor) || map.pack.cells.h[neighbor] < 20) continue;
      const id = Number(map.pack.cells.f[neighbor]);
      if (id > 0) ids.add(id);
    }
  }
  assert(ids.size >= 2, "闭海峡样本没有连接两个陆地 Feature");
  return ids;
}

function adjacentOpenWaterFeature(map, corridor, excludedId) {
  const corridorPackCells = packCellsForGrid(map, corridor);
  for (const packCell of corridorPackCells) {
    for (const neighbor of map.pack.cells.c?.[packCell] || []) {
      if (map.pack.cells.h[neighbor] >= 20) continue;
      const id = Number(map.pack.cells.f[neighbor]);
      if (id > 0 && id !== excludedId && map.pack.features[id]?.border) return id;
    }
  }
  throw new Error("湖海渠道样本缺少相邻开放海域 Feature");
}

function attachLakePort(map, lakeId, corridorGridCell) {
  const corridorPack = new Set(packCellsForGrid(map, corridorGridCell));
  for (const cell of map.pack.cells.i) {
    if (corridorPack.has(cell) || map.pack.cells.h[cell] < 20) continue;
    const haven = Number(map.pack.cells.haven?.[cell]);
    if (!Number.isInteger(haven) || Number(map.pack.cells.f?.[haven]) !== lakeId) continue;
    const id = 9001;
    const burg = {i: id, id, cityId: id, cell, port: lakeId, capital: 0, x: map.pack.cells.p[cell][0], y: map.pack.cells.p[cell][1]};
    const city = {id, burgId: id, packCell: cell, cell: Number(map.pack.cells.g[cell]), port: lakeId, capital: false, x: burg.x, y: burg.y};
    map.pack.burgs.push(burg);
    const placement = inspectRelocatedSettlementPort(map.grid, map.pack, cell, {wasPort: lakeId, burgId: id, options: map.options || {}});
    if (!placement.port) {
      map.pack.burgs.pop();
      continue;
    }
    map.settlements.cities.push(city);
    map.pack.cells.burg[cell] = id;
    return {city, burg, cell};
  }
  throw new Error("湖泊样本没有可用的港口岸格");
}

function topologySnapshot(map) {
  return {
    gridH: [...map.grid.cells.h],
    gridF: [...map.grid.cells.f],
    packH: [...map.pack.cells.h],
    packF: [...map.pack.cells.f],
    gridFeatures: map.features.features,
    packFeatures: map.pack.features,
    ports: uniquePortState(map),
    stale: map.metadata.derivedStale || null
  };
}

function portState(fixture) {
  return {
    city: {port: fixture.city.port, x: fixture.city.x, y: fixture.city.y, feature: fixture.city.feature},
    burg: {port: fixture.burg.port, x: fixture.burg.x, y: fixture.burg.y, feature: fixture.burg.feature}
  };
}

function uniquePortState(map) {
  return [
    ...(map.settlements?.cities || []).map(object => ({kind: "city", id: object.id, port: object.port, x: object.x, y: object.y, feature: object.feature})),
    ...(map.pack?.burgs || []).map(object => ({kind: "burg", id: object.i ?? object.id, port: object.port, x: object.x, y: object.y, feature: object.feature}))
  ];
}

function heightFixture() {
  return {
    metadata: {},
    grid: {cells: {h: [20]}},
    pack: {cells: {g: [0, 0], h: [20, 20]}},
    markers: {metadata: {}},
    zones: {metadata: {}},
    military: {metadata: {}},
    economy: {metadata: {}},
    diplomacy: {metadata: {}}
  };
}

function fillArray(values, value) {
  if (!values) return;
  if (typeof values.fill === "function") values.fill(value);
  else for (let index = 0; index < values.length; index++) values[index] = value;
}

function assertDeepEqual(actual, expected, message) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}

function assertThrows(action, pattern, message) {
  try {
    action();
  } catch (error) {
    assert(String(error?.message || error).includes(pattern), `${message}：${error?.message || error}`);
    return;
  }
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
