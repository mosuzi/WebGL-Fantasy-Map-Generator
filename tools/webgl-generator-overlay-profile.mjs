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
const port = Number(args.port || 5448);
const timeoutMs = Number(args.timeout || 240000);
const cells = Number(args.cells || 10000);
const seed = String(args.seed || "overlay-profile-smoke");
const template = String(args.template || "continents");
const graphWidth = Number(args.width || 1440);
const graphHeight = Number(args.height || 960);
const browserChannel = args["browser-channel"] || args.channel || "chrome";
const distDir = resolve(args.dir || join(rootDir, "dist", "webgl-generator"));
const outPath = resolve(args.out || join(rootDir, "docs", "generated", "reports", "overlay-profile-results.json"));
const markdownPath = resolve(args.markdown || join(rootDir, "docs", "generated", "reports", "overlay-profile-results.md"));
const viewport = parseViewport(args.viewport || "1280x820");
const maxFrameP95Ms = Number(args["max-frame-p95-ms"] || 80);
const maxOverlayP95Ms = Number(args["max-overlay-p95-ms"] || 35);
const variants = parseVariants(args.variants || args.variant || "full");

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
        cities: true,
        labels: true,
        stateLabels: true,
        markers: true,
        resources: true,
        military: true,
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
  await generateCase(page, {cells, seed, template, graphWidth, graphHeight});

  const failures = [];
  const variantReports = [];
  for (const variant of variants) {
    await applyVariant(page, variant);
    const initialStats = await readStats(page);
    const zoom = await profileZoom(page);
    const pan = await profilePan(page);
    const finalStats = await readStats(page);
    const interactions = [zoom, pan];
    variantReports.push({id: variant.id, label: variant.label, initialStats, finalStats, interactions});
    for (const item of interactions) {
      if (item.frames.p95Ms > maxFrameP95Ms) failures.push(`${variant.label} / ${item.label} 帧 p95 ${item.frames.p95Ms}ms 超过 ${maxFrameP95Ms}ms`);
      if (item.overlay.totalP95Ms > maxOverlayP95Ms) failures.push(`${variant.label} / ${item.label} overlay p95 ${item.overlay.totalP95Ms}ms 超过 ${maxOverlayP95Ms}ms`);
      if (item.glErrors.some(value => value !== 0)) failures.push(`${variant.label} / ${item.label} WebGL error 不为 0`);
    }
  }
  const interactions = variantReports.flatMap(variant => variant.interactions.map(item => ({...item, variant: variant.id, variantLabel: variant.label})));

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
      variants: variants.map(variant => variant.id),
      maxFrameP95Ms,
      maxOverlayP95Ms,
      consoleErrors
    },
    initialStats: variantReports[0]?.initialStats || null,
    finalStats: variantReports.at(-1)?.finalStats || null,
    variants: variantReports,
    interactions,
    failures,
    passed: !consoleErrors.length && failures.length === 0
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
  await new Promise(resolveClose => server.close(resolveClose));
}

async function generateCase(page, {cells, seed, template, graphWidth, graphHeight}) {
  await page.waitForSelector("#cells-input", {state: "attached", timeout: timeoutMs});
  await page.evaluate(({cells, seed, template, graphWidth, graphHeight}) => {
    window.__overlayProfilePreviousMap = window.__webglGeneratorApp?.map || null;
    document.getElementById("auto-random-seed").checked = false;
    document.getElementById("seed-input").value = seed;
    document.getElementById("cells-input").value = String(cells);
    document.getElementById("width-input").value = String(graphWidth);
    document.getElementById("height-input").value = String(graphHeight);
    document.getElementById("heightmap-template").value = template;
    document.getElementById("generate-map").click();
  }, {cells, seed, template, graphWidth, graphHeight});

  await page.waitForFunction(
    expected => {
      const app = window.__webglGeneratorApp;
      const loading = document.getElementById("generation-loading");
      return app?.map &&
        app.map !== window.__overlayProfilePreviousMap &&
        app.map.metadata?.seed === expected.seed &&
        app.map.metadata?.cellsTarget === expected.cells &&
        app.renderer?.getStats?.()?.draw?.glError === 0 &&
        loading?.hidden === true;
    },
    {cells, seed},
    {timeout: timeoutMs}
  );
}

