#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  DEFAULT_POLITICAL_BOUNDARY_SOFTNESS,
  normalizePoliticalBoundarySoftness,
  politicalBoundarySoftnessFactors,
  resolvePoliticalBoundaryStroke
} from "../app/webgl-generator/src/renderer/political-boundary-style.js";
import {STATE_VISUAL_STYLE, pushPoliticalBoundaryStrokes} from "../app/webgl-generator/src/renderer/political-layer.js";
import {createRenderContext} from "../app/webgl-generator/src/renderer/render-context.js";

assert.equal(normalizePoliticalBoundarySoftness(undefined), DEFAULT_POLITICAL_BOUNDARY_SOFTNESS);
assert.equal(normalizePoliticalBoundarySoftness(-4), 0);
assert.equal(normalizePoliticalBoundarySoftness(104), 100);
assert.equal(normalizePoliticalBoundarySoftness(62.6), 63);
assert.deepEqual(politicalBoundarySoftnessFactors(50), {width: 1, alpha: 1});

const clear = resolvePoliticalBoundaryStroke(STATE_VISUAL_STYLE, STATE_VISUAL_STYLE.borderStroke, 0);
const legacy = resolvePoliticalBoundaryStroke(STATE_VISUAL_STYLE, STATE_VISUAL_STYLE.borderStroke, 50);
const hazy = resolvePoliticalBoundaryStroke(STATE_VISUAL_STYLE, STATE_VISUAL_STYLE.borderStroke, 100);
assert.equal(legacy.widthWorld, STATE_VISUAL_STYLE.borderWidthWorld);
assert.deepEqual(legacy.color, [...STATE_VISUAL_STYLE.borderStroke]);
assert.ok(clear.widthWorld > legacy.widthWorld && clear.color[3] > legacy.color[3], "清晰档必须加宽并提高不透明度");
assert.ok(hazy.widthWorld < legacy.widthWorld && hazy.color[3] < legacy.color[3], "朦胧档必须收窄并降低不透明度");

const paths = {boundaries: [{points: [[10, 50], [90, 50]]}]};
const context = createRenderContext({metadata: {graphWidth: 100, graphHeight: 100}});
const clearVertices = [];
const legacyVertices = [];
const hazyVertices = [];
pushPoliticalBoundaryStrokes(clearVertices, paths, context, clear.color, clear.widthWorld);
pushPoliticalBoundaryStrokes(legacyVertices, paths, context, legacy.color, legacy.widthWorld);
pushPoliticalBoundaryStrokes(hazyVertices, paths, context, hazy.color, hazy.widthWorld);
assert.equal(clearVertices.length, legacyVertices.length);
assert.equal(legacyVertices.length, hazyVertices.length);
assert.ok(vertexVerticalSpan(clearVertices) > vertexVerticalSpan(legacyVertices));
assert.ok(vertexVerticalSpan(legacyVertices) > vertexVerticalSpan(hazyVertices));
assert.equal(legacyVertices[5], STATE_VISUAL_STYLE.borderStroke[3]);

console.log(JSON.stringify({
  ok: true,
  defaultSoftness: DEFAULT_POLITICAL_BOUNDARY_SOFTNESS,
  clear: summarize(clear, clearVertices),
  legacy: summarize(legacy, legacyVertices),
  hazy: summarize(hazy, hazyVertices)
}, null, 2));

function vertexVerticalSpan(vertices) {
  const values = [];
  for (let index = 1; index < vertices.length; index += 6) values.push(vertices[index]);
  return Math.max(...values) - Math.min(...values);
}

function summarize(style, vertices) {
  return {
    softness: style.softness,
    widthWorld: Number(style.widthWorld.toFixed(4)),
    alpha: Number(style.color[3].toFixed(4)),
    ndcSpan: Number(vertexVerticalSpan(vertices).toFixed(6))
  };
}
