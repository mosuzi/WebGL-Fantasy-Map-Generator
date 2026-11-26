import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {buildRouteMeshVertices} from "../app/webgl-generator/src/renderer/placeholder-renderer.js";
import {routeWorldWidth} from "../app/webgl-generator/src/renderer/line-width-projection.js";
import {SURFACE_SIDE_ALPHA} from "../app/webgl-generator/src/renderer/surface-side-depth.js";
import {
  drawRouteMeshBatches,
  resolveRouteStyle,
  SELECTED_ROUTE_COLOR
} from "../app/webgl-generator/src/renderer/route-style.js";
import {OBJECT_KIND} from "../app/webgl-generator/src/runtime/object-kinds.js";
import {buildObjectPickingIndex, pickRoute} from "../app/webgl-generator/src/renderer/picking.js";
import {routeCurveTolerance, routeVisualPath} from "../app/webgl-generator/src/geometry/route-visual-path.js";
import {invalidateSeaRouteWater} from "../app/webgl-generator/src/geometry/sea-route-water.js";
import {locateGridPoint} from "../app/webgl-generator/src/geometry/grid-point.js";
import {listHoverGeometry} from "../app/webgl-generator/src/renderer/list-hover-geometry.js";

// 玩家地图上主路的中间拐点与次级道路的末端共用这个坐标。
const junction = [255.75, 661.59];
const trunk = {id: 37, type: "road", points: [[241.45, 661.65], junction, [247.69, 677.23]]};
const branch = {id: 26, type: "road", points: [[268.54, 642.69], [262.44, 650.62], junction]};
const path = routeVisualPath(trunk);
const crossing = path.spans[0][1];
assert.deepEqual(path.points[crossing], junction);
assert.deepEqual(routeVisualPath(branch).points.at(-1), junction);
const pointsAroundJunction = path.points.slice(crossing - 1, crossing + 2);
assert.equal(pointsAroundJunction.length, 3);
assert.ok(path.points.length > trunk.points.length, "路口两侧应生成平滑曲线");
const distant = routeVisualPath(trunk, routeCurveTolerance(0.5));
assert.deepEqual(distant.points[distant.spans[0][1]], junction);
assert.ok(distant.points.length < path.points.length, "远景应减少采样并保留路口");

const offsetPoint = path.points.slice(1, crossing).find(point => Math.abs(point[1] - junction[1]) > 0.45);
assert.ok(offsetPoint, "夹具应命中偏离旧折线的可见曲线");
const routeMap = {metadata: {graphWidth: 1024, graphHeight: 768}, settlements: {routes: [trunk, branch], cities: []}};
const picking = buildObjectPickingIndex(routeMap, {components: ["routeSegments"]});
assert.equal(picking.routeSegmentCount, 4);
assert.equal(pickRoute(routeMap, picking, ...offsetPoint, 0.2)?.id, trunk.id);
assert.equal(pickRoute(routeMap, null, ...offsetPoint, 0.2)?.id, trunk.id);
assert.strictEqual(listHoverGeometry(routeMap, {kind: "route", id: trunk.id})[0].points, path.points);
const duplicate = routeVisualPath({type: "trail", points: [trunk.points[0], junction, junction, trunk.points[2]]});
assert.equal(duplicate.duplicates, 1);
assert.equal(duplicate.spans[1], undefined);
assert.deepEqual(duplicate.points[duplicate.spans[2][0]], junction);

