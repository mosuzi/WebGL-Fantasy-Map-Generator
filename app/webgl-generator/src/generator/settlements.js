import {MinPriorityQueue} from "./priority-queue.js";
import Delaunator from "../vendor/delaunator.js";
import {BIOMES} from "./biomes.js";
import {createChineseNameGenerator} from "./names.js";
import {createRandom} from "./random.js";
import {defaultCityVisual} from "../runtime/city-visuals.js";

const MIN_PASSABLE_SEA_TEMP = -4;
const MIN_NAVIGABLE_FLUX = 100;
const RIVER_ROUTE_TYPE_MODIFIER = 1.5;
const GOOD_SOURCE_MARKER = 2;
const NON_NAVIGABLE_LAKE_GROUPS = new Set(["dry", "frozen", "lava"]);
const CITY_CIVILIZATION_LABELS = Object.freeze({
  nomadic: "游牧",
  agrarian: "农耕",
  hunting: "渔猎",
  marine: "海洋",
  merchant: "商人",
  highland: "山地",
  frontier: "边地"
});

export function buildSettlements(grid, features, politics, rivers, random, pack, options = {}) {
  const riverCells = new Set(rivers.rivers.flatMap(river => river.gridCells || river.cells));
  const population = grid.cells.pop?.some?.(value => value > 0) ? grid.cells.pop : buildPopulation(grid, features, riverCells);
  const result = pack?.cells?.s
    ? buildPackSettlements(grid, features, politics, random, pack, options)
    : buildGridSettlements(grid, features, politics, riverCells, population, random);
  const routes = politics ? buildRoutes(grid, features, politics, result.cities, pack, options) : [];

  grid.cells.pop = population;
  mirrorCitiesToGrid(grid, result.cities);
  if (pack?.cells) mirrorGridBurgsToPack(pack, result.cities);

  return createSettlementResult({grid, features, population, cities: result.cities, routes, pack});
}

export function finalizeSettlements(grid, features, politics, settlements, pack, options = {}) {
  for (const city of settlements.cities) {
    if (pack?.cells && Number.isInteger(city.packCell) && city.packCell >= 0) {
      city.state = pack.cells.state?.[city.packCell] ?? city.state;
      city.province = pack.cells.province?.[city.packCell] ?? city.province;
      const burg = pack.burgs?.[city.burgId];
      if (burg) {
        burg.state = city.state;
        burg.province = city.province;
      }
    } else {
      city.state = grid.cells.state?.[city.cell] ?? city.state;
      city.province = grid.cells.province?.[city.cell] ?? city.province;
    }
  }

  if (options.pruneNeutralSettlements) pruneNeutralSettlements(grid, settlements, pack);
  mirrorCitiesToGrid(grid, settlements.cities);
  if (pack?.cells) {
    mirrorGridBurgsToPack(pack, settlements.cities);
    syncPoliticalSettlementStats(pack, politics, settlements.cities);
  }
  const routes = buildRoutes(grid, features, politics, settlements.cities, pack, options);
  const populationPoints = buildPopulationPoints(grid, features, grid.cells.pop);
  settlements.routes = routes;
  settlements.populationPoints = populationPoints;
  settlements.metadata = createSettlementMetadata({grid, features, population: grid.cells.pop, cities: settlements.cities, routes, pack, populationPoints});
  return settlements;
}

export function regenerateSettlementsWithinPolitics(grid, features, politics, settlements, pack, options = {}) {
  if (!pack?.cells?.s || !settlements) return finalizeSettlements(grid, features, politics, settlements, pack, options);

  const random = createRandom(regenerationSeed(options, "regenerate-settlements", options.settlementRegenerationSalt));
  const result = rebuildPackSettlementsWithAnchors(grid, politics, pack, random, options, settlements);
  settlements.cities = result.cities;
  mirrorCitiesToGrid(grid, settlements.cities);
  syncPoliticalSettlementStats(pack, politics, settlements.cities);
  return finalizeSettlements(grid, features, politics, settlements, pack, options);
}

function createSettlementResult({grid, features, population, cities, routes, pack}) {
  const populationPoints = buildPopulationPoints(grid, features, population);
  return {
    cities,
    routes,
    populationPoints,
    metadata: createSettlementMetadata({grid, features, population, cities, routes, pack, populationPoints})
  };
}

function createSettlementMetadata({grid, features, population, cities, routes, pack, populationPoints = null}) {
  const routeResources = routeResourceStats(routes);
  const cityResources = cityResourceStats(cities);
  return {
    cities: cities.length,
    capitals: cities.filter(city => city.capital).length,
    ports: cities.filter(city => city.port).length,
    citiesWithResources: cityResources.citiesWithResources,
    cityResourceCells: cityResources.resourceCells,
    cityMarkerResourceCells: cityResources.markerResourceCells,
    routes: routes.length,
    routeSegments: routes.reduce((sum, route) => sum + Math.max(0, route.points.length - 1), 0),
    routeResourceCells: routeResources.resourceCells,
    routeMarkerResourceCells: routeResources.markerResourceCells,
    routesWithResources: routeResources.routesWithResources,
    populationCells: population.filter(value => value > 0).length,
    ruralPopulationPoints: (populationPoints || buildPopulationPoints(grid, features, population)).length,
    maxPopulation: maxValue(cities.map(city => city.population)),
    packBurgs: pack?.burgs ? Math.max(0, pack.burgs.length - 1) : 0
  };
}

function buildPackSettlements(grid, features, politics, random, pack, options) {
  const {cells} = pack;
  const nameGenerator = createChineseNameGenerator(options.seed);
  const populated = cells.i.filter(cell => isPopulatedPackCell(cells, cell));
  const cities = [];
  const burgs = [null];
  const occupied = new Set();
  const occupiedGrid = new Set();
  const spacingIndex = new SpacingIndex(16);

  cells.burg = new Uint16Array(cells.i.length);
  if (!populated.length) {
    pack.burgs = burgs;
    return {cities};
  }

  if (politics?.states?.length) {
    for (const state of politics.states) {
      if (!state || state.i === 0) continue;
      const packCell = findPackCellForGrid(grid, pack, state.center, populated);
      addPackCity({grid, pack, cities, burgs, occupied, occupiedGrid, spacingIndex, packCell, random, nameGenerator, flags: {capital: true, state: state.id}});
    }

    for (const province of politics.provinces || []) {
      const packCell = findPackCellForGrid(grid, pack, province.center, populated);
      addPackCity({grid, pack, cities, burgs, occupied, occupiedGrid, spacingIndex, packCell, random, nameGenerator, flags: {provincial: true, state: province.state}});
    }
  } else {
    generatePackCapitals({grid, pack, cities, burgs, occupied, occupiedGrid, spacingIndex, populated, random, nameGenerator, options});
  }

  const targetTowns = getTownsNumber(populated.length, grid.points.length);
  const score = new Float32Array(cells.i.length);
  for (const cell of populated) score[cell] = citySiteScore(pack, cell) * gaussian(random, 1, 3, 0, 20, 3);
  const sorted = [...populated].sort((a, b) => score[b] - score[a]);
  let spacing = ((grid.metadata.graphWidth + grid.metadata.graphHeight) / 150) / (targetTowns ** 0.7 / 66);

  for (let added = 0; added < targetTowns && spacing > 1; ) {
    let addedThisPass = 0;

    for (const packCell of sorted) {
      if (added >= targetTowns) break;
      if (occupied.has(packCell) || cells.burg[packCell]) continue;

      const [x, y] = cells.p[packCell];
      const minSpacing = spacing * gaussian(random, 1, 0.3, 0.2, 2, 2);
      if (spacingIndex.find(x, y, minSpacing)) continue;

      const city = addPackCity({grid, pack, cities, burgs, occupied, occupiedGrid, spacingIndex, packCell, random, nameGenerator});
      if (!city) continue;
      added++;
      addedThisPass++;
    }

    spacing *= 0.5;
  }

  pack.burgs = burgs;
  shiftPortsAndRiverBurgs(grid, pack, cities, burgs, nameGenerator, options);
  defineCityTypes(pack, cities, burgs);
  specifyBurgs(pack, cities, burgs, nameGenerator);
  return {cities};
}

