import {defineBiomesAndPopulation} from "./biomes.js";
import {applyOceanCurrentClimateInfluence, buildClimate} from "./climate.js";
import {buildDiplomacy} from "./diplomacy.js";
import {captureDiplomacyRelationSnapshot} from "./diplomacy-regeneration-locks.js";
import {buildEconomy} from "./economy.js";
import {buildMarkers, createMarkerResult} from "./markers.js";
import {buildMilitary} from "./military.js";
import {buildOceanCurrents} from "./ocean-currents.js";
import {reexpandPackPoliticsPreservingIdentity} from "./politics.js";
import {createRandom} from "./random.js";
import {buildRivers, renameHydronymsByCulture} from "./rivers.js";
import {finalizeSettlements, regenerateSettlementsWithinPolitics} from "./settlements.js";
import {reexpandSocietyCultures, reexpandSocietyReligions} from "./society.js";
import {resolveWarzoneStatePair} from "./war-consistency.js";
import {buildZones} from "./zones.js";

const WORLD_STAGE_CONSTRAINT_KEYS = Object.freeze({
  "ocean-currents": Object.freeze(["lockedOceanCurrents"]),
  climate: Object.freeze([]),
  rivers: Object.freeze(["lockedRivers"]),
  "biomes-population": Object.freeze([]),
  cultures: Object.freeze(["lockedCultures"]),
  "cities-routes": Object.freeze(["lockedCities", "lockedRoutes"]),
  "states-provinces": Object.freeze(["lockedStates", "lockedProvinces", "lockedCities", "lockedRoutes"]),
  religions: Object.freeze(["lockedReligions"]),
  "markers-economy": Object.freeze(["lockedFeatures", "lockedMarkers", "lockedMarkets", "lockedDeals"]),
  diplomacy: Object.freeze(["lockedDiplomacyRelations"]),
  "military-zones": Object.freeze(["lockedMilitaryRegiments", "lockedZones"])
});

const WORLD_STAGE_DOMAINS = Object.freeze({
  "ocean-currents": Object.freeze(["ocean-current"]),
  climate: Object.freeze([]),
  rivers: Object.freeze(["river"]),
  "biomes-population": Object.freeze([]),
  cultures: Object.freeze(["culture"]),
  "cities-routes": Object.freeze(["city", "route"]),
  "states-provinces": Object.freeze(["state", "province", "city", "route"]),
  religions: Object.freeze(["religion"]),
  "markers-economy": Object.freeze(["feature", "marker", "economy-market", "trade-flow"]),
  diplomacy: Object.freeze(["diplomacy-relation"]),
  "military-zones": Object.freeze(["military", "zone"])
});

