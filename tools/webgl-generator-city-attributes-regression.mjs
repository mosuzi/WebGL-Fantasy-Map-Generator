import assert from "node:assert/strict";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {createSetCityAttributeCommand, inspectCityAttribute, readCityAttributeActions} from "../app/webgl-generator/src/runtime/city-attribute-commands.js";
import {createMapDocument, parseMapDocument, stringifyMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";

const map = generatePlaceholderMap({seed: "city-attributes-382", cellsTarget: 3000, heightmapTemplate: "continents"});
const history = new EditHistory();
const cities = map.settlements.cities.filter(city => city && !city.removed);
const snapshot = () => structuredClone({cities: map.settlements.cities, burgs: map.pack.burgs, states: map.politics.states, packStates: map.pack.states, metadata: map.settlements.metadata, routes: map.settlements.routes});
let checks = 0;
function roundtrip(city, key, enabled, verify) {
  const before = snapshot();
  const count = history.getStats().undo;
  const command = createSetCityAttributeCommand(city.id, key, enabled);
  assert.equal(command.isNoop({map}), false);
  history.execute(command, {map});
  assert.equal(history.getStats().undo, count + 1);
  verify?.();
  const after = snapshot();
  assert.equal(command.isNoop({map}), true);
  history.undo({map});
  assert.deepEqual(snapshot(), before, `${key} 撤销须逐字段恢复旧数据`);
  history.redo({map});
  assert.deepEqual(snapshot(), after, `${key} 重做须恢复同一结果`);
  history.undo({map});
  checks++;
}

const city = cities[0];
const burg = map.pack.burgs[city.burgId];
for (const key of ["citadel", "walls", "plaza", "temple"]) {
  const enabled = !Boolean(city[key] ?? burg[key]);
  roundtrip(city, key, enabled, () => {
    assert.equal(city[key], Number(enabled));
    assert.equal(burg[key], Number(enabled));
    assert.equal(readCityAttributeActions(map, city.id).find(item => item.key === key).active, enabled);
    const restored = parseMapDocument(stringifyMapDocument(createMapDocument(map))).map;
    assert.equal(Boolean(restored.settlements.cities[city.id][key]), enabled, `${key} 保存回读须保持城市属性`);
    assert.equal(Boolean(restored.pack.burgs[city.burgId][key]), enabled, `${key} 保存回读须保持镜像`);
  });
}
delete city.temple;
delete burg.temple;
roundtrip(city, "temple", true);
assert.equal(Object.hasOwn(city, "temple"), false, "旧档缺字段在撤销后仍须缺失");
const beforeFailure = snapshot();
assert.throws(() => history.execute(createSetCityAttributeCommand(city.id, "walls", !Boolean(city.walls), {faultInjector() {throw new Error("注入失败");}}), {map}), /注入失败/);
assert.deepEqual(snapshot(), beforeFailure, "提交失败须原子回滚");

const candidate = cities.find(item => !item.capital && inspectCityAttribute(map, item.id, "capital", true).valid);
assert.ok(candidate, "缺少迁都候选");
roundtrip(candidate, "capital", true, () => {
  assert.equal(map.politics.states[candidate.state].capital, candidate.burgId);
  assert.equal(map.pack.states[candidate.state].capital, candidate.burgId);
  assert.equal(cities.filter(item => item.state === candidate.state && item.capital).length, 1);
});
assert.equal(inspectCityAttribute(map, candidate.id, "capital", false).valid, false);

const portCandidate = cities.find(item => !item.port && inspectCityAttribute(map, item.id, "port", true).valid);
assert.ok(portCandidate, "缺少可设港城市");
roundtrip(portCandidate, "port", true, () => {
  assert.ok(portCandidate.port > 0);
  assert.equal(portCandidate.port, map.pack.burgs[portCandidate.burgId].port);
  assert.equal(map.pack.features[portCandidate.port].land, false);
});
const invalidPort = cities.find(item => !item.port && !inspectCityAttribute(map, item.id, "port", true).valid);
assert.ok(invalidPort, "缺少不可设港城市");
const beforeInvalid = snapshot();
assert.throws(() => history.execute(createSetCityAttributeCommand(invalidPort.id, "port", true), {map}), /港口条件/);
assert.deepEqual(snapshot(), beforeInvalid);
const connectedPort = cities.find(item => item.port && !inspectCityAttribute(map, item.id, "port", false).valid);
assert.ok(connectedPort, "缺少海路连接港口");
assert.match(inspectCityAttribute(map, connectedPort.id, "port", false).reason, /海路/);
const previousPort = connectedPort.port;
connectedPort.port = 0;
const legacyPortMap = parseMapDocument(stringifyMapDocument(createMapDocument(map))).map;
assert.equal(readCityAttributeActions(legacyPortMap, connectedPort.id).find(item => item.key === "port").active, true);
assert.equal(inspectCityAttribute(legacyPortMap, connectedPort.id, "port", false).valid, false, "旧档单边港口仍须保护连接海路");
assert.throws(() => createSetCityAttributeCommand(connectedPort.id, "port", false).apply({map: legacyPortMap}), /海路/);
assert.equal(legacyPortMap.pack.burgs[connectedPort.burgId].port, previousPort);
connectedPort.port = previousPort;
const enabledPortCommand = createSetCityAttributeCommand(portCandidate.id, "port", true);
history.execute(enabledPortCommand, {map});
roundtrip(portCandidate, "port", false);
history.undo({map});

history.execute(createSetCityAttributeCommand(city.id, "temple", true), {map});
const exported = stringifyMapDocument(createMapDocument(map));
const restored = parseMapDocument(exported).map;
assert.equal(restored.settlements.cities[city.id].temple, 1, "完整存档必须保留设施");
assert.equal(restored.pack.burgs[city.burgId].temple, 1);
console.log(JSON.stringify({ok: true, roundtrips: checks, candidate: candidate.id, portCandidate: portCandidate.id, invalidPort: invalidPort.id, connectedPort: connectedPort.id, rollback: true, legacyMissingField: true, persistence: true}));
