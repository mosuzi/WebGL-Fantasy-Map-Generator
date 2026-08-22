import {OBJECT_KIND} from "./object-kinds.js";
import {
  assertLockedRegenerationSnapshots,
  captureLockedRegenerationObjects
} from "./regeneration-lock-protection.js";
import {
  assertRegenerationLockKind,
  lockError,
  normalizeRegenerationLockStore,
  REGENERATION_LOCK_KINDS
} from "./regeneration-locks.js";

export const REGENERATION_CONSTRAINT_DOMAIN_KINDS = deepFreeze({
  state: [OBJECT_KIND.STATE],
  states: [OBJECT_KIND.STATE],
  province: [OBJECT_KIND.PROVINCE],
  provinces: [OBJECT_KIND.PROVINCE],
  city: [OBJECT_KIND.CITY],
  cities: [OBJECT_KIND.CITY],
  route: [OBJECT_KIND.ROUTE],
  routes: [OBJECT_KIND.ROUTE],
  river: [OBJECT_KIND.RIVER],
  rivers: [OBJECT_KIND.RIVER],
  culture: [OBJECT_KIND.CULTURE],
  cultures: [OBJECT_KIND.CULTURE],
  religion: [OBJECT_KIND.RELIGION],
  religions: [OBJECT_KIND.RELIGION],
  feature: [OBJECT_KIND.FEATURE],
  features: [OBJECT_KIND.FEATURE],
  marker: [OBJECT_KIND.MARKER],
  markers: [OBJECT_KIND.MARKER],
  "economy-market": [OBJECT_KIND.ECONOMY_MARKET],
  "trade-flow": [OBJECT_KIND.TRADE_FLOW],
  economy: [OBJECT_KIND.ECONOMY_MARKET, OBJECT_KIND.TRADE_FLOW],
  "diplomacy-relation": [OBJECT_KIND.DIPLOMACY_RELATION],
  diplomacy: [OBJECT_KIND.DIPLOMACY_RELATION],
  military: [OBJECT_KIND.MILITARY],
  zone: [OBJECT_KIND.ZONE],
  zones: [OBJECT_KIND.ZONE],
  "ocean-current": [OBJECT_KIND.OCEAN_CURRENT],
  "ocean-currents": [OBJECT_KIND.OCEAN_CURRENT],
  "cities-routes": [OBJECT_KIND.CITY, OBJECT_KIND.ROUTE],
  "states-provinces": [OBJECT_KIND.STATE, OBJECT_KIND.PROVINCE, OBJECT_KIND.CITY, OBJECT_KIND.ROUTE],
  "markers-economy": [OBJECT_KIND.MARKER, OBJECT_KIND.ECONOMY_MARKET, OBJECT_KIND.TRADE_FLOW],
  "military-zones": [OBJECT_KIND.MILITARY, OBJECT_KIND.ZONE],
  world: [...REGENERATION_LOCK_KINDS]
});

