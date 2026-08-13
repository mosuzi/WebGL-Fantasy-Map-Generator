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
const port = 5582;
const timeoutMs = 900_000;
const requestedCells = readRequestedCells(process.argv.slice(2));
const outputDir = join(root, "work", `task332-view-switch-${requestedCells}`);
const server = spawn(process.execPath, [join(root, "tools", "serve-prototype.mjs"), "--host", "127.0.0.1", "--port", String(port), "--dir", join(root, "dist", "webgl-generator")], {stdio: "ignore"});
const playwright = createRequire(join(source, "package.json"))("playwright");
let browser;

try {
  await waitServer();
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const page = await browser.newPage({viewport: {width: 1280, height: 820}});
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [], pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, timeoutMs);
  const report = await page.evaluate(runDiagnostic, requestedCells);
  const performanceErrors = consoleErrors.filter(text => /\[FMG health\] (operation-stall|main-thread-long-task|render-frame-gap|input-handler-stall)/.test(text));
  const applicationErrors = consoleErrors.filter(text => !performanceErrors.includes(text));
  const result = {...report, console: {performanceErrors, applicationErrors, pageErrors}};
  mkdirSync(outputDir, {recursive: true});
  writeFileSync(join(outputDir, "raw-result.json"), `${JSON.stringify(result, null, 2)}\n`);
  assert.deepEqual(applicationErrors, [], "视图切换出现应用 console.error");
  assert.deepEqual(pageErrors, [], "视图切换出现 pageerror");
  assertAcceptance(result, requestedCells);
  mkdirSync(outputDir, {recursive: true});
  writeFileSync(join(outputDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({
    ok: true,
    artifact: join(outputDir, "result.json"),
    cells: result.cells,
    operations: result.operations.map(item => ({
      name: item.name,
      wallMs: item.wallMs,
      stableMs: item.stableMs,
      layers: item.worker?.layers || [],
      reused: item.worker?.session?.reused,
      inputPackets: item.worker?.telemetry?.inputPackets,
      outputPackets: item.worker?.telemetry?.outputPackets,
      computeMs: item.worker?.telemetry?.computeMs,
      renderPrepareMs: item.worker?.telemetry?.renderPrepareMs,
      longTasks: item.longTasks,
      slowSpans: item.spans.filter(span => span.ms >= 20)
    }))
  }, null, 2));
} finally {
  await browser?.close();
  server.kill();
  await Promise.race([new Promise(done => server.once("exit", done)), delay(5000)]);
}

