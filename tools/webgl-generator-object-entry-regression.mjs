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
const port = 5451;
assert.ok(existsSync(distDir), `构建产物不存在：${distDir}`);
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const server = await startStaticServer();
let browser;

try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const page = await browser.newPage({viewport: {width: 1280, height: 820}});
  page.setDefaultTimeout(30000);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`http://${host}:${port}?healthClear=1`, {waitUntil: "domcontentloaded"});
  await page.waitForFunction(() => window.webglGeneratorApi && window.__webglGeneratorApp?.renderer?.getStats?.()?.webgl2);
  const fixture = await page.evaluate(async () => {
    const api = window.webglGeneratorApi;
    unwrap(await api.generate.newMap({confirm: true, seed: "object-entry-regression", cellsTarget: 3000, heightmapTemplate: "continents"}));
    unwrap(api.edit.measurements.save([{x: 100, y: 100}, {x: 240, y: 180}], {name: "入口验收测量"}));
    const methods = unwrap(api.info.capabilities()).methods;
    const required = {
      edit: ["notes.set", "notes.delete", "measurements.save", "measurements.delete", "cities.add", "cities.delete", "provinces.add", "provinces.delete", "states.add", "states.delete", "cultures.add", "cultures.delete", "religions.add", "religions.delete", "routes.delete", "rivers.delete", "lakes.delete", "labels.addCustom", "labels.delete", "markers.add", "markers.delete"],
      namebases: ["create", "delete"]
    };
    for (const [namespace, names] of Object.entries(required)) for (const name of names) if (!methods[namespace].includes(name)) throw new Error(`能力矩阵缺少 ${namespace}.${name}`);
    const route = window.__webglGeneratorApp.map.settlements.routes.find(Boolean);
    if (!route) throw new Error("固定 seed 应生成路线");
    unwrap(api.selection.select({kind: "route", id: route.id}));
    return {routeId: route.id, routeCount: window.__webglGeneratorApp.map.settlements.routes.length};
    function unwrap(result) { if (!result?.ok) throw new Error(result?.error?.message || "API 调用失败"); return result.data; }
  });

  await page.evaluate(() => document.getElementById("open-measurement-panel")?.click());
  const measurementPanel = page.locator('.floating-panel[data-panel-id="measurement-panel"]:not(.hidden)');
  await measurementPanel.waitFor({state: "visible"});
  await measurementPanel.getByRole("button", {name: "开始测量"}).click();
  assert.equal(await page.evaluate(() => window.__webglGeneratorApp.measurement.active), true);
  await page.evaluate(() => document.getElementById("toggle-measurement")?.click());

  await page.evaluate(() => document.getElementById("open-marker-panel")?.click());
  const markerPanel = page.locator('.floating-panel[data-panel-id="marker-panel"]:not(.hidden)');
  await markerPanel.waitFor({state: "visible"});
  await markerPanel.getByRole("button", {name: "放置资源标记"}).click();
  assert.equal(await page.evaluate(() => window.__webglGeneratorApp.markerEdit.mode), "add");
  await markerPanel.getByRole("button", {name: "取消"}).click();

  await page.evaluate(() => document.getElementById("open-route-panel")?.click());
  const routePanel = page.locator('.floating-panel[data-panel-id="route-panel"]:not(.hidden)');
  await routePanel.waitFor({state: "visible"});
  assert.equal(await routePanel.getByRole("button", {name: /删除.*路线/}).count(), 1, "路线删除入口必须唯一");
  await routePanel.getByRole("button", {name: /删除.*路线/}).click();
  await page.waitForFunction(count => window.__webglGeneratorApp.map.settlements.routes.length === count - 1, fixture.routeCount);
  assert.equal((await page.evaluate(() => window.webglGeneratorApi.history.undo())).ok, true);
  assert.equal(await page.evaluate(() => window.__webglGeneratorApp.map.settlements.routes.length), fixture.routeCount);
  assert.equal((await page.evaluate(() => window.webglGeneratorApi.history.redo())).ok, true);
  assert.equal(await page.evaluate(() => window.__webglGeneratorApp.map.settlements.routes.length), fixture.routeCount - 1);

  const diagnostics = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const stats = app.renderer.getStats?.() || {};
    const gl = document.querySelector("canvas")?.getContext?.("webgl2");
    return {glError: stats.draw?.glError ?? gl?.getError?.() ?? 0, healthErrors: (window.__webglGeneratorHealth?.getEvents?.(200) || []).filter(event => event.level === "error").length};
  });
  assert.deepEqual(diagnostics, {glError: 0, healthErrors: 0});
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ok: true, fixture, diagnostics, consoleErrors, pageErrors}, null, 2));
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(done => server.close(done));
}

async function startStaticServer() {
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, `http://${host}:${port}`).pathname);
    let target = resolve(distDir, `.${normalize(pathname)}`);
    if (pathname === "/" || !existsSync(target) || statSync(target).isDirectory()) target = join(distDir, "index.html");
    if (!target.startsWith(distDir) || !existsSync(target)) { response.writeHead(404); response.end("Not found"); return; }
    response.writeHead(200, {"content-type": contentType(target), "cache-control": "no-store"});
    createReadStream(target).pipe(response);
  });
  await new Promise((done, fail) => { server.once("error", fail); server.listen(port, host, done); });
  return server;
}

function contentType(file) { return ({".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml"})[extname(file).toLowerCase()] || "application/octet-stream"; }
function delay(ms) { return new Promise(resolveDelay => setTimeout(resolveDelay, ms)); }
