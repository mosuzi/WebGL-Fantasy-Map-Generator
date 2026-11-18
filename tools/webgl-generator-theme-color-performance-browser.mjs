#!/usr/bin/env node
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {mkdtemp} from "node:fs/promises";
import {join, resolve} from "node:path";
import {tmpdir} from "node:os";
import {preview} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const root = resolve(import.meta.dirname, "..");
const {chromium} = createRequire(join(root, "source/Fantasy-Map-Generator/package.json"))("playwright");
const server = await preview({configFile: join(root, "vite.config.mjs"), preview: {host: "127.0.0.1", port: 5596, strictPort: true}, logLevel: "error"});
const profile = await mkdtemp(join(process.env.TEMP || tmpdir(), "fmg-theme-performance-"));
const context = await chromium.launchPersistentContext(profile, {channel: "chrome", headless: true, viewport: {width: 1360, height: 900}});
const page = await context.newPage();
page.setDefaultTimeout(120000);
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

try {
  await page.goto("http://127.0.0.1:5596/?healthClear=1&debug=1", {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 120000);
  const generated = await page.evaluate(() => window.webglGeneratorApi.generate.newMap({confirm: true, seed: "theme-performance-100k-coast", cellsTarget: 100000}));
  assert.equal(generated.ok, true, JSON.stringify(generated.error));
  const heightView = await page.evaluate(() => window.webglGeneratorApi.layers.setViewMode("height"));
  assert.equal(heightView.ok, true, JSON.stringify(heightView.error));
  await page.locator("#open-generation-panel").click();
  await page.locator('[data-control-tab="themes"]').click();
  await page.locator("#create-user-visual-theme").click();
  await page.waitForFunction(() => {
    const app = window.__webglGeneratorApp;
    return app.map.visualTheme?.preset?.startsWith("user-") && app.renderer.visualTheme.id === app.map.visualTheme.preset
      && !app.runtimeOperationSnapshot?.busy;
  });
  const before = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const renderer = app.renderer;
    const pixels = new Uint8Array(renderer.canvas.width * renderer.canvas.height * 4);
    renderer.draw({updateDynamicBuffers: false, updateOverlay: false});
    renderer.gl.readPixels(0, 0, renderer.canvas.width, renderer.canvas.height, renderer.gl.RGBA, renderer.gl.UNSIGNED_BYTE, pixels);
    window.__themePerformanceBeforePixels = pixels;
    return {gridCells: app.map.grid.cells.i.length, smooth: renderer.viewOptions.smoothCellBorders,
      mode: renderer.colorMode, shoreVertices: renderer.landCorrectionVertexCount + renderer.waterCorrectionVertexCount,
      themeId: app.map.visualTheme.preset, undo: app.editHistory.getStats().undo};
  });
  assert.ok(before.gridCells >= 99000 && before.gridCells <= 101000, `性能场景不是约 100k 地图：${before.gridCells}`);
  assert.equal(before.mode, "height", "性能场景未启用高度视图");
  assert.equal(before.smooth, true, "性能场景未启用边界平滑");
  assert.ok(before.shoreVertices > 0, "性能场景缺少实际海岸修正面");

  await page.locator('[data-action-id="ControlPanel:color"]').click();
  const field = page.getByRole("dialog", {name: "编辑主题颜色"}).locator(".visual-theme-shared-color-field .ui-hsl-hex-field input");
  errors.length = 0;
  await page.evaluate(() => {
    window.__themePerformanceLongTasks = [];
    new PerformanceObserver(list => window.__themePerformanceLongTasks.push(...list.getEntries().map(item => item.duration)))
      .observe({type: "longtask", buffered: false});
    window.__themePerformanceStartedAt = performance.now();
  });
  await field.fill("#be812e");
  await field.press("Tab");
  await page.waitForFunction(({themeId, undo}) => {
    const app = window.__webglGeneratorApp;
    const color = app.map.visualTheme.userThemes.find(theme => theme.id === themeId)?.colors?.land?.toLowerCase();
    const fill = app.renderer.visualTheme?.land?.fill?.slice(0, 3).map(value => Math.round(value * 255));
    return color === "#be812e" && JSON.stringify(fill) === JSON.stringify([190, 129, 46])
      && app.editHistory.getStats().undo === undo + 1 && !app.runtimeOperationSnapshot?.busy;
  }, before);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve())));
  const after = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const renderer = app.renderer;
    const pixels = new Uint8Array(renderer.canvas.width * renderer.canvas.height * 4);
    renderer.gl.readPixels(0, 0, renderer.canvas.width, renderer.canvas.height, renderer.gl.RGBA, renderer.gl.UNSIGNED_BYTE, pixels);
    let changed = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] !== window.__themePerformanceBeforePixels[index]
        || pixels[index + 1] !== window.__themePerformanceBeforePixels[index + 1]
        || pixels[index + 2] !== window.__themePerformanceBeforePixels[index + 2]) changed++;
    }
    const longTasks = window.__themePerformanceLongTasks;
    return {visibleMs: Math.round(performance.now() - window.__themePerformanceStartedAt), changedPixels: changed,
      maxLongTaskMs: Math.round(Math.max(0, ...longTasks)), over200: longTasks.filter(value => value > 200).length,
      display: {localGpu: app.lastDisplayRenderWorker?.localGpu, mode: app.lastDisplayRenderWorker?.worker?.mode,
        applyMs: app.lastDisplayRenderWorker?.timings?.applyMs}, webglError: renderer.gl.getError()};
  });
  assert.ok(after.changedPixels > 100000, "主题颜色未改变正式画布的大面积像素");
  assert.equal(after.display.localGpu, true, "复杂主题改色没有使用复用海岸形状的 GPU 路径");
  assert.equal(after.over200, 0, JSON.stringify(after));
  assert.equal(after.webglError, 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ok: true, before, after}));
} finally {
  await context.close();
  await server.httpServer.close();
}
