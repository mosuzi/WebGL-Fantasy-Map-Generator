import assert from "node:assert/strict";

import {prepareRendererWorkerInstall} from "../app/webgl-generator/src/renderer/prepared-render-installer.js";
import {
  SURFACE_BASE_MAX_SEGMENT_FLOATS,
  createSurfaceBaseBufferSet,
  flattenSurfaceBaseBufferSet
} from "../app/webgl-generator/src/renderer/surface-base-buffer-set.js";

class FakeGl {
  constructor() {
    this.ARRAY_BUFFER = 0x8892;
    this.STATIC_DRAW = 0x88e4;
    this.DYNAMIC_DRAW = 0x88e8;
    this.buffers = [];
    this.boundBuffer = null;
    this.deleteCalls = [];
  }

  createBuffer() {
    const buffer = {id: this.buffers.length + 1, bytes: new Uint8Array(), deleted: false};
    this.buffers.push(buffer);
    return buffer;
  }

  bindBuffer(target, buffer) {
    assert.equal(target, this.ARRAY_BUFFER);
    assert.equal(this.isBuffer(buffer), true);
    this.boundBuffer = buffer;
  }

  bufferData(target, source) {
    assert.equal(target, this.ARRAY_BUFFER);
    assert.ok(this.boundBuffer);
    if (typeof source === "number") this.boundBuffer.bytes = new Uint8Array(source);
    else this.boundBuffer.bytes = new Uint8Array(source.buffer, source.byteOffset, source.byteLength).slice();
  }

  bufferSubData(target, byteOffset, source) {
    assert.equal(target, this.ARRAY_BUFFER);
    assert.ok(this.boundBuffer);
    this.boundBuffer.bytes.set(new Uint8Array(source.buffer, source.byteOffset, source.byteLength), byteOffset);
  }

  isBuffer(buffer) {
    return Boolean(buffer && this.buffers.includes(buffer) && !buffer.deleted);
  }

  deleteBuffer(buffer) {
    if (!this.isBuffer(buffer)) throw new Error(`double-delete:${buffer?.id ?? "missing"}`);
    buffer.deleted = true;
    this.deleteCalls.push(buffer);
  }
}

const binding = {mapIdentity: "task322-segmented-installer", mapRevision: 1};

await testUncommittedCleanup();
await testCommittedRollbackAndFinalize();
await testCommitFaultRollback();
await testNestedRollbackOwnership();
await testNestedFinalizeOwnership();
await testSurfaceColorPatchTransaction();

console.log(JSON.stringify({ok: true, cases: 6, nestedOwnership: true, surfaceColorPatch: true}));

async function testUncommittedCleanup() {
  const gl = new FakeGl();
  const renderer = createRenderer(gl);
  const beforeSet = renderer.surfaceBaseBufferSet;
  const beforeAlias = renderer.vertexBuffer;
  const liveBefore = liveBuffers(gl);
  const transaction = await prepareSurfaceTransaction(renderer, largeSurface(11));
  const preparedBuffers = liveBuffers(gl).filter(buffer => !liveBefore.includes(buffer));
  assert.ok(preparedBuffers.length >= 6);
  assert.equal(transaction.rollback(), true);
  assert.equal(renderer.surfaceBaseBufferSet, beforeSet);
  assert.equal(renderer.vertexBuffer, beforeAlias);
  assert.ok(preparedBuffers.every(buffer => !gl.isBuffer(buffer)));
  assert.equal(transaction.finalize(), false);
}

