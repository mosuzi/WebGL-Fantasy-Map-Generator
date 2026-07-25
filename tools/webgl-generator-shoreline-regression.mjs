#!/usr/bin/env node
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
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
  triangulateCellVisualBoundary,
  triangulateCellVisualBoundarySafely
} from "../app/webgl-generator/src/renderer/cell-visual-layer.js";
import {resolvedGridVertexPoints} from "../app/webgl-generator/src/renderer/grid-vertex-geometry.js";
import {
  buildShoreRenderPoints,
  buildShoreBoundaryEdgeCoverTriangles,
  buildShoreSurfaceDrawPacket,
  buildShoreSurfaceCorrectionTriangles,
  buildShoreVisualPaths,
  inspectShoreBandTriangleGeometry,
  SHORE_VISUAL_STYLE,
  shoreCorrectionTriangleAltitude,
  shouldCullShoreSurfaceNeedle
} from "../app/webgl-generator/src/renderer/shore-layer.js";
import {buildExactSurfaceCorrectionTriangles} from "../prototype/boundary-topology-lab/src/surface-correction.js";
import {
  analyzeFallbackSpliceStress,
  analyzeFloat32DrawPacketPhaseMatrix,
  analyzeMultiRingXorStress,
  buildFloat32PacketFromCorrectionTriangles,
  mutateDrawPacket,
  rasterDrawPacketPhase
} from "../prototype/boundary-topology-lab/src/stress-analysis.js";

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

