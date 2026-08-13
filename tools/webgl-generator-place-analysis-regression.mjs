#!/usr/bin/env node
import assert from "node:assert/strict";

import {
  getPlaceDirection,
  measurePlaceDistance,
  resolvePlace,
  resolvePlaceAnchor
} from "../app/webgl-generator/src/runtime/place-analysis-api.js";
import {convertMapDistance} from "../app/webgl-generator/src/ui/display-units.js";

const map = createFixture();
const before = JSON.stringify(map);
const revision = {mapIdentity: "place-fixture", mapRevision: 7};

const ambiguous = resolvePlace(map, "  同名  ", {revision});
assert.deepEqual(ambiguous.selected, {kind: "state", id: 2, name: "同名", fullName: "同名王国", matchedBy: "name"});
assert.deepEqual(ambiguous.candidates.map(({kind, id}) => `${kind}#${id}`), ["state#2", "province#1", "city#3", "city#7"]);
assert.equal(ambiguous.candidateCount, 4);
assert.equal(ambiguous.priorityRule, "state>province>city;id:asc");
assert.deepEqual(ambiguous.revision, revision);

const fullName = resolvePlace(map, "同名王国", {revision});
assert.equal(fullName.selected.id, 2);
assert.equal(fullName.matchedBy, "fullName");
assert.deepEqual(resolvePlace(map, {kind: "city", id: 7}, {revision}).selected, {kind: "city", id: 7, name: "同名", matchedBy: "id"});

assertPlaceError(() => resolvePlace(map, "不存在"), "place_not_found");
assertPlaceError(() => resolvePlace(map, "旧城"), "place_removed");
assertPlaceError(() => resolvePlace(map, {kind: "route", id: 1}), "invalid_place_kind");
assertPlaceError(() => resolvePlace(map, {kind: "city", id: 0}), "invalid_place_id");
assertPlaceError(() => resolvePlace(map, {kind: "city", id: 999}), "place_not_found");
assertPlaceError(() => resolvePlace(map, {kind: "city", id: 99}), "place_removed");

assert.deepEqual(resolvePlaceAnchor(map, {kind: "city", id: 3}), {
  kind: "city", x: 0, y: 0, anchorSource: "city-coordinate", reason: null
});
assert.equal(resolvePlaceAnchor(map, {kind: "state", id: 2}).anchorSource, "state-capital");
assert.deepEqual(resolvePlaceAnchor(map, {kind: "state", id: 3}), {
  kind: "state", x: 30, y: 40, anchorSource: "state-center-cell", reason: "state-center-fallback"
});
assert.equal(resolvePlaceAnchor(map, {kind: "province", id: 1}).anchorSource, "province-capital");
assert.deepEqual(resolvePlaceAnchor(map, {kind: "province", id: 2}), {
  kind: "province", x: 12, y: 14, anchorSource: "province-pole", reason: "province-pole-fallback"
});
assert.deepEqual(resolvePlaceAnchor(map, {kind: "province", id: 3}), {
  kind: "province", x: 50, y: 60, anchorSource: "province-center-cell", reason: "province-center-fallback"
});
assert.equal(resolvePlaceAnchor(map, {kind: "province", id: 5}).anchorSource, "province-pole", "多个省会不得按首项选择");
assertPlaceError(() => resolvePlaceAnchor(map, {kind: "province", id: 4}), "place_anchor_invalid", ["province-capital", "province-pole", "province-center-cell"]);

const units = {distanceUnit: "mi-cn", mapScaleKmPerCm: 100, numberAbbreviation: "none"};
const converted = convertMapDistance(5, units);
const distance = measurePlaceDistance(map, {kind: "city", id: 3}, {kind: "city", id: 7}, {revision, units, unitSource: "explicit"});
assert.equal(distance.distanceWorld, 5);
assert.equal(distance.distanceValue, converted.value);
assert.equal(distance.kilometers, converted.kilometers);
assert.deepEqual(distance.unit, converted.unit);
assert.equal(distance.precision, "coordinate");
assert.equal(distance.approximate, false);
assert.deepEqual(distance.reason, []);
assert.equal(distance.from.mapRevision, 7);

const representative = measurePlaceDistance(map, {kind: "state", id: 3}, {kind: "province", id: 3}, {
  revision,
  units,
  unitSource: "defaulted",
  legacyCoordinatePrecision: true
});
assert.equal(representative.precision, "representative-anchor");
assert.equal(representative.approximate, true);
assert.deepEqual(representative.reason, [
  "state-center-fallback",
  "province-center-fallback",
  "administrative-representative-anchor",
  "missing-session-unit-preferences",
  "legacy-coordinate-precision"
]);

