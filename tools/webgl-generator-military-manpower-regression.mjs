import assert from "node:assert/strict";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {inspectManpower, manpowerBudget, manpowerContext, manpowerFitness} from "../app/webgl-generator/src/generator/military-manpower.js";
import {createSetMilitaryManpowerCommand} from "../app/webgl-generator/src/runtime/military-edit-commands.js";
import {captureCommandMapReplicaWrites} from "../app/webgl-generator/src/runtime/map-replica-command-patch.js";
import {createMapDocument, stringifyMapDocument, parseMapDocument} from "../app/webgl-generator/src/runtime/map-file-io.js";

const rider = {i: 0, id: "1:0", state: 1, cell: 0, a: 1000, u: {cavalry: 1000}, dominantUnit: "cavalry"};
const state = {i: 1, rural: 80, urban: 20, military: [rider, {...rider, i: 1, id: "1:1", a: 500, u: {cavalry: 500}}], militaryPolicy: {}};
const pack = {states: [null, state], military: {metadata: {troops: 1500}},
  cultures: [null, {type: "Nomadic"}, {type: "Generic"}], religions: [null, {type: "Folk"}, {type: "Organized"}],
  cells: {state: [1, 2], culture: [1, 2], religion: [1, 2], h: [30, 30], pop: [80, 99000], biome: [2, 2]},
  burgs: [null, {i: 1, state: 1, cell: 0, culture: 2, religion: 2, population: 20}]};
const map = {pack, politics: {states: structuredClone(pack.states)}, military: structuredClone(pack.military)};
const context = manpowerContext(pack, state, rider);
assert.equal(context.population, 100000);
assert.equal(context.limits.cavalry, 80 * 78 + 20 * 15);
assert.equal(context.limits.total, 80 * 95 + 20 * 60);
const max = context.limits.cavalry - context.others.cavalry;
const target = {id: rider.id};
function score(context, cavalry) {
  const p = inspectManpower(context, {cavalry});
  return manpowerFitness(pack, rider, p.units, context.limits, p.national, p.nationalTotal).suitability.total;
}
assert.ok(score(context, 500) > score(context, max - 300) && score(context, max - 300) > score(context, max));
assert.ok(score(context, max) <= 0.2);
for (const value of ["", null, -1, 0.1, Infinity, NaN, "1e3", true, max + 1]) {
  assert.ok(inspectManpower(context, {cavalry: value}).error);
}
assert.ok(inspectManpower(context, {fleet: 2}).error);
assert.ok(inspectManpower(context, {cavalry: max, infantry: 3000}).error);
assert.equal(inspectManpower(context, {cavalry: 0}).error, "");
assert.equal(createSetMilitaryManpowerCommand(target, {cavalry: 1000}).isNoop({map}), true);
const before = structuredClone(map);
assert.throws(() => createSetMilitaryManpowerCommand(target, {cavalry: max + 1}).apply({map}), /额度/);
assert.deepEqual(map, before);
const command = createSetMilitaryManpowerCommand(target, {cavalry: max});
command.apply({map});
assert.equal(rider.a, max);
assert.equal(rider.suitability.total, score(context, max));
assert.ok(state.military[1].suitability.total <= 0.2);
assert.equal(state.militaryPolicy.generatedTroops, max + 500);
assert.equal(pack.military.metadata.troops, max + 500);
assert.deepEqual(map.politics.states[1], state);
const writes = captureCommandMapReplicaWrites({map, command});
for (const domain of ["pack", "politics"]) assert.equal(writes.find(w => w.path === `${domain}.states.1.military.0.a`).value, max);
const after = structuredClone(map);
command.revert({map}); assert.deepEqual(map, before);
command.apply({map}); assert.deepEqual(map, after);
state.military[0].u.cavalry = state.military[0].a = 33333;
const legacy = manpowerContext(pack, state, rider);
assert.equal(inspectManpower(legacy, {cavalry: 30000}).error, "");
assert.ok(inspectManpower(legacy, {cavalry: 33334}).error);
const fallback = manpowerBudget({cells: {}}, {i: 1, rural: 100, type: "Nomadic"});
assert.equal(fallback.limits.cavalry, 7500);
assert.equal(manpowerBudget({cells: {}}, {i: 1}).limits.total, 0);
const legacyRider = {i: 0, state: 1, cell: 0, a: 500, dominantUnit: "cavalry", iconVariant: "horse-archers"};
const oldState = {i: 1, type: "Nomadic", rural: 100, military: [legacyRider]};
const oldMap = {pack: {states: [null, oldState], cells: {h: [30]}}};
const reduce = createSetMilitaryManpowerCommand(target, {cavalry: 499});
reduce.apply({map: oldMap});
assert.deepEqual(legacyRider.u, {cavalry: 499});
assert.equal(legacyRider.iconVariant, "horse-archers");
reduce.revert({map: oldMap});
assert.equal(legacyRider.a, 500);
assert.ok(!Object.hasOwn(legacyRider, "u"));

const samples = [];
for (const seed of ["stage-2-1", "manpower-coast", "manpower-steppe"]) {
  const generated = generatePlaceholderMap({seed, cellsTarget: 3000, heightmapTemplate: "continents"});
  const countries = generated.pack.states.filter(s => s?.i && s.military?.length);
  let overTotal = 0, overUnit = 0;
  for (const country of countries) {
    const unit = country.military[0], limits = manpowerContext(generated.pack, country, unit);
    const current = inspectManpower(limits, {});
    if (current.nationalTotal > limits.limits.total) overTotal++;
    if (Object.entries(current.national).some(([name, used]) => used > limits.limits[name])) overUnit++;
  }
  samples.push({seed, countries: countries.length, overTotal, overUnit});
  assert.equal(overTotal, 0, seed);
  assert.equal(overUnit, 0, seed);
  if (seed === "stage-2-1") {
    const country = countries[0], r = country.military[0], key = Object.keys(r.u).find(k => r.u[k] > 0);
    const cmd = createSetMilitaryManpowerCommand({stateId: country.i, regimentId: r.i}, {[key]: r.u[key] - 1});
    cmd.apply({map: generated});
    const restored = parseMapDocument(stringifyMapDocument(createMapDocument(generated, generated.options))).map;
    const reopened = restored.pack.states[country.i].military.find(v => v.i === r.i);
    assert.deepEqual([reopened.a, reopened.u, reopened.suitability], [r.a, r.u, r.suitability]);
  }
}
console.log(JSON.stringify({samples, atLimit: score(context, max)}, null, 2));
