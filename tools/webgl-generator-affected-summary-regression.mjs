#!/usr/bin/env node
import {collectionAffected, formatAffectedTargets, summarizeAffectedTargets, systemAffected} from "../app/webgl-generator/src/runtime/edit-command-effects.js";
import {createEditRefreshScheduler} from "../app/webgl-generator/src/runtime/edit-refresh-scheduler.js";
import {createCommittedHistoryGuard, settleHistoryActionResult} from "../app/webgl-generator/src/runtime/history-async-boundary.js";
import {formatAffectedTargets as formatUiAffectedTargets, formatHistoryCommand} from "../app/webgl-generator/src/ui/history-format.js";

const routes = [
  {id: 0},
  {id: 1},
  null,
  {id: 2, removed: true},
  {id: 3},
  {id: 3},
  {i: 4}
];
const routeTargets = collectionAffected("route", routes);
assertAffected(routeTargets, [
  {kind: "route", id: 0},
  {kind: "route", id: 1},
  {kind: "route", id: 3},
  {kind: "route", id: 4}
], "路线集合目标");

const stateTargets = collectionAffected("state", [{i: 0}, {i: 1}, {i: 2, removed: true}, {i: 3}], {includeZero: false});
assertAffected(stateTargets, [{kind: "state", id: 1}, {kind: "state", id: 3}], "国家集合目标");

const affected = systemAffected("routes", routeTargets);
const expectedSummary = "derived-system#routes, route#0, route#1 +2";
assert(formatAffectedTargets(affected) === expectedSummary, `运行时 affected 折叠异常：${formatAffectedTargets(affected)}`);
assert(formatUiAffectedTargets(affected) === expectedSummary, `历史 UI affected 折叠异常：${formatUiAffectedTargets(affected)}`);
assert(formatHistoryCommand({lastLabel: "重算道路", lastDomain: "route", lastAffected: affected}) === `重算道路 @route [${expectedSummary}]`, "历史命令摘要没有复用共享折叠格式");
assert(formatHistoryCommand({lastLabel: "重算道路", lastDomain: "route", lastAffected: affected.slice(0, 3), lastAffectedSummary: expectedSummary}) === `重算道路 @route [${expectedSummary}]`, "历史命令摘要丢失公开 stats 的完整折叠文本");
const structured = summarizeAffectedTargets(affected);
assert(structured.count === 5, `结构化摘要总数异常：${structured.count}`);
assertAffected(structured.preview, affected.slice(0, 3), "结构化摘要预览");
assert(JSON.stringify(structured.kinds) === JSON.stringify([{kind: "derived-system", count: 1}, {kind: "route", count: 4}]), `结构化摘要 kind 计数异常：${JSON.stringify(structured.kinds)}`);

const largeStructured = summarizeAffectedTargets(systemAffected("cities", Array.from({length: 1000}, (_, id) => ({kind: "city", id}))));
assert(largeStructured.count === 1001, `大集合摘要总数异常：${largeStructured.count}`);
assert(largeStructured.preview.length === 3 && largeStructured.text.endsWith("+998"), `大集合摘要没有保持有界预览：${largeStructured.text}`);
assert(JSON.stringify(largeStructured).length < 320, `大集合结构化摘要体积异常：${JSON.stringify(largeStructured).length}`);

const state = {
  renderer: {
    invalidateDynamicBuffers() {},
    draw() {}
  },
  selectionStore: {refresh() {}}
};
const scheduler = createEditRefreshScheduler({
  state,
  documentRef: null,
  updateRuntimePanel() {},
  updatePickPanel() {}
});
scheduler.run({
  render: "none",
  selection: "none",
  runtimeStats: false,
  pickPanel: false,
  derived: ["object-panels"],
  affected
});
assert(state.lastEditRefresh?.affected === expectedSummary, `刷新摘要没有折叠 affected：${state.lastEditRefresh?.affected}`);
assert(state.lastEditRefresh?.affectedCount === 5, `刷新摘要总数异常：${state.lastEditRefresh?.affectedCount}`);
assertAffected(state.lastEditRefresh?.affectedPreview, affected.slice(0, 3), "刷新摘要预览");
assert(JSON.stringify(state.lastEditRefresh?.affectedKinds) === JSON.stringify(structured.kinds), `刷新摘要 kind 计数异常：${JSON.stringify(state.lastEditRefresh?.affectedKinds)}`);

