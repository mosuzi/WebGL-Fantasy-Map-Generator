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
const diagnose = process.env.CITY_ATTRIBUTES_DIAGNOSE === "1";
const parity = process.env.CITY_ATTRIBUTES_PARITY === "1";
const targets = process.env.CITY_ATTRIBUTES_CELLS?.split(",").map(Number) || [3000, 100000];
const profiler = diagnose ? await page.context().newCDPSession(page) : null;
try {
  await page.goto("http://127.0.0.1:5538/", {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 120000);
  for (const target of targets) {
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
    if (parity) {
      const projections = await verifyRoleProjections();
      reports.push({target, size, projections});
      writeFileSync(join(output, "projection-parity.json"), JSON.stringify({ok: true, reports}, null, 2));
      continue;
    }
    await page.evaluate(diagnose => {
      const app = window.__webglGeneratorApp;
      app.healthMonitor?.clear?.();
      window.__webglGeneratorHealth?.clear?.();
      window.__cityAttributeLongTasks = [];
      window.__cityAttributeObserver?.disconnect();
      window.__cityAttributeObserver = new PerformanceObserver(list => window.__cityAttributeLongTasks.push(...list.getEntries().map(entry => entry.duration)));
      window.__cityAttributeObserver.observe({type: "longtask"});
      if (diagnose) {
        window.__cityAttributeStages = [];
        window.__cityAttributeActions = [];
        window.__cityAttributeDetailedLongTasks = [];
        window.__cityAttributeDetailObserver = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) window.__cityAttributeDetailedLongTasks.push({start: entry.startTime, duration: entry.duration});
        });
        window.__cityAttributeDetailObserver.observe({type: "longtask"});
        document.addEventListener("click", event => {
          const button = event.target.closest?.("button");
          if (button) window.__cityAttributeActions.push({label: button.getAttribute("aria-label") || button.title || button.textContent, start: performance.now()});
        }, true);
        const instrument = (object, key, label = key) => {
          if (typeof object?.[key] !== "function") return;
          const original = object[key];
          object[key] = function(...args) {
            const start = performance.now();
            try { return original.apply(this, args); }
            finally { window.__cityAttributeStages.push({label, start, duration: performance.now() - start}); }
          };
        };
        for (const key of ["refreshLabels", "buildLabels", "updateLabels", "refreshPointLayers", "draw"]) instrument(app.renderer, key);
        instrument(app.editRefreshScheduler, "run", "editRefresh");
        for (const [name, panel] of Object.entries(app.panels)) instrument(panel, "update", `panel:${name}`);
      }
    }, diagnose);
    if (profiler) {await profiler.send("Profiler.enable"); await profiler.send("Profiler.start");}
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
    if (profiler) {
      const {profile} = await profiler.send("Profiler.stop");
      writeFileSync(join(output, `${target}.cpuprofile`), JSON.stringify(profile));
      const detail = await page.evaluate(() => ({actions: window.__cityAttributeActions, stages: window.__cityAttributeStages, longTasks: window.__cityAttributeDetailedLongTasks}));
      writeFileSync(join(output, `${target}-stages.json`), JSON.stringify(detail, null, 2));
    }
    const diagnostics = await page.evaluate(() => ({longTasks: window.__cityAttributeLongTasks, gl: window.__webglGeneratorApp.renderer.canvas.getContext("webgl2").getError(), health: (window.__webglGeneratorHealth?.getEvents?.(200) || []).filter(item => item.severity === "error" || item.level === "error")}));
    const report = {target, size, toggled, candidate: candidate.id, portCandidate: portCandidate.id, invalidPort: invalidPort.id, layout, diagnostics, errors: [...errors]};
    reports.push(report);
    writeFileSync(join(output, "report.json"), JSON.stringify({reports}, null, 2));
    assert.equal(diagnostics.gl, 0);
    assert.deepEqual(diagnostics.health, []);
    assert.deepEqual(diagnose ? errors.filter(message => !message.startsWith("[FMG health] main-thread-long-task")) : errors, []);
    if (!diagnose) assert.ok(diagnostics.longTasks.every(duration => duration <= 200), "目标窗口存在超过200ms长任务");
    await page.setViewportSize({width: 1440, height: 1000});
  }
  console.log(JSON.stringify({ok: diagnose ? null : true, diagnostic: diagnose, reports, output}));
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

