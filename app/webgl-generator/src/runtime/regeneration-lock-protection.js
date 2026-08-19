import {OBJECT_KIND} from "./object-kinds.js";
import {listRegenerationLocks, lockError} from "./regeneration-locks.js";
import {
  captureDiplomacyRelationSnapshot,
  diplomacyPairKey,
  parseDiplomacyPairIdentity
} from "../generator/diplomacy-regeneration-locks.js";
import {captureMilitaryRegimentSnapshot} from "../generator/military-regeneration-locks.js";
import {prepareRiverRegenerationLocks} from "../generator/river-regeneration-locks.js";
import {prepareSocialRegenerationLocks} from "../generator/social-regeneration-locks.js";
import {burgIdsAtPackCell, cityIdsAtGridCell} from "./settlement-cell-index.js";

export function captureLockedRegenerationObjects(map, kind, {filter = null} = {}) {
  const references = listRegenerationLocks(map, {kind});
  const entries = references.map(reference => {
    const object = resolveProtectedObject(map, reference);
    if (!object) throw regenerationLockConflict(kind, reference, "locked_object_missing", "锁定对象已不存在");
    if (filter && !filter(object, reference)) return null;
    validateProtectedObject(map, reference, object);
    return {reference: {...reference}, snapshot: clone(object), related: captureRelatedSnapshot(map, reference, object)};
  }).filter(Boolean);
  return {
    kind,
    entries,
    ids: new Set(entries.map(entry => String(entry.reference.id))),
    snapshots: entries.map(entry => clone(entry.snapshot))
  };
}

export function lockedRegenerationObjects(map, kind) {
  return captureLockedRegenerationObjects(map, kind).snapshots;
}

export function allRegenerationObjectsLocked(map, kind, objects = null) {
  const rows = objects || listRegenerationObjects(map, kind);
  if (!rows.length) return false;
  const locked = captureLockedRegenerationObjects(map, kind).ids;
  return rows.every(object => locked.has(String(objectId(kind, object))));
}

export function assertLockedRegenerationSnapshots(map, capture) {
  for (const entry of capture?.entries || []) {
    const object = resolveProtectedObject(map, entry.reference);
    if (!object) throw regenerationLockConflict(capture.kind, entry.reference, "locked_object_removed", "重生成结果删除了锁定对象");
    if (stableSnapshot(object) !== stableSnapshot(entry.snapshot)) {
      throw regenerationLockConflict(capture.kind, entry.reference, "locked_snapshot_changed", "重生成结果改写了锁定对象快照", {
        changedFields: changedTopLevelFields(entry.snapshot, object),
        changedSummary: summarizeTopLevelChanges(entry.snapshot, object)
      });
    }
    const related = captureRelatedSnapshot(map, entry.reference, object);
    if (stableSnapshot(related) !== stableSnapshot(entry.related)) {
      throw regenerationLockConflict(capture.kind, entry.reference, "locked_mirror_changed", "重生成结果改写了锁定对象镜像", {
        changedFields: changedTopLevelFields(entry.related, related),
        changedSummary: summarizeTopLevelChanges(entry.related, related)
      });
    }
  }
  return true;
}

export function assignReservedNumericIds(generated, reservedIds, {getId = item => item?.id ?? item?.i, setId = (item, id) => {
  item.id = id;
  item.i = id;
}, start = 0} = {}) {
  const used = new Set([...reservedIds].map(Number).filter(Number.isInteger));
  let cursor = Math.max(start, used.size ? Math.max(...used) + 1 : start);
  for (const item of generated || []) {
    let id = Number(getId(item));
    if (!Number.isInteger(id) || id < 0 || used.has(id)) {
      while (used.has(cursor)) cursor += 1;
      id = cursor++;
    }
    setId(item, id);
    used.add(id);
    cursor = Math.max(cursor, id + 1);
  }
  return generated;
}

export function regenerationLockConflict(kind, reference, reason, message, details = {}) {
  return lockError("regeneration_lock_conflict", message, {
    kind,
    reference: reference ? {...reference} : null,
    reason,
    ...details
  });
}

function listRegenerationObjects(map, kind) {
  if (kind === OBJECT_KIND.STATE) return map?.politics?.states || map?.pack?.states || [];
  if (kind === OBJECT_KIND.PROVINCE) return map?.politics?.provinces || map?.pack?.provinces || [];
  if (kind === OBJECT_KIND.CITY) return map?.settlements?.cities || [];
  if (kind === OBJECT_KIND.ROUTE) return map?.settlements?.routes || [];
  if (kind === OBJECT_KIND.RIVER) return map?.rivers?.rivers || [];
  if (kind === OBJECT_KIND.CULTURE) return map?.society?.cultures || map?.pack?.cultures || [];
  if (kind === OBJECT_KIND.RELIGION) return map?.society?.religions || map?.pack?.religions || [];
  if (kind === OBJECT_KIND.FEATURE) return map?.pack?.features || [];
  if (kind === OBJECT_KIND.MARKER) return map?.markers?.markers || [];
  if (kind === OBJECT_KIND.ZONE) return map?.zones?.zones || map?.pack?.zones || [];
  if (kind === OBJECT_KIND.OCEAN_CURRENT) return map?.oceanCurrents?.currents || [];
  if (kind === OBJECT_KIND.DIPLOMACY_RELATION) return diplomacyPairObjects(map);
  if (kind === OBJECT_KIND.MILITARY) return militaryRegimentObjects(map);
  if (kind === OBJECT_KIND.ECONOMY_MARKET) return map?.pack?.markets || map?.economy?.markets || [];
  if (kind === OBJECT_KIND.TRADE_FLOW) return map?.pack?.deals || map?.economy?.deals || [];
  return [];
}

