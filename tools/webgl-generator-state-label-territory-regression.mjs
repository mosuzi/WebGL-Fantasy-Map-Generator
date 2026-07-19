#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {resolvePoliticalLabelPlacement} from "../app/webgl-generator/src/renderer/political-label-layout.js";
import {collectStateLandComponents, resolveStateLabelPlacement} from "../app/webgl-generator/src/renderer/state-label-territory.js";
import {patchLabelLayout, resolveLabelLayout} from "../app/webgl-generator/src/runtime/label-layout-registry.js";

const map = createArchipelagoFixture();
const state = map.politics.states[1];
const capitalPlacement = resolveStateLabelPlacement(map, state, "群岛联合王国");
assert.equal(capitalPlacement.source, "capital-component");
assert.equal(capitalPlacement.cell, 1, "国家名锚点没有吸附到首都本土实际 land cell");
assert.deepEqual(capitalPlacement.componentCells, [0, 1, 2]);
assert.ok(capitalPlacement.componentCellSet.has(map.pack.burgs[state.capital].cell));
assert.equal(capitalPlacement.rotation, 26.6, "国家名主轴混入了海外领土");

const repeated = resolveStateLabelPlacement(map, state, "群岛联合王国");
assert.deepEqual(placementDigest(repeated), placementDigest(capitalPlacement), "相同地图的国家名本土布局不稳定");

state.capital = 999;
const largestPlacement = resolveStateLabelPlacement(map, state, "群岛联合王国");
assert.equal(largestPlacement.source, "largest-component");
assert.equal(largestPlacement.cell, 4, "无效首都没有回退最大国家陆地块的内点");
assert.deepEqual(largestPlacement.componentCells, [3, 4, 5, 6]);
assert.notDeepEqual([largestPlacement.x, largestPlacement.y], allStateLandCentroid(map), "最大陆块回退仍使用跨海全境质心");

state.capital = 8;
const changedCapitalPlacement = resolveStateLabelPlacement(map, state, "群岛联合王国");
assert.equal(changedCapitalPlacement.source, "capital-component");
assert.deepEqual(changedCapitalPlacement.componentCells, [3, 4, 5, 6], "首都变更没有切换国家名本土");

const singleLandMap = createArchipelagoFixture();
singleLandMap.pack.cells.state.fill(0);
for (const cell of [0, 1, 2]) singleLandMap.pack.cells.state[cell] = 1;
const singlePlacement = resolveStateLabelPlacement(singleLandMap, singleLandMap.politics.states[1], "单大陆共和国");
assert.equal(singlePlacement.source, "capital-component");
assert.deepEqual(singlePlacement.componentCells, [0, 1, 2]);

const fallbackMap = createArchipelagoFixture();
fallbackMap.pack.cells.h.fill(10);
fallbackMap.politics.states[1].center = 2;
const centerFallback = resolveStateLabelPlacement(fallbackMap, fallbackMap.politics.states[1], "无陆地国");
assert.equal(centerFallback.source, "center");
assert.deepEqual([centerFallback.x, centerFallback.y], fallbackMap.pack.cells.p[2]);
fallbackMap.politics.states[1].center = -1;
fallbackMap.politics.states[1].gridCenter = 0;
const gridFallback = resolveStateLabelPlacement(fallbackMap, fallbackMap.politics.states[1], "无陆地国");
assert.equal(gridFallback.source, "grid-center");
assert.deepEqual([gridFallback.x, gridFallback.y], [7, 9]);

const politicalItem = {targetKind: "state", text: "群岛联合王国", rotation: 0, resolvedStyle: {fontSize: 30, letterSpacing: 4}};
const constrained = resolvePoliticalLabelPlacement({
  item: politicalItem,
  screen: {x: 100, y: 100},
  obstacles: [{left: 50, right: 150, top: 70, bottom: 130}],
  viewport: {width: 800, height: 600},
  anchorAllowed: anchor => anchor.x === 100 && anchor.y === 100
});
assert.deepEqual(constrained.anchor, {x: 100, y: 100}, "城市避让把国家名锚点移出了本土");
assert.equal(constrained.candidateIndex, 0);

