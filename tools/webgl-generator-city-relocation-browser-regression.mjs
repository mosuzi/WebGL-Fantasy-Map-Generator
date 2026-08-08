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

const vite = await createViteServer({
  configFile: join(rootDir, "vite.config.mjs"),
  server: {host, port, strictPort: true},
  logLevel: "error"
});
let browser;

try {
  await vite.listen();
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
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
  for (const cellsTarget of [10000, 100000]) {
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
    await page.evaluate(() => {
      window.__webglGeneratorApp?.healthMonitor?.clear?.();
      window.__webglGeneratorHealth?.clear?.();
      window.__webglGeneratorDebug?.clearHealthEvents?.();
    });
    healthErrors.length = 0;
    reports.push(await verifyCityRelocation(page, cellsTarget));
  }

  assert.deepEqual(consoleErrors, [], "城市移动浏览器回归不得产生 application console error");
  assert.deepEqual(pageErrors, [], "城市移动浏览器回归不得产生 page error");
  console.log(JSON.stringify({ok: true, reports, consoleErrors, healthErrors, pageErrors}, null, 2));
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
  const setup = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const map = app.map;
    const api = window.webglGeneratorApi;
    const cities = (map.settlements.cities || []).filter(city => city && !city.removed);
    const city = cities.find(item => !item.capital && !item.provincial && item.id > 0 && item.x > map.metadata.graphWidth * 0.82 && item.y > 80 && item.y < map.metadata.graphHeight - 80)
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
    for (const candidate of candidates.slice(0, 80)) {
      const result = api.edit.cities.inspectMove(city.id, candidate);
      const preview = result?.data ?? result;
      if (preview?.valid && preview.changed) {
        chosen = {...candidate, preview};
        break;
      }
    }
    if (!chosen) throw new Error(`城市 #${city.id} 没有可移动目标`);

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
      preview: chosen.preview,
      start: project([city.x, city.y]),
      end: project(chosen.point),
      actualGridCells: map.grid.cells.i.length,
      actualPackCells: map.pack.cells.i.length
    };
  });

  await page.evaluate(({id}) => {
    const app = window.__webglGeneratorApp;
    app.panels.city.open(app.map, {object: {kind: "city", id}}, app.editHistory.getStats());
    app.panels.city.setSelectedCityId(id);
  }, setup.city);
  const panel = '.floating-panel[data-panel-id="city-panel"]:not(.hidden)';
  await page.locator(panel).waitFor({state: "visible"});
  const moveButton = page.locator(`${panel} [data-action-id="CityPanel:move"]`);
  await moveButton.waitFor({state: "visible"});
  await moveButton.click();
  await page.waitForTimeout(80);

  const active = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    return {
      mode: app.canvasToolModes.getSnapshot().active?.id || null,
      moveMode: app.cityEdit.moveMode,
      selectedCityId: app.cityEdit.moveCityId
    };
  });
  assert.equal(active.mode, "city:move");
  assert.equal(active.moveMode, true);
  assert.equal(active.selectedCityId, setup.city.id);

  const beforeCancel = await readCityState(page, setup.city.id);
  await page.mouse.move(setup.start.x, setup.start.y);
  await page.mouse.down();
  await page.mouse.move(setup.end.x, setup.end.y, {steps: 12});
  await page.waitForTimeout(120);
  const duringDrag = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    return {
      preview: app.cityEdit.movePreview,
      activeDrag: app.cityEdit.activeDrag,
      mode: app.canvasToolModes.getSnapshot().active?.id || null
    };
  });
  assert.equal(duringDrag.mode, "city:move");
  assert.equal(duringDrag.preview?.valid, true, `${cellsTarget} 城市移动落点预览必须有效`);
  assert.equal(duringDrag.preview?.target?.gridCell, setup.target.gridCell);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.waitForTimeout(120);
  const afterCancel = await readCityState(page, setup.city.id);
  assert.deepEqual(afterCancel.city, beforeCancel.city, `${cellsTarget} Escape 取消不得改变城市位置`);
  assert.deepEqual(afterCancel.history, beforeCancel.history, `${cellsTarget} Escape 取消不得写入历史`);
  assert.equal(afterCancel.checksum, beforeCancel.checksum, `${cellsTarget} Escape 取消不得改变 checksum`);
  assert.equal(afterCancel.revision, beforeCancel.revision, `${cellsTarget} Escape 取消不得改变地图 revision`);
  assert.equal(afterCancel.mode, null);

  await page.evaluate(({id}) => {
    const app = window.__webglGeneratorApp;
    app.panels.city.open(app.map, {object: {kind: "city", id}}, app.editHistory.getStats());
    app.panels.city.setSelectedCityId(id);
  }, setup.city);
  const commitMoveButton = page.locator(`${panel} [data-action-id="CityPanel:move"]`);
  await commitMoveButton.waitFor({state: "visible"});
  await commitMoveButton.click();
  await page.mouse.move(setup.start.x, setup.start.y);
  await page.mouse.down();
  await page.mouse.move(setup.end.x, setup.end.y, {steps: 12});
  await page.mouse.up();
  await page.waitForTimeout(350);
  const afterCommit = await readCityState(page, setup.city.id);
  assert.equal(afterCommit.city.cell, setup.target.gridCell, `${cellsTarget} 提交未写入目标 grid cell`);
  assert.equal(afterCommit.city.packCell, setup.target.packCell, `${cellsTarget} 提交未写入目标 pack cell`);
  assert.equal(afterCommit.history.undo, beforeCancel.history.undo + 1, `${cellsTarget} 提交必须只增加一条历史`);
  assert.equal(afterCommit.selection?.id, setup.city.id, `${cellsTarget} 提交后城市 selection 未保持`);
  const pickedAfterCommit = await page.evaluate(({x, y}) => window.__webglGeneratorApp.renderer.pickClientPoint(x, y), setup.end);
  assert.equal(Number(pickedAfterCommit?.cityObject?.id), setup.city.id, `${cellsTarget} 提交后城市 picking 未命中`);

  await page.keyboard.press("Control+z");
  await page.waitForTimeout(220);
  const afterUndo = await readCityState(page, setup.city.id);
  assert.equal(afterUndo.city.cell, beforeCancel.city.cell, `${cellsTarget} Ctrl+Z 未恢复原 grid cell`);
  assert.equal(afterUndo.city.packCell, beforeCancel.city.packCell, `${cellsTarget} Ctrl+Z 未恢复原 pack cell`);
  await page.keyboard.press("Control+y");
  await page.waitForTimeout(220);
  const afterRedo = await readCityState(page, setup.city.id);
  assert.equal(afterRedo.city.cell, setup.target.gridCell, `${cellsTarget} Ctrl+Y 未重做目标 grid cell`);
  assert.equal(afterRedo.city.packCell, setup.target.packCell, `${cellsTarget} Ctrl+Y 未重做目标 pack cell`);

  return {
    requestedCells: cellsTarget,
    actualGridCells: setup.actualGridCells,
    actualPackCells: setup.actualPackCells,
    city: setup.city,
    target: setup.target,
    preview: {
      valid: duringDrag.preview.valid,
      summary: duringDrag.preview.summary,
      warnings: duringDrag.preview.warnings
    },
    cancel: {unchanged: true, historyUnchanged: true},
    commit: {singleHistoryEntry: true},
    undoRedo: {undo: true, redo: true}
  };
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
      checksum: app.map.metadata?.checksum || app.map.summary?.checksum || "",
      revision: app.mapRevision?.getSnapshot?.().mapRevision ?? null,
      selection: app.selectionStore.getSnapshot()?.selection?.object || null
    };
  }, cityId);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