function resolveProtectedObject(map, reference) {
  if (reference.kind === OBJECT_KIND.DIPLOMACY_RELATION) {
    const identity = parseDiplomacyPairIdentity(reference);
    return identity ? captureDiplomacyRelationSnapshot(map?.pack, identity.leftId, identity.rightId) : null;
  }
  if (reference.kind === OBJECT_KIND.MILITARY) {
    try {
      return captureMilitaryRegimentSnapshot(map?.pack, reference);
    } catch (error) {
      if (error?.code === "regeneration_lock_conflict" && error?.details?.reason === "missing-regiment") return null;
      throw error;
    }
  }
  return listRegenerationObjects(map, reference.kind)
    .find(object => String(objectId(reference.kind, object)) === String(reference.id)) || null;
}

function objectId(kind, object) {
  if (kind === OBJECT_KIND.OCEAN_CURRENT) return object?.id;
  if (kind === OBJECT_KIND.DIPLOMACY_RELATION || kind === OBJECT_KIND.MILITARY) return object?.id;
  return object?.id ?? object?.i;
}

function validateProtectedObject(map, reference, object) {
  if (reference.kind === OBJECT_KIND.STATE) return validateState(map, reference, object);
  if (reference.kind === OBJECT_KIND.PROVINCE) return validateProvince(map, reference, object);
  if (reference.kind === OBJECT_KIND.CITY) return validateCity(map, reference, object);
  if (reference.kind === OBJECT_KIND.ROUTE) return validateRoute(map, reference, object);
  if (reference.kind === OBJECT_KIND.RIVER) return validateRiver(map, reference, object);
  if (reference.kind === OBJECT_KIND.CULTURE) return validateSocialObject(map, reference, object, {
    field: "culture",
    plural: "cultures",
    label: "文化"
  });
  if (reference.kind === OBJECT_KIND.RELIGION) return validateSocialObject(map, reference, object, {
    field: "religion",
    plural: "religions",
    label: "宗教"
  });
  if (reference.kind === OBJECT_KIND.FEATURE) return validateFeature(map, reference, object);
  if (reference.kind === OBJECT_KIND.MARKER) return validateMarker(map, reference, object);
  if (reference.kind === OBJECT_KIND.ZONE) return validateZone(map, reference, object);
  if (reference.kind === OBJECT_KIND.OCEAN_CURRENT) return validateOceanCurrent(map, reference, object);
  if (reference.kind === OBJECT_KIND.DIPLOMACY_RELATION) return validateDiplomacyRelation(map, reference);
  if (reference.kind === OBJECT_KIND.MILITARY) return validateMilitaryRegiment(map, reference);
  if (reference.kind === OBJECT_KIND.ECONOMY_MARKET) return validateEconomyMarket(map, reference, object);
  if (reference.kind === OBJECT_KIND.TRADE_FLOW) return validateTradeFlow(map, reference, object);
}

function validateState(map, reference, state) {
  const id = Number(state.id ?? state.i);
  const center = Number(state.center);
  const capital = Number(state.capital);
  const burg = map?.pack?.burgs?.[capital];
  if (!Number.isInteger(id) || id <= 0 || !map?.pack?.states?.[id] || map.pack.states[id].removed) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_state_mirror", "锁定国家缺少一致的 pack 对象", {id});
  }
  if (!Number.isInteger(center) || center < 0 || center >= Number(map?.pack?.cells?.i?.length || 0) || map.pack.cells.h?.[center] < 20) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_state_center", "锁定国家引用了无效中心", {id, center});
  }
  const emptyState = capital === 0;
  if ((!emptyState && (!Number.isInteger(capital) || capital <= 0 || !burg || burg.removed || Number(burg.cell) !== center))
    || Number(map.pack.cells.state?.[center]) !== id) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_state_capital", "锁定国家缺少一致的首都与领土镜像", {id, capital, center});
  }
}

function validateProvince(map, reference, province) {
  const id = Number(province.id ?? province.i);
  const stateId = Number(province.state);
  const center = Number(province.center);
  const burgId = Number(province.burg || 0);
  if (!Number.isInteger(id) || id <= 0 || !map?.pack?.provinces?.[id] || map.pack.provinces[id].removed) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_province_mirror", "锁定省份缺少一致的 pack 对象", {id});
  }
  if (!map?.pack?.states?.[stateId] || map.pack.states[stateId].removed) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_province_parent", "锁定省份引用了无效父国", {id, stateId});
  }
  if (!Number.isInteger(center) || center < 0 || center >= Number(map?.pack?.cells?.i?.length || 0) || map.pack.cells.h?.[center] < 20 || Number(map.pack.cells.state?.[center]) !== stateId || Number(map.pack.cells.province?.[center]) !== id) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_province_center", "锁定省份缺少一致的中心与领土镜像", {id, stateId, center});
  }
  if (burgId) {
    const burg = map?.pack?.burgs?.[burgId];
    if (!burg || burg.removed || Number(burg.cell) !== center) {
      throw regenerationLockConflict(reference.kind, reference, "invalid_province_burg", "锁定省份缺少一致的省会 burg", {id, burgId, center});
    }
  }
}

function validateRiver(map, reference, river) {
  try {
    prepareRiverRegenerationLocks(map?.pack, [river]);
  } catch (error) {
    if (error?.code === "regeneration_lock_conflict") throw error;
    throw regenerationLockConflict(reference.kind, reference, "invalid_river_constraint", "锁定河流约束无效", {cause: error?.message || String(error)});
  }
}

