import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {preview} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const root = resolve(import.meta.dirname, "..");
const {chromium} = createRequire(join(root, "source/Fantasy-Map-Generator/package.json"))("playwright");
const server = process.env.FMG_BASE_URL ? null : await preview({
  configFile: join(root, "vite.config.mjs"), preview: {host: "127.0.0.1", port: 5639, strictPort: true}, logLevel: "error"
});
const browser = await chromium.launch({headless: true, channel: "chrome"});
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(process.env.FMG_BASE_URL || "http://127.0.0.1:5639", {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 90000);
  const height = page.locator('[data-panel-id="height-panel"]');
  const body = height.locator(".height-panel-summary");
  assert.equal(await body.count(), 0, "第一次打开前不应挂载高度编辑");
  await page.evaluate(async () => {
    const app = window.__webglGeneratorApp;
    const label = await window.webglGeneratorApi.edit.labels.addCustom({text: "尚未保存的地图标记", x: 50, y: 50});
    if (!label.ok) throw Error(label.error.message);
    window.__beforeRelease = {map: app.map, undo: app.editHistory.getStats().undo};
  });
  const controls = page.locator('[data-panel-id="generation-panel"]');
  const openManagement = async () => {
    if (!await controls.isVisible()) await page.locator("#open-generation-panel").click();
    await controls.locator('[data-control-tab="management"]').click();
  };
  await openManagement();
  const missing = [];
  await page.route(/\/assets\/[^?]+\.(js|css)(\?.*)?$/, route => {
    missing.push(new URL(route.request().url()).pathname);
    return route.fulfill({status: 404, body: ""});
  });
  for (let i = 0; i < 2; i++) {
    if (i) await openManagement();
    await controls.locator("#open-height-panel").click();
    await body.waitFor({timeout: 10000});
    assert.equal(await height.locator(".lazy-panel-recovery").count(), 0);
    await height.locator(".floating-panel-close").click();
  }
  assert.ok(await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    return app.map === window.__beforeRelease.map && app.editHistory.getStats().undo === window.__beforeRelease.undo;
  }), "打开面板丢失了当前地图或编辑历史");
  assert.deepEqual(missing, [], "打开高度编辑仍然依赖发布前的散列资源");
  assert.deepEqual(errors, []);
  console.log("高度编辑跨发布首次打开、关闭再打开、未保存地图和历史均通过，新增资源请求 0。");
} finally {
  await browser.close();
  await server?.close();
}
