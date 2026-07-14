import {OBJECT_KIND} from "./object-kinds.js";
import {namebaseRenameAffected, objectAffected} from "./edit-command-effects.js";
import {deleteObjectNote} from "./object-notes.js";
import {createChineseNameGenerator} from "../generator/names.js";

const WATER_LEVEL = 20;

const LAKE_NAME_BATCH_EFFECTS = Object.freeze({
  render: "none",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["object-name", "object-panels"])
});

const LAKE_DELETE_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["terrain-caches", "height-field", "cell-colors", "line-layers", "object-index", "object-panels"])
});

const LAKE_DELETE_STALE_SYSTEMS = Object.freeze([
  "features",
  "rivers",
  "routes",
  "biomes",
  "cities",
  "states",
  "provinces",
  "religions",
  "markers",
  "zones",
  "military",
  "economy",
  "diplomacy"
]);

export function createRenameLakesFromNamebaseCommand(lakeIds, {label = "按名称库重命名湖泊"} = {}) {
  const targets = uniqueLakeIds(lakeIds);
  let changes = null;

  return {
    label: `${label} ${targets.length} 个`,
    domain: OBJECT_KIND.LAKE,
    effects: {
      ...LAKE_NAME_BATCH_EFFECTS,
      affected: namebaseRenameAffected(OBJECT_KIND.LAKE, targets)
    },
    apply(context) {
      changes ??= buildLakeRenameChanges(context.map, targets);
      if (!changes.length) throw new Error("没有可重命名的湖泊");
      for (const change of changes) writeLakeName(context.map, change.id, change.afterName);
    },
    revert(context) {
      if (!changes) throw new Error("缺少可撤销的湖泊名称快照");
      for (const change of changes) writeLakeName(context.map, change.id, change.beforeName);
    },
    isNoop(context) {
      return !targets.length || !buildLakeRenameChanges(context.map, targets).length;
    },
    getResult() {
      return {renamed: changes?.length || 0, total: targets.length};
    }
  };
}

export function createDeleteLakeCommand(lakeId, {label = "删除湖泊"} = {}) {
  const normalizedLakeId = Number(lakeId);
  let snapshot = null;
  let result = null;

  return {
    label: `${label} #${normalizedLakeId}`,
    domain: OBJECT_KIND.LAKE,
    effects: {
      ...LAKE_DELETE_EFFECTS,
      affected: objectAffected(OBJECT_KIND.LAKE, normalizedLakeId)
    },
    apply(context) {
      const lake = findLake(context.map, normalizedLakeId);
      if (!lake) throw new Error(`找不到湖泊 #${normalizedLakeId}`);
      snapshot ??= captureLakeDeleteSnapshot(context.map);
      result = fillLake(context.map, lake);
    },
    revert(context) {
      if (!snapshot) throw new Error("缺少可撤销的湖泊删除快照");
      restoreLakeDeleteSnapshot(context.map, snapshot);
    },
    isNoop(context) {
      return !Number.isInteger(normalizedLakeId) || normalizedLakeId <= 0 || !findLake(context.map, normalizedLakeId);
    },
    getResult() {
      return result ? {...result} : null;
    }
  };
}

