import {MinPriorityQueue} from "./priority-queue.js";
import Delaunator from "../vendor/delaunator.js";
import {BIOMES} from "./biomes.js";
import {createChineseNameGenerator} from "./names.js";
import {createRandom} from "./random.js";
import {reassessGeneratedProvincialCapitals} from "./provincial-capitals.js";
import {createCityScaleContext, defaultCityVisual, deriveCityScale, resolveCityVisual} from "../runtime/city-visuals.js";
import {reconcileSettlementCellIdentity} from "../runtime/settlement-cell-index.js";

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
    : buildGridSettlements(grid, features, politics, riverCells, population, random, options);
  const routes = politics ? buildRoutes(grid, features, politics, result.cities, pack, options) : [];

  grid.cells.pop = population;
  mirrorCitiesToGrid(grid, result.cities);
  if (pack?.cells) mirrorGridBurgsToPack(pack, result.cities);

  return createSettlementResult({grid, features, population, cities: result.cities, routes, pack});
}

export function finalizeSettlements(grid, features, politics, settlements, pack, options = {}) {
  if (pack?.cells) reconcileSettlementCellIdentity({grid, pack, settlements});
  const protectedCityIds = snapshotIds(options.lockedCities || options.preservedCities);
  for (const city of settlements.cities) {
    if (!city || city.removed) continue;
    if (protectedCityIds.has(Number(city.id))) continue;
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

  if (pack?.cells && options.reassessProvincialCapitals === true) {
    synchronizeSettlementPoliticalOwnership(pack, settlements.cities, options);
    ensureProvinceCityCandidates(grid, pack, politics, settlements, options);
  }
  if (options.pruneNeutralSettlements) pruneNeutralSettlements(grid, settlements, pack, options);
  if (pack?.cells) {
    reconcileSettlementCellIdentity({grid, pack, settlements});
    syncPoliticalSettlementStats(pack, politics, settlements.cities, options);
    if (options.reassessProvincialCapitals === true) {
      reassessGeneratedProvincialCapitals(grid, pack, settlements, politics, options);
    }
  } else mirrorCitiesToGrid(grid, settlements.cities);
  const routes = buildRoutes(grid, features, politics, settlements.cities, pack, options);
  refreshProvincialCapitalRoutePriorities(settlements.cities, routes, pack, {
    lockedRoutes: options.lockedRoutes
  });
  const populationPoints = buildPopulationPoints(grid, features, grid.cells.pop);
  settlements.routes = routes;
  settlements.populationPoints = populationPoints;
  settlements.metadata = createSettlementMetadata({grid, features, population: grid.cells.pop, cities: settlements.cities, routes, pack, populationPoints});
  return settlements;
}

function ensureProvinceCityCandidates(grid, pack, politics, settlements, options) {
  const protectedProvinceIds = snapshotIds(options.lockedProvinces);
  const scopedProvinceIds = provinceIdsForSettlementScope(options.settlementScope, politics);
  const activeCities = (settlements.cities || []).filter(city => city && !city.removed);
  const provincesWithCities = new Set(activeCities.map(city => Number(city.province)).filter(id => id > 0));
  const occupied = new Set(activeCities.map(city => Number(city.packCell)).filter(Number.isInteger));
  const occupiedGrid = new Set(activeCities.map(city => Number(city.cell)).filter(Number.isInteger));
  const spacingIndex = new SpacingIndex(16);
  for (const city of activeCities) spacingIndex.add(city.x, city.y, city.id);
  const random = createRandom(`${options.seed || "map"}|province-city-candidates`);
  const nameGenerator = createChineseNameGenerator(options.seed, {namebases: options.namebases});
  const added = [];
  const relocated = [];
  const lockedCityIds = snapshotIds(options.lockedCities || options.preservedCities);
  const cityByGrid = new Map(activeCities.map(city => [Number(city.cell), city]));

  for (const province of politics?.provinces || []) {
    if (!province?.i || province.removed || provincesWithCities.has(Number(province.i))) continue;
    if (scopedProvinceIds && !scopedProvinceIds.has(Number(province.i))) continue;
    if (protectedProvinceIds.has(Number(province.i))) continue;
    const candidates = (pack.cells.i || [])
      .filter(cell => pack.cells.h?.[cell] >= 20
        && Number(pack.cells.province?.[cell]) === Number(province.i)
        && Number(pack.cells.state?.[cell]) === Number(province.state)
        && !pack.cells.burg?.[cell]
        && !occupied.has(cell))
      .sort((left, right) => provinceCandidateScore(pack, right, province) - provinceCandidateScore(pack, left, province) || left - right);
    let packCell = candidates.find(cell => !occupiedGrid.has(Number(pack.cells.g?.[cell])));
    if (!Number.isInteger(packCell)) {
      for (const candidate of candidates) {
        const blockingCity = cityByGrid.get(Number(pack.cells.g?.[candidate]));
        const relocationPlan = findCityRelocationPlan({
          pack,
          city: blockingCity,
          cityByGrid,
          lockedCityIds,
          protectedProvinceIds,
          scopedProvinceIds,
          reservedPackCells: new Set([candidate])
        });
        if (!relocationPlan) continue;
        if (!validateCityRelocationPlan(pack, relocationPlan, cityByGrid)) continue;
        for (const step of relocationPlan) {
          relocateCityToPackCell(pack, step.city, step.packCell, {
            occupied,
            occupiedGrid,
            cityByGrid,
            spacingIndex
          });
          relocated.push(step.city);
        }
        packCell = candidate;
        break;
      }
    }
    if (!Number.isInteger(packCell)) continue;
    const city = addPackCity({
      grid,
      pack,
      cities: settlements.cities,
      burgs: pack.burgs,
      occupied,
      occupiedGrid,
      spacingIndex,
      packCell,
      random,
      nameGenerator,
      flags: {provincial: true, required: true, state: Number(province.state), province: Number(province.i)}
    });
    if (!city) continue;
    for (const collection of [...new Set([politics?.provinces, pack?.provinces].filter(Array.isArray))]) {
      const target = collection[Number(province.i)];
      if (!target) continue;
      target.burg = city.burgId;
      target.center = city.packCell;
      target.gridCenter = city.cell;
    }
    provincesWithCities.add(Number(province.i));
    added.push(city);
  }

  if (!added.length) return;
  const adjustedCities = [...new Map([...relocated, ...added].map(city => [Number(city.id), city])).values()];
  shiftPortsAndRiverBurgs(
    grid,
    pack,
    settlements.cities,
    adjustedCities.map(city => pack.burgs[city.burgId]).filter(Boolean),
    nameGenerator,
    options
  );
  defineCityTypes(pack, adjustedCities, pack.burgs, options);
  specifyBurgs(pack, added, pack.burgs, nameGenerator, options);
  synchronizeCityScaleGroups(pack, settlements.cities, pack.burgs, options);
}

function findCityRelocationPlan({
  pack,
  city,
  cityByGrid,
  lockedCityIds,
  protectedProvinceIds,
  scopedProvinceIds,
  reservedPackCells,
  visiting = new Set()
}) {
  if (!city || visiting.has(Number(city.id))) return null;
  const burg = pack.burgs?.[city.burgId];
  if (!burg
    || Number(burg.cell) !== Number(city.packCell)
    || Number(pack.cells.g?.[city.packCell]) !== Number(city.cell)
    || Number(pack.cells.burg?.[city.packCell]) !== Number(city.burgId)) {
    return null;
  }
  const provinceId = Number(city.province);
  if (lockedCityIds.has(Number(city.id))
    || protectedProvinceIds.has(provinceId)
    || scopedProvinceIds && !scopedProvinceIds.has(provinceId)
    || city.capital
    || burg.capital
    || city.provincial
    || burg.provincial
    || city.visual?.manual
    || burg.visual?.manual) {
    return null;
  }

  const nextVisiting = new Set(visiting).add(Number(city.id));
  const currentPoint = pack.cells.p?.[city.packCell] || [Number(city.x) || 0, Number(city.y) || 0];
  const destinations = (pack.cells.i || [])
    .filter(cell => pack.cells.h?.[cell] >= 20
      && Number(pack.cells.province?.[cell]) === provinceId
      && Number(pack.cells.state?.[cell]) === Number(city.state)
      && !pack.cells.burg?.[cell]
      && !reservedPackCells.has(cell)
      && Number(pack.cells.g?.[cell]) !== Number(city.cell))
    .sort((left, right) => {
      const leftOccupied = cityByGrid.has(Number(pack.cells.g?.[left])) ? 1 : 0;
      const rightOccupied = cityByGrid.has(Number(pack.cells.g?.[right])) ? 1 : 0;
      if (leftOccupied !== rightOccupied) return leftOccupied - rightOccupied;
      const leftPoint = pack.cells.p?.[left] || currentPoint;
      const rightPoint = pack.cells.p?.[right] || currentPoint;
      const leftDistance = Math.hypot(Number(leftPoint[0]) - Number(currentPoint[0]), Number(leftPoint[1]) - Number(currentPoint[1]));
      const rightDistance = Math.hypot(Number(rightPoint[0]) - Number(currentPoint[0]), Number(rightPoint[1]) - Number(currentPoint[1]));
      return leftDistance - rightDistance || left - right;
    });

  for (const packCell of destinations) {
    const nextReserved = new Set(reservedPackCells).add(packCell);
    const blocker = cityByGrid.get(Number(pack.cells.g?.[packCell]));
    if (!blocker) return [{city, packCell}];
    const prefix = findCityRelocationPlan({
      pack,
      city: blocker,
      cityByGrid,
      lockedCityIds,
      protectedProvinceIds,
      scopedProvinceIds,
      reservedPackCells: nextReserved,
      visiting: nextVisiting
    });
    if (prefix) return [...prefix, {city, packCell}];
  }
  return null;
}

function validateCityRelocationPlan(pack, plan, cityByGrid) {
  const simulatedGrid = new Map([...cityByGrid].map(([gridCell, city]) => [Number(gridCell), Number(city?.id)]));
  const simulatedPackBurgs = new Map();
  const readPackBurg = packCell => simulatedPackBurgs.has(packCell)
    ? simulatedPackBurgs.get(packCell)
    : Number(pack.cells.burg?.[packCell] || 0);

  for (const step of plan || []) {
    const city = step?.city;
    const burg = pack.burgs?.[city?.burgId];
    const oldPackCell = Number(city?.packCell);
    const oldGridCell = Number(city?.cell);
    const nextPackCell = Number(step?.packCell);
    const nextGridCell = Number(pack.cells.g?.[nextPackCell]);
    if (!city
      || !burg
      || !Number.isInteger(oldPackCell)
      || !Number.isInteger(oldGridCell)
      || !Number.isInteger(nextPackCell)
      || !Number.isInteger(nextGridCell)
      || Number(burg.cell) !== oldPackCell
      || Number(pack.cells.g?.[oldPackCell]) !== oldGridCell
      || readPackBurg(oldPackCell) !== Number(city.burgId)
      || readPackBurg(nextPackCell) !== 0
      || simulatedGrid.get(oldGridCell) !== Number(city.id)) {
      return false;
    }
    simulatedGrid.delete(oldGridCell);
    if (simulatedGrid.has(nextGridCell)) return false;
    simulatedPackBurgs.set(oldPackCell, 0);
    simulatedPackBurgs.set(nextPackCell, Number(city.burgId));
    simulatedGrid.set(nextGridCell, Number(city.id));
  }
  return true;
}

function relocateCityToPackCell(pack, city, packCell, {occupied, occupiedGrid, cityByGrid, spacingIndex}) {
  const burg = pack.burgs?.[city.burgId];
  const oldPackCell = Number(city.packCell);
  const oldGridCell = Number(city.cell);
  const gridCell = Number(pack.cells.g?.[packCell]);
  if (!burg || !Number.isInteger(gridCell) || cityByGrid.has(gridCell)) {
    throw new Error(`无法为省份补城腾挪城市 #${city.id} 的落点`);
  }

  if (Number(pack.cells.burg?.[oldPackCell]) === Number(city.burgId)) pack.cells.burg[oldPackCell] = 0;
  const [x, y] = pack.cells.p?.[packCell] || [Number(city.x) || 0, Number(city.y) || 0];
  const resources = collectCityResourceContext(pack, packCell);
  const culture = Number(pack.cells.culture?.[packCell] ?? city.culture ?? 0);
  const religion = Number(pack.cells.religion?.[packCell] ?? city.religion ?? 0);
  const type = getBurgType(pack, packCell, 0);
  Object.assign(city, {
    cell: gridCell,
    packCell,
    x,
    y,
    culture,
    religion,
    type,
    resourceCells: resources.resourceCells,
    markerResourceCells: resources.markerResourceCells,
    resourceGoodIds: resources.goodIds,
    resourceScore: resources.score
  });
  Object.assign(burg, {
    cell: packCell,
    x,
    y,
    culture,
    religion,
    type,
    feature: pack.cells.f?.[packCell],
    resourceCells: resources.resourceCells,
    markerResourceCells: resources.markerResourceCells,
    resourceGoodIds: resources.goodIds,
    resourceScore: resources.score
  });
  for (const emblem of [city.coa, burg.coa]) {
    if (!emblem || typeof emblem !== "object") continue;
    emblem.x = x;
    emblem.y = y;
  }
  assignCityCivilization(pack, city, burg);
  pack.cells.burg[packCell] = city.burgId;
  occupied.delete(oldPackCell);
  occupied.add(packCell);
  occupiedGrid.delete(oldGridCell);
  occupiedGrid.add(gridCell);
  cityByGrid.delete(oldGridCell);
  cityByGrid.set(gridCell, city);
  spacingIndex.add(x, y, city.id);
}

function provinceCandidateScore(pack, cell, province) {
  const point = pack.cells.p?.[cell] || [0, 0];
  const pole = Array.isArray(province?.pole) ? province.pole : pack.cells.p?.[province?.center] || point;
  const distancePenalty = Math.hypot(Number(point[0]) - Number(pole[0]), Number(point[1]) - Number(pole[1])) * 0.01;
  return Number(pack.cells.s?.[cell] || 0) + Number(pack.cells.pop?.[cell] || 0) * 0.2 - distancePenalty;
}

function provinceIdsForSettlementScope(scope, politics) {
  if (!scope || typeof scope !== "object") return null;
  const kind = String(scope.kind || scope.type || "");
  const id = Number(scope.id);
  if (kind === "province" && Number.isInteger(id) && id > 0) return new Set([id]);
  if (kind === "state" && Number.isInteger(id) && id > 0) {
    return new Set((politics?.provinces || [])
      .filter(province => province && !province.removed && Number(province.state) === id)
      .map(province => Number(province.i ?? province.id)));
  }
  return null;
}

function synchronizeCityScaleGroups(pack, cities, burgs, options = {}) {
  const preservedBurgIds = new Set(options.preservedBurgIds || options.lockedCities?.map(city => Number(city?.burgId)) || []);
  const scaleContext = createCityScaleContext(cities, burgs);
  for (const city of cities || []) {
    if (!city || city.removed || preservedBurgIds.has(Number(city.burgId))) continue;
    const burg = burgs?.[city.burgId];
    if (!burg || burg.removed) continue;
    city.group = deriveCityScale(city, scaleContext, burg);
    burg.group = city.group;
    syncCityVisual(pack, city, burg, scaleContext);
  }
}

export function regenerateSettlementsWithinPolitics(grid, features, politics, settlements, pack, options = {}) {
  if (!pack?.cells?.s || !settlements) return finalizeSettlements(grid, features, politics, settlements, pack, options);

  const random = createRandom(regenerationSeed(options, "regenerate-settlements", options.settlementRegenerationSalt));
  const result = options.settlementScope
    ? rebuildPackSettlementsInScope(grid, politics, pack, random, options, settlements)
    : rebuildPackSettlementsFromEmpty(grid, politics, pack, random, options, settlements);
  settlements.cities = result.cities;
  mirrorCitiesToGrid(grid, settlements.cities);
  syncPoliticalSettlementStats(pack, politics, settlements.cities, options);
  return finalizeSettlements(grid, features, politics, settlements, pack, options);
}

export function inspectRelocatedSettlementPort(grid, pack, packCell, {wasPort = 0, capital = false, burgId = 0, options = {}} = {}) {
  const point = [...(pack?.cells?.p?.[packCell] || [0, 0])];
  if (!wasPort) return {port: 0, source: "none", anchor: point, routePackCell: null, reason: "非港城不会自动升级"};

  const riversById = new Map((pack?.rivers || []).map(river => [river.i, river]));
  const existingBurg = pack?.burgs?.[burgId] || (pack?.burgs || []).find(burg => Number(burg?.i) === Number(burgId));
  const relocatedBurg = existingBurg ? {...existingBurg, cell: packCell, capital: Number(capital)} : {i: burgId, cell: packCell, capital: Number(capital)};
  const candidate = createSettlementPortCandidate(grid, pack, relocatedBurg, riversById, options);
  if (candidate) return describeRelocatedPortCandidate(pack, candidate, riversById);
  return {port: 0, source: "cleared", anchor: point, routePackCell: null, reason: "目标不再满足港口条件"};
}

export function traceSettlementWaterRoutePath(pack, start, end, options = {}) {
  return traceSettlementRoutePath(pack, start, end, {...options, water: true});
}

export function traceSettlementRoutePath(pack, start, end, options = {}) {
  const connections = options.connections instanceof Set ? options.connections : new Set();
  const blockedConnections = options.blockedConnections instanceof Set ? options.blockedConnections : null;
  const cellCount = pack?.cells?.i?.length || pack?.cells?.h?.length || 0;
  if (!cellCount) return [];
  return tracePackPath(
    pack,
    Number(start),
    Number(end),
    Boolean(options.water),
    connections,
    options.variation || null,
    createRouteSearchScratch(cellCount),
    cellCount + 1,
    buildRiverEdges(pack),
    options.maxVisited ?? cellCount,
    blockedConnections
  );
}

export function synchronizeRelocatedRoutePath(pack, cities, route, packCells, options = {}) {
  if (!route || !Array.isArray(packCells) || packCells.length < 2) return false;
  const preservedEndpointIdentity = options.preserveEndpointIdentity ? {
    feature: route.feature,
    from: route.from,
    to: route.to,
    fromProvincial: route.fromProvincial,
    toProvincial: route.toProvincial,
    administrativePriority: route.administrativePriority
  } : null;
  const cityByBurg = new Map((cities || []).filter(city => city && !city.removed).map(city => [Number(city.burgId), city]));
  const pointsArray = preparePackRoutePoints(pack, cityByBurg);
  const cells = packCells.map(Number);
  const {burg: fromBurg, city: fromCity} = resolvePackRouteEndpoint(pack, cityByBurg, cells[0]);
  const {burg: toBurg, city: toCity} = resolvePackRouteEndpoint(pack, cityByBurg, cells.at(-1));
  const resources = countRouteResources(pack, cells);
  const type = route.type;
  const endpointPort = type === "searoute" && fromBurg?.port && (!toBurg?.port || Number(toBurg.port) === Number(fromBurg.port))
    ? Number(fromBurg.port)
    : type === "searoute" && toBurg?.port ? Number(toBurg.port) : Number(route.feature || 0);
  Object.assign(route, {
    feature: type === "searoute" ? endpointPort : routeMajorityCellValue(pack, cells, "f"),
    state: routeMajorityCellValue(pack, cells, "state"),
    province: type === "searoute" ? 0 : routeMajorityCellValue(pack, cells, "province"),
    from: fromCity?.id ?? -1,
    to: toCity?.id ?? -1,
    fromProvincial: Boolean(fromCity?.provincial),
    toProvincial: Boolean(toCity?.provincial),
    administrativePriority: fromCity?.capital || toCity?.capital
      ? "national"
      : fromCity?.provincial || toCity?.provincial
        ? "provincial"
        : "ordinary",
    cells: cells.map(cell => pack.cells.g[cell]),
    packCells: cells,
    resourceCells: resources.resourceCells,
    markerResourceCells: resources.markerResourceCells,
    resourceGoodIds: resources.goodIds,
    points: cells.map(cell => pointsArray[cell])
  });
  if (preservedEndpointIdentity) {
    Object.assign(route, preservedEndpointIdentity);
    route.points[0] = routeEndpointPoint(pack, cities, cells[0], preservedEndpointIdentity.from);
    route.points[route.points.length - 1] = routeEndpointPoint(pack, cities, cells.at(-1), preservedEndpointIdentity.to);
  }
  return true;
}

function routeEndpointPoint(pack, cities, packCell, cityId) {
  const id = Number(cityId);
  const city = Number.isInteger(id) && id >= 0 ? cities?.[id] : null;
  if (city && !city.removed && Number(city.id) === id && Number(city.packCell) === Number(packCell)) {
    return [Number(city.x), Number(city.y)];
  }
  return [...(pack.cells.p?.[packCell] || [0, 0])];
}

export function rebuildSettlementRouteMirrors(pack, routes) {
  pack.routes = buildPackRouteMirror(routes || []);
  pack.cells.routes = buildPackRouteLinks(routes || []);
  return {routes: routes?.length || 0, segments: (routes || []).reduce((sum, route) => sum + Math.max(0, (route?.packCells?.length || 0) - 1), 0)};
}

export function isSettlementWaterRoutePathValid(pack, path) {
  if (!Array.isArray(path) || path.length < 2) return false;
  const cells = path.map(Number);
  const cellCount = pack?.cells?.i?.length || pack?.cells?.h?.length || 0;
  if (cells.some(cell => !Number.isInteger(cell) || cell < 0 || cell >= cellCount)) return false;
  const riverEdges = buildRiverEdges(pack);
  const edgeKeyMultiplier = cellCount + 1;
  for (let index = 1; index < cells.length; index++) {
    const current = cells[index - 1];
    const next = cells[index];
    if (!(pack.cells.c?.[current] || []).includes(next)) return false;
    if (index === cells.length - 1 && pack.cells.h?.[next] >= 20 && canReachWaterRouteExit(pack, current, next, riverEdges)) continue;
    if (!Number.isFinite(packRouteStepCost(pack, current, next, true, new Set(), null, edgeKeyMultiplier, riverEdges))) return false;
  }
  return true;
}

export function refreshRelocatedSettlementDerived(grid, features, politics, settlements, pack, options = {}) {
  if (options.local) {
    refreshRelocatedSettlementDerivedLocal(politics, settlements, pack, options);
    return;
  }
  for (const states of new Set([politics?.states, pack?.states].filter(Boolean))) syncStateSettlementStats(pack, states);
  for (const provinces of new Set([politics?.provinces, pack?.provinces].filter(Boolean))) syncProvinceSettlementStats(pack, provinces);

  const cities = (settlements?.cities || []).filter(city => city && !city.removed);
  const routes = (settlements?.routes || []).filter(Boolean);
  const population = grid?.cells?.pop || [];
  const populationPoints = buildPopulationPoints(grid, features, population);
  settlements.populationPoints = populationPoints;
  settlements.metadata ||= {};
  Object.assign(settlements.metadata, createSettlementMetadata({grid, features, population, cities, routes, pack, populationPoints}));
}

export async function rebuildRelocatedPopulationPointsAsync(grid, features, options = {}) {
  const population = grid?.cells?.pop || [];
  const limit = Math.min(2400, Math.round((grid?.points?.length || 0) * 0.22));
  const candidates = [];
  const sliceMs = Math.max(1, Number(options.sliceMs) || 4);
  const yieldToMain = typeof options.yieldToMain === "function" ? options.yieldToMain : () => new Promise(resolve => setTimeout(resolve, 0));
  let sliceStartedAt = performance.now();
  for (let cell = 0; cell < (grid?.points?.length || 0); cell++) {
    assertPopulationPointRefreshActive(options);
    const value = Number(population[cell] || 0);
    if (value > 42 && isLandFeature(features, grid, cell) && grid.cells.burg?.[cell] === -1) {
      pushBoundedPopulationCandidate(candidates, cell, grid.points[cell], value, limit);
    }
    if (performance.now() - sliceStartedAt < sliceMs) continue;
    await yieldToMain();
    assertPopulationPointRefreshActive(options);
    sliceStartedAt = performance.now();
  }
  assertPopulationPointRefreshActive(options);
  candidates.sort((a, b) => b.population - a.population || a.cell - b.cell);
  return candidates;
}

function pushBoundedPopulationCandidate(heap, cell, point, population, limit) {
  if (limit <= 0) return;
  if (heap.length < limit) {
    heap.push({cell, point, population});
    bubbleWorstPopulationCandidate(heap, heap.length - 1);
    return;
  }
  if (!populationCandidateValuesBetter(cell, population, heap[0])) return;
  heap[0].cell = cell;
  heap[0].point = point;
  heap[0].population = population;
  sinkWorstPopulationCandidate(heap, 0);
}

function bubbleWorstPopulationCandidate(heap, index) {
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (!populationCandidateWorse(heap[index], heap[parent])) return;
    [heap[index], heap[parent]] = [heap[parent], heap[index]];
    index = parent;
  }
}

