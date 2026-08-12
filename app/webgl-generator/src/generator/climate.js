import {BIOMES} from "./biomes.js";
import {
  atmosphereDirectionLabel,
  climateLatitudeLabel,
  resolveAtmosphereWindProfile,
  resolveClimateLatitudePreset
} from "./climate-options.js";
import {sampleOceanCurrent} from "./ocean-currents.js";

const CLIMATE_OPTIONS = {
  winds: [225, 45, 225, 315, 135, 315],
  temperatureEquator: 27,
  temperatureNorthPole: -30,
  temperatureSouthPole: -15,
  heightExponent: 2,
  precipitation: 100
};

export function buildClimate(grid, features, options, random) {
  const mapCoordinates = options.mapTemplateCoordinates
    ? normalizeTemplateMapCoordinates(options.mapTemplateCoordinates, options)
    : calculateMapCoordinates(defineMapSize(options, grid, features, random), options);
  const windProfile = resolveAtmosphereWindProfile(options.atmosphereDirection, options.winds || CLIMATE_OPTIONS.winds);
  const climateOptions = {...options, winds: windProfile.winds};
  const temp = calculateTemperatures(grid, mapCoordinates, options);
  grid.cells.temp = Array.from(temp);
  const prec = generatePrecipitation(grid, mapCoordinates, climateOptions, random);
  const biome = [];
  const biomeCounts = new Map();

  for (let cell = 0; cell < grid.points.length; cell++) {
    const feature = features.features[grid.cells.f[cell]];
    const biomeId = classifyBiome(temp[cell], prec[cell], grid.cells.h[cell], feature);
    biome.push(biomeId);
    biomeCounts.set(biomeId, (biomeCounts.get(biomeId) || 0) + 1);
  }

  grid.cells.prec = Array.from(prec);
  grid.cells.biome = biome;
  const temperatureRange = valueRange(grid.cells.temp);
  const precipitationRange = valueRange(grid.cells.prec);

  return {
    biomes: BIOMES,
    mapCoordinates,
    metadata: {
      temperatureMin: temperatureRange.min,
      temperatureMax: temperatureRange.max,
      precipitationMin: precipitationRange.min,
      precipitationMax: precipitationRange.max,
      latitudeMode: mapCoordinates.latitudeMode,
      latitudeLabel: mapCoordinates.latitudeLabel,
      latitudeCenter: mapCoordinates.latCenter,
      mapSizePercent: mapCoordinates.mapSizePercent,
      latitudeRangePercent: mapCoordinates.latitudeRangePercent,
      longitudeRangePercent: mapCoordinates.longitudeRangePercent,
      atmosphereDirection: windProfile.direction,
      atmosphereLabel: windProfile.label,
      windAngle: windProfile.angle,
      windProfile: windProfile.winds,
      biomeCounts: Object.fromEntries([...biomeCounts.entries()].map(([id, count]) => [BIOMES[id]?.name || id, count]))
    }
  };
}

function normalizeTemplateMapCoordinates(input, options) {
  const values = [input.latN, input.latS, input.lonW, input.lonE].map(Number);
  if (!values.every(Number.isFinite)) throw new Error("地图模板地理坐标无效");
  const latN = clamp(values[0], -90, 90);
  const latS = clamp(values[1], -90, 90);
  const lonW = clamp(values[2], -180, 180);
  const lonE = clamp(values[3], -180, 180);
  if (!(latN > latS)) throw new Error("地图模板纬度范围无效");
  const latT = latN - latS;
  const lonT = Number(input.lonT) > 0 ? Number(input.lonT) : ((lonE - lonW + 360) % 360 || 360);
  return {
    latT,
    latN,
    latS,
    latCenter: (latN + latS) / 2,
    latitudeMode: "template",
    latitudeLabel: String(input.latitudeLabel || `模板纬度 ${latS}°～${latN}°`),
    lonT,
    lonW,
    lonE,
    mapSizePercent: latT / 180 * 100,
    latitudeRangePercent: latT / 180 * 100,
    longitudeRangePercent: lonT / 360 * 100,
    atmosphereLabel: atmosphereDirectionLabel(options.atmosphereDirection),
    projection: String(input.projection || "regional-equirectangular")
  };
}