export async function rebuildOceanCurrentWorldStage(map, system, {seed, signal, constraintBundle = null} = {}) {
  throwIfCancelled(signal);
  const options = {...map.options, seed: String(seed || map.options?.seed || map.metadata?.seed || "map"), namebases: map.namebases};
  const stageConstraints = oceanCurrentWorldStageConstraints(system, constraintBundle);
  const stageContext = {map, system, constraints: stageConstraints, constraintBundle};
  await assertWorldStageDomains(constraintBundle, "before", stageContext);
  if (await isWorldStageFullyLocked(constraintBundle, stageContext)) {
    await assertWorldStageDomains(constraintBundle, "after", stageContext);
    return {executed: false, reason: "domain-fully-locked", system};
  }
  let result;

  switch (system) {
    case "ocean-currents":
      map.oceanCurrents = buildOceanCurrents(map, {
        seed: `${options.seed}:currents`,
        preservedCurrents: stageConstraints.lockedOceanCurrents
      });
      result = {currents: map.oceanCurrents.currents.length};
      break;
    case "climate":
      map.climate = buildClimate(map.grid, map.features, options, createRandom(options.seed));
      applyOceanCurrentClimateInfluence(map.grid, map.features, map.climate, map.oceanCurrents);
      map.mapCoordinates = map.climate.mapCoordinates;
      result = {...map.climate.metadata.oceanCurrentInfluence};
      break;
    case "rivers": {
      const riverOptions = {
        ...options,
        ...stageConstraints,
        frozenRiverIds: stageConstraints.lockedRivers.map(river => Number(river?.i ?? river?.id)).filter(Number.isFinite),
        riverRegenerationSalt: `${options.seed}:world-rivers`
      };
      map.rivers = buildRivers(map.grid, map.features, map.pack, riverOptions);
      renameHydronymsByCulture(map.rivers, map.pack, riverOptions);
      result = {rivers: map.rivers.metadata.rivers};
      break;
    }
    case "biomes-population": {
      const biomes = defineBiomesAndPopulation(map.grid, map.pack, options);
      map.climate.biomes = biomes.biomes;
      map.climate.metadata.biomeCounts = biomes.metadata.biomeCounts;
      result = {...biomes.metadata};
      break;
    }
    case "cultures":
      repairSocietyCenters(map.pack, map.society.cultures, "culture");
      result = reexpandSocietyCultures(map.grid, map.pack, map.society.cultures, stageConstraints);
      syncSocietyCollections(map);
      break;
    case "cities-routes": {
      const lockedProvinces = collectPoliticalSupportProvinces(
        map,
        constraintBundle?.lockedStates,
        constraintBundle?.lockedProvinces
      );
      const lockedCities = collectPoliticalSupportCities(
        map,
        constraintBundle?.lockedStates,
        lockedProvinces,
        [
          ...stageConstraints.lockedCities,
          ...collectFeatureSupportObjects(map, constraintBundle?.lockedFeatures, "cities"),
          ...collectEconomicSupportCities(map, constraintBundle?.lockedMarkets, constraintBundle?.lockedDeals)
        ]
      );
      const lockedRoutes = mergeSupportSnapshots([
        ...stageConstraints.lockedRoutes,
        ...collectFeatureSupportObjects(map, constraintBundle?.lockedFeatures, "routes")
      ]);
      regenerateSettlementsWithinPolitics(map.grid, map.features, map.politics, map.settlements, map.pack, {
        ...options,
        ...stageConstraints,
        lockedStates: constraintBundle?.lockedStates || [],
        lockedProvinces,
        lockedCities,
        lockedRoutes,
        lockedFeatures: constraintBundle?.lockedFeatures || [],
        settlementRegenerationSalt: `${options.seed}:world-cities`,
        routeRegenerationSalt: `${options.seed}:world-routes`,
        reassessProvincialCapitals: true
      });
      result = {cities: map.settlements.metadata.cities, routes: map.settlements.metadata.routes};
      break;
    }
    case "states-provinces": {
      const lockedProvinces = collectPoliticalSupportProvinces(
        map,
        stageConstraints.lockedStates,
        stageConstraints.lockedProvinces
      );
      const lockedCities = collectPoliticalSupportCities(
        map,
        stageConstraints.lockedStates,
        lockedProvinces,
        [
          ...stageConstraints.lockedCities,
          ...collectFeatureSupportObjects(map, constraintBundle?.lockedFeatures, "cities"),
          ...collectEconomicSupportCities(map, constraintBundle?.lockedMarkets, constraintBundle?.lockedDeals)
        ]
      );
      const lockedRoutes = mergeSupportSnapshots([
        ...stageConstraints.lockedRoutes,
        ...collectFeatureSupportObjects(map, constraintBundle?.lockedFeatures, "routes")
      ]);
      synchronizePoliticalMirrorsForRebuild(map);
      const politics = reexpandPackPoliticsPreservingIdentity(map.grid, map.society, map.pack, map.settlements, {
        ...stageConstraints,
        lockedProvinces,
        lockedCities,
        lockedRoutes
      });
      if (!politics) throw new Error("当前地图缺少可保留身份的国家与省份数据");
      map.politics.states = map.pack.states = politics.states;
      map.politics.provinces = map.pack.provinces = politics.provinces;
      map.politics.metadata = {...map.politics.metadata, ...politics.metadata};
      finalizeSettlements(map.grid, map.features, map.politics, map.settlements, map.pack, {
        ...options,
        ...stageConstraints,
        lockedProvinces,
        lockedCities,
        lockedRoutes,
        lockedFeatures: constraintBundle?.lockedFeatures || [],
        routeRegenerationSalt: `${options.seed}:world-routes-final`,
        reassessProvincialCapitals: true
      });
      result = politics.metadata;
      break;
    }
    case "religions": {
      const lockedProvinces = collectPoliticalSupportProvinces(
        map,
        constraintBundle?.lockedStates,
        constraintBundle?.lockedProvinces
      );
      const lockedCities = collectPoliticalSupportCities(
        map,
        constraintBundle?.lockedStates,
        lockedProvinces,
        constraintBundle?.lockedCities
      );
      repairSocietyCenters(map.pack, map.society.religions, "religion");
      result = reexpandSocietyReligions(map.grid, map.pack, map.society.religions, map.settlements, {
        ...stageConstraints,
        lockedStates: constraintBundle?.lockedStates || [],
        lockedProvinces,
        lockedCities
      });
      syncSocietyCollections(map);
      restoreLockedPoliticalReligionFields(
        map,
        constraintBundle?.lockedStates,
        lockedProvinces,
        lockedCities
      );
      break;
    }
    case "markers-economy": {
      const lockedProvinces = collectPoliticalSupportProvinces(
        map,
        constraintBundle?.lockedStates,
        constraintBundle?.lockedProvinces
      );
      const lockedCities = collectPoliticalSupportCities(
        map,
        constraintBundle?.lockedStates,
        lockedProvinces,
        constraintBundle?.lockedCities
      );
      map.markers = rebuildMarkersPreservingManual(map, {
        ...options,
        lockedStates: constraintBundle?.lockedStates || [],
        lockedProvinces,
        lockedFeatures: stageConstraints.lockedFeatures
      }, mergeSupportSnapshots([
        ...stageConstraints.lockedMarkers,
        ...collectFeatureSupportObjects(map, constraintBundle?.lockedFeatures, "markers")
      ]));
      map.pack.markers = map.markers.markers;
      restoreLockedPoliticalMarkerEconomyFields(map, constraintBundle?.lockedStates, lockedProvinces);
      map.economy = buildEconomy(map.pack, {
        ...options,
        ...stageConstraints,
        lockedMarkets: collectEconomicSupportMarkets(map, stageConstraints.lockedMarkets, stageConstraints.lockedDeals),
        lockedStates: constraintBundle?.lockedStates || [],
        lockedProvinces,
        lockedCities
      });
      restoreLockedPoliticalMarkerEconomyFields(map, constraintBundle?.lockedStates, lockedProvinces);
      result = {markers: map.markers.metadata.markers, deals: map.economy.metadata.deals};
      break;
    }
    case "diplomacy": {
      const lockedDiplomacyRelations = mergeSupportSnapshots([
        ...stageConstraints.lockedDiplomacyRelations,
        ...collectLockedWarzoneDiplomacySupport(map.pack, constraintBundle?.lockedZones)
      ]);
      map.diplomacy = buildDiplomacy(map.pack, map.society, {
        ...options,
        ...stageConstraints,
        lockedDiplomacyRelations,
        lockedStates: constraintBundle?.lockedStates || [],
        diplomacyRegenerationSalt: `${options.seed}:world-diplomacy`
      });
      result = {...map.diplomacy.metadata};
      break;
    }
    case "military-zones": {
      map.military = buildMilitary(map.pack, {
        ...options,
        ...stageConstraints,
        lockedStates: constraintBundle?.lockedStates || [],
        seed: `${options.seed}:world-military`
      });
      const lockedZones = mergeSupportSnapshots([
        ...stageConstraints.lockedZones,
        ...(constraintBundle?.lockedZones || [])
      ]);
      map.zones = buildZones(map.pack, {
        ...options,
        seed: `${options.seed}:world-zones`,
        preservedZones: lockedZones
      });
      result = {regiments: map.military.metadata.regiments, zones: map.zones.metadata.zones};
      break;
    }
    default:
      throw new Error(`未知的洋流世界重算阶段：${system}`);
  }

  throwIfCancelled(signal);
  await assertWorldStageDomains(constraintBundle, "after", stageContext);
  return {executed: true, ...result};
}

