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
const port = Number(args.port || 5438);
const timeoutMs = Number(args.timeout || 240000);
const cells = Number(args.cells || 10000);
const seed = String(args.seed || "measurement-import-smoke");
const template = String(args.template || "continents");
const graphWidth = Number(args.width || 1440);
const graphHeight = Number(args.height || 960);
const browserChannel = args["browser-channel"] || args.channel || "chrome";
const distDir = resolve(args.dir || join(rootDir, "dist", "webgl-generator"));
const outPath = resolve(args.out || join(rootDir, "docs", "generated", "reports", "measurement-import-regression-results.json"));
const markdownPath = resolve(args.markdown || join(rootDir, "docs", "generated", "reports", "measurement-import-regression-results.md"));
const viewport = parseViewport(args.viewport || "1280x820");

if (!existsSync(distDir)) fail(`构建产物不存在：${distDir}`);
mkdirSync(dirname(outPath), {recursive: true});
mkdirSync(dirname(markdownPath), {recursive: true});

const playwright = await loadPlaywright(sourceDir);
const server = await startStaticServer({host, port, publicDir: distDir});
let browser = null;

try {
  browser = await launchBrowser(playwright, {headless: !args.headful, browserChannel});
  const context = await browser.newContext({viewport, deviceScaleFactor: 1, acceptDownloads: true});
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
        provinceBorders: true,
        routes: true,
        measurements: true
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
  const before = await createMeasurementFixtures(page);
  const exported = await exportFullMap(page);
  const imported = await importFullMap(page, exported.path, before);

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
      consoleErrors
    },
    generation,
    before,
    exported: {
      suggestedFilename: exported.suggestedFilename,
      bytes: exported.bytes,
      measurementCount: exported.documentMeasurementCount,
      routeFitValues: exported.documentRouteFitValues
    },
    imported,
    passed: !consoleErrors.length && imported.passed && exported.documentMeasurementCount === before.items.length
  };

  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(markdownPath, renderMarkdown(report));
  console.log(`Wrote ${outPath}`);
  console.log(`Wrote ${markdownPath}`);
  if (!report.passed) fail(renderFailureSummary(report));
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(resolveClose => server.close(resolveClose));
}

async function generateMap(page, {cells, seed, template, graphWidth, graphHeight}) {
  await page.waitForSelector("#cells-input", {state: "attached", timeout: timeoutMs});
  const startedAt = await page.evaluate(({cells, seed, template, graphWidth, graphHeight}) => {
    window.__measurementImportPreviousMap = window.__webglGeneratorApp?.map || null;
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
        app.map !== window.__measurementImportPreviousMap &&
        app.map.metadata?.seed === expected.seed &&
        app.map.metadata?.cellsTarget === expected.cells &&
        app.renderer?.getStats?.()?.draw?.glError === 0 &&
        loading?.hidden === true;
    },
    {cells, seed},
    {timeout: timeoutMs}
  );

  return page.evaluate(startedAt => {
    const app = window.__webglGeneratorApp;
    const stats = app.renderer.getStats();
    return {
      elapsedMs: roundBrowserMs(performance.now() - startedAt),
      generationMs: roundBrowserMs(app.map.metadata.generationTiming?.totalMs || 0),
      loadMapMs: roundBrowserMs(stats.loadMap?.totalMs || 0),
      routeCount: app.map.settlements?.routes?.length || 0,
      glError: stats.draw?.glError || 0
    };

    function roundBrowserMs(value) {
      return Math.round(Number(value || 0) * 10) / 10;
    }
  }, startedAt);
}

async function createMeasurementFixtures(page) {
  await page.locator("#toggle-measurement").click();
  await page.locator("#measurement-route-fit").click();
  const routeTargets = await pickRouteTargets(page);
  await page.mouse.click(routeTargets.first.clientX, routeTargets.first.clientY);
  await page.mouse.click(routeTargets.second.clientX, routeTargets.second.clientY);
  await page.locator("#measurement-save").click();
  await page.waitForFunction(() => window.__webglGeneratorApp?.map?.measurements?.items?.some(item => item.routeFit === "roads"), null, {timeout: timeoutMs});

  await page.locator("#measurement-route-fit").click();
  const freeTargets = await pickFreeTargets(page);
  await page.mouse.click(freeTargets.first.clientX, freeTargets.first.clientY);
  await page.mouse.click(freeTargets.second.clientX, freeTargets.second.clientY);
  await page.locator("#measurement-save").click();
  await page.waitForFunction(() => window.__webglGeneratorApp?.map?.measurements?.items?.filter(item => item.points?.length >= 2).length >= 2, null, {timeout: timeoutMs});

  return page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const items = app.map.measurements.items.map(item => ({
      id: item.id,
      name: item.name,
      type: item.type,
      routeFit: item.routeFit,
      pointCount: item.points.length,
      points: item.points.map(point => ({x: point.x, y: point.y})),
      summary: item.summary
    }));
    return {
      items,
      metadata: app.map.measurements.metadata,
      objectPathCount: document.querySelectorAll(".measurement-object-path").length,
      objectAreaCount: document.querySelectorAll(".measurement-object-area").length,
      glError: app.renderer.getStats().draw?.glError || 0
    };
  });
}

