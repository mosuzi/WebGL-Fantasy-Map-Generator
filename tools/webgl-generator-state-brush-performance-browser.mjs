#!/usr/bin/env node
import assert from "node:assert/strict";
import {createReadStream, existsSync, statSync} from "node:fs";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {extname, join, resolve, sep} from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist", "webgl-generator");
assert.ok(existsSync(join(dist, "index.html")), "先执行 pnpm run build:app");
const playwright = createRequire(join(root, "source", "Fantasy-Map-Generator", "package.json"))("playwright");
const types = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml"};
const server = createServer((request, response) => {
  const path = resolve(dist, `.${decodeURIComponent(new URL(request.url, "http://localhost").pathname) === "/" ? "/index.html" : decodeURIComponent(new URL(request.url, "http://localhost").pathname)}`);
  if (!path.startsWith(dist + sep) || !existsSync(path) || !statSync(path).isFile()) { response.writeHead(404).end(); return; }
  response.setHeader("Content-Type", types[extname(path)] || "application/octet-stream");
  createReadStream(path).pipe(response);
});
await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
const port = server.address().port;
let browser;
try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const results = [];
  for (const cellsTarget of (process.argv.includes("--100k-only") ? [100000] : [10000, 100000])) results.push(await exercise(browser, port, cellsTarget));
  console.log(JSON.stringify({ok: true, results: process.argv.includes("--summary") ? results.map(result => ({
    cellsTarget: result.cellsTarget,
    commitMs: result.commit.durationMs,
    previewMaxMs: Math.max(...result.previews.map(item => item.durationMs)),
    workerWarmMaxMs: Math.max(0, ...result.workerWarm),
    boundaryApplyMs: result.lineRefresh?.assembleMs + result.lineRefresh?.uploadMs + result.lineRefresh?.drawMs,
    undoWallMs: result.undoWallMs,
    interactionStalls: result.health.filter(item => item.type === "canvas-interaction-stall").length,
    debugVisible: result.debugVisible,
    webglError: result.webglError
  })) : results}, null, 2));
} finally {
  await browser?.close();
  await new Promise(resolveClose => server.close(resolveClose));
}

