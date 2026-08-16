import assert from "node:assert/strict";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {regenerateMapAttributeForWorker} from "../app/webgl-generator/src/runtime/regeneration-worker-task.js";

const map = generatePlaceholderMap({seed: "task-345-true-regeneration", cellsTarget: 5000, heightmapTemplate: "continents"});
const originalObjects = new Set(activeCities(map));
const original = cityFingerprint(map);
const marineFixture = forceOrdinaryCityIntoWater(map);

const first = regenerateMapAttributeForWorker(map, "cities", {scope: "all"});
assert.equal(first.executed, true, "第一次全图城镇重算未执行");
assertLandCities(map, "第一次全图重算");
assert.equal(activeCities(map).some(city => originalObjects.has(city)), false, "未锁旧城镇对象被直接复用");
const afterFirst = cityFingerprint(map);
assert.notEqual(afterFirst, original, "第一次全图重算没有改变城镇空间/属性指纹");

const firstObjects = new Set(activeCities(map));
const second = regenerateMapAttributeForWorker(map, "cities", {scope: "all"});
assert.equal(second.executed, true, "第二次全图城镇重算未执行");
assertLandCities(map, "第二次全图重算");
assert.equal(activeCities(map).some(city => firstObjects.has(city)), false, "第二次重算复用了第一次的城镇对象");
const afterSecond = cityFingerprint(map);
assert.notEqual(afterSecond, afterFirst, "连续两次城镇重算得到相同空间/属性指纹");

const lockedMap = generatePlaceholderMap({seed: "task-345-locked-city", cellsTarget: 3000, heightmapTemplate: "continents"});
const lockedCity = activeCities(lockedMap).find(city => !city.capital && !city.provincial);
assert.ok(lockedCity, "锁定夹具缺少普通城镇");
lockedMap.regenerationLocks = {version: 1, entries: [{kind: "city", id: lockedCity.id}]};
const lockedBefore = cityEnvelope(lockedMap, lockedCity.id);
regenerateMapAttributeForWorker(lockedMap, "cities", {scope: "all"});
assert.deepEqual(cityEnvelope(lockedMap, lockedCity.id), lockedBefore, "显式锁城镇没有完整保留");
assertLandCities(lockedMap, "锁定全图重算");

const scopedMap = generatePlaceholderMap({seed: "task-345-scoped-city", cellsTarget: 4000, heightmapTemplate: "continents"});
const targetState = (scopedMap.politics?.states || []).find(state => state?.i && activeCities(scopedMap).filter(city => Number(city.state) === Number(state.i)).length >= 3);
assert.ok(targetState, "局部夹具缺少可重算国家");
const outsideBefore = scopedOutsideFingerprint(scopedMap, targetState.i);
const insideBefore = scopedInsideFingerprint(scopedMap, targetState.i);
regenerateMapAttributeForWorker(scopedMap, "cities", {scope: "state", stateId: targetState.i});
assert.equal(scopedOutsideFingerprint(scopedMap, targetState.i), outsideBefore, "局部重算改写了范围外城镇");
assert.notEqual(scopedInsideFingerprint(scopedMap, targetState.i), insideBefore, "局部重算没有改变范围内城镇");
assertLandCities(scopedMap, "局部重算");

console.log(JSON.stringify({
  ok: true,
  marineFixture,
  first: summarize(map, afterFirst),
  second: summarize(map, afterSecond),
  lockedCityId: lockedCity.id,
  scopedStateId: targetState.i
}));

function activeCities(target) {
  return (target.settlements?.cities || []).filter(city => city && !city.removed);
}

function cityFingerprint(target) {
  return JSON.stringify(activeCities(target)
    .map(city => [city.id, city.burgId, city.packCell, city.name, Number(city.capital), Number(city.provincial), city.port, city.population])
    .sort((left, right) => left[0] - right[0]));
}

function scopedOutsideFingerprint(target, stateId) {
  return JSON.stringify(activeCities(target)
    .filter(city => Number(city.state) !== Number(stateId))
    .map(city => cityEnvelope(target, city.id)));
}

function scopedInsideFingerprint(target, stateId) {
  return JSON.stringify(activeCities(target)
    .filter(city => Number(city.state) === Number(stateId))
    .map(city => cityEnvelope(target, city.id)));
}

function cityEnvelope(target, cityId) {
  const city = activeCities(target).find(item => Number(item.id) === Number(cityId));
  const burg = city ? target.pack?.burgs?.[city.burgId] : null;
  const state = city ? target.politics?.states?.[city.state] : null;
  const province = city ? target.politics?.provinces?.[city.province] : null;
  return {
    city: structuredClone(city),
    burg: structuredClone(burg),
    packCellBurg: city ? target.pack?.cells?.burg?.[city.packCell] : null,
    gridCellBurg: city ? target.grid?.cells?.burg?.[city.cell] : null,
    stateAnchor: city && Number(state?.capital) === Number(city.burgId) ? pick(state, ["capital", "center", "gridCenter", "capitalName"]) : null,
    provinceAnchor: city && Number(province?.burg) === Number(city.burgId) ? pick(province, ["burg", "center", "gridCenter"]) : null
  };
}

function pick(source, fields) {
  return Object.fromEntries(fields.map(field => [field, structuredClone(source?.[field])]));
}

function assertLandCities(target, label) {
  const marine = activeCities(target)
    .filter(city => Number(target.pack?.cells?.h?.[city.packCell]) < 20)
    .map(city => ({id: city.id, packCell: city.packCell, height: target.pack?.cells?.h?.[city.packCell]}));
  assert.deepEqual(marine, [], `${label}仍有海中城镇`);
}

function forceOrdinaryCityIntoWater(target) {
  const city = activeCities(target).find(item => !item.capital && !item.provincial);
  const waterCell = (target.pack?.cells?.i || []).find(cell => Number(target.pack.cells.h[cell]) < 20 && !target.pack.cells.burg?.[cell]);
  assert.ok(city && Number.isInteger(waterCell), "海中城镇反例夹具不完整");
  const burg = target.pack.burgs[city.burgId];
  if (target.pack.cells.burg?.[city.packCell] === city.burgId) target.pack.cells.burg[city.packCell] = 0;
  const gridCell = Number(target.pack.cells.g[waterCell]);
  const [x, y] = target.pack.cells.p[waterCell];
  Object.assign(city, {packCell: waterCell, cell: gridCell, x, y});
  Object.assign(burg, {cell: waterCell, x, y});
  target.pack.cells.burg[waterCell] = city.burgId;
  return {cityId: city.id, waterCell, height: target.pack.cells.h[waterCell]};
}

function summarize(target, fingerprint) {
  return {
    cities: activeCities(target).length,
    marine: activeCities(target).filter(city => Number(target.pack?.cells?.h?.[city.packCell]) < 20).length,
    fingerprintLength: fingerprint.length
  };
}