function fillLake(map, lake) {
  const lakeId = Number(lake.i ?? lake.id);
  const packLakeCells = cellsWithFeature(map.pack?.cells, lakeId);
  if (!packLakeCells.length) throw new Error(`湖泊 #${lakeId} 没有可填平的 pack cells`);
  const packAdjacentIds = adjacentLandFeatureIds(map.pack, packLakeCells, lake.shoreline);
  const packTargetId = chooseCanonicalFeature(map.pack, packAdjacentIds);
  if (!Number.isInteger(packTargetId)) throw new Error(`湖泊 #${lakeId} 缺少可并入的相邻陆地 feature`);

  const gridLakeCell = map.pack.cells.g?.[packLakeCells[0]];
  const gridLakeId = Number(map.grid?.cells?.f?.[gridLakeCell]);
  const gridLakeCells = cellsWithFeature(map.grid?.cells, gridLakeId);
  const gridGraph = {cells: map.grid?.cells, features: map.features?.features};
  const gridAdjacentIds = adjacentLandFeatureIds(gridGraph, gridLakeCells);
  const gridTargetId = chooseCanonicalFeature(gridGraph, gridAdjacentIds);
  if (!gridLakeCells.length || !Number.isInteger(gridTargetId)) throw new Error(`湖泊 #${lakeId} 缺少可恢复的 grid feature`);

  const fillHeight = Math.max(WATER_LEVEL, Math.ceil(Number(lake.height) || minimumNeighborHeight(map.pack.cells, packLakeCells) || WATER_LEVEL));
  const packMergedIds = [...new Set([lakeId, ...packAdjacentIds.filter(id => id !== packTargetId)])];
  const gridMergedIds = [...new Set([gridLakeId, ...gridAdjacentIds.filter(id => id !== gridTargetId)])];
  mergeFeatureCells(map.pack.cells, packMergedIds, packTargetId, fillHeight, new Set([lakeId]));
  mergeFeatureCells(map.grid.cells, gridMergedIds, gridTargetId, fillHeight, new Set([gridLakeId]));
  for (const id of packMergedIds) if (id !== packTargetId) map.pack.features[id] = null;
  for (const id of gridMergedIds) if (id !== gridTargetId) map.features.features[id] = null;
  remapPackFeatureReferences(map, new Map(packMergedIds.filter(id => id !== packTargetId).map(id => [id, packTargetId])));
  if (map.grid.features) map.grid.features = map.features.features;

  refreshPackFeature(map.pack, packTargetId);
  refreshGridFeature(map, gridTargetId);
  refreshWaterLandTopology(map.pack.cells);
  refreshWaterLandTopology(map.grid.cells, {distanceOnly: true});
  refreshGridShore(map);
  refreshFeatureMetadata(map);
  deleteObjectNote(map, {kind: OBJECT_KIND.LAKE, id: lakeId});
  markLakeDependentDerivedStale(map);

  return {
    lakeId,
    fillHeight,
    packCells: packLakeCells.length,
    gridCells: gridLakeCells.length,
    packTargetFeature: packTargetId,
    gridTargetFeature: gridTargetId,
    mergedPackFeatures: packMergedIds.length - 1,
    mergedGridFeatures: gridMergedIds.length - 1
  };
}

function cellsWithFeature(cells, featureId) {
  const result = [];
  if (!cells?.f || !Number.isInteger(featureId)) return result;
  for (let cell = 0; cell < cells.f.length; cell += 1) {
    if (Number(cells.f[cell]) === featureId) result.push(cell);
  }
  return result;
}

function adjacentLandFeatureIds(graph, featureCells, preferredCells = null) {
  const ids = new Set();
  const candidates = Array.isArray(preferredCells) && preferredCells.length
    ? preferredCells
    : featureCells.flatMap(cell => graph.cells?.c?.[cell] || []);
  for (const cell of candidates) {
    if (Number(graph.cells?.h?.[cell]) < WATER_LEVEL) continue;
    const featureId = Number(graph.cells?.f?.[cell]);
    if (!Number.isInteger(featureId) || !graph.features?.[featureId]?.land) continue;
    ids.add(featureId);
  }
  return [...ids];
}

function chooseCanonicalFeature(graph, featureIds) {
  return [...featureIds]
    .sort((a, b) => featureCellCount(graph, b) - featureCellCount(graph, a) || a - b)[0] ?? null;
}

function featureCellCount(graph, featureId) {
  const cells = graph.features?.[featureId]?.cells;
  if (Array.isArray(cells)) return cells.length;
  return Number(cells) || cellsWithFeature(graph.cells, featureId).length;
}

function mergeFeatureCells(cells, sourceFeatureIds, targetFeatureId, fillHeight, lakeFeatureIds) {
  const sources = new Set(sourceFeatureIds);
  for (let cell = 0; cell < (cells?.f?.length || 0); cell += 1) {
    const sourceFeatureId = Number(cells.f[cell]);
    if (!sources.has(sourceFeatureId)) continue;
    if (lakeFeatureIds.has(sourceFeatureId)) cells.h[cell] = fillHeight;
    cells.f[cell] = targetFeatureId;
    if (cells.type) cells.type[cell] = "island";
  }
}

function remapPackFeatureReferences(map, replacements) {
  const remap = object => {
    if (!object || typeof object !== "object") return;
    if (replacements.has(Number(object.feature))) object.feature = replacements.get(Number(object.feature));
    if (object.data && replacements.has(Number(object.data.feature))) object.data.feature = replacements.get(Number(object.data.feature));
  };
  for (const item of map.pack?.burgs || []) remap(item);
  for (const item of map.pack?.routes || []) remap(item);
  for (const item of map.settlements?.cities || []) remap(item);
  for (const item of map.settlements?.routes || []) remap(item);
  for (const item of map.markers?.markers || []) remap(item);
  for (const item of map.pack?.portDiagnostics?.features || []) remap(item);
}

