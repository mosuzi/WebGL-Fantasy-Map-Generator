import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {buildGrid} from "../app/webgl-generator/src/generator/grid.js";
import {getMapTemplateManifest, listMapTemplateManifests} from "../app/webgl-generator/src/generator/map-template-catalog.js";
import {
  applyMapTemplateGridEvidence,
  createMapTemplateHeightmap,
  projectTemplateCoordinate,
  unprojectTemplatePoint
} from "../app/webgl-generator/src/generator/map-template-mapping.js";
import {parseMapTemplatePhysicalResource} from "../app/webgl-generator/src/generator/map-template-physical-resource.js";
import {createRandom} from "../app/webgl-generator/src/generator/random.js";
import {runGenerationWorkerTask} from "../app/webgl-generator/src/runtime/generation-worker-task.js";

const resourceRoot = new URL("../app/webgl-generator/public/assets/map-templates/", import.meta.url);
const metadata = JSON.parse(await readFile(new URL("world-physical-2026-v1.json", resourceRoot), "utf8"));
const bytes = await readFile(new URL("world-physical-2026-v1.bin", resourceRoot));
const resource = parseMapTemplatePhysicalResource(metadata, bytes);
const manifests = listMapTemplateManifests();
const summaries = [];

for (const manifest of manifests) {
  for (const cellsTarget of [1, 10_000, 100_000]) {
    const options = {seed: `mapping-${manifest.id}`, salt: 7, cellsTarget, graphWidth: 180, graphHeight: 120};
    const first = createMapTemplateHeightmap(options, manifest, resource);
    const second = createMapTemplateHeightmap(options, manifest, resource);
    assert.equal(first.source.semanticChecksum, second.source.semanticChecksum, `${manifest.id}/${cellsTarget} 映射必须确定`);
    assert.equal(first.source.resourceChecksum, metadata.sha256);
    assert.equal(first.source.requestedCells, cellsTarget);
    assert.ok(first.source.mapCoordinates.latN > first.source.mapCoordinates.latS);
    assert.ok(first.source.mapCoordinates.lonT > 0 && first.source.mapCoordinates.lonT <= 360);
    if (cellsTarget === 1) assert.ok(first.source.degradedAnchors.length >= first.source.protectedAnchors.length);
    if (cellsTarget === 10_000) assertProtectedAnchors(first, manifest, options);
    summaries.push(`${manifest.id}:${cellsTarget}:${first.source.semanticChecksum}`);
  }
}

const world = getMapTemplateManifest("world");
for (const coordinate of [[0, 0], [121, 23.7], [-74, 40.7], [18, -34]]) {
  const point = projectTemplateCoordinate(world, coordinate[0], coordinate[1], 720, 360);
  const restored = unprojectTemplatePoint(world, point.x, point.y, 720, 360);
  assert.ok(Math.abs(restored.longitude - coordinate[0]) < 1e-6);
  assert.ok(Math.abs(restored.latitude - coordinate[1]) < 1e-6);
}

const antarctica = getMapTemplateManifest("antarctica");
assert.equal(unprojectTemplatePoint(antarctica, 0, 0, 180, 120), null, "南极投影画布角落应在区域掩膜外");
const pole = unprojectTemplatePoint(antarctica, 90, 60, 180, 120);
assert.ok(Math.abs(pole.latitude + 90) < 1e-9);

const china = getMapTemplateManifest("china");
const gridOptions = {seed: "mapping-grid", cellsTarget: 1_000, graphWidth: 180, graphHeight: 120};
const chinaHeightmap = createMapTemplateHeightmap(gridOptions, china, resource);
const grid = buildGrid(gridOptions, createRandom(gridOptions.seed), chinaHeightmap, createRandom(gridOptions.seed));
const evidence = applyMapTemplateGridEvidence(grid, chinaHeightmap);
assert.equal(evidence.id, "china");
assert.ok(evidence.regionCells > 900, "中国区域掩膜应覆盖主体网格");
assert.ok(evidence.hydrologyCells > 0, "中国映射应包含 canonical 水文证据");
assert.equal(grid.cells.templateHydrology.length, grid.points.length);
assert.equal(grid.cells.templateRegion.length, grid.points.length);
assert.equal(applyMapTemplateGridEvidence(grid, {source: {kind: "other"}}), null);

const workerResult = await runGenerationWorkerTask({
  options: {...gridOptions, statesNumber: 8, provincesRatio: 30, religionsNumber: 3, culturesNumber: 6},
  mapTemplate: {manifest: china, resource}
}, {checkpoint: () => true});
assert.equal(workerResult.map.metadata.mapTemplate.id, "china");
assert.equal(workerResult.map.metadata.mapTemplate.humanPreset, null);
assert.equal(workerResult.map.metadata.mapTemplate.sourceChecksum, metadata.sha256);
assert.equal(workerResult.map.mapCoordinates.latN, china.bounds.north);
assert.equal(workerResult.map.mapCoordinates.latS, china.bounds.south);
assert.ok(workerResult.map.grid.metadata.mapTemplate.hydrologyCells > 0);
assert.equal(workerResult.map.grid.metadata.mapTemplate.politicalCells, 0);
assert.ok(workerResult.map.rivers.metadata.rivers > 0);

console.log(JSON.stringify({
  ok: true,
  templates: manifests.length,
  cases: summaries.length,
  resource: metadata.sha256,
  chinaEvidence: evidence,
  worker: {cells: workerResult.map.grid.points.length, rivers: workerResult.map.rivers.metadata.rivers}
}));

function assertProtectedAnchors(heightmap, manifest, options) {
  for (const anchor of manifest.protectedAnchors) {
    if (["continuity", "extent", "sea", "historical-region", "historical-capital"].includes(anchor.kind)) continue;
    const point = projectTemplateCoordinate(manifest, anchor.longitude, anchor.latitude, options.graphWidth, options.graphHeight);
    assert.ok(point, `${manifest.id}/${anchor.id} 应位于画布内`);
    assert.ok(heightmap.sampleHeight([point.x, point.y]) >= 20, `${manifest.id}/${anchor.id} 应保留为陆地锚点`);
    assert.ok(heightmap.source.protectedAnchors.includes(anchor.id));
  }
}
