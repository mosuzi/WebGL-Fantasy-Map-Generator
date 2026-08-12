#!/usr/bin/env node
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "source", "Fantasy-Map-Generator");
const port = 5565;
const server = spawn(process.execPath, [join(root, "tools", "serve-prototype.mjs"), "--host", "127.0.0.1", "--port", String(port), "--dir", join(root, "dist", "webgl-generator")], {stdio: "ignore"});
const playwright = createRequire(join(source, "package.json"))("playwright");
let browser;

try {
  await waitServer();
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const page = await browser.newPage({viewport: {width: 1280, height: 820}});
  const consoleErrors = [], pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 180_000);
  const report = await page.evaluate(async forbiddenSource => {
    const api = window.webglGeneratorApi, app = window.__webglGeneratorApp, coordinator = app.workerTaskCoordinator;
    const unwrap = (value, label) => { if (!value?.ok) throw new Error(`${label}: ${value?.error?.code || "api_error"} ${value?.error?.message || ""}`); return value.data; };
    unwrap(await api.generate.newMap({confirm: true, seed: "route-city-worker-browser", cellsTarget: 10_000, heightmapTemplate: "continents"}), "newMap");
    const routeSample = findRouteSample(app.map), citySample = findCitySample(app.map);
    if (!routeSample || !citySample) throw new Error("10k 路线 / 城市 Worker 夹具不足");

    const trace = {runs: [], commits: [], longTasks: [], probeLongTasks: [], messages: [], spans: []};
    const originalRun = coordinator.run, originalCommit = coordinator.commitSession;
    const refs = {map: app.map, routes: app.map.settlements.routes, cities: app.map.settlements.cities, burgs: app.map.pack.burgs};
    const digest = name => {
      const start = performance.now();
      try {
        const value = structuredClone({
          routes: app.map.settlements.routes,
          packRoutes: app.map.pack.routes,
          links: app.map.pack.cells.routes,
          cities: app.map.settlements.cities,
          burgs: app.map.pack.burgs,
          packBurg: app.map.pack.cells.burg,
          gridBurg: app.map.grid.cells.burg,
          states: app.map.pack.states,
          provinces: app.map.pack.provinces,
          markets: app.map.pack.markets,
          stale: app.map.metadata?.derivedStale
        });
        if (value.stale?.updatedAt) value.stale.updatedAt = "<timestamp>";
        return JSON.stringify(value);
      } finally { trace.spans.push({name, start, end: performance.now()}); }
    };
    let collectProductLongTasks = false;
    const settleFrames = delay => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, delay))));
    const appendLongTasks = (entries, target) => target.push(...entries.map(({startTime, duration}) => ({startTime, duration})));
    const drainLongTasks = target => appendLongTasks(observer.takeRecords(), target);
    const captureDigest = async name => {
      const value = digest(name);
      await settleFrames(0);
      drainLongTasks(trace.probeLongTasks);
      return value;
    };
    const runApi = async (name, task) => {
      const start = performance.now();
      collectProductLongTasks = true;
      try { return unwrap(await task(), name); }
      finally {
        await settleFrames(100);
        drainLongTasks(trace.longTasks);
        collectProductLongTasks = false;
        trace.spans.push({name: `api:${name}`, start, end: performance.now()});
      }
    };
    app.workerTaskCoordinator = {
      run: async (task, payload, options) => {
        const output = await Reflect.apply(originalRun, coordinator, [task, payload, options]);
        trace.runs.push({
          task,
          kind: payload?.request?.kind || payload?.historyTransition?.request?.kind,
          planOnly: payload?.planOnly === true,
          mode: output?.worker?.mode,
          sessionMode: options?.sessionMode,
          sessionPayloadOwnMap: Object.hasOwn(options?.sessionPayload || {}, "map"),
          layers: payload?.render?.layers || [],
          prepared: Object.keys(output?.preparedRender?.layers || {}),
          session: output?.worker?.session || null,
          telemetry: output?.worker?.telemetry || null
        });
        return output;
      },
      commitSession: async (id, binding, options) => {
        const result = await Reflect.apply(originalCommit, coordinator, [id, binding, options]);
        trace.commits.push({id, delta: options?.expectedRevisionDelta, result});
        return result;
      },
      invalidateSession: coordinator.invalidateSession.bind(coordinator),
      getSessionSnapshot: coordinator.getSessionSnapshot.bind(coordinator)
    };
    const observer = new PerformanceObserver(list => appendLongTasks(
      list.getEntries(),
      collectProductLongTasks ? trace.longTasks : trace.probeLongTasks
    ));
    observer.observe({entryTypes: ["longtask"]});
    const forbidden = new RegExp(forbiddenSource, "i");
    const nodes = ["operation-loading", "generation-loading", "map-toast", "shortcut-toast"].map(id => document.getElementById(id)).filter(Boolean);
    const sampleMessages = () => nodes.forEach(node => {
      const style = getComputedStyle(node), text = node.textContent?.trim();
      if (text && !node.hidden && style.display !== "none" && style.visibility !== "hidden") trace.messages.push(text);
    });
    const mutations = new MutationObserver(sampleMessages);
    mutations.observe(document.body, {subtree: true, childList: true, characterData: true, attributes: true});
    window.__webglGeneratorHealth?.clear?.();
    const separate = () => new Promise(done => setTimeout(done, 0));
    const historyBefore = app.editHistory.getStats(), beforeRoute = await captureDigest("route:before");
    try {
      await separate();
      const routeInspect = await runApi("route-inspect", () => api.edit.routes.inspectEdit(routeSample.routeId, routeSample.patch));
      if (!routeInspect.valid || !routeInspect.changed) throw new Error(`路线预检无效：${routeInspect.reason || routeInspect.summary || "unknown"}`);
      await runApi("route-update", () => api.edit.routes.update(routeSample.routeId, routeSample.patch));
      await separate(); const afterRoute = await captureDigest("route:after");
      await runApi("route-undo", () => api.history.undo()); await separate(); const undoRoute = await captureDigest("route:undo");
      await runApi("route-redo", () => api.history.redo()); await separate(); const redoRoute = await captureDigest("route:redo");

      const beforeCity = await captureDigest("city:before");
      const cityInspect = await runApi("city-inspect", () => api.edit.cities.inspectMove(citySample.cityId, citySample.target));
      if (!cityInspect.valid || !cityInspect.changed || cityInspect.phase !== "full") throw new Error(`城市预检无效：${cityInspect.summary || "unknown"}`);
      await runApi("city-move", () => api.edit.cities.move(citySample.cityId, citySample.target));
      await separate(); const afterCity = await captureDigest("city:after"), historyAfter = app.editHistory.getStats();
      await runApi("city-undo", () => api.history.undo()); await separate(); const undoCity = await captureDigest("city:undo");
      await runApi("city-redo", () => api.history.redo()); await separate(); const redoCity = await captureDigest("city:redo");
      sampleMessages();
      const health = unwrap(api.info.healthEvents({severity: "error", limit: 100}), "health"), stats = unwrap(api.info.runtimeStats(), "stats");
      return {
        routeId: routeSample.routeId, cityId: citySample.cityId,
        exact: {routeUndo: undoRoute === beforeRoute, routeRedo: redoRoute === afterRoute, cityUndo: undoCity === beforeCity, cityRedo: redoCity === afterCity},
        changed: beforeRoute !== afterRoute && beforeCity !== afterCity,
        historyDelta: historyAfter.undo - historyBefore.undo,
        refs: app.map === refs.map && app.map.settlements.routes === refs.routes && app.map.settlements.cities === refs.cities && app.map.pack.burgs === refs.burgs,
        trace, finalSession: coordinator.getSessionSnapshot(), loading: stats.loading, glError: app.renderer.getStats().draw?.glError ?? 0, health,
        forbidden: [...new Set(trace.messages)].filter(text => forbidden.test(text))
      };
    } finally {
      observer.disconnect(); mutations.disconnect(); app.workerTaskCoordinator = coordinator;
    }

    function findRouteSample(map) {
      for (const route of map.settlements.routes || []) {
        if (!route || route.type === "searoute" || route.packCells?.length < 4) continue;
        const path = new Set(route.packCells);
        for (const anchor of route.packCells.slice(1, -1)) {
          for (const neighbor of map.pack.cells.c?.[anchor] || []) {
            if (!path.has(neighbor) && Number(map.pack.cells.h?.[neighbor]) >= 20) return {routeId: route.id, patch: {viaPackCells: [neighbor]}};
          }
        }
      }
      return null;
    }

    function findCitySample(map) {
      const routed = new Set((map.settlements.routes || []).flatMap(route => [route?.from, route?.to]).filter(Number.isInteger));
      for (const city of map.settlements.cities || []) {
        if (!city || city.removed || city.capital || city.provincial || !routed.has(city.id)) continue;
        for (let packCell = 0; packCell < map.pack.cells.i.length; packCell++) {
          if (Number(map.pack.cells.h?.[packCell]) < 20 || Number(map.pack.cells.burg?.[packCell]) > 0) continue;
          if (Number(map.pack.cells.state?.[packCell]) !== Number(city.state)) continue;
          const gridCell = Number(map.pack.cells.g?.[packCell]);
          if (Number.isInteger(gridCell) && gridCell !== Number(city.cell)) return {cityId: Number(city.id), target: {gridCell, packCell}};
        }
      }
      return null;
    }
  }, String.raw`\bWorker\b|\bworker\b|线程|任务会话|消息包|结构化克隆|\bbuffer\b|LocalStorage|sessionStorage|IndexedDB|\bBlob\b|缓存后端`);

  const performanceSignals = consoleErrors.filter(text => /\[FMG health\] (operation-stall|main-thread-long-task|render-frame-gap|input-handler-stall)/.test(text));
  const applicationErrors = consoleErrors.filter(text => !performanceSignals.includes(text));
  assert.equal(report.changed, true, "路线 / 城市操作没有产生正式变化");
  assert.equal(report.refs, true, "主图、路线、城市或 burg 权威集合身份被替换");
  assert.deepEqual(report.exact, {routeUndo: true, routeRedo: true, cityUndo: true, cityRedo: true});
  assert.equal(report.historyDelta, 2); assert.equal(report.trace.runs.length, 8); assert.equal(report.trace.commits.length, 8);
  assert.deepEqual(report.trace.commits.map(item => item.delta), [0, 1, 1, 1, 0, 1, 1, 1]); assert.ok(report.trace.commits.every(item => item.result));
  assert.ok(report.trace.runs.slice(1).every(run => run.session?.reused));
  for (const [index, run] of report.trace.runs.entries()) {
    assert.equal(run.task, "route-path.compute"); assert.equal(run.mode, "worker"); assert.equal(run.sessionMode, "map-mirror"); assert.equal(run.sessionPayloadOwnMap, false);
    if (index === 0 || index === 4) { assert.equal(run.planOnly, true); assert.deepEqual(run.layers, []); assert.deepEqual(run.prepared, []); }
    else if (index < 4) { assert.deepEqual(run.layers, ["route", "picking"]); assert.deepEqual(run.prepared, ["route", "picking"]); }
    else { assert.deepEqual(run.layers, ["point", "labels", "route", "picking"]); assert.deepEqual(run.prepared, ["point", "labels", "route", "picking"]); }
    assert.ok(run.telemetry?.inputPackets > 0 && run.telemetry?.outputPackets > 0);
  }
  assert.equal(report.finalSession?.status, "idle");
  assert.ok(report.trace.longTasks.length <= 4 && report.trace.longTasks.every(item => item.duration <= 200), `C3c LongTask 超出登记预算：${JSON.stringify(report.trace.longTasks)}`);
  assert.equal(report.loading.visible, false); assert.equal(report.glError, 0);
  assert.deepEqual(report.health?.events, []); assert.deepEqual(report.forbidden, []); assert.deepEqual(applicationErrors, []); assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ok: true, routeId: report.routeId, cityId: report.cityId, operations: report.trace.runs.length, sessionId: report.finalSession.id, longTasks: report.trace.longTasks, probeLongTasks: report.trace.probeLongTasks, spans: report.trace.spans, performanceSignals}, null, 2));
} finally {
  await browser?.close(); server.kill();
  await Promise.race([new Promise(done => server.once("exit", done)), new Promise(done => setTimeout(done, 5000))]);
}

async function waitServer() {
  for (let index = 0; index < 100; index++) {
    if (server.exitCode !== null) throw new Error(`静态服务提前退出：${server.exitCode}`);
    try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) return; } catch {}
    await new Promise(done => setTimeout(done, 50));
  }
  throw new Error("等待静态服务超时");
}
