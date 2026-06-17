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
const cells = Number(args.cells || 10000);
const output = resolve(args.out || join(rootDir, "prototype", "webgl-cells", "data", "sample-map.json"));
const port = Number(args.port || 5300);
const host = args.host || "127.0.0.1";
const timeoutMs = Number(args.timeout || 180000);
const browserChannel = args["browser-channel"] || args.channel || null;

if (!existsSync(sourceDir)) fail(`Source directory does not exist: ${sourceDir}`);
if (!existsSync(join(sourceDir, "node_modules"))) {
  fail(`Missing dependencies in ${sourceDir}. Run npm install in the source project first.`);
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
  const page = await browser.newPage({viewport: {width: 1440, height: 960}});
  page.setDefaultTimeout(timeoutMs);

  await page.goto(baseUrl, {waitUntil: "domcontentloaded", timeout: timeoutMs});
  await page.waitForFunction(() => typeof window.generate === "function" && typeof window.changeCellsDensity === "function", {
    timeout: timeoutMs
  });

  const snapshot = await page.evaluate(
    async options => {
      setCellCount(options.cells);
      await window.generate();
      await waitForMap();

      const {grid, pack, graphWidth, graphHeight, seed} = window;
      const cells = pack.cells;
      const vertices = pack.vertices;
      const gridCells = grid.cells;
      const gridVertices = grid.vertices;
      const gridTemperature = Array.from(gridCells.temp || []);

      return {
        metadata: {
          generatedAt: new Date().toISOString(),
          source: "Fantasy-Map-Generator runtime snapshot",
          cellsTarget: options.cells,
          seed,
          graphWidth,
          graphHeight,
          gridCells: gridCells.i.length,
          gridVertices: gridVertices.p.length,
          packCells: cells.i.length,
          vertices: vertices.p.length,
          features: pack.features.filter(Boolean).length,
          lakes: pack.features.filter(feature => feature?.type === "lake").length,
          rivers: pack.rivers.length,
          routes: pack.routes?.length || 0,
          routeGroups: getRouteGroups(pack.routes || []),
          burgs: pack.burgs.filter(burg => burg?.i && !burg.removed).length,
          ports: pack.burgs.filter(burg => burg?.i && !burg.removed && burg.port).length,
          markers: pack.markers?.length || 0,
          burgLabels: pack.burgs.filter(burg => burg?.i && !burg.removed && burg.name).length,
          stateLabels: pack.states.filter(state => state?.i && !state.removed && state.name).length,
          emblemPlaceholders: getEmblemPlaceholdersCount()
        },
        grid: {
          cells: {
            i: Array.from(gridCells.i),
            p: grid.points.map(point => [round(point[0]), round(point[1])]),
            v: gridCells.v.map(vertexIds => Array.from(vertexIds)),
            h: Array.from(gridCells.h),
            temp: gridTemperature,
            prec: Array.from(gridCells.prec || [])
          },
          vertices: {
            p: gridVertices.p.map(point => [round(point[0]), round(point[1])])
          }
        },
        cells: {
          i: Array.from(cells.i),
          p: cells.p.map(point => [round(point[0]), round(point[1])]),
          v: cells.v.map(vertexIds => Array.from(vertexIds)),
          h: Array.from(cells.h),
          g: Array.from(cells.g || []),
          f: Array.from(cells.f || []),
          state: Array.from(cells.state || []),
          province: Array.from(cells.province || []),
          culture: Array.from(cells.culture || []),
          religion: Array.from(cells.religion || []),
          biome: Array.from(cells.biome || []),
          burg: Array.from(cells.burg || []),
          r: Array.from(cells.r || []),
          fl: Array.from(cells.fl || []),
          pop: Array.from(cells.pop || []).map(value => round(value || 0))
        },
        vertices: {
          p: vertices.p.map(point => [round(point[0]), round(point[1])])
        },
        states: pack.states.map(state => {
          if (!state) return null;
          return {
            i: state.i || 0,
            name: state.name || "",
            fullName: state.fullName || state.name || "",
            color: state.color || "#999999",
            removed: Boolean(state.removed),
            capital: state.capital || 0,
            center: state.center || 0,
            cells: state.cells || 0,
            pole: serializePoint(state.pole),
            coa: serializeCoa(state.coa)
          };
        }),
        provinces: (pack.provinces || []).map(province => serializeNamedColorItem(province)),
        cultures: (pack.cultures || []).map(culture => serializeNamedColorItem(culture)),
        religions: (pack.religions || []).map(religion => serializeNamedColorItem(religion)),
        biomes: serializeBiomes(),
        themeMetadata: {
          temperature: getRange(gridTemperature)
        },
        features: pack.features.map(feature => {
          if (!feature) return null;
          return {
            i: feature.i || 0,
            type: feature.type || "",
            land: Boolean(feature.land),
            border: Boolean(feature.border),
            cells: feature.cells || 0,
            firstCell: feature.firstCell || 0,
            vertices: Array.from(feature.vertices || []),
            area: round(feature.area || 0),
            shoreline: Array.from(feature.shoreline || []),
            height: round(feature.height || 0),
            group: feature.group || "",
            temp: round(feature.temp || 0),
            flux: round(feature.flux || 0),
            evaporation: round(feature.evaporation || 0),
            name: feature.name || ""
          };
        }),
        rivers: pack.rivers.map(river => ({
          i: river.i,
          source: river.source || 0,
          mouth: river.mouth || 0,
          parent: river.parent || 0,
          basin: river.basin || 0,
          discharge: round(river.discharge || 0),
          length: round(river.length || 0),
          cells: Array.from(river.cells || []),
          points:
            typeof window.Rivers?.addMeandering === "function"
              ? window.Rivers.addMeandering(Array.from(river.cells || []), river.points || null).map(point => [
                  round(point[0]),
                  round(point[1]),
                  round(point[2] || 0)
                ])
              : Array.isArray(river.points)
                ? river.points.map(point => [round(point[0]), round(point[1]), round(point[2] || 0)])
                : null,
          widthFactor: river.widthFactor || 1,
          sourceWidth: river.sourceWidth || 0,
          width: river.width || 0,
          name: river.name || "",
          type: river.type || "River"
        })),
        routes: (pack.routes || []).map(route => ({
          i: route.i,
          group: route.group || "roads",
          feature: route.feature || 0,
          name: route.name || "",
          points: Array.isArray(route.points)
            ? route.points.map(point => [round(point[0]), round(point[1]), point[2] ?? null])
            : []
        })),
        burgs: pack.burgs.map(burg => {
          if (!burg || !burg.i) return null;
          return {
            i: burg.i,
            name: burg.name || "",
            x: round(burg.x || 0),
            y: round(burg.y || 0),
            cell: burg.cell || 0,
            state: burg.state || 0,
            culture: burg.culture || 0,
            feature: burg.feature || 0,
            population: round(burg.population || 0),
            capital: Boolean(burg.capital),
            port: Boolean(burg.port),
            removed: Boolean(burg.removed),
            group: burg.group || "town",
            coa: serializeCoa(burg.coa)
          };
        }),
        markers: (pack.markers || []).map(marker => ({
          i: marker.i || 0,
          cell: marker.cell || 0,
          x: round(marker.x || cells.p[marker.cell]?.[0] || 0),
          y: round(marker.y || cells.p[marker.cell]?.[1] || 0),
          icon: marker.icon || "",
          type: marker.type || "",
          note: marker.note || "",
          legend: marker.legend || "",
          pin: marker.pin || "",
          fill: marker.fill || "",
          stroke: marker.stroke || "",
          size: round(marker.size || 0),
          pinned: Boolean(marker.pinned),
          dx: marker.dx ?? null,
          dy: marker.dy ?? null,
          px: marker.px ?? null
        })),
        labels: buildOverlayLabels(),
        emblems: buildOverlayEmblems()
      };

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
        const lockEl = document.getElementById("lock_points");
        if (lockEl) {
          lockEl.dataset.locked = "1";
          lockEl.className = "icon-lock";
        }
      }

      async function waitForMap() {
        const startedAt = performance.now();
        while (performance.now() - startedAt < options.timeoutMs) {
          if (window.pack?.cells?.i?.length && window.pack?.vertices?.p?.length) return;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw new Error("Timed out waiting for generated map data");
      }

      function round(value) {
        return Math.round(value * 100) / 100;
      }

      function serializeNamedColorItem(item) {
        if (!item) return null;
        return {
          i: item.i || 0,
          name: item.name || "",
          color: item.color || "#999999",
          removed: Boolean(item.removed),
          center: item.center || 0,
          pole: serializePoint(item.pole),
          coa: serializeCoa(item.coa)
        };
      }

      function serializePoint(point) {
        if (!point || point.length < 2) return null;
        return [round(point[0]), round(point[1])];
      }

      function serializeCoa(coa) {
        if (!coa) return null;
        return {
          size: round(coa.size || 0),
          x: coa.x === undefined ? null : round(coa.x),
          y: coa.y === undefined ? null : round(coa.y),
          shield: coa.shield || "",
          tinctures: coa.tinctures || null,
          charges: Array.isArray(coa.charges) ? coa.charges.length : 0
        };
      }

      function getStateLabelPoint(state) {
        if (state.pole) return serializePoint(state.pole);
        const capital = state.capital ? pack.burgs[state.capital] : null;
        if (capital && !capital.removed) return [round(capital.x), round(capital.y)];
        const center = state.center ? cells.p[state.center] : null;
        if (center) return [round(center[0]), round(center[1])];
        return null;
      }

      function buildOverlayLabels() {
        const burgLabels = pack.burgs
          .filter(burg => burg?.i && !burg.removed && burg.name)
          .map(burg => ({
            i: burg.i,
            name: burg.name,
            x: round(burg.x || 0),
            y: round(burg.y || 0),
            state: burg.state || 0,
            capital: Boolean(burg.capital),
            port: Boolean(burg.port),
            population: round(burg.population || 0),
            group: burg.group || "town"
          }));

        const stateLabels = pack.states
          .filter(state => state?.i && !state.removed && state.name)
          .map(state => {
            const point = getStateLabelPoint(state);
            return {
              i: state.i,
              name: state.name,
              fullName: state.fullName || state.name,
              x: point ? point[0] : 0,
              y: point ? point[1] : 0,
              color: state.color || "#999999",
              capital: state.capital || 0,
              cells: state.cells || 0,
              strategy: state.pole ? "pole-placeholder" : state.capital ? "capital-placeholder" : "center-placeholder"
            };
          });

        return {
          strategy: "HTML overlay；普通城市标签直接跟随 camera，国家曲线标签短期保留 SVG textPath 策略，demo 只显示中心占位。",
          burgs: burgLabels,
          states: stateLabels
        };
      }

      function buildOverlayEmblems() {
        const stateEmblems = pack.states
          .filter(state => state?.i && !state.removed)
          .map(state => {
            const point = state.coa && (state.coa.x !== undefined || state.coa.y !== undefined)
              ? [round(state.coa.x || 0), round(state.coa.y || 0)]
              : getStateLabelPoint(state);
            if (!point) return null;
            return {
              type: "state",
              i: state.i,
              name: state.name || "",
              x: point[0],
              y: point[1],
              color: state.color || "#999999",
              hasCoa: Boolean(state.coa),
              size: round(state.coa?.size || 1)
            };
          })
          .filter(Boolean);

        const burgEmblems = pack.burgs
          .filter(burg => burg?.i && !burg.removed && (burg.capital || burg.coa))
          .map(burg => ({
            type: "burg",
            i: burg.i,
            name: burg.name || "",
            x: round(burg.coa?.x || burg.x || 0),
            y: round(burg.coa?.y || burg.y || 0),
            color: burg.capital ? "#f0c35b" : "#d7dce2",
            hasCoa: Boolean(burg.coa),
            size: round(burg.coa?.size || (burg.capital ? 1.2 : 0.8))
          }));

        return {
          strategy: "SVG/HTML overlay badge 占位；真实 COA 生成和离屏纹理缓存留到后续阶段。",
          states: stateEmblems,
          burgs: burgEmblems
        };
      }

      function getEmblemPlaceholdersCount() {
        const states = pack.states.filter(state => state?.i && !state.removed).length;
        const burgs = pack.burgs.filter(burg => burg?.i && !burg.removed && (burg.capital || burg.coa)).length;
        return states + burgs;
      }

      function serializeBiomes() {
        const data = typeof biomesData !== "undefined" ? biomesData : null;
        if (!data) return [];
        return data.i.map(index => ({
          i: index,
          name: data.name[index] || "",
          color: data.color[index] || "#999999",
          removed: data.name[index] === "removed"
        }));
      }

      function getRange(values) {
        if (!values.length) return {min: 0, max: 0};
        return {min: Math.min(...values), max: Math.max(...values)};
      }

      function getRouteGroups(routes) {
        const groups = {};
        for (const route of routes) {
          const group = route.group || "roads";
          groups[group] = (groups[group] || 0) + 1;
        }
        return groups;
      }
    },
    {cells, timeoutMs}
  );

  mkdirSync(dirname(output), {recursive: true});
  writeFileSync(output, `${JSON.stringify(snapshot)}\n`, "utf8");
  console.log(`Wrote map snapshot to ${output}`);
  console.log(`Snapshot cells: ${snapshot.metadata.packCells}, vertices: ${snapshot.metadata.vertices}`);
} finally {
  if (browser) await browser.close();
  if (serverProcess) stopDevServer(serverProcess);
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
  const child = spawn("npm", ["run", "dev", "--", "--host", host, "--port", String(port)], {
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

function fail(message) {
  console.error(message);
  process.exit(1);
}
