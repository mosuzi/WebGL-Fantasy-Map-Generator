import {
  deriveRelocatedSettlement,
  inspectRelocatedSettlementPort,
  isSettlementWaterRoutePathValid,
  traceSettlementWaterRoutePath
} from "../generator/settlements.js";
import {OBJECT_KIND} from "./object-kinds.js";
import {reconcileSettlementCellIdentity} from "./settlement-cell-index.js";

export const SETTLEMENT_PORT_TOPOLOGY_VERSION = 1;

export function diagnoseSettlementPortTopology(map, options = {}) {
  const plan = inspectSettlementPortTopology(map, {...options, mode: "load"});
  recordSettlementPortTopologyReport(map, plan.report);
  if (plan.report.invalid || plan.report.conflicts) markRoutesStale(map);
  return plan.report;
}

export function reconcileSettlementPortTopology(map, options = {}) {
  const mode = options.mode === "refine" ? "refine" : "routes";
  const plan = inspectSettlementPortTopology(map, {...options, mode});
  if (!plan.patches.length) {
    recordSettlementPortTopologyReport(map, plan.report);
    return plan.report;
  }
  applySettlementPortTopologyPlan(map, plan);
  return plan.report;
}

export function inspectSettlementPortTopology(map, options = {}) {
  const mode = options.mode === "load" ? "load" : options.mode === "refine" ? "refine" : "routes";
  const repairProtectedDerived = options.repairProtectedDerived === true;
  const unresolvedPortCityIds = new Set([...(options.unresolvedPortCityIds || [])].map(Number));
  const cities = activeCities(map);
  const lockContext = readPortTopologyLocks(map);
  if (!cities.length) {
    if (mode !== "load") {
      assertLockedSeaRoutesCompatible(map, lockContext, new Map());
      return emptyPlan(mode);
    }
    try {
      assertLockedSeaRoutesCompatible(map, lockContext, new Map());
      return emptyPlan(mode);
    } catch (error) {
      return emptyPlan(mode, error);
    }
  }
  const occupiedPackCells = new Set(cities.map(city => Number(city.packCell)));
  const records = [];
  const byCityId = new Map();

  for (const city of cities) {
    const burg = map.pack?.burgs?.[Number(city.burgId)];
    if (!burg || burg.removed) continue;
    const cityPort = Number(city.port || 0);
    const burgPort = Number(burg.port || 0);
    if (!cityPort && !burgPort) continue;
    const port = cityPort || burgPort;
    const placement = inspectPortAtCell(map, city, burg, Number(city.packCell), port);
    const ambiguous = cityPort > 0 && burgPort > 0 && cityPort !== burgPort;
    const syncable = !ambiguous
      && (cityPort > 0) !== (burgPort > 0)
      && Number(placement.port) === port
      && isActiveWaterFeature(map.pack, port)
      && !unresolvedPortCityIds.has(Number(city.id));
    const exact = cityPort > 0
      && cityPort === burgPort
      && Number(placement.port) === port
      && isActiveWaterFeature(map.pack, port)
      && !unresolvedPortCityIds.has(Number(city.id));
    const locked = lockContext.lockedCityIds.has(Number(city.id)) || lockContext.lockedRouteEndpointIds.has(Number(city.id));
    const record = {
      city,
      burg,
      cityId: Number(city.id),
      burgId: Number(city.burgId),
      port,
      cityPort,
      burgPort,
      currentPackCell: Number(city.packCell),
      currentGridCell: Number(city.cell),
      placement,
      unresolved: unresolvedPortCityIds.has(Number(city.id)),
      ambiguous,
      syncable,
      exact,
      duplicate: false,
      valid: exact,
      reason: unresolvedPortCityIds.has(Number(city.id))
        ? "unmapped-water-feature"
        : ambiguous
          ? "port-mirror-conflict"
          : syncable
            ? "port-mirror-missing"
            : exact
              ? "valid"
              : port
                ? "invalid-port-anchor"
                : "port-mirror-mismatch",
      locked,
      candidates: []
    };
    records.push(record);
    byCityId.set(record.cityId, record);
  }

  resolveDuplicatePortCellOwners(records);

  const invalidRecords = records.filter(record => !record.valid);
  if (mode === "load") {
    const report = createReport(mode, records, invalidRecords, [], [], invalidRecords.filter(record => record.locked), []);
    return {mode, records, patches: [], report};
  }

  assertLockedSeaRoutesCompatible(map, lockContext, byCityId);
  const lockedInvalid = invalidRecords.filter(record => record.locked);
  if (lockedInvalid.length && !repairProtectedDerived) {
    throw portTopologyConflict("锁定城镇或锁定路线端点的港口拓扑已失效，无法自动迁移", {
      reason: "protected-port-invalid",
      cityIds: lockedInvalid.map(record => record.cityId)
    });
  }

  const syncableRecords = invalidRecords.filter(record => record.syncable);
  const protectedClearable = repairProtectedDerived ? lockedInvalid.filter(record => !record.syncable) : [];
  const movable = invalidRecords.filter(record => !record.syncable && !record.locked);
  const candidateIndex = indexPortCandidateCells(map);
  for (const record of movable) {
    record.candidates = buildPortCandidates(map, record, occupiedPackCells, candidateIndex);
  }

  const forced = new Map();
  let assignments = matchPortCandidates(movable, forced);
  const reachability = ensureReachablePortPairs(map, records, movable, assignments, forced);
  assignments = reachability.assignments;

  const patches = syncableRecords.map(record => createPortMirrorSyncPatch(map, record));
  const synced = syncableRecords.map(record => record.cityId);
  const moved = [];
  const cleared = protectedClearable.map(record => record.cityId);
  for (const record of protectedClearable) patches.push(createPortPatch(map, record, null));
  for (const record of movable) {
    const candidate = assignments.get(record.cityId) || null;
    if (candidate) {
      patches.push(createPortPatch(map, record, candidate));
      moved.push(record.cityId);
    } else {
      patches.push(createPortPatch(map, record, null));
      cleared.push(record.cityId);
    }
  }

  assertNoDuplicatePlannedPortCells(records, patches);
  if (!repairProtectedDerived) assertPatchesDoNotTouchLocks(patches, lockContext);
  const skipped = [];
  const report = createReport(mode, records, invalidRecords, moved, cleared, [], skipped, reachability, synced);
  return {mode, records, patches, report};
}

