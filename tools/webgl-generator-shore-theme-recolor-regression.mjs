#!/usr/bin/env node
import assert from "node:assert/strict";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {createRenderContext} from "../app/webgl-generator/src/renderer/render-context.js";
import {buildShoreSurfaceVertexLayers, buildShoreVisualPaths, recolorShoreSurfaceVertexLayers} from "../app/webgl-generator/src/renderer/shore-layer.js";
import {resolveVisualTheme} from "../app/webgl-generator/src/renderer/themes.js";

const map = generatePlaceholderMap({seed: "shore-theme-recolor-complex", cellsTarget: 10000, heightmapTemplate: "continents"});
const context = createRenderContext(map);
const paths = buildShoreVisualPaths(map);
const options = {showOceanHeight: true, smoothCellBorders: true, visualTheme: resolveVisualTheme("default")};
const source = buildShoreSurfaceVertexLayers(context, "states", options, paths);
const targetOptions = {...options, visualTheme: resolveVisualTheme("ancient")};
let yields = 0;
const recolored = await recolorShoreSurfaceVertexLayers(source, map, "states", targetOptions, {budgetMs: 1, yieldToMain: async () => { yields++; }});
assert.ok(recolored, "既有海岸修正面缺少完整 cell 范围，不能安全复用形状");
const expected = buildShoreSurfaceVertexLayers(context, "states", targetOptions, paths);
const counts = {};
for (const key of ["landCorrections", "waterCorrections", "landCovers", "waterCovers"]) {
  const actual = recolored[key];
  const baseline = expected[key];
  assert.equal(actual.length, baseline.length, `${key} 的顶点数改变`);
  for (let index = 0; index < actual.length; index++) {
    assert.equal(actual[index], baseline[index], `${key} 第 ${index} 个顶点属性与完整重建不同`);
  }
  counts[key] = actual.length / 6;
}
assert.ok(Object.values(counts).some(value => value > 0), "复合场景没有海岸修正面");
assert.ok(yields > 0, "重着色没有按预算让出主线程");
console.log(JSON.stringify({ok: true, gridCells: map.grid.cells.i.length, counts, yields}));
