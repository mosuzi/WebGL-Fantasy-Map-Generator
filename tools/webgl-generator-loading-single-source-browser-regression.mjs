#!/usr/bin/env node
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createServer as createViteServer} from "vite";

import {closeTask350BrowserResource, createTask350BrowserArtifact} from "./task-350-browser-artifact.mjs";
import {collectTask350LongTaskWindow, prepareTask350LongTaskObserver, resetTask350LongTaskWindow, summarizeTask350LongTasks} from "./task-350-browser-long-task.mjs";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const host = "127.0.0.1";
const timeoutMs = 240000;
const evidence = createTask350BrowserArtifact("loading-single-source", {mode: "browser-feedback"});
let vite;
let browser;
let context;
let thrownError = null;

try {
  evidence.mark("server-start", {active: "loading-single-source"});
  const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
  vite = await createViteServer({configFile: join(rootDir, "vite.config.mjs"), server: {host, port: 0}, logLevel: "error"});
  await vite.listen();
  const port = vite.httpServer.address().port;
  evidence.mark("browser-start", {active: "loading-single-source", complete: "server-start"});
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  context = await browser.newContext({viewport: {width: 1280, height: 800}, deviceScaleFactor: 1});
  await context.addInitScript(() => localStorage.clear());
  const page = await context.newPage();
  await prepareTask350LongTaskObserver(page);
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const healthErrors = [];
  const pageErrors = [];
  page.on("console", message => {
    if (message.type() !== "error") return;
    if (message.text().startsWith("[FMG health]")) healthErrors.push(message.text());
    else consoleErrors.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`http://${host}:${port}/?debug=1&healthClear=1&loadStepDelay=35`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, timeoutMs);
  evidence.mark("browser-evaluation", {active: "loading-single-source", complete: "browser-start"});
  await resetTask350LongTaskWindow(page);

  const report = await page.evaluate(async () => {
    const app = window.__webglGeneratorApp;
    const results = {};
    results.regenerate = await observeLoading(() => app.runtimeActions.generate.regenerate("cities", {confirm: true}));
    results.regenerateFailure = await observeLoading(() => app.runtimeActions.generate.regenerate("unknown-kind", {confirm: true}));
    results.regenerateCancellation = await observeLoading(() => {
      const pending = app.runtimeActions.generate.regenerate("cities", {confirm: true});
      app.runtimeOperation.cancelCurrent("loading-cancellation-fixture");
      return pending;
    });

    results.fixtureSetupWindow = {kind: "fixture-export-map", startTime: performance.now(), endTime: null};
    const exported = app.runtimeActions.data.exportMap({download: false, includeText: true});
    results.fixtureSetupWindow.endTime = performance.now();
    const delayedFile = new File([exported.text], "loading-fixture.json", {type: "application/json"});
    const originalArrayBuffer = delayedFile.arrayBuffer.bind(delayedFile);
    let fileReadLoading = null;
    Object.defineProperty(delayedFile, "arrayBuffer", {value: async () => {
      fileReadLoading = visibleLoading();
      await new Promise(resolve => setTimeout(resolve, 100));
      return originalArrayBuffer();
    }});
    results.importMap = await observeLoading(() => app.runtimeActions.data.importMap(delayedFile, {confirm: true, source: "api", toast: false}));
    results.fileReadLoading = fileReadLoading;

    const rollbackMap = app.map;
    window.__webglGeneratorMapReplaceFault = {stage: "after-renderer-load", operationName: "data.importMap", mode: "once", hits: 0};
    try {
      results.importRollbackFailure = await observeLoading(() => app.runtimeActions.data.importMap(exported.text, {confirm: true, source: "api", toast: false}));
      results.importRollbackFault = {...window.__webglGeneratorMapReplaceFault};
      results.importRollbackState = {mapRestored: app.map === rollbackMap, rendererMapMatches: app.renderer.map === app.map};
    } finally {
      delete window.__webglGeneratorMapReplaceFault;
    }

    await app.runtimeActions.data.saveBrowserMap({source: "regression"});
    results.restoreBrowserMap = await observeLoading(() => app.runtimeActions.data.restoreBrowserMap({confirm: true, toast: false}));
    results.regenerateLockConflict = await observeLoading(() => runLockedRiverConflict());
    results.busyGenerateButton = await observeBusyGenerateButton();
    await clearBrowserMapStorage();
    results.restoreMissing = await observeLoading(() => app.runtimeActions.data.restoreBrowserMap({confirm: true, toast: false}));
    results.final = visibleLoading();
    return results;

    async function observeLoading(run) {
      const frames = [];
      let running = true;
      const collect = () => {
        frames.push(visibleLoading());
        if (running) requestAnimationFrame(collect);
      };
      requestAnimationFrame(collect);
      let result = null;
      let error = null;
      try {
        result = await run();
      } catch (caught) {
        error = serializeError(caught);
      }
      running = false;
      await new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
      frames.push(visibleLoading());
      return {
        result: result && typeof result === "object" ? {executed: result.executed, restored: result.restored} : result,
        error,
        maxVisible: Math.max(0, ...frames.map(frame => frame.count)),
        generationSeen: frames.some(frame => frame.generation),
        operationSeen: frames.some(frame => frame.operation),
        finished: frames.at(-1),
        samples: frames.length
      };
    }

    function serializeError(error, depth = 0) {
      if (!error || depth > 4) return null;
      return {
        code: error.code || "",
        name: error.name || "Error",
        message: error.message || String(error),
        stage: error.stage || "",
        details: error.details && typeof error.details === "object" ? structuredClone(error.details) : null,
        cause: depth < 4 ? serializeError(error.cause, depth + 1) : null
      };
    }

    function visibleLoading() {
      const generation = !document.getElementById("generation-loading")?.hidden;
      const operation = !document.getElementById("operation-loading")?.hidden;
      return {count: Number(generation) + Number(operation), generation, operation};
    }

    function runLockedRiverConflict() {
      const river = (app.map.rivers?.rivers || []).find(item => item && !item.parent && item.cells?.length >= 3);
      if (!river) throw new Error("固定地图缺少可构造锁冲突的干流");
      app.runtimeActions.regenerationLocks.set({kind: "river", id: river.i}, true);
      const from = river.cells[0];
      const invalid = app.map.pack.cells.i.find(cell => cell !== from && !(app.map.pack.cells.c[from] || []).includes(cell));
      if (!Number.isInteger(invalid)) throw new Error("固定地图缺少非邻接河流 cell");
      river.cells[1] = invalid;
      app.workerTaskCoordinator.invalidateSession("fixture-loading-river-conflict-direct-map-mutation");
      return app.runtimeActions.generate.regenerate("rivers", {confirm: true});
    }

    async function clearBrowserMapStorage() {
      localStorage.removeItem("webgl-generator-current-map-v1");
      await new Promise(resolve => {
        const request = indexedDB.deleteDatabase("webgl-generator-map-storage-v1");
        request.onsuccess = request.onerror = request.onblocked = () => resolve();
      });
    }

    async function observeBusyGenerateButton() {
      const frames = [];
      let running = true;
      const collect = () => {
        frames.push(visibleLoading());
        if (running) requestAnimationFrame(collect);
      };
      const blocker = app.runtimeOperation.run("loading-busy-fixture", () => new Promise(resolve => setTimeout(resolve, 850)), {message: "正在执行并发占用夹具"});
      requestAnimationFrame(collect);
      await new Promise(resolve => setTimeout(resolve, 520));
      document.getElementById("generate-map").click();
      await blocker;
      running = false;
      await new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
      frames.push(visibleLoading());
      return {
        maxVisible: Math.max(0, ...frames.map(frame => frame.count)),
        generationSeen: frames.some(frame => frame.generation),
        operationSeen: frames.some(frame => frame.operation),
        finished: frames.at(-1),
        samples: frames.length
      };
    }
  });

  const longTasks = [];
  const fixtureSetupLongTasks = [];
  const performance = {longTaskCount: 0, maxLongTaskMs: 0, overBudget: []};
  const finalReport = {ok: false, report, consoleErrors, pageErrors, healthErrors, fixtureSetupLongTasks, longTasks, performance};
  const compactReport = {...finalReport, expectedFailureHealth: []};
  evidence.setResult(finalReport, compactReport);

  for (const name of ["regenerate", "regenerateFailure", "regenerateCancellation", "importMap", "importRollbackFailure", "restoreBrowserMap", "regenerateLockConflict", "restoreMissing"]) {
    const result = report[name];
    assert.equal(result.generationSeen, true, `${name} 未显示 generation Loading`);
    assert.equal(result.operationSeen, false, `${name} 叠加显示了 operation Loading`);
    assert.ok(result.maxVisible <= 1, `${name} 同时显示多个 Loading：${JSON.stringify(result)}`);
    assert.deepEqual(result.finished, {count: 0, generation: false, operation: false}, `${name} 完成后 Loading 未清理`);
  }
  assert.equal(report.regenerate.error, null, "城镇重生成失败");
  assert.match(report.regenerateFailure.error?.message || "", /类型必须是|不支持|未知/, "失败重生成没有进入预期错误链");
  assert.equal(report.regenerateCancellation.error?.code, "operation_cancelled", "取消重生成没有进入 operation_cancelled 错误链");
  assert.equal(report.importMap.error, null, "完整地图导入失败");
  assert.equal(report.fileReadLoading?.generation, true, "用户文件读取 / 解析开始前没有 generation Loading");
  assert.equal(report.fileReadLoading?.operation, false, "用户文件读取 / 解析阶段叠加显示 operation Loading");
  assert.equal(report.importRollbackFailure.error?.code, "operation_failed", `地图替换故障没有进入统一 operation failure：${JSON.stringify(report.importRollbackFailure.error)}`);
  assert.equal(report.importRollbackFailure.error?.cause?.code, "map_replace_debug_fault", `地图替换故障原始错误码未保留：${JSON.stringify(report.importRollbackFailure.error)}`);
  assert.equal(report.importRollbackFailure.error?.cause?.stage, "after-renderer-load", `地图替换故障原始阶段未保留：${JSON.stringify(report.importRollbackFailure.error)}`);
  assert.equal(report.importRollbackFault?.hits, 1, "地图替换稳定故障钩子没有且只执行一次");
  assert.equal(report.importRollbackState?.mapRestored, true, "地图替换故障后 canonical map 未恢复");
  assert.equal(report.importRollbackState?.rendererMapMatches, true, "地图替换故障后 renderer map 未与 canonical map 对齐");
  assert.equal(report.restoreBrowserMap.error, null, "浏览器存档恢复失败");
  assert.equal(report.restoreMissing.error, null, "空浏览器存档恢复不应失败");
  assert.equal(report.restoreMissing.result?.restored, false, "空浏览器存档恢复没有返回 no-op");
  assert.equal(report.regenerateLockConflict.error?.code, "regeneration_lock_conflict", "锁冲突重生成没有进入 regeneration_lock_conflict 错误链");
  assert.equal(report.busyGenerateButton.generationSeen, false, "并发占用时不应再点亮第二个 generation Loading");
  assert.equal(report.busyGenerateButton.operationSeen, true, "并发占用夹具没有显示既有 operation Loading");
  assert.ok(report.busyGenerateButton.maxVisible <= 1, `并发占用时同时显示多个 Loading：${JSON.stringify(report.busyGenerateButton)}`);
  assert.deepEqual(report.busyGenerateButton.finished, {count: 0, generation: false, operation: false}, "operation_busy 后生成 Loading 未清理");
  assert.deepEqual(report.final, {count: 0, generation: false, operation: false}, "最终 Loading 状态未清空");
  assert.deepEqual(consoleErrors, [], "单一 Loading 流程产生 console error");
  assert.deepEqual(pageErrors, [], "单一 Loading 流程产生 page error");
  const expectedFailureHealth = healthErrors.filter(message => /\[FMG health\] operation-failed\b/.test(message));
  compactReport.expectedFailureHealth = expectedFailureHealth;
  assert.equal(expectedFailureHealth.length, 1, `故障注入应且只应记录一次 operation-failed：${JSON.stringify(healthErrors)}`);
  assert.equal(healthErrors.every(message => /\[FMG health\] (?:main-thread-long-task|operation-stall|render-frame-gap|operation-failed)\b/.test(message)), true, `出现非预期 health error：${JSON.stringify(healthErrors)}`);

  const observedLongTasks = await collectTask350LongTaskWindow(page, "loading-single-source");
  for (const task of observedLongTasks) {
    const target = overlapsWindow(task, report.fixtureSetupWindow) ? fixtureSetupLongTasks : longTasks;
    target.push(task);
  }
  assert.equal(report.fixtureSetupWindow?.kind, "fixture-export-map", "夹具导出准备窗口缺少稳定分类");
  assert.equal(validPerformanceWindow(report.fixtureSetupWindow), true, `夹具导出准备窗口无效：${JSON.stringify(report.fixtureSetupWindow)}`);
  assert.equal(longTasks.some(task => overlapsWindow(task, report.fixtureSetupWindow)), false, "夹具导出准备 LongTask 泄漏进目标性能门");
  Object.assign(performance, summarizeTask350LongTasks(longTasks, 200));
  const overBudget = performance.overBudget;
  assert.deepEqual(overBudget, [], `单一 Loading 目标窗口出现 >200ms LongTask：${JSON.stringify(overBudget)}`);
  finalReport.ok = true;
  compactReport.ok = true;
  evidence.succeed();
  console.log(JSON.stringify(finalReport, null, 2));
} catch (error) {
  evidence.fail(error);
  thrownError = error;
} finally {
  for (const [label, close] of [
    ["loading-single-source-context", context ? () => context.close() : null],
    ["loading-single-source-browser", browser ? () => browser.close() : null],
    ["loading-single-source-vite", vite ? () => vite.close() : null]
  ]) {
    if (!close) continue;
    try {
      await closeTask350BrowserResource(label, close);
    } catch (error) {
      evidence.failTeardown(error);
      if (!thrownError) thrownError = error;
    }
  }
  evidence.persist();
}
if (thrownError) throw thrownError;

function validPerformanceWindow(window) {
  return Number.isFinite(window?.startTime)
    && Number.isFinite(window?.endTime)
    && window.endTime >= window.startTime;
}

function overlapsWindow(task, window) {
  if (!validPerformanceWindow(window)) return false;
  const startTime = Number(task?.startTime);
  const endTime = startTime + Number(task?.duration);
  return Number.isFinite(startTime)
    && Number.isFinite(endTime)
    && startTime < window.endTime
    && endTime > window.startTime;
}
