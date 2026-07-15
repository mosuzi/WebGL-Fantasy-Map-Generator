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
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const host = "127.0.0.1";
const port = 5456;

assert.ok(existsSync(distDir), `构建产物不存在：${distDir}`);
const server = await startStaticServer();
let browser;
try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const context = await browser.newContext({viewport: {width: 1280, height: 720}, deviceScaleFactor: 1});
  await context.addInitScript(() => localStorage.clear());
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 60000);

  await openPanel(page, "open-height-panel", "height-panel");
  const heightPanel = page.locator('.floating-panel[data-panel-id="height-panel"]');
  const heightAdvanced = heightPanel.locator("details.height-advanced-section");
  assert.equal(await heightAdvanced.getAttribute("open"), null, "高度高级区不应默认展开");
  await heightPanel.getByRole("button", {name: "启用高度编辑", exact: true}).waitFor();
  await heightPanel.getByRole("group", {name: "高度编辑动作", exact: true}).waitFor();
  await heightPanel.getByRole("group", {name: "高度笔刷作用范围", exact: true}).waitFor();
  await heightPanel.getByText("常用选区", {exact: true}).waitFor();
  await heightPanel.locator("#height-selection-source").waitFor();
  await heightPanel.getByRole("button", {name: "打开导入工作台", exact: true}).waitFor();
  assert.equal(await heightPanel.getByText("选区地形模板", {exact: true}).isVisible(), false, "高度高级能力在首开时可见");
  await heightAdvanced.locator("summary").click();
  await heightPanel.getByText("选区地形模板", {exact: true}).waitFor();
  await heightPanel.getByText("多步骤地形模板", {exact: true}).waitFor();

  await openPanel(page, "open-military-panel", "military-panel");
  const militaryPanel = page.locator('.floating-panel[data-panel-id="military-panel"]');
  const militaryAdvanced = militaryPanel.locator("details.military-advanced-section");
  assert.equal(await militaryAdvanced.getAttribute("open"), null, "军事高级区不应默认展开");
  await militaryPanel.getByRole("button", {name: "重新生成军事", exact: true}).waitFor();
  await militaryPanel.locator(".object-table").waitFor();
  await militaryPanel.getByRole("button", {name: "调整态势", exact: true}).waitFor();
  await militaryPanel.getByRole("button", {name: "兵种比例", exact: true}).waitFor();
  assert.equal(await militaryPanel.locator("#military-event-chain-filter").isVisible(), false, "军事战报筛选在首开时可见");
  await militaryAdvanced.locator("summary").click();
  await militaryPanel.locator("#military-event-chain-filter").waitFor();
  await militaryPanel.getByRole("toolbar", {name: "战报档案导入导出", exact: true}).waitFor();

  await page.locator("#open-generation-panel").click();
  await page.locator('.floating-panel[data-panel-id="generation-panel"]').waitFor({state: "visible"});
  await page.getByRole("tab", {name: "简介", exact: true}).click();
  await page.locator("#open-export-panel").click();
  const exportPanel = page.locator(".project-export-panel");
  await exportPanel.waitFor({state: "visible"});
  const exportAdvanced = exportPanel.locator("details.project-export-advanced-section");
  assert.equal(await exportAdvanced.getAttribute("open"), null, "导出高级区不应默认展开");
  await exportPanel.locator("#export-map-image").waitFor();
  await exportPanel.locator("#export-map-data").waitFor();
  assert.equal(await exportPanel.locator("#export-png-scale").isVisible(), false, "PNG 高级选项在首开时可见");
  await exportAdvanced.locator("summary").click();
  await exportPanel.locator("#export-map-data-compressed").waitFor();
  await exportPanel.locator("#export-map-geojson").waitFor();
  await exportPanel.locator("#export-png-scale").waitFor();
  await exportPanel.locator("#feature-export-layer-state").waitFor();

  assert.deepEqual(consoleErrors, [], "浏览器控制台出现错误");
  assert.deepEqual(pageErrors, [], "页面出现未捕获异常");
  console.log(JSON.stringify({
    ok: true,
    viewport: "1280x720",
    height: {primaryVisible: true, advancedDefaultCollapsed: true, advancedReachable: true},
    military: {primaryVisible: true, advancedDefaultCollapsed: true, advancedReachable: true},
    export: {quickActions: ["png", "map-json"], advancedDefaultCollapsed: true, advancedReachable: true},
    consoleErrors: consoleErrors.length,
    pageErrors: pageErrors.length
  }, null, 2));
  await context.close();
} finally {
  if (browser) await browser.close();
  await new Promise(done => server.close(done));
}

async function openPanel(page, buttonId, panelId) {
  await page.evaluate(id => document.getElementById(id)?.click(), buttonId);
  await page.locator(`.floating-panel[data-panel-id="${panelId}"]`).waitFor({state: "visible"});
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
