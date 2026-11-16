#!/usr/bin/env node
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {resolve} from "node:path";
import {preview} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const {chromium} = createRequire(resolve("source/Fantasy-Map-Generator/package.json"))("playwright");
const server = await preview({configFile: "vite.config.mjs", preview: {host: "127.0.0.1", port: 5598, strictPort: true}});
const browser = await chromium.launch({channel: "chrome", headless: true});
const page = await browser.newPage({viewport: {width: 1600, height: 900}});
page.setDefaultTimeout(45000);
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => message.type() === "error" && errors.push(message.text()));

async function openPanel(name) {
  await page.evaluate(name => {
    const app = window.__webglGeneratorApp;
    document.querySelectorAll(".ui-secondary-action-close").forEach(button => button.click());
    document.querySelectorAll(".floating-panel:not(.hidden) .floating-panel-close").forEach(button => button.click());
    const panel = app.panels[name];
    if (["state", "biome"].includes(name)) panel.open(app.map, app.editHistory.getStats());
    else panel.open(app.map, app.selection, app.editHistory.getStats());
  }, name);
  const panel = page.locator(`.floating-panel[data-panel-id="${name}-panel"]:not(.hidden)`);
  await panel.waitFor({state: "visible"});
  if (name !== "biome") await panel.locator(".ui-slider-field").first().waitFor({state: "visible"});
  return panel;
}

async function setRadius(panel, value, id = "state") {
  const field = panel.locator("label.ui-slider-field").filter({hasText: "画笔大小"}).first();
  const native = field.locator('input[type="range"]');
  assert.deepEqual(await native.evaluate(input => [input.min, input.max, input.step]), ["1", "32", "1"]);
  const input = field.locator(".ui-slider-number input");
  await input.fill(String(value));
  await input.press("Enter");
  await page.waitForFunction(({id, value}) => window.__webglGeneratorApp.brushRadii[id] === value, {id, value});
}

