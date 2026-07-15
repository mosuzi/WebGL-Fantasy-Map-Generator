import {mix} from "./geometry.js";
import {diplomacyRelationColor} from "../generator/diplomacy.js";

export function colorForCell(cellIndex, map, colorMode, viewOptions = {}) {
  if (colorMode !== "height" && colorMode !== "temperature" && !isLandCell(cellIndex, map)) {
    return colorForHeight(map.grid.cells.h[cellIndex], map.layers, viewOptions);
  }
  if (colorMode === "temperature") return colorForTemperature(map.grid.cells.temp[cellIndex]);
  if (colorMode === "precipitation") return colorForPrecipitation(map.grid.cells.prec[cellIndex]);
  if (colorMode === "biomes") return colorForBiome(map.grid.cells.biome[cellIndex], map);
  if (colorMode === "cultures") return colorForCulture(map.grid.cells.culture[cellIndex], map);
  if (colorMode === "religions") return colorForReligion(map.grid.cells.religion[cellIndex], map);
  if (colorMode === "diplomacy") return colorForDiplomacy(map.grid.cells.state[cellIndex], map, viewOptions);
  if (colorMode === "governments") return colorForGovernment(map.grid.cells.state[cellIndex], map);
  if (colorMode === "states") return colorForState(map.grid.cells.state[cellIndex], map);
  if (colorMode === "provinces") return colorForProvince(map.grid.cells.province[cellIndex], map);
  if (colorMode === "regions") return indexedColorOrWater(map.grid.cells.region[cellIndex], 0.77, map.layers.ocean);
  if (colorMode === "population") return colorForPopulation(map.grid.cells.pop[cellIndex], map);
  return colorForHeight(map.grid.cells.h[cellIndex], map.layers, viewOptions);
}

export function isLandCell(cellIndex, map) {
  const featureId = map.grid.cells.f?.[cellIndex];
  return Boolean(map.features.features[featureId]?.land);
}

export function colorForHeight(height, layers, viewOptions = {}) {
  const water = viewOptions.visualTheme?.water?.fill || layers.ocean;
  if (height < 20) return viewOptions.showOceanHeight ? colorForOceanHeight(height, {...layers, ocean: water}) : water;
  return viewOptions.visualTheme?.land?.fill || colorForLandHeight(height, viewOptions.visualTheme?.terrain?.heightRamp);
}

function colorForOceanHeight(height, layers) {
  const t = Math.max(0, Math.min(1, height / 20));
  const deep = mix(layers.ocean, [0.25, 0.37, 0.54, 1], 0.58);
  const shelf = mix(layers.ocean, [0.62, 0.75, 0.84, 1], 0.46);
  return mix(deep, shelf, t ** 0.75);
}

function colorForLandHeight(height, ramp) {
  const stops = Array.isArray(ramp) && ramp.length >= 2 ? ramp : [
    [20, [0.5, 0.63, 0.46, 1]],
    [36, [0.62, 0.68, 0.5, 1]],
    [56, [0.7, 0.67, 0.54, 1]],
    [76, [0.75, 0.71, 0.62, 1]],
    [92, [0.81, 0.79, 0.72, 1]],
    [100, [0.87, 0.86, 0.82, 1]]
  ];
  for (let index = 1; index < stops.length; index += 1) {
    const [previousHeight, previousColor] = stops[index - 1];
    const [nextHeight, nextColor] = stops[index];
    if (height > nextHeight) continue;
    const span = Math.max(1, nextHeight - previousHeight);
    return mix(previousColor, nextColor, Math.max(0, Math.min(1, (height - previousHeight) / span)));
  }
  return stops[stops.length - 1][1];
}

function colorForTemperature(temp) {
  const t = Math.max(0, Math.min(1, (temp + 18) / 54));
  return mix([0.2, 0.38, 0.72, 1], [0.82, 0.32, 0.2, 1], t);
}

function colorForPrecipitation(prec) {
  const t = Math.max(0, Math.min(1, prec / 100));
  return mix([0.72, 0.62, 0.36, 1], [0.16, 0.48, 0.68, 1], t);
}

function colorForBiome(biomeId, map) {
  return map.climate.biomes[biomeId]?.color || [0.5, 0.5, 0.5, 1];
}

export function colorForState(stateId, map) {
  if (stateId < 0) return mix(map.layers.ocean, [0.05, 0.08, 0.1, 1], 0.3);
  if (!stateId) return [0.7, 0.72, 0.68, 1];
  return hexToRgba(map.politics.states[stateId]?.color) || indexedColor(stateId, 0.12);
}