async function pickRouteTargets(page) {
  return page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const canvas = document.getElementById("map-canvas");
    const rect = canvas.getBoundingClientRect();
    const routes = app.map.settlements.routes.filter(route => route.points?.length >= 2);
    const route = routes.find(item => item.points.length >= 3) || routes[0];
    if (!route) throw new Error("当前地图没有可用于测量贴合的路线");
    const pointOnSegment = index => {
      const a = route.points[index];
      const b = route.points[index + 1];
      const world = {x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2};
      const screen = app.renderer.worldToScreen(world.x, world.y, rect);
      return {world, clientX: rect.left + screen.x, clientY: rect.top + screen.y};
    };
    return {
      routeId: route.id,
      first: pointOnSegment(0),
      second: pointOnSegment(Math.min(1, route.points.length - 2))
    };
  });
}

async function pickFreeTargets(page) {
  return page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const canvas = document.getElementById("map-canvas");
    const rect = canvas.getBoundingClientRect();
    const worldPoints = [
      {x: app.map.metadata.graphWidth * 0.28, y: app.map.metadata.graphHeight * 0.72},
      {x: app.map.metadata.graphWidth * 0.36, y: app.map.metadata.graphHeight * 0.77},
      {x: app.map.metadata.graphWidth * 0.44, y: app.map.metadata.graphHeight * 0.7}
    ];
    const visible = worldPoints.map(world => {
      const screen = app.renderer.worldToScreen(world.x, world.y, rect);
      return {world, clientX: rect.left + screen.x, clientY: rect.top + screen.y};
    }).filter(target => {
      const element = document.elementFromPoint(target.clientX, target.clientY);
      return element?.id === "map-canvas";
    });
    if (visible.length < 2) throw new Error("无法找到两个可点击的自由测量点");
    return {first: visible[0], second: visible[1]};
  });
}

async function exportFullMap(page) {
  const downloadPromise = page.waitForEvent("download", {timeout: timeoutMs});
  await page.evaluate(() => {
    const button = document.getElementById("export-map-data");
    if (!button) throw new Error("找不到地图数据导出按钮");
    button.click();
  });
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error("地图数据下载没有返回临时文件路径");
  const text = await readDownloadedText(download);
  const document = JSON.parse(text);
  return {
    path,
    suggestedFilename: download.suggestedFilename(),
    bytes: Buffer.byteLength(text),
    documentMeasurementCount: document.map?.measurements?.items?.length || 0,
    documentRouteFitValues: (document.map?.measurements?.items || []).map(item => item.routeFit || "none")
  };
}

