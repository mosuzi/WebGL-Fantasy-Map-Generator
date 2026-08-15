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
const b2Display = process.argv.includes("--b2-display");
const stageALedger = process.argv.includes("--stage-a-ledger");
const outputDir = join(root, "work", `${stageALedger ? "task335-a-view-ledger" : "task334-b2-view-switch"}-${requestedCells}`);
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
  const report = await page.evaluate(runDiagnostic, {requestedCells, stageALedger});
  const performanceErrors = consoleErrors.filter(text => /\[FMG health\] (operation-stall|main-thread-long-task|render-frame-gap|input-handler-stall)/.test(text));
  const applicationErrors = consoleErrors.filter(text => !performanceErrors.includes(text));
  const result = {...report, console: {performanceErrors, applicationErrors, pageErrors}};
  mkdirSync(outputDir, {recursive: true});
  writeFileSync(join(outputDir, "raw-result.json"), `${JSON.stringify(result, null, 2)}\n`);
  assert.deepEqual(applicationErrors, [], "视图切换出现应用 console.error");
  assert.deepEqual(pageErrors, [], "视图切换出现 pageerror");
  assertAcceptance(result, requestedCells, {b2Display, stageALedger});
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
      surface: item.worker?.surface || null,
      reused: item.worker?.session?.reused,
      inputPackets: item.worker?.telemetry?.inputPackets,
      outputPackets: item.worker?.telemetry?.outputPackets,
      computeMs: item.worker?.telemetry?.computeMs,
      renderPrepareMs: item.worker?.telemetry?.renderPrepareMs,
      timings: item.timings,
      ledger: item.worker?.ledger || null,
      longTasks: item.longTasks,
      slowSpans: item.spans.filter(span => span.ms >= 20)
    }))
  }, null, 2));
} finally {
  await browser?.close();
  server.kill();
  await Promise.race([new Promise(done => server.once("exit", done)), delay(5000)]);
}

