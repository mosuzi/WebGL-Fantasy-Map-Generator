import {defineBiomesAndPopulation} from "./biomes.js";
import {applyOceanCurrentClimateInfluence, buildClimate} from "./climate.js";
import {buildDiplomacy} from "./diplomacy.js";
import {buildEconomy} from "./economy.js";
import {buildMarkers, createMarkerResult} from "./markers.js";
import {buildMilitary} from "./military.js";
import {buildOceanCurrents} from "./ocean-currents.js";
import {reexpandPackPoliticsPreservingIdentity} from "./politics.js";
import {createRandom} from "./random.js";
import {buildRivers, renameHydronymsByCulture} from "./rivers.js";
import {finalizeSettlements, regenerateSettlementsWithinPolitics} from "./settlements.js";
import {reexpandSocietyCultures, reexpandSocietyReligions} from "./society.js";
import {buildZones} from "./zones.js";

export async function rebuildOceanCurrentWorldStage(map, system, {seed, signal} = {}) {
  throwIfCancelled(signal);
  const options = {...map.options, seed: String(seed || map.options?.seed || map.metadata?.seed || "map"), namebases: map.namebases};
  let result;

  switch (system) {
    case "ocean-currents":
      map.oceanCurrents = buildOceanCurrents(map, {seed: `${options.seed}:currents`});
      result = {currents: map.oceanCurrents.currents.length};
      break;
    case "climate":
      map.climate = buildClimate(map.grid, map.features, options, createRandom(options.seed));
      applyOceanCurrentClimateInfluence(map.grid, map.features, map.climate, map.oceanCurrents);
      map.mapCoordinates = map.climate.mapCoordinates;
      result = {...map.climate.metadata.oceanCurrentInfluence};
      break;
    case "rivers": {
      const riverOptions = {...options, riverRegenerationSalt: `${options.seed}:world-rivers`};
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
      result = reexpandSocietyCultures(map.grid, map.pack, map.society.cultures);
      syncSocietyCollections(map);
      break;
    case "cities-routes":
      regenerateSettlementsWithinPolitics(map.grid, map.features, map.politics, map.settlements, map.pack, {
        ...options,
        settlementRegenerationSalt: `${options.seed}:world-cities`,
        routeRegenerationSalt: `${options.seed}:world-routes`
      });
      result = {cities: map.settlements.metadata.cities, routes: map.settlements.metadata.routes};
      break;
    case "states-provinces": {
      synchronizePoliticalMirrorsForRebuild(map);
      const politics = reexpandPackPoliticsPreservingIdentity(map.grid, map.society, map.pack, map.settlements);
      if (!politics) throw new Error("当前地图缺少可保留身份的国家与省份数据");
      map.politics.states = map.pack.states = politics.states;
      map.politics.provinces = map.pack.provinces = politics.provinces;
      map.politics.metadata = {...map.politics.metadata, ...politics.metadata};
      finalizeSettlements(map.grid, map.features, map.politics, map.settlements, map.pack, {...options, routeRegenerationSalt: `${options.seed}:world-routes-final`});
      result = politics.metadata;
      break;
    }
    case "religions":
      repairSocietyCenters(map.pack, map.society.religions, "religion");
      result = reexpandSocietyReligions(map.grid, map.pack, map.society.religions, map.settlements);
      syncSocietyCollections(map);
      break;
    case "markers-economy":
      map.markers = rebuildMarkersPreservingManual(map, options);
      map.pack.markers = map.markers.markers;
      map.economy = buildEconomy(map.pack, options);
      result = {markers: map.markers.metadata.markers, deals: map.economy.metadata.deals};
      break;
    case "diplomacy":
      map.diplomacy = buildDiplomacy(map.pack, map.society, {...options, diplomacyRegenerationSalt: `${options.seed}:world-diplomacy`});
      result = {...map.diplomacy.metadata};
      break;
    case "military-zones":
      map.military = buildMilitary(map.pack, {...options, seed: `${options.seed}:world-military`});
      map.zones = buildZones(map.pack, {...options, seed: `${options.seed}:world-zones`});
      result = {regiments: map.military.metadata.regiments, zones: map.zones.metadata.zones};
      break;
    default:
      throw new Error(`未知的洋流世界重算阶段：${system}`);
  }

  throwIfCancelled(signal);
  return {executed: true, ...result};
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

function rebuildMarkersPreservingManual(map, options) {
  const preserved = (map.markers?.markers || map.pack?.markers || []).filter(isManualMarker).map(marker => structuredClone(marker));
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
