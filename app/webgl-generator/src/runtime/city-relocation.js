import {deriveRelocatedSettlement, inspectRelocatedSettlementPort, refreshRelocatedSettlementDerived} from "../generator/settlements.js";
import {objectAffected} from "./edit-command-effects.js";
import {deleteObjectNote} from "./object-notes.js";
import {OBJECT_KIND} from "./object-kinds.js";
import {planRouteRelocation, refreshRouteDerivedAfterCityMove} from "./route-edit-commands.js";

const CITY_MOVE_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze([
    "settlement-states",
    "city-provinces",
    "city-population",
    "political-boundaries",
    "point-layers",
    "route-mesh",
    "labels",
    "object-panels",
    "object-index",
    "state-statistics",
    "economy-stale",
    "zones-stale"
  ])
});

export function inspectCityMove(map, cityId, target = {}) {
  const id = Number(cityId);
  const reasons = [];
  const warnings = [];
  const city = findCity(map, id);
  if (!Number.isInteger(id) || id < 0 || !city) return invalidPreview(id, "missing-city", `找不到城市 #${cityId}`);
  const burg = findBurg(map, city);
  if (!burg) return invalidPreview(id, "missing-burg", `城市 #${id} 缺少 burg 镜像`);

  const source = {
    gridCell: normalizeCell(city.cell ?? map?.pack?.cells?.g?.[city.packCell]),
    packCell: normalizeCell(city.packCell ?? burg.cell),
    point: [Number(city.x ?? burg.x) || 0, Number(city.y ?? burg.y) || 0]
  };
  const destination = resolveTarget(map, target);
  if (!destination) return invalidPreview(id, "missing-cell-mapping", "目标缺少完整的 grid / pack cell 映射", {source});

  const packHeight = Number(map?.pack?.cells?.h?.[destination.packCell]);
  const gridHeight = Number(map?.grid?.cells?.h?.[destination.gridCell]);
  if (!Number.isFinite(packHeight) || packHeight < 20 || Number.isFinite(gridHeight) && gridHeight < 20) reasons.push("目标必须是陆地 cell");
  const targetGridOccupant = Number(map?.grid?.cells?.burg?.[destination.gridCell]);
  const targetPackOccupant = Number(map?.pack?.cells?.burg?.[destination.packCell]);
  if (Number.isFinite(targetGridOccupant) && targetGridOccupant >= 0 && targetGridOccupant !== id) reasons.push(`目标 grid cell 已被城市 #${targetGridOccupant} 占用`);
  if (targetPackOccupant > 0 && targetPackOccupant !== Number(burg.i ?? burg.id ?? city.burgId)) reasons.push(`目标 pack cell 已被 burg #${targetPackOccupant} 占用`);

  const owners = readTargetOwners(map, destination);
  const oldOwners = {
    state: ownerId(city.state ?? burg.state),
    province: ownerId(city.province ?? burg.province),
    culture: ownerId(city.culture ?? burg.culture),
    religion: ownerId(city.religion ?? burg.religion)
  };
  const burgId = Number(burg.i ?? burg.id ?? city.burgId);
  const capital = Boolean(city.capital || burg.capital || readPolitical(map, "states", oldOwners.state)?.capital === burgId);
  const provincial = Boolean(city.provincial || readPolitical(map, "provinces", oldOwners.province)?.burg === burgId);
  const market = findCenteredMarket(map, burgId);
  if (capital && (owners.state <= 0 || owners.state !== oldOwners.state)) reasons.push("首都只能在原国家内移动");
  if (provincial && (owners.province <= 0 || owners.province !== oldOwners.province)) reasons.push("省会只能在原省份内移动");
  if (market && (owners.state <= 0 || owners.state !== oldOwners.state)) reasons.push("市场中心只能在原国家内移动");

  const portPlacement = inspectRelocatedSettlementPort(map.grid, map.pack, destination.packCell, {
    wasPort: Number(city.port || burg.port || 0),
    capital,
    burgId,
    options: map.options || {}
  });
  const oldPort = Number(city.port || burg.port || 0);
  const port = {
    oldFeature: oldPort,
    feature: Number(portPlacement.port || 0),
    status: !oldPort ? "unchanged-non-port" : !portPlacement.port ? "cleared" : Number(portPlacement.port) === oldPort ? "kept" : "changed-feature",
    source: portPlacement.source,
    anchor: [...portPlacement.anchor],
    routePackCell: portPlacement.routePackCell,
    reason: portPlacement.reason
  };
  if (port.status === "cleared") warnings.push("原港口在目标失效，港口将清除并删除关联海路");
  if (port.status === "changed-feature") warnings.push(`港口将改连水体 feature #${port.feature}`);

  const routePlans = [];
  for (const route of map?.settlements?.routes || []) {
    if (Number(route?.from) !== id && Number(route?.to) !== id) continue;
    const plan = planRouteRelocation(map, route, id, {
      packCell: destination.packCell,
      point: port.anchor,
      portFeature: port.feature,
      seaAnchor: port.routePackCell
    });
    routePlans.push({id: Number(route.id), type: route.type, ...plan});
    if (plan.action === "failed") reasons.push(`路线 #${route.id}：${plan.reason}`);
    if (plan.action === "delete") warnings.push(`海路 #${route.id}：${plan.reason}`);
  }

  const changed = source.gridCell !== destination.gridCell
    || source.packCell !== destination.packCell
    || source.point[0] !== port.anchor[0]
    || source.point[1] !== port.anchor[1];
  const routeSummary = {
    associated: routePlans.length,
    rerouted: routePlans.filter(item => item.action === "reroute").length,
    deleted: routePlans.filter(item => item.action === "delete").length,
    failed: routePlans.filter(item => item.action === "failed").length,
    unchanged: Math.max(0, (map?.settlements?.routes?.length || 0) - routePlans.length),
    items: routePlans.map(item => ({id: item.id, type: item.type, action: item.action, reason: item.reason, cells: item.cells || item.route?.packCells?.length || 0}))
  };
  const valid = reasons.length === 0;
  const preview = {
    valid,
    changed: valid && changed,
    code: valid ? changed ? "ok" : "same-cell" : "invalid-target",
    reasons,
    warnings,
    city: {id, burgId, name: city.name || burg.name || `城市 #${id}`},
    source,
    target: {...destination, point: [...port.anchor]},
    owners: {before: oldOwners, after: owners},
    roles: {capital, provincial, marketCenter: Boolean(market), marketId: market?.id ?? market?.i ?? null},
    port,
    routes: routeSummary,
    affected: {
      states: uniqueIds([oldOwners.state, owners.state]),
      provinces: uniqueIds([oldOwners.province, owners.province]),
      marketId: market?.id ?? market?.i ?? null,
      staleSystems: ["economy", "diplomacy", "military", "zones"]
    },
    summary: valid
      ? changed ? `城市 #${id} 可移动至 grid #${destination.gridCell} / pack #${destination.packCell}` : `城市 #${id} 已位于目标 cell`
      : reasons.join("；")
  };
  Object.defineProperty(preview, "_plan", {value: {city, burg, market, routePlans}, enumerable: false});
  return preview;
}

