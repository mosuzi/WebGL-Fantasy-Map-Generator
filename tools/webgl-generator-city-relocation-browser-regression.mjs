import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createServer as createViteServer} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const host = "127.0.0.1";
const port = 5523;
const baseUrl = `http://${host}:${port}`;
const timeoutMs = 180000;
const requestedCells = process.env.CITY_RELOCATION_CELLS
  ? process.env.CITY_RELOCATION_CELLS.split(",").map(Number).filter(Number.isInteger)
  : [10000, 100000];

const vite = await createViteServer({
  configFile: join(rootDir, "vite.config.mjs"),
  server: {host, port, strictPort: true},
  logLevel: "error"
});
let browser;

try {
  await vite.listen();
  browser = await playwright.chromium.launch({headless: true, channel: "chrome", args: ["--js-flags=--expose-gc"]});
  const context = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1});
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const consoleErrors = [];
  const healthErrors = [];
  const pageErrors = [];
  page.on("console", message => {
    if (message.type() !== "error") return;
    if (message.text().startsWith("[FMG health]")) healthErrors.push(message.text());
    else consoleErrors.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto(`${baseUrl}/?debug=1&healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, timeoutMs);
  await waitForMapReady(page);

  const reports = [];
  for (const cellsTarget of requestedCells) {
    if (cellsTarget !== 10000) {
      await page.evaluate(async target => {
        await window.webglGeneratorApi.generate.newMap({
          confirm: true,
          seed: `city-relocation-browser-${target}`,
          cellsTarget: target,
          heightmapTemplate: "continents"
        });
      }, cellsTarget);
      await page.waitForFunction(target => window.__webglGeneratorApp?.map?.metadata?.cellsTarget === target, cellsTarget);
      await waitForMapReady(page);
    }
    await page.waitForFunction(() => window.__webglGeneratorApp?.renderer?.getStats?.().routeRefreshPending === false);
    await page.waitForFunction(() => Boolean(document.querySelector('.vue-city-panel-root [data-action-id="CityPanel:move"]')));
    await page.evaluate(async () => {
      globalThis.gc?.();
      await new Promise(resolve => setTimeout(resolve, 120));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      window.__webglGeneratorApp?.healthMonitor?.clear?.();
      if (app?.cityEdit) app.cityEdit.movePerformanceSamples = [];
      window.__webglGeneratorHealth?.clear?.();
      window.__webglGeneratorDebug?.clearHealthEvents?.();
      window.__cityMoveLongTaskObserver?.disconnect?.();
      window.__cityMoveLongTasks = [];
      window.__cityMoveLongTaskObserver = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) window.__cityMoveLongTasks.push({duration: entry.duration, startTime: entry.startTime});
      });
      window.__cityMoveLongTaskObserver.observe({type: "longtask", buffered: false});
    });
    healthErrors.length = 0;
    const report = await verifyCityRelocation(page, cellsTarget);
    report.healthErrors = [...healthErrors];
    assert.deepEqual(report.healthErrors, [], `${cellsTarget} 城市移动不得产生 health error`);
    reports.push(report);
  }

  const nullContextFallback = await verifyNullSecondaryContextFallback(context);

  assert.deepEqual(consoleErrors, [], "城市移动浏览器回归不得产生 application console error");
  assert.deepEqual(pageErrors, [], "城市移动浏览器回归不得产生 page error");
  console.log(JSON.stringify({ok: true, reports, nullContextFallback, consoleErrors, healthErrors, pageErrors}, null, 2));
  await context.close();
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await vite.close();
}

async function waitForMapReady(page) {
  await page.waitForFunction(() => window.webglGeneratorApi?.info?.mapSummary?.()?.data?.ready === true);
  await page.waitForFunction(() => document.getElementById("app-loading-screen")?.hidden === true);
}

async function verifyCityRelocation(page, cellsTarget) {
  const phaseMarks = [];
  const markPhase = async label => phaseMarks.push({label, time: await page.evaluate(() => performance.now())});
  const setup = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const map = app.map;
    const api = window.webglGeneratorApi;
    const cities = (map.settlements.cities || []).filter(city => city && !city.removed);
    const city = cities.find(item => !item.capital && !item.provincial && !item.port && item.id > 0 && item.x > map.metadata.graphWidth * 0.82 && item.y > 80 && item.y < map.metadata.graphHeight - 80)
      || cities.find(item => !item.capital && !item.provincial && !item.port && item.id > 0)
      || cities.find(item => !item.capital && !item.provincial && item.id > 0)
      || cities[1]
      || cities[0];
    if (!city) throw new Error("隔离地图没有可移动城市");

    const candidates = [];
    for (let packCell = 1; packCell < map.pack.cells.i.length; packCell++) {
      const gridCell = Number(map.pack.cells.g[packCell]);
      if (!Number.isInteger(gridCell) || gridCell === city.cell) continue;
      if (Number(map.pack.cells.burg?.[packCell]) > 0) continue;
      if (Number(map.pack.cells.h?.[packCell]) < 20) continue;
      if (Number(map.pack.cells.state?.[packCell]) !== Number(city.state)) continue;
      const point = map.pack.cells.p?.[packCell];
      if (!Array.isArray(point)) continue;
      candidates.push({
        gridCell,
        packCell,
        point,
        distance: Math.hypot(point[0] - city.x, point[1] - city.y)
      });
    }
    candidates.sort((a, b) => a.distance - b.distance);
    let chosen = null;
    let repeatChosen = null;
    for (const candidate of candidates.slice(0, 120)) {
      const result = api.edit.cities.inspectMove(city.id, candidate);
      const preview = result?.data ?? result;
      if (preview?.valid && preview.changed) {
        if (!chosen) chosen = {...candidate, preview};
        else {
          repeatChosen = {...candidate, preview};
          break;
        }
      }
    }
    if (!chosen) throw new Error(`城市 #${city.id} 没有可移动目标`);
    if (!repeatChosen) throw new Error(`城市 #${city.id} 没有连续移动的第二目标`);

    const rect = app.renderer.canvas.getBoundingClientRect();
    const camera = app.renderer.camera;
    const project = point => {
      const ndcX = (point[0] / map.metadata.graphWidth * 2 - 1) * camera.scale + camera.offsetX;
      const ndcY = (1 - point[1] / map.metadata.graphHeight * 2) * camera.scale + camera.offsetY;
      return {
        x: rect.left + ((ndcX + 1) / 2) * rect.width,
        y: rect.top + ((1 - ndcY) / 2) * rect.height
      };
    };
    return {
      city: {id: city.id, name: city.name, cell: city.cell, packCell: city.packCell, point: [city.x, city.y]},
      target: {gridCell: chosen.gridCell, packCell: chosen.packCell},
      targetPoint: chosen.point,
      repeatTarget: {gridCell: repeatChosen.gridCell, packCell: repeatChosen.packCell},
      repeatTargetPoint: repeatChosen.point,
      preview: chosen.preview,
      start: project([city.x, city.y]),
      end: project(chosen.point),
      actualGridCells: map.grid.cells.i.length,
      actualPackCells: map.pack.cells.i.length
    };
  });
  await page.evaluate(({id}) => {
    const app = window.__webglGeneratorApp;
    app.selectionStore.setSelection({object: {kind: "city", id}});
    app.panels.city.open(app.map, {object: {kind: "city", id}}, app.editHistory.getStats());
    app.panels.city.setSelectedCityId(id);
  }, setup.city);
  const panel = '.floating-panel[data-panel-id="city-panel"]:not(.hidden)';
  await page.locator(panel).waitFor({state: "visible"});
  await markPhase("move-control");
  const moveButton = page.locator(`${panel} [data-action-id="CityPanel:move"]`);
  await moveButton.waitFor({state: "visible"});
  await page.evaluate(() => import("/src/runtime/settlement-cell-index.js"));
  const sameCellFixture = await findSameCellRelocationFixture(page, [setup.city.id]);
  const crossBorderFixture = await findCrossBorderCapitalFixture(page);
  const interactionWindowStart = await page.evaluate(async () => {
    globalThis.gc?.();
    await new Promise(resolve => setTimeout(resolve, 120));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.__cityMoveLongTasks = [];
    return performance.now();
  });
  await markPhase("move-activation");
  await moveButton.click();
  await page.waitForTimeout(80);
  await markPhase("move-active");

  const active = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    return {
      mode: app.canvasToolModes.getSnapshot().active?.id || null,
      locksInteraction: app.canvasToolModes.getSnapshot().active?.locksInteraction ?? null,
      moveMode: app.cityEdit.moveMode,
      selectedCityId: app.cityEdit.moveCityId
    };
  });
  assert.equal(active.mode, "city:move");
  assert.equal(active.locksInteraction, false, "CITY_MOVE 必须是非模态交互");
  assert.equal(active.moveMode, true);
  assert.equal(active.selectedCityId, setup.city.id);
  const readyHandle = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const rect = app.renderer.cityMovePreviewFallbackElement.getBoundingClientRect();
    return {ghost: app.renderer.getStats().cityMoveGhost, rect: {width: rect.width, height: rect.height}};
  });
  assert.equal(readyHandle.ghost.active, true, "进入移动模式后必须立即显示所选城市起拖手柄");
  assert.equal(readyHandle.ghost.phase, "ready", "起拖手柄阶段错误");
  assert.deepEqual(readyHandle.rect, {width: 36, height: 36}, "起拖手柄必须显示与 18px 半径同源的固定屏幕热区");
  const interactionPoints = await page.evaluate(({cityPoint, targetPoint, repeatTargetPoint}) => {
    const renderer = window.__webglGeneratorApp.renderer;
    const rect = renderer.canvas.getBoundingClientRect();
    const project = point => {
      const screen = renderer.worldToScreen(point[0], point[1], rect);
      return {x: rect.left + screen.x, y: rect.top + screen.y};
    };
    return {start: project(cityPoint), end: project(targetPoint), repeatEnd: project(repeatTargetPoint)};
  }, {cityPoint: setup.city.point, targetPoint: setup.targetPoint, repeatTargetPoint: setup.repeatTargetPoint});

  const beforeCancel = await readCityState(page, setup.city.id);
  await markPhase("cancel-drag");
  await page.mouse.move(interactionPoints.start.x, interactionPoints.start.y);
  await page.mouse.down();
  const cancelDragStarted = performance.now();
  await movePointerInAnimationFrames(page, interactionPoints.start, interactionPoints.end, 120);
  const cancelDragMs = performance.now() - cancelDragStarted;
  await page.waitForTimeout(120);
  const duringDrag = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    return {
      preview: app.cityEdit.movePreview,
      activeDrag: app.cityEdit.activeDrag,
      mode: app.canvasToolModes.getSnapshot().active?.id || null,
      ghost: app.renderer.getStats().cityMoveGhost,
      ghostOverlay: {
        present: Boolean(app.renderer.cityMovePreviewFallbackElement?.isConnected),
        secondaryCanvasPresent: Boolean(app.renderer.cityMovePreviewCanvas?.isConnected),
        independentWebgl: Boolean(app.renderer.cityMovePreviewGl),
        rect: (() => {
          const rect = app.renderer.cityMovePreviewFallbackElement?.getBoundingClientRect();
          return rect ? {width: rect.width, height: rect.height} : null;
        })(),
        transform: app.renderer.cityMovePreviewFallbackElement?.style.transform || ""
      }
    };
  });
  assert.equal(duringDrag.mode, "city:move");
  assert.equal(duringDrag.preview?.valid, true, `${cellsTarget} 城市移动落点预览必须有效`);
  assert.equal(duringDrag.preview?.target?.gridCell, setup.target.gridCell);
  assert.equal(duringDrag.ghost?.active, true, `${cellsTarget} 拖动期间必须显示单城 ghost`);
  assert.equal(duringDrag.ghost?.cityId, setup.city.id);
  assert.equal(duringDrag.ghostOverlay.present, true, "ghost DOM overlay 未挂载");
  assert.equal(duringDrag.ghostOverlay.secondaryCanvasPresent, false, "城镇拖动不得再创建第二个 canvas");
  assert.equal(duringDrag.ghostOverlay.independentWebgl, false, "城镇拖动不得再创建第二个 WebGL2 context");
  assert.equal(duringDrag.ghost?.renderer, "dom-overlay", "ghost 未使用固定尺寸 DOM overlay");
  assert.equal(duringDrag.ghost?.fallbackVisible, true, "ghost DOM overlay 未显示");
  assert.deepEqual(duringDrag.ghostOverlay.rect, {width: 18, height: 18}, "ghost DOM overlay 必须保持固定 18 CSS px");
  assert.match(duringDrag.ghostOverlay.transform, /translate3d\(/, "ghost DOM overlay 未使用合成层位移");
  await page.keyboard.press("Escape");
  await markPhase("cancel-cleanup");
  await page.mouse.up();
  await page.waitForTimeout(120);
  const afterCancel = await readCityState(page, setup.city.id);
  assert.deepEqual(afterCancel.city, beforeCancel.city, `${cellsTarget} Escape 取消不得改变城市位置`);
  assert.deepEqual(afterCancel.history, beforeCancel.history, `${cellsTarget} Escape 取消不得写入历史`);
  assert.equal(afterCancel.checksum, beforeCancel.checksum, `${cellsTarget} Escape 取消不得改变 checksum`);
  assert.equal(afterCancel.revision, beforeCancel.revision, `${cellsTarget} Escape 取消不得改变地图 revision`);
  assert.equal(afterCancel.mode, null);
  assert.equal(afterCancel.ghostActive, false, `${cellsTarget} 取消后 ghost 未清理`);
  assert.equal(afterCancel.movePending, false, `${cellsTarget} 取消后 pending 未清理`);

  const commitMoveButton = page.locator(`${panel} [data-action-id="CityPanel:move"]`);
  await commitMoveButton.waitFor({state: "visible"});
  await commitMoveButton.click();
  await markPhase("commit-drag");
  await page.mouse.move(interactionPoints.start.x, interactionPoints.start.y);
  await page.mouse.down();
  const commitDragStarted = performance.now();
  await movePointerInAnimationFrames(page, interactionPoints.start, interactionPoints.end, 120);
  const commitDragMs = performance.now() - commitDragStarted;
  await markPhase("commit-preflight");
  await dispatchPointerUp(page, interactionPoints.end);
  await page.mouse.up();
  await page.waitForFunction(({id, gridCell}) => window.__webglGeneratorApp?.map?.settlements?.cities?.[id]?.cell === gridCell, {id: setup.city.id, gridCell: setup.target.gridCell});
  await page.waitForTimeout(180);
  const afterCommit = await readCityState(page, setup.city.id);
  const commitStages = afterCommit.commitPerformance;
  assert.equal(afterCommit.moveError, null, `${cellsTarget} 城市移动提交出现内部错误`);
  assert.equal(afterCommit.city.cell, setup.target.gridCell, `${cellsTarget} 提交未写入目标 grid cell`);
  assert.equal(afterCommit.city.packCell, setup.target.packCell, `${cellsTarget} 提交未写入目标 pack cell`);
  const cityPanelDetailsAfterCommit = await page.locator(`${panel} .city-panel-details`).innerText();
  assert.match(cityPanelDetailsAfterCommit, new RegExp(`grid cell\\s*${setup.target.gridCell}`), `${cellsTarget} 提交后城市管理未刷新 grid cell`);
  assert.match(cityPanelDetailsAfterCommit, new RegExp(`pack cell\\s*${setup.target.packCell}`), `${cellsTarget} 提交后城市管理未刷新 pack cell`);
  assert.equal(afterCommit.history.undo, beforeCancel.history.undo + 1, `${cellsTarget} 提交必须只增加一条历史`);
  assert.equal(afterCommit.selection?.id, setup.city.id, `${cellsTarget} 提交后城市 selection 未保持`);
  assert.equal(afterCommit.mode, "city:move", `${cellsTarget} 首次提交后必须保持城市移动模式`);
  assert.equal(afterCommit.ghostActive, true, `${cellsTarget} 首次提交后必须在新位置恢复起拖环`);
  assert.equal(afterCommit.movePending, false, `${cellsTarget} 提交后 pending 未清理`);
  assert(Math.abs(afterCommit.city.x - setup.targetPoint[0]) < 0.05 && Math.abs(afterCommit.city.y - setup.targetPoint[1]) < 0.05, `${cellsTarget} 非港城未保留精确释放坐标`);
  const readyAfterCommit = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const stats = app.renderer.getStats().cityMoveGhost;
    const rect = app.renderer.cityMovePreviewFallbackElement.getBoundingClientRect();
    return {stats, rect: {width: rect.width, height: rect.height}};
  });
  assert.equal(readyAfterCommit.stats.phase, "ready", `${cellsTarget} 首次提交后起拖环阶段错误`);
  assert.equal(readyAfterCommit.stats.cityId, setup.city.id, `${cellsTarget} 首次提交后起拖环未跟随同一城市`);
  assert.deepEqual(readyAfterCommit.rect, {width: 36, height: 36}, `${cellsTarget} 首次提交后起拖环尺寸改变`);
  const pickedAfterCommit = await page.evaluate(({x, y}) => window.__webglGeneratorApp.renderer.pickClientPoint(x, y), interactionPoints.end);
  assert.equal(Number(pickedAfterCommit?.cityObject?.id), setup.city.id, `${cellsTarget} 提交后城市 picking 未命中`);

  const repeatTarget = {...setup.repeatTarget, screen: interactionPoints.repeatEnd};
  await markPhase("repeat-drag");
  await dispatchPointerDown(page, interactionPoints.end);
  await movePointerInAnimationFrames(page, interactionPoints.end, repeatTarget.screen, 60);
  await markPhase("repeat-preflight");
  await dispatchPointerUp(page, repeatTarget.screen);
  await page.waitForFunction(({id, gridCell}) => {
    const app = window.__webglGeneratorApp;
    return app.map.settlements.cities[id].cell === gridCell && app.cityEdit.movePending === false;
  }, {id: setup.city.id, gridCell: repeatTarget.gridCell}, {timeout: 15000});
  await page.waitForTimeout(120);
  const afterRepeatCommit = await readCityState(page, setup.city.id);
  assert.equal(afterRepeatCommit.city.cell, repeatTarget.gridCell, `${cellsTarget} 连续第二次移动未写入目标 grid cell`);
  assert.equal(afterRepeatCommit.city.packCell, repeatTarget.packCell, `${cellsTarget} 连续第二次移动未写入目标 pack cell`);
  assert.equal(afterRepeatCommit.history.undo, beforeCancel.history.undo + 2, `${cellsTarget} 连续两次移动必须写入两条独立历史`);
  assert.equal(afterRepeatCommit.mode, "city:move", `${cellsTarget} 第二次提交后仍须保持城市移动模式`);
  assert.equal(afterRepeatCommit.ghostActive, true, `${cellsTarget} 第二次提交后起拖环未恢复`);
  const cityPanelDetailsAfterRepeat = await page.locator(`${panel} .city-panel-details`).innerText();
  assert.match(cityPanelDetailsAfterRepeat, new RegExp(`grid cell\\s*${repeatTarget.gridCell}`), `${cellsTarget} 连续第二次提交后面板 grid cell 未刷新`);
  assert.match(cityPanelDetailsAfterRepeat, new RegExp(`pack cell\\s*${repeatTarget.packCell}`), `${cellsTarget} 连续第二次提交后面板 pack cell 未刷新`);

  const manualExitLabel = [
    await commitMoveButton.getAttribute("aria-label"),
    await commitMoveButton.getAttribute("title"),
    await commitMoveButton.innerText()
  ].filter(Boolean).join(" ");
  assert.match(manualExitLabel, /退出移动城市/, `${cellsTarget} 活动模式按钮应明确提供手动退出`);
  await markPhase("manual-exit");
  await commitMoveButton.click();
  await page.waitForFunction(() => window.__webglGeneratorApp.canvasToolModes.getSnapshot().active === null);
  assert.equal((await readCityState(page, setup.city.id)).ghostActive, false, `${cellsTarget} 手动退出后起拖环未清理`);

  await commitMoveButton.click();
  await page.waitForFunction(id => window.__webglGeneratorApp.canvasToolModes.getSnapshot().active?.id === "city:move" && window.__webglGeneratorApp.cityEdit.moveCityId === id, setup.city.id);
  const outsidePoint = await findCityMoveExitPoint(page, setup.city.id);
  await markPhase("outside-exit");
  await page.mouse.click(outsidePoint.x, outsidePoint.y);
  await page.waitForFunction(() => window.__webglGeneratorApp.canvasToolModes.getSnapshot().active === null);
  const afterOutsideExit = await readCityState(page, setup.city.id);
  assert.equal(afterOutsideExit.ghostActive, false, `${cellsTarget} 点击别处退出后起拖环未清理`);
  assert.equal(afterOutsideExit.movePending, false, `${cellsTarget} 点击别处退出后 pending 未清理`);

  await markPhase("undo-redo");
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(220);
  const afterUndo = await readCityState(page, setup.city.id);
  assert.equal(afterUndo.city.cell, setup.target.gridCell, `${cellsTarget} Ctrl+Z 未撤销连续第二次移动`);
  assert.equal(afterUndo.city.packCell, setup.target.packCell, `${cellsTarget} Ctrl+Z 未恢复第一次移动目标`);
  await page.keyboard.press("Control+y");
  await page.waitForTimeout(220);
  const afterRedo = await readCityState(page, setup.city.id);
  assert.equal(afterRedo.city.cell, repeatTarget.gridCell, `${cellsTarget} Ctrl+Y 未重做连续第二次移动`);
  assert.equal(afterRedo.city.packCell, repeatTarget.packCell, `${cellsTarget} Ctrl+Y 未重做第二次目标`);
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(220);
  assert.equal((await readCityState(page, setup.city.id)).city.cell, setup.target.gridCell, `${cellsTarget} 后续夹具前未恢复第一次移动结果`);

  await markPhase("same-cell");
  const sameCell = await verifySameCellRelocation(page, sameCellFixture, markPhase);
  await markPhase("cross-border");
  const crossBorder = await verifyCrossBorderCapitalRelocation(page, crossBorderFixture, markPhase);
  await markPhase("ghost-fallback");
  const ghostFallback = await verifyGhostContextLossFallback(page, setup);
  await page.waitForFunction(() => window.__webglGeneratorApp?.renderer?.getStats?.().routeRefreshPending === false);
  await page.waitForTimeout(250);
  const longTasks = await page.evaluate(() => [...(window.__cityMoveLongTasks || [])]);
  const activeHealthErrors = await page.evaluate(() => (window.__webglGeneratorHealth?.getEvents?.(200) || [])
    .filter(event => event?.severity === "error" || event?.level === "error"));
  const performanceSamples = await page.evaluate(() => [...(window.__webglGeneratorApp?.cityEdit?.movePerformanceSamples || [])]);
  const populationRefreshSamples = await page.evaluate(() => [...(window.__webglGeneratorApp?.cityEdit?.populationRefreshPerformanceSamples || [])]);
  const selectionPerformanceSamples = await page.evaluate(() => [...(window.__webglGeneratorApp?.cityEdit?.selectionPerformanceSamples || [])]);
  const rendererPerformanceEvents = await page.evaluate(() => window.__webglGeneratorApp?.renderer?.getPerformanceEvents?.({includeRecent: true}) || {});
  const classifiedLongTasks = longTasks.map(task => ({
    ...task,
    phase: [...phaseMarks].reverse().find(mark => mark.time <= task.startTime)?.label || "setup"
  }));
  const interactionLongTasks = classifiedLongTasks.filter(task => task.startTime >= interactionWindowStart);
  const dragLongTasks = interactionLongTasks.filter(task => task.phase === "cancel-drag" || task.phase === "commit-drag" || task.phase === "repeat-drag");
  const handlerDurations = performanceSamples.filter(sample => sample.phase === "pointermove-handler").map(sample => sample.totalMs);
  const previewDurations = performanceSamples.filter(sample => sample.phase === "preview").map(sample => sample.totalMs);
  const interactionRendererEvents = Object.fromEntries(Object.entries(rendererPerformanceEvents).map(([key, channel]) => [
    key,
    (channel?.recent || []).filter(event => Number(event.timestamp) >= interactionWindowStart)
  ]).filter(([, events]) => events.length));
  assert.equal(interactionLongTasks.length, 0, `${cellsTarget} 交互时间窗不得出现 >=50ms longtask：${JSON.stringify({interactionLongTasks, phaseMarks, handlerP95: percentile(handlerDurations, 0.95), handlerMax: Math.max(0, ...handlerDurations), previewP95: percentile(previewDurations, 0.95), previewMax: Math.max(0, ...previewDurations), commitStages, populationRefreshSamples, selectionPerformanceSamples, interactionRendererEvents})}`);
  assert.deepEqual(activeHealthErrors, [], `${cellsTarget} 延迟 health 采集不得有 error`);
  assert(percentile(handlerDurations, 0.95) <= 8, `${cellsTarget} pointermove handler P95 超过 8ms`);
  assert(Math.max(0, ...handlerDurations) <= 16.7, `${cellsTarget} pointermove handler max 超过 16.7ms`);
  assert(percentile(previewDurations, 0.95) < 33, `${cellsTarget} RAF preview P95 必须小于 33ms`);

  return {
    requestedCells: cellsTarget,
    actualGridCells: setup.actualGridCells,
    actualPackCells: setup.actualPackCells,
    city: setup.city,
    target: setup.target,
    repeatTarget: setup.repeatTarget,
    preview: {
      valid: duringDrag.preview.valid,
      summary: duringDrag.preview.summary,
      warnings: duringDrag.preview.warnings
    },
    drag: {steps: 120, cancelMs: roundMs(cancelDragMs), commitMs: roundMs(commitDragMs), ghost: true},
    cancel: {unchanged: true, historyUnchanged: true, locksCleared: true},
    commit: {historyEntries: 2, precisePoint: true, modePersists: true, locksCleared: true},
    exit: {manual: true, outsideClick: true},
    undoRedo: {undo: true, redo: true},
    sameCell,
    crossBorder,
    ghostFallback,
    activeHealthErrors,
    longTasks: {
      interactionWindowStart: roundMs(interactionWindowStart),
      count: interactionLongTasks.length,
      maxDurationMs: roundMs(Math.max(0, ...interactionLongTasks.map(task => task.duration))),
      dragMaxDurationMs: roundMs(Math.max(0, ...dragLongTasks.map(task => task.duration))),
      entries: interactionLongTasks
    },
    performance: {
      handlerSamples: handlerDurations.length,
      handlerP95Ms: roundMs(percentile(handlerDurations, 0.95)),
      handlerMaxMs: roundMs(Math.max(0, ...handlerDurations)),
      previewSamples: previewDurations.length,
      previewP95Ms: roundMs(percentile(previewDurations, 0.95)),
      previewMaxMs: roundMs(Math.max(0, ...previewDurations)),
      preflightMs: roundMs(Math.max(0, ...performanceSamples.filter(sample => sample.phase === "preflight").map(sample => sample.totalMs))),
      commitMs: roundMs(Math.max(0, ...performanceSamples.filter(sample => sample.phase === "commit").map(sample => sample.totalMs)))
    },
    commitStages
  };
}

