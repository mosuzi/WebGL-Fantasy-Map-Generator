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
const port = 5562;
const timeoutMs = 180000;
const seed = "task322-map-file-worker-browser";
const performanceTypes = ["operation-stall", "main-thread-long-task", "render-frame-gap", "input-handler-stall"];
const technicalCopy = /\bWorker\b|\bworker\b|线程|任务会话|消息包|结构化克隆|\bbuffer\b|LocalStorage|sessionStorage|IndexedDB|\bBlob\b|缓存后端|浏览器概念/;
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const server = spawn(process.execPath, [join(rootDir, "tools", "serve-prototype.mjs"), "--host", host, "--port", String(port), "--dir", distDir], {stdio: "ignore"});
let browser;
let context;

try {
  await waitForServer(server);
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  context = await browser.newContext({viewport: {width: 1280, height: 820}});
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, timeoutMs);
  const generated = await page.evaluate(seedValue => window.webglGeneratorApi.generate.newMap({confirm: true, seed: seedValue, cellsTarget: 10000}), seed);
  assert.equal(generated.ok, true, generated.error?.message || "存档测试地图生成失败");
  const consoleStart = consoleErrors.length;
  const report = await page.evaluate(async ({forbiddenSource, performanceTypes}) => {
    const api = window.webglGeneratorApi;
    const app = window.__webglGeneratorApp;
    const renderer = app.renderer;
    const coordinator = app.workerTaskCoordinator;
    const trace = {runs: [], operations: [], preparedLoads: [], legacyLoads: 0, preparedPresentations: 0, fullThemeUpdates: 0, fullUnitUpdates: 0, longTasks: [], visibleMessages: []};
    const originalRun = coordinator.run;
    const originalPrepared = renderer.completePreparedMapLoadAsync;
    const originalLegacy = renderer.loadMapAsync;
    const originalPreparedPresentation = renderer.setPreparedPresentation;
    const originalTheme = renderer.setVisualTheme;
    const originalUnits = renderer.setUnitPreferences;
    const wrappedCoordinator = {
      async run(task, payload, options) {
        const record = {task, operation: payload?.operation || "", inputKind: payload?.input?.kind || typeof payload?.input, requestLayers: [...(payload?.render?.layers || [])]};
        trace.runs.push(record);
        const result = await Reflect.apply(originalRun, coordinator, [task, payload, options]);
        Object.assign(record, {
          mode: result?.worker?.mode || "",
          accepted: result?.worker?.accepted === true,
          telemetry: result?.worker?.telemetry || null,
          preparedLayers: Object.keys(result?.preparedRender?.layers || {})
        });
        return result;
      },
      commitSession: coordinator.commitSession.bind(coordinator),
      invalidateSession: coordinator.invalidateSession.bind(coordinator),
      getSessionSnapshot: coordinator.getSessionSnapshot.bind(coordinator)
    };
    renderer.completePreparedMapLoadAsync = async function(...args) {
      const record = {startedAt: performance.now()};
      trace.preparedLoads.push(record);
      try {
        return await Reflect.apply(originalPrepared, this, args);
      } finally {
        record.endedAt = performance.now();
        record.rendererLoad = this.lastLoad ? structuredClone(this.lastLoad) : null;
      }
    };
    renderer.loadMapAsync = async function(...args) {
      trace.legacyLoads += 1;
      return Reflect.apply(originalLegacy, this, args);
    };
    renderer.setPreparedPresentation = function(...args) {
      trace.preparedPresentations += 1;
      return Reflect.apply(originalPreparedPresentation, this, args);
    };
    renderer.setVisualTheme = function(...args) {
      trace.fullThemeUpdates += 1;
      return Reflect.apply(originalTheme, this, args);
    };
    renderer.setUnitPreferences = function(...args) {
      trace.fullUnitUpdates += 1;
      return Reflect.apply(originalUnits, this, args);
    };
    app.workerTaskCoordinator = wrappedCoordinator;
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) trace.longTasks.push({startTime: entry.startTime, duration: entry.duration});
    });
    observer.observe({entryTypes: ["longtask"]});
    const feedbackNodes = ["generation-loading", "operation-loading", "map-toast", "file-operation-status"].map(id => document.getElementById(id)).filter(Boolean);
    const sampleFeedback = () => {
      for (const node of feedbackNodes) {
        const style = getComputedStyle(node);
        if (node.hidden || style.display === "none" || style.visibility === "hidden" || !node.getClientRects().length) continue;
        const text = node.textContent?.trim() || "";
        if (text) trace.visibleMessages.push(text);
      }
    };
    const mutations = new MutationObserver(sampleFeedback);
    mutations.observe(document.body, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["hidden", "class"]});
    window.__webglGeneratorHealth?.clear?.();
    try {
      const runOperation = async (label, task) => {
        const record = {label, startedAt: performance.now()};
        trace.operations.push(record);
        try {
          return await task();
        } finally {
          record.endedAt = performance.now();
          record.preparedInstall = app.lastPreparedMapInstallProfile ? structuredClone(app.lastPreparedMapInstallProfile) : null;
          record.runtimeRefresh = app.lastRuntimeRefreshProfile ? structuredClone(app.lastRuntimeRefreshProfile) : null;
        }
      };
      const before = {seed: app.map.metadata.seed, checksum: app.map.metadata.checksum};
      const exported = await runOperation("export", () => app.runtimeActions.data.exportCompressedAll({download: false, includeBlob: true, includeBase64: false}));
      const saved = await runOperation("save", () => app.runtimeActions.data.saveBrowserMap({toast: false}));
      const imported = await runOperation("import", () => app.runtimeActions.data.importMap(exported.blob, {confirm: true, toast: false}));
      const restored = await runOperation("restore", () => app.runtimeActions.data.restoreBrowserMap({confirm: true, toast: false}));
      await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
      await new Promise(done => setTimeout(done, 100));
      for (const entry of observer.takeRecords()) trace.longTasks.push({startTime: entry.startTime, duration: entry.duration});
      sampleFeedback();
      const health = window.__webglGeneratorHealth?.getEvents?.(240) || [];
      return {
        before,
        after: {seed: app.map.metadata.seed, checksum: app.map.metadata.checksum, gridCells: app.map.grid.cells.i.length},
        export: {bytes: exported.compressedBytes, originalBytes: exported.originalBytes, hasBlob: exported.blob instanceof Blob},
        save: {backend: saved.storageBackend, encoding: saved.encoding},
        importWorker: imported.timings?.worker || null,
        restoreWorker: restored.timings?.worker || null,
        history: app.editHistory.getStats(),
        loading: api.info.runtimeStats().data?.loading || {},
        session: coordinator.getSessionSnapshot(),
        trace,
        forbiddenMessages: [...new Set(trace.visibleMessages)].filter(text => new RegExp(forbiddenSource, "i").test(text)),
        nonPerformanceHealth: health.filter(event => event.severity === "error" && !performanceTypes.includes(event.type)),
        glError: renderer.getStats().draw?.glError ?? 0
      };
    } finally {
      mutations.disconnect();
      observer.disconnect();
      if (app.workerTaskCoordinator === wrappedCoordinator) app.workerTaskCoordinator = coordinator;
      if (renderer.completePreparedMapLoadAsync !== originalPrepared) renderer.completePreparedMapLoadAsync = originalPrepared;
      if (renderer.loadMapAsync !== originalLegacy) renderer.loadMapAsync = originalLegacy;
      if (renderer.setPreparedPresentation !== originalPreparedPresentation) renderer.setPreparedPresentation = originalPreparedPresentation;
      if (renderer.setVisualTheme !== originalTheme) renderer.setVisualTheme = originalTheme;
      if (renderer.setUnitPreferences !== originalUnits) renderer.setUnitPreferences = originalUnits;
    }
  }, {forbiddenSource: technicalCopy.source, performanceTypes});
  const targetConsole = consoleErrors.slice(consoleStart);
  const applicationConsole = targetConsole.filter(message => !performanceTypes.some(type => message.includes(`[FMG health] ${type}`)));
  console.log(JSON.stringify({ok: true, report, applicationConsole, pageErrors}, null, 2));
  assert.equal(report.trace.runs.length, 4, "四条存档入口没有各自执行一次正式任务");
  assert.deepEqual(report.trace.runs.map(run => [run.task, run.operation]), [["map-file-io", "export"], ["map-file-io", "export"], ["map-file-io", "import"], ["map-file-io", "import"]]);
  assert.ok(report.trace.runs.every(run => run.mode === "worker" && run.accepted), "存档入口发生主线程降级");
  assert.ok(report.trace.runs.every(run => run.telemetry?.inputPackets > 0 && run.telemetry?.outputPackets > 0), "存档任务缺少流式遥测");
  assert.ok(report.trace.runs.slice(2).every(run => run.preparedLayers.length === 13), "导入没有准备完整 renderer 图层");
  assert.equal(report.trace.preparedLoads.length, 2);
  assert.equal(report.trace.legacyLoads, 0);
  assert.equal(report.trace.preparedPresentations, 4);
  assert.equal(report.trace.fullThemeUpdates, 0);
  assert.equal(report.trace.fullUnitUpdates, 0);
  assert.deepEqual(report.after.seed, report.before.seed);
  assert.deepEqual(report.after.checksum, report.before.checksum);
  assert.ok(report.after.gridCells >= 9900 && report.export.bytes > 0 && report.export.originalBytes > report.export.bytes && report.export.hasBlob);
  assert.equal(report.save.encoding, "gzip-base64");
  assert.equal(report.history.undo, 0);
  assert.equal(report.loading.visible, false);
  assert.equal(report.session, null);
  assert.deepEqual(report.trace.longTasks, []);
  assert.deepEqual(report.forbiddenMessages, []);
  assert.deepEqual(report.nonPerformanceHealth, []);
  assert.equal(report.glError, 0);
  assert.deepEqual(applicationConsole, []);
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
