import {createRandom} from "./random.js";

const MARKER_CATEGORY_DETAILS = Object.freeze({
  natural: {label: "自然", color: [0.68, 0.78, 0.45, 1]},
  water: {label: "水文", color: [0.32, 0.66, 0.95, 1]},
  resource: {label: "资源", color: [0.22, 0.74, 0.46, 1]},
  infrastructure: {label: "设施", color: [0.9, 0.6, 0.24, 1]},
  trade: {label: "商旅", color: [0.96, 0.76, 0.26, 1]},
  hazard: {label: "危险", color: [0.9, 0.28, 0.22, 1]},
  culture: {label: "文化", color: [0.64, 0.48, 0.86, 1]},
  settlement: {label: "活动", color: [0.94, 0.56, 0.38, 1]},
  mystery: {label: "异象", color: [0.55, 0.44, 0.86, 1]}
});

const DEFAULT_MARKER_CATEGORY = "mystery";

const MARKER_TYPES = [
  {type: "volcanoes", label: "火山", category: "natural", icon: "🌋", weight: 16, economicValue: 6, candidates: highCells(70)},
  {type: "hot-springs", label: "温泉", category: "resource", icon: "♨️", weight: 9, resourceKey: "geothermal", resourceLabel: "地热", economicValue: 8, candidates: highCultureCells(50)},
  {type: "water-sources", label: "水源", category: "water", icon: "💧", weight: 3, resourceKey: "freshwater", resourceLabel: "淡水", economicValue: 5, candidates: riverSources},
  {type: "mines", label: "矿山", category: "resource", icon: "⛏️", weight: 30, resourceKey: "ore", resourceLabel: "矿产", economicValue: 18, candidates: candidateUnion(mineBurgCells, mines)},
  {type: "salt-lakes", label: "盐湖", category: "resource", icon: "🧂", weight: 10, resourceKey: "salt", resourceLabel: "盐", economicValue: 14, candidates: saltLakeCells},
  {type: "rare-biota", label: "稀有生物", category: "resource", icon: "✦", weight: 10, resourceKey: "rare-biota", resourceLabel: "稀有生物", economicValue: 16, candidates: rareBiotaCells},
  {type: "gem-fields", label: "宝石矿脉", category: "resource", icon: "◇", weight: 6, resourceKey: "gems", resourceLabel: "宝石", economicValue: 22, candidates: gemFieldCells},
  {type: "bridges", label: "桥梁", category: "infrastructure", icon: "🌉", weight: 8, economicValue: 4, candidates: bridges},
  {type: "inns", label: "驿馆", category: "trade", icon: "🍻", weight: 48, economicValue: 5, candidates: innCells},
  {type: "lighthouses", label: "灯塔", category: "infrastructure", icon: "🚨", weight: 13, economicValue: 4, candidates: ports},
  {type: "waterfalls", label: "瀑布", category: "natural", icon: "⟱", weight: 1, economicValue: 2, candidates: waterfalls},
  {type: "battlefields", label: "战场", category: "hazard", icon: "⚔️", weight: 36, candidates: borderCells},
  {type: "dungeons", label: "地牢", category: "mystery", icon: "🗝️", weight: 60, candidates: remoteLandCells},
  {type: "lake-monsters", label: "湖怪传闻", category: "hazard", icon: "🐉", weight: 13, candidates: lakeCells},
  {type: "sea-monsters", label: "海怪传闻", category: "hazard", icon: "🦑", weight: 1, candidates: deepWaterCells},
  {type: "hill-monsters", label: "山怪传闻", category: "hazard", icon: "👹", weight: 19, candidates: highCells(62)},
  {type: "sacred-forests", label: "圣林", category: "culture", icon: "🌳", weight: 8, economicValue: 3, candidates: biomeCells([6, 7])},
  {type: "sacred-pineries", label: "圣松林", category: "culture", icon: "🌲", weight: 7, economicValue: 3, candidates: biomeCells([8, 9])},
  {type: "sacred-palm-groves", label: "圣棕榈林", category: "culture", icon: "🌴", weight: 2, economicValue: 3, candidates: biomeCells([1, 2])},
  {type: "brigands", label: "盗匪", category: "hazard", icon: "💰", weight: 18, candidates: routeLandCells},
  {type: "pirates", label: "海盗", category: "hazard", icon: "🏴‍☠️", weight: 16, candidates: coastalWaterCells},
  {type: "statues", label: "雕像", category: "culture", icon: "🗿", weight: 27, economicValue: 2, candidates: burgCells},
  {type: "ruins", label: "遗迹", category: "culture", icon: "🏺", weight: 30, economicValue: 2, candidates: lowPopulationLandCells},
  {type: "libraries", label: "藏书楼", category: "culture", icon: "📚", weight: 5, economicValue: 8, candidates: largeBurgCells},
  {type: "circuses", label: "竞技场", category: "settlement", icon: "🎪", weight: 12, economicValue: 4, candidates: largeBurgCells},
  {type: "jousts", label: "比武场", category: "settlement", icon: "🤺", weight: 4, economicValue: 3, candidates: stateCapitalCells},
  {type: "fairs", label: "集市", category: "trade", icon: "🎠", weight: 4, economicValue: 6, candidates: burgCells},
  {type: "canoes", label: "渡舟", category: "infrastructure", icon: "🛶", weight: 4, economicValue: 3, candidates: riverOrLakeCells},
  {type: "migration", label: "迁徙路线", category: "natural", icon: "🐗", weight: 18, candidates: openLandCells},
  {type: "dances", label: "祭舞场", category: "culture", icon: "💃🏽", weight: 2, candidates: cultureCenterCells},
  {type: "mirage", label: "海市蜃楼", category: "mystery", icon: "💦", weight: 12, candidates: dryCells},
  {type: "caves", label: "洞穴", category: "natural", icon: "🦇", weight: 8, economicValue: 2, candidates: highCells(55)},
  {type: "portals", label: "传送门", category: "mystery", icon: "🌀", weight: 54, candidates: fantasyCells(majorBurgCells)},
  {type: "rifts", label: "裂隙", category: "mystery", icon: "🎆", weight: 7, candidates: fantasyCells(remoteLandCells)},
  {type: "disturbed-burials", label: "惊扰墓地", category: "hazard", icon: "💀", weight: 14, candidates: fantasyCells(populatedLandCells)},
  {type: "necropolises", label: "墓城", category: "culture", icon: "🪦", weight: 18, candidates: lowPopulationLandCells},
  {type: "encounters", label: "遭遇", category: "mystery", icon: "🧙", weight: 54, candidates: landCells}
];

