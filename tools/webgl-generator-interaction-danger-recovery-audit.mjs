import {createHash} from "node:crypto";
import {existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {buildFixtureManifest} from "./webgl-generator-interaction-surface-inventory.mjs";

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TOOL_DIR, "..");
const OUTPUT_ROOT = join(REPO_ROOT, "docs", "generated", "interaction-audit");

const FILES = Object.freeze({
  runtime: "app/webgl-generator/src/runtime/app.js",
  operation: "app/webgl-generator/src/runtime/runtime-operation.js",
  apiContract: "app/webgl-generator/src/runtime/api-contract.js",
  deleteImpact: "app/webgl-generator/src/runtime/delete-impact.js",
  climate: "app/webgl-generator/src/runtime/climate-downstream-rebuild.js",
  stateTopology: "app/webgl-generator/src/runtime/state-topology-commands.js",
  heightDerived: "app/webgl-generator/src/runtime/height-derived-rebuild.js",
  geoImport: "app/webgl-generator/src/runtime/fmg-cells-geojson-import.js",
  editHistory: "app/webgl-generator/src/runtime/edit-history.js",
  heightPanel: "app/webgl-generator/src/ui/panels/height-panel.js",
  controlPanel: "app/webgl-generator/src/ui/vue/components/ControlPanel.vue",
  fixtureBuilder: "tools/webgl-generator-interaction-surface-inventory.mjs"
});

const DESTRUCTIVE_UI_ACTIONS = Object.freeze([
  destructive("delete-state-canvas", "国家画布删除", "国家及依赖归属", "canvas-direct-command", "none", "one-command", "undo", "StatePanel.vue", "createDeleteStateCommand(stateId)"),
  destructive("delete-province-canvas", "省份画布删除", "省份及 cells 归属", "canvas-direct-command", "none", "one-command", "undo", "ProvincePanel.vue", "createDeleteProvinceCommand(provinceId)"),
  destructive("delete-city-canvas", "城市画布删除", "城市、首都与路线引用", "canvas-direct-command", "none", "one-command", "undo", "CityPanel.vue", "createDeleteCityCommand(cityId)"),
  destructive("delete-culture", "删除文化", "文化及 cells 归属", "delete-impact", "native-confirm", "one-batch-command", "undo", "CulturePanel.vue", "kind: OBJECT_KIND.CULTURE"),
  destructive("delete-religion", "删除宗教", "宗教及 cells 归属", "delete-impact", "native-confirm", "one-batch-command", "undo", "ReligionPanel.vue", "kind: OBJECT_KIND.RELIGION"),
  destructive("delete-route", "删除路线", "路线及交通引用", "delete-impact", "impact-dependent", "one-batch-command", "undo", "RoutePanel.vue", "kind: OBJECT_KIND.ROUTE"),
  destructive("delete-route-batch", "批量删除路线", "多条路线及交通引用", "delete-impact", "impact-dependent", "one-batch-command", "undo", "RoutePanel.vue", "onDeleteMany: routeIds"),
  destructive("delete-river", "删除河流及支流", "河流树及水文引用", "delete-impact", "native-confirm", "one-batch-command", "undo", "RiverPanel.vue", "kind: OBJECT_KIND.RIVER"),
  destructive("delete-river-batch", "批量删除河流", "多个河流树及水文引用", "delete-impact", "native-confirm", "one-batch-command", "undo", "RiverPanel.vue", "onDeleteMany: riverIds"),
  destructive("delete-lake", "填平并删除湖泊", "湖泊、湖面高度及河流出口", "delete-impact", "native-confirm", "one-batch-command", "undo", "LakePanel.vue", "kind: OBJECT_KIND.LAKE"),
  destructive("delete-lake-batch", "批量填平湖泊", "多个湖泊及水文引用", "delete-impact", "native-confirm", "one-batch-command", "undo", "LakePanel.vue", "onDeleteMany: lakeIds"),
  destructive("delete-marker", "删除标记", "单个标记", "command-validation", "none", "one-command", "undo", "MarkerPanel.vue", "deleteMarkerViaApi"),
  destructive("delete-label", "隐藏标签", "单个自定义或生成标签", "command-validation", "none", "one-command", "undo", "LabelNamingPanel.vue", "deleteLabelViaApi"),
  destructive("delete-orphan-note", "删除孤儿备注", "单条备注", "command-validation", "none", "one-command", "undo", "NotesPanel.vue", "onDelete: row"),
  destructive("delete-note-batch", "删除选中备注", "一条或多条备注", "command-validation", "none", "one-command", "undo", "NotesPanel.vue", "deleteBatch: (noteIds"),
  destructive("delete-measurement", "删除测量", "单个测量对象", "command-validation", "none", "one-command", "undo", "MeasurementPanel.vue", "deleteMeasurementViaApi"),
  destructive("delete-zone", "删除地区", "单个地区", "command-validation", "none", "one-command", "undo", "ZonePanel.vue", "deleteZoneViaApi"),
  destructive("delete-visual-theme", "删除用户主题", "用户主题并回退当前主题", "ui-validation", "no-user-confirm", "one-command", "undo-after-success", "ControlPanel.vue", "deleteRuntimeVisualTheme"),
  destructive("reset-label-styles", "重置全部标签样式", "全部标签样式覆盖", "command-validation", "no-user-confirm", "one-command", "undo-after-success", "ControlPanel.vue", "resetAllLabelStylesViaApi"),
  destructive("delete-namebase", "删除用户名称库", "用户名称库及绑定回退", "ui-validation", "native-confirm", "one-command", "undo", "NamebasePanel.vue", "deleteImportedNamebase"),
  destructive("clear-namebases", "清空用户名称库", "全部用户名称库及绑定回退", "api-confirm", "native-confirm", "one-command", "undo", "NamebasePanel.vue", "clearImportedNamebases"),
  destructive("clear-battle-events-current", "清空当前战事", "当前军团战事记录", "command-validation", "none", "one-command", "undo", "MilitaryPanel.vue", "clearMilitaryBattleEventsViaApi"),
  destructive("clear-battle-events-filtered", "清空筛选战事", "筛选结果内战事记录", "command-validation", "none", "one-command", "undo", "MilitaryPanel.vue", "clearMilitaryBattleEventsViaApi"),
  destructive("delete-height-template", "删除高度用户模板", "单个本地高度模板", "ui-validation", "no-user-confirm", "local-storage", "no-exact-recovery", "HeightPanel.vue", "deleteSelectedTerrainProgram")
]);

const REGENERATION_KINDS = Object.freeze([
  regen("features", false, "Feature、岸线与所有下游派生"),
  regen("routes", true, "道路网络"),
  regen("rivers", true, "河流、水文引用与下游待重算标记"),
  regen("cities", true, "城镇、港口、道路及下游派生"),
  regen("states", true, "国家、省份、城镇、道路及下游派生"),
  regen("provinces", true, "省份、道路及下游派生"),
  regen("markers", true, "资源标记、资源潜力与贸易摘要"),
  regen("diplomacy", true, "国家关系、战争与贸易关系摘要"),
  regen("religions", false, "宗教及 cells 归属"),
  regen("military", true, "军团、兵力、舰队、战线与战役摘要"),
  regen("zones", false, "全部地区")
]);