try {
  await page.goto("http://127.0.0.1:5598/?healthClear=1", {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 180000);
  await page.evaluate(async () => {
    const result = await window.webglGeneratorApi.generate.newMap({confirm: true, seed: "brush-radius-save-3k", cellsTarget: 3000, heightmapTemplate: "continents"});
    if (!result.ok) throw Error(result.error?.message || "生成失败");
  });
  const statePanel = await openPanel("state");
  const saved = await page.evaluate(async () => window.webglGeneratorApi.data.saveBrowserMap());
  assert.equal(saved.ok, true, saved.error?.message);
  assert.equal(await page.evaluate(() => window.__webglGeneratorApp.saveState.getStatus().dirty), false);
  await setRadius(statePanel, 1);
  assert.equal(await page.evaluate(() => window.__webglGeneratorApp.panels.state.getBrush().radius), 1);
  assert.equal(await page.evaluate(() => window.__webglGeneratorApp.saveState.getStatus().dirty), true);
  await setRadius(await openPanel("province"), 2, "province");
  await setRadius(await openPanel("culture"), 7, "culture");
  await setRadius(await openPanel("religion"), 13, "religion");
  const biomePanel = await openPanel("biome");
  await biomePanel.getByRole("button", {name: "归属笔刷"}).click();
  await setRadius(page.getByRole("dialog", {name: "归属笔刷"}), 16, "biome");
  await page.getByRole("button", {name: "关闭二级编辑面板"}).click();
  await biomePanel.getByRole("button", {name: "数值适居度"}).click();
  await setRadius(page.getByRole("dialog", {name: "数值适居度"}), 31, "suitability");
  const sixRadii = {state: 1, province: 2, culture: 7, religion: 13, biome: 16, suitability: 31};
  assert.deepEqual(await page.evaluate(() => window.__webglGeneratorApp.brushRadii), sixRadii);
  const json = await page.evaluate(() => window.webglGeneratorApi.data.exportAll({includeText: true}));
  assert.equal(json.ok, true, json.error?.message);
  assert.deepEqual(JSON.parse(json.data.text).map.display.brushRadii, sixRadii);
  const browserSaved = await page.evaluate(async () => window.webglGeneratorApi.data.saveBrowserMap());
  assert.equal(browserSaved.ok, true, browserSaved.error?.message);
  assert.equal(await page.evaluate(() => window.__webglGeneratorApp.saveState.getStatus().dirty), false);
  await setRadius(await openPanel("state"), 32);
  assert.equal(await page.evaluate(() => window.__webglGeneratorApp.saveState.getStatus().dirty), true);
  const restored = await page.evaluate(async () => window.webglGeneratorApi.data.restoreBrowserMap({confirm: true}));
  assert.equal(restored.ok, true, restored.error?.message);
  assert.equal(await page.evaluate(() => window.__webglGeneratorApp.panels.state.getBrush().radius), 1);
  assert.equal(await page.evaluate(() => window.__webglGeneratorApp.brushRadii.state), 1);
  assert.deepEqual(await page.evaluate(() => window.__webglGeneratorApp.brushRadii), sixRadii);

  const currentPanel = await openPanel("state");
  await setRadius(currentPanel, 7);
  const archive = await page.evaluate(async () => {
    const app = window.__webglGeneratorApp;
    const result = await app.runtimeActions.data.exportCompressedAll({download: false, includeBlob: true, includeBase64: false});
    if (!result.blob) throw Error("存档缺少 Blob");
    window.__brushRadiusArchive = result.blob;
    return {bytes: result.blob.size};
  });
  assert.ok(archive.bytes > 0);
  await setRadius(currentPanel, 13);
  const archiveRestored = await page.evaluate(async () => window.webglGeneratorApi.data.importMap(window.__brushRadiusArchive, {confirm: true}));
  assert.equal(archiveRestored.ok, true, archiveRestored.error?.message);
  assert.equal(await page.evaluate(() => window.__webglGeneratorApp.panels.state.getBrush().radius), 7);
  assert.deepEqual(await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    return {province: app.panels.province.getBrush().radius, culture: app.panels.culture.getBrush().radius,
      religion: app.panels.religion.getBrush().radius, biome: app.panels.biome.getBrush().radius,
      suitability: app.panels.biome.getSuitabilityBrush().radius};
  }), {province: 2, culture: 7, religion: 13, biome: 16, suitability: 31});

  await page.evaluate(async () => {
    const result = await window.webglGeneratorApi.generate.newMap({confirm: true, seed: "brush-radius-save-100k", cellsTarget: 100000, heightmapTemplate: "continents"});
    if (!result.ok) throw Error(result.error?.message || "大图生成失败");
  });
  const largePanel = await openPanel("state");
  assert.deepEqual(await page.evaluate(() => window.__webglGeneratorApp.brushRadii),
    {state: 28, province: 28, culture: 28, religion: 28, biome: 28, suitability: 28});
  await setRadius(largePanel, 1);
  const target = await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    const map = app.map;
    const ids = map.politics.states.filter(state => state && !state.removed && Number(state.i) > 0).map(state => Number(state.i));
    const canvas = document.getElementById("map-canvas");
    const rect = canvas.getBoundingClientRect();
    for (let cell = 0; cell < map.grid.cells.h.length; cell++) {
      if (map.grid.cells.h[cell] < 20 || !map.grid.cells.state[cell]) continue;
      const targetId = ids.find(id => id !== Number(map.grid.cells.state[cell]));
      if (!targetId) continue;
      const point = map.grid.points[map.grid.cells.p[cell]];
      const screen = app.renderer.worldToScreen(point[0], point[1], rect);
      const x = rect.left + screen.x + 0.9;
      const y = rect.top + screen.y + 0.9;
      if (x < 1050 || x > 1550 || y < 90 || y > 780) continue;
      if (app.renderer.pickClientPoint(x, y)?.gridCell !== cell) continue;
      app.panels.state.setTargetStateId(targetId);
      app.panels.state.setActive(true);
      return {cell, targetId, x, y};
    }
    throw Error("大图找不到可点中的国家 cell");
  });
  await page.mouse.move(target.x, target.y);
  await page.evaluate(() => {
    window.__brushLongTasks = [];
    window.__brushLongTaskObserver = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) window.__brushLongTasks.push({startTime: entry.startTime, duration: entry.duration});
    });
    window.__brushLongTaskObserver.observe({entryTypes: ["longtask"]});
  });
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForFunction(({cell, targetId}) => Number(window.__webglGeneratorApp.map.grid.cells.state[cell]) === targetId, target);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const result = await page.evaluate(() => ({
    radius: window.__webglGeneratorApp.panels.state.getBrush().radius,
    affected: window.__webglGeneratorApp.stateEdit.lastAffected,
    longTaskCount: window.__brushLongTasks.length,
    longestTask: Math.max(0, ...window.__brushLongTasks.map(entry => entry.duration)),
    longTasks: window.__brushLongTasks,
    healthErrors: (window.__webglGeneratorHealth?.getEvents?.(200) || []).filter(event => event.level === "error").length
  }));
  assert.equal(result.radius, 1);
  assert.ok(result.affected >= 1, "细画笔没有修改目标 cell");
  assert.ok(result.longestTask <= 200, `大图涂抹 LongTask ${result.longestTask}ms`);
  assert.equal(result.healthErrors, 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ok: true, archive, target, result, errors}, null, 2));
} finally {
  await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
