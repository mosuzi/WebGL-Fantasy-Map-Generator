#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

const appPath = resolve("app/webgl-generator/src/runtime/app.js");
const source = readFileSync(appPath, "utf8");

const executeEdit = functionBlock("executeEditCommand", "executeHistoryCommand");
assertOrdered(executeEdit, [
  "state.editHistory.execute(command, context)",
  "readEditCommandResult(executedCommand)",
  "options.preparePanelRefresh?.(state, executedCommand, result)",
  "refresh(state, executedCommand)",
  "refreshPanelsForEdit(state, executedCommand)"
], "编辑命令面板刷新顺序");

const executeHistory = functionBlock("executeHistoryCommand", "readEditCommandResult");
assert.ok(executeHistory.includes('refreshPanelsForEdit(state, {derived: ["object-panels"]})'), "撤销 / 重做必须复用统一面板刷新入口并同步全局历史摘要");
assert.ok(!executeHistory.includes("updateAllObjectPanels(state)"), "撤销 / 重做不得绕过统一面板刷新入口");

const refreshPanels = functionBlock("refreshPanelsForEdit", "updatePanelForAffectedKind");
assert.ok(refreshPanels.includes('derived.includes("object-panels")'));
assert.ok(refreshPanels.includes("updatePanelForAffectedKind(state, kind)"));
assert.equal(
  count(source, "updateAllObjectPanels(state);") - count(refreshPanels, "updateAllObjectPanels(state);"),
  0,
  "全量对象面板刷新只能由统一入口调用"
);

for (const name of ["refreshAfterStateEdit", "refreshAfterProvinceEdit"]) {
  const block = functionBlock(name, name === "refreshAfterStateEdit" ? "refreshAfterProvinceEdit" : "regenerateMapAttribute");
  assert.ok(!/update[A-Z]\w+Panel\(state\)/.test(block), `${name} 只保留领域刷新，不得手写对象面板刷新`);
}

const regenerated = functionBlock("refreshRegeneratedLayers", "refreshGenerationSummary");
assert.ok(regenerated.includes("refreshPanelsForEdit(state, {derived, affected})"));
assert.ok(!regenerated.includes("updateAllObjectPanels(state)"));

for (const name of [
  "deleteLabelViaApi",
  "moveCustomLabelViaApi",
  "renameCustomLabelViaApi",
  "setLabelNoteViaApi",
  "restoreGeneratedLabelViaApi"
]) {
  assert.ok(!functionBlock(name).includes("updateLabelNamingPanel(state)"), `${name} 不得重复刷新标签面板`);
}
for (const name of ["setMarkerNoteViaApi", "setMarkerVisualViaApi"]) {
  assert.ok(!functionBlock(name).includes("updateMarkerPanel(state)"), `${name} 不得重复刷新 marker 面板`);
}

for (const name of [
  "executeNamebaseEdit",
  "executeNamebaseHistoryCommand",
  "executeNamebaseCommandViaApi"
]) {
  assert.ok(!functionBlock(name).includes("refreshPanels: false"), `${name} 必须复用统一面板刷新入口`);
}
assert.ok(!functionBlock("refreshAfterNamebaseEdit").includes("panels.namebase.update"), "名称库领域后处理不得直接刷新面板");
assert.ok(!functionBlock("deleteMarkerViaApi").includes("stopMarkerEditMode"), "删除当前编辑 marker 必须在统一刷新前清理编辑态");
assert.ok(functionBlock("assignSocialCellsViaApi").includes("refreshPanelsForEdit(state, {affected: [{kind, id}]})"), "归属命令 no-op 后也必须经统一入口刷新影响数");
assert.ok(callbackBlock("onDeleteProvince", "onSampleSelection").includes("preparePanelRefresh"), "省份面板删除必须在统一刷新前清理选择态");
assert.ok(callbackBlock("onDeleteCity", "onPopulationChange").includes("preparePanelRefresh"), "城市面板删除必须在统一刷新前清理选择态");

console.log(JSON.stringify({
  ok: true,
  updateAllObjectPanelsBranches: count(refreshPanels, "updateAllObjectPanels(state);"),
  unifiedEditRefresh: true,
  unifiedHistoryRefresh: true,
  preparedPanelRefresh: true,
  checkedPureApiPaths: 7
}, null, 2));

function functionBlock(name, nextName = "function ") {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `找不到函数 ${name}`);
  const next = nextName === "function "
    ? source.indexOf("\nfunction ", start + 1)
    : source.indexOf(`\nfunction ${nextName}(`, start + 1);
  return source.slice(start, next < 0 ? source.length : next);
}

function callbackBlock(name, nextName) {
  const start = source.indexOf(`${name}:`);
  const next = source.indexOf(`${nextName}:`, start + 1);
  assert.ok(start >= 0 && next > start, `找不到回调 ${name}`);
  return source.slice(start, next);
}

function count(text, needle) {
  return text.split(needle).length - 1;
}

function assertOrdered(text, needles, label) {
  let cursor = -1;
  for (const needle of needles) {
    const index = text.indexOf(needle);
    assert.ok(index > cursor, `${label}缺少或顺序错误：${needle}`);
    cursor = index;
  }
}