async function testCommittedRollbackAndFinalize() {
  const rollbackGl = new FakeGl();
  const rollbackRenderer = createRenderer(rollbackGl);
  const rollbackBeforeSet = rollbackRenderer.surfaceBaseBufferSet;
  const rollbackBeforeAlias = rollbackRenderer.vertexBuffer;
  const rollbackValues = largeSurface(21);
  const rollbackTransaction = await prepareSurfaceTransaction(rollbackRenderer, rollbackValues);
  rollbackTransaction.commit();
  const committedSet = rollbackRenderer.surfaceBaseBufferSet;
  assert.notEqual(committedSet, rollbackBeforeSet);
  assertSurfaceBaseSetMatches(committedSet, rollbackRenderer.vertexBuffer, rollbackValues, rollbackGl);
  assert.equal(rollbackTransaction.rollback(), true);
  assert.equal(rollbackRenderer.surfaceBaseBufferSet, rollbackBeforeSet);
  assert.equal(rollbackRenderer.vertexBuffer, rollbackBeforeAlias);
  assert.ok(flattenSurfaceBaseBufferSet(committedSet).every(buffer => !rollbackGl.isBuffer(buffer)));
  assert.ok(flattenSurfaceBaseBufferSet(rollbackBeforeSet).every(buffer => rollbackGl.isBuffer(buffer)));

  const finalizeGl = new FakeGl();
  const finalizeRenderer = createRenderer(finalizeGl);
  const finalizeBeforeSet = finalizeRenderer.surfaceBaseBufferSet;
  const finalizeTransaction = await prepareSurfaceTransaction(finalizeRenderer, smallSurface(22));
  finalizeTransaction.commit();
  const finalizedSet = finalizeRenderer.surfaceBaseBufferSet;
  assert.equal(finalizeTransaction.finalize(), true);
  assert.ok(flattenSurfaceBaseBufferSet(finalizeBeforeSet).every(buffer => !finalizeGl.isBuffer(buffer)));
  assert.ok(flattenSurfaceBaseBufferSet(finalizedSet).every(buffer => finalizeGl.isBuffer(buffer)));
  assert.equal(finalizeRenderer.vertexBuffer, finalizedSet.segments[0].buffer);
}

async function testCommitFaultRollback() {
  const gl = new FakeGl();
  const renderer = createRenderer(gl);
  const beforeSet = renderer.surfaceBaseBufferSet;
  const beforeAlias = renderer.vertexBuffer;
  const beforeSurface = captureSurfaceBaseSet(beforeSet, beforeAlias);
  const liveBefore = liveBuffers(gl);
  let landCorrectionBuffer = renderer.landCorrectionBuffer;
  let rejectNextAssignment = true;
  Object.defineProperty(renderer, "landCorrectionBuffer", {
    configurable: true,
    get: () => landCorrectionBuffer,
    set(value) {
      if (rejectNextAssignment) {
        rejectNextAssignment = false;
        throw new Error("task322-commit-fault");
      }
      landCorrectionBuffer = value;
    }
  });
  const transaction = await prepareSurfaceTransaction(renderer, smallSurface(31));
  const preparedBuffers = liveBuffers(gl).filter(buffer => !liveBefore.includes(buffer));
  assert.throws(() => transaction.commit(), /task322-commit-fault/);
  assert.equal(renderer.surfaceBaseBufferSet, beforeSet);
  assert.equal(renderer.vertexBuffer, beforeAlias);
  assertSurfaceBaseSetExact(renderer.surfaceBaseBufferSet, renderer.vertexBuffer, beforeSurface, gl);
  assert.ok(preparedBuffers.every(buffer => !gl.isBuffer(buffer)));
  assert.equal(transaction.rollback(), false);
}

async function testNestedRollbackOwnership() {
  const gl = new FakeGl();
  const renderer = createRenderer(gl);
  const outer = await prepareSurfaceTransaction(renderer, smallSurface(41));
  outer.commit();
  const outerSet = renderer.surfaceBaseBufferSet;
  const inner = await prepareSurfaceTransaction(renderer, smallSurface(42));
  inner.commit();
  const innerSet = renderer.surfaceBaseBufferSet;
  assert.equal(outer.finalize(), true);
  assert.ok(flattenSurfaceBaseBufferSet(outerSet).every(buffer => gl.isBuffer(buffer)), "inner rollback ownership 必须保留 outer set");
  assert.equal(inner.rollback(), true);
  assert.equal(renderer.surfaceBaseBufferSet, outerSet);
  assert.equal(renderer.vertexBuffer, outerSet.segments[0].buffer);
  assert.ok(flattenSurfaceBaseBufferSet(outerSet).every(buffer => gl.isBuffer(buffer)));
  assert.ok(flattenSurfaceBaseBufferSet(innerSet).every(buffer => !gl.isBuffer(buffer)));
}

async function testNestedFinalizeOwnership() {
  const gl = new FakeGl();
  const renderer = createRenderer(gl);
  const outer = await prepareSurfaceTransaction(renderer, smallSurface(51));
  outer.commit();
  const outerSet = renderer.surfaceBaseBufferSet;
  const inner = await prepareSurfaceTransaction(renderer, smallSurface(52));
  inner.commit();
  const innerSet = renderer.surfaceBaseBufferSet;
  assert.equal(inner.finalize(), true);
  assert.ok(flattenSurfaceBaseBufferSet(outerSet).every(buffer => gl.isBuffer(buffer)), "outer transaction owner 必须保留 detached set");
  assert.equal(outer.finalize(), true);
  assert.ok(flattenSurfaceBaseBufferSet(outerSet).every(buffer => !gl.isBuffer(buffer)));
  assert.ok(flattenSurfaceBaseBufferSet(innerSet).every(buffer => gl.isBuffer(buffer)));
  assert.equal(renderer.surfaceBaseBufferSet, innerSet);
  assert.equal(renderer.vertexBuffer, innerSet.segments[0].buffer);
}

