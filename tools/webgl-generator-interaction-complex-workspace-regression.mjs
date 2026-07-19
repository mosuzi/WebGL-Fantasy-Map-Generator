import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildComplexWorkspaceAudit} from "./webgl-generator-interaction-complex-workspace-audit.mjs";

const report = buildComplexWorkspaceAudit();
const generated = JSON.parse(readFileSync(new URL("../docs/generated/interaction-audit/complex-workspaces.json", import.meta.url), "utf8"));
assert.deepEqual(generated, report, "生成的复杂工作区审计报告不得落后于当前源码和生成器");

assert.deepEqual(
  pick(report.totals, ["panelProfiles", "complexWorkspaces", "complexWorkspaceFields", "sharedFields", "exceptionFields", "exportParameterFields"]),
  {panelProfiles: 26, complexWorkspaces: 10, complexWorkspaceFields: 131, sharedFields: 83, exceptionFields: 20, exportParameterFields: 28},
  "复杂面板和字段模板分母漂移时必须重新审计"
);
assert.ok(report.complexWorkspaces.every(item => item.fieldTemplates === item.sharedFields + item.exceptionFields), "每个复杂工作区的字段分母必须闭合");
assert.deepEqual(
  report.complexWorkspaces.filter(item => item.dynamicMultiplicity.length).map(item => item.file).sort(),
  ["app/webgl-generator/src/ui/vue/components/ClimatePanel.vue", "app/webgl-generator/src/ui/vue/components/HeightPanel.vue", "app/webgl-generator/src/ui/vue/components/StatePanel.vue"],
  "动态字段只能记录模板和运行时倍增，不得伪造固定 DOM 数"
);
assert.equal(report.fieldInstances.length, 131);
assert.equal(new Set(report.fieldInstances.map(item => item.fieldId)).size, 131, "字段实例身份必须稳定且唯一");
assert.ok(report.fieldInstances.every(item => ["explicit-apply", "immediate-change", "input-preview-change-commit", "live-local-parameter", "draft-confirm"].includes(item.commitClass)), "全部字段必须进入提交时机词典");
assert.deepEqual(report.totals.fieldCommitClasses, {"draft-confirm": 56, "explicit-apply": 11, "immediate-change": 39, "live-local-parameter": 25}, "字段提交时机分布漂移时必须逐宿主复核");
assert.deepEqual(report.totals.fieldEffects, {"deferred-command": 27, "map-command": 13, "ui-local": 91}, "字段地图影响与历史边界漂移时必须逐宿主复核");
assert.ok(report.fieldInstances.every(item => item.commitTiming && item.effectClass && item.historyBoundary && item.historyEffect && item.validationAndRecovery && item.sourceRefs.length >= 2 && item.evidenceStatus === "E-C" && item.browserEvidence === "pending-Q107"), "字段必须明确提交、影响、历史、恢复、源码和浏览器待验边界");
assert.ok(report.fieldInstances.filter(item => item.effectClass === "map-command").every(item => item.sourceRefs.some(ref => ref.file.endsWith("runtime/app.js")) && /1 条 EditHistory/.test(item.historyEffect)), "立即地图命令必须追到 runtime 并明确一条历史");
assert.ok(report.fieldInstances.filter(item => item.effectClass === "ui-local").every(item => /0 条 EditHistory/.test(item.historyEffect)), "局部字段必须明确零地图历史");

