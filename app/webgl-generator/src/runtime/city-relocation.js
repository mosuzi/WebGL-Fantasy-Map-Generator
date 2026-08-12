import {deriveRelocatedSettlement, inspectRelocatedSettlementPort, refreshRelocatedSettlementDerived} from "../generator/settlements.js";
import {objectAffected} from "./edit-command-effects.js";
import {cloneObjectNote, deleteObjectNote, readObjectNote, restoreObjectNote} from "./object-notes.js";
import {OBJECT_KIND} from "./object-kinds.js";
import {planRouteRelocation, planRouteRelocationAsync, refreshRouteDerivedAfterCityMove} from "./route-edit-commands.js";
import {
  burgIdsAtPackCell,
  cityIdsAtGridCell,
  invalidateSettlementCellIndex,
  moveSettlementInCellIndex,
  rebuildSettlementCellIndex,
  routesAtCity,
  syncLegacyRepresentatives
} from "./settlement-cell-index.js";

const CITY_MOVE_EFFECTS = Object.freeze({
  render: "none",
  selection: "none",
  runtimeStats: false,
  pickPanel: false,
  derived: Object.freeze([
    "city-relocation",
    "route-mesh",
    "state-statistics",
    "economy-stale",
    "zones-stale",
    "defer:population-points"
  ])
});

export function inspectCityMoveFast(map, cityId, target = {}) {
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
    point: [finiteCoordinate(city.x ?? burg.x), finiteCoordinate(city.y ?? burg.y)]
  };
  const destination = resolveTarget(map, target);
  if (!destination) return invalidPreview(id, "missing-cell-mapping", "目标缺少完整的 grid / pack cell 映射", {source});
  const gridHeight = Number(map?.grid?.cells?.h?.[destination.gridCell]);
  if (!Number.isFinite(gridHeight) || gridHeight < 20) reasons.push("目标必须是陆地 cell");

  const owners = readTargetOwners(map, destination);
  const oldOwners = {
    state: ownerId(city.state ?? burg.state),
    province: ownerId(city.province ?? burg.province),
    culture: ownerId(city.culture ?? burg.culture),
    religion: ownerId(city.religion ?? burg.religion)
  };
  const burgId = Number(burg.i ?? burg.id ?? city.burgId);
  const capital = Boolean(city.capital || burg.capital || readPolitical(map, "states", oldOwners.state)?.capital === burgId);
  const provincial = Boolean(city.provincial || burg.provincial || readPolitical(map, "provinces", oldOwners.province)?.burg === burgId);
  const market = findCenteredMarket(map, burgId);
  const oldPort = Number(city.port || burg.port || 0);
  let portPlacement;
  try {
    portPlacement = inspectRelocatedSettlementPort(map.grid, map.pack, destination.packCell, {
      wasPort: oldPort,
      capital,
      burgId,
      options: map.options || {}
    });
  } catch (error) {
    portPlacement = {port: 0, source: "error-cleared", anchor: destination.point, routePackCell: null, reason: error?.message || "港口预检失败"};
    warnings.push(`港口预检异常，按失效港口清理：${portPlacement.reason}`);
  }
  const anchor = oldPort ? normalizedPoint(portPlacement.anchor, destination.point) : [...destination.point];
  const port = {
    oldFeature: oldPort,
    feature: Number(portPlacement.port || 0),
    status: !oldPort ? "unchanged-non-port" : !portPlacement.port ? "cleared" : Number(portPlacement.port) === oldPort ? "kept" : "changed-feature",
    source: portPlacement.source,
    anchor,
    routePackCell: Number.isInteger(portPlacement.routePackCell) ? portPlacement.routePackCell : null,
    reason: portPlacement.reason
  };
  if (port.status === "cleared") warnings.push("原港口在目标失效，港口将清除并删除关联海路");
  if (port.status === "changed-feature") warnings.push(`港口将改连水体 feature #${port.feature}`);
  const changed = source.gridCell !== destination.gridCell
    || source.packCell !== destination.packCell
    || source.point[0] !== anchor[0]
    || source.point[1] !== anchor[1];
  const valid = reasons.length === 0;
  return {
    valid,
    changed: valid && changed,
    code: valid ? changed ? "ok" : "same-position" : "invalid-target",
    reasons,
    warnings,
    phase: "fast",
    city: {id, burgId, name: city.name || burg.name || `城市 #${id}`},
    source,
    target: {...destination, point: anchor},
    owners: {before: oldOwners, after: owners},
    occupancy: {
      cityIds: cityIdsAtGridCell(map, destination.gridCell),
      burgIds: burgIdsAtPackCell(map, destination.packCell)
    },
    roles: {capital, provincial, marketCenter: Boolean(market), marketId: market?.id ?? market?.i ?? null},
    port,
    routes: emptyRouteSummary(map),
    affected: {
      states: uniqueIds([oldOwners.state, owners.state]),
      provinces: uniqueIds([oldOwners.province, owners.province]),
      marketId: market?.id ?? market?.i ?? null,
      staleSystems: ["economy", "diplomacy", "military", "zones", "population-points"]
    },
    summary: valid
      ? changed ? `城市 #${id} 可移动至 grid #${destination.gridCell} / pack #${destination.packCell}` : `城市 #${id} 已位于目标位置`
      : reasons.join("；")
  };
}

