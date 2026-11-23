import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {preview} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const root = resolve(import.meta.dirname, "..");
const require = createRequire(join(root, "source/Fantasy-Map-Generator/package.json"));
const {chromium} = require("playwright");
const {PNG} = require("pngjs");
const external = process.env.FMG_BASE_URL;
const server = external ? null : await preview({
  configFile: join(root, "vite.config.mjs"), preview: {host: "127.0.0.1", port: 5683, strictPort: true}, logLevel: "error"
});
const browser = await chromium.launch({channel: "chrome", headless: true});
try {
  const cases = process.env.FMG_BRUSH_CASE ? [process.env.FMG_BRUSH_CASE] : ["10000", "100000"];
  for (const name of cases) await verifyStroke(name);
} finally {
  await browser.close();
  await server?.close();
}

async function verifyStroke(name) {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(external || "http://127.0.0.1:5683", {waitUntil: "domcontentloaded"});
    await waitForApiReady(page, 120000);
    if (name === "archive") {
      assert.ok(!external && process.env.FMG_REAL_ARCHIVE, "旧档复验需要本地站点及 FMG_REAL_ARCHIVE");
      await page.locator("#import-map-file").setInputFiles(process.env.FMG_REAL_ARCHIVE);
      await page.waitForFunction(() => window.__webglGeneratorApp.map.grid.cells.h.length === 100000, null, {timeout: 120000});
      await waitForApiReady(page, 120000);
    } else {
      const result = await page.evaluate(async size => {
        const reply = await window.webglGeneratorApi.generate.newMap({confirm: true, cellsTarget: size, seed: "height-probe-" + size});
        return reply.ok;
      }, Number(name));
      assert.ok(result);
    }
    const controls = page.locator('[data-panel-id="generation-panel"]');
    if (!await controls.isVisible()) await page.locator("#open-generation-panel").click();
    await controls.locator('[data-control-tab="management"]').click();
    await controls.locator("#open-height-panel").click();
    const panel = page.locator('[data-panel-id="height-panel"]');
    await panel.getByRole("button", {name: "启用高度编辑"}).click();
    await panel.getByRole("button", {name: "等高地形"}).click();
    const [start, end] = await page.evaluate(prepareStroke);
    const pixels = async () => PNG.sync.read(await page.screenshot({
      clip: {x: Math.floor(end.x) - 3, y: Math.floor(end.y) - 3, width: 7, height: 7},
      style: ".brush-cursor-preview { visibility: hidden !important }"
    })).data;
    const before = await pixels();
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.waitForFunction(() => window.__strokeTest.firstFrameMs !== null);
    await page.mouse.move(end.x, end.y);
    await page.waitForFunction(({i, h}) => window.__webglGeneratorApp.map.grid.cells.h[i] === h, {i: end.i, h: start.h});
    const held = await pixels();
    assert.notDeepEqual(held, before, "按住鼠标时画面仍显示旧高度");
    await page.mouse.up();
    const applied = await page.evaluate(inspectStroke, "applied");
    assert.ok(applied.changed > 0 && applied.corridor > 0 && applied.mismatches === 0, JSON.stringify(applied));
    assert.equal(applied.undo, 1);
    assert.equal(applied.rebuilds, 0, "陆地等高不应重建整图");
    assert.equal(applied.syncReads, 0, "画笔预览同步读取了显卡状态");
    assert.ok(applied.firstFrameMs < 50 && applied.maxPreviewCpuMs < 50 && applied.commitMs < 50, JSON.stringify(applied));
    await page.mouse.move(0, 0);
    const committed = await pixels();
    await page.keyboard.press("Control+z");
    const undone = await page.evaluate(inspectStroke, "original");
    assert.equal(undone.mismatches, 0, "撤销未精确恢复高度或镜像");
    assert.equal(undone.undo, 0);
    assert.deepEqual(await pixels(), before, "撤销后的格子颜色没有恢复");
    assert.ok((await page.evaluate(() => window.webglGeneratorApi.history.redo())).ok);
    assert.equal((await page.evaluate(inspectStroke, "applied")).mismatches, 0);
    assert.deepEqual(await pixels(), committed, "重做后的格子颜色不一致");
    assert.ok((await page.evaluate(() => window.webglGeneratorApi.history.undo())).ok);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y);
    await page.waitForFunction(({i, h}) => window.__webglGeneratorApp.map.grid.cells.h[i] === h, {i: end.i, h: start.h});
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.equal((await page.evaluate(inspectStroke, "original")).mismatches, 0, "取消笔划未精确恢复");
    assert.deepEqual(await pixels(), before);
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => window.__webglGeneratorApp.renderer.gl.getError()), 0);
    console.log(JSON.stringify({name, ...applied}));
  } finally {
    await page.close();
  }
}

