import {
  buildLineVertices,
  buildGpuResidentShoreSurfacePrewarm,
  buildPlaceholderCompactSurfaceBundle,
  buildPlaceholderSurfaceBundle,
  buildPlaceholderSurfaceColorPatch,
  buildPointLayer,
  buildRiverMeshVertices,
  buildRouteMeshVertices,
  shoreLinePathKey
} from "./placeholder-renderer.js";
import {buildLabelLayoutDescriptors} from "./label-layout-descriptor.js";
import {buildCellVisualBoundaryMesh, buildCellVisualMesh} from "./cell-visual-layer.js";
import {buildShoreSurfaceVertexLayers, buildShoreVisualPaths} from "./shore-layer.js";
import {
  PROVINCE_VISUAL_STYLE,
  STATE_VISUAL_STYLE,
  buildPoliticalVisualMeshCache,
  buildProvinceVisualPaths,
  buildStateVisualPaths,
  emptyPoliticalVisualMeshes,
  normalizePoliticalMeshDebugMode,
  politicalMeshDebugCache
} from "./political-layer.js";
import {
  packCellVisualMesh,
  packPoliticalVisualPaths,
  packShoreVisualPaths,
  unpackCellVisualMesh,
  unpackPoliticalVisualPaths,
  unpackShoreVisualPaths
} from "./render-cache-dto.js";
import {buildObjectPickingDto} from "./picking-dto.js";
import {OBJECT_PICKING_COMPONENTS} from "./picking.js";
import {normalizeUnitPreferences} from "../ui/display-units.js";
import {createRenderContext} from "./render-context.js";
import {compactSurfaceBaseGeometry} from "./surface-base-buffer-set.js";
import {createPreparedDisplayIntent} from "./prepared-display-intent.js";
import {
  normalizeRenderResourceBinding,
  sameRenderResourceBinding,
  sameRenderResourceGeneration
} from "./render-resource-binding.js";

export const RENDER_PREPARATION_TASK = "render.prepare";
export const RENDER_PREPARATION_SCHEMA_VERSION = 1;
export const RENDER_PREPARATION_LAYERS = Object.freeze([
  "cell-visual",
  "shore",
  "shore-surface",
  "state-paths",
  "province-paths",
  "political",
  "surface",
  "line",
  "picking",
  "labels",
  "route",
  "river",
  "point",
  "gpu-shore-surface"
]);

const REGENERATION_RENDER_LAYERS = Object.freeze({
  features: Object.freeze(["cell-visual", "shore", "state-paths", "province-paths", "political", "surface", "line", "point", "labels", "picking"]),
  routes: Object.freeze(["point", "labels", "route", "picking"]),
  rivers: Object.freeze(["surface", "point", "river", "picking"]),
  cities: Object.freeze(["point", "labels", "route", "picking"]),
  states: Object.freeze(["state-paths", "province-paths", "political", "surface", "line", "point", "labels", "route", "picking"]),
  provinces: Object.freeze(["state-paths", "province-paths", "political", "surface", "line", "point", "labels", "route", "picking"]),
  markers: Object.freeze(["point", "labels", "picking"]),
  diplomacy: Object.freeze(["surface", "line", "picking"]),
  religions: Object.freeze(["surface", "picking"]),
  military: Object.freeze(["point", "line", "labels", "picking"]),
  zones: Object.freeze(["surface", "line", "labels"])
});

