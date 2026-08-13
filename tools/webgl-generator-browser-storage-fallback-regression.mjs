#!/usr/bin/env node
import assert from "node:assert/strict";
import {createReadStream, existsSync, statSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {dirname, extname, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const distDir = join(rootDir, "dist", "webgl-generator");
const host = "127.0.0.1";
const port = 5473;
const storageKey = "webgl-generator-current-map-v1";
const requestedCells = Number(process.argv[2] || 10000);
assert.ok([10000, 100000].includes(requestedCells), "只支持 10000 或 100000 cells 回归");
const fallbackSeed = `browser-storage-fallback-${requestedCells}`;
assert.ok(existsSync(distDir), `构建产物不存在：${distDir}`);

const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const server = await startStaticServer();
let browser;

try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const context = await browser.newContext({viewport: {width: 1440, height: 900}});
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
  page.setDefaultTimeout(120000);
  const consoleErrors = [];
  const healthEvents = [];
  const pageErrors = [];
  page.on("console", message => {
    if (message.type() !== "error") return;
    if (message.text().startsWith("[FMG health]")) healthEvents.push(message.text());
    else consoleErrors.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`http://${host}:${port}/?healthClear=1`, {waitUntil: "domcontentloaded"});
  await page.waitForFunction(() => window.__webglGeneratorApp?.renderer?.getStats?.()?.webgl2);
  await page.waitForFunction(() => window.__webglGeneratorApp?.runtimeOperationSnapshot?.busy === false && document.getElementById("generation-loading")?.hidden !== false);
  const generated = await page.evaluate(async ({seed, cellsTarget}) => window.webglGeneratorApi.generate.newMap({confirm: true, seed, cellsTarget}), {seed: fallbackSeed, cellsTarget: requestedCells});
  assert.equal(generated.ok, true, generated.error?.message || "fallback 测试地图生成失败");
  await page.waitForFunction(seed => window.__webglGeneratorApp?.runtimeOperationSnapshot?.busy === false && window.__webglGeneratorApp?.map?.metadata?.seed === seed, fallbackSeed);

  const savedSamples = [];
  for (let index = 0; index < 3; index += 1) {
    const sample = await page.evaluate(() => window.webglGeneratorApi.data.saveBrowserMap({toast: false}));
    assert.equal(sample.ok, true, sample.error?.message || "IndexedDB fallback 保存失败");
    assert.equal(sample.data.storageBackend, "indexedDB");
    assert.ok(sample.data.effects.includes("browser-storage-binary-write"), "默认存档没有走直接二进制 IndexedDB");
    assert.equal(sample.data.effects.includes("browser-storage-fallback-write"), false, "直接二进制存档被误报为 quota fallback");
    assert.equal(sample.data.storageBytes, sample.data.bytes, "二进制存档仍包含 base64/envelope 膨胀");
    assert.equal(sample.data.timings.base64Ms, 0, "二进制存档仍执行了 base64");
    assert.equal(sample.data.timings.encodingMs, 0, "二进制存档仍执行了文本编码");
    savedSamples.push(sample.data);
  }
  const saved = {data: savedSamples.at(-1)};
  assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), null, "quota fallback 不应写入 LocalStorage");
  const indexedDbRecord = await page.evaluate(async () => {
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
  if (requestedCells === 100000) {
    assert.equal(indexedDbRecord.type, "webgl-generator-browser-map-gzip");
    assert.equal(indexedDbRecord.dataBytes, saved.data.bytes);
    assert.equal(indexedDbRecord.bytes, saved.data.bytes);
  } else {
    assert.equal(indexedDbRecord.rawType, "string", "10k quota fallback 不再保存兼容 envelope");
  }

  const restored = await page.evaluate(() => window.webglGeneratorApi.data.restoreBrowserMap({confirm: true, toast: false}));
  assert.equal(restored.ok, true, restored.error?.message || "IndexedDB fallback 恢复失败");
  assert.equal(restored.data.storageBackend, "indexedDB");
  if (requestedCells === 100000) assert.ok(restored.data.effects.includes("browser-storage-binary-read"));
  else assert.ok(restored.data.effects.includes("browser-storage-fallback-read"));
  const state = await page.evaluate(() => ({seed: window.__webglGeneratorApp.map.metadata.seed, gridCells: window.__webglGeneratorApp.map.grid.cells.i.length}));
  assert.equal(state.seed, fallbackSeed);
  assert.ok(state.gridCells >= requestedCells * 0.95, `实际 grid cells 过少：${state.gridCells}`);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  const saveTiming = summarizeDurations(savedSamples.map(sample => sample.operation?.durationMs));
  const normalContext = requestedCells === 10000 ? await browser.newContext({viewport: {width: 1440, height: 900}}) : null;
  try {
    if (normalContext) {
      const normalPage = await normalContext.newPage();
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
      const normalSaved = await normalPage.evaluate(() => window.webglGeneratorApi.data.saveBrowserMap({toast: false}));
      assert.equal(normalSaved.ok, true, normalSaved.error?.message || "直接二进制保存失败");
      assert.equal(normalSaved.data.storageBackend, "indexedDB");
      assert.equal(normalSaved.data.encoding, "gzip");
      assert.ok(normalSaved.data.effects.includes("browser-storage-binary-write"));
      assert.equal(await normalPage.evaluate(key => localStorage.getItem(key), storageKey), null);
      const normalRestored = await normalPage.evaluate(() => window.webglGeneratorApi.data.restoreBrowserMap({confirm: true, toast: false}));
      assert.equal(normalRestored.ok, true, normalRestored.error?.message || "直接二进制恢复失败");
      assert.equal(normalRestored.data.storageBackend, "indexedDB");
      assert.deepEqual(normalConsoleErrors, []);
      assert.deepEqual(normalPageErrors, []);
      console.log(JSON.stringify({ok: true, requestedCells, url: `http://${host}:${port}/?healthClear=1`, saved: saved.data, saveSamples: savedSamples.map(sample => ({durationMs: sample.operation?.durationMs, originalBytes: sample.originalBytes, bytes: sample.bytes, storageBytes: sample.storageBytes, timings: sample.timings})), saveTiming, restored: restored.data, state, normal: {saved: normalSaved.data, restored: normalRestored.data}, consoleErrors, pageErrors, healthEvents}, null, 2));
    } else {
      console.log(JSON.stringify({ok: true, requestedCells, url: `http://${host}:${port}/?healthClear=1`, saved: saved.data, saveSamples: savedSamples.map(sample => ({durationMs: sample.operation?.durationMs, originalBytes: sample.originalBytes, bytes: sample.bytes, storageBytes: sample.storageBytes, timings: sample.timings})), saveTiming, restored: restored.data, state, consoleErrors, pageErrors, healthEvents}, null, 2));
    }
  } finally {
    if (normalContext) await normalContext.close();
  }
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(done => server.close(done));
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

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
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
