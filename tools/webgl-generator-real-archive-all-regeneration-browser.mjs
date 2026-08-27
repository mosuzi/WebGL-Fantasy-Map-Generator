#!/usr/bin/env node
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {createReadStream, existsSync, mkdirSync, statSync, writeFileSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, isAbsolute, join, normalize, relative, resolve, sep} from "node:path";
import {fileURLToPath} from "node:url";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePackageDir = join(rootDir, "source", "Fantasy-Map-Generator");
const distDir = join(rootDir, "dist", "webgl-generator");
const archivePath = process.env.FMG_REAL_ARCHIVE || "C:\\Users\\mosuzi\\Downloads\\krichars (3).webfmg";
const artifactDir = resolve(process.env.FMG_TASK365_BROWSER_ARTIFACT_DIR || "Z:\\tmp\\codex\\2026-08-28\\task-365-regeneration-browser");
const expectedSha256 = "CF7402BC2BEA22AD1FCDE441444479F880DC0DB15D55520EF5A1A399D335DA61";
const host = "127.0.0.1";
const port = 5565;
const timeoutMs = 600_000;

assert(existsSync(distDir), `production 构建不存在：${distDir}`);
assert(existsSync(archivePath), `指定存档不存在：${archivePath}`);
assert.equal(await sha256File(archivePath), expectedSha256, "指定存档 SHA-256 漂移");
mkdirSync(artifactDir, {recursive: true});

const allEntries = [
  ...["features", "routes", "rivers", "cities", "states", "provinces", "markers", "diplomacy", "religions", "military", "zones"].map(kind => ({id: `formal:${kind}`, group: "formal", kind})),
  {id: "composite:height-base", group: "composite", kind: "height-base"},
  {id: "composite:height-downstream", group: "composite", kind: "height-downstream"},
  {id: "composite:height-all", group: "composite", kind: "height-all"},
  {id: "composite:climate-downstream", group: "composite", kind: "climate-downstream"},
  {id: "composite:ocean-current-world", group: "composite", kind: "ocean-current-world"},
  {id: "composite:seafloor-reset", group: "composite", kind: "seafloor-reset"},
  {id: "direct:ocean-current", group: "direct", kind: "ocean-current"},
  {id: "direct:culture-expansion", group: "direct", kind: "culture-expansion"},
  {id: "direct:religion-expansion", group: "direct", kind: "religion-expansion"},
  {id: "direct:market-assignment", group: "direct", kind: "market-assignment"},
  {id: "direct:economy-rebuild", group: "direct", kind: "economy-rebuild"}
];
const onlyEntry = process.argv.find(value => value.startsWith("--only="))?.slice("--only=".length) || "";
const fromEntry = process.argv.find(value => value.startsWith("--from="))?.slice("--from=".length) || "";
const fromIndex = fromEntry ? allEntries.findIndex(entry => entry.id === fromEntry) : 0;
assert(!fromEntry || fromIndex >= 0, `找不到起始入口：${fromEntry}`);
const entries = onlyEntry ? allEntries.filter(entry => entry.id === onlyEntry) : allEntries.slice(fromIndex);
assert(entries.length, `找不到指定入口：${onlyEntry || fromEntry}`);

const playwright = createRequire(join(sourcePackageDir, "package.json"))("playwright");
const server = await startStaticServer();
let browser;
const report = {ok: false, archive: {path: archivePath, sha256: expectedSha256, bytes: statSync(archivePath).size}, entries: [], consoleErrors: [], pageErrors: [], artifacts: {route: join(artifactDir, "route-regenerated.png"), final: join(artifactDir, "final-regeneration.png"), report: join(artifactDir, "full-report.json")}};