function minimumNeighborHeight(cells, featureCells) {
  let min = Infinity;
  const source = new Set(featureCells);
  for (const cell of featureCells) {
    for (const neighbor of cells.c?.[cell] || []) {
      if (source.has(neighbor) || Number(cells.h?.[neighbor]) < WATER_LEVEL) continue;
      min = Math.min(min, Number(cells.h[neighbor]));
    }
  }
  return Number.isFinite(min) ? min : WATER_LEVEL;
}

function refreshPackFeature(pack, featureId) {
  const feature = pack.features?.[featureId];
  if (!feature) throw new Error(`找不到目标 pack feature #${featureId}`);
  const featureCells = cellsWithFeature(pack.cells, featureId);
  feature.cells = featureCells.length;
  feature.area = round(featureCells.reduce((sum, cell) => sum + (Number(pack.cells.area?.[cell]) || 0), 0));
  feature.vertices = collectBoundaryVertices(pack, featureCells, featureId);
  feature.firstCell = featureCells.find(cell => isFeatureBorderCell(pack.cells, cell, featureId)) ?? featureCells[0] ?? feature.firstCell;
}

function refreshGridFeature(map, featureId) {
  const feature = map.features?.features?.[featureId];
  if (!feature) throw new Error(`找不到目标 grid feature #${featureId}`);
  feature.cells = cellsWithFeature(map.grid.cells, featureId);
}

function collectBoundaryVertices(pack, featureCells, featureId) {
  const result = [];
  const seen = new Set();
  for (const cell of featureCells) {
    for (const vertexId of pack.cells.v?.[cell] || []) {
      const vertexCells = pack.vertices?.c?.[vertexId] || [];
      if (!vertexCells.some(neighbor => neighbor < pack.cells.f.length && Number(pack.cells.f[neighbor]) !== featureId)) continue;
      if (seen.has(vertexId)) continue;
      seen.add(vertexId);
      result.push(vertexId);
    }
  }
  return result;
}

function isFeatureBorderCell(cells, cell, featureId) {
  return Boolean(cells.b?.[cell]) || (cells.c?.[cell] || []).some(neighbor => Number(cells.f?.[neighbor]) !== featureId);
}

function refreshWaterLandTopology(cells, {distanceOnly = false} = {}) {
  if (!cells?.h || !cells?.c) return;
  const distance = createArrayLike(cells.t, cells.h.length, Int8Array);
  const haven = distanceOnly ? null : createArrayLike(cells.haven, cells.h.length, Uint16Array);
  const harbor = distanceOnly ? null : createArrayLike(cells.harbor, cells.h.length, Uint8Array);

  for (let cell = 0; cell < cells.h.length; cell += 1) {
    if (Number(cells.h[cell]) < WATER_LEVEL) continue;
    const waterNeighbors = (cells.c[cell] || []).filter(neighbor => Number(cells.h[neighbor]) < WATER_LEVEL);
    if (!waterNeighbors.length) continue;
    distance[cell] = 1;
    for (const neighbor of waterNeighbors) distance[neighbor] = -1;
    if (!distanceOnly) {
      const closest = nearestCell(cells, cell, waterNeighbors);
      haven[cell] = closest ?? 0;
      harbor[cell] = waterNeighbors.length;
    }
  }

  markupDistance(distance, cells.c, 2, 1, 127);
  markupDistance(distance, cells.c, -2, -1, -10);
  cells.t = distance;
  if (!distanceOnly) {
    cells.haven = haven;
    cells.harbor = harbor;
  }
}

function markupDistance(values, neighbors, start, increment, limit) {
  for (let distance = start; distance !== limit; distance += increment) {
    const previous = distance - increment;
    let marked = 0;
    for (let cell = 0; cell < values.length; cell += 1) {
      if (values[cell] !== previous) continue;
      for (const neighbor of neighbors[cell] || []) {
        if (values[neighbor] !== 0) continue;
        values[neighbor] = distance;
        marked++;
      }
    }
    if (!marked) break;
  }
}

function nearestCell(cells, cell, candidates) {
  const point = cells.p?.[cell];
  if (!point) return candidates[0];
  let closest = candidates[0];
  let best = Infinity;
  for (const candidate of candidates) {
    const target = cells.p?.[candidate];
    if (!target) continue;
    const distance = (target[0] - point[0]) ** 2 + (target[1] - point[1]) ** 2;
    if (distance >= best) continue;
    best = distance;
    closest = candidate;
  }
  return closest;
}

