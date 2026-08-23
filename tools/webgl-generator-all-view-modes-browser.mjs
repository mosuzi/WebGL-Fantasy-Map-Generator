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
const requestedCells = Number(process.argv.find(value => value.startsWith("--cells="))?.slice(8) || 10_000);
const diagnoseStateCold = process.argv.includes("--diagnose-state-cold");
if (requestedCells !== 10_000 && requestedCells !== 100_000) throw new Error("--cells 仅支持 10000 或 100000");
const port = 5586;
const outputDir = join(root, "work", `task351-all-view-modes-${requestedCells}`);
const server = spawn(process.execPath, [join(root, "tools", "serve-prototype.mjs"), "--host", "127.0.0.1", "--port", String(port), "--dir", join(root, "dist", "webgl-generator")], {stdio: "ignore"});
const playwright = createRequire(join(source, "package.json"))("playwright");
let browser;

try {
  await waitServer();
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const page = await browser.newPage({viewport: {width: 1280, height: 820}});
  page.setDefaultTimeout(900_000);
  const consoleErrors = [], pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 900_000);
  const report = await page.evaluate(runAllModes, {requestedCells, diagnoseStateCold});
  const performanceErrors = consoleErrors.filter(text => /\[FMG health\] (operation-stall|main-thread-long-task|render-frame-gap|input-handler-stall)/u.test(text));
  const applicationErrors = consoleErrors.filter(text => !performanceErrors.includes(text));
  const result = {...report, console: {applicationErrors, performanceErrors, pageErrors}};
  mkdirSync(outputDir, {recursive: true});
  writeFileSync(join(outputDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  if (diagnoseStateCold) {
    console.log(JSON.stringify({ok: true, diagnostic: true, artifact: join(outputDir, "result.json"), entry: result.cold[0]}, null, 2));
    process.exitCode = 0;
  } else {
  assert.deepEqual(applicationErrors, [], "十二类视图出现应用 console.error");
  assert.deepEqual(pageErrors, [], "十二类视图出现 pageerror");
  assert.deepEqual(result.health, [], "十二类视图出现 health error");
  assert.equal(result.loadingVisible, false, "十二类视图结束后仍有 Loading");
  assert.equal(result.glError, 0, "十二类视图出现 WebGL error");
  assert.equal(result.cold.length, 12);
  assert.equal(result.warm.length, 12);
  for (const entry of [...result.cold, ...result.warm]) {
    assert.equal(entry.ok, true, `${entry.pass}:${entry.mode} 切换失败`);
    assert.equal(entry.rendererMode, entry.mode, `${entry.pass}:${entry.mode} renderer 未收敛`);
    assert.equal(entry.apiMode, entry.mode, `${entry.pass}:${entry.mode} API 未收敛`);
    assert.equal(entry.localGpu, true, `${entry.pass}:${entry.mode} 未使用本地 GPU 常驻路径`);
    assert.deepEqual(entry.workerPackets, {input: 0, output: 0}, `${entry.pass}:${entry.mode} 不得发送 Worker 数据包`);
    assert.deepEqual(entry.rebuilds, {surface: 0, line: 0, picking: 0, labels: 0}, `${entry.pass}:${entry.mode} 触发了完整资源重建`);
    assert.equal(entry.referencesStable, true, `${entry.pass}:${entry.mode} 替换了正式 geometry / picking / attribute owner`);
    assert.deepEqual(entry.longTasks, [], `${entry.pass}:${entry.mode} 出现 LongTask`);
  }
  const coldLimit = requestedCells === 100_000 ? 150 : 100;
  const warmLimit = requestedCells === 100_000 ? 50 : 40;
  for (const entry of result.cold) assert.ok(entry.wallMs <= coldLimit, `cold ${entry.mode} ${entry.wallMs}ms 超过 ${coldLimit}ms`);
  for (const entry of result.warm) assert.ok(entry.wallMs <= warmLimit, `warm ${entry.mode} ${entry.wallMs}ms 超过 ${warmLimit}ms`);
  console.log(JSON.stringify({ok: true, artifact: join(outputDir, "result.json"), cells: result.cells, cold: result.cold.map(({mode, wallMs}) => ({mode, wallMs})), warm: result.warm.map(({mode, wallMs}) => ({mode, wallMs}))}, null, 2));
  }
} finally {
  await browser?.close();
  server.kill();
  await Promise.race([new Promise(resolve => server.once("exit", resolve)), delay(5000)]);
}

async function runAllModes({requestedCells, diagnoseStateCold}) {
  const api = window.webglGeneratorApi;
  const app = window.__webglGeneratorApp;
  const unwrap = (response, label) => {
    if (!response?.ok) throw new Error(`${label}: ${response?.error?.code || "api_error"} ${response?.error?.message || ""}`);
    return response.data;
  };
  unwrap(await api.generate.newMap({confirm: true, seed: `task351-all-views-${requestedCells}`, cellsTarget: requestedCells, heightmapTemplate: "continents"}), "newMap");
  await drain();
  const prewarmDeadline = performance.now() + 60_000;
  while (app.viewPrewarmScheduler?.getSnapshot?.().status !== "ready" && performance.now() < prewarmDeadline) await new Promise(resolve => setTimeout(resolve, 25));
  const prewarm = {...(app.viewPrewarmScheduler?.getSnapshot?.() || {}), stats: structuredClone(app.viewPrewarmStats || null)};
  if (prewarm.status !== "ready") throw new Error(`视图预热未在时限内 ready：${JSON.stringify(prewarm)}`);
  window.__webglGeneratorHealth?.clear?.();
  const modes = diagnoseStateCold ? ["states"] : ["states", "provinces", "biomes", "population", "temperature", "precipitation", "cultures", "religions", "regions", "governments", "diplomacy", "height"];
  const calls = {surface: 0, line: 0, picking: 0, labels: 0};
  const spans = [];
  const restores = [];
  for (const [method, key] of [["refreshCellSurface", "surface"], ["refreshLineLayers", "line"], ["refreshObjectPickingIndex", "picking"], ["refreshLabels", "labels"]]) {
    const original = app.renderer[method];
    const wrapped = function(...args) { calls[key]++; return Reflect.apply(original, this, args); };
    app.renderer[method] = wrapped;
    restores.push(() => { if (app.renderer[method] === wrapped) app.renderer[method] = original; });
  }
  for (const method of ["setColorMode", "refreshGpuResidentShoreSurface", "draw"]) {
    const original = app.renderer[method];
    const wrapped = function(...args) {
      const startedAt = performance.now();
      try { return Reflect.apply(original, this, args); }
      finally { spans.push({method, ms: Math.round((performance.now() - startedAt) * 10) / 10}); }
    };
    app.renderer[method] = wrapped;
    restores.push(() => { if (app.renderer[method] === wrapped) app.renderer[method] = original; });
  }
  const longTasks = [];
  const observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => ({startTime: entry.startTime, duration: Math.round(entry.duration * 10) / 10}))));
  observer.observe({type: "longtask", buffered: false});
  const cold = [], warm = [];
  try {
    for (const [pass, target] of (diagnoseStateCold ? [["cold", cold]] : [["cold", cold], ["warm", warm]])) {
      for (const mode of modes) target.push(await switchMode(pass, mode));
    }
  } finally {
    observer.disconnect();
    restores.reverse().forEach(restore => restore());
  }
  const health = unwrap(api.info.healthEvents({severity: "error", limit: 100}), "health").events || [];
  const runtime = unwrap(api.info.runtimeStats(), "runtime");
  return {cells: app.map.grid.cells.i.length, prewarm, cold, warm, health, loadingVisible: runtime.loading.visible, glError: app.renderer.getStats().draw?.glError ?? app.renderer.lastDraw?.glError ?? 0};

  async function switchMode(pass, mode) {
    await drain();
    const longTaskStart = longTasks.length;
    const spanStart = spans.length;
    const beforeCalls = {...calls};
    const references = {
      map: app.map, rendererMap: app.renderer.map, surface: app.renderer.surfaceBaseBufferSet,
      correction: app.renderer.cellVisualCorrectionBufferSet, picking: app.renderer.objectPickingIndex,
      attributes: app.renderer.cellAttributeStore, owner: app.renderer.surfaceResourceOwner
    };
    const startedAt = performance.now();
    const response = await api.layers.setViewMode(mode);
    const wallMs = Math.round((performance.now() - startedAt) * 10) / 10;
    const data = unwrap(response, `${pass}:${mode}`);
    const evidence = app.lastDisplayRenderWorker;
    const apiMode = unwrap(api.layers.get(), `${pass}:${mode}:get`).colorMode;
    const referencesStable = references.map === app.map && references.rendererMap === app.renderer.map
      && references.surface === app.renderer.surfaceBaseBufferSet && references.correction === app.renderer.cellVisualCorrectionBufferSet
      && references.picking === app.renderer.objectPickingIndex && references.attributes === app.renderer.cellAttributeStore
      && references.owner === app.renderer.surfaceResourceOwner;
    return {
      pass, mode, ok: data?.colorMode === mode || app.renderer.colorMode === mode, wallMs,
      rendererMode: app.renderer.colorMode, apiMode, localGpu: evidence?.localGpu === true,
      workerPackets: {input: evidence?.worker?.telemetry?.inputPackets ?? -1, output: evidence?.worker?.telemetry?.outputPackets ?? -1},
      rebuilds: {surface: calls.surface - beforeCalls.surface, line: calls.line - beforeCalls.line, picking: calls.picking - beforeCalls.picking, labels: calls.labels - beforeCalls.labels},
      referencesStable,
      longTasks: longTasks.slice(longTaskStart), spans: spans.slice(spanStart)
    };
  }

  function drain() { return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 40)))); }
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