try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const context = await browser.newContext({viewport: {width: 1600, height: 1000}, deviceScaleFactor: 1});
  await context.addInitScript(() => {
    localStorage.clear();
    indexedDB.deleteDatabase("webgl-generator-map-storage-v1");
  });
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`http://${host}:${port}?healthClear=1&dev=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, timeoutMs);

  for (const [index, entry] of entries.entries()) {
    process.stdout.write(`[task-365-browser] ${index + 1}/${entries.length} ${entry.id}\n`);
    await importArchive(page);
    consoleErrors.length = 0;
    pageErrors.length = 0;
    const result = await page.evaluate(async currentEntry => {
      const api = window.webglGeneratorApi;
      const app = window.__webglGeneratorApp;
      app.editHistory.clear();
      await settle();
      window.__webglGeneratorHealth?.clear?.();
      await settle();
      window.__webglGeneratorHealth?.clear?.();
      const before = snapshot();
      const lockBefore = lockedCityBeforeImage();
      await settle();
      window.__webglGeneratorHealth?.clear?.();
      const startedAt = performance.now();
      const response = await run(currentEntry);
      await settle();
      const after = snapshot();
      await settle();
      const operationHealth = healthErrors();
      assertNoHealth(operationHealth, `${currentEntry.id}:operation`);
      assertResult(response, currentEntry.id);
      if (currentEntry.kind === "military" && after.counts.regiments <= 0) throw new Error(`${currentEntry.id} 没有生成军团`);
      assertRuntime(currentEntry.id);
      assertLock(lockBefore, `${currentEntry.id}:after`);
      const afterHistory = unwrap(api.history.stats(), `${currentEntry.id}:history-after`);
      if (afterHistory.undo !== 1 || afterHistory.redo !== 0) throw new Error(`${currentEntry.id} 没有形成单条历史：${JSON.stringify(afterHistory)}`);

      window.__webglGeneratorHealth?.clear?.();
      unwrap(await api.history.undo(), `${currentEntry.id}:undo`);
      await settle();
      const undone = snapshot();
      await settle();
      const undoHealth = healthErrors();
      assertNoHealth(undoHealth, `${currentEntry.id}:undo`);
      assertLock(lockBefore, `${currentEntry.id}:undo`);
      if (undone.fingerprint !== before.fingerprint) throw new Error(`${currentEntry.id} 撤销没有恢复操作前地图指纹`);
      const undoHistory = unwrap(api.history.stats(), `${currentEntry.id}:history-undo`);
      if (undoHistory.undo !== 0 || undoHistory.redo !== 1) throw new Error(`${currentEntry.id} 撤销历史栈无效`);

      window.__webglGeneratorHealth?.clear?.();
      unwrap(await api.history.redo(), `${currentEntry.id}:redo`);
      await settle();
      const redone = snapshot();
      await settle();
      const redoHealth = healthErrors();
      assertNoHealth(redoHealth, `${currentEntry.id}:redo`);
      assertLock(lockBefore, `${currentEntry.id}:redo`);
      if (redone.fingerprint !== after.fingerprint) throw new Error(`${currentEntry.id} 重做没有恢复操作后地图指纹`);
      const redoHistory = unwrap(api.history.stats(), `${currentEntry.id}:history-redo`);
      if (redoHistory.undo !== 1 || redoHistory.redo !== 0) throw new Error(`${currentEntry.id} 重做历史栈无效`);
      assertRuntime(`${currentEntry.id}:redo`);
      return {id: currentEntry.id, ms: Math.round((performance.now() - startedAt) * 10) / 10, response, before: before.counts, after: after.counts, changed: before.fingerprint !== after.fingerprint, history: redoHistory, healthErrors: {operation: operationHealth, undo: undoHealth, redo: redoHealth}, runtime: runtimeState(), west: ["routes", "cities", "states", "provinces", "height-base", "height-downstream", "height-all", "climate-downstream", "ocean-current-world", "seafloor-reset"].includes(currentEntry.kind) ? westCoverage() : null};

      async function run(item) {
        if (item.group === "formal") return unwrap(await api.generate.regenerate(item.kind, {confirm: true}), item.id);
        if (item.kind === "height-base") return unwrap(await api.edit.height.rebuildBaseDerived({confirm: true}), item.id);
        if (item.kind === "height-downstream") return unwrap(await api.edit.height.rebuildDownstreamDerived({confirm: true}), item.id);
        if (item.kind === "height-all") return unwrap(await api.edit.height.rebuildAllDerived({confirm: true}), item.id);
        if (item.kind === "climate-downstream") return unwrap(await api.climate.applyDownstreamRebuild({
          confirm: true,
          systems: ["cities", "states", "provinces", "religions", "markers", "economy", "diplomacy", "military", "zones"],
          seed: "task-365-browser-climate"
        }), item.id);
        if (item.kind === "ocean-current-world") return unwrap(await api.oceanCurrents.rebuildWorld({confirm: true, seed: "task-365-browser-world"}), item.id);
        if (item.kind === "seafloor-reset") {
          const inspection = unwrap(api.edit.height.inspectSeafloorReset({seed: "task-365-browser-seafloor"}), `${item.id}:inspect`);
          if (!inspection.valid) throw new Error(`${item.id} 预检没有可执行海底变化`);
          return unwrap(await api.edit.height.applySeafloorReset({confirm: true, seed: inspection.seed, inspectionToken: inspection.inspectionToken, worldSeed: "task-365-browser-seafloor-world"}), item.id);
        }
        if (item.kind === "ocean-current") return unwrap(await api.oceanCurrents.regenerate({seed: "task-365-browser-current"}), item.id);
        if (item.kind === "culture-expansion") {
          const culture = app.map.society.cultures.find(value => value?.i && !value.removed);
          if (!culture) throw new Error("指定存档缺少文化扩张目标");
          return unwrap(await api.edit.cultures.applyExpansion(culture.i, {mode: "reexpand", expansionism: Number(culture.expansionism) >= 9 ? 0.2 : 9, includeReligions: true, confirm: true}), item.id);
        }
        if (item.kind === "religion-expansion") {
          const religion = app.map.society.religions.find(value => value?.i && !value.removed && value.type !== "Folk") || app.map.society.religions.find(value => value?.i && !value.removed);
          if (!religion) throw new Error("指定存档缺少宗教扩张目标");
          return unwrap(await api.edit.religions.applyExpansion(religion.i, {mode: "reexpand", expansion: religion.expansion === "global" ? "culture" : "global", expansionism: Number(religion.expansionism) >= 8 ? 0.2 : 8, confirm: true}), item.id);
        }
        if (item.kind === "market-assignment") {
          const market = app.map.pack.markets.find(value => value?.i && !value.removed);
          const packCell = app.map.pack.cells.i.find(cell => Number(app.map.pack.cells.h[cell]) >= 20 && Number(app.map.pack.cells.market[cell]) !== Number(market?.i));
          if (!market || !Number.isSafeInteger(packCell)) throw new Error("指定存档缺少可变更市场归属样本");
          return unwrap(await api.edit.economy.assignCells(market.i, [packCell], {confirm: true, label: "task-365 指定存档市场归属"}), item.id);
        }
        if (item.kind === "economy-rebuild") return unwrap(await api.edit.economy.rebuild({confirm: true, label: "task-365 指定存档经济重算"}), item.id);
        throw new Error(`未知入口 ${item.id}`);
      }

      function snapshot() {
        const map = app.map;
        const active = rows => (rows || []).filter(item => item && !item.removed);
        const counts = {grid: map.grid.cells.i.length, pack: map.pack.cells.i.length, features: active(map.pack.features).length, cities: active(map.settlements.cities).length, states: active(map.politics.states).filter(value => Number(value.i) > 0).length, provinces: active(map.politics.provinces).filter(value => Number(value.i) > 0).length, routes: active(map.settlements.routes).length, rivers: active(map.rivers.rivers).length, markers: active(map.markers.markers).length, religions: active(map.society.religions).filter(value => Number(value.i) > 0).length, regiments: active(map.pack.states).flatMap(value => active(value.military)).length, zones: active(map.zones.zones).length, markets: active(map.pack.markets).filter(value => Number(value.i) > 0).length, deals: active(map.pack.deals).length, currents: active(map.oceanCurrents.currents).length};
        for (const [kind, count] of Object.entries(counts)) if (kind !== "regiments" && count <= 0) throw new Error(`地图结果 ${kind} 意外为空`);
        assertBasicPhysical(map);
        const fields = [map.grid.cells.h, map.pack.cells.h, map.pack.cells.state, map.pack.cells.province, map.pack.cells.burg, map.pack.cells.r, map.pack.cells.fl, map.pack.cells.culture, map.pack.cells.religion, map.pack.cells.market, map.pack.cells.biome];
        let hash = 2166136261;
        const add = value => { hash ^= Number(value) >>> 0; hash = Math.imul(hash, 16777619) >>> 0; };
        for (const field of fields) if (field) for (let index = 0; index < field.length; index++) add(Number(field[index]) || 0);
        const objectDigest = JSON.stringify({regeneration: map.metadata?.regeneration || {}, counts, features: active(map.pack.features).map(value => [value.i, value.cells, value.type]), cities: active(map.settlements.cities).map(value => [value.id, value.packCell, value.state, value.province]), routes: active(map.settlements.routes).map(value => [value.id, value.type, value.from, value.to, value.packCells?.length]), rivers: active(map.rivers.rivers).map(value => [value.id, value.parent, value.cells?.length]), states: active(map.politics.states).map(value => [value.i, value.center, value.cells]), provinces: active(map.politics.provinces).map(value => [value.i, value.state, value.center, value.cells]), religions: active(map.society.religions).map(value => [value.i, value.center, value.cells]), currents: active(map.oceanCurrents.currents).map(value => [value.id, value.path?.segments?.length || value.points?.length || 0])});
        for (let index = 0; index < objectDigest.length; index++) add(objectDigest.charCodeAt(index));
        return {counts, fingerprint: `${hash.toString(16)}:${objectDigest.length}`};
      }

      function assertBasicPhysical(map) {
        const cells = map.pack.cells;
        const lockedCityIds = new Set((map.regenerationLocks?.entries || []).filter(value => value?.kind === "city").map(value => Number(value.id)));
        for (const city of map.settlements.cities || []) {
          if (!city || city.removed || lockedCityIds.has(Number(city.id))) continue;
          if (!(Number(cells.h[city.packCell]) >= 20) || !Number.isFinite(Number(city.x)) || !Number.isFinite(Number(city.y))) throw new Error(`城镇 ${city.id} 违反基础物理门`);
        }
        for (const route of map.settlements.routes || []) {
          if (!route || route.removed) continue;
          const routeCells = route.packCells || [];
          if (routeCells.length < 2 || routeCells.some(cell => !Number.isSafeInteger(Number(cell)) || Number(cell) < 0 || Number(cell) >= cells.i.length)) throw new Error(`路线 ${route.id} cell 无效`);
          for (let index = 1; index < routeCells.length; index++) if (routeCells[index] !== routeCells[index - 1] && !cells.c[routeCells[index - 1]]?.includes(routeCells[index])) throw new Error(`路线 ${route.id} 非邻接`);
          if (route.type !== "searoute" && routeCells.some(cell => Number(cells.h[cell]) < 20)) throw new Error(`陆路 ${route.id} 穿越水域`);
        }
        for (const river of map.rivers.rivers || []) {
          if (!river || river.removed) continue;
          const real = (river.cells || []).filter(cell => Number(cell) >= 0).map(Number);
          if (!real.length || real.some(cell => !Number.isSafeInteger(cell) || cell >= cells.i.length)) throw new Error(`河流 ${river.id} cell 无效`);
          for (let index = 1; index < real.length; index++) if (!cells.c[real[index - 1]]?.includes(real[index])) throw new Error(`河流 ${river.id} 非邻接`);
          if (Number(cells.h[real[0]]) < 20 && map.pack.features?.[Number(cells.f[real[0]])]?.type !== "lake") throw new Error(`河流 ${river.id} 从海洋起流`);
        }
      }

      function lockedCityBeforeImage() {
        const reference = (app.map.regenerationLocks?.entries || []).find(value => value?.kind === "city");
        if (!reference) throw new Error("指定存档丢失冻结的 city 锁");
        const city = app.map.settlements.cities.find(value => Number(value?.id) === Number(reference.id));
        if (!city) throw new Error(`指定存档找不到锁定 city #${reference.id}`);
        return {id: Number(reference.id), snapshot: JSON.stringify(city)};
      }

      function assertLock(beforeImage, label) {
        const city = app.map.settlements.cities.find(value => Number(value?.id) === beforeImage.id);
        if (!city || JSON.stringify(city) !== beforeImage.snapshot) throw new Error(`${label} 改写了锁定 city #${beforeImage.id} before-image`);
      }

      function westCoverage() {
        const map = app.map;
        const cities = (map.settlements?.cities || []).filter(city => city && !city.removed);
        const routes = (map.settlements?.routes || []).filter(route => route && !route.removed && route.type !== "searoute");
        const westCityIds = new Set(cities.filter(city => Number(map.pack.cells.f?.[city.packCell]) === 3).map(city => Number(city.id)));
        const capitalCities = cities.filter(city => westCityIds.has(Number(city.id)) && city.capital);
        const westCapitals = capitalCities.length;
        const roadCells = new Set();
        const westRoadCells = new Set();
        let westRoads = 0;
        let landRoadWaterCells = 0;
        for (const route of routes) {
          const routeCells = route.packCells || [];
          const west = routeCells.some(cell => Number(map.pack.cells.f?.[cell]) === 3) || westCityIds.has(Number(route.from)) || westCityIds.has(Number(route.to));
          if (west) westRoads++;
          for (const cell of routeCells) {
            roadCells.add(Number(cell));
            if (west && Number(map.pack.cells.f?.[cell]) === 3) westRoadCells.add(Number(cell));
            if (Number(map.pack.cells.h?.[cell]) < 20) landRoadWaterCells++;
          }
        }
        const touched = new Set(cities.filter(city => westCityIds.has(Number(city.id)) && roadCells.has(Number(city.packCell))).map(city => Number(city.id)));
        const missingCapitals = capitalCities.filter(city => !touched.has(Number(city.id))).map(city => ({id: Number(city.id), burgId: Number(city.burgId), packCell: Number(city.packCell), state: Number(city.state), biome: Number(map.pack.cells.biome?.[city.packCell]), height: Number(map.pack.cells.h?.[city.packCell])}));
        const result = {westCities: westCityIds.size, westCapitals, westRoads, westRoadCells: westRoadCells.size, westTouchedCities: touched.size, westTouchedCapitals: westCapitals - missingCapitals.length, missingCapitals, landRoadWaterCells};
        if (result.westRoads <= 0 || result.westRoadCells <= 0 || result.westTouchedCities < 180 || result.westTouchedCapitals !== result.westCapitals || result.landRoadWaterCells !== 0) throw new Error(`西陆道路覆盖不合格：${JSON.stringify(result)}`);
        return result;
      }

      function assertResult(value, label) {
        if (value?.executed === false) throw new Error(`${label} 返回 no-op`);
      }

      function assertRuntime(label) {
        const runtime = runtimeState();
        if (!runtime.generationHidden || !runtime.operationHidden || runtime.glError !== 0 || runtime.loading !== 0) throw new Error(`${label} 终态不干净：${JSON.stringify(runtime)}`);
      }

      function assertNoHealth(errors, label) {
        if (errors.length) throw new Error(`${label} 新增健康错误：${JSON.stringify({errors, historyPerformance: app.lastHistoryPerformance || null, refreshScheduler: app.editRefreshScheduler?.getSnapshot?.() || null})}`);
      }

      function runtimeState() {
        const generation = document.getElementById("generation-loading");
        const operation = document.getElementById("operation-loading");
        const stats = unwrap(api.info.runtimeStats(), "runtime stats");
        return {generationHidden: !generation || generation.hidden || getComputedStyle(generation).display === "none", operationHidden: !operation || operation.hidden || getComputedStyle(operation).display === "none", loading: stats.loading?.visible ? 1 : 0, glError: Number(app.renderer?.getStats?.()?.draw?.glError || 0)};
      }

      function healthErrors() {
        const response = api.info.healthEvents({severity: "error", limit: 100});
        return response?.ok && Array.isArray(response.data?.events) ? response.data.events : [];
      }

      async function settle() {
        await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
        await new Promise(done => setTimeout(done, 150));
      }

      function unwrap(value, label) {
        if (!value?.ok) throw new Error(`${label} 失败 [${value?.error?.code || "unknown"}]：${value?.error?.message || "unknown"}`);
        return value.data;
      }
    }, entry);
    result.consoleErrors = [...consoleErrors];
    result.pageErrors = [...pageErrors];
    if (consoleErrors.length || pageErrors.length) throw new Error(`${entry.id} 浏览器错误：${JSON.stringify({consoleErrors, pageErrors})}`);
    report.entries.push(result);
    if (entry.id === "formal:routes") await page.screenshot({path: report.artifacts.route, fullPage: true});
  }
  await page.screenshot({path: report.artifacts.final, fullPage: true});
  report.ok = report.entries.length === entries.length;
  report.consoleErrors = [...new Set(report.entries.flatMap(entry => entry.consoleErrors))];
  report.pageErrors = [...new Set(report.entries.flatMap(entry => entry.pageErrors))];
  writeFileSync(report.artifacts.report, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: report.ok,
    archive: report.archive,
    entries: report.entries.map(entry => ({id: entry.id, ms: entry.ms, changed: entry.changed, before: entry.before, after: entry.after, history: entry.history, runtime: entry.runtime, west: entry.west})),
    consoleErrors: report.consoleErrors,
    pageErrors: report.pageErrors,
    artifacts: report.artifacts
  }, null, 2));
} finally {
  await browser?.close();
  await new Promise(resolveClose => server.close(resolveClose));
}

