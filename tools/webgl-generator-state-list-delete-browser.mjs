import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {preview} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const root = resolve(import.meta.dirname, "..");
const {chromium} = createRequire(join(root, "source/Fantasy-Map-Generator/package.json"))("playwright");
const server = await preview({configFile: join(root, "vite.config.mjs"), preview: {host: "127.0.0.1", port: 5749, strictPort: true}, logLevel: "error"});
const browser = await chromium.launch({channel: "chrome", headless: true});
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("dialog", async dialog => {errors.push(dialog.message()); await dialog.dismiss();});
  await page.goto("http://127.0.0.1:5749");
  await waitForApiReady(page, 90000);
  if (process.env.FMG_REAL_ARCHIVE) {
    await page.evaluate(() => {window.previousDeleteMap = window.__webglGeneratorApp.map;});
    await page.locator("#import-map-file").setInputFiles(process.env.FMG_REAL_ARCHIVE);
    await page.waitForFunction(() => window.previousDeleteMap !== window.__webglGeneratorApp.map, null, {timeout: 120000});
    await waitForApiReady(page, 120000);
  }
  await page.locator("#open-generation-panel").click();
  await page.getByRole("tab", {name: "管理", exact: true}).click();
  await page.locator("#open-state-panel").click();
  const panel = page.locator('[data-panel-id="state-panel"]:visible');
  const rows = panel.locator("tr[data-row-key]").filter({has: page.locator(".object-table-lock-action")});
  const target = rows.first();
  const stateId = Number((await target.getAttribute("data-row-key")).slice(2));
  const namedCell = row => row.locator('td[data-column-key="name"]');
  const button = panel.locator('[data-action-id="StatePanel:delete-selected"]');
  await namedCell(target).click();
  await namedCell(rows.nth(1)).click({modifiers: ["Control"]});
  assert.ok(await button.isDisabled());
  await namedCell(target).click();
  assert.ok((await button.getAttribute("title")).includes((await namedCell(target).innerText()).trim()));
  const snapshot = () => page.evaluate(id => {
    const app = window.__webglGeneratorApp, map = app.map;
    const active = states => states.filter(s => s?.i && !s.removed).map(s => s.i);
    return {
      states: active(map.politics.states), packStates: active(map.pack.states),
      cells: map.grid.cells.state.reduce((n, owner) => n + (owner === id), 0),
      packCells: map.pack.cells.state.reduce((n, owner) => n + (owner === id), 0),
      cities: map.settlements.cities.filter(c => c && !c.removed && c.state === id).map(c => c.id),
      label: app.renderer.labelItems.some(item => item.targetKind === "state" && Number(item.targetId) === id),
      mode: app.canvasToolModes.getActive()?.id ?? null
    };
  }, stateId);
  const history = () => page.evaluate(() => window.__webglGeneratorApp.editHistory.getStats().undo);
  const rememberBorders = () => page.evaluate(() => {
    const {grid, pack} = window.__webglGeneratorApp.map;
    window.originalCountryBorders = [grid.cells, pack.cells].map(cells => ({
      state: cells.state.slice(), province: cells.province.slice()
    }));
  });
  const verifyBorders = async deleted => {
    const intact = await page.evaluate(({deleted, stateId}) => {
      const {grid, pack} = window.__webglGeneratorApp.map;
      return [grid.cells, pack.cells].every((cells, index) => {
        const original = window.originalCountryBorders[index];
        return cells.state.length === original.state.length && cells.state.every((owner, cell) => {
          const cleared = deleted && original.state[cell] === stateId;
          return owner === (cleared ? 0 : original.state[cell]) && cells.province[cell] === (cleared ? 0 : original.province[cell]);
        });
      });
    }, {deleted, stateId});
    assert.ok(intact, "两层地块的国家及省份归属须逐格一致");
  };
  const before = await snapshot(), undo = await history();
  assert.ok(before.states.includes(stateId) && before.cells > 0 && before.packCells > 0);
  await rememberBorders();
  await button.click();
  const after = await snapshot();
  assert.deepEqual(after, {...before, states: before.states.filter(id => id !== stateId), packStates: before.packStates.filter(id => id !== stateId),
    cells: 0, packCells: 0, cities: [], label: false, mode: null});
  assert.equal(await panel.locator(`tr[data-row-key="n:${stateId}"]`).count(), 0);
  assert.equal(await history(), undo + 1);
  await verifyBorders(true);
  await panel.getByRole("button", {name: "撤销", exact: true}).click();
  assert.deepEqual(await snapshot(), before);
  await verifyBorders(false);
  await panel.getByRole("button", {name: "重做", exact: true}).click();
  assert.deepEqual(await snapshot(), after);
  await verifyBorders(true);
  const file = await page.evaluate(async () => {
    const result = await window.webglGeneratorApi.data.exportCompressedAll({download: false, includeBase64: true});
    if (!result.ok) throw new Error(result.error.message);
    window.previousDeleteMap = window.__webglGeneratorApp.map;
    return result.data.base64;
  });
  await page.locator("#import-map-file").setInputFiles({name: "国家删除.webfmg", mimeType: "application/octet-stream", buffer: Buffer.from(file, "base64")});
  await page.waitForFunction(() => window.previousDeleteMap !== window.__webglGeneratorApp.map, null, {timeout: 120000});
  await waitForApiReady(page, 90000);
  assert.deepEqual(await snapshot(), after);
  await verifyBorders(true);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({stateId, states: before.states.length, cells: before.cells, cities: before.cities.length, historyDelta: 1}));
} finally {
  await browser.close();
  await new Promise(done => server.httpServer.close(done));
}