const MAP_REPLACEMENT_FLOWS = Object.freeze([
  mapReplace("new-map", "生成新地图", "generate.newMap", "request-id"),
  mapReplace("reroll-seed", "随机种子重生成", "generate.rerollSeed", "request-id"),
  mapReplace("restore-browser-map", "恢复浏览器存档", "data.restoreBrowserMap", "operation-serialization"),
  mapReplace("import-map", "导入完整地图", "data.importMap", "operation-serialization"),
  mapReplace("import-heightmap", "导入高度图", "data.importHeightmap", "request-id")
]);

const DERIVED_FLOWS = Object.freeze([
  derived("climate-downstream", "气候下游重算", "api-confirm-auto-from-ui", "one-snapshot-command", "undo-after-success", "panel-local-running-only", "snapshot-rollback-only-without-concurrency"),
  derived("height-base", "重算高度基础派生", "api-confirm-auto-from-ui", "partial-history", "reload-F5", "accepted-again-after-return", "operation_failed-after-partial-chain"),
  derived("height-downstream", "重算高度下游派生", "api-confirm-auto-from-ui", "partial-history", "reload-F5", "accepted-again-after-return", "operation_failed-after-partial-chain"),
  derived("economy-rebuild", "重算经济链", "api-confirm-auto-from-ui", "one-command", "undo-after-success", "accepted-again-after-return", "apply-failure-no-central-rollback")
]);

const GEO_IMPORT_FLOWS = Object.freeze([
  derived("geo-fmg-cells", "导入 FMG Cells GEO 地形并重置非 GEO 数据", "api-confirm-auto-from-ui", "one-command-after-apply", "undo-after-success", "accepted-again-after-return", "apply-failure-no-transaction"),
  derived("geo-measurements", "导入普通 GEO 测量对象", "api-confirm-auto-from-ui", "one-command", "undo-after-success", "accepted-again-after-return", "apply-failure-no-central-rollback")
]);

const RELATED_MUTATION_FLOWS = Object.freeze([
  derived("notes-replace-import", "替换全部备注", "preview-plus-user-confirm", "one-command", "undo-after-success", "accepted-again-after-return", "apply-failure-no-central-rollback"),
  derived("namebases-replace-import", "替换用户名称库", "preview-plus-user-confirm", "one-command", "undo-after-success", "accepted-again-after-return", "apply-failure-no-central-rollback"),
  derived("culture-reexpand", "文化重新扩张", "inspect-plus-user-confirm", "one-command", "undo-after-success", "accepted-again-after-return", "transaction-rollback"),
  derived("religion-reexpand", "宗教重新扩张", "inspect-plus-user-confirm", "one-command", "undo-after-success", "accepted-again-after-return", "transaction-rollback")
]);

export function buildDangerRecoveryAudit() {
  const discovery = verifySourceContracts();
  const findings = buildFindings();
  const fixtures = buildFixtures();
  const browserScenarios = buildBrowserScenarios(fixtures);
  const sourceFiles = [...new Set([
    ...Object.values(FILES),
    ...DESTRUCTIVE_UI_ACTIONS.map(item => item.componentFile),
    "app/webgl-generator/src/ui/vue/components/ControlPanel.vue",
    "app/webgl-generator/src/ui/vue/components/ClimatePanel.vue",
    "tools/fixtures/interaction-audit-invalid-map.json"
  ])].sort();
  const unresolved = allAuditedFlows().filter(item => requiredContractFields(item).some(field => !classified(item[field])));
  return {
    schemaVersion: 1,
    scope: "权威任务第 105 项：危险操作、异常路径与恢复契约静态审计",
    sourceDigest: digestFiles(sourceFiles),
    totals: {
      destructiveUiActions: DESTRUCTIVE_UI_ACTIONS.length,
      destructiveSemantics: 19,
      deleteImpactActions: DESTRUCTIVE_UI_ACTIONS.filter(item => item.preflight === "delete-impact").length,
      canvasDeleteBypasses: DESTRUCTIVE_UI_ACTIONS.filter(item => item.preflight === "canvas-direct-command").length,
      topologyTransactions: 2,
      regenerationKinds: REGENERATION_KINDS.length,
      regenerationUiKinds: REGENERATION_KINDS.filter(item => item.uiEntry).length,
      mapReplacementFlows: MAP_REPLACEMENT_FLOWS.length,
      derivedFlows: DERIVED_FLOWS.length,
      geoImportFlows: GEO_IMPORT_FLOWS.length,
      relatedMutationFlows: RELATED_MUTATION_FLOWS.length,
      findings: findings.length,
      unresolved: unresolved.length,
      browserScenarios: browserScenarios.length,
      efScenarios: browserScenarios.filter(item => item.evidenceTarget === "E-F").length
      ,enScenarios: browserScenarios.filter(item => item.evidenceTarget === "E-N").length
    },
    dictionaries: buildDictionaries(),
    destructiveUiActions: DESTRUCTIVE_UI_ACTIONS,
    topologyTransactions: buildTopologyTransactions(),
    regenerationKinds: REGENERATION_KINDS,
    mapReplacementFlows: MAP_REPLACEMENT_FLOWS,
    derivedFlows: DERIVED_FLOWS,
    geoImportFlows: GEO_IMPORT_FLOWS,
    relatedMutationFlows: RELATED_MUTATION_FLOWS,
    discovery,
    fixtures,
    browserScenarios,
    findings,
    coverage: {
      unresolvedIds: unresolved.map(item => item.actionId || item.kind || item.flowId),
      undiscoveredDestructiveIds: discovery.undiscoveredDestructiveIds,
      unknownDestructiveCandidates: discovery.unknownDestructiveCandidates,
      regenerationKindDiff: discovery.regenerationKindDiff,
      regenerationUiKindDiff: discovery.regenerationUiKindDiff,
      mapReplacementDiff: discovery.mapReplacementDiff
    }
  };
}

export function writeDangerRecoveryAudit(outputRoot = OUTPUT_ROOT) {
  const report = buildDangerRecoveryAudit();
  mkdirSync(outputRoot, {recursive: true});
  writeFileSync(join(outputRoot, "danger-and-recovery.json"), stableJson(report));
  writeFileSync(join(outputRoot, "danger-and-recovery.md"), renderMarkdown(report));
  return report;
}

