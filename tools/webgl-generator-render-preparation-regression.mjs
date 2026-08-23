#!/usr/bin/env node
import assert from "node:assert/strict";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {
  buildLineVertices,
  buildPlaceholderSurfaceBundle,
  buildPlaceholderSurfaceColorPatch,
  buildPointLayer,
  buildPointVertices,
  buildRiverMeshVertices,
  buildRouteMeshVertices
} from "../app/webgl-generator/src/renderer/placeholder-renderer.js";
import {buildLabelLayoutDescriptors, unpackLabelLayoutDescriptors} from "../app/webgl-generator/src/renderer/label-layout-descriptor.js";
import {buildCellVisualMesh, summarizeCellVisualMesh} from "../app/webgl-generator/src/renderer/cell-visual-layer.js";
import {buildShoreVisualPaths, summarizeShoreVisualPaths} from "../app/webgl-generator/src/renderer/shore-layer.js";
import {
  PROVINCE_VISUAL_STYLE,
  STATE_VISUAL_STYLE,
  buildPoliticalVisualMeshCache,
  buildProvinceVisualPaths,
  buildStateVisualPaths,
  summarizePoliticalVisualMeshes,
  summarizePoliticalVisualPaths
} from "../app/webgl-generator/src/renderer/political-layer.js";
import {
  packCellVisualMesh,
  packPoliticalVisualPaths,
  packShoreVisualPaths,
  unpackCellVisualMesh,
  unpackCellVisualMeshInChunks,
  unpackPoliticalVisualPaths,
  unpackShoreVisualPaths
} from "../app/webgl-generator/src/renderer/render-cache-dto.js";
import {buildObjectPickingIndex, OBJECT_PICKING_COMPONENTS, pickCity, pickRiver, pickRoute} from "../app/webgl-generator/src/renderer/picking.js";
import {buildObjectPickingDto, rebindObjectPickingDto, rebindObjectPickingDtoInChunks, rebuildObjectPickingIndexFromDto} from "../app/webgl-generator/src/renderer/picking-dto.js";
import {applyPreparedPickingComponents} from "../app/webgl-generator/src/renderer/prepared-render-installer.js";
import {createWorkerTaskCoordinator} from "../app/webgl-generator/src/runtime/worker-task-coordinator.js";
import {
  assertRenderPreparationBinding,
  collectRenderPreparationTransfers,
  executeRenderPreparationTask,
  rebindShoreLinePathCache,
  renderPreparationLayersForRegeneration,
  renderPreparationPickingComponentsForRegeneration
} from "../app/webgl-generator/src/renderer/render-preparation.js";
import {createRenderResourceBinding} from "../app/webgl-generator/src/renderer/render-resource-binding.js";

const cellsTarget = Number(process.argv.slice(2).find(value => /^\d+$/u.test(value)) || 10000);
const full = process.argv.includes("--full");
const map = generatePlaceholderMap({seed: "task322-render-preparation", cellsTarget, graphWidth: 1440, graphHeight: 960});
const binding = createRenderResourceBinding({mapIdentity: `render-${cellsTarget}`, mapRevision: 7, topologyRevision: 3}, {
  renderPreparationId: `render-preparation:${cellsTarget}:1`,
  renderGeneration: 4
});
const camera = {scale: 1, offsetX: 0, offsetY: 0};
const canvas = {width: 1440, height: 960, clientWidth: 1440, clientHeight: 960};
const visibility = {};
const visualTheme = {};
const checkpoints = [];

assert.deepEqual(renderPreparationPickingComponentsForRegeneration("routes"), ["cities", "routeSegments"]);
assert.deepEqual(renderPreparationPickingComponentsForRegeneration("rivers"), ["riverSegments"]);
assert.deepEqual(renderPreparationPickingComponentsForRegeneration("markers"), ["markers"]);
assert.deepEqual(renderPreparationPickingComponentsForRegeneration("military"), ["military"]);
assert.deepEqual(renderPreparationPickingComponentsForRegeneration("military-policy"), ["military"]);
assert.deepEqual(renderPreparationPickingComponentsForRegeneration("population"), ["cities"]);
assert.deepEqual(renderPreparationPickingComponentsForRegeneration("economy"), ["cities"]);
assert.deepEqual(renderPreparationPickingComponentsForRegeneration("culture-expansion"), ["cities"]);
assert.deepEqual(renderPreparationPickingComponentsForRegeneration("religion-expansion"), ["cities"]);
assert.deepEqual(renderPreparationPickingComponentsForRegeneration("zones"), []);
for (const kind of ["height-derived", "climate-downstream", "ocean-current-world", "grid-topology"]) {
  assert.deepEqual(
    renderPreparationPickingComponentsForRegeneration(kind),
    [...OBJECT_PICKING_COMPONENTS],
    `${kind} 完整地图派生任务必须准备全部 picking 对象族`
  );
}
assert.throws(
  () => renderPreparationPickingComponentsForRegeneration("unknown-composite"),
  error => error?.code === "render-regeneration-kind-unsupported",
  "未知复合任务不得静默退回全量 picking"
);
assert.equal(renderPreparationLayersForRegeneration("zones").includes("picking"), false, "地区重生成不应重建无关对象 picking");
assert.deepEqual(
  renderPreparationLayersForRegeneration("provinces", {
    colorMode: "states",
    visibility: {provinceBorders: false},
    viewOptions: {smoothCellBorders: true},
    hasCellVisual: true
  }),
  ["province-paths", "point", "labels", "route", "picking"],
  "省份重生成不得准备当前画面不消费的 state/political/surface/line"
);
assert.deepEqual(
  renderPreparationLayersForRegeneration("provinces", {
    colorMode: "provinces",
    visibility: {provinceBorders: true},
    viewOptions: {smoothCellBorders: true},
    hasCellVisual: true
  }),
  ["province-paths", "surface", "line", "point", "labels", "route", "picking"],
  "省份视图必须保留颜色与边界更新"
);
assert.ok(
  renderPreparationLayersForRegeneration("provinces", {
    politicalMeshDebugMode: "provinces",
    viewOptions: {smoothCellBorders: true},
    hasCellVisual: true
  }).includes("political"),
  "政治网格调试开启时不得复用旧政治 mesh"
);

