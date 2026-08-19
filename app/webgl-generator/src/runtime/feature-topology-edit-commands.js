import {refreshPackFeatures} from "../generator/pack.js";
import {inspectRelocatedSettlementPort} from "../generator/settlements.js";
import {systemAffected} from "./edit-command-effects.js";

const WATER_LEVEL = 20;
const WATER_HEIGHT = 19;
const LAND_HEIGHT = 20;
const STALE_SYSTEMS = Object.freeze([
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

export const FEATURE_TOPOLOGY_MODE = Object.freeze({
  CARVE_COAST: "carve-coast",
  RECLAIM_COAST: "reclaim-coast",
  OPEN_STRAIT: "open-strait",
  CLOSE_STRAIT: "close-strait",
  OPEN_LAKE_TO_SEA: "open-lake-to-sea"
});

const MODES = new Set(Object.values(FEATURE_TOPOLOGY_MODE));

export function inspectFeatureTopology(map, options = {}) {
  const mode = String(options.mode || "").trim().toLowerCase();
  if (!MODES.has(mode)) return invalidInspection("invalid-mode", "请选择有效的海岸或海峡操作");
  const cells = map?.grid?.cells;
  const count = cells?.h?.length || 0;
  const gridCells = uniqueIntegers(options.gridCells);
  if (!gridCells.length) return invalidInspection("empty-selection", "至少需要选择一个完整 grid cell");
  if (gridCells.some(cell => cell < 0 || cell >= count)) return invalidInspection("invalid-cell", "选择中包含无效 grid cell");
  if (!isConnectedSubset(cells.c, gridCells)) return invalidInspection("disconnected-selection", "所选 grid cells 必须通过共享边连续");

  const selected = new Set(gridCells);
  const sourceLand = mode !== FEATURE_TOPOLOGY_MODE.RECLAIM_COAST && mode !== FEATURE_TOPOLOGY_MODE.CLOSE_STRAIT;
  const targetLand = !sourceLand;
  if (gridCells.some(cell => isLand(cells.h[cell]) !== sourceLand)) {
    return invalidInspection("mixed-source", sourceLand ? "该操作只能选择陆地 cells" : "该操作只能选择水域 cells");
  }

  const packCells = packCellsForGrid(map, selected);
  const conflict = inspectProtectedObjects(map, packCells);
  if (conflict) return invalidInspection(conflict.code, conflict.reason, {gridCells, packCells});

  const before = buildComponents(cells, null);
  const after = buildComponents(cells, new Map(gridCells.map(cell => [cell, targetLand ? LAND_HEIGHT : WATER_HEIGHT])));
  if (sourceLand && coversWholeSourceComponent(gridCells, before)) {
    return invalidInspection("remove-whole-land-feature", "操作不能让整座岛屿或整块大陆沉没");
  }
  if (!sourceLand && coversWholeOpenWaterComponent(gridCells, before)) {
    return invalidInspection("fill-whole-open-ocean", "操作不能把整片开放海洋填成陆地");
  }
  if (!after.components.some(component => component.land)) {
    return invalidInspection("remove-all-land", "操作不能消灭全部陆地");
  }
  if (!after.components.some(component => !component.land && component.border)) {
    return invalidInspection("remove-last-open-ocean", "操作不能消灭最后一个开放海域");
  }

  const contacts = collectExternalContacts(cells, selected, before.cellComponent);
  const waterContacts = contacts.filter(contact => !before.components[contact.component]?.land);
  const landContacts = contacts.filter(contact => before.components[contact.component]?.land);
  const openWaterContacts = waterContacts.filter(contact => before.components[contact.component]?.border);
  const lakeContacts = waterContacts.filter(contact => !before.components[contact.component]?.border);
  const beforeCounts = componentCounts(before.components);
  const afterCounts = componentCounts(after.components);
  const modeError = inspectModeTopology({
    mode,
    selected,
    before,
    after,
    waterContacts,
    landContacts,
    openWaterContacts,
    lakeContacts,
    beforeCounts,
    afterCounts
  });
  if (modeError) return invalidInspection(modeError.code, modeError.reason, {gridCells, packCells});

  const requestedFeatureId = optionalPositiveInteger(options.featureId);
  if (requestedFeatureId && !matchesRequestedFeature(map, mode, packCells, lakeContacts, requestedFeatureId)) {
    return invalidInspection("feature-mismatch", `所选区域不属于或不连接 Feature #${requestedFeatureId}`, {gridCells, packCells});
  }

  const portConflict = inspectPortValidity(map, selected, targetLand ? LAND_HEIGHT : WATER_HEIGHT, before, after);
  if (portConflict) return invalidInspection(portConflict.code, portConflict.reason, {gridCells, packCells});

  const sourceFeatureIds = uniquePositiveIntegers(gridCells.map(cell => cells.f?.[cell]));
  const adjacentFeatureIds = uniquePositiveIntegers(contacts.map(contact => cells.f?.[contact.cell]));
  return {
    valid: true,
    code: "ok",
    reason: "",
    changed: true,
    mode,
    gridCells,
    packCells,
    fillHeight: targetLand ? LAND_HEIGHT : WATER_HEIGHT,
    sourceFeatureIds,
    adjacentFeatureIds,
    beforeCounts,
    afterCounts,
    opensWaterComponents: Math.max(0, beforeCounts.water - afterCounts.water),
    mergesLandComponents: Math.max(0, beforeCounts.land - afterCounts.land),
    staleSystems: [...STALE_SYSTEMS],
    summary: topologySummary(mode, gridCells.length, packCells.length)
  };
}

export function createApplyFeatureTopologyCommand(options = {}, {label = "编辑海岸与 Feature 拓扑"} = {}) {
  let frozenPlan = null;
  let before = null;
  let after = null;
  let result = null;
  return {
    label,
    domain: "feature-topology",
    effects: createFeatureTopologyEffects(),
    apply(context) {
      if (after) {
        restoreFeatureTopologySnapshot(context?.map, after);
        return;
      }
      const inspection = frozenPlan || inspectFeatureTopology(context?.map, options);
      if (!inspection.valid) throw topologyError(inspection);
      frozenPlan = clonePlain(inspection);
      before = captureFeatureTopologySnapshot(context.map);
      try {
        result = applyFeatureTopologyPlan(context.map, frozenPlan, options);
        after = captureFeatureTopologySnapshot(context.map);
        this.effects.affected = systemAffected("feature-topology", [
          ...result.activeFeatureIds.map(id => ({kind: "feature", id})),
          ...result.removedFeatureIds.map(id => ({kind: "feature", id}))
        ]);
      } catch (error) {
        restoreFeatureTopologySnapshot(context.map, before);
        throw error;
      }
    },
    revert(context) {
      if (!before) throw new Error("缺少可撤销的 Feature 拓扑快照");
      restoreFeatureTopologySnapshot(context?.map, before);
    },
    isNoop(context) {
      const inspection = frozenPlan || inspectFeatureTopology(context?.map, options);
      if (!inspection.valid) throw topologyError(inspection);
      return !inspection.changed;
    },
    getInspection() {
      return frozenPlan ? clonePlain(frozenPlan) : null;
    },
    getResult() {
      return result ? clonePlain(result) : null;
    }
  };
}

export function rebuildFeatureTopology(map, options = {}) {
  ensureFeatureTopologyContainers(map);
  const locked = prepareLockedFeatureConstraints(map, options);
  const rollback = locked.ids.size ? captureFeatureTopologySnapshot(map) : null;
  try {
    return rebuildFeatureTopologyInternal(map, locked, options);
  } catch (error) {
    if (rollback) restoreFeatureTopologySnapshot(map, rollback);
    throw error;
  }
}

function rebuildFeatureTopologyInternal(map, locked, options = {}) {
  const beforeGrid = captureFeatureIdentity(map?.features?.features, map?.grid?.cells?.f, map?.grid?.cells);
  const beforePack = captureFeatureIdentity(map?.pack?.features, map?.pack?.cells?.f, map?.pack?.cells);
  const spatialReferencesBefore = captureSpatialFeatureState(map);
  const lockedReferencesBefore = captureLockedFeatureReferenceState(map, locked.pack?.ids);
  const gridShared = map.grid?.features === map.features?.features;
  const gridTopology = buildComponents(map.grid.cells, null);
  const rawGridFeatures = createGridFeatures(gridTopology, map.grid);
  const rawGridCellFeatures = gridTopology.cellComponent.map(id => id + 1);
  const stableGrid = options.resetUnlockedIdentity === true
    ? rebuildFeatureIdsFromEmpty(rawGridFeatures, rawGridCellFeatures, beforeGrid, {grid: true, locked: locked.grid})
    : stabilizeFeatureIds(rawGridFeatures, rawGridCellFeatures, beforeGrid, {grid: true, locked: locked.grid});
  map.grid.cells.f = stableGrid.cellFeatures;
  map.grid.cells.t = buildDistanceField(map.grid.cells);
  map.features.features = stableGrid.features;
  map.grid.features = gridShared ? map.features.features : clonePlain(map.features.features);
  map.features.shore = buildGridShore(map.grid, map.features.features, map.grid.cells.f);
  refreshGridFeatureMetadata(map);

  refreshPackFeatures(map.pack, map.grid);
  const stablePack = options.resetUnlockedIdentity === true
    ? rebuildFeatureIdsFromEmpty(map.pack.features, map.pack.cells.f, beforePack, {grid: false, locked: locked.pack})
    : stabilizeFeatureIds(map.pack.features, map.pack.cells.f, beforePack, {grid: false, locked: locked.pack});
  map.pack.features = stablePack.features;
  map.pack.cells.f = stablePack.cellFeatures;
  for (let cell = 0; cell < map.pack.cells.f.length; cell++) {
    map.pack.cells.type[cell] = map.pack.features[map.pack.cells.f[cell]]?.type || "unknown";
  }
  refreshPackFeatureMetadata(map);
  remapFeatureReferences(map, stablePack.redirects);
  syncSpatialFeatureReferences(map, spatialReferencesBefore);
  restoreFeatureReferences(lockedReferencesBefore);
  assertLockedFeatureConstraints(map, locked);
  return {
    activeFeatureIds: activeFeatures(map.pack.features).map(featureId),
    removedFeatureIds: stablePack.removedIds,
    redirects: [...stablePack.redirects].map(([from, to]) => ({from, to}))
  };
}

function captureLockedFeatureReferenceState(map, lockedFeatureIds = new Set()) {
  if (!lockedFeatureIds?.size) return [];
  const entries = [];
  const capture = object => {
    if (!object || typeof object !== "object") return;
    if (!lockedFeatureIds.has(Number(object.feature)) && !lockedFeatureIds.has(Number(object.port)) && !lockedFeatureIds.has(Number(object.data?.feature))) return;
    for (const key of ["feature", "port"]) entries.push({target: object, key, present: Object.prototype.hasOwnProperty.call(object, key), value: object[key]});
    if (object.data) entries.push({target: object.data, key: "feature", present: Object.prototype.hasOwnProperty.call(object.data, "feature"), value: object.data.feature});
  };
  for (const collection of [map.pack?.burgs, map.settlements?.cities, map.pack?.routes, map.settlements?.routes, map.markers?.markers, map.pack?.portDiagnostics?.features]) {
    for (const object of collection || []) capture(object);
  }
  return entries;
}

function applyFeatureTopologyPlan(map, plan, options = {}) {
  const selected = new Set(plan.gridCells);
  const routeFeaturesBefore = captureRouteFeatureState(map);
  for (const gridCell of plan.gridCells) map.grid.cells.h[gridCell] = plan.fillHeight;
  for (let packCell = 0; packCell < (map.pack?.cells?.g?.length || 0); packCell++) {
    if (selected.has(Number(map.pack.cells.g[packCell]))) map.pack.cells.h[packCell] = plan.fillHeight;
  }
  injectFault(options, "after-heights", {map, plan});
  const topology = rebuildFeatureTopology(map);
  injectFault(options, "after-rebuild", {map, plan, topology});
  syncPortsOrThrow(map, plan);
  validateRoutesOrThrow(map, routeFeaturesBefore, selected);
  injectFault(options, "after-references", {map, plan, topology});
  markTopologyDerivedStale(map);
  injectFault(options, "before-validate", {map, plan, topology});
  validateFeatureTopologyResult(map, plan);
  const selectionFeatureId = plan.packCells.map(cell => Number(map.pack.cells.f?.[cell])).find(id => Number.isInteger(id) && id > 0)
    ?? plan.gridCells.map(cell => Number(map.grid.cells.f?.[cell])).find(id => Number.isInteger(id) && id > 0)
    ?? 0;
  return {
    mode: plan.mode,
    gridCells: plan.gridCells.length,
    packCells: plan.packCells.length,
    fillHeight: plan.fillHeight,
    selectionTarget: selectionFeatureId ? {kind: "feature", id: selectionFeatureId} : null,
    staleSystems: [...STALE_SYSTEMS],
    ...topology
  };
}

function inspectModeTopology(context) {
  const {mode, selected, before, after, waterContacts, landContacts, openWaterContacts, lakeContacts, beforeCounts, afterCounts} = context;
  if (mode === FEATURE_TOPOLOGY_MODE.CARVE_COAST) {
    if (!openWaterContacts.length) return modeFailure("not-open-coast", "海岸雕刻必须紧邻开放海域");
    if (beforeCounts.land !== afterCounts.land || beforeCounts.water !== afterCounts.water) {
      return modeFailure("component-count-changed", "该选择会改变陆地或水体连通分量，请改用开海峡");
    }
  }
  if (mode === FEATURE_TOPOLOGY_MODE.RECLAIM_COAST) {
    const landComponents = new Set(landContacts.map(contact => contact.component));
    if (!openWaterContacts.length || landComponents.size !== 1) {
      return modeFailure("ambiguous-land-coast", "填岸必须来自开放海域并且只连接一个陆地分量");
    }
    if (beforeCounts.land !== afterCounts.land || beforeCounts.water !== afterCounts.water) {
      return modeFailure("component-count-changed", "该选择会合并陆地或切分水体，请改用闭海峡");
    }
  }
  if (mode === FEATURE_TOPOLOGY_MODE.OPEN_STRAIT) {
    const contactCells = new Set(openWaterContacts.map(contact => contact.cell));
    if (contactCells.size < 2) return modeFailure("strait-needs-two-sea-sides", "开海峡走廊必须连接两侧开放海域");
    if (!selectionTouchesAfterOpenWater(selected, after)) {
      return modeFailure("strait-not-navigable", "转换后没有形成共享边连续的开放水道");
    }
    if (afterCounts.land <= beforeCounts.land) {
      return modeFailure("strait-does-not-split-land", "该选择只修整海岸，没有切开陆地形成海峡");
    }
  }
  if (mode === FEATURE_TOPOLOGY_MODE.CLOSE_STRAIT) {
    if (!waterContacts.length || waterContacts.some(contact => !before.components[contact.component]?.border)) {
      return modeFailure("not-open-strait", "闭海峡只能选择与开放海域相连的水道");
    }
    if (new Set(landContacts.map(contact => contact.cell)).size < 2) {
      return modeFailure("strait-needs-two-land-sides", "闭海峡水道必须连接两侧陆地");
    }
    if (afterCounts.land >= beforeCounts.land) {
      return modeFailure("strait-does-not-join-land", "该选择只填补海岸，没有闭合海峡并连接两侧陆地");
    }
  }
  if (mode === FEATURE_TOPOLOGY_MODE.OPEN_LAKE_TO_SEA) {
    if (!openWaterContacts.length || !lakeContacts.length) {
      return modeFailure("channel-needs-lake-and-sea", "湖海开渠必须同时连接湖泊与开放海域");
    }
    const selectedAfterComponents = new Set([...selected].map(cell => after.cellComponent[cell]));
    if (selectedAfterComponents.size !== 1 || !after.components[[...selectedAfterComponents][0]]?.border) {
      return modeFailure("channel-not-open", "渠道转换后必须把湖泊并入开放海域");
    }
  }
  return null;
}

function inspectProtectedObjects(map, packCells) {
  const selected = new Set(packCells);
  for (const cell of packCells) {
    if (Number(map.pack?.cells?.burg?.[cell]) > 0) return modeFailure("protected-burg", "选择包含城市、首都、省会或港口主体");
  }
  for (const collection of uniqueCollections(map.settlements?.cities, map.pack?.burgs)) {
    for (const city of collection) {
      const cell = objectPackCell(city);
      if (cell !== null && selected.has(cell) && !city?.removed) return modeFailure("protected-city", "选择包含城市、首都、省会或港口主体");
    }
  }
  const rivers = uniqueCollections(map.rivers?.rivers, map.pack?.rivers).flat();
  if (rivers.length) {
    for (const river of rivers) {
      const cells = orderedUniqueIntegers(river?.cells || river?.packCells);
      if (cells[0] !== undefined && selected.has(cells[0])) return modeFailure("protected-river-source", "选择包含河流源点");
      if (!Number(river?.parent) && cells.some(cell => selected.has(cell))) return modeFailure("protected-main-river", "选择包含干流河道");
    }
  } else if (packCells.some(cell => Number(map.pack?.cells?.r?.[cell]) > 0)) {
    return modeFailure("protected-river", "选择包含既有河道");
  }
  for (const route of uniqueCollections(map.settlements?.routes, map.pack?.routes).flat()) {
    const path = orderedUniqueIntegers(route?.packCells || route?.cells);
    const waypoints = uniqueIntegers((route?.waypoints || []).map(point => point?.packCell ?? point?.cell ?? point));
    const protectedCells = new Set([path[0], path.at(-1), ...waypoints].filter(Number.isInteger));
    if ([...protectedCells].some(cell => selected.has(cell))) return modeFailure("protected-route-point", "选择包含路线端点或 waypoint");
    if (path.some(cell => selected.has(cell))) return modeFailure("route-would-break", "该操作会中断既有路线");
  }
  return null;
}

function inspectPortValidity(map, selectedGrid, fillHeight, before, after) {
  if (!map?.pack?.cells?.g) return null;
  const impacted = [];
  for (const collection of uniqueCollections(map.settlements?.cities, map.pack?.burgs)) {
    for (const city of collection) {
      if (city?.removed || !Number(city?.port)) continue;
      const cell = objectPackCell(city);
      if (cell === null) continue;
      const neighborhood = [cell, ...(map.pack.cells.c?.[cell] || [])];
      const haven = Number(map.pack.cells.haven?.[cell]);
      const havenGrid = Number(map.pack.cells.g?.[haven]);
      const beforeComponent = before?.components?.[before?.cellComponent?.[havenGrid]];
      const afterComponent = after?.components?.[after?.cellComponent?.[havenGrid]];
      const waterClassChanged = Boolean(beforeComponent)
        && Boolean(afterComponent)
        && (beforeComponent.land !== afterComponent.land || beforeComponent.border !== afterComponent.border);
      if (
        neighborhood.some(packCell => selectedGrid.has(Number(map.pack.cells.g?.[packCell])))
        || waterClassChanged
      ) impacted.push(city);
    }
  }
  if (!impacted.length) return null;
  const projected = createProjectedPortMap(map, selectedGrid, fillHeight);
  for (const city of impacted) {
    const cell = objectPackCell(city);
    const placement = inspectRelocatedSettlementPort(projected.grid, projected.pack, cell, {
      wasPort: Number(city.port),
      capital: Boolean(city.capital),
      burgId: objectBurgId(city),
      options: map.options || {}
    });
    if (!placement.port) return modeFailure("port-would-be-invalid", `操作会使港口城市 #${city.id ?? city.i ?? "?"} 失去有效港湾`);
  }
  return null;
}

function matchesRequestedFeature(map, mode, packCells, lakeContacts, featureId) {
  const feature = map.pack?.features?.[featureId];
  if (!feature || feature.removed) return false;
  if (mode === FEATURE_TOPOLOGY_MODE.OPEN_LAKE_TO_SEA) {
    const lakeGridCells = new Set(lakeContacts.map(contact => contact.cell));
    for (let cell = 0; cell < (map.pack?.cells?.g?.length || 0); cell++) {
      if (lakeGridCells.has(Number(map.pack.cells.g[cell])) && Number(map.pack.cells.f?.[cell]) === featureId) return true;
    }
    return false;
  }
  return packCells.some(cell => Number(map.pack.cells.f?.[cell]) === featureId);
}

function buildComponents(cells, heightOverrides) {
  const count = cells?.h?.length || 0;
  const cellComponent = new Array(count).fill(-1);
  const components = [];
  const height = cell => heightOverrides?.get(cell) ?? Number(cells.h[cell]);
  for (let start = 0; start < count; start++) {
    if (cellComponent[start] !== -1) continue;
    const land = isLand(height(start));
    const id = components.length;
    const componentCells = [];
    let border = false;
    const queue = [start];
    cellComponent[start] = id;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const cell = queue[cursor];
      componentCells.push(cell);
      if (cells.b?.[cell]) border = true;
      for (const neighbor of cells.c?.[cell] || []) {
        if (cellComponent[neighbor] !== -1 || isLand(height(neighbor)) !== land) continue;
        cellComponent[neighbor] = id;
        queue.push(neighbor);
      }
    }
    components.push({id, land, border, cells: componentCells});
  }
  return {cellComponent, components};
}

function createGridFeatures(topology) {
  return [null, ...topology.components.map((component, index) => {
    const id = index + 1;
    return {
      id,
      i: id,
      land: component.land,
      border: component.border,
      type: component.land ? "island" : component.border ? "ocean" : "lake",
      cells: [...component.cells],
      firstCell: component.cells[0]
    };
  })];
}

function prepareLockedFeatureConstraints(map, options = {}) {
  const provided = options.lockedFeatures ?? options.preservedFeatures ?? [];
  if (!Array.isArray(provided)) throw featureLockConflict("锁定 Feature 约束必须是数组", {reason: "invalid-constraint"});
  const ids = new Set();
  const gridEntries = new Map();
  const packEntries = new Map();

  for (const source of provided) {
    if (!source || typeof source !== "object") throw featureLockConflict("锁定 Feature 约束包含空对象", {reason: "invalid-feature"});
    const id = featureId(source);
    if (!Number.isInteger(id) || id <= 0 || ids.has(id)) {
      throw featureLockConflict("锁定 Feature 缺少唯一的正整数 ID", {reason: "invalid-id", id});
    }
    const packFeature = map.pack?.features?.[id];
    if (!packFeature || packFeature.removed) {
      throw featureLockConflict(`锁定 Feature #${id} 缺少 pack 对象`, {reason: "missing-feature", id});
    }
    const packCells = memberCells(map.pack.cells.f, id);
    const projectedGridCells = uniqueIntegers(packCells.map(cell => map.pack.cells.g?.[cell]));
    const gridIds = uniquePositiveIntegers(projectedGridCells.map(cell => map.grid.cells.f?.[cell]));
    if (!packCells.length || gridIds.length !== 1) {
      throw featureLockConflict(`锁定 Feature #${id} 缺少唯一的 grid 空间镜像`, {reason: "missing-members", id, gridIds});
    }
    const gridId = gridIds[0];
    const gridFeature = map.features?.features?.[gridId];
    const gridCells = memberCells(map.grid.cells.f, gridId);
    if (!gridFeature || gridFeature.removed || !gridCells.length) {
      throw featureLockConflict(`锁定 Feature #${id} 缺少 grid 对象或成员 cell`, {reason: "missing-feature", id, gridId});
    }
    if (Boolean(gridFeature.land) !== Boolean(packFeature.land) || String(gridFeature.type) !== String(packFeature.type)) {
      throw featureLockConflict(`锁定 Feature #${id} 的 grid / pack 类型不一致`, {reason: "type-mismatch", id, gridId});
    }
    const sourceLand = Boolean(source.land);
    const sourceType = String(source.type || "");
    if (sourceLand !== Boolean(packFeature.land) || sourceType && sourceType !== String(packFeature.type)) {
      throw featureLockConflict(`锁定 Feature #${id} 的对象类型与当前拓扑不一致`, {reason: "type-mismatch", id});
    }

    if (gridEntries.has(gridId)) {
      throw featureLockConflict(`锁定 Feature #${id} 与另一锁对象复用 grid Feature #${gridId}`, {reason: "overlapping-grid-feature", id, gridId});
    }
    gridEntries.set(gridId, {
      id: gridId,
      sourceId: id,
      feature: clonePlain(gridFeature),
      cells: gridCells,
      land: Boolean(gridFeature.land),
      type: String(gridFeature.type),
      fields: captureLockedCellAssignments(map.grid.cells, gridCells, ["f"])
    });
    packEntries.set(id, {
      id,
      feature: clonePlain(packFeature),
      cells: packCells,
      land: Boolean(packFeature.land),
      type: String(packFeature.type),
      fields: captureLockedCellAssignments(map.pack.cells, packCells, ["f", "haven", "harbor", "type"])
    });
    ids.add(id);
  }

  return {
    ids,
    grid: {entries: gridEntries, ids: new Set(gridEntries.keys())},
    pack: {entries: packEntries, ids: new Set(packEntries.keys())}
  };
}

function captureLockedCellAssignments(cells, memberCells, fields) {
  return Object.fromEntries(fields.map(field => [field, memberCells.map(cell => clonePlain(cells?.[field]?.[cell]))]));
}

function assertLockedFeatureConstraints(map, locked) {
  assertLockedFeatureSide(map.features?.features, map.grid?.cells, locked.grid, "grid");
  assertLockedFeatureSide(map.pack?.features, map.pack?.cells, locked.pack, "pack");
}

function assertLockedFeatureSide(features, cells, locked, side) {
  for (const [id, entry] of locked.entries) {
    if (stableValue(features?.[id]) !== stableValue(entry.feature)) {
      throw featureLockConflict(`锁定 Feature #${id} 的 ${side} 对象被改写`, {reason: "locked-object-changed", id, side});
    }
    const currentCells = memberCells(cells?.f, id);
    if (!sameIntegerCells(currentCells, entry.cells)) {
      throw featureLockConflict(`锁定 Feature #${id} 的 ${side} 成员 cell 被改写`, {reason: "locked-members-changed", id, side});
    }
    for (const [field, values] of Object.entries(entry.fields)) {
      const current = entry.cells.map(cell => cells?.[field]?.[cell]);
      if (stableValue(current) !== stableValue(values)) {
        throw featureLockConflict(`锁定 Feature #${id} 的 ${side}.${field} assignment 被改写`, {
          reason: "locked-assignment-changed",
          id,
          side,
          field
        });
      }
    }
  }
}

function featureLockConflict(message, details = {}) {
  const error = new Error(message);
  error.code = "regeneration_lock_conflict";
  error.details = {kind: "feature", ...details};
  return error;
}

function stabilizeFeatureIds(rawFeatures, rawCellFeatures, before, {grid, locked = {entries: new Map(), ids: new Set()}}) {
  const rawIds = activeFeatures(rawFeatures).map(featureId);
  const rawCellsById = cellsByFeature(rawCellFeatures);
  const oldCellsById = cellsByFeature(before.cellFeatures);
  const oldActive = activeFeatures(before.features);
  const oldIds = new Set(oldActive.map(featureId));
  const assignments = new Map();
  const claimed = new Set();
  for (const [lockedId, entry] of locked.entries) {
    const rawIdsForMembers = new Set(entry.cells.map(cell => Number(rawCellFeatures?.[cell])).filter(id => id > 0));
    if (rawIdsForMembers.size !== 1) {
      throw featureLockConflict(`锁定 Feature #${lockedId} 被拆分`, {reason: "locked-feature-split", id: lockedId, grid});
    }
    const rawId = [...rawIdsForMembers][0];
    const rawFeature = rawFeatures?.[rawId];
    if (!rawFeature || Boolean(rawFeature.land) !== entry.land || String(rawFeature.type) !== entry.type) {
      throw featureLockConflict(`锁定 Feature #${lockedId} 的陆水或类型发生变化`, {reason: "locked-feature-type-changed", id: lockedId, grid});
    }
    const rawCells = rawCellsById.get(rawId) || [];
    if (!sameIntegerCells(rawCells, entry.cells)) {
      throw featureLockConflict(`锁定 Feature #${lockedId} 与其它分量合并`, {reason: "locked-feature-merged", id: lockedId, grid});
    }
    if (assignments.has(rawId) || claimed.has(lockedId)) {
      throw featureLockConflict(`锁定 Feature #${lockedId} assignment 冲突`, {reason: "locked-assignment-conflict", id: lockedId, grid});
    }
    assignments.set(rawId, lockedId);
    claimed.add(lockedId);
  }
  const rawContainingCenters = new Map();
  for (const old of oldActive) {
    const oldId = featureId(old);
    const center = featureCenter(old, oldCellsById.get(oldId) || []);
    const rawId = Number(rawCellFeatures?.[center]);
    if (rawId > 0 && Boolean(rawFeatures[rawId]?.land) === Boolean(old.land)) rawContainingCenters.set(oldId, rawId);
  }
  for (const rawId of rawIds) {
    if (assignments.has(rawId)) continue;
    const candidates = [...oldIds].filter(oldId => rawContainingCenters.get(oldId) === rawId);
    const winner = chooseSurvivor(rawFeatures[rawId], candidates, before.features, oldCellsById, before.openFeatureIds, before.featureAreas);
    if (winner && !claimed.has(winner)) {
      assignments.set(rawId, winner);
      claimed.add(winner);
    }
  }
  let nextId = Math.max(before.features.length - 1, ...oldIds, 0);
  for (const rawId of rawIds) {
    if (assignments.has(rawId)) continue;
    const overlapping = overlapCandidates(rawCellsById.get(rawId) || [], before.cellFeatures)
      .filter(oldId => oldIds.has(oldId) && !claimed.has(oldId));
    const unsplit = overlapping.find(oldId => !rawContainingCenters.has(oldId));
    if (unsplit) {
      assignments.set(rawId, unsplit);
      claimed.add(unsplit);
    } else {
      nextId += 1;
      assignments.set(rawId, nextId);
    }
  }

  const maxId = Math.max(nextId, before.features.length - 1);
  const features = new Array(maxId + 1).fill(null);
  features[0] = null;
  const cellFeatures = cloneCellFeatureArray(rawCellFeatures, maxId);
  for (let cell = 0; cell < rawCellFeatures.length; cell++) cellFeatures[cell] = assignments.get(Number(rawCellFeatures[cell])) || 0;
  for (const rawId of rawIds) {
    const stableId = assignments.get(rawId);
    const old = before.features[stableId];
    const lockedEntry = locked.entries.get(stableId);
    features[stableId] = lockedEntry ? clonePlain(lockedEntry.feature) : mergeFeatureIdentity(old, rawFeatures[rawId], stableId, grid);
  }

  const redirects = new Map();
  const removedIds = [];
  for (const old of oldActive) {
    const oldId = featureId(old);
    if (claimed.has(oldId)) continue;
    const oldCells = oldCellsById.get(oldId) || [];
    const targets = overlapCandidates(oldCells, cellFeatures);
    const redirectTo = targets[0] || 0;
    features[oldId] = {...clonePlain(old), id: oldId, i: oldId, removed: true, tombstone: true, redirectTo, cells: grid ? [] : 0};
    if (redirectTo) redirects.set(oldId, redirectTo);
    removedIds.push(oldId);
  }
  for (let id = 1; id < before.features.length; id++) {
    if (features[id] || !before.features[id]) continue;
    features[id] = clonePlain(before.features[id]);
  }
  return {features, cellFeatures, redirects, removedIds};
}

function rebuildFeatureIdsFromEmpty(rawFeatures, rawCellFeatures, before, {grid, locked = {entries: new Map(), ids: new Set()}}) {
  const rawIds = activeFeatures(rawFeatures).map(featureId);
  const rawCellsById = cellsByFeature(rawCellFeatures);
  const assignments = new Map();
  const claimed = new Set();
  for (const [lockedId, entry] of locked.entries) {
    const matching = rawIds.filter(rawId => sameIntegerCells(rawCellsById.get(rawId) || [], entry.cells));
    if (matching.length !== 1) {
      throw featureLockConflict(`锁定 Feature #${lockedId} 无法在完全重算结果中保持唯一分量`, {reason: "locked-feature-topology-changed", id: lockedId, grid});
    }
    assignments.set(matching[0], lockedId);
    claimed.add(lockedId);
  }
  let nextId = 1;
  for (const rawId of rawIds) {
    if (assignments.has(rawId)) continue;
    while (claimed.has(nextId)) nextId += 1;
    assignments.set(rawId, nextId);
    claimed.add(nextId);
    nextId += 1;
  }

  const maxId = Math.max(0, ...claimed);
  const features = new Array(maxId + 1).fill(null);
  features[0] = null;
  const cellFeatures = cloneCellFeatureArray(rawCellFeatures, maxId);
  for (let cell = 0; cell < rawCellFeatures.length; cell++) cellFeatures[cell] = assignments.get(Number(rawCellFeatures[cell])) || 0;
  for (const rawId of rawIds) {
    const id = assignments.get(rawId);
    const lockedEntry = locked.entries.get(id);
    features[id] = lockedEntry ? clonePlain(lockedEntry.feature) : mergeFeatureIdentity(null, rawFeatures[rawId], id, grid);
  }

  const redirects = new Map();
  const activeIds = new Set(activeFeatures(features).map(featureId));
  const removedIds = [];
  const oldCellsById = cellsByFeature(before.cellFeatures);
  for (const old of activeFeatures(before.features)) {
    const oldId = featureId(old);
    const target = overlapCandidates(oldCellsById.get(oldId) || [], cellFeatures)[0] || 0;
    if (target && target !== oldId) redirects.set(oldId, target);
    if (!activeIds.has(oldId)) removedIds.push(oldId);
  }
  return {features, cellFeatures, redirects, removedIds};
}

function chooseSurvivor(rawFeature, candidates, oldFeatures, oldCellsById, openFeatureIds = new Set(), featureAreas = new Map()) {
  if (!candidates.length) return 0;
  const openSea = candidates.filter(id => openFeatureIds.has(id) && !rawFeature?.land && rawFeature?.border);
  const pool = openSea.length ? openSea : candidates;
  return [...pool].sort((a, b) => (featureAreas.get(b) || oldCellsById.get(b)?.length || 0) - (featureAreas.get(a) || oldCellsById.get(a)?.length || 0) || a - b)[0];
}

function mergeFeatureIdentity(old, raw, id, grid) {
  const merged = {...clonePlain(old || {}), ...clonePlain(raw), id, i: id};
  delete merged.removed;
  delete merged.tombstone;
  delete merged.redirectTo;
  if (merged.type !== "lake") {
    for (const key of ["inlets", "outlet", "closed", "flux", "evaporation", "temp", "height", "shoreline"]) delete merged[key];
  }
  if (grid && !Array.isArray(merged.cells)) merged.cells = [];
  return merged;
}

function captureFeatureIdentity(features, cellFeatures, cells) {
  const cellSnapshot = cloneArrayLike(cellFeatures);
  const byId = cellsByFeature(cellSnapshot);
  return {
    features: clonePlain(features || []),
    cellFeatures: cellSnapshot,
    openFeatureIds: deriveOpenFeatureIds(cells, cellSnapshot),
    featureAreas: new Map([...byId].map(([id, featureCells]) => [id, featureArea(cells, featureCells)]))
  };
}

function buildDistanceField(cells) {
  const result = new Int8Array(cells.h.length);
  for (let cell = 0; cell < cells.h.length; cell++) {
    const land = isLand(cells.h[cell]);
    for (const neighbor of cells.c?.[cell] || []) {
      if (isLand(cells.h[neighbor]) === land) continue;
      result[cell] = land ? 1 : -1;
      break;
    }
  }
  markupDistance(result, cells.c, 2, 1, 127);
  markupDistance(result, cells.c, -2, -1, -10);
  return Array.from(result);
}

function buildGridShore(grid, features, featureIds) {
  const coastline = [];
  const lakeShore = [];
  for (let cell = 0; cell < grid.cells.h.length; cell++) {
    for (const neighbor of grid.cells.c?.[cell] || []) {
      if (neighbor <= cell || isLand(grid.cells.h[cell]) === isLand(grid.cells.h[neighbor])) continue;
      const waterCell = isLand(grid.cells.h[cell]) ? neighbor : cell;
      const segment = sharedGridSegment(grid, cell, neighbor);
      if (!segment) continue;
      const feature = features[featureIds[waterCell]];
      (feature?.type === "ocean" ? coastline : lakeShore).push(segment);
    }
  }
  return {coastline, lakeShore};
}

function sharedGridSegment(grid, first, second) {
  const secondVertices = grid.cells.v?.[second] || [];
  const shared = (grid.cells.v?.[first] || []).filter(vertex => secondVertices.includes(vertex)).slice(0, 2);
  if (shared.length < 2) return null;
  return [grid.vertices.p[shared[0]], grid.vertices.p[shared[1]]];
}

function refreshGridFeatureMetadata(map) {
  const features = activeFeatures(map.features.features);
  map.features.metadata = {
    ...(map.features.metadata || {}),
    featureCount: features.length,
    oceanFeatures: features.filter(feature => feature.type === "ocean").length,
    landFeatures: features.filter(feature => feature.land).length,
    lakeFeatures: features.filter(feature => feature.type === "lake").length,
    coastlineSegments: map.features.shore.coastline.length,
    lakeShoreSegments: map.features.shore.lakeShore.length
  };
}

function refreshPackFeatureMetadata(map) {
  const features = activeFeatures(map.pack.features);
  map.pack.metadata = map.pack.metadata || {};
  map.pack.metadata.packFeatureCount = features.length;
  map.pack.metadata.featureGroups = countBy(features, feature => feature.group || "none");
  map.pack.metadata.havenCells = countPositive(map.pack.cells.haven);
  map.pack.metadata.harborCells = countPositive(map.pack.cells.harbor);
}

function remapFeatureReferences(map, redirects) {
  if (!redirects.size) return;
  const remap = object => {
    if (!object || typeof object !== "object") return;
    if (redirects.has(Number(object.feature))) object.feature = redirects.get(Number(object.feature));
    if (object.data && redirects.has(Number(object.data.feature))) object.data.feature = redirects.get(Number(object.data.feature));
  };
  for (const collection of [map.pack?.burgs, map.pack?.routes, map.settlements?.cities, map.settlements?.routes, map.markers?.markers, map.pack?.portDiagnostics?.features]) {
    for (const object of collection || []) remap(object);
  }
}

function syncSpatialFeatureReferences(map, before = new Map()) {
  const sync = (object, cell) => {
    if (cell === null || !(map.pack.cells.f?.[cell] > 0)) return;
    const next = Number(map.pack.cells.f[cell]);
    const current = Number(object?.feature) || 0;
    const previousSpatial = Number(before.get(object)) || 0;
    const currentFeature = map.pack.features?.[current];
    if (!currentFeature || currentFeature.removed || current === previousSpatial && next !== previousSpatial) object.feature = next;
  };
  for (const collection of uniqueCollections(map.settlements?.cities, map.pack?.burgs)) {
    for (const object of collection) {
      const cell = objectPackCell(object);
      sync(object, cell);
    }
  }
  for (const marker of map.markers?.markers || []) {
    const cell = numberCell(marker?.packCell);
    sync(marker, cell);
  }
  for (const route of uniqueCollections(map.settlements?.routes, map.pack?.routes).flat()) {
    const cell = orderedUniqueIntegers(route?.packCells)[0];
    sync(route, cell ?? null);
  }
}

function captureSpatialFeatureState(map) {
  const result = new Map();
  const capture = (object, cell) => {
    if (cell !== null && cell !== undefined) result.set(object, Number(map.pack.cells.f?.[cell]) || 0);
  };
  for (const collection of uniqueCollections(map.settlements?.cities, map.pack?.burgs)) {
    for (const object of collection) capture(object, objectPackCell(object));
  }
  for (const marker of map.markers?.markers || []) capture(marker, numberCell(marker?.packCell));
  for (const route of uniqueCollections(map.settlements?.routes, map.pack?.routes).flat()) capture(route, orderedUniqueIntegers(route?.packCells)[0]);
  return result;
}

function syncPortsOrThrow(map, plan) {
  const selected = new Set(plan?.gridCells || []);
  for (const collection of uniqueCollections(map.settlements?.cities, map.pack?.burgs)) {
    for (const object of collection) {
      if (object?.removed || !Number(object?.port)) continue;
      const cell = objectPackCell(object);
      if (cell === null) continue;
      const haven = Number(map.pack.cells.haven?.[cell]);
      const havenFeature = haven >= 0 ? Number(map.pack.cells.f?.[haven]) : 0;
      const oldPort = Number(object.port);
      const oldPortActive = Boolean(map.pack.features?.[oldPort] && !map.pack.features[oldPort].removed);
      const neighborhoodChanged = [cell, ...(map.pack.cells.c?.[cell] || [])].some(packCell => selected.has(Number(map.pack.cells.g?.[packCell])));
      if (oldPortActive && oldPort === havenFeature && !neighborhoodChanged) continue;
      const placement = inspectRelocatedSettlementPort(map.grid, map.pack, cell, {
        wasPort: oldPort,
        capital: Boolean(object.capital),
        burgId: objectBurgId(object),
        options: map.options || {}
      });
      if (!placement.port) throw new Error(`港口城市 #${object.id ?? object.i ?? "?"} 在 Feature 拓扑编辑后失效`);
      object.port = Number(placement.port);
      if (Array.isArray(placement.anchor)) {
        object.x = Number(placement.anchor[0]) || 0;
        object.y = Number(placement.anchor[1]) || 0;
      }
    }
  }
  if (map.settlements?.metadata) {
    map.settlements.metadata.ports = (map.settlements.cities || []).filter(city => city && !city.removed && Number(city.port) > 0).length;
  }
}

function validateRoutesOrThrow(map, routeFeaturesBefore = new Map(), selectedGrid = new Set()) {
  const cities = new Map((map.settlements?.cities || []).filter(city => city && !city.removed).map(city => [Number(city.id), city]));
  for (const route of uniqueCollections(map.settlements?.routes, map.pack?.routes).flat()) {
    const path = orderedUniqueIntegers(route?.packCells);
    if (!path.length) continue;
    const changedFeature = routeFeaturesBefore.has(route) && Number(routeFeaturesBefore.get(route)) !== Number(route.feature);
    const intersectsSelection = path.some(cell => selectedGrid.has(Number(map.pack.cells.g?.[cell])));
    if (!changedFeature && !intersectsSelection) continue;
    const water = route.type === "searoute";
    if (path.some(cell => isLand(map.pack.cells.h?.[cell]) === water)) {
      throw new Error(`路线 #${route.id ?? route.i ?? "?"} 在 Feature 拓扑编辑后被水陆边界中断`);
    }
    const featureIds = new Set(path.map(cell => Number(map.pack.cells.f?.[cell])).filter(id => id > 0));
    if (featureIds.size !== 1) throw new Error(`路线 #${route.id ?? route.i ?? "?"} 在 Feature 拓扑编辑后跨越不连通 Feature`);
    const featureId = [...featureIds][0];
    const feature = map.pack.features?.[featureId];
    if (!feature || feature.removed || Boolean(feature.land) !== !water) throw new Error(`路线 #${route.id ?? route.i ?? "?"} 引用了无效 Feature`);
    route.feature = featureId;
    if (!water) continue;
    for (const endpoint of [route.from, route.to]) {
      const city = cities.get(Number(endpoint));
      if (city?.port && Number(city.port) !== featureId) throw new Error(`海路 #${route.id ?? route.i ?? "?"} 与端点港口水体不一致`);
    }
  }
}

function captureRouteFeatureState(map) {
  return new Map(uniqueCollections(map.settlements?.routes, map.pack?.routes).flat().map(route => [route, Number(route?.feature) || 0]));
}

function validateFeatureTopologyResult(map, plan) {
  validateFeatureCollection(map.features?.features, map.grid?.cells, "grid");
  validateFeatureCollection(map.pack?.features, map.pack?.cells, "pack");
  const selected = new Set(plan.gridCells);
  for (const gridCell of plan.gridCells) {
    if (Number(map.grid.cells.h[gridCell]) !== Number(plan.fillHeight)) throw new Error(`grid cell #${gridCell} 高度没有提交到目标海平面`);
  }
  for (let packCell = 0; packCell < (map.pack.cells.g?.length || 0); packCell++) {
    if (!selected.has(Number(map.pack.cells.g[packCell]))) continue;
    if (Number(map.pack.cells.h[packCell]) !== Number(plan.fillHeight)) throw new Error(`pack cell #${packCell} 高度没有与 grid 同步`);
  }
  for (const collection of uniqueCollections(map.settlements?.cities, map.pack?.burgs)) {
    for (const object of collection) {
      const port = Number(object?.port);
      if (!port || object?.removed) continue;
      const feature = map.pack.features?.[port];
      if (!feature || feature.removed || feature.land) throw new Error(`港口城市 #${object.id ?? object.i ?? "?"} 指向退役或非水域 Feature #${port}`);
    }
  }
  if (!activeFeatures(map.pack.features).some(feature => feature.land)) throw new Error("Feature 拓扑编辑不能消灭全部陆地");
  if (!deriveOpenFeatureIds(map.pack.cells, map.pack.cells.f).size) throw new Error("Feature 拓扑编辑不能消灭最后开放海域");
}

function validateFeatureCollection(features, cells, label) {
  for (let id = 1; id < (features?.length || 0); id++) {
    const feature = features[id];
    if (!feature || feature.removed) continue;
    if (featureId(feature) !== id) throw new Error(`${label} Feature #${id} 身份与数组索引不一致`);
  }
  for (let cell = 0; cell < (cells?.f?.length || 0); cell++) {
    const id = Number(cells.f[cell]);
    const feature = features?.[id];
    if (!id || !feature || feature.removed) throw new Error(`${label} cell #${cell} 指向退役或缺失 Feature #${id}`);
    if (Boolean(feature.land) !== isLand(cells.h?.[cell])) throw new Error(`${label} cell #${cell} 的水陆高度与 Feature 不一致`);
  }
}

function createProjectedPortMap(map, selectedGrid, fillHeight) {
  const gridCells = {...map.grid.cells, h: cloneArrayLike(map.grid.cells.h)};
  for (const cell of selectedGrid) gridCells.h[cell] = fillHeight;
  const packCells = {
    ...map.pack.cells,
    h: cloneArrayLike(map.pack.cells.h),
    f: cloneArrayLike(map.pack.cells.f),
    t: cloneArrayLike(map.pack.cells.t),
    haven: cloneArrayLike(map.pack.cells.haven),
    harbor: cloneArrayLike(map.pack.cells.harbor),
    type: map.pack.cells.type ? cloneArrayLike(map.pack.cells.type) : new Array(map.pack.cells.h.length).fill("unknown")
  };
  for (let cell = 0; cell < packCells.g.length; cell++) if (selectedGrid.has(Number(packCells.g[cell]))) packCells.h[cell] = fillHeight;
  const projected = {
    grid: {...map.grid, cells: gridCells},
    pack: {...map.pack, cells: packCells, features: clonePlain(map.pack.features || []), metadata: clonePlain(map.pack.metadata || {})}
  };
  refreshPackFeatures(projected.pack, projected.grid);
  return projected;
}

function ensureFeatureTopologyContainers(map) {
  if (!map?.grid?.cells?.h || !map?.pack?.cells?.h) throw new Error("Feature 拓扑重建缺少 grid / pack 高度字段");
  map.features ||= {features: [null], shore: {coastline: [], lakeShore: []}, metadata: {}};
  map.features.features ||= [null];
  map.features.shore ||= {coastline: [], lakeShore: []};
  map.pack.features ||= [null];
  map.pack.metadata ||= {};
  if (!map.pack.cells.i) map.pack.cells.i = Array.from({length: map.pack.cells.h.length}, (_, index) => index);
  if (!map.pack.cells.type || map.pack.cells.type.length !== map.pack.cells.h.length) {
    map.pack.cells.type = new Array(map.pack.cells.h.length).fill("unknown");
  }
}

function deriveOpenFeatureIds(cells, featureIds) {
  const result = new Set();
  for (let cell = 0; cell < (featureIds?.length || 0); cell++) {
    if (!cells?.b?.[cell] || isLand(cells.h?.[cell])) continue;
    const id = Number(featureIds[cell]);
    if (id > 0) result.add(id);
  }
  return result;
}

function featureArea(cells, featureCells) {
  if (cells?.area) return featureCells.reduce((sum, cell) => sum + (Number(cells.area[cell]) || 0), 0);
  return featureCells.length;
}

function injectFault(options, stage, context = {}) {
  if (typeof options?.faultInjector === "function") options.faultInjector(stage, context);
  if (options?.faultAt === stage) throw new Error(`Feature 拓扑故障注入：${stage}`);
}

function markTopologyDerivedStale(map) {
  if (!map?.metadata) return;
  map.metadata.derivedStale = {
    ...(map.metadata.derivedStale || {}),
    systems: [...new Set([...(map.metadata.derivedStale?.systems || []), ...STALE_SYSTEMS])],
    updatedAt: new Date().toISOString()
  };
  for (const kind of ["markers", "zones", "military", "economy", "diplomacy"]) {
    if (map[kind]?.metadata) map[kind].metadata.stale = true;
  }
}

function captureFeatureTopologySnapshot(map) {
  return {
    gridFeaturesShared: map.grid?.features === map.features?.features,
    gridFeatures: clonePlain(map.features?.features || []),
    featureMetadata: clonePlain(map.features?.metadata || null),
    featureShore: clonePlain(map.features?.shore || null),
    gridCells: captureCellFields(map.grid?.cells, ["h", "f", "t"]),
    packFeatures: clonePlain(map.pack?.features || []),
    packMetadata: clonePlain(map.pack?.metadata || null),
    packCells: captureCellFields(map.pack?.cells, ["h", "f", "t", "haven", "harbor", "type"]),
    settlementMetadata: clonePlain(map.settlements?.metadata || null),
    notes: clonePlain(map.notes || null),
    references: captureFeatureReferences(map),
    stale: captureStaleState(map)
  };
}

function restoreFeatureTopologySnapshot(map, snapshot) {
  map.features.features = clonePlain(snapshot.gridFeatures);
  map.grid.features = snapshot.gridFeaturesShared ? map.features.features : clonePlain(snapshot.gridFeatures);
  if (snapshot.featureMetadata) map.features.metadata = clonePlain(snapshot.featureMetadata);
  if (snapshot.featureShore) map.features.shore = clonePlain(snapshot.featureShore);
  restoreCellFields(map.grid?.cells, snapshot.gridCells);
  map.pack.features = clonePlain(snapshot.packFeatures);
  if (snapshot.packMetadata) map.pack.metadata = clonePlain(snapshot.packMetadata);
  restoreCellFields(map.pack?.cells, snapshot.packCells);
  if (map.settlements && snapshot.settlementMetadata) map.settlements.metadata = clonePlain(snapshot.settlementMetadata);
  if (snapshot.notes) map.notes = clonePlain(snapshot.notes);
  else delete map.notes;
  restoreFeatureReferences(snapshot.references);
  restoreStaleState(map, snapshot.stale);
}

function captureFeatureReferences(map) {
  const entries = [];
  const capture = (object, keys = ["feature"]) => {
    if (!object || typeof object !== "object") return;
    for (const key of keys) {
      entries.push({target: object, key, present: Object.prototype.hasOwnProperty.call(object, key), value: object[key]});
    }
    if (object.data) entries.push({target: object.data, key: "feature", present: Object.prototype.hasOwnProperty.call(object.data, "feature"), value: object.data.feature});
  };
  for (const collection of [map.pack?.burgs, map.settlements?.cities]) for (const object of collection || []) capture(object, ["feature", "port", "x", "y"]);
  for (const collection of [map.pack?.routes, map.settlements?.routes, map.markers?.markers, map.pack?.portDiagnostics?.features]) for (const object of collection || []) capture(object);
  return entries;
}

function restoreFeatureReferences(entries) {
  for (const entry of entries || []) {
    if (entry.present) entry.target[entry.key] = entry.value;
    else delete entry.target[entry.key];
  }
}

function captureStaleState(map) {
  return {
    derived: clonePlain(map.metadata?.derivedStale || null),
    flags: Object.fromEntries(["markers", "zones", "military", "economy", "diplomacy"].map(kind => [kind, {
      present: Object.prototype.hasOwnProperty.call(map[kind]?.metadata || {}, "stale"),
      value: map[kind]?.metadata?.stale
    }]))
  };
}

function restoreStaleState(map, snapshot) {
  if (snapshot.derived) map.metadata.derivedStale = clonePlain(snapshot.derived);
  else delete map.metadata.derivedStale;
  for (const [kind, flag] of Object.entries(snapshot.flags || {})) {
    if (!map[kind]?.metadata) continue;
    if (flag.present) map[kind].metadata.stale = flag.value;
    else delete map[kind].metadata.stale;
  }
}

function collectExternalContacts(cells, selected, cellComponent) {
  const contacts = [];
  const seen = new Set();
  for (const source of selected) {
    for (const cell of cells.c?.[source] || []) {
      if (selected.has(cell)) continue;
      const component = Number(cellComponent[cell]);
      const key = `${source}:${cell}`;
      if (seen.has(key)) continue;
      seen.add(key);
      contacts.push({source, cell, component});
    }
  }
  return contacts;
}

function selectionTouchesAfterOpenWater(selected, after) {
  const ids = new Set([...selected].map(cell => after.cellComponent[cell]));
  return ids.size === 1 && [...ids].every(id => !after.components[id]?.land && after.components[id]?.border);
}

function componentCounts(components) {
  return {
    land: components.filter(component => component.land).length,
    water: components.filter(component => !component.land).length,
    openWater: components.filter(component => !component.land && component.border).length,
    lakes: components.filter(component => !component.land && !component.border).length
  };
}

function coversWholeSourceComponent(gridCells, topology) {
  const selected = new Set(gridCells);
  const sourceIds = new Set(gridCells.map(cell => topology.cellComponent[cell]));
  return [...sourceIds].some(id => topology.components[id]?.land && topology.components[id].cells.every(cell => selected.has(cell)));
}

function coversWholeOpenWaterComponent(gridCells, topology) {
  const selected = new Set(gridCells);
  const sourceIds = new Set(gridCells.map(cell => topology.cellComponent[cell]));
  return [...sourceIds].some(id => {
    const component = topology.components[id];
    return component && !component.land && component.border && component.cells.every(cell => selected.has(cell));
  });
}

function packCellsForGrid(map, selectedGrid) {
  const result = [];
  for (let cell = 0; cell < (map?.pack?.cells?.g?.length || 0); cell++) {
    if (selectedGrid.has(Number(map.pack.cells.g[cell]))) result.push(cell);
  }
  return result;
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

function cellsByFeature(cellFeatures) {
  const byId = new Map();
  for (let cell = 0; cell < (cellFeatures?.length || 0); cell++) {
    const id = Number(cellFeatures[cell]);
    if (!Number.isInteger(id) || id <= 0) continue;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(cell);
  }
  return byId;
}

function memberCells(cellFeatures, id) {
  const result = [];
  for (let cell = 0; cell < (cellFeatures?.length || 0); cell++) {
    if (Number(cellFeatures[cell]) === id) result.push(cell);
  }
  return result;
}

function sameIntegerCells(first, second) {
  if (first.length !== second.length) return false;
  for (let index = 0; index < first.length; index++) {
    if (Number(first[index]) !== Number(second[index])) return false;
  }
  return true;
}

function stableValue(value) {
  return JSON.stringify(value);
}

function overlapCandidates(cells, cellFeatures) {
  const counts = new Map();
  for (const cell of cells) {
    const id = Number(cellFeatures?.[cell]);
    if (!Number.isInteger(id) || id <= 0) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([id]) => id);
}

function featureCenter(feature, cells) {
  if (Number.isInteger(Number(feature?.firstCell))) return Number(feature.firstCell);
  const ownCells = Array.isArray(feature?.cells) ? feature.cells : cells;
  return Number(ownCells?.[Math.floor((ownCells.length - 1) / 2)] ?? cells[0] ?? 0);
}

function activeFeatures(features) {
  return (features || []).filter(feature => feature && !feature.removed);
}

function featureId(feature) {
  return Number(feature?.i ?? feature?.id);
}

function cloneCellFeatureArray(source, maxId) {
  if (Array.isArray(source)) return new Array(source.length).fill(0);
  const Constructor = maxId <= 65535 ? Uint16Array : Uint32Array;
  return new Constructor(source?.length || 0);
}

function captureCellFields(cells, fields) {
  return Object.fromEntries(fields.map(field => [field, cloneArrayLike(cells?.[field])]));
}

function restoreCellFields(cells, snapshot) {
  if (!cells) return;
  for (const [field, value] of Object.entries(snapshot || {})) if (value !== null) cells[field] = cloneArrayLike(value);
}

function markupDistance(values, neighbors, start, increment, limit) {
  for (let distance = start; distance !== limit; distance += increment) {
    const previous = distance - increment;
    let marked = 0;
    for (let cell = 0; cell < values.length; cell++) {
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

function topologySummary(mode, gridCount, packCount) {
  const labels = {
    [FEATURE_TOPOLOGY_MODE.CARVE_COAST]: "海岸雕刻",
    [FEATURE_TOPOLOGY_MODE.RECLAIM_COAST]: "填岸",
    [FEATURE_TOPOLOGY_MODE.OPEN_STRAIT]: "开海峡",
    [FEATURE_TOPOLOGY_MODE.CLOSE_STRAIT]: "闭海峡",
    [FEATURE_TOPOLOGY_MODE.OPEN_LAKE_TO_SEA]: "湖海开渠"
  };
  return `${labels[mode]}：${gridCount} 个 grid cells / ${packCount} 个 pack cells`;
}

function createFeatureTopologyEffects() {
  return {
    render: "draw",
    selection: "refresh",
    runtimeStats: true,
    pickPanel: true,
    derived: [
      "terrain-caches",
      "height-field",
      "features",
      "shoreline",
      "cell-colors",
      "line-layers",
      "object-index",
      "object-panels",
      "derived-stale",
      ...STALE_SYSTEMS.map(system => `defer:${system}`)
    ],
    affected: systemAffected("feature-topology")
  };
}

function invalidInspection(code, reason, values = {}) {
  return {valid: false, code, reason, changed: false, gridCells: [], packCells: [], ...values};
}

function modeFailure(code, reason) {
  return {code, reason};
}

function topologyError(inspection) {
  const error = new Error(inspection.reason || "Feature 拓扑预检失败");
  error.code = inspection.code;
  return error;
}

function uniqueIntegers(values) {
  return [...new Set((values || []).map(Number).filter(Number.isInteger))].sort((a, b) => a - b);
}

function orderedUniqueIntegers(values) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    const number = Number(value);
    if (!Number.isInteger(number) || seen.has(number)) continue;
    seen.add(number);
    result.push(number);
  }
  return result;
}

function uniquePositiveIntegers(values) {
  return uniqueIntegers(values).filter(value => value > 0);
}

function optionalPositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function numberCell(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function objectPackCell(object) {
  const packCell = numberCell(object?.packCell);
  if (packCell !== null) return packCell;
  return numberCell(object?.cell);
}

function objectBurgId(object) {
  const id = Number(object?.burgId ?? object?.i ?? object?.id);
  return Number.isInteger(id) && id >= 0 ? id : 0;
}

function isLand(height) {
  return Number(height) >= WATER_LEVEL;
}

function uniqueCollections(...collections) {
  return collections.filter(Array.isArray).filter((collection, index, all) => all.indexOf(collection) === index);
}

function countBy(values, keyOf) {
  const result = {};
  for (const value of values) {
    const key = keyOf(value);
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function countPositive(values) {
  let result = 0;
  for (const value of values || []) if (Number(value) > 0) result++;
  return result;
}

function cloneArrayLike(value) {
  if (value === undefined || value === null) return null;
  return value.slice ? value.slice() : [...value];
}

function clonePlain(value) {
  if (value === undefined) return undefined;
  return value === null ? null : JSON.parse(JSON.stringify(value));
}
