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
const port = Number(args.port || 5420);
const timeoutMs = Number(args.timeout || 240000);
const cellsList = parseNumberList(args.cells || "50000,100000");
const template = String(args.template || "continents");
const seedPrefix = String(args.seed || "smooth-profile");
const graphWidth = Number(args.width || 1440);
const graphHeight = Number(args.height || 960);
const browserChannel = args["browser-channel"] || args.channel || "chrome";
const distDir = resolve(args.dir || join(rootDir, "dist", "webgl-generator"));
const outPath = resolve(args.out || join(rootDir, "docs", "generated", "reports", "smooth-cell-profile-results.json"));
const markdownPath = resolve(args.markdown || join(rootDir, "docs", "generated", "reports", "smooth-cell-profile-results.md"));
const screenshotDir = resolve(args["screenshot-dir"] || join(rootDir, "docs", "generated", "reports", "smooth-cell-profile"));
const viewport = parseViewport(args.viewport || "1280x820");
const drawIterations = Number(args.iterations || 8);

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
      layers: {}
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
  await installPageHelpers(page);

  const results = [];
  for (const cells of cellsList) {
    const seed = `${seedPrefix}-${cells}`;
    console.log(`Profiling ${cells} cells...`);
    const result = await profileCase(page, {cells, seed, template, graphWidth, graphHeight, drawIterations, screenshotDir});
    results.push(result);
  }

  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      url: baseUrl,
      distDir,
      template,
      graphWidth,
      graphHeight,
      viewport,
      drawIterations,
      browserChannel,
      consoleErrors
    },
    cases: results
  };
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, renderMarkdown(report), "utf8");
  console.log(`Wrote ${outPath}`);
  console.log(`Wrote ${markdownPath}`);
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(resolve => server.close(resolve));
}

async function profileCase(page, options) {
  const generation = await generateMap(page, options);
  const smoothModes = {};
  for (const mode of ["height", "states", "provinces"]) {
    smoothModes[mode] = await collectModeStats(page, {mode, smoothCellBorders: true, drawIterations: options.drawIterations});
    await page.screenshot({
      path: join(options.screenshotDir, `${options.cells}-${mode}-smooth-overview.png`),
      fullPage: false
    });
  }

  const hardProvinces = await collectModeStats(page, {mode: "provinces", smoothCellBorders: false, drawIterations: options.drawIterations});
  await page.screenshot({
    path: join(options.screenshotDir, `${options.cells}-provinces-hard-overview.png`),
    fullPage: false
  });
  await collectModeStats(page, {mode: "height", smoothCellBorders: true, drawIterations: 1});

  const samples = await page.evaluate(() => findSmoothCellProfileSamples());
  const sampleScreenshots = [];
  for (const sample of samples) {
    await page.evaluate(({mode, x, y}) => {
      const app = window.__webglGeneratorApp;
      const renderer = app.renderer;
      renderer.setViewOptions({smoothCellBorders: true});
      renderer.setColorMode(mode);
      const map = app.map;
      const ndcX = (x / map.metadata.graphWidth) * 2 - 1;
      const ndcY = 1 - (y / map.metadata.graphHeight) * 2;
      renderer.camera.scale = 8;
      renderer.camera.offsetX = -ndcX * renderer.camera.scale;
      renderer.camera.offsetY = -ndcY * renderer.camera.scale;
      renderer.markViewportBuffersDirty();
      renderer.draw();
      app.renderer.updateLabels();
    }, sample);
    const smoothFile = `${options.cells}-${sample.kind}-near-smooth.png`;
    await page.screenshot({path: join(options.screenshotDir, smoothFile), fullPage: false});

    await page.evaluate(({mode, x, y}) => {
      const app = window.__webglGeneratorApp;
      const renderer = app.renderer;
      renderer.setViewOptions({smoothCellBorders: false});
      renderer.setColorMode(mode);
      const map = app.map;
      const ndcX = (x / map.metadata.graphWidth) * 2 - 1;
      const ndcY = 1 - (y / map.metadata.graphHeight) * 2;
      renderer.camera.scale = 8;
      renderer.camera.offsetX = -ndcX * renderer.camera.scale;
      renderer.camera.offsetY = -ndcY * renderer.camera.scale;
      renderer.markViewportBuffersDirty();
      renderer.draw();
      app.renderer.updateLabels();
    }, sample);
    const hardFile = `${options.cells}-${sample.kind}-near-hard.png`;
    await page.screenshot({path: join(options.screenshotDir, hardFile), fullPage: false});

    sampleScreenshots.push({...sample, smoothFile, hardFile});
  }

  const anomalySummary = await page.evaluate(() => summarizeSmoothCellProfileRisks());
  return {
    cellsTarget: options.cells,
    seed: options.seed,
    generation,
    smoothModes,
    hardProvinces,
    samples: sampleScreenshots,
    anomalySummary
  };
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
      gridBuildMs: map.grid.metadata.buildMs,
      generatorStage: map.metadata.generatorStage
    };
  }, startedAt);
}

