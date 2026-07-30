#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {createSetCityPopulationCommand, createSetCityVisualCommand} from "../app/webgl-generator/src/runtime/city-edit-commands.js";
import {
  cityRoleKeys,
  cityRoleScaleLabel,
  createCityScaleContext,
  defaultCityVisual,
  deriveCityScale,
  resolveCityVisual
} from "../app/webgl-generator/src/runtime/city-visuals.js";

const boundaryContext = {p90Population: 5};
assert.equal(deriveCityScale({population: 0.1}, boundaryContext), "hamlet");
assert.equal(deriveCityScale({population: 0.101}, boundaryContext), "village");
assert.equal(deriveCityScale({population: 2}, boundaryContext), "village");
assert.equal(deriveCityScale({population: 2.001}, boundaryContext), "town");
assert.equal(deriveCityScale({population: 4.999}, boundaryContext), "town");
assert.equal(deriveCityScale({population: 5}, boundaryContext), "city");

const percentileCities = Array.from({length: 10}, (_, index) => ({id: index, population: index + 1}));
const percentileContext = createCityScaleContext(percentileCities);
assert.equal(percentileContext.p90Population, 10);
assert.equal(deriveCityScale(percentileCities[8], percentileContext), "town");
assert.equal(deriveCityScale(percentileCities[9], percentileContext), "city");

const shangyu = {id: 150, population: 1.179, provincial: true, type: "Highland"};
const lanhui = {id: 284, population: 3.997};
const counterexampleContext = createCityScaleContext([shangyu, lanhui, ...percentileCities]);
assert.equal(deriveCityScale(shangyu, counterexampleContext), "village");
assert.equal(deriveCityScale(lanhui, counterexampleContext), "town");
assert.equal(defaultCityVisual(shangyu, {type: "Highland"}, counterexampleContext).silhouette, "village");
assert.equal(cityRoleScaleLabel(shangyu, counterexampleContext), "省会·村庄");
assert.equal(cityRoleScaleLabel({...lanhui, port: 1}, counterexampleContext), "港口·城镇");
assert.deepEqual(cityRoleKeys({...shangyu, capital: true}), ["capital", "provincial"], "首都兼省会必须保留两个独立角色");

const manualVisual = {silhouette: "fort", palette: "highland", cultureStyle: "highland", manual: true};
assert.deepEqual(
  resolveCityVisual({...shangyu, visual: manualVisual}, {type: "Highland"}, null, counterexampleContext),
  manualVisual
);
assert.equal(
  resolveCityVisual({...shangyu, visual: {...manualVisual, manual: false}}, {type: "Highland"}, null, counterexampleContext).silhouette,
  "village"
);

const editMap = populationEditFixture();
const beforeGroups = groupVisualFingerprint(editMap);
const command = createSetCityPopulationCommand(0, 10);
command.apply({map: editMap});
assert.equal(editMap.settlements.cities[0].group, "city");
assert.equal(editMap.pack.burgs[1].group, "city");
assert.equal(editMap.settlements.cities[9].group, "town", "P90 变化必须同步刷新其它自动城市");
assert.equal(editMap.pack.burgs[10].group, "town");
assert.deepEqual(editMap.settlements.cities[6].visual, manualVisual, "手工视觉不得被人口编辑覆盖");
assert.deepEqual(editMap.pack.burgs[7].visual, manualVisual);
assertCityBurgScaleParity(editMap);
command.revert({map: editMap});
assert.equal(groupVisualFingerprint(editMap), beforeGroups, "撤销必须恢复完整规模与视觉指纹");

const visualPatchMap = populationEditFixture();
visualPatchMap.settlements.cities[9].population = 10;
visualPatchMap.pack.burgs[10].population = 10;
const visualPatchCommand = createSetCityVisualCommand(9, {palette: "highland"});
visualPatchCommand.apply({map: visualPatchMap});
assert.equal(visualPatchMap.settlements.cities[9].visual.silhouette, "city", "局部视觉修改不得丢失统一规模上下文");
assert.equal(visualPatchMap.pack.burgs[10].visual.silhouette, "city");

const generated = generatePlaceholderMap({seed: "city-scale-217", cellsTarget: 3000, heightmapTemplate: "continents"});
const generatedContext = createCityScaleContext(generated.settlements.cities, generated.pack.burgs);
for (const city of generated.settlements.cities.filter(Boolean)) {
  const burg = generated.pack.burgs[city.burgId];
  const expected = deriveCityScale(city, generatedContext, burg);
  assert.equal(city.group, expected, `生成城市 #${city.id} group 未使用统一规模`);
  assert.equal(burg?.group, expected, `生成 burg #${city.burgId} group 未与城市同步`);
  if (!city.visual?.manual) assert.equal(city.visual?.silhouette, expected, `生成城市 #${city.id} 自动剪影未使用统一规模`);
}

