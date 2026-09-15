import assert from "node:assert/strict";
import {mkdirSync, writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {preview} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = process.env.CITY_ATTRIBUTES_OUTPUT || join(root, "docs/generated/city-attributes");
mkdirSync(output, {recursive: true});
const playwright = createRequire(join(root, "source/Fantasy-Map-Generator/package.json"))("playwright");
const server = await preview({configFile: join(root, "vite.config.mjs"), preview: {host: "127.0.0.1", port: 5538, strictPort: true}, logLevel: "error"});
const browser = await playwright.chromium.launch({channel: "chrome", headless: true});
const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
page.setDefaultTimeout(30000);
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => {if (["error", "warning"].includes(message.type())) errors.push(message.text());});
const reports = [];
const panel = page.locator('.floating-panel[data-panel-id="city-panel"]:not(.hidden)');
const button = name => panel.getByRole("button", {name, exact: true});
const attributes = [["plaza", "贸易中心"], ["citadel", "要塞"], ["walls", "城墙"], ["temple", "神庙"]];
try {
  await page.goto("http://127.0.0.1:5538/", {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 120000);
  for (const target of [3000, 100000]) {
    await page.evaluate(async cellsTarget => {
      const result = await window.webglGeneratorApi.generate.newMap({confirm: true, seed: "city-attributes-382", cellsTarget, heightmapTemplate: "continents"});
      if (!result.ok) throw new Error(JSON.stringify(result.error));
    }, target);
    await waitForApiReady(page, 120000);
    const size = await page.evaluate(() => ({requested: window.__webglGeneratorApp.map.options.cellsTarget, grid: window.__webglGeneratorApp.map.grid.cells.i.length}));
    assert.equal(size.requested, target, "浏览器须实际采用目标规模");
    console.log(`开始 ${target} 格，实际 ${size.grid} 格`);
    const candidates = await page.evaluate(() => window.__webglGeneratorApp.map.settlements.cities.filter(city => city && !city.removed).map(city => ({id: city.id, capital: city.capital, port: city.port, state: city.state})));
    const candidate = candidates.find(city => !city.capital && city.state > 0);
    await select(candidate.id);
    await page.evaluate(() => {
      const app = window.__webglGeneratorApp;
      app.healthMonitor?.clear?.();
      window.__webglGeneratorHealth?.clear?.();
      window.__cityAttributeLongTasks = [];
      window.__cityAttributeObserver?.disconnect();
      window.__cityAttributeObserver = new PerformanceObserver(list => window.__cityAttributeLongTasks.push(...list.getEntries().map(entry => entry.duration)));
      window.__cityAttributeObserver.observe({type: "longtask"});
    });
    errors.length = 0;
    const toggled = [];
    for (const [key, label] of attributes) {
      await roundtrip(candidate.id, key, label);
      toggled.push(key);
    }
    await roundtrip(candidate.id, "capital", "首都");
    let portCandidate;
    let invalidPort;
    for (const city of candidates.filter(city => !city.port)) {
      await select(city.id);
      if (await button("港口").isEnabled()) portCandidate ||= city;
      else invalidPort ||= city;
      if (portCandidate && invalidPort) break;
    }
    assert.ok(portCandidate && invalidPort, "须有可设港及不可设港的真实城市");
    await select(portCandidate.id);
    await roundtrip(portCandidate.id, "port", "港口");
    await button("港口").click();
    await page.waitForFunction(id => Boolean(window.__webglGeneratorApp.map.settlements.cities[id].port), portCandidate.id);
    await roundtrip(portCandidate.id, "port", "港口");
    await button("撤销").click();
    await select(invalidPort.id);
    assert.equal(await button("港口").isDisabled(), true);
    assert.match(await button("港口").getAttribute("title"), /港口条件/);
    await select(candidate.id);
    await button("要塞").focus();
    const keyboardBefore = await snapshot();
    await page.keyboard.press("Space");
    await page.waitForFunction(id => document.querySelector('.city-attribute-feedback')?.textContent.includes("可撤销"), candidate.id);
    assert.notDeepEqual(await snapshot(), keyboardBefore, "空格键须激活图标按钮");
    await button("撤销").click();
    assert.deepEqual(await snapshot(), keyboardBefore);
    await panel.screenshot({path: join(output, `${target}-desktop.png`)});
    await page.setViewportSize({width: 690, height: 960});
    const layout = await panel.locator(".city-attribute-shortcuts").evaluate(element => ({width: element.clientWidth, scrollWidth: element.scrollWidth, buttons: [...element.querySelectorAll("button")].map(button => ({label: button.getAttribute("aria-label"), width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height}))}));
    assert.equal(layout.width, layout.scrollWidth, "窄面板图标组不得溢出");
    assert.equal(layout.buttons.length, 6);
    assert.ok(layout.buttons.every(button => button.width >= 32 && button.height >= 32));
    await panel.screenshot({path: join(output, `${target}-narrow.png`)});
    const diagnostics = await page.evaluate(() => ({longTasks: window.__cityAttributeLongTasks, gl: window.__webglGeneratorApp.renderer.canvas.getContext("webgl2").getError(), health: (window.__webglGeneratorHealth?.getEvents?.(200) || []).filter(item => item.severity === "error" || item.level === "error")}));
    const report = {target, size, toggled, candidate: candidate.id, portCandidate: portCandidate.id, invalidPort: invalidPort.id, layout, diagnostics, errors: [...errors]};
    reports.push(report);
    writeFileSync(join(output, "report.json"), JSON.stringify({reports}, null, 2));
    assert.equal(diagnostics.gl, 0);
    assert.deepEqual(diagnostics.health, []);
    assert.deepEqual(errors, []);
    assert.ok(diagnostics.longTasks.every(duration => duration <= 200), "目标窗口存在超过200ms长任务");
    await page.setViewportSize({width: 1440, height: 1000});
  }
  console.log(JSON.stringify({ok: true, reports, output}));
} catch (error) {
  await page.screenshot({path: join(output, "failure.png")}).catch(() => {});
  writeFileSync(join(output, "failure.json"), JSON.stringify({error: error.stack, errors, reports}, null, 2));
  throw error;
} finally {
  await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}

async function select(id) {
  await page.evaluate(id => {
    const app = window.__webglGeneratorApp;
    app.selectionStore.setSelection({object: {kind: "city", id}}, {sourcePanelId: "city-panel"});
    app.panels.city.open(app.map, {object: {kind: "city", id}}, app.editHistory.getStats());
    app.panels.city.setSelectedCityId(id);
  }, id);
  await panel.locator(".city-attribute-button").first().waitFor({state: "visible"});
}

async function snapshot() {
  return page.evaluate(() => {
    const map = window.__webglGeneratorApp.map;
    const fields = item => item && Object.fromEntries(["id", "i", "capital", "plaza", "citadel", "walls", "port", "temple", "group", "provincial"].filter(key => Object.hasOwn(item, key)).map(key => [key, item[key]]));
    return {cities: map.settlements.cities.map(fields), burgs: map.pack.burgs.map(fields), states: map.politics.states.map(state => state && ({capital: state.capital, center: state.center, religion: state.religion})), metadata: map.settlements.metadata};
  });
}

async function roundtrip(id, key, label) {
  const before = await snapshot();
  const active = await button(label).getAttribute("aria-pressed") === "true";
  const count = await page.evaluate(() => window.__webglGeneratorApp.editHistory.getStats().undo);
  await button(label).click();
  await page.waitForFunction(({id, key, active}) => Boolean(window.__webglGeneratorApp.map.settlements.cities[id][key]) !== active, {id, key, active});
  assert.equal(await button(label).getAttribute("aria-pressed"), String(!active));
  const after = await snapshot();
  assert.equal(Boolean(after.burgs[await page.evaluate(id => window.__webglGeneratorApp.map.settlements.cities[id].burgId, id)][key]), !active);
  assert.equal(await page.evaluate(() => window.__webglGeneratorApp.editHistory.getStats().undo), count + 1);
  await button("撤销").click();
  assert.deepEqual(await snapshot(), before, `${label} UI撤销恢复`);
  assert.equal(await button(label).getAttribute("aria-pressed"), String(active));
  await button("重做").click();
  assert.deepEqual(await snapshot(), after, `${label} UI重做恢复`);
  await button("撤销").click();
}
