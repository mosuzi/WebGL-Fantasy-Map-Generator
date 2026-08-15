import assert from "node:assert/strict";

import {prepareRendererWorkerInstall} from "../app/webgl-generator/src/renderer/prepared-render-installer.js";
import {
  SURFACE_BASE_MAX_SEGMENT_FLOATS,
  createSurfaceBaseBufferSet,
  flattenSurfaceBaseBufferSet
} from "../app/webgl-generator/src/renderer/surface-base-buffer-set.js";
import {
  collectCellAttributeTextures,
  createCellAttributeStore
} from "../app/webgl-generator/src/renderer/cell-attribute-store.js";
import {
  createCellVisualCorrectionBufferSet,
  flattenCellVisualCorrectionBufferSet
} from "../app/webgl-generator/src/renderer/cell-visual-surface-correction.js";

class FakeGl {
  constructor() {
    this.ARRAY_BUFFER = 0x8892;
    this.STATIC_DRAW = 0x88e4;
    this.DYNAMIC_DRAW = 0x88e8;
    this.TEXTURE_2D = 0x0de1;
    this.TEXTURE_MIN_FILTER = 0x2801;
    this.TEXTURE_MAG_FILTER = 0x2800;
    this.TEXTURE_WRAP_S = 0x2802;
    this.TEXTURE_WRAP_T = 0x2803;
    this.NEAREST = 0x2600;
    this.CLAMP_TO_EDGE = 0x812f;
    this.RGBA32UI = 0x8d70;
    this.RGBA_INTEGER = 0x8d99;
    this.UNSIGNED_INT = 0x1405;
    this.RGBA32F = 0x8814;
    this.RGBA = 0x1908;
    this.FLOAT = 0x1406;
    this.RGBA8 = 0x8058;
    this.UNSIGNED_BYTE = 0x1401;
    this.MAX_TEXTURE_SIZE = 0x0d33;
    this.buffers = [];
    this.textures = [];
    this.boundBuffer = null;
    this.boundTexture = null;
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

  createTexture() {
    const texture = {id: this.textures.length + 1, bytes: new Uint8Array(), deleted: false};
    this.textures.push(texture);
    return texture;
  }

  bindTexture(target, texture) {
    assert.equal(target, this.TEXTURE_2D);
    assert.equal(this.isTexture(texture), true);
    this.boundTexture = texture;
  }

  texParameteri() {}

  texImage2D(target, level, internalFormat, width, height, border, format, type, source) {
    assert.equal(target, this.TEXTURE_2D);
    assert.ok(this.boundTexture);
    this.boundTexture.bytes = new Uint8Array(source.buffer, source.byteOffset, source.byteLength).slice();
    this.boundTexture.width = width;
    this.boundTexture.height = height;
  }

  getParameter(parameter) {
    if (parameter === this.MAX_TEXTURE_SIZE) return 4096;
    return null;
  }

  isTexture(texture) {
    return Boolean(texture && this.textures.includes(texture) && !texture.deleted);
  }

  deleteTexture(texture) {
    if (!this.isTexture(texture)) throw new Error(`double-delete-texture:${texture?.id ?? "missing"}`);
    texture.deleted = true;
  }
}

const binding = {mapIdentity: "task322-segmented-installer", mapRevision: 1};

await testUncommittedCleanup();
await testCommittedRollbackAndFinalize();
await testCommitFaultRollback();
await testNestedRollbackOwnership();
await testNestedFinalizeOwnership();
await testSurfaceColorPatchTransaction();
await testInPlaceSurfaceColorPatchTransaction();
await testGridSurfaceRangeContract();
await testPointDrawRangeContract();

console.log(JSON.stringify({ok: true, cases: 9, nestedOwnership: true, surfaceColorPatch: true, inPlaceSurfaceColorPatch: true, gridSurfaceRanges: true, pointDrawRanges: true}));

async function testUncommittedCleanup() {
  const gl = new FakeGl();
  const renderer = createRenderer(gl);
  const beforeSet = renderer.surfaceBaseBufferSet;
  const beforeAlias = renderer.vertexBuffer;
  const liveBefore = liveBuffers(gl);
  const textureBefore = liveTextures(gl);
  const transaction = await prepareSurfaceTransaction(renderer, largeSurface(11));
  const preparedBuffers = liveBuffers(gl).filter(buffer => !liveBefore.includes(buffer));
  assert.ok(preparedBuffers.length >= 6);
  assert.equal(transaction.rollback(), true);
  assert.equal(renderer.surfaceBaseBufferSet, beforeSet);
  assert.equal(renderer.vertexBuffer, beforeAlias);
  assert.ok(preparedBuffers.every(buffer => !gl.isBuffer(buffer)));
  assert.ok(liveTextures(gl).every(texture => textureBefore.includes(texture)));
  assert.equal(transaction.finalize(), false);
}

async function testCommittedRollbackAndFinalize() {
  const rollbackGl = new FakeGl();
  const rollbackRenderer = createRenderer(rollbackGl);
  const rollbackBeforeSet = rollbackRenderer.surfaceBaseBufferSet;
  const rollbackBeforeCorrection = rollbackRenderer.cellVisualCorrectionBufferSet;
  const rollbackBeforeAlias = rollbackRenderer.vertexBuffer;
  const rollbackBeforeAttributes = rollbackRenderer.cellAttributeStore;
  const rollbackValues = largeSurface(21);
  const rollbackTransaction = await prepareSurfaceTransaction(rollbackRenderer, rollbackValues);
  rollbackTransaction.commit();
  const committedSet = rollbackRenderer.surfaceBaseBufferSet;
  const committedCorrection = rollbackRenderer.cellVisualCorrectionBufferSet;
  const committedAttributes = rollbackRenderer.cellAttributeStore;
  assert.notEqual(committedSet, rollbackBeforeSet);
  assertSurfaceBaseSetMatches(committedSet, rollbackRenderer.vertexBuffer, rollbackValues, rollbackGl);
  assert.equal(rollbackTransaction.rollback(), true);
  assert.equal(rollbackRenderer.surfaceBaseBufferSet, rollbackBeforeSet);
  assert.equal(rollbackRenderer.cellVisualCorrectionBufferSet, rollbackBeforeCorrection);
  assert.equal(rollbackRenderer.vertexBuffer, rollbackBeforeAlias);
  assert.equal(rollbackRenderer.cellAttributeStore, rollbackBeforeAttributes);
  assert.ok(flattenSurfaceBaseBufferSet(committedSet).every(buffer => !rollbackGl.isBuffer(buffer)));
  assert.ok(flattenCellVisualCorrectionBufferSet(committedCorrection).every(buffer => !rollbackGl.isBuffer(buffer)));
  assert.ok(flattenCellVisualCorrectionBufferSet(rollbackBeforeCorrection).every(buffer => rollbackGl.isBuffer(buffer)));
  assert.ok(flattenSurfaceBaseBufferSet(rollbackBeforeSet).every(buffer => rollbackGl.isBuffer(buffer)));
  assert.ok(collectCellAttributeTextures(committedAttributes).every(texture => !rollbackGl.isTexture(texture)));
  assert.ok(collectCellAttributeTextures(rollbackBeforeAttributes).every(texture => rollbackGl.isTexture(texture)));

  const finalizeGl = new FakeGl();
  const finalizeRenderer = createRenderer(finalizeGl);
  const finalizeBeforeSet = finalizeRenderer.surfaceBaseBufferSet;
  const finalizeBeforeCorrection = finalizeRenderer.cellVisualCorrectionBufferSet;
  const finalizeBeforeAttributes = finalizeRenderer.cellAttributeStore;
  const finalizeTransaction = await prepareSurfaceTransaction(finalizeRenderer, smallSurface(22));
  finalizeTransaction.commit();
  const finalizedSet = finalizeRenderer.surfaceBaseBufferSet;
  const finalizedCorrection = finalizeRenderer.cellVisualCorrectionBufferSet;
  const finalizedAttributes = finalizeRenderer.cellAttributeStore;
  assert.equal(finalizeTransaction.finalize(), true);
  assert.ok(flattenSurfaceBaseBufferSet(finalizeBeforeSet).every(buffer => !finalizeGl.isBuffer(buffer)));
  assert.ok(flattenCellVisualCorrectionBufferSet(finalizeBeforeCorrection).every(buffer => !finalizeGl.isBuffer(buffer)));
  assert.ok(flattenCellVisualCorrectionBufferSet(finalizedCorrection).every(buffer => finalizeGl.isBuffer(buffer)));
  assert.ok(flattenSurfaceBaseBufferSet(finalizedSet).every(buffer => finalizeGl.isBuffer(buffer)));
  assert.equal(finalizeRenderer.vertexBuffer, finalizedSet.segments[0].buffer);
  assert.ok(collectCellAttributeTextures(finalizeBeforeAttributes).every(texture => !finalizeGl.isTexture(texture)));
  assert.ok(collectCellAttributeTextures(finalizedAttributes).every(texture => finalizeGl.isTexture(texture)));
}

async function testCommitFaultRollback() {
  const gl = new FakeGl();
  const renderer = createRenderer(gl);
  const beforeSet = renderer.surfaceBaseBufferSet;
  const beforeAlias = renderer.vertexBuffer;
  const beforeSurface = captureSurfaceBaseSet(beforeSet, beforeAlias);
  const beforeAttributes = renderer.cellAttributeStore;
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
  assert.equal(renderer.cellAttributeStore, beforeAttributes);
  assert.ok(collectCellAttributeTextures(beforeAttributes).every(texture => gl.isTexture(texture)));
  assert.ok(preparedBuffers.every(buffer => !gl.isBuffer(buffer)));
  assert.equal(transaction.rollback(), false);
}

async function testNestedRollbackOwnership() {
  const gl = new FakeGl();
  const renderer = createRenderer(gl);
  const outer = await prepareSurfaceTransaction(renderer, smallSurface(41));
  outer.commit();
  const outerSet = renderer.surfaceBaseBufferSet;
  const outerAttributes = renderer.cellAttributeStore;
  renderer.nextMap = createMapFixture("nested-rollback");
  const inner = await prepareSurfaceTransaction(renderer, smallSurface(42));
  inner.commit();
  const innerSet = renderer.surfaceBaseBufferSet;
  const innerAttributes = renderer.cellAttributeStore;
  assert.equal(outer.finalize(), true);
  assert.ok(flattenSurfaceBaseBufferSet(outerSet).every(buffer => gl.isBuffer(buffer)), "inner rollback ownership 必须保留 outer set");
  assert.ok(collectCellAttributeTextures(outerAttributes).every(texture => gl.isTexture(texture)));
  assert.equal(inner.rollback(), true);
  assert.equal(renderer.surfaceBaseBufferSet, outerSet);
  assert.equal(renderer.vertexBuffer, outerSet.segments[0].buffer);
  assert.equal(renderer.cellAttributeStore, outerAttributes);
  assert.ok(flattenSurfaceBaseBufferSet(outerSet).every(buffer => gl.isBuffer(buffer)));
  assert.ok(flattenSurfaceBaseBufferSet(innerSet).every(buffer => !gl.isBuffer(buffer)));
  assert.ok(collectCellAttributeTextures(innerAttributes).every(texture => !gl.isTexture(texture)));
}

async function testNestedFinalizeOwnership() {
  const gl = new FakeGl();
  const renderer = createRenderer(gl);
  const outer = await prepareSurfaceTransaction(renderer, smallSurface(51));
  outer.commit();
  const outerSet = renderer.surfaceBaseBufferSet;
  const outerAttributes = renderer.cellAttributeStore;
  renderer.nextMap = createMapFixture("nested-finalize");
  const inner = await prepareSurfaceTransaction(renderer, smallSurface(52));
  inner.commit();
  const innerSet = renderer.surfaceBaseBufferSet;
  const innerAttributes = renderer.cellAttributeStore;
  assert.equal(inner.finalize(), true);
  assert.ok(flattenSurfaceBaseBufferSet(outerSet).every(buffer => gl.isBuffer(buffer)), "outer transaction owner 必须保留 detached set");
  assert.ok(collectCellAttributeTextures(outerAttributes).every(texture => gl.isTexture(texture)));
  assert.equal(outer.finalize(), true);
  assert.ok(flattenSurfaceBaseBufferSet(outerSet).every(buffer => !gl.isBuffer(buffer)));
  assert.ok(collectCellAttributeTextures(outerAttributes).every(texture => !gl.isTexture(texture)));
  assert.ok(collectCellAttributeTextures(innerAttributes).every(texture => gl.isTexture(texture)));
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

async function testInPlaceSurfaceColorPatchTransaction() {
  const gl = new FakeGl();
  const renderer = createRenderer(gl);
  renderer.map = renderer.nextMap;
  renderer.surfaceCellRanges = new Map([[0, {start: 0, end: 18}]]);
  const beforeSet = renderer.surfaceBaseBufferSet;
  const beforeSegments = beforeSet.segments;
  const beforeAlias = renderer.vertexBuffer;
  const beforeVertices = renderer.surfaceVertices;
  const beforeCpu = bytesOf(beforeVertices);
  const beforeGpu = beforeSet.segments.map(segment => ({
    geometry: segment.geometryBuffer.bytes.slice(),
    colors: segment.colorBuffer.bytes.slice()
  }));
  const prepared = createColorPatchPrepared([0.1, 0.2, 0.3, 0.75]);
  const liveBefore = liveBuffers(gl);
  const transaction = await prepareRendererWorkerInstall(renderer, renderer.map, prepared, {
    binding,
    inPlaceSurfaceColorPatch: true,
    budgetMs: 1,
    yieldToMain: async () => {}
  });
  const preparedBuffers = liveBuffers(gl).filter(buffer => !liveBefore.includes(buffer));
  assert.equal(preparedBuffers.length, 5, "原位颜色补丁只允许准备岸线与 patch buffers");
  assert.equal(renderer.surfaceBaseBufferSet, beforeSet);
  assert.equal(renderer.surfaceVertices, beforeVertices);
  assert.deepEqual(bytesOf(beforeVertices), beforeCpu);
  assert.equal(await transaction.prepareCommit(), true);
  assert.equal(renderer.surfaceBaseBufferSet, beforeSet);
  assert.equal(renderer.surfaceBaseBufferSet.segments, beforeSegments);
  assert.equal(renderer.vertexBuffer, beforeAlias);
  assert.equal(renderer.surfaceVertices, beforeVertices);
  const expectedColor = [...new Float32Array([0.1, 0.2, 0.3, 0.75])];
  for (let offset = 0; offset < beforeVertices.length; offset += 6) {
    assert.deepEqual([...beforeVertices.subarray(offset + 2, offset + 6)], expectedColor);
  }
  assert.deepEqual(beforeSet.segments.map(segment => [...segment.geometryBuffer.bytes]), beforeGpu.map(entry => [...entry.geometry]));
  assert.deepEqual([...new Float32Array(beforeSet.segments[0].colorBuffer.bytes.buffer)], [...expectedColor, ...expectedColor, ...expectedColor].filter((_, index) => index % 4 !== 3));
  transaction.commit();
  assert.equal(renderer.surfaceBaseBufferSet, beforeSet);
  assert.equal(renderer.surfaceVertices, beforeVertices);
  assert.equal(await transaction.rollbackAsync(), true);
  assert.deepEqual(bytesOf(beforeVertices), beforeCpu);
  assert.deepEqual(beforeSet.segments.map(segment => [...segment.geometryBuffer.bytes]), beforeGpu.map(entry => [...entry.geometry]));
  assert.deepEqual(beforeSet.segments.map(segment => [...segment.colorBuffer.bytes]), beforeGpu.map(entry => [...entry.colors]));
  assert.ok(preparedBuffers.every(buffer => !gl.isBuffer(buffer)));

  const detached = await prepareRendererWorkerInstall(renderer, renderer.map, prepared, {
    binding,
    inPlaceSurfaceColorPatch: true,
    yieldToMain: async () => {}
  });
  await detached.prepareCommit();
  const newVertices = smallSurface(77);
  const newSet = createSurfaceBaseBufferSet(gl, newVertices);
  renderer.map = {id: "replacement-map"};
  renderer.surfaceVertices = newVertices;
  renderer.surfaceBaseBufferSet = newSet;
  renderer.vertexBuffer = newSet.segments[0].buffer;
  const replacementBytes = bytesOf(newVertices);
  await detached.rollbackAsync();
  assert.equal(renderer.surfaceBaseBufferSet, newSet);
  assert.equal(renderer.surfaceVertices, newVertices);
  assert.deepEqual(bytesOf(newVertices), replacementBytes, "detached rollback 不得覆写新地图 surface");
}

async function testGridSurfaceRangeContract() {
  const gl = new FakeGl();
  const renderer = createRenderer(gl);
  const liveBefore = liveBuffers(gl);
  const texturesBefore = liveTextures(gl);
  await assert.rejects(
    prepareSurfaceTransaction(renderer, smallSurface(61), {surfaceCellRanges: new Map()}),
    error => error?.code === "render-surface-ranges-shape" && /未覆盖完整 grid/.test(error.message)
  );
  assert.deepEqual(liveBuffers(gl), liveBefore, "无效 grid-cells ranges 不得泄漏 GPU buffer");
  assert.deepEqual(liveTextures(gl), texturesBefore, "无效 grid-cells ranges 不得泄漏 cell attribute texture");
}

function createColorPatchPrepared(colors) {
  return {
    binding,
    presentation: {},
    layers: {
      surface: {
        mode: "cell-colors",
        scope: "water",
        cellIds: new Uint32Array([0]),
        colors: new Float32Array(colors),
        landCorrections: new Float32Array(),
        waterCorrections: new Float32Array(),
        landCovers: new Float32Array(),
        waterCovers: new Float32Array(),
        shoreSurfaceCellRanges: emptyShoreRanges()
      }
    }
  };
}

function bytesOf(values) {
  return new Uint8Array(values.buffer, values.byteOffset, values.byteLength).slice();
}

async function prepareSurfaceTransaction(renderer, base, {surfaceCellRanges = new Map([[0, {start: 0, end: base.length}]])} = {}) {
  const prepared = {
    binding,
    layers: {
      surface: {
        base,
        cellVisualCorrection: smallCorrection(base[0]),
        landCorrections: new Float32Array(),
        waterCorrections: new Float32Array(),
        landCovers: new Float32Array(),
        waterCovers: new Float32Array(),
        surfaceCellRanges,
        surfaceCellRangesMode: "grid-cells",
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

async function testPointDrawRangeContract() {
  const gl = new FakeGl(), renderer = createRenderer(gl), beforeBuffer = renderer.pointBuffer, beforeRanges = renderer.pointDrawRanges;
  const vertices = new Float32Array(18), drawRanges = [{layer: "cities", first: 0, count: 1}, {layer: "resources", first: 1, count: 2}];
  const transaction = await prepareRendererWorkerInstall(renderer, renderer.nextMap, {binding, layers: {point: {vertices, drawRanges}}}, {binding, yieldToMain: async () => {}});
  transaction.commit();
  assert.notEqual(renderer.pointBuffer, beforeBuffer);
  assert.equal(renderer.pointDrawRanges, drawRanges);
  assert.deepEqual([renderer.pointBufferVertexCount, renderer.pointVertexCount], [3, 3]);
  transaction.rollback();
  assert.equal(renderer.pointBuffer, beforeBuffer);
  assert.equal(renderer.pointDrawRanges, beforeRanges);
  for (const invalid of [null, [{layer: "cities", first: 1, count: 2}], [{layer: "unknown", first: 0, count: 3}], [{layer: "cities", first: 0, count: 2}]]) {
    await assert.rejects(prepareRendererWorkerInstall(renderer, renderer.nextMap, {binding, layers: {point: {vertices, drawRanges: invalid}}}, {binding, yieldToMain: async () => {}}), error => error?.code === "render-point-ranges-shape");
  }
}

function createRenderer(gl) {
  const surfaceVertices = smallSurface(1);
  const surfaceBaseBufferSet = createSurfaceBaseBufferSet(gl, surfaceVertices);
  const cellVisualCorrectionGeometry = smallCorrection(1);
  const cellVisualCorrectionBufferSet = createCellVisualCorrectionBufferSet(gl, cellVisualCorrectionGeometry, gl.STATIC_DRAW);
  const map = createMapFixture("old-map");
  const renderer = {
    gl,
    map,
    nextMap: createMapFixture(binding.mapIdentity),
    cellAttributeStore: createCellAttributeStore(gl, map),
    surfaceBaseBufferSet,
    vertexBuffer: surfaceBaseBufferSet.segments[0].buffer,
    cellVisualCorrectionGeometry,
    cellVisualCorrectionBufferSet,
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
    layerVisibility: {population: true, cities: true, markers: true, resources: true, military: true},
    pointDrawRanges: [],
    pointBufferVertexCount: 0,
    pointVertexCount: 0,
    camera: {scale: 1, offsetX: 0, offsetY: 0}
  };
  for (const key of ["landCorrectionBuffer", "waterCorrectionBuffer", "landCoverBuffer", "waterCoverBuffer", "surfacePatchBuffer", "pointBuffer"]) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(), gl.STATIC_DRAW);
    renderer[key] = buffer;
  }
  return renderer;
}

function createMapFixture(mapIdentity) {
  return {
    metadata: {mapIdentity},
    grid: {cells: {
      i: new Uint32Array([0]), h: new Uint8Array([10]), f: new Uint32Array([0]),
      state: new Int32Array([-1]), province: new Int32Array([-1]), culture: new Int32Array([-1]), religion: new Int32Array([-1]),
      biome: new Uint8Array([0]), pop: new Float32Array([0]), temp: new Int8Array([0]), prec: new Uint8Array([0]), region: new Int32Array([-1])
    }},
    features: {features: [{land: false}]},
    layers: {ocean: [0.2, 0.4, 0.7, 1]},
    politics: {states: [], provinces: []},
    society: {cultures: [], religions: []},
    climate: {biomes: []},
    settlements: {metadata: {maxPopulation: 1}}
  };
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

function smallCorrection(seed) {
  const values = new Float32Array(9);
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

function liveTextures(gl) {
  return gl.textures.filter(texture => gl.isTexture(texture));
}

function captureSurfaceBaseSet(bufferSet, alias) {
  return {
    bufferSet,
    segments: bufferSet.segments,
    alias,
    descriptors: bufferSet.segments.map(segment => ({
      segment,
      buffer: segment.buffer,
      colorBuffer: segment.colorBuffer,
      floatStart: segment.floatStart,
      floatEnd: segment.floatEnd,
      bytes: segment.buffer.bytes.slice(),
      colorBytes: segment.colorBuffer.bytes.slice()
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
    assert.equal(actual.colorBuffer, expected.colorBuffer);
    assert.equal(actual.floatStart, expected.floatStart);
    assert.equal(actual.floatEnd, expected.floatEnd);
    assert.equal(gl.isBuffer(actual.buffer), true);
    assert.equal(gl.isBuffer(actual.colorBuffer), true);
    assert.deepEqual(actual.buffer.bytes, expected.bytes);
    assert.deepEqual(actual.colorBuffer.bytes, expected.colorBytes);
  }
}

function assertSurfaceBaseSetMatches(bufferSet, alias, values, gl) {
  assert.equal(alias, bufferSet.segments[0].buffer);
  assert.equal(bufferSet.floatLength, values.length);
  assert.equal(bufferSet.byteLength, values.length / 6 * 12);
  assert.equal(bufferSet.colorByteLength, values.length / 6 * 12);
  let cursor = 0;
  let geometryBytes = 0;
  let colorBytes = 0;
  for (const segment of bufferSet.segments) {
    assert.equal(segment.floatStart, cursor);
    assert.equal(segment.floatEnd % 18, 0);
    assert.equal(segment.floatLength, segment.floatEnd - segment.floatStart);
    assert.equal(segment.byteLength, segment.vertexCount * 12);
    assert.equal(segment.colorByteLength, segment.vertexCount * 12);
    assert.ok(segment.byteLength <= 8 * 1024 * 1024);
    assert.equal(segment.vertexCount, segment.floatLength / 6);
    assert.equal(segment.triangleCount, segment.floatLength / 18);
    assert.equal(gl.isBuffer(segment.buffer), true);
    assert.equal(gl.isBuffer(segment.colorBuffer), true);
    assert.equal(segment.buffer.bytes.byteLength, segment.byteLength);
    assert.equal(segment.colorBuffer.bytes.byteLength, segment.colorByteLength);
    const geometry = new Float32Array(segment.buffer.bytes.buffer, segment.buffer.bytes.byteOffset, segment.buffer.bytes.byteLength / 4);
    const startVertex = segment.floatStart / 6;
    for (let vertex = 0; vertex < segment.vertexCount; vertex++) {
      assert.equal(geometry[vertex * 3], values[(startVertex + vertex) * 6]);
      assert.equal(geometry[vertex * 3 + 1], values[(startVertex + vertex) * 6 + 1]);
      const sourceOffset = (startVertex + vertex) * 6;
      const colors = new Float32Array(segment.colorBuffer.bytes.buffer, segment.colorBuffer.bytes.byteOffset, segment.colorBuffer.bytes.byteLength / 4);
      assert.deepEqual([...colors.subarray(vertex * 3, vertex * 3 + 3)], [...values.subarray(sourceOffset + 2, sourceOffset + 5)]);
    }
    geometryBytes += segment.buffer.bytes.byteLength;
    colorBytes += segment.colorBuffer.bytes.byteLength;
    cursor = segment.floatEnd;
  }
  assert.equal(cursor, values.length);
  assert.equal(geometryBytes, bufferSet.byteLength);
  assert.equal(colorBytes, bufferSet.colorByteLength);
}

function hashBytes(values, initial = 2166136261) {
  let hash = initial;
  for (const value of values) {
    hash ^= value;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
