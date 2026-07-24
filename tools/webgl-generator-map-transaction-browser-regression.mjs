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
const port = 5498;
const timeoutMs = 240000;
assert.ok(existsSync(distDir), `构建产物不存在：${distDir}`);

const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const server = await startStaticServer();
let browser;
let context;

try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  context = await browser.newContext({viewport: {width: 1280, height: 820}, deviceScaleFactor: 1});
  await context.addInitScript(() => localStorage.clear());
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, timeoutMs);
  const report = await page.evaluate(async () => {
    const api = window.webglGeneratorApi;
    const app = window.__webglGeneratorApp;
    unwrap(await api.generate.newMap({
      confirm: true,
      seed: "map-transaction-browser",
      cellsTarget: 1000,
      heightmapTemplate: "continents"
    }), "generate.newMap");

    const regenerationKinds = ["features", "routes", "rivers", "cities", "states", "provinces", "markers", "diplomacy", "religions", "military", "zones"];
    const regeneration = [];
    for (const kind of regenerationKinds) {
      regeneration.push(await verifyRoundTrip(
        `generate.regenerate.${kind}`,
        () => api.generate.regenerate(kind, {confirm: true}),
        result => unwrap(result, `generate.regenerate.${kind}`)
      ));
    }

    const height = [];
    height.push(await verifyRoundTrip(
      "edit.height.rebuildBaseDerived",
      () => api.edit.height.rebuildBaseDerived({confirm: true}),
      result => unwrap(result, "edit.height.rebuildBaseDerived")
    ));
    height.push(await verifyRoundTrip(
      "edit.height.rebuildDownstreamDerived",
      () => api.edit.height.rebuildDownstreamDerived({confirm: true}),
      result => unwrap(result, "edit.height.rebuildDownstreamDerived")
    ));
    height.push(await verifyRoundTrip(
      "edit.height.rebuildAllDerived",
      () => app.runtimeActions.edit.height.rebuildAllDerived({confirm: true}),
      result => {
        if (!result?.executed) throw new Error("edit.height.rebuildAllDerived 未执行");
        return result;
      }
    ));

    const geoJson = createFmgCellsGeoJson();
    const geo = await verifyRoundTrip(
      "data.importGEO.fmg-cells",
      () => api.data.importGEO(geoJson, {confirm: true}),
      result => {
        const data = unwrap(result, "data.importGEO.fmg-cells");
        if (data.mode !== "fmg-cells-terrain" || data.imported !== true) {
          throw new Error(`FMG Cells GEO 结果异常：${data.mode}/${data.imported}`);
        }
        return data;
      }
    );

    const climateBefore = fingerprint(app.map);
    const climateOptionsReference = app.map.options;
    const historyBeforeClimate = app.editHistory.getStats();
    const pendingClimate = api.climate.applyDownstreamRebuild({systems: ["cities"], confirm: true, seed: 202});
    const busy = await api.generate.regenerate("cities", {confirm: true});
    if (busy?.ok !== false || busy?.error?.code !== "operation_busy") {
      throw new Error(`并发请求没有稳定返回 operation_busy：${JSON.stringify(busy)}`);
    }
    const climateData = unwrap(await pendingClimate, "climate.applyDownstreamRebuild");
    if (!climateData.executed) throw new Error("气候下游重算未执行");
    const climateAfter = fingerprint(app.map);
    const historyAfterClimate = app.editHistory.getStats();
    assertSingleHistory(historyBeforeClimate, historyAfterClimate, "climate.applyDownstreamRebuild");
    unwrap(api.history.undo(), "history.undo.climate");
    if (fingerprint(app.map) !== climateBefore) throw new Error("气候下游重算撤销没有恢复完整地图");
    if (app.map.options !== climateOptionsReference) throw new Error("气候下游重算撤销替换了 map.options 引用");
    unwrap(api.history.redo(), "history.redo.climate");
    if (fingerprint(app.map) !== climateAfter) throw new Error("气候下游重算重做没有恢复完整地图");
    if (app.map.options !== climateOptionsReference) throw new Error("气候下游重算重做替换了 map.options 引用");
    unwrap(api.history.undo(), "history.undo.climate-baseline");

    const capabilities = unwrap(api.info.capabilities(), "info.capabilities");
    const expectedUndoable = [
      "generate.regenerate",
      "edit.height.rebuildBaseDerived",
      "edit.height.rebuildDownstreamDerived",
      "data.importGEO",
      "climate.applyDownstreamRebuild"
    ];
    for (const method of expectedUndoable) {
      if (readMethodMetadata(capabilities.methodMetadata, method)?.undoable !== true) {
        throw new Error(`${method} 能力元数据没有声明完整可撤销`);
      }
    }

    const stats = app.renderer?.getStats?.() || {};
    return {
      regeneration,
      height,
      geo,
      climate: {
        historyDelta: historyAfterClimate.undo - historyBeforeClimate.undo,
        busyCode: busy.error.code,
        requestedSystems: climateData.requestedSystems,
        executionOrder: climateData.executionOrder
      },
      metadataUndoable: expectedUndoable,
      glError: stats.draw?.glError ?? document.querySelector("canvas")?.getContext?.("webgl2")?.getError?.() ?? 0
    };

    async function verifyRoundTrip(label, execute, readResult) {
      const mapReference = app.map;
      const optionsReference = app.map.options;
      const before = fingerprint(app.map);
      const historyBefore = app.editHistory.getStats();
      const publicResult = await execute();
      const result = readResult(publicResult);
      const after = fingerprint(app.map);
      const historyAfter = app.editHistory.getStats();
      assertSingleHistory(historyBefore, historyAfter, label);
      if (after === before) throw new Error(`${label} 没有形成可观察地图变化`);
      if (app.map !== mapReference || app.map.options !== optionsReference) throw new Error(`${label} 替换了地图或 options 引用`);
      unwrap(api.history.undo(), `history.undo.${label}`);
      if (fingerprint(app.map) !== before) throw new Error(`${label} 单条撤销没有恢复完整地图`);
      if (app.map !== mapReference || app.map.options !== optionsReference) throw new Error(`${label} 撤销替换了地图或 options 引用`);
      unwrap(api.history.redo(), `history.redo.${label}`);
      const redone = fingerprint(app.map);
      if (redone !== after) throw new Error(`${label} 单条重做没有恢复完整地图：${describeFingerprintDifference(after, redone)}`);
      if (app.map !== mapReference || app.map.options !== optionsReference) throw new Error(`${label} 重做替换了地图或 options 引用`);
      unwrap(api.history.undo(), `history.undo.${label}.baseline`);
      return {
        label,
        historyDelta: historyAfter.undo - historyBefore.undo,
        status: result.status || result.mode || "executed"
      };
    }

    function assertSingleHistory(before, after, label) {
      if (after.undo !== before.undo + 1 || after.redo !== 0) {
        throw new Error(`${label} 没有恰好形成一条历史：${before.undo}/${before.redo} -> ${after.undo}/${after.redo}`);
      }
    }

    function createFmgCellsGeoJson() {
      const map = app.map;
      const width = Number(map.metadata?.graphWidth) || Number(map.options?.graphWidth) || 1;
      const height = Number(map.metadata?.graphHeight) || Number(map.options?.graphHeight) || 1;
      const coordinates = map.mapCoordinates || {};
      const lonW = finite(coordinates.lonW, 0);
      const lonE = finite(coordinates.lonE, width);
      const latN = finite(coordinates.latN, 0);
      const latS = finite(coordinates.latS, height);
      const cells = map.grid.cells;
      const vertices = map.grid.vertices;
      const selected = Array.from(cells.i || []).slice(0, 900);
      const features = selected.map((cell, index) => {
        const ring = (cells.v[cell] || []).map(vertex => vertices.p?.[vertex]).filter(Boolean).map(project);
        if (ring.length && (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1])) ring.push([...ring[0]]);
        return {
          type: "Feature",
          id: cell,
          properties: {
            id: cell,
            height: index % 7 === 0 ? -120 : (34 + index % 5 * 7 - 18) ** 2,
            biome: Number(cells.biome?.[cell] ?? 0),
            neighbors: (cells.c?.[cell] || []).filter(Number.isInteger)
          },
          geometry: {type: "Polygon", coordinates: [ring]}
        };
      }).filter(feature => feature.geometry.coordinates[0].length >= 4);
      return {type: "FeatureCollection", name: "map-transaction-browser", features};

      function project(point) {
        return [
          round(lonW + point[0] / width * (lonE - lonW)),
          round(latN + point[1] / height * (latS - latN))
        ];
      }
    }

    function fingerprint(map) {
      return JSON.stringify(map);
    }

    function describeFingerprintDifference(expected, actual) {
      const limit = Math.min(expected.length, actual.length);
      let index = 0;
      while (index < limit && expected[index] === actual[index]) index++;
      const start = Math.max(0, index - 120);
      const end = index + 220;
      return `index=${index}, expected=${expected.slice(start, end)}, actual=${actual.slice(start, end)}`;
    }

    function readMethodMetadata(metadata, qualifiedName) {
      const [namespace, ...method] = qualifiedName.split(".");
      return metadata?.[namespace]?.[method.join(".")] || null;
    }

    function unwrap(result, label) {
      if (!result?.ok) throw new Error(`${label} 调用失败：${result?.error?.code || "unknown"} ${result?.error?.message || ""}`);
      return result.data;
    }

    function finite(value, fallback) {
      return Number.isFinite(Number(value)) ? Number(value) : fallback;
    }

    function round(value) {
      return Math.round(Number(value || 0) * 1e6) / 1e6;
    }
  });
  const uiTransaction = await verifyStateRegenerationUi(page);

  assert.equal(report.regeneration.length, 11);
  assert.equal(report.height.length, 3);
  assert.equal(report.geo.historyDelta, 1);
  assert.equal(report.climate.historyDelta, 1);
  assert.equal(report.climate.busyCode, "operation_busy");
  assert.equal(uiTransaction.historyDelta, 1);
  assert.equal(uiTransaction.undoRestored, true);
  assert.equal(uiTransaction.redoRestored, true);
  assert.equal(report.glError, 0);
  const healthPerformanceSignals = consoleErrors.filter(message => /^\[FMG health\] (main-thread-long-task|render-frame-gap|input-handler-stall)\b/.test(message));
  const applicationConsoleErrors = consoleErrors.filter(message => !healthPerformanceSignals.includes(message));
  assert.deepEqual(applicationConsoleErrors, []);
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ok: true, ...report, uiTransaction, healthPerformanceSignals, applicationConsoleErrors, pageErrors}, null, 2));
} finally {
  if (context) await Promise.race([context.close(), delay(5000)]);
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(done => server.close(done));
}

