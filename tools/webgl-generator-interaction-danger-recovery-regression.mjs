import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildDangerRecoveryAudit} from "./webgl-generator-interaction-danger-recovery-audit.mjs";

const report = buildDangerRecoveryAudit();
const generated = JSON.parse(readFileSync(new URL("../docs/generated/interaction-audit/danger-and-recovery.json", import.meta.url), "utf8"));
assert.deepEqual(generated, report, "危险操作与恢复报告不得落后于当前源码");

assert.deepEqual(report.totals, {
  destructiveUiActions: 24,
  destructiveSemantics: 19,
  deleteImpactActions: 8,
  canvasDeleteBypasses: 3,
  topologyTransactions: 2,
  regenerationKinds: 11,
  regenerationUiKinds: 8,
  mapReplacementFlows: 5,
  derivedFlows: 4,
  geoImportFlows: 2,
  relatedMutationFlows: 4,
  findings: 8,
  unresolved: 0,
  browserScenarios: 14,
  efScenarios: 12,
  enScenarios: 1
});
assert.equal(new Set(report.destructiveUiActions.map(item => item.actionId)).size, 24);
assert.ok(report.destructiveUiActions.every(item => item.impact && item.preflight && item.confirm && item.history && item.failureResult && item.successRecovery && item.failureRecovery && item.fixtureId && item.evidenceStatus === "E-C" && item.browserEvidence === "pending-Q107"));
assert.deepEqual(report.destructiveUiActions.filter(item => item.history === "local-storage").map(item => item.actionId), ["delete-height-template"], "24 个入口中只有用户高度模板删除完全不进入历史");
assert.equal(report.destructiveUiActions.filter(item => item.history !== "local-storage").length, 23, "其余 23 个入口成功后必须具有可撤销命令边界");
assert.ok(report.destructiveUiActions.every(item => item.successRecovery && item.failureRecovery && item.cancellation && item.applyFailureAtomicity), "成功恢复与 apply 失败恢复必须分开记录");
assert.ok(report.destructiveUiActions.filter(item => item.confirm === "no-user-confirm").every(item => item.cancellation === "unsupported"), "无确认入口不能因字符串包含 confirm 而误报可取消");
assert.ok(report.destructiveUiActions.filter(item => item.confirm === "impact-dependent").every(item => item.cancellation === "pre-commit-user-cancel-when-impact-requires-confirm"), "影响预检入口只能在需要确认时取消");
assert.ok(report.destructiveUiActions.filter(item => item.history === "one-batch-command").every(item => item.applyFailureAtomicity.includes("failing-subcommand-atomicity-not-guaranteed") && item.failureRecovery.includes("reload-F5-if-failing-subcommand-partial")), "批次回滚只能保证已完成前驱命令，不能夸大失败子命令的原子性");
assert.deepEqual(report.destructiveUiActions.filter(item => item.preflight === "canvas-direct-command").map(item => item.actionId), ["delete-state-canvas", "delete-province-canvas", "delete-city-canvas"]);
assert.deepEqual(report.regenerationKinds.map(item => item.kind), ["features", "routes", "rivers", "cities", "states", "provinces", "markers", "diplomacy", "religions", "military", "zones"]);
assert.ok(report.regenerationKinds.every(item => item.confirm === "api-confirm-auto-from-ui"), "重生成入口必须如实记录 UI 自动注入 confirm:true 与 API 显式确认的统一口径");
assert.deepEqual(report.regenerationKinds.filter(item => item.history === "one-command").map(item => item.kind), ["markers", "diplomacy"]);
assert.ok(report.regenerationKinds.filter(item => item.history === "no-history").every(item => item.failureRecovery === "reload-F5"));
assert.ok(report.regenerationKinds.every(item => item.duplicatePolicy.includes("accepted-again")), "同步重生成返回后再次触发会执行第二次，不能误记为去重");
assert.ok(report.mapReplacementFlows.every(item => item.duplicatePolicy === "runtime-operation-operation_busy" && item.failureResult === "structured-operation-error" && item.successRecovery === "reimport-F5" && item.failureRecovery === "runtime-operation-snapshot-rollback" && item.cancellation === "unsupported-after-start"));
assert.deepEqual(report.topologyTransactions.map(item => item.flowId), ["state-merge", "state-split"]);
assert.ok(report.topologyTransactions.every(item => item.history === "one-transaction-command" && item.successRecovery === "undo-after-success" && item.failureRecovery === "automatic-transaction-rollback"));
assert.equal(report.derivedFlows.find(item => item.flowId === "climate-downstream").lateResultPolicy, "no-request-or-map-identity-guard");
for (const flowId of ["climate-downstream", "geo-fmg-cells", "geo-measurements", "notes-replace-import", "namebases-replace-import", "culture-reexpand", "religion-reexpand"]) {
  const item = [...report.derivedFlows, ...report.geoImportFlows, ...report.relatedMutationFlows].find(candidate => candidate.flowId === flowId);
  assert.ok(item && item.preflight !== "map-and-options-validation" && item.preflight !== "unknown", `${flowId} 必须记录现有的具体预检入口`);
}
assert.deepEqual(report.findings.map(item => item.findingId), ["IA-105-001", "IA-105-002", "IA-105-003", "IA-105-004", "IA-105-005", "IA-105-006", "IA-105-007", "IA-105-008"]);
assert.equal(report.findings.filter(item => item.intB).length, 8);
assert.ok(report.browserScenarios.filter(item => item.evidenceTarget === "E-F").every(item => ["F4", "F5", "F6"].includes(item.fixtureId) && item.harness && item.reset && item.steps.length >= 2 && item.assertions.length));
assert.deepEqual(report.browserScenarios.filter(item => item.evidenceTarget === "E-N").map(item => item.scenarioId), ["DR-105-F5-REGENERATE-MID-FAIL"]);
assert.equal(report.discovery.destructiveCandidates.length, 24);
assert.deepEqual(report.discovery.destructiveCandidates.map(item => item.actionId).sort(), report.destructiveUiActions.map(item => item.actionId).sort(), "源码候选必须逐入口双向匹配，不能只比较文件计数");
assert.equal(new Set(report.discovery.destructiveCandidates.map(item => item.actionId)).size, 24, "源码候选不得重复映射到同一危险入口");
assert.deepEqual(report.coverage.undiscoveredDestructiveIds, []);
assert.deepEqual(report.coverage.unknownDestructiveCandidates, []);
assert.deepEqual(report.coverage.regenerationKindDiff, []);
assert.deepEqual(report.coverage.regenerationUiKindDiff, []);
assert.deepEqual(report.coverage.mapReplacementDiff, []);
assert.deepEqual(report.fixtures.map(item => item.stableKey.slice(0, 12)), ["bed96c04273d", "40e629aee30d", "32009e20529e"], "F4～F6 stable key 必须从第101项 manifest 现场派生");
assert.ok(report.fixtures.every(item => item.fingerprint.algorithm === "canonical-json-sha256" && item.fingerprint.fields.length >= 6 && item.fingerprint.capture && item.fingerprint.compare), "破坏性夹具必须提供可执行指纹算法而非字段说明字符串");
assert.deepEqual(report.fixtures.find(item => item.fixtureId === "F4").fingerprint.identityAssertions, ["beforeMap === afterMap"], "无效导入必须单独严格比较地图对象 identity，不能把引用塞进序列化哈希");
assert.equal(report.coverage.unresolvedIds.length, 0);

console.log(JSON.stringify({totals: report.totals, findings: report.findings.map(item => item.findingId)}, null, 2));