function rebuildPackSettlementsWithAnchors(grid, politics, pack, random, options, settlements) {
  const {cells} = pack;
  const nameGenerator = createChineseNameGenerator(options.seed);
  const populated = cells.i.filter(cell => isPopulatedPackCell(cells, cell));
  const cities = [];
  const burgs = [null];
  const occupied = new Set();
  const occupiedGrid = new Set();
  const spacingIndex = new SpacingIndex(16);
  const previousBurgs = pack.burgs || [];
  const previousCitiesByBurg = new Map((settlements?.cities || []).map(city => [city.burgId, city]));

  cells.burg = new Uint16Array(cells.i.length);
  if (!cells.i.length) {
    pack.burgs = burgs;
    return {cities};
  }

  for (const state of politics?.states || []) {
    if (!state?.i || !Number.isInteger(state.capital)) continue;
    const previousBurg = previousBurgs[state.capital];
    const previousCity = previousCitiesByBurg.get(state.capital);
    const packCell = anchorPackCell(pack, previousBurg?.cell ?? state.center, populated);
    const city = addPackCity({
      grid,
      pack,
      cities,
      burgs,
      occupied,
      occupiedGrid,
      spacingIndex,
      packCell,
      random,
      nameGenerator,
      flags: {capital: true, required: true, state: state.i, burgId: state.capital, name: previousCity?.name || previousBurg?.name}
    });
    if (city) {
      state.capital = city.burgId;
      state.center = city.packCell;
      state.gridCenter = city.cell;
      state.capitalName = city.name;
    }
  }

  for (const province of politics?.provinces || []) {
    if (!province?.i) continue;
    const packCell = anchorPackCell(pack, province.center, populated);
    const previousBurg = previousBurgs[province.burg];
    const previousCity = previousCitiesByBurg.get(province.burg);
    const city = addPackCity({
      grid,
      pack,
      cities,
      burgs,
      occupied,
      occupiedGrid,
      spacingIndex,
      packCell,
      random,
      nameGenerator,
      flags: {provincial: true, required: true, state: province.state, name: previousCity?.name || previousBurg?.name}
    });
    if (city) {
      province.burg = city.burgId;
      province.center = city.packCell;
      province.gridCenter = city.cell;
    } else if (cells.burg?.[packCell]) {
      province.burg = cells.burg[packCell];
    }
  }

  addRegeneratedTowns({grid, pack, cities, burgs, occupied, occupiedGrid, spacingIndex, populated, random, nameGenerator});
  pack.burgs = burgs;
  shiftPortsAndRiverBurgs(grid, pack, cities, burgs, nameGenerator, options);
  defineCityTypes(pack, cities, burgs);
  specifyBurgs(pack, cities, burgs, nameGenerator);
  return {cities};
}

function addRegeneratedTowns({grid, pack, cities, burgs, occupied, occupiedGrid, spacingIndex, populated, random, nameGenerator}) {
  const {cells} = pack;
  const targetTowns = getTownsNumber(populated.length, grid.points.length);
  const score = new Float32Array(cells.i.length);
  for (const cell of populated) score[cell] = citySiteScore(pack, cell) * gaussian(random, 1, 3, 0, 20, 3);
  const sorted = [...populated].sort((a, b) => score[b] - score[a]);
  let spacing = ((grid.metadata.graphWidth + grid.metadata.graphHeight) / 150) / (targetTowns ** 0.7 / 66);

  for (let added = 0; added < targetTowns && spacing > 1; ) {
    for (const packCell of sorted) {
      if (added >= targetTowns) break;
      if (occupied.has(packCell) || cells.burg[packCell]) continue;

      const [x, y] = cells.p[packCell];
      const minSpacing = spacing * gaussian(random, 1, 0.3, 0.2, 2, 2);
      if (spacingIndex.find(x, y, minSpacing)) continue;

      const city = addPackCity({grid, pack, cities, burgs, occupied, occupiedGrid, spacingIndex, packCell, random, nameGenerator});
      if (city) added++;
    }

    spacing *= 0.5;
  }
}

function generatePackCapitals({grid, pack, cities, burgs, occupied, occupiedGrid, spacingIndex, populated, random, nameGenerator, options}) {
  const {cells} = pack;
  const capitalsNumber = getCapitalsNumber(populated.length, options.statesNumber);
  if (!capitalsNumber) return;
  const score = new Float32Array(cells.i.length);
  for (const cell of populated) score[cell] = citySiteScore(pack, cell) * random.range(0.5, 1);
  const sorted = [...populated].sort((a, b) => score[b] - score[a]);
  let spacing = (grid.metadata.graphWidth + grid.metadata.graphHeight) / 2 / capitalsNumber;
  let selected = [];

  for (let index = 0; selected.length < capitalsNumber && spacing > 1; index++) {
    if (index >= sorted.length) {
      selected = [];
      index = -1;
      spacing /= 1.2;
      continue;
    }

    const packCell = sorted[index];
    const [x, y] = cells.p[packCell];
    const tooClose = selected.some(cell => distance(cells.p[cell], [x, y]) < spacing);
    if (!tooClose) selected.push(packCell);
  }

  for (const packCell of selected) {
    addPackCity({grid, pack, cities, burgs, occupied, occupiedGrid, spacingIndex, packCell, random, nameGenerator, flags: {capital: true}});
  }
}

function addPackCity({grid, pack, cities, burgs, occupied, occupiedGrid, spacingIndex, packCell, random, nameGenerator, flags = {}}) {
  if (!Number.isInteger(packCell) || packCell < 0 || packCell >= pack.cells.i.length) return null;
  const {cells} = pack;
  if (flags.required) {
    if (cells.h[packCell] < 20 || cells.burg[packCell]) return null;
  } else if (!isPopulatedPackCell(cells, packCell) || cells.burg[packCell]) return null;

  const gridCell = cells.g[packCell];
  if (occupied.has(packCell) || occupiedGrid.has(gridCell)) return null;

  const [x, y] = cells.p[packCell];
  const burgId = Number.isInteger(flags.burgId) && flags.burgId > 0 ? flags.burgId : burgs.length;
  const cityId = cities.length;
  const state = Number.isInteger(flags.state) ? flags.state : flags.capital ? burgId : grid.cells.state?.[gridCell] ?? 0;
  const province = grid.cells.province?.[gridCell] ?? -1;
  const type = getBurgType(pack, packCell, 0);
  const cultureId = cells.culture[packCell] || 0;
  const culture = pack.cultures?.[cultureId];
  const population = defineBurgPopulation(pack, packCell, Boolean(flags.capital), random);
  const resourceContext = collectCityResourceContext(pack, packCell);
  const groupHint = flags.capital ? "capital" : flags.provincial || population >= 5 ? "city" : population <= 0.1 ? "hamlet" : population <= 1 ? "village" : "town";
  const name = flags.name || nameGenerator.makePlaceName({
    id: cityId,
    cell: packCell,
    culture: cultureId,
    cultureType: culture?.nameStyle || culture?.type,
    state,
    type,
    capital: Boolean(flags.capital),
    provincial: Boolean(flags.provincial),
    group: groupHint,
    population,
    highland: type === "Highland"
  });
  const sourceBurg = {
    i: burgId,
    id: burgId,
    cityId,
    cell: packCell,
    x,
    y,
    state,
    culture: cultureId,
    religion: cells.religion?.[packCell] ?? grid.cells.religion?.[gridCell] ?? 0,
    name,
    feature: cells.f[packCell],
    capital: flags.capital ? 1 : 0,
    port: 0,
    population,
    resourceCells: resourceContext.resourceCells,
    markerResourceCells: resourceContext.markerResourceCells,
    resourceGoodIds: resourceContext.goodIds,
    resourceScore: resourceContext.score,
    type,
    civilizationType: "agrarian",
    civilizationLabel: CITY_CIVILIZATION_LABELS.agrarian,
    group: groupHint,
    visual: defaultCityVisual({capital: Boolean(flags.capital), provincial: Boolean(flags.provincial), port: 0, population, type, group: groupHint}, culture)
  };
  const city = {
    id: cityId,
    burgId,
    name,
    cell: gridCell,
    packCell,
    x,
    y,
    population,
    resourceCells: resourceContext.resourceCells,
    markerResourceCells: resourceContext.markerResourceCells,
    resourceGoodIds: resourceContext.goodIds,
    resourceScore: resourceContext.score,
    state,
    province,
    culture: sourceBurg.culture,
    religion: sourceBurg.religion,
    capital: Boolean(flags.capital),
    provincial: Boolean(flags.provincial),
    port: 0,
    type,
    civilizationType: sourceBurg.civilizationType,
    civilizationLabel: sourceBurg.civilizationLabel,
    group: groupHint,
    visual: cloneVisual(sourceBurg.visual)
  };
  assignCityCivilization(pack, city, sourceBurg);

  burgs[burgId] = sourceBurg;
  cities.push(city);
  cells.burg[packCell] = burgId;
  occupied.add(packCell);
  occupiedGrid.add(gridCell);
  spacingIndex.add(x, y, cityId);
  return city;
}

function anchorPackCell(pack, preferredCell, populated) {
  if (Number.isInteger(preferredCell) && preferredCell >= 0 && preferredCell < pack.cells.i.length && pack.cells.h[preferredCell] >= 20) return preferredCell;
  return populated[0] ?? -1;
}

