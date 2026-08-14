import assert from "node:assert/strict";
import {
  SURFACE_BASE_FLOATS_PER_TRIANGLE,
  SURFACE_BASE_ASYNC_UPLOAD_SLICE_BYTES,
  SURFACE_BASE_MAX_SEGMENT_BYTES,
  SURFACE_BASE_MAX_SEGMENT_FLOATS,
  createSurfaceBaseBufferSet,
  createSurfaceBaseBufferSetAsync,
  deleteSurfaceBaseBufferSet,
  flattenSurfaceBaseBufferSet,
  isSurfaceBaseBufferSetForVertices,
  replaceSurfaceBaseBufferSet,
  summarizeSurfaceBaseBufferSet,
  uploadSurfaceBaseBufferSetRanges
} from "../app/webgl-generator/src/renderer/surface-base-buffer-set.js";
import {buildGridCellSurfacePatchFromBase} from "../app/webgl-generator/src/renderer/cell-surface-layer.js";

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
    const buffer = {id: this.buffers.length + 1, data: new Float32Array(), deleted: false};
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
    assert.ok(typeof source === "number" || source instanceof Float32Array);
    this.boundBuffer.data = typeof source === "number" ? new Float32Array(source / Float32Array.BYTES_PER_ELEMENT) : new Float32Array(source);
    this.boundBuffer.usage = usage;
    this.bufferDataCalls.push({buffer: this.boundBuffer, byteLength: typeof source === "number" ? source : source.byteLength, usage});
  }

  bufferSubData(target, byteOffset, source) {
    assert.equal(target, this.ARRAY_BUFFER);
    assert.ok(this.boundBuffer);
    assert.equal(byteOffset % Float32Array.BYTES_PER_ELEMENT, 0);
    assert.ok(source instanceof Float32Array);
    this.boundBuffer.data.set(source, byteOffset / Float32Array.BYTES_PER_ELEMENT);
    this.bufferSubDataCalls.push({buffer: this.boundBuffer, byteOffset, values: new Float32Array(source)});
  }

  deleteBuffer(buffer) {
    buffer.deleted = true;
    this.deleteCalls.push(buffer);
  }
}

assert.equal(SURFACE_BASE_MAX_SEGMENT_BYTES, 8 * 1024 * 1024);
assert.equal(SURFACE_BASE_ASYNC_UPLOAD_SLICE_BYTES, 4 * 1024 * 1024);
assert.equal(SURFACE_BASE_MAX_SEGMENT_FLOATS % SURFACE_BASE_FLOATS_PER_TRIANGLE, 0);
assert.ok(SURFACE_BASE_MAX_SEGMENT_FLOATS * Float32Array.BYTES_PER_ELEMENT <= SURFACE_BASE_MAX_SEGMENT_BYTES);
assert.ok((SURFACE_BASE_MAX_SEGMENT_FLOATS + SURFACE_BASE_FLOATS_PER_TRIANGLE) * Float32Array.BYTES_PER_ELEMENT > SURFACE_BASE_MAX_SEGMENT_BYTES);