async function collectModeStats(page, {mode, smoothCellBorders, drawIterations}) {
  return page.evaluate(({mode, smoothCellBorders, drawIterations}) => {
    const app = window.__webglGeneratorApp;
    const renderer = app.renderer;
    renderer.setViewOptions({smoothCellBorders});
    renderer.setColorMode(mode);
    const drawSamples = [];
    for (let index = 0; index < drawIterations; index++) {
      const started = performance.now();
      renderer.draw();
      renderer.gl.finish();
      drawSamples.push(Math.round((performance.now() - started) * 10) / 10);
    }
    const stats = renderer.getStats();
    const averageMs = drawSamples.length
      ? Math.round((drawSamples.reduce((sum, value) => sum + value, 0) / drawSamples.length) * 10) / 10
      : 0;
    return {
      mode,
      cellSurfaceMode: stats.cellSurfaceMode,
      boundaryLineMode: stats.boundaryLineMode,
      vertexCount: stats.vertexCount,
      lineVertexCount: stats.lineVertexCount,
      lineTriangleCount: stats.lineTriangleCount,
      routeVertexCount: stats.routeVertexCount,
      riverVertexCount: stats.riverVertexCount,
      pointVertexCount: stats.pointVertexCount,
      draw: {
        lastDrawMs: stats.draw.drawMs,
        samples: drawSamples,
        averageMs,
        maxMs: Math.max(...drawSamples)
      },
      cellVisualMesh: stats.cellVisualMesh,
      shoreVisual: stats.shoreVisual,
      stateVisual: stats.stateVisual,
      provinceVisual: stats.provinceVisual,
      politicalVisualMeshes: stats.politicalVisualMeshes,
      glError: stats.draw.glError
    };
  }, {mode, smoothCellBorders, drawIterations});
}

