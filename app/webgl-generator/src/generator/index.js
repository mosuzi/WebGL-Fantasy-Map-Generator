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
import {buildOceanCurrents} from "./ocean-currents.js";
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
  const namebases = profile.stage("namebase-context", "继承名称库上下文", () => normalizeGenerationNamebases(inputOptions.namebases));
  const gridRandom = profile.stage("random-grid", "初始化 grid 随机源", () => createRandom(options.seed));
  const random = profile.stage("random-main", "初始化主随机源", () => createRandom(options.seed));
  const heightmap = profile.stage("heightmap", "生成高度模板", () => overrides.heightmap || createHeightmap(options, random));
  const generationOptions = heightmap.template === options.heightmapTemplate ? options : {...options, heightmapTemplate: heightmap.template};
  const diagnostics = normalizeGenerationDiagnostics(inputOptions);
  const stageOptions = {...generationOptions, ...diagnostics, ...(namebases ? {namebases} : {})};
  const grid = profile.stage("grid", "构建 grid / Voronoi / 高度", () => buildGrid(generationOptions, gridRandom, heightmap, random));
  const features = profile.stage("features", "提取水陆 feature", () => extractFeatures(grid));
  const climateRandom = profile.stage("random-climate", "初始化气候随机源", () => createRandom(generationOptions.seed));
  const climate = profile.stage("climate", "生成气候", () => buildClimate(grid, features, generationOptions, climateRandom));
  const oceanCurrents = profile.stage("ocean-currents", "生成主要表层洋流", () => buildOceanCurrents({
    metadata: {seed: generationOptions.seed, graphWidth: generationOptions.graphWidth, graphHeight: generationOptions.graphHeight},
    options: generationOptions,
    grid,
    features,
    mapCoordinates: climate.mapCoordinates
  }));
  const pack = profile.stage("pack", "构建 pack 语义图", () => buildPack(grid, features));
  const rivers = profile.stage("rivers", "生成河流", () => buildRivers(grid, features, pack, stageOptions));
  const biomes = profile.stage("biomes-population", "生成生物群系与人口评分", () => defineBiomesAndPopulation(grid, pack, generationOptions));
  climate.biomes = biomes.biomes;
  climate.metadata.biomeCounts = biomes.metadata.biomeCounts;
  const society = profile.stage("society-cultures", "生成文化初稿", () => buildSociety(grid, features, climate, rivers, random, pack, generationOptions));
  profile.stage("river-names", "按文化命名河流", () => renameHydronymsByCulture(rivers, pack, stageOptions));
  const settlements = profile.stage("settlements-initial", "生成初始城镇", () => buildSettlements(grid, features, null, rivers, random, pack, stageOptions));
  const politics = profile.stage("politics", "生成国家 / 省份 / 区域", () => buildPolitics(grid, features, society, rivers, random, stageOptions, pack));
  profile.stage("settlements-finalize", "按政区整理城镇和路线", () => finalizeSettlements(grid, features, politics, settlements, pack, {...stageOptions, pruneNeutralSettlements: true}));
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
      namebases: namebases ? createGenerationNamebaseMetadata(namebases) : null,
      generatedAt,
      generationTiming
    },
    options: generationOptions,
    layers,
    heightmap,
    grid,
    climate,
    oceanCurrents,
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
    ...(namebases ? {namebases} : {}),
    summary,
    generationLog: [
      `normalize options: seed=${generationOptions.seed}, cells=${generationOptions.cellsTarget}, size=${generationOptions.graphWidth}x${generationOptions.graphHeight}`,
      `namebase context: ${namebases ? namebaseContextLog(namebases) : "none"}`,
      `heightmap template: ${heightmap.template}`,
      `initialize seeded random: ${summary.randomPreview.join(", ")}`,
      `build grid: ${grid.metadata.actualCells} cells, ${grid.metadata.vertexCount} vertices, ${grid.metadata.triangles} triangles`,
      `extract features: land=${features.metadata.landFeatures}, ocean=${features.metadata.oceanFeatures}, lakes=${features.metadata.lakeFeatures}`,
      `build climate: ${climate.metadata.latitudeLabel}, ${climate.metadata.atmosphereLabel}, temp=${climate.metadata.temperatureMin}..${climate.metadata.temperatureMax}, prec=${climate.metadata.precipitationMin}..${climate.metadata.precipitationMax}`,
      `build ocean currents: currents=${oceanCurrents.metadata.count}, basins=${oceanCurrents.metadata.basins}, algorithm=${oceanCurrents.algorithm}`,
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
      mapSizePercent: climate.metadata.mapSizePercent,
      latitudeRangePercent: climate.metadata.latitudeRangePercent,
      longitudeRangePercent: climate.metadata.longitudeRangePercent,
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
      regionCount: politics.metadata.regions,
      stateGovernments: politics.metadata.stateGovernments || {}
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
  const oceanShift = random.range(-0.025, 0.035);
  const landShift = random.range(-0.025, 0.035);
  return {
    background: [0.36, 0.49, 0.64, 1],
    ocean: [round(0.42 + oceanShift, 4), round(0.55 + oceanShift, 4), round(0.7 + oceanShift, 4), 1],
    land: [round(0.58 + landShift, 4), round(0.64 + landShift, 4), round(0.48 + landShift, 4), 1],
    highland: [round(0.72 + landShift, 4), round(0.7 + landShift, 4), round(0.6 + landShift, 4), 1]
  };
}

