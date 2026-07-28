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
const port = 5550;
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
      seed: "political-transfer-browser",
      cellsTarget: 3000,
      heightmapTemplate: "continents"
    }), "generate.newMap");
    app.editHistory.clear();

    const cede = await verifyConfirmedTransaction({
      label: "partial-cede",
      inspect: () => findTerritoryInspection(),
      execute: (request, options) => api.edit.states.transferTerritory(request, options),
      deniedCode: "confirmation_required"
    });
    const ensure = await verifyTransaction({
      label: "ensure-assignment",
      inspect: () => findEnsureInspection(),
      execute: (request, options) => api.edit.provinces.ensureAssignment(request, options)
    });
    const province = await verifyConfirmedTransaction({
      label: "province-transfer",
      inspect: () => findProvinceInspection(),
      execute: (request, options) => api.edit.provinces.transfer(request, options),
      deniedCode: "confirmation_required"
    });

    const health = unwrap(api.info.healthEvents({severity: "error", limit: 200}), "info.healthEvents");
    const renderer = app.renderer?.getStats?.() || {};
    const gl = document.getElementById("map-canvas")?.getContext?.("webgl2");
    return {
      cede,
      ensure,
      province,
      finalHistory: app.editHistory.getStats(),
      healthErrors: health.total,
      glError: renderer.draw?.glError ?? gl?.getError?.() ?? 0
    };

    async function verifyConfirmedTransaction({label, inspect, execute, deniedCode}) {
      const inspection = await inspect();
      assertInspection(inspection, label, true);
      const before = transactionSnapshot();
      const denied = await execute(inspection.normalizedInput, {
        inspectionToken: inspection.inspectionToken,
        expectedRevision: inspection.expectedRevision
      });
      if (denied?.ok !== false || denied?.error?.code !== deniedCode) {
        throw new Error(`${label} 未稳定触发确认门禁：${JSON.stringify(denied)}`);
      }
      assertTransactionSame(before, transactionSnapshot(), `${label}.confirm-required`);
      return executeAndUndo(label, inspection, execute, before, denied.error.code);
    }

    async function verifyTransaction({label, inspect, execute}) {
      const inspection = await inspect();
      assertInspection(inspection, label, false);
      const before = transactionSnapshot();
      return executeAndUndo(label, inspection, execute, before, null);
    }

    async function executeAndUndo(label, inspection, execute, before, deniedCode) {
      const publicResult = await execute(inspection.normalizedInput, {
        confirm: true,
        inspectionToken: inspection.inspectionToken,
        expectedRevision: inspection.expectedRevision
      });
      const executed = unwrap(publicResult, `${label}.execute`);
      if (executed.executed !== true) throw new Error(`${label} 没有执行：${JSON.stringify(executed)}`);
      const after = transactionSnapshot();
      if (after.history.undo !== before.history.undo + 1 || after.history.redo !== 0) {
        throw new Error(`${label} 未形成单条历史：${before.history.undo}/${before.history.redo} -> ${after.history.undo}/${after.history.redo}`);
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
        action: inspection.inspectionToken.split(".")[2],
        inspectionToken: inspection.inspectionToken.slice(0, 24),
        expectedRevision: inspection.expectedRevision,
        confirmRequiredCode: deniedCode,
        historyDelta: after.history.undo - before.history.undo,
        revisionDelta: after.revision.mapRevision - before.revision.mapRevision,
        undone: true
      };
    }

    function findTerritoryInspection() {
      const map = app.map;
      for (const cell of map.pack.cells.i || []) {
        if (map.pack.cells.h?.[cell] < 20) continue;
        const sourceStateId = Number(map.pack.cells.state?.[cell]);
        const gridCell = Number(map.pack.cells.g?.[cell] ?? cell);
        if (!(sourceStateId > 0) || map.grid.cells.state?.[gridCell] !== sourceStateId) continue;
        for (const neighbor of map.pack.cells.c?.[cell] || []) {
          if (map.pack.cells.h?.[neighbor] < 20) continue;
          const targetStateId = Number(map.pack.cells.state?.[neighbor]);
          if (!(targetStateId > 0) || targetStateId === sourceStateId) continue;
          const request = {
            mode: "cede",
            sourceStateId,
            targetStateId,
            gridCellIds: [gridCell],
            province: {mode: "auto"}
          };
          const inspection = unwrap(api.edit.states.inspectTerritoryTransfer(request), "inspect territory candidate");
          if (inspection.allowed && inspection.requiresConfirm && ownedPackCells(sourceStateId) > 1) return inspection;
        }
      }
      throw new Error("正式生成图找不到可执行的部分 cede 样本");
    }

    function findEnsureInspection() {
      const map = app.map;
      for (const cell of map.pack.cells.i || []) {
        if (map.pack.cells.h?.[cell] < 20) continue;
        const stateId = Number(map.pack.cells.state?.[cell]);
        const gridCell = Number(map.pack.cells.g?.[cell] ?? cell);
        if (!(stateId > 0) || map.grid.cells.state?.[gridCell] !== stateId) continue;
        for (const neighbor of map.pack.cells.c?.[cell] || []) {
          if (map.pack.cells.h?.[neighbor] < 20 || Number(map.pack.cells.state?.[neighbor]) !== stateId) continue;
          const provinceId = Number(map.pack.cells.province?.[neighbor]);
          if (!(provinceId > 0) || provinceId === Number(map.pack.cells.province?.[cell])) continue;
          const inspection = unwrap(api.edit.provinces.inspectEnsureAssignment({
            stateId,
            gridCellIds: [gridCell],
            mode: "existing",
            provinceId
          }), "inspect ensure candidate");
          if (inspection.allowed) return inspection;
        }
      }
      for (const cell of map.pack.cells.i || []) {
        if (map.pack.cells.h?.[cell] < 20) continue;
        const stateId = Number(map.pack.cells.state?.[cell]);
        const gridCell = Number(map.pack.cells.g?.[cell] ?? cell);
        if (!(stateId > 0) || map.grid.cells.state?.[gridCell] !== stateId) continue;
        const inspection = unwrap(api.edit.provinces.inspectEnsureAssignment({
          stateId,
          gridCellIds: [gridCell],
          mode: "ensure",
          anchorGridCell: gridCell
        }), "inspect ensure fallback");
        if (inspection.allowed) return inspection;
      }
      throw new Error("正式生成图找不到可执行的 ensureAssignment 样本");
    }

    function findProvinceInspection() {
      const map = app.map;
      for (const province of map.politics.provinces || []) {
        if (!province || province.removed || !(Number(province.i ?? province.id) > 0)) continue;
        const provinceId = Number(province.i ?? province.id);
        const sourceStateId = Number(province.state);
        const cells = (map.pack.cells.i || []).filter(cell => map.pack.cells.h?.[cell] >= 20 && Number(map.pack.cells.province?.[cell]) === provinceId);
        for (const cell of cells) {
          for (const neighbor of map.pack.cells.c?.[cell] || []) {
            if (map.pack.cells.h?.[neighbor] < 20) continue;
            const targetStateId = Number(map.pack.cells.state?.[neighbor]);
            if (!(targetStateId > 0) || targetStateId === sourceStateId) continue;
            const inspection = unwrap(api.edit.provinces.inspectTransfer({provinceId, targetStateId}), "inspect province candidate");
            if (inspection.allowed && inspection.requiresConfirm) return inspection;
          }
        }
      }
      throw new Error("正式生成图找不到可执行的整省转移样本");
    }

    function assertInspection(inspection, label, mustConfirm) {
      if (!inspection?.allowed || inspection.code !== "ok") throw new Error(`${label} 预检未通过：${JSON.stringify(inspection)}`);
      if (!String(inspection.inspectionToken || "").startsWith("rulei1.")) throw new Error(`${label} 缺少 rulei1 token`);
      if (!inspection.expectedRevision || inspection.expectedRevision.mapRevision !== app.mapRevision.getSnapshot().mapRevision) {
        throw new Error(`${label} expectedRevision 与当前地图不一致`);
      }
      if (mustConfirm && inspection.requiresConfirm !== true) throw new Error(`${label} 未声明 requiresConfirm`);
    }

    function ownedPackCells(stateId) {
      let count = 0;
      for (const cell of app.map.pack.cells.i || []) {
        if (app.map.pack.cells.h?.[cell] >= 20 && Number(app.map.pack.cells.state?.[cell]) === stateId) count++;
      }
      return count;
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
  assert.equal(report.healthErrors, 0, "政治转移浏览器验收出现 health error");
  assert.equal(report.glError, 0, "政治转移浏览器验收出现 WebGL error");
  assert.deepEqual(applicationConsoleErrors, [], `政治转移浏览器验收出现应用 console error：${applicationConsoleErrors.join("；")}`);
  assert.deepEqual(pageErrors, [], `政治转移浏览器验收出现 page error：${pageErrors.join("；")}`);
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
