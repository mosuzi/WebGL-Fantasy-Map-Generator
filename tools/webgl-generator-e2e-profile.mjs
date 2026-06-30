#!/usr/bin/env node
import {createReadStream, existsSync, mkdirSync, statSync, writeFileSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const args = parseArgs(process.argv.slice(2));
const host = String(args.host || "127.0.0.1");
const port = Number(args.port || 5436);
const timeoutMs = Number(args.timeout || 240000);
const cellsList = String(args.cells || "10000").split(",").map(value => Number(value.trim())).filter(Boolean);
const seed = String(args.seed || "stage-2-1");
const template = String(args.template || "continents");
const graphWidth = Number(args.width || 1440);
const graphHeight = Number(args.height || 960);
const browserChannel = args["browser-channel"] || args.channel || "chrome";
const distDir = resolve(args.dir || join(rootDir, "dist", "webgl-generator"));
const outPath = resolve(args.out || join(rootDir, "docs", "generated", "reports", "e2e-profile-results.json"));
const markdownPath = resolve(args.markdown || join(rootDir, "docs", "generated", "reports", "e2e-profile-results.md"));
const viewport = parseViewport(args.viewport || "1280x820");
const maxReadyMs = Number(args["max-ready-ms"] || 2500);
const maxLoadMapMs = Number(args["max-load-ms"] || 1200);

if (!existsSync(distDir)) fail(`构建产物不存在：${distDir}`);
mkdirSync(dirname(outPath), {recursive: true});
mkdirSync(dirname(markdownPath), {recursive: true});

const playwright = await loadPlaywright(sourceDir);
const server = await startStaticServer({host, port, publicDir: distDir});
let browser = null;

try {
  browser = await launchBrowser(playwright, {headless: !args.headful, browserChannel});
  const context = await browser.newContext({viewport, deviceScaleFactor: 1});
  await context.addInitScript(() => {
    localStorage.setItem("webgl-generator-control-preferences", JSON.stringify({
      colorMode: "height",
      showOceanHeight: false,
      smoothCellBorders: true,
      showHoverInfo: true,
      maxCityLabels: 5000,
      layers: {
        coastline: true,
        lakeShore: true,
        stateBorders: true,
        provinceBorders: true
      }
    }));
  });

  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", error => consoleErrors.push(error.message));

  const baseUrl = `http://${host}:${port}`;
  await page.goto(baseUrl, {waitUntil: "domcontentloaded", timeout: timeoutMs});
  await page.waitForFunction(() => window.__webglGeneratorApp?.renderer?.getStats?.()?.webgl2, null, {timeout: timeoutMs});
  await page.waitForFunction(() => window.__webglGeneratorApp?.map?.metadata?.generationTiming?.totalMs, null, {timeout: timeoutMs});

  const cases = [];
  for (const cells of cellsList) {
    cases.push(await profileCase(page, {cells, seed, template, graphWidth, graphHeight}));
  }

  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      url: baseUrl,
      distDir,
      seed,
      cells: cellsList,
      template,
      graphWidth,
      graphHeight,
      viewport,
      browserChannel,
      maxReadyMs,
      maxLoadMapMs,
      consoleErrors
    },
    cases,
    passed: !consoleErrors.length && cases.every(item => item.passed)
  };

  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, renderMarkdown(report), "utf8");
  console.log(`Wrote ${outPath}`);
  console.log(`Wrote ${markdownPath}`);
  if (!report.passed) {
    console.error(renderFailureSummary(report));
    process.exitCode = 1;
  }
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(resolve => server.close(resolve));
}