export function oceanCurrentWorldStageConstraints(system, constraintBundle = null) {
  const keys = WORLD_STAGE_CONSTRAINT_KEYS[system];
  if (!keys) throw new Error(`未知的洋流世界重算阶段：${system}`);
  return Object.freeze(Object.fromEntries(keys.map(key => {
    const value = constraintBundle?.[key];
    return [key, Array.isArray(value) ? value : Object.freeze([])];
  })));
}

async function isWorldStageFullyLocked(constraintBundle, context) {
  if (typeof constraintBundle?.isDomainFullyLocked !== "function") return false;
  const domains = WORLD_STAGE_DOMAINS[context.system] || [];
  if (!domains.length) return false;
  for (const domain of domains) {
    if (!await constraintBundle.isDomainFullyLocked(domain, {...context, domain, phase: "skip"})) return false;
  }
  return true;
}

async function assertWorldStageDomains(constraintBundle, phase, context) {
  if (typeof constraintBundle?.assertDomain !== "function") return;
  const domains = Array.isArray(constraintBundle.selectedDomains) && constraintBundle.selectedDomains.length
    ? constraintBundle.selectedDomains
    : WORLD_STAGE_DOMAINS[context.system] || [];
  for (const domain of domains) {
    try {
      await constraintBundle.assertDomain(domain, {...context, domain, phase});
    } catch (error) {
      if (error instanceof Error) error.message = `[${context.system}:${phase}:${domain}] ${error.message}`;
      throw error;
    }
  }
}

