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

const MARKER_SYMBOL_BY_TYPE = Object.freeze({
  volcanoes: "volcano",
  "hot-springs": "spring",
  "water-sources": "drop",
  mines: "mine",
  "salt-lakes": "salt",
  "rare-biota": "life",
  "gem-fields": "gem",
  quarries: "mine",
  "clay-pits": "mine",
  coalfields: "mine",
  "sulfur-springs": "spring",
  "nitrate-caves": "ruin",
  "amber-coasts": "gem",
  "pearl-shoals": "gem",
  "coral-reefs": "life",
  fisheries: "drop",
  "good-harbors": "bridge",
  "lumber-camps": "life",
  "resin-forests": "life",
  "herb-valleys": "life",
  "dye-fields": "life",
  "spice-groves": "life",
  "tea-hills": "life",
  "silk-groves": "life",
  "horse-pastures": "market",
  "salt-meadows": "salt",
  oases: "drop",
  "sacred-springs": "spring",
  bridges: "bridge",
  inns: "inn",
  lighthouses: "tower",
  waterfalls: "drop",
  battlefields: "danger",
  dungeons: "ruin",
  "lake-monsters": "danger",
  "sea-monsters": "danger",
  "hill-monsters": "danger",
  "sacred-forests": "life",
  "sacred-pineries": "life",
  "sacred-palm-groves": "life",
  brigands: "danger",
  pirates: "danger",
  statues: "star",
  ruins: "ruin",
  libraries: "book",
  circuses: "market",
  jousts: "star",
  fairs: "market",
  canoes: "bridge",
  migration: "life",
  dances: "star",
  mirage: "star",
  caves: "ruin",
  portals: "star",
  rifts: "danger",
  "disturbed-burials": "danger",
  necropolises: "ruin",
  encounters: "marker"
});

const MARKER_SYMBOL_BY_CATEGORY = Object.freeze({
  natural: "volcano",
  water: "drop",
  resource: "mine",
  infrastructure: "bridge",
  trade: "market",
  hazard: "danger",
  culture: "star",
  settlement: "market",
  mystery: "marker"
});

const MARKER_PALETTE_BY_CATEGORY = Object.freeze({
  natural: "natural",
  water: "water",
  resource: "resource",
  infrastructure: "infrastructure",
  trade: "trade",
  hazard: "hazard",
  culture: "culture",
  settlement: "settlement",
  mystery: "mystery"
});

