import assert from "node:assert/strict";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {createSetCityPopulationCommand} from "../app/webgl-generator/src/runtime/city-edit-commands.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {captureCommandMapReplicaWrites} from "../app/webgl-generator/src/runtime/map-replica-command-patch.js";
import {peopleToPopulationUnits, populationUnitsToPeople} from "../app/webgl-generator/src/ui/display-units.js";
import {createMapDocument, parseMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";

const map = generatePlaceholderMap({seed: "city-population-384", cellsTarget: 3000, heightmapTemplate: "continents"});
const city = map.settlements.cities.find(city => city?.state > 0 && city?.province > 0);
const burg = map.pack.burgs[city.burgId];
for (const key of ["states", "provinces", "cultures", "religions"]) map.pack[key] = structuredClone(map.pack[key]);
delete map.politics.provinces[city.province].urban;
delete city.population;
delete map.settlements.metadata.totalPopulation;
city.visual = {...city.visual, manual: true, silhouette: "hamlet"};
const base = structuredClone(map), history = new EditHistory();
const groups = [["state", "politics", "states"], ["province", "politics", "provinces"], ["culture", "society", "cultures"], ["religion", "society", "religions"]];
for (const scale of [.1, 1, 1.1, 10]) {
  for (const people of [0, 1, 123457, 1000000000]) {
    const units = peopleToPopulationUnits(people, {populationScale: scale});
    assert.equal(Math.round(populationUnitsToPeople(units, {populationScale: scale})), people);
    const command = createSetCityPopulationCommand(city.id, units);
    const count = history.getStats().undo;
    history.execute(command, {map});
    assert.equal(history.getStats().undo, count + 1);
    assert.equal(map.settlements.cities[city.id].population, units);
    assert.equal(map.pack.burgs[city.burgId].population, units);
    for (const [key, domain, collection] of groups) {
      const id = city[key] ?? burg[key] ?? map.pack.cells[key][city.packCell];
      const expected = map.settlements.cities.filter(item => item && !item.removed && !map.pack.burgs[item.burgId]?.removed && (item[key] ?? map.pack.burgs[item.burgId]?.[key] ?? map.pack.cells[key][item.packCell] ?? 0) === id).reduce((sum, item) => sum + (item.population ?? map.pack.burgs[item.burgId].population), 0);
      assert.ok(Math.abs(map[domain][collection][id].urban - expected) < .000001);
      assert.equal(map[domain][collection][id].urban, map.pack[collection][id].urban);
      assert.equal(map[domain][collection][id].rural, base[domain][collection][id].rural);
    }
    assert.deepEqual(map.pack.cells.pop, base.pack.cells.pop);
    assert.deepEqual(map.economy, base.economy);
    assert.deepEqual(map.military, base.military);
    assert.deepEqual(map.settlements.routes, base.settlements.routes);
    assert.equal(map.settlements.cities[city.id].visual.silhouette, "hamlet");
    const committed = structuredClone(map);
    assert.equal(createSetCityPopulationCommand(city.id, units).isNoop({map}), true);
    const writes = captureCommandMapReplicaWrites({map, command});
    assert.ok(writes.some(write => write.path === "society.cultures"));
    assert.ok(writes.some(write => write.path === "pack.religions"));
    history.undo({map}); assert.deepEqual(map, base, "旧字段及独立镜像精确撤销");
    history.redo({map}); assert.deepEqual(map, committed);
    history.undo({map});
  }
}
for (const invalid of [null, undefined, "", " ", NaN, Infinity, -1, 1e30, true]) {
  assert.throws(() => history.execute(createSetCityPopulationCommand(city.id, invalid), {map}));
  assert.deepEqual(map, base);
}
for (const invalid of ["", " ", -1, .5, 1000000001, Infinity]) assert.ok(Number.isNaN(peopleToPopulationUnits(invalid)));
assert.throws(() => history.execute(createSetCityPopulationCommand(city.id, 321, {faultInjector() {throw Error("故障注入");}}), {map}), /故障注入/);
assert.deepEqual(map, base);
const missing = structuredClone(base); delete missing.pack.burgs[city.burgId];
assert.throws(() => createSetCityPopulationCommand(city.id, 1).isNoop({map: missing}));
const deleted = structuredClone(base); deleted.settlements.cities[city.id].removed = true;
assert.throws(() => createSetCityPopulationCommand(city.id, 1).apply({map: deleted}));
const neutral = structuredClone(base);
Object.assign(neutral.settlements.cities[city.id], {state: 0, province: 0, culture: 0, religion: 0});
delete neutral.pack.provinces[0];
const neutralBefore = structuredClone(neutral), neutralCommand = createSetCityPopulationCommand(city.id, 0);
neutralCommand.apply({map: neutral}); neutralCommand.revert({map: neutral}); assert.deepEqual(neutral, neutralBefore);
history.execute(createSetCityPopulationCommand(city.id, 123.456789), {map});
const restored = parseMapDocument(stringifyMapDocument(createMapDocument(map))).map;
assert.equal(restored.settlements.cities[city.id].population, 123.456789);
assert.equal(restored.politics.provinces[city.province].urban, map.politics.provinces[city.province].urban);
console.log(JSON.stringify({ok: true, city: city.id, scales: [.1, 1, 1.1, 10], transactions: 16, mirrors: 8, rollback: true, persistence: true}));
