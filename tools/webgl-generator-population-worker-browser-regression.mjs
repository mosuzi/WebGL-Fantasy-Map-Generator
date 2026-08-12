#!/usr/bin/env node
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "source", "Fantasy-Map-Generator");
const port = 5564;
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
    unwrap(await api.generate.newMap({confirm: true, seed: "population-worker-browser", cellsTarget: 10_000, heightmapTemplate: "continents"}), "newMap");
    const stateIds = app.map.pack.states.filter(item => item?.i && !item.removed).map(item => Number(item.i));
    let sourceId = 0, targetId = 0;
    for (const source of stateIds) {
      if (!unwrap(api.edit.population.inspectAdjustment({scope: "state", id: source}, {delta: 25}), "inspect adjustment").valid) continue;
      for (const target of stateIds) {
        if (target === source) continue;
        if (unwrap(api.edit.population.inspectTransfer({scope: "state", id: source}, {scope: "state", id: target}, {amount: 10}), "inspect transfer").valid) {
          sourceId = source; targetId = target; break;
        }
      }
      if (targetId) break;
    }
    if (!sourceId || !targetId) throw new Error("10k 人口夹具缺少可调整与转移的国家对");

    const trace = {runs: [], commits: [], messages: [], longTasks: [], spans: []};
    const originalRun = coordinator.run, originalCommit = coordinator.commitSession;
    const refs = {map: app.map, packPop: app.map.pack.cells.pop, gridPop: app.map.grid.cells.pop, cities: app.map.settlements.cities, burgs: app.map.pack.burgs};
    const digest = name => {
      const start = performance.now();
      try {
        return JSON.stringify({
          pack: [...app.map.pack.cells.pop], grid: [...app.map.grid.cells.pop],
          cities: app.map.settlements.cities.map(city => city && [city.id, city.population]),
          burgs: app.map.pack.burgs.map(burg => burg && [burg.i, burg.population]),
          states: app.map.pack.states.map(item => item && [item.i, item.rural, item.urban, item.burgs]),
          provinces: app.map.pack.provinces.map(item => item && [item.i, item.rural, item.urban, item.burgs]),
          cultures: app.map.pack.cultures.map(item => item && [item.i, item.rural, item.urban]),
          religions: app.map.pack.religions.map(item => item && [item.i, item.rural, item.urban]),
          markets: app.map.pack.markets,
          stale: app.map.metadata?.derivedStale
        });
      } finally { trace.spans.push({name, start, end: performance.now()}); }
    };
    const runApi = async (name, task) => {
      const start = performance.now();
      try { return unwrap(await task(), name); }
      finally { trace.spans.push({name: `api:${name}`, start, end: performance.now()}); }
    };
    const before = digest("digest:before"), historyBefore = app.editHistory.getStats();
    app.workerTaskCoordinator = {
      run: async (task, payload, options) => {
        const output = await Reflect.apply(originalRun, coordinator, [task, payload, options]);
        trace.runs.push({task, mode: output?.worker?.mode, sessionMode: options?.sessionMode, sessionPayloadOwnMap: Object.hasOwn(options?.sessionPayload || {}, "map"), layers: payload?.render?.layers, prepared: Object.keys(output?.preparedRender?.layers || {}), session: output?.worker?.session || null, telemetry: output?.worker?.telemetry || null});
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
    const observer = new PerformanceObserver(list => trace.longTasks.push(...list.getEntries().map(({startTime, duration}) => ({startTime, duration}))));
    observer.observe({entryTypes: ["longtask"]});
    const forbidden = new RegExp(forbiddenSource, "i"), nodes = ["operation-loading", "generation-loading", "map-toast", "shortcut-toast"].map(id => document.getElementById(id)).filter(Boolean);
    const sample = () => nodes.forEach(node => { const style = getComputedStyle(node), text = node.textContent?.trim(); if (text && !node.hidden && style.display !== "none" && style.visibility !== "hidden") trace.messages.push(text); });
    const mutations = new MutationObserver(sample); mutations.observe(document.body, {subtree: true, childList: true, characterData: true, attributes: true});
    window.__webglGeneratorHealth?.clear?.();
    const separate = () => new Promise(done => setTimeout(done, 0));
    try {
      await separate(); trace.longTasks.length = 0; observer.takeRecords();
      const adjustment = await runApi("adjustment", () => api.edit.population.applyAdjustment({scope: "state", id: sourceId}, {delta: 25}));
      await separate(); const afterAdjustment = digest("digest:after-adjustment"); await separate();
      const transfer = await runApi("transfer", () => api.edit.population.transfer({scope: "state", id: sourceId}, {scope: "state", id: targetId}, {amount: 10, confirm: true}));
      await separate(); const afterTransfer = digest("digest:after-transfer"), historyAfter = app.editHistory.getStats(); await separate();
      await runApi("undo-transfer", () => api.history.undo()); await separate(); const undoTransfer = digest("digest:undo-transfer"); await separate();
      await runApi("undo-adjustment", () => api.history.undo()); await separate(); const undoAdjustment = digest("digest:undo-adjustment"); await separate();
      await runApi("redo-adjustment", () => api.history.redo()); await separate(); const redoAdjustment = digest("digest:redo-adjustment"); await separate();
      await runApi("redo-transfer", () => api.history.redo()); await separate(); const redoTransfer = digest("digest:redo-transfer");
      await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))); await new Promise(done => setTimeout(done, 100));
      trace.longTasks.push(...observer.takeRecords().map(({startTime, duration}) => ({startTime, duration}))); sample();
      const health = unwrap(api.info.healthEvents({severity: "error", limit: 100}), "health"), stats = unwrap(api.info.runtimeStats(), "stats");
      return {
        sourceId, targetId, adjustment: adjustment.executed, transfer: transfer.executed,
        historyDelta: historyAfter.undo - historyBefore.undo,
        exact: {undoTransfer: undoTransfer === afterAdjustment, undoAdjustment: undoAdjustment === before, redoAdjustment: redoAdjustment === afterAdjustment, redoTransfer: redoTransfer === afterTransfer},
        refs: app.map === refs.map && app.map.pack.cells.pop === refs.packPop && app.map.grid.cells.pop === refs.gridPop && app.map.settlements.cities === refs.cities && app.map.pack.burgs === refs.burgs,
        trace, finalSession: coordinator.getSessionSnapshot(), loading: stats.loading, glError: app.renderer.getStats().draw?.glError ?? 0, health,
        forbidden: [...new Set(trace.messages)].filter(text => forbidden.test(text))
      };
    } finally { observer.disconnect(); mutations.disconnect(); app.workerTaskCoordinator = coordinator; }
  }, String.raw`\bWorker\b|\bworker\b|线程|任务会话|消息包|结构化克隆|\bbuffer\b|LocalStorage|sessionStorage|IndexedDB|\bBlob\b|缓存后端`);

  const performanceSignals = consoleErrors.filter(text => /\[FMG health\] (operation-stall|main-thread-long-task|render-frame-gap|input-handler-stall)/.test(text));
  const applicationErrors = consoleErrors.filter(text => !performanceSignals.includes(text));
  assert.equal(report.adjustment && report.transfer && report.refs && Object.values(report.exact).every(Boolean), true);
  assert.equal(report.historyDelta, 2); assert.equal(report.trace.runs.length, 6); assert.equal(report.trace.commits.length, 6);
  for (const run of report.trace.runs) {
    assert.equal(run.task, "population.compute"); assert.equal(run.mode, "worker"); assert.equal(run.sessionMode, "map-mirror"); assert.equal(run.sessionPayloadOwnMap, false);
    assert.deepEqual(run.layers, ["surface", "point", "labels", "picking"]); assert.deepEqual(run.prepared, ["surface", "point", "labels", "picking"]);
    assert.ok(run.telemetry?.inputPackets > 0 && run.telemetry?.outputPackets > 0);
  }
  assert.ok(report.trace.runs.slice(1).every(run => run.session?.reused)); assert.deepEqual(report.trace.commits.map(item => item.delta), [1, 1, 1, 1, 1, 1]); assert.ok(report.trace.commits.every(item => item.result));
  assert.equal(report.finalSession?.status, "idle"); assert.deepEqual(report.trace.longTasks, []); assert.equal(report.loading.visible, false); assert.equal(report.glError, 0);
  assert.deepEqual(report.health?.events, []); assert.deepEqual(report.forbidden, []); assert.deepEqual(applicationErrors, []); assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ok: true, sourceId: report.sourceId, targetId: report.targetId, operations: report.trace.runs.length, sessionId: report.finalSession.id, longTasks: report.trace.longTasks, spans: report.trace.spans, performanceSignals}, null, 2));
} finally {
  await browser?.close(); server.kill();
  await Promise.race([new Promise(done => server.once("exit", done)), new Promise(done => setTimeout(done, 5000))]);
}

async function waitServer() {
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`静态服务提前退出：${server.exitCode}`);
    try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) return; } catch {}
    await new Promise(done => setTimeout(done, 50));
  }
  throw new Error("等待静态服务超时");
}