async function runDiagnostic(requestedCells) {
  const api = window.webglGeneratorApi;
  const app = window.__webglGeneratorApp;
  const ensure = (condition, message) => { if (!condition) throw new Error(message); };
  const unwrap = (response, label) => {
    if (!response?.ok) throw new Error(`${label}: ${response?.error?.code || "api_error"} ${response?.error?.message || ""}`);
    return response.data;
  };
  unwrap(await api.generate.newMap({confirm: true, seed: `task332-view-switch-${requestedCells}`, cellsTarget: requestedCells, heightmapTemplate: "continents"}), "newMap");
  const city = app.map.settlements?.cities?.find(item => item && !item.removed);
  const route = app.map.settlements?.routes?.find(item => item && !item.removed);
  if (city) unwrap(api.selection.select({kind: "city", id: city.id ?? city.i}), "select city");
  if (route) unwrap(api.selection.highlight([{kind: "route", id: route.id ?? route.i}]), "highlight route");
  await drain();
  window.__webglGeneratorHealth?.clear?.();

  const trace = {spans: [], longTasks: [], loafs: []};
  const restores = [];
  const wrap = (owner, name, label = name) => {
    const original = owner?.[name];
    if (typeof original !== "function") return;
    const wrapped = function(...args) {
      const start = performance.now();
      const finish = status => trace.spans.push({name: label, start, end: performance.now(), status});
      try {
        const result = Reflect.apply(original, this, args);
        if (result?.then) return result.then(value => { finish("fulfilled"); return value; }, error => { finish("rejected"); throw error; });
        finish("returned");
        return result;
      } catch (error) {
        finish("threw");
        throw error;
      }
    };
    owner[name] = wrapped;
    restores.push(() => owner[name] === wrapped && (owner[name] = original));
  };
  for (const name of [
    "applyDeferredWorkerRenderPresentationOnly", "resumePreparedWorkerRenderInstall", "resumeWorkerRenderInstall",
    "prepareOverlayBundleFromDescriptors", "refreshCellSurface", "refreshLineLayers", "refreshPointLayers",
    "rebuildPoliticalVisualMeshesIfNeeded", "rebuildPoliticalVisualMeshes", "updateLabels", "draw"
  ]) wrap(app.renderer, name, `renderer:${name}`);
  wrap(app.renderer?.overlay, "replaceChildren", "overlay:replaceChildren");
  wrap(app.renderer?.cityIconLayer, "setInstances", "city:setInstances");

  const longTaskObserver = new PerformanceObserver(list => trace.longTasks.push(...list.getEntries().map(entry => ({startTime: entry.startTime, duration: entry.duration, name: entry.name}))));
  longTaskObserver.observe({type: "longtask", buffered: false});
  const loafObserver = PerformanceObserver.supportedEntryTypes?.includes("long-animation-frame") ? new PerformanceObserver(list => trace.loafs.push(...list.getEntries().map(entry => ({
    startTime: entry.startTime, duration: entry.duration, blockingDuration: entry.blockingDuration || 0,
    renderStart: entry.renderStart || 0, styleAndLayoutStart: entry.styleAndLayoutStart || 0,
    scripts: [...(entry.scripts || [])].map(script => ({startTime: script.startTime, duration: script.duration, sourceFunctionName: script.sourceFunctionName || ""})).filter(script => script.duration >= 5)
  })))) : null;
  loafObserver?.observe({type: "long-animation-frame", buffered: false});

  const themes = unwrap(api.layers.listThemes(), "list themes");
  const currentTheme = themes.current || app.renderer.visualTheme?.id || "default";
  const alternateTheme = themes.themes.map(item => item.value || item.id).find(value => value && value !== currentTheme);
  ensure(alternateTheme, "缺少可切换主题");
  const original = {
    theme: currentTheme,
    ocean: Boolean(app.renderer.viewOptions.showOceanHeight),
    smooth: app.renderer.viewOptions.smoothCellBorders !== false,
    labels: Number(app.renderer.labelOptions.maxCityLabels) || 128
  };
  const actions = [
    ["mode:height-initial", () => api.layers.setViewMode("height")],
    ["mode:states", () => api.layers.setViewMode("states")],
    ["mode:provinces", () => api.layers.setViewMode("provinces")],
    ["mode:biomes", () => api.layers.setViewMode("biomes")],
    ["mode:population", () => api.layers.setViewMode("population")],
    ["mode:height", () => api.layers.setViewMode("height")],
    ["theme:alternate", () => api.layers.setTheme(alternateTheme)],
    ["theme:restore", () => api.layers.setTheme(original.theme)],
    ["option:ocean", () => api.layers.setShowOceanHeight(!original.ocean)],
    ["option:ocean-restore", () => api.layers.setShowOceanHeight(original.ocean)],
    ["option:smooth", () => api.layers.setSmoothCellBorders(!original.smooth)],
    ["option:smooth-restore", () => api.layers.setSmoothCellBorders(original.smooth)],
    ["option:labels", () => api.layers.setMaxCityLabels(original.labels + 17)],
    ["option:labels-restore", () => api.layers.setMaxCityLabels(original.labels)]
  ];
  const operations = [];
  try {
    for (const [name, action] of actions) operations.push(await runAction(name, action));
  } finally {
    longTaskObserver.disconnect();
    loafObserver?.disconnect();
    restores.reverse().forEach(restore => restore());
  }
  const finalHealth = unwrap(api.info.healthEvents({severity: "error", limit: 100}), "health");
  const finalStats = unwrap(api.info.runtimeStats(), "runtime stats");
  return {ok: true, cells: app.map.grid.cells.i.length, operations, final: {health: finalHealth.events || [], loading: finalStats.loading, glError: app.renderer.getStats().draw?.glError ?? app.renderer.lastDraw?.glError ?? 0}};

  async function runAction(name, action) {
    await drain();
    trace.longTasks.push(...longTaskObserver.takeRecords().map(entry => ({startTime: entry.startTime, duration: entry.duration, name: entry.name})));
    trace.loafs.push(...(loafObserver?.takeRecords?.() || []).map(entry => ({startTime: entry.startTime, duration: entry.duration, blockingDuration: entry.blockingDuration || 0, renderStart: entry.renderStart || 0, styleAndLayoutStart: entry.styleAndLayoutStart || 0, scripts: []})));
    const marks = {spans: trace.spans.length, longTasks: trace.longTasks.length, loafs: trace.loafs.length};
    const previousDisplayEvidence = app.lastDisplayRenderWorker;
    const mapRef = app.map, rendererMapRef = app.renderer.map, pickingRef = app.renderer.objectPickingIndex;
    const baseline = {
      revision: JSON.stringify(app.mapRevision.getSnapshot()), checksum: app.map.metadata?.checksum || "",
      history: JSON.stringify(app.editHistory.getStats()), camera: JSON.stringify(app.renderer.camera),
      selection: summarize(app.selectionStore.getSnapshot().selection?.object), highlights: app.renderer.objectHighlights.map(summarize)
    };
    const loading = [], timer = setInterval(() => {
      for (const id of ["operation-loading", "generation-loading"]) {
        const node = document.getElementById(id);
        if (node && !node.hidden && getComputedStyle(node).display !== "none") loading.push({at: performance.now(), id, text: node.textContent?.trim() || ""});
      }
    }, 20);
    const startedAt = performance.now();
    let response;
    try { response = await action(); } finally { clearInterval(timer); }
    const fulfilledAt = performance.now();
    unwrap(response, name);
    await drain();
    trace.longTasks.push(...longTaskObserver.takeRecords().map(entry => ({startTime: entry.startTime, duration: entry.duration, name: entry.name})));
    const endedAt = performance.now();
    const invariant = {
      map: app.map === mapRef && app.renderer.map === rendererMapRef && rendererMapRef === mapRef,
      picking: app.renderer.objectPickingIndex === pickingRef,
      revision: JSON.stringify(app.mapRevision.getSnapshot()) === baseline.revision,
      checksum: (app.map.metadata?.checksum || "") === baseline.checksum,
      history: JSON.stringify(app.editHistory.getStats()) === baseline.history,
      camera: JSON.stringify(app.renderer.camera) === baseline.camera,
      selection: JSON.stringify(summarize(app.selectionStore.getSnapshot().selection?.object)) === JSON.stringify(baseline.selection),
      highlights: JSON.stringify(app.renderer.objectHighlights.map(summarize)) === JSON.stringify(baseline.highlights)
    };
    ensure(Object.values(invariant).every(Boolean), `${name} 破坏视图切换不变量：${JSON.stringify(invariant)}`);
    const runtime = unwrap(api.info.runtimeStats(), `${name} runtime`), health = unwrap(api.info.healthEvents({severity: "error", limit: 100}), `${name} health`);
    ensure(runtime.loading.visible === false, `${name} Loading 未清理`);
    ensure((health.events || []).length === 0, `${name} 出现非性能 health error：${JSON.stringify(health.events || [])}`);
    const last = app.lastDisplayRenderWorker;
    return {
      name, wallMs: round(fulfilledAt - startedAt), stableMs: round(endedAt - startedAt), invariant, loading,
      worker: last && last !== previousDisplayEvidence ? {operation: last.operation, layers: last.layers, cache: last.cache, telemetry: last.worker?.telemetry || null, session: last.worker?.session || last.session || null, finalSession: last.session || null} : null,
      spans: trace.spans.slice(marks.spans).map(span => ({...span, ms: round(span.end - span.start)})),
      longTasks: trace.longTasks.slice(marks.longTasks).filter(entry => entry.startTime >= startedAt && entry.startTime < endedAt),
      loafs: trace.loafs.slice(marks.loafs).filter(entry => entry.startTime < endedAt && entry.startTime + entry.duration > startedAt),
      rendererPerformance: app.renderer.getPerformanceEvents({includeRecent: true})
    };
  }

  function summarize(object) { return object ? {kind: object.kind, id: object.id ?? object.i} : null; }
  function round(value) { return Math.round(Number(value || 0) * 10) / 10; }
  function drain() { return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 100)))); }
}

