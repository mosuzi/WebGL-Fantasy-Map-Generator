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
  await waitForApiReady(page, 30000);

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
  const brushPoints = await page.evaluate(({cultureTarget}) => {
    const app = window.__webglGeneratorApp;
    app.panels.culture.setSelectedCultureId(cultureTarget);
    const canvas = document.getElementById("map-canvas");
    const rect = canvas.getBoundingClientRect();
    const points = [];
    for (let cell = 0; cell < app.map.grid.cells.h.length; cell++) {
      const before = app.map.grid.cells.culture[cell];
      if (app.map.grid.cells.h[cell] < 20 || before === cultureTarget) continue;
      const center = app.map.grid.points[app.map.grid.cells.p[cell]];
      const screen = app.renderer.worldToScreen(...center, rect);
      const x = screen.x + rect.left, y = screen.y + rect.top;
      if (document.elementFromPoint(x, y) !== canvas || app.renderer.pickCellClientPoint(x, y)?.gridCell !== cell) continue;
      if (points.length && Math.hypot(center[0] - points[0].center[0], center[1] - points[0].center[1]) <= app.panels.culture.getBrush().radius * 2) continue;
      points.push({cell, before, center, x, y});
      if (points.length === 2) break;
    }
    window.socialFullRefreshes = 0;
    const refresh = app.renderer.refreshCellSurface;
    app.renderer.refreshCellSurface = function (...args) {
      window.socialFullRefreshes++;
      return refresh.apply(this, args);
    };
    return points;
  }, fixture);
  assert.equal(brushPoints.length, 2, "画布上应有两个未被面板遮挡的陆格");
  await page.mouse.move(brushPoints[0].x, brushPoints[0].y);
  await page.mouse.down();
  await page.mouse.move(brushPoints[1].x, brushPoints[1].y, {steps: 3});
  assert.ok(await page.evaluate(({points, target}) => points.every(({cell}) => window.__webglGeneratorApp.map.grid.cells.culture[cell] === target), {points: brushPoints, target: fixture.cultureTarget}));
  await page.mouse.up();
  const brushHistory = await page.evaluate(() => window.__webglGeneratorApp.editHistory.getStats());
  assert.equal(brushHistory.lastDomain, "culture");
  assert.equal((await page.evaluate(() => window.webglGeneratorApi.history.undo())).ok, true);
  assert.ok(await page.evaluate(points => points.every(({cell, before}) => window.__webglGeneratorApp.map.grid.cells.culture[cell] === before), brushPoints));
  assert.equal(await page.evaluate(() => window.socialFullRefreshes), 0, "文化落笔、提交及撤销不得重建整张地图表面");
  await culturePanel.getByRole("button", {name: "退出文化归属笔刷"}).click();

  await page.evaluate(id => window.__webglGeneratorApp.panels.culture.setSelectedCultureId(id), fixture.cultureId);
  const deletionBefore = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    return {history: app.editHistory.getStats().undo, fullRefreshes: window.socialFullRefreshes};
  });
  const dialogs = [];
  page.on("dialog", async dialog => {dialogs.push(dialog.type()); await dialog.dismiss();});
  await culturePanel.getByRole("button", {name: "删除文化并清除归属"}).click();
  assert.deepEqual(dialogs, [], "删除文化从管理页直接生效");
  const cultureDeleted = await inspect(page, "culture", fixture.cultureId);
  assertDeletion(cultureDeleted);
  await assertCultureColors(0, deletionBefore.history + 1);
  assert.equal((await page.evaluate(() => window.webglGeneratorApi.history.undo())).ok, true);
  assert.equal((await inspect(page, "culture", fixture.cultureId)).resolved, true);
  await assertCultureColors(fixture.cultureId, deletionBefore.history);
  assert.equal((await page.evaluate(() => window.webglGeneratorApi.history.redo())).ok, true);
  await assertCultureColors(0, deletionBefore.history + 1);
  assert.equal((await page.evaluate(() => window.webglGeneratorApi.history.undo())).ok, true);
  await assertCultureColors(fixture.cultureId, deletionBefore.history);

  async function assertCultureColors(owner, history) {
    const actual = await page.evaluate(({cell}) => {
      const app = window.__webglGeneratorApp;
      return {
        owner: app.map.grid.cells.culture[cell],
        identity: app.renderer.cellAttributeStore.snapshot.identities[cell * 4 + 2],
        history: app.editHistory.getStats().undo,
        fullRefreshes: window.socialFullRefreshes
      };
    }, {cell: fixture.cultureCell});
    assert.deepEqual(actual, {owner, identity: owner + 1, history, fullRefreshes: deletionBefore.fullRefreshes});
  }

  const religionDeletedResult = await page.evaluate(id => window.webglGeneratorApi.edit.religions.delete(id, {confirm: true}), fixture.religionId);
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
