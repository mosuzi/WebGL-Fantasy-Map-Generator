import {createGenerationSummary} from "../generator/index.js";
import {extractFeatures} from "../generator/features.js";
import {buildPack} from "../generator/pack.js";
import {
  isSettlementWaterRoutePathValid,
  rebuildSettlementRouteMirrors,
  synchronizeRelocatedRoutePath,
  traceSettlementRoutePath,
  traceSettlementWaterRoutePath
} from "../generator/settlements.js";
import {
  GRID_STRUCTURE_SCHEMA,
  createGridStructureSnapshot,
  fingerprintGridStructure,
  gridFromStructureDocument,
  refineGridTopology,
  summarizeGridStructure,
  validateGridStructureDocument
} from "../generator/grid-refinement.js";
import {reconcileSettlementCellIdentity} from "./settlement-cell-index.js";
import {reconcileSettlementPortTopology} from "./settlement-port-topology.js";
import {OBJECT_KIND} from "./object-kinds.js";
import {deleteObjectNote} from "./object-notes.js";

export const GRID_TOPOLOGY_API_VERSION = "1.0.0";

export function getGridStructureSummary(map, revisionTracker = null) {
  assertMap(map);
  return {
    apiVersion: GRID_TOPOLOGY_API_VERSION,
    binding: currentBinding(map, revisionTracker),
    ...summarizeGridStructure(map.grid)
  };
}

export function getGridStructureSnapshot(map, revisionTracker = null) {
  assertMap(map);
  return createGridStructureSnapshot(map.grid, currentBinding(map, revisionTracker));
}

export function inspectGridStructureWrite(map, revisionTracker, document) {
  assertMap(map);
  const binding = currentBinding(map, revisionTracker);
  const validation = validateGridStructureDocument(document, binding);
  if (validation.valid && document.points.length !== map.grid.points.length) {
    validation.valid = false;
    validation.errors.push("受控结构写入不得改变 cell 数；扩展网格必须使用 grid.inspectRefinement / grid.refine");
    validation.summary = null;
  }
  const inspection = {
    action: "grid.applyWrite",
    valid: validation.valid,
    errors: validation.errors,
    binding,
    source: summarizeGridStructure(map.grid),
    target: validation.summary,
    schema: GRID_STRUCTURE_SCHEMA
  };
  inspection.inspectionToken = inspectionToken(inspection);
  return inspection;
}

export function inspectGridRefinement(map, revisionTracker, options = {}) {
  assertMap(map);
  const sourceCells = map.grid.points.length;
  const targetCells = normalizeTarget(options.targetCells ?? 100_000, sourceCells);
  const binding = currentBinding(map, revisionTracker);
  const inspection = {
    action: "grid.refine",
    valid: true,
    errors: [],
    binding,
    schema: GRID_STRUCTURE_SCHEMA,
    source: summarizeGridStructure(map.grid),
    target: {
      cells: targetCells,
      addedCells: targetCells - sourceCells,
      expectedChildrenPerMother: round(targetCells / sourceCells, 3),
      algorithm: "topology-preserving-cell-refinement"
    },
    invariants: [
      "保留全部旧 Grid Cell 编号与高度",
      "新邻接只连接同母或原邻接母 cell",
      "新高度不跨越母 cell 海陆符号",
      "feature / pack 重建并迁移对象引用"
    ]
  };
  inspection.inspectionToken = inspectionToken(inspection);
  return inspection;
}

export function prepareGridStructureWrite(map, revisionTracker, document, options = {}, taskContext = null) {
  checkpointGridPreparation(taskContext, "inspect-structure");
  const inspection = inspectGridStructureWrite(map, revisionTracker, document);
  assertAuthorizedInspection(inspection, options, "grid.applyWrite");
  const oldGrid = map.grid;
  checkpointGridPreparation(taskContext, "build-controlled-grid", {cells: document?.points?.length || 0});
  const grid = gridFromStructureDocument(document, oldGrid);
  preserveProjectedFields(oldGrid, grid);
  return prepareTopologyReplacement(map, grid, {
    action: "grid.applyWrite",
    sourceFingerprint: inspection.source.fingerprint,
    inspectionToken: inspection.inspectionToken
  }, taskContext);
}

export function prepareGridRefinement(map, revisionTracker, options = {}, taskContext = null) {
  checkpointGridPreparation(taskContext, "inspect-refinement");
  const inspection = inspectGridRefinement(map, revisionTracker, options);
  assertAuthorizedInspection(inspection, options, "grid.refine");
  checkpointGridPreparation(taskContext, "refine-grid", {sourceCells: map.grid.points.length, targetCells: inspection.target.cells});
  const refined = refineGridTopology(map.grid, inspection.target.cells, taskContext);
  return prepareTopologyReplacement(map, refined.grid, {
    action: "grid.refine",
    sourceFingerprint: inspection.source.fingerprint,
    inspectionToken: inspection.inspectionToken,
    refinement: refined.report
  }, taskContext);
}