export function createMoveCityCommand(cityId, target, {label = "移动城市", faultInjector = null} = {}) {
  const id = Number(cityId);
  let before = null;
  let after = null;
  let inspection = null;
  let result = null;
  const command = {
    label: `${label} #${id}`,
    domain: OBJECT_KIND.CITY,
    effects: {...CITY_MOVE_EFFECTS, affected: objectAffected(OBJECT_KIND.CITY, id)},
    apply(context) {
      if (after) {
        restoreCityMoveSnapshot(after);
        return;
      }
      inspection = inspectCityMove(context.map, id, target);
      if (!inspection.valid) throw cityMoveError(inspection);
      before = captureCityMoveSnapshot(context.map, inspection);
      try {
        applyCityMove(context.map, inspection);
        faultInjector?.("after-city", context.map, inspection);
        applyRoutePlans(context.map, inspection);
        faultInjector?.("after-routes", context.map, inspection);
        refreshRelocatedSettlementDerived(context.map.grid, context.map.features, context.map.politics, context.map.settlements, context.map.pack);
        markRelocationDerivedStale(context.map);
        faultInjector?.("after-derived", context.map, inspection);
        after = captureCityMoveSnapshot(context.map, inspection);
        result = publicResult(inspection);
        command.effects.affected = [
          ...objectAffected(OBJECT_KIND.CITY, id),
          ...inspection.routes.items.map(route => ({kind: OBJECT_KIND.ROUTE, id: route.id}))
        ];
      } catch (error) {
        restoreCityMoveSnapshot(before);
        throw error;
      }
    },
    revert(context) {
      if (!before) throw new Error("缺少可撤销的城市移动快照");
      restoreCityMoveSnapshot(before);
    },
    isNoop(context) {
      const preview = inspectCityMove(context.map, id, target);
      if (!preview.valid) throw cityMoveError(preview);
      return !preview.changed;
    },
    getInspection() {
      return inspection;
    },
    getResult() {
      return result;
    }
  };
  return command;
}

