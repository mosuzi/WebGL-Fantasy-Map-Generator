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
const port = 5474;
assert.ok(existsSync(distDir), `构建产物不存在：${distDir}`);

const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const server = await startStaticServer();
let browser;

try {
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const results = [];
  for (const requestedCells of [10000, 100000]) {
    results.push(await profileMap(browser, requestedCells));
  }
  console.log(JSON.stringify({ok: true, url: `http://${host}:${port}/?healthClear=1&debug=1`, results}, null, 2));
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await new Promise(done => server.close(done));
}

async function profileMap(browserInstance, requestedCells) {
  const context = await browserInstance.newContext({viewport: {width: 1440, height: 900}});
  const page = await context.newPage();
  page.setDefaultTimeout(180000);
  const consoleErrors = [];
  const healthEvents = [];
  const pageErrors = [];
  page.on("console", message => {
    if (message.type() !== "error") return;
    if (message.text().startsWith("[FMG health]")) healthEvents.push(message.text());
    else consoleErrors.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(error.message));
  try {
    await page.goto(`http://${host}:${port}/?healthClear=1&debug=1`, {waitUntil: "domcontentloaded"});
    await page.waitForFunction(() => window.__webglGeneratorApp?.renderer?.getStats?.()?.webgl2);
    await page.waitForFunction(() => window.__webglGeneratorApp?.runtimeOperationSnapshot?.busy === false && document.getElementById("generation-loading")?.hidden !== false);
    const seed = `height-brush-performance-${requestedCells}`;
    const generated = await page.evaluate(async ({seed, cellsTarget}) => window.webglGeneratorApi.generate.newMap({confirm: true, seed, cellsTarget}), {seed, cellsTarget: requestedCells});
    assert.equal(generated.ok, true, generated.error?.message || "高度性能地图生成失败");
    await page.waitForFunction(seedValue => window.__webglGeneratorApp?.runtimeOperationSnapshot?.busy === false && window.__webglGeneratorApp?.map?.metadata?.seed === seedValue, seed);
    await page.evaluate(() => window.__webglGeneratorApp.panels.height.open(window.__webglGeneratorApp.editHistory.getStats()));
    await page.locator('.floating-panel[data-panel-id="height-panel"]:not(.hidden)').waitFor({state: "visible"});
    await page.evaluate(() => window.__webglGeneratorApp.canvasToolModes.enter("height:brush"));
    const uiState = await exerciseHeightEditorUi(page);
    const healthStart = healthEvents.length;
    const canvas = page.locator("#map-canvas");
    const box = await canvas.boundingBox();
    assert.ok(box?.width > 0 && box?.height > 0, "地图 canvas 没有可用尺寸");
    const center = {x: box.x + box.width * 0.68, y: box.y + box.height * 0.52};
    const shoreCenter = await page.evaluate(findVisibleShoreCellPoint, false);
    const crossingCenter = await page.evaluate(findVisibleShoreCellPoint, true);
    const shortSamples = [];
    const longSamples = [];
    const shoreSamples = [];
    for (let index = 0; index < 3; index += 1) shortSamples.push(await runStroke(page, center, [center], "短笔刷"));
    for (let index = 0; index < 3; index += 1) longSamples.push(await runStroke(page, center, Array.from({length: 18}, (_, pointIndex) => ({x: center.x + pointIndex * box.width * 0.012, y: center.y + Math.sin(pointIndex / 3) * box.height * 0.02})), "连续长拖"));
    const panel = page.locator('.floating-panel[data-panel-id="height-panel"]:not(.hidden)');
    await panel.locator('button[data-mode="land"]').click();
    for (let index = 0; index < 2; index += 1) shoreSamples.push(await runStroke(page, shoreCenter, [shoreCenter], "岸线短笔刷"));
    await panel.locator('button[data-mode="lower"]').click();
    await panel.locator('button[data-mode="all"]').click();
    const strength = panel.locator("label.ui-slider-field").filter({has: page.getByText("强度", {exact: true})}).locator(".ui-slider-number input");
    await strength.fill("5");
    await strength.press("Enter");
    const falloff = panel.getByRole("switch", {name: "中心衰减"});
    if (await falloff.getAttribute("aria-checked") === "true") await panel.getByText("中心衰减", {exact: true}).click();
    await page.waitForFunction(() => {
      const brush = window.__webglGeneratorApp.panels.height.getBrush();
      return brush.active && brush.action === "lower" && !brush.preserveSurface && !brush.falloff && brush.strength === 5;
    });
    // 跨水陆像素断言只观察地表及岸线。行政线在高程提交后独立更新。
    for (const layer of ["stateBorders", "provinceBorders"]) {
      const result = await page.evaluate(layer => window.webglGeneratorApi.layers.setVisible(layer, false), layer);
      assert.ok(result.ok, result.error?.message);
    }
    const topologySamples = [];
    if (requestedCells === 100000) {
      const other = await page.evaluate(findVisibleShoreCellPoint, crossingCenter);
      await checkInterruptedAndQueuedStrokes(page, other);
    }
    for (let index = 0; index < 2; index += 1) topologySamples.push(await runStroke(page, crossingCenter, [crossingCenter], "跨水陆岸线笔刷"));
    const map = await page.evaluate(() => ({
      gridCells: window.__webglGeneratorApp.map.grid.cells.i.length,
      checksum: window.__webglGeneratorApp.map.metadata.checksum,
      history: window.__webglGeneratorApp.editHistory.getStats(),
      cacheWarmup: window.__webglGeneratorApp.heightEdit.lastCacheWarmup,
      heightSelectionCells: window.__webglGeneratorApp.renderer.getStats().heightCellSelection.cells,
      renderer: window.__webglGeneratorApp.renderer.getStats(),
      webglError: window.__webglGeneratorApp.renderer.gl?.getError?.() ?? 0
    }));
    assert.equal(consoleErrors.length, 0, consoleErrors.join("\n"));
    assert.equal(pageErrors.length, 0, pageErrors.join("\n"));
    assert.equal(map.webglError, 0, `WebGL error: ${map.webglError}`);
    assert.equal(map.cacheWarmup?.spatialIndex?.ready, true, "高度空间索引未在进入高度编辑时预热");
    assert.equal(map.cacheWarmup?.packCellsByGrid?.ready, true, "Grid→Pack 高度映射未在进入高度编辑时预热");
    assert.equal(map.heightSelectionCells, uiState.selectionCells, "进入高度编辑后真实地形选区高亮未恢复");
    assert.equal(shoreSamples.every(sample => sample.commitPerformance?.stages?.refreshHeightCells?.incremental === true), true, "岸线高度笔刷不应触发完整拓扑重建");
    assert.ok(Math.max(...shoreSamples.map(sample => sample.wallMs)) < 500, `岸线高度笔刷停手仍超过 500ms：${shoreSamples.map(sample => sample.wallMs).join(", ")}`);
    assert.ok(topologySamples.every(sample => sample.commitPerformance?.stages?.refreshHeightCells?.incremental), "松笔须复用预览已更新的海岸");
    assert.ok(topologySamples.every(sample => sample.surfaceRefreshDelta === 0), "跨海陆时不得重建整图地表");
    assert.deepEqual(topologySamples.flatMap(sample => sample.commitLongTasks), [], "岸线落笔出现至少 50ms 的主线程任务");
    const maxTopologyRefreshMs = Math.max(...topologySamples.map(sample => sample.commitPerformance?.stages?.refreshHeightCells?.ms ?? Infinity));
    assert.ok(maxTopologyRefreshMs < 500, `跨水陆高度笔刷核心刷新仍超过 500ms：${topologySamples.map(sample => sample.commitPerformance?.stages?.refreshHeightCells?.ms).join(", ")}`);
    assert.ok(Math.max(...topologySamples.map(sample => sample.wallMs)) < 650, `跨水陆高度笔刷 pointerup 仍超过 650ms：${topologySamples.map(sample => sample.wallMs).join(", ")}`);
    let hardShore;
    if (requestedCells === 100000) {
      await page.evaluate(() => window.webglGeneratorApi.layers.setSmoothCellBorders(false));
      hardShore = await runStroke(page, crossingCenter, [crossingCenter], "跨水陆岸线笔刷");
      assert.equal(hardShore.surfaceRefreshDelta, 0);
      assert.equal(hardShore.commitPerformance.stages.refreshHeightCells.incremental, true);
      assert.deepEqual(hardShore.commitLongTasks, [], "直岸落笔出现至少 50ms 的主线程任务");
      await page.evaluate(() => window.webglGeneratorApi.layers.setSmoothCellBorders(true));
    }
    await page.evaluate(() => window.webglGeneratorApi.history.redo());
    const savedShore = await readShoreFrame(page, crossingCenter);
    const saved = await page.evaluate(() => window.webglGeneratorApi.data.saveBrowserMap());
    assert.ok(saved.ok, saved.error?.message);
    await page.reload({waitUntil: "domcontentloaded"});
    await page.waitForFunction(() => window.__webglGeneratorApp?.renderer?.getStats?.()?.webgl2);
    await page.waitForFunction(() => window.__webglGeneratorApp?.runtimeOperationSnapshot?.busy === false && document.getElementById("generation-loading")?.hidden !== false);
    await page.evaluate(() => window.__webglGeneratorApp.panels.height.open(window.__webglGeneratorApp.editHistory.getStats()));
    await page.locator('.floating-panel[data-panel-id="height-panel"]:not(.hidden)').waitFor({state: "visible"});
    const refreshRadius = await page.evaluate(() => window.__webglGeneratorApp.panels.height.getBrush().radius);
    assert.equal(refreshRadius, 27, "刷新页面后高度画笔大小没有从地图存档恢复");
    const reopened = await readShoreFrame(page, crossingCenter);
    assert.equal(reopened.height, savedShore.height, "回读必须保留新水面");
    assert.deepEqual(reopened.edges, savedShore.edges, "回读必须保留新岸线");
    assert.equal(reopened.errors, 0, "回读后的岸线与实际海陆不符");
    return {
      requestedCells,
      actualGridCells: map.gridCells,
      checksum: map.checksum,
      webglError: map.webglError,
      heightSelectionCells: map.heightSelectionCells,
      uiState,
      refreshRadius,
      cacheWarmup: map.cacheWarmup,
      short: summarizeStrokes(shortSamples),
      long: summarizeStrokes(longSamples),
      shore: summarizeStrokes(shoreSamples),
      topology: summarizeStrokes(topologySamples),
      hardShore,
      historyBeforeUndo: map.history,
      drawEvents: summarizeEvent(map.renderer.performanceEvents?.draw),
      surfaceRefreshEvents: summarizeEvent(map.renderer.performanceEvents?.surfaceRefresh),
      health: summarizeHealth(healthEvents.slice(healthStart)),
      consoleErrors,
      pageErrors
    };
  } finally {
    await context.close();
  }
}

async function exerciseHeightEditorUi(page) {
  const panel = page.locator('.floating-panel[data-panel-id="height-panel"]:not(.hidden)');
  const action = panel.locator('button[data-mode="lower"]');
  const scope = panel.locator('button[data-mode="all"]');
  await action.click();
  await scope.click();
  const modeSync = await page.evaluate(() => window.webglGeneratorApi.layers.setViewMode("height"));
  assert.equal(modeSync?.ok, true, modeSync?.error?.message || "视图模式同步失败");
  const brushRadius = panel.locator("label").filter({hasText: "画笔大小"}).locator(".ui-slider-number input");
  await brushRadius.fill("27");
  await brushRadius.press("Enter");
  await page.waitForFunction(() => window.__webglGeneratorApp?.panels?.height?.getBrush?.().radius === 27);
  const beforeLock = await page.evaluate(() => {
    const readHeightButtonState = selector => {
      const button = document.querySelector(selector);
      const style = button ? getComputedStyle(button) : null;
      return {
        pressed: button?.getAttribute("aria-pressed") || null,
        activeClass: button?.classList.contains("active") || false,
        color: style?.color || null,
        backgroundImage: style?.backgroundImage || null
      };
    };
    return {
      action: readHeightButtonState('.height-action-group button[data-mode="lower"]'),
      scope: readHeightButtonState('.height-scope-group button[data-mode="all"]'),
      activeViewModes: [...document.querySelectorAll('.ui-segmented-mode-bridge[data-mode].active')].map(button => button.dataset.mode),
      radius: window.__webglGeneratorApp.panels.height.getBrush().radius,
      storedRadius: window.__webglGeneratorApp.brushRadii.height
    };
  });
  assert.equal(beforeLock.action.pressed, "true", "高度动作按钮缺少真实选中语义");
  assert.equal(beforeLock.scope.pressed, "true", "高度作用范围按钮缺少真实选中语义");
  assert.equal(beforeLock.action.activeClass, true, "高度动作按钮缺少 active class");
  assert.equal(beforeLock.scope.activeClass, true, "高度作用范围按钮缺少 active class");
  assert.equal(beforeLock.action.color, "rgb(50, 106, 118)", "高度动作按钮没有高亮计算样式");
  assert.equal(beforeLock.scope.color, "rgb(50, 106, 118)", "高度作用范围按钮没有高亮计算样式");
  assert.deepEqual(beforeLock.activeViewModes, ["height"], "视图模式同步不应清除或污染高度按钮选中态");
  assert.equal(beforeLock.radius, 27, "高度画笔大小没有响应真实面板输入");
  assert.equal(beforeLock.storedRadius, 27, "高度画笔大小没有同步到地图");

  await panel.getByRole("button", {name: "覆盖锁定"}).click();
  await page.waitForFunction(() => window.__webglGeneratorApp?.heightEdit?.terrainSelection?.cellIds?.length > 0);
  const selectionCells = await page.evaluate(() => window.__webglGeneratorApp.heightEdit.terrainSelection.cellIds.length);
  assert.ok(selectionCells > 0, "真实覆盖锁定没有形成高度选区");
  await page.evaluate(() => window.__webglGeneratorApp.renderer.setHeightCellSelection([], {draw: false}));
  await panel.getByRole("button", {name: "停止高度编辑"}).click();
  await panel.getByRole("button", {name: "启用高度编辑"}).click();
  await page.waitForFunction(expected => window.__webglGeneratorApp?.renderer?.getStats?.().heightCellSelection?.cells === expected, selectionCells);
  const canvasBox = await page.locator("#map-canvas").boundingBox();
  assert.ok(canvasBox?.width > 0 && canvasBox?.height > 0, "高度编辑重入后地图 canvas 没有可用尺寸");
  await page.mouse.move(canvasBox.x + canvasBox.width * 0.52, canvasBox.y + canvasBox.height * 0.48);
  await page.waitForTimeout(40);
  const afterReenter = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const readHeightButtonState = selector => {
      const button = document.querySelector(selector);
      const style = button ? getComputedStyle(button) : null;
      return {
        pressed: button?.getAttribute("aria-pressed") || null,
        activeClass: button?.classList.contains("active") || false,
        color: style?.color || null,
        backgroundImage: style?.backgroundImage || null
      };
    };
    return {
      action: readHeightButtonState('.height-action-group button[data-mode="lower"]'),
      scope: readHeightButtonState('.height-scope-group button[data-mode="all"]'),
      radius: app.panels.height.getBrush().radius,
      selectionCells: app.renderer.getStats().heightCellSelection.cells,
      cursorRadius: document.querySelector(".brush-cursor-preview")?.dataset.worldRadius || null
    };
  });
  assert.equal(afterReenter.action.pressed, "true", "重新进入高度编辑后动作选中态丢失");
  assert.equal(afterReenter.scope.pressed, "true", "重新进入高度编辑后作用范围选中态丢失");
  assert.equal(afterReenter.action.activeClass, true, "重新进入高度编辑后动作 active class 丢失");
  assert.equal(afterReenter.scope.activeClass, true, "重新进入高度编辑后作用范围 active class 丢失");
  assert.equal(afterReenter.action.color, "rgb(50, 106, 118)", "重新进入高度编辑后动作高亮丢失");
  assert.equal(afterReenter.scope.color, "rgb(50, 106, 118)", "重新进入高度编辑后作用范围高亮丢失");
  assert.equal(afterReenter.radius, 27, "重新进入高度编辑后画笔大小没有保持");
  assert.equal(afterReenter.selectionCells, selectionCells, "真实高度选区 GPU 高亮没有恢复");
  await panel.getByRole("button", {name: "关闭面板"}).click();
  const hiddenPanel = page.locator('.floating-panel[data-panel-id="height-panel"]');
  await hiddenPanel.waitFor({state: "hidden"});
  await page.evaluate(() => window.__webglGeneratorApp.panels.height.open(window.__webglGeneratorApp.editHistory.getStats()));
  await panel.waitFor({state: "visible"});
  await panel.getByRole("button", {name: "启用高度编辑"}).click();
  await page.waitForFunction(expected => window.__webglGeneratorApp?.panels?.height?.getBrush?.().radius === 27 && window.__webglGeneratorApp.renderer.getStats().heightCellSelection.cells === expected, selectionCells);
  return {selectionCells, beforeLock, afterReenter, panelReopen: {radius: 27, selectionCells}};
}

