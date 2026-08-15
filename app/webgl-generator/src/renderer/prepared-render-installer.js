import {unpackLabelLayoutDescriptorsInChunks} from "./label-layout-descriptor.js";
import {rebindObjectPickingDtoInChunks} from "./picking-dto.js";
import {
  unpackCellVisualMeshInChunks,
  unpackPoliticalVisualPathsInChunks,
  unpackShoreVisualPathsInChunks
} from "./render-cache-dto.js";
import {assertRenderPreparationBinding} from "./render-preparation.js";
import {
  createSurfaceBaseBufferSetAsync,
  flattenSurfaceBaseBufferSet,
  isSurfaceBaseBufferSetForVertices,
  uploadSurfaceBaseBufferSetRanges
} from "./surface-base-buffer-set.js";
import {snapshotViewportCamera} from "./viewport-buffer-transform.js";
import {OBJECT_PICKING_COMPONENTS} from "./picking.js";
import {
  createCellAttributeStore,
  deleteUnownedCellAttributeStore,
  releaseCellAttributeStore,
  retainCellAttributeStore
} from "./cell-attribute-store.js";
import {
  createCellVisualCorrectionBufferSetAsync,
  flattenCellVisualCorrectionBufferSet
} from "./cell-visual-surface-correction.js";

const FLOATS_PER_VERTEX = 6;
const DEFAULT_UPLOAD_SLICE_BYTES = 256 * 1024;
const PICKING_REBIND_BUDGET_MS = 24;
const surfaceBaseBufferOwners = new WeakMap();
const cellVisualCorrectionBufferOwners = new WeakMap();

export async function prepareRendererWorkerInstall(renderer, map, prepared, options = {}) {
  if (!renderer?.gl || !map || !prepared?.layers) throw renderInstallError("render-install-input", "Worker 渲染安装缺少 renderer、地图或准备结果");
  const binding = options.binding || prepared.binding;
  assertRenderPreparationBinding(prepared, binding);
  const signal = options.signal || null;
  const gate = createInstallGate(options);
  const layers = prepared.layers;
  const decoded = {};
  const buffers = new Map();
  let surfaceBaseBufferSet = null;
  let cellVisualCorrectionBufferSet = null;
  let surfaceValues = null;
  let surfaceColorPatch = null;
  let cellAttributeStore = null;

  try {
    validatePreparedLayerShapes(layers);
    if (renderer.map !== map) {
      gate.assertCurrent();
      cellAttributeStore = createCellAttributeStore(renderer.gl, map);
      gate.assertCurrent();
    }
    if (layers.cellVisual) {
      decoded.cellVisual = await unpackCellVisualMeshInChunks(layers.cellVisual, binding, gate.options("cell-visual"));
    }
    if (layers.shore) {
      decoded.shore = await unpackShoreVisualPathsInChunks(layers.shore, binding, gate.options("shore"));
    }
    if (layers.statePaths) {
      decoded.statePaths = await unpackPoliticalVisualPathsInChunks(layers.statePaths, binding, gate.options("state-paths"));
    }
    if (layers.provincePaths) {
      decoded.provincePaths = await unpackPoliticalVisualPathsInChunks(layers.provincePaths, binding, gate.options("province-paths"));
    }
    if (layers.political) decoded.political = layers.political;
    if (layers.picking) {
      decoded.picking = await rebindObjectPickingDtoInChunks(layers.picking, map, binding, {
        ...gate.options("picking"),
        budgetMs: PICKING_REBIND_BUDGET_MS
      });
    }
    if (layers.labels) {
      decoded.labels = await unpackLabelLayoutDescriptorsInChunks(layers.labels, map, gate.options("labels"));
      decoded.overlay = await renderer.prepareOverlayBundleFromDescriptors?.(map, decoded.labels, {
        ...gate.options("overlay"),
        unitPreferences: prepared.presentation?.unitPreferences
      });
    }
    if (layers.political && !layers.politicalDebug) {
      throw renderInstallError("render-political-debug-missing", "Worker 政治网格缺少绑定的调试网格结果");
    }
    if (layers.politicalDebug) {
      const mode = String(layers.politicalDebug.mode || "none");
      if (!new Set(["none", "states", "provinces"]).has(mode) || mode !== String(prepared.presentation?.politicalMeshDebugMode || "none")) {
        throw renderInstallError("render-political-debug-stale", "Worker 政治调试网格与当前显示模式不一致");
      }
      if (!(layers.politicalDebug.vertices instanceof Float32Array) || layers.politicalDebug.vertices.length % FLOATS_PER_VERTEX !== 0) {
        throw renderInstallError("render-political-debug-shape", "Worker 政治调试网格结构无效");
      }
      buffers.set("politicalMeshDebugBuffer", await uploadPreparedBuffer(renderer.gl, layers.politicalDebug.vertices, renderer.gl.STATIC_DRAW, gate, "politicalMeshDebugBuffer"));
    }

    const shorePaths = decoded.shore || renderer.shoreVisualPaths;
    if (layers.line?.shorePathCache) decoded.shoreLine = rebindShorePathCache(layers.line.shorePathCache, shorePaths, binding);
    if (layers.surface) {
      const inPlaceColorPatch = layers.surface.mode === "cell-colors" && options.inPlaceSurfaceColorPatch === true;
      if (inPlaceColorPatch) {
        surfaceColorPatch = await prepareInPlaceSurfaceColorPatch(renderer, map, layers.surface, gate);
        surfaceValues = layers.surface;
      } else {
        surfaceValues = layers.surface.mode === "cell-colors"
          ? await materializePreparedSurfaceColorPatch(renderer, map, layers.surface, gate)
          : layers.surface;
      }
      decoded.surfaceCellRanges = layers.surface.mode === "cell-colors"
        ? renderer.surfaceCellRanges
        : await normalizePreparedSurfaceCellRanges(
          surfaceValues.surfaceCellRanges,
          surfaceValues.base?.length || 0,
          surfaceValues.surfaceCellRangesMode,
          decoded.cellVisual || renderer.cellVisualMesh,
          gridCellCount(map),
          gate
        );
      decoded.shoreSurfaceCellRanges = await normalizePreparedShoreSurfaceCellRanges(
        surfaceValues.shoreSurfaceCellRanges,
        surfaceValues,
        gridCellCount(map),
        gate
      );
      if (!inPlaceColorPatch) {
        surfaceBaseBufferSet = await createSurfaceBaseBufferSetAsync(renderer.gl, surfaceValues.base, {
          usage: renderer.gl.STATIC_DRAW,
          surfaceCellRanges: decoded.surfaceCellRanges,
          yieldToMain: gate.yieldToMain,
          assertCurrent: gate.assertCurrent,
          onProgress: detail => gate.onProgress("gpu:surfaceBaseBufferSet", detail)
        });
        if (surfaceValues.cellVisualCorrection instanceof Float32Array) {
          cellVisualCorrectionBufferSet = await createCellVisualCorrectionBufferSetAsync(renderer.gl, surfaceValues.cellVisualCorrection, {
            usage: renderer.gl.STATIC_DRAW,
            yieldToMain: gate.yieldToMain,
            assertCurrent: gate.assertCurrent,
            onProgress: detail => gate.onProgress("gpu:cellVisualCorrection", detail)
          });
        }
      }
      for (const [key, values] of [
        ["landCorrectionBuffer", surfaceValues.landCorrections],
        ["waterCorrectionBuffer", surfaceValues.waterCorrections],
        ["landCoverBuffer", surfaceValues.landCovers],
        ["waterCoverBuffer", surfaceValues.waterCovers]
      ]) buffers.set(key, await uploadPreparedBuffer(renderer.gl, values, renderer.gl.STATIC_DRAW, gate, key));
      buffers.set("surfacePatchBuffer", await uploadPreparedBuffer(renderer.gl, new Float32Array(), renderer.gl.DYNAMIC_DRAW, gate, "surfacePatchBuffer"));
    }
    if (layers.line) {
      for (const [key, values] of [
        ["lineBuffer", layers.line.vertices],
        ["shoreLineBuffer", layers.line.shoreVertices],
        ["oceanCurrentBuffer", layers.line.oceanCurrentVertices]
      ]) buffers.set(key, await uploadPreparedBuffer(renderer.gl, values, renderer.gl.STATIC_DRAW, gate, key));
    }
    if (layers.point) buffers.set("pointBuffer", await uploadPreparedBuffer(renderer.gl, layers.point.vertices, renderer.gl.STATIC_DRAW, gate, "pointBuffer"));
    if (layers.route) buffers.set("routeBuffer", await uploadPreparedBuffer(renderer.gl, layers.route.vertices, renderer.gl.DYNAMIC_DRAW, gate, "routeBuffer"));
    if (layers.river) buffers.set("riverBuffer", await uploadPreparedBuffer(renderer.gl, layers.river.vertices, renderer.gl.DYNAMIC_DRAW, gate, "riverBuffer"));
    gate.assertCurrent();
  } catch (error) {
    deletePreparedBuffers(renderer.gl, buffers.values());
    deleteUnownedSurfaceBaseBuffers(renderer.gl, surfaceBaseBufferSet, renderer.surfaceBaseBufferSet);
    deleteUnownedCellVisualCorrectionBuffers(renderer.gl, cellVisualCorrectionBufferSet, renderer.cellVisualCorrectionBufferSet);
    deleteUnownedCellAttributeStore(renderer.gl, cellAttributeStore, renderer.cellAttributeStore);
    throw error;
  }

  return createPreparedInstallTransaction(renderer, map, prepared, decoded, buffers, surfaceBaseBufferSet, cellVisualCorrectionBufferSet, surfaceValues, cellAttributeStore, {
    preserveRoutePicking: options.preserveRoutePicking === true,
    resetViewport: options.resetViewport === true,
    deferOverlayLayout: options.deferOverlayLayout === true,
    surfaceColorPatch,
    yieldToMain: gate.yieldToMain,
    onProgress: detail => gate.onProgress("gpu:surfaceColorPatch", detail)
  });
}

