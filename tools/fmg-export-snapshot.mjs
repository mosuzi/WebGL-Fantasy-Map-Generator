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

      const {pack, graphWidth, graphHeight, seed} = window;
      const cells = pack.cells;
      const vertices = pack.vertices;

      return {
        metadata: {
          generatedAt: new Date().toISOString(),
          source: "Fantasy-Map-Generator runtime snapshot",
          cellsTarget: options.cells,
          seed,
          graphWidth,
          graphHeight,
          packCells: cells.i.length,
          vertices: vertices.p.length
        },
        cells: {
          i: Array.from(cells.i),
          p: cells.p.map(point => [round(point[0]), round(point[1])]),
          v: cells.v.map(vertexIds => Array.from(vertexIds)),
          h: Array.from(cells.h),
          state: Array.from(cells.state || [])
        },
        vertices: {
          p: vertices.p.map(point => [round(point[0]), round(point[1])])
        },
        states: pack.states.map(state => {
          if (!state) return null;
          return {
            i: state.i || 0,
            name: state.name || "",
            color: state.color || "#999999",
            removed: Boolean(state.removed)
          };
        })
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
