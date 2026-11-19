#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {resolvePoliticalLabelPlacement, placeHomelandLabel} from "../app/webgl-generator/src/renderer/political-label-layout.js";
import {homelandOutline, homelandContainsBox} from "../app/webgl-generator/src/renderer/state-label-footprint.js";
import {collectStateLandComponents, resolveStateLabelPlacement, stateLabelComponentContainsPoint} from "../app/webgl-generator/src/renderer/state-label-territory.js";
import {patchLabelLayout, resolveLabelLayout} from "../app/webgl-generator/src/runtime/label-layout-registry.js";
import {PNG_SEMANTIC_LABEL_SELECTORS} from "../app/webgl-generator/src/runtime/canvas-text-contract.js";

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

const polygonMap = {pack: {
  cells: {v: [[0, 1, 2, 3], [1, 4, 5, 2]], c: [[1], [0]]},
  vertices: {p: [[0, 0], [10, 0], [10, 10], [0, 10], [20, 0], [20, 10]]}
}};
assert.equal(stateLabelComponentContainsPoint(polygonMap, new Set([0]), 5, 5, 0), true, "本国 cell 内点未通过");
assert.equal(stateLabelComponentContainsPoint(polygonMap, new Set([0]), 15, 5, 0), false, "网格拾取猜中本国 cell 却在多边形外的点不应通过");
assert.equal(stateLabelComponentContainsPoint(polygonMap, new Set([1]), 15, 5, 0), true, "邻近 pack cell 的本国真实内点应通过");
polygonMap.pack.cells.c = [[], []];
assert.equal(stateLabelComponentContainsPoint(polygonMap, new Set([1]), 15, 5, 0), true, "猜测 cell 不相邻时仍应按真实多边形识别本国内点");
const oldGeometryMap = {pack: {cells: {p: [[5, 5], [15, 5]]}}};
assert.equal(stateLabelComponentContainsPoint(oldGeometryMap, new Set([1]), 15, 5, 0), true, "旧图缺少 pack 多边形时应使用最近 pack 中心");
assert.equal(stateLabelComponentContainsPoint(oldGeometryMap, new Set([1]), 5, 5, 1), false, "旧图不能直接相信猜测 cell 的归属");

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
  if (seed === "audit-archipelago-001") {
    const seven = resolveStateLabelPlacement(generated,generated.politics.states[7]);
    const territory = homelandOutline(generated,seven.componentCellSet);
    assert.equal(homelandContainsBox(territory,486.159,138.884,486.160,138.885),false,"弗洛伦不能占用邻国的 grid #725");
    const state17 = generated.politics.states[17];
    const placement17 = resolveStateLabelPlacement(generated, state17, state17.fullName || state17.name);
    assert.equal(stateLabelComponentContainsPoint(generated, placement17.componentCellSet, 128.2114, 569.0295, 1359), true,
      "真实 archipelago 中猜测 cell 非邻接的合法国家中点被误拒");
  }
  realMaps.push({seed, states, crossSeaStates});
}
assert.ok(realMaps.every(item => item.states > 0), "固定 archipelago 种子集合没有形成国家标签回归样本");

const [rendererSource, mapIoSource] = await Promise.all([
  readFile(new URL("../app/webgl-generator/src/renderer/placeholder-renderer.js", import.meta.url), "utf8"),
  readFile(new URL("../app/webgl-generator/src/runtime/map-file-io.js", import.meta.url), "utf8")
]);
assert.match(rendererSource, /resolveStateLabelPlacement\(map, state, text\)/, "实时标签没有接入国家本土布局");
assert.equal(changedCapitalPlacement.rotation, 90);
const square = createArchipelagoFixture();
square.pack.cells.p.splice(3, 4, [90, 1], [100, 1], [90, 11], [100, 11]);
square.politics.states[1].capital = 8;
assert.equal(resolveStateLabelPlacement(square, square.politics.states[1]).rotation, 0);
const ringMap = {metadata:{graphHeight: 60}, pack:{cells:{v:[]},vertices:{p:[]}}};
for (let y=0; y<4; y++) for (let x=0; x<4; x++) ringMap.pack.vertices.p.push([20*x,20*y]);
for (let y=0; y<3; y++) for (let x=0; x<3; x++) {
  const v = y*4+x;
  ringMap.pack.cells.v.push([v,v+1,v+5,v+4]);
}
const outline = homelandOutline(ringMap,new Set([0,1,2,3,5,6,7,8]));
assert.ok(homelandContainsBox(outline,2,2,58,18));
assert.equal(homelandContainsBox(outline,3,3,57,57),false,"四角在境内仍不能跨过飞地");
assert.equal(homelandContainsBox(outline,3,3,60,18),false,"不能贴边");
const label = {text:"燕王国", state:{name:"燕"}, targetId:71, resolvedStyle:{fontSize:20}, rotation:90, x:0, y:0};
const place = (overrides={}) => placeHomelandLabel({item:{...label}, screen:{x:0,y:0}, sx:1,sy:1, scale:1,
  fits:()=>true, obstacles:[],peers:[],padding:0,legendNumbers:new Map(),...overrides});
const linear = place();
assert.ok(linear.glyphs.every(g => g.angle === 0 && Math.abs(g.x) < 0.01));
assert.equal(linear.glyphs.map(g=>g.character).join(""),label.text);
for (const axis of [-72, 108]) {
  const {glyphs} = place({item:{...label, rotation:axis}});
  assert.ok(glyphs[0].y < glyphs.at(-1).y && glyphs[0].x > glyphs.at(-1).x, "倾斜竖排应从上往下读");
}
const wide = place({item:{...label,text:"燕国",rotation:0}, obstacles:[{left:-3,right:3,top:-3,bottom:3}]});
assert.ok(wide.spacing > linear.spacing && wide.bend === 0 && !wide.collides);
const arced = place({obstacles:[{left:-1,right:1,top:-2,bottom:2}]});
assert.ok(arced.bend && arced.glyphs.every(g => g.angle === 0), "中心障碍应先尝试曲线");
assert.deepEqual(arced.anchor,linear.anchor);
const overlap = place({obstacles:[{left:-500,right:500,top:-500,bottom:500}]});
assert.ok(overlap.cityCollides && !overlap.number);
const short = place({scale:0.8});
assert.equal(short.glyphs.map(g=>g.character).join(""),"燕");
assert.ok(short.fontSize < linear.fontSize);
const legendNumbers = new Map();
const fallback = id => place({item:{...label, targetId:id}, fits:()=>false, legendNumbers});
assert.equal(fallback(4009).number,"1");
assert.equal(fallback(2545).number,"2");
assert.equal(fallback(4009).rootSize.width,13);
for (let index = 3; index <= 10; index++) assert.equal(fallback(5000 + index).number, String(index));
assert.equal(fallback(5010).rootSize.width,16);
assert.equal(fallback(4009).number,"1");
const offsetShadow = place({item:{...label,text:"田",state:{name:"田"},resolvedStyle:{fontSize:20,shadowOffsetX:20}},
  fits:(box,gap)=>box.left-gap > -24 && box.right+gap < 24});
assert.equal(offsetShadow.number,"1","向右的字影不能越过右侧国界");
assert.ok(PNG_SEMANTIC_LABEL_SELECTORS.includes(".state-label.visible"), "PNG 语义标签契约没有继续包含国家标签节点");
assert.match(mapIoSource, /selectors\.push\(\.\.\.PNG_SEMANTIC_LABEL_SELECTORS\)/, "PNG 导出没有消费共享语义标签契约");

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
