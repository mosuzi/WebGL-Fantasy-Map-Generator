import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {preview} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const files = process.argv.slice(2);
assert.ok(files.length, "请传入一个或多个 .webfmg 存档路径");
const root = resolve(import.meta.dirname, "..");
const require = createRequire(join(root, "source/Fantasy-Map-Generator/package.json"));
const {chromium} = require("playwright");
const {PNG} = require("pngjs");
const port = 5691;
const server = await preview({
  configFile: join(root, "vite.config.mjs"), preview: {host: "127.0.0.1", port, strictPort: true}, logLevel: "error"
});
let browser;
try {
  browser = await chromium.launch({channel: "chrome", headless: true});
  for (const file of files) await verifyCoast(file);
} finally {
  await browser?.close();
  await server.close();
}

async function verifyCoast(file) {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(`http://127.0.0.1:${port}`, {waitUntil: "domcontentloaded"});
    await waitForApiReady(page, 90000);
    await waitForIdleMap(page);
    const previousMapId = await page.evaluate(() => window.__webglGeneratorApp.mapRevision.getSnapshot().mapIdentity);
    await page.locator("#import-map-file").setInputFiles(file);
    try {
      await page.waitForFunction(id => window.__webglGeneratorApp.mapRevision.getSnapshot().mapIdentity !== id, previousMapId, {timeout: 22000});
    } catch (error) {
      const status = await page.locator("#file-operation-status").textContent();
      throw new Error(`旧档未接入：${status}`, {cause: error});
    }
    await waitForIdleMap(page);
    const controls = page.locator('[data-panel-id="generation-panel"]');
    if (!await controls.isVisible()) await page.locator("#open-generation-panel").click();
    await controls.locator('[data-control-tab="management"]').click();
    await controls.locator("#open-height-panel").click();
    const panel = page.locator('[data-panel-id="height-panel"]');
    await panel.getByRole("button", {name: "启用高度编辑"}).click();
    await panel.getByRole("button", {name: "降低地形"}).click();
    await panel.getByText("影响海底", {exact: true}).click();
    const location = await page.evaluate(instrumentCoastEdit);
    const capture = async () => PNG.sync.read(await page.screenshot({
      clip: {x: location.x - 10, y: location.y - 10, width: 21, height: 21},
      style: ".brush-cursor-preview { visibility: hidden !important }"
    })).data;
    const before = await capture();
    await page.mouse.click(location.x, location.y, {delay: 60});
    await page.waitForFunction(({id, undo}) => {
      const app = window.__webglGeneratorApp;
      return app.map.grid.cells.h[id] < 20 && app.editHistory.getStats().undo === undo + 1 && !app.heightEdit.activeStroke;
    }, location);
    await page.mouse.move(0, 0);
    const changed = await capture();
    assert.notDeepEqual(changed, before, "跨海平面后岸边没有更新");
    const stats = await page.evaluate(() => {
      const stats = window.shorePatchStats;
      stats.maxLongTask = Math.max(0, ...stats.longTasks.map(entry => entry.duration));
      return stats;
    });
    assert.ok(stats.patches.some(patch => patch.shoreUploadedBytes !== null && patch.shoreRetainedBytes > 0), JSON.stringify(stats));
    assert.equal(stats.rebuilds, 0);
    assert.ok(stats.maxLongTask <= 200, `跨海平面编辑 LongTask ${stats.maxLongTask}ms`);
    assert.ok(await page.evaluate(async () => (await window.webglGeneratorApi.history.undo()).ok));
    assert.deepEqual(await capture(), before, "撤销后岸边像素未恢复");
    assert.ok(await page.evaluate(async () => (await window.webglGeneratorApi.history.redo()).ok));
    assert.deepEqual(await capture(), changed, "重做后的像素与首次发布不同");
    assert.equal(await page.evaluate(() => window.__webglGeneratorApp.renderer.gl.getError()), 0);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({location, ...stats}));
  } finally {
    await page.close();
  }
}

async function waitForIdleMap(page) {
  await page.waitForFunction(() => {
    const app = window.__webglGeneratorApp;
    return app?.map && !app.runtimeOperation.getSnapshot().busy && !window.webglGeneratorApi.info.runtimeStats().data.loading.visible;
  }, null, {timeout: 45000});
}

function instrumentCoastEdit() {
  const app = window.__webglGeneratorApp;
  const renderer = app.renderer;
  const grid = app.map.grid;
  const rect = renderer.canvas.getBoundingClientRect();
  const brush = app.panels.height.getBrush();
  if (!brush.affectSeafloor && brush.preserveSurface) throw Error("画笔未启用跨海平面");
  const stats = window.shorePatchStats = {patches: [], rebuilds: 0, longTasks: []};
  let start = Infinity;
  window.addEventListener("pointerdown", () => {start = performance.now();}, {once: true});
  new PerformanceObserver(entries => {
    for (const {startTime, duration} of entries.getEntries()) {
      if (startTime >= start) stats.longTasks.push({startTime, duration});
    }
  }).observe({type: "longtask"});
  const refresh = renderer.refreshResidentHeightTopology;
  renderer.refreshResidentHeightTopology = function(...args) {
    const result = refresh.apply(this, args);
    if (result) stats.patches.push(result);
    return result;
  };
  const rebuild = renderer.refreshCellSurface;
  renderer.refreshCellSurface = function(...args) {
    stats.rebuilds++;
    return rebuild.apply(this, args);
  };
  for (const id of grid.cells.i) {
    const height = grid.cells.h[id];
    if (height < 20 || height - brush.strength >= 20 || !grid.cells.c[id].some(neighbor => grid.cells.h[neighbor] < 20)) continue;
    const point = grid.points[grid.cells.p[id]];
    const screen = renderer.worldToScreen(point[0], point[1], rect);
    const x = Math.round(rect.x + screen.x), y = Math.round(rect.y + screen.y);
    if (x < 550 || x > 1300 || y < 140 || y > 745 || document.elementFromPoint(x, y) !== renderer.canvas) continue;
    return {x, y, id, height, count: grid.cells.h.length, undo: app.editHistory.getStats().undo};
  }
  throw Error("没有可见且可被当前画笔降低到海平面以下的沿岸地块");
}
