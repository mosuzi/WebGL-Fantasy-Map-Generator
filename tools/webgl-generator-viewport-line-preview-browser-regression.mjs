#!/usr/bin/env node
import assert from "node:assert/strict";
import {createReadStream, existsSync, statSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const distDir = join(rootDir, "dist", "webgl-generator");
const host = "127.0.0.1";
const port = 5478;
assert.ok(existsSync(distDir), `构建产物不存在：${distDir}`);

const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const server = await startStaticServer();
let browser;

try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  page.setDefaultTimeout(120000);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 120000);
  await page.evaluate(() => {
    const renderer = window.__webglGeneratorApp.renderer;
    renderer.setLayerVisible("routes", true);
    renderer.setLayerVisible("rivers", true);
  });
  await waitForViewportIdle(page);

  const canvas = page.locator("#map-canvas");
  const box = await canvas.boundingBox();
  assert.ok(box?.width > 0 && box?.height > 0, "地图画布不可见");
  const center = {x: box.x + box.width * 0.62, y: box.y + box.height * 0.48};
  const initial = await readPreviewStats(page);
  assert.ok(initial.routeVertexCount > 0, "默认地图没有可验证的道路顶点");
  assert.ok(initial.riverVertexCount > 0, "默认地图没有可验证的河流顶点");

  await page.mouse.move(center.x, center.y);
  const zoomSamples = [];
  for (let index = 0; index < 10; index++) {
    await page.mouse.wheel(0, -90);
    zoomSamples.push(await readPreviewStats(page));
  }
  const zoomIdle = await waitForViewportIdle(page);

  const panSamples = [];
  await page.mouse.move(center.x - 120, center.y - 50);
  await page.mouse.down({button: "middle"});
  for (let index = 0; index < 12; index++) {
    const t = (index + 1) / 12;
    await page.mouse.move(center.x - 120 + t * 220, center.y - 50 + Math.sin(t * Math.PI) * 90);
    panSamples.push(await readPreviewStats(page));
  }
  await page.mouse.up({button: "middle"});
  const panIdle = await waitForViewportIdle(page);

  assertPreviewSamples(zoomSamples, "缩放");
  assertPreviewSamples(panSamples, "平移");
  assert.ok(zoomSamples.some(sample => Math.abs(sample.routePreviewTransform.scale - 1) > 1e-6), "缩放预览没有产生相机比例差值");
  assert.ok(panSamples.some(sample => Math.abs(sample.routePreviewTransform.offsetX) > 1e-6 || Math.abs(sample.routePreviewTransform.offsetY) > 1e-6), "平移预览没有产生相机偏移差值");
  assertCameraConverged(zoomIdle, "缩放");
  assertCameraConverged(panIdle, "平移");
  assert.equal(zoomIdle.glError, 0);
  assert.equal(panIdle.glError, 0);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);

  console.log(JSON.stringify({
    ok: true,
    initial: summarizeState(initial),
    zoom: summarizeSamples(zoomSamples, zoomIdle),
    pan: summarizeSamples(panSamples, panIdle),
    consoleErrors,
    pageErrors
  }, null, 2));
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(done => server.close(done));
}

function assertPreviewSamples(samples, label) {
  assert.ok(samples.length > 0);
  assert.ok(samples.every(sample => sample.routesDirty && sample.riversDirty), `${label}样本没有持续处于 dirty 预览态`);
  assert.ok(samples.every(sample => sample.layerOrder.includes("routes")), `${label} dirty 帧隐藏了道路`);
  assert.ok(samples.every(sample => sample.layerOrder.includes("rivers")), `${label} dirty 帧隐藏了河流`);
  assert.ok(samples.every(sample => sample.routeVertexCount > 0 && sample.riverVertexCount > 0), `${label} dirty 帧丢失了线路网格`);
  assert.ok(samples.every(sample => sameTransform(sample.routePreviewTransform, sample.riverPreviewTransform)), `${label}道路与河流没有使用相同相机差值`);
}