export function commitPreparedGridTopology(map, prepared) {
  assertMap(map);
  if (!prepared?.map || prepared.sourceMap !== map) throw codedError("grid-preparation-invalid", "网格写入准备结果不属于当前地图");
  replaceMapContents(map, prepared.map);
  reconcileSettlementCellIdentity(map);
  return prepared.result;
}

function prepareTopologyReplacement(map, nextGrid, context, taskContext = null) {
  checkpointGridPreparation(taskContext, "clone-map", {sourceCells: map.grid.points.length, targetCells: nextGrid.points.length});
  const startedAt = performance.now();
  const working = structuredClone(map);
  checkpointGridPreparation(taskContext, "clone-map-complete");
  reconcileSettlementCellIdentity(working);
  const oldGrid = working.grid;
  const oldPack = working.pack;
  const oldFeatures = working.features;
  working.grid = nextGrid;

  checkpointGridPreparation(taskContext, "features");
  const features = extractFeatures(working.grid, {preserveHeights: true});
  transferFeatureMetadata(oldFeatures?.features, features.features, oldGrid, working.grid);
  working.features = features;

  checkpointGridPreparation(taskContext, "pack");
  const generatedPack = buildPack(working.grid, features);
  projectPackCellFields(oldGrid, oldPack, working.grid, generatedPack);
  const packFeatureTransfer = transferPackFeatureMetadata(oldPack?.features, generatedPack.features, oldGrid, oldPack, working.grid, generatedPack);
  working.pack = {
    ...(oldPack || {}),
    ...generatedPack,
    metadata: {...(oldPack?.metadata || {}), ...generatedPack.metadata, topologyRefined: true}
  };
  working.options = {...(working.options || {}), cellsTarget: working.grid.points.length};

  checkpointGridPreparation(taskContext, "migrate-spatial-references");
  const waterFeatureMigration = migrateWaterFeatureReferences(working, packFeatureTransfer.waterRedirects);
  let portTopology;
  const migration = migrateSpatialReferences(working, {oldGrid, oldPack, newGrid: working.grid, newPack: working.pack}, {
    beforeRoutes: () => {
      reconcileSettlementCellIdentity(working);
      portTopology = reconcileSettlementPortTopology(working, {
        mode: "refine",
        unresolvedPortCityIds: waterFeatureMigration.unresolvedCityIds
      });
      return portTopology;
    },
    unresolvedRouteIds: waterFeatureMigration.unresolvedRouteIds
  });
  migration.waterFeatures = waterFeatureMigration.report;
  migration.portTopology = portTopology;
  markGridRoutesFresh(working);
  checkpointGridPreparation(taskContext, "refresh-summary");
  refreshMapMetadataAndSummary(working);
  working.metadata.gridRefinement = {
    version: GRID_TOPOLOGY_API_VERSION,
    action: context.action,
    sourceFingerprint: context.sourceFingerprint,
    targetFingerprint: fingerprintGridStructure(working.grid),
    sourceCells: oldGrid.points.length,
    targetCells: working.grid.points.length,
    completedAt: new Date().toISOString()
  };
  const result = {
    executed: true,
    action: context.action,
    source: {cells: oldGrid.points.length, packCells: oldPack?.cells?.i?.length || 0, fingerprint: context.sourceFingerprint},
    target: {cells: working.grid.points.length, packCells: working.pack.cells.i.length, fingerprint: working.metadata.gridRefinement.targetFingerprint},
    refinement: context.refinement || null,
    migration,
    feature: {
      count: working.features.features.filter(Boolean).length,
      coastlineSegments: working.features.shore?.coastline?.length || 0,
      lakeShoreSegments: working.features.shore?.lakeShore?.length || 0
    },
    prepareMs: round(performance.now() - startedAt, 2),
    inspectionToken: context.inspectionToken
  };
  checkpointGridPreparation(taskContext, "complete", {targetCells: working.grid.points.length, packCells: working.pack.cells.i.length});
  return {sourceMap: map, map: working, result};
}

function checkpointGridPreparation(context, stage, detail = {}) {
  if (!context) return;
  if (context.signal?.aborted) throw gridPreparationAbortError(context.signal.reason, stage);
  context.checkpoint?.({phase: "grid-topology-prepare", stage, ...detail});
  if (context.signal?.aborted) throw gridPreparationAbortError(context.signal.reason, stage);
  context.report?.("grid-topology-prepare", {stage, ...detail});
}