const expected = {
  route: buildRouteMeshVertices(map, camera, canvas, null, [], visualTheme),
  river: buildRiverMeshVertices(map, camera, canvas),
  point: buildPointLayer(map)
};
const actual = await executeRenderPreparationTask({map, binding, camera, canvas, visibility, visualTheme}, {
  checkpoint: value => checkpoints.push(value)
});

assertRenderPreparationBinding(actual, binding);
assert.deepEqual(actual.layers.route.drawRanges, expected.route.drawRanges);
assert.deepEqual(actual.layers.route.stats, expected.route.stats);
assert.deepEqual(actual.layers.river.stats, expected.river.stats);
assert.deepEqual(actual.layers.point.drawRanges, expected.point.drawRanges, "point draw ranges 必须与稳定点层同源");
for (const layer of ["route", "river", "point"]) {
  assert.ok(actual.layers[layer].vertices instanceof Float32Array, `${layer} 必须输出 Float32Array`);
  assert.equal(actual.layers[layer].vertices.length, expected[layer].vertices.length, `${layer} 顶点长度必须一致`);
  assert.equal(byteChecksum(actual.layers[layer].vertices), byteChecksum(expected[layer].vertices), `${layer} 字节指纹必须一致`);
}
assert.notEqual(actual.layers.point.vertices.length / 6 % 3, 0, "固定夹具必须覆盖 GL_POINTS 顶点数不是三的倍数的合法正例");
assert.equal(checkpoints.length, 3, "每个渲染准备阶段必须提供取消检查点");
assert.doesNotThrow(() => structuredClone(actual), "渲染准备结果必须可 structured clone");
const transfers = collectRenderPreparationTransfers(actual);
assert.equal(transfers.length, 3, "route / river / point 各自只应暴露一个可 transfer buffer");
assert.equal(new Set(transfers).size, transfers.length, "transfer list 不得包含重复 buffer");
assertNoFormalMapBuffers(transfers, map);
assert.throws(() => assertRenderPreparationBinding(actual, nextResourceBinding(binding, {mapRevision: 8, renderPreparationId: "stale-revision"})), error => error?.code === "render-result-stale");
assert.throws(() => assertRenderPreparationBinding(actual, nextResourceBinding(binding, {topologyRevision: 4, renderPreparationId: "stale-topology"})), error => error?.code === "render-result-stale");
for (const incomplete of [
  {mapIdentity: binding.mapIdentity, mapRevision: binding.mapRevision, topologyRevision: binding.topologyRevision},
  {...binding, renderPreparationId: null},
  {...binding, renderGeneration: null},
  {...binding, topologyRevision: null}
]) {
  await assert.rejects(
    executeRenderPreparationTask({map, binding: incomplete, camera, canvas, layers: ["point"]}),
    error => error?.code === "render-resource-binding-invalid",
    "不完整或 null resource binding 必须在 Worker 渲染准备入口拒绝"
  );
}

