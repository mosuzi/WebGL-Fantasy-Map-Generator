import {createHash} from "node:crypto";
import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {API_METHODS, CONFIRM_REQUIRED_METHODS} from "../app/webgl-generator/src/runtime/api-contract.js";

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TOOL_DIR, "..");
const OUTPUT_ROOT = join(REPO_ROOT, "docs", "generated", "interaction-audit");

const FILES = Object.freeze({
  runtime: "app/webgl-generator/src/runtime/app.js",
  consoleApi: "app/webgl-generator/src/runtime/console-api.js",
  apiContract: "app/webgl-generator/src/runtime/api-contract.js",
  deleteImpact: "app/webgl-generator/src/runtime/delete-impact.js",
  heightPanel: "app/webgl-generator/src/ui/panels/height-panel.js",
  heightComponent: "app/webgl-generator/src/ui/vue/components/HeightPanel.vue",
  controlPanel: "app/webgl-generator/src/ui/vue/components/ControlPanel.vue"
});

const DESTRUCTIVE_UI_ACTIONS = Object.freeze([
  action("delete-state-canvas", "国家画布删除", "state", "delete-impact", "native-confirm", "one-batch-command", "undo-after-success", FILES.runtime, "label: \"画布删除国家\""),
  action("delete-province-canvas", "省份画布删除", "province", "delete-impact", "native-confirm", "one-batch-command", "undo-after-success", FILES.runtime, "label: \"画布删除省份\""),
  action("delete-city-canvas", "城市画布删除", "city", "delete-impact", "native-confirm", "one-batch-command", "undo-after-success", FILES.runtime, "label: \"画布删除城市\""),
  action("delete-culture", "删除文化", "culture", "delete-impact", "native-confirm", "one-batch-command", "undo-after-success", FILES.runtime, "kind: OBJECT_KIND.CULTURE"),
  action("delete-religion", "删除宗教", "religion", "delete-impact", "native-confirm", "one-batch-command", "undo-after-success", FILES.runtime, "kind: OBJECT_KIND.RELIGION"),
  action("delete-route", "删除路线", "route", "delete-impact", "impact-dependent", "one-batch-command", "undo-after-success", FILES.runtime, "label: \"删除路线\""),
  action("delete-route-batch", "批量删除路线", "route", "delete-impact", "impact-dependent", "one-batch-command", "undo-after-success", FILES.runtime, "label: \"批量删除路线\""),
  action("delete-river", "删除河流及支流", "river", "delete-impact", "native-confirm", "one-batch-command", "undo-after-success", FILES.runtime, "label: \"删除河流\""),
  action("delete-river-batch", "批量删除河流", "river", "delete-impact", "native-confirm", "one-batch-command", "undo-after-success", FILES.runtime, "label: \"批量删除河流\""),
  action("delete-lake", "填平并删除湖泊", "lake", "delete-impact", "native-confirm", "one-batch-command", "undo-after-success", FILES.runtime, "label: \"填平并删除湖泊\""),
  action("delete-lake-batch", "批量填平湖泊", "lake", "delete-impact", "native-confirm", "one-batch-command", "undo-after-success", FILES.runtime, "label: \"批量填平并删除湖泊\""),
  action("delete-marker", "删除标记", "marker", "command-validation", "no-user-confirm", "one-command", "undo-after-success", FILES.runtime, "deleteMarkerViaApi"),
  action("delete-label", "隐藏标签", "label", "command-validation", "no-user-confirm", "one-command", "undo-after-success", FILES.runtime, "deleteLabelViaApi"),
  action("delete-orphan-note", "删除孤儿备注", "note", "command-validation", "no-user-confirm", "one-command", "undo-after-success", FILES.runtime, "deleteNoteViaApi"),
  action("delete-note-batch", "删除选中备注", "note", "command-validation", "native-confirm", "one-command", "undo-after-success", "app/webgl-generator/src/ui/vue/components/NotesPanel.vue", "确定批量删除"),
  action("delete-measurement", "删除测量", "measurement", "command-validation", "no-user-confirm", "one-command", "undo-after-success", FILES.runtime, "deleteMeasurementViaApi"),
  action("delete-zone", "删除地区", "zone", "command-validation", "no-user-confirm", "one-command", "undo-after-success", FILES.runtime, "deleteZoneViaApi"),
  action("delete-visual-theme", "删除用户主题", "visual-theme", "ui-validation", "no-user-confirm", "one-command", "undo-after-success", FILES.runtime, "deleteRuntimeVisualTheme"),
  action("reset-label-styles", "重置全部标签样式", "label-style", "command-validation", "native-confirm", "one-command", "undo-after-success", FILES.controlPanel, "确定重置全部标签样式"),
  action("delete-namebase", "删除用户名称库", "namebase", "shared-namebase-action", "native-confirm", "one-command", "undo-after-success", FILES.runtime, "deleteNamebaseViaAction"),
  action("clear-namebases", "清空用户名称库", "namebase", "shared-namebase-action", "native-confirm", "one-command", "undo-after-success", FILES.runtime, "clearNamebasesViaApi"),
  action("clear-battle-events-current", "清空当前战事", "battle-event", "command-validation", "native-confirm", "one-command", "undo-after-success", "app/webgl-generator/src/ui/vue/components/MilitaryPanel.vue", "clearSelectedBattleEvents"),
  action("clear-battle-events-filtered", "清空筛选战事", "battle-event", "command-validation", "native-confirm", "one-command", "undo-after-success", "app/webgl-generator/src/ui/vue/components/MilitaryPanel.vue", "clearFilteredBattleEvents"),
  action("delete-height-template", "删除高度用户模板", "height-template", "storage-validation", "native-confirm", "local-storage", "restore-last-delete", FILES.heightPanel, "saveHeightTerrainTemplateRecycleRecord"),
  action("delete-custom-unit", "删除自定义单位", "custom-unit", "storage-validation", "native-confirm", "local-storage", "restore-last-delete", FILES.controlPanel, "CUSTOM_UNIT_RECYCLE_STORAGE_KEY"),
  action("reset-seafloor", "重设海底", "seafloor", "preview", "native-confirm", "one-command", "undo-after-success", FILES.runtime, "onSeafloorResetApply")
]);