function gridPreparationAbortError(reason, stage) {
  const error = codedError("grid-preparation-aborted", String(reason || `网格准备已在 ${stage} 阶段取消`), {stage});
  error.name = "AbortError";
  return error;
}

function markGridRoutesFresh(map) {
  const remaining = (map?.metadata?.derivedStale?.systems || []).filter(system => system !== "routes");
  if (remaining.length) map.metadata.derivedStale = {...map.metadata.derivedStale, systems: remaining};
  else if (map?.metadata) delete map.metadata.derivedStale;
}

function projectPackCellFields(oldGrid, oldPack, newGrid, newPack) {
  if (!oldPack?.cells) return;
  const reserved = new Set(["i", "c", "v", "p", "g", "h", "area", "f", "t", "type", "haven", "harbor", "state", "province", "region", "culture", "religion", "biome", "temp", "prec", "pop", "burg"]);
  const oldCount = oldPack.cells.i?.length || oldPack.cells.g?.length || 0;
  const mother = newGrid.refinement?.mother;
  for (const [key, values] of Object.entries(oldPack.cells)) {
    if (reserved.has(key) || !values || typeof values.length !== "number" || values.length !== oldCount || typeof values === "string") continue;
    const projected = new Array(newPack.cells.i.length);
    for (let packCell = 0; packCell < projected.length; packCell++) {
      const gridCell = newPack.cells.g[packCell];
      const oldGridCell = mother?.[gridCell] ?? Math.min(gridCell, oldGrid.points.length - 1);
      const oldPackCell = oldGrid.cells.pack?.[oldGridCell];
      projected[packCell] = oldPackCell >= 0 ? cloneValue(values[oldPackCell]) : defaultFieldValue(values);
    }
    newPack.cells[key] = projected;
  }
}

function preserveProjectedFields(oldGrid, newGrid) {
  const count = oldGrid.points.length;
  if (newGrid.points.length !== count) return;
  const reserved = new Set(["i", "c", "v", "p", "h", "b", "pack", "t", "f"]);
  for (const [key, values] of Object.entries(oldGrid.cells)) {
    if (reserved.has(key) || !values || typeof values.length !== "number" || values.length !== count || typeof values === "string") continue;
    newGrid.cells[key] = Array.from(values, cloneValue);
  }
}

function transferFeatureMetadata(oldFeatures, newFeatures, oldGrid, newGrid) {
  if (!Array.isArray(oldFeatures) || !Array.isArray(newFeatures)) return;
  const mapped = new Map();
  for (let oldCell = 0; oldCell < oldGrid.points.length; oldCell++) {
    const oldId = Number(oldGrid.cells.f?.[oldCell]) || 0;
    const newId = Number(newGrid.cells.f?.[oldCell]) || 0;
    if (oldId && newId && !mapped.has(newId)) mapped.set(newId, oldId);
  }
  for (const [newId, oldId] of mapped) {
    const oldFeature = oldFeatures[oldId];
    const next = newFeatures[newId];
    if (!oldFeature || !next) continue;
    newFeatures[newId] = {...cloneValue(oldFeature), ...next, id: newId, i: newId, cells: next.cells};
  }
}

function transferPackFeatureMetadata(oldFeatures, newFeatures, oldGrid, oldPack, newGrid, newPack) {
  const empty = {waterRedirects: new Map()};
  if (!Array.isArray(oldFeatures) || !Array.isArray(newFeatures) || !oldPack?.cells) return empty;
  const overlapsByNew = new Map();
  const overlapsByOld = new Map();
  for (let oldCell = 0; oldCell < oldGrid.points.length; oldCell++) {
    const oldPackCell = oldGrid.cells.pack?.[oldCell];
    const newPackCell = newGrid.cells.pack?.[oldCell];
    if (!(oldPackCell >= 0) || !(newPackCell >= 0)) continue;
    const oldId = Number(oldPack.cells.f?.[oldPackCell]) || 0;
    const newId = Number(newPack.cells.f?.[newPackCell]) || 0;
    if (!oldId || !newId) continue;
    incrementOverlap(overlapsByNew, newId, oldId);
    incrementOverlap(overlapsByOld, oldId, newId);
  }
  for (const [newId, counts] of overlapsByNew) {
    const oldId = dominantOverlap(counts);
    const oldFeature = oldFeatures[oldId];
    const next = newFeatures[newId];
    if (!oldFeature || !next) continue;
    newFeatures[newId] = {...cloneValue(oldFeature), ...next, id: newId, i: newId, cells: next.cells};
  }
  const waterRedirects = selectUniqueWaterFeatureRedirects(oldFeatures, newFeatures, overlapsByOld, overlapsByNew);
  return {waterRedirects};
}

