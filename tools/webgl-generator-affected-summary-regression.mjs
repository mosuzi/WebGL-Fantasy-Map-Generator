#!/usr/bin/env node
import {collectionAffected, formatAffectedTargets, systemAffected} from "../app/webgl-generator/src/runtime/edit-command-effects.js";
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

console.log(JSON.stringify({
  ok: true,
  routeTargets: routeTargets.length,
  stateTargets: stateTargets.length,
  summary: expectedSummary,
  refreshSummary: state.lastEditRefresh.affected
}, null, 2));

function assertAffected(actual, expected, label) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label}异常：${JSON.stringify(actual)}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
