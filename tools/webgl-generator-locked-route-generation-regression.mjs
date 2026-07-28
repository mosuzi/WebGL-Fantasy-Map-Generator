#!/usr/bin/env node
import assert from "node:assert/strict";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {finalizeSettlements} from "../app/webgl-generator/src/generator/settlements.js";

const map = generatePlaceholderMap({seed: "locked-route-generation", cellsTarget: 3000, heightmapTemplate: "continents"});
const source = map.settlements.routes.find(route => route?.packCells?.length >= 3);
assert(source, "固定地图应存在可锁定的道路");

const sparseId = Math.max(...map.settlements.routes.map(route => Number(route.id) || 0)) + 17;
const locked = {...clone(source), id: sparseId};
const lockedSnapshot = clone(locked);
const lockedEdges = routeEdges(locked);

finalizeSettlements(map.grid, map.features, map.politics, map.settlements, map.pack, {
  ...map.options,
  routeRegenerationSalt: 41,
  lockedRoutes: [locked]
});

const preserved = map.settlements.routes.find(route => route.id === sparseId);
assert.deepEqual(preserved, lockedSnapshot, "锁路对象与完整路径必须保持不变");
assert.deepEqual(
  map.pack.routes[sparseId].points,
  lockedSnapshot.points.map((point, index) => [point[0], point[1], lockedSnapshot.packCells[index]]),
  "pack.routes 必须按锁定稀疏 ID 建立镜像"
);

const generated = map.settlements.routes.filter(route => route.id !== sparseId);
assert(generated.length > 0, "预占一条锁路后仍应生成其它道路");
assert.equal(new Set(map.settlements.routes.map(route => route.id)).size, map.settlements.routes.length, "道路 ID 必须唯一");
assert(!generated.some(route => route.id === sparseId), "新道路不得占用锁定稀疏 ID");
for (const route of generated) {
  assert.equal([...routeEdges(route)].some(edge => lockedEdges.has(edge)), false, `新道路 #${route.id} 不得复用锁路边`);
}
for (let index = 0; index < lockedSnapshot.packCells.length - 1; index++) {
  const from = lockedSnapshot.packCells[index];
  const to = lockedSnapshot.packCells[index + 1];
  assert.equal(map.pack.cells.routes[from][to], sparseId, "锁路边必须保留自身 ID");
  assert.equal(map.pack.cells.routes[to][from], sparseId, "锁路边反向镜像必须保留自身 ID");
}

const aliasMap = generatePlaceholderMap({seed: "preserved-route-alias", cellsTarget: 3000, heightmapTemplate: "continents"});
const aliasSource = aliasMap.settlements.routes.find(route => route?.packCells?.length >= 3);
assert(aliasSource, "别名用例应存在道路");
const aliasLocked = clone(aliasSource);
finalizeSettlements(aliasMap.grid, aliasMap.features, aliasMap.politics, aliasMap.settlements, aliasMap.pack, {
  ...aliasMap.options,
  routeRegenerationSalt: 42,
  preservedRoutes: [aliasLocked]
});
assert.deepEqual(aliasMap.settlements.routes.find(route => route.id === aliasLocked.id), aliasLocked, "preservedRoutes 别名必须保留锁路");

const conflictMap = generatePlaceholderMap({seed: "locked-route-conflict", cellsTarget: 3000, heightmapTemplate: "continents"});
const conflictSource = conflictMap.settlements.routes.find(route => route?.packCells?.length >= 3);
assert(conflictSource, "冲突用例应存在道路");
const disconnected = clone(conflictSource);
const start = disconnected.packCells[0];
const invalidNext = conflictMap.pack.cells.i.find(cell => cell !== start && !(conflictMap.pack.cells.c[start] || []).includes(cell));
assert(Number.isInteger(invalidNext), "冲突用例应能找到非相邻 cell");
disconnected.packCells = [start, invalidNext];
disconnected.cells = disconnected.packCells.map(cell => conflictMap.pack.cells.g[cell]);
disconnected.points = disconnected.packCells.map(cell => [...conflictMap.pack.cells.p[cell]]);
assert.throws(
  () => finalizeSettlements(conflictMap.grid, conflictMap.features, conflictMap.politics, conflictMap.settlements, conflictMap.pack, {
    ...conflictMap.options,
    routeRegenerationSalt: 43,
    lockedRoutes: [disconnected]
  }),
  error => error?.code === "regeneration_lock_conflict" && error?.details?.reason === "disconnected-path",
  "无效锁路必须稳定返回 regeneration_lock_conflict"
);

const duplicateMap = generatePlaceholderMap({seed: "locked-route-duplicate", cellsTarget: 3000, heightmapTemplate: "continents"});
const duplicateSource = duplicateMap.settlements.routes.find(route => route?.packCells?.length >= 3);
assert(duplicateSource, "重复边用例应存在道路");
const duplicate = {...clone(duplicateSource), id: Number(duplicateSource.id) + 1000};
assert.throws(
  () => finalizeSettlements(duplicateMap.grid, duplicateMap.features, duplicateMap.politics, duplicateMap.settlements, duplicateMap.pack, {
    ...duplicateMap.options,
    routeRegenerationSalt: 44,
    lockedRoutes: [clone(duplicateSource), duplicate]
  }),
  error => error?.code === "regeneration_lock_conflict" && error?.details?.reason === "duplicate-edge",
  "锁路互相占用同一边必须稳定返回冲突"
);

console.log(JSON.stringify({
  ok: true,
  lockedRoute: {id: sparseId, cells: lockedSnapshot.packCells.length},
  generatedRoutes: generated.length,
  reservedEdges: lockedEdges.size,
  sparseMirror: Boolean(map.pack.routes[sparseId]),
  aliases: ["lockedRoutes", "preservedRoutes"],
  conflicts: ["disconnected-path", "duplicate-edge"]
}, null, 2));

function routeEdges(route) {
  const edges = new Set();
  for (let index = 0; index < route.packCells.length - 1; index++) {
    const left = route.packCells[index];
    const right = route.packCells[index + 1];
    edges.add(left < right ? `${left}:${right}` : `${right}:${left}`);
  }
  return edges;
}

function clone(value) {
  return structuredClone(value);
}