function assertAcceptance(result, requested) {
  const expectedCells = requested === 100_000 ? 99_846 : 10_004;
  assert.equal(result.cells, expectedCells, `${requested} 档实际 cell 数漂移`);
  assert.deepEqual(result.final.health, [], "视图切换出现 health error");
  assert.equal(result.final.loading?.visible, false, "视图切换结束后 Loading 未清理");
  assert.equal(result.final.glError, 0, "视图切换出现 WebGL error");
  assert.equal(result.operations.length, 14, "视图切换操作分母漂移");
  assert.equal(result.operations[0].name, "mode:height-initial", "视图切换必须从 height 起步");
  assert.equal(result.operations[0].worker, null, "初始 height 同值设置必须保持 no-op");
  const workerOperations = result.operations.slice(1);
  for (const operation of workerOperations) assert.ok(operation.worker, `${operation.name} 未产生当前 Worker 显示证据`);
  const first = workerOperations[0];
  assert.equal(first.name, "mode:states", "首次真实切换必须为 states");
  assert.equal(first.worker.session?.reused, false, "首次视图切换必须建立新 Worker 镜像");
  assert.equal(first.worker.cache?.reused, false, "首次视图切换不得虚报缓存命中");
  assert.ok(first.worker.telemetry?.inputPackets > 100, "首次视图切换必须记录完整地图镜像输入");
  assert.ok(first.wallMs < (requested === 100_000 ? 30_000 : 8_000), "首次视图切换稳定时间超出登记上限");
  const sessionId = first.worker.session.id;
  for (const operation of workerOperations.slice(1)) {
    const run = operation.worker;
    assert.equal(run.session?.reused, true, `${operation.name} 必须复用同一 Worker 镜像`);
    assert.equal(run.session?.id, sessionId, `${operation.name} Worker session 不同源`);
    assert.equal(run.finalSession?.id, sessionId, `${operation.name} 最终 Worker session 不同源`);
    assert.equal(run.finalSession?.status, "idle", `${operation.name} 最终 Worker session 未回到 idle`);
    assert.equal(run.cache?.reused, true, `${operation.name} 必须复用渲染几何缓存`);
    assert.ok((run.telemetry?.inputPackets || 0) <= 3, `${operation.name} Worker 输入包数超出复用边界`);
    const wallLimit = requested === 100_000
      ? operation.name.startsWith("theme:") ? 2_500 : operation.name.startsWith("option:labels") ? 1_000 : 2_000
      : 1_500;
    assert.ok(operation.wallMs < wallLimit, `${operation.name} 稳定时间 ${operation.wallMs}ms 超出 ${wallLimit}ms`);
  }
  for (const operation of workerOperations) {
    const expectedName = operation.name.startsWith("mode:") ? "layers.setViewMode"
      : operation.name.startsWith("theme:") ? "layers.setTheme"
        : operation.name.startsWith("option:ocean") ? "layers.setShowOceanHeight"
          : operation.name.startsWith("option:smooth") ? "layers.setSmoothCellBorders"
            : "layers.setMaxCityLabels";
    assert.ok(operation.worker.operation?.id, `${operation.name} 缺少当前 operation ID`);
    assert.equal(operation.worker.operation?.name, expectedName, `${operation.name} Worker 证据错归到其它操作`);
  }
  const registered = [];
  for (const operation of result.operations) {
    for (const entry of operation.longTasks) {
      const registrable = requested === 100_000
        && (operation.name.startsWith("theme:") || operation.name.startsWith("option:labels"))
        && entry.name === "self"
        && entry.duration <= 130;
      assert.ok(registrable, `${operation.name} 出现未登记 LongTask：${JSON.stringify(entry)}`);
      registered.push({operation: operation.name, ...entry});
    }
  }
  if (requested === 10_000) assert.deepEqual(registered, [], "10k 视图切换不得登记 LongTask");
  const counts = registered.reduce((map, entry) => map.set(entry.operation, (map.get(entry.operation) || 0) + 1), new Map());
  for (const [operation, count] of counts) assert.ok(count <= (operation.startsWith("theme:") ? 1 : 2), `${operation} 登记 LongTask 数量漂移`);
  result.acceptance = {requestedCells: requested, registeredLongTasks: registered};
}

function readRequestedCells(args) {
  const raw = args.find(value => value.startsWith("--cells="))?.slice("--cells=".length) || "100000";
  const value = Number(raw);
  if (value !== 10_000 && value !== 100_000) throw new Error("--cells 仅支持 10000 或 100000");
  return value;
}

async function waitServer() {
  for (let index = 0; index < 120; index++) {
    if (server.exitCode !== null) throw new Error(`静态服务提前退出：${server.exitCode}`);
    try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) return; } catch {}
    await delay(50);
  }
  throw new Error("等待静态服务超时");
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
