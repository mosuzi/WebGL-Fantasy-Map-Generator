import {biomeForPackCell, suitabilityForPackCell, suitabilityRankInputs} from "../generator/biomes.js";
import {classifyBiome, getAltitudeTemperatureDrop, heightRainfallDeltas, traceOceanCurrentClimate, visitOceanCurrentClimate} from "../generator/climate.js";
import {populationForSuitability} from "../generator/suitability.js";
import {buildOceanCurrents, oceanCurrentInputChecksum, sampleOceanCurrent} from "../generator/ocean-currents.js";
import {locateGridPoint} from "../geometry/grid-point.js";
import {refreshDiplomacySummaries, summarizeDiplomacy} from "../generator/diplomacy.js";
import {buildPopulationPoints, inspectRelocatedSettlementPort, isSettlementWaterRoutePathValid, rebuildSettlementRouteMirrors, synchronizeRelocatedRoutePath, traceSettlementRoutePath} from "../generator/settlements.js";
import {inspectManpower, manpowerContext, manpowerFitness} from "../generator/military-manpower.js";
import {settlementLandPoint} from "../generator/settlement-land-point.js";
import {createDomainPatch} from "./domain-patch.js";
import {updateHeightFeatures} from "./height-feature-impact.js";
import {packCellsByGrid} from "./grid-pack-index.js";
import {findLandlessStates, retireLandlessStates} from "./landless-states.js";
import {readEditedSuitabilityStats} from "./suitability-stat-index.js";
import {approximateCreatedHydrology, refreshRiverMetadata, traceDownhillRiver} from "./river-edit-commands.js";

// These tables are also used by the corresponding explicit topology commands.
// Only differences in them may cross the worker transaction boundary.
const topologyPaths = ["features.features", "grid.features", "features.shore", "features.metadata", "pack.features",
  "pack.metadata", "grid.cells.f", "grid.cells.t", ...["f", "t", "type", "haven", "harbor"].map(key => "pack.cells." + key)];
const administrationPaths = ["politics.states", "pack.states", "politics.provinces", "pack.provinces", "politics.metadata",
  "settlements.cities", "pack.burgs", "settlements.metadata", "settlements.populationPoints", "society.cultures", "pack.cultures",
  "society.religions", "pack.religions", "economy.markets", "pack.markets", "zones.zones", "pack.zones", "zones.metadata"];
const networkPaths = ["settlements.routes", "pack.routes", "pack.cells.routes", "rivers.rivers", "pack.rivers", "rivers.metadata"];
const flags = ["military", "zones", "markers", "economy", "diplomacy"];
const cellFields = ["temp", "prec", "biome", "s", "pop", "suitabilityBase", "state", "province", "region", "culture", "religion",
  "burg", "r", "conf", "good", "goodSupply", "goodSource", "market"];
const roots = new Set([...topologyPaths, ...administrationPaths, ...networkPaths, "metadata.derivedStale", "climate.metadata",
  "markers.markers", "pack.markers", "oceanCurrents.currents", "oceanCurrents.metadata",
  "diplomacy.metadata", "pack.diplomacy.metadata", "military.metadata", "pack.military.metadata", "economy.metadata",
  ...flags.map(key => key + ".metadata.stale"), ...["grid", "pack"].flatMap(key => cellFields.map(field => key + ".cells." + field))]);
const politicalTables = new Set(["politics.states", "pack.states", "politics.provinces", "pack.provinces", "society.cultures", "pack.cultures", "society.religions", "pack.religions"]);
const territoryFields = new Set(["rural", "urban", "area", "cells", "capital", "capitalName", "center", "gridCenter", "burg", "burgs", "removed", "neighbors", "provinces", "military", "diplomacySummary"]);
export const HEIGHT_VIEW_FIELDS = Object.freeze(["f", "state", "province", "culture", "religion", "biome", "temp", "prec", "pop", "region"]);

export function editedHeightPatchPolicy(patch) {
  const allowedPaths = patch.writeSet.filter(path => {
    const row = /^(.*)\.(\d+)(?:\.([^.]+))?$/.exec(path);
    if (row && politicalTables.has(row[1])) return territoryFields.has(row[3]);
    return !politicalTables.has(path) && (roots.has(path) || roots.has(path.replace(/\.\d+$/, "")));
  });
  return {domain: "height-derived", allowedPaths, forbiddenPaths: []};
}

function valueAt(map, path) {
  return path.split(".").reduce((value, key) => value?.[key], map);
}

function equal(a, b) {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || ArrayBuffer.isView(a)) {
    return a.length === b.length && a.every((value, index) => equal(value, b[index]));
  }
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && equal(a[key], b[key]));
}

function changedGridHeights(map) {
  const pending = map.metadata?.derivedStale;
  if (pending?.heightEdits) return Object.entries(pending.heightEdits).map(([cell, before]) => [Number(cell), before])
    .filter(([cell, before]) => Number.isInteger(cell) && Number.isFinite(before) && Number.isFinite(map.grid.cells.h[cell]));
  if (!pending?.systems?.includes("features")) return [];
  // Older saves only know that height was edited. Old land membership is
  // sufficient to recover actual crossings without inventing old elevations.
  const changed = [];
  const {h, f} = map.grid.cells;
  for (let cell = 0; cell < h.length; cell++) {
    const old = map.features.features[f[cell]];
    if (old && old.land !== (h[cell] >= 20)) changed.push([cell, old.land ? 20 : 19]);
  }
  return changed;
}