async function runDiagnostic({requestedCells, stageALedger}) {
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
  let uiConvergence, viewCameraConvergence, stageA;
  try {
    for (const [name, action] of actions) operations.push(await runAction(name, action));
    viewCameraConvergence = await runViewCameraConvergence();
    uiConvergence = await runUiConvergence();
    if (stageALedger) stageA = await runStageAMatrix();
  } finally {
    longTaskObserver.disconnect();
    loafObserver?.disconnect();
    restores.reverse().forEach(restore => restore());
  }
  const finalHealth = unwrap(api.info.healthEvents({severity: "error", limit: 100}), "health");
  const finalStats = unwrap(api.info.runtimeStats(), "runtime stats");
  return {ok: true, cells: app.map.grid.cells.i.length, operations, viewCameraConvergence, uiConvergence, stageA, final: {health: finalHealth.events || [], loading: finalStats.loading, glError: app.renderer.getStats().draw?.glError ?? app.renderer.lastDraw?.glError ?? 0}};

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
      worker: last && last !== previousDisplayEvidence ? {operation: last.operation, layers: last.layers, surface: last.surface || null, cache: last.cache, telemetry: last.worker?.telemetry || null, session: last.worker?.session || last.session || null, finalSession: last.session || null, ledger: structuredClone(last.ledger || null)} : null,
      timings: last && last !== previousDisplayEvidence ? last.timings || null : null,
      spans: trace.spans.slice(marks.spans).map(span => ({...span, ms: round(span.end - span.start)})),
      longTasks: trace.longTasks.slice(marks.longTasks).filter(entry => entry.startTime >= startedAt && entry.startTime < endedAt),
      loafs: trace.loafs.slice(marks.loafs).filter(entry => entry.startTime < endedAt && entry.startTime + entry.duration > startedAt),
      rendererPerformance: app.renderer.getPerformanceEvents({includeRecent: true})
    };
  }

  async function runViewCameraConvergence() {
    await drain();
    const longTaskStart = trace.longTasks.length;
    const previousMode = app.renderer.colorMode;
    const cameraBefore = JSON.stringify(app.renderer.camera);
    const target = [...document.querySelectorAll('[role="radiogroup"][aria-label="视图"] label')].find(item => item.textContent?.trim() === "国家")?.querySelector("input");
    ensure(target, "缺少国家视图可见控件");
    target.click();
    await Promise.resolve();
    await Promise.resolve();
    ensure(app.runtimeOperation.getSnapshot().busy, "国家视图可见点击未启动显示事务");
    const during = {
      renderer: app.renderer.colorMode,
      selected: document.querySelector('[role="radiogroup"][aria-label="视图"] .el-segmented__item.is-selected .el-segmented__item-label')?.textContent?.trim() || "",
      bridge: document.querySelector('.ui-segmented-mode-bridge.active')?.dataset?.mode || ""
    };
    ensure(during.renderer === previousMode && during.selected === "高度" && during.bridge === previousMode, `未提交视图提前亮起：${JSON.stringify(during)}`);
    const canvas = app.renderer.canvas;
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new WheelEvent("wheel", {bubbles: true, cancelable: true, clientX: rect.left + rect.width * 0.6, clientY: rect.top + rect.height * 0.55, deltaY: -120}));
    const deadline = performance.now() + 30_000;
    while (app.runtimeOperation.getSnapshot().busy && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    ensure(!app.runtimeOperation.getSnapshot().busy, "相机变化期间国家视图未在时限内结束");
    await drain();
    trace.longTasks.push(...longTaskObserver.takeRecords().map(entry => ({startTime: entry.startTime, duration: entry.duration, name: entry.name})));
    const after = {
      renderer: app.renderer.colorMode,
      selected: document.querySelector('[role="radiogroup"][aria-label="视图"] .el-segmented__item.is-selected .el-segmented__item-label')?.textContent?.trim() || "",
      bridge: document.querySelector('.ui-segmented-mode-bridge.active')?.dataset?.mode || "",
      api: unwrap(api.layers.get(), "相机变化后的视图状态").colorMode,
      cameraChanged: JSON.stringify(app.renderer.camera) !== cameraBefore
    };
    ensure(after.renderer === "states" && after.selected === "国家" && after.bridge === "states" && after.api === "states" && after.cameraChanged, `相机变化后的国家视图未收敛：${JSON.stringify(after)}`);
    unwrap(await api.layers.setViewMode(previousMode), "恢复高度视图");
    await drain();
    return {previousMode, during, after, longTasks: trace.longTasks.slice(longTaskStart)};
  }

  async function runUiConvergence() {
    const control = document.getElementById("show-ocean-height");
    ensure(control, "缺少显示海底控件");
    const before = Boolean(app.renderer.viewOptions.showOceanHeight);
    const longTaskStart = trace.longTasks.length;
    control.click();
    control.click();
    await Promise.resolve();
    const deadline = performance.now() + 30_000;
    while (app.runtimeOperation.getSnapshot().busy && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
    ensure(!app.runtimeOperation.getSnapshot().busy, "连续显示海底操作未在时限内结束");
    await drain();
    trace.longTasks.push(...longTaskObserver.takeRecords().map(entry => ({startTime: entry.startTime, duration: entry.duration, name: entry.name})));
    const renderer = Boolean(app.renderer.viewOptions.showOceanHeight);
    const apiState = Boolean(unwrap(api.layers.get(), "连续显示海底状态").display.showOceanHeight);
    return {before, renderer, control: Boolean(control.checked), api: apiState, longTasks: trace.longTasks.slice(longTaskStart)};
  }

  async function runStageAMatrix() {
    const city = app.map.settlements?.cities?.find(item => item && !item.removed);
    ensure(city, "335-A 缺少 revision 推进用城市");
    const sessionBeforeRevision = app.mapWorkerCoordinator.getSessionSnapshot();
    const revisionBefore = app.mapRevision.getSnapshot().mapRevision;
    unwrap(await api.edit.cities.rename(city.id ?? city.i, `${city.name || "城市"}-A`), "335-A revision rename");
    const revisionAfter = app.mapRevision.getSnapshot().mapRevision;
    ensure(revisionAfter === revisionBefore + 1, "335-A 正式编辑未推进唯一 revision");
    const revisionWarm = await runAction("stage-a:revision-warm", () => api.layers.setViewMode("states"));
    const sessionBeforeLoss = app.mapWorkerCoordinator.getSessionSnapshot();
    ensure(app.mapWorkerCoordinator.invalidateSession("task335-a-session-lost") === true, "335-A 未能构造 session 丢失边界");
    const sessionLost = await runAction("stage-a:session-lost", () => api.layers.setViewMode("provinces"));
    const rapid = await runRapidViewConvergence();
    return {revisionBefore, revisionAfter, sessionBeforeRevision, sessionBeforeLoss, revisionWarm, sessionLost, rapid};
  }

  async function runRapidViewConvergence() {
    await drain();
    const longTaskStart = trace.longTasks.length;
    const first = api.layers.setViewMode("states");
    await Promise.resolve();
    const second = api.layers.setViewMode("height");
    const [firstResponse, secondResponse] = await Promise.all([first, second]);
    await drain();
    trace.longTasks.push(...longTaskObserver.takeRecords().map(entry => ({startTime: entry.startTime, duration: entry.duration, name: entry.name})));
    const renderer = app.renderer.colorMode;
    const selectedText = document.querySelector('[role="radiogroup"][aria-label="视图"] .el-segmented__item.is-selected .el-segmented__item-label')?.textContent?.trim() || "";
    const control = new Map([["高度", "height"], ["国家", "states"], ["省份", "provinces"], ["生物群系", "biomes"], ["人口", "population"], ["文化", "cultures"], ["宗教", "religions"], ["政体", "governments"]]).get(selectedText) || "";
    const bridge = document.querySelector('.ui-segmented-mode-bridge.active')?.dataset?.mode || "";
    const apiMode = unwrap(api.layers.get(), "335-A rapid state").colorMode;
    ensure(renderer === control && renderer === bridge && renderer === apiMode, `335-A 快速切换最终状态未同源：${JSON.stringify({renderer, control, bridge, apiMode})}`);
    return {
      first: {ok: firstResponse?.ok === true, code: firstResponse?.error?.code || null},
      second: {ok: secondResponse?.ok === true, code: secondResponse?.error?.code || null},
      final: {renderer, control, selectedText, bridge, api: apiMode},
      longTasks: trace.longTasks.slice(longTaskStart)
    };
  }

  function summarize(object) { return object ? {kind: object.kind, id: object.id ?? object.i} : null; }
  function round(value) { return Math.round(Number(value || 0) * 10) / 10; }
  function drain() { return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 100)))); }
}

