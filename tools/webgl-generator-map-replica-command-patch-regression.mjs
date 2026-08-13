import assert from "node:assert/strict";
import {createCommandMapReplicaPatch, listCommandMapReplicaPaths} from "../app/webgl-generator/src/runtime/map-replica-command-patch.js";
import {applyMapReplicaPatch} from "../app/webgl-generator/src/runtime/map-replica-journal.js";

const source = {
  visualTheme: {preset: "old"},
  grid: {cells: {pop: [1, 2], state: [0, 1], province: [0, 2], region: [-1, 3]}},
  pack: {cells: {pop: new Float32Array([1, 2]), state: new Uint16Array([0, 1]), province: new Uint16Array([0, 2]), region: [-1, 3]}},
  settlements: {cities: [{id: 0}]},
  politics: {states: [], provinces: [], regions: []}
};
const target = structuredClone(source);
target.visualTheme = {preset: "new"};
const visualPatch = createCommandMapReplicaPatch({
  map: target,
  command: {domain: "visual-theme"},
  mapIdentity: "map-a",
  baseRevision: 0,
  targetRevision: 1
});
assert.deepEqual(visualPatch.writes.map(write => write.path), ["visualTheme"]);
applyMapReplicaPatch(source, visualPatch);
assert.deepEqual(source.visualTheme, {preset: "new"});

target.grid.cells.state = [2, 2];
target.pack.cells.state = new Uint16Array([2, 2]);
target.politics.states = [{id: 2}];
const statePatch = createCommandMapReplicaPatch({
  map: target,
  command: {domain: "state"},
  action: "undo",
  mapIdentity: "map-a",
  baseRevision: 1,
  targetRevision: 2
});
assert.deepEqual(statePatch.writes.map(write => write.path), ["politics.states", "grid.cells.state", "pack.cells.state", "settlements.cities"]);
const workerPatch = createCommandMapReplicaPatch({
  map: target,
  command: {domain: "worker-routes", getReplicaPaths: () => ["pack.cells.state", "politics.states"]},
  mapIdentity: "map-a",
  baseRevision: 2,
  targetRevision: 3
});
assert.deepEqual(workerPatch.writes.map(write => write.path), ["pack.cells.state", "politics.states"]);
assert.equal(createCommandMapReplicaPatch({map: target, command: {domain: "editor"}, mapIdentity: "map-a", baseRevision: 2, targetRevision: 3}), null);
assert.ok(listCommandMapReplicaPaths("politics").includes("grid.cells.province"));
assert.deepEqual(listCommandMapReplicaPaths("unknown"), []);

console.log(JSON.stringify({ok: true, visualWrites: visualPatch.writes.length, stateWrites: statePatch.writes.length, workerWrites: workerPatch.writes.length}));