function createPreparedInstallTransaction(renderer, map, prepared, decoded, buffers, surfaceBaseBufferSet, cellVisualCorrectionBufferSet, surfaceValues, cellAttributeStore, options) {
  const layers = prepared.layers;
  const before = new Map();
  const assigned = [];
  const oldBuffers = [];
  let committed = false;
  let finalized = false;
  let pickingMutation = null;
  let routeRefreshWasPending = false;
  let routeRefreshWasCancelled = false;
  let surfaceBaseBefore = null;
  const surfaceColorPatch = options.surfaceColorPatch || null;
  let surfaceColorPatchDirty = false;
  let ownsPreparedSurfaceBase = Boolean(surfaceBaseBufferSet);
  let ownsPreviousSurfaceBase = false;
  let cellVisualCorrectionBefore = null;
  let ownsPreparedCellVisualCorrection = Boolean(cellVisualCorrectionBufferSet);
  let ownsPreviousCellVisualCorrection = false;
  let cellAttributeStoreBefore = null;
  let ownsPreparedCellAttributes = Boolean(cellAttributeStore);
  let ownsPreviousCellAttributes = false;
  if (ownsPreparedSurfaceBase) retainSurfaceBaseBufferSet(surfaceBaseBufferSet);
  if (ownsPreparedCellVisualCorrection) retainCellVisualCorrectionBufferSet(cellVisualCorrectionBufferSet);
  if (ownsPreparedCellAttributes) retainCellAttributeStore(cellAttributeStore);

  return Object.freeze({
    prepareCommit,
    commit,
    rollback,
    rollbackAsync,
    finalize,
    get committed() { return committed; }
  });

  async function prepareCommit(runtimeOptions = {}) {
    if (!surfaceColorPatch) return false;
    if (committed || finalized || surfaceColorPatchDirty) throw renderInstallError("render-install-state", "Worker 渲染结果已提交、应用或释放");
    assertInPlaceSurfaceOwner(renderer, map, surfaceColorPatch);
    surfaceColorPatchDirty = true;
    await applyInPlaceSurfaceColors(renderer, surfaceColorPatch, surfaceColorPatch.colors, {
      ...runtimeOptions,
      yieldToMain: options.yieldToMain,
      onProgress: options.onProgress
    });
    return true;
  }

  function commit() {
    if (committed || finalized) throw renderInstallError("render-install-state", "Worker 渲染结果已提交或释放");
    try {
      if (layers.route) {
        routeRefreshWasPending = Boolean(renderer.routeRefreshTimer || renderer.routeRefreshActiveVersion);
        renderer.cancelScheduledRouteBufferRefresh?.();
        routeRefreshWasCancelled = true;
      }
      if (options.resetViewport) {
        assignNested("camera", "scale", 1);
        assignNested("camera", "offsetX", 0);
        assignNested("camera", "offsetY", 0);
      }
      assign("map", map);
      assignCellAttributeStore(cellAttributeStore);
      if (decoded.cellVisual) assign("cellVisualMesh", decoded.cellVisual);
      if (decoded.shore) assign("shoreVisualPaths", decoded.shore);
      if (decoded.statePaths) assign("stateVisualPaths", decoded.statePaths);
      if (decoded.provincePaths) assign("provinceVisualPaths", decoded.provincePaths);
      if (decoded.political) assign("politicalVisualMeshes", decoded.political);
      if (layers.politicalDebug) assign("politicalMeshDebugVertexCount", vertexCount(layers.politicalDebug.vertices));
      if (decoded.picking) {
        const components = options.preserveRoutePicking
          ? decoded.picking.components.filter(component => component !== "routeSegments")
          : decoded.picking.components;
        if (components.length < OBJECT_PICKING_COMPONENTS.length) {
          if (!renderer.objectPickingIndex) throw renderInstallError("render-picking-partial-base-missing", "局部 picking 安装缺少正式基线");
          pickingMutation = applyPreparedPickingComponents(renderer.objectPickingIndex, decoded.picking, components);
        } else assign("objectPickingIndex", decoded.picking);
      }
      if (decoded.overlay) installOverlay(decoded.overlay);
      if (layers.surface) {
      if (!surfaceColorPatch) {
      assignSurfaceBaseBufferSet(surfaceBaseBufferSet);
      assignCellVisualCorrectionBufferSet(cellVisualCorrectionBufferSet);
      assign("surfaceVertices", surfaceValues.base);
      assign("cellVisualCorrectionGeometry", surfaceValues.cellVisualCorrection || new Float32Array());
      assign("gpuResidentSmoothShoreSurfaceKey", surfaceValues.smoothShoreSurfaceKey || "");
      }
      assign("landCorrectionVertices", surfaceValues.landCorrections);
      assign("waterCorrectionVertices", surfaceValues.waterCorrections);
      assign("landCoverVertices", surfaceValues.landCovers);
      assign("waterCoverVertices", surfaceValues.waterCovers);
      if (!surfaceColorPatch) assign("surfaceCellRanges", decoded.surfaceCellRanges);
      assign("shoreSurfaceCellRanges", decoded.shoreSurfaceCellRanges);
      assign("surfacePatchVertices", new Float32Array());
      assign("surfacePatchCellRanges", new Map());
      assign("surfacePatchCells", new Set());
      assign("surfacePatchVertexCount", 0);
      if (!surfaceColorPatch) assign("vertexCount", vertexCount(surfaceValues.base));
      assign("landCorrectionVertexCount", surfaceValues.shoreSurfaceEnabled !== false ? vertexCount(surfaceValues.landCorrections) : 0);
      assign("waterCorrectionVertexCount", surfaceValues.shoreSurfaceEnabled !== false ? vertexCount(surfaceValues.waterCorrections) : 0);
      assign("landCoverVertexCount", surfaceValues.shoreSurfaceEnabled !== false ? vertexCount(surfaceValues.landCovers) : 0);
      assign("waterCoverVertexCount", surfaceValues.shoreSurfaceEnabled !== false ? vertexCount(surfaceValues.waterCovers) : 0);
      }
      if (layers.line) {
      assign("lineVertices", layers.line.vertices);
      assign("shoreLineVertices", layers.line.shoreVertices);
      assign("gpuResidentSmoothShoreLineVertices", layers.line.gpuResidentSmoothShoreVertices || new Float32Array());
      assign("gpuResidentHardShoreLineVertices", layers.line.gpuResidentHardShoreVertices || new Float32Array());
      assign("shoreLinePathVertices", decoded.shoreLine?.pathVertices || new Map());
      assign("shoreLinePathObjectVertices", decoded.shoreLine?.pathObjectVertices || new WeakMap());
      assign("oceanCurrentLayerStats", layers.line.oceanCurrents);
      assign("lineVertexCount", vertexCount(layers.line.vertices));
      assign("shoreLineVertexCount", vertexCount(layers.line.shoreVertices));
      assign("oceanCurrentVertexCount", vertexCount(layers.line.oceanCurrentVertices));
      }
      if (layers.point) assign("pointVertexCount", vertexCount(layers.point.vertices));
      if (layers.route) {
      assign("routeVertexCount", vertexCount(layers.route.vertices));
      assign("routeDrawRanges", layers.route.drawRanges);
      assign("routeRenderStats", layers.route.stats);
      assign("routeBufferCamera", snapshotViewportCamera(renderer.camera));
      assignNested("dynamicBuffersDirty", "routes", false);
      }
      if (layers.river) {
      assign("riverVertexCount", vertexCount(layers.river.vertices));
      assign("riverWidthStats", layers.river.stats);
      assign("riverBufferCamera", snapshotViewportCamera(renderer.camera));
      assignNested("dynamicBuffersDirty", "rivers", false);
      }
      for (const [key, buffer] of buffers) {
        before.set(key, renderer[key]);
        oldBuffers.push(renderer[key]);
        renderer[key] = buffer;
        assigned.push(key);
      }
      committed = true;
      return true;
    } catch (error) {
      committed = true;
      try {
        rollback();
      } catch (rollbackError) {
        const combined = renderInstallError("render-install-commit-rollback-failed", `Worker 渲染安装提交失败且局部回滚失败：${error?.message || error}`);
        combined.cause = new AggregateError([error, rollbackError], "Worker 渲染安装提交与局部回滚均失败");
        combined.rollbackFailed = true;
        throw combined;
      }
      throw error;
    }
  }

  function rollback() {
    if (finalized) return false;
    if (!committed) {
      deletePreparedBuffers(renderer.gl, buffers.values());
      releasePreparedSurfaceBase();
      releasePreparedCellVisualCorrection();
      releasePreparedCellAttributes();
      finalized = true;
      return true;
    }
    const failures = [];
    try {
      pickingMutation?.rollback();
    } catch (error) {
      failures.push(error);
    }
    for (let index = assigned.length - 1; index >= 0; index--) {
      const key = assigned[index];
      try {
        if (key === "overlay:nodes") {
          renderer.overlay?.replaceChildren(...(before.get(key) || []));
        } else if (key === "overlay:cityIconInstances") {
          restoreCityIconLayer(renderer.cityIconLayer, before.get(key));
        } else if (key.startsWith("nested:")) {
          const [, field, child] = key.split(":");
          renderer[field][child] = before.get(key);
        } else if (key === "surfaceBaseBufferSet") {
          renderer.surfaceBaseBufferSet = before.get(key).bufferSet;
          renderer.vertexBuffer = before.get(key).vertexBuffer;
        } else if (key === "cellVisualCorrectionBufferSet") {
          renderer.cellVisualCorrectionBufferSet = before.get(key);
        } else if (key === "cellAttributeStore") {
          renderer.cellAttributeStore = before.get(key);
        } else renderer[key] = before.get(key);
      } catch (error) {
        failures.push(error);
      }
    }
    try {
      deletePreparedBuffers(renderer.gl, buffers.values());
    } catch (error) {
      failures.push(error);
    }
    try {
      releasePreparedSurfaceBase();
      releasePreparedCellVisualCorrection();
    } catch (error) {
      failures.push(error);
    }
    try {
      releasePreviousSurfaceBase();
      releasePreviousCellVisualCorrection();
    } catch (error) {
      failures.push(error);
    }
    try { releasePreparedCellAttributes(); } catch (error) { failures.push(error); }
    try { releasePreviousCellAttributes(); } catch (error) { failures.push(error); }
    if (routeRefreshWasCancelled && routeRefreshWasPending) {
      try {
        renderer.dynamicBuffersDirty.routes = true;
        renderer.scheduleRouteBufferRefresh?.();
      } catch (error) {
        failures.push(error);
      }
    }
    committed = false;
    finalized = true;
    if (failures.length) {
      const error = renderInstallError("render-install-rollback-failed", "Worker 渲染安装回滚未能完整恢复");
      error.cause = failures.length === 1 ? failures[0] : new AggregateError(failures, "Worker 渲染安装回滚存在多个失败");
      throw error;
    }
    return true;
  }

  async function rollbackAsync(runtimeOptions = {}) {
    const shouldRestoreSurface = surfaceColorPatchDirty && hasInPlaceSurfaceOwner(renderer, map, surfaceColorPatch);
    const failures = [];
    try {
      rollback();
    } catch (error) {
      failures.push(error);
    }
    if (shouldRestoreSurface) {
      try {
        await applyInPlaceSurfaceColors(renderer, surfaceColorPatch, surfaceColorPatch.previousColors, {
          ...runtimeOptions,
          yieldToMain: options.yieldToMain,
          onProgress: options.onProgress
        });
        surfaceColorPatchDirty = false;
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length) {
      const error = renderInstallError("render-install-rollback-failed", "Worker 渲染安装回滚未能完整恢复");
      error.cause = failures.length === 1 ? failures[0] : new AggregateError(failures, "Worker 渲染安装回滚存在多个失败");
      throw error;
    }
    return true;
  }

  function finalize() {
    if (finalized) return false;
    if (!committed) {
      deletePreparedBuffersBestEffort(renderer.gl, buffers.values());
      releasePreparedSurfaceBaseBestEffort();
      releasePreparedCellVisualCorrectionBestEffort();
      releasePreparedCellAttributesBestEffort();
      finalized = true;
      return true;
    }
    const activeBuffers = new Set([...buffers.keys()].map(key => renderer[key]).filter(Boolean));
    const detachedBuffers = [...oldBuffers, ...buffers.values()].filter(buffer => !activeBuffers.has(buffer));
    deletePreparedBuffersBestEffort(renderer.gl, detachedBuffers);
    releasePreviousSurfaceBaseBestEffort();
    releasePreparedSurfaceBaseBestEffort();
    releasePreviousCellVisualCorrectionBestEffort();
    releasePreparedCellVisualCorrectionBestEffort();
    releasePreviousCellAttributesBestEffort();
    releasePreparedCellAttributesBestEffort();
    surfaceColorPatchDirty = false;
    finalized = true;
    return true;
  }

  function assign(key, value) {
    if (!before.has(key)) before.set(key, renderer[key]);
    renderer[key] = value;
    if (!assigned.includes(key)) assigned.push(key);
  }

  function assignNested(field, child, value) {
    const key = `nested:${field}:${child}`;
    if (!before.has(key)) before.set(key, renderer[field]?.[child]);
    renderer[field][child] = value;
    if (!assigned.includes(key)) assigned.push(key);
  }

  function assignSurfaceBaseBufferSet(bufferSet) {
    if (!bufferSet) return;
    const buffers = flattenSurfaceBaseBufferSet(bufferSet);
    if (!buffers.length) throw renderInstallError("render-buffer-create", "surface base 临时 GPU buffer 缺失");
    surfaceBaseBefore = {
      bufferSet: renderer.surfaceBaseBufferSet,
      vertexBuffer: renderer.vertexBuffer
    };
    retainSurfaceBaseBufferSet(surfaceBaseBefore.bufferSet);
    ownsPreviousSurfaceBase = true;
    before.set("surfaceBaseBufferSet", surfaceBaseBefore);
    assigned.push("surfaceBaseBufferSet");
    renderer.surfaceBaseBufferSet = bufferSet;
    renderer.vertexBuffer = buffers[0];
  }

  function assignCellVisualCorrectionBufferSet(bufferSet) {
    if (!bufferSet) return;
    if (!flattenCellVisualCorrectionBufferSet(bufferSet).length) throw renderInstallError("render-buffer-create", "平滑边界 correction 临时 GPU buffer 缺失");
    cellVisualCorrectionBefore = renderer.cellVisualCorrectionBufferSet;
    retainCellVisualCorrectionBufferSet(cellVisualCorrectionBefore);
    ownsPreviousCellVisualCorrection = Boolean(cellVisualCorrectionBefore);
    before.set("cellVisualCorrectionBufferSet", cellVisualCorrectionBefore);
    assigned.push("cellVisualCorrectionBufferSet");
    renderer.cellVisualCorrectionBufferSet = bufferSet;
  }

  function assignCellAttributeStore(store) {
    if (!store) return;
    cellAttributeStoreBefore = renderer.cellAttributeStore;
    retainCellAttributeStore(cellAttributeStoreBefore);
    ownsPreviousCellAttributes = Boolean(cellAttributeStoreBefore);
    before.set("cellAttributeStore", cellAttributeStoreBefore);
    assigned.push("cellAttributeStore");
    renderer.cellAttributeStore = store;
  }

  function releasePreparedSurfaceBase() {
    if (!ownsPreparedSurfaceBase) return;
    ownsPreparedSurfaceBase = false;
    releaseSurfaceBaseBufferSet(surfaceBaseBufferSet);
    deleteUnownedSurfaceBaseBuffers(renderer.gl, surfaceBaseBufferSet, renderer.surfaceBaseBufferSet);
  }

  function releasePreviousSurfaceBase() {
    if (!ownsPreviousSurfaceBase) return;
    ownsPreviousSurfaceBase = false;
    releaseSurfaceBaseBufferSet(surfaceBaseBefore?.bufferSet);
    deleteUnownedSurfaceBaseBuffers(renderer.gl, surfaceBaseBefore?.bufferSet, renderer.surfaceBaseBufferSet);
  }

  function releasePreparedCellVisualCorrection() {
    if (!ownsPreparedCellVisualCorrection) return;
    ownsPreparedCellVisualCorrection = false;
    releaseCellVisualCorrectionBufferSet(cellVisualCorrectionBufferSet);
    deleteUnownedCellVisualCorrectionBuffers(renderer.gl, cellVisualCorrectionBufferSet, renderer.cellVisualCorrectionBufferSet);
  }

  function releasePreviousCellVisualCorrection() {
    if (!ownsPreviousCellVisualCorrection) return;
    ownsPreviousCellVisualCorrection = false;
    releaseCellVisualCorrectionBufferSet(cellVisualCorrectionBefore);
    deleteUnownedCellVisualCorrectionBuffers(renderer.gl, cellVisualCorrectionBefore, renderer.cellVisualCorrectionBufferSet);
  }

  function releasePreparedSurfaceBaseBestEffort() {
    try {
      releasePreparedSurfaceBase();
    } catch {
      // finalize 延续既有资源释放 best-effort 语义。
    }
  }

  function releasePreviousSurfaceBaseBestEffort() {
    try {
      releasePreviousSurfaceBase();
    } catch {
      // finalize 延续既有资源释放 best-effort 语义。
    }
  }

  function releasePreparedCellVisualCorrectionBestEffort() {
    try { releasePreparedCellVisualCorrection(); } catch {}
  }

  function releasePreviousCellVisualCorrectionBestEffort() {
    try { releasePreviousCellVisualCorrection(); } catch {}
  }

  function releasePreparedCellAttributes() {
    if (!ownsPreparedCellAttributes) return;
    ownsPreparedCellAttributes = false;
    releaseCellAttributeStore(cellAttributeStore);
    deleteUnownedCellAttributeStore(renderer.gl, cellAttributeStore, renderer.cellAttributeStore);
  }

  function releasePreviousCellAttributes() {
    if (!ownsPreviousCellAttributes) return;
    ownsPreviousCellAttributes = false;
    releaseCellAttributeStore(cellAttributeStoreBefore);
    deleteUnownedCellAttributeStore(renderer.gl, cellAttributeStoreBefore, renderer.cellAttributeStore);
  }

  function releasePreparedCellAttributesBestEffort() {
    try { releasePreparedCellAttributes(); } catch {}
  }

  function releasePreviousCellAttributesBestEffort() {
    try { releasePreviousCellAttributes(); } catch {}
  }

  function installOverlay(bundle) {
    if (!renderer.overlay || !bundle.fragment) return;
    for (const item of bundle.militaryIconItems || []) item.rendererUnitPreferences = renderer.unitPreferences;
    const fragment = options.deferOverlayLayout
      ? createDeferredOverlayInstallFragment(bundle.fragment, renderer.overlay.ownerDocument)
      : bundle.fragment;
    before.set("overlay:nodes", [...renderer.overlay.childNodes]);
    assigned.push("overlay:nodes");
    renderer.overlay.replaceChildren(fragment);
    before.set("overlay:cityIconInstances", snapshotCityIconLayer(renderer.cityIconLayer));
    assigned.push("overlay:cityIconInstances");
    for (const [key, value] of [
      ["labelItems", bundle.labelItems],
      ["cityIconItems", bundle.cityIconItems],
      ["cityIconItemsById", new Map(bundle.cityIconItems.map(item => [String(item.id), item]))],
      ["markerIconItems", bundle.markerIconItems],
      ["militaryIconItems", bundle.militaryIconItems],
      ["selectionMarker", bundle.selectionMarker],
      ["gridCellIdLayer", bundle.gridCellIdLayer],
      ["labelCount", bundle.labelItems.length],
      ["cityLabelCount", bundle.labelItems.filter(item => item.targetKind === "city").length],
      ["stateLabelCount", bundle.labelItems.filter(item => item.targetKind === "state").length],
      ["provinceLabelCount", bundle.labelItems.filter(item => item.targetKind === "province").length],
      ["cityIconCount", bundle.cityIconItems.length],
      ["markerIconCount", bundle.markerIconItems.length],
      ["militaryIconCount", bundle.militaryIconItems.length],
      ["visibleLabelCount", 0],
      ["visibleCityLabelCount", 0],
      ["visibleStateLabelCount", 0],
      ["visibleProvinceLabelCount", 0],
      ["visibleCityIconCount", 0],
      ["visibleMarkerIconCount", 0],
      ["visibleMilitaryIconCount", 0]
    ]) assign(key, value);
    renderer.cityIconLayer?.setInstances(bundle.cityIconItems, {nowMs: performance.now()});
  }

  function createDeferredOverlayInstallFragment(fragment, documentRef) {
    const staged = documentRef.createDocumentFragment();
    while (fragment.firstChild) {
      const batch = documentRef.createElement("div");
      batch.className = "map-overlay-install-batch";
      for (let index = 0; index < 32 && fragment.firstChild; index++) batch.append(fragment.firstChild);
      staged.append(batch);
    }
    return staged;
  }
}

function snapshotCityIconLayer(layer) {
  if (!layer) return null;
  return {
    instances: layer.instances,
    instanceIndexById: layer.instanceIndexById,
    instanceData: layer.instanceData,
    stats: {...(layer.stats || {})}
  };
}

function restoreCityIconLayer(layer, snapshot) {
  if (!layer || !snapshot) return;
  layer.instances = snapshot.instances;
  layer.instanceIndexById = snapshot.instanceIndexById;
  layer.instanceData = snapshot.instanceData;
  layer.gl.bindBuffer(layer.gl.ARRAY_BUFFER, layer.instanceBuffer);
  layer.gl.bufferData(layer.gl.ARRAY_BUFFER, layer.instanceData, layer.gl.DYNAMIC_DRAW);
  Object.assign(layer.stats, snapshot.stats);
}

function validatePreparedLayerShapes(layers) {
  if (layers.political) {
    assertPreparedPoliticalCache(layers.political.states, "state", "political.states");
    assertPreparedPoliticalCache(layers.political.provinces, "province", "political.provinces");
  }
  if (layers.surface) {
    const colorPatch = layers.surface.mode === "cell-colors";
    if (colorPatch) {
      if (!(layers.surface.cellIds instanceof Uint32Array) || !(layers.surface.colors instanceof Float32Array)
        || layers.surface.colors.length !== layers.surface.cellIds.length * 4
        || (layers.surface.scope !== "all" && layers.surface.scope !== "water")) {
        throw renderInstallError("render-surface-color-patch-shape", "Worker surface color patch 结构无效");
      }
    }
    for (const key of [...(colorPatch ? [] : ["base"]), "landCorrections", "waterCorrections", "landCovers", "waterCovers"]) {
      assertPreparedVertexArray(layers.surface[key], `surface.${key}`);
    }
  }
  if (layers.line) {
    for (const key of ["vertices", "shoreVertices", "oceanCurrentVertices"]) {
      assertPreparedVertexArray(layers.line[key], `line.${key}`);
    }
  }
  if (layers.point) assertPreparedPointVertexArray(layers.point.vertices, "point.vertices");
  if (layers.route) {
    assertPreparedVertexArray(layers.route.vertices, "route.vertices");
    assertPreparedRouteDrawRanges(layers.route.drawRanges, layers.route.vertices.length / FLOATS_PER_VERTEX);
  }
  if (layers.river) assertPreparedVertexArray(layers.river.vertices, "river.vertices");
  if (layers.politicalDebug) {
    assertPreparedVertexArray(layers.politicalDebug.vertices, "politicalDebug.vertices");
    const mode = String(layers.politicalDebug.mode || "none");
    if (mode === "none" && layers.politicalDebug.vertices.length !== 0) {
      throw renderInstallError("render-political-debug-shape", "Worker none 政治调试网格必须为空");
    }
    if (mode !== "none") {
      const selected = mode === "states" ? layers.political?.states : mode === "provinces" ? layers.political?.provinces : null;
      if (!selected || layers.politicalDebug.vertices.length !== selected.vertices.length) {
        throw renderInstallError("render-political-debug-shape", "Worker 政治调试网格与所选政治 cache 不一致");
      }
    }
  }
}

async function materializePreparedSurfaceColorPatch(renderer, map, patch, gate) {
  const source = renderer.surfaceVertices;
  const ranges = renderer.surfaceCellRanges;
  if (!(source instanceof Float32Array) || !source.length || !(ranges instanceof Map) || !ranges.size
    || renderer.viewOptions?.smoothCellBorders === false || renderer.surfacePatchCells?.size) {
    throw renderInstallError("render-surface-color-patch-base", "当前 surface geometry 不支持颜色补丁");
  }
  if (patch.scope === "all" && patch.cellIds.length !== ranges.size) {
    throw renderInstallError("render-surface-color-patch-coverage", "Worker surface 全量颜色补丁未覆盖当前 geometry");
  }
  const base = new Float32Array(source.length);
  const copySliceFloats = 256 * 1024;
  for (let offset = 0; offset < source.length; offset += copySliceFloats) {
    const end = Math.min(source.length, offset + copySliceFloats);
    base.set(source.subarray(offset, end), offset);
    await gate.checkpoint("surface-color-copy", end, source.length);
  }
  let previousCell = -1;
  for (let index = 0; index < patch.cellIds.length; index++) {
    const cell = Number(patch.cellIds[index]);
    const range = ranges.get(cell);
    if (!Number.isInteger(cell) || cell <= previousCell || !range || range.start < 0 || range.end > base.length
      || range.start >= range.end || range.start % FLOATS_PER_VERTEX !== 0 || range.end % FLOATS_PER_VERTEX !== 0
      || (patch.scope === "water" && Number(map.grid.cells.h[cell]) >= 20)) {
      throw renderInstallError("render-surface-color-patch-coverage", "Worker surface 颜色补丁 cell 范围无效");
    }
    const colorOffset = index * 4;
    const red = patch.colors[colorOffset];
    const green = patch.colors[colorOffset + 1];
    const blue = patch.colors[colorOffset + 2];
    const side = patch.colors[colorOffset + 3];
    if (!Number.isFinite(red) || !Number.isFinite(green) || !Number.isFinite(blue) || !Number.isFinite(side)) {
      throw renderInstallError("render-surface-color-patch-shape", "Worker surface 颜色补丁包含无效数值");
    }
    for (let offset = range.start; offset < range.end; offset += FLOATS_PER_VERTEX) {
      base[offset + 2] = red;
      base[offset + 3] = green;
      base[offset + 4] = blue;
      base[offset + 5] = side;
    }
    previousCell = cell;
    if ((index + 1) % 256 === 0 || index + 1 === patch.cellIds.length) {
      await gate.checkpoint("surface-color-apply", index + 1, patch.cellIds.length);
    }
  }
  return {
    base,
    landCorrections: patch.landCorrections,
    waterCorrections: patch.waterCorrections,
    landCovers: patch.landCovers,
    waterCovers: patch.waterCovers,
    shoreSurfaceCellRanges: patch.shoreSurfaceCellRanges
  };
}

async function prepareInPlaceSurfaceColorPatch(renderer, map, patch, gate) {
  const source = renderer.surfaceVertices;
  const ranges = renderer.surfaceCellRanges;
  const bufferSet = renderer.surfaceBaseBufferSet;
  if (!(source instanceof Float32Array) || !source.length || !(ranges instanceof Map) || !ranges.size
    || !isSurfaceBaseBufferSetForVertices(bufferSet, source)
    || renderer.vertexBuffer !== bufferSet.segments[0]?.buffer
    || renderer.viewOptions?.smoothCellBorders === false || renderer.surfacePatchCells?.size) {
    throw renderInstallError("render-surface-color-patch-base", "当前 surface geometry 不支持原位颜色补丁");
  }
  if (patch.scope === "all" && patch.cellIds.length !== ranges.size) {
    throw renderInstallError("render-surface-color-patch-coverage", "Worker surface 全量颜色补丁未覆盖当前 geometry");
  }
  const cellRanges = new Uint32Array(patch.cellIds.length * 2);
  const previousColors = new Float32Array(patch.colors.length);
  let previousCell = -1;
  for (let index = 0; index < patch.cellIds.length; index++) {
    const cell = Number(patch.cellIds[index]);
    const range = ranges.get(cell);
    if (!Number.isInteger(cell) || cell <= previousCell || !range || range.start < 0 || range.end > source.length
      || range.start >= range.end || range.start % FLOATS_PER_VERTEX !== 0 || range.end % FLOATS_PER_VERTEX !== 0
      || (patch.scope === "water" && Number(map.grid.cells.h[cell]) >= 20)) {
      throw renderInstallError("render-surface-color-patch-coverage", "Worker surface 颜色补丁 cell 范围无效");
    }
    const colorOffset = index * 4;
    const red = patch.colors[colorOffset];
    const green = patch.colors[colorOffset + 1];
    const blue = patch.colors[colorOffset + 2];
    const side = patch.colors[colorOffset + 3];
    if (!Number.isFinite(red) || !Number.isFinite(green) || !Number.isFinite(blue) || !Number.isFinite(side)) {
      throw renderInstallError("render-surface-color-patch-shape", "Worker surface 颜色补丁包含无效数值");
    }
    previousColors[colorOffset] = source[range.start + 2];
    previousColors[colorOffset + 1] = source[range.start + 3];
    previousColors[colorOffset + 2] = source[range.start + 4];
    previousColors[colorOffset + 3] = source[range.start + 5];
    cellRanges[index * 2] = range.start;
    cellRanges[index * 2 + 1] = range.end;
    previousCell = cell;
    if ((index + 1) % 256 === 0 || index + 1 === patch.cellIds.length) {
      await gate.checkpoint("surface-color-snapshot", index + 1, patch.cellIds.length);
    }
  }
  return {
    source,
    ranges,
    bufferSet,
    cellRanges,
    colors: patch.colors,
    previousColors
  };
}

async function applyInPlaceSurfaceColors(renderer, patch, colors, options = {}) {
  const signal = options.signal || null;
  const isCurrent = typeof options.isCurrent === "function" ? options.isCurrent : null;
  const yieldToMain = typeof options.yieldToMain === "function" ? options.yieldToMain : defaultYield;
  const budgetMs = Math.max(1, Number(options.budgetMs) || 6);
  let deadline = now() + budgetMs;
  const assertCurrent = () => {
    if (!signal?.aborted && (!isCurrent || isCurrent() === true)) return;
    const error = new Error(signal?.aborted ? "Worker 渲染安装已取消" : "Worker 渲染安装已因显示状态变化而过期");
    error.name = signal?.aborted ? "AbortError" : "Error";
    error.code = signal?.aborted ? "render-install-aborted" : "render-install-obsolete";
    throw error;
  };
  assertCurrent();
  const cellCount = patch.cellRanges.length / 2;
  for (let index = 0; index < cellCount; index++) {
    const start = patch.cellRanges[index * 2];
    const end = patch.cellRanges[index * 2 + 1];
    const colorOffset = index * 4;
    const red = colors[colorOffset];
    const green = colors[colorOffset + 1];
    const blue = colors[colorOffset + 2];
    const side = colors[colorOffset + 3];
    for (let offset = start; offset < end; offset += FLOATS_PER_VERTEX) {
      patch.source[offset + 2] = red;
      patch.source[offset + 3] = green;
      patch.source[offset + 4] = blue;
      patch.source[offset + 5] = side;
    }
    if ((index & 255) === 255 && now() >= deadline) {
      options.onProgress?.({phase: "cpu", completed: index + 1, total: cellCount});
      await yieldToMain();
      assertCurrent();
      deadline = now() + budgetMs;
    }
  }
  for (let index = 0; index < patch.bufferSet.segments.length; index++) {
    assertCurrent();
    const segment = patch.bufferSet.segments[index];
    uploadSurfaceBaseBufferSetRanges(renderer.gl, patch.bufferSet, patch.source, [{
      start: segment.floatStart,
      end: segment.floatEnd
    }]);
    options.onProgress?.({phase: "gpu", completed: index + 1, total: patch.bufferSet.segments.length});
    if (index + 1 < patch.bufferSet.segments.length) {
      await yieldToMain();
      assertCurrent();
    }
  }
}

function assertInPlaceSurfaceOwner(renderer, map, patch) {
  if (!hasInPlaceSurfaceOwner(renderer, map, patch)) {
    throw renderInstallError("render-surface-color-patch-obsolete", "surface 颜色补丁的正式缓冲已变化");
  }
}

function hasInPlaceSurfaceOwner(renderer, map, patch) {
  return Boolean(patch && renderer.map === map && renderer.surfaceVertices === patch.source
    && renderer.surfaceCellRanges === patch.ranges && renderer.surfaceBaseBufferSet === patch.bufferSet
    && renderer.vertexBuffer === patch.bufferSet.segments[0]?.buffer);
}

function assertPreparedPoliticalCache(value, field, label) {
  if (!value || value.field !== field) throw renderInstallError("render-political-shape", `Worker ${label} field 无效`);
  assertPreparedVertexArray(value.vertices, `${label}.vertices`);
  assertPreparedVertexArray(value.surfaceVertices, `${label}.surfaceVertices`);
  const vertexCount = Number(value.vertexCount);
  if (!Number.isInteger(vertexCount) || vertexCount !== value.surfaceVertices.length / FLOATS_PER_VERTEX
    || value.vertices.length !== value.surfaceVertices.length) {
    throw renderInstallError("render-political-shape", `Worker ${label} vertex count 无效`);
  }
}

function assertPreparedVertexArray(value, label) {
  if (!(value instanceof Float32Array) || value.length % (FLOATS_PER_VERTEX * 3) !== 0) {
    throw renderInstallError("render-vertex-shape", `Worker ${label} 顶点数组结构无效`);
  }
}

function assertPreparedPointVertexArray(value, label) {
  if (!(value instanceof Float32Array) || value.length % FLOATS_PER_VERTEX !== 0) {
    throw renderInstallError("render-vertex-shape", `Worker ${label} 顶点数组结构无效`);
  }
}

function assertPreparedRouteDrawRanges(value, vertexCount) {
  if (!value || typeof value !== "object") throw renderInstallError("render-route-ranges-shape", "Worker route draw ranges 缺失");
  let cursor = 0;
  for (const key of ["ordinary", "seaLand", "seaWater"]) {
    const first = Number(value[key]?.first);
    const count = Number(value[key]?.count);
    if (!Number.isInteger(first) || !Number.isInteger(count) || first !== cursor || count < 0 || first + count > vertexCount
      || first % 3 !== 0 || count % 3 !== 0) {
      throw renderInstallError("render-route-ranges-shape", `Worker route ${key} draw range 无效`);
    }
    cursor += count;
  }
  if (cursor !== vertexCount) throw renderInstallError("render-route-ranges-shape", "Worker route draw ranges 未完整覆盖顶点数组");
}

async function uploadPreparedBuffer(gl, values, usage, gate, label) {
  if (!(values instanceof Float32Array)) throw renderInstallError("render-vertex-shape", `Worker ${label} 顶点数组结构无效`);
  const source = values;
  const buffer = gl.createBuffer();
  if (!buffer) throw renderInstallError("render-buffer-create", `无法创建 ${label} 临时 GPU buffer`);
  try {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, source.byteLength, usage);
    const sliceFloats = Math.max(1, Math.floor(gate.uploadSliceBytes / Float32Array.BYTES_PER_ELEMENT));
    for (let offset = 0; offset < source.length; offset += sliceFloats) {
      gate.assertCurrent();
      const end = Math.min(source.length, offset + sliceFloats);
      gl.bufferSubData(gl.ARRAY_BUFFER, offset * Float32Array.BYTES_PER_ELEMENT, source.subarray(offset, end));
      await gate.checkpoint(`gpu:${label}`, end, source.length);
    }
    return buffer;
  } catch (error) {
    gl.deleteBuffer(buffer);
    throw error;
  }
}

