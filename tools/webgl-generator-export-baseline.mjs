#!/usr/bin/env node
import {createReadStream, existsSync, mkdirSync, statSync, writeFileSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appDir = join(rootDir, "app", "webgl-generator");
const defaultSourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const args = parseArgs(process.argv.slice(2));
const template = String(args.template || "mediterranean");
const cells = Number(args.cells || 100000);
const seed = String(args.seed || `audit-${template}-${cells}`);
const graphWidth = Number(args.width || 1440);
const graphHeight = Number(args.height || 960);
const host = args.host || "127.0.0.1";
const port = Number(args.port || 5411);
const timeoutMs = Number(args.timeout || 120000);
const browserChannel = args["browser-channel"] || args.channel || null;
const includeScreenshot = args.screenshot === true || args.screenshot === "true";
const viewport = parseViewport(args.viewport || "1440x960");
const caseName = sanitizeFileName(args.name || `${template}-${cells}-${seed}`);
const outDir = resolve(args.outDir || args["out-dir"] || join(rootDir, "docs", "generated", "source-baselines", caseName));

if (!existsSync(appDir)) fail(`App directory does not exist: ${appDir}`);
mkdirSync(outDir, {recursive: true});

const map = generatePlaceholderMap({
  seed,
  heightmapTemplate: template,
  cellsTarget: cells,
  graphWidth,
  graphHeight,
  randomSeed: false
});
const summary = createCandidateSummary(map, {appDir});
const summaryPath = join(outDir, "candidate-summary.json");
writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
writeFileSync(join(outDir, "candidate-validation.md"), renderValidationMarkdown(summary), "utf8");
console.log(`Wrote candidate baseline summary to ${summaryPath}`);

if (includeScreenshot) {
  const screenshotPath = join(outDir, "candidate-map.png");
  await captureScreenshot({screenshotPath});
  console.log(`Wrote candidate baseline screenshot to ${screenshotPath}`);
}

function createCandidateSummary(candidateMap, {appDir}) {
  const {grid, pack, features, rivers, climate, society, politics, settlements, markers, heightmap, metadata, options} = candidateMap;
  const packFeatures = pack.features || features.features || [];
  const zoneList = getCandidateZones(candidateMap, pack);
  const routeSummary = describeCandidateRoutes(settlements.routes || [], grid, features);
  const validation = validateCandidateGraph({grid, pack, features, routes: settlements.routes || [], cities: settlements.cities || [], routeSummary});
  const missingRequiredPackFields = [
    ["pack.cells.p", pack.cells.p],
    ["pack.cells.c", pack.cells.c],
    ["pack.cells.v", pack.cells.v],
    ["pack.cells.b", pack.cells.b],
    ["pack.cells.i", pack.cells.i],
    ["pack.cells.area", pack.cells.area],
    ["pack.cells.t", pack.cells.t],
    ["pack.cells.haven", pack.cells.haven],
    ["pack.cells.harbor", pack.cells.harbor],
    ["pack.cells.fl", pack.cells.fl],
    ["pack.cells.r", pack.cells.r],
    ["pack.cells.conf", pack.cells.conf],
    ["pack.cells.s", pack.cells.s],
    ["pack.goods", pack.goods],
    ["pack.markets", pack.markets],
    ["pack.deals", pack.deals],
    ["pack.cells.good", pack.cells.good],
    ["pack.cells.market", pack.cells.market]
  ]
    .filter(([, value]) => value === undefined)
    .map(([field]) => field);

  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      source: "webgl-generator candidate baseline",
      seed: metadata.seed,
      template: heightmap.template,
      templateName: heightmap.name,
      cellsTarget: metadata.cellsTarget,
      graphWidth: metadata.graphWidth,
      graphHeight: metadata.graphHeight,
      appDir,
      generatorStage: metadata.generatorStage,
      generatedOptions: {
        statesNumber: Number(options.statesNumber),
        provincesRatio: Number(options.provincesRatio),
        religionsNumber: Number(options.religionsNumber),
        culturesNumber: Number(options.culturesNumber),
        culturesSet: options.culturesSet,
        culturesSetMax: Number(options.culturesSetMax),
        sizeVariety: Number(options.sizeVariety),
        growthRate: Number(options.growthRate),
        temperatureEquator: Number(options.temperatureEquator),
        temperatureNorthPole: Number(options.temperatureNorthPole),
        temperatureSouthPole: Number(options.temperatureSouthPole),
        precipitation: Number(options.precipitation)
      }
    },
    trace: [
      "normalizeOptions",
      "createHeightmap",
      "buildGrid + applyHeightmap",
      "extractFeatures",
      "buildClimate",
      "buildPack",
      "buildRivers",
      "defineBiomesAndPopulation",
      "buildSociety.cultures",
      "buildPolitics",
      "buildSettlements",
      "buildEconomy",
      "finalizeSocietyReligions",
      "buildMarkers",
      "buildZones"
    ],
    template: {
      id: heightmap.template,
      name: heightmap.name,
      stepCount: heightmap.steps.length,
      steps: heightmap.steps.map(step => ({
        tool: step[0],
        count: step[1],
        height: step[2],
        rangeX: step[3],
        rangeY: step[4],
        raw: step.join(" ")
      })),
      blobPower: blobPowerForCells(metadata.cellsTarget),
      linePower: linePowerForCells(metadata.cellsTarget)
    },
    mapCoordinates: candidateMap.mapCoordinates || climate.mapCoordinates || null,
    grid: {
      cells: grid.points.length,
      vertices: grid.vertices.p.length,
      spacing: grid.metadata.spacing ?? round(Math.sqrt((options.graphWidth * options.graphHeight) / options.cellsTarget)),
      cellsDesired: options.cellsTarget,
      cellsX: grid.metadata.columns,
      cellsY: grid.metadata.rows,
      boundaryPoints: grid.boundary?.length || grid.metadata.boundaryPoints || 0,
      avgDegree: round(avgDegree(grid.cells.c)),
      maxDegree: maxDegree(grid.cells.c),
      borderCells: grid.metadata.borderCells ?? countBorderCells(grid.metadata),
      height: describeNumbers(grid.cells.h),
      landCells: countByPredicate(grid.cells.h, height => height >= 20),
      waterCells: countByPredicate(grid.cells.h, height => height < 20),
      landRatio: round(countByPredicate(grid.cells.h, height => height >= 20) / grid.points.length),
      tDistribution: countValues(grid.cells.t || []),
      featureCount: packFeatures.length,
      featureTypes: countByKey(features.features, feature => normalizeFeatureType(feature.type)),
      temperature: describeNumbers(grid.cells.temp || []),
      precipitation: describeNumbers(grid.cells.prec || [])
    },
    pack: {
      cells: pack.cells.g.length,
      vertices: pack.vertices.p.length,
      packGridRatio: round(pack.cells.g.length / grid.points.length),
      avgDegree: round(avgDegree(pack.cells.c || [])),
      maxDegree: maxDegree(pack.cells.c || []),
      borderCells: countByPredicate(pack.cells.b || [], value => Boolean(value)),
      area: describeNumbers(pack.cells.area || []),
      tDistribution: countValues(pack.cells.t || []),
      featureCount: packFeatures.length,
      havenCells: countDefinedPositive(pack.cells.haven || []),
      harborDistribution: countValues(pack.cells.harbor || []),
      packGridRefsInvalid: countInvalidRefs(pack.cells.g, grid.points.length),
      mapping: pack.metadata.mapping,
      missingRequiredPackFields
    },
    features: describeCandidateFeatures(packFeatures),
    rivers: {
      count: rivers.rivers.length,
      cellsWithRiver: countByPredicate(pack.cells.r || [], value => value > 0),
      flux: describeNumbers(pack.cells.fl || []),
      confluences: countByPredicate(pack.cells.conf || [], value => value > 0),
      mouths: countByPredicate(rivers.rivers, river => Number.isInteger(river.mouth)),
      width: describeNumbers([]),
      discharge: describeNumbers(rivers.rivers.map(river => river.flux || 0)),
      riverLoopCount: countRiverLoops(rivers.rivers)
    },
    biomes: {
      distribution: countValues(pack.cells.biome || grid.cells.biome || [])
    },
    population: {
      positiveSuitabilityCells: countByPredicate(pack.cells.s || [], value => value > 0),
      positivePopulationCells: countByPredicate(pack.cells.pop || [], value => value > 0),
      suitability: describeNumbers(pack.cells.s || []),
      population: describeNumbers(pack.cells.pop || [])
    },
    society: {
      cultures: countByPredicate(society.cultures || [], culture => culture?.i && !culture.removed),
      culturedPackCells: countByPredicate(pack.cells.culture || [], value => value > 0),
      culturedGridCells: countByPredicate(grid.cells.culture || [], value => value > 0),
      settlementEligiblePackCells: countSettlementEligiblePackCells(pack.cells),
      burgs: settlements.cities.length,
      capitals: countByPredicate(settlements.cities, city => city.capital),
      ports: countByPredicate(settlements.cities, city => city.port),
      states: politics.metadata?.states ?? politics.states.filter(state => state?.i || state?.id >= 0).length,
      religions: society.metadata?.religions ?? countByPredicate(society.religions, religion => religion?.i && !religion.removed),
      provinces: politics.metadata?.provinces ?? politics.provinces.filter(province => province?.i || province?.id >= 0).length,
      markers: markers.markers.length,
      zones: zoneList.length,
      regiments: countStateRegiments(politics.states)
    },
    lateStages: describeCandidateLateStages({grid, pack, society, politics, settlements, markers, zones: zoneList}),
    routes: routeSummary,
    economy: describeCandidateEconomy(pack),
    validation,
    candidateNotes: {
      packStatus: pack.metadata.mapping,
      missingRequiredPackFields,
      unsupportedSourceStages: [
        "Burgs.specify source names and emblems",
        "States.defineStateForms",
      ]
    }
  };
}

