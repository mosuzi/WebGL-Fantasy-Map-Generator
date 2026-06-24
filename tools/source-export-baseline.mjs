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
const outDir = resolve(args.outDir || args["out-dir"] || join(rootDir, "docs", "source-baselines", caseName));
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
          population: describeNumbers(packCells.pop || [])
        },
        society: {
          cultures: countAlive(pack.cultures),
          burgs: countAlive(pack.burgs),
          capitals: countByPredicate(pack.burgs || [], burg => burg?.i && !burg.removed && burg.capital),
          ports: countByPredicate(pack.burgs || [], burg => burg?.i && !burg.removed && burg.port),
          states: countAlive(pack.states),
          religions: countAlive(pack.religions),
          provinces: countAlive(pack.provinces),
          markers: countAlive(pack.markers),
          zones: countAlive(pack.zones),
          regiments: Array.isArray(pack.states)
            ? pack.states.reduce((sum, state) => sum + (Array.isArray(state?.military) ? state.military.length : 0), 0)
            : 0
        },
        routes: describeRoutes(routes, packCells),
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

      function countByPredicate(values = [], predicate) {
        let count = 0;
        for (const value of values) if (predicate(value)) count++;
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

      function countByKey(items = [], keyFn) {
        const counts = {};
        for (const item of items || []) {
          if (!item) continue;
          const key = keyFn(item);
          counts[key] = (counts[key] || 0) + 1;
        }
        return counts;
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
          }
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
  writeFileSync(tracePath, `${JSON.stringify(baseline.trace, null, 2)}\n`, "utf8");
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
  const result = spawnSync("git", ["rev-parse", "HEAD"], {cwd, encoding: "utf8"});
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
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function sanitizeFileName(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