const waterColumns = 7, waterRows = 5, step = 10;
const waterBounds = {columns: waterColumns, rows: waterRows, graphWidth: waterColumns * step, graphHeight: waterRows * step};
const land = 2 * waterColumns + 3;
const waterGrid = {metadata: waterBounds, points: [], vertices: {p: []}, cells: {c: [], v: [], h: []}};
for (let row = 0; row <= waterRows; row++) {
  for (let column = 0; column <= waterColumns; column++) waterGrid.vertices.p.push([column * step, row * step]);
}
for (let row = 0; row < waterRows; row++) {
  for (let column = 0; column < waterColumns; column++) {
    const cell = row * waterColumns + column;
    const corner = row * (waterColumns + 1) + column;
    waterGrid.points.push([(column + 0.5) * step, (row + 0.5) * step]);
    waterGrid.cells.v.push([corner, corner + 1, corner + waterColumns + 2, corner + waterColumns + 1]);
    waterGrid.cells.c.push([
      ...(column > 0 ? [cell - 1] : []), ...(column < waterColumns - 1 ? [cell + 1] : []),
      ...(row > 0 ? [cell - waterColumns] : []), ...(row < waterRows - 1 ? [cell + waterColumns] : [])
    ]);
    waterGrid.cells.h.push(cell === land ? 30 : 18);
  }
}
const coastalRoute = {id: 71, type: "searoute", cells: [land - 2, land - 1, land + 2], points: [[15, 25], [35, 25], [55, 25]]};
const coastMap = {metadata: waterBounds, grid: waterGrid, settlements: {routes: [coastalRoute], cities: []}};
const coastalData = structuredClone(coastalRoute);
const coastPicking = buildObjectPickingIndex(coastMap);
const showCoast = routeVisualPath(coastalRoute, undefined, coastMap);
for (const tolerance of [undefined, routeCurveTolerance(0.5)]) {
  const {points} = routeVisualPath(coastalRoute, tolerance, coastMap);
  assert.deepEqual([points[0], points.at(-1)], [coastalRoute.points[0], coastalRoute.points.at(-1)]);
  for (let index = 1; index < points.length; index++) {
    const [a, b] = points.slice(index - 1, index + 1);
    for (let sample = 0; sample <= 32; sample++) {
      const mix = sample / 32;
      const [x, y] = a.map((coordinate, axis) => coordinate + mix * (b[axis] - coordinate));
      assert.notEqual(locateGridPoint(waterGrid, x, y).cell, land, "旧水路中间点及各缩放曲线均不得穿岛");
    }
  }
}
const detour = showCoast.points.find(point => Math.abs(point[1] - 25) > 5.1);
assert.ok(detour);
assert.equal(pickRoute(coastMap, coastPicking, ...detour, 0.15)?.id, coastalRoute.id);
assert.equal(pickRoute(coastMap, coastPicking, 35, 25, 0.15), null);
assert.strictEqual(listHoverGeometry(coastMap, {kind: "route", id: coastalRoute.id})[0].points, showCoast.points);
const portLeg = {type: "searoute", cells: [land, land + 2], points: [[35, 25], [55, 25]]};
assert.deepEqual(routeVisualPath(portLeg, undefined, coastMap).points[0], portLeg.points[0], "陆上的港口端点应保留");
waterGrid.cells.h[land] = 18;
invalidateSeaRouteWater(coastMap);
assert.deepEqual(routeVisualPath(coastalRoute, undefined, coastMap).points, coastalRoute.points, "海陆变化应刷新显示路径");
assert.deepEqual(coastalRoute, coastalData);

const theme = {
  lines: {
    routePrimary: [0.2, 0.3, 0.4, 0.91],
    routeSecondary: [0.4, 0.3, 0.2, 0.73],
    routeMinor: [0.3, 0.25, 0.2, 0.57]
  }
};
const routes = {
  road: {id: 101, type: "road", level: "primary", points: [[120, 180], [880, 180]], cells: [11, 12]},
  trail: {id: 202, type: "trail", level: "trail", points: [[120, 300], [880, 300]], cells: [21, 22]},
  sea: {id: 530, type: "searoute", level: "secondary", points: [[80, 420], [920, 420]], cells: [31, 32]}
};
const before = structuredClone(routes);
const map = {metadata: {graphWidth: 1000, graphHeight: 600}, settlements: {routes: Object.values(routes)}};
const camera = {scale: 1, offsetX: 0, offsetY: 0};
const canvas = {clientWidth: 1000, clientHeight: 600, width: 1000, height: 600};

