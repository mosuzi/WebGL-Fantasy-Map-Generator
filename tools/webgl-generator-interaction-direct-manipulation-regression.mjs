import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildDirectManipulationAudit} from "./webgl-generator-interaction-direct-manipulation-audit.mjs";

const report = buildDirectManipulationAudit();
const generated = JSON.parse(readFileSync(new URL("../docs/generated/interaction-audit/canvas-and-direct-manipulation.json", import.meta.url), "utf8"));
assert.deepEqual(generated, report, "生成的画布与直接操控账本不得落后于当前源码和生成器");

const runtimeIds = report.runtimeModes.map(item => item.modeId).sort();
assert.deepEqual(report.registeredModes, runtimeIds, "注册展开集合必须与运行时常量集合一致");
assert.deepEqual(report.entryModes, runtimeIds, "入口集合必须与运行时常量集合一致");
assert.deepEqual(report.modeContracts.map(item => item.modeId).sort(), runtimeIds, "生命周期契约必须覆盖全部运行时模式");
assert.equal(new Set(runtimeIds).size, runtimeIds.length, "运行时模式不得重复");
assert.equal(report.totals.missingModeContracts, 0);
assert.equal(report.totals.extraModeContracts, 0);
assert.equal(report.totals.missingRegistrations, 0);
assert.equal(report.totals.extraRegistrations, 0);
assert.equal(report.totals.missingEntries, 0);
assert.equal(report.totals.extraEntries, 0);

assert.deepEqual([...report.legacyComparison.missingFromLegacy].sort(), runtimeIds.filter(id => !report.legacyComparison.legacyModeIds.includes(id)).sort(), "旧回归差异必须由当前集合计算");
assert.deepEqual(report.legacyComparison.missingFromLegacy, [], "当前模式回归分母必须覆盖全部运行时模式");

assert.ok(report.modeContracts.every(item => item.entry && item.target && item.cursor && item.gesture && item.preview && item.complete && item.cancel && item.switch && item.escape && item.panelClose && item.mapReplace && item.history && item.recovery), "每个模式必须具有完整生命周期字段");
assert.ok(report.modeContracts.every(item => item.evidenceStatus === "E-C" && item.browserEvidence === "pending-Q107" && item.sourceRefs.length >= 3), "模式静态证据与浏览器待验状态必须分开");
const requiredLifecycleEvidence = ["entry", "target", "cursor", "gesture", "preview", "complete", "cancel", "switch", "escape", "panelClose", "mapReplace", "history", "recovery"];
assert.ok(report.modeContracts.every(item => {
  const supported = new Set(item.sourceRefs.flatMap(ref => ref.supports || []));
  return requiredLifecycleEvidence.every(field => supported.has(field) && item.evidenceByField[field]?.length && item.evidenceByField[field].every(index => item.sourceRefs[index]?.supports?.includes(field)));
}), "每个模式的 E-C 必须由逐字段源码证据支撑，不能只检查字段非空");
assert.ok(report.modeContracts.every(item => item.sourceRefs.some(ref => ref.pattern?.includes(`CANVAS_TOOL_MODE\\.${item.key}`) || ref.scope?.anchor === "function startMarkerEditMode" && ref.tokens.includes(`CANVAS_TOOL_MODE.${item.key}`)) && item.sourceRefs.filter(ref => ref.scope).length >= 3), "每个模式必须有自己的入口模式和至少三段限域生命周期证据");
assert.equal(report.modeContracts.filter(item => item.cursor === "brush-overlay").length, 8, "八个连续 / 分阶段笔刷必须声明共享半径光标");
assert.equal(report.modeContracts.filter(item => item.cursor === "css-crosshair").length, 1, "测量模式是唯一 crosshair 模式");
assert.equal(report.modeContracts.filter(item => item.cursor === "default").length, runtimeIds.length - 9, "其余模式必须明确记录 default，而不是 unknown");
assert.deepEqual(report.modeContracts.filter(item => item.locksInteraction === false).map(item => item.modeId), ["measurement:draw"], "测量必须是唯一不锁基础交互的注册模式");

assert.equal(report.totals.directFamilies, 19, "直接操控应为 13 条原生路径加 6 类展开宿主");
assert.equal(report.totals.directManipulations, 89, "当前直接操控分母应展开为 89 行");
assert.equal(report.expandedDirectRows.length, 89);
assert.equal(new Set(report.expandedDirectRows.map(item => item.directRowId)).size, 89, "展开行 ID 不得重复");
assert.equal(report.totals.missingDirectClassifications, 0);
assert.equal(report.totals.unresolvedSurfaceRefs, 0);
assert.ok(report.directManipulations.every(item => item.start && item.move && item.complete && item.clickNoMove && item.cancel && item.pointerCancel && item.captureLost && item.conflicts && item.history && item.recovery), "每类直接操控必须明确完整事件生命周期");
assert.ok(report.directManipulations.every(item => item.evidenceStatus === "E-C" && item.browserEvidence === "pending-Q107" && item.intB === false), "直接操控正常行为结论不得冒充浏览器通过或整改结论");

const directById = new Map(report.directManipulations.map(item => [item.directId, item]));
assert.equal(directById.get("DM-14").hostCount, 28, "PanelManager 拖动宿主分母漂移时必须更新审计");
assert.equal(directById.get("DM-15").hostCount, 18, "动作坞拖动宿主分母漂移时必须更新审计");
assert.equal(directById.get("DM-16").hostCount, 1);
assert.equal(directById.get("DM-17").hostCount, 2);
assert.equal(directById.get("DM-18").hostCount, 1);
assert.equal(directById.get("DM-19").hostCount, 26, "23 个 Vue 宿主中的可调列宽表格当前应展开为 26 个实例");
assert.equal(directById.get("DM-19").hostLabels.filter(item => item.startsWith("EconomyPanel.vue#")).length, 3);
assert.equal(directById.get("DM-19").hostLabels.filter(item => item.startsWith("GovernmentPanel.vue#")).length, 2);
assert.equal(new Set(directById.get("DM-19").hostLabels.map(item => item.split("#")[0])).size, 23);
assert.match(directById.get("DM-13").complete, /createUpdateMeasurementPointsCommand/, "测量 UI 编辑保存不得误写为公开 API 路径");
assert.match(directById.get("DM-17").history, /未传 storageKey，不持久化/, "树状浮层没有 storageKey，只能记录会话内位置");

assert.equal(report.findings.length, 5);
assert.deepEqual(report.findings.map(item => item.findingId), ["IA-103-003", "IA-103-004", "IA-103-005", "IA-103-006", "IA-103-007"]);
assert.ok(report.findings.every(item => ["P0", "P1", "P2", "P3"].includes(item.severity) && ["代码确认", "浏览器复现", "用户反馈", "待验证"].includes(item.confidence) && typeof item.intB === "boolean"), "问题候选必须使用专题规定的严重度、信心与 INT-B 字段");
assert.ok(report.findings.filter(item => item.intB).every(item => item.browserEvidence === "pending-Q107"), "行为变化候选必须保留给第 107 项验证");

console.log(JSON.stringify({totals: report.totals, findings: report.findings.map(item => item.findingId)}, null, 2));
