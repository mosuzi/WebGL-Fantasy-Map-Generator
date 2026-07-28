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
const port = 5521;
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
    const result = {partial: {}, allLocked: {}, conflict: {}};

    await newMap("lock-river-partial", 3000);
    const branch = activeRivers().find(river => river.parent && activeRivers().some(parent => parent.i === river.parent));
    const route = activeRoutes().find(item => item.packCells?.length >= 3);
    if (!branch || !route) throw new Error("固定地图缺少可锁定支流或道路");
    unwrap(api.regenerationLocks.setMany([{kind: "river", id: branch.i}, {kind: "route", id: route.id}], true), "lock river and route");
    app.editHistory.clear();
    const riverBefore = riverEnvelope(branch.i);
    const routeBefore = routeEnvelope(route.id);
    const unlockedBefore = JSON.stringify(activeRivers().filter(river => river.i !== branch.i));
    const txBefore = transactionSnapshot("rivers");
    const regenerated = unwrap(await api.generate.regenerate("rivers", {confirm: true}), "regenerate rivers");
    if (!regenerated.executed) throw new Error("河流正式入口未执行");
    assertDeepEqual(riverEnvelope(branch.i), riverBefore, "锁定河流完整镜像");
    assertDeepEqual(routeEnvelope(route.id), routeBefore, "河流下游锁路完整镜像");
    if (JSON.stringify(activeRivers().filter(river => river.i !== branch.i)) === unlockedBefore) throw new Error("未锁河流没有变化");
    const lockedBranch = activeRivers().find(river => river.i === branch.i);
    const parent = activeRivers().find(river => river.i === lockedBranch.parent);
    const basin = activeRivers().find(river => river.i === lockedBranch.basin);
    if (!parent || !basin || !parent.cells.includes(lockedBranch.confluence)) throw new Error("锁定支流的父链支撑失效");
    const txAfter = transactionSnapshot("rivers");
    assertSingleHistory(txBefore, txAfter, "河流重生成");
    result.partial = {riverId: branch.i, parentId: parent.i, basinId: basin.i, routeId: route.id, saltDelta: 1, historyDelta: 1};

    await newMap("lock-river-all", 1000);
    const allRivers = activeRivers();
    unwrap(api.regenerationLocks.setMany(allRivers.map(river => ({kind: "river", id: river.i})), true), "lock all rivers");
    app.editHistory.clear();
    const allBefore = transactionSnapshot("rivers");
    const noOp = unwrap(await api.generate.regenerate("rivers", {confirm: true}), "regenerate all locked rivers");
    const allAfter = transactionSnapshot("rivers");
    if (noOp.executed !== false) throw new Error("全部锁河没有返回 no-op");
    assertSameTransaction(allBefore, allAfter, "全部锁河 no-op");
    result.allLocked = {rivers: allRivers.length, salt: allAfter.salt, history: allAfter.history.undo};

    await newMap("lock-river-conflict", 1000);
    const conflictRiver = activeRivers().find(river => !river.parent && river.cells?.length >= 3);
    if (!conflictRiver) throw new Error("冲突固定图缺少干流");
    unwrap(api.regenerationLocks.set({kind: "river", id: conflictRiver.i}, true), "lock conflict river");
    app.editHistory.clear();
    const from = conflictRiver.cells[0];
    conflictRiver.cells[1] = app.map.pack.cells.i.find(cell => cell !== from && !(app.map.pack.cells.c[from] || []).includes(cell));
    const conflictBefore = transactionSnapshot("rivers");
    const failed = await api.generate.regenerate("rivers", {confirm: true});
    if (failed?.ok !== false || failed?.error?.code !== "regeneration_lock_conflict") {
      throw new Error(`河流冲突没有稳定拒绝：${JSON.stringify(failed)}`);
    }
    const conflictAfter = transactionSnapshot("rivers");
    assertSameTransaction(conflictBefore, conflictAfter, "河流冲突回滚");
    result.conflict = {code: failed.error.code, salt: conflictAfter.salt, history: conflictAfter.history.undo};

    return result;

    async function newMap(seed, cellsTarget) {
      unwrap(await api.generate.newMap({confirm: true, seed, cellsTarget, heightmapTemplate: "continents"}), `newMap ${seed}`);
      app.editHistory.clear();
    }

    function activeRivers() {
      return (app.map.rivers?.rivers || []).filter(Boolean);
    }

    function activeRoutes() {
      return (app.map.settlements?.routes || []).filter(Boolean);
    }

    function riverEnvelope(id) {
      const river = activeRivers().find(item => Number(item.i) === Number(id));
      const memberCells = river.cells.filter(cell => cell >= 0);
      return {
        river: structuredClone(river),
        packRiver: structuredClone((app.map.pack.rivers || []).find(item => Number(item.i) === Number(id))),
        cells: memberCells.map(cell => [cell, Number(app.map.pack.cells.r[cell]), Number(app.map.pack.cells.fl[cell]), Number(app.map.pack.cells.conf[cell])]),
        lakeEdges: app.map.pack.features.filter(feature => feature?.type === "lake" && (
          Number(feature.river) === Number(id) || Number(feature.outlet) === Number(id) || (feature.inlets || []).map(Number).includes(Number(id))
        )).map(feature => [Number(feature.i), Number(feature.river) === Number(id), Number(feature.outlet) === Number(id), (feature.inlets || []).map(Number).includes(Number(id))]),
        notes: structuredClone((app.map.notes?.notes || []).filter(note => note?.kind === "river" && Number(note.objectId) === Number(id)))
      };
    }

    function routeEnvelope(id) {
      const route = activeRoutes().find(item => Number(item.id) === Number(id));
      return {
        route: structuredClone(route),
        packRoute: structuredClone(app.map.pack.routes[id]),
        links: route.packCells.slice(0, -1).map((cell, index) => [cell, route.packCells[index + 1], app.map.pack.cells.routes[cell]?.[route.packCells[index + 1]] ?? null]),
        notes: structuredClone((app.map.notes?.notes || []).filter(note => note?.kind === "route" && Number(note.objectId) === Number(id)))
      };
    }

    function transactionSnapshot(kind) {
      return {
        map: JSON.stringify(app.map),
        history: app.editHistory.getStats(),
        salt: Number(app.map.metadata?.regeneration?.[kind]) || 0
      };
    }

    function assertSingleHistory(before, after, label) {
      if (after.history.undo !== before.history.undo + 1 || after.history.redo !== 0 || after.salt !== before.salt + 1) {
        throw new Error(`${label} 未保持单历史/单 salt`);
      }
    }

    function assertSameTransaction(before, after, label) {
      if (after.map !== before.map || after.history.undo !== before.history.undo || after.history.redo !== before.history.redo || after.salt !== before.salt) {
        throw new Error(`${label} 没有完整保持地图、历史和 salt`);
      }
    }

    function assertDeepEqual(actual, expected, label) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}发生变化`);
    }

    function unwrap(publicResult, label) {
      if (!publicResult?.ok) throw new Error(`${label} 调用失败：${publicResult?.error?.code || "unknown"} ${publicResult?.error?.message || ""}`);
      return publicResult.data;
    }
  });

  const healthPerformanceSignals = consoleErrors.filter(message => /^\[FMG health\] (main-thread-long-task|render-frame-gap|input-handler-stall)\b/.test(message));
  const applicationConsoleErrors = consoleErrors.filter(message => !healthPerformanceSignals.includes(message));
  assert.deepEqual(applicationConsoleErrors, []);
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ok: true, ...report, healthPerformanceSignals, applicationConsoleErrors, pageErrors}, null, 2));
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
