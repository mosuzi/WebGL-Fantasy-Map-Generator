import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  ROUTE_SELECTION_HALO_CSS_PX,
  createLineWidthProjection,
  projectWorldLineWidth,
  riverWorldWidth,
  routeWorldWidth,
  withProjectedLineAlpha
} from "../app/webgl-generator/src/renderer/line-width-projection.js";
import {pushVariableScreenPolyline} from "../app/webgl-generator/src/renderer/mesh-writer.js";
import {buildRiverMeshVertices} from "../app/webgl-generator/src/renderer/placeholder-renderer.js";
import {createRiverVisualCurveDescriptor} from "../app/webgl-generator/src/geometry/cubic-path.js";

const map = {metadata: {graphWidth: 1000, graphHeight: 600}};
const projection = (scale, dpr = 1) => createLineWidthProjection({
  map,
  camera: {scale},
  canvas: {clientWidth: 1000, clientHeight: 600, width: 1000 * dpr, height: 600 * dpr}
});

const scales = [1, 2, 4].map(scale => projectWorldLineWidth(routeWorldWidth("minor"), projection(scale)));
assert.ok(scales[0].cssWidth < scales[1].cssWidth && scales[1].cssWidth < scales[2].cssWidth, "世界宽度必须随 camera.scale 单调投影");
assert.deepEqual(scales.map(item => item.cssWidth), [0.28, 0.56, 1.12], "scale 1 / 2 / 4 必须按比例投影 CSS 宽度");

assert.deepEqual(
  [routeWorldWidth("primary"), routeWorldWidth("secondary"), routeWorldWidth("minor")],
  [0.75, 0.48, 0.28],
  "道路三级世界宽度必须保持收细后的视觉层级"
);
assert.ok(routeWorldWidth("primary") > routeWorldWidth("secondary"), "primary 道路必须宽于 secondary");
assert.ok(routeWorldWidth("secondary") > routeWorldWidth("minor"), "secondary 道路必须宽于 minor");
const fitMinor = projectWorldLineWidth(routeWorldWidth("minor"), projection(0.5));
assert.ok(fitMinor.cssWidth < 1.1, "基础道路不得保留固定 CSS 最小宽度");
assert.equal(fitMinor.lod, "faint");
assert.ok(fitMinor.alpha > 0 && fitMinor.alpha < 1, "亚像素道路必须使用连续透明度");

const upstreamWorld = riverWorldWidth({flux: 8, pointIndex: 0, widthFactor: 1, sourceWidth: 0.05});
const downstreamWorld = riverWorldWidth({flux: 1800, pointIndex: 12, widthFactor: 1, sourceWidth: 0.05});
assert.ok(upstreamWorld < downstreamWorld, "河流上游世界宽度必须小于下游");
assert.ok(riverWorldWidth({flux: 1800, pointIndex: 12, widthFactor: 1.6, sourceWidth: 0.05}) > downstreamWorld, "widthFactor 必须继续影响河流宽度");
assert.ok(riverWorldWidth({flux: 8, pointIndex: 0, widthFactor: 1, sourceWidth: 0.12}) > upstreamWorld, "sourceWidth 必须继续影响河源宽度");
const upstreamProjected = projectWorldLineWidth(upstreamWorld, projection(1));
assert.ok(upstreamProjected.cssWidth < 1.1, "基础河流不得保留 1.1 CSS px floor");
const downstreamProjected = projectWorldLineWidth(downstreamWorld, projection(1));
assert.ok(downstreamProjected.cssWidth >= 1, "下游样本必须覆盖完整透明度分支");

const riverColor = [0.18, 0.48, 0.72, 0.86];
const riverPointColors = [
  withProjectedLineAlpha(riverColor, upstreamProjected.alpha),
  withProjectedLineAlpha(riverColor, downstreamProjected.alpha)
];
const riverMeshVertices = [];
pushVariableScreenPolyline(
  riverMeshVertices,
  {
    map,
    camera: {scale: 1, offsetX: 0, offsetY: 0},
    canvas: {clientWidth: 1000, clientHeight: 600, width: 1000, height: 600}
  },
  [[100, 180], [900, 420]],
  [upstreamProjected.backingWidth, downstreamProjected.backingWidth],
  riverColor,
  riverPointColors
);
assert.equal(riverMeshVertices.length, 36, "两点变量宽度河流必须写入两个三角形");
assert.ok(riverMeshVertices[5] < riverMeshVertices[11], "真实 mesh 上游顶点 alpha 必须小于下游顶点");
assert.equal(riverMeshVertices[11], riverColor[3], ">=1px 下游顶点必须保留原河色 alpha");

const singleColorVertices = [];
pushVariableScreenPolyline(
  singleColorVertices,
  {map, camera: {scale: 1, offsetX: 0, offsetY: 0}, canvas: {width: 1000, height: 600}},
  [[100, 180], [900, 420]],
  [1, 2],
  riverColor
);
for (let offset = 5; offset < singleColorVertices.length; offset += 6) {
  assert.equal(singleColorVertices[offset], riverColor[3], "不传逐点 colors 时必须保持单色调用兼容");
}

