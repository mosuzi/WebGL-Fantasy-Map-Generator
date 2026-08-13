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
const port = Number(args.port || 5455);
const timeoutMs = Number(args.timeout || 180000);
const browserChannel = args["browser-channel"] || "chrome";
const distDir = resolve(args.dir || join(rootDir, "dist", "webgl-generator"));
const artifactDir = resolve(args.artifacts || join(rootDir, "docs", "generated", "gis", "geojson-range-browser"));
const outPath = resolve(args.out || join(rootDir, "docs", "generated", "reports", "geojson-range-browser-regression-results.json"));
const bbox = [360, 240, 1080, 720];
const layers = {state: true, province: true, city: true, route: true, river: true, marker: true, zone: true};

if (!existsSync(distDir)) fail(`构建产物不存在：${distDir}`);
for (const path of [artifactDir, dirname(outPath)]) mkdirSync(path, {recursive: true});

const playwright = await loadPlaywright(sourceDir);
const server = await startStaticServer({host, port, publicDir: distDir});
let browser = null;
try {
  browser = await playwright.chromium.launch({headless: !args.headful, channel: browserChannel});
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
  const generation = await page.evaluate(async () => {
    const generated = await window.webglGeneratorApi.generate.newMap({confirm: true, seed: "geojson-range-browser", cellsTarget: 3000, heightmapTemplate: "continents"});
    if (!generated?.ok) throw new Error(generated?.error?.message || "地图生成失败");
    window.__webglGeneratorApp.renderer.camera.scale = 2;
    window.__webglGeneratorApp.renderer.camera.offsetX = 0;
    window.__webglGeneratorApp.renderer.camera.offsetY = 0;
    window.__webglGeneratorApp.renderer.draw();
    return window.webglGeneratorApi.info.mapSummary().data;
  });

  const exports = {
    packViewport: await exportGeoJson(page, "pack", {range: {mode: "viewport"}}, join(artifactDir, "pack-viewport.geojson")),
    packBbox: await exportGeoJson(page, "pack", {range: {mode: "bbox", bbox}}, join(artifactDir, "pack-bbox.geojson")),
    featuresRaw: await exportGeoJson(page, "features", {range: {mode: "bbox", bbox}, layers, dissolvePolitical: false}, join(artifactDir, "features-raw.geojson")),
    featuresDissolved: await exportGeoJson(page, "features", {range: {mode: "bbox", bbox}, layers, dissolvePolitical: true}, join(artifactDir, "features-dissolved.geojson"))
  };
  const files = Object.fromEntries(Object.entries(exports).map(([key, item]) => [key, inspectGeoJson(item.path)]));
  const rejection = await page.evaluate(async () => ({
    empty: await window.webglGeneratorApi.data.exportGEO({includeText: false, range: {mode: "bbox", bbox: [10, 10, 10, 20]}}),
    outside: window.webglGeneratorApi.data.exportFeatureGEO({includeText: false, range: {mode: "bbox", bbox: [-1, 0, 10, 10]}})
  }));
  const ui = await page.evaluate(() => ({
    mode: Boolean(document.getElementById("geojson-export-range-mode")),
    bboxFields: ["min-x", "min-y", "max-x", "max-y"].every(suffix => Boolean(document.getElementById(`geojson-export-bbox-${suffix}`)))
  }));
  const health = await page.evaluate(() => window.webglGeneratorApi.info.healthEvents({limit: 100}).data);
  const failures = [];
  if (JSON.stringify(files.packViewport.ids) !== JSON.stringify(files.packBbox.ids)) failures.push("当前视口与同范围显式 bbox 的 pack 集合不一致");
  if (JSON.stringify(politicalIds(files.featuresRaw.document)) !== JSON.stringify(politicalIds(files.featuresDissolved.document))) failures.push("普通与 dissolve 政治面范围集合不一致");
  if (rejection.empty?.ok !== false || !/不能为空/.test(rejection.empty?.error?.message || "")) failures.push("空 bbox 未结构化拒绝");
  if (rejection.outside?.ok !== false || !/超出地图世界边界/.test(rejection.outside?.error?.message || "")) failures.push("越界 bbox 未结构化拒绝");
  if (!ui.mode || !ui.bboxFields) failures.push("导出面板缺少 GeoJSON 共享范围控件");
  for (const [key, item] of Object.entries(files)) {
    if (!item.valid) failures.push(`${key} 文件结构无效`);
    if (JSON.stringify(item.document.properties.exportRange.worldBbox) !== JSON.stringify(bbox)) failures.push(`${key} 文件范围元数据错误`);
    if (item.document.properties.coordinateReferenceDetail.authority !== null || item.document.properties.coordinateReferenceDetail.identifier !== null) failures.push(`${key} 伪造了 CRS 标识`);
  }
  const report = {
    generatedAt: new Date().toISOString(),
    browser: {channel: browserChannel, headless: !args.headful, consoleErrors, pageErrors},
    generation,
    bbox,
    exports,
    files: Object.fromEntries(Object.entries(files).map(([key, item]) => [key, publicFileSummary(item)])),
    rejection,
    ui,
    health,
    failures,
    passed: failures.length === 0 && consoleErrors.length === 0 && pageErrors.length === 0
  };
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    ok: report.passed,
    generation: {gridCells: generation.gridCells, packCells: generation.packCells},
    files: report.files,
    rejection: {empty: rejection.empty?.error?.message, outside: rejection.outside?.error?.message},
    ui,
    healthErrors: (health?.events || []).filter(event => event.severity === "error").length,
    consoleErrors: consoleErrors.length,
    pageErrors: pageErrors.length
  }, null, 2));
  if (!report.passed) fail(failures.join("\n") || "GeoJSON 范围浏览器回归失败");
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(resolveClose => server.close(resolveClose));
}