const REGENERATION_PICKING_COMPONENTS = Object.freeze({
  features: Object.freeze([...OBJECT_PICKING_COMPONENTS]),
  routes: Object.freeze(["cities", "routeSegments"]),
  rivers: Object.freeze(["riverSegments"]),
  cities: Object.freeze(["cities", "routeSegments"]),
  states: Object.freeze(["cities", "routeSegments"]),
  provinces: Object.freeze(["cities", "routeSegments"]),
  markers: Object.freeze(["markers"]),
  diplomacy: Object.freeze(["military"]),
  religions: Object.freeze(["cities"]),
  military: Object.freeze(["military"]),
  "military-policy": Object.freeze(["military"]),
  population: Object.freeze(["cities"]),
  economy: Object.freeze(["cities"]),
  "culture-expansion": Object.freeze(["cities"]),
  "religion-expansion": Object.freeze(["cities"]),
  zones: Object.freeze([]),
  "height-derived": Object.freeze([...OBJECT_PICKING_COMPONENTS]),
  "climate-downstream": Object.freeze([...OBJECT_PICKING_COMPONENTS]),
  "ocean-current-world": Object.freeze([...OBJECT_PICKING_COMPONENTS]),
  "grid-topology": Object.freeze([...OBJECT_PICKING_COMPONENTS])
});

export function renderPreparationLayersForRegeneration(kind, presentation = {}) {
  const normalizedKind = String(kind || "").trim().toLowerCase();
  const layers = REGENERATION_RENDER_LAYERS[normalizedKind];
  if (!layers) throw renderPreparationError("render-regeneration-kind-unsupported", `没有 ${kind || "(empty)"} 的渲染准备范围`);
  if (normalizedKind !== "provinces") return [...layers];
  const colorMode = String(presentation?.colorMode || "height");
  const visibility = presentation?.visibility || {};
  const needsPoliticalMeshes = normalizePoliticalMeshDebugMode(presentation?.politicalMeshDebugMode) !== "none"
    || (presentation?.viewOptions?.smoothCellBorders !== false && presentation?.hasCellVisual !== true);
  return layers.filter(layer => (
    layer !== "state-paths"
    && (layer !== "political" || needsPoliticalMeshes)
    && (layer !== "surface" || colorMode === "provinces")
    && (layer !== "line" || visibility.provinceBorders !== false)
  ));
}

export function renderPreparationPickingComponentsForRegeneration(kind) {
  const components = REGENERATION_PICKING_COMPONENTS[String(kind || "").trim().toLowerCase()];
  if (!components) throw renderPreparationError("render-regeneration-kind-unsupported", `没有 ${kind || "(empty)"} 的 picking 准备范围`);
  return [...components];
}

