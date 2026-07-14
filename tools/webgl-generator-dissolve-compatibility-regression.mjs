#!/usr/bin/env node
import assert from "node:assert/strict";

import {createMapFeatureGeoJson, dissolvePackCellPolygons} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {validatePoliticalDissolveGeoJson} from "./lib/geojson-compatibility.mjs";

const ringMap = createGridMap(3, 3);
const ringCells = [0, 1, 2, 3, 5, 6, 7, 8];
const ringPolygons = dissolvePackCellPolygons(ringMap, ringCells);
assert.equal(ringPolygons.length, 1, "3×3 缺中心对象应输出一个 polygon");
assert.equal(ringPolygons[0].length, 2, "3×3 缺中心对象应输出 outer 与 hole");
assert.ok(signedArea(ringPolygons[0][0]) > 0, "outer ring 应逆时针");
assert.ok(signedArea(ringPolygons[0][1]) < 0, "hole 应顺时针");

const adjacentPolygons = dissolvePackCellPolygons(ringMap, [0, 1]);
assert.equal(adjacentPolygons.length, 1);
assert.equal(adjacentPolygons[0].length, 1);
assert.equal(adjacentPolygons[0][0].length, 7, "相邻方格共享边应被消除");

const islandsMap = createGridMap(1, 4);
const islandPolygons = dissolvePackCellPolygons(islandsMap, [0, 3]);
assert.equal(islandPolygons.length, 2, "不相连对象应输出两个 polygon");
applyPoliticalOwnership(islandsMap, [0, 3]);
const islandCollection = createMapFeatureGeoJson(islandsMap, {
  layers: {state: true, province: false, city: false, route: false, river: false, marker: false, zone: false},
  dissolvePolitical: true
});
assert.deepEqual(validatePoliticalDissolveGeoJson(JSON.parse(JSON.stringify(islandCollection))), {
  features: 1,
  polygons: 2,
  rings: 2,
  holes: 0,
  points: 10
}, "合法多岛必须通过完整 FeatureCollection 兼容门禁");

applyPoliticalOwnership(ringMap, ringCells);
const exported = createMapFeatureGeoJson(ringMap, {
  layers: {state: true, province: true, city: false, route: false, river: false, marker: false, zone: true},
  dissolvePolitical: true
});
const roundtripped = JSON.parse(JSON.stringify(exported));
const summary = validatePoliticalDissolveGeoJson(roundtripped);
assert.deepEqual(roundtripped.features.map(feature => feature.properties.layer), ["state", "province", "zone"]);
assert.deepEqual(summary, {features: 3, polygons: 3, rings: 6, holes: 3, points: 54});

const unclosed = structuredClone(roundtripped);
unclosed.features[0].geometry.coordinates[0][0].at(-1)[0] += 1;
assert.throws(() => validatePoliticalDissolveGeoJson(unclosed), /必须闭合/);

const wrongDirection = structuredClone(roundtripped);
wrongDirection.features[0].geometry.coordinates[0][0].reverse();
assert.throws(() => validatePoliticalDissolveGeoJson(wrongDirection), /outer 逆时针/);

const invalidBbox = structuredClone(roundtripped);
invalidBbox.features[0].bbox = [0, 0, 0, 0];
assert.throws(() => validatePoliticalDissolveGeoJson(invalidBbox), /bbox 必须精确包围/);

const nonFinite = structuredClone(roundtripped);
nonFinite.features[0].geometry.coordinates[0][0][1][0] = Infinity;
assert.throws(() => validatePoliticalDissolveGeoJson(nonFinite), /必须使用有限数值/);

const selfIntersecting = structuredClone(roundtripped);
selfIntersecting.features[0].geometry.coordinates = [[[[0, 0], [4, 0], [1, 3], [4, 4], [0, 4], [3, 1], [0, 0]]]];
selfIntersecting.features[0].bbox = [0, 0, 4, 4];
assert.throws(() => validatePoliticalDissolveGeoJson(selfIntersecting), /不得自交/);

const overlappingPolygons = structuredClone(roundtripped);
overlappingPolygons.features[0].geometry.coordinates.push(structuredClone(overlappingPolygons.features[0].geometry.coordinates[0]));
assert.throws(() => validatePoliticalDissolveGeoJson(overlappingPolygons), /不得与同一 MultiPolygon 的其它 polygon 重叠/);

const collinearOverlap = structuredClone(roundtripped);
collinearOverlap.features[0].geometry.coordinates = [
  [[[0, 0], [2, 0], [2, 1], [0, 1], [0, 0]]],
  [[[1, 0], [3, 0], [3, 1], [1, 1], [1, 0]]]
];
collinearOverlap.features[0].bbox = [0, 0, 3, 1];
assert.throws(() => validatePoliticalDissolveGeoJson(collinearOverlap), /不得与同一 MultiPolygon 的其它 polygon 重叠/);

console.log(JSON.stringify({
  ok: true,
  coordinateReference: roundtripped.properties.coordinateReference,
  adjacentRingPoints: adjacentPolygons[0][0].length,
  islandPolygons: islandPolygons.length,
  ...summary,
  rejectedInvalidCases: 7
}, null, 2));

function createGridMap(rows, columns) {
  const points = [];
  for (let row = 0; row <= rows; row += 1) {
    for (let column = 0; column <= columns; column += 1) points.push([column, row]);
  }
  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const topLeft = row * (columns + 1) + column;
      cells.push([topLeft, topLeft + 1, topLeft + columns + 2, topLeft + columns + 1]);
    }
  }
  const count = cells.length;
  return {
    metadata: {seed: "dissolve-compatibility", checksum: "fixed", generatedAt: "2026-07-15T00:00:00.000Z", graphWidth: columns, graphHeight: rows},
    options: {graphWidth: columns, graphHeight: rows},
    mapCoordinates: {lonW: -120, lonE: 120, latN: 60, latS: -60},
    pack: {
      cells: {
        i: Array.from({length: count}, (_, index) => index),
        v: cells,
        h: new Uint8Array(count).fill(30),
        state: new Uint16Array(count),
        province: new Uint16Array(count),
        area: new Float32Array(count).fill(1),
        pop: new Float32Array(count).fill(10)
      },
      vertices: {p: points},
      burgs: []
    },
    politics: {states: [{i: 0}, {i: 1, name: "测试国"}], provinces: [{i: 0}, {i: 1, state: 1, name: "测试省"}]},
    society: {cultures: [], religions: []},
    settlements: {cities: [], routes: []},
    rivers: {rivers: []},
    markers: {markers: []},
    zones: {zones: []},
    notes: {notes: []}
  };
}

function applyPoliticalOwnership(map, cellIds) {
  for (const cellId of cellIds) {
    map.pack.cells.state[cellId] = 1;
    map.pack.cells.province[cellId] = 1;
  }
  map.zones.zones = [{i: 1, name: "测试区域", cells: [...cellIds]}];
}

function signedArea(ring) {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    area += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  return area / 2;
}