const MARKER_TYPES = [
  {type: "volcanoes", label: "火山", category: "natural", icon: "🌋", weight: 16, economicValue: 6, candidates: highCells(70)},
  {type: "hot-springs", label: "温泉", category: "resource", icon: "♨️", weight: 9, resourceKey: "geothermal", resourceLabel: "地热", economicValue: 8, candidates: highCultureCells(50)},
  {type: "water-sources", label: "水源", category: "water", icon: "💧", weight: 3, resourceKey: "freshwater", resourceLabel: "淡水", economicValue: 5, candidates: riverSources},
  {type: "mines", label: "矿山", category: "resource", icon: "⛏️", weight: 30, resourceKey: "ore", resourceLabel: "矿产", economicValue: 18, candidates: candidateUnion(mineBurgCells, mines)},
  {type: "salt-lakes", label: "盐湖", category: "resource", icon: "🧂", weight: 10, resourceKey: "salt", resourceLabel: "盐", economicValue: 14, candidates: saltLakeCells},
  {type: "rare-biota", label: "稀有生物", category: "resource", icon: "✦", weight: 10, resourceKey: "rare-biota", resourceLabel: "稀有生物", economicValue: 16, candidates: rareBiotaCells},
  {type: "gem-fields", label: "宝石矿脉", category: "resource", icon: "◇", weight: 6, resourceKey: "gems", resourceLabel: "宝石", economicValue: 22, candidates: gemFieldCells},
  {type: "quarries", label: "采石场", category: "resource", icon: "▣", weight: 6, resourceKey: "stone", resourceLabel: "石材", economicValue: 9, candidates: quarryCells},
  {type: "clay-pits", label: "黏土坑", category: "resource", icon: "▥", weight: 5, resourceKey: "clay", resourceLabel: "陶土", economicValue: 8, candidates: clayPitCells},
  {type: "coalfields", label: "煤田", category: "resource", icon: "◆", weight: 4, resourceKey: "coal", resourceLabel: "煤", economicValue: 15, candidates: coalfieldCells},
  {type: "sulfur-springs", label: "硫磺泉", category: "resource", icon: "♨", weight: 4, resourceKey: "sulfur", resourceLabel: "硫磺", economicValue: 12, candidates: sulfurSpringCells},
  {type: "nitrate-caves", label: "硝石洞", category: "resource", icon: "△", weight: 3, resourceKey: "nitrate", resourceLabel: "硝石", economicValue: 13, candidates: nitrateCaveCells},
  {type: "amber-coasts", label: "琥珀海岸", category: "resource", icon: "◈", weight: 3, resourceKey: "amber", resourceLabel: "琥珀", economicValue: 15, candidates: amberCoastCells},
  {type: "pearl-shoals", label: "珍珠滩", category: "resource", icon: "○", weight: 4, resourceKey: "pearls", resourceLabel: "珍珠", economicValue: 18, candidates: pearlShoalCells},
  {type: "coral-reefs", label: "珊瑚礁", category: "resource", icon: "✧", weight: 4, resourceKey: "coral", resourceLabel: "珊瑚", economicValue: 16, candidates: coralReefCells},
  {type: "fisheries", label: "渔场", category: "resource", icon: "⌁", weight: 8, resourceKey: "fish", resourceLabel: "渔获", economicValue: 10, candidates: fisheryCells},
  {type: "good-harbors", label: "良港", category: "resource", icon: "⌂", weight: 5, resourceKey: "harbor", resourceLabel: "良港", economicValue: 18, candidates: goodHarborCells},
  {type: "lumber-camps", label: "森林木场", category: "resource", icon: "♧", weight: 6, resourceKey: "timber", resourceLabel: "木材", economicValue: 11, candidates: lumberCampCells},
  {type: "resin-forests", label: "树脂林", category: "resource", icon: "♢", weight: 4, resourceKey: "resin", resourceLabel: "树脂", economicValue: 10, candidates: resinForestCells},
  {type: "herb-valleys", label: "药草谷", category: "resource", icon: "✤", weight: 5, resourceKey: "herbs", resourceLabel: "药草", economicValue: 12, candidates: herbValleyCells},
  {type: "dye-fields", label: "染料草场", category: "resource", icon: "✿", weight: 4, resourceKey: "dyes", resourceLabel: "染料", economicValue: 10, candidates: dyeFieldCells},
  {type: "spice-groves", label: "香料林", category: "resource", icon: "✺", weight: 3, resourceKey: "spices", resourceLabel: "香料", economicValue: 17, candidates: spiceGroveCells},
  {type: "tea-hills", label: "茶山", category: "resource", icon: "☘", weight: 4, resourceKey: "tea", resourceLabel: "茶", economicValue: 13, candidates: teaHillCells},
  {type: "silk-groves", label: "丝茧桑园", category: "resource", icon: "◇", weight: 3, resourceKey: "silk", resourceLabel: "丝茧", economicValue: 16, candidates: silkGroveCells},
  {type: "horse-pastures", label: "马场", category: "resource", icon: "♞", weight: 5, resourceKey: "horses", resourceLabel: "良马", economicValue: 14, candidates: horsePastureCells},
  {type: "salt-meadows", label: "牧盐草甸", category: "resource", icon: "▧", weight: 4, resourceKey: "salt-meadow", resourceLabel: "盐草", economicValue: 9, candidates: saltMeadowCells},
  {type: "oases", label: "绿洲", category: "resource", icon: "◌", weight: 4, resourceKey: "oasis", resourceLabel: "绿洲", economicValue: 12, candidates: oasisCells},
  {type: "sacred-springs", label: "圣泉", category: "resource", icon: "✦", weight: 3, resourceKey: "sacred-water", resourceLabel: "圣泉", economicValue: 14, candidates: sacredSpringCells},
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
const RESOURCE_MARKER_TYPES = Object.freeze(MARKER_TYPES.filter(config => config.category === "resource"));
const RESOURCE_MARKER_WEIGHT = RESOURCE_MARKER_TYPES.reduce((sum, config) => sum + config.weight, 0);

export const MARKER_TYPE_OPTIONS = Object.freeze(MARKER_TYPES.map(markerTypeOption));
export const MARKER_RESOURCE_TYPE_OPTIONS = Object.freeze(RESOURCE_MARKER_TYPES.map(markerTypeOption));

export function getMarkerTypeConfig(type) {
  return MARKER_TYPE_BY_TYPE.get(type) || MARKER_TYPE_BY_TYPE.get("encounters");
}

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
  const protectedFeatureIds = protectedObjectIds(options.lockedFeatures);
  const target = getTargetMarkerCount(pack, options);
  const totalWeight = MARKER_TYPES.reduce((sum, config) => sum + config.weight, 0);
  const context = {grid, pack, politics, rivers, options};

  for (const config of MARKER_TYPES) {
    const candidates = uniqueCells(config.candidates(context)).filter(cell =>
      isAvailableMarkerCell(pack, cell, occupied, protectedFeatureIds)
    );
    const quantity = Math.min(candidates.length, Math.max(0, Math.round((target * config.weight) / totalWeight)));
    addMarkersOfType(markers, occupied, pack, grid, random, config, candidates, quantity, {
      ordered: config.category === "resource",
      context
    });
  }

  if (markers.length < target) {
    const fallback = uniqueCells([...landCells({pack}), ...coastalWaterCells({pack}), ...deepWaterCells({pack})]).filter(cell =>
      isAvailableMarkerCell(pack, cell, occupied, protectedFeatureIds)
    );
    addMarkersOfType(markers, occupied, pack, grid, random, MARKER_TYPES.at(-1), fallback, target - markers.length);
  }

  applyMarkerResourceEconomy(pack, markers, options);
  return createMarkerResult(markers);
}