function sinkWorstPopulationCandidate(heap, index) {
  while (true) {
    const left = index * 2 + 1;
    if (left >= heap.length) return;
    const right = left + 1;
    let worst = left;
    if (right < heap.length && populationCandidateWorse(heap[right], heap[left])) worst = right;
    if (!populationCandidateWorse(heap[worst], heap[index])) return;
    [heap[index], heap[worst]] = [heap[worst], heap[index]];
    index = worst;
  }
}

function populationCandidateValuesBetter(cell, population, b) {
  return population > b.population || population === b.population && cell < b.cell;
}

function populationCandidateWorse(a, b) {
  return a.population < b.population || a.population === b.population && a.cell > b.cell;
}

function assertPopulationPointRefreshActive(options) {
  if (!options.signal?.aborted && (typeof options.shouldContinue !== "function" || options.shouldContinue())) return;
  const error = new Error("城市移动人口点刷新已取消");
  error.code = "operation_cancelled";
  throw error;
}

function refreshRelocatedSettlementDerivedLocal(politics, settlements, pack, options) {
  const stateIds = new Set((options.affectedStateIds || []).map(Number).filter(id => Number.isInteger(id) && id >= 0));
  const provinceIds = new Set((options.affectedProvinceIds || []).map(Number).filter(id => Number.isInteger(id) && id >= 0));
  const burgs = (pack?.burgs || []).filter(burg => burg?.i && !burg.removed);
  for (const states of new Set([politics?.states, pack?.states].filter(Boolean))) {
    for (const id of stateIds) {
      const state = states[id];
      if (!state) continue;
      state.burgs = 0;
      state.urban = 0;
      state.civilizationProfile = {};
      state.civilizationType = null;
      state.civilizationLabel = null;
      for (const burg of burgs) {
        if (Number(burg.state) !== id) continue;
        state.burgs++;
        state.urban += Number(burg.population || 0);
        addCivilizationWeight(state, burg);
      }
      state.urban = round(state.urban || 0, 2);
      finalizeCivilizationProfile(state);
    }
  }
  for (const provinces of new Set([politics?.provinces, pack?.provinces].filter(Boolean))) {
    for (const id of provinceIds) {
      const province = provinces[id];
      if (!province) continue;
      province.burgs = 0;
      province.urban = 0;
      for (const burg of burgs) {
        if (Number(burg.province) !== id) continue;
        province.burgs++;
        province.urban += Number(burg.population || 0);
      }
      province.urban = round(province.urban || 0, 2);
    }
  }
  const cities = (settlements?.cities || []).filter(city => city && !city.removed);
  const routes = (settlements?.routes || []).filter(Boolean);
  settlements.metadata ||= {};
  settlements.metadata.cities = cities.length;
  settlements.metadata.capitals = cities.filter(city => city.capital).length;
  settlements.metadata.ports = cities.filter(city => city.port).length;
  settlements.metadata.maxPopulation = cities.reduce((maximum, city) => Math.max(maximum, Number(city.population || 0)), 0);
  settlements.metadata.routes = routes.length;
  settlements.metadata.routeSegments = routes.reduce((sum, route) => sum + Math.max(0, (route.points || []).length - 1), 0);
}