export function inspectCityMove(map, cityId, target = {}) {
  const fast = inspectCityMoveFast(map, cityId, target);
  if (!fast.valid) return fast;
  const routePlans = associatedRoutes(map, fast.city.id).map(route => normalizeRoutePlan(route, planRouteRelocation(map, route, fast.city.id, routeTarget(fast))));
  return finalizeInspection(map, fast, routePlans);
}

export async function inspectCityMoveAsync(map, cityId, target = {}, options = {}) {
  const fast = inspectCityMoveFast(map, cityId, target);
  if (!fast.valid) return fast;
  const routePlans = [];
  for (const route of associatedRoutes(map, fast.city.id)) {
    assertInspectionActive(options);
    const plan = await planRouteRelocationAsync(map, route, fast.city.id, routeTarget(fast), options);
    routePlans.push(normalizeRoutePlan(route, plan));
  }
  assertInspectionActive(options);
  return finalizeInspection(map, fast, routePlans);
}

export function exportCityMovePreflight(preview) {
  if (!preview?._plan || preview.phase !== "full") {
    const error = new Error("城市移动预检缺少完整冻结计划");
    error.code = "city-move-preflight-incomplete";
    throw error;
  }
  return {
    preview: cloneValue(preview),
    plan: cloneValue(preview._plan)
  };
}

export function importCityMovePreflight(payload) {
  if (!payload?.preview || !payload?.plan) {
    const error = new Error("城市移动 Worker 预检结果无效");
    error.code = "city-move-worker-preflight-invalid";
    throw error;
  }
  const preview = cloneValue(payload.preview);
  Object.defineProperty(preview, "_plan", {value: deepFreeze(cloneValue(payload.plan)), enumerable: false});
  return deepFreeze(preview);
}

