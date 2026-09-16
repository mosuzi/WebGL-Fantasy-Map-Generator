import assert from "node:assert/strict";
import {formatPopulation} from "../app/webgl-generator/src/ui/display-units.js";

export async function verifyCityPopulation(page, panel, select) {
  const id = await page.evaluate(() => window.__webglGeneratorApp.map.settlements.cities.find(city => city?.state > 0 && city?.province > 0).id);
  await select(id);
  const input = panel.getByRole("spinbutton", {name: "城市人口（人）"});
  const apply = panel.getByRole("button", {name: "应用人口", exact: true});
  const read = () => page.evaluate(id => {
    const app = window.__webglGeneratorApp, map = app.map, city = map.settlements.cities[id];
    const fields = records => records.map(item => item && {urban: item.urban, rural: item.rural});
    return {population: city.population, mirror: map.pack.burgs[city.burgId].population, state: city.state, province: city.province,
      states: fields(map.politics.states), provinces: fields(map.politics.provinces), cultures: fields(map.society.cultures), religions: fields(map.society.religions)};
  }, id);
  const undo = () => page.evaluate(async () => {const r = await window.webglGeneratorApi.history.undo(); if (!r.ok) throw Error(JSON.stringify(r.error));});
  const redo = () => page.evaluate(async () => {const r = await window.webglGeneratorApi.history.redo(); if (!r.ok) throw Error(JSON.stringify(r.error));});
  const history = () => page.evaluate(() => window.__webglGeneratorApp.editHistory.getStats().undo);
  const matrices = [];
  for (const scale of [.1, 1, 1.1, 10]) {
    await page.evaluate(async scale => {const r = await window.webglGeneratorApi.units.apply({populationScale: scale, numberAbbreviation: "none"}); if (!r.ok) throw Error(JSON.stringify(r.error));}, scale);
    const before = await read(), count = await history();
    const people = scale === .1 ? 0 : 123457;
    await input.fill(String(people));
    if (scale === 1) await input.press("Enter"); else await apply.click();
    await page.waitForFunction(({id, people, scale}) => Math.round(window.__webglGeneratorApp.map.settlements.cities[id].population * 1000 * scale) === people, {id, people, scale});
    const after = await read();
    assert.equal(after.mirror, after.population);
    assert.equal(await history(), count + 1);
    const expected = await page.evaluate(id => {
      const map = window.__webglGeneratorApp.map, city = map.settlements.cities[id];
      return Object.fromEntries(["state", "province", "culture", "religion"].map(key => [key, map.settlements.cities.filter(item => item && !item.removed && item[key] === city[key]).reduce((sum, item) => sum + item.population, 0)]));
    }, id);
    const owners = await page.evaluate(id => {const c = window.__webglGeneratorApp.map.settlements.cities[id]; return {state: c.state, province: c.province, culture: c.culture, religion: c.religion};}, id);
    for (const [key, collection] of [["state", "states"], ["province", "provinces"], ["culture", "cultures"], ["religion", "religions"]]) {
      assert.ok(Math.abs(after[collection][owners[key]].urban - expected[key]) < .000001);
      assert.equal(after[collection][owners[key]].rural, before[collection][owners[key]].rural);
    }
    await undo(); assert.deepEqual(await read(), before);
    await redo(); assert.deepEqual(await read(), after);
    assert.equal(await input.inputValue(), String(people));
    await apply.click(); assert.equal(await history(), count + 1, "同值不写历史");
    matrices.push({scale, people, undoRedo: true});
  }
  const count = await history();
  for (const invalid of ["", "-1", "1.5", "1000000001"]) {
    await input.fill(invalid); await apply.click();
    assert.match(await panel.locator(".city-population-controls [role=status]").innerText(), /整数人数/);
    assert.equal(await history(), count);
  }
  await page.evaluate(() => document.dispatchEvent(new CustomEvent("webgl-generator-runtime-operation", {detail: {busy: true}})));
  assert.equal(await input.isDisabled(), true); assert.equal(await apply.isDisabled(), true);
  await page.evaluate(() => document.dispatchEvent(new CustomEvent("webgl-generator-runtime-operation", {detail: {busy: false}})));
  const otherId = await page.evaluate(id => window.__webglGeneratorApp.map.settlements.cities.find(c => c && !c.removed && c.id !== id).id, id);
  await select(otherId); assert.equal(await panel.locator(".city-population-controls [role=status]").count(), 0);
  await select(id);
  await panel.getByRole("button", {name: "调整人口", exact: true}).click();
  assert.equal(await input.evaluate(element => element === document.activeElement), true);
  await input.fill("543219"); await apply.click();
  await page.waitForFunction(id => Math.round(window.__webglGeneratorApp.map.settlements.cities[id].population * 10000) === 543219, id);
  const units = {populationScale: 10, numberAbbreviation: "none"};
  for (const [kind, collection] of [["state", "states"], ["province", "provinces"], ["population", null]]) {
    await page.evaluate(({id, kind}) => {
      const app = window.__webglGeneratorApp, city = app.map.settlements.cities[id];
      if (kind === "state") {app.panels.state.open(app.map, app.editHistory.getStats()); app.panels.state.setTargetStateId(city.state);}
      if (kind === "province") {app.panels.province.open(app.map, {object: {kind: "province", id: city.province}}, app.editHistory.getStats()); app.panels.province.setSelectedProvinceId(city.province);}
      if (kind === "population") app.panels.population.open(app.map, app.editHistory.getStats());
    }, {id, kind});
    await page.locator(`.floating-panel[data-panel-id="${kind}-panel"]:not(.hidden) .${kind}-panel-${kind === "population" ? "summary" : "details"}`).waitFor();
    for (const value of [54.3219, 54.322]) {
      const result = await page.evaluate(async ({id, value}) => window.webglGeneratorApi.edit.cities.setPopulation(id, value), {id, value});
      assert.equal(result.ok, true);
      const current = await read();
      if (collection) {
        const group = current[collection][current[kind]];
        const expected = formatPopulation(group.rural + group.urban, units);
        const displayed = await page.locator(`.${kind}-panel-details .ui-key-value-item`).filter({has: page.locator(".ui-key-value-label", {hasText: /^人口$/})}).locator(".ui-key-value-value").textContent();
        assert.equal(displayed, expected, `${kind} 打开和保持打开时立即更新`);
      } else {
        const cityTotal = await page.evaluate(() => window.__webglGeneratorApp.map.settlements.cities.filter(c => c && !c.removed).reduce((sum, c) => sum + c.population, 0));
        assert.ok((await page.locator(".population-panel-summary").textContent()).includes(formatPopulation(cityTotal, units)), "人口汇总面板立即更新");
      }
    }
  }
  await select(id);
  const current = await read();
  await panel.getByRole("button", {name: "按条件重算人口", exact: true}).click();
  await page.waitForFunction(id => window.__webglGeneratorApp.map.settlements.cities[id].population !== 54.322, id);
  const recalculated = await read();
  assert.notEqual(recalculated.states[recalculated.state].urban, current.states[current.state].urban);
  await undo(); assert.deepEqual(await read(), current);
  await page.setViewportSize({width: 690, height: 960});
  const layout = await panel.locator(".city-population-controls").evaluate(e => ({width: e.clientWidth, scroll: e.scrollWidth}));
  assert.equal(layout.width, layout.scroll);
  await page.setViewportSize({width: 1440, height: 1000});
  return {matrices, invalid: 4, busy: true, selection: true, panels: ["city", "state", "province", "population"], recalculate: true, layout};
}
