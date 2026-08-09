#!/usr/bin/env node
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createServer as createViteServer} from "vite";

import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const host = "127.0.0.1";
const timeoutMs = 240000;
const vite = await createViteServer({configFile: join(rootDir, "vite.config.mjs"), server: {host, port: 0}, logLevel: "error"});
let browser;
let context;

try {
  await vite.listen();
  const port = vite.httpServer.address().port;
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  context = await browser.newContext({viewport: {width: 1280, height: 800}, deviceScaleFactor: 1});
  await context.addInitScript(() => localStorage.clear());
  const page = await context.newPage();
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

    const exported = app.runtimeActions.data.exportMap({download: false, includeText: true});
    const delayedFile = new File([exported.text], "loading-fixture.json", {type: "application/json"});
    let fileReadLoading = null;
    Object.defineProperty(delayedFile, "text", {value: async () => {
      fileReadLoading = visibleLoading();
      await new Promise(resolve => setTimeout(resolve, 100));
      return exported.text;
    }});
    results.importMap = await observeLoading(() => app.runtimeActions.data.importMap(delayedFile, {confirm: true, source: "api", toast: false}));
    results.fileReadLoading = fileReadLoading;

    const originalLoadMapAsync = app.renderer.loadMapAsync.bind(app.renderer);
    const rollbackProbe = [];
    let loadCalls = 0;
    app.renderer.loadMapAsync = async (map, options) => {
      loadCalls++;
      rollbackProbe.push({call: loadCalls, ...visibleLoading()});
      const result = await originalLoadMapAsync(map, options);
      if (loadCalls === 1) throw new Error("rollback-loading-fixture");
      return result;
    };
    results.importRollbackFailure = await observeLoading(() => app.runtimeActions.data.importMap(exported.text, {confirm: true, source: "api", toast: false}));
    results.importRollbackProbe = rollbackProbe;
    app.renderer.loadMapAsync = originalLoadMapAsync;

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
        error = {code: caught?.code || "", message: caught?.message || String(caught)};
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
  assert.match(report.importRollbackFailure.error?.message || "", /rollback-loading-fixture/, "地图替换故障注入没有进入回滚链");
  assert.equal(report.importRollbackProbe.length, 2, "地图替换故障没有执行正式回滚 renderer load");
  assert.equal(report.importRollbackProbe[1].generation, true, "地图回滚重建期间没有 generation Loading");
  assert.equal(report.importRollbackProbe[1].operation, false, "地图回滚叠加显示了 operation Loading");
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
  assert.equal(expectedFailureHealth.length, 1, `故障注入应且只应记录一次 operation-failed：${JSON.stringify(healthErrors)}`);
  assert.equal(healthErrors.every(message => /\[FMG health\] (?:main-thread-long-task|operation-stall|render-frame-gap|operation-failed)\b/.test(message)), true, `出现非预期 health error：${JSON.stringify(healthErrors)}`);

  console.log(JSON.stringify({ok: true, report, consoleErrors, pageErrors, healthErrors}, null, 2));
} finally {
  if (context) await Promise.race([context.close(), delay(5000)]);
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await vite.close();
}

function delay(milliseconds) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds));
}