export function applyPreparedPickingComponents(current, replacement, components) {
  const affected = new Set(components);
  const beforeBucketEntries = [...current.buckets];
  const snapshots = [];
  const keys = new Set([...current.buckets.keys(), ...replacement.buckets.keys()]);
  for (const key of keys) {
    const existing = current.buckets.get(key);
    const next = replacement.buckets.get(key);
    if (!existing) {
      const bucket = Object.fromEntries(OBJECT_PICKING_COMPONENTS.map(component => [component, affected.has(component) ? next?.[component] || [] : []]));
      current.buckets.set(key, bucket);
      continue;
    }
    snapshots.push([existing, Object.fromEntries(components.map(component => [component, existing[component]]))]);
    for (const component of components) existing[component] = next?.[component] || [];
  }
  for (const [key, bucket] of current.buckets) {
    if (OBJECT_PICKING_COMPONENTS.some(component => bucket[component]?.length)) continue;
    current.buckets.delete(key);
  }
  const componentStats = {
    cities: "cityCount",
    markers: "markerCount",
    military: "militaryCount",
    routeSegments: "routeSegmentCount",
    riverSegments: "riverSegmentCount"
  };
  const stats = ["bucketCount", "maxBucketItems", ...components.map(component => componentStats[component])];
  const beforeStats = Object.fromEntries(stats.map(key => [key, current[key]]));
  current.bucketCount = current.buckets.size;
  for (const component of components) current[componentStats[component]] = replacement[componentStats[component]];
  current.maxBucketItems = Math.max(0, ...[...current.buckets.values()].map(bucket => (
    OBJECT_PICKING_COMPONENTS.reduce((sum, component) => sum + (bucket[component]?.length || 0), 0)
  )));
  return {
    rollback() {
      for (const [bucket, values] of snapshots) Object.assign(bucket, values);
      current.buckets.clear();
      for (const [key, bucket] of beforeBucketEntries) current.buckets.set(key, bucket);
      Object.assign(current, beforeStats);
    }
  };
}