const syncTerrainCalls = [];
const syncTerrainBinding = Object.freeze({
  mapIdentity: "map:sync-terrain",
  sourceRevision: 4,
  topologyRevision: 3,
  renderPreparationId: "sync-terrain:4",
  renderGeneration: 2
});
const syncTerrainSource = Object.freeze({mapIdentity: "map:sync-terrain", mapRevision: 4, topologyRevision: 3});
const syncTerrainState = {
  map: {visualTheme: {preset: "default"}},
  mapRevision: {getCoreSnapshot: () => syncTerrainSource},
  renderer: {
    issueRenderResourceBinding(source) { assert(JSON.stringify(source) === JSON.stringify(syncTerrainSource), "同步 terrain 没有使用当前 revision"); syncTerrainCalls.push("issue"); return syncTerrainBinding; },
    invalidateDynamicBuffers() { syncTerrainCalls.push("invalidate"); },
    refreshTerrainCaches(options) {
      assert(options.draw === false && options.refreshSurface === false && options.refreshLines === false, "同步 terrain 阶段没有关闭内嵌 surface / line");
      syncTerrainCalls.push("terrain");
    },
    refreshLineLayers({draw, binding}) {
      assert(draw === false && binding === syncTerrainBinding, "同步 terrain 后 line 没有使用同一 retained binding");
      syncTerrainCalls.push("line");
    },
    refreshCellSurface({draw, binding}) {
      assert(draw === true && binding === syncTerrainBinding, "同步 terrain 后 surface 没有使用同一 retained binding");
      syncTerrainCalls.push("surface");
    }
  },
  selectionStore: {refresh() {}}
};
const syncTerrainScheduler = createEditRefreshScheduler({state: syncTerrainState, documentRef: null, updateRuntimePanel() {}, updatePickPanel() {}});
syncTerrainScheduler.run({
  render: "draw",
  selection: "none",
  runtimeStats: false,
  pickPanel: false,
  derived: ["terrain-caches"]
});
assertAffected(syncTerrainCalls, ["issue", "invalidate", "terrain", "line", "surface"], "同步 terrain 唯一绑定刷新阶段");

const asyncCalls = [];
const asyncState = {
  map: {visualTheme: {preset: "default"}},
  renderer: {
    invalidateDynamicBuffers() { asyncCalls.push("invalidate"); },
    refreshPoliticalVisualCaches() { asyncCalls.push("political"); },
    refreshTerrainCaches(options) {
      assert(options.draw === false && options.refreshSurface === false && options.refreshLines === false, "异步 terrain 阶段没有关闭内嵌 surface / line");
      asyncCalls.push("terrain");
    },
    refreshLineLayers({draw}) { assert(draw === false, "异步 line 阶段意外绘制"); asyncCalls.push("line"); },
    refreshPointLayers({draw}) { assert(draw === false, "异步 point 阶段意外绘制"); asyncCalls.push("point"); },
    refreshObjectPickingIndex() { asyncCalls.push("object-index"); },
    refreshCellSurface({draw}) { assert(draw === true, "异步 surface 末段没有恢复绘制"); asyncCalls.push("surface"); },
    refreshLabels() { asyncCalls.push("labels"); }
  },
  selectionStore: {refresh() { asyncCalls.push("selection"); }}
};
const asyncScheduler = createEditRefreshScheduler({state: asyncState, documentRef: null, updateRuntimePanel() {}, updatePickPanel() {}});
await asyncScheduler.runAsync({
  render: "draw",
  selection: "refresh",
  runtimeStats: true,
  pickPanel: true,
  derived: ["terrain-caches", "political-boundaries", "line-layers", "point-layers", "object-index", "cell-colors", "labels"],
  affected
}, {yieldToMain: async () => { asyncCalls.push("yield"); }, assertCurrent: () => asyncCalls.push("current")});
assertAffected(asyncCalls, [
  "invalidate",
  "yield", "current",
  "terrain", "yield", "current",
  "line", "yield", "current",
  "point", "yield", "current",
  "object-index", "yield", "current",
  "surface", "yield", "current",
  "labels", "yield", "current",
  "selection", "yield", "current"
], "异步重生成历史刷新阶段");
assert(!asyncCalls.includes("political"), "terrain 阶段之后仍重复刷新政治缓存");