export function snapshotOceanCurrentWorldIdentity(map) {
  return {
    cultures: snapshotIdentity(map?.society?.cultures || map?.pack?.cultures),
    states: snapshotIdentity(map?.politics?.states || map?.pack?.states),
    provinces: snapshotIdentity(map?.politics?.provinces || map?.pack?.provinces),
    religions: snapshotIdentity(map?.society?.religions || map?.pack?.religions)
  };
}

export function assertOceanCurrentWorldIdentity(map, before) {
  for (const [key, items] of Object.entries(before || {})) {
    const current = key === "states" || key === "provinces" ? map?.politics?.[key] || map?.pack?.[key] : map?.society?.[key] || map?.pack?.[key];
    const after = snapshotIdentity(current);
    for (const [id, identity] of items) {
      const next = after.get(id);
      if (!next || next.name !== identity.name || next.fullName !== identity.fullName) throw new Error(`${key} #${id} 的稳定身份或名称在世界重算中丢失`);
    }
  }
}

function rebuildMarkersPreservingManual(map, options, lockedMarkers = []) {
  const current = map.markers?.markers || map.pack?.markers || [];
  const lockedById = new Map((lockedMarkers || []).map(marker => [String(marker?.id ?? marker?.i), marker]));
  const protectedFeatureIds = new Set((options.lockedFeatures || [])
    .map(feature => Number(feature?.i ?? feature?.id))
    .filter(Number.isInteger));
  const preserved = current
    .filter(marker => {
      const id = String(marker?.id ?? marker?.i);
      return lockedById.has(id) || isManualMarker(marker) || markerTouchesFeature(marker, protectedFeatureIds);
    })
    .map(marker => structuredClone(lockedById.get(String(marker?.id ?? marker?.i)) || marker));
  const preservedKeys = new Set(preserved.map(marker => String(marker?.id ?? marker?.i)));
  for (const marker of lockedMarkers || []) {
    const id = String(marker?.id ?? marker?.i);
    if (preservedKeys.has(id)) continue;
    preserved.push(structuredClone(marker));
    preservedKeys.add(id);
  }
  const occupiedCells = new Set(preserved.map(marker => marker.packCell).filter(Number.isInteger));
  const generated = buildMarkers(map.grid, map.features, map.politics, map.rivers, map.pack, options).markers
    .filter(marker => !isManualMarker(marker) && !occupiedCells.has(marker.packCell));
  const preservedIds = new Set(preserved.map(marker => Number(marker.id ?? marker.i)).filter(Number.isInteger));
  let nextId = Math.max(-1, ...preservedIds) + 1;
  for (const marker of generated) {
    let id = Number(marker.id ?? marker.i);
    if (!Number.isInteger(id) || preservedIds.has(id)) id = nextUnusedId(preservedIds, nextId);
    marker.id = marker.i = id;
    preservedIds.add(id);
    nextId = Math.max(nextId, id + 1);
  }
  return createMarkerResult([...preserved, ...generated]);
}

