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
const screenshotPath = join(rootDir, "docs", "generated", "screenshots", "ocean-current-zoom-layer-stage-2-1.png");
const host = "127.0.0.1";
const port = 5468;
assert.ok(existsSync(distDir), `构建产物不存在：${distDir}`);

const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const server = await startStaticServer();
let browser;

try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const page = await browser.newPage({viewport: {width: 1280, height: 820}});
  page.setDefaultTimeout(30000);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 30000);

  await page.evaluate(async () => {
    const result = await window.webglGeneratorApi.generate.newMap({confirm: true, seed: "stage-2-1", cellsTarget: 10000});
    if (!result?.ok) throw new Error(result?.error?.message || "默认地图生成失败");
  });
  await page.waitForFunction(() => window.__webglGeneratorApp?.map?.oceanCurrents?.currents?.length >= 5);
  await page.evaluate(() => document.getElementById("open-ocean-current-panel")?.click());
  const panel = page.locator('.floating-panel[data-panel-id="ocean-current-panel"]:not(.hidden)');
  await panel.waitFor({state: "visible"});

  const evidence = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const renderer = app.renderer;
    const model = app.map.oceanCurrents;
    const baseStats = renderer.getStats();
    const baseScale = renderer.camera.scale;
    renderer.camera.scale = baseScale * 2;
    renderer.markViewportBuffersDirty();
    renderer.draw();
    const stats = renderer.getStats();
    const gl = document.getElementById("map-canvas")?.getContext?.("webgl2");
    return {
      seed: app.map.metadata.seed,
      algorithm: model.algorithm,
      currents: model.currents.length,
      arrows: stats.oceanCurrentLayer.arrowheads,
      vertices: stats.oceanCurrentLayer.vertexCount,
      bufferVertices: stats.oceanCurrentVertexCount,
      routeVertices: stats.routeVertexCount,
      layerVisible: stats.layerVisibility.oceanCurrents,
      baseScale,
      zoomScale: stats.draw.oceanCurrentScale,
      baseScreenWidth: baseStats.draw.oceanCurrentScreenWidth,
      zoomScreenWidth: stats.draw.oceanCurrentScreenWidth,
      layerOrder: stats.draw.layerOrder,
      glError: stats.draw?.glError ?? gl?.getError?.() ?? 0,
      healthErrors: (window.__webglGeneratorHealth?.getEvents?.(200) || []).filter(event => event.level === "error").length
    };
  });
  const panelText = await panel.textContent();
  await panel.locator('button[aria-label="定位"]').first().click();
  await page.waitForFunction(() => window.__webglGeneratorApp?.renderer?.getStats?.().locateStatus?.startsWith("洋流 "));
  await page.screenshot({path: screenshotPath, fullPage: true});

  assert.deepEqual(
    {seed: evidence.seed, algorithm: evidence.algorithm, currents: evidence.currents, arrows: evidence.arrows, layerVisible: evidence.layerVisible},
    {seed: "stage-2-1", algorithm: "surface-gyres-v2", currents: 6, arrows: 6, layerVisible: true}
  );
  assert.ok(evidence.vertices > 0, "洋流图层没有生成可见顶点");
  assert.equal(evidence.bufferVertices, evidence.vertices, "洋流独立缓冲没有完整上传箭头顶点");
  assert.ok(evidence.routeVertices > 0, "默认地图没有可用于层级验收的航线");
  assert.ok(Math.abs(evidence.zoomScale / evidence.baseScale - 2) < 0.001, "画布没有按两倍倍率缩放");
  assert.ok(Math.abs(evidence.zoomScreenWidth.max / evidence.baseScreenWidth.max - 2) < 0.02, "洋流箭头宽度没有随画布缩放到两倍");
  assert.ok(evidence.layerOrder.indexOf("surface") < evidence.layerOrder.indexOf("oceanCurrents"), "洋流没有绘制在基础地表之上");
  assert.ok(evidence.layerOrder.indexOf("oceanCurrents") < evidence.layerOrder.indexOf("routes"), "洋流仍绘制在海洋航线之上");
  assert.equal(evidence.glError, 0, "洋流密度验收出现 WebGL 错误");
  assert.equal(evidence.healthErrors, 0, "洋流密度验收出现 health error");
  assert.match(panelText, /主要洋流\s*6/);
  assert.match(panelText, /增强表层环流/);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  assert.ok(existsSync(screenshotPath) && statSync(screenshotPath).size > 0, "洋流密度验收截图没有生成");

  console.log(JSON.stringify({ok: true, evidence, panelText: panelText.replace(/\s+/g, " ").trim(), screenshotPath, consoleErrors, pageErrors}, null, 2));
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(done => server.close(done));
}

async function startStaticServer() {
  const serverInstance = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, `http://${host}:${port}`).pathname);
    let target = resolve(distDir, `.${normalize(pathname)}`);
    if (pathname === "/" || !existsSync(target) || statSync(target).isDirectory()) target = join(distDir, "index.html");
    if (!target.startsWith(distDir) || !existsSync(target)) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {"content-type": contentType(target), "cache-control": "no-store"});
    createReadStream(target).pipe(response);
  });
  await new Promise((done, fail) => {
    serverInstance.once("error", fail);
    serverInstance.listen(port, host, done);
  });
  return serverInstance;
}

function contentType(file) {
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png"
  })[extname(file).toLowerCase()] || "application/octet-stream";
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}
