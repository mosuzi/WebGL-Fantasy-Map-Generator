import {OBJECT_KIND} from "./object-kinds.js";
import {namebaseRenameAffected, objectAffected} from "./edit-command-effects.js";
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

const LAKE_CREATE_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["terrain-caches", "height-field", "cell-colors", "line-layers", "object-index", "object-panels"])
});

const LAKE_OUTLET_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["line-layers", "object-index", "object-panels", "hydrology-stale"])
});

const FEATURE_PATCH_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["terrain-caches", "height-field", "cell-colors", "line-layers", "object-index", "object-panels", "hydrology-stale"])
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

export function inspectLakeCreation(map, options = {}) {
  const packCell = Number(options.packCell);
  const radius = Math.max(0, Math.min(4, Math.floor(Number(options.radius) || 0)));
  const cells = map?.pack?.cells;
  const count = cells?.i?.length || cells?.h?.length || 0;
  if (!Number.isInteger(packCell) || packCell < 0 || packCell >= count) return invalidLakeCreation("invalid-cell", "湖泊中心必须是有效 pack cell");
  if (Number(cells.h?.[packCell]) < WATER_LEVEL) return invalidLakeCreation("center-water", "湖泊中心必须位于陆地");
  const seedPackCells = expandPackRegion(cells, packCell, radius);
  const gridCells = [...new Set(seedPackCells.map(cell => Number(cells.g?.[cell])).filter(Number.isInteger))];
  const selectedGrid = new Set(gridCells);
  if (!gridCells.length || gridCells.length > 256) return invalidLakeCreation("region-size", "湖泊区域必须包含 1～256 个 grid cells");
  if (gridCells.some(cell => Number(map.grid?.cells?.h?.[cell]) < WATER_LEVEL)) return invalidLakeCreation("region-water", "湖泊区域不能包含现有水域");
  if (gridCells.some(cell => map.grid?.cells?.b?.[cell])) return invalidLakeCreation("border-region", "湖泊区域不能接触地图边界");
  const externalGrid = [...new Set(gridCells.flatMap(cell => map.grid?.cells?.c?.[cell] || []).filter(cell => !selectedGrid.has(cell)))];
  if (!externalGrid.length || externalGrid.some(cell => Number(map.grid?.cells?.h?.[cell]) < WATER_LEVEL)) {
    return invalidLakeCreation("open-basin", "湖泊区域必须被陆地完整包围，不能连通现有水域");
  }
  const packCells = [];
  for (let cell = 0; cell < count; cell += 1) if (selectedGrid.has(Number(cells.g?.[cell]))) packCells.push(cell);
  const selectedPack = new Set(packCells);
  if (packCells.some(cell => Number(cells.h?.[cell]) < WATER_LEVEL)) return invalidLakeCreation("pack-region-water", "湖泊区域对应的 pack cells 包含现有水域");
  if (packCells.some(cell => Number(cells.burg?.[cell]) > 0)) return invalidLakeCreation("occupied-burg", "湖泊区域包含城市或城镇");
  if (packCells.some(cell => Number(cells.r?.[cell]) > 0)) return invalidLakeCreation("occupied-river", "湖泊区域包含既有河道");
  if ((map.settlements?.routes || []).some(route => (route.packCells || []).some(cell => selectedPack.has(Number(cell))))) return invalidLakeCreation("occupied-route", "湖泊区域包含既有路线");
  if ((map.markers?.markers || []).some(marker => selectedPack.has(Number(marker?.packCell)))) return invalidLakeCreation("occupied-marker", "湖泊区域包含标记");
  const shoreline = [...new Set(packCells.flatMap(cell => cells.c?.[cell] || []).filter(cell => !selectedPack.has(cell) && Number(cells.h?.[cell]) >= WATER_LEVEL))];
  if (shoreline.length < 3) return invalidLakeCreation("invalid-shoreline", "湖泊区域无法形成有效岸线");
  const requestedWaterHeight = Number(options.waterHeight);
  const waterHeight = Math.max(0, Math.min(19, Number.isFinite(requestedWaterHeight) ? requestedWaterHeight : 19));
  return {valid: true, code: "ok", reason: "", packCell, radius, packCells, gridCells, shoreline, waterHeight};
}