export function deriveRelocatedSettlement(pack, city, burg) {
  const resources = collectCityResourceContext(pack, burg.cell);
  burg.feature = pack?.cells?.f?.[burg.cell] ?? 0;
  burg.resourceCells = resources.resourceCells;
  burg.markerResourceCells = resources.markerResourceCells;
  burg.resourceGoodIds = resources.goodIds;
  burg.resourceScore = resources.score;
  city.resourceCells = resources.resourceCells;
  city.markerResourceCells = resources.markerResourceCells;
  city.resourceGoodIds = [...resources.goodIds];
  city.resourceScore = resources.score;
  burg.type = getBurgType(pack, burg.cell, burg.port);
  city.type = burg.type;
  defineBurgFeatures(pack, burg);
  const scaleContext = createCityScaleContext([], pack?.burgs || []);
  burg.group = defineBurgGroup(burg, scaleContext);
  city.group = burg.group;
  city.citadel = burg.citadel;
  city.plaza = burg.plaza;
  city.walls = burg.walls;
  city.temple = burg.temple;
  assignCityCivilization(pack, city, burg);
  syncCityVisual(pack, city, burg, scaleContext);
  return {type: city.type, group: city.group, resources};
}

export function refreshProvincialCapitalRoutePriorities(cities, routes, pack = null, options = {}) {
  const byId = new Map((cities || []).filter(Boolean).map(city => [Number(city.id), city]));
  const lockedRouteIds = snapshotIds(options.lockedRoutes);
  const apply = route => {
    if (!route || lockedRouteIds.has(Number(route.id ?? route.i))) return;
    const from = byId.get(Number(route.from));
    const to = byId.get(Number(route.to));
    route.fromProvincial = Boolean(from?.provincial);
    route.toProvincial = Boolean(to?.provincial);
    route.administrativePriority = from?.capital || to?.capital
      ? "national"
      : from?.provincial || to?.provincial
        ? "provincial"
        : "ordinary";
  };
  for (const route of routes || []) apply(route);
  if (pack?.routes !== routes) {
    const primaryById = new Map((routes || []).filter(Boolean).map(route => [Number(route.id), route]));
    for (const route of pack?.routes || []) {
      if (!route) continue;
      const routeId = Number(route.i ?? route.id);
      if (lockedRouteIds.has(routeId)) continue;
      const primary = primaryById.get(routeId);
      if (!primary) continue;
      route.fromProvincial = primary.fromProvincial;
      route.toProvincial = primary.toProvincial;
      route.administrativePriority = primary.administrativePriority;
    }
  }
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
  const activeCities = cities.filter(city => city && !city.removed);
  const routeResources = routeResourceStats(routes);
  const cityResources = cityResourceStats(activeCities);
  return {
    cities: activeCities.length,
    capitals: activeCities.filter(city => city.capital).length,
    ports: activeCities.filter(city => city.port).length,
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
    maxPopulation: maxValue(activeCities.map(city => city.population)),
    packBurgs: pack?.burgs ? pack.burgs.filter(burg => burg?.i && !burg.removed).length : 0
  };
}

