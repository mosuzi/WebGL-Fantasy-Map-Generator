import {createRandom} from "./random.js";

const MARKER_TYPES = [
  {type: "volcanoes", icon: "🌋", weight: 16, candidates: highCells(70)},
  {type: "hot-springs", icon: "♨️", weight: 9, candidates: highCultureCells(50)},
  {type: "water-sources", icon: "💧", weight: 3, candidates: riverSources},
  {type: "mines", icon: "⛏️", weight: 17, candidates: mines},
  {type: "inns", icon: "🍻", weight: 12, candidates: routeLandCells},
  {type: "lighthouses", icon: "🚨", weight: 13, candidates: ports},
  {type: "waterfalls", icon: "⟱", weight: 1, candidates: waterfalls},
  {type: "battlefields", icon: "⚔️", weight: 36, candidates: borderCells},
  {type: "dungeons", icon: "🗝️", weight: 112, candidates: remoteLandCells},
  {type: "lake-monsters", icon: "🐉", weight: 13, candidates: lakeCells},
  {type: "sea-monsters", icon: "🦑", weight: 1, candidates: deepWaterCells},
  {type: "hill-monsters", icon: "👹", weight: 19, candidates: highCells(62)},
  {type: "sacred-forests", icon: "🌳", weight: 8, candidates: biomeCells([6, 7])},
  {type: "sacred-pineries", icon: "🌲", weight: 7, candidates: biomeCells([8, 9])},
  {type: "sacred-palm-groves", icon: "🌴", weight: 2, candidates: biomeCells([1, 2])},
  {type: "brigands", icon: "💰", weight: 14, candidates: routeLandCells},
  {type: "pirates", icon: "🏴‍☠️", weight: 13, candidates: coastalWaterCells},
  {type: "statues", icon: "🗿", weight: 27, candidates: burgCells},
  {type: "ruins", icon: "🏺", weight: 40, candidates: lowPopulationLandCells},
  {type: "libraries", icon: "📚", weight: 1, candidates: largeBurgCells},
  {type: "circuses", icon: "🎪", weight: 9, candidates: largeBurgCells},
  {type: "jousts", icon: "🤺", weight: 1, candidates: stateCapitalCells},
  {type: "fairs", icon: "🎠", weight: 1, candidates: burgCells},
  {type: "canoes", icon: "🛶", weight: 3, candidates: riverOrLakeCells},
  {type: "migration", icon: "🐗", weight: 28, candidates: openLandCells},
  {type: "dances", icon: "💃🏽", weight: 1, candidates: cultureCenterCells},
  {type: "mirage", icon: "💦", weight: 18, candidates: dryCells},
  {type: "caves", icon: "🦇", weight: 12, candidates: highCells(55)},
  {type: "necropolises", icon: "🪦", weight: 28, candidates: lowPopulationLandCells},
  {type: "encounters", icon: "🧙", weight: 74, candidates: landCells}
];

export function buildMarkers(grid, features, politics, rivers, pack = null, options = {}) {
  if (pack?.cells?.i?.length) return buildPackMarkers(grid, pack, politics, rivers, options);

  const markers = [];
  addFallbackPeakMarkers(markers, grid, features);
  addFallbackRiverSourceMarkers(markers, grid, rivers);
  addFallbackStateCenterMarkers(markers, grid, politics);

  return createMarkerResult(markers);
}

function buildPackMarkers(grid, pack, politics, rivers, options) {
  const random = createRandom(`${options.seed}:markers`);
  const markers = [];
  const occupied = new Set();
  const target = getTargetMarkerCount(pack);
  const totalWeight = MARKER_TYPES.reduce((sum, config) => sum + config.weight, 0);

  for (const config of MARKER_TYPES) {
    const candidates = uniqueCells(config.candidates({grid, pack, politics, rivers})).filter(cell => isValidMarkerCell(pack, cell) && !occupied.has(cell));
    const quantity = Math.min(candidates.length, Math.max(0, Math.round((target * config.weight) / totalWeight)));
    addMarkersOfType(markers, occupied, pack, grid, random, config, candidates, quantity);
  }

  if (markers.length < target) {
    const fallback = uniqueCells([...landCells({pack}), ...coastalWaterCells({pack}), ...deepWaterCells({pack})]).filter(cell => isValidMarkerCell(pack, cell) && !occupied.has(cell));
    addMarkersOfType(markers, occupied, pack, grid, random, MARKER_TYPES.at(-1), fallback, target - markers.length);
  }

  return createMarkerResult(markers);
}

