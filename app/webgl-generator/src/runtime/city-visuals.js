export const CITY_SILHOUETTE_OPTIONS = Object.freeze([
  {value: "capital", label: "都城城墙"},
  {value: "provincial", label: "省会塔楼"},
  {value: "port", label: "港镇帆影"},
  {value: "city", label: "城市屋群"},
  {value: "town", label: "城镇屋群"},
  {value: "village", label: "村庄屋群"},
  {value: "hamlet", label: "村落小屋"},
  {value: "fort", label: "高地寨堡"},
  {value: "camp", label: "游牧营帐"}
]);

export const CITY_PALETTE_OPTIONS = Object.freeze([
  {value: "capital", label: "都城金墙"},
  {value: "provincial", label: "省会暖石"},
  {value: "port", label: "海港蓝灰"},
  {value: "city", label: "城市红瓦"},
  {value: "town", label: "城镇土墙"},
  {value: "village", label: "村庄木瓦"},
  {value: "hamlet", label: "村落木屋"},
  {value: "nomadic", label: "草原营帐"},
  {value: "highland", label: "山地石堡"},
  {value: "woodland", label: "林地木屋"},
  {value: "waterway", label: "水乡青瓦"}
]);

export const CITY_CULTURE_STYLE_OPTIONS = Object.freeze([
  {value: "default", label: "普通"},
  {value: "maritime", label: "海洋"},
  {value: "waterway", label: "河湖"},
  {value: "nomadic", label: "游牧"},
  {value: "highland", label: "高地"},
  {value: "woodland", label: "林地"}
]);

export const CITY_ICON_PALETTES = Object.freeze({
  capital: {wall: "#dcc17e", roof: "#8f4b37", stroke: "#4b311d", accent: "#f7e4aa", water: "#7fa8ba"},
  provincial: {wall: "#d3b979", roof: "#9a5438", stroke: "#49301c", accent: "#f4dea2", water: "#83a7b8"},
  port: {wall: "#c8b785", roof: "#816c47", stroke: "#33404a", accent: "#eef0c4", water: "#4d92bc"},
  city: {wall: "#d8c08b", roof: "#a35d3f", stroke: "#4d3321", accent: "#ffe0a0", water: "#7fa8ba"},
  town: {wall: "#cfb884", roof: "#965a3d", stroke: "#493323", accent: "#efd69a", water: "#7fa8ba"},
  village: {wall: "#cab27f", roof: "#916044", stroke: "#493523", accent: "#ead19a", water: "#7fa8ba"},
  hamlet: {wall: "#c6ad79", roof: "#8d6540", stroke: "#493523", accent: "#e6cf91", water: "#7fa8ba"},
  nomadic: {wall: "#d5be85", roof: "#78653f", stroke: "#453723", accent: "#efe0b4", water: "#8aa6a3"},
  highland: {wall: "#b8b1a0", roof: "#6d6458", stroke: "#35312b", accent: "#ddd3bb", water: "#7f9fab"},
  woodland: {wall: "#b9aa78", roof: "#6e6f3e", stroke: "#333923", accent: "#e2d59b", water: "#759f83"},
  waterway: {wall: "#c7c2a1", roof: "#58727a", stroke: "#30404a", accent: "#e7e0b9", water: "#4f98b4"}
});

const VALID_SILHOUETTES = new Set(CITY_SILHOUETTE_OPTIONS.map(option => option.value));
const VALID_PALETTES = new Set(CITY_PALETTE_OPTIONS.map(option => option.value));
const VALID_CULTURE_STYLES = new Set(CITY_CULTURE_STYLE_OPTIONS.map(option => option.value));
const CITY_SCALE_LABELS = Object.freeze({
  hamlet: "村落",
  village: "村庄",
  town: "城镇",
  city: "城市"
});

export function createCityScaleContext(cities = [], burgs = []) {
  const populations = [];
  const burgById = new Map((burgs || []).filter(Boolean).map(burg => [Number(burg.i ?? burg.id), burg]));
  for (const city of cities || []) {
    if (!city || city.removed) continue;
    const burg = burgById.get(Number(city.burgId));
    populations.push(cityPopulation(city, burg));
  }
  if (!populations.length) {
    for (const burg of burgs || []) {
      if (!burg?.i || burg.removed) continue;
      populations.push(cityPopulation(null, burg));
    }
  }
  populations.sort((left, right) => left - right);
  const p90Index = populations.length ? Math.min(populations.length - 1, Math.floor(populations.length * 0.9)) : -1;
  return Object.freeze({
    populationCount: populations.length,
    p90Population: p90Index >= 0 ? populations[p90Index] : Number.POSITIVE_INFINITY
  });
}

export function deriveCityScale(city = {}, context = null, burg = null) {
  const population = cityPopulation(city, burg);
  if (population <= 0.1) return "hamlet";
  if (population <= 2) return "village";
  const p90Population = Number(context?.p90Population);
  if (population >= 5 && Number.isFinite(p90Population) && population >= p90Population) return "city";
  return "town";
}

export function cityScaleLabel(scale) {
  return CITY_SCALE_LABELS[scale] || CITY_SCALE_LABELS.town;
}

export function cityRoleKeys(city = {}, burg = null) {
  const roles = [];
  if (city.capital || burg?.capital) roles.push("capital");
  if (city.provincial) roles.push("provincial");
  if (city.port || burg?.port) roles.push("port");
  return roles;
}

export function cityRoleLabel(city = {}, burg = null) {
  const labels = cityRoleKeys(city, burg).map(role => ({
    capital: "首都",
    provincial: "省会",
    port: "港口"
  })[role]);
  return labels.length ? labels.join("·") : "普通";
}