function buildPackSettlements(grid, features, politics, random, pack, options) {
  const {cells} = pack;
  const nameGenerator = createChineseNameGenerator(options.seed, {namebases: options.namebases});
  const populated = cells.i.filter(cell => isPopulatedPackCell(cells, cell));
  const needsLandCapitalFallback = Number(options.statesNumber) > 0
    && getCapitalsNumber(populated.length, options.statesNumber) === 0;
  const capitalCandidates = needsLandCapitalFallback ? cells.i.filter(cell => cells.h?.[cell] >= 20) : populated;
  const cities = [];
  const burgs = [null];
  const occupied = new Set();
  const occupiedGrid = new Set();
  const spacingIndex = new SpacingIndex(16);

  cells.burg = new Uint16Array(cells.i.length);
  if (!capitalCandidates.length) {
    pack.burgs = burgs;
    return {cities};
  }

  if (politics?.states?.length) {
    for (const state of politics.states) {
      if (!state || state.i === 0) continue;
      const packCell = findPackCellForGrid(grid, pack, state.center, capitalCandidates);
      addPackCity({
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
        flags: {capital: true, state: state.id, required: needsLandCapitalFallback}
      });
    }

    for (const province of politics.provinces || []) {
      const packCell = findPackCellForGrid(grid, pack, province.center, capitalCandidates);
      addPackCity({
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
        flags: {provincial: true, state: province.state, required: needsLandCapitalFallback}
      });
    }
  } else {
    generatePackCapitals({
      grid,
      pack,
      cities,
      burgs,
      occupied,
      occupiedGrid,
      spacingIndex,
      populated: capitalCandidates,
      random,
      nameGenerator,
      options,
      required: needsLandCapitalFallback
    });
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

function rebuildPackSettlementsFromEmpty(grid, politics, pack, random, options, settlements) {
  return rebuildPackSettlementsWithoutImplicitAnchors(grid, politics, pack, random, options, settlements, null);
}

function rebuildPackSettlementsInScope(grid, politics, pack, random, options, settlements) {
  const scope = normalizeSettlementScope(options.settlementScope, politics);
  return rebuildPackSettlementsWithoutImplicitAnchors(grid, politics, pack, random, options, settlements, scope);
}

function rebuildPackSettlementsWithoutImplicitAnchors(grid, politics, pack, random, options, settlements, scope) {
  const {cells} = pack;
  const nameGenerator = createChineseNameGenerator(options.seed, {namebases: options.namebases});
  const cellInScope = cell => {
    if (!scope) return true;
    return scope.kind === "state"
      ? Number(cells.state?.[cell]) === scope.id
      : Number(cells.province?.[cell]) === scope.id;
  };
  const cityInScope = city => {
    if (!scope) return true;
    const packCell = Number(city?.packCell);
    if (Number.isInteger(packCell) && packCell >= 0 && packCell < cells.i.length && cellInScope(packCell)) return true;
    return scope.kind === "state" ? Number(city?.state) === scope.id : Number(city?.province) === scope.id;
  };
  const allPopulated = cells.i.filter(cell => isPopulatedPackCell(cells, cell));
  const populated = scope ? allPopulated.filter(cellInScope) : allPopulated;
  const previousBurgs = pack.burgs || [];
  const previousCities = settlements?.cities || [];
  const locked = prepareLockedCities(grid, pack, options, previousCities, previousBurgs);
  const protectedStateIds = snapshotIds(options.lockedStates);
  const protectedProvinceIds = snapshotIds(options.lockedProvinces);
  const cities = [];
  const burgs = [null];
  const cityIds = new Set();
  const burgIds = new Set();
  const retainedCityIds = new Set();
  preserveLockedFeatureReferenceTombstones({
    previousCities,
    previousBurgs,
    lockedFeatures: options.lockedFeatures,
    cities,
    burgs,
    cityIds,
    burgIds
  });

  for (const city of previousCities) {
    if (!city || city.removed || cityInScope(city) && !locked.cityIds.has(Number(city.id))) continue;
    const burg = previousBurgs[city.burgId];
    if (!burg || burg.removed) continue;
    const retainedCity = locked.cities[Number(city.id)] || structuredClone(city);
    const retainedBurg = locked.burgs[Number(city.burgId)] || structuredClone(burg);
    cities[Number(retainedCity.id)] = retainedCity;
    burgs[Number(retainedCity.burgId)] = retainedBurg;
    cityIds.add(Number(retainedCity.id));
    burgIds.add(Number(retainedCity.burgId));
    retainedCityIds.add(Number(retainedCity.id));
  }

  const allocateCityId = createReservedIdAllocator(cityIds, 0);
  const allocateBurgId = createReservedIdAllocator(burgIds, 1);
  const occupied = new Set();
  const occupiedGrid = new Set();
  const spacingIndex = new SpacingIndex(16);
  const protectedSettlementCells = collectProtectedSettlementCells(pack, options);
  const generated = [];

  cells.burg = new Uint16Array(cells.i.length);
  pack.burgs = burgs;
  if (!cells.i.length) {
    return {cities};
  }
  seedRetainedCities(grid, cells, cities, burgs, occupied, occupiedGrid, spacingIndex);

  const targetStateIds = stateIdsForSettlementScope(scope, politics);
  const targetProvinceIds = scope
    ? provinceIdsForSettlementScope(scope, politics)
    : new Set((politics?.provinces || []).filter(province => province?.i && !province.removed).map(province => Number(province.i)));
  for (const state of politics?.states || []) {
    const stateId = Number(state?.i ?? state?.id);
    if (!stateId || state?.removed || !targetStateIds.has(stateId)) continue;
    if (protectedStateIds.has(stateId)) continue;
    const retainedCapital = cities.find(city => city && !city.removed && Number(city.state) === stateId && city.capital);
    if (retainedCapital) {
      synchronizeStateCapital(politics, pack, retainedCapital);
      continue;
    }
    const stateCells = cells.i.filter(cell => cellInScope(cell) && Number(cells.state?.[cell]) === stateId);
    const packCell = selectRegeneratedAdministrativeCell(pack, stateCells, occupied, occupiedGrid, random);
    const city = addPackCity({
      grid, pack, cities, burgs, occupied, occupiedGrid, spacingIndex, packCell, random, nameGenerator,
      flags: {capital: true, required: true, state: stateId, cityId: allocateCityId(), burgId: allocateBurgId()}
    });
    if (!city) {
      clearStateCapital(politics, pack, stateId);
      continue;
    }
    generated.push(city);
    synchronizeStateCapital(politics, pack, city);
  }

  for (const province of politics?.provinces || []) {
    const provinceId = Number(province?.i ?? province?.id);
    if (!provinceId || province?.removed || !targetProvinceIds.has(provinceId)) continue;
    if (protectedProvinceIds.has(provinceId)) continue;
    const retainedProvincial = cities.find(city => city && !city.removed && Number(city.province) === provinceId && city.provincial);
    if (retainedProvincial) {
      synchronizeProvinceCapital(politics, pack, retainedProvincial);
      continue;
    }
    const stateCapital = cities.find(city => city && !city.removed && Number(city.province) === provinceId && city.capital && !retainedCityIds.has(Number(city.id)));
    if (stateCapital) {
      stateCapital.provincial = true;
      const burg = burgs[stateCapital.burgId];
      if (burg) burg.provincial = 1;
      synchronizeProvinceCapital(politics, pack, stateCapital);
      continue;
    }
    const packCell = selectRegeneratedAdministrativeCell(pack, cells.i.filter(cell => cellInScope(cell) && Number(cells.province?.[cell]) === provinceId), occupied, occupiedGrid, random);
    const city = addPackCity({
      grid, pack, cities, burgs, occupied, occupiedGrid, spacingIndex, packCell, random, nameGenerator,
      flags: {provincial: true, required: true, state: Number(province.state), province: provinceId, cityId: allocateCityId(), burgId: allocateBurgId()}
    });
    if (!city) continue;
    generated.push(city);
    synchronizeProvinceCapital(politics, pack, city);
  }

  const targetTowns = scope && allPopulated.length
    ? Math.round(getTownsNumber(allPopulated.length, grid.points.length) * populated.length / allPopulated.length)
    : getTownsNumber(populated.length, grid.points.length);
  generated.push(...addRegeneratedTowns({
    grid,
    pack,
    cities,
    burgs,
    occupied,
    occupiedGrid,
    spacingIndex,
    populated,
    random,
    nameGenerator,
    targetTowns,
    reservedTowns: cities.filter(city => city && cityInScope(city) && retainedCityIds.has(Number(city.id)) && !city.capital && !city.provincial).length,
    allocateCityId,
    allocateBurgId,
    excludedPackCells: protectedSettlementCells
  }));
  pack.burgs = burgs;
  const generatedBurgs = generated.map(city => burgs[city.burgId]).filter(Boolean);
  shiftPortsAndRiverBurgs(grid, pack, cities, generatedBurgs, nameGenerator, options);
  defineCityTypes(pack, generated, burgs, options);
  specifyBurgs(pack, generated, burgs, nameGenerator, options);
  fillIdentityArrayHoles(cities);
  fillIdentityArrayHoles(burgs);
  return {cities};
}

function preserveLockedFeatureReferenceTombstones({previousCities, previousBurgs, lockedFeatures, cities, burgs, cityIds, burgIds}) {
  const protectedFeatureIds = snapshotIds(lockedFeatures);
  if (!protectedFeatureIds.size) return;
  const selectedCityIds = new Set();
  const selectedBurgIds = new Set();
  const referencesProtectedFeature = object => protectedFeatureIds.has(Number(object?.feature))
    || protectedFeatureIds.has(Number(object?.port))
    || protectedFeatureIds.has(Number(object?.data?.feature));

  for (const city of previousCities || []) {
    if (!city?.removed || !referencesProtectedFeature(city)) continue;
    selectedCityIds.add(Number(city.id ?? city.i));
    selectedBurgIds.add(Number(city.burgId));
  }
  for (const burg of previousBurgs || []) {
    if (!burg?.removed || !referencesProtectedFeature(burg)) continue;
    selectedBurgIds.add(Number(burg.i ?? burg.id));
    selectedCityIds.add(Number(burg.cityId));
  }

  for (const id of selectedCityIds) {
    if (!Number.isInteger(id) || id < 0) continue;
    const city = previousCities?.[id];
    if (city?.removed) cities[id] = structuredClone(city);
    cityIds.add(id);
  }
  for (const id of selectedBurgIds) {
    if (!Number.isInteger(id) || id <= 0) continue;
    const burg = previousBurgs?.[id];
    if (burg?.removed) burgs[id] = structuredClone(burg);
    burgIds.add(id);
  }
}

function seedRetainedCities(grid, cells, cities, burgs, occupied, occupiedGrid, spacingIndex) {
  for (const city of cities) {
    if (!city || city.removed) continue;
    const burg = burgs[city.burgId];
    if (!burg || burg.removed) continue;
    cells.burg[city.packCell] = city.burgId;
    occupied.add(city.packCell);
    occupiedGrid.add(city.cell);
    spacingIndex.add(city.x, city.y, city.id);
    if (grid.cells.burg) grid.cells.burg[city.cell] = city.id;
  }
}

function stateIdsForSettlementScope(scope, politics) {
  if (!scope) return new Set((politics?.states || []).filter(state => state?.i && !state.removed).map(state => Number(state.i)));
  if (scope.kind === "state") return new Set([scope.id]);
  const province = politics?.provinces?.[scope.id];
  return new Set(Number(province?.state) > 0 ? [Number(province.state)] : []);
}

function selectRegeneratedAdministrativeCell(pack, candidates, occupied, occupiedGrid, random) {
  const available = candidates.filter(cell => pack.cells.h?.[cell] >= 20
    && !occupied.has(cell)
    && !pack.cells.burg?.[cell]
    && !occupiedGrid.has(Number(pack.cells.g?.[cell])));
  const preferred = available.filter(cell => isPopulatedPackCell(pack.cells, cell));
  const pool = preferred.length ? preferred : available;
  return [...pool]
    .map(cell => ({cell, score: (citySiteScore(pack, cell) + 1) * random.range(0.55, 1.45)}))
    .sort((left, right) => right.score - left.score || left.cell - right.cell)[0]?.cell ?? -1;
}

function synchronizeStateCapital(politics, pack, city) {
  const burg = pack.burgs?.[city.burgId];
  city.capital = true;
  if (burg) burg.capital = 1;
  for (const collection of [...new Set([politics?.states, pack?.states].filter(Array.isArray))]) {
    const state = collection[Number(city.state)];
    if (!state || state.removed) continue;
    state.capital = city.burgId;
    state.center = city.packCell;
    state.gridCenter = city.cell;
    state.capitalName = city.name;
  }
}

function clearStateCapital(politics, pack, stateId) {
  for (const collection of [...new Set([politics?.states, pack?.states].filter(Array.isArray))]) {
    const state = collection[Number(stateId)];
    if (!state || state.removed) continue;
    state.capital = 0;
    state.capitalName = "";
  }
}

function synchronizeProvinceCapital(politics, pack, city) {
  const burg = pack.burgs?.[city.burgId];
  city.provincial = true;
  if (burg) burg.provincial = 1;
  for (const collection of [...new Set([politics?.provinces, pack?.provinces].filter(Array.isArray))]) {
    const province = collection[Number(city.province)];
    if (!province || province.removed) continue;
    province.burg = city.burgId;
    province.center = city.packCell;
    province.gridCenter = city.cell;
  }
}

function prepareLockedCities(grid, pack, options, previousCities, previousBurgs) {
  const provided = options.lockedCities ?? options.preservedCities ?? [];
  if (!Array.isArray(provided)) throw settlementLockConflict("锁定城镇约束必须是数组", {reason: "invalid-constraint"});
  const cities = [];
  const burgs = [null];
  const cityIds = new Set();
  const burgIds = new Set();
  const packCells = new Set();
  const gridCells = new Set();

  for (const source of provided) {
    if (!source || typeof source !== "object") throw settlementLockConflict("锁定城镇约束包含空对象", {reason: "invalid-city"});
    const city = structuredClone(source);
    const id = Number(city.id ?? city.i);
    const burgId = Number(city.burgId);
    const packCell = Number(city.packCell);
    const gridCell = Number(city.cell);
    if (!Number.isInteger(id) || id < 0 || !Number.isInteger(burgId) || burgId <= 0) {
      throw settlementLockConflict("锁定城镇缺少有效 ID 或 burgId", {reason: "invalid-id", id, burgId});
    }
    if (!Number.isInteger(packCell) || packCell < 0 || packCell >= pack.cells.i.length || !Number.isInteger(gridCell) || gridCell < 0 || gridCell >= grid.cells.h.length) {
      throw settlementLockConflict(`锁定城镇 #${id} 引用了无效 cell`, {reason: "invalid-cell", id, packCell, gridCell});
    }
    const existing = previousCities.find(item => Number(item?.id ?? item?.i) === id);
    const burg = previousBurgs[burgId];
    if (!existing || !burg || burg.removed || Number(burg.cell) !== packCell) {
      throw settlementLockConflict(`锁定城镇 #${id} 缺少一致的原对象或 burg 镜像`, {reason: "missing-mirror", id, burgId, packCell});
    }
    if (cityIds.has(id) || burgIds.has(burgId) || packCells.has(packCell) || gridCells.has(gridCell)) {
      throw settlementLockConflict(`锁定城镇 #${id} 与其它锁城占用重复身份或 cell`, {reason: "reserved-space-conflict", id, burgId, packCell, gridCell});
    }
    city.id = id;
    cities[id] = city;
    burgs[burgId] = structuredClone(burg);
    cityIds.add(id);
    burgIds.add(burgId);
    packCells.add(packCell);
    gridCells.add(gridCell);
  }

  return {cities, burgs, cityIds, burgIds, packCells, gridCells};
}

function settlementLockConflict(message, details) {
  const error = new Error(message);
  error.code = "regeneration_lock_conflict";
  error.details = {domain: "cities", ...details};
  return error;
}

function createReservedIdAllocator(reserved, start) {
  let cursor = start;
  return () => {
    while (reserved.has(cursor)) cursor++;
    const id = cursor++;
    reserved.add(id);
    return id;
  };
}

function normalizeSettlementScope(scope, politics) {
  const kind = String(scope?.kind || "").trim().toLowerCase();
  const id = Number(scope?.id);
  if (!["state", "province"].includes(kind) || !Number.isInteger(id) || id <= 0) {
    throw new Error("城镇局部重设范围必须是有效的国家或省份");
  }
  const collection = kind === "state" ? politics?.states : politics?.provinces;
  const record = collection?.[id];
  if (!record || record.removed || Number(record.i ?? record.id) !== id) {
    throw new Error(`${kind === "state" ? "国家" : "省份"} #${id} 不存在或已移除`);
  }
  return {kind, id};
}

function addRegeneratedTowns({
  grid,
  pack,
  cities,
  burgs,
  occupied,
  occupiedGrid,
  spacingIndex,
  populated,
  random,
  nameGenerator,
  targetTowns = null,
  reservedTowns = 0,
  allocateCityId = null,
  allocateBurgId = null,
  excludedPackCells = new Set()
}) {
  const {cells} = pack;
  const desiredTowns = Number.isInteger(targetTowns) ? targetTowns : getTownsNumber(populated.length, grid.points.length);
  const townsToAdd = Math.max(0, desiredTowns - reservedTowns);
  const score = new Float32Array(cells.i.length);
  for (const cell of populated) score[cell] = citySiteScore(pack, cell) * gaussian(random, 1, 3, 0, 20, 3);
  const sorted = [...populated].filter(cell => !excludedPackCells.has(cell)).sort((a, b) => score[b] - score[a]);
  let spacing = townsToAdd > 0 ? ((grid.metadata.graphWidth + grid.metadata.graphHeight) / 150) / (townsToAdd ** 0.7 / 66) : 0;
  const generated = [];

  for (let added = 0; added < townsToAdd && spacing > 1; ) {
    for (const packCell of sorted) {
      if (added >= townsToAdd) break;
      if (occupied.has(packCell) || cells.burg[packCell]) continue;

      const [x, y] = cells.p[packCell];
      const minSpacing = spacing * gaussian(random, 1, 0.3, 0.2, 2, 2);
      if (spacingIndex.find(x, y, minSpacing)) continue;

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
        flags: {
          ...(allocateCityId ? {cityId: allocateCityId()} : {}),
          ...(allocateBurgId ? {burgId: allocateBurgId()} : {})
        }
      });
      if (city) {
        generated.push(city);
        added++;
      }
    }

    spacing *= 0.5;
  }
  return generated;
}