export function selectUniqueWaterFeatureRedirects(oldFeatures, newFeatures, overlapsByOld, overlapsByNew = null) {
  const candidates = new Map();
  for (const [oldId, counts] of overlapsByOld || []) {
    const newId = uniqueDominantOverlap(counts);
    if (!newId) continue;
    if (overlapsByNew && uniqueDominantOverlap(overlapsByNew.get(newId)) !== Number(oldId)) continue;
    if (!isWaterFeature(oldFeatures?.[oldId]) || !isWaterFeature(newFeatures?.[newId])) continue;
    candidates.set(Number(oldId), newId);
  }
  const reverse = new Map();
  for (const [oldId, newId] of candidates) {
    const owners = reverse.get(newId) || [];
    owners.push(oldId);
    reverse.set(newId, owners);
  }
  return new Map([...candidates].filter(([, newId]) => reverse.get(newId)?.length === 1));
}

function uniqueDominantOverlap(counts) {
  const ordered = [...(counts || [])].sort((left, right) => right[1] - left[1] || left[0] - right[0]);
  if (!ordered.length || ordered[0][1] === ordered[1]?.[1]) return 0;
  return Number(ordered[0][0]);
}

function incrementOverlap(store, ownerId, targetId) {
  const counts = store.get(ownerId) || new Map();
  counts.set(targetId, (counts.get(targetId) || 0) + 1);
  store.set(ownerId, counts);
}

function dominantOverlap(counts) {
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0] - right[0])[0]?.[0] || 0;
}

function isWaterFeature(feature) {
  return Boolean(feature && !feature.removed && (feature.land === false || feature.type === "ocean" || feature.type === "lake"));
}

function migrateWaterFeatureReferences(map, redirects) {
  const report = {mappedPorts: 0, mappedRoutes: 0, mappedLocks: 0, unresolvedPorts: 0, conflictingPortMirrors: 0};
  const unresolvedCityIds = new Set();
  const unresolvedRouteIds = new Set();
  const lockedRouteIds = lockedObjectIds(map, OBJECT_KIND.ROUTE);
  for (const city of map?.settlements?.cities || []) {
    if (!city || city.removed) continue;
    const burg = map.pack?.burgs?.[Number(city.burgId)];
    const cityPort = Number(city.port || 0);
    const burgPort = Number(burg?.port || 0);
    if (cityPort > 0 && burgPort > 0 && cityPort !== burgPort) {
      report.unresolvedPorts++;
      report.conflictingPortMirrors++;
      unresolvedCityIds.add(Number(city.id));
      continue;
    }
    const oldId = cityPort || burgPort;
    if (!oldId) continue;
    const nextId = redirects.get(oldId);
    if (nextId) {
      if (nextId !== oldId) report.mappedPorts++;
      if (cityPort > 0) city.port = nextId;
      if (burg && burgPort > 0) burg.port = nextId;
    } else {
      report.unresolvedPorts++;
      unresolvedCityIds.add(Number(city.id));
    }
  }
  for (const route of map?.settlements?.routes || []) {
    if (route?.type !== "searoute") continue;
    const nextId = redirects.get(Number(route.feature));
    if (!nextId) {
      const routeId = Number(route.id ?? route.i);
      if (lockedRouteIds.has(routeId)) {
        throw codedError("regeneration_lock_conflict", `锁定海路 #${routeId} 的水体在细分后缺少唯一空间映射`, {
          reason: "locked-searoute-water-feature-unmapped",
          routeId,
          feature: Number(route.feature)
        });
      }
      unresolvedRouteIds.add(Number(route.id));
      continue;
    }
    if (nextId !== Number(route.feature)) report.mappedRoutes++;
    route.feature = nextId;
  }
  for (const entry of map?.regenerationLocks?.entries || []) {
    if (entry?.kind !== "feature") continue;
    const nextId = redirects.get(Number(entry.id));
    if (!nextId) throw codedError("grid-water-feature-unmapped", `锁定水体 #${entry.id} 在细分后缺少唯一空间映射`);
    if (nextId !== Number(entry.id)) report.mappedLocks++;
    entry.id = nextId;
  }
  for (const item of map.pack?.portDiagnostics?.features || []) {
    const nextId = redirects.get(Number(item?.feature));
    if (nextId) item.feature = nextId;
  }
  return {
    report: {...report, redirects: redirects.size},
    unresolvedCityIds,
    unresolvedRouteIds
  };
}