function normalizeGenerationNamebases(namebases) {
  if (!namebases || typeof namebases !== "object") return null;
  const bases = Array.isArray(namebases.bases)
    ? namebases.bases.map(normalizeGenerationNamebase).filter(Boolean)
    : [];
  const bindings = normalizeGenerationNamebaseBindings(namebases.bindings);
  const hasGlobalBindings = Object.values(bindings.global).some(Boolean);
  const hasCultureBindings = Object.values(bindings.cultures).some(culture => Object.values(culture).some(Boolean));
  if (!bases.length && !hasGlobalBindings && !hasCultureBindings) return null;
  return {
    version: 1,
    bases,
    bindings,
    metadata: {
      bases: bases.length,
      inherited: true,
      inheritedAt: new Date().toISOString()
    }
  };
}

function normalizeGenerationDiagnostics(inputOptions = {}) {
  return inputOptions.riverDepressionMode === "source-like" ? {riverDepressionMode: "source-like"} : {};
}

function normalizeGenerationNamebase(base) {
  const id = String(base?.id || "").trim();
  const source = normalizeGenerationNamebaseSource(base?.source);
  if (!id || !source.length) return null;
  return {
    id,
    sourceId: String(base.sourceId || ""),
    name: String(base.name || id),
    kind: String(base.kind || "generic"),
    category: String(base.category || "用户名称库"),
    note: String(base.note || ""),
    source,
    builtin: false,
    origin: String(base.origin || "继承"),
    importedAt: base.importedAt || "",
    importedFrom: base.importedFrom || ""
  };
}

function normalizeGenerationNamebaseSource(source) {
  const values = Array.isArray(source) ? source : String(source || "").split(/[,，\n\r]+/u);
  const result = [];
  const seen = new Set();
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function normalizeGenerationNamebaseBindings(bindings) {
  const source = bindings && typeof bindings === "object" ? bindings : {};
  const global = source.global && typeof source.global === "object" ? source.global : {};
  const cultures = source.cultures && typeof source.cultures === "object" ? source.cultures : {};
  const normalizedCultures = {};
  for (const [cultureId, cultureBindings] of Object.entries(cultures)) {
    if (!cultureBindings || typeof cultureBindings !== "object") continue;
    normalizedCultures[String(cultureId)] = {
      stateRoot: String(cultureBindings.stateRoot || "").trim(),
      place: String(cultureBindings.place || "").trim(),
      hydro: String(cultureBindings.hydro || "").trim()
    };
  }
  return {
    global: {
      stateRoot: String(global.stateRoot || "").trim(),
      place: String(global.place || "").trim(),
      hydro: String(global.hydro || "").trim()
    },
    cultures: normalizedCultures
  };
}

function createGenerationNamebaseMetadata(namebases) {
  const global = namebases.bindings?.global || {};
  return {
    bases: namebases.bases.length,
    inherited: Boolean(namebases.metadata?.inherited),
    globalBindings: {
      stateRoot: global.stateRoot || "",
      place: global.place || "",
      hydro: global.hydro || ""
    }
  };
}

function namebaseContextLog(namebases) {
  const metadata = createGenerationNamebaseMetadata(namebases);
  const bindings = Object.entries(metadata.globalBindings)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
  return `bases=${metadata.bases}${bindings ? `, ${bindings}` : ""}`;
}

function round(value, digits) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