function destructive(actionId, label, impact, preflight, confirm, history, recovery, component, runtimeToken) {
  const normalizedConfirm = confirm === "none" ? "no-user-confirm" : confirm;
  const successRecovery = recovery === "undo" ? "undo-after-success" : recovery;
  const batchAtomic = history === "one-batch-command";
  const localStorageOnly = history === "local-storage";
  return {
    actionId, label, impact, preflight, confirm: normalizedConfirm, history,
    cancellation: destructiveCancellation(normalizedConfirm),
    duplicatePolicy: destructiveDuplicatePolicy(actionId),
    applyFailureAtomicity: batchAtomic ? "completed-subcommands-reversed; failing-subcommand-atomicity-not-guaranteed" : localStorageOnly ? "local-storage-write-is-single-step" : "not-guaranteed-by-EditHistory",
    failureResult: batchAtomic ? "completed-subcommands-reversed-and-no-history-entry; failing-subcommand-may-be-partial" : localStorageOnly ? "local-storage-error-and-no-history-entry" : "apply-error-and-no-history-entry; partial-mutation-possible",
    lateResultPolicy: "not-async",
    successRecovery,
    failureRecovery: batchAtomic ? "completed-subcommands-auto-reversed; reload-F5-if-failing-subcommand-partial" : localStorageOnly ? "no-exact-recovery" : "reload-F5-if-apply-throws",
    fixtureId: history.includes("command") ? "F5" : "F6",
    evidenceStatus: "E-C",
    browserEvidence: "pending-Q107",
    componentFile: `app/webgl-generator/src/ui/vue/components/${component}`,
    sourceRefs: [ref(`app/webgl-generator/src/ui/vue/components/${component}`, [componentTokenForAction(actionId)]), ref(runtimeFileForAction(actionId), [runtimeToken])]
  };
}

function regen(kind, uiEntry, impact) {
  const undoable = kind === "markers" || kind === "diplomacy";
  return {
    kind, uiEntry, impact,
    preflight: "kind-normalization-and-map-availability",
    confirm: "api-confirm-auto-from-ui",
    history: undoable ? "one-command" : "no-history",
    cancellation: "unsupported-after-start",
    duplicatePolicy: "accepted-again-after-return-and-advances-regeneration-salt",
    failureResult: "operation_failed; partial mutation possible",
    lateResultPolicy: "not-async",
    successRecovery: undoable ? "undo-after-success" : "reload-F5",
    failureRecovery: "reload-F5",
    fixtureId: "F5",
    evidenceStatus: "E-C",
    browserEvidence: "pending-Q107",
    sourceRefs: [ref(FILES.runtime, [`case \"${kind}\"`, "regenerateMapAttributeViaApi"])]
  };
}

function mapReplace(flowId, label, api, lateResultPolicy) {
  return {
    flowId, label, api, impact: "replace-current-map-and-clear-edit-history", preflight: "input-or-options-validation",
    confirm: "api-confirm-auto-from-ui", cancellation: "unsupported-after-start", history: "cleared-on-success",
    duplicatePolicy: "runtime-operation-operation_busy", failureResult: "structured-operation-error", lateResultPolicy,
    successRecovery: "reimport-F5", failureRecovery: "runtime-operation-snapshot-rollback",
    fixtureId: flowId === "import-map" ? "F4" : "F5", evidenceStatus: "E-C", browserEvidence: "pending-Q107",
    sourceRefs: [ref(FILES.runtime, [api.split(".").at(-1), "mapReplaceConfig"]), ref(FILES.operation, ["operation_busy", "rollback"])]
  };
}

function derived(flowId, label, confirm, history, successRecovery, duplicatePolicy, failureResult) {
  const failureRecovery = failureResult.includes("transaction-rollback")
    ? "automatic-transaction-rollback"
    : failureResult.includes("snapshot-rollback")
      ? "snapshot-rollback-only-without-concurrency"
      : "reload-F5";
  return {
    flowId, label, impact: "map-derived-data", preflight: derivedPreflight(flowId), confirm, history,
    cancellation: "unsupported-after-start", duplicatePolicy, failureResult,
    lateResultPolicy: flowId === "climate-downstream" ? "no-request-or-map-identity-guard" : "not-async",
    successRecovery,
    failureRecovery,
    fixtureId: flowId === "import-geo" ? "F4" : "F5", evidenceStatus: "E-C", browserEvidence: "pending-Q107",
    sourceRefs: [ref(FILES.runtime, [sourceTokenForFlow(flowId), derivedPreflightToken(flowId)].filter(Boolean))]
  };
}

function buildTopologyTransactions() {
  return ["merge", "split"].map(operation => ({
    flowId: `state-${operation}`,
    label: operation === "merge" ? "合并国家" : "拆分国家",
    impact: "国家、省份、首都、外交、军事、经济和道路等跨域拓扑",
    preflight: `inspectState${operation === "merge" ? "Merge" : "Split"}`,
    confirm: "inspect-plus-explicit-api-confirm",
    cancellation: "pre-commit-panel-cancel",
    history: "one-transaction-command",
    duplicatePolicy: "modal-action-active",
    failureResult: "transaction-fault-injection-rolls-back",
    lateResultPolicy: "not-async",
    successRecovery: "undo-after-success",
    failureRecovery: "automatic-transaction-rollback",
    fixtureId: "F5",
    evidenceStatus: "E-C",
    browserEvidence: "pending-Q107",
    sourceRefs: [ref(FILES.runtime, [`executeStateTopologyViaApi`, operation]), ref(FILES.stateTopology, ["snapshot", "rollback"])]
  }));
}

function allAuditedFlows() {
  return [...DESTRUCTIVE_UI_ACTIONS, ...buildTopologyTransactions(), ...REGENERATION_KINDS, ...MAP_REPLACEMENT_FLOWS, ...DERIVED_FLOWS, ...GEO_IMPORT_FLOWS, ...RELATED_MUTATION_FLOWS];
}

function requiredContractFields(item) {
  return ["impact", "preflight", "confirm", "cancellation", "history", "duplicatePolicy", "failureResult", "lateResultPolicy", "successRecovery", "failureRecovery"];
}

function classified(value) {
  return typeof value === "string" && value.trim() !== "" && value !== "none";
}

function buildFixtures() {
  const manifest = buildFixtureManifest();
  return [fixtureFromManifest(manifest, "F4", {
    label: "固定无效输入",
    fingerprint: fingerprintContract(["mapChecksum", "domainCounts", "history", "selection", "editing", "generationOptions", "themeId"], ["beforeMap === afterMap"]),
    reset: "清空文件输入、错误提示与运行时 operation 状态",
    assertions: ["错误为 unsupported-version / migrate-document / 暂不支持的地图格式版本：99", "地图 reference、checksum、领域计数不变", "历史、选择、options 与 theme 不变"]
  }), fixtureFromManifest(manifest, "F5", {
    label: "可破坏地图副本",
    fingerprint: fingerprintContract(["mapChecksum", "domainDigestsAndCounts", "historyUndoRedoLastLabel", "selection", "editing", "generationOptions", "themeId", "derivedStale"]),
    reset: "每条破坏路径前重新导入同一副本",
    assertions: ["取消后完整指纹不变", "承诺失败回滚的路径恢复完整指纹", "成功后可撤销者由 undo/redo 往返；其余明确无虚假历史并重载副本"]
  }), fixtureFromManifest(manifest, "F6", {
    label: "边界与互斥夹具",
    fingerprint: fingerprintContract(["mapChecksum", "domainCounts", "historyUndoRedoLastLabel", "operationIdAndStatus", "selection", "editing"]),
    reset: "等待 operation idle 并清空局部选择",
    assertions: ["无效/空操作不写历史", "重复运行时任务返回 operation_busy", "已知无旧结果守卫的路径作为缺陷证据，不误报恢复通过"]
  })];
}