function rebindShorePathCache(dto, shorePaths, binding) {
  if (!dto || Number(dto.schemaVersion) !== 1 || !sameBinding(dto.binding, binding)) {
    throw renderInstallError("render-shore-cache-stale", "岸线路径顶点缓存绑定无效");
  }
  if (!Array.isArray(dto.keys) || !(dto.offsets instanceof Uint32Array) || !(dto.vertices instanceof Float32Array)
    || dto.vertices.length % (FLOATS_PER_VERTEX * 3) !== 0
    || dto.offsets.length !== dto.keys.length + 1 || dto.offsets[0] !== 0 || dto.offsets.at(-1) !== dto.vertices.length) {
    throw renderInstallError("render-shore-cache-shape", "岸线路径顶点缓存结构无效");
  }
  const pathVertices = new Map();
  for (let index = 0; index < dto.keys.length; index++) {
    const start = dto.offsets[index];
    const end = dto.offsets[index + 1];
    if (end < start || end > dto.vertices.length || start % (FLOATS_PER_VERTEX * 3) !== 0
      || end % (FLOATS_PER_VERTEX * 3) !== 0 || pathVertices.has(dto.keys[index])) {
      throw renderInstallError("render-shore-cache-shape", "岸线路径顶点缓存偏移无效");
    }
    pathVertices.set(dto.keys[index], dto.vertices.subarray(start, end));
  }
  const pathObjectVertices = new WeakMap();
  for (const [featureType, paths] of [["coastline", shorePaths?.coastline], ["lakeShore", shorePaths?.lakeShore]]) {
    for (const path of paths || []) {
      const vertices = pathVertices.get(shorePathKey(featureType, path));
      if (vertices) pathObjectVertices.set(path, vertices);
    }
  }
  return {pathVertices, pathObjectVertices};
}