export function applySettlementPortTopologyPlan(map, plan) {
  if (!plan?.patches?.length) return plan?.report || null;
  const snapshot = capturePortTopologyApplySnapshot(map, plan.patches);
  try {
    for (const patch of plan.patches) {
      restoreObjectValue(patch.city, patch.nextCity);
      restoreObjectValue(patch.burg, patch.nextBurg);
    }
    reconcileSettlementCellIdentity(map);
    synchronizeMovedPoliticalCenters(map, plan.patches);
    synchronizeMovedMarkets(map, plan.patches);
    if (map.settlements?.metadata) {
      map.settlements.metadata.ports = activeCities(map).filter(city => Number(city.port) > 0).length;
    }
    recordSettlementPortTopologyReport(map, plan.report);
    markPortTopologyDerivedStale(map);
  } catch (error) {
    restorePortTopologyApplySnapshot(map, snapshot);
    throw error;
  }
}

function emptyPlan(mode, lockError = null) {
  const lockConflictReason = lockError?.details?.reason || lockError?.code || "";
  return {
    mode,
    records: [],
    patches: [],
    report: {
      version: SETTLEMENT_PORT_TOPOLOGY_VERSION,
      mode,
      inspected: 0,
      valid: 0,
      invalid: 0,
      syncable: 0,
      synced: 0,
      moved: 0,
      cleared: 0,
      skipped: 0,
      conflicts: lockError ? 1 : 0,
      lockConflicts: lockError ? 1 : 0,
      lockConflictReasons: lockConflictReason ? [lockConflictReason] : [],
      reachableFeatures: 0,
      degradedFeatures: 0,
      movedCityIds: [],
      syncedCityIds: [],
      clearedCityIds: [],
      skippedCityIds: [],
      conflictCityIds: []
    }
  };
}

function createReport(mode, records, invalid, moved, cleared, conflicts, skipped, reachability = {}, synced = []) {
  return {
    version: SETTLEMENT_PORT_TOPOLOGY_VERSION,
    mode,
    inspected: records.length,
    valid: records.length - invalid.length,
    invalid: invalid.length,
    syncable: invalid.filter(record => record.syncable).length,
    synced: synced.length,
    moved: moved.length,
    cleared: cleared.length,
    skipped: skipped.length,
    conflicts: conflicts.length,
    lockConflicts: 0,
    lockConflictReasons: [],
    reachableFeatures: reachability.reachableFeatures || 0,
    degradedFeatures: reachability.degradedFeatures || 0,
    movedCityIds: [...moved].sort((a, b) => a - b),
    syncedCityIds: [...synced].sort((a, b) => a - b),
    clearedCityIds: [...cleared].sort((a, b) => a - b),
    skippedCityIds: skipped.map(record => record.cityId).sort((a, b) => a - b),
    conflictCityIds: conflicts.map(record => record.cityId).sort((a, b) => a - b)
  };
}

