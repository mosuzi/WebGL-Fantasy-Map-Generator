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
const port = Number(args.port || 5440);
const timeoutMs = Number(args.timeout || 240000);
const cells = Number(args.cells || 10000);
const seed = String(args.seed || "geo-import-smoke");
const template = String(args.template || "continents");
const graphWidth = Number(args.width || 1440);
const graphHeight = Number(args.height || 960);
const browserChannel = args["browser-channel"] || args.channel || "chrome";
const distDir = resolve(args.dir || join(rootDir, "dist", "webgl-generator"));
const outPath = resolve(args.out || join(rootDir, "docs", "generated", "reports", "geo-import-regression-results.json"));
const markdownPath = resolve(args.markdown || join(rootDir, "docs", "generated", "reports", "geo-import-regression-results.md"));
const fixturePath = resolve(args.fixture || join(rootDir, "docs", "generated", "reports", "geo-import-fixture.geojson"));
const viewport = parseViewport(args.viewport || "1280x820");

if (!existsSync(distDir)) fail(`构建产物不存在：${distDir}`);
mkdirSync(dirname(outPath), {recursive: true});
mkdirSync(dirname(markdownPath), {recursive: true});
mkdirSync(dirname(fixturePath), {recursive: true});

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
        provinceBorders: true,
        measurements: false
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
  const fixture = await createGeoJsonFixture(page);
  writeFileSync(fixturePath, `${JSON.stringify(fixture.geoJson, null, 2)}\n`, "utf8");
  const importControl = await inspectGeoImportControl(page);
  const imported = await importGeoFixture(page, fixturePath, fixture.expected);

  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      url: baseUrl,
      distDir,
      fixturePath,
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
    fixture: {
      featureCount: fixture.geoJson.features.length,
      expectedTypes: fixture.expected.map(item => item.type)
    },
    importControl,
    imported,
    passed: !consoleErrors.length && importControl.passed && imported.passed
  };

  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, renderMarkdown(report), "utf8");
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
    window.__geoImportPreviousMap = window.__webglGeneratorApp?.map || null;
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
        app.map !== window.__geoImportPreviousMap &&
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
      glError: stats.draw?.glError || 0
    };

    function roundBrowserMs(value) {
      return Math.round(Number(value || 0) * 10) / 10;
    }
  }, startedAt);
}

async function createGeoJsonFixture(page) {
  return page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const map = app.map;
    const width = Number(map.metadata?.graphWidth) || Number(map.options?.graphWidth) || 1;
    const height = Number(map.metadata?.graphHeight) || Number(map.options?.graphHeight) || 1;
    const coordinates = map.mapCoordinates || {};
    const lonW = Number.isFinite(Number(coordinates.lonW)) ? Number(coordinates.lonW) : 0;
    const lonE = Number.isFinite(Number(coordinates.lonE)) ? Number(coordinates.lonE) : width;
    const latN = Number.isFinite(Number(coordinates.latN)) ? Number(coordinates.latN) : 0;
    const latS = Number.isFinite(Number(coordinates.latS)) ? Number(coordinates.latS) : height;
    const worldPoint = (xRatio, yRatio) => ({
      x: round(width * xRatio),
      y: round(height * yRatio)
    });
    const project = point => [
      round(lonW + point.x / width * (lonE - lonW)),
      round(latN + point.y / height * (latS - latN))
    ];
    const point = worldPoint(0.36, 0.34);
    const line = [worldPoint(0.42, 0.42), worldPoint(0.48, 0.46), worldPoint(0.56, 0.43)];
    const polygon = [worldPoint(0.58, 0.62), worldPoint(0.68, 0.61), worldPoint(0.66, 0.72), worldPoint(0.57, 0.7)];
    const polygonRing = [...polygon, polygon[0]];
    return {
      geoJson: {
        type: "FeatureCollection",
        name: "geo-import-regression",
        features: [
          {
            type: "Feature",
            id: "fixture-point",
            properties: {name: "导入点"},
            geometry: {type: "Point", coordinates: project(point)}
          },
          {
            type: "Feature",
            id: "fixture-line",
            properties: {name: "导入线"},
            geometry: {type: "LineString", coordinates: line.map(project)}
          },
          {
            type: "Feature",
            id: "fixture-polygon",
            properties: {name: "导入面"},
            geometry: {type: "Polygon", coordinates: [polygonRing.map(project)]}
          }
        ]
      },
      expected: [
        {name: "导入点", type: "point", points: [point]},
        {name: "导入线", type: "polyline", points: line},
        {name: "导入面", type: "polygon", points: polygon}
      ]
    };

    function round(value) {
      return Math.round(Number(value || 0) * 1000) / 1000;
    }
  });
}

