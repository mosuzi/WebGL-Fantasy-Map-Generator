import {buildClimate} from "./climate.js";
import {defineBiomesAndPopulation} from "./biomes.js";
import {extractFeatures} from "./features.js";
import {buildGrid} from "./grid.js";
import {createHeightmap} from "./heightmap.js";
import {buildMarkers} from "./markers.js";
import {buildMilitary} from "./military.js";
import {normalizeOptions} from "./options.js";
import {buildPack} from "./pack.js";
import {buildPolitics} from "./politics.js";
import {createRandom, stableHash} from "./random.js";
import {buildRivers} from "./rivers.js";
import {buildSettlements, finalizeSettlements} from "./settlements.js";
import {buildSociety, finalizeSocietyReligions} from "./society.js";

export function generatePlaceholderMap(inputOptions = {}) {
  const options = normalizeOptions(inputOptions);
  const gridRandom = createRandom(options.seed);
  const random = createRandom(options.seed);
  const heightmap = createHeightmap(options, random);
  const grid = buildGrid(options, gridRandom, heightmap, random);
  const features = extractFeatures(grid);
  const climateRandom = createRandom(options.seed);
  const climate = buildClimate(grid, features, options, climateRandom);
  const pack = buildPack(grid, features);
  const rivers = buildRivers(grid, features, pack, options);
  const biomes = defineBiomesAndPopulation(grid, pack);
  climate.biomes = biomes.biomes;
  climate.metadata.biomeCounts = biomes.metadata.biomeCounts;
  const society = buildSociety(grid, features, climate, rivers, random, pack, options);
  const settlements = buildSettlements(grid, features, null, rivers, random, pack, options);
  const politics = buildPolitics(grid, features, society, rivers, random, options, pack);
  finalizeSettlements(grid, features, politics, settlements, pack);
  finalizeSocietyReligions(grid, society, pack, random, settlements, options);
  const military = buildMilitary(pack, options);
  const markers = buildMarkers(grid, features, politics, rivers, pack, options);
  const layers = createPalette(random);
  const summary = createGenerationSummary(options, grid, features, climate, society, politics, settlements, markers, pack, rivers, layers, military);
  const generatedAt = new Date().toISOString();

  return {
    metadata: {
      app: "webgl-generator",
      generatorStage: "source-stage-18-marker-first-pass",
      seed: options.seed,
      heightmapTemplate: heightmap.template,
      cellsTarget: options.cellsTarget,
      gridCells: grid.metadata.actualCells,
      packCells: pack.metadata.cells,
      featureCount: features.metadata.featureCount,
      graphWidth: options.graphWidth,
      graphHeight: options.graphHeight,
      checksum: summary.checksum,
      generatedAt
    },
    options,
    layers,
    heightmap,
    grid,
    climate,
    mapCoordinates: climate.mapCoordinates,
    society,
    politics,
    settlements,
    military,
    markers,
    pack,
    features,
    rivers,
    summary,
    generationLog: [
      `normalize options: seed=${options.seed}, cells=${options.cellsTarget}, size=${options.graphWidth}x${options.graphHeight}`,
      `heightmap template: ${heightmap.template}`,
      `initialize seeded random: ${summary.randomPreview.join(", ")}`,
      `build grid: ${grid.metadata.actualCells} cells, ${grid.metadata.vertexCount} vertices, ${grid.metadata.triangles} triangles`,
      `extract features: land=${features.metadata.landFeatures}, ocean=${features.metadata.oceanFeatures}, lakes=${features.metadata.lakeFeatures}`,
      `build climate: temp=${climate.metadata.temperatureMin}..${climate.metadata.temperatureMax}, prec=${climate.metadata.precipitationMin}..${climate.metadata.precipitationMax}`,
      `build pack: ${pack.metadata.cells} semantic cells, mapping=${pack.metadata.mapping}`,
      `trace rivers: rivers=${rivers.metadata.rivers}, segments=${rivers.metadata.segments}`,
      `define biomes and rank cells: biomes=${Object.keys(biomes.metadata.biomeCounts).length}, populationCells=${biomes.metadata.positivePopulationCells}`,
      `build society: cultures=${society.metadata.cultures}, culturedPackCells=${society.metadata.culturedPackCells}`,
      `build politics: states=${politics.metadata.states}, provinces=${politics.metadata.provinces}, regions=${politics.metadata.regions}`,
      `build settlements: cities=${settlements.metadata.cities}, routes=${settlements.metadata.routes}, populationCells=${settlements.metadata.populationCells}`,
      `build religions: religions=${society.metadata.religions}, religionPackCells=${society.metadata.religionPackCells}`,
      `build military: states=${military.metadata.statesWithMilitary}, regiments=${military.metadata.regiments}`,
      `build markers: markers=${markers.metadata.markers}, peaks=${markers.metadata.peaks}, riverSources=${markers.metadata.riverSources}`,
      `grid checksum: ${summary.checksum}`
    ],
    status: {
      message: "source 阶段 18 marker 第一刀",
      sourceDependency: false,
      snapshotDependency: false
    }
  };
}