export function createMoveCityCommand(cityId, target, {label = "移动城市", faultInjector = null, preflight = null} = {}) {
  const id = Number(cityId);
  let before = null;
  let after = null;
  let inspection = preflight;
  let result = null;
  const suppliedPreflight = Boolean(preflight);
  const command = {
    label: `${label} #${id}`,
    domain: OBJECT_KIND.CITY,
    effects: {...CITY_MOVE_EFFECTS, affected: objectAffected(OBJECT_KIND.CITY, id)},
    apply(context) {
      if (after) {
        restoreCityMoveSnapshot(context.map, after);
        return;
      }
      inspection = ensureInspection(context.map, id, target, inspection, suppliedPreflight);
      if (!inspection.valid) throw cityMoveError(inspection);
      before = captureCityMoveSnapshot(context.map, inspection);
      try {
        applyCityMove(context.map, inspection);
        faultInjector?.("after-city", context.map, inspection);
        applyRoutePlans(context.map, inspection);
        faultInjector?.("after-routes", context.map, inspection);
        refreshRelocatedSettlementDerived(
          context.map.grid,
          context.map.features,
          context.map.politics,
          context.map.settlements,
          context.map.pack,
          {
            affectedStateIds: inspection.affected.states,
            affectedProvinceIds: inspection.affected.provinces,
            sourceGridCell: inspection.source.gridCell,
            targetGridCell: inspection.target.gridCell,
            local: true
          }
        );
        markRelocationDerivedStale(context.map);
        faultInjector?.("after-derived", context.map, inspection);
        after = captureCityMoveSnapshot(context.map, inspection);
        result = publicResult(inspection);
        const politicalCityIds = [
          inspection._plan.politics.sourceState?.replacementCityId,
          inspection._plan.politics.sourceProvince?.replacementCityId
        ].filter(Number.isInteger);
        command.effects.affected = [
          ...[...new Set([id, ...politicalCityIds])].flatMap(city => objectAffected(OBJECT_KIND.CITY, city)),
          ...inspection.routes.items.map(route => ({kind: OBJECT_KIND.ROUTE, id: route.id}))
        ];
      } catch (error) {
        restoreCityMoveSnapshot(context.map, before);
        throw error;
      }
    },
    revert(context) {
      if (!before) throw new Error("缺少可撤销的城市移动快照");
      restoreCityMoveSnapshot(context.map, before);
    },
    isNoop(context) {
      inspection = ensureInspection(context.map, id, target, inspection, suppliedPreflight);
      if (!inspection.valid) throw cityMoveError(inspection);
      return !inspection.changed;
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

function finalizeInspection(map, fast, routePlans) {
  const warnings = [...fast.warnings];
  for (const plan of routePlans) {
    if (plan.action === "delete") warnings.push(`路线 #${plan.id}：${plan.reason}`);
  }
  const politics = planPoliticalRelocation(map, fast);
  const routeSummary = {
    associated: routePlans.length,
    rerouted: routePlans.filter(item => item.action === "reroute").length,
    deleted: routePlans.filter(item => item.action === "delete").length,
    failed: 0,
    unchanged: Math.max(0, (map?.settlements?.routes?.length || 0) - routePlans.length),
    items: routePlans.map(item => ({id: item.id, type: item.type, action: item.action, reason: item.reason, cells: item.cells || item.route?.packCells?.length || 0}))
  };
  const preview = {
    ...fast,
    phase: "full",
    warnings,
    politics: publicPoliticalPlan(politics),
    routes: routeSummary
  };
  const plan = deepFreeze({routePlans, politics});
  Object.defineProperty(preview, "_plan", {value: plan, enumerable: false});
  return deepFreeze(preview);
}

function normalizeRoutePlan(route, sourcePlan) {
  const plan = sourcePlan.action === "failed"
    ? {...sourcePlan, action: "delete", reason: `${sourcePlan.reason}，按用户移动规则删除并标记派生待重算`}
    : sourcePlan;
  return {
    id: Number(route.id),
    type: route.type,
    beforePackCells: [...(route.packCells || [])],
    ...plan
  };
}

function routeTarget(preview) {
  return {
    packCell: preview.target.packCell,
    point: preview.target.point,
    portFeature: preview.port.feature,
    seaAnchor: preview.port.routePackCell
  };
}

function associatedRoutes(map, cityId) {
  return routesAtCity(map, cityId);
}

function applyCityMove(map, preview) {
  const city = findCity(map, preview.city.id);
  const burg = findBurg(map, city);
  if (!city || !burg) throw new Error(`移动时找不到城市 #${preview.city.id} 的双模型`);
  const source = preview.source;
  const target = preview.target;
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
  moveSettlementInCellIndex(map, {
    cityId: preview.city.id,
    burgId: preview.city.burgId,
    sourceGridCell: source.gridCell,
    sourcePackCell: source.packCell,
    targetGridCell: target.gridCell,
    targetPackCell: target.packCell
  });
  syncPoliticalRoles(map, preview);
  deriveRelocatedSettlement(map.pack, city, burg);
  syncMarketMirror(map, preview, city, burg);
}

function applyRoutePlans(map, preview) {
  const routes = map.settlements?.routes || [];
  const plans = preview._plan.routePlans;
  if (!plans.length) return;
  const routeIds = [];
  const touchedPackCells = [];
  for (const plan of plans) {
    const index = routes.findIndex(route => Number(route.id) === plan.id);
    if (index < 0) throw new Error(`移动时找不到关联路线 #${plan.id}`);
    routeIds.push(plan.id);
    touchedPackCells.push(...plan.beforePackCells, ...(plan.route?.packCells || []));
    if (plan.action === "reroute") routes[index] = cloneValue(plan.route);
    else if (plan.action === "delete") {
      routes.splice(index, 1);
      deleteObjectNote(map, {kind: OBJECT_KIND.ROUTE, id: plan.id});
    }
  }
  refreshRouteDerivedAfterCityMove(map, {routeIds, touchedPackCells});
}

function planPoliticalRelocation(map, preview) {
  const movedId = preview.city.id;
  const oldState = preview.owners.before.state;
  const nextState = preview.owners.after.state;
  const oldProvince = preview.owners.before.province;
  const nextProvince = preview.owners.after.province;
  const stateChanged = oldState !== nextState;
  const provinceChanged = oldProvince !== nextProvince;
  const sourceStateReplacement = preview.roles.capital && stateChanged ? chooseStateCapitalCandidate(map, oldState, movedId) : null;
  const sourceProvinceReplacement = preview.roles.provincial && provinceChanged ? chooseProvinceCapitalCandidate(map, oldProvince, movedId) : null;
  const targetStateNeedsCapital = nextState > 0 && !validStateCapitalCity(map, nextState, movedId);
  const targetProvinceNeedsCapital = nextProvince > 0 && !validProvinceCapitalCity(map, nextProvince, movedId);
  return {
    movedCapital: preview.roles.capital && !stateChanged || targetStateNeedsCapital,
    movedProvincial: preview.roles.provincial && !provinceChanged || targetProvinceNeedsCapital,
    sourceState: preview.roles.capital && stateChanged ? {
      id: oldState,
      replacementCityId: sourceStateReplacement?.id ?? null,
      fallbackPackCell: preview.source.packCell,
      fallbackGridCell: preview.source.gridCell
    } : null,
    sourceProvince: preview.roles.provincial && provinceChanged ? {
      id: oldProvince,
      replacementCityId: sourceProvinceReplacement?.id ?? null,
      fallbackPackCell: preview.source.packCell,
      fallbackGridCell: preview.source.gridCell
    } : null,
    targetState: targetStateNeedsCapital ? {id: nextState, cityId: movedId} : null,
    targetProvince: targetProvinceNeedsCapital ? {id: nextProvince, cityId: movedId} : null
  };
}

function syncPoliticalRoles(map, preview) {
  const plan = preview._plan.politics;
  setCityRole(map, preview.city.id, "capital", Boolean(plan.movedCapital));
  setCityRole(map, preview.city.id, "provincial", Boolean(plan.movedProvincial));
  if (plan.sourceState) applyStateCapitalPlan(map, plan.sourceState);
  if (plan.sourceProvince) applyProvinceCapitalPlan(map, plan.sourceProvince);
  if (plan.targetState) applyStateCapitalPlan(map, {id: plan.targetState.id, replacementCityId: preview.city.id});
  else if (plan.movedCapital && preview.owners.after.state > 0) applyStateCapitalPlan(map, {id: preview.owners.after.state, replacementCityId: preview.city.id});
  if (plan.targetProvince) applyProvinceCapitalPlan(map, {id: plan.targetProvince.id, replacementCityId: preview.city.id});
  else if (plan.movedProvincial && preview.owners.after.province > 0) applyProvinceCapitalPlan(map, {id: preview.owners.after.province, replacementCityId: preview.city.id});
}

function applyStateCapitalPlan(map, plan) {
  if (!plan?.id) return;
  const city = Number.isInteger(plan.replacementCityId) ? findCity(map, plan.replacementCityId) : null;
  const burg = city ? findBurg(map, city) : null;
  const patch = city && burg ? {
    capital: Number(burg.i ?? burg.id ?? city.burgId),
    capitalName: city.name || burg.name || "",
    center: Number(city.packCell ?? burg.cell),
    gridCenter: Number(city.cell ?? map?.pack?.cells?.g?.[burg.cell]),
    religion: Number(city.religion ?? burg.religion) || 0
  } : {
    capital: 0,
    capitalName: "",
    center: plan.fallbackPackCell,
    gridCenter: plan.fallbackGridCell
  };
  updatePoliticalMirror(map, "states", plan.id, patch);
  if (city) setCityRole(map, city.id, "capital", true);
}

function applyProvinceCapitalPlan(map, plan) {
  if (!plan?.id) return;
  const city = Number.isInteger(plan.replacementCityId) ? findCity(map, plan.replacementCityId) : null;
  const burg = city ? findBurg(map, city) : null;
  const patch = city && burg ? {
    burg: Number(burg.i ?? burg.id ?? city.burgId),
    center: Number(city.packCell ?? burg.cell),
    gridCenter: Number(city.cell ?? map?.pack?.cells?.g?.[burg.cell])
  } : {
    burg: 0,
    center: plan.fallbackPackCell,
    gridCenter: plan.fallbackGridCell
  };
  updatePoliticalMirror(map, "provinces", plan.id, patch);
  if (city) setCityRole(map, city.id, "provincial", true);
}

function setCityRole(map, cityId, role, value) {
  const city = findCity(map, Number(cityId));
  if (!city) return;
  const burg = findBurg(map, city);
  city[role] = Boolean(value);
  if (burg) burg[role] = Number(Boolean(value));
  if (role === "capital" && value) {
    city.group = "capital";
    if (burg) burg.group = "capital";
  }
}

function chooseStateCapitalCandidate(map, stateId, excludedCityId) {
  return validPoliticalCandidates(map, city => ownerId(city.state) === stateId && Number(city.id) !== excludedCityId)
    .sort((a, b) => Number(b.provincial) - Number(a.provincial) || populationOf(map, b) - populationOf(map, a) || Number(a.id) - Number(b.id))[0] || null;
}

function chooseProvinceCapitalCandidate(map, provinceId, excludedCityId) {
  const candidates = validPoliticalCandidates(map, city => ownerId(city.province) === provinceId && Number(city.id) !== excludedCityId);
  const stateId = ownerId(readPolitical(map, "provinces", provinceId)?.state);
  const stateCapital = Number(readPolitical(map, "states", stateId)?.capital || 0);
  return candidates.sort((a, b) => Number(Number(b.burgId) === stateCapital) - Number(Number(a.burgId) === stateCapital)
    || populationOf(map, b) - populationOf(map, a)
    || Number(a.id) - Number(b.id))[0] || null;
}

function validPoliticalCandidates(map, predicate) {
  return (map?.settlements?.cities || []).filter(city => {
    if (!city || city.removed || !predicate(city)) return false;
    const burg = findBurg(map, city);
    const packCell = normalizeCell(city.packCell ?? burg?.cell);
    const gridCell = normalizeCell(city.cell ?? map?.pack?.cells?.g?.[packCell]);
    return Boolean(burg && !burg.removed && packCell !== null && gridCell !== null
      && Number(map?.pack?.cells?.h?.[packCell]) >= 20
      && Number(map?.grid?.cells?.h?.[gridCell]) >= 20);
  });
}

function validStateCapitalCity(map, stateId, excludedCityId = null) {
  const state = readPolitical(map, "states", stateId);
  const burgId = Number(state?.capital || 0);
  const city = (map?.settlements?.cities || []).find(item => item && !item.removed && Number(item.burgId) === burgId && Number(item.id) !== excludedCityId);
  return Boolean(city && ownerId(city.state) === stateId && findBurg(map, city));
}

function validProvinceCapitalCity(map, provinceId, excludedCityId = null) {
  const province = readPolitical(map, "provinces", provinceId);
  const burgId = Number(province?.burg || 0);
  const city = (map?.settlements?.cities || []).find(item => item && !item.removed && Number(item.burgId) === burgId && Number(item.id) !== excludedCityId);
  return Boolean(city && ownerId(city.province) === provinceId && findBurg(map, city));
}

function publicPoliticalPlan(plan) {
  return {
    movedCapital: plan.movedCapital,
    movedProvincial: plan.movedProvincial,
    sourceStateReplacementCityId: plan.sourceState?.replacementCityId ?? null,
    sourceProvinceReplacementCityId: plan.sourceProvince?.replacementCityId ?? null,
    targetStatePromotion: Boolean(plan.targetState),
    targetProvincePromotion: Boolean(plan.targetProvince)
  };
}

function syncMarketMirror(map, preview, city, burg) {
  const centered = preview.roles.marketCenter;
  const ownMarketId = centered ? Number(preview.roles.marketId) : 0;
  const targetMarketId = ownMarketId || Number(map.pack?.cells?.market?.[preview.target.packCell] || 0);
  burg.market = targetMarketId > 0 && readMarket(map, targetMarketId) ? targetMarketId : 0;
  burg.plaza = Number(centered);
  city.market = burg.market;
  city.plaza = burg.plaza;
  if (!centered) return;
  for (const market of marketMirrors(map, ownMarketId)) {
    market.centerBurgId = preview.city.burgId;
    market.cell = preview.target.packCell;
    market.x = preview.target.point[0];
    market.y = preview.target.point[1];
    market.state = preview.owners.after.state;
    market.name = `${city.name}市`;
  }
  updateMarketCellRepresentative(map, preview.source.packCell);
  updateMarketCellRepresentative(map, preview.target.packCell);
}

function updateMarketCellRepresentative(map, packCell) {
  const centeredMarketIds = allMarkets(map)
    .filter(market => Number(market?.cell) === Number(packCell) && Number(market?.centerBurgId) > 0)
    .map(market => Number(market.i ?? market.id))
    .filter(value => Number.isInteger(value) && value > 0)
    .sort((a, b) => a - b);
  if (map.pack?.cells?.market) map.pack.cells.market[packCell] = centeredMarketIds[0] || 0;
}

function markRelocationDerivedStale(map) {
  map.metadata ||= {};
  const systems = [...new Set([...(map.metadata.derivedStale?.systems || []), "economy", "diplomacy", "military", "zones", "population-points"] )];
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
    for (let cell = 0; cell < (map?.pack?.cells?.g?.length || 0); cell++) {
      if (Number(map.pack.cells.g[cell]) !== gridCell || Number(map.pack.cells.h?.[cell]) < 20) continue;
      packCell = cell;
      break;
    }
  }
  const gridCount = map?.grid?.points?.length || map?.grid?.cells?.i?.length || map?.grid?.cells?.h?.length || 0;
  const packCount = map?.pack?.cells?.i?.length || map?.pack?.cells?.h?.length || 0;
  if (gridCell === null || packCell === null || gridCell < 0 || packCell < 0 || gridCell >= gridCount || packCell >= packCount) return null;
  if (Number(map?.pack?.cells?.g?.[packCell]) !== gridCell) return null;
  const fallback = map?.pack?.cells?.p?.[packCell] || map?.grid?.points?.[gridCell] || [0, 0];
  const x = Number(value.x ?? value.worldX);
  const y = Number(value.y ?? value.worldY);
  const point = Number.isFinite(x) && Number.isFinite(y) ? [x, y] : normalizedPoint(fallback, [0, 0]);
  const width = Number(map?.metadata?.graphWidth);
  const height = Number(map?.metadata?.graphHeight);
  if (Number.isFinite(width) && (point[0] < 0 || point[0] > width) || Number.isFinite(height) && (point[1] < 0 || point[1] > height)) return null;
  return {gridCell, packCell, point};
}

function readTargetOwners(map, target) {
  return {
    state: ownerId(map?.pack?.cells?.state?.[target.packCell] ?? map?.grid?.cells?.state?.[target.gridCell]),
    province: ownerId(map?.pack?.cells?.province?.[target.packCell] ?? map?.grid?.cells?.province?.[target.gridCell]),
    culture: ownerId(map?.pack?.cells?.culture?.[target.packCell] ?? map?.grid?.cells?.culture?.[target.gridCell]),
    religion: ownerId(map?.pack?.cells?.religion?.[target.packCell] ?? map?.grid?.cells?.religion?.[target.gridCell])
  };
}

function ensureInspection(map, cityId, target, inspection, supplied) {
  if (inspection && inspectionMatchesMap(map, inspection, cityId, target)) return inspection;
  if (supplied) {
    const error = new Error("城市移动预检已过期，请按最新地图重新预检");
    error.code = "inspection_stale";
    throw error;
  }
  return inspectCityMove(map, cityId, target);
}

function inspectionMatchesMap(map, inspection, cityId, target) {
  const city = findCity(map, Number(inspection?.city?.id));
  const burg = city ? findBurg(map, city) : null;
  const requested = resolveTarget(map, target);
  return Boolean(city && burg
    && Number(inspection.city.id) === Number(cityId)
    && requested
    && Number(requested.gridCell) === Number(inspection.target.gridCell)
    && Number(requested.packCell) === Number(inspection.target.packCell)
    && Number(city.cell) === Number(inspection.source.gridCell)
    && Number(city.packCell) === Number(inspection.source.packCell)
    && finiteCoordinate(city.x) === Number(inspection.source.point[0])
    && finiteCoordinate(city.y) === Number(inspection.source.point[1]));
}

function captureCityMoveSnapshot(map, preview) {
  const roleCityIds = new Set([preview.city.id]);
  for (const id of [preview._plan.politics.sourceState?.replacementCityId, preview._plan.politics.sourceProvince?.replacementCityId]) {
    if (Number.isInteger(id)) roleCityIds.add(id);
  }
  const cityStates = [...roleCityIds].map(id => findCity(map, id)).filter(Boolean).map(captureObjectState);
  const burgStates = [...roleCityIds].map(id => findCity(map, id)).map(city => findBurg(map, city)).filter(Boolean).map(captureObjectState);
  const routeIds = preview._plan.routePlans.map(plan => plan.id);
  const routeStates = routeIds.map(id => {
    const index = (map.settlements?.routes || []).findIndex(route => Number(route?.id) === id);
    return index < 0 ? {id, index: -1, value: null} : {id, index, value: cloneValue(map.settlements.routes[index])};
  });
  const touchedRouteCells = [...new Set(preview._plan.routePlans.flatMap(plan => [...plan.beforePackCells, ...(plan.route?.packCells || [])]))];
  const packRoutesPresence = captureCollectionPresence(map.pack, "routes");
  const packCellRoutesPresence = captureCollectionPresence(map.pack?.cells, "routes");
  return {
    preview,
    cityStates,
    burgStates,
    gridBurgSlots: captureSlots(map.grid?.cells?.burg, [preview.source.gridCell, preview.target.gridCell]),
    packBurgSlots: captureSlots(map.pack?.cells?.burg, [preview.source.packCell, preview.target.packCell]),
    politicalObjects: distinctObjects([
      ...preview.affected.states.flatMap(id => [map.politics?.states?.[id], map.pack?.states?.[id]]),
      ...preview.affected.provinces.flatMap(id => [map.politics?.provinces?.[id], map.pack?.provinces?.[id]])
    ]).map(captureObjectState),
    routeStates,
    packRoutesPresence,
    packRouteEntries: packRoutesPresence.exists ? captureArrayEntries(packRoutesPresence.reference, routeIds) : null,
    packCellRoutesPresence,
    packCellRouteEntries: packCellRoutesPresence.exists
      ? touchedRouteCells.map(cell => capturePropertyState(packCellRoutesPresence.reference, String(cell)))
      : [],
    routeNotes: routeIds.map(id => {
      const target = {kind: OBJECT_KIND.ROUTE, id};
      return {target, note: cloneObjectNote(readObjectNote(map, target))};
    }),
    marketObjects: distinctObjects(allMarkets(map).filter(market => {
      const cell = Number(market?.cell);
      return Number(market?.i ?? market?.id) === Number(preview.roles.marketId) || cell === preview.source.packCell || cell === preview.target.packCell;
    })).map(captureObjectState),
    marketSlots: captureSlots(map.pack?.cells?.market, [preview.source.packCell, preview.target.packCell]),
    settlementsMetadata: capturePropertyState(map.settlements, "metadata"),
    mapMetadata: capturePropertyState(map.metadata, "derivedStale"),
    systemMetadata: ["economy", "diplomacy", "military", "zones"]
      .filter(system => map[system])
      .map(system => capturePropertyState(map[system], "metadata"))
  };
}

function restoreCityMoveSnapshot(map, snapshot) {
  for (const state of snapshot.cityStates) restoreObjectState(state);
  for (const state of snapshot.burgStates) restoreObjectState(state);
  restoreSlots(snapshot.gridBurgSlots);
  restoreSlots(snapshot.packBurgSlots);
  for (const state of snapshot.politicalObjects) restoreObjectState(state);
  restoreRouteStates(map, snapshot.routeStates);
  restoreCollectionPresence(snapshot.packRoutesPresence);
  restoreArrayEntries(snapshot.packRouteEntries);
  restoreCollectionPresence(snapshot.packCellRoutesPresence);
  for (const state of snapshot.packCellRouteEntries) restorePropertyState(state);
  for (const entry of snapshot.routeNotes || []) {
    if (entry.note) restoreObjectNote(map, entry.note);
    else deleteObjectNote(map, entry.target);
  }
  for (const state of snapshot.marketObjects) restoreObjectState(state);
  restoreSlots(snapshot.marketSlots);
  restorePropertyState(snapshot.settlementsMetadata);
  restorePropertyState(snapshot.mapMetadata);
  for (const state of snapshot.systemMetadata) restorePropertyState(state);
  invalidateSettlementCellIndex(map);
  rebuildSettlementCellIndex(map);
  syncLegacyRepresentatives(map, {
    gridCells: [snapshot.preview.source.gridCell, snapshot.preview.target.gridCell],
    packCells: [snapshot.preview.source.packCell, snapshot.preview.target.packCell]
  });
}

function restoreRouteStates(map, states) {
  const routes = map.settlements?.routes || [];
  const ids = new Set(states.map(state => Number(state.id)));
  for (let index = routes.length - 1; index >= 0; index--) {
    if (ids.has(Number(routes[index]?.id))) routes.splice(index, 1);
  }
  for (const state of [...states].filter(item => item.value).sort((a, b) => a.index - b.index)) {
    routes.splice(Math.max(0, Math.min(state.index, routes.length)), 0, cloneValue(state.value));
  }
}

function captureObjectState(target) {
  return {target, value: cloneValue(target)};
}

function restoreObjectState(state) {
  restoreContainer(state.target, state.value);
}

function capturePropertyState(owner, key) {
  if (!owner) return null;
  const exists = Object.prototype.hasOwnProperty.call(owner, key);
  const reference = exists ? owner[key] : undefined;
  return {owner, key, exists, reference, value: exists ? cloneValue(reference) : undefined};
}

function captureCollectionPresence(owner, key) {
  const exists = Boolean(owner && Object.prototype.hasOwnProperty.call(owner, key));
  return {owner, key, exists, reference: exists ? owner[key] : undefined};
}

function restoreCollectionPresence(state) {
  if (!state?.owner) return;
  if (!state.exists) delete state.owner[state.key];
  else state.owner[state.key] = state.reference;
}

function captureArrayEntries(array, indices) {
  return array ? {
    array,
    length: array.length,
    entries: [...new Set(indices)].map(index => [index, Object.prototype.hasOwnProperty.call(array, index), cloneValue(array[index])])
  } : null;
}

function restoreArrayEntries(snapshot) {
  if (!snapshot) return;
  for (const [index, exists, value] of snapshot.entries) {
    if (exists) snapshot.array[index] = cloneValue(value);
    else delete snapshot.array[index];
  }
  snapshot.array.length = snapshot.length;
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
  } else state.owner[state.key] = cloneValue(state.value);
}

function captureSlots(array, indices) {
  return array ? {array, entries: [...new Set(indices)].map(index => [index, array[index]])} : null;
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
    for (let index = 0; index < value.length; index++) target[index] = cloneValue(value[index]);
    return;
  }
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, cloneValue(value));
}

