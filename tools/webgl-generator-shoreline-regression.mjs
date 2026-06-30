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
const port = Number(args.port || 5431);
const timeoutMs = Number(args.timeout || 240000);
const cells = Number(args.cells || 10000);
const seed = String(args.seed || "stage-2-1");
const template = String(args.template || "continents");
const graphWidth = Number(args.width || 1440);
const graphHeight = Number(args.height || 960);
const browserChannel = args["browser-channel"] || args.channel || "chrome";
const distDir = resolve(args.dir || join(rootDir, "dist", "webgl-generator"));
const outPath = resolve(args.out || join(rootDir, "docs", "generated", "reports", "shoreline-regression-results.json"));
const markdownPath = resolve(args.markdown || join(rootDir, "docs", "generated", "reports", "shoreline-regression-results.md"));
const screenshotDir = resolve(args["screenshot-dir"] || join(rootDir, "docs", "generated", "reports", "shoreline-regression"));
const viewport = parseViewport(args.viewport || "1280x820");
const minSmoothLineTriangles = Number(args["min-smooth-line-triangles"] || 50000);
const minHardLineTriangles = Number(args["min-hard-line-triangles"] || 25000);
const maxSwitchMs = Number(args["max-switch-ms"] || 1500);

if (!existsSync(distDir)) fail(`构建产物不存在：${distDir}`);
mkdirSync(dirname(outPath), {recursive: true});
mkdirSync(dirname(markdownPath), {recursive: true});
mkdirSync(screenshotDir, {recursive: true});

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
  const generation = await generateMap(page, {cells, seed, template, graphWidth, graphHeight});

  const cases = [];
  for (const mode of ["height", "states", "provinces"]) {
    cases.push(await collectCase(page, {
      mode,
      smoothCellBorders: true,
      expectedBoundaryLineMode: "visual-cell-shore + butt-join-political",
      minLineTriangles: minSmoothLineTriangles,
      screenshotFile: `${mode}-smooth.png`
    }));
  }
  for (const mode of ["height", "states", "provinces"]) {
    cases.push(await collectCase(page, {
      mode,
      smoothCellBorders: false,
      expectedBoundaryLineMode: "hard-cell-shore + butt-join-political",
      minLineTriangles: minHardLineTriangles,
      screenshotFile: `${mode}-hard.png`
    }));
  }

  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      url: baseUrl,
      distDir,
      seed,
      cells,
      template,
      graphWidth,
      graphHeight,
      viewport,
      browserChannel,
      minSmoothLineTriangles,
      minHardLineTriangles,
      maxSwitchMs,
      consoleErrors
    },
    generation,
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

