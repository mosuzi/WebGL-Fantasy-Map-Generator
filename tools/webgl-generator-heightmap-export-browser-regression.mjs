#!/usr/bin/env node
import assert from "node:assert/strict";
import {createReadStream, existsSync, mkdirSync, readFileSync, statSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const distDir = join(rootDir, "dist", "webgl-generator");
const artifactDir = join(rootDir, "docs", "generated", "png", "heightmap-browser");
const host = "127.0.0.1";
const port = 5457;
const timeoutMs = 180000;

assert(existsSync(distDir), `构建产物不存在：${distDir}`);
mkdirSync(artifactDir, {recursive: true});
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const server = await startStaticServer();
let browser;
try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const context = await browser.newContext({viewport: {width: 1280, height: 820}, deviceScaleFactor: 1, acceptDownloads: true});
  await context.addInitScript(() => localStorage.clear());
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, timeoutMs);
  const generated = await page.evaluate(async () => {
    const response = await window.webglGeneratorApi.generate.newMap({
      confirm: true,
      seed: "heightmap-export-browser",
      cellsTarget: 3000,
      heightmapTemplate: "continents"
    });
    if (!response?.ok) throw new Error(response?.error?.message || "地图生成失败");
    return {
      summary: window.webglGeneratorApi.info.mapSummary().data,
      history: window.webglGeneratorApi.history.get().data,
      camera: {...window.__webglGeneratorApp.renderer.camera}
    };
  });

  const apiExport = await page.evaluate(async () => {
    const map = window.__webglGeneratorApp.map;
    const heights = map.grid.cells.h;
    const targets = [0, 20, 50, 100].map(target => {
      let cell = 0;
      for (let index = 1; index < heights.length; index++) {
        if (Math.abs(Number(heights[index]) - target) < Math.abs(Number(heights[cell]) - target)) cell = index;
      }
      return {target, cell, height: Number(heights[cell]), point: map.grid.points[cell]};
    });
    const response = await window.webglGeneratorApi.data.exportHeightmapPNG({
      download: false,
      pixelScale: 1,
      includeDataUrl: true
    });
    if (!response?.ok) throw new Error(response?.error?.message || "高度灰度图 API 导出失败");
    const image = new Image();
    image.src = response.data.dataUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", {willReadFrequently: true});
    context.drawImage(image, 0, 0);
    const samples = targets.map(item => {
      const x = Math.max(0, Math.min(canvas.width - 1, Math.round(item.point[0])));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.round(item.point[1])));
      return {...item, pixel: Array.from(context.getImageData(x, y, 1, 1).data)};
    });
    return {
      data: response.data,
      samples,
      summaryAfter: window.webglGeneratorApi.info.mapSummary().data,
      historyAfter: window.webglGeneratorApi.history.get().data,
      cameraAfter: {...window.__webglGeneratorApp.renderer.camera}
    };
  });

  await page.locator("#open-generation-panel").click();
  await page.locator('.floating-panel[data-panel-id="generation-panel"]').waitFor({state: "visible"});
  await page.getByRole("tab", {name: "简介", exact: true}).click();
  await page.locator("#open-export-panel").click();
  const exportPanel = page.locator(".project-export-panel");
  await exportPanel.waitFor({state: "visible"});
  await exportPanel.locator("details.project-export-advanced-section > summary").click();
  await exportPanel.locator("#export-png-scale").selectOption("2");
  const uiPath = join(artifactDir, "heightmap-ui-2x.png");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    exportPanel.locator("#export-heightmap-image").click()
  ]);
  await download.saveAs(uiPath);
  const uiFile = inspectPng(uiPath);
  const uiStatus = await page.locator("#file-operation-status").textContent();

  const finalState = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    return {
      summary: window.webglGeneratorApi.info.mapSummary().data,
      history: window.webglGeneratorApi.history.get().data,
      camera: {...app.renderer.camera},
      glError: app.renderer.getStats().draw?.glError ?? 0,
      healthErrors: (app.health?.getEvents?.() || []).filter(event => event.severity === "error").length,
      description: window.webglGeneratorApi.info.describe("data.exportHeightmapPNG").data
    };
  });

  assert.equal(apiExport.data.width, 1440);
  assert.equal(apiExport.data.height, 960);
  assert.equal(apiExport.data.cellCount, generated.summary.gridCells);
  assert.match(apiExport.data.filename, /\.heightmap\.png$/);
  assert.match(apiExport.data.dataUrl, /^data:image\/png;base64,/);
  for (const sample of apiExport.samples) {
    const expected = Math.round(Math.max(0, Math.min(100, sample.height)) * 255 / 100);
    assert.deepEqual(sample.pixel, [expected, expected, expected, 255], `cell #${sample.cell} 灰度像素错误`);
  }
  assert.equal(uiFile.width, 2880);
  assert.equal(uiFile.height, 1920);
  assert.match(uiStatus || "", /高度灰度图已导出/);
  assert.equal(apiExport.summaryAfter.checksum, generated.summary.checksum);
  assert.equal(finalState.summary.checksum, generated.summary.checksum);
  assert.deepEqual(apiExport.historyAfter, generated.history);
  assert.deepEqual(finalState.history, generated.history);
  assert.deepEqual(apiExport.cameraAfter, generated.camera);
  assert.deepEqual(finalState.camera, generated.camera);
  assert.equal(finalState.glError, 0);
  assert.equal(finalState.healthErrors, 0);
  assert.equal(finalState.description.method, "data.exportHeightmapPNG");
  assert.equal(finalState.description.inputSchema.prefixItems[0].properties.pixelScale.maximum, 4);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);

  console.log(JSON.stringify({
    ok: true,
    api: {
      filename: apiExport.data.filename,
      bytes: apiExport.data.bytes,
      size: [apiExport.data.width, apiExport.data.height],
      cellCount: apiExport.data.cellCount,
      heightRange: [apiExport.data.minHeight, apiExport.data.maxHeight],
      samples: apiExport.samples
    },
    ui: {...uiFile, status: uiStatus},
    unchanged: {
      checksum: finalState.summary.checksum,
      history: finalState.history,
      camera: finalState.camera
    },
    errors: {
      console: consoleErrors.length,
      page: pageErrors.length,
      health: finalState.healthErrors,
      webgl: finalState.glError
    }
  }, null, 2));
  await context.close();
} finally {
  if (browser) await browser.close();
  await new Promise(done => server.close(done));
}

function inspectPng(path) {
  const bytes = readFileSync(path);
  assert(bytes.length >= 24 && bytes.toString("hex", 0, 8) === "89504e470d0a1a0a", `${path} 不是有效 PNG`);
  return {path, bytes: statSync(path).size, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
}

async function startStaticServer() {
  const server = createServer((request, response) => {
    const url = new URL(request.url || "/", `http://${host}:${port}`);
    const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const target = resolve(distDir, `.${normalize(pathname)}`);
    if (!target.startsWith(distDir)) return void response.writeHead(403).end("Forbidden");
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
