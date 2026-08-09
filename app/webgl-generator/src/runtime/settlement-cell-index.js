const INDEX_BY_MAP = new WeakMap();

export function getSettlementCellIndex(map) {
  if (!map || typeof map !== "object") return emptyIndex();
  const cached = INDEX_BY_MAP.get(map);
  if (cached
    && cached.cities === map.settlements?.cities
    && cached.burgs === map.pack?.burgs
    && cached.routes === map.settlements?.routes
    && cached.cityLength === (map.settlements?.cities?.length || 0)
    && cached.burgLength === (map.pack?.burgs?.length || 0)
    && cached.routeLength === (map.settlements?.routes?.length || 0)) return cached;
  return rebuildSettlementCellIndex(map);
}

export function rebuildSettlementCellIndex(map, {syncLegacy = false} = {}) {
  const cityIdsByGridCell = new Map();
  const burgIdsByPackCell = new Map();
  const routesByCityId = new Map();
  const inactiveCityIds = new Set();
  const inactiveBurgIds = new Set();
  for (const city of map?.settlements?.cities || []) {
    if (!city || !Number.isInteger(Number(city.id)) || !Number.isInteger(Number(city.cell))) continue;
    if (city.removed) {
      inactiveCityIds.add(Number(city.id));
      continue;
    }
    addBucketValue(cityIdsByGridCell, Number(city.cell), Number(city.id));
  }
  for (const burg of map?.pack?.burgs || []) {
    const id = Number(burg?.i ?? burg?.id);
    if (!burg || !Number.isInteger(id) || id <= 0 || !Number.isInteger(Number(burg.cell))) continue;
    if (burg.removed) {
      inactiveBurgIds.add(id);
      continue;
    }
    addBucketValue(burgIdsByPackCell, Number(burg.cell), id);
  }
  for (const route of map?.settlements?.routes || []) {
    if (!route || route.removed) continue;
    if (!Number.isInteger(routeId(route)) || routeId(route) < 0) continue;
    for (const cityId of uniqueIds([route.from, route.to])) addBucketValue(routesByCityId, cityId, route, routeId);
  }
  const index = {
    cities: map?.settlements?.cities || null,
    burgs: map?.pack?.burgs || null,
    routes: map?.settlements?.routes || null,
    cityLength: map?.settlements?.cities?.length || 0,
    burgLength: map?.pack?.burgs?.length || 0,
    routeLength: map?.settlements?.routes?.length || 0,
    cityIdsByGridCell,
    burgIdsByPackCell,
    routesByCityId,
    inactiveCityIds,
    inactiveBurgIds
  };
  INDEX_BY_MAP.set(map, index);
  if (syncLegacy) syncAllLegacyRepresentatives(map, index);
  return index;
}

export function invalidateSettlementCellIndex(map) {
  if (map && typeof map === "object") INDEX_BY_MAP.delete(map);
}

export function refreshRoutesInSettlementCellIndex(map, routeIds) {
  const index = INDEX_BY_MAP.get(map);
  if (!index) return;
  const ids = new Set([...(routeIds || [])].map(Number).filter(Number.isInteger));
  if (!ids.size) return;
  for (const [cityId, routes] of index.routesByCityId) {
    const retained = routes.filter(route => !ids.has(routeId(route)));
    if (retained.length) index.routesByCityId.set(cityId, retained);
    else index.routesByCityId.delete(cityId);
  }
  for (const route of map?.settlements?.routes || []) {
    if (!route || route.removed || !ids.has(routeId(route))) continue;
    for (const cityId of uniqueIds([route.from, route.to])) addBucketValue(index.routesByCityId, cityId, route, routeId);
  }
  index.routes = map?.settlements?.routes || null;
  index.routeLength = map?.settlements?.routes?.length || 0;
}

export function cityIdsAtGridCell(map, gridCell) {
  const index = getSettlementCellIndex(map);
  reviveInactiveCities(map, index);
  return [...normalizeCityBucket(map, index, Number(gridCell))];
}

export function burgIdsAtPackCell(map, packCell) {
  const index = getSettlementCellIndex(map);
  reviveInactiveBurgs(map, index);
  return [...normalizeBurgBucket(map, index, Number(packCell))];
}

export function routesAtCity(map, cityId) {
  const id = Number(cityId);
  if (!Number.isInteger(id) || id < 0) return [];
  const index = getSettlementCellIndex(map);
  const routes = (index.routesByCityId.get(id) || []).filter(route => route && !route.removed
    && (Number(route.from) === id || Number(route.to) === id));
  if (routes.length) index.routesByCityId.set(id, routes);
  else index.routesByCityId.delete(id);
  return [...routes];
}

export function moveSettlementInCellIndex(map, {cityId, burgId, sourceGridCell, sourcePackCell, targetGridCell, targetPackCell}) {
  const index = getSettlementCellIndex(map);
  reviveInactiveCities(map, index);
  reviveInactiveBurgs(map, index);
  normalizeCityBucket(map, index, Number(sourceGridCell));
  normalizeCityBucket(map, index, Number(targetGridCell));
  normalizeBurgBucket(map, index, Number(sourcePackCell));
  normalizeBurgBucket(map, index, Number(targetPackCell));
  moveBucketValue(index.cityIdsByGridCell, Number(sourceGridCell), Number(targetGridCell), Number(cityId));
  moveBucketValue(index.burgIdsByPackCell, Number(sourcePackCell), Number(targetPackCell), Number(burgId));
  syncLegacyRepresentatives(map, {
    gridCells: [sourceGridCell, targetGridCell],
    packCells: [sourcePackCell, targetPackCell]
  }, index);
  return index;
}

