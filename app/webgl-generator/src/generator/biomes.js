export const BIOMES = [
  {id: 0, name: "Marine", color: [0.27, 0.43, 0.67, 1], habitability: 0},
  {id: 1, name: "Hot desert", color: [0.98, 0.91, 0.62, 1], habitability: 4},
  {id: 2, name: "Cold desert", color: [0.71, 0.72, 0.53, 1], habitability: 10},
  {id: 3, name: "Savanna", color: [0.82, 0.82, 0.51, 1], habitability: 22},
  {id: 4, name: "Grassland", color: [0.78, 0.84, 0.56, 1], habitability: 30},
  {id: 5, name: "Tropical seasonal forest", color: [0.71, 0.85, 0.36, 1], habitability: 50},
  {id: 6, name: "Temperate deciduous forest", color: [0.16, 0.74, 0.34, 1], habitability: 100},
  {id: 7, name: "Tropical rainforest", color: [0.49, 0.8, 0.21, 1], habitability: 80},
  {id: 8, name: "Temperate rainforest", color: [0.25, 0.61, 0.26, 1], habitability: 90},
  {id: 9, name: "Taiga", color: [0.29, 0.42, 0.2, 1], habitability: 12},
  {id: 10, name: "Tundra", color: [0.59, 0.47, 0.29, 1], habitability: 4},
  {id: 11, name: "Glacier", color: [0.84, 0.91, 0.92, 1], habitability: 0},
  {id: 12, name: "Wetland", color: [0.04, 0.57, 0.19, 1], habitability: 12}
];

const BIOME_MATRIX = [
  [1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 10],
  [3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 9, 9, 9, 9, 10, 10, 10],
  [5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 9, 9, 9, 9, 9, 10, 10, 10],
  [5, 6, 6, 6, 6, 6, 6, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 9, 10, 10, 10],
  [7, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 9, 9, 10, 10]
];

const SCORE_MAP = {
  estuary: 15,
  ocean_coast: 5,
  save_harbor: 20,
  freshwater: 30,
  salt: 10,
  frozen: 1,
  dry: -5,
  sinkhole: -5,
  lava: -30
};

export function defineBiomesAndPopulation(grid, pack) {
  const startedAt = performance.now();
  defineBiomes(grid, pack);
  const rankCellsInputs = rankCells(pack);
  pack.metadata.rankCellsInputs = rankCellsInputs;
  mirrorPackFieldsToGrid(grid, pack);

  return {
    biomes: BIOMES,
    metadata: {
      biomeCounts: countValues(pack.cells.biome),
      positiveSuitabilityCells: countPositive(pack.cells.s),
      positivePopulationCells: countPositive(pack.cells.pop),
      maxSuitability: maxValue(pack.cells.s),
      maxPopulation: round(maxValue(pack.cells.pop), 3),
      rankCellsInputs,
      buildMs: roundMs(performance.now() - startedAt)
    }
  };
}

function defineBiomes(grid, pack) {
  const {cells} = pack;
  cells.biome = new Uint8Array(cells.i.length);

  for (const cell of cells.i) {
    const height = cells.h[cell];
    const moisture = height < 20 ? 0 : calculateMoisture(grid, cells, cell);
    const temperature = grid.cells.temp[cells.g[cell]];
    cells.biome[cell] = getBiomeId(moisture, temperature, height, Boolean(cells.r[cell]));
  }
}

function calculateMoisture(grid, cells, cell) {
  let moisture = grid.cells.prec[cells.g[cell]] || 0;
  if (cells.r[cell]) moisture += Math.max(cells.fl[cell] / 10, 2);

  const values = (cells.c[cell] || [])
    .filter(neighbor => cells.h[neighbor] >= 20)
    .map(neighbor => grid.cells.prec[cells.g[neighbor]] || 0);
  values.push(moisture);
  return round(4 + average(values));
}

function getBiomeId(moisture, temperature, height, hasRiver) {
  if (height < 20) return 0;
  if (temperature < -5) return 11;
  if (temperature >= 25 && !hasRiver && moisture < 8) return 1;
  if (isWetland(moisture, temperature, height)) return 12;

  const moistureBand = Math.min((moisture / 5) | 0, 4);
  const temperatureBand = Math.min(Math.max(20 - temperature, 0), 25);
  return BIOME_MATRIX[moistureBand][temperatureBand];
}

function isWetland(moisture, temperature, height) {
  if (temperature <= -2) return false;
  if (moisture > 40 && height < 25) return true;
  return moisture > 24 && height > 24 && height < 60;
}

function rankCells(pack) {
  const {cells, features} = pack;
  const hasGoodsAtRankTime = Boolean(cells.good);
  cells.s = new Int16Array(cells.i.length);
  cells.pop = new Float32Array(cells.i.length);

  const positiveFlux = Array.from(cells.fl).filter(Boolean).sort((a, b) => a - b);
  const meanFlux = medianSorted(positiveFlux) || 0;
  const maxFlux = maxValue(cells.fl) + maxValue(cells.conf);
  const meanArea = average(Array.from(cells.area));

  for (const cell of cells.i) {
    if (cells.h[cell] < 20) continue;
    let score = BIOMES[cells.biome[cell]]?.habitability || 0;
    if (!score) continue;

    if (meanFlux) score += normalize((cells.fl[cell] || 0) + (cells.conf[cell] || 0), meanFlux, maxFlux) * 250;
    score -= (cells.h[cell] - 50) / 5;

    if (cells.t[cell] === 1) {
      if (cells.r[cell]) score += SCORE_MAP.estuary;
      const havenFeature = features[cells.f[cells.haven[cell]]];
      if (havenFeature?.type === "lake") {
        score += SCORE_MAP[havenFeature.group] || 0;
      } else {
        score += SCORE_MAP.ocean_coast;
        if (cells.harbor[cell] === 1) score += SCORE_MAP.save_harbor;
      }
    }

    cells.s[cell] = score / 5;
    cells.pop[cell] = cells.s[cell] > 0 ? (cells.s[cell] * cells.area[cell]) / meanArea : 0;
  }

  return {hasGoodsAtRankTime};
}

function mirrorPackFieldsToGrid(grid, pack) {
  const biome = new Array(grid.points.length).fill(0);
  const suitability = new Array(grid.points.length).fill(0);
  const population = new Array(grid.points.length).fill(0);

  for (const packCell of pack.cells.i) {
    const gridCell = pack.cells.g[packCell];
    biome[gridCell] = pack.cells.biome[packCell];
    if (pack.cells.s[packCell] > suitability[gridCell]) suitability[gridCell] = pack.cells.s[packCell];
    if (pack.cells.pop[packCell] > population[gridCell]) population[gridCell] = round(pack.cells.pop[packCell], 3);
  }

  grid.cells.biome = biome;
  grid.cells.s = suitability;
  grid.cells.pop = population;
}

function countValues(values = []) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] || 0) + 1;
  return counts;
}

function countPositive(values = []) {
  let count = 0;
  for (const value of values) if (value > 0) count++;
  return count;
}

function maxValue(values = []) {
  let max = 0;
  for (const value of values) if (value > max) max = value;
  return max;
}

function medianSorted(values) {
  if (!values.length) return 0;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

function normalize(value, min, max) {
  if (max <= min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function round(value, digits = 0) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function roundMs(value) {
  return Math.round(value * 100) / 100;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