const roadStyle = resolveRouteStyle(routes.road, theme);
const trailStyle = resolveRouteStyle(routes.trail, theme);
const seaStyle = resolveRouteStyle(routes.sea, theme);
assert.deepEqual(roadStyle.color, theme.lines.routePrimary, "道路必须继续使用主题主路颜色");
assert.deepEqual(trailStyle.color, theme.lines.routeMinor, "小径必须继续使用主题支路颜色");
assert.deepEqual(seaStyle.color, theme.lines.routeSecondary, "海路的视觉陆地片段必须沿用对应等级主题色");
assert.deepEqual(seaStyle.seaColor, [1, 1, 1, theme.lines.routeSecondary[3]], "海路的视觉水面片段必须使用白色 RGB 并保持透明度");
assert.deepEqual(SELECTED_ROUTE_COLOR, [1, 0.82, 0.34, 1], "选中路线必须继续使用既有金色");
for (const level of ["primary", "secondary", "minor"]) {
  assert.equal(resolveRouteStyle({...routes.sea, level}, theme).worldWidth, routeWorldWidth(level), `海路 ${level} 世界宽度不得改变`);
}

const combined = buildRouteMeshVertices(map, camera, canvas, null, [], theme);
assert.ok(combined.drawRanges.ordinary.count > 0, "道路和小径必须进入普通路线 batch");
assert.ok(combined.drawRanges.seaLand.count > 0, "未选海路必须生成视觉陆地棕色 batch");
assert.equal(combined.drawRanges.seaWater.count, combined.drawRanges.seaLand.count, "未选海路的水面白色 batch 必须复用完全相同的 mesh");
assert.equal(combined.stats.maskedSeaRoutes, 1, "跨岸夹具必须识别一条 depth 遮罩海路");
assertVertexRgb(combined.vertices, combined.drawRanges.seaLand, seaStyle.color, "海路陆地 batch");
assertVertexRgb(combined.vertices, combined.drawRanges.seaWater, seaStyle.seaColor, "海路水面 batch");
assertRangePositionsEqual(combined.vertices, combined.drawRanges.seaLand, combined.drawRanges.seaWater);

const selectedMap = {metadata: map.metadata, settlements: {routes: [routes.sea]}};
const selected = buildRouteMeshVertices(selectedMap, camera, canvas, {kind: OBJECT_KIND.ROUTE, id: routes.sea.id}, [], theme);
assert.ok(selected.drawRanges.ordinary.count > 0, "选中海路必须进入不受海陆 depth 裁切的普通 batch");
assert.equal(selected.drawRanges.seaLand.count, 0, "选中海路不得保留陆地遮罩副本");
assert.equal(selected.drawRanges.seaWater.count, 0, "选中海路不得保留水面遮罩副本");
assertVertexRgb(selected.vertices, selected.drawRanges.ordinary, SELECTED_ROUTE_COLOR, "选中海路");

const gl = createMockGl();
drawRouteMeshBatches(gl, combined.drawRanges);
assert.deepEqual(gl.calls, [
  ["enable", "DEPTH_TEST"],
  ["depthMask", false],
  ["depthFunc", "GREATER"],
  ["drawArrays", "TRIANGLES", combined.drawRanges.seaLand.first, combined.drawRanges.seaLand.count],
  ["depthFunc", "LESS"],
  ["drawArrays", "TRIANGLES", combined.drawRanges.seaWater.first, combined.drawRanges.seaWater.count],
  ["disable", "DEPTH_TEST"],
  ["depthMask", false],
  ["depthFunc", "LESS"],
  ["drawArrays", "TRIANGLES", combined.drawRanges.ordinary.first, combined.drawRanges.ordinary.count]
], "海陆遮罩必须先绘，随后恢复 depth 状态并把普通 / 选中路线绘在最上层");

const ordinaryOnlyGl = createMockGl();
drawRouteMeshBatches(ordinaryOnlyGl, selected.drawRanges);
assert.deepEqual(ordinaryOnlyGl.calls, [
  ["disable", "DEPTH_TEST"],
  ["depthMask", false],
  ["depthFunc", "LESS"],
  ["drawArrays", "TRIANGLES", selected.drawRanges.ordinary.first, selected.drawRanges.ordinary.count]
], "没有 masked sea 时也必须在普通路线前固定恢复 depth 状态");

