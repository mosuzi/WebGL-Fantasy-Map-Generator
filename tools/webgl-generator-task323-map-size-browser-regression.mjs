#!/usr/bin/env node
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {MAP_CELLS_MAX, normalizeMapCellTarget} from "../app/webgl-generator/src/generator/map-size.js";
import {assertMapDocumentCellLimit} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {normalizeRuntimeOperationError} from "../app/webgl-generator/src/runtime/runtime-operation.js";
import {restoreWorkerTaskError, serializeWorkerTaskError} from "../app/webgl-generator/src/runtime/worker-task-protocol.js";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

for (const [input, expected] of [[-1, 1], [0, 1], [1, 1], [99_999, 99_999], [100_000, 100_000], [100_001, 100_000], [200_000, 100_000]]) {
  assert.equal(normalizeMapCellTarget(input), expected);
}
const rawLimitError = captureError(() => assertMapDocumentCellLimit({grid: {points: {length: MAP_CELLS_MAX + 1}}}));
const restoredLimitError = normalizeRuntimeOperationError(restoreWorkerTaskError(serializeWorkerTaskError(rawLimitError)));
assert.deepEqual({code: restoredLimitError.code, stage: restoredLimitError.stage, expected: restoredLimitError.expected, actual: restoredLimitError.details.actualCells}, {code: "map-cell-limit-exceeded", stage: "map-import-validate", expected: true, actual: 100_001});
assert.equal(assertMapDocumentCellLimit({grid: {cells: {h: {length: 3}}}}), 3);

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const distDir = join(rootDir, "dist", "webgl-generator");
const host = "127.0.0.1";
const port = 5563;
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const server = spawn(process.execPath, [join(rootDir, "tools", "serve-prototype.mjs"), "--host", host, "--port", String(port), "--dir", distDir], {stdio: "ignore"});
let browser;
let context;

