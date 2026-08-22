import assert from "node:assert/strict";

import {createDomainPatchCommand} from "../app/webgl-generator/src/runtime/domain-patch.js";
import {
  captureCommandMapReplicaWrites,
  captureCommandMapReplicaWritesAsync,
  createCommandMapReplicaPatch
} from "../app/webgl-generator/src/runtime/map-replica-command-patch.js";
import {
  applyMapReplicaPatch,
  createMapReplicaPatch,
  normalizeMapReplicaPatch
} from "../app/webgl-generator/src/runtime/map-replica-journal.js";
import {
  computeAppliedMapReplicaPatchTargetChecksum,
  computeCanonicalMapReplicaChecksum
} from "../app/webgl-generator/src/runtime/map-replica-checksum.js";

const fixtureOnly = process.argv.includes("--fixture-only");
const expectedDeletes = [
  {path: "metadata.derivedStale", mode: "delete"},
  {path: "military.metadata.stale", mode: "delete"}
];
const {main, retained, command} = createHistoryScenario();

assert.deepEqual(staleSnapshot(main), staleSnapshot(retained), "features execute 后 canonical 与 retained mirror 必须同态");
command.revert({map: main});
assert.deepEqual(staleSnapshot(main), initialStaleSnapshot(), "features undo 必须把 canonical stale 恢复为缺失形态");

const legacyWrites = legacyPresentOnlyCapture(main, command);
assert.deepEqual(legacyWrites, [], "旧 present-only capture 负控必须丢失两个删除路径");
assert.notDeepEqual(staleSnapshot(main), staleSnapshot(retained), "负控必须在首次 features undo 形成 mirror parity 分叉");

if (fixtureOnly) {
  console.log(JSON.stringify({
    ok: true,
    mode: "fixture-only",
    firstDivergence: "features:undo",
    omittedDeletes: expectedDeletes.map(write => write.path),
    canonical: staleSnapshot(main),
    retained: staleSnapshot(retained)
  }, null, 2));
  process.exit(0);
}

const syncWrites = captureCommandMapReplicaWrites({map: main, command});
assert.deepEqual(syncWrites, expectedDeletes, "同步 history capture 必须显式编码 stale / derivedStale 删除");
const asyncWrites = await captureCommandMapReplicaWritesAsync({
  map: main,
  command,
  budgetMs: 1,
  yieldToMain: async () => {},
  isCurrent: () => true
});
assert.deepEqual(asyncWrites, expectedDeletes, "异步正式 history capture 必须保留删除语义");

const baseChecksum = await computeCanonicalMapReplicaChecksum(retained, {revision: 1, yieldToMain: async () => {}});
const historyPatch = await createCommandMapReplicaPatch({
  map: main,
  command,
  action: "undo",
  mapIdentity: "history-delete-map",
  baseRevision: 1,
  targetRevision: 2,
  baseChecksum,
  capturedWrites: asyncWrites,
  yieldToMain: async () => {}
});
assert.deepEqual(historyPatch.writes, expectedDeletes, "history patch 必须冻结为无 payload 的 delete writes");
applyMapReplicaPatch(retained, historyPatch);
assert.deepEqual(staleSnapshot(retained), staleSnapshot(main), "delete patch 必须恢复 retained mirror 的 stale 缺失形态");
assert.equal(retained.military, retained.pack.military, "删除 leaf 不得破坏 military / pack.military alias");
assert.equal(
  await computeAppliedMapReplicaPatchTargetChecksum(retained, historyPatch, {yieldToMain: async () => {}}),
  historyPatch.targetChecksum,
  "delete patch 应用后 checksum 必须与签发 target 一致"
);

retained.military.metadata.stale = true;
assert.notEqual(
  await computeAppliedMapReplicaPatchTargetChecksum(retained, historyPatch, {yieldToMain: async () => {}}),
  historyPatch.targetChecksum,
  "delete target 被重新写入时 applied checksum 必须拒绝假一致"
);
delete retained.military.metadata.stale;