function activeCities(map) {
  return (map?.settlements?.cities || [])
    .filter(city => city && !city.removed)
    .sort((left, right) => Number(left.id) - Number(right.id));
}

function resolveDuplicatePortCellOwners(records) {
  const byPackCell = new Map();
  for (const record of records) {
    if (!record.exact && !record.syncable) continue;
    const group = byPackCell.get(record.currentPackCell) || [];
    group.push(record);
    byPackCell.set(record.currentPackCell, group);
  }
  for (const group of byPackCell.values()) {
    if (group.length < 2) continue;
    const [owner, ...duplicates] = [...group].sort(comparePortCellOwners);
    owner.duplicate = false;
    for (const record of duplicates) {
      record.duplicate = true;
      record.valid = false;
      record.syncable = false;
      record.reason = "duplicate-port-cell";
    }
  }
}

function comparePortCellOwners(left, right) {
  return Number(Boolean(right.exact && right.locked)) - Number(Boolean(left.exact && left.locked))
    || Number(Boolean(right.exact)) - Number(Boolean(left.exact))
    || Number(Boolean(right.syncable)) - Number(Boolean(left.syncable))
    || left.cityId - right.cityId;
}

function inspectPortAtCell(map, city, burg, packCell, port) {
  return inspectRelocatedSettlementPort(map.grid, map.pack, packCell, {
    wasPort: port,
    capital: Boolean(city.capital || burg.capital),
    burgId: Number(city.burgId),
    options: map.options || {}
  });
}

function buildPortCandidates(map, record, occupiedPackCells, candidateIndex) {
  if (record.unresolved || record.ambiguous || !(record.port > 0) || !isActiveWaterFeature(map.pack, record.port)) return [];
  const pack = map.pack;
  const sourcePackCell = record.currentPackCell;
  const sourceMother = motherOfGridCell(map.grid, record.currentGridCell);
  const sourceFeature = Number(pack.cells.f?.[sourcePackCell]);
  const sourceState = Number(pack.cells.state?.[sourcePackCell] || 0);
  const sourceProvince = Number(pack.cells.province?.[sourcePackCell] || 0);
  const origin = [Number(record.city.x), Number(record.city.y)];
  const candidates = [];

  const bucket = candidateIndex.get(portCandidateBucketKey(sourceMother, sourceFeature, sourceState, sourceProvince)) || [];
  for (const packCell of bucket) {
    if (occupiedPackCells.has(packCell) || Number(pack.cells.h?.[packCell]) < 20) continue;
    const gridCell = Number(pack.cells.g?.[packCell]);
    const mother = motherOfGridCell(map.grid, gridCell);
    if (mother !== sourceMother) continue;
    const layer = 0;
    if (Number(pack.cells.f?.[packCell]) !== sourceFeature
      || Number(pack.cells.state?.[packCell] || 0) !== sourceState
      || Number(pack.cells.province?.[packCell] || 0) !== sourceProvince) continue;
    const placement = inspectPortAtCell(map, record.city, record.burg, packCell, record.port);
    if (Number(placement.port) !== record.port || !isActiveWaterFeature(pack, placement.port)) continue;
    const anchor = normalizedPoint(placement.anchor, pack.cells.p?.[packCell]);
    const distance = Math.hypot(anchor[0] - origin[0], anchor[1] - origin[1]);
    candidates.push({
      cityId: record.cityId,
      packCell,
      gridCell,
      layer,
      distance,
      port: Number(placement.port),
      routePackCell: Number(placement.routePackCell ?? packCell),
      anchor,
      harbor: Number(pack.cells.harbor?.[packCell] || 0),
      placement
    });
  }

  return candidates.sort(comparePortCandidates);
}

