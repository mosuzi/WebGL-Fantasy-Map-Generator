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
const port = 5551;
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
      seed: "province-topology-browser",
      cellsTarget: 5000,
      heightmapTemplate: "continents"
    }), "generate.newMap");
    app.editHistory.clear();

    const merge = await verifyConfirmedTransaction({
      label: "province-merge",
      inspect: findMergeInspection,
      execute: (request, options) => api.edit.provinces.merge(request, options)
    });
    const split = await verifyConfirmedTransaction({
      label: "province-split",
      inspect: findSplitInspection,
      execute: (request, options) => api.edit.provinces.split(request, options)
    });

    const health = unwrap(api.info.healthEvents({severity: "error", limit: 200}), "info.healthEvents");
    const renderer = app.renderer?.getStats?.() || {};
    const gl = document.getElementById("map-canvas")?.getContext?.("webgl2");
    return {
      merge,
      split,
      finalHistory: app.editHistory.getStats(),
      healthErrors: health.total,
      glError: renderer.draw?.glError ?? gl?.getError?.() ?? 0
    };

    async function verifyConfirmedTransaction({label, inspect, execute}) {
      const inspection = inspect();
      assertInspection(inspection, label);
      const before = transactionSnapshot();
      const denied = await execute(inspection.normalizedInput, {
        inspectionToken: inspection.inspectionToken,
        expectedRevision: inspection.expectedRevision
      });
      if (denied?.ok !== false || denied?.error?.code !== "confirmation_required") {
        throw new Error(`${label} 未稳定触发确认门禁：${JSON.stringify(denied)}`);
      }
      assertTransactionSame(before, transactionSnapshot(), `${label}.confirmation-required`);

      const executed = unwrap(await execute(inspection.normalizedInput, {
        confirm: true,
        inspectionToken: inspection.inspectionToken,
        expectedRevision: inspection.expectedRevision
      }), `${label}.execute`);
      if (executed.executed !== true) throw new Error(`${label} 没有执行：${JSON.stringify(executed)}`);
      const after = transactionSnapshot();
      if (after.history.undo !== before.history.undo + 1 || after.history.redo !== 0) {
        throw new Error(`${label} 未形成单条历史`);
      }
      if (after.revision.mapRevision !== before.revision.mapRevision + 1) {
        throw new Error(`${label} mapRevision 未单步递增`);
      }
      if (after.map === before.map) throw new Error(`${label} 没有形成地图变化`);

      unwrap(api.history.undo(), `${label}.undo`);
      const undone = transactionSnapshot();
      if (undone.map !== before.map) throw new Error(`${label} 撤销没有恢复完整地图`);
      if (undone.history.undo !== before.history.undo || undone.history.redo !== 1) {
        throw new Error(`${label} 撤销历史状态异常`);
      }
      return {
        inspectionToken: inspection.inspectionToken.slice(0, 24),
        expectedRevision: inspection.expectedRevision,
        confirmationRequiredCode: denied.error.code,
        historyDelta: after.history.undo - before.history.undo,
        revisionDelta: after.revision.mapRevision - before.revision.mapRevision,
        affected: inspection.affected,
        undone: true
      };
    }

    function findMergeInspection() {
      const map = app.map;
      const seen = new Set();
      for (const cell of map.pack.cells.i || []) {
        if (map.pack.cells.h?.[cell] < 20) continue;
        const left = Number(map.pack.cells.province?.[cell]);
        const stateId = Number(map.pack.cells.state?.[cell]);
        if (!(left > 0) || !(stateId > 0)) continue;
        for (const neighbor of map.pack.cells.c?.[cell] || []) {
          if (map.pack.cells.h?.[neighbor] < 20 || Number(map.pack.cells.state?.[neighbor]) !== stateId) continue;
          const right = Number(map.pack.cells.province?.[neighbor]);
          if (!(right > 0) || right === left) continue;
          const pair = [left, right].sort((a, b) => a - b);
          const key = pair.join(":");
          if (seen.has(key)) continue;
          seen.add(key);
          for (const targetProvinceId of pair) {
            const inspection = unwrap(api.edit.provinces.inspectMerge({
              provinceIds: pair,
              targetProvinceId
            }), "inspect merge candidate");
            if (inspection.allowed && inspection.requiresConfirm) return inspection;
          }
        }
      }
      throw new Error("正式生成图找不到可执行的相邻同国省份合并样本");
    }

    function findSplitInspection() {
      const map = app.map;
      const cities = (map.settlements?.cities || []).filter(city => city && !city.removed);
      for (const province of map.politics?.provinces || []) {
        if (!province || province.removed) continue;
        const sourceProvinceId = Number(province.i ?? province.id);
        if (!(sourceProvinceId > 0)) continue;
        const sourceCells = (map.pack.cells.i || []).filter(cell =>
          map.pack.cells.h?.[cell] >= 20 && Number(map.pack.cells.province?.[cell]) === sourceProvinceId
        );
        if (sourceCells.length < 2) continue;
        const sourceSet = new Set(sourceCells);
        const provinceCities = cities.filter(city => Number(city.province) === sourceProvinceId && sourceSet.has(cityPackCell(city)));
        if (provinceCities.length < 2) continue;
        const cityCells = new Set(provinceCities.map(cityPackCell));

        for (const seedCity of provinceCities) {
          const selected = new Set([cityPackCell(seedCity)]);
          const queue = [cityPackCell(seedCity)];
          for (let cursor = 0; cursor < queue.length && selected.size < sourceCells.length - 1; cursor++) {
            const inspection = unwrap(api.edit.provinces.inspectSplit({
              sourceProvinceId,
              packCellIds: [...selected].sort((a, b) => a - b),
              newCapitalCityId: Number(seedCity.id)
            }), "inspect split candidate");
            if (inspection.allowed && inspection.requiresConfirm) return inspection;

            const neighbors = [...(map.pack.cells.c?.[queue[cursor]] || [])]
              .filter(cell => sourceSet.has(cell) && !selected.has(cell))
              .sort((a, b) => Number(cityCells.has(a)) - Number(cityCells.has(b)) || a - b);
            for (const neighbor of neighbors) {
              if (selected.size >= sourceCells.length - 1) break;
              selected.add(neighbor);
              queue.push(neighbor);
              if ([...selected].filter(cell => cityCells.has(cell)).length >= provinceCities.length) break;
            }
            if ([...selected].filter(cell => cityCells.has(cell)).length >= provinceCities.length) break;
          }
        }
      }
      throw new Error("正式生成图找不到两侧连通且各含城市的省份拆分样本");
    }

    function cityPackCell(city) {
      return Number(city?.packCell ?? city?.cell);
    }

    function assertInspection(inspection, label) {
      if (!inspection?.allowed || inspection.code !== "ok") {
        throw new Error(`${label} 预检未通过：${JSON.stringify(inspection)}`);
      }
      if (!String(inspection.inspectionToken || "").startsWith("rulei1.")) {
        throw new Error(`${label} 缺少 rulei1 token`);
      }
      if (!inspection.expectedRevision || inspection.expectedRevision.mapRevision !== app.mapRevision.getSnapshot().mapRevision) {
        throw new Error(`${label} expectedRevision 与当前地图不一致`);
      }
      if (inspection.requiresConfirm !== true) throw new Error(`${label} 未声明 requiresConfirm`);
    }

    function transactionSnapshot() {
      return {
        map: JSON.stringify(app.map),
        history: app.editHistory.getStats(),
        revision: app.mapRevision.getSnapshot()
      };
    }

    function assertTransactionSame(before, after, label) {
      if (before.map !== after.map
        || JSON.stringify(before.history) !== JSON.stringify(after.history)
        || JSON.stringify(before.revision) !== JSON.stringify(after.revision)) {
        throw new Error(`${label} 改变了地图、历史或 revision`);
      }
    }

    function unwrap(publicResult, label) {
      if (!publicResult?.ok) {
        throw new Error(`${label} 调用失败：${publicResult?.error?.code || "unknown"} ${publicResult?.error?.message || ""}`);
      }
      return publicResult.data;
    }
  });

  const healthPerformanceSignals = consoleErrors.filter(message =>
    /^\[FMG health\] (main-thread-long-task|render-frame-gap|input-handler-stall)\b/.test(message)
  );
  const applicationConsoleErrors = consoleErrors.filter(message => !healthPerformanceSignals.includes(message));
  assert.equal(report.healthErrors, 0, "省份拓扑浏览器验收出现 health error");
  assert.equal(report.glError, 0, "省份拓扑浏览器验收出现 WebGL error");
  assert.deepEqual(applicationConsoleErrors, [], `省份拓扑浏览器验收出现应用 console error：${applicationConsoleErrors.join("；")}`);
  assert.deepEqual(pageErrors, [], `省份拓扑浏览器验收出现 page error：${pageErrors.join("；")}`);
  console.log(JSON.stringify({
    ok: true,
    ...report,
    healthPerformanceSignals,
    applicationConsoleErrors,
    pageErrors
  }, null, 2));
} finally {
  if (context) await Promise.race([context.close(), delay(5000)]);
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(done => server.close(done));
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
    response.writeHead(200, {"Content-Type": contentType(target), "Cache-Control": "no-store"});
    createReadStream(target).pipe(response);
  });
  await new Promise((done, reject) => {
    serverInstance.once("error", reject);
    serverInstance.listen(port, host, done);
  });
  return serverInstance;
}

function contentType(pathname) {
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml"
  })[extname(pathname)] || "application/octet-stream";
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}
