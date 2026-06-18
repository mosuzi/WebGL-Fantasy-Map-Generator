const BIOMES = [
  {id: 0, name: "water", color: [0.12, 0.34, 0.52, 1]},
  {id: 1, name: "ice", color: [0.84, 0.9, 0.92, 1]},
  {id: 2, name: "tundra", color: [0.58, 0.64, 0.55, 1]},
  {id: 3, name: "grassland", color: [0.46, 0.6, 0.34, 1]},
  {id: 4, name: "forest", color: [0.24, 0.46, 0.28, 1]},
  {id: 5, name: "desert", color: [0.74, 0.66, 0.42, 1]},
  {id: 6, name: "savanna", color: [0.62, 0.6, 0.32, 1]},
  {id: 7, name: "rainforest", color: [0.18, 0.42, 0.22, 1]},
  {id: 8, name: "mountain", color: [0.68, 0.64, 0.55, 1]}
];

export function buildClimate(grid, features, options) {
  const temp = [];
  const prec = [];
  const biome = [];
  const biomeCounts = new Map();

  for (let cell = 0; cell < grid.points.length; cell++) {
    const point = grid.points[cell];
    const height = grid.cells.h[cell];
    const feature = features.features[grid.cells.f[cell]];
    const values = sampleClimate(point, height, feature, options);
    const biomeId = classifyBiome(values.temperature, values.precipitation, height, feature);
    temp.push(values.temperature);
    prec.push(values.precipitation);
    biome.push(biomeId);
    biomeCounts.set(biomeId, (biomeCounts.get(biomeId) || 0) + 1);
  }

  grid.cells.temp = temp;
  grid.cells.prec = prec;
  grid.cells.biome = biome;

  return {
    biomes: BIOMES,
    metadata: {
      temperatureMin: Math.min(...temp),
      temperatureMax: Math.max(...temp),
      precipitationMin: Math.min(...prec),
      precipitationMax: Math.max(...prec),
      biomeCounts: Object.fromEntries([...biomeCounts.entries()].map(([id, count]) => [BIOMES[id]?.name || id, count]))
    }
  };
}

function sampleClimate(point, height, feature, options) {
  const latitude = Math.abs(point[1] / options.graphHeight - 0.5) * 2;
  const inland = Math.abs(point[0] / options.graphWidth - 0.5) * 2;
  const waterBoost = feature?.type === "ocean" || feature?.type === "lake" ? 12 : 0;
  const temperature = clamp(Math.round(31 - latitude * 38 - Math.max(0, height - 45) * 0.45), -18, 36);
  const precipitation = clamp(Math.round(45 + waterBoost + (1 - inland) * 28 + Math.max(0, height - 35) * 0.28 - latitude * 16), 0, 100);
  return {temperature, precipitation};
}

function classifyBiome(temperature, precipitation, height, feature) {
  if (feature?.type === "ocean" || feature?.type === "lake") return 0;
  if (height > 72) return 8;
  if (temperature < -6) return 1;
  if (temperature < 5) return 2;
  if (precipitation < 24) return temperature > 18 ? 5 : 3;
  if (temperature > 22 && precipitation > 72) return 7;
  if (temperature > 18 && precipitation < 48) return 6;
  if (precipitation > 58) return 4;
  return 3;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
