import {resolveBiomeDescriptor} from "../generator/biome-registry.js";
import {isSharedCubicCurve, sampleCentripetalCatmullRom} from "../geometry/cubic-path.js";

export const CITY_PICK_RADIUS_CSS_PX = 18;
export const OBJECT_PICKING_COMPONENTS = Object.freeze(["cities", "markers", "military", "routeSegments", "riverSegments"]);

const CITY_OVERLAP_POSITION_EPSILON = 0.11;
const CITY_PICK_DISTANCE_EPSILON = 1e-6;

export function pickGridCell(map, worldX, worldY) {
  if (!map || worldX < 0 || worldY < 0 || worldX > map.metadata.graphWidth || worldY > map.metadata.graphHeight) {
    return null;
  }

  const {columns, rows} = map.grid.metadata;
  const column = Math.max(0, Math.min(columns - 1, Math.floor((worldX / map.metadata.graphWidth) * columns)));
  const row = Math.max(0, Math.min(rows - 1, Math.floor((worldY / map.metadata.graphHeight) * rows)));
  const candidates = expandRefinedCandidateCells(map.grid, candidateCells(column, row, columns, rows));

  for (const cell of candidates) {
    if (pointInCell(map, cell, worldX, worldY)) return buildPickResult(map, cell, worldX, worldY, candidates.length);
  }

  const nearest = nearestCandidateCell(map.grid, candidates, worldX, worldY);
  if (nearest !== null) return buildPickResult(map, nearest, worldX, worldY, candidates.length);

  return {
    gridCell: null,
    packCell: null,
    worldX,
    worldY,
    candidates: candidates.length
  };
}

function nearestCandidateCell(grid, candidates, x, y) {
  let nearest = null;
  let distance = Infinity;
  for (const cell of candidates) {
    const point = grid?.points?.[cell];
    if (!point) continue;
    const next = (Number(point[0]) - x) ** 2 + (Number(point[1]) - y) ** 2;
    if (next >= distance) continue;
    nearest = cell;
    distance = next;
  }
  return nearest;
}

function expandRefinedCandidateCells(grid, sourceCandidates) {
  const children = grid?.refinement?.children;
  if (!children?.length) return sourceCandidates;
  const expanded = [];
  const seen = new Set();
  for (const mother of sourceCandidates) {
    const group = children[mother];
    const candidates = group?.length ? group : [mother];
    for (const value of candidates) {
      const cell = Number(value);
      if (!Number.isInteger(cell) || cell < 0 || seen.has(cell)) continue;
      seen.add(cell);
      expanded.push(cell);
    }
  }
  return expanded;
}

export function buildObjectPickingIndex(map, options = {}) {
  const components = normalizeObjectPickingComponents(options.components);
  const enabled = new Set(components);
  const bucketSize = Math.max(28, Math.max(map.metadata.graphWidth, map.metadata.graphHeight) / 48);
  const columns = Math.max(1, Math.ceil(map.metadata.graphWidth / bucketSize));
  const rows = Math.max(1, Math.ceil(map.metadata.graphHeight / bucketSize));
  const buckets = new Map();
  let routeSegmentCount = 0;
  let riverSegmentCount = 0;

  for (const city of enabled.has("cities") ? map?.settlements?.cities || [] : []) {
    if (!city) continue;
    addToBucket(buckets, columns, rows, bucketSize, city.x, city.y, "cities", city);
  }

  for (const marker of enabled.has("markers") ? map?.markers?.markers || [] : []) {
    addToBucket(buckets, columns, rows, bucketSize, marker.x, marker.y, "markers", marker);
  }

  const regiments = enabled.has("military") ? militaryRegiments(map) : [];
  for (const regiment of regiments) {
    addToBucket(buckets, columns, rows, bucketSize, regiment.x, regiment.y, "military", regiment);
  }

  for (const route of enabled.has("routeSegments") ? map?.settlements?.routes || [] : []) {
    const points = Array.isArray(route?.points) ? route.points : [];
    for (let index = 0; index < points.length - 1; index++) {
      const a = points[index];
      const b = points[index + 1];
      const segment = {kind: "route", route, index, a, b};
      addSegmentToBuckets(buckets, columns, rows, bucketSize, segment, "routeSegments");
      routeSegmentCount++;
    }
  }

  for (const river of enabled.has("riverSegments") ? map?.rivers?.rivers || [] : []) {
    const points = riverPickingPoints(river);
    for (let index = 0; index < points.length - 1; index++) {
      const a = points[index];
      const b = points[index + 1];
      const segment = {kind: "river", river, index, a, b};
      addSegmentToBuckets(buckets, columns, rows, bucketSize, segment, "riverSegments");
      riverSegmentCount++;
    }
  }

  let maxBucketItems = 0;
  for (const bucket of buckets.values()) {
    maxBucketItems = Math.max(maxBucketItems, bucket.cities.length + bucket.markers.length + bucket.military.length + bucket.routeSegments.length + bucket.riverSegments.length);
  }

  return {
    components,
    bucketSize,
    columns,
    rows,
    buckets,
    bucketCount: buckets.size,
    cityCount: enabled.has("cities") ? (map?.settlements?.cities || []).filter(Boolean).length : 0,
    markerCount: enabled.has("markers") ? (map?.markers?.markers || []).length : 0,
    militaryCount: regiments.length,
    routeSegmentCount,
    riverSegmentCount,
    maxBucketItems
  };
}