async function exercise(browserInstance, localPort, cellsTarget) {
  const context = await browserInstance.newContext({viewport: {width: 1440, height: 900}});
  const page = await context.newPage();
  page.setDefaultTimeout(180000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error" && !message.text().startsWith("[FMG health]")) errors.push(message.text()); });
  try {
    await page.goto(`http://127.0.0.1:${localPort}/?healthClear=1&debug=1`, {waitUntil: "domcontentloaded"});
    await page.waitForFunction(() => window.__webglGeneratorApp?.renderer?.getStats?.()?.webgl2);
    await page.waitForFunction(() => window.__webglGeneratorApp?.runtimeOperationSnapshot?.busy === false && document.getElementById("generation-loading")?.hidden !== false);
    const seed = `state-brush-performance-${cellsTarget}`;
    const generated = await page.evaluate(async options => window.webglGeneratorApi.generate.newMap({confirm: true, ...options}), {seed, cellsTarget});
    assert.equal(generated.ok, true, generated.error?.message);
    await page.waitForFunction(expected => window.__webglGeneratorApp?.map?.metadata?.seed === expected && !window.__webglGeneratorApp?.runtimeOperationSnapshot?.busy, seed);
    const sample = await page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      const map = app.map;
      const cells = map.grid.cells;
      const targetStateId = map.politics.states.find(state => state && (state.i ?? state.id) > 0 && !state.removed)?.i;
      app.panels.state.open(map, app.editHistory.getStats());
      app.panels.state.setTargetStateId(targetStateId);
      app.panels.state.setActive(true);
      const warmStartedAt = performance.now();
      app.renderer.warmPoliticalBrushWorker();
      const warmMs = performance.now() - warmStartedAt;
      window.__webglGeneratorDebug?.collapse?.();
      const rect = app.renderer.canvas.getBoundingClientRect();
      for (let cell = 0; cell < cells.p.length; cell++) {
        if (cells.h[cell] < 20 || cells.state[cell] === targetStateId) continue;
        const point = map.grid.points[cells.p[cell]];
        if (!point) continue;
        const screen = app.renderer.worldToScreen(point[0], point[1], rect);
        const x = rect.x + screen.x;
        const y = rect.y + screen.y;
        if (screen.x < rect.width * 0.08 || screen.x > rect.width * 0.95 || screen.y < rect.height * 0.1 || screen.y > rect.height * 0.85) continue;
        if (document.elementFromPoint(x, y) !== app.renderer.canvas) continue;
        return {x, y, cell, before: cells.state[cell], targetStateId, warmMs};
      }
      throw new Error("视口中找不到可涂抹的非目标国家 cell");
    });
    const before = await page.evaluate(() => window.__webglGeneratorApp.editHistory.getStats().undo);
    const gestureStartedAt = await page.evaluate(() => performance.now());
    const startedAt = performance.now();
    await page.mouse.move(sample.x, sample.y);
    await page.mouse.down();
    const downMs = round(performance.now() - startedAt);
    await page.mouse.move(sample.x + 4, sample.y + 3, {steps: 4});
    const moveMs = round(performance.now() - startedAt - downMs);
    await page.mouse.up();
    const wallMs = round(performance.now() - startedAt);
    await page.waitForFunction(() => {
      const renderer = window.__webglGeneratorApp?.renderer;
      return renderer?.politicalBrushAppliedRequest === renderer?.politicalBrushRequest || renderer?.politicalBrushLastError;
    });
    const observed = await page.evaluate(cell => {
      const app = window.__webglGeneratorApp;
      const samples = app.healthMonitor.getCanvasSamples();
      return {
        state: app.map.grid.cells.state[cell],
        history: app.editHistory.getStats(),
        preview: samples.filter(item => item.phase === "state-brush-preview"),
        warm: samples.filter(item => item.phase === "state-brush-worker-warm"),
        commit: samples.filter(item => item.phase === "state-brush-commit").at(-1),
        browser: samples.filter(item => item.phase.startsWith("browser-")),
        health: app.healthMonitor.getEvents().filter(item => /long-task|stall|frame-gap/.test(item.type)).slice(-12),
        debugVisible: Boolean(document.getElementById("development-canvas-summary")?.textContent),
        webglError: app.renderer.gl.getError(),
        boundaryError: app.renderer.politicalBrushLastError || null,
        lineRefresh: app.renderer.lastPoliticalLineRefresh
      };
    }, sample.cell);
    if (!observed.preview.length) console.error(JSON.stringify({sample, observed, errors}, null, 2));
    assert.equal(observed.state, sample.targetStateId, "画笔没有更新目标 cell");
    assert.equal(observed.history.undo, before + 1, "一笔应只提交一条历史");
    assert.ok(observed.preview.length, "未收集画笔预览耗时");
    assert.ok(observed.commit, "未收集画笔提交耗时");
    assert.ok(observed.commit.durationMs < 200, `画笔提交卡顿 ${observed.commit.durationMs}ms`);
    assert.ok(observed.preview.every(item => item.durationMs < 100), "画笔预览响应超过 100ms");
    assert.equal(observed.webglError, 0, "WebGL 错误");
    assert.equal(observed.boundaryError, null, "异步国界计算错误");
    const gestureLongTasks = observed.health.filter(item => item.type === "main-thread-long-task" && item.detail?.startTime >= gestureStartedAt && item.detail?.durationMs > 200);
    assert.deepEqual(gestureLongTasks, [], "画笔手势期间不应出现超过 200ms 的 LongTask");
    const undoStartedAt = performance.now();
    const undone = await page.evaluate(() => window.__webglGeneratorApp.runtimeActions.history.undo());
    const undoWallMs = round(performance.now() - undoStartedAt);
    assert.ok(undone, "国家画笔撤销失败");
    const restored = await page.evaluate(cell => window.__webglGeneratorApp.map.grid.cells.state[cell], sample.cell);
    assert.equal(restored, sample.before, "撤销未恢复原国家");
    await page.waitForFunction(() => {
      const renderer = window.__webglGeneratorApp?.renderer;
      return renderer?.politicalBrushAppliedRequest === renderer?.politicalBrushRequest || renderer?.politicalBrushLastError;
    });
    assert.deepEqual(errors, [], "页面错误");
    return {
      cellsTarget, wallMs, downMs, moveMs, warmMs: round(sample.warmMs), undoWallMs,
      workerWarm: observed.warm.map(item => item.durationMs),
      previews: observed.preview.map(item => ({durationMs: item.durationMs, sampleMs: item.sampleMs, renderMs: item.renderMs, cells: item.cells})),
      commit: observed.commit,
      browser: observed.browser,
      gestureLongTasks,
      health: observed.health.map(item => ({type: item.type, detail: item.detail})),
      debugVisible: observed.debugVisible,
      lineRefresh: observed.lineRefresh,
      webglError: observed.webglError
    };
  } finally {
    await context.close();
  }
}

function round(value) { return Math.round(value * 10) / 10; }
