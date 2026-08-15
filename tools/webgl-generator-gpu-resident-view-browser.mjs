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
const political = process.argv.includes("--political");
const contextRestore = process.argv.includes("--context-restore"), display = process.argv.includes("--display"), smooth = process.argv.includes("--smooth"), identity = process.argv.includes("--identity"), consistency = process.argv.includes("--consistency"), cellsTarget = process.argv.includes("--100k") ? 100000 : process.argv.includes("--50k") ? 50000 : 10000;
const outputDir = join(root, "work", contextRestore ? `task335-j-context-restore-${cellsTarget}` : consistency ? `task335-i-display-consistency-${cellsTarget}` : identity ? `task335-h-layer-identity-${cellsTarget}` : smooth ? `task335-g-smooth-borders-${cellsTarget}` : display ? `task335-f-display-mutations-${cellsTarget}` : political ? `task335-e-political-views-${cellsTarget}` : `task335-d-gpu-resident-views-${cellsTarget}`);
const verify = process.argv.includes("--verify");
const expectedChecksums = Object.freeze(cellsTarget === 100000 ? {height: 2864157934, biomes: 1442997136, population: 2603628230} : cellsTarget === 50000 ? {height: 219435668, biomes: 863896970, population: 2055490544} : {height: 2949860715, biomes: 1641731067, population: 2261249289});
const expectedLabels = Object.freeze({height: "高度", biomes: "生物群系", population: "人口", states: "国家", provinces: "省份"});
const server = spawn(process.execPath, [join(root, "tools", "serve-prototype.mjs"), "--host", "127.0.0.1", "--port", "5583", "--dir", join(root, "dist", "webgl-generator")], {stdio: "ignore"});
const playwright = createRequire(join(source, "package.json"))("playwright");
let browser;