function validateSocialObject(map, reference, object, config) {
  const id = Number(object?.i ?? object?.id);
  const societyObject = map?.society?.[config.plural]?.[id];
  const packObject = map?.pack?.[config.plural]?.[id];
  if (!Number.isInteger(id) || id <= 0 || !societyObject || societyObject.removed || !packObject || packObject.removed) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_social_mirror", `锁定${config.label}缺少 society / pack 对象`, {id});
  }
  if (stableSnapshot(societyObject) !== stableSnapshot(packObject) || stableSnapshot(object) !== stableSnapshot(societyObject)) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_social_mirror", `锁定${config.label}的 society / pack 镜像不一致`, {id});
  }
  try {
    prepareSocialRegenerationLocks({
      grid: map.grid,
      pack: map.pack,
      objects: [object],
      ...config
    });
  } catch (error) {
    if (error?.code === "regeneration_lock_conflict") throw error;
    throw regenerationLockConflict(reference.kind, reference, "invalid_social_constraint", `锁定${config.label}约束无效`, {
      id,
      cause: error?.message || String(error)
    });
  }
}

function validateFeature(map, reference, feature) {
  const id = Number(feature?.i ?? feature?.id);
  const packFeature = map?.pack?.features?.[id];
  const packCells = memberCells(map?.pack?.cells?.f, id);
  if (!Number.isInteger(id) || id <= 0 || !packFeature || packFeature.removed || !packCells.length) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_feature_mirror", "锁定 Feature 缺少 pack 对象或成员 cell", {id});
  }
  if (stableSnapshot(feature) !== stableSnapshot(packFeature)) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_feature_mirror", "锁定 Feature 对象与 pack 镜像不一致", {id});
  }
  const gridIds = [...new Set(packCells.map(cell => Number(map?.grid?.cells?.f?.[map?.pack?.cells?.g?.[cell]])).filter(value => value > 0))];
  if (gridIds.length !== 1) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_feature_grid_mirror", "锁定 Feature 缺少唯一 grid 镜像", {id, gridIds});
  }
  const gridId = gridIds[0];
  const gridFeature = map?.features?.features?.[gridId] || map?.grid?.features?.[gridId];
  const gridCells = memberCells(map?.grid?.cells?.f, gridId);
  if (!gridFeature || gridFeature.removed || !gridCells.length
    || Boolean(gridFeature.land) !== Boolean(packFeature.land)
    || String(gridFeature.type) !== String(packFeature.type)) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_feature_grid_mirror", "锁定 Feature 的 pack / grid 类型或成员镜像不一致", {id, gridId});
  }
  for (const cell of packCells) validateFeatureCell(map, reference, packFeature, cell);
  for (const cell of gridCells) {
    const land = Number(map?.grid?.cells?.h?.[cell]) >= 20;
    if (land !== Boolean(gridFeature.land)) {
      throw regenerationLockConflict(reference.kind, reference, "invalid_feature_terrain", "锁定 Feature 的 grid 水陆成员矛盾", {id, gridId, cell});
    }
  }
}

function validateFeatureCell(map, reference, feature, cell) {
  const land = Number(map?.pack?.cells?.h?.[cell]) >= 20;
  if (land !== Boolean(feature.land) || String(map?.pack?.cells?.type?.[cell] || "") !== String(feature.type || "")) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_feature_terrain", "锁定 Feature 的 pack 水陆或类型成员矛盾", {
      id: Number(feature.i ?? feature.id),
      cell
    });
  }
  const haven = Number(map?.pack?.cells?.haven?.[cell]);
  const harbor = Number(map?.pack?.cells?.harbor?.[cell]);
  if (!Number.isFinite(haven) || !Number.isFinite(harbor)) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_feature_harbor", "锁定 Feature 的 haven / harbor assignment 无效", {
      id: Number(feature.i ?? feature.id),
      cell
    });
  }
  if (harbor > 0 && (!Number.isInteger(haven) || haven < 0 || haven >= Number(map?.pack?.cells?.h?.length || 0) || Number(map.pack.cells.h[haven]) >= 20)) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_feature_harbor", "锁定 Feature 的港湾没有有效水域 haven", {
      id: Number(feature.i ?? feature.id),
      cell,
      haven,
      harbor
    });
  }
}

function validateCity(map, reference, city) {
  const packCell = Number(city.packCell);
  const gridCell = Number(city.cell);
  const burgId = Number(city.burgId);
  if (!Number.isInteger(packCell) || packCell < 0 || packCell >= Number(map?.pack?.cells?.i?.length || 0)) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_city_pack_cell", "锁定城镇引用了无效 pack cell", {packCell});
  }
  if (!Number.isInteger(gridCell) || gridCell < 0 || gridCell >= Number(map?.grid?.cells?.h?.length || 0)) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_city_grid_cell", "锁定城镇引用了无效 grid cell", {gridCell});
  }
  const burg = map?.pack?.burgs?.[burgId];
  if (!Number.isInteger(burgId) || burgId <= 0 || !burg || burg.removed || Number(burg.cell) !== packCell) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_city_burg", "锁定城镇缺少一致的 pack burg 镜像", {burgId, packCell});
  }
  const packBurgIds = burgIdsAtPackCell(map, packCell);
  const gridCityIds = cityIdsAtGridCell(map, gridCell);
  if (!packBurgIds.includes(burgId) || !gridCityIds.includes(Number(city.id))
    || Number(map?.pack?.cells?.burg?.[packCell]) !== packBurgIds[0]
    || Number(map?.grid?.cells?.burg?.[gridCell]) !== gridCityIds[0]) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_city_cell_mirror", "锁定城镇与 pack cell 的 burg 镜像不一致", {burgId, packCell});
  }
}

