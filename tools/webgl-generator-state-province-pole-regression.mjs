#!/usr/bin/env node
import assert from "node:assert/strict";
import {findProvincePoleCell} from "../app/webgl-generator/src/runtime/state-edit-commands.js";

function brutePole(cells, ownCells, boundaryCells, fallbackCell) {
  if (ownCells.length <= 2) return fallbackCell && ownCells.includes(fallbackCell) ? fallbackCell : ownCells[0];
  let bestCell = ownCells[0];
  let bestScore = -Infinity;
  for (const cell of ownCells) {
    const point = cells.p[cell];
    if (!point) continue;
    let minDistance = Infinity;
    for (const boundaryCell of boundaryCells) {
      const next = cells.p[boundaryCell];
      if (!next) continue;
      const distance = (point[0] - next[0]) ** 2 + (point[1] - next[1]) ** 2;
      if (distance < minDistance) minDistance = distance;
    }
    const score = (Number.isFinite(minDistance) ? minDistance : 0)
      + (cells.pop?.[cell] || cells.s?.[cell] || 0) * 0.02
      + (cells.burg?.[cell] ? 5 : 0);
    if (score > bestScore) { bestScore = score; bestCell = cell; }
  }
  return bestCell;
}

for (const size of [3, 9, 32, 72]) {
  const p = [];
  const pop = [];
  const burg = [];
  const ownCells = [];
  const boundaryCells = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = y * size + x;
      p.push([x * 3 + (cell % 7) * 0.11, y * 2 + (cell % 11) * 0.07]);
      pop.push((cell * 13) % 97);
      burg.push(cell % 127 === 0 ? 1 : 0);
      ownCells.push(cell);
      if (x === 0 || y === 0 || x === size - 1 || y === size - 1 || cell % 43 === 0) boundaryCells.push(cell);
    }
  }
  const cells = {p, pop, burg};
  assert.equal(findProvincePoleCell(cells, ownCells, boundaryCells, 0), brutePole(cells, ownCells, boundaryCells, 0), `size ${size}`);
  assert.equal(findProvincePoleCell(cells, ownCells.slice(0, 2), boundaryCells, ownCells[1]), ownCells[1]);
  p[boundaryCells[0]] = null;
  assert.equal(findProvincePoleCell(cells, ownCells, boundaryCells, 0), brutePole(cells, ownCells, boundaryCells, 0), `missing point ${size}`);
}

console.log("state province pole nearest-boundary regression passed");
