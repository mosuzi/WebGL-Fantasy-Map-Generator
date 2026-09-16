import assert from "node:assert/strict";
import {cityPowerContribution, collectCityPower} from "../app/webgl-generator/src/generator/city-power.js";
import {refreshPoliticalEconomicPower} from "../app/webgl-generator/src/generator/economy.js";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {createRebuildEconomyCommand} from "../app/webgl-generator/src/runtime/economy-edit-commands.js";
import {createSetCityAttributeCommand} from "../app/webgl-generator/src/runtime/city-attribute-commands.js";
import {createSetCityPopulationCommand} from "../app/webgl-generator/src/runtime/city-edit-commands.js";
import {createMapDocument, parseMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";

const pack = {states: [null, {i: 1, rural: 20, urban: 10, area: 10, treasury: 20}, {i: 2, rural: 20, urban: 10, area: 10, treasury: 20}], provinces: [null, {i: 1, rural: 20, urban: 10, area: 10}, {i: 2, rural: 20, urban: 10, area: 10}],
  burgs: [null, {i: 1, state: 1, cell: 1, population: 10, product: 10, treasury: 10}, {i: 2, state: 2, province: 2, cell: 2, population: 10, product: 10, treasury: 10}], cells: {province: [0, 1, 2]}, routes: []};
refreshPoliticalEconomicPower(pack);
assert.equal(pack.states[1].powerScore, pack.states[2].powerScore);
assert.equal(pack.provinces[1].powerScore, pack.provinces[2].powerScore);
const base = structuredClone(pack);
for (const key of ["capital", "plaza", "citadel", "walls", "port", "temple", "population", "product", "treasury"]) {
  const next = structuredClone(base);
  next.burgs[1][key] = ["population", "product", "treasury"].includes(key) ? 30 : 1;
  refreshPoliticalEconomicPower(next);
  assert.ok(next.states[1].powerScore > base.states[1].powerScore, `${key} 参与国力`);
  assert.ok(next.provinces[1].settlementPower > base.provinces[1].settlementPower, `${key} 参与省份实力`);
  const before = structuredClone(next);
  refreshPoliticalEconomicPower(next); assert.deepEqual(next, before, "重复计算无复利");
}
for (const field of ["population", "product", "treasury"]) {
  const f = value => cityPowerContribution({[field]: value});
  assert.ok(f(20) - f(10) > f(30) - f(20), `${field} 边际递减`);
}
assert.equal(cityPowerContribution({population: Infinity, product: -1, treasury: NaN}), 1);
assert.ok(cityPowerContribution({population: 1e30, product: 1e30, treasury: 1e30, capital: 1, plaza: 1, citadel: 1, walls: 1, port: 1, temple: 1}, 7) <= 7.31);
const linked = structuredClone(base);
linked.routes = [{i: 0, group: "roads", points: [[0, 0, 1], [0, 0, 2]]}];
const once = collectCityPower(linked);
linked.routes.push(...structuredClone(linked.routes)); assert.deepEqual(collectCityPower(linked), once);
assert.ok(once.states.get(1).weight > collectCityPower(base).states.get(1).weight);
assert.equal(cityPowerContribution({}, 4), 1, "无港城市不得凭海路加分");
assert.ok(cityPowerContribution({port: 1}, 4) > cityPowerContribution({port: 1}));
linked.burgs.push({...linked.burgs[1]}); assert.deepEqual(collectCityPower(linked), once, "重复身份只计一次");
linked.burgs[1].removed = true; linked.burgs.pop();
assert.equal(collectCityPower(linked).states.has(1), false);
const neutral = structuredClone(base); neutral.burgs[1].province = 0;
assert.equal(collectCityPower(neutral).provinces.has(1), false, "显式中立不回退所在格");
const locked = structuredClone(base); locked.burgs[1].citadel = 1;
refreshPoliticalEconomicPower(locked, {protectedStateIds: new Set([1]), protectedProvinceIds: new Set([1])});
assert.deepEqual(locked.states[1], base.states[1]); assert.deepEqual(locked.provinces[1], base.provinces[1]);
const empty = {states: [{i: 1}], provinces: [{i: 1}]}; refreshPoliticalEconomicPower(empty);
assert.equal(empty.states[0].settlementPower, 0); assert.ok(Number.isFinite(empty.states[0].powerScore));
const map = generatePlaceholderMap({seed: "city-power-385", cellsTarget: 3000, heightmapTemplate: "continents"});
map.politics.states = structuredClone(map.pack.states); map.politics.provinces = structuredClone(map.pack.provinces);
const city = map.settlements.cities.find(c => c?.state > 0 && c.province > 0), state = city.state, province = city.province;
delete map.pack.states[state].settlementPower; delete map.politics.states[state].settlementPower;
const score = map.politics.states[state].powerScore;
createSetCityAttributeCommand(city.id, "citadel", !city.citadel).apply({map});
createSetCityPopulationCommand(city.id, city.population + 20).apply({map});
assert.equal(map.politics.states[state].powerScore, score, "修改属性和人口不得立即重算国力");
const before = structuredClone(map), history = new EditHistory();
history.execute(createRebuildEconomyCommand(), {map});
assert.equal(history.getStats().undo, 1);
assert.equal(map.politics.states[state].settlementPower, map.pack.states[state].settlementPower);
assert.equal(map.politics.provinces[province].powerScore, map.pack.provinces[province].powerScore);
const after = structuredClone(map);
history.undo({map}); assert.deepEqual(map, before);
history.redo({map}); assert.deepEqual(map, after);
const restored = parseMapDocument(stringifyMapDocument(createMapDocument(map))).map;
assert.equal(restored.politics.states[state].settlementPower, map.politics.states[state].settlementPower);
console.log(JSON.stringify({ok: true, factors: 9, diminishing: 3, deduplicatedRoutes: true, protected: true, deferred: true, history: true, persistence: true}));