function invalidPreview(cityId, code, reason, extra = {}) {
  return {valid: false, changed: false, code, reasons: [reason], warnings: [], phase: "fast", city: {id: cityId}, routes: {associated: 0, rerouted: 0, deleted: 0, failed: 0, unchanged: 0, items: []}, summary: reason, ...extra};
}

function emptyRouteSummary(map) {
  return {associated: 0, rerouted: 0, deleted: 0, failed: 0, unchanged: map?.settlements?.routes?.length || 0, items: []};
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
    politics: cloneValue(preview.politics),
    port: cloneValue(preview.port),
    routes: cloneValue(preview.routes),
    staleSystems: [...preview.affected.staleSystems]
  };
}

function assertInspectionActive(options) {
  if (!options.signal?.aborted && (typeof options.shouldContinue !== "function" || options.shouldContinue())) return;
  const error = new Error("城市移动预检已取消");
  error.code = "operation_cancelled";
  throw error;
}

function findCity(map, cityId) {
  return (map?.settlements?.cities || []).find(city => Number(city?.id) === Number(cityId) && !city.removed) || null;
}

function findBurg(map, city) {
  return map?.pack?.burgs?.[city?.burgId] || (map?.pack?.burgs || []).find(burg => Number(burg?.cityId) === Number(city?.id)) || null;
}