const dpr1 = projectWorldLineWidth(routeWorldWidth("primary"), projection(2, 1));
const dpr2 = projectWorldLineWidth(routeWorldWidth("primary"), projection(2, 2));
assert.equal(dpr1.cssWidth, dpr2.cssWidth, "DPR 不得改变 CSS 语义宽度");
assert.equal(dpr2.backingWidth, dpr1.backingWidth * 2, "DPR 只应改变 backing 宽度");
const cachedProjection = createLineWidthProjection({
  map,
  camera: {scale: 2},
  canvas: {
    get width() { throw new Error("不得读取 live canvas.width"); },
    get height() { throw new Error("不得读取 live canvas.height"); },
    get clientWidth() { throw new Error("不得读取 live canvas.clientWidth"); },
    get clientHeight() { throw new Error("不得读取 live canvas.clientHeight"); }
  },
  canvasSize: {width: 2000, height: 1200, cssWidth: 1000, cssHeight: 600, pixelRatio: 2}
});
assert.deepEqual(cachedProjection, projection(2, 2), "缓存 canvas size 改变了线宽投影语义");

for (const scale of [1, 2, 4]) {
  const base = projectWorldLineWidth(routeWorldWidth("secondary"), projection(scale));
  const selected = projectWorldLineWidth(routeWorldWidth("secondary"), projection(scale), {haloCssPx: ROUTE_SELECTION_HALO_CSS_PX});
  assert.ok(Math.abs(selected.cssWidth - base.cssWidth - 2.4) < 1e-9, "选中路线 halo 必须保持固定屏幕宽度");
  assert.equal(selected.alpha, 1, "选中路线 halo 不得被基础层亚像素透明度削弱");
}

const rendererSource = await readFile(new URL("../app/webgl-generator/src/renderer/placeholder-renderer.js", import.meta.url), "utf8");
const pickingSource = await readFile(new URL("../app/webgl-generator/src/renderer/picking.js", import.meta.url), "utf8");
const selectionSource = await readFile(new URL("../app/webgl-generator/src/renderer/selection-layer.js", import.meta.url), "utf8");
const pngSource = await readFile(new URL("../app/webgl-generator/src/runtime/map-file-io.js", import.meta.url), "utf8");

