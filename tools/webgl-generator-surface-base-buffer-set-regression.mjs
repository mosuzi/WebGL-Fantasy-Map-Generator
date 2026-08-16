import assert from "node:assert/strict";
import {
  SURFACE_BASE_ASYNC_UPLOAD_SLICE_BYTES,
  SURFACE_BASE_INVALID_CELL_ID,
  SURFACE_BASE_MAX_SEGMENT_BYTES,
  SURFACE_BASE_MAX_SEGMENT_FLOATS,
  createSurfaceBaseBufferSet,
  createSurfaceBaseBufferSetAsync,
  createSurfaceResourceOwner,
  deleteSurfaceBaseBufferSet,
  flattenSurfaceBaseBufferSet,
  isSurfaceBaseBufferSetForVertices,
  replaceSurfaceBaseBufferSet,
  summarizeSurfaceBaseBufferSet,
  unpackSurfaceBaseIdentity,
  uploadSurfaceBaseBufferSetRanges
} from "../app/webgl-generator/src/renderer/surface-base-buffer-set.js";
import {buildGridCellSurfacePatchFromBase, pushGridCells} from "../app/webgl-generator/src/renderer/cell-surface-layer.js";
import {buildCellVisualMesh, countCellVisualTriangulationLeaks} from "../app/webgl-generator/src/renderer/cell-visual-layer.js";
import {stabilizeResolvedGridVertexPoints} from "../app/webgl-generator/src/renderer/grid-vertex-geometry.js";

class FakeGl {
  constructor() {
    this.ARRAY_BUFFER = 0x8892;
    this.STATIC_DRAW = 0x88e4;
    this.DYNAMIC_DRAW = 0x88e8;
    this.buffers = [];
    this.boundBuffer = null;
    this.bufferDataCalls = [];
    this.bufferSubDataCalls = [];
    this.deleteCalls = [];
  }

  createBuffer() {
    const buffer = {id: this.buffers.length + 1, bytes: new Uint8Array(), deleted: false};
    this.buffers.push(buffer);
    return buffer;
  }

  bindBuffer(target, buffer) {
    assert.equal(target, this.ARRAY_BUFFER);
    this.boundBuffer = buffer;
  }

  bufferData(target, source, usage) {
    assert.equal(target, this.ARRAY_BUFFER);
    assert.ok(this.boundBuffer);
    this.boundBuffer.bytes = typeof source === "number"
      ? new Uint8Array(source)
      : new Uint8Array(source.buffer, source.byteOffset, source.byteLength).slice();
    this.boundBuffer.usage = usage;
    this.bufferDataCalls.push({buffer: this.boundBuffer, byteLength: this.boundBuffer.bytes.length, usage});
  }

  bufferSubData(target, byteOffset, source) {
    assert.equal(target, this.ARRAY_BUFFER);
    assert.ok(this.boundBuffer);
    const bytes = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
    this.boundBuffer.bytes.set(bytes, byteOffset);
    this.bufferSubDataCalls.push({buffer: this.boundBuffer, byteOffset, bytes: bytes.slice()});
  }

  deleteBuffer(buffer) {
    if (buffer?.deleted) throw new Error(`double-delete:${buffer.id}`);
    buffer.deleted = true;
    this.deleteCalls.push(buffer);
  }
}

assert.equal(SURFACE_BASE_MAX_SEGMENT_BYTES, 8 * 1024 * 1024);
assert.equal(SURFACE_BASE_ASYNC_UPLOAD_SLICE_BYTES, 4 * 1024 * 1024);
assert.equal(SURFACE_BASE_MAX_SEGMENT_FLOATS % 18, 0);
assert.ok(SURFACE_BASE_MAX_SEGMENT_FLOATS / 6 * 12 <= SURFACE_BASE_MAX_SEGMENT_BYTES);
assert.ok((SURFACE_BASE_MAX_SEGMENT_FLOATS / 6 + 3) * 12 > SURFACE_BASE_MAX_SEGMENT_BYTES);