patchLabelLayout(map, "state", 1, {position: {x: 42, y: 24}});
const manualLayout = resolveLabelLayout(map, "state", 1, null, {x: capitalPlacement.x, y: capitalPlacement.y});
assert.equal(manualLayout.locked, true);
assert.deepEqual(manualLayout.position, {x: 42, y: 24}, "手工锁定位置被自动本土布局覆盖");
const manualPolitical = resolvePoliticalLabelPlacement({
  item: politicalItem,
  screen: {x: 420, y: 240},
  viewport: {width: 800, height: 600},
  locked: true,
  anchorAllowed: () => false
});
assert.deepEqual(manualPolitical.anchor, {x: 420, y: 240}, "手工锁定仍被本土候选过滤");

const realMaps = [];
for (const seed of ["audit-archipelago-001", "audit-archipelago-002", "audit-archipelago-003"]) {
  const generated = generatePlaceholderMap({seed, cellsTarget: 5000, heightmapTemplate: "archipelago"});
  let states = 0;
  let crossSeaStates = 0;
  for (const generatedState of generated.politics.states.filter(item => item?.i && !item.removed)) {
    states++;
    const components = collectStateLandComponents(generated.pack.cells, generatedState.i);
    if (components.length > 1) crossSeaStates++;
    const placement = resolveStateLabelPlacement(generated, generatedState, generatedState.fullName || generatedState.name);
    assert.ok(placement, `${seed} 国家 #${generatedState.i} 缺少标签位置`);
    if (placement.componentCellSet.size) assert.ok(placement.componentCellSet.has(placement.cell), `${seed} 国家 #${generatedState.i} 标签锚点不在所选陆块`);
  }
  assert.ok(crossSeaStates > 0, `${seed} 没有形成跨海国家回归样本`);
  realMaps.push({seed, states, crossSeaStates});
}

const [rendererSource, mapIoSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/renderer/placeholder-renderer.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/map-file-io.js", import.meta.url), "utf8")
]);
assert.match(rendererSource, /resolveStateLabelPlacement\(map, state, text\)/, "实时标签没有接入国家本土布局");
assert.match(rendererSource, /anchorAllowed:[\s\S]*stateLabelAnchorAllowed/, "国家标签避让没有限制在选定陆地块");
assert.match(mapIoSource, /\.state-label\.visible/, "PNG 导出没有继续复用实时国家标签节点");

console.log(JSON.stringify({
  ok: true,
  capital: placementDigest(capitalPlacement),
  largest: placementDigest(largestPlacement),
  changedCapital: placementDigest(changedCapitalPlacement),
  realMaps,
  fallback: {center: centerFallback.source, grid: gridFallback.source},
  manualPosition: manualLayout.position
}, null, 2));

function createArchipelagoFixture() {
  return {
    metadata: {graphWidth: 120, graphHeight: 40},
    labels: {},
    politics: {states: [null, {i: 1, id: 1, name: "群岛国", fullName: "群岛联合王国", capital: 7, center: 0, gridCenter: 0}]},
    settlements: {cities: [{id: 0, burgId: 7, packCell: 1}, {id: 1, burgId: 8, packCell: 5}]},
    pack: {
      burgs: [null, null, null, null, null, null, null, {i: 7, cell: 1}, {i: 8, cell: 5}],
      cells: {
        i: [0, 1, 2, 3, 4, 5, 6],
        p: [[8, 9], [10, 10], [12, 11], [100, 0], [100, 4], [100, 8], [100, 12]],
        c: [[1], [0, 2], [1], [4], [3, 5], [4, 6], [5]],
        h: Uint8Array.from([30, 30, 30, 30, 30, 30, 30]),
        state: Uint16Array.from([1, 1, 1, 1, 1, 1, 1]),
        area: Float64Array.from([1, 1, 1, 2, 2, 2, 2])
      }
    },
    grid: {points: [[7, 9]], cells: {p: Uint32Array.from([0])}}
  };
}

function placementDigest(placement) {
  return {
    x: placement.x,
    y: placement.y,
    cell: placement.cell,
    componentCells: [...placement.componentCells],
    source: placement.source,
    rotation: placement.rotation
  };
}

function allStateLandCentroid(source) {
  let weight = 0;
  let x = 0;
  let y = 0;
  for (const cell of source.pack.cells.i) {
    if (source.pack.cells.state[cell] !== 1 || source.pack.cells.h[cell] < 20) continue;
    const area = source.pack.cells.area[cell] || 1;
    weight += area;
    x += source.pack.cells.p[cell][0] * area;
    y += source.pack.cells.p[cell][1] * area;
  }
  return [x / weight, y / weight];
}
