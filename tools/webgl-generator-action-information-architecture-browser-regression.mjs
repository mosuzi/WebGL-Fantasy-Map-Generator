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
const port = 5455;

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

  assert.equal(await page.locator("[data-regenerate-kind]").count(), 1, "控制面板应只有一个重生成按钮");
  const regenerationButton = page.locator("[data-regenerate-kind]");
  assert.equal(await regenerationButton.getAttribute("data-regenerate-kind"), "states");
  assert.match(await page.locator("#regeneration-constraint").innerText(), /替换国家与省份归属/);
  await page.locator("#regeneration-kind").selectOption("military");
  await page.waitForFunction(() => document.querySelector("[data-regenerate-kind]")?.dataset.regenerateKind === "military");
  assert.match(await regenerationButton.innerText(), /重新生成军事/);
  assert.match(await page.locator("#regeneration-constraint").innerText(), /替换全部军团/);

  await page.evaluate(() => document.getElementById("open-city-panel")?.click());
  const cityPanel = page.locator('.floating-panel[data-panel-id="city-panel"]');
  await cityPanel.waitFor({state: "visible"});
  await cityPanel.getByRole("button", {name: "重新生成城镇", exact: true}).waitFor();
  assert.equal(await cityPanel.locator(".ui-close-button").count(), 1, "主面板关闭按钮未统一");
  assert.ok(await cityPanel.locator(".object-table-action-cell .el-icon").count() > 0, "逐行定位没有显示统一图标");
  assert.equal(await cityPanel.locator('.ui-panel-io-actions button[aria-label^="定位"]').count(), 0, "城市列表仍有底部定位入口");

  await page.evaluate(() => document.getElementById("open-route-panel")?.click());
  const routePanel = page.locator('.floating-panel[data-panel-id="route-panel"]');
  await routePanel.waitFor({state: "visible"});
  const routeActions = routePanel.locator(".route-panel-list-actions");
  assert.ok(await routeActions.locator(".ui-panel-action-divider").count() === 1, "路线安全动作与危险动作没有分隔");
  for (const label of ["批量删除选中 0", "删除路线", "重算道路"]) {
    const action = routeActions.getByRole("button", {name: label, exact: true});
    assert.equal(await action.count(), 1, `${label} 缺失`);
    assert.ok((await action.getAttribute("class"))?.includes("ui-panel-danger-action"), `${label} 没有危险动作样式`);
  }
  assert.equal(await routeActions.locator('button[aria-label="定位路线"]').count(), 0, "路线列表仍有底部定位入口");

  assert.deepEqual(consoleErrors, [], "浏览器控制台出现错误");
  assert.deepEqual(pageErrors, [], "页面出现未捕获异常");
  console.log(JSON.stringify({
    ok: true,
    viewport: "1280x720",
    regenerationControl: {entries: 1, selected: "military", impactSummary: true},
    cityPanel: {domainRegeneration: true, rowLocateIcon: true, duplicateLocate: 0, unifiedClose: true},
    routePanel: {dangerDivider: true, dangerActions: 3, duplicateLocate: 0},
    consoleErrors: consoleErrors.length,
    pageErrors: pageErrors.length
  }, null, 2));
  await context.close();
} finally {
  if (browser) await browser.close();
  await new Promise(done => server.close(done));
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