const gl = new FakeGl();
const source = createSurface(SURFACE_BASE_MAX_SEGMENT_FLOATS + 36);
const ranges = new Map([
  [19, {start: 0, end: SURFACE_BASE_MAX_SEGMENT_FLOATS}],
  [27, {start: SURFACE_BASE_MAX_SEGMENT_FLOATS, end: source.length}]
]);
const ownerA = createSurfaceResourceOwner({mapIdentity: "same-size-a", mapRevision: 7}, {
  surfaceFloatLength: source.length,
  correctionWordLength: 0,
  surfaceCellRanges: ranges
});
const ownerB = createSurfaceResourceOwner({mapIdentity: "same-size-b", mapRevision: 7}, {
  surfaceFloatLength: source.length,
  correctionWordLength: 0,
  surfaceCellRanges: new Map(ranges)
});
const bufferSet = createSurfaceBaseBufferSet(gl, source, {surfaceCellRanges: ranges, owner: ownerA});
const summary = summarizeSurfaceBaseBufferSet(bufferSet);
const vertexCount = source.length / 6;
assert.deepEqual(summary, {
  segmentCount: 2,
  floatLength: source.length,
  byteLength: vertexCount * 12,
  colorByteLength: vertexCount * 12,
  totalGpuByteLength: vertexCount * 24,
  vertexCount,
  triangleCount: vertexCount / 3,
  maxSegmentBytes: SURFACE_BASE_MAX_SEGMENT_BYTES,
  segmentByteLengths: bufferSet.segments.map(segment => segment.vertexCount * 12),
  segmentColorByteLengths: bufferSet.segments.map(segment => segment.vertexCount * 12)
});
assert.equal(flattenSurfaceBaseBufferSet(bufferSet).length, 4);
assert.ok(bufferSet.segments.every(segment => segment.floatStart % 18 === 0 && segment.floatEnd % 18 === 0));
assert.ok(bufferSet.segments.every(segment => segment.byteLength <= SURFACE_BASE_MAX_SEGMENT_BYTES));
assert.equal(isSurfaceBaseBufferSetForVertices(bufferSet, source), true);
assert.equal(isSurfaceBaseBufferSetForVertices(bufferSet, source, ownerA), true);
assert.equal(isSurfaceBaseBufferSetForVertices(bufferSet, source, ownerB), false, "同长度不同地图 owner 不得复用 surface buffer");
assert.equal(isSurfaceBaseBufferSetForVertices(bufferSet, new Float32Array(18)), false);

const reconstructedPositions = [];
const reconstructedIdentities = [];
const reconstructedColors = [];
for (const segment of bufferSet.segments) {
  const geometry = new Float32Array(segment.geometryBuffer.bytes.buffer);
  const identities = new Uint32Array(segment.geometryBuffer.bytes.buffer);
  const colors = new Float32Array(segment.colorBuffer.bytes.buffer);
  for (let vertex = 0; vertex < segment.vertexCount; vertex++) {
    reconstructedPositions.push(geometry[vertex * 3], geometry[vertex * 3 + 1]);
    reconstructedIdentities.push(unpackSurfaceBaseIdentity(identities[vertex * 3 + 2]));
    reconstructedColors.push(...colors.subarray(vertex * 3, vertex * 3 + 3));
  }
}
assert.deepEqual(reconstructedPositions, sourcePositions(source));
assert.deepEqual(reconstructedIdentities[0], {cellId: 19, water: false});
assert.deepEqual(reconstructedIdentities.at(-1), {cellId: 27, water: true});
assert.deepEqual(reconstructedColors.slice(0, 3), [0.25, 0.5, 0.75]);

const zeroRangeSource = createSurface(18);
assert.throws(() => createSurfaceBaseBufferSet(gl, zeroRangeSource, {surfaceCellRanges: new Map([
  [0, {start: 0, end: 0}],
  [1, {start: 0, end: 18}]
])}), /cell range 无效/, "零长度 cell range 不得作为成功画面进入 GPU");