function isManualMarker(marker) {
  return Boolean(marker?.pinned || marker?.lock || marker?.visual?.manual || marker?.data?.visual?.manual);
}

function markerTouchesFeature(marker, featureIds) {
  return featureIds.has(Number(marker?.feature))
    || featureIds.has(Number(marker?.data?.feature));
}

function restoreLockedPoliticalMarkerEconomyFields(map, lockedStates = [], lockedProvinces = []) {
  const fields = [
    "markerEconomicPotential",
    "markerEconomicMarkers",
    "resourcePotential",
    "resourceMarkers",
    "markerCategories",
    "resourceTypes"
  ];
  restoreFields([map?.politics?.states, map?.pack?.states], lockedStates);
  restoreFields([map?.politics?.provinces, map?.pack?.provinces], lockedProvinces);

  function restoreFields(collections, snapshots) {
    for (const snapshot of snapshots || []) {
    const id = Number(snapshot?.i ?? snapshot?.id);
    if (!Number.isInteger(id) || id <= 0) continue;
      for (const collection of collections) {
        const object = (collection || []).find(item => Number(item?.i ?? item?.id) === id);
        if (!object) continue;
      for (const field of fields) {
          if (Object.prototype.hasOwnProperty.call(snapshot, field)) object[field] = structuredClone(snapshot[field]);
          else delete object[field];
        }
      }
    }
  }
}

function restoreLockedPoliticalReligionFields(map, lockedStates = [], lockedProvinces = [], lockedCities = []) {
  for (const snapshot of lockedStates || []) restoreReligionField(
    [map?.politics?.states, map?.pack?.states],
    snapshot,
    snapshot?.i ?? snapshot?.id
  );
  for (const snapshot of lockedProvinces || []) restoreReligionField(
    [map?.politics?.provinces, map?.pack?.provinces],
    snapshot,
    snapshot?.i ?? snapshot?.id
  );
  for (const snapshot of lockedCities || []) {
    const id = String(snapshot?.id ?? snapshot?.i);
    const city = (map?.settlements?.cities || []).find(item => String(item?.id ?? item?.i) === id);
    copyReligionField(city, snapshot);
    const burgId = Number(snapshot?.burgId);
    if (Number.isInteger(burgId) && burgId > 0) copyReligionField(map?.pack?.burgs?.[burgId], snapshot);
  }
}

function restoreReligionField(collections, snapshot, id) {
  for (const collection of collections) {
    const target = (collection || []).find(item => String(item?.i ?? item?.id) === String(id));
    copyReligionField(target, snapshot);
  }
}

function copyReligionField(target, snapshot) {
  if (!target) return;
  if (Object.prototype.hasOwnProperty.call(snapshot || {}, "religion")) target.religion = snapshot.religion;
  else delete target.religion;
}

function collectPoliticalSupportCities(map, lockedStates = [], lockedProvinces = [], lockedCities = []) {
  const byId = new Map();
  const add = city => {
    const id = city?.id ?? city?.i;
    if (id !== undefined && id !== null && !byId.has(String(id))) byId.set(String(id), structuredClone(city));
  };
  for (const city of lockedCities || []) add(city);
  const protectedStateIds = new Set((lockedStates || []).map(state => Number(state?.i ?? state?.id)).filter(Number.isInteger));
  const protectedProvinceIds = new Set((lockedProvinces || []).map(province => Number(province?.i ?? province?.id)).filter(Number.isInteger));
  const protectedBurgIds = new Set([
    ...(lockedStates || []).map(state => Number(state?.capital)),
    ...(lockedProvinces || []).map(province => Number(province?.burg))
  ].filter(id => Number.isInteger(id) && id > 0));
  for (const city of map?.settlements?.cities || []) {
    if (!city || city.removed) continue;
    const packCell = Number(city.packCell);
    const stateId = Number.isInteger(packCell) ? Number(map?.pack?.cells?.state?.[packCell]) : Number(city.state);
    const provinceId = Number.isInteger(packCell) ? Number(map?.pack?.cells?.province?.[packCell]) : Number(city.province);
    if (protectedBurgIds.has(Number(city.burgId)) || protectedStateIds.has(stateId) || protectedProvinceIds.has(provinceId)) add(city);
  }
  return [...byId.values()];
}

