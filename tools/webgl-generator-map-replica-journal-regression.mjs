import assert from "node:assert/strict";
import {
  applyMapReplicaPatch,
  createMapReplicaJournal,
  createMapReplicaPatch
} from "../app/webgl-generator/src/runtime/map-replica-journal.js";

const map = {grid: {cells: {h: new Uint8Array([1, 2, 3, 4]), state: [0, 1, 1, 0]}}, metadata: {name: "甲"}};
const atomicMap = structuredClone(map);
assert.throws(() => applyMapReplicaPatch(atomicMap, {
  mapIdentity: "map-a", patchId: "atomic-bad", baseRevision: 0, targetRevision: 1,
  writes: [
    {path: "metadata.name", value: "不应留下"},
    {path: "grid.cells.h", mode: "ranges", ranges: [{start: 4, values: [1]}]}
  ]
}), error => error?.code === "map_replica_range_bounds");
assert.equal(atomicMap.metadata.name, "甲", "patch 预检失败不得留下部分 replace");
const patch1 = createMapReplicaPatch({
  mapIdentity: "map-a",
  patchId: "p1",
  baseRevision: 0,
  targetRevision: 1,
  baseChecksum: "c0",
  targetChecksum: "c1",
  writes: [
    {path: "grid.cells.h", mode: "ranges", ranges: [{start: 1, values: new Uint8Array([8, 9])}]},
    {path: "metadata.name", mode: "replace", value: "乙"}
  ]
});
applyMapReplicaPatch(map, patch1);
assert.deepEqual([...map.grid.cells.h], [1, 8, 9, 4]);
assert.equal(map.metadata.name, "乙");

const journal = createMapReplicaJournal({mapIdentity: "map-a", revision: 0, checksum: "c0", limit: 2});
journal.append(patch1);
const patch2 = createMapReplicaPatch({
  mapIdentity: "map-a", patchId: "p2", baseRevision: 1, targetRevision: 2, baseChecksum: "c1", targetChecksum: "c2",
  writes: [{path: "grid.cells.state", mode: "ranges", ranges: [{start: 0, values: [2, 2]}]}]
});
journal.append(patch2);
assert.deepEqual(journal.getEntriesAfter(0).map(entry => entry.patchId), ["p1", "p2"]);
assert.deepEqual(journal.acknowledge("compute", {revision: 2, checksum: "c2"}), {revision: 2, checksum: "c2"});
assert.equal(journal.compactThrough(1), 1);
assert.throws(() => journal.getEntriesAfter(0), error => error?.code === "map_replica_resync_required");

const patch3 = createMapReplicaPatch({
  mapIdentity: "map-a", patchId: "p3", baseRevision: 2, targetRevision: 3, baseChecksum: "c2", targetChecksum: "c3",
  writes: [{path: "metadata.name", value: "丙"}]
});
journal.append(patch3);
assert.equal(journal.getSnapshot().entries, 2);
assert.throws(() => journal.append(patch3), error => ["map_replica_revision_gap", "map_replica_patch_duplicate"].includes(error?.code));
assert.throws(() => journal.acknowledge("compute", {revision: 3, checksum: "wrong"}), error => error?.code === "map_replica_checksum_mismatch");
assert.throws(() => createMapReplicaPatch({mapIdentity: "map-a", patchId: "gap", baseRevision: 3, targetRevision: 5, writes: [{path: "metadata.name", value: "丁"}]}), error => error?.code === "map_replica_revision_gap");
assert.throws(() => applyMapReplicaPatch(map, {mapIdentity: "map-a", patchId: "bad", baseRevision: 3, targetRevision: 4, writes: [{path: "grid.cells.h", mode: "ranges", ranges: [{start: 4, values: [1]}]}]}), error => error?.code === "map_replica_range_bounds");

console.log(JSON.stringify({ok: true, revision: journal.getSnapshot().revision, entries: journal.getSnapshot().entries}));