async function importFullMap(page, filePath, before) {
  const previousChecksum = await page.evaluate(() => window.__webglGeneratorApp?.map?.summary?.checksum || "");
  await page.locator("#import-map-file").setInputFiles(filePath);
  await page.waitForFunction(
    expected => {
      const app = window.__webglGeneratorApp;
      const loading = document.getElementById("generation-loading");
      return app?.map?.measurements?.items?.length === expected.count &&
        app.map.summary?.checksum === expected.checksum &&
        app.renderer?.getStats?.()?.draw?.glError === 0 &&
        loading?.hidden === true;
    },
    {count: before.items.length, checksum: previousChecksum},
    {timeout: timeoutMs}
  );
  await page.evaluate(() => {
    const button = document.getElementById("open-measurement-panel");
    if (!button) throw new Error("找不到测量对象面板按钮");
    button.click();
  });
  await page.waitForFunction(() => document.querySelector(".measurement-panel-details")?.textContent?.includes("模式"), null, {timeout: timeoutMs});

  return page.evaluate(before => {
    const app = window.__webglGeneratorApp;
    const items = app.map.measurements.items.map(item => ({
      id: item.id,
      name: item.name,
      type: item.type,
      routeFit: item.routeFit,
      pointCount: item.points.length,
      points: item.points.map(point => ({x: point.x, y: point.y})),
      summary: item.summary
    }));
    const failures = [];
    if (items.length !== before.items.length) failures.push(`测量对象数量 ${items.length} != ${before.items.length}`);
    for (let index = 0; index < before.items.length; index += 1) {
      const expected = before.items[index];
      const actual = items[index];
      if (!actual) continue;
      if (actual.routeFit !== expected.routeFit) failures.push(`${actual.id} routeFit ${actual.routeFit} != ${expected.routeFit}`);
      if (actual.pointCount !== expected.pointCount) failures.push(`${actual.id} pointCount ${actual.pointCount} != ${expected.pointCount}`);
      if (!samePoints(actual.points, expected.points)) failures.push(`${actual.id} 点列不一致`);
    }
    const overlayPaths = document.querySelectorAll(".measurement-object-path").length;
    if (overlayPaths < before.items.length) failures.push(`测量 overlay 路径 ${overlayPaths} < ${before.items.length}`);
    const routeFitValues = new Set(items.map(item => item.routeFit));
    if (!routeFitValues.has("roads") || !routeFitValues.has("none")) failures.push(`导入后测量模式不完整：${[...routeFitValues].join(" / ")}`);
    const panelText = document.querySelector('[data-panel-id="measurement-panel"]')?.textContent || "";
    if (!panelText.includes("模式") || !panelText.includes("贴路")) failures.push("测量面板未显示模式字段或贴路状态");
    const glError = app.renderer.getStats().draw?.glError || 0;
    if (glError) failures.push(`WebGL error ${glError}`);
    return {
      items,
      metadata: app.map.measurements.metadata,
      overlayPaths,
      glError,
      failures,
      passed: failures.length === 0
    };

    function samePoints(a, b) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      return a.every((point, index) => Math.abs(point.x - b[index].x) < 0.001 && Math.abs(point.y - b[index].y) < 0.001);
    }
  }, before);
}

async function readDownloadedText(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# 测量对象导入回归报告", "");
  lines.push(`- 生成时间：${report.metadata.generatedAt}`);
  lines.push(`- seed：\`${report.metadata.seed}\``);
  lines.push(`- 地形模板：\`${report.metadata.template}\``);
  lines.push(`- 目标 cells：\`${report.metadata.cells}\``);
  lines.push(`- 结论：${report.passed ? "通过" : "失败"}`);
  lines.push("");
  lines.push("## 摘要", "");
  lines.push(`- 初始测量对象：${report.before.items.length}`);
  lines.push(`- 导出文件：${report.exported.suggestedFilename}，${report.exported.bytes} bytes`);
  lines.push(`- 导出测量对象：${report.exported.measurementCount}`);
  lines.push(`- 导出 routeFit：${report.exported.routeFitValues.join(" / ") || "none"}`);
  lines.push(`- 导入后 overlay 路径：${report.imported.overlayPaths}`);
  lines.push(`- WebGL error：${report.imported.glError}`);
  lines.push("");
  lines.push("## 性能", "");
  lines.push(`- 点击到出图：${report.generation.elapsedMs}ms`);
  lines.push(`- 纯生成：${report.generation.generationMs}ms`);
  lines.push(`- WebGL 加载：${report.generation.loadMapMs}ms`);
  lines.push(`- 路线数：${report.generation.routeCount}`);
  if (report.imported.failures.length) {
    lines.push("", "## 失败项", "");
    for (const failure of report.imported.failures) lines.push(`- ${failure}`);
  }
  if (report.metadata.consoleErrors.length) {
    lines.push("", "## Console Errors", "");
    for (const error of report.metadata.consoleErrors) lines.push(`- ${error}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function renderFailureSummary(report) {
  const lines = ["测量对象导入回归失败："];
  for (const failure of report.imported.failures) lines.push(`- ${failure}`);
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
  return {
    width: Number.isFinite(width) ? width : 1280,
    height: Number.isFinite(height) ? height : 820
  };
}

function getContentType(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html;charset=utf-8";
  if (ext === ".js") return "text/javascript;charset=utf-8";
  if (ext === ".css") return "text/css;charset=utf-8";
  if (ext === ".json") return "application/json;charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

async function loadPlaywright(sourceDirectory) {
  const requireFromSource = createRequire(join(sourceDirectory, "package.json"));
  try {
    return requireFromSource("playwright");
  } catch (error) {
    fail(`无法加载 Playwright，请先在 source/Fantasy-Map-Generator 安装依赖：${error.message}`);
  }
}

async function launchBrowser(playwright, {headless, browserChannel}) {
  try {
    return await playwright.chromium.launch({headless, channel: browserChannel});
  } catch (error) {
    fail(`无法启动 Chromium channel=${browserChannel}：${error.message}`);
  }
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
