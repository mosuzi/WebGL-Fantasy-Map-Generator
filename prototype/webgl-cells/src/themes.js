import {getHeightColor, mixColor, parseHexColor} from "./colors.js";
import {clamp} from "./utils.js";

export const THEME_DEFINITIONS = [
  {id: "height", label: "高度", source: "grid.cells.h"},
  {id: "biomes", label: "生物群系", source: "pack.cells.biome"},
  {id: "states", label: "国家", source: "pack.cells.state"},
  {id: "provinces", label: "省份", source: "pack.cells.province"},
  {id: "cultures", label: "文化", source: "pack.cells.culture"},
  {id: "religions", label: "宗教", source: "pack.cells.religion"},
  {id: "temperature", label: "温度", source: "grid.cells.temp"}
];

const WATER_COLOR = [0.1, 0.31, 0.5];
const EMPTY_LAND_COLOR = [0.45, 0.5, 0.43];

export function getThemeDefinition(themeId) {
  return THEME_DEFINITIONS.find(theme => theme.id === themeId) || THEME_DEFINITIONS[0];
}

export function getThemeIds() {
  return THEME_DEFINITIONS.map(theme => theme.id);
}

export function getThemeLabel(themeId) {
  return getThemeDefinition(themeId).label;
}

export function getThemeStats(snapshot, cellRanges) {
  const stats = {};
  for (const theme of THEME_DEFINITIONS) {
    const values = new Set();
    let missing = 0;
    for (const range of cellRanges) {
      const value = getThemeValue(snapshot, range, theme.id);
      if (value === undefined || value === null) {
        missing++;
        continue;
      }
      values.add(value);
    }
    stats[theme.id] = {
      label: theme.label,
      source: theme.source,
      values: values.size,
      missing
    };
  }
  return stats;
}

export function buildThemeColors(snapshot, cellRanges, themeId) {
  const colors = [];
  for (const range of cellRanges) {
    const color = getThemeColor(snapshot, range, themeId);
    for (let index = 0; index < range.vertexCount; index++) {
      colors.push(color[0], color[1], color[2]);
    }
  }
  return new Float32Array(colors);
}

export function getThemeCellInfo(snapshot, packCellId, gridIndex) {
  const packCell = Number.isInteger(packCellId) ? packCellId : getPackCellId(snapshot, gridIndex);
  const gridCell = Number.isInteger(gridIndex) ? gridIndex : getGridCellId(snapshot, packCell);
  const biomeId = getArrayValue(snapshot.cells?.biome, packCell);
  const provinceId = getArrayValue(snapshot.cells?.province, packCell);
  const cultureId = getArrayValue(snapshot.cells?.culture, packCell);
  const religionId = getArrayValue(snapshot.cells?.religion, packCell);
  const temperature = getArrayValue(snapshot.grid?.cells?.temp, gridCell);

  return {
    biomeId,
    biomeName: snapshot.biomes?.[biomeId]?.name || "无",
    provinceId,
    provinceName: snapshot.provinces?.[provinceId]?.name || "无",
    cultureId,
    cultureName: snapshot.cultures?.[cultureId]?.name || "无",
    religionId,
    religionName: snapshot.religions?.[religionId]?.name || "无",
    temperature
  };
}

function getThemeColor(snapshot, range, themeId) {
  const gridHeight = getArrayValue(snapshot.grid?.cells?.h, range.gridIndex) ?? 0;
  const packHeight = getArrayValue(snapshot.cells?.h, range.packCellId) ?? gridHeight;

  if (themeId !== "height" && themeId !== "temperature" && gridHeight < 20) return WATER_COLOR;

  if (themeId === "height") return getHeightColor(gridHeight);
  if (themeId === "temperature") return getTemperatureColor(snapshot, range.gridIndex);
  if (themeId === "biomes") return getEntityColor(snapshot.biomes, getArrayValue(snapshot.cells?.biome, range.packCellId));
  if (themeId === "states") return getPoliticalColor(snapshot.states, getArrayValue(snapshot.cells?.state, range.packCellId), packHeight);
  if (themeId === "provinces") {
    return getPoliticalColor(snapshot.provinces, getArrayValue(snapshot.cells?.province, range.packCellId), packHeight);
  }
  if (themeId === "cultures") {
    return getPoliticalColor(snapshot.cultures, getArrayValue(snapshot.cells?.culture, range.packCellId), packHeight);
  }
  if (themeId === "religions") {
    return getPoliticalColor(snapshot.religions, getArrayValue(snapshot.cells?.religion, range.packCellId), packHeight);
  }

  return EMPTY_LAND_COLOR;
}

function getThemeValue(snapshot, range, themeId) {
  if (themeId === "height") return getArrayValue(snapshot.grid?.cells?.h, range.gridIndex);
  if (themeId === "temperature") return getArrayValue(snapshot.grid?.cells?.temp, range.gridIndex);
  if (themeId === "biomes") return getArrayValue(snapshot.cells?.biome, range.packCellId);
  if (themeId === "states") return getArrayValue(snapshot.cells?.state, range.packCellId);
  if (themeId === "provinces") return getArrayValue(snapshot.cells?.province, range.packCellId);
  if (themeId === "cultures") return getArrayValue(snapshot.cells?.culture, range.packCellId);
  if (themeId === "religions") return getArrayValue(snapshot.cells?.religion, range.packCellId);
  return undefined;
}

function getPoliticalColor(items, id, height) {
  if (height < 20) return WATER_COLOR;
  return getEntityColor(items, id) || EMPTY_LAND_COLOR;
}

function getEntityColor(items, id) {
  const item = items?.[id];
  if (!item || item.removed) return EMPTY_LAND_COLOR;
  return parseHexColor(item.color);
}

function getTemperatureColor(snapshot, gridIndex) {
  const temperature = getArrayValue(snapshot.grid?.cells?.temp, gridIndex);
  const range = snapshot.themeMetadata?.temperature;
  if (temperature === undefined || !range) return EMPTY_LAND_COLOR;
  const amount = range.max === range.min ? 0.5 : (temperature - range.min) / (range.max - range.min);
  return interpolateTemperature(amount);
}

function interpolateTemperature(amount) {
  const stops = [
    [62, 85, 163],
    [75, 154, 184],
    [126, 194, 139],
    [230, 216, 110],
    [214, 102, 73]
  ];
  const scaled = clamp(amount, 0, 1) * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  return mixColor(stops[index], stops[index + 1], scaled - index);
}

function getPackCellId(snapshot, gridIndex) {
  if (!snapshot.cells?.g) return undefined;
  if (!snapshot.__gridToPack) {
    snapshot.__gridToPack = [];
    for (let packCell = 0; packCell < snapshot.cells.g.length; packCell++) {
      const mappedGridCell = snapshot.cells.g[packCell];
      if (mappedGridCell !== undefined && snapshot.__gridToPack[mappedGridCell] === undefined) {
        snapshot.__gridToPack[mappedGridCell] = packCell;
      }
    }
  }
  return snapshot.__gridToPack[gridIndex];
}

function getGridCellId(snapshot, packCellId) {
  return getArrayValue(snapshot.cells?.g, packCellId);
}

function getArrayValue(values, index) {
  if (!values || index === undefined || index === null) return undefined;
  return values[index];
}
