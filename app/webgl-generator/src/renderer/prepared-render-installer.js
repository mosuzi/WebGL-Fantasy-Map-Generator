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
  flattenSurfaceBaseBufferSet
} from "./surface-base-buffer-set.js";
import {snapshotViewportCamera} from "./viewport-buffer-transform.js";

const FLOATS_PER_VERTEX = 6;
const DEFAULT_UPLOAD_SLICE_BYTES = 256 * 1024;
const surfaceBaseBufferOwners = new WeakMap();

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

  try {
    validatePreparedLayerShapes(layers);
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
      decoded.picking = await rebindObjectPickingDtoInChunks(layers.picking, map, binding, gate.options("picking"));
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
      if (!new Set(["none", "states", "provinces"]).has(mode) || mode !== String(renderer.politicalMeshDebugMode || "none")) {
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
      decoded.surfaceCellRanges = await normalizePreparedSurfaceCellRanges(
        layers.surface.surfaceCellRanges,
        layers.surface.base?.length || 0,
        layers.surface.surfaceCellRangesMode,
        decoded.cellVisual || renderer.cellVisualMesh,
        gridCellCount(map),
        gate
      );
      decoded.shoreSurfaceCellRanges = await normalizePreparedShoreSurfaceCellRanges(
        layers.surface.shoreSurfaceCellRanges,
        layers.surface,
        gridCellCount(map),
        gate
      );
      surfaceBaseBufferSet = await createSurfaceBaseBufferSetAsync(renderer.gl, layers.surface.base, {
        usage: renderer.gl.STATIC_DRAW,
        yieldToMain: gate.yieldToMain,
        assertCurrent: gate.assertCurrent,
        onProgress: detail => gate.onProgress("gpu:surfaceBaseBufferSet", detail)
      });
      for (const [key, values] of [
        ["landCorrectionBuffer", layers.surface.landCorrections],
        ["waterCorrectionBuffer", layers.surface.waterCorrections],
        ["landCoverBuffer", layers.surface.landCovers],
        ["waterCoverBuffer", layers.surface.waterCovers]
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
    throw error;
  }

  return createPreparedInstallTransaction(renderer, map, prepared, decoded, buffers, surfaceBaseBufferSet, {
    preserveRoutePicking: options.preserveRoutePicking === true,
    resetViewport: options.resetViewport === true,
    deferOverlayLayout: options.deferOverlayLayout === true
  });
}

function createPreparedInstallTransaction(renderer, map, prepared, decoded, buffers, surfaceBaseBufferSet, options) {
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
  let ownsPreparedSurfaceBase = Boolean(surfaceBaseBufferSet);
  let ownsPreviousSurfaceBase = false;
  if (ownsPreparedSurfaceBase) retainSurfaceBaseBufferSet(surfaceBaseBufferSet);

  return Object.freeze({
    commit,
    rollback,
    finalize,
    get committed() { return committed; }
  });

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
      if (decoded.cellVisual) assign("cellVisualMesh", decoded.cellVisual);
      if (decoded.shore) assign("shoreVisualPaths", decoded.shore);
      if (decoded.statePaths) assign("stateVisualPaths", decoded.statePaths);
      if (decoded.provincePaths) assign("provinceVisualPaths", decoded.provincePaths);
      if (decoded.political) assign("politicalVisualMeshes", decoded.political);
      if (layers.politicalDebug) assign("politicalMeshDebugVertexCount", vertexCount(layers.politicalDebug.vertices));
      if (decoded.picking) {
        if (options.preserveRoutePicking && renderer.objectPickingIndex) {
          pickingMutation = applyNonRoutePicking(renderer.objectPickingIndex, decoded.picking);
        } else assign("objectPickingIndex", decoded.picking);
      }
      if (decoded.overlay) installOverlay(decoded.overlay);
      if (layers.surface) {
      assignSurfaceBaseBufferSet(surfaceBaseBufferSet);
      assign("surfaceVertices", layers.surface.base);
      assign("landCorrectionVertices", layers.surface.landCorrections);
      assign("waterCorrectionVertices", layers.surface.waterCorrections);
      assign("landCoverVertices", layers.surface.landCovers);
      assign("waterCoverVertices", layers.surface.waterCovers);
      assign("surfaceCellRanges", decoded.surfaceCellRanges);
      assign("shoreSurfaceCellRanges", decoded.shoreSurfaceCellRanges);
      assign("surfacePatchVertices", new Float32Array());
      assign("surfacePatchCellRanges", new Map());
      assign("surfacePatchCells", new Set());
      assign("surfacePatchVertexCount", 0);
      assign("vertexCount", vertexCount(layers.surface.base));
      assign("landCorrectionVertexCount", vertexCount(layers.surface.landCorrections));
      assign("waterCorrectionVertexCount", vertexCount(layers.surface.waterCorrections));
      assign("landCoverVertexCount", vertexCount(layers.surface.landCovers));
      assign("waterCoverVertexCount", vertexCount(layers.surface.waterCovers));
      }
      if (layers.line) {
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
    } catch (error) {
      failures.push(error);
    }
    try {
      releasePreviousSurfaceBase();
    } catch (error) {
      failures.push(error);
    }
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

  function finalize() {
    if (finalized) return false;
    if (!committed) {
      deletePreparedBuffersBestEffort(renderer.gl, buffers.values());
      releasePreparedSurfaceBaseBestEffort();
      finalized = true;
      return true;
    }
    const activeBuffers = new Set([...buffers.keys()].map(key => renderer[key]).filter(Boolean));
    const detachedBuffers = [...oldBuffers, ...buffers.values()].filter(buffer => !activeBuffers.has(buffer));
    deletePreparedBuffersBestEffort(renderer.gl, detachedBuffers);
    releasePreviousSurfaceBaseBestEffort();
    releasePreparedSurfaceBaseBestEffort();
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
    for (const key of ["base", "landCorrections", "waterCorrections", "landCovers", "waterCovers"]) {
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

function applyNonRoutePicking(current, replacement) {
  const snapshots = [];
  const inserted = [];
  const keys = new Set([...current.buckets.keys(), ...replacement.buckets.keys()]);
  for (const key of keys) {
    const existing = current.buckets.get(key);
    const next = replacement.buckets.get(key);
    if (!existing) {
      const bucket = {
        cities: next?.cities || [],
        markers: next?.markers || [],
        military: next?.military || [],
        routeSegments: [],
        riverSegments: next?.riverSegments || []
      };
      current.buckets.set(key, bucket);
      inserted.push(key);
      continue;
    }
    snapshots.push([existing, existing.cities, existing.markers, existing.military, existing.riverSegments]);
    existing.cities = next?.cities || [];
    existing.markers = next?.markers || [];
    existing.military = next?.military || [];
    existing.riverSegments = next?.riverSegments || [];
  }
  const stats = ["bucketCount", "cityCount", "markerCount", "militaryCount", "riverSegmentCount", "maxBucketItems"];
  const beforeStats = Object.fromEntries(stats.map(key => [key, current[key]]));
  for (const key of stats) current[key] = key === "bucketCount" ? current.buckets.size : replacement[key];
  return {
    rollback() {
      for (const key of inserted) current.buckets.delete(key);
      for (const [bucket, cities, markers, military, rivers] of snapshots) {
        bucket.cities = cities;
        bucket.markers = markers;
        bucket.military = military;
        bucket.riverSegments = rivers;
      }
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
  if (mode !== "cell-visual" && mode !== "unavailable") throw renderInstallError("render-surface-ranges-shape", "Worker surface cell ranges 模式无效");
  if (mode === "unavailable" && value.size) throw renderInstallError("render-surface-ranges-shape", "Worker unavailable surface cell ranges 必须为空");
  if (mode === "cell-visual" && surfaceFloatLength > 0 && !value.size) throw renderInstallError("render-surface-ranges-shape", "Worker cell-visual surface cell ranges 不得为空");
  const expectedCells = mode === "cell-visual" ? (cellVisualMesh?.cells || []).filter(cell => (cell?.ndcTriangles?.length || 0) > 0) : [];
  if (mode === "cell-visual" && value.size !== expectedCells.length) {
    throw renderInstallError("render-surface-ranges-shape", "Worker surface cell ranges 与 cell visual mesh 数量不一致");
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
      || (mode === "cell-visual" && (normalizedCell !== Number(expectedCell?.cell) || end - start !== expectedLength))) {
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