const MARKER_TYPE_BY_TYPE = new Map(MARKER_TYPES.map(config => [config.type, config]));

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
  const target = getTargetMarkerCount(pack, options);
  const totalWeight = MARKER_TYPES.reduce((sum, config) => sum + config.weight, 0);

  for (const config of MARKER_TYPES) {
    const candidates = uniqueCells(config.candidates({grid, pack, politics, rivers, options})).filter(cell => isValidMarkerCell(pack, cell) && !occupied.has(cell));
    const quantity = Math.min(candidates.length, Math.max(0, Math.round((target * config.weight) / totalWeight)));
    addMarkersOfType(markers, occupied, pack, grid, random, config, candidates, quantity);
  }

  if (markers.length < target) {
    const fallback = uniqueCells([...landCells({pack}), ...coastalWaterCells({pack}), ...deepWaterCells({pack})]).filter(cell => isValidMarkerCell(pack, cell) && !occupied.has(cell));
    addMarkersOfType(markers, occupied, pack, grid, random, MARKER_TYPES.at(-1), fallback, target - markers.length);
  }

  applyMarkerResourceEconomy(pack, markers);
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
  const details = markerDetails(config);
  const {state, province} = markerOwner(pack, packCell);
  const name = markerName(config, pack, packCell, id);
  return {
    id,
    i: id,
    type: config.type,
    label: details.label,
    icon: details.icon,
    category: details.category,
    categoryLabel: details.categoryLabel,
    color: details.color,
    resourceKey: details.resourceKey,
    resourceLabel: details.resourceLabel,
    economicValue: details.economicValue,
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
      state,
      province,
      feature: pack.cells.f?.[packCell] ?? 0,
      category: details.category,
      categoryLabel: details.categoryLabel,
      label: details.label,
      icon: details.icon,
      resourceKey: details.resourceKey,
      resourceLabel: details.resourceLabel,
      economicValue: details.economicValue
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
      categories: countByKey(markers, marker => marker.category || "unknown"),
      resources: countByKey(markers.filter(marker => marker.category === "resource"), marker => marker.resourceKey || marker.type),
      economicMarkers: markers.filter(marker => Number(marker.economicValue || 0) > 0).length,
      resourceMarkers: markers.filter(marker => marker.category === "resource").length,
      economicPotential: round(markers.reduce((sum, marker) => sum + Number(marker.economicValue || 0), 0), 2),
      resourcePotential: round(markers.filter(marker => marker.category === "resource").reduce((sum, marker) => sum + Number(marker.economicValue || 0), 0), 2),
      types: countByType(markers)
    }
  };
}

