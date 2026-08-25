const WATER_LEVEL = 20;

export function prepareRiverRegenerationLocks(pack, lockedRivers = []) {
  const locked = (lockedRivers || []).map(clone);
  if (!locked.length) return emptyContext();
  const current = pack?.rivers || [];
  const byId = new Map(current.filter(Boolean).map(river => [riverId(river), river]));
  const lockedIds = new Set(locked.map(riverId));
  const frozenById = new Map(locked.map(river => [riverId(river), river]));

  for (const river of locked) validateLockedRiver(pack, river, byId);
  for (const river of locked) {
    let currentRiver = river;
    const seen = new Set();
    while (currentRiver) {
      const id = riverId(currentRiver);
      if (seen.has(id)) throw conflict(river, "parent_cycle", "锁定河流父链存在循环");
      seen.add(id);
      for (const supportId of [Number(currentRiver.parent || 0), Number(currentRiver.basin || 0)]) {
        if (!supportId || supportId === id || frozenById.has(supportId)) continue;
        const support = byId.get(supportId);
        if (!support) throw conflict(river, "missing_support_river", `锁定河流缺少父链支撑河流 #${supportId}`);
        validateLockedRiver(pack, support, byId);
        frozenById.set(supportId, clone(support));
      }
      currentRiver = Number(currentRiver.parent || 0) ? byId.get(Number(currentRiver.parent)) : null;
    }
  }

  const frozenIds = new Set(frozenById.keys());
  const frozenCells = captureFrozenCells(pack?.cells, frozenById.values());
  const lakeGuards = captureLakeGuards(pack?.features, frozenIds);
  return {
    lockedIds,
    frozenIds,
    frozenRivers: [...frozenById.values()].map(clone),
    frozenCells,
    lakeGuards
  };
}

export function seedFrozenRiverState(context, cells, riverPaths, riverParents) {
  for (const river of context?.frozenRivers || []) {
    riverPaths.set(riverId(river), [...(river.cells || [])]);
    if (Number(river.parent || 0)) riverParents.set(riverId(river), Number(river.parent));
  }
  seedFrozenRiverCells(context, cells);
}

export function seedFrozenRiverCells(context, cells) {
  for (const [cell, values] of context?.frozenCells || []) {
    cells.r[cell] = values.r;
    cells.fl[cell] = values.fl;
    cells.conf[cell] = values.conf;
  }
}

export function isFrozenRiverCell(context, cell) {
  return context?.frozenCells?.has(Number(cell)) || false;
}

export function nextAvailableRiverId(reservedIds, start = 1) {
  let id = Math.max(1, Number(start) || 1);
  while (reservedIds.has(id)) id += 1;
  reservedIds.add(id);
  return id;
}

export function initializeGuardedLakeReferences(pack, context) {
  if (!context?.frozenIds?.size) return;
  for (const lake of pack?.features || []) {
    if (!lake || lake.type !== "lake") continue;
    const guard = context.lakeGuards.get(Number(lake.i ?? lake.id));
    if (guard?.river) lake.river = guard.river;
    else delete lake.river;
    if (guard?.outlet) lake.outlet = guard.outlet;
    else delete lake.outlet;
    if (guard?.inlets?.length) lake.inlets = [...guard.inlets];
    else delete lake.inlets;
    delete lake.enteringFlux;
  }
}

export function frozenLakeGuard(context, lake) {
  return context?.lakeGuards?.get(Number(lake?.i ?? lake?.id)) || null;
}

export function assertFrozenRiverState(pack, rivers, context) {
  const byId = new Map((rivers || []).map(river => [riverId(river), river]));
  for (const frozen of context?.frozenRivers || []) {
    const current = byId.get(riverId(frozen));
    if (!current || JSON.stringify(current) !== JSON.stringify(frozen)) {
      throw conflict(frozen, "frozen_snapshot_changed", `锁定河流或支撑河流 #${riverId(frozen)} 在重生成中被改写`);
    }
  }
  for (const [cell, values] of context?.frozenCells || []) {
    if (Number(pack.cells.r[cell]) !== values.r || Number(pack.cells.fl[cell]) !== values.fl || Number(pack.cells.conf[cell]) !== values.conf) {
      throw conflict(null, "frozen_cell_changed", `锁定河流成员 cell #${cell} 的 r/fl/conf 被改写`, {cell});
    }
  }
  for (const [lakeId, guard] of context?.lakeGuards || []) {
    const lake = (pack?.features || []).find(feature => Number(feature?.i ?? feature?.id) === lakeId);
    if (!lake || lake.type !== "lake") throw conflict(null, "missing_locked_lake", `锁定河流关联的湖泊 #${lakeId} 已不存在`);
    if (guard.river && Number(lake.river) !== guard.river) throw conflict(null, "frozen_lake_river_changed", `湖泊 #${lakeId} 的冻结主入流引用被改写`);
    if (guard.outlet && Number(lake.outlet) !== guard.outlet) throw conflict(null, "frozen_lake_outlet_changed", `湖泊 #${lakeId} 的冻结出口引用被改写`);
    for (const inlet of guard.inlets) {
      if (!(lake.inlets || []).map(Number).includes(inlet)) throw conflict(null, "frozen_lake_inlet_changed", `湖泊 #${lakeId} 的冻结入流 #${inlet} 被移除`);
    }
  }
  if (context?.frozenIds?.size) {
    for (const lake of (pack?.features || []).filter(feature => feature?.type === "lake")) {
      for (const inlet of lake.inlets || []) {
        const river = byId.get(Number(inlet));
        if (!river || river.outletKind !== "lake" || Number(river.outletFeatureId) !== Number(lake.i ?? lake.id)) {
          throw conflict(river, "invalid_lake_inlet_binding", `湖泊 #${lake.i ?? lake.id} 包含无效入流引用 #${inlet}`);
        }
      }
    }
  }
}