async function importArchive(page) {
  await page.evaluate(() => { window.__task365PreviousMap = window.__webglGeneratorApp?.map; });
  await page.locator("#import-map-file").setInputFiles(archivePath);
  await page.waitForFunction(() => {
    const app = window.__webglGeneratorApp;
    const loading = document.getElementById("generation-loading");
    const status = document.getElementById("file-operation-status")?.textContent?.trim() || "";
    return app?.map && app.map !== window.__task365PreviousMap && app.map.grid?.cells?.i?.length === 100000 && app.map.pack?.cells?.i?.length === 43419 && status.startsWith("已导入地图数据：") && (!loading || loading.hidden || getComputedStyle(loading).display === "none") && Number(app.renderer?.getStats?.()?.draw?.glError || 0) === 0;
  }, null, {timeout: timeoutMs});
  await waitForApiReady(page, timeoutMs);
}

async function startStaticServer() {
  const instance = createServer((request, response) => {
    if (!request.url || !["GET", "HEAD"].includes(request.method || "")) return send(response, 405, "Method not allowed");
    const pathname = decodeURIComponent(new URL(request.url, `http://${host}:${port}`).pathname);
    const target = pathname === "/" ? join(distDir, "index.html") : resolve(distDir, "." + normalize(pathname));
    if (!isWithin(distDir, target) || !existsSync(target) || statSync(target).isDirectory()) return send(response, 404, "Not found");
    response.writeHead(200, {"content-type": contentType(target), "cache-control": "no-store, max-age=0"});
    if (request.method === "HEAD") return response.end();
    createReadStream(target).pipe(response);
  });
  await new Promise((done, fail) => { instance.once("error", fail); instance.listen(port, host, done); });
  return instance;
}

function isWithin(base, target) {
  const pathFromBase = relative(resolve(base), resolve(target));
  return pathFromBase === "" || (!pathFromBase.startsWith(`..${sep}`) && pathFromBase !== ".." && !isAbsolute(pathFromBase));
}

function send(response, status, message) {
  response.writeHead(status, {"content-type": "text/plain; charset=utf-8", "cache-control": "no-store, max-age=0"});
  response.end(message);
}

function contentType(file) {
  return ({".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2"})[extname(file).toLowerCase()] || "application/octet-stream";
}

async function sha256File(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex").toUpperCase();
}