export function regenerateResourceMarkers(grid, pack, politics, rivers, options = {}, existingMarkers = []) {
  if (!pack?.cells?.i?.length) return [];

  const salt = options.resourceRegenerationSalt ?? options.markerRegenerationSalt ?? 0;
  const random = createRandom(`${options.seed}:resource-markers:${salt}`);
  const context = {grid, pack, politics, rivers, options};
  const occupied = new Set(existingMarkers.map(marker => marker?.packCell).filter(Number.isInteger));
  const protectedFeatureIds = protectedObjectIds(options.lockedFeatures);
  const markers = [];
  const lockedResourceCount = existingMarkers.filter(marker => marker?.category === "resource").length;
  const requestedTarget = Number(options.targetResourceCount);
  const generatedTarget = Math.max(3, Math.round((getTargetMarkerCount(pack, options) * RESOURCE_MARKER_WEIGHT) / MARKER_TYPES.reduce((sum, config) => sum + config.weight, 0)));
  const target = Number.isInteger(requestedTarget) && requestedTarget >= 0
    ? requestedTarget
    : Math.max(0, generatedTarget - lockedResourceCount);
  if (!target) return [];
  const quotas = markerTypeQuotas(RESOURCE_MARKER_TYPES, target);

  for (const config of RESOURCE_MARKER_TYPES) {
    const candidates = uniqueCells(config.candidates(context)).filter(cell =>
      isAvailableMarkerCell(pack, cell, occupied, protectedFeatureIds)
    );
    const quantity = Math.min(candidates.length, quotas.get(config.type) || 0);
    addMarkersOfType(markers, occupied, pack, grid, random, config, candidates, quantity, {ordered: true, context, idOffset: existingMarkers.length});
  }

  if (markers.length < target) {
    for (const config of [...RESOURCE_MARKER_TYPES].sort((a, b) => b.weight - a.weight)) {
      if (markers.length >= target) break;
      const candidates = uniqueCells(config.candidates(context)).filter(cell =>
        isAvailableMarkerCell(pack, cell, occupied, protectedFeatureIds)
      );
      addMarkersOfType(markers, occupied, pack, grid, random, config, candidates, target - markers.length, {ordered: true, context, idOffset: existingMarkers.length});
    }
  }

  return markers;
}

export function createMarkerAtPackCell(markers, pack, grid, type, packCell, overrides = {}) {
  if (!isValidMarkerCell(pack, packCell)) throw new Error(`无效的标记 pack cell: ${packCell}`);
  const config = getMarkerTypeConfig(type);
  const id = Number.isInteger(overrides.id) ? overrides.id : nextMarkerId(markers);
  const marker = createMarker(id, config, pack, grid, packCell);
  if (typeof overrides.name === "string") marker.name = overrides.name;
  if (overrides.visual) {
    marker.visual = {...overrides.visual};
    marker.data.visual = {...overrides.visual};
  }
  if (typeof overrides.pinned === "boolean") marker.pinned = overrides.pinned;
  if (typeof overrides.lock === "boolean") marker.lock = overrides.lock;
  return marker;
}

export function refreshMarkerResourceEconomy(pack, markers, options = {}) {
  applyMarkerResourceEconomy(pack, markers, options);
}

function addMarkersOfType(markers, occupied, pack, grid, random, config, candidates, quantity, options = {}) {
  const pool = options.ordered ? rankMarkerCandidates(options.context, config, candidates, random) : shuffle(candidates, random);
  for (const packCell of pool.slice(0, quantity)) {
    occupied.add(packCell);
    markers.push(createMarker((options.idOffset || 0) + markers.length, config, pack, grid, packCell));
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
    visual: details.visual,
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
      economicValue: details.economicValue,
      visual: details.visual
    }
  };
}