export async function executeRenderPreparationTask(payload = {}, context = {}) {
  const map = payload.map;
  if (!map || typeof map !== "object") throw renderPreparationError("render-map-required", "渲染准备缺少地图快照");
  const envelopeBinding = cloneRenderEnvelopeBinding(payload.binding ?? context.binding);
  const binding = normalizeRenderBinding(envelopeBinding);
  const camera = normalizeCamera(payload.camera);
  const canvas = normalizeCanvas(payload.canvas);
  const requested = normalizeRequestedLayers(payload.layers);
  const result = {
    schemaVersion: RENDER_PREPARATION_SCHEMA_VERSION,
    binding: envelopeBinding,
    presentation: {
      unitPreferences: normalizeUnitPreferences(payload.unitPreferences || {}),
      politicalMeshDebugMode: normalizePoliticalMeshDebugMode(payload.politicalMeshDebugMode),
      display: createPreparedDisplayIntent(payload, binding)
    },
    layers: {}
  };
  const cacheState = resolveRenderPreparationCache(context.renderCache, binding);
  const cache = cacheState.cache;

  for (let index = 0; index < requested.length; index++) {
    checkpoint(context, requested[index], index, requested.length);
    const layer = requested[index];
    if (layer === "route") {
      result.layers.route = buildRouteMeshVertices(
        map,
        camera,
        canvas,
        payload.selection || null,
        Array.isArray(payload.objectHighlights) ? payload.objectHighlights : [],
        payload.visualTheme || {}
      );
    } else if (layer === "river") {
      result.layers.river = buildRiverMeshVertices(map, camera, canvas);
    } else if (layer === "point") {
      result.layers.point = buildPointLayer(map);
    } else if (layer === "cell-visual") {
      ensureCellVisualCache(map, binding, payload.caches, cache, {requireFull: true});
      result.layers.cellVisual = packCellVisualMesh(cache.cellVisual, binding, {
        transferMode: payload.cellVisualTransferMode
      });
    } else if (layer === "shore") {
      ensureShoreCache(map, binding, payload.caches, cache);
      result.layers.shore = packShoreVisualPaths(cache.shore, binding);
    } else if (layer === "shore-surface") {
      ensureShoreCache(map, binding, payload.caches, cache);
      result.layers.shoreSurface = buildShoreSurfaceVertexLayers(
        createRenderContext(map),
        payload.colorMode || "height",
        payload.viewOptions || {},
        cache.shore
      );
    } else if (layer === "state-paths") {
      ensureStatePathsCache(map, binding, payload.caches, cache);
      result.layers.statePaths = packPoliticalVisualPaths(cache.statePaths, binding, "state");
    } else if (layer === "province-paths") {
      ensureProvincePathsCache(map, binding, payload.caches, cache);
      result.layers.provincePaths = packPoliticalVisualPaths(cache.provincePaths, binding, "province");
    } else if (layer === "political") {
      const prepared = ensureRenderCaches(map, binding, payload.caches, cache, payload);
      const political = ensurePoliticalMeshes(map, prepared, payload);
      const debugMode = result.presentation.politicalMeshDebugMode;
      result.layers.political = political;
      result.layers.politicalDebug = {
        mode: debugMode,
        vertices: politicalMeshDebugCache(political, debugMode)?.vertices || new Float32Array()
      };
    } else if (layer === "surface") {
      const coreOnly = payload.surfaceComposition === "core";
      const compactSurface = payload.surfaceTransferMode === "gpu-resident-compact" && coreOnly
        ? buildPlaceholderCompactSurfaceBundle(
            map,
            payload.colorMode || "height",
            payload.viewOptions || {}
          )
        : null;
      if (compactSurface) {
        assertCompactSurfaceCoverage(compactSurface);
        result.layers.surface = compactSurface;
      } else {
        ensureCellVisualCache(map, binding, payload.caches, cache, {
          boundaryOnly: payload.cellVisualGeometryMode === "boundary-only"
        });
        if (!coreOnly) ensureShoreCache(map, binding, payload.caches, cache);
        const needsStatePaths = !coreOnly || String(payload.colorMode || "height") === "states";
        const needsProvincePaths = !coreOnly || String(payload.colorMode || "height") === "provinces";
        if (needsStatePaths) ensureStatePathsCache(map, binding, payload.caches, cache);
        if (needsProvincePaths) ensureProvincePathsCache(map, binding, payload.caches, cache);
        const prepared = cache;
        if (payload.surfacePatchScope === "all" || payload.surfacePatchScope === "water") {
          result.layers.surface = buildPlaceholderSurfaceColorPatch(
            map,
            payload.colorMode || "height",
            payload.viewOptions || {},
            prepared.shore,
            prepared.cellVisual,
            payload.surfacePatchScope
          );
        } else {
          const political = !coreOnly || String(payload.colorMode || "height") === "states" || String(payload.colorMode || "height") === "provinces"
            ? ensurePoliticalMeshes(map, prepared, payload)
            : emptyPoliticalVisualMeshes();
          const surface = buildPlaceholderSurfaceBundle(
            map,
            payload.colorMode || "height",
            payload.viewOptions || {},
            coreOnly ? null : prepared.shore,
            prepared.statePaths,
            prepared.provincePaths,
            political,
            prepared.cellVisual
          );
          result.layers.surface = payload.surfaceTransferMode === "gpu-resident-compact"
            ? compactPreparedSurface(surface)
            : surface;
        }
      }
    } else if (layer === "gpu-shore-surface") {
      cache.shore ||= payload.caches?.shore
        ? unpackShoreVisualPaths(payload.caches.shore, binding)
        : buildShoreVisualPaths(map);
      result.layers.gpuShoreSurface = buildGpuResidentShoreSurfacePrewarm(
        map,
        payload.gpuShoreSurfaceModes || ["height", "states", "provinces"],
        payload.viewOptions || {},
        cache.shore
      );
    } else if (layer === "line") {
      const lineComposition = String(payload.lineComposition || "all");
      if (lineComposition !== "core") ensureShoreCache(map, binding, payload.caches, cache);
      if (lineComposition !== "shore") {
        ensureStatePathsCache(map, binding, payload.caches, cache);
        ensureProvincePathsCache(map, binding, payload.caches, cache);
      }
      if (lineComposition !== "core" && (payload.viewOptions?.smoothCellBorders === false || !cache.shore?.topology)) {
        ensureCellVisualCache(map, binding, payload.caches, cache, {
          boundaryOnly: payload.cellVisualGeometryMode === "boundary-only"
        });
      }
      const prepared = cache;
      const line = buildLineVertices(
        map,
        payload.visibility || {},
        payload.colorMode || "height",
        prepared.shore,
        prepared.statePaths,
        prepared.provincePaths,
        prepared.cellVisual,
        payload.viewOptions || {},
        new Set((payload.oceanCurrentHighlightIds || []).map(String)),
        {
          currentShoreOnly: payload.lineResidentMode === "current-shore-only",
          composition: lineComposition
        }
      );
      result.layers.line = {
        vertices: line.vertices,
        mapEdgeFadeVertexCount: line.mapEdgeFadeVertexCount,
        shoreVertices: line.shoreVertices,
        gpuResidentSmoothShoreVertices: line.gpuResidentSmoothShoreVertices,
        gpuResidentHardShoreVertices: line.gpuResidentHardShoreVertices,
        shorePathCache: packShoreLinePathCache(line.shoreLinePathVertices, binding, {
          packedVertices: payload.linePathTransferMode === "reuse-shore-vertices" ? line.shoreVertices : null
        }),
        oceanCurrentVertices: line.oceanCurrentVertices,
        oceanCurrents: line.oceanCurrents
      };
    } else if (layer === "picking") {
      result.layers.picking = buildObjectPickingDto(map, binding, payload.pickingComponents);
    } else if (layer === "labels") {
      result.layers.labels = buildLabelLayoutDescriptors(map, {
        labelOptions: payload.labelOptions || {},
        visualTheme: payload.visualTheme || {}
      });
    }
    context.report?.("render-prepare", {layer, completed: index + 1, total: requested.length});
  }

  result.cache = {
    reused: cacheState.reused,
    cellVisual: Boolean(cache.cellVisual),
    shore: Boolean(cache.shore),
    statePaths: Boolean(cache.statePaths),
    provincePaths: Boolean(cache.provincePaths)
  };
  return result;
}

