#!/usr/bin/env node
import assert from "node:assert/strict";
import {createReadStream, existsSync, statSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {closeTask350BrowserResource, createTask350BrowserArtifact} from "./task-350-browser-artifact.mjs";
import {collectTask350LongTaskWindow, prepareTask350LongTaskObserver, resetTask350LongTaskWindow, summarizeTask350LongTasks} from "./task-350-browser-long-task.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const distDir = join(rootDir, "dist", "webgl-generator");
const host = "127.0.0.1";
const port = 5473;
const storageKey = "webgl-generator-current-map-v1";
const requestedCells = Number(process.argv[2] || 10000);
const fallbackSeed = `browser-storage-fallback-${requestedCells}`;
const evidence = createTask350BrowserArtifact("browser-storage-fallback", {mode: `browser-persistence-${requestedCells}`});
let server;
let browser;
let context;
let normalContext;
let thrownError = null;
let normal = null;
let fallbackLocalStorage = null;
let indexedDbRecord = null;
const consoleErrors = [];
const healthEvents = [];
const pageErrors = [];
const setupLongTasks = [];
const longTasks = [];
const savedSamples = [];
const finalReport = {
  ok: false,
  requestedCells,
  url: `http://${host}:${port}/?healthClear=1`,
  generated: null,
  saved: null,
  saveSamples: savedSamples,
  saveTiming: null,
  restored: null,
  state: null,
  normal: null,
  consoleErrors,
  pageErrors,
  healthEvents,
  setupLongTasks,
  longTasks,
  performance: {longTaskCount: 0, maxLongTaskMs: 0, overBudget: []}
};
const compactReport = {
  ...finalReport,
  setupLongTasks,
  longTasks,
  fallbackLocalStorage,
  indexedDbRecord,
  normal,
  performance: finalReport.performance
};

try {
  evidence.setResult(finalReport, compactReport);
  assert.ok([10000, 100000].includes(requestedCells), "只支持 10000 或 100000 cells 回归");
  assert.ok(existsSync(distDir), `构建产物不存在：${distDir}`);
  evidence.mark("server-start", {active: `browser-storage-fallback-${requestedCells}`});
  const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
  server = await startStaticServer();
  evidence.mark("browser-start", {active: `browser-storage-fallback-${requestedCells}`, complete: "server-start"});
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  context = await browser.newContext({viewport: {width: 1440, height: 900}});
  await context.addInitScript(key => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function patchedSetItem(name, value) {
      if (name === key) {
        const error = new DOMException("quota", "QuotaExceededError");
        throw error;
      }
      return originalSetItem.call(this, name, value);
    };
  }, storageKey);
  const page = await context.newPage();
  await prepareTask350LongTaskObserver(page);
  page.setDefaultTimeout(120000);
  page.on("console", message => {
    if (message.type() !== "error") return;
    if (message.text().startsWith("[FMG health]")) healthEvents.push(message.text());
    else consoleErrors.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`http://${host}:${port}/?healthClear=1`, {waitUntil: "domcontentloaded"});
  await page.waitForFunction(() => window.__webglGeneratorApp?.renderer?.getStats?.()?.webgl2);
  await page.waitForFunction(() => window.__webglGeneratorApp?.runtimeOperationSnapshot?.busy === false && document.getElementById("generation-loading")?.hidden !== false);
  evidence.mark("browser-evaluation", {active: `browser-storage-fallback-${requestedCells}`, complete: "browser-start"});
  const generated = await page.evaluate(async ({seed, cellsTarget}) => window.webglGeneratorApi.generate.newMap({confirm: true, seed, cellsTarget}), {seed: fallbackSeed, cellsTarget: requestedCells});
  finalReport.generated = generated;
  compactReport.generated = generated;
  assert.equal(generated.ok, true, generated.error?.message || "fallback 测试地图生成失败");
  await page.waitForFunction(seed => window.__webglGeneratorApp?.runtimeOperationSnapshot?.busy === false && window.__webglGeneratorApp?.map?.metadata?.seed === seed, fallbackSeed);
  setupLongTasks.push(...await collectTask350LongTaskWindow(page, `fallback-setup-${requestedCells}`));
  await resetTask350LongTaskWindow(page);

  for (let index = 0; index < 3; index += 1) {
    const sample = await page.evaluate(() => window.webglGeneratorApi.data.saveBrowserMap({toast: false}));
    savedSamples.push(sample?.data || null);
    assert.equal(sample.ok, true, sample.error?.message || "IndexedDB fallback 保存失败");
    assert.equal(sample.data.storageBackend, "indexedDB");
    assert.ok(sample.data.effects.includes("browser-storage-binary-write"), "默认存档没有走直接二进制 IndexedDB");
    assert.equal(sample.data.effects.includes("browser-storage-fallback-write"), false, "直接二进制存档被误报为 quota fallback");
    assert.equal(sample.data.storageBytes, sample.data.bytes, "二进制存档仍包含 base64/envelope 膨胀");
    assert.equal(sample.data.timings.base64Ms, 0, "二进制存档仍执行了 base64");
    assert.equal(sample.data.timings.encodingMs, 0, "二进制存档仍执行了文本编码");
  }
  const saved = {data: savedSamples.at(-1)};
  finalReport.saved = saved.data;
  compactReport.saved = saved.data;
  fallbackLocalStorage = await page.evaluate(key => localStorage.getItem(key), storageKey);
  compactReport.fallbackLocalStorage = fallbackLocalStorage;
  assert.equal(fallbackLocalStorage, null, "quota fallback 不应写入 LocalStorage");
  indexedDbRecord = await readIndexedDbRecord(page);
  compactReport.indexedDbRecord = indexedDbRecord;
  assert.equal(indexedDbRecord.rawType, "object", "direct-binary IndexedDB record 不再保存结构化 payload");
  assert.equal(indexedDbRecord.type, "webgl-generator-browser-map-gzip");
  assert.equal(indexedDbRecord.dataBytes, saved.data.bytes);
  assert.equal(indexedDbRecord.bytes, saved.data.bytes);

  const restored = await page.evaluate(() => window.webglGeneratorApi.data.restoreBrowserMap({confirm: true, toast: false}));
  finalReport.restored = restored.data;
  compactReport.restored = restored.data;
  assert.equal(restored.ok, true, restored.error?.message || "IndexedDB fallback 恢复失败");
  assert.equal(restored.data.storageBackend, "indexedDB");
  assert.ok(restored.data.effects.includes("browser-storage-binary-read"));
  assert.equal(restored.data.effects.includes("browser-storage-fallback-read"), false);
  const state = await page.evaluate(() => ({seed: window.__webglGeneratorApp.map.metadata.seed, gridCells: window.__webglGeneratorApp.map.grid.cells.i.length}));
  finalReport.state = state;
  compactReport.state = state;
  assert.equal(state.seed, fallbackSeed);
  assert.ok(state.gridCells >= requestedCells * 0.95, `实际 grid cells 过少：${state.gridCells}`);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  const saveTiming = summarizeDurations(savedSamples.map(sample => sample.operation?.durationMs));
  finalReport.saveTiming = saveTiming;
  compactReport.saveTiming = saveTiming;
  longTasks.push(...await collectTask350LongTaskWindow(page, `fallback-${requestedCells}`));
  if (requestedCells === 10000) {
    normalContext = await browser.newContext({viewport: {width: 1440, height: 900}});
    const normalPage = await normalContext.newPage();
    await prepareTask350LongTaskObserver(normalPage);
    normalPage.setDefaultTimeout(120000);
    const normalConsoleErrors = [];
    const normalPageErrors = [];
    normalPage.on("console", message => {
      if (message.type() === "error" && !message.text().startsWith("[FMG health]")) normalConsoleErrors.push(message.text());
    });
    normalPage.on("pageerror", error => normalPageErrors.push(error.message));
    await normalPage.goto(`http://${host}:${port}/?healthClear=1`, {waitUntil: "domcontentloaded"});
    await normalPage.waitForFunction(() => window.__webglGeneratorApp?.renderer?.getStats?.()?.webgl2);
    await normalPage.waitForFunction(() => window.__webglGeneratorApp?.runtimeOperationSnapshot?.busy === false && document.getElementById("generation-loading")?.hidden !== false);
    const normalGenerated = await normalPage.evaluate(async () => window.webglGeneratorApi.generate.newMap({confirm: true, seed: "browser-storage-local", cellsTarget: 10000}));
    assert.equal(normalGenerated.ok, true, normalGenerated.error?.message || "直接二进制存储测试地图生成失败");
    setupLongTasks.push(...await collectTask350LongTaskWindow(normalPage, "direct-binary-setup-10000"));
    await resetTask350LongTaskWindow(normalPage);
    const normalSaved = await normalPage.evaluate(() => window.webglGeneratorApi.data.saveBrowserMap({toast: false}));
    assert.equal(normalSaved.ok, true, normalSaved.error?.message || "直接二进制保存失败");
    assert.equal(normalSaved.data.storageBackend, "indexedDB");
    assert.equal(normalSaved.data.encoding, "gzip");
    assert.ok(normalSaved.data.effects.includes("browser-storage-binary-write"));
    const normalLocalStorage = await normalPage.evaluate(key => localStorage.getItem(key), storageKey);
    assert.equal(normalLocalStorage, null);
    const normalIndexedDbRecord = await readIndexedDbRecord(normalPage);
    assert.equal(normalIndexedDbRecord.rawType, "object");
    assert.equal(normalIndexedDbRecord.type, "webgl-generator-browser-map-gzip");
    assert.equal(normalIndexedDbRecord.dataBytes, normalSaved.data.bytes);
    assert.equal(normalIndexedDbRecord.bytes, normalSaved.data.bytes);
    const normalRestored = await normalPage.evaluate(() => window.webglGeneratorApi.data.restoreBrowserMap({confirm: true, toast: false}));
    assert.equal(normalRestored.ok, true, normalRestored.error?.message || "直接二进制恢复失败");
    assert.equal(normalRestored.data.storageBackend, "indexedDB");
    assert.ok(normalRestored.data.effects.includes("browser-storage-binary-read"));
    assert.equal(normalRestored.data.effects.includes("browser-storage-fallback-read"), false);
    assert.deepEqual(normalConsoleErrors, []);
    assert.deepEqual(normalPageErrors, []);
    longTasks.push(...await collectTask350LongTaskWindow(normalPage, "direct-binary-10000"));
    normal = {generated: normalGenerated, saved: normalSaved.data, localStorage: normalLocalStorage, indexedDbRecord: normalIndexedDbRecord, restored: normalRestored.data, consoleErrors: normalConsoleErrors, pageErrors: normalPageErrors};
    finalReport.normal = {saved: normal.saved, restored: normal.restored};
    compactReport.normal = normal;
  }
  const performance = summarizeTask350LongTasks(longTasks, 200);
  finalReport.performance = performance;
  compactReport.performance = performance;
  const overBudget = performance.overBudget;
  assert.deepEqual(overBudget, [], `浏览器存储 fallback 目标窗口出现 >200ms LongTask：${JSON.stringify(overBudget)}`);
  finalReport.ok = true;
  compactReport.ok = true;
  evidence.succeed();
  console.log(JSON.stringify(finalReport, null, 2));
} catch (error) {
  evidence.fail(error);
  thrownError = error;
} finally {
  for (const [label, close] of [
    ["browser-storage-fallback-normal-context", normalContext ? () => normalContext.close() : null],
    ["browser-storage-fallback-context", context ? () => context.close() : null],
    ["browser-storage-fallback-browser", browser ? () => browser.close() : null],
    ["browser-storage-fallback-server", server ? () => new Promise((resolveClose, rejectClose) => server.close(error => error ? rejectClose(error) : resolveClose())) : null]
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

async function readIndexedDbRecord(page) {
  return page.evaluate(async () => {
    const request = indexedDB.open("webgl-generator-map-storage-v1", 1);
    const db = await new Promise((resolveOpen, rejectOpen) => {
      request.onsuccess = () => resolveOpen(request.result);
      request.onerror = () => rejectOpen(request.error);
    });
    try {
      const transaction = db.transaction("maps", "readonly");
      const recordRequest = transaction.objectStore("maps").get("current");
      const record = await new Promise((resolveRecord, rejectRecord) => {
        recordRequest.onsuccess = () => resolveRecord(recordRequest.result);
        recordRequest.onerror = () => rejectRecord(recordRequest.error);
      });
      return {
        rawType: typeof record?.raw,
        type: record?.raw?.type || "",
        bytes: Number(record?.raw?.bytes) || 0,
        dataBytes: Number(record?.raw?.data?.byteLength) || 0
      };
    } finally {
      db.close();
    }
  });
}

async function startStaticServer() {
  const serverInstance = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, `http://${host}:${port}`).pathname);
    let target = resolve(distDir, "." + normalize(pathname));
    if (pathname === "/" || !existsSync(target) || statSync(target).isDirectory()) target = join(distDir, "index.html");
    if (!target.startsWith(distDir) || !existsSync(target)) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {"content-type": contentType(target), "cache-control": "no-store"});
    createReadStream(target).pipe(response);
  });
  await new Promise((resolveListen, rejectListen) => serverInstance.listen(port, host, resolveListen).once("error", rejectListen));
  return serverInstance;
}

function contentType(file) {
  return ({".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png"})[extname(file).toLowerCase()] || "application/octet-stream";
}

function summarizeDurations(values) {
  const durations = values.filter(value => Number.isFinite(value)).sort((left, right) => left - right);
  if (!durations.length) return {count: 0, p50: null, p95: null, max: null};
  return {
    count: durations.length,
    p50: percentile(durations, 0.5),
    p95: percentile(durations, 0.95),
    max: durations.at(-1)
  };
}

function percentile(values, ratio) {
  const index = Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1);
  return values[Math.max(0, index)];
}