try {
  await waitForServer(server);
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  context = await browser.newContext({viewport: {width: 1280, height: 820}, deviceScaleFactor: 1});
  const page = await context.newPage();
  page.setDefaultTimeout(300_000);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 300_000);
  const consoleStart = consoleErrors.length;
  const report = await page.evaluate(async () => {
    const api = window.webglGeneratorApi;
    const app = window.__webglGeneratorApp;
    const input = document.getElementById("cells-input");
    const trace = {longTasks: [], technicalCopy: []};
    const pendingLongTasks = [];
    const observer = new PerformanceObserver(list => pendingLongTasks.push(...list.getEntries().map(({startTime, duration, name}) => ({startTime, duration, name}))));
    observer.observe({entryTypes: ["longtask"]});
    const visibleTechnical = () => ["generation-loading", "operation-loading", "map-toast", "shortcut-toast", "file-operation-status"]
      .map(id => document.getElementById(id)).filter(node => node && !node.hidden && node.getClientRects().length && !["none", "hidden"].includes(getComputedStyle(node).display))
      .map(node => node.textContent?.trim() || "").filter(text => /\bWorker\b|\bworker\b|线程|任务会话|消息包|结构化克隆|\bbuffer\b|LocalStorage|sessionStorage|IndexedDB|\bBlob\b|缓存后端/i.test(text));
    const settle = async () => {
      await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
      await new Promise(done => setTimeout(done, 100));
      pendingLongTasks.push(...observer.takeRecords().map(({startTime, duration, name}) => ({startTime, duration, name})));
    };
    const operation = async (name, task) => {
      await settle();
      pendingLongTasks.length = 0;
      const startedAt = performance.now();
      const result = await task();
      await settle();
      const endedAt = performance.now();
      trace.longTasks.push(...pendingLongTasks.filter(entry => entry.startTime >= startedAt && entry.startTime < endedAt).map(entry => ({...entry, operation: name})));
      trace.technicalCopy.push(...visibleTechnical());
      return result;
    };
    const setInput = (value, type) => {
      input.value = String(value);
      input.dispatchEvent(new Event(type, {bubbles: true}));
      return input.value;
    };
    const hasRenderedMapPixel = () => {
      const {gl, canvas} = app.renderer;
      const clear = [...gl.getParameter(gl.COLOR_CLEAR_VALUE)].map(value => Math.round(value * 255));
      const pixel = new Uint8Array(4);
      for (const x of [0.1, 0.3, 0.5, 0.7, 0.9]) for (const y of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        gl.readPixels(Math.floor(canvas.width * x), Math.floor(canvas.height * y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        if (pixel.some((value, index) => Math.abs(value - clear[index]) > 2)) return true;
      }
      return false;
    };
    try {
      window.__webglGeneratorHealth.clear();
      const ui = {min: input.min, max: input.max, step: input.step, high: setInput(200_000, "input"), low: setInput(-1, "input"), change: setInput(100_001, "change"), blank: setInput("", "blur")};
      const options = {high: api.generate.setOptions({cellsTarget: 200_000}).data.options.cellsTarget, low: api.generate.setOptions({cellsTarget: -1}).data.options.cellsTarget};
      const one = await operation("generate-one", () => api.generate.newMap({confirm: true, seed: "task323-one", cellsTarget: 1, heightmapTemplate: "continents"}));
      const oneChecksum = app.map.metadata.checksum;
      const oneState = {ok: one.ok, grid: app.map.grid.points.length, pack: app.map.pack.cells.i.length, target: app.map.options.cellsTarget, metadata: app.map.metadata.cellsTarget, polygon: app.map.grid.cells.v[0]?.length || 0, finite: app.map.grid.points[0].every(Number.isFinite) && Number.isFinite(app.map.grid.cells.h[0]), visible: app.renderer.map === app.map && app.renderer.canvas.getClientRects().length > 0 && hasRenderedMapPixel(), input: input.value};
      const png = await operation("png-one", () => api.data.exportPNG({includeDataUrl: false, pixelScale: 1}));
      const saved = await operation("save-one", () => api.data.saveBrowserMap());
      await operation("replace-one", () => api.generate.newMap({confirm: true, seed: "task323-one-replacement", cellsTarget: 1, heightmapTemplate: "continents"}));
      const restored = await operation("restore-one", () => api.data.restoreBrowserMap({confirm: true, toast: false}));
      const restoreState = {saved: saved.data?.saved, restored: restored.data?.restored, checksum: app.map.metadata.checksum, grid: app.map.grid.points.length, input: input.value, renderer: app.renderer.map === app.map, visible: hasRenderedMapPixel()};
      const oversized = JSON.parse(api.data.exportAll({includeText: true}).data.text);
      oversized.map.grid.points.length = 100_001;
      const importBefore = {map: app.map, revision: JSON.stringify(app.mapRevision.getSnapshot()), history: JSON.stringify(app.editHistory.getStats()), checksum: app.map.metadata.checksum};
      const rejected = await operation("reject-oversized", () => api.data.importMap(oversized, {confirm: true}));
      const importState = {error: rejected.error, same: app.map === importBefore.map && JSON.stringify(app.mapRevision.getSnapshot()) === importBefore.revision && JSON.stringify(app.editHistory.getStats()) === importBefore.history && app.map.metadata.checksum === importBefore.checksum};
      const capped = await operation("generate-capped", () => api.generate.newMap({confirm: true, seed: "task323-cap", cellsTarget: 200_000, heightmapTemplate: "continents"}));
      const cappedState = {ok: capped.ok, actual: app.map.grid.points.length, target: app.map.options.cellsTarget, metadata: app.map.metadata.cellsTarget, api: api.generate.getOptions().data.options.cellsTarget, input: input.value};
      const growInspection = api.grid.inspectRefinement({targetCells: 200_000});
      const grown = await operation("refine-to-cap", () => api.grid.refine({targetCells: 200_000, confirm: true, inspectionToken: growInspection.data.inspectionToken}));
      const grownState = {ok: grown.ok, executed: grown.data?.executed, actual: app.map.grid.points.length, target: app.map.options.cellsTarget, renderer: app.renderer.map === app.map};
      const noOpBefore = {map: app.map, revision: JSON.stringify(app.mapRevision.getSnapshot()), history: JSON.stringify(app.editHistory.getStats()), checksum: app.map.metadata.checksum};
      const coordinator = app.workerTaskCoordinator;
      const originalRun = coordinator.run;
      let workerRuns = 0;
      coordinator.run = async function(...args) { workerRuns += 1; return Reflect.apply(originalRun, this, args); };
      let capInspection;
      let noOp;
      try {
        capInspection = api.grid.inspectRefinement({targetCells: 200_000});
        noOp = await operation("refine-cap-noop", () => api.grid.refine({targetCells: 200_000, confirm: true, inspectionToken: capInspection.data.inspectionToken}));
      } finally { coordinator.run = originalRun; }
      const noOpState = {inspection: capInspection.data, result: noOp, workerRuns, same: app.map === noOpBefore.map && JSON.stringify(app.mapRevision.getSnapshot()) === noOpBefore.revision && JSON.stringify(app.editHistory.getStats()) === noOpBefore.history && app.map.metadata.checksum === noOpBefore.checksum};
      const schemas = ["generate.setOptions", "generate.newMap", "generate.rerollSeed", "grid.inspectRefinement", "grid.refine"].map(method => {
        const description = api.info.describe(method).data;
        const property = method.startsWith("grid.") ? "targetCells" : "cellsTarget";
        return {method, schema: description.inputSchema.prefixItems[0].properties[property]};
      });
      const health = window.__webglGeneratorHealth.getEvents(300);
      return {ui, options, oneState, oneChecksum, png: png.data, restoreState, importState, cappedState, grownState, noOpState, schemas, trace, loading: api.info.runtimeStats().data.loading, glError: app.renderer.getStats().draw.glError, healthErrors: health.filter(event => event.severity === "error" && !["operation-stall", "main-thread-long-task", "render-frame-gap", "input-handler-stall"].includes(event.type))};
    } finally { observer.disconnect(); }
  });
  const applicationConsoleErrors = consoleErrors.slice(consoleStart).filter(message => !["operation-stall", "main-thread-long-task", "render-frame-gap", "input-handler-stall"].some(type => message.includes(`[FMG health] ${type}`)));
  if (report.trace.longTasks.length) console.error(JSON.stringify({task323LongTasks: report.trace.longTasks}, null, 2));
  assert.deepEqual(report.ui, {min: "1", max: "100000", step: "1", high: "100000", low: "1", change: "100000", blank: "10000"});
  assert.deepEqual(report.options, {high: 100_000, low: 1});
  assert.deepEqual(report.oneState, {ok: true, grid: 1, pack: 1, target: 1, metadata: 1, polygon: 4, finite: true, visible: true, input: "1"});
  assert.ok(report.png.bytes > 0 && report.png.width > 0 && report.png.height > 0);
  assert.deepEqual(report.restoreState, {saved: true, restored: true, checksum: report.oneChecksum, grid: 1, input: "1", renderer: true, visible: true});
  assert.equal(report.importState.error?.code, "map-cell-limit-exceeded");
  assert.equal(report.importState.error?.stage, "map-import-validate");
  assert.equal(report.importState.error?.details?.actualCells, 100_001);
  assert.equal(report.importState.same, true);
  assert.ok(report.cappedState.ok && report.cappedState.actual >= 99_000 && report.cappedState.actual <= 100_000);
  assert.deepEqual({target: report.cappedState.target, metadata: report.cappedState.metadata, api: report.cappedState.api, input: report.cappedState.input}, {target: 100_000, metadata: 100_000, api: 100_000, input: "100000"});
  assert.deepEqual(report.grownState, {ok: true, executed: true, actual: 100_000, target: 100_000, renderer: true});
  assert.equal(report.noOpState.inspection.noOp, true);
  assert.equal(report.noOpState.result.data?.executed, false);
  assert.equal(report.noOpState.result.data?.reason, "map-cell-limit-reached");
  assert.equal(report.noOpState.workerRuns, 0);
  assert.equal(report.noOpState.same, true);
  for (const {schema} of report.schemas) assert.deepEqual({minimum: schema.minimum, maximum: schema.maximum}, {minimum: 1, maximum: 100_000});
  const cappedLongTasks = report.trace.longTasks.filter(entry => entry.operation === "generate-capped");
  assert.ok(cappedLongTasks.length <= 1, `generate-capped LongTask 数量超过登记上限：${JSON.stringify(cappedLongTasks)}`);
  assert.ok(cappedLongTasks.every(entry => entry.name === "self" && entry.duration <= 80), `generate-capped LongTask 时长或来源超过登记上限：${JSON.stringify(cappedLongTasks)}`);
  assert.deepEqual(report.trace.longTasks, cappedLongTasks, "第 323 项仅允许 generate-capped 的精确登记 LongTask");
  assert.deepEqual(report.trace.technicalCopy, []);
  assert.equal(report.loading.visible, false);
  assert.equal(report.glError, 0);
  assert.deepEqual(report.healthErrors, []);
  assert.deepEqual(applicationConsoleErrors, []);
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ok: true, oneCell: report.oneState, capped: report.cappedState, noOp: report.noOpState.result.data, registeredLongTasks: report.trace.longTasks, operations: 9}, null, 2));
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

function captureError(task) { try { task(); } catch (error) { return error; } throw new Error("预期操作抛错"); }
function delay(ms) { return new Promise(done => setTimeout(done, ms)); }
