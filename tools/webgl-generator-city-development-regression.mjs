import assert from "node:assert/strict";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {cityDevelopmentEffects, cityRoadPriority, estimateCityPopulationPotential} from "../app/webgl-generator/src/generator/city-development.js";
import {buildEconomy} from "../app/webgl-generator/src/generator/economy.js";
import {buildMilitary} from "../app/webgl-generator/src/generator/military.js";
import {finalizeSettlements} from "../app/webgl-generator/src/generator/settlements.js";
import {createSetCityAttributeCommand} from "../app/webgl-generator/src/runtime/city-attribute-commands.js";
import {createMapDocument, parseMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";

const options = {seed: "city-development-383", cellsTarget: 3000, heightmapTemplate: "continents"};
const map = generatePlaceholderMap(options);
const city = map.settlements.cities.find(city => city && !city.capital && city.state > 0);
const burg = map.pack.burgs[city.burgId];
const neutral = {i: burg.i, cell: burg.cell, population: 10};
const populationFactors = {capital: 1.5, plaza: 1.25, citadel: 1.05, walls: 1.1, port: 1.2, temple: 1.1};
for (const [key, factor] of Object.entries(populationFactors)) {
  assert.equal(cityDevelopmentEffects({...neutral, [key]: 1}).population, factor);
  assert.ok(estimateCityPopulationPotential(map.pack, {...neutral, [key]: 1}, options.seed) >= estimateCityPopulationPotential(map.pack, neutral, options.seed));
}
assert.equal(cityDevelopmentEffects({}).population, 1);
assert.equal(cityDevelopmentEffects({}).economy, 1);
assert.equal(cityDevelopmentEffects({citadel: 1, walls: 1}).landRecruitment, 1.45);
assert.ok(cityRoadPriority({...neutral, plaza: 1}) > cityRoadPriority(neutral));
const potential = estimateCityPopulationPotential(map.pack, city, options.seed);
assert.equal(estimateCityPopulationPotential(map.pack, {...city, population: 99999999}, options.seed), potential);
const existing = () => structuredClone({population: map.settlements.cities.map(city => city?.population), economy: map.economy, routes: map.settlements.routes, military: map.military});
for (const key of ["plaza", "citadel", "walls", "temple"]) {
  const before = existing();
  const command = createSetCityAttributeCommand(city.id, key, !Boolean(city[key]));
  command.apply({map}); assert.deepEqual(existing(), before);
  command.revert({map}); assert.deepEqual(existing(), before);
}
const raw = structuredClone(map.pack);
raw.burgs[burg.i].plaza = 0;
const enhanced = structuredClone(raw);
enhanced.burgs[burg.i].plaza = 1;
buildEconomy(raw, options); buildEconomy(enhanced, options);
assert.equal(raw.burgs[burg.i].plaza, 0);
assert.equal(enhanced.burgs[burg.i].plaza, 1);
assert.ok(enhanced.burgs[burg.i].product > raw.burgs[burg.i].product);
assert.ok(enhanced.burgs[burg.i].treasury > raw.burgs[burg.i].treasury);
assert.ok(enhanced.burgs[burg.i].production.find(record => record.goodId)?.units > raw.burgs[burg.i].production.find(record => record.goodId)?.units);
const product = enhanced.burgs[burg.i].product;
buildEconomy(enhanced, options);
assert.equal(enhanced.burgs[burg.i].product, product, "重复经济重算不能复利");
for (const facility of ["walls", "temple"]) {
  const before = structuredClone(map.pack), after = structuredClone(map.pack);
  before.burgs[burg.i][facility] = 0;
  after.burgs[burg.i][facility] = 1;
  buildEconomy(before, options); buildEconomy(after, options);
  assert.ok(after.states[burg.state].treasury > before.states[burg.state].treasury, `${facility} 交易加成须进入国家税收`);
  const treasury = after.states[burg.state].treasury;
  buildEconomy(after, options);
  assert.equal(after.states[burg.state].treasury, treasury, "国家税收重复重算不能复利");
}
const armyBefore = structuredClone(map.pack), armyAfter = structuredClone(map.pack);
for (const item of armyBefore.burgs) if (item?.i) {item.citadel = 0; item.walls = 0;}
for (const item of armyAfter.burgs) if (item?.i) {item.citadel = 1; item.walls = 1;}
const militaryBefore = buildMilitary(armyBefore, options), militaryAfter = buildMilitary(armyAfter, options);
assert.notDeepEqual(armyAfter.states.flatMap(state => state?.military || []), armyBefore.states.flatMap(state => state?.military || []), "军事生成须消费防御设施");
for (const state of armyAfter.states) if (state?.militaryPolicy) assert.ok(state.militaryPolicy.generatedTroops <= state.militaryPolicy.capTroops);
city.plaza = burg.plaza = 1;
city.population = burg.population = 10000;
finalizeSettlements(map.grid, map.features, map.politics, map.settlements, map.pack, options);
assert.ok(map.settlements.routes.some(route => route.type === "road" && route.packCells?.includes(city.packCell)), "贸易中心须进入正式主干路网");
for (const route of map.settlements.routes.filter(route => route.type !== "searoute")) assert.ok(route.packCells.every(cell => map.pack.cells.h[cell] >= 20));
const restored = parseMapDocument(stringifyMapDocument(createMapDocument(map))).map;
assert.equal(restored.settlements.cities[city.id].plaza, 1);
assert.equal(estimateCityPopulationPotential(restored.pack, restored.settlements.cities[city.id], options.seed), estimateCityPopulationPotential(map.pack, city, options.seed));
console.log(JSON.stringify({ok: true, city: city.id, properties: 6, deferred: true, economy: {before: raw.burgs[burg.i].product, after: product}, military: militaryAfter.metadata.regiments, routes: map.settlements.routes.length, persistence: true}));