async function installPageHelpers(page) {
  await page.evaluate(() => {
    window.findSmoothCellProfileSamples = () => {
      const app = window.__webglGeneratorApp;
      const map = app.map;
      const cells = map.grid.cells;
      const features = map.features?.features || [];
      const samples = [];

      const addSample = (kind, mode, pair) => {
        if (!pair) return;
        const point = sharedEdgeMidpoint(map, pair.cell, pair.neighbor) || midpoint(cellCenter(map, pair.cell), cellCenter(map, pair.neighbor));
        if (!point) return;
        samples.push({
          kind,
          mode,
          x: point[0],
          y: point[1],
          cell: pair.cell,
          neighbor: pair.neighbor,
          values: pair.values || null
        });
      };

      addSample("coast", "states", findCellPair(map, (cell, neighbor) => {
        const cellLand = isLand(map, cell);
        const neighborLand = isLand(map, neighbor);
        if (cellLand === neighborLand) return false;
        const waterCell = cellLand ? neighbor : cell;
        return features[cells.f?.[waterCell]]?.type === "ocean";
      }));
      addSample("lake", "height", findCellPair(map, (cell, neighbor) => {
        const cellLand = isLand(map, cell);
        const neighborLand = isLand(map, neighbor);
        if (cellLand === neighborLand) return false;
        const waterCell = cellLand ? neighbor : cell;
        const feature = features[cells.f?.[waterCell]];
        return feature && feature.type !== "ocean";
      }));
      addSample("state-border", "states", findCellPair(map, (cell, neighbor) => {
        if (!isLand(map, cell) || !isLand(map, neighbor)) return false;
        const a = cells.state?.[cell] || 0;
        const b = cells.state?.[neighbor] || 0;
        return a !== b && (a || b) ? {values: [a, b]} : false;
      }));
      addSample("province-border", "provinces", findCellPair(map, (cell, neighbor) => {
        if (!isLand(map, cell) || !isLand(map, neighbor)) return false;
        const a = cells.province?.[cell] || 0;
        const b = cells.province?.[neighbor] || 0;
        return a !== b && a && b ? {values: [a, b]} : false;
      }));
      addSample("state-junction", "states", findJunctionCell(map, "state"));

      return samples;
    };

    window.summarizeSmoothCellProfileRisks = () => {
      const app = window.__webglGeneratorApp;
      const map = app.map;
      const cells = map.grid.cells;
      const vertices = map.grid.vertices.p;
      const edgeLengths = [];
      let invalidPoints = 0;
      let lowAreaCells = 0;
      let maxEdgeLength = 0;

      for (const cell of cells.i || []) {
        const vertexIds = cells.v?.[cell] || [];
        const polygon = vertexIds.map(vertex => vertices[vertex]).filter(Boolean);
        if (polygon.length !== vertexIds.length) invalidPoints += Math.max(1, vertexIds.length - polygon.length);
        const area = Math.abs(polygonArea(polygon));
        if (polygon.length >= 3 && area < 0.5) lowAreaCells++;
        for (const neighbor of cells.c?.[cell] || []) {
          if (neighbor <= cell) continue;
          const edge = sharedEdge(map, cell, neighbor);
          if (!edge) continue;
          const length = distance(edge[0], edge[1]);
          edgeLengths.push(length);
          maxEdgeLength = Math.max(maxEdgeLength, length);
        }
      }

      const averageEdgeLength = edgeLengths.length ? edgeLengths.reduce((sum, value) => sum + value, 0) / edgeLengths.length : 0;
      const shortThreshold = averageEdgeLength * 0.12;
      const longThreshold = averageEdgeLength * 3.5;
      return {
        edgeCount: edgeLengths.length,
        averageEdgeLength: roundLocal(averageEdgeLength),
        maxEdgeLength: roundLocal(maxEdgeLength),
        shortThreshold: roundLocal(shortThreshold),
        longThreshold: roundLocal(longThreshold),
        shortEdges: edgeLengths.filter(length => length > 0 && length < shortThreshold).length,
        longEdges: edgeLengths.filter(length => length > longThreshold).length,
        lowAreaCells,
        invalidPoints
      };
    };

    function findCellPair(map, predicate) {
      const cells = map.grid.cells;
      for (const cell of cells.i || []) {
        for (const neighbor of cells.c?.[cell] || []) {
          if (neighbor <= cell) continue;
          const result = predicate(cell, neighbor);
          if (!result) continue;
          return {cell, neighbor, ...(typeof result === "object" ? result : {})};
        }
      }
      return null;
    }

    function findJunctionCell(map, field) {
      const cells = map.grid.cells;
      for (const cell of cells.i || []) {
        if (!isLand(map, cell)) continue;
        const values = new Set([cells[field]?.[cell] || 0]);
        for (const neighbor of cells.c?.[cell] || []) {
          if (isLand(map, neighbor)) values.add(cells[field]?.[neighbor] || 0);
        }
        values.delete(0);
        if (values.size >= 3) return {cell, neighbor: (cells.c?.[cell] || [])[0] ?? cell, values: [...values]};
      }
      return null;
    }

    function sharedEdgeMidpoint(map, cell, neighbor) {
      const edge = sharedEdge(map, cell, neighbor);
      if (!edge) return null;
      return midpoint(edge[0], edge[1]);
    }

    function sharedEdge(map, cell, neighbor) {
      const ownVertices = map.grid.cells.v?.[cell] || [];
      const neighborVertices = new Set(map.grid.cells.v?.[neighbor] || []);
      const shared = ownVertices.filter(vertex => neighborVertices.has(vertex));
      if (shared.length < 2) return null;
      return [map.grid.vertices.p[shared[0]], map.grid.vertices.p[shared[1]]];
    }

    function cellCenter(map, cell) {
      return map.grid.points[map.grid.cells.p[cell]];
    }

    function isLand(map, cell) {
      return (map.grid.cells.h?.[cell] ?? 0) >= 20;
    }

    function midpoint(a, b) {
      if (!a || !b) return null;
      return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    }

    function distance(a, b) {
      return Math.hypot(a[0] - b[0], a[1] - b[1]);
    }

    function polygonArea(points) {
      let area = 0;
      for (let index = 0; index < points.length; index++) {
        const next = points[(index + 1) % points.length];
        area += points[index][0] * next[1] - next[0] * points[index][1];
      }
      return area / 2;
    }

    function roundLocal(value) {
      return Math.round(value * 10) / 10;
    }
  });
}

