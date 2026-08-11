#!/usr/bin/env node
import assert from "node:assert/strict";
import {createReadStream, existsSync, statSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const distDir = join(rootDir, "dist", "webgl-generator");
const host = "127.0.0.1";
const port = 5553;
const timeoutMs = 180000;
const technicalCopy = /\bWorker\b|\bworker\b|线程|任务会话|消息包|结构化克隆|\bbuffer\b|LocalStorage|sessionStorage|IndexedDB|\bBlob\b|缓存后端/;
assert.ok(existsSync(distDir), `构建产物不存在：${distDir}`);

const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const server = await startStaticServer();
let browser;
let context;

try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  context = await browser.newContext({viewport: {width: 1280, height: 820}, deviceScaleFactor: 1});
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, timeoutMs);

  const setup = await page.evaluate(async () => {
    const response = await window.webglGeneratorApi.generate.newMap({
      confirm: true,
      seed: "ocean-current-world-worker-browser",
      cellsTarget: 2000,
      heightmapTemplate: "continents"
    });
    if (!response?.ok) throw new Error(response?.error?.message || "固定图生成失败");
    return {targetStartedAt: performance.now()};
  });
  const consoleStart = consoleErrors.length;

  const report = await page.evaluate(async forbiddenSource => {
    const api = window.webglGeneratorApi;
    const app = window.__webglGeneratorApp;
    const forbidden = new RegExp(forbiddenSource, "i");
    const mapReference = app.map;
    const optionsBefore = app.map.options;
    const before = JSON.stringify(app.map);
    const historyBefore = app.editHistory.getStats();
    const visibleMessages = [];
    const bubble = document.getElementById("operation-loading");
    const text = document.getElementById("operation-loading-text");
    const observer = new MutationObserver(() => {
      if (!bubble?.hidden && bubble?.classList.contains("operation-loading-active")) visibleMessages.push(text?.textContent?.trim() || "");
    });
    if (text) observer.observe(text, {subtree: true, childList: true, characterData: true});
    let data;
    try {
      const response = await api.oceanCurrents.rebuildWorld({confirm: true, seed: "ocean-current-world-worker-browser:next"});
      if (!response?.ok) throw new Error(`${response?.error?.code || "operation_failed"} ${response?.error?.message || "洋流世界重算失败"}`);
      data = response.data;
    } finally {
      observer.disconnect();
    }
    if (!data?.executed) throw new Error("洋流世界 Worker 正式入口未执行");
    if (data.worker?.session?.committed !== true || data.worker?.session?.pending === true) throw new Error("洋流世界 Worker 会话未提交");
    if (app.map !== mapReference) throw new Error("洋流世界重算替换了正式 map 对象");
    const after = JSON.stringify(app.map);
    const optionsAfter = app.map.options;
    const historyAfter = app.editHistory.getStats();
    if (historyAfter.undo !== historyBefore.undo + 1 || historyAfter.redo !== 0) throw new Error("洋流世界重算没有恰好形成一条历史");
    unwrap(api.history.undo(), "撤销洋流世界重算");
    if (app.map !== mapReference || app.map.options !== optionsBefore || JSON.stringify(app.map) !== before) throw new Error("洋流世界撤销未精确恢复原图");
    unwrap(api.history.redo(), "重做洋流世界重算");
    if (app.map !== mapReference || app.map.options !== optionsAfter || JSON.stringify(app.map) !== after) throw new Error("洋流世界重做未精确恢复结果");
    const loadingText = text?.textContent?.trim() || "";
    const loadingVisible = Boolean(bubble && !bubble.hidden && bubble.classList.contains("operation-loading-active"));
    const forbiddenMessages = visibleMessages.filter(message => forbidden.test(message));
    return {
      steps: data.executionOrder?.length || data.steps?.length || 0,
      worker: {
        inputPackets: data.worker?.telemetry?.inputPackets || 0,
        outputPackets: data.worker?.telemetry?.outputPackets || 0,
        session: data.worker?.session || null
      },
      historyDelta: historyAfter.undo - historyBefore.undo,
      loadingVisible,
      loadingText,
      visibleMessages: [...new Set(visibleMessages.filter(Boolean))],
      forbiddenMessages,
      coordinator: app.workerTaskCoordinator?.getSessionSnapshot?.() || null,
      glError: app.renderer?.getStats?.().draw?.glError ?? 0
    };

    function unwrap(response, label) {
      if (!response?.ok) throw new Error(`${label}失败：${response?.error?.code || "operation_failed"} ${response?.error?.message || ""}`);
      return response.data;
    }
  }, technicalCopy.source);

  const targetConsoleErrors = consoleErrors.slice(consoleStart);
  const performanceSignals = targetConsoleErrors.filter(message => /^\[FMG health\] (operation-stall|main-thread-long-task|render-frame-gap|input-handler-stall)\b/.test(message));
  const applicationConsoleErrors = targetConsoleErrors.filter(message => !performanceSignals.includes(message));
  assert.equal(report.steps, 11);
  assert.ok(report.worker.inputPackets > 0 && report.worker.outputPackets > 0, "洋流世界 Worker 没有流式输入输出证据");
  assert.equal(report.historyDelta, 1);
  assert.equal(report.loadingVisible, false);
  assert.deepEqual(report.forbiddenMessages, []);
  assert.equal(report.glError, 0);
  assert.deepEqual(applicationConsoleErrors, []);
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ok: true, setup, ...report, performanceSignals, applicationConsoleErrors, pageErrors}, null, 2));
} finally {
  if (context) await Promise.race([context.close(), delay(5000)]);
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(done => server.close(done));
}

async function startStaticServer() {
  const instance = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, `http://${host}:${port}`).pathname);
    let target = resolve(distDir, `.${normalize(pathname)}`);
    if (pathname === "/" || !existsSync(target) || statSync(target).isDirectory()) target = join(distDir, "index.html");
    if (!target.startsWith(distDir) || !existsSync(target)) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {"content-type": contentType(target), "cache-control": "no-store"});
    createReadStream(target).pipe(response);
  });
  await new Promise((done, fail) => {
    instance.once("error", fail);
    instance.listen(port, host, done);
  });
  return instance;
}

function contentType(file) {
  return ({".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml"})[extname(file).toLowerCase()] || "application/octet-stream";
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}