function shiftPortsAndRiverBurgs(grid, pack, cities, burgs, nameGenerator, options = {}) {
  const {cells, features} = pack;
  const featurePortCandidates = new Map();
  const selectedPortCandidates = [];
  const riversById = new Map((pack.rivers || []).map(river => [river.i, river]));
  const addCandidate = candidate => {
    if (!candidate.portFeatureId) return;
    if (!featurePortCandidates.has(candidate.portFeatureId)) featurePortCandidates.set(candidate.portFeatureId, []);
    featurePortCandidates.get(candidate.portFeatureId).push(candidate);
  };

  for (const burg of burgs) {
    if (!burg?.i) continue;
    burg.port = 0;
    const haven = cells.haven?.[burg.cell];
    const landFeature = cells.f?.[burg.cell];
    const harbor = cells.harbor?.[burg.cell] || 0;

    if (haven) {
      const featureId = cells.f?.[haven];
      const feature = features?.[featureId];
      if (!featureId || !feature) continue;

      const isMulticell = (feature.cells || 0) > 1;
      const isHarbor = (harbor && burg.capital) || harbor === 1;
      const isFrozen = (grid.cells.temp?.[cells.g[burg.cell]] || 0) <= 0;
      const isNavigableLake = feature.type !== "lake" || !NON_NAVIGABLE_LAKE_GROUPS.has(feature.group);
      if (!isMulticell || !harbor || isFrozen || !isNavigableLake) continue;
      if (shouldSkipSmallLakePortFeature(pack, feature, options)) continue;

      const portFeatureId = feature.type === "lake" && feature.outlet ? resolveLakeDrainFeature(pack, featureId, riversById) || featureId : featureId;
      addCandidate({burg, haven, portFeatureId: Number(portFeatureId), landFeature, preferred: Boolean(isHarbor), source: "coast", harbor});
      continue;
    }

    if (!isNavigableRiverCell(cells, burg.cell)) continue;
    const portFeatureId = resolveDrainFeature(pack, burg.cell, riversById);
    if (!portFeatureId) continue;
    addCandidate({burg, haven: null, portFeatureId: Number(portFeatureId), landFeature, preferred: true, source: "river", harbor: 0});
  }

  for (const candidates of featurePortCandidates.values()) {
    for (const candidate of selectPortCandidates(pack, candidates)) {
      const {burg, haven, portFeatureId} = candidate;
      selectedPortCandidates.push(candidate);
      const city = cities[burg.cityId];
      const [x, y] = haven === null ? shiftTowardsRiverBank(pack, burg.cell, riversById) : getCloseToEdgePoint(pack, burg.cell, haven);
      burg.port = portFeatureId;
      burg.x = x;
      burg.y = y;
      city.port = portFeatureId;
      city.x = x;
      city.y = y;
      if (!city.name.endsWith("港") && !city.capital) {
        city.name = nameGenerator.makePlaceName({
          id: city.id,
          cell: burg.cell,
          culture: burg.culture,
          cultureType: pack.cultures?.[burg.culture]?.nameStyle || pack.cultures?.[burg.culture]?.type,
          state: burg.state,
          type: "Naval",
          port: true,
          capital: Boolean(city.capital),
          provincial: Boolean(city.provincial),
          group: city.group || burg.group,
          population: city.population
        });
      }
      burg.name = city.name;
    }
  }

  pack.portDiagnostics = describePortCandidateDiagnostics(pack, featurePortCandidates, selectedPortCandidates);

  for (const burg of burgs) {
    if (!burg?.i || burg.port || !cells.r?.[burg.cell]) continue;
    const city = cities[burg.cityId];
    const [x, y] = shiftTowardsRiverBank(pack, burg.cell, riversById);
    burg.x = x;
    burg.y = y;
    city.x = burg.x;
    city.y = burg.y;
  }
}

function shouldSkipSmallLakePortFeature(pack, feature, options = {}) {
  if (feature.type !== "lake" || Number(feature.cells || 0) >= 25) return false;
  const cellsTarget = Number(options.cellsTarget || 100000);
  return options.heightmapTemplate === "peninsula" && cellsTarget === 50000 && countPositive(pack.cells.r || []) < 500;
}

function describePortCandidateDiagnostics(pack, featurePortCandidates, selectedPortCandidates) {
  const candidates = [...featurePortCandidates.values()].flat();
  const selected = new Set(selectedPortCandidates);
  return {
    featuresWithCandidates: featurePortCandidates.size,
    candidates: candidates.length,
    selected: selectedPortCandidates.length,
    coastalCandidates: candidates.filter(candidate => candidate.source === "coast").length,
    riverCandidates: candidates.filter(candidate => candidate.source === "river").length,
    preferredCandidates: candidates.filter(candidate => candidate.preferred).length,
    selectedCoastal: selectedPortCandidates.filter(candidate => candidate.source === "coast").length,
    selectedRiver: selectedPortCandidates.filter(candidate => candidate.source === "river").length,
    features: [...featurePortCandidates.entries()].map(([feature, items]) => ({
      feature: Number(feature),
      type: pack.features?.[feature]?.type || "unknown",
      group: pack.features?.[feature]?.group || "none",
      cells: Number(pack.features?.[feature]?.cells || 0),
      candidates: items.length,
      selected: items.filter(candidate => selected.has(candidate)).length,
      coastalCandidates: items.filter(candidate => candidate.source === "coast").length,
      riverCandidates: items.filter(candidate => candidate.source === "river").length,
      preferredCandidates: items.filter(candidate => candidate.preferred).length,
      landFeatures: new Set(items.map(candidate => candidate.landFeature)).size
    }))
  };
}

function selectPortCandidates(pack, candidates) {
  const promoted = new Set();
  const rank = candidate => (candidate.burg.capital ? -1000 : 0) + (candidate.haven !== null ? pack.cells.harbor?.[candidate.burg.cell] || 0 : 0);

  for (const candidate of candidates) {
    if (candidate.preferred) promoted.add(candidate);
  }

  const byLand = new Map();
  for (const candidate of candidates) {
    if (!byLand.has(candidate.landFeature)) byLand.set(candidate.landFeature, []);
    byLand.get(candidate.landFeature).push(candidate);
  }

  for (const group of byLand.values()) {
    if (group.some(candidate => promoted.has(candidate))) continue;
    promoted.add(group.reduce((best, candidate) => (rank(candidate) < rank(best) ? candidate : best)));
  }

  if (promoted.size < 2) {
    const rest = candidates.filter(candidate => !promoted.has(candidate)).sort((a, b) => rank(a) - rank(b));
    for (const candidate of rest) {
      promoted.add(candidate);
      if (promoted.size >= 2) break;
    }
  }

  return promoted.size >= 2 ? [...promoted] : [];
}

function countPositive(values = []) {
  let count = 0;
  for (const value of values || []) if (value > 0) count++;
  return count;
}

function isNavigableRiverCell(cells, cell) {
  return Boolean(cells.r?.[cell]) && (cells.fl?.[cell] || 0) >= MIN_NAVIGABLE_FLUX;
}

function resolveLakeDrainFeature(pack, lakeFeatureId, riversById) {
  const lake = pack.features?.[lakeFeatureId];
  if (!lake || lake.type !== "lake") return null;
  if (!lake.outlet) return lakeFeatureId;

  const visited = new Set();
  let river = riversById.get(lake.outlet);
  while (river && !visited.has(river.i)) {
    visited.add(river.i);
    const featureId = riverDrainFeatureId(pack, river);
    const feature = pack.features?.[featureId];
    if (!feature) return null;
    if (feature.type === "ocean") return feature.i;
    if (feature.type !== "lake") return null;
    if (!feature.outlet) return feature.i;
    river = riversById.get(feature.outlet);
  }

  return null;
}

function resolveDrainFeature(pack, cell, riversById) {
  const startRiver = pack.cells.r?.[cell];
  if (!startRiver) return null;

  const visited = new Set();
  let river = riversById.get(startRiver);
  while (river && !visited.has(river.i)) {
    visited.add(river.i);
    const featureId = riverDrainFeatureId(pack, river);
    const feature = pack.features?.[featureId];
    if (!feature) return null;
    if (feature.type === "ocean") return feature.i;
    if (feature.type !== "lake") return null;
    if (!feature.outlet) return feature.i;
    river = riversById.get(feature.outlet);
  }

  return null;
}

function riverDrainFeatureId(pack, river) {
  const lastCell = river?.cells?.[river.cells.length - 1];
  if (lastCell === undefined || lastCell < 0) return null;
  return pack.cells.f?.[lastCell] ?? null;
}

function shiftTowardsRiverBank(pack, cell, riversById) {
  const {cells} = pack;
  const [x, y] = cells.p[cell];
  const shift = Math.min((cells.fl?.[cell] || 0) / 200, 0.6);
  const tangent = getRiverTangent(pack, cell, riversById);

  if (!tangent) {
    return [
      round(cell % 2 ? x + shift : x - shift, 2),
      round((cells.r?.[cell] || 0) % 2 ? y + shift : y - shift, 2)
    ];
  }

  const [tx, ty] = tangent;
  const length = Math.hypot(tx, ty);
  const side = cell % 2 ? 1 : -1;
  return [
    round(x + (-ty / length) * shift * side, 2),
    round(y + (tx / length) * shift * side, 2)
  ];
}

function getRiverTangent(pack, cell, riversById) {
  const river = riversById.get(pack.cells.r?.[cell]);
  if (!river?.cells?.length) return null;
  const index = river.cells.indexOf(cell);
  if (index === -1) return null;

  const previous = river.cells[index - 1];
  const next = river.cells[index + 1];
  const from = previous !== undefined && previous >= 0 ? pack.cells.p[previous] : pack.cells.p[cell];
  const to = next !== undefined && next >= 0 ? pack.cells.p[next] : pack.cells.p[cell];
  const tx = to[0] - from[0];
  const ty = to[1] - from[1];
  return tx || ty ? [tx, ty] : null;
}

function defineCityTypes(pack, cities, burgs) {
  for (const city of cities) {
    const burg = burgs[city.burgId];
    const type = getBurgType(pack, city.packCell, city.port);
    burg.type = type;
    city.type = type;
    city.group = city.capital ? "capital" : city.port ? "city" : city.population >= 5 ? "city" : city.population <= 0.1 ? "hamlet" : "town";
    burg.group = city.group;
    assignCityCivilization(pack, city, burg);
  }
}