async function verifyStateRegenerationUi(page) {
  const before = await page.evaluate(() => ({
    map: JSON.stringify(window.__webglGeneratorApp.map),
    history: window.__webglGeneratorApp.editHistory.getStats()
  }));
  await page.keyboard.press("Shift+S");
  const panel = page.locator('.floating-panel[data-panel-id="state-panel"]:not(.hidden)');
  await panel.waitFor({state: "visible"});
  const regenerate = panel.getByRole("button", {name: "重新生成国家"});
  const undo = panel.getByRole("button", {name: "撤销"});
  const redo = panel.getByRole("button", {name: "重做"});
  assert.equal(await regenerate.count(), 1, "国家面板缺少唯一重生成入口");
  assert.equal(await undo.isDisabled(), true, "UI 事务夹具开始前不应有撤销历史");
  await regenerate.click();
  await page.waitForFunction(() => document.querySelector('.floating-panel[data-panel-id="state-panel"]:not(.hidden) button[aria-label="撤销"]')?.disabled === false);
  const after = await page.evaluate(() => ({
    map: JSON.stringify(window.__webglGeneratorApp.map),
    history: window.__webglGeneratorApp.editHistory.getStats()
  }));
  assert.notEqual(after.map, before.map, "国家面板重生成没有形成可观察地图变化");
  await undo.click();
  await page.waitForFunction(() => document.querySelector('.floating-panel[data-panel-id="state-panel"]:not(.hidden) button[aria-label="重做"]')?.disabled === false);
  const afterUndo = await page.evaluate(() => JSON.stringify(window.__webglGeneratorApp.map));
  await redo.click();
  await page.waitForFunction(() => document.querySelector('.floating-panel[data-panel-id="state-panel"]:not(.hidden) button[aria-label="撤销"]')?.disabled === false);
  const afterRedo = await page.evaluate(() => JSON.stringify(window.__webglGeneratorApp.map));
  await undo.click();
  return {
    historyDelta: after.history.undo - before.history.undo,
    undoRestored: afterUndo === before.map,
    redoRestored: afterRedo === after.map
  };
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
