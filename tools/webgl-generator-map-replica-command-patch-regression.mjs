import assert from "node:assert/strict";
import {captureCommandMapReplicaWrites, captureCommandMapReplicaWritesAsync, createCommandMapReplicaPatch, listCommandMapReplicaPaths} from "../app/webgl-generator/src/runtime/map-replica-command-patch.js";
import {applyMapReplicaPatch} from "../app/webgl-generator/src/runtime/map-replica-journal.js";
import {computeAppliedMapReplicaPatchTargetChecksum, computeCanonicalMapReplicaChecksum} from "../app/webgl-generator/src/runtime/map-replica-checksum.js";
import {createDeleteMeasurementCommand, createImportMeasurementsCommand, createRenameMeasurementCommand, createUpdateMeasurementPointsCommand} from "../app/webgl-generator/src/runtime/measurement-edit-commands.js";
import {editableMeasurementStore} from "../app/webgl-generator/src/runtime/measurement-objects.js";
import {createRenameObjectCommand} from "../app/webgl-generator/src/runtime/object-edit-commands.js";
import {createApplyHeightBrushCommand} from "../app/webgl-generator/src/runtime/height-edit-commands.js";
import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {createApplyStateBrushCommand} from "../app/webgl-generator/src/runtime/state-edit-commands.js";
import {applyProvinceBrushPreview, createApplyProvinceBrushCommand, indexProvinceBrushMembers} from "../app/webgl-generator/src/runtime/province-edit-commands.js";
import {buildBiomeAssignmentChanges, createApplyBiomeAssignmentCommand} from "../app/webgl-generator/src/runtime/biome-edit-commands.js";

