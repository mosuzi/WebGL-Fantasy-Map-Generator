#!/usr/bin/env node
import assert from "node:assert/strict";
import {createReadStream, existsSync, statSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const distDir = join(rootDir, "dist", "webgl-generator");
const host = "127.0.0.1";
const port = 5448;
const timeoutMs = 30000;

assert.ok(existsSync(distDir), `构建产物不存在：${distDir}`);
const playwright = loadPlaywright();
const server = await startStaticServer();
let browser;

try {
  console.log("[lake-browser] 启动 Chrome");
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const page = await browser.newPage({viewport: {width: 1280, height: 820}});
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(error.message));

  console.log("[lake-browser] 打开应用");
  await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
  await page.waitForFunction(() => window.webglGeneratorApi && window.__webglGeneratorApp?.renderer?.getStats?.()?.webgl2);
  console.log("[lake-browser] 生成固定地图并准备选择");
  const before = await page.evaluate(async () => {
    const api = window.webglGeneratorApi;
    const capabilities = unwrap(api.info.capabilities(), "info.capabilities");
    unwrap(await api.generate.newMap({
      confirm: true,
      seed: "lake-delete-browser",
      cellsTarget: 3000,
      heightmapTemplate: "continents"
    }), "generate.newMap");
    const map = window.__webglGeneratorApp.map;
    const lakes = map.pack.features.filter(feature => feature?.type === "lake");
    const lake = lakes.sort((a, b) => Number(b.cells || 0) - Number(a.cells || 0))[0];
    if (!lake) throw new Error("固定 seed 应生成湖泊");
    const lakeId = Number(lake.i ?? lake.id);
    const packCells = featureCells(map.pack.cells, lakeId);
    const gridLakeId = Number(map.grid.cells.f[map.pack.cells.g[packCells[0]]]);
    const gridCells = featureCells(map.grid.cells, gridLakeId);
    unwrap(api.edit.notes.set({kind: "lake", id: lakeId}, "浏览器删除验收备注", {name: lake.name}), "edit.notes.set");
    unwrap(api.selection.select({kind: "lake", id: lakeId}), "selection.select");
    unwrap(api.selection.highlight([{kind: "lake", id: lakeId}]), "selection.highlight");
    return {
      lakeId,
      gridLakeId,
      packCells,
      gridCells,
      lakeCount: lakes.length,
      lakeShore: map.features.shore.lakeShore.length,
      noteId: `lake:${lakeId}`,
      deleteCapability: capabilities.methods.edit.includes("lakes.delete"),
      deleteMetadata: capabilities.methodMetadata.edit["lakes.delete"] || null,
      metadataCoverageComplete: capabilities.methodMetadataCoverage.complete
    };

    function featureCells(cells, featureId) {
      return Array.from(cells.f, (value, cell) => Number(value) === featureId ? cell : -1).filter(cell => cell >= 0);
    }

    function unwrap(result, label) {
      if (!result?.ok) throw new Error(`${label}: ${result?.error?.message || "调用失败"}`);
      return result.data;
    }
  });
  assert.equal(before.deleteCapability, true);
  assert.equal(before.deleteMetadata?.mutates, "lakes");
  assert.equal(before.metadataCoverageComplete, true);

  console.log(`[lake-browser] 打开湖泊面板并删除 #${before.lakeId}`);
  await page.evaluate(() => document.getElementById("open-lake-panel")?.click());
  const lakePanel = page.locator('.floating-panel[data-panel-id="lake-panel"]:not(.hidden)');
  await lakePanel.waitFor({state: "visible"});
  await lakePanel.getByRole("button", {name: "填平并删除选中湖泊"}).click();
  await page.waitForFunction(lakeId => !window.__webglGeneratorApp.map.pack.features[lakeId], before.lakeId);
  console.log("[lake-browser] 核验删除结果");
  const after = await inspect(page, before);
  assertDeletion(after, before);

  console.log("[lake-browser] 核验撤销");
  const undo = await page.evaluate(() => window.webglGeneratorApi.history.undo());
  assert.equal(undo.ok, true, undo.error?.message);
  const restored = await inspect(page, before);
  assert.equal(restored.resolved, true);
  assert.equal(restored.noteExists, true);
  assert.equal(restored.lakeCount, before.lakeCount);
  assert.equal(restored.lakeShore, before.lakeShore);

  console.log("[lake-browser] 核验重做");
  const redo = await page.evaluate(() => window.webglGeneratorApi.history.redo());
  assert.equal(redo.ok, true, redo.error?.message);
  const redone = await inspect(page, before);
  assertDeletion(redone, before);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);

  console.log(JSON.stringify({ok: true, before, after, restored, redone, consoleErrors, pageErrors}, null, 2));
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(resolveClose => server.close(resolveClose));
}