function applyCityMove(map, preview) {
  const city = findCity(map, preview.city.id);
  const burg = findBurg(map, city);
  const source = preview.source;
  const target = preview.target;
  const burgId = preview.city.burgId;
  if (Number(map.grid?.cells?.burg?.[source.gridCell]) === preview.city.id) map.grid.cells.burg[source.gridCell] = -1;
  if (Number(map.pack?.cells?.burg?.[source.packCell]) === burgId) map.pack.cells.burg[source.packCell] = 0;
  map.grid.cells.burg[target.gridCell] = preview.city.id;
  map.pack.cells.burg[target.packCell] = burgId;

  Object.assign(city, {
    cell: target.gridCell,
    packCell: target.packCell,
    x: target.point[0],
    y: target.point[1],
    state: preview.owners.after.state,
    province: preview.owners.after.province,
    culture: preview.owners.after.culture,
    religion: preview.owners.after.religion,
    port: preview.port.feature
  });
  Object.assign(burg, {
    cell: target.packCell,
    x: target.point[0],
    y: target.point[1],
    state: preview.owners.after.state,
    province: preview.owners.after.province,
    culture: preview.owners.after.culture,
    religion: preview.owners.after.religion,
    port: preview.port.feature
  });
  deriveRelocatedSettlement(map.pack, city, burg);
  syncPoliticalRoles(map, preview, city, burg);
  syncMarketMirror(map, preview, city, burg);
}

function applyRoutePlans(map, preview) {
  const routes = map.settlements?.routes || [];
  const plans = preview._plan.routePlans;
  for (const plan of plans) {
    const index = routes.findIndex(route => Number(route.id) === plan.id);
    if (index < 0) throw new Error(`移动时找不到关联路线 #${plan.id}`);
    if (plan.action === "reroute") routes[index] = cloneValue(plan.route);
    else if (plan.action === "delete") {
      routes.splice(index, 1);
      deleteObjectNote(map, {kind: OBJECT_KIND.ROUTE, id: plan.id});
    } else if (plan.action === "failed") throw new Error(`路线 #${plan.id} 局部重寻失败`);
  }
  refreshRouteDerivedAfterCityMove(map);
}

function syncPoliticalRoles(map, preview, city, burg) {
  const target = preview.target;
  if (preview.roles.capital) {
    updatePoliticalMirror(map, "states", preview.owners.after.state, {
      capital: burg.i ?? burg.id,
      capitalName: city.name,
      center: target.packCell,
      gridCenter: target.gridCell
    });
  }
  if (preview.roles.provincial) {
    updatePoliticalMirror(map, "provinces", preview.owners.after.province, {
      burg: burg.i ?? burg.id,
      center: target.packCell,
      gridCenter: target.gridCell
    });
  }
}