export function reconcileEditedHeight(map, context = {}) {
  const edits = changedGridHeights(map);
  const pending = map.metadata?.derivedStale;
  const writes = new Set();
  if (!edits.length && !pending?.heightEdits && !pending?.systems?.includes("features")) return {patch: createDomainPatch("height-derived", [], map), cells: 0, crossings: 0};
  const before = new Map();
  const previousClimate = {temp: new Map(), prec: new Map(), biome: new Map()};
  const watch = paths => {
    for (const path of paths) if (!before.has(path)) before.set(path, structuredClone(valueAt(map, path)));
  };
  const write = (section, field, cell, value) => {
    const column = map[section].cells[field];
    if (!column || Object.is(column[cell], value)) return;
    if ((section === "grid" && (field === "temp" || field === "prec")) || (section === "pack" && field === "biome")) {
      if (!previousClimate[field].has(cell)) previousClimate[field].set(cell, column[cell]);
    }
    writes.add([section, "cells", field, cell].join("."));
    column[cell] = value;
  };
  const grid = map.grid.cells, pack = map.pack.cells;
  const byGrid = packCellsByGrid(map);
  const changedPack = new Set();
  const changedHarbors = new Set();
  const heightPack = new Map();
  const crossings = new Set();
  const floodedStates = new Set();
  const floodedPack = new Set();
  let shoreClassification = false;
  let militaryMoved = false;
  const oldTemperatures = new Map();
  for (const [cell, old] of edits) {
    const height = grid.h[cell];
    const crossing = (old >= 20) !== (height >= 20);
    if (crossing) crossings.add(cell);
    const changeInDrop = getAltitudeTemperatureDrop(old, map.options?.heightExponent) - getAltitudeTemperatureDrop(height, map.options?.heightExponent);
    oldTemperatures.set(cell, grid.temp[cell]);
    if (grid.temp && changeInDrop) write("grid", "temp", cell, Math.max(-128, Math.min(127, grid.temp[cell] + changeInDrop)));
    if (crossing && height < 20 && grid.state?.[cell]) floodedStates.add(grid.state[cell]);
    for (const id of byGrid?.get(cell) || []) {
      heightPack.set(id, old);
      changedPack.add(id);
      if (grid.temp) write("pack", "temp", id, grid.temp[cell]);
      if (crossing) {
        for (const neighbor of pack.c[id]) changedPack.add(neighbor);
        if (height < 20) {
          if (pack.state[id]) floodedStates.add(pack.state[id]);
          floodedPack.add(id);
        }
      }
    }
  }
  for (const [cell, rain] of heightRainfallDeltas(map, edits, oldTemperatures)) {
    write("grid", "prec", cell, rain);
    for (const id of byGrid.get(cell) || []) {
      write("pack", "prec", id, rain);
      changedPack.add(id);
      for (const neighbor of pack.c[id]) changedPack.add(neighbor);
    }
  }
  if (crossings.size) {
    context.report?.("coast", {message: "正在更新发生变化的海岸与水陆连接", progress: 0.25});
    watch(topologyPaths.filter(path => !path.includes(".cells.")));
    shoreClassification = updateHeightFeatures(map, crossings, byGrid, (section, field, cell, value) => {
      if (map[section].cells[field]?.[cell] === value) return;
      write(section, field, cell, value);
      if (section !== "pack") return;
      changedPack.add(cell);
      if (field === "haven" || field === "harbor" || field === "f" || field === "type") {
        changedHarbors.add(cell);
        for (const n of pack.c[cell]) { changedPack.add(n); changedHarbors.add(n); }
      }
    });
  }
  if (map.oceanCurrents?.metadata?.generated && edits.some(([i, old]) => old < 20 || grid.h[i] < 20)) {
    watch(["oceanCurrents.currents", "oceanCurrents.metadata"]);
    if (refreshEditedCurrents(map, crossings, new Set(edits.map(([id]) => id)))) {
      const previous = before.get("oceanCurrents.currents"), current = map.oceanCurrents.currents;
      const oldInfluence = new Map(), all = new Set();
      visitOceanCurrentClimate(map.grid, map.features, previous, traceOceanCurrentClimate(map.grid, previous), (cell, t, p) => {
        oldInfluence.set(cell, [Math.round(t), Math.round(p)]); all.add(cell);
      });
      const trace = traceOceanCurrentClimate(map.grid, current);
      const update = (cell, t, p) => {
        const [oldT, oldP] = oldInfluence.get(cell) || [0, 0];
        const temp = Math.max(-128, Math.min(127, grid.temp[cell] + Math.round(t) - oldT));
        const prec = Math.max(0, Math.min(255, grid.prec[cell] + Math.round(p) - oldP));
        if (temp === grid.temp[cell] && prec === grid.prec[cell]) return;
        write("grid", "temp", cell, temp); write("grid", "prec", cell, prec);
        for (const id of byGrid.get(cell) || []) {
          write("pack", "temp", id, temp); write("pack", "prec", id, prec);
          changedPack.add(id);
          for (const n of pack.c[id]) changedPack.add(n);
        }
      };
      for (const cell of all) if (!trace.touched.has(cell) || (Math.abs(trace.temperatureDelta[cell]) < 0.25 && Math.abs(trace.precipitationDelta[cell]) < 0.5)) update(cell, 0, 0);
      watch(["climate.metadata"]);
      map.climate.metadata.oceanCurrentInfluence = visitOceanCurrentClimate(map.grid, map.features, current, trace, update);
    }
  }
  const beforeOwnership = new Map([...changedPack].map(id => [id, {state: pack.state[id], province: pack.province[id],
    culture: pack.culture[id], religion: pack.religion[id], pop: pack.pop[id]}]));
  if (crossings.size) {
    reconcileAdministration(map, crossings, floodedPack, floodedStates, changedHarbors, write, watch);
    if (map.settlements?.routes?.some(route => route?.cells?.some(cell => crossings.has(cell)))) {
      watch(["settlements.routes", "pack.routes", "pack.cells.routes"]);
      reconcileRoutes(map, crossings);
    }
  }
  if (map.rivers?.rivers?.some(river => river?.cells?.some(cell => heightPack.has(cell)))) {
    watch(["pack.rivers", "rivers.rivers", "rivers.metadata"]);
    reconcileRivers(map, heightPack, write);
    for (const path of writes) if (path.startsWith("pack.cells.r.")) {
      const cell = Number(path.split(".").at(-1));
      if (!beforeOwnership.has(cell)) beforeOwnership.set(cell, {state: pack.state[cell], province: pack.province[cell],
        culture: pack.culture[cell], religion: pack.religion[cell], pop: pack.pop[cell]});
      changedPack.add(cell);
    }
  }
  const inputs = changedPack.size ? suitabilityRankInputs(map.pack) : null;
  const mirrorGrid = new Set([...edits.map(([cell]) => cell), ...previousClimate.temp.keys(), ...previousClimate.prec.keys()]);
  for (const id of changedPack) {
    const previous = pack.s[id];
    write("pack", "biome", id, biomeForPackCell(map.grid, pack, id));
    const base = suitabilityForPackCell(map.pack, id, inputs);
    write("pack", "suitabilityBase", id, base);
    const override = pack.suitabilityOverride?.[id];
    const score = pack.h[id] < 20 ? 0 : override >= 0 ? override : base;
    write("pack", "s", id, score);
    if (score !== previous || pack.h[id] < 20) write("pack", "pop", id, Math.fround(populationForSuitability(pack, id, score, inputs.meanArea)));
    mirrorGrid.add(pack.g[id]);
  }
  for (const cell of mirrorGrid) {
    const ids = byGrid.get(cell) || [];
    const biome = ids.length ? pack.biome[ids.at(-1)] : classifyBiome(grid.temp[cell], grid.prec[cell], grid.h[cell], map.features.features[grid.f[cell]]);
    write("grid", "biome", cell, biome);
    write("grid", "s", cell, Math.max(0, ...ids.map(id => pack.s[id])));
    write("grid", "pop", cell, Math.round(Math.max(0, ...ids.map(id => pack.pop[id])) * 1000) / 1000);
  }
  // The viewport can present these facts before settlement statistics and
  // object layers finish. Only the transaction below publishes map data.
  if (context.previewCells) {
    let rows = [];
    for (const cell of mirrorGrid) {
      rows.push([cell, ...HEIGHT_VIEW_FIELDS.map(field => grid[field]?.[cell])]);
      if (rows.length === 256) { context.previewCells(rows); rows = []; }
    }
    if (rows.length) context.previewCells(rows);
  }
  updateAffectedTerritories(map, beforeOwnership, floodedPack, writes, watch);
  if (crossings.size) updateChangedBorders(map, [...heightPack.keys()].filter(i => crossings.has(pack.g[i])), beforeOwnership, floodedPack, writes, watch);
  const pointCells = new Set(mirrorGrid);
  for (const path of writes) if (path.startsWith("grid.cells.burg.")) pointCells.add(Number(path.split(".").at(-1)));
  refreshPopulationPoints(map, pointCells, watch);
  if (map.climate?.metadata) {
    watch(["climate.metadata"]);
    updateClimateStatistics(map, previousClimate);
  }
  if (changedPack.size) {
    watch(["climate.metadata", "settlements.metadata"]);
    const {summary, gridPopulated} = readEditedSuitabilityStats(map, mirrorGrid, changedPack, []);
    if (map.climate?.metadata) Object.assign(map.climate.metadata, summary, {maxPopulation: Math.round(summary.maxPopulation * 1000) / 1000, manualSuitabilityCells: summary.manualCells});
    if (map.settlements?.metadata) {
      const stats = map.settlements.metadata;
      stats.populationCells = gridPopulated;
      stats.ruralPopulationPoints = map.settlements.populationPoints.length;
      if (crossings.size) {
        const cities = map.settlements.cities.filter(city => city && !city.removed);
        stats.cities = cities.length;
        stats.packBurgs = map.pack.burgs.filter(burg => burg?.i && !burg.removed).length;
        stats.capitals = cities.filter(city => city.capital).length;
        stats.ports = cities.filter(city => city.port).length;
        stats.routes = map.settlements.routes.length;
        stats.routeSegments = map.settlements.routes.reduce((n, r) => n + Math.max(0, (r?.points?.length || 1) - 1), 0);
      }
    }
  }
  for (const tablePath of ["markers.markers", "pack.markers"]) {
    const markers = valueAt(map, tablePath) || [];
    for (let i = 0; i < markers.length; i++) {
      const marker = markers[i], cell = marker?.packCell ?? marker?.data?.packCell;
      if (!marker?.data || !changedPack.has(cell)) continue;
      const facts = {height: pack.h[cell], state: pack.state[cell], province: pack.province[cell], feature: pack.f[cell]};
      if (Object.keys(facts).every(key => marker.data[key] === facts[key])) continue;
      marker.data = {...marker.data, ...facts};
      writes.add(tablePath + "." + i);
      // The main thread can hold independent mirrors even when the worker aliases them.
      const other = tablePath === "pack.markers" ? "markers.markers" : "pack.markers";
      if (valueAt(map, other)?.[i] === marker) writes.add(other + "." + i);
    }
  }
  for (const tablePath of ["politics.states", "pack.states"]) {
    const states = valueAt(map, tablePath);
    for (const state of states || []) {
      const forces = state?.military;
      if (state?.removed || !forces?.some(unit => changedPack.has(unit.cell))) continue;
      const index = state.i ?? state.id;
      watch(["politics.states." + index, "pack.states." + index]);
      writes.add(tablePath + "." + index);
      for (const unit of forces) {
        if (!changedPack.has(unit.cell)) continue;
        if (!unit.n && pack.h[unit.cell] < 20) {
          const dest = nearestOwnedLand(map, unit.cell, index);
          if (dest >= 0) {
            militaryMoved = true;
            const old = unit.cell, [x, y] = pack.p[dest];
            Object.assign(unit, {cell: dest, x, y, bx: x, by: y});
            if (unit.order?.targetCell === old) unit.order = {...unit.order, targetCell: dest};
          }
        }
        const context = manpowerContext(map.pack, state, unit);
        const {units, national, nationalTotal} = inspectManpower(context, {});
        Object.assign(unit, manpowerFitness(map.pack, unit, units, context.limits, national, nationalTotal));
      }
      if (map.pack.states?.[index] === map.politics.states?.[index]) {
        writes.add("politics.states." + index); writes.add("pack.states." + index);
      }
    }
  }
  for (const [path, original] of before) {
    const current = valueAt(map, path);
    if (equal(original, current)) continue;
    if ((Array.isArray(original) || ArrayBuffer.isView(original)) && current?.length === original.length) {
      for (let i = 0; i < current.length; i++) if (!equal(original[i], current[i])) writes.add(path + "." + i);
    } else writes.add(path);
  }
  for (const path of [...writes]) {
    const table = path.slice(0, path.lastIndexOf("."));
    if (!politicalTables.has(table)) continue;
    const id = path.slice(table.length + 1);
    const old = before.get(table)?.[id] ?? before.get(path);
    const value = valueAt(map, path);
    writes.delete(path);
    for (const field of territoryFields) if (!equal(old?.[field], value?.[field])) writes.add(path + "." + field);
  }
  const {heightEdits, heightBaseline, systems, ...remaining} = pending;
  const oldSystems = heightBaseline?.systems ?? (systems || []).filter(key => key !== "features");
  map.metadata.derivedStale = {...remaining, systems: [...new Set([...oldSystems, ...(systems || []).filter(key => !HEIGHT_SYSTEMS.has(key))])]};
  writes.add("metadata.derivedStale");
  for (const key of flags) {
    if (!map[key]?.metadata || !heightBaseline) continue;
    if (Object.hasOwn(heightBaseline.flags || {}, key)) map[key].metadata.stale = heightBaseline.flags[key];
    else delete map[key].metadata.stale;
    writes.add(key + ".metadata.stale");
  }
  const paths = [...writes].filter(path => {
    let parent = path;
    while (parent.includes(".")) {
      parent = parent.slice(0, parent.lastIndexOf("."));
      if (writes.has(parent)) return false;
    }
    return true;
  });
  return {patch: createDomainPatch("height-derived", paths, map), cells: edits.length, crossings: crossings.size, shoreClassification, militaryMoved};
}