function assertAcceptance(result, requested, {b2Display = false, stageALedger = false} = {}) {
  const expectedCells = requested === 100_000 ? 99_846 : 10_004;
  assert.equal(result.cells, expectedCells, `${requested} 档实际 cell 数漂移`);
  assert.deepEqual(result.final.health, [], "视图切换出现 health error");
  assert.equal(result.final.loading?.visible, false, "视图切换结束后 Loading 未清理");
  assert.equal(result.final.glError, 0, "视图切换出现 WebGL error");
  assert.equal(result.operations.length, 14, "视图切换操作分母漂移");
  assert.equal(result.operations[0].name, "mode:height-initial", "视图切换必须从 height 起步");
  assert.equal(result.operations[0].worker, null, "初始 height 同值设置必须保持 no-op");
  assert.deepEqual(result.viewCameraConvergence.longTasks, [], "相机变化期间视图切换不得出现 LongTask");
  assert.deepEqual(result.viewCameraConvergence.during, {renderer: "height", selected: "高度", bridge: "height"}, "未提交视图控件必须保持已提交模式");
  assert.deepEqual(result.viewCameraConvergence.after, {renderer: "states", selected: "国家", bridge: "states", api: "states", cameraChanged: true}, "相机变化后的视图状态必须同源收敛");
  const workerOperations = result.operations.slice(1);
  for (const operation of workerOperations) assert.ok(operation.worker, `${operation.name} 未产生当前 Worker 显示证据`);
  const first = workerOperations[0];
  assert.equal(first.name, "mode:states", "首次真实切换必须为 states");
  assert.equal(first.worker.session?.reused, true, "首次视图切换必须复用新图 adoption owner");
  assert.equal(first.worker.cache?.reused, true, "首次视图切换必须复用生成阶段渲染缓存");
  assert.ok(first.worker.telemetry?.inputPackets <= 3, "首次视图切换不得重新输入完整地图");
  if (b2Display) assert.ok(first.wallMs < (requested === 100_000 ? 2_000 : 1_000), `首次视图切换 ${first.wallMs}ms 未达到 adopted cache 边界`);
  for (const key of ["mainReplicaChecksumMs", "inputAckWaitMs", "outputDecodeCpuMs", "inputDecodeCpuMs", "workerReplicaChecksumMs", "outputWorkerAckWaitMs"]) {
    assert.ok(Number.isFinite(first.worker.telemetry?.[key]) && first.worker.telemetry[key] >= 0, `首次视图切换缺少 ${key} telemetry`);
  }
  if (!b2Display) assert.ok(first.wallMs < (requested === 100_000 ? 30_000 : 8_000), "首次视图切换稳定时间超出登记上限");
  const sessionId = first.worker.session.id;
  for (const operation of workerOperations) {
    for (const key of ["applyMs", "workerMs", "installPrepareMs", "installCommitMs", "sessionCommitMs", "resumeMs", "suspendedMs", "totalMs"]) {
      assert.ok(Number.isFinite(operation.timings?.[key]) && operation.timings[key] >= 0, `${operation.name} 缺少 ${key} 显示事务计时`);
    }
  }
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
  if (b2Display) {
    for (const operation of workerOperations) {
      const compactSurface = operation.name.startsWith("mode:") || operation.name.startsWith("theme:") || operation.name.startsWith("option:ocean");
      if (compactSurface) {
        assert.equal(operation.worker.surface?.mode, "cell-colors", `${operation.name} 未使用 compact surface color patch`);
        assert.equal(operation.worker.surface?.baseBytes, 0, `${operation.name} 仍回传完整 surface base`);
        assert.ok(operation.worker.surface?.colorBytes > 0, `${operation.name} 缺少 surface color patch bytes`);
      }
      if (operation.name.startsWith("option:ocean")) assert.equal(operation.worker.surface?.scope, "water", `${operation.name} 必须只覆盖水域`);
      if (compactSurface && !operation.name.startsWith("option:ocean")) assert.equal(operation.worker.surface?.scope, "all", `${operation.name} 必须覆盖全部 cell 颜色`);
      assert.ok(operation.timings.suspendedMs < Math.max(250, operation.timings.totalMs * 0.35), `${operation.name} renderer suspend 未收窄：${JSON.stringify(operation.timings)}`);
    }
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
  if (stageALedger) {
    for (const operation of workerOperations) {
      assert.equal(operation.worker.ledger?.path, "warm", `${operation.name} 未归入 warm 账本`);
      assert.equal(operation.worker.ledger?.reused, true, `${operation.name} warm 账本复用标志错误`);
      assert.ok(Number.isFinite(operation.worker.ledger?.frames?.firstAnimationFrameMs), `${operation.name} 缺少首个 animation frame 时间`);
      assert.ok(Number.isFinite(operation.worker.ledger?.frames?.presentedFrameMs), `${operation.name} 缺少已呈现 frame 时间`);
    }
    const matrix = result.stageA;
    assert.equal(matrix.revisionAfter, matrix.revisionBefore + 1, "335-A revision 分母漂移");
    assert.equal(matrix.revisionWarm.worker.ledger.path, "warm", "revision 推进后必须复用已同步 session");
    assert.equal(matrix.revisionWarm.worker.ledger.sessionBefore.binding.mapRevision, matrix.revisionAfter, "revision warm session 未推进到当前 revision");
    assert.equal(matrix.sessionLost.worker.ledger.path, "cold", "session 丢失后必须归入 cold");
    assert.equal(matrix.sessionLost.worker.ledger.reused, false, "session 丢失后不得伪报复用");
    assert.ok(matrix.sessionLost.worker.ledger.inputPackets > 3, "session 丢失后未记录完整输入分母");
    assert.notEqual(matrix.sessionBeforeLoss.id, matrix.sessionLost.worker.finalSession.id, "session 丢失后仍沿用旧 session id");
    assert.deepEqual(matrix.rapid.first, {ok: true, code: null}, "快速切换首个意图基线漂移");
    assert.deepEqual(matrix.rapid.second, {ok: false, code: "operation_busy"}, "快速切换第二意图 busy 基线漂移");
    assert.deepEqual(matrix.rapid.longTasks, [], "快速视图竞争出现 LongTask");
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
  assert.equal(result.uiConvergence.renderer, !result.uiConvergence.before, "连续显示海底操作没有提交首个合法意图");
  assert.equal(result.uiConvergence.control, result.uiConvergence.renderer, "显示海底控件与 renderer 最终状态反转");
  assert.equal(result.uiConvergence.api, result.uiConvergence.renderer, "显示海底 API 与 renderer 最终状态反转");
  assert.deepEqual(result.uiConvergence.longTasks, [], "连续显示海底操作出现 LongTask");
  const counts = registered.reduce((map, entry) => map.set(entry.operation, (map.get(entry.operation) || 0) + 1), new Map());
  for (const [operation, count] of counts) assert.ok(count <= (operation.startsWith("theme:") ? 4 : 2), `${operation} 登记 LongTask 数量漂移`);
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
