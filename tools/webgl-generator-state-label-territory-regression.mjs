#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {resolvePoliticalLabelPlacement, placeHomelandLabel} from "../app/webgl-generator/src/renderer/political-label-layout.js";
import {homelandOutline, homelandContainsBox, homelandLabelSites} from "../app/webgl-generator/src/renderer/state-label-footprint.js";
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
const rotated = angle => resolvePoliticalLabelPlacement({
  item: {...politicalItem, rotation: angle}, screen: {x: 420, y: 240}, locked: true
}).glyphs[0].box;
const rightTilt = rotated(85), leftTilt = rotated(95);
assert.ok(Math.abs((rightTilt.right - rightTilt.left) - (leftTilt.right - leftTilt.left)) < 0.01,
  "锁定标签跨过垂直方向后仍应覆盖完整字形");

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
// The centroid falls in the enclave. A full name fits on either land bridge.
const {sites: inlandSites} = homelandLabelSites(outline, 30, 30, 0);
assert.equal(homelandLabelSites(outline, 30, 30, 0).sites, inlandSites);
assert.ok(inlandSites.length && inlandSites.every(site => homelandContainsBox(outline, site.x, site.y, site.x, site.y)));
const ringLabel = {text: "燕王国", state: {name: "燕"}, resolvedStyle: {fontSize: 11}, x: 30, y: 30, rotation: 0};
const onRing = sites => placeHomelandLabel({
  item: ringLabel, screen: {x: 30, y: 30}, sx: 1, sy: 1, scale: 1, sites, obstacles: [], peers: [], padding: 0,
  fits: (box, margin, site) => homelandContainsBox(outline,
    site.x + box.left - margin, site.y + box.top - margin, site.x + box.right + margin, site.y + box.bottom + margin)
});
assert.equal(onRing([{x: 30, y: 30}]), null);
assert.equal(onRing(inlandSites)?.glyphs.map(g => g.character).join(""), "燕王国");
const bayMap = structuredClone(ringMap);
bayMap.pack.vertices.p = bayMap.pack.vertices.p.map(([x, y]) => [[0, 80, 105, 185][x / 20], y * 2]);
const bay = homelandOutline(bayMap, new Set([0, 2, 3, 5, 6, 7, 8]));
const bankSites = homelandLabelSites(bay, 92, 55, 0);
const bayItem = {...ringLabel, x: 92, y: 55, text: "东岚部盟", state: {name: "东岚"}, resolvedStyle: {fontSize: 18}};
const bankLabel = placeHomelandLabel({
  item: bayItem, screen: {x: 92, y: 55}, sx: 1, sy: 1, scale: 1, ...bankSites,
  obstacles: [{left: 82, right: 101, top: 0, bottom: 80}], peers: [], padding: 1,
  fits: (box, margin, site) => homelandContainsBox(bay,
    site.x + box.left - margin, site.y + box.top - margin, site.x + box.right + margin, site.y + box.bottom + margin)
});
assert.equal(bankLabel.glyphs.map(g => g.character).join(""), "东岚部盟");
assert.ok(bankLabel.candidateIndex > 0 && bankLabel.spacing === 2.4, "岸上能排下全称时应先用正常字距");

// Two glyphs fit on the left shore and only one on the right. The water
// falls inside 帝国 rather than at the suffix boundary.
const across = placeHomelandLabel({
  item: {...bayItem, x: 0, y: 0, text: "赵帝国", state: {name: "赵"}, resolvedStyle: {fontSize: 20}},
  screen: {x: 0, y: 0}, sx: 1, sy: 1, scale: 1, sites: [{x: 27, y: 0}, {x: 73, y: 0}],
  banks: [{x: 57, y: 0, gap: 4}], obstacles: [], peers: [], padding: 0,
  fits: (box, margin, {x, y}) => {
    const left = x + box.left - margin, right = x + box.right + margin;
    return y + box.top - margin >= -16 && y + box.bottom + margin <= 16
      && ((left >= -1 && right <= 55) || (left >= 59 && right <= 87));
  }
});
assert.equal(across.glyphs.map(g => g.character).join(""), "赵帝国");
assert.equal(across.splitAt, 2);
assert.equal(across.fontSize, 20);
const [zhao, di, guo] = across.glyphs;
assert.ok(di.box.right < 55 && guo.box.left > 59);
assert.ok(across.spacing > 2.4 && across.spacing <= 2.4 + across.fontSize / 2);
assert.ok(Math.abs((di.x - zhao.x) - (guo.x - di.x)) < 0.01, "跨湾单行应逐字等距");
const gapLabel = resolvePoliticalLabelPlacement({
  item: {...politicalItem, text: "湾", resolvedStyle: {fontSize: 4}}, locked: true, screen: {x: 57, y: 0},
  peers: [{...across.box, parts: across.glyphs.map(g => g.box)}], viewport: {width: 200, height: 140}
});
assert.equal(gapLabel.collides, false, "上一国家国名的字间水面应允许放置其它标签");