async function profileCase(page, {cells, seed, template, graphWidth, graphHeight}) {
  await page.waitForSelector("#cells-input", {state: "attached", timeout: timeoutMs});
  const startedAt = await page.evaluate(({cells, seed, template, graphWidth, graphHeight}) => {
    window.__e2ePreviousMap = window.__webglGeneratorApp?.map || null;
    document.getElementById("auto-random-seed").checked = false;
    document.getElementById("seed-input").value = seed;
    document.getElementById("cells-input").value = String(cells);
    document.getElementById("width-input").value = String(graphWidth);
    document.getElementById("height-input").value = String(graphHeight);
    document.getElementById("heightmap-template").value = template;
    const started = performance.now();
    document.getElementById("generate-map").click();
    return started;
  }, {cells, seed, template, graphWidth, graphHeight});

  await page.waitForFunction(
    expected => {
      const app = window.__webglGeneratorApp;
      const loading = document.getElementById("generation-loading");
      return app?.map &&
        app.map !== window.__e2ePreviousMap &&
        app.map.metadata?.seed === expected.seed &&
        app.map.metadata?.cellsTarget === expected.cells &&
        app.renderer?.getStats?.()?.draw?.glError === 0 &&
        loading?.hidden === true;
    },
    {cells, seed},
    {timeout: timeoutMs}
  );

  return page.evaluate(({startedAt, maxReadyMs, maxLoadMapMs}) => {
    const roundBrowserMs = value => Math.round(value * 10) / 10;
    const app = window.__webglGeneratorApp;
    const map = app.map;
    const stats = app.renderer.getStats();
    const elapsedMs = roundBrowserMs(performance.now() - startedAt);
    const generationMs = map.metadata.generationTiming?.totalMs || 0;
    const loadMapMs = stats.loadMap?.totalMs || 0;
    const uiMs = roundBrowserMs(Math.max(0, elapsedMs - generationMs - loadMapMs));
    const failures = [];
    if (elapsedMs > maxReadyMs) failures.push(`端到端耗时 ${elapsedMs}ms 超过 ${maxReadyMs}ms`);
    if (loadMapMs > maxLoadMapMs) failures.push(`WebGL 加载 ${loadMapMs}ms 超过 ${maxLoadMapMs}ms`);
    if (stats.draw?.glError !== 0) failures.push(`WebGL error expected 0, got ${stats.draw?.glError}`);

    return {
      cells: map.metadata.cellsTarget,
      gridCells: map.metadata.gridCells,
      packCells: map.metadata.packCells,
      checksum: map.summary.checksum,
      elapsedMs,
      generationMs,
      loadMapMs,
      uiMs,
      generationSlowest: map.metadata.generationTiming?.slowest || null,
      loadMapSlowest: stats.loadMap?.slowest || null,
      loadMapStages: stats.loadMap?.stages || [],
      draw: stats.draw,
      vertexCount: stats.vertexCount,
      lineVertexCount: stats.lineVertexCount,
      lineTriangleCount: stats.lineTriangleCount,
      cellSurfaceMode: stats.cellSurfaceMode,
      boundaryLineMode: stats.boundaryLineMode,
      failures,
      passed: failures.length === 0
    };
  }, {startedAt, maxReadyMs, maxLoadMapMs});
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# WebGL 端到端性能报告", "");
  lines.push(`- 生成时间：${report.metadata.generatedAt}`);
  lines.push(`- seed：\`${report.metadata.seed}\``);
  lines.push(`- 地形模板：\`${report.metadata.template}\``);
  lines.push(`- 地图尺寸：\`${report.metadata.graphWidth} x ${report.metadata.graphHeight}\``);
  lines.push(`- 端到端上限：\`${report.metadata.maxReadyMs}ms\``);
  lines.push(`- WebGL 加载上限：\`${report.metadata.maxLoadMapMs}ms\``);
  lines.push(`- 结论：${report.passed ? "通过" : "失败"}`);
  lines.push("");
  lines.push("## 总览", "");
  lines.push("| 目标 cells | grid cells | pack cells | 点击到出图 | 纯生成 | WebGL 加载 | UI/调度余量 | 最慢生成阶段 | 最慢加载阶段 | 结果 |");
  lines.push("|---:|---:|---:|---:|---:|---:|---:|---|---|---|");
  for (const item of report.cases) {
    lines.push([
      item.cells,
      item.gridCells,
      item.packCells,
      `${item.elapsedMs}ms`,
      `${item.generationMs}ms`,
      `${item.loadMapMs}ms`,
      `${item.uiMs}ms`,
      formatStage(item.generationSlowest),
      formatStage(item.loadMapSlowest),
      item.passed ? "通过" : `失败：${item.failures.join("；")}`
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }

  for (const item of report.cases) {
    lines.push("", `## ${item.cells} cells WebGL 加载阶段`, "");
    lines.push("| 阶段 | 耗时 | 占加载比例 |");
    lines.push("|---|---:|---:|");
    for (const stage of item.loadMapStages) {
      const share = item.loadMapMs ? roundMs(stage.ms / item.loadMapMs * 100) : 0;
      lines.push(`| ${stage.label} | ${stage.ms}ms | ${share}% |`);
    }
  }

  if (report.metadata.consoleErrors.length) {
    lines.push("", "## Console Errors", "");
    for (const error of report.metadata.consoleErrors) lines.push(`- ${error}`);
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function renderFailureSummary(report) {
  const lines = ["端到端性能守门失败："];
  for (const item of report.cases) {
    for (const failure of item.failures) lines.push(`- ${item.cells} cells: ${failure}`);
  }
  for (const error of report.metadata.consoleErrors) lines.push(`- console error: ${error}`);
  return lines.join("\n");
}

function formatStage(stage) {
  return stage ? `${stage.label} ${stage.ms}ms` : "none";
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

    response.writeHead(200, {
      "content-type": getContentType(target),
      "cache-control": "no-store, max-age=0"
    });
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

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=");
    parsed[key] = inlineValue ?? argv[++index] ?? true;
  }
  return parsed;
}

function parseViewport(value) {
  const [width, height] = String(value).split("x").map(Number);
  return {width: width || 1280, height: height || 820};
}

async function loadPlaywright(fallbackSourceDir) {
  try {
    const require = createRequire(import.meta.url);
    return require("playwright");
  } catch {
    const requireFromSource = createRequire(join(fallbackSourceDir, "package.json"));
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
        // Try the next installed system browser channel.
      }
    }
    throw error;
  }
}

function getContentType(file) {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml"
  };
  return types[extname(file).toLowerCase()] || "application/octet-stream";
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function roundMs(value) {
  return Math.round(value * 10) / 10;
}
