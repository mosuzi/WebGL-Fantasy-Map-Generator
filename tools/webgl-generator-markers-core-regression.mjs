#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createServer} from "vite";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {markerPresentationRecords} from "../app/webgl-generator/src/domains/markers/presentation.js";
import {buildPointLayer} from "../app/webgl-generator/src/renderer/placeholder-renderer.js";
import {buildObjectPickingIndex, pickMarker} from "../app/webgl-generator/src/renderer/picking.js";
import {buildObjectPickingDto, rebuildObjectPickingIndexFromDto} from "../app/webgl-generator/src/renderer/picking-dto.js";
import {createRenderResourceBinding} from "../app/webgl-generator/src/renderer/render-resource-binding.js";
import {createMapFeatureGeoJson} from "../app/webgl-generator/src/runtime/map-file-io.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vite = await createServer({configFile: false, root: path.join(repoRoot, "app/webgl-generator"), server: {middlewareMode: true}, appType: "custom", logLevel: "error"});

try {
  const {createMarkersPresentationRuntime} = await vite.ssrLoadModule("/src/domains/markers/runtime.ts");
  const {markersManifest} = await vite.ssrLoadModule("/src/domains/markers/manifest.ts");
  const map = generatePlaceholderMap({seed: "markers-core", cellsTarget: 1000});
  const canonical = markerPresentationRecords(map);
  assert.ok(canonical.length > 0, "marker fixture 为空");
  let revisionReads = 0;
  const runtime = createMarkersPresentationRuntime({
    getMap: () => map,
    getLegacyRevision: () => ({mapIdentity: "markers-session", mapRevision: 7, topologyRevision: 2 + revisionReads++ * 0}),
    getHistoryFingerprint: () => "markers-history-stable"
  });

  const snapshot = runtime.list();
  assert.equal(snapshot.length, canonical.length);
  assert.deepEqual(snapshot.map(marker => marker.id), canonical.map(marker => marker.id));
  assert.throws(() => { snapshot[0].name = "外部篡改"; }, TypeError);
  assert.notEqual(runtime.get(snapshot[0].id).name, "外部篡改");
  assert.deepEqual(runtime.snapshot(), {operations: 0, commits: 0, lastCommitId: null});

  const point = buildPointLayer(map);
  const markerPointCount = point.drawRanges.filter(range => range.layer === "markers" || range.layer === "resources").reduce((sum, range) => sum + range.count, 0);
  assert.equal(markerPointCount, canonical.length, "point layer 与 marker presentation 数量漂移");

  const target = canonical[0];
  const picking = buildObjectPickingIndex(map, {components: ["markers"]});
  assert.equal(picking.markerCount, canonical.length);
  assert.equal(pickMarker(map, picking, target.x, target.y, 0.01)?.id, target.id);
  const binding = createRenderResourceBinding(
    {mapIdentity: "markers-session", mapRevision: 7, topologyRevision: 2},
    {renderPreparationId: "markers-core:7", renderGeneration: 1}
  );
  const dto = buildObjectPickingDto(map, binding, ["markers"]);
  const rebound = rebuildObjectPickingIndexFromDto(structuredClone(dto), map, binding);
  assert.equal(pickMarker(map, rebound, target.x, target.y, 0.01)?.id, target.id, "picking DTO 回绑 identity 漂移");

  const geoJson = createMapFeatureGeoJson(map, {layers: {marker: true}});
  const markerFeatures = geoJson.features.filter(feature => feature.properties?.layer === "marker");
  assert.equal(markerFeatures.length, canonical.length);
  assert.deepEqual(markerFeatures.map(feature => feature.properties.id), canonical.map(marker => marker.id));

  assert.equal(markersManifest.status, "shadow", "command owner 未完整接管前不得虚报 active");
  assert.equal(markersManifest.capabilities.renderLayer, "required");
  assert.equal(markersManifest.capabilities.worker, "required");
  assert.equal(markersManifest.capabilities.regeneration, "required");

  const sourceFiles = [
    "app/webgl-generator/src/renderer/placeholder-renderer.js",
    "app/webgl-generator/src/renderer/picking.js",
    "app/webgl-generator/src/renderer/picking-dto.js",
    "app/webgl-generator/src/runtime/map-file-io.js"
  ];
  for (const file of sourceFiles) assert.match(await readFile(path.join(repoRoot, file), "utf8"), /markerPresentation(?:Records|Count)/u, `${file} 未接入共享 marker presentation source`);
  const appSource = await readFile(path.join(repoRoot, "app/webgl-generator/src/runtime/app.js"), "utf8");
  const panelSource = await readFile(path.join(repoRoot, "app/webgl-generator/src/ui/panels/marker-panel.js"), "utf8");
  assert.match(appSource, /createMarkersPresentationRuntime/u);
  assert.match(appSource, /listMarkers: \(\) => state\.markersDomain/u);
  assert.match(panelSource, /callbacks\.listMarkers/u);

  console.log(JSON.stringify({ok: true, status: markersManifest.status, markers: canonical.length, pointVertices: markerPointCount, picking: picking.markerCount, dto: dto.stats.markerCount, exported: markerFeatures.length, coreOperations: runtime.snapshot().operations, browserRuns: 0}, null, 2));
} finally {
  await vite.close();
}
