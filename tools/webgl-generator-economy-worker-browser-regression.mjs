#!/usr/bin/env node
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "source", "Fantasy-Map-Generator");
const port = 5563;
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
    const api = window.webglGeneratorApi;
    const app = window.__webglGeneratorApp;
    const coordinator = app.workerTaskCoordinator;
    const unwrap = (value, label) => {
      if (!value?.ok) throw new Error(`${label}: ${value?.error?.code || "api_error"} ${value?.error?.message || ""}`);
      return value.data;
    };
    unwrap(await api.generate.newMap({confirm: true, seed: "economy-worker-browser", cellsTarget: 10_000, heightmapTemplate: "continents"}), "newMap");
    const mapRef = app.map;
    const markets = app.map.pack.markets.filter(Boolean);
    const target = markets[0];
    const packCell = [...app.map.pack.cells.i].find(cell => app.map.pack.cells.h[cell] >= 20 && Number(app.map.pack.cells.market[cell] || 0) > 0 && Number(app.map.pack.cells.market[cell]) !== Number(target.i ?? target.id));
    if (!target || !Number.isInteger(packCell)) throw new Error("10k 经济夹具缺少可改派市场的陆地 cell");

    const trace = {runs: [], commits: [], messages: [], longTasks: [], spans: []};
    const originalRun = coordinator.run;
    const originalCommit = coordinator.commitSession;
    const spanAsync = async (name, task) => {
      const start = performance.now();
      try {
        return await task();
      } finally {
        trace.spans.push({name, start, end: performance.now()});
      }
    };
    const digest = name => {
      const start = performance.now();
      try {
        return JSON.stringify({
      market: [...app.map.pack.cells.market],
      goods: app.map.pack.goods,
      markets: app.map.pack.markets,
      deals: app.map.pack.deals,
      burgs: app.map.pack.burgs,
      economy: app.map.economy
        });
      } finally {
        trace.spans.push({name, start, end: performance.now()});
      }
    };
    const before = digest("digest:before");
    const historyBefore = app.editHistory.getStats();
    app.workerTaskCoordinator = {
      run: async (task, payload, options) => {
        const output = await Reflect.apply(originalRun, coordinator, [task, payload, options]);
        trace.runs.push({
          task,
          mode: output?.worker?.mode,
          sessionMode: options?.sessionMode,
          sessionPayloadOwnMap: Object.hasOwn(options?.sessionPayload || {}, "map"),
          layers: payload?.render?.layers,
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
    const observer = new PerformanceObserver(list => trace.longTasks.push(...list.getEntries().map(({startTime, duration}) => ({startTime, duration}))));
    observer.observe({entryTypes: ["longtask"]});
    const forbidden = new RegExp(forbiddenSource, "i");
    const nodes = ["operation-loading", "generation-loading", "map-toast", "shortcut-toast"].map(id => document.getElementById(id)).filter(Boolean);
    const sample = () => nodes.forEach(node => {
      const style = getComputedStyle(node), text = node.textContent?.trim();
      if (text && !node.hidden && style.display !== "none" && style.visibility !== "hidden") trace.messages.push(text);
    });
    const mutations = new MutationObserver(sample);
    mutations.observe(document.body, {subtree: true, childList: true, characterData: true, attributes: true});
    window.__webglGeneratorHealth?.clear?.();
    try {
      await new Promise(done => setTimeout(done, 0));
      trace.longTasks.length = 0;
      observer.takeRecords();
      const rebuild = unwrap(await spanAsync("api:rebuild", () => api.edit.economy.rebuild({confirm: true})), "rebuild");
      await new Promise(done => setTimeout(done, 0));
      const afterRebuild = digest("digest:after-rebuild");
      await new Promise(done => setTimeout(done, 0));
      const assignment = unwrap(await spanAsync("api:assign", () => api.edit.economy.assignCells(Number(target.i ?? target.id), [packCell], {confirm: true})), "assign");
      await new Promise(done => setTimeout(done, 0));
      const afterAssignment = digest("digest:after-assignment");
      const historyAfter = app.editHistory.getStats();
      await new Promise(done => setTimeout(done, 0));
      unwrap(await spanAsync("api:undo", () => api.history.undo()), "undo");
      await new Promise(done => setTimeout(done, 0));
      const undo = digest("digest:undo");
      await new Promise(done => setTimeout(done, 0));
      unwrap(await spanAsync("api:redo", () => api.history.redo()), "redo");
      await new Promise(done => setTimeout(done, 0));
      const redo = digest("digest:redo");
      await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
      await new Promise(done => setTimeout(done, 100));
      trace.longTasks.push(...observer.takeRecords().map(({startTime, duration}) => ({startTime, duration})));
      sample();
      const health = unwrap(api.info.healthEvents({severity: "error", limit: 100}), "health");
      const stats = unwrap(api.info.runtimeStats(), "stats");
      return {
        rebuild,
        assignment,
        changed: before !== afterAssignment,
        historyDelta: historyAfter.undo - historyBefore.undo,
        undoExact: undo === afterRebuild,
        redoExact: redo === afterAssignment,
        mapSame: app.map === mapRef,
        trace,
        finalSession: coordinator.getSessionSnapshot(),
        loading: stats.loading,
        glError: app.renderer.getStats().draw?.glError ?? 0,
        health,
        forbidden: [...new Set(trace.messages)].filter(text => forbidden.test(text))
      };
    } finally {
      observer.disconnect();
      mutations.disconnect();
      app.workerTaskCoordinator = coordinator;
    }
  }, String.raw`\bWorker\b|\bworker\b|线程|任务会话|消息包|结构化克隆|\bbuffer\b|LocalStorage|sessionStorage|IndexedDB|\bBlob\b|缓存后端`);

  const performanceSignals = consoleErrors.filter(text => /\[FMG health\] (operation-stall|main-thread-long-task|render-frame-gap|input-handler-stall)/.test(text));
  const applicationErrors = consoleErrors.filter(text => !performanceSignals.includes(text));
  assert.equal(report.changed && report.undoExact && report.redoExact && report.mapSame, true);
  assert.equal(report.assignment.executed, true);
  assert.equal(report.historyDelta, (report.rebuild.executed ? 1 : 0) + 1);
  assert.equal(report.trace.runs.length, 4);
  assert.equal(report.trace.commits.length, 4);
  for (const run of report.trace.runs) {
    assert.equal(run.task, "economy.compute");
    assert.equal(run.mode, "worker");
    assert.equal(run.sessionMode, "map-mirror");
    assert.equal(run.sessionPayloadOwnMap, false);
    assert.deepEqual(run.layers, ["point", "labels", "picking"]);
    assert.deepEqual(run.prepared, ["point", "labels", "picking"]);
    assert.ok(run.telemetry?.inputPackets > 0 && run.telemetry?.outputPackets > 0);
  }
  assert.ok(report.trace.runs.slice(1).every(run => run.session?.reused));
  assert.deepEqual(report.trace.commits.map(item => item.delta), [report.rebuild.executed ? 1 : 0, 1, 1, 1]);
  assert.ok(report.trace.commits.every(item => item.result));
  assert.equal(report.finalSession?.status, "idle");
  assert.deepEqual(report.trace.longTasks, []);
  assert.equal(report.loading.visible, false);
  assert.equal(report.glError, 0);
  assert.deepEqual(report.health?.events, []);
  assert.deepEqual(report.forbidden, []);
  assert.deepEqual(applicationErrors, []);
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ok: true, ...report, performanceSignals, applicationErrors, pageErrors}, null, 2));
} finally {
  await browser?.close();
  server.kill();
  await Promise.race([new Promise(done => server.once("exit", done)), new Promise(done => setTimeout(done, 5000))]);
}

async function waitServer() {
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`静态服务提前退出：${server.exitCode}`);
    try {
      if ((await fetch(`http://127.0.0.1:${port}`)).ok) return;
    } catch {}
    await new Promise(done => setTimeout(done, 50));
  }
  throw new Error("等待静态服务超时");
}
