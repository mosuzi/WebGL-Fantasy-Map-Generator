import {captureDiplomacyRelationSnapshot, diplomacyPairKey} from "../generator/diplomacy-regeneration-locks.js";
import {captureMilitaryRegimentSnapshot} from "../generator/military-regeneration-locks.js";
import {
  collectEconomicSupportCities,
  collectLockedWarzoneDiplomacySupport,
  collectPoliticalSupportCities,
  collectPoliticalSupportProvinces,
  mergeSupportSnapshots
} from "../generator/ocean-current-world.js";
import {OBJECT_KIND} from "./object-kinds.js";

const SLICE_BY_KIND = Object.freeze({
  [OBJECT_KIND.STATE]: "lockedStates",
  [OBJECT_KIND.PROVINCE]: "lockedProvinces",
  [OBJECT_KIND.CITY]: "lockedCities",
  [OBJECT_KIND.ROUTE]: "lockedRoutes",
  [OBJECT_KIND.RIVER]: "lockedRivers",
  [OBJECT_KIND.CULTURE]: "lockedCultures",
  [OBJECT_KIND.RELIGION]: "lockedReligions",
  [OBJECT_KIND.FEATURE]: "lockedFeatures",
  [OBJECT_KIND.MARKER]: "lockedMarkers",
  [OBJECT_KIND.ECONOMY_MARKET]: "lockedMarkets",
  [OBJECT_KIND.TRADE_FLOW]: "lockedDeals",
  [OBJECT_KIND.DIPLOMACY_RELATION]: "lockedDiplomacyRelations",
  [OBJECT_KIND.MILITARY]: "lockedMilitaryRegiments",
  [OBJECT_KIND.ZONE]: "lockedZones",
  [OBJECT_KIND.OCEAN_CURRENT]: "lockedOceanCurrents"
});

export function createRegenerationLockPriorityBundle(map, constraintBundle) {
  if (!constraintBundle) return null;
  const explicitStates = constraintBundle.lockedStates || [];
  const explicitProvinces = constraintBundle.lockedProvinces || [];
  const explicitCities = constraintBundle.lockedCities || [];
  const explicitFeatures = constraintBundle.lockedFeatures || [];
  const structuralFeatures = mergeSupportSnapshots([
    ...explicitFeatures,
    ...collectRiverSupportFeatures(map, constraintBundle.lockedRivers)
  ]);
  const economyCities = collectEconomicSupportCities(
    map,
    constraintBundle.lockedMarkets,
    constraintBundle.lockedDeals
  );
  const baseCities = mergeSupportSnapshots([
    ...explicitCities,
    ...economyCities
  ]);
  const structuralProvinces = collectPoliticalSupportProvinces(
    map,
    explicitStates,
    explicitProvinces
  );
  const politicalCities = collectPoliticalSupportCities(map, explicitStates, structuralProvinces, baseCities);
  const anchorSupport = collectCityAnchorSupport(map, politicalCities);
  const lockedStates = mergeSupportSnapshots([...explicitStates, ...anchorSupport.states]);
  const lockedProvinces = mergeSupportSnapshots([...structuralProvinces, ...anchorSupport.provinces]);
  const lockedCities = politicalCities;
  const lockedRoutes = mergeSupportSnapshots(constraintBundle.lockedRoutes || []);
  const lockedMarkers = mergeSupportSnapshots(constraintBundle.lockedMarkers || []);
  const lockedFeatures = mergeSupportSnapshots([
    ...structuralFeatures,
    ...collectReferencedFeatures(map, [...lockedCities, ...lockedRoutes, ...lockedMarkers])
  ]);
  const lockedDiplomacyRelations = mergeSupportSnapshots([
    ...(constraintBundle.lockedDiplomacyRelations || []),
    ...collectStateDiplomacySupport(map, explicitStates),
    ...collectLockedWarzoneDiplomacySupport(map.pack, constraintBundle.lockedZones)
  ]);
  const lockedMilitaryRegiments = mergeSupportSnapshots([
    ...(constraintBundle.lockedMilitaryRegiments || []),
    ...collectStateMilitarySupport(map, explicitStates)
  ]);
  const slices = {
    lockedStates,
    lockedProvinces,
    lockedCities,
    lockedRoutes,
    lockedFeatures,
    lockedMarkers,
    lockedDiplomacyRelations,
    lockedMilitaryRegiments
  };
  const ids = kind => {
    const key = SLICE_BY_KIND[kind];
    const values = key && Object.prototype.hasOwnProperty.call(slices, key)
      ? slices[key]
      : constraintBundle[key] || [];
    return values.map(value => String(objectId(kind, value)));
  };
  return Object.freeze({
    ...constraintBundle,
    ...slices,
    explicitLockedStates: explicitStates,
    ids,
    snapshots(kind) {
      const key = SLICE_BY_KIND[kind];
      return key && Object.prototype.hasOwnProperty.call(slices, key)
        ? slices[key]
        : constraintBundle.snapshots(kind);
    }
  });
}

