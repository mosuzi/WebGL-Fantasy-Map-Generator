import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {preview} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const root = resolve(import.meta.dirname, "..");
const require = createRequire(resolve(root, "source/Fantasy-Map-Generator/package.json"));
const {chromium} = require("playwright");
const server = await preview({configFile: resolve(root, "vite.config.mjs"),
  preview: {host: "127.0.0.1", port: 5698, strictPort: true}, logLevel: "error"});
let browser;
try {
  browser = await chromium.launch({channel: "chrome"});
  await run();
} finally {
  await browser?.close();
  await server.close();
}

async function run() {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:5698", {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 90000);
  const file = process.argv[2];
  if (file) {
    const previous = await page.evaluate(() => window.__webglGeneratorApp.mapRevision.getSnapshot().mapIdentity);
    await page.locator("#import-map-file").setInputFiles(file);
    await page.waitForFunction(id => window.__webglGeneratorApp.mapRevision.getSnapshot().mapIdentity !== id, previous, {timeout: 40000});
    await waitForApiReady(page, 90000);
  } else {
    const generated = await page.evaluate(() => window.webglGeneratorApi.generate.newMap({
      confirm: true, seed: "culture-related-names", cellsTarget: 3000
    }));
    assert.ok(generated.ok, JSON.stringify(generated));
  }
  const generation = page.locator('[data-panel-id="generation-panel"]');
  if (!await generation.isVisible()) await page.locator("#open-generation-panel").click();
  await generation.locator('[data-control-tab="management"]').click();
  await generation.locator("#open-culture-panel").click();
  const culturePanel = page.locator('[data-panel-id="culture-panel"]');
  const action = culturePanel.getByRole("button", {name: "按文化重新生成命名", exact: true});
  const dialog = page.getByRole("dialog", {name: "按文化重新生成命名"});
  await action.click();
  await dialog.getByText("所有文化", {exact: true}).waitFor();
  await page.keyboard.press("Escape");
  await dialog.waitFor({state: "hidden"});
  const culture = await page.evaluate(() => {
    const {map} = window.__webglGeneratorApp;
    const cities = new Set(map.settlements.cities.filter(city => city && !city.removed).map(city => Number(city.culture)));
    const ids = [...document.querySelectorAll('[data-panel-id="culture-panel"] tr[data-row-key]')]
      .map(row => Number(row.dataset.rowKey.split(":")[1]));
    const id = ids.find(id => id > 0 && cities.has(id));
    return {id, name: map.society.cultures[id]?.name, gridCells: map.grid.cells.h.length};
  });
  assert.ok(culture.id > 0);
  await culturePanel.locator(`tr[data-row-key="n:${culture.id}"] td`).first().click();
  await action.click();
  await dialog.getByText(culture.name, {exact: true}).waitFor();

  await page.evaluate(instrument);
  const session = await page.evaluate(() => window.__webglGeneratorApp.mapWorkerCoordinator.getSessionSnapshot()?.id);
  const lockedNames = await page.evaluate(() => (window.__webglGeneratorApp.map.regenerationLocks?.entries || [])
    .map(({kind, id}) => `${kind}:${id}`));
  const before = await page.evaluate(snapshot);
  const one = await applyAndMeasure(page, dialog);
  const afterOne = await page.evaluate(snapshot);
  assert.equal(afterOne.history, before.history + 1);
  const cityChanges = namesChanged(before, afterOne);
  assert.ok(cityChanges.length > 0);
  assert.ok(cityChanges.every(key => key.startsWith("city:") && before.names[key].culture === culture.id));
  await checkCityMirrors(page, cityChanges);
  await verifyHistory(page, before, afterOne);

  await dialog.getByRole("button", {name: "清除选择"}).click();
  try {
    await dialog.getByText("所有文化", {exact: true}).waitFor({timeout: 3500});
  } catch (error) {
    const observed = await page.evaluate(() => ({
      selection: window.__webglGeneratorApp.selection?.object,
      activeRow: document.querySelector('[data-panel-id="culture-panel"] tr[aria-current="true"]')?.dataset.rowKey,
      dialog: document.querySelector('[aria-label="按文化重新生成命名"][role="dialog"]')?.innerText
    }));
    throw new Error(`清除文化选择后范围未切换：${JSON.stringify(observed)}`, {cause: error});
  }
  await dialog.getByRole("combobox", {name: "命名类型"}).press("Enter");
  await page.getByRole("option", {name: "全部名称类型", exact: true}).click();
  const all = await applyAndMeasure(page, dialog);
  const afterAll = await page.evaluate(snapshot);
  assert.equal(afterAll.history, afterOne.history + 1);
  const allChanges = namesChanged(afterOne, afterAll);
  assert.ok(allChanges.some(key => key.startsWith("city:") && afterAll.names[key].culture !== culture.id));
  assert.ok(allChanges.some(key => key.startsWith("culture:")));
  assert.ok(allChanges.some(key => key.startsWith("state:")));
  assert.ok(allChanges.every(key => afterAll.names[key].culture > 0), "无文化对象被重命名");
  for (const key of lockedNames) assert.deepEqual(afterAll.names[key], before.names[key], `锁定名称变化：${key}`);
  await checkCityMirrors(page, allChanges.filter(key => key.startsWith("city:")));
  await verifyHistory(page, afterOne, afterAll);
  if (session) {
    const finalSession = await page.evaluate(async () => {
      const app = window.__webglGeneratorApp;
      await app.mapReplicaPatchQueue;
      return app.mapWorkerCoordinator.getSessionSnapshot()?.id;
    });
    assert.equal(finalSession, session, "名称修改使后台地图副本失效");
  }
  await page.setViewportSize({width: 690, height: 920});
  const applyButton = dialog.getByRole("button", {name: "重新生成名称", exact: true});
  await applyButton.waitFor();
  assert.ok(await applyButton.evaluate(button => {
    const bounds = button.getBoundingClientRect();
    return bounds.left >= 0 && bounds.right <= innerWidth &&
      button.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
  }), "窄屏命名操作被遮挡");
  await page.screenshot({path: resolve(tmpdir(), "culture-related-names-narrow.png")});
  assert.deepEqual(errors, []);
  assert.equal(await page.evaluate(() => window.__webglGeneratorApp.renderer.gl.getError()), 0);
  console.log(JSON.stringify({culture, one, all, cityChanges: cityChanges.length, allChanges: allChanges.length,
    byType: Object.fromEntries([...new Set(allChanges.map(key => key.split(":")[0]))]
      .map(kind => [kind, allChanges.filter(key => key.startsWith(`${kind}:`)).length]))
  }));
  await page.close();
}

