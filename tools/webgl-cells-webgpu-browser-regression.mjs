#!/usr/bin/env node
import assert from "node:assert/strict";
import {createReadStream, existsSync, mkdirSync, statSync, writeFileSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {extname, join, resolve, sep} from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist", "webgl-generator");
const output = join(root, "work", "task412-webgpu");
const require = createRequire(join(root, "source", "Fantasy-Map-Generator", "package.json"));
const playwright = require("playwright");
const {PNG} = require("pngjs");
const types = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json"};
assert.ok(existsSync(join(dist, "prototype", "webgl-cells", "webgpu.html")), "请先构建 WebGPU demo");
mkdirSync(output, {recursive: true});
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const target = resolve(dist, `.${pathname.endsWith("/") ? `${pathname}index.html` : pathname}`);
  if (!target.startsWith(dist + sep) || !existsSync(target) || !statSync(target).isFile()) { response.writeHead(404).end(); return; }
  response.setHeader("Content-Type", types[extname(target)] || "application/octet-stream");
  createReadStream(target).pipe(response);
});
await new Promise(done => server.listen(0, "127.0.0.1", done));

let browser;
try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const base = `http://127.0.0.1:${server.address().port}/prototype/webgl-cells/webgpu.html`;
  const page = await browser.newPage({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1});
  await page.addInitScript(() => {
    window.__cellDemoLongTasks = [];
    window.__cellDemoLongTaskSupported = PerformanceObserver.supportedEntryTypes?.includes("longtask") === true;
    if (window.__cellDemoLongTaskSupported) {
      new PerformanceObserver(list => window.__cellDemoLongTasks.push(...list.getEntries().map(entry => ({startTime: entry.startTime, durationMs: entry.duration})))).observe({type: "longtask", buffered: true});
    }
  });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(base, {waitUntil: "domcontentloaded"});
  await page.waitForFunction(() => window.__webgpuCellDemo?.getState?.().ready, null, {timeout: 120000});
  const initial = await page.evaluate(() => window.__webgpuCellDemo.getState());
  assert.equal(await page.evaluate(() => window.__cellDemoLongTaskSupported), true, "主对照浏览器未开放 LongTask 监控");
  assert.equal(initial.webgpu, true, "主对照浏览器未能启用 WebGPU，不能计为双后端通过");
  assert.equal(initial.cells, 99846);
  assert.equal(initial.vertices, 1795563);
  assert.equal(initial.colors, initial.vertices * 3);
  assert.equal(initial.canvas.width, initial.canvas.gpuWidth);
  assert.equal(initial.canvas.height, initial.canvas.gpuHeight);
  assert.equal(initial.glError, 0);

  const heightGl = await page.locator("#webgl-canvas").screenshot({path: join(output, "height-webgl.png")});
  const heightGpu = initial.webgpu ? await captureVisibleCanvas(page, "#webgpu-canvas", join(output, "height-webgpu.png")) : null;
  const heightGlStats = imageStats(PNG.sync.read(heightGl));
  assert.ok(heightGlStats.distinct > 32, "WebGL2 色面没有可见地图细节");
  const heightComparison = heightGpu ? compareImages(PNG.sync.read(heightGl), PNG.sync.read(heightGpu)) : null;
  if (heightComparison) assert.ok(heightComparison.meanRgbError < 7, `两后端高度色面差异过大：${heightComparison.meanRgbError}`);

  await page.getByRole("button", {name: "国家"}).click();
  await page.evaluate(() => window.__webgpuCellDemo.waitForGpu());
  const states = await page.evaluate(() => window.__webgpuCellDemo.getState());
  assert.equal(states.mode, "states");
  assert.equal(states.glError, 0);
  const stateGl = await page.locator("#webgl-canvas").screenshot({path: join(output, "states-webgl.png")});
  assert.notDeepEqual(stateGl, heightGl, "国家专题未改变画面");
  const stateGpu = states.webgpu ? await captureVisibleCanvas(page, "#webgpu-canvas", join(output, "states-webgpu.png"), 8) : null;
  const stateComparison = stateGpu ? compareImages(PNG.sync.read(stateGl), PNG.sync.read(stateGpu)) : null;
  if (stateComparison) assert.ok(stateComparison.meanRgbError < 7, `两后端国家色面差异过大：${stateComparison.meanRgbError}`);

  const canvas = page.locator("#webgl-canvas");
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -120);
  const zoomed = await page.evaluate(() => window.__webgpuCellDemo.getState());
  assert.ok(zoomed.camera.scale > states.camera.scale, "滚轮未缩放同步相机");
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 34, box.y + box.height / 2 + 21, {steps: 4});
  await page.mouse.up();
  const panned = await page.evaluate(() => window.__webgpuCellDemo.getState());
  assert.ok(Math.abs(panned.camera.x - zoomed.camera.x) > 10, "拖动未平移同步相机");
  await page.getByRole("button", {name: "适配视图"}).click();
  const fitted = await page.evaluate(() => window.__webgpuCellDemo.getState());
  assert.ok(Math.abs(fitted.camera.scale - states.camera.scale) < 1e-6, "适配视图未恢复比例");

  let benchmark = null;
  if (initial.webgpu) {
    await page.getByRole("button", {name: "测量 60 帧"}).click();
    await page.waitForFunction(() => Boolean(window.__webgpuCellDemo.getState().benchmark), null, {timeout: 30000});
    benchmark = await page.evaluate(() => window.__webgpuCellDemo.getState().benchmark);
    assert.equal(benchmark.samples, 60);
    assert.ok(Number.isFinite(benchmark.webgl.cpuP95) && Number.isFinite(benchmark.webgpu.cpuP95));
  }
  const longTasks = await page.evaluate(() => window.__cellDemoLongTasks || []);
  assert.equal(longTasks.filter(item => item.durationMs > 200).length, 0, "WebGPU demo 主线程存在超过 200ms 的 LongTask");
  assert.deepEqual(errors, [], "WebGPU demo 浏览器错误");

  const fallbackContext = await browser.newContext({viewport: {width: 900, height: 700}});
  await fallbackContext.addInitScript(() => Object.defineProperty(navigator, "gpu", {configurable: true, value: undefined}));
  const fallbackPage = await fallbackContext.newPage();
  const fallbackErrors = [];
  fallbackPage.on("pageerror", error => fallbackErrors.push(error.message));
  fallbackPage.on("console", message => { if (message.type() === "error") fallbackErrors.push(message.text()); });
  await fallbackPage.goto(base, {waitUntil: "domcontentloaded"});
  await fallbackPage.waitForFunction(() => window.__webgpuCellDemo?.getState?.().ready, null, {timeout: 120000});
  const fallback = await fallbackPage.evaluate(() => ({...window.__webgpuCellDemo.getState(), message: document.getElementById("webgpu-status").textContent, hidden: document.getElementById("webgpu-canvas").hidden, buttonDisabled: document.getElementById("run-benchmark").disabled}));
  assert.equal(fallback.webgpu, false);
  assert.equal(fallback.hidden, true);
  assert.equal(fallback.buttonDisabled, true);
  assert.match(fallback.message, /WebGPU/);
  assert.equal(fallback.glError, 0);
  const fallbackImage = await fallbackPage.locator("#webgl-canvas").screenshot({path: join(output, "fallback-webgl.png")});
  assert.ok(imageStats(PNG.sync.read(fallbackImage)).distinct > 32, "WebGPU 不可用时 WebGL2 地图不可见");
  assert.deepEqual(fallbackErrors, []);
  await fallbackContext.close();

  const mobileContext = await browser.newContext({viewport: {width: 390, height: 780}, deviceScaleFactor: 1});
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(base, {waitUntil: "domcontentloaded"});
  await mobilePage.waitForFunction(() => window.__webgpuCellDemo?.getState?.().ready, null, {timeout: 120000});
  const mobile = await mobilePage.evaluate(() => {
    const gl = document.getElementById("webgl-canvas").getBoundingClientRect();
    const gpu = document.getElementById("webgpu-canvas").getBoundingClientRect();
    return {scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, glBottom: gl.bottom, gpuTop: gpu.top, glWidth: gl.width, gpuWidth: gpu.width};
  });
  assert.ok(mobile.scrollWidth <= mobile.clientWidth, "窄屏存在横向溢出");
  assert.ok(mobile.gpuTop >= mobile.glBottom, "窄屏两个画布没有纵向排列");
  assert.equal(mobile.glWidth, mobile.gpuWidth);
  await mobilePage.screenshot({path: join(output, "mobile.png"), fullPage: true});
  await mobileContext.close();

  const report = {ok: true, cells: initial.cells, vertices: initial.vertices, canvas: initial.canvas, startupTiming: initial.startupTiming, webgpuAvailable: initial.webgpu, heightGlStats, heightComparison, stateComparison, benchmark, longTasks: {count: longTasks.length, maxMs: Math.max(0, ...longTasks.map(item => item.durationMs)), over200: longTasks.filter(item => item.durationMs > 200).length, entries: longTasks}, fallback: {webgpu: fallback.webgpu, message: fallback.message}, mobile, errors};
  writeFileSync(join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}

function imageStats(image) {
  const colors = new Set();
  for (let y = 0; y < image.height; y += 8) {
    for (let x = 0; x < image.width; x += 8) {
      const offset = (y * image.width + x) * 4;
      colors.add(`${image.data[offset]},${image.data[offset + 1]},${image.data[offset + 2]}`);
    }
  }
  return {width: image.width, height: image.height, distinct: colors.size};
}

async function captureVisibleCanvas(page, selector, path, minDistinct = 32) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const png = await page.locator(selector).screenshot({path});
    if (imageStats(PNG.sync.read(png)).distinct > minDistinct) return png;
    await page.waitForTimeout(50);
  }
  throw new Error(`${selector} 提交完成后仍未呈现地图色面`);
}

function compareImages(a, b) {
  assert.equal(a.width, b.width);
  assert.equal(a.height, b.height);
  let error = 0;
  let count = 0;
  for (let index = 0; index < a.data.length; index += 4) {
    for (let channel = 0; channel < 3; channel++) error += Math.abs(a.data[index + channel] - b.data[index + channel]);
    count += 3;
  }
  return {meanRgbError: Math.round(error / count * 100) / 100};
}