export function createExcavateLakeCommand(options = {}) {
  let snapshot = null;
  let created = null;
  const command = {
    label: String(options.label || "开挖湖泊"),
    domain: OBJECT_KIND.LAKE,
    effects: {...LAKE_CREATE_EFFECTS, affected: objectAffected(OBJECT_KIND.LAKE, "new")},
    apply(context) {
      const preview = inspectLakeCreation(context.map, options);
      if (!preview.valid) throw lakeCreationError(preview);
      snapshot ??= captureLakeDeleteSnapshot(context.map);
      created = excavateLake(context.map, preview);
      command.effects.affected = objectAffected(OBJECT_KIND.LAKE, created.lakeId);
    },
    revert(context) {
      if (!snapshot) throw new Error("缺少可撤销的湖泊开挖快照");
      restoreLakeDeleteSnapshot(context.map, snapshot);
    },
    isNoop(context) {
      const preview = inspectLakeCreation(context.map, options);
      if (!preview.valid) throw lakeCreationError(preview);
      return false;
    },
    getResult() {
      return created ? {...created} : null;
    }
  };
  return command;
}

export function inspectLakeOutletChange(map, lakeId, outletRiverId) {
  const lake = findLake(map, Number(lakeId));
  if (!lake) return invalidLakeOutlet("missing-lake", `找不到湖泊 #${lakeId}`);
  const outlet = Number(outletRiverId ?? 0);
  if (!Number.isInteger(outlet) || outlet < 0) return invalidLakeOutlet("invalid-river", "湖泊出口必须是有效河流 ID 或 0");
  const current = Number(lake.outlet) || 0;
  if (!outlet) return {valid: true, code: "ok", reason: "", lakeId: Number(lake.i ?? lake.id), outletRiverId: 0, currentOutletRiverId: current, changed: current !== 0, affectedInlets: (lake.inlets || []).length};
  const river = findRiver(map, outlet);
  if (!river) return invalidLakeOutlet("missing-river", `找不到河流 #${outlet}`);
  const lakeCells = new Set(cellsWithFeature(map.pack?.cells, Number(lake.i ?? lake.id)));
  if (!riverExitsLake(map.pack?.cells, river.cells || [], lakeCells)) return invalidLakeOutlet("invalid-outlet-path", `河流 #${outlet} 没有从该湖泊流向相邻陆地`);
  return {
    valid: true,
    code: "ok",
    reason: "",
    lakeId: Number(lake.i ?? lake.id),
    outletRiverId: outlet,
    currentOutletRiverId: current,
    changed: current !== outlet,
    affectedInlets: (lake.inlets || []).length
  };
}

export function createSetLakeOutletCommand(lakeId, outletRiverId, {label = "编辑湖泊出口"} = {}) {
  const normalizedLakeId = Number(lakeId);
  const normalizedOutlet = Number(outletRiverId ?? 0);
  let before = null;
  let after = null;
  return {
    label: `${label} #${normalizedLakeId}`,
    domain: OBJECT_KIND.LAKE,
    effects: {...LAKE_OUTLET_EFFECTS, affected: objectAffected(OBJECT_KIND.LAKE, normalizedLakeId)},
    apply(context) {
      const preview = inspectLakeOutletChange(context.map, normalizedLakeId, normalizedOutlet);
      if (!preview.valid) throw lakeOutletError(preview);
      if (after) {
        restoreLakeOutletSnapshot(context.map, after);
        return;
      }
      before = captureLakeOutletSnapshot(context.map);
      applyLakeOutletChange(context.map, preview);
      after = captureLakeOutletSnapshot(context.map);
    },
    revert(context) {
      if (!before) throw new Error("缺少可撤销的湖泊出口快照");
      restoreLakeOutletSnapshot(context.map, before);
    },
    isNoop(context) {
      const preview = inspectLakeOutletChange(context.map, normalizedLakeId, normalizedOutlet);
      if (!preview.valid) throw lakeOutletError(preview);
      return !preview.changed;
    },
    getResult() {
      return {lakeId: normalizedLakeId, outletRiverId: normalizedOutlet};
    }
  };
}