function findVisibleShoreCellPoint(crossing) {
  const app = window.__webglGeneratorApp;
  const paths = [...(app.renderer.shoreVisualPaths?.coastline || []), ...(app.renderer.shoreVisualPaths?.lakeShore || [])];
  const cells = app.map.grid.cells;
  const points = app.map.grid.points;
  const rect = app.renderer.canvas.getBoundingClientRect();
  const shoreSurfaceCells = new Set(Object.values(app.renderer.shoreSurfaceCellRanges || {}).flatMap(byCell => byCell instanceof Map ? [...byCell.keys()] : []));
  const candidates = shoreSurfaceCells.size ? shoreSurfaceCells : new Set(paths.flatMap(path => [...(path.landCells || [])]));
  for (const gridCell of candidates) {
    if (cells.h[gridCell] < (crossing ? 20 : 25) || (crossing && cells.h[gridCell] > 24)) continue;
    const point = points[cells.p[gridCell]];
    if (!point) continue;
    const screen = app.renderer.worldToScreen(point[0], point[1], rect);
    if (typeof crossing === "object" && Math.hypot(rect.x + screen.x - crossing.x, rect.y + screen.y - crossing.y) < 100) continue;
    if (screen.x > rect.width * 0.3 && screen.x < rect.width * 0.8 && screen.y > rect.height * 0.3 && screen.y < rect.height * 0.75
      && document.elementFromPoint(rect.x + screen.x, rect.y + screen.y) === app.renderer.canvas) {
      return {x: rect.x + screen.x, y: rect.y + screen.y, gridCell};
    }
  }
  throw new Error("未找到可视岸线 cell");
}