assert.match(rendererSource, /createLineWidthProjection\(\{map, camera, canvas\}\)/, "道路与河流 build context 必须共用世界宽度投影");
assert.match(rendererSource, /cityIconLayer\.draw\(\{[\s\S]{0,300}?canvasSize: this\.canvasSize/u, "正式 draw 没有向城镇层传入缓存 canvas size");
assert.match(rendererSource, /createLineWidthProjection\(\{map: this\.map, camera: this\.camera, canvas: this\.canvas, canvasSize: this\.canvasSize\}\)/u, "正式 draw 尾部仍依赖 live canvas 尺寸");
assert.equal(countMatches(rendererSource, /createRouteMeshBuild\(/g), 3, "同步 / 异步道路 builder 必须共用 createRouteMeshBuild");
assert.equal(countMatches(rendererSource, /createRiverMeshBuild\(/g), 3, "同步 / 异步河流 builder 必须共用 createRiverMeshBuild");
assert.doesNotMatch(rendererSource, /width:\s*3\.6|width:\s*2\.6|width:\s*1\.8/, "renderer 不得保留固定 CSS 道路宽度");
assert.doesNotMatch(rendererSource, /clamp\(sourceLikeWidth \* 6 \+ 1\.1, 1\.1, 9\.5\)/, "renderer 不得保留河流 1.1px floor");
assert.match(rendererSource, /haloCssPx: ROUTE_SELECTION_HALO_CSS_PX/, "选中路线必须叠加固定 CSS halo");
assert.match(rendererSource, /pushVariableScreenPolyline\(build\.vertices, build\.context, points, widths, color, colors\)/, "河流必须把逐点颜色传入河面");
assert.match(rendererSource, /withProjectedLineAlpha\(color, projected\.alpha\)/, "透明度必须来自平滑和岸宽限制后的实际河宽");
assert.match(rendererSource, /minWorldWidth:[\s\S]{0,500}?minCssWidth:[\s\S]{0,500}?lod:/, "渲染统计必须包含 world / CSS 宽度与 LOD");
assert.match(rendererSource, /pickRoute\([\s\S]{0,160}?pickThresholdWorld\(7\)/, "路线 picking 必须保留 7px 屏幕容差");
assert.match(rendererSource, /pickRiver\([\s\S]{0,160}?pickThresholdWorld\(9\)/, "河流 picking 必须保留 9px 屏幕容差");
assert.match(pickingSource, /export function pickRoute\([\s\S]{0,700}?distance > maxDistance/, "路线 picking 必须继续使用独立 maxDistance");
assert.match(pickingSource, /export function pickRiver\([\s\S]{0,700}?distance > maxDistance/, "河流 picking 必须继续使用独立 maxDistance");
assert.match(selectionSource, /\[OBJECT_KIND\.RIVER\]: "river screen-space mesh"/, "河流高亮必须继续使用独立屏幕 mesh");
assert.match(selectionSource, /const widthPx = \(4\.2 \+ fluxFactor \* 2\.4\) \* pixelRatio/, "河流高亮屏幕宽度不得随基础层投影改变");

for (const functionName of ["buildRouteMeshVerticesAsync", "buildRiverMeshVerticesAsync"]) {
  const source = sourceBetween(rendererSource, `async function ${functionName}`, "return finalize");
  assert.match(source, /await yieldToBrowser\(\)[\s\S]{0,160}?if \(!shouldContinue\(\)\)/, `${functionName} 必须保留 yield 后取消检查`);
}
assert.match(rendererSource, /const camera = snapshotCamera\(this\.camera\)[\s\S]{0,500}?buildRouteMeshVerticesAsync/, "异步道路构建必须使用 camera snapshot");
assert.match(rendererSource, /const camera = snapshotCamera\(this\.camera\)[\s\S]{0,300}?buildRiverMeshVerticesAsync/, "异步河流构建必须使用 camera snapshot");
assert.match(pngSource, /markViewportBuffersDirty\?\.\(\)[\s\S]{0,120}?draw\(\{updateDynamicBuffers: true, updateOverlay: true\}\)/, "PNG 世界范围必须复用 dirty + draw 动态线层路径");
assert.match(pngSource, /function copyWebglCanvasTo2d[\s\S]{0,400}?renderer\.draw\(\{drawCityIcons: includeCityIcons\}\)/, "PNG 像素读取前必须复用 renderer.draw 并保留城镇实例导出选项");

// Several broad channels crossing a very narrow highland would each drown it
// if only average spacing, source height or single-river coverage were tested.
const channel = {points: [[10, 2, 8000], [10, 18, 8000]], cells: [0], sourceWidth: 4, widthFactor: 3};
const narrow = {
  metadata: {graphWidth: 20, graphHeight: 20},
  grid: {metadata: {spacing: 4}, cells: {v: [[0, 1, 2, 3]], h: [96]},
    vertices: {p: [[9.98, 6], [10.02, 6], [10.02, 14], [9.98, 14]]}},
  pack: {cells: {}},
  rivers: {rivers: [{...channel, id: 1}, {...channel, id: 2},
    {...channel, id: 3, visualCurve: createRiverVisualCurveDescriptor(),
      points: [[10, 3, 8000], [10, 13, 8000], [10, 13, 8000], [10.01, 4, 8000]]}]}
};
for (const [scale, dpr, height] of [[0.5, 1, 200], [8, 1, 200], [8, 2, 200], [2, 2, 100]]) {
  const mesh = buildRiverMeshVertices(narrow, {scale, offsetX: 0, offsetY: 0},
    {width: 200 * dpr, height: height * dpr, clientWidth: 200, clientHeight: height});
  assert.equal(mesh.stats.rivers, 3, "高地仍允许下切河谷");
  let area = 0;
  for (let i = 0; i < mesh.vertices.length; i += 18) {
    let poly = [0, 6, 12].map(j => [10 + mesh.vertices[i+j] * 10 / scale, 10 - mesh.vertices[i+j+1] * 10 / scale]);
    for (const [axis, limit, direction] of [[0, 9.98, 1], [0, 10.02, -1], [1, 6, 1], [1, 14, -1]]) {
      poly = poly.flatMap((b, n, ring) => {
        const a = ring[(n + ring.length - 1) % ring.length];
        const insideA = direction * (a[axis] - limit) >= 0, insideB = direction * (b[axis] - limit) >= 0;
        if (insideA === insideB) return insideB ? [b] : [];
        const t = (limit - a[axis]) / (b[axis] - a[axis]);
        const cross = a.map((v, j) => v + (b[j] - v) * t);
        return insideB ? [cross, b] : [cross];
      });
    }
    area += Math.abs(poly.reduce((sum, a, n) => {
      const b = poly[(n + 1) % poly.length]; return sum + a[0] * b[1] - a[1] * b[0];
    }, 0)) / 2;
  }
  assert.ok(area > 0 && area <= 0.45 * 0.04 * 8 + 1e-5, `河面覆盖高地超限 ${area}`);
}

console.log(JSON.stringify({
  ok: true,
  scales: scales.map(item => item.cssWidth),
  routeWorldWidths: {primary: routeWorldWidth("primary"), secondary: routeWorldWidth("secondary"), minor: routeWorldWidth("minor")},
  riverWorldWidths: {upstream: upstreamWorld, downstream: downstreamWorld},
  dpr: {css: dpr2.cssWidth, backing: dpr2.backingWidth},
  selectedHaloCssPx: ROUTE_SELECTION_HALO_CSS_PX
}, null, 2));

function countMatches(value, pattern) {
  return [...value.matchAll(pattern)].length;
}

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `无法读取源码片段：${start}`);
  return source.slice(startIndex, endIndex);
}