function migrateSpatialReferences(map, {oldGrid, oldPack, newGrid, newPack}, options = {}) {
  const report = {cities: 0, burgs: 0, markers: 0, stateCenters: 0, provinceCenters: 0, routes: 0, routesRerouted: 0, routesRemoved: 0, rivers: 0, zones: 0, invalid: []};
  const toGrid = packCell => {
    const cell = Number(packCell);
    return Number.isInteger(cell) && cell >= 0 && cell < (oldPack?.cells?.g?.length || 0) ? Number(oldPack.cells.g[cell]) : -1;
  };
  const toPack = gridCell => {
    const cell = Number(gridCell);
    const direct = Number.isInteger(cell) ? Number(newGrid.cells.pack?.[cell]) : -1;
    if (direct >= 0) return direct;
    return nearestPackCell(newPack, pointForGridCell(newGrid, cell));
  };
  const remapObject = (object, kind) => {
    if (!object || object.removed) return;
    const gridCell = Number.isInteger(Number(object.cell)) && Number(object.cell) < oldGrid.points.length ? Number(object.cell) : toGrid(object.packCell);
    if (gridCell >= 0) {
      if (Object.prototype.hasOwnProperty.call(object, "cell")) object.cell = gridCell;
      if (Object.prototype.hasOwnProperty.call(object, "packCell")) object.packCell = toPack(gridCell);
      if (object.data && Object.prototype.hasOwnProperty.call(object.data, "packCell")) object.data.packCell = toPack(gridCell);
      report[kind]++;
    }
  };

  const remapBurg = burg => {
    if (!burg || burg.removed) return;
    const oldPackCell = Number(burg.cell ?? burg.packCell);
    const gridCell = toGrid(oldPackCell);
    if (gridCell < 0) return;
    const packCell = toPack(gridCell);
    burg.cell = packCell;
    if (Object.prototype.hasOwnProperty.call(burg, "packCell")) burg.packCell = packCell;
    report.burgs++;
  };

  for (const city of map.settlements?.cities || []) remapObject(city, "cities");
  for (const burg of new Set([...(map.settlements?.burgs || []), ...(map.pack?.burgs || [])])) remapBurg(burg);
  for (const marker of map.markers?.markers || []) remapObject(marker, "markers");
  for (const state of map.politics?.states || []) remapCenter(state, "stateCenters", toGrid, toPack, report);
  for (const province of map.politics?.provinces || []) remapCenter(province, "provinceCenters", toGrid, toPack, report);

  const routes = map.settlements?.routes || map.routes?.routes || [];
  const lockedRouteIds = lockedObjectIds(map, OBJECT_KIND.ROUTE);
  const routePlans = routes.map(route => prepareRefinedRoutePath(map, route, {
    oldGrid,
    oldPack,
    newGrid,
    newPack,
    toPack,
    locked: lockedRouteIds.has(Number(route?.id ?? route?.i))
  }));

  const portTopology = typeof options.beforeRoutes === "function" ? options.beforeRoutes() : null;
  const touchedCityIds = new Set([...(portTopology?.movedCityIds || []), ...(portTopology?.clearedCityIds || [])].map(Number));
  const unresolvedRouteIds = new Set([...(options.unresolvedRouteIds || [])].map(Number));
  const retainedRoutes = [];
  for (const plan of routePlans) {
    const {route, locked, originalFrom, originalTo} = plan;
    let packCells = plan.packCells;
    if (plan.invalid) {
      removeRefinedRoute(map, route, locked, report, plan.invalid);
      continue;
    }
    const fromCity = activeCityById(map, originalFrom);
    const toCity = activeCityById(map, originalTo);
    const endpointTouched = touchedCityIds.has(Number(originalFrom)) || touchedCityIds.has(Number(originalTo));
    const featureUnresolved = unresolvedRouteIds.has(Number(route.id));
    const endpointMismatch = routeEndpointMismatch(fromCity, toCity, packCells, originalFrom, originalTo);
    if (route.type === "searoute" && (fromCity && !Number(fromCity.port) || toCity && !Number(toCity.port))) {
      removeRefinedRoute(map, route, locked, report, "port-cleared");
      continue;
    }
    const pathInvalid = !isMappedRoutePathValid(newPack, route.type, packCells);
    if (locked) {
      if (endpointTouched || featureUnresolved || endpointMismatch || pathInvalid) {
        throw codedError("regeneration_lock_conflict", `锁定道路 #${route.id} 在网格细分后无法保持端点与路径`, {
          reason: endpointMismatch ? "locked-route-endpoint-mismatch" : pathInvalid ? "locked-route-path-invalid" : "locked-route-topology-changed",
          routeId: Number(route.id)
        });
      }
      retainedRoutes.push(route);
      report.routes++;
      continue;
    }
    if (endpointTouched || featureUnresolved || endpointMismatch || pathInvalid) {
      const start = fromCity ? Number(fromCity.packCell) : Number(packCells[0]);
      const end = toCity ? Number(toCity.packCell) : Number(packCells.at(-1));
      const seaFeature = route.type === "searoute" ? commonSeaRouteFeature(fromCity, toCity) : 0;
      packCells = route.type === "searoute"
        ? seaFeature > 0 ? traceSettlementWaterRoutePath(newPack, start, end, {maxVisited: newPack.cells.i.length}) : []
        : traceSettlementRoutePath(newPack, start, end, {maxVisited: newPack.cells.i.length});
      if (packCells.length < 2 || !isMappedRoutePathValid(newPack, route.type, packCells)) {
        removeRefinedRoute(map, route, false, report, "route-unreachable");
        continue;
      }
      if (route.type === "searoute") route.feature = seaFeature;
      report.routesRerouted++;
    }
    if (!synchronizeRelocatedRoutePath(newPack, map.settlements?.cities || [], route, packCells)) {
      removeRefinedRoute(map, route, false, report, "route-synchronization-failed");
      continue;
    }
    retainedRoutes.push(route);
    report.routes++;
  }
  if (map.settlements?.routes) {
    map.settlements.routes.splice(0, map.settlements.routes.length, ...retainedRoutes);
    const routeSummary = rebuildSettlementRouteMirrors(newPack, map.settlements.routes);
    map.settlements.metadata ||= {};
    map.settlements.metadata.routes = routeSummary.routes;
    map.settlements.metadata.routeSegments = routeSummary.segments;
  }
  for (const river of map.rivers?.rivers || []) {
    const oldPath = normalizeGridPath(river.gridCells?.length ? river.gridCells : river.cells, oldPack, oldGrid, Boolean(river.gridCells?.length));
    if (!oldPath.length) continue;
    river.gridCells = expandRefinedPath(oldPath, oldGrid, newGrid);
    river.cells = compact(river.gridCells.map(toPack).filter(cell => cell >= 0));
    river.sourceGrid = river.gridCells[0];
    river.mouthGrid = river.gridCells.at(-1);
    river.source = river.cells[0];
    river.mouth = river.cells.at(-1);
    report.rivers++;
  }
  for (const zone of map.zones?.zones || []) {
    if (!Array.isArray(zone?.cells)) continue;
    zone.cells = compact(zone.cells.map(toGrid).map(toPack).filter(cell => cell >= 0));
    report.zones++;
  }
  return report;
}