async function verifyRoleProjections() {
  return page.evaluate(() => {
    const renderer = window.__webglGeneratorApp.renderer;
    const originalMap = renderer.map;
    const originalLimit = renderer.labelOptions;
    const copy = item => JSON.parse(JSON.stringify(item));
    const digest = () => ({
      labels: renderer.labelItems.map(item => {
        const {node, contentNode, glyphNodes, city, state, province, zone, custom, componentCellSet, box, visible, buffered, politicalCandidateIndex, ...data} = item;
        return {...data, textContent: node.textContent, style: node.style.cssText, dataset: {...node.dataset}};
      }),
      icons: renderer.cityIconItems.map(({city, ...item}) => copy(item)),
      order: [...renderer.overlay.children].map(node => [node.dataset.labelTargetKind, node.dataset.labelTargetId, node.dataset.markerId, node.dataset.militaryId])
    });
    const results = [];
    const check = (map, label, stateIds) => {
      const retained = renderer.labelItems.filter(item => item.targetKind !== "city" && !(item.targetKind === "state" && stateIds.includes(Number(item.targetId))));
      const markers = [...renderer.markerIconItems, ...renderer.militaryIconItems];
      renderer.buildLabels(map, {cityRolesOnly: true, stateIds});
      if (!retained.every(item => renderer.labelItems.includes(item) && item.node.parentNode === renderer.overlay)) throw new Error(`${label} 误重建无关标签`);
      if (!markers.every(item => [...renderer.markerIconItems, ...renderer.militaryIconItems].includes(item) && item.node.parentNode === renderer.overlay)) throw new Error(`${label} 误重建标记`);
      const scoped = digest();
      renderer.buildLabels(map);
      if (JSON.stringify(scoped) !== JSON.stringify(digest())) throw new Error(`${label} 局部与完整布局不一致`);
      results.push(label);
    };
    try {
      const map = structuredClone(originalMap);
      renderer.labelOptions = {...originalLimit, maxCityLabels: 8};
      const cities = map.settlements.cities.filter(city => city && !city.removed);
      const candidate = cities.find(city => !city.capital && city.state > 0);
      const old = cities.find(city => city.state === candidate.state && city.capital);
      map.labels ||= {};
      map.labels.layout = {version: 1, overrides: {
        [`city:${candidate.id}`]: {priority: 99, position: {x: 20, y: 30}},
        [`state:${candidate.state}`]: {position: {x: 40, y: 50}}
      }};
      map.labels.hidden = {city: [cities.find(city => city !== old && city !== candidate).id]};
      renderer.buildLabels(map);
      for (const enabled of [true, false, true]) {
        candidate.capital = Number(enabled); old.capital = Number(!enabled);
        map.pack.burgs[candidate.burgId].capital = Number(enabled); map.pack.burgs[old.burgId].capital = Number(!enabled);
        map.politics.states[candidate.state].capital = enabled ? candidate.burgId : old.burgId;
        check(map, `迁都 ${enabled}（手工位置、优先级、隐藏与数量限制）`, [candidate.state]);
      }
      for (const enabled of [true, false]) {
        candidate.port = Number(enabled); map.pack.burgs[candidate.burgId].port = Number(enabled);
        check(map, `港口 ${enabled}`, []);
      }
      const islands = {
        options: {}, labels: {}, settlements: {cities: [
          {id: 0, burgId: 1, name: "本土城", x: 10, y: 10, capital: 1, population: 10},
          {id: 1, burgId: 2, name: "海外城", x: 100, y: 10, capital: 0, population: 10}
        ]}, politics: {states: [null, {i: 1, name: "群岛联合王国", capital: 1}], provinces: []},
        pack: {burgs: [null, {i: 1, cell: 0, capital: 1}, {i: 2, cell: 2, capital: 0}], cells: {
          i: [0, 1, 2, 3], p: [[10, 10], [12, 10], [100, 10], [102, 10]], c: [[1], [0], [3], [2]], h: [30, 30, 30, 30], state: [1, 1, 1, 1], area: [1, 1, 1, 1]
        }}
      };
      renderer.buildLabels(islands);
      const oldAnchor = renderer.labelItems.find(item => item.targetKind === "state").x;
      islands.politics.states[1].capital = 2;
      islands.settlements.cities[0].capital = 0; islands.pack.burgs[1].capital = 0;
      islands.settlements.cities[1].capital = 1; islands.pack.burgs[2].capital = 1;
      check(islands, "跨海迁都国家标签锚点", [1]);
      if (renderer.labelItems.find(item => item.targetKind === "state").x === oldAnchor) throw new Error("跨海迁都未移动国家标签");
      return results;
    } finally {
      renderer.labelOptions = originalLimit;
      renderer.buildLabels(originalMap);
      renderer.updateLabels();
    }
  });
}
