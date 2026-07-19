import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildCoreFlowAudit} from "./webgl-generator-interaction-core-flow-audit.mjs";

const report = buildCoreFlowAudit();
const generatedReport = JSON.parse(readFileSync(new URL("../docs/generated/interaction-audit/core-task-flows.json", import.meta.url), "utf8"));
assert.deepEqual(generatedReport, report, "生成的高频任务账本不得落后于当前源码与生成器");
const requiredGoals = ["启动", "生成", "本地文件", "浏览器", "导入", "PNG", "适配", "平移和缩放", "对象详情", "领域面板", "筛选", "定位", "重命名", "撤销和重做"];

assert.equal(report.totals.flows, 14, "高频核心审计应冻结 14 条任务链");
assert.ok(report.totals.visibleActions >= 100, "高频核心审计必须展开全部可见动作宿主，不能只保留代表样例");
assert.equal(report.totals.codeConfirmed, 14, "全部高频链必须完成 E-C");
assert.equal(report.totals.browserPending, 14, "第 102 项不得提前声明浏览器证据");
assert.equal(report.totals.unknownResults, 0, "高频链不得保留未知结果");
assert.equal(report.totals.missingDecisions, 0, "每条结论必须引用既有决定");
assert.equal(report.totals.findings, 2, "两个静态静默风险必须登记并等待第 107 项验证");
assert.equal(report.totals.unresolvedSurfaceRefs, 0, "任务链 surfaceId 必须全部引用第 101 项 included 分母");
assert.ok(requiredGoals.every(keyword => report.flows.some(item => item.userGoal.includes(keyword))), "高频用户目标覆盖不完整");
assert.ok(report.flows.every(item => item.chain.length >= 4 && item.chain.every(step => step.file && step.symbols.length)), "每条任务链必须包含至少四层可执行源码证据");
assert.ok(report.flows.every(item => item.visibleActions.length && item.visibleActions.every(action => action.sourceRefs.length && action.evidenceStatus === "E-C")), "每个可见动作都必须有源码入口证据");
assert.ok(report.flows.every(item => item.visibleActions.every(action => action.result && action.historyEffect && action.feedback && action.recovery && action.severity && action.confidence && typeof action.intB === "boolean")), "每个可见动作都必须有结果、历史、反馈、恢复、严重度、信心与 INT-B 结论");
assert.ok(report.flows.every(item => item.evidenceStatus === "E-C" && item.browserEvidence === "pending-Q107"), "静态证据与浏览器待验状态必须分开");
assert.ok(report.flows.every(item => item.severity === "N/A" && item.confidence === "代码确认" && item.intB === false), "正常行为结论必须有严重度、信心与 INT-B 判定");
assert.ok(report.findings.every(item => item.evidenceStatus === "E-C" && item.browserEvidence === "pending-Q107" && item.intB === true), "问题候选必须保持静态证据边界并标记行为变化");
assert.ok(report.findings.every(item => ["P0", "P1", "P2", "P3"].includes(item.severity) && ["代码确认", "浏览器复现", "用户反馈", "待验证"].includes(item.confidence)), "问题候选必须使用专题规定的严重度与信心枚举");

const byId = new Map(report.flows.map(item => [item.flowId, item]));
assert.deepEqual(byId.get("HF-02").visibleActions.map(item => item.actionId), ["generate-button", "random-seed-button"], "生成链必须包含生成与换种子两个可见入口");
assert.ok(byId.get("HF-06").visibleActions.some(item => item.actionId === "quick-export-map"), "快速导出必须包含地图数据按钮");
assert.equal(byId.get("HF-05").visibleActions.find(item => item.actionId === "import-geo")?.historyEffect, "通过导入编辑命令写入可撤销历史", "GEO 导入不得误用完整地图替换的清历史语义");
assert.equal(byId.get("HF-10").visibleActions.length, 25, "24 个领域面板入口和 selection 更新动作分母漂移时必须更新审计");
assert.equal(byId.get("HF-12").visibleActions.length, 17, "列表定位宿主分母漂移时必须更新审计");
assert.equal(byId.get("HF-13").visibleActions.length, 14, "重命名宿主分母漂移时必须更新审计");
assert.equal(byId.get("HF-14").visibleActions.length, 45, "标题栏、内容区与快捷键历史入口分母漂移时必须更新审计");
assert.ok(byId.get("HF-09").visibleActions.some(item => item.actionId === "details-rename"), "对象详情可见子动作必须进入账本");
assert.ok(byId.get("HF-09").visibleActions.filter(item => item.actionId.startsWith("details-")).every(item => item.sourceRefs.some(ref => ref.file.endsWith("runtime/app.js") && ref.scope?.anchor === "createObjectDetailsPanel(documentRef")), "对象详情子动作必须逐项追到限定范围的 runtime handler");
assert.ok(byId.get("HF-10").visibleActions.filter(item => item.actionId.startsWith("open-")).every(item => item.sourceRefs.some(ref => ref.scope?.end === "next-open-handler" && ref.tokens.some(token => token.includes("state.panels.")))), "领域面板入口必须逐项追到正确 panel.open handler");
assert.ok(byId.get("HF-12").visibleActions.every(item => item.sourceRefs.some(ref => ref.file.includes("/ui/panels/")) && item.sourceRefs.some(ref => ref.file.endsWith("runtime/app.js") && ref.scope)), "列表定位宿主必须逐项追到 wrapper 与限定 runtime handler");
assert.ok(byId.get("HF-13").visibleActions.every(item => item.sourceRefs.some(ref => ref.file.includes("/ui/panels/")) && item.sourceRefs.some(ref => ref.file.endsWith("runtime/app.js") && ref.scope)), "重命名宿主必须逐项追到 wrapper、runtime 与具体命令");
assert.ok(byId.get("HF-14").visibleActions.filter(item => /-(?:panel)$/.test(item.actionId)).every(item => item.sourceRefs.some(ref => ref.file.endsWith("runtime/app.js") && ref.scope)), "面板历史入口必须逐项追到限定 runtime handler");
assert.ok(byId.get("HF-14").chain.some(step => step.file.endsWith("panel-manager.js")) && byId.get("HF-14").chain.some(step => step.file.endsWith("edit-history.js")), "撤销 / 重做链必须经过真实按钮宿主与历史栈");

console.log(JSON.stringify({totals: report.totals, flowIds: report.flows.map(item => item.flowId)}, null, 2));