function prepareRefinedRoutePath(map, route, {oldGrid, oldPack, newGrid, newPack, toPack, locked}) {
  const routeId = Number(route?.id ?? route?.i);
  const originalFrom = Number(route?.from);
  const originalTo = Number(route?.to);
  const oldPath = normalizeGridPath(route?.cells, oldPack, oldGrid);
  if (!oldPath.length) return {route, locked, originalFrom, originalTo, packCells: [], invalid: "missing-grid-path"};
  const mappedGridPath = expandRefinedPath(oldPath, oldGrid, newGrid);
  let packCells = compact(mappedGridPath.map(toPack).filter(cell => cell >= 0));
  if (packCells.length < 2) return {route, locked, originalFrom, originalTo, packCells, invalid: "missing-pack-path"};
  if (!synchronizeRelocatedRoutePath(newPack, map.settlements?.cities || [], route, packCells, {preserveEndpointIdentity: true})) {
    return {route, locked, originalFrom, originalTo, packCells, invalid: "route-synchronization-failed"};
  }
  const fromCity = activeCityById(map, originalFrom);
  const toCity = activeCityById(map, originalTo);
  if (locked && (routeEndpointMismatch(fromCity, toCity, packCells, originalFrom, originalTo)
    || !isMappedRoutePathValid(newPack, route.type, packCells))) {
    const start = fromCity ? Number(fromCity.packCell) : Number(packCells[0]);
    const end = toCity ? Number(toCity.packCell) : Number(packCells.at(-1));
    const migrated = route.type === "searoute"
      ? traceSettlementWaterRoutePath(newPack, start, end, {maxVisited: newPack.cells.i.length})
      : traceSettlementRoutePath(newPack, start, end, {maxVisited: newPack.cells.i.length});
    if (migrated.length < 2
      || !synchronizeRelocatedRoutePath(newPack, map.settlements?.cities || [], route, migrated, {preserveEndpointIdentity: true})
      || routeEndpointMismatch(fromCity, toCity, migrated, originalFrom, originalTo)
      || !isMappedRoutePathValid(newPack, route.type, migrated)) {
      throw codedError("regeneration_lock_conflict", `锁定道路 #${routeId} 在网格细分后无法保持正式路径`, {
        reason: "locked-route-path-invalid",
        routeId
      });
    }
    packCells = migrated;
  }
  return {route, locked, originalFrom, originalTo, packCells, invalid: null};
}