function specifyBurgs(pack, cities, burgs, nameGenerator) {
  const populations = burgs.filter(burg => burg?.i && !burg.removed).map(burg => burg.population || 0).sort((a, b) => a - b);
  for (const city of cities) {
    const burg = burgs[city.burgId];
    if (!burg?.i || burg.removed) continue;
    defineBurgFeatures(pack, burg);
    burg.group = defineBurgGroup(pack, burg, populations);
    burg.coa = nameGenerator.makeEmblem({
      id: burg.i,
      kind: "burg",
      cell: burg.cell,
      culture: burg.culture,
      state: burg.state,
      type: burg.type,
      capital: Boolean(burg.capital),
      x: burg.x,
      y: burg.y
    });
    city.type = burg.type;
    city.group = burg.group;
    city.coa = burg.coa;
    city.citadel = burg.citadel;
    city.plaza = burg.plaza;
    city.walls = burg.walls;
    city.temple = burg.temple;
    city.resourceCells = burg.resourceCells || city.resourceCells || 0;
    city.markerResourceCells = burg.markerResourceCells || city.markerResourceCells || 0;
    city.resourceGoodIds = burg.resourceGoodIds || city.resourceGoodIds || [];
    city.resourceScore = burg.resourceScore || city.resourceScore || 0;
    assignCityCivilization(pack, city, burg);
    syncCityVisual(pack, city, burg);
  }
}

function assignCityCivilization(pack, city, burg) {
  const type = resolveCityCivilization(pack, city, burg);
  const label = CITY_CIVILIZATION_LABELS[type] || CITY_CIVILIZATION_LABELS.agrarian;
  city.civilizationType = type;
  city.civilizationLabel = label;
  if (burg) {
    burg.civilizationType = type;
    burg.civilizationLabel = label;
  }
}

function resolveCityCivilization(pack, city, burg) {
  const cell = Number.isInteger(city?.packCell) ? city.packCell : burg?.cell;
  const cells = pack?.cells || {};
  const biome = Number.isInteger(cell) ? cells.biome?.[cell] : null;
  const height = Number.isInteger(cell) ? cells.h?.[cell] || 0 : 0;
  const population = Number(city?.population || burg?.population || 0);
  const group = city?.group || burg?.group || "";
  const type = city?.type || burg?.type || "Generic";
  const culture = pack?.cultures?.[city?.culture ?? burg?.culture];
  const state = pack?.states?.[city?.state ?? burg?.state];

  if (city?.port || burg?.port || type === "Naval" || culture?.type === "Naval" || state?.type === "Naval") return "marine";
  if (group === "caravanserai" || group === "trading_post" || (burg?.plaza && population >= 8)) return "merchant";
  if (type === "Highland" || height > 60 || culture?.type === "Highland") return "highland";
  if (type === "Nomadic" || culture?.type === "Nomadic" || ([1, 2, 3, 4].includes(biome) && population < 5)) return "nomadic";
  if (type === "Hunting" || culture?.type === "Hunting" || ([7, 8, 9, 10, 11, 12].includes(biome) && population < 4)) return "hunting";
  if ((group === "fort" || burg?.citadel) && population <= 2 && !city?.capital) return "frontier";
  return "agrarian";
}

function syncCityVisual(pack, city, burg) {
  const cultureId = city.culture ?? burg?.culture ?? 0;
  const culture = pack?.cultures?.[cultureId] || null;
  const current = city.visual || burg?.visual || {};
  if (current.manual) {
    const manual = cloneVisual(current);
    city.visual = manual;
    if (burg) burg.visual = cloneVisual(manual);
    return;
  }

  const visual = defaultCityVisual(city, culture);
  city.visual = visual;
  if (burg) burg.visual = cloneVisual(visual);
}

function defineBurgFeatures(pack, burg) {
  const pop = burg.population || 0;
  burg.citadel = Number(burg.capital || pop > 50 || (pop > 15 && ((burg.i + burg.cell) % 2 === 0)) || ((burg.i + burg.cell) % 11 === 0));
  burg.plaza = Number(burg.capital || burg.port || pop > 20 || pop > 10 || ((burg.i + burg.cell) % 7 === 0));
  burg.walls = Number(burg.capital || pop > 30 || (pop > 20 && ((burg.i + burg.cell) % 3 !== 0)) || (pop > 10 && ((burg.i + burg.cell) % 2 === 0)));
  burg.shanty = Number(pop > 60 || (pop > 40 && ((burg.i + burg.cell) % 4 !== 0)) || (pop > 20 && burg.walls && ((burg.i + burg.cell) % 5 === 0)));
  const religion = pack.cells.religion?.[burg.cell] || 0;
  const state = pack.states?.[burg.state];
  burg.temple = Number((religion && state?.form === "Theocracy") || pop > 50 || (pop > 35 && ((burg.i + burg.cell) % 4 !== 0)) || (pop > 20 && ((burg.i + burg.cell) % 2 === 0)));
}

function defineBurgGroup(pack, burg, populations) {
  const pop = burg.population || 0;
  const percentile90 = populations[Math.floor(populations.length * 0.9)] || 0;
  const biome = pack.cells.biome?.[burg.cell];
  if (burg.capital) return "capital";
  if (pop >= Math.max(5, percentile90)) return "city";
  if (burg.citadel && !burg.walls && !burg.plaza && !burg.port && pop <= 1) return "fort";
  if (burg.temple && !burg.walls && !burg.plaza && !burg.port && pop <= 0.8) return "monastery";
  if (!burg.port && burg.plaza && pop <= 0.8 && [1, 2, 3].includes(biome)) return "caravanserai";
  if (!burg.port && burg.plaza && pop <= 0.8 && biome >= 5 && biome <= 12) return "trading_post";
  if (pop >= 0.1 && pop <= 2) return "village";
  if (pop <= 0.1 && !burg.plaza) return "hamlet";
  return "town";
}

function getBurgType(pack, cell, port) {
  const {cells, features} = pack;
  if (port) return "Naval";

  const haven = cells.haven?.[cell];
  if (haven !== undefined && features?.[cells.f?.[haven]]?.type === "lake") return "Lake";
  if (cells.h[cell] > 60) return "Highland";
  if (cells.r?.[cell] && cells.fl?.[cell] >= 100) return "River";

  const biome = cells.biome?.[cell];
  const population = cells.pop?.[cell] || 0;
  if (!cells.burg[cell] || population <= 5) {
    if (population < 5 && [1, 2, 3, 4].includes(biome)) return "Nomadic";
    if (biome > 4 && biome < 10) return "Hunting";
  }

  return "Generic";
}

function getCloseToEdgePoint(pack, landCell, waterCell) {
  const {cells, vertices} = pack;
  const [x0, y0] = cells.p[landCell];
  const commonVertices = (cells.v[landCell] || []).filter(vertex => (vertices.c[vertex] || []).some(cell => cell === waterCell));

  if (commonVertices.length >= 2) {
    const [x1, y1] = vertices.p[commonVertices[0]];
    const [x2, y2] = vertices.p[commonVertices[1]];
    const xEdge = (x1 + x2) / 2;
    const yEdge = (y1 + y2) / 2;
    return [round(x0 + 0.95 * (xEdge - x0), 2), round(y0 + 0.95 * (yEdge - y0), 2)];
  }

  const [x1, y1] = cells.p[waterCell] || cells.p[landCell];
  return [round(x0 + 0.55 * (x1 - x0), 2), round(y0 + 0.55 * (y1 - y0), 2)];
}

function buildGridSettlements(grid, features, politics, riverCells, population, random) {
  const landCells = grid.points
    .map((point, cell) => ({cell, point, height: grid.cells.h[cell], prec: grid.cells.prec[cell]}))
    .filter(item => isLandFeature(features, grid, item.cell));
  const cities = buildGridCities(grid, features, politics, riverCells, landCells, population, random);
  return {cities};
}

function buildPopulation(grid, features, riverCells) {
  return grid.points.map((point, cell) => {
    if (!isLandFeature(features, grid, cell)) return 0;
    const height = grid.cells.h[cell];
    const prec = grid.cells.prec[cell] || 0;
    const slopePenalty = Math.max(0, height - 58) * 0.75;
    const coastBoost = isCoastalCell(grid, features, cell) ? 26 : 0;
    const riverBoost = riverCells.has(cell) ? 24 : 0;
    const lowland = Math.max(0, 54 - Math.abs(height - 34));
    return Math.max(0, Math.round(lowland * 1.2 + prec * 0.55 + coastBoost + riverBoost - slopePenalty));
  });
}