const guardedMap = {};
let guardedRevision = 7;
const guardedCalls = [];
const guardedState = {
  map: guardedMap,
  mapRevision: {getSnapshot: () => ({mapIdentity: "map:guarded", mapRevision: guardedRevision})},
  renderer: {
    invalidateDynamicBuffers() { guardedCalls.push("invalidate"); },
    refreshTerrainCaches() { guardedCalls.push("terrain"); }
  },
  selectionStore: {refresh() { guardedCalls.push("selection"); }}
};
const committedGuard = createCommittedHistoryGuard({
  state: guardedState,
  sourceMap: guardedMap,
  revision: guardedState.mapRevision.getSnapshot(),
  operation: {isCurrent: () => true, throwIfCancelled() {}}
});
const guardedScheduler = createEditRefreshScheduler({state: guardedState, documentRef: null, updateRuntimePanel() {}, updatePickPanel() {}});
let obsoleteError = null;
try {
  await guardedScheduler.runAsync({effects: {render: "draw", selection: "refresh", derived: ["terrain-caches"]}}, {
    yieldToMain: async () => { guardedRevision += 1; },
    assertCurrent: committedGuard
  });
} catch (error) {
  obsoleteError = error;
}
assert(obsoleteError?.code === "operation_obsolete", "异步 history 在首个 yield 后没有拒绝 revision 漂移");
assertAffected(guardedCalls, ["invalidate"], "revision 漂移后的刷新停止边界");

const settled = [];
const syncResult = settleHistoryActionResult({executed: true}, value => {
  settled.push("sync-success");
  return value;
});
assert(syncResult.executed === true, "同步 history 结果形状被 Promise 化");
const asyncResult = settleHistoryActionResult(Promise.resolve({executed: true}), value => {
  settled.push("async-success");
  return value;
});
assert(typeof asyncResult?.then === "function", "异步 history 结果没有把 Promise 返回给面板");
assert((await asyncResult).executed === true, "异步 history resolve 结果丢失");
const handledFailure = settleHistoryActionResult(Promise.reject(new Error("history-failed")), value => value, error => {
  settled.push(error.message);
  return null;
});
assert(await handledFailure === null, "异步 history rejection 没有进入消费者错误收尾");
assertAffected(settled, ["sync-success", "async-success", "history-failed"], "history 消费者同步/异步收尾");

console.log(JSON.stringify({
  ok: true,
  routeTargets: routeTargets.length,
  stateTargets: stateTargets.length,
  affectedCount: structured.count,
  affectedKinds: structured.kinds,
  largeAffectedCount: largeStructured.count,
  largeSummaryBytes: JSON.stringify(largeStructured).length,
  summary: expectedSummary,
  refreshSummary: state.lastEditRefresh.affected,
  syncTerrainStages: syncTerrainCalls.length,
  asyncRefreshStages: asyncCalls.length,
  revisionDriftStoppedBeforeTerrain: !guardedCalls.includes("terrain"),
  historyResultSettlement: settled
}, null, 2));

function assertAffected(actual, expected, label) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label}异常：${JSON.stringify(actual)}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
