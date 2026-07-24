import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildDangerRecoveryAudit} from "./webgl-generator-interaction-danger-recovery-audit.mjs";

const report = buildDangerRecoveryAudit();
const generated = JSON.parse(readFileSync(new URL("../docs/generated/interaction-audit/danger-and-recovery.json", import.meta.url), "utf8"));
assert.deepEqual(generated, report, "危险操作与恢复报告不得落后于当前源码");

assert.equal(report.totals.destructiveUiActions, 26);
assert.equal(report.totals.destructiveSemantics, 21);
assert.equal(report.totals.canvasDeleteBypasses, 0);
assert.equal(report.totals.publicApiMethods, 208);
assert.equal(report.totals.publicApiDangerActions, 18);
assert.equal(report.totals.localStorageRecoveryActions, 2);
assert.equal(new Set(report.destructiveUiActions.map(item => item.actionId)).size, 26);
assert.deepEqual(report.destructiveUiActions.filter(item => item.history === "local-storage").map(item => item.actionId), ["delete-height-template", "delete-custom-unit"]);
assert(report.destructiveUiActions.filter(item => item.actionId.endsWith("-canvas")).every(item => item.preflight === "delete-impact" && item.confirm === "native-confirm"));
assert(report.destructiveUiActions.filter(item => item.history === "one-batch-command").every(item => item.applyFailureAtomicity === "command-or-snapshot-rollback" && item.failureRecovery === "automatic-rollback"));
assert(report.contracts.mapTransaction, "批量删除缺少整图快照回滚");
assert(report.contracts.heightTemplateRecovery && report.contracts.customUnitRecovery && report.contracts.seafloorRegistered);
assert(!report.apiDangerActions.some(item => item.actionId === "api.edit.labels.resetStyles"), "未公开的 labels.resetStyles 不得进入 API 分母");
assert.deepEqual(report.apiDangerActions.map(item => item.actionId), [
  "api.edit.cities.delete",
  "api.edit.cultures.delete",
  "api.edit.labels.delete",
  "api.edit.lakes.delete",
  "api.edit.markers.delete",
  "api.edit.measurements.delete",
  "api.edit.military.clearBattleEvents",
  "api.edit.notes.delete",
  "api.edit.notes.deleteBatch",
  "api.edit.provinces.delete",
  "api.edit.religions.delete",
  "api.edit.rivers.delete",
  "api.edit.routes.delete",
  "api.edit.states.delete",
  "api.edit.zones.delete",
  "api.layers.deleteTheme",
  "api.namebases.clear",
  "api.namebases.delete"
]);
for (const value of Object.values(report.coverage)) assert.deepEqual(value, []);

console.log(JSON.stringify({totals: report.totals, coverage: report.coverage}, null, 2));