function validateRoute(map, reference, route) {
  const id = Number(route.id ?? route.i);
  const packCells = route.packCells;
  if (!Number.isInteger(id) || id < 0 || !Array.isArray(packCells) || packCells.length < 2) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_route_path", "锁定道路缺少有效 ID 或路径", {id});
  }
  if (!Array.isArray(route.points) || route.points.length !== packCells.length || !Array.isArray(route.cells) || route.cells.length !== packCells.length) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_route_mirror", "锁定道路路径镜像不完整", {id});
  }
  for (let index = 0; index < packCells.length; index++) {
    const cell = Number(packCells[index]);
    if (!Number.isInteger(cell) || cell < 0 || cell >= Number(map?.pack?.cells?.i?.length || 0)) {
      throw regenerationLockConflict(reference.kind, reference, "invalid_route_cell", "锁定道路包含无效 pack cell", {id, cell});
    }
    if (index && !(map?.pack?.cells?.c?.[packCells[index - 1]] || []).includes(cell)) {
      throw regenerationLockConflict(reference.kind, reference, "invalid_route_topology", "锁定道路路径不连续", {
        id,
        from: packCells[index - 1],
        to: cell
      });
    }
  }
}

function diplomacyPairObjects(map) {
  const states = (map?.pack?.states || map?.politics?.states || [])
    .filter(state => state?.i && !state.removed);
  const pairs = [];
  for (let left = 0; left < states.length; left++) {
    for (let right = left + 1; right < states.length; right++) {
      pairs.push({
        id: diplomacyPairKey(states[left].i, states[right].i),
        leftId: Number(states[left].i),
        rightId: Number(states[right].i)
      });
    }
  }
  return pairs;
}

function militaryRegimentObjects(map) {
  return (map?.pack?.states || map?.politics?.states || [])
    .filter(state => state?.i && !state.removed)
    .flatMap(state => (state.military || []).map(regiment => ({
      id: `${state.i}:${regiment.i}`,
      stateId: Number(state.i),
      regimentId: Number(regiment.i)
    })));
}

function validateDiplomacyRelation(map, reference) {
  const identity = parseDiplomacyPairIdentity(reference);
  if (!identity) {
    throw regenerationLockConflict(reference.kind, reference, "invalid-pair", "锁定外交关系缺少有效国家对");
  }
  captureDiplomacyRelationSnapshot(map?.pack, identity.leftId, identity.rightId);
}

function validateMilitaryRegiment(map, reference) {
  captureMilitaryRegimentSnapshot(map?.pack, reference);
}

function validateEconomyMarket(map, reference, market) {
  const id = Number(market?.i ?? market?.id);
  const centerBurgId = Number(market?.centerBurgId);
  const cell = Number(market?.cell);
  const burg = map?.pack?.burgs?.[centerBurgId];
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(centerBurgId) || centerBurgId <= 0
    || !Number.isInteger(cell) || cell < 0 || cell >= Number(map?.pack?.cells?.i?.length || 0)
    || !burg?.i || burg.removed || Number(burg.cell) !== cell) {
    throw regenerationLockConflict(reference.kind, reference, "invalid-market-center", "锁定市场缺少一致的中心城市", {
      marketId: id,
      centerBurgId,
      cell
    });
  }
}

function validateTradeFlow(map, reference, deal) {
  const id = Number(deal?.i ?? deal?.id);
  const goodId = Number(deal?.good);
  if (!Number.isInteger(id) || id < 0 || !findNumericObject(map?.pack?.goods, goodId)) {
    throw regenerationLockConflict(reference.kind, reference, "missing-deal-good", "锁定交易引用了不存在的商品", {dealId: id, goodId});
  }
  validateTradeParty(map, reference, deal, "seller");
  validateTradeParty(map, reference, deal, "buyer");
  if (deal.path === undefined || deal.path === null) return;
  if (!Array.isArray(deal.path) || !deal.path.length) {
    throw regenerationLockConflict(reference.kind, reference, "invalid-deal-path", "锁定交易路径无效", {dealId: id});
  }
  for (let index = 0; index < deal.path.length; index++) {
    const cell = Number(deal.path[index]);
    if (!Number.isInteger(cell) || cell < 0 || cell >= Number(map?.pack?.cells?.i?.length || 0)) {
      throw regenerationLockConflict(reference.kind, reference, "invalid-deal-path-cell", "锁定交易路径包含无效 cell", {dealId: id, cell});
    }
    if (index && !(map?.pack?.cells?.c?.[deal.path[index - 1]] || []).includes(cell)) {
      throw regenerationLockConflict(reference.kind, reference, "disconnected-deal-path", "锁定交易路径不连续", {
        dealId: id,
        from: deal.path[index - 1],
        to: cell
      });
    }
  }
}

function validateTradeParty(map, reference, deal, side) {
  const type = deal?.[`${side}Type`];
  const id = Number(deal?.[side]);
  if (type === "market" && findNumericObject(map?.pack?.markets, id)) return;
  if (type === "burg") {
    const burg = map?.pack?.burgs?.[id];
    if (burg?.i && !burg.removed && findNumericObject(map?.pack?.markets, Number(burg.market))) return;
  }
  throw regenerationLockConflict(reference.kind, reference, type === "burg" ? "missing-deal-burg" : "missing-deal-market", "锁定交易引用了无效端点", {
    dealId: Number(deal?.i ?? deal?.id),
    side,
    type,
    id
  });
}