const retainedRenderCache = Object.create(null);
const firstSurface = await executeRenderPreparationTask({map, binding, camera, canvas, layers: ["surface"]}, {renderCache: retainedRenderCache});
const retainedRefs = Object.fromEntries(["cellVisual", "shore", "statePaths", "provincePaths"].map(key => [key, retainedRenderCache[key]]));
const presentationBinding = nextResourceBinding(binding, {renderPreparationId: `render-preparation:${cellsTarget}:2`});
const secondSurface = await executeRenderPreparationTask({map, binding: presentationBinding, camera, canvas, colorMode: "states", layers: ["surface"]}, {renderCache: retainedRenderCache});
assert.equal(firstSurface.cache.reused, false, "同 revision 首次 surface 准备不得虚报复用");
assert.equal(secondSurface.cache.reused, true, "同 revision 第二次 surface 准备必须复用渲染几何缓存");
for (const [key, value] of Object.entries(retainedRefs)) assert.equal(retainedRenderCache[key], value, `同 revision 不得重建 ${key}`);
const shorePrewarm = await executeRenderPreparationTask({
  map,
  binding: presentationBinding,
  camera,
  canvas,
  viewOptions: {smoothCellBorders: true},
  gpuShoreSurfaceModes: ["height", "states", "provinces"],
  layers: ["gpu-shore-surface"]
}, {renderCache: retainedRenderCache});
assert.deepEqual(shorePrewarm.layers.gpuShoreSurface.entries.map(entry => entry.mode), ["height", "states", "provinces"]);
for (const entry of shorePrewarm.layers.gpuShoreSurface.entries) {
  assert.ok(entry.key && entry.landCorrections instanceof Float32Array && entry.waterCorrections instanceof Float32Array, `${entry.mode} 岸线预热结构无效`);
  assert.equal("base" in entry, false, `${entry.mode} 岸线预热不得生成完整 surface`);
}
assert.ok(collectRenderPreparationTransfers(shorePrewarm).length >= 4, "岸线预热结果必须 transfer typed arrays");
const expectedOceanPatch = buildPlaceholderSurfaceColorPatch(
  map,
  "height",
  {showOceanHeight: true, smoothCellBorders: true},
  retainedRenderCache.shore,
  retainedRenderCache.cellVisual,
  "water"
);
const emergencyFirstVisual = {
  ...retainedRenderCache.cellVisual,
  cells: [retainedRenderCache.cellVisual.cells.at(-1), ...retainedRenderCache.cellVisual.cells.slice(0, -1)]
};
const orderedEmergencyPatch = buildPlaceholderSurfaceColorPatch(
  map,
  "states",
  {smoothCellBorders: true},
  retainedRenderCache.shore,
  emergencyFirstVisual,
  "all"
);
assert.ok(orderedEmergencyPatch.cellIds.every((cell, index, cells) => index === 0 || cells[index - 1] < cell), "emergency-first geometry 的颜色补丁仍须按 cell ID 严格递增");
const oceanPatch = await executeRenderPreparationTask({
  map,
  binding,
  camera,
  canvas,
  colorMode: "height",
  viewOptions: {showOceanHeight: true, smoothCellBorders: true},
  surfacePatchScope: "water",
  layers: ["surface"]
}, {renderCache: retainedRenderCache});
assert.equal(oceanPatch.layers.surface.mode, "cell-colors");
assert.equal(oceanPatch.layers.surface.scope, "water");
assert.deepEqual(oceanPatch.layers.surface.cellIds, expectedOceanPatch.cellIds);
assert.equal(byteChecksum(oceanPatch.layers.surface.colors), byteChecksum(expectedOceanPatch.colors));
assert.ok(oceanPatch.layers.surface.cellIds.length > 0 && oceanPatch.layers.surface.cellIds.length < map.grid.cells.i.length, "海底补丁必须只覆盖水域 cell");
assert.ok(oceanPatch.layers.surface.cellIds.every(cell => Number(map.grid.cells.h[cell]) < 20), "海底补丁不得包含陆地 cell");
assert.equal("base" in oceanPatch.layers.surface, false, "surface color patch 不得回传完整 base geometry");
assert.ok(collectRenderPreparationTransfers(oceanPatch).some(buffer => buffer === oceanPatch.layers.surface.colors.buffer), "surface color patch colors 必须可 transfer");
const topologyBinding = nextResourceBinding(binding, {
  topologyRevision: binding.topologyRevision + 1,
  renderPreparationId: `render-preparation:${cellsTarget}:topology`
});
const nextTopologySurface = await executeRenderPreparationTask({map, binding: topologyBinding, camera, canvas, colorMode: "states", layers: ["surface"]}, {renderCache: retainedRenderCache});
assert.equal(nextTopologySurface.cache.reused, false, "topology revision 变化必须拒绝旧渲染几何缓存");
assert.ok(Object.entries(retainedRefs).every(([key, value]) => retainedRenderCache[key] !== value), "topology revision 变化必须重建全部地图绑定缓存");
const topologyRefs = Object.fromEntries(["cellVisual", "shore", "statePaths", "provincePaths"].map(key => [key, retainedRenderCache[key]]));
const nextBinding = nextResourceBinding(topologyBinding, {
  mapRevision: binding.mapRevision + 1,
  renderPreparationId: `render-preparation:${cellsTarget}:revision`
});
const nextRevisionSurface = await executeRenderPreparationTask({map, binding: nextBinding, camera, canvas, colorMode: "provinces", layers: ["surface"]}, {renderCache: retainedRenderCache});
assert.equal(nextRevisionSurface.cache.reused, false, "revision 变化必须拒绝旧渲染几何缓存");
assert.ok(Object.entries(topologyRefs).every(([key, value]) => retainedRenderCache[key] !== value), "revision 变化必须重建全部地图绑定缓存");

const aborted = new AbortController();
aborted.abort();
await assert.rejects(
  executeRenderPreparationTask({map, binding, camera, canvas, layers: ["route"]}, {signal: aborted.signal}),
  error => error?.code === "render-preparation-aborted"
);

let cacheSummary = null;
if (full) cacheSummary = await verifyPackedCaches();
const pickingSummary = await verifyPickingDto();
const labelSummary = await verifyLabelDescriptors();
const coordinatorSummary = await verifyCoordinatorFallback();

