#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  CELL_VISUAL_CORRECTION_MAX_SEGMENT_BYTES,
  buildCellVisualSurfaceCorrection,
  createCellVisualCorrectionBufferSet,
  createCellVisualCorrectionBufferSetAsync,
  deleteCellVisualCorrectionBufferSet,
  flattenCellVisualCorrectionBufferSet,
  summarizeCellVisualCorrectionBufferSet
} from "../app/webgl-generator/src/renderer/cell-visual-surface-correction.js";
import {unpackSurfaceBaseIdentity} from "../app/webgl-generator/src/renderer/surface-base-buffer-set.js";

const map = {
  metadata: {graphWidth: 100, graphHeight: 100},
  grid: {
    cells: {i: [0, 1], v: [[0, 1, 2, 3], [1, 4, 5, 2]], h: new Uint8Array([25, 30])}
  }
};
const mesh = {
  cells: [{cell: 0, center: [25, 50]}, {cell: 1, center: [75, 50]}],
  edgeCurves: new Map([["1:2", [[50, 0], [45, 33], [45, 66], [50, 100]]]]),
  shoreEdges: new Set()
};
const geometry = buildCellVisualSurfaceCorrection(map, mesh);
assert.equal(geometry.length, 18);
const words = new Uint32Array(geometry.buffer);
assert.deepEqual([2, 5, 8, 11, 14, 17].map(index => unpackSurfaceBaseIdentity(words[index])), Array(6).fill({cellId: 1, water: false}));
assert.deepEqual([...buildCellVisualSurfaceCorrection(map, {...mesh, shoreEdges: new Set(["1:2"])})], []);
assert.deepEqual([...buildCellVisualSurfaceCorrection(map, {...mesh, edgeCurves: new Map([["1:2", [[50, 0], [50, 50], [50, 100]]]])})], []);

const gl = new FakeGl();
const sync = createCellVisualCorrectionBufferSet(gl, geometry);
assert.deepEqual(summarizeCellVisualCorrectionBufferSet(sync), {segmentCount: 1, vertexCount: 6, triangleCount: 2, byteLength: 72, maxSegmentBytes: CELL_VISUAL_CORRECTION_MAX_SEGMENT_BYTES});
assert.equal(flattenCellVisualCorrectionBufferSet(sync).length, 1);
assert.deepEqual(gl.bytes(sync.segments[0].buffer), new Uint8Array(geometry.buffer));
deleteCellVisualCorrectionBufferSet(gl, sync);
assert.equal(gl.live.size, 0);

const wordsPerSegment = Math.floor(CELL_VISUAL_CORRECTION_MAX_SEGMENT_BYTES / 4 / 9) * 9;
const large = new Float32Array(wordsPerSegment + 9);
let yields = 0;
const asyncSet = await createCellVisualCorrectionBufferSetAsync(gl, large, {yieldToMain: async () => { yields++; }});
assert.equal(asyncSet.segments.length, 2);
assert.ok(asyncSet.segments.every(segment => segment.byteLength <= CELL_VISUAL_CORRECTION_MAX_SEGMENT_BYTES && segment.vertexCount % 3 === 0));
assert.equal(yields, 1);
deleteCellVisualCorrectionBufferSet(gl, asyncSet);

let failed = false;
try {
  await createCellVisualCorrectionBufferSetAsync(gl, large, {assertCurrent: () => { throw new Error("obsolete"); }});
} catch (error) {
  failed = error.message === "obsolete";
}
assert.equal(failed, true);
assert.equal(gl.live.size, 0);
console.log(JSON.stringify({ok: true, triangles: geometry.length / 9, segmented: asyncSet.segments.length, maxSegmentBytes: CELL_VISUAL_CORRECTION_MAX_SEGMENT_BYTES}));

function FakeGl() {
  this.ARRAY_BUFFER = 0x8892;
  this.STATIC_DRAW = 0x88e4;
  this.live = new Set();
  this.storage = new Map();
  this.bound = null;
  this.next = 0;
  this.createBuffer = () => { const buffer = {id: ++this.next}; this.live.add(buffer); return buffer; };
  this.bindBuffer = (_target, buffer) => { this.bound = buffer; };
  this.bufferData = (_target, value) => { if (!this.bound) throw new Error("missing binding"); this.storage.set(this.bound, value instanceof Float32Array ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice() : new Uint8Array(value)); };
  this.deleteBuffer = buffer => { this.live.delete(buffer); this.storage.delete(buffer); };
  this.bytes = buffer => this.storage.get(buffer);
}
