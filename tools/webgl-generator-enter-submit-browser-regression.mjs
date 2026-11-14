#!/usr/bin/env node
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {preview} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const root = resolve(import.meta.dirname, "..");
const {chromium} = createRequire(join(root, "source/Fantasy-Map-Generator/package.json"))("playwright");
const server = await preview({configFile: join(root, "vite.config.mjs"), preview: {host: "127.0.0.1", port: 5592, strictPort: true}, logLevel: "error"});
const browser = await chromium.launch({channel: "chrome", headless: true});
const page = await browser.newPage({viewport: {width: 1360, height: 900}});
page.setDefaultTimeout(30000);
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => {if (message.type() === "error") errors.push(message.text());});
const report = {};

try {
  await page.goto("http://127.0.0.1:5592/?healthClear=1&debug=1", {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 120000);
  const generated = await page.evaluate(() => window.webglGeneratorApi.generate.newMap({confirm: true, seed: "enter-submit-regression", cellsTarget: 3000}));
  assert.equal(generated.ok, true, JSON.stringify(generated.error));
  await waitForApiReady(page, 120000);
  errors.length = 0;

  if (!process.argv.includes("--numeric-only")) {
  const stateId = await page.evaluate(() => window.__webglGeneratorApp.map.politics.states.find(state => state?.id > 0 && !state.removed).id);
  await page.evaluate(id => {
    const app = window.__webglGeneratorApp;
    app.panels.state.open(app.map, app.editHistory.getStats());
    app.panels.state.setTargetStateId(id);
  }, stateId);
  const stateName = () => page.evaluate(id => window.__webglGeneratorApp.map.politics.states[id].name, stateId);
  const history = () => page.evaluate(() => window.__webglGeneratorApp.editHistory.getStats().undo);
  const originalStateName = await stateName();
  const stateHistory = await history();
  await page.locator('.floating-panel[data-panel-id="state-panel"]:not(.hidden)').getByRole("button", {name: "重命名", exact: true}).click();
  const stateDialog = page.getByRole("dialog", {name: "重命名"});
  const stateInput = stateDialog.locator(".state-name-editor input");
  await stateInput.waitFor();
  assert.equal(await stateDialog.getByRole("button", {name: "应用名称"}).count(), 0);
  await stateInput.dispatchEvent("compositionstart");
  await stateInput.fill("回车测试国");
  await stateInput.press("Enter");
  assert.equal(await stateName(), originalStateName, "输入法选字时不得提交");
  assert.equal(await history(), stateHistory);
  await stateInput.dispatchEvent("compositionend");
  await stateInput.press("Enter");
  if (process.argv.includes("--state-only")) console.log(JSON.stringify({stateAfterEnter: await stateName(), input: await stateInput.inputValue(), history: await history(), status: await page.locator('.floating-panel[data-panel-id="state-panel"] [role="status"]').allTextContents(), errors}));
  await page.waitForFunction(id => window.__webglGeneratorApp.map.politics.states[id].name === "回车测试国", stateId);
  assert.equal(await history(), stateHistory + 1, "国家回车只提交一次");
  await stateInput.press("Enter");
  assert.equal(await history(), stateHistory + 1, "同值回车不写历史");
  await page.evaluate(() => window.webglGeneratorApi.history.undo());
  assert.equal(await stateName(), originalStateName, "国家重命名可撤销");
  const historyAfterUndo = await history();
  await stateInput.fill("");
  await stateInput.press("Enter");
  assert.equal(await stateName(), originalStateName, "空名称不得覆盖原名");
  assert.equal(await history(), historyAfterUndo, "空名称不写历史");
  await stateInput.fill("未提交的名称");
  await stateDialog.getByRole("button", {name: "关闭二级编辑面板"}).click();
  assert.equal(await stateName(), originalStateName, "关闭编辑面板丢弃草稿");
  report.state = {composition: true, singleHistory: true, noOp: true, empty: true, undo: true, close: true};

  if (!process.argv.includes("--state-only")) {
  const cityId = await page.evaluate(() => window.__webglGeneratorApp.map.settlements.cities.find(city => city && !city.removed).id);
  await page.evaluate(id => {
    const app = window.__webglGeneratorApp;
    app.panels.city.open(app.map, app.selection, app.editHistory.getStats());
    app.panels.city.setSelectedCityId(id);
  }, cityId);
  const cityBefore = await page.evaluate(id => window.__webglGeneratorApp.map.settlements.cities[id].name, cityId);
  const cityHistory = await history();
  await page.locator('.floating-panel[data-panel-id="city-panel"]:not(.hidden)').getByRole("button", {name: "重命名", exact: true}).click();
  const cityInput = page.getByRole("dialog", {name: "重命名"}).locator(".city-name-editor input");
  await cityInput.fill("回车测试城");
  await cityInput.press("Enter");
  await page.waitForFunction(id => window.__webglGeneratorApp.map.settlements.cities[id].name === "回车测试城", cityId);
  assert.equal(await history(), cityHistory + 1);
  await page.evaluate(() => window.webglGeneratorApi.history.undo());
  assert.equal(await page.evaluate(id => window.__webglGeneratorApp.map.settlements.cities[id].name, cityId), cityBefore);
  report.city = {enter: true, undo: true};
  }
  }

  if (!process.argv.includes("--state-only")) {
  await page.evaluate(() => {
    const app = window.__webglGeneratorApp;
    app.panels.climate.open(app.map, app.editHistory.getStats());
  });
  const seedInput = page.locator('.floating-panel[data-panel-id="climate-panel"]:not(.hidden) .climate-downstream-seed input');
  await seedInput.waitFor();
  assert.equal(await page.getByRole("button", {name: "设置 seed"}).count(), 0);
  await seedInput.fill("42");
  await seedInput.press("Enter");
  await page.waitForFunction(() => document.querySelector('pre.climate-downstream-result')?.textContent?.includes('"seed": 42'));
  report.seed = {enter: true};

  await page.setViewportSize({width: 690, height: 900});
  const layouts = await page.locator(".state-name-editor, .city-name-editor, .climate-downstream-seed").evaluateAll(elements => elements.map(element => ({className: element.className, width: element.clientWidth, scroll: element.scrollWidth})));
  assert.ok(layouts.every(layout => layout.width >= layout.scroll), JSON.stringify(layouts));
  report.layout = layouts;
  }
  assert.deepEqual(errors, [], "编辑窗口浏览器错误");
  console.log(JSON.stringify({ok: true, report, errors}, null, 2));
} finally {
  await browser.close();
  await server.httpServer.close();
}