function indexPortCandidateCells(map) {
  const index = new Map();
  const pack = map.pack;
  for (let packCell = 0; packCell < (pack?.cells?.i?.length || 0); packCell++) {
    if (Number(pack.cells.h?.[packCell]) < 20) continue;
    const gridCell = Number(pack.cells.g?.[packCell]);
    const key = portCandidateBucketKey(
      motherOfGridCell(map.grid, gridCell),
      Number(pack.cells.f?.[packCell]),
      Number(pack.cells.state?.[packCell] || 0),
      Number(pack.cells.province?.[packCell] || 0)
    );
    const bucket = index.get(key) || [];
    bucket.push(packCell);
    index.set(key, bucket);
  }
  return index;
}

function portCandidateBucketKey(mother, feature, state, province) {
  return `${mother}:${feature}:${state}:${province}`;
}

function comparePortCandidates(left, right) {
  return left.layer - right.layer
    || left.distance - right.distance
    || right.harbor - left.harbor
    || left.packCell - right.packCell
    || left.cityId - right.cityId;
}

function motherOfGridCell(grid, gridCell) {
  const mother = Number(grid?.refinement?.mother?.[gridCell]);
  return Number.isInteger(mother) && mother >= 0 ? mother : Number(gridCell);
}

function matchPortCandidates(records, forced) {
  const byId = new Map(records.map(record => [record.cityId, record]));
  const assignedByCell = new Map();
  const assignments = new Map();
  const forcedCityIds = new Set(forced.keys());
  for (const [cityId, packCell] of forced) {
    const candidate = byId.get(cityId)?.candidates.find(item => item.packCell === packCell);
    if (!candidate || assignedByCell.has(packCell)) throw portTopologyConflict("港口候选强制匹配发生冲突", {reason: "forced-candidate-conflict", cityId, packCell});
    assignments.set(cityId, candidate);
    assignedByCell.set(packCell, cityId);
  }

  const ordered = [...records]
    .filter(record => !forcedCityIds.has(record.cityId))
    .sort((left, right) => left.candidates.length - right.candidates.length || left.cityId - right.cityId);
  for (const record of ordered) augmentPortCandidate(record.cityId, byId, assignedByCell, assignments, forcedCityIds, new Set());
  return assignments;
}

function augmentPortCandidate(cityId, byId, assignedByCell, assignments, forcedCityIds, visitedCells) {
  const record = byId.get(cityId);
  for (const candidate of record?.candidates || []) {
    if (visitedCells.has(candidate.packCell)) continue;
    visitedCells.add(candidate.packCell);
    const owner = assignedByCell.get(candidate.packCell);
    if (owner === undefined || !forcedCityIds.has(owner) && augmentPortCandidate(owner, byId, assignedByCell, assignments, forcedCityIds, visitedCells)) {
      assignments.set(cityId, candidate);
      assignedByCell.set(candidate.packCell, cityId);
      return true;
    }
  }
  assignments.delete(cityId);
  return false;
}

function ensureReachablePortPairs(map, records, movable, initialAssignments, forced) {
  const validRecords = records.filter(record => record.valid || record.syncable);
  const features = new Set([
    ...validRecords.map(record => record.port),
    ...movable.flatMap(record => record.candidates.map(candidate => candidate.port))
  ]);
  const pathCache = new Map();
  let assignments = initialAssignments;
  let reachableFeatures = 0;
  let degradedFeatures = 0;

  for (const feature of [...features].sort((a, b) => a - b)) {
    const selected = selectedPortOptions(feature, validRecords, assignments);
    if (findReachablePortPair(map.pack, selected, pathCache)) {
      reachableFeatures++;
      continue;
    }
    const possible = possiblePortOptions(feature, validRecords, movable);
    const pair = findReachablePortPair(map.pack, possible, pathCache);
    if (!pair) {
      if (possible.length >= 2) degradedFeatures++;
      continue;
    }
    for (const option of pair) {
      if (!option.fixed) forced.set(option.cityId, option.packCell);
    }
    assignments = matchPortCandidates(movable, forced);
    if (!findReachablePortPair(map.pack, selectedPortOptions(feature, validRecords, assignments), pathCache)) {
      throw portTopologyConflict("存在可达港口组合，但稳定匹配未能保留该水体的海路入口", {reason: "reachable-pair-lost", feature});
    }
    reachableFeatures++;
  }
  return {assignments, reachableFeatures, degradedFeatures};
}

function selectedPortOptions(feature, validRecords, assignments) {
  return [
    ...validRecords.filter(record => record.port === feature).map(record => ({cityId: record.cityId, packCell: record.currentPackCell, fixed: true})),
    ...[...assignments.values()].filter(candidate => candidate.port === feature).map(candidate => ({cityId: candidate.cityId, packCell: candidate.packCell, fixed: false}))
  ].sort(comparePortOptions);
}

