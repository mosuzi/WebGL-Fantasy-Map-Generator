import {defaultCityVisual, normalizeCityVisualPatch, resolveCityVisual} from "./city-visuals.js";
import {namebaseRenameAffected, newObjectAffected, objectAffected} from "./edit-command-effects.js";
import {cloneObjectNote, deleteObjectNote, objectNoteId, readObjectNote, restoreObjectNote} from "./object-notes.js";
import {OBJECT_KIND} from "./object-kinds.js";
import {createChineseNameGenerator} from "../generator/names.js";

const CITY_POPULATION_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["city-population", "point-layers", "labels", "object-panels"])
});

const CITY_OWNER_SYNC_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["settlement-states", "city-provinces", "object-panels"])
});

const CITY_VISUAL_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["labels", "object-panels"])
});

const CITY_NOTE_EFFECTS = Object.freeze({
  render: "none",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["object-panels"])
});

const CITY_NAME_BATCH_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["object-name", "labels", "object-panels"])
});

const CITY_COLLECTION_EFFECTS = Object.freeze({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: Object.freeze(["settlement-states", "city-provinces", "city-population", "point-layers", "labels", "object-panels", "object-index", "state-statistics"])
});

export function createAddCityAtCellCommand(gridCell, {label = "新增城市", faultInjector = null} = {}) {
  const targetGridCell = normalizeGridCell(gridCell);
  let snapshot = null;
  let result = null;
  let inspection = null;
  return {
    label,
    domain: OBJECT_KIND.CITY,
    effects: {
      ...CITY_COLLECTION_EFFECTS,
      affected: newObjectAffected(OBJECT_KIND.CITY)
    },
    apply(context) {
      inspection = inspectCityCreation(context.map, targetGridCell);
      if (!inspection.valid) throw new Error(inspection.summary);
      snapshot ??= captureCityCollectionSnapshot(context.map);
      try {
        result = addCityAtGridCell(context.map, targetGridCell);
        faultInjector?.({stage: "after-create", result, map: context.map});
      } catch (error) {
        restoreCityCollectionSnapshot(context.map, snapshot);
        throw error;
      }
      this.effects.affected = objectAffected(OBJECT_KIND.CITY, result.cityId);
    },
    revert(context) {
      if (!snapshot) throw new Error("缺少可撤销的城市新增快照");
      restoreCityCollectionSnapshot(context.map, snapshot);
    },
    isNoop(context) {
      inspection = inspectCityCreation(context.map, targetGridCell);
      return !inspection.valid;
    },
    getInspection() {
      return inspection;
    },
    getResult() {
      return result;
    }
  };
}

export function inspectCityCreation(map, gridCell) {
  const targetGridCell = normalizeGridCell(gridCell);
  if (targetGridCell < 0 || targetGridCell >= (map?.grid?.cells?.i?.length || 0)) {
    return creationInspection(false, "grid-cell-invalid", "目标 grid cell 无效。", {gridCell: targetGridCell});
  }
  if (!isGridLandCell(map, targetGridCell)) {
    return creationInspection(false, "grid-cell-water", "目标 grid cell 不是陆地。", {gridCell: targetGridCell});
  }
  const packCell = choosePackCellForGridCell(map, targetGridCell);
  if (!Number.isInteger(packCell)) {
    return creationInspection(false, "pack-cell-missing", "目标 grid cell 没有可用的陆地 pack cell。", {gridCell: targetGridCell});
  }
  const burgId = normalizeOwnerId(map?.pack?.cells?.burg?.[packCell]);
  if (burgId > 0) {
    return creationInspection(false, "burg-cell-occupied", "目标 cell 已有城镇。", {gridCell: targetGridCell, packCell, burgId});
  }
  return creationInspection(true, "ok", "可以在目标 cell 创建城市。", {gridCell: targetGridCell, packCell});
}

