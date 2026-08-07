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
const distDir = resolve(join(rootDir, "dist", "webgl-generator"));
const args = parseArgs(process.argv.slice(2));
const host = String(args.host || "127.0.0.1");
const port = Number(args.port || 5465);
const cells = Number(args.cells || 10000);
const seed = String(args.seed || `task-284-export-history-${cells}`);
const timeoutMs = Number(args.timeout || 300000);
const outPath = resolve(args.out || join(rootDir, "docs", "generated", "reports", `task-284-export-history-${cells}-d1.json`));

assert(existsSync(distDir), `构建产物不存在：${distDir}`);
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const server = await startStaticServer();
let browser;
try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const context = await browser.newContext({viewport: {width: 1280, height: 820}, deviceScaleFactor: 1});
  await context.addInitScript(() => localStorage.clear());
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && !message.text().startsWith("[FMG health]") && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");

  await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded", timeout: timeoutMs});
  await waitForApiReady(page, timeoutMs);
  const generated = await page.evaluate(async ({cells, seed}) => {
    const response = await window.webglGeneratorApi.generate.newMap({confirm: true, seed, cellsTarget: cells, heightmapTemplate: "continents"});
    if (!response?.ok) throw new Error(response?.error?.message || "地图生成失败");
    const summary = window.webglGeneratorApi.info.mapSummary().data;
    return {summary, history: window.webglGeneratorApi.history.get().data};
  }, {cells, seed});

  const panels = await profilePanels(page, cdp);

  const exports = [];
  exports.push(await probe(page, cdp, "完整 JSON 导出", async () => {
    const result = await window.webglGeneratorApi.data.exportAll({download: false, includeText: true});
    if (!result?.ok) throw new Error(result?.error?.message || "完整 JSON 导出失败");
    return {bytes: result.data.bytes, textBytes: result.data.text?.length || 0, checksum: result.data.metadata?.checksum || ""};
  }));
  exports.push(await probe(page, cdp, "gzip 导出（Blob）", async () => {
    const result = await window.webglGeneratorApi.data.exportCompressedAll({download: false, includeBase64: false, includeBlob: true});
    if (!result?.ok) throw new Error(result?.error?.message || "gzip 导出失败");
    return {originalBytes: result.data.originalBytes, compressedBytes: result.data.compressedBytes, blobBytes: result.data.blob?.size || 0};
  }));
  exports.push(await probe(page, cdp, "gzip 导出（base64）", async () => {
    const result = await window.webglGeneratorApi.data.exportCompressedAll({download: false, includeBase64: true});
    if (!result?.ok) throw new Error(result?.error?.message || "gzip base64 导出失败");
    return {originalBytes: result.data.originalBytes, compressedBytes: result.data.compressedBytes, base64Bytes: result.data.base64?.length || 0};
  }));
  exports.push(await probe(page, cdp, "PNG 导出", async () => {
    const result = await window.webglGeneratorApi.data.exportPNG({download: false, pixelScale: 1, includeDataUrl: false});
    if (!result?.ok) throw new Error(result?.error?.message || "PNG 导出失败");
    return {bytes: result.data.bytes, width: result.data.width, height: result.data.height};
  }));
  exports.push(await probe(page, cdp, "高度图导出", async () => {
    const result = await window.webglGeneratorApi.data.exportHeightmapPNG({download: false, pixelScale: 1, includeDataUrl: false});
    if (!result?.ok) throw new Error(result?.error?.message || "高度图导出失败");
    return {bytes: result.data.bytes, width: result.data.width, height: result.data.height, cellCount: result.data.cellCount};
  }));

  const history = await profileHistory(page, cdp);
  const finalState = await page.evaluate(() => ({
    summary: window.webglGeneratorApi.info.mapSummary().data,
    history: window.webglGeneratorApi.history.get().data,
    renderer: window.__webglGeneratorApp.renderer.getStats(),
    health: (window.__webglGeneratorApp.health?.getEvents?.() || []).filter(event => event.severity === "error").length
  }));
  const report = {
    metadata: {generatedAt: new Date().toISOString(), cells, seed, url: `http://${host}:${port}`, distDir},
    generated,
    panels,
    exports,
    history,
    final: {
      checksum: finalState.summary.checksum,
      mapRevision: finalState.summary.mapRevision,
      history: finalState.history,
      webgl: finalState.renderer.draw?.glError || 0,
      healthErrors: finalState.health
    },
    errors: {console: consoleErrors, page: pageErrors}
  };
  await import("node:fs").then(({writeFileSync}) => writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"));
  console.log(JSON.stringify(report, null, 2));
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  assert.equal(finalState.renderer.draw?.glError || 0, 0);
  assert.equal(finalState.health, 0);
  assert.equal(finalState.summary.checksum, generated.summary.checksum);
  await context.close();
} finally {
  if (browser) await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}