const HEIGHT_SYSTEMS = new Set(["features", "rivers", "routes", "biomes", "cities", "states", "provinces", "religions", "markers", "zones", "military", "economy", "diplomacy"]);

function refreshEditedCurrents(map, crossings, edits) {
  const model = map.oceanCurrents;
  const cells = map.grid.cells;
  const preserved = [], invalid = [], basins = new Set();
  const oceanId = i => cells.h[i] < 20 && map.features.features[cells.f[i]]?.type === "ocean" ? cells.f[i] : 0;
  for (const current of model.currents || []) {
    const start = locateGridPoint(map.grid, ...current.path.segments[0].start, map.metadata).cell;
    if (!crossings.size) {
      if (edits.has(start) && current.metadata) current.metadata.sourceDepth = cells.h[start];
      continue;
    }
    const samples = sampleOceanCurrent(current).map(point => locateGridPoint(map.grid, ...point, map.metadata).cell);
    if (!samples.some(i => crossings.has(i)) && map.features.features[current.basinFeatureId]?.type === "ocean" && !map.features.features[current.basinFeatureId].removed) {
      if (edits.has(start) && current.metadata) current.metadata.sourceDepth = cells.h[start];
      preserved.push(current);
      continue;
    }
    const basin = oceanId(start) || samples.map(oceanId).find(Boolean);
    if (samples.some(i => crossings.has(i) && !oceanId(i)) || !basin) {
      invalid.push({current, basin});
      if (basin) basins.add(basin);
    } else {
      current.basinFeatureId = basin;
      if (current.metadata) current.metadata.sourceDepth = cells.h[start];
      preserved.push(current);
    }
  }
  if (invalid.length) {
    const fixed = buildOceanCurrents(map, {seed: model.seed, basinFeatureIds: basins, preservedCurrents: preserved});
    const existing = new Set(preserved.map(current => current.id));
    const candidates = fixed.currents.filter(current => !existing.has(current.id));
    const replacements = new Map();
    for (const {current, basin} of invalid) {
      const index = candidates.findIndex(candidate => candidate.basinFeatureId === basin);
      if (index < 0) continue;
      const [candidate] = candidates.splice(index, 1);
      replacements.set(current.id, {...current, basinFeatureId: basin, path: candidate.path, metadata: {...current.metadata, ...candidate.metadata}});
    }
    model.currents = model.currents.flatMap(current => existing.has(current.id) ? [current] : replacements.has(current.id) ? [replacements.get(current.id)] : []);
  }
  const segments = model.currents.reduce((sum, current) => sum + current.path.segments.length, 0);
  Object.assign(model.metadata, {count: model.currents.length, pathSegments: segments, controlPoints: segments * 4, inputChecksum: oceanCurrentInputChecksum(map)});
  return invalid.length > 0;
}

