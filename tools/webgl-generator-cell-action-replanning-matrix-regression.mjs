import assert from "node:assert/strict";
import {buildCellActionReplanningMatrix} from "./webgl-generator-cell-action-replanning-matrix.mjs";

const report = buildCellActionReplanningMatrix();

assert.equal(report.totals.runtimeModes, 29, "运行时模式分母必须为 29");
assert.equal(report.totals.classifiedModes, 29, "29 个模式必须全部分类");
assert.equal(report.totals.directFamilies, 19, "非注册直接操控分母必须为 19");
assert.equal(report.totals.classifiedDirectFamilies, 19, "19 类直接操控必须全部分类");
assert.equal(report.totals.directInstances, 89, "非注册直接操控必须展开当前 89 个宿主实例");
assert.equal(report.totals.classifiedDirectInstances, 89, "89 个宿主实例必须全部归入已分类直接操控");
assert.equal(report.totals.task195Capabilities, 4, "必须消费第 200 项全部四类 Cell 能力");
assert.equal(report.totals.classifiedTask195Capabilities, 4, "四类 Cell 能力必须全部归入实施阶段");
assert.equal(report.totals.plannedRegistryRows, 34, "planned-registry 分母必须为 34");
assert.equal(report.totals.implementedRegistryRows, 34, "实际 Cell action registry 必须为 34");
assert.equal(report.totals.rows, 48, "矩阵必须包含 48 行");
assert.equal(report.totals.gaps, 0, "矩阵双向差集和结构缺口必须为 0");
assert.deepEqual(
  Object.fromEntries(report.upstreamTask195Capabilities.map(item => [item.capabilityId, item.phases])),
  {
    "cell.action-inspection": ["C"],
    "cell.controlled-write": ["C", "D"],
    "cell.read": ["A"],
    "cell.visual-diagnostics": ["B"]
  },
  "第 200 项四类 Cell 能力必须稳定归入 A～D"
);
assert.ok(report.upstreamTask195Capabilities.every(item => item.status === "covered" && item.apiMethods.length > 0), "四类 Cell 能力没有全部转为 covered");
assert.deepEqual(report.coverage.missingRegistryActions, [], "重编排动作缺少实际 registry 项");
assert.deepEqual(report.coverage.extraRegistryActions, [], "实际 registry 出现重编排外动作");

const modeRows = report.rows.filter(row => row.sourceKind === "canvas-mode");
assert.equal(modeRows.find(row => row.modeId === "regeneration-lock:select")?.phase, "B", "共享重生成锁地图多选必须归入第 205 项阶段 B");
assert.ok(modeRows.filter(row => row.modeId !== "regeneration-lock:select").every(row => row.phase === "C"), "既有注册模式必须继续归入阶段 C registry");
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
