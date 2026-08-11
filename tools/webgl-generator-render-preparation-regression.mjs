#!/usr/bin/env node
import assert from "node:assert/strict";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {
  buildLineVertices,
  buildPlaceholderSurfaceBundle,
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
import {buildObjectPickingIndex, pickCity, pickRiver, pickRoute} from "../app/webgl-generator/src/renderer/picking.js";
import {buildObjectPickingDto, rebindObjectPickingDto, rebindObjectPickingDtoInChunks} from "../app/webgl-generator/src/renderer/picking-dto.js";
import {createWorkerTaskCoordinator} from "../app/webgl-generator/src/runtime/worker-task-coordinator.js";
import {
  assertRenderPreparationBinding,
  collectRenderPreparationTransfers,
  executeRenderPreparationTask,
  rebindShoreLinePathCache
} from "../app/webgl-generator/src/renderer/render-preparation.js";

const cellsTarget = Number(process.argv.slice(2).find(value => /^\d+$/u.test(value)) || 10000);
const full = process.argv.includes("--full");
const map = generatePlaceholderMap({seed: "task322-render-preparation", cellsTarget, graphWidth: 1440, graphHeight: 960});
const binding = {mapIdentity: `render-${cellsTarget}`, mapRevision: 7};
const camera = {scale: 1, offsetX: 0, offsetY: 0};
const canvas = {width: 1440, height: 960, clientWidth: 1440, clientHeight: 960};
const visibility = {};
const visualTheme = {};
const checkpoints = [];

const expected = {
  route: buildRouteMeshVertices(map, camera, canvas, null, [], visualTheme),
  river: buildRiverMeshVertices(map, camera, canvas),
  point: {vertices: buildPointVertices(map, visibility)}
};
const actual = await executeRenderPreparationTask({map, binding, camera, canvas, visibility, visualTheme}, {
  checkpoint: value => checkpoints.push(value)
});

assertRenderPreparationBinding(actual, binding);
assert.deepEqual(actual.layers.route.drawRanges, expected.route.drawRanges);
assert.deepEqual(actual.layers.route.stats, expected.route.stats);
assert.deepEqual(actual.layers.river.stats, expected.river.stats);
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
assert.throws(() => assertRenderPreparationBinding(actual, {...binding, mapRevision: 8}), error => error?.code === "render-result-stale");

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
  cacheSummary,
  pickingSummary,
  labelSummary,
  coordinatorSummary
}, null, 2));

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