const geometryBefore = bufferSet.segments.map(segment => segment.geometryBuffer.bytes.slice());
for (let offset = SURFACE_BASE_MAX_SEGMENT_FLOATS - 18; offset < source.length; offset += 6) {
  source[offset + 2] = 1;
  source[offset + 3] = 0;
  source[offset + 4] = 0.5;
}
const rangeUpload = uploadSurfaceBaseBufferSetRanges(gl, bufferSet, source, [{
  start: SURFACE_BASE_MAX_SEGMENT_FLOATS - 18,
  end: SURFACE_BASE_MAX_SEGMENT_FLOATS + 18
}]);
assert.deepEqual(rangeUpload, {ranges: 1, uploads: 2, floats: 36, bytes: 72});
assert.deepEqual(bufferSet.segments.map(segment => segment.geometryBuffer.bytes), geometryBefore);
assert.ok(gl.bufferSubDataCalls.every(call => bufferSet.segments.some(segment => segment.colorBuffer === call.buffer)));
assert.throws(() => uploadSurfaceBaseBufferSetRanges(gl, bufferSet, source, [{start: 1, end: 19}]), /18-float/);

const replacement = createSurfaceBaseBufferSet(gl, new Float32Array(18));
const replacedBuffers = flattenSurfaceBaseBufferSet(bufferSet);
assert.equal(replaceSurfaceBaseBufferSet(gl, bufferSet, replacement), replacement);
assert.ok(replacedBuffers.every(buffer => buffer.deleted));
assert.equal(flattenSurfaceBaseBufferSet(replacement).length, 2);

const duplicateBuffer = gl.createBuffer();
const duplicateCarrier = {segments: [{buffer: duplicateBuffer, geometryBuffer: duplicateBuffer, colorBuffer: duplicateBuffer}]};
assert.deepEqual(flattenSurfaceBaseBufferSet(duplicateCarrier), [duplicateBuffer]);
assert.equal(deleteSurfaceBaseBufferSet(gl, duplicateCarrier, {preserve: new Set([duplicateBuffer])}), 0);
assert.equal(deleteSurfaceBaseBufferSet(gl, duplicateCarrier), 1);

const empty = createSurfaceBaseBufferSet(gl, new Float32Array());
assert.equal(empty.segments.length, 1);
assert.equal(empty.byteLength, 0);
assert.equal(empty.colorByteLength, 0);
assert.equal(flattenSurfaceBaseBufferSet(empty).length, 2);

const asyncGl = new FakeGl();
let yields = 0;
let currentChecks = 0;
const progress = [];
const asyncSet = await createSurfaceBaseBufferSetAsync(asyncGl, source, {
  surfaceCellRanges: ranges,
  yieldToMain: async () => { yields++; },
  assertCurrent: () => { currentChecks++; },
  onProgress: value => progress.push(value)
});
assert.equal(asyncSet.segments.length, 2);
assert.ok(yields > 2);
assert.ok(currentChecks > yields);
assert.deepEqual(progress.map(value => [value.completed, value.total]), [[1, 2], [2, 2]]);
assert.ok(asyncGl.bufferSubDataCalls.every(call => call.bytes.byteLength <= SURFACE_BASE_ASYNC_UPLOAD_SLICE_BYTES));

const failingGl = new FakeGl();
await assert.rejects(createSurfaceBaseBufferSetAsync(failingGl, source, {
  surfaceCellRanges: ranges,
  yieldToMain: async () => { throw new Error("task335-yield-fault"); }
}), /task335-yield-fault/);
assert.ok(failingGl.buffers.every(buffer => buffer.deleted));