function describeCandidateEconomy(pack) {
  const goods = (pack.goods || []).filter(Boolean);
  const markets = (pack.markets || []).filter(Boolean);
  const deals = (pack.deals || []).filter(Boolean);
  const cells = pack.cells || {};
  const burgs = (pack.burgs || []).filter(item => item?.i && !item.removed);
  const states = (pack.states || []).filter(item => item?.i && !item.removed);
  const goodIds = new Set(goods.map(good => good.i).filter(Number.isInteger));
  const marketIds = new Set(markets.map(market => market.i).filter(Number.isInteger));
  const marketGoods = markets.flatMap(market => Object.values(market.goods || {}));
  const productionRecords = burgs.flatMap(burg => (burg.production || []).map(record => ({record, burg})));
  const dealTaxByState = collectDealTaxesByState({deals, markets, pack});
  const pollTaxExpectedByState = collectPollTaxExpectedByState(states);
  const treasuryMismatches = states.map(state => {
    const expected = (dealTaxByState[state.i] || 0) + (pollTaxExpectedByState[state.i] || 0);
    return Math.abs(Number(state.treasury || 0) - expected);
  });
  const assignedCells = countByPredicate(cells.market || [], market => market > 0);

  return {
    goods: {
      total: goods.length,
      raw: countByPredicate(goods, good => Boolean(good.distribution) && !good.recipes?.length),
      manufactured: countByPredicate(goods, good => !good.distribution && Boolean(good.recipes?.length)),
      hybrid: countByPredicate(goods, good => Boolean(good.distribution) && Boolean(good.recipes?.length)),
      visible: countByPredicate(goods, good => Boolean(good.visible)),
      withBiomeOutput: countByPredicate(goods, good => Boolean(good.biomeOutput && Object.keys(good.biomeOutput).length)),
      withDemandCoverage: countByPredicate(goods, good => Boolean(good.demandCoverage && Object.keys(good.demandCoverage).length)),
      resourceCells: countByPredicate(cells.good || [], good => good > 0),
      invalidCellGoodRefs: countInvalidOptionalRefs(cells.good || [], goodIds),
      invalidRecipeGoodRefs: countInvalidRecipeGoodRefs(goods, goodIds)
    },
    markets: {
      total: markets.length,
      cellsAssigned: assignedCells,
      assignedRatio: round(assignedCells / Math.max(1, cells.i?.length || cells.g?.length || 0)),
      burgsWithMarket: countByPredicate(burgs, burg => burg.market > 0),
      plazaBurgs: countByPredicate(burgs, burg => Boolean(burg.plaza) && marketIds.has(burg.market)),
      goodsEntries: marketGoods.length,
      stock: describeNumbers(marketGoods.map(item => item.stock)),
      price: describeNumbers(marketGoods.map(item => item.price)),
      invalidCenterBurgs: countByPredicate(markets, market => !isAliveBurg(pack, market.centerBurgId)),
      invalidCellMarketRefs: countInvalidOptionalRefs(cells.market || [], marketIds),
      invalidBurgMarketRefs: countByPredicate(burgs, burg => burg.market > 0 && !marketIds.has(burg.market))
    },
    production: {
      burgsWithProduction: countByPredicate(burgs, burg => Array.isArray(burg.production) && burg.production.length > 0),
      localRecords: countByPredicate(productionRecords, item => isLocalProductionRecord(item.record)),
      mfgRecords: countByPredicate(productionRecords, item => isMfgProductionRecord(item.record)),
      dealRecords: countByPredicate(productionRecords, item => isDealProductionRecord(item.record)),
      burgsWithProduct: countByPredicate(burgs, burg => Number.isFinite(Number(burg.product))),
      product: describeNumbers(burgs.map(burg => burg.product)),
      burgTreasury: describeNumbers(burgs.map(burg => burg.treasury)),
      invalidProductionGoodRefs: countInvalidProductionGoodRefs(productionRecords, goodIds),
      invalidProductionDealRefs: countByPredicate(
        productionRecords,
        item => isDealProductionRecord(item.record) && !isValidDealId(item.record.dealId, deals)
      )
    },
    deals: {
      total: deals.length,
      marketToBurg: countByPredicate(deals, deal => deal.sellerType === "market" && deal.buyerType === "burg"),
      burgToMarket: countByPredicate(deals, deal => deal.sellerType === "burg" && deal.buyerType === "market"),
      marketToMarket: countByPredicate(deals, deal => deal.sellerType === "market" && deal.buyerType === "market"),
      tradedGoods: new Set(deals.map(deal => deal.good).filter(good => goodIds.has(good))).size,
      units: round(deals.reduce((sum, deal) => sum + Number(deal.units || 0), 0)),
      value: round(deals.reduce((sum, deal) => sum + Number(deal.units || 0) * Number(deal.price || 0), 0)),
      taxTotal: round(deals.reduce((sum, deal) => sum + Number(deal.tax || 0), 0)),
      taxedDeals: countByPredicate(deals, deal => Number(deal.tax || 0) > 0),
      invalidPartyRefs: countInvalidDealPartyRefs(deals, markets, pack),
      invalidGoodRefs: countInvalidRequiredRefs(deals.map(deal => deal.good), goodIds),
      invalidDealIndexes: countInvalidDealIndexes(deals),
      invalidAmounts: countByPredicate(deals, deal => !isValidDealAmount(deal))
    },
    taxes: {
      statesWithRates: countByPredicate(states, state => Number.isFinite(Number(state.salesTax)) && Number.isFinite(Number(state.pollTax))),
      statesWithTreasury: countByPredicate(states, state => Number.isFinite(Number(state.treasury))),
      salesTax: describeNumbers(states.map(state => state.salesTax)),
      pollTax: describeNumbers(states.map(state => state.pollTax)),
      stateTreasury: describeNumbers(states.map(state => state.treasury)),
      treasuryTotal: round(states.reduce((sum, state) => sum + Number(state.treasury || 0), 0)),
      dealTaxTotal: round(deals.reduce((sum, deal) => sum + Number(deal.tax || 0), 0)),
      pollTaxExpected: round(states.reduce((sum, state) => sum + (pollTaxExpectedByState[state.i] || 0), 0)),
      treasuryMismatchCount: treasuryMismatches.filter(value => value > 0.05).length,
      treasuryMismatchMax: round(Math.max(0, ...treasuryMismatches))
    }
  };
}