const gl = new FakeGl();
const source = new Float32Array(SURFACE_BASE_MAX_SEGMENT_FLOATS + SURFACE_BASE_FLOATS_PER_TRIANGLE * 2);
source[0] = 1;
source[SURFACE_BASE_MAX_SEGMENT_FLOATS - 1] = 2;
source[SURFACE_BASE_MAX_SEGMENT_FLOATS] = 3;
source[source.length - 1] = 4;
const bufferSet = createSurfaceBaseBufferSet(gl, source);
const summary = summarizeSurfaceBaseBufferSet(bufferSet);
assert.deepEqual(summary, {
  segmentCount: 2,
  floatLength: source.length,
  byteLength: source.byteLength,
  vertexCount: source.length / 6,
  triangleCount: source.length / 18,
  maxSegmentBytes: SURFACE_BASE_MAX_SEGMENT_BYTES,
  segmentByteLengths: [
    SURFACE_BASE_MAX_SEGMENT_FLOATS * Float32Array.BYTES_PER_ELEMENT,
    SURFACE_BASE_FLOATS_PER_TRIANGLE * 2 * Float32Array.BYTES_PER_ELEMENT
  ]
});
assert.equal(bufferSet.segments[0].floatStart, 0);
assert.equal(bufferSet.segments[0].floatEnd, SURFACE_BASE_MAX_SEGMENT_FLOATS);
assert.equal(bufferSet.segments[1].floatStart, SURFACE_BASE_MAX_SEGMENT_FLOATS);
assert.equal(bufferSet.segments[1].floatEnd, source.length);
assert.ok(bufferSet.segments.every(segment => segment.floatStart % 18 === 0 && segment.floatEnd % 18 === 0));
assert.ok(bufferSet.segments.every(segment => segment.byteLength <= SURFACE_BASE_MAX_SEGMENT_BYTES));
assert.equal(bufferSet.segments[0].buffer.data[0], 1);
assert.equal(bufferSet.segments[0].buffer.data.at(-1), 2);
assert.equal(bufferSet.segments[1].buffer.data[0], 3);
assert.equal(bufferSet.segments[1].buffer.data.at(-1), 4);
assert.equal(isSurfaceBaseBufferSetForVertices(bufferSet, source), true);
assert.equal(isSurfaceBaseBufferSetForVertices(bufferSet, new Float32Array(18)), false);
assert.equal(isSurfaceBaseBufferSetForVertices({segments: [], floatLength: source.length}, source), false);

for (let index = SURFACE_BASE_MAX_SEGMENT_FLOATS - 18; index < source.length; index++) source[index] = index % 97;
const rangeUpload = uploadSurfaceBaseBufferSetRanges(gl, bufferSet, source, [
  {start: SURFACE_BASE_MAX_SEGMENT_FLOATS - 18, end: SURFACE_BASE_MAX_SEGMENT_FLOATS + 18},
  {start: SURFACE_BASE_MAX_SEGMENT_FLOATS, end: SURFACE_BASE_MAX_SEGMENT_FLOATS + 36}
]);
assert.deepEqual(rangeUpload, {ranges: 1, uploads: 2, floats: 54, bytes: 216});
assert.equal(gl.bufferSubDataCalls.length, 2);
assert.equal(gl.bufferSubDataCalls[0].byteOffset, (SURFACE_BASE_MAX_SEGMENT_FLOATS - 18) * Float32Array.BYTES_PER_ELEMENT);
assert.equal(gl.bufferSubDataCalls[1].byteOffset, 0);
assert.deepEqual(
  [...bufferSet.segments[0].buffer.data.subarray(SURFACE_BASE_MAX_SEGMENT_FLOATS - 18)],
  [...source.subarray(SURFACE_BASE_MAX_SEGMENT_FLOATS - 18, SURFACE_BASE_MAX_SEGMENT_FLOATS)]
);
assert.deepEqual([...bufferSet.segments[1].buffer.data], [...source.subarray(SURFACE_BASE_MAX_SEGMENT_FLOATS)]);
assert.throws(
  () => uploadSurfaceBaseBufferSetRanges(gl, bufferSet, source, [{start: 1, end: 19}]),
  /18-float/
);

const replacement = createSurfaceBaseBufferSet(gl, new Float32Array(18));
const replacedBuffers = flattenSurfaceBaseBufferSet(bufferSet);
assert.equal(replaceSurfaceBaseBufferSet(gl, bufferSet, replacement), replacement);
assert.ok(replacedBuffers.every(buffer => buffer.deleted));
assert.equal(flattenSurfaceBaseBufferSet(replacement).length, 1);

const duplicateBuffer = gl.createBuffer();
const duplicateCarrier = {segments: [{buffer: duplicateBuffer}, {buffer: duplicateBuffer}]};
assert.deepEqual(flattenSurfaceBaseBufferSet(duplicateCarrier), [duplicateBuffer]);
const deletesBeforePreserve = gl.deleteCalls.length;
assert.equal(deleteSurfaceBaseBufferSet(gl, duplicateCarrier, {preserve: new Set([duplicateBuffer])}), 0);
assert.equal(gl.deleteCalls.length, deletesBeforePreserve);
assert.equal(deleteSurfaceBaseBufferSet(gl, duplicateCarrier), 1);
assert.equal(gl.deleteCalls.filter(buffer => buffer === duplicateBuffer).length, 1);