export function restoreExplicitLockedSocialSnapshots(map, constraintBundle) {
  restoreSocialStore(map, "cultures", constraintBundle?.lockedCultures);
  restoreSocialStore(map, "religions", constraintBundle?.lockedReligions);
  return map;
}

function restoreSocialStore(map, plural, snapshots) {
  for (const snapshot of snapshots || []) {
    const id = Number(snapshot?.i ?? snapshot?.id);
    if (!Number.isInteger(id) || id <= 0) continue;
    const restored = structuredClone(snapshot);
    if (map?.society?.[plural]) map.society[plural][id] = restored;
    if (map?.pack?.[plural]) map.pack[plural][id] = structuredClone(snapshot);
  }
}

function collectRiverSupportFeatures(map, rivers) {
  const riverIds = new Set((rivers || [])
    .map(river => Number(river?.id ?? river?.i))
    .filter(Number.isInteger));
  const featureIds = new Set();
  for (const river of rivers || []) {
    for (const value of [river?.sourceFeatureId, river?.outletFeatureId]) {
      const id = Number(value);
      if (Number.isInteger(id) && id > 0) featureIds.add(id);
    }
  }
  for (const feature of map?.pack?.features || []) {
    if (!feature || feature.removed || feature.type !== "lake") continue;
    if (riverIds.has(Number(feature.river))
      || riverIds.has(Number(feature.outlet))
      || (feature.inlets || []).some(id => riverIds.has(Number(id)))) {
      featureIds.add(Number(feature.i ?? feature.id));
    }
  }
  return [...featureIds]
    .map(id => map?.pack?.features?.[id])
    .filter(feature => feature && !feature.removed)
    .map(feature => structuredClone(feature));
}

function collectCityAnchorSupport(map, cities) {
  const states = [];
  const provinces = [];
  const stateIds = new Set();
  const provinceIds = new Set();
  for (const city of cities || []) {
    const burgId = Number(city?.burgId);
    if (!Number.isInteger(burgId) || burgId <= 0) continue;
    const state = map?.politics?.states?.[Number(city.state)] || map?.pack?.states?.[Number(city.state)];
    if (state && Number(state.capital) === burgId && !stateIds.has(Number(state.i ?? state.id))) {
      stateIds.add(Number(state.i ?? state.id));
      states.push(structuredClone(state));
    }
    const province = map?.politics?.provinces?.[Number(city.province)] || map?.pack?.provinces?.[Number(city.province)];
    if (province && Number(province.burg) === burgId && !provinceIds.has(Number(province.i ?? province.id))) {
      provinceIds.add(Number(province.i ?? province.id));
      provinces.push(structuredClone(province));
    }
  }
  return {states, provinces};
}

function collectReferencedFeatures(map, objects) {
  const ids = new Set();
  const add = value => {
    const id = Number(value);
    if (Number.isInteger(id) && id > 0) ids.add(id);
  };
  for (const object of objects || []) {
    add(object?.feature);
    add(object?.port);
    add(object?.data?.feature);
    if (object?.burgId !== undefined) {
      const burg = map?.pack?.burgs?.[Number(object.burgId)];
      add(burg?.feature);
      add(burg?.port);
    }
  }
  return [...ids]
    .map(id => map?.pack?.features?.[id])
    .filter(feature => feature && !feature.removed)
    .map(feature => structuredClone(feature));
}

function collectStateDiplomacySupport(map, states) {
  const activeStates = (map?.pack?.states || map?.politics?.states || [])
    .filter(state => state?.i && !state.removed);
  const protectedIds = new Set((states || []).map(state => Number(state?.i ?? state?.id)).filter(Number.isInteger));
  const snapshots = [];
  const pairs = new Set();
  for (const state of activeStates) {
    const stateId = Number(state.i ?? state.id);
    if (!protectedIds.has(stateId)) continue;
    for (const other of activeStates) {
      const otherId = Number(other.i ?? other.id);
      if (stateId === otherId) continue;
      const key = diplomacyPairKey(stateId, otherId);
      if (pairs.has(key)) continue;
      snapshots.push(captureDiplomacyRelationSnapshot(map.pack, stateId, otherId));
      pairs.add(key);
    }
  }
  return snapshots;
}

function collectStateMilitarySupport(map, states) {
  const snapshots = [];
  for (const state of states || []) {
    const stateId = Number(state?.i ?? state?.id);
    const current = map?.pack?.states?.[stateId] || map?.politics?.states?.[stateId];
    for (const regiment of current?.military || []) {
      snapshots.push(captureMilitaryRegimentSnapshot(map.pack, {
        kind: OBJECT_KIND.MILITARY,
        id: `${stateId}:${Number(regiment?.i ?? regiment?.id)}`
      }));
    }
  }
  return snapshots;
}

function objectId(kind, value) {
  if (kind === OBJECT_KIND.MILITARY) return value?.id ?? `${value?.stateId}:${value?.regimentId}`;
  return value?.id ?? value?.i;
}