function updateClimateStatistics(map, previous) {
  const stats = map.climate.metadata;
  for (const [field, name] of [["temp", "temperature"], ["prec", "precipitation"]]) {
    if (!previous[field].size) continue;
    const values = map.grid.cells[field];
    let min = stats[name + "Min"], max = stats[name + "Max"], lostMin = false, lostMax = false;
    for (const [cell, old] of previous[field]) {
      lostMin ||= old === stats[name + "Min"] && values[cell] > old;
      lostMax ||= old === stats[name + "Max"] && values[cell] < old;
      min = Math.min(min, values[cell]); max = Math.max(max, values[cell]);
    }
    if (lostMin && min === stats[name + "Min"]) min = values.reduce((a, b) => Math.min(a, b), Infinity);
    if (lostMax && max === stats[name + "Max"]) max = values.reduce((a, b) => Math.max(a, b), -Infinity);
    stats[name + "Min"] = min; stats[name + "Max"] = max;
  }
  if (stats.biomeCounts) for (const [cell, old] of previous.biome) {
    const now = map.pack.cells.biome[cell];
    if (now === old) continue;
    if (stats.biomeCounts[old] > 1) stats.biomeCounts[old]--;
    else delete stats.biomeCounts[old];
    stats.biomeCounts[now] = (stats.biomeCounts[now] || 0) + 1;
  }
}

