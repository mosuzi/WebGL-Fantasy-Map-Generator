import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {tmpdir} from "node:os";
import {preview} from "vite";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const root = resolve(import.meta.dirname, "..");
const {chromium} = createRequire(join(root, "source/Fantasy-Map-Generator/package.json"))("playwright");
const server = await preview({configFile: join(root, "vite.config.mjs"), preview: {host: "127.0.0.1", port: 5608, strictPort: true}, logLevel: "error"});
const browser = await chromium.launch({channel: "chrome", headless: true});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", msg => {if (msg.type() === "error" && !msg.text().startsWith("[FMG health]")) errors.push(msg.text());});
const baseline = process.argv.includes("--baseline");
try {
  await page.addInitScript(() => {
    window.__brushTasks = [];
    new PerformanceObserver(list => window.__brushTasks.push(...list.getEntries().map(e => ({start: e.startTime, ms: e.duration})))).observe({type: "longtask"});
  });
  await page.goto("http://127.0.0.1:5608/?debug=1", {waitUntil: "domcontentloaded"});
  await waitForApiReady(page, 60000);
  await page.locator("#import-map-file").setInputFiles(process.env.FMG_REAL_ARCHIVE);
  await page.waitForFunction(() => window.__webglGeneratorApp.map?.grid.cells.i.length === 100000);
  await waitForApiReady(page, 120000);
  const fixture = await page.evaluate(() => {
    const app = window.__webglGeneratorApp, {map, renderer} = app;
    const states = map.politics.states, source = states.find(s => s?.fullName === "微国");
    const capital = map.pack.burgs[source.capital], last = map.pack.cells.g[capital.cell];
    const cells = map.grid.cells, land = Array.from(cells.i).filter(i => cells.state[i] === source.i && cells.h[i] >= 20);
    const neighbors = land.flatMap(i => Array.from(cells.c[i])).filter(i => cells.h[i] >= 20 && cells.state[i] && cells.state[i] !== source.i);
    const target = cells.state[neighbors[0]];
    if (!target || !land.includes(last)) throw Error("存档未命中真实邻国或首都格");
    renderer.setColorMode("states");
    const [x,y] = map.grid.points[cells.p[last]];
    renderer.locateBounds({minX: x, maxX: x, minY: y, maxY: y}, {minScale: 2.8, maxScale: 2.8});
    app.panels.state.open(map, app.editHistory.getStats());
    window.__webglGeneratorDebug?.collapse?.();
    return {source: source.i, target, targetName: states[target].fullName, capital: capital.i, capitalName: capital.name,
      targetCapital: states[target].capital, last, x, y, other: land.filter(i => i !== last)};
  });
  const panel = page.locator('[data-panel-id="state-panel"]');
  await panel.locator(".object-table-row").first().waitFor();
  const read = (surface = page) => surface.evaluate(({source, target, capital, last}) => {
    const app = window.__webglGeneratorApp, {map, renderer} = app;
    const states = map.politics.states, s = states[source], recipient = states[target];
    const live = record => Boolean(record && !record.removed);
    const burg = map.pack.burgs[capital], city = map.settlements.cities[burg.cityId];
    const owned = cells => Array.from(cells.i).filter(i => cells.h[i] >= 20 && cells.state[i] === source).length;
    const activeRow = id => Boolean(document.querySelector(`[data-panel-id="state-panel"] [data-row-key="n:${id}"]`));
    const label = id => renderer.labelItems.find(i => i.targetKind === "state" && i.targetId === id);
    const capitalInMirror = map.pack.states[source]?.capital || 0;
    return {active: live(s), mirror: live(map.pack.states[source]), grid: owned(map.grid.cells), pack: owned(map.pack.cells),
      stateCells: [s?.cells, map.pack.states[source]?.cells, recipient.cells, map.pack.states[target]?.cells],
      owner: [map.grid.cells.state[last],map.pack.cells.state[burg.cell]], capital: s?.capital || 0, capitalInMirror,
      city: [city.name,city.population,city.state,city.province,Boolean(city.capital)], burg: [burg.name,burg.population,burg.state,burg.province,Boolean(burg.capital)],
      targetCapital: recipient.capital, targetFlags: map.pack.burgs.filter(b => b?.state === target && b.capital).length,
      sourceFlags: map.pack.burgs.filter(b => b?.state === source && b.capital).length,
      sourceCityFlags: map.settlements.cities.filter(c => c?.state === source && c.capital).length,
      targetCityFlags: map.settlements.cities.filter(c => c?.state === target && c.capital).length,
      provincial: Boolean(city.provincial), capitalIcon: renderer.cityIconItems.find(i => i.id === city.id)?.roles.includes("capital"),
      provinces: map.politics.provinces.filter(p => p && !p.removed && p.state === source).length,
      row: activeRow(source), label: Boolean(label(source)), visible: Boolean(label(source)?.visible),
      korea: [live(states[4009]),activeRow(4009),Boolean(label(4009))],
      states: states.filter(s => live(s) && s.i).length, undo: app.editHistory.getStats().undo};
  }, fixture);
  const settle = async () => {
    await page.waitForFunction(() => {
      const r = window.__webglGeneratorApp.renderer;
      return !r.viewportInteractionKind && !r.overlayInteractionSuspended && r.politicalBrushAppliedRequest === r.politicalBrushRequest;
    });
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  };
  await settle();
  const initial = await read();
  const prepared = await page.evaluate(({other, target}) => window.webglGeneratorApi.edit.states.applyChanges(other.map(gridCell => ({gridCell, after: target}))), fixture);
  assert.ok(prepared.ok && prepared.data.executed, JSON.stringify(prepared.error || prepared.data));
  await settle();
  const before = await read();
  assert.equal(before.grid, 1);
  assert.equal(before.pack, 1);
  const point = await page.evaluate(({target,x,y}) => {
    const app = window.__webglGeneratorApp, p = app.panels.state;
    p.setTargetStateId(target); p.setBrushRadius(1); p.setActive(true);
    const {renderer} = app, rect = renderer.canvas.getBoundingClientRect();
    const screen = renderer.worldToScreen(x,y,rect), px = rect.left + screen.x, py = rect.top + screen.y;
    if (document.elementFromPoint(px,py) !== renderer.canvas) throw Error("首都格被界面遮挡：" + document.elementFromPoint(px,py)?.outerHTML.slice(0,180));
    return {x:px,y:py};
  }, fixture);
  const started = await page.evaluate(() => performance.now());
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(n => window.__webglGeneratorApp.editHistory.getStats().undo === n + 1, before.undo);
  await settle();
  const after = await read();
  const replay = async action => {
    const result = await page.evaluate(key => window.webglGeneratorApi.history[key](), action);
    assert.ok(result.ok);
    await settle();
    return read();
  };
  const undone = await replay("undo"), redone = await replay("redo");
  const tasks = await page.evaluate(start => window.__brushTasks.filter(t => t.start >= start), started);
  console.log(JSON.stringify({fixture: {...fixture, other: fixture.other.length},initial,before,after,undone,redone,tasks,errors},null,2));
  if (!baseline) {
    assert.deepEqual(initial.korea, [false,false,false]);
    assert.ok(initial.row && initial.visible && before.row && before.label);
    assert.equal(before.capitalIcon, true);
    for (const snapshot of [before,after,undone,redone]) {
      const [sourceCells, mirrorSource, targetCells, mirrorTarget] = snapshot.stateCells;
      assert.deepEqual([sourceCells,mirrorSource,mirrorTarget], [snapshot.pack,snapshot.pack,targetCells]);
    }
    assert.deepEqual(after.owner, [fixture.target,fixture.target]);
    assert.deepEqual([after.active,after.mirror,after.row,after.label], [false,false,false,false]);
    assert.deepEqual([after.grid,after.pack,after.capital,after.sourceFlags,after.targetFlags], [0,0,0,0,1]);
    assert.equal(after.targetCapital, fixture.targetCapital);
    assert.deepEqual([after.capitalInMirror,after.sourceCityFlags,after.targetCityFlags,after.provinces],[0,0,1,0]);
    assert.equal(after.states, before.states - 1);
    assert.deepEqual(after.city, after.burg);
    assert.deepEqual(after.city.slice(0,3), [before.city[0],before.city[1],fixture.target]);
    assert.equal(after.city.at(-1),false);
    assert.deepEqual([after.provincial, after.capitalIcon], [false,false]);
    assert.deepEqual(undone,before);
    assert.deepEqual(redone,after);
    assert.ok(tasks.every(t => t.ms <= 200), JSON.stringify(tasks));
    await panel.locator(".floating-panel-close").click();
    const control = page.getByRole("heading", {name: "控制面板", exact: true});
    if (!await control.isVisible()) await page.locator("#open-generation-panel").click();
    await control.waitFor();
    await page.getByRole("tab", {name: "简介", exact: true}).click();
    await page.getByRole("button", {name: "保存", exact: true}).click();
    const saveItem = page.getByRole("menuitem", {name: "保存到本地", exact: true});
    await saveItem.waitFor();
    const [download] = await Promise.all([page.waitForEvent("download", {timeout: 90000}), saveItem.click()]);
    const path = join(tmpdir(), "last-state-cell-roundtrip.webfmg");
    await download.saveAs(path);
    const reopened = await browser.newPage({viewport: {width: 1440, height: 900}});
    reopened.on("pageerror", error => errors.push(error.message));
    await reopened.goto("http://127.0.0.1:5608/?debug=1", {waitUntil: "domcontentloaded"});
    await waitForApiReady(reopened, 60000);
    await reopened.locator("#import-map-file").setInputFiles(path);
    await reopened.waitForFunction(() => window.__webglGeneratorApp.map?.grid.cells.i.length === 100000);
    await waitForApiReady(reopened, 120000);
    await reopened.evaluate(() => {
      const app = window.__webglGeneratorApp;
      app.renderer.setColorMode("states"); app.panels.state.open(app.map, app.editHistory.getStats());
    });
    await reopened.locator('[data-panel-id="state-panel"] .object-table-row').first().waitFor();
    assert.deepEqual(await read(reopened), {...after, undo: 0});
    console.log("最后一格重做后的存档经正式保存和重新打开，全部字段一致。");
    assert.deepEqual(errors,[]);
  }
} finally {
  await browser.close();
  await server.httpServer.close();
}
