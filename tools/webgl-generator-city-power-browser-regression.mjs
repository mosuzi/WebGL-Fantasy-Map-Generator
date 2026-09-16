import assert from "node:assert/strict";
import {mkdirSync, writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {preview} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = process.env.CITY_POWER_OUTPUT || join(root, "docs/generated/city-power");
mkdirSync(output, {recursive: true});
const playwright = createRequire(join(root, "source/Fantasy-Map-Generator/package.json"))("playwright");
const server = await preview({configFile: join(root, "vite.config.mjs"), preview: {host: "127.0.0.1", port: 5542, strictPort: true}, logLevel: "error"});
const browser = await playwright.chromium.launch({channel: "chrome", headless: true});
const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
page.setDefaultTimeout(30000);
const errors = [], reports = [];
const diagnose = process.env.CITY_POWER_DIAGNOSE === "1";
const profiler = diagnose ? await page.context().newCDPSession(page) : null;
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => {if (["error", "warning"].includes(message.type())) errors.push(message.text());});
try {
  await page.goto("http://127.0.0.1:5542/", {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 120000);
  for (const target of process.env.CITY_POWER_CELLS?.split(",").map(Number) || [3000, 100000]) {
    await page.evaluate(async cellsTarget => {
      const r = await window.webglGeneratorApi.generate.newMap({confirm: true, seed: "city-power-385", cellsTarget, heightmapTemplate: "continents"});
      if (!r.ok) throw Error(JSON.stringify(r.error));
    }, target);
    await waitForApiReady(page, 120000);
    await rebuild();
    const id = await page.evaluate(() => window.__webglGeneratorApp.map.settlements.cities.find(c => c && !c.removed && !c.citadel && c.state > 0 && c.province > 0).id);
    await page.evaluate(id => {
      const a = window.__webglGeneratorApp;
      a.panels.city.open(a.map, {object: {kind: "city", id}}, a.editHistory.getStats()); a.panels.city.setSelectedCityId(id);
    }, id);
    const cityPanel = page.locator('.floating-panel[data-panel-id="city-panel"]:not(.hidden)');
    await cityPanel.getByRole("button", {name: "要塞", exact: true}).waitFor();
    errors.length = 0;
    await page.evaluate(diagnose => {
      window.__powerTasks = []; window.__powerObserver?.disconnect();
      window.__powerStages = []; window.__powerTaskDetails = [];
      window.__powerObserver = new PerformanceObserver(list => {for (const e of list.getEntries()) {window.__powerTasks.push(e.duration); window.__powerTaskDetails.push({start: e.startTime, duration: e.duration});}});
      window.__powerObserver.observe({type: "longtask"});
      window.__webglGeneratorHealth?.clear?.();
      if (diagnose) {
        const a = window.__webglGeneratorApp;
        const wrap = (object, key, label) => {
          const original = object[key]; if (typeof original !== "function") return;
          object[key] = function(...args) {const start = performance.now(); try {return original.apply(this, args);} finally {window.__powerStages.push({label, start, duration: performance.now() - start});}};
        };
        for (const key of ["refreshLabels", "buildLabels", "refreshPointLayers", "draw"]) wrap(a.renderer, key, key);
        for (const kind of ["city", "state", "province"]) for (const key of ["open", "update"]) wrap(a.panels[kind], key, `${kind}.${key}`);
      }
    }, diagnose);
    if (profiler) {await profiler.send("Profiler.enable"); await profiler.send("Profiler.start");}
    const before = await read(id);
    await cityPanel.getByRole("button", {name: "要塞", exact: true}).click();
    assert.deepEqual(await read(id), before, "属性设置不立即重算国力");
    const count = await page.evaluate(() => window.__webglGeneratorApp.editHistory.getStats().undo);
    await rebuild();
    const after = await read(id);
    assert.ok(after.state.settlementPower > before.state.settlementPower);
    assert.ok(after.state.powerScore > before.state.powerScore);
    assert.ok(after.province.settlementPower > before.province.settlementPower);
    assert.equal(after.state.settlementPower, after.packState.settlementPower);
    assert.equal(await page.evaluate(() => window.__webglGeneratorApp.editHistory.getStats().undo), count + 1);
    await history("undo"); assert.deepEqual(await read(id), before);
    await history("redo"); assert.deepEqual(await read(id), after);
    await rebuild(); assert.deepEqual(await read(id), after, "重复重算无复利");
    for (const kind of ["state", "province"]) {
      await page.evaluate(({id, kind}) => {
        const a = window.__webglGeneratorApp, c = a.map.settlements.cities[id];
        if (kind === "state") {a.panels.state.open(a.map, a.editHistory.getStats()); a.panels.state.setTargetStateId(c.state);}
        else {a.panels.province.open(a.map, {object: {kind: "province", id: c.province}}, a.editHistory.getStats()); a.panels.province.setSelectedProvinceId(c.province);}
      }, {id, kind});
      const panel = page.locator(`.floating-panel[data-panel-id="${kind}-panel"]:not(.hidden)`);
      const detail = panel.locator(`.${kind}-panel-details .ui-key-value-item`).filter({hasText: "城镇贡献"});
      await detail.waitFor();
      const displayed = await detail.locator(".ui-key-value-value").innerText();
      assert.equal(displayed, after[kind].settlementPower.toLocaleString("zh-CN", {maximumFractionDigits: 1}));
      await detail.scrollIntoViewIfNeeded();
      await panel.screenshot({path: join(output, `${target}-${kind}.png`)});
    }
    const diagnostics = await page.evaluate(() => ({longTasks: window.__powerTasks, gl: window.__webglGeneratorApp.renderer.canvas.getContext("webgl2").getError(), health: (window.__webglGeneratorHealth?.getEvents?.(200) || []).filter(e => e.severity === "error" || e.level === "error")}));
    if (profiler) {
      const {profile} = await profiler.send("Profiler.stop"); writeFileSync(join(output, `${target}.cpuprofile`), JSON.stringify(profile));
      writeFileSync(join(output, `${target}-timing.json`), JSON.stringify(await page.evaluate(() => ({tasks: window.__powerTaskDetails, stages: window.__powerStages})), null, 2));
    }
    const report = {target, before, after, diagnostics, errors: [...errors]}; reports.push(report);
    writeFileSync(join(output, "report.json"), JSON.stringify({reports}, null, 2));
    assert.equal(diagnostics.gl, 0); assert.deepEqual(diagnostics.health, []); assert.deepEqual(errors, []);
    assert.ok(diagnostics.longTasks.every(ms => ms <= 200));
    console.log(JSON.stringify(report));
  }
  console.log(JSON.stringify({ok: true, output}));
} catch (error) {
  await page.screenshot({path: join(output, "failure.png")});
  writeFileSync(join(output, "failure.json"), JSON.stringify({error: error.stack, errors, reports}, null, 2)); throw error;
} finally {await browser.close(); await new Promise(resolve => server.httpServer.close(resolve));}
async function rebuild() {const r = await page.evaluate(() => window.webglGeneratorApi.edit.economy.rebuild({confirm: true})); assert.equal(r.ok, true, JSON.stringify(r.error));}
async function history(action) {const r = await page.evaluate(action => window.webglGeneratorApi.history[action](), action); assert.equal(r.ok, true, JSON.stringify(r.error));}
async function read(id) {
  return page.evaluate(id => {
    const m = window.__webglGeneratorApp.map, c = m.settlements.cities[id];
    const fields = g => ({powerScore: g.powerScore, settlementPower: g.settlementPower, economicPower: g.economicPower});
    return {state: fields(m.politics.states[c.state]), province: fields(m.politics.provinces[c.province]), packState: fields(m.pack.states[c.state])};
  }, id);
}