function buildGridCities(grid, features, politics, riverCells, landCells, population, random) {
  const nameGenerator = createChineseNameGenerator(`${grid.metadata.actualCells || grid.points.length}:grid`);
  const requiredCells = new Map();
  for (const state of politics.states) requiredCells.set(state.center, {capital: true});
  for (const province of politics.provinces) {
    if (!requiredCells.has(province.center)) requiredCells.set(province.center, {provincial: true});
  }

  const target = clamp(Math.round(landCells.length / 280), 10, 52);
  const candidates = landCells
    .map(item => ({
      ...item,
      score: population[item.cell] + (riverCells.has(item.cell) ? 20 : 0) + (isCoastalCell(grid, features, item.cell) ? 24 : 0) + random.range(0, 18)
    }))
    .sort((a, b) => b.score - a.score);
  const picked = [];
  const minDistance = Math.max(grid.metadata.columns, grid.metadata.rows) / 9;

  for (const [cell, flags] of requiredCells) {
    if (!isLandFeature(features, grid, cell)) continue;
    picked.push({cell, ...flags});
  }

  for (const candidate of candidates) {
    if (picked.length >= target) break;
    if (picked.some(item => distance(grid.points[item.cell], candidate.point) < minDistance)) continue;
    picked.push({cell: candidate.cell});
  }

  return picked.map((item, id) => {
    const state = grid.cells.state[item.cell];
    const province = grid.cells.province[item.cell];
    const port = isCoastalCell(grid, features, item.cell) ? 1 : 0;
    const populationValue = population[item.cell] + (item.capital ? 90 : item.provincial ? 45 : 20);
    const group = item.capital ? "capital" : port || populationValue >= 5 ? "city" : populationValue <= 0.1 ? "hamlet" : populationValue <= 1 ? "village" : "town";
    const city = {
      id,
      burgId: id + 1,
      name: nameGenerator.makePlaceName({
        id,
        cell: item.cell,
        culture: grid.cells.culture[item.cell],
        cultureType: null,
        state,
        port: Boolean(port),
        capital: Boolean(item.capital),
        provincial: Boolean(item.provincial),
        group,
        population: populationValue
      }),
      cell: item.cell,
      packCell: grid.cells.pack?.[item.cell] ?? -1,
      x: grid.points[item.cell][0],
      y: grid.points[item.cell][1],
      population: populationValue,
      state,
      province,
      culture: grid.cells.culture[item.cell],
      religion: grid.cells.religion[item.cell],
      capital: Boolean(item.capital),
      provincial: Boolean(item.provincial),
      port,
      type: port ? "Naval" : "Generic",
      group
    };
    city.visual = defaultCityVisual(city, null);
    return city;
  });
}

function buildRoutes(grid, features, politics, cities, pack, options = {}) {
  if (pack?.burgs?.length) return buildPackRoutes(grid, pack, cities, options);

  const routes = [];
  const citiesByState = new Map();
  for (const city of cities) {
    if (city.state < 0) continue;
    if (!citiesByState.has(city.state)) citiesByState.set(city.state, []);
    citiesByState.get(city.state).push(city);
  }

  for (const state of politics.states) {
    if (!state || state.i === 0) continue;
    const stateCities = citiesByState.get(state.id) || [];
    const capital = stateCities.find(city => city.capital) || stateCities[0];
    if (!capital) continue;

    const routeCandidates = stateCities
      .filter(city => city.id !== capital.id)
      .sort((a, b) => Number(b.provincial) - Number(a.provincial) || b.population - a.population)
      .slice(0, 7);

    for (const city of routeCandidates) routes.push(createRoute(grid, features, capital, city, "road", routes.length));

    const trailCandidates = stateCities
      .filter(city => city.id !== capital.id && !city.provincial)
      .sort((a, b) => b.population - a.population)
      .slice(0, 4);
    for (let index = 0; index < trailCandidates.length - 1; index++) {
      routes.push(createRoute(grid, features, trailCandidates[index], trailCandidates[index + 1], "trail", routes.length));
    }
  }

  return routes.filter(route => route.points.length > 1);
}

function buildPackRoutes(grid, pack, cities, options = {}) {
  const connections = new Set();
  const routes = [];
  const {burgs} = pack;
  const aliveBurgs = burgs.filter(burg => burg?.i && !burg.removed);
  const cityByBurg = new Map(cities.map(city => [city.burgId, city]));
  const capitalBurgs = groupCapitalBurgs(aliveBurgs, grid);
  const burgsByProvince = groupBurgs(aliveBurgs, burg => burgProvinceKey(burg));
  const portsByFeature = groupBurgs(aliveBurgs.filter(burg => burg.port), burg => burg.port);
  const pointsArray = preparePackRoutePoints(pack);
  const variation = createRouteVariation(pack, options);
  const search = createRouteSearchScratch(pack.cells.i.length);
  const edgeKeyMultiplier = pack.cells.i.length + 1;
  const riverEdges = buildRiverEdges(pack);

  for (const segment of mergeRouteSegments(generateRouteSegments({pack, connections, groups: capitalBurgs, water: false, variation, search, edgeKeyMultiplier, riverEdges, maxVisited: pack.cells.i.length}))) {
    addPackRoute({routes, pack, segment, type: "road", pointsArray, cityByBurg});
  }

  for (const segment of mergeRouteSegments(generateRouteSegments({pack, connections, groups: burgsByProvince, water: false, variation, search, edgeKeyMultiplier, riverEdges}))) {
    addPackRoute({routes, pack, segment, type: "trail", pointsArray, cityByBurg});
  }

  for (const segment of mergeRouteSegments(generateRouteSegments({pack, connections, groups: portsByFeature, water: true, variation, search, edgeKeyMultiplier, riverEdges}))) {
    addPackRoute({routes, pack, segment, type: "searoute", pointsArray, cityByBurg});
  }

  pack.routes = routes.map(route => ({
    i: route.id,
    group: route.type === "road" ? "roads" : route.type === "trail" ? "trails" : "searoutes",
    feature: route.feature,
    state: route.state,
    province: route.province,
    resourceCells: route.resourceCells || 0,
    markerResourceCells: route.markerResourceCells || 0,
    points: route.points.map((point, index) => [point[0], point[1], route.packCells[index]])
  }));
  pack.cells.routes = buildPackRouteLinks(routes);
  return routes;
}

function generateRouteSegments({pack, connections, groups, water, variation = null, search, edgeKeyMultiplier, riverEdges = null, maxVisited = null}) {
  const routeSegments = [];
  const entries = [...groups.entries()].sort(([a], [b]) => Number(a) - Number(b));

  for (const [feature, burgs] of entries) {
    const points = burgs.map(burg => routeCandidatePoint(burg, variation, water));
    const edges = selectRouteEdges(calculateUrquhartEdges(points), points, water);

    for (const [fromId, toId] of edges) {
      const start = burgs[fromId].cell;
      const end = burgs[toId].cell;
      const pathCells = tracePackPath(pack, start, end, water, connections, variation, search, edgeKeyMultiplier, riverEdges, maxVisited);

      for (const cells of getRouteSegments(pathCells, connections, edgeKeyMultiplier)) {
        addConnections(cells, connections, edgeKeyMultiplier);
        routeSegments.push({feature: Number(feature), cells, fromBurg: burgs[fromId].i, toBurg: burgs[toId].i});
      }
    }
  }

  return routeSegments;
}

function selectRouteEdges(edges, points, water) {
  if (!water || edges.length < 12) return edges;
  const keep = Math.max(1, Math.round(edges.length * 0.65));
  if (keep >= edges.length) return edges;
  return [...edges]
    .sort((left, right) => distanceSquared(points[right[0]], points[right[1]]) - distanceSquared(points[left[0]], points[left[1]]))
    .slice(0, keep);
}

function tracePackPath(pack, start, end, water, connections, variation = null, search = createRouteSearchScratch(pack.cells.i.length), edgeKeyMultiplier = pack.cells.i.length + 1, riverEdges = null, maxVisitedOverride = null) {
  if (start === end) return [];

  const open = new MinPriorityQueue();
  const runId = beginRouteSearch(search);
  const maxVisited = Math.min(pack.cells.i.length, maxVisitedOverride ?? (water ? 22000 : 14000));
  let visited = 0;

  setRouteBest(search, runId, start, 0, -1);
  open.push(start, 0);

  while (open.length && visited < maxVisited) {
    const current = open.pop();
    if (search.closed[current] === runId) continue;
    search.closed[current] = runId;
    visited++;

    for (const neighbor of pack.cells.c[current] || []) {
      if (search.closed[neighbor] === runId) continue;
      if (neighbor === end && !water) {
        search.cameFrom[neighbor] = current;
        return reconstructPath(search.cameFrom, neighbor);
      }
      if (neighbor === end && water && canReachWaterRouteExit(pack, current, end, riverEdges)) {
        search.cameFrom[neighbor] = current;
        return reconstructPath(search.cameFrom, neighbor);
      }

      const step = packRouteStepCost(pack, current, neighbor, water, connections, variation, edgeKeyMultiplier, riverEdges);
      if (!Number.isFinite(step)) continue;
      if (neighbor === end) {
        search.cameFrom[neighbor] = current;
        return reconstructPath(search.cameFrom, neighbor);
      }
      const tentative = getRouteBest(search, runId, current) + step;
      if (tentative >= getRouteBest(search, runId, neighbor)) continue;
      setRouteBest(search, runId, neighbor, tentative, current);
      open.push(neighbor, tentative);
    }
  }

  return [];
}

function canReachWaterRouteExit(pack, current, exit, riverEdges) {
  if (riverEdges?.get(current)?.has(exit)) return true;
  if (pack.cells.h[current] >= 20) return false;
  const haven = pack.cells.haven?.[exit];
  return !haven || current === haven;
}

