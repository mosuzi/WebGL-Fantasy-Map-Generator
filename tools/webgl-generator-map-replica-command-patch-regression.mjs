import assert from "node:assert/strict";
import {captureCommandMapReplicaWrites, captureCommandMapReplicaWritesAsync, createCommandMapReplicaPatch, listCommandMapReplicaPaths} from "../app/webgl-generator/src/runtime/map-replica-command-patch.js";
import {applyMapReplicaPatch} from "../app/webgl-generator/src/runtime/map-replica-journal.js";
import {computeAppliedMapReplicaPatchTargetChecksum, computeCanonicalMapReplicaChecksum} from "../app/webgl-generator/src/runtime/map-replica-checksum.js";
import {createRenameObjectCommand} from "../app/webgl-generator/src/runtime/object-edit-commands.js";

const source = {
  visualTheme: {preset: "old"},
  grid: {cells: {pop: [1, 2], state: [0, 1], province: [0, 2], region: [-1, 3]}},
  pack: {cells: {pop: new Float32Array([1, 2]), state: new Uint16Array([0, 1]), province: new Uint16Array([0, 2]), region: [-1, 3], burg: new Uint16Array([1, 0])}, burgs: [null, {id: 1, cityId: 0, name: "旧城"}]},
  settlements: {cities: [{id: 0, burgId: 1, name: "旧城"}], metadata: {count: 1}},
  politics: {states: [], provinces: [], regions: []}
};
source.pack.states = source.politics.states;
source.pack.provinces = source.politics.provinces;
const target = structuredClone(source);
target.pack.states = target.politics.states;
target.pack.provinces = target.politics.provinces;
target.visualTheme = {preset: "new"};
let checksum = await computeCanonicalMapReplicaChecksum(source, {revision: 0});
const visualPatch = await createCommandMapReplicaPatch({
  map: target,
  command: {domain: "visual-theme"},
  mapIdentity: "map-a",
  baseRevision: 0,
  targetRevision: 1,
  baseChecksum: checksum
});
assert.deepEqual(visualPatch.writes.map(write => write.path), ["visualTheme"]);
assert.equal(visualPatch.baseChecksum, checksum);
assert.match(visualPatch.targetChecksum, /^r1:[0-9a-f]{16}$/u);
assert.notEqual(visualPatch.targetChecksum, checksum);
applyMapReplicaPatch(source, visualPatch);
assert.equal(await computeAppliedMapReplicaPatchTargetChecksum(source, visualPatch), visualPatch.targetChecksum);
source.visualTheme = {preset: "tampered"};
assert.notEqual(await computeAppliedMapReplicaPatchTargetChecksum(source, visualPatch), visualPatch.targetChecksum, "Worker 实际写集漂移必须产生不同 checksum");
source.visualTheme = {preset: "new"};
checksum = visualPatch.targetChecksum;
assert.deepEqual(source.visualTheme, {preset: "new"});

target.grid.cells.state = [2, 2];
target.pack.cells.state = new Uint16Array([2, 2]);
target.politics.states = [{id: 2}];
target.pack.states = target.politics.states;
const statePatch = await createCommandMapReplicaPatch({
  map: target,
  command: {domain: "state"},
  action: "undo",
  mapIdentity: "map-a",
  baseRevision: 1,
  targetRevision: 2,
  baseChecksum: checksum
});
assert.deepEqual(statePatch.writes.map(write => write.path), ["politics.states", "grid.cells.state", "pack.cells.state", "settlements.cities"]);
const workerPatch = await createCommandMapReplicaPatch({
  map: target,
  command: {domain: "worker-routes", getReplicaPaths: () => ["pack.cells.state", "politics.states"]},
  mapIdentity: "map-a",
  baseRevision: 2,
  targetRevision: 3,
  baseChecksum: statePatch.targetChecksum
});
assert.deepEqual(workerPatch.writes.map(write => write.path), ["pack.cells.state", "politics.states"]);
target.settlements.cities[0].name = "新城";
target.pack.burgs[1].name = "新城";
const cityPatch = structuredClone(await createCommandMapReplicaPatch({
  map: target,
  command: {domain: "city"},
  mapIdentity: "map-a",
  baseRevision: 3,
  targetRevision: 4,
  baseChecksum: workerPatch.targetChecksum
}));
assert.deepEqual(cityPatch.writes.map(write => write.path), ["settlements.cities", "settlements.metadata", "pack.burgs", "pack.cells.burg", "politics.states", "pack.states", "politics.provinces", "pack.provinces"]);
applyMapReplicaPatch(source, cityPatch);
assert.equal(source.settlements.cities[0].name, "新城");
assert.equal(source.pack.burgs[1].name, "新城");
assert.equal(source.pack.states, source.politics.states);
assert.equal(source.pack.provinces, source.politics.provinces);
const preciseRename = createRenameObjectCommand({kind: "city", id: 0}, "精确行");
preciseRename.apply({map: target});
const precisePatch = await createCommandMapReplicaPatch({map: target, command: preciseRename, mapIdentity: "map-a", baseRevision: 4, targetRevision: 5, baseChecksum: cityPatch.targetChecksum});
assert.deepEqual(precisePatch.writes.map(write => write.path), ["settlements.cities.0", "pack.burgs.1"]);
assert.equal(await createCommandMapReplicaPatch({map: target, command: {domain: "editor"}, mapIdentity: "map-a", baseRevision: 2, targetRevision: 3, baseChecksum: cityPatch.targetChecksum}), null);
await assert.rejects(createCommandMapReplicaPatch({map: target, command: {domain: "visual-theme"}, mapIdentity: "map-a", baseRevision: 4, targetRevision: 5}), error => error?.code === "map_replica_checksum_missing");
assert.ok(listCommandMapReplicaPaths("politics").includes("grid.cells.province"));
assert.deepEqual(listCommandMapReplicaPaths("unknown"), []);