function possiblePortOptions(feature, validRecords, movable) {
  return [
    ...validRecords.filter(record => record.port === feature).map(record => ({cityId: record.cityId, packCell: record.currentPackCell, fixed: true})),
    ...movable.flatMap(record => record.candidates.filter(candidate => candidate.port === feature).map(candidate => ({cityId: record.cityId, packCell: candidate.packCell, fixed: false})))
  ].sort(comparePortOptions);
}

function comparePortOptions(left, right) {
  return Number(right.fixed) - Number(left.fixed) || left.cityId - right.cityId || left.packCell - right.packCell;
}

function findReachablePortPair(pack, options, cache) {
  for (let left = 0; left < options.length; left++) {
    for (let right = left + 1; right < options.length; right++) {
      const a = options[left];
      const b = options[right];
      if (a.cityId === b.cityId || a.packCell === b.packCell) continue;
      const key = a.packCell < b.packCell ? `${a.packCell}:${b.packCell}` : `${b.packCell}:${a.packCell}`;
      let reachable = cache.get(key);
      if (reachable === undefined) {
        reachable = traceSettlementWaterRoutePath(pack, a.packCell, b.packCell).length > 1;
        cache.set(key, reachable);
      }
      if (reachable) return [a, b];
    }
  }
  return null;
}

function createPortMirrorSyncPatch(map, record) {
  const nextCity = structuredClone(record.city);
  const nextBurg = structuredClone(record.burg);
  const cityManualVisual = record.city.visual?.manual ? structuredClone(record.city.visual) : null;
  const burgManualVisual = record.burg.visual?.manual ? structuredClone(record.burg.visual) : null;
  nextCity.port = record.port;
  nextBurg.port = record.port;
  deriveRelocatedSettlement(map.pack, nextCity, nextBurg);
  Object.assign(nextCity, {
    cell: record.city.cell,
    packCell: record.city.packCell,
    x: record.city.x,
    y: record.city.y
  });
  Object.assign(nextBurg, {
    cell: record.burg.cell,
    x: record.burg.x,
    y: record.burg.y
  });
  copyExactProperty(nextCity, record.city, "coa");
  copyExactProperty(nextBurg, record.burg, "coa");
  if (Object.prototype.hasOwnProperty.call(record.burg, "packCell")) nextBurg.packCell = record.burg.packCell;
  if (cityManualVisual) nextCity.visual = cityManualVisual;
  if (burgManualVisual) nextBurg.visual = burgManualVisual;
  return {
    action: "sync",
    cityId: record.cityId,
    burgId: record.burgId,
    sourcePackCell: record.currentPackCell,
    targetPackCell: record.currentPackCell,
    city: record.city,
    burg: record.burg,
    nextCity,
    nextBurg
  };
}

function copyExactProperty(target, source, key) {
  if (Object.prototype.hasOwnProperty.call(source, key)) target[key] = structuredClone(source[key]);
  else delete target[key];
}

function createPortPatch(map, record, candidate) {
  const nextCity = structuredClone(record.city);
  const nextBurg = structuredClone(record.burg);
  const cityVisual = record.city.visual?.manual ? structuredClone(record.city.visual) : null;
  const burgVisual = record.burg.visual?.manual ? structuredClone(record.burg.visual) : null;
  const sourcePackCell = record.currentPackCell;
  if (candidate) {
    Object.assign(nextCity, {
      cell: candidate.gridCell,
      packCell: candidate.packCell,
      x: candidate.anchor[0],
      y: candidate.anchor[1],
      state: Number(map.pack.cells.state?.[candidate.packCell] || 0),
      province: Number(map.pack.cells.province?.[candidate.packCell] || 0),
      culture: Number(map.pack.cells.culture?.[candidate.packCell] || 0),
      religion: Number(map.pack.cells.religion?.[candidate.packCell] || 0),
      port: candidate.port
    });
    Object.assign(nextBurg, {
      cell: candidate.packCell,
      x: candidate.anchor[0],
      y: candidate.anchor[1],
      state: nextCity.state,
      province: nextCity.province,
      culture: nextCity.culture,
      religion: nextCity.religion,
      port: candidate.port
    });
  } else {
    nextCity.port = 0;
    nextBurg.port = 0;
  }
  deriveRelocatedSettlement(map.pack, nextCity, nextBurg);
  if (cityVisual) nextCity.visual = cityVisual;
  if (burgVisual) nextBurg.visual = burgVisual;
  synchronizeCoaPoint(nextCity, nextCity.x, nextCity.y);
  synchronizeCoaPoint(nextBurg, nextBurg.x, nextBurg.y);
  return {
    action: candidate ? "move" : "clear",
    cityId: record.cityId,
    burgId: record.burgId,
    sourcePackCell,
    targetPackCell: Number(nextCity.packCell),
    city: record.city,
    burg: record.burg,
    nextCity,
    nextBurg
  };
}