function syncMarketMirror(map, preview, city, burg) {
  const centered = preview.roles.marketCenter;
  const targetMarketId = centered ? Number(preview.roles.marketId) : Number(map.pack?.cells?.market?.[preview.target.packCell] || 0);
  burg.market = targetMarketId > 0 && readMarket(map, targetMarketId) ? targetMarketId : 0;
  // economy 以 plaza 作为市场中心镜像，普通城市不能保留旧中心标志。
  burg.plaza = Number(centered);
  city.market = burg.market;
  city.plaza = burg.plaza;
  if (!centered) return;
  if (map.pack?.cells?.market) map.pack.cells.market[preview.target.packCell] = targetMarketId;
  for (const market of marketMirrors(map, targetMarketId)) {
    market.centerBurgId = preview.city.burgId;
    market.cell = preview.target.packCell;
    market.x = preview.target.point[0];
    market.y = preview.target.point[1];
    market.state = preview.owners.after.state;
    market.name = `${city.name}市`;
  }
}

function markRelocationDerivedStale(map) {
  map.metadata ||= {};
  const systems = [...new Set([...(map.metadata.derivedStale?.systems || []), "economy", "diplomacy", "military", "zones"])];
  map.metadata.derivedStale = {...(map.metadata.derivedStale || {}), systems, updatedAt: new Date().toISOString()};
  for (const system of ["economy", "diplomacy", "military", "zones"]) {
    if (!map[system]) continue;
    map[system].metadata ||= {};
    map[system].metadata.stale = true;
  }
}

function resolveTarget(map, target) {
  const value = typeof target === "number" ? {gridCell: target} : target || {};
  let gridCell = normalizeCell(value.gridCell ?? value.cell);
  let packCell = normalizeCell(value.packCell);
  if (packCell !== null && gridCell === null) gridCell = normalizeCell(map?.pack?.cells?.g?.[packCell]);
  if (gridCell !== null && packCell === null) {
    const candidates = [];
    for (let cell = 0; cell < (map?.pack?.cells?.g?.length || 0); cell++) {
      if (Number(map.pack.cells.g[cell]) === gridCell && Number(map.pack.cells.h?.[cell]) >= 20) candidates.push(cell);
    }
    packCell = candidates[0] ?? null;
  }
  const gridCount = map?.grid?.points?.length || map?.grid?.cells?.i?.length || map?.grid?.cells?.h?.length || 0;
  const packCount = map?.pack?.cells?.i?.length || map?.pack?.cells?.h?.length || 0;
  if (gridCell === null || packCell === null || gridCell < 0 || packCell < 0 || gridCell >= gridCount || packCell >= packCount) return null;
  if (Number(map?.pack?.cells?.g?.[packCell]) !== gridCell) return null;
  return {gridCell, packCell};
}

function readTargetOwners(map, target) {
  return {
    state: ownerId(map?.pack?.cells?.state?.[target.packCell] ?? map?.grid?.cells?.state?.[target.gridCell]),
    province: ownerId(map?.pack?.cells?.province?.[target.packCell] ?? map?.grid?.cells?.province?.[target.gridCell]),
    culture: ownerId(map?.pack?.cells?.culture?.[target.packCell] ?? map?.grid?.cells?.culture?.[target.gridCell]),
    religion: ownerId(map?.pack?.cells?.religion?.[target.packCell] ?? map?.grid?.cells?.religion?.[target.gridCell])
  };
}

function findCity(map, cityId) {
  return (map?.settlements?.cities || []).find(city => Number(city?.id) === cityId && !city.removed) || null;
}