export function collectRenderPreparationTransfers(value) {
  const buffers = [];
  const seenObjects = new Set();
  const seenBuffers = new Set();
  collectTransferables(value, buffers, seenObjects, seenBuffers);
  return buffers;
}

export function assertRenderPreparationBinding(result, expected) {
  const actual = normalizeRenderBinding(result?.binding);
  const target = normalizeRenderBinding(expected);
  if (!sameRenderResourceBinding(actual, target)) {
    throw renderPreparationError("render-result-stale", "渲染准备结果不属于当前地图 revision", {actual, expected: target});
  }
  return result;
}

export function packShoreLinePathCache(pathVertices, binding = {}, options = {}) {
  const canReusePackedVertices = options.packedVertices instanceof Float32Array;
  const entries = [...(pathVertices instanceof Map ? pathVertices : new Map()).entries()]
    .map(([key, vertices]) => [String(key), vertices instanceof Float32Array ? vertices : new Float32Array(vertices || [])]);
  if (!canReusePackedVertices) entries.sort((left, right) => left[0].localeCompare(right[0]));
  const offsets = new Uint32Array(entries.length + 1);
  for (let index = 0; index < entries.length; index++) offsets[index + 1] = offsets[index] + entries[index][1].length;
  const vertices = canReusePackedVertices && options.packedVertices.length === offsets.at(-1)
    ? options.packedVertices
    : new Float32Array(offsets.at(-1));
  if (vertices !== options.packedVertices) {
    for (let index = 0; index < entries.length; index++) vertices.set(entries[index][1], offsets[index]);
  }
  return {
    schemaVersion: RENDER_PREPARATION_SCHEMA_VERSION,
    binding: normalizeRenderBinding(binding),
    keys: entries.map(([key]) => key),
    offsets,
    vertices
  };
}