function synchronizeCoaPoint(object, x, y) {
  if (!object?.coa || typeof object.coa !== "object") return;
  object.coa.x = Number(x);
  object.coa.y = Number(y);
}

function assertNoDuplicatePlannedPortCells(records, patches) {
  const patchByCity = new Map(patches.map(patch => [patch.cityId, patch]));
  const owners = new Map();
  for (const record of records) {
    const patch = patchByCity.get(record.cityId);
    const port = Number(patch?.nextCity.port ?? record.city.port ?? 0);
    if (!port) continue;
    const cell = Number(patch?.nextCity.packCell ?? record.city.packCell);
    if (owners.has(cell)) throw portTopologyConflict("两个港口不能占用同一个 pack cell", {reason: "duplicate-port-cell", packCell: cell, cityIds: [owners.get(cell), record.cityId]});
    owners.set(cell, record.cityId);
  }
}

function readPortTopologyLocks(map) {
  const entries = Array.isArray(map?.regenerationLocks?.entries) ? map.regenerationLocks.entries : [];
  const lockedCityIds = new Set();
  const lockedRouteIds = new Set();
  for (const entry of entries) {
    const id = Number(entry?.id);
    if (!Number.isInteger(id) || id < 0) continue;
    if (entry.kind === OBJECT_KIND.CITY) lockedCityIds.add(id);
    if (entry.kind === OBJECT_KIND.ROUTE) lockedRouteIds.add(id);
  }
  const lockedRoutes = (map?.settlements?.routes || []).filter(route => lockedRouteIds.has(Number(route?.id ?? route?.i)));
  const lockedRouteEndpointIds = new Set();
  for (const route of lockedRoutes) {
    for (const value of [route.from, route.to]) {
      const id = Number(value);
      if (Number.isInteger(id) && id >= 0 && map?.settlements?.cities?.[id] && !map.settlements.cities[id].removed) lockedRouteEndpointIds.add(id);
    }
  }
  return {lockedCityIds, lockedRouteIds, lockedRoutes, lockedRouteEndpointIds};
}

function assertPatchesDoNotTouchLocks(patches, lockContext) {
  const touched = patches.filter(patch => lockContext.lockedCityIds.has(patch.cityId) || lockContext.lockedRouteEndpointIds.has(patch.cityId));
  if (!touched.length) return;
  throw portTopologyConflict("港口迁移会改变锁定城镇或锁定路线端点", {reason: "protected-port-write", cityIds: touched.map(patch => patch.cityId)});
}

function assertLockedSeaRoutesCompatible(map, lockContext, recordsByCityId) {
  for (const route of lockContext.lockedRoutes) {
    if (route.type !== "searoute") continue;
    const feature = Number(route.feature || 0);
    if (!isActiveWaterFeature(map.pack, feature)) {
      throw portTopologyConflict(`锁定海路 #${route.id} 的水体已失效`, {reason: "locked-searoute-feature-invalid", routeId: Number(route.id), feature});
    }
    const fromId = Number(route.from);
    const toId = Number(route.to);
    const hasFrom = Number.isInteger(fromId) && fromId >= 0;
    const hasTo = Number.isInteger(toId) && toId >= 0;
    const fromRecord = hasFrom ? recordsByCityId.get(fromId) : null;
    const toRecord = hasTo ? recordsByCityId.get(toId) : null;
    if (hasFrom && !fromRecord || hasTo && !toRecord) {
      throw portTopologyConflict(`锁定海路 #${route.id} 的端点不是活动港口`, {reason: "locked-searoute-endpoint-invalid", routeId: Number(route.id)});
    }
    for (const record of [fromRecord, toRecord].filter(Boolean)) {
      if (!record?.valid || record.port !== feature) {
        throw portTopologyConflict(`锁定海路 #${route.id} 的端点港口已失效`, {reason: "locked-searoute-endpoint-invalid", routeId: Number(route.id), cityId: record?.cityId ?? null});
      }
    }
    if (fromRecord && Number(route.packCells?.[0]) !== fromRecord.currentPackCell) {
      throw portTopologyConflict(`锁定海路 #${route.id} 的起点 cell 与城镇不一致`, {reason: "locked-searoute-endpoint-mismatch", routeId: Number(route.id), side: "from"});
    }
    if (toRecord && Number(route.packCells?.at(-1)) !== toRecord.currentPackCell) {
      throw portTopologyConflict(`锁定海路 #${route.id} 的终点 cell 与城镇不一致`, {reason: "locked-searoute-endpoint-mismatch", routeId: Number(route.id), side: "to"});
    }
    if (!isSettlementWaterRoutePathValid(map.pack, route.packCells)) {
      throw portTopologyConflict(`锁定海路 #${route.id} 的正式水路已失效`, {reason: "locked-searoute-path-invalid", routeId: Number(route.id)});
    }
    if (fromRecord && toRecord) {
      if (traceSettlementWaterRoutePath(map.pack, fromRecord.currentPackCell, toRecord.currentPackCell).length < 2) {
        throw portTopologyConflict(`锁定海路 #${route.id} 的端点之间不再可航`, {reason: "locked-searoute-unreachable", routeId: Number(route.id)});
      }
    }
  }
}

