#!/usr/bin/env node
import {createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const args = parseArgs(process.argv.slice(2));
const host = String(args.host || "127.0.0.1");
const port = Number(args.port || 5453);
const timeoutMs = Number(args.timeout || 240000);
const browserChannel = args["browser-channel"] || "chrome";
const distDir = resolve(args.dir || join(rootDir, "dist", "webgl-generator"));
const artifactDir = resolve(args.artifacts || join(rootDir, "docs", "generated", "gis", "political-100k"));
const outPath = resolve(args.out || join(rootDir, "docs", "generated", "reports", "political-gis-browser-regression-results.json"));
const markdownPath = resolve(args.markdown || join(rootDir, "docs", "generated", "reports", "political-gis-browser-regression-results.md"));
const fixture = {seed: "political-gis-browser-100k", cellsTarget: 100000, heightmapTemplate: "continents"};

if (!existsSync(distDir)) fail(`构建产物不存在：${distDir}`);
for (const path of [artifactDir, dirname(outPath), dirname(markdownPath)]) mkdirSync(path, {recursive: true});

const playwright = await loadPlaywright(sourceDir);
const server = await startStaticServer({host, port, publicDir: distDir});
let browser = null;
try {
  browser = await launchBrowser(playwright, {headless: !args.headful, browserChannel});
  const context = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1, acceptDownloads: true});
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded", timeout: timeoutMs});
  await waitForApiReady(page, timeoutMs);
  const generation = await page.evaluate(async fixture => {
    const result = await window.webglGeneratorApi.generate.newMap({confirm: true, ...fixture});
    if (!result?.ok) throw new Error(result?.error?.message || "100k 地图生成失败");
    const summary = window.webglGeneratorApi.info.mapSummary();
    if (!summary?.ok) throw new Error(summary?.error?.message || "无法读取地图摘要");
    return summary.data;
  }, fixture);
  if ((generation.gridCells || 0) < 99000) fail(`实际 grid cells 不足 99000：${generation.gridCells || 0}`);

  await page.evaluate(() => {
    window.__politicalExportLongTasks = [];
    window.__politicalExportObserver?.disconnect?.();
    if (typeof PerformanceObserver !== "function") return;
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) window.__politicalExportLongTasks.push({startTime: entry.startTime, duration: entry.duration});
    });
    try {
      observer.observe({entryTypes: ["longtask"]});
      window.__politicalExportObserver = observer;
    } catch {}
  });

  const raw = await runBrowserExport(page, {
    dissolvePolitical: false,
    savePath: join(artifactDir, "political-100k-raw.geojson")
  });
  const dissolved = await runBrowserExport(page, {
    dissolvePolitical: true,
    savePath: join(artifactDir, "political-100k-dissolved.geojson")
  });
  const health = await page.evaluate(() => {
    const result = window.webglGeneratorApi.info.healthEvents({limit: 100});
    return result?.ok ? result.data : {error: result?.error || null};
  });
  const files = {
    raw: validatePoliticalGeoJson(raw.path, false),
    dissolved: validatePoliticalGeoJson(dissolved.path, true)
  };
  const failures = [];
  for (const item of [raw, dissolved]) {
    if (!item.downloaded || !item.recovery.apiResponsive || item.recovery.rafDelayMs > 2000) failures.push(`${item.dissolvePolitical ? "dissolve" : "raw"} 浏览器下载或页面恢复失败`);
  }
  if (JSON.stringify(files.raw.layerCounts) !== JSON.stringify(files.dissolved.layerCounts)) failures.push("普通版与 dissolve 图层数量不一致");
  const report = {
    generatedAt: new Date().toISOString(),
    fixture,
    browser: {channel: browserChannel, headless: !args.headful, consoleErrors, pageErrors},
    generation,
    exports: {raw, dissolved},
    files,
    health,
    failures,
    passed: failures.length === 0 && consoleErrors.length === 0 && pageErrors.length === 0
  };
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, renderMarkdown(report), "utf8");
  console.log(JSON.stringify({
    ok: report.passed,
    gridCells: generation.gridCells,
    packCells: generation.packCells,
    exports: {
      raw: summarizeExport(raw, files.raw),
      dissolved: summarizeExport(dissolved, files.dissolved)
    },
    healthEvents: health?.events?.length || health?.total || 0,
    consoleErrors: consoleErrors.length,
    pageErrors: pageErrors.length,
    artifacts: [raw.path, dissolved.path]
  }, null, 2));
  if (!report.passed) fail(failures.join("\n") || "浏览器政治面导出回归失败");
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(resolveClose => server.close(resolveClose));
}