export function inspectFeaturePatch(map, options = {}) {
  const lakeId = Number(options.lakeId ?? options.featureId);
  const lake = findLake(map, lakeId);
  if (!lake) return invalidFeaturePatch("missing-lake", `找不到湖泊 #${options.lakeId ?? options.featureId}`);
  const centerPackCell = Number(options.centerPackCell ?? options.packCell);
  const cellCount = map?.pack?.cells?.i?.length || map?.pack?.cells?.h?.length || 0;
  if (!Number.isInteger(centerPackCell) || centerPackCell < 0 || centerPackCell >= cellCount) return invalidFeaturePatch("invalid-cell", "局部修正中心必须是有效 pack cell");
  const target = String(options.target || "").trim().toLowerCase();
  if (!new Set(["water", "land"]).has(target)) return invalidFeaturePatch("invalid-target", "局部修正目标必须是 water 或 land");
  const rawRadius = Number(options.radius ?? 0);
  if (!Number.isInteger(rawRadius) || rawRadius < 0 || rawRadius > 2) return invalidFeaturePatch("invalid-radius", "局部修正半径必须是 0～2 的整数");
  const packCells = expandPatchRegion(map.pack.cells, centerPackCell, rawRadius, cell => target === "water" ? Number(map.pack.cells.h?.[cell]) >= WATER_LEVEL : Number(map.pack.cells.f?.[cell]) === lakeId);
  if (!packCells.length) return invalidFeaturePatch("empty-region", "局部修正没有可处理的 cells");
  const gridCells = [...new Set(packCells.map(cell => Number(map.pack.cells.g?.[cell])).filter(Number.isInteger))];
  if (!gridCells.length || gridCells.length > 64 || packCells.length > 192) return invalidFeaturePatch("region-size", "局部修正最多允许 64 个 grid cells / 192 个 pack cells");
  const selectedGrid = new Set(gridCells);
  const normalizedPackCells = [...map.pack.cells.i].filter(cell => selectedGrid.has(Number(map.pack.cells.g?.[cell])));
  const selectedPack = new Set(normalizedPackCells);
  const conflict = inspectFeaturePatchConflicts(map, selectedPack);
  if (conflict) return invalidFeaturePatch(conflict.code, conflict.reason);
  const lakePackCells = cellsWithFeature(map.pack.cells, lakeId);
  const lakeGridCell = map.pack.cells.g?.[lakePackCells[0]];
  const gridLakeId = Number(map.grid?.cells?.f?.[lakeGridCell]);
  if (!lakePackCells.length || !Number.isInteger(gridLakeId) || map.features?.features?.[gridLakeId]?.type !== "lake") return invalidFeaturePatch("missing-grid-lake", "湖泊缺少对应的 grid feature");

  if (target === "water") {
    if (normalizedPackCells.some(cell => Number(map.pack.cells.h?.[cell]) < WATER_LEVEL) || gridCells.some(cell => Number(map.grid.cells.h?.[cell]) < WATER_LEVEL)) return invalidFeaturePatch("target-already-water", "扩展水域只能选择陆地 cells");
    if (normalizedPackCells.some(cell => map.pack.cells.b?.[cell]) || gridCells.some(cell => map.grid.cells.b?.[cell])) return invalidFeaturePatch("border-region", "局部水域修正不能接触地图边界");
    if (!touchesFeature(map.pack.cells, normalizedPackCells, lakeId) || !touchesFeature(map.grid.cells, gridCells, gridLakeId)) return invalidFeaturePatch("not-adjacent-lake", "扩展水域必须与目标湖泊直接相邻");
    const externalWater = normalizedPackCells.flatMap(cell => map.pack.cells.c?.[cell] || []).filter(cell => !selectedPack.has(cell) && Number(map.pack.cells.h?.[cell]) < WATER_LEVEL);
    if (externalWater.some(cell => Number(map.pack.cells.f?.[cell]) !== lakeId)) return invalidFeaturePatch("open-water-conflict", "局部修正不能把湖泊连通到其它湖泊或开放海域");
    if (wouldEmptyFeatures(map.pack.cells, normalizedPackCells) || wouldEmptyFeatures(map.grid.cells, gridCells)) return invalidFeaturePatch("empty-land-feature", "局部修正不能移除整个陆地 feature");
    return featurePatchPreview({lakeId, gridLakeId, centerPackCell, radius: rawRadius, target, packCells: normalizedPackCells, gridCells, packTargetFeature: lakeId, gridTargetFeature: gridLakeId, fillHeight: Math.min(19, Number(lake.height) || 19)});
  }

  if (normalizedPackCells.some(cell => Number(map.pack.cells.f?.[cell]) !== lakeId) || gridCells.some(cell => Number(map.grid.cells.f?.[cell]) !== gridLakeId)) return invalidFeaturePatch("target-not-lake", "收回陆地只能选择目标湖泊 cells");
  const remainingPack = lakePackCells.filter(cell => !selectedPack.has(cell));
  const remainingGrid = cellsWithFeature(map.grid.cells, gridLakeId).filter(cell => !selectedGrid.has(cell));
  if (!remainingPack.length || !remainingGrid.length) return invalidFeaturePatch("remove-whole-lake", "局部修正不能移除整个湖泊");
  if (!isConnectedSubset(map.pack.cells.c, remainingPack) || !isConnectedSubset(map.grid.cells.c, remainingGrid)) return invalidFeaturePatch("split-lake", "局部修正不能把湖泊分裂为多个水体");
  const packTargets = adjacentLandFeatureIds(map.pack, normalizedPackCells);
  const gridTargets = adjacentLandFeatureIds({cells: map.grid.cells, features: map.features.features}, gridCells);
  if (packTargets.length !== 1 || gridTargets.length !== 1) return invalidFeaturePatch("ambiguous-land-feature", "收回陆地必须只连接一个现有陆地 feature");
  const fillHeight = Math.max(WATER_LEVEL, minimumNeighborHeight(map.pack.cells, normalizedPackCells));
  return featurePatchPreview({lakeId, gridLakeId, centerPackCell, radius: rawRadius, target, packCells: normalizedPackCells, gridCells, packTargetFeature: packTargets[0], gridTargetFeature: gridTargets[0], fillHeight});
}