function updateAffectedTerritories(map, previous, flooded, writes, watch) {
  const cells = map.pack.cells;
  for (const [field, tables] of [["state", ["politics.states", "pack.states"]], ["province", ["politics.provinces", "pack.provinces"]],
    ["culture", ["society.cultures", "pack.cultures"]], ["religion", ["society.religions", "pack.religions"]]]) {
    const deltas = new Map();
    const add = (id, pop, count, area) => {
      if (!id) return;
      const d = deltas.get(id) || {pop: 0, cells: 0, area: 0};
      d.pop += pop; d.cells += count; d.area += area; deltas.set(id, d);
    };
    for (const [i, old] of previous) {
      if (old[field] === cells[field][i]) add(old[field], cells.pop[i] - old.pop, 0, 0);
      else {
        add(old[field], -old.pop, -1, -cells.area[i]);
        add(cells[field][i], cells.pop[i], 1, cells.area[i]);
      }
    }
    const touched = new Set();
    for (const path of tables) for (const [id, d] of deltas) {
      const obj = valueAt(map, path)?.[id];
      if (!obj || obj.removed || !(d.pop || d.cells || d.area)) continue;
      watch(tables.map(table => table + "." + id));
      writes.add(path + "." + id);
      if (touched.has(obj)) continue;
      touched.add(obj);
      if (Number.isFinite(obj.rural)) obj.rural = Math.max(0, Math.round((obj.rural + d.pop) * 100) / 100);
      if (d.cells) {
        obj.cells = Math.max(0, (obj.cells || 0) + d.cells);
        obj.area = Math.max(0, Math.round(((obj.area || 0) + d.area) * 100) / 100);
      }
      if (field === "province" && flooded.has(obj.center)) {
        const burg = map.pack.burgs?.[obj.burg];
        const land = burg && !burg.removed && cells.province[burg.cell] === id ? burg.cell : cells.province.findIndex((v, i) => v === id && cells.h[i] >= 20);
        if (land >= 0) Object.assign(obj, {center: land, gridCenter: cells.g[land], burg: cells.burg[land] || 0});
        else Object.assign(obj, {removed: true, cells: 0, area: 0, burg: 0});
      }
    }
  }
}