function findCenteredMarket(map, burgId) {
  return allMarkets(map).find(market => market && Number(market.centerBurgId) === Number(burgId)) || null;
}

function allMarkets(map) {
  return distinctObjects([...(map?.pack?.markets || []), ...(map?.economy?.markets || [])]);
}

function readMarket(map, marketId) {
  return map?.pack?.markets?.[marketId] || map?.economy?.markets?.[marketId] || null;
}

function marketMirrors(map, marketId) {
  return distinctObjects([map?.pack?.markets?.[marketId], map?.economy?.markets?.[marketId]]);
}

function readPolitical(map, kind, id) {
  return map?.politics?.[kind]?.[id] || map?.pack?.[kind]?.[id] || null;
}

function updatePoliticalMirror(map, kind, id, patch) {
  for (const item of distinctObjects([map?.politics?.[kind]?.[id], map?.pack?.[kind]?.[id]])) Object.assign(item, patch);
}

function populationOf(map, city) {
  return Number(city?.population ?? findBurg(map, city)?.population) || 0;
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

function finiteCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizedPoint(value, fallback) {
  return Array.isArray(value) && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))
    ? [Number(value[0]), Number(value[1])]
    : [...fallback];
}

function distinctObjects(values) {
  return [...new Set(values.filter(value => value && typeof value === "object"))];
}

function cloneValue(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}