export function createMarkerResult(markers) {
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

function markerTypeOption(config) {
  const details = markerDetails(config);
  return {
    type: config.type,
    value: config.type,
    label: details.label,
    category: details.category,
    categoryLabel: details.categoryLabel,
    resourceKey: details.resourceKey,
    resourceLabel: details.resourceLabel,
    economicValue: details.economicValue,
    visual: details.visual
  };
}

function markerTypeQuotas(configs, target) {
  const totalWeight = configs.reduce((sum, config) => sum + config.weight, 0);
  const quotas = new Map();
  const fractions = [];
  let assigned = 0;

  for (const config of configs) {
    const exact = (target * config.weight) / totalWeight;
    const base = Math.floor(exact);
    quotas.set(config.type, base);
    assigned += base;
    fractions.push({type: config.type, fraction: exact - base, weight: config.weight});
  }

  fractions.sort((a, b) => (b.fraction - a.fraction) || (b.weight - a.weight));
  for (let index = 0; assigned < target && fractions.length; index++, assigned++) {
    const item = fractions[index % fractions.length];
    quotas.set(item.type, (quotas.get(item.type) || 0) + 1);
  }

  return quotas;
}

function rankMarkerCandidates(context, config, candidates, random) {
  if (config.category !== "resource") return shuffle(candidates, random);
  return candidates
    .map(cell => ({
      cell,
      score: resourceCandidateScore(context, config, cell) * (0.86 + random.next() * 0.28)
    }))
    .sort((a, b) => b.score - a.score)
    .map(item => item.cell);
}

function resourceCandidateScore({grid, pack}, config, packCell) {
  const gridCell = pack.cells.g?.[packCell];
  const height = Number(pack.cells.h?.[packCell] ?? grid?.cells?.h?.[gridCell] ?? 0);
  const temperature = Number(grid?.cells?.temp?.[gridCell] ?? 10);
  const precipitation = Number(grid?.cells?.prec?.[gridCell] ?? 50);
  const suitability = Number(pack.cells.s?.[packCell] || 0);
  const population = Number(pack.cells.pop?.[packCell] || 0);
  const biome = pack.cells.biome?.[packCell] ?? grid?.cells?.biome?.[gridCell] ?? 0;
  const neighbors = pack.cells.c?.[packCell] || [];
  const hasRiver = Boolean(pack.cells.r?.[packCell] || (pack.cells.fl?.[packCell] || 0) > 0);
  const nearRiver = hasRiver || neighbors.some(neighbor => pack.cells.r?.[neighbor] || (pack.cells.fl?.[neighbor] || 0) > 0);
  const nearLand = neighbors.some(neighbor => pack.cells.h?.[neighbor] >= 20);
  const feature = pack.features?.[pack.cells.f?.[packCell]];
  const isLake = feature?.type === "lake";
  const roughness = terrainRoughness(pack, packCell, neighbors);
  const dry = clamp01((80 - precipitation) / 80);
  const wet = clamp01(precipitation / 120);
  const warmth = clamp01((temperature + 8) / 36);
  const moderateTemperature = 1 - Math.min(1, Math.abs(temperature - 12) / 28);
  const remote = 1 - Math.min(1, population / 8);

  switch (config.type) {
    case "hot-springs":
      return 1 + bell(height, 62, 34) * 1.8 + roughness * 0.9 + (nearRiver ? 0.45 : 0) + moderateTemperature * 0.45;
    case "mines":
      return 1 + bell(height, 58, 30) * 2.2 + roughness * 1.4 + clamp01(suitability / 70) * 0.35 + remote * 0.25;
    case "salt-lakes":
      return 1 + (isLake ? 1.4 : 0) + dry * 1.7 + warmth * 0.75 + (nearLand ? 0.45 : 0) + (precipitation <= 25 ? 0.5 : 0);
    case "rare-biota":
      return 1 + rareBiomeScore(biome) * 1.35 + wet * 0.8 + moderateTemperature * 0.75 + (nearRiver ? 0.65 : 0) + remote * 0.55 + (height >= 55 ? 0.35 : 0);
    case "gem-fields":
      return 1 + bell(height, 72, 24) * 2.1 + roughness * 1.2 + remote * 0.35 + clamp01((100 - precipitation) / 100) * 0.3;
    case "quarries":
      return 1 + bell(height, 48, 30) * 1.45 + roughness * 1.35 + clamp01(suitability / 90) * 0.45 + (population > 0 ? 0.25 : 0);
    case "clay-pits":
      return 1 + bell(height, 28, 18) * 1.45 + (nearRiver ? 0.85 : 0) + wet * 0.45 + clamp01(suitability / 70) * 0.35;
    case "coalfields":
      return 1 + bell(height, 50, 28) * 1.6 + roughness * 0.95 + forestBiomeScore(biome) * 0.5 + remote * 0.3;
    case "sulfur-springs":
      return 1 + bell(height, 64, 26) * 1.7 + roughness * 1.1 + (hasRiver ? 0.45 : 0) + warmth * 0.35;
    case "nitrate-caves":
      return 1 + bell(height, 48, 30) * 1.3 + dry * 1.25 + roughness * 0.8 + remote * 0.35;
    case "amber-coasts":
      return 1 + forestBiomeScore(biome) * 1.1 + wet * 0.45 + moderateTemperature * 0.45 + (nearLand ? 0.3 : 0);
    case "pearl-shoals":
      return 1 + warmth * 1.25 + (nearLand ? 0.55 : 0) + clamp01((precipitation + 20) / 150) * 0.25;
    case "coral-reefs":
      return 1 + warmth * 1.45 + (nearLand ? 0.35 : 0) + clamp01((height + 20) / 20) * 0.5;
    case "fisheries":
      return 1 + (nearLand ? 0.75 : 0) + (nearRiver ? 0.5 : 0) + moderateTemperature * 0.35 + clamp01(population / 12) * 0.3;
    case "good-harbors":
      return 1 + (pack.cells.harbor?.[packCell] ? 1.4 : 0) + clamp01(population / 10) * 0.55 + (nearLand ? 0.45 : 0);
    case "lumber-camps":
      return 1 + forestBiomeScore(biome) * 1.45 + clamp01(suitability / 80) * 0.45 + (nearRiver ? 0.35 : 0);
    case "resin-forests":
      return 1 + resinBiomeScore(biome) * 1.55 + dry * 0.35 + remote * 0.3;
    case "herb-valleys":
      return 1 + moderateTemperature * 0.85 + wet * 0.55 + (nearRiver ? 0.75 : 0) + bell(height, 45, 30) * 0.65;
    case "dye-fields":
      return 1 + openBiomeScore(biome) * 1.1 + warmth * 0.55 + wet * 0.35 + clamp01(suitability / 75) * 0.35;
    case "spice-groves":
      return 1 + warmth * 1.35 + wet * 0.85 + forestBiomeScore(biome) * 0.55 + remote * 0.25;
    case "tea-hills":
      return 1 + bell(height, 54, 26) * 1.45 + wet * 0.8 + moderateTemperature * 0.65 + roughness * 0.3;
    case "silk-groves":
      return 1 + moderateTemperature * 0.75 + wet * 0.45 + clamp01(suitability / 75) * 0.55 + (population > 0 ? 0.35 : 0);
    case "horse-pastures":
      return 1 + openBiomeScore(biome) * 1.25 + bell(height, 34, 24) * 0.75 + clamp01(suitability / 70) * 0.55 + dry * 0.25;
    case "salt-meadows":
      return 1 + dry * 1.1 + openBiomeScore(biome) * 0.8 + (nearLand ? 0.35 : 0) + warmth * 0.3;
    case "oases":
      return 1 + dry * 1.55 + (nearRiver ? 1.2 : 0) + warmth * 0.35 + clamp01(suitability / 65) * 0.35;
    case "sacred-springs":
      return 1 + (hasRiver ? 1.1 : 0) + moderateTemperature * 0.55 + clamp01(suitability / 70) * 0.4 + (pack.cells.culture?.[packCell] ? 0.35 : 0);
    default:
      return 1;
  }
}

function forestBiomeScore(biome) {
  if ([6, 7, 8, 9].includes(biome)) return 1;
  if ([5, 10].includes(biome)) return 0.55;
  return 0.15;
}

function resinBiomeScore(biome) {
  if ([8, 9].includes(biome)) return 1;
  if ([6, 7, 10].includes(biome)) return 0.55;
  return 0.1;
}

function openBiomeScore(biome) {
  if ([3, 4, 5].includes(biome)) return 1;
  if ([1, 2].includes(biome)) return 0.65;
  return 0.2;
}

function rareBiomeScore(biome) {
  if ([6, 7, 8, 9, 10, 11].includes(biome)) return 1;
  if ([4, 5].includes(biome)) return 0.65;
  return 0.25;
}

function terrainRoughness(pack, packCell, neighbors = []) {
  const height = pack.cells.h?.[packCell] ?? 0;
  const landNeighbors = neighbors.filter(neighbor => pack.cells.h?.[neighbor] >= 20);
  if (!landNeighbors.length) return 0;
  const averageDelta = landNeighbors.reduce((sum, neighbor) => sum + Math.abs(height - (pack.cells.h?.[neighbor] ?? height)), 0) / landNeighbors.length;
  return clamp01(averageDelta / 38);
}

function bell(value, center, width) {
  const distance = Math.abs(value - center) / Math.max(1, width);
  return Math.max(0, 1 - distance * distance);
}

function nextMarkerId(markers) {
  return (markers || []).reduce((max, marker) => Math.max(max, Number(marker?.id) || 0), -1) + 1;
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

function hasWaterNeighbor(pack, cell) {
  return (pack.cells.c?.[cell] || []).some(neighbor => pack.cells.h?.[neighbor] < 20);
}

function isCoastalLandCell(pack, cell) {
  return pack.cells.h?.[cell] >= 20 && hasWaterNeighbor(pack, cell);
}

function isCoastalWaterCell(pack, cell) {
  return pack.cells.h?.[cell] < 20 && (pack.cells.c?.[cell] || []).some(neighbor => pack.cells.h?.[neighbor] >= 20);
}

function isLakeWaterCell(pack, cell) {
  return pack.features?.[pack.cells.f?.[cell]]?.type === "lake";
}

function hasSaltLakeNeighbor(pack, cell) {
  return (pack.cells.c?.[cell] || []).some(neighbor => {
    const feature = pack.features?.[pack.cells.f?.[neighbor]];
    return feature?.type === "lake" && pack.cells.h?.[neighbor] < 20;
  });
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

function quarryCells({pack}) {
  return pack.cells.i.filter(cell => {
    if (pack.cells.h[cell] < 32 || pack.cells.h[cell] > 78 || pack.cells.burg?.[cell]) return false;
    return terrainRoughness(pack, cell, pack.cells.c?.[cell] || []) >= 0.18 || pack.cells.h[cell] >= 55;
  });
}

function clayPitCells({grid, pack}) {
  return pack.cells.i.filter(cell => {
    if (pack.cells.h[cell] < 20 || pack.cells.h[cell] > 48 || pack.cells.burg?.[cell]) return false;
    const gridCell = pack.cells.g[cell];
    const precipitation = grid.cells.prec?.[gridCell] ?? 100;
    return precipitation >= 25 && (pack.cells.r?.[cell] || hasWaterNeighbor(pack, cell) || (pack.cells.s?.[cell] || 0) > 20);
  });
}

function coalfieldCells({pack}) {
  return pack.cells.i.filter(cell => {
    if (pack.cells.h[cell] < 30 || pack.cells.h[cell] > 74 || pack.cells.burg?.[cell]) return false;
    return [5, 6, 7, 8, 9].includes(pack.cells.biome?.[cell]) || terrainRoughness(pack, cell, pack.cells.c?.[cell] || []) > 0.22;
  });
}

function sulfurSpringCells({grid, pack}) {
  return pack.cells.i.filter(cell => {
    if (pack.cells.h[cell] < 45 || pack.cells.h[cell] > 90 || pack.cells.burg?.[cell]) return false;
    const gridCell = pack.cells.g[cell];
    const temperature = grid.cells.temp?.[gridCell] ?? 0;
    return temperature >= -5 && (pack.cells.r?.[cell] || terrainRoughness(pack, cell, pack.cells.c?.[cell] || []) > 0.24);
  });
}

function nitrateCaveCells({grid, pack}) {
  return pack.cells.i.filter(cell => {
    if (pack.cells.h[cell] < 32 || pack.cells.h[cell] > 78 || pack.cells.burg?.[cell]) return false;
    const gridCell = pack.cells.g[cell];
    const precipitation = grid.cells.prec?.[gridCell] ?? 100;
    return precipitation <= 45 || [1, 2, 3].includes(pack.cells.biome?.[cell]);
  });
}

function amberCoastCells({pack}) {
  return pack.cells.i.filter(cell => pack.cells.h[cell] >= 20 && !pack.cells.burg?.[cell] && isCoastalLandCell(pack, cell) && [6, 7, 8, 9, 10].includes(pack.cells.biome?.[cell]));
}

function pearlShoalCells({grid, pack}) {
  return pack.cells.i.filter(cell => {
    if (!isCoastalWaterCell(pack, cell) || isLakeWaterCell(pack, cell)) return false;
    const gridCell = pack.cells.g[cell];
    const temperature = grid.cells.temp?.[gridCell] ?? 0;
    return temperature >= 12 && (pack.cells.t?.[cell] ?? 0) >= -2;
  });
}

function coralReefCells({grid, pack}) {
  return pack.cells.i.filter(cell => {
    if (!isCoastalWaterCell(pack, cell) || isLakeWaterCell(pack, cell)) return false;
    const gridCell = pack.cells.g[cell];
    const temperature = grid.cells.temp?.[gridCell] ?? 0;
    return temperature >= 20 && (pack.cells.t?.[cell] ?? 0) >= -3;
  });
}

function fisheryCells({pack}) {
  return pack.cells.i.filter(cell => {
    if (pack.cells.h[cell] >= 20) return false;
    if (isLakeWaterCell(pack, cell)) return true;
    return isCoastalWaterCell(pack, cell) || (pack.cells.c?.[cell] || []).some(neighbor => pack.cells.r?.[neighbor] || pack.cells.harbor?.[neighbor]);
  });
}

function goodHarborCells({pack}) {
  const burgPorts = ports({pack});
  const coastalLand = pack.cells.i.filter(cell => pack.cells.h[cell] >= 20 && isCoastalLandCell(pack, cell) && (pack.cells.harbor?.[cell] || (pack.cells.s?.[cell] || 0) > 20));
  return [...burgPorts, ...coastalLand];
}

function lumberCampCells({pack}) {
  return pack.cells.i.filter(cell => pack.cells.h[cell] >= 20 && !pack.cells.burg?.[cell] && [6, 7, 8, 9].includes(pack.cells.biome?.[cell]));
}

function resinForestCells({pack}) {
  return pack.cells.i.filter(cell => pack.cells.h[cell] >= 20 && !pack.cells.burg?.[cell] && [8, 9].includes(pack.cells.biome?.[cell]));
}

function herbValleyCells({grid, pack}) {
  return pack.cells.i.filter(cell => {
    if (pack.cells.h[cell] < 24 || pack.cells.h[cell] > 68 || pack.cells.burg?.[cell]) return false;
    const gridCell = pack.cells.g[cell];
    const precipitation = grid.cells.prec?.[gridCell] ?? 100;
    return precipitation >= 45 && (pack.cells.r?.[cell] || hasWaterNeighbor(pack, cell) || [5, 6, 7].includes(pack.cells.biome?.[cell]));
  });
}

function dyeFieldCells({grid, pack}) {
  return pack.cells.i.filter(cell => {
    if (pack.cells.h[cell] < 20 || pack.cells.h[cell] > 55 || pack.cells.burg?.[cell]) return false;
    const gridCell = pack.cells.g[cell];
    const temperature = grid.cells.temp?.[gridCell] ?? 0;
    return temperature >= 4 && [3, 4, 5, 6].includes(pack.cells.biome?.[cell]) && (pack.cells.s?.[cell] || 0) > 0;
  });
}

function spiceGroveCells({grid, pack}) {
  return pack.cells.i.filter(cell => {
    if (pack.cells.h[cell] < 20 || pack.cells.h[cell] > 62 || pack.cells.burg?.[cell]) return false;
    const gridCell = pack.cells.g[cell];
    const temperature = grid.cells.temp?.[gridCell] ?? 0;
    const precipitation = grid.cells.prec?.[gridCell] ?? 0;
    return temperature >= 18 && precipitation >= 60 && [1, 2, 6, 7].includes(pack.cells.biome?.[cell]);
  });
}

function teaHillCells({grid, pack}) {
  return pack.cells.i.filter(cell => {
    if (pack.cells.h[cell] < 32 || pack.cells.h[cell] > 74 || pack.cells.burg?.[cell]) return false;
    const gridCell = pack.cells.g[cell];
    const precipitation = grid.cells.prec?.[gridCell] ?? 0;
    const temperature = grid.cells.temp?.[gridCell] ?? 0;
    return precipitation >= 45 && temperature >= 2 && temperature <= 24 && [5, 6, 7, 8].includes(pack.cells.biome?.[cell]);
  });
}

function silkGroveCells({grid, pack}) {
  return pack.cells.i.filter(cell => {
    if (pack.cells.h[cell] < 20 || pack.cells.h[cell] > 55) return false;
    const gridCell = pack.cells.g[cell];
    const temperature = grid.cells.temp?.[gridCell] ?? 0;
    return temperature >= 8 && temperature <= 26 && (pack.cells.s?.[cell] || 0) > 15 && [4, 5, 6, 7].includes(pack.cells.biome?.[cell]);
  });
}

function horsePastureCells({pack}) {
  return pack.cells.i.filter(cell => pack.cells.h[cell] >= 20 && pack.cells.h[cell] <= 55 && !pack.cells.burg?.[cell] && [3, 4, 5].includes(pack.cells.biome?.[cell]) && (pack.cells.s?.[cell] || 0) > 0);
}

function saltMeadowCells({grid, pack}) {
  return pack.cells.i.filter(cell => {
    if (pack.cells.h[cell] < 20 || pack.cells.h[cell] > 42 || pack.cells.burg?.[cell]) return false;
    const gridCell = pack.cells.g[cell];
    const precipitation = grid.cells.prec?.[gridCell] ?? 100;
    return precipitation <= 45 && [2, 3, 4].includes(pack.cells.biome?.[cell]) && (isCoastalLandCell(pack, cell) || hasSaltLakeNeighbor(pack, cell));
  });
}

function oasisCells({grid, pack}) {
  return pack.cells.i.filter(cell => {
    if (pack.cells.h[cell] < 20 || pack.cells.h[cell] > 45 || pack.cells.burg?.[cell]) return false;
    const gridCell = pack.cells.g[cell];
    const precipitation = grid.cells.prec?.[gridCell] ?? 100;
    return precipitation <= 35 && [1, 2, 3].includes(pack.cells.biome?.[cell]) && (pack.cells.r?.[cell] || hasWaterNeighbor(pack, cell));
  });
}

function sacredSpringCells({pack}) {
  return pack.cells.i.filter(cell => pack.cells.h[cell] >= 20 && !pack.cells.burg?.[cell] && (pack.cells.r?.[cell] || hasWaterNeighbor(pack, cell)) && (pack.cells.culture?.[cell] || pack.cells.religion?.[cell]));
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
    visual: details.visual,
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
      economicValue: details.economicValue,
      visual: details.visual
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
    economicValue: Number(config.economicValue || 0),
    visual: normalizeMarkerVisual(config, categoryDetails)
  };
}

function normalizeMarkerVisual(config, categoryDetails) {
  const category = config.category || DEFAULT_MARKER_CATEGORY;
  const visual = config.visual || {};
  return {
    shape: visual.shape || "pin",
    symbol: visual.symbol || MARKER_SYMBOL_BY_TYPE[config.type] || MARKER_SYMBOL_BY_CATEGORY[category] || "marker",
    palette: visual.palette || MARKER_PALETTE_BY_CATEGORY[category] || DEFAULT_MARKER_CATEGORY,
    cultureStyle: visual.cultureStyle || "default",
    manual: Boolean(visual.manual),
    categoryColor: visual.categoryColor || categoryDetails.color
  };
}

function applyMarkerResourceEconomy(pack, markers, options = {}) {
  const protectedStateIds = protectedObjectIds(options.lockedStates);
  const protectedProvinceIds = protectedObjectIds(options.lockedProvinces);
  for (const province of pack.provinces || []) {
    if (province && protectedStateIds.has(Number(province.state))) {
      protectedProvinceIds.add(Number(province.i ?? province.id));
    }
  }
  resetMarkerEconomy(pack.states || [], protectedStateIds);
  resetMarkerEconomy(pack.provinces || [], protectedProvinceIds);

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

    accumulateMarkerEconomy(pack.states?.[marker.data?.state], marker, value, protectedStateIds);
    accumulateMarkerEconomy(pack.provinces?.[marker.data?.province], marker, value, protectedProvinceIds);
  }

  const statesWithResources = finalizeMarkerEconomy(pack.states || [], protectedStateIds);
  const provincesWithResources = finalizeMarkerEconomy(pack.provinces || [], protectedProvinceIds);
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

function resetMarkerEconomy(groups, protectedIds = new Set()) {
  for (const group of groups || []) {
    if (!group || protectedIds.has(Number(group.i ?? group.id))) continue;
    group.markerEconomicPotential = 0;
    group.markerEconomicMarkers = 0;
    group.resourcePotential = 0;
    group.resourceMarkers = 0;
    group.markerCategories = {};
    group.resourceTypes = {};
  }
}

function accumulateMarkerEconomy(group, marker, value, protectedIds = new Set()) {
  if (!group || group.removed || protectedIds.has(Number(group.i ?? group.id))) return;
  group.markerEconomicPotential += value;
  group.markerEconomicMarkers++;
  group.markerCategories[marker.category] = (group.markerCategories[marker.category] || 0) + value;
  if (marker.category !== "resource") return;
  const resourceKey = marker.resourceKey || marker.type;
  group.resourcePotential += value;
  group.resourceMarkers++;
  group.resourceTypes[resourceKey] = (group.resourceTypes[resourceKey] || 0) + value;
}

function finalizeMarkerEconomy(groups, protectedIds = new Set()) {
  let withResources = 0;
  for (const group of groups || []) {
    if (!group || group.removed) continue;
    if (protectedIds.has(Number(group.i ?? group.id))) {
      if (Number(group.resourcePotential) > 0) withResources++;
      continue;
    }
    group.markerEconomicPotential = round(group.markerEconomicPotential || 0, 2);
    group.resourcePotential = round(group.resourcePotential || 0, 2);
    group.markerCategories = roundObject(group.markerCategories || {});
    group.resourceTypes = roundObject(group.resourceTypes || {});
    if (group.resourcePotential > 0) withResources++;
  }
  return withResources;
}

function protectedObjectIds(snapshots = []) {
  return new Set((snapshots || [])
    .map(snapshot => Number(snapshot?.i ?? snapshot?.id))
    .filter(Number.isInteger));
}

function isAvailableMarkerCell(pack, cell, occupied, protectedFeatureIds) {
  return isValidMarkerCell(pack, cell)
    && !occupied.has(cell)
    && !protectedFeatureIds.has(Number(pack.cells.f?.[cell]));
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

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}