function updateChangedBorders(map, changed, previous, flooded, writes, watch) {
  const cells = map.pack.cells;
  for (const [field, name] of [["state", "states"], ["province", "provinces"]]) {
    const pairs = new Map();
    const note = (a, b, present) => {
      if (a === b || !map.politics[name][a] || !map.politics[name][b]) return;
      const key = a < b ? a + "/" + b : b + "/" + a;
      const item = pairs.get(key) || {a, b, present: false};
      item.present ||= present;
      pairs.set(key, item);
    };
    for (const i of changed) for (const n of cells.c[i]) {
      if (flooded.has(i) && (cells.h[n] >= 20 || flooded.has(n))) note(previous.get(i)[field], previous.get(n)?.[field] ?? cells[field][n], false);
      if (cells.h[i] >= 20 && cells.h[n] >= 20) note(cells[field][i], cells[field][n], true);
    }
    const missing = new Map();
    for (const pair of pairs.values()) if (!pair.present && map.politics[name][pair.a]?.neighbors?.includes(pair.b)) {
      if (!missing.has(pair.a)) missing.set(pair.a, new Map());
      missing.get(pair.a).set(pair.b, pair);
    }
    for (let i = 0; missing.size && i < cells.h.length; i++) {
      const candidates = missing.get(cells[field][i]);
      if (!candidates || cells.h[i] < 20) continue;
      for (const n of cells.c[i]) if (cells.h[n] >= 20 && candidates.has(cells[field][n])) {
        candidates.get(cells[field][n]).present = true;
        candidates.delete(cells[field][n]);
      }
      if (!candidates.size) missing.delete(cells[field][i]);
    }
    for (const {a, b, present} of pairs.values()) for (const [id, neighbor] of [[a, b], [b, a]]) {
      const paths = ["politics." + name + "." + id, "pack." + name + "." + id];
      if (!paths.some(path => {
        const row = valueAt(map, path);
        return row && !row.removed && Array.isArray(row.neighbors) && row.neighbors.includes(neighbor) !== present;
      })) continue;
      watch(paths);
      for (const path of paths) {
        const row = valueAt(map, path);
        if (!row || row.removed || !Array.isArray(row.neighbors)) continue;
        writes.add(path);
        if (row.neighbors.includes(neighbor) !== present) row.neighbors = present ? [...row.neighbors, neighbor] : row.neighbors.filter(i => i !== neighbor);
      }
    }
  }
}

