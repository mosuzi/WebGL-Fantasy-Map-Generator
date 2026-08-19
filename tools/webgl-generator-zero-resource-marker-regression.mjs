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
assertResourceEconomy(commandMap, commandResources.length, "command");

const chunkMap = withoutResourceMarkers(base);
const execution = await regenerateResourceMarkersInChunks(chunkMap, {salt: 42});
assert.equal(execution.executed, true, "零资源地图被错误判为 chunk no-op");
const chunkResources = resourceMarkers(chunkMap);
assert.ok(chunkResources.length > 0, "chunk 未从零生成默认资源点");
assert.ok(execution.timings.chunks.some(chunk => chunk.id === "generate-resources"), "chunk 缺少资源生成阶段");
assert.ok(execution.timings.chunks.some(chunk => chunk.id === "resource-economy"), "chunk 缺少资源经济派生阶段");
assert.ok(execution.timings.chunks.some(chunk => chunk.id === "build-economy"), "chunk 缺少经济需求重建阶段");
assertResourceEconomy(chunkMap, chunkResources.length, "chunk");

const failureMap = withoutResourceMarkers(base);
const failureBefore = resourceDomainFingerprint(failureMap);
await assert.rejects(
  regenerateResourceMarkersInChunks(failureMap, {
    salt: 43,
    yieldToMain: async ({id}) => {
      if (id === "resource-economy") throw new Error("resource economy regression failure");
    }
  }),
  /resource economy regression failure/
);
assert.equal(resourceDomainFingerprint(failureMap), failureBefore, "资源经济派生失败未原子恢复 markers / pack / politics / economy");

console.log(JSON.stringify({
  ok: true,
  commandResources: commandResources.length,
  chunkResources: chunkResources.length,
  chunks: execution.timings.chunks.map(chunk => chunk.id),
  packResourceCells: chunkMap.pack.metadata.resourceGoods.markerCells,
  markerResourceDeals: chunkMap.economy.metadata.resourceTrade.markerResourceDeals,
  failureRollback: true
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

function assertResourceEconomy(map, resourceCount, stage) {
  assert.strictEqual(map.pack.markers, map.markers.markers, `${stage} pack / markers 集合未保持同一引用`);
  assert.equal(map.pack.metadata?.resourceGoods?.markerResources, resourceCount, `${stage} pack 资源派生数量错误`);
  assert.equal(map.pack.metadata?.resourceGoods?.hasMarkerSources, true, `${stage} pack 未登记 marker 资源来源`);
  assert.ok(Number(map.pack.metadata?.resourceGoods?.markerCells) > 0, `${stage} pack 未写入资源 cell`);
  assert.equal(map.economy?.metadata?.markerEconomy?.resourceMarkers, resourceCount, `${stage} economy 未接收资源 marker`);
  assert.ok(Number(map.economy?.metadata?.resourceTrade?.markerResourceCells) > 0, `${stage} economy 未生成 marker 资源供给`);
  assert.ok(Number(map.economy?.metadata?.resourceTrade?.markerResourceDeals) > 0, `${stage} economy 未生成 marker 资源交易`);
  assert.ok(Number.isFinite(map.economy?.metadata?.demand?.balance), `${stage} economy demand 未重建`);
}

function resourceDomainFingerprint(map) {
  return JSON.stringify({
    markers: map.markers,
    packMarkers: map.pack.markers,
    cells: {
      good: [...(map.pack.cells.good || [])],
      goodSupply: [...(map.pack.cells.goodSupply || [])],
      goodSource: [...(map.pack.cells.goodSource || [])],
      pop: [...(map.pack.cells.pop || [])]
    },
    metadata: map.pack.metadata,
    goods: map.pack.goods,
    markets: map.pack.markets,
    deals: map.pack.deals,
    burgs: map.pack.burgs,
    states: map.pack.states,
    provinces: map.pack.provinces,
    politics: map.politics,
    economy: map.economy
  });
}
