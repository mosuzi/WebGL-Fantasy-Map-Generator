import assert from "node:assert/strict";
import {buildObjectPickingIndex, CITY_PICK_RADIUS_CSS_PX, pickCity} from "../app/webgl-generator/src/renderer/picking.js";

assert.equal(CITY_PICK_RADIUS_CSS_PX, 18, "城镇热区半径必须保持冻结的 CSS 像素值");

for (const scale of [0.5, 1, 4, 10]) {
  const map = createMap([{id: 1, x: 400, y: 200, cell: 1}]);
  const index = buildObjectPickingIndex(map);
  assert.equal(pickAtCssOffset(map, index, scale, 17.5)?.id, 1, `${scale}x 下 17.5px 应命中城镇`);
  assert.equal(pickAtCssOffset(map, index, scale, 18.5), null, `${scale}x 下 18.5px 不应命中城镇`);
}

const denseMap = createMap([
  {id: 1, x: 100, y: 100, cell: 1},
  {id: 2, x: 125, y: 100, cell: 2}
]);
const denseIndex = buildObjectPickingIndex(denseMap);
assert.equal(pickAtScreenPoint(denseMap, denseIndex, 116, 100)?.id, 2, "密集热区冲突时没有选择屏幕距离最近的城镇");
assert.equal(pickAtScreenPoint(denseMap, denseIndex, 112.5, 100)?.id, 1, "等距候选没有按稳定 ID 决胜");

const sameCellMap = createMap([
  {id: 3, x: 100, y: 100, cell: 7},
  {id: 4, x: 125, y: 100, cell: 7}
]);
const sameCellPick = pickAtScreenPoint(sameCellMap, buildObjectPickingIndex(sameCellMap), 116, 100, {cycleIndex: 1});
assert.equal(sameCellPick?.id, 4, "同 cell 但不同位置的城镇不应绕过最近距离循环");
assert.deepEqual(sameCellPick?.overlapCandidateIds, [4], "同 cell 不同位置不应伪装成完全重合候选");

const overlapMap = createMap([
  {id: 8, x: 220, y: 140, cell: 8},
  {id: 9, x: 220, y: 140, cell: 9}
]);
const overlapIndex = buildObjectPickingIndex(overlapMap);
const firstOverlap = pickAtScreenPoint(overlapMap, overlapIndex, 220, 140, {cycleIndex: 0});
const secondOverlap = pickAtScreenPoint(overlapMap, overlapIndex, 220, 140, {cycleIndex: 1});
assert.deepEqual(firstOverlap?.overlapCandidateIds, [8, 9], "完全重合候选顺序不稳定");
assert.equal(firstOverlap?.id, 8, "完全重合首次选择没有采用最小稳定 ID");
assert.equal(secondOverlap?.id, 9, "完全重合重复选择没有保留循环能力");

const quantizedOverlapMap = createMap([
  {id: 10, x: 320, y: 180, cell: 10},
  {id: 11, x: 320.1, y: 180.1, cell: 11}
]);
const quantizedOverlapPick = pickAtScreenPoint(quantizedOverlapMap, buildObjectPickingIndex(quantizedOverlapMap), 320.05, 180.05, {cycleIndex: 1});
assert.deepEqual(quantizedOverlapPick?.overlapCandidateIds, [10, 11], "既有 0.1 world 释放量化误差应视为同一落点");
assert.equal(quantizedOverlapPick?.id, 11, "量化后的同一落点未保留循环能力");

const distinctMap = createMap([
  {id: 12, x: 420, y: 220, cell: 12},
  {id: 13, x: 420.12, y: 220, cell: 13}
]);
const distinctPick = pickAtScreenPoint(distinctMap, buildObjectPickingIndex(distinctMap), 420.08, 220, {cycleIndex: 1});
assert.equal(distinctPick?.id, 13, "超过释放量化误差的密集候选仍应选择最近城镇");
assert.deepEqual(distinctPick?.overlapCandidateIds, [13], "不同落点不应被合并为循环候选");

console.log(JSON.stringify({
  ok: true,
  radiusCssPx: CITY_PICK_RADIUS_CSS_PX,
  scaleCases: [0.5, 1, 4, 10],
  nearestConflict: {pointer: [116, 100], selectedId: 2},
  stableTie: {pointer: [112.5, 100], selectedId: 1},
  overlapCycle: [firstOverlap.id, secondOverlap.id],
  quantizedOverlapCycle: [10, quantizedOverlapPick.id]
}, null, 2));

function pickAtCssOffset(map, index, scale, offsetCssPx) {
  const city = map.settlements.cities[1];
  const pointerWorldX = city.x + offsetCssPx / scale;
  return pickCity(map, index, pointerWorldX, city.y, CITY_PICK_RADIUS_CSS_PX / scale, {
    maxPickDistance: CITY_PICK_RADIUS_CSS_PX,
    distanceToCity: candidate => Math.hypot((candidate.x - pointerWorldX) * scale, (candidate.y - city.y) * scale)
  });
}

function pickAtScreenPoint(map, index, screenX, screenY, {cycleIndex = 0} = {}) {
  return pickCity(map, index, screenX, screenY, CITY_PICK_RADIUS_CSS_PX, {
    cycleIndex,
    maxPickDistance: CITY_PICK_RADIUS_CSS_PX,
    distanceToCity: city => Math.hypot(city.x - screenX, city.y - screenY)
  });
}

function createMap(citySpecs) {
  const cities = [null];
  for (const spec of citySpecs) {
    cities[spec.id] = {
      ...spec,
      name: `城市${spec.id}`,
      population: 1,
      state: 1,
      province: 1
    };
  }
  return {
    metadata: {graphWidth: 1000, graphHeight: 500},
    settlements: {cities, routes: []},
    markers: {markers: []},
    military: {regiments: []},
    rivers: {rivers: []},
    politics: {states: [null, {name: "甲国"}], provinces: [null, {name: "甲省"}]}
  };
}