assert.deepEqual(SURFACE_SIDE_ALPHA, {land: 0.25, water: 0.75}, "视觉 surface 必须继续以统一 land / water 语义写入 depth，水面包含海洋与湖泊");
const hardSurfaceDepth = [SURFACE_SIDE_ALPHA.land, SURFACE_SIDE_ALPHA.land, SURFACE_SIDE_ALPHA.water, SURFACE_SIDE_ALPHA.water, SURFACE_SIDE_ALPHA.water, SURFACE_SIDE_ALPHA.water, SURFACE_SIDE_ALPHA.water, SURFACE_SIDE_ALPHA.water, SURFACE_SIDE_ALPHA.water, SURFACE_SIDE_ALPHA.land, SURFACE_SIDE_ALPHA.land];
const smoothSurfaceDepth = [SURFACE_SIDE_ALPHA.land, SURFACE_SIDE_ALPHA.land, SURFACE_SIDE_ALPHA.land, SURFACE_SIDE_ALPHA.water, SURFACE_SIDE_ALPHA.water, SURFACE_SIDE_ALPHA.water, SURFACE_SIDE_ALPHA.water, SURFACE_SIDE_ALPHA.water, SURFACE_SIDE_ALPHA.land, SURFACE_SIDE_ALPHA.land, SURFACE_SIDE_ALPHA.land];
assert.deepEqual(maskedSeaColors(hardSurfaceDepth), ["land", "land", "sea", "sea", "sea", "sea", "sea", "sea", "sea", "land", "land"], "硬 cell 岸线必须在两个精确 depth 交点切换颜色");
assert.deepEqual(maskedSeaColors(smoothSurfaceDepth), ["land", "land", "land", "sea", "sea", "sea", "sea", "sea", "land", "land", "land"], "平滑岸线移动后必须直接跟随最终 surface depth 交点");
assert.deepEqual(maskedSeaColors(hardSurfaceDepth, true), hardSurfaceDepth.map(() => "selected"), "选中海路必须跨越港口边界保持整条金色");
assert.equal(maskedSeaColors(hardSurfaceDepth)[0], "land", "起点港口的视觉陆地片段必须为主题棕色");
assert.equal(maskedSeaColors(hardSurfaceDepth).at(-1), "land", "终点港口的视觉陆地片段必须为主题棕色");
assert.deepEqual(routes, before, "路线样式与 batch 构建不得修改 points、cells 或其它 canonical 路线数据");

const rendererSource = await readFile(new URL("../app/webgl-generator/src/renderer/placeholder-renderer.js", import.meta.url), "utf8");
const drawSource = sourceBetween(rendererSource, "draw({updateDynamicBuffers", "pickClientPoint(clientX");
const shaderSource = sourceBetween(rendererSource, "const vertexShaderSource", "const fragmentShaderSource");
assert.match(shaderSource, /float z = u_surfaceSideMode \? \(a_color\.a < 0\.5 \? -0\.5 : 0\.5\) : 0\.0/, "surface 必须继续把陆地、水面和路线分别写入 -0.5 / +0.5 / 0 depth");
assert.match(drawSource, /gl\.clearDepth\(0\.5\)/, "depth 基准必须保持在陆地与水面之间");
assert.ok(drawSource.indexOf("drawSurfaceDepthBatch") < drawSource.indexOf("drawRouteMeshBatches"), "最终 surface depth 必须先于路线遮罩绘制");
assert.match(sourceBetween(rendererSource, "setViewOptions(options", "setVisualTheme"), /refreshCellSurface\(\{draw: false\}\)/, "平滑开关必须先刷新同源 surface depth");
assert.match(sourceBetween(rendererSource, "refreshHeightCells(gridCells", "refreshLabels()"), /rebuildShoreVisualCache\(\)[\s\S]{0,120}?refreshCellSurface/, "岸线变化必须同步刷新最终 surface depth");
const pickingRoute = {id: 909, type: "road", points: [[100, 100], [300, 100], [300, 300]]};
const pickingMap = {metadata: {graphWidth: 500, graphHeight: 500}, settlements: {cities: [], routes: [pickingRoute]}};
let pickingIndex = buildObjectPickingIndex(pickingMap, {components: ["routeSegments"]});
for (const index of [null, pickingIndex]) {
  assert.equal(pickRoute(pickingMap, index, 200, 100, 4)?.id, 909, "有无索引都必须命中 canonical 折线");
  assert.equal(pickRoute(pickingMap, index, 200, 200, 4), null, "端点弦线不得冒充 canonical 折线");
}
pickingRoute.points = [[100, 400], [300, 400]];
pickingIndex = buildObjectPickingIndex(pickingMap, {components: ["routeSegments"]});
for (const index of [null, pickingIndex]) {
  assert.equal(pickRoute(pickingMap, index, 200, 100, 4), null, "重建后旧路径不得继续命中");
  assert.equal(pickRoute(pickingMap, index, 200, 400, 4)?.id, 909, "重建后必须命中新 canonical 路径");
}