function validateLockedRiver(pack, river, byId) {
  const id = riverId(river);
  const path = river?.cells;
  if (!Number.isInteger(id) || id <= 0) throw conflict(river, "invalid_river_id", "锁定河流缺少有效 ID");
  if (!Array.isArray(path) || path.length < 2) throw conflict(river, "invalid_path", `锁定河流 #${id} 路径不足`);
  const source = path.find(cell => Number.isInteger(cell) && cell >= 0);
  if (!Number.isInteger(source) || source >= Number(pack?.cells?.i?.length || 0)) {
    throw conflict(river, "invalid_source", `锁定河流 #${id} 的源头越界`);
  }
  for (let index = 0; index < path.length - 1; index++) {
    const from = path[index];
    const to = path[index + 1];
    if (to === -1 && index === path.length - 2 && Number(pack?.cells?.b?.[from])) continue;
    if (!Number.isInteger(from) || from < 0 || !Number.isInteger(to) || to < 0 || !(pack?.cells?.c?.[from] || []).includes(to)) {
      throw conflict(river, "disconnected_path", `锁定河流 #${id} 包含不连续路径`);
    }
  }
  const parent = Number(river.parent || 0);
  if (parent) {
    const receiver = byId.get(parent);
    if (!receiver || parent === id) throw conflict(river, "invalid_parent", `锁定河流 #${id} 的父河引用无效`);
    const mouth = lastLandCell(path, pack.cells);
    const receiverIndex = (receiver.cells || []).lastIndexOf(mouth);
    if (receiverIndex < 0 || receiverIndex >= receiver.cells.length - 1) {
      throw conflict(river, "disconnected_parent", `锁定支流 #${id} 未在父河 #${parent} 的有效汇流点接入`);
    }
  }
  const basin = Number(river.basin || id);
  if (basin !== id && !byId.has(basin)) throw conflict(river, "invalid_basin", `锁定河流 #${id} 的流域根河引用无效`);
  let root = river;
  const parentSeen = new Set();
  while (Number(root.parent || 0)) {
    if (parentSeen.has(riverId(root))) throw conflict(river, "parent_cycle", `锁定河流 #${id} 的父链存在循环`);
    parentSeen.add(riverId(root));
    root = byId.get(Number(root.parent));
    if (!root) throw conflict(river, "invalid_parent", `锁定河流 #${id} 的父链引用无效`);
  }
  if (riverId(root) !== basin) throw conflict(river, "invalid_basin", `锁定河流 #${id} 的流域根河与父链不一致`);

  const waterCell = path.at(-1);
  if (Number.isInteger(waterCell) && Number(pack?.cells?.h?.[waterCell]) < WATER_LEVEL) {
    const feature = pack?.features?.[pack.cells?.f?.[waterCell]];
    if (river.outletKind === "lake") {
      if (feature?.type !== "lake" || Number(river.outletFeatureId || 0) !== Number(feature.i ?? feature.id ?? 0)) {
        throw conflict(river, "invalid_lake_reference", `锁定河流 #${id} 的湖泊出口引用无效`);
      }
      if (Array.isArray(feature.inlets) && !feature.inlets.map(Number).includes(id)) {
        throw conflict(river, "invalid_lake_reference", `锁定河流 #${id} 未出现在关联湖泊的入流引用中`);
      }
    }
  }
}

function captureFrozenCells(cells, rivers) {
  const frozen = new Map();
  for (const river of rivers) {
    for (const cell of river?.cells || []) {
      if (!Number.isInteger(cell) || cell < 0 || frozen.has(cell)) continue;
      frozen.set(cell, {
        r: Number(cells?.r?.[cell]) || 0,
        fl: Number(cells?.fl?.[cell]) || 0,
        conf: Number(cells?.conf?.[cell]) || 0
      });
    }
  }
  return frozen;
}

function captureLakeGuards(features, frozenIds) {
  const guards = new Map();
  for (const feature of features || []) {
    if (!feature || feature.type !== "lake") continue;
    const river = frozenIds.has(Number(feature.river)) ? Number(feature.river) : 0;
    const outlet = frozenIds.has(Number(feature.outlet)) ? Number(feature.outlet) : 0;
    const inlets = [...new Set((feature.inlets || []).map(Number).filter(id => frozenIds.has(id)))];
    if (river || outlet || inlets.length) guards.set(Number(feature.i ?? feature.id), {river, outlet, inlets});
  }
  return guards;
}

function lastLandCell(path, cells) {
  for (let index = path.length - 1; index >= 0; index--) {
    const cell = path[index];
    if (Number.isInteger(cell) && cell >= 0 && Number(cells?.h?.[cell]) >= WATER_LEVEL) return cell;
  }
  return -1;
}

function conflict(river, reason, message, details = {}) {
  const error = new Error(message);
  error.code = "regeneration_lock_conflict";
  error.details = {kind: "river", id: river ? riverId(river) : null, reason, ...details};
  return error;
}

function riverId(river) {
  return Number(river?.id ?? river?.i);
}

function emptyContext() {
  return {
    lockedIds: new Set(),
    frozenIds: new Set(),
    frozenRivers: [],
    frozenCells: new Map(),
    lakeGuards: new Map()
  };
}

function clone(value) {
  return structuredClone(value);
}
