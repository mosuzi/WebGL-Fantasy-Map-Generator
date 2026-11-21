import assert from "node:assert/strict";
import {riverDeltaBranches} from "../app/webgl-generator/src/geometry/river-deltas.js";
import {buildRiverMeshVertices} from "../app/webgl-generator/src/renderer/placeholder-renderer.js";
import {buildObjectPickingIndex, pickRiver, refreshRiversInPickingIndex} from "../app/webgl-generator/src/renderer/picking.js";
import {buildObjectPickingDto, rebindObjectPickingDto, rebindObjectPickingDtoInChunks} from "../app/webgl-generator/src/renderer/picking-dto.js";
import {createMapFeatureGeoJson} from "../app/webgl-generator/src/runtime/map-file-io.js";

// Seven low coastal rows, an open shelf to the east and a river across the middle.
const cols = 12, rows = 7, points = [], rings = [], adjacent = [], h = [], f = [], vertices = [];
for (let y = 0; y <= rows; y++) for (let x = 0; x <= cols; x++) vertices.push([x, y]);
for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
  const id = y * cols + x, v = y * (cols + 1) + x;
  points.push([x + 0.5, y + 0.5]);
  rings.push([v, v + 1, v + cols + 2, v + cols + 1]);
  adjacent.push([x > 0 && id - 1, x < cols - 1 && id + 1, y > 0 && id - cols, y < rows - 1 && id + cols].filter(Number.isInteger));
  h.push(x >= 9 ? 18 : 21);
  f.push(x >= 9 ? 1 : 2);
}
const source = 3 * cols;
const ids = Array.from({length: 10}, (_, i) => source + i);
const river = {id: 1, name: "测试河", cells: ids, points: ids.map((id, i) => [...points[id], 600 + i]), discharge: 1000, outletKind: "ocean"};
const cells = {v: rings, c: adjacent, h, f, g: points.map((_, i) => i), p: points};
const features = [null, {type: "ocean"}, {type: "island"}];
const map = {grid: {points, cells, features, vertices: {p: vertices}, metadata: {spacing: 1}},
  pack: {cells, features}, metadata: {graphWidth: cols, graphHeight: rows}, rivers: {rivers: [river], metadata: {maxFlux: 1000}}};
const before = structuredClone(river);
const branches = riverDeltaBranches(map, river);
assert.equal(branches.length, 2, "平坦海岸最大流量的河可两侧分汊");
assert.deepEqual(branches, riverDeltaBranches(map, river));
assert.deepEqual(branches[0][0], branches[1][0]);
assert.ok(branches.every(path => path.at(-1)[0] > 9 && path.slice(0, -1).every(p => p[0] < 9)));
assert.ok((branches[0].at(-1)[1] - 3.5) * (branches[1].at(-1)[1] - 3.5) < 0);
for (const path of branches) {
  const a = path.at(-2), b = path.at(-1);
  const shoreY = a[1] + (b[1] - a[1]) * (9 - a[0]) / (b[0] - a[0]);
  assert.ok(Math.abs(shoreY - Math.floor(shoreY) - 0.5) >= 0.17, "侧汊与港口常用的岸线中点之间需有陆岸");
}
assert.equal(riverDeltaBranches(map, {...river, discharge: 300}).length, 1);
for (const overrides of [{discharge: 30}, {outletKind: "lake"}, {parent: 2}, {cells: ids.slice(-4)},
  {controlPoints: [[4, 3]]}, {visualCurve: {}}, {hydrology: {method: "manual-downhill"}}]) {
  assert.deepEqual(riverDeltaBranches(map, {...river, ...overrides}), []);
}
for (const [cell, value] of [[ids.at(-1), 7], [ids.at(-2), 38], [ids.at(-3), 26]]) {
  const old = h[cell]; h[cell] = value;
  assert.deepEqual(riverDeltaBranches(map, river), []);
  h[cell] = old;
}
// A levee along the whole low reach blocks one half of the fan.
for (let x = 0; x < 9; x++) h[2 * cols + x] = 36;
assert.equal(riverDeltaBranches(map, river).length, 1);
for (let x = 0; x < 9; x++) h[2 * cols + x] = 21;
for (let y = 0; y < 3; y++) f[y * cols + 9] = 3;
assert.equal(riverDeltaBranches(map, river).length, 1, "分汊不可借道另一片水域");
for (let y = 0; y < 3; y++) f[y * cols + 9] = 1;
const adjacentRiver = {id: 2, points: [[3, 3.1], [9.1, 3.1]]};
cells.pack = cells.g;
cells.r = new Uint16Array(points.length);
cells.r[source + 8] = 2;
map.rivers.rivers.push(adjacentRiver);
assert.equal(riverDeltaBranches(map, river).length, 1, "侧汊不得横穿已有河道");
map.rivers.rivers.pop();
cells.r.fill(0);
const canvas = {width: 1200, height: 700, clientWidth: 1200, clientHeight: 700};
const mesh = buildRiverMeshVertices(map, {scale: 1, offsetX: 0, offsetY: 0}, canvas);
assert.equal(mesh.stats.distributaries, 2);
assert.equal(mesh.stats.rivers, 1);
const index = buildObjectPickingIndex(map);
const dto = buildObjectPickingDto(map, {mapIdentity: "delta", mapRevision: 0, topologyRevision: 0, renderGeneration: 1, renderPreparationId: "delta"});
const refreshed = buildObjectPickingIndex(map);
refreshRiversInPickingIndex(refreshed, [river], map);
for (const picking of [null, index, refreshed, rebindObjectPickingDto(dto, map), await rebindObjectPickingDtoInChunks(dto, map)]) {
  for (const path of branches) assert.equal(pickRiver(map, picking, ...path[5], 0.005)?.id, river.id);
  assert.equal(pickRiver(map, picking, 8.5, 3.0, 0.001), null);
}
const layers = {state: false, province: false, city: false, route: false, river: true, marker: false, zone: false};
const geo = createMapFeatureGeoJson(map, {layers});
assert.equal(geo.features.length, 1);
assert.equal(geo.features[0].geometry.type, "MultiLineString");
assert.equal(geo.features[0].geometry.coordinates.length, 3);
assert.equal(geo.features[0].properties.segmentCount, ids.length - 1 + 16);
assert.deepEqual(river, before);
console.log("河口分汊、水陆边界、地形反例、手调保护、五种拾取路径与单河地理导出通过");