function findNumericObject(collection, id) {
  if (!Number.isInteger(id)) return null;
  return (collection || []).find(object => Number(object?.i ?? object?.id) === id) || null;
}

function captureRelatedSnapshot(map, reference, object) {
  if (reference.kind === OBJECT_KIND.STATE) return captureStateMirrors(map, object);
  if (reference.kind === OBJECT_KIND.PROVINCE) return captureProvinceMirrors(map, object);
  if (reference.kind === OBJECT_KIND.CITY) return captureCityMirrors(map, object);
  if (reference.kind === OBJECT_KIND.ROUTE) return captureRouteMirrors(map, object);
  if (reference.kind === OBJECT_KIND.RIVER) return captureRiverMirrors(map, object);
  if (reference.kind === OBJECT_KIND.CULTURE) return captureSocialMirrors(map, object, "culture", "cultures");
  if (reference.kind === OBJECT_KIND.RELIGION) return captureSocialMirrors(map, object, "religion", "religions");
  if (reference.kind === OBJECT_KIND.FEATURE) return captureFeatureMirrors(map, object);
  if (reference.kind === OBJECT_KIND.MARKER) {
    return {packMarker: clone((map?.pack?.markers || []).find(marker => String(marker?.id ?? marker?.i) === String(reference.id)) || null)};
  }
  if (reference.kind === OBJECT_KIND.ZONE) {
    return {packZone: clone((map?.pack?.zones || []).find(zone => String(zone?.id ?? zone?.i) === String(reference.id)) || null)};
  }
  if (reference.kind === OBJECT_KIND.DIPLOMACY_RELATION) return captureDiplomacyMirrors(map, object);
  if (reference.kind === OBJECT_KIND.MILITARY) return captureMilitaryMirrors(map, object);
  if (reference.kind === OBJECT_KIND.ECONOMY_MARKET) return captureEconomyMarketMirrors(map, object);
  if (reference.kind === OBJECT_KIND.TRADE_FLOW) return captureTradeFlowMirrors(map, object);
  return null;
}

function captureDiplomacyMirrors(map, snapshot) {
  return {
    politics: [snapshot.leftId, snapshot.rightId].map(id => {
      const state = map?.politics?.states?.[id];
      return {
        id,
        relation: state?.diplomacy?.[id === snapshot.leftId ? snapshot.rightId : snapshot.leftId],
        campaigns: clone((state?.campaigns || []).filter(campaign =>
          diplomacyPairKey(campaign?.attacker, campaign?.defender) === snapshot.id
        ))
      };
    })
  };
}

function captureMilitaryMirrors(map, snapshot) {
  const politicsState = map?.politics?.states?.[snapshot.stateId];
  const mirror = (politicsState?.military || []).find(regiment => Number(regiment?.i) === snapshot.regimentId);
  return {
    politicsRegiment: clone(mirror || null),
    politicsState: politicsState ? pickFields(politicsState, ["i", "id", "name", "center", "capital", "removed"]) : null
  };
}

function captureEconomyMarketMirrors(map, market) {
  const id = Number(market?.i ?? market?.id);
  const centerBurgId = Number(market?.centerBurgId);
  const burg = map?.pack?.burgs?.[centerBurgId];
  return {
    packMarket: clone(findNumericObject(map?.pack?.markets, id)),
    economyMarket: clone(findNumericObject(map?.economy?.markets, id)),
    ownedCells: memberCells(map?.pack?.cells?.market, id),
    centerBurg: captureBurgIdentity(burg),
    centerCity: captureCityIdentity(map, burg)
  };
}

function captureTradeFlowMirrors(map, deal) {
  const id = Number(deal?.i ?? deal?.id);
  return {
    packDeal: clone(findNumericObject(map?.pack?.deals, id)),
    economyDeal: clone(findNumericObject(map?.economy?.deals, id)),
    good: captureGoodIdentity(findNumericObject(map?.pack?.goods, Number(deal?.good))),
    seller: captureTradePartyIdentity(map, deal?.sellerType, deal?.seller),
    buyer: captureTradePartyIdentity(map, deal?.buyerType, deal?.buyer),
    path: clone(deal?.path || null),
    pathAssignments: Array.isArray(deal?.path)
      ? captureCellAssignments(map?.pack?.cells, deal.path, ["market", "state", "burg"])
      : null
  };
}

function captureTradePartyIdentity(map, type, value) {
  const id = Number(value);
  if (type === "market") {
    const market = findNumericObject(map?.pack?.markets, id);
    const burg = map?.pack?.burgs?.[Number(market?.centerBurgId)];
    return {
      type,
      id,
      market: market ? pickFields(market, ["i", "id", "centerBurgId", "cell", "state"]) : null,
      burg: captureBurgIdentity(burg),
      city: captureCityIdentity(map, burg),
      state: capturePoliticalStateIdentity(map, Number(market?.state))
    };
  }
  const burg = map?.pack?.burgs?.[id];
  return {
    type,
    id,
    burg: captureBurgIdentity(burg),
    city: captureCityIdentity(map, burg),
    state: capturePoliticalStateIdentity(map, Number(burg?.state))
  };
}

function captureBurgIdentity(burg) {
  return burg ? pickFields(burg, ["i", "id", "cell", "state", "province", "market", "cityId", "removed"]) : null;
}