function countInvalidOptionalRefs(values = [], validIds) {
  let invalid = 0;
  for (const value of values || []) {
    if (value === undefined || value === null || value === 0) continue;
    if (!Number.isInteger(value) || !validIds.has(value)) invalid++;
  }
  return invalid;
}

function countInvalidRequiredRefs(values = [], validIds) {
  let invalid = 0;
  for (const value of values || []) {
    if (!Number.isInteger(value) || !validIds.has(value)) invalid++;
  }
  return invalid;
}

function countInvalidRecipeGoodRefs(goods, goodIds) {
  let invalid = 0;
  for (const good of goods) {
    for (const recipe of good.recipes || []) {
      for (const key of Object.keys(recipe || {})) {
        const goodId = Number(key);
        if (!Number.isInteger(goodId) || !goodIds.has(goodId)) invalid++;
      }
    }
  }
  return invalid;
}

function isLocalProductionRecord(record) {
  return record && "goodId" in record && "units" in record && !("recipe" in record) && !("dealId" in record);
}

function isMfgProductionRecord(record) {
  return record && "goodId" in record && "recipe" in record;
}

function isDealProductionRecord(record) {
  return record && "dealId" in record;
}

function countInvalidProductionGoodRefs(records, goodIds) {
  let invalid = 0;
  for (const {record} of records) {
    if ((isLocalProductionRecord(record) || isMfgProductionRecord(record)) && !goodIds.has(record.goodId)) invalid++;
    if (!isMfgProductionRecord(record)) continue;
    for (const entry of record.recipe || []) if (!goodIds.has(entry.goodId)) invalid++;
  }
  return invalid;
}

