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
const port = Number(args.port || 5454);
const timeoutMs = Number(args.timeout || 180000);
const browserChannel = args["browser-channel"] || "chrome";
const distDir = resolve(args.dir || join(rootDir, "dist", "webgl-generator"));
const artifactDir = resolve(args.artifacts || join(rootDir, "docs", "generated", "png", "crop-browser"));
const outPath = resolve(args.out || join(rootDir, "docs", "generated", "reports", "png-crop-browser-regression-results.json"));

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
  const performanceConsoleErrors = [];
  const pageErrors = [];
  page.on("console", message => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/\[FMG health\] (?:main-thread-long-task|render-frame-gap)/.test(text)) performanceConsoleErrors.push(text);
    else consoleErrors.push(text);
  });
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded", timeout: timeoutMs});
  await waitForApiReady(page, timeoutMs);
  const generation = await page.evaluate(async () => {
    const generated = await window.webglGeneratorApi.generate.newMap({confirm: true, seed: "png-crop-browser", cellsTarget: 3000, heightmapTemplate: "continents"});
    if (!generated?.ok) throw new Error(generated?.error?.message || "地图生成失败");
    const measurement = window.webglGeneratorApi.edit.measurements.save([{x: 360, y: 240}, {x: 720, y: 480}, {x: 960, y: 280}], {name: "PNG 测量叠层"});
    if (!measurement?.ok) throw new Error(measurement?.error?.message || "测量对象创建失败");
    const visible = window.webglGeneratorApi.layers.setVisible("measurements", true);
    if (!visible?.ok) throw new Error(visible?.error?.message || "测量图层开启失败");
    return window.webglGeneratorApi.info.mapSummary().data;
  });

  const exports = {};
  exports.default = await exportPng(page, join(artifactDir, "default.png"), {});
  exports.pixel = await exportPng(page, join(artifactDir, "pixel-2x.png"), {
    pixelScale: 2,
    includeMapOverlays: false,
    crop: {mode: "pixel", rect: {x: 20, y: 30, width: 320, height: 180}}
  });
  exports.world = await exportPng(page, join(artifactDir, "world.png"), {
    includeMapOverlays: false,
    crop: {mode: "world", rect: {x: 360, y: 240, width: 720, height: 480}}
  });
  exports.noOverlays = await exportPng(page, join(artifactDir, "no-overlays.png"), {
    crop: {mode: "pixel", rect: {x: 0, y: 0, width: 640, height: 420}},
    overlays: {labels: false, cityIcons: false, markers: false, military: false, measurements: false, legend: false, scaleBar: false}
  });
  exports.labelsOnly = await exportPng(page, join(artifactDir, "labels-only.png"), {
    crop: {mode: "pixel", rect: {x: 0, y: 0, width: 640, height: 420}},
    overlays: {labels: true, cityIcons: false, markers: false, military: false, measurements: false, legend: false, scaleBar: false}
  });
  exports.measurementsOnly = await exportPng(page, join(artifactDir, "measurements-only.png"), {
    crop: {mode: "pixel", rect: {x: 0, y: 0, width: 640, height: 420}},
    overlays: {labels: false, cityIcons: false, markers: false, military: false, measurements: true, legend: false, scaleBar: false}
  });

  const rejection = await page.evaluate(async () => window.webglGeneratorApi.data.exportPNG({
    download: false,
    includeDataUrl: false,
    crop: {mode: "pixel", rect: {x: -1, y: 0, width: 20, height: 20}}
  }));
  const cameraAfter = await page.evaluate(() => ({...window.__webglGeneratorApp.renderer.camera}));
  const failures = [];
  if (exports.pixel.file.width !== 640 || exports.pixel.file.height !== 360) failures.push("2x 像素裁剪文件尺寸错误");
  if (JSON.stringify(exports.world.api.crop.rect) !== JSON.stringify({x: 360, y: 240, width: 720, height: 480})) failures.push("世界坐标边界未原样返回");
  if (exports.noOverlays.file.bytes === exports.labelsOnly.file.bytes) failures.push("标签 overlay 开关未改变 PNG 文件");
  if (exports.noOverlays.file.bytes === exports.measurementsOnly.file.bytes) failures.push("测量 overlay 开关未改变 PNG 文件");
  if (rejection?.ok !== false || !/超出有效范围/.test(rejection?.error?.message || "")) failures.push("越界裁剪没有结构化拒绝");
  if (Math.abs(cameraAfter.scale - 1) > 1e-9 || Math.abs(cameraAfter.offsetX) > 1e-9 || Math.abs(cameraAfter.offsetY) > 1e-9) failures.push("世界坐标导出后相机未恢复");
  for (const item of Object.values(exports)) {
    if (item.file.width !== item.api.width || item.file.height !== item.api.height) failures.push(`${item.path} 文件尺寸与 API 元数据不一致`);
  }
  const report = {
    generatedAt: new Date().toISOString(),
    browser: {channel: browserChannel, headless: !args.headful, consoleErrors, performanceConsoleErrors, pageErrors},
    generation,
    exports,
    rejection,
    cameraAfter,
    failures,
    passed: failures.length === 0 && consoleErrors.length === 0 && pageErrors.length === 0
  };
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    ok: report.passed,
    generation: {gridCells: generation.gridCells, packCells: generation.packCells},
    files: Object.fromEntries(Object.entries(exports).map(([key, value]) => [key, value.file])),
    rejection: rejection?.error?.message || null,
    cameraAfter,
    consoleErrors: consoleErrors.length,
    pageErrors: pageErrors.length
  }, null, 2));
  if (!report.passed) fail(failures.join("\n") || "PNG 浏览器回归失败");
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(resolveClose => server.close(resolveClose));
}

async function exportPng(page, path, options) {
  const [download, result] = await Promise.all([
    page.waitForEvent("download", {timeout: timeoutMs}),
    page.evaluate(options => window.webglGeneratorApi.data.exportPNG({...options, download: true}), options)
  ]);
  if (!result?.ok) throw new Error(result?.error?.message || "PNG 导出失败");
  await download.saveAs(path);
  return {path, api: result.data, file: inspectPng(path)};
}

function inspectPng(path) {
  const bytes = readFileSync(path);
  if (bytes.length < 24 || bytes.toString("hex", 0, 8) !== "89504e470d0a1a0a") throw new Error(`${path} 不是有效 PNG`);
  return {bytes: statSync(path).size, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
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
