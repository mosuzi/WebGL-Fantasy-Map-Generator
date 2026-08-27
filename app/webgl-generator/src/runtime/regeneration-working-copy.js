import {discardInvalidSettlementCellObjects} from "./settlement-cell-index.js";

export function normalizeRegenerationWorkingCopy(map) {
  if (!map || typeof map !== "object") return map;
  discardInvalidSettlementCellObjects(map);
  normalizePoliticalMirrors(map);
  normalizeMarkerMirrors(map);
  normalizeSocialMirrors(map);
  normalizeZoneMirrors(map);
  normalizeEconomyMirrors(map);
  normalizeEconomyCenters(map);
  normalizeDiplomacySalt(map);
  return map;
}

function normalizeEconomyMirrors(map) {
  if (!map?.pack) return;
  map.economy ||= {};
  for (const plural of ["goods", "markets", "deals"]) {
    const rows = canonicalRows(map.pack[plural], map.economy[plural]);
    map.pack[plural] = map.economy[plural] = rows;
  }
}

function normalizePoliticalMirrors(map) {
  if (!map?.pack) return;
  map.politics ||= {};
  const states = canonicalRows(map.pack.states, map.politics.states);
  const provinces = canonicalRows(map.pack.provinces, map.politics.provinces);
  for (const state of states) {
    if (!state || state.removed) continue;
    if (!Array.isArray(state.military)) state.military = [];
  }
  const provincesByState = new Map();
  for (const province of provinces) {
    if (!province || province.removed) continue;
    const stateId = Number(province.state);
    const provinceId = Number(province.i ?? province.id);
    if (!Number.isInteger(stateId) || stateId <= 0 || !Number.isInteger(provinceId) || provinceId <= 0) continue;
    if (!provincesByState.has(stateId)) provincesByState.set(stateId, []);
    provincesByState.get(stateId).push(provinceId);
  }
  for (const state of states) {
    if (!state || state.removed) continue;
    const stateId = Number(state.i ?? state.id);
    const actual = (provincesByState.get(stateId) || []).sort((left, right) => left - right);
    if (!sameNumericList(state.provinces, actual)) state.provinces = actual;
  }
  map.pack.states = map.politics.states = states;
  map.pack.provinces = map.politics.provinces = provinces;
}

function normalizeMarkerMirrors(map) {
  if (!map?.pack) return;
  map.markers ||= {markers: []};
  const markers = canonicalRows(map.markers.markers, map.pack.markers);
  map.markers.markers = map.pack.markers = markers;
}

function normalizeSocialMirrors(map) {
  if (!map?.pack) return;
  map.society ||= {};
  for (const plural of ["cultures", "religions"]) {
    const rows = canonicalRows(map.society[plural], map.pack[plural]);
    map.society[plural] = map.pack[plural] = rows;
  }
}

function normalizeZoneMirrors(map) {
  if (!map?.pack) return;
  map.zones ||= {zones: []};
  const zones = canonicalRows(map.zones.zones, map.pack.zones);
  const packCellCount = Number(map.pack.cells?.i?.length || 0);
  for (let index = 0; index < zones.length; index++) {
    const zone = zones[index];
    if (!zone || zone.removed) continue;
    if (Array.isArray(zone.cells)) {
      zone.cells = [...new Set(zone.cells.map(Number).filter(cell => Number.isInteger(cell) && cell >= 0 && cell < packCellCount))];
    } else if (Number.isInteger(Number(zone.cell)) && Number(zone.cell) >= 0 && Number(zone.cell) < packCellCount) zone.cells = [Number(zone.cell)];
    else zone.cells = [];
  }
  map.zones.zones = map.pack.zones = zones;
}

function normalizeEconomyCenters(map) {
  const markets = Array.isArray(map?.pack?.markets) ? map.pack.markets : [];
  const burgs = (map?.pack?.burgs || []).filter(burg => burg?.i && !burg.removed);
  if (!markets.length || !burgs.length) return;
  const byCell = new Map(burgs.map(burg => [Number(burg.cell), burg]));
  const byMarket = new Map(burgs.filter(burg => Number(burg.market) > 0).map(burg => [Number(burg.market), burg]));
  for (const market of markets) {
    if (!market || market.removed) continue;
    const current = map.pack.burgs?.[Number(market.centerBurgId)];
    if (current?.i && !current.removed) continue;
    const marketId = Number(market.i ?? market.id);
    const replacement = byCell.get(Number(market.cell))
      || byMarket.get(marketId)
      || burgs.find(burg => Number(burg.state) === Number(market.state))
      || burgs[0];
    market.centerBurgId = Number(replacement.i);
    market.cell = Number(replacement.cell);
    market.state = Number(replacement.state || 0);
  }
}

function normalizeDiplomacySalt(map) {
  const candidates = [
    map?.options?.diplomacyRegenerationSalt,
    map?.metadata?.regeneration?.diplomacy,
    map?.diplomacy?.metadata?.regenerationSalt
  ].map(Number).filter(value => Number.isSafeInteger(value) && value >= 0);
  const salt = candidates.length ? Math.max(...candidates) : 0;
  map.options ||= {};
  map.metadata ||= {};
  map.metadata.regeneration ||= {};
  map.options.diplomacyRegenerationSalt = salt;
  map.metadata.regeneration.diplomacy = salt;
  if (map.diplomacy?.metadata && Object.prototype.hasOwnProperty.call(map.diplomacy.metadata, "regenerationSalt")) {
    map.diplomacy.metadata.regenerationSalt = salt;
  }
}

function canonicalRows(primary, fallback) {
  if (Array.isArray(primary)) return primary;
  if (Array.isArray(fallback)) return fallback;
  return [];
}

function sameNumericList(left, right) {
  if (!Array.isArray(left) || left.length !== right.length) return false;
  return left.every((value, index) => Number(value) === right[index]);
}