export function createDeleteCityCommand(cityId, {label = "删除城市"} = {}) {
  const normalizedCityId = normalizeCityId(cityId);
  let snapshot = null;
  let result = null;
  return {
    label: `${label} #${normalizedCityId}`,
    domain: OBJECT_KIND.CITY,
    effects: {
      ...CITY_COLLECTION_EFFECTS,
      affected: objectAffected(OBJECT_KIND.CITY, normalizedCityId)
    },
    apply(context) {
      snapshot ??= captureCityCollectionSnapshot(context.map);
      result = deleteCity(context.map, normalizedCityId);
    },
    revert(context) {
      if (!snapshot) throw new Error("缺少可撤销的城市删除快照");
      restoreCityCollectionSnapshot(context.map, snapshot);
    },
    isNoop(context) {
      const city = context.map?.settlements?.cities?.[normalizedCityId];
      return !city || city.removed;
    },
    getResult() {
      return result;
    }
  };
}

export function createSetCityPopulationCommand(cityId, nextPopulation, {label = "城市人口"} = {}) {
  const normalizedCityId = normalizeCityId(cityId);
  const after = normalizePopulation(nextPopulation);
  let snapshot = null;

  return {
    label: `${label} #${normalizedCityId}`,
    domain: OBJECT_KIND.CITY,
    effects: {
      ...CITY_POPULATION_EFFECTS,
      affected: objectAffected(OBJECT_KIND.CITY, normalizedCityId)
    },
    apply(context) {
      if (after === null) throw new Error("城市人口必须是非负有限数");
      snapshot ??= captureCitySnapshot(context.map, normalizedCityId);
      if (!snapshot) throw new Error(`找不到城市 #${normalizedCityId}`);
      writeCityPopulation(context.map, normalizedCityId, after);
      refreshSettlementDerivedStats(context.map);
    },
    revert(context) {
      if (!snapshot) throw new Error("缺少可撤销的城市人口快照");
      restoreCityPopulation(context.map, snapshot);
      refreshSettlementDerivedStats(context.map);
    },
    isNoop(context) {
      if (after === null) throw new Error("城市人口必须是非负有限数");
      const city = context.map?.settlements?.cities?.[normalizedCityId];
      if (!city) return true;
      const burg = findBurgForCity(context.map, city);
      return normalizePopulation(city.population) === after && (!burg || normalizePopulation(burg.population) === after);
    }
  };
}

export function createSyncCityOwnerToCellCommand(cityId, {label = "同步城市归属"} = {}) {
  const normalizedCityId = normalizeCityId(cityId);
  let snapshot = null;
  let target = null;

  return {
    label: `${label} #${normalizedCityId}`,
    domain: OBJECT_KIND.CITY,
    effects: {
      ...CITY_OWNER_SYNC_EFFECTS,
      affected: objectAffected(OBJECT_KIND.CITY, normalizedCityId)
    },
    apply(context) {
      snapshot ??= captureCitySnapshot(context.map, normalizedCityId);
      if (!snapshot) throw new Error(`找不到城市 #${normalizedCityId}`);
      target ??= readCellOwner(context.map, normalizedCityId);
      if (!target) throw new Error(`城市 #${normalizedCityId} 缺少可同步的 cell 归属`);
      writeCityOwner(context.map, normalizedCityId, target);
      refreshSettlementDerivedStats(context.map);
    },
    revert(context) {
      if (!snapshot) throw new Error("缺少可撤销的城市归属快照");
      restoreCityOwner(context.map, snapshot);
      refreshSettlementDerivedStats(context.map);
    },
    isNoop(context) {
      const city = context.map?.settlements?.cities?.[normalizedCityId];
      const next = readCellOwner(context.map, normalizedCityId);
      if (!city || !next) return true;
      const burg = findBurgForCity(context.map, city);
      return normalizeOwnerId(city.state) === next.state
        && normalizeOwnerId(city.province) === next.province
        && (!burg || normalizeOwnerId(burg.state) === next.state)
        && (!hasOwn(burg, "province") || normalizeOwnerId(burg.province) === next.province);
    }
  };
}