console.log(JSON.stringify({
  ok: true,
  cellsTarget,
  actualCells: map.grid?.cells?.h?.length || 0,
  layers: Object.fromEntries(Object.entries(actual.layers).map(([key, value]) => [key, {
    floats: value.vertices.length,
    bytes: value.vertices.byteLength,
    checksum: byteChecksum(value.vertices)
  }])),
  routeDrawRanges: actual.layers.route.drawRanges,
  transfers: transfers.length,
  retainedRenderCache: {first: firstSurface.cache, second: secondSurface.cache, nextTopology: nextTopologySurface.cache, nextRevision: nextRevisionSurface.cache},
  oceanPatch: {cells: oceanPatch.layers.surface.cellIds.length, bytes: oceanPatch.layers.surface.colors.byteLength, checksum: byteChecksum(oceanPatch.layers.surface.colors)},
  shorePrewarm: {modes: shorePrewarm.layers.gpuShoreSurface.entries.map(entry => entry.mode), transfers: collectRenderPreparationTransfers(shorePrewarm).length},
  cacheSummary,
  pickingSummary,
  labelSummary,
  coordinatorSummary
}, null, 2));

function nextResourceBinding(source, overrides = {}) {
  const mapIdentity = overrides.mapIdentity ?? source.mapIdentity;
  const mapRevision = overrides.mapRevision ?? source.sourceRevision ?? source.mapRevision;
  const topologyRevision = overrides.topologyRevision ?? source.topologyRevision;
  return createRenderResourceBinding({mapIdentity, mapRevision, topologyRevision}, {
    renderPreparationId: overrides.renderPreparationId ?? source.renderPreparationId,
    renderGeneration: overrides.renderGeneration ?? source.renderGeneration
  });
}

async function verifyCoordinatorFallback() {
  const progress = [];
  const fallback = [];
  const coordinator = createWorkerTaskCoordinator({
    createWorker: () => null,
    getBinding: () => binding,
    validateBinding: current => current?.mapIdentity === binding.mapIdentity && current?.mapRevision === binding.mapRevision,
    onProgress: (stage, detail) => progress.push({stage, detail}),
    onFallback: value => fallback.push(value)
  });
  const result = await coordinator.run("render.prepare", {map, camera, canvas, layers: ["route"]}, {forceFallback: true});
  assert.deepEqual(result.binding, binding, "协调器 binding 必须传入 render handler");
  assert.equal(result.worker.mode, "fallback");
  assert.equal(byteChecksum(result.layers.route.vertices), byteChecksum(expected.route.vertices));
  assert.deepEqual(result.layers.route.drawRanges, expected.route.drawRanges);
  assert.equal(progress.at(-1)?.stage, "render-prepare");
  assert.equal(fallback.length, 1);
  return {mode: result.worker.mode, progressStages: progress.map(item => item.stage), checksum: byteChecksum(result.layers.route.vertices)};
}

async function verifyLabelDescriptors() {
  const expected = buildLabelLayoutDescriptors(map, {labelOptions: {maxCityLabels: 128}, visualTheme});
  const prepared = await executeRenderPreparationTask({
    map,
    binding,
    visualTheme,
    labelOptions: {maxCityLabels: 128},
    layers: ["labels"]
  });
  const actualDto = prepared.layers.labels;
  assert.equal(actualDto.count, expected.count);
  for (const key of ["numeric", "kindIndexes", "idTypes", "styleIndexes", "flags", "componentCellOffsets", "componentCells"]) {
    assertTypedFingerprint(actualDto[key], expected[key], `labels.${key}`);
  }
  assert.deepEqual(actualDto.kindTable, expected.kindTable);
  assert.deepEqual(actualDto.ids, expected.ids);
  assert.deepEqual(actualDto.texts, expected.texts);
  assert.deepEqual(actualDto.styleTypes, expected.styleTypes);
  assert.deepEqual(actualDto.styleTable, expected.styleTable);
  const items = unpackLabelLayoutDescriptors(structuredClone(actualDto), map);
  assert.equal(items.length, actualDto.count);
  assert.ok(items.every(item => Number.isFinite(item.x) && Number.isFinite(item.y) && Number.isFinite(item.metrics.width) && Number.isFinite(item.metrics.height)));
  assert.ok(items.filter(item => item.targetKind === "city").every(item => item.city === map.settlements.cities[item.targetId]), "标签 DTO 必须在主线程重绑正式 city 对象");
  assert.ok(items.filter(item => item.targetKind === "state").every(item => item.state === map.politics.states[item.targetId]), "标签 DTO 必须在主线程重绑正式 state 对象");
  assert.ok(items.filter(item => item.targetKind === "province").every(item => item.province === map.politics.provinces[item.targetId]), "标签 DTO 必须在主线程重绑正式 province 对象");
  const malformedCount = structuredClone(actualDto);
  malformedCount.count = 0;
  assert.throws(
    () => unpackLabelLayoutDescriptors(malformedCount, map),
    error => error?.code === "label-descriptor-shape",
    "标签 count 与并行数组不一致时必须在回绑前拒绝"
  );
  assert.equal("city" in actualDto, false);
  assert.equal("state" in actualDto, false);
  assert.equal("province" in actualDto, false);
  return {
    count: actualDto.count,
    kinds: Object.fromEntries(actualDto.kindTable.map(kind => [kind, items.filter(item => item.targetKind === kind).length])),
    styleCount: actualDto.styleTable.length,
    componentCells: actualDto.componentCells.length,
    transferBuffers: collectRenderPreparationTransfers(actualDto).length
  };
}