function collectPoliticalSupportProvinces(map, lockedStates = [], lockedProvinces = []) {
  const byId = new Map();
  const add = province => {
    const id = Number(province?.i ?? province?.id);
    if (Number.isInteger(id) && id > 0 && !byId.has(id)) byId.set(id, structuredClone(province));
  };
  for (const province of lockedProvinces || []) add(province);
  const protectedStateIds = new Set((lockedStates || []).map(state => Number(state?.i ?? state?.id)).filter(Number.isInteger));
  for (const province of map?.politics?.provinces || map?.pack?.provinces || []) {
    if (province && !province.removed && protectedStateIds.has(Number(province.state))) add(province);
  }
  return [...byId.values()];
}

function collectEconomicSupportCities(map, lockedMarkets = [], lockedDeals = []) {
  const burgIds = new Set();
  const marketById = new Map((map?.pack?.markets || map?.economy?.markets || [])
    .filter(Boolean)
    .map(market => [Number(market.i ?? market.id), market]));
  for (const market of lockedMarkets || []) {
    const burgId = Number(market?.centerBurgId);
    if (Number.isInteger(burgId) && burgId > 0) burgIds.add(burgId);
  }
  for (const deal of lockedDeals || []) {
    for (const [type, id] of [[deal?.sellerType, deal?.seller], [deal?.buyerType, deal?.buyer]]) {
      if (type === "burg") burgIds.add(Number(id));
      if (type === "market") {
        const burgId = Number(marketById.get(Number(id))?.centerBurgId);
        if (Number.isInteger(burgId) && burgId > 0) burgIds.add(burgId);
      }
    }
  }
  return (map?.settlements?.cities || [])
    .filter(city => city && !city.removed && burgIds.has(Number(city.burgId)))
    .map(city => structuredClone(city));
}

function collectEconomicSupportMarkets(map, lockedMarkets = [], lockedDeals = []) {
  const byId = new Map();
  const add = market => {
    const id = Number(market?.i ?? market?.id);
    if (Number.isInteger(id) && id > 0 && !byId.has(id)) byId.set(id, structuredClone(market));
  };
  for (const market of lockedMarkets || []) add(market);
  const currentById = new Map((map?.pack?.markets || map?.economy?.markets || [])
    .filter(Boolean)
    .map(market => [Number(market.i ?? market.id), market]));
  for (const deal of lockedDeals || []) {
    for (const [type, id] of [[deal?.sellerType, deal?.seller], [deal?.buyerType, deal?.buyer]]) {
      if (type === "market") add(currentById.get(Number(id)));
    }
  }
  return [...byId.values()];
}

function collectFeatureSupportObjects(map, lockedFeatures = [], kind) {
  const featureIds = new Set((lockedFeatures || [])
    .map(feature => Number(feature?.i ?? feature?.id))
    .filter(Number.isInteger));
  if (!featureIds.size) return [];
  const matches = object => featureIds.has(Number(object?.feature))
    || featureIds.has(Number(object?.port))
    || featureIds.has(Number(object?.data?.feature));
  if (kind === "cities") {
    return (map?.settlements?.cities || [])
      .filter(city => {
        const burg = map?.pack?.burgs?.[Number(city?.burgId)];
        return city && !city.removed && (matches(city) || matches(burg));
      })
      .map(city => structuredClone(city));
  }
  const objects = kind === "routes"
    ? map?.settlements?.routes || map?.pack?.routes || []
    : kind === "markers"
      ? map?.markers?.markers || map?.pack?.markers || []
      : [];
  return objects.filter(object => object && !object.removed && matches(object)).map(object => structuredClone(object));
}

function mergeSupportSnapshots(snapshots) {
  const byId = new Map();
  for (const snapshot of snapshots || []) {
    const id = snapshot?.id ?? snapshot?.i;
    if (id !== undefined && id !== null && !byId.has(String(id))) byId.set(String(id), snapshot);
  }
  return [...byId.values()];
}

