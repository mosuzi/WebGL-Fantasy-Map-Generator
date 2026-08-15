import assert from "node:assert/strict";
import {
  SURFACE_BASE_ASYNC_UPLOAD_SLICE_BYTES,
  SURFACE_BASE_INVALID_CELL_ID,
  SURFACE_BASE_MAX_SEGMENT_BYTES,
  SURFACE_BASE_MAX_SEGMENT_FLOATS,
  createSurfaceBaseBufferSet,
  createSurfaceBaseBufferSetAsync,
  deleteSurfaceBaseBufferSet,
  flattenSurfaceBaseBufferSet,
  isSurfaceBaseBufferSetForVertices,
  replaceSurfaceBaseBufferSet,
  summarizeSurfaceBaseBufferSet,
  unpackSurfaceBaseIdentity,
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
const bufferSet = createSurfaceBaseBufferSet(gl, source, {surfaceCellRanges: ranges});
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
