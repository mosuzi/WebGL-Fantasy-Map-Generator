import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  PROVINCE_VISUAL_STYLE,
  STATE_VISUAL_STYLE,
  pushPoliticalBoundaryStrokes
} from "../app/webgl-generator/src/renderer/political-layer.js";
import {pushWorldPolylineMesh} from "../app/webgl-generator/src/renderer/mesh-writer.js";

const context = {map: {metadata: {graphWidth: 10, graphHeight: 10}}};
const color = [0.4, 0.3, 0.2, 0.5];
const straightPath = {boundaries: [{points: [[0, 5], [10, 5]]}]};

assert.deepEqual(PROVINCE_VISUAL_STYLE.borderDashWorld, {dashWorld: 2, gapWorld: 2}, "省界必须使用 2 / 2 世界单位的高频短虚线");
assert.equal(STATE_VISUAL_STYLE.borderDashWorld, undefined, "国界不得继承省界虚线节奏");

const provinceVertices = [];
pushPoliticalBoundaryStrokes(
  provinceVertices,
  straightPath,
  context,
  color,
  PROVINCE_VISUAL_STYLE.borderWidthWorld,
  PROVINCE_VISUAL_STYLE.borderDashWorld
);
assert.equal(provinceVertices.length / 6, 18, "10 单位省界必须生成 3 段短划线，而不是连续实线");

const stateVertices = [];
pushPoliticalBoundaryStrokes(stateVertices, straightPath, context, color, STATE_VISUAL_STYLE.borderWidthWorld);
assert.equal(stateVertices.length / 6, 6, "国界必须继续生成单段实线网格");

const invalidDashVertices = [];
pushWorldPolylineMesh(invalidDashVertices, context, straightPath.boundaries[0].points, color, STATE_VISUAL_STYLE.borderWidthWorld, {dashWorld: {}});
assert.ok(invalidDashVertices.length / 6 > stateVertices.length / 6, "无效虚线参数必须回退到包含既有圆角端点的默认实线语义");

const cornerVertices = [];
pushWorldPolylineMesh(cornerVertices, context, [[0, 0], [3, 0], [3, 5]], color, 0.24, {
  joinMode: "none",
  dashWorld: PROVINCE_VISUAL_STYLE.borderDashWorld
});
assert.equal(cornerVertices.length / 6, 12, "虚线相位必须跨折线段连续，不能在每个折点重新起划");
const verticalDashY = [...new Set(vertexPairs(cornerVertices).slice(6).map(([, y]) => round((1 - y) * 5)))].sort((a, b) => a - b);
assert.deepEqual(verticalDashY, [1, 3], "折点后的第一段竖向短划线必须从累计相位 1 延续到 3");

const closedVertices = [];
pushWorldPolylineMesh(closedVertices, context, [[1, 1], [4, 1], [4, 4], [1, 4], [1, 1]], color, 0.24, {
  closed: true,
  joinMode: "none",
  dashWorld: PROVINCE_VISUAL_STYLE.borderDashWorld
});
assert.equal(closedVertices.length / 6, 24, "12 单位闭合省界必须保留 3 段累计短划线，并在跨折点处拆分网格");

const meshWriterSource = await readFile(new URL("../app/webgl-generator/src/renderer/mesh-writer.js", import.meta.url), "utf8");
const rendererSource = await readFile(new URL("../app/webgl-generator/src/renderer/placeholder-renderer.js", import.meta.url), "utf8");
assert.match(meshWriterSource, /function pushDashedWorldPolylineMesh[\s\S]{0,2200}?let phase = 0;[\s\S]{0,1800}?phase = \(phase \+ step\) % patternLength;/, "世界虚线必须在整条路径上累计且约束相位");
assert.match(rendererSource, /PROVINCE_VISUAL_STYLE\.borderWidthWorld, PROVINCE_VISUAL_STYLE\.borderDashWorld/, "省界渲染必须显式接入短虚线样式");
assert.match(rendererSource, /STATE_VISUAL_STYLE\.borderWidthWorld\);/, "国界渲染必须继续走无虚线参数的实线路径");

console.log(JSON.stringify({
  ok: true,
  provinceDashWorld: PROVINCE_VISUAL_STYLE.borderDashWorld,
  straightProvinceVertices: provinceVertices.length / 6,
  straightStateVertices: stateVertices.length / 6,
  cornerVertices: cornerVertices.length / 6,
  closedVertices: closedVertices.length / 6
}, null, 2));

function vertexPairs(vertices) {
  const result = [];
  for (let index = 0; index < vertices.length; index += 6) result.push([vertices[index], vertices[index + 1]]);
  return result;
}

function round(value) {
  return Math.round(value * 1e6) / 1e6;
}
