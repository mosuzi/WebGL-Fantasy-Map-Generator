import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildKeyboardVisualAudit} from "./webgl-generator-interaction-keyboard-visual-audit.mjs";

const report = buildKeyboardVisualAudit();
const generated = JSON.parse(readFileSync(new URL("../docs/generated/interaction-audit/keyboard-focus-responsive-visual.json", import.meta.url), "utf8"));
assert.deepEqual(generated, report, "键盘与视觉审计报告不得落后于当前源码");

assert.deepEqual(report.totals, {
  shortcuts: 22,
  shortcutBindings: 23,
  shortcutConflicts: 0,
  keyboardListeners: 5,
  keyboardActionConsumers: 4,
  keyboardInputTrackers: 1,
  localKeyboardActions: 2,
  localKeyboardBindings: 3,
  focusDefinitions: 12,
  focusEntries: 8,
  focusExcluded: 4,
  focusSinkDefinitions: 3,
  managedOverlayInstances: 49,
  managedDialogInstances: 22,
  dynamicFocusableFactories: 1,
  escapeConsumers: 2,
  escapeExcluded: 1,
  responsiveBreakpoints: 2,
  responsiveContainerQueries: 2,
  layerContracts: 8,
  targetSizeContracts: 8,
  stateBannerKinds: 7,
  findings: 5,
  pureUiFindings: 2,
  behaviorFindings: 3,
  browserCases: 12,
  unresolved: 0
});
assert.equal(new Set(report.shortcuts.map(item => item.id)).size, 22);
assert.equal(new Set(report.keyboardConsumers.map(item => item.id)).size, 5);
assert.equal(new Set(report.focusDefinitions.map(item => item.id)).size, 12);
assert.equal(report.focusDefinitions.filter(item => item.included).length, 8);
assert.ok(report.focusDefinitions.filter(item => !item.included).every(item => item.exclusionReason), "隐藏桥接排除项必须有理由");
assert.equal(report.managedOverlayInstances.length, 49);
assert.deepEqual(["panel-manager", "action-dock", "fixed-workbench", "tree-dialog"].map(kind => [kind, report.managedOverlayInstances.filter(item => item.kind === kind).length]), [["panel-manager", 27], ["action-dock", 18], ["fixed-workbench", 2], ["tree-dialog", 2]]);
assert.equal(report.managedOverlayInstances.filter(item => item.role === "dialog").length, 22);
assert.deepEqual(report.localKeyboardActions.map(item => [item.id, item.bindings]), [["measurement-handle-delete", ["Delete", "Backspace"]], ["color-field-enter", ["Enter"]]]);
assert.deepEqual(report.escapeContracts.filter(item => item.included).map(item => item.id), ["overlay-escape", "selection-cancel"]);
assert.ok(report.escapeContracts.filter(item => !item.included).every(item => item.exclusionReason), "排除的 Escape 字面量必须有理由");
assert.deepEqual(report.responsive.mediaBreakpoints.map(item => item.maxWidthPx), [520, 720]);
assert.deepEqual(report.responsive.containerQueries.map(item => item.maxWidthPx), [520, 320]);
assert.deepEqual(report.responsive.cssInventory, {zIndexDeclarations: 33, baseOverflowDeclarations: 60, axisOverflowDeclarations: 0, nowrapDeclarations: 40, ellipsisDeclarations: 24, wrapDeclarations: 55});
assert.deepEqual(report.responsive.viewports.map(item => item.id), ["desktop", "narrow", "css-stress"]);
assert.deepEqual([...new Set(report.browserMatrix.map(item => item.variantId))], ["baseline", "long-zh", "expanded-options", "font-and-states"]);
assert.ok(report.browserMatrix.every(item => item.checklistIds.length >= 6 && item.evidenceStatus === "E-C" && item.browserEvidence === "pending-Q107"));
assert.equal(report.browserChecklist.length, 12);
for (const viewportId of ["desktop", "narrow", "css-stress"]) {
  assert.deepEqual([...new Set(report.browserMatrix.filter(item => item.viewportId === viewportId).flatMap(item => item.checklistIds))].sort(), report.browserChecklist.map(item => item.id).sort(), `${viewportId} 四个变体合并后必须覆盖统一 12 项检查表`);
}
assert.ok(report.visualContracts.layering.find(item => item.id === "managed-overlays").value.startsWith(">=900"));
assert.equal(report.visualContracts.layering.find(item => item.id === "hover-and-scale").value, "5");
assert.equal(report.visualContracts.layering.find(item => item.id === "measurement").value, "4");
assert.ok(report.visualContracts.targetSizes.some(item => item.declaredSize === "14×14"));
assert.ok(report.visualContracts.targetSizes.some(item => item.declaredSize.startsWith("8×")));
assert.deepEqual(report.visualContracts.stateBanners.map(item => item.kind), ["selected", "editing", "preview", "stale", "empty", "error", "orphan"]);
assert.deepEqual(report.visualContracts.stateBanners.filter(item => item.role === "alert").map(item => item.kind), ["error", "orphan"]);
assert.deepEqual(report.findings.map(item => item.id), ["IA-106-001", "IA-106-002", "IA-106-003", "IA-106-004", "IA-106-005"]);
assert.equal(report.findings.filter(item => item.changeClass === "INT-B").length, 3);
assert.equal(report.findings.filter(item => item.changeClass === "UI-only").length, 2);
assert.ok(report.findings.every(item => ["high", "medium"].includes(item.confidence) && item.evidence && item.recommendation && item.sourceRefs.length && item.evidenceStatus === "E-C"));
assert.deepEqual(report.coverage.unknownFocusCandidates, []);
assert.deepEqual(report.coverage.missingFocusEntries, []);
assert.deepEqual(report.coverage.unknownKeyboardCandidates, []);
assert.deepEqual(report.coverage.missingKeyboardConsumers, []);
assert.deepEqual(report.coverage.unknownEscapeLiterals, []);
assert.deepEqual(report.coverage.missingEscapeContracts, []);
assert.deepEqual(report.coverage.fixedOverlayDiff, []);
assert.deepEqual(report.coverage.unresolved, []);
assert.ok([...report.visualContracts.layering.slice(1), ...report.visualContracts.targetSizes, ...report.visualContracts.focusStyles, ...report.visualContracts.statusStyles].every(item => item.sourceRefs.every(sourceRef => sourceRef.cssSelector)), "视觉声明必须按 selector block 校验，不能只做全文件 token includes");

console.log(JSON.stringify({totals: report.totals, findings: report.findings.map(item => item.id)}, null, 2));
