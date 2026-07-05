#!/usr/bin/env node
import {createRequire} from "node:module";
import {existsSync, mkdirSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {spawn, spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultSourceDir = join(rootDir, "source", "Fantasy-Map-Generator");

const args = parseArgs(process.argv.slice(2));
const sourceDir = resolve(args.source || defaultSourceDir);
const template = String(args.template || "mediterranean");
const cells = Number(args.cells || 100000);
const seed = String(args.seed || `audit-${template}-${cells}`);
const port = Number(args.port || 5301);
const host = args.host || "127.0.0.1";
const timeoutMs = Number(args.timeout || 180000);
const browserChannel = args["browser-channel"] || args.channel || null;
const includeSnapshot = args.snapshot === true || args.snapshot === "true";
const includeScreenshot = args.screenshot === true || args.screenshot === "true";
const caseName = sanitizeFileName(args.name || `${template}-${cells}-${seed}`);
const outDir = resolve(args.outDir || args["out-dir"] || join(rootDir, "docs", "generated", "source-baselines", caseName));
const viewport = parseViewport(args.viewport || "1440x960");

if (!existsSync(sourceDir)) fail(`Source directory does not exist: ${sourceDir}`);
if (!args.url && !existsSync(join(sourceDir, "node_modules"))) {
  fail(`Missing dependencies in ${sourceDir}. Run npm install in the source project first, or pass --url.`);
}

const playwright = await loadPlaywright(sourceDir);
let serverProcess = null;
let browser = null;

try {
  const baseUrl = args.url || `http://${host}:${port}`;
  if (!args.url) {
    serverProcess = startDevServer(sourceDir, host, port);
    await waitForHttp(baseUrl, timeoutMs);
  }

  browser = await launchBrowser(playwright, {headless: !args.headful, browserChannel});
  const page = await browser.newPage({viewport});
  page.setDefaultTimeout(timeoutMs);

  await page.goto(baseUrl, {waitUntil: "domcontentloaded", timeout: timeoutMs});
  await page.waitForFunction(
    () =>
      typeof window.generate === "function" &&
      typeof window.changeCellsDensity === "function" &&
      typeof heightmapTemplates === "object",
    {timeout: timeoutMs}
  );

  const sourceCommit = getGitCommit(sourceDir);
  const baseline = await page.evaluate(
    async options => {
      const trace = [
        "setSeed",
        "applyGraphSize",
        "randomizeOptions",
        "generateGrid 或复用 grid",
        "HeightmapGenerator.generate",
        "pack = {}",
        "Features.markupGrid",
        "addLakesInDeepDepressions",
        "openNearSeaLakes",
        "OceanLayers",
        "defineMapSize",
        "calculateMapCoordinates",
        "calculateTemperatures",
        "generatePrecipitation",
        "reGraph",
        "Features.markupPack",
        "createDefaultRuler",
        "Rivers.generate",
        "Biomes.define",
        "Features.defineGroups",
        "Ice.generate",
        "Goods.generate",
        "rankCells",
        "Cultures.generate",
        "Cultures.expand",
        "Burgs.generate",
        "States.generate",
        "Routes.generate",
        "Religions.generate",
        "Burgs.specify",
        "States.collectStatistics",
        "States.defineStateForms",
        "Provinces.generate",
        "Provinces.getPoles",
        "Rivers.specify",
        "Lakes.defineNames",
        "Markets.generate",
        "Production.produce",
        "States.collectTaxes",
        "Military.generate",
        "Markers.generate",
        "Zones.generate",
        "drawScaleBar",
        "Names.getMapName",
        "showStatistics"
      ];

      configureGeneration(options);
      await window.generate({seed: options.seed});
      await waitForMap(options.timeoutMs);
      await settle();

      const {grid, pack, graphWidth, graphHeight, mapCoordinates} = window;
      const templates = getHeightmapTemplates();
      const gridCells = grid.cells;
      const packCells = pack.cells;
      const templateInfo = templates?.[options.template] || null;
      const templateSteps = parseTemplateSteps(templateInfo?.template || "");
      const routes = pack.routes || [];
      const summary = {
        metadata: {
          generatedAt: new Date().toISOString(),
          source: "Fantasy-Map-Generator runtime baseline",
          seed: window.seed || options.seed,
          template: options.template,
          templateName: templateInfo?.name || options.template,
          cellsTarget: options.cells,
          graphWidth,
          graphHeight,
          sourceCommit: options.sourceCommit,
          sourceDir: options.sourceDir,
          baseUrl: options.baseUrl,
          generatedOptions: {
            statesNumber: Number(statesNumber.value),
            provincesRatio: Number(provincesRatio.value),
            religionsNumber: Number(religionsNumber.value),
            culturesNumber: Number(culturesInput.value),
            culturesSet: culturesSet.value,
            culturesSetMax: Number(culturesSet.selectedOptions[0]?.dataset?.max || 0),
            sizeVariety: Number(sizeVariety.value),
            growthRate: Number(growthRate.value),
            temperatureEquator: Number(window.eval("options.temperatureEquator")),
            temperatureNorthPole: Number(window.eval("options.temperatureNorthPole")),
            temperatureSouthPole: Number(window.eval("options.temperatureSouthPole")),
            precipitation: Number(precInput.value)
          }
        },
        trace,
        template: {
          id: options.template,
          name: templateInfo?.name || options.template,
          stepCount: templateSteps.length,
          steps: templateSteps,
          blobPower: Number(getHeightmapGenerator()?.blobPower || 0),
          linePower: Number(getHeightmapGenerator()?.linePower || 0)
        },
        mapCoordinates: mapCoordinates || null,
        grid: {
          cells: gridCells.i.length,
          vertices: grid.vertices?.p?.length || 0,
          spacing: round(grid.spacing || 0),
          cellsDesired: grid.cellsDesired || options.cells,
          cellsX: grid.cellsX || 0,
          cellsY: grid.cellsY || 0,
          boundaryPoints: grid.boundary?.length || 0,
          avgDegree: round(avgDegree(gridCells.c)),
          maxDegree: maxDegree(gridCells.c),
          borderCells: countTruthy(gridCells.b),
          height: describeNumbers(gridCells.h),
          landCells: countByPredicate(gridCells.h, h => h >= 20),
          waterCells: countByPredicate(gridCells.h, h => h < 20),
          landRatio: round(countByPredicate(gridCells.h, h => h >= 20) / gridCells.i.length),
          tDistribution: countValues(gridCells.t),
          featureCount: Math.max((grid.features || []).filter(Boolean).length, 0),
          featureTypes: countByKey(grid.features || [], feature => feature?.type || "unknown"),
          temperature: describeNumbers(gridCells.temp || []),
          precipitation: describeNumbers(gridCells.prec || [])
        },
        pack: {
          cells: packCells.i.length,
          vertices: pack.vertices?.p?.length || 0,
          packGridRatio: round(packCells.i.length / gridCells.i.length),
          avgDegree: round(avgDegree(packCells.c)),
          maxDegree: maxDegree(packCells.c),
          borderCells: countTruthy(packCells.b),
          area: describeNumbers(packCells.area || []),
          tDistribution: countValues(packCells.t),
          topology: describePackTopology(packCells),
          featureCount: Math.max((pack.features || []).filter(Boolean).length, 0),
          havenCells: countDefinedPositive(packCells.haven),
          harborDistribution: countValues(packCells.harbor),
          packGridRefsInvalid: countInvalidRefs(packCells.g, gridCells.i.length)
        },
        features: describeFeatures(pack.features || []),
        rivers: describeRivers(pack.rivers || [], packCells),
        biomes: {
          distribution: countValues(packCells.biome)
        },
        population: {
          positiveSuitabilityCells: countByPredicate(packCells.s || [], value => value > 0),
          positivePopulationCells: countByPredicate(packCells.pop || [], value => value > 0),
          suitability: describeNumbers(packCells.s || []),
          suitabilitySum: round(sumPositive(packCells.s || [])),
          population: describeNumbers(packCells.pop || []),
          populationSum: round(sumPositive(packCells.pop || [])),
          resourceBonus: describeResourceBonus(pack),
          rankCellsInputs: {
            hasGoodsAtRankTime: Boolean(packCells.good)
          }
        },
        society: {
          cultures: countAlive(pack.cultures),
          culturedPackCells: countByPredicate(packCells.culture || [], value => value > 0),
          culturedGridCells: countByPredicate(gridCells.culture || [], value => value > 0),
          settlementEligiblePackCells: countSettlementEligiblePackCells(packCells),
          burgs: countAlive(pack.burgs),
          capitals: countByPredicate(pack.burgs || [], burg => burg?.i && !burg.removed && burg.capital),
          ports: countByPredicate(pack.burgs || [], burg => burg?.i && !burg.removed && burg.port),
          portDiagnostics: describePortDiagnostics(pack),
          states: countAlive(pack.states),
          religions: countAlive(pack.religions),
          provinces: countAlive(pack.provinces),
          markers: countAlive(pack.markers),
          zones: countAlive(pack.zones),
          regiments: Array.isArray(pack.states)
            ? pack.states.reduce((sum, state) => sum + (Array.isArray(state?.military) ? state.military.length : 0), 0)
            : 0
        },
        lateStages: {
          names: describeNames(pack),
          military: describeMilitary(pack, packCells),
          markers: describeMarkers(pack.markers || [], packCells),
          zones: describeZones(pack.zones || [], packCells),
          statistics: describeStatistics(pack)
        },
        routes: describeRoutes(routes, packCells),
        economy: describeEconomy(pack),
        validation: validateGraph({grid, pack, routes})
      };

      const snapshot = options.includeSnapshot ? buildSnapshot({grid, pack}) : null;
      return {summary, trace, snapshot};

      function configureGeneration(options) {
        setCellCount(options.cells);
        setTemplate(options.template);
        lockOption("points");
        lockOption("template");
      }

      function setCellCount(cells) {
        const densityMap = {
          1000: 1,
          2000: 2,
          5000: 3,
          10000: 4,
          20000: 5,
          30000: 6,
          40000: 7,
          50000: 8,
          60000: 9,
          70000: 10,
          80000: 11,
          90000: 12,
          100000: 13
        };
        const densityValue = densityMap[cells];
        if (!densityValue) throw new Error(`Unsupported cell count: ${cells}`);
        window.changeCellsDensity(densityValue);
      }

      function setTemplate(templateId) {
        const templates = getHeightmapTemplates();
        if (!templates?.[templateId]) throw new Error(`Unsupported heightmap template: ${templateId}`);
        const select = document.getElementById("templateInput");
        const name = templates[templateId].name || templateId;
        if (typeof window.applyOption === "function") window.applyOption(select, templateId, name);
        else {
          if (!Array.from(select.options).some(option => option.value === templateId)) {
            select.options.add(new Option(name, templateId));
          }
          select.value = templateId;
        }
      }

      function getHeightmapTemplates() {
        return typeof heightmapTemplates !== "undefined" ? heightmapTemplates : window.heightmapTemplates;
      }

      function getHeightmapGenerator() {
        return typeof HeightmapGenerator !== "undefined" ? HeightmapGenerator : window.HeightmapGenerator;
      }

      function lockOption(id) {
        if (typeof window.lock === "function") {
          window.lock(id);
          return;
        }
        const el = document.getElementById(`lock_${id}`);
        if (!el) return;
        el.dataset.locked = "1";
        el.className = "icon-lock";
      }

      async function waitForMap(timeoutMs) {
        const startedAt = performance.now();
        while (performance.now() - startedAt < timeoutMs) {
          if (window.grid?.cells?.h?.length && window.pack?.cells?.i?.length && window.pack?.vertices?.p?.length) {
            return;
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw new Error("Timed out waiting for source map generation");
      }

      async function settle(frames = 2) {
        for (let i = 0; i < frames; i++) await new Promise(resolve => requestAnimationFrame(resolve));
      }

      function parseTemplateSteps(templateString) {
        return templateString
          .split("\n")
          .map(line => line.trim())
          .filter(Boolean)
          .map(line => {
            const [tool, count, height, rangeX, rangeY] = line.split(/\s+/);
            return {tool, count, height, rangeX, rangeY, raw: line};
          });
      }

      function avgDegree(neighbors = []) {
        if (!neighbors.length) return 0;
        return neighbors.reduce((sum, item) => sum + (item?.length || 0), 0) / neighbors.length;
      }

      function maxDegree(neighbors = []) {
        return neighbors.reduce((max, item) => Math.max(max, item?.length || 0), 0);
      }

      function countTruthy(values = []) {
        let count = 0;
        for (const value of values) if (value) count++;
        return count;
      }

      function countDefinedPositive(values = []) {
        let count = 0;
        for (const value of values) if (value !== undefined && value !== null && value > 0) count++;
        return count;
      }

      function sumPositive(values = []) {
        let sum = 0;
        for (const value of values || []) if (value > 0) sum += Number(value || 0);
        return sum;
      }

      function average(values = []) {
        return values.length ? values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length : 0;
      }

      function countByPredicate(values = [], predicate) {
        let count = 0;
        for (const value of values) if (predicate(value)) count++;
        return count;
      }

      function countSettlementEligiblePackCells(cells = {}) {
        let count = 0;
        for (const cell of cells.i || []) {
          if ((cells.s?.[cell] || 0) > 0 && (cells.culture?.[cell] || 0) > 0) count++;
        }
        return count;
      }

      function countAlive(items = []) {
        if (!Array.isArray(items)) return 0;
        return items.filter(item => item?.i && !item.removed).length;
      }

      function countValues(values = []) {
        const counts = {};
        for (const value of values || []) {
          const key = value === undefined || value === null ? "null" : String(value);
          counts[key] = (counts[key] || 0) + 1;
        }
        return counts;
      }

      function describePackTopology(cells = {}) {
        const heights = cells.h || [];
        const types = cells.t || [];
        const coastLand = [];
        const coastWater = [];
        const nearThreshold = [];
        const landNearThreshold = [];
        const waterNearThreshold = [];

        for (let cell = 0; cell < heights.length; cell++) {
          const height = Number(heights[cell] || 0);
          const type = Number(types[cell] || 0);
          if (type === 1) coastLand.push(height);
          if (type === -1) coastWater.push(height);
          if (height >= 18 && height <= 22) {
            nearThreshold.push(height);
            if (height >= 20) landNearThreshold.push(height);
            else waterNearThreshold.push(height);
          }
        }

        return {
          coastLandHeight: describeNumbers(coastLand),
          coastWaterHeight: describeNumbers(coastWater),
          nearThreshold: {
            total: nearThreshold.length,
            land: landNearThreshold.length,
            water: waterNearThreshold.length,
            heights: countValues(nearThreshold)
          }
        };
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

      function describeResourceBonus(pack) {
        const cells = pack.cells || {};
        const bonuses = estimateResourceBonuses(cells, pack.goods || []);
        return {
          cells: countByPredicate(bonuses, value => value > 0),
          total: round(bonuses.reduce((sum, value) => sum + value, 0)),
          values: describeNumbers(bonuses.filter(value => value > 0))
        };
      }

      function estimateResourceBonuses(cells = {}, goods = []) {
        const goodValues = new Map(goods.filter(Boolean).map(good => [good.i, Number(good.value || 0)]));
        const getResValue = cell => {
          const good = cells.good?.[cell];
          return good ? goodValues.get(good) || 0 : 0;
        };
        return (cells.i || []).map(cell => {
          if (!cells.good || !(cells.good[cell] || (cells.c?.[cell] || []).some(neighbor => cells.good[neighbor]))) return 0;
          const cellRes = getResValue(cell);
          const neighborValues = (cells.c?.[cell] || []).map(getResValue);
          const neighborRes = average(neighborValues);
          return (cellRes ? cellRes + 10 : 0) + neighborRes;
        });
      }

      function countInvalidRefs(values = [], limit) {
        let count = 0;
        for (const value of values || []) if (!Number.isInteger(value) || value < 0 || value >= limit) count++;
        return count;
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

      function describeFeatures(features = []) {
        const alive = features.filter(Boolean);
        return {
          total: alive.length,
          land: alive.filter(feature => feature.land).length,
          water: alive.filter(feature => !feature.land).length,
          types: countByKey(alive, feature => feature.type || "unknown"),
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
          diagnostics: describeFeatureDiagnostics(alive, packCells)
        };
      }

      function describeFeatureDiagnostics(features = [], cells) {
        const typed = type => features.filter(feature => feature.type === type);
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
            named: lakes.filter(feature => Boolean(feature.name)).length,
            withOutlet: lakes.filter(feature => Boolean(feature.outlet)).length,
            cellsLt3: lakes.filter(feature => Number(feature.cells || 0) < 3).length,
            cellsLt10: lakes.filter(feature => Number(feature.cells || 0) < 10).length
          },
          details: features.map(feature => describeFeatureDetail(feature, cells, features))
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

      function describeFeatureDetail(feature, cells, features) {
        return {
          i: feature.i ?? feature.id ?? null,
          type: feature.type || "unknown",
          group: feature.group || "none",
          cells: Number(feature.cells || 0),
          area: round(Number(feature.area || 0)),
          firstCell: Number.isInteger(feature.firstCell) ? feature.firstCell : null,
          height: Number.isFinite(feature.height) ? round(feature.height) : null,
          outlet: Number.isInteger(feature.outlet) ? feature.outlet : null,
          topology: describeFeatureCellTopology(feature, cells, features),
          named: Boolean(feature.name)
        };
      }

      function describeFeatureCellTopology(feature, cells = {}, features = []) {
        const featureId = Number(feature.i ?? feature.id);
        const featureIds = cells.f || [];
        const heights = cells.h || [];
        const types = cells.t || [];
        const neighbors = cells.c || [];
        const featureCells = [];
        const boundaryNeighborTypes = {};
        const boundaryNeighborGroups = {};
        const boundaryNeighborHeights = [];
        let boundaryEdges = 0;
        let nearThreshold = 0;
        let thresholdLand = 0;
        let thresholdWater = 0;

        for (let cell = 0; cell < featureIds.length; cell++) {
          if (Number(featureIds[cell]) !== featureId) continue;
          featureCells.push(cell);
          const height = Number(heights[cell] || 0);
          if (height >= 18 && height <= 22) {
            nearThreshold++;
            if (height >= 20) thresholdLand++;
            else thresholdWater++;
          }

          for (const neighbor of neighbors[cell] || []) {
            if (Number(featureIds[neighbor]) === featureId) continue;
            boundaryEdges++;
            const neighborFeature = features[featureIds[neighbor]];
            const neighborType = neighborFeature?.type || "unknown";
            const neighborGroup = neighborFeature?.group || "none";
            boundaryNeighborTypes[neighborType] = (boundaryNeighborTypes[neighborType] || 0) + 1;
            boundaryNeighborGroups[neighborGroup] = (boundaryNeighborGroups[neighborGroup] || 0) + 1;
            boundaryNeighborHeights.push(Number(heights[neighbor] || 0));
          }
        }

        return {
          cellCount: featureCells.length,
          height: describeNumbers(featureCells.map(cell => heights[cell] || 0)),
          distanceTypes: countValues(featureCells.map(cell => types[cell] ?? null)),
          nearThreshold,
          thresholdLand,
          thresholdWater,
          boundaryEdges,
          boundaryNeighborTypes,
          boundaryNeighborGroups,
          boundaryNeighborHeight: describeNumbers(boundaryNeighborHeights)
        };
      }

      function describeRivers(rivers = [], cells) {
        const riverLoopCount = rivers.filter(river => {
          const riverCells = (river.cells || []).filter(cell => cell >= 0);
          return new Set(riverCells).size !== riverCells.length;
        }).length;
        return {
          count: rivers.length,
          cellsWithRiver: countByPredicate(cells.r || [], value => value > 0),
          flux: describeNumbers(cells.fl || []),
          confluences: countByPredicate(cells.conf || [], value => value > 0),
          mouths: countByPredicate(rivers, river => Number.isInteger(river?.mouth)),
          width: describeNumbers(rivers.map(river => river.width || 0)),
          discharge: describeNumbers(rivers.map(river => river.discharge || 0)),
          riverLoopCount
        };
      }

      function describeRoutes(routes = [], cells) {
        let landRouteWaterCells = 0;
        let seaRouteLandCells = 0;
        const groups = countByKey(routes, route => route.group || "roads");
        for (const route of routes) {
          const routeCells = (route.points || []).map(point => point?.[2]).filter(Number.isInteger);
          if (route.group === "searoutes") {
            const interior = routeCells.slice(1, -1);
            seaRouteLandCells += interior.filter(cell => cells.h[cell] >= 20).length;
          } else {
            landRouteWaterCells += routeCells.filter(cell => cells.h[cell] < 20).length;
          }
        }
        return {
          total: routes.length,
          groups,
          roads: groups.roads || 0,
          trails: groups.trails || 0,
          searoutes: groups.searoutes || 0,
          landRouteWaterCells,
          seaRouteLandCells
        };
      }

      function describeNames(pack) {
        const burgs = (pack.burgs || []).filter(item => item?.i && !item.removed);
        const states = (pack.states || []).filter(item => item?.i && !item.removed);
        const provinces = (pack.provinces || []).filter(item => item?.i && !item.removed);
        const rivers = pack.rivers || [];
        const lakes = (pack.features || []).filter(feature => feature?.type === "lake");
        return {
          mapName: String(window.mapName?.value || ""),
          burgNames: countByPredicate(burgs, item => Boolean(item.name)),
          burgCoas: countByPredicate(burgs, item => Boolean(item.coa)),
          burgGroups: countByKey(burgs, item => item.group || "none"),
          stateNames: countByPredicate(states, item => Boolean(item.name)),
          stateFullNames: countByPredicate(states, item => Boolean(item.fullName)),
          stateFormNames: countByPredicate(states, item => Boolean(item.formName)),
          stateForms: countByKey(states, item => item.formName || "none"),
          stateTypes: countByKey(states, item => item.type || "none"),
          cultureTypes: countByKey(pack.cultures || [], item => item?.type || "none"),
          cultureNameStyles: countByKey(pack.cultures || [], item => item?.nameStyle || "default"),
          oldPoliticalFormHits: countOldPoliticalFormHits(states),
          cultureLinkedStateNames: countCultureLinkedStateNames(states, pack.cultures || []),
          stateNameSamples: states.slice(0, 12).map(item => ({
            i: item.i,
            name: item.name || "",
            fullName: item.fullName || "",
            formName: item.formName || "",
            type: item.type || "",
            culture: item.culture || 0
          })),
          stateCoas: countByPredicate(states, item => Boolean(item.coa)),
          provinceNames: countByPredicate(provinces, item => Boolean(item.name)),
          riverNames: countByPredicate(rivers, item => Boolean(item.name)),
          riverTypes: countByKey(rivers, item => item.type || "none"),
          lakeNames: countByPredicate(lakes, item => Boolean(item.name)),
          lakeGroups: countByKey(lakes, item => item.group || "none")
        };
      }

      function countOldPoliticalFormHits(states = []) {
        const oldForm = /王朝|朝|自由邦|公国|侯国|伯国/u;
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

      function describeMilitary(pack, cells) {
        const states = (pack.states || []).filter(item => item?.i && !item.removed);
        const regiments = states.flatMap(state =>
          (Array.isArray(state.military) ? state.military : []).map(regiment => ({...regiment, state: state.i}))
        );
        return {
          statesWithMilitary: countByPredicate(states, state => Array.isArray(state.military) && state.military.length > 0),
          regiments: regiments.length,
          troops: round(regiments.reduce((sum, regiment) => sum + Number(regiment.t ?? regiment.a ?? 0), 0)),
          navalRegiments: countByPredicate(regiments, regiment => regiment.n),
          types: countByKey(regiments, regiment => regiment.type || "unknown"),
          units: sumRegimentUnits(regiments),
          states: describeMilitaryStates(states, regiments),
          invalidCells: countInvalidRefs(
            regiments.map(regiment => regiment.cell).filter(Number.isInteger),
            cells.i.length
          )
        };
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
              units: sumRegimentUnits(stateRegiments)
            };
          });
      }

      function sumRegimentUnits(regiments = []) {
        return regiments.flatMap(regiment => Object.entries(regiment.u || {})).reduce((counts, [unit, value]) => {
          counts[unit] = round((counts[unit] || 0) + Number(value || 0));
          return counts;
        }, {});
      }

      function describeMarkers(markers = [], cells) {
        return {
          total: markers.length,
          types: countByKey(markers, marker => marker.type || "unknown"),
          withIcon: countByPredicate(markers, marker => Boolean(marker.icon)),
          pinned: countByPredicate(markers, marker => Boolean(marker.pinned)),
          locked: countByPredicate(markers, marker => Boolean(marker.lock)),
          invalidCells: countInvalidRefs(
            markers.map(marker => marker.cell).filter(Number.isInteger),
            cells.i.length
          )
        };
      }

      function describeZones(zones = [], cells) {
        const zoneCells = zones.flatMap(zone => zone.cells || []);
        return {
          total: zones.length,
          types: countByKey(zones, zone => zone.type || "unknown"),
          cells: describeNumbers(zones.map(zone => (zone.cells || []).length)),
          hidden: countByPredicate(zones, zone => Boolean(zone.hidden)),
          invalidCells: countInvalidRefs(zoneCells.filter(Number.isInteger), cells.i.length)
        };
      }

      function describeStatistics(pack) {
        const burgs = (pack.burgs || []).filter(item => item?.i && !item.removed);
        const states = (pack.states || []).filter(item => item?.i && !item.removed);
        const provinces = (pack.provinces || []).filter(item => item?.i && !item.removed);
        const cultures = (pack.cultures || []).filter(item => item?.i && !item.removed);
        const religions = (pack.religions || []).filter(item => item?.i && !item.removed);
        return {
          burgsWithPopulation: countByPredicate(burgs, item => Number.isFinite(item.population)),
          burgsWithType: countByPredicate(burgs, item => Boolean(item.type)),
          statesWithArea: countByPredicate(states, item => Number.isFinite(item.area)),
          statesWithRural: countByPredicate(states, item => Number.isFinite(item.rural)),
          statesWithUrban: countByPredicate(states, item => Number.isFinite(item.urban)),
          statesWithNeighbors: countByPredicate(states, item => Array.isArray(item.neighbors)),
          provincesWithPole: countByPredicate(provinces, item => Array.isArray(item.pole)),
          culturesWithArea: countByPredicate(cultures, item => Number.isFinite(item.area)),
          religionsWithArea: countByPredicate(religions, item => Number.isFinite(item.area))
        };
      }

      function describeEconomy(pack) {
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
        const populationBaseTotal = states.reduce((sum, state) => sum + Number(state.rural || 0) + Number(state.urban || 0), 0);
        const pollTaxExpectedTotal = states.reduce((sum, state) => sum + (pollTaxExpectedByState[state.i] || 0), 0);
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
            assignedRatio: round(assignedCells / Math.max(1, cells.i?.length || 0)),
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
            ruralTotal: round(states.reduce((sum, state) => sum + Number(state.rural || 0), 0)),
            urbanTotal: round(states.reduce((sum, state) => sum + Number(state.urban || 0), 0)),
            populationBaseTotal: round(populationBaseTotal),
            weightedPollTaxRate: round(pollTaxExpectedTotal / Math.max(1, populationBaseTotal), 3),
            pollTaxExpected: round(pollTaxExpectedTotal),
            byState: describeTaxStates(states, dealTaxByState, pollTaxExpectedByState),
            treasuryMismatchCount: treasuryMismatches.filter(value => value > 0.05).length,
            treasuryMismatchMax: round(Math.max(0, ...treasuryMismatches))
          }
        };
      }

      function describePortDiagnostics(pack) {
        const burgs = (pack.burgs || []).filter(burg => burg?.i && !burg.removed);
        const ports = burgs.filter(burg => burg.port);
        return {
          ports: ports.length,
          capitalPorts: countByPredicate(ports, burg => burg.capital),
          byFeature: countByKey(ports, burg => burg.port || "none"),
          byState: countByKey(ports, burg => burg.state || "none"),
          featureTypes: countByKey(ports, burg => pack.features?.[burg.port]?.type || "unknown")
        };
      }

      function describeTaxStates(states = [], dealTaxByState = {}, pollTaxExpectedByState = {}) {
        return states.map(state => {
          const populationBase = Number(state.rural || 0) + Number(state.urban || 0);
          const dealTax = Number(dealTaxByState[state.i] || 0);
          const pollTaxExpected = Number(pollTaxExpectedByState[state.i] || 0);
          return {
            i: state.i,
            name: state.name || "",
            rural: round(Number(state.rural || 0)),
            urban: round(Number(state.urban || 0)),
            populationBase: round(populationBase),
            salesTax: round(Number(state.salesTax || 0), 3),
            pollTax: round(Number(state.pollTax || 0), 3),
            dealTax: round(dealTax),
            pollTaxExpected: round(pollTaxExpected),
            treasury: round(Number(state.treasury || 0))
          };
        });
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

      function countInvalidDealIndexes(deals) {
        let invalid = 0;
        for (let index = 0; index < deals.length; index++) if (deals[index]?.i !== index) invalid++;
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

      function validateGraph({grid, pack, routes}) {
        const gridCells = grid.cells;
        const packCells = pack.cells;
        const havenInvalidCount = countInvalidHavens(packCells);
        const harborMismatchCount = countHarborMismatches(packCells);
        return {
          gridCellIndexCountOk: gridCells.i.length === grid.points.length,
          gridNeighborInvalidRefs: countNeighborInvalidRefs(gridCells.c, gridCells.i.length),
          gridVertexInvalidRefs: countNestedInvalidRefs(gridCells.v, grid.vertices.p.length),
          packCellIndexCountOk: packCells.i.length === packCells.p.length,
          packGridRefsInvalid: countInvalidRefs(packCells.g, gridCells.i.length),
          packNeighborInvalidRefs: countNeighborInvalidRefs(packCells.c, packCells.i.length),
          packVertexInvalidRefs: countNestedInvalidRefs(packCells.v, pack.vertices.p.length),
          havenInvalidCount,
          harborMismatchCount,
          routeLinkAsymmetry: countRouteLinkAsymmetry(packCells.routes || {}),
          landRouteWaterCells: describeRoutes(routes, packCells).landRouteWaterCells,
          seaRouteLandCells: describeRoutes(routes, packCells).seaRouteLandCells
        };
      }

      function countInvalidHavens(cells) {
        let invalid = 0;
        for (const i of cells.i) {
          if (cells.h[i] < 20 || cells.t[i] !== 1) continue;
          const haven = cells.haven?.[i];
          if (!Number.isInteger(haven) || haven < 0 || haven >= cells.i.length || cells.h[haven] >= 20) invalid++;
        }
        return invalid;
      }

      function countHarborMismatches(cells) {
        let mismatch = 0;
        for (const i of cells.i) {
          const expected = (cells.c[i] || []).filter(cell => cells.h[cell] < 20).length;
          const actual = cells.harbor?.[i] || 0;
          if (cells.h[i] >= 20 && cells.t[i] === 1 && actual !== expected) mismatch++;
        }
        return mismatch;
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

      function countRouteLinkAsymmetry(routes = {}) {
        let asymmetry = 0;
        for (const [from, links] of Object.entries(routes)) {
          for (const [to, routeId] of Object.entries(links || {})) {
            if (!routes[to] || routes[to][from] !== routeId) asymmetry++;
          }
        }
        return asymmetry;
      }

      function buildSnapshot({grid, pack}) {
        const packCells = pack.cells;
        const gridCells = grid.cells;
        return {
          metadata: {
            seed: window.seed,
            graphWidth: window.graphWidth,
            graphHeight: window.graphHeight
          },
          grid: {
            spacing: grid.spacing,
            cellsDesired: grid.cellsDesired,
            cellsX: grid.cellsX,
            cellsY: grid.cellsY,
            points: grid.points,
            boundary: grid.boundary,
            cells: {
              i: Array.from(gridCells.i || []),
              c: (gridCells.c || []).map(list => Array.from(list || [])),
              v: (gridCells.v || []).map(list => Array.from(list || [])),
              b: Array.from(gridCells.b || []),
              h: Array.from(gridCells.h || []),
              t: Array.from(gridCells.t || []),
              f: Array.from(gridCells.f || []),
              temp: Array.from(gridCells.temp || []),
              prec: Array.from(gridCells.prec || [])
            },
            vertices: {
              p: grid.vertices.p,
              c: (grid.vertices.c || []).map(list => Array.from(list || [])),
              v: (grid.vertices.v || []).map(list => Array.from(list || []))
            },
            features: grid.features
          },
          pack: {
            cells: {
              i: Array.from(packCells.i || []),
              p: packCells.p,
              g: Array.from(packCells.g || []),
              h: Array.from(packCells.h || []),
              area: Array.from(packCells.area || []),
              c: (packCells.c || []).map(list => Array.from(list || [])),
              v: (packCells.v || []).map(list => Array.from(list || [])),
              b: Array.from(packCells.b || []),
              t: Array.from(packCells.t || []),
              f: Array.from(packCells.f || []),
              haven: Array.from(packCells.haven || []),
              harbor: Array.from(packCells.harbor || []),
              fl: Array.from(packCells.fl || []),
              r: Array.from(packCells.r || []),
              conf: Array.from(packCells.conf || []),
              biome: Array.from(packCells.biome || []),
              s: Array.from(packCells.s || []),
              pop: Array.from(packCells.pop || []),
              culture: Array.from(packCells.culture || []),
              burg: Array.from(packCells.burg || []),
              state: Array.from(packCells.state || []),
              religion: Array.from(packCells.religion || []),
              province: Array.from(packCells.province || [])
            },
            vertices: {
              p: pack.vertices.p,
              c: (pack.vertices.c || []).map(list => Array.from(list || [])),
              v: (pack.vertices.v || []).map(list => Array.from(list || []))
            },
            features: pack.features,
            rivers: pack.rivers,
            burgs: pack.burgs,
            states: pack.states,
            routes: pack.routes,
            cultures: pack.cultures,
            religions: pack.religions,
            provinces: pack.provinces,
            markers: pack.markers,
            zones: pack.zones
          }
        };
      }

      function round(value) {
        return Math.round((Number(value) || 0) * 1000) / 1000;
      }
    },
    {
      cells,
      template,
      seed,
      timeoutMs,
      sourceCommit,
      sourceDir,
      baseUrl,
      includeSnapshot
    }
  );

  mkdirSync(outDir, {recursive: true});
  const summaryPath = join(outDir, "source-summary.json");
  const tracePath = join(outDir, "source-trace.json");
  const screenshotPath = join(outDir, "source-map.png");
  const validationPath = join(outDir, "validation.md");

  writeFileSync(summaryPath, `${JSON.stringify(baseline.summary, null, 2)}\n`, "utf8");
  writeFileSync(tracePath, `${JSON.stringify(baseline.summary.trace, null, 2)}\n`, "utf8");
  if (includeSnapshot) {
    writeFileSync(join(outDir, "source-snapshot.json"), `${JSON.stringify(baseline.snapshot)}\n`, "utf8");
  }
  if (includeScreenshot) {
    await page.screenshot({path: screenshotPath, fullPage: false});
  }
  writeFileSync(validationPath, renderValidationMarkdown(baseline.summary, {includeSnapshot, includeScreenshot, screenshotPath}), "utf8");

  console.log(`Wrote source baseline summary to ${summaryPath}`);
  console.log(`Wrote source baseline trace to ${tracePath}`);
  if (includeScreenshot) console.log(`Wrote source baseline screenshot to ${screenshotPath}`);
  if (includeSnapshot) console.log(`Wrote source baseline snapshot to ${join(outDir, "source-snapshot.json")}`);
} finally {
  if (browser) await closeBrowser(browser);
  if (serverProcess) stopDevServer(serverProcess);
}

process.exit(0);

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

function startDevServer(sourceDir, host, port) {
  const child = spawn("npm", ["run", "dev", "--", "--host", host, "--port", String(port), "--strictPort"], {
    cwd: sourceDir,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32"
  });
  child.stdout.on("data", chunk => process.stdout.write(chunk));
  child.stderr.on("data", chunk => process.stderr.write(chunk));
  return child;
}

function stopDevServer(child) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {stdio: "ignore"});
    return;
  }
  child.kill();
}

async function closeBrowser(browser) {
  await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 5000))]);
}