async function verifyPickingDto() {
  const expectedIndex = buildObjectPickingIndex(map);
  const dto = buildObjectPickingDto(map, binding);
  const rebound = rebindObjectPickingDto(structuredClone(dto), map, binding);
  let chunkYields = 0;
  const reboundAsync = await rebindObjectPickingDtoInChunks(structuredClone(dto), map, binding, {
    chunkUnits: 32,
    yieldToMain: async () => { chunkYields++; }
  });
  const partialComponents = ["cities", "routeSegments"];
  const partialDto = buildObjectPickingDto(map, binding, partialComponents);
  const partial = rebindObjectPickingDto(structuredClone(partialDto), map, binding);
  const partialDirect = rebuildObjectPickingIndexFromDto(structuredClone(partialDto), map, binding);
  assert.deepEqual(partial.components, partialComponents);
  assert.deepEqual(partialDirect.components, partialComponents);
  assert.equal(partialDirect.buckets.size, partial.buckets.size);
  assert.equal(partialDirect.cityCount, partial.cityCount);
  assert.equal(partialDirect.routeSegmentCount, partial.routeSegmentCount);
  assert.equal(partial.markerCount, 0);
  assert.equal(partial.militaryCount, 0);
  assert.equal(partial.riverSegmentCount, 0);
  const current = buildObjectPickingIndex(map);
  const beforeBuckets = new Map([...current.buckets].map(([key, bucket]) => [key, {
    cities: bucket.cities,
    markers: bucket.markers,
    military: bucket.military,
    routeSegments: bucket.routeSegments,
    riverSegments: bucket.riverSegments
  }]));
  const beforeStats = Object.fromEntries(["bucketCount", "cityCount", "markerCount", "militaryCount", "routeSegmentCount", "riverSegmentCount", "maxBucketItems"].map(key => [key, current[key]]));
  const partialMutation = applyPreparedPickingComponents(current, partial, partialComponents);
  assert.equal(current.cityCount, partial.cityCount);
  assert.equal(current.routeSegmentCount, partial.routeSegmentCount);
  assert.equal(current.markerCount, beforeStats.markerCount);
  assert.equal(current.militaryCount, beforeStats.militaryCount);
  assert.equal(current.riverSegmentCount, beforeStats.riverSegmentCount);
  for (const [key, before] of beforeBuckets) {
    const bucket = current.buckets.get(key);
    assert.equal(bucket.markers, before.markers, `partial picking bucket ${key} 改写了 marker 引用`);
    assert.equal(bucket.military, before.military, `partial picking bucket ${key} 改写了 military 引用`);
    assert.equal(bucket.riverSegments, before.riverSegments, `partial picking bucket ${key} 改写了 river 引用`);
  }
  partialMutation.rollback();
  assert.deepEqual(Object.fromEntries(Object.keys(beforeStats).map(key => [key, current[key]])), beforeStats);
  for (const [key, before] of beforeBuckets) {
    const bucket = current.buckets.get(key);
    for (const component of ["cities", "markers", "military", "routeSegments", "riverSegments"]) {
      assert.equal(bucket[component], before[component], `partial picking rollback 没有恢复 ${key}/${component}`);
    }
  }
  const duplicateComponents = structuredClone(partialDto);
  duplicateComponents.components.push("cities");
  assert.throws(() => rebindObjectPickingDto(duplicateComponents, map, binding), error => error?.code === "picking-dto-shape");
  assert.throws(() => rebuildObjectPickingIndexFromDto(duplicateComponents, map, binding), error => error?.code === "picking-dto-shape");
  const mismatchedStats = structuredClone(partialDto);
  mismatchedStats.stats.routeSegmentCount++;
  assert.throws(() => rebuildObjectPickingIndexFromDto(mismatchedStats, map, binding), error => error?.code === "picking-dto-shape");
  for (const key of ["bucketSize", "columns", "rows", "bucketCount", "cityCount", "markerCount", "militaryCount", "routeSegmentCount", "riverSegmentCount", "maxBucketItems"]) {
    assert.equal(rebound[key], expectedIndex[key], `picking ${key} 必须一致`);
  }
  assert.equal(rebound.buckets.size, expectedIndex.buckets.size);
  assert.equal(reboundAsync.buckets.size, expectedIndex.buckets.size);
  assert.ok(chunkYields > 0, "picking 回绑必须支持预算式让出主线程");
  const pickingAbort = new AbortController();
  await assert.rejects(
    rebindObjectPickingDtoInChunks(structuredClone(dto), map, binding, {
      signal: pickingAbort.signal,
      chunkUnits: 1,
      yieldToMain: async () => pickingAbort.abort("picking abort fixture")
    }),
    error => error?.code === "picking-rebind-aborted"
  );
  const malformedOffsets = structuredClone(dto);
  const malformedOffsetIndex = malformedOffsets.routeSegments.offsets.length - 1;
  malformedOffsets.routeSegments.offsets[malformedOffsetIndex]--;
  assert.throws(
    () => rebindObjectPickingDto(malformedOffsets, map, binding),
    error => error?.code === "picking-dto-shape",
    "picking terminal offset 截短时必须在对象回绑前拒绝"
  );
  await assert.rejects(
    rebindObjectPickingDtoInChunks(malformedOffsets, map, binding, {yieldToMain: async () => {}}),
    error => error?.code === "picking-dto-shape",
    "分片 picking 回绑不得绕过 terminal offset 校验"
  );
  const malformedIndex = structuredClone(dto);
  malformedIndex.routeSegments.idIndexes[0] = malformedIndex.routeSegments.idTable.length;
  await assert.rejects(
    rebindObjectPickingDtoInChunks(malformedIndex, map, binding, {yieldToMain: async () => {}}),
    error => error?.code === "picking-dto-shape",
    "分片 picking 回绑不得绕过引用索引校验"
  );
  const largeReferenceCount = 500_000;
  const largeCity = map.settlements.cities.find(Boolean);
  const largeBucketDto = {
    schemaVersion: dto.schemaVersion,
    binding: structuredClone(dto.binding),
    components: ["cities"],
    bucketSize: dto.bucketSize,
    columns: 1,
    rows: 1,
    bucketIds: Uint32Array.of(0),
    cities: {kind: "cities", offsets: Uint32Array.of(0, largeReferenceCount), idTable: [String(largeCity.id)], idIndexes: new Uint32Array(largeReferenceCount)},
    markers: {kind: "markers", offsets: Uint32Array.of(0, 0), idTable: [], idIndexes: new Uint32Array()},
    military: {kind: "military", offsets: Uint32Array.of(0, 0), idTable: [], idIndexes: new Uint32Array()},
    routeSegments: {kind: "route", offsets: Uint32Array.of(0, 0), idTable: [], idIndexes: new Uint32Array(), segments: new Int32Array()},
    riverSegments: {kind: "river", offsets: Uint32Array.of(0, 0), idTable: [], idIndexes: new Uint32Array(), segments: new Int32Array()},
    stats: {bucketCount: 1, cityCount: largeReferenceCount, markerCount: 0, militaryCount: 0, routeSegmentCount: 0, riverSegmentCount: 0, maxBucketItems: largeReferenceCount}
  };
  let largeBucketYields = 0;
  let largeBucketMaxSliceMs = 0;
  let largeBucketSliceStartedAt = performance.now();
  const largeBucketRebound = await rebindObjectPickingDtoInChunks(largeBucketDto, map, binding, {
    budgetMs: 1,
    yieldToMain: async () => {
      largeBucketMaxSliceMs = Math.max(largeBucketMaxSliceMs, performance.now() - largeBucketSliceStartedAt);
      largeBucketYields++;
      await new Promise(resolve => setImmediate(resolve));
      largeBucketSliceStartedAt = performance.now();
    }
  });
  largeBucketMaxSliceMs = Math.max(largeBucketMaxSliceMs, performance.now() - largeBucketSliceStartedAt);
  assert.ok(largeBucketYields > 0, "单 bucket 大引用集必须在 bucket 内让出主线程");
  assert.ok(largeBucketMaxSliceMs < 50, `单 bucket picking 回绑同步切片超预算：${largeBucketMaxSliceMs.toFixed(1)}ms`);
  assert.equal(largeBucketRebound.cityCount, largeReferenceCount);
  assert.equal(largeBucketRebound.buckets.get(0).cities.length, largeReferenceCount);
  for (const [bucketId, expectedBucket] of expectedIndex.buckets) {
    const actualBucket = rebound.buckets.get(bucketId);
    assert.ok(actualBucket, `picking bucket ${bucketId} 必须存在`);
    for (const key of ["cities", "markers", "military", "routeSegments", "riverSegments"]) {
      assert.equal(actualBucket[key].length, expectedBucket[key].length, `picking bucket ${bucketId}/${key} 引用数必须一致`);
    }
  }
  const route = map.settlements.routes.find(item => item?.points?.length > 1);
  const river = map.rivers.rivers.find(item => item?.points?.length > 1);
  const city = map.settlements.cities.find(Boolean);
  const routePoint = midpoint(route.points[0], route.points[1]);
  const riverPoint = midpoint(river.points[0], river.points[1]);
  assert.deepEqual(
    pickRoute(map, rebound, routePoint[0], routePoint[1], 2),
    pickRoute(map, expectedIndex, routePoint[0], routePoint[1], 2),
    "route picking 重绑结果必须一致"
  );
  assert.deepEqual(
    pickRiver(map, rebound, riverPoint[0], riverPoint[1], 2),
    pickRiver(map, expectedIndex, riverPoint[0], riverPoint[1], 2),
    "river picking 重绑结果必须一致"
  );
  assert.deepEqual(
    pickCity(map, rebound, city.x, city.y, 2),
    pickCity(map, expectedIndex, city.x, city.y, 2),
    "city picking 重绑结果必须一致"
  );
  assert.equal("buckets" in dto, false, "DTO 不得携带对象引用 Map");
  assert.equal(JSON.stringify(dto).includes('"points"'), false, "DTO 不得复制 route / river 几何点");
  return {
    buckets: dto.bucketIds.length,
    routeSegments: dto.stats.routeSegmentCount,
    riverSegments: dto.stats.riverSegmentCount,
    referenceEntries: dto.cities.idIndexes.length + dto.markers.idIndexes.length + dto.military.idIndexes.length + dto.routeSegments.idIndexes.length + dto.riverSegments.idIndexes.length,
    transferBuffers: collectRenderPreparationTransfers(dto).length
  };
}