export function createGenerationSummary(options, grid, features, climate, society, politics, settlements, markers, pack, rivers, layers, military = null) {
  const randomPreviewGenerator = createRandom(options.seed);
  const randomPreview = Array.from({length: 4}, () => round(randomPreviewGenerator.next(), 6));
  const payload = {
    seed: options.seed,
    heightmapTemplate: options.heightmapTemplate,
    cellsTarget: options.cellsTarget,
    gridCells: grid.metadata.actualCells,
    graphWidth: options.graphWidth,
    graphHeight: options.graphHeight,
    grid: {
      columns: grid.metadata.columns,
      rows: grid.metadata.rows,
      vertexCount: grid.metadata.vertexCount,
      triangles: grid.metadata.triangles,
      samplePoints: grid.points.slice(0, 6),
      sampleHeights: grid.cells.h.slice(0, 12)
    },
    features: features.metadata,
    climate: {
      temperatureMin: climate.metadata.temperatureMin,
      temperatureMax: climate.metadata.temperatureMax,
      precipitationMin: climate.metadata.precipitationMin,
      precipitationMax: climate.metadata.precipitationMax,
      biomeCounts: climate.metadata.biomeCounts
    },
    pack: {
      cells: pack.metadata.cells,
      vertices: pack.metadata.vertices,
      mapping: pack.metadata.mapping,
      sampleTypes: pack.cells.type.slice(0, 12)
    },
    rivers: rivers.metadata,
    society: {
      cultures: grid.cells.culture.slice(0, 12),
      religions: grid.cells.religion.slice(0, 12),
      cultureCount: society.metadata.cultures,
      religionCount: society.metadata.religions
    },
    politics: {
      states: grid.cells.state.slice(0, 12),
      provinces: grid.cells.province.slice(0, 12),
      regions: grid.cells.region.slice(0, 12),
      stateCount: politics.metadata.states,
      provinceCount: politics.metadata.provinces,
      regionCount: politics.metadata.regions
    },
    settlements: {
      cityCount: settlements.metadata.cities,
      routeCount: settlements.metadata.routes,
      populationCells: settlements.metadata.populationCells,
      sampleCities: settlements.cities.slice(0, 8).map(city => ({
        id: city.id,
        name: city.name,
        cell: city.cell,
        population: city.population,
        state: city.state,
        capital: city.capital,
        port: city.port
      }))
    },
    markers: markers.metadata,
    military: military?.metadata || null,
    palette: {
      ocean: layers.ocean.map(value => round(value, 4)),
      land: layers.land.map(value => round(value, 4)),
      highland: layers.highland.map(value => round(value, 4))
    },
    randomPreview
  };

  return {
    ...payload,
    checksum: stableHash(JSON.stringify(payload))
  };
}

function createPalette(random) {
  const oceanShift = random.range(-0.03, 0.04);
  const landShift = random.range(-0.04, 0.05);
  return {
    background: [0.07, 0.13, 0.18, 1],
    ocean: [round(0.12 + oceanShift, 4), round(0.33 + oceanShift, 4), round(0.52 + oceanShift, 4), 1],
    land: [round(0.46 + landShift, 4), round(0.55 + landShift, 4), round(0.35 + landShift, 4), 1],
    highland: [round(0.7 + landShift, 4), round(0.66 + landShift, 4), round(0.52 + landShift, 4), 1]
  };
}

function round(value, digits) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
