#!/usr/bin/env node
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdirSync, writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "source", "Fantasy-Map-Generator");
const port = 5562;
const server = spawn(process.execPath, [join(root, "tools", "serve-prototype.mjs"), "--host", "127.0.0.1", "--port", String(port), "--dir", join(root, "dist", "webgl-generator")], {stdio: "ignore"});
const playwright = createRequire(join(source, "package.json"))("playwright");
const diagnostic = process.argv.includes("--diagnostic");
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
  const report = await page.evaluate(async ({forbiddenSource, diagnostic}) => {
    const api = window.webglGeneratorApi, app = window.__webglGeneratorApp, coordinator = app.workerTaskCoordinator;
    const unwrap = (value, label) => { if (!value?.ok) throw new Error(`${label}: ${value?.error?.code || "api_error"} ${value?.error?.message || ""}`); return value.data; };
    unwrap(await api.generate.newMap({confirm: true, seed: "social-expansion-worker-browser", cellsTarget: 10_000, heightmapTemplate: "continents"}), "newMap");
    const mapRef = app.map;
    const active = items => items.find(item => item?.i && !item.removed), culture = active(app.map.society.cultures), religion = app.map.society.religions.find(item => item?.i && !item.removed && item.type !== "Folk");
    const trace = {runs: [], commits: [], messages: [], longTasks: [], loafs: [], spans: []}, originalRun = coordinator.run, originalCommit = coordinator.commitSession, restores = [];
    const spanSync = (name, task) => { const start = performance.now(); try { return task(); } finally { trace.spans.push({name, start, end: performance.now()}); } };
    const spanAsync = async (name, task) => { const start = performance.now(); try { return await task(); } finally { trace.spans.push({name, start, end: performance.now()}); } };
    const digest = name => spanSync(name, () => JSON.stringify({culture: [...app.map.pack.cells.culture], religion: [...app.map.pack.cells.religion], cultures: app.map.society.cultures, religions: app.map.society.religions}));
    const wrap = (owner, name, label = name) => { const original = owner?.[name]; if (typeof original !== "function") return; const wrapped = function(...args) { const start = performance.now(); try { const value = Reflect.apply(original, this, args); if (value?.then) return value.finally(() => trace.spans.push({name: label, start, end: performance.now()})); trace.spans.push({name: label, start, end: performance.now()}); return value; } catch (error) { trace.spans.push({name: label, start, end: performance.now()}); throw error; } }; owner[name] = wrapped; restores.push(() => owner[name] === wrapped && (owner[name] = original)); };
    const before = digest("fixture:digest-before"), historyBefore = app.editHistory.getStats(), refs = {map: app.map, cultures: app.map.society.cultures, religions: app.map.society.religions};
    app.workerTaskCoordinator = {run: async (task, payload, options) => { const output = await originalRun(task, payload, options); trace.runs.push({task, sessionMode: options?.sessionMode, sessionPayloadOwnMap: Object.hasOwn(options?.sessionPayload || {}, "map"), allowFallback: options?.allowFallback !== false, layers: payload?.render?.layers, prepared: Object.keys(output?.preparedRender?.layers || {}), session: output?.worker?.session || null, telemetry: output?.worker?.telemetry || null}); return output; }, commitSession: async (id, binding, options) => { const result = await originalCommit(id, binding, options); trace.commits.push({id, delta: options?.expectedRevisionDelta, result}); return result; }, invalidateSession: coordinator.invalidateSession.bind(coordinator), getSessionSnapshot: coordinator.getSessionSnapshot.bind(coordinator)};
    const observer = new PerformanceObserver(list => trace.longTasks.push(...list.getEntries().map(({startTime, duration}) => ({startTime, duration})))); observer.observe({entryTypes: ["longtask"]});
    const loafObserver = diagnostic && PerformanceObserver.supportedEntryTypes?.includes("long-animation-frame") ? new PerformanceObserver(list => trace.loafs.push(...list.getEntries().map(entry => ({startTime: entry.startTime, duration: entry.duration, blockingDuration: entry.blockingDuration || 0, renderStart: entry.renderStart || 0, styleAndLayoutStart: entry.styleAndLayoutStart || 0})))) : null; loafObserver?.observe({type: "long-animation-frame", buffered: false});
    if (diagnostic) { for (const name of ["suspendWorkerRenderInstall", "resumePreparedWorkerRenderInstall", "resumeWorkerRenderInstall", "draw", "updateLabels"]) wrap(app.renderer, name, `renderer:${name}`); wrap(app.renderer?.overlay, "replaceChildren", "overlay:replaceChildren"); wrap(app.renderer?.cityIconLayer, "setInstances", "city:setInstances"); }
    const forbidden = new RegExp(forbiddenSource, "i"), nodes = ["operation-loading", "generation-loading", "map-toast", "shortcut-toast"].map(id => document.getElementById(id)).filter(Boolean), sample = () => nodes.forEach(node => { const style = getComputedStyle(node), text = node.textContent?.trim(); if (text && !node.hidden && style.display !== "none" && style.visibility !== "hidden") trace.messages.push(text); });
    const mutations = new MutationObserver(sample); mutations.observe(document.body, {subtree: true, childList: true, characterData: true, attributes: true}); window.__webglGeneratorHealth?.clear?.();
    try {
      await new Promise(done => setTimeout(done, 0));
      trace.longTasks.length = 0;
      trace.loafs.length = 0;
      observer.takeRecords();
      loafObserver?.takeRecords?.();
      const cultureOptions = {mode: "reexpand", expansionism: culture.expansionism >= 9.5 ? 0.2 : 9.5, includeReligions: true, confirm: true};
      const separate = () => new Promise(done => setTimeout(done, 0));
      const cultureResult = unwrap(await spanAsync("api:culture", () => api.edit.cultures.applyExpansion(culture.i, cultureOptions)), "culture"), afterCulture = digest("fixture:digest-after-culture"); await separate();
      const religionOptions = {mode: "reexpand", expansion: religion.expansion === "global" ? "state" : "global", expansionism: religion.expansionism >= 8 ? 0.2 : 8, confirm: true};
      const religionResult = unwrap(await spanAsync("api:religion", () => api.edit.religions.applyExpansion(religion.i, religionOptions)), "religion"), after = digest("fixture:digest-after-religion"), historyAfter = app.editHistory.getStats(), committedSession = coordinator.getSessionSnapshot(); await separate();
      unwrap(await spanAsync("history:undo-religion", () => api.history.undo()), "undo religion"); const undoReligion = digest("fixture:digest-undo-religion"); await separate(); unwrap(await spanAsync("history:undo-culture", () => api.history.undo()), "undo culture"); const undoCulture = digest("fixture:digest-undo-culture"); await separate(); unwrap(await spanAsync("history:redo-culture", () => api.history.redo()), "redo culture"); await separate(); unwrap(await spanAsync("history:redo-religion", () => api.history.redo()), "redo religion"); const redo = digest("fixture:digest-redo");
      await spanAsync("fixture:drain", async () => { await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))); await new Promise(done => setTimeout(done, 100)); }); trace.longTasks.push(...observer.takeRecords().map(({startTime, duration}) => ({startTime, duration}))); trace.loafs.push(...(loafObserver?.takeRecords?.() || []).map(entry => ({startTime: entry.startTime, duration: entry.duration, blockingDuration: entry.blockingDuration || 0, renderStart: entry.renderStart || 0, styleAndLayoutStart: entry.styleAndLayoutStart || 0}))); sample();
      const health = unwrap(api.info.healthEvents({severity: "error", limit: 100}), "health"), stats = unwrap(api.info.runtimeStats(), "stats"), renderer = app.renderer.getStats();
      return {cultureResult, religionResult, changed: before !== afterCulture && afterCulture !== after, historyDelta: historyAfter.undo - historyBefore.undo, undoReligion: undoReligion === afterCulture, undoCulture: undoCulture === before, redo: redo === after, refs: app.map === refs.map && app.map === mapRef && app.map.society.cultures === refs.cultures && app.map.society.religions === refs.religions, trace, committedSession, finalSession: coordinator.getSessionSnapshot(), loading: stats.loading, glError: renderer.draw?.glError ?? 0, health, forbidden: [...new Set(trace.messages)].filter(text => forbidden.test(text))};
    } finally { observer.disconnect(); loafObserver?.disconnect(); mutations.disconnect(); app.workerTaskCoordinator = coordinator; restores.reverse().forEach(restore => restore()); }
  }, {forbiddenSource: String.raw`\bWorker\b|\bworker\b|线程|任务会话|消息包|结构化克隆|\bbuffer\b|LocalStorage|sessionStorage|IndexedDB|\bBlob\b|缓存后端`, diagnostic});
  const performance = consoleErrors.filter(text => /\[FMG health\] (operation-stall|main-thread-long-task|render-frame-gap|input-handler-stall)/.test(text)), applicationErrors = consoleErrors.filter(text => !performance.includes(text));
  if (diagnostic) {
    const payload = {diagnostic: true, ...report, performanceSignals: performance, applicationErrors, pageErrors};
    const directory = join(root, "work", "task322-c2-social-expansion-diagnostic"); mkdirSync(directory, {recursive: true}); writeFileSync(join(directory, "trace.json"), `${JSON.stringify(payload, null, 2)}\n`); console.log(JSON.stringify({diagnostic: true, trace: join(directory, "trace.json"), longTasks: report.trace.longTasks, spans: report.trace.spans.filter(span => span.end - span.start >= 20)}, null, 2));
    process.exitCode = 0;
  } else {
  assert.equal(report.changed && report.undoReligion && report.undoCulture && report.redo && report.refs, true); assert.equal(report.historyDelta, 2); assert.equal(report.trace.runs.length, 6); assert.equal(report.trace.commits.length, 6);
  for (const run of report.trace.runs) { assert.equal(run.task, "social-expansion.compute"); assert.equal(run.sessionMode, "map-mirror"); assert.equal(run.sessionPayloadOwnMap, false); assert.deepEqual(run.layers, ["surface", "point", "labels", "picking"]); assert.deepEqual(run.prepared, ["surface", "point", "labels", "picking"]); assert.ok(run.telemetry?.inputPackets > 0 && run.telemetry?.outputPackets > 0); }
  assert.ok(report.trace.runs.slice(1).every(run => run.session?.reused)); assert.deepEqual(report.trace.commits.map(item => item.delta), [1, 1, 1, 1, 1, 1]); assert.ok(report.trace.commits.every(item => item.result)); assert.equal(report.committedSession?.status, "idle"); assert.equal(report.finalSession?.status, "idle"); assert.equal(report.finalSession?.id, report.committedSession?.id); assert.deepEqual(report.trace.longTasks, []); assert.equal(report.loading.visible, false); assert.equal(report.glError, 0); assert.deepEqual(report.health?.events, []); assert.deepEqual(report.forbidden, []); assert.deepEqual(applicationErrors, []); assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ok: true, ...report, performanceSignals: performance, applicationErrors, pageErrors}, null, 2));
  }
} finally { await browser?.close(); server.kill(); await Promise.race([new Promise(done => server.once("exit", done)), new Promise(done => setTimeout(done, 5000))]); }

async function waitServer() { for (let i = 0; i < 100; i++) { if (server.exitCode !== null) throw new Error(`静态服务提前退出：${server.exitCode}`); try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) return; } catch {} await new Promise(done => setTimeout(done, 50)); } throw new Error("等待静态服务超时"); }