async function testSurfaceColorPatchTransaction() {
  const gl = new FakeGl();
  const renderer = createRenderer(gl);
  renderer.surfaceCellRanges = new Map([[0, {start: 0, end: 18}]]);
  const beforeSet = renderer.surfaceBaseBufferSet;
  const beforeVertices = renderer.surfaceVertices;
  const beforeBytes = new Uint8Array(beforeVertices.buffer, beforeVertices.byteOffset, beforeVertices.byteLength).slice();
  const prepared = {
    binding,
    presentation: {},
    layers: {
      surface: {
        mode: "cell-colors",
        scope: "water",
        cellIds: new Uint32Array([0]),
        colors: new Float32Array([0.1, 0.2, 0.3, 0.75]),
        landCorrections: new Float32Array(),
        waterCorrections: new Float32Array(),
        landCovers: new Float32Array(),
        waterCovers: new Float32Array(),
        shoreSurfaceCellRanges: emptyShoreRanges()
      }
    }
  };
  const transaction = await prepareRendererWorkerInstall(renderer, renderer.nextMap, prepared, {
    binding,
    budgetMs: 1,
    yieldToMain: async () => {}
  });
  assert.equal(renderer.surfaceBaseBufferSet, beforeSet, "surface patch prepare 不得提前替换正式 buffer set");
  assert.equal(renderer.surfaceVertices, beforeVertices, "surface patch prepare 不得提前替换正式 CPU vertices");
  assert.deepEqual(new Uint8Array(beforeVertices.buffer, beforeVertices.byteOffset, beforeVertices.byteLength), beforeBytes, "surface patch prepare 不得原地改写正式 CPU vertices");
  transaction.commit();
  assert.notEqual(renderer.surfaceBaseBufferSet, beforeSet);
  assert.notEqual(renderer.surfaceVertices, beforeVertices);
  const expectedColor = [...new Float32Array([0.1, 0.2, 0.3, 0.75])];
  for (let offset = 0; offset < renderer.surfaceVertices.length; offset += 6) {
    assert.deepEqual([...renderer.surfaceVertices.subarray(offset + 2, offset + 6)], expectedColor);
  }
  assert.equal(transaction.rollback(), true);
  assert.equal(renderer.surfaceBaseBufferSet, beforeSet);
  assert.equal(renderer.surfaceVertices, beforeVertices);
  assert.deepEqual(new Uint8Array(beforeVertices.buffer, beforeVertices.byteOffset, beforeVertices.byteLength), beforeBytes);
}

async function prepareSurfaceTransaction(renderer, base) {
  const prepared = {
    binding,
    layers: {
      surface: {
        base,
        landCorrections: new Float32Array(),
        waterCorrections: new Float32Array(),
        landCovers: new Float32Array(),
        waterCovers: new Float32Array(),
        surfaceCellRanges: new Map(),
        surfaceCellRangesMode: "unavailable",
        shoreSurfaceCellRanges: {
          landCorrections: new Map(),
          waterCorrections: new Map(),
          landCovers: new Map(),
          waterCovers: new Map()
        }
      }
    }
  };
  return prepareRendererWorkerInstall(renderer, renderer.nextMap, prepared, {
    binding,
    budgetMs: 1,
    yieldToMain: async () => {}
  });
}