export function cityRoleScaleLabel(city = {}, context = null, burg = null) {
  return `${cityRoleLabel(city, burg)}·${cityScaleLabel(deriveCityScale(city, context, burg))}`;
}

export function defaultCityVisual(city = {}, culture = null, context = null, burg = null) {
  const cultureStyle = cityCultureStyle(culture);
  const silhouette = deriveCityScale(city, context, burg);
  return {
    silhouette,
    palette: defaultCityPalette(city, cultureStyle, silhouette),
    cultureStyle,
    manual: false
  };
}

export function resolveCityVisual(city = {}, culture = null, fallbackVisual = null, context = null, burg = null) {
  const defaults = defaultCityVisual(city, culture, context, burg);
  const visual = city?.visual && Object.keys(city.visual).length ? city.visual : fallbackVisual || {};
  if (!visual.manual) return defaults;
  return {
    silhouette: validSilhouette(visual.silhouette) ? visual.silhouette : defaults.silhouette,
    palette: validPalette(visual.palette) ? visual.palette : defaults.palette,
    cultureStyle: validCultureStyle(visual.cultureStyle) ? visual.cultureStyle : defaults.cultureStyle,
    manual: true
  };
}

export function refreshCityScaleVisuals(map) {
  const cities = map?.settlements?.cities || [];
  const burgs = map?.pack?.burgs || [];
  const context = createCityScaleContext(cities, burgs);
  for (const city of cities) {
    if (!city || city.removed) continue;
    const burg = findCityBurg(map, city);
    const scale = deriveCityScale(city, context, burg);
    city.group = scale;
    if (burg) burg.group = scale;
    const cultureId = city.culture ?? burg?.culture ?? 0;
    const culture = map?.society?.cultures?.[cultureId] || map?.pack?.cultures?.[cultureId] || null;
    const visual = resolveCityVisual(city, culture, burg?.visual, context, burg);
    city.visual = cloneCityVisual(visual);
    if (burg) burg.visual = cloneCityVisual(visual);
  }
  return context;
}

export function captureCityScaleVisualSnapshot(map) {
  return (map?.settlements?.cities || []).filter(Boolean).map(city => {
    const burg = findCityBurg(map, city);
    return {
      cityId: city.id,
      burgId: city.burgId,
      city: snapshotCityScaleVisual(city),
      burg: burg ? snapshotCityScaleVisual(burg) : null
    };
  });
}

export function restoreCityScaleVisualSnapshot(map, snapshot) {
  const cityById = new Map((map?.settlements?.cities || [])
    .filter(Boolean)
    .map(city => [Number(city.id), city]));
  for (const item of snapshot || []) {
    const city = cityById.get(Number(item.cityId));
    if (city) restoreCityScaleVisual(city, item.city);
    const burg = map?.pack?.burgs?.[item.burgId] || findCityBurg(map, city);
    if (burg && item.burg) restoreCityScaleVisual(burg, item.burg);
  }
}

export function normalizeCityVisualPatch(patch = {}) {
  const next = {};
  if (validSilhouette(patch.silhouette)) next.silhouette = patch.silhouette;
  if (validPalette(patch.palette)) next.palette = patch.palette;
  if (validCultureStyle(patch.cultureStyle)) next.cultureStyle = patch.cultureStyle;
  return next;
}

export function citySilhouetteLabel(value) {
  return CITY_SILHOUETTE_OPTIONS.find(option => option.value === value)?.label || value || "自动";
}

export function cityPaletteLabel(value) {
  return CITY_PALETTE_OPTIONS.find(option => option.value === value)?.label || value || "自动";
}

export function cityCultureStyleLabel(value) {
  return CITY_CULTURE_STYLE_OPTIONS.find(option => option.value === value)?.label || value || "普通";
}

function defaultCityPalette(city, cultureStyle, silhouette) {
  if (cultureStyle === "nomadic") return "nomadic";
  if (cultureStyle === "highland") return "highland";
  if (cultureStyle === "woodland") return "woodland";
  if (cultureStyle === "waterway") return "waterway";
  if (cultureStyle === "maritime") return "port";
  return validPalette(silhouette) ? silhouette : "town";
}

function cityCultureStyle(culture) {
  const type = culture?.type;
  if (type === "Naval") return "maritime";
  if (type === "Lake" || type === "River") return "waterway";
  if (type === "Nomadic") return "nomadic";
  if (type === "Highland") return "highland";
  if (type === "Hunting") return "woodland";
  return "default";
}

function findCityBurg(map, city) {
  const burgId = Number(city?.burgId);
  return map?.pack?.burgs?.[burgId]
    || (map?.pack?.burgs || []).find(burg => Number(burg?.cityId) === Number(city?.id))
    || null;
}

function snapshotCityScaleVisual(object) {
  return {
    hasGroup: Object.prototype.hasOwnProperty.call(object, "group"),
    group: object.group,
    hasVisual: Object.prototype.hasOwnProperty.call(object, "visual"),
    visual: cloneCityVisual(object.visual)
  };
}

function restoreCityScaleVisual(object, snapshot) {
  if (snapshot.hasGroup) object.group = snapshot.group;
  else delete object.group;
  if (snapshot.hasVisual) object.visual = cloneCityVisual(snapshot.visual);
  else delete object.visual;
}

function cloneCityVisual(visual) {
  return visual === null || visual === undefined ? visual : {...visual};
}

function validSilhouette(value) {
  return typeof value === "string" && VALID_SILHOUETTES.has(value);
}

function validPalette(value) {
  return typeof value === "string" && VALID_PALETTES.has(value);
}

function validCultureStyle(value) {
  return typeof value === "string" && VALID_CULTURE_STYLES.has(value);
}

function cityPopulation(city, burg) {
  const value = Number(city?.population ?? burg?.population ?? 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
