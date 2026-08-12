import {normalizeMapCellTarget} from "./map-size.js";

export const MAP_TEMPLATE_CATALOG_VERSION = "1.0.0";

export const MAP_TEMPLATE_SOURCES = deepFreeze({
  "natural-earth-5.1.2": {
    name: "Natural Earth 5.1.2",
    role: "海岸线、湖泊与河流矢量基线",
    url: "https://www.naturalearthdata.com/",
    license: "Public Domain",
    licenseUrl: "https://www.naturalearthdata.com/about/terms-of-use/",
    attribution: "Natural Earth"
  },
  "gebco-2026": {
    name: "GEBCO_2026 Grid",
    role: "全球陆地高程与海底地形基线",
    url: "https://www.gebco.net/data-products/gridded-bathymetry-data",
    license: "Public Domain",
    licenseUrl: "https://www.gebco.net/data-products/gridded-bathymetry-data",
    attribution: "GEBCO Bathymetric Compilation Group 2026",
    doi: "10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa"
  },
  "roman-empire-117-commons": {
    name: "RomanEmpire 117.svg",
    role: "公元 117 年罗马帝国最大疆域历史口径",
    url: "https://commons.wikimedia.org/wiki/File:RomanEmpire_117.svg",
    license: "Public Domain",
    licenseUrl: "https://commons.wikimedia.org/wiki/File:RomanEmpire_117.svg",
    attribution: "ArdadN"
  },
  "holy-roman-empire-1789-commons": {
    name: "Map of Holy Roman Empire 1789.svg",
    role: "1789 年神圣罗马帝国历史口径",
    url: "https://commons.wikimedia.org/wiki/File:Map_of_Holy_Roman_Empire_1789.svg",
    license: "CC0-1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    attribution: "Alphathon"
  }
});

const PHYSICAL_LAYERS = Object.freeze(["land", "elevation", "hydrology", "region-mask"]);
const HISTORICAL_LAYERS = Object.freeze([...PHYSICAL_LAYERS, "political"]);
const PHYSICAL_SOURCES = Object.freeze(["natural-earth-5.1.2", "gebco-2026"]);

const definitions = [
  geographic("world", "世界地图", [-180, -90, 180, 90], [10_000, 50_000, 100_000], [
    anchor("antimeridian", "国际日期变更线", 180, 0, "continuity", 10_000)
  ], {projection: "equal-earth", wrapLongitude: true}),
  geographic("china", "中国地图", [72, 3, 136, 54], [10_000, 50_000, 100_000], [
    anchor("south-tibet", "藏南", 94.5, 28.5, "region", 10_000),
    anchor("aksai-chin", "阿克赛钦", 79.5, 35.3, "region", 10_000),
    anchor("taiwan", "台湾", 121, 23.7, "island", 10_000),
    anchor("paracel-islands", "南海诸岛（西沙）", 112.2, 16.5, "island-group", 10_000),
    anchor("spratly-islands", "南海诸岛（南沙）", 114, 10, "island-group", 10_000),
    anchor("diaoyu-islands", "钓鱼岛", 123.5, 25.75, "island-group", 10_000)
  ]),
  geographic("europe", "欧洲地图", [-25, 34, 45, 72], [10_000, 50_000, 100_000], [
    anchor("british-isles", "不列颠群岛", -3, 55, "island-group", 10_000),
    anchor("iceland", "冰岛", -19, 65, "island", 10_000)
  ]),
  geographic("north-america", "北美地图", [-170, 7, -20, 84], [10_000, 50_000, 100_000], [
    anchor("greenland", "格陵兰", -42, 72, "island", 10_000),
    anchor("central-america", "中美地峡", -84, 10, "land-bridge", 10_000)
  ]),
  geographic("south-america", "南美地图", [-82, -56, -34, 13], [10_000, 50_000, 100_000], [
    anchor("tierra-del-fuego", "火地岛", -68.5, -54, "island", 10_000)
  ]),
  geographic("africa", "非洲地图", [-18, -36, 52, 38], [10_000, 50_000, 100_000], [
    anchor("madagascar", "马达加斯加", 47, -19, "island", 10_000)
  ]),
  geographic("asia", "亚洲地图", [25, -12, 180, 82], [10_000, 50_000, 100_000], [
    anchor("japan", "日本列岛", 138, 37, "island-group", 10_000),
    anchor("southeast-asia", "东南亚群岛", 118, 2, "island-group", 10_000)
  ]),
  geographic("east-asia", "东亚地图", [66, 19, 147, 57], [10_000, 50_000, 100_000], [
    anchor("seven-rivers", "七河平原西界", 67, 44, "extent", 10_000),
    anchor("lake-baikal", "贝加尔湖北界", 108, 56, "extent", 10_000),
    anchor("hokkaido", "北海道东界", 145.5, 43, "extent", 10_000),
    anchor("hanoi", "河内南界", 105.85, 21.03, "extent", 10_000)
  ]),
  geographic("australia-oceania", "澳洲、巴布亚新几内亚与新西兰地图", [110, -49, 180, -2], [10_000, 50_000, 100_000], [
    anchor("australia", "澳大利亚", 134, -25, "landmass", 10_000),
    anchor("new-guinea", "巴布亚新几内亚岛", 145, -6, "island", 10_000),
    anchor("new-zealand", "新西兰", 172, -41, "island-group", 10_000)
  ]),
  geographic("antarctica", "南极洲地图", [-180, -90, 180, -60], [10_000, 50_000, 100_000], [
    anchor("antarctic-peninsula", "南极半岛", -63, -66, "peninsula", 10_000)
  ], {projection: "south-polar-stereographic", wrapLongitude: true}),
  geographic("central-plains", "中原地图", [103.5, 24.5, 124, 43.5], [10_000, 50_000, 100_000], [
    anchor("lanzhou", "兰州西界", 103.84, 36.06, "extent", 10_000),
    anchor("inner-mongolia", "内蒙古中部北界", 111.7, 42.8, "extent", 10_000),
    anchor("zhejiang-fujian", "浙闽交界南界", 120.2, 27.3, "extent", 10_000),
    anchor("east-china-sea", "东海东界", 123.5, 30, "extent", 10_000)
  ]),
  geographic("honshu", "日本本州岛地图", [129, 30, 143, 42], [10_000, 50_000, 100_000], [
    anchor("honshu-island", "本州岛", 138, 36.5, "island", 1_000)
  ]),
  geographic("korean-peninsula", "朝鲜半岛地图", [124, 32, 132, 44], [10_000, 50_000, 100_000], [
    anchor("korean-peninsula", "朝鲜半岛", 127.5, 38, "peninsula", 1_000)
  ]),
  geographic("middle-east", "中东地图", [25, 11, 65, 43], [10_000, 50_000, 100_000], [
    anchor("arabian-peninsula", "阿拉伯半岛", 46, 24, "peninsula", 10_000),
    anchor("mesopotamia", "美索不达米亚", 44, 33, "region", 10_000)
  ]),
  historical("holy-roman-empire-1789", "神圣罗马帝国（1789）", [2, 42, 25, 56], 1789, "holy-roman-empire-1789-commons", [
    anchor("holy-roman-empire", "神圣罗马帝国疆域", 10.5, 50, "historical-region", 10_000)
  ]),
  historical("roman-empire-117", "罗马帝国地中海（公元117年）", [-12, 20, 48, 56], 117, "roman-empire-117-commons", [
    anchor("rome", "罗马", 12.5, 41.9, "historical-capital", 10_000),
    anchor("mediterranean", "地中海", 18, 35, "sea", 10_000)
  ])
];