async function checkInterruptedAndQueuedStrokes(page, point) {
  const original = await readShoreFrame(page, point);
  const depth = await page.evaluate(() => window.__webglGeneratorApp.editHistory.getStats().undo);
  await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    document.addEventListener("pointerdown", event => {
      function cancelPending() {
        const stroke = app.heightEdit.activeStroke;
        if (!stroke) return;
        if (!stroke.pendingShore) return requestAnimationFrame(cancelPending);
        const pending = stroke.pendingShore;
        app.renderer.canvas.dispatchEvent(new PointerEvent("pointercancel", {pointerId: event.pointerId, bubbles: true}));
        pending.then(() => { window.shoreCancelSettled = true; });
      }
      requestAnimationFrame(cancelPending);
    }, {once: true, capture: true});
  });
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.waitForFunction(() => window.shoreCancelSettled, null, {timeout: 5000});
  await page.mouse.up();
  assert.deepEqual(await readShoreFrame(page, point), original, "取消后迟到的岸线不得覆盖原图");
  assert.equal(await page.evaluate(() => window.__webglGeneratorApp.editHistory.getStats().undo), depth);
  await page.mouse.click(point.x, point.y);
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(d => !window.__webglGeneratorApp.heightEdit.activeStroke && window.__webglGeneratorApp.editHistory.getStats().undo === d + 2, depth);
  assert.equal((await readShoreFrame(page, point)).height, original.height - 10, "两次快速落笔应独立降低高度");
  for (let i = 0; i < 2; i++) assert.ok((await page.evaluate(() => window.webglGeneratorApi.history.undo())).ok);
  assert.deepEqual(await readShoreFrame(page, point), original, "两笔应可分别撤销至原始岸线和像素");
  assert.ok(!await page.evaluate(() => window.__webglGeneratorApp.renderer.lastHeightShoreError));
}

