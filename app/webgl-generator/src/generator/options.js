import {createRandom} from "./random.js";

export const DEFAULT_OPTIONS = {
  seed: "stage-2-1",
  randomSeed: false,
  heightmapTemplate: "continents",
  cellsTarget: 10000,
  graphWidth: 1440,
  graphHeight: 960,
  statesNumber: 20,
  provincesRatio: 20,
  religionsNumber: 6,
  culturesNumber: 12,
  culturesSetMax: 32,
  sizeVariety: 4,
  growthRate: 1,
  temperatureEquator: 25,
  temperatureNorthPole: -25,
  temperatureSouthPole: -15,
  precipitation: 100
};

const HEIGHTMAP_TEMPLATES = new Set(["continents", "mediterranean", "highIsland", "lowIsland", "peninsula", "pangea", "archipelago"]);

export function normalizeOptions(input = {}) {
  const seed = String(input.seed || DEFAULT_OPTIONS.seed).trim() || DEFAULT_OPTIONS.seed;
  const randomized = createRandomizedDefaults(seed);

  return {
    seed,
    randomSeed: Boolean(input.randomSeed),
    heightmapTemplate: HEIGHTMAP_TEMPLATES.has(input.heightmapTemplate) ? input.heightmapTemplate : DEFAULT_OPTIONS.heightmapTemplate,
    cellsTarget: clampInteger(input.cellsTarget, 1000, 100000, DEFAULT_OPTIONS.cellsTarget),
    graphWidth: clampInteger(input.graphWidth, 640, 4096, DEFAULT_OPTIONS.graphWidth),
    graphHeight: clampInteger(input.graphHeight, 480, 4096, DEFAULT_OPTIONS.graphHeight),
    statesNumber: clampInteger(input.statesNumber, 0, 100, randomized.statesNumber),
    provincesRatio: clampInteger(input.provincesRatio, 20, 100, randomized.provincesRatio),
    religionsNumber: clampInteger(input.religionsNumber, 0, 100, randomized.religionsNumber),
    culturesNumber: clampInteger(input.culturesNumber, 1, 100, randomized.culturesNumber),
    culturesSet: typeof input.culturesSet === "string" ? input.culturesSet : randomized.culturesSet,
    culturesSetMax: clampInteger(input.culturesSetMax, 1, 100, randomized.culturesSetMax),
    sizeVariety: clampNumber(input.sizeVariety, 0, 10, randomized.sizeVariety),
    growthRate: clampNumber(input.growthRate, 0.1, 10, randomized.growthRate),
    temperatureEquator: clampInteger(input.temperatureEquator, 20, 35, randomized.temperatureEquator),
    temperatureNorthPole: clampInteger(input.temperatureNorthPole, -40, 10, randomized.temperatureNorthPole),
    temperatureSouthPole: clampInteger(input.temperatureSouthPole, -40, 10, randomized.temperatureSouthPole),
    precipitation: clampInteger(input.precipitation, 5, 500, randomized.precipitation)
  };
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function createRandomizedDefaults(seed) {
  const random = createRandom(seed);

  const statesNumber = gauss(random, 18, 5, 2, 30);
  const provincesRatio = gauss(random, 20, 10, 20, 100);
  const religionsNumber = gauss(random, 6, 3, 2, 10);
  const sizeVariety = gauss(random, 4, 2, 0, 10, 1);
  const growthRate = round(1 + random.next(), 1);
  const culturesNumber = gauss(random, 12, 3, 5, 30);
  const culturesSet = weightedChoice(
    random,
    {
      world: 10,
      european: 10,
      oriental: 2,
      english: 5,
      antique: 3,
      highFantasy: 11,
      darkFantasy: 3,
      random: 1
    }
  );
  const culturesSetMax = {
    world: 32,
    european: 15,
    oriental: 13,
    english: 10,
    antique: 10,
    highFantasy: 17,
    darkFantasy: 18,
    random: 100
  }[culturesSet];

  return {
    statesNumber,
    provincesRatio,
    religionsNumber,
    sizeVariety,
    growthRate,
    culturesNumber,
    culturesSet,
    culturesSetMax,
    temperatureEquator: gauss(random, 25, 7, 20, 35),
    temperatureNorthPole: gauss(random, -25, 7, -40, 10),
    temperatureSouthPole: gauss(random, -15, 7, -40, 10),
    precipitation: gauss(random, 100, 40, 5, 500)
  };
}

function weightedChoice(random, weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.floor(random.next() * total);
  for (const [key, weight] of entries) {
    if (roll < weight) return key;
    roll -= weight;
  }
  return entries[0]?.[0];
}

function gauss(random, expected = 100, deviation = 30, min = 0, max = 300, digits = 0) {
  const value = randomNormal(random, expected, deviation);
  return round(Math.min(Math.max(value, min), max), digits);
}

function randomNormal(random, mean, deviation) {
  let x;
  let y;
  let radius;

  do {
    x = random.next() * 2 - 1;
    y = random.next() * 2 - 1;
    radius = x * x + y * y;
  } while (!radius || radius > 1);

  return mean + deviation * y * Math.sqrt((-2 * Math.log(radius)) / radius);
}

function round(value, digits = 0) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