function shorePathKey(featureType, path) {
  const edges = (path?.sourceEdges || []).map(edge => {
    const a = edge.a?.join(",") || "";
    const b = edge.b?.join(",") || "";
    return `${edge.landCell}:${edge.waterCell}:${a < b ? `${a}:${b}` : `${b}:${a}`}`;
  }).sort().join("|");
  return `${featureType}:${edges || (path?.points || []).map(point => point.join(",")).join("|")}`;
}

function createInstallGate(options) {
  const signal = options.signal || null;
  const isCurrent = typeof options.isCurrent === "function" ? options.isCurrent : null;
  const budgetMs = Math.max(1, Number(options.budgetMs) || 6);
  const uploadSliceBytes = Math.max(16 * 1024, Number(options.uploadSliceBytes) || DEFAULT_UPLOAD_SLICE_BYTES);
  const yieldToMain = typeof options.yieldToMain === "function" ? options.yieldToMain : defaultYield;
  let deadline = now() + budgetMs;
  return {
    uploadSliceBytes,
    assertCurrent,
    yieldToMain,
    onProgress(stage, detail) {
      options.onProgress?.(stage, detail);
    },
    async checkpoint(stage, completed, total) {
      assertCurrent();
      const current = now();
      const finished = Number(total) > 0 && Number(completed) >= Number(total);
      if (finished || current >= deadline) options.onProgress?.(stage, {completed, total});
      if (current < deadline) return;
      await yieldToMain();
      assertCurrent();
      deadline = now() + budgetMs;
    },
    options(stage) {
      return {
        signal,
        isCurrent,
        budgetMs,
        yieldToMain,
        onProgress: (substage, detail) => options.onProgress?.(`${stage}:${substage}`, detail)
      };
    }
  };

  function assertCurrent() {
    if (!signal?.aborted && (!isCurrent || isCurrent() === true)) return true;
    const error = new Error(signal?.aborted ? "Worker 渲染安装已取消" : "Worker 渲染安装已因视口或请求变化而过期");
    error.name = signal?.aborted ? "AbortError" : "Error";
    error.code = signal?.aborted ? "render-install-aborted" : "render-install-obsolete";
    throw error;
  }
}