const sharedStates = Array.from({length: 10_000}, (_, id) => ({id, name: `state-${id}`}));
const asyncCaptureMap = {
  politics: {states: sharedStates},
  pack: {states: sharedStates},
  grid: {cells: {state: new Uint16Array(10_000)}}
};
let asyncCaptureYields = 0;
let asyncCapturePackets = 0;
let asyncCaptureMaxPacketMs = 0;
const asyncWrites = await captureCommandMapReplicaWritesAsync({
  map: asyncCaptureMap,
  command: {domain: "state", getReplicaPaths: () => ["politics.states", "pack.states", "grid.cells.state"]},
  budgetMs: 1,
  yieldToMain: async () => { asyncCaptureYields += 1; },
  isCurrent: () => true,
  onClone: ({packetStats}) => {
    asyncCapturePackets = packetStats.length;
    asyncCaptureMaxPacketMs = Math.max(0, ...packetStats.map(packet => packet.durationMs));
  }
});
assert.ok(asyncCaptureYields > 0, "异步副本写集捕获没有按预算让出主线程");
assert.ok(asyncCapturePackets > 1, "异步副本写集捕获没有形成分包");
assert.ok(asyncCaptureMaxPacketMs < 20, `异步副本单包 structuredClone 超过同步预算：${asyncCaptureMaxPacketMs.toFixed(3)}ms`);
assert.notEqual(asyncWrites[0].value, sharedStates, "异步副本写集捕获仍复用活动地图引用");
assert.equal(asyncWrites[0].value, asyncWrites[1].value, "异步副本写集捕获没有保留跨路径共享引用");
sharedStates[1].name = "mutated-after-capture";
assert.equal(asyncWrites[0].value[1].name, "state-1", "异步副本写集捕获会被后续活动地图修改污染");
const unregisteredCommand = {domain: "state", getReplicaPaths: () => ["__proto__.stale"]};
assert.throws(
  () => captureCommandMapReplicaWrites({map: asyncCaptureMap, command: unregisteredCommand}),
  error => error?.code === "map_replica_path_unregistered"
);
await assert.rejects(
  captureCommandMapReplicaWritesAsync({map: asyncCaptureMap, command: unregisteredCommand}),
  error => error?.code === "map_replica_path_unregistered"
);
await assert.rejects(
  captureCommandMapReplicaWritesAsync({
    map: asyncCaptureMap,
    command: {domain: "state", getReplicaPaths: () => ["politics.states"]},
    isCurrent: () => false
  }),
  error => error?.code === "map_replica_patch_capture_obsolete"
);

console.log(JSON.stringify({ok: true, visualWrites: visualPatch.writes.length, stateWrites: statePatch.writes.length, workerWrites: workerPatch.writes.length, cityWrites: cityPatch.writes.length, preciseCityWrites: precisePatch.writes.length, asyncCaptureYields, asyncCapturePackets, asyncCaptureMaxPacketMs: Number(asyncCaptureMaxPacketMs.toFixed(3))}));
