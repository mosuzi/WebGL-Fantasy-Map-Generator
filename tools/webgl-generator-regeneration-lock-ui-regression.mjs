#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {createRegenerationLockUiSession} from "../app/webgl-generator/src/runtime/regeneration-lock-ui-session.js";
import {
  diplomacyRelationReferenceAtPoliticalPick,
  nearestOceanCurrentAtPoint
} from "../app/webgl-generator/src/runtime/regeneration-lock-map-pick.js";
import {regenerationLockKey} from "../app/webgl-generator/src/runtime/regeneration-locks.js";
import {objectTableSelectionRange} from "../app/webgl-generator/src/ui/vue/components/base/object-table-selection.js";
import {isRef, ref} from "vue";
import {useRegenerationLockSelection} from "../app/webgl-generator/src/ui/vue/composables/use-regeneration-lock-selection.js";

const root = resolve(import.meta.dirname, "..");
const tableSource = read("app/webgl-generator/src/ui/vue/components/base/UiObjectTable.vue");
const composableSource = read("app/webgl-generator/src/ui/vue/composables/use-regeneration-lock-selection.js");
const actionsSource = read("app/webgl-generator/src/ui/vue/components/base/UiRegenerationLockActions.vue");
const stylesSource = read("app/webgl-generator/src/styles.css");
const targetPanels = [
  "State", "Province", "City", "Route", "River", "Marker", "Diplomacy", "Religion",
  "Culture", "Military", "Zone", "Feature", "OceanCurrent", "Economy"
];

assert.match(tableSource, /showRegenerationLock/);
assert.match(tableSource, /锁定以防重新生成/);
assert.match(tableSource, /解除重生成锁定/);
assert.match(tableSource, /aria-pressed/);
assert.match(tableSource, /lock-range-selection/);
assert.match(tableSource, /batchLockSelectionMode/);
assert.match(tableSource, /emit\("lock-selection-change", ids\);\s+emit\("selection-change", ids\);/);
assert.match(tableSource, /selectionColumnVisible = computed\(\(\) => props\.selectableRows \|\| props\.showRegenerationLock\)/);
const rangeSource = sourceBetween(tableSource, "function emitRangeSelection", "function emitSelectionChange");
assert.match(rangeSource, /objectTableSelectionRange\(props\.rows, lockSelectionAnchor, rowKey\(row\), rowKey\)/, "Shift 范围必须使用完整过滤排序 rows");
assert.doesNotMatch(rangeSource, /visibleRows/, "Shift 范围不得退化为虚拟窗口");
assert.match(tableSource, /@click="event => handleRowClick\(row, event\)"/, "普通行单击入口必须保留");
assert.match(tableSource, /@dblclick="handleRowDoubleClick\(row\)"/, "普通行双击入口必须保留");
assert.match(tableSource, /@click\.stop="emit\('locate', row\)"/, "定位事件入口必须保留");
assert.match(tableSource, /function handleRowClick\(row, event\)[\s\S]*?emit\("select", row\);/, "非批量模式必须继续发出 select");
assert.match(tableSource, /function handleRowClick\(row, event\)[\s\S]*?emit\("select", row\);/, "普通 click 必须继续发出 select");
const doubleClickHandler = tableSource.slice(tableSource.indexOf("function handleRowDoubleClick"), tableSource.indexOf("function handleHeaderSort"));
assert.match(doubleClickHandler, /emit\("edit", row\)/, "双击编辑必须发出一次 edit");
assert.doesNotMatch(doubleClickHandler, /emit\("select", row\)/, "dblclick 不得重复发出 select");