function captureCityIdentity(map, burg) {
  const city = (map?.settlements?.cities || []).find(item =>
    Number(item?.burgId) === Number(burg?.i) || item?.id === burg?.cityId
  );
  return city ? pickFields(city, ["id", "burgId", "packCell", "cell", "state", "province", "removed"]) : null;
}

function capturePoliticalStateIdentity(map, id) {
  const packState = map?.pack?.states?.[id];
  const politicsState = map?.politics?.states?.[id];
  return {
    pack: packState ? pickFields(packState, ["i", "id", "center", "capital", "removed"]) : null,
    politics: politicsState ? pickFields(politicsState, ["i", "id", "center", "capital", "removed"]) : null
  };
}

function captureGoodIdentity(good) {
  return good ? pickFields(good, ["i", "id", "name", "type", "category", "removed"]) : null;
}

function captureSocialMirrors(map, object, field, plural) {
  const id = Number(object?.i ?? object?.id);
  const references = [Number(object?.parent) || 0, ...(object?.origins || []).map(Number)]
    .filter(reference => Number.isInteger(reference) && reference >= 0);
  return {
    societyObject: clone(map?.society?.[plural]?.[id] || null),
    packObject: clone(map?.pack?.[plural]?.[id] || null),
    packCells: memberCells(map?.pack?.cells?.[field], id),
    gridCells: memberCells(map?.grid?.cells?.[field], id),
    center: Number(object?.center),
    gridCenter: Number(object?.gridCenter),
    inheritance: references.map(reference => ({
      id: reference,
      societyExists: Boolean(map?.society?.[plural]?.[reference] && !map.society[plural][reference].removed),
      packExists: Boolean(map?.pack?.[plural]?.[reference] && !map.pack[plural][reference].removed)
    }))
  };
}

function captureFeatureMirrors(map, feature) {
  const id = Number(feature?.i ?? feature?.id);
  const packCells = memberCells(map?.pack?.cells?.f, id);
  const gridId = [...new Set(packCells.map(cell => Number(map?.grid?.cells?.f?.[map?.pack?.cells?.g?.[cell]])).filter(value => value > 0))][0] || 0;
  const gridCells = memberCells(map?.grid?.cells?.f, gridId);
  return {
    packFeature: clone(map?.pack?.features?.[id] || null),
    gridFeature: clone(map?.features?.features?.[gridId] || map?.grid?.features?.[gridId] || null),
    gridId,
    packCells,
    gridCells,
    packAssignments: captureCellAssignments(map?.pack?.cells, packCells, ["f", "h", "type", "haven", "harbor"]),
    gridAssignments: captureCellAssignments(map?.grid?.cells, gridCells, ["f", "h"]),
    shore: {
      pack: clone(map?.pack?.features?.[id]?.shoreline || null),
      grid: clone((map?.features?.features?.[gridId] || map?.grid?.features?.[gridId])?.shoreline || null)
    },
    references: captureDirectFeatureReferences(map, id)
  };
}

function captureCellAssignments(cells, members, fields) {
  return Object.fromEntries(fields.map(field => [field, members.map(cell => clone(cells?.[field]?.[cell]))]));
}

function captureDirectFeatureReferences(map, id) {
  const references = [];
  const collections = [
    ["pack.burgs", map?.pack?.burgs],
    ["settlements.cities", map?.settlements?.cities],
    ["pack.routes", map?.pack?.routes],
    ["settlements.routes", map?.settlements?.routes],
    ["markers.markers", map?.markers?.markers],
    ["pack.portDiagnostics.features", map?.pack?.portDiagnostics?.features]
  ];
  for (const [collection, objects] of collections) {
    for (let index = 0; index < (objects?.length || 0); index++) {
      const object = objects[index];
      if (!object) continue;
      if (Number(object.feature) !== id && Number(object.port) !== id && Number(object.data?.feature) !== id) continue;
      const record = {
        collection,
        id: clone(object.id ?? object.i ?? null),
        feature: clone(object.feature),
        port: clone(object.port),
        dataFeature: clone(object.data?.feature)
      };
      if (!["pack.routes", "settlements.routes", "markers.markers"].includes(collection)) record.index = index;
      references.push(record);
    }
  }
  return references;
}

function captureStateMirrors(map, state) {
  const id = Number(state.id ?? state.i);
  const capital = Number(state.capital);
  return {
    packState: clone(map?.pack?.states?.[id] || null),
    packCells: memberCells(map?.pack?.cells?.state, id),
    gridCells: memberCells(map?.grid?.cells?.state, id),
    capitalBurg: clone(map?.pack?.burgs?.[capital] || null),
    supportingCities: capturePoliticalCities(map, {stateId: id}),
    supportingProvinces: (state.provinces || []).map(provinceId => {
      const province = map?.pack?.provinces?.[provinceId] || map?.politics?.provinces?.[provinceId];
      return {
        province: clone(province || null),
        packCells: memberCells(map?.pack?.cells?.province, Number(provinceId)),
        gridCells: memberCells(map?.grid?.cells?.province, Number(provinceId))
      };
    })
  };
}

function captureProvinceMirrors(map, province) {
  const id = Number(province.id ?? province.i);
  const stateId = Number(province.state);
  const burgId = Number(province.burg || 0);
  return {
    packProvince: clone(map?.pack?.provinces?.[id] || null),
    packCells: memberCells(map?.pack?.cells?.province, id),
    gridCells: memberCells(map?.grid?.cells?.province, id),
    parentStateId: stateId,
    centerStateId: Number(map?.pack?.cells?.state?.[province.center]),
    centerBurg: clone(burgId ? map?.pack?.burgs?.[burgId] || null : null),
    supportingCities: capturePoliticalCities(map, {provinceId: id})
  };
}