async function readShoreFrame(page, start, held = false) {
  if (!held) await page.mouse.move(0, 0);
  return page.evaluate(({x, y, gridCell}) => {
    const {renderer, map} = window.__webglGeneratorApp;
    const {gl, canvas} = renderer;
    renderer.draw({updateOverlay: false});
    const rect = canvas.getBoundingClientRect();
    const px = Math.round((x - rect.left) * canvas.width / rect.width);
    const py = Math.round((rect.bottom - y) * canvas.height / rect.height);
    const size = Math.min(160, 2 * Math.min(px, py, canvas.width - px, canvas.height - py));
    const pixels = new Uint8Array(size * size * 4);
    gl.readPixels(px - (size >> 1), py - (size >> 1), size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let hash = 2166136261;
    for (const byte of pixels) hash = Math.imul(hash ^ byte, 16777619);
    const edges = [];
    let errors = 0;
    for (const path of [...renderer.shoreVisualPaths.coastline, ...renderer.shoreVisualPaths.lakeShore]) {
      for (const {landCell, waterCell} of path.sourceEdges) {
        if (map.grid.cells.h[landCell] < 20 || map.grid.cells.h[waterCell] >= 20) errors++;
        if (landCell === gridCell || waterCell === gridCell) edges.push([landCell, waterCell].join("/"));
      }
    }
    const cells = map.grid.cells;
    const land = cells.h[gridCell] >= 20;
    const expected = cells.c[gridCell].filter(neighbor => land !== (cells.h[neighbor] >= 20)
      && cells.v[gridCell].filter(vertex => cells.v[neighbor].includes(vertex)).length >= 2)
      .map(neighbor => (land ? [gridCell, neighbor] : [neighbor, gridCell]).join("/")).sort();
    edges.sort();
    if (edges.join(",") !== expected.join(",")) errors++;
    return {pixels: hash >>> 0, edges, height: cells.h[gridCell], errors};
  }, start);
}

async function runStroke(page, start, points, label) {
  const checkShore = label === "跨水陆岸线笔刷";
  const originalShore = checkShore ? await readShoreFrame(page, start) : null;
  const before = await page.evaluate(readBrushSnapshot);
  if (checkShore) await page.evaluate(cell => {
    window.brushLongTasks = [];
    const app = window.__webglGeneratorApp;
    const height = app.map.grid.cells.h;
    const neighbors = new Set([cell, ...app.map.grid.cells.c[cell]]);
    for (const n of [...neighbors]) for (const next of app.map.grid.cells.c[n]) neighbors.add(next);
    const original = [...neighbors].map(n => [n, height[n]]);
    const receipt = window.shoreFeedback = {};
    document.addEventListener("pointerdown", () => {
      const start = performance.now();
      function tick() {
        if (window.shoreFeedback !== receipt) return;
        const ms = Math.round((performance.now() - start) * 10) / 10;
        if (receipt.firstChangeMs === undefined && original.some(([n, before]) => height[n] !== before)) receipt.firstChangeMs = ms;
        if (height[cell] < 20) receipt.shoreReadyMs = ms;
        else requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }, {capture: true, once: true});
    window.brushObserver = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) window.brushLongTasks.push(entry.duration);
    });
    window.brushObserver.observe({type: "longtask"});
  }, start.gridCell);
  const frameStartedAt = await page.evaluate(() => {
    const startedAt = performance.now();
    window.__heightBrushPerfFrame = null;
    requestAnimationFrame(() => { window.__heightBrushPerfFrame = performance.now(); });
    return startedAt;
  });
  const startedAt = performance.now();
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const pointerDownMs = round(performance.now() - startedAt);
  for (const point of points.slice(1)) await page.mouse.move(point.x, point.y, {steps: 1});
  const during = await page.evaluate(readBrushSnapshot);
  let heldShore;
  if (checkShore) {
    await page.waitForFunction(cell => window.__webglGeneratorApp.map.grid.cells.h[cell] < 20, start.gridCell);
    heldShore = await readShoreFrame(page, start, true);
    assert.equal(heldShore.errors, 0, "按住画笔时岸线必须已经贴合真实水陆");
  }
  await page.mouse.up();
  const wallMs = round(performance.now() - startedAt);
  const feedbackMs = await page.evaluate(frameStarted => window.__heightBrushPerfFrame === null ? null : Math.round((window.__heightBrushPerfFrame - frameStarted) * 10) / 10, frameStartedAt);
  await page.waitForTimeout(80);
  const commitLongTasks = checkShore ? await page.evaluate(() => {
    window.brushObserver.disconnect();
    return window.brushLongTasks;
  }) : [];
  const after = await page.evaluate(readBrushSnapshot);
  const changedShore = checkShore ? await readShoreFrame(page, start) : null;
  if (checkShore) {
    assert.deepEqual(heldShore, changedShore, "松笔不应再次改变已经显示的海岸或色块");
    assert.equal(changedShore.errors, 0, "岸线与实际海陆不符");
    assert.ok(originalShore.height >= 20 && changedShore.height < 20, "目标格必须从陆地变成水面");
    assert.notEqual(changedShore.pixels, originalShore.pixels, "海陆变化必须可见");
  }
  const undoResult = await page.evaluate(() => window.webglGeneratorApi.history.undo());
  if (checkShore) assert.deepEqual(await readShoreFrame(page, start), originalShore, "撤销须还原原岸线和像素");
  const undo = undoResult?.data || undoResult || {};
  const redoResult = await page.evaluate(() => window.webglGeneratorApi.history.redo());
  const redo = redoResult?.data || redoResult || {};
  if (checkShore) assert.deepEqual(await readShoreFrame(page, start), changedShore, "重做须还原已提交岸线和像素");
  const undoAgainResult = await page.evaluate(() => window.webglGeneratorApi.history.undo());
  const undoAgain = undoAgainResult?.data || undoAgainResult || {};
  assert.equal(after.activeStrokeCells > 0 || after.lastAffected > 0 || during.activeStrokeCells > 0, true, `${label} 没有形成高度笔刷变化`);
  return {
    label,
    commitLongTasks,
    visibleChanges: checkShore ? await page.evaluate(() => window.shoreFeedback) : null,
    pointerDownMs,
    wallMs,
    feedbackMs,
    touchedCells: during.activeStrokeCells || after.lastAffected,
    drawDelta: after.drawCount - before.drawCount,
    surfaceRefreshDelta: after.surfaceRefreshCount - before.surfaceRefreshCount,
    commitPerformance: after.commitPerformance,
    heapBefore: before.heap,
    heapAfter: after.heap,
    undo: undo.history || null,
    undoExecuted: Boolean(undo.executed || undoResult?.ok === true),
    redoExecuted: Boolean(redo.executed || redoResult?.ok === true),
    undoAgainExecuted: Boolean(undoAgain.executed || undoAgainResult?.ok === true)
  };
}