function isValidDealId(dealId, deals) {
  return Number.isInteger(dealId) && dealId >= 0 && dealId < deals.length && deals[dealId]?.i === dealId;
}

function countInvalidDealPartyRefs(deals, markets, pack) {
  const marketIds = new Set(markets.map(market => market.i).filter(Number.isInteger));
  let invalid = 0;
  for (const deal of deals) {
    if (!isValidDealParty(deal.sellerType, deal.seller, marketIds, pack)) invalid++;
    if (!isValidDealParty(deal.buyerType, deal.buyer, marketIds, pack)) invalid++;
  }
  return invalid;
}

function isValidDealParty(type, id, marketIds, pack) {
  if (type === "market") return marketIds.has(id);
  if (type === "burg") return isAliveBurg(pack, id);
  return false;
}

function isAliveBurg(pack, id) {
  const burg = pack.burgs?.[id];
  return Boolean(burg?.i && !burg.removed);
}

function isValidDealAmount(deal) {
  return Number.isFinite(Number(deal.units)) && Number(deal.units) >= 0 && Number(deal.price) >= 0 && Number(deal.tax) >= 0;
}

function countInvalidDealIndexes(deals) {
  let invalid = 0;
  for (let index = 0; index < deals.length; index++) if (deals[index]?.i !== index) invalid++;
  return invalid;
}

function collectDealTaxesByState({deals, markets, pack}) {
  const taxes = {};
  const marketsById = Object.fromEntries(markets.map(market => [market.i, market]));
  for (const deal of deals) {
    const tax = Number(deal.tax || 0);
    if (!tax) continue;
    const stateId =
      deal.sellerType === "burg"
        ? pack.burgs?.[deal.seller]?.state
        : pack.burgs?.[marketsById[deal.seller]?.centerBurgId]?.state;
    if (!Number.isInteger(stateId) || stateId <= 0) continue;
    taxes[stateId] = round((taxes[stateId] || 0) + tax);
  }
  return taxes;
}

function collectPollTaxExpectedByState(states) {
  const taxes = {};
  for (const state of states) {
    taxes[state.i] = round(Number(state.pollTax || 0) * (Number(state.rural || 0) + Number(state.urban || 0)));
  }
  return taxes;
}

function countSettlementEligiblePackCells(cells = {}) {
  let count = 0;
  for (const cell of cells.i || []) {
    if ((cells.s?.[cell] || 0) > 0 && (cells.culture?.[cell] || 0) > 0) count++;
  }
  return count;
}