export function createSetCityVisualCommand(cityId, patch = {}, {label = "调整城市剪影"} = {}) {
  const normalizedCityId = normalizeCityId(cityId);
  const nextPatch = normalizeCityVisualPatch(patch);
  let snapshot = null;

  return {
    label: `${label} #${normalizedCityId}`,
    domain: OBJECT_KIND.CITY,
    effects: {
      ...CITY_VISUAL_EFFECTS,
      affected: objectAffected(OBJECT_KIND.CITY, normalizedCityId)
    },
    apply(context) {
      snapshot ??= captureCityVisualSnapshot(context.map, normalizedCityId);
      if (!snapshot) throw new Error(`找不到城市 #${normalizedCityId}`);
      const {city, burg, culture} = readCityVisualTarget(context.map, normalizedCityId);
      const current = resolveCityVisual(city, culture, burg?.visual);
      writeCityVisual(city, burg, {...current, ...nextPatch, manual: true});
    },
    revert(context) {
      if (!snapshot) throw new Error("缺少可撤销的城市剪影快照");
      restoreCityVisualSnapshot(context.map, snapshot);
    },
    isNoop(context) {
      const city = context.map?.settlements?.cities?.[normalizedCityId];
      if (!city || !Object.keys(nextPatch).length) return true;
      const burg = findBurgForCity(context.map, city);
      const culture = readCityCulture(context.map, city, burg);
      const current = resolveCityVisual(city, culture, burg?.visual);
      return current.manual && Object.entries(nextPatch).every(([key, value]) => current[key] === value);
    }
  };
}

export function createResetCityVisualCommand(cityId, {label = "恢复城市自动剪影"} = {}) {
  const normalizedCityId = normalizeCityId(cityId);
  let snapshot = null;

  return {
    label: `${label} #${normalizedCityId}`,
    domain: OBJECT_KIND.CITY,
    effects: {
      ...CITY_VISUAL_EFFECTS,
      affected: objectAffected(OBJECT_KIND.CITY, normalizedCityId)
    },
    apply(context) {
      snapshot ??= captureCityVisualSnapshot(context.map, normalizedCityId);
      if (!snapshot) throw new Error(`找不到城市 #${normalizedCityId}`);
      const {city, burg, culture} = readCityVisualTarget(context.map, normalizedCityId);
      writeCityVisual(city, burg, defaultCityVisual(city, culture));
    },
    revert(context) {
      if (!snapshot) throw new Error("缺少可撤销的城市剪影快照");
      restoreCityVisualSnapshot(context.map, snapshot);
    },
    isNoop(context) {
      const city = context.map?.settlements?.cities?.[normalizedCityId];
      if (!city) return true;
      const burg = findBurgForCity(context.map, city);
      const culture = readCityCulture(context.map, city, burg);
      const current = resolveCityVisual(city, culture, burg?.visual);
      const automatic = defaultCityVisual(city, culture);
      return !current.manual
        && current.silhouette === automatic.silhouette
        && current.palette === automatic.palette
        && current.cultureStyle === automatic.cultureStyle;
    }
  };
}