const noRange = createSurfaceBaseBufferSet(gl, createSurface(18));
const invalidWords = new Uint32Array(noRange.segments[0].geometryBuffer.bytes.buffer);
assert.deepEqual(unpackSurfaceBaseIdentity(invalidWords[2]), {cellId: SURFACE_BASE_INVALID_CELL_ID, water: false});
assert.throws(() => createSurfaceBaseBufferSet(gl, new Float32Array(17)), /18-float/);
assert.throws(() => createSurfaceBaseBufferSet(gl, []), /Float32Array/);

const patchSource = createSurface(108);
const patchMap = {grid: {cells: {v: [[0, 1, 2], [2, 3, 0]], h: Uint8Array.from([30, 40])}}, layers: {ocean: [0, 0, 1, 1]}};
const patch = buildGridCellSurfacePatchFromBase(patchSource, {map: patchMap}, "height", {smoothCellBorders: false}, new Set([1, 0]), null,
  (color, cell) => [color[0], color[1], color[2], cell ? 0.5 : 0.25]);
assert.deepEqual([...patch.ranges], [[1, {start: 0, end: 54}], [0, {start: 54, end: 108}]]);
assert.equal(buildGridCellSurfacePatchFromBase(new Float32Array(90), {map: patchMap}, "height", {}, [0]), null);

const concaveVertices = [], concavePoints = [[0, 0], [4, 0], [4, 4], [2, 1], [0, 4]];
const concaveMap = {metadata: {graphWidth: 4, graphHeight: 4}, grid: {points: [[3.5, 3.5]], cells: {p: [0], v: [[0, 1, 2, 3, 4]], h: [30]}, vertices: {p: concavePoints}}, features: {features: [{land: true}]}, layers: {ocean: [0, 0, 1, 1]}};
pushGridCells(concaveVertices, {map: concaveMap}, "height", {});
assert.equal(concaveVertices.length, (concavePoints.length - 2) * 3 * 6, "非凸 hard cell 必须使用安全三角剖分，不能以外置中心扇分越界");

const invalidVertices = [], invalidRanges = new Map(), invalidPoints = [[0, 0], [4, 4], [4, 0], [0, 4]];
const invalidMap = {metadata: {graphWidth: 4, graphHeight: 4}, grid: {points: [[2, 2]], cells: {i: [0], c: [[]], p: [0], v: [[0, 1, 2, 3]], h: [30]}, vertices: {p: invalidPoints, c: [[], [], [], []]}}, features: {features: [{land: true}]}, layers: {ocean: [0, 0, 1, 1]}};
pushGridCells(invalidVertices, {map: invalidMap}, "height", {}, () => true, color => color, (cell, range) => invalidRanges.set(cell, range));
assert.equal(invalidVertices.length, 36, "自交 Voronoi 顶点必须恢复 canonical 环序并安全覆盖，不能恢复越界中心扇分");
assert.deepEqual([...invalidRanges], [[0, {start: 0, end: 36}]], "canonical 环序 fallback 必须产出非空连续 range");
const invalidVisualMesh = buildCellVisualMesh(invalidMap);
assert.equal(invalidVisualMesh.triangulationUnfilledCells, 0, "平滑视觉层不得为乱序 Voronoi cell 留下缺面");
assert.equal(invalidVisualMesh.triangulationEmergencyHardFanCells, 0, "平滑视觉层不得恢复非安全中心扇分");
assert.equal(invalidVisualMesh.triangulationCanonicalOrderFallbackCells, 1, "平滑视觉层必须记录 canonical 环序恢复");
assert.equal(countCellVisualTriangulationLeaks(invalidVisualMesh.cells[0].points), 0, "canonical 环序恢复不得产生越界三角");
const collapsedMap = {metadata: {graphWidth: 4, graphHeight: 4}, grid: {points: [[2, 0]], cells: {i: [0], c: [[]], p: [0], v: [[0, 1, 2]], h: [30]}, vertices: {p: [[0, 0], [2, 0], [4, 0]], c: [[], [], []]}}, features: {features: [{land: true}]}, layers: {ocean: [0, 0, 1, 1]}};
assert.throws(() => pushGridCells([], {map: collapsedMap}, "height", {}), error => error?.code === "grid-cell-surface-unfilled", "无法恢复的 cell 必须 fail-closed，不能提交零长度 range");