export const MAP_TEMPLATE_MANIFESTS = deepFreeze(definitions.map((definition, order) => ({
  catalogVersion: MAP_TEMPLATE_CATALOG_VERSION,
  order,
  version: "1.0.0",
  ...definition
})));

const manifestsById = new Map(MAP_TEMPLATE_MANIFESTS.map(manifest => [manifest.id, manifest]));

export function listMapTemplateManifests() {
  return MAP_TEMPLATE_MANIFESTS;
}

export function getMapTemplateManifest(id) {
  return manifestsById.get(String(id || "").trim()) || null;
}

export function normalizeMapTemplateRequest(input = {}, fallbackCells = 10_000) {
  const manifest = getMapTemplateManifest(input.templateId);
  if (!manifest) throw new Error(`未知地图模板：${String(input.templateId || "").trim() || "（空）"}`);
  return deepFreeze({
    templateId: manifest.id,
    templateVersion: manifest.version,
    cellsTarget: normalizeMapCellTarget(input.cellsTarget, {fallback: fallbackCells}),
    seed: String(input.seed || `${manifest.id}-default`).trim() || `${manifest.id}-default`
  });
}

function geographic(id, name, bounds, recommendedCells, protectedAnchors, options = {}) {
  return {
    id,
    name,
    category: "geographic",
    description: `${name}的真实地理底图模板`,
    bounds: normalizedBounds(bounds),
    projection: projection(options.projection || "regional-equirectangular", bounds, options.wrapLongitude),
    recommendedCells,
    snapshotYear: null,
    sourceIds: [...PHYSICAL_SOURCES],
    layers: [...PHYSICAL_LAYERS],
    resourceKeys: {physical: "world-physical-2026-v1", political: null},
    protectedAnchors,
    humanPreset: null
  };
}

function historical(id, name, bounds, snapshotYear, historicalSourceId, protectedAnchors) {
  return {
    id,
    name,
    category: "historical",
    description: `${name}的固定年代地理与政治场景模板`,
    bounds: normalizedBounds(bounds),
    projection: projection("regional-equirectangular", bounds, false),
    recommendedCells: [10_000, 50_000, 100_000],
    snapshotYear,
    sourceIds: [...PHYSICAL_SOURCES, historicalSourceId],
    layers: [...HISTORICAL_LAYERS],
    resourceKeys: {physical: "world-physical-2026-v1", political: `${id}-political-v1`},
    protectedAnchors,
    humanPreset: `${id}-human-v1`
  };
}

function normalizedBounds([west, south, east, north]) {
  return {west, south, east, north};
}

function projection(id, bounds, wrapLongitude = false) {
  return {
    id,
    centerLongitude: roundCoordinate((bounds[0] + bounds[2]) / 2),
    centerLatitude: roundCoordinate((bounds[1] + bounds[3]) / 2),
    wrapLongitude: Boolean(wrapLongitude)
  };
}

function anchor(id, name, longitude, latitude, kind, minCells) {
  return {id, name, longitude, latitude, kind, minCells};
}

function roundCoordinate(value) {
  return Math.round(value * 1e6) / 1e6;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