function colorForDiplomacy(stateId, map, viewOptions = {}) {
  if (stateId < 0) return mix(map.layers.ocean, [0.05, 0.08, 0.1, 1], 0.3);
  if (!stateId) return [0.46, 0.48, 0.46, 1];
  const subjectId = diplomacySubjectId(map, viewOptions.diplomacySubjectId);
  if (!subjectId || stateId === subjectId) return [1, 0.78, 0.28, 1];
  const subject = map.politics.states[subjectId] || map.pack?.states?.[subjectId];
  const relation = subject?.diplomacy?.[stateId] || "Unknown";
  return hexToRgba(diplomacyRelationColor(relation)) || [0.62, 0.65, 0.66, 1];
}

function colorForGovernment(stateId, map) {
  if (stateId < 0) return mix(map.layers.ocean, [0.05, 0.08, 0.1, 1], 0.3);
  if (!stateId) return [0.46, 0.48, 0.46, 1];
  const state = map.politics.states[stateId] || map.pack?.states?.[stateId];
  const family = state?.governmentFamily || state?.government?.family || "unknown";
  const familyEntry = GOVERNMENT_FAMILY_LEGEND[family];
  if (familyEntry) return hexToRgba(familyEntry.color);
  return indexedColor(hashString(state?.governmentKey || family || String(stateId)), 0.18);
}

function diplomacySubjectId(map, preferredId) {
  const preferred = Number(preferredId);
  if (Number.isInteger(preferred) && preferred > 0 && map.politics.states[preferred] && !map.politics.states[preferred].removed) return preferred;
  return (map.politics.states || []).find(state => state?.i && !state.removed)?.i || 0;
}

export const GOVERNMENT_FAMILY_LEGEND = Object.freeze({
  autocracy: {label: "专制集权", color: "#d98f86"},
  monarchy: {label: "君主系", color: "#e5bf82"},
  republic: {label: "共和系", color: "#91c9d2"},
  league: {label: "联盟系", color: "#acd38e"},
  theocracy: {label: "神权系", color: "#bda8db"},
  oligarchy: {label: "寡头系", color: "#c4ad99"},
  military: {label: "军政系", color: "#a3abb1"},
  unknown: {label: "未归类", color: "#b4b9b4"}
});

function colorForCulture(cultureId, map) {
  if (cultureId < 0) return mix(map.layers.ocean, [0.05, 0.08, 0.1, 1], 0.3);
  return hexToRgba(map.society.cultures[cultureId]?.color) || indexedColor(cultureId, 0.31);
}

function colorForReligion(religionId, map) {
  if (religionId < 0) return mix(map.layers.ocean, [0.05, 0.08, 0.1, 1], 0.3);
  return hexToRgba(map.society.religions[religionId]?.color) || indexedColor(religionId, 0.63);
}

export function colorForProvince(provinceId, map) {
  if (provinceId < 0) return mix(map.layers.ocean, [0.05, 0.08, 0.1, 1], 0.3);
  if (!provinceId) return [0.7, 0.72, 0.68, 1];
  return hexToRgba(map.politics.provinces[provinceId]?.color) || indexedColor(provinceId, 0.46);
}

function colorForPopulation(population, map) {
  if (!population) return mix(map.layers.ocean, [0.06, 0.1, 0.08, 1], 0.4);
  const t = Math.min(1, population / Math.max(1, map.settlements.metadata.maxPopulation));
  return mix([0.2, 0.36, 0.24, 1], [0.92, 0.72, 0.34, 1], Math.sqrt(t));
}

function indexedColor(index, offset) {
  const hue = (index * 0.61803398875 + offset) % 1;
  return hslToRgb(hue, 0.32, 0.72);
}

function indexedColorOrWater(index, offset, waterColor) {
  if (index < 0) return mix(waterColor, [0.05, 0.08, 0.1, 1], 0.3);
  return indexedColor(index, offset);
}

function hashString(value) {
  let hash = 0;
  const text = String(value || "");
  for (let index = 0; index < text.length; index++) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash || 1;
}

function hexToRgba(color) {
  if (typeof color !== "string") return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255, 1];
}

function hslToRgb(h, s, l) {
  const hueToRgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hueToRgb(p, q, h + 1 / 3), hueToRgb(p, q, h), hueToRgb(p, q, h - 1 / 3), 1];
}