export function createApplyFeaturePatchCommand(options = {}, {label = "局部水陆修正"} = {}) {
  let before = null;
  let after = null;
  let result = null;
  const featureId = Number(options.lakeId ?? options.featureId);
  return {
    label: `${label} #${featureId}`,
    domain: OBJECT_KIND.LAKE,
    effects: {...FEATURE_PATCH_EFFECTS, affected: objectAffected(OBJECT_KIND.LAKE, featureId)},
    apply(context) {
      if (after) {
        restoreLakeDeleteSnapshot(context.map, after);
        return;
      }
      const preview = inspectFeaturePatch(context.map, options);
      if (!preview.valid) throw featurePatchError(preview);
      before = captureLakeDeleteSnapshot(context.map);
      result = applyFeaturePatch(context.map, preview);
      after = captureLakeDeleteSnapshot(context.map);
    },
    revert(context) {
      if (!before) throw new Error("缺少可撤销的局部水陆修正快照");
      restoreLakeDeleteSnapshot(context.map, before);
    },
    isNoop(context) {
      const preview = inspectFeaturePatch(context.map, options);
      if (!preview.valid) throw featurePatchError(preview);
      return false;
    },
    getResult() {
      return result ? {...result} : null;
    }
  };
}

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
  for (const id of packMergedIds) if (id !== packTargetId) retireFeature(map.pack.features, id, packTargetId);
  for (const id of gridMergedIds) if (id !== gridTargetId) retireFeature(map.features.features, id, gridTargetId, {grid: true});
  remapPackFeatureReferences(map, new Map(packMergedIds.filter(id => id !== packTargetId).map(id => [id, packTargetId])));
  if (map.grid.features) map.grid.features = map.features.features;

  refreshPackFeature(map.pack, packTargetId);
  refreshGridFeature(map, gridTargetId);
  refreshWaterLandTopology(map.pack.cells);
  refreshWaterLandTopology(map.grid.cells, {distanceOnly: true});
  refreshGridShore(map);
  refreshFeatureMetadata(map);
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