function fixtureFromManifest(manifest, fixtureId, patch) {
  const source = manifest.fixtures.find(item => item.id === fixtureId);
  if (!source) throw new Error(`第 101 项夹具 manifest 缺少 ${fixtureId}`);
  return {
    fixtureId,
    label: patch.label,
    source: source.construct,
    stableKey: source.stableKey,
    sourceEvidence: source.evidence.map(item => ({...item})),
    fingerprint: patch.fingerprint,
    reset: patch.reset,
    assertions: patch.assertions
  };
}

function fingerprintContract(fields, identityAssertions = []) {
  return {
    algorithm: "canonical-json-sha256",
    fields,
    identityAssertions,
    capture: "第107项 runner 在每条路径前后按字段名读取可序列化 runtime/API 状态，键排序 JSON.stringify 后计算 SHA-256；对象 identity 另存引用并用严格等号比较",
    compare: "保存 before/after 哈希及逐字段 diff；禁止只比较 UI 文案"
  };
}

function buildBrowserScenarios(fixtures) {
  const fixture = id => fixtures.find(item => item.fixtureId === id);
  return [
    scenario("DR-105-F4-INVALID-MAP", "完整地图无效文件", "F4", "失败", "E-F", [
      "由 runner 调用 captureFingerprint(F4) 记录 map reference、checksum、领域计数、history、selection/options/theme",
      "通过完整地图文件输入选择 tools/fixtures/interaction-audit-invalid-map.json",
      "断言诊断三元组 reason=unsupported-version、stage=migrate-document、message=暂不支持的地图格式版本：99",
      "再次 captureFingerprint 并要求哈希相同；关闭诊断后重复一次仍相同"
    ], fixture("F4"), "public-ui-file-input"),
    scenario("DR-105-F4-GEO-PICKER-CANCEL", "GEO 文件选择器提交前取消", "F4", "取消", "E-F", [
      "记录 F4 指纹并打开 GEO 文件选择器",
      "使用浏览器文件选择取消，不选择文件",
      "断言没有进入 runtime operation、没有命令与诊断，指纹相同；明确这不代表运行中取消"
    ], fixture("F4"), "public-ui-file-picker"),
    scenario("DR-105-F5-DELETE-CANCEL", "高影响删除确认取消", "F5", "取消", "E-F", [
      "页面动态 import /src/runtime/delete-impact.js，枚举现存 culture/religion/river/lake 并调用 inspectDeleteImpact，选取首个 requiresConfirm=true 的真实对象，记录其实际依赖摘要与 F5 指纹",
      "触发删除，在 native confirm 选择取消",
      "断言完整指纹与 history lastLabel 不变"
    ], fixture("F5"), "public-ui-confirm"),
    scenario("DR-105-F5-DELETE-UNDO", "批量删除失败回滚与撤销", "F5", "失败与恢复", "E-F", [
      "在页面动态 import /src/runtime/delete-impact.js，复用固定 2 个有效 route 加 invalid/missing 的批次",
      "用 createDeleteBatchCommand 的第二个子命令 apply 抛错，断言首个子命令已逆序 revert、history delta=0、F5 指纹相同",
      "再通过公开 UI 正常批删，断言只写一条历史；undo/redo 各比对一次指纹"
    ], fixture("F5"), "browser-module-plus-public-ui"),
    scenario("DR-105-F5-TOPOLOGY-ROLLBACK", "国家拓扑故障回滚", "F5", "失败与恢复", "E-F", [
      "调用 api.edit.states.inspectMerge 得到有效相邻国家参数并记录 F5 指纹",
      "逐个调用 api.edit.states.merge({...参数, confirm:true, faultAt:stage})，stage 固定为 after-topology/capital/after-reprovince/diplomacy/military/market/route/after-domains/before-validate",
      "每次断言返回失败、history delta=0、完整指纹相同；重新载入 F5 后再测下一 stage"
    ], fixture("F5"), "public-console-api-faultAt"),
    scenario("DR-105-F5-MAP-REPLACE-FAIL", "地图替换加载失败与回滚失败", "F5", "失败与恢复", "E-F", [
      "保存 app.renderer.loadMapAsync 原函数、F5 完整地图文档与指纹",
      "fail-once wrapper 在第一次 loadMapAsync 抛错、第二次调用原函数，执行 api.data.importMap(document,{confirm:true})，断言 operation_failed 且 F5 指纹恢复",
      "always-fail wrapper 对执行和 rollback 都抛错，断言 operation_rollback_failed；finally 恢复原函数并重新导入 F5"
    ], fixture("F5"), "runtime-renderer-monkeypatch"),
    scenario("DR-105-F5-CLIMATE-ROLLBACK", "气候下游模块中途失败回滚", "F5", "失败与恢复", "E-F", [
      "页面动态 import /src/runtime/climate-downstream-rebuild.js，并 structuredClone 当前 F5 map",
      "以可记录 createSnapshot/restoreSnapshot 的 fake history 调用 executeClimateDownstreamRebuildAsync，executeSystem 在 markers step 抛出固定错误",
      "断言 clone 的 canonical fingerprint 和 fake history 恢复；该场景验证单任务模块回滚，不冒充公开 API 并发保护"
    ], fixture("F5"), "browser-module-injected-executeSystem"),
    scenario("DR-105-F5-CLIMATE-LATE-RESULT", "气候任务旧结果晚到", "F5", "失败证据", "E-F", [
      "暂存 window.requestAnimationFrame，将回调压入队列；启动 api.climate.applyDownstreamRebuild({systems:['markers'],confirm:true}) 并保存 oldMap",
      "在首个 yield 未恢复前把 app.map 置为 structuredClone(oldMap) 的 newMap identity，恢复 RAF 并放行队列",
      "等待旧任务结束，断言是否出现 app.options===oldMap.options 或旧任务刷新新 runtime；当前预期复现 IA-105-003，而不是声明恢复通过",
      "finally 重新导入 F5，并恢复 RAF、options、renderer 与 history"
    ], fixture("F5"), "runtime-raf-queue-and-map-identity"),
    scenario("DR-105-F5-GEO-APPLY-FAIL", "FMG Cells GEO apply 中途失败", "F5", "失败证据", "E-F", [
      "Q107 Node runner 用 readFile 读取 docs/generated/reports/geo-import-fmg-cells-fixture.geojson，再把文本作为 page.evaluate 参数注入；页面动态 import /src/runtime/fmg-cells-geojson-import.js",
      "以 F5 clone 创建命令，再用 root Proxy 在写入 pack 时抛错；通过 isolated EditHistory.execute(command,{map:proxy}) 执行",
      "断言 history 未压栈但 grid height / features 或 climate 指纹已改变，稳定复现 IA-105-002；最后丢弃 clone，不接触正式 map"
    ], fixture("F5"), "browser-module-root-proxy"),
    scenario("DR-105-F5-HEIGHT-CHAIN-FAIL", "高度派生链后步失败", "F5", "失败证据与恢复", "E-F", [
      "动态 import /src/runtime/height-derived-rebuild.js，以 fake regenerate 记录调用并在 rivers（基础链）和 military（下游链）返回 executed:false",
      "断言基础链已保留 features 调用、下游链已保留 religions/markers/diplomacy 调用且返回失败摘要",
      "公开路径只记录当前历史偏差并重新导入 F5 恢复，不把 partial history 写成整链可撤销"
    ], fixture("F5"), "browser-module-fake-regenerate"),
    scenario("DR-105-F6-BUSY", "运行时任务重复触发", "F6", "失败", "E-F", [
      "用一次性延迟 wrapper 保持 renderer.loadMapAsync pending，启动 api.data.importMap(F5Document,{confirm:true})",
      "pending 期间再次调用 api.generate.newMap({confirm:true})",
      "断言第二次得到 operation_busy；释放首任务并在 finally 恢复 wrapper、等待 idle、重新导入 F5"
    ], fixture("F6"), "runtime-renderer-deferred-promise"),
    scenario("DR-105-F6-NEUTRAL", "中立对象与空集合", "F6", "边界", "E-F", [
      "清空 selection/editing，检查危险按钮 disabled",
      "通过公开 API 分别提交 neutral/missing/duplicate id、空批次、非相邻合并、断连拆分与 systems=[]",
      "逐项断言 structured invalid/noop、history 不变、F6 指纹相同；孤儿备注删除后单独 undo 恢复"
    ], fixture("F6"), "public-ui-and-console-api"),
    scenario("DR-105-F5-REGENERATE", "受约束重生成正常路径", "F5", "正常", "E-S", [
      "记录影响摘要并调用 api.generate.regenerate('markers',{confirm:true})",
      "断言受影响系统、stale 标记与一条历史；undo 后恢复 F5 指纹",
      "再次调用同 kind，断言请求被接受且 regeneration salt 再次推进，不误写成重复 no-op"
    ], fixture("F5"), "public-console-api"),
    scenario("DR-105-F5-REGENERATE-MID-FAIL", "九类原地重生成中途失败", "F5", "当前不可稳定构造", "E-N", [
      "当前公开 API 没有 regenerate faultAt 或可替换 system executor，浏览器不得伪造 E-F 通过",
      "第107项只核对 E-C：runSync 无 snapshot/rollback、九类无历史；失败恢复按重载 F5 记录",
      "若后续增加稳定 fault seam，再升级为 E-F 并逐 kind 比对领域指纹"
    ], fixture("F5"), "no-stable-browser-fault-seam")
  ];
}

