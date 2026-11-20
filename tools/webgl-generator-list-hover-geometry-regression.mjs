import assert from "node:assert/strict";
import {listHoverGeometry, territoryRings} from "../app/webgl-generator/src/renderer/list-hover-geometry.js";

// A large mainland surrounding a lake, and a smaller, detached capital island.
const width = 6, height = 3;
const vertices = Array.from({length: (width + 1) * (height + 1)}, (_, i) => [i % (width + 1), Math.floor(i / (width + 1))]);
const cells = {v: [], c: [], h: [], state: []};
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = x + y * width, v = x + y * (width + 1);
    cells.v.push([v, v + 1, v + width + 2, v + width + 1]);
    const neighbors = [];
    if (x > 0) neighbors.push(i - 1);
    if (x + 1 < width) neighbors.push(i + 1);
    if (y > 0) neighbors.push(i - width);
    if (y + 1 < height) neighbors.push(i + width);
    cells.c.push(neighbors);
    cells.state.push(x < 3 || i === 5 ? 1 : 0);
    cells.h.push(i === 7 ? 0 : 40);
  }
}
const grid = {cells, vertices: {p: vertices}};
const map = {grid, politics: {states: [null, {capital: 1}]}, pack: {cells: {g: [5]}, burgs: [null, {i: 1, cell: 0}]}};
const rings = listHoverGeometry(map, {kind: "state", id: 1});
assert.deepEqual(rings.map(r => r.area), [1, 9, 1]);
assert.ok(rings[0].points.every(([x]) => x >= 5));
assert.deepEqual(rings.map(r => r.points.length), [4, 12, 4]);
map.politics.states[1].capital = 0;
assert.deepEqual(listHoverGeometry(map, {kind: "state", id: 1}).map(r => r.area), [9, 1, 1]);
assert.deepEqual(listHoverGeometry(map, {kind: "state", id: 2}), []);
assert.equal(territoryRings(grid, [0, 7], null).length, 2, "角点相接的领土必须分开");
console.log("本土优先、无首都回退、湖洞、飞地、共享边抵消、零领土通过");
