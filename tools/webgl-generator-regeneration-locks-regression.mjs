import assert from "node:assert/strict";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {MapRevisionTracker} from "../app/webgl-generator/src/runtime/map-revision.js";
import {getObjectSnapshot, listObjectTypes} from "../app/webgl-generator/src/runtime/object-query-api.js";
import {
  REGENERATION_LOCK_KINDS,
  createEmptyRegenerationLockStore,
  createRegenerationLockInspection,
  getRegenerationLockStatus,
  normalizeRegenerationLockReferences,
  normalizeRegenerationLockStore,
  validateRegenerationLockStore
} from "../app/webgl-generator/src/runtime/regeneration-locks.js";
import {createSetRegenerationLockCommand, createSetRegenerationLocksCommand} from "../app/webgl-generator/src/runtime/regeneration-lock-commands.js";

const map = fixtureMap();
const allReferences = [
  {kind: "state", id: 1},
  {kind: "province", id: 1},
  {kind: "city", id: 1},
  {kind: "route", id: 1},
  {kind: "river", id: 1},
  {kind: "marker", id: 1},
  {kind: "diplomacy-relation", id: "2:1"},
  {kind: "religion", id: 1},
  {kind: "culture", id: 1},
  {kind: "military", id: "1:0"},
  {kind: "zone", id: 1},
  {kind: "feature", id: 1},
  {kind: "ocean-current", id: "current-1"},
  {kind: "economy-market", id: 1},
  {kind: "trade-flow", id: 1}
];

assert.equal(REGENERATION_LOCK_KINDS.length, 15);
assert.deepEqual(new Set(allReferences.map(item => item.kind)), new Set(REGENERATION_LOCK_KINDS));

const normalized = normalizeRegenerationLockStore({
  version: 99,
  entries: [
    ...allReferences,
    {kind: "state", id: 1},
    {kind: "diplomacy-relation", id: "1:2"},
    {kind: "state", id: 999},
    {kind: "unknown", id: 1},
    null
  ]
}, map);
assert.equal(normalized.store.version, 1);
assert.equal(normalized.store.entries.length, 15);
assert.equal(normalized.diagnostics.removed, 3);
assert.equal(normalized.store.entries.find(item => item.kind === "diplomacy-relation").id, "1:2");
assert.deepEqual(validateRegenerationLockStore(normalized.store, map), normalized.store);
assert.deepEqual(normalizeRegenerationLockStore(null, map).store, createEmptyRegenerationLockStore());

assert.throws(
  () => normalizeRegenerationLockReferences([{kind: "state", id: 1}, {kind: "state", id: 999}], map),
  error => error.code === "lock_batch_invalid" && error.details.rejected[0].code === "object_not_found"
);
assert.deepEqual(map.regenerationLocks, createEmptyRegenerationLockStore());

const tracker = new MapRevisionTracker({identityFactory: () => "regeneration-lock-test"});
tracker.replaceMap();
const history = new EditHistory({onMutation: () => tracker.advance()});
const setOne = createSetRegenerationLockCommand({kind: "city", id: 1}, true);
assert.equal(setOne.isNoop({map}), false);
history.execute(setOne, {map});
assert.equal(getRegenerationLockStatus(map, {kind: "city", id: 1}).locked, true);
assert.equal(tracker.getSnapshot().mapRevision, 1);
assert.equal(createSetRegenerationLockCommand({kind: "city", id: 1}, true).isNoop({map}), true);

const batch = createSetRegenerationLocksCommand([{kind: "river", id: 1}, {kind: "route", id: 1}], true);
history.execute(batch, {map});
assert.equal(history.getStats().undo, 2);
assert.equal(map.regenerationLocks.entries.length, 3);
history.undo({map});
assert.deepEqual(map.regenerationLocks.entries, [{kind: "city", id: 1}]);
history.redo({map});
assert.equal(map.regenerationLocks.entries.length, 3);