function refreshGridShore(map) {
  const coastline = [];
  const lakeShore = [];
  const cells = map.grid?.cells;
  for (let cell = 0; cell < (cells?.h?.length || 0); cell += 1) {
    for (const neighbor of cells.c?.[cell] || []) {
      if (neighbor <= cell) continue;
      const cellWater = Number(cells.h[cell]) < WATER_LEVEL;
      const neighborWater = Number(cells.h[neighbor]) < WATER_LEVEL;
      if (cellWater === neighborWater) continue;
      const waterCell = cellWater ? cell : neighbor;
      const segment = sharedGridSegment(map.grid, cell, neighbor);
      if (!segment) continue;
      const feature = map.features?.features?.[cells.f?.[waterCell]];
      (feature?.type === "ocean" ? coastline : lakeShore).push(segment);
    }
  }
  map.features.shore = {coastline, lakeShore};
}

function sharedGridSegment(grid, firstCell, secondCell) {
  const secondVertices = grid.cells.v?.[secondCell] || [];
  const shared = (grid.cells.v?.[firstCell] || []).filter(vertex => secondVertices.includes(vertex)).slice(0, 2);
  if (shared.length < 2) return null;
  return [grid.vertices.p[shared[0]], grid.vertices.p[shared[1]]];
}

function refreshFeatureMetadata(map) {
  const gridFeatures = map.features?.features || [];
  map.features.metadata = {
    ...(map.features.metadata || {}),
    featureCount: gridFeatures.filter(Boolean).length,
    oceanFeatures: gridFeatures.filter(feature => feature?.type === "ocean").length,
    landFeatures: gridFeatures.filter(feature => feature?.land).length,
    lakeFeatures: gridFeatures.filter(feature => feature?.type === "lake").length,
    coastlineSegments: map.features.shore?.coastline?.length || 0,
    lakeShoreSegments: map.features.shore?.lakeShore?.length || 0
  };
  const packFeatures = map.pack?.features || [];
  if (map.pack?.metadata) {
    map.pack.metadata.packFeatureCount = packFeatures.filter(Boolean).length;
    map.pack.metadata.featureGroups = countFeatureGroups(packFeatures);
    map.pack.metadata.havenCells = countPositive(map.pack.cells?.haven);
    map.pack.metadata.harborCells = countPositive(map.pack.cells?.harbor);
  }
}

function countPositive(values) {
  let count = 0;
  for (const value of values || []) if (Number(value) > 0) count++;
  return count;
}

function countFeatureGroups(features) {
  const groups = {};
  for (const feature of features) {
    if (!feature) continue;
    const key = feature.group || "none";
    groups[key] = (groups[key] || 0) + 1;
  }
  return groups;
}

function markLakeDependentDerivedStale(map) {
  if (!map?.metadata) return;
  map.metadata.derivedStale = {
    ...(map.metadata.derivedStale || {}),
    systems: [...new Set([...(map.metadata.derivedStale?.systems || []), ...LAKE_DELETE_STALE_SYSTEMS])],
    updatedAt: new Date().toISOString()
  };
  for (const kind of ["markers", "zones", "military", "economy", "diplomacy"]) {
    if (map[kind]?.metadata) map[kind].metadata.stale = true;
  }
}

function captureLakeDeleteSnapshot(map) {
  return {
    packFeatures: clonePlain(map.pack?.features || []),
    packMetadata: clonePlain(map.pack?.metadata || null),
    packCells: captureCellFields(map.pack?.cells, ["h", "f", "t", "haven", "harbor", "type", "r", "fl", "conf"]),
    featureReferences: capturePackFeatureReferences(map),
    gridFeaturesShared: map.grid?.features === map.features?.features,
    gridFeatures: clonePlain(map.features?.features || []),
    featureMetadata: clonePlain(map.features?.metadata || null),
    featureShore: clonePlain(map.features?.shore || null),
    gridCells: captureCellFields(map.grid?.cells, ["h", "f", "t"]),
    notes: clonePlain(map.notes || null),
    stale: captureStaleState(map)
  };
}

function restoreLakeDeleteSnapshot(map, snapshot) {
  map.pack.features = clonePlain(snapshot.packFeatures);
  if (snapshot.packMetadata) map.pack.metadata = clonePlain(snapshot.packMetadata);
  restoreCellFields(map.pack?.cells, snapshot.packCells);
  restorePackFeatureReferences(snapshot.featureReferences);
  map.features.features = clonePlain(snapshot.gridFeatures);
  map.grid.features = snapshot.gridFeaturesShared ? map.features.features : clonePlain(snapshot.gridFeatures);
  if (snapshot.featureMetadata) map.features.metadata = clonePlain(snapshot.featureMetadata);
  if (snapshot.featureShore) map.features.shore = clonePlain(snapshot.featureShore);
  restoreCellFields(map.grid?.cells, snapshot.gridCells);
  if (snapshot.notes) map.notes = clonePlain(snapshot.notes);
  else delete map.notes;
  restoreStaleState(map, snapshot.stale);
}