export function rebindShoreLinePathCache(dto, shoreVisualPaths, expectedBinding = null) {
  if (!dto || Number(dto.schemaVersion) !== RENDER_PREPARATION_SCHEMA_VERSION) {
    throw renderPreparationError("render-shore-path-cache-version", "岸线路径顶点缓存版本无效");
  }
  if (expectedBinding !== null && expectedBinding !== undefined) {
    const actual = normalizeRenderBinding(dto.binding);
    const expected = normalizeRenderBinding(expectedBinding);
    if (!sameRenderResourceBinding(actual, expected)) {
      throw renderPreparationError("render-result-stale", "岸线路径顶点缓存不属于当前地图 revision", {actual, expected});
    }
  }
  if (!Array.isArray(dto.keys) || !(dto.offsets instanceof Uint32Array) || !(dto.vertices instanceof Float32Array)) {
    throw renderPreparationError("render-shore-path-cache-shape", "岸线路径顶点缓存结构无效");
  }
  if (dto.offsets.length !== dto.keys.length + 1 || dto.offsets[0] !== 0 || dto.offsets.at(-1) !== dto.vertices.length) {
    throw renderPreparationError("render-shore-path-cache-offsets", "岸线路径顶点缓存偏移无效");
  }
  const pathVertices = new Map();
  for (let index = 0; index < dto.keys.length; index++) {
    const start = dto.offsets[index];
    const end = dto.offsets[index + 1];
    if (end < start || end > dto.vertices.length || pathVertices.has(dto.keys[index])) {
      throw renderPreparationError("render-shore-path-cache-offsets", "岸线路径顶点缓存含重复键或逆序偏移");
    }
    pathVertices.set(dto.keys[index], dto.vertices.subarray(start, end));
  }
  const pathObjectVertices = new WeakMap();
  for (const [featureType, paths] of [
    ["coastline", shoreVisualPaths?.coastline],
    ["lakeShore", shoreVisualPaths?.lakeShore]
  ]) {
    for (const path of paths || []) {
      const vertices = pathVertices.get(shoreLinePathKey(featureType, path));
      if (vertices) pathObjectVertices.set(path, vertices);
    }
  }
  return {pathVertices, pathObjectVertices};
}

function normalizeRequestedLayers(value) {
  const source = Array.isArray(value) ? value : ["route", "river", "point"];
  const supported = new Set(RENDER_PREPARATION_LAYERS);
  const normalized = source.map(String);
  const unsupported = normalized.filter(layer => !supported.has(layer));
  if (unsupported.length) throw renderPreparationError("render-layer-unsupported", `不支持的渲染准备图层：${[...new Set(unsupported)].join(", ")}`);
  const layers = [...new Set(normalized)];
  if (!layers.length) throw renderPreparationError("render-layer-required", "渲染准备未指定受支持的图层");
  return layers;
}