function isActiveWaterFeature(pack, featureId) {
  const id = Number(featureId);
  const feature = pack?.features?.[id];
  if (!Number.isInteger(id) || id <= 0 || !feature || feature.removed) return false;
  return feature.land === false || feature.type === "ocean" || feature.type === "lake";
}

function capturePortTopologyApplySnapshot(map, patches) {
  const cityStates = patches.map(patch => captureObjectState(patch.city));
  const burgStates = patches.map(patch => captureObjectState(patch.burg));
  const burgIds = new Set(patches.map(patch => patch.burgId));
  const politicalStates = distinctObjects([
    ...(map.politics?.states || []),
    ...(map.pack?.states || []),
    ...(map.politics?.provinces || []),
    ...(map.pack?.provinces || [])
  ].filter(object => object && (burgIds.has(Number(object.capital)) || burgIds.has(Number(object.burg))))).map(captureObjectState);
  const markets = distinctObjects(allMarkets(map).filter(market => burgIds.has(Number(market?.centerBurgId)))).map(captureObjectState);
  const marketCells = new Set(patches.flatMap(patch => [patch.sourcePackCell, patch.targetPackCell]));
  return {
    cityStates,
    burgStates,
    politicalStates,
    markets,
    gridBurg: map.grid?.cells?.burg,
    packBurg: map.pack?.cells?.burg,
    packMarket: captureSlots(map.pack?.cells?.market, marketCells),
    settlementsMetadata: captureProperty(map.settlements, "metadata"),
    mapMetadata: captureProperty(map, "metadata"),
    systemMetadata: ["economy", "diplomacy", "military", "zones"].map(key => captureProperty(map[key], "metadata")).filter(Boolean)
  };
}

function restorePortTopologyApplySnapshot(map, snapshot) {
  for (const state of snapshot.cityStates) restoreObjectValue(state.target, state.value);
  for (const state of snapshot.burgStates) restoreObjectValue(state.target, state.value);
  for (const state of snapshot.politicalStates) restoreObjectValue(state.target, state.value);
  for (const state of snapshot.markets) restoreObjectValue(state.target, state.value);
  if (map.grid?.cells) map.grid.cells.burg = snapshot.gridBurg;
  if (map.pack?.cells) map.pack.cells.burg = snapshot.packBurg;
  restoreSlots(snapshot.packMarket);
  restoreProperty(snapshot.settlementsMetadata);
  restoreProperty(snapshot.mapMetadata);
  for (const state of snapshot.systemMetadata) restoreProperty(state);
  reconcileSettlementCellIdentity(map);
}

function synchronizeMovedPoliticalCenters(map, patches) {
  for (const patch of patches) {
    if (patch.action !== "move") continue;
    const city = patch.city;
    const burgId = patch.burgId;
    for (const states of distinctObjects([map.politics?.states, map.pack?.states])) {
      for (const state of states || []) {
        if (!state || state.removed || Number(state.capital) !== burgId) continue;
        state.center = Number(city.packCell);
        state.gridCenter = Number(city.cell);
        state.capitalName = city.name || patch.burg.name || state.capitalName;
      }
    }
    for (const provinces of distinctObjects([map.politics?.provinces, map.pack?.provinces])) {
      for (const province of provinces || []) {
        if (!province || province.removed || Number(province.burg) !== burgId) continue;
        province.center = Number(city.packCell);
        province.gridCenter = Number(city.cell);
      }
    }
  }
}