export function createSetCityNoteCommand(cityId, body, {name = ""} = {}) {
  const normalizedCityId = normalizeCityId(cityId);
  const target = {kind: OBJECT_KIND.CITY, id: normalizedCityId};
  const normalizedBody = normalizeNoteBody(body);
  let previous = null;
  let next = null;

  return {
    label: normalizedBody ? `编辑城市备注 #${normalizedCityId}` : `清空城市备注 #${normalizedCityId}`,
    domain: OBJECT_KIND.CITY,
    effects: {
      ...CITY_NOTE_EFFECTS,
      affected: objectAffected(OBJECT_KIND.CITY, normalizedCityId)
    },
    apply(context) {
      const city = context.map?.settlements?.cities?.[normalizedCityId];
      if (!city) throw new Error(`找不到城市 #${normalizedCityId}`);
      previous ??= cloneObjectNote(readObjectNote(context.map, target));
      if (!normalizedBody) {
        deleteObjectNote(context.map, target);
        return;
      }
      next ??= createCityNoteSnapshot(target, normalizedBody, {
        name: name || city.name || `城市 #${normalizedCityId}`,
        previous
      });
      restoreObjectNote(context.map, next);
    },
    revert(context) {
      if (previous) restoreObjectNote(context.map, previous);
      else deleteObjectNote(context.map, target);
    },
    isNoop(context) {
      const city = context.map?.settlements?.cities?.[normalizedCityId];
      if (!city) return true;
      const current = readObjectNote(context.map, target)?.body || "";
      return current === normalizedBody;
    }
  };
}

export function createRenameCitiesFromNamebaseCommand(cityIds, {label = "按名称库重命名城市"} = {}) {
  const targets = uniqueCityIds(cityIds);
  let changes = null;

  return {
    label: `${label} ${targets.length} 个`,
    domain: OBJECT_KIND.CITY,
    effects: {
      ...CITY_NAME_BATCH_EFFECTS,
      affected: namebaseRenameAffected(OBJECT_KIND.CITY, targets)
    },
    apply(context) {
      changes ??= buildCityRenameChanges(context.map, targets);
      if (!changes.length) throw new Error("没有可重命名的城市");
      for (const change of changes) writeCityName(context.map, change.id, change.afterName);
    },
    revert(context) {
      if (!changes) throw new Error("缺少可撤销的城市名称快照");
      for (const change of changes) restoreCityName(context.map, change);
    },
    isNoop(context) {
      return !targets.length || !buildCityRenameChanges(context.map, targets).length;
    },
    getResult() {
      return {renamed: changes?.length || 0, total: targets.length};
    }
  };
}

function addCityAtGridCell(map, gridCell) {
  const packCell = choosePackCellForGridCell(map, gridCell);
  if (!Number.isInteger(packCell)) throw new Error("无法在当前 cell 创建城市");
  const state = normalizeOwnerId(map?.pack?.cells?.state?.[packCell] ?? map?.grid?.cells?.state?.[gridCell]);
  const province = normalizeOwnerId(map?.pack?.cells?.province?.[packCell] ?? map?.grid?.cells?.province?.[gridCell]);
  const culture = normalizeOwnerId(map?.pack?.cells?.culture?.[packCell] ?? map?.grid?.cells?.culture?.[gridCell]);
  const religion = normalizeOwnerId(map?.pack?.cells?.religion?.[packCell] ?? map?.grid?.cells?.religion?.[gridCell]);
  const [x, y] = map?.pack?.cells?.p?.[packCell] || [0, 0];
  const cityId = nextCityId(map);
  const burgId = nextBurgId(map);
  const population = Math.max(1, roundValue((map?.pack?.cells?.pop?.[packCell] || map?.grid?.cells?.pop?.[gridCell] || 1) + 2, 3));
  const generator = createChineseNameGenerator(`${map?.metadata?.seed || map?.options?.seed || "map"}|add-city|${cityId}`, {namebases: map?.namebases});
  const name = generator.makePlaceName({
    id: cityId,
    cell: packCell,
    culture,
    cultureRoot: readCultureRoot(map, culture),
    state,
    province,
    population,
    group: "town"
  }) || `新城${cityId}`;
  const cultureItem = readCityCulture(map, {culture}, null);
  const visual = defaultCityVisual({capital: false, provincial: false, port: 0, population, group: "town", type: "Generic"}, cultureItem);
  const city = {
    id: cityId,
    burgId,
    name,
    cell: gridCell,
    packCell,
    x,
    y,
    population,
    state,
    province,
    culture,
    religion,
    capital: false,
    provincial: false,
    port: 0,
    type: "Generic",
    group: "town",
    visual: clonePlain(visual)
  };
  const burg = {
    i: burgId,
    id: burgId,
    cityId,
    cell: packCell,
    x,
    y,
    state,
    province,
    culture,
    religion,
    name,
    feature: map?.pack?.cells?.f?.[packCell],
    capital: 0,
    port: 0,
    population,
    group: "town",
    type: "Generic",
    visual: clonePlain(visual)
  };
  map.settlements.cities[cityId] = city;
  map.pack.burgs[burgId] = burg;
  if (map.pack.cells.burg) map.pack.cells.burg[packCell] = burgId;
  refreshSettlementDerivedStats(map);
  return {cityId, burgId, packCell, gridCell};
}