async function waitForHttp(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // dev server 启动期间连接失败是正常情况。
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  fail(`Timed out waiting for ${url}`);
}

function getGitCommit(cwd) {
  const safeDirectory = cwd.replaceAll("\\", "/");
  const result = spawnSync("git", ["-c", `safe.directory=${safeDirectory}`, "rev-parse", "HEAD"], {cwd, encoding: "utf8"});
  return result.status === 0 ? result.stdout.trim() : null;
}

function renderValidationMarkdown(summary, {includeSnapshot, includeScreenshot, screenshotPath}) {
  const lines = [];
  lines.push(`# Source baseline 验收记录`);
  lines.push("");
  lines.push(`Seed：\`${summary.metadata.seed}\``);
  lines.push(`模板：\`${summary.metadata.template}\``);
  lines.push(`目标 cells：${summary.metadata.cellsTarget}`);
  lines.push(`截图：${includeScreenshot ? `已输出本地预览 \`${screenshotPath}\`，默认不纳入版本库` : "未输出，可用 `--screenshot true` 生成本地预览"}`);
  lines.push(`完整 snapshot：${includeSnapshot ? "已输出" : "未输出，本次仅输出 summary/trace"}`);
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
  lines.push("## 关键检查");
  lines.push("");
  lines.push("| 检查 | 数值 |");
  lines.push("|---|---:|");
  for (const [key, value] of Object.entries(summary.validation)) {
    lines.push(`| ${key} | ${value} |`);
  }
  lines.push("");
  lines.push("## 下一步");
  lines.push("");
  lines.push("阶段 0 后续需要把本工具扩展为矩阵批量运行，并生成 `candidate-summary.json` 与 `diff.json`。");
  return `${lines.join("\n")}\n`;
}

function sanitizeFileName(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