async function profileHistory(page, cdp) {
  const cell = await page.evaluate(() => {
    const value = Number(window.__webglGeneratorApp.map.grid.cells.h[0]);
    return {before: value, after: value === 100 ? 99 : value + 1};
  });
  const applied = await probe(page, cdp, "高度编辑提交（历史基线）", async ({cell}) => {
    const result = window.webglGeneratorApi.edit.height.applyChanges([{gridCell: 0, after: cell.after}]);
    if (!result?.ok || !result.data?.executed) throw new Error(result?.error?.message || "高度编辑提交失败");
    return {executed: result.data.executed, history: window.webglGeneratorApi.history.get().data};
  }, {cell});
  const undo = await probe(page, cdp, "撤销", async () => {
    const result = window.webglGeneratorApi.history.undo();
    if (!result?.ok) throw new Error(result?.error?.message || "撤销失败");
    return {history: window.webglGeneratorApi.history.get().data};
  });
  const redo = await probe(page, cdp, "重做", async () => {
    const result = window.webglGeneratorApi.history.redo();
    if (!result?.ok) throw new Error(result?.error?.message || "重做失败");
    return {history: window.webglGeneratorApi.history.get().data};
  });
  const restore = await probe(page, cdp, "撤销恢复原值", async () => {
    const result = window.webglGeneratorApi.history.undo();
    if (!result?.ok) throw new Error(result?.error?.message || "恢复失败");
    return {history: window.webglGeneratorApi.history.get().data};
  });
  const restored = await page.evaluate(({before}) => Number(window.__webglGeneratorApp.map.grid.cells.h[0]) === before, cell);
  return {cell, applied, undo, redo, restore, restored};
}

async function profilePanels(page, cdp) {
  const results = [];
  results.push(await probe(page, cdp, "控制面板打开", async () => {
    const waitFor = predicate => new Promise((resolve, reject) => {
      const deadline = performance.now() + 30000;
      function tick() { if (predicate()) return resolve(); if (performance.now() > deadline) return reject(new Error("等待面板打开超时")); requestAnimationFrame(tick); }
      tick();
    });
    document.getElementById("open-generation-panel")?.click();
    await waitFor(() => document.querySelector('.floating-panel[data-panel-id="generation-panel"]:not(.hidden) .vue-control-panel-root'));
    return {visible: true, width: document.querySelector('.floating-panel[data-panel-id="generation-panel"]:not(.hidden) .vue-control-panel-root')?.getBoundingClientRect().width || 0};
  }));
  results.push(await probe(page, cdp, "管理面板打开", async () => {
    const waitFor = predicate => new Promise((resolve, reject) => {
      const deadline = performance.now() + 30000;
      function tick() { if (predicate()) return resolve(); if (performance.now() > deadline) return reject(new Error("等待面板打开超时")); requestAnimationFrame(tick); }
      tick();
    });
    document.querySelector("[data-control-tab='management']")?.click();
    await waitFor(() => document.querySelector("[data-control-panel='management']:not([hidden])"));
    return {visible: true};
  }));
  for (const panel of [
    {button: "open-state-panel", id: "state-panel", label: "国家编辑面板打开"},
    {button: "open-city-panel", id: "city-panel", label: "城市管理面板打开"},
    {button: "open-route-panel", id: "route-panel", label: "路线管理面板打开"}
  ]) {
    results.push(await probe(page, cdp, panel.label, async ({button, id}) => {
      const waitFor = predicate => new Promise((resolve, reject) => {
        const deadline = performance.now() + 30000;
        function tick() { if (predicate()) return resolve(); if (performance.now() > deadline) return reject(new Error("等待面板打开超时")); requestAnimationFrame(tick); }
        tick();
      });
      document.getElementById(button)?.click();
      await waitFor(() => {
        const root = document.querySelector(`.floating-panel[data-panel-id="${id}"]:not(.hidden)`);
        const text = root?.querySelector(".floating-panel-body")?.textContent || "";
        return root && !text.includes("正在加载") && !text.includes("将在首次打开时加载");
      });
      const root = document.querySelector(`.floating-panel[data-panel-id="${id}"]:not(.hidden)`);
      return {
        visible: Boolean(root),
        width: root?.getBoundingClientRect().width || 0,
        height: root?.getBoundingClientRect().height || 0,
        rows: root?.querySelectorAll(".object-table-row, .el-table__body-wrapper tbody tr").length || 0
      };
    }, panel));
  }
  await page.evaluate(() => {
    for (const button of document.querySelectorAll(".floating-panel:not(.hidden) .floating-panel-close")) {
      button.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true, view: window}));
    }
  });
  return results;
}