async function profileZoom(page) {
  const canvasBox = await page.locator("#map-canvas").boundingBox();
  const center = canvasCenter(canvasBox);
  await page.mouse.move(center.x, center.y);
  await startFrameRecorder(page);
  const samples = [];
  for (let index = 0; index < 18; index++) {
    await page.mouse.wheel(0, index < 9 ? -220 : 170);
    await delay(34);
    samples.push(await readStats(page));
  }
  const frames = await stopFrameRecorder(page);
  return summarizeInteraction("zoom", "连续滚轮缩放", samples, frames);
}

async function profilePan(page) {
  const canvasBox = await page.locator("#map-canvas").boundingBox();
  const center = canvasCenter(canvasBox);
  await page.mouse.move(center.x - 150, center.y - 60);
  await startFrameRecorder(page);
  await page.mouse.down({button: "middle"});
  const samples = [];
  for (let index = 0; index < 24; index++) {
    const t = index / 23;
    const x = center.x - 150 + Math.sin(t * Math.PI * 2) * 180;
    const y = center.y - 60 + Math.cos(t * Math.PI * 2) * 90;
    await page.mouse.move(x, y, {steps: 2});
    await delay(24);
    samples.push(await readStats(page));
  }
  await page.mouse.up({button: "middle"});
  const frames = await stopFrameRecorder(page);
  return summarizeInteraction("pan", "中键拖动画布", samples, frames);
}

async function applyVariant(page, variant) {
  await page.evaluate(id => {
    const renderer = window.__webglGeneratorApp?.renderer;
    if (!renderer) return;
    if (id === "noRoutesRivers") {
      renderer.setLayerVisible("routes", false);
      renderer.setLayerVisible("rivers", false);
      return;
    }
    renderer.setLayerVisible("routes", true);
    renderer.setLayerVisible("rivers", true);
  }, variant.id);
  await page.waitForTimeout(150);
}

async function startFrameRecorder(page) {
  await page.evaluate(() => {
    const profile = {
      frames: [],
      longTasks: [],
      running: true,
      lastFrameAt: 0,
      observer: null
    };
    if ("PerformanceObserver" in window) {
      try {
        profile.observer = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) profile.longTasks.push({startTime: entry.startTime, duration: entry.duration});
        });
        profile.observer.observe({entryTypes: ["longtask"]});
      } catch {
        profile.observer = null;
      }
    }
    function tick(now) {
      if (profile.lastFrameAt) profile.frames.push(now - profile.lastFrameAt);
      profile.lastFrameAt = now;
      if (profile.running) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    window.__webglGeneratorOverlayProfile = profile;
  });
}

async function stopFrameRecorder(page) {
  return page.evaluate(() => {
    const profile = window.__webglGeneratorOverlayProfile;
    if (!profile) return {frames: [], longTasks: []};
    profile.running = false;
    profile.observer?.disconnect?.();
    return {
      frames: profile.frames,
      longTasks: profile.longTasks
    };
  });
}

async function readStats(page) {
  return page.evaluate(() => {
    const stats = window.__webglGeneratorApp?.renderer?.getStats?.() || {};
    return {
      drawMs: stats.draw?.drawMs || 0,
      glError: stats.draw?.glError ?? null,
      camera: stats.camera || null,
      overlay: stats.overlay?.update || {},
      overlayChildCount: stats.overlay?.childCount || 0,
      labelCount: stats.labelCount || 0,
      visibleLabelCount: stats.visibleLabelCount || 0,
      cityIconCount: stats.cityIconCount || 0,
      visibleCityIconCount: stats.visibleCityIconCount || 0,
      markerIconCount: stats.markerIconCount || 0,
      visibleMarkerIconCount: stats.visibleMarkerIconCount || 0,
      militaryIconCount: stats.militaryIconCount || 0,
      visibleMilitaryIconCount: stats.visibleMilitaryIconCount || 0,
      routeBuildMs: stats.routeBuildMs || 0,
      routeVertexCount: stats.routeVertexCount || 0,
      routeRenderStats: stats.routeRenderStats || {},
      riverBuildMs: stats.riverBuildMs || 0,
      riverVertexCount: stats.riverVertexCount || 0,
      riverWidthStats: stats.riverWidthStats || {},
      selectionBuildMs: stats.selectionBuildMs || 0,
      selectionVertexCount: stats.selectionVertexCount || 0
    };
  });
}