function excavateLake(map, preview) {
  const packFeatureId = map.pack.features.length;
  const gridFeatureId = map.features.features.length;
  const oldPackFeatures = new Set(preview.packCells.map(cell => Number(map.pack.cells.f?.[cell])).filter(Number.isInteger));
  const oldGridFeatures = new Set(preview.gridCells.map(cell => Number(map.grid.cells.f?.[cell])).filter(Number.isInteger));
  for (const cell of preview.packCells) {
    map.pack.cells.h[cell] = preview.waterHeight;
    map.pack.cells.f[cell] = packFeatureId;
    if (map.pack.cells.type) map.pack.cells.type[cell] = "lake";
  }
  for (const cell of preview.gridCells) {
    map.grid.cells.h[cell] = preview.waterHeight;
    map.grid.cells.f[cell] = gridFeatureId;
  }
  map.pack.features[packFeatureId] = {
    id: packFeatureId,
    i: packFeatureId,
    land: false,
    border: false,
    type: "lake",
    group: "freshwater",
    cells: preview.packCells.length,
    firstCell: preview.packCells[0],
    shoreline: [...preview.shoreline],
    height: preview.waterHeight,
    flux: 0,
    evaporation: 0
  };
  map.features.features[gridFeatureId] = {
    id: gridFeatureId,
    i: gridFeatureId,
    land: false,
    border: false,
    type: "lake",
    cells: [...preview.gridCells]
  };
  map.grid.features = map.features.features;
  for (const id of oldPackFeatures) if (map.pack.features[id]) refreshPackFeature(map.pack, id);
  for (const id of oldGridFeatures) if (map.features.features[id]) refreshGridFeature(map, id);
  refreshPackFeature(map.pack, packFeatureId);
  refreshGridFeature(map, gridFeatureId);
  refreshWaterLandTopology(map.pack.cells);
  refreshWaterLandTopology(map.grid.cells, {distanceOnly: true});
  refreshGridShore(map);
  refreshFeatureMetadata(map);
  const lake = map.pack.features[packFeatureId];
  const generator = createChineseNameGenerator(`${map.metadata?.seed || map.options?.seed || "map"}|manual-lake|${packFeatureId}`, {namebases: map.namebases});
  lake.name = generator.makeLakeName(lakeNameOptions(map, lake));
  markLakeDependentDerivedStale(map);
  return {
    lakeId: packFeatureId,
    gridFeatureId,
    packCells: preview.packCells.length,
    gridCells: preview.gridCells.length,
    shoreline: preview.shoreline.length,
    waterHeight: preview.waterHeight,
    name: lake.name
  };
}