function getTargetMarkerCount(pack, options) {
  const cellsTarget = Math.max(1000, Number(options.cellsTarget || 100000));
  const template = String(options.heightmapTemplate || "");
  const islandBonusFactor = template === "highIsland" || template === "lowIsland" ? 1 : template === "archipelago" ? 0.43 : 0;
  const sourceLikeSmallMapBonus = Math.round(42 * Math.min(1, 10000 / cellsTarget) * islandBonusFactor);
  return Math.max(8, Math.round(pack.cells.i.length / 135.5) + sourceLikeSmallMapBonus);
}

function candidateUnion(...candidateFns) {
  return context => candidateFns.flatMap(candidateFn => candidateFn(context));
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

function mineBurgCells({pack}) {
  return (pack.burgs || [])
    .filter(burg => burg?.i && !burg.removed && pack.cells.h?.[burg.cell] > 47)
    .map(burg => burg.cell);
}

function bridges({pack}) {
  const fluxValues = (pack.cells.fl || []).filter(value => value > 0);
  const meanFlux = fluxValues.length ? fluxValues.reduce((sum, value) => sum + value, 0) / fluxValues.length : 0;
  return (pack.burgs || [])
    .filter(burg => burg?.i && !burg.removed && (burg.population || 0) > 20 && pack.cells.r?.[burg.cell] && (pack.cells.fl?.[burg.cell] || 0) > meanFlux)
    .map(burg => burg.cell);
}

function innCells({pack}) {
  const routeLinks = pack.cells.routes || {};
  return pack.cells.i.filter(cell => (pack.cells.pop?.[cell] || 0) > 5 && routeLinkCount(routeLinks[cell]) > 2);
}

function routeLinkCount(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return value ? 1 : 0;
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

function saltLakeCells({grid, pack}) {
  const lakeFeatureIds = new Set((pack.features || []).filter(feature => feature?.type === "lake").map(feature => feature.i));
  return pack.cells.i.filter(cell => {
    if (!lakeFeatureIds.has(pack.cells.f?.[cell]) || pack.cells.h[cell] >= 20) return false;
    const gridCell = pack.cells.g[cell];
    const precipitation = grid.cells.prec?.[gridCell] ?? 100;
    const temperature = grid.cells.temp?.[gridCell] ?? 0;
    const dryShore = (pack.cells.c?.[cell] || []).some(neighbor => pack.cells.h[neighbor] >= 20 && [1, 2, 3].includes(pack.cells.biome?.[neighbor]));
    return precipitation <= 30 || temperature >= 18 || dryShore;
  });
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

function majorBurgCells({pack}) {
  return (pack.burgs || [])
    .filter(burg => burg?.i && !burg.removed)
    .sort((a, b) => (b.population || 0) - (a.population || 0))
    .slice(0, Math.ceil((pack.burgs || []).filter(burg => burg?.i && !burg.removed).length / 10))
    .map(burg => burg.cell);
}

function fantasyCells(candidateFn) {
  return context => (String(context.options?.culturesSet || "").includes("Fantasy") ? candidateFn(context) : []);
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

function rareBiotaCells({pack}) {
  const biomes = new Set([5, 6, 7, 8, 9, 10, 11]);
  return pack.cells.i.filter(cell => {
    if (pack.cells.h[cell] < 20 || pack.cells.burg?.[cell]) return false;
    if (!biomes.has(pack.cells.biome?.[cell])) return false;
    const population = pack.cells.pop?.[cell] || 0;
    const waterOrHighland = Boolean(pack.cells.r?.[cell] || pack.cells.harbor?.[cell] || pack.cells.h[cell] >= 55);
    return population < 4 && waterOrHighland;
  });
}

function gemFieldCells({pack}) {
  return pack.cells.i.filter(cell => {
    if (pack.cells.h[cell] < 58 || pack.cells.h[cell] > 88 || pack.cells.burg?.[cell]) return false;
    const suitability = pack.cells.s?.[cell] || 0;
    return suitability > 0 || (pack.cells.c?.[cell] || []).some(neighbor => pack.cells.s?.[neighbor] > 0);
  });
}

function lowPopulationLandCells({pack}) {
  return pack.cells.i.filter(cell => pack.cells.h[cell] >= 20 && !pack.cells.burg?.[cell] && (pack.cells.pop?.[cell] || 0) < 2);
}

function populatedLandCells({pack}) {
  return pack.cells.i.filter(cell => pack.cells.h[cell] >= 20 && (pack.cells.pop?.[cell] || 0) > 2);
}

function isValidMarkerCell(pack, cell) {
  return Number.isInteger(cell) && cell >= 0 && cell < pack.cells.i.length && Number.isInteger(pack.cells.g[cell]) && pack.cells.g[cell] >= 0;
}

function markerOwner(pack, packCell) {
  let state = pack.cells.state?.[packCell] ?? 0;
  let province = pack.cells.province?.[packCell] ?? 0;
  if (state && province) return {state, province};

  for (const neighbor of pack.cells.c?.[packCell] || []) {
    if (pack.cells.h?.[neighbor] < 20) continue;
    if (!state && pack.cells.state?.[neighbor]) state = pack.cells.state[neighbor];
    if (!province && pack.cells.province?.[neighbor]) province = pack.cells.province[neighbor];
    if (state && province) break;
  }

  return {state, province};
}

function markerName(config, pack, packCell, id) {
  const owner = markerOwner(pack, packCell);
  const province = pack.provinces?.[owner.province];
  const burg = pack.burgs?.[pack.cells.burg?.[packCell]];
  const root = burg?.name || province?.name || `#${id + 1}`;
  const details = markerDetails(config);
  return root.startsWith("#") ? `${details.label} ${root}` : `${root}${details.label}`;
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
  const details = markerDetails({...MARKER_TYPE_BY_TYPE.get(type), type, icon});
  return {
    id,
    i: id,
    type,
    label: details.label,
    icon: details.icon,
    category: details.category,
    categoryLabel: details.categoryLabel,
    color: details.color,
    resourceKey: details.resourceKey,
    resourceLabel: details.resourceLabel,
    economicValue: details.economicValue,
    name,
    cell,
    x: point[0],
    y: point[1],
    data: {
      ...data,
      category: details.category,
      categoryLabel: details.categoryLabel,
      label: details.label,
      icon: details.icon,
      resourceKey: details.resourceKey,
      resourceLabel: details.resourceLabel,
      economicValue: details.economicValue
    }
  };
}

function markerDetails(config = {}) {
  const category = config.category || DEFAULT_MARKER_CATEGORY;
  const categoryDetails = MARKER_CATEGORY_DETAILS[category] || MARKER_CATEGORY_DETAILS[DEFAULT_MARKER_CATEGORY];
  return {
    label: config.label || config.type || "标记",
    icon: config.icon || "•",
    category,
    categoryLabel: categoryDetails.label,
    color: config.color || categoryDetails.color,
    resourceKey: config.resourceKey || null,
    resourceLabel: config.resourceLabel || null,
    economicValue: Number(config.economicValue || 0)
  };
}

function applyMarkerResourceEconomy(pack, markers) {
  resetMarkerEconomy(pack.states || []);
  resetMarkerEconomy(pack.provinces || []);

  const metadata = {
    economicMarkers: 0,
    resourceMarkers: 0,
    economicPotential: 0,
    resourcePotential: 0,
    categories: {},
    resources: {}
  };

  for (const marker of markers) {
    const value = Number(marker.economicValue || 0);
    if (value <= 0) continue;
    metadata.economicMarkers++;
    metadata.economicPotential += value;
    metadata.categories[marker.category] = (metadata.categories[marker.category] || 0) + value;

    if (marker.category === "resource") {
      metadata.resourceMarkers++;
      metadata.resourcePotential += value;
      const resourceKey = marker.resourceKey || marker.type;
      metadata.resources[resourceKey] = (metadata.resources[resourceKey] || 0) + value;
    }

    accumulateMarkerEconomy(pack.states?.[marker.data?.state], marker, value);
    accumulateMarkerEconomy(pack.provinces?.[marker.data?.province], marker, value);
  }

  const statesWithResources = finalizeMarkerEconomy(pack.states || []);
  const provincesWithResources = finalizeMarkerEconomy(pack.provinces || []);
  if (!pack.metadata) pack.metadata = {};
  pack.metadata.markerResourceEconomy = {
    ...metadata,
    economicPotential: round(metadata.economicPotential, 2),
    resourcePotential: round(metadata.resourcePotential, 2),
    categories: roundObject(metadata.categories),
    resources: roundObject(metadata.resources),
    statesWithResources,
    provincesWithResources
  };
}

function resetMarkerEconomy(groups) {
  for (const group of groups || []) {
    if (!group) continue;
    group.markerEconomicPotential = 0;
    group.markerEconomicMarkers = 0;
    group.resourcePotential = 0;
    group.resourceMarkers = 0;
    group.markerCategories = {};
    group.resourceTypes = {};
  }
}

function accumulateMarkerEconomy(group, marker, value) {
  if (!group || group.removed) return;
  group.markerEconomicPotential += value;
  group.markerEconomicMarkers++;
  group.markerCategories[marker.category] = (group.markerCategories[marker.category] || 0) + value;
  if (marker.category !== "resource") return;
  const resourceKey = marker.resourceKey || marker.type;
  group.resourcePotential += value;
  group.resourceMarkers++;
  group.resourceTypes[resourceKey] = (group.resourceTypes[resourceKey] || 0) + value;
}

function finalizeMarkerEconomy(groups) {
  let withResources = 0;
  for (const group of groups || []) {
    if (!group || group.removed) continue;
    group.markerEconomicPotential = round(group.markerEconomicPotential || 0, 2);
    group.resourcePotential = round(group.resourcePotential || 0, 2);
    group.markerCategories = roundObject(group.markerCategories || {});
    group.resourceTypes = roundObject(group.resourceTypes || {});
    if (group.resourcePotential > 0) withResources++;
  }
  return withResources;
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

function countByKey(items, getKey) {
  const counts = {};
  for (const item of items) {
    const key = getKey(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function roundObject(values) {
  return Object.fromEntries(Object.entries(values || {}).map(([key, value]) => [key, round(value, 2)]));
}

function round(value, digits = 0) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
