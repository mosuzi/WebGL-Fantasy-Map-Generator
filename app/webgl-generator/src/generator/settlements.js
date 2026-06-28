import {MinPriorityQueue} from "./priority-queue.js";
import Delaunator from "../vendor/delaunator.js";
import {BIOMES} from "./biomes.js";
import {createChineseNameGenerator} from "./names.js";
import {createRandom} from "./random.js";

const MIN_PASSABLE_SEA_TEMP = -4;

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
      const burg = pack.burgs?.[city.burgId];
      if (burg) burg.state = city.state;
    } else {
      city.state = grid.cells.state?.[city.cell] ?? city.state;
    }
    city.province = grid.cells.province?.[city.cell] ?? city.province;
  }

  if (options.pruneNeutralSettlements) pruneNeutralSettlements(grid, settlements, pack);
  mirrorCitiesToGrid(grid, settlements.cities);
  const routes = buildRoutes(grid, features, politics, settlements.cities, pack, options);
  settlements.routes = routes;
  settlements.populationPoints = buildPopulationPoints(grid, features, grid.cells.pop);
  settlements.metadata = createSettlementMetadata({grid, features, population: grid.cells.pop, cities: settlements.cities, routes, pack});
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
  return {
    cities,
    routes,
    populationPoints: buildPopulationPoints(grid, features, population),
    metadata: createSettlementMetadata({grid, features, population, cities, routes, pack})
  };
}