function normalizeObjectPickingComponents(components) {
  if (components === undefined || components === null) return [...OBJECT_PICKING_COMPONENTS];
  const requested = new Set(Array.isArray(components) ? components.map(String) : []);
  return OBJECT_PICKING_COMPONENTS.filter(component => requested.has(component));
}

export function relocateCityInPickingIndex(index, city, previousPoint = null) {
  if (!index || !city) return false;
  const id = Number(city.id);
  const removeFrom = point => {
    if (!Number.isFinite(Number(point?.x)) || !Number.isFinite(Number(point?.y))) return;
    const column = clampBucket(Math.floor(Number(point.x) / index.bucketSize), index.columns);
    const row = clampBucket(Math.floor(Number(point.y) / index.bucketSize), index.rows);
    const bucket = index.buckets.get(row * index.columns + column);
    if (bucket) bucket.cities = bucket.cities.filter(item => Number(item?.id) !== id);
  };
  removeFrom(previousPoint);
  addToBucket(index.buckets, index.columns, index.rows, index.bucketSize, Number(city.x), Number(city.y), "cities", city);
  return true;
}

export function refreshRoutesInPickingIndex(index, routes, routeIds) {
  if (!index) return false;
  const ids = new Set((routeIds || []).map(Number).filter(Number.isInteger));
  if (!ids.size) return true;
  for (const bucket of index.buckets.values()) {
    bucket.routeSegments = bucket.routeSegments.filter(segment => !ids.has(Number(segment?.route?.id)));
  }
  for (const route of routes || []) {
    if (!ids.has(Number(route?.id))) continue;
    const points = Array.isArray(route.points) ? route.points : [];
    for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex++) {
      addSegmentToBuckets(index.buckets, index.columns, index.rows, index.bucketSize, {
        kind: "route",
        route,
        index: segmentIndex,
        a: points[segmentIndex],
        b: points[segmentIndex + 1]
      }, "routeSegments");
    }
  }
  index.routeSegmentCount = (routes || []).reduce((total, route) => total + Math.max(0, (Array.isArray(route?.points) ? route.points.length : 0) - 1), 0);
  return true;
}

export function refreshRiversInPickingIndex(index, rivers) {
  if (!index) return false;
  for (const bucket of index.buckets.values()) bucket.riverSegments = [];
  let riverSegmentCount = 0;
  for (const river of rivers || []) {
    const points = riverPickingPoints(river);
    for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex++) {
      addSegmentToBuckets(index.buckets, index.columns, index.rows, index.bucketSize, {
        kind: "river",
        river,
        index: segmentIndex,
        a: points[segmentIndex],
        b: points[segmentIndex + 1]
      }, "riverSegments");
      riverSegmentCount++;
    }
  }
  index.riverSegmentCount = riverSegmentCount;
  index.bucketCount = index.buckets.size;
  index.maxBucketItems = 0;
  for (const bucket of index.buckets.values()) {
    index.maxBucketItems = Math.max(index.maxBucketItems, bucket.cities.length + bucket.markers.length + bucket.military.length + bucket.routeSegments.length + bucket.riverSegments.length);
  }
  return true;
}