async function findSameCellRelocationFixture(page, excludedIds = []) {
  return page.evaluate(excludedIds => {
    const app = window.__webglGeneratorApp;
    const map = app.map;
    const excluded = new Set(excludedIds.map(Number));
    const cities = (map.settlements?.cities || []).filter(city => city && !city.removed);
    const source = cities.find(city => !excluded.has(Number(city.id)) && !city.capital && !city.provincial && !city.port && city.id > 0);
    const target = cities.find(city => !excluded.has(Number(city.id)) && city.id !== source?.id && Number(city.cell) !== Number(source?.cell));
    if (!source || !target) throw new Error("缺少同 cell 多城浏览器样本");
    return {
      sourceId: source.id,
      sourceBurgId: source.burgId,
      targetId: target.id,
      targetBurgId: target.burgId,
      before: {cell: source.cell, packCell: source.packCell, x: source.x, y: source.y},
      targetPoint: {gridCell: target.cell, packCell: target.packCell, x: Number(target.x), y: Number(target.y)}
    };
  }, excludedIds);
}

async function verifySameCellRelocation(page, fixture, markPhase) {
  await performCityRelocationDrag(page, fixture.sourceId, fixture.targetPoint, {markPhase, phasePrefix: "same"});
  await markPhase?.("same-committed");
  await page.waitForFunction(() => window.__webglGeneratorApp?.renderer?.getStats?.().routeRefreshPending === false);
  await markPhase?.("same-route-ready");
  const indexed = await page.evaluate(async ({sourceId, targetPoint}) => {
    const app = window.__webglGeneratorApp;
    const map = app.map;
    const source = map.settlements.cities[sourceId];
    const {burgIdsAtPackCell, cityIdsAtGridCell} = await import("/src/runtime/settlement-cell-index.js");
    return {
      after: {cell: source.cell, packCell: source.packCell, x: source.x, y: source.y},
      cityIds: cityIdsAtGridCell(map, targetPoint.gridCell),
      burgIds: burgIdsAtPackCell(map, targetPoint.packCell),
      gridRepresentative: map.grid.cells.burg[targetPoint.gridCell],
      packRepresentative: map.pack.cells.burg[targetPoint.packCell]
    };
  }, fixture);
  await markPhase?.("same-indexed");
  const picking = await page.evaluate(({targetId, targetPoint}) => {
    const app = window.__webglGeneratorApp;
    const map = app.map;
    const target = map.settlements.cities[targetId];
    const rect = app.renderer.canvas.getBoundingClientRect();
    const camera = app.renderer.camera;
    const ndcX = (target.x / map.metadata.graphWidth * 2 - 1) * camera.scale + camera.offsetX;
    const ndcY = (1 - target.y / map.metadata.graphHeight * 2) * camera.scale + camera.offsetY;
    const clientX = rect.left + ((ndcX + 1) / 2) * rect.width;
    const clientY = rect.top + ((1 - ndcY) / 2) * rect.height;
    const firstPick = app.renderer.pickClientPoint(clientX, clientY, {cycleCities: true})?.cityObject;
    const secondPick = app.renderer.pickClientPoint(clientX, clientY, {cycleCities: true})?.cityObject;
    return {
      pickCycle: [firstPick?.id, secondPick?.id],
      pickCandidates: firstPick?.overlapCandidateIds || [],
      clientPoint: {x: clientX, y: clientY}
    };
  }, fixture);
  await markPhase?.("same-picked");
  const result = {...fixture, executed: indexed.after.cell === fixture.targetPoint.gridCell, ...indexed, ...picking};
  assert.equal(result.executed, true, "同 cell 多城浏览器拖动未执行");
  assert(result.cityIds.includes(result.sourceId) && result.cityIds.includes(result.targetId), "同 cell 多城索引未保留两个城市");
  assert(result.burgIds.includes(result.sourceBurgId) && result.burgIds.includes(result.targetBurgId), "同 cell 多 burg 索引未保留两个 burg");
  assert.equal(Number(result.gridRepresentative), Math.min(result.sourceId, result.targetId), "grid singular 代表不稳定");
  assert.equal(Number(result.packRepresentative), Math.min(result.sourceBurgId, result.targetBurgId), "pack singular 代表不稳定");
  assert.deepEqual(new Set(result.pickCycle), new Set([result.sourceId, result.targetId]), "完全重合城市未按重复点击稳定循环");
  assert.deepEqual(result.pickCandidates, [result.sourceId, result.targetId].sort((a, b) => a - b), "完全重合城市候选顺序不稳定");
  const secondCityId = Math.max(result.sourceId, result.targetId);
  await page.evaluate(() => {
    window.__webglGeneratorApp.renderer.cityPickCycle = {key: "", index: -1};
  });
  await markPhase?.("same-cycle-select");
  const firstDrawBefore = await readCitySelectionDrawState(page);
  await page.mouse.click(result.clientPoint.x, result.clientPoint.y);
  await waitForCitySelectionDraw(page);
  const firstDrawAfter = await readCitySelectionDrawState(page);
  await markPhase?.("same-first-selected");
  assert(firstDrawAfter.drawSequence - firstDrawBefore.drawSequence <= 1, `完全重合城市首次选择不得触发重复全图 draw：${JSON.stringify({firstDrawBefore, firstDrawAfter})}`);
  assert.equal(firstDrawAfter.animationPending, false, "selected-only 城市变化不得启动显隐动画 RAF");
  assert.equal(firstDrawAfter.selectedInstanceIds.length, 1, "首次循环选择必须只高亮一个城市实例");
  const secondDrawBefore = firstDrawAfter;
  await page.mouse.click(result.clientPoint.x, result.clientPoint.y);
  await waitForCitySelectionDraw(page);
  const secondDrawAfter = await readCitySelectionDrawState(page);
  await markPhase?.("same-second-selected");
  assert(secondDrawAfter.drawSequence - secondDrawBefore.drawSequence <= 1, `完全重合城市第二次选择不得触发重复全图 draw：${JSON.stringify({secondDrawBefore, secondDrawAfter})}`);
  assert.equal(secondDrawAfter.animationPending, false, "第二个 selected-only 城市变化不得启动显隐动画 RAF");
  assert.deepEqual(secondDrawAfter.selectedInstanceIds, [secondCityId], "第二次循环选择的城市实例高亮未更新");
  await page.waitForFunction(id => window.__webglGeneratorApp.selectionStore.getSnapshot()?.selection?.object?.id === id, secondCityId);
  const moveButton = page.locator('.floating-panel[data-panel-id="city-panel"]:not(.hidden) [data-action-id="CityPanel:move"]');
  await moveButton.click();
  await markPhase?.("same-second-active");
  await page.waitForFunction(id => window.__webglGeneratorApp.cityEdit.moveCityId === id, secondCityId);
  await dispatchPointerDown(page, result.clientPoint);
  await markPhase?.("same-second-pointerdown");
  const secondDrag = await page.evaluate(() => window.__webglGeneratorApp.cityEdit.activeDrag);
  assert.equal(secondDrag?.cityId, secondCityId, "完全重合城市循环选中第二对象后无法启动拖动");
  await page.keyboard.press("Escape");
  await markPhase?.("same-second-cancel");
  await page.waitForFunction(() => {
    const app = window.__webglGeneratorApp;
    return !app.cityEdit.activeDrag && !app.cityEdit.movePending && !app.renderer.getStats().cityMoveGhost.active && app.canvasToolModes.getSnapshot().active === null;
  });
  await page.keyboard.press("Control+z");
  await page.waitForFunction(({id, cell}) => window.__webglGeneratorApp.map.settlements.cities[id].cell === cell, {id: result.sourceId, cell: result.before.cell});
  return {passed: true, sourceId: result.sourceId, targetId: result.targetId, cityIds: result.cityIds, burgIds: result.burgIds};
}

