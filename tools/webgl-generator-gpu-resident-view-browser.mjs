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
const outputDir = join(root, "work", "task335-d-gpu-resident-views-10000");
const verify = process.argv.includes("--verify");
const expectedChecksums = Object.freeze({height: 2949860715, biomes: 1641731067, population: 2261249289});
const expectedLabels = Object.freeze({height: "高度", biomes: "生物群系", population: "人口"});
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
  const report = await page.evaluate(run, {verify});
  mkdirSync(outputDir, {recursive: true});
  writeFileSync(join(outputDir, "attempt.json"), `${JSON.stringify(report, null, 2)}\n`);
  const applicationErrors = consoleErrors.filter(text => !/\[FMG health\] (operation-stall|main-thread-long-task|render-frame-gap|input-handler-stall)/.test(text));
  assert.deepEqual(applicationErrors, []);
  assert.deepEqual(pageErrors, []);
  if (verify) {
    assert.equal(report.cells, 10004, "335-D 固定 10k 地图规模漂移");
    assert.deepEqual(Object.fromEntries(report.operations.map(item => [item.mode, item.checksum])), expectedChecksums, "335-D shader framebuffer 与旧 Worker 基线不一致");
    for (const item of report.operations) {
      assert.equal(item.workerRuns, 0, `${item.mode} 仍调用 Worker`);
      assert.equal(item.surfaceRefreshes, 0, `${item.mode} 仍重建 surface`);
      assert.deepEqual(item.identity, {surfaceSet: true, segments: true, alias: true, attributes: true, picking: true, overlay: true}, `${item.mode} 正式引用漂移`);
      assert.equal(item.selected, expectedLabels[item.mode], `${item.mode} 视图控件未与正式状态同源`);
      assert.equal(item.apiMode, item.mode, `${item.mode} API 状态未提交`);
      assert.equal(item.localGpu, true, `${item.mode} 未走 GPU 常驻属性路径`);
      assert.equal(item.surfaceMode, "gpu-cell-attributes", `${item.mode} renderer 未启用 GPU cell attributes`);
      assert.deepEqual(item.longTasks, [], `${item.mode} 出现 LongTask`);
    }
  }
  assert.deepEqual(report.final, {health: [], loading: false, glError: 0});
  writeFileSync(join(outputDir, verify ? "result.json" : "baseline.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ok: true, verify, artifact: join(outputDir, verify ? "result.json" : "baseline.json"), operations: report.operations}, null, 2));
} finally {
  await browser?.close();
  server.kill();
  await Promise.race([new Promise(done => server.once("exit", done)), new Promise(done => setTimeout(done, 5000))]);
}

async function run({verify}) {
  const app = window.__webglGeneratorApp, api = window.webglGeneratorApi;
  const unwrap = (response, label) => { if (!response?.ok) throw new Error(`${label}: ${response?.error?.code || "api_error"} ${response?.error?.message || ""}`); return response.data; };
  unwrap(await api.generate.newMap({confirm: true, seed: "task335-d-gpu-resident", cellsTarget: 10000, heightmapTemplate: "continents"}), "newMap");
  unwrap(await api.layers.setSmoothCellBorders(false), "disable smoothing");
  await drain();
  window.__webglGeneratorHealth?.clear?.();
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
  const baseline = {surfaceSet: renderer.surfaceBaseBufferSet, segments: renderer.surfaceBaseBufferSet.segments, alias: renderer.vertexBuffer, attributes: renderer.cellAttributeStore, picking: renderer.objectPickingIndex, overlay: [...renderer.overlay.childNodes]};
  const operations = [];
  try {
    for (const mode of ["height", "biomes", "population"]) {
      const marks = {workerRuns, surfaceRefreshes}, operationLongTasks = [];
      const observer = new PerformanceObserver(list => operationLongTasks.push(...list.getEntries().map(entry => ({startTime: entry.startTime, duration: entry.duration, name: entry.name}))));
      observer.observe({type: "longtask", buffered: false});
      try {
        unwrap(await api.layers.setViewMode(mode), mode);
        await drain();
        operationLongTasks.push(...observer.takeRecords().map(entry => ({startTime: entry.startTime, duration: entry.duration, name: entry.name})));
      } finally { observer.disconnect(); }
      const stats = renderer.getStats(), selected = document.querySelector('[role="radiogroup"][aria-label="视图"] .el-segmented__item.is-selected .el-segmented__item-label')?.textContent?.trim() || "";
      const fingerprintStartedAt = performance.now(), checksum = framebufferChecksum(renderer), fingerprintMs = performance.now() - fingerprintStartedAt;
      await drain();
      operations.push({mode, checksum, fingerprintMs, workerRuns: workerRuns - marks.workerRuns, surfaceRefreshes: surfaceRefreshes - marks.surfaceRefreshes, identity: {
        surfaceSet: renderer.surfaceBaseBufferSet === baseline.surfaceSet, segments: renderer.surfaceBaseBufferSet.segments === baseline.segments,
        alias: renderer.vertexBuffer === baseline.alias, attributes: renderer.cellAttributeStore === baseline.attributes,
        picking: renderer.objectPickingIndex === baseline.picking, overlay: renderer.overlay.childNodes.length === baseline.overlay.length && baseline.overlay.every((node, index) => renderer.overlay.childNodes[index] === node)
      }, selected, apiMode: unwrap(api.layers.get(), `${mode} state`).colorMode, longTasks: operationLongTasks, localGpu: app.lastDisplayRenderWorker?.localGpu === true, surfaceMode: stats.surfaceColorMode || ""});
    }
  } finally {
    if (app.mapWorkerCoordinator === wrappedCoordinator) app.mapWorkerCoordinator = coordinator;
    if (renderer.refreshCellSurface === wrappedRefresh) renderer.refreshCellSurface = originalRefresh;
  }
  const health = unwrap(api.info.healthEvents({severity: "error", limit: 100}), "health"), runtime = unwrap(api.info.runtimeStats(), "runtime");
  return {verify, cells: app.map.grid.cells.i.length, operations, final: {health: health.events || [], loading: Boolean(runtime.loading.visible), glError: renderer.gl.getError()}};

  function framebufferChecksum(current) {
    const gl = current.gl, pixels = new Uint8Array(current.canvas.width * current.canvas.height * 4);
    current.draw({updateDynamicBuffers: false, updateOverlay: false});
    gl.readPixels(0, 0, current.canvas.width, current.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let hash = 2166136261;
    for (const value of pixels) hash = Math.imul((hash ^ value) >>> 0, 16777619) >>> 0;
    return hash;
  }
  function drain() { return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 100)))); }
}

async function waitServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try { if ((await fetch("http://127.0.0.1:5583")).ok) return; } catch {}
    await new Promise(done => setTimeout(done, 100));
  }
  throw new Error("335-D 测试服务启动超时");
}