function describeCandidateLateStages({grid, pack, society, politics, settlements, markers, zones}) {
  const states = politics.states || [];
  const provinces = politics.provinces || [];
  const cultures = society.cultures || [];
  const religions = society.religions || [];
  const cities = settlements.cities || [];
  const markerList = markers.markers || [];
  const zoneList = zones || [];
  const stateRegiments = states.flatMap(state =>
    (Array.isArray(state?.military) ? state.military : []).map(regiment => ({...regiment, state: state.i ?? state.id}))
  );

  return {
    names: {
      mapName: "",
      burgNames: countByPredicate(cities, item => Boolean(item.name)),
      burgCoas: countByPredicate(cities, item => Boolean(item.coa)),
      burgGroups: countByKey(cities, item => item.group || item.type || "none"),
      stateNames: countByPredicate(states, item => Boolean(item?.name) && (item.i || item.id >= 0)),
      stateFullNames: countByPredicate(states, item => Boolean(item?.fullName)),
      stateFormNames: countByPredicate(states, item => Boolean(item?.formName)),
      stateForms: countByKey(states, item => item?.formName || "none"),
      stateTypes: countByKey(states, item => item?.type || "none"),
      cultureTypes: countByKey(cultures, item => item?.type || "none"),
      cultureNameStyles: countByKey(cultures, item => item?.nameStyle || "default"),
      oldPoliticalFormHits: countOldPoliticalFormHits(states),
      cultureLinkedStateNames: countCultureLinkedStateNames(states, cultures),
      stateNameSamples: states.filter(item => item?.i && !item.removed).slice(0, 12).map(item => ({
        i: item.i,
        name: item.name || "",
        fullName: item.fullName || "",
        formName: item.formName || "",
        type: item.type || "",
        culture: item.culture || 0
      })),
      stateCoas: countByPredicate(states, item => Boolean(item?.coa)),
      provinceNames: countByPredicate(provinces, item => Boolean(item?.name) && (item.i || item.id >= 0)),
      riverNames: countByPredicate(pack.rivers || [], item => Boolean(item?.name)),
      riverTypes: countByKey(pack.rivers || [], item => item.type || "none"),
      lakeNames: countByPredicate(pack.features || [], item => item?.type === "lake" && Boolean(item.name)),
      lakeGroups: countByKey((pack.features || []).filter(item => item?.type === "lake"), item => item.group || "none")
    },
    military: {
      statesWithMilitary: countByPredicate(states, state => Array.isArray(state?.military) && state.military.length > 0),
      regiments: stateRegiments.length,
      troops: round(stateRegiments.reduce((sum, regiment) => sum + Number(regiment.t ?? regiment.a ?? 0), 0)),
      navalRegiments: countByPredicate(stateRegiments, regiment => regiment.n),
      types: countByKey(stateRegiments, regiment => regiment.type || "unknown"),
      units: sumRegimentUnits(stateRegiments),
      states: describeMilitaryStates(states, stateRegiments),
      invalidCells: countInvalidRefs(
        stateRegiments.map(regiment => regiment.cell).filter(Number.isInteger),
        pack.cells.g.length
      )
    },
    markers: {
      total: markerList.length,
      types: countByKey(markerList, marker => marker.type || "unknown"),
      withIcon: countByPredicate(markerList, marker => Boolean(marker.icon)),
      pinned: countByPredicate(markerList, marker => Boolean(marker.pinned)),
      locked: countByPredicate(markerList, marker => Boolean(marker.lock)),
      invalidCells: countInvalidRefs(
        markerList.map(marker => marker.cell).filter(Number.isInteger),
        grid.points.length
      )
    },
    zones: {
      total: zoneList.length,
      types: countByKey(zoneList, zone => zone.type || "unknown"),
      cells: describeNumbers(zoneList.map(zone => zone.cells?.length || 0)),
      hidden: countByPredicate(zoneList, zone => Boolean(zone.hidden)),
      invalidCells: countInvalidZoneCells(zoneList, pack.cells.g.length)
    },
    statistics: {
      burgsWithPopulation: countByPredicate(cities, item => Number.isFinite(item.population)),
      burgsWithType: countByPredicate(cities, item => Boolean(item.type)),
      statesWithArea: countByPredicate(states, item => Number.isFinite(item?.area)),
      statesWithRural: countByPredicate(states, item => Number.isFinite(item?.rural)),
      statesWithUrban: countByPredicate(states, item => Number.isFinite(item?.urban)),
      statesWithNeighbors: countByPredicate(states, item => Array.isArray(item?.neighbors)),
      provincesWithPole: countByPredicate(provinces, item => Array.isArray(item?.pole)),
      culturesWithArea: countByPredicate(cultures, item => Number.isFinite(item?.area)),
      religionsWithArea: countByPredicate(religions, item => Number.isFinite(item?.area))
    }
  };
}

function countOldPoliticalFormHits(states = []) {
  const oldForm = /公国|侯国|自由邦|共和国|帝国|联邦|邦联/u;
  return countByPredicate(states, state => oldForm.test(`${state?.name || ""}${state?.formName || ""}${state?.fullName || ""}`));
}

function countCultureLinkedStateNames(states = [], cultures = []) {
  const roots = new Map(cultures.filter(culture => culture?.i && !culture.removed).map(culture => [culture.i, cleanCultureRoot(culture)]));
  return countByPredicate(states, state => {
    if (!state?.i || state.removed) return false;
    const root = roots.get(state.culture);
    return Boolean(root && String(state.name || "").includes(root));
  });
}

function cleanCultureRoot(culture) {
  return String(culture?.root || culture?.name || "").replace(/文化$/u, "");
}

function describeMilitaryStates(states = [], regiments = []) {
  return states
    .filter(state => state?.i && !state.removed)
    .map(state => {
      const stateRegiments = regiments.filter(regiment => Number(regiment.state) === Number(state.i));
      return {
        i: state.i,
        name: state.name || "",
        type: state.type || state.form || "unknown",
        burgs: Number(state.burgs || 0),
        rural: round(Number(state.rural || 0)),
        urban: round(Number(state.urban || 0)),
        area: round(Number(state.area || 0)),
        regiments: stateRegiments.length,
        navalRegiments: countByPredicate(stateRegiments, regiment => regiment.n),
        troops: round(stateRegiments.reduce((sum, regiment) => sum + Number(regiment.t ?? regiment.a ?? 0), 0)),
        units: sumRegimentUnits(stateRegiments),
        diagnostics: state.militaryDiagnostics || null
      };
    });
}

function sumRegimentUnits(regiments = []) {
  return regiments.flatMap(regiment => Object.entries(regiment.u || {})).reduce((counts, [unit, value]) => {
    counts[unit] = round((counts[unit] || 0) + Number(value || 0));
    return counts;
  }, {});
}

function getCandidateZones(candidateMap, pack) {
  if (Array.isArray(candidateMap.zones?.zones)) return candidateMap.zones.zones;
  if (Array.isArray(candidateMap.zones)) return candidateMap.zones;
  if (Array.isArray(pack.zones)) return pack.zones;
  return [];
}

function countInvalidZoneCells(zones = [], limit) {
  return zones.reduce((sum, zone) => sum + countInvalidRefs(zone.cells || [], limit), 0);
}

function countStateRegiments(states = []) {
  return states.reduce((sum, state) => sum + (Array.isArray(state?.military) ? state.military.length : 0), 0);
}

