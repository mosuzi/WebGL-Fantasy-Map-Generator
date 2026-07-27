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
const port = 5528;
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
    const result = {culture: {}, religion: {}, feature: {}, conflict: {}};

    await newMap("lock-society-formal");
    const cultures = activeSocial("culture");
    const religions = activeSocial("religion");
    const lockedCulture = cultures[0];
    const targetCulture = cultures.find(item => item.i !== lockedCulture.i);
    const lockedReligion = religions.find(item => item.type !== "Folk") || religions[0];
    const targetReligion = religions.find(item => item.i !== lockedReligion.i && item.type !== "Folk")
      || religions.find(item => item.i !== lockedReligion.i);
    if (!lockedCulture || !targetCulture || !lockedReligion || !targetReligion) throw new Error("固定图缺少文化或宗教样本");
    unwrap(api.regenerationLocks.setMany([
      {kind: "culture", id: lockedCulture.i},
      {kind: "religion", id: lockedReligion.i}
    ], true), "lock society");

    app.editHistory.clear();
    const lockedCultureBefore = socialEnvelope("culture", lockedCulture.i);
    const lockedReligionBefore = socialEnvelope("religion", lockedReligion.i);
    const cultureNoopBefore = transactionSnapshot("cultures");
    const cultureNoop = unwrap(api.edit.cultures.applyExpansion(lockedCulture.i, {
      mode: "reexpand",
      expansionism: 10,
      includeReligions: true,
      confirm: true
    }), "locked culture reexpand");
    const cultureNoopAfter = transactionSnapshot("cultures");
    if (cultureNoop.executed !== false) throw new Error("锁文化目标没有返回 no-op");
    assertSameTransaction(cultureNoopBefore, cultureNoopAfter, "锁文化重扩 no-op");

    const cultureOwnershipBefore = Array.from(app.map.pack.cells.culture);
    const religionOwnershipBefore = Array.from(app.map.pack.cells.religion);
    const cultureTxBefore = transactionSnapshot("cultures");
    unwrap(api.edit.cultures.applyExpansion(targetCulture.i, {
      mode: "reexpand",
      expansionism: 10,
      includeReligions: true,
      confirm: true
    }), "culture reexpand");
    assertDeepEqual(socialEnvelope("culture", lockedCulture.i), lockedCultureBefore, "锁文化");
    assertDeepEqual(socialEnvelope("religion", lockedReligion.i), lockedReligionBefore, "文化联动锁宗教");
    if (!ownershipChangedOutside(cultureOwnershipBefore, app.map.pack.cells.culture, lockedCultureBefore.packCells)) {
      throw new Error("文化重扩没有改变未锁归属");
    }
    if (!ownershipChangedOutside(religionOwnershipBefore, app.map.pack.cells.religion, lockedReligionBefore.packCells)) {
      throw new Error("文化联动没有改变未锁宗教归属");
    }
    assertSingleTransaction(cultureTxBefore, transactionSnapshot("cultures"), "文化重扩", {salt: false});

    const religionBeforeReexpand = Array.from(app.map.pack.cells.religion);
    const currentTargetReligion = app.map.society.religions[targetReligion.i];
    const nextExpansion = currentTargetReligion.expansion === "global" ? "culture" : "global";
    const nextExpansionism = Number(currentTargetReligion.expansionism) >= 5 ? 0.1 : 10;
    app.editHistory.clear();
    const religionTxBefore = transactionSnapshot("religions");
    unwrap(api.edit.religions.applyExpansion(targetReligion.i, {
      mode: "reexpand",
      expansion: nextExpansion,
      expansionism: nextExpansionism,
      confirm: true
    }), "religion reexpand");
    assertDeepEqual(socialEnvelope("religion", lockedReligion.i), lockedReligionBefore, "宗教重扩锁对象");
    if (!ownershipChangedOutside(religionBeforeReexpand, app.map.pack.cells.religion, lockedReligionBefore.packCells)) {
      throw new Error("宗教重扩没有改变未锁归属");
    }
    assertSingleTransaction(religionTxBefore, transactionSnapshot("religions"), "宗教重扩", {salt: false});
    result.culture = {locked: lockedCulture.i, target: targetCulture.i, noop: true};

    await newMap("lock-religion-full");
    const fullLockedCulture = activeSocial("culture")[0];
    const fullLockedReligion = activeSocial("religion").find(item => item.type !== "Folk") || activeSocial("religion")[0];
    if (!fullLockedCulture || !fullLockedReligion) throw new Error("宗教全量固定图缺少锁样本");
    unwrap(api.regenerationLocks.setMany([
      {kind: "culture", id: fullLockedCulture.i},
      {kind: "religion", id: fullLockedReligion.i}
    ], true), "lock full religion");
    app.editHistory.clear();
    const fullLockedCultureBefore = socialEnvelope("culture", fullLockedCulture.i);
    const fullLockedReligionBefore = socialEnvelope("religion", fullLockedReligion.i);
    const unlockedReligionBefore = JSON.stringify(activeSocial("religion").filter(item => item.i !== fullLockedReligion.i));
    const fullReligionTxBefore = transactionSnapshot("religions");
    const fullReligion = unwrap(await api.generate.regenerate("religions", {confirm: true}), "full religion");
    if (!fullReligion.executed) throw new Error("宗教全量正式入口未执行");
    assertDeepEqual(socialEnvelope("religion", fullLockedReligion.i), fullLockedReligionBefore, "宗教全量锁对象");
    assertDeepEqual(socialEnvelope("culture", fullLockedCulture.i), fullLockedCultureBefore, "宗教全量锁文化");
    if (JSON.stringify(activeSocial("religion").filter(item => item.i !== fullLockedReligion.i)) === unlockedReligionBefore) {
      throw new Error("宗教全量重生成没有改变未锁对象");
    }
    assertSingleTransaction(fullReligionTxBefore, transactionSnapshot("religions"), "宗教全量");

    unwrap(api.regenerationLocks.setMany(activeSocial("religion").map(item => ({kind: "religion", id: item.i})), true), "lock all religions");
    app.editHistory.clear();
    const allReligionBefore = transactionSnapshot("religions");
    const allReligionNoop = unwrap(await api.generate.regenerate("religions", {confirm: true}), "all religion noop");
    const allReligionAfter = transactionSnapshot("religions");
    if (allReligionNoop.executed !== false) throw new Error("全锁宗教没有返回 no-op");
    assertSameTransaction(allReligionBefore, allReligionAfter, "全锁宗教 no-op");
    result.religion = {locked: fullLockedReligion.i, reexpandTarget: targetReligion.i, allLocked: activeSocial("religion").length};

    await newMap("lock-feature-formal");
    const lake = activeFeatures().filter(feature => feature.type === "lake").sort((a, b) => featureReferenceCount(a.i) - featureReferenceCount(b.i))[0];
    const island = activeFeatures().filter(feature => feature.land && feature.type === "island").sort((a, b) => featureReferenceCount(a.i) - featureReferenceCount(b.i))[0];
    if (!lake || !island) throw new Error("固定图缺少湖泊或岛屿 Feature");
    unwrap(api.regenerationLocks.setMany([
      {kind: "feature", id: lake.i},
      {kind: "feature", id: island.i}
    ], true), "lock feature");
    app.editHistory.clear();
    const lakeBefore = featureEnvelope(lake.i);
    const islandBefore = featureEnvelope(island.i);
    const lockedGridIds = new Set([lakeBefore.gridId, islandBefore.gridId]);
    const victim = (app.map.features.features || []).find(feature => feature?.i && !feature.removed && !lockedGridIds.has(feature.i) && feature.cells?.length > 2);
    const wrong = (app.map.features.features || []).find(feature => feature?.i && !feature.removed && feature.i !== victim?.i && !lockedGridIds.has(feature.i));
    const victimCell = victim?.cells?.find(cell => cell !== victim.firstCell);
    if (!victim || !wrong || !Number.isInteger(victimCell)) throw new Error("固定图缺少未锁 Feature 扰动样本");
    app.map.grid.cells.f[victimCell] = wrong.i;
    const corrupted = Number(app.map.grid.cells.f[victimCell]);
    const featureTxBefore = transactionSnapshot("features");
    const featureResult = unwrap(await api.generate.regenerate("features", {confirm: true}), "feature regenerate");
    if (!featureResult.executed) throw new Error("Feature 正式入口未执行");
    assertDeepEqual(featureEnvelope(lake.i), lakeBefore, "锁湖 Feature");
    assertDeepEqual(featureEnvelope(island.i), islandBefore, "锁岛 Feature");
    if (Number(app.map.grid.cells.f[victimCell]) === corrupted) throw new Error("未锁 Feature assignment 没有被纠正");
    assertSingleTransaction(featureTxBefore, transactionSnapshot("features"), "Feature 重生成");

    unwrap(api.regenerationLocks.setMany(activeFeatures().map(feature => ({kind: "feature", id: feature.i})), true), "lock all features");
    app.editHistory.clear();
    const allFeatureBefore = transactionSnapshot("features");
    const allFeatureNoop = unwrap(await api.generate.regenerate("features", {confirm: true}), "all feature noop");
    const allFeatureAfter = transactionSnapshot("features");
    if (allFeatureNoop.executed !== false) throw new Error("全锁 Feature 没有返回 no-op");
    assertSameTransaction(allFeatureBefore, allFeatureAfter, "全锁 Feature no-op");
    result.feature = {lake: lake.i, island: island.i, allLocked: activeFeatures().length};

    await newMap("lock-feature-conflict");
    const conflictLake = activeFeatures().find(feature => feature.type === "lake");
    if (!conflictLake) throw new Error("冲突固定图缺少湖泊");
    unwrap(api.regenerationLocks.set({kind: "feature", id: conflictLake.i}, true), "lock conflict feature");
    const conflictGridId = featureEnvelope(conflictLake.i).gridId;
    const conflictGridCell = memberCells(app.map.grid.cells.f, conflictGridId)[0];
    app.map.grid.cells.h[conflictGridCell] = 20;
    for (const packCell of app.map.pack.cells.i) {
      if (Number(app.map.pack.cells.g[packCell]) === conflictGridCell) app.map.pack.cells.h[packCell] = 20;
    }
    app.editHistory.clear();
    const conflictBefore = transactionSnapshot("features");
    const failed = await api.generate.regenerate("features", {confirm: true});
    if (failed?.ok !== false || failed?.error?.code !== "regeneration_lock_conflict") {
      throw new Error(`Feature 冲突没有稳定拒绝：${JSON.stringify(failed)}`);
    }
    const conflictAfter = transactionSnapshot("features");
    assertSameTransaction(conflictBefore, conflictAfter, "Feature 冲突回滚");
    result.conflict = {code: failed.error.code, salt: conflictAfter.salt, revision: conflictAfter.revision.mapRevision};
    return result;

    async function newMap(seed) {
      unwrap(await api.generate.newMap({confirm: true, seed, cellsTarget: 5000, heightmapTemplate: "continents"}), `newMap ${seed}`);
      app.editHistory.clear();
    }
    function activeSocial(kind) {
      const plural = kind === "culture" ? "cultures" : "religions";
      return (app.map.society?.[plural] || []).filter(item => item?.i && !item.removed);
    }
    function activeFeatures() {
      return (app.map.pack?.features || []).filter(feature => feature?.i && !feature.removed);
    }
    function featureReferenceCount(id) {
      let count = 0;
      for (const objects of [
        app.map.pack?.burgs,
        app.map.settlements?.cities,
        app.map.pack?.routes,
        app.map.settlements?.routes,
        app.map.markers?.markers,
        app.map.pack?.portDiagnostics?.features
      ]) {
        for (const object of objects || []) {
          if (Number(object?.feature) === Number(id) || Number(object?.port) === Number(id) || Number(object?.data?.feature) === Number(id)) count++;
        }
      }
      return count;
    }
    function socialEnvelope(kind, id) {
      const plural = kind === "culture" ? "cultures" : "religions";
      const field = kind;
      const object = app.map.society[plural][id];
      return {
        object: structuredClone(object),
        packObject: structuredClone(app.map.pack[plural][id]),
        packCells: memberCells(app.map.pack.cells[field], id),
        gridCells: memberCells(app.map.grid.cells[field], id),
        center: Number(object.center),
        gridCenter: Number(object.gridCenter)
      };
    }
    function featureEnvelope(id) {
      const packCells = memberCells(app.map.pack.cells.f, id);
      const gridIds = [...new Set(packCells.map(cell => Number(app.map.grid.cells.f[app.map.pack.cells.g[cell]])).filter(value => value > 0))];
      if (gridIds.length !== 1) throw new Error(`Feature #${id} 缺少唯一 grid 镜像`);
      const gridId = gridIds[0];
      const gridCells = memberCells(app.map.grid.cells.f, gridId);
      return {
        packFeature: structuredClone(app.map.pack.features[id]),
        gridFeature: structuredClone(app.map.features.features[gridId]),
        gridId,
        packCells,
        gridCells,
        packAssignments: assignments(app.map.pack.cells, packCells, ["f", "h", "type", "haven", "harbor"]),
        gridAssignments: assignments(app.map.grid.cells, gridCells, ["f", "h"])
      };
    }
    function assignments(cells, members, fields) {
      return Object.fromEntries(fields.map(field => [field, members.map(cell => cells[field]?.[cell])]));
    }
    function memberCells(values, id) {
      const cells = [];
      for (let cell = 0; cell < (values?.length || 0); cell++) if (Number(values[cell]) === Number(id)) cells.push(cell);
      return cells;
    }
    function ownershipChangedOutside(before, after, lockedCells) {
      const locked = new Set(lockedCells);
      const length = Math.max(before?.length || 0, after?.length || 0);
      for (let cell = 0; cell < length; cell++) {
        if (!locked.has(cell) && Number(before?.[cell] || 0) !== Number(after?.[cell] || 0)) return true;
      }
      return false;
    }
    function transactionSnapshot(kind) {
      return {
        map: JSON.stringify(app.map),
        history: app.editHistory.getStats(),
        salt: Number(app.map.metadata?.regeneration?.[kind]) || 0,
        revision: app.mapRevision.getSnapshot()
      };
    }
    function assertSingleTransaction(before, after, label, {salt = true} = {}) {
      const saltValid = !salt || after.salt === before.salt + 1;
      if (after.history.undo !== before.history.undo + 1 || after.history.redo !== 0 || !saltValid || after.revision.mapRevision !== before.revision.mapRevision + 1) {
        throw new Error(`${label} 未保持单历史/单 revision${salt ? "/单 salt" : ""}`);
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
    response.writeHead(200, {"Content-Type": contentType(target), "Cache-Control": "no-store"});
    createReadStream(target).pipe(response);
  });
  await new Promise((resolveReady, reject) => {
    serverInstance.once("error", reject);
    serverInstance.listen(port, host, resolveReady);
  });
  return serverInstance;
}

function contentType(file) {
  const extension = extname(file).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".png") return "image/png";
  if (extension === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}