function summarizeInteraction(id, label, samples, frameData) {
  const overlayTotals = samples.map(sample => sample.overlay?.totalMs || 0);
  const draws = samples.map(sample => sample.drawMs || 0);
  return {
    id,
    label,
    sampleCount: samples.length,
    frames: summarizeMs(frameData.frames || []),
    longTasks: (frameData.longTasks || []).map(item => ({
      startTime: roundMs(item.startTime),
      duration: roundMs(item.duration)
    })),
    draw: {
      averageMs: averageMs(draws),
      p95Ms: percentileMs(draws, 0.95),
      maxMs: maxMs(draws)
    },
    overlay: {
      averageMs: averageMs(overlayTotals),
      totalP95Ms: percentileMs(overlayTotals, 0.95),
      maxMs: maxMs(overlayTotals),
      labelsAverageMs: averageMs(samples.map(sample => sample.overlay?.labelsMs || 0)),
      cityIconsAverageMs: averageMs(samples.map(sample => sample.overlay?.cityIconsMs || 0)),
      markerIconsAverageMs: averageMs(samples.map(sample => sample.overlay?.markerIconsMs || 0)),
      militaryIconsAverageMs: averageMs(samples.map(sample => sample.overlay?.militaryIconsMs || 0)),
      selectionAverageMs: averageMs(samples.map(sample => sample.overlay?.selectionMs || 0))
    },
    dynamic: {
      routeBuildAverageMs: averageMs(samples.map(sample => sample.routeBuildMs || 0)),
      routeBuildP95Ms: percentileMs(samples.map(sample => sample.routeBuildMs || 0), 0.95),
      riverBuildAverageMs: averageMs(samples.map(sample => sample.riverBuildMs || 0)),
      riverBuildP95Ms: percentileMs(samples.map(sample => sample.riverBuildMs || 0), 0.95),
      selectionBuildAverageMs: averageMs(samples.map(sample => sample.selectionBuildMs || 0)),
      selectionBuildP95Ms: percentileMs(samples.map(sample => sample.selectionBuildMs || 0), 0.95)
    },
    counts: summarizeCounts(samples),
    glErrors: [...new Set(samples.map(sample => sample.glError))]
  };
}

function summarizeCounts(samples) {
  const last = samples.at(-1) || {};
  return {
    overlayChildCount: last.overlayChildCount || 0,
    routeVertices: last.routeVertexCount || 0,
    routeCull: last.routeRenderStats?.culledRoutes || 0,
    routeRendered: last.routeRenderStats?.renderedRoutes || 0,
    riverVertices: last.riverVertexCount || 0,
    riverCull: last.riverWidthStats?.culledRivers || 0,
    riverRendered: last.riverWidthStats?.rivers || 0,
    selectionVertices: last.selectionVertexCount || 0,
    labels: {total: last.labelCount || 0, visible: last.visibleLabelCount || 0},
    cityIcons: {total: last.cityIconCount || 0, visible: last.visibleCityIconCount || 0},
    markerIcons: {total: last.markerIconCount || 0, visible: last.visibleMarkerIconCount || 0},
    militaryIcons: {total: last.militaryIconCount || 0, visible: last.visibleMilitaryIconCount || 0}
  };
}

function summarizeMs(values) {
  return {
    count: values.length,
    averageMs: averageMs(values),
    p95Ms: percentileMs(values, 0.95),
    maxMs: maxMs(values)
  };
}

function averageMs(values) {
  if (!values.length) return 0;
  return roundMs(values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length);
}

function percentileMs(values, percentile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentile) - 1));
  return roundMs(sorted[index]);
}