function capturePackFeatureReferences(map) {
  const entries = [];
  const capture = object => {
    if (!object || typeof object !== "object") return;
    if (Object.prototype.hasOwnProperty.call(object, "feature")) entries.push({object, target: object, key: "feature", value: object.feature});
    if (object.data && Object.prototype.hasOwnProperty.call(object.data, "feature")) entries.push({object, target: object.data, key: "feature", value: object.data.feature});
  };
  for (const item of map.pack?.burgs || []) capture(item);
  for (const item of map.pack?.routes || []) capture(item);
  for (const item of map.settlements?.cities || []) capture(item);
  for (const item of map.settlements?.routes || []) capture(item);
  for (const item of map.markers?.markers || []) capture(item);
  for (const item of map.pack?.portDiagnostics?.features || []) capture(item);
  return entries;
}

function restorePackFeatureReferences(entries) {
  for (const entry of entries || []) entry.target[entry.key] = entry.value;
}

function captureCellFields(cells, fields) {
  return Object.fromEntries(fields.map(field => [field, cloneArrayLike(cells?.[field])]));
}

function restoreCellFields(cells, snapshot) {
  if (!cells) return;
  for (const [field, value] of Object.entries(snapshot || {})) {
    if (value !== null) cells[field] = cloneArrayLike(value);
  }
}

function captureStaleState(map) {
  return {
    metadata: clonePlain(map.metadata?.derivedStale || null),
    flags: Object.fromEntries(["markers", "zones", "military", "economy", "diplomacy"].map(kind => [kind, {
      present: Object.prototype.hasOwnProperty.call(map[kind]?.metadata || {}, "stale"),
      value: map[kind]?.metadata?.stale
    }]))
  };
}

function restoreStaleState(map, snapshot) {
  if (snapshot.metadata) map.metadata.derivedStale = clonePlain(snapshot.metadata);
  else delete map.metadata.derivedStale;
  for (const [kind, entry] of Object.entries(snapshot.flags || {})) {
    if (!map[kind]?.metadata) continue;
    if (entry.present) map[kind].metadata.stale = entry.value;
    else delete map[kind].metadata.stale;
  }
}

function createArrayLike(source, length, Fallback) {
  if (Array.isArray(source)) return new Array(length).fill(0);
  const Constructor = source?.constructor || Fallback;
  return new Constructor(length);
}

function cloneArrayLike(value) {
  if (value === undefined || value === null) return null;
  return value.slice ? value.slice() : [...value];
}

function clonePlain(value) {
  if (value === undefined) return undefined;
  return value === null ? null : JSON.parse(JSON.stringify(value));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function buildLakeRenameChanges(map, lakeIds) {
  const lakes = map?.pack?.features || [];
  if (!lakes.length) return [];
  const generator = createChineseNameGenerator(`${map.metadata?.seed || map.options?.seed || "map"}|explicit-lake-rename|${map.metadata?.checksum || ""}`, {namebases: map.namebases});
  const changes = [];
  for (const id of lakeIds) {
    const lake = findLake(map, id);
    if (!lake) continue;
    const afterName = generator.makeLakeName(lakeNameOptions(map, lake));
    const beforeName = lake.name || "";
    if (!afterName || afterName === beforeName) continue;
    changes.push({id, beforeName, afterName});
  }
  return changes;
}

function lakeNameOptions(map, lake) {
  const firstCell = Number.isInteger(lake.firstCell) ? lake.firstCell : 0;
  const cultureId = Number.isInteger(firstCell) ? map?.pack?.cells?.culture?.[firstCell] || 0 : 0;
  const culture = map?.pack?.cultures?.[cultureId] || map?.society?.cultures?.[cultureId];
  return {
    id: lake.i ?? lake.id,
    cell: firstCell,
    culture: cultureId,
    cultureType: culture?.nameStyle || culture?.type,
    type: lake.group || "lake",
    major: (Number(lake.cells) || 0) >= 10
  };
}

function findLake(map, lakeId) {
  const id = Number(lakeId);
  return (map?.pack?.features || []).find(feature => feature?.type === "lake" && Number(feature.i ?? feature.id) === id) || null;
}

function writeLakeName(map, lakeId, name) {
  const lake = findLake(map, lakeId);
  if (!lake) throw new Error(`找不到湖泊 #${lakeId}`);
  lake.name = name;
}

function uniqueLakeIds(lakeIds) {
  return [...new Set((lakeIds || []).map(id => Number(id)).filter(id => Number.isInteger(id) && id >= 0))];
}