function ensureRenderCaches(map, binding, input = {}, cache = {}, payload = {}) {
  ensureCellVisualCache(map, binding, input, cache, {
    boundaryOnly: payload.cellVisualGeometryMode === "boundary-only"
  });
  cache.shore ||= input?.shore ? unpackShoreVisualPaths(input.shore, binding) : buildShoreVisualPaths(map);
  cache.statePaths ||= input?.statePaths ? unpackPoliticalVisualPaths(input.statePaths, binding) : buildStateVisualPaths(map);
  cache.provincePaths ||= input?.provincePaths ? unpackPoliticalVisualPaths(input.provincePaths, binding) : buildProvinceVisualPaths(map);
  return cache;
}

function ensureShoreCache(map, binding, input = {}, cache = {}) {
  cache.shore ||= input?.shore ? unpackShoreVisualPaths(input.shore, binding) : buildShoreVisualPaths(map);
  return cache.shore;
}

function ensureStatePathsCache(map, binding, input = {}, cache = {}) {
  cache.statePaths ||= input?.statePaths ? unpackPoliticalVisualPaths(input.statePaths, binding) : buildStateVisualPaths(map);
  return cache.statePaths;
}

function ensureProvincePathsCache(map, binding, input = {}, cache = {}) {
  cache.provincePaths ||= input?.provincePaths ? unpackPoliticalVisualPaths(input.provincePaths, binding) : buildProvinceVisualPaths(map);
  return cache.provincePaths;
}

function compactPreparedSurface(surface) {
  assertCompactSurfaceCoverage(surface);
  const geometry = compactSurfaceBaseGeometry(surface.base, surface.surfaceCellRanges);
  const result = {
    ...surface,
    mode: "gpu-resident-compact",
    geometry,
    sourceFloatLength: surface.base.length
  };
  delete result.base;
  return result;
}

function assertCompactSurfaceCoverage(surface) {
  const base = surface?.base;
  const directGeometry = surface?.geometry;
  const sourceFloatLength = base instanceof Float32Array
    ? base.length
    : Number(surface?.sourceFloatLength);
  if (!(base instanceof Float32Array) && !(directGeometry instanceof Float32Array)) {
    throw renderPreparationError("render-surface-compact-base-invalid", "紧凑 surface 缺少基础几何");
  }
  if (!Number.isSafeInteger(sourceFloatLength) || sourceFloatLength < 0
    || directGeometry instanceof Float32Array && directGeometry.length * 2 !== sourceFloatLength) {
    throw renderPreparationError("render-surface-compact-base-invalid", "紧凑 surface 基础几何长度无效");
  }
  if (!sourceFloatLength) return;
  const ranges = surface.surfaceCellRanges;
  if (surface.surfaceCellRangesMode === "unavailable" || !(ranges instanceof Map) || !ranges.size) {
    throw renderPreparationError("render-surface-compact-ranges-unavailable", "紧凑 surface 缺少可用的 cell ranges", {
      surfaceCellRangesMode: surface.surfaceCellRangesMode,
      surfaceFloatLength: sourceFloatLength,
      rangeCount: ranges instanceof Map ? ranges.size : null
    });
  }
  let coveredUntil = 0;
  for (const [cellId, range] of ranges) {
    const start = Number(range?.start);
    const end = Number(range?.end);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
      || start !== coveredUntil || end < start || end > sourceFloatLength) {
      throw renderPreparationError("render-surface-compact-ranges-incomplete", "紧凑 surface 的 cell ranges 未连续覆盖基础几何", {
        cellId,
        expectedStart: coveredUntil,
        actualStart: start,
        actualEnd: end,
        surfaceFloatLength: sourceFloatLength
      });
    }
    coveredUntil = end;
  }
  if (coveredUntil !== sourceFloatLength) {
    throw renderPreparationError("render-surface-compact-ranges-incomplete", "紧凑 surface 的 cell ranges 未覆盖基础几何末尾", {
      coveredUntil,
      surfaceFloatLength: sourceFloatLength,
      rangeCount: ranges.size
    });
  }
}