try {
  await waitServer();
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const page = await browser.newPage({viewport: {width: 1280, height: 820}});
  const consoleErrors = [], pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto("http://127.0.0.1:5583?healthClear=1", {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 120_000);
  const report = await page.evaluate(run, {verify, political, contextRestore, display, smooth, identity, consistency, cellsTarget});
  mkdirSync(outputDir, {recursive: true});
  writeFileSync(join(outputDir, "attempt.json"), `${JSON.stringify(report, null, 2)}\n`);
  const applicationErrors = consoleErrors.filter(text => !/\[FMG health\] (operation-stall|main-thread-long-task|render-frame-gap|input-handler-stall)/.test(text));
  assert.deepEqual(applicationErrors, []);
  assert.deepEqual(pageErrors, []);
  if (verify) {
    assert.ok(cellsTarget === 100000 ? report.cells >= 99000 && report.cells <= 100000 : report.cells === (cellsTarget === 50000 ? 50142 : 10004), `335-${consistency ? "I" : identity ? "H" : smooth ? "G" : display ? "F" : political ? "E" : "D"} 固定地图规模漂移`);
    if (contextRestore) {
      assert.equal(report.restored, true); assert.equal(report.referencesRecreated, true); assert.deepEqual(report.longTasks, []);
      assert.deepEqual(report.operations.map(item => [item.mode, item.pixelParity]), [["height", {mismatches: 0, maxDelta: 0}], ["biomes", {mismatches: 0, maxDelta: 0}], ["states", {mismatches: 0, maxDelta: 0}]]);
    } else if (consistency) {
      assert.deepEqual(report.first, {response: true, renderer: "states", api: "states", active: "states"});
      assert.deepEqual(report.rapid.responses, ["operation_obsolete", "operation_obsolete", "ok"]); assert.deepEqual(report.rapid.final, {renderer: "biomes", api: "biomes", active: "biomes"}); assert.equal(report.rapid.cameraChanged, true);
      for (const key of ["commitRejected", "staleSession"]) assert.deepEqual(report[key], {ok: true, runCalls: 2, selfHealAttempts: 1, finalState: true}, `${key} 未精确自愈一次`);
      assert.deepEqual(report.buildMismatch, {code: "worker_build_mismatch", runCalls: 1, statePreserved: true, fallbackRuns: 0});
    } else if (identity) {
      assert.deepEqual(report.operations.map(item => item.layer), ["cities", "population", "markers", "resources", "military", "cities", "population", "markers", "resources", "military"]);
      for (const item of report.operations) {
        for (const [key, label] of [["workerRuns", "Worker"], ["pointRefreshes", "point"], ["overlayReplaces", "overlay"], ["pickingRefreshes", "picking"], ["cityInstalls", "city instances"]]) assert.equal(item[key], 0, `${item.layer} 仍触发 ${label}`);
        if (item.layer === "cities" || item.layer === "population") assert.equal(item.cityStateUpdates, 0, `${item.layer} 仍触发 city instance state`);
        assert.equal(item.localGpu, true, `${item.layer} 未走本地显示提交`); assert.ok(item.wallMs <= 50, `${item.layer} 响应 ${item.wallMs}ms 超过 50ms`);
        const registered = item.layer === "cities" && item.visible === true ? item.longTasks.filter(entry => entry.duration < 200) : [];
        assert.deepEqual(item.longTasks, registered, `${item.layer} 出现未登记 LongTask`);
      }
      assert.deepEqual(report.identity, {pointBuffer: true, pointRanges: true, overlay: true, labelItems: true, markerItems: true, militaryItems: true, cityItems: true, cityBuffer: true, picking: true});
      assert.deepEqual(report.parity, {mismatches: 0, maxDelta: 0}); assert.deepEqual(report.picking, {toggled: {cityHidden: true, markerShown: true, militaryShown: true}, restored: {cityShown: true, markerHidden: true, militaryHidden: true}});
    } else if (smooth) {
      assert.deepEqual(report.parity, {mismatches: 0, maxDelta: 0});
      assert.ok(report.correction.vertexCount > 0 && report.correction.segmentCount > 0, "平滑边界 correction 未安装");
      for (const item of report.operations) {
        assert.equal(item.workerRuns, 0, `${item.name} 仍调用 Worker`); assert.equal(item.surfaceRefreshes, 0, `${item.name} 仍重建 surface`); assert.equal(item.lineRefreshes, 0, `${item.name} 仍重建完整 line`);
        assert.equal(item.localGpu, true, `${item.name} 未走本地显示提交`); assert.deepEqual(item.longTasks, [], `${item.name} 出现 LongTask`);
      }
      const firstLimit = cellsTarget === 100000 ? 300 : 150, repeatLimit = cellsTarget === 100000 ? 100 : 75;
      assert.ok(report.operations[0].wallMs <= firstLimit, `首次平滑切换 ${report.operations[0].wallMs}ms 超过 ${firstLimit}ms`);
      assert.ok(report.operations[1].wallMs <= repeatLimit && report.operations[2].wallMs <= repeatLimit, "重复平滑切换超预算");
      assert.deepEqual(report.identity, {surface: true, correction: true, attributes: true, overlay: true, picking: true});
    } else if (display) { assert.deepEqual(report.operations.map(item => item.name), ["theme", "ocean", "labels", "routes"]);
      for (const item of report.operations) {
        for (const [key, label] of [["workerRuns", "Worker"], ["surfaceRefreshes", "surface"], ["overlayReplaces", "overlay"], ["pickingRefreshes", "picking"]]) assert.equal(item[key], 0, `${item.name} 仍触发 ${label}`);
        assert.equal(item.localGpu, true, `${item.name} 未走本地显示提交`);
        assert.deepEqual(item.longTasks, [], `${item.name} 出现 LongTask`);
        const limitMs = item.name === "theme" ? 150 : item.name === "ocean" ? 100 : 50;
        assert.ok(item.wallMs <= limitMs, `${item.name} 响应 ${item.wallMs}ms 超过 ${limitMs}ms`);
      }
      assert.deepEqual(report.parity, {theme: {mismatches: 0, maxDelta: 0}, ocean: {mismatches: 0, maxDelta: 0}, labels: false, routes: false}); assert.deepEqual(report.identity, {surface: true, overlay: true, picking: true, routeBuffer: true});
    } else if (political) {
      for (const item of report.operations) assert.deepEqual(item.pixelParity, {mismatches: 0, maxDelta: 0}, `${item.mode} shader framebuffer 与同图 Worker 基线不一致`);
    } else assert.deepEqual(Object.fromEntries(report.operations.map(item => [item.mode, item.checksum])), expectedChecksums, "335-D shader framebuffer 与旧 Worker 基线不一致");
    if (!contextRestore && !display && !smooth && !identity && !consistency) for (const item of report.operations) {
      assert.equal(item.workerRuns, 0, `${item.mode} 仍调用 Worker`);
      assert.equal(item.surfaceRefreshes, 0, `${item.mode} 仍重建 surface`);
      assert.deepEqual(item.identity, {surfaceSet: true, segments: true, alias: true, attributes: true, political: true, picking: true, overlay: true}, `${item.mode} 正式引用漂移`);
      assert.equal(item.selected, expectedLabels[item.mode], `${item.mode} 视图控件未与正式状态同源`);
      assert.equal(item.apiMode, item.mode, `${item.mode} API 状态未提交`);
      assert.equal(item.localGpu, true, `${item.mode} 未走 GPU 常驻属性路径`);
      assert.equal(item.surfaceMode, "gpu-cell-attributes", `${item.mode} renderer 未启用 GPU cell attributes`);
      assert.deepEqual(item.longTasks, [], `${item.mode} 出现 LongTask`);
    }
  }
  assert.deepEqual(report.final, {health: [], loading: false, glError: 0});
  const artifactName = verify ? "result.json" : "baseline.json";
  writeFileSync(join(outputDir, artifactName), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ok: true, verify, artifact: join(outputDir, artifactName), operations: report.operations}, null, 2));
} finally {
  await browser?.close();
  server.kill();
  await Promise.race([new Promise(done => server.once("exit", done)), new Promise(done => setTimeout(done, 5000))]);
}