function memberCells(values, id) {
  const cells = [];
  for (let cell = 0; cell < (values?.length || 0); cell++) if (Number(values[cell]) === id) cells.push(cell);
  return cells;
}

function changedTopLevelFields(before, after) {
  const fields = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...fields].filter(field => stableSnapshot(before?.[field]) !== stableSnapshot(after?.[field]));
}

function summarizeTopLevelChanges(before, after) {
  return Object.fromEntries(changedTopLevelFields(before, after).map(field => {
    const previous = before?.[field];
    const current = after?.[field];
    if (Array.isArray(previous) && Array.isArray(current) && previous.every(Number.isFinite) && current.every(Number.isFinite)) {
      const previousSet = new Set(previous);
      const currentSet = new Set(current);
      return [field, {
        before: previous.length,
        after: current.length,
        removed: previous.filter(value => !currentSet.has(value)).slice(0, 12),
        added: current.filter(value => !previousSet.has(value)).slice(0, 12)
      }];
    }
    if (Array.isArray(previous) && Array.isArray(current)) {
      const previousRows = previous.map(stableSnapshot);
      const currentRows = current.map(stableSnapshot);
      const previousSet = new Set(previousRows);
      const currentSet = new Set(currentRows);
      return [field, {
        before: previous.length,
        after: current.length,
        removed: previousRows.filter(value => !currentSet.has(value)).slice(0, 6),
        added: currentRows.filter(value => !previousSet.has(value)).slice(0, 6)
      }];
    }
    if (previous && current && typeof previous === "object" && typeof current === "object") {
      const fields = changedTopLevelFields(previous, current);
      return [field, {
        fields,
        changes: Object.fromEntries(fields.slice(0, 12).map(key => [key, {
          before: String(stableSnapshot(previous[key])).slice(0, 120),
          after: String(stableSnapshot(current[key])).slice(0, 120)
        }]))
      }];
    }
    return [field, {before: stableSnapshot(previous).slice(0, 240), after: stableSnapshot(current).slice(0, 240)}];
  }));
}

function capturePoliticalCities(map, {stateId = null, provinceId = null} = {}) {
  return (map?.settlements?.cities || []).filter(city => {
    if (!city || city.removed) return false;
    const packCell = Number(city.packCell);
    const ownerState = Number.isInteger(packCell) ? Number(map?.pack?.cells?.state?.[packCell]) : Number(city.state);
    const ownerProvince = Number.isInteger(packCell) ? Number(map?.pack?.cells?.province?.[packCell]) : Number(city.province);
    return (stateId !== null && ownerState === stateId) || (provinceId !== null && ownerProvince === provinceId);
  }).map(city => ({
    city: clone(city),
    mirror: captureCityMirrors(map, city)
  }));
}

function captureRiverMirrors(map, river) {
  const id = Number(river.id ?? river.i);
  const memberCells = (river.cells || []).filter(cell => Number.isInteger(cell) && cell >= 0);
  const notes = (map?.notes?.notes || []).filter(note => note?.kind === OBJECT_KIND.RIVER && String(note.objectId) === String(id));
  const lakeEdges = (map?.pack?.features || []).filter(feature => feature?.type === "lake" && (
    Number(feature.river) === id || Number(feature.outlet) === id || (feature.inlets || []).map(Number).includes(id)
  )).map(feature => ({
    id: Number(feature.i ?? feature.id),
    river: Number(feature.river) === id,
    outlet: Number(feature.outlet) === id,
    inlet: (feature.inlets || []).map(Number).includes(id)
  }));
  return {
    packRiver: clone((map?.pack?.rivers || []).find(item => Number(item?.id ?? item?.i) === id) || null),
    cells: memberCells.map(cell => ({
      cell,
      r: Number(map?.pack?.cells?.r?.[cell]) || 0,
      fl: Number(map?.pack?.cells?.fl?.[cell]) || 0,
      conf: Number(map?.pack?.cells?.conf?.[cell]) || 0
    })),
    lakeEdges,
    notes: clone(notes)
  };
}

function captureCityMirrors(map, city) {
  const burgId = Number(city.burgId);
  const packCell = Number(city.packCell);
  const gridCell = Number(city.cell);
  const state = map?.politics?.states?.[Number(city.state)] || map?.pack?.states?.[Number(city.state)];
  const province = map?.politics?.provinces?.[Number(city.province)] || map?.pack?.provinces?.[Number(city.province)];
  const provinceId = Number(province?.i ?? province?.id);
  const provinceCenter = Number(province?.center);
  const packProvince = map?.pack?.provinces?.[provinceId] || null;
  const packBurg = clone(map?.pack?.burgs?.[burgId] || null);
  if (packBurg) packBurg.provincial = Boolean(packBurg.provincial);
  const consistentProvinceAnchor = province
    && packProvince
    && Number(province.burg) === burgId
    && provinceCenter === packCell
    && Number(province.state) === Number(city.state)
    && ["state", "burg", "center", "gridCenter"].every(key => Number(packProvince[key] ?? 0) === Number(province[key] ?? 0))
    && Number(map?.pack?.cells?.province?.[provinceCenter]) === provinceId
    && Number(map?.pack?.cells?.state?.[provinceCenter]) === Number(province.state);
  return {
    packBurg,
    packCellBurg: Number(map?.pack?.cells?.burg?.[packCell]) || 0,
    packCellBurgIds: burgIdsAtPackCell(map, packCell),
    gridCellBurg: Number(map?.grid?.cells?.burg?.[gridCell]) || 0,
    gridCellCityIds: cityIdsAtGridCell(map, gridCell),
    stateAnchor: state && Number(state.capital) === burgId ? pickFields(state, ["capital", "center", "gridCenter", "capitalName"]) : null,
    provinceAnchor: consistentProvinceAnchor ? pickFields(province, ["burg", "center", "gridCenter"]) : null
  };
}

