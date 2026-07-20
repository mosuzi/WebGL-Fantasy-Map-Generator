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
const screenshotPath = join(rootDir, "docs", "generated", "screenshots", "seafloor-reset-applied.png");
const host = "127.0.0.1";
const port = 5474;
assert.ok(existsSync(distDir), "构建产物不存在：" + distDir);

const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const server = await startStaticServer();
let browser;

try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  page.setDefaultTimeout(90000);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("dialog", dialog => dialog.accept());

  await page.goto("http://" + host + ":" + port + "?healthClear=1", {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 45000);
  await page.evaluate(() => localStorage.clear());
  const generation = await page.evaluate(() => window.webglGeneratorApi.generate.newMap({
    confirm: true,
    seed: "seafloor-reset-browser-regression",
    cellsTarget: 10000
  }));
  assert.equal(generation?.ok, true, generation?.error?.message || "回归地图生成失败");
  await waitForApiReady(page, 45000);
  const hiddenOceanHeight = await page.evaluate(() => window.webglGeneratorApi.layers.setShowOceanHeight(false));
  assert.equal(hiddenOceanHeight?.ok, true, hiddenOceanHeight?.error?.message || "无法关闭海底显示以准备回归");

  await page.evaluate(() => document.getElementById("open-height-panel")?.click());
  await page.getByRole("button", {name: "预览新海底", exact: true}).click();
  await page.waitForFunction(() => Boolean(window.__webglGeneratorApp?.panels?.height?.getSeafloorResetPreview?.()?.valid));

  const before = await page.evaluate(() => {
    const state = window.__webglGeneratorApp;
    return {
      gridHeights: Array.from(state.map.grid.cells.h),
      packHeights: Array.from(state.map.pack.cells.h),
      preview: state.panels.height.getSeafloorResetPreview(),
      history: state.editHistory.getStats(),
      showOceanHeight: state.renderer.getStats().viewOptions.showOceanHeight
    };
  });
  assert.ok(before.preview.changedCells > 0, "预览没有产生海底高度变化");

  await page.getByRole("button", {name: "应用重设", exact: true}).click();
  await page.waitForFunction(previousUndo => {
    const state = window.__webglGeneratorApp;
    return !state.runtimeOperation?.getSnapshot?.().busy
      && !state.panels.height?.getSeafloorResetPreview?.()
      && state.editHistory?.getStats?.().undo > previousUndo;
  }, before.history.undo, {timeout: 90000});

  const after = await page.evaluate(beforeHeights => {
    const state = window.__webglGeneratorApp;
    const gridHeights = Array.from(state.map.grid.cells.h);
    const packHeights = Array.from(state.map.pack.cells.h);
    return {
      gridChanged: gridHeights.reduce((count, height, cell) => count + Number(height !== beforeHeights.grid[cell]), 0),
      packChanged: packHeights.reduce((count, height, cell) => count + Number(height !== beforeHeights.pack[cell]), 0),
      history: state.editHistory.getStats(),
      historyLabel: state.editHistory.getStats().lastLabel,
      notice: state.heightEdit.lastNotice,
      status: document.getElementById("file-operation-status")?.textContent || "",
      previewCells: state.renderer?.heightTransformPreviewStats?.cells || 0,
      showOceanHeight: state.renderer?.getStats?.().viewOptions?.showOceanHeight,
      oceanHeightControl: (() => {
        const control = document.getElementById("show-ocean-height");
        return control ? {
          tagName: control.tagName,
          checked: "checked" in control ? control.checked : null,
          pressed: control.getAttribute("aria-pressed"),
          active: control.classList.contains("active")
        } : null;
      })(),
      operation: state.runtimeOperation?.getSnapshot?.().last || null
    };
  }, {grid: before.gridHeights, pack: before.packHeights});

  assert.equal(before.showOceanHeight, false, "回归前海底显示没有关闭");
  assert.ok(after.gridChanged > 0, "应用重设后 grid 海底高度没有变化");
  assert.ok(after.packChanged > 0, "应用重设后 pack 海底高度没有变化");
  assert.equal(after.gridChanged, before.preview.changedCells, "应用后的 grid 变化数与预览计划不一致");
  assert.ok(after.packChanged <= before.preview.packCells, "应用后的 pack 变化数超出预览计划");
  assert.match(after.historyLabel, /重设海底/, "应用重设没有登记为可撤销历史");
  assert.match(after.notice, /已重设/, "高度面板没有报告重设成功");
  assert.match(after.status, /已重设海底/, "全局状态没有报告重设成功");
  assert.equal(after.previewCells, 0, "应用后仍残留海底预览图层");
  assert.equal(after.showOceanHeight, true, "应用后没有显示正式海底深浅");
  assert.ok(after.oceanHeightControl?.checked === true || after.oceanHeightControl?.pressed === "true" || after.oceanHeightControl?.active, "应用后显示海底控件没有同步");
  assert.equal(after.operation?.status, "success", "海底整链事务没有成功完成");
  const healthPerformanceSignals = consoleErrors.filter(message => /^\[FMG health\] (main-thread-long-task|input-handler-stall)\b/.test(message));
  const applicationConsoleErrors = consoleErrors.filter(message => !healthPerformanceSignals.includes(message));
  assert.deepEqual(applicationConsoleErrors, []);
  assert.deepEqual(pageErrors, []);
  await page.screenshot({path: screenshotPath, fullPage: true});
  assert.ok(existsSync(screenshotPath) && statSync(screenshotPath).size > 0, "应用后海底截图没有生成");

  console.log(JSON.stringify({
    ok: true,
    url: "http://" + host + ":" + port + "?healthClear=1",
    preview: before.preview,
    after,
    screenshotPath,
    consoleErrors,
    healthPerformanceSignals,
    pageErrors
  }, null, 2));
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(done => server.close(done));
}

async function startStaticServer() {
  const serverInstance = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://" + host + ":" + port).pathname);
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
    ".svg": "image/svg+xml",
    ".png": "image/png"
  })[extname(file).toLowerCase()] || "application/octet-stream";
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}