const source = {
  visualTheme: {preset: "old"},
  grid: {cells: {pop: [1, 2], state: [0, 1], province: [0, 2], region: [-1, 3], burg: [0, -1]}},
  pack: {cells: {pop: new Float32Array([1, 2]), state: new Uint16Array([0, 1]), province: new Uint16Array([0, 2]), region: [-1, 3], burg: new Uint16Array([1, 0])}, burgs: [null, {id: 1, cityId: 0, name: "旧城"}]},
  settlements: {cities: [{id: 0, burgId: 1, name: "旧城"}], metadata: {count: 1}},
  politics: {states: [], provinces: [], regions: []},
  metadata: {derivedStale: {systems: []}},
  military: {metadata: {stale: false}}, zones: {metadata: {stale: false}}, markers: {metadata: {stale: false}},
  economy: {metadata: {stale: false}}, diplomacy: {metadata: {stale: false}}
};
source.pack.states = source.politics.states;
source.pack.provinces = source.politics.provinces;
const target = structuredClone(source);
const land = {metadata: {}, military: {metadata: {}}, grid: {cells: {h: [21, 20, 26]}}, pack: {cells: {g: [0, 1, 1, 2], h: [21, 20, 22, 26]}}};
const background = structuredClone(land);
const untouched = background.pack.cells.h;
const stroke = createApplyHeightBrushCommand([{gridCell: 1, before: 20, after: 16}], {originalPackHeights: new Map()});
let landChecksum = await computeCanonicalMapReplicaChecksum(land);
for (const [baseRevision, action] of ["apply", "revert", "apply"].entries()) {
  stroke[action]({map: land});
  const patch = await createCommandMapReplicaPatch({map: land, command: stroke, mapIdentity: "shore",
    baseRevision, targetRevision: baseRevision + 1, baseChecksum: landChecksum});
  assert.deepEqual(patch.writes.filter(write => write.mode === "ranges").map(write => [write.path, write.ranges[0].start, write.ranges[0].values.length]),
    [["grid.cells.h", 1, 1], ["pack.cells.h", 1, 2]]);
  applyMapReplicaPatch(background, patch);
  assert.deepEqual(background, land);
  assert.equal(background.pack.cells.h, untouched);
  landChecksum = await computeAppliedMapReplicaPatchTargetChecksum(background, patch);
  assert.equal(landChecksum, patch.targetChecksum);
}
const measured = {};
const brushMap = generatePlaceholderMap({cellsTarget: 3000, seed: "all-brush-journal", heightmapTemplate: "continents"});
for (const kind of ["province", "biome", "state", "new-capital", "retire"]) {
  const map = structuredClone(brushMap);
  map.pack.provinces = structuredClone(map.politics.provinces);
  map.pack.states = structuredClone(map.politics.states);
  const cells = map.grid.cells;
  const city = kind === "new-capital" || kind === "retire"
    ? map.settlements.cities.find(city => city.capital && cells.state[city.cell] === city.state)
    : map.settlements.cities.find(city => !city.capital && city.province > 0 && map.politics.provinces.some(p => p?.i && p.i !== city.province && p.state === city.state));
  const cell = city.cell;
  const owner = city.state;
  const target = map.politics.states.find(s => s?.i && s.i !== owner).i;
  let command;
  if (kind === "province") {
    const other = map.politics.provinces.find(p => p?.i && p.i !== city.province && p.state === owner);
    const changes = Array.from(cells.i).filter(id => cells.province[id] === city.province && cells.h[id] >= 20)
      .slice(0, 48).map(gridCell => ({gridCell, before: city.province, after: other.i}));
    assert.ok(changes.length);
    const indexed = structuredClone(map), reference = structuredClone(map);
    const memberIndex = indexProvinceBrushMembers(indexed), originals = new Map();
    applyProvinceBrushPreview(indexed, changes, originals);
    const indexedCommand = createApplyProvinceBrushCommand(changes, {memberIndex, originalPackProvinces: originals});
    const directCommand = createApplyProvinceBrushCommand(changes);
    for (const action of ["apply", "revert", "apply"]) {
      indexedCommand[action]({map: indexed});
      directCommand[action]({map: reference});
      assert.deepEqual(indexed.politics.provinces, reference.politics.provinces, "局部遍历应保留省份统计、邻接顺序与标注位置");
      assert.deepEqual(indexed.pack.provinces, reference.pack.provinces);
    }
    command = createApplyProvinceBrushCommand([{gridCell: cell, before: city.province, after: other.i}]);
  } else if (kind === "biome") {
    command = createApplyBiomeAssignmentCommand(buildBiomeAssignmentChanges(map, cells.biome[cell] === 1 ? 2 : 1, [cell]));
  } else {
    if (kind === "new-capital") {
      for (const other of map.settlements.cities) {
        if (other === city || other.state !== owner) continue;
        other.state = target;
        map.pack.burgs[other.burgId].state = target;
      }
    }
    const ids = kind === "retire" ? Array.from(cells.i).filter(id => cells.state[id] === owner) : [cell];
    command = createApplyStateBrushCommand(ids.map(gridCell => ({gridCell, before: cells.state[gridCell], after: target})));
  }
  const before = structuredClone(map);
  const replica = structuredClone(map);
  let after;
  let checksum = await computeCanonicalMapReplicaChecksum(map);
  for (const [revision, action] of ["apply", "revert", "apply"].entries()) {
    command[action]({map});
    if (revision === 0) after = structuredClone(map);
    const patch = await createCommandMapReplicaPatch({map, command, mapIdentity: kind, baseRevision: revision, targetRevision: revision + 1, baseChecksum: checksum});
    if (kind === "new-capital") assert.ok(patch.writes.some(write => write.path === "settlements.cities" && write.mode === "splice"));
    if (kind === "retire" && action === "apply") assert.ok(map.politics.states[owner].removed);
    assert.ok(patch.writes.every(write => write.mode !== "replace"));
    applyMapReplicaPatch(replica, patch);
    checksum = patch.targetChecksum;
    for (const section of ["grid", "pack", "politics", "settlements", "climate", "metadata", "military", "zones", "markers", "economy", "diplomacy"]) {
      assert.deepEqual(map[section], replica[section], `${kind} ${action} 的 ${section} 副本不一致`);
      if (action === "revert") assert.deepEqual(map[section], before[section], `${kind} 没有还原 ${section}`);
      if (revision === 2) assert.deepEqual(map[section], after[section], `${kind} 重做没有复现 ${section}`);
    }
  }
}
const annotations = editableMeasurementStore(measured);
const importLines = points => createImportMeasurementsCommand([{points}]);
importLines([[1, 1], [2, 2]]).apply({map: measured});
const receivedMeasurements = structuredClone(measured);
const firstLine = annotations.items[0], firstReplicaLine = receivedMeasurements.measurements.items[0];
let rev = 0;
for (const edit of [importLines([[3, 3], [4, 4]]), createRenameMeasurementCommand("measurement-2", "山道"),
  createUpdateMeasurementPointsCommand("measurement-2", [[3, 3], [4, 5]]), createDeleteMeasurementCommand("measurement-2")]) {
  for (const action of ["apply", "revert", "apply"]) {
    edit[action]({map: measured});
    const patch = await createCommandMapReplicaPatch({map: measured, command: edit, mapIdentity: "lines",
      baseRevision: rev, targetRevision: ++rev, baseChecksum: "lines"});
    assert.ok(patch.writes.every(write => write.path !== "measurements"));
    applyMapReplicaPatch(receivedMeasurements, patch);
    assert.equal(await computeAppliedMapReplicaPatchTargetChecksum(receivedMeasurements, patch), patch.targetChecksum);
    assert.deepEqual(measured, receivedMeasurements);
    assert.equal(annotations.items[0], firstLine);
    assert.equal(receivedMeasurements.measurements.items[0], firstReplicaLine);
  }
}
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
target.settlements.cities.push({id: 1, burgId: 2, name: "新都"});
target.settlements.metadata.count = 2;
target.pack.burgs.push({id: 2, i: 2, cityId: 1, name: "新都"});
target.pack.cells.burg[1] = 2;
target.grid.cells.burg[1] = 1;
target.metadata.derivedStale = {systems: ["military", "zones", "state-markers", "economy", "diplomacy"]};
for (const system of ["military", "zones", "markers", "economy", "diplomacy"]) target[system].metadata.stale = true;
const statePatch = await createCommandMapReplicaPatch({
  map: target,
  command: {domain: "state"},
  action: "undo",
  mapIdentity: "map-a",
  baseRevision: 1,
  targetRevision: 2,
  baseChecksum: checksum
});
assert.deepEqual(statePatch.writes.map(write => write.path), listCommandMapReplicaPaths("state"));
applyMapReplicaPatch(source, statePatch);
assert.equal(source.settlements.cities[1].burgId, 2, "建国城市没有同步到地图副本");
assert.equal(source.pack.burgs[2].cityId, 1, "建国城镇没有同步到地图副本");
assert.equal(source.pack.cells.burg[1], 2, "建国 cell 镜像没有同步到地图副本");
assert.equal(source.grid.cells.burg[1], 1, "建国 grid 镜像没有同步到地图副本");
for (const system of ["military", "zones", "markers", "economy", "diplomacy"]) assert.equal(source[system].metadata.stale, true, `${system} 派生过期标记没有同步到地图副本`);
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
