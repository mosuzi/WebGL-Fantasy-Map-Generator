#!/usr/bin/env node
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "source", "Fantasy-Map-Generator");
const port = 5566;
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
    unwrap(await api.generate.newMap({confirm: true, seed: "military-policy-worker-browser", cellsTarget: 10_000, heightmapTemplate: "continents"}), "newMap");
    const state = app.map.pack.states.find(item => item?.i && !item.removed && item.military?.length);
    if (!state) throw new Error("10k 军事策略夹具缺少有效国家");
    const ratios = structuredClone(state.militaryPolicy?.unitRatios || {}), key = Object.keys(ratios)[0] || "infantry";
    ratios[key] = Number(ratios[key] || 0) + 0.75;
    const inspection = unwrap(api.edit.military.inspectRatios(state.i, ratios), "inspect ratios");
    if (!inspection.allowed) throw new Error(`军事策略预检无效：${inspection.summary || inspection.code}`);

    const trace = {runs: [], commits: [], longTasks: [], messages: [], spans: []};
    const originalRun = coordinator.run, originalCommit = coordinator.commitSession;
    const refs = {map: app.map, packStates: app.map.pack.states, politicsStates: app.map.politics.states, states: app.map.pack.states.filter(Boolean), routes: app.map.settlements.routes};
    const digest = name => {
      const start = performance.now();
      try {
        const value = structuredClone({military: app.map.military, packMilitary: app.map.pack.military, packStates: app.map.pack.states.map(item => item && ({i: item.i, alert: item.alert, military: item.military, militaryPolicy: item.militaryPolicy, militaryDiagnostics: item.militaryDiagnostics})), politicsStates: app.map.politics.states.map(item => item && ({i: item.i, alert: item.alert, military: item.military, militaryPolicy: item.militaryPolicy, militaryDiagnostics: item.militaryDiagnostics}))});
        const walk = (item, seen = new WeakSet()) => { if (!item || typeof item !== "object" || seen.has(item)) return; seen.add(item); if (item.metadata?.buildMs !== undefined) item.metadata.buildMs = "<duration>"; Object.values(item).forEach(child => walk(child, seen)); };
        walk(value); return JSON.stringify(value);
      } finally { trace.spans.push({name, start, end: performance.now()}); }
    };
    const runApi = async (name, task) => {
      const entries = [], observer = new PerformanceObserver(list => entries.push(...list.getEntries().map(({startTime, duration}) => ({startTime, duration}))));
      observer.observe({entryTypes: ["longtask"]}); observer.takeRecords();
      const start = performance.now();
      try { return unwrap(await task(), name); }
      finally {
        await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 100))));
        entries.push(...observer.takeRecords().map(({startTime, duration}) => ({startTime, duration}))); observer.disconnect();
        trace.longTasks.push(...entries); trace.spans.push({name: `api:${name}`, start, end: performance.now()});
      }
    };
    app.workerTaskCoordinator = {
      run: async (task, payload, options) => {
        const output = await Reflect.apply(originalRun, coordinator, [task, payload, options]);
        trace.runs.push({task, mode: output?.worker?.mode, sessionMode: options?.sessionMode, sessionPayloadOwnMap: Object.hasOwn(options?.sessionPayload || {}, "map"), layers: payload?.render?.layers || [], prepared: Object.keys(output?.preparedRender?.layers || {}), session: output?.worker?.session || null, telemetry: output?.worker?.telemetry || null});
        return output;
      },
      commitSession: async (id, binding, options) => { const result = await Reflect.apply(originalCommit, coordinator, [id, binding, options]); trace.commits.push({id, delta: options?.expectedRevisionDelta, result}); return result; },
      invalidateSession: coordinator.invalidateSession.bind(coordinator), getSessionSnapshot: coordinator.getSessionSnapshot.bind(coordinator)
    };
    const forbidden = new RegExp(forbiddenSource, "i"), nodes = ["operation-loading", "generation-loading", "map-toast", "shortcut-toast"].map(id => document.getElementById(id)).filter(Boolean);
    const sample = () => nodes.forEach(node => { const style = getComputedStyle(node), text = node.textContent?.trim(); if (text && !node.hidden && style.display !== "none" && style.visibility !== "hidden") trace.messages.push(text); });
    const mutations = new MutationObserver(sample); mutations.observe(document.body, {subtree: true, childList: true, characterData: true, attributes: true});
    window.__webglGeneratorHealth?.clear?.();
    const before = digest("before"), historyBefore = app.editHistory.getStats();
    try {
      const applied = await runApi("apply", () => api.edit.military.setRatios(state.i, ratios));
      const after = digest("after"), historyAfter = app.editHistory.getStats();
      await runApi("undo", () => api.history.undo()); const undone = digest("undo");
      await runApi("redo", () => api.history.redo()); const redone = digest("redo"); sample();
      const health = unwrap(api.info.healthEvents({severity: "error", limit: 100}), "health"), stats = unwrap(api.info.runtimeStats(), "stats");
      return {
        stateId: state.i, executed: applied.executed, historyDelta: historyAfter.undo - historyBefore.undo,
        exact: {undo: undone === before, redo: redone === after},
        refs: app.map === refs.map && app.map.pack.states === refs.packStates && app.map.politics.states === refs.politicsStates && app.map.settlements.routes === refs.routes && refs.states.every((item, index) => app.map.pack.states.filter(Boolean)[index] === item),
        aliases: app.map.military === app.map.pack.military && app.map.pack.states.filter(Boolean).every(item => app.map.politics.states[item.i]?.military === item.military && app.map.politics.states[item.i]?.militaryPolicy === item.militaryPolicy),
        trace, finalSession: coordinator.getSessionSnapshot(), loading: stats.loading, glError: app.renderer.getStats().draw?.glError ?? 0, health,
        forbidden: [...new Set(trace.messages)].filter(text => forbidden.test(text))
      };
    } finally { mutations.disconnect(); app.workerTaskCoordinator = coordinator; }
  }, String.raw`\bWorker\b|\bworker\b|线程|任务会话|消息包|结构化克隆|\bbuffer\b|LocalStorage|sessionStorage|IndexedDB|\bBlob\b|缓存后端`);

  const performanceSignals = consoleErrors.filter(text => /\[FMG health\] (operation-stall|main-thread-long-task|render-frame-gap|input-handler-stall)/.test(text));
  const applicationErrors = consoleErrors.filter(text => !performanceSignals.includes(text));
  assert.equal(report.executed && report.refs && report.aliases && report.exact.undo && report.exact.redo, true);
  assert.equal(report.historyDelta, 1); assert.equal(report.trace.runs.length, 3); assert.equal(report.trace.commits.length, 3);
  for (const run of report.trace.runs) {
    assert.equal(run.task, "military-policy.compute"); assert.equal(run.mode, "worker"); assert.equal(run.sessionMode, "map-mirror"); assert.equal(run.sessionPayloadOwnMap, false);
    assert.deepEqual(run.layers, ["point", "line", "labels", "picking"]); assert.deepEqual(run.prepared, ["point", "line", "labels", "picking"]); assert.ok(run.telemetry?.inputPackets > 0 && run.telemetry?.outputPackets > 0);
  }
  assert.ok(report.trace.runs.slice(1).every(run => run.session?.reused)); assert.deepEqual(report.trace.commits.map(item => item.delta), [1, 1, 1]); assert.ok(report.trace.commits.every(item => item.result));
  assert.equal(report.finalSession?.status, "idle"); assert.deepEqual(report.trace.longTasks, []); assert.equal(report.loading.visible, false); assert.equal(report.glError, 0);
  assert.deepEqual(report.health?.events, []); assert.deepEqual(report.forbidden, []); assert.deepEqual(applicationErrors, []); assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ok: true, stateId: report.stateId, operations: report.trace.runs.length, sessionId: report.finalSession.id, longTasks: report.trace.longTasks, spans: report.trace.spans, performanceSignals}, null, 2));
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