function addMarkersOfType(markers, occupied, pack, grid, random, config, candidates, quantity) {
  const pool = shuffle(candidates, random);
  for (const packCell of pool.slice(0, quantity)) {
    occupied.add(packCell);
    markers.push(createMarker(markers.length, config, pack, grid, packCell));
  }
}

function createMarker(id, config, pack, grid, packCell) {
  const gridCell = pack.cells.g[packCell];
  const point = pack.cells.p[packCell] || grid.points[gridCell];
  const name = markerName(config.type, pack, packCell, id);
  return {
    id,
    i: id,
    type: config.type,
    icon: config.icon,
    name,
    cell: gridCell,
    packCell,
    x: round(point[0], 2),
    y: round(point[1], 2),
    dx: config.dx ?? null,
    dy: config.dy ?? null,
    px: config.px ?? null,
    pinned: false,
    lock: false,
    data: {
      packCell,
      height: pack.cells.h?.[packCell] ?? 0,
      state: pack.cells.state?.[packCell] ?? 0,
      feature: pack.cells.f?.[packCell] ?? 0
    }
  };
}

function createMarkerResult(markers) {
  return {
    markers,
    metadata: {
      markers: markers.length,
      peaks: markers.filter(marker => marker.type === "volcanoes" || marker.type === "sacred-mountains").length,
      riverSources: markers.filter(marker => marker.type === "water-sources").length,
      stateCenters: markers.filter(marker => marker.type === "statues" || marker.type === "jousts").length,
      withIcon: markers.filter(marker => marker.icon).length,
      types: countByType(markers)
    }
  };
}

function getTargetMarkerCount(pack) {
  return Math.max(8, Math.round(pack.cells.i.length / 135.5));
}

function landCells({pack}) {
  return pack.cells.i.filter(cell => pack.cells.h[cell] >= 20);
}

function highCells(minHeight) {
  return ({pack}) => pack.cells.i.filter(cell => pack.cells.h[cell] >= minHeight);
}

function highCultureCells(minHeight) {
  return ({pack}) => pack.cells.i.filter(cell => pack.cells.h[cell] >= minHeight && pack.cells.culture?.[cell]);
}

function biomeCells(biomes) {
  return ({pack}) => pack.cells.i.filter(cell => pack.cells.h[cell] >= 20 && biomes.includes(pack.cells.biome?.[cell]));
}

function mines({pack}) {
  return pack.cells.i.filter(cell => pack.cells.h[cell] >= 35 && pack.cells.h[cell] < 80 && pack.cells.s?.[cell] > 0);
}

function riverSources({rivers}) {
  return (rivers?.rivers || []).map(river => river.source).filter(Number.isInteger);
}

function waterfalls({pack}) {
  return pack.cells.i.filter(cell => pack.cells.r?.[cell] && pack.cells.fl?.[cell] > 80 && pack.cells.h[cell] >= 45);
}

function borderCells({pack}) {
  return pack.cells.i.filter(cell => {
    if (pack.cells.h[cell] < 20 || !pack.cells.state?.[cell]) return false;
    return (pack.cells.c[cell] || []).some(neighbor => pack.cells.h[neighbor] >= 20 && pack.cells.state[neighbor] && pack.cells.state[neighbor] !== pack.cells.state[cell]);
  });
}

function remoteLandCells({pack}) {
  return pack.cells.i.filter(cell => pack.cells.h[cell] >= 20 && !pack.cells.burg?.[cell] && (pack.cells.s?.[cell] || 0) < 45);
}

function lakeCells({pack}) {
  const lakeFeatureIds = new Set((pack.features || []).filter(feature => feature?.type === "lake").map(feature => feature.i));
  return pack.cells.i.filter(cell => lakeFeatureIds.has(pack.cells.f?.[cell]));
}

function deepWaterCells({pack}) {
  return pack.cells.i.filter(cell => pack.cells.h[cell] < 20 && pack.cells.t?.[cell] <= -2);
}

function coastalWaterCells({pack}) {
  return pack.cells.i.filter(cell => pack.cells.h[cell] < 20 && (pack.cells.c[cell] || []).some(neighbor => pack.cells.h[neighbor] >= 20 && pack.cells.burg?.[neighbor]));
}

