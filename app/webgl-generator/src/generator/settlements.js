import {MinPriorityQueue} from "./priority-queue.js";
import Delaunator from "../vendor/delaunator.js";
import {BIOMES} from "./biomes.js";

const CITY_ROOTS = ["雁门", "星津", "青川", "白石", "南浦", "清源", "苍岭", "云渡", "昭阳", "岚港", "栖梧", "河洛"];
const CITY_SUFFIXES = ["城", "镇", "港", "堡", "邑", "集"];
const CITY_NUMERALS = ["", "二", "三", "四", "五", "六"];
const MIN_PASSABLE_SEA_TEMP = -4;

export function buildSettlements(grid, features, politics, rivers, random, pack, options = {}) {
  const riverCells = new Set(rivers.rivers.flatMap(river => river.gridCells || river.cells));
  const population = grid.cells.pop?.some?.(value => value > 0) ? grid.cells.pop : buildPopulation(grid, features, riverCells);
  const result = pack?.cells?.s
    ? buildPackSettlements(grid, features, politics, random, pack, options)
    : buildGridSettlements(grid, features, politics, riverCells, population, random);
  const routes = politics ? buildRoutes(grid, features, politics, result.cities, pack) : [];

  grid.cells.pop = population;
  mirrorCitiesToGrid(grid, result.cities);
  if (pack?.cells) mirrorGridBurgsToPack(pack, result.cities);

  return createSettlementResult({grid, features, population, cities: result.cities, routes, pack});
}

export function finalizeSettlements(grid, features, politics, settlements, pack) {
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

  const routes = buildRoutes(grid, features, politics, settlements.cities, pack);
  settlements.routes = routes;
  settlements.metadata = createSettlementMetadata({grid, features, population: grid.cells.pop, cities: settlements.cities, routes, pack});
  return settlements;
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
      addPackCity({grid, pack, cities, burgs, occupied, occupiedGrid, spacingIndex, packCell, random, flags: {capital: true, state: state.id}});
    }

    for (const province of politics.provinces || []) {
      const packCell = findPackCellForGrid(grid, pack, province.center, populated);
      addPackCity({grid, pack, cities, burgs, occupied, occupiedGrid, spacingIndex, packCell, random, flags: {provincial: true, state: province.state}});
    }
  } else {
    generatePackCapitals({grid, pack, cities, burgs, occupied, occupiedGrid, spacingIndex, populated, random, options});
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

      const city = addPackCity({grid, pack, cities, burgs, occupied, occupiedGrid, spacingIndex, packCell, random});
      if (!city) continue;
      added++;
      addedThisPass++;
    }

    spacing *= 0.5;
  }

  pack.burgs = burgs;
  shiftPortsAndRiverBurgs(grid, pack, cities, burgs);
  defineCityTypes(pack, cities, burgs);
  return {cities};
}

function generatePackCapitals({grid, pack, cities, burgs, occupied, occupiedGrid, spacingIndex, populated, random, options}) {
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
    addPackCity({grid, pack, cities, burgs, occupied, occupiedGrid, spacingIndex, packCell, random, flags: {capital: true}});
  }
}

function addPackCity({grid, pack, cities, burgs, occupied, occupiedGrid, spacingIndex, packCell, random, flags = {}}) {
  if (!Number.isInteger(packCell) || packCell < 0 || packCell >= pack.cells.i.length) return null;
  const {cells} = pack;
  if (!isPopulatedPackCell(cells, packCell) || cells.burg[packCell]) return null;

  const gridCell = cells.g[packCell];
  if (occupied.has(packCell) || occupiedGrid.has(gridCell)) return null;

  const [x, y] = cells.p[packCell];
  const burgId = burgs.length;
  const cityId = cities.length;
  const state = Number.isInteger(flags.state) ? flags.state : flags.capital ? burgId : grid.cells.state?.[gridCell] ?? 0;
  const province = grid.cells.province?.[gridCell] ?? -1;
  const name = makeCityName(cityId, false);
  const sourceBurg = {
    i: burgId,
    id: burgId,
    cityId,
    cell: packCell,
    x,
    y,
    state,
    culture: cells.culture[packCell],
    religion: cells.religion?.[packCell] ?? grid.cells.religion?.[gridCell] ?? 0,
    name,
    feature: cells.f[packCell],
    capital: flags.capital ? 1 : 0,
    port: 0,
    population: defineBurgPopulation(pack, packCell, Boolean(flags.capital), random)
  };
  const city = {
    id: cityId,
    burgId,
    name,
    cell: gridCell,
    packCell,
    x,
    y,
    population: sourceBurg.population,
    state,
    province,
    culture: sourceBurg.culture,
    religion: sourceBurg.religion,
    capital: Boolean(flags.capital),
    provincial: Boolean(flags.provincial),
    port: 0,
    type: "Generic"
  };

  burgs.push(sourceBurg);
  cities.push(city);
  cells.burg[packCell] = burgId;
  occupied.add(packCell);
  occupiedGrid.add(gridCell);
  spacingIndex.add(x, y, cityId);
  return city;
}