async function waitForCitySelectionDraw(page) {
  await page.waitForFunction(() => {
    const renderer = window.__webglGeneratorApp?.renderer;
    if (!renderer) return false;
    const events = renderer.getPerformanceEvents?.() || {};
    return !renderer.overlayInteractionSuspended && !events.viewportCommit?.pending && !events.viewportCommit?.running && !renderer.cityIconAnimationFrame;
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function readCitySelectionDrawState(page) {
  return page.evaluate(() => {
    const renderer = window.__webglGeneratorApp.renderer;
    return {
      drawSequence: Number(renderer.getStats().draw?.sequence || 0),
      animationPending: Boolean(renderer.cityIconAnimationFrame),
      selectedInstanceIds: renderer.cityIconLayer.instances.filter(item => item.selected > 0.5).map(item => Number(item.id)).sort((a, b) => a - b)
    };
  });
}

async function findCrossBorderCapitalFixture(page) {
  return page.evaluate(() => {
    const map = window.__webglGeneratorApp.map;
    const cities = (map.settlements?.cities || []).filter(city => city && !city.removed);
    const cityByBurgId = new Map();
    const citiesByStateId = new Map();
    for (const city of cities) {
      cityByBurgId.set(Number(city.burgId), city);
      const stateId = Number(city.state);
      const stateCities = citiesByStateId.get(stateId) || [];
      stateCities.push(city);
      citiesByStateId.set(stateId, stateCities);
    }
    const populatedStateIds = [...citiesByStateId.keys()].filter(stateId => stateId > 0);
    let sample = null;
    for (const state of map.politics?.states || []) {
      if (!state?.i || !Number(state.capital)) continue;
      const stateId = Number(state.i);
      const capital = cityByBurgId.get(Number(state.capital));
      const replacementCandidates = (citiesByStateId.get(stateId) || []).filter(city => city.id !== capital?.id);
      const targetStateId = populatedStateIds.find(candidateStateId => {
        if (candidateStateId === stateId) return false;
        return (citiesByStateId.get(candidateStateId) || []).some(city => Math.hypot(city.x - capital.x, city.y - capital.y) > 40);
      });
      const target = (citiesByStateId.get(targetStateId) || []).find(city => Math.hypot(city.x - capital.x, city.y - capital.y) > 40);
      if (capital && replacementCandidates.length && target) {
        sample = {state, capital, target};
        break;
      }
    }
    if (!sample) throw new Error("缺少首都跨境浏览器样本");
    const sourceStateId = Number(sample.state.i);
    const targetStateId = Number(sample.target.state);
    return {
      cityId: sample.capital.id,
      burgId: sample.capital.burgId,
      sourceStateId,
      targetStateId,
      originalTargetCapital: Number(map.politics.states[targetStateId]?.capital || 0),
      before: {cell: sample.capital.cell, packCell: sample.capital.packCell, state: sample.capital.state},
      target: (() => {
        const gridCell = Number(sample.target.cell);
        const point = map.grid.points[gridCell];
        return {gridCell, packCell: Number(map.grid.cells.pack[gridCell]), x: point[0], y: point[1]};
      })()
    };
  });
}

async function verifyCrossBorderCapitalRelocation(page, fixture, markPhase) {
  await performCityRelocationDrag(page, fixture.cityId, fixture.target, {markPhase, phasePrefix: "cross"});
  await markPhase?.("cross-committed");
  await page.waitForFunction(() => window.__webglGeneratorApp?.renderer?.getStats?.().routeRefreshPending === false);
  await markPhase?.("cross-route-ready");
  const observed = await page.evaluate(({cityId, sourceStateId, targetStateId}) => {
    const map = window.__webglGeneratorApp.map;
    const capital = map.settlements.cities[cityId];
    const cities = (map.settlements?.cities || []).filter(city => city && !city.removed);
    const replacementBurgId = Number(map.politics.states[sourceStateId]?.capital || 0);
    const replacement = cities.find(city => Number(city.burgId) === replacementBurgId);
    return {
      afterState: capital.state,
      afterCapital: capital.capital,
      replacementBurgId,
      replacementCityId: replacement?.id ?? null,
      replacementState: replacement?.state ?? null,
      targetCapital: Number(map.politics.states[targetStateId]?.capital || 0)
    };
  }, fixture);
  await markPhase?.("cross-observed");
  const result = {...fixture, executed: Number(observed.afterState) === fixture.targetStateId, ...observed};
  assert.equal(result.executed, true, "首都跨境浏览器拖动未执行");
  assert.equal(Number(result.afterState), result.targetStateId, "迁出首都未划归目标国家");
  assert.notEqual(result.replacementBurgId, result.burgId, "原国家未重选首都");
  assert.equal(Number(result.replacementState), result.sourceStateId, "原国家新首都不属于原国家");
  if (result.originalTargetCapital > 0) {
    assert.equal(result.targetCapital, result.originalTargetCapital, "目标国家已有首都时不应篡位");
    assert.equal(result.afterCapital, false, "迁入已有首都国家后仍错误保留首都角色");
  }
  await markPhase?.("cross-undo");
  await page.keyboard.press("Control+z");
  await markPhase?.("cross-undo-dispatched");
  await page.waitForFunction(({id, state}) => window.__webglGeneratorApp.map.settlements.cities[id].state === state, {id: result.cityId, state: result.before.state});
  return {passed: true, cityId: result.cityId, sourceStateId: result.sourceStateId, targetStateId: result.targetStateId, replacementCityId: result.replacementCityId};
}

async function performCityRelocationDrag(page, cityId, target, {markPhase = null, phasePrefix = "drag"} = {}) {
  await markPhase?.(`${phasePrefix}-select`);
  const geometry = await page.evaluate(({cityId, target}) => {
    const app = window.__webglGeneratorApp;
    const city = app.map.settlements.cities[cityId];
    if (!city || city.removed) throw new Error(`找不到拖动城市 #${cityId}`);
    app.selectionStore.setSelection({object: {kind: "city", id: cityId}});
    app.panels.city.updateRelocationContext(app.map, {object: {kind: "city", id: cityId}}, app.editHistory.getStats());
    app.panels.city.setSelectedCityId(cityId);
    const rect = app.renderer.canvas.getBoundingClientRect();
    const project = point => app.renderer.worldToScreen(point[0], point[1], rect);
    return {start: project([city.x, city.y]), end: project([target.x, target.y])};
  }, {cityId, target});
  await markPhase?.(`${phasePrefix}-selected`);
  const startPick = await page.evaluate(({x, y}) => window.__webglGeneratorApp.renderer.pickClientPoint(x, y)?.cityObject?.id ?? null, geometry.start);
  assert.equal(Number(startPick), Number(cityId), `拖动起点 picking 未命中城市 #${cityId}，实际 #${startPick}`);
  const targetPick = await page.evaluate(({x, y}) => {
    const pick = window.__webglGeneratorApp.renderer.pickCellClientPoint(x, y);
    return pick ? {gridCell: pick.gridCell, packCell: pick.packCell, worldX: pick.worldX, worldY: pick.worldY} : null;
  }, geometry.end);
  assert.equal(Number(targetPick?.gridCell), Number(target.gridCell), `拖动终点 grid picking 偏移：${JSON.stringify(targetPick)}`);
  assert.equal(Number(targetPick?.packCell), Number(target.packCell), `拖动终点 pack picking 偏移：${JSON.stringify(targetPick)}`);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const moveButton = page.locator('.floating-panel[data-panel-id="city-panel"]:not(.hidden) [data-action-id="CityPanel:move"]');
  await moveButton.waitFor({state: "visible"});
  await moveButton.click();
  await page.waitForFunction(cityId => {
    const app = window.__webglGeneratorApp;
    return app.canvasToolModes.getSnapshot().active?.id === "city:move" && app.cityEdit.moveCityId === cityId;
  }, cityId);
  await markPhase?.(`${phasePrefix}-active`);
  await dispatchPointerDown(page, geometry.start);
  await markPhase?.(`${phasePrefix}-pointerdown`);
  await movePointerInAnimationFrames(page, geometry.start, geometry.end, 12);
  await markPhase?.(`${phasePrefix}-previewed`);
  await dispatchPointerUp(page, geometry.end);
  await markPhase?.(`${phasePrefix}-pointerup`);
  try {
    await page.waitForFunction(({cityId, target}) => {
      const app = window.__webglGeneratorApp;
      const city = app?.map?.settlements?.cities?.[cityId];
      return city?.cell === target.gridCell && city?.packCell === target.packCell && app.cityEdit.movePending === false;
    }, {cityId, target}, {timeout: 15000});
  } catch (error) {
    const diagnostic = await page.evaluate(({cityId, target}) => {
      const app = window.__webglGeneratorApp;
      const city = app?.map?.settlements?.cities?.[cityId];
      return {
        city: city ? {cell: city.cell, packCell: city.packCell, state: city.state, x: city.x, y: city.y} : null,
        target,
        movePending: Boolean(app?.cityEdit?.movePending),
        activeDrag: app?.cityEdit?.activeDrag || null,
        mode: app?.canvasToolModes?.getSnapshot?.().active?.id || null,
        preview: app?.cityEdit?.movePreview ? {
          valid: app.cityEdit.movePreview.valid,
          changed: app.cityEdit.movePreview.changed,
          phase: app.cityEdit.movePreview.phase,
          code: app.cityEdit.movePreview.code,
          summary: app.cityEdit.movePreview.summary
        } : null,
        lastMoveError: app?.cityEdit?.lastMoveError || null,
        routeRefreshPending: Boolean(app?.renderer?.getStats?.().routeRefreshPending)
      };
    }, {cityId, target});
    throw new Error(`城市拖动提交未收敛：${JSON.stringify(diagnostic)}`, {cause: error});
  }
  await markPhase?.(`${phasePrefix}-exit`);
  await moveButton.click();
  await page.waitForFunction(() => window.__webglGeneratorApp.canvasToolModes.getSnapshot().active === null);
}

async function dispatchPointerDown(page, point) {
  await page.evaluate(point => {
    const canvas = window.__webglGeneratorApp.renderer.canvas;
    const capture = canvas.setPointerCapture;
    canvas.setPointerCapture = () => {};
    try {
      canvas.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        pointerId: 77,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX: point.x,
        clientY: point.y
      }));
    } finally {
      canvas.setPointerCapture = capture;
    }
  }, point);
}

