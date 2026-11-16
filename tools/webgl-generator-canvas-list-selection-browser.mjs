#!/usr/bin/env node
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
const port = 5543;
const timeoutMs = 180000;
const targets = process.argv.includes("--large-only") ? [100000]
  : process.argv.includes("--small-only") ? [10000] : [10000, 100000];
const vite = await createViteServer({
  configFile: join(rootDir, "vite.config.mjs"),
  server: {host, port, strictPort: true, hmr: false},
  logLevel: "error"
});
let browser;

try {
  await vite.listen();
  browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
  const context = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1});
  await context.addInitScript(() => localStorage.clear());
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  const errors = [];
  page.on("pageerror", error => errors.push(`page: ${error.message}`));
  page.on("console", message => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  await page.goto(`http://${host}:${port}/?healthClear=1`, {waitUntil: "domcontentloaded"});
  await waitForMapReady(page);

  const reports = [];
  for (const target of targets) {
    console.log(JSON.stringify({target, phase: "map-ready"}));
    if (target === 100000) {
      const generated = await page.evaluate(async () => window.webglGeneratorApi.generate.newMap({
        confirm: true,
        seed: "canvas-list-linkage-100k",
        cellsTarget: 100000,
        heightmapTemplate: "continents"
      }));
      assert.equal(generated?.ok, true, generated?.error?.message || "100k 生成失败");
      await page.waitForFunction(() => window.__webglGeneratorApp?.map?.metadata?.cellsTarget === 100000);
      await waitForMapReady(page);
    }
    await page.evaluate(() => window.__webglGeneratorApp.renderer.setColorMode("states"));
    await page.evaluate(() => {
      window.__webglGeneratorApp.healthMonitor?.clear?.();
      window.__webglGeneratorHealth?.clear?.();
      window.__webglGeneratorDebug?.clearHealthEvents?.();
      window.__canvasListLongTasks = [];
      window.__canvasListPhaseMarks = [{phase: "ready", time: performance.now()}];
      window.__canvasListLongTaskObserver?.disconnect?.();
      window.__canvasListLongTaskObserver = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) window.__canvasListLongTasks.push({startTime: entry.startTime, duration: entry.duration});
      });
      window.__canvasListLongTaskObserver.observe({type: "longtask", buffered: false});
    });
    const fixture = await page.evaluate(() => {
      const map = window.__webglGeneratorApp.map;
      const states = map.politics.states.filter(item => item && !item.removed && Number(item.i ?? item.id) > 0);
      const cities = map.settlements.cities.filter(item => item && !item.removed && Number(item.id) > 0);
      const culture = map.society.cultures.find(item => item && !item.removed && Number(item.i ?? item.id) > 0);
      const otherGovernmentState = states.find(item => item.governmentKey !== states[0]?.governmentKey);
      if (!states[0] || !otherGovernmentState || !cities.length || !culture) throw new Error("联动夹具缺少不同政体的国家、城市或文化");
      return {stateA: Number(states[0].i ?? states[0].id), stateB: Number(otherGovernmentState.i ?? otherGovernmentState.id),
        stateAKey: states[0].governmentKey, stateBKey: otherGovernmentState.governmentKey,
        cityId: Number(cities.at(-1).id), cultureId: Number(culture.i ?? culture.id)};
    });
    console.log(JSON.stringify({target, phase: "state-panel"}));
    await markBrowserPhase(page, "state-panel");
    await page.evaluate(stateA => {
      const app = window.__webglGeneratorApp;
      if (app.panels.state.isOpen()) throw new Error("旧地图目标夹具要求国家面板已关闭");
      const oldStates = [];
      oldStates[0] = app.map.politics.states[0];
      oldStates[stateA] = app.map.politics.states[stateA];
      app.panels.state.update({map: {politics: {states: oldStates}}});
    }, fixture.stateA);
    await selectViaApi(page, "state", fixture.stateB);
    await page.evaluate(() => {
      const opener = document.getElementById("open-state-panel");
      if (!opener) throw new Error("缺少国家管理入口");
      opener.click();
    });
    console.log(JSON.stringify({target, phase: "state-opened", dom: await panelSnapshot(page, "state-panel")}));
    const statePanel = panel(page, "state-panel");
    await statePanel.waitFor({state: "visible", timeout: 15000});
    console.log(JSON.stringify({target, phase: "state-visible"}));
    await assertCurrentRow(statePanel, fixture.stateB);
    await selectViaApi(page, "state", fixture.stateA);
    console.log(JSON.stringify({target, phase: "state-selected", id: fixture.stateA, dom: await panelSnapshot(page, "state-panel")}));
    await assertCurrentRow(statePanel, fixture.stateA);
    console.log(JSON.stringify({target, phase: "state-current"}));

    console.log(JSON.stringify({target, phase: "state-row-click"}));
    await statePanel.locator(`.object-table-row[data-row-key="${rowKey(fixture.stateA)}"]`).click({timeout: 15000});
    await assertBatchSelected(statePanel, fixture.stateA, true);
    console.log(JSON.stringify({target, phase: "state-row-ctrl"}));
    await statePanel.locator(`.object-table-row[data-row-key="${rowKey(fixture.stateA)}"]`).click({modifiers: ["Control"], timeout: 15000});
    await assertBatchSelected(statePanel, fixture.stateA, false);
    await assertCurrentRow(statePanel, fixture.stateA);

    console.log(JSON.stringify({target, phase: "state-filter"}));
    const stateFilter = statePanel.locator('input[placeholder="筛选名称 / 编号 / 首都"]');
    await stateFilter.fill("__unmatched_state__");
    await statePanel.locator(".object-table-empty").waitFor({state: "visible", timeout: 15000});
    await selectViaApi(page, "state", fixture.stateB);
    assert.equal(await statePanel.locator(".object-table-row").count(), 0, "筛选外对象不应冒充列表行");
    await stateFilter.fill("");
    await assertCurrentRow(statePanel, fixture.stateB);

    console.log(JSON.stringify({target, phase: "finding-canvas-point"}));
    await markBrowserPhase(page, "finding-canvas-point");
    const canvasPick = await findVisiblePoliticalPoint(page, "state", "state", fixture.stateB);
    await markBrowserPhase(page, "state-canvas-click");
    console.log(JSON.stringify({target, phase: "canvas-point-found", canvasPick}));
    assert.ok(canvasPick, `${target} 地图没有未被面板遮挡的国家拾取点`);
    await page.mouse.click(canvasPick.x, canvasPick.y);
    console.log(JSON.stringify({target, phase: "canvas-clicked", selection: await page.evaluate(() => window.__webglGeneratorApp?.selection?.object || null)}));
    await page.waitForFunction(id => {
      const object = window.__webglGeneratorApp?.selection?.object;
      return object?.kind === "state" && Number(object.id) === id;
    }, canvasPick.id, {timeout: 8000});
    await assertCurrentRow(statePanel, canvasPick.id);
    await page.mouse.click(canvasPick.x, canvasPick.y);
    await assertCurrentRow(statePanel, canvasPick.id);

    await page.evaluate(() => window.__webglGeneratorApp.renderer.setColorMode("diplomacy"));
    await selectViaApi(page, "state", fixture.stateA);
    await assertCurrentRow(statePanel, fixture.stateA);
    await page.evaluate(() => window.__webglGeneratorApp.renderer.setColorMode("states"));

    console.log(JSON.stringify({target, phase: "government-panel"}));
    await markBrowserPhase(page, "government-panel");
    await page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      app.panels.government.open(app.map, app.selection, app.editHistory.getStats());
    });
    const governmentPanel = panel(page, "government-panel");
    await governmentPanel.waitFor({state: "visible", timeout: 15000});
    await assertCurrentRow(governmentPanel, fixture.stateA);
    await selectViaApi(page, "state", fixture.stateB);
    await assertCurrentRow(governmentPanel, fixture.stateB);
    await selectViaApi(page, "state", fixture.stateA);
    const governmentFilter = governmentPanel.locator('input[placeholder="筛选政体 / 类型 / 国家"]');
    await governmentFilter.fill(fixture.stateAKey);
    await selectViaApi(page, "state", fixture.stateB);
    assert.equal(await governmentPanel.locator(`.object-table-row[data-row-key="${rowKey(fixture.stateB)}"]`).count(), 0,
      "筛选外国家不应出现在政体子表");
    await governmentFilter.fill("");
    await assertCurrentRow(governmentPanel, fixture.stateB);
    await page.evaluate(() => window.__webglGeneratorApp.renderer.setColorMode("diplomacy"));
    await selectViaApi(page, "state", fixture.stateA);
    await assertCurrentRow(governmentPanel, fixture.stateA);
    await page.evaluate(() => window.__webglGeneratorApp.renderer.setColorMode("states"));
    const governmentPick = await findVisiblePoliticalPoint(page, "state", "state", fixture.stateA);
    assert.ok(governmentPick, `${target} 政体面板没有可点击国家落点`);
    await page.mouse.click(governmentPick.x, governmentPick.y);
    await page.waitForFunction(id => Number(window.__webglGeneratorApp?.selection?.object?.id) === id, governmentPick.id, {timeout: 8000});
    await assertCurrentRow(governmentPanel, governmentPick.id);
    await selectViaApi(page, "state", fixture.stateB);
    await governmentPanel.locator(`.object-table-row[data-row-key="${rowKey(fixture.stateB)}"]`).click();
    await assertCurrentRow(governmentPanel, fixture.stateB);

    console.log(JSON.stringify({target, phase: "city-panel"}));
    await markBrowserPhase(page, "city-panel");
    await page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      app.panels.city.open(app.map, app.selection, app.editHistory.getStats());
    });
    const cityPanel = panel(page, "city-panel");
    await cityPanel.waitFor({state: "visible", timeout: 15000});
    await selectViaApi(page, "city", fixture.cityId);
    await assertCurrentRow(cityPanel, fixture.cityId);
    const cityPick = await findVisibleCityPoint(page, fixture.cityId);
    assert.ok(cityPick, `${target} 城市面板没有可点击城市落点`);
    await page.mouse.click(cityPick.x, cityPick.y);
    await page.waitForFunction(id => window.__webglGeneratorApp?.selection?.object?.kind === "city"
      && Number(window.__webglGeneratorApp.selection.object.id) === id, cityPick.id, {timeout: 8000});
    await assertCurrentRow(cityPanel, cityPick.id);

    console.log(JSON.stringify({target, phase: "culture-panel"}));
    await markBrowserPhase(page, "culture-panel");
    await page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      app.panels.culture.open(app.map, app.selection, app.editHistory.getStats());
    });
    await markBrowserPhase(page, "culture-opened");
    const culturePanel = panel(page, "culture-panel");
    await culturePanel.waitFor({state: "visible", timeout: 15000});
    await markBrowserPhase(page, "culture-visible");
    await selectViaApi(page, "culture", fixture.cultureId);
    await assertCurrentRow(culturePanel, fixture.cultureId);
    await markBrowserPhase(page, "culture-selected");
    await page.evaluate(() => window.__webglGeneratorApp.renderer.setColorMode("cultures"));
    await markBrowserPhase(page, "culture-view-ready");
    const culturePick = await findVisiblePoliticalPoint(page, "culture", "culture", fixture.cultureId);
    await markBrowserPhase(page, "culture-point-found");
    assert.ok(culturePick, `${target} 文化面板没有可点击文化落点`);
    await page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      const stages = [];
      const wrap = (owner, key, label) => {
        if (typeof owner?.[key] !== "function") return;
        const original = owner[key];
        owner[key] = function (...args) {
          const start = performance.now();
          try {return original.apply(this, args);} finally {stages.push({label, ms: Math.round((performance.now() - start) * 10) / 10});}
        };
      };
      wrap(app.selectionStore, "onChange", "selection.callback");
      wrap(app.renderer, "setSelection", "renderer.setSelection");
      wrap(app.renderer, "draw", "renderer.draw");
      wrap(app.renderer, "updateSelectionBuffer", "renderer.selectionMesh");
      wrap(app.renderer, "pickClientPoint", "renderer.pick");
      wrap(app.panels.culture, "setSelectedCultureId", "culture.target");
      wrap(app.panels.culture, "update", "culture.update");
      window.__cultureSelectionStages = stages;
    });
    await page.mouse.click(culturePick.x, culturePick.y);
    await page.waitForFunction(id => window.__webglGeneratorApp?.selection?.object?.kind === "culture"
      && Number(window.__webglGeneratorApp.selection.object.id) === id, culturePick.id, {timeout: 8000});
    await assertCurrentRow(culturePanel, culturePick.id);
    console.log(JSON.stringify({target, phase: "culture-selection-stages", detail: await page.evaluate(() => ({
      stages: window.__cultureSelectionStages || [],
      selectionBuildMs: window.__webglGeneratorApp.renderer.selectionBuildMs,
      selectionVertexCount: window.__webglGeneratorApp.renderer.selectionVertexCount,
      drawMs: window.__webglGeneratorApp.renderer.lastDraw?.drawMs
    }))}));
    await markBrowserPhase(page, "culture-canvas-selected");

    const diagnostics = await page.evaluate(() => ({
      longTasks: window.__canvasListLongTasks || [],
      phaseMarks: window.__canvasListPhaseMarks || [],
      healthErrors: (window.__webglGeneratorHealth?.getEvents?.(200) || []).filter(event => event?.level === "error" || event?.severity === "error"),
      glError: window.__webglGeneratorApp.renderer.canvas.getContext("webgl2")?.getError?.() ?? -1
    }));
    const attributedLongTasks = diagnostics.longTasks.map(entry => ({...entry,
      phase: diagnostics.phaseMarks.filter(mark => mark.time <= entry.startTime).at(-1)?.phase || "unknown"}));
    console.log(JSON.stringify({target, phase: "long-task-summary", tasks: attributedLongTasks.filter(entry => entry.duration > 100)}));
    assert.equal(diagnostics.glError, 0, `${target} WebGL 错误`);
    assert.deepEqual(diagnostics.healthErrors, [], `${target} 健康错误`);
    assert.ok(Math.max(0, ...diagnostics.longTasks.map(entry => entry.duration)) <= 200, `${target} 列表联动出现超过 200ms LongTask`);
    assert.deepEqual(errors, [], `${target} 页面或控制台错误`);
    reports.push({target, fixture, canvasPick, governmentPick, cityPick, culturePick,
      longestTaskMs: Math.max(0, ...diagnostics.longTasks.map(entry => entry.duration)), errors: errors.length});
  }
  console.log(JSON.stringify({ok: true, reports}, null, 2));
} finally {
  if (browser) await Promise.race([browser.close(), delay(5000)]);
  await vite.close();
}