function deleteCity(map, cityId) {
  const city = map?.settlements?.cities?.[cityId];
  if (!city || city.removed) throw new Error(`找不到城市 #${cityId}`);
  const burg = findBurgForCity(map, city);
  const burgId = burg?.i ?? burg?.id ?? city.burgId;
  const packCell = normalizePackCell(city.packCell ?? burg?.cell);
  city.removed = true;
  if (burg) burg.removed = true;
  if (Number.isInteger(packCell) && normalizeOwnerId(map?.pack?.cells?.burg?.[packCell]) === normalizeOwnerId(burgId)) {
    map.pack.cells.burg[packCell] = 0;
  }
  repairDeletedCityRoles(map, city, burg);
  refreshSettlementDerivedStats(map);
  return {cityId, burgId, packCell};
}

function captureCitySnapshot(map, cityId) {
  const city = map?.settlements?.cities?.[cityId];
  if (!city) return null;
  const burg = findBurgForCity(map, city);
  return {
    cityId,
    burgId: city.burgId,
    city: {
      population: city.population,
      state: city.state,
      province: city.province
    },
    burg: burg ? {
      population: burg.population,
      state: burg.state,
      province: burg.province,
      hasProvince: hasOwn(burg, "province")
    } : null
  };
}

function buildCityRenameChanges(map, cityIds) {
  if (!map?.settlements?.cities?.length) return [];
  const generator = createChineseNameGenerator(`${map.metadata?.seed || map.options?.seed || "map"}|explicit-city-rename|${map.metadata?.checksum || ""}`, {namebases: map.namebases});
  const changes = [];
  for (const id of cityIds) {
    const city = map.settlements.cities[id];
    if (!city) continue;
    const burg = findBurgForCity(map, city);
    const afterName = generator.makePlaceName(cityNameOptions(map, city, burg));
    const beforeName = city.name || burg?.name || "";
    if (!afterName || afterName === beforeName) continue;
    changes.push({
      id,
      burgId: city.burgId,
      beforeName,
      beforeBurgName: burg?.name || "",
      afterName
    });
  }
  return changes;
}

function cityNameOptions(map, city, burg) {
  return {
    id: city.id,
    culture: city.culture ?? burg?.culture,
    cultureRoot: readCultureRoot(map, city.culture ?? burg?.culture),
    port: Boolean(city.port || burg?.port),
    capital: Boolean(city.capital || burg?.capital),
    provincial: Boolean(city.provincial),
    group: city.group || burg?.group || "",
    population: Number(city.population ?? burg?.population ?? 0) || 0
  };
}

function readCultureRoot(map, cultureId) {
  const culture = map?.society?.cultures?.[cultureId] || map?.pack?.cultures?.[cultureId];
  return culture?.root || culture?.name || "";
}

function writeCityName(map, cityId, name) {
  const city = map?.settlements?.cities?.[cityId];
  if (!city) throw new Error(`找不到城市 #${cityId}`);
  city.name = name;
  const burg = findBurgForCity(map, city);
  if (burg) burg.name = name;
}

function restoreCityName(map, change) {
  const city = map?.settlements?.cities?.[change.id];
  if (city) city.name = change.beforeName;
  const burg = map?.pack?.burgs?.[change.burgId] || findBurgForCity(map, city);
  if (burg) burg.name = change.beforeBurgName;
}