export function refreshNonRoutePickingIndexPreservingRoutes(index, map) {
  if (!index || !map) return false;
  const replacement = buildObjectPickingIndex(map);
  if (replacement.bucketSize !== index.bucketSize || replacement.columns !== index.columns || replacement.rows !== index.rows) return false;
  const keys = new Set([...index.buckets.keys(), ...replacement.buckets.keys()]);
  for (const key of keys) {
    const current = index.buckets.get(key);
    const next = replacement.buckets.get(key);
    const routeSegments = current?.routeSegments || [];
    if (!next && !routeSegments.length) {
      index.buckets.delete(key);
      continue;
    }
    const target = current || bucketFor(index.buckets, key);
    target.cities = next?.cities || [];
    target.markers = next?.markers || [];
    target.military = next?.military || [];
    target.riverSegments = next?.riverSegments || [];
    target.routeSegments = routeSegments;
  }
  index.bucketCount = index.buckets.size;
  index.cityCount = replacement.cityCount;
  index.markerCount = replacement.markerCount;
  index.militaryCount = replacement.militaryCount;
  index.riverSegmentCount = replacement.riverSegmentCount;
  index.maxBucketItems = 0;
  for (const bucket of index.buckets.values()) {
    index.maxBucketItems = Math.max(index.maxBucketItems, bucket.cities.length + bucket.markers.length + bucket.military.length + bucket.routeSegments.length + bucket.riverSegments.length);
  }
  return true;
}

export function pickMilitary(map, index, worldX, worldY, maxDistance) {
  const regiments = militaryRegiments(map);
  if (!regiments.length) return null;
  let best = null;
  let candidateCount = 0;
  const candidates = index ? queryIndexedItems(index, worldX, worldY, maxDistance, "military", regiment => regiment.id) : regiments;

  for (const regiment of candidates) {
    candidateCount++;
    const distance = Math.hypot(worldX - regiment.x, worldY - regiment.y);
    if (distance > maxDistance || (best && distance >= best.distance)) continue;
    best = regimentPickObject(map, regiment, distance, candidateCount);
  }

  if (best) best.candidateCount = candidateCount;
  return best;
}

export function pickRoute(map, index, worldX, worldY, maxDistance) {
  if (!map?.settlements?.routes?.length) return null;
  let best = null;
  let candidateCount = 0;
  const routeSegments = index ? queryIndexedItems(index, worldX, worldY, maxDistance, "routeSegments", segment => `${segment.route.id}:${segment.index}`) : allRouteSegments(map);

  for (const segment of routeSegments) {
    candidateCount++;
    const route = segment.route;
    const distance = distanceToSegment(worldX, worldY, segment.a, segment.b);
    if (distance > maxDistance || (best && distance >= best.distance)) continue;
    const from = map.settlements.cities[route.from];
    const to = map.settlements.cities[route.to];
    best = {
      kind: "route",
      id: route.id,
      type: route.type,
      level: route.level || route.type,
      from: from?.name || "unknown",
      to: to?.name || "unknown",
      distance,
      candidateCount
    };
  }

  if (best) best.candidateCount = candidateCount;
  return best;
}

export function pickRiver(map, index, worldX, worldY, maxDistance, predicate = () => true) {
  if (!map?.rivers?.rivers?.length) return null;
  let best = null;
  let candidateCount = 0;
  const riverSegments = index ? queryIndexedItems(index, worldX, worldY, maxDistance, "riverSegments", segment => `${segment.river.id}:${segment.index}`) : allRiverSegments(map);

  for (const segment of riverSegments) {
    const river = segment.river;
    if (!predicate(river)) continue;
    candidateCount++;
    const parent = river.parent ? map.rivers.rivers.find(item => Number(item.id ?? item.i) === Number(river.parent)) : null;
    const distance = distanceToSegment(worldX, worldY, segment.a, segment.b);
    if (distance > maxDistance || (best && distance >= best.distance)) continue;
    best = {
      kind: "river",
      id: river.id,
      name: river.name || `河流 #${river.id}`,
      type: river.parent ? "tributary" : "river",
      parentId: river.parent || 0,
      parentName: parent?.name || "",
      networkStatus: river.networkStatus || (river.parent && !parent ? "orphaned" : "valid"),
      networkIssue: river.networkIssue || "",
      outletKind: river.outletKind || (river.parent ? "confluence" : "unknown"),
      flux: river.flux,
      length: Array.isArray(river.cells) ? river.cells.length : Array.isArray(river.points) ? river.points.length : 0,
      distance,
      candidateCount
    };
  }

  if (best) best.candidateCount = candidateCount;
  return best;
}

