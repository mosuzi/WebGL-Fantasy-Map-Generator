const CITY_ROOTS = ["雁门", "星津", "青川", "白石", "南浦", "清源", "苍岭", "云渡", "昭阳", "岚港", "栖梧", "河洛"];
const CITY_SUFFIXES = ["城", "镇", "港", "堡", "邑", "集"];
const CITY_NUMERALS = ["", "二", "三", "四", "五", "六"];

export function buildSettlements(grid, features, politics, rivers, random) {
  const riverCells = new Set(rivers.rivers.flatMap(river => river.cells));
  const landCells = grid.points
    .map((point, cell) => ({cell, point, height: grid.cells.h[cell], prec: grid.cells.prec[cell]}))
    .filter(item => features.features[grid.cells.f[item.cell]]?.type === "land");
  const population = buildPopulation(grid, features, riverCells);
  const cities = buildCities(grid, features, politics, riverCells, landCells, population, random);
  const routes = buildRoutes(grid, features, politics, cities);

  grid.cells.pop = population;
  grid.cells.burg = new Array(grid.points.length).fill(-1);
  for (const city of cities) grid.cells.burg[city.cell] = city.id;

  return {
    cities,
    routes,
    populationPoints: buildPopulationPoints(grid, features, population),
    metadata: {
      cities: cities.length,
      capitals: cities.filter(city => city.capital).length,
      ports: cities.filter(city => city.port).length,
      routes: routes.length,
      routeSegments: routes.reduce((sum, route) => sum + Math.max(0, route.points.length - 1), 0),
      populationCells: population.filter(value => value > 0).length,
      ruralPopulationPoints: buildPopulationPoints(grid, features, population).length,
      maxPopulation: Math.max(0, ...population)
    }
  };
}

function buildPopulation(grid, features, riverCells) {
  return grid.points.map((point, cell) => {
    if (features.features[grid.cells.f[cell]]?.type !== "land") return 0;
    const height = grid.cells.h[cell];
    const prec = grid.cells.prec[cell] || 0;
    const slopePenalty = Math.max(0, height - 58) * 0.75;
    const coastBoost = isCoastalCell(grid, features, cell) ? 26 : 0;
    const riverBoost = riverCells.has(cell) ? 24 : 0;
    const lowland = Math.max(0, 54 - Math.abs(height - 34));
    return Math.max(0, Math.round(lowland * 1.2 + prec * 0.55 + coastBoost + riverBoost - slopePenalty));
  });
}

function buildCities(grid, features, politics, riverCells, landCells, population, random) {
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
    if (features.features[grid.cells.f[cell]]?.type !== "land") continue;
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
    const port = isCoastalCell(grid, features, item.cell);
    return {
      id,
      name: makeCityName(id, port),
      cell: item.cell,
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

function buildRoutes(grid, features, politics, cities) {
  const routes = [];
  const citiesByState = new Map();
  for (const city of cities) {
    if (city.state < 0) continue;
    if (!citiesByState.has(city.state)) citiesByState.set(city.state, []);
    citiesByState.get(city.state).push(city);
  }

  for (const state of politics.states) {
    const stateCities = citiesByState.get(state.id) || [];
    const capital = stateCities.find(city => city.capital) || stateCities[0];
    if (!capital) continue;

    for (const city of stateCities) {
      if (city.id === capital.id) continue;
      if (!city.provincial && city.population < 78) continue;
      routes.push(createRoute(grid, features, capital, city, "road", routes.length));
    }

    const sorted = stateCities.filter(city => city.id !== capital.id).sort((a, b) => b.population - a.population).slice(0, 4);
    for (let index = 0; index < sorted.length - 1; index++) {
      routes.push(createRoute(grid, features, sorted[index], sorted[index + 1], "trail", routes.length));
    }
  }

  return routes.filter(route => route.points.length > 1);
}

function createRoute(grid, features, from, to, type, id) {
  const cells = traceLandPath(grid, features, from.cell, to.cell);
  return {
    id,
    type,
    from: from.id,
    to: to.id,
    cells,
    points: cells.map(cell => grid.points[cell])
  };
}

function traceLandPath(grid, features, start, end) {
  const path = [start];
  const used = new Set([start]);
  let current = start;

  for (let step = 0; step < grid.points.length && current !== end; step++) {
    const neighbors = getDirectNeighbors(current, grid.metadata).filter(cell => !used.has(cell));
    if (!neighbors.length) break;
    let best = neighbors[0];
    let bestScore = Infinity;

    for (const neighbor of neighbors) {
      const waterPenalty = features.features[grid.cells.f[neighbor]]?.type === "land" ? 0 : 1000000;
      const heightPenalty = Math.max(0, grid.cells.h[neighbor] - 62) * 180;
      const slopePenalty = Math.abs(grid.cells.h[neighbor] - grid.cells.h[current]) * 55;
      const nextDistance = distance(grid.points[neighbor], grid.points[end]);
      const score = nextDistance + waterPenalty + heightPenalty + slopePenalty;
      if (score < bestScore) {
        best = neighbor;
        bestScore = score;
      }
    }

    current = best;
    used.add(current);
    path.push(current);
    if (path.length > grid.metadata.columns + grid.metadata.rows) break;
  }

  if (current !== end) path.push(end);
  return path;
}

function buildPopulationPoints(grid, features, population) {
  return grid.points
    .map((point, cell) => ({cell, point, population: population[cell]}))
    .filter(item => item.population > 42 && features.features[grid.cells.f[item.cell]]?.type === "land" && grid.cells.burg?.[item.cell] === -1)
    .sort((a, b) => b.population - a.population)
    .slice(0, Math.min(2400, Math.round(grid.points.length * 0.22)));
}

function isCoastalCell(grid, features, cell) {
  return getDirectNeighbors(cell, grid.metadata).some(neighbor => {
    const feature = features.features[grid.cells.f[neighbor]];
    return feature?.type === "ocean" || feature?.type === "lake";
  });
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