function routeLandCells({pack}) {
  const routeLinks = pack.cells.routes || {};
  return Object.keys(routeLinks).map(Number).filter(cell => pack.cells.h[cell] >= 20);
}

function ports({pack}) {
  return (pack.burgs || []).filter(burg => burg?.i && burg.port).map(burg => burg.cell);
}

function burgCells({pack}) {
  return (pack.burgs || []).filter(burg => burg?.i && !burg.removed).map(burg => burg.cell);
}

function largeBurgCells({pack}) {
  return (pack.burgs || []).filter(burg => burg?.i && !burg.removed && (burg.population || 0) >= 10).map(burg => burg.cell);
}

function stateCapitalCells({pack}) {
  return (pack.burgs || []).filter(burg => burg?.i && burg.capital).map(burg => burg.cell);
}

function riverOrLakeCells({pack}) {
  return pack.cells.i.filter(cell => pack.cells.r?.[cell] || (pack.features?.[pack.cells.f?.[cell]]?.type === "lake" && pack.cells.h[cell] < 20));
}

function cultureCenterCells({pack}) {
  const centers = new Set((pack.cultures || []).map(culture => culture?.center).filter(Number.isInteger));
  return [...centers];
}

function openLandCells({pack}) {
  return pack.cells.i.filter(cell => pack.cells.h[cell] >= 20 && [1, 2, 3, 4].includes(pack.cells.biome?.[cell]));
}

function dryCells({pack}) {
  return pack.cells.i.filter(cell => pack.cells.h[cell] >= 20 && (pack.cells.s?.[cell] || 0) > 0 && [1, 2, 3].includes(pack.cells.biome?.[cell]));
}

function lowPopulationLandCells({pack}) {
  return pack.cells.i.filter(cell => pack.cells.h[cell] >= 20 && !pack.cells.burg?.[cell] && (pack.cells.pop?.[cell] || 0) < 2);
}

function isValidMarkerCell(pack, cell) {
  return Number.isInteger(cell) && cell >= 0 && cell < pack.cells.i.length && Number.isInteger(pack.cells.g[cell]) && pack.cells.g[cell] >= 0;
}

function markerName(type, pack, packCell, id) {
  const province = pack.provinces?.[pack.cells.province?.[packCell]];
  const burg = pack.burgs?.[pack.cells.burg?.[packCell]];
  const root = burg?.name || province?.name || `#${id + 1}`;
  return `${root} ${type}`;
}

function addFallbackPeakMarkers(markers, grid, features) {
  const peaks = grid.points
    .map((point, cell) => ({cell, point, height: grid.cells.h[cell]}))
    .filter(item => item.height >= 72 && features.features[grid.cells.f[item.cell]]?.land)
    .sort((a, b) => b.height - a.height)
    .slice(0, 10);

  for (const peak of peaks) markers.push(createFallbackMarker(markers.length, "volcanoes", "🌋", `峰 ${Math.round(peak.height)}`, peak.cell, peak.point, {height: peak.height}));
}

function addFallbackRiverSourceMarkers(markers, grid, rivers) {
  for (const river of (rivers.rivers || []).slice(0, 8)) {
    const gridCell = river.sourceGrid ?? river.gridCells?.[0] ?? river.source;
    const point = grid.points[gridCell];
    markers.push(createFallbackMarker(markers.length, "water-sources", "💧", `河源 #${river.id}`, gridCell, point, {river: river.id, flux: river.flux}));
  }
}

function addFallbackStateCenterMarkers(markers, grid, politics) {
  for (const state of politics.states || []) {
    const point = grid.points[state.center];
    markers.push(createFallbackMarker(markers.length, "statues", "🗿", `${state.name}中心`, state.center, point, {state: state.id}));
  }
}

function createFallbackMarker(id, type, icon, name, cell, point, data) {
  return {
    id,
    i: id,
    type,
    icon,
    name,
    cell,
    x: point[0],
    y: point[1],
    data
  };
}

function uniqueCells(cells) {
  return [...new Set(cells.filter(Number.isInteger))];
}

function shuffle(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(random.next() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function countByType(markers) {
  const counts = {};
  for (const marker of markers) counts[marker.type] = (counts[marker.type] || 0) + 1;
  return counts;
}

function round(value, digits = 0) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
