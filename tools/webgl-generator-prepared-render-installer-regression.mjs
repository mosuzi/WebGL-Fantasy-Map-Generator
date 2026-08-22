import assert from "node:assert/strict";

import {prepareRendererWorkerInstall} from "../app/webgl-generator/src/renderer/prepared-render-installer.js";
import {PlaceholderMapRenderer} from "../app/webgl-generator/src/renderer/placeholder-renderer.js";
import {
  SURFACE_BASE_MAX_SEGMENT_FLOATS,
  createSurfaceBaseBufferSet,
  createSurfaceResourceOwner,
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
import {createRenderRequestSourceBinding, createRenderResourceBinding} from "../app/webgl-generator/src/renderer/render-resource-binding.js";
import {
  adoptRenderCacheResourceBinding,
  assertRenderCacheResourceBindings,
  renderCacheResourceBindingMismatch
} from "../app/webgl-generator/src/renderer/render-cache-resource-binding.js";
import {buildObjectPickingDto} from "../app/webgl-generator/src/renderer/picking-dto.js";
import {buildObjectPickingIndex} from "../app/webgl-generator/src/renderer/picking.js";
import {createEditRefreshScheduler} from "../app/webgl-generator/src/runtime/edit-refresh-scheduler.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {MapRevisionTracker} from "../app/webgl-generator/src/runtime/map-revision.js";
import {
  adoptObjectPickingResourceBinding,
  adoptOverlayLabelResourceBinding,
  objectPickingResourceBindingMismatch,
  overlayLabelResourceBindingMismatch
} from "../app/webgl-generator/src/renderer/retained-render-resource-binding.js";

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

const binding = resourceBinding("task322-segmented-installer", 1, 1, "full:1", 1);
const inPlaceBinding = resourceBinding("old-map", 1, 1, "in-place:1", 0);

await testStrictBindingContract();
await testPartialRenderRequestTopology();
await testUncommittedCleanup();
await testCommittedRollbackAndFinalize();
await testCommitFaultRollback();
await testNestedRollbackOwnership();
await testNestedFinalizeOwnership();
await testSurfaceColorPatchTransaction();
await testInPlaceSurfaceColorPatchTransaction();
await testInPlaceCommitFaultRollback();
await testInPlaceRollbackYieldSuperseded();
await testLatestIssuedTransactions();
await testAbandonedReplacementPartialRebind();
await testGridSurfaceRangeContract();
await testPointDrawRangeContract();
await testRetainedResourceOwnerTransaction();
await testRetainedResourceOwnerCommitFaultRollback();
await testTradeFlowPickResourceOwner();
await testFullSurfaceRetainedCacheRebind();
await testRetainedRefreshBindingPropagation();
await testConservativeTopologyRetainedIntegration();

console.log(JSON.stringify({ok: true, cases: 21, strictBinding: true, partialRenderTopology: true, latestIssued: true, abandonedReplacementPartialRebind: true, nestedOwnership: true, surfaceColorPatch: true, inPlaceSurfaceColorPatch: true, inPlaceCommitFault: true, rollbackYieldSuperseded: true, retainedResourceOwners: true, retainedOwnerCommitFault: true, fullSurfaceRetainedCacheRebind: true, retainedRefreshBinding: true, conservativeTopologyIntegration: true, tradeFlowPickOwner: true, asyncSurfacePublish: true, asyncSurfaceFaultInvalid: true, gridSurfaceRanges: true, pointDrawRanges: true}));

async function testStrictBindingContract() {
  const gl = new FakeGl();
  assert.throws(
    () => createSurfaceResourceOwner({mapIdentity: "old-map", mapRevision: 0, topologyRevision: 0}, {
      surfaceFloatLength: 18,
      correctionWordLength: 9,
      surfaceCellRanges: new Map([[0, {start: 0, end: 18}]])
    }),
    error => error?.code === "render-resource-binding-invalid"
  );
  const renderer = createRenderer(gl);
  for (const incomplete of [
    {mapIdentity: binding.mapIdentity, mapRevision: 1, topologyRevision: 1},
    {...binding, renderPreparationId: null},
    {...binding, renderGeneration: null}
  ]) {
    await assert.rejects(
      prepareRendererWorkerInstall(renderer, renderer.map, {binding: incomplete, layers: {}}, {binding: incomplete}),
      error => error?.code === "render-resource-binding-invalid"
    );
  }
}

async function testPartialRenderRequestTopology() {
  const source = {mapIdentity: "partial-map", mapRevision: 7, topologyRevision: 9};
  const surfaceOwner = resourceBinding("partial-map", 6, 3, "surface:6", 4);
  const partial = createRenderRequestSourceBinding(source, {
    sourceRevisionDelta: 1,
    topologyRevisionDelta: 1,
    replacesSurface: false,
    surfaceOwner
  });
  assert.deepEqual(
    {source: partial.sourceRevision, topology: partial.topologyRevision},
    {source: 8, topology: 3},
    "point/route-only render 必须推进 source revision，但沿用真实 surface topology"
  );
  const replacement = createRenderRequestSourceBinding(source, {
    sourceRevisionDelta: 1,
    topologyRevisionDelta: 1,
    replacesSurface: true,
    surfaceOwner
  });
  assert.deepEqual(
    {source: replacement.sourceRevision, topology: replacement.topologyRevision},
    {source: 8, topology: 10},
    "完整 surface replacement 才允许推进 topology owner"
  );
  assert.throws(
    () => createRenderRequestSourceBinding(source, {surfaceOwner: resourceBinding("other-map", 1, 1, "other:1", 1)}),
    error => error?.code === "render-resource-binding-invalid" && error?.path === "renderRequest.surfaceOwner.mapIdentity"
  );
}

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
  const innerBinding = resourceBinding("nested-rollback", 2, 2, "nested-rollback:2", 2);
  const inner = await prepareSurfaceTransaction(renderer, smallSurface(42), {preparedBinding: innerBinding});
  inner.commit();
  const innerSet = renderer.surfaceBaseBufferSet;
  const innerAttributes = renderer.cellAttributeStore;
  assert.equal(outer.finalize(), false, "inner commit 必须已自动 finalize 前一提交事务");
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
  const innerBinding = resourceBinding("nested-finalize", 2, 2, "nested-finalize:2", 2);
  const inner = await prepareSurfaceTransaction(renderer, smallSurface(52), {preparedBinding: innerBinding});
  inner.commit();
  const innerSet = renderer.surfaceBaseBufferSet;
  const innerAttributes = renderer.cellAttributeStore;
  assert.equal(inner.finalize(), true);
  assert.ok(flattenSurfaceBaseBufferSet(outerSet).every(buffer => !gl.isBuffer(buffer)));
  assert.ok(collectCellAttributeTextures(outerAttributes).every(texture => !gl.isTexture(texture)));
  assert.equal(outer.finalize(), false, "inner commit 前已自动 finalize outer");
  assert.ok(collectCellAttributeTextures(innerAttributes).every(texture => gl.isTexture(texture)));
  assert.ok(flattenSurfaceBaseBufferSet(innerSet).every(buffer => gl.isBuffer(buffer)));
  assert.equal(renderer.surfaceBaseBufferSet, innerSet);
  assert.equal(renderer.vertexBuffer, innerSet.segments[0].buffer);
}

async function testSurfaceColorPatchTransaction() {
  const gl = new FakeGl();
  const renderer = createRenderer(gl);
  const beforeSet = renderer.surfaceBaseBufferSet;
  const beforeOwner = renderer.surfaceResourceOwner;
  const beforeBinding = renderer.surfaceResourceBinding;
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
  assert.notEqual(renderer.surfaceResourceOwner, beforeOwner);
  assertSurfaceOwnerGroup(renderer);
  const expectedColor = [...new Float32Array([0.1, 0.2, 0.3, 0.75])];
  for (let offset = 0; offset < renderer.surfaceVertices.length; offset += 6) {
    assert.deepEqual([...renderer.surfaceVertices.subarray(offset + 2, offset + 6)], expectedColor);
  }
  assert.equal(transaction.rollback(), true);
  assert.equal(renderer.surfaceBaseBufferSet, beforeSet);
  assert.equal(renderer.surfaceVertices, beforeVertices);
  assert.equal(renderer.surfaceResourceOwner, beforeOwner);
  assert.equal(renderer.surfaceResourceBinding, beforeBinding);
  assertSurfaceOwnerGroup(renderer);
  assert.deepEqual(new Uint8Array(beforeVertices.buffer, beforeVertices.byteOffset, beforeVertices.byteLength), beforeBytes);
}