// The geometric centre is over water. Only the printed glyphs need land,
// including when the author put a space into the display name.
for (const text of ["海国", "海 国"]) {
  const strait = placeHomelandLabel({item: {...bayItem, x: 0, y: 0, text, state: {name: text},
    resolvedStyle: {fontSize: 18, letterSpacing: 14}}, screen: {x: 0, y: 0}, sx: 1, sy: 1, scale: 1,
    sites: [{x: 0, y: 0}], obstacles: [], peers: [], padding: 0,
    fits: (box, margin) => box.right + margin < -3 || box.left - margin > 3});
  assert.equal(strait?.glyphs.map(g => g.character).join(""), text);
  assert.equal(strait.fontSize, 18);
  assert.ok(strait.glyphs[0].box.right < -3 && strait.glyphs.at(-1).box.left > 3);
  assert.deepEqual(strait.box.parts, [strait.glyphs[0].box, strait.glyphs.at(-1).box], "空格不应占用拾取范围");
}

const islandLeft = [0, 76, 51, 510];
const islands = {metadata: {graphHeight: 60}, pack: {burgs: [null, {i: 1, cell: 0}], cells: {
  i: [0,1,2,3], state: [1,1,2,1], h: [30,30,30,30], c: [[], [], [], []], area: [2640,2640,600,2640],
  p: [[22,30],[98,30],[56,30],[532,30]], v: islandLeft.map((_, i) => [0,1,2,3].map(j => i*4+j))
}, vertices: {p: islandLeft.flatMap((x, i) => [[x,0],[x+(i === 2 ? 10 : 44),0],[x+(i === 2 ? 10 : 44),60],[x,60]])}}};
const cluster = resolveStateLabelPlacement(islands, {i: 1, capital: 1});
assert.deepEqual(cluster.componentCells, [0,1], "首都附近两岛可共同承载国名，邻国和远方飞地不牵动本土");
const clusterOutline = homelandOutline(islands, cluster.componentCellSet);
const clusterLabel = placeHomelandLabel({item: {...bayItem, ...cluster, text: "海国", state: {name: "海"}},
  screen: {x: cluster.x, y: cluster.y}, sx: 1, sy: 1, scale: 1, ...homelandLabelSites(clusterOutline, cluster.x, cluster.y, cluster.rotation),
  outline: clusterOutline, obstacles: [], peers: [], padding: 0,
  fits: (b, m, {x, y}) => homelandContainsBox(clusterOutline, x+b.left-m, y+b.top-m, x+b.right+m, y+b.bottom+m)});
assert.equal(clusterLabel.glyphs.map(g => g.character).join(""), "海国");
assert.ok(clusterLabel.glyphs[0].box.right < 44 && clusterLabel.glyphs[1].box.left > 76);
assert.ok(!homelandContainsBox(clusterOutline, clusterLabel.anchor.x, clusterLabel.anchor.y, clusterLabel.anchor.x, clusterLabel.anchor.y));
// A single-cell country still has a two-dimensional interior. Its principal
// direction and the shortlist near the shore cannot justify dropping its name.
const singleCell = {metadata: {graphHeight: 60}, pack: {
  cells: {i:[0], state:[1], h:[30], p: [[40, 15]], v: [[0, 1, 2, 3]]}, vertices: {p: [[0,0], [80,0], [80,30], [0,30]]}
}};
const singleOutline = homelandOutline(singleCell, new Set([0]));
const singleAxis = resolveStateLabelPlacement(singleCell, {i:1}).rotation;
assert.equal(singleAxis, 0);
const inlandName = placeHomelandLabel({
  item: {...ringLabel, x: 3, y: 3, rotation: singleAxis, resolvedStyle: {fontSize: 18}}, screen: {x: 3, y: 3},
  outline: singleOutline, sites: [{x: 3, y: 3}], sx: 1, sy: 1, scale: 1, obstacles: [], peers: [], padding: 0,
  fits: (box, margin, {x, y}) => homelandContainsBox(singleOutline, x + box.left - margin, y + box.top - margin,
    x + box.right + margin, y + box.bottom + margin)
});
assert.equal(inlandName?.glyphs.map(g => g.character).join(""), ringLabel.text);
assert.ok(Math.abs(inlandName.anchor.x - 40) < 5 && Math.abs(inlandName.anchor.y - 15) < 5);

function labelInsidePolygon(vertices, center) {
  const map = {metadata: {graphHeight: 360}, pack: {
    cells: {i: [0], state: [1], h: [30], p: [center], v: [vertices.map((_, i) => i)]}, vertices: {p: vertices}
  }};
  const placement = resolveStateLabelPlacement(map, {i: 1});
  const item = {...ringLabel, ...placement, resolvedStyle: {fontSize: 22}};
  const outline = homelandOutline(map, placement.componentCellSet);
  const {sites, banks} = homelandLabelSites(outline, item.x, item.y, item.rotation);
  const fits = (box, margin, {x, y}) => homelandContainsBox(outline,
    x + box.left - margin, y + box.top - margin, x + box.right + margin, y + box.bottom + margin);
  const options = {item, screen: {x: item.x, y: item.y}, sx: 1, sy: 1, scale: 1, sites, banks, outline, fits,
    obstacles: [], peers: [], padding: 0};
  const initial = placeHomelandLabel(options);
  assert.equal(initial.glyphs.map(g => g.character).join(""), item.text);
  const covered = placeHomelandLabel({...options, obstacles: [initial.box]});
  assert.ok(covered.cityCollides);
  assert.deepEqual(covered.glyphs, initial.glyphs);
  assert.equal(homelandLabelSites(outline, item.x, item.y, item.rotation).sites, sites);
  return {initial, axis: item.rotation, outline};
}