async function normalizePreparedShoreSurfaceCellRanges(value, surface, cellCount, gate) {
  if (!value || typeof value !== "object") throw renderInstallError("render-shore-ranges-shape", "Worker 岸线 surface ranges 缺失");
  const result = {};
  for (const key of ["landCorrections", "waterCorrections", "landCovers", "waterCovers"]) {
    const source = value[key];
    const floatLength = Number(surface?.[key]?.length);
    if (!Number.isInteger(floatLength) || floatLength < 0 || floatLength % FLOATS_PER_VERTEX !== 0) {
      throw renderInstallError("render-shore-ranges-shape", `Worker 岸线 ${key} 顶点数组结构无效`);
    }
    if (!(source instanceof Map)) throw renderInstallError("render-shore-ranges-shape", `Worker 岸线 ${key} ranges 结构无效`);
    const target = new Map();
    const allRanges = [];
    let processed = 0;
    for (const [cell, ranges] of source) {
      const normalizedCell = Number(cell);
      if (!Number.isInteger(normalizedCell) || normalizedCell < 0 || normalizedCell >= cellCount || !Array.isArray(ranges)) {
        throw renderInstallError("render-shore-ranges-shape", `Worker 岸线 ${key} cell ranges 结构无效`);
      }
      if (target.has(normalizedCell)) throw renderInstallError("render-shore-ranges-shape", `Worker 岸线 ${key} cell id 归一化后重复`);
      const normalizedRanges = [];
      for (const range of ranges) {
        const start = Number(range?.start);
        const end = Number(range?.end);
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start
          || start % FLOATS_PER_VERTEX !== 0 || end % FLOATS_PER_VERTEX !== 0 || end > floatLength) {
          throw renderInstallError("render-shore-ranges-shape", `Worker 岸线 ${key} range 偏移无效`);
        }
        normalizedRanges.push({start, end});
        allRanges.push({start, end});
        processed++;
        if ((processed & 63) === 0) await gate.checkpoint(`shore-ranges:${key}`, processed, Number.POSITIVE_INFINITY);
      }
      if (normalizedRanges.length) target.set(normalizedCell, normalizedRanges);
    }
    allRanges.sort((left, right) => left.start - right.start || left.end - right.end);
    let cursor = 0;
    for (const range of allRanges) {
      if (range.start !== cursor) throw renderInstallError("render-shore-ranges-shape", `Worker 岸线 ${key} ranges 存在重叠或缺口`);
      cursor = range.end;
    }
    if (cursor !== floatLength) throw renderInstallError("render-shore-ranges-shape", `Worker 岸线 ${key} ranges 未完整覆盖顶点数组`);
    await gate.checkpoint(`shore-ranges:${key}`, processed, processed);
    result[key] = target;
  }
  return result;
}