function scenario(scenarioId, label, fixtureId, path, evidenceTarget, steps, fixture, harness) {
  return {scenarioId, label, fixtureId, path, evidenceTarget, harness, reset: fixture.reset, steps, assertions: fixture.assertions, browserEvidence: evidenceTarget === "E-N" ? "not-constructible" : "pending-Q107"};
}

function buildFindings() {
  return [
    finding("IA-105-001", "P1", "国家、省份、城市的实际画布删除绕过共用影响预检与确认", true, "面板控制器存在 executeDeleteWithPreflight 路径，但 pointerdown 实际直接创建删除命令；旧回归只证明死回调存在，未证明可见入口接线。", "统一画布、面板和 API 的删除预检契约，并对实际 pointer handler 限域断言。"),
    finding("IA-105-002", "P1", "FMG Cells GEO 命令 apply 中途失败可能留下部分地图变更且没有历史", true, "命令先改高度再重建多域，自身没有 try/catch 快照恢复；EditHistory 只在 apply 完成后压栈。", "为多域 GEO 导入命令增加 apply 级事务快照与故障注入回归。"),
    finding("IA-105-003", "P1", "气候下游异步重算不受运行时互斥与旧结果保护", true, "公开 API 可并行触发并与地图替换交错；晚到任务仍会 onRestore 旧 map.options，失败回滚还可能覆盖并发合法变更。", "增加全局互斥、request id、map identity 或过期结果丢弃契约。"),
    finding("IA-105-004", "P1", "11 类受约束重生成只有 2 类成功后可撤销，且全部缺少统一失败快照", true, "markers、diplomacy 通过命令进入历史；其余 9 类直接原地改 map，runSync 配置没有 snapshot/rollback。", "为重生成建立聚合快照命令或 RuntimeOperation rollback。"),
    finding("IA-105-005", "P1", "高度基础与下游重建是非事务串行链", true, "它们逐个调用 generate.regenerate；后一步失败会保留前步，历史仅覆盖 markers/diplomacy，不能代表整链可恢复。", "为整条重建链建立单一快照、提交与回滚边界。"),
    finding("IA-105-006", "P2", "24 个持久删除、清空和全量重置入口的确认契约不一致", true, "高影响删除有依赖摘要；多种可撤销入口仍是一击执行，route 单删还会按依赖数量动态决定是否确认。", "按影响等级统一显示范围、是否可撤销与失败恢复说明。"),
    finding("IA-105-007", "P2", "用户高度模板删除无确认、无历史、无恢复", true, "该入口直接过滤并持久化 localStorage，是 24 个入口中唯一完全不可撤销者。", "增加确认与回收站、撤销或导出备份中的至少一种恢复契约。"),
    finding("IA-105-008", "P2", "名称库删除在 UI 与 API 的确认契约不一致", true, "UI deleteImportedNamebase 使用 native confirm；公开 namebases.delete 直接执行命令且不要求 confirm:true。", "统一同语义跨入口的预检与显式确认契约。")
  ];
}

function finding(findingId, severity, title, intB, evidence, recommendation) {
  return {findingId, severity, title, intB, evidence, recommendation, evidenceStatus: "E-C", browserEvidence: "pending-Q107"};
}

function buildDictionaries() {
  return {
    evidence: {"E-C": "源码静态证据", "E-S": "浏览器正常路径证据", "E-F": "浏览器失败、取消或恢复证据"},
    history: {"no-history": "不进入 EditHistory", "one-command": "单条命令", "one-batch-command": "批量聚合为单条命令", "one-transaction-command": "跨域事务聚合为单条命令", "cleared-on-success": "成功后清空既有历史", "one-snapshot-command": "整图前后快照聚合为单条命令", "partial-history": "链内只有部分步骤进入历史", "local-storage": "仅本地持久数据"},
    intB: "需要功能语义变化的整改候选；第 105 项只记录"
  };
}

function sourceTokenForFlow(flowId) {
  return ({
    "climate-downstream": "applyClimateDownstreamRebuildViaApi",
    "height-base": "rebuildHeightDerivedViaAction",
    "height-downstream": "rebuildHeightDerivedViaAction",
    "economy-rebuild": "rebuildEconomyViaApi",
    "geo-fmg-cells": "importFmgCellsGeoViaApi",
    "geo-measurements": "importGeoMeasurementsViaApi",
    "notes-replace-import": "importNotesViaApi",
    "namebases-replace-import": "importNamebaseDocumentViaApi",
    "culture-reexpand": "applySocialExpansionViaApi",
    "religion-reexpand": "applySocialExpansionViaApi"
  })[flowId];
}