export function applyOceanCurrentClimateInfluence(grid, features, climate, oceanCurrents) {
  const currents = oceanCurrents?.currents || [];
  const count = grid?.points?.length || 0;
  const baseTemp = grid?.cells?.temp;
  const basePrec = grid?.cells?.prec;
  if (!count || !baseTemp || !basePrec) return emptyOceanCurrentInfluence(currents.length);

  const temperatureDelta = new Float32Array(count);
  const precipitationDelta = new Float32Array(count);
  const locateCell = createNearestGridCellLocator(grid);
  const propagationFloor = 0.045;
  let tracedCells = 0;

  for (const current of currents) {
    const thermalSign = current.temperature === "warm" ? 1 : current.temperature === "cold" ? -1 : 0;
    if (!thermalSign) continue;
    const samples = sampleOceanCurrent(current, 20);
    if (samples.length < 2) continue;
    const weights = new Float32Array(count);
    const queue = [];
    let head = 0;
    let tail = 0;
    for (let index = 0; index < samples.length; index++) {
      const cell = locateCell(samples[index]);
      if (cell < 0) continue;
      const directionWeight = 0.72 + (index / Math.max(1, samples.length - 1)) * 0.48;
      const sourceWeight = Math.max(weights[cell], directionWeight);
      if (sourceWeight === weights[cell]) continue;
      weights[cell] = sourceWeight;
      queue[tail++] = cell;
    }
    const strength = Math.max(0.05, Math.min(1, Number(current.strength) || 0.5));
    while (head < tail) {
      const cell = queue[head++];
      const weight = weights[cell];
      const magnitude = strength * weight;
      temperatureDelta[cell] += thermalSign * 4.2 * magnitude;
      precipitationDelta[cell] += thermalSign > 0 ? 22 * magnitude : -15 * magnitude;
      tracedCells++;
      const nextWeight = weight * 0.76;
      if (nextWeight < propagationFloor) continue;
      for (const neighbor of grid.cells.c[cell] || []) {
        if (nextWeight <= weights[neighbor] + 0.001) continue;
        weights[neighbor] = nextWeight;
        queue[tail++] = neighbor;
      }
    }
  }

  let affectedCells = 0;
  let affectedLandCells = 0;
  let warmCells = 0;
  let coldCells = 0;
  let temperatureDeltaTotal = 0;
  let precipitationDeltaTotal = 0;
  for (let cell = 0; cell < count; cell++) {
    const tempDelta = clamp(temperatureDelta[cell], -8, 8);
    const precDelta = clamp(precipitationDelta[cell], -40, 40);
    if (Math.abs(tempDelta) < 0.25 && Math.abs(precDelta) < 0.5) continue;
    grid.cells.temp[cell] = clamp(Math.round(Number(baseTemp[cell]) + tempDelta), -128, 127);
    grid.cells.prec[cell] = clamp(Math.round(Number(basePrec[cell]) + precDelta), 0, 255);
    const feature = features?.features?.[grid.cells.f[cell]];
    if (feature?.land) affectedLandCells++;
    affectedCells++;
    if (tempDelta > 0) warmCells++;
    else if (tempDelta < 0) coldCells++;
    temperatureDeltaTotal += tempDelta;
    precipitationDeltaTotal += precDelta;
  }

  refreshClimateBiomeMetadata(grid, features, climate);
  const influence = {
    version: 1,
    algorithm: "coastal-advection-v1",
    currents: currents.length,
    affectedCells,
    affectedLandCells,
    warmCells,
    coldCells,
    tracedCells,
    meanTemperatureDelta: round(affectedCells ? temperatureDeltaTotal / affectedCells : 0, 3),
    meanPrecipitationDelta: round(affectedCells ? precipitationDeltaTotal / affectedCells : 0, 3),
    checksum: climateInfluenceChecksum(grid.cells.temp, grid.cells.prec)
  };
  climate.metadata.oceanCurrentInfluence = influence;
  return influence;
}