export function pickRiverControlPoint(preview, worldX, worldY, maxDistance) {
  const controls = preview?.controlPoints || [];
  let best = null;
  for (const control of controls) {
    const distance = Math.hypot(Number(control?.x) - worldX, Number(control?.y) - worldY);
    if (!Number.isFinite(distance) || distance > maxDistance || (best && distance >= best.distance)) continue;
    best = {
      kind: "river-control-point",
      id: control.id,
      riverId: Number(preview.riverId),
      pointIndex: Number(control.pointIndex),
      packCell: Number.isInteger(Number(control.packCell)) ? Number(control.packCell) : null,
      worldX: Number(control.x),
      worldY: Number(control.y),
      distance
    };
  }
  return best;
}

export function pickCity(map, index, worldX, worldY, maxDistance, {cycleIndex = 0, distanceToCity = null, maxPickDistance = maxDistance} = {}) {
  if (!map?.settlements?.cities?.length) return null;
  let candidateCount = 0;
  const cities = index ? queryIndexedItems(index, worldX, worldY, maxDistance, "cities", city => city.id) : map.settlements.cities;
  const eligible = [];
  for (const city of cities) {
    if (!city) continue;
    candidateCount++;
    const worldDistance = Math.hypot(worldX - city.x, worldY - city.y);
    if (worldDistance > maxDistance) continue;
    const distance = typeof distanceToCity === "function" ? Number(distanceToCity(city)) : worldDistance;
    if (Number.isFinite(distance) && distance <= maxPickDistance) eligible.push({city, distance, worldDistance});
  }
  if (!eligible.length) return null;
  eligible.sort((left, right) => {
    const distanceDelta = left.distance - right.distance;
    return Math.abs(distanceDelta) > CITY_PICK_DISTANCE_EPSILON ? distanceDelta : Number(left.city.id) - Number(right.city.id);
  });
  const nearest = eligible[0];
  const overlaps = eligible.filter(item => sameCityPosition(item.city, nearest.city));
  const selected = overlaps[positiveModulo(cycleIndex, overlaps.length)] || nearest;
  const city = selected.city;
  return {
    kind: "city",
    id: city.id,
    name: city.name,
    type: city.capital ? "capital" : city.provincial ? "provincial" : city.port ? "port" : "city",
    population: city.population,
    state: map.politics.states[city.state]?.name || "none",
    province: map.politics.provinces[city.province]?.name || "none",
    distance: selected.distance,
    worldDistance: selected.worldDistance,
    candidateCount,
    overlapCandidateIds: overlaps.map(item => Number(item.city.id))
  };
}

export function pickMarker(map, index, worldX, worldY, maxDistance, predicate = () => true) {
  if (!map?.markers?.markers?.length) return null;
  let best = null;
  let candidateCount = 0;
  const markers = index ? queryIndexedItems(index, worldX, worldY, maxDistance, "markers", marker => marker.id) : map.markers.markers;

  for (const marker of markers) {
    if (!predicate(marker)) continue;
    candidateCount++;
    const distance = Math.hypot(worldX - marker.x, worldY - marker.y);
    if (distance > maxDistance || (best && distance >= best.distance)) continue;
    best = {
      kind: "marker",
      id: marker.id,
      type: marker.type,
      label: marker.label,
      icon: marker.icon,
      category: marker.category,
      categoryLabel: marker.categoryLabel,
      resourceKey: marker.resourceKey,
      resourceLabel: marker.resourceLabel,
      economicValue: marker.economicValue,
      name: marker.name,
      cell: marker.cell,
      packCell: marker.packCell,
      data: marker.data,
      distance,
      candidateCount
    };
  }

  if (best) best.candidateCount = candidateCount;
  return best;
}

