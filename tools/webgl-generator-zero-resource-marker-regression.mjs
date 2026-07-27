#!/usr/bin/env node
import assert from "node:assert/strict";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {
  createRegenerateResourceMarkersCommand,
  regenerateResourceMarkersInChunks
} from "../app/webgl-generator/src/runtime/marker-edit-commands.js";

const base = generatePlaceholderMap({
  seed: "zero-resource-marker-regression",
  cellsTarget: 3000,
  heightmapTemplate: "continents"
});

const commandMap = withoutResourceMarkers(base);
const command = createRegenerateResourceMarkersCommand({salt: 41});
assert.equal(command.isNoop({map: commandMap}), false, "零资源地图被错误判为 command no-op");
command.apply({map: commandMap});
const commandResources = resourceMarkers(commandMap);
assert.ok(commandResources.length > 0, "command 未从零生成默认资源点");

const chunkMap = withoutResourceMarkers(base);
const execution = await regenerateResourceMarkersInChunks(chunkMap, {salt: 42});
assert.equal(execution.executed, true, "零资源地图被错误判为 chunk no-op");
const chunkResources = resourceMarkers(chunkMap);
assert.ok(chunkResources.length > 0, "chunk 未从零生成默认资源点");
assert.ok(execution.timings.chunks.some(chunk => chunk.id === "generate-resources"), "chunk 缺少资源生成阶段");

console.log(JSON.stringify({
  ok: true,
  commandResources: commandResources.length,
  chunkResources: chunkResources.length,
  chunks: execution.timings.chunks.map(chunk => chunk.id)
}, null, 2));

function withoutResourceMarkers(source) {
  const map = structuredClone(source);
  const markers = (map.markers?.markers || []).filter(marker => marker?.category !== "resource");
  map.markers.markers = markers;
  map.pack.markers = markers;
  map.markers.metadata = {
    ...(map.markers.metadata || {}),
    markers: markers.length,
    resourceMarkers: 0,
    resourcePotential: 0
  };
  return map;
}

function resourceMarkers(map) {
  return (map.markers?.markers || []).filter(marker => marker?.category === "resource");
}