const directions = [
  [0, "北"], [22.5, "东北"], [67.5, "东"], [112.5, "东南"],
  [157.5, "南"], [202.5, "西南"], [247.5, "西"], [292.5, "西北"], [337.5, "北"]
];
for (const [bearing, label] of directions) {
  const id = 100 + directions.findIndex(item => item[0] === bearing);
  const result = getPlaceDirection(map, {kind: "city", id: 50}, {kind: "city", id}, {units, unitSource: "explicit"});
  assert.ok(Math.abs(result.bearingDegrees - bearing) < 1e-9, `${bearing}° 计算漂移`);
  assert.equal(result.direction, label, `${bearing}° 方位归类错误`);
  assert.ok(Math.abs(result.distance.distanceWorld - 10) < 1e-9);
}
const overlap = getPlaceDirection(map, {kind: "city", id: 50}, {kind: "city", id: 50}, {units});
assert.equal(overlap.direction, "重合");
assert.equal(overlap.bearingDegrees, null);

assert.equal(JSON.stringify(map), before, "地点分析不得修改地图");

console.log(JSON.stringify({
  ok: true,
  candidates: ambiguous.candidates.map(({kind, id}) => `${kind}#${id}`),
  anchors: ["city-coordinate", "state-capital", "state-center-cell", "province-capital", "province-pole", "province-center-cell"],
  directions: directions.map(([bearing, label]) => `${bearing}:${label}`),
  distanceWorld: distance.distanceWorld,
  unit: distance.unit
}, null, 2));

function createFixture() {
  const cities = [
    city(7, "同名", 3, 4),
    city(3, "同名", 0, 0),
    {...city(99, "旧城", 1, 1), removed: true},
    {...city(31, "省会", 8, 9), province: 1, burgId: 31, provincial: true},
    {...city(51, "双省会甲", 1, 2), province: 5, burgId: 51, provincial: true},
    {...city(52, "双省会乙", 2, 3), province: 5, burgId: 52, provincial: true},
    city(50, "方位中心", 100, 100)
  ];
  const directionBearings = [0, 22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5];
  directionBearings.forEach((bearing, index) => {
    const radians = bearing * Math.PI / 180;
    cities.push(city(100 + index, `方位${bearing}`, 100 + Math.sin(radians) * 10, 100 - Math.cos(radians) * 10));
  });
  const burgs = [];
  burgs[20] = {i: 20, name: "首都", x: 20, y: 25};
  burgs[31] = {i: 31, name: "省会", x: 8, y: 9, province: 1, provincial: true};
  burgs[51] = {i: 51, name: "双省会甲", x: 1, y: 2, province: 5, provincial: true};
  burgs[52] = {i: 52, name: "双省会乙", x: 2, y: 3, province: 5, provincial: true};
  return {
    metadata: {checksum: "place-analysis-fixture"},
    politics: {
      states: [
        {id: 0, name: "中立"},
        null,
        {id: 2, name: "同名", fullName: "同名王国", capital: 20, center: 1},
        {id: 3, name: "边地", fullName: "边地公国", capital: 999, center: 2}
      ],
      provinces: [
        {id: 0, name: "中立"},
        {id: 1, name: "同名", state: 2, center: 1, burg: 31, pole: [7, 7]},
        {id: 2, name: "有极点", state: 2, center: 1, burg: 0, pole: [12, 14]},
        {id: 3, name: "仅中心", state: 3, center: 3, burg: 0, pole: null},
        {id: 4, name: "无锚点", state: 3, center: 99, burg: 0, pole: null},
        {id: 5, name: "多省会", state: 2, center: 1, burg: 51, pole: [6, 6]}
      ]
    },
    settlements: {cities},
    pack: {
      burgs,
      cells: {p: [[0, 0], [10, 20], [30, 40], [50, 60]]}
    }
  };
}

function city(id, name, x, y) {
  return {id, name, x, y, province: 0, state: 0, burgId: id, provincial: false, removed: false};
}

function assertPlaceError(task, code, attemptedSources = null) {
  assert.throws(task, error => {
    assert.equal(error?.code, code);
    if (attemptedSources) assert.deepEqual(error.details?.attemptedSources, attemptedSources);
    return true;
  });
}