function panel(page, id) {
  return page.locator(`.floating-panel[data-panel-id="${id}"]:not(.hidden)`);
}

async function markBrowserPhase(page, phase) {
  await page.evaluate(label => window.__canvasListPhaseMarks.push({phase: label, time: performance.now()}), phase);
}

async function waitForMapReady(page) {
  await waitForApiReady(page, timeoutMs);
  await page.waitForFunction(() => window.webglGeneratorApi?.info?.mapSummary?.()?.data?.ready === true);
  await page.waitForFunction(() => document.getElementById("app-loading-screen")?.hidden === true);
}

async function selectViaApi(page, kind, id) {
  const result = await page.evaluate(target => window.webglGeneratorApi.selection.select(target), {kind, id});
  assert.equal(result?.ok, true, result?.error?.message || `无法选择 ${kind} #${id}`);
}

async function assertCurrentRow(host, id) {
  const row = host.locator(`.object-table-row[data-row-key="${rowKey(id)}"]`);
  await row.waitFor({state: "visible", timeout: 15000});
  assert.equal(await row.getAttribute("aria-current"), "true", `对象 #${id} 不是列表当前项`);
  assert.equal(await row.getAttribute("data-ui-state") === "current" || await row.getAttribute("data-ui-state") === "selected", true);
  assert.equal(await row.evaluate(node => getComputedStyle(node).boxShadow !== "none"), true, `对象 #${id} 没有可见当前标记`);
}