function ensureCellVisualCache(map, binding, input = {}, cache = {}, {boundaryOnly = false, requireFull = false} = {}) {
  if (requireFull && cache.cellVisual?.geometryMode === "boundary-only") delete cache.cellVisual;
  if (cache.cellVisual) return cache.cellVisual;
  cache.cellVisual = input?.cellVisual
    ? unpackCellVisualMesh(input.cellVisual, binding)
    : boundaryOnly && !requireFull
      ? buildCellVisualBoundaryMesh(map)
      : buildCellVisualMesh(map);
  if (requireFull && cache.cellVisual?.geometryMode === "boundary-only") cache.cellVisual = buildCellVisualMesh(map);
  return cache.cellVisual;
}

function ensurePoliticalMeshes(map, cache, payload = {}) {
  if (cache.political) return cache.political;
  const debugMode = normalizePoliticalMeshDebugMode(payload.politicalMeshDebugMode);
  const shouldBuild = debugMode !== "none"
    || (payload.viewOptions?.smoothCellBorders !== false && !(cache.cellVisual?.cells?.length));
  cache.political = shouldBuild
    ? {
        states: buildPoliticalVisualMeshCache(map, "state", cache.statePaths, cache.shore, STATE_VISUAL_STYLE),
        provinces: buildPoliticalVisualMeshCache(map, "province", cache.provincePaths, cache.shore, PROVINCE_VISUAL_STYLE)
      }
    : emptyPoliticalVisualMeshes();
  return cache.political;
}

function resolveRenderPreparationCache(candidate, binding) {
  const cache = candidate && typeof candidate === "object" ? candidate : Object.create(null);
  const previous = cache.renderBinding;
  const reused = sameRenderResourceGeneration(previous, binding)
    && Boolean(cache.cellVisual || cache.shore || cache.statePaths || cache.provincePaths);
  if (!reused) {
    for (const key of ["cellVisual", "shore", "statePaths", "provincePaths", "political"]) delete cache[key];
  }
  cache.renderBinding = {...binding};
  delete cache.political;
  return {cache, reused};
}

function normalizeRenderBinding(value = {}) {
  return normalizeRenderResourceBinding(value, "renderPreparation.binding");
}

function cloneRenderEnvelopeBinding(value) {
  return normalizeRenderResourceBinding(value, "renderPreparation.binding");
}

function normalizeCamera(value = {}) {
  return {
    scale: finitePositive(value.scale, 1),
    offsetX: finiteNumber(value.offsetX, 0),
    offsetY: finiteNumber(value.offsetY, 0)
  };
}

function normalizeCanvas(value = {}) {
  const width = finitePositive(value.width ?? value.clientWidth, 1);
  const height = finitePositive(value.height ?? value.clientHeight, 1);
  return {
    width,
    height,
    clientWidth: finitePositive(value.clientWidth, width),
    clientHeight: finitePositive(value.clientHeight, height)
  };
}

function checkpoint(context, layer, completed, total) {
  context.checkpoint?.({phase: "render-prepare", layer, completed, total});
  if (context.signal?.aborted) throw renderPreparationError("render-preparation-aborted", "渲染准备已取消", {layer, completed, total});
}

function collectTransferables(value, buffers, seenObjects, seenBuffers) {
  if (!value || typeof value !== "object" || seenObjects.has(value)) return;
  seenObjects.add(value);
  if (ArrayBuffer.isView(value)) {
    const buffer = value.buffer;
    if (buffer instanceof ArrayBuffer && !seenBuffers.has(buffer)) {
      seenBuffers.add(buffer);
      buffers.push(buffer);
    }
    return;
  }
  if (value instanceof ArrayBuffer) {
    if (!seenBuffers.has(value)) {
      seenBuffers.add(value);
      buffers.push(value);
    }
    return;
  }
  for (const next of Array.isArray(value) ? value : Object.values(value)) {
    collectTransferables(next, buffers, seenObjects, seenBuffers);
  }
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function renderPreparationError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}
