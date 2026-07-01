import {defaultCityVisual, normalizeCityVisualPatch, resolveCityVisual} from "./city-visuals.js";
import {cloneObjectNote, deleteObjectNote, objectNoteId, readObjectNote, restoreObjectNote} from "./object-notes.js";
import {OBJECT_KIND} from "./object-kinds.js";

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

export function createSetCityPopulationCommand(cityId, nextPopulation, {label = "城市人口"} = {}) {
  const normalizedCityId = normalizeCityId(cityId);
  const after = normalizePopulation(nextPopulation);
  let snapshot = null;

  return {
    label: `${label} #${normalizedCityId}`,
    effects: {
      ...CITY_POPULATION_EFFECTS,
      affected: [{kind: "city", id: normalizedCityId}]
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
    effects: {
      ...CITY_OWNER_SYNC_EFFECTS,
      affected: [{kind: "city", id: normalizedCityId}]
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
    effects: {
      ...CITY_VISUAL_EFFECTS,
      affected: [{kind: OBJECT_KIND.CITY, id: normalizedCityId}]
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
    effects: {
      ...CITY_VISUAL_EFFECTS,
      affected: [{kind: OBJECT_KIND.CITY, id: normalizedCityId}]
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
    effects: {
      ...CITY_NOTE_EFFECTS,
      affected: [{kind: OBJECT_KIND.CITY, id: normalizedCityId}]
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

function refreshSettlementDerivedStats(map) {
  refreshSettlementMetadata(map);
  refreshStateUrbanStats(map);
}

function refreshSettlementMetadata(map) {
  const settlements = map?.settlements;
  if (!settlements?.metadata) return;
  const cities = settlements.cities || [];
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