async function generateMap(page, {cells, seed, template, graphWidth, graphHeight}) {
  await page.waitForSelector("#cells-input", {state: "attached", timeout: timeoutMs});
  const startedAt = await page.evaluate(({cells, seed, template, graphWidth, graphHeight}) => {
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
    expected =>
      window.__webglGeneratorApp?.map?.metadata?.seed === expected.seed &&
      window.__webglGeneratorApp?.map?.metadata?.cellsTarget === expected.cells &&
      window.__webglGeneratorApp?.renderer?.getStats?.()?.draw?.glError === 0,
    {cells, seed},
    {timeout: timeoutMs}
  );

  return page.evaluate(started => {
    const app = window.__webglGeneratorApp;
    const map = app.map;
    return {
      elapsedMs: Math.round((performance.now() - started) * 10) / 10,
      gridCells: map.metadata.gridCells,
      packCells: map.metadata.packCells,
      checksum: map.summary.checksum,
      generatorStage: map.metadata.generatorStage
    };
  }, startedAt);
}

async function collectCase(page, {mode, smoothCellBorders, expectedBoundaryLineMode, minLineTriangles, screenshotFile}) {
  const stats = await page.evaluate(async ({mode, smoothCellBorders}) => {
    const app = window.__webglGeneratorApp;
    const renderer = app.renderer;
    const started = performance.now();
    renderer.setViewOptions({smoothCellBorders});
    renderer.setColorMode(mode);
    renderer.draw();
    renderer.gl.finish();
    await new Promise(resolve => requestAnimationFrame(resolve));
    const switchMs = Math.round((performance.now() - started) * 10) / 10;
    const stats = renderer.getStats();
    return {
      mode,
      smoothCellBorders,
      switchMs,
      cellSurfaceMode: stats.cellSurfaceMode,
      boundaryLineMode: stats.boundaryLineMode,
      vertexCount: stats.vertexCount,
      lineVertexCount: stats.lineVertexCount,
      lineTriangleCount: stats.lineTriangleCount,
      coastlineVisible: stats.layerVisibility.coastline !== false,
      lakeShoreVisible: stats.layerVisibility.lakeShore !== false,
      stateBordersVisible: stats.layerVisibility.stateBorders !== false,
      provinceBordersVisible: stats.layerVisibility.provinceBorders !== false,
      glError: stats.draw.glError,
      drawMs: stats.draw.drawMs
    };
  }, {mode, smoothCellBorders});

  const failures = validateCase(stats, {expectedBoundaryLineMode, minLineTriangles});
  await page.screenshot({path: join(screenshotDir, screenshotFile), fullPage: false});
  return {
    ...stats,
    expectedBoundaryLineMode,
    minLineTriangles,
    screenshotFile,
    failures,
    passed: failures.length === 0
  };
}

function validateCase(stats, {expectedBoundaryLineMode, minLineTriangles}) {
  const failures = [];
  if (stats.glError !== 0) failures.push(`WebGL error expected 0, got ${stats.glError}`);
  if (stats.boundaryLineMode !== expectedBoundaryLineMode) failures.push(`boundaryLineMode expected ${expectedBoundaryLineMode}, got ${stats.boundaryLineMode}`);
  if (stats.lineTriangleCount < minLineTriangles) failures.push(`lineTriangleCount expected >= ${minLineTriangles}, got ${stats.lineTriangleCount}`);
  if (stats.lineVertexCount % 3 !== 0) failures.push(`lineVertexCount should be divisible by 3, got ${stats.lineVertexCount}`);
  if (!stats.coastlineVisible || !stats.lakeShoreVisible) failures.push("coastline/lakeShore layer should stay visible");
  if (stats.vertexCount <= 0) failures.push(`vertexCount should be positive, got ${stats.vertexCount}`);
  if (stats.switchMs > maxSwitchMs) failures.push(`switchMs expected <= ${maxSwitchMs}ms, got ${stats.switchMs}ms`);
  return failures;
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# 水陆线回归报告", "");
  lines.push(`- 生成时间：${report.metadata.generatedAt}`);
  lines.push(`- seed：\`${report.metadata.seed}\``);
  lines.push(`- 目标 cells：\`${report.metadata.cells}\``);
  lines.push(`- 地形模板：\`${report.metadata.template}\``);
  lines.push(`- 单次视图切换上限：\`${report.metadata.maxSwitchMs}ms\``);
  lines.push(`- 结论：${report.passed ? "通过" : "失败"}`);
  lines.push("");
  lines.push("## 生成摘要", "");
  lines.push(`- grid cells：\`${report.generation.gridCells}\``);
  lines.push(`- pack cells：\`${report.generation.packCells}\``);
  lines.push(`- checksum：\`${report.generation.checksum}\``);
  lines.push(`- 生成耗时：\`${report.generation.elapsedMs}ms\``);
  lines.push("");
  lines.push("## 判定结果", "");
  lines.push("| 模式 | 平滑 | 边界线来源 | surface | 切换耗时 | GPU 顶点 | 轮廓三角形 | WebGL error | 截图 | 结果 |");
  lines.push("|---|---:|---|---|---:|---:|---:|---:|---|---|");
  for (const item of report.cases) {
    lines.push([
      item.mode,
      item.smoothCellBorders ? "是" : "否",
      `\`${item.boundaryLineMode}\``,
      item.cellSurfaceMode,
      `${item.switchMs}ms`,
      item.vertexCount,
      item.lineTriangleCount,
      item.glError,
      `\`${item.screenshotFile}\``,
      item.passed ? "通过" : `失败：${item.failures.join("；")}`
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }

  if (report.metadata.consoleErrors.length) {
    lines.push("", "## Console Errors", "");
    for (const error of report.metadata.consoleErrors) lines.push(`- ${error}`);
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function renderFailureSummary(report) {
  const lines = ["水陆线回归失败："];
  for (const item of report.cases) {
    for (const failure of item.failures) lines.push(`- ${item.mode}/${item.smoothCellBorders ? "smooth" : "hard"}: ${failure}`);
  }
  for (const error of report.metadata.consoleErrors) lines.push(`- console error: ${error}`);
  return lines.join("\n");
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