const KIND_SLICE_KEY = Object.freeze({
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

const EMPTY_ARRAY = Object.freeze([]);

export function isRegenerationConstraintDomainFullyLocked(map, domain) {
  const kinds = resolveDomainKinds(domain);
  const selectedKinds = new Set(kinds);
  const lockedIdsByKind = new Map(kinds.map(kind => [kind, new Set()]));
  const entries = normalizeRegenerationLockStore(map?.regenerationLocks, map).store.entries;
  for (const entry of entries) {
    if (selectedKinds.has(entry.kind)) lockedIdsByKind.get(entry.kind).add(String(entry.id));
  }
  let activeCount = 0;
  for (const kind of kinds) {
    const activeIds = listActiveObjectIds(map, kind);
    const lockedIds = lockedIdsByKind.get(kind);
    activeCount += activeIds.length;
    if (activeIds.some(id => !lockedIds.has(String(id)))) return false;
  }
  return activeCount > 0;
}

export function captureRegenerationConstraintBundle(map, {domains = null, closure = null} = {}) {
  const requestedDomains = normalizeRequestedDomains(domains, closure);
  const selectedKinds = new Set(requestedDomains.flatMap(resolveDomainKinds));
  const captures = new Map();
  const snapshotsByKind = new Map();
  const idsByKind = new Map();
  const activeIdsByKind = new Map();
  const hadLockStore = Object.prototype.hasOwnProperty.call(map, "regenerationLocks");
  const lockStore = map.regenerationLocks;
  try {
    for (const kind of REGENERATION_LOCK_KINDS) {
      if (!selectedKinds.has(kind)) continue;
      const captured = captureLockedRegenerationObjects(map, kind);
      const immutableCapture = deepFreeze({
        kind,
        entries: captured.entries,
        snapshots: captured.snapshots
      });
      captures.set(kind, immutableCapture);
      snapshotsByKind.set(kind, immutableCapture.snapshots);
      idsByKind.set(kind, Object.freeze([...captured.ids].map(String)));
      activeIdsByKind.set(kind, Object.freeze(listActiveObjectIds(map, kind)));
    }
  } finally {
    if (hadLockStore) map.regenerationLocks = lockStore;
    else delete map.regenerationLocks;
  }

  const snapshotFor = kind => snapshotsByKind.get(assertRegenerationLockKind(kind)) || EMPTY_ARRAY;
  const idsFor = kind => idsByKind.get(assertRegenerationLockKind(kind)) || EMPTY_ARRAY;
  const topLevelSlices = Object.fromEntries(
    REGENERATION_LOCK_KINDS.map(kind => [KIND_SLICE_KEY[kind], snapshotFor(kind)])
  );
  const domainSlices = Object.fromEntries(
    Object.keys(REGENERATION_CONSTRAINT_DOMAIN_KINDS).map(domain => [
      domain,
      deepFreeze(Object.fromEntries(resolveDomainKinds(domain).map(kind => [KIND_SLICE_KEY[kind], snapshotFor(kind)])))
    ])
  );

  const bundle = {
    version: 1,
    selectedDomains: Object.freeze([...requestedDomains]),
    selectedKinds: Object.freeze([...selectedKinds]),
    domains: deepFreeze(domainSlices),
    ...topLevelSlices,
    snapshots: snapshotFor,
    ids: idsFor,
    isDomainFullyLocked(domain) {
      const kinds = resolveDomainKinds(domain);
      let activeCount = 0;
      for (const kind of kinds) {
        if (!selectedKinds.has(kind)) return false;
        const activeIds = activeIdsByKind.get(kind) || EMPTY_ARRAY;
        const lockedIds = new Set(idsByKind.get(kind) || EMPTY_ARRAY);
        activeCount += activeIds.length;
        if (activeIds.some(id => !lockedIds.has(id))) return false;
      }
      return activeCount > 0;
    },
    assertDomain(mapOrDomain, domainOrContext, phase = null) {
      const assertion = normalizeAssertionArguments(map, mapOrDomain, domainOrContext, phase);
      for (const kind of resolveDomainKinds(assertion.domain)) {
        const capture = captures.get(kind);
        if (capture) assertLockedRegenerationSnapshots(assertion.map, capture);
      }
      return true;
    }
  };

  return deepFreeze(bundle);
}

function normalizeRequestedDomains(domains, closure) {
  if (domains == null && closure == null) return Object.freeze(["world"]);
  const requested = [...normalizeDomainList(domains), ...normalizeDomainList(closure)];
  const unique = [...new Set(requested)];
  for (const domain of unique) resolveDomainKinds(domain);
  return Object.freeze(unique);
}

function normalizeDomainList(value) {
  if (value == null) return [];
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) throw lockError("unsupported_regeneration_domain", "重生成约束领域必须是字符串或数组", {value});
  return value.map(domain => String(domain || "").trim()).filter(Boolean);
}

function resolveDomainKinds(domain) {
  const normalized = String(domain || "").trim();
  const kinds = REGENERATION_CONSTRAINT_DOMAIN_KINDS[normalized];
  if (kinds) return kinds;
  if (REGENERATION_LOCK_KINDS.includes(normalized)) return [normalized];
  throw lockError("unsupported_regeneration_domain", `不支持的重生成约束领域：${normalized || "(empty)"}`, {domain: normalized});
}

function normalizeAssertionArguments(capturedMap, mapOrDomain, domainOrContext, phase) {
  if (typeof mapOrDomain === "string") {
    return {
      map: domainOrContext?.map || capturedMap,
      domain: mapOrDomain,
      phase: domainOrContext?.phase || phase
    };
  }
  return {
    map: mapOrDomain || capturedMap,
    domain: domainOrContext,
    phase
  };
}

function listActiveObjectIds(map, kind) {
  if (kind === OBJECT_KIND.DIPLOMACY_RELATION) {
    const states = activeRows(map?.politics?.states || map?.pack?.states, {positive: true});
    const ids = [];
    for (let left = 0; left < states.length; left++) {
      for (let right = left + 1; right < states.length; right++) {
        const leftId = Number(states[left].i ?? states[left].id);
        const rightId = Number(states[right].i ?? states[right].id);
        ids.push(leftId < rightId ? `${leftId}:${rightId}` : `${rightId}:${leftId}`);
      }
    }
    return ids;
  }
  if (kind === OBJECT_KIND.MILITARY) {
    return activeRows(map?.politics?.states || map?.pack?.states, {positive: true})
      .flatMap(state => (state.military || []).filter(Boolean).map(regiment => `${Number(state.i ?? state.id)}:${Number(regiment.i ?? regiment.id)}`));
  }

  const rows = regenerationObjects(map, kind);
  const positive = [
    OBJECT_KIND.STATE,
    OBJECT_KIND.PROVINCE,
    OBJECT_KIND.CULTURE,
    OBJECT_KIND.RELIGION,
    OBJECT_KIND.ECONOMY_MARKET
  ].includes(kind);
  return activeRows(rows, {positive})
    .map(object => objectId(kind, object))
    .filter(id => id !== null);
}

function regenerationObjects(map, kind) {
  if (kind === OBJECT_KIND.STATE) return map?.politics?.states || map?.pack?.states || [];
  if (kind === OBJECT_KIND.PROVINCE) return map?.politics?.provinces || map?.pack?.provinces || [];
  if (kind === OBJECT_KIND.CITY) return map?.settlements?.cities || [];
  if (kind === OBJECT_KIND.ROUTE) return map?.settlements?.routes || [];
  if (kind === OBJECT_KIND.RIVER) return map?.rivers?.rivers || [];
  if (kind === OBJECT_KIND.CULTURE) return map?.society?.cultures || map?.pack?.cultures || [];
  if (kind === OBJECT_KIND.RELIGION) return map?.society?.religions || map?.pack?.religions || [];
  if (kind === OBJECT_KIND.FEATURE) return map?.pack?.features || [];
  if (kind === OBJECT_KIND.MARKER) return map?.markers?.markers || map?.pack?.markers || [];
  if (kind === OBJECT_KIND.ECONOMY_MARKET) return map?.pack?.markets || map?.economy?.markets || [];
  if (kind === OBJECT_KIND.TRADE_FLOW) return map?.pack?.deals || map?.economy?.deals || [];
  if (kind === OBJECT_KIND.ZONE) return map?.zones?.zones || map?.pack?.zones || [];
  if (kind === OBJECT_KIND.OCEAN_CURRENT) return map?.oceanCurrents?.currents || [];
  return [];
}

function activeRows(rows, {positive = false} = {}) {
  return (rows || []).filter(object => {
    if (!object || object.removed) return false;
    if (!positive) return true;
    return Number(object.i ?? object.id) > 0;
  });
}

function objectId(kind, object) {
  const value = kind === OBJECT_KIND.OCEAN_CURRENT ? object?.id : object?.id ?? object?.i;
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || (typeof value !== "object" && typeof value !== "function") || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}
