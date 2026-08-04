#!/usr/bin/env node
import {createReadStream, existsSync, mkdirSync, statSync, writeFileSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, isAbsolute, join, normalize, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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
const playwrightDir = resolve(args["playwright-dir"] || rootDir);
const outPath = resolve(args.out || join(rootDir, "docs", "generated", "reports", "e2e-profile-results.json"));
const markdownPath = resolve(args.markdown || join(rootDir, "docs", "generated", "reports", "e2e-profile-results.md"));
const viewport = parseViewport(args.viewport || "1280x820");
const maxReadyMs = Number(args["max-ready-ms"] || 2500);
const maxLoadMapMs = Number(args["max-load-ms"] || 1200);
const warmupRuns = parseWarmupRuns(args.warmup, 0);
const enforceThresholds = parseBoolean(args["enforce-thresholds"], true);

if (!existsSync(distDir)) fail(`构建产物不存在：${distDir}`);
if (!existsSync(join(playwrightDir, "package.json"))) fail(`Playwright 依赖目录缺少 package.json：${playwrightDir}`);
mkdirSync(dirname(outPath), {recursive: true});
mkdirSync(dirname(markdownPath), {recursive: true});

const playwright = loadPlaywright(playwrightDir);
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
  const healthConsoleEvents = [];
  page.on("console", message => {
    if (message.type() !== "error") return;
    const value = message.text();
    if (value.startsWith("[FMG health]")) healthConsoleEvents.push(value);
    else consoleErrors.push(value);
  });
  page.on("pageerror", error => consoleErrors.push(error.message));

  const baseUrl = `http://${host}:${port}`;
  await page.goto(baseUrl, {waitUntil: "domcontentloaded", timeout: timeoutMs});
  await page.waitForFunction(() => window.__webglGeneratorApp?.renderer?.getStats?.()?.webgl2, null, {timeout: timeoutMs});
  await page.waitForFunction(() => window.__webglGeneratorApp?.map?.metadata?.generationTiming?.totalMs, null, {timeout: timeoutMs});
  await page.waitForFunction(() => {
    const app = window.__webglGeneratorApp;
    const loading = document.getElementById("generation-loading");
    const generate = document.getElementById("generate-map");
    return app?.map && app.renderer?.map === app.map && loading?.hidden === true && generate?.disabled !== true;
  }, null, {timeout: timeoutMs});

  const cases = [];
  for (const cells of cellsList) {
    for (let run = 0; run < warmupRuns; run += 1) {
      await profileCase(page, {cells, seed, template, graphWidth, graphHeight, enforceThresholds: false});
    }
    cases.push(await profileCase(page, {cells, seed, template, graphWidth, graphHeight, enforceThresholds}));
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
      playwrightDir,
      warmupRuns,
      warmupIncludedInResults: false,
      enforceThresholds,
      maxReadyMs,
      maxLoadMapMs,
      eventSampleCounts: aggregateCaseEventSampleCounts(cases),
      healthConsoleEvents,
      consoleErrors,
      timingBoundaries: {
        elapsedMs: "点击生成按钮前的 performance.now 到新地图、loading 隐藏且 WebGL error 为 0",
        generationMs: "地图 metadata.generationTiming.totalMs 的现有生成器边界",
        loadMapMs: "renderer.getStats().loadMap.totalMs 的现有 renderer 边界，包含 loadMap 内部主动 yield",
        schedulingRemainderMs: "max(0, elapsedMs - generationMs - loadMapMs) 的算术残差，不代表独立 UI 或首帧耗时",
        drawMs: "renderer.draw 的 CPU 计时边界；不代表 GPU 执行时间",
        instrumentation: "递增序号与事件对象的观测开销保留在样本中，没有从结果扣除"
      }
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

async function profileCase(page, {cells, seed, template, graphWidth, graphHeight, enforceThresholds}) {
  await page.waitForSelector("#cells-input", {state: "attached", timeout: timeoutMs});
  const profileStart = await page.evaluate(({cells, seed, template, graphWidth, graphHeight}) => {
    window.__e2ePreviousMap = window.__webglGeneratorApp?.map || null;
    const events = window.__webglGeneratorApp?.renderer?.getStats?.()?.performanceEvents || {};
    document.getElementById("auto-random-seed").checked = false;
    document.getElementById("seed-input").value = seed;
    document.getElementById("cells-input").value = String(cells);
    document.getElementById("width-input").value = String(graphWidth);
    document.getElementById("height-input").value = String(graphHeight);
    document.getElementById("heightmap-template").value = template;
    const started = performance.now();
    document.getElementById("generate-map").click();
    return {
      startedAt: started,
      eventSequences: Object.fromEntries(Object.entries(events).map(([key, value]) => [key, Number(value?.sequence || 0)]))
    };
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

  return page.evaluate(({profileStart, maxReadyMs, maxLoadMapMs, enforceThresholds}) => {
    const roundBrowserMs = value => Math.round(value * 10) / 10;
    const app = window.__webglGeneratorApp;
    const map = app.map;
    const stats = app.renderer.getStats();
    const elapsedMs = roundBrowserMs(performance.now() - profileStart.startedAt);
    const generationMs = map.metadata.generationTiming?.totalMs || 0;
    const loadMapMs = stats.loadMap?.totalMs || 0;
    const schedulingRemainderMs = roundBrowserMs(Math.max(0, elapsedMs - generationMs - loadMapMs));
    const failures = [];
    if (enforceThresholds && elapsedMs > maxReadyMs) failures.push(`端到端耗时 ${elapsedMs}ms 超过 ${maxReadyMs}ms`);
    if (enforceThresholds && loadMapMs > maxLoadMapMs) failures.push(`WebGL 加载 ${loadMapMs}ms 超过 ${maxLoadMapMs}ms`);
    if (stats.draw?.glError !== 0) failures.push(`WebGL error expected 0, got ${stats.draw?.glError}`);
    const performanceEvents = stats.performanceEvents || {};
    const eventSampleCounts = Object.fromEntries(Object.entries(performanceEvents).map(([key, value]) => [
      key,
      Math.max(0, Number(value?.sequence || 0) - Number(profileStart.eventSequences?.[key] || 0))
    ]));

    return {
      cells: map.metadata.cellsTarget,
      gridCells: map.metadata.gridCells,
      packCells: map.metadata.packCells,
      checksum: map.summary.checksum,
      elapsedMs,
      generationMs,
      loadMapMs,
      schedulingRemainderMs,
      uiMs: schedulingRemainderMs,
      thresholdsEnforced: enforceThresholds,
      eventSampleCounts,
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
  }, {profileStart, maxReadyMs, maxLoadMapMs, enforceThresholds});
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# WebGL 端到端性能报告", "");
  lines.push(`- 生成时间：${report.metadata.generatedAt}`);
  lines.push(`- seed：\`${report.metadata.seed}\``);
  lines.push(`- 地形模板：\`${report.metadata.template}\``);
  lines.push(`- 地图尺寸：\`${report.metadata.graphWidth} x ${report.metadata.graphHeight}\``);
  lines.push(`- 预热：每个 cells 档位先执行 ${report.metadata.warmupRuns} 次完全相同的生成；预热结果不进入正式 cases`);
  lines.push(`- 阈值守门：${report.metadata.enforceThresholds ? "启用" : "关闭（仍检查 WebGL / console 错误）"}`);
  lines.push(`- 正式事件样本数：\`${JSON.stringify(report.metadata.eventSampleCounts)}\``);
  lines.push(`- 调度残差边界：${report.metadata.timingBoundaries.schedulingRemainderMs}`);
  lines.push(`- WebGL draw 边界：${report.metadata.timingBoundaries.drawMs}`);
  lines.push(`- 观测开销：${report.metadata.timingBoundaries.instrumentation}`);
  lines.push(`- 端到端上限：\`${report.metadata.maxReadyMs}ms\``);
  lines.push(`- WebGL 加载上限：\`${report.metadata.maxLoadMapMs}ms\``);
  lines.push(`- 结论：${report.passed ? "通过" : "失败"}`);
  lines.push("");
  lines.push("## 总览", "");
  lines.push("| 目标 cells | grid cells | pack cells | 点击到出图 | 纯生成 | WebGL 加载 | 调度残差 | 事件 draw/overlay/mesh/upload | 最慢生成阶段 | 最慢加载阶段 | 结果 |");
  lines.push("|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|");
  for (const item of report.cases) {
    const meshEvents = (item.eventSampleCounts.routeMesh || 0) + (item.eventSampleCounts.riverMesh || 0) + (item.eventSampleCounts.selectionMesh || 0);
    lines.push([
      item.cells,
      item.gridCells,
      item.packCells,
      `${item.elapsedMs}ms`,
      `${item.generationMs}ms`,
      `${item.loadMapMs}ms`,
      `${item.schedulingRemainderMs}ms`,
      `${item.eventSampleCounts.draw || 0}/${item.eventSampleCounts.overlay || 0}/${meshEvents}/${item.eventSampleCounts.bufferUpload || 0}`,
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

function aggregateCaseEventSampleCounts(cases) {
  const totals = {};
  for (const item of cases) {
    for (const [key, count] of Object.entries(item.eventSampleCounts || {})) totals[key] = (totals[key] || 0) + Number(count || 0);
  }
  return totals;
}

async function startStaticServer({host, port, publicDir}) {
  const server = createServer((request, response) => {
    const url = new URL(request.url || "/", `http://${host}:${port}`);
    const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const target = resolve(publicDir, `.${normalize(pathname)}`);
    const relativeTarget = relative(publicDir, target);

    if (relativeTarget.startsWith("..") || isAbsolute(relativeTarget)) {
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

function parseWarmupRuns(value, fallback) {
  if (value === undefined) return fallback;
  if (value === true || value === "true") return 1;
  if (value === false || value === "false") return 0;
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : fallback;
}

function parseBoolean(value, fallback) {
  if (value === undefined) return fallback;
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  return fallback;
}

function loadPlaywright(directory) {
  try {
    const requireFromDirectory = createRequire(join(directory, "package.json"));
    return requireFromDirectory("playwright");
  } catch (error) {
    fail(`无法从 ${directory} 加载 Playwright；请用 --playwright-dir 指向含 package.json 与 Playwright 依赖的目录：${error.message}`);
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
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".woff2": "font/woff2"
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