async function runBrowserExport(page, options) {
  await page.evaluate(() => {
    window.__politicalExportLongTasks.length = 0;
  });
  const startedAt = Date.now();
  const [download, apiResult] = await Promise.all([
    page.waitForEvent("download", {timeout: timeoutMs}),
    page.evaluate(({dissolvePolitical}) => {
      const started = performance.now();
      const result = window.webglGeneratorApi.data.exportFeatureGEO({
        download: true,
        includeText: false,
        dissolvePolitical,
        layers: {state: true, province: true, city: false, route: false, river: false, marker: false, zone: true}
      });
      return {result, elapsedMs: performance.now() - started};
    }, options)
  ]);
  if (!apiResult.result?.ok) throw new Error(apiResult.result?.error?.message || "政治面导出失败");
  await download.saveAs(options.savePath);
  await page.waitForTimeout(250);
  const browserEvidence = await page.evaluate(async () => {
    const longTasks = [...window.__politicalExportLongTasks];
    const recoveryStarted = performance.now();
    await new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
    const summary = window.webglGeneratorApi.info.mapSummary();
    return {
      longTasks,
      totalLongTaskMs: longTasks.reduce((sum, item) => sum + item.duration, 0),
      maxLongTaskMs: Math.max(0, ...longTasks.map(item => item.duration)),
      recovery: {rafDelayMs: performance.now() - recoveryStarted, apiResponsive: Boolean(summary?.ok)}
    };
  });
  return {
    dissolvePolitical: options.dissolvePolitical,
    path: options.savePath,
    suggestedFilename: download.suggestedFilename(),
    downloaded: existsSync(options.savePath),
    fileBytes: statSync(options.savePath).size,
    apiBytes: apiResult.result.data?.bytes || 0,
    apiMetadata: apiResult.result.data?.metadata || {},
    exportCallMs: round(apiResult.elapsedMs),
    downloadElapsedMs: Date.now() - startedAt,
    longTasks: browserEvidence.longTasks.map(item => ({startTime: round(item.startTime), duration: round(item.duration)})),
    totalLongTaskMs: round(browserEvidence.totalLongTaskMs),
    maxLongTaskMs: round(browserEvidence.maxLongTaskMs),
    recovery: {rafDelayMs: round(browserEvidence.recovery.rafDelayMs), apiResponsive: browserEvidence.recovery.apiResponsive}
  };
}