function expandPackRegion(cells, center, radius) {
  const visited = new Set([center]);
  let frontier = [center];
  for (let distance = 0; distance < radius; distance += 1) {
    const next = [];
    for (const cell of frontier) {
      for (const neighbor of cells.c?.[cell] || []) {
        if (visited.has(neighbor) || Number(cells.h?.[neighbor]) < WATER_LEVEL) continue;
        visited.add(neighbor);
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  return [...visited];
}

function expandPatchRegion(cells, center, radius, accepts) {
  if (!accepts(center)) return [];
  const visited = new Set([center]);
  let frontier = [center];
  for (let distance = 0; distance < radius; distance++) {
    const next = [];
    for (const cell of frontier) {
      for (const neighbor of cells.c?.[cell] || []) {
        if (visited.has(neighbor) || !accepts(neighbor)) continue;
        visited.add(neighbor);
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  return [...visited];
}

function inspectFeaturePatchConflicts(map, selectedPack) {
  const cells = map.pack?.cells;
  if ([...selectedPack].some(cell => Number(cells?.burg?.[cell]) > 0)) return {code: "occupied-burg", reason: "局部修正区域包含城市或城镇"};
  if ([...selectedPack].some(cell => Number(cells?.r?.[cell]) > 0)) return {code: "occupied-river", reason: "局部修正区域包含河道或湖泊进出口"};
  if ((map.settlements?.routes || []).some(route => (route.packCells || []).some(cell => selectedPack.has(Number(cell))))) return {code: "occupied-route", reason: "局部修正区域包含路线"};
  if ((map.markers?.markers || []).some(marker => selectedPack.has(Number(marker?.packCell)))) return {code: "occupied-marker", reason: "局部修正区域包含标记"};
  return null;
}

function touchesFeature(cells, sourceCells, featureId) {
  const source = new Set(sourceCells);
  return sourceCells.some(cell => (cells.c?.[cell] || []).some(neighbor => !source.has(neighbor) && Number(cells.f?.[neighbor]) === featureId));
}

function wouldEmptyFeatures(cells, removedCells) {
  const removed = new Set(removedCells);
  const affected = new Set(removedCells.map(cell => Number(cells.f?.[cell])).filter(id => Number.isInteger(id) && id > 0));
  for (const featureId of affected) {
    let remaining = 0;
    for (let cell = 0; cell < (cells.f?.length || 0); cell++) {
      if (!removed.has(cell) && Number(cells.f[cell]) === featureId) remaining++;
    }
    if (!remaining) return true;
  }
  return false;
}

function isConnectedSubset(neighbors, cells) {
  if (!cells.length) return false;
  const allowed = new Set(cells);
  const visited = new Set([cells[0]]);
  const queue = [cells[0]];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    for (const neighbor of neighbors?.[queue[cursor]] || []) {
      if (!allowed.has(neighbor) || visited.has(neighbor)) continue;
      visited.add(neighbor);
      queue.push(neighbor);
    }
  }
  return visited.size === allowed.size;
}

function featurePatchPreview(values) {
  return {valid: true, code: "ok", reason: "", changed: true, ...values};
}

function applyFeaturePatch(map, preview) {
  const packSourceFeatures = new Set(preview.packCells.map(cell => Number(map.pack.cells.f?.[cell])).filter(Number.isInteger));
  const gridSourceFeatures = new Set(preview.gridCells.map(cell => Number(map.grid.cells.f?.[cell])).filter(Number.isInteger));
  for (const cell of preview.packCells) {
    map.pack.cells.h[cell] = preview.fillHeight;
    map.pack.cells.f[cell] = preview.packTargetFeature;
    if (map.pack.cells.type) map.pack.cells.type[cell] = preview.target === "water" ? "lake" : map.pack.features?.[preview.packTargetFeature]?.type || "island";
  }
  for (const cell of preview.gridCells) {
    map.grid.cells.h[cell] = preview.fillHeight;
    map.grid.cells.f[cell] = preview.gridTargetFeature;
  }
  for (const id of new Set([...packSourceFeatures, preview.packTargetFeature, preview.lakeId])) if (map.pack.features?.[id]) refreshPackFeature(map.pack, id);
  for (const id of new Set([...gridSourceFeatures, preview.gridTargetFeature, preview.gridLakeId])) if (map.features.features?.[id]) refreshGridFeature(map, id);
  refreshWaterLandTopology(map.pack.cells);
  refreshWaterLandTopology(map.grid.cells, {distanceOnly: true});
  refreshGridShore(map);
  refreshFeatureMetadata(map);
  markLakeDependentDerivedStale(map);
  return {
    lakeId: preview.lakeId,
    target: preview.target,
    packCells: preview.packCells.length,
    gridCells: preview.gridCells.length,
    packTargetFeature: preview.packTargetFeature,
    gridTargetFeature: preview.gridTargetFeature,
    fillHeight: preview.fillHeight
  };
}

function invalidFeaturePatch(code, reason) {
  return {valid: false, code, reason, changed: false, packCells: [], gridCells: []};
}

function featurePatchError(preview) {
  const error = new Error(preview.reason);
  error.code = preview.code;
  return error;
}

function invalidLakeOutlet(code, reason) {
  return {valid: false, code, reason, changed: false};
}

function lakeOutletError(preview) {
  const error = new Error(preview.reason);
  error.code = preview.code;
  return error;
}

function findRiver(map, riverId) {
  return readRivers(map).find(river => Number(river?.i ?? river?.id) === riverId) || null;
}

function readRivers(map) {
  return map?.rivers?.rivers || map?.pack?.rivers || [];
}

function riverExitsLake(cells, riverCells, lakeCells) {
  for (let index = 0; index < riverCells.length - 1; index++) {
    const current = Number(riverCells[index]);
    const next = Number(riverCells[index + 1]);
    if (lakeCells.has(current) && Number(cells?.h?.[next]) >= WATER_LEVEL) return true;
  }
  return false;
}

function applyLakeOutletChange(map, preview) {
  const lake = findLake(map, preview.lakeId);
  if (preview.outletRiverId) lake.outlet = preview.outletRiverId;
  else delete lake.outlet;
  const inletIds = new Set((lake.inlets || []).map(Number));
  const outletRiver = preview.outletRiverId ? findRiver(map, preview.outletRiverId) : null;
  for (const rivers of uniqueRiverCollections(map)) {
    for (const river of rivers) {
      const id = Number(river?.i ?? river?.id);
      if (!inletIds.has(id)) continue;
      if (!preview.outletRiverId || id === preview.outletRiverId) {
        river.parent = 0;
        river.basin = id;
        river.type = "River";
      } else {
        river.parent = preview.outletRiverId;
        river.basin = Number(outletRiver?.basin) || preview.outletRiverId;
        river.type = "Branch";
      }
    }
  }
  markLakeDependentDerivedStale(map);
}

function uniqueRiverCollections(map) {
  const collections = [map?.rivers?.rivers, map?.pack?.rivers].filter(Array.isArray);
  return collections.filter((collection, index) => collections.indexOf(collection) === index);
}

function captureLakeOutletSnapshot(map) {
  return {
    packFeatures: clonePlain(map.pack?.features || []),
    riversShared: map.rivers?.rivers === map.pack?.rivers,
    rivers: clonePlain(map.rivers?.rivers || []),
    packRivers: clonePlain(map.pack?.rivers || []),
    stale: captureStaleState(map)
  };
}

function restoreLakeOutletSnapshot(map, snapshot) {
  map.pack.features = clonePlain(snapshot.packFeatures);
  if (map.rivers) map.rivers.rivers = clonePlain(snapshot.rivers);
  if (map.pack) map.pack.rivers = snapshot.riversShared && map.rivers ? map.rivers.rivers : clonePlain(snapshot.packRivers);
  restoreStaleState(map, snapshot.stale);
}

function invalidLakeCreation(code, reason) {
  return {valid: false, code, reason, packCells: [], gridCells: [], shoreline: []};
}

function lakeCreationError(preview) {
  const error = new Error(preview.reason);
  error.code = preview.code;
  return error;
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

function retireFeature(features, featureId, redirectTo, {grid = false} = {}) {
  const feature = features?.[featureId];
  if (!feature) return;
  features[featureId] = {
    ...clonePlain(feature),
    id: featureId,
    i: featureId,
    removed: true,
    tombstone: true,
    redirectTo,
    cells: grid ? [] : 0
  };
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
  if (feature.type === "lake") {
    const source = new Set(featureCells);
    feature.shoreline = [...new Set(featureCells.flatMap(cell => pack.cells.c?.[cell] || []).filter(cell => !source.has(cell) && Number(pack.cells.h?.[cell]) >= WATER_LEVEL))];
  }
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
  const activeGridFeatures = gridFeatures.filter(feature => feature && !feature.removed);
  map.features.metadata = {
    ...(map.features.metadata || {}),
    featureCount: activeGridFeatures.length,
    oceanFeatures: activeGridFeatures.filter(feature => feature.type === "ocean").length,
    landFeatures: activeGridFeatures.filter(feature => feature.land).length,
    lakeFeatures: activeGridFeatures.filter(feature => feature.type === "lake").length,
    coastlineSegments: map.features.shore?.coastline?.length || 0,
    lakeShoreSegments: map.features.shore?.lakeShore?.length || 0
  };
  const packFeatures = map.pack?.features || [];
  const activePackFeatures = packFeatures.filter(feature => feature && !feature.removed);
  if (map.pack?.metadata) {
    map.pack.metadata.packFeatureCount = activePackFeatures.length;
    map.pack.metadata.featureGroups = countFeatureGroups(activePackFeatures);
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
  return (map?.pack?.features || []).find(feature => feature?.type === "lake" && !feature.removed && Number(feature.i ?? feature.id) === id) || null;
}

function writeLakeName(map, lakeId, name) {
  const lake = findLake(map, lakeId);
  if (!lake) throw new Error(`找不到湖泊 #${lakeId}`);
  lake.name = name;
}

function uniqueLakeIds(lakeIds) {
  return [...new Set((lakeIds || []).map(id => Number(id)).filter(id => Number.isInteger(id) && id >= 0))];
}
