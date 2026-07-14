#!/usr/bin/env node
import assert from "node:assert/strict";
import {performance} from "node:perf_hooks";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {createMapFeatureGeoJson} from "../app/webgl-generator/src/runtime/map-file-io.js";

const args = parseArgs(process.argv.slice(2));
const cellsTarget = 100000;
const sampleCount = normalizePositiveInteger(args.samples, 3);
const thresholds = {
  maxTotalMs: normalizePositiveNumber(args["max-total-ms"], 1500),
  maxRelative: normalizePositiveNumber(args["max-relative"], 3),
  maxPointRatio: normalizePositiveNumber(args["max-point-ratio"], 0.35),
  maxByteRatio: normalizePositiveNumber(args["max-byte-ratio"], 0.4)
};
const options = {
  seed: "dissolve-perf-100k",
  heightmapTemplate: "continents",
  cellsTarget,
  graphWidth: 1440,
  graphHeight: 960,
  randomSeed: false
};
const layers = {state: true, province: true, city: false, route: false, river: false, marker: false, zone: true};

const generationStarted = performance.now();
const map = generatePlaceholderMap(options);
const generationMs = performance.now() - generationStarted;
assert.equal(map.metadata?.cellsTarget, cellsTarget, "性能门禁必须使用 100000 cells 目标");
assert.ok((map.grid?.points?.length || 0) >= 99000, "性能门禁的实际 grid cells 不得低于 99000");

runExport(map, false, false);
runExport(map, true, false);

const rawSamples = [];
const dissolvedSamples = [];
for (let index = 0; index < sampleCount; index += 1) {
  rawSamples.push(runExport(map, false, true));
  dissolvedSamples.push(runExport(map, true, true));
}

const raw = summarizeSamples(rawSamples);
const dissolved = summarizeSamples(dissolvedSamples);
assert.deepEqual(dissolved.layerCounts, raw.layerCounts, "dissolve 前后各政治图层 feature 数必须一致");
assert.deepEqual(dissolved.featureIds, raw.featureIds, "dissolve 前后 feature 集合必须一致");
assert.equal(dissolved.features, raw.features, "dissolve 前后总 feature 数必须一致");
assert.ok(dissolved.features > 0 && Object.values(dissolved.layerCounts).every(count => count > 0), "state / province / zone 三类图层都必须非空");

const pointRatio = dissolved.points / raw.points;
const byteRatio = dissolved.bytes / raw.bytes;
assert.ok(pointRatio <= thresholds.maxPointRatio, `dissolve 点数比例 ${round(pointRatio)} 超过 ${thresholds.maxPointRatio}`);
assert.ok(byteRatio <= thresholds.maxByteRatio, `dissolve JSON 字节比例 ${round(byteRatio)} 超过 ${thresholds.maxByteRatio}`);
assert.ok(dissolved.totalMs <= thresholds.maxTotalMs, `dissolve 含序列化中位耗时 ${round(dissolved.totalMs)}ms 超过 ${thresholds.maxTotalMs}ms`);
assert.ok(dissolved.totalMs <= raw.totalMs * thresholds.maxRelative, `dissolve 中位耗时超过普通版 ${thresholds.maxRelative} 倍`);

console.log(JSON.stringify({
  ok: true,
  case: options,
  actual: {
    gridCells: map.grid.points.length,
    packCells: map.pack.cells.i.length,
    generationMs: round(generationMs)
  },
  samples: sampleCount,
  raw: publicSummary(raw),
  dissolved: publicSummary(dissolved),
  reduction: {
    pointRatio: round(pointRatio),
    pointReductionPercent: round((1 - pointRatio) * 100),
    byteRatio: round(byteRatio),
    byteReductionPercent: round((1 - byteRatio) * 100)
  },
  thresholds
}, null, 2));

