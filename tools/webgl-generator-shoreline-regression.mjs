#!/usr/bin/env node
import assert from "node:assert/strict";
import {createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {
  SHORE_TOPOLOGY_ALGORITHM,
  SHORE_TOPOLOGY_GATES,
  buildShoreArcSnapshot,
  buildShoreTopologySnapshot,
  maxShoreDisplacement,
  transformRecommendedShoreArc
} from "../app/webgl-generator/src/renderer/coastline-topology.js";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {
  buildCellVisualMesh,
  countCellVisualFanLeaks,
  countCellVisualTriangulationLeaks,
  triangulateCellVisualBoundary
} from "../app/webgl-generator/src/renderer/cell-visual-layer.js";
import {resolvedGridVertexPoints} from "../app/webgl-generator/src/renderer/grid-vertex-geometry.js";
import {
  buildShoreRenderPoints,
  buildShoreSurfaceCorrectionTriangles,
  buildShoreVisualPaths,
  inspectShoreBandTriangleGeometry,
  SHORE_VISUAL_STYLE,
  shoreCorrectionTriangleAltitude,
  shouldCullShoreSurfaceNeedle
} from "../app/webgl-generator/src/renderer/shore-layer.js";

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
const minSmoothLineTriangles = Number(args["min-smooth-line-triangles"] || 30000);
const minHardLineTriangles = Number(args["min-hard-line-triangles"] || 25000);
const maxSwitchMs = Number(args["max-switch-ms"] || 1500);
const maxShoreCacheMs = Number(args["max-shore-cache-ms"] || 1400);

if (args.pure) {
  runPureRegression();
  process.exit(0);
}

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
  const healthSignals = [];
  page.on("console", message => {
    if (message.type() !== "error") return;
    if (message.text().startsWith("[FMG health]")) healthSignals.push(message.text());
    else consoleErrors.push(message.text());
  });
  page.on("pageerror", error => consoleErrors.push(error.message));

  const baseUrl = `http://${host}:${port}`;
  await page.goto(baseUrl, {waitUntil: "domcontentloaded", timeout: timeoutMs});
  await page.waitForFunction(() => window.__webglGeneratorApp?.renderer?.getStats?.()?.webgl2, null, {timeout: timeoutMs});
  await page.waitForFunction(() => {
    const loading = document.getElementById("app-loading-screen");
    return Boolean(window.__webglGeneratorApp?.map) && loading?.hidden === true;
  }, null, {timeout: timeoutMs});
  const generation = await generateMap(page, {cells, seed, template, graphWidth, graphHeight});

  const cases = [];
  for (const mode of ["height", "states", "provinces"]) {
    cases.push(await collectCase(page, {
      mode,
      smoothCellBorders: true,
      expectedBoundaryLineMode: "shore-topology-snapshot + butt-join-political",
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
      maxShoreCacheMs,
      healthSignals,
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
  const reusable = await page.evaluate(expected => {
    const map = window.__webglGeneratorApp?.map;
    return map?.metadata?.seed === expected.seed &&
      map?.metadata?.cellsTarget === expected.cells &&
      map?.options?.heightmapTemplate === expected.template &&
      map?.metadata?.graphWidth === expected.graphWidth &&
      map?.metadata?.graphHeight === expected.graphHeight;
  }, {cells, seed, template, graphWidth, graphHeight});
  if (reusable) {
    return page.evaluate(() => {
      const map = window.__webglGeneratorApp.map;
      return {
        elapsedMs: 0,
        reusedInitialMap: true,
        gridCells: map.metadata.gridCells,
        packCells: map.metadata.packCells,
        checksum: map.summary.checksum,
        generatorStage: map.metadata.generatorStage
      };
    });
  }

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
      cellVisualMesh: stats.cellVisualMesh || null,
      coastlineVisible: stats.layerVisibility.coastline !== false,
      lakeShoreVisible: stats.layerVisibility.lakeShore !== false,
      stateBordersVisible: stats.layerVisibility.stateBorders !== false,
      provinceBordersVisible: stats.layerVisibility.provinceBorders !== false,
      shoreTopology: stats.shoreVisual?.topology || null,
      loadingState: document.getElementById("app-loading-screen")?.dataset?.state || null,
      loadingHidden: document.getElementById("app-loading-screen")?.hidden === true,
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
  if (stats.loadingState === "error" || !stats.loadingHidden) failures.push(`loading screen should stay hidden and non-error, got ${stats.loadingState}/${stats.loadingHidden}`);
  if (stats.smoothCellBorders) {
    if (stats.cellVisualMesh?.triangulationMode !== "earcut-boundary") {
      failures.push(`cell triangulation expected earcut-boundary, got ${stats.cellVisualMesh?.triangulationMode}`);
    }
    if (stats.cellVisualMesh?.triangulationFallbackCells !== 0) {
      failures.push(`cell triangulation fallback expected 0, got ${stats.cellVisualMesh?.triangulationFallbackCells}`);
    }
    if (stats.shoreTopology?.algorithmId !== SHORE_TOPOLOGY_ALGORITHM.id) failures.push(`shore topology algorithm expected ${SHORE_TOPOLOGY_ALGORITHM.id}`);
    if (stats.shoreTopology?.immutable !== true) failures.push("shore topology snapshot should be immutable");
    if (
      stats.shoreTopology?.renderSource !== "snapshot.renderPoints" ||
      stats.shoreTopology?.surfaceAndStrokeShared !== true ||
      stats.shoreTopology?.surfaceCorrection !== "raw-snapshot-xor-triangulation"
    ) failures.push("shore surface/stroke should share snapshot.renderPoints through XOR triangulation");
    if (!Number.isFinite(stats.shoreTopology?.buildMs)) failures.push("shore topology buildMs should be finite");
    if (!(stats.shoreTopology?.arcCount > 0)) failures.push("shore topology arcCount should be positive");
    if (!(stats.shoreTopology?.smoothedArcCount > 0)) failures.push("shore topology should smooth at least one arc");
    if (stats.shoreTopology?.smoothedArcCount + stats.shoreTopology?.unchangedArcCount + stats.shoreTopology?.fallbackArcCount !== stats.shoreTopology?.arcCount) {
      failures.push("shore topology smoothed/unchanged/fallback counts should cover all arcs");
    }
    if (!(stats.shoreTopology?.smoothedLengthRatio >= 0.6)) {
      failures.push(`shore topology smoothedLengthRatio expected >= 0.6, got ${stats.shoreTopology?.smoothedLengthRatio}`);
    }
    if (!(stats.shoreTopology?.maxVisibleDisplacementWorld >= 5)) {
      failures.push(`shore topology maxVisibleDisplacementWorld expected >= 5, got ${stats.shoreTopology?.maxVisibleDisplacementWorld}`);
    }
    if (stats.shoreTopology?.smoothedSourceSegmentCount > stats.shoreTopology?.eligibleSourceSegmentCount ||
      stats.shoreTopology?.smoothedLengthRatio > stats.shoreTopology?.eligibleLengthRatio + 0.0001) {
      failures.push("shore topology actual smoothing must stay within the eligible safety coverage");
    }
    if (!(stats.shoreTopology?.buildMs >= 0) || stats.shoreTopology.buildMs > maxShoreCacheMs) {
      failures.push(`shore topology buildMs expected <= ${maxShoreCacheMs}ms, got ${stats.shoreTopology?.buildMs}`);
    }
  }
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
  lines.push("| 模式 | 平滑 | 边界线来源 | surface | cell 三角化 | 回退 cell | 切换耗时 | GPU 顶点 | 轮廓三角形 | WebGL error | 截图 | 结果 |");
  lines.push("|---|---:|---|---|---|---:|---:|---:|---:|---:|---|---|");
  for (const item of report.cases) {
    lines.push([
      item.mode,
      item.smoothCellBorders ? "是" : "否",
      `\`${item.boundaryLineMode}\``,
      item.cellSurfaceMode,
      item.cellVisualMesh?.triangulationMode || "—",
      item.cellVisualMesh?.triangulationFallbackCells ?? "—",
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
  if (report.metadata.healthSignals.length) {
    lines.push("", "## 健康监测信号", "");
    for (const signal of report.metadata.healthSignals) lines.push(`- ${signal}`);
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

function runPureRegression() {
  const openPath = {
    points: [[0, 0], [2, 0.2], [4, -0.1], [6, 0.3], [8, 0]],
    sideVectors: Array.from({length: 5}, () => ({x: 0, y: 1})),
    landCells: [1, 1, 1, 1, 1],
    waterCells: [2, 2, 2, 2, 2]
  };
  const original = structuredClone(openPath);
  const snapshot = buildShoreTopologySnapshot([openPath], null, {isSideSampleSafe: () => true});
  assert.deepEqual(openPath, original, "构建 snapshot 不得改写输入 path");
  assert.ok(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.paths) && Object.isFrozen(snapshot.paths[0].renderPoints), "snapshot 和 renderPoints 必须冻结");
  assert.equal(snapshot.stats.algorithmId, SHORE_TOPOLOGY_ALGORITHM.id, "必须使用正式推荐算法标识");
  assert.deepEqual(
    [snapshot.stats.threshold, snapshot.stats.smoothness, snapshot.stats.iterations, snapshot.stats.maxDisplacement],
    [6, 0.25, 2, 18],
    "推荐算法默认参数必须保持 6 / 0.25 / 2 / 18"
  );
  assert.ok(
    SHORE_TOPOLOGY_GATES.protectedDistanceWorld >= SHORE_TOPOLOGY_ALGORITHM.maxDisplacement,
    "沿岸对象保护搜索半径不得小于允许的最大海岸位移"
  );
  assert.deepEqual(snapshot.paths[0].renderPoints[0], openPath.points[0], "开放 arc 起点必须锁定");
  assert.deepEqual(snapshot.paths[0].renderPoints.at(-1), openPath.points.at(-1), "开放 arc 终点必须锁定");

  const closed = [[0, 0], [8, 0], [9, 6], [4, 9], [-1, 5], [0, 0]];
  const closedRender = transformRecommendedShoreArc(closed);
  assert.deepEqual(closedRender[0], closed[0], "闭环锚点必须锁定");
  assert.deepEqual(closedRender.at(-1), closed[0], "闭环终点必须锁回锚点");

  const displacedSource = [[0, 0], [4, 0.2], [8, -0.2], [12, 0]];
  const displacedRender = transformRecommendedShoreArc(displacedSource, {threshold: 0, smoothness: 0.04, maxDisplacement: 0.5});
  assert.ok(maxShoreDisplacement(displacedRender, displacedSource) <= 0.500001, "最大位移门禁失效");

  const removedPeakPath = {
    points: [[0, 0], [0.1, 24], [0.2, 0]],
    sideVectors: [{x: 0, y: 1}, {x: 0, y: 1}, {x: 0, y: 1}],
    landCells: [1, 1, 1],
    waterCells: [2, 2, 2]
  };
  const removedPeakRender = transformRecommendedShoreArc(removedPeakPath.points);
  assert.deepEqual(removedPeakRender, [[0, 0], [0.2, 0]], "固定反例必须由 Visvalingam 删除高尖峰");
  assert.ok(maxShoreDisplacement(removedPeakRender, removedPeakPath.points) > SHORE_TOPOLOGY_ALGORITHM.maxDisplacement, "双向 Hausdorff 必须发现 source 到 render 的尖峰距离");
  const removedPeakSnapshot = buildShoreArcSnapshot(removedPeakPath, undefined, {isSideSampleSafe: () => true});
  assert.equal(removedPeakSnapshot.fallbackReason, "max-displacement", "删除超过默认最大位移的高尖峰必须整 arc 回退");

  const degenerate = buildShoreArcSnapshot({points: [[1, 1]], sideVectors: [{x: 1, y: 0}]});
  assert.equal(degenerate.fallbackReason, "degenerate-source", "退化 arc 必须整 arc 回退");
  const invalid = buildShoreArcSnapshot({...openPath, points: [[0, 0], [Number.NaN, 1], [8, 0]]});
  assert.equal(invalid.fallbackReason, "invalid-source", "非法 arc 必须安全回退而不是继续平滑");
  const sideRejected = buildShoreArcSnapshot(openPath, undefined, {isSideSampleSafe: () => false});
  assert.equal(sideRejected.fallbackReason, null, "陆水侧保护失败不得再触发整 arc 回退");
  assert.ok(sideRejected.locallyFallbackSourceSegmentCount > 0, "陆水侧保护失败必须记录局部原始段");
  assert.deepEqual(sideRejected.path.renderPoints[0], openPath.points[0], "陆水侧局部回退必须保持起点连续");
  assert.deepEqual(sideRejected.path.renderPoints.at(-1), openPath.points.at(-1), "陆水侧局部回退必须保持终点连续");

  const locallyProtectedPath = {
    points: [[0, 0], [2, 0], [4, 0], [6, 6], [8, 0], [10, 0], [12, 0]],
    sideVectors: Array.from({length: 7}, () => ({x: 0, y: 1})),
    landCells: new Array(7).fill(1),
    waterCells: new Array(7).fill(2)
  };
  const locallyProtected = buildShoreArcSnapshot(
    locallyProtectedPath,
    {towns: [[6, 4.8]], roads: [], rivers: []},
    {threshold: 0, isSideSampleSafe: () => true}
  );
  assert.equal(locallyProtected.fallbackReason, null, "沿岸城镇保护不得再触发整 arc 回退");
  assert.ok(locallyProtected.locallyFallbackSourceSegmentCount > 0, "沿岸城镇附近必须记录局部原始段");
  assert.ok(locallyProtected.eligibleSourceSegmentCount > 0, "沿岸城镇以外必须保留可平滑段");
  assert.deepEqual(locallyProtected.path.renderPoints[0], locallyProtectedPath.points[0], "局部回退必须保持起点连续");
  assert.deepEqual(locallyProtected.path.renderPoints.at(-1), locallyProtectedPath.points.at(-1), "局部回退必须保持终点连续");
  assert.ok(maxShoreDisplacement(locallyProtected.path.renderPoints, locallyProtectedPath.points) <= SHORE_TOPOLOGY_ALGORITHM.maxDisplacement + 0.000001, "局部回退后最大位移不得越界");

  const cornerTownPath = {
    points: [[0, 0], [4, 0], [4, 4], [8, 4]],
    sideVectors: Array.from({length: 4}, () => ({x: 0, y: 1})),
    landCells: new Array(4).fill(1),
    waterCells: new Array(4).fill(2)
  };
  const cornerTown = buildShoreArcSnapshot(
    cornerTownPath,
    {towns: [[3.75, 0.25]], roads: [], rivers: []},
    {threshold: 0, isSideSampleSafe: () => true}
  );
  assert.equal(cornerTown.fallbackReason, null, "近岸城镇换侧必须局部保护而不是整弧回退");
  assert.ok(cornerTown.path.topologyLocalFallbackReasons["protected-town"] > 0, "近岸城镇换侧反例必须命中 protected-town");
  assert.ok(cornerTown.locallyFallbackSourceSegmentCount > 0, "近岸城镇换侧必须落回局部共享源段");

  const expandedProtectionPath = {
    points: [[0, 0], [10, 20], [20, 0], [30, 20], [40, 0]],
    sideVectors: Array.from({length: 5}, () => ({x: 0, y: 1})),
    landCells: new Array(5).fill(1),
    waterCells: new Array(5).fill(2)
  };
  const expandedTownProtection = buildShoreArcSnapshot(
    expandedProtectionPath,
    {towns: [[15, 29]], roads: [], rivers: []},
    {isSideSampleSafe: () => true}
  );
  assert.ok(expandedTownProtection.path.topologyLocalFallbackReasons["protected-town"] > 0, "距源海岸 10～18 单位的城镇必须进入保护门禁");
  const expandedMouthProtection = buildShoreArcSnapshot(
    expandedProtectionPath,
    {towns: [], roads: [], rivers: [[[14, 29], [16, 29]]]},
    {isSideSampleSafe: () => true}
  );
  assert.ok(expandedMouthProtection.path.topologyLocalFallbackReasons["protected-mouth"] > 0, "距源海岸 10～18 单位的河口必须进入保护门禁");

  const shoreLayerSource = readFileSync(join(rootDir, "app", "webgl-generator", "src", "renderer", "shore-layer.js"), "utf8");
  const rendererSource = readFileSync(join(rootDir, "app", "webgl-generator", "src", "renderer", "placeholder-renderer.js"), "utf8");
  assert.match(shoreLayerSource, /return cells\[Math\.min\(sourceIndex \+ 1, cells\.length - 1\)\]/, "平滑采样的源 cell 必须读取当前源段 i 对应的 cells[i+1]");
  assert.match(shoreLayerSource, /const renderPoints = path\?\.renderPoints\?\.length \? path\.renderPoints : sourcePoints;/, "band 与 stroke 必须从 snapshot renderPoints 取点");
  assert.match(shoreLayerSource, /function pushSnapshotShoreLines[\s\S]*buildShoreSurfaceModel\(path, context\.map\)\.renderPoints/, "stroke 必须消费与 surface 同一份渲染岸线模型");
  assert.equal(SHORE_VISUAL_STYLE.surfaceNeedlePolicy, "exact-xor-boundary-edge-overlap", "XOR 修正面必须完整，并沿新旧岸线边缘封口");
  assert.equal(SHORE_VISUAL_STYLE.coastlineWidthWorld, 0.09, "海岸描边必须使用近景细线宽度");
  assert.equal(SHORE_VISUAL_STYLE.lakeShoreWidthWorld, 0.08, "湖岸描边必须使用近景细线宽度");
  assert.equal(SHORE_VISUAL_STYLE.surfaceBoundaryCoverWorld, 0.18, "新旧岸线边缘封口必须保持 0.18 世界单位");
  assert.match(shoreLayerSource, /pushWorldPolylineMesh\(vertices, context, points, color, widthWorld,/, "共享平滑描边宽度不得因针尖修复扩大");
  const thinNeedleTriangle = {points: [[0, 0], [18, 0], [18, 0.12]]};
  const normalCorrectionTriangle = {points: [[0, 0], [18, 0], [18, 0.3]]};
  assert.ok(shoreCorrectionTriangleAltitude(thinNeedleTriangle.points) < 0.18, "固定长窄三角形必须保留上一轮误删反例的尺度");
  assert.equal(shouldCullShoreSurfaceNeedle(thinNeedleTriangle), false, "非退化长窄 XOR 修补面必须完整提交，避免露出旧填色");
  assert.equal(shouldCullShoreSurfaceNeedle(normalCorrectionTriangle), false, "普通 XOR 修补面不得被误删");
  assert.equal(shouldCullShoreSurfaceNeedle({points: [[0, 0], [18, 0], [18, 0]]}), true, "真正退化的零面积三角形仍必须拒绝");
  assert.doesNotMatch(shoreLayerSource, /if \(shouldCullShoreSurfaceNeedle\(triangle\)\) continue;/, "GPU writer 不得再按单三角高度挖空精确 XOR 差区");
  assert.match(shoreLayerSource, /triangle\.boundaryEdges[\s\S]*insidePoint: triangleCentroid[\s\S]*pushShoreBoundaryEdgeCover/, "GPU writer 必须沿新旧岸线边向修正面外侧追加同语义封口");
  assert.match(shoreLayerSource, /insideDx \* nx \+ insideDy \* ny > 0[\s\S]*nx = -nx[\s\S]*surfaceBoundaryCoverWorld/, "岸线边缘封口必须依据修正三角内部点只向外侧偏移");
  const surfaceWriterSource = shoreLayerSource.match(/export function pushShoreVisualBands[\s\S]*?\n}\n/)?.[0] || "";
  assert.match(surfaceWriterSource, /pushShoreSurfaceCorrections/, "正式 surface 必须写入 XOR 精确修补面");
  assert.doesNotMatch(surfaceWriterSource, /pushShoreVisualBand\(/, "XOR 精确填色启用后不得再向 GPU 提交冗余四三角过渡带");
  const flippedBandFixture = inspectShoreBandTriangleGeometry({
    centerA: [369.92530965805054, 113.76141619682312],
    centerB: [369, 117],
    landA: [370.850618295205, 108.84813618146437],
    landB: [366.3517624733909, 116.25882660418803],
    waterA: [369.0000010208961, 118.67469621218187],
    waterB: [371.6482375266091, 117.74117339581197]
  });
  assert.equal(flippedBandFixture.oppositeWinding, true, "用户截图对应的法向急转固定反例必须检出实际四三角翻面");
  assert.deepEqual(flippedBandFixture.signedAreas.map(area => Math.sign(area)), [-1, 1, 1, 1], "固定反例必须保持一个反向、三个同向三角面");
  assert.match(rendererSource, /if \(smoothCellBorders && shouldDrawShoreVisualBands/, "关闭平滑时不得保留海岸过渡面");
  assert.match(rendererSource, /export function shouldDrawShoreVisualBands\(colorMode\) \{\s*return colorMode === "height" \|\| colorMode === "states" \|\| colorMode === "provinces";\s*\}/, "海岸窄带判定不得恒为 false");
  assert.match(shoreLayerSource, /if \(smoothCellBorders && paths\)[\s\S]*return;[\s\S]*sharedVoronoiEdge\(map, cell, neighbor\)/, "硬边模式必须完整回退共享 Voronoi 边");

  const performanceResults = [];
  for (const [pointCount, limitMs] of [[10000, 1000], [50000, 3500]]) {
    const performancePath = buildSyntheticShorePath(pointCount);
    const startedAt = performance.now();
    const performanceSnapshot = buildShoreTopologySnapshot([performancePath], null, {measureChanges: false});
    const elapsedMs = performance.now() - startedAt;
    assert.ok(elapsedMs <= limitMs, `${pointCount} 点海岸 snapshot 耗时 ${elapsedMs.toFixed(1)}ms，超过 ${limitMs}ms 门禁`);
    assert.ok(Number.isFinite(performanceSnapshot.stats.buildMs), `${pointCount} 点 stats.buildMs 缺失`);
    performanceResults.push({pointCount, elapsedMs: Math.round(elapsedMs * 10) / 10, buildMs: performanceSnapshot.stats.buildMs, limitMs});
  }

  const formalMapPerformance = [];
  for (const [cellsTarget, buildLimitMs] of [[10000, 1200], [50000, 4000]]) {
    const seed = "shore-review";
    const map = generatePlaceholderMap({seed, cellsTarget, heightmapTemplate: "continents"});
    const startedAt = performance.now();
    const paths = buildShoreVisualPaths(map);
    const elapsedMs = performance.now() - startedAt;
    assert.ok(paths.topology.buildMs < buildLimitMs, `shore-review / continents / ${cellsTarget} shore buildMs ${paths.topology.buildMs}ms，超过 ${buildLimitMs}ms`);
    formalMapPerformance.push({
      seed,
      template: "continents",
      cellsTarget,
      elapsedMs: Math.round(elapsedMs * 10) / 10,
      buildMs: paths.topology.buildMs,
      buildLimitMs,
      arcCount: paths.topology.arcCount,
      fallbackArcCount: paths.topology.fallbackArcCount
    });
    if (cellsTarget === 10000) {
      const cellVisualMap = generatePlaceholderMap({seed: "stage-2-1", cellsTarget, heightmapTemplate: "continents"});
      const collapsedVertexIds = [5331, 5519];
      const storedCollapsedEdge = collapsedVertexIds.map(vertex => cellVisualMap.grid.vertices.p[vertex]);
      const resolvedCollapsedEdge = collapsedVertexIds.map(vertex => resolvedGridVertexPoints(cellVisualMap.grid)[vertex]);
      const storedCollapsedLength = Math.hypot(
        storedCollapsedEdge[1][0] - storedCollapsedEdge[0][0],
        storedCollapsedEdge[1][1] - storedCollapsedEdge[0][1]
      );
      const resolvedCollapsedLength = Math.hypot(
        resolvedCollapsedEdge[1][0] - resolvedCollapsedEdge[0][0],
        resolvedCollapsedEdge[1][1] - resolvedCollapsedEdge[0][1]
      );
      const resolvedCollapsedCssLength = Math.hypot(
        (resolvedCollapsedEdge[1][0] - resolvedCollapsedEdge[0][0]) * 5.76687116564417,
        (resolvedCollapsedEdge[1][1] - resolvedCollapsedEdge[0][1]) * 10.424242424242424
      );
      assert.equal(storedCollapsedLength, 0, "stage-2-1 / 10k 的 cell #6255/#6378 必须稳定复现 [397,608] 零长度共享边");
      assert.ok(resolvedCollapsedLength > 0.1 && resolvedCollapsedLength < 0.2, `精确 Voronoi 回算长度 ${resolvedCollapsedLength} 未恢复当前现场的亚像素共享边`);
      assert.ok(resolvedCollapsedCssLength >= 0.9, `12x 当前现场下恢复边仅 ${resolvedCollapsedCssLength}px，未覆盖用户可见针缝`);
      for (const cellId of [6255, 6378]) {
        const vertexIds = cellVisualMap.grid.cells.v[cellId];
        const first = vertexIds.indexOf(collapsedVertexIds[0]);
        const second = vertexIds.indexOf(collapsedVertexIds[1]);
        assert.ok(first >= 0 && second >= 0, `正式 cell #${cellId} 缺少固定坍缩顶点`);
        assert.ok(Math.abs(first - second) === 1 || Math.abs(first - second) === vertexIds.length - 1, `正式 cell #${cellId} 的固定坍缩顶点不再连续`);
      }
      const cellVisualMesh = buildCellVisualMesh(cellVisualMap);
      const legacyCellFanLeaks = cellVisualMesh.cells.reduce((sum, cell) => sum + countCellVisualFanLeaks(cell.center, cell.points), 0);
      const finalCellTriangulationLeaks = cellVisualMesh.cells.reduce((sum, cell) => sum + countCellVisualTriangulationLeaks(cell.points), 0);
      const pinnedLegacyLeaks = [1061, 8832].map(cellId => {
        const cell = cellVisualMesh.cells.find(item => item.cell === cellId);
        return {
          cell: cellId,
          leaks: countCellVisualFanLeaks(cell.center, cell.points),
          height: cellVisualMap.grid.cells.h[cellId],
          legacyRasterLeakSamples: countCellVisualRasterLeakSamples(cell.center, cell.points),
          finalRasterLeakSamples: countCellVisualRasterLeakSamples(null, cell.points, triangulateCellVisualBoundary(cell.points))
        };
      });
      assert.equal(legacyCellFanLeaks, 11, "stage-2-1 / 10k 正式视觉 cell 必须稳定复现 11 个旧中心扇形越界三角");
      assert.deepEqual(pinnedLegacyLeaks.map(({cell, leaks, height}) => ({cell, leaks, height})), [
        {cell: 1061, leaks: 2, height: 19},
        {cell: 8832, leaks: 3, height: 20}
      ], "实验室固定的两个正式海岸 cell 必须与生成器逐点同源");
      assert.ok(pinnedLegacyLeaks.every(item => item.legacyRasterLeakSamples > 0), "两个正式反例都必须在像素采样中暴露异侧填色");
      assert.ok(pinnedLegacyLeaks.every(item => item.finalRasterLeakSamples === 0), "Earcut 后两个正式反例的像素级异侧填色必须归零");
      assert.equal(finalCellTriangulationLeaks, 0, "Earcut 视觉 cell 三角面重心不得落到自身边界外");
      assert.equal(cellVisualMesh.triangulationFallbackCells, 0, "正式 10k 视觉 cell 不得回退旧中心扇形");
      assert.ok(paths.topology.smoothedLengthRatio >= 0.5, `10k 安全平滑长度覆盖率 ${paths.topology.smoothedLengthRatio} 低于 50%`);
      assert.ok(paths.topology.smoothedSourceSegmentCount <= paths.topology.eligibleSourceSegmentCount, "实际平滑源段不得超过安全可处理源段");
      assert.ok(paths.topology.smoothedLengthRatio <= paths.topology.eligibleLengthRatio + 0.0001, "实际平滑长度不得超过安全可处理长度");
      const primaryCoastline = [...paths.coastline].sort((a, b) => b.sourcePoints.length - a.sourcePoints.length)[0];
      assert.equal(primaryCoastline?.topologyFallbackReason, null, "主要大陆弧不得整条回退");
      assert.ok(maxShoreDisplacement(primaryCoastline.renderPoints, primaryCoastline.sourcePoints) >= 4, "主要大陆弧的最大几何位移必须达到正常视距可见门槛");
      const bandBuildMs = 0;
      const bandSegmentCount = 0;
      const correctionBuildStartedAt = performance.now();
      const correctionTriangles = [];
      for (const path of [...paths.coastline, ...paths.lakeShore]) {
        correctionTriangles.push(...buildShoreSurfaceCorrectionTriangles(path, map));
      }
      const correctionBuildMs = Math.round((performance.now() - correctionBuildStartedAt) * 100) / 100;
      const surfaceNeedleCullTriangleCount = correctionTriangles.filter(shouldCullShoreSurfaceNeedle).length;
      assert.ok(correctionBuildMs <= 1500, `正式 10k XOR 海岸修补面冷构建 ${correctionBuildMs}ms，超过 1500ms 门禁`);
      assert.ok(correctionTriangles.length > 0 && correctionTriangles.length <= 100000, `正式 10k XOR 海岸修补面输出 ${correctionTriangles.length} 个三角形，必须位于 1～100000`);
      assert.equal(surfaceNeedleCullTriangleCount, 0, "正式 10k 精确 XOR 修补面不得再淘汰任何非退化三角形");
      const formalThinWaterCorrection = correctionTriangles.find(triangle =>
        triangle.side === "water"
        && shoreCorrectionTriangleAltitude(triangle.points) > 0.000001
        && shoreCorrectionTriangleAltitude(triangle.points) < 0.18
      );
      assert.ok(formalThinWaterCorrection, "正式 10k 地图必须实际包含非退化低高度补水三角，并由最终 GPU writer 完整保留");
      assert.ok(correctionTriangles.some(triangle => triangle.boundaryEdges?.length), "正式 10k XOR 修补面必须标记可封口的新旧岸线边");
      const screenshotProjection = {x: 16.47937136814729, y: 11.90181531621419};
      const formalCoastSegment = [[397.03568309391176, 608.3210877997307], [403, 624]];
      const coastDx = formalCoastSegment[1][0] - formalCoastSegment[0][0];
      const coastDy = formalCoastSegment[1][1] - formalCoastSegment[0][1];
      const coastLength = Math.hypot(coastDx, coastDy);
      const projectedCoastWidth = SHORE_VISUAL_STYLE.coastlineWidthWorld * Math.hypot(
        -coastDy / coastLength * screenshotProjection.x,
        coastDx / coastLength * screenshotProjection.y
      );
      assert.ok(projectedCoastWidth <= 1.5, `正式 #6377/#6378 海岸线在用户截图投影下为 ${projectedCoastWidth.toFixed(2)}px，超过 1.5px`);
      assert.ok(correctionTriangles.some(triangle => triangle.side === "land"), "XOR 海岸修补面必须实际覆盖陆地向海侧推进");
      assert.ok(correctionTriangles.some(triangle => triangle.side === "water"), "XOR 海岸修补面必须实际覆盖海水向陆侧推进");
      for (const triangle of correctionTriangles) {
        assert.ok(["land", "water"].includes(triangle.side), "XOR 海岸修补三角形必须声明正确覆盖侧");
        assert.ok(Number.isInteger(triangle.landCell) && Number.isInteger(triangle.waterCell), "XOR 海岸修补三角形必须引用 canonical 陆水 cell");
        assert.equal(triangle.points.length, 3, "XOR 海岸修补几何只能输出三角形");
        assert.ok(triangle.points.flat().every(Number.isFinite), "XOR 海岸修补三角形坐标必须全部有限");
        assert.ok(Math.abs(signedTriangleArea(triangle.points)) > 1e-9, "XOR 海岸修补不得输出退化三角形");
      }
      const surfaceReplay = {xorSampleCount: 0, mismatchCount: 0, multiCoveredCount: 0, conflictingSideCount: 0, coastline: 0, lakeShore: 0};
      for (const [kind, shorePaths] of [["coastline", paths.coastline], ["lakeShore", paths.lakeShore]]) {
        for (const path of shorePaths) {
          if (!path.closed) continue;
          const replay = replayShoreSurfaceCorrection(
            path.points,
            buildShoreRenderPoints(path, map),
            buildShoreSurfaceCorrectionTriangles(path, map),
            inferTestLandInside(path),
            1
          );
          surfaceReplay.xorSampleCount += replay.xorSampleCount;
          surfaceReplay.mismatchCount += replay.mismatchCount;
          surfaceReplay.multiCoveredCount += replay.multiCoveredCount;
          surfaceReplay.conflictingSideCount += replay.conflictingSideCount;
          surfaceReplay[kind] += replay.xorSampleCount;
        }
      }
      assert.ok(surfaceReplay.coastline > 0 && surfaceReplay.lakeShore > 0, "XOR 修补独立重放必须同时覆盖海岸与湖岸");
      assert.equal(surfaceReplay.mismatchCount, 0, `全部海岸 / 湖岸 XOR 修补后仍有 ${surfaceReplay.mismatchCount} 个填色/边线分离采样`);
      assert.equal(surfaceReplay.multiCoveredCount, 0, `全部海岸 / 湖岸 XOR 修补存在 ${surfaceReplay.multiCoveredCount} 个重复覆盖采样`);
      assert.equal(surfaceReplay.conflictingSideCount, 0, `全部海岸 / 湖岸 XOR 修补存在 ${surfaceReplay.conflictingSideCount} 个陆水冲突采样`);
      Object.assign(formalMapPerformance.at(-1), {
        bandBuildMs,
        bandSegmentCount,
        correctionBuildMs,
        correctionTriangleCount: correctionTriangles.length,
        surfaceNeedleCullTriangleCount,
        cellVisualTriangulation: {
          mode: cellVisualMesh.triangulationMode,
          legacyFanLeaks: legacyCellFanLeaks,
          finalLeaks: finalCellTriangulationLeaks,
          fallbackCells: cellVisualMesh.triangulationFallbackCells,
          pinnedLegacyLeaks
        },
        surfaceReplay,
        retiredBandTriangleCount: 0,
        flippedBandFixture: {
          signedAreas: flippedBandFixture.signedAreas,
          oppositeWinding: flippedBandFixture.oppositeWinding
        }
      });
    }
  }

  console.log(JSON.stringify({
    passed: true,
    algorithm: SHORE_TOPOLOGY_ALGORITHM.id,
    defaults: [6, 0.25, 2, 18],
    checks: [
      "input-immutable",
      "open-anchor-lock",
      "closed-anchor-lock",
      "bidirectional-max-displacement",
      "removed-peak-fallback",
      "invalid-fallback",
      "degenerate-fallback",
      "local-side-fallback",
      "local-protected-fallback",
      "near-town-side-switch",
      "expanded-protection-radius",
      "shared-render-points",
      "hard-edge-fallback",
      "actual-band-triangle-winding-counterexample",
      "retired-redundant-band-writer",
      "raw-snapshot-xor-surface-correction",
      "exact-xor-boundary-edge-overlap",
      "formal-pixel-residual-fixtures",
      "surface-correction-independent-replay",
      "surface-correction-performance",
      "source-segment-cell-offset",
      "synthetic-performance",
      "formal-map-performance"
    ],
    performance: performanceResults,
    formalMapPerformance
  }, null, 2));
}

function buildSyntheticShorePath(pointCount) {
  const points = Array.from({length: pointCount}, (_, index) => [
    index * 0.25,
    Math.sin(index * 0.17) * 0.18 + Math.sin(index * 0.031) * 0.08
  ]);
  return {
    points,
    sideVectors: Array.from({length: pointCount}, () => ({x: 0, y: 1})),
    landCells: new Array(pointCount).fill(1),
    waterCells: new Array(pointCount).fill(2)
  };
}

function replayShoreSurfaceCorrection(sourceRing, renderRing, triangles, landInside, step) {
  const points = [...sourceRing, ...renderRing];
  const minX = Math.floor(Math.min(...points.map(point => point[0])));
  const maxX = Math.ceil(Math.max(...points.map(point => point[0])));
  const minY = Math.floor(Math.min(...points.map(point => point[1])));
  const maxY = Math.ceil(Math.max(...points.map(point => point[1])));
  const buckets = new Map();
  const bucketSize = 16;
  for (const triangle of triangles) {
    const x0 = Math.floor(Math.min(...triangle.points.map(point => point[0])) / bucketSize);
    const x1 = Math.floor(Math.max(...triangle.points.map(point => point[0])) / bucketSize);
    const y0 = Math.floor(Math.min(...triangle.points.map(point => point[1])) / bucketSize);
    const y1 = Math.floor(Math.max(...triangle.points.map(point => point[1])) / bucketSize);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const key = `${x}:${y}`;
        const entries = buckets.get(key) || [];
        entries.push(triangle);
        buckets.set(key, entries);
      }
    }
  }
  let mismatchCount = 0;
  let multiCoveredCount = 0;
  let conflictingSideCount = 0;
  let xorSampleCount = 0;
  for (let y = minY + step / 2; y < maxY; y += step) {
    for (let x = minX + step / 2; x < maxX; x += step) {
      const point = [x, y];
      const sourceInside = pointInTestRing(point, sourceRing);
      const renderInside = pointInTestRing(point, renderRing);
      if (sourceInside === renderInside) continue;
      xorSampleCount++;
      const candidates = buckets.get(`${Math.floor(x / bucketSize)}:${Math.floor(y / bucketSize)}`) || [];
      const hits = candidates.filter(triangle => pointInTestTriangle(point, triangle.points));
      const interiorHits = candidates.filter(triangle => pointInTestTriangle(point, triangle.points, false));
      const sides = new Set(interiorHits.map(triangle => triangle.side));
      let correctedLand = sourceInside === landInside;
      for (const triangle of hits) correctedLand = triangle.side === "land";
      if (correctedLand !== (renderInside === landInside)) mismatchCount++;
      if (interiorHits.length > 1) multiCoveredCount++;
      if (sides.size > 1) conflictingSideCount++;
    }
  }
  return {xorSampleCount, mismatchCount, multiCoveredCount, conflictingSideCount};
}

function inferTestLandInside(path) {
  let insideVotes = 0;
  let outsideVotes = 0;
  for (let index = 0; index < path.points.length - 1; index++) {
    const a = path.points[index];
    const b = path.points[index + 1];
    const side = path.sideVectors[index];
    if (!side || Math.hypot(side.x, side.y) <= 1e-9) continue;
    const center = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const distance = Math.min(1, Math.max(0.05, Math.hypot(a[0] - b[0], a[1] - b[1]) * 0.05));
    const land = [center[0] + side.x * distance, center[1] + side.y * distance];
    const water = [center[0] - side.x * distance, center[1] - side.y * distance];
    const landInside = pointInTestRing(land, path.points);
    const waterInside = pointInTestRing(water, path.points);
    if (landInside === waterInside) continue;
    if (landInside) insideVotes++;
    else outsideVotes++;
  }
  assert.notEqual(insideVotes, outsideVotes, "独立回放必须能判定闭环的环内陆水语义");
  return insideVotes > outsideVotes;
}

function countCellVisualRasterLeakSamples(center, points, indices = null, step = 0.1) {
  const triangles = indices
    ? Array.from({length: Math.floor(indices.length / 3)}, (_, index) => [
      points[indices[index * 3]],
      points[indices[index * 3 + 1]],
      points[indices[index * 3 + 2]]
    ])
    : points.map((point, index) => [center, point, points[(index + 1) % points.length]]);
  const xs = points.map(point => point[0]);
  const ys = points.map(point => point[1]);
  let leaks = 0;
  for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) {
    for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) {
      const sample = [x, y];
      if (pointInTestRing(sample, points)) continue;
      if (triangles.some(triangle => pointInTestTriangle(sample, triangle, false))) leaks++;
    }
  }
  return leaks;
}

function pointInTestRing(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const a = ring[index];
    const b = ring[previous];
    if ((a[1] > point[1]) !== (b[1] > point[1])
      && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function pointInTestTriangle(point, triangle, includeBoundary = true) {
  const cross = (a, b) => (a[0] - point[0]) * (b[1] - point[1]) - (a[1] - point[1]) * (b[0] - point[0]);
  const a = cross(triangle[0], triangle[1]);
  const b = cross(triangle[1], triangle[2]);
  const c = cross(triangle[2], triangle[0]);
  const hasNegative = a < -1e-9 || b < -1e-9 || c < -1e-9;
  const hasPositive = a > 1e-9 || b > 1e-9 || c > 1e-9;
  if (hasNegative && hasPositive) return false;
  return includeBoundary || (Math.abs(a) > 1e-9 && Math.abs(b) > 1e-9 && Math.abs(c) > 1e-9);
}

function signedTriangleArea(triangle) {
  return (
    triangle[0][0] * (triangle[1][1] - triangle[2][1])
    + triangle[1][0] * (triangle[2][1] - triangle[0][1])
    + triangle[2][0] * (triangle[0][1] - triangle[1][1])
  ) / 2;
}