async function applyAndMeasure(page, dialog) {
  const button = dialog.getByRole("button", {name: "重新生成名称", exact: true});
  const status = dialog.getByRole("status").filter({hasText: "已重新生成"});
  await button.click();
  await status.waitFor();
  await page.waitForFunction(() => {
    const app = window.__webglGeneratorApp;
    return app.renderer.lastLabelRefreshProfile && window.__cultureNameProbe.labels > 0;
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const timings = await page.evaluate(() => {
    const {start, tasks, taskStarts, rebuilds, labels, stages, stageStarts} = window.__cultureNameProbe;
    return {ms: Math.round(performance.now() - start), tasks, taskStarts, rebuilds, labels, stages, stageStarts};
  });
  console.log(JSON.stringify({message: await status.textContent(), ...timings}));
  assert.equal(timings.rebuilds, 0);
  assert.ok(Math.max(0, ...timings.tasks) <= 200, JSON.stringify(timings));
  return timings;
}

async function verifyHistory(page, before, after) {
  const undo = await page.evaluate(() => window.webglGeneratorApi.history.undo());
  assert.ok(undo.ok, JSON.stringify(undo));
  assert.deepEqual(await page.evaluate(snapshot), before);
  const redo = await page.evaluate(() => window.webglGeneratorApi.history.redo());
  assert.ok(redo.ok, JSON.stringify(redo));
  assert.deepEqual(await page.evaluate(snapshot), after);
}

function namesChanged(before, after) {
  return Object.keys(before.names).filter(key => before.names[key].name !== after.names[key].name);
}

async function checkCityMirrors(page, keys) {
  assert.ok(await page.evaluate(cityKeys => {
    const {map} = window.__webglGeneratorApp;
    return cityKeys.every(key => {
      const city = map.settlements.cities[Number(key.split(":")[1])];
      return city.name === map.pack.burgs[city.burgId]?.name;
    });
  }, keys));
}

function snapshot() {
  const app = window.__webglGeneratorApp;
  const {map} = app;
  const names = {};
  for (const [kind, items] of Object.entries({
    culture: map.society.cultures, state: map.politics.states, province: map.politics.provinces,
    city: map.settlements.cities, religion: map.society.religions,
    river: map.rivers.rivers, lake: map.pack.features.filter(item => item?.type === "lake")
  })) {
    const affiliation = map.pack.cells.culture;
    for (const item of items) {
      if (!item || item.removed) continue;
      const id = item.id ?? item.i;
      const culture = kind === "culture" ? id
        : kind === "river" ? affiliation[item.source ?? item.cells?.[0]]
        : kind === "lake" ? affiliation[item.firstCell]
        : item.culture ?? (kind === "province" ? affiliation[item.center] : 0);
      names[`${kind}:${id}`] = {name: item.name, culture: Number(culture) || 0};
    }
  }
  return {history: app.editHistory.getStats().undo, names};
}

function instrument() {
  const app = window.__webglGeneratorApp;
  const r = app.renderer;
  const probe = window.__cultureNameProbe = {tasks: [], taskStarts: [], start: Infinity, rebuilds: 0, labels: 0, stages: {}, stageStarts: {}};
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) if (entry.startTime >= probe.start) {
      probe.tasks.push(entry.duration);
      probe.taskStarts.push(Math.round(entry.startTime - probe.start));
    }
  }).observe({type: "longtask"});
  document.addEventListener("click", event => {
    if (event.target.closest("button")?.textContent.trim() !== "重新生成名称") return;
    probe.start = performance.now();
    probe.tasks = [];
    probe.taskStarts = [];
    probe.rebuilds = 0;
    probe.labels = 0;
    probe.stages = {};
    probe.stageStarts = {};
  }, true);
  for (const [owner, key, count] of [
    [r, "refreshCellSurface", "rebuilds"], [r, "rebuildCellVisualMesh", "rebuilds"],
    [r, "refreshLabels", "labels"], [r, "buildLabels"], [r, "updateLabels"], [r, "prepareBrushStateLabel"], [app.editHistory, "execute"]
  ]) {
    const method = owner[key];
    owner[key] = function(...args) {
      if (count) probe[count]++;
      const start = performance.now();
      try {
        return method.apply(this, args);
      } finally {
        const duration = Math.round(performance.now() - start);
        if (duration >= (probe.stages[key] || 0)) {
          probe.stages[key] = duration;
          probe.stageStarts[key] = Math.round(start - probe.start);
        }
      }
    };
  }
}