function assertCameraConverged(state, label) {
  assert.equal(state.routesDirty, false, `${label}空闲后道路仍为 dirty`);
  assert.equal(state.riversDirty, false, `${label}空闲后河流仍为 dirty`);
  assert.ok(sameCamera(state.camera, state.routeBufferCamera), `${label}空闲后道路基准相机没有收敛`);
  assert.ok(sameCamera(state.camera, state.riverBufferCamera), `${label}空闲后河流基准相机没有收敛`);
  assert.ok(sameTransform(state.routePreviewTransform, {scale: 1, offsetX: 0, offsetY: 0}), `${label}空闲后道路仍残留预览变换`);
  assert.ok(sameTransform(state.riverPreviewTransform, {scale: 1, offsetX: 0, offsetY: 0}), `${label}空闲后河流仍残留预览变换`);
}

function summarizeSamples(samples, idle) {
  const draws = samples.map(sample => sample.drawMs);
  return {
    samples: samples.length,
    dirtySamples: samples.filter(sample => sample.routesDirty && sample.riversDirty).length,
    routesVisibleSamples: samples.filter(sample => sample.layerOrder.includes("routes")).length,
    riversVisibleSamples: samples.filter(sample => sample.layerOrder.includes("rivers")).length,
    drawMs: summarizeMs(draws),
    previewTransform: samples.at(-1).routePreviewTransform,
    idle: summarizeState(idle)
  };
}

function summarizeState(state) {
  return {
    camera: state.camera,
    routeBufferCamera: state.routeBufferCamera,
    riverBufferCamera: state.riverBufferCamera,
    routesDirty: state.routesDirty,
    riversDirty: state.riversDirty,
    routeVertexCount: state.routeVertexCount,
    riverVertexCount: state.riverVertexCount,
    layerOrder: state.layerOrder,
    drawMs: state.drawMs,
    glError: state.glError
  };
}

function summarizeMs(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    average: round(values.reduce((sum, value) => sum + value, 0) / values.length),
    p95: round(sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]),
    max: round(sorted.at(-1))
  };
}

async function waitForViewportIdle(page) {
  await page.waitForFunction(() => {
    const cache = window.__webglGeneratorApp?.renderer?.getStats?.()?.dynamicMeshCache;
    return cache && !cache.routesDirty && !cache.riversDirty;
  }, null, {timeout: 15000});
  return readPreviewStats(page);
}

async function readPreviewStats(page) {
  return page.evaluate(() => {
    const stats = window.__webglGeneratorApp.renderer.getStats();
    return {
      camera: stats.camera,
      routeBufferCamera: stats.dynamicMeshCache.routeBufferCamera,
      riverBufferCamera: stats.dynamicMeshCache.riverBufferCamera,
      routePreviewTransform: stats.dynamicMeshCache.routePreviewTransform,
      riverPreviewTransform: stats.dynamicMeshCache.riverPreviewTransform,
      routesDirty: stats.dynamicMeshCache.routesDirty,
      riversDirty: stats.dynamicMeshCache.riversDirty,
      routeVertexCount: stats.routeVertexCount,
      riverVertexCount: stats.riverVertexCount,
      layerOrder: stats.draw.layerOrder || [],
      drawMs: stats.draw.drawMs || 0,
      glError: stats.draw.glError
    };
  });
}

function sameCamera(left, right) {
  return ["scale", "offsetX", "offsetY"].every(key => Math.abs(Number(left?.[key]) - Number(right?.[key])) < 1e-9);
}

function sameTransform(left, right) {
  return ["scale", "offsetX", "offsetY"].every(key => Math.abs(Number(left?.[key]) - Number(right?.[key])) < 1e-9);
}

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startStaticServer() {
  return new Promise((resolveServer, reject) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url || "/", `http://${host}:${port}`);
      const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
      const requested = normalize(join(distDir, pathname));
      const fallback = join(distDir, "index.html");
      const filePath = requested.startsWith(distDir) && existsSync(requested) && statSync(requested).isFile() ? requested : fallback;
      response.writeHead(200, {"Content-Type": contentType(filePath), "Cache-Control": "no-store"});
      createReadStream(filePath).pipe(response);
    });
    server.once("error", reject);
    server.listen(port, host, () => resolveServer(server));
  });
}

function contentType(filePath) {
  return {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml"
  }[extname(filePath)] || "application/octet-stream";
}
