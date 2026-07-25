import assert from "node:assert/strict";
import {buildCellActionReplanningMatrix} from "./webgl-generator-cell-action-replanning-matrix.mjs";

const report = buildCellActionReplanningMatrix();

assert.equal(report.totals.runtimeModes, 28, "运行时模式分母必须为 28");
assert.equal(report.totals.classifiedModes, 28, "28 个模式必须全部分类");
assert.equal(report.totals.directFamilies, 19, "非注册直接操控分母必须为 19");
assert.equal(report.totals.classifiedDirectFamilies, 19, "19 类直接操控必须全部分类");
assert.equal(report.totals.directInstances, 89, "非注册直接操控必须展开当前 89 个宿主实例");
assert.equal(report.totals.classifiedDirectInstances, 89, "89 个宿主实例必须全部归入已分类直接操控");
assert.equal(report.totals.deferredOwned195, 4, "必须消费第 200 项全部四类 deferred-owned:195");
assert.equal(report.totals.classifiedDeferredOwned195, 4, "四类 deferred-owned:195 必须全部归入实施阶段");
assert.equal(report.totals.rows, 47, "矩阵必须包含 47 行");
assert.equal(report.totals.gaps, 0, "矩阵双向差集和结构缺口必须为 0");
assert.deepEqual(
  Object.fromEntries(report.upstreamDeferredCapabilities.map(item => [item.capabilityId, item.phases])),
  {
    "cell.action-inspection": ["C"],
    "cell.controlled-write": ["C", "D"],
    "cell.read": ["A"],
    "cell.visual-diagnostics": ["B"]
  },
  "第 200 项四类 deferred 必须稳定归入 A～D"
);

const modeRows = report.rows.filter(row => row.sourceKind === "canvas-mode");
assert.ok(modeRows.every(row => row.phase === "C"), "全部注册模式必须归入阶段 C registry");
for (const domain of ["states", "provinces", "cities"]) {
  const row = modeRows.find(item => item.actionId === `${domain}.createAtCell`);
  assert.ok(row, `${domain}.createAtCell 必须进入矩阵`);
  assert.equal(row.phase, "C", `${domain}.createAtCell 必须与另外两族同阶段`);
  assert.equal(row.inspectTarget, `edit.${domain}.inspectCreateAtCell`);
  assert.equal(row.executeTarget, `edit.${domain}.createAtCell`);
}

assert.equal(new Set(report.rows.map(row => row.actionId)).size, report.rows.length, "actionId 必须唯一");
assert.ok(report.rows.every(row => row.sourceEntries.length > 0 && row.sourceRefs.length > 0), "每行必须有来源入口和源码引用");
assert.ok(report.rows.every(row => row.inspectTarget && row.executeTarget), "每行必须有 inspect / execute 目标或显式排除目标");
for (const field of ["rowId", "sourceKind", "actionId", "title", "inputSpace", "inspectTarget", "executeTarget", "phase", "status", "historyAndRollback", "compatibility"]) {
  assert.ok(report.rows.every(row => typeof row[field] === "string" && row[field].trim()), `每行必填字段 ${field} 不得为空`);
}
assert.ok(!JSON.stringify(report).includes("cells.execute("), "不得规划通用任意写执行器");
assert.equal(report.canonicalInspectorSignature, "cells.inspectAction(actionId, input, options = {})");
assert.deepEqual(report.revisionContract.tokenBinding, ["mapIdentity", "mapRevision", "actionId", "normalizedInputFingerprint", "inspectorSchemaVersion"]);

console.log(JSON.stringify({
  ok: true,
  modes: report.totals.classifiedModes,
  directFamilies: report.totals.classifiedDirectFamilies,
  rows: report.totals.rows,
  gaps: report.totals.gaps
}, null, 2));