function shiftPortsAndRiverBurgs(grid, pack, cities, burgs) {
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
      if (!city.name.endsWith("港") && !city.capital) city.name = makeCityName(city.id, true);
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
    return {
      id,
      burgId: id + 1,
      name: makeCityName(id, port),
      cell: item.cell,
      packCell: grid.cells.pack?.[item.cell] ?? -1,
      x: grid.points[item.cell][0],
      y: grid.points[item.cell][1],
      population: population[item.cell] + (item.capital ? 90 : item.provincial ? 45 : 20),
      state,
      province,
      culture: grid.cells.culture[item.cell],
      religion: grid.cells.religion[item.cell],
      capital: Boolean(item.capital),
      provincial: Boolean(item.provincial),
      port
    };
  });
}

function buildRoutes(grid, features, politics, cities, pack) {
  if (pack?.burgs?.length) return buildPackRoutes(grid, pack, cities);

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

function buildPackRoutes(grid, pack, cities) {
  const connections = new Set();
  const routes = [];
  const {burgs} = pack;
  const aliveBurgs = burgs.filter(burg => burg?.i && !burg.removed);
  const cityByBurg = new Map(cities.map(city => [city.burgId, city]));
  const capitalsByFeature = groupBurgs(aliveBurgs.filter(burg => burg.capital), burg => pack.cells.f[burg.cell]);
  const burgsByFeature = groupBurgs(aliveBurgs, burg => pack.cells.f[burg.cell]);
  const portsByFeature = groupBurgs(aliveBurgs.filter(burg => burg.port), burg => burg.port);
  const pointsArray = preparePackRoutePoints(pack);

  for (const segment of mergeRouteSegments(generateRouteSegments({pack, connections, groups: capitalsByFeature, water: false}))) {
    addPackRoute({routes, pack, segment, type: "road", pointsArray, cityByBurg});
  }

  for (const segment of mergeRouteSegments(generateRouteSegments({pack, connections, groups: burgsByFeature, water: false}))) {
    addPackRoute({routes, pack, segment, type: "trail", pointsArray, cityByBurg});
  }

  for (const segment of mergeRouteSegments(generateRouteSegments({pack, connections, groups: portsByFeature, water: true}))) {
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

function generateRouteSegments({pack, connections, groups, water}) {
  const routeSegments = [];
  const entries = [...groups.entries()].sort(([a], [b]) => Number(a) - Number(b));

  for (const [feature, burgs] of entries) {
    const edges = calculateUrquhartEdges(burgs.map(burg => [burg.x, burg.y]));

    for (const [fromId, toId] of edges) {
      const start = burgs[fromId].cell;
      const end = burgs[toId].cell;
      const pathCells = tracePackPath(pack, start, end, water, connections);

      for (const cells of getRouteSegments(pathCells, connections)) {
        addConnections(cells, connections);
        routeSegments.push({feature: Number(feature), cells});
      }
    }
  }

  return routeSegments;
}

function tracePackPath(pack, start, end, water, connections) {
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

      const step = packRouteStepCost(pack, current, neighbor, water, connections);
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

function packRouteStepCost(pack, current, next, water, connections) {
  const height = pack.cells.h[next];
  const distanceCost = distanceSquared(pack.cells.p[current], pack.cells.p[next]);
  const connected = connections.has(`${current}-${next}`) ? 0.5 : 1;

  if (water) {
    if (height >= 20) return Infinity;
    if ((pack.cells.temp?.[next] || 0) < MIN_PASSABLE_SEA_TEMP) return Infinity;
    const typeModifier = pack.cells.t[next] === -1 ? 1 : pack.cells.t[next] === -2 ? 1.8 : pack.cells.t[next] === -3 ? 4 : pack.cells.t[next] === -4 ? 6 : 8;
    return distanceCost * typeModifier * connected;
  }

  if (height < 20) return Infinity;
  const habitability = BIOMES[pack.cells.biome?.[next]]?.habitability || 0;
  if (!habitability) return Infinity;
  const habitabilityModifier = 1 + Math.max(100 - habitability, 0) / 1000;
  const heightModifier = 1 + Math.max(height - 25, 25) / 25;
  const burgModifier = pack.cells.burg?.[next] ? 1 : 3;
  return distanceCost * habitabilityModifier * heightModifier * connected * burgModifier;
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

  for (const cells of parts) addPackRoutePart({routes, pack, cells, type, feature: segment.feature, pointsArray, cityByBurg});
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

function addPackRoutePart({routes, pack, cells, type, feature, pointsArray, cityByBurg}) {
  const id = routes.length;
  const fromBurg = pack.burgs?.[pack.cells.burg?.[cells[0]]];
  const toBurg = pack.burgs?.[pack.cells.burg?.[cells.at(-1)]];
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

function makeCityName(id, port) {
  const root = CITY_ROOTS[id % CITY_ROOTS.length];
  const numeral = CITY_NUMERALS[Math.min(CITY_NUMERALS.length - 1, Math.floor(id / CITY_ROOTS.length))];
  const suffix = port ? (root.endsWith("港") ? "城" : "港") : CITY_SUFFIXES[id % CITY_SUFFIXES.length];
  return `${root}${numeral}${suffix}`;
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