async function probe(page, cdp, label, operation, input) {
  await page.evaluate(() => {
    window.__task284Probe = {longTasks: [], observer: null};
    if ("PerformanceObserver" in window) {
      try {
        const observer = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) window.__task284Probe.longTasks.push({startTime: entry.startTime, duration: entry.duration});
        });
        observer.observe({entryTypes: ["longtask"]});
        window.__task284Probe.observer = observer;
      } catch {}
    }
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve())));
  const before = await readMemory(page);
  const metricsBefore = await cdp.send("Performance.getMetrics");
  const startedAt = performanceNow(metricsBefore);
  let data;
  let error = null;
  try {
    data = await page.evaluate(operation, input);
  } catch (caught) {
    error = caught?.message || String(caught);
  }
  const metricsAfter = await cdp.send("Performance.getMetrics");
  const finishedAt = performanceNow(metricsAfter);
  await page.waitForTimeout(50);
  const longTasks = await page.evaluate(() => {
    window.__task284Probe.observer?.disconnect?.();
    const roundValue = value => Math.round((Number(value) || 0) * 10) / 10;
    return window.__task284Probe.longTasks.map(item => ({duration: roundValue(item.duration), startTime: roundValue(item.startTime)}));
  });
  const after = await readMemory(page);
  await cdp.send("HeapProfiler.collectGarbage").catch(() => {});
  const afterGc = await readMemory(page);
  return {
    label,
    elapsedMs: round(finishedAt - startedAt),
    before,
    after,
    afterGc,
    heapDeltaBytes: after.usedJSHeapSize - before.usedJSHeapSize,
    retainedAfterGcBytes: afterGc.usedJSHeapSize - before.usedJSHeapSize,
    longTasks,
    result: data || null,
    error
  };
}

async function readMemory(page) {
  return page.evaluate(() => {
    const memory = performance.memory;
    return memory ? {usedJSHeapSize: memory.usedJSHeapSize, totalJSHeapSize: memory.totalJSHeapSize, jsHeapSizeLimit: memory.jsHeapSizeLimit} : null;
  });
}

function performanceNow(metrics) {
  const metric = metrics.metrics?.find(item => item.name === "Timestamp");
  return Number(metric?.value || 0) * 1000;
}

function round(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const [key, inline] = arg.slice(2).split("=");
    result[key] = inline ?? argv[++index] ?? true;
  }
  return result;
}

async function startStaticServer() {
  const server = createServer((request, response) => {
    const url = new URL(request.url || "/", `http://${host}:${port}`);
    const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const target = resolve(distDir, `.${normalize(pathname)}`);
    if (!target.startsWith(distDir)) return void response.writeHead(403).end("Forbidden");
    if (!existsSync(target) || !statSync(target).isFile()) return void response.writeHead(404).end("Not found");
    response.writeHead(200, {"content-type": contentType(target), "cache-control": "no-store"});
    createReadStream(target).pipe(response);
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, host, resolveListen);
  });
  return server;
}

function contentType(path) {
  const ext = extname(path).toLowerCase();
  return ({".html": "text/html;charset=utf-8", ".js": "text/javascript", ".css": "text/css"})[ext] || "application/octet-stream";
}