export function pickPoliticalObject(map, pickResult, colorMode = "height") {
  if (!pickResult || pickResult.gridCell === null || !pickResult.featureLand) return null;
  if (colorMode === "states") return buildStateObject(map, pickResult.gridCell);
  if (colorMode === "governments") return buildStateObject(map, pickResult.gridCell);
  if (colorMode === "diplomacy") return buildStateObject(map, pickResult.gridCell);
  if (colorMode === "regions") return buildRegionObject(map, pickResult.gridCell);
  if (colorMode === "provinces") return buildProvinceObject(map, pickResult.gridCell);
  if (colorMode === "cultures") return buildCultureObject(map, pickResult.gridCell);
  if (colorMode === "religions") return buildReligionObject(map, pickResult.gridCell);
  return buildProvinceObject(map, pickResult.gridCell) || buildStateObject(map, pickResult.gridCell) || buildRegionObject(map, pickResult.gridCell);
}

function addToBucket(buckets, columns, rows, bucketSize, x, y, key, item) {
  const column = clampBucket(Math.floor(x / bucketSize), columns);
  const row = clampBucket(Math.floor(y / bucketSize), rows);
  bucketFor(buckets, row * columns + column)[key].push(item);
}

function addSegmentToBuckets(buckets, columns, rows, bucketSize, segment, key) {
  const minColumn = clampBucket(Math.floor(Math.min(segment.a[0], segment.b[0]) / bucketSize), columns);
  const maxColumn = clampBucket(Math.floor(Math.max(segment.a[0], segment.b[0]) / bucketSize), columns);
  const minRow = clampBucket(Math.floor(Math.min(segment.a[1], segment.b[1]) / bucketSize), rows);
  const maxRow = clampBucket(Math.floor(Math.max(segment.a[1], segment.b[1]) / bucketSize), rows);
  for (let row = minRow; row <= maxRow; row++) {
    for (let column = minColumn; column <= maxColumn; column++) {
      bucketFor(buckets, row * columns + column)[key].push(segment);
    }
  }
}

function queryIndexedItems(index, worldX, worldY, radius, key, getId) {
  const column = clampBucket(Math.floor(worldX / index.bucketSize), index.columns);
  const row = clampBucket(Math.floor(worldY / index.bucketSize), index.rows);
  const bucketRadius = Math.max(1, Math.ceil(radius / index.bucketSize));
  const items = [];
  const used = new Set();

  for (let nextRow = row - bucketRadius; nextRow <= row + bucketRadius; nextRow++) {
    if (nextRow < 0 || nextRow >= index.rows) continue;
    for (let nextColumn = column - bucketRadius; nextColumn <= column + bucketRadius; nextColumn++) {
      if (nextColumn < 0 || nextColumn >= index.columns) continue;
      const bucket = index.buckets.get(nextRow * index.columns + nextColumn);
      if (!bucket) continue;
      for (const item of bucket[key]) {
        const id = getId(item);
        if (used.has(id)) continue;
        used.add(id);
        items.push(item);
      }
    }
  }

  return items;
}

function bucketFor(buckets, key) {
  if (!buckets.has(key)) buckets.set(key, {cities: [], markers: [], military: [], routeSegments: [], riverSegments: []});
  return buckets.get(key);
}

function clampBucket(value, size) {
  return Math.max(0, Math.min(size - 1, value));
}

function buildStateObject(map, gridCell) {
  const id = map.grid.cells.state[gridCell];
  const state = map.politics.states[id];
  if (!state) return null;
  return {
    kind: "state",
    id,
    name: state.name,
    culture: map.society.cultures[state.culture]?.name || "unknown",
    religion: map.society.religions[state.religion]?.name || "unknown",
    centerCell: state.center
  };
}

function buildProvinceObject(map, gridCell) {
  const id = map.grid.cells.province[gridCell];
  const province = map.politics.provinces[id];
  if (!province) return null;
  const state = map.politics.states[province.state];
  return {
    kind: "province",
    id,
    name: province.name,
    state: state?.name || "none",
    stateId: province.state,
    centerCell: province.center
  };
}