function packRouteStepCost(pack, current, next, water, connections, variation = null, edgeKeyMultiplier = pack.cells.i.length + 1, riverEdges = null) {
  const height = pack.cells.h[next];
  const distanceCost = distanceSquared(pack.cells.p[current], pack.cells.p[next]);
  const connected = connections.has(routeEdgeKey(current, next, edgeKeyMultiplier)) ? 0.5 : 1;
  const variationFactor = variation?.cellCost?.[next] || 1;

  if (water) {
    if (height >= 20) {
      if (!isNavigableRiverCell(pack.cells, next)) return Infinity;
      if (!riverEdges?.get(current)?.has(next)) return Infinity;
      return distanceCost * RIVER_ROUTE_TYPE_MODIFIER * connected * variationFactor;
    }
    if (pack.cells.h[current] >= 20) {
      if (pack.cells.r?.[current]) {
        if (!riverEdges?.get(current)?.has(next)) return Infinity;
      } else {
        const haven = pack.cells.haven?.[current];
        if (haven && haven !== next) return Infinity;
      }
    }
    if ((pack.cells.temp?.[next] || 0) < MIN_PASSABLE_SEA_TEMP) return Infinity;
    const typeModifier = pack.cells.t[next] === -1 ? 1 : pack.cells.t[next] === -2 ? 1.8 : pack.cells.t[next] === -3 ? 4 : pack.cells.t[next] === -4 ? 6 : 8;
    return distanceCost * typeModifier * connected * variationFactor;
  }

  if (height < 20) return Infinity;
  const habitability = BIOMES[pack.cells.biome?.[next]]?.habitability || 0;
  if (!habitability) return Infinity;
  const habitabilityModifier = 1 + Math.max(100 - habitability, 0) / 1000;
  const heightModifier = 1 + Math.max(height - 25, 25) / 25;
  const burgModifier = pack.cells.burg?.[next] ? 1 : 3;
  const resourceModifier = landRouteResourceModifier(pack, next);
  return distanceCost * habitabilityModifier * heightModifier * connected * burgModifier * resourceModifier * variationFactor;
}

function landRouteResourceModifier(pack, cell) {
  const goodId = pack.cells.good?.[cell] || 0;
  if (goodId) {
    const source = pack.cells.goodSource?.[cell] || 0;
    const supply = Number(pack.cells.goodSupply?.[cell] || 1);
    const value = Number(pack.goods?.[goodId]?.value || 2);
    const sourceBonus = source >= GOOD_SOURCE_MARKER ? 0.1 : 0;
    const supplyBonus = Math.min(0.08, supply * 0.015);
    const valueBonus = Math.min(0.06, value / 300);
    return clamp(0.84 - sourceBonus - supplyBonus - valueBonus, 0.68, 1);
  }

  const neighbors = pack.cells.c?.[cell] || [];
  return neighbors.some(neighbor => pack.cells.good?.[neighbor]) ? 0.94 : 1;
}

function citySiteScore(pack, cell) {
  return (pack.cells.s?.[cell] || 0) + settlementResourceScore(pack, cell);
}

function settlementResourceScore(pack, cell) {
  return collectCityResourceContext(pack, cell).score;
}

function collectCityResourceContext(pack, cell) {
  const candidates = new Set([cell, ...(pack.cells.c?.[cell] || [])]);
  const goodIds = new Set();
  let resourceCells = 0;
  let markerResourceCells = 0;
  let score = 0;

  for (const candidate of candidates) {
    const goodId = pack.cells.good?.[candidate] || 0;
    if (!goodId) continue;
    const distanceFactor = candidate === cell ? 1 : 0.55;
    const value = Number(pack.goods?.[goodId]?.value || 2);
    const supply = Number(pack.cells.goodSupply?.[candidate] || 1);
    const source = pack.cells.goodSource?.[candidate] || 0;
    resourceCells++;
    goodIds.add(goodId);
    if (source >= GOOD_SOURCE_MARKER) markerResourceCells++;
    score += distanceFactor * Math.min(18, value * 0.45 + supply * 2.4 + (source >= GOOD_SOURCE_MARKER ? 4 : 0));
  }

  return {
    resourceCells,
    markerResourceCells,
    goodIds: [...goodIds].sort((a, b) => a - b),
    score: round(score, 2)
  };
}

function buildRiverEdges(pack) {
  const edges = new Map();
  for (const river of pack.rivers || []) {
    const cells = river?.cells || [];
    for (let index = 0; index < cells.length - 1; index++) {
      const left = cells[index];
      const right = cells[index + 1];
      if (left < 0 || right < 0) continue;
      if (!edges.has(left)) edges.set(left, new Set());
      if (!edges.has(right)) edges.set(right, new Set());
      edges.get(left).add(right);
      edges.get(right).add(left);
    }
  }
  return edges;
}

function getRouteSegments(pathCells, connections, edgeKeyMultiplier) {
  const segments = [];
  let segment = [];

  for (let index = 0; index < pathCells.length; index++) {
    const cell = pathCells[index];
    const next = pathCells[index + 1];
    const isConnected = next !== undefined && connections.has(routeEdgeKey(cell, next, edgeKeyMultiplier));

    if (isConnected) {
      if (segment.length) {
        segment.push(cell);
        segments.push(segment);
        segment = [];
      }
      continue;
    }

    segment.push(cell);
  }

  if (segment.length > 1) segments.push(segment);
  return segments;
}

function addConnections(cells, connections, edgeKeyMultiplier) {
  for (let index = 0; index < cells.length - 1; index++) {
    connections.add(routeEdgeKey(cells[index], cells[index + 1], edgeKeyMultiplier));
  }
}

function routeEdgeKey(left, right, multiplier) {
  return left < right ? left * multiplier + right : right * multiplier + left;
}

function createRouteSearchScratch(size) {
  return {
    cameFrom: new Int32Array(size),
    bestCost: new Float64Array(size),
    seen: new Uint32Array(size),
    closed: new Uint32Array(size),
    runId: 0
  };
}

function beginRouteSearch(search) {
  search.runId++;
  if (search.runId < 0xffffffff) return search.runId;
  search.seen.fill(0);
  search.closed.fill(0);
  search.runId = 1;
  return search.runId;
}

function getRouteBest(search, runId, cell) {
  return search.seen[cell] === runId ? search.bestCost[cell] : Infinity;
}

function setRouteBest(search, runId, cell, cost, from) {
  search.seen[cell] = runId;
  search.bestCost[cell] = cost;
  search.cameFrom[cell] = from;
}

function preparePackRoutePoints(pack) {
  return pack.cells.p.map(([x, y], cell) => {
    const burg = pack.burgs?.[pack.cells.burg?.[cell]];
    return burg ? [burg.x, burg.y] : [x, y];
  });
}

function createRouteVariation(pack, options = {}) {
  const salt = options.routeRegenerationSalt;
  if (salt === undefined || salt === null || salt === "") return null;

  const random = createRandom(regenerationSeed(options, "regenerate-routes", salt));
  const cellCost = new Float32Array(pack.cells.i.length);
  const jitterX = new Float32Array(pack.cells.i.length);
  const jitterY = new Float32Array(pack.cells.i.length);

  for (const cell of pack.cells.i) {
    cellCost[cell] = random.range(0.72, 1.28);
    jitterX[cell] = random.range(-10, 10);
    jitterY[cell] = random.range(-10, 10);
  }

  return {cellCost, jitterX, jitterY};
}

function routeCandidatePoint(burg, variation) {
  if (!variation || !Number.isInteger(burg?.cell)) return [burg.x, burg.y];
  return [
    burg.x + (variation.jitterX[burg.cell] || 0),
    burg.y + (variation.jitterY[burg.cell] || 0)
  ];
}

function mergeRouteSegments(segments) {
  let mergedCount = 0;

  for (let index = 0; index < segments.length; index++) {
    const current = segments[index];
    if (current.merged) continue;

    for (let nextIndex = index + 1; nextIndex < segments.length; nextIndex++) {
      const next = segments[nextIndex];
      if (next.merged) continue;
      if (next.cells.at(0) !== current.cells.at(-1)) continue;
      current.cells = current.cells.concat(next.cells.slice(1));
      next.merged = true;
      mergedCount++;
    }
  }

  return mergedCount > 1 ? mergeRouteSegments(segments) : segments;
}

function addPackRoute({routes, pack, segment, type, pointsArray, cityByBurg}) {
  if (segment.merged || segment.cells.length < 2) return;
  const parts = type === "searoute" ? splitSeaRouteCells(pack, segment.cells) : [segment.cells];

  for (const cells of parts) addPackRoutePart({routes, pack, cells, type, feature: segment.feature, pointsArray, cityByBurg, fromBurgId: segment.fromBurg, toBurgId: segment.toBurg});
}

function splitSeaRouteCells(pack, cells) {
  const parts = [];
  let part = [cells[0]];

  for (let index = 1; index < cells.length; index++) {
    const cell = cells[index];
    part.push(cell);

    if (index < cells.length - 1 && pack.cells.h[cell] >= 20 && !isNavigableRiverCell(pack.cells, cell)) {
      if (part.length > 1) parts.push(part);
      part = [cell];
    }
  }

  if (part.length > 1) parts.push(part);
  return parts;
}