async function normalizePreparedSurfaceCellRanges(value, surfaceFloatLength, mode, cellVisualMesh, cellCount, gate) {
  if (!(value instanceof Map)) throw renderInstallError("render-surface-ranges-shape", "Worker surface cell ranges 缺失或结构无效");
  if (mode !== "cell-visual" && mode !== "grid-cells" && mode !== "unavailable") throw renderInstallError("render-surface-ranges-shape", "Worker surface cell ranges 模式无效");
  if (mode === "unavailable" && value.size) throw renderInstallError("render-surface-ranges-shape", "Worker unavailable surface cell ranges 必须为空");
  if (mode === "cell-visual" && surfaceFloatLength > 0 && !value.size) throw renderInstallError("render-surface-ranges-shape", "Worker cell-visual surface cell ranges 不得为空");
  const expectedCells = mode === "cell-visual" ? (cellVisualMesh?.cells || []).filter(cell => (cell?.ndcTriangles?.length || 0) > 0) : [];
  if (mode === "cell-visual" && value.size !== expectedCells.length) {
    throw renderInstallError("render-surface-ranges-shape", "Worker surface cell ranges 与 cell visual mesh 数量不一致");
  }
  if (mode === "grid-cells" && value.size !== cellCount) {
    throw renderInstallError("render-surface-ranges-shape", "Worker grid-cells surface cell ranges 未覆盖完整 grid");
  }
  const result = new Map();
  let previousEnd = 0;
  let cellIndex = 0;
  for (const [cell, range] of value) {
    const normalizedCell = Number(cell);
    const start = Number(range?.start);
    const end = Number(range?.end);
    const expectedCell = expectedCells[cellIndex];
    const expectedLength = ((expectedCell?.ndcTriangles?.length || 0) / 2) * FLOATS_PER_VERTEX;
    if (!Number.isInteger(normalizedCell) || normalizedCell < 0 || normalizedCell >= cellCount
      || !Number.isInteger(start) || !Number.isInteger(end)
      || start !== previousEnd || end <= start || end > surfaceFloatLength
      || start % FLOATS_PER_VERTEX !== 0 || end % FLOATS_PER_VERTEX !== 0
      || (mode === "cell-visual" && (normalizedCell !== Number(expectedCell?.cell) || end - start !== expectedLength))
      || (mode === "grid-cells" && normalizedCell !== cellIndex)) {
      throw renderInstallError("render-surface-ranges-shape", "Worker surface cell range 偏移无效");
    }
    if (result.has(normalizedCell)) throw renderInstallError("render-surface-ranges-shape", "Worker surface cell id 归一化后重复");
    result.set(normalizedCell, {start, end});
    previousEnd = end;
    cellIndex++;
    if ((result.size & 255) === 0 || result.size === value.size) await gate.checkpoint("surface-ranges", result.size, value.size);
  }
  if (result.size && previousEnd !== surfaceFloatLength) {
    throw renderInstallError("render-surface-ranges-shape", "Worker surface cell ranges 未完整覆盖顶点数组");
  }
  return result;
}