function derivedPreflight(flowId) {
  return ({
    "climate-downstream": "inspectClimateDownstreamRebuild",
    "height-base": "assertMapAvailable-and-confirm-options",
    "height-downstream": "assertMapAvailable-and-confirm-options",
    "economy-rebuild": "assertMapAvailable-and-confirm-options",
    "geo-fmg-cells": "inspectGeoImportSource-and-validate-fmg-cells",
    "geo-measurements": "inspectGeoImportSource-and-parse-measurements",
    "notes-replace-import": "inspectNotesImport",
    "namebases-replace-import": "createNamebaseImportPreview",
    "culture-reexpand": "inspectSocialExpansion",
    "religion-reexpand": "inspectSocialExpansion"
  })[flowId] || "unknown";
}

function derivedPreflightToken(flowId) {
  return ({
    "climate-downstream": "inspectClimateDownstreamRebuild",
    "geo-fmg-cells": "inspectGeoImportSource",
    "geo-measurements": "inspectGeoImportSource",
    "notes-replace-import": "inspectNotesImport",
    "namebases-replace-import": "createNamebaseImportPreview",
    "culture-reexpand": "inspectSocialExpansion",
    "religion-reexpand": "inspectSocialExpansion"
  })[flowId];
}

function componentTokenForAction(actionId) {
  return ({
    "delete-state-canvas": "取消删除国家",
    "delete-province-canvas": "取消删除省份",
    "delete-city-canvas": "取消删除城市",
    "delete-culture": "删除文化并清除归属",
    "delete-religion": "删除宗教并清除归属",
    "delete-route": "删除路线",
    "delete-route-batch": "批量删除选中",
    "delete-river": "删除选中河流及支流",
    "delete-river-batch": "批量删除选中",
    "delete-lake": "填平并删除选中湖泊",
    "delete-lake-batch": "批量填平选中",
    "delete-marker": "删除选中对象",
    "delete-label": "删除标签",
    "delete-orphan-note": "删除这条孤儿备注",
    "delete-note-batch": "删除选中备注",
    "delete-measurement": "删除测量",
    "delete-zone": "删除选中地区",
    "delete-visual-theme": "delete-user-visual-theme",
    "reset-label-styles": "reset-all-label-styles",
    "delete-namebase": "删除选中用户库",
    "clear-namebases": "清空用户库",
    "clear-battle-events-current": "clearSelectedBattleEvents",
    "clear-battle-events-filtered": "clearFilteredBattleEvents",
    "delete-height-template": "删除所选用户模板"
  })[actionId];
}

function runtimeFileForAction(actionId) {
  return actionId === "delete-height-template" ? FILES.heightPanel : FILES.runtime;
}

function destructiveDuplicatePolicy(actionId) {
  if (["delete-state-canvas", "delete-province-canvas", "delete-city-canvas"].includes(actionId)) return "mode-exits-after-success; second-click-is-normal-canvas-input";
  if (actionId === "delete-label") return "second-entry-becomes-restore";
  if (["delete-visual-theme", "delete-namebase", "clear-namebases", "delete-height-template"].includes(actionId)) return "target-disappears-or-action-disables-after-success";
  if (["clear-battle-events-current", "clear-battle-events-filtered", "reset-label-styles"].includes(actionId)) return "second-trigger-is-command-noop";
  return "same-target-becomes-invalid-or-noop-without-extra-history";
}

function destructiveCancellation(confirm) {
  if (confirm === "native-confirm") return "pre-commit-user-cancel";
  if (confirm === "impact-dependent") return "pre-commit-user-cancel-when-impact-requires-confirm";
  return "unsupported";
}

function verifySourceContracts() {
  const runtime = readText(FILES.runtime);
  const operation = readText(FILES.operation);
  const climate = readText(FILES.climate);
  const apiContract = readText(FILES.apiContract);
  const deleteImpact = readText(FILES.deleteImpact);
  const requiredRuntimeTokens = [
    "const mapReplaceConfig", "captureMapReplaceSnapshot", "restoreMapReplaceSnapshot", "operation.runSync(\"generate.regenerate\"",
    "applyClimateDownstreamRebuildViaApi", "executeDeleteWithPreflight", "createDeleteStateCommand(stateId)",
    "createDeleteProvinceCommand(provinceId)", "createDeleteCityCommand(cityId)", "executeStateTopologyViaApi"
  ];
  assertTokens(FILES.runtime, runtime, requiredRuntimeTokens);
  assertTokens(FILES.operation, operation, ["operation_busy", "operation_cancelled", "operation_failed", "operation_rollback_failed", "config.rollback"]);
  assertTokens(FILES.climate, climate, ["snapshot-before", "snapshot-after", "history-command", "rollback", "editHistory.restoreSnapshot"]);
  assertTokens(FILES.apiContract, apiContract, ["CONFIRM_REQUIRED_METHODS", "generate.regenerate", "climate.applyDownstreamRebuild", "edit.states.merge", "edit.states.split"]);
  assertTokens(FILES.deleteImpact, deleteImpact, ["inspectDeleteImpact", "requestDeleteConfirmation", "createDeleteBatchCommand", "requiresConfirm"]);
  assertTokens(FILES.geoImport, readText(FILES.geoImport), ["createImportFmgCellsHeightCommand", "apply(context)", "refreshImportedTerrainDerivatives"]);
  assertTokens(FILES.editHistory, readText(FILES.editHistory), ["command.apply(context)", "undoStack.push(command)"]);
  for (const item of DESTRUCTIVE_UI_ACTIONS) {
    for (const sourceRef of item.sourceRefs) assertTokens(sourceRef.file, readText(sourceRef.file), sourceRef.tokens);
  }
  for (const item of [...DERIVED_FLOWS, ...GEO_IMPORT_FLOWS, ...RELATED_MUTATION_FLOWS]) assertTokens(FILES.runtime, runtime, item.sourceRefs[0].tokens);
  const regenerateBlock = scoped(runtime, 'operation.runSync("generate.regenerate"', "    },\n    layers:");
  if (/snapshot\s*:|rollback\s*:/.test(regenerateBlock)) throw new Error("generate.regenerate 新增了事务快照或回滚，必须重新审计 IA-105-004");
  const climateActionBlock = scoped(runtime, "applyDownstreamRebuild: (options", "    },\n    namebases:");
  if (/operation\.(?:run|runSync)/.test(climateActionBlock)) throw new Error("气候下游重算已接入 RuntimeOperationManager，必须重新审计 IA-105-003");

  for (const [functionName, nextFunction] of [["bindStateEditing", "bindProvinceEditing"], ["bindProvinceEditing", "bindSocialAssignmentEditing"], ["bindCityEditing", "bindMarkerEditing"]]) {
    const block = scoped(runtime, `function ${functionName}`, `function ${nextFunction}`);
    if (!/createDelete(?:State|Province|City)Command/.test(block) || /executeDeleteWithPreflight/.test(block)) throw new Error(`${functionName} 画布删除接线变化，必须重新审计 IA-105-001`);
  }

  const destructiveCandidates = discoverDestructiveEntrances();
  const candidateMatches = matchDestructiveCandidates(destructiveCandidates);
  if (candidateMatches.undiscoveredDestructiveIds.length || candidateMatches.unknownDestructiveCandidates.length) {
    throw new Error(`危险删除入口分母漂移：missing=${candidateMatches.undiscoveredDestructiveIds.join(",")}; unknown=${candidateMatches.unknownDestructiveCandidates.map(item => item.candidateId).join(",")}`);
  }
  const actualByFile = countBy(candidateMatches.matchedCandidates, item => item.file);

  const regenerationKinds = [...scoped(runtime, "function regenerateMapAttribute", "function regenerateFeatures").matchAll(/case\s+"([^"]+)"\s*:/g)].map(match => match[1]);
  const expectedRegenerationKinds = REGENERATION_KINDS.map(item => item.kind);
  const regenerationKindDiff = symmetricDiff(expectedRegenerationKinds, regenerationKinds);
  if (regenerationKindDiff.length) throw new Error(`受约束重生成 kind 分母漂移：${regenerationKindDiff.join(", ")}`);

  const controlSource = readText(FILES.controlPanel);
  const regenerationUiKinds = [...scoped(controlSource, "const regenerationActions = Object.freeze([", "]);\nconst selectedRegenerationKind").matchAll(/kind:\s*"([^"]+)"/g)].map(match => match[1]);
  const expectedUiKinds = REGENERATION_KINDS.filter(item => item.uiEntry).map(item => item.kind);
  const regenerationUiKindDiff = symmetricDiff(expectedUiKinds, regenerationUiKinds);
  if (regenerationUiKindDiff.length) throw new Error(`UI 重生成 kind 分母漂移：${regenerationUiKindDiff.join(", ")}`);

  const mapReplacementApis = discoverMapReplacementApis(runtime);
  const expectedMapReplacementApis = MAP_REPLACEMENT_FLOWS.map(item => item.api);
  const mapReplacementDiff = symmetricDiff(expectedMapReplacementApis, mapReplacementApis);
  if (mapReplacementDiff.length) throw new Error(`地图替换 operation 分母漂移：${mapReplacementDiff.join(", ")}`);

  return {
    destructiveCandidates: candidateMatches.matchedCandidates,
    destructiveByFile: actualByFile,
    undiscoveredDestructiveIds: candidateMatches.undiscoveredDestructiveIds,
    unknownDestructiveCandidates: candidateMatches.unknownDestructiveCandidates,
    regenerationKinds,
    regenerationUiKinds,
    mapReplacementApis,
    regenerationKindDiff,
    regenerationUiKindDiff,
    mapReplacementDiff
  };
}

