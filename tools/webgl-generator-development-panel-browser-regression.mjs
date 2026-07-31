#!/usr/bin/env node
import assert from "node:assert/strict";
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
const port = 5455;
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const viewports = [
  {width: 1440, height: 900, label: "desktop"},
  {width: 480, height: 820, label: "480px"},
  {width: 390, height: 760, label: "390px"},
  {width: 320, height: 700, label: "320px / 150% effective"}
];

assert.ok(existsSync(distDir), `构建产物不存在：${distDir}`);
const server = await startStaticServer();
let browser;
try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const results = [];
  for (const viewport of viewports) results.push(await runViewportCase(browser, viewport));
  console.log(JSON.stringify({ok: true, results}, null, 2));
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(done => server.close(done));
}

async function runViewportCase(browserInstance, viewport) {
  const context = await browserInstance.newContext({viewport: {width: viewport.width, height: viewport.height}, deviceScaleFactor: 1});
  await context.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("webgl-generator-panel:development-panel", JSON.stringify({
      positionMode: "manual",
      left: 24,
      top: 72,
      width: 360,
      openedAt: 0
    }));
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));
  try {
    await page.goto(`http://${host}:${port}?debug=1&healthClear=1`, {waitUntil: "domcontentloaded"});
    await waitForApiReady(page, 60000);
    await page.waitForSelector('.floating-panel[data-panel-id="development-panel"]:not(.hidden)');
    consoleErrors.length = 0;
    pageErrors.length = 0;
    await page.evaluate(() => {
      window.__webglGeneratorHealth?.clear?.();
      window.__webglGeneratorDebug?.clearHealthEvents?.();
    });

    const metrics = await page.evaluate(() => {
      const panel = document.querySelector('.floating-panel[data-panel-id="development-panel"]');
      const body = panel.querySelector(".floating-panel-body");
      const log = panel.querySelector(".development-generation-log dd");
      const traceItem = panel.querySelector("#development-load-trace li");
      const rect = panel.getBoundingClientRect();
      const rendererStats = window.__webglGeneratorApp?.renderer?.getStats?.();
      return {
        viewport: {width: innerWidth, height: innerHeight},
        panel: {left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height},
        body: {clientWidth: body.clientWidth, scrollWidth: body.scrollWidth, clientHeight: body.clientHeight, scrollHeight: body.scrollHeight},
        log: {
          clientWidth: log.clientWidth,
          scrollWidth: log.scrollWidth,
          clientHeight: log.clientHeight,
          scrollHeight: log.scrollHeight,
          overflowX: getComputedStyle(log).overflowX,
          whiteSpace: getComputedStyle(log).whiteSpace
        },
        traceWhiteSpace: getComputedStyle(traceItem).whiteSpace,
        document: {clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth},
        webglError: rendererStats?.draw?.glError ?? null
      };
    });

    const expectedWidth = Math.min(680, viewport.width - 16);
    assert.ok(Math.abs(metrics.panel.width - expectedWidth) <= 1, `${viewport.label} 旧窄宽度没有迁移到响应式下限`);
    assert.ok(metrics.panel.left >= 0 && metrics.panel.right <= viewport.width + 1, `${viewport.label} 面板横向越界`);
    assert.ok(metrics.panel.top >= 0 && metrics.panel.bottom <= viewport.height + 1, `${viewport.label} 面板纵向越界`);
    assert.equal(metrics.document.scrollWidth, metrics.document.clientWidth, `${viewport.label} document 出现横向溢出`);
    assert.ok(metrics.body.scrollHeight > metrics.body.clientHeight, `${viewport.label} 面板正文没有独立滚动`);
    assert.equal(metrics.log.overflowX, "auto", `${viewport.label} 生成日志没有局部滚动`);
    assert.equal(metrics.log.whiteSpace, "pre", `${viewport.label} 生成日志没有保持逐条单行`);
    assert.equal(metrics.traceWhiteSpace, "nowrap", `${viewport.label} 加载追踪仍在任意换行`);
    assert.equal(metrics.webglError, 0, `${viewport.label} WebGL error 非 0`);

    await page.getByRole("button", {name: "收起", exact: true}).click();
    await page.waitForSelector('.floating-panel[data-panel-id="development-panel"]', {state: "hidden"});
    await page.locator("#open-development-panel").click();
    await page.waitForSelector('.floating-panel[data-panel-id="development-panel"]:not(.hidden)');
    await page.locator("#ai-bridge-connect").scrollIntoViewIfNeeded();
    assert.equal(await page.locator("#ai-bridge-connect").isVisible(), true, `${viewport.label} AI 调试入口不可达`);

    const health = await page.evaluate(() => {
      const events = window.__webglGeneratorHealth?.getEvents?.(200) || [];
      return {events: events.filter(event => event?.severity === "error"), total: events.filter(event => event?.severity === "error").length};
    });
    const diagnostics = partitionApiBrowserDiagnostics(health, consoleErrors);
    assert.deepEqual(diagnostics.healthErrors.events, [], `${viewport.label} 出现应用 health error`);
    assert.deepEqual(diagnostics.consoleErrors, [], `${viewport.label} 出现应用控制台错误`);
    assert.deepEqual(pageErrors, [], `${viewport.label} 出现页面错误`);
    return {label: viewport.label, metrics, performanceTelemetry: diagnostics.healthErrors.performanceTelemetry};
  } finally {
    await context.close();
  }
}

async function startStaticServer() {
  const serverInstance = createServer((request, response) => {
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
    serverInstance.once("error", fail);
    serverInstance.listen(port, host, done);
  });
  return serverInstance;
}

function contentType(file) {
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml"
  })[extname(file).toLowerCase()] || "application/octet-stream";
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}