function maxMs(values) {
  return values.length ? roundMs(Math.max(...values)) : 0;
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# WebGL Overlay 交互性能报告", "");
  lines.push(`- 生成时间：${report.metadata.generatedAt}`);
  lines.push(`- seed：\`${report.metadata.seed}\``);
  lines.push(`- 地形模板：\`${report.metadata.template}\``);
  lines.push(`- cells：\`${report.metadata.cells}\``);
  lines.push(`- 帧 p95 上限：\`${report.metadata.maxFrameP95Ms}ms\``);
  lines.push(`- overlay p95 上限：\`${report.metadata.maxOverlayP95Ms}ms\``);
  lines.push(`- 结论：${report.passed ? "通过" : "失败"}`);
  lines.push("");
  lines.push("## 初始 overlay", "");
  for (const variant of report.variants) {
    lines.push(`### ${variant.label}`, "");
    lines.push(`- overlay 节点：${variant.initialStats.overlayChildCount}`);
    lines.push(`- 标签：${variant.initialStats.visibleLabelCount} / ${variant.initialStats.labelCount}`);
    lines.push(`- 城市图标：${variant.initialStats.visibleCityIconCount} / ${variant.initialStats.cityIconCount}`);
    lines.push(`- marker 图标：${variant.initialStats.visibleMarkerIconCount} / ${variant.initialStats.markerIconCount}`);
    lines.push(`- 军事图标：${variant.initialStats.visibleMilitaryIconCount} / ${variant.initialStats.militaryIconCount}`);
    lines.push(`- route vertices：${variant.initialStats.routeVertexCount}`);
    lines.push(`- river vertices：${variant.initialStats.riverVertexCount}`);
    lines.push("");
  }
  lines.push("");
  lines.push("## 交互摘要", "");
  lines.push("| 变体 | 场景 | 样本 | 帧均值 | 帧 p95 | 帧最大 | draw 均值 | overlay 均值 | overlay p95 | overlay 最大 | 长任务 |");
  lines.push("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const item of report.interactions) {
    lines.push(`| ${item.variantLabel} | ${item.label} | ${item.sampleCount} | ${item.frames.averageMs}ms | ${item.frames.p95Ms}ms | ${item.frames.maxMs}ms | ${item.draw.averageMs}ms | ${item.overlay.averageMs}ms | ${item.overlay.totalP95Ms}ms | ${item.overlay.maxMs}ms | ${item.longTasks.length} |`);
  }
  lines.push("");
  lines.push("## overlay 分项均值", "");
  lines.push("| 变体 | 场景 | labels | city icons | marker icons | military icons | selection |");
  lines.push("|---|---|---:|---:|---:|---:|---:|");
  for (const item of report.interactions) {
    lines.push(`| ${item.variantLabel} | ${item.label} | ${item.overlay.labelsAverageMs}ms | ${item.overlay.cityIconsAverageMs}ms | ${item.overlay.markerIconsAverageMs}ms | ${item.overlay.militaryIconsAverageMs}ms | ${item.overlay.selectionAverageMs}ms |`);
  }
  lines.push("");
  lines.push("## 动态线层分项", "");
  lines.push("| 变体 | 场景 | route 均值 | route p95 | route 渲染/筛掉 | river 均值 | river p95 | river 渲染/筛掉 | selection 均值 | selection p95 |");
  lines.push("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const item of report.interactions) {
    lines.push(`| ${item.variantLabel} | ${item.label} | ${item.dynamic.routeBuildAverageMs}ms | ${item.dynamic.routeBuildP95Ms}ms | ${item.counts.routeRendered}/${item.counts.routeCull} | ${item.dynamic.riverBuildAverageMs}ms | ${item.dynamic.riverBuildP95Ms}ms | ${item.counts.riverRendered}/${item.counts.riverCull} | ${item.dynamic.selectionBuildAverageMs}ms | ${item.dynamic.selectionBuildP95Ms}ms |`);
  }
  if (report.failures.length) {
    lines.push("", "## 失败项", "");
    for (const failure of report.failures) lines.push(`- ${failure}`);
  }
  if (report.metadata.consoleErrors.length) {
    lines.push("", "## Console Errors", "");
    for (const error of report.metadata.consoleErrors) lines.push(`- ${error}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function renderFailureSummary(report) {
  const lines = ["Overlay 交互性能守门失败："];
  for (const failure of report.failures) lines.push(`- ${failure}`);
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

function getContentType(file) {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png"
  };
  return types[extname(file).toLowerCase()] || "application/octet-stream";
}

async function loadPlaywright(packageDir) {
  const requireFromSource = createRequire(join(packageDir, "package.json"));
  return requireFromSource("playwright");
}

async function launchBrowser(playwright, {headless, browserChannel}) {
  return playwright.chromium.launch({
    headless,
    channel: browserChannel || undefined
  });
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
  const match = /^(\d+)x(\d+)$/i.exec(String(value || ""));
  if (!match) return {width: 1280, height: 820};
  return {width: Number(match[1]), height: Number(match[2])};
}

function parseVariants(value) {
  return String(value || "full")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean)
    .map(id => {
      if (id === "noRoutesRivers") return {id, label: "关闭路线和河流"};
      if (id === "full") return {id, label: "完整图层"};
      return {id, label: id};
    });
}

function canvasCenter(box) {
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2
  };
}

function roundMs(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
