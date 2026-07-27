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
const port = 5527;
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
    const result = {fullStateNoop: {}, fullProvinceNoop: {}, state: {}, scopedProvince: {}, conflict: {}};

    await newMap("lock-politics-all-state");
    const allStates = activeStates();
    unwrap(api.regenerationLocks.setMany(allStates.map(state => ({kind: "state", id: state.i})), true), "lock all states");
    app.editHistory.clear();
    const allBefore = transactionSnapshot("states");
    const noOp = unwrap(await api.generate.regenerate("states", {confirm: true}), "regenerate all locked states");
    const allAfter = transactionSnapshot("states");
    if (noOp.executed !== false) throw new Error("全部锁国没有返回 no-op");
    assertSameTransaction(allBefore, allAfter, "全部锁国 no-op");
    result.fullStateNoop = {states: allStates.length, history: allAfter.history.undo, salt: allAfter.salt, revision: allAfter.revision.mapRevision};

    await newMap("lock-politics-all-province");
    const allProvinces = activeProvinces();
    unwrap(api.regenerationLocks.setMany(allProvinces.map(province => ({kind: "province", id: province.i})), true), "lock all provinces");
    app.editHistory.clear();
    const allProvinceBefore = transactionSnapshot("provinces");
    const provinceNoOp = unwrap(await api.generate.regenerate("provinces", {confirm: true}), "regenerate all locked provinces");
    const allProvinceAfter = transactionSnapshot("provinces");
    if (provinceNoOp.executed !== false) throw new Error("全部锁省没有返回 no-op");
    assertSameTransaction(allProvinceBefore, allProvinceAfter, "全部锁省 no-op");
    result.fullProvinceNoop = {provinces: allProvinces.length, history: allProvinceAfter.history.undo, salt: allProvinceAfter.salt, revision: allProvinceAfter.revision.mapRevision};

    await newMap("lock-politics-state-province");
    const lockedState = activeStates().find(state => activeProvinces().filter(province => Number(province.state) === Number(state.i)).length >= 2);
    if (!lockedState) throw new Error("固定图缺少可锁定国家");
    const lockedProvince = activeProvinces().find(province => Number(province.state) === Number(lockedState.i) && province.burg);
    const lockedCity = activeCities().find(city => Number(city.province) === Number(lockedProvince.i));
    const lockedRoute = activeRoutes().find(route => route.packCells?.length >= 3);
    if (!lockedState || !lockedProvince || !lockedCity || !lockedRoute) throw new Error("固定图缺少国家/省份/城市/道路锁样本");
    unwrap(api.regenerationLocks.setMany([
      {kind: "state", id: lockedState.i},
      {kind: "province", id: lockedProvince.i},
      {kind: "city", id: lockedCity.id},
      {kind: "route", id: lockedRoute.id}
    ], true), "lock politics chain");
    app.editHistory.clear();
    const stateBefore = stateEnvelope(lockedState.i);
    const provinceBefore = provinceEnvelope(lockedProvince.i);
    const cityBefore = structuredClone(lockedCity);
    const routeBefore = structuredClone(lockedRoute);
    const unlockedBefore = JSON.stringify(activeStates().filter(state => state.i !== lockedState.i));
    const stateTxBefore = transactionSnapshot("states");
    const stateResult = unwrap(await api.generate.regenerate("states", {confirm: true}), "regenerate states");
    if (!stateResult.executed) throw new Error("国家正式入口未执行");
    assertDeepEqual(stateEnvelope(lockedState.i), stateBefore, "锁国完整镜像");
    assertDeepEqual(provinceEnvelope(lockedProvince.i), provinceBefore, "锁省完整镜像");
    assertDeepEqual(activeCities().find(city => city.id === lockedCity.id), cityBefore, "下游锁城");
    assertDeepEqual(activeRoutes().find(route => route.id === lockedRoute.id), routeBefore, "下游锁路");
    assertPoliticalStats("state", lockedState.i);
    assertPoliticalStats("province", lockedProvince.i);
    if (JSON.stringify(activeStates().filter(state => state.i !== lockedState.i)) === unlockedBefore) throw new Error("未锁国家没有变化");
    const stateTxAfter = transactionSnapshot("states");
    assertSingleTransaction(stateTxBefore, stateTxAfter, "国家重生成");
    result.state = {stateId: lockedState.i, provinceId: lockedProvince.i, cityId: lockedCity.id, routeId: lockedRoute.id};

    await newMap("lock-politics-scoped-province");
    const scopedState = activeStates().find(state => activeProvinces().filter(province => Number(province.state) === Number(state.i)).length >= 3);
    if (!scopedState) throw new Error("固定图缺少包含至少三个省份的国家");
    const scoped = activeProvinces().filter(province => Number(province.state) === Number(scopedState.i));
    const scopedLocked = scoped[0];
    unwrap(api.regenerationLocks.set({kind: "province", id: scopedLocked.i}, true), "lock scoped province");
    app.editHistory.clear();
    const scopedBefore = provinceEnvelope(scopedLocked.i);
    const outsideBefore = JSON.stringify(activeProvinces().filter(province => Number(province.state) !== Number(scopedState.i)));
    const unlockedScopedBefore = JSON.stringify(scoped.filter(province => province.i !== scopedLocked.i));
    const scopedTxBefore = transactionSnapshot("provinces");
    const scopedResult = unwrap(await api.generate.regenerate("provinces", {confirm: true, scope: "state", stateId: scopedState.i}), "regenerate scoped provinces");
    if (!scopedResult.executed) throw new Error("局部省份正式入口未执行");
    assertDeepEqual(provinceEnvelope(scopedLocked.i), scopedBefore, "局部锁省完整镜像");
    assertPoliticalStats("province", scopedLocked.i);
    if (JSON.stringify(activeProvinces().filter(province => Number(province.state) !== Number(scopedState.i))) !== outsideBefore) throw new Error("局部重生成改写范围外省份");
    if (JSON.stringify(activeProvinces().filter(province => Number(province.state) === Number(scopedState.i) && province.i !== scopedLocked.i)) === unlockedScopedBefore) throw new Error("局部未锁省份没有变化");
    const scopedTxAfter = transactionSnapshot("provinces");
    assertSingleTransaction(scopedTxBefore, scopedTxAfter, "局部省份重生成");
    result.scopedProvince = {stateId: scopedState.i, provinceId: scopedLocked.i, outside: JSON.parse(outsideBefore).length};

    await newMap("lock-politics-conflict");
    const conflictProvince = activeProvinces().find(province => province.burg);
    unwrap(api.regenerationLocks.set({kind: "province", id: conflictProvince.i}, true), "lock conflict province");
    const waterCell = app.map.pack.cells.i.find(cell => app.map.pack.cells.h[cell] < 20);
    app.map.politics.provinces[conflictProvince.i].center = waterCell;
    app.map.politics.provinces[conflictProvince.i].burg = 0;
    if (app.map.pack.provinces !== app.map.politics.provinces) {
      app.map.pack.provinces[conflictProvince.i].center = waterCell;
      app.map.pack.provinces[conflictProvince.i].burg = 0;
    }
    app.editHistory.clear();
    const conflictBefore = transactionSnapshot("provinces");
    const failed = await api.generate.regenerate("provinces", {confirm: true});
    if (failed?.ok !== false || failed?.error?.code !== "regeneration_lock_conflict") {
      throw new Error(`政治冲突没有稳定拒绝：${JSON.stringify(failed)}`);
    }
    const conflictAfter = transactionSnapshot("provinces");
    assertSameTransaction(conflictBefore, conflictAfter, "政治冲突回滚");
    result.conflict = {code: failed.error.code, salt: conflictAfter.salt, revision: conflictAfter.revision.mapRevision};

    return result;

    async function newMap(seed) {
      unwrap(await api.generate.newMap({confirm: true, seed, cellsTarget: 1000, heightmapTemplate: "continents"}), `newMap ${seed}`);
      app.editHistory.clear();
    }
    function activeStates() {
      return (app.map.politics?.states || []).filter(state => state?.i && !state.removed);
    }
    function activeProvinces() {
      return (app.map.politics?.provinces || []).filter(province => province?.i && !province.removed);
    }
    function activeCities() {
      return (app.map.settlements?.cities || []).filter(city => city && !city.removed);
    }
    function activeRoutes() {
      return (app.map.settlements?.routes || []).filter(Boolean);
    }
    function stateEnvelope(id) {
      const state = app.map.politics.states[id];
      return {
        state: structuredClone(state),
        packState: structuredClone(app.map.pack.states[id]),
        packCells: memberCells(app.map.pack.cells.state, id),
        gridCells: memberCells(app.map.grid.cells.state, id),
        capital: structuredClone(app.map.pack.burgs[state.capital]),
        supportingProvinces: (state.provinces || []).map(provinceId => provinceEnvelope(provinceId)),
        supportingCities: politicalCities("state", id)
      };
    }
    function provinceEnvelope(id) {
      const province = app.map.politics.provinces[id];
      return {
        province: structuredClone(province),
        packProvince: structuredClone(app.map.pack.provinces[id]),
        packCells: memberCells(app.map.pack.cells.province, id),
        gridCells: memberCells(app.map.grid.cells.province, id),
        centerBurg: structuredClone(province.burg ? app.map.pack.burgs[province.burg] : null),
        supportingCities: politicalCities("province", id)
      };
    }
    function politicalCities(kind, id) {
      return activeCities().filter(city => {
        const packCell = Number(city.packCell);
        const owner = kind === "state" ? app.map.pack.cells.state?.[packCell] : app.map.pack.cells.province?.[packCell];
        return Number(owner) === Number(id);
      }).map(city => ({
        city: structuredClone(city),
        burg: structuredClone(app.map.pack.burgs?.[city.burgId] || null),
        packCellBurg: Number(app.map.pack.cells.burg?.[city.packCell]) || 0,
        gridCellBurg: Number(app.map.grid.cells.burg?.[city.cell]) || 0
      }));
    }
    function assertPoliticalStats(kind, id) {
      const owners = kind === "state" ? app.map.pack.cells.state : app.map.pack.cells.province;
      const object = kind === "state" ? app.map.politics.states[id] : app.map.politics.provinces[id];
      let burgs = 0;
      let rural = 0;
      let urban = 0;
      const burgIds = [];
      for (const cell of app.map.pack.cells.i) {
        if (app.map.pack.cells.h[cell] < 20 || Number(owners?.[cell]) !== Number(id)) continue;
        rural += Number(app.map.pack.cells.pop?.[cell]) || 0;
        const burg = app.map.pack.burgs?.[app.map.pack.cells.burg?.[cell]];
        if (!burg?.i || burg.removed) continue;
        burgs++;
        urban += Number(burg.population) || 0;
        burgIds.push(Number(burg.i));
      }
      const cityBurgIds = politicalCities(kind, id).map(entry => Number(entry.city.burgId)).sort((a, b) => a - b);
      burgIds.sort((a, b) => a - b);
      assertDeepEqual(cityBurgIds, burgIds, `${kind} #${id} 城市与 burg 集合`);
      const expected = {burgs, rural: round2(rural), urban: round2(urban)};
      const actual = {burgs: Number(object.burgs) || 0, rural: Number(object.rural) || 0, urban: Number(object.urban) || 0};
      assertDeepEqual(actual, expected, `${kind} #${id} 统计`);
    }
    function round2(value) {
      return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
    }
    function memberCells(values, id) {
      const cells = [];
      for (let cell = 0; cell < (values?.length || 0); cell++) if (Number(values[cell]) === Number(id)) cells.push(cell);
      return cells;
    }
    function transactionSnapshot(kind) {
      return {
        map: JSON.stringify(app.map),
        history: app.editHistory.getStats(),
        salt: Number(app.map.metadata?.regeneration?.[kind]) || 0,
        revision: app.mapRevision.getSnapshot()
      };
    }
    function assertSingleTransaction(before, after, label) {
      if (after.history.undo !== before.history.undo + 1 || after.history.redo !== 0 || after.salt !== before.salt + 1 || after.revision.mapRevision !== before.revision.mapRevision + 1) {
        throw new Error(`${label} 未保持单历史/单 salt/单 revision`);
      }
    }
    function assertSameTransaction(before, after, label) {
      if (after.map !== before.map || JSON.stringify(after.history) !== JSON.stringify(before.history) || after.salt !== before.salt || JSON.stringify(after.revision) !== JSON.stringify(before.revision)) {
        throw new Error(`${label} 没有完整保持地图、历史、salt 和 revision`);
      }
    }
    function assertDeepEqual(actual, expected, label) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}发生变化`);
    }
    function unwrap(publicResult, label) {
      if (!publicResult?.ok) throw new Error(`${label} 调用失败：${publicResult?.error?.code || "unknown"} ${publicResult?.error?.message || ""} ${JSON.stringify(publicResult?.error?.details || {})}`);
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