async function readCityState(page, cityId) {
  return page.evaluate(id => {
    const app = window.__webglGeneratorApp;
    const city = app.map.settlements.cities[id];
    return {
      city: {cell: city.cell, packCell: city.packCell, x: city.x, y: city.y},
      gridBurg: app.map.grid.cells.burg[city.cell],
      packBurg: app.map.pack.cells.burg[city.packCell],
      history: app.editHistory.getStats(),
      mode: app.canvasToolModes.getSnapshot().active?.id || null,
      movePending: Boolean(app.cityEdit.movePending),
      ghostActive: Boolean(app.renderer.getStats().cityMoveGhost?.active),
      checksum: app.map.metadata?.checksum || app.map.summary?.checksum || "",
      revision: app.mapRevision?.getSnapshot?.().mapRevision ?? null,
      selection: app.selectionStore.getSnapshot()?.selection?.object || null,
      commitPerformance: app.cityEdit.lastCommitPerformance ? structuredClone(app.cityEdit.lastCommitPerformance) : null,
      moveError: app.cityEdit.lastMoveError || null
    };
  }, cityId);
}

async function findCityMoveExitPoint(page, cityId) {
  return page.evaluate(id => {
    const app = window.__webglGeneratorApp;
    const canvas = app.renderer.canvas;
    const rect = canvas.getBoundingClientRect();
    for (let y = 24; y <= rect.height - 24; y += 36) {
      for (let x = 24; x <= rect.width - 24; x += 36) {
        const clientX = rect.left + x;
        const clientY = rect.top + y;
        if (document.elementFromPoint(clientX, clientY) !== canvas) continue;
        const pickedCityId = app.renderer.pickClientPoint(clientX, clientY)?.cityObject?.id;
        if (Number(pickedCityId) !== Number(id)) return {x: clientX, y: clientY};
      }
    }
    throw new Error(`找不到城市 #${id} 以外的画布退出点`);
  }, cityId);
}

