#!/usr/bin/env node
import {createReadStream, existsSync, statSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {partitionApiBrowserDiagnostics, waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const distDir = join(rootDir, "dist", "webgl-generator");
const host = "127.0.0.1";
const port = 5458;
const timeoutMs = 240_000;
if (!existsSync(distDir)) throw new Error(`构建产物不存在：${distDir}`);

const playwright = loadPlaywright(sourceDir);
const server = await startStaticServer({host, port, publicDir: distDir});
let browser;
try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome", args: ["--js-flags=--expose-gc"]});
  const context = await browser.newContext({viewport: {width: 1440, height: 960}, deviceScaleFactor: 1});
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded", timeout: timeoutMs});
  await waitForApiReady(page, timeoutMs);

  const report = await page.evaluate(async () => {
    const unwrap = (result, label) => {
      if (!result?.ok) throw new Error(`${label}: ${result?.error?.code || "api_error"} ${result?.error?.message || ""}`);
      return result.data;
    };
    const beforeGeneration = unwrap(await window.webglGeneratorApi.generate.newMap({
      confirm: true,
      seed: "grid-topology-browser-298",
      cellsTarget: 10_000,
      heightmapTemplate: "continents"
    }), "generate.newMap");
    const generationInputBefore = document.getElementById("cells-input")?.value || "";
    const api = window.webglGeneratorApi;
    const app = window.__webglGeneratorApp;
    const coordinator = app.workerTaskCoordinator;
    const rendererLoadBefore = app.renderer?.lastLoad || null;
    const observedLongTasks = [];
    const longTaskObserver = typeof PerformanceObserver === "function"
      ? new PerformanceObserver(list => observedLongTasks.push(...list.getEntries().map(entry => ({startTime: entry.startTime, duration: entry.duration}))))
      : null;
    longTaskObserver?.observe({entryTypes: ["longtask"]});
    let workerRun = null;
    const wrappedCoordinator = Object.freeze({
      ...coordinator,
      async run(task, payload, options) {
        const output = await coordinator.run(task, payload, options);
        workerRun = {task, action: payload?.action || "", payloadOwnMap: Object.hasOwn(payload || {}, "map"), mode: output?.worker?.mode || "", accepted: output?.worker?.accepted === true, inputPackets: output?.worker?.telemetry?.inputPackets || 0, outputPackets: output?.worker?.telemetry?.outputPackets || 0, targetCells: output?.result?.target?.cells || 0, preparedLayers: Object.keys(output?.preparedRender?.layers || {})};
        return output;
      }
    });
    app.workerTaskCoordinator = wrappedCoordinator;
    const before = unwrap(api.grid.summary(), "grid.summary.before");
    const beforeHistory = unwrap(api.history.stats(), "history.before");
    const memoryBefore = performance.memory?.usedJSHeapSize ?? null;
    const inspection = unwrap(api.grid.inspectRefinement({targetCells: 100_000}), "grid.inspectRefinement");
    const startedAt = performance.now();
    let execution;
    try {
      execution = unwrap(await api.grid.refine({targetCells: 100_000, confirm: true, inspectionToken: inspection.inspectionToken}), "grid.refine");
    } finally {
      if (app.workerTaskCoordinator === wrappedCoordinator) app.workerTaskCoordinator = coordinator;
    }
    const legacyLoadUnchangedAfterRefine = app.renderer?.lastLoad === rendererLoadBefore;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    observedLongTasks.push(...(longTaskObserver?.takeRecords?.() || []).map(entry => ({startTime: entry.startTime, duration: entry.duration})));
    longTaskObserver?.disconnect();
    const endedAt = performance.now();
    const longTasks = observedLongTasks.filter(entry => entry.startTime >= startedAt && entry.startTime < endedAt);
    const setupLongTasks = observedLongTasks.filter(entry => entry.startTime < startedAt);
    const elapsedMs = endedAt - startedAt;
    const after = unwrap(api.grid.summary(), "grid.summary.after");
    const memoryAfter = performance.memory?.usedJSHeapSize ?? null;
    const afterMap = unwrap(api.info.mapSummary(), "info.mapSummary.after");
    const afterStats = unwrap(api.info.runtimeStats(), "info.runtimeStats.after");
    const generationInputAfterRefine = document.getElementById("cells-input")?.value || "";
    const png = unwrap(await api.data.exportPNG({download: false, pixelScale: 1, includeDataUrl: false}), "data.exportPNG");
    const undo = unwrap(api.history.undo(), "history.undo");
    const afterUndo = unwrap(api.grid.summary(), "grid.summary.undo");
    const generationInputAfterUndo = document.getElementById("cells-input")?.value || "";
    const redo = unwrap(api.history.redo(), "history.redo");
    const afterRedo = unwrap(api.grid.summary(), "grid.summary.redo");
    const generationInputAfterRedo = document.getElementById("cells-input")?.value || "";
    const memoryAfterRedoImmediate = performance.memory?.usedJSHeapSize ?? null;
    globalThis.gc?.();
    await new Promise(resolve => setTimeout(resolve, 0));
    const memoryAfterRedo = performance.memory?.usedJSHeapSize ?? null;
    const rendererStats = app?.renderer?.getStats?.() || {};
    const healthErrors = unwrap(api.info.healthEvents({severity: "error", limit: 180}), "info.healthEvents");
    return {
      beforeGeneration: {gridCells: beforeGeneration.gridCells || beforeGeneration.summary?.gridCells || null},
      generationInputs: {
        before: generationInputBefore,
        afterRefine: generationInputAfterRefine,
        afterUndo: generationInputAfterUndo,
        afterRedo: generationInputAfterRedo
      },
      before: {cells: before.cells, fingerprint: before.fingerprint, landCells: before.landCells, waterCells: before.waterCells},
      inspection: {target: inspection.target, binding: inspection.binding},
      workerRun,
      longTasks,
      setupLongTasks,
      preparedInstall: {
        stages: Object.keys(execution?.worker?.telemetry?.renderInstallStages || {}).length,
        legacyLoadUnchanged: legacyLoadUnchangedAfterRefine,
        suspended: app.renderer?.workerRenderInstallSuspended || 0
      },
      execution,
      elapsedMs,
      memory: {beforeBytes: memoryBefore, afterBytes: memoryAfter, afterRedoImmediateBytes: memoryAfterRedoImmediate, afterRedoBytes: memoryAfterRedo, deltaBytes: memoryBefore !== null && memoryAfter !== null ? memoryAfter - memoryBefore : null},
      after: {cells: after.cells, fingerprint: after.fingerprint, landCells: after.landCells, waterCells: after.waterCells, refinement: after.refinement},
      afterMap: {gridCells: afterMap.gridCells, packCells: afterMap.packCells, checksum: afterMap.checksum},
      afterStats: {
        gridCells: afterStats.renderer?.metadata?.gridCells ?? null,
        packCells: afterStats.renderer?.metadata?.packCells ?? null,
        webgl2: afterStats.renderer?.webgl2 ?? false,
        loading: afterStats.loading,
        operation: afterStats.operation?.last ? {name: afterStats.operation.last.name, status: afterStats.operation.last.status, durationMs: afterStats.operation.last.durationMs} : null
      },
      png: {width: png.width, height: png.height, bytes: png.bytes},
      history: {before: beforeHistory, undo, redo},
      afterUndo: {cells: afterUndo.cells, fingerprint: afterUndo.fingerprint},
      afterRedo: {cells: afterRedo.cells, fingerprint: afterRedo.fingerprint},
      renderer: {glError: rendererStats.draw?.glError ?? 0, gridCells: rendererStats.gridCells ?? rendererStats.cells ?? null},
      healthErrors
    };
  });

  await page.waitForTimeout(500);
  const diagnostics = partitionApiBrowserDiagnostics(report.healthErrors, consoleErrors);
  report.consoleErrors = diagnostics.consoleErrors;
  report.performanceConsoleErrors = diagnostics.performanceConsoleErrors;
  report.healthErrors = diagnostics.healthErrors;
  report.pageErrors = pageErrors;
  report.passed = report.before.cells >= 9_000
    && report.workerRun?.task === "grid-topology.prepare" && report.workerRun.action === "grid.refine"
    && report.workerRun.payloadOwnMap === true && report.workerRun.mode === "worker" && report.workerRun.accepted === true
    && report.workerRun.inputPackets > 0 && report.workerRun.outputPackets > 0 && report.workerRun.targetCells === 100_000
    && ["cellVisual", "shore", "statePaths", "provincePaths", "political", "politicalDebug", "surface", "line", "picking", "labels", "route", "river", "point"].every(layer => report.workerRun.preparedLayers.includes(layer))
    && report.preparedInstall.stages > 0 && report.preparedInstall.legacyLoadUnchanged === true && report.preparedInstall.suspended === 0
    && report.longTasks.length === 0
    && report.generationInputs.before === "10000"
    && report.generationInputs.afterRefine === "100000"
    && report.generationInputs.afterUndo === "10000"
    && report.generationInputs.afterRedo === "100000"
    && report.after.cells === 100_000
    && report.afterUndo.cells === report.before.cells
    && report.afterUndo.fingerprint === report.before.fingerprint
    && report.afterRedo.cells === 100_000
    && report.afterRedo.fingerprint === report.after.fingerprint
    && report.execution.refinement?.motherAdjacencyViolations === 0
    && report.execution.refinement?.landSignViolations === 0
    && report.elapsedMs < 20_000
    && (report.memory.afterRedoImmediateBytes === null || report.memory.afterRedoImmediateBytes < 1536 * 1024 * 1024)
    && (report.memory.afterRedoBytes === null || report.memory.afterRedoBytes < 900 * 1024 * 1024)
    && report.renderer.glError === 0
    && diagnostics.consoleErrors.length === 0
    && diagnostics.healthErrors.total === 0
    && pageErrors.length === 0;
  console.log(JSON.stringify(report, null, 2));
  await context.close();
  if (!report.passed) process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise(resolveClose => server.close(resolveClose));
}

function loadPlaywright(sourceRoot) {
  const require = createRequire(import.meta.url);
  try {
    return require("playwright");
  } catch {
    return createRequire(join(sourceRoot, "package.json"))("playwright");
  }
}

function startStaticServer({host, port, publicDir}) {
  const mime = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml"};
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url || "/", `http://${host}`).pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    let file = normalize(join(publicDir, relative));
    if (!file.startsWith(normalize(publicDir))) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(publicDir, "index.html");
    response.writeHead(200, {"content-type": mime[extname(file)] || "application/octet-stream", "cache-control": "no-store"});
    createReadStream(file).pipe(response);
  });
  return new Promise((resolveServer, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolveServer(server));
  });
}