function addPackRoutePart({routes, pack, cells, type, feature, pointsArray, cityByBurg, fromBurgId = null, toBurgId = null}) {
  const id = routes.length;
  const fromBurg = pack.burgs?.[pack.cells.burg?.[cells[0]]] || pack.burgs?.[fromBurgId];
  const toBurg = pack.burgs?.[pack.cells.burg?.[cells.at(-1)]] || pack.burgs?.[toBurgId];
  const fromCity = cityByBurg.get(fromBurg?.i);
  const toCity = cityByBurg.get(toBurg?.i);
  const resources = countRouteResources(pack, cells);

  routes.push({
    id,
    type,
    level: type === "trail" ? "trail" : type === "searoute" ? "secondary" : fromBurg?.capital || toBurg?.capital ? "primary" : "secondary",
    feature,
    state: routeMajorityCellValue(pack, cells, "state"),
    province: type === "searoute" ? 0 : routeMajorityCellValue(pack, cells, "province"),
    from: fromCity?.id ?? -1,
    to: toCity?.id ?? -1,
    cells: cells.map(cell => pack.cells.g[cell]),
    packCells: cells,
    resourceCells: resources.resourceCells,
    markerResourceCells: resources.markerResourceCells,
    resourceGoodIds: resources.goodIds,
    points: cells.map(cell => pointsArray[cell])
  });
}

function countRouteResources(pack, cells) {
  const goodIds = new Set();
  let resourceCells = 0;
  let markerResourceCells = 0;

  for (const cell of cells || []) {
    const goodId = pack.cells.good?.[cell] || 0;
    if (!goodId) continue;
    resourceCells++;
    goodIds.add(goodId);
    if ((pack.cells.goodSource?.[cell] || 0) >= GOOD_SOURCE_MARKER) markerResourceCells++;
  }

  return {resourceCells, markerResourceCells, goodIds: [...goodIds].sort((a, b) => a - b)};
}

function routeResourceStats(routes) {
  let resourceCells = 0;
  let markerResourceCells = 0;
  let routesWithResources = 0;

  for (const route of routes || []) {
    const routeResourceCells = Number(route.resourceCells || 0);
    resourceCells += routeResourceCells;
    markerResourceCells += Number(route.markerResourceCells || 0);
    if (routeResourceCells > 0) routesWithResources++;
  }

  return {resourceCells, markerResourceCells, routesWithResources};
}

function cityResourceStats(cities) {
  let resourceCells = 0;
  let markerResourceCells = 0;
  let citiesWithResources = 0;

  for (const city of cities || []) {
    const cityResourceCells = Number(city.resourceCells || 0);
    resourceCells += cityResourceCells;
    markerResourceCells += Number(city.markerResourceCells || 0);
    if (cityResourceCells > 0) citiesWithResources++;
  }

  return {resourceCells, markerResourceCells, citiesWithResources};
}

function routeMajorityCellValue(pack, cells, field) {
  const values = pack.cells?.[field];
  if (!values) return 0;
  const counts = new Map();
  let bestValue = 0;
  let bestCount = 0;
  for (const cell of cells) {
    const value = Number(values[cell]) || 0;
    if (!value) continue;
    const count = (counts.get(value) || 0) + 1;
    counts.set(value, count);
    if (count <= bestCount) continue;
    bestValue = value;
    bestCount = count;
  }
  return bestValue;
}

function calculateUrquhartEdges(points) {
  if (points.length === 2) return [[0, 1]];
  if (points.length < 3) return [];

  const delaunay = Delaunator.from(points);
  const {halfedges, triangles} = delaunay;
  const removed = new Uint8Array(triangles.length);
  const score = (p0, p1) => distanceSquared(points[p0], points[p1]);

  for (let edge = 0; edge < triangles.length; edge += 3) {
    const p0 = triangles[edge];
    const p1 = triangles[edge + 1];
    const p2 = triangles[edge + 2];
    const p01 = score(p0, p1);
    const p12 = score(p1, p2);
    const p20 = score(p2, p0);
    const longest =
      p20 > p01 && p20 > p12
        ? Math.max(edge + 2, halfedges[edge + 2])
        : p12 > p01 && p12 > p20
          ? Math.max(edge + 1, halfedges[edge + 1])
          : Math.max(edge, halfedges[edge]);
    if (longest >= 0) removed[longest] = 1;
  }

  const edges = [];
  for (let edge = 0; edge < triangles.length; edge++) {
    if (edge <= halfedges[edge] || removed[edge]) continue;
    const from = triangles[edge];
    const to = triangles[edge % 3 === 2 ? edge - 2 : edge + 1];
    edges.push([from, to]);
  }
  return edges;
}

function groupBurgs(burgs, keyFn) {
  const groups = new Map();
  for (const burg of burgs) {
    const key = keyFn(burg);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(burg);
  }
  return groups;
}

function groupCapitalBurgs(burgs, grid) {
  const capitals = burgs.filter(burg => burg?.capital);
  if (getGridLandRatio(grid) < 0.09) capitals.sort((a, b) => (b.population || 0) - (a.population || 0)).splice(18);
  return capitals.length >= 3 ? new Map([[1, capitals]]) : new Map();
}

function getGridLandRatio(grid) {
  const heights = grid.cells?.h || [];
  if (!heights.length) return 1;
  let land = 0;
  for (const height of heights) if (height >= 20) land++;
  return land / heights.length;
}

function burgStateKey(burg) {
  const state = Number(burg?.state) || 0;
  return state > 0 ? state : null;
}

function burgProvinceKey(burg) {
  const province = Number(burg?.province) || 0;
  if (province > 0) return province;
  return burgStateKey(burg);
}

function buildPackRouteLinks(routes) {
  const links = {};
  for (const route of routes) {
    for (let index = 0; index < route.packCells.length - 1; index++) {
      const from = route.packCells[index];
      const to = route.packCells[index + 1];
      if (!links[from]) links[from] = {};
      if (!links[to]) links[to] = {};
      links[from][to] = route.id;
      links[to][from] = route.id;
    }
  }
  return links;
}

function createRoute(grid, features, from, to, type, id) {
  const cells = traceLandPath(grid, features, from.cell, to.cell);
  return {
    id,
    type,
    level: routeLevel(type, from, to),
    from: from.id,
    to: to.id,
    cells,
    points: cells.map(cell => grid.points[cell])
  };
}

function routeLevel(type, from, to) {
  if (type === "trail") return "trail";
  if (from.capital || to.capital || Math.max(from.population, to.population) >= 8) return "primary";
  return "secondary";
}

function traceLandPath(grid, features, start, end) {
  if (!isLand(features, grid, start) || !isLand(features, grid, end)) return [];

  const open = new MinPriorityQueue();
  const cameFrom = new Int32Array(grid.points.length).fill(-1);
  const bestCost = new Float64Array(grid.points.length).fill(Infinity);
  const closed = new Uint8Array(grid.points.length);
  const maxVisited = Math.min(grid.points.length, 45000);
  let visited = 0;

  bestCost[start] = 0;
  open.push(start, distance(grid.points[start], grid.points[end]));

  while (open.length && visited < maxVisited) {
    const current = open.pop();
    if (closed[current]) continue;
    if (current === end) return reconstructPath(cameFrom, current);

    closed[current] = 1;
    visited++;

    for (const neighbor of getCellNeighbors(grid, current)) {
      if (closed[neighbor] || !isLand(features, grid, neighbor)) continue;
      const stepCost = routeStepCost(grid, current, neighbor);
      if (!Number.isFinite(stepCost)) continue;

      const tentative = bestCost[current] + stepCost;
      if (tentative >= bestCost[neighbor]) continue;

      cameFrom[neighbor] = current;
      bestCost[neighbor] = tentative;
      open.push(neighbor, tentative + distance(grid.points[neighbor], grid.points[end]) * 1.15);
    }
  }

  return [];
}

function buildPopulationPoints(grid, features, population) {
  return grid.points
    .map((point, cell) => ({cell, point, population: population[cell]}))
    .filter(item => item.population > 42 && isLandFeature(features, grid, item.cell) && grid.cells.burg?.[item.cell] === -1)
    .sort((a, b) => b.population - a.population)
    .slice(0, Math.min(2400, Math.round(grid.points.length * 0.22)));
}

function pruneNeutralSettlements(grid, settlements, pack) {
  const kept = [];
  for (const city of settlements.cities || []) {
    if ((city.state || 0) > 0) {
      city.id = kept.length;
      kept.push(city);
      const burg = pack?.burgs?.[city.burgId];
      if (burg) burg.cityId = city.id;
      continue;
    }

    const burg = pack?.burgs?.[city.burgId];
    if (burg) {
      burg.removed = true;
      burg.state = 0;
      burg.capital = 0;
    }
    if (Number.isInteger(city.packCell) && pack?.cells?.burg?.[city.packCell] === city.burgId) pack.cells.burg[city.packCell] = 0;
  }
  settlements.cities = kept;
  if (pack?.cells?.burg) {
    for (const city of kept) {
      if (Number.isInteger(city.packCell) && city.packCell >= 0) pack.cells.burg[city.packCell] = city.burgId;
    }
  }
  if (grid?.cells?.burg) {
    grid.cells.burg = new Array(grid.points.length).fill(-1);
    for (const city of kept) grid.cells.burg[city.cell] = city.id;
  }
}