const inspection = createRegenerationLockInspection(map, tracker.getSnapshot().mapRevision, [{kind: "state", id: 1}], true);
assert.equal(inspection.changed, 1);
assert.match(inspection.inspectionToken, /^\d+:[a-z0-9]+$/);

const city = map.settlements.cities[1];
history.execute({
  label: "删除城市测试",
  domain: "city",
  effects: {render: "none", selection: "refresh", runtimeStats: true, pickPanel: false, derived: [], affected: [{kind: "city", id: 1}]},
  apply: ({map: target}) => {
    target.settlements.cities[1] = null;
  },
  revert: ({map: target}) => {
    target.settlements.cities[1] = city;
  }
}, {map});
assert.equal(map.regenerationLocks.entries.some(item => item.kind === "city"), false);
history.undo({map});
assert.equal(map.regenerationLocks.entries.some(item => item.kind === "city"), true);

const objectTypes = new Set(listObjectTypes().map(item => item.type));
for (const kind of ["feature", "ocean-current", "economy-market"]) assert.equal(objectTypes.has(kind), true);
assert.equal(getObjectSnapshot(map, {kind: "feature", id: 1}).type, "island");
assert.equal(getObjectSnapshot(map, {kind: "ocean-current", id: "current-1"}).temperature, "warm");
assert.equal(getObjectSnapshot(map, {kind: "economy-market", id: 1}).centerBurg, "测试城");
assert.equal(getObjectSnapshot(map, {kind: "city", id: 1}).regenerationLocked, true);


console.log(JSON.stringify({
  ok: true,
  kinds: REGENERATION_LOCK_KINDS.length,
  normalized: normalized.store.entries.length,
  cleaned: normalized.diagnostics.removed,
  history: history.getStats(),
  revision: tracker.getSnapshot()
}, null, 2));

function fixtureMap() {
  const states = [
    {i: 0, id: 0, removed: false, military: []},
    {i: 1, id: 1, name: "甲国", fullName: "甲国", removed: false, military: [{i: 0, id: "1:0", state: 1, name: "甲军"}], diplomacy: ["x", "x", "Neutral"]},
    {i: 2, id: 2, name: "乙国", fullName: "乙国", removed: false, military: [], diplomacy: ["x", "Neutral", "x"]}
  ];
  return {
    regenerationLocks: createEmptyRegenerationLockStore(),
    politics: {states, provinces: [null, {i: 1, id: 1, name: "甲省", state: 1, removed: false}]},
    society: {
      cultures: [null, {i: 1, id: 1, name: "甲文化", removed: false}],
      religions: [null, {i: 1, id: 1, name: "甲教", removed: false}]
    },
    settlements: {
      cities: [null, {i: 1, id: 1, name: "测试城", state: 1, province: 1}],
      routes: [{i: 1, id: 1, type: "road", from: 1, to: 1, points: [[0, 0], [1, 1]]}]
    },
    rivers: {rivers: [{i: 1, id: 1, name: "测试河", points: [[0, 0], [1, 1]]}]},
    markers: {markers: [{i: 1, id: 1, name: "测试矿", type: "mine"}]},
    zones: {zones: [{i: 1, id: 1, name: "测试区"}]},
    oceanCurrents: {currents: [{id: "current-1", name: "测试暖流", temperature: "warm", strength: 0.8, basinFeatureId: 1}]},
    pack: {
      states,
      provinces: [null, {i: 1, id: 1, name: "甲省", state: 1}],
      burgs: [null, {i: 1, id: 1, name: "测试城", x: 10, y: 20, cell: 1}],
      features: [null, {i: 1, id: 1, type: "island", group: "continent", land: true, cells: 10}],
      markets: [null, {i: 1, id: 1, name: "甲市", state: 1, centerBurgId: 1, goods: {}}],
      deals: [{i: 1, id: 1, good: 1, sellerType: "burg", seller: 1, buyerType: "burg", buyer: 1}]
    }
  };
}