export function collectLockedWarzoneDiplomacySupport(pack, lockedZones = []) {
  const supporting = [];
  const capturedPairs = new Set();
  for (const zone of lockedZones || []) {
    if (zone?.type !== "Warzone") continue;
    const pair = resolveWarzoneStatePair(pack, zone);
    if (!pair) continue;
    const key = `${Math.min(pair.attacker, pair.defender)}:${Math.max(pair.attacker, pair.defender)}`;
    if (capturedPairs.has(key)) continue;
    supporting.push(captureDiplomacyRelationSnapshot(pack, pair.attacker, pair.defender));
    capturedPairs.add(key);
  }
  return supporting;
}

function nextUnusedId(used, start) {
  let value = start;
  while (used.has(value)) value += 1;
  return value;
}

function syncSocietyCollections(map) {
  map.pack.cultures = map.society.cultures;
  map.pack.religions = map.society.religions;
  map.society.metadata ||= {};
  map.society.metadata.cultures = activeCount(map.society.cultures);
  map.society.metadata.religions = activeCount(map.society.religions);
}

function repairSocietyCenters(pack, items, field) {
  const cells = pack.cells;
  const populated = cells.i.filter(cell => cells.h[cell] >= 20 && Number(cells.s?.[cell] || cells.pop?.[cell] || 0) > 0);
  const used = new Set();
  for (const item of items || []) {
    if (!item?.i || item.removed) continue;
    const oldCenter = Number(item.center);
    if (Number.isInteger(oldCenter) && populated.includes(oldCenter) && !used.has(oldCenter)) {
      used.add(oldCenter);
      continue;
    }
    const origin = cells.p?.[oldCenter] || [0, 0];
    const preferred = populated.filter(cell => !used.has(cell) && Number(cells[field]?.[cell]) === Number(item.i));
    const candidates = preferred.length ? preferred : populated.filter(cell => !used.has(cell));
    if (!candidates.length) throw new Error(`${field} #${item.i} 没有可用的扩张中心`);
    item.center = candidates.reduce((best, cell) => societyCenterScore(cells, cell, origin) > societyCenterScore(cells, best, origin) ? cell : best, candidates[0]);
    used.add(item.center);
  }
}

function societyCenterScore(cells, cell, origin) {
  const point = cells.p?.[cell] || [0, 0];
  const distance = (point[0] - origin[0]) ** 2 + (point[1] - origin[1]) ** 2;
  return Number(cells.s?.[cell] || cells.pop?.[cell] || 0) * 100 - distance;
}

function snapshotIdentity(items = []) {
  return new Map(items.filter(item => item?.i && !item.removed).map(item => [Number(item.i), {name: item.name, fullName: item.fullName}]));
}

function synchronizePoliticalMirrorsForRebuild(map) {
  map.politics ||= {};
  map.pack ||= {};
  const states = mergePoliticalMirrors(map.politics.states, map.pack.states);
  const provinces = mergePoliticalMirrors(map.politics.provinces, map.pack.provinces);
  map.politics.states = map.pack.states = states;
  map.politics.provinces = map.pack.provinces = provinces;
}

function mergePoliticalMirrors(politicalItems, packItems) {
  const primary = Array.isArray(politicalItems) ? politicalItems : [];
  const fallback = Array.isArray(packItems) ? packItems : [];
  if (primary === fallback) return primary;
  const size = Math.max(primary.length, fallback.length);
  return Array.from({length: size}, (_, id) => mergePoliticalItem(primary[id], fallback[id], id));
}

function mergePoliticalItem(primary, fallback, id) {
  if (!primary && !fallback) return null;
  if (!primary) return {...fallback};
  const merged = {...(fallback || {}), ...primary};
  merged.i = Number.isInteger(Number(primary.i)) ? Number(primary.i) : Number.isInteger(Number(primary.id)) ? Number(primary.id) : id;
  merged.removed = Boolean(primary.removed);
  for (const field of ["name", "fullName", "formName"]) merged[field] = primary[field];
  return merged;
}

function activeCount(items = []) {
  return items.filter(item => item?.i && !item.removed).length;
}

function throwIfCancelled(signal) {
  if (signal?.aborted) throw new DOMException(signal.reason || "洋流世界重算已取消", "AbortError");
}