function mirrorCitiesToGrid(grid, cities) {
  grid.cells.burg = new Array(grid.points.length).fill(-1);
  for (const city of cities) grid.cells.burg[city.cell] = city.id;
}

function mirrorGridBurgsToPack(pack, cities) {
  if (!pack.cells.burg) pack.cells.burg = new Uint16Array(pack.cells.i.length);
  for (const city of cities) {
    if (Number.isInteger(city.packCell) && city.packCell >= 0) pack.cells.burg[city.packCell] = city.burgId;
  }
}

function syncPoliticalSettlementStats(pack, politics, cities) {
  syncStateSettlementStats(pack, politics?.states || []);
  syncProvinceSettlementStats(pack, politics?.provinces || []);
  for (const city of cities) {
    const burg = pack.burgs?.[city.burgId];
    if (!burg) continue;
    city.state = burg.state;
    city.province = pack.cells.province?.[city.packCell] ?? city.province;
    burg.province = city.province;
  }
}

function syncStateSettlementStats(pack, states) {
  for (const state of states) {
    if (!state) continue;
    state.burgs = 0;
    state.rural = 0;
    state.urban = 0;
    state.civilizationProfile = {};
    state.civilizationType = null;
    state.civilizationLabel = null;
  }

  for (const cell of pack.cells.i) {
    if (pack.cells.h[cell] < 20) continue;
    const state = states[pack.cells.state?.[cell]];
    if (!state) continue;
    state.rural += pack.cells.pop?.[cell] || 0;
    const burg = pack.burgs?.[pack.cells.burg?.[cell]];
    if (burg?.i && !burg.removed) {
      state.burgs++;
      state.urban += burg.population || 0;
      addCivilizationWeight(state, burg);
    }
  }

  for (const state of states) {
    if (!state) continue;
    state.rural = round(state.rural || 0, 2);
    state.urban = round(state.urban || 0, 2);
    finalizeCivilizationProfile(state);
  }
}

function addCivilizationWeight(state, burg) {
  const type = burg.civilizationType || "agrarian";
  const weight = Math.max(0.1, Number(burg.population || 0)) * (burg.capital ? 3 : burg.group === "city" ? 1.6 : burg.group === "town" ? 1.2 : 1);
  state.civilizationProfile[type] = (state.civilizationProfile[type] || 0) + weight;
}

function finalizeCivilizationProfile(state) {
  const entries = Object.entries(state.civilizationProfile || {});
  const total = entries.reduce((sum, [, value]) => sum + Number(value || 0), 0);
  if (!entries.length || total <= 0) {
    state.civilizationProfile = {agrarian: 1};
    state.civilizationType = "agrarian";
    state.civilizationLabel = CITY_CIVILIZATION_LABELS.agrarian;
    return;
  }

  let dominant = entries[0][0];
  let dominantValue = entries[0][1];
  const profile = {};
  for (const [type, value] of entries) {
    if (value > dominantValue) {
      dominant = type;
      dominantValue = value;
    }
    profile[type] = round(value / total, 3);
  }
  state.civilizationProfile = profile;
  state.civilizationType = dominant;
  state.civilizationLabel = CITY_CIVILIZATION_LABELS[dominant] || dominant;
}

function syncProvinceSettlementStats(pack, provinces) {
  for (const province of provinces) {
    if (!province) continue;
    province.burgs = 0;
    province.rural = 0;
    province.urban = 0;
  }

  for (const cell of pack.cells.i) {
    if (pack.cells.h[cell] < 20) continue;
    const province = provinces[pack.cells.province?.[cell]];
    if (!province) continue;
    province.rural += pack.cells.pop?.[cell] || 0;
    const burg = pack.burgs?.[pack.cells.burg?.[cell]];
    if (burg?.i && !burg.removed) {
      province.burgs++;
      province.urban += burg.population || 0;
    }
  }

  for (const province of provinces) {
    if (!province) continue;
    province.rural = round(province.rural || 0, 2);
    province.urban = round(province.urban || 0, 2);
  }
}

function findPackCellForGrid(grid, pack, gridCell, populated) {
  const direct = grid.cells.pack?.[gridCell];
  if (Number.isInteger(direct) && isPopulatedPackCell(pack.cells, direct)) return direct;

  let best = -1;
  let bestDistance = Infinity;
  const point = grid.points[gridCell];
  for (const cell of populated) {
    const nextDistance = distance(point, pack.cells.p[cell]);
    if (nextDistance >= bestDistance) continue;
    best = cell;
    bestDistance = nextDistance;
  }
  return best;
}

function getTownsNumber(populatedCells, gridCells) {
  const densityScale = (gridCells / 10000) ** 0.8;
  return Math.max(0, Math.round(populatedCells / 5 / densityScale));
}

function getCapitalsNumber(populatedCells, desired = 20) {
  const number = Math.max(0, Math.floor(desired));
  if (populatedCells < number * 10) return Math.floor(populatedCells / 10);
  return number;
}

function defineBurgPopulation(pack, packCell, capital, random) {
  let population = (pack.cells.s[packCell] || 0) / 5;
  if (capital) population *= 1.5;
  population *= gaussian(random, 1, 1, 0.25, 4, 5);
  population += (((pack.cells.burg?.[packCell] || 0) % 100) - (packCell % 100)) / 1000;
  return round(Math.max(population, 0.01), 3);
}

function isPopulatedPackCell(cells, cell) {
  return cells.h[cell] >= 20 && (cells.s?.[cell] || 0) > 0 && (cells.culture?.[cell] || 0) > 0;
}

function isCoastalCell(grid, features, cell) {
  return getCellNeighbors(grid, cell).some(neighbor => {
    const feature = features.features[grid.cells.f[neighbor]];
    return feature?.type === "ocean" || feature?.type === "lake";
  });
}

function getCellNeighbors(grid, cell) {
  const sharedEdgeNeighbors = grid.cells.c?.[cell];
  if (sharedEdgeNeighbors?.length) return sharedEdgeNeighbors;
  return getDirectNeighbors(cell, grid.metadata);
}

function getDirectNeighbors(cell, metadata) {
  const neighbors = [];
  const column = cell % metadata.columns;
  const row = Math.floor(cell / metadata.columns);
  if (column > 0) neighbors.push(cell - 1);
  if (column < metadata.columns - 1) neighbors.push(cell + 1);
  if (row > 0) neighbors.push(cell - metadata.columns);
  if (row < metadata.rows - 1) neighbors.push(cell + metadata.columns);
  return neighbors;
}

function regenerationSeed(options = {}, scope, salt) {
  const seed = options.seed || "map";
  return salt === undefined || salt === null || salt === "" ? `${seed}:${scope}` : `${seed}:${scope}:${salt}`;
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function distanceSquared(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}

function routeStepCost(grid, current, next) {
  const length = distance(grid.points[current], grid.points[next]);
  const height = grid.cells.h[next];
  const previousHeight = grid.cells.h[current];
  const slope = Math.abs(height - previousHeight);
  const hillCost = Math.max(0, height - 56) * 0.07;
  const mountainCost = Math.max(0, height - 70) * 0.34;
  const peakCost = Math.max(0, height - 84) * 1.4;
  const slopeCost = slope * slope * 0.16;
  return length * (1 + hillCost + mountainCost + peakCost) + slopeCost;
}

function reconstructPath(cameFrom, current) {
  const path = [current];
  while (cameFrom[current] !== -1) {
    current = cameFrom[current];
    path.push(current);
  }
  return path.reverse();
}

function gaussian(random, mean, stdev, min, max, digits = 0) {
  let x;
  let y;
  let radius;

  do {
    x = random.next() * 2 - 1;
    y = random.next() * 2 - 1;
    radius = x * x + y * y;
  } while (!radius || radius > 1);

  const normal = y * Math.sqrt((-2 * Math.log(radius)) / radius);
  return round(clamp(mean + normal * stdev, min, max), digits);
}

class SpacingIndex {
  constructor(bucketSize) {
    this.bucketSize = bucketSize;
    this.buckets = new Map();
  }

  add(x, y, id) {
    const key = this.keyFor(x, y);
    if (!this.buckets.has(key)) this.buckets.set(key, []);
    this.buckets.get(key).push({x, y, id});
  }

  find(x, y, radius) {
    const minColumn = Math.floor((x - radius) / this.bucketSize);
    const maxColumn = Math.floor((x + radius) / this.bucketSize);
    const minRow = Math.floor((y - radius) / this.bucketSize);
    const maxRow = Math.floor((y + radius) / this.bucketSize);

    for (let row = minRow; row <= maxRow; row++) {
      for (let column = minColumn; column <= maxColumn; column++) {
        const items = this.buckets.get(`${column}:${row}`) || [];
        if (items.some(item => Math.hypot(item.x - x, item.y - y) < radius)) return true;
      }
    }
    return false;
  }

  keyFor(x, y) {
    return `${Math.floor(x / this.bucketSize)}:${Math.floor(y / this.bucketSize)}`;
  }
}

function maxValue(values = []) {
  let max = 0;
  for (const value of values) if (value > max) max = value;
  return max;
}

function isLand(features, grid, cell) {
  return isLandFeature(features, grid, cell);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 0) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function cloneVisual(visual) {
  return visual ? {...visual} : {};
}

function isLandFeature(features, grid, cell) {
  return Boolean(features.features[grid.cells.f[cell]]?.land);
}