function renderMarkdown(report) {
  const lines = [
    "# 平滑单元格边界性能与近景回归",
    "",
    `生成时间：${report.metadata.generatedAt}`,
    "",
    `模板：\`${report.metadata.template}\`；画布：\`${report.metadata.graphWidth} x ${report.metadata.graphHeight}\`；视口：\`${report.metadata.viewport.width} x ${report.metadata.viewport.height}\`；draw 采样：\`${report.metadata.drawIterations}\` 次。`,
    "",
    "## 性能摘要",
    "",
    "| 目标 cells | 实际 grid | pack | 生成+加载 ms | 视图 | surface | 顶点 | 轮廓三角形 | cell 曲线 | cell 点 | cell 构建 ms | draw 平均 ms | draw 最大 ms | WebGL |",
    "|---:|---:|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|"
  ];

  for (const item of report.cases) {
    for (const mode of ["height", "states", "provinces"]) {
      lines.push(modeRow(item, item.smoothModes[mode]));
    }
    lines.push(modeRow(item, item.hardProvinces, "省份硬边界"));
  }

  lines.push("", "## 近景截图", "");
  for (const item of report.cases) {
    lines.push(`### ${item.cellsTarget} cells`, "");
    for (const sample of item.samples) {
      lines.push(`- ${sample.kind}：平滑 \`${sample.smoothFile}\`；硬边界 \`${sample.hardFile}\`，坐标 \`${round(sample.x)}, ${round(sample.y)}\`，模式 \`${sample.mode}\``);
    }
    lines.push("");
  }

  lines.push("## 风险摘要", "");
  for (const item of report.cases) {
    const risk = item.anomalySummary;
    lines.push(`- ${item.cellsTarget} cells：短边 \`${risk.shortEdges}\`，超长边 \`${risk.longEdges}\`，最大边长 \`${risk.maxEdgeLength}\`，平均边长 \`${risk.averageEdgeLength}\`，低面积 cell \`${risk.lowAreaCells}\`，无效点 \`${risk.invalidPoints}\`。`);
  }

  if (report.metadata.consoleErrors.length) {
    lines.push("", "## Console Errors", "");
    for (const error of report.metadata.consoleErrors) lines.push(`- ${error}`);
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function modeRow(item, stats, label = null) {
  const mesh = stats.cellVisualMesh || {};
  return [
    item.cellsTarget,
    item.generation.gridCells,
    item.generation.packCells,
    item.generation.elapsedMs,
    label || stats.mode,
    stats.cellSurfaceMode,
    stats.vertexCount,
    stats.lineTriangleCount ?? Math.round((stats.lineVertexCount || 0) / 3),
    mesh.edgeCurveCount || 0,
    mesh.boundaryPoints || 0,
    mesh.buildMs || 0,
    stats.draw.averageMs,
    stats.draw.maxMs,
    stats.glError
  ].join(" | ").replace(/^/, "| ").replace(/$/, " |");
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
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=");
    parsed[key] = inlineValue ?? argv[++index] ?? true;
  }
  return parsed;
}

function parseNumberList(value) {
  return String(value)
    .split(",")
    .map(item => Number(item.trim()))
    .filter(Number.isFinite);
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

function average(values) {
  if (!values.length) return 0;
  return roundMs(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function roundMs(value) {
  return Math.round(value * 10) / 10;
}
