import assert from "node:assert/strict";
import {createShoreEdgeIndex, shoreEdgeId} from "../app/webgl-generator/src/renderer/shore-edge-index.js";
import {stageShoreBufferPatch} from "../app/webgl-generator/src/renderer/shore-buffer-patch.js";

const index = createShoreEdgeIndex(point => point.join(":"));
const shore = (landCell, waterCell, a, b) => ({landCell, waterCell, a, b, side: {x: 0, y: 1}});
const a = [0, 0], b = [1, 0], c = [2, 0], d = [3, 0], e = [4, 0];
const first = shore(1, 2, a, b);
const second = shore(2, 3, b, c);
const retainedEdge = shore(7, 8, d, e);
const original = {points: [a, b, c], sourceEdges: [first, second]};
const retained = {points: [d, e], sourceEdges: [retainedEdge]};
const before = [original, retained];
index.prepare(before);
assert.deepEqual([...index.pathsForCell(2)], [original]);
assert.deepEqual([...index.pathsForVertex(b)], [original]);
assert.equal(index.readEdge(first).rawEdge, first);

const flipped = {...first, landCell: 2, waterCell: 1};
const resulting = {points: [a, b], sourceEdges: [flipped]};
const after = [resulting, retained];
assert.equal(shoreEdgeId(first), shoreEdgeId(flipped));
index.apply(after, [original], [resulting]);
assert.equal(index.paths, after);
assert.equal(index.readEdge(first).rawEdge, flipped);
assert.equal(index.readEdge(first).path, resulting);
assert.equal(index.pathsForCell(3).size, 0);
assert.equal(index.readEdge(second), undefined);
assert.equal(index.readEdge(retainedEdge).rawEdge, retainedEdge);
assert.deepEqual([...index.pathsForVertex(c)], []);

index.apply(before, [resulting], [original]);
assert.deepEqual([...index.pathsForCell(3)], [original]);
assert.equal(index.readEdge(first).rawEdge, first);
assert.equal(index.readEdge(retainedEdge).path, retained);

const source = {values: Float32Array.of(1, 2, 3, 4)};
const deleted = [];
let readBuffer, writeBuffer;
const gl = {
  COPY_READ_BUFFER: 1,
  COPY_WRITE_BUFFER: 2,
  DYNAMIC_DRAW: 3,
  createBuffer: () => ({}),
  deleteBuffer: buffer => deleted.push(buffer),
  bindBuffer(target, buffer) {
    if (target === this.COPY_READ_BUFFER) readBuffer = buffer;
    else writeBuffer = buffer;
  },
  bufferData(_target, bytes) {
    writeBuffer.values = new Float32Array(bytes / 4);
  },
  copyBufferSubData(_read, _write, sourceByte, targetByte, lengthBytes) {
    writeBuffer.values.set(readBuffer.values.subarray(sourceByte / 4, (sourceByte + lengthBytes) / 4), targetByte / 4);
  },
  bufferSubData(_write, targetByte, vertices, start, length) {
    writeBuffer.values.set(vertices.subarray(start, start + length), targetByte / 4);
  }
};
const entries = [{
  key: "shoreLineBuffer", source, sourceLength: source.values.length, vertices: Float32Array.of(3, 4, 8), moves: [
    {fromPrevious: true, source: 2, target: 0, length: 2}, {fromPrevious: false, source: 0, target: 2, length: 1}
  ]
}];
const renderer = {shoreLineBuffer: source};
const staged = await stageShoreBufferPatch(gl, entries, async () => {});
assert.equal(renderer.shoreLineBuffer, source);
assert.deepEqual(deleted, []);
assert.equal(staged.uploadedBytes, 4);
assert.equal(staged.retainedBytes, 8);
staged.install(renderer);
assert.deepEqual(renderer.shoreLineBuffer.values, Float32Array.of(3, 4, 8));
assert.deepEqual(deleted, [source]);
staged.discard();
assert.deepEqual(deleted, [source]);

let checkpoints = 0;
await assert.rejects(stageShoreBufferPatch(gl, entries, async () => {
  if (++checkpoints === 2) throw new Error("岸段准备已过期");
}), /已过期/);
assert.equal(deleted.length, 2);
assert.notEqual(renderer.shoreLineBuffer, deleted.at(-1));
console.log("通过海岸共边和岸段索引、缓冲分段提交及过期释放验证");