function readBrushSnapshot() {
  const app = window.__webglGeneratorApp;
  const events = app.renderer.getStats().performanceEvents || {};
  return {
    activeStrokeCells: app.heightEdit.activeStroke?.originals?.size || 0,
    lastAffected: app.heightEdit.lastAffected || 0,
    drawCount: events.draw?.completed || 0,
    surfaceRefreshCount: events.surfaceRefresh?.completed || 0,
    commitPerformance: app.heightEdit.lastCommitPerformance || null,
    heap: performance.memory?.usedJSHeapSize || null
  };
}

function summarizeEvent(event) {
  return event ? {scheduled: event.scheduled || 0, completed: event.completed || 0, lastMs: event.ms || 0, lastStatus: event.last?.status || "none"} : {scheduled: 0, completed: 0, lastMs: 0, lastStatus: "none"};
}

function summarizeStrokes(samples) {
  return {
    count: samples.length,
    pointerDownMs: summarizeMetric(samples.map(sample => sample.pointerDownMs)),
    wallMs: summarizeMetric(samples.map(sample => sample.wallMs)),
    feedbackMs: summarizeMetric(samples.map(sample => sample.feedbackMs)),
    touchedCells: {min: Math.min(...samples.map(sample => sample.touchedCells)), max: Math.max(...samples.map(sample => sample.touchedCells))},
    drawDelta: samples.map(sample => sample.drawDelta),
    surfaceRefreshDelta: samples.map(sample => sample.surfaceRefreshDelta),
    heapDelta: samples.map(sample => sample.heapAfter - sample.heapBefore),
    undoExecuted: samples.every(sample => sample.undoExecuted),
    redoExecuted: samples.every(sample => sample.redoExecuted),
    undoAgainExecuted: samples.every(sample => sample.undoAgainExecuted),
    samples
  };
}

function summarizeMetric(values) {
  const finite = values.filter(value => Number.isFinite(value)).sort((left, right) => left - right);
  if (!finite.length) return {p50: null, p95: null, max: null};
  return {p50: percentile(finite, 0.5), p95: percentile(finite, 0.95), max: finite.at(-1)};
}

function percentile(values, ratio) {
  return values[Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * ratio) - 1))];
}

function summarizeHealth(events) {
  const longTasks = events.filter(event => event.includes("main-thread-long-task"));
  return {count: events.length, longTaskCount: longTasks.length, events};
}

function round(value) {
  return Number(Number(value).toFixed(1));
}

async function startStaticServer() {
  const serverInstance = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, `http://${host}:${port}`).pathname);
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
  await new Promise((resolveListen, rejectListen) => serverInstance.listen(port, host, resolveListen).once("error", rejectListen));
  return serverInstance;
}

function contentType(file) {
  return ({".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png"})[extname(file).toLowerCase()] || "application/octet-stream";
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}