async function captureScreenshot({screenshotPath}) {
  const playwright = await loadPlaywright(defaultSourceDir);
  const server = await startStaticServer({host, port, publicDir: appDir});
  let browser = null;
  try {
    const baseUrl = `http://${host}:${port}`;
    browser = await launchBrowser(playwright, {headless: !args.headful, browserChannel});
    const page = await browser.newPage({viewport});
    page.setDefaultTimeout(timeoutMs);
    await page.goto(baseUrl, {waitUntil: "domcontentloaded", timeout: timeoutMs});
    await page.waitForFunction(() => window.__webglGeneratorApp?.map, null, {timeout: timeoutMs});
    await page.evaluate(
      options => {
        document.getElementById("auto-random-seed").checked = false;
        document.getElementById("seed-input").value = options.seed;
        document.getElementById("cells-input").value = String(options.cells);
        document.getElementById("width-input").value = String(options.graphWidth);
        document.getElementById("height-input").value = String(options.graphHeight);
        document.getElementById("heightmap-template").value = options.template;
        document.getElementById("generate-map").click();
      },
      {seed, cells, graphWidth, graphHeight, template}
    );
    await page.waitForFunction(
      expected =>
        window.__webglGeneratorApp?.map?.metadata?.seed === expected.seed &&
        window.__webglGeneratorApp?.map?.metadata?.cellsTarget === expected.cells &&
        window.__webglGeneratorApp?.map?.metadata?.checksum,
      {seed, cells},
      {timeout: timeoutMs}
    );
    await page.waitForFunction(() => window.__webglGeneratorApp?.renderer?.getStats?.().draw?.glError === 0, null, {timeout: timeoutMs});
    await page.screenshot({path: screenshotPath, fullPage: false});
  } finally {
    if (browser) await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 5000))]);
    await new Promise(resolve => server.close(resolve));
  }
}