async function importGeoFixture(page, filePath, expected) {
  await page.locator("#import-geo-file").setInputFiles(filePath);
  await page.waitForFunction(
    expectedCount => {
      const app = window.__webglGeneratorApp;
      return app?.map?.measurements?.items?.length >= expectedCount &&
        document.getElementById("file-operation-status")?.textContent?.includes("GEO 数据已导入为") &&
        document.querySelectorAll(".measurement-object-point").length >= 1 &&
        document.querySelectorAll(".measurement-object-path").length >= 1 &&
        document.querySelectorAll(".measurement-object-area").length >= 1 &&
        app.renderer?.getStats?.()?.draw?.glError === 0;
    },
    expected.length,
    {timeout: timeoutMs}
  );

  return page.evaluate(expected => {
    const app = window.__webglGeneratorApp;
    const items = app.map.measurements.items.map(item => ({
      id: item.id,
      name: item.name,
      type: item.type,
      pointCount: item.points?.length || 0,
      points: (item.points || []).map(point => ({x: point.x, y: point.y})),
      routeFit: item.routeFit,
      closed: item.closed,
      summary: item.summary
    }));
    const failures = [];
    if (items.length < expected.length) failures.push(`导入对象数量 ${items.length} < ${expected.length}`);
    for (const target of expected) {
      const item = items.find(candidate => candidate.name === target.name);
      if (!item) {
        failures.push(`缺少导入对象：${target.name}`);
        continue;
      }
      if (item.type !== target.type) failures.push(`${target.name} 类型 ${item.type} != ${target.type}`);
      if (!samePoints(item.points, target.points)) failures.push(`${target.name} 坐标未按当前地图坐标反投影`);
      if (item.routeFit !== "none") failures.push(`${target.name} routeFit 应为 none，实际 ${item.routeFit}`);
    }
    const pointCount = document.querySelectorAll(".measurement-object-point").length;
    const pathCount = document.querySelectorAll(".measurement-object-path").length;
    const areaCount = document.querySelectorAll(".measurement-object-area").length;
    const status = document.getElementById("file-operation-status")?.textContent || "";
    const measurementLayerVisible = app.renderer?.layerVisibility?.measurements !== false;
    const glError = app.renderer.getStats().draw?.glError || 0;
    if (pointCount < 1) failures.push("未绘制导入点");
    if (pathCount < 1) failures.push("未绘制导入线");
    if (areaCount < 1) failures.push("未绘制导入面");
    if (!measurementLayerVisible) failures.push("导入后测量图层未自动显示");
    if (!status.includes(`GEO 数据已导入为 ${expected.length} 个测量对象`)) failures.push(`状态栏文本异常：${status}`);
    if (glError) failures.push(`WebGL error ${glError}`);
    return {
      items,
      pointCount,
      pathCount,
      areaCount,
      status,
      measurementLayerVisible,
      glError,
      failures,
      passed: failures.length === 0
    };

    function samePoints(a, b) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      return a.every((point, index) => Math.abs(point.x - b[index].x) < 0.001 && Math.abs(point.y - b[index].y) < 0.001);
    }
  }, expected);
}

async function inspectGeoImportControl(page) {
  return page.evaluate(() => {
    const label = Array.from(document.querySelectorAll(".file-import-action"))
      .find(element => element.textContent?.includes("导入 GEO 数据"));
    const input = label?.querySelector('input[type="file"]') || null;
    const failures = [];
    if (!label) failures.push("缺少导入 GEO 数据控件");
    if (!input) failures.push("导入 GEO 数据控件内没有原生 file input");
    if (input?.hidden || input?.hasAttribute("hidden")) failures.push("GEO file input 不应使用 hidden 属性");
    if (input?.id !== "import-geo-file") failures.push(`GEO file input id 异常：${input?.id || "none"}`);
    if (input && !String(input.accept || "").includes(".geojson")) failures.push(`GEO file input accept 异常：${input.accept || "none"}`);
    return {
      text: label?.textContent?.trim() || "",
      hasNativeInput: Boolean(input),
      inputId: input?.id || "",
      accept: input?.accept || "",
      hiddenAttribute: Boolean(input?.hidden || input?.hasAttribute("hidden")),
      failures,
      passed: failures.length === 0
    };
  });
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# GEO 数据导入回归报告", "");
  lines.push(`- 生成时间：${report.metadata.generatedAt}`);
  lines.push(`- seed：\`${report.metadata.seed}\``);
  lines.push(`- 地形模板：\`${report.metadata.template}\``);
  lines.push(`- 目标 cells：\`${report.metadata.cells}\``);
  lines.push(`- 结论：${report.passed ? "通过" : "失败"}`);
  lines.push("");
  lines.push("## 摘要", "");
  lines.push(`- fixture Feature：${report.fixture.featureCount}`);
  lines.push(`- 期望类型：${report.fixture.expectedTypes.join(" / ")}`);
  lines.push(`- 导入控件：${report.importControl.passed ? "原生 file input" : "异常"}`);
  lines.push(`- 导入对象：${report.imported.items.length}`);
  lines.push(`- overlay：点 ${report.imported.pointCount}，线 ${report.imported.pathCount}，面 ${report.imported.areaCount}`);
  lines.push(`- 测量图层：${report.imported.measurementLayerVisible ? "已显示" : "未显示"}`);
  lines.push(`- 状态栏：${report.imported.status}`);
  lines.push(`- WebGL error：${report.imported.glError}`);
  lines.push("");
  lines.push("## 性能", "");
  lines.push(`- 点击到出图：${report.generation.elapsedMs}ms`);
  lines.push(`- 纯生成：${report.generation.generationMs}ms`);
  lines.push(`- WebGL 加载：${report.generation.loadMapMs}ms`);
  const failures = [...report.importControl.failures, ...report.imported.failures];
  if (failures.length) {
    lines.push("", "## 失败项", "");
    for (const failure of failures) lines.push(`- ${failure}`);
  }
  if (report.metadata.consoleErrors.length) {
    lines.push("", "## Console Errors", "");
    for (const error of report.metadata.consoleErrors) lines.push(`- ${error}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function renderFailureSummary(report) {
  const lines = ["GEO 数据导入回归失败："];
  for (const failure of report.importControl.failures) lines.push(`- ${failure}`);
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
  if (ext === ".json" || ext === ".geojson") return "application/json;charset=utf-8";
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