const recoverableCollapsedMap = {
  metadata: {graphWidth: 10, graphHeight: 10},
  grid: {
    points: [[5, 5], [2, 5], [8, 5], [5, 2], [5, 8]],
    cells: {i: [0], c: [[1, 2, 3, 4]], p: [0], v: [[0, 1, 2, 3]], h: [30, 30, 30, 30, 30]},
    vertices: {p: [[5, 1], [5, 4], [5, 6], [5, 9]], c: [[], [], [], []]}
  },
  features: {features: [{land: true}]},
  layers: {ocean: [0, 0, 1, 1]}
};
const recoveredVertices = [], recoveredRanges = new Map();
pushGridCells(recoveredVertices, {map: recoverableCollapsedMap}, "height", {}, () => true, color => color, (cell, range) => recoveredRanges.set(cell, range));
assert.equal(recoveredVertices.length, 36, "共线旧 cell 必须由邻居 Voronoi 半平面恢复为两个安全三角");
assert.deepEqual([...recoveredRanges], [[0, {start: 0, end: 36}]], "Voronoi 恢复必须形成非空连续 hard surface range");
const recoveredVisualMesh = buildCellVisualMesh(recoverableCollapsedMap);
assert.equal(recoveredVisualMesh.triangulationUnfilledCells, 0, "Voronoi 恢复不得留下平滑表面缺面");
assert.equal(recoveredVisualMesh.triangulationVoronoiRecoveryCells, 1, "平滑视觉层必须记录一次 Voronoi 恢复");
assert.deepEqual(recoveredVisualMesh.triangulationVoronoiRecoveryCellIds, [0], "Voronoi 恢复 cell 身份必须可诊断");
assert.equal(recoveredVisualMesh.cells[0]?.triangulationFallback, "voronoi-recovered-hard-boundary-earcut", "Voronoi 恢复必须保留 fallback 来源");
assert.equal(countCellVisualTriangulationLeaks(recoveredVisualMesh.cells[0].points), 0, "Voronoi 恢复三角不得越界");

const storedBoundary = [[0, 0], [4, 0], [4, 4], [0, 4], [4, 0], [8, 0], [8, 4], [4, 4]];
const resolvedBoundary = storedBoundary.map(point => [...point]);
resolvedBoundary[1] = [-1, 3];
resolvedBoundary[4] = [3.8, 0.2];
const sharedGroup = [1, 4];
stabilizeResolvedGridVertexPoints(storedBoundary, resolvedBoundary, [[0, 1, 2, 3], [4, 5, 6, 7]], new Map([[1, sharedGroup], [4, sharedGroup]]));
assert.equal(resolvedBoundary[1], storedBoundary[1], "导致关联 cell 自交的精细共享顶点必须整组回退");
assert.equal(resolvedBoundary[4], storedBoundary[4], "相邻 cell 必须与回退共享组保持同一边界");

console.log(JSON.stringify({ok: true, maxSegmentBytes: SURFACE_BASE_MAX_SEGMENT_BYTES, syncSegments: 2, asyncSegments: 2, packedIdentity: true}));

function createSurface(length) {
  const values = new Float32Array(length);
  for (let offset = 0; offset < length; offset += 6) {
    values[offset] = offset / 6;
    values[offset + 1] = -(offset / 6);
    values[offset + 2] = 0.25;
    values[offset + 3] = 0.5;
    values[offset + 4] = 0.75;
    values[offset + 5] = offset < SURFACE_BASE_MAX_SEGMENT_FLOATS ? 0.25 : 0.75;
  }
  return values;
}

function sourcePositions(values) {
  const positions = [];
  for (let offset = 0; offset < values.length; offset += 6) positions.push(values[offset], values[offset + 1]);
  return positions;
}