const alreadyAbsent = {metadata: {}};
const idempotentDelete = createMapReplicaPatch({
  mapIdentity: "history-delete-map",
  patchId: "delete-absent-parent",
  baseRevision: 2,
  targetRevision: 3,
  baseChecksum: historyPatch.targetChecksum,
  targetChecksum: "r1:0000000000000000",
  writes: [{path: "military.metadata.stale", mode: "delete"}]
});
assert.doesNotThrow(() => applyMapReplicaPatch(alreadyAbsent, idempotentDelete), "delete 必须允许目标父路径已缺失并保持幂等");
assert.equal(Object.hasOwn(alreadyAbsent, "military"), false);

assertCode(() => normalizeMapReplicaPatch({
  mapIdentity: "history-delete-map",
  patchId: "delete-payload",
  baseRevision: 3,
  targetRevision: 4,
  writes: [{path: "military.metadata.stale", mode: "delete", value: true}]
}), "map_replica_delete_payload_invalid");
assertCode(() => normalizeMapReplicaPatch({
  mapIdentity: "history-delete-map",
  patchId: "delete-unregistered",
  baseRevision: 3,
  targetRevision: 4,
  writes: [{path: "__proto__.stale", mode: "delete"}]
}), "map_replica_path_unregistered");

console.log(JSON.stringify({
  ok: true,
  firstDivergenceClosed: "features:undo",
  deleteWrites: historyPatch.writes.map(write => write.path),
  staleShape: staleShape(main.military.metadata),
  mirrorAlias: retained.military === retained.pack.military
}, null, 2));

function createHistoryScenario() {
  const main = createMap();
  const retained = createMap();
  const patch = {
    version: 1,
    domain: "features",
    writeSet: ["metadata.derivedStale", "military.metadata.stale"],
    operations: [
      {path: ["metadata", "derivedStale"], exists: true, value: {systems: ["military", "diplomacy"]}},
      {path: ["military", "metadata", "stale"], exists: true, value: true}
    ]
  };
  const command = createDomainPatchCommand({
    patch,
    policy: {domain: "features", allowedPaths: [...patch.writeSet], forbiddenPaths: []},
    label: "features",
    historyDomain: "regeneration",
    effects: {},
    result: {executed: true}
  });
  command.apply({map: main});
  retained.metadata.derivedStale = {systems: ["military", "diplomacy"]};
  retained.military.metadata.stale = true;
  return {main, retained, command};
}

function createMap() {
  const military = {metadata: {regiments: 0}};
  return {
    metadata: {},
    military,
    pack: {military}
  };
}

function legacyPresentOnlyCapture(map, command) {
  const writes = [];
  for (const path of command.getReplicaPaths()) {
    const resolved = resolvePath(map, path);
    if (resolved.found) writes.push({path, mode: "replace", value: resolved.value});
  }
  return structuredClone(writes);
}

function resolvePath(root, path) {
  let value = root;
  for (const part of String(path || "").split(".")) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, part)) return {found: false, value: undefined};
    value = value[part];
  }
  return {found: true, value};
}

function initialStaleSnapshot() {
  return {
    military: {exists: false, value: undefined},
    packMilitary: {exists: false, value: undefined},
    militaryAlias: true,
    derivedStale: {exists: false, value: undefined}
  };
}

function staleSnapshot(map) {
  return {
    military: staleShape(map?.military?.metadata),
    packMilitary: staleShape(map?.pack?.military?.metadata),
    militaryAlias: map?.military === map?.pack?.military,
    derivedStale: ownShape(map?.metadata, "derivedStale")
  };
}

function staleShape(metadata) {
  return ownShape(metadata, "stale");
}

function ownShape(owner, key) {
  return {
    exists: Boolean(owner && Object.prototype.hasOwnProperty.call(owner, key)),
    value: owner?.[key]
  };
}

function assertCode(run, code) {
  assert.throws(run, error => error?.code === code, `必须拒绝为 ${code}`);
}