function emptyOceanCurrentInfluence(currents = 0) {
  return {version: 1, algorithm: "coastal-advection-v1", currents, affectedCells: 0, affectedLandCells: 0, warmCells: 0, coldCells: 0, tracedCells: 0, meanTemperatureDelta: 0, meanPrecipitationDelta: 0, checksum: "00000000"};
}

function createNearestGridCellLocator(grid) {
  const columns = Math.max(1, Number(grid.metadata?.columns) || 1);
  const rows = Math.max(1, Number(grid.metadata?.rows) || Math.ceil(grid.points.length / columns));
  let width = Number(grid.metadata?.graphWidth || grid.metadata?.width) || 0;
  let height = Number(grid.metadata?.graphHeight || grid.metadata?.height) || 0;
  if (!width || !height) {
    for (const point of grid.points) {
      width = Math.max(width, Number(point?.[0]) || 0);
      height = Math.max(height, Number(point?.[1]) || 0);
    }
  }
  return point => {
    const column = clamp(Math.round((point[0] / Math.max(1, width)) * (columns - 1)), 0, columns - 1);
    const row = clamp(Math.round((point[1] / Math.max(1, height)) * (rows - 1)), 0, rows - 1);
    let best = -1;
    let bestDistance = Infinity;
    for (let dy = -2; dy <= 2; dy++) {
      const y = row + dy;
      if (y < 0 || y >= rows) continue;
      for (let dx = -2; dx <= 2; dx++) {
        const x = column + dx;
        const cell = y * columns + x;
        if (x < 0 || x >= columns || cell >= grid.points.length) continue;
        const candidate = grid.points[cell];
        const distance = (candidate[0] - point[0]) ** 2 + (candidate[1] - point[1]) ** 2;
        if (distance >= bestDistance) continue;
        best = cell;
        bestDistance = distance;
      }
    }
    return best;
  };
}

function refreshClimateBiomeMetadata(grid, features, climate) {
  const biomeCounts = new Map();
  for (let cell = 0; cell < grid.points.length; cell++) {
    const feature = features?.features?.[grid.cells.f[cell]];
    const biomeId = classifyBiome(grid.cells.temp[cell], grid.cells.prec[cell], grid.cells.h[cell], feature);
    grid.cells.biome[cell] = biomeId;
    biomeCounts.set(biomeId, (biomeCounts.get(biomeId) || 0) + 1);
  }
  const temperatureRange = valueRange(grid.cells.temp);
  const precipitationRange = valueRange(grid.cells.prec);
  climate.metadata.temperatureMin = temperatureRange.min;
  climate.metadata.temperatureMax = temperatureRange.max;
  climate.metadata.precipitationMin = precipitationRange.min;
  climate.metadata.precipitationMax = precipitationRange.max;
  climate.metadata.biomeCounts = Object.fromEntries([...biomeCounts.entries()].map(([id, count]) => [BIOMES[id]?.name || id, count]));
}