function createRenderer(gl) {
  const surfaceVertices = smallSurface(1);
  const surfaceBaseBufferSet = createSurfaceBaseBufferSet(gl, surfaceVertices);
  const renderer = {
    gl,
    map: {id: "old-map"},
    nextMap: {grid: {cells: {i: new Uint32Array([0]), h: new Uint8Array([10])}}},
    surfaceBaseBufferSet,
    vertexBuffer: surfaceBaseBufferSet.segments[0].buffer,
    surfaceVertices,
    landCorrectionVertices: new Float32Array(),
    waterCorrectionVertices: new Float32Array(),
    landCoverVertices: new Float32Array(),
    waterCoverVertices: new Float32Array(),
    surfaceCellRanges: new Map(),
    shoreSurfaceCellRanges: emptyShoreRanges(),
    surfacePatchVertices: new Float32Array(),
    surfacePatchCellRanges: new Map(),
    surfacePatchCells: new Set(),
    surfacePatchVertexCount: 0,
    viewOptions: {smoothCellBorders: true},
    vertexCount: surfaceVertices.length / 6,
    landCorrectionVertexCount: 0,
    waterCorrectionVertexCount: 0,
    landCoverVertexCount: 0,
    waterCoverVertexCount: 0,
    dynamicBuffersDirty: {routes: false, rivers: false},
    camera: {scale: 1, offsetX: 0, offsetY: 0}
  };
  for (const key of ["landCorrectionBuffer", "waterCorrectionBuffer", "landCoverBuffer", "waterCoverBuffer", "surfacePatchBuffer"]) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(), gl.STATIC_DRAW);
    renderer[key] = buffer;
  }
  return renderer;
}

function emptyShoreRanges() {
  return {
    landCorrections: new Map(),
    waterCorrections: new Map(),
    landCovers: new Map(),
    waterCovers: new Map()
  };
}

function smallSurface(seed) {
  const values = new Float32Array(18);
  values.fill(seed);
  return values;
}

function largeSurface(seed) {
  const values = new Float32Array(SURFACE_BASE_MAX_SEGMENT_FLOATS + 18);
  values[0] = seed;
  values[SURFACE_BASE_MAX_SEGMENT_FLOATS] = seed + 1;
  return values;
}

function liveBuffers(gl) {
  return gl.buffers.filter(buffer => gl.isBuffer(buffer));
}

function captureSurfaceBaseSet(bufferSet, alias) {
  return {
    bufferSet,
    segments: bufferSet.segments,
    alias,
    descriptors: bufferSet.segments.map(segment => ({
      segment,
      buffer: segment.buffer,
      floatStart: segment.floatStart,
      floatEnd: segment.floatEnd,
      bytes: segment.buffer.bytes.slice()
    }))
  };
}

function assertSurfaceBaseSetExact(bufferSet, alias, before, gl) {
  assert.equal(bufferSet, before.bufferSet);
  assert.equal(bufferSet.segments, before.segments);
  assert.equal(alias, before.alias);
  assert.equal(alias, bufferSet.segments[0].buffer);
  assert.equal(bufferSet.segments.length, before.descriptors.length);
  for (let index = 0; index < before.descriptors.length; index++) {
    const actual = bufferSet.segments[index];
    const expected = before.descriptors[index];
    assert.equal(actual, expected.segment);
    assert.equal(actual.buffer, expected.buffer);
    assert.equal(actual.floatStart, expected.floatStart);
    assert.equal(actual.floatEnd, expected.floatEnd);
    assert.equal(gl.isBuffer(actual.buffer), true);
    assert.deepEqual(actual.buffer.bytes, expected.bytes);
  }
}

function assertSurfaceBaseSetMatches(bufferSet, alias, values, gl) {
  assert.equal(alias, bufferSet.segments[0].buffer);
  assert.equal(bufferSet.floatLength, values.length);
  assert.equal(bufferSet.byteLength, values.byteLength);
  let cursor = 0;
  let hash = 2166136261;
  let bytes = 0;
  for (const segment of bufferSet.segments) {
    assert.equal(segment.floatStart, cursor);
    assert.equal(segment.floatEnd % 18, 0);
    assert.equal(segment.floatLength, segment.floatEnd - segment.floatStart);
    assert.equal(segment.byteLength, segment.floatLength * Float32Array.BYTES_PER_ELEMENT);
    assert.ok(segment.byteLength <= 8 * 1024 * 1024);
    assert.equal(segment.vertexCount, segment.floatLength / 6);
    assert.equal(segment.triangleCount, segment.floatLength / 18);
    assert.equal(gl.isBuffer(segment.buffer), true);
    assert.equal(segment.buffer.bytes.byteLength, segment.byteLength);
    hash = hashBytes(segment.buffer.bytes, hash);
    bytes += segment.buffer.bytes.byteLength;
    cursor = segment.floatEnd;
  }
  const expectedBytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
  assert.equal(cursor, values.length);
  assert.equal(bytes, expectedBytes.byteLength);
  assert.equal(hash, hashBytes(expectedBytes));
}

function hashBytes(values, initial = 2166136261) {
  let hash = initial;
  for (const value of values) {
    hash ^= value;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