function gridCellCount(map) {
  const count = Number(map?.grid?.cells?.i?.length ?? map?.grid?.cells?.h?.length);
  if (!Number.isInteger(count) || count < 1) throw renderInstallError("render-grid-shape", "Worker 渲染安装缺少有效 grid cells");
  return count;
}

function retainSurfaceBaseBufferSet(bufferSet) {
  for (const buffer of flattenSurfaceBaseBufferSet(bufferSet)) {
    surfaceBaseBufferOwners.set(buffer, (surfaceBaseBufferOwners.get(buffer) || 0) + 1);
  }
}

function releaseSurfaceBaseBufferSet(bufferSet) {
  for (const buffer of flattenSurfaceBaseBufferSet(bufferSet)) {
    const owners = surfaceBaseBufferOwners.get(buffer) || 0;
    if (owners <= 1) surfaceBaseBufferOwners.delete(buffer);
    else surfaceBaseBufferOwners.set(buffer, owners - 1);
  }
}

function retainCellVisualCorrectionBufferSet(bufferSet) {
  for (const buffer of flattenCellVisualCorrectionBufferSet(bufferSet)) {
    cellVisualCorrectionBufferOwners.set(buffer, (cellVisualCorrectionBufferOwners.get(buffer) || 0) + 1);
  }
}

function releaseCellVisualCorrectionBufferSet(bufferSet) {
  for (const buffer of flattenCellVisualCorrectionBufferSet(bufferSet)) {
    const owners = cellVisualCorrectionBufferOwners.get(buffer) || 0;
    if (owners <= 1) cellVisualCorrectionBufferOwners.delete(buffer);
    else cellVisualCorrectionBufferOwners.set(buffer, owners - 1);
  }
}

function deleteUnownedCellVisualCorrectionBuffers(gl, bufferSet, currentBufferSet) {
  const currentBuffers = new Set(flattenCellVisualCorrectionBufferSet(currentBufferSet));
  for (const buffer of flattenCellVisualCorrectionBufferSet(bufferSet)) {
    if (currentBuffers.has(buffer) || (cellVisualCorrectionBufferOwners.get(buffer) || 0) > 0) continue;
    if (typeof gl.isBuffer === "function" && gl.isBuffer(buffer) !== true) continue;
    gl.deleteBuffer(buffer);
  }
}

function deleteUnownedSurfaceBaseBuffers(gl, bufferSet, currentBufferSet) {
  const currentBuffers = new Set(flattenSurfaceBaseBufferSet(currentBufferSet));
  for (const buffer of flattenSurfaceBaseBufferSet(bufferSet)) {
    if (currentBuffers.has(buffer) || (surfaceBaseBufferOwners.get(buffer) || 0) > 0) continue;
    if (typeof gl.isBuffer === "function" && gl.isBuffer(buffer) !== true) continue;
    gl.deleteBuffer(buffer);
  }
}

function deletePreparedBuffers(gl, buffers) {
  const seen = new Set();
  for (const buffer of buffers) {
    if (!buffer || seen.has(buffer)) continue;
    seen.add(buffer);
    gl.deleteBuffer(buffer);
  }
}

function deletePreparedBuffersBestEffort(gl, buffers) {
  try {
    deletePreparedBuffers(gl, buffers);
  } catch {
    // 资源释放失败不能把已原子提交的地图和渲染状态重新变成失败事务。
  }
}

function vertexCount(values) {
  return Math.floor((values?.length || 0) / FLOATS_PER_VERTEX);
}

function sameBinding(left, right) {
  return String(left?.mapIdentity ?? "") === String(right?.mapIdentity ?? "")
    && Number(left?.mapRevision || 0) === Number(right?.mapRevision || 0);
}

function defaultYield() {
  if (typeof globalThis.scheduler?.yield === "function") return globalThis.scheduler.yield();
  return new Promise(resolve => setTimeout(resolve, 0));
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function renderInstallError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