// The southern arm determines the PCA, but the northern mainland has ample horizontal space.
const hooked = labelInsidePolygon([[0,0],[160,0],[160,330],[130,330],[130,62],[0,62]], [145,165]);
assert.ok(Math.abs(hooked.axis) > 60);
assert.equal(hooked.initial.lines, 1);
assert.equal(hooked.initial.rotation, 0);
assert.ok(hooked.initial.anchor.y < 62 && homelandContainsBox(hooked.outline, hooked.initial.box.left,
  hooked.initial.box.top, hooked.initial.box.right, hooked.initial.box.bottom));
// This strip is wide enough for three small glyphs across, but its interior consistently runs north-south.
const meridian = labelInsidePolygon([[0,0],[85,0],[85,340],[0,340]], [42.5,170]);
assert.equal(meridian.initial.rotation, 90);
assert.equal(meridian.initial.lines, 1);
const diagonal = labelInsidePolygon([[0,26],[26,0],[236,210],[210,236]], [118,118]);
assert.ok(Math.abs(diagonal.initial.rotation - 45) < 1);
assert.equal(diagonal.initial.lines, 1);

const label = {text:"燕王国", state:{name:"燕"}, targetId:71, resolvedStyle:{fontSize:20}, rotation:90, x:0, y:0};
const place = (overrides={}) => placeHomelandLabel({item:{...label}, screen:{x:0,y:0}, sx:1,sy:1, scale:1,
  fits:()=>true, obstacles:[],peers:[],padding:0,...overrides});
const linear = place({banks: [{x: 0, y: 0, gap: 1}]});
assert.ok(linear.glyphs.every(g => g.angle === 0 && Math.abs(g.x) < 0.01));
assert.equal(linear.glyphs.map(g=>g.character).join(""),label.text);
assert.deepEqual(linear.glyphs.map(g => g.y), [-22.4, 0, 22.4], "直排国名和后缀使用相同的正常字距");
for (const axis of [-72, 108]) {
  const {glyphs} = place({item:{...label, rotation:axis}});
  assert.ok(glyphs[0].y < glyphs.at(-1).y && glyphs[0].x > glyphs.at(-1).x, "倾斜竖排应从上往下读");
}
const overlap = place({obstacles:[{left:-500,right:500,top:-500,bottom:500}]});
assert.ok(overlap.cityCollides);
assert.deepEqual(overlap.glyphs, linear.glyphs, "城市出现只能改变国名显示强度");
assert.deepEqual(overlap.anchor, linear.anchor);
const overview = place({scale:0.8});
for (const [i, glyph] of overview.glyphs.entries()) {
  assert.ok(Math.abs(glyph.y / 0.8 - linear.glyphs[i].y) < 0.01);
}
const within = halfWidth => (box, margin) => box.left-margin >= -halfWidth && box.right+margin <= halfWidth;
const snug = place({item:{...label,rotation:0},fits:within(34)});
assert.equal(snug.glyphs.map(g=>g.character).join(""),label.text);
assert.ok(snug.fontSize <= linear.fontSize);
const reduced = place({item:{...label,rotation:0},scale:0.8,fits:within(27)});
assert.equal(reduced.glyphs.map(g=>g.character).join(""),label.text);
assert.equal(reduced.lines, 2, "窄地先按国名与政体分行");
const short = place({item:{...label,rotation:0},scale:0.8,fits:within(13)});
assert.equal(short.glyphs.map(g=>g.character).join(""),"燕");
assert.ok(short.fontSize < linear.fontSize);
const wrap = (text, shortName) => place({item:{...label, text, state:{name:shortName}, rotation:0},
  fits:within(49)});
for (const [name, stem, second] of [["滕联邦共和国","滕","共和国"], ["North Realm","North","Realm"]]) {
  const wrapped = wrap(name, stem);
  assert.equal(wrapped.lines, 2);
  const lower = wrapped.glyphs.filter(g => g.y > 0);
  assert.equal(lower.map(g => g.character).join(""), second);
  assert.equal(wrapped.glyphs.map(g => g.character).join(""), name);
}
assert.equal(place({fits:()=>false}),null, "无可用本土空间时应隐藏");
const offsetShadow = place({item:{...label,text:"田",state:{name:"田"},resolvedStyle:{fontSize:20,shadowOffsetX:20}},
  fits:(box,gap)=>box.left-gap > -24 && box.right+gap < 24});
assert.equal(offsetShadow,null,"向右的字影不能越过右侧国界");
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