if (args["pure-formal"]) {
  const formalMapPerformance = runFormalMapRegression();
  console.log(JSON.stringify({passed: true, isolatedFormal: true, formalMapPerformance}, null, 2));
  process.exit(0);
}

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
  assert.notDeepEqual(closedRender[0], closed[0], "闭环不得把任意原始首点钉回平滑结果");
  assert.deepEqual(closedRender.at(-1), closedRender[0], "闭环终点必须锁回平滑后的首点");

  const singleCellCoast = {
    id: "single-cell-coast",
    points: [[210, 52], [221, 91], [211, 125], [178, 143], [139, 136], [112, 109], [128, 72], [164, 52], [210, 52]],
    sideVectors: Array.from({length: 9}, () => ({x: 0, y: 1})),
    landCells: new Array(9).fill(1),
    waterCells: new Array(9).fill(2)
  };
  const nearbyMainland = {
    id: "nearby-mainland",
    points: [[28, 174], [82, 161], [126, 173], [163, 164], [203, 176], [248, 159], [294, 174], [294, 218], [28, 218], [28, 174]],
    sideVectors: Array.from({length: 10}, () => ({x: 0, y: 1})),
    landCells: new Array(10).fill(3),
    waterCells: new Array(10).fill(2)
  };
  const isolatedSingleCell = buildShoreTopologySnapshot([singleCellCoast], null, {isSideSampleSafe: () => true}).paths[0];
  const combinedSingleCell = buildShoreTopologySnapshot([nearbyMainland, singleCellCoast], null, {isSideSampleSafe: () => true}).paths[1];
  assert.deepEqual(combinedSingleCell.renderPoints, isolatedSingleCell.renderPoints, "附近大陆不得改变独立单 cell 海岸的平滑结果");
  assert.notDeepEqual(isolatedSingleCell.renderPoints[0], singleCellCoast.points[0], "单 cell 闭环不得残留原始首点毛刺");
  assert.deepEqual(isolatedSingleCell.renderPoints.at(-1), isolatedSingleCell.renderPoints[0], "单 cell 平滑结果必须闭合在处理后的首点");

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
  assert.match(shoreLayerSource, /triangle\.boundaryEdges[\s\S]*insidePoint: triangleCentroid[\s\S]*buildShoreBoundaryEdgeCoverTriangles/, "GPU writer 必须沿新旧岸线边向修正面外侧追加同语义封口");
  assert.match(shoreLayerSource, /insideDx \* nx \+ insideDy \* ny > 0[\s\S]*nx = -nx[\s\S]*surfaceBoundaryCoverWorld/, "岸线边缘封口必须依据修正三角内部点只向外侧偏移");
  const surfaceWriterSource = shoreLayerSource.match(/export function pushShoreVisualBands[\s\S]*?\n}\n/)?.[0] || "";
  assert.match(surfaceWriterSource, /buildShoreSurfaceVertexLayers/, "正式 surface 必须写入 XOR 精确修补面");
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

  runFormalMapRegressionInChild();
  const formalMapPerformance = [{isolatedProcess: true}];

  const phaseFixture = buildDrawPacketPhaseFixture();
  const phasePacket = buildShoreSurfaceDrawPacket(phaseFixture.path, phaseFixture.map);
  assert.ok(phasePacket.correctionTriangleCount > 0, "Float32 draw packet 固定输入必须实际生成 XOR 修正三角形");
  assert.ok(phasePacket.boundaryCoverTriangleCount > 0, "Float32 draw packet 固定输入必须实际生成边界封口三角形");
  assert.ok(phasePacket.commands.every(command => command.positions instanceof Float32Array), "正式 draw packet 必须以 Float32Array 固定 GPU 实际坐标");
  assert.ok(
    phasePacket.commands.slice(0, phasePacket.correctionTriangleCount).every(command => command.kind === "correction")
      && phasePacket.commands.slice(phasePacket.correctionTriangleCount).every(command => command.kind === "boundary-cover"),
    "正式 draw packet 必须保持修正面先画、边界封口后画"
  );
  const phaseMatrix = analyzeFloat32DrawPacketPhaseMatrix({
    sourceRings: [phaseFixture.path.points],
    baseRings: [phaseFixture.basePoints],
    renderRings: [phaseFixture.path.renderPoints],
    packet: phasePacket
  });
  assert.equal(phaseMatrix.phaseCount, 36, "像素相位矩阵必须覆盖 3 DPR × 3 zoom × 4 subpixel offset");
  assert.deepEqual(phaseMatrix.dprs, [1, 1.5, 2], "像素相位矩阵必须覆盖 DPR 1 / 1.5 / 2");
  assert.equal(phaseMatrix.projection.x === phaseMatrix.projection.y, false, "像素相位矩阵必须使用非等比投影");
  assert.equal(phaseMatrix.wrongSidePixels, 0, "最终 Float32 draw packet 的 36 个像素相位不得出现错侧像素");
  assert.equal(phaseMatrix.longestNeedlePixels, 0, "最终 Float32 draw packet 不得留下连续像素针");
  assert.equal(phaseMatrix.conflictingPixels, 0, "最终 Float32 draw packet 不得出现陆水冲突覆盖");
  assert.equal(phaseMatrix.duplicatePixels, 0, "最终 Float32 draw packet 不得出现重复像素 ownership");
  assert.equal(phaseMatrix.seamPixels, 0, "最终 Float32 draw packet framebuffer 不得留下边缘裸露/错色");
  const phaseMutations = Object.fromEntries(["delete-cover", "wrong-direction", "wrong-order", "endpoint-quantization"].map(kind => [
    kind,
    analyzeFloat32DrawPacketPhaseMatrix({
      sourceRings: [phaseFixture.path.points],
      baseRings: [phaseFixture.basePoints],
      renderRings: [phaseFixture.path.renderPoints],
      packet: mutateDrawPacket(phasePacket, kind)
    })
  ]));
  assert.ok(phaseMatrix.wrongSidePixels <= phaseMutations["wrong-direction"].wrongSidePixels, "反向陆水语义破坏必须稳定放大错侧像素");
  assert.ok(
    (phaseMutations["delete-cover"].seamPixels > phaseMatrix.seamPixels
      || phaseMutations["delete-cover"].wrongSidePixels > phaseMatrix.wrongSidePixels)
      && phaseMutations["wrong-direction"].wrongSidePixels > phaseMatrix.wrongSidePixels
      && (
        phaseMutations["wrong-order"].wrongSidePixels > phaseMatrix.wrongSidePixels
        || phaseMutations["endpoint-quantization"].wrongSidePixels > phaseMatrix.wrongSidePixels
      ),
    `删封口、反向、错序/端点量化三类破坏必须分别击穿像素相位门禁：${JSON.stringify({
      final: summarizePhaseMetrics(phaseMatrix),
      mutations: Object.fromEntries(Object.entries(phaseMutations).map(([key, value]) => [key, summarizePhaseMetrics(value)]))
    })}`
  );

  const multiRingFixture = buildMultiRingStressFixture();
  const multiRingTriangles = buildExactSurfaceCorrectionTriangles(multiRingFixture.sourceRings, multiRingFixture.renderRings);
  const multiRingPacket = buildStressPacketWithBoundaryCovers(
    multiRingTriangles,
    [...multiRingFixture.sourceRings, ...multiRingFixture.renderRings],
    multiRingFixture.renderRings
  );
  const multiRingResult = analyzeMultiRingXorStress({
    ...multiRingFixture,
    correctionTriangles: multiRingTriangles,
    packet: multiRingPacket
  });
  assert.ok(multiRingResult.correctionTriangleCount > 0, "多环复合输入必须实际经过 polygon XOR + Earcut");
  assert.ok(multiRingResult.holePreserved, "湖洞在平滑后必须保持为水面");
  assert.ok(multiRingResult.channelPreserved, "狭窄水道在平滑后必须保持为水面");
  assert.ok(multiRingResult.landConnected, "强凹外环在平滑后不得切断主体陆地");
  assert.equal(multiRingResult.wrongSidePixels, 0, "多环 XOR 最终 framebuffer 不得有错侧像素");
  assert.equal(multiRingResult.longestNeedlePixels, 0, "多环 XOR 最终 framebuffer 不得有连续像素针");
  assert.equal(multiRingResult.conflictingPixels, 0, "多环 XOR 修补不得产生陆水冲突覆盖");
  assert.equal(multiRingResult.duplicatePixels, 0, "多环 XOR 修补不得产生重复像素 ownership");
  assert.equal(multiRingResult.seamPixels, 0, "多环 XOR 最终 framebuffer 不得有边缘裸露/错色");
  const brokenHole = analyzeMultiRingXorStress({
    ...multiRingFixture,
    renderRings: [multiRingFixture.renderRings[0]],
    correctionTriangles: buildExactSurfaceCorrectionTriangles(multiRingFixture.sourceRings, [multiRingFixture.renderRings[0]]),
    packet: multiRingPacket
  });
  const brokenMultiRingSide = analyzeMultiRingXorStress({
    ...multiRingFixture,
    correctionTriangles: multiRingTriangles,
    packet: mutateDrawPacket(multiRingPacket, "wrong-direction")
  });
  const brokenMultiRingCover = analyzeMultiRingXorStress({
    ...multiRingFixture,
    correctionTriangles: multiRingTriangles,
    packet: mutateDrawPacket(multiRingPacket, "delete-cover")
  });
  assert.equal(brokenHole.holePreserved, false, "删除湖洞破坏必须被 hole gate 稳定检出");
  assert.ok(brokenMultiRingSide.wrongSidePixels > multiRingResult.wrongSidePixels, "翻转 landInside/覆盖侧必须被错侧像素门禁检出");
  assert.ok(
    brokenMultiRingCover.wrongSidePixels > multiRingResult.wrongSidePixels
      || brokenMultiRingCover.longestNeedlePixels > multiRingResult.longestNeedlePixels
      || brokenMultiRingCover.seamPixels > multiRingResult.seamPixels,
    "删除多环边界封口必须被像素针门禁检出"
  );

  const spliceFixture = buildFallbackSpliceStressFixture();
  const spliceResult = analyzeFallbackSpliceStress(spliceFixture);
  assert.equal(spliceResult.passed, true, "平滑段/原始回退段拼接必须同时守住端点、方向、canonical cell 和沿岸对象");
  const brokenSplice = analyzeFallbackSpliceStress({
    ...structuredClone(spliceFixture),
    rawFallbackSegment: [[6, 2], [12, 2], [16, 0]]
  });
  assert.equal(brokenSplice.passed, false, "错接 fallback 端点破坏必须稳定失败");
  assert.ok(brokenSplice.sharedEndpointDistance > 0 || brokenSplice.backtrackSegments > 0, "fallback 破坏必须给出可定位端点距离或回折段");

  const duplicateMicroBoundary = [[0, 0], [8, 0], [8, 0.000000001], [8, 8], [4, 4], [0, 8], [0, 8], [0, 0]];
  const concaveBoundary = [[0, 0], [10, 0], [10, 10], [7, 10], [7, 3], [3, 3], [3, 10], [0, 10]];
  const irreparableBoundary = [[0, 0], [8, 8], [0, 8], [8, 0]];
  const cleanedTriangulation = triangulateCellVisualBoundarySafely(duplicateMicroBoundary);
  const concaveTriangulation = triangulateCellVisualBoundarySafely(concaveBoundary);
  const skippedTriangulation = triangulateCellVisualBoundarySafely(irreparableBoundary);
  assert.equal(cleanedTriangulation.status, "ok", "重复点和极短边必须清洗重试后安全三角化");
  assert.equal(cleanedTriangulation.retried, true, "重复点和极短边必须留下 retry 统计");
  assert.equal(concaveTriangulation.status, "ok", "强凹 cell 必须由 Earcut 安全三角化");
  assert.equal(countCellVisualTriangulationLeaks(concaveTriangulation.points, concaveTriangulation.indices), 0, "强凹 cell 的 Earcut 三角形不得越界");
  assert.equal(skippedTriangulation.status, "skipped", "不可修复边界必须安全 skip");
  assert.equal(skippedTriangulation.reason, "self-intersecting-boundary", "安全 skip 必须提供可定位原因");
  assert.ok(countCellVisualFanLeaks([5, 8], concaveBoundary) > 0, "强制恢复旧中心扇形的破坏反例必须稳定越界");

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
      "float32-draw-packet-phase-matrix",
      "multiring-xor-compound",
      "fallback-splice-protected-objects",
      "earcut-safe-retry-or-skip",
      "surface-correction-independent-replay",
      "surface-correction-performance",
      "source-segment-cell-offset",
      "synthetic-performance",
      "formal-map-performance"
    ],
    stressGates: {
      phaseMatrix: {
        ...summarizePhaseMetrics(phaseMatrix),
        phaseCount: phaseMatrix.phaseCount,
        dprs: phaseMatrix.dprs,
        zooms: phaseMatrix.zooms,
        projection: phaseMatrix.projection,
        offsetCount: phaseMatrix.offsetCount
      },
      destructivePhaseMutations: Object.fromEntries(
        Object.entries(phaseMutations).map(([key, value]) => [key, summarizePhaseMetrics(value)])
      ),
      multiRing: {
        correctionTriangleCount: multiRingResult.correctionTriangleCount,
        wrongSidePixels: multiRingResult.wrongSidePixels,
        conflictingPixels: multiRingResult.conflictingPixels,
        duplicatePixels: multiRingResult.duplicatePixels,
        holePreserved: multiRingResult.holePreserved,
        channelPreserved: multiRingResult.channelPreserved,
        landConnected: multiRingResult.landConnected
      },
      fallbackSplice: {
        sharedEndpointDistance: spliceResult.sharedEndpointDistance,
        zeroLengthSegments: spliceResult.zeroLengthSegments,
        backtrackSegments: spliceResult.backtrackSegments,
        canonicalCellsPreserved: spliceResult.canonicalCellsPreserved,
        townProtected: spliceResult.townProtected,
        roadProtected: spliceResult.roadProtected,
        mouthProtected: spliceResult.mouthProtected
      },
      earcutSafety: {
        cleanupRetried: cleanedTriangulation.retried,
        concaveTriangleCount: concaveTriangulation.indices.length / 3,
        concaveLeaks: countCellVisualTriangulationLeaks(concaveTriangulation.points, concaveTriangulation.indices),
        skippedReason: skippedTriangulation.reason,
        destructiveLegacyFanLeaks: countCellVisualFanLeaks([5, 8], concaveBoundary)
      }
    },
    performance: performanceResults,
    formalMapPerformance
  }, null, 2));
}

