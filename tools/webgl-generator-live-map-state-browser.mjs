import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {preview} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const root = resolve(import.meta.dirname, "..");
const require = createRequire(join(root, "source/Fantasy-Map-Generator/package.json"));
const {chromium} = require("playwright");
const port = 5693;
const server = await preview({
  configFile: join(root, "vite.config.mjs"), preview: {host: "127.0.0.1", port, strictPort: true}, logLevel: "error"
});
let browser;
try {
  browser = await chromium.launch({channel: "chrome", headless: true});
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}`, {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 90000);
  await page.waitForFunction(() => !window.__webglGeneratorApp.runtimeOperation.getSnapshot().busy);
  const generated = await page.evaluate(async () => await window.webglGeneratorApi.generate.newMap({
    confirm: true, seed: "stage-496-live-map-state", cellsTarget: 3000
  }));
  assert.ok(generated.ok, JSON.stringify(generated));
  const id = await page.evaluate(() => window.__webglGeneratorApp.map.society.cultures.find(row => row?.i > 0 && !row.removed).i);
  const save = await page.evaluate(async () => await window.webglGeneratorApi.data.saveBrowserMap());
  assert.ok(save.ok, JSON.stringify(save));
  await page.waitForFunction(() => document.querySelector("#map-save-status")?.dataset.dirty === "false");

  const controls = page.locator('[data-panel-id="generation-panel"]');
  if (!await controls.isVisible()) await page.getByRole("button", {name: "控制面板", exact: true}).click();
  await page.getByRole("button", {name: "搜索地图内容"}).click();
  const label = "青岬验收文化";
  const search = page.getByRole("textbox", {name: "地图搜索关键词"});
  await search.fill(label);
  const option = page.locator(".map-search-results button").filter({hasText: label});
  assert.equal(await option.count(), 0);
  const renamed = await page.evaluate(({id, label}) => window.webglGeneratorApi.edit.cultures.rename(id, label), {id, label});
  assert.ok(renamed.ok, JSON.stringify(renamed));
  await option.waitFor({timeout: 6500});
  await page.waitForFunction(() => document.querySelector("#map-save-status")?.dataset.dirty === "true");
  const undone = await page.evaluate(() => window.webglGeneratorApi.history.undo());
  assert.ok(undone.ok, JSON.stringify(undone));
  await option.waitFor({state: "detached", timeout: 6500});
  await page.waitForFunction(() => document.querySelector("#map-save-status")?.dataset.dirty === "false");
  const redone = await page.evaluate(() => window.webglGeneratorApi.history.redo());
  assert.ok(redone.ok, JSON.stringify(redone));
  await option.waitFor({timeout: 6500});
  await page.waitForFunction(() => document.querySelector("#map-save-status")?.dataset.dirty === "true");
  await search.press("Escape");

  const before = await page.evaluate(() => window.__webglGeneratorApp.mapRevision.getSnapshot().mapIdentity);
  const restored = await page.evaluate(async () => await window.webglGeneratorApi.data.restoreBrowserMap({confirm: true}));
  assert.ok(restored.ok, JSON.stringify(restored));
  const after = await page.evaluate(id => {
    const app = window.__webglGeneratorApp;
    return {mapIdentity: app.mapRevision.getSnapshot().mapIdentity, name: app.map.society.cultures[id].name};
  }, id);
  assert.notEqual(after.mapIdentity, before);
  assert.notEqual(after.name, label);
  await page.waitForFunction(() => document.querySelector("#map-save-status")?.dataset.dirty === "false");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({liveSearch: true, saveReceipt: true, undoRedo: true, browserRestore: true, pageErrors: errors.length}));
} finally {
  await browser?.close();
  await server.close();
}