async function run({verify, political, contextRestore, display, smooth, identity, consistency, cellsTarget}) {
  const app = window.__webglGeneratorApp, api = window.webglGeneratorApi;
  const unwrap = (response, label) => { if (!response?.ok) throw new Error(`${label}: ${response?.error?.code || "api_error"} ${response?.error?.message || ""}`); return response.data; };
  unwrap(await api.generate.newMap({confirm: true, seed: "task335-d-gpu-resident", cellsTarget, heightmapTemplate: "continents"}), "newMap");
  unwrap(await api.layers.setSmoothCellBorders(false), "disable smoothing");
  await drain();
  window.__webglGeneratorHealth?.clear?.();
  if (contextRestore) return runContextRestore();
  if (consistency) return runConsistency();
  if (identity) return runLayerIdentity();
  if (smooth) return runSmoothBorders();
  if (display) return runDisplayMutations();
  const renderer = app.renderer, coordinator = app.mapWorkerCoordinator;
  const originalRefresh = renderer.refreshCellSurface;
  let workerRuns = 0, surfaceRefreshes = 0;
  const wrappedCoordinator = Object.freeze({
    run(...args) { workerRuns++; return coordinator.run(...args); },
    commitSession: coordinator.commitSession.bind(coordinator), applySessionPatch: coordinator.applySessionPatch.bind(coordinator),
    invalidateSession: coordinator.invalidateSession.bind(coordinator), getSessionSnapshot: coordinator.getSessionSnapshot.bind(coordinator)
  });
  const wrappedRefresh = function(...args) { surfaceRefreshes++; return Reflect.apply(originalRefresh, this, args); };
  app.mapWorkerCoordinator = wrappedCoordinator;
  renderer.refreshCellSurface = wrappedRefresh;
  const politicalLegacy = new Map();
  if (political && verify) {
    const hadOwn = Object.hasOwn(renderer, "canPresentGpuResidentColorMode"), originalCanPresent = renderer.canPresentGpuResidentColorMode;
    renderer.canPresentGpuResidentColorMode = () => false;
    try {
      for (const mode of ["states", "provinces"]) {
        unwrap(await api.layers.setViewMode(mode), `${mode} legacy baseline`);
        await drain();
        const pixels = framebufferPixels(renderer);
        politicalLegacy.set(mode, {pixels, checksum: checksumPixels(pixels)});
        await drain();
      }
    } finally { if (hadOwn) renderer.canPresentGpuResidentColorMode = originalCanPresent; else delete renderer.canPresentGpuResidentColorMode; }
  }
  const baseline = {surfaceSet: renderer.surfaceBaseBufferSet, segments: renderer.surfaceBaseBufferSet.segments, alias: renderer.vertexBuffer, attributes: renderer.cellAttributeStore, political: renderer.politicalVisualMeshes, picking: renderer.objectPickingIndex, overlay: [...renderer.overlay.childNodes]};
  const operations = [];
  try {
    for (const mode of political ? ["states", "provinces"] : ["height", "biomes", "population"]) {
      const marks = {workerRuns, surfaceRefreshes}, operationLongTasks = [];
      const observer = new PerformanceObserver(list => operationLongTasks.push(...list.getEntries().map(entry => ({startTime: entry.startTime, duration: entry.duration, name: entry.name}))));
      observer.observe({type: "longtask", buffered: false});
      try {
        unwrap(await api.layers.setViewMode(mode), mode);
        await drain();
        operationLongTasks.push(...observer.takeRecords().map(entry => ({startTime: entry.startTime, duration: entry.duration, name: entry.name})));
      } finally { observer.disconnect(); }
      const stats = renderer.getStats(), selected = document.querySelector('[role="radiogroup"][aria-label="视图"] .el-segmented__item.is-selected .el-segmented__item-label')?.textContent?.trim() || "";
      const fingerprintStartedAt = performance.now(), pixels = framebufferPixels(renderer), checksum = checksumPixels(pixels), fingerprintMs = performance.now() - fingerprintStartedAt;
      const legacy = politicalLegacy.get(mode), pixelParity = legacy ? comparePixels(legacy.pixels, pixels) : null;
      politicalLegacy.delete(mode);
      await drain();
      operations.push({mode, checksum, legacyChecksum: legacy?.checksum ?? null, pixelParity, fingerprintMs, workerRuns: workerRuns - marks.workerRuns, surfaceRefreshes: surfaceRefreshes - marks.surfaceRefreshes, identity: {
        surfaceSet: renderer.surfaceBaseBufferSet === baseline.surfaceSet, segments: renderer.surfaceBaseBufferSet.segments === baseline.segments,
        alias: renderer.vertexBuffer === baseline.alias, attributes: renderer.cellAttributeStore === baseline.attributes, political: renderer.politicalVisualMeshes === baseline.political,
        picking: renderer.objectPickingIndex === baseline.picking, overlay: renderer.overlay.childNodes.length === baseline.overlay.length && baseline.overlay.every((node, index) => renderer.overlay.childNodes[index] === node)
      }, selected, apiMode: unwrap(api.layers.get(), `${mode} state`).colorMode, longTasks: operationLongTasks, localGpu: app.lastDisplayRenderWorker?.localGpu === true, surfaceMode: stats.surfaceColorMode || ""});
    }
  } finally {
    if (app.mapWorkerCoordinator === wrappedCoordinator) app.mapWorkerCoordinator = coordinator;
    if (renderer.refreshCellSurface === wrappedRefresh) renderer.refreshCellSurface = originalRefresh;
  }
  const health = unwrap(api.info.healthEvents({severity: "error", limit: 100}), "health"), runtime = unwrap(api.info.runtimeStats(), "runtime");
  return {verify, cells: app.map.grid.cells.i.length, operations, final: {health: health.events || [], loading: Boolean(runtime.loading.visible), glError: renderer.gl.getError()}};

  async function runContextRestore() {
    const renderer = app.renderer, modes = ["height", "biomes", "states"], baselines = new Map(), operations = [];
    for (const mode of modes) { unwrap(await api.layers.setViewMode(mode), `${mode} baseline`); await drain(); baselines.set(mode, framebufferPixels(renderer)); }
    const old = {program: renderer.program, surface: renderer.surfaceBaseBufferSet, attributes: renderer.cellAttributeStore, point: renderer.pointBuffer};
    const extension = renderer.gl.getExtension("WEBGL_lose_context"); if (!extension) throw new Error("浏览器不支持 WEBGL_lose_context");
    const longTasks = [], observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => ({startTime: entry.startTime, duration: entry.duration, name: entry.name})))); observer.observe({type: "longtask", buffered: false});
    try {
      await new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(new Error("WebGL context restore 超时")), 30_000); renderer.canvas.addEventListener("webglcontextrestored", async () => { try { if (renderer.webGlContextRestorePromise) await renderer.webGlContextRestorePromise; clearTimeout(timeout); resolve(); } catch (error) { reject(error); } }, {once: true}); extension.loseContext(); setTimeout(() => extension.restoreContext(), 50); });
      await drain(); longTasks.push(...observer.takeRecords().map(entry => ({startTime: entry.startTime, duration: entry.duration, name: entry.name})));
    } finally { observer.disconnect(); }
    for (const mode of modes) { unwrap(await api.layers.setViewMode(mode), `${mode} restored`); await drain(); operations.push({mode, pixelParity: comparePixels(baselines.get(mode), framebufferPixels(renderer))}); }
    const health = unwrap(api.info.healthEvents({severity: "error", limit: 100}), "health"), runtime = unwrap(api.info.runtimeStats(), "runtime");
    return {verify, cells: app.map.grid.cells.i.length, operations, restored: renderer.webGlContextLost === false && !renderer.lastWebGlContextRestoreError, referencesRecreated: renderer.program !== old.program && renderer.surfaceBaseBufferSet !== old.surface && renderer.cellAttributeStore !== old.attributes && renderer.pointBuffer !== old.point, longTasks, final: {health: health.events || [], loading: Boolean(runtime.loading.visible), glError: renderer.gl.getError()}};
  }

  function checksumPixels(pixels) {
    let hash = 2166136261;
    for (const value of pixels) hash = Math.imul((hash ^ value) >>> 0, 16777619) >>> 0;
    return hash;
  }
  function comparePixels(legacy, gpu) {
    let mismatches = 0, maxDelta = 0;
    for (let index = 0; index < legacy.length; index++) {
      const delta = Math.abs(legacy[index] - gpu[index]);
      if (!delta) continue;
      mismatches++; maxDelta = Math.max(maxDelta, delta);
    }
    return {mismatches, maxDelta};
  }
  function framebufferPixels(current) {
    const gl = current.gl, pixels = new Uint8Array(current.canvas.width * current.canvas.height * 4);
    current.draw({updateDynamicBuffers: false, updateOverlay: false});
    gl.readPixels(0, 0, current.canvas.width, current.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return pixels;
  }
  function drain() { return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 100)))); }

  async function runConsistency() {
    const renderer = app.renderer, original = app.mapWorkerCoordinator;
    unwrap(await api.layers.setViewMode("states"), "first states"); await drain();
    const first = {response: true, renderer: renderer.colorMode, api: unwrap(api.layers.get(), "first api").colorMode, active: document.querySelector(".ui-segmented-mode-bridge.active")?.dataset.mode || ""};
    const scaleBefore = renderer.camera.scale;
    const pending = [api.layers.setViewMode("height"), api.layers.setViewMode("provinces"), api.layers.setViewMode("biomes")];
    renderer.canvas.dispatchEvent(new WheelEvent("wheel", {deltaY: -120, clientX: 320, clientY: 240, bubbles: true, cancelable: true}));
    const rapidResponses = await Promise.all(pending); await drain();
    const rapid = {responses: rapidResponses.map(response => response.ok ? "ok" : response.error?.code || "error"), final: {renderer: renderer.colorMode, api: unwrap(api.layers.get(), "rapid api").colorMode, active: document.querySelector(".ui-segmented-mode-bridge.active")?.dataset.mode || ""}, cameraChanged: renderer.camera.scale !== scaleBefore};
    const initialCoastline = renderer.layerVisibility.coastline !== false;
    const commitRejected = await faultScenario("commit", !initialCoastline);
    const staleSession = await faultScenario("stale", initialCoastline);
    let mismatchRuns = 0, fallbackRuns = 0;
    const mismatchCoordinator = wrapCoordinator({run(...args) { mismatchRuns++; const error = new Error("页面与 Worker 构建版本不一致"); error.code = "worker_build_mismatch"; error.stage = "worker-handshake"; error.suggestion = "请先保存当前地图，然后刷新页面以加载同一版本。"; error.expected = true; error.details = {expectedBuildId: "current", actualBuildId: "stale"}; return Promise.reject(error); }});
    app.mapWorkerCoordinator = mismatchCoordinator;
    const mismatchResponse = await api.layers.setVisible("coastline", !initialCoastline); await drain();
    if (app.mapWorkerCoordinator === mismatchCoordinator) app.mapWorkerCoordinator = original;
    const buildMismatch = {code: mismatchResponse.error?.code || "", runCalls: mismatchRuns, statePreserved: renderer.layerVisibility.coastline === initialCoastline, fallbackRuns};
    const final = finalSignals();
    return {verify, cells: app.map.grid.cells.i.length, first, rapid, commitRejected, staleSession, buildMismatch, final};

    async function faultScenario(mode, target) {
      let runCalls = 0, faulted = false, commitCalls = 0;
      const wrapped = wrapCoordinator({run(...args) { runCalls++; if (mode === "stale" && !faulted) { faulted = true; const cause = Object.assign(new Error("stale session"), {code: "worker_protocol_session_stale"}); return Promise.reject(Object.assign(new Error("strict worker"), {code: "worker_fallback_disabled", cause})); } return original.run(...args); }, commitSession(...args) { commitCalls++; if (mode === "commit" && !faulted) { faulted = true; return Promise.resolve(false); } return original.commitSession(...args); }});
      app.mapWorkerCoordinator = wrapped;
      try { const response = await api.layers.setVisible("coastline", target); await drain(); return {ok: response.ok === true, runCalls, selfHealAttempts: app.lastDisplayRenderWorker?.selfHeal?.attempts || 0, finalState: renderer.layerVisibility.coastline === target}; }
      finally { if (app.mapWorkerCoordinator === wrapped) app.mapWorkerCoordinator = original; }
    }
    function wrapCoordinator(overrides = {}) { return Object.freeze({run: overrides.run || original.run.bind(original), commitSession: overrides.commitSession || original.commitSession.bind(original), applySessionPatch: original.applySessionPatch.bind(original), invalidateSession: original.invalidateSession.bind(original), getSessionSnapshot: original.getSessionSnapshot.bind(original)}); }
    function finalSignals() { const health = unwrap(api.info.healthEvents({severity: "error", limit: 100}), "health"), runtime = unwrap(api.info.runtimeStats(), "runtime"); return {health: health.events || [], loading: Boolean(runtime.loading.visible), glError: renderer.gl.getError()}; }
  }

  async function runLayerIdentity() {
    const renderer = app.renderer, coordinator = app.mapWorkerCoordinator, layers = ["cities", "population", "markers", "resources", "military"];
    await new Promise(resolve => setTimeout(resolve, 250)); await drain();
    const initialVisibility = Object.fromEntries(layers.map(layer => [layer, renderer.layerVisibility[layer] !== false]));
    const baselinePixels = framebufferPixels(renderer), baseline = {pointBuffer: renderer.pointBuffer, pointRanges: renderer.pointDrawRanges, overlay: [...renderer.overlay.childNodes], labelItems: [...renderer.labelItems], markerItems: [...renderer.markerIconItems], militaryItems: [...renderer.militaryIconItems], cityItems: [...renderer.cityIconItems], cityBuffer: renderer.cityIconLayer.instanceBuffer, picking: renderer.objectPickingIndex};
    const originalPoint = renderer.refreshPointLayers, originalPicking = renderer.refreshObjectPickingIndex, originalReplace = renderer.overlay.replaceChildren.bind(renderer.overlay), originalCities = renderer.cityIconLayer.setInstances, originalCityStates = renderer.cityIconLayer.updateInstanceStates;
    let workerRuns = 0, pointRefreshes = 0, overlayReplaces = 0, pickingRefreshes = 0, cityInstalls = 0, cityStateUpdates = 0;
    const wrappedCoordinator = Object.freeze({run(...args) { workerRuns++; return coordinator.run(...args); }, commitSession: coordinator.commitSession.bind(coordinator), applySessionPatch: coordinator.applySessionPatch.bind(coordinator), invalidateSession: coordinator.invalidateSession.bind(coordinator), getSessionSnapshot: coordinator.getSessionSnapshot.bind(coordinator)});
    app.mapWorkerCoordinator = wrappedCoordinator; renderer.refreshPointLayers = function(...args) { pointRefreshes++; return Reflect.apply(originalPoint, this, args); }; renderer.refreshObjectPickingIndex = function(...args) { pickingRefreshes++; return Reflect.apply(originalPicking, this, args); }; renderer.overlay.replaceChildren = function(...args) { overlayReplaces++; return originalReplace(...args); }; renderer.cityIconLayer.setInstances = function(...args) { cityInstalls++; return Reflect.apply(originalCities, this, args); }; renderer.cityIconLayer.updateInstanceStates = function(...args) { cityStateUpdates++; return Reflect.apply(originalCityStates, this, args); };
    const operations = [];
    try {
      for (const layer of layers) await operation(layer, !initialVisibility[layer]);
      const toggledPicking = {city: pickKind(renderer.cityIconItems[0], "cityObject"), marker: pickKind(renderer.markerIconItems[0], "marker"), military: pickKind(renderer.militaryIconItems[0], "military")};
      for (const layer of layers) await operation(layer, initialVisibility[layer]);
      for (const layer of layers) if (unwrap(api.layers.get(), `${layer} state`).layers[layer] !== initialVisibility[layer]) throw new Error(`${layer} 最终状态未恢复`);
      const restoredPicking = {city: pickKind(renderer.cityIconItems[0], "cityObject"), marker: pickKind(renderer.markerIconItems[0], "marker"), military: pickKind(renderer.militaryIconItems[0], "military")};
      const finalPixels = framebufferPixels(renderer), identityResult = {pointBuffer: renderer.pointBuffer === baseline.pointBuffer, pointRanges: renderer.pointDrawRanges === baseline.pointRanges, overlay: sameRefs(renderer.overlay.childNodes, baseline.overlay), labelItems: sameRefs(renderer.labelItems, baseline.labelItems), markerItems: sameRefs(renderer.markerIconItems, baseline.markerItems), militaryItems: sameRefs(renderer.militaryIconItems, baseline.militaryItems), cityItems: sameRefs(renderer.cityIconItems, baseline.cityItems), cityBuffer: renderer.cityIconLayer.instanceBuffer === baseline.cityBuffer, picking: renderer.objectPickingIndex === baseline.picking};
      return {verify, cells: app.map.grid.cells.i.length, operations, identity: identityResult, parity: comparePixels(baselinePixels, finalPixels), picking: {toggled: {cityHidden: toggledPicking.city === null, markerShown: toggledPicking.marker !== null, militaryShown: toggledPicking.military !== null}, restored: {cityShown: restoredPicking.city !== null, markerHidden: restoredPicking.marker === null, militaryHidden: restoredPicking.military === null}}, final: finalSignals()};
    } finally { if (app.mapWorkerCoordinator === wrappedCoordinator) app.mapWorkerCoordinator = coordinator; renderer.refreshPointLayers = originalPoint; renderer.refreshObjectPickingIndex = originalPicking; renderer.overlay.replaceChildren = originalReplace; renderer.cityIconLayer.setInstances = originalCities; renderer.cityIconLayer.updateInstanceStates = originalCityStates; }
    function pickKind(item, key) { if (!item) return null; const rect = renderer.canvas.getBoundingClientRect(), point = renderer.worldToScreen(item.x, item.y, rect); return renderer.pickClientPoint(rect.left + point.x, rect.top + point.y)?.[key]?.id ?? null; }
    async function operation(layer, visible) { const before = {workerRuns, pointRefreshes, overlayReplaces, pickingRefreshes, cityInstalls, cityStateUpdates}, longTasks = [], observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => ({startTime: entry.startTime, duration: entry.duration, name: entry.name})))); observer.observe({type: "longtask", buffered: false}); const startedAt = performance.now(); let wallMs; try { unwrap(await api.layers.setVisible(layer, visible), `${layer}:${visible}`); wallMs = performance.now() - startedAt; await drain(); longTasks.push(...observer.takeRecords().map(entry => ({startTime: entry.startTime, duration: entry.duration, name: entry.name}))); } finally { observer.disconnect(); } operations.push({layer, visible, wallMs, workerRuns: workerRuns - before.workerRuns, pointRefreshes: pointRefreshes - before.pointRefreshes, overlayReplaces: overlayReplaces - before.overlayReplaces, pickingRefreshes: pickingRefreshes - before.pickingRefreshes, cityInstalls: cityInstalls - before.cityInstalls, cityStateUpdates: cityStateUpdates - before.cityStateUpdates, localGpu: app.lastDisplayRenderWorker?.localGpu === true, draw: {...renderer.lastDraw}, overlay: {...renderer.lastOverlayUpdate}, longTasks}); }
    function sameRefs(current, before) { return current.length === before.length && before.every((item, index) => current[index] === item); }
    function finalSignals() { const health = unwrap(api.info.healthEvents({severity: "error", limit: 100}), "health"), runtime = unwrap(api.info.runtimeStats(), "runtime"); return {health: health.events || [], loading: Boolean(runtime.loading.visible), glError: renderer.gl.getError()}; }
  }

  async function runSmoothBorders() {
    const renderer = app.renderer, coordinator = app.mapWorkerCoordinator;
    const ownGate = Object.hasOwn(renderer, "canApplyGpuResidentSmoothCellBorders"), originalGate = renderer.canApplyGpuResidentSmoothCellBorders;
    renderer.canApplyGpuResidentSmoothCellBorders = () => false;
    let legacyPixels;
    try { unwrap(await api.layers.setSmoothCellBorders(true), "legacy smooth baseline"); await drain(); legacyPixels = framebufferPixels(renderer); unwrap(await api.layers.setSmoothCellBorders(false), "legacy hard restore"); await drain(); }
    finally { if (ownGate) renderer.canApplyGpuResidentSmoothCellBorders = originalGate; else delete renderer.canApplyGpuResidentSmoothCellBorders; }
    const baseline = {surface: renderer.surfaceBaseBufferSet, correction: renderer.cellVisualCorrectionBufferSet, attributes: renderer.cellAttributeStore, overlay: [...renderer.overlay.childNodes], picking: renderer.objectPickingIndex};
    const originalRefresh = renderer.refreshCellSurface, originalLines = renderer.refreshLineLayers; let workerRuns = 0, surfaceRefreshes = 0, lineRefreshes = 0;
    const wrappedCoordinator = Object.freeze({run(...args) { workerRuns++; return coordinator.run(...args); }, commitSession: coordinator.commitSession.bind(coordinator), applySessionPatch: coordinator.applySessionPatch.bind(coordinator), invalidateSession: coordinator.invalidateSession.bind(coordinator), getSessionSnapshot: coordinator.getSessionSnapshot.bind(coordinator)});
    app.mapWorkerCoordinator = wrappedCoordinator; renderer.refreshCellSurface = function(...args) { surfaceRefreshes++; return Reflect.apply(originalRefresh, this, args); }; renderer.refreshLineLayers = function(...args) { lineRefreshes++; return Reflect.apply(originalLines, this, args); };
    const operations = [];
    try {
      await operation("enable-first", true); const parity = comparePixels(legacyPixels, framebufferPixels(renderer)); await operation("disable", false); await operation("enable-repeat", true);
      const stats = renderer.getStats(), state = unwrap(api.layers.get(), "smooth state");
      return {verify, cells: app.map.grid.cells.i.length, operations, parity, correction: stats.cellVisualCorrectionBuffers, smooth: state.display.smoothCellBorders, identity: {surface: renderer.surfaceBaseBufferSet === baseline.surface, correction: renderer.cellVisualCorrectionBufferSet === baseline.correction, attributes: renderer.cellAttributeStore === baseline.attributes, overlay: renderer.overlay.childNodes.length === baseline.overlay.length && baseline.overlay.every((node, index) => renderer.overlay.childNodes[index] === node), picking: renderer.objectPickingIndex === baseline.picking}, final: finalSignals()};
    } finally { if (app.mapWorkerCoordinator === wrappedCoordinator) app.mapWorkerCoordinator = coordinator; renderer.refreshCellSurface = originalRefresh; renderer.refreshLineLayers = originalLines; }
    async function operation(name, enabled) { const before = {workerRuns, surfaceRefreshes, lineRefreshes}, longTasks = [], observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => ({startTime: entry.startTime, duration: entry.duration, name: entry.name})))); observer.observe({type: "longtask", buffered: false}); const startedAt = performance.now(); let wallMs; try { unwrap(await api.layers.setSmoothCellBorders(enabled), name); wallMs = performance.now() - startedAt; await drain(); longTasks.push(...observer.takeRecords().map(entry => ({startTime: entry.startTime, duration: entry.duration, name: entry.name}))); } finally { observer.disconnect(); } operations.push({name, wallMs, workerRuns: workerRuns - before.workerRuns, surfaceRefreshes: surfaceRefreshes - before.surfaceRefreshes, lineRefreshes: lineRefreshes - before.lineRefreshes, localGpu: app.lastDisplayRenderWorker?.localGpu === true, longTasks}); }
    function finalSignals() { const health = unwrap(api.info.healthEvents({severity: "error", limit: 100}), "health"), runtime = unwrap(api.info.runtimeStats(), "runtime"); return {health: health.events || [], loading: Boolean(runtime.loading.visible), glError: renderer.gl.getError()}; }
  }

  async function runDisplayMutations() {
    const renderer = app.renderer, coordinator = app.mapWorkerCoordinator;
    const ownTheme = Object.hasOwn(renderer, "canApplyGpuResidentVisualTheme"), ownOcean = Object.hasOwn(renderer, "canApplyGpuResidentOceanHeight"), originalThemeGate = renderer.canApplyGpuResidentVisualTheme, originalOceanGate = renderer.canApplyGpuResidentOceanHeight;
    renderer.canApplyGpuResidentVisualTheme = () => false; renderer.canApplyGpuResidentOceanHeight = () => false;
    let themePixels, oceanPixels, themeLabels;
    try {
      unwrap(await api.layers.setTheme("ancient"), "legacy theme"); unwrap(await api.layers.setShowOceanHeight(true), "legacy ocean"); await drain(); oceanPixels = framebufferPixels(renderer);
      unwrap(await api.layers.setShowOceanHeight(false), "legacy ocean restore"); await drain(); themePixels = framebufferPixels(renderer); themeLabels = labelThemeSignature(renderer);
      unwrap(await api.layers.setTheme("default"), "legacy theme restore"); await drain();
    } finally {
      if (ownTheme) renderer.canApplyGpuResidentVisualTheme = originalThemeGate; else delete renderer.canApplyGpuResidentVisualTheme;
      if (ownOcean) renderer.canApplyGpuResidentOceanHeight = originalOceanGate; else delete renderer.canApplyGpuResidentOceanHeight;
    }
    const baseline = {surface: renderer.surfaceBaseBufferSet, overlay: [...renderer.overlay.childNodes], picking: renderer.objectPickingIndex, routeBuffer: renderer.routeBuffer};
    const originalRefresh = renderer.refreshCellSurface, originalPicking = renderer.refreshObjectPickingIndex, originalReplace = renderer.overlay.replaceChildren.bind(renderer.overlay);
    let workerRuns = 0, surfaceRefreshes = 0, overlayReplaces = 0, pickingRefreshes = 0;
    const wrappedCoordinator = Object.freeze({run(...args) { workerRuns++; return coordinator.run(...args); }, commitSession: coordinator.commitSession.bind(coordinator),
      applySessionPatch: coordinator.applySessionPatch.bind(coordinator), invalidateSession: coordinator.invalidateSession.bind(coordinator), getSessionSnapshot: coordinator.getSessionSnapshot.bind(coordinator)});
    app.mapWorkerCoordinator = wrappedCoordinator;
    renderer.refreshCellSurface = function(...args) { surfaceRefreshes++; return Reflect.apply(originalRefresh, this, args); }; renderer.refreshObjectPickingIndex = function(...args) { pickingRefreshes++; return Reflect.apply(originalPicking, this, args); }; renderer.overlay.replaceChildren = function(...args) { overlayReplaces++; return originalReplace(...args); };
    const operations = [];
    try {
      await operation("theme", () => api.layers.setTheme("ancient")); const themeActual = framebufferPixels(renderer);
      if (labelThemeSignature(renderer) !== themeLabels) throw new Error("主题标签样式未与 Worker 基线同源");
      await operation("ocean", () => api.layers.setShowOceanHeight(true)); const oceanActual = framebufferPixels(renderer);
      await operation("labels", () => api.layers.setVisible("labels", false)); await operation("routes", () => api.layers.setVisible("routes", false));
      const snapshot = unwrap(api.layers.get(), "display state");
      return {verify, cells: app.map.grid.cells.i.length, operations, parity: {theme: comparePixels(themePixels, themeActual), ocean: comparePixels(oceanPixels, oceanActual), labels: snapshot.layers.labels, routes: snapshot.layers.routes},
        identity: {surface: renderer.surfaceBaseBufferSet === baseline.surface, overlay: renderer.overlay.childNodes.length === baseline.overlay.length && baseline.overlay.every((node, index) => renderer.overlay.childNodes[index] === node), picking: renderer.objectPickingIndex === baseline.picking, routeBuffer: renderer.routeBuffer === baseline.routeBuffer}, final: finalSignals()};
    } finally {
      if (app.mapWorkerCoordinator === wrappedCoordinator) app.mapWorkerCoordinator = coordinator;
      renderer.refreshCellSurface = originalRefresh; renderer.refreshObjectPickingIndex = originalPicking; renderer.overlay.replaceChildren = originalReplace; }
    async function operation(name, task) { await new Promise(done => setTimeout(done, 0));
      const before = {workerRuns, surfaceRefreshes, overlayReplaces, pickingRefreshes}, longTasks = [];
      const observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => ({startTime: entry.startTime, duration: entry.duration, name: entry.name})))); observer.observe({type: "longtask", buffered: false});
      const startedAt = performance.now(); let wallMs;
      try { unwrap(await task(), name); wallMs = performance.now() - startedAt; await drain(); longTasks.push(...observer.takeRecords().map(entry => ({startTime: entry.startTime, duration: entry.duration, name: entry.name}))); } finally { observer.disconnect(); }
      operations.push({name, wallMs, workerRuns: workerRuns - before.workerRuns, surfaceRefreshes: surfaceRefreshes - before.surfaceRefreshes, overlayReplaces: overlayReplaces - before.overlayReplaces, pickingRefreshes: pickingRefreshes - before.pickingRefreshes, localGpu: app.lastDisplayRenderWorker?.localGpu === true, longTasks, performance: renderer.getPerformanceEvents({includeRecent: true})});
    }
    function labelThemeSignature(current) { return JSON.stringify(current.labelItems.map(item => item.resolvedStyle)); }
    function finalSignals() { const health = unwrap(api.info.healthEvents({severity: "error", limit: 100}), "health"), runtime = unwrap(api.info.runtimeStats(), "runtime"); return {health: health.events || [], loading: Boolean(runtime.loading.visible), glError: renderer.gl.getError()}; }
  }
}

async function waitServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try { if ((await fetch("http://127.0.0.1:5583")).ok) return; } catch {}
    await new Promise(done => setTimeout(done, 100));
  }
  throw new Error("335-D 测试服务启动超时");
}