async function exportGeoJson(page, kind, options, path) {
  const [download, result] = await Promise.all([
    page.waitForEvent("download", {timeout: timeoutMs}),
    page.evaluate(({kind, options}) => {
      const api = kind === "pack" ? window.webglGeneratorApi.data.exportGEO : window.webglGeneratorApi.data.exportFeatureGEO;
      return api({...options, download: true, includeText: false});
    }, {kind, options})
  ]);
  if (!result?.ok) throw new Error(result?.error?.message || `${kind} GeoJSON 导出失败`);
  await download.saveAs(path);
  return {path, bytes: statSync(path).size, suggestedFilename: download.suggestedFilename(), metadata: result.data.metadata};
}

function inspectGeoJson(path) {
  const document = JSON.parse(readFileSync(path, "utf8"));
  const ids = document.features.map(feature => String(feature.id)).sort();
  const rangeBbox = document.properties?.exportRange?.coordinateBbox;
  const featureBboxesValid = document.features.every(feature => Array.isArray(feature.bbox)
    && feature.bbox.length === 4
    && feature.bbox.every(Number.isFinite)
    && bboxesIntersect(feature.bbox, rangeBbox));
  return {
    document,
    ids,
    bytes: statSync(path).size,
    features: document.features.length,
    bbox: document.bbox,
    valid: document.type === "FeatureCollection"
      && Array.isArray(document.features)
      && Array.isArray(document.bbox)
      && featureBboxesValid
      && document.properties?.exportRange?.inclusion === "intersects-complete-feature"
      && document.properties?.exportRange?.geometriesClipped === false
  };
}

function publicFileSummary(item) {
  return {bytes: item.bytes, features: item.features, bbox: item.bbox, valid: item.valid};
}

function politicalIds(document) {
  return document.features
    .filter(feature => ["state", "province", "zone"].includes(feature.properties?.layer))
    .map(feature => String(feature.id))
    .sort();
}

function bboxesIntersect(left, right) {
  return Array.isArray(right) && left[0] <= right[2] && left[2] >= right[0] && left[1] <= right[3] && left[3] >= right[1];
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

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
  throw new Error(message);
}