function createSettlementMetadata({grid, features, population, cities, routes, pack}) {
  return {
    cities: cities.length,
    capitals: cities.filter(city => city.capital).length,
    ports: cities.filter(city => city.port).length,
    routes: routes.length,
    routeSegments: routes.reduce((sum, route) => sum + Math.max(0, route.points.length - 1), 0),
    populationCells: population.filter(value => value > 0).length,
    ruralPopulationPoints: buildPopulationPoints(grid, features, population).length,
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
  const score = new Int16Array(cells.i.length);
  for (const cell of populated) score[cell] = (cells.s[cell] || 0) * gaussian(random, 1, 3, 0, 20, 3);
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
  shiftPortsAndRiverBurgs(grid, pack, cities, burgs, nameGenerator);
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
  shiftPortsAndRiverBurgs(grid, pack, cities, burgs, nameGenerator);
  defineCityTypes(pack, cities, burgs);
  specifyBurgs(pack, cities, burgs, nameGenerator);
  return {cities};
}

function addRegeneratedTowns({grid, pack, cities, burgs, occupied, occupiedGrid, spacingIndex, populated, random, nameGenerator}) {
  const {cells} = pack;
  const targetTowns = getTownsNumber(populated.length, grid.points.length);
  const score = new Int16Array(cells.i.length);
  for (const cell of populated) score[cell] = (cells.s[cell] || 0) * gaussian(random, 1, 3, 0, 20, 3);
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
  const score = new Int16Array(cells.i.length);
  for (const cell of populated) score[cell] = (cells.s[cell] || 0) * random.range(0.5, 1);
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
    type
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
    state,
    province,
    culture: sourceBurg.culture,
    religion: sourceBurg.religion,
    capital: Boolean(flags.capital),
    provincial: Boolean(flags.provincial),
    port: 0,
    type
  };

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

function shiftPortsAndRiverBurgs(grid, pack, cities, burgs, nameGenerator) {
  const {cells, features} = pack;
  const featurePortCandidates = new Map();

  for (const burg of burgs) {
    if (!burg?.i) continue;
    burg.port = 0;
    const haven = cells.haven?.[burg.cell];
    const harbor = cells.harbor?.[burg.cell] || 0;
    const featureId = cells.f?.[haven];
    if (!featureId) continue;

    const isMulticell = (features?.[featureId]?.cells || 0) > 1;
    const isHarbor = (harbor && burg.capital) || harbor === 1;
    const isFrozen = (grid.cells.temp?.[cells.g[burg.cell]] || 0) <= 0;
    if (!isMulticell || !isHarbor || isFrozen) continue;

    if (!featurePortCandidates.has(featureId)) featurePortCandidates.set(featureId, []);
    featurePortCandidates.get(featureId).push(burg);
  }

  for (const [featureId, candidates] of featurePortCandidates.entries()) {
    if (candidates.length < 2) continue;
    for (const burg of candidates) {
      const city = cities[burg.cityId];
      const haven = cells.haven[burg.cell];
      const [x, y] = getCloseToEdgePoint(pack, burg.cell, haven);
      burg.port = Number(featureId);
      burg.x = x;
      burg.y = y;
      city.port = Number(featureId);
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

  for (const burg of burgs) {
    if (!burg?.i || burg.port || !cells.r?.[burg.cell]) continue;
    const city = cities[burg.cityId];
    const shift = Math.min((cells.fl?.[burg.cell] || 0) / 150, 1);
    burg.x = burg.cell % 2 ? round(burg.x + shift, 2) : round(burg.x - shift, 2);
    burg.y = cells.r[burg.cell] % 2 ? round(burg.y + shift, 2) : round(burg.y - shift, 2);
    city.x = burg.x;
    city.y = burg.y;
  }
}

function defineCityTypes(pack, cities, burgs) {
  for (const city of cities) {
    const burg = burgs[city.burgId];
    const type = getBurgType(pack, city.packCell, city.port);
    burg.type = type;
    city.type = type;
    city.group = city.capital ? "capital" : city.port ? "city" : city.population >= 5 ? "city" : city.population <= 0.1 ? "hamlet" : "town";
    burg.group = city.group;
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
  }
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
    return {
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
  const capitalsByFeature = groupBurgs(aliveBurgs.filter(burg => burg.capital), burg => pack.cells.f[burg.cell]);
  const burgsByFeature = groupBurgs(aliveBurgs, burg => pack.cells.f[burg.cell]);
  const portsByFeature = groupBurgs(aliveBurgs.filter(burg => burg.port), burg => burg.port);
  const pointsArray = preparePackRoutePoints(pack);
  const variation = createRouteVariation(pack, options);

  for (const segment of mergeRouteSegments(generateRouteSegments({pack, connections, groups: capitalsByFeature, water: false, variation}))) {
    addPackRoute({routes, pack, segment, type: "road", pointsArray, cityByBurg});
  }

  for (const segment of mergeRouteSegments(generateRouteSegments({pack, connections, groups: burgsByFeature, water: false, variation}))) {
    addPackRoute({routes, pack, segment, type: "trail", pointsArray, cityByBurg});
  }

  for (const segment of mergeRouteSegments(generateRouteSegments({pack, connections, groups: portsByFeature, water: true, variation}))) {
    addPackRoute({routes, pack, segment, type: "searoute", pointsArray, cityByBurg});
  }

  pack.routes = routes.map(route => ({
    i: route.id,
    group: route.type === "road" ? "roads" : route.type === "trail" ? "trails" : "searoutes",
    feature: route.feature,
    points: route.points.map((point, index) => [point[0], point[1], route.packCells[index]])
  }));
  pack.cells.routes = buildPackRouteLinks(routes);
  return routes;
}

function generateRouteSegments({pack, connections, groups, water, variation = null}) {
  const routeSegments = [];
  const entries = [...groups.entries()].sort(([a], [b]) => Number(a) - Number(b));

  for (const [feature, burgs] of entries) {
    const edges = calculateUrquhartEdges(burgs.map(burg => routeCandidatePoint(burg, variation, water)));

    for (const [fromId, toId] of edges) {
      const start = burgs[fromId].cell;
      const end = burgs[toId].cell;
      const pathCells = tracePackPath(pack, start, end, water, connections, variation);

      for (const cells of getRouteSegments(pathCells, connections)) {
        addConnections(cells, connections);
        routeSegments.push({feature: Number(feature), cells, fromBurg: burgs[fromId].i, toBurg: burgs[toId].i});
      }
    }
  }

  return routeSegments;
}

function tracePackPath(pack, start, end, water, connections, variation = null) {
  if (start === end) return [];

  const open = new MinPriorityQueue();
  const cameFrom = new Int32Array(pack.cells.i.length).fill(-1);
  const bestCost = new Float64Array(pack.cells.i.length).fill(Infinity);
  const maxVisited = Math.min(pack.cells.i.length, water ? 22000 : 14000);
  let visited = 0;

  bestCost[start] = 0;
  open.push(start, 0);

  while (open.length && visited < maxVisited) {
    const current = open.pop();
    visited++;

    for (const neighbor of pack.cells.c[current] || []) {
      if (neighbor === end) {
        cameFrom[neighbor] = current;
        return reconstructPath(cameFrom, neighbor);
      }

      const step = packRouteStepCost(pack, current, neighbor, water, connections, variation);
      if (!Number.isFinite(step)) continue;
      const tentative = bestCost[current] + step;
      if (tentative >= bestCost[neighbor]) continue;
      cameFrom[neighbor] = current;
      bestCost[neighbor] = tentative;
      open.push(neighbor, tentative);
    }
  }

  return [];
}

function packRouteStepCost(pack, current, next, water, connections, variation = null) {
  const height = pack.cells.h[next];
  const distanceCost = distanceSquared(pack.cells.p[current], pack.cells.p[next]);
  const connected = connections.has(`${current}-${next}`) ? 0.5 : 1;
  const variationFactor = variation?.cellCost?.[next] || 1;

  if (water) {
    if (height >= 20) return Infinity;
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
  return distanceCost * habitabilityModifier * heightModifier * connected * burgModifier * variationFactor;
}

function getRouteSegments(pathCells, connections) {
  const segments = [];
  let segment = [];

  for (let index = 0; index < pathCells.length; index++) {
    const cell = pathCells[index];
    const next = pathCells[index + 1];
    const isConnected = connections.has(`${cell}-${next}`) || connections.has(`${next}-${cell}`);

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

function addConnections(cells, connections) {
  for (let index = 0; index < cells.length - 1; index++) {
    connections.add(`${cells[index]}-${cells[index + 1]}`);
    connections.add(`${cells[index + 1]}-${cells[index]}`);
  }
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

    if (index < cells.length - 1 && pack.cells.h[cell] >= 20) {
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

  routes.push({
    id,
    type,
    level: type === "trail" ? "trail" : type === "searoute" ? "secondary" : fromBurg?.capital || toBurg?.capital ? "primary" : "secondary",
    feature,
    from: fromCity?.id ?? -1,
    to: toCity?.id ?? -1,
    cells: cells.map(cell => pack.cells.g[cell]),
    packCells: cells,
    points: cells.map(cell => pointsArray[cell])
  });
}

function calculateUrquhartEdges(points) {
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
  }
}

function syncStateSettlementStats(pack, states) {
  for (const state of states) {
    if (!state) continue;
    state.burgs = 0;
    state.rural = 0;
    state.urban = 0;
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
    }
  }

  for (const state of states) {
    if (!state) continue;
    state.rural = round(state.rural || 0, 2);
    state.urban = round(state.urban || 0, 2);
  }
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

function isLandFeature(features, grid, cell) {
  return Boolean(features.features[grid.cells.f[cell]]?.land);
}