async function verifyPackedCaches() {
  const cellVisual = buildCellVisualMesh(map);
  const shore = buildShoreVisualPaths(map);
  const statePaths = buildStateVisualPaths(map);
  const provincePaths = buildProvinceVisualPaths(map);
  const political = {
    states: buildPoliticalVisualMeshCache(map, "state", statePaths, shore, STATE_VISUAL_STYLE),
    provinces: buildPoliticalVisualMeshCache(map, "province", provincePaths, shore, PROVINCE_VISUAL_STYLE)
  };
  const caches = {
    cellVisual: packCellVisualMesh(cellVisual, binding),
    shore: packShoreVisualPaths(shore, binding),
    statePaths: packPoliticalVisualPaths(statePaths, binding, "state"),
    provincePaths: packPoliticalVisualPaths(provincePaths, binding, "province")
  };
  const unpacked = {
    cellVisual: unpackCellVisualMesh(caches.cellVisual, binding),
    shore: unpackShoreVisualPaths(caches.shore, binding),
    statePaths: unpackPoliticalVisualPaths(caches.statePaths, binding),
    provincePaths: unpackPoliticalVisualPaths(caches.provincePaths, binding)
  };
  let unpackYields = 0;
  const asyncCellVisual = await unpackCellVisualMeshInChunks(caches.cellVisual, binding, {
    chunkUnits: 512,
    yieldToMain: async () => { unpackYields++; }
  });
  assert.deepEqual(summarizeCellVisualMesh(asyncCellVisual), summarizeCellVisualMesh(cellVisual));
  assert.ok(unpackYields > 0, "10000 cells 缓存解包必须支持预算式让出主线程");
  assert.ok(unpackYields < 100, "cell visual 解包让步过碎");
  const unpackAbort = new AbortController();
  await assert.rejects(
    unpackCellVisualMeshInChunks(caches.cellVisual, binding, {
      signal: unpackAbort.signal,
      chunkUnits: 1,
      yieldToMain: async () => unpackAbort.abort("cell unpack abort fixture")
    }),
    error => error?.code === "render-cache-unpack-aborted"
  );
  assert.deepEqual(summarizeCellVisualMesh(unpacked.cellVisual), summarizeCellVisualMesh(cellVisual));
  assert.deepEqual(summarizeShoreVisualPaths(unpacked.shore), summarizeShoreVisualPaths(shore));
  assert.deepEqual(summarizePoliticalVisualPaths(unpacked.statePaths, STATE_VISUAL_STYLE), summarizePoliticalVisualPaths(statePaths, STATE_VISUAL_STYLE));
  assert.deepEqual(summarizePoliticalVisualPaths(unpacked.provincePaths, PROVINCE_VISUAL_STYLE), summarizePoliticalVisualPaths(provincePaths, PROVINCE_VISUAL_STYLE));

  const expectedSurface = buildPlaceholderSurfaceBundle(map, "height", {}, shore, statePaths, provincePaths, political, cellVisual);
  const expectedLine = buildLineVertices(map, visibility, "height", shore, statePaths, provincePaths, cellVisual, {});
  const prepared = await executeRenderPreparationTask({
    map,
    binding,
    camera,
    canvas,
    colorMode: "height",
    visibility,
    unitPreferences: {numberAbbreviation: "none", militaryScale: 2},
    politicalMeshDebugMode: "states",
    caches,
    layers: ["political", "surface", "line"]
  });
  for (const field of ["states", "provinces"]) {
    assertTypedFingerprint(prepared.layers.political[field].vertices, political[field].vertices, `political.${field}.vertices`);
    assertTypedFingerprint(prepared.layers.political[field].surfaceVertices, political[field].surfaceVertices, `political.${field}.surfaceVertices`);
    for (const key of ["field", "groups", "pointCount", "candidateTriangles", "keptTriangles", "rejectedTriangles", "longEdgeFilteredTriangles", "skinnyFilteredTriangles", "sampleFilteredTriangles", "skippedGroups", "vertexCount"]) {
      assert.deepEqual(prepared.layers.political[field][key], political[field][key], `political.${field}.${key} 必须一致`);
    }
  }
  assert.equal(prepared.presentation.politicalMeshDebugMode, "states");
  assert.equal(prepared.presentation.unitPreferences.numberAbbreviation, "none");
  assert.equal(prepared.presentation.unitPreferences.militaryScale, 2);
  assertTypedFingerprint(prepared.layers.politicalDebug.vertices, political.states.vertices, "politicalDebug.states.vertices");
  for (const key of ["base", "landCorrections", "waterCorrections", "landCovers", "waterCovers"]) {
    assertTypedFingerprint(prepared.layers.surface[key], expectedSurface[key], `surface.${key}`);
  }
  for (const key of ["vertices", "shoreVertices", "oceanCurrentVertices"]) {
    assertTypedFingerprint(prepared.layers.line[key], expectedLine[key], `line.${key}`);
  }
  assert.deepEqual(prepared.layers.line.oceanCurrents, expectedLine.oceanCurrents);
  const reboundShoreCache = rebindShoreLinePathCache(prepared.layers.line.shorePathCache, unpacked.shore, binding);
  assert.equal(reboundShoreCache.pathVertices.size, expectedLine.shoreLinePathVertices.size, "岸线路径稳定键缓存数量必须一致");
  for (const [key, expectedVertices] of expectedLine.shoreLinePathVertices) {
    assertTypedFingerprint(reboundShoreCache.pathVertices.get(key), expectedVertices, `line.shorePathCache.${key}`);
  }
  for (const [featureType, paths] of [["coastline", unpacked.shore.coastline], ["lakeShore", unpacked.shore.lakeShore]]) {
    for (const path of paths || []) {
      const rebound = reboundShoreCache.pathObjectVertices.get(path);
      assert.ok(rebound instanceof Float32Array, `${featureType} 岸线路径对象必须回绑顶点视图`);
      assert.ok(reboundShoreCache.pathVertices.has([...reboundShoreCache.pathVertices].find(([, vertices]) => vertices === rebound)?.[0]), `${featureType} 岸线路径对象必须回绑到稳定缓存视图`);
    }
  }
  assert.throws(
    () => rebindShoreLinePathCache(prepared.layers.line.shorePathCache, unpacked.shore, {...binding, mapRevision: binding.mapRevision + 1}),
    error => error?.code === "render-result-stale"
  );
  assertNoFormalMapBuffers(collectRenderPreparationTransfers(prepared), map);
  assert.doesNotThrow(() => structuredClone(caches));
  assert.throws(
    () => unpackShoreVisualPaths(caches.shore, {...binding, mapRevision: binding.mapRevision + 1}),
    error => error?.code === "render-cache-stale"
  );
  const malformedShore = structuredClone(caches.shore);
  malformedShore.coastline.pathCount = 0;
  assert.throws(
    () => unpackShoreVisualPaths(malformedShore, binding),
    error => error?.code === "render-cache-shape",
    "shore pathCount 与 offset 数量不一致时必须在解包前拒绝"
  );
  const malformedPolitical = structuredClone(caches.statePaths);
  if (malformedPolitical.pointOffsets.length > 1) malformedPolitical.sideOffsets[1]++;
  assert.throws(
    () => unpackPoliticalVisualPaths(malformedPolitical, binding),
    error => error?.code === "render-cache-shape",
    "political 并行 path offset 不一致时必须在解包前拒绝"
  );
  const cellSummary = summarizeCellVisualMesh(cellVisual);
  const shoreSummary = summarizeShoreVisualPaths(shore);
  const stateSummary = summarizePoliticalVisualPaths(statePaths, STATE_VISUAL_STYLE);
  const provinceSummary = summarizePoliticalVisualPaths(provincePaths, PROVINCE_VISUAL_STYLE);
  const politicalSummary = summarizePoliticalVisualMeshes(political);
  return {
    cellVisual: pickFields(cellSummary, ["cellCount", "boundaryPoints", "triangleCount", "triangulationRetriedCells", "triangulationHardFallbackCells", "edgeCurveCount", "shoreEdgeCount"]),
    shore: {
      ...pickFields(shoreSummary, ["coastlinePaths", "lakeShorePaths", "coastlinePoints", "lakeShorePoints"]),
      topology: pickFields(shoreSummary.topology, ["arcCount", "renderPointCount", "fallbackArcCount", "locallyFallbackArcCount"])
    },
    statePaths: pickFields(stateSummary, ["paths", "points"]),
    provincePaths: pickFields(provinceSummary, ["paths", "points"]),
    political: {
      states: pickFields(politicalSummary.states, ["groups", "pointCount", "vertexCount", "keptTriangles", "rejectedTriangles"]),
      provinces: pickFields(politicalSummary.provinces, ["groups", "pointCount", "vertexCount", "keptTriangles", "rejectedTriangles"])
    },
    surfaceFloats: Object.values(prepared.layers.surface).reduce((sum, value) => sum + (value?.length || 0), 0),
    lineFloats: prepared.layers.line.vertices.length + prepared.layers.line.shoreVertices.length + prepared.layers.line.oceanCurrentVertices.length
  };
}

function pickFields(source, keys) {
  return Object.fromEntries(keys.map(key => [key, source?.[key]]));
}

function assertTypedFingerprint(actualView, expectedView, label) {
  assert.ok(ArrayBuffer.isView(actualView), `${label} 必须为 typed array`);
  assert.equal(actualView.constructor, expectedView.constructor, `${label} 类型必须一致`);
  assert.equal(actualView.length, expectedView.length, `${label} 长度必须一致`);
  assert.equal(byteChecksum(actualView), byteChecksum(expectedView), `${label} 字节指纹必须一致`);
}

function midpoint(a, b) {
  return [(Number(a?.[0]) + Number(b?.[0])) / 2, (Number(a?.[1]) + Number(b?.[1])) / 2];
}

function assertNoFormalMapBuffers(resultBuffers, formalMap) {
  const mapBuffers = new Set(collectRenderPreparationTransfers(formalMap));
  assert.equal(resultBuffers.some(buffer => mapBuffers.has(buffer)), false, "渲染返回 transfer list 不得包含正式地图仍持有的 typed array buffer");
}

function byteChecksum(view) {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  let hash = 2166136261;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