function synchronizeMovedMarkets(map, patches) {
  const touched = new Set();
  for (const patch of patches) {
    if (patch.action !== "move") continue;
    touched.add(patch.sourcePackCell);
    touched.add(patch.targetPackCell);
    for (const market of allMarkets(map)) {
      if (Number(market?.centerBurgId) !== patch.burgId) continue;
      market.cell = patch.targetPackCell;
      market.x = Number(patch.city.x);
      market.y = Number(patch.city.y);
      market.state = Number(patch.city.state || 0);
      market.name = `${patch.city.name || patch.burg.name || "港城"}市`;
    }
  }
  for (const cell of touched) updateMarketCellRepresentative(map, cell);
}

function allMarkets(map) {
  return distinctObjects([...(map?.pack?.markets || []), ...(map?.economy?.markets || [])].filter(Boolean));
}

function updateMarketCellRepresentative(map, packCell) {
  if (!map.pack?.cells?.market) return;
  const ids = allMarkets(map)
    .filter(market => Number(market.cell) === Number(packCell) && Number(market.centerBurgId) > 0)
    .map(market => Number(market.i ?? market.id))
    .filter(id => Number.isInteger(id) && id > 0)
    .sort((a, b) => a - b);
  map.pack.cells.market[packCell] = ids[0] || 0;
}

function recordSettlementPortTopologyReport(map, report) {
  map.metadata ||= {};
  map.metadata.compatibility ||= {};
  const current = map.metadata.compatibility.settlementPortTopology;
  if (JSON.stringify(current) === JSON.stringify(report)) return false;
  map.metadata.compatibility.settlementPortTopology = structuredClone(report);
  return true;
}

function markRoutesStale(map) {
  map.metadata ||= {};
  const systems = [...new Set([...(map.metadata.derivedStale?.systems || []), "routes"])];
  map.metadata.derivedStale = {...(map.metadata.derivedStale || {}), systems};
}

function markPortTopologyDerivedStale(map) {
  map.metadata ||= {};
  const systems = [...new Set([...(map.metadata.derivedStale?.systems || []), "routes", "economy", "diplomacy", "military", "zones", "population-points"])];
  map.metadata.derivedStale = {...(map.metadata.derivedStale || {}), systems};
  for (const key of ["economy", "diplomacy", "military", "zones"]) {
    if (!map[key]) continue;
    map[key].metadata ||= {};
    map[key].metadata.stale = true;
  }
}

function portTopologyConflict(message, details) {
  const error = new Error(message);
  error.code = "regeneration_lock_conflict";
  error.details = {domain: "settlement-port-topology", ...details};
  return error;
}

function normalizedPoint(value, fallback = [0, 0]) {
  const x = Number(value?.[0]);
  const y = Number(value?.[1]);
  if (Number.isFinite(x) && Number.isFinite(y)) return [x, y];
  return [Number(fallback?.[0]) || 0, Number(fallback?.[1]) || 0];
}

function captureObjectState(target) {
  return {target, value: structuredClone(target)};
}

function restoreObjectValue(target, value) {
  if (!target || typeof target !== "object") return;
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, structuredClone(value));
}

function captureProperty(owner, key) {
  if (!owner) return null;
  const exists = Object.prototype.hasOwnProperty.call(owner, key);
  return {owner, key, exists, value: exists ? structuredClone(owner[key]) : undefined, reference: exists ? owner[key] : undefined};
}

function restoreProperty(state) {
  if (!state?.owner) return;
  if (!state.exists) delete state.owner[state.key];
  else if (state.reference && typeof state.reference === "object") {
    restoreObjectValue(state.reference, state.value);
    state.owner[state.key] = state.reference;
  } else state.owner[state.key] = state.value;
}

function captureSlots(array, cells) {
  if (!array) return null;
  return {array, entries: [...cells].map(cell => [cell, array[cell]])};
}

function restoreSlots(snapshot) {
  if (!snapshot) return;
  for (const [cell, value] of snapshot.entries) snapshot.array[cell] = value;
}

function distinctObjects(values) {
  return [...new Set(values.filter(value => value && typeof value === "object"))];
}
