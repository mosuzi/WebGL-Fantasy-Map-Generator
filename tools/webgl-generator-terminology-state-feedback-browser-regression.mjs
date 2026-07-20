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
const port = 5457;

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

  await page.locator("#open-generation-panel").click();
  await page.getByRole("tab", {name: "管理", exact: true}).click();
  for (const label of ["水体与地貌", "资源点与通用标记", "测量对象"]) {
    await page.getByRole("button", {name: label, exact: true}).waitFor();
  }

  await openPanel(page, "open-feature-panel", "feature-panel");
  const featurePanel = page.locator('.floating-panel[data-panel-id="feature-panel"]');
  await featurePanel.getByText("地貌单元", {exact: true}).first().waitFor();
  assert.equal((await featurePanel.innerText()).includes("feature"), false, "水体与地貌面板仍显示 feature");

  await openPanel(page, "open-marker-panel", "marker-panel");
  const markerPanel = page.locator('.floating-panel[data-panel-id="marker-panel"]');
  await markerPanel.getByText("通用标记", {exact: true}).first().waitFor();
  const firstMarkerRow = markerPanel.locator(".object-table-row").first();
  await firstMarkerRow.waitFor();
  await firstMarkerRow.click();
  assert.equal(await firstMarkerRow.getAttribute("aria-selected"), "true", "选中行缺少 aria-selected");
  assert.equal(await firstMarkerRow.getAttribute("data-ui-state"), "selected", "选中行缺少共享状态");
  await firstMarkerRow.dblclick();
  const editingPanel = page.locator('.ui-secondary-action-panel[data-ui-state="editing"]');
  await editingPanel.waitFor();
  await editingPanel.getByText("编辑中", {exact: true}).waitFor();
  await editingPanel.getByRole("button", {name: "关闭二级编辑面板", exact: true}).click();
  await editingPanel.waitFor({state: "hidden"});

  const markerFilter = markerPanel.locator('.ui-filter-input input[type="search"]');
  await markerFilter.fill("__不存在的对象__");
  const markerEmpty = markerPanel.locator('.object-table-empty[data-ui-state="empty"]');
  await markerEmpty.waitFor();
  await markerEmpty.getByRole("button", {name: "清空筛选", exact: true}).click();
  await firstMarkerRow.waitFor();

  await page.locator("#toggle-measurement").click();
  const measurementReadout = page.locator(".measurement-readout");
  await measurementReadout.waitFor({state: "visible"});
  await measurementReadout.getByRole("button", {name: "测量对象", exact: true}).waitFor();
  await page.locator("#toggle-measurement").click();

  await openPanel(page, "open-height-panel", "height-panel");
  const heightPanel = page.locator('.floating-panel[data-panel-id="height-panel"]');
  await heightPanel.getByRole("button", {name: "启用高度编辑", exact: true}).click();
  await heightPanel.getByRole("button", {name: "预览全局平滑", exact: true}).click();
  const previewBanner = heightPanel.locator('[data-ui-state="preview"]');
  await previewBanner.waitFor();
  await previewBanner.getByText("预览中", {exact: true}).waitFor();
  await previewBanner.getByRole("button", {name: "退出预览", exact: true}).click();
  await previewBanner.waitFor({state: "hidden"});
  await heightPanel.getByRole("button", {name: "停止高度编辑", exact: true}).click();

  await page.locator("#open-generation-panel").click();
  await page.getByRole("tab", {name: "简介", exact: true}).click();
  assert.equal(await page.locator('label.file-import-action:has(#import-map-file) span').innerText(), "导入", "地图导入入口文案没有精简为“导入”");
  await page.locator("#import-map-file").setInputFiles({
    name: "invalid-map.json",
    mimeType: "application/json",
    buffer: Buffer.from("{invalid-json", "utf8")
  });
  const errorStatus = page.locator('#file-operation-status[data-state="error"]');
  await errorStatus.waitFor();
  assert.match(await errorStatus.innerText(), /失败|错误/);
  const errorRecovery = page.locator("#file-operation-clear-error");
  await errorRecovery.waitFor({state: "visible"});
  await errorRecovery.click();
  assert.equal(await page.locator("#file-operation-status").innerText(), "", "错误恢复没有清空反馈");
  assert.equal(await page.locator("#file-operation-status").getAttribute("data-state"), null, "错误恢复没有清空状态");

  assert.deepEqual(consoleErrors, [], "浏览器控制台出现错误");
  assert.deepEqual(pageErrors, [], "页面出现未捕获异常");
  console.log(JSON.stringify({
    ok: true,
    viewport: "1280x720",
    terminology: ["水体与地貌", "资源点与通用标记", "测量对象"],
    states: {selected: true, editingExited: true, previewExited: true},
    recovery: {filterCleared: true, importErrorCleared: true},
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