function discoverDestructiveEntrances() {
  const root = join(REPO_ROOT, "app/webgl-generator/src/ui/vue/components");
  const candidates = [];
  for (const name of readdirSync(root).filter(file => file.endsWith(".vue")).sort()) {
    const file = `app/webgl-generator/src/ui/vue/components/${name}`;
    const source = readText(file);
    const lines = source.split("\n");
    for (const definition of [
      {rule: "delete-action", pattern: /\{\s*key:\s*"delete(?:-selected|-batch)?"/g},
      {rule: "conditional-delete-action", pattern: /\{\s*key:\s*selected\.value\?\.hidden\s*\?\s*"restore"\s*:\s*"delete"/g},
      {rule: "persistent-clear-action", pattern: /\{\s*key:\s*"clear"\s*,/g}
    ]) {
      for (const match of source.matchAll(definition.pattern)) {
        const snippet = balancedObject(source, match.index).replace(/\s+/g, " ").trim();
        const line = source.slice(0, match.index).split("\n").length;
        candidates.push({candidateId: `${name}:${line}:${definition.rule}`, file, line, rule: definition.rule, snippet});
      }
    }
    for (const match of source.matchAll(/<UiButton\b[\s\S]*?<\/UiButton>/g)) {
      const tag = match[0];
      const text = tag.replace(/<[^>]+>/g, " ").replace(/\{\{[\s\S]*?\}\}/g, " ").replace(/\s+/g, " ").trim();
      if (!/variant="danger"/.test(tag) || !/(?:删除|清空|重置全部)/.test(text)) continue;
      const line = source.slice(0, match.index).split("\n").length;
      candidates.push({candidateId: `${name}:${line}:direct-danger-reset`, file, line, rule: "direct-danger-reset", snippet: tag.replace(/\s+/g, " ").trim()});
    }
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      const rule = destructiveLineDiscoveryRule(line);
      if (rule) candidates.push({candidateId: `${name}:${index + 1}:${rule}`, file, line: index + 1, rule, snippet: line.trim()});
    }
  }
  return candidates;
}

function destructiveLineDiscoveryRule(line) {
  if (/action-label="删除这条孤儿备注"/.test(line)) return "orphan-delete-action";
  if (/@click="clear(?:Selected|Filtered)BattleEvents"/.test(line)) return "battle-clear-action";
  if (/onTerrainProgramDelete/.test(line) && /删除所选用户模板/.test(line)) return "persistent-template-delete";
  return "";
}

function matchDestructiveCandidates(candidates) {
  const unmatched = new Set(candidates.map(item => item.candidateId));
  const matchedCandidates = [];
  const undiscoveredDestructiveIds = [];
  for (const action of DESTRUCTIVE_UI_ACTIONS) {
    const token = componentTokenForAction(action.actionId);
    const matches = candidates.filter(candidate => unmatched.has(candidate.candidateId) && candidate.file === action.componentFile && candidate.snippet.includes(token));
    if (matches.length !== 1) {
      undiscoveredDestructiveIds.push(action.actionId);
      continue;
    }
    unmatched.delete(matches[0].candidateId);
    matchedCandidates.push({...matches[0], actionId: action.actionId});
  }
  return {
    matchedCandidates: matchedCandidates.sort((left, right) => left.actionId.localeCompare(right.actionId)),
    undiscoveredDestructiveIds,
    unknownDestructiveCandidates: candidates.filter(item => unmatched.has(item.candidateId))
  };
}

function balancedObject(source, startIndex) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = startIndex; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return source.slice(startIndex, index + 1);
  }
  throw new Error("危险动作对象括号未闭合");
}

function discoverMapReplacementApis(source) {
  const apis = [];
  for (const match of source.matchAll(/operation\.run\("([^"]+)"/g)) {
    const call = balancedCall(source, match.index + "operation.run".length);
    if (call.includes("mapReplaceConfig(")) apis.push(match[1]);
  }
  return apis;
}

function balancedCall(source, openParenIndex) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = openParenIndex; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(") depth++;
    else if (char === ")" && --depth === 0) return source.slice(openParenIndex, index + 1);
  }
  throw new Error("operation.run 调用括号未闭合");
}

