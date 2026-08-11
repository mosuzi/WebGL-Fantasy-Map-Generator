#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {buildZones} from "../app/webgl-generator/src/generator/zones.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";
import {executeMapSnapshotTransaction} from "../app/webgl-generator/src/runtime/map-snapshot-transaction.js";
import {OBJECT_KIND} from "../app/webgl-generator/src/runtime/object-kinds.js";
import {allRegenerationObjectsLocked} from "../app/webgl-generator/src/runtime/regeneration-lock-protection.js";

const rootDir = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, rootDir), "utf8");
const [appSource, controlSource, zoneSource, zoneController] = await Promise.all([
  read("app/webgl-generator/src/runtime/app.js"),
  read("app/webgl-generator/src/ui/vue/components/ControlPanel.vue"),
  read("app/webgl-generator/src/ui/vue/components/ZonePanel.vue"),
  read("app/webgl-generator/src/ui/panels/zone-panel.js")
]);

assert.match(controlSource, /\{value: "zones", kind: "zones", label: regenerationKindLabel\("zones"\)/);
assert.match(zoneSource, /重新生成地区/);
assert.match(appSource, /onRegenerate: async \(\) => \{[\s\S]*?await runtimeActions\.generate\.regenerate\("zones", \{confirm: true\}\)[\s\S]*?createRegenerationUserError\("zones", error\)/, "地区面板回调没有安全包装底层错误");
assert.match(zoneController, /callbacks\.onRegenerate\?\.\(\)/);
assert.match(appSource, /const currentZones = map\.zones\?\.zones \|\| map\.pack\?\.zones \|\| \[\];/);
assert.match(appSource, /currentZones\.length > 0 && allRegenerationObjectsLocked\(map, OBJECT_KIND\.ZONE, currentZones\)/);
assert.match(appSource, /regenerate zones:[\s\S]*?derived: \["cell-colors", "line-layers", "labels", "object-panels", "object-index"\]/, "地区重生成没有同步刷新覆盖和标签");
assert.match(zoneSource, /\{key: "name", label: "名称"[\s\S]*?\{key: "id", label: "编号"/, "地区列表没有把可读名称置于编号之前");

const emptyMap = createMap();
assert.equal(allRegenerationObjectsLocked(emptyMap, OBJECT_KIND.ZONE, []), false, "空地区集合被误判为全部锁定");
const before = structuredClone(emptyMap);
const history = new EditHistory();
const transaction = executeMapSnapshotTransaction({
  map: emptyMap,
  editHistory: history,
  label: "受约束重生成 zones",
  domain: "regeneration",
  effects: {derived: ["object-panels", "object-index"]},
  execute() {
    emptyMap.metadata.regenerationSalt.zones += 1;
    emptyMap.zones = buildZones(emptyMap.pack, {seed: `zone-regression:${emptyMap.metadata.regenerationSalt.zones}`, preservedZones: []});
    return {executed: true};
  },
  executeCommand: command => history.execute(command, {map: emptyMap})
});
assert.equal(transaction.executed, true);
assert.ok(emptyMap.zones.zones.length > 0, "空地区集合没有从现有 pack cells 生成地区");
assert.equal(emptyMap.pack.zones, emptyMap.zones.zones, "地区重生成后 map / pack 镜像未同步");
assert.equal(emptyMap.metadata.regenerationSalt.zones, 1, "成功重生成没有推进扰动序号");
assert.equal(history.getStats().undo, 1, "地区重生成没有收敛为单条历史");
const after = structuredClone(emptyMap);
history.undo({map: emptyMap});
assert.deepEqual(emptyMap, before, "地区重生成撤销没有恢复完整前态");
history.redo({map: emptyMap});
assert.deepEqual(emptyMap, after, "地区重生成重做没有恢复完整后态");

const oldMap = createMap();
oldMap.pack.zones = [{i: 7, id: 7, type: "Disaster", cells: [0], name: "旧地区"}];
delete oldMap.zones;
assert.equal((oldMap.zones?.zones || oldMap.pack?.zones || []).length, 1, "缺少 map.zones 的旧结构无法读取 pack.zones");

const lockedMap = createMap();
const lockedZone = {i: 4, id: 4, type: "Disaster", cells: [0], name: "锁定地区"};
lockedMap.zones = {zones: [lockedZone], metadata: {zones: 1}};
lockedMap.pack.zones = lockedMap.zones.zones;
lockedMap.regenerationLocks.entries.push({kind: OBJECT_KIND.ZONE, id: 4});
assert.equal(allRegenerationObjectsLocked(lockedMap, OBJECT_KIND.ZONE, lockedMap.zones.zones), true, "全锁地区没有被识别");
const lockedBefore = structuredClone(lockedMap);
const lockedSalt = lockedMap.metadata.regenerationSalt.zones;
if (!allRegenerationObjectsLocked(lockedMap, OBJECT_KIND.ZONE, lockedMap.zones.zones)) lockedMap.metadata.regenerationSalt.zones += 1;
assert.deepEqual(lockedMap, lockedBefore, "全锁拒绝仍修改了地图");
assert.equal(lockedMap.metadata.regenerationSalt.zones, lockedSalt, "全锁拒绝仍推进扰动序号");

console.log(JSON.stringify({
  ok: true,
  entryPoints: ["control-panel", "zone-panel"],
  emptyCollection: "generated",
  oldStructure: "pack.zones",
  fullLock: "noop",
  transaction: {undo: true, redo: true, historyEntries: 1}
}, null, 2));

function createMap() {
  const pack = {
    cells: {
      i: [0, 1, 2, 3, 4, 5, 6, 7],
      h: [30, 30, 30, 30, 30, 30, 10, 30],
      state: [0, 0, 0, 1, 0, 0, 0, 0],
      burg: [0, 0, 0, 0, 1, 0, 0, 0],
      pop: [0, 0.2, 0, 0, 0, 0.8, 0, 0],
      c: [[1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5], []],
      p: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [10, 0]]
    },
    zones: [],
    military: {fronts: []},
    states: [],
    burgs: [],
    religions: [],
    cultures: [],
    provinces: [],
    markers: [],
    rivers: []
  };
  return {
    options: {seed: "zone-regression"},
    metadata: {regenerationSalt: {zones: 0}},
    summary: {},
    pack,
    zones: {zones: pack.zones, metadata: {zones: 0}},
    regenerationLocks: {version: 1, entries: []}
  };
}
