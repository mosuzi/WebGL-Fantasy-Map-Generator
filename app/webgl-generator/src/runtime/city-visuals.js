export const CITY_SILHOUETTE_OPTIONS = Object.freeze([
  {value: "capital", label: "都城城墙"},
  {value: "provincial", label: "省会塔楼"},
  {value: "port", label: "港镇帆影"},
  {value: "city", label: "城市屋群"},
  {value: "town", label: "城镇屋群"},
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
  hamlet: {wall: "#c6ad79", roof: "#8d6540", stroke: "#493523", accent: "#e6cf91", water: "#7fa8ba"},
  nomadic: {wall: "#d5be85", roof: "#78653f", stroke: "#453723", accent: "#efe0b4", water: "#8aa6a3"},
  highland: {wall: "#b8b1a0", roof: "#6d6458", stroke: "#35312b", accent: "#ddd3bb", water: "#7f9fab"},
  woodland: {wall: "#b9aa78", roof: "#6e6f3e", stroke: "#333923", accent: "#e2d59b", water: "#759f83"},
  waterway: {wall: "#c7c2a1", roof: "#58727a", stroke: "#30404a", accent: "#e7e0b9", water: "#4f98b4"}
});

const VALID_SILHOUETTES = new Set(CITY_SILHOUETTE_OPTIONS.map(option => option.value));
const VALID_PALETTES = new Set(CITY_PALETTE_OPTIONS.map(option => option.value));
const VALID_CULTURE_STYLES = new Set(CITY_CULTURE_STYLE_OPTIONS.map(option => option.value));

export function defaultCityVisual(city = {}, culture = null) {
  const cultureStyle = cityCultureStyle(culture);
  const silhouette = defaultCitySilhouette(city, cultureStyle);
  return {
    silhouette,
    palette: defaultCityPalette(city, cultureStyle, silhouette),
    cultureStyle,
    manual: false
  };
}

export function resolveCityVisual(city = {}, culture = null, fallbackVisual = null) {
  const defaults = defaultCityVisual(city, culture);
  const visual = city?.visual && Object.keys(city.visual).length ? city.visual : fallbackVisual || {};
  return {
    silhouette: validSilhouette(visual.silhouette) ? visual.silhouette : defaults.silhouette,
    palette: validPalette(visual.palette) ? visual.palette : defaults.palette,
    cultureStyle: validCultureStyle(visual.cultureStyle) ? visual.cultureStyle : defaults.cultureStyle,
    manual: Boolean(visual.manual)
  };
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

function defaultCitySilhouette(city, cultureStyle) {
  const population = Number(city.population || 0);
  if (city.capital) return "capital";
  if (cultureStyle === "nomadic" && !city.provincial && population < 18) return "camp";
  if (cultureStyle === "highland" && (city.provincial || city.citadel || city.walls || population >= 8)) return "fort";
  if ((cultureStyle === "maritime" || cultureStyle === "waterway") && city.port) return "port";
  if (city.provincial) return "provincial";
  if (city.port) return "port";
  if (population >= 64) return "city";
  if (population < 8) return "hamlet";
  return "town";
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

function validSilhouette(value) {
  return typeof value === "string" && VALID_SILHOUETTES.has(value);
}

function validPalette(value) {
  return typeof value === "string" && VALID_PALETTES.has(value);
}

function validCultureStyle(value) {
  return typeof value === "string" && VALID_CULTURE_STYLES.has(value);
}