function countBy(items, keyOf) {
  const counts = {};
  for (const item of items) counts[keyOf(item)] = (counts[keyOf(item)] || 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function symmetricDiff(expected, actual) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  return [...new Set([...expected.filter(item => !actualSet.has(item)), ...actual.filter(item => !expectedSet.has(item))])].sort();
}

function renderMarkdown(report) {
  const lines = [
    "# 危险操作、异常路径与恢复契约审计", "",
    `- 范围：${report.scope}`, `- 源码摘要：\`${report.sourceDigest}\``,
    `- 分母：持久性删除 / 清空 ${report.totals.destructiveUiActions} 个入口 / ${report.totals.destructiveSemantics} 个逻辑；国家拓扑事务 ${report.totals.topologyTransactions}；重生成 kind ${report.totals.regenerationKinds}（UI ${report.totals.regenerationUiKinds}）；地图替换 ${report.totals.mapReplacementFlows}；GEO ${report.totals.geoImportFlows}；派生重算 ${report.totals.derivedFlows}；关联替换 / 重扩张 ${report.totals.relatedMutationFlows}`,
    `- 未分类：${report.totals.unresolved}；浏览器异常场景：${report.totals.efScenarios}，统一留待第 107 项。`, "",
    "## 静态问题", "", "| 编号 | 严重度 | 结论 | 证据 | 建议 | INT-B |", "|---|---|---|---|---|---|",
    ...report.findings.map(item => `| ${item.findingId} | ${item.severity} | ${item.title} | ${escapeCell(item.evidence)} | ${escapeCell(item.recommendation)} | ${item.intB ? "是" : "否"} |`), "",
    "## 持久删除、清空与全量重置", "", "| 入口 | 影响 | 预检 / 确认 / 取消 | 成功历史 / 恢复 | apply 失败 / 恢复 | 重复触发 |", "|---|---|---|---|---|---|",
    ...report.destructiveUiActions.map(item => `| ${item.actionId} ${item.label} | ${escapeCell(item.impact)} | ${item.preflight} / ${item.confirm} / ${item.cancellation} | ${item.history} / ${item.successRecovery} | ${item.failureResult} / ${item.failureRecovery} | ${item.duplicatePolicy} |`), "",
    "## 国家拓扑与地图替换", "", "| 工作流 | 预检 | 确认 / 取消 | 历史 | 成功恢复 | 失败结果 / 恢复 | 重复 / 晚到 |", "|---|---|---|---|---|---|---|",
    ...[...report.topologyTransactions, ...report.mapReplacementFlows].map(item => `| ${item.flowId} ${item.label} | ${item.preflight} | ${item.confirm} / ${item.cancellation} | ${item.history} | ${item.successRecovery} | ${item.failureResult} / ${item.failureRecovery} | ${item.duplicatePolicy} / ${item.lateResultPolicy} |`), "",
    "## 重生成恢复边界", "", "| kind | UI | 影响 | 预检 / 确认 / 取消 | 历史 | 失败恢复 |", "|---|---:|---|---|---|---|",
    ...report.regenerationKinds.map(item => `| ${item.kind} | ${item.uiEntry ? "是" : "否"} | ${item.impact} | ${item.preflight} / ${item.confirm} / ${item.cancellation} | ${item.history} | ${item.failureRecovery} |`), "",
    "## GEO、派生与关联危险变更", "", "| 工作流 | 预检 | 确认 / 取消 | 历史 | 成功恢复 | 失败结果 / 恢复 | 晚到 |", "|---|---|---|---|---|---|---|",
    ...[...report.geoImportFlows, ...report.derivedFlows, ...report.relatedMutationFlows].map(item => `| ${item.flowId} ${item.label} | ${item.preflight} | ${item.confirm} / ${item.cancellation} | ${item.history} | ${item.successRecovery} | ${item.failureResult} / ${item.failureRecovery} | ${item.lateResultPolicy} |`), "",
    "## 源码发现门禁", "", `- 自动发现持久破坏入口：${report.discovery.destructiveCandidates.length}；按文件双向差集：${report.coverage.unknownDestructiveCandidates.length + report.coverage.undiscoveredDestructiveIds.length}。`, `- 自动发现 regenerate kind：${report.discovery.regenerationKinds.join(", ")}。`, `- 自动发现 UI regenerate kind：${report.discovery.regenerationUiKinds.join(", ")}。`, `- 自动发现 mapReplaceConfig operation：${report.discovery.mapReplacementApis.join(", ")}。`, "",
    "## F4～F6 浏览器待验", "", "| 场景 | 夹具 / 目标 | harness | 可执行步骤 |", "|---|---|---|---|",
    ...report.browserScenarios.map(item => `| ${item.scenarioId} ${item.label} | ${item.fixtureId} / ${item.evidenceTarget} | ${item.harness} | ${escapeCell(item.steps.map((step, index) => `${index + 1}. ${step}`).join("；"))} |`), "",
    "> 本报告仅固化 E-C 证据与 E-F/E-S 待验步骤，不实现 INT-B，也不在第 105 项启动浏览器。", ""
  ];
  return `${lines.join("\n")}\n`;
}

function escapeCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function ref(file, tokens) {
  return {file, tokens};
}

function assertTokens(file, source, tokens) {
  for (const token of tokens) if (!source.includes(token)) throw new Error(`${file} 缺少审计锚点：${token}`);
}

function scoped(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  if (start < 0) throw new Error(`找不到源码范围起点：${startToken}`);
  const end = source.indexOf(endToken, start);
  if (end < 0) throw new Error(`找不到源码范围终点：${endToken}`);
  return source.slice(start, end);
}

function readText(file) {
  const absolute = join(REPO_ROOT, file);
  if (!existsSync(absolute)) throw new Error(`审计源文件不存在：${file}`);
  return readFileSync(absolute, "utf8").replace(/\r\n/g, "\n");
}

function digestFiles(files) {
  const hash = createHash("sha256");
  for (const file of files) hash.update(`${file}\0${readText(file)}\0`);
  return hash.digest("hex");
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const check = process.argv.includes("--check");
  const report = buildDangerRecoveryAudit();
  if (check) {
    const expectedJson = stableJson(report);
    const expectedMarkdown = renderMarkdown(report);
    const jsonFile = join(OUTPUT_ROOT, "danger-and-recovery.json");
    const markdownFile = join(OUTPUT_ROOT, "danger-and-recovery.md");
    if (!existsSync(jsonFile) || readFileSync(jsonFile, "utf8").replace(/\r\n/g, "\n") !== expectedJson) throw new Error("危险操作 JSON 报告已陈旧，请重新生成");
    if (!existsSync(markdownFile) || readFileSync(markdownFile, "utf8").replace(/\r\n/g, "\n") !== expectedMarkdown) throw new Error("危险操作 Markdown 报告已陈旧，请重新生成");
  } else {
    writeDangerRecoveryAudit();
  }
  console.log(JSON.stringify(report.totals, null, 2));
}
