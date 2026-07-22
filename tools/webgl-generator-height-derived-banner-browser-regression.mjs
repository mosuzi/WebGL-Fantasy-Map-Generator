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
const screenshotPath = join(rootDir, "docs", "generated", "screenshots", "height-derived-banner-compact.png");
const host = "127.0.0.1";
const port = 5475;
assert.ok(existsSync(distDir), "构建产物不存在：" + distDir);

const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const server = await startStaticServer();
let browser;

try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const context = await browser.newContext({viewport: {width: 520, height: 900}, deviceScaleFactor: 1});
  await context.addInitScript(() => localStorage.clear());
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto("http://" + host + ":" + port + "?healthClear=1", {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 60000);
  await page.evaluate(() => document.getElementById("open-height-panel")?.click());
  const panel = page.locator('.floating-panel[data-panel-id="height-panel"]');
  await panel.waitFor({state: "visible"});

  const heightChange = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const heights = app.map.grid.cells.h;
    const gridCell = heights.findIndex(height => height >= 20 && height < 100);
    if (gridCell < 0) throw new Error("没有可测试的陆地高度单元");
    const before = Number(heights[gridCell]);
    const result = window.webglGeneratorApi.edit.height.applyChanges([{gridCell, before, after: before + 1}]);
    const derivedStaleSystems = app.map.metadata?.derivedStale?.systems || ["religions", "markers", "diplomacy", "military", "zones"];
    app.panels.height.update({derivedStaleSystems});
    return {gridCell, before, after: Number(heights[gridCell]), derivedStaleSystems, ok: result?.ok, error: result?.error?.message || ""};
  });
  assert.equal(heightChange.ok, true, heightChange.error || "高度变化没有应用");

  const banner = panel.locator('.height-derived-banner[data-ui-state="stale"]');
  await banner.waitFor({state: "visible"});
  await banner.getByText("地图内容待更新", {exact: true}).waitFor();
  await banner.getByText("完成后统一更新。", {exact: true}).waitFor();
  await banner.getByRole("button", {name: "完成编辑并更新地图", exact: true}).waitFor();

  const layout = await banner.evaluate(node => {
    const copy = node.querySelector(".ui-state-banner-copy");
    const actions = node.querySelector(".ui-state-banner-actions");
    const buttons = [...node.querySelectorAll(".ui-state-banner-actions button")];
    const rect = item => {
      const box = item.getBoundingClientRect();
      return {left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height};
    };
    return {
      banner: rect(node),
      copy: rect(copy),
      actions: rect(actions),
      buttons: buttons.map(rect),
      clientWidth: node.clientWidth,
      scrollWidth: node.scrollWidth,
      text: node.innerText
    };
  });

  assert.ok(!rectanglesOverlap(layout.copy, layout.actions), "提示文案与操作按钮发生重叠");
  assert.ok(layout.buttons.every(button => button.left >= layout.banner.left && button.right <= layout.banner.right + 0.5), "按钮超出待更新提示边界");
  assert.equal(layout.buttons.length, 1, "普通高度面板仍显示多个更新按钮");
  assert.ok(layout.scrollWidth <= layout.clientWidth + 1, "待更新提示产生横向溢出");
  assert.doesNotMatch(layout.text, /待派生|\d+\s*项：|宗教、|标记、|地区等/, "待更新提示仍暴露派生调试信息");
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);

  await page.screenshot({path: screenshotPath, fullPage: true});
  assert.ok(existsSync(screenshotPath) && statSync(screenshotPath).size > 0, "高度待更新提示截图没有生成");
  console.log(JSON.stringify({
    ok: true,
    url: "http://" + host + ":" + port + "?healthClear=1",
    viewport: "520x900",
    heightChange,
    layout,
    screenshotPath,
    consoleErrors,
    pageErrors
  }, null, 2));
  await context.close();
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(done => server.close(done));
}

function rectanglesOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
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
