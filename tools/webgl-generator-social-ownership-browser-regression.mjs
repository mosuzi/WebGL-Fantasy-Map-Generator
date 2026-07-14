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
const port = 5450;
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
    unwrap(await api.generate.newMap({confirm: true, seed: "social-ownership-browser", cellsTarget: 3000, heightmapTemplate: "continents"}));
    const map = window.__webglGeneratorApp.map;
    const cultureId = mostOwned(map.grid.cells.culture);
    const religionId = mostOwned(map.grid.cells.religion);
    const cultureTarget = active(map.society.cultures).find(id => id !== cultureId);
    const religionTarget = active(map.society.religions).find(id => id !== religionId);
    const cultureCell = Array.from(map.grid.cells.culture).findIndex(value => Number(value) === cultureId);
    const religionCell = Array.from(map.grid.cells.religion).findIndex(value => Number(value) === religionId);
    const capabilities = unwrap(api.info.capabilities());
    unwrap(api.edit.cultures.assignCells(cultureTarget, [cultureCell]));
    unwrap(api.edit.religions.assignCells(religionTarget, [religionCell]));
    const assignment = {
      culture: Number(map.grid.cells.culture[cultureCell]),
      religion: Number(map.grid.cells.religion[religionCell]),
      culturePack: packCells(map, cultureCell).every(cell => Number(map.pack.cells.culture[cell]) === cultureTarget),
      religionPack: packCells(map, religionCell).every(cell => Number(map.pack.cells.religion[cell]) === religionTarget)
    };
    unwrap(api.history.undo());
    unwrap(api.history.undo());
    unwrap(api.edit.notes.set({kind: "culture", id: cultureId}, "文化删除浏览器验收"));
    unwrap(api.selection.select({kind: "culture", id: cultureId}));
    return {
      cultureId, religionId, cultureTarget, religionTarget, cultureCell, religionCell, assignment,
      capabilitiesComplete: capabilities.methodMetadataCoverage.complete,
      cultureAssignDocumented: capabilities.methods.edit.includes("cultures.assignCells"),
      religionAssignDocumented: capabilities.methods.edit.includes("religions.assignCells")
    };
    function unwrap(result) { if (!result?.ok) throw new Error(result?.error?.message || "API 调用失败"); return result.data; }
    function active(items) { return items.filter(item => item && !item.removed && Number(item.i ?? item.id) > 0).map(item => Number(item.i ?? item.id)); }
    function mostOwned(values) { const counts = new Map(); for (const value of values) if (value > 0) counts.set(value, (counts.get(value) || 0) + 1); return [...counts].sort((a, b) => b[1] - a[1])[0][0]; }
    function packCells(map, gridCell) { return Array.from(map.pack.cells.g, (value, cell) => Number(value) === gridCell && map.pack.cells.h[cell] >= 20 ? cell : -1).filter(cell => cell >= 0); }
  });
  assert.deepEqual(fixture.assignment, {culture: fixture.cultureTarget, religion: fixture.religionTarget, culturePack: true, religionPack: true});
  assert.equal(fixture.capabilitiesComplete, true);
  assert.equal(fixture.cultureAssignDocumented, true);
  assert.equal(fixture.religionAssignDocumented, true);

  await page.evaluate(() => document.getElementById("open-culture-panel")?.click());
  const culturePanel = page.locator('.floating-panel[data-panel-id="culture-panel"]:not(.hidden)');
  await culturePanel.waitFor({state: "visible"});
  await culturePanel.getByRole("button", {name: "编辑文化归属"}).click();
  assert.equal(await page.evaluate(() => window.__webglGeneratorApp.renderer.getStats().colorMode), "cultures");
  const brushPoint = await page.evaluate(({cultureTarget, cultureCell}) => {
    const app = window.__webglGeneratorApp;
    app.panels.culture.setSelectedCultureId(cultureTarget);
    const canvas = document.getElementById("map-canvas");
    const rect = canvas.getBoundingClientRect();
    const pointIndex = app.map.grid.cells.p[cultureCell];
    const [x, y] = app.map.grid.points[pointIndex];
    const screen = app.renderer.worldToScreen(x, y, rect);
    return {x: rect.left + screen.x, y: rect.top + screen.y};
  }, fixture);
  await page.mouse.move(brushPoint.x, brushPoint.y);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForFunction(({cell, target}) => Number(window.__webglGeneratorApp.map.grid.cells.culture[cell]) === target, {cell: fixture.cultureCell, target: fixture.cultureTarget});
  const brushHistory = await page.evaluate(() => window.__webglGeneratorApp.editHistory.getStats());
  assert.equal(brushHistory.lastDomain, "culture");
  assert.equal((await page.evaluate(() => window.webglGeneratorApi.history.undo())).ok, true);
  assert.equal(await page.evaluate(cell => Number(window.__webglGeneratorApp.map.grid.cells.culture[cell]), fixture.cultureCell), fixture.cultureId);
  await culturePanel.getByRole("button", {name: "退出文化归属笔刷"}).click();

  await page.evaluate(id => window.__webglGeneratorApp.panels.culture.setSelectedCultureId(id), fixture.cultureId);
  await culturePanel.getByRole("button", {name: "删除文化并清除归属"}).click();
  await page.waitForFunction(id => window.__webglGeneratorApp.map.society.cultures[id]?.removed, fixture.cultureId);
  const cultureDeleted = await inspect(page, "culture", fixture.cultureId);
  assertDeletion(cultureDeleted);
  assert.equal((await page.evaluate(() => window.webglGeneratorApi.history.undo())).ok, true);
  assert.equal((await inspect(page, "culture", fixture.cultureId)).resolved, true);

  const religionDeletedResult = await page.evaluate(id => window.webglGeneratorApi.edit.religions.delete(id), fixture.religionId);
  assert.equal(religionDeletedResult.ok, true, religionDeletedResult.error?.message);
  const religionDeleted = await inspect(page, "religion", fixture.religionId);
  assertDeletion(religionDeleted);
  assert.equal((await page.evaluate(() => window.webglGeneratorApi.history.undo())).ok, true);
  assert.equal((await inspect(page, "religion", fixture.religionId)).resolved, true);

  const diagnostics = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const stats = app.renderer.getStats?.() || {};
    const gl = document.querySelector("canvas")?.getContext?.("webgl2");
    return {glError: stats.draw?.glError ?? gl?.getError?.() ?? 0, healthErrors: (window.__webglGeneratorHealth?.getEvents?.(200) || []).filter(event => event.level === "error").length};
  });
  assert.deepEqual(diagnostics, {glError: 0, healthErrors: 0});
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ok: true, fixture, cultureDeleted, religionDeleted, diagnostics, consoleErrors, pageErrors}, null, 2));
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(done => server.close(done));
}

async function inspect(page, kind, id) {
  return page.evaluate(({kind, id}) => {
    const map = window.__webglGeneratorApp.map;
    const field = kind;
    const resolved = window.webglGeneratorApi.selection.resolve({kind, id});
    return {
      removed: Boolean(map.society[`${kind}s`][id]?.removed),
      gridCleared: Array.from(map.grid.cells[field]).every(value => Number(value) !== id),
      packCleared: Array.from(map.pack.cells[field]).every(value => Number(value) !== id),
      noteCleared: !map.notes.notes.some(note => note.id === `${kind}:${id}`),
      resolved: Boolean(resolved.ok && resolved.data)
    };
  }, {kind, id});
}

function assertDeletion(actual) {
  assert.deepEqual(actual, {removed: true, gridCleared: true, packCleared: true, noteCleared: true, resolved: false});
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