function climateInfluenceChecksum(temp, prec) {
  let hash = 2166136261;
  for (let index = 0; index < temp.length; index++) {
    hash ^= (Number(temp[index]) + 128) & 255;
    hash = Math.imul(hash, 16777619);
    hash ^= Number(prec[index]) & 255;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function valueRange(values) {
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return {
    min: min === Infinity ? 0 : min,
    max: max === -Infinity ? 0 : max
  };
}

function defineMapSize(options, grid, features, random) {
  const requestedLatitudeRange = Number.isFinite(Number(options.climateLatitudeRangePercent ?? options.climateMapSizePercent)) ? Number(options.climateLatitudeRangePercent ?? options.climateMapSizePercent) : null;
  const requestedLongitudeRange = Number.isFinite(Number(options.climateLongitudeRangePercent ?? options.climateMapSizePercent ?? options.climateLatitudeRangePercent)) ? Number(options.climateLongitudeRangePercent ?? options.climateMapSizePercent ?? options.climateLatitudeRangePercent) : null;
  const latitudePreset = resolveClimateLatitudePreset(options.climateLatitudeMode);
  const customLatitudePreset = options.climateLatitudeMode === "custom"
    ? {
        value: "custom",
        label: climateLatitudeLabel("custom"),
        center: options.climateLatitudeCenter ?? 0,
        span: options.climateLatitudeSpan ?? 45
      }
    : latitudePreset;
  const template = options.heightmapTemplate;
  const landTouchesBorder = features.features.some(feature => feature?.land && feature.border);
  const maxSize = landTouchesBorder ? 80 : 100;
  const latitude = () => gauss(random, probability(random, 0.5) ? 40 : 60, 20, 25, 75);
  const withLatitudePreset = base => customLatitudePreset
    ? {
        ...base,
        size: requestedLatitudeRange ?? customLatitudePreset.span,
        longitudeSize: requestedLongitudeRange ?? requestedLatitudeRange ?? customLatitudePreset.span,
        latitudeCenter: customLatitudePreset.center,
        latitudeMode: customLatitudePreset.value,
        latitudeLabel: customLatitudePreset.label
      }
    : {
        ...base,
        size: requestedLatitudeRange ?? base.size,
        longitudeSize: requestedLongitudeRange ?? requestedLatitudeRange ?? base.size,
        latitudeMode: "auto",
        latitudeLabel: climateLatitudeLabel("auto")
      };

  if (!landTouchesBorder) {
    if (template === "pangea") return withLatitudePreset({size: 100, latitude: 50, longitude: 50});
    if (template === "continents" && probability(random, 0.5)) return withLatitudePreset({size: 100, latitude: 50, longitude: 50});
    if (template === "archipelago" && probability(random, 0.35)) return withLatitudePreset({size: 100, latitude: 50, longitude: 50});
    if (template === "highIsland" && probability(random, 0.25)) return withLatitudePreset({size: 100, latitude: 50, longitude: 50});
    if (template === "lowIsland" && probability(random, 0.1)) return withLatitudePreset({size: 100, latitude: 50, longitude: 50});
  }

  if (template === "pangea") return withLatitudePreset({size: gauss(random, 70, 20, 30, maxSize), latitude: latitude(), longitude: 50});
  if (template === "mediterranean") return withLatitudePreset({size: gauss(random, 25, 30, 15, 80), latitude: latitude(), longitude: 50});
  if (template === "peninsula") return withLatitudePreset({size: gauss(random, 15, 15, 5, 80), latitude: latitude(), longitude: 50});

  return withLatitudePreset({size: gauss(random, 30, 20, 15, maxSize), latitude: latitude(), longitude: 50});
}

function calculateMapCoordinates({size, longitudeSize, latitude, latitudeCenter, longitude, latitudeMode, latitudeLabel}, options) {
  const latitudeFraction = clamp((Number.isFinite(Number(size)) ? Number(size) : 25) / 100, 0.01, 1);
  const longitudeFraction = clamp((Number.isFinite(Number(longitudeSize)) ? Number(longitudeSize) : Number(size)) / 100, 0.01, 1);
  const lonShift = longitude / 100;
  const latT = round(latitudeFraction * 180, 1);
  const lonT = round(longitudeFraction * 360, 1);
  const {latN, latS} = Number.isFinite(latitudeCenter)
    ? centerLatitudeBand(latitudeCenter, latT)
    : shiftedLatitudeBand(latitude, latT);
  const lonE = round(180 - (360 - lonT) * lonShift, 1);
  const lonW = round(lonE - lonT, 1);
  return {
    latT,
    latN,
    latS,
    latCenter: round((latN + latS) / 2, 1),
    latitudeMode: latitudeMode || "auto",
    latitudeLabel: latitudeLabel || climateLatitudeLabel(latitudeMode),
    lonT,
    lonW,
    lonE,
    mapSizePercent: round(latitudeFraction * 100, 1),
    latitudeRangePercent: round(latitudeFraction * 100, 1),
    longitudeRangePercent: round(longitudeFraction * 100, 1),
    atmosphereLabel: atmosphereDirectionLabel(options.atmosphereDirection)
  };
}

function shiftedLatitudeBand(latitude, latT) {
  const latShift = latitude / 100;
  const latN = round(90 - (180 - latT) * latShift, 1);
  const latS = round(latN - latT, 1);
  return {latN, latS};
}

function centerLatitudeBand(center, latT) {
  const halfSpan = latT / 2;
  let latN = center + halfSpan;
  let latS = center - halfSpan;
  if (latN > 90) {
    latS -= latN - 90;
    latN = 90;
  }
  if (latS < -90) {
    latN += -90 - latS;
    latS = -90;
  }
  return {latN: round(latN, 1), latS: round(latS, 1)};
}

function calculateTemperatures(grid, mapCoordinates, options) {
  const temp = new Int8Array(grid.points.length);
  const {columns} = grid.metadata;
  const temperatureEquator = options.temperatureEquator ?? CLIMATE_OPTIONS.temperatureEquator;
  const temperatureNorthPole = options.temperatureNorthPole ?? CLIMATE_OPTIONS.temperatureNorthPole;
  const temperatureSouthPole = options.temperatureSouthPole ?? CLIMATE_OPTIONS.temperatureSouthPole;
  const tropics = [16, -20];
  const tropicalGradient = 0.15;
  const tempNorthTropic = temperatureEquator - tropics[0] * tropicalGradient;
  const northernGradient = (tempNorthTropic - temperatureNorthPole) / (90 - tropics[0]);
  const tempSouthTropic = temperatureEquator + tropics[1] * tropicalGradient;
  const southernGradient = (tempSouthTropic - temperatureSouthPole) / (90 + tropics[1]);
  const exponent = options.heightExponent ?? CLIMATE_OPTIONS.heightExponent;

  for (let rowCellId = 0; rowCellId < grid.points.length; rowCellId += columns) {
    const rowPoint = grid.points[rowCellId];
    const rowLatitude = mapCoordinates.latN - (rowPoint[1] / options.graphHeight) * mapCoordinates.latT;
    const tempSeaLevel = calculateSeaLevelTemp(rowLatitude);

    for (let cell = rowCellId; cell < Math.min(rowCellId + columns, grid.points.length); cell++) {
      temp[cell] = clamp(tempSeaLevel - getAltitudeTemperatureDrop(grid.cells.h[cell], exponent), -128, 127);
    }
  }

  function calculateSeaLevelTemp(latitude) {
    if (latitude <= 16 && latitude >= -20) return temperatureEquator - Math.abs(latitude) * tropicalGradient;
    return latitude > 0
      ? tempNorthTropic - (latitude - tropics[0]) * northernGradient
      : tempSouthTropic + (latitude - tropics[1]) * southernGradient;
  }

  return temp;
}

function getAltitudeTemperatureDrop(height, exponent) {
  if (height < 20) return 0;
  return round((((height - 18) ** exponent) / 1000) * 6.5);
}

function generatePrecipitation(grid, mapCoordinates, options, random) {
  const {columns, rows, cellsDesired} = grid.metadata;
  const prec = new Uint8Array(grid.points.length);
  const cellsNumberModifier = (cellsDesired / 10000) ** 0.25;
  const precInputModifier = (options.precipitation ?? CLIMATE_OPTIONS.precipitation) / 100;
  const modifier = cellsNumberModifier * precInputModifier;
  const winds = options.winds || CLIMATE_OPTIONS.winds;
  const latitudeModifier = [4, 2, 2, 2, 1, 1, 2, 2, 2, 2, 3, 3, 2, 2, 1, 1, 1, 0.5];
  const maxPassableElevation = 85;
  const westerly = [];
  const easterly = [];
  let southerly = 0;
  let northerly = 0;

  for (let row = 0, cell = 0; row < rows; row++, cell += columns) {
    const lat = mapCoordinates.latN - (row / rows) * mapCoordinates.latT;
    const latBand = ((Math.abs(lat) - 1) / 5) | 0;
    const latMod = latitudeModifier[latBand];
    const windTier = (Math.abs(lat - 89) / 30) | 0;
    const {isWest, isEast, isNorth, isSouth} = getWindDirections(winds[windTier]);
    if (isWest) westerly.push([cell, latMod, windTier]);
    if (isEast) easterly.push([cell + columns - 1, latMod, windTier]);
    if (isNorth) northerly++;
    if (isSouth) southerly++;
  }

  if (westerly.length) passWind(westerly, 120 * modifier, 1, columns);
  if (easterly.length) passWind(easterly, 120 * modifier, -1, columns);

  const verticalTotal = southerly + northerly;
  if (northerly) {
    const bandN = ((Math.abs(mapCoordinates.latN) - 1) / 5) | 0;
    const latModN = mapCoordinates.latT > 60 ? mean(latitudeModifier) : latitudeModifier[bandN];
    passWind(range(0, columns, 1), (northerly / verticalTotal) * 60 * modifier * latModN, columns, rows);
  }

  if (southerly) {
    const bandS = ((Math.abs(mapCoordinates.latS) - 1) / 5) | 0;
    const latModS = mapCoordinates.latT > 60 ? mean(latitudeModifier) : latitudeModifier[bandS];
    passWind(range(grid.points.length - columns, grid.points.length, 1), (southerly / verticalTotal) * 60 * modifier * latModS, -columns, rows);
  }

  return prec;

  function getWindDirections(angle) {
    return {
      isWest: angle > 40 && angle < 140,
      isEast: angle > 220 && angle < 320,
      isNorth: angle > 100 && angle < 260,
      isSouth: angle > 280 || angle < 80
    };
  }

  function passWind(source, maxPrec, next, steps) {
    const maxPrecInit = maxPrec;

    for (let first of source) {
      if (first[0]) {
        maxPrec = Math.min(maxPrecInit * first[1], 255);
        first = first[0];
      }

      let humidity = maxPrec - grid.cells.h[first];
      if (humidity <= 0) continue;

      for (let step = 0, current = first; step < steps; step++, current += next) {
        if (grid.cells.temp[current] < -5) continue;

        if (grid.cells.h[current] < 20) {
          if (grid.cells.h[current + next] >= 20) {
            prec[current + next] += Math.max(humidity / rand(random, 10, 20), 1);
          } else {
            humidity = Math.min(humidity + 5 * modifier, maxPrec);
            prec[current] += 5 * modifier;
          }
          continue;
        }

        const isPassable = grid.cells.h[current + next] <= maxPassableElevation;
        const precipitation = isPassable ? getPrecipitation(humidity, current, next) : humidity;
        prec[current] += precipitation;
        humidity = isPassable ? clamp(humidity - precipitation + (precipitation > 1.5 ? 1 : 0), 0, maxPrec) : 0;
      }
    }
  }

  function getPrecipitation(humidity, cell, next) {
    const normalLoss = Math.max(humidity / (10 * modifier), 1);
    const diff = Math.max(grid.cells.h[cell + next] - grid.cells.h[cell], 0);
    const mod = (grid.cells.h[cell + next] / 70) ** 2;
    return clamp(normalLoss + diff * mod, 1, humidity);
  }
}

function classifyBiome(temperature, precipitation, height, feature) {
  if (!feature?.land) return 0;
  if (height > 72) return 8;
  if (temperature < -6) return 1;
  if (temperature < 5) return 2;
  if (precipitation < 24) return temperature > 18 ? 5 : 3;
  if (temperature > 22 && precipitation > 72) return 7;
  if (temperature > 18 && precipitation < 48) return 6;
  if (precipitation > 58) return 4;
  return 3;
}

function rand(random, min, max) {
  return Math.floor(random.next() * (max - min + 1)) + min;
}

function probability(random, value) {
  if (value >= 1) return true;
  if (value <= 0) return false;
  return random.next() < value;
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

function range(start, end, step) {
  const values = [];
  for (let value = start; value < end; value += step) values.push(value);
  return values;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value, digits = 0) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