const rendererSource = await readFile(new URL("../app/webgl-generator/src/renderer/placeholder-renderer.js", import.meta.url), "utf8");
const settlementSource = await readFile(new URL("../app/webgl-generator/src/generator/settlements.js", import.meta.url), "utf8");
const panelSource = await readFile(new URL("../app/webgl-generator/src/ui/vue/components/CityPanel.vue", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../app/webgl-generator/src/styles.css", import.meta.url), "utf8");
const exportSource = await readFile(new URL("../app/webgl-generator/src/runtime/map-file-io.js", import.meta.url), "utf8");
assert.ok(!rendererSource.includes("function cityIconKind"), "渲染器不得保留独立规模判断");
assert.match(rendererSource, /deriveCityScale\(city, scaleContext, burg\)/);
assert.match(rendererSource, /cityRoleBadgeSvg\(item\.roles\)/);
assert.match(rendererSource, /item\.scale === "city"/);
assert.match(rendererSource, /const roleThreshold = city\.capital \? 0\.95 : city\.provincial \? 1\.2 : city\.port \? 1\.45/);
assert.match(rendererSource, /Math\.max\(0, scale - 1\)/, "行政角色可改变显示门槛，但不得改变实际图标尺寸");
assert.doesNotMatch(rendererSource.match(/function cityIconScale[\s\S]*?\n}/)?.[0] || "", /item\.minScale/, "角色可见阈值不得改变实际尺寸");
assert.match(rendererSource, /if \(roles\.includes\("capital"\)\)/);
assert.match(rendererSource, /if \(roles\.includes\("provincial"\)\)/);
assert.match(settlementSource, /return deriveCityScale\(burg, scaleContext\)/);
assert.match(panelSource, /cityRoleScaleLabel\(city, scaleContext, burg\)/);
assert.match(stylesSource, /\.city-icon-role-badge-bg/);
assert.match(exportSource, /\.city-map-icon\.visible/);

console.log(JSON.stringify({
  thresholds: {hamletMax: 0.1, villageMax: 2, cityMin: 5, percentile: percentileContext.p90Population},
  counterexample: {
    150: deriveCityScale(shangyu, counterexampleContext),
    284: deriveCityScale(lanhui, counterexampleContext)
  },
  generatedCities: generated.settlements.cities.filter(Boolean).length,
  cityBurgDiff: 0,
  manualPreserved: true,
  domPngShared: true
}, null, 2));

function populationEditFixture() {
  const populations = [0.05, 1, 2.5, 3, 4, 5, 7, 7.5, 8, 9];
  const cities = populations.map((population, id) => ({
    id,
    burgId: id + 1,
    population,
    group: "town",
    capital: false,
    provincial: false,
    port: 0,
    culture: 0,
    visual: {silhouette: "town", palette: "town", cultureStyle: "default", manual: false}
  }));
  const burgs = [null, ...cities.map(city => ({
    i: city.burgId,
    cityId: city.id,
    population: city.population,
    group: city.group,
    culture: 0,
    visual: {...city.visual}
  }))];
  const context = createCityScaleContext(cities, burgs);
  for (const city of cities) {
    const burg = burgs[city.burgId];
    city.group = burg.group = deriveCityScale(city, context, burg);
    city.visual = defaultCityVisual(city, null, context, burg);
    burg.visual = {...city.visual};
  }
  cities[6].visual = {...manualVisual};
  burgs[7].visual = {...manualVisual};
  return {
    settlements: {cities, metadata: {cities: cities.length, capitals: 0, ports: 0, maxPopulation: 9, packBurgs: 10}},
    pack: {burgs, cultures: []},
    society: {cultures: []},
    politics: {states: []}
  };
}

function assertCityBurgScaleParity(map) {
  const context = createCityScaleContext(map.settlements.cities, map.pack.burgs);
  for (const city of map.settlements.cities.filter(Boolean)) {
    const burg = map.pack.burgs[city.burgId];
    const expected = deriveCityScale(city, context, burg);
    assert.equal(city.group, expected);
    assert.equal(burg.group, expected);
  }
}

function groupVisualFingerprint(map) {
  return JSON.stringify({
    cities: map.settlements.cities.map(city => city && ({population: city.population, group: city.group, visual: city.visual})),
    burgs: map.pack.burgs.map(burg => burg && ({population: burg.population, group: burg.group, visual: burg.visual}))
  });
}
