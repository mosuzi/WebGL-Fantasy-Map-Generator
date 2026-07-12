#!/usr/bin/env node
import {collectionAffected, formatAffectedTargets, summarizeAffectedTargets, systemAffected} from "../app/webgl-generator/src/runtime/edit-command-effects.js";
import {createEditRefreshScheduler} from "../app/webgl-generator/src/runtime/edit-refresh-scheduler.js";
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

console.log(JSON.stringify({
  ok: true,
  routeTargets: routeTargets.length,
  stateTargets: stateTargets.length,
  affectedCount: structured.count,
  affectedKinds: structured.kinds,
  largeAffectedCount: largeStructured.count,
  largeSummaryBytes: JSON.stringify(largeStructured).length,
  summary: expectedSummary,
  refreshSummary: state.lastEditRefresh.affected
}, null, 2));

function assertAffected(actual, expected, label) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label}异常：${JSON.stringify(actual)}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