function generatePackCapitals({grid, pack, cities, burgs, occupied, occupiedGrid, spacingIndex, populated, random, nameGenerator, options, required = false}) {
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
    addPackCity({
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
      flags: {capital: true, required}
    });
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
  const cityId = Number.isInteger(flags.cityId) && flags.cityId >= 0 ? flags.cityId : cities.length;
  const state = Number.isInteger(flags.state) ? flags.state : flags.capital ? burgId : grid.cells.state?.[gridCell] ?? 0;
  const province = Number.isInteger(flags.province)
    ? flags.province
    : cells.province?.[packCell] ?? grid.cells.province?.[gridCell] ?? -1;
  const type = getBurgType(pack, packCell, 0);
  const cultureId = cells.culture[packCell] || 0;
  const culture = pack.cultures?.[cultureId];
  const population = defineBurgPopulation(pack, packCell, Boolean(flags.capital), random);
  const resourceContext = collectCityResourceContext(pack, packCell);
  const groupHint = deriveCityScale({population});
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
  cities[cityId] = city;
  cells.burg[packCell] = burgId;
  occupied.add(packCell);
  occupiedGrid.add(gridCell);
  spacingIndex.add(x, y, cityId);
  return city;
}

function shiftPortsAndRiverBurgs(grid, pack, cities, burgs, nameGenerator, options = {}) {
  const {cells} = pack;
  const preservedBurgIds = new Set(options.preservedBurgIds || []);
  const protectedFeatureIds = snapshotIds(options.lockedFeatures);
  const previousFeatureDiagnostics = (pack.portDiagnostics?.features || [])
    .filter(item => protectedFeatureIds.has(Number(item?.feature)))
    .map(item => structuredClone(item));
  const featurePortCandidates = new Map();
  const selectedPortCandidates = [];
  const riversById = new Map((pack.rivers || []).map(river => [river.i, river]));
  const addCandidate = candidate => {
    if (!candidate.portFeatureId) return;
    if (protectedFeatureIds.has(Number(candidate.portFeatureId))) return;
    if (!featurePortCandidates.has(candidate.portFeatureId)) featurePortCandidates.set(candidate.portFeatureId, []);
    featurePortCandidates.get(candidate.portFeatureId).push(candidate);
  };

  for (const burg of burgs) {
    if (!burg?.i || preservedBurgIds.has(Number(burg.i))) continue;
    burg.port = 0;
    const candidate = createSettlementPortCandidate(grid, pack, burg, riversById, options);
    if (candidate) addCandidate(candidate);
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
  if (previousFeatureDiagnostics.length) {
    pack.portDiagnostics.features = [
      ...pack.portDiagnostics.features.filter(item => !protectedFeatureIds.has(Number(item?.feature))),
      ...previousFeatureDiagnostics
    ].sort((left, right) => Number(left?.feature) - Number(right?.feature));
  }

  for (const burg of burgs) {
    if (!burg?.i || preservedBurgIds.has(Number(burg.i)) || burg.port || !cells.r?.[burg.cell]) continue;
    const city = cities[burg.cityId];
    const [x, y] = shiftTowardsRiverBank(pack, burg.cell, riversById);
    burg.x = x;
    burg.y = y;
    city.x = burg.x;
    city.y = burg.y;
  }
}

function createSettlementPortCandidate(grid, pack, burg, riversById, options = {}) {
  const {cells, features} = pack;
  const haven = cells.haven?.[burg.cell];
  const landFeature = cells.f?.[burg.cell];
  const harbor = cells.harbor?.[burg.cell] || 0;
  if (haven) {
    const featureId = cells.f?.[haven];
    const feature = features?.[featureId];
    if (!featureId || !feature) return null;
    const isMulticell = (feature.cells || 0) > 1;
    const isHarbor = (harbor && burg.capital) || harbor === 1;
    const isFrozen = (grid.cells.temp?.[cells.g[burg.cell]] || 0) <= 0;
    const isNavigableLake = feature.type !== "lake" || !NON_NAVIGABLE_LAKE_GROUPS.has(feature.group);
    if (!isMulticell || !harbor || isFrozen || !isNavigableLake) return null;
    if (shouldSkipSmallLakePortFeature(pack, feature, options)) return null;
    const portFeatureId = feature.type === "lake" && feature.outlet ? resolveLakeDrainFeature(pack, featureId, riversById) || featureId : featureId;
    return {burg, haven, portFeatureId: Number(portFeatureId), landFeature, preferred: Boolean(isHarbor), source: "coast", harbor};
  }
  if (!isNavigableRiverCell(cells, burg.cell)) return null;
  const portFeatureId = resolveDrainFeature(pack, burg.cell, riversById);
  return portFeatureId ? {burg, haven: null, portFeatureId: Number(portFeatureId), landFeature, preferred: true, source: "river", harbor: 0} : null;
}

function describeRelocatedPortCandidate(pack, candidate, riversById) {
  const anchor = candidate.haven === null
    ? shiftTowardsRiverBank(pack, candidate.burg.cell, riversById)
    : getCloseToEdgePoint(pack, candidate.burg.cell, candidate.haven);
  return {
    port: candidate.portFeatureId,
    source: candidate.source,
    anchor,
    routePackCell: candidate.haven === null ? candidate.burg.cell : candidate.haven,
    reason: candidate.source === "river" ? "目标河道可通航" : "目标海岸可通航"
  };
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

function defineCityTypes(pack, cities, burgs, options = {}) {
  const preservedBurgIds = new Set(options.preservedBurgIds || []);
  const scaleContext = createCityScaleContext(cities, burgs);
  for (const city of cities) {
    if (!city || preservedBurgIds.has(Number(city.burgId))) continue;
    const burg = burgs[city.burgId];
    const type = getBurgType(pack, city.packCell, city.port);
    burg.type = type;
    city.type = type;
    city.group = deriveCityScale(city, scaleContext, burg);
    burg.group = city.group;
    assignCityCivilization(pack, city, burg);
  }
}

function specifyBurgs(pack, cities, burgs, nameGenerator, options = {}) {
  const preservedBurgIds = new Set(options.preservedBurgIds || []);
  const scaleContext = createCityScaleContext(cities, burgs);
  for (const city of cities) {
    if (!city || preservedBurgIds.has(Number(city.burgId))) continue;
    const burg = burgs[city.burgId];
    if (!burg?.i || burg.removed) continue;
    defineBurgFeatures(pack, burg);
    burg.group = defineBurgGroup(burg, scaleContext);
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
    syncCityVisual(pack, city, burg, scaleContext);
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

function syncCityVisual(pack, city, burg, scaleContext) {
  const cultureId = city.culture ?? burg?.culture ?? 0;
  const culture = pack?.cultures?.[cultureId] || null;
  const visual = resolveCityVisual(city, culture, burg?.visual, scaleContext, burg);
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

function defineBurgGroup(burg, scaleContext) {
  return deriveCityScale(burg, scaleContext);
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
  const commonVertices = (cells.v?.[landCell] || []).filter(vertex => (vertices?.c?.[vertex] || []).some(cell => cell === waterCell));

  if (commonVertices.length >= 2 && vertices?.p) {
    const [x1, y1] = vertices.p[commonVertices[0]];
    const [x2, y2] = vertices.p[commonVertices[1]];
    const xEdge = (x1 + x2) / 2;
    const yEdge = (y1 + y2) / 2;
    return [round(x0 + 0.95 * (xEdge - x0), 2), round(y0 + 0.95 * (yEdge - y0), 2)];
  }

  const [x1, y1] = cells.p[waterCell] || cells.p[landCell];
  return [round(x0 + 0.55 * (x1 - x0), 2), round(y0 + 0.55 * (y1 - y0), 2)];
}

function buildGridSettlements(grid, features, politics, riverCells, population, random, options = {}) {
  const landCells = grid.points
    .map((point, cell) => ({cell, point, height: grid.cells.h[cell], prec: grid.cells.prec[cell]}))
    .filter(item => isLandFeature(features, grid, item.cell));
  const cities = buildGridCities(grid, features, politics, riverCells, landCells, population, random, options);
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

function buildGridCities(grid, features, politics, riverCells, landCells, population, random, options = {}) {
  const nameGenerator = createChineseNameGenerator(`${grid.metadata.actualCells || grid.points.length}:grid`, {namebases: options.namebases});
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

  const cities = picked.map((item, id) => {
    const state = grid.cells.state[item.cell];
    const province = grid.cells.province[item.cell];
    const port = isCoastalCell(grid, features, item.cell) ? 1 : 0;
    const populationValue = population[item.cell] + (item.capital ? 90 : item.provincial ? 45 : 20);
    const group = deriveCityScale({population: populationValue});
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
  const scaleContext = createCityScaleContext(cities);
  for (const city of cities) {
    city.group = deriveCityScale(city, scaleContext);
    city.visual = defaultCityVisual(city, null, scaleContext);
  }
  return cities;
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
  const locked = prepareLockedRoutes(pack, options);
  const connections = locked.connections;
  const waterConnections = locked.waterConnections;
  const routes = locked.routes;
  const allocateRouteId = createRouteIdAllocator(locked.ids);
  const {burgs} = pack;
  const aliveBurgs = burgs.filter(burg => burg?.i && !burg.removed);
  const cityByBurg = new Map(cities.filter(city => city && !city.removed).map(city => [Number(city.burgId), city]));
  const capitalBurgs = groupCapitalBurgs(aliveBurgs, grid, pack);
  const trailBurgs = selectTrailRouteNetworkBurgs(aliveBurgs, pack, routeNetworkEndpointBudget(aliveBurgs.length, "trail"));
  const burgsByProvinceAndLand = groupBurgsByProvinceAndLand(trailBurgs, pack);
  const landBurgAnchors = groupBurgs(aliveBurgs.filter(burg => landFeatureAtBurg(pack, burg)), burg => landFeatureAtBurg(pack, burg));
  const ports = aliveBurgs.filter(burg => burg.port);
  const pointsArray = preparePackRoutePoints(pack, cityByBurg);
  const variation = createRouteVariation(pack, options);
  const search = createRouteSearchScratch(pack.cells.i.length);
  const edgeKeyMultiplier = pack.cells.i.length + 1;
  const riverEdges = buildRiverEdges(pack);
  const selectedSeaBurgs = selectSeaRouteNetworkBurgs(ports, routeNetworkEndpointBudget(ports.length, "searoute"));
  const seaBurgs = ensureReachableSeaRouteBurgs(pack, ports, selectedSeaBurgs, search, edgeKeyMultiplier, riverEdges);
  const portsByFeature = groupBurgs(seaBurgs, burg => burg.port);
  const landNetworkCells = collectLandNetworkCells(routes, pack);

  const roadSegments = mergeRouteSegments(generateRouteSegments({pack, connections, groups: capitalBurgs, water: false, routeType: "road", variation, search, edgeKeyMultiplier, riverEdges, maxVisited: pack.cells.i.length}));
  for (const segment of roadSegments) {
    addPackRoute({routes, pack, segment, type: "road", pointsArray, cityByBurg, allocateRouteId});
    registerLandNetworkCells(landNetworkCells, pack, segment.cells);
  }

  const seaSegments = mergeRouteSegments(generateRouteSegments({pack, connections, groups: portsByFeature, water: true, routeType: "searoute", variation, search, edgeKeyMultiplier, riverEdges}));
  for (const segment of seaSegments) {
    addPackRoute({routes, pack, segment, type: "searoute", pointsArray, cityByBurg, allocateRouteId});
    addConnections(segment.cells, waterConnections, edgeKeyMultiplier);
  }

  for (const {feature, burgs: provinceBurgs} of burgsByProvinceAndLand) {
    if (!provinceBurgs.length) continue;
    const anchoredBurgs = addLandNetworkAnchor(provinceBurgs, feature, landNetworkCells, pack, landBurgAnchors);
    if (anchoredBurgs.length < 2) continue;
    const groups = new Map([[feature, anchoredBurgs]]);
    const trailSegments = mergeRouteSegments(generateRouteSegments({pack, connections, groups, water: false, routeType: "trail", variation, search, edgeKeyMultiplier, riverEdges, maxVisited: pack.cells.i.length, blockedConnections: waterConnections}));
    for (const segment of trailSegments) {
      addPackRoute({routes, pack, segment, type: "trail", pointsArray, cityByBurg, allocateRouteId});
      registerLandNetworkCells(landNetworkCells, pack, segment.cells);
    }
  }

  pack.routes = buildPackRouteMirror(routes);
  pack.cells.routes = buildPackRouteLinks(routes, locked.edgeOwners);
  return routes;
}

function ensureReachableSeaRouteBurgs(pack, ports, selected, search, edgeKeyMultiplier, riverEdges) {
  const result = [...selected];
  const selectedIds = new Set(result.map(burg => Number(burg.i)));
  const allGroups = groupBurgs(ports, burg => burg.port);
  const selectedGroups = groupBurgs(result, burg => burg.port);

  for (const [feature, burgs] of [...allGroups.entries()].sort(([left], [right]) => Number(left) - Number(right))) {
    if (burgs.length < 2 || hasReachableSeaRoutePair(pack, selectedGroups.get(feature) || [], search, edgeKeyMultiplier, riverEdges)) continue;
    const pair = firstReachableSeaRoutePair(pack, burgs, search, edgeKeyMultiplier, riverEdges);
    if (!pair) continue;
    for (const burg of pair) {
      if (selectedIds.has(Number(burg.i))) continue;
      selectedIds.add(Number(burg.i));
      result.push(burg);
    }
  }
  return result;
}

function hasReachableSeaRoutePair(pack, burgs, search, edgeKeyMultiplier, riverEdges) {
  return Boolean(firstReachableSeaRoutePair(pack, burgs, search, edgeKeyMultiplier, riverEdges));
}

function firstReachableSeaRoutePair(pack, burgs, search, edgeKeyMultiplier, riverEdges) {
  const points = burgs.map(burg => pack.cells.p?.[burg.cell] || [burg.x, burg.y]);
  const pairs = [];
  for (let from = 0; from < burgs.length; from++) {
    for (let to = from + 1; to < burgs.length; to++) pairs.push(routeCandidateEdge(from, to, points));
  }
  pairs.sort(compareRouteCandidateEdges);
  for (const {from, to} of pairs) {
    const path = tracePackPath(pack, burgs[from].cell, burgs[to].cell, true, new Set(), null, search, edgeKeyMultiplier, riverEdges, pack.cells.i.length);
    if (path.length > 1) return [burgs[from], burgs[to]];
  }
  return null;
}

function prepareLockedRoutes(pack, options) {
  const provided = options.lockedRoutes ?? options.preservedRoutes ?? [];
  if (!Array.isArray(provided)) throw routeLockConflict("锁定道路约束必须是数组", {reason: "invalid-constraint"});

  const routes = [];
  const ids = new Set();
  const connections = new Set();
  const waterConnections = new Set();
  const lockedEdgeCandidates = new Map();
  const edgeKeyMultiplier = pack.cells.i.length + 1;

  for (const source of provided) {
    if (!source || typeof source !== "object") throw routeLockConflict("锁定道路约束包含空对象", {reason: "invalid-route"});
    const route = structuredClone(source);
    const id = Number(route.id ?? route.i);
    if (!Number.isInteger(id) || id < 0) throw routeLockConflict("锁定道路缺少有效 ID", {reason: "invalid-id", id: route.id ?? route.i});
    if (ids.has(id)) throw routeLockConflict(`锁定道路 ID #${id} 重复`, {reason: "duplicate-id", id});

    const packCells = route.packCells;
    if (!Array.isArray(packCells) || packCells.length < 2) {
      throw routeLockConflict(`锁定道路 #${id} 缺少有效路径`, {reason: "invalid-path", id});
    }
    if (!Array.isArray(route.points) || route.points.length !== packCells.length || !Array.isArray(route.cells) || route.cells.length !== packCells.length) {
      throw routeLockConflict(`锁定道路 #${id} 的路径镜像不完整`, {reason: "incomplete-path-mirror", id});
    }

    for (let index = 0; index < packCells.length; index++) {
      const cell = Number(packCells[index]);
      if (!Number.isInteger(cell) || cell < 0 || cell >= pack.cells.i.length) {
        throw routeLockConflict(`锁定道路 #${id} 包含无效 cell`, {reason: "invalid-cell", id, cell: packCells[index]});
      }
      packCells[index] = cell;
      if (index === 0) continue;
      const previous = packCells[index - 1];
      if (!(pack.cells.c?.[previous] || []).includes(cell)) {
        throw routeLockConflict(`锁定道路 #${id} 的路径不连续`, {reason: "disconnected-path", id, from: previous, to: cell});
      }
      const edge = routeEdgeKey(previous, cell, edgeKeyMultiplier);
      connections.add(edge);
      if (route.type === "searoute") waterConnections.add(edge);
      const candidate = lockedEdgeCandidates.get(edge) || {
        from: previous,
        to: cell,
        ids: [],
        currentOwner: Number(pack.cells.routes?.[previous]?.[cell])
      };
      candidate.ids.push(id);
      lockedEdgeCandidates.set(edge, candidate);
    }

    route.id = id;
    ids.add(id);
    routes.push(route);
  }

  const edgeOwners = [...lockedEdgeCandidates.values()].map(candidate => ({
    from: candidate.from,
    to: candidate.to,
    routeId: candidate.ids.includes(candidate.currentOwner)
      ? candidate.currentOwner
      : Math.min(...candidate.ids)
  }));
  return {routes, ids, connections, waterConnections, edgeOwners};
}

function createRouteIdAllocator(reservedIds) {
  let candidate = 0;
  return () => {
    while (reservedIds.has(candidate)) candidate++;
    const id = candidate;
    reservedIds.add(id);
    candidate++;
    return id;
  };
}

function routeLockConflict(message, details) {
  const error = new Error(message);
  error.code = "regeneration_lock_conflict";
  error.details = {domain: "routes", ...details};
  return error;
}

function generateRouteSegments({
  pack,
  connections,
  groups,
  water,
  routeType = water ? "searoute" : "road",
  variation = null,
  search,
  edgeKeyMultiplier,
  riverEdges = null,
  maxVisited = null,
  blockedConnections = null
}) {
  const routeSegments = [];
  const entries = [...groups.entries()].sort(([a], [b]) => Number(a) - Number(b));

  for (const [feature, burgs] of entries) {
    const points = burgs.map(burg => routeCandidatePoint(burg, variation, water));
    const edges = selectRouteEdges(calculateUrquhartEdges(points), points, water, routeType);

    let createdForGroup = 0;

    for (const [fromId, toId] of edges) {
      const start = burgs[fromId].cell;
      const end = burgs[toId].cell;
      const pathCells = tracePackPath(pack, start, end, water, connections, variation, search, edgeKeyMultiplier, riverEdges, maxVisited, blockedConnections);

      for (const cells of getRouteSegments(pathCells, connections, edgeKeyMultiplier)) {
        addConnections(cells, connections, edgeKeyMultiplier);
        routeSegments.push({feature: Number(feature), cells, fromBurg: burgs[fromId].i, toBurg: burgs[toId].i});
        createdForGroup++;
      }
    }

    if (!water || createdForGroup || burgs.length < 2) continue;
    const fallbackEdges = [];
    for (let from = 0; from < burgs.length; from++) {
      for (let to = from + 1; to < burgs.length; to++) {
        fallbackEdges.push(routeCandidateEdge(from, to, points));
      }
    }
    fallbackEdges.sort(compareRouteCandidateEdges);
    for (const {from, to} of fallbackEdges) {
      const pathCells = tracePackPath(pack, burgs[from].cell, burgs[to].cell, true, connections, variation, search, edgeKeyMultiplier, riverEdges, maxVisited, blockedConnections);
      const segments = getRouteSegments(pathCells, connections, edgeKeyMultiplier);
      if (!segments.length) continue;
      for (const cells of segments) {
        addConnections(cells, connections, edgeKeyMultiplier);
        routeSegments.push({feature: Number(feature), cells, fromBurg: burgs[from].i, toBurg: burgs[to].i});
      }
      break;
    }
  }

  return routeSegments;
}

export function selectRouteEdges(edges, points, water, routeType = null) {
  if (routeType === "trail" || routeType === "searoute") return selectSparseRouteNetworkEdges(edges, points);
  if (!water || edges.length < 12) return edges;
  const keep = Math.max(1, Math.round(edges.length * 0.65));
  if (keep >= edges.length) return edges;
  return [...edges]
    .sort((left, right) => distanceSquared(points[left[0]], points[left[1]]) - distanceSquared(points[right[0]], points[right[1]]))
    .slice(0, keep);
}

export function selectSparseRouteNetworkEdges(edges, points) {
  const pointCount = points.length;
  if (pointCount < 2) return [];

  const candidates = normalizeRouteCandidateEdges(edges, points);
  const selected = [];
  const selectedKeys = new Set();
  const parent = Array.from({length: pointCount}, (_, index) => index);
  const rank = new Uint8Array(pointCount);

  for (const candidate of candidates) {
    if (!unionRouteCandidateComponents(parent, rank, candidate.from, candidate.to)) continue;
    selected.push([candidate.from, candidate.to]);
    selectedKeys.add(candidate.key);
    if (selected.length === pointCount - 1) break;
  }

  if (selected.length < pointCount - 1) {
    const fallback = [];
    for (let from = 0; from < pointCount; from++) {
      for (let to = from + 1; to < pointCount; to++) {
        if (findRouteCandidateComponent(parent, from) === findRouteCandidateComponent(parent, to)) continue;
        fallback.push(routeCandidateEdge(from, to, points));
      }
    }
    fallback.sort(compareRouteCandidateEdges);
    for (const candidate of fallback) {
      if (!unionRouteCandidateComponents(parent, rank, candidate.from, candidate.to)) continue;
      selected.push([candidate.from, candidate.to]);
      selectedKeys.add(candidate.key);
      if (selected.length === pointCount - 1) break;
    }
  }

  const degree = new Uint16Array(pointCount);
  for (const [from, to] of selected) {
    degree[from]++;
    degree[to]++;
  }
  const extraLimit = pointCount >= 12 ? Math.min(4, Math.floor(Math.sqrt(pointCount) / 3)) : 0;
  let extras = 0;
  for (const candidate of candidates) {
    if (extras >= extraLimit) break;
    if (selectedKeys.has(candidate.key)) continue;
    if (degree[candidate.from] >= 6 || degree[candidate.to] >= 6) continue;
    selected.push([candidate.from, candidate.to]);
    selectedKeys.add(candidate.key);
    degree[candidate.from]++;
    degree[candidate.to]++;
    extras++;
  }

  return selected;
}

export function routeNetworkEndpointBudget(pointCount, routeType) {
  const count = Math.max(0, Math.floor(Number(pointCount) || 0));
  if (count < 2) return count;
  const minimum = routeType === "searoute" ? 12 : 24;
  const scale = routeType === "searoute" ? 3 : 4;
  return Math.min(count, Math.max(minimum, Math.ceil(Math.sqrt(count) * scale)));
}

export function selectRouteNetworkBurgs(burgs, budget) {
  if (burgs.length <= budget) return burgs;
  return [...burgs]
    .sort(compareRouteNetworkBurgs)
    .slice(0, budget);
}

export function selectSeaRouteNetworkBurgs(burgs, budget) {
  if (burgs.length <= budget) return burgs;
  const groups = [...groupBurgs(burgs, burg => burg.port).entries()]
    .filter(([, groupBurgs]) => groupBurgs.length >= 2)
    .map(([feature, groupBurgs]) => ({feature: Number(feature), burgs: [...groupBurgs].sort(compareRouteNetworkBurgs), next: 0}))
    .sort((left, right) => compareRouteNetworkBurgs(left.burgs[0], right.burgs[0]) || left.feature - right.feature);
  return selectPairedRouteNetworkGroups(groups, budget);
}

export function selectTrailRouteNetworkBurgs(burgs, pack, budget) {
  const groups = groupBurgsByProvinceAndLand(burgs, pack)
    .map(group => ({...group, burgs: [...group.burgs].sort(compareRouteNetworkBurgs), remaining: []}))
    .sort((left, right) => compareRouteNetworkBurgs(left.burgs[0], right.burgs[0]) || left.province - right.province || left.feature - right.feature);
  const selected = [];
  const participating = [];

  for (const group of groups) {
    const required = group.burgs.filter(burg => burg.capital || burg.provincial);
    if (group.burgs.length >= 2) {
      for (const burg of group.burgs) {
        if (required.length >= 2) break;
        if (!required.includes(burg)) required.push(burg);
      }
    }
    if (!required.length) continue;
    const requiredIds = new Set(required.map(burg => Number(burg.i)));
    selected.push(...required);
    group.remaining = group.burgs.filter(burg => !requiredIds.has(Number(burg.i)));
    if (group.remaining.length) participating.push(group);
  }

  const target = Math.max(selected.length, budget);
  let added = true;
  while (selected.length < target && added) {
    added = false;
    for (const group of participating) {
      if (selected.length >= target || !group.remaining.length) continue;
      selected.push(group.remaining.shift());
      added = true;
    }
  }
  return selected;
}

function selectPairedRouteNetworkGroups(groups, budget) {
  const selected = [];
  const participating = [];

  for (const group of groups) {
    if (selected.length + 2 > budget) break;
    selected.push(group.burgs[0], group.burgs[1]);
    group.next = 2;
    participating.push(group);
  }

  let added = true;
  while (selected.length < budget && added) {
    added = false;
    for (const group of participating) {
      if (selected.length >= budget || group.next >= group.burgs.length) continue;
      selected.push(group.burgs[group.next++]);
      added = true;
    }
  }
  return selected;
}

function compareRouteNetworkBurgs(left, right) {
  return Number(Boolean(right.capital)) - Number(Boolean(left.capital))
    || Number(Boolean(right.provincial)) - Number(Boolean(left.provincial))
    || Number(Boolean(right.port)) - Number(Boolean(left.port))
    || Number(right.population || 0) - Number(left.population || 0)
    || Number(left.i) - Number(right.i);
}

function normalizeRouteCandidateEdges(edges, points) {
  const normalized = new Map();
  for (const edge of edges) {
    const left = Number(edge?.[0]);
    const right = Number(edge?.[1]);
    if (!Number.isInteger(left) || !Number.isInteger(right) || left === right) continue;
    if (left < 0 || right < 0 || left >= points.length || right >= points.length) continue;
    const candidate = routeCandidateEdge(left, right, points);
    if (!Number.isFinite(candidate.distance) || normalized.has(candidate.key)) continue;
    normalized.set(candidate.key, candidate);
  }
  return [...normalized.values()].sort(compareRouteCandidateEdges);
}

function routeCandidateEdge(left, right, points) {
  const from = Math.min(left, right);
  const to = Math.max(left, right);
  return {from, to, key: `${from}:${to}`, distance: distanceSquared(points[from], points[to])};
}

function compareRouteCandidateEdges(left, right) {
  return left.distance - right.distance || left.from - right.from || left.to - right.to;
}

function findRouteCandidateComponent(parent, node) {
  let root = node;
  while (parent[root] !== root) root = parent[root];
  while (parent[node] !== node) {
    const next = parent[node];
    parent[node] = root;
    node = next;
  }
  return root;
}

function unionRouteCandidateComponents(parent, rank, left, right) {
  let leftRoot = findRouteCandidateComponent(parent, left);
  let rightRoot = findRouteCandidateComponent(parent, right);
  if (leftRoot === rightRoot) return false;
  if (rank[leftRoot] < rank[rightRoot]) [leftRoot, rightRoot] = [rightRoot, leftRoot];
  parent[rightRoot] = leftRoot;
  if (rank[leftRoot] === rank[rightRoot]) rank[leftRoot]++;
  return true;
}

function tracePackPath(pack, start, end, water, connections, variation = null, search = createRouteSearchScratch(pack.cells.i.length), edgeKeyMultiplier = pack.cells.i.length + 1, riverEdges = null, maxVisitedOverride = null, blockedConnections = null) {
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
      if (blockedConnections?.has(routeEdgeKey(current, neighbor, edgeKeyMultiplier))) continue;
      if (neighbor === end && !water) {
        search.cameFrom[neighbor] = current;
        return reconstructPath(search.cameFrom, neighbor);
      }
      if (neighbor === end && water && pack.cells.h?.[end] >= 20 && canReachWaterRouteExit(pack, current, end, riverEdges)) {
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
  return Boolean(haven) && current === haven;
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
        if (!haven || haven !== next) return Infinity;
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

function preparePackRoutePoints(pack, cityByBurg) {
  return pack.cells.p.map(([x, y], cell) => {
    const burgId = Number(pack.cells.burg?.[cell]);
    const city = cityByBurg.get(burgId);
    const burg = pack.burgs?.[burgId];
    const valid = city
      && burg
      && !burg.removed
      && Number(city.burgId) === burgId
      && Number(city.packCell) === cell
      && Number(burg.cell) === cell
      && Number(pack.cells.g?.[cell]) === Number(city.cell)
      && Number.isFinite(Number(city.x))
      && Number.isFinite(Number(city.y));
    return valid ? [Number(city.x), Number(city.y)] : [x, y];
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
      const occupied = new Set(current.cells);
      if (next.cells.slice(1).some(cell => occupied.has(cell))) continue;
      current.cells = current.cells.concat(next.cells.slice(1));
      next.merged = true;
      mergedCount++;
    }
  }

  return mergedCount > 0 ? mergeRouteSegments(segments) : segments;
}

function addPackRoute({routes, pack, segment, type, pointsArray, cityByBurg, allocateRouteId}) {
  if (segment.merged || segment.cells.length < 2) return;
  const parts = type === "searoute" ? splitSeaRouteCells(pack, segment.cells) : [segment.cells];

  for (const cells of parts) addPackRoutePart({routes, pack, cells, type, feature: segment.feature, pointsArray, cityByBurg, allocateRouteId});
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

function addPackRoutePart({routes, pack, cells, type, feature, pointsArray, cityByBurg, allocateRouteId}) {
  const id = allocateRouteId();
  const {burg: fromBurg, city: fromCity} = resolvePackRouteEndpoint(pack, cityByBurg, cells[0]);
  const {burg: toBurg, city: toCity} = resolvePackRouteEndpoint(pack, cityByBurg, cells.at(-1));
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
    fromProvincial: Boolean(fromCity?.provincial),
    toProvincial: Boolean(toCity?.provincial),
    administrativePriority: fromCity?.capital || toCity?.capital
      ? "national"
      : fromCity?.provincial || toCity?.provincial
        ? "provincial"
        : "ordinary",
    cells: cells.map(cell => pack.cells.g[cell]),
    packCells: cells,
    resourceCells: resources.resourceCells,
    markerResourceCells: resources.markerResourceCells,
    resourceGoodIds: resources.goodIds,
    points: cells.map(cell => pointsArray[cell])
  });
}

function resolvePackRouteEndpoint(pack, cityByBurg, packCell) {
  const burgId = Number(pack.cells.burg?.[packCell]);
  const burg = pack.burgs?.[burgId];
  const city = cityByBurg.get(burgId);
  const valid = Number.isInteger(packCell)
    && Number.isInteger(burgId)
    && burgId > 0
    && city
    && !city.removed
    && burg
    && !burg.removed
    && Number(burg.i ?? burg.id) === burgId
    && Number(city.burgId) === burgId
    && Number(city.packCell) === packCell
    && Number(burg.cell) === packCell
    && Number(pack.cells.g?.[packCell]) === Number(city.cell);
  return valid ? {burg, city} : {burg: null, city: null};
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
    if (!city) continue;
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

function groupCapitalBurgs(burgs, grid, pack) {
  const capitals = burgs.filter(burg => burg?.capital);
  if (getGridLandRatio(grid) < 0.09) capitals.sort((a, b) => (b.population || 0) - (a.population || 0)).splice(18);
  const groups = groupBurgs(capitals, burg => landFeatureAtBurg(pack, burg));
  for (const [feature, featureCapitals] of groups) {
    if (featureCapitals.length < 2) groups.delete(feature);
  }
  return groups;
}

function groupBurgsByProvinceAndLand(burgs, pack) {
  const groups = new Map();
  for (const burg of burgs) {
    const province = burgProvinceKey(burg);
    const feature = landFeatureAtBurg(pack, burg);
    if (!province || !feature) continue;
    const key = `${province}:${feature}`;
    if (!groups.has(key)) groups.set(key, {province, feature, burgs: []});
    groups.get(key).burgs.push(burg);
  }
  return [...groups.values()].sort((left, right) => left.feature - right.feature || Number(left.burgs.length < 2) - Number(right.burgs.length < 2) || left.province - right.province);
}

function landFeatureAtBurg(pack, burg) {
  const cell = Number(burg?.cell);
  return Number.isInteger(cell) && pack.cells.h?.[cell] >= 20 ? Number(pack.cells.f?.[cell]) || 0 : 0;
}

function collectLandNetworkCells(routes, pack) {
  const network = new Map();
  for (const route of routes) {
    if (!route || route.type === "searoute") continue;
    registerLandNetworkCells(network, pack, route.packCells);
  }
  return network;
}

function registerLandNetworkCells(network, pack, cells) {
  for (const cell of cells || []) {
    if (pack.cells.h?.[cell] < 20) continue;
    const feature = Number(pack.cells.f?.[cell]) || 0;
    if (!feature) continue;
    if (!network.has(feature)) network.set(feature, new Set());
    network.get(feature).add(cell);
  }
}

function addLandNetworkAnchor(burgs, feature, network, pack, fallbackAnchors = new Map()) {
  const featureNetwork = network.get(feature);
  if (!featureNetwork?.size) {
    if (burgs.length >= 2) return burgs;
    const fallbackCells = (fallbackAnchors.get(feature) || []).map(burg => burg.cell).filter(cell => cell !== burgs[0]?.cell);
    return appendNearestLandNetworkAnchor(burgs, fallbackCells, pack);
  }
  if (burgs.some(burg => featureNetwork.has(burg.cell))) return burgs;

  return appendNearestLandNetworkAnchor(burgs, featureNetwork, pack);
}

function appendNearestLandNetworkAnchor(burgs, candidates, pack) {
  let anchorCell = -1;
  let bestDistance = Infinity;
  for (const burg of burgs) {
    const origin = pack.cells.p[burg.cell];
    for (const cell of candidates) {
      const candidateDistance = distanceSquared(origin, pack.cells.p[cell]);
      if (candidateDistance > bestDistance || candidateDistance === bestDistance && cell >= anchorCell) continue;
      bestDistance = candidateDistance;
      anchorCell = cell;
    }
  }
  if (anchorCell < 0) return burgs;

  const [x, y] = pack.cells.p[anchorCell];
  return [...burgs, {i: 0, cell: anchorCell, x, y, state: 0, province: 0}];
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

function buildPackRouteLinks(routes, protectedEdgeOwners = []) {
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
  for (const {from, to, routeId} of protectedEdgeOwners) {
    if (!links[from]) links[from] = {};
    if (!links[to]) links[to] = {};
    links[from][to] = routeId;
    links[to][from] = routeId;
  }
  return links;
}

function buildPackRouteMirror(routes) {
  const mirror = [];
  for (const route of routes) {
    mirror[route.id] = {
      i: route.id,
      group: route.type === "road" ? "roads" : route.type === "trail" ? "trails" : "searoutes",
      feature: route.feature,
      state: route.state,
      province: route.province,
      from: route.from,
      to: route.to,
      fromProvincial: route.fromProvincial,
      toProvincial: route.toProvincial,
      administrativePriority: route.administrativePriority,
      resourceCells: route.resourceCells || 0,
      markerResourceCells: route.markerResourceCells || 0,
      points: route.points.map((point, index) => [point[0], point[1], route.packCells[index]])
    };
  }
  return fillIdentityArrayHoles(mirror);
}

function fillIdentityArrayHoles(values) {
  for (let index = 0; index < values.length; index++) {
    if (!Object.hasOwn(values, index)) values[index] = null;
  }
  return values;
}

function createRoute(grid, features, from, to, type, id) {
  const cells = traceLandPath(grid, features, from.cell, to.cell);
  return {
    id,
    type,
    level: routeLevel(type, from, to),
    from: from.id,
    to: to.id,
    fromProvincial: Boolean(from.provincial),
    toProvincial: Boolean(to.provincial),
    administrativePriority: from.capital || to.capital
      ? "national"
      : from.provincial || to.provincial
        ? "provincial"
        : "ordinary",
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

function pruneNeutralSettlements(grid, settlements, pack, options = {}) {
  const kept = [];
  const protectedCityIds = snapshotIds(options.lockedCities || options.preservedCities);
  const reservedIds = new Set();
  for (const city of settlements.cities || []) {
    if (!city || city.removed || (city.state || 0) <= 0 || !protectedCityIds.has(Number(city.id))) continue;
    const id = Number(city.id);
    kept[id] = city;
    reservedIds.add(id);
  }
  let nextId = 0;
  for (const city of settlements.cities || []) {
    if (!city) continue;
    if ((city.state || 0) > 0) {
      if (!protectedCityIds.has(Number(city.id))) {
        while (reservedIds.has(nextId) || kept[nextId]) nextId++;
        city.id = nextId;
        kept[nextId] = city;
        nextId++;
      }
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
      if (!city) continue;
      if (Number.isInteger(city.packCell) && city.packCell >= 0) pack.cells.burg[city.packCell] = city.burgId;
    }
  }
  if (grid?.cells?.burg) {
    grid.cells.burg = new Array(grid.points.length).fill(-1);
    for (const city of kept) if (city) grid.cells.burg[city.cell] = city.id;
  }
}

function mirrorCitiesToGrid(grid, cities) {
  grid.cells.burg = new Array(grid.points.length).fill(-1);
  for (const city of cities) {
    if (!city || city.removed) continue;
    grid.cells.burg[city.cell] = city.id;
  }
}

function mirrorGridBurgsToPack(pack, cities) {
  if (!pack.cells.burg) pack.cells.burg = new Uint16Array(pack.cells.i.length);
  for (const city of cities) {
    if (!city || city.removed) continue;
    if (Number.isInteger(city.packCell) && city.packCell >= 0) pack.cells.burg[city.packCell] = city.burgId;
  }
}

function syncPoliticalSettlementStats(pack, politics, cities, options = {}) {
  const protectedStateIds = snapshotIds(options.lockedStates);
  const protectedProvinceIds = snapshotIds(options.lockedProvinces);
  for (const states of new Set([politics?.states, pack?.states].filter(Boolean))) {
    syncStateSettlementStats(pack, states, protectedStateIds);
  }
  for (const provinces of new Set([politics?.provinces, pack?.provinces].filter(Boolean))) {
    syncProvinceSettlementStats(pack, provinces, protectedProvinceIds);
  }
  synchronizeSettlementPoliticalOwnership(pack, cities, options);
}

function synchronizeSettlementPoliticalOwnership(pack, cities, options = {}) {
  const protectedCityIds = snapshotIds(options.lockedCities || options.preservedCities);
  const protectedProvinceIds = snapshotIds(options.lockedProvinces);
  for (const city of cities) {
    if (!city || city.removed) continue;
    if (protectedCityIds.has(Number(city.id))) continue;
    const burg = pack.burgs?.[city.burgId];
    if (!burg) continue;
    const nextProvince = pack.cells.province?.[city.packCell] ?? city.province;
    if (protectedProvinceIds.has(Number(city.province)) || protectedProvinceIds.has(Number(nextProvince))) continue;
    city.state = burg.state;
    city.province = nextProvince;
    burg.province = city.province;
    if (!(Number(city.province) > 0)) {
      city.provincial = false;
      burg.provincial = 0;
    }
  }
}

function syncStateSettlementStats(pack, states, protectedIds = new Set()) {
  for (const state of states) {
    if (!state || protectedIds.has(Number(state.i ?? state.id))) continue;
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
    if (!state || protectedIds.has(Number(state.i ?? state.id))) continue;
    state.rural += pack.cells.pop?.[cell] || 0;
    const burg = pack.burgs?.[pack.cells.burg?.[cell]];
    if (burg?.i && !burg.removed) {
      state.burgs++;
      state.urban += burg.population || 0;
      addCivilizationWeight(state, burg);
    }
  }

  for (const state of states) {
    if (!state || protectedIds.has(Number(state.i ?? state.id))) continue;
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

function syncProvinceSettlementStats(pack, provinces, protectedIds = new Set()) {
  for (const province of provinces) {
    if (!province || protectedIds.has(Number(province.i ?? province.id))) continue;
    province.burgs = 0;
    province.rural = 0;
    province.urban = 0;
  }

  for (const cell of pack.cells.i) {
    if (pack.cells.h[cell] < 20) continue;
    const province = provinces[pack.cells.province?.[cell]];
    if (!province || protectedIds.has(Number(province.i ?? province.id))) continue;
    province.rural += pack.cells.pop?.[cell] || 0;
    const burg = pack.burgs?.[pack.cells.burg?.[cell]];
    if (burg?.i && !burg.removed) {
      province.burgs++;
      province.urban += burg.population || 0;
    }
  }

  for (const province of provinces) {
    if (!province || protectedIds.has(Number(province.i ?? province.id))) continue;
    province.rural = round(province.rural || 0, 2);
    province.urban = round(province.urban || 0, 2);
  }
}

function snapshotIds(snapshots = []) {
  return new Set((snapshots || []).map(item => Number(item?.i ?? item?.id)).filter(Number.isInteger));
}

function collectProtectedSettlementCells(pack, options = {}) {
  const protectedStates = snapshotIds(options.lockedStates);
  const protectedProvinces = snapshotIds(options.lockedProvinces);
  const protectedFeatures = snapshotIds(options.lockedFeatures);
  const cells = new Set();
  for (const cell of pack?.cells?.i || []) {
    if (protectedStates.has(Number(pack.cells.state?.[cell]))
      || protectedProvinces.has(Number(pack.cells.province?.[cell]))
      || protectedFeatures.has(Number(pack.cells.f?.[cell]))) {
      cells.add(cell);
    }
  }
  return cells;
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