function uniqueCityIds(cityIds) {
  return [...new Set((cityIds || []).map(id => Number(id)).filter(id => Number.isInteger(id) && id >= 0))];
}

function captureCityVisualSnapshot(map, cityId) {
  const city = map?.settlements?.cities?.[cityId];
  if (!city) return null;
  const burg = findBurgForCity(map, city);
  return {
    cityId,
    burgId: city.burgId,
    city: {
      hasVisual: hasOwn(city, "visual"),
      visual: cloneVisual(city.visual)
    },
    burg: burg ? {
      hasVisual: hasOwn(burg, "visual"),
      visual: cloneVisual(burg.visual)
    } : null
  };
}

function restoreCityVisualSnapshot(map, snapshot) {
  const city = map?.settlements?.cities?.[snapshot.cityId];
  if (city) restoreObjectVisual(city, snapshot.city);
  const burg = map?.pack?.burgs?.[snapshot.burgId] || findBurgForCity(map, city);
  if (burg && snapshot.burg) restoreObjectVisual(burg, snapshot.burg);
}

function restoreObjectVisual(object, snapshot) {
  if (snapshot.hasVisual) object.visual = cloneVisual(snapshot.visual);
  else delete object.visual;
}

function readCityVisualTarget(map, cityId) {
  const city = map?.settlements?.cities?.[cityId];
  if (!city) throw new Error(`找不到城市 #${cityId}`);
  const burg = findBurgForCity(map, city);
  return {city, burg, culture: readCityCulture(map, city, burg)};
}

function readCityCulture(map, city, burg) {
  const cultureId = city?.culture ?? burg?.culture ?? 0;
  return map?.society?.cultures?.[cultureId] || map?.pack?.cultures?.[cultureId] || null;
}

function writeCityVisual(city, burg, visual) {
  const next = cloneVisual(visual);
  city.visual = next;
  if (burg) burg.visual = cloneVisual(next);
}

function writeCityPopulation(map, cityId, population) {
  const city = map?.settlements?.cities?.[cityId];
  if (!city) throw new Error(`找不到城市 #${cityId}`);
  city.population = population;
  const burg = findBurgForCity(map, city);
  if (burg) burg.population = population;
}

function restoreCityPopulation(map, snapshot) {
  const city = map?.settlements?.cities?.[snapshot.cityId];
  if (city) city.population = snapshot.city.population;
  const burg = map?.pack?.burgs?.[snapshot.burgId] || findBurgForCity(map, city);
  if (burg && snapshot.burg) burg.population = snapshot.burg.population;
}

function readCellOwner(map, cityId) {
  const city = map?.settlements?.cities?.[cityId];
  if (!city) return null;
  const burg = findBurgForCity(map, city);
  const packCell = normalizePackCell(city.packCell ?? burg?.cell);
  const gridCell = normalizeGridCell(city.cell);
  const state = normalizeOwnerId(
    Number.isInteger(map?.pack?.cells?.state?.[packCell]) ? map.pack.cells.state[packCell] : map?.grid?.cells?.state?.[gridCell]
  );
  const province = normalizeOwnerId(
    Number.isInteger(map?.pack?.cells?.province?.[packCell]) ? map.pack.cells.province[packCell] : map?.grid?.cells?.province?.[gridCell]
  );
  if (!Number.isInteger(packCell) && !Number.isInteger(gridCell)) return null;
  return {state, province};
}

function writeCityOwner(map, cityId, owner) {
  const city = map?.settlements?.cities?.[cityId];
  if (!city) throw new Error(`找不到城市 #${cityId}`);
  city.state = owner.state;
  city.province = owner.province;
  const burg = findBurgForCity(map, city);
  if (!burg) return;
  burg.state = owner.state;
  if (hasOwn(burg, "province")) burg.province = owner.province;
}

