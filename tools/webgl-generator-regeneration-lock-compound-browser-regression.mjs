#!/usr/bin/env node
import assert from "node:assert/strict";
import {createReadStream, existsSync, statSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";
import {closeTask350BrowserResource, createTask350BrowserArtifact} from "./task-350-browser-artifact.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const distDir = join(rootDir, "dist", "webgl-generator");
const host = "127.0.0.1";
const port = 5531;
const timeoutMs = 240000;
const evidence = createTask350BrowserArtifact("regeneration-lock-compound-browser");
let server;
let browser;
let context;
let thrown = null;

try {
  assert.ok(existsSync(distDir), `构建产物不存在：${distDir}`);
  const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
  server = await startStaticServer();
  evidence.mark("browser-launch", {complete: "server-ready"});
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
  evidence.mark("browser-evaluation", {active: "compound-locks", complete: "page-ready"});

  const report = await page.evaluate(async () => {
    const api = window.webglGeneratorApi;
    const app = window.__webglGeneratorApp;
    const result = {world: {}, climate: {}, seafloor: {}, noop: {}, rollback: {}};
    const longTasks = [];
    const timeline = [];
    let longTaskObserver = null;
    markTimeline("evaluation:start");

    await newMap("lock-compound-world");
    markTimeline("world:new-map-ready");
    const worldLocks = representativeReferences();
    unwrap(api.regenerationLocks.setMany(worldLocks, true), "lock representative world closure");
    app.editHistory.clear();
    const worldBefore = snapshotReferences(worldLocks);
    const unlockedWorldBefore = unlockedVariation(worldLocks);
    markTimeline("world:before-transaction-snapshot");
    const worldTxBefore = transactionSnapshot();
    markTimeline("world:after-transaction-snapshot");
    markTimeline("world:before-rebuild");
    const world = unwrap(await api.oceanCurrents.rebuildWorld({
      confirm: true,
      seed: "lock-compound-world:next"
    }), "ocean world");
    markTimeline("world:after-rebuild");
    if (!world.executed) throw new Error("洋流世界代表锁场景未执行");
    assertDeepEqual(snapshotReferences(worldLocks), worldBefore, "洋流世界代表锁");
    if (unlockedVariation(worldLocks) === unlockedWorldBefore) throw new Error("洋流世界未锁对象没有变化");
    markTimeline("world:before-post-snapshot");
    const worldTxAfter = transactionSnapshot();
    markTimeline("world:after-post-snapshot");
    assertSingleTransaction(worldTxBefore, worldTxAfter, "洋流世界");
    result.world = {locks: worldLocks.length, steps: world.steps?.length || 0};

    unwrap(api.regenerationLocks.setMany(worldLocks, false), "unlock world representatives");
    await newMap("lock-compound-climate");
    markTimeline("climate:new-map-ready");
    const climateLocks = representativeReferences().filter(reference => [
      "religion",
      "marker",
      "economy-market",
      "trade-flow",
      "diplomacy-relation",
      "military",
      "zone"
    ].includes(reference.kind));
    unwrap(api.regenerationLocks.setMany(climateLocks, true), "lock climate closure");
    app.editHistory.clear();
    const climateBefore = snapshotReferences(climateLocks);
    markTimeline("climate:before-transaction-snapshot");
    const climateTxBefore = transactionSnapshot();
    markTimeline("climate:after-transaction-snapshot");
    markTimeline("climate:before-rebuild");
    const climate = unwrap(await api.climate.applyDownstreamRebuild({
      confirm: true,
      systems: ["religions", "markers"],
      seed: 205
    }), "climate downstream");
    markTimeline("climate:after-rebuild");
    if (!climate.executed) throw new Error("气候下游代表锁场景未执行");
    assertDeepEqual(snapshotReferences(climateLocks), climateBefore, "气候下游代表锁");
    markTimeline("climate:before-post-snapshot");
    const climateTxAfter = transactionSnapshot();
    markTimeline("climate:after-post-snapshot");
    assertSingleTransaction(climateTxBefore, climateTxAfter, "气候下游");
    result.climate = {locks: climateLocks.length, steps: climate.steps?.length || 0};

    unwrap(api.regenerationLocks.setMany(climateLocks, false), "unlock climate representatives");
    const seafloorLocks = representativeReferences().filter(reference => [
      "state",
      "province",
      "city",
      "route",
      "river",
      "culture",
      "religion",
      "marker",
      "ocean-current",
      "economy-market",
      "trade-flow",
      "diplomacy-relation",
      "military",
      "zone"
    ].includes(reference.kind));
    unwrap(api.regenerationLocks.setMany(seafloorLocks, true), "lock seafloor closure");
    app.editHistory.clear();
    const seafloorBefore = snapshotReferences(seafloorLocks);
    markTimeline("seafloor:before-transaction-snapshot");
    const seafloorTxBefore = transactionSnapshot();
    markTimeline("seafloor:after-transaction-snapshot");
    const inspection = unwrap(api.edit.height.inspectSeafloorReset({seed: "lock-compound-seafloor"}), "inspect seafloor");
    if (!inspection.valid) throw new Error("固定图没有可用海底重设");
    markTimeline("seafloor:before-rebuild");
    const seafloor = unwrap(await api.edit.height.applySeafloorReset({
      confirm: true,
      inspectionToken: inspection.inspectionToken,
      seed: inspection.seed,
      worldSeed: "lock-compound-seafloor:world"
    }), "apply seafloor");
    markTimeline("seafloor:after-rebuild");
    if (!seafloor.executed) throw new Error("海底复合代表锁场景未执行");
    assertDeepEqual(snapshotReferences(seafloorLocks), seafloorBefore, "海底复合代表锁");
    markTimeline("seafloor:before-post-snapshot");
    const seafloorTxAfter = transactionSnapshot();
    markTimeline("seafloor:after-post-snapshot");
    assertSingleTransaction(seafloorTxBefore, seafloorTxAfter, "海底复合链");
    result.seafloor = {locks: seafloorLocks.length, steps: seafloor.steps?.length || 0};

    unwrap(api.regenerationLocks.setMany(seafloorLocks, false), "unlock seafloor representatives");
    app.editHistory.clear();
    markTimeline("rollback:before-transaction-snapshot");
    const faultBefore = transactionSnapshot();
    markTimeline("rollback:after-transaction-snapshot");
    const coordinator = app.workerTaskCoordinator;
    let faultInjectionCalls = 0;
    const faultCoordinator = Object.freeze({
      ...coordinator,
      run(task, payload, runOptions) {
        if (task !== "ocean-current-world.compute") return coordinator.run(task, payload, runOptions);
        faultInjectionCalls += 1;
        const faultPayload = {...payload, faultAt: "after:rivers"};
        const faultRunOptions = {...runOptions, sessionPayload: {...runOptions.sessionPayload, faultAt: "after:rivers"}};
        return coordinator.run(task, faultPayload, faultRunOptions);
      }
    });
    let fault = null;
    markTimeline("rollback:before-rebuild");
    try {
      app.workerTaskCoordinator = faultCoordinator;
      try {
        await app.runtimeActions.oceanCurrents.rebuildWorld({
          confirm: true,
          seed: "lock-compound-fault"
        });
      } catch (error) {
        fault = error;
      }
    } finally {
      app.workerTaskCoordinator = coordinator;
    }
    markTimeline("rollback:after-rebuild");
    if (faultInjectionCalls !== 1) throw new Error(`洋流世界故障注入调用次数异常：${faultInjectionCalls}`);
    if (!fault || !String(fault.message).includes("故障注入")) throw new Error("洋流世界故障注入未稳定外抛");
    markTimeline("rollback:before-post-snapshot");
    const faultAfter = transactionSnapshot();
    markTimeline("rollback:after-post-snapshot");
    assertSameTransaction(faultBefore, faultAfter, "洋流世界故障回滚");
    result.rollback = {fault: fault.message, faultInjectionCalls};

    await newMap("lock-compound-noop");
    markTimeline("noop:new-map-ready");
    const allLocks = allReferences();
    markTimeline("noop:references-ready");
    if (!allLocks.length) throw new Error("完整 closure 固定图没有锁对象");
    unwrap(api.regenerationLocks.setMany(allLocks, true), "lock full world closure");
    markTimeline("noop:locks-ready");
    app.editHistory.clear();
    markTimeline("noop:before-transaction-snapshot");
    const noopBefore = transactionSnapshot();
    markTimeline("noop:after-transaction-snapshot");
    markTimeline("noop:before-rebuild");
    const noop = unwrap(await api.oceanCurrents.rebuildWorld({
      confirm: true,
      seed: "lock-compound-noop:next"
    }), "full closure noop");
    markTimeline("noop:after-rebuild");
    if (noop.executed !== false || noop.reason !== "domain-fully-locked") {
      throw new Error(`完整 closure 未返回稳定 no-op：${JSON.stringify(noop)}`);
    }
    markTimeline("noop:before-post-snapshot");
    const noopAfter = transactionSnapshot();
    markTimeline("noop:after-post-snapshot");
    assertSameTransaction(noopBefore, noopAfter, "完整 closure no-op");
    result.noop = {locks: allLocks.length, reason: noop.reason};
    await pauseLongTaskObservation();
    markTimeline("evaluation:observation-complete");
    result.longTasks = longTasks;
    result.timeline = timeline;
    result.final = {
      session: app.workerTaskCoordinator.getSessionSnapshot(),
      glError: app.renderer?.getStats?.().draw?.glError ?? 0,
      loadingVisible: Boolean(document.getElementById("generation-loading") && !document.getElementById("generation-loading").hidden)
        || Boolean(document.getElementById("operation-loading") && !document.getElementById("operation-loading").hidden)
    };
    return result;

    async function newMap(seed, cellsTarget = 2000) {
      await pauseLongTaskObservation();
      unwrap(await api.generate.newMap({
        confirm: true,
        seed,
        cellsTarget,
        heightmapTemplate: "continents"
      }), `new map ${seed}`);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      resumeLongTaskObservation();
    }

    function resumeLongTaskObservation() {
      if (longTaskObserver || typeof PerformanceObserver !== "function") return;
      longTaskObserver = new PerformanceObserver(list => appendLongTasks(list.getEntries()));
      longTaskObserver.observe({entryTypes: ["longtask"]});
    }

    async function pauseLongTaskObservation() {
      if (!longTaskObserver) return;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      appendLongTasks(longTaskObserver.takeRecords());
      longTaskObserver.disconnect();
      longTaskObserver = null;
    }

    function appendLongTasks(entries) {
      longTasks.push(...entries.map(entry => ({startTime: entry.startTime, duration: entry.duration, name: entry.name})));
    }

    function markTimeline(label) {
      timeline.push({label, at: performance.now()});
    }

    function representativeReferences() {
      const all = allReferences();
      return [...new Set(all.map(reference => reference.kind))]
        .map(kind => all.find(reference => reference.kind === kind))
        .filter(Boolean);
    }

    function allReferences() {
      const states = active(app.map.pack?.states, true);
      const references = [
        ...refs("state", app.map.politics?.states, true),
        ...refs("province", app.map.politics?.provinces, true),
        ...refs("city", app.map.settlements?.cities),
        ...refs("route", app.map.settlements?.routes),
        ...refs("river", app.map.rivers?.rivers),
        ...refs("marker", app.map.markers?.markers),
        ...refs("religion", app.map.society?.religions, true),
        ...refs("culture", app.map.society?.cultures, true),
        ...refs("zone", app.map.zones?.zones),
        ...refs("feature", app.map.pack?.features),
        ...refs("ocean-current", app.map.oceanCurrents?.currents),
        ...refs("economy-market", app.map.pack?.markets, true),
        ...refs("trade-flow", app.map.pack?.deals)
      ];
      for (let left = 0; left < states.length; left++) {
        for (let right = left + 1; right < states.length; right++) {
          references.push({kind: "diplomacy-relation", id: pairKey(states[left].i, states[right].i)});
        }
      }
      for (const state of states) {
        for (const regiment of state.military || []) {
          references.push({kind: "military", id: `${state.i}:${regiment.i}`});
        }
      }
      return references;
    }

    function refs(kind, rows, positive = false) {
      return active(rows, positive).map(object => ({kind, id: object.id ?? object.i}));
    }

    function active(rows, positive = false) {
      return (rows || []).filter(object => object && !object.removed && (!positive || Number(object.i ?? object.id) > 0));
    }

    function snapshotReferences(references) {
      return Object.fromEntries(references.map(reference => [
        `${reference.kind}:${reference.id}`,
        snapshotReference(reference)
      ]));
    }

    function snapshotReference(reference) {
      const {kind, id} = reference;
      if (kind === "diplomacy-relation") {
        const [left, right] = String(id).split(":").map(Number);
        return {
          left: app.map.pack.states[left]?.diplomacy?.[right],
          right: app.map.pack.states[right]?.diplomacy?.[left],
          politicsLeft: app.map.politics.states[left]?.diplomacy?.[right],
          politicsRight: app.map.politics.states[right]?.diplomacy?.[left]
        };
      }
      if (kind === "military") {
        const [stateId, regimentId] = String(id).split(":").map(Number);
        return {
          pack: clone((app.map.pack.states[stateId]?.military || []).find(item => Number(item.i) === regimentId)),
          politics: clone((app.map.politics.states[stateId]?.military || []).find(item => Number(item.i) === regimentId))
        };
      }
      if (kind === "economy-market") {
        return {
          pack: clone(find(app.map.pack.markets, id)),
          economy: clone(find(app.map.economy.markets, id)),
          cells: memberCells(app.map.pack.cells.market, id)
        };
      }
      if (kind === "trade-flow") {
        return {
          pack: clone(find(app.map.pack.deals, id)),
          economy: clone(find(app.map.economy.deals, id))
        };
      }
      if (kind === "state") return {politics: clone(find(app.map.politics.states, id)), pack: clone(find(app.map.pack.states, id))};
      if (kind === "province") return {politics: clone(find(app.map.politics.provinces, id)), pack: clone(find(app.map.pack.provinces, id))};
      if (kind === "culture") return {society: clone(find(app.map.society.cultures, id)), pack: clone(find(app.map.pack.cultures, id))};
      if (kind === "religion") return {society: clone(find(app.map.society.religions, id)), pack: clone(find(app.map.pack.religions, id))};
      if (kind === "marker") return {marker: clone(find(app.map.markers.markers, id)), pack: clone(find(app.map.pack.markers, id))};
      if (kind === "zone") return {zone: clone(find(app.map.zones.zones, id)), pack: clone(find(app.map.pack.zones, id))};
      const rows = {
        city: app.map.settlements?.cities,
        route: app.map.settlements?.routes,
        river: app.map.rivers?.rivers,
        feature: app.map.pack?.features,
        "ocean-current": app.map.oceanCurrents?.currents
      }[kind];
      return clone(find(rows, id));
    }

    function unlockedVariation(locked) {
      const lockedKeys = new Set(locked.map(reference => `${reference.kind}:${reference.id}`));
      return JSON.stringify({
        currents: active(app.map.oceanCurrents?.currents).filter(item => !lockedKeys.has(`ocean-current:${item.id}`)),
        rivers: active(app.map.rivers?.rivers).filter(item => !lockedKeys.has(`river:${item.id ?? item.i}`)),
        cities: active(app.map.settlements?.cities).filter(item => !lockedKeys.has(`city:${item.id ?? item.i}`)),
        markers: active(app.map.markers?.markers).filter(item => !lockedKeys.has(`marker:${item.id ?? item.i}`))
      });
    }

    function find(rows, id) {
      return (rows || []).find(object => String(object?.id ?? object?.i) === String(id));
    }

    function memberCells(values, id) {
      const cells = [];
      for (let cell = 0; cell < (values?.length || 0); cell++) {
        if (String(values[cell]) === String(id)) cells.push(cell);
      }
      return cells;
    }

    function pairKey(left, right) {
      return Number(left) < Number(right) ? `${left}:${right}` : `${right}:${left}`;
    }

    function transactionSnapshot() {
      return {
        map: JSON.stringify(app.map),
        history: app.editHistory.getStats(),
        salts: JSON.stringify(app.map.metadata?.regeneration || {}),
        revision: app.mapRevision.getSnapshot()
      };
    }

    function assertSingleTransaction(before, after, label) {
      if (after.history.undo !== before.history.undo + 1 || after.history.redo !== 0 || after.revision.mapRevision !== before.revision.mapRevision + 1) {
        throw new Error(`${label} 未保持单历史与单 revision`);
      }
    }

    function assertSameTransaction(before, after, label) {
      if (before.map !== after.map
        || JSON.stringify(before.history) !== JSON.stringify(after.history)
        || before.salts !== after.salts
        || JSON.stringify(before.revision) !== JSON.stringify(after.revision)) {
        throw new Error(`${label} 没有完整保持地图、历史、salt 和 revision`);
      }
    }

    function assertDeepEqual(actual, expected, label) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}发生变化`);
    }

    function clone(value) {
      return value === undefined ? null : structuredClone(value);
    }

    function unwrap(publicResult, label) {
      if (!publicResult?.ok) {
        throw new Error(`${label} 调用失败：${publicResult?.error?.code || "unknown"} ${publicResult?.error?.message || ""} ${JSON.stringify(publicResult?.error?.details || {})}`);
      }
      return publicResult.data;
    }
  });

  const healthPerformanceSignals = consoleErrors.filter(message =>
    /^\[FMG health\] (main-thread-long-task|render-frame-gap|operation-stall|input-handler-stall)\b/.test(message)
  );
  const expectedFaultSignals = consoleErrors.filter(message => /^\[FMG health\] operation-failed\b/.test(message));
  assert.equal(expectedFaultSignals.length, 1, "故障注入应且仅应产生一条 operation-failed 健康信号");
  const applicationConsoleErrors = consoleErrors.filter(message =>
    !healthPerformanceSignals.includes(message) && !expectedFaultSignals.includes(message)
  );
  const overBudgetLongTasks = report.longTasks.filter(task => task.duration > 200);
  const fullResult = {
    ok: false,
    ...report,
    healthPerformanceSignals,
    expectedFaultSignals,
    applicationConsoleErrors,
    pageErrors
  };
  const compactResult = {
    world: report.world,
    climate: report.climate,
    seafloor: report.seafloor,
    rollback: report.rollback,
    noop: report.noop,
    timeline: report.timeline,
    sessionId: report.final.session?.id || "",
    sessionStatus: report.final.session?.status || "",
    expectedFaultSignals: expectedFaultSignals.length,
    longTaskCount: report.longTasks.length,
    maxLongTaskMs: Math.max(0, ...report.longTasks.map(task => task.duration)),
    overBudgetLongTasks,
    performanceSignals: healthPerformanceSignals.length,
    applicationErrors: applicationConsoleErrors.length,
    pageErrors: pageErrors.length,
    glError: report.final.glError,
    loadingVisible: report.final.loadingVisible
  };
  evidence.setResult(fullResult, compactResult);
  assert.deepEqual(applicationConsoleErrors, []);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(overBudgetLongTasks, [], "复合锁门出现 >200ms LongTask");
  assert.ok(
    report.final.session === null || (report.final.session?.status === "idle" && report.final.session?.pending !== true),
    "复合锁门结束后 Worker session 未释放或 idle"
  );
  assert.equal(report.final.glError, 0, "复合锁门出现 WebGL error");
  assert.equal(report.final.loadingVisible, false, "复合锁门结束后 Loading 未清理");
  fullResult.ok = true;
  evidence.mark("assertions", {complete: "browser-evaluation"});
  evidence.succeed();
} catch (error) {
  thrown = error;
  evidence.fail(error);
} finally {
  for (const [label, close] of [
    ["context", context && (() => context.close())],
    ["browser", browser && (() => browser.close())],
    ["server", server && (() => new Promise((resolveClose, rejectClose) => server.close(error => error ? rejectClose(error) : resolveClose())))]
  ]) {
    if (!close) continue;
    try {
      await closeTask350BrowserResource(label, close);
    } catch (error) {
      thrown ||= error;
      evidence.failTeardown(error);
    }
  }
  const persisted = evidence.persist();
  console.log(JSON.stringify(persisted.summary, null, 2));
}
if (thrown) throw thrown;

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