function validatePoliticalGeoJson(path, dissolved) {
  const document = JSON.parse(readFileSync(path, "utf8"));
  if (document.type !== "FeatureCollection") throw new Error(`${path} 不是 FeatureCollection`);
  const layerCounts = {state: 0, province: 0, zone: 0};
  let bboxFeatures = 0;
  let participantZones = 0;
  let participantFieldZones = 0;
  const objectIds = new Set();
  for (const feature of document.features || []) {
    const layer = feature.properties?.layer;
    if (!(layer in layerCounts)) throw new Error(`${path} 含非政治图层 ${layer}`);
    if (feature.geometry?.type !== "MultiPolygon" || !feature.geometry.coordinates?.length) throw new Error(`${feature.id} 几何无效`);
    if (!Array.isArray(feature.bbox) || feature.bbox.length !== 4 || !feature.bbox.every(Number.isFinite)) throw new Error(`${feature.id} bbox 无效`);
    if (feature.properties?.dissolved !== dissolved) throw new Error(`${feature.id} dissolved 属性错误`);
    if (feature.properties?.id !== feature.id || !Number.isInteger(Number(feature.properties?.numericId))) throw new Error(`${feature.id} 外部 id / numericId 属性错误`);
    if (objectIds.has(feature.properties.id)) throw new Error(`${feature.id} 外部 id 重复`);
    objectIds.add(feature.properties.id);
    if (layer === "zone") {
      if (!("attacker" in feature.properties) || !("defender" in feature.properties)) throw new Error(`${feature.id} 缺少参与国字段`);
      participantFieldZones += 1;
      if (Number(feature.properties.attacker) || Number(feature.properties.defender)) participantZones += 1;
    }
    layerCounts[layer] += 1;
    bboxFeatures += 1;
  }
  if (!Object.values(layerCounts).every(count => count > 0)) throw new Error(`${path} 缺少国家、省份或地区图层`);
  return {
    path,
    bytes: statSync(path).size,
    features: document.features.length,
    layerCounts,
    bboxFeatures,
    participantZones,
    participantFieldZones,
    uniqueObjectIds: objectIds.size,
    dissolved: document.properties?.dissolvedPolitical === true
  };
}

function summarizeExport(item, file) {
  return {bytes: item.fileBytes, exportCallMs: item.exportCallMs, maxLongTaskMs: item.maxLongTaskMs, recoveryMs: item.recovery.rafDelayMs, layers: file.layerCounts};
}

function renderMarkdown(report) {
  const rows = [report.exports.raw, report.exports.dissolved].map(item => {
    const file = item.dissolvePolitical ? report.files.dissolved : report.files.raw;
    return `| ${item.dissolvePolitical ? "dissolve" : "普通"} | ${item.fileBytes} | ${item.exportCallMs}ms | ${item.maxLongTaskMs}ms | ${item.recovery.rafDelayMs}ms | ${file.layerCounts.state}/${file.layerCounts.province}/${file.layerCounts.zone} |`;
  });
  return `# 政治面 100k 浏览器导出报告\n\n- seed：\`${report.fixture.seed}\`\n- grid / pack cells：${report.generation.gridCells} / ${report.generation.packCells}\n- 浏览器：${report.browser.channel}\n- 结果：${report.passed ? "通过" : "失败"}\n\n| 模式 | 文件字节 | 导出调用 | 最大 longtask | 页面恢复 | 国家/省份/地区 |\n|---|---:|---:|---:|---:|---:|\n${rows.join("\n")}\n`;
}

async function startStaticServer({host, port, publicDir}) {
  const server = createServer((request, response) => {
    const url = new URL(request.url || "/", `http://${host}:${port}`);
    const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const target = resolve(publicDir, `.${normalize(pathname)}`);
    if (!target.startsWith(publicDir)) return void response.writeHead(403).end("Forbidden");
    if (!existsSync(target) || !statSync(target).isFile()) return void response.writeHead(404).end("Not found");
    response.writeHead(200, {"content-type": contentType(target), "cache-control": "no-store"});
    createReadStream(target).pipe(response);
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, host, resolveListen);
  });
  return server;
}

function contentType(path) {
  const ext = extname(path).toLowerCase();
  if (ext === ".html") return "text/html;charset=utf-8";
  if (ext === ".js") return "text/javascript;charset=utf-8";
  if (ext === ".css") return "text/css;charset=utf-8";
  if (ext === ".png") return "image/png";
  return "application/octet-stream";
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    const [key, inline] = argv[index].slice(2).split("=");
    parsed[key] = inline ?? argv[++index] ?? true;
  }
  return parsed;
}

async function loadPlaywright(sourceDirectory) {
  try {
    return createRequire(join(sourceDirectory, "package.json"))("playwright");
  } catch (error) {
    fail(`无法加载 Playwright：${error.message}`);
  }
}

async function launchBrowser(playwright, options) {
  try {
    return await playwright.chromium.launch({headless: options.headless, channel: options.browserChannel});
  } catch (error) {
    fail(`无法启动系统浏览器：${error.message}`);
  }
}

function round(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