function routeEndpointMismatch(fromCity, toCity, packCells, fromId, toId) {
  const hasFrom = Number.isInteger(Number(fromId)) && Number(fromId) >= 0;
  const hasTo = Number.isInteger(Number(toId)) && Number(toId) >= 0;
  if (hasFrom && (!fromCity || Number(fromCity.packCell) !== Number(packCells[0]))) return true;
  if (hasTo && (!toCity || Number(toCity.packCell) !== Number(packCells.at(-1)))) return true;
  return false;
}

function isMappedRoutePathValid(pack, type, packCells) {
  if (!Array.isArray(packCells) || packCells.length < 2) return false;
  const count = pack?.cells?.i?.length || 0;
  for (let index = 0; index < packCells.length; index++) {
    const cell = Number(packCells[index]);
    if (!Number.isInteger(cell) || cell < 0 || cell >= count) return false;
    if (index > 0 && !(pack.cells.c?.[packCells[index - 1]] || []).includes(cell)) return false;
    if (type !== "searoute" && Number(pack.cells.h?.[cell]) < 20) return false;
  }
  return type !== "searoute" || isSettlementWaterRoutePathValid(pack, packCells);
}

function commonSeaRouteFeature(fromCity, toCity) {
  const fromPort = Number(fromCity?.port || 0);
  const toPort = Number(toCity?.port || 0);
  if (fromPort > 0 && toPort > 0 && fromPort !== toPort) return 0;
  return fromPort > 0 ? fromPort : toPort > 0 ? toPort : 0;
}

function removeRefinedRoute(map, route, locked, report, reason) {
  const routeId = Number(route?.id ?? route?.i);
  if (locked) {
    throw codedError("regeneration_lock_conflict", `锁定道路 #${routeId} 在网格细分后无法保留`, {
      reason: `locked-route-${reason}`,
      routeId
    });
  }
  deleteObjectNote(map, {kind: OBJECT_KIND.ROUTE, id: routeId});
  report.routesRemoved++;
}

function lockedObjectIds(map, kind) {
  return new Set((map?.regenerationLocks?.entries || [])
    .filter(entry => entry?.kind === kind)
    .map(entry => Number(entry.id))
    .filter(id => Number.isInteger(id) && id >= 0));
}

function activeCityById(map, value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 0) return null;
  const city = map?.settlements?.cities?.[id];
  return city && !city.removed && Number(city.id) === id ? city : null;
}

function remapCenter(object, key, toGrid, toPack, report) {
  if (!object || object.removed) return;
  const gridCell = Number.isInteger(Number(object.gridCenter)) ? Number(object.gridCenter) : toGrid(object.center);
  if (gridCell < 0) return;
  object.gridCenter = gridCell;
  object.center = toPack(gridCell);
  report[key]++;
}

function normalizeGridPath(path, oldPack, oldGrid, alreadyGrid = true) {
  if (!Array.isArray(path)) return [];
  const result = [];
  for (const value of path) {
    const cell = Number(value);
    const gridCell = alreadyGrid ? cell : Number(oldPack?.cells?.g?.[cell]);
    if (Number.isInteger(gridCell) && gridCell >= 0 && gridCell < oldGrid.points.length && result.at(-1) !== gridCell) result.push(gridCell);
  }
  return result;
}

function expandRefinedPath(path, sourceGrid, grid) {
  if (!grid.refinement?.mother || path.length < 2) return [...path];
  const sourcePath = completeSourcePath(path, sourceGrid);
  const result = [sourcePath[0]];
  for (let index = 1; index < sourcePath.length; index++) {
    const segment = constrainedShortestPath(grid, result.at(-1), sourcePath[index]);
    if (segment.length) result.push(...segment.slice(1));
    else if (result.at(-1) !== sourcePath[index]) result.push(sourcePath[index]);
  }
  return compact(result);
}

function completeSourcePath(path, grid) {
  const result = [path[0]];
  for (let index = 1; index < path.length; index++) {
    const start = result.at(-1);
    const end = path[index];
    if (start === end) continue;
    if (grid.cells.c[start]?.includes(end)) {
      result.push(end);
      continue;
    }
    const segment = shortestGridPath(grid, start, end);
    if (segment.length) result.push(...segment.slice(1));
    else result.push(end);
  }
  return compact(result);
}