function roundMs(value) {
  return Math.round(Number(value) * 100) / 100;
}

async function movePointerInAnimationFrames(page, start, end, steps) {
  await page.evaluate(({start, end, steps}) => new Promise((resolve, reject) => {
    const app = window.__webglGeneratorApp;
    const canvas = app.renderer.canvas;
    const pointerId = app.cityEdit.activeDrag?.pointerId;
    if (!Number.isInteger(pointerId)) {
      reject(new Error("性能拖动缺少活动 pointerId"));
      return;
    }
    let step = 0;
    const moveNext = () => requestAnimationFrame(() => {
      step++;
      const ratio = step / steps;
      try {
        canvas.dispatchEvent(new PointerEvent("pointermove", {
          bubbles: true,
          cancelable: true,
          pointerId,
          pointerType: "mouse",
          isPrimary: true,
          button: -1,
          buttons: 1,
          clientX: start.x + (end.x - start.x) * ratio,
          clientY: start.y + (end.y - start.y) * ratio
        }));
      } catch (error) {
        reject(error);
        return;
      }
      if (step >= steps) resolve();
      else moveNext();
    });
    moveNext();
  }), {start, end, steps});
}

async function dispatchPointerUp(page, point) {
  await page.evaluate(point => {
    const app = window.__webglGeneratorApp;
    const canvas = app.renderer.canvas;
    const pointerId = app.cityEdit.activeDrag?.pointerId;
    if (!Number.isInteger(pointerId)) throw new Error("提交拖动缺少活动 pointerId");
    canvas.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      cancelable: true,
      pointerId,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      buttons: 0,
      clientX: point.x,
      clientY: point.y
    }));
  }, point);
}