function reconcileAdministration(map, crossings, floodedPack, states, changedHarbors, write, watch) {
  const pack = map.pack.cells;
  const economy = map.economy?.metadata;
  if (economy && floodedPack.size) {
    watch(["economy.metadata"]);
    for (const cell of floodedPack) {
      if (pack.market?.[cell] && Number.isFinite(economy.assignedMarketCells)) economy.assignedMarketCells = Math.max(0, economy.assignedMarketCells - 1);
      if (pack.good?.[cell] && Number.isFinite(economy.resourceCells)) economy.resourceCells = Math.max(0, economy.resourceCells - 1);
    }
  }
  for (const [section, cells] of [["grid", crossings], ["pack", floodedPack]]) {
    for (const cell of cells) {
      if (map[section].cells.h[cell] >= 20) continue;
      for (const key of ["state", "province", "culture", "religion"]) write(section, key, cell, 0);
      write(section, "region", cell, -1);
      if (section === "pack") for (const field of ["market", "good", "goodSupply", "goodSource"]) write(section, field, cell, 0);
    }
  }
  const lostStates = findLandlessStates(map, states);
  if (lostStates.size) watch(administrationPaths);
  const cities = map.settlements?.cities || [];
  const submergedCities = cities.filter(city => city && !city.removed && crossings.has(city.cell) && map.grid.cells.h[city.cell] < 20);
  for (const city of submergedCities.sort((a, b) => Number(Boolean(b.capital)) - Number(Boolean(a.capital)))) {
    const oldCell = city.packCell;
    const burg = map.pack.burgs?.[city.burgId];
    watch(["settlements.cities." + city.id, "pack.burgs." + city.burgId, "politics.states." + city.state, "pack.states." + city.state]);
    const dest = lostStates.has(city.state) ? -1 : nearestOwnedLand(map, oldCell, city.state, {settlement: true, province: city.province});
    write("grid", "burg", city.cell, -1);
    write("pack", "burg", oldCell, 0);
    if (dest < 0) {
      city.removed = true;
      city.capital = false;
      city.provincial = false;
      if (burg) Object.assign(burg, {removed: true, capital: 0, provincial: 0, port: 0});
      if (!lostStates.has(city.state)) for (const state of [map.pack.states?.[city.state], map.politics.states?.[city.state]]) {
        if (state?.capital !== city.burgId) continue;
        const substitute = cities.find(c => c && !c.removed && c.state === city.state && map.grid.cells.h[c.cell] >= 20 && pack.h[c.packCell] >= 20);
        state.capital = substitute?.burgId || 0;
        state.capitalName = substitute?.name || "";
        if (!substitute) continue;
        watch(["settlements.cities." + substitute.id, "pack.burgs." + substitute.burgId]);
        substitute.capital = true;
        map.pack.burgs[substitute.burgId].capital = 1;
        Object.assign(state, {center: substitute.packCell, gridCenter: substitute.cell});
      }
      continue;
    }
    const cell = pack.g[dest];
    const [x, y] = settlementLandPoint(map.grid, cell, pack.p[dest]);
    const port = inspectRelocatedSettlementPort(map.grid, map.pack, dest, {wasPort: city.port, capital: city.capital, burgId: city.burgId, options: map.options}).port;
    const owners = {province: pack.province[dest], culture: pack.culture[dest], religion: pack.religion[dest], port, x, y};
    if (city.provincial && city.province !== owners.province) {
      city.provincial = false;
      if (burg) burg.provincial = 0;
    }
    Object.assign(city, owners, {cell, packCell: dest});
    if (burg) Object.assign(burg, owners, {cell: dest, feature: pack.f[dest]});
    if (map.grid.cells.burg[cell] < 0) write("grid", "burg", cell, city.id);
    if (!pack.burg[dest]) write("pack", "burg", dest, city.burgId);
    for (const table of [map.pack.states, map.politics.states]) {
      const state = table?.[city.state];
      if (state?.capital === city.burgId) Object.assign(state, {center: dest, gridCenter: cell});
    }
    for (const markets of [map.economy?.markets, map.pack.markets]) {
      for (const [i, market] of (markets || []).entries()) if (market?.centerBurgId === city.burgId) {
        watch(["economy.markets." + i, "pack.markets." + i]);
        Object.assign(market, {cell: dest, x, y});
      }
    }
  }
  for (const city of cities) {
    if (!city?.port || city.removed || !changedHarbors.has(city.packCell)) continue;
    const {port} = inspectRelocatedSettlementPort(map.grid, map.pack, city.packCell, {wasPort: city.port, capital: city.capital, burgId: city.burgId, options: map.options});
    if (city.port === port) continue;
    watch(["settlements.cities." + city.id, "pack.burgs." + city.burgId]);
    city.port = port;
    if (map.pack.burgs[city.burgId]) map.pack.burgs[city.burgId].port = port;
  }
  retireLandlessStates(map, lostStates);
  if (lostStates.size) {
    for (const table of new Set([map.politics.states, map.pack.states])) refreshDiplomacySummaries(table);
    watch(["diplomacy.metadata", "pack.diplomacy.metadata", "military.metadata", "pack.military.metadata"]);
    const surviving = map.politics.states.filter(s => s && !s.removed && s.i);
    const forces = surviving.flatMap(s => s.military || []);
    for (const world of [map, map.pack]) {
      if (world.diplomacy?.metadata) Object.assign(world.diplomacy.metadata, summarizeDiplomacy(map.politics.states, world.diplomacy.metadata.buildMs));
      if (world.military?.metadata) Object.assign(world.military.metadata, {statesWithMilitary: surviving.filter(s => s.military?.length).length,
        regiments: forces.length, troops: forces.reduce((n, r) => n + (r.a || 0), 0), navalRegiments: forces.filter(r => r.n).length});
    }
  }
  for (const zones of new Set([map.zones?.zones, map.pack.zones])) {
    for (const [i, zone] of (zones || []).entries()) if (["generated", "auto-wilderness"].includes(zone?.source) && zone.cells?.some(cell => floodedPack.has(cell))) {
      watch(["zones.zones." + i, "pack.zones." + i, "zones.metadata"]);
      zone.cells = zone.cells.filter(cell => !floodedPack.has(cell));
    }
  }
  if (map.zones?.metadata) {
    watch(["zones.metadata"]);
    map.zones.metadata.cells = map.zones.zones.reduce((sum, zone) => sum + (zone?.cells?.length || 0), 0);
  }
}

function refreshPopulationPoints(map, changed, watch) {
  const points = map.settlements?.populationPoints;
  if (!Array.isArray(points)) return;
  const grid = map.grid, cells = grid.cells;
  const eligible = i => cells.pop[i] > 42 && cells.h[i] >= 20 && cells.burg[i] === -1;
  const limit = Math.min(2400, Math.round(cells.h.length * 0.22));
  const floor = points.length === limit ? points.at(-1)?.population : 42;
  if (!points.some(p => changed.has(p.cell) && (!eligible(p.cell) || cells.pop[p.cell] !== p.population))
      && !Array.from(changed).some(i => eligible(i) && cells.pop[i] >= floor)) return;
  watch(["settlements.populationPoints"]);
  const next = points.filter(p => !changed.has(p.cell));
  for (const cell of changed) if (eligible(cell)) next.push({cell, point: grid.points[cell], population: cells.pop[cell]});
  next.sort((a, b) => b.population - a.population || a.cell - b.cell);
  // Only a lost ranked slot can promote a previously unlisted cell.
  map.settlements.populationPoints = points.length === limit && (next.length < limit || next[limit - 1].population <= floor)
    ? buildPopulationPoints(grid, map.features, cells.pop) : next.slice(0, limit);
}

function nearestOwnedLand(map, origin, state, {settlement = false, province} = {}) {
  const cells = map.pack.cells;
  const [x, y] = cells.p[origin];
  let best = -1, distance = Infinity, bestPriority = Infinity;
  for (let i = 0; i < cells.h.length; i++) {
    if (cells.h[i] < 20 || map.grid.cells.h[cells.g[i]] < 20 || cells.state[i] !== state) continue;
    if (settlement && cells.burg[i]) continue;
    const priority = settlement && cells.province[i] !== province ? 1 : 0;
    const d = (x - cells.p[i][0]) ** 2 + (y - cells.p[i][1]) ** 2;
    if (priority < bestPriority || (priority === bestPriority && d < distance)) {
      best = i; distance = d; bestPriority = priority;
    }
  }
  return best;
}