function findBurg(map, city) {
  return map?.pack?.burgs?.[city?.burgId] || (map?.pack?.burgs || []).find(burg => Number(burg?.cityId) === Number(city?.id)) || null;
}

function findCenteredMarket(map, burgId) {
  return (map?.pack?.markets || map?.economy?.markets || []).find(market => market && Number(market.centerBurgId) === burgId) || null;
}

function readMarket(map, marketId) {
  return map?.pack?.markets?.[marketId] || map?.economy?.markets?.[marketId] || null;
}

function marketMirrors(map, marketId) {
  return [...new Set([map?.pack?.markets?.[marketId], map?.economy?.markets?.[marketId]].filter(Boolean))];
}

function readPolitical(map, kind, id) {
  return map?.politics?.[kind]?.[id] || map?.pack?.[kind]?.[id] || null;
}

function updatePoliticalMirror(map, kind, id, patch) {
  for (const item of new Set([map?.politics?.[kind]?.[id], map?.pack?.[kind]?.[id]].filter(Boolean))) Object.assign(item, patch);
}

function invalidPreview(cityId, code, reason, extra = {}) {
  return {valid: false, changed: false, code, reasons: [reason], warnings: [], city: {id: cityId}, routes: {associated: 0, rerouted: 0, deleted: 0, failed: 0, unchanged: 0, items: []}, summary: reason, ...extra};
}

function cityMoveError(preview) {
  const error = new Error(preview.summary || preview.reasons?.join("；") || "城市移动预检失败");
  error.code = preview.code;
  error.preview = preview;
  return error;
}

function publicResult(preview) {
  return {
    cityId: preview.city.id,
    burgId: preview.city.burgId,
    source: cloneValue(preview.source),
    target: cloneValue(preview.target),
    owners: cloneValue(preview.owners),
    roles: cloneValue(preview.roles),
    port: cloneValue(preview.port),
    routes: cloneValue(preview.routes),
    staleSystems: [...preview.affected.staleSystems]
  };
}

function uniqueIds(values) {
  return [...new Set(values.map(ownerId))];
}