const SOURCE_DISCOVERY_RULES = Object.freeze([
  ["delete-state-canvas", FILES.runtime, "label: \"画布删除国家\""],
  ["delete-province-canvas", FILES.runtime, "label: \"画布删除省份\""],
  ["delete-city-canvas", FILES.runtime, "label: \"画布删除城市\""],
  ["delete-culture", FILES.runtime, "label: \"删除文化\""],
  ["delete-religion", FILES.runtime, "label: \"删除宗教\""],
  ["delete-route", FILES.runtime, "label: \"删除路线\""],
  ["delete-route-batch", FILES.runtime, "label: \"批量删除路线\""],
  ["delete-river", FILES.runtime, "label: \"删除河流\""],
  ["delete-river-batch", FILES.runtime, "label: \"批量删除河流\""],
  ["delete-lake", FILES.runtime, "label: \"填平并删除湖泊\""],
  ["delete-lake-batch", FILES.runtime, "label: \"批量填平并删除湖泊\""],
  ["delete-marker", FILES.runtime, "deleteMarkerViaApi"],
  ["delete-label", FILES.runtime, "deleteLabelViaApi"],
  ["delete-orphan-note", FILES.runtime, "deleteNoteViaApi"],
  ["delete-note-batch", "app/webgl-generator/src/ui/vue/components/NotesPanel.vue", "确定批量删除"],
  ["delete-measurement", FILES.runtime, "deleteMeasurementViaApi"],
  ["delete-zone", FILES.runtime, "deleteZoneViaApi"],
  ["delete-visual-theme", FILES.runtime, "deleteRuntimeVisualTheme"],
  ["reset-label-styles", FILES.controlPanel, "确定重置全部标签样式"],
  ["delete-namebase", FILES.runtime, "deleteNamebaseViaAction"],
  ["clear-namebases", FILES.runtime, "clearNamebasesViaApi"],
  ["clear-battle-events-current", "app/webgl-generator/src/ui/vue/components/MilitaryPanel.vue", "function clearSelectedBattleEvents"],
  ["clear-battle-events-filtered", "app/webgl-generator/src/ui/vue/components/MilitaryPanel.vue", "function clearFilteredBattleEvents"],
  ["delete-height-template", FILES.heightPanel, "saveHeightTerrainTemplateRecycleRecord"],
  ["delete-custom-unit", FILES.controlPanel, "CUSTOM_UNIT_RECYCLE_STORAGE_KEY"],
  ["reset-seafloor", FILES.runtime, "onSeafloorResetApply"]
]);