const completeRows = Array.from({length: 240}, (_, index) => ({id: index + 1}));
const completeRange = objectTableSelectionRange(completeRows, "15", "220", row => String(row.id));
assert.equal(completeRange.length, 206, "200+ 行 Shift 范围必须跨越虚拟窗口读取完整 rows");
assert.deepEqual([completeRange[0].id, completeRange.at(-1).id], [15, 220], "Shift 范围端点必须遵循完整排序");
for (const panel of targetPanels) {
  const source = read(`app/webgl-generator/src/ui/vue/components/${panel}Panel.vue`);
  assert.match(source, /useRegenerationLockSelection/, `${panel}Panel 未接入共享锁定会话`);
  assert.match(source, /UiRegenerationLockActions/, `${panel}Panel 未接入共享批量动作`);
}
assert.doesNotMatch(read("app/webgl-generator/src/ui/vue/components/EconomyPanel.vue").match(/<UiObjectTable[\s\S]*?v-else-if="state\.tab === 'markets'"/)?.[0] || "", /showRegenerationLock/, "商品表不得进入重生成锁定分母");
assert.match(
  read("app/webgl-generator/src/ui/vue/components/EconomyPanel.vue"),
  /props\.state\.tab === "goods"\s*\?\s*selectedVisibleEconomyRows\.value\s*:\s*regenerationLocks\.selectedRows\.value/,
  "商品页必须继续使用原有可见行选择集合"
);
assert.match(composableSource, /getRegenerationLockUiSession/);
assert.match(composableSource, /get selectedCount\(\)/, "地图选中不可见行时动作条仍须使用完整会话计数");
assert.match(actionsSource, /已选 \{\{ selectedCount \}\} 项/);
assert.match(actionsSource, /在地图多选/);
assert.match(stylesSource, /\.regeneration-lock-actions\s*\{[\s\S]*?display:\s*grid;[\s\S]*?gap:\s*8px;/, "共享批量操作没有稳定按钮间距");

const previousWarn = console.warn;
console.warn = () => {};
const vueBinding = useRegenerationLockSelection({panelId: "feature-panel", kind: "feature", rows: ref([{id: 1}])});
console.warn = previousWarn;
assert.equal(isRef(vueBinding.tableProps), false, "嵌套 v-bind 不能收到 ComputedRef");
assert.equal(vueBinding.tableProps.showRegenerationLock, true);
assert.deepEqual(vueBinding.tableProps.lockableRowIds, [1]);
assert.equal(isRef(vueBinding.actionProps), false, "动作条 v-bind 不能收到 ComputedRef");
assert.equal(vueBinding.actionProps.selectedCount, 0);

const map = {regenerationLocks: {version: 1, entries: []}};
const writes = [];
const highlights = [];
const mapTransitions = [];
const session = createRegenerationLockUiSession({
  getMap: () => map,
  setLock(reference, locked) {
    writes.push({type: "one", references: [reference], locked});
    map.regenerationLocks.entries = locked ? [reference] : [];
    return {executed: true};
  },
  setLocks(references, locked) {
    writes.push({type: "many", references, locked});
    map.regenerationLocks.entries = locked ? [...references] : [];
    return {executed: true};
  },
  startMapSelection(context) {
    mapTransitions.push({type: "start", context});
    return true;
  },
  stopMapSelection(reason) {
    mapTransitions.push({type: "stop", reason});
  },
  updateHighlights(references) {
    highlights.push(references.map(reference => `${reference.kind}:${reference.id}`));
  }
});

const snapshots = [];
const unsubscribe = session.subscribe(snapshot => snapshots.push(snapshot));
session.activate("state-panel", "state");
session.toggle("state-panel", "state", {kind: "state", id: 1});
session.toggleRange("state-panel", "state", [{kind: "state", id: 2}, {kind: "state", id: 3}], true);
assert.deepEqual(session.snapshot().selectedIds, [1, 2, 3]);

session.beginMapSelection("state-panel", "state");
assert.equal(session.snapshot().mapSelectionActive, true);
assert.equal(session.mapPicked({kind: "province", id: 1}), false);
assert.equal(session.mapPicked({kind: "state", id: 2}), true);
assert.deepEqual(session.snapshot().selectedIds, [1, 3]);
assert.deepEqual(highlights.at(-1), ["state:1", "state:3"]);

session.apply(true);
assert.equal(writes.length, 1);
assert.equal(writes[0].type, "many");
assert.deepEqual(map.regenerationLocks.entries, [{kind: "state", id: 1}, {kind: "state", id: 3}]);
assert.equal(session.snapshot().lockedKeys.has(regenerationLockKey({kind: "state", id: 1})), true);

session.setOne({kind: "state", id: 1}, false);
assert.equal(writes.length, 2);
assert.equal(writes[1].type, "one");
assert.equal(session.snapshot().lockedKeys.size, 0);

session.closePanel("state-panel");
assert.equal(session.snapshot().panelId, null);
assert.equal(session.snapshot().selectedCount, 0);
assert.equal(session.snapshot().mapSelectionActive, false);
assert.equal(mapTransitions.some(item => item.type === "stop"), true);
assert.deepEqual(highlights.at(-1), []);
unsubscribe();
assert.ok(snapshots.length >= 8);

const compositeTransitions = [];
const compositeSession = createRegenerationLockUiSession({
  startMapSelection: context => {
    compositeTransitions.push(context);
    return true;
  }
});
compositeSession.replace("diplomacy-panel", "diplomacy-relation", [
  {kind: "diplomacy-relation", subjectId: 2, objectId: 1}
]);
assert.deepEqual(compositeSession.snapshot().selectedReferences, [
  {kind: "diplomacy-relation", id: "1:2"}
]);
compositeSession.beginMapSelection("diplomacy-panel", "diplomacy-relation", {subjectId: 2});
assert.deepEqual(compositeTransitions[0], {
  subjectId: 2,
  panelId: "diplomacy-panel",
  kind: "diplomacy-relation"
}, "外交地图模式必须把当前主体传入唯一模式 context");
assert.equal(compositeSession.mapPicked({kind: "diplomacy-relation", id: "1:2"}), true);
assert.equal(compositeSession.snapshot().selectedCount, 0, "外交地图点击必须按规范国家对映射回同一选择");
compositeSession.toggle("state-panel", "state", {kind: "state", id: 0});
assert.equal(compositeSession.snapshot().selectedCount, 0, "中立 id=0 不得暴露为可锁对象");

const politicalMap = {pack: {cells: {state: [1, 2]}}};
assert.deepEqual(
  diplomacyRelationReferenceAtPoliticalPick(politicalMap, {packCell: 1}, 1),
  {kind: "diplomacy-relation", id: "1:2"},
  "外交地图模式必须能从空选择的首次国家点击构造规范关系"
);
assert.equal(diplomacyRelationReferenceAtPoliticalPick(politicalMap, {packCell: 0}, 1), null, "外交地图模式不得选择主体自身");

const cubicCurrent = {
  id: "current-cubic",
  path: {
    kind: "cubic",
    segments: [{
      start: [10, 20],
      control1: [20, 20],
      control2: [30, 20],
      end: [40, 20]
    }]
  }
};
assert.equal(
  nearestOceanCurrentAtPoint({
    metadata: {graphWidth: 100, graphHeight: 100},
    oceanCurrents: {currents: [cubicCurrent]}
  }, 25, 20)?.id,
  "current-cubic",
  "洋流地图模式必须采样正式 cubic path 并支持首次点击"
);

console.log(JSON.stringify({
  ok: true,
  sharedSessionSnapshots: snapshots.length,
  writes: writes.length,
  mapTransitions: mapTransitions.length
}, null, 2));

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `无法读取源码片段：${start}`);
  return source.slice(startIndex, endIndex);
}