async function startStaticServer({host, port, publicDir}) {
  const server = createServer((request, response) => {
    const url = new URL(request.url || "/", `http://${host}:${port}`);
    const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const target = resolve(publicDir, `.${normalize(pathname)}`);

    if (!target.startsWith(publicDir)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    if (!existsSync(target) || !statSync(target).isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {"content-type": getContentType(target)});
    createReadStream(target).pipe(response);
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, host, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  return server;
}

async function loadPlaywright(sourceDir) {
  try {
    const require = createRequire(import.meta.url);
    return require("playwright");
  } catch {
    const requireFromSource = createRequire(join(sourceDir, "package.json"));
    return requireFromSource("playwright");
  }
}

async function launchBrowser(playwright, {headless, browserChannel}) {
  const options = {headless};
  if (browserChannel) options.channel = browserChannel;
  try {
    return await playwright.chromium.launch(options);
  } catch (error) {
    if (browserChannel) throw error;
    for (const channel of ["chrome", "msedge"]) {
      try {
        return await playwright.chromium.launch({headless, channel});
      } catch {
        // 继续尝试下一个系统浏览器 channel。
      }
    }
    throw error;
  }
}

function describeCandidateRoutes(routes, grid, features) {
  const groups = {
    roads: routes.filter(route => route.type === "road").length,
    trails: routes.filter(route => route.type === "trail").length,
    searoutes: routes.filter(route => route.type === "searoute").length
  };
  let landRouteWaterCells = 0;
  let seaRouteLandCells = 0;

  for (const route of routes) {
    const routeCells = route.cells || [];
    if (route.type === "searoute") {
      seaRouteLandCells += routeCells.slice(1, -1).filter(cell => isLand(features, grid, cell)).length;
    } else {
      landRouteWaterCells += routeCells.filter(cell => !isLand(features, grid, cell)).length;
    }
  }

  return {
    total: routes.length,
    groups,
    roads: groups.roads,
    trails: groups.trails,
    searoutes: groups.searoutes,
    landRouteWaterCells,
    seaRouteLandCells
  };
}

function validateCandidateGraph({grid, pack, features, routes, cities, routeSummary}) {
  const landRouteWaterCells = routeSummary.landRouteWaterCells;
  const seaRouteLandCells = routeSummary.seaRouteLandCells;
  const cityWaterCells = cities.filter(city => !isLand(features, grid, city.cell)).length;
  return {
    gridCellIndexCountOk: grid.cells.v.length === grid.points.length,
    gridNeighborInvalidRefs: countNeighborInvalidRefs(grid.cells.c, grid.points.length),
    gridVertexInvalidRefs: countNestedInvalidRefs(grid.cells.v, grid.vertices.p.length),
    packCellIndexCountOk: pack.cells.i?.length === pack.cells.g.length,
    packGridRefsInvalid: countInvalidRefs(pack.cells.g, grid.points.length),
    packNeighborInvalidRefs: countNeighborInvalidRefs(pack.cells.c || [], pack.cells.g.length),
    packVertexInvalidRefs: countNestedInvalidRefs(pack.cells.v || [], pack.vertices.p.length),
    havenInvalidCount: pack.cells.haven ? countInvalidHavens(pack.cells) : null,
    harborMismatchCount: pack.cells.harbor ? countHarborMismatches(pack.cells) : null,
    routeLinkAsymmetry: null,
    landRouteWaterCells,
    seaRouteLandCells,
    packHasVoronoi: Boolean(pack.cells.c && pack.cells.v && pack.cells.area),
    packMappingOneToOne: pack.metadata.mapping === "one-grid-cell-to-one-pack-cell",
    routesHaveSeaRoutes: routes.some(route => route.type === "searoute"),
    routeCellRefsInvalid: routes.reduce((sum, route) => sum + countInvalidRefs(route.cells || [], grid.points.length), 0),
    burgCellsInvalid: countInvalidRefs(
      routes.flatMap(route => [route.from, route.to]).filter(value => value !== undefined),
      Number.POSITIVE_INFINITY
    ),
    landRouteWaterCellsOk: landRouteWaterCells === 0,
    seaRouteLandCellsOk: seaRouteLandCells <= 1,
    allCitiesOnLand: cityWaterCells === 0,
    cityWaterCells
  };

  function countInvalidHavens(cells) {
    let invalid = 0;
    for (let index = 0; index < cells.g.length; index++) {
      if (cells.h[index] < 20 || cells.t?.[index] !== 1) continue;
      const haven = cells.haven?.[index];
      if (!Number.isInteger(haven) || haven < 0 || haven >= cells.g.length || cells.h[haven] >= 20) invalid++;
    }
    return invalid;
  }

  function countHarborMismatches(cells) {
    let mismatch = 0;
    for (let index = 0; index < cells.g.length; index++) {
      const expected = (cells.c?.[index] || []).filter(cell => cells.h[cell] < 20).length;
      const actual = cells.harbor?.[index] || 0;
      if (cells.h[index] >= 20 && cells.t?.[index] === 1 && actual !== expected) mismatch++;
    }
    return mismatch;
  }

  function isLandAtCell(cell) {
    return isLand(features, grid, cell);
  }
}

function describeCandidateFeatures(featureList) {
  const alive = featureList.filter(Boolean);
  return {
    total: alive.length,
    land: alive.filter(feature => normalizeFeatureType(feature.type) === "island").length,
    water: alive.filter(feature => normalizeFeatureType(feature.type) !== "island").length,
    types: countByKey(alive, feature => normalizeFeatureType(feature.type)),
    groups: countByKey(alive, feature => feature.group || "none"),
    lakes: alive.filter(feature => feature.type === "lake").length,
    oceans: alive.filter(feature => feature.type === "ocean").length,
    lakeFields: {
      withHeight: alive.filter(feature => feature.type === "lake" && Number.isFinite(feature.height)).length,
      withShoreline: alive.filter(feature => feature.type === "lake" && feature.shoreline?.length).length,
      withFlux: alive.filter(feature => feature.type === "lake" && Number.isFinite(feature.flux)).length,
      withOutlet: alive.filter(feature => feature.type === "lake" && feature.outlet).length,
      closed: alive.filter(feature => feature.type === "lake" && feature.closed).length
    },
    diagnostics: describeFeatureDiagnostics(alive)
  };
}

function describeFeatureDiagnostics(features = []) {
  const typed = type => features.filter(feature => normalizeFeatureType(feature.type) === type);
  const islands = typed("island");
  const lakes = typed("lake");
  return {
    byType: Object.fromEntries(["island", "lake", "ocean"].map(type => [type, describeFeatureGroup(typed(type))])),
    tinyLand: {
      cellsLt3: islands.filter(feature => Number(feature.cells || 0) < 3).length,
      cellsLt10: islands.filter(feature => Number(feature.cells || 0) < 10).length,
      cellsLt20: islands.filter(feature => Number(feature.cells || 0) < 20).length
    },
    lakes: {
      supplemental: lakes.filter(feature => feature.supplemental).length,
      named: lakes.filter(feature => Boolean(feature.name)).length,
      withOutlet: lakes.filter(feature => Boolean(feature.outlet)).length,
      cellsLt3: lakes.filter(feature => Number(feature.cells || 0) < 3).length,
      cellsLt10: lakes.filter(feature => Number(feature.cells || 0) < 10).length
    },
    details: features.map(describeFeatureDetail)
  };
}

function describeFeatureGroup(features = []) {
  return {
    count: features.length,
    cells: describeNumbers(features.map(feature => feature.cells)),
    area: describeNumbers(features.map(feature => feature.area)),
    groups: countByKey(features, feature => feature.group || "none")
  };
}

function describeFeatureDetail(feature) {
  return {
    i: feature.i ?? feature.id ?? null,
    type: normalizeFeatureType(feature.type),
    group: feature.group || "none",
    cells: Number(feature.cells || 0),
    area: round(Number(feature.area || 0)),
    firstCell: Number.isInteger(feature.firstCell) ? feature.firstCell : null,
    height: Number.isFinite(feature.height) ? round(feature.height) : null,
    outlet: Number.isInteger(feature.outlet) ? feature.outlet : null,
    supplemental: Boolean(feature.supplemental),
    named: Boolean(feature.name)
  };
}

function normalizeFeatureType(type) {
  if (type === "land") return "island";
  return type || "unknown";
}

function isLand(features, grid, cell) {
  const feature = features.features?.[grid.cells.f?.[cell]];
  return Boolean(feature?.land);
}

function avgDegree(neighbors = []) {
  if (!neighbors.length) return 0;
  return neighbors.reduce((sum, item) => sum + (item?.length || 0), 0) / neighbors.length;
}

function maxDegree(neighbors = []) {
  return neighbors.reduce((max, item) => Math.max(max, item?.length || 0), 0);
}

function countBorderCells(metadata) {
  const {columns, rows} = metadata;
  if (!columns || !rows) return 0;
  return columns * 2 + Math.max(0, rows - 2) * 2;
}

function countRiverLoops(rivers = []) {
  return rivers.filter(river => {
    const riverCells = (river.cells || []).filter(cell => cell >= 0);
    return new Set(riverCells).size !== riverCells.length;
  }).length;
}

function countValues(values = []) {
  const counts = {};
  for (const value of values || []) {
    const key = value === undefined || value === null ? "null" : String(value);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function countByKey(items = [], keyFn) {
  const counts = {};
  for (const item of items || []) {
    if (!item) continue;
    const key = keyFn(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function countByPredicate(values = [], predicate) {
  let count = 0;
  for (const value of values || []) if (predicate(value)) count++;
  return count;
}

function countDefinedPositive(values = []) {
  let count = 0;
  for (const value of values || []) if (value !== undefined && value !== null && value > 0) count++;
  return count;
}

function countInvalidRefs(values = [], limit) {
  let count = 0;
  for (const value of values || []) {
    if (!Number.isInteger(value) || value < 0 || value >= limit) count++;
  }
  return count;
}

function countNeighborInvalidRefs(neighbors = [], limit) {
  let invalid = 0;
  for (const list of neighbors || []) invalid += countInvalidRefs(list || [], limit);
  return invalid;
}

function countNestedInvalidRefs(items = [], limit) {
  let invalid = 0;
  for (const list of items || []) invalid += countInvalidRefs(list || [], limit);
  return invalid;
}

function describeNumbers(values = []) {
  const list = Array.from(values || []).filter(value => Number.isFinite(Number(value))).map(Number);
  if (!list.length) return emptyStats();
  list.sort((a, b) => a - b);
  const sum = list.reduce((total, value) => total + value, 0);
  return {
    min: round(list[0]),
    p05: round(quantileSorted(list, 0.05)),
    p25: round(quantileSorted(list, 0.25)),
    p50: round(quantileSorted(list, 0.5)),
    p75: round(quantileSorted(list, 0.75)),
    p90: round(quantileSorted(list, 0.9)),
    p95: round(quantileSorted(list, 0.95)),
    p99: round(quantileSorted(list, 0.99)),
    max: round(list[list.length - 1]),
    mean: round(sum / list.length)
  };
}

function emptyStats() {
  return {min: 0, p05: 0, p25: 0, p50: 0, p75: 0, p90: 0, p95: 0, p99: 0, max: 0, mean: 0};
}

function quantileSorted(list, q) {
  if (list.length === 1) return list[0];
  const pos = (list.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = list[base + 1];
  return next === undefined ? list[base] : list[base] + rest * (next - list[base]);
}

function blobPowerForCells(cells) {
  if (cells >= 90000) return 0.9973;
  if (cells >= 50000) return 0.994;
  if (cells >= 20000) return 0.99;
  if (cells >= 10000) return 0.98;
  if (cells >= 5000) return 0.97;
  return 0.95;
}

function linePowerForCells(cells) {
  if (cells >= 100000) return 0.93;
  if (cells >= 90000) return 0.92;
  if (cells >= 80000) return 0.91;
  if (cells >= 70000) return 0.88;
  if (cells >= 60000) return 0.87;
  if (cells >= 50000) return 0.86;
  if (cells >= 40000) return 0.84;
  if (cells >= 30000) return 0.83;
  if (cells >= 20000) return 0.82;
  if (cells >= 10000) return 0.81;
  if (cells >= 5000) return 0.79;
  return 0.77;
}

function renderValidationMarkdown(summary) {
  const lines = [];
  lines.push("# Candidate baseline 验收记录");
  lines.push("");
  lines.push(`Seed：\`${summary.metadata.seed}\``);
  lines.push(`模板：\`${summary.metadata.template}\``);
  lines.push(`目标 cells：${summary.metadata.cellsTarget}`);
  lines.push("");
  lines.push("## 结构摘要");
  lines.push("");
  lines.push("| 项 | 数值 |");
  lines.push("|---|---:|");
  lines.push(`| grid cells | ${summary.grid.cells} |`);
  lines.push(`| pack cells | ${summary.pack.cells} |`);
  lines.push(`| pack/grid | ${summary.pack.packGridRatio} |`);
  lines.push(`| grid 平均邻接度 | ${summary.grid.avgDegree} |`);
  lines.push(`| pack 平均邻接度 | ${summary.pack.avgDegree} |`);
  lines.push(`| 陆地比例 | ${summary.grid.landRatio} |`);
  lines.push(`| 河流 | ${summary.rivers.count} |`);
  lines.push(`| 城市 | ${summary.society.burgs} |`);
  lines.push(`| 港口 | ${summary.society.ports} |`);
  lines.push(`| 国家 | ${summary.society.states} |`);
  lines.push(`| 路线 | ${summary.routes.total} |`);
  lines.push(`| 货物 | ${summary.economy?.goods?.total ?? 0} |`);
  lines.push(`| 市场 | ${summary.economy?.markets?.total ?? 0} |`);
  lines.push(`| 交易 | ${summary.economy?.deals?.total ?? 0} |`);
  lines.push(`| 国库总额 | ${summary.economy?.taxes?.treasuryTotal ?? 0} |`);
  lines.push("");
  lines.push("## 当前缺口");
  lines.push("");
  if (summary.candidateNotes.missingRequiredPackFields.length) {
    for (const field of summary.candidateNotes.missingRequiredPackFields) lines.push(`- 缺少 \`${field}\``);
  } else {
    lines.push("无。");
  }
  return `${lines.join("\n")}\n`;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=");
    if (inlineValue !== undefined) {
      parsed[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    index++;
  }
  return parsed;
}

function parseViewport(value) {
  const [width, height] = String(value)
    .toLowerCase()
    .split("x")
    .map(Number);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return {width: 1440, height: 960};
  return {width, height};
}

function getContentType(file) {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png"
  };
  return types[extname(file).toLowerCase()] || "application/octet-stream";
}

function sanitizeFileName(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

function round(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