async function verifyGhostContextLossFallback(page, setup) {
  const result = await page.evaluate(({city, target, targetPoint}) => {
    const renderer = window.__webglGeneratorApp.renderer;
    renderer.setCityMovePreview({
      valid: true,
      phase: "fallback-test",
      city,
      target: {...target, point: targetPoint}
    });
    const activated = renderer.activateCityMovePreviewFallback();
    const stats = renderer.getStats().cityMoveGhost;
    const rect = renderer.cityMovePreviewFallbackElement.getBoundingClientRect();
    renderer.clearCityMovePreview();
    return {activated, hasCanvas: Boolean(renderer.cityMovePreviewCanvas), hasContext: Boolean(renderer.cityMovePreviewGl), stats, rect: {width: rect.width, height: rect.height}};
  }, setup);
  assert.equal(result.activated, true, "重复启用 DOM ghost 必须保持幂等可见");
  assert.equal(result.hasCanvas, false, "DOM ghost 不得保留第二个 canvas");
  assert.equal(result.hasContext, false, "DOM ghost 不得保留第二个 WebGL2 context");
  assert.equal(result.stats.renderer, "dom-overlay", "ghost 未保持 DOM overlay");
  assert.equal(result.stats.fallbackVisible, true, "ghost DOM overlay 不可见");
  assert.deepEqual(result.rect, {width: 18, height: 18}, "ghost DOM overlay 固定尺寸错误");
  return {passed: true, renderer: result.stats.renderer, secondaryWebgl: false};
}