function shortestGridPath(grid, start, end) {
  const queue = [start];
  const previous = new Map([[start, -1]]);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const cell = queue[cursor];
    for (const neighbor of grid.cells.c[cell] || []) {
      if (previous.has(neighbor)) continue;
      previous.set(neighbor, cell);
      if (neighbor === end) return reconstructPath(previous, end);
      queue.push(neighbor);
    }
  }
  return [];
}

function constrainedShortestPath(grid, start, end) {
  if (start === end) return [start];
  const mother = grid.refinement.mother;
  const allowedMothers = new Set([mother[start], mother[end]]);
  const queue = [start];
  const previous = new Map([[start, -1]]);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const cell = queue[cursor];
    for (const neighbor of grid.cells.c[cell] || []) {
      if (previous.has(neighbor) || !allowedMothers.has(mother[neighbor])) continue;
      previous.set(neighbor, cell);
      if (neighbor === end) return reconstructPath(previous, end);
      queue.push(neighbor);
    }
  }
  return [];
}

function reconstructPath(previous, end) {
  const path = [];
  for (let cell = end; cell !== -1; cell = previous.get(cell)) path.push(cell);
  return path.reverse();
}

function refreshMapMetadataAndSummary(map) {
  map.metadata = map.metadata || {};
  map.metadata.cellsTarget = map.grid.points.length;
  map.metadata.gridCells = map.grid.points.length;
  map.metadata.packCells = map.pack.cells.i.length;
  map.metadata.featureCount = map.features.features.filter(Boolean).length;
  map.summary = createGenerationSummary(map.options, map.grid, map.features, map.climate, map.society, map.politics, map.settlements, map.markers, map.pack, map.rivers, map.layers, map.military, map.zones, map.economy, map.diplomacy);
  map.metadata.checksum = map.summary.checksum;
}

function currentBinding(map, revisionTracker) {
  const revision = revisionTracker?.getSnapshot?.() || {};
  return {
    mapIdentity: revision.mapIdentity ?? null,
    mapRevision: Number(revision.mapRevision) || 0,
    sourceFingerprint: fingerprintGridStructure(map.grid)
  };
}

function assertAuthorizedInspection(inspection, options, action) {
  if (!inspection.valid) throw codedError("grid-structure-invalid", inspection.errors.slice(0, 3).join("；"), inspection);
  if (options?.confirm !== true) throw codedError("confirmation_required", `${action} 需要 options.confirm === true`);
  if (!options?.inspectionToken) throw codedError("inspection_required", `${action} 需要最新预检令牌`);
  if (options.inspectionToken !== inspection.inspectionToken) throw codedError("inspection_stale", `${action} 预检令牌已过期`);
}

function inspectionToken(inspection) {
  const input = `${inspection.action}|${inspection.binding.mapIdentity}|${inspection.binding.mapRevision}|${inspection.binding.sourceFingerprint}|${inspection.target?.cells || 0}|${inspection.target?.vertices || 0}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `grid-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function replaceMapContents(target, source) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, source);
}

function nearestPackCell(pack, point) {
  if (!point || !pack?.cells?.p?.length) return -1;
  let best = -1;
  let distance = Infinity;
  for (let cell = 0; cell < pack.cells.p.length; cell++) {
    const candidate = pack.cells.p[cell];
    const next = (candidate[0] - point[0]) ** 2 + (candidate[1] - point[1]) ** 2;
    if (next < distance) {
      best = cell;
      distance = next;
    }
  }
  return best;
}

function pointForGridCell(grid, cell) {
  return Number.isInteger(cell) && cell >= 0 && cell < grid.points.length ? grid.points[cell] : null;
}

function defaultFieldValue(values) {
  return ArrayBuffer.isView(values) ? 0 : null;
}

function compact(values) {
  return values.filter((value, index) => index === 0 || value !== values[index - 1]);
}

function normalizeTarget(value, sourceCells) {
  const target = Number(value);
  if (!Number.isInteger(target) || target <= sourceCells || target > 200_000) throw codedError("invalid-target", `targetCells 必须是 ${sourceCells + 1}～200000 的整数`);
  return target;
}

function assertMap(map) {
  if (!map?.grid?.points || !map?.pack?.cells) throw codedError("map-not-ready", "当前地图尚未准备好");
}

function cloneValue(value) {
  if (value === null || typeof value !== "object") return value;
  return structuredClone(value);
}

function round(value, digits = 0) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function codedError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  if (details) error.details = details;
  return error;
}