const empty = createSurfaceBaseBufferSet(gl, new Float32Array());
assert.deepEqual(summarizeSurfaceBaseBufferSet(empty), {
  segmentCount: 1,
  floatLength: 0,
  byteLength: 0,
  vertexCount: 0,
  triangleCount: 0,
  maxSegmentBytes: SURFACE_BASE_MAX_SEGMENT_BYTES,
  segmentByteLengths: [0]
});

const asyncGl = new FakeGl();
const asyncSource = new Float32Array(SURFACE_BASE_MAX_SEGMENT_FLOATS + 18);
let yields = 0;
let currentChecks = 0;
const progress = [];
const asyncSet = await createSurfaceBaseBufferSetAsync(asyncGl, asyncSource, {
  yieldToMain: async () => { yields++; },
  assertCurrent: () => { currentChecks++; },
  onProgress: value => progress.push(value)
});
assert.equal(asyncSet.segments.length, 2);
assert.equal(yields, 2);
assert.equal(currentChecks, 9);
assert.deepEqual(progress.map(value => [value.completed, value.total]), [[1, 2], [2, 2]]);
assert.ok(asyncGl.bufferDataCalls.every(call => call.byteLength <= SURFACE_BASE_MAX_SEGMENT_BYTES));
assert.equal(asyncGl.bufferSubDataCalls.length, 3);
assert.ok(asyncGl.bufferSubDataCalls.every(call => call.values.byteLength <= SURFACE_BASE_ASYNC_UPLOAD_SLICE_BYTES));

const failingGl = new FakeGl();
await assert.rejects(
  createSurfaceBaseBufferSetAsync(failingGl, asyncSource, {
    yieldToMain: async () => { throw new Error("task322-yield-fault"); }
  }),
  /task322-yield-fault/
);
assert.equal(failingGl.buffers.length, 1);
assert.equal(failingGl.deleteCalls.length, 1);
assert.equal(failingGl.buffers[0].deleted, true);

assert.throws(() => createSurfaceBaseBufferSet(gl, new Float32Array(17)), /18-float/);
assert.throws(() => createSurfaceBaseBufferSet(gl, []), /Float32Array/);

const patchSource = new Float32Array(108);
for (let index = 0; index < patchSource.length; index++) patchSource[index] = index + 0.25;
const patchMap = {
  grid: {cells: {v: [[0, 1, 2], [2, 3, 0]], h: Uint8Array.from([30, 40])}},
  layers: {ocean: [0, 0, 1, 1]}
};
const patch = buildGridCellSurfacePatchFromBase(
  patchSource,
  {map: patchMap},
  "height",
  {smoothCellBorders: false},
  new Set([1, 0]),
  null,
  (color, cell) => [color[0], color[1], color[2], cell ? 0.5 : 0.25]
);
assert.deepEqual([...patch.ranges], [[1, {start: 0, end: 54}], [0, {start: 54, end: 108}]]);
for (const [cell, range] of patch.ranges) {
  const sourceStart = patch.layout.offsets[cell];
  for (let offset = range.start; offset < range.end; offset += 6) {
    assert.deepEqual([...patch.vertices.subarray(offset, offset + 2)], [...patchSource.subarray(sourceStart + offset - range.start, sourceStart + offset - range.start + 2)]);
    assert.equal(patch.vertices[offset + 5], cell ? 0.5 : 0.25);
  }
}
assert.equal(buildGridCellSurfacePatchFromBase(new Float32Array(90), {map: patchMap}, "height", {}, [0]), null);

console.log(JSON.stringify({
  ok: true,
  maxSegmentBytes: SURFACE_BASE_MAX_SEGMENT_BYTES,
  syncSegments: summary.segmentCount,
  asyncSegments: asyncSet.segments.length,
  crossSegmentUploads: rangeUpload.uploads
}));
