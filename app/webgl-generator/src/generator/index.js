import {buildClimate} from "./climate.js";
import {defineBiomesAndPopulation} from "./biomes.js";
import {buildEconomy} from "./economy.js";
import {buildDiplomacy} from "./diplomacy.js";
import {extractFeatures} from "./features.js";
import {buildGrid} from "./grid.js";
import {createHeightmap} from "./heightmap.js";
import {buildMarkers} from "./markers.js";
import {buildMilitary} from "./military.js";
import {normalizeOptions} from "./options.js";
import {buildPack} from "./pack.js";
import {buildPolitics} from "./politics.js";
import {createStageProfile} from "./profile.js";
import {createRandom, stableHash} from "./random.js";
import {buildRivers, renameHydronymsByCulture} from "./rivers.js";
import {buildSettlements, finalizeSettlements} from "./settlements.js";
import {buildSociety, finalizeSocietyReligions} from "./society.js";
import {buildZones} from "./zones.js";

export function generatePlaceholderMap(inputOptions = {}, overrides = {}) {
  const profile = createStageProfile({
    onStageStart: overrides.onStageStart,
    onStageEnd: overrides.onStageEnd
  });
  const options = profile.stage("normalize-options", "标准化参数", () => normalizeOptions(inputOptions));
  const gridRandom = profile.stage("random-grid", "初始化 grid 随机源", () => createRandom(options.seed));
  const random = profile.stage("random-main", "初始化主随机源", () => createRandom(options.seed));
  const heightmap = profile.stage("heightmap", "生成高度模板", () => overrides.heightmap || createHeightmap(options, random));
  const generationOptions = heightmap.template === options.heightmapTemplate ? options : {...options, heightmapTemplate: heightmap.template};
  const grid = profile.stage("grid", "构建 grid / Voronoi / 高度", () => buildGrid(generationOptions, gridRandom, heightmap, random));
  const features = profile.stage("features", "提取水陆 feature", () => extractFeatures(grid));
  const climateRandom = profile.stage("random-climate", "初始化气候随机源", () => createRandom(generationOptions.seed));
  const climate = profile.stage("climate", "生成气候", () => buildClimate(grid, features, generationOptions, climateRandom));
  const pack = profile.stage("pack", "构建 pack 语义图", () => buildPack(grid, features));
  const rivers = profile.stage("rivers", "生成河流", () => buildRivers(grid, features, pack, generationOptions));
  const biomes = profile.stage("biomes-population", "生成生物群系与人口评分", () => defineBiomesAndPopulation(grid, pack, generationOptions));
  climate.biomes = biomes.biomes;
  climate.metadata.biomeCounts = biomes.metadata.biomeCounts;
  const society = profile.stage("society-cultures", "生成文化初稿", () => buildSociety(grid, features, climate, rivers, random, pack, generationOptions));
  profile.stage("river-names", "按文化命名河流", () => renameHydronymsByCulture(rivers, pack, generationOptions));
  const settlements = profile.stage("settlements-initial", "生成初始城镇", () => buildSettlements(grid, features, null, rivers, random, pack, generationOptions));
  const politics = profile.stage("politics", "生成国家 / 省份 / 区域", () => buildPolitics(grid, features, society, rivers, random, generationOptions, pack));
  profile.stage("settlements-finalize", "按政区整理城镇和路线", () => finalizeSettlements(grid, features, politics, settlements, pack, {...generationOptions, pruneNeutralSettlements: true}));
  const markers = profile.stage("markers", "生成标记 / 资源点", () => buildMarkers(grid, features, politics, rivers, pack, generationOptions));
  pack.markers = markers.markers;
  const economy = profile.stage("economy", "生成商品 / 市场 / 交易 / 税收", () => buildEconomy(pack, generationOptions));
  profile.stage("religions-finalize", "按城镇和文化扩张宗教", () => finalizeSocietyReligions(grid, society, pack, random, settlements, generationOptions));
  const diplomacy = profile.stage("diplomacy", "生成外交关系", () => buildDiplomacy(pack, society, generationOptions));
  const military = profile.stage("military", "生成军事", () => buildMilitary(pack, generationOptions));
  const zones = profile.stage("zones", "生成区域", () => buildZones(pack, generationOptions));
  const layers = profile.stage("palette", "生成色板", () => createPalette(random));
  const summary = profile.stage("summary", "生成摘要和校验", () => createGenerationSummary(generationOptions, grid, features, climate, society, politics, settlements, markers, pack, rivers, layers, military, zones, economy, diplomacy));
  const generatedAt = profile.stage("metadata", "生成元数据", () => new Date().toISOString());
  const generationTiming = profile.finish();

  return {
    metadata: {
      app: "webgl-generator",
      generatorStage: "source-stage-20-diplomacy-first-pass",
      seed: generationOptions.seed,
      heightmapTemplate: heightmap.template,
      cellsTarget: generationOptions.cellsTarget,
      gridCells: grid.metadata.actualCells,
      packCells: pack.metadata.cells,
      featureCount: features.metadata.featureCount,
      graphWidth: generationOptions.graphWidth,
      graphHeight: generationOptions.graphHeight,
      checksum: summary.checksum,
      generatedAt,
      generationTiming
    },
    options: generationOptions,
    layers,
    heightmap,
    grid,
    climate,
    mapCoordinates: climate.mapCoordinates,
    society,
    politics,
    settlements,
    economy,
    diplomacy,
    military,
    markers,
    zones,
    pack,
    features,
    rivers,
    summary,
    generationLog: [
      `normalize options: seed=${generationOptions.seed}, cells=${generationOptions.cellsTarget}, size=${generationOptions.graphWidth}x${generationOptions.graphHeight}`,
      `heightmap template: ${heightmap.template}`,
      `initialize seeded random: ${summary.randomPreview.join(", ")}`,
      `build grid: ${grid.metadata.actualCells} cells, ${grid.metadata.vertexCount} vertices, ${grid.metadata.triangles} triangles`,
      `extract features: land=${features.metadata.landFeatures}, ocean=${features.metadata.oceanFeatures}, lakes=${features.metadata.lakeFeatures}`,
      `build climate: ${climate.metadata.latitudeLabel}, ${climate.metadata.atmosphereLabel}, temp=${climate.metadata.temperatureMin}..${climate.metadata.temperatureMax}, prec=${climate.metadata.precipitationMin}..${climate.metadata.precipitationMax}`,
      `build pack: ${pack.metadata.cells} semantic cells, mapping=${pack.metadata.mapping}`,
      `trace rivers: rivers=${rivers.metadata.rivers}, segments=${rivers.metadata.segments}`,
      `define biomes and rank cells: biomes=${Object.keys(biomes.metadata.biomeCounts).length}, populationCells=${biomes.metadata.positivePopulationCells}`,
      `build society: cultures=${society.metadata.cultures}, culturedPackCells=${society.metadata.culturedPackCells}`,
      `build politics: states=${politics.metadata.states}, provinces=${politics.metadata.provinces}, regions=${politics.metadata.regions}`,
      `build settlements: cities=${settlements.metadata.cities}, routes=${settlements.metadata.routes}, populationCells=${settlements.metadata.populationCells}`,
      `build markers: markers=${markers.metadata.markers}, resources=${markers.metadata.resourceMarkers}, resourcePotential=${markers.metadata.resourcePotential}`,
      `build economy: goods=${economy.metadata.goods}, markets=${economy.metadata.markets}, deals=${economy.metadata.deals}, resourceCells=${economy.metadata.resourceCells}, markerResourceDeals=${economy.metadata.resourceTrade?.markerResourceDeals || 0}`,
      `build religions: religions=${society.metadata.religions}, religionPackCells=${society.metadata.religionPackCells}`,
      `build diplomacy: pairs=${diplomacy.metadata.pairs}, allies=${diplomacy.metadata.allies}, rivals=${diplomacy.metadata.rivals}, enemies=${diplomacy.metadata.enemies}`,
      `build military: states=${military.metadata.statesWithMilitary}, regiments=${military.metadata.regiments}`,
      `build zones: zones=${zones.metadata.zones}, target=${zones.metadata.target}, cells=${zones.metadata.cells}, invalidCells=${zones.metadata.invalidCells}`,
      `generation timing: total=${generationTiming.totalMs}ms, slowest=${generationTiming.slowest?.label || "none"} ${generationTiming.slowest?.ms ?? 0}ms`,
      `grid checksum: ${summary.checksum}`
    ],
    status: {
      message: "source 阶段 19 economy 第一刀",
      sourceDependency: false,
      snapshotDependency: false
    }
  };
}

export function createGenerationSummary(options, grid, features, climate, society, politics, settlements, markers, pack, rivers, layers, military = null, zones = null, economy = null, diplomacy = null) {
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
      latitudeMode: climate.metadata.latitudeMode,
      latitudeLabel: climate.metadata.latitudeLabel,
      latitudeCenter: climate.metadata.latitudeCenter,
      atmosphereDirection: climate.metadata.atmosphereDirection,
      atmosphereLabel: climate.metadata.atmosphereLabel,
      windAngle: climate.metadata.windAngle,
      windProfile: climate.metadata.windProfile,
      mapCoordinates: climate.mapCoordinates,
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
    diplomacy: diplomacy?.metadata || null,
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
    zones: zones?.metadata || null,
    economy: economy?.metadata || {
      goods: (pack.goods || []).filter(Boolean).length,
      markets: Math.max(0, (pack.markets || []).filter(Boolean).length),
      deals: (pack.deals || []).filter(Boolean).length
    },
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