function runFormalMapRegressionInChild() {
  const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--pure-formal"], {
    cwd: rootDir,
    stdio: "inherit"
  });
  assert.equal(result.error, undefined, `独立 formal 回归启动失败：${result.error?.message || "unknown"}`);
  assert.equal(result.status, 0, `独立 formal 回归退出码 ${result.status}`);
}

function runFormalMapRegression() {
  const flippedBandFixture = inspectShoreBandTriangleGeometry({
    centerA: [369.92530965805054, 113.76141619682312],
    centerB: [369, 117],
    landA: [370.850618295205, 108.84813618146437],
    landB: [366.3517624733909, 116.25882660418803],
    waterA: [369.0000010208961, 118.67469621218187],
    waterB: [371.6482375266091, 117.74117339581197]
  });
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
    const formalCellVisualMesh = buildCellVisualMesh(map);
    assert.equal(formalCellVisualMesh.triangulationFallbackCells, 0, `${cellsTarget} cell 视觉层不得恢复未校验中心扇形`);
    assert.equal(formalCellVisualMesh.triangulationUnfilledCells, 0, `${cellsTarget} cell 视觉层不得留下缺面`);
    assert.equal(
      formalCellVisualMesh.triangulationHardFallbackCells,
      formalCellVisualMesh.triangulationSkippedCells,
      `${cellsTarget} 平滑 Earcut 失败 cell 必须全部由安全硬边界补齐`
    );
    const drawPacketStartedAt = performance.now();
    let drawPacketCommandCount = 0;
    let drawPacketCorrectionCount = 0;
    let drawPacketCoverCount = 0;
    let drawPacketSkippedCoverCount = 0;
    let drawPacketFallbackCoverCount = 0;
    const formalPackets = [];
    for (const [kind, shorePaths] of [["coastline", paths.coastline], ["lakeShore", paths.lakeShore]]) {
      for (let pathIndex = 0; pathIndex < shorePaths.length; pathIndex++) {
        const path = shorePaths[pathIndex];
      const packet = buildShoreSurfaceDrawPacket(path, map);
      drawPacketCommandCount += packet.commands.length;
      drawPacketCorrectionCount += packet.correctionTriangleCount;
      drawPacketCoverCount += packet.boundaryCoverTriangleCount;
      drawPacketSkippedCoverCount += packet.skippedBoundaryCoverCount;
        drawPacketFallbackCoverCount += packet.fallbackBoundaryCoverCount;
        formalPackets.push({kind, pathIndex, path, packet});
      }
    }
    const drawPacketBuildMs = Math.round((performance.now() - drawPacketStartedAt) * 100) / 100;
    const drawPacketLimitMs = cellsTarget === 10000 ? 1800 : 5000;
    assert.ok(drawPacketBuildMs <= drawPacketLimitMs, `${cellsTarget} Float32 draw packet 冷构建 ${drawPacketBuildMs}ms，超过 ${drawPacketLimitMs}ms`);
    assert.equal(drawPacketCommandCount, drawPacketCorrectionCount + drawPacketCoverCount, `${cellsTarget} draw packet 命令统计不一致`);
    assert.equal(drawPacketSkippedCoverCount, 0, `${cellsTarget} Float32 draw packet 不得跳过任何非退化封边`);
    const surfaceFallbacks = formalPackets
      .filter(item => item.packet.surfaceFallbackReason === "surface-triangulation-fallback")
      .map(item => ({
        kind: item.kind,
        pathIndex: item.pathIndex,
        reason: item.packet.surfaceFallbackReason,
        detail: item.packet.surfaceFallbackDetail,
        location: item.packet.surfaceFallbackLocation
      }));
    assert.equal(surfaceFallbacks.length, 0, `${cellsTarget} 正式海岸表面不得退回原始折线`);
    assert.ok(
      surfaceFallbacks.every(item => item.detail && item.location),
      `${cellsTarget} 海岸表面降级必须保留原因详情与可定位摘要`
    );
    const effectiveSmoothedArcCount = Math.max(0, paths.topology.arcCount - paths.topology.fallbackArcCount - surfaceFallbacks.length);
    const fallbackCoverTangentBounds = inspectFallbackCoverTangentBounds(formalPackets);
    assert.equal(
      fallbackCoverTangentBounds.violationCount,
      0,
      `${cellsTarget} 慢路封边有 ${fallbackCoverTangentBounds.violationCount} 个顶点超过 tangent cap`
    );
    const fallbackCoverReplay = replayFormalFallbackCovers(formalPackets, map, formalCellVisualMesh);
    if (fallbackCoverReplay.introducedOwnerPixels > 0
      || Object.values(summarizePhaseMetrics(fallbackCoverReplay)).some(value => value > 0)) {
      const replayReport = {
        ...summarizePhaseMetrics(fallbackCoverReplay),
        introducedOwnerPixels: fallbackCoverReplay.introducedOwnerPixels,
        baselineWrongPixels: fallbackCoverReplay.baselineWrongPixels,
        remainingWrongPixels: fallbackCoverReplay.remainingWrongPixels,
        repairedWrongPixels: fallbackCoverReplay.repairedWrongPixels,
        fallbackEdgeCount: fallbackCoverReplay.fallbackEdgeCount,
        affectedPathCount: fallbackCoverReplay.affectedPathCount,
        remainingGroups: fallbackCoverReplay.affected.flatMap(path => path.edges
          .filter(edge => edge.remainingWrongPixels > 0)
          .map(edge => ({
            kind: path.kind,
            pathIndex: path.pathIndex,
            edge: edge.edge,
            side: edge.side,
            landCell: edge.landCell,
            waterCell: edge.waterCell,
            remainingWrongPixels: edge.remainingWrongPixels
          })))
      };
      console.error(JSON.stringify({cellsTarget, fallbackCoverReplay: replayReport}, null, 2));
    }
    assert.equal(fallbackCoverReplay.wrongSidePixels, 0, `${cellsTarget} 正式封边局部相位重放仍有 ${fallbackCoverReplay.wrongSidePixels} 个错侧像素`);
    assert.equal(fallbackCoverReplay.longestNeedlePixels, 0, `${cellsTarget} 正式封边局部相位重放仍有 ${fallbackCoverReplay.longestNeedlePixels}px 连续针缝`);
    assert.equal(fallbackCoverReplay.conflictingPixels, 0, `${cellsTarget} 正式封边局部相位重放仍有 ${fallbackCoverReplay.conflictingPixels} 个陆水冲突像素`);
    assert.equal(fallbackCoverReplay.duplicatePixels, 0, `${cellsTarget} 正式封边局部相位重放仍有 ${fallbackCoverReplay.duplicatePixels} 个重复 ownership 像素`);
    assert.equal(fallbackCoverReplay.seamPixels, 0, `${cellsTarget} 正式封边局部相位重放仍有 ${fallbackCoverReplay.seamPixels} 个 framebuffer 缝隙像素`);
    assert.equal(fallbackCoverReplay.introducedWrongPixels, 0, `${cellsTarget} 正式慢路封边引入了 ${fallbackCoverReplay.introducedWrongPixels} 个新错侧像素`);
    assert.equal(fallbackCoverReplay.introducedOwnerPixels, 0, `${cellsTarget} 正式慢路封边在端点/结点引入了 ${fallbackCoverReplay.introducedOwnerPixels} 个同侧 cell ownership 变化像素`);
    assert.equal(fallbackCoverReplay.remainingWrongPixels, 0, `${cellsTarget} 正式慢路封边仍留下 ${fallbackCoverReplay.remainingWrongPixels} 个目标侧错色像素`);
    Object.assign(formalMapPerformance.at(-1), {
      drawPacketBuildMs,
      drawPacketLimitMs,
      drawPacketCommandCount,
      drawPacketCorrectionCount,
      drawPacketCoverCount,
      drawPacketSkippedCoverCount,
      drawPacketFallbackCoverCount,
      fallbackCoverTangentBounds,
      fallbackCoverReplay,
      surfaceFallbackCount: surfaceFallbacks.length,
      surfaceFallbacks,
      effectiveSmoothedArcCount,
      effectiveSmoothedArcRatio: paths.topology.arcCount
        ? Math.round(effectiveSmoothedArcCount / paths.topology.arcCount * 10000) / 10000
        : 0,
      cellVisualSafety: {
        smoothEarcutFailures: formalCellVisualMesh.triangulationSkippedCells,
        hardBoundaryFallbacks: formalCellVisualMesh.triangulationHardFallbackCells,
        validatedHardFanFallbacks: formalCellVisualMesh.triangulationHardFanFallbackCells,
        unfilledCells: formalCellVisualMesh.triangulationUnfilledCells
      }
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
      assert.equal(cellVisualMesh.triangulationUnfilledCells, 0, "正式 10k 视觉 cell 不得留下缺面");
      assert.equal(cellVisualMesh.triangulationHardFallbackCells, cellVisualMesh.triangulationSkippedCells, "正式 10k 平滑失败 cell 必须全部由安全硬边界补齐");
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
          smoothEarcutFailures: cellVisualMesh.triangulationSkippedCells,
          hardBoundaryFallbacks: cellVisualMesh.triangulationHardFallbackCells,
          validatedHardFanFallbacks: cellVisualMesh.triangulationHardFanFallbackCells,
          unfilledCells: cellVisualMesh.triangulationUnfilledCells,
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
  return formalMapPerformance;
}

function inspectFallbackCoverTangentBounds(formalPackets) {
  let vertexCount = 0;
  let violationCount = 0;
  let maxOverflow = 0;
  let maxAllowedOverflow = 0;
  for (const item of formalPackets) {
    for (const command of item.packet.commands) {
      if (command.coverMode !== "subdivided" || !command.boundaryEdge) continue;
      const [start, end] = command.boundaryEdge;
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const lengthSquared = dx * dx + dy * dy;
      if (lengthSquared <= 1e-12) continue;
      const length = Math.sqrt(lengthSquared);
      const width = SHORE_VISUAL_STYLE.surfaceBoundaryCoverWorld * 2;
      const cap = Math.min(width * 0.2, length * 0.1);
      const magnitude = Math.max(
        1,
        Math.abs(start[0]),
        Math.abs(start[1]),
        Math.abs(end[0]),
        Math.abs(end[1])
      );
      const float32Ulp = 2 ** (Math.floor(Math.log2(magnitude)) - 23);
      const allowedOverflow = cap + float32Ulp;
      maxAllowedOverflow = Math.max(maxAllowedOverflow, allowedOverflow);
      for (let index = 0; index < command.positions.length; index += 2) {
        vertexCount++;
        const t = ((command.positions[index] - start[0]) * dx + (command.positions[index + 1] - start[1]) * dy) / lengthSquared;
        const overflow = Math.max(0, -t, t - 1) * length;
        maxOverflow = Math.max(maxOverflow, overflow);
        if (overflow > allowedOverflow) violationCount++;
      }
    }
  }
  return {
    vertexCount,
    violationCount,
    maxOverflow: Math.round(maxOverflow * 1e9) / 1e9,
    maxAllowedOverflow: Math.round(maxAllowedOverflow * 1e9) / 1e9
  };
}

function replayFormalFallbackCovers(formalPackets, map, cellVisualMesh) {
  const viewports = [[1280, 820], [1440, 960]];
  const dprs = [1, 1.5, 2];
  const zooms = [1, 6, 12];
  const summary = {
    fallbackEdgeCount: 0,
    affectedPathCount: 0,
    phaseCount: 0,
    dprs,
    zooms,
    viewports: viewports.map(([width, height]) => ({width, height})),
    offsetCount: 4,
    wrongSidePixels: 0,
    longestNeedlePixels: 0,
    conflictingPixels: 0,
    duplicatePixels: 0,
    seamPixels: 0,
    baselineWrongPixels: 0,
    introducedWrongPixels: 0,
    introducedOwnerPixels: 0,
    remainingWrongPixels: 0,
    repairedWrongPixels: 0,
    affected: []
  };
  const graphWidth = map.metadata.graphWidth;
  const graphHeight = map.metadata.graphHeight;
  for (const item of formalPackets) {
    if (!item.packet.boundaryCoverFallbacks.length) continue;
    summary.affectedPathCount++;
    const sourceRing = item.path.points;
    const renderRing = buildShoreRenderPoints(item.path, map);
    const landInside = typeof item.packet.landInside === "boolean" ? item.packet.landInside : inferTestLandInside(item.path);
    const affectedPath = {
      kind: item.kind,
      pathIndex: item.pathIndex,
      fallbackEdgeCount: item.packet.boundaryCoverFallbacks.length,
      edges: []
    };
    for (const fallback of item.packet.boundaryCoverFallbacks) {
      summary.fallbackEdgeCount++;
      const xs = fallback.edge.map(point => point[0]);
      const ys = fallback.edge.map(point => point[1]);
      const margin = Math.max(0.5, SHORE_VISUAL_STYLE.surfaceBoundaryCoverWorld * 4);
      const bounds = {
        minX: Math.min(...xs) - margin,
        minY: Math.min(...ys) - margin,
        maxX: Math.max(...xs) + margin,
        maxY: Math.max(...ys) + margin
      };
      const basePacket = buildFormalLocalBasePacket(cellVisualMesh, map, bounds);
      const edgeSummary = {
        side: fallback.side,
        landCell: fallback.landCell,
        waterCell: fallback.waterCell,
        edge: fallback.edge,
        phaseCount: 0,
        wrongSidePixels: 0,
        longestNeedlePixels: 0,
        conflictingPixels: 0,
        duplicatePixels: 0,
        seamPixels: 0,
        baselineWrongPixels: 0,
        introducedWrongPixels: 0,
        introducedOwnerPixels: 0,
        remainingWrongPixels: 0,
        repairedWrongPixels: 0
      };
      for (const [width, height] of viewports) {
        for (const dpr of dprs) {
          for (const zoom of zooms) {
            for (const offset of [[0.125, 0.125], [0.375, 0.625], [0.625, 0.375], [0.875, 0.875]]) {
              const projection = {x: width / graphWidth, y: height / graphHeight};
              const common = {
                sourceRings: [sourceRing],
                baseRings: [sourceRing],
                renderRings: [renderRing],
                basePacket,
                landInside,
                dpr,
                zoom,
                projection,
                offset,
                bounds,
                focusSegments: [fallback.edge],
                focusPixelRadius: 0.75,
                focusSide: fallback.side
              };
              const baseline = rasterDrawPacketPhase({
                ...common,
                packet: {
                  ...item.packet,
                  commands: item.packet.commands.filter(command =>
                    command.coverMode !== "subdivided" && command.coverMode !== "vertex"
                  )
                }
              });
              const final = rasterDrawPacketPhase({...common, packet: item.packet});
              edgeSummary.phaseCount++;
              edgeSummary.baselineWrongPixels += baseline.wrongSidePixels;
              edgeSummary.wrongSidePixels += final.wrongSidePixels;
              edgeSummary.longestNeedlePixels = Math.max(edgeSummary.longestNeedlePixels, final.longestNeedlePixels);
              edgeSummary.conflictingPixels += final.conflictingPixels;
              edgeSummary.duplicatePixels += final.duplicatePixels;
              edgeSummary.seamPixels += final.seamPixels;
              for (let pixel = 0; pixel < final.wrongMask.length; pixel++) {
                if (final.wrongMask[pixel] && !baseline.wrongMask[pixel]) edgeSummary.introducedWrongPixels++;
                if (final.wrongMask[pixel] && baseline.wrongMask[pixel]) edgeSummary.remainingWrongPixels++;
                if (!final.wrongMask[pixel] && baseline.wrongMask[pixel]) edgeSummary.repairedWrongPixels++;
                const baselineOwner = baseline.ownerMask[pixel];
                const finalOwner = final.ownerMask[pixel];
                if (baselineOwner < 0 || finalOwner < 0 || baselineOwner === finalOwner) continue;
                if (finalOwner !== final.idealOwnerMask[pixel]) edgeSummary.introducedOwnerPixels++;
              }
            }
          }
        }
      }
      summary.phaseCount += edgeSummary.phaseCount;
      summary.wrongSidePixels += edgeSummary.wrongSidePixels;
      summary.longestNeedlePixels = Math.max(summary.longestNeedlePixels, edgeSummary.longestNeedlePixels);
      summary.conflictingPixels += edgeSummary.conflictingPixels;
      summary.duplicatePixels += edgeSummary.duplicatePixels;
      summary.seamPixels += edgeSummary.seamPixels;
      summary.baselineWrongPixels += edgeSummary.baselineWrongPixels;
      summary.introducedWrongPixels += edgeSummary.introducedWrongPixels;
      summary.introducedOwnerPixels += edgeSummary.introducedOwnerPixels;
      summary.remainingWrongPixels += edgeSummary.remainingWrongPixels;
      summary.repairedWrongPixels += edgeSummary.repairedWrongPixels;
      affectedPath.edges.push(edgeSummary);
    }
    summary.affected.push(affectedPath);
  }
  return summary;
}

function buildFormalLocalBasePacket(cellVisualMesh, map, bounds) {
  const graphWidth = map.metadata.graphWidth;
  const graphHeight = map.metadata.graphHeight;
  const commands = [];
  for (const cellMesh of cellVisualMesh.cells) {
    const points = cellMesh.points || [];
    if (!points.length) continue;
    const minX = Math.min(...points.map(point => point[0]));
    const minY = Math.min(...points.map(point => point[1]));
    const maxX = Math.max(...points.map(point => point[0]));
    const maxY = Math.max(...points.map(point => point[1]));
    if (maxX < bounds.minX || minX > bounds.maxX || maxY < bounds.minY || minY > bounds.maxY) continue;
    const ndc = cellMesh.ndcTriangles;
    for (let index = 0; index < ndc.length; index += 6) {
      const positions = new Float32Array(6);
      for (let vertex = 0; vertex < 3; vertex++) {
        positions[vertex * 2] = (ndc[index + vertex * 2] + 1) * 0.5 * graphWidth;
        positions[vertex * 2 + 1] = (1 - ndc[index + vertex * 2 + 1]) * 0.5 * graphHeight;
      }
      commands.push({
        kind: "base-surface",
        side: Number(map.grid.cells.h[cellMesh.cell]) >= 20 ? "land" : "water",
        ownerCell: cellMesh.cell,
        positions
      });
    }
  }
  return {outsideSide: "water", commands};
}

function buildDrawPacketPhaseFixture() {
  const worldOffset = 0;
  const points = [
    [0, 0], [12, 0.12], [24, 0], [28, 8], [24, 16],
    [14, 15.92], [8, 13], [0, 16], [-2, 8], [0, 0]
  ].map(point => [point[0] + worldOffset, point[1] + worldOffset]);
  const renderPoints = [
    [0, -0.25], [12, -0.22], [24, -0.25], [28, 8], [24, 16],
    [14, 15.92], [8, 13], [0, 16], [-2, 8], [0, -0.25]
  ].map(point => [point[0] + worldOffset, point[1] + worldOffset]);
  const basePoints = points.map((point, index) =>
    index <= 2 || index === points.length - 1 ? [point[0], point[1] + 0.06] : [...point]
  );
  const sideVectors = points.map((point, index) => {
    const next = points[Math.min(index + 1, points.length - 1)];
    const dx = next[0] - point[0];
    const dy = next[1] - point[1];
    const length = Math.hypot(dx, dy) || 1;
    return {x: -dy / length, y: dx / length};
  });
  return {
    map: {},
    basePoints,
    path: {
      closed: true,
      points,
      sourcePoints: points,
      renderPoints,
      sideVectors,
      landCells: new Array(points.length).fill(10),
      waterCells: new Array(points.length).fill(20)
    }
  };
}

function summarizePhaseMetrics(result) {
  return {
    wrongSidePixels: result.wrongSidePixels,
    longestNeedlePixels: result.longestNeedlePixels,
    conflictingPixels: result.conflictingPixels,
    duplicatePixels: result.duplicatePixels,
    seamPixels: result.seamPixels
  };
}

function buildMultiRingStressFixture() {
  const sourceRings = [
      [[0, 0], [32, 0], [32, 22], [20, 22], [20, 14], [12, 14], [12, 22], [0, 22], [0, 0]],
      [[4, 4], [10, 4], [10, 10], [4, 10], [4, 4]]
    ];
  return {
    sourceRings,
    baseRings: [
      [[0, 0.06], [32, 0.06], [32, 22], [20, 22], [20, 14], [12, 14], [12, 22], [0, 22], [0, 0.06]],
      sourceRings[1]
    ],
    renderRings: [
      [[0, -0.25], [32, -0.25], [32, 22], [20, 22], [20, 14], [12, 14], [12, 22], [0, 22], [0, -0.25]],
      [[4.2, 4.1], [9.8, 4.2], [9.9, 9.8], [4.1, 9.9], [4.2, 4.1]]
    ],
    probes: [
      {kind: "hole", point: [7, 7]},
      {kind: "channel", point: [16, 19]},
      {kind: "land", point: [16, 8]}
    ]
  };
}

function buildStressPacketWithBoundaryCovers(correctionTriangles, boundaryRings, targetRings) {
  const covers = new Map();
  for (const triangle of correctionTriangles) {
    for (const edge of [
      [triangle.points[0], triangle.points[1]],
      [triangle.points[1], triangle.points[2]],
      [triangle.points[2], triangle.points[0]]
    ]) {
      if (!boundaryRings.some(ring => testSegmentLiesOnRing(edge, ring))) continue;
      const endpoints = edge.map(point => point.map(value => Number(value).toFixed(7)).join(":")).sort();
      const key = `${endpoints.join(">")}|${triangle.side}`;
      if (!covers.has(key)) {
        covers.set(key, {
          edge,
          side: triangle.side,
          targetRings,
          landInside: true,
          insidePoint: [
            (triangle.points[0][0] + triangle.points[1][0] + triangle.points[2][0]) / 3,
            (triangle.points[0][1] + triangle.points[1][1] + triangle.points[2][1]) / 3
          ]
        });
      }
    }
  }
  const coverTriangles = [];
  for (const cover of covers.values()) {
    for (const points of buildShoreBoundaryEdgeCoverTriangles(cover)) {
      coverTriangles.push({points, side: cover.side});
    }
  }
  return buildFloat32PacketFromCorrectionTriangles(correctionTriangles, coverTriangles);
}

function buildFallbackSpliceStressFixture() {
  return {
    smoothSegment: [[0, 0], [4, 0], [8, 2]],
    rawFallbackSegment: [[8, 2], [12, 2], [16, 0]],
    sourceLandCells: [101, 102, 103, 104, 105],
    stitchedLandCells: [101, 102, 103, 104, 105],
    sourceWaterCells: [201, 202, 203, 204, 205],
    stitchedWaterCells: [201, 202, 203, 204, 205],
    protectedDistance: 1,
    protected: {
      towns: [[8, 2.5]],
      roads: [[[12, 0], [12, 4]]],
      rivers: [[[16, -4], [16, 0]]]
    }
  };
}

function testSegmentLiesOnRing(edge, ring) {
  const middle = [(edge[0][0] + edge[1][0]) / 2, (edge[0][1] + edge[1][1]) / 2];
  return [edge[0], middle, edge[1]].every(point => testPointToRingDistance(point, ring) <= 0.000001);
}

function testPointToRingDistance(point, ring) {
  let minimum = Infinity;
  for (let index = 0; index < ring.length - 1; index++) {
    const a = ring[index];
    const b = ring[index + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared <= 0.000000001
      ? 0
      : Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared));
    minimum = Math.min(minimum, Math.hypot(point[0] - (a[0] + dx * t), point[1] - (a[1] + dy * t)));
  }
  return minimum;
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