function captureRouteMirrors(map, route) {
  const id = Number(route.id ?? route.i);
  const links = [];
  for (let index = 0; index < route.packCells.length - 1; index++) {
    const from = route.packCells[index];
    const to = route.packCells[index + 1];
    links.push([from, to, map?.pack?.cells?.routes?.[from]?.[to] ?? null]);
  }
  const notes = (map?.notes?.notes || []).filter(note => note?.kind === OBJECT_KIND.ROUTE && String(note.objectId) === String(id));
  return {
    packRoute: captureRoutePackMirror(map?.pack?.routes?.[id]),
    links,
    notes: clone(notes)
  };
}

function captureRoutePackMirror(route) {
  if (!route) return null;
  return pickFields(route, ["i", "points"]);
}

function pickFields(source, fields) {
  return Object.fromEntries(fields.map(field => [field, clone(source?.[field])]));
}

function validateMarker(map, reference, marker) {
  const cell = Number(marker.packCell);
  const cells = map?.pack?.cells;
  if (!Number.isInteger(cell) || cell < 0 || cell >= Number(cells?.i?.length || 0)) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_marker_cell", "锁定资源点引用了无效地形 cell", {cell});
  }
  const point = cells?.p?.[cell];
  if (!Array.isArray(point) || point.length < 2 || point.some(value => !Number.isFinite(Number(value)))) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_marker_position", "锁定资源点缺少有效地图位置", {cell});
  }
}

function validateZone(map, reference, zone) {
  const cellCount = Number(map?.pack?.cells?.i?.length || 0);
  if (!Array.isArray(zone.cells) || !zone.cells.length || zone.cells.some(cell => !Number.isInteger(cell) || cell < 0 || cell >= cellCount)) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_zone_cells", "锁定地区包含无效地形 cell");
  }
  for (const field of ["attacker", "defender"]) {
    const stateId = Number(zone[field]);
    if (!stateId) continue;
    const state = map?.politics?.states?.[stateId] || map?.pack?.states?.[stateId];
    if (!state || state.removed) {
      throw regenerationLockConflict(reference.kind, reference, "invalid_zone_reference", `锁定地区引用了不存在的国家：${field} #${stateId}`, {field, stateId});
    }
  }
}

function validateOceanCurrent(map, reference, current) {
  const features = map?.features?.features || map?.grid?.features || [];
  const basin = features?.[Number(current.basinFeatureId)];
  if (!basin || basin.type !== "ocean") {
    throw regenerationLockConflict(reference.kind, reference, "invalid_current_basin", "锁定洋流引用了无效海盆", {basinFeatureId: current.basinFeatureId});
  }
  const segments = current?.path?.segments;
  if (!Array.isArray(segments) || !segments.length || segments.some(segment =>
    ["start", "control1", "control2", "end"].some(field =>
      !Array.isArray(segment?.[field]) || segment[field].length < 2 || segment[field].some(value => !Number.isFinite(Number(value)))
  ))) {
    throw regenerationLockConflict(reference.kind, reference, "invalid_current_path", "锁定洋流缺少有效路径");
  }
  for (const segment of segments) {
    for (let step = 0; step <= 16; step++) {
      const point = sampleCubic(segment, step / 16);
      const cell = nearestGridCell(map?.grid, point);
      const featureId = Number(map?.grid?.cells?.f?.[cell]);
      if (cell === null || Number(map?.grid?.cells?.h?.[cell]) >= 20 || featureId !== Number(current.basinFeatureId)) {
        throw regenerationLockConflict(reference.kind, reference, "invalid_current_terrain", "锁定洋流路径离开了有效海盆", {
          basinFeatureId: current.basinFeatureId,
          point
        });
      }
    }
  }
}

function sampleCubic(segment, t) {
  const mt = 1 - t;
  const weights = [mt ** 3, 3 * mt * mt * t, 3 * mt * t * t, t ** 3];
  const points = [segment.start, segment.control1, segment.control2, segment.end];
  return [
    points.reduce((sum, point, index) => sum + Number(point[0]) * weights[index], 0),
    points.reduce((sum, point, index) => sum + Number(point[1]) * weights[index], 0)
  ];
}

function nearestGridCell(grid, point) {
  if (!grid?.points?.length) return null;
  let best = null;
  let bestDistance = Infinity;
  for (let cell = 0; cell < Number(grid.cells?.h?.length || 0); cell++) {
    const gridPoint = grid.points[grid.cells?.p?.[cell] ?? cell] || grid.points[cell];
    if (!gridPoint) continue;
    const distance = (Number(gridPoint[0]) - point[0]) ** 2 + (Number(gridPoint[1]) - point[1]) ** 2;
    if (distance >= bestDistance) continue;
    best = cell;
    bestDistance = distance;
  }
  return best;
}

function stableSnapshot(value) {
  return JSON.stringify(sortPlain(clone(value))) ?? "undefined";
}

function sortPlain(value) {
  if (Array.isArray(value)) return value.map(sortPlain);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortPlain(value[key])]));
}

function clone(value) {
  return structuredClone(value);
}
