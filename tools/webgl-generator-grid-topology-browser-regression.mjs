#!/usr/bin/env node
import {createReadStream, existsSync, statSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {partitionApiBrowserDiagnostics, waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";
import {closeTask350BrowserResource, createTask350BrowserArtifact} from "./task-350-browser-artifact.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const distDir = join(rootDir, "dist", "webgl-generator");
const host = "127.0.0.1";
const port = 5458;
const timeoutMs = 240_000;
const evidence = createTask350BrowserArtifact("grid-topology-browser");
let server;
let browser;
let context;
let thrown = null;
try {
  if (!existsSync(distDir)) throw new Error(`构建产物不存在：${distDir}`);
  const playwright = loadPlaywright(sourceDir);
  server = await startStaticServer({host, port, publicDir: distDir});
  evidence.mark("browser-launch", {complete: "server-ready"});
  browser = await playwright.chromium.launch({headless: true, channel: "chrome", args: ["--js-flags=--expose-gc"]});
  context = await browser.newContext({viewport: {width: 1440, height: 960}, deviceScaleFactor: 1});
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
  evidence.mark("browser-evaluation", {active: "grid-refine-100k", complete: "page-ready"});

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
        workerRun = {task, action: payload?.action || "", payloadOwnMap: Object.hasOwn(payload || {}, "map"), mode: output?.worker?.mode || "", accepted: output?.worker?.accepted === true, inputPackets: output?.worker?.telemetry?.inputPackets || 0, outputPackets: output?.worker?.telemetry?.outputPackets || 0, targetCells: output?.result?.target?.cells || 0, preparedLayers: Object.keys(output?.preparedRender?.layers || {}), session: output?.worker?.session || null};
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
    const endedAt = performance.now();
    const refineLongTasks = observedLongTasks.filter(entry => entry.startTime >= startedAt && entry.startTime < endedAt).map(entry => ({...entry, phase: "refine"}));
    const setupLongTasks = observedLongTasks.filter(entry => entry.startTime < startedAt);
    observedLongTasks.length = 0;
    longTaskObserver?.takeRecords?.();
    const elapsedMs = endedAt - startedAt;
    const after = unwrap(api.grid.summary(), "grid.summary.after");
    const memoryAfter = performance.memory?.usedJSHeapSize ?? null;
    const afterMap = unwrap(api.info.mapSummary(), "info.mapSummary.after");
    const afterStats = unwrap(api.info.runtimeStats(), "info.runtimeStats.after");
    const generationInputAfterRefine = document.getElementById("cells-input")?.value || "";
    const png = unwrap(await api.data.exportPNG({download: false, pixelScale: 1, includeDataUrl: false}), "data.exportPNG");
    observedLongTasks.length = 0;
    longTaskObserver?.takeRecords?.();
    const undoStartedAt = performance.now();
    const undo = unwrap(await api.history.undo(), "history.undo");
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    observedLongTasks.push(...(longTaskObserver?.takeRecords?.() || []).map(entry => ({startTime: entry.startTime, duration: entry.duration})));
    const undoEndedAt = performance.now();
    const undoLongTasks = observedLongTasks.filter(entry => entry.startTime >= undoStartedAt && entry.startTime < undoEndedAt).map(entry => ({...entry, phase: "undo"}));
    observedLongTasks.length = 0;
    longTaskObserver?.takeRecords?.();
    const afterUndo = unwrap(api.grid.summary(), "grid.summary.undo");
    const generationInputAfterUndo = document.getElementById("cells-input")?.value || "";
    const redoStartedAt = performance.now();
    const redo = unwrap(await api.history.redo(), "history.redo");
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    observedLongTasks.push(...(longTaskObserver?.takeRecords?.() || []).map(entry => ({startTime: entry.startTime, duration: entry.duration})));
    const redoEndedAt = performance.now();
    const redoLongTasks = observedLongTasks.filter(entry => entry.startTime >= redoStartedAt && entry.startTime < redoEndedAt).map(entry => ({...entry, phase: "redo"}));
    longTaskObserver?.disconnect();
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
      workerRun: workerRun ? {...workerRun, session: execution?.worker?.session || null} : null,
      longTasks: [...refineLongTasks, ...undoLongTasks, ...redoLongTasks],
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
      finalSession: coordinator.getSessionSnapshot(),
      renderer: {glError: rendererStats.draw?.glError ?? 0, gridCells: rendererStats.gridCells ?? rendererStats.cells ?? null},
      healthErrors
    };
  });

  await page.waitForTimeout(500);
  const diagnostics = partitionApiBrowserDiagnostics(report.healthErrors, consoleErrors);
  const additionalPerformanceConsolePattern = /^\[FMG health\] (?:operation-stall|input-handler-stall)\b/u;
  const additionalPerformanceConsoleErrors = diagnostics.consoleErrors.filter(message => additionalPerformanceConsolePattern.test(message));
  const additionalPerformanceHealthTypes = new Set(["operation-stall", "input-handler-stall"]);
  const additionalPerformanceHealthEvents = diagnostics.healthErrors.events.filter(event => additionalPerformanceHealthTypes.has(event?.type));
  const applicationHealthEvents = diagnostics.healthErrors.events.filter(event => !additionalPerformanceHealthTypes.has(event?.type));
  report.consoleErrors = diagnostics.consoleErrors.filter(message => !additionalPerformanceConsolePattern.test(message));
  report.performanceConsoleErrors = [...diagnostics.performanceConsoleErrors, ...additionalPerformanceConsoleErrors];
  report.healthErrors = {
    ...diagnostics.healthErrors,
    total: applicationHealthEvents.length,
    events: applicationHealthEvents,
    performanceTelemetry: {
      total: diagnostics.healthErrors.performanceTelemetry.total + additionalPerformanceHealthEvents.length,
      events: [...diagnostics.healthErrors.performanceTelemetry.events, ...additionalPerformanceHealthEvents]
    }
  };
  report.pageErrors = pageErrors;
  report.passed = report.before.cells >= 9_000
    && report.workerRun?.task === "grid-topology.prepare" && report.workerRun.action === "grid.refine"
    && report.workerRun.payloadOwnMap === true && report.workerRun.mode === "worker" && report.workerRun.accepted === true
    && report.workerRun.session?.committed === true && report.workerRun.session?.pending === false
    && (report.finalSession === null || (report.finalSession?.status === "idle" && report.finalSession?.pending !== true))
    && report.workerRun.inputPackets > 0 && report.workerRun.outputPackets > 0 && report.workerRun.targetCells === 100_000
    && ["cellVisual", "shore", "statePaths", "provincePaths", "political", "politicalDebug", "surface", "line", "picking", "labels", "route", "river", "point"].every(layer => report.workerRun.preparedLayers.includes(layer))
    && report.preparedInstall.stages > 0 && report.preparedInstall.legacyLoadUnchanged === true && report.preparedInstall.suspended === 0
    && report.longTasks.every(task => task.duration <= 200)
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
    && (report.memory.afterRedoBytes === null || report.memory.afterRedoBytes < 900 * 1024 * 1024)
    && report.renderer.glError === 0
    && report.afterStats.loading?.visible === false
    && report.consoleErrors.length === 0
    && report.healthErrors.total === 0
    && pageErrors.length === 0;
  const overBudgetLongTasks = report.longTasks.filter(task => task.duration > 200);
  const compactResult = {
    passed: report.passed,
    beforeCells: report.before.cells,
    afterCells: report.after.cells,
    undoCells: report.afterUndo.cells,
    redoCells: report.afterRedo.cells,
    fingerprints: {
      refineChanged: report.after.fingerprint !== report.before.fingerprint,
      undoExact: report.afterUndo.fingerprint === report.before.fingerprint,
      redoExact: report.afterRedo.fingerprint === report.after.fingerprint
    },
    generationInputs: report.generationInputs,
    topology: {
      motherAdjacencyViolations: report.execution.refinement?.motherAdjacencyViolations ?? null,
      landSignViolations: report.execution.refinement?.landSignViolations ?? null
    },
    afterMap: report.afterMap,
    png: report.png,
    renderer: report.renderer,
    worker: report.workerRun,
    finalSession: report.finalSession,
    preparedInstall: report.preparedInstall,
    history: {before: report.history.before, undo: report.history.undo, redo: report.history.redo},
    elapsedMs: report.elapsedMs,
    memory: {
      ...report.memory,
      afterRedoReclaimedBytes: report.memory.afterRedoImmediateBytes !== null && report.memory.afterRedoBytes !== null ? report.memory.afterRedoImmediateBytes - report.memory.afterRedoBytes : null,
      afterRedoRetainedBytes: report.memory.beforeBytes !== null && report.memory.afterRedoBytes !== null ? report.memory.afterRedoBytes - report.memory.beforeBytes : null
    },
    longTaskCount: report.longTasks.length,
    maxLongTaskMs: Math.max(0, ...report.longTasks.map(task => task.duration)),
    overBudgetLongTasks,
    consoleErrors: report.consoleErrors.length,
    performanceConsoleErrors: report.performanceConsoleErrors.length,
    healthErrors: report.healthErrors.total,
    performanceHealthErrors: report.healthErrors.performanceTelemetry.total,
    pageErrors: report.pageErrors.length,
    glError: report.renderer.glError,
    loading: report.afterStats.loading,
    loadingVisible: report.afterStats.loading?.visible ?? null
  };
  evidence.setResult(report, compactResult);
  evidence.mark("assertions", {complete: "browser-evaluation"});
  if (!report.passed) throw new Error(`grid topology browser gate failed: ${JSON.stringify(compactResult)}`);
  evidence.succeed();
} catch (error) {
  thrown = error;
  evidence.fail(error);
} finally {
  for (const [label, close] of [
    ["context", context && (() => context.close())],
    ["browser", browser && (() => browser.close())],
    ["server", server && (() => new Promise((resolveClose, rejectClose) => server.close(error => error ? rejectClose(error) : resolveClose())))]
  ]) {
    if (!close) continue;
    try {
      await closeTask350BrowserResource(label, close);
    } catch (error) {
      thrown ||= error;
      evidence.failTeardown(error);
    }
  }
  const persisted = evidence.persist();
  console.log(JSON.stringify(persisted.summary, null, 2));
}
if (thrown) throw thrown;

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