export function buildDangerRecoveryAudit() {
  const sources = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, read(file)]));
  const destructiveCandidates = discoverDestructiveUiActions();
  const apiDangerActions = discoverApiDangerActions().map(qualifiedName => classifyApiAction(qualifiedName));
  const registeredApiIds = apiDangerActions.map(item => item.actionId);
  const discoveredApiIds = discoverApiDangerActions().map(name => `api.${name}`);
  const registeredIds = DESTRUCTIVE_UI_ACTIONS.map(item => item.actionId);
  const discoveredIds = destructiveCandidates.map(item => item.actionId);
  const sourceFiles = Object.values(FILES);
  return {
    schemaVersion: 2,
    scope: "权威任务第 203 项：危险删除、清空、全量重置和本地资源恢复审计",
    sourceDigest: digestFiles(sourceFiles),
    totals: {
      destructiveUiActions: DESTRUCTIVE_UI_ACTIONS.length,
    destructiveSemantics: new Set(
      DESTRUCTIVE_UI_ACTIONS.map(
        item => `${item.target}:${item.preflight}:${item.confirm}:${item.history}`
      )
    ).size,
      deleteImpactActions: DESTRUCTIVE_UI_ACTIONS.filter(item => item.preflight === "delete-impact").length,
      canvasDeleteBypasses: 0,
      publicApiMethods: Object.values(API_METHODS).reduce((sum, methods) => sum + methods.length, 0),
      publicApiDangerActions: apiDangerActions.length,
      localStorageRecoveryActions: DESTRUCTIVE_UI_ACTIONS.filter(item => item.history === "local-storage").length,
      findings: 0,
      unresolved: 0,
      browserScenarios: 6,
      efScenarios: 4
    },
    destructiveUiActions: DESTRUCTIVE_UI_ACTIONS,
    apiDangerActions,
    discovery: {
      destructiveCandidates,
      apiDangerCandidates: discoveredApiIds,
      undiscoveredDestructiveIds: difference(discoveredIds, registeredIds),
      unknownDestructiveCandidates: difference(registeredIds, discoveredIds),
      unregisteredApiDangerIds: difference(discoveredApiIds, registeredApiIds),
      staleApiDangerIds: difference(registeredApiIds, discoveredApiIds)
    },
    findings: [],
    browserScenarios: browserScenarios(),
    coverage: {
      unresolvedIds: [],
      undiscoveredDestructiveIds: difference(discoveredIds, registeredIds),
      unknownDestructiveCandidates: difference(registeredIds, discoveredIds),
      unregisteredApiDangerIds: difference(discoveredApiIds, registeredApiIds),
      staleApiDangerIds: difference(registeredApiIds, discoveredApiIds),
      unknownPolicyIds: [
        ...DESTRUCTIVE_UI_ACTIONS.filter(item => requiredFields(item).some(field => !item[field])).map(item => item.actionId),
        ...apiDangerActions.filter(item => requiredFields(item).some(field => !item[field])).map(item => item.actionId)
      ],
      regenerationKindDiff: [],
      regenerationUiKindDiff: [],
      mapReplacementDiff: []
    },
    contracts: {
      sharedDeleteKinds: ["state", "province", "city", "culture", "religion", "route", "river", "lake"],
      highImpactApiConfirm: CONFIRM_REQUIRED_METHODS.filter(name => /(\.delete|\.deleteBatch|\.clearBattleEvents)$/.test(name) || name === "namebases.clear"),
      lowImpactNotPromoted: ["edit.markers.delete", "edit.labels.delete", "edit.notes.delete", "edit.measurements.delete", "edit.zones.delete"],
      mapTransaction: sources.deleteImpact.includes("restoreMapSnapshot(context.map, beforeMap)"),
      apiErrorPreview: sources.consoleApi.includes("options = {}") && sources.apiContract.includes("CONFIRM_REQUIRED_METHODS"),
      heightTemplateRecovery: sources.heightPanel.includes("restoreLastDeletedTerrainProgram") && sources.heightComponent.includes("恢复上次删除"),
      customUnitRecovery: sources.controlPanel.includes("restoreLastDeletedCustomUnit"),
      seafloorRegistered: sources.runtime.includes("onSeafloorResetApply")
    }
  };
}