function normalizeCell(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function ownerId(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function captureCityMoveSnapshot(map, preview) {
  const city = findCity(map, preview.city.id);
  const burg = findBurg(map, city);
  const politicalObjects = distinctObjects([
    ...(map.politics?.states || []),
    ...(map.pack?.states || []),
    ...(map.politics?.provinces || []),
    ...(map.pack?.provinces || [])
  ]);
  const marketId = Number(preview.roles.marketId);
  const marketObjects = marketId > 0 ? distinctObjects(marketMirrors(map, marketId)) : [];
  const cellIndices = uniqueCellIndices([preview.source.gridCell, preview.target.gridCell]);
  const packCellIndices = uniqueCellIndices([preview.source.packCell, preview.target.packCell]);
  return {
    city: captureObjectState(city),
    burg: captureObjectState(burg),
    gridBurgSlots: captureSlots(map.grid?.cells?.burg, cellIndices),
    packBurgSlots: captureSlots(map.pack?.cells?.burg, packCellIndices),
    politicalObjects: politicalObjects.map(captureObjectState),
    settlementsMetadata: capturePropertyState(map.settlements, "metadata"),
    populationPoints: capturePropertyState(map.settlements, "populationPoints"),
    settlementRoutes: captureObjectArrayProperty(map.settlements, "routes"),
    packRoutes: capturePropertyState(map.pack, "routes"),
    packCellRoutes: capturePropertyState(map.pack?.cells, "routes"),
    notes: capturePropertyState(map, "notes"),
    marketObjects: marketObjects.map(captureObjectState),
    marketSlots: captureSlots(map.pack?.cells?.market, packCellIndices),
    mapMetadata: capturePropertyState(map, "metadata"),
    systemMetadata: ["economy", "diplomacy", "military", "zones"]
      .filter(system => map[system])
      .map(system => capturePropertyState(map[system], "metadata"))
  };
}

function restoreCityMoveSnapshot(snapshot) {
  restoreObjectState(snapshot.city);
  restoreObjectState(snapshot.burg);
  restoreSlots(snapshot.gridBurgSlots);
  restoreSlots(snapshot.packBurgSlots);
  for (const state of snapshot.politicalObjects) restoreObjectState(state);
  restorePropertyState(snapshot.settlementsMetadata);
  restorePropertyState(snapshot.populationPoints);
  restoreObjectArrayProperty(snapshot.settlementRoutes);
  restorePropertyState(snapshot.packRoutes);
  restorePropertyState(snapshot.packCellRoutes);
  restorePropertyState(snapshot.notes);
  for (const market of snapshot.marketObjects) restoreObjectState(market);
  restoreSlots(snapshot.marketSlots);
  restorePropertyState(snapshot.mapMetadata);
  for (const metadata of snapshot.systemMetadata) restorePropertyState(metadata);
}

function captureObjectState(target) {
  return target && typeof target === "object" ? {target, value: cloneValue(target)} : null;
}

function restoreObjectState(state) {
  if (!state) return;
  restoreContainer(state.target, state.value);
}

function capturePropertyState(owner, key) {
  if (!owner) return null;
  const exists = Object.prototype.hasOwnProperty.call(owner, key);
  const reference = exists ? owner[key] : undefined;
  return {owner, key, exists, reference, value: exists ? cloneValue(reference) : undefined};
}

function restorePropertyState(state) {
  if (!state) return;
  if (!state.exists) {
    delete state.owner[state.key];
    return;
  }
  if (state.reference && typeof state.reference === "object" && state.value && typeof state.value === "object") {
    restoreContainer(state.reference, state.value);
    state.owner[state.key] = state.reference;
    return;
  }
  state.owner[state.key] = cloneValue(state.value);
}

function captureObjectArrayProperty(owner, key) {
  if (!owner) return null;
  const exists = Object.prototype.hasOwnProperty.call(owner, key);
  const reference = exists ? owner[key] : undefined;
  if (!Array.isArray(reference)) return {owner, key, exists, reference, items: null, value: exists ? cloneValue(reference) : undefined};
  return {
    owner,
    key,
    exists,
    reference,
    items: reference.map(item => item && typeof item === "object" ? {reference: item, value: cloneValue(item)} : {reference: null, value: item})
  };
}

function restoreObjectArrayProperty(state) {
  if (!state) return;
  if (!state.exists) {
    delete state.owner[state.key];
    return;
  }
  if (!state.items) {
    restorePropertyState(state);
    return;
  }
  state.reference.length = 0;
  for (const item of state.items) {
    if (!item.reference) state.reference.push(item.value);
    else {
      restoreContainer(item.reference, item.value);
      state.reference.push(item.reference);
    }
  }
  state.owner[state.key] = state.reference;
}

function captureSlots(array, indices) {
  return array ? {array, entries: indices.map(index => [index, array[index]])} : null;
}

function restoreSlots(snapshot) {
  if (!snapshot) return;
  for (const [index, value] of snapshot.entries) snapshot.array[index] = value;
}

function restoreContainer(target, value) {
  if (ArrayBuffer.isView(target) && ArrayBuffer.isView(value)) {
    target.set(value);
    return;
  }
  if (Array.isArray(target) && Array.isArray(value)) {
    target.length = value.length;
    for (let index = 0; index < value.length; index++) {
      if (Object.prototype.hasOwnProperty.call(value, index)) target[index] = cloneValue(value[index]);
      else delete target[index];
    }
    return;
  }
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, cloneValue(value));
}

function distinctObjects(values) {
  return [...new Set(values.filter(value => value && typeof value === "object"))];
}

function uniqueCellIndices(values) {
  return [...new Set(values.filter(value => Number.isInteger(value) && value >= 0))];
}

function cloneValue(value) {
  return structuredClone(value);
}
