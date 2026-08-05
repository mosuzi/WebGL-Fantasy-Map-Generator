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
const port = 5532;
const timeoutMs = 120_000;
const pixelRatios = [1, 1.25, 1.5, 2];
const cameraScales = [1.5, 2.5, 4];
const silhouettes = ["hamlet", "village", "town", "city", "capital", "provincial", "port", "fort", "camp"];
assert.ok(existsSync(distDir), `构建产物不存在：${distDir}`);

const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const server = await startStaticServer();
let browser;

try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const reports = [];
  for (const pixelRatio of pixelRatios) reports.push(await inspectPixelRatio(pixelRatio));
  verifyCrossRatioConsistency(reports);
  console.log(JSON.stringify({
    ok: true,
    pixelRatios: reports.map(({samples: _samples, ...report}) => report)
  }, null, 2));
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(done => server.close(done));
}

async function inspectPixelRatio(pixelRatio) {
  const context = await browser.newContext({viewport: {width: 900, height: 700}, deviceScaleFactor: pixelRatio});
  await context.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));
  try {
    const response = await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
    assert.equal(response?.status(), 200, "正式应用入口无法访问");
    await waitForApiReady(page, timeoutMs);
    await page.waitForFunction(() => window.__webglGeneratorApp?.renderer?.cityIconLayer);
    await page.evaluate(() => window.__webglGeneratorApp.healthMonitor?.clear?.());
    consoleErrors.length = 0;
    pageErrors.length = 0;

    const report = await page.evaluate(({cameraScales, silhouettes, targetPixelRatio}) => {
      const app = window.__webglGeneratorApp;
      const renderer = app.renderer;
      const layer = renderer.cityIconLayer;
      const gl = renderer.gl;
      const canvas = renderer.canvas;
      const metadata = renderer.map.metadata;
      const mapWidth = Number(metadata.graphWidth);
      const mapHeight = Number(metadata.graphHeight);
      const originalCanvasSize = {width: canvas.width, height: canvas.height};
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * targetPixelRatio));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * targetPixelRatio));
      const actualPixelRatio = canvas.width / canvas.clientWidth;
      const originalItems = renderer.cityIconItems;
      const samples = [];

      const measure = ({silhouette, cameraScale, roles = [], selected = false}) => {
        layer.setInstances([{
          id: `sharpness-${silhouette}`,
          x: mapWidth / 2,
          y: mapHeight / 2,
          silhouette,
          tierScale: 1,
          minScale: 0,
          visible: true,
          roles,
          selected,
          maxSizeFactor: 100
        }], {nowMs: 0});
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.disable(gl.SCISSOR_TEST);
        gl.clearColor(1, 0, 1, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        layer.draw({
          mapSize: metadata,
          camera: {scale: cameraScale, offsetX: 0, offsetY: 0},
          canvas,
          timeMs: 500,
          layerVisible: true
        });
        const radius = Math.ceil(34 * actualPixelRatio);
        const centerX = Math.floor(canvas.width / 2);
        const centerY = Math.floor(canvas.height / 2);
        const left = Math.max(0, centerX - radius);
        const bottom = Math.max(0, centerY - radius);
        const width = Math.min(canvas.width - left, radius * 2 + 1);
        const height = Math.min(canvas.height - bottom, radius * 2 + 1);
        const pixels = new Uint8Array(width * height * 4);
        gl.readPixels(left, bottom, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        let colored = 0;
        let dark = 0;
        let white = 0;
        let gold = 0;
        let transition = 0;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const offset = (y * width + x) * 4;
            const r = pixels[offset];
            const g = pixels[offset + 1];
            const b = pixels[offset + 2];
            if (r >= 253 && g <= 2 && b >= 253) continue;
            colored += 1;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
            const isDark = r < 150 && g < 90 && b < 160;
            const isWhite = r > 225 && g > 225 && b > 225 && Math.max(r, g, b) - Math.min(r, g, b) < 25;
            const isGold = r > 220 && g > 145 && g < 235 && b < 130;
            if (isDark) dark += 1;
            else if (isWhite) white += 1;
            else if (isGold) gold += 1;
            else transition += 1;
          }
        }
        return {
          silhouette,
          roles,
          selected,
          cameraScale,
          widthCss: Number.isFinite(minX) ? (maxX - minX + 1) / actualPixelRatio : 0,
          heightCss: Number.isFinite(minY) ? (maxY - minY + 1) / actualPixelRatio : 0,
          colored,
          dark,
          white,
          gold,
          transition
        };
      };

      for (const cameraScale of cameraScales) {
        for (const silhouette of silhouettes) samples.push(measure({silhouette, cameraScale}));
      }
      const roleComposite = measure({silhouette: "town", cameraScale: 2.5, roles: ["capital", "provincial", "port"]});
      const selected = measure({silhouette: "town", cameraScale: 2.5, selected: true});
      canvas.width = originalCanvasSize.width;
      canvas.height = originalCanvasSize.height;
      layer.setInstances(originalItems, {nowMs: performance.now()});
      renderer.draw();
      return {
        browserPixelRatio: window.devicePixelRatio,
        actualPixelRatio,
        samples,
        roleComposite,
        selected,
        glError: gl.getError(),
        activeHealthErrors: (app.healthMonitor?.getEvents?.() || []).filter(event => event.severity === "error")
      };
    }, {cameraScales, silhouettes, targetPixelRatio: pixelRatio});

    assert(Math.abs(report.actualPixelRatio - pixelRatio) <= 0.01, `实际 DPR 漂移：${report.actualPixelRatio}`);
    assert.equal(report.samples.length, silhouettes.length * cameraScales.length);
    for (const sample of report.samples) {
      assert(sample.colored > 0, `${pixelRatio} DPR / ${sample.cameraScale}× / ${sample.silhouette} 没有绘制像素`);
      assert(sample.dark > 0, `${pixelRatio} DPR / ${sample.cameraScale}× / ${sample.silhouette} 缺少深色硬描边核心`);
      assert(sample.white > 0, `${pixelRatio} DPR / ${sample.cameraScale}× / ${sample.silhouette} 缺少纯白内线核心`);
      assert(sample.transition > 0, `${pixelRatio} DPR / ${sample.cameraScale}× / ${sample.silhouette} 缺少抗锯齿过渡像素`);
      assert(sample.transition / sample.colored < 0.9, `${pixelRatio} DPR / ${sample.cameraScale}× / ${sample.silhouette} 过渡像素占比过高：${JSON.stringify(sample)}`);
    }
    const meanWidth = cameraScales.map(cameraScale => mean(report.samples.filter(sample => sample.cameraScale === cameraScale).map(sample => sample.widthCss)));
    assert(meanWidth[0] >= 7.5, `${pixelRatio} DPR 下基础城镇图标仍过小：${meanWidth[0]}`);
    assert(meanWidth[1] > meanWidth[0] + 1, `${pixelRatio} DPR 下 2.5× 图标没有连续放大：${meanWidth.join(", ")}`);
    assert(meanWidth[2] > meanWidth[1] + 1, `${pixelRatio} DPR 下 4× 图标没有连续放大：${meanWidth.join(", ")}`);
    const townBaseline = report.samples.find(sample => sample.cameraScale === 2.5 && sample.silhouette === "town");
    assert(report.roleComposite.colored > townBaseline.colored, `${pixelRatio} DPR 下角色组合没有进入图形`);
    assert(report.roleComposite.dark > 0 && report.roleComposite.white > 0 && report.roleComposite.transition > 0, `${pixelRatio} DPR 下角色组合轮廓不完整`);
    assert(report.selected.gold > 0, `${pixelRatio} DPR 下选中态没有金色内线`);
    assert.equal(report.selected.widthCss, townBaseline.widthCss, `${pixelRatio} DPR 下选中态改变了图标宽度`);
    assert.equal(report.selected.heightCss, townBaseline.heightCss, `${pixelRatio} DPR 下选中态改变了图标高度`);
    assert.equal(report.glError, 0, `${pixelRatio} DPR 出现 WebGL error`);
    assert.deepEqual(report.activeHealthErrors, [], `${pixelRatio} DPR 出现 active health error`);
    assert.deepEqual(consoleErrors, [], `${pixelRatio} DPR console error：${consoleErrors.join(" | ")}`);
    assert.deepEqual(pageErrors, [], `${pixelRatio} DPR page error：${pageErrors.join(" | ")}`);
    return {
      requestedPixelRatio: pixelRatio,
      browserPixelRatio: report.browserPixelRatio,
      pixelRatio: report.actualPixelRatio,
      meanWidth,
      maxTransitionRatio: Math.max(...report.samples.map(sample => sample.transition / sample.colored)),
      roleCompositePixels: report.roleComposite.colored,
      selectedGoldPixels: report.selected.gold,
      shapes: new Set(report.samples.map(sample => sample.silhouette)).size,
      glError: report.glError,
      activeHealthErrors: report.activeHealthErrors,
      consoleErrors,
      pageErrors,
      samples: report.samples
    };
  } finally {
    await Promise.race([context.close(), delay(5000)]);
  }
}

function verifyCrossRatioConsistency(reports) {
  for (const cameraScale of cameraScales) {
    for (const silhouette of silhouettes) {
      const widths = reports.map(report => report.samples.find(sample => sample.cameraScale === cameraScale && sample.silhouette === silhouette).widthCss);
      const heights = reports.map(report => report.samples.find(sample => sample.cameraScale === cameraScale && sample.silhouette === silhouette).heightCss);
      assert(Math.max(...widths) - Math.min(...widths) <= 2, `${cameraScale}× / ${silhouette} 的 CSS 宽度随 DPR 漂移：${widths.join(", ")}`);
      assert(Math.max(...heights) - Math.min(...heights) <= 2, `${cameraScale}× / ${silhouette} 的 CSS 高度随 DPR 漂移：${heights.join(", ")}`);
    }
  }
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

async function startStaticServer() {
  const serverInstance = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, `http://${host}:${port}`).pathname);
    let target = resolve(distDir, "." + normalize(pathname));
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