function restoreCityOwner(map, snapshot) {
  const city = map?.settlements?.cities?.[snapshot.cityId];
  if (city) {
    city.state = snapshot.city.state;
    city.province = snapshot.city.province;
  }
  const burg = map?.pack?.burgs?.[snapshot.burgId] || findBurgForCity(map, city);
  if (burg && snapshot.burg) {
    burg.state = snapshot.burg.state;
    if (snapshot.burg.hasProvince) burg.province = snapshot.burg.province;
    else delete burg.province;
  }
}

function captureCityCollectionSnapshot(map) {
  return {
    cities: clonePlain(map?.settlements?.cities || []),
    burgs: clonePlain(map?.pack?.burgs || []),
    packBurg: cloneArrayLike(map?.pack?.cells?.burg),
    states: clonePlain(map?.politics?.states || []),
    packStates: map?.pack?.states === map?.politics?.states ? null : clonePlain(map?.pack?.states || []),
    provinces: clonePlain(map?.politics?.provinces || []),
    packProvinces: map?.pack?.provinces === map?.politics?.provinces ? null : clonePlain(map?.pack?.provinces || []),
    metadata: clonePlain(map?.settlements?.metadata || null)
  };
}

function restoreCityCollectionSnapshot(map, snapshot) {
  if (!map || !snapshot) return;
  if (map.settlements) {
    map.settlements.cities = clonePlain(snapshot.cities);
    map.settlements.metadata = clonePlain(snapshot.metadata);
  }
  if (map.politics) {
    map.politics.states = clonePlain(snapshot.states);
    map.politics.provinces = clonePlain(snapshot.provinces);
  }
  if (map.pack) {
    map.pack.burgs = clonePlain(snapshot.burgs);
    map.pack.states = snapshot.packStates ? clonePlain(snapshot.packStates) : map.politics?.states;
    map.pack.provinces = snapshot.packProvinces ? clonePlain(snapshot.packProvinces) : map.politics?.provinces;
  }
  restoreArrayLike(map?.pack?.cells, "burg", snapshot.packBurg);
}

function repairDeletedCityRoles(map, city, burg) {
  const stateId = normalizeOwnerId(city?.state ?? burg?.state);
  const provinceId = normalizeOwnerId(city?.province ?? burg?.province);
  if (city?.capital || burg?.capital) {
    const state = map?.politics?.states?.[stateId] || map?.pack?.states?.[stateId];
    const replacement = findReplacementCity(map, item => normalizeOwnerId(item.state) === stateId);
    if (state) {
      state.capital = replacement?.burgId || 0;
      state.capitalName = replacement?.name || "";
    }
    if (replacement) {
      replacement.capital = true;
      const replacementBurg = findBurgForCity(map, replacement);
      if (replacementBurg) {
        replacementBurg.capital = 1;
        replacementBurg.group = "capital";
      }
    }
  }
  if (city?.provincial) {
    const province = map?.politics?.provinces?.[provinceId] || map?.pack?.provinces?.[provinceId];
    const replacement = findReplacementCity(map, item => normalizeOwnerId(item.province) === provinceId);
    if (province) province.burg = replacement?.burgId || 0;
    if (replacement) replacement.provincial = true;
  }
}

function findReplacementCity(map, predicate) {
  return (map?.settlements?.cities || [])
    .filter(city => city && !city.removed && predicate(city))
    .sort((a, b) => Number(b.capital) - Number(a.capital) || Number(b.provincial) - Number(a.provincial) || (b.population || 0) - (a.population || 0) || a.id - b.id)[0] || null;
}

function refreshSettlementDerivedStats(map) {
  refreshSettlementMetadata(map);
  refreshStateUrbanStats(map);
}