function buildCultureObject(map, gridCell) {
  const id = map.grid.cells.culture[gridCell];
  const culture = map.society.cultures[id];
  if (!culture || !culture.i) return null;
  return {
    kind: "culture",
    id,
    name: culture.name,
    type: culture.type || "Generic",
    nameStyle: culture.nameStyle || "default",
    centerCell: culture.center,
    cells: culture.cells || 0,
    population: (culture.rural || 0) + cultureUrbanPopulation(map, id)
  };
}

function buildReligionObject(map, gridCell) {
  const id = map.grid.cells.religion[gridCell];
  const religion = map.society.religions[id];
  if (!religion || !religion.i) return null;
  return {
    kind: "religion",
    id,
    name: religion.name,
    type: religion.type || "Generic",
    form: religion.form || "none",
    centerCell: religion.center,
    cells: religion.cells || 0,
    population: (religion.rural || 0) + religionUrbanPopulation(map, id)
  };
}

function buildRegionObject(map, gridCell) {
  const id = map.grid.cells.region[gridCell];
  const region = map.politics.regions[id];
  if (!region) return null;
  return {
    kind: "region",
    id,
    name: region.name
  };
}

function cultureUrbanPopulation(map, cultureId) {
  return (map.settlements?.cities || []).reduce((sum, city) => sum + (Number(city?.culture) === cultureId ? Number(city.population) || 0 : 0), 0);
}

function religionUrbanPopulation(map, religionId) {
  return (map.settlements?.cities || []).reduce((sum, city) => sum + (Number(city?.religion) === religionId ? Number(city.population) || 0 : 0), 0);
}

function allRouteSegments(map) {
  return (map?.settlements?.routes || []).flatMap(route => {
    const points = Array.isArray(route?.points) ? route.points : [];
    return points.slice(0, -1).map((point, index) => ({route, index, a: point, b: points[index + 1]}));
  });
}

function allRiverSegments(map) {
  return (map?.rivers?.rivers || []).flatMap(river => {
    const points = riverPickingPoints(river);
    return points.slice(0, -1).map((point, index) => ({river, index, a: point, b: points[index + 1]}));
  });
}

export function riverPickingPoints(river) {
  const points = Array.isArray(river?.points) ? river.points : [];
  return isSharedCubicCurve(river?.visualCurve) ? sampleCentripetalCatmullRom(points).points : points;
}

function militaryRegiments(map) {
  return (map?.politics?.states || map?.pack?.states || [])
    .filter(state => state?.i && !state.removed)
    .flatMap(state => (state.military || []).map(regiment => ({...regiment, stateId: state.i, stateName: state.name || state.fullName})))
    .filter(regiment => Number.isFinite(regiment.x) && Number.isFinite(regiment.y));
}

function regimentPickObject(map, regiment, distance, candidateCount) {
  const state = map?.politics?.states?.[regiment.state] || map?.pack?.states?.[regiment.state] || map?.politics?.states?.[regiment.stateId];
  return {
    kind: "military",
    id: regiment.id ?? `${regiment.state ?? regiment.stateId}:${regiment.i}`,
    regimentId: regiment.i,
    stateId: regiment.state ?? regiment.stateId,
    name: regiment.name,
    state: state?.name || regiment.stateName || "none",
    type: regiment.type,
    status: regiment.status,
    statusLabel: regiment.statusLabel,
    dominantUnit: regiment.dominantUnit,
    dominantUnitLabel: regiment.dominantUnitLabel,
    troops: regiment.a,
    units: regiment.u,
    icon: regiment.icon,
    iconVariant: regiment.iconVariant,
    iconLabel: regiment.iconLabel,
    cell: regiment.cell,
    x: regiment.x,
    y: regiment.y,
    distance,
    candidateCount
  };
}

function candidateCells(column, row, columns, rows) {
  const cells = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nextColumn = column + dx;
      const nextRow = row + dy;
      if (nextColumn < 0 || nextColumn >= columns || nextRow < 0 || nextRow >= rows) continue;
      cells.push(nextRow * columns + nextColumn);
    }
  }
  return cells;
}