function runExport(currentMap, dissolvePolitical, retainSummary) {
  const started = performance.now();
  const document = createMapFeatureGeoJson(currentMap, {layers, dissolvePolitical});
  const built = performance.now();
  const text = JSON.stringify(document);
  const completed = performance.now();
  const geometry = validateAndSummarize(document, dissolvePolitical);
  if (!retainSummary) return null;
  return {
    ...geometry,
    buildMs: built - started,
    serializeMs: completed - built,
    totalMs: completed - started,
    bytes: Buffer.byteLength(text)
  };
}

function validateAndSummarize(document, dissolved) {
  assert.equal(document.type, "FeatureCollection");
  assert.equal(document.properties?.layerSet, "states-provinces-zones");
  assert.equal(document.properties?.dissolvedPolitical, dissolved);
  assert.equal(document.properties?.coordinateReference, "approximate-equirectangular");
  assertValidBbox(document.bbox, "FeatureCollection.bbox");
  const summary = {
    features: 0,
    polygons: 0,
    rings: 0,
    points: 0,
    layerCounts: {state: 0, province: 0, zone: 0},
    featureIds: []
  };
  for (const feature of document.features || []) {
    assert.equal(feature.type, "Feature");
    assert.ok(Object.hasOwn(summary.layerCounts, feature.properties?.layer), "性能门禁只允许政治面图层");
    assert.equal(feature.properties?.dissolved, dissolved);
    assert.equal(feature.geometry?.type, "MultiPolygon");
    assertValidBbox(feature.bbox, `${feature.id}.bbox`);
    assert.ok(Array.isArray(feature.geometry.coordinates) && feature.geometry.coordinates.length > 0);
    for (const polygon of feature.geometry.coordinates) {
      assert.ok(Array.isArray(polygon) && polygon.length > 0);
      summary.polygons += 1;
      for (const ring of polygon) {
        assert.ok(Array.isArray(ring) && ring.length >= 4, `${feature.id} ring 至少需要 4 点`);
        assert.deepEqual(ring[0], ring.at(-1), `${feature.id} ring 必须闭合`);
        for (const point of ring) {
          assert.ok(Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]), `${feature.id} 坐标必须有限`);
        }
        summary.rings += 1;
        summary.points += ring.length;
      }
    }
    summary.features += 1;
    summary.layerCounts[feature.properties.layer] += 1;
    summary.featureIds.push(String(feature.id));
  }
  summary.featureIds.sort();
  return summary;
}

function summarizeSamples(samples) {
  const first = samples[0];
  for (const sample of samples.slice(1)) {
    assert.equal(sample.features, first.features);
    assert.equal(sample.polygons, first.polygons);
    assert.equal(sample.rings, first.rings);
    assert.equal(sample.points, first.points);
    assert.equal(sample.bytes, first.bytes);
    assert.deepEqual(sample.layerCounts, first.layerCounts);
    assert.deepEqual(sample.featureIds, first.featureIds);
  }
  return {
    ...first,
    buildMs: median(samples.map(sample => sample.buildMs)),
    serializeMs: median(samples.map(sample => sample.serializeMs)),
    totalMs: median(samples.map(sample => sample.totalMs)),
    totalSamplesMs: samples.map(sample => round(sample.totalMs))
  };
}

function publicSummary(summary) {
  return {
    features: summary.features,
    layerCounts: summary.layerCounts,
    polygons: summary.polygons,
    rings: summary.rings,
    points: summary.points,
    bytes: summary.bytes,
    buildMs: round(summary.buildMs),
    serializeMs: round(summary.serializeMs),
    totalMs: round(summary.totalMs),
    totalSamplesMs: summary.totalSamplesMs
  };
}

function assertValidBbox(bbox, label) {
  assert.ok(Array.isArray(bbox) && bbox.length === 4 && bbox.every(Number.isFinite), `${label} 必须是四项有限数组`);
  assert.ok(bbox[0] <= bbox[2] && bbox[1] <= bbox[3], `${label} 范围无效`);
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    result[key] = next && !next.startsWith("--") ? argv[++index] : true;
  }
  return result;
}

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function normalizePositiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