function refreshSettlementMetadata(map) {
  const settlements = map?.settlements;
  if (!settlements?.metadata) return;
  const cities = (settlements.cities || []).filter(city => city && !city.removed);
  settlements.metadata.cities = cities.length;
  settlements.metadata.capitals = cities.filter(city => city?.capital).length;
  settlements.metadata.ports = cities.filter(city => city?.port).length;
  settlements.metadata.maxPopulation = maxValue(cities.map(city => city?.population || 0));
  settlements.metadata.packBurgs = map?.pack?.burgs ? Math.max(0, map.pack.burgs.length - 1) : settlements.metadata.packBurgs;
}

function refreshStateUrbanStats(map) {
  const states = map?.politics?.states;
  if (!states) return;
  for (const state of states) {
    if (!state) continue;
    state.urban = 0;
    state.burgs = 0;
  }
  for (const burg of map?.pack?.burgs || []) {
    if (!burg?.i || burg.removed) continue;
    const state = states[normalizeOwnerId(burg.state)];
    if (!state) continue;
    state.urban = roundValue((state.urban || 0) + (Number(burg.population) || 0), 2);
    state.burgs = (state.burgs || 0) + 1;
  }
}

function findBurgForCity(map, city) {
  if (!city) return null;
  return map?.pack?.burgs?.[city.burgId] || (map?.pack?.burgs || []).find(burg => burg?.cityId === city.id) || null;
}

function isValidCitySeedCell(map, gridCell) {
  return inspectCityCreation(map, gridCell).valid;
}

function creationInspection(valid, code, summary, details) {
  return {valid, allowed: valid, code, summary, details};
}

function choosePackCellForGridCell(map, gridCell) {
  const candidates = [];
  const byGrid = map?.pack?.cells?.g || [];
  for (let packCell = 0; packCell < byGrid.length; packCell += 1) {
    if (byGrid[packCell] === gridCell && map?.pack?.cells?.h?.[packCell] >= 20) candidates.push(packCell);
  }
  return candidates.sort((a, b) => a - b)[0] ?? null;
}

function isGridLandCell(map, gridCell) {
  if (map?.grid?.cells?.h?.[gridCell] < 20) return false;
  const featureId = map?.grid?.cells?.f?.[gridCell];
  const feature = map?.features?.features?.[featureId];
  return feature ? Boolean(feature.land) : true;
}

function nextCityId(map) {
  return map?.settlements?.cities?.length || 0;
}

function nextBurgId(map) {
  return map?.pack?.burgs?.length || 0;
}

function normalizeCityId(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : -1;
}

function normalizePopulation(value) {
  if (typeof value === "string" && value.trim() === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.round(numeric * 1000) / 1000;
}

function normalizeOwnerId(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? Math.max(0, numeric) : 0;
}

function normalizePackCell(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : null;
}

function normalizeGridCell(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : null;
}

function maxValue(values) {
  return values.reduce((max, value) => Math.max(max, Number(value) || 0), 0);
}

function roundValue(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function cloneVisual(visual) {
  return visual ? {...visual} : {};
}

function createCityNoteSnapshot(target, body, {name, previous = null} = {}) {
  const now = new Date().toISOString();
  return {
    id: objectNoteId(target),
    kind: target.kind,
    objectId: target.id,
    name,
    body,
    format: "plain",
    pinned: previous?.pinned || false,
    createdAt: previous?.createdAt || now,
    updatedAt: now
  };
}

function normalizeNoteBody(body) {
  return typeof body === "string" ? body.trim() : "";
}

function hasOwn(object, key) {
  return Boolean(object && Object.prototype.hasOwnProperty.call(object, key));
}

function clonePlain(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function cloneArrayLike(value) {
  if (!value) return null;
  if (ArrayBuffer.isView(value)) return new value.constructor(value);
  return Array.isArray(value) ? [...value] : null;
}

function restoreArrayLike(target, key, snapshot) {
  if (!target || !snapshot) return;
  if (ArrayBuffer.isView(target[key]) && ArrayBuffer.isView(snapshot) && target[key].length === snapshot.length) {
    target[key].set(snapshot);
    return;
  }
  target[key] = cloneArrayLike(snapshot);
}
