#!/usr/bin/env node
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {createReadStream, existsSync, mkdirSync, statSync, writeFileSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {extname, join, resolve, sep} from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist", "webgl-generator");
const output = join(root, "work", "task413-webgpu");
const require = createRequire(join(root, "source", "Fantasy-Map-Generator", "package.json"));
const {chromium} = require("playwright");
const {PNG} = require("pngjs");
const types = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json"};
assert.ok(existsSync(join(dist, "prototype", "webgl-cells", "webgpu.html")), "请先构建 WebGPU 地图对照页");
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
  browser = await chromium.launch({headless: true, channel: "chrome"});
  const url = `http://127.0.0.1:${server.address().port}/prototype/webgl-cells/webgpu.html`;
  const page = await browser.newPage({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1});
  page.setDefaultTimeout(120000);
  await page.addInitScript(() => {
    window.__cellDemoLongTasks = [];
    window.__cellDemoLongTaskSupported = PerformanceObserver.supportedEntryTypes?.includes("longtask") === true;
    if (window.__cellDemoLongTaskSupported) new PerformanceObserver(list => window.__cellDemoLongTasks.push(...list.getEntries().map(entry => ({startTime: entry.startTime, durationMs: entry.duration})))).observe({type: "longtask", buffered: true});
  });
  const errors = [];
  collectErrors(page, errors);
  await page.goto(url, {waitUntil: "domcontentloaded"});
  await page.waitForFunction(() => window.__webgpuCellDemo?.getState?.().ready || document.getElementById("webgpu-status").textContent === "加载失败");
  await settle(page);
  const initial = await state(page);
  assert.equal(await page.evaluate(() => window.__cellDemoLongTaskSupported), true, "浏览器未开放 LongTask 监控");
  assert.equal(initial.ready, true, "地图对照页初始化失败");
  assert.equal(initial.webgpu, true, "主对照实例未能启用 WebGPU");
  assert.equal(initial.scene, "complex");
  assert.equal(initial.mode, "states");
  assert.equal(initial.smoothing, true);
  assert.equal(initial.haze, true);
  assert.equal(initial.cells, 99846);
  assert.equal(initial.vertices, 1795563);
  assert.equal(initial.colors, initial.vertices * 3);
  assert.equal(initial.rawStateBorderSegments, 2235);
  assert.equal(initial.canvas.width, initial.canvas.gpuWidth);
  assert.equal(initial.canvas.height, initial.canvas.gpuHeight);
  assert.equal(initial.glError, 0);
  assert.ok(initial.uploads.webglSurfaceMs > 0 && initial.uploads.webgpuSurfaceMs > 0, "地表上传未单列");
  assert.ok(initial.uploads.webglSceneMs > 0 && initial.uploads.webgpuSceneMs > 0, "复合图层上传未单列");
  assert.ok(initial.uploads.webglMs >= initial.uploads.webglSurfaceMs + initial.uploads.webglSceneMs);
  assert.ok(initial.uploads.webgpuMs >= initial.uploads.webgpuSurfaceMs + initial.uploads.webgpuSceneMs);
  assert.equal(initial.lastDraw.webgl.hazeSegments, 2235);
  assert.equal(initial.lastDraw.webgpu.hazeSegments, 2235);
  assert.ok(initial.lastDraw.webgl.visibleLabels > 0 && initial.lastDraw.webgpu.visibleLabels > 0);
  for (const layer of ["lakes", "lakeIslands", "routes", "rivers", "coastline", "lakeShore", "stateBorders", "provinceBorders", "burgIcons", "markers"]) {
    assert.ok(initial.layerCounts[layer].hardVertices > 0, `${layer} 硬边几何为空`);
    assert.ok(initial.layerCounts[layer].smoothVertices > 0, `${layer} 平滑几何为空`);
  }
  for (const layer of ["coastline", "lakeShore", "stateBorders", "provinceBorders"]) assert.ok(initial.layerCounts[layer].smoothVertices > initial.layerCounts[layer].hardVertices, `${layer} 没有平滑工作量`);
  assert.deepEqual(initial.labelCounts, {states: 15, burgs: 128});

  const full = await capturePair(page, "complex-full");
  assert.ok(imageStats(full.gl.image).distinct > 32, "WebGL2 复合画面缺少细节");
  assert.ok(imageStats(full.gpu.image).distinct > 32, "WebGPU 复合画面缺少细节");
  const fullParity = imageDiff(full.gl.image, full.gpu.image);
  assert.ok(fullParity.meanRgbError < 15, `复合场景两后端像素偏差过大：${fullParity.meanRgbError}`);
  await page.screenshot({path: join(output, "complex-page.png"), fullPage: true});

  await page.evaluate(() => window.__webgpuCellDemo.focusBorder());
  const smoothHaze = await capturePair(page, "border-smooth-haze");
  const borderParity = imageDiff(smoothHaze.gl.image, smoothHaze.gpu.image);
  assert.ok(borderParity.meanRgbError < 5, `边界近景两后端像素偏差过大：${borderParity.meanRgbError}`);
  await page.evaluate(() => window.__webgpuCellDemo.setSmoothing(false));
  const hardHaze = await capturePair(page, "border-hard-haze");
  const smoothEffect = {webgl: imageDiff(smoothHaze.gl.image, hardHaze.gl.image), webgpu: imageDiff(smoothHaze.gpu.image, hardHaze.gpu.image)};
  assert.ok(smoothEffect.webgl.changedPixels > 200 && smoothEffect.webgpu.changedPixels > 200, "平滑边界没有在两后端改变近景");
  await page.evaluate(() => window.__webgpuCellDemo.setSmoothing(true));
  const restoredSmooth = await capturePair(page);
  assert.equal(imageDiff(smoothHaze.gl.image, restoredSmooth.gl.image).changedPixels, 0, "WebGL2 平滑往返未恢复画面");
  assert.equal(imageDiff(smoothHaze.gpu.image, restoredSmooth.gpu.image).changedPixels, 0, "WebGPU 平滑往返未恢复画面");
  await page.evaluate(() => window.__webgpuCellDemo.setHaze(false));
  const noHaze = await capturePair(page, "border-no-haze");
  const hazeEffect = {webgl: imageDiff(smoothHaze.gl.image, noHaze.gl.image), webgpu: imageDiff(smoothHaze.gpu.image, noHaze.gpu.image)};
  assert.ok(hazeEffect.webgl.changedPixels > 1000 && hazeEffect.webgpu.changedPixels > 1000, "国界晕染没有在两后端改变近景");
  await page.evaluate(() => window.__webgpuCellDemo.setHaze(true));
  const restoredHaze = await capturePair(page);
  assert.equal(imageDiff(smoothHaze.gl.image, restoredHaze.gl.image).changedPixels, 0, "WebGL2 晕染往返未恢复画面");
  assert.equal(imageDiff(smoothHaze.gpu.image, restoredHaze.gpu.image).changedPixels, 0, "WebGPU 晕染往返未恢复画面");

  await page.evaluate(() => window.__webgpuCellDemo.fit());
  await settle(page);
  const fitted = await state(page);
  const canvas = page.locator("#webgl-canvas");
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -120);
  await settle(page);
  const zoomed = await state(page);
  assert.ok(zoomed.camera.scale > fitted.camera.scale, "滚轮未缩放同步相机");
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 34, box.y + box.height / 2 + 21, {steps: 4});
  await page.mouse.up();
  await settle(page);
  const panned = await state(page);
  assert.ok(Math.abs(panned.camera.x - zoomed.camera.x) > 10, "拖动未平移同步相机");
  const moved = await capturePair(page, "moved-complex");
  const movedParity = imageDiff(moved.gl.image, moved.gpu.image);
  assert.ok(movedParity.meanRgbError < 15, `移动后两后端画面偏差过大：${movedParity.meanRgbError}`);
  assert.ok(imageDiff(full.gl.image, moved.gl.image).changedPixels > 1000, "WebGL2 移动后画面未变化");
  assert.ok(imageDiff(full.gpu.image, moved.gpu.image).changedPixels > 1000, "WebGPU 移动后画面未变化");
  await page.getByRole("button", {name: "适配视图"}).click();
  await settle(page);
  assert.ok(Math.abs((await state(page)).camera.scale - fitted.camera.scale) < 1e-6, "适配视图未恢复比例");

  await page.evaluate(() => window.__webgpuCellDemo.runBenchmark());
  const complexBenchmark = (await state(page)).benchmark;
  validateBenchmark(complexBenchmark, "complex");
  assert.ok(complexBenchmark.webgpu.readbackP95 > 0, "WebGPU 晕染源回读没有计时");
  assert.ok(complexBenchmark.webgl.hazeP95 > 0 && complexBenchmark.webgpu.hazeP95 > 0, "复合场景未计入晕染");
  assert.equal(await page.locator("#benchmark-table tbody tr").count(), 9);

  await page.evaluate(() => window.__webgpuCellDemo.setScene("cells"));
  const simpleState = await state(page);
  assert.equal(simpleState.lastDraw.webgl.hazeSegments, 0);
  assert.equal(simpleState.lastDraw.webgpu.hazeSegments, 0);
  assert.equal(simpleState.lastDraw.webgl.visibleLabels, 0);
  assert.equal(simpleState.lastDraw.webgpu.visibleLabels, 0);
  const simple = await capturePair(page, "cells-states");
  const simpleParity = imageDiff(simple.gl.image, simple.gpu.image);
  assert.ok(simpleParity.meanRgbError < 7, `仅格网两后端像素偏差过大：${simpleParity.meanRgbError}`);
  await page.evaluate(() => window.__webgpuCellDemo.setMode("height"));
  const height = await capturePair(page, "cells-height");
  assert.ok(imageDiff(simple.gl.image, height.gl.image).changedPixels > 10000, "高度专题未改变格网画面");
  assert.ok(imageDiff(height.gl.image, height.gpu.image).meanRgbError < 7, "高度专题两后端偏差过大");
  await page.evaluate(() => window.__webgpuCellDemo.setMode("states"));
  await page.evaluate(() => window.__webgpuCellDemo.runBenchmark());
  const simpleBenchmark = (await state(page)).benchmark;
  validateBenchmark(simpleBenchmark, "cells");
  assert.equal(simpleBenchmark.webgl.hazeP95, 0);
  assert.equal(simpleBenchmark.webgpu.hazeP95, 0);
  assert.equal(simpleBenchmark.webgpu.readbackP95, 0);

  const longTasks = await page.evaluate(() => window.__cellDemoLongTasks);
  assert.equal(longTasks.filter(item => item.durationMs > 200).length, 0, "主线程出现超过 200ms 的 LongTask");
  assert.deepEqual(errors, [], "主对照页浏览器警告或错误");

  const fallbackContext = await browser.newContext({viewport: {width: 900, height: 700}});
  await fallbackContext.addInitScript(() => Object.defineProperty(navigator, "gpu", {configurable: true, value: undefined}));
  const fallbackPage = await fallbackContext.newPage();
  const fallbackErrors = [];
  collectErrors(fallbackPage, fallbackErrors);
  await fallbackPage.goto(url, {waitUntil: "domcontentloaded"});
  await fallbackPage.waitForFunction(() => window.__webgpuCellDemo?.getState?.().ready, null, {timeout: 120000});
  const fallback = await fallbackPage.evaluate(() => ({...window.__webgpuCellDemo.getState(), message: document.getElementById("webgpu-status").textContent, hidden: document.getElementById("webgpu-canvas").hidden, buttonDisabled: document.getElementById("run-benchmark").disabled}));
  assert.equal(fallback.webgpu, false);
  assert.equal(fallback.hidden, true);
  assert.equal(fallback.buttonDisabled, true);
  assert.match(fallback.message, /WebGPU/);
  assert.equal(fallback.glError, 0);
  const fallbackImage = await captureStableCanvas(fallbackPage, "#webgl-canvas", join(output, "fallback-webgl.png"));
  assert.ok(imageStats(fallbackImage.image).distinct > 32, "WebGPU 不可用时 WebGL2 地图不可见");
  assert.deepEqual(fallbackErrors, []);
  await fallbackContext.close();

  const mobileContext = await browser.newContext({viewport: {width: 390, height: 780}, deviceScaleFactor: 1});
  const mobilePage = await mobileContext.newPage();
  const mobileErrors = [];
  collectErrors(mobilePage, mobileErrors);
  await mobilePage.goto(url, {waitUntil: "domcontentloaded"});
  await mobilePage.waitForFunction(() => window.__webgpuCellDemo?.getState?.().ready, null, {timeout: 120000});
  const mobile = await mobilePage.evaluate(() => {
    const gl = document.getElementById("webgl-canvas").getBoundingClientRect();
    const gpu = document.getElementById("webgpu-canvas").getBoundingClientRect();
    return {scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, glBottom: gl.bottom, gpuTop: gpu.top, glWidth: gl.width, gpuWidth: gpu.width};
  });
  assert.ok(mobile.scrollWidth <= mobile.clientWidth, "窄屏存在横向溢出");
  assert.ok(mobile.gpuTop >= mobile.glBottom, "窄屏两个画布没有纵向排列");
  assert.equal(mobile.glWidth, mobile.gpuWidth);
  assert.deepEqual(mobileErrors, []);
  await mobilePage.screenshot({path: join(output, "mobile.png"), fullPage: true});
  await mobileContext.close();

  const report = {ok: true, environment: initial.environment, canvas: initial.canvas, cells: initial.cells, vertices: initial.vertices, layerCounts: initial.layerCounts, labelCounts: initial.labelCounts, rawStateBorderSegments: initial.rawStateBorderSegments, startupTiming: initial.startupTiming, uploads: initial.uploads, image: {fullParity, borderParity, smoothEffect, hazeEffect, movedParity, simpleParity}, benchmark: {complex: complexBenchmark, cells: simpleBenchmark}, longTasks: {count: longTasks.length, maxMs: Math.max(0, ...longTasks.map(item => item.durationMs)), over200: 0, entries: longTasks}, fallback: {webgpu: fallback.webgpu, message: fallback.message}, mobile, errors};
  writeFileSync(join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}