assert.deepEqual(
  pick(report.totals, ["tableHosts", "tableInstances", "independentlyFilterable", "sortable", "primarySelection", "globalSelection", "localSelection", "locate", "doubleClickEdit", "resizable", "virtualCapable", "emptyState", "actionableEmptyState", "batchSelection", "persistentHighlight", "selectedExport"]),
  {tableHosts: 23, tableInstances: 26, independentlyFilterable: 25, sortable: 25, primarySelection: 26, globalSelection: 16, localSelection: 10, locate: 19, doubleClickEdit: 11, resizable: 26, virtualCapable: 26, emptyState: 26, actionableEmptyState: 25, batchSelection: 20, persistentHighlight: 17, selectedExport: 9},
  "对象表格实例能力分母漂移时必须重新审计"
);
assert.equal(new Set(report.tableInstances.map(item => item.tableId)).size, 26);
assert.deepEqual(report.tableInstances.filter(item => !item.independentlyFilterable).map(item => item.tableId), ["GovernmentPanel.vue#2"], "政体国家子表没有独立筛选 / 排序，不得按同宿主控件误判");
assert.deepEqual(report.tableInstances.filter(item => !item.sortable).map(item => item.tableId), ["GovernmentPanel.vue#2"]);
assert.ok(report.tableInstances.every(item => item.rows && item.selectedId && item.columnWidths && item.emptyState && item.resizable && item.virtualCapable), "每张表必须追到 rows、主选中、列宽、空态和虚拟能力");
assert.ok(report.tableInstances.filter(item => item.batchSelection).every(item => /不触发主选中/.test(item.batchContract) && item.sourceRefs.some(ref => ref.file.includes("use-visible-row-selection") || item.tableId === "NamebasePanel.vue#1")), "20 张批量表必须记录可见集合裁剪与主选中隔离");
assert.ok(report.tableInstances.filter(item => item.persistentHighlight).every(item => /100/.test(item.highlightContract) && /不写 EditHistory/.test(item.highlightContract)), "17 张高亮表必须记录上限和零历史边界");
assert.ok(report.tableInstances.every(item => item.locateHistory.includes("不写 EditHistory")), "定位不得冒充地图编辑历史");

assert.deepEqual(
  pick(report.totals, ["actionDockHosts", "actionDockActions", "uniqueActionKeys", "toggleModeActions", "directActions", "secondaryPanelActions", "crossResultActionKeys"]),
  {actionDockHosts: 18, actionDockActions: 68, uniqueActionKeys: 32, toggleModeActions: 12, directActions: 1, secondaryPanelActions: 55, crossResultActionKeys: 2},
  "动作坞结果分母漂移时必须重新审计"
);
assert.equal(report.panelProfiles.reduce((sum, panel) => sum + panel.actionDocks, 0), report.totals.actionDockHosts, "每个源码 Dock 都必须进入宿主分母，不能只读取每个文件的第一个实例");
assert.ok(report.panelProfiles.filter(panel => panel.actionDocks).every(panel => panel.actionDocks === 1), "当前每个动作坞宿主恰好一个；新增第二实例时必须扩展稳定身份");
assert.equal(new Set(report.actionDockActions.map(item => item.actionId)).size, 68, "动作身份必须使用 host + key，不能只用全局 key");
assert.deepEqual(crossResultKeys(report.actionDockActions), ["assign", "edit"], "跨结果类别 key 漂移时必须重新审计动作词典");
assert.ok(report.actionDockActions.filter(item => item.resultClass === "open-secondary").every(item => item.sourceRef.tokens.some(token => token.startsWith("<template #"))), "55 个二级动作必须具有同名 slot");
assert.ok(report.actionDockActions.filter(item => item.resultClass !== "open-secondary").every(item => !item.sourceRef.tokens.some(token => token.startsWith("<template #"))), "模式和直接动作不得伪装为二级面板");

assert.equal(report.visualEvidence.geometryBasis.virtualRowHeight, 32);
assert.equal(report.visualEvidence.geometryBasis.locateRowMinimumHeight, 41);
assert.equal(report.visualEvidence.geometryBasis.fixedCssRowHeight, false);
assert.deepEqual(report.findings.map(item => item.findingId), ["IA-104-001", "IA-104-002", "IA-104-003", "IA-104-004", "IA-104-005"]);
assert.ok(report.findings.every(item => ["P0", "P1", "P2", "P3"].includes(item.severity) && typeof item.intB === "boolean" && item.evidenceStatus === "E-C" && item.browserEvidence === "pending-Q107"));
assert.equal(report.totals.unknownFields, 0);
assert.equal(report.totals.unresolvedTables, 0);
assert.equal(report.totals.unresolvedActions, 0);

console.log(JSON.stringify({totals: report.totals, findings: report.findings.map(item => item.findingId)}, null, 2));

function pick(source, keys) {
  return Object.fromEntries(keys.map(key => [key, source[key]]));
}

function crossResultKeys(actions) {
  const byKey = new Map();
  for (const action of actions) {
    if (!byKey.has(action.key)) byKey.set(action.key, new Set());
    byKey.get(action.key).add(action.resultClass);
  }
  return [...byKey.entries()].filter(([, resultClasses]) => resultClasses.size > 1).map(([key]) => key).sort();
}
