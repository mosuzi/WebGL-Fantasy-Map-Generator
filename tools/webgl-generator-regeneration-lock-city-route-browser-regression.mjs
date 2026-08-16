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
const port = 5517;
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
    const result = {fullCityNoop: {}, city: {}, scoped: {}, route: {}, conflict: {}};

    await newMap("lock-city-all");
    const allCities = activeCities();
    unwrap(api.regenerationLocks.setMany(allCities.map(city => ({kind: "city", id: city.id})), true), "lock all cities");
    app.editHistory.clear();
    const allBefore = transactionSnapshot("cities");
    const noOp = unwrap(await api.generate.regenerate("cities", {confirm: true}), "regenerate all locked cities");
    const allAfter = transactionSnapshot("cities");
    if (noOp.executed !== false) throw new Error("全部锁城没有返回 no-op");
    assertSameTransaction(allBefore, allAfter, "全部锁城 no-op");
    result.fullCityNoop = {cities: allCities.length, history: allAfter.history.undo, salt: allAfter.salt};

    await newMap("lock-city-route");
    const city = ordinaryCities()[0];
    const route = activeRoutes().find(item => item.packCells?.length >= 3);
    if (!city || !route) throw new Error("固定地图缺少普通城镇或道路");
    unwrap(api.regenerationLocks.setMany([{kind: "city", id: city.id}, {kind: "route", id: route.id}], true), "lock city and route");
    app.editHistory.clear();
    const cityBefore = cityEnvelope(city.id);
    const routeBefore = routeEnvelope(route.id);
    const unlockedBefore = stableJson(activeCities().filter(item => item.id !== city.id));
    const cityTxBefore = transactionSnapshot("cities");
    const cityResult = unwrap(await api.generate.regenerate("cities", {confirm: true}), "regenerate cities");
    if (!cityResult.executed) throw new Error("城镇正式入口未执行");
    assertDeepEqual(cityEnvelope(city.id), cityBefore, "锁城完整镜像");
    assertDeepEqual(routeEnvelope(route.id), routeBefore, "城镇下游锁路完整镜像");
    if (stableJson(activeCities().filter(item => item.id !== city.id)) === unlockedBefore) throw new Error("未锁城镇没有变化");
    const cityTxAfter = transactionSnapshot("cities");
    assertSingleHistory(cityTxBefore, cityTxAfter, "城镇重生成");
    result.city = {cityId: city.id, routeId: route.id, historyDelta: 1, saltDelta: cityTxAfter.salt - cityTxBefore.salt};

    await newMap("lock-city-scoped");
    const state = activeStates().find(item => ordinaryCities().filter(cityRow => Number(cityRow.state) === Number(item.i)).length >= 2);
    if (!state) throw new Error("固定地图缺少局部重生成国家");
    const scopedCities = ordinaryCities().filter(item => Number(item.state) === Number(state.i));
    const scopedLocked = scopedCities[0];
    unwrap(api.regenerationLocks.set({kind: "city", id: scopedLocked.id}, true), "lock scoped city");
    app.editHistory.clear();
    const scopedLockedBefore = cityEnvelope(scopedLocked.id);
    const outsideBefore = stableJson(activeCities().filter(item => Number(item.state) !== Number(state.i)));
    const scopedTxBefore = transactionSnapshot("cities");
    const scopedResult = unwrap(await api.generate.regenerate("cities", {confirm: true, scope: "state", stateId: state.i}), "regenerate scoped cities");
    if (!scopedResult.executed) throw new Error("局部城镇正式入口未执行");
    assertDeepEqual(cityEnvelope(scopedLocked.id), scopedLockedBefore, "局部锁城完整镜像");
    if (stableJson(activeCities().filter(item => Number(item.state) !== Number(state.i))) !== outsideBefore) throw new Error("局部重生成改写范围外城镇");
    const scopedTxAfter = transactionSnapshot("cities");
    assertSingleHistory(scopedTxBefore, scopedTxAfter, "局部城镇重生成");
    result.scoped = {stateId: state.i, cityId: scopedLocked.id, outside: JSON.parse(outsideBefore).length, historyDelta: 1};

    await newMap("lock-route-direct");
    const directRoute = activeRoutes().find(item => item.packCells?.length >= 3);
    unwrap(api.regenerationLocks.set({kind: "route", id: directRoute.id}, true), "lock direct route");
    app.editHistory.clear();
    const directBefore = routeEnvelope(directRoute.id);
    const routesBefore = stableJson(activeRoutes().filter(item => item.id !== directRoute.id));
    const routeTxBefore = transactionSnapshot("routes");
    const routeResult = unwrap(await api.generate.regenerate("routes", {confirm: true}), "regenerate routes");
    if (!routeResult.executed) throw new Error("道路正式入口未执行");
    assertDeepEqual(routeEnvelope(directRoute.id), directBefore, "直接锁路完整镜像");
    if (stableJson(activeRoutes().filter(item => item.id !== directRoute.id)) === routesBefore) throw new Error("未锁道路没有变化");
    const routeTxAfter = transactionSnapshot("routes");
    assertSingleHistory(routeTxBefore, routeTxAfter, "道路重生成");
    result.route = {routeId: directRoute.id, historyDelta: 1, saltDelta: routeTxAfter.salt - routeTxBefore.salt};

    await newMap("lock-route-conflict");
    const conflicts = activeRoutes().filter(item => item.packCells?.length >= 3).slice(0, 2);
    if (conflicts.length < 2) throw new Error("固定地图缺少冲突道路");
    const [first, second] = conflicts;
    Object.assign(second, {
      packCells: structuredClone(first.packCells),
      cells: structuredClone(first.cells),
      points: structuredClone(first.points)
    });
    app.map.pack.routes[second.id] = {
      ...structuredClone(app.map.pack.routes[first.id]),
      i: second.id
    };
    app.workerTaskCoordinator.invalidateSession("fixture-route-conflict-direct-map-mutation");
    unwrap(api.regenerationLocks.setMany(conflicts.map(item => ({kind: "route", id: item.id})), true), "lock conflict routes");
    app.editHistory.clear();
    const conflictBefore = transactionSnapshot("routes");
    const failed = await api.generate.regenerate("routes", {confirm: true});
    if (failed?.ok !== false || failed?.error?.code !== "regeneration_lock_conflict") {
      throw new Error(`道路冲突没有稳定拒绝：${JSON.stringify(failed)}`);
    }
    const conflictAfter = transactionSnapshot("routes");
    assertSameTransaction(conflictBefore, conflictAfter, "道路冲突回滚");
    result.conflict = {code: failed.error.code, history: conflictAfter.history.undo, salt: conflictAfter.salt};

    return result;

    async function newMap(seed) {
      unwrap(await api.generate.newMap({confirm: true, seed, cellsTarget: 1000, heightmapTemplate: "continents"}), `newMap ${seed}`);
      app.editHistory.clear();
    }

    function activeCities() {
      return (app.map.settlements?.cities || []).filter(cityRow => cityRow && !cityRow.removed);
    }

    function ordinaryCities() {
      const anchors = new Set((app.map.politics?.provinces || []).filter(item => item?.i && !item.removed).map(item => Number(item.burg)));
      return activeCities().filter(item => !item.capital && !anchors.has(Number(item.burgId)));
    }

    function activeRoutes() {
      return (app.map.settlements?.routes || []).filter(Boolean);
    }

    function activeStates() {
      return (app.map.politics?.states || []).filter(item => item?.i && !item.removed);
    }

    function cityEnvelope(id) {
      const cityRow = app.map.settlements.cities.find(item => Number(item?.id) === Number(id));
      const burg = app.map.pack.burgs[cityRow.burgId];
      const stateRow = app.map.politics.states[cityRow.state];
      const province = app.map.politics.provinces[cityRow.province];
      return {
        city: structuredClone(cityRow),
        burg: structuredClone(burg),
        packCellBurg: app.map.pack.cells.burg[cityRow.packCell],
        gridCellBurg: app.map.grid.cells.burg[cityRow.cell],
        stateAnchor: Number(stateRow?.capital) === Number(cityRow.burgId) ? pick(stateRow, ["capital", "center", "gridCenter", "capitalName"]) : null,
        provinceAnchor: Number(province?.burg) === Number(cityRow.burgId) ? pick(province, ["burg", "center", "gridCenter"]) : null
      };
    }

    function routeEnvelope(id) {
      const routeRow = app.map.settlements.routes.find(item => Number(item?.id) === Number(id));
      return {
        route: structuredClone(routeRow),
        packRoute: structuredClone(app.map.pack.routes[id]),
        links: routeRow.packCells.slice(0, -1).map((cell, index) => [cell, routeRow.packCells[index + 1], app.map.pack.cells.routes[cell]?.[routeRow.packCells[index + 1]] ?? null]),
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
        throw new Error(`${label} 未保持单历史/单 salt：${JSON.stringify({before, after})}`);
      }
    }

    function assertSameTransaction(before, after, label) {
      if (after.map !== before.map || after.history.undo !== before.history.undo || after.history.redo !== before.history.redo || after.salt !== before.salt) {
        throw new Error(`${label} 没有完整保持地图、历史和 salt`);
      }
    }

    function assertDeepEqual(actual, expected, label) {
      const actualJson = stableJson(actual);
      const expectedJson = stableJson(expected);
      if (actualJson === expectedJson) return;
      let index = 0;
      while (index < actualJson.length && index < expectedJson.length && actualJson[index] === expectedJson[index]) index++;
      throw new Error(`${label}发生变化：index=${index} expected=${expectedJson.slice(Math.max(0, index - 120), index + 240)} actual=${actualJson.slice(Math.max(0, index - 120), index + 240)}`);
    }

    function stable(value) {
      if (Array.isArray(value)) return value.map(stable);
      if (!value || typeof value !== "object") return value;
      return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
    }

    function stableJson(value) {
      return JSON.stringify(stable(value));
    }

    function pick(source, fields) {
      return Object.fromEntries(fields.map(field => [field, structuredClone(source?.[field])]));
    }

    function unwrap(publicResult, label) {
      if (!publicResult?.ok) throw new Error(`${label} 调用失败：${publicResult?.error?.code || "unknown"} ${publicResult?.error?.message || ""}`);
      return publicResult.data;
    }
  });

  const healthPerformanceSignals = consoleErrors.filter(message => /^\[FMG health\] (main-thread-long-task|operation-stall|render-frame-gap|input-handler-stall)\b/.test(message));
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