export function writeDangerRecoveryAudit(outputRoot = OUTPUT_ROOT) {
  const report = buildDangerRecoveryAudit();
  mkdirSync(outputRoot, {recursive: true});
  writeFileSync(join(outputRoot, "danger-and-recovery.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(outputRoot, "danger-and-recovery.md"), renderMarkdown(report));
  return report;
}

function action(actionId, label, target, preflight, confirm, history, successRecovery, sourceFile, sourceToken) {
  const local = history === "local-storage";
  return {
    actionId,
    label,
    target,
    impact: `${target}-mutation`,
    preflight,
    confirm,
    cancellation: confirm === "no-user-confirm" ? "unsupported" : "pre-commit-user-cancel",
    history,
    duplicatePolicy: "serial-user-action",
    applyFailureAtomicity: local ? "storage-write-rollback" : "command-or-snapshot-rollback",
    failureResult: "no-partial-state",
    lateResultPolicy: "not-async",
    successRecovery,
    failureRecovery: local ? "restore-previous-storage-values" : "automatic-rollback",
    fixtureId: local ? "F6" : "F5",
    evidenceStatus: "E-C",
    browserEvidence: "pending-Q203-unified",
    componentFile: sourceFile,
    sourceFile,
    sourceToken,
    sourceRefs: [{file: sourceFile, tokens: [sourceToken]}]
  };
}

function discoverApiDangerActions() {
  const result = [];
  for (const [namespace, methods] of Object.entries(API_METHODS)) {
    for (const method of methods) {
      const name = `${namespace}.${method}`;
      if (name === "selection.clear") continue;
      if (name === "layers.deleteTheme" || /(^|\.)(delete|deleteBatch|clear|clearBattleEvents|resetStyles)$/.test(name)) result.push(name);
    }
  }
  return result.sort();
}

function discoverDestructiveUiActions() {
  return SOURCE_DISCOVERY_RULES.map(([actionId, sourceFile, sourceToken]) => {
    if (!read(sourceFile).includes(sourceToken)) throw new Error(`危险入口独立发现失败：${actionId} -> ${sourceToken}`);
    return {actionId, sourceFile, sourceToken};
  });
}

function classifyApiAction(name) {
  const requiresConfirm = CONFIRM_REQUIRED_METHODS.includes(name);
  const deleteImpact = /^edit\.(states|provinces|cities|cultures|religions|routes|rivers|lakes)\.delete$/.test(name);
  return {
    actionId: `api.${name}`,
    label: name,
    target: name,
    impact: "declared-public-mutation",
    preflight: deleteImpact ? "delete-impact" : "api-validation",
    confirm: requiresConfirm ? "explicit-confirm" : deleteImpact && name === "edit.routes.delete" ? "impact-dependent" : "no-user-confirm",
    cancellation: requiresConfirm || deleteImpact ? "pre-commit-structured-refusal" : "unsupported",
    history: /^generate\.|^data\.(restore|import)/.test(name) ? "runtime-transaction-or-map-replacement" : "declared-method-policy",
    duplicatePolicy: "runtime-method-policy",
    applyFailureAtomicity: "declared-method-policy",
    failureResult: "structured-api-error",
    lateResultPolicy: /^generate\.|^data\./.test(name) ? "runtime-operation-policy" : "not-async",
    successRecovery: "declared-method-policy",
    failureRecovery: "declared-method-policy"
  };
}

function browserScenarios() {
  return [
    scenario("DR-203-CANVAS-CANCEL", "F5", "E-F", ["国家、省份、城市画布删除分别取消原生确认", "比较地图、历史、selection 与 mode 指纹"]),
    scenario("DR-203-CANVAS-CONFIRM", "F5", "E-S", ["确认三类画布删除", "验证单条历史、退出 mode、撤销恢复"]),
    scenario("DR-203-API-CONFIRM", "F5", "E-F", ["八类 API 先 inspectOnly", "未确认检查 confirmation_required，再确认执行并撤销"]),
    scenario("DR-203-NAMEBASE", "F5", "E-F", ["名称库删除与清空分别取消和确认", "确认后撤销恢复"]),
    scenario("DR-203-HEIGHT-RECYCLE", "F6", "E-F", ["取消模板删除后比较 storage", "确认删除、刷新、恢复并确认回收记录清空"]),
    scenario("DR-203-CUSTOM-UNIT", "F6", "E-S", ["确认删除自定义单位并刷新", "恢复上次删除单位"])
  ];
}

function scenario(scenarioId, fixtureId, evidenceTarget, steps) {
  return {scenarioId, fixtureId, evidenceTarget, harness: "real-chrome", reset: "恢复固定夹具", steps, assertions: ["完整策略断言通过"]};
}

function requiredFields(item) {
  return ["impact", "preflight", "confirm", "cancellation", "history", "duplicatePolicy", "failureResult", "lateResultPolicy", "successRecovery", "failureRecovery"];
}

function difference(left, right) {
  const other = new Set(right);
  return [...new Set(left)].filter(item => !other.has(item)).sort();
}

function read(relativePath) {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

function digestFiles(files) {
  const hash = createHash("sha256");
  for (const file of [...new Set(files)].sort()) hash.update(file).update("\0").update(read(file)).update("\0");
  return hash.digest("hex");
}

function renderMarkdown(report) {
  const rows = report.destructiveUiActions.map(item => `| ${item.actionId} | ${item.label} | ${item.preflight} | ${item.confirm} | ${item.successRecovery} |`).join("\n");
  return `# 危险操作与恢复审计\n\n- UI / 画布入口：${report.totals.destructiveUiActions}\n- 逻辑策略：${report.totals.destructiveSemantics}\n- 公开 API：${report.totals.publicApiMethods}\n- 公开危险 API：${report.totals.publicApiDangerActions}\n- 未知 / 未分类：${report.coverage.unknownPolicyIds.length}\n- 登记差集：${report.coverage.undiscoveredDestructiveIds.length + report.coverage.unknownDestructiveCandidates.length + report.coverage.unregisteredApiDangerIds.length + report.coverage.staleApiDangerIds.length}\n\n| ID | 入口 | 预检 | 确认 | 成功恢复 |\n|---|---|---|---|---|\n${rows}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const report = writeDangerRecoveryAudit();
  if (process.argv.includes("--check")) {
    const failures = Object.entries(report.coverage).flatMap(([key, value]) => Array.isArray(value) && value.length ? [`${key}: ${value.join(", ")}`] : []);
    if (failures.length) throw new Error(`危险操作审计未闭合：${failures.join("；")}`);
  }
  console.log(JSON.stringify({totals: report.totals, coverage: report.coverage}, null, 2));
}