console.log(JSON.stringify({
  ok: true,
  routeId: routes.sea.id,
  drawRanges: combined.drawRanges,
  hardTransitions: transitionIndexes(maskedSeaColors(hardSurfaceDepth)),
  smoothTransitions: transitionIndexes(maskedSeaColors(smoothSurfaceDepth)),
  seaWorldWidths: Object.fromEntries(["primary", "secondary", "minor"].map(level => [level, resolveRouteStyle({...routes.sea, level}, theme).worldWidth])),
  canonicalRouteDataUnchanged: true
}, null, 2));

function assertVertexRgb(vertices, range, expected, label) {
  for (let vertex = range.first; vertex < range.first + range.count; vertex++) {
    const offset = vertex * 6 + 2;
    for (let channel = 0; channel < 3; channel++) {
      assert.ok(Math.abs(vertices[offset + channel] - expected[channel]) < 1e-6, `${label} RGB 必须匹配预期`);
    }
  }
}

function assertRangePositionsEqual(vertices, first, second) {
  assert.equal(first.count, second.count);
  for (let index = 0; index < first.count; index++) {
    const firstOffset = (first.first + index) * 6;
    const secondOffset = (second.first + index) * 6;
    assert.equal(vertices[firstOffset], vertices[secondOffset], "海路双色 batch 的 x 必须完全一致");
    assert.equal(vertices[firstOffset + 1], vertices[secondOffset + 1], "海路双色 batch 的 y 必须完全一致");
    assert.ok(Math.abs(vertices[firstOffset + 5] - vertices[secondOffset + 5]) < 1e-6, "海路双色 batch 的逐顶点 alpha 必须完全一致");
  }
}

function createMockGl() {
  const calls = [];
  return {
    calls,
    TRIANGLES: "TRIANGLES",
    DEPTH_TEST: "DEPTH_TEST",
    GREATER: "GREATER",
    LESS: "LESS",
    enable: value => calls.push(["enable", value]),
    disable: value => calls.push(["disable", value]),
    depthMask: value => calls.push(["depthMask", value]),
    depthFunc: value => calls.push(["depthFunc", value]),
    drawArrays: (...args) => calls.push(["drawArrays", ...args])
  };
}

function maskedSeaColors(surfaceDepths, selectedRoute = false) {
  return surfaceDepths.map(surfaceDepth => {
    if (selectedRoute) return "selected";
    if (0.5 > surfaceDepth) return "land";
    if (0.5 < surfaceDepth) return "sea";
    return "none";
  });
}

function transitionIndexes(values) {
  return values.flatMap((value, index) => index > 0 && value !== values[index - 1] ? [index] : []);
}

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `无法读取源码片段：${start}`);
  return source.slice(startIndex, endIndex);
}