export function syncLegacyRepresentatives(map, {gridCells = [], packCells = []} = {}, index = getSettlementCellIndex(map)) {
  reviveInactiveCities(map, index);
  reviveInactiveBurgs(map, index);
  for (const gridCell of uniqueCells(gridCells)) {
    if (!map?.grid?.cells?.burg) break;
    map.grid.cells.burg[gridCell] = normalizeCityBucket(map, index, gridCell)[0] ?? -1;
  }
  for (const packCell of uniqueCells(packCells)) {
    if (!map?.pack?.cells?.burg) break;
    map.pack.cells.burg[packCell] = normalizeBurgBucket(map, index, packCell)[0] ?? 0;
  }
}

function syncAllLegacyRepresentatives(map, index) {
  if (map?.grid?.cells?.burg) {
    map.grid.cells.burg.fill?.(-1);
    for (const [cell, ids] of index.cityIdsByGridCell) map.grid.cells.burg[cell] = ids[0];
  }
  if (map?.pack?.cells?.burg) {
    map.pack.cells.burg.fill?.(0);
    for (const [cell, ids] of index.burgIdsByPackCell) map.pack.cells.burg[cell] = ids[0];
  }
}

function addBucketValue(buckets, cell, id, idOf = value => value) {
  const values = buckets.get(cell) || [];
  const identity = idOf(id);
  if (!values.some(value => idOf(value) === identity)) values.push(id);
  values.sort((a, b) => idOf(a) - idOf(b));
  buckets.set(cell, values);
}

function moveBucketValue(buckets, source, target, id) {
  if (Number.isInteger(source)) {
    const sourceValues = (buckets.get(source) || []).filter(value => value !== id);
    if (sourceValues.length) buckets.set(source, sourceValues);
    else buckets.delete(source);
  }
  if (Number.isInteger(target)) addBucketValue(buckets, target, id);
}

function normalizeCityBucket(map, index, cell) {
  return normalizeBucket(index.cityIdsByGridCell, cell, id => {
    const cities = map?.settlements?.cities || [];
    const city = Number(cities[id]?.id) === id ? cities[id] : cities.find(item => Number(item?.id) === id);
    if (city?.removed) index.inactiveCityIds.add(id);
    return Boolean(city && !city.removed && Number(city.cell) === cell);
  });
}

function normalizeBurgBucket(map, index, cell) {
  return normalizeBucket(index.burgIdsByPackCell, cell, id => {
    const burgs = map?.pack?.burgs || [];
    const direct = burgs[id];
    const burg = Number(direct?.i ?? direct?.id) === id ? direct : burgs.find(item => Number(item?.i ?? item?.id) === id);
    if (burg?.removed) index.inactiveBurgIds.add(id);
    return Boolean(burg && !burg.removed && Number(burg.cell) === cell);
  });
}

function reviveInactiveCities(map, index) {
  const cities = map?.settlements?.cities || [];
  for (const id of [...index.inactiveCityIds]) {
    const direct = cities[id];
    const city = Number(direct?.id) === id ? direct : cities.find(item => Number(item?.id) === id);
    if (!city || city.removed || !Number.isInteger(Number(city.cell))) continue;
    addBucketValue(index.cityIdsByGridCell, Number(city.cell), id);
    index.inactiveCityIds.delete(id);
  }
}

function reviveInactiveBurgs(map, index) {
  const burgs = map?.pack?.burgs || [];
  for (const id of [...index.inactiveBurgIds]) {
    const direct = burgs[id];
    const burg = Number(direct?.i ?? direct?.id) === id ? direct : burgs.find(item => Number(item?.i ?? item?.id) === id);
    if (!burg || burg.removed || !Number.isInteger(Number(burg.cell))) continue;
    addBucketValue(index.burgIdsByPackCell, Number(burg.cell), id);
    index.inactiveBurgIds.delete(id);
  }
}

function normalizeBucket(buckets, cell, valid) {
  const values = (buckets.get(cell) || []).filter(valid);
  if (values.length) buckets.set(cell, values);
  else buckets.delete(cell);
  return values;
}

function uniqueCells(values) {
  return [...new Set(values.map(Number).filter(value => Number.isInteger(value) && value >= 0))];
}

function emptyIndex() {
  return {
    cities: null,
    burgs: null,
    routes: null,
    cityLength: 0,
    burgLength: 0,
    routeLength: 0,
    cityIdsByGridCell: new Map(),
    burgIdsByPackCell: new Map(),
    routesByCityId: new Map(),
    inactiveCityIds: new Set(),
    inactiveBurgIds: new Set()
  };
}

function routeId(route) {
  return Number(route?.id ?? route?.i);
}

function uniqueIds(values) {
  return [...new Set(values.map(Number).filter(value => Number.isInteger(value) && value >= 0))];
}