async function panelSnapshot(page, id) {
  return page.evaluate(panelId => {
    const node = document.querySelector(`.floating-panel[data-panel-id="${panelId}"]`);
    return node ? {className: node.className, visible: Boolean(node.getBoundingClientRect().width && node.getBoundingClientRect().height),
      rows: node.querySelectorAll(".object-table-row").length,
      current: node.querySelector('.object-table-row[aria-current="true"]')?.dataset?.rowKey || null,
      panelOpen: window.__webglGeneratorApp?.panels?.state?.isOpen?.()} : null;
  }, id);
}

async function assertBatchSelected(host, id, expected) {
  const row = host.locator(`.object-table-row[data-row-key="${rowKey(id)}"]`);
  assert.equal(await row.getAttribute("aria-selected"), expected ? "true" : "false", `对象 #${id} 批量选择状态错误`);
}

async function findVisiblePoliticalPoint(page, kind, ownerField, exceptId) {
  return page.evaluate(({kind: targetKind, ownerField: field, exceptId: skipId}) => {
    const app = window.__webglGeneratorApp;
    const canvas = app.renderer.canvas;
    const rect = canvas.getBoundingClientRect();
    const cells = app.map.grid.cells;
    const stride = Math.max(1, Math.floor(cells.p.length / 500));
    let checked = 0;
    for (let cell = 0; cell < cells.p.length; cell += stride) {
      const id = Number(cells[field][cell]);
      if (id <= 0 || id === skipId || cells.h[cell] < 20) continue;
      const world = app.map.grid.points[cells.p[cell]];
      if (!world) continue;
      const screen = app.renderer.worldToScreen(world[0], world[1], rect);
      const x = rect.left + screen.x;
      const y = rect.top + screen.y;
      if (x < rect.left + 30 || x > rect.right - 30 || y < rect.top + 30 || y > rect.bottom - 30) continue;
      if (document.elementFromPoint(x, y) !== canvas) continue;
      if (++checked > 30) break;
      const picked = app.renderer.pickClientPoint(x, y);
      if (picked?.object?.kind === targetKind && Number(picked.object.id) === id) return {x, y, id};
    }
    return null;
  }, {kind, ownerField, exceptId});
}

async function findVisibleCityPoint(page, exceptId) {
  return page.evaluate(skipId => {
    const app = window.__webglGeneratorApp;
    const canvas = app.renderer.canvas;
    const rect = canvas.getBoundingClientRect();
    const cities = app.map.settlements.cities;
    const stride = Math.max(1, Math.floor(cities.length / 300));
    let checked = 0;
    for (let index = 0; index < cities.length; index += stride) {
      const city = cities[index];
      if (!city || city.removed || Number(city.id) === skipId) continue;
      const screen = app.renderer.worldToScreen(city.x, city.y, rect);
      const x = rect.left + screen.x;
      const y = rect.top + screen.y;
      if (x < rect.left + 30 || x > rect.right - 30 || y < rect.top + 30 || y > rect.bottom - 30) continue;
      if (document.elementFromPoint(x, y) !== canvas) continue;
      if (++checked > 30) break;
      const picked = app.renderer.pickClientPoint(x, y);
      if (picked?.object?.kind === "city" && Number(picked.object.id) === Number(city.id)) return {x, y, id: Number(city.id)};
    }
    return null;
  }, exceptId);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function rowKey(id) {
  return `n:${id}`;
}