function pointInCell(map, cell, x, y) {
  const vertexIds = map.grid?.cells?.v?.[cell];
  const vertices = map.grid?.vertices?.p;
  if (!vertexIds || vertexIds.length < 3 || !vertices) return false;
  let inside = false;
  for (let index = 0, previous = vertexIds.length - 1; index < vertexIds.length; previous = index++) {
    const a = vertices[vertexIds[index]];
    const b = vertices[vertexIds[previous]];
    if (!a || !b) return false;
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
}

function buildPickResult(map, gridCell, worldX, worldY, candidates) {
  const mappedPackCell = map.grid.cells.pack?.[gridCell];
  const packCell = Number.isInteger(mappedPackCell) && mappedPackCell >= 0 ? mappedPackCell : null;
  const packCells = map.pack?.cells;
  const packBiomeId = packCell === null ? null : packCells?.biome?.[packCell];
  const gridBiomeId = Number(map.grid.cells.biome[gridCell]) || 0;
  const gridBiome = resolveBiomeDescriptor(gridBiomeId, map.climate?.biomes);
  const packBiome = packBiomeId === null ? null : resolveBiomeDescriptor(packBiomeId, map.climate?.biomes);
  const cultureId = Number(map.grid.cells.culture?.[gridCell]) || 0;
  const religionId = Number(map.grid.cells.religion?.[gridCell]) || 0;
  const stateId = Number(map.grid.cells.state?.[gridCell]) || 0;
  const provinceId = Number(map.grid.cells.province?.[gridCell]) || 0;
  const regionId = Number(map.grid.cells.region?.[gridCell]) || 0;
  const goodId = packCell === null ? 0 : packCells?.good?.[packCell] || 0;
  const good = goodId ? map.pack?.goods?.[goodId] : null;
  const flux = packCell === null ? 0 : (packCells?.fl?.[packCell] || 0) + (packCells?.conf?.[packCell] || 0);
  const featureId = packCell === null ? map.grid.cells.f?.[gridCell] : map.pack.cells.f?.[packCell] ?? map.grid.cells.f?.[gridCell];
  const feature = packCell === null
    ? map.features.features[featureId]
    : map.pack.features?.[featureId] || map.features.features[map.grid.cells.f?.[gridCell]];
  return {
    gridCell,
    packCell,
    featureId,
    featureType: feature?.type || "unknown",
    featureLand: Boolean(feature?.land),
    height: map.grid.cells.h[gridCell],
    temperature: map.grid.cells.temp[gridCell],
    precipitation: map.grid.cells.prec[gridCell],
    biomeId: gridBiomeId,
    biome: gridBiome.name,
    biomeCanonicalName: gridBiome.canonicalName,
    biomeDescription: gridBiome.description,
    packBiome: packBiome?.name || "none",
    packBiomeDescription: packBiome?.description || "",
    packHeight: packCell === null ? null : packCells?.h?.[packCell] ?? null,
    suitability: packCell === null ? 0 : packCells?.s?.[packCell] || 0,
    flux,
    resource: good ? {
      id: goodId,
      name: good.name || `good-${goodId}`,
      value: Number(good.value || 0),
      supply: Number(packCells?.goodSupply?.[packCell] || 1)
    } : null,
    cultureId,
    religionId,
    stateId,
    provinceId,
    regionId,
    culture: map.society.cultures[cultureId]?.name || "unknown",
    religion: map.society.religions[religionId]?.name || "unknown",
    state: map.politics.states[stateId]?.name || "none",
    province: map.politics.provinces[provinceId]?.name || "none",
    region: map.politics.regions[regionId]?.name || "none",
    city: map.settlements.cities[map.grid.cells.burg[gridCell]]?.name || "none",
    population: map.grid.cells.pop[gridCell] || 0,
    worldX,
    worldY,
    candidates
  };
}

function positiveModulo(value, size) {
  if (!size) return 0;
  const normalized = Math.trunc(Number(value) || 0) % size;
  return normalized < 0 ? normalized + size : normalized;
}

function sameCityPosition(left, right) {
  return Math.abs(Number(left?.x) - Number(right?.x)) <= CITY_OVERLAP_POSITION_EPSILON
    && Math.abs(Number(left?.y) - Number(right?.y)) <= CITY_OVERLAP_POSITION_EPSILON;
}

function distanceToSegment(x, y, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0.000001) return Math.hypot(x - a[0], y - a[1]);
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / lengthSquared));
  return Math.hypot(x - (a[0] + dx * t), y - (a[1] + dy * t));
}
