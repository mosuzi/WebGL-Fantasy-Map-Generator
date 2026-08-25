#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {finalizeSettlements} from "../app/webgl-generator/src/generator/settlements.js";
import {createMapDocument, parseMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {OBJECT_KIND} from "../app/webgl-generator/src/runtime/object-kinds.js";
import {buildObjectPickingIndex, refreshRiversInPickingIndex} from "../app/webgl-generator/src/renderer/picking.js";
import {
  assertLockedRegenerationSnapshots,
  captureLockedRegenerationObjects
} from "../app/webgl-generator/src/runtime/regeneration-lock-protection.js";
import {regenerateMapAttributeForWorker} from "../app/webgl-generator/src/runtime/regeneration-worker-task.js";
import {reconcileSettlementCellIdentity} from "../app/webgl-generator/src/runtime/settlement-cell-index.js";

const map = generatePlaceholderMap({seed: "settlement-route-identity", cellsTarget: 10_000, heightmapTemplate: "continents"});
const activeCities = map.settlements.cities.filter(city => city && !city.removed);
const city = activeCities.find(item => Number.isInteger(item.packCell));
assert(city, "固定图缺少活动城镇");
const burg = map.pack.burgs[city.burgId];
const staleCell = farthestPackCell(map.pack, city.packCell);
assert.notEqual(staleCell, city.packCell, "固定图缺少旧 pack cell 反例");

burg.cell = staleCell;
burg.x = map.pack.cells.p[staleCell][0];
burg.y = map.pack.cells.p[staleCell][1];
map.pack.cells.burg[city.packCell] = 0;
map.pack.cells.burg[staleCell] = city.burgId;
map.grid.cells.burg[map.pack.cells.g[staleCell]] = city.id;
map.regenerationLocks = {version: 1, entries: [{kind: OBJECT_KIND.CITY, id: city.id}]};

const loaded = parseMapDocument(stringifyMapDocument(createMapDocument(map))).map;
assertSettlementIdentity(loaded, "旧档加载");
const loadedCity = loaded.settlements.cities.find(item => Number(item?.id) === Number(city.id));
const loadedBurg = loaded.pack.burgs[loadedCity.burgId];
assert.equal(loadedBurg.cell, loadedCity.packCell, "旧 burg cell 未按 city 新身份修复");
assert.deepEqual([loadedBurg.x, loadedBurg.y], [loadedCity.x, loadedCity.y], "旧 burg 坐标未保留城市港口偏移");
assert.equal(loaded.pack.cells.burg[staleCell], staleCell === loadedCity.packCell ? loadedCity.burgId : 0, "幽灵 pack burg 镜像未清除");

const cityLocks = captureLockedRegenerationObjects(loaded, OBJECT_KIND.CITY);
finalizeSettlements(loaded.grid, loaded.features, loaded.politics, loaded.settlements, loaded.pack, {
  ...loaded.options,
  routeRegenerationSalt: 325
});
assertLockedRegenerationSnapshots(loaded, cityLocks);
const routeAudit = auditRoutes(loaded);
assert.equal(routeAudit.identityErrors, 0, "道路显示点没有使用一致的 city / burg / cell 身份");
assert.equal(routeAudit.endpointErrors, 0, "道路 from / to 没有对应首尾 pack cell 的活动城镇身份");
assert.equal(routeAudit.teleports, 0, `道路仍存在显著超出相邻 pack 几何的显示跳跃，最大 ${routeAudit.maxSegment}`);
const pickingIndex = buildObjectPickingIndex(loaded);
const routePickingIdentity = new Map([...pickingIndex.buckets].map(([key, bucket]) => [key, {
  array: bucket.routeSegments,
  segments: [...bucket.routeSegments]
}]));
refreshRiversInPickingIndex(pickingIndex, loaded.rivers.rivers);
for (const [key, before] of routePickingIdentity) {
  const bucket = pickingIndex.buckets.get(key);
  assert.strictEqual(bucket.routeSegments, before.array, `河流 picking 刷新替换了 bucket #${key} 的道路数组 identity`);
  assert.equal(bucket.routeSegments.length, before.segments.length, `河流 picking 刷新改变了 bucket #${key} 的道路段数量`);
  for (let index = 0; index < before.segments.length; index++) assert.strictEqual(bucket.routeSegments[index], before.segments[index], `河流 picking 刷新替换了道路段 identity`);
}

const shared = generatePlaceholderMap({seed: "settlement-shared-cell", cellsTarget: 1_000});
const [first, second] = shared.settlements.cities.filter(item => item && !item.removed).slice(0, 2);
assert(first && second, "固定图缺少同 cell 多城反例");
const sharedOffset = [Number(first.x) + 0.25, Number(first.y) - 0.25];
Object.assign(second, {cell: first.cell, packCell: first.packCell, x: sharedOffset[0], y: sharedOffset[1]});
const secondBurg = shared.pack.burgs[second.burgId];
Object.assign(secondBurg, {cell: first.packCell, x: sharedOffset[0], y: sharedOffset[1]});
const sharedReport = reconcileSettlementCellIdentity(shared);
assert.equal(shared.grid.cells.burg[first.cell], Math.min(first.id, second.id), "同 grid cell 代表不是最小城市 ID");
assert.equal(shared.pack.cells.burg[first.packCell], Math.min(first.burgId, second.burgId), "同 pack cell 代表不是最小 burg ID");
assert.deepEqual([secondBurg.x, secondBurg.y], sharedOffset, "同 cell 非代表城市的独立港口偏移被覆盖");
assert.equal(sharedReport.sharedGridCells, 1);
assert.equal(sharedReport.sharedPackCells, 1);
finalizeSettlements(shared.grid, shared.features, shared.politics, shared.settlements, shared.pack, {
  ...shared.options,
  routeRegenerationSalt: 325
});
const sharedRouteAudit = auditRoutes(shared);
assert.equal(sharedRouteAudit.identityErrors, 0, "同 cell 多城后道路显示点身份不一致");
assert.equal(sharedRouteAudit.endpointErrors, 0, "同 cell 多城后道路端点身份不一致");

const invalid = generatePlaceholderMap({seed: "settlement-invalid-cell", cellsTarget: 1_000});
const invalidCity = invalid.settlements.cities.find(item => item && !item.removed);
invalidCity.packCell = invalid.pack.cells.i.find(cell => Number(invalid.pack.cells.g[cell]) !== Number(invalidCity.cell));
const invalidBefore = structuredClone(invalid);
assert.throws(
  () => reconcileSettlementCellIdentity(invalid),
  error => error?.code === "settlement_cell_identity_invalid" && error?.details?.reason === "grid-pack-mismatch",
  "非法 city grid / pack 身份没有明确拒绝"
);
assert.deepEqual(invalid, invalidBefore, "身份校验失败后地图发生了写入");

const atomic = generatePlaceholderMap({seed: "settlement-atomic-failure", cellsTarget: 1_000});
const [atomicFirst, atomicSecond] = atomic.settlements.cities.filter(item => item && !item.removed).slice(0, 2);
assert(atomicFirst && atomicSecond, "固定图缺少后置失败反例");
const atomicFirstBurg = atomic.pack.burgs[atomicFirst.burgId];
atomicFirstBurg.cell = farthestPackCell(atomic.pack, atomicFirst.packCell);
atomicFirstBurg.x += 10;
atomicSecond.packCell = atomic.pack.cells.i.find(cell => Number(atomic.pack.cells.g[cell]) !== Number(atomicSecond.cell));
const atomicBefore = structuredClone(atomic);
assert.throws(
  () => reconcileSettlementCellIdentity(atomic),
  error => error?.code === "settlement_cell_identity_invalid" && error?.details?.reason === "grid-pack-mismatch",
  "第二城后置 grid / pack 失败没有明确拒绝"
);
assert.deepEqual(atomic, atomicBefore, "后置校验失败时前序 burg 被部分修复");

const swapped = generatePlaceholderMap({seed: "settlement-city-index", cellsTarget: 1_000});
const [swappedFirst, swappedSecond] = swapped.settlements.cities.filter(item => item && !item.removed).slice(0, 2);
assert(swappedFirst && swappedSecond, "固定图缺少 city 槽位交换反例");
const firstSlot = swapped.settlements.cities.indexOf(swappedFirst);
const secondSlot = swapped.settlements.cities.indexOf(swappedSecond);
[swapped.settlements.cities[firstSlot], swapped.settlements.cities[secondSlot]] = [swappedSecond, swappedFirst];
const swappedBefore = structuredClone(swapped);
assert.throws(
  () => reconcileSettlementCellIdentity(swapped),
  error => error?.code === "settlement_cell_identity_invalid" && error?.details?.reason === "city-index-mismatch",
  "city 槽位与 id 对调没有明确拒绝"
);
assert.deepEqual(swapped, swappedBefore, "city 槽位校验失败后地图发生了写入");

const orphan = generatePlaceholderMap({seed: "settlement-orphan-burg", cellsTarget: 1_000});
const orphanCity = orphan.settlements.cities.find(item => item && !item.removed);
const orphanBurg = orphan.pack.burgs[orphanCity.burgId];
orphanCity.removed = true;
const orphanBefore = structuredClone(orphan);
assert.throws(
  () => reconcileSettlementCellIdentity(orphan),
  error => error?.code === "settlement_cell_identity_invalid" && error?.details?.reason === "orphan-burg",
  "removed city 对应的活动 orphan burg 没有明确拒绝"
);
assert.deepEqual(orphan, orphanBefore, "orphan burg 校验失败后地图发生了写入");
orphanBurg.removed = true;
reconcileSettlementCellIdentity(orphan);

const invalidBurg = generatePlaceholderMap({seed: "settlement-invalid-burg-id", cellsTarget: 1_000});
invalidBurg.pack.burgs.push({i: "bad", removed: false, cell: 0, x: 0, y: 0});
const invalidBurgBefore = structuredClone(invalidBurg);
assert.throws(
  () => reconcileSettlementCellIdentity(invalidBurg),
  error => error?.code === "settlement_cell_identity_invalid" && error?.details?.reason === "invalid-burg-id",
  "活动 burg 非法 ID 被静默忽略"
);
assert.deepEqual(invalidBurg, invalidBurgBefore, "非法 burg ID 校验失败后地图发生了写入");

const stringBurg = generatePlaceholderMap({seed: "settlement-string-burg-id", cellsTarget: 1_000});
const stringCity = stringBurg.settlements.cities.find(item => item && !item.removed);
const stringRecord = stringBurg.pack.burgs[stringCity.burgId];
if (Object.prototype.hasOwnProperty.call(stringRecord, "i")) stringRecord.i = String(stringCity.burgId);
if (Object.prototype.hasOwnProperty.call(stringRecord, "id")) stringRecord.id = String(stringCity.burgId);
reconcileSettlementCellIdentity(stringBurg);
assert.equal(typeof stringRecord.i, "number", "numeric-string burg.i 没有规范为 number");
if (Object.prototype.hasOwnProperty.call(stringRecord, "id")) assert.equal(typeof stringRecord.id, "number", "numeric-string burg.id 没有规范为 number");
const stringRoundTrip = parseMapDocument(stringifyMapDocument(createMapDocument(stringBurg))).map;
finalizeSettlements(stringRoundTrip.grid, stringRoundTrip.features, stringRoundTrip.politics, stringRoundTrip.settlements, stringRoundTrip.pack, {
  ...stringRoundTrip.options,
  routeRegenerationSalt: 326
});
assert.equal(auditRoutes(stringRoundTrip).endpointErrors, 0, "numeric-string burg ID 保存往返后道路端点退化");

const idOnly = generatePlaceholderMap({seed: "settlement-id-only-burg", cellsTarget: 1_000});
for (const targetBurg of idOnly.pack.burgs) {
  if (!targetBurg || targetBurg.removed || !Number.isInteger(Number(targetBurg.i)) || Number(targetBurg.i) <= 0) continue;
  targetBurg.id = Number(targetBurg.i);
  delete targetBurg.i;
}
const idOnlyRouteCount = idOnly.settlements.routes.length;
reconcileSettlementCellIdentity(idOnly);
assert(idOnly.pack.burgs.filter(targetBurg => targetBurg && !targetBurg.removed && Number(targetBurg.i) > 0).length > 0, "id-only burg 没有回填 canonical i");
finalizeSettlements(idOnly.grid, idOnly.features, idOnly.politics, idOnly.settlements, idOnly.pack, {
  ...idOnly.options,
  routeRegenerationSalt: 327
});
assert(idOnly.settlements.routes.length > 0 && idOnlyRouteCount > 0, "id-only burg 一致化后道路退化为空");
const idOnlyRoundTrip = parseMapDocument(stringifyMapDocument(createMapDocument(idOnly))).map;
assert(idOnlyRoundTrip.pack.burgs.some(targetBurg => Number(targetBurg?.i) > 0), "id-only burg 保存往返后没有 canonical i");

const staleCityMirror = generatePlaceholderMap({seed: "settlement-stale-burg-city", cellsTarget: 1_000});
const [mirrorCity, mirrorOther] = staleCityMirror.settlements.cities.filter(item => item && !item.removed).slice(0, 2);
const mirrorBurg = staleCityMirror.pack.burgs[mirrorCity.burgId];
mirrorBurg.cityId = mirrorOther.id;
mirrorCity.x = String(mirrorCity.x);
mirrorCity.y = String(mirrorCity.y);
reconcileSettlementCellIdentity(staleCityMirror);
assert.equal(mirrorBurg.cityId, mirrorCity.id, "burg.cityId 旧镜像没有按 city 身份同步");
assert.equal(typeof mirrorCity.x, "number", "city.x numeric-string 没有规范为 number");
assert.equal(typeof mirrorCity.y, "number", "city.y numeric-string 没有规范为 number");

const typed = {
  grid: {points: [[1, 1]], cells: {burg: [-1]}},
  pack: {
    cells: {i: [0], g: [0], burg: new Int8Array([0])},
    burgs: Array.from({length: 201}, () => null)
  },
  settlements: {cities: [{id: 0, burgId: 200, cell: 0, packCell: 0, x: 1, y: 1}], routes: []}
};
typed.pack.burgs[200] = {i: 200, cell: 0, x: 1, y: 1};
reconcileSettlementCellIdentity(typed);
assert(typed.pack.cells.burg instanceof Uint16Array, "Int8 burg mirror 没有升级为无符号容量");
assert.equal(typed.pack.cells.burg[0], 200, "burgId 200 在 mirror 中发生有符号溢出");

const typedHigh = {
  grid: {points: [[1, 1]], cells: {burg: [-1]}},
  pack: {
    cells: {i: [0], g: [0], burg: new Uint32Array([0])},
    burgs: Array.from({length: 70_001}, () => null)
  },
  settlements: {cities: [{id: 0, burgId: 1, cell: 0, packCell: 0, x: 1, y: 1}], routes: []}
};
typedHigh.pack.burgs[1] = {i: 1, cell: 0, x: 1, y: 1};
typedHigh.pack.burgs[70_000] = {i: 70_000, removed: true, cell: 0, x: 1, y: 1};
reconcileSettlementCellIdentity(typedHigh);
assert(typedHigh.pack.cells.burg instanceof Uint32Array, "高位 removed burg / 既有 Uint32 容量被降级");
typedHigh.pack.cells.burg[0] = 70_000;
assert.equal(typedHigh.pack.cells.burg[0], 70_000, "高位 burg ID mirror 容量不足");

assert.deepEqual(
  reconcileSettlementCellIdentity({grid: {points: [], cells: {}}}),
  {cities: 0, gridCells: 0, packCells: 0, sharedGridCells: 0, sharedPackCells: 0},
  "无 pack / settlement 的合法空地图不应被拒绝"
);
const empty = {
  grid: {points: [[0, 0]], cells: {burg: [-1]}},
  pack: {cells: {i: [0], g: [0], burg: new Uint16Array([7])}, burgs: [null]},
  settlements: {cities: [], routes: []}
};
assert.deepEqual(reconcileSettlementCellIdentity(empty), {cities: 0, gridCells: 0, packCells: 0, sharedGridCells: 0, sharedPackCells: 0});
assert.deepEqual(empty.grid.cells.burg, [-1], "无城地图 grid mirror 未保持为空");
assert.deepEqual([...empty.pack.cells.burg], [0], "无城地图 pack mirror 未清空幽灵值");

const appSource = fs.readFileSync(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8");
const riverBlock = sourceFunctionBlock(appSource, "regenerateRivers", "regenerateCities");
assert.match(riverBlock, /markDerivedFresh\(map, \["rivers", "biomes"\]\)/, "河流重算没有只标记 rivers / biomes fresh");
assert.match(riverBlock, /markDerivedStale\(map, \["routes"/, "河流重算没有把道路标为待派生");
assert.doesNotMatch(riverBlock, /finalizeSettlements|routeLocks|lockedRoutes|OBJECT_KIND\.ROUTE|route-mesh|collectionAffected\(OBJECT_KIND\.ROUTE|道路同步重算/, "河流重算仍直接触碰道路");
assert.match(riverBlock, /picking: "rivers"/, "河流重算没有使用只更新河流的 picking 路径");
assert.doesNotMatch(riverBlock, /"object-index"/, "河流重算仍触发全量对象 picking 重建");
const routeBlock = sourceFunctionBlock(appSource, "regenerateRoutes", "regenerateRivers");
assert.match(routeBlock, /allRegenerationObjectsLocked[\s\S]*captureLockedRegenerationObjects\(map, OBJECT_KIND\.ROUTE\)[\s\S]*captureLockedRegenerationObjects\(map, OBJECT_KIND\.CITY\)[\s\S]*reconcileSettlementCellIdentity\(map\)[\s\S]*reconcileSettlementPortTopology\(map, \{mode: "routes", preserveProtected: true\}\)/, "显式道路重算没有在全锁 no-op 后先冻结道路/城镇锁快照，再只修复未保护的派生身份");

const legacyPoliticalMirror = generatePlaceholderMap({seed: "route-legacy-political-mirror", cellsTarget: 3_000, heightmapTemplate: "continents"});
const legacyLockedRoute = legacyPoliticalMirror.settlements.routes.find(route => route?.packCells?.length >= 3);
const legacyLockedState = legacyPoliticalMirror.politics.states.find(state => state?.i && !state.removed);
assert(legacyLockedRoute && legacyLockedState, "旧政治镜像固定图缺少可锁道路或国家");
legacyPoliticalMirror.politics.states = structuredClone(legacyPoliticalMirror.pack.states);
legacyPoliticalMirror.politics.provinces = structuredClone(legacyPoliticalMirror.pack.provinces);
legacyPoliticalMirror.pack.states[legacyLockedState.i] = {
  ...structuredClone(legacyPoliticalMirror.pack.states[legacyLockedState.i]),
  cells: Number(legacyPoliticalMirror.pack.states[legacyLockedState.i].cells || 0) + 1
};
legacyPoliticalMirror.pack.provinces[0] = {
  ...structuredClone(legacyPoliticalMirror.pack.provinces[0]),
  area: Number(legacyPoliticalMirror.pack.provinces[0]?.area || 0) + 1
};
legacyPoliticalMirror.regenerationLocks = {
  version: 1,
  entries: [{kind: OBJECT_KIND.ROUTE, id: legacyLockedRoute.id}]
};
const legacyLockedRouteBefore = structuredClone(legacyLockedRoute);
const legacyResult = regenerateMapAttributeForWorker(legacyPoliticalMirror, "routes");
assert.equal(legacyResult.executed, true, "旧 politics / pack 镜像不一致时路线重生成未执行");
assert.deepEqual(legacyPoliticalMirror.politics.states, legacyPoliticalMirror.pack.states, "路线重生成未归一旧 state 镜像");
assert.deepEqual(legacyPoliticalMirror.politics.provinces, legacyPoliticalMirror.pack.provinces, "路线重生成未归一旧 province 镜像");
assert.deepEqual(legacyPoliticalMirror.settlements.routes[legacyLockedRoute.id], legacyLockedRouteBefore, "旧镜像修复改写了锁定路线");

console.log(JSON.stringify({
  ok: true,
  cities: activeCities.length,
  routes: loaded.settlements.routes.length,
  routeAudit,
  sharedReport,
  sharedRouteAudit,
  stalePackCellCleared: staleCell !== loadedCity.packCell,
  legacyPoliticalMirror: {
    routeId: legacyLockedRoute.id,
    stateId: legacyLockedState.i,
    statesShared: legacyPoliticalMirror.politics.states === legacyPoliticalMirror.pack.states,
    provincesShared: legacyPoliticalMirror.politics.provinces === legacyPoliticalMirror.pack.provinces
  }
}, null, 2));

function assertSettlementIdentity(target, label) {
  const active = target.settlements.cities.filter(item => item && !item.removed);
  const gridBuckets = new Map();
  const packBuckets = new Map();
  for (const item of active) {
    assert.strictEqual(target.settlements.cities[item.id], item, `${label} 城镇 #${item.id} 不在直接索引槽位`);
    const targetBurg = target.pack.burgs[item.burgId];
    assert(targetBurg && !targetBurg.removed, `${label} 城镇 #${item.id} 缺少 burg`);
    assert.equal(target.pack.cells.g[item.packCell], item.cell, `${label} 城镇 #${item.id} grid / pack 不一致`);
    assert.equal(targetBurg.cell, item.packCell, `${label} 城镇 #${item.id} burg cell 不一致`);
    assert.deepEqual([targetBurg.x, targetBurg.y], [item.x, item.y], `${label} 城镇 #${item.id} burg 坐标不一致`);
    push(gridBuckets, item.cell, item.id);
    push(packBuckets, item.packCell, item.burgId);
  }
  for (let cell = 0; cell < target.grid.points.length; cell++) {
    assert.equal(Number(target.grid.cells.burg[cell]), Math.min(...(gridBuckets.get(cell) || [-1])), `${label} grid mirror #${cell} 不一致`);
  }
  for (let cell = 0; cell < target.pack.cells.i.length; cell++) {
    assert.equal(Number(target.pack.cells.burg[cell]), Math.min(...(packBuckets.get(cell) || [0])), `${label} pack mirror #${cell} 不一致`);
  }
}

function auditRoutes(target) {
  const cityByBurg = new Map(target.settlements.cities.filter(item => item && !item.removed).map(item => [Number(item.burgId), item]));
  let identityErrors = 0;
  let endpointErrors = 0;
  let teleports = 0;
  let maxSegment = 0;
  for (const route of target.settlements.routes) {
    for (let index = 0; index < route.packCells.length; index++) {
      const cell = route.packCells[index];
      const burgId = Number(target.pack.cells.burg[cell]);
      const targetCity = cityByBurg.get(burgId);
      const targetBurg = target.pack.burgs[burgId];
      const useCity = targetCity && targetBurg && !targetBurg.removed
        && target.settlements.cities[targetCity.id] === targetCity
        && Number(targetBurg.i ?? targetBurg.id) === burgId
        && Number(targetCity.burgId) === burgId
        && Number(targetCity.packCell) === cell
        && Number(targetBurg.cell) === cell
        && Number(target.pack.cells.g[cell]) === Number(targetCity.cell);
      const expected = useCity ? [targetCity.x, targetCity.y] : target.pack.cells.p[cell];
      if (route.points[index]?.[0] !== expected?.[0] || route.points[index]?.[1] !== expected?.[1]) identityErrors++;
      if (index === 0) continue;
      const distance = Math.hypot(route.points[index][0] - route.points[index - 1][0], route.points[index][1] - route.points[index - 1][1]);
      const previousCell = route.packCells[index - 1];
      const centerDistance = Math.hypot(
        target.pack.cells.p[cell][0] - target.pack.cells.p[previousCell][0],
        target.pack.cells.p[cell][1] - target.pack.cells.p[previousCell][1]
      );
      maxSegment = Math.max(maxSegment, distance);
      if (distance > Math.max(32, centerDistance * 4)) teleports++;
    }
    if (Number(route.from) !== expectedEndpointCityId(target, cityByBurg, route.packCells[0])) endpointErrors++;
    if (Number(route.to) !== expectedEndpointCityId(target, cityByBurg, route.packCells.at(-1))) endpointErrors++;
  }
  return {identityErrors, endpointErrors, teleports, maxSegment: Number(maxSegment.toFixed(3))};
}

function expectedEndpointCityId(target, cityByBurg, packCell) {
  const burgId = Number(target.pack.cells.burg?.[packCell]);
  const city = cityByBurg.get(burgId);
  const burg = target.pack.burgs?.[burgId];
  const valid = Number.isInteger(packCell)
    && city
    && !city.removed
    && target.settlements.cities[city.id] === city
    && burg
    && !burg.removed
    && Number(burg.i ?? burg.id) === burgId
    && Number(city.burgId) === burgId
    && Number(city.packCell) === packCell
    && Number(burg.cell) === packCell
    && Number(target.pack.cells.g?.[packCell]) === Number(city.cell);
  return valid ? Number(city.id) : -1;
}

function farthestPackCell(pack, from) {
  const point = pack.cells.p[from];
  let selected = from;
  let distance = -1;
  for (const cell of pack.cells.i) {
    const candidate = pack.cells.p[cell];
    const next = (candidate[0] - point[0]) ** 2 + (candidate[1] - point[1]) ** 2;
    if (next > distance) {
      selected = cell;
      distance = next;
    }
  }
  return selected;
}

function sourceFunctionBlock(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`function ${nextName}`, start + 1);
  assert(start >= 0 && end > start, `找不到 ${name} 源码块`);
  return source.slice(start, end);
}

function push(buckets, cell, id) {
  const values = buckets.get(cell) || [];
  values.push(Number(id));
  buckets.set(cell, values);
}