function prepareStroke() {
  const app = window.__webglGeneratorApp;
  const r = app.renderer;
  const {cells, points} = app.map.grid;
  const rect = r.canvas.getBoundingClientRect();
  const candidates = [];
  for (let i = 0; i < cells.h.length; i += Math.max(1, Math.floor(cells.h.length / 12000))) {
    if (cells.h[i] < 22) continue;
    const [wx, wy] = points[cells.p[i]];
    const screen = r.worldToScreen(wx, wy, rect);
    const x = rect.x + screen.x, y = rect.y + screen.y;
    if (x > 550 && x < 1280 && y > 135 && y < 735 && document.elementFromPoint(x, y) === r.canvas) candidates.push({i, h: cells.h[i], x, y, wx, wy});
  }
  const radius = app.panels.height.getBrush().radius;
  let pair, best = 12;
  for (let i = 0; i < candidates.length; i += Math.max(1, Math.floor(candidates.length / 80))) {
    const a = candidates[i];
    for (const b of candidates) {
      const distance = Math.hypot(a.wx - b.wx, a.wy - b.wy);
      const difference = Math.abs(a.h - b.h);
      if (distance < radius * 3 || distance > radius * 7 || difference <= best) continue;
      pair = [a, b];
      best = difference;
    }
  }
  if (!pair) throw Error("地图没有可见且高度明显不同的两个陆地落点");
  const t = window.__strokeTest = {grid: cells.h.slice(), pack: app.map.pack.cells.h.slice(), pair, radius,
    undo: app.editHistory.getStats().undo, firstFrameMs: null, maxFrameMs: 0, syncReads: 0, rebuilds: 0};
  window.addEventListener("pointerdown", event => {if (event.target === r.canvas) t.started = performance.now();}, true);
  const requestFrame = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => {
    const frame = requestFrame(time => {
      const brushFrame = app.heightEdit.activeStroke && app.heightEdit.brushFrame === frame;
      const start = performance.now();
      callback(time);
      if (brushFrame) {
        const end = performance.now();
        t.firstFrameMs ??= end - t.started;
        t.maxFrameMs = Math.max(t.maxFrameMs, end - start);
      }
    });
    return frame;
  };
  const getError = r.gl.getError.bind(r.gl);
  r.gl.getError = () => {if (app.heightEdit.activeStroke) t.syncReads++; return getError();};
  for (const method of ["rebuildCellVisualMesh", "rebuildShoreVisualCache", "refreshCellSurface"]) {
    const original = r[method];
    r[method] = function(...args) {t.rebuilds++; return original.apply(this, args);};
  }
  return pair;
}

function inspectStroke(phase) {
  const t = window.__strokeTest, app = window.__webglGeneratorApp;
  const {cells, points} = app.map.grid, pack = app.map.pack.cells;
  const [a, b] = t.pair, dx = b.wx - a.wx, dy = b.wy - a.wy;
  let changed = 0, corridor = 0, mismatches = 0;
  for (let i = 0; i < cells.h.length; i++) {
    const [x, y] = points[cells.p[i]];
    const u = ((x - a.wx) * dx + (y - a.wy) * dy) / (dx * dx + dy * dy);
    const inside = t.grid[i] >= 20 && u > 0 && u < 1 && Math.hypot(x - a.wx - u * dx, y - a.wy - u * dy) < t.radius * 0.7;
    if (inside) corridor++;
    if (cells.h[i] !== t.grid[i]) changed++;
    if (phase === "original" ? cells.h[i] !== t.grid[i] : (inside || cells.h[i] !== t.grid[i]) && (cells.h[i] !== a.h || t.grid[i] < 20)) mismatches++;
    const height = cells.h[i];
    const encoded = height < 20 ? Math.min(19, Math.round(height)) : Math.round(height);
    if (app.renderer.cellAttributeStore.snapshot.terrain[i * 4] !== encoded) mismatches++;
  }
  for (let i = 0; i < pack.h.length; i++) {
    const grid = pack.g[i];
    if (phase === "original" || cells.h[grid] === t.grid[grid]) {
      if (pack.h[i] !== t.pack[i]) mismatches++;
    } else if (pack.h[i] !== (ArrayBuffer.isView(pack.h) ? new pack.h.constructor([a.h])[0] : a.h)) mismatches++;
  }
  return {changed, corridor, mismatches, undo: app.editHistory.getStats().undo - t.undo, rebuilds: t.rebuilds, syncReads: t.syncReads,
    firstFrameMs: Math.round(t.firstFrameMs * 10) / 10, maxPreviewCpuMs: Math.round(t.maxFrameMs * 10) / 10, commitMs: app.heightEdit.lastCommitPerformance?.totalMs};
}