function reconcileRoutes(map, crossings) {
  const routes = map.settlements?.routes;
  if (!routes) return;
  const cities = map.settlements.cities;
  const discarded = new Set();
  let touched = false;
  for (const route of routes) {
    if (!route?.cells?.some(cell => crossings.has(cell))) continue;
    const water = route.type === "searoute";
    const from = cities[route.from], to = cities[route.to];
    const oldStart = route.packCells[0], oldEnd = route.packCells.at(-1);
    const endpoint = (city, old) => city && crossings.has(map.pack.cells.g[old]) && map.pack.cells.h[old] < 20 && city.packCell !== old && !water ? city.packCell : old;
    const start = endpoint(from, oldStart), end = endpoint(to, oldEnd);
    const valid = water ? isSettlementWaterRoutePathValid(map.pack, route.packCells) : route.packCells.every(i => map.pack.cells.h[i] >= 20);
    if (!from?.removed && !to?.removed && start === oldStart && end === oldEnd && valid) continue;
    const path = from?.removed || to?.removed ? [] : traceSettlementRoutePath(map.pack, start, end, {water});
    if (!synchronizeRelocatedRoutePath(map.pack, cities, route, path, {preserveEndpointIdentity: true})) discarded.add(route.id);
    touched = true;
  }
  if (!touched) return;
  map.settlements.routes = routes.filter(route => route && !discarded.has(route.id));
  rebuildSettlementRouteMirrors(map.pack, map.settlements.routes);
}

function reconcileRivers(map, heights, write) {
  const rivers = map.rivers.rivers, pack = map.pack.cells;
  const removed = new Set();
  const changed = new Set(), affectedCells = new Set();
  for (const river of rivers) {
    if (!river?.cells?.some(cell => heights.has(cell))) continue;
    const id = river.i ?? river.id;
    const original = river.cells;
    let path = [...original];
    while (path.length && path[0] >= 0 && pack.h[path[0]] < 20) path.shift();
    const water = path.findIndex(cell => cell >= 0 && pack.h[cell] < 20);
    if (water >= 0) path = path.slice(0, water + 1);
    let parent = river.parent || 0;
    const obstruction = path.findIndex((cell, i) => i && cell >= 0 && heights.has(cell) &&
      (heights.get(cell) < 20 && pack.h[cell] >= 20 || pack.h[cell] > heights.get(cell) && pack.h[cell] > pack.h[path[i - 1]]));
    if (obstruction > 0) {
      const prefix = path.slice(0, obstruction);
      const downstream = traceDownhillRiver(map, prefix.at(-1), {excludeRiver: id, upstream: prefix});
      path = downstream.valid ? [...prefix.slice(0, -1), ...downstream.path] : prefix;
      parent = downstream.valid ? downstream.parent : 0;
    }
    if (equal(original, path)) continue;
    changed.add(id);
    for (const cell of [...original, ...path]) if (cell >= 0) affectedCells.add(cell);
    if (path.length < 2) { removed.add(id); continue; }
    const mouth = path.at(-1), source = path[0];
    const points = path.map((cell, i) => original[i] === cell && river.points?.[i] ? river.points[i] : pack.p[cell] || river.points.at(-1));
    const length = points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0);
    const outletKind = mouth < 0 ? "border" : pack.h[mouth] < 20 ? map.pack.features[pack.f[mouth]]?.type : parent ? "confluence" : "inland";
    if (outletKind !== "confluence") parent = 0;
    const parentRiver = parent && rivers.find(other => (other.i ?? other.id) === parent);
    Object.assign(river, {cells: path, points, gridCells: path.filter(cell => cell >= 0).map(cell => pack.g[cell]), source, sourceGrid: pack.g[source],
      mouth, mouthGrid: pack.g[mouth] ?? -1, length, parent, basin: parentRiver?.basin || id, confluence: parent ? mouth : null,
      outletKind, networkStatus: ({lake: "lake-inlet", ocean: "ocean-mouth", border: "border-outlet", inland: "orphaned", confluence: "tributary"})[outletKind],
      hydrology: {...river.hydrology, ...approximateCreatedHydrology(map, path)}});
    if (outletKind === "ocean" || outletKind === "lake") river.outletFeatureId = pack.f[mouth];
    else delete river.outletFeatureId;
  }
  if (!changed.size) return;
  map.rivers.rivers = rivers.filter(river => !removed.has(river.i ?? river.id));
  for (const cell of affectedCells) { write("pack", "r", cell, 0); write("pack", "conf", cell, 0); }
  for (const river of map.rivers.rivers) {
    if (removed.has(river.parent)) Object.assign(river, {parent: 0, basin: river.i ?? river.id, confluence: null});
    for (const cell of river.cells) if (affectedCells.has(cell) && pack.h[cell] >= 20) {
      if (pack.r[cell]) write("pack", "conf", cell, Math.max(pack.conf[cell] || 0, river.discharge || 1));
      else write("pack", "r", cell, river.i ?? river.id);
    }
  }
  map.pack.rivers = map.rivers.rivers;
  refreshRiverMetadata(map);
}