async function testInPlaceSurfaceColorPatchTransaction() {
  const gl = new FakeGl();
  const renderer = createRenderer(gl);
  const beforeSet = renderer.surfaceBaseBufferSet;
  const beforeOwner = renderer.surfaceResourceOwner;
  const beforeBinding = renderer.surfaceResourceBinding;
  const beforeSegments = beforeSet.segments;
  const beforeAlias = renderer.vertexBuffer;
  const beforeVertices = renderer.surfaceVertices;
  const beforeCpu = bytesOf(beforeVertices);
  const beforeGpu = beforeSet.segments.map(segment => ({
    geometry: segment.geometryBuffer.bytes.slice(),
    colors: segment.colorBuffer.bytes.slice()
  }));
  const beforePickingOwner = renderer.objectPickingResourceOwner;
  const beforePickingBinding = renderer.objectPickingResourceBinding;
  const beforeLabelOwner = renderer.labelLayoutResourceOwner;
  const beforeLabelBinding = renderer.labelLayoutResourceBinding;
  const beforeOverlayOwner = renderer.overlayResourceOwner;
  const beforeOverlayBinding = renderer.overlayResourceBinding;
  const prepared = createColorPatchPrepared([0.1, 0.2, 0.3, 0.75], inPlaceBinding);
  const liveBefore = liveBuffers(gl);
  const transaction = await prepareRendererWorkerInstall(renderer, renderer.map, prepared, {
    binding: inPlaceBinding,
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
  assert.notEqual(renderer.surfaceBaseBufferSet, beforeSet);
  assert.notEqual(renderer.surfaceBaseBufferSet.segments, beforeSegments);
  assert.ok(renderer.surfaceBaseBufferSet.segments.every((segment, index) => segment === beforeSegments[index]), "owner 换代不得重建物理 surface buffers");
  assert.equal(renderer.surfaceVertices, beforeVertices);
  assert.notEqual(renderer.surfaceResourceOwner, beforeOwner);
  assert.equal(renderer.surfaceResourceOwner.mapIdentity, beforeOwner.mapIdentity);
  assert.equal(renderer.surfaceResourceOwner.sourceRevision, inPlaceBinding.sourceRevision);
  assert.equal(renderer.surfaceResourceOwner.renderPreparationId, inPlaceBinding.renderPreparationId);
  assert.notEqual(renderer.surfaceResourceBinding, beforeBinding);
  assertSurfaceOwnerGroup(renderer);
  assert.deepEqual(renderer.objectPickingResourceOwner, inPlaceBinding, "surface-only commit 必须同步重绑 retained picking owner");
  assert.deepEqual(renderer.labelLayoutResourceOwner, inPlaceBinding, "surface-only commit 必须同步重绑 retained label owner");
  assert.deepEqual(renderer.overlayResourceOwner, inPlaceBinding, "surface-only commit 必须同步重绑 retained overlay owner");
  assert.equal(objectPickingResourceBindingMismatch(renderer), "");
  assert.equal(overlayLabelResourceBindingMismatch(renderer), "");
  assert.equal(await transaction.rollbackAsync(), true);
  assert.deepEqual(bytesOf(beforeVertices), beforeCpu);
  assert.deepEqual(beforeSet.segments.map(segment => [...segment.geometryBuffer.bytes]), beforeGpu.map(entry => [...entry.geometry]));
  assert.deepEqual(beforeSet.segments.map(segment => [...segment.colorBuffer.bytes]), beforeGpu.map(entry => [...entry.colors]));
  assert.ok(preparedBuffers.every(buffer => !gl.isBuffer(buffer)));
  assertSurfaceOwnerGroup(renderer);
  assert.equal(renderer.surfaceBaseBufferSet, beforeSet);
  assert.equal(renderer.cellVisualCorrectionBufferSet.owner, beforeOwner);
  assert.equal(renderer.objectPickingResourceOwner, beforePickingOwner);
  assert.equal(renderer.objectPickingResourceBinding, beforePickingBinding);
  assert.equal(renderer.labelLayoutResourceOwner, beforeLabelOwner);
  assert.equal(renderer.labelLayoutResourceBinding, beforeLabelBinding);
  assert.equal(renderer.overlayResourceOwner, beforeOverlayOwner);
  assert.equal(renderer.overlayResourceBinding, beforeOverlayBinding);

  const detached = await prepareRendererWorkerInstall(renderer, renderer.map, prepared, {
    binding: inPlaceBinding,
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

async function testLatestIssuedTransactions() {
  const fullGl = new FakeGl();
  const fullRenderer = createRenderer(fullGl);
  const fullA = resourceBinding(binding.mapIdentity, 1, 1, "full:A", 1);
  const fullB = resourceBinding(binding.mapIdentity, 1, 1, "full:B", 2);
  fullRenderer.latestIssuedRenderBinding = fullA;
  fullRenderer.nextRenderGeneration = 1;
  const fullTransactionA = await prepareSurfaceTransaction(fullRenderer, largeSurface(81), {preparedBinding: fullA});
  fullRenderer.latestIssuedRenderBinding = fullB;
  fullRenderer.nextRenderGeneration = 2;
  const fullTransactionB = await prepareSurfaceTransaction(fullRenderer, largeSurface(82), {preparedBinding: fullB});
  assert.throws(() => fullTransactionA.commit(), error => error?.code === "render-install-generation-stale" || error?.code === "render-install-preparation-stale");
  assert.equal(fullTransactionB.commit(), true);
  assert.equal(fullRenderer.surfaceResourceOwner.renderPreparationId, fullB.renderPreparationId);
  assert.equal(fullTransactionB.rollback(), true);

  const inPlaceGl = new FakeGl();
  const inPlaceRenderer = createRenderer(inPlaceGl);
  const patchA = resourceBinding("old-map", 1, 1, "patch:A", 0);
  const patchB = resourceBinding("old-map", 1, 1, "patch:B", 0);
  inPlaceRenderer.latestIssuedRenderBinding = patchA;
  const patchTransactionA = await prepareRendererWorkerInstall(
    inPlaceRenderer,
    inPlaceRenderer.map,
    createColorPatchPrepared([0.2, 0.3, 0.4, 0.8], patchA),
    {binding: patchA, inPlaceSurfaceColorPatch: true, yieldToMain: async () => {}}
  );
  inPlaceRenderer.latestIssuedRenderBinding = patchB;
  const patchTransactionB = await prepareRendererWorkerInstall(
    inPlaceRenderer,
    inPlaceRenderer.map,
    createColorPatchPrepared([0.4, 0.5, 0.6, 0.9], patchB),
    {binding: patchB, inPlaceSurfaceColorPatch: true, yieldToMain: async () => {}}
  );
  await assert.rejects(patchTransactionA.prepareCommit(), error => error?.code === "render-install-preparation-stale");
  assert.equal(patchTransactionA.rollback(), true);
  assert.equal(await patchTransactionB.prepareCommit(), true);
  assert.equal(patchTransactionB.commit(), true);
  assert.equal(await patchTransactionB.rollbackAsync(), true);

  const identityRenderer = createRenderer(new FakeGl());
  const crossIdentity = resourceBinding("other-map", 1, 1, "patch:cross-identity", 0);
  identityRenderer.latestIssuedRenderBinding = crossIdentity;
  await assert.rejects(
    prepareRendererWorkerInstall(
      identityRenderer,
      identityRenderer.map,
      createColorPatchPrepared([0.7, 0.6, 0.5, 0.8], crossIdentity),
      {binding: crossIdentity, inPlaceSurfaceColorPatch: true, yieldToMain: async () => {}}
    ),
    error => error?.code === "render-surface-color-patch-binding"
  );

  const sequenceRenderer = createRenderer(new FakeGl());
  const sequenceA = resourceBinding("old-map", 1, 1, "patch:sequence:A", 0);
  const sequenceB = resourceBinding("old-map", 1, 1, "patch:sequence:B", 0);
  sequenceRenderer.latestIssuedRenderBinding = sequenceA;
  const sequenceTransactionA = await prepareRendererWorkerInstall(
    sequenceRenderer,
    sequenceRenderer.map,
    createColorPatchPrepared([0.15, 0.25, 0.35, 0.75], sequenceA),
    {binding: sequenceA, inPlaceSurfaceColorPatch: true, yieldToMain: async () => {}}
  );
  await sequenceTransactionA.prepareCommit();
  sequenceTransactionA.commit();
  sequenceRenderer.latestIssuedRenderBinding = sequenceB;
  const sequenceTransactionB = await prepareRendererWorkerInstall(
    sequenceRenderer,
    sequenceRenderer.map,
    createColorPatchPrepared([0.55, 0.65, 0.75, 0.95], sequenceB),
    {binding: sequenceB, inPlaceSurfaceColorPatch: true, yieldToMain: async () => {}}
  );
  await sequenceTransactionB.prepareCommit();
  sequenceTransactionB.commit();
  const committedB = {
    owner: sequenceRenderer.surfaceResourceOwner,
    binding: sequenceRenderer.surfaceResourceBinding,
    bufferSet: sequenceRenderer.surfaceBaseBufferSet,
    colors: bytesOf(sequenceRenderer.surfaceVertices)
  };
  assert.equal(await sequenceTransactionA.rollbackAsync(), false, "B commit 后晚到 A rollback 必须成为 no-op");
  assert.equal(sequenceRenderer.surfaceResourceOwner, committedB.owner);
  assert.equal(sequenceRenderer.surfaceResourceBinding, committedB.binding);
  assert.equal(sequenceRenderer.surfaceBaseBufferSet, committedB.bufferSet);
  assert.deepEqual(bytesOf(sequenceRenderer.surfaceVertices), committedB.colors);
  assert.equal(await sequenceTransactionB.rollbackAsync(), true);
}

async function testAbandonedReplacementPartialRebind() {
  const gl = new FakeGl();
  const renderer = createRenderer(gl);
  renderer.issueRenderResourceBinding = (source, options) => PlaceholderMapRenderer.prototype.issueRenderResourceBinding.call(renderer, source, options);
  initializeRenderCacheFamilies(renderer);
  renderer.objectPickingIndex = buildObjectPickingIndex(renderer.map);
  adoptObjectPickingResourceBinding(renderer, renderer.surfaceResourceOwner);
  const original = {
    surfaceOwner: renderer.surfaceResourceOwner,
    surfaceBinding: renderer.surfaceResourceBinding,
    surfaceBase: renderer.surfaceBaseBufferSet,
    surfaceSegments: renderer.surfaceBaseBufferSet.segments,
    surfaceBuffers: flattenSurfaceBaseBufferSet(renderer.surfaceBaseBufferSet),
    correction: renderer.cellVisualCorrectionBufferSet,
    correctionSegments: renderer.cellVisualCorrectionBufferSet.segments,
    correctionBuffers: flattenCellVisualCorrectionBufferSet(renderer.cellVisualCorrectionBufferSet),
    pickingOwner: renderer.objectPickingResourceOwner,
    pickingBinding: renderer.objectPickingResourceBinding,
    labelOwner: renderer.labelLayoutResourceOwner,
    labelBinding: renderer.labelLayoutResourceBinding,
    overlayOwner: renderer.overlayResourceOwner,
    overlayBinding: renderer.overlayResourceBinding,
    cacheOwners: renderer.renderCacheResourceOwners,
    cacheBindings: renderer.renderCacheResourceBindings,
    cacheReferences: captureRenderCacheReferences(renderer)
  };
  const abandoned = renderer.issueRenderResourceBinding({
    mapIdentity: "old-map",
    sourceRevision: 1,
    topologyRevision: 1
  }, {replaceResources: true});
  assert.equal(abandoned.renderGeneration, 1, "失败的 surface replacement 必须预占下一代");
  const partialSource = createRenderRequestSourceBinding({
    mapIdentity: "old-map",
    sourceRevision: 1,
    topologyRevision: 1
  }, {
    sourceRevisionDelta: 1,
    topologyRevisionDelta: 1,
    replacesSurface: false,
    surfaceOwner: renderer.surfaceResourceOwner
  });
  const partial = renderer.issueRenderResourceBinding(partialSource, {replaceResources: false});
  assert.equal(partial.renderGeneration, abandoned.renderGeneration, "废弃换代后的 partial request 必须保持单调签发");
  assert.equal(renderer.latestIssuedRenderBinding, partial, "partial request 必须成为唯一 latest binding");
  const routeVertices = new Float32Array(18);
  const transaction = await prepareRendererWorkerInstall(renderer, renderer.map, {
    binding: partial,
    layers: {
      picking: buildObjectPickingDto(renderer.map, partial, ["cities", "routeSegments"]),
      route: {vertices: routeVertices, drawRanges: {
        ordinary: {first: 0, count: 3},
        seaLand: {first: 3, count: 0},
        seaWater: {first: 3, count: 0}
      }, stats: {}}
    }
  }, {binding: partial, yieldToMain: async () => {}});
  assert.equal(transaction.commit(), true);
  assert.equal(renderer.surfaceResourceOwner.renderGeneration, partial.renderGeneration, "partial commit 必须接续预占的 surface generation");
  assertSurfaceOwnerGroup(renderer);
  assert.notEqual(renderer.surfaceBaseBufferSet, original.surfaceBase, "partial generation 接续必须换 surface owner wrapper");
  assert.notEqual(renderer.surfaceBaseBufferSet.segments, original.surfaceSegments, "partial generation 接续必须换 surface segments wrapper");
  assert.deepEqual(renderer.surfaceBaseBufferSet.segments, original.surfaceSegments, "partial generation 接续不得替换 surface descriptors");
  assert.deepEqual(flattenSurfaceBaseBufferSet(renderer.surfaceBaseBufferSet), original.surfaceBuffers, "partial generation 接续不得替换 surface GPU buffers");
  assert.notEqual(renderer.cellVisualCorrectionBufferSet, original.correction, "partial generation 接续必须换 correction owner wrapper");
  assert.notEqual(renderer.cellVisualCorrectionBufferSet.segments, original.correctionSegments, "partial generation 接续必须换 correction segments wrapper");
  assert.deepEqual(renderer.cellVisualCorrectionBufferSet.segments, original.correctionSegments, "partial generation 接续不得替换 correction descriptors");
  assert.deepEqual(flattenCellVisualCorrectionBufferSet(renderer.cellVisualCorrectionBufferSet), original.correctionBuffers, "partial generation 接续不得替换 correction GPU buffers");
  assert.equal(renderer.objectPickingResourceOwner.renderGeneration, partial.renderGeneration);
  assert.equal(renderer.labelLayoutResourceOwner.renderGeneration, partial.renderGeneration);
  assert.equal(renderer.overlayResourceOwner.renderGeneration, partial.renderGeneration);
  assertRenderCacheResourceBindings(renderer);
  assert.ok(Object.values(renderer.renderCacheResourceOwners).every(owner => owner.renderGeneration === partial.renderGeneration), "partial commit 未原子重绑全部 cache owner");
  for (const [field, value] of Object.entries(original.cacheReferences)) {
    if (["routeBuffer", "routeDrawRanges", "routeBufferCamera"].includes(field)) continue;
    assert.equal(renderer[field], value, `partial generation 接续不得替换未准备 cache 物理引用: ${field}`);
  }
  assert.notEqual(renderer.routeBuffer, original.cacheReferences.routeBuffer, "prepared route 必须安装本次正式 route buffer");
  assert.equal(transaction.rollback(), true);
  assert.equal(renderer.surfaceResourceOwner, original.surfaceOwner);
  assert.equal(renderer.surfaceResourceBinding, original.surfaceBinding);
  assert.equal(renderer.surfaceBaseBufferSet, original.surfaceBase);
  assert.equal(renderer.cellVisualCorrectionBufferSet, original.correction);
  assert.equal(renderer.objectPickingResourceOwner, original.pickingOwner);
  assert.equal(renderer.objectPickingResourceBinding, original.pickingBinding);
  assert.equal(renderer.labelLayoutResourceOwner, original.labelOwner);
  assert.equal(renderer.labelLayoutResourceBinding, original.labelBinding);
  assert.equal(renderer.overlayResourceOwner, original.overlayOwner);
  assert.equal(renderer.overlayResourceBinding, original.overlayBinding);
  assert.equal(renderer.renderCacheResourceOwners, original.cacheOwners);
  assert.equal(renderer.renderCacheResourceBindings, original.cacheBindings);
  assertRenderCacheReferencesExact(renderer, original.cacheReferences);
  const nextReplacement = renderer.issueRenderResourceBinding({
    mapIdentity: "old-map",
    sourceRevision: 3,
    topologyRevision: 2
  }, {replaceResources: true});
  assert.ok(nextReplacement.renderGeneration > abandoned.renderGeneration, "下一次 surface replacement 必须越过废弃代际");

  const driftGl = new FakeGl();
  const driftRenderer = createRenderer(driftGl);
  driftRenderer.issueRenderResourceBinding = (source, options) => PlaceholderMapRenderer.prototype.issueRenderResourceBinding.call(driftRenderer, source, options);
  initializeRenderCacheFamilies(driftRenderer);
  driftRenderer.objectPickingIndex = buildObjectPickingIndex(driftRenderer.map);
  adoptObjectPickingResourceBinding(driftRenderer, driftRenderer.surfaceResourceOwner);
  driftRenderer.issueRenderResourceBinding({mapIdentity: "old-map", sourceRevision: 1, topologyRevision: 1}, {replaceResources: true});
  const driftPartial = driftRenderer.issueRenderResourceBinding(createRenderRequestSourceBinding({
    mapIdentity: "old-map",
    sourceRevision: 1,
    topologyRevision: 1
  }, {
    sourceRevisionDelta: 1,
    topologyRevisionDelta: 1,
    replacesSurface: false,
    surfaceOwner: driftRenderer.surfaceResourceOwner
  }), {replaceResources: false});
  const driftTransaction = await prepareRendererWorkerInstall(driftRenderer, driftRenderer.map, {
    binding: driftPartial,
    layers: {
      picking: buildObjectPickingDto(driftRenderer.map, driftPartial, ["cities", "routeSegments"]),
      route: {vertices: new Float32Array(18), drawRanges: {
        ordinary: {first: 0, count: 3},
        seaLand: {first: 3, count: 0},
        seaWater: {first: 3, count: 0}
      }, stats: {}}
    }
  }, {binding: driftPartial, yieldToMain: async () => {}});
  const driftOwnerBefore = driftRenderer.surfaceResourceOwner;
  const driftCachesBefore = driftRenderer.renderCacheResourceOwners;
  driftRenderer.surfaceResourceBinding = Object.freeze({...driftRenderer.surfaceResourceBinding, owner: driftPartial});
  assert.throws(
    () => driftTransaction.commit(),
    error => error?.code === "render-partial-surface-rebind-source",
    "partial generation 接续必须在任何写入前拒绝旧 surface wrapper 漂移"
  );
  assert.equal(driftRenderer.surfaceResourceOwner, driftOwnerBefore, "partial surface preflight 失败不得改写 owner");
  assert.equal(driftRenderer.renderCacheResourceOwners, driftCachesBefore, "partial surface preflight 失败不得改写 cache owner");
}

async function testInPlaceCommitFaultRollback() {
  const gl = new FakeGl();
  const renderer = createRenderer(gl);
  const faultBinding = resourceBinding("old-map", 1, 1, "patch:commit-fault", 0);
  renderer.latestIssuedRenderBinding = faultBinding;
  const before = {
    owner: renderer.surfaceResourceOwner,
    binding: renderer.surfaceResourceBinding,
    bufferSet: renderer.surfaceBaseBufferSet,
    correctionBufferSet: renderer.cellVisualCorrectionBufferSet,
    cpu: bytesOf(renderer.surfaceVertices),
    gpu: renderer.surfaceBaseBufferSet.segments.map(segment => segment.colorBuffer.bytes.slice())
  };
  const transaction = await prepareRendererWorkerInstall(
    renderer,
    renderer.map,
    createColorPatchPrepared([0.62, 0.52, 0.42, 0.82], faultBinding),
    {binding: faultBinding, inPlaceSurfaceColorPatch: true, yieldToMain: async () => {}}
  );
  await transaction.prepareCommit();
  let landCorrections = renderer.landCorrectionVertices;
  let faultPending = true;
  Object.defineProperty(renderer, "landCorrectionVertices", {
    configurable: true,
    get: () => landCorrections,
    set: value => {
      if (faultPending) {
        faultPending = false;
        throw new Error("in-place-commit-fault");
      }
      landCorrections = value;
    }
  });
  assert.throws(() => transaction.commit(), /in-place-commit-fault/);
  assert.equal(renderer.surfaceResourceOwner, before.owner, "commit fault 必须先同步恢复 source owner");
  assert.equal(renderer.surfaceBaseBufferSet, before.bufferSet);
  assert.equal(renderer.cellVisualCorrectionBufferSet, before.correctionBufferSet);
  assert.equal(await transaction.rollbackAsync(), true, "commit fault 后必须继续异步恢复颜色 before-image");
  assert.equal(renderer.surfaceResourceBinding, before.binding);
  assert.deepEqual(bytesOf(renderer.surfaceVertices), before.cpu);
  assert.deepEqual(renderer.surfaceBaseBufferSet.segments.map(segment => segment.colorBuffer.bytes), before.gpu);
}

async function testInPlaceRollbackYieldSuperseded() {
  const cellCount = 32768;
  const gl = new FakeGl();
  const renderer = createRenderer(gl, cellCount);
  const bindingA = resourceBinding("old-map", 1, 1, "patch:yield:A", 0);
  const bindingB = resourceBinding("old-map", 1, 1, "patch:yield:B", 0);
  let restorePhase = false;
  let transactionB = null;
  let committedB = null;
  const controlledYield = async () => {
    if (!restorePhase || committedB || !transactionB) return;
    await transactionB.prepareCommit();
    transactionB.commit();
    committedB = {
      owner: renderer.surfaceResourceOwner,
      binding: renderer.surfaceResourceBinding,
      bufferSet: renderer.surfaceBaseBufferSet,
      cpuHash: hashBytes(bytesOf(renderer.surfaceVertices)),
      gpuHashes: renderer.surfaceBaseBufferSet.segments.map(segment => hashBytes(segment.colorBuffer.bytes))
    };
  };
  renderer.latestIssuedRenderBinding = bindingA;
  const transactionA = await prepareRendererWorkerInstall(
    renderer,
    renderer.map,
    createManyColorPatchPrepared(cellCount, [0.12, 0.22, 0.32, 0.72], bindingA),
    {binding: bindingA, inPlaceSurfaceColorPatch: true, budgetMs: 1, yieldToMain: controlledYield}
  );
  await transactionA.prepareCommit();
  let landCorrections = renderer.landCorrectionVertices;
  let faultPending = true;
  Object.defineProperty(renderer, "landCorrectionVertices", {
    configurable: true,
    get: () => landCorrections,
    set: value => {
      if (faultPending) {
        faultPending = false;
        throw new Error("yield-rollback-commit-fault");
      }
      landCorrections = value;
    }
  });
  assert.throws(() => transactionA.commit(), /yield-rollback-commit-fault/);
  renderer.latestIssuedRenderBinding = bindingB;
  transactionB = await prepareRendererWorkerInstall(
    renderer,
    renderer.map,
    createManyColorPatchPrepared(cellCount, [0.62, 0.72, 0.82, 0.92], bindingB),
    {binding: bindingB, inPlaceSurfaceColorPatch: true, budgetMs: 1, yieldToMain: async () => {}}
  );
  restorePhase = true;
  let rollbackClock = 0;
  const rollbackResult = await transactionA.rollbackAsync({
    isCurrent: () => true,
    budgetMs: 1,
    now: () => {
      rollbackClock += 2;
      return rollbackClock;
    }
  });
  assert.ok(committedB, "受控 yield 必须真实提交 B");
  assert.equal(rollbackResult, false, "rollback yield 中被 B 接管后 A 必须停止");
  assert.equal(renderer.surfaceResourceOwner, committedB.owner);
  assert.equal(renderer.surfaceResourceBinding, committedB.binding);
  assert.equal(renderer.surfaceBaseBufferSet, committedB.bufferSet);
  assert.equal(hashBytes(bytesOf(renderer.surfaceVertices)), committedB.cpuHash);
  assert.deepEqual(renderer.surfaceBaseBufferSet.segments.map(segment => hashBytes(segment.colorBuffer.bytes)), committedB.gpuHashes);
  transactionB.finalize();
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

  renderer.nextMap = createMapFixture(binding.mapIdentity, 2);
  const zeroThenValid = new Map([[0, {start: 0, end: 0}], [1, {start: 0, end: 18}]]);
  await assert.rejects(
    prepareSurfaceTransaction(renderer, smallSurface(62), {surfaceCellRanges: zeroThenValid}),
    error => error?.code === "render-surface-ranges-shape" && /偏移无效/.test(error.message),
    "零长度 grid cell 不得提交为成功画面"
  );

  const allZero = new Map([[0, {start: 0, end: 0}], [1, {start: 0, end: 0}]]);
  await assert.rejects(
    prepareSurfaceTransaction(renderer, new Float32Array(), {surfaceCellRanges: allZero}),
    error => error?.code === "render-surface-ranges-shape" && /偏移无效/.test(error.message)
  );
}

function createColorPatchPrepared(colors, preparedBinding = binding) {
  return {
    binding: preparedBinding,
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

function createManyColorPatchPrepared(cellCount, color, preparedBinding) {
  const colors = new Float32Array(cellCount * 4);
  for (let cell = 0; cell < cellCount; cell++) colors.set(color, cell * 4);
  const prepared = createColorPatchPrepared(colors, preparedBinding);
  prepared.layers.surface.scope = "all";
  prepared.layers.surface.cellIds = Uint32Array.from({length: cellCount}, (_, cell) => cell);
  return prepared;
}

function bytesOf(values) {
  return new Uint8Array(values.buffer, values.byteOffset, values.byteLength).slice();
}

function resourceBinding(mapIdentity, mapRevision, topologyRevision, renderPreparationId, renderGeneration) {
  return createRenderResourceBinding({mapIdentity, mapRevision, topologyRevision}, {renderPreparationId, renderGeneration});
}

function assertSurfaceOwnerGroup(renderer) {
  const owner = renderer.surfaceResourceOwner;
  const resourceBinding = renderer.surfaceResourceBinding;
  assert.ok(owner);
  assert.equal(renderer.surfaceBaseBufferSet.owner, owner);
  assert.equal(renderer.cellVisualCorrectionBufferSet.owner, owner);
  assert.equal(renderer.surfaceVerticesOwner, owner);
  assert.equal(renderer.surfaceCellRangesOwner, owner);
  assert.equal(renderer.cellVisualCorrectionGeometryOwner, owner);
  assert.equal(renderer.cellAttributeStoreOwner, owner);
  assert.equal(resourceBinding.owner, owner);
  assert.equal(resourceBinding.surfaceVertices, renderer.surfaceVertices);
  assert.equal(resourceBinding.surfaceCellRanges, renderer.surfaceCellRanges);
  assert.equal(resourceBinding.cellVisualCorrectionGeometry, renderer.cellVisualCorrectionGeometry);
  assert.equal(resourceBinding.cellAttributeStore, renderer.cellAttributeStore);
}

async function prepareSurfaceTransaction(renderer, base, {
  surfaceCellRanges = new Map([[0, {start: 0, end: base.length}]]),
  preparedBinding = binding
} = {}) {
  const prepared = {
    binding: preparedBinding,
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
    binding: preparedBinding,
    budgetMs: 1,
    yieldToMain: async () => {}
  });
}

async function prepareFullSurfaceTransaction(renderer, preparedBinding, map = renderer.map, installOptions = {}) {
  const base = smallSurface(88);
  const prepared = {
    binding: preparedBinding,
    layers: {
      surface: {
        base,
        cellVisualCorrection: smallCorrection(88),
        landCorrections: new Float32Array(),
        waterCorrections: new Float32Array(),
        landCovers: new Float32Array(),
        waterCovers: new Float32Array(),
        surfaceCellRanges: new Map([[0, {start: 0, end: base.length}]]),
        surfaceCellRangesMode: "grid-cells",
        shoreSurfaceCellRanges: emptyShoreRanges()
      }
    }
  };
  return prepareRendererWorkerInstall(renderer, map, prepared, {
    binding: preparedBinding,
    ...installOptions,
    yieldToMain: async () => {}
  });
}

function initializeRenderCacheFamilies(renderer) {
  renderer.lineBuffer ||= {id: "line-buffer"};
  renderer.shoreLineBuffer ||= {id: "shore-line-buffer"};
  renderer.oceanCurrentBuffer ||= {id: "ocean-current-buffer"};
  renderer.lineVertices ||= new Float32Array();
  renderer.shoreLineVertices ||= new Float32Array();
  renderer.oceanCurrentVertices ||= new Float32Array();
  renderer.routeBuffer ||= {id: "route-buffer"};
  renderer.routeDrawRanges ||= [];
  renderer.routeBufferCamera ||= {scale: 1, offsetX: 0, offsetY: 0};
  renderer.riverBuffer ||= {id: "river-buffer"};
  renderer.riverBufferCamera ||= {scale: 1, offsetX: 0, offsetY: 0};
  renderer.tradeFlowBuffer ||= {id: "trade-flow-buffer"};
  renderer.tradeFlowPickItems ||= [];
  renderer.selectionBuffer ||= {id: "selection-buffer"};
  renderer.selectionDrawRanges ||= [];
  renderer.renderCacheResourceOwners = Object.freeze({});
  renderer.renderCacheResourceBindings = Object.freeze({});
  for (const family of ["line", "point", "route", "river", "tradeFlow", "selection"]) {
    adoptRenderCacheResourceBinding(renderer, family, renderer.surfaceResourceOwner);
  }
}

function captureRenderCacheReferences(renderer) {
  return Object.fromEntries([
    "lineBuffer", "shoreLineBuffer", "oceanCurrentBuffer", "lineVertices", "shoreLineVertices", "oceanCurrentVertices",
    "pointBuffer", "pointDrawRanges", "routeBuffer", "routeDrawRanges", "routeBufferCamera", "riverBuffer", "riverBufferCamera",
    "tradeFlowBuffer", "tradeFlowPickItems", "selectionBuffer", "selectionDrawRanges"
  ].map(field => [field, renderer[field]]));
}

function assertRenderCacheReferencesExact(renderer, snapshot, message = "render cache 引用必须精确恢复") {
  for (const [field, value] of Object.entries(snapshot)) assert.equal(renderer[field], value, `${message}: ${field}`);
}

async function testPointDrawRangeContract() {
  const gl = new FakeGl(), renderer = createRenderer(gl), beforeBuffer = renderer.pointBuffer, beforeRanges = renderer.pointDrawRanges;
  const beforeCacheOwners = renderer.renderCacheResourceOwners;
  const beforeCacheBindings = renderer.renderCacheResourceBindings;
  const vertices = new Float32Array(18), drawRanges = [{layer: "cities", first: 0, count: 1}, {layer: "resources", first: 1, count: 2}];
  const transaction = await prepareRendererWorkerInstall(renderer, renderer.nextMap, {binding, layers: {point: {vertices, drawRanges}}}, {binding, yieldToMain: async () => {}});
  transaction.commit();
  assert.notEqual(renderer.pointBuffer, beforeBuffer);
  assert.equal(renderer.pointDrawRanges, drawRanges);
  assert.deepEqual([renderer.pointBufferVertexCount, renderer.pointVertexCount], [3, 3]);
  assert.deepEqual(renderer.renderCacheResourceOwners.point, binding);
  assert.equal(renderer.renderCacheResourceBindings.point.owner, renderer.renderCacheResourceOwners.point);
  assert.equal(renderer.renderCacheResourceBindings.point.pointBuffer, renderer.pointBuffer);
  assert.equal(renderer.renderCacheResourceBindings.point.pointDrawRanges, drawRanges);
  transaction.rollback();
  assert.equal(renderer.pointBuffer, beforeBuffer);
  assert.equal(renderer.pointDrawRanges, beforeRanges);
  assert.equal(renderer.renderCacheResourceOwners, beforeCacheOwners);
  assert.equal(renderer.renderCacheResourceBindings, beforeCacheBindings);
  for (const invalid of [null, [{layer: "cities", first: 1, count: 2}], [{layer: "unknown", first: 0, count: 3}], [{layer: "cities", first: 0, count: 2}]]) {
    await assert.rejects(prepareRendererWorkerInstall(renderer, renderer.nextMap, {binding, layers: {point: {vertices, drawRanges: invalid}}}, {binding, yieldToMain: async () => {}}), error => error?.code === "render-point-ranges-shape");
  }
}

async function testRetainedResourceOwnerTransaction() {
  const gl = new FakeGl();
  const renderer = createRenderer(gl);
  const retainedBinding = resourceBinding("old-map", 1, 0, "retained:1", 0);
  const oldOverlayNode = {id: "old-overlay"};
  renderer.overlay = {
    childNodes: [oldOverlayNode],
    replaceChildren(...nodes) { this.childNodes = nodes; }
  };
  const instanceBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(), gl.DYNAMIC_DRAW);
  renderer.cityIconLayer = {
    gl,
    instanceBuffer,
    instances: [],
    instanceIndexById: new Map(),
    instanceData: new Float32Array(),
    stats: {instanceCount: 0},
    setInstances(items) {
      this.instances = [...items];
      this.instanceIndexById = new Map(this.instances.map((item, index) => [String(item.id), index]));
      this.instanceData = new Float32Array();
      this.stats.instanceCount = this.instances.length;
    }
  };
  renderer.prepareOverlayBundleFromDescriptors = async () => ({
    fragment: {id: "new-overlay"},
    labelItems: [],
    cityIconItems: [],
    markerIconItems: [],
    militaryIconItems: [],
    selectionMarker: null,
    gridCellIdLayer: null
  });
  adoptOverlayLabelResourceBinding(renderer, renderer.surfaceResourceOwner);
  const before = {
    map: renderer.map,
    picking: renderer.objectPickingIndex,
    pickingOwner: renderer.objectPickingResourceOwner,
    pickingBinding: renderer.objectPickingResourceBinding,
    labelItems: renderer.labelItems,
    labelOwner: renderer.labelLayoutResourceOwner,
    labelBinding: renderer.labelLayoutResourceBinding,
    overlayOwner: renderer.overlayResourceOwner,
    overlayBinding: renderer.overlayResourceBinding
  };
  renderer.latestIssuedRenderBinding = retainedBinding;
  const prepared = {
    binding: retainedBinding,
    layers: {
      picking: buildObjectPickingDto(renderer.map, retainedBinding),
      labels: emptyLabelDescriptorDto()
    }
  };
  const transaction = await prepareRendererWorkerInstall(renderer, renderer.map, prepared, {binding: retainedBinding, yieldToMain: async () => {}});
  transaction.commit();
  assert.notEqual(renderer.objectPickingIndex, before.picking);
  assert.deepEqual(renderer.objectPickingResourceOwner, retainedBinding);
  assert.deepEqual(renderer.labelLayoutResourceOwner, retainedBinding);
  assert.deepEqual(renderer.overlayResourceOwner, retainedBinding);
  assert.equal(objectPickingResourceBindingMismatch(renderer), "");
  assert.equal(overlayLabelResourceBindingMismatch(renderer), "");
  assert.deepEqual(renderer.overlay.childNodes, [{id: "new-overlay"}]);
  assert.equal(transaction.rollback(), true);
  assert.equal(renderer.map, before.map);
  assert.equal(renderer.objectPickingIndex, before.picking);
  assert.equal(renderer.objectPickingResourceOwner, before.pickingOwner);
  assert.equal(renderer.objectPickingResourceBinding, before.pickingBinding);
  assert.equal(renderer.labelItems, before.labelItems);
  assert.equal(renderer.labelLayoutResourceOwner, before.labelOwner);
  assert.equal(renderer.labelLayoutResourceBinding, before.labelBinding);
  assert.equal(renderer.overlayResourceOwner, before.overlayOwner);
  assert.equal(renderer.overlayResourceBinding, before.overlayBinding);
  assert.deepEqual(renderer.overlay.childNodes, [oldOverlayNode]);
  assert.equal(objectPickingResourceBindingMismatch(renderer), "");
  assert.equal(overlayLabelResourceBindingMismatch(renderer), "");
  renderer.webGlContextLost = false;
  renderer.webGlContextResourceState = "ready";
  renderer.workerRenderInstallSuspended = 0;
  const restoredLabels = renderer.labelItems;
  renderer.labelItems = [];
  assert.throws(
    () => PlaceholderMapRenderer.prototype.draw.call(renderer),
    error => error?.code === "render-retained-resource-owner-mismatch" && error?.mismatches?.includes("overlay-label:label-items-reference"),
    "draw 必须拒绝 label owner 与 retained 引用混装"
  );
  renderer.labelItems = restoredLabels;
  adoptOverlayLabelResourceBinding(renderer, renderer.labelLayoutResourceOwner);
  adoptOverlayLabelResourceBinding(renderer, binding);
  assert.throws(
    () => PlaceholderMapRenderer.prototype.draw.call(renderer),
    error => error?.code === "render-retained-resource-owner-mismatch" && error?.mismatches?.includes("overlay-label:owner-map-identity"),
    "draw 必须拒绝与 surface 不同 map 的 overlay owner"
  );
  adoptOverlayLabelResourceBinding(renderer, before.labelOwner);
  adoptObjectPickingResourceBinding(renderer, binding);
  assert.throws(
    () => PlaceholderMapRenderer.prototype.pickClientPoint.call(renderer, 0, 0),
    error => error?.code === "render-retained-resource-owner-mismatch" && error?.mismatches?.includes("picking:owner-map-identity"),
    "object pick 必须拒绝与 surface 不同 map 的 picking owner"
  );
  adoptObjectPickingResourceBinding(renderer, before.pickingOwner);
  renderer.objectPickingIndex = {id: "forged-picking"};
  assert.throws(
    () => PlaceholderMapRenderer.prototype.pickClientPoint.call(renderer, 0, 0),
    error => error?.code === "render-retained-resource-owner-mismatch" && error?.mismatches?.includes("picking:index-reference"),
    "object pick 必须拒绝 picking owner 与 retained 引用混装"
  );
}

async function testRetainedResourceOwnerCommitFaultRollback() {
  const gl = new FakeGl();
  const renderer = createRenderer(gl);
  const retainedBinding = resourceBinding("old-map", 1, 0, "retained:fault", 0);
  const before = {
    map: renderer.map,
    picking: renderer.objectPickingIndex,
    owner: renderer.objectPickingResourceOwner,
    wrapper: renderer.objectPickingResourceBinding
  };
  renderer.latestIssuedRenderBinding = retainedBinding;
  let owner = renderer.objectPickingResourceOwner;
  let faultPending = true;
  Object.defineProperty(renderer, "objectPickingResourceOwner", {
    configurable: true,
    get: () => owner,
    set(value) {
      owner = value;
      if (faultPending) {
        faultPending = false;
        throw new Error("retained-owner-commit-fault");
      }
    }
  });
  const transaction = await prepareRendererWorkerInstall(renderer, renderer.map, {
    binding: retainedBinding,
    layers: {picking: buildObjectPickingDto(renderer.map, retainedBinding)}
  }, {binding: retainedBinding, yieldToMain: async () => {}});
  assert.throws(() => transaction.commit(), /retained-owner-commit-fault/);
  assert.equal(renderer.map, before.map);
  assert.equal(renderer.objectPickingIndex, before.picking);
  assert.equal(renderer.objectPickingResourceOwner, before.owner);
  assert.equal(renderer.objectPickingResourceBinding, before.wrapper);
  assert.equal(objectPickingResourceBindingMismatch(renderer), "");
  assert.equal(transaction.rollback(), false);
}

async function testTradeFlowPickResourceOwner() {
  const owner = resourceBinding("trade-map", 4, 2, "trade:4", 3);
  const pickItems = [{
    dealId: 11,
    goodId: 5,
    goodName: "盐",
    sellerType: "city",
    sellerId: 1,
    sellerName: "甲",
    buyerType: "city",
    buyerId: 2,
    buyerName: "乙",
    units: 3,
    basePrice: 2,
    price: 2.5,
    effectivePrice: 2.5,
    priceDelta: 0.5,
    pricePressure: 0.25,
    priceSignalLabel: "偏紧",
    value: 7.5,
    tradeDistance: 10,
    distanceCost: 1,
    distanceMultiplier: 1.1,
    source: "market",
    sourceLabel: "市场",
    from: {x: 0, y: 0},
    to: {x: 10, y: 0}
  }];
  const renderer = {
    surfaceResourceOwner: owner,
    renderCacheResourceOwners: Object.freeze({}),
    renderCacheResourceBindings: Object.freeze({}),
    tradeFlowBuffer: {id: "trade-buffer"},
    tradeFlowPickItems: pickItems
  };
  adoptRenderCacheResourceBinding(renderer, "tradeFlow", owner);
  assert.equal(PlaceholderMapRenderer.prototype.pickTradeFlow.call(renderer, 5, 0, 2)?.id, 11);

  renderer.tradeFlowPickItems = [...pickItems];
  assert.throws(
    () => PlaceholderMapRenderer.prototype.pickTradeFlow.call(renderer, 5, 0, 2),
    error => error?.code === "render-cache-resource-owner-mismatch" && error?.mismatches?.includes("tradeFlow:tradeFlowPickItems-reference")
  );
  renderer.tradeFlowPickItems = pickItems;
  for (const [surfaceOwner, reason] of [
    [resourceBinding("other-trade-map", 4, 2, "trade:other", 3), "owner-map-identity"],
    [resourceBinding("trade-map", 4, 9, "trade:topology", 3), "owner-topology-revision"],
    [resourceBinding("trade-map", 4, 2, "trade:generation", 9), "owner-render-generation"]
  ]) {
    renderer.surfaceResourceOwner = surfaceOwner;
    assert.throws(
      () => PlaceholderMapRenderer.prototype.pickTradeFlow.call(renderer, 5, 0, 2),
      error => error?.code === "render-cache-resource-owner-mismatch" && error?.mismatches?.includes(`tradeFlow:${reason}`),
      `trade-flow pick 必须拒绝 ${reason}`
    );
  }
}

async function testFullSurfaceRetainedCacheRebind() {
  const targetBinding = resourceBinding("old-map", 1, 1, "surface-retained:1", 1);
  const gl = new FakeGl();
  const renderer = createRenderer(gl);
  initializeRenderCacheFamilies(renderer);
  const beforeOwners = renderer.renderCacheResourceOwners;
  const beforeBindings = renderer.renderCacheResourceBindings;
  const beforeReferences = captureRenderCacheReferences(renderer);
  renderer.latestIssuedRenderBinding = targetBinding;
  const transaction = await prepareFullSurfaceTransaction(renderer, targetBinding);
  transaction.commit();
  assertRenderCacheResourceBindings(renderer);
  for (const family of ["line", "point", "route", "river", "tradeFlow", "selection"]) {
    assert.deepEqual(renderer.renderCacheResourceOwners[family], targetBinding);
    assert.equal(renderCacheResourceBindingMismatch(renderer, family), "");
  }
  assertRenderCacheReferencesExact(renderer, beforeReferences, "未准备 cache 必须保留原物理引用");
  assert.equal(transaction.rollback(), true);
  assert.equal(renderer.renderCacheResourceOwners, beforeOwners);
  assert.equal(renderer.renderCacheResourceBindings, beforeBindings);
  assertRenderCacheReferencesExact(renderer, beforeReferences);
  assertRenderCacheResourceBindings(renderer);

  const distinctRenderer = createRenderer(new FakeGl());
  initializeRenderCacheFamilies(distinctRenderer);
  const distinctOwners = distinctRenderer.renderCacheResourceOwners;
  const distinctBindings = distinctRenderer.renderCacheResourceBindings;
  const staleGenerationBinding = resourceBinding("old-map", 1, 0, "surface-retained:stale-generation", 0);
  distinctRenderer.latestIssuedRenderBinding = staleGenerationBinding;
  const distinctMap = createMapFixture("old-map");
  const distinctTransaction = await prepareFullSurfaceTransaction(distinctRenderer, staleGenerationBinding, distinctMap);
  assert.throws(
    () => distinctTransaction.commit(),
    error => error?.code === "render-map-replacement-generation-stale",
    "不同 map 对象即使 identity 相同也不得沿用旧资源 generation"
  );
  assert.notEqual(distinctRenderer.map, distinctMap);
  assert.equal(distinctRenderer.renderCacheResourceOwners, distinctOwners);
  assert.equal(distinctRenderer.renderCacheResourceBindings, distinctBindings);
  assertRenderCacheResourceBindings(distinctRenderer);

  const mixedRenderer = createRenderer(new FakeGl());
  initializeRenderCacheFamilies(mixedRenderer);
  mixedRenderer.latestIssuedRenderBinding = targetBinding;
  mixedRenderer.riverBufferCamera = {...mixedRenderer.riverBufferCamera};
  const mixedTransaction = await prepareFullSurfaceTransaction(mixedRenderer, targetBinding);
  assert.throws(
    () => mixedTransaction.commit(),
    error => error?.code === "render-cache-retain-source-mismatch" && /riverBufferCamera-reference/.test(error.message),
    "提交前混装的未准备 cache 必须拒绝"
  );

  const replacementRenderer = createRenderer(new FakeGl());
  initializeRenderCacheFamilies(replacementRenderer);
  replacementRenderer.latestIssuedRenderBinding = targetBinding;
  replacementRenderer.riverBufferCamera = {...replacementRenderer.riverBufferCamera};
  const replacementTransaction = await prepareFullSurfaceTransaction(
    replacementRenderer,
    targetBinding,
    replacementRenderer.map,
    {retainUnpreparedResources: false}
  );
  assert.doesNotThrow(
    () => replacementTransaction.commit(),
    "整图 completion 接管未准备动态缓存时，不得把故障替换遗留引用误判为可保留 cache"
  );
  assert.equal(replacementTransaction.rollback(), true);

  const faultGl = new FakeGl();
  const faultRenderer = createRenderer(faultGl);
  initializeRenderCacheFamilies(faultRenderer);
  faultRenderer.latestIssuedRenderBinding = targetBinding;
  const faultOwners = faultRenderer.renderCacheResourceOwners;
  const faultBindings = faultRenderer.renderCacheResourceBindings;
  const faultReferences = captureRenderCacheReferences(faultRenderer);
  let renderCacheBindings = faultRenderer.renderCacheResourceBindings;
  let assignments = 0;
  Object.defineProperty(faultRenderer, "renderCacheResourceBindings", {
    configurable: true,
    get: () => renderCacheBindings,
    set(value) {
      renderCacheBindings = value;
      assignments++;
      if (assignments === 3) throw new Error("retained-cache-commit-fault");
    }
  });
  const faultTransaction = await prepareFullSurfaceTransaction(faultRenderer, targetBinding);
  assert.throws(() => faultTransaction.commit(), /retained-cache-commit-fault/);
  assert.equal(faultRenderer.renderCacheResourceOwners, faultOwners);
  assert.equal(faultRenderer.renderCacheResourceBindings, faultBindings);
  assertRenderCacheReferencesExact(faultRenderer, faultReferences);
  assertRenderCacheResourceBindings(faultRenderer);
}

async function testRetainedRefreshBindingPropagation() {
  const refreshBinding = resourceBinding("edit-map", 7, 2, "edit:7", 3);
  const sourceBinding = {mapIdentity: "edit-map", mapRevision: 7, topologyRevision: 2};
  const calls = [];
  const state = {
    map: {metadata: {mapIdentity: "edit-map"}},
    mapRevision: {getCoreSnapshot: () => sourceBinding},
    renderer: {
      issueRenderResourceBinding(source) {
        calls.push(["issue", source]);
        return refreshBinding;
      },
      invalidateDynamicBuffers() {},
      refreshObjectPickingIndex(owner) { calls.push(["picking", owner]); },
      refreshLabels(owner) { calls.push(["labels", owner]); }
    },
    selectionStore: {refresh() {}},
    heightEdit: null
  };
  const scheduler = createEditRefreshScheduler({state, documentRef: null});
  const effects = {
    render: "none",
    selection: "none",
    runtimeStats: false,
    pickPanel: false,
    derived: ["object-index", "labels"]
  };
  scheduler.run(effects);
  assert.deepEqual(calls, [
    ["issue", sourceBinding],
    ["picking", refreshBinding],
    ["labels", refreshBinding]
  ]);
  calls.length = 0;
  await scheduler.runAsync(effects, {yieldToMain: async () => {}});
  assert.deepEqual(calls, [
    ["issue", sourceBinding],
    ["picking", refreshBinding],
    ["labels", refreshBinding]
  ]);
}

async function testConservativeTopologyRetainedIntegration() {
  const gl = new FakeGl();
  const renderer = createRenderer(gl);
  renderer.map.metadata.graphWidth = 100;
  renderer.map.metadata.graphHeight = 100;
  renderer.colorMode = "height";
  for (let offset = 5; offset < renderer.surfaceVertices.length; offset += 6) renderer.surfaceVertices[offset] = 0.75;
  renderer.webGlContextLost = false;
  renderer.webGlContextResourceState = "ready";
  renderer.retainedResourcePublishSuspended = 0;
  renderer.retainedResourcePublishPendingDraw = false;
  renderer.retainedResourceState = "ready";
  renderer.drawCalls = 0;
  renderer.draw = () => {
    if (renderer.retainedResourcePublishSuspended > 0) {
      renderer.retainedResourcePublishPendingDraw = true;
      return;
    }
    if (renderer.retainedResourceState === "invalid") return;
    assert.equal(objectPickingResourceBindingMismatch(renderer), "");
    assert.equal(overlayLabelResourceBindingMismatch(renderer), "");
    renderer.drawCalls++;
  };
  renderer.beginRetainedResourcePublish = () => PlaceholderMapRenderer.prototype.beginRetainedResourcePublish.call(renderer);
  renderer.commitRetainedResourcePublish = () => PlaceholderMapRenderer.prototype.commitRetainedResourcePublish.call(renderer);
  renderer.invalidateRetainedResourcePublish = error => PlaceholderMapRenderer.prototype.invalidateRetainedResourcePublish.call(renderer, error);
  renderer.invalidateDynamicBuffers = () => {};
  renderer.issueRenderResourceBinding = binding => PlaceholderMapRenderer.prototype.issueRenderResourceBinding.call(renderer, binding);
  renderer.refreshObjectPickingIndex = owner => {
    renderer.objectPickingIndex = {id: `picking:${owner.sourceRevision}`};
    adoptObjectPickingResourceBinding(renderer, owner);
  };
  renderer.refreshLabels = owner => {
    renderer.labelItems = [];
    renderer.cityIconItems = [];
    renderer.cityIconItemsById = new Map();
    renderer.markerIconItems = [];
    renderer.militaryIconItems = [];
    adoptOverlayLabelResourceBinding(renderer, owner);
  };
  renderer.refreshHeightCells = (cells, options) => PlaceholderMapRenderer.prototype.refreshHeightCells.call(renderer, cells, options);

  const tracker = new MapRevisionTracker({identityFactory: () => "old-map"});
  tracker.replaceMap("old-map");
  const history = new EditHistory({onMutation: () => tracker.advance()});
  const state = {
    map: renderer.map,
    mapRevision: tracker,
    renderer,
    selectionStore: {refresh() {}},
    heightEdit: null
  };
  const scheduler = createEditRefreshScheduler({state, documentRef: null});
  const historyCommand = label => ({
    label,
    apply(context) { context.map.metadata[label] = true; },
    revert(context) { delete context.map.metadata[label]; }
  });
  const retainedEffects = {
    render: "none",
    selection: "none",
    runtimeStats: false,
    pickPanel: false,
    derived: ["object-index", "labels"]
  };

  history.execute(historyCommand("sync-retained"), {map: renderer.map});
  scheduler.run(retainedEffects);
  assert.deepEqual({source: renderer.objectPickingResourceOwner.sourceRevision, topology: renderer.objectPickingResourceOwner.topologyRevision}, {source: 1, topology: 0});
  assert.equal(renderer.surfaceResourceOwner.topologyRevision, 0);
  assert.equal(objectPickingResourceBindingMismatch(renderer), "");
  assert.equal(overlayLabelResourceBindingMismatch(renderer), "");

  history.execute(historyCommand("async-retained"), {map: renderer.map});
  await scheduler.runAsync(retainedEffects, {yieldToMain: async () => {}});
  assert.deepEqual({source: renderer.labelLayoutResourceOwner.sourceRevision, topology: renderer.labelLayoutResourceOwner.topologyRevision}, {source: 2, topology: 0});
  assert.equal(overlayLabelResourceBindingMismatch(renderer), "");

  history.execute(historyCommand("surface-edit"), {map: renderer.map});
  scheduler.run({
    ...retainedEffects,
    render: "draw",
    changedGridCells: [0],
    derived: ["object-index", "cell-colors", "labels"]
  });
  assert.ok(renderer.drawCalls > 0);
  assert.deepEqual({source: renderer.surfaceResourceOwner.sourceRevision, topology: renderer.surfaceResourceOwner.topologyRevision}, {source: 3, topology: 3});
  assert.deepEqual(renderer.objectPickingResourceOwner, renderer.labelLayoutResourceOwner);
  assert.equal(objectPickingResourceBindingMismatch(renderer), "");
  assert.equal(overlayLabelResourceBindingMismatch(renderer), "");

  history.execute(historyCommand("async-surface-edit"), {map: renderer.map});
  const observedAsyncYields = [];
  await scheduler.runAsync({
    ...retainedEffects,
    render: "draw",
    changedGridCells: [0],
    derived: ["object-index", "cell-colors", "labels"]
  }, {
    yieldToMain: async () => {
      observedAsyncYields.push(renderer.retainedResourceState);
      assert.equal(renderer.retainedResourceState, "suspended");
      assert.equal(PlaceholderMapRenderer.prototype.pickClientPoint.call(renderer, 0, 0), null);
      PlaceholderMapRenderer.prototype.draw.call(renderer);
    },
    assertCurrent: () => true
  });
  assert.ok(observedAsyncYields.length >= 4);
  assert.ok(observedAsyncYields.every(state => state === "suspended"));
  assert.equal(renderer.retainedResourceState, "ready");
  assert.deepEqual({source: renderer.surfaceResourceOwner.sourceRevision, topology: renderer.surfaceResourceOwner.topologyRevision}, {source: 4, topology: 4});
  assert.equal(objectPickingResourceBindingMismatch(renderer), "");
  assert.equal(overlayLabelResourceBindingMismatch(renderer), "");

  history.execute(historyCommand("city-relocation"), {map: renderer.map});
  const cityBinding = renderer.issueRenderResourceBinding({
    ...tracker.getCoreSnapshot(),
    topologyRevision: renderer.surfaceResourceOwner.topologyRevision
  });
  renderer.map.settlements.cities = [{id: 1, x: 20, y: 30, cell: 0, packCell: 0}];
  renderer.map.settlements.routes = [];
  renderer.objectPickingIndex = buildObjectPickingIndex(renderer.map);
  adoptObjectPickingResourceBinding(renderer, renderer.objectPickingResourceOwner);
  renderer.canvas = {getBoundingClientRect: () => ({left: 0, top: 0, width: 100, height: 100})};
  renderer.dynamicBuffersDirty = {routes: false, selection: false};
  const relocation = PlaceholderMapRenderer.prototype.refreshRelocatedCities.call(renderer, [1], {
    draw: false,
    routeIds: [],
    binding: cityBinding
  });
  assert.equal(relocation.updated, 1);
  assert.deepEqual({source: renderer.objectPickingResourceOwner.sourceRevision, topology: renderer.objectPickingResourceOwner.topologyRevision}, {source: 5, topology: 4});
  assert.deepEqual(renderer.objectPickingResourceOwner, renderer.labelLayoutResourceOwner);
  assert.equal(objectPickingResourceBindingMismatch(renderer), "");
  assert.equal(overlayLabelResourceBindingMismatch(renderer), "");
  renderer.draw();

  history.execute(historyCommand("async-surface-fault"), {map: renderer.map});
  let currentChecks = 0;
  await assert.rejects(scheduler.runAsync({
    ...retainedEffects,
    render: "draw",
    changedGridCells: [0],
    derived: ["object-index", "cell-colors", "labels"]
  }, {
    yieldToMain: async () => {
      assert.equal(renderer.retainedResourceState, "suspended");
      assert.equal(PlaceholderMapRenderer.prototype.pickClientPoint.call(renderer, 0, 0), null);
      PlaceholderMapRenderer.prototype.draw.call(renderer);
    },
    assertCurrent: () => {
      currentChecks++;
      if (currentChecks === 2) throw new Error("async-surface-current-fault");
    }
  }), /async-surface-current-fault/);
  assert.equal(renderer.retainedResourceState, "invalid");
  assert.equal(renderer.retainedResourcePublishSuspended, 0);
  const drawsBeforeInvalid = renderer.drawCalls;
  renderer.draw();
  assert.equal(renderer.drawCalls, drawsBeforeInvalid);
  assert.equal(PlaceholderMapRenderer.prototype.pickClientPoint.call(renderer, 0, 0), null);
}

function emptyLabelDescriptorDto() {
  return {
    schemaVersion: 1,
    numericStride: 10,
    count: 0,
    kindTable: [],
    ids: [],
    texts: [],
    styleTypes: [],
    styleTable: [],
    placementSources: [],
    kindIndexes: new Uint8Array(),
    idTypes: new Uint8Array(),
    styleIndexes: new Uint16Array(),
    numeric: new Float64Array(),
    flags: new Uint8Array(),
    componentCellOffsets: new Uint32Array([0]),
    componentCells: new Int32Array()
  };
}

function createRenderer(gl, cellCount = 1) {
  const surfaceVertices = surfaceForCells(cellCount, 1);
  const cellVisualCorrectionGeometry = smallCorrection(1);
  const map = createMapFixture("old-map", cellCount);
  const surfaceCellRanges = new Map(Array.from({length: cellCount}, (_, cell) => [cell, {start: cell * 18, end: (cell + 1) * 18}]));
  const surfaceResourceOwner = createSurfaceResourceOwner(resourceBinding("old-map", 0, 0, "owner:0", 0), {
    surfaceFloatLength: surfaceVertices.length,
    correctionWordLength: cellVisualCorrectionGeometry.length,
    surfaceCellRanges
  });
  const surfaceBaseBufferSet = createSurfaceBaseBufferSet(gl, surfaceVertices, {surfaceCellRanges, owner: surfaceResourceOwner});
  const cellVisualCorrectionBufferSet = createCellVisualCorrectionBufferSet(gl, cellVisualCorrectionGeometry, {usage: gl.STATIC_DRAW, owner: surfaceResourceOwner});
  const cellAttributeStore = createCellAttributeStore(gl, map);
  const renderer = {
    gl,
    map,
    nextMap: createMapFixture(binding.mapIdentity, cellCount),
    cellAttributeStore,
    cellAttributeStoreOwner: surfaceResourceOwner,
    surfaceBaseBufferSet,
    vertexBuffer: surfaceBaseBufferSet.segments[0].buffer,
    cellVisualCorrectionGeometry,
    cellVisualCorrectionGeometryOwner: surfaceResourceOwner,
    cellVisualCorrectionBufferSet,
    surfaceVertices,
    surfaceVerticesOwner: surfaceResourceOwner,
    landCorrectionVertices: new Float32Array(),
    waterCorrectionVertices: new Float32Array(),
    landCoverVertices: new Float32Array(),
    waterCoverVertices: new Float32Array(),
    surfaceCellRanges,
    surfaceCellRangesOwner: surfaceResourceOwner,
    surfaceResourceOwner,
    activeRenderResourceBinding: surfaceResourceOwner,
    renderGeneration: surfaceResourceOwner.renderGeneration,
    nextRenderGeneration: surfaceResourceOwner.renderGeneration,
    latestIssuedRenderBinding: null,
    activePreparedRenderInstallTransaction: null,
    objectPickingIndex: {id: "old-picking"},
    objectPickingResourceOwner: null,
    objectPickingResourceBinding: null,
    labelItems: [],
    cityIconItems: [],
    cityIconItemsById: new Map(),
    markerIconItems: [],
    militaryIconItems: [],
    labelLayoutResourceOwner: null,
    labelLayoutResourceBinding: null,
    overlayResourceOwner: null,
    overlayResourceBinding: null,
    overlay: null,
    cityIconLayer: null,
    unitPreferences: {},
    surfaceResourceBinding: Object.freeze({
      owner: surfaceResourceOwner,
      surfaceVertices,
      surfaceCellRanges,
      cellVisualCorrectionGeometry,
      cellAttributeStore
    }),
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
  adoptObjectPickingResourceBinding(renderer, surfaceResourceOwner);
  adoptOverlayLabelResourceBinding(renderer, surfaceResourceOwner);
  return renderer;
}

function createMapFixture(mapIdentity, cellCount = 1) {
  const indices = Uint32Array.from({length: cellCount}, (_, index) => index);
  return {
    metadata: {mapIdentity},
    grid: {cells: {
      i: indices, h: new Uint8Array(cellCount).fill(10), f: new Uint32Array(cellCount),
      state: new Int32Array(cellCount).fill(-1), province: new Int32Array(cellCount).fill(-1), culture: new Int32Array(cellCount).fill(-1), religion: new Int32Array(cellCount).fill(-1),
      biome: new Uint8Array(cellCount), pop: new Float32Array(cellCount), temp: new Int8Array(cellCount), prec: new Uint8Array(cellCount), region: new Int32Array(cellCount).fill(-1)
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

function surfaceForCells(cellCount, seed) {
  const values = new Float32Array(cellCount * 18);
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