async function verifyNullSecondaryContextFallback(context) {
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    window.__cityMoveSecondaryContextCalls = 0;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      if (type === "webgl2" && this?.dataset?.layer === "city-move-preview") {
        window.__cityMoveSecondaryContextCalls++;
        return null;
      }
      return original.call(this, type, ...args);
    };
  });
  try {
    await page.goto(`${baseUrl}/?debug=1&healthClear=1`, {waitUntil: "domcontentloaded"});
    await waitForApiReady(page, timeoutMs);
    await waitForMapReady(page);
    const result = await page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      const city = (app.map.settlements.cities || []).find(item => item && !item.removed);
      if (!city) throw new Error("第二 context 返回 null 的回归样本没有城市");
      app.renderer.setCityMovePreview({
        valid: true,
        phase: "null-context-test",
        city,
        target: {gridCell: city.cell, packCell: city.packCell, point: [city.x, city.y]}
      });
      const stats = app.renderer.getStats().cityMoveGhost;
      const rect = app.renderer.cityMovePreviewFallbackElement.getBoundingClientRect();
      const secondaryGl = app.renderer.cityMovePreviewGl;
      const secondaryCanvas = app.renderer.cityMovePreviewCanvas;
      const secondaryContextCalls = window.__cityMoveSecondaryContextCalls;
      app.renderer.clearCityMovePreview();
      return {secondaryGl: Boolean(secondaryGl), secondaryCanvas: Boolean(secondaryCanvas), secondaryContextCalls, stats, rect: {width: rect.width, height: rect.height}};
    });
    assert.equal(result.secondaryCanvas, false, "城镇移动 ghost 不得创建第二个 canvas");
    assert.equal(result.secondaryGl, false, "城镇移动 ghost 不得创建第二个 WebGL2 context");
    assert.equal(result.secondaryContextCalls, 0, "城镇移动初始化不得请求第二个 WebGL2 context");
    assert.equal(result.stats.renderer, "dom-overlay", "城镇移动 ghost 必须使用 DOM overlay");
    assert.equal(result.stats.fallbackVisible, true, "DOM ghost 必须可见");
    assert.deepEqual(result.rect, {width: 18, height: 18}, "DOM ghost 固定尺寸错误");
    return {passed: true, renderer: result.stats.renderer};
  } finally {
    await page.close();
  }
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