async function inspect(page, fixture) {
  return page.evaluate(async ({lakeId, gridLakeId, packCells, gridCells, noteId}) => {
    const app = window.__webglGeneratorApp;
    const map = app.map;
    const api = window.webglGeneratorApi;
    const selection = api.selection.get();
    const resolved = api.selection.resolve({kind: "lake", id: lakeId});
    const full = await api.data.exportAll({download: false});
    const documentObject = full.ok ? JSON.parse(full.data.text) : null;
    const stats = app.renderer.getStats?.() || {};
    const gl = document.querySelector("canvas")?.getContext?.("webgl2");
    const healthErrors = (window.__webglGeneratorHealth?.getEvents?.(200) || []).filter(event => event.level === "error").length;
    return {
      lakeCount: map.pack.features.filter(feature => feature?.type === "lake").length,
      lakeShore: map.features.shore.lakeShore.length,
      packFeature: map.pack.features[lakeId] || null,
      gridFeature: map.features.features[gridLakeId] || null,
      packCellsLand: packCells.every(cell => map.pack.cells.h[cell] >= 20 && map.pack.features[map.pack.cells.f[cell]]?.land),
      gridCellsLand: gridCells.every(cell => map.grid.cells.h[cell] >= 20 && map.features.features[map.grid.cells.f[cell]]?.land),
      selection: selection.ok ? selection.data.selection : "api-error",
      highlightCount: app.persistentObjectHighlights?.size || 0,
      resolved: Boolean(resolved.ok && resolved.data),
      noteExists: map.notes.notes.some(note => note.id === noteId),
      staleRivers: map.metadata.derivedStale?.systems?.includes("rivers") || false,
      havenMetadata: map.pack.metadata.havenCells,
      havenActual: Array.from(map.pack.cells.haven || []).filter(value => Number(value) > 0).length,
      harborMetadata: map.pack.metadata.harborCells,
      harborActual: Array.from(map.pack.cells.harbor || []).filter(value => Number(value) > 0).length,
      stalePortDiagnostic: (map.pack.portDiagnostics?.features || []).some(item => Number(item.feature) === lakeId),
      exportedFeature: documentObject?.map?.pack?.features?.[lakeId] || null,
      historyDomain: app.editHistory.getStats().lastDomain,
      glError: stats.draw?.glError ?? gl?.getError?.() ?? 0,
      healthErrors
    };
  }, fixture);
}

function assertDeletion(actual, before) {
  assert.equal(actual.lakeCount, before.lakeCount - 1);
  assert.equal(actual.packFeature, null);
  assert.equal(actual.gridFeature, null);
  assert.equal(actual.packCellsLand, true);
  assert.equal(actual.gridCellsLand, true);
  assert.equal(actual.selection, null);
  assert.equal(actual.highlightCount, 0);
  assert.equal(actual.resolved, false);
  assert.equal(actual.noteExists, false);
  assert.equal(actual.staleRivers, true);
  assert.equal(actual.havenMetadata, actual.havenActual);
  assert.equal(actual.harborMetadata, actual.harborActual);
  assert.equal(actual.stalePortDiagnostic, false);
  assert.equal(actual.exportedFeature, null);
  assert.equal(actual.historyDomain, "lake");
  assert.equal(actual.glError, 0);
  assert.equal(actual.healthErrors, 0);
  assert.ok(actual.lakeShore < before.lakeShore);
}

function loadPlaywright() {
  return createRequire(join(sourceDir, "package.json"))("playwright");
}

async function startStaticServer() {
  const server = createServer((request, response) => {
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
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, host, resolveListen);
  });
  return server;
}

function contentType(file) {
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml"
  })[extname(file).toLowerCase()] || "application/octet-stream";
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}