function collectErrors(page, errors) {
  page.on("pageerror", error => errors.push(`page: ${error.message}`));
  page.on("console", message => { if (["error", "warning"].includes(message.type())) errors.push(`${message.type()}: ${message.text()}`); });
}

async function state(page) { return page.evaluate(() => window.__webgpuCellDemo.getState()); }
async function settle(page) { await page.evaluate(() => window.__webgpuCellDemo.waitForGpu()); }

async function capturePair(page, name) {
  await settle(page);
  return {
    gl: await captureStableCanvas(page, "#webgl-canvas", name ? join(output, `${name}-webgl.png`) : null),
    gpu: await captureStableCanvas(page, "#webgpu-canvas", name ? join(output, `${name}-webgpu.png`) : null)
  };
}

async function captureStableCanvas(page, selector, path = null) {
  let previous = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const png = await page.locator(selector).screenshot();
    const image = PNG.sync.read(png);
    const hash = createHash("sha256").update(image.data).digest("hex");
    if (hash === previous) {
      if (path) writeFileSync(path, png);
      return {image, hash};
    }
    previous = hash;
  }
  throw new Error(`${selector} 连续帧未稳定`);
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

function imageDiff(a, b) {
  assert.equal(a.width, b.width);
  assert.equal(a.height, b.height);
  let error = 0, changedPixels = 0;
  for (let index = 0; index < a.data.length; index += 4) {
    const delta = Math.abs(a.data[index] - b.data[index]) + Math.abs(a.data[index + 1] - b.data[index + 1]) + Math.abs(a.data[index + 2] - b.data[index + 2]);
    error += delta;
    if (delta) changedPixels++;
  }
  return {meanRgbError: Math.round(error / (a.width * a.height * 3) * 10000) / 10000, changedPixels};
}

function validateBenchmark(result, scene) {
  assert.equal(result.scene, scene);
  assert.equal(result.samples, 60);
  assert.equal(result.warmup, 5);
  assert.equal(result.width > 0 && result.height > 0, true);
  for (const backend of ["webgl", "webgpu"]) {
    for (const key of ["cpuSubmitP50", "cpuSubmitP95", "wallP50", "wallP95", "waitP95", "hazeP95", "readbackP95", "labelsP95", "wallMax"]) {
      assert.ok(Number.isFinite(result[backend][key]) && result[backend][key] >= 0, `${scene}/${backend}/${key} 非有限数`);
    }
  }
}
