#!/usr/bin/env node
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const distDir = join(rootDir, "dist", "webgl-generator");
const host = "127.0.0.1";
const port = 5554;
const timeoutMs = 180000;
const cellsTarget = Number(process.argv.find(arg => arg.startsWith("--cells="))?.split("=")[1] || 10000);
const seed = `generation-worker-browser-${cellsTarget}`;
const technicalCopy = /\bWorker\b|\bworker\b|线程|任务会话|消息包|结构化克隆|\bbuffer\b|LocalStorage|sessionStorage|IndexedDB|\bBlob\b|缓存后端/;
const performanceTypes = ["operation-stall", "main-thread-long-task", "render-frame-gap", "input-handler-stall"];
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const server = spawn(process.execPath, [join(rootDir, "tools", "serve-prototype.mjs"), "--host", host, "--port", String(port), "--dir", distDir], {stdio: "ignore"});
let browser;
let context;

try {
  await waitForServer(server);
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  context = await browser.newContext({viewport: {width: 1280, height: 820}, deviceScaleFactor: 1});
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, timeoutMs);
  const consoleStart = consoleErrors.length;
  const report = await page.evaluate(async ({cellsTarget, forbiddenSource, performanceTypes, seed}) => {
    const api = window.webglGeneratorApi;
    const app = window.__webglGeneratorApp;
    const renderer = app.renderer;
    const coordinator = app.workerTaskCoordinator;
    const forbidden = new RegExp(forbiddenSource, "i");
    const oldMap = app.map;
    const trace = {runs: [], legacyLoads: 0, preparedLoads: 0, visibleMessages: [], longTasks: []};
    const originalRun = coordinator.run;
    const originalLegacyLoad = renderer.loadMapAsync;
    const originalPreparedLoad = renderer.completePreparedMapLoadAsync;
    const wrappedRun = async function(task, payload, options) {
      const record = {task, startedAt: performance.now(), payloadOwnMap: Object.hasOwn(payload || {}, "map"), requestLayers: [...(payload?.render?.layers || [])], requestBinding: payload?.render?.binding || null};
      trace.runs.push(record);
      const result = await Reflect.apply(originalRun, coordinator, [task, payload, options]);
      Object.assign(record, {endedAt: performance.now(), mode: result?.worker?.mode || "", telemetry: result?.worker?.telemetry || null, preparedKeys: Object.keys(result?.preparedRender?.layers || {}), preparedBinding: result?.preparedRender?.binding || null});
      return result;
    };
    const wrappedCoordinator = {
      run: wrappedRun,
      commitSession: coordinator.commitSession.bind(coordinator),
      invalidateSession: coordinator.invalidateSession.bind(coordinator),
      getSessionSnapshot: coordinator.getSessionSnapshot.bind(coordinator)
    };
    const wrappedLegacyLoad = function(...args) {
      trace.legacyLoads += 1;
      return Reflect.apply(originalLegacyLoad, this, args);
    };
    const wrappedPreparedLoad = async function(map, options) {
      trace.preparedLoads += 1;
      trace.preparedMapMatchesRuntime = map === app.map;
      trace.preparedLoadStartedAt = performance.now();
      try { return await Reflect.apply(originalPreparedLoad, this, [map, options]); }
      finally { trace.preparedLoadEndedAt = performance.now(); }
    };
    app.workerTaskCoordinator = wrappedCoordinator;
    renderer.loadMapAsync = wrappedLegacyLoad;
    renderer.completePreparedMapLoadAsync = wrappedPreparedLoad;
    window.__webglGeneratorHealth?.clear?.();
    const observer = typeof PerformanceObserver === "function" ? new PerformanceObserver(list => {
      for (const entry of list.getEntries()) trace.longTasks.push({startTime: entry.startTime, duration: entry.duration});
    }) : null;
    try { observer?.observe({entryTypes: ["longtask"]}); } catch { observer?.disconnect(); }
    const feedbackNodes = ["generation-loading", "operation-loading", "map-toast", "shortcut-toast"].map(id => document.getElementById(id)).filter(Boolean);
    const sampleFeedback = () => {
      for (const node of feedbackNodes) {
        const style = getComputedStyle(node);
        if (node.hidden || node.getAttribute("aria-hidden") === "true" || style.display === "none" || style.visibility === "hidden" || !node.getClientRects().length) continue;
        const text = node.textContent?.trim() || "";
        if (text) trace.visibleMessages.push(text);
      }
    };
    const mutations = new MutationObserver(sampleFeedback);
    mutations.observe(document.body, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["hidden", "class", "aria-hidden"]});
    try {
      trace.apiStartedAt = performance.now();
      const response = await api.generate.newMap({confirm: true, seed, cellsTarget, heightmapTemplate: "continents"});
      trace.apiEndedAt = performance.now();
      if (!response?.ok) throw new Error(`${response?.error?.code || "operation_failed"} ${response?.error?.message || "整图生成失败"}`);
      await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
      await new Promise(done => setTimeout(done, 100));
      for (const entry of observer?.takeRecords?.() || []) trace.longTasks.push({startTime: entry.startTime, duration: entry.duration});
      sampleFeedback();
      const health = window.__webglGeneratorHealth?.getEvents?.(240) || [];
      const loading = api.info.runtimeStats().data?.loading || {};
      return {
        response: response.data,
        mapChanged: app.map !== oldMap,
        rendererMapMatches: renderer.map === app.map,
        map: {gridCells: app.map?.grid?.cells?.i?.length || 0, packCells: app.map?.pack?.cells?.i?.length || 0, seed: app.map?.metadata?.seed || ""},
        history: app.editHistory.getStats(), trace, coordinator: coordinator.getSessionSnapshot?.() || null, loading,
        runtimeRefreshProfile: app.lastRuntimeRefreshProfile || [],
        preparedInstallProfile: app.lastPreparedMapInstallProfile || null,
        pendingOverlayBatches: renderer.overlay?.querySelectorAll?.(".map-overlay-install-batch").length || 0,
        forbiddenMessages: [...new Set(trace.visibleMessages)].filter(message => forbidden.test(message)),
        nonPerformanceHealthErrors: health.filter(event => event?.severity === "error" && !performanceTypes.includes(event?.type)),
        performanceHealth: health.filter(event => performanceTypes.includes(event?.type)),
        glError: renderer.getStats?.().draw?.glError ?? 0
      };
    } finally {
      mutations.disconnect();
      observer?.disconnect();
      if (app.workerTaskCoordinator === wrappedCoordinator) app.workerTaskCoordinator = coordinator;
      if (renderer.loadMapAsync === wrappedLegacyLoad) renderer.loadMapAsync = originalLegacyLoad;
      if (renderer.completePreparedMapLoadAsync === wrappedPreparedLoad) renderer.completePreparedMapLoadAsync = originalPreparedLoad;
    }
  }, {cellsTarget, forbiddenSource: technicalCopy.source, performanceTypes, seed});
  const targetErrors = consoleErrors.slice(consoleStart);
  const performanceConsoleErrors = targetErrors.filter(message => performanceTypes.some(type => message.includes(`[FMG health] ${type}`)));
  const applicationConsoleErrors = targetErrors.filter(message => !performanceConsoleErrors.includes(message));
  console.log(JSON.stringify({diagnostic: true, cellsTarget, ...report, performanceConsoleErrors, applicationConsoleErrors, pageErrors}, null, 2));
  assert.equal(report.trace.runs.length, 1, "整图生成没有恰好调用一次正式任务");
  const run = report.trace.runs[0];
  assert.equal(run.task, "generation.compute");
  assert.equal(run.mode, "worker");
  assert.equal(run.payloadOwnMap, false, "整图生成错误重传了旧正式地图");
  assert.deepEqual(run.requestLayers, ["cell-visual", "shore", "state-paths", "province-paths", "political", "surface", "line", "picking", "labels", "route", "river", "point"]);
  assert.deepEqual(run.preparedKeys, ["cellVisual", "shore", "statePaths", "provincePaths", "political", "politicalDebug", "surface", "line", "picking", "labels", "route", "river", "point"]);
  assert.deepEqual(run.preparedBinding, run.requestBinding);
  assert.ok(run.telemetry?.inputPackets > 0 && run.telemetry?.outputPackets > 1, "整图生成没有流式输入输出证据");
  assert.equal(report.trace.preparedLoads, 1);
  assert.equal(report.trace.legacyLoads, 0, "整图生成重新走了主线程全量渲染准备");
  assert.equal(report.trace.preparedMapMatchesRuntime, true);
  assert.equal(report.mapChanged && report.rendererMapMatches, true);
  assert.equal(report.map.seed, seed);
  assert.equal(report.map.gridCells, report.response.map.gridCells);
  assert.ok(report.map.gridCells >= Math.floor(cellsTarget * 0.99) && report.map.packCells > 0);
  assert.equal(report.history.undo, 0);
  assert.equal(report.history.redo, 0);
  assert.equal(report.coordinator, null, "非持久整图生成遗留了 Worker 会话");
  assert.equal(report.loading.visible, false);
  assert.equal(report.pendingOverlayBatches, 0);
  assert.deepEqual(report.trace.longTasks, []);
  assert.deepEqual(report.forbiddenMessages, []);
  assert.deepEqual(report.nonPerformanceHealthErrors, []);
  assert.equal(report.glError, 0);
  assert.deepEqual(applicationConsoleErrors, []);
  assert.deepEqual(pageErrors, []);
} finally {
  if (context) await Promise.race([context.close(), delay(5000)]);
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  server.kill();
  await Promise.race([new Promise(done => server.once("exit", done)), delay(5000)]);
}

async function waitForServer(child) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`静态服务提前退出：${child.exitCode}`);
    try { if ((await fetch(`http://${host}:${port}`)).ok) return; } catch {}
    await delay(50);
  }
  throw new Error("等待静态服务超时");
}

function delay(ms) { return new Promise(done => setTimeout(done, ms)); }
