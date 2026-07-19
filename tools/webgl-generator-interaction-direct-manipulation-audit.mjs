import {createHash} from "node:crypto";
import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {basename, dirname, join, relative, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {buildInteractionInventory} from "./webgl-generator-interaction-surface-inventory.mjs";

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TOOL_DIR, "..");
const OUTPUT_ROOT = join(REPO_ROOT, "docs", "generated", "interaction-audit");

const FILES = Object.freeze({
  runtime: "app/webgl-generator/src/runtime/app.js",
  modeManager: "app/webgl-generator/src/runtime/canvas-tool-mode-manager.js",
  shortcuts: "app/webgl-generator/src/runtime/keyboard-shortcuts.js",
  renderer: "app/webgl-generator/src/renderer/placeholder-renderer.js",
  brushCursor: "app/webgl-generator/src/ui/brush-cursor-preview.js",
  styles: "app/webgl-generator/src/styles.css",
  cityDrag: "app/webgl-generator/src/runtime/city-relocation-drag.js",
  panelManager: "app/webgl-generator/src/ui/panel-manager.js",
  actionDock: "app/webgl-generator/src/ui/vue/components/base/UiActionDock.vue",
  objectTable: "app/webgl-generator/src/ui/vue/components/base/UiObjectTable.vue",
  draggablePanel: "app/webgl-generator/src/ui/vue/composables/use-draggable-floating-panel.js",
  treePanel: "app/webgl-generator/src/ui/vue/components/base/UiTreeDisplayPanel.vue",
  controlPanel: "app/webgl-generator/src/ui/vue/components/ControlPanel.vue",
  heightPanel: "app/webgl-generator/src/ui/vue/components/HeightPanel.vue",
  oldRegression: "tools/webgl-generator-canvas-tool-mode-manager-regression.mjs",
  auditPlan: "docs/task-notes/interaction-usability-audit-plan.md"
});

const MODE_DEFINITIONS = Object.freeze([
  persistentMode("HEIGHT_BRUSH", "height:brush", "height-panel", "高度笔刷", "拖动连续修改地形；线、填充及选区变体由同一入口分派", "手势内实时预览，高度选择与变换另有预览层", "pointerup 提交一次手势并保留模式", "每次有效手势写一条历史；取消回滚当前手势"),
  persistentMode("STATE_BRUSH", "state:brush", "state-panel", "国家归属笔刷", "按住主键连续刷涂 pack / grid 归属", "拖动时应用可回滚归属预览", "pointerup 提交一次手势并保留模式", "每次有效手势写一条历史；取消恢复原归属"),
  oneShotMode("STATE_ADD", "state:add", "state-panel", "新增国家", "在合法陆地 cell 单击", "无跨手势草稿", "成功创建后完成模式", "成功写一条新增国家历史"),
  oneShotMode("STATE_DELETE", "state:delete", "state-panel", "删除国家", "单击目标国家", "点击前不改图", "成功删除后完成模式", "成功写一条删除国家历史"),
  persistentMode("PROVINCE_BRUSH", "province:brush", "province-panel", "省份归属笔刷", "按住主键连续刷涂同国省份归属", "拖动时应用可回滚归属预览", "pointerup 提交一次手势并保留模式", "每次有效手势写一条历史；取消恢复原归属"),
  oneShotMode("PROVINCE_ADD", "province:add", "province-panel", "新增省份", "在合法目标单击", "无跨手势草稿", "成功创建后完成模式", "成功写一条新增省份历史"),
  oneShotMode("PROVINCE_DELETE", "province:delete", "province-panel", "删除省份", "单击目标省份", "点击前不改图", "成功删除后完成模式", "成功写一条删除省份历史"),
  oneShotMode("CITY_ADD", "city:add", "city-panel", "新增城镇", "在合法 grid cell 单击", "无跨手势草稿", "成功创建后完成模式", "成功写一条新增城镇历史"),
  oneShotMode("CITY_DELETE", "city:delete", "city-panel", "删除城镇", "单击目标城镇", "点击前不改图", "成功删除后完成模式", "成功写一条删除城镇历史"),
  oneShotMode("CITY_MOVE", "city:move", "city-panel", "移动城镇", "在画布拖动所选城镇并于目标释放", "拖动期间显示落点预检", "合法释放提交并完成；非法释放保留或取消", "成功写一条移动历史；取消恢复原位置", {escape: "Escape 经 selection.cancel 特判取消此模式"}),
  persistentMode("CULTURE_ASSIGN", "culture:assign", "culture-panel", "文化归属笔刷", "按住主键连续刷涂", "拖动时预览归属变化", "pointerup 提交一次手势并保留模式", "每次有效手势写一条历史"),
  persistentMode("RELIGION_ASSIGN", "religion:assign", "religion-panel", "宗教归属笔刷", "按住主键连续刷涂", "拖动时预览归属变化", "pointerup 提交一次手势并保留模式", "每次有效手势写一条历史"),
  oneShotMode("CULTURE_CENTER", "culture:center", "culture-panel", "拾取文化中心草稿", "单击合法中心 cell", "面板保存已拾取 cell，要求继续预检", "拾取后退出模式，显式保存才提交", "拾取不写历史，保存中心变更写一条历史"),
  oneShotMode("RELIGION_CENTER", "religion:center", "religion-panel", "拾取宗教中心草稿", "单击合法中心 cell", "面板保存已拾取 cell，要求继续预检", "拾取后退出模式，显式保存才提交", "拾取不写历史，保存中心变更写一条历史"),
  persistentMode("BIOME_ASSIGN", "biome:assign", "biome-panel", "生物群系归属笔刷", "按住主键连续刷涂", "拖动时预览群系变化", "pointerup 提交一次手势并保留模式", "每次有效手势写一条历史"),
  persistentMode("SUITABILITY_PAINT", "biome:suitability", "biome-panel", "适居度笔刷", "按住主键连续刷涂适居度", "拖动时预览适居度变化", "pointerup 提交一次手势并保留模式", "每次有效手势写一条历史"),
  persistentMode("MARKET_ASSIGN", "economy:market-assign", "economy-panel", "市场归属笔刷", "按住主键建立待应用归属集合", "预览持续到面板应用或取消", "应用按钮提交并完成模式", "应用成功写一条历史；取消恢复预览"),
  persistentMode("MEASUREMENT_DRAW", "measurement:draw", "measurement-panel", "测量绘制", "点击或拖动采集测量点", "测量 overlay 显示未保存路径", "保存动作提交；模式可继续编辑", "草稿不写历史，保存 / 修改 / 删除通过测量命令写历史", {locksInteraction: false, cancel: "同入口 toggle-off 退出但保留草稿；切换、关面板、切图或进入失败时退出并清空草稿"}),
  oneShotMode("MARKER_ADD", "marker:add", "marker-panel", "新增标记", "单击合法 pack cell", "面板显示待放置类型", "成功创建后完成模式", "成功写一条新增标记历史"),
  oneShotMode("MARKER_MOVE", "marker:move", "marker-panel", "移动标记", "单击新的合法 pack cell", "面板显示待移动标记", "成功移动后完成模式", "成功写一条移动标记历史"),
  oneShotMode("ROUTE_DRAW", "route:draw", "route-panel", "绘制路线", "第一次点击起点，第二次点击终点", "起点在两次点击间保留", "第二次合法点击提交并完成模式", "成功写一条新增路线历史", {continuation: "两阶段一次性模式；第一次点击保留起点，成功创建后退出"}),
  oneShotMode("ROUTE_EDIT_WAYPOINT", "route:edit-waypoint", "route-panel", "拾取路线途经点草稿", "单击新的途经 cell", "面板保存途经点草稿", "拾取后退出模式，应用 / 取消由面板收口", "拾取不写历史，实际应用写一条路线编辑历史"),
  oneShotMode("RIVER_ADD", "river:add", "river-panel", "新增河流", "单击合法河源 cell", "无跨手势草稿", "成功创建后完成模式", "成功写一条新增河流历史"),
  oneShotMode("LAKE_EXCAVATE", "lake:excavate", "lake-panel", "开挖湖泊", "单击中心并按面板半径作用", "面板保存半径参数；画布使用默认光标，没有专属半径预览", "成功开挖后完成模式", "成功写一条湖泊开挖历史"),
  oneShotMode("FEATURE_PATCH_SELECT", "feature:patch-select", "lake-panel", "拾取 feature 补丁草稿", "单击目标 pack cell", "选中 cell 进入面板补丁预览", "拾取后退出模式；应用 / 取消由面板收口", "选择本身不写历史，应用补丁写一条历史"),
  persistentMode("FEATURE_TOPOLOGY_SELECT", "feature:topology-select", "feature-panel", "选择 feature 拓扑 cell", "逐次单击 grid cell 组成选区", "选区及拓扑草稿持续显示", "面板应用或取消时退出", "选择不写历史，应用拓扑写一条历史"),
  oneShotMode("ZONE_ADD", "zone:add", "zone-panel", "新增地区", "单击中心并按半径创建", "面板显示待创建类型", "成功创建后完成模式", "成功写一条新增地区历史"),
  oneShotMode("NOTE_ADD", "note:add", "notes-panel", "新增备注", "单击合法 pack cell 创建独立备注", "面板显示待放置状态", "成功创建后完成模式", "成功写一条新增备注历史")
]);

export function buildDirectManipulationAudit() {
  const inventory = buildInteractionInventory();
  const includedSurfaceIds = new Set(inventory.rows.filter(row => row.included).map(row => row.surfaceId));
  const runtimeModes = parseRuntimeModes();
  const registeredModes = parseRegisteredModes(runtimeModes);
  const entryModes = parseEntryModes(runtimeModes);
  const legacyModes = parseLegacyRegressionModes();
  const modeContracts = MODE_DEFINITIONS.map(item => verifyMode(item, includedSurfaceIds));
  const directManipulations = expandedDirectDefinitions(inventory).map(item => verifyDirect(item, includedSurfaceIds));
  const expandedDirectRows = directManipulations.flatMap(expandDirectRows);
  const runtimeModeIds = runtimeModes.map(item => item.modeId);
  const auditFindings = findings(runtimeModeIds, legacyModes);
  const contractModeIds = modeContracts.map(item => item.modeId);
  const missingModeContracts = runtimeModeIds.filter(id => !contractModeIds.includes(id));
  const extraModeContracts = contractModeIds.filter(id => !runtimeModeIds.includes(id));
  const missingRegistrations = runtimeModeIds.filter(id => !registeredModes.includes(id));
  const extraRegistrations = registeredModes.filter(id => !runtimeModeIds.includes(id));
  const missingEntries = runtimeModeIds.filter(id => !entryModes.includes(id));
  const extraEntries = entryModes.filter(id => !runtimeModeIds.includes(id));
  const missingDirectClassifications = directManipulations.filter(item => !item.category || !item.start || !item.move || !item.complete || !item.cancel || !item.pointerCancel || !item.captureLost || !item.conflicts || !item.history || !item.recovery).map(item => item.directId);
  const unresolvedSurfaceRefs = [...modeContracts, ...directManipulations]
    .flatMap(item => item.surfaceIds || item.hostSurfaceIds || [])
    .filter(id => !includedSurfaceIds.has(id));
  const sourceFiles = [...new Set([
    ...Object.values(FILES),
    ...inventory.rows.flatMap(row => row.sourceFiles || []),
    ...directManipulations.flatMap(item => item.sourceRefs.map(ref => ref.file)),
    ...modeContracts.flatMap(item => item.sourceRefs.map(ref => ref.file))
  ])].sort();

  return {
    schemaVersion: 1,
    scope: "权威任务第 103 项：注册画布模式与非注册直接操控静态审计",
    sourceDigest: digestFiles(sourceFiles),
    totals: {
      runtimeModes: runtimeModes.length,
      registeredModes: registeredModes.length,
      entryModes: entryModes.length,
      modeContracts: modeContracts.length,
      missingModeContracts: missingModeContracts.length,
      extraModeContracts: extraModeContracts.length,
      missingRegistrations: missingRegistrations.length,
      extraRegistrations: extraRegistrations.length,
      missingEntries: missingEntries.length,
      extraEntries: extraEntries.length,
      legacyRegressionModes: legacyModes.length,
      legacyMissingModes: runtimeModeIds.filter(id => !legacyModes.includes(id)).length,
      directFamilies: directManipulations.length,
      directManipulations: expandedDirectRows.length,
      directHosts: expandedDirectRows.length,
      missingDirectClassifications: missingDirectClassifications.length,
      unresolvedSurfaceRefs: unresolvedSurfaceRefs.length,
      findings: auditFindings.length,
      codeConfirmed: modeContracts.filter(item => item.evidenceStatus === "E-C").length + directManipulations.filter(item => item.evidenceStatus === "E-C").length,
      browserPending: modeContracts.filter(item => item.browserEvidence === "pending-Q107").length + directManipulations.filter(item => item.browserEvidence === "pending-Q107").length
    },
    runtimeModes,
    registeredModes,
    entryModes,
    legacyComparison: {
      source: FILES.oldRegression,
      runtimeCount: runtimeModeIds.length,
      legacyCount: legacyModes.length,
      legacyModeIds: legacyModes,
      missingFromLegacy: runtimeModeIds.filter(id => !legacyModes.includes(id)),
      extraInLegacy: legacyModes.filter(id => !runtimeModeIds.includes(id))
    },
    findings: auditFindings,
    modeContracts,
    directManipulations,
    expandedDirectRows,
    coverage: {missingModeContracts, extraModeContracts, missingRegistrations, extraRegistrations, missingEntries, extraEntries, missingDirectClassifications, unresolvedSurfaceRefs: [...new Set(unresolvedSurfaceRefs)].sort()}
  };
}

export function writeDirectManipulationAudit(outputRoot = OUTPUT_ROOT) {
  const report = buildDirectManipulationAudit();
  mkdirSync(outputRoot, {recursive: true});
  writeFileSync(join(outputRoot, "canvas-and-direct-manipulation.json"), stableJson(report));
  writeFileSync(join(outputRoot, "canvas-and-direct-manipulation.md"), renderMarkdown(report));
  return report;
}

function persistentMode(key, modeId, panel, target, gesture, preview, complete, history, overrides = {}) {
  return modeDefinition(key, modeId, panel, target, gesture, preview, complete, history, {continuation: "持续模式；同一入口重入只更新上下文", ...overrides});
}

function oneShotMode(key, modeId, panel, target, gesture, preview, complete, history, overrides = {}) {
  return modeDefinition(key, modeId, panel, target, gesture, preview, complete, history, {continuation: "一次性模式；成功后退出", ...overrides});
}

function modeDefinition(key, modeId, panel, target, gesture, preview, complete, history, overrides) {
  return {
    key, modeId, panelId: panel, target, gesture, preview, complete, history,
    entry: `${panel} 中对应工具入口`,
    cursor: modeId === "measurement:draw" ? "css-crosshair" : modeId.includes("brush") || modeId.includes("assign") || modeId.includes("suitability") ? "brush-overlay" : "default",
    cancel: overrides.cancel || "同入口关闭、切换模式或面板关闭调用统一 cancel；活动手势按各领域回滚",
    switch: "CanvasToolModeManager 先以 reason=switch 取消旧模式，再进入新模式",
    escape: overrides.escape || "全局 Escape 未把此模式纳入 selection.cancel 的活动条件",
    panelClose: "关闭拥有面板时经 wrapper 的模式回调或显式 onClose 取消；实际 reason 为 panel-toggle 或 panel-close",
    mapReplace: "地图替换调用 canvasToolModes.reset(\"map-replace\") 清理活动模式和预览",
    conflict: "locksInteraction 默认阻止基础左键选择；鼠标中 / 右键导航仍由编辑锁放行",
    recovery: "onCancel / onComplete 共用退出清理；onError 由管理器回退活动状态并执行清理",
    feedback: "面板按钮 active 状态、目标 / 预览与地图状态反馈共同表示当前模式",
    continuation: overrides.continuation,
    locksInteraction: overrides.locksInteraction ?? true,
    surfaceIds: [`panel:${panel}`, "canvas:map-canvas", "canvas:generation-feedback"],
    browserSteps: ["F1 打开拥有面板并进入模式", "执行最小合法手势并核对结果 / 历史", "重新进入后取消、切换模式和关闭面板", "F5 替换地图前后核对模式与预览清理"]
  };
}

function verifyMode(item, includedSurfaceIds) {
  const sourceRefs = [
    ...registrationEvidence(item),
    ...entryEvidence(item),
    ...handlerEvidence(item),
    cursorEvidence(item),
    scopedRef(FILES.modeManager, "function applyEnter", "function applyCancel", ["reason: \"switch\"", "safeCleanupAfterEnterError"], ["switch", "recovery"]),
    sourceRef(FILES.runtime, ["canvasToolModes.reset(\"map-replace\")"], {supports: ["mapReplace"]}),
    panelCloseEvidence(item),
    escapeEvidence(item)
  ];
  sourceRefs.forEach(verifySourceRef);
  const requiredEvidence = ["entry", "target", "cursor", "gesture", "preview", "complete", "cancel", "switch", "escape", "panelClose", "mapReplace", "history", "recovery"];
  const supported = new Set(sourceRefs.flatMap(ref => ref.supports || []));
  const missingEvidence = requiredEvidence.filter(field => !supported.has(field));
  if (missingEvidence.length) throw new Error(`${item.modeId} 缺少逐模式生命周期证据：${missingEvidence.join(", ")}`);
  return {
    ...item,
    unresolvedSurfaceIds: item.surfaceIds.filter(id => !includedSurfaceIds.has(id)),
    evidenceStatus: "E-C",
    browserEvidence: "pending-Q107",
    severity: "N/A",
    confidence: "代码确认",
    intB: false,
    evidenceByField: Object.fromEntries(requiredEvidence.map(field => [field, sourceRefs.map((ref, index) => ref.supports?.includes(field) ? index : -1).filter(index => index >= 0)])),
    sourceRefs
  };
}

function registrationEvidence(item) {
  const directKeys = new Set(["HEIGHT_BRUSH", "STATE_BRUSH", "PROVINCE_BRUSH", "CITY_MOVE", "BIOME_ASSIGN", "SUITABILITY_PAINT", "MARKET_ASSIGN", "MEASUREMENT_DRAW", "MARKER_ADD", "MARKER_MOVE", "ROUTE_DRAW", "ROUTE_EDIT_WAYPOINT", "RIVER_ADD", "LAKE_EXCAVATE", "FEATURE_PATCH_SELECT", "FEATURE_TOPOLOGY_SELECT", "ZONE_ADD", "NOTE_ADD"]);
  if (directKeys.has(item.key)) {
    return [scopedRef(FILES.runtime, `register(CANVAS_TOOL_MODE.${item.key}`, "  register(", [`\"${item.panelId}\"`, "onExit"], ["target", "cancel", "recovery"])];
  }
  if (["STATE_ADD", "STATE_DELETE", "PROVINCE_ADD", "PROVINCE_DELETE"].includes(item.key)) {
    return [
      scopedRef(FILES.runtime, `modeId: CANVAS_TOOL_MODE.${item.key}`, "  });", [`panelId: \"${item.panelId}\"`], ["target"]),
      scopedRef(FILES.runtime, "function registerPoliticalOneShotMode", "function registerCityOneShotMode", ["onEnter", "onExit", "rollbackCanvasToolStroke"], ["cancel", "recovery"])
    ];
  }
  if (["CITY_ADD", "CITY_DELETE"].includes(item.key)) {
    return [
      sourceRef(FILES.runtime, [`registerCityOneShotMode(state, documentRef, register, CANVAS_TOOL_MODE.${item.key}`], {supports: ["target"]}),
      scopedRef(FILES.runtime, "function registerCityOneShotMode", "function registerSocialAssignmentMode", ["\"city-panel\"", "onEnter", "onExit"], ["cancel", "recovery"])
    ];
  }
  const kind = item.key.startsWith("CULTURE") ? "culture" : "religion";
  const helper = item.key.endsWith("ASSIGN") ? "registerSocialAssignmentMode" : "registerSocialCenterMode";
  const end = helper === "registerSocialAssignmentMode" ? "function registerSocialCenterMode" : "function activateCanvasToolTheme";
  return [
    sourceRef(FILES.runtime, [`${helper}(state, documentRef, register, \"${kind}\")`], {supports: ["target"]}),
    scopedRef(FILES.runtime, `function ${helper}`, end, [`CANVAS_TOOL_MODE.${item.key}`, "onEnter", "onExit"], ["cancel", "recovery"])
  ];
}

function entryEvidence(item) {
  if (["MARKER_ADD", "MARKER_MOVE"].includes(item.key)) {
    return [scopedRef(FILES.runtime, "function startMarkerEditMode", "function clearMarkerEditMode", [`CANVAS_TOOL_MODE.${item.key}`, "enterCanvasToolMode", "cancelCanvasToolMode"], ["entry", "cancel"])];
  }
  return [
    patternRef(FILES.runtime, `enterCanvasToolMode\\([\\s\\S]{0,120}?CANVAS_TOOL_MODE\\.${item.key}`, ["entry"]),
    patternRef(FILES.runtime, `cancelCanvasToolMode\\([\\s\\S]{0,120}?CANVAS_TOOL_MODE\\.${item.key}`, ["cancel"])
  ];
}

function handlerEvidence(item) {
  const refs = {
    HEIGHT_BRUSH: [scopedRef(FILES.runtime, "function bindHeightEditing", "function bindStateEditing", ["pointerdown", "pointermove", "pointerup", "pointercancel", "finishHeightStroke", "rollbackCanvasToolStroke"], ["gesture", "preview", "complete", "cancel", "history"])],
    STATE_BRUSH: [scopedRef(FILES.runtime, "function bindStateEditing", "function bindProvinceEditing", ["applyStateBrushAtEvent", "finishStateStroke", "rollbackCanvasToolStroke"], ["gesture", "preview", "complete", "cancel", "history"])],
    STATE_ADD: [scopedRef(FILES.runtime, "function bindStateEditing", "function bindProvinceEditing", ["createAddStateAtCellCommand", "executeEditCommand", "CANVAS_TOOL_MODE.STATE_ADD"], ["gesture", "preview", "complete", "history"])],
    STATE_DELETE: [scopedRef(FILES.runtime, "function bindStateEditing", "function bindProvinceEditing", ["createDeleteStateCommand", "executeEditCommand", "CANVAS_TOOL_MODE.STATE_DELETE"], ["gesture", "preview", "complete", "history"])],
    PROVINCE_BRUSH: [scopedRef(FILES.runtime, "function bindProvinceEditing", "function bindSocialAssignmentEditing", ["applyProvinceBrushAtEvent", "finishProvinceStroke", "rollbackCanvasToolStroke"], ["gesture", "preview", "complete", "cancel", "history"])],
    PROVINCE_ADD: [scopedRef(FILES.runtime, "function bindProvinceEditing", "function bindSocialAssignmentEditing", ["createAddProvinceAtCellCommand", "executeEditCommand", "CANVAS_TOOL_MODE.PROVINCE_ADD"], ["gesture", "preview", "complete", "history"])],
    PROVINCE_DELETE: [scopedRef(FILES.runtime, "function bindProvinceEditing", "function bindSocialAssignmentEditing", ["createDeleteProvinceCommand", "executeEditCommand", "CANVAS_TOOL_MODE.PROVINCE_DELETE"], ["gesture", "preview", "complete", "history"])],
    CITY_ADD: [scopedRef(FILES.runtime, "function bindCityEditing", "function cityMoveTargetAtEvent", ["createAddCityAtCellCommand", "executeEditCommand", "CANVAS_TOOL_MODE.CITY_ADD"], ["gesture", "preview", "complete", "history"])],
    CITY_DELETE: [scopedRef(FILES.runtime, "function bindCityEditing", "function cityMoveTargetAtEvent", ["createDeleteCityCommand", "executeEditCommand", "CANVAS_TOOL_MODE.CITY_DELETE"], ["gesture", "preview", "complete", "history"])],
    CITY_MOVE: [scopedRef(FILES.runtime, "function bindCityEditing", "function cityMoveTargetAtEvent", ["bindCityRelocationDrag", "onPreview", "createMoveCityCommand", "CANVAS_TOOL_MODE.CITY_MOVE"], ["gesture", "preview", "complete", "history"]), sourceRef(FILES.cityDrag, ["pointercancel", "onCancel", "onCommit"], {supports: ["cancel"]})],
    CULTURE_ASSIGN: socialHandlerEvidence(),
    RELIGION_ASSIGN: socialHandlerEvidence(),
    CULTURE_CENTER: draftPickEvidence(item.key, "setExpansionCenter"),
    RELIGION_CENTER: draftPickEvidence(item.key, "setExpansionCenter"),
    BIOME_ASSIGN: [scopedRef(FILES.runtime, "function bindBiomeAssignmentEditing", "function bindSuitabilityEditing", ["applyBiomeAssignmentAtEvent", "finishBiomeAssignmentStroke", "rollbackCanvasToolStroke"], ["gesture", "preview", "complete", "cancel", "history"])],
    SUITABILITY_PAINT: [scopedRef(FILES.runtime, "function bindSuitabilityEditing", "function bindMarketAssignmentEditing", ["applySuitabilityAtEvent", "finishSuitabilityStroke", "rollbackCanvasToolStroke"], ["gesture", "preview", "complete", "cancel", "history"])],
    MARKET_ASSIGN: [scopedRef(FILES.runtime, "function bindMarketAssignmentEditing", "function bindCityEditing", ["applyMarketAssignmentAtEvent", "pointerup", "pointercancel", "updateMarketAssignmentPreview"], ["gesture", "preview", "cancel"]), scopedRef(FILES.runtime, "function applyPendingMarketAssignment", "function rebuildEconomyViaAction", ["createApplyMarketAssignmentCommand", "executeEditCommand", "completeCanvasToolMode"], ["complete", "history"])],
    MEASUREMENT_DRAW: [scopedRef(FILES.runtime, "function bindMeasurementTool", "function measurementContinuousSamplingActive", ["pointerdown", "pointermove", "pointerup", "pointercancel", "state.measurement.points"], ["gesture", "preview", "cancel"]), scopedRef(FILES.runtime, "function saveCurrentMeasurement", "function undoMeasurementPoint", ["createSaveMeasurementCommand", "createUpdateMeasurementPointsCommand", "executeEditCommand"], ["complete", "history"])],
    MARKER_ADD: markerEvidence(item.key, "createAddMarkerCommand"),
    MARKER_MOVE: markerEvidence(item.key, "createMoveMarkerCommand"),
    ROUTE_DRAW: objectToolEvidence(item.key, ["state.routeCreate.startPackCell", "runtimeActions.edit.routes.create"], ["gesture", "preview", "complete", "history"]),
    ROUTE_EDIT_WAYPOINT: objectToolEvidence(item.key, ["setEditWaypoint", "completeCanvasToolMode"], ["gesture", "preview", "complete", "history"]),
    RIVER_ADD: objectToolEvidence(item.key, ["runtimeActions.edit.rivers.create", "completeCanvasToolMode"], ["gesture", "preview", "complete", "history"]),
    LAKE_EXCAVATE: objectToolEvidence(item.key, ["runtimeActions.edit.lakes.create", "completeCanvasToolMode"], ["gesture", "preview", "complete", "history"]),
    FEATURE_PATCH_SELECT: objectToolEvidence(item.key, ["setPatchCell", "completeCanvasToolMode"], ["gesture", "preview", "complete", "history"]),
    FEATURE_TOPOLOGY_SELECT: [scopedRef(FILES.runtime, "function bindObjectCreationTools", "function bindCustomLabelDrag", ["CANVAS_TOOL_MODE.FEATURE_TOPOLOGY_SELECT", "setTopologyCell"], ["gesture", "preview"]), scopedRef(FILES.runtime, "export function applyFeatureTopologyViaApi", "export function inspectStateTopologyViaApi", ["executeEditCommand", "CANVAS_TOOL_MODE.FEATURE_TOPOLOGY_SELECT"], ["complete", "history"])],
    ZONE_ADD: objectToolEvidence(item.key, ["runtimeActions.edit.zones.create", "completeCanvasToolMode"], ["gesture", "preview", "complete", "history"]),
    NOTE_ADD: objectToolEvidence(item.key, ["runtimeActions.edit.notes.create", "completeCanvasToolMode"], ["gesture", "preview", "complete", "history"])
  };
  const result = refs[item.key];
  if (!result) throw new Error(`缺少模式 handler 证据定义：${item.key}`);
  return result;
}

function socialHandlerEvidence() {
  return [scopedRef(FILES.runtime, "function bindSocialAssignmentEditing", "function bindBiomeAssignmentEditing", ["pointerdown", "pointermove", "pointerup", "pointercancel", "finishSocialAssignmentStroke", "rollbackCanvasToolStroke"], ["gesture", "preview", "complete", "cancel", "history"])];
}

function draftPickEvidence(key, actionToken) {
  return objectToolEvidence(key, [actionToken, "completeCanvasToolMode"], ["gesture", "preview", "complete", "history"]);
}

function markerEvidence(key, commandToken) {
  return [scopedRef(FILES.runtime, "function bindMarkerEditing", "function bindObjectCreationTools", [commandToken, "execute", `CANVAS_TOOL_MODE.${key}`, "completeCanvasToolMode"], ["gesture", "preview", "complete", "history"])];
}

function objectToolEvidence(key, tokens, supports) {
  return [scopedRef(FILES.runtime, "function bindObjectCreationTools", "function bindCustomLabelDrag", [`CANVAS_TOOL_MODE.${key}`, ...tokens], supports)];
}

function cursorEvidence(item) {
  const brushModes = new Set([...readText(FILES.brushCursor).matchAll(/modeId === "([^"]+)"/g)].map(match => match[1]));
  const expected = brushModes.has(item.modeId) ? "brush-overlay" : item.modeId === "measurement:draw" ? "css-crosshair" : "default";
  if (item.cursor !== expected) throw new Error(`${item.modeId} 光标契约与源码不一致：${item.cursor} != ${expected}`);
  if (item.cursor === "brush-overlay") return sourceRef(FILES.brushCursor, [`modeId === \"${item.modeId}\"`], {supports: ["cursor"]});
  if (item.cursor === "css-crosshair") return sourceRef(FILES.styles, [".measurement-active #map-canvas", "cursor: crosshair"], {supports: ["cursor"]});
  return sourceRef(FILES.brushCursor, ["return null"], {supports: ["cursor"]});
}

function panelCloseEvidence(item) {
  const file = `app/webgl-generator/src/ui/panels/${item.panelId}.js`;
  const callbackByKey = {
    HEIGHT_BRUSH: "callbacks.onActiveChange",
    STATE_BRUSH: "callbacks.onActiveChange",
    STATE_ADD: "callbacks.onAddMode",
    STATE_DELETE: "callbacks.onDeleteMode",
    PROVINCE_BRUSH: "callbacks.onActiveChange",
    PROVINCE_ADD: "callbacks.onAddMode",
    PROVINCE_DELETE: "callbacks.onDeleteMode",
    CITY_ADD: "callbacks.onAddMode",
    CITY_DELETE: "callbacks.onDeleteMode",
    CITY_MOVE: "callbacks.onMoveMode",
    CULTURE_ASSIGN: "callbacks.onAssignmentActive",
    CULTURE_CENTER: "callbacks.onCenterPickActive",
    RELIGION_ASSIGN: "callbacks.onAssignmentActive",
    RELIGION_CENTER: "callbacks.onCenterPickActive",
    BIOME_ASSIGN: "callbacks.onAssignmentActive",
    SUITABILITY_PAINT: "callbacks.onSuitabilityActive"
  };
  return sourceRef(file, ["onClose", callbackByKey[item.key] || "callbacks.onClose"], {supports: ["panelClose"]});
}

function escapeEvidence(item) {
  const source = readText(FILES.runtime);
  const start = source.indexOf("function canExecuteKeyboardShortcut");
  const end = source.indexOf("async function invokePublicApi", start);
  const shortcutScope = source.slice(start, end > start ? end : source.length);
  const directKeys = new Set([...shortcutScope.matchAll(/CANVAS_TOOL_MODE\.([A-Z0-9_]+)/g)].map(match => match[1]));
  const direct = directKeys.has(item.key);
  if (direct !== item.escape.includes("特判取消")) throw new Error(`${item.modeId} Escape 契约与快捷键源码不一致`);
  return scopedRef(FILES.runtime, "function canExecuteKeyboardShortcut", "async function invokePublicApi", ["selection.cancel", "CANVAS_TOOL_MODE.CITY_MOVE"], ["escape"]);
}

function expandedDirectDefinitions(inventory) {
  const panelHosts = inventory.rows.filter(row => row.included && ["vue-panel-detail", "non-vue-panel"].includes(row.sourceType)).map(row => row.surfaceId).sort();
  const actionDockHosts = inventory.rows.filter(row => row.included && row.surfaceId.startsWith("fixed-overlay:action-dock:")).map(row => row.surfaceId).sort();
  const treeHosts = inventory.rows.filter(row => row.included && row.surfaceId.startsWith("fixed-overlay:tree:")).map(row => row.surfaceId).sort();
  const tableHosts = tableInstanceHosts();
  return [
    direct("DM-01", "基础画布左键点击选择", "canvas-navigation", ["canvas:map-canvas"], 1, {
      start: "鼠标左键 pointerdown 建立 select 指针并捕获", move: "移动超过 3px 标记 moved，仅更新 hover", complete: "pointerup 且未移动调用 onSelect", clickNoMove: "执行一次对象 / cell 选择", cancel: "无键盘取消；pointerup 结束", pointerCancel: "清空 activePointer，不执行选择", captureLost: "未监听 lostpointercapture；依赖 pointercancel", conflicts: "活动画布工具先拦截左键，未锁定时才到 renderer", history: "选择不写地图历史", recovery: "下一次 pointerdown 可重新开始", refs: [[FILES.renderer, ["mode === \"select\"", "onSelect(event)", "activePointer = null"]]]
    }),
    canvasPan("DM-02", "基础画布鼠标中键平移", "event.button === 1"),
    canvasPan("DM-03", "基础画布鼠标右键平移", "event.button === 2"),
    canvasPan("DM-04", "基础画布非鼠标主指针平移", "return event.button === 0 ? \"pan\" : null"),
    direct("DM-05", "基础画布滚轮锚点缩放", "canvas-navigation", ["canvas:map-canvas"], 1, {
      start: "wheel 读取光标、画布矩形和旧 scale", move: "单次事件计算 0.5～12 的新 scale", complete: "保持光标对应世界点并调用 onChange", clickNoMove: "零 delta 不产生可见变化", cancel: "无跨事件草稿", pointerCancel: "不适用", captureLost: "不使用指针捕获", conflicts: "活动编辑锁默认拦截 wheel", history: "相机变化不写地图历史", recovery: "每次 wheel 独立从当前相机计算", refs: [[FILES.renderer, ["\"wheel\"", "previousScale", "worldX"]], [FILES.runtime, ["\"pointercancel\", \"wheel\""]]]
    }),
    direct("DM-06", "基础画布右键菜单抑制", "canvas-navigation", ["canvas:map-canvas"], 1, {
      start: "contextmenu 到达 canvas", move: "不适用", complete: "preventDefault 抑制浏览器菜单", clickNoMove: "右键点击不打开菜单", cancel: "无状态", pointerCancel: "不适用", captureLost: "不使用指针捕获", conflicts: "与右键平移共享鼠标右键序列", history: "不写地图历史", recovery: "每次事件独立", refs: [[FILES.renderer, ["\"contextmenu\"", "event.preventDefault()"]]]
    }),
    direct("DM-07", "基础画布中 / 右键 auxclick 抑制", "canvas-navigation", ["canvas:map-canvas"], 1, {
      start: "auxclick 到达 canvas", move: "不适用", complete: "button 1 / 2 时 preventDefault", clickNoMove: "不触发浏览器默认中键或右键动作", cancel: "无状态", pointerCancel: "不适用", captureLost: "不使用指针捕获", conflicts: "与中 / 右键平移共享按键序列", history: "不写地图历史", recovery: "每次事件独立", refs: [[FILES.renderer, ["\"auxclick\"", "event.button === 1 || event.button === 2"]]]
    }),
    labelDrag("DM-08", "手工标签首次放置并拖动", true),
    labelDrag("DM-09", "已有手工标签拖动", false),
    direct("DM-10", "测量控制点拖动", "measurement-edit", ["canvas:measurement-overlay"], 1, {
      start: "控制点主键 pointerdown 建立 drag", move: "自由模式按世界坐标移动，贴路模式吸附路线", complete: "pointerup 结束拖动并保留草稿点", clickNoMove: "草稿坐标保持", cancel: "清空按钮删除草稿；同入口 toggle-off 只退出模式并保留草稿", pointerCancel: "与 pointerup 共用 drag.end，不恢复拖动前坐标", captureLost: "window capture-phase 监听但无 lostpointercapture", conflicts: "overlay 控制点阻止画布选择；测量模式 locksInteraction=false", history: "拖动不写历史，保存修改才写命令", recovery: "切换模式、关闭面板、切图或进入失败时清理草稿；普通 toggle-off 后可继续", refs: [[FILES.runtime, ["startMeasurementPointDrag", "moveMeasurementPoint", "cancelMeasurementDrag"]]]
    }),
    direct("DM-11", "测量控制点右键 / Alt / Shift 删除", "measurement-edit", ["canvas:measurement-overlay"], 1, {
      start: "控制点 pointerdown 检查右键、Alt 或 Shift", move: "不适用", complete: "立即从草稿 points 删除并刷新 overlay", clickNoMove: "一次修饰点击删除一个点", cancel: "删除后只能退出整个草稿或重新载入保存对象", pointerCancel: "删除发生在 pointerdown，后续 pointercancel 不回滚", captureLost: "不使用指针捕获", conflicts: "优先于主键拖动", history: "草稿删除不写历史，保存时才写命令", recovery: "取消编辑可丢弃草稿；保存前原对象不变", refs: [[FILES.runtime, ["shouldDeleteMeasurementPoint", "deleteMeasurementPoint"]]]
    }),
    direct("DM-12", "测量控制点 Delete / Backspace 删除", "measurement-edit", ["canvas:measurement-overlay"], 1, {
      start: "测量 overlay 键盘处理识别 Delete / Backspace", move: "不适用", complete: "删除当前目标点并刷新草稿", clickNoMove: "不适用", cancel: "删除后只能退出草稿或重新载入保存对象", pointerCancel: "不适用", captureLost: "不使用指针捕获", conflicts: "输入控件焦点应由快捷键 / overlay 路由隔离", history: "草稿删除不写历史，保存时才写命令", recovery: "取消编辑可丢弃草稿", refs: [[FILES.runtime, ["Delete", "Backspace", "deleteMeasurementPoint"]]]
    }),
    direct("DM-13", "载入已保存测量路径并编辑 / 保存", "measurement-edit", ["canvas:measurement-overlay"], 1, {
      start: "编辑动作复制保存对象 points 并设置 editingMeasurementId", move: "通过控制点拖动、插点或删点修改草稿", complete: "UI 保存修改创建 createUpdateMeasurementPointsCommand 并交给 executeEditCommand", clickNoMove: "无变化保存由命令结果判定", cancel: "清空按钮、模式切换、关面板或切图清理；同入口 toggle-off 保留编辑草稿", pointerCancel: "按具体点拖动语义处理，不自动保存", captureLost: "按具体点拖动语义处理", conflicts: "同一时刻只维护一个 measurement 草稿", history: "成功保存更新写一条测量命令", recovery: "保存失败原对象保持，草稿仍可调整；toggle-off 后可再次进入继续", refs: [scopedRef(FILES.runtime, "function saveCurrentMeasurement", "function undoMeasurementPoint", ["createUpdateMeasurementPointsCommand", "executeEditCommand"], [])]
    }),
    hostDrag("DM-14", "主面板标题栏拖动", "panel-drag", panelHosts, {
      start: "非按钮标题 pointerdown 记录起点并捕获", move: "更新 left / top 并保持可达", complete: "实际移动后提交手工位置并释放捕获", clickNoMove: "不持久化新位置", cancel: "无键盘取消", pointerCancel: "恢复起点并重新排版", captureLost: "未监听 lostpointercapture", conflicts: "标题按钮不启动拖动；拖动激活面板", history: "只持久化布局，不写地图历史", recovery: "pointercancel 回原位，reflow 保证可达", refs: [[FILES.panelManager, ["function installDrag", "commitManualPosition", "pointercancel"]]]
    }),
    hostDrag("DM-15", "动作坞二级面板拖动", "panel-drag", actionDockHosts, {
      start: "二级标题 pointerdown 记录矩形", move: "window pointermove 约束在视口内", complete: "pointerup 保留会话位置", clickNoMove: "标记用户定位但位置不变", cancel: "关闭动作坞结束；无回滚键", pointerCancel: "与 pointerup 相同，保留末位置", captureLost: "不使用捕获，依赖 window 监听", conflicts: "点击外部关闭；Element Plus popper 例外", history: "不写地图历史", recovery: "resize / scroll 重新约束", refs: [[FILES.actionDock, ["startPanelDrag", "onPanelDragMove", "stopPanelDrag"]]]
    }),
    hostDrag("DM-16", "项目导出浮层拖动", "floating-overlay-drag", ["fixed-overlay:project-export"], {
      start: "标题调用共享 startDrag 并捕获", move: "window pointermove 更新视口内位置", complete: "pointerup 约束并写 localStorage", clickNoMove: "仍保存当前位置和宽度", cancel: "无独立回滚键", pointerCancel: "与 pointerup 相同并持久化末位置", captureLost: "未监听 lostpointercapture", conflicts: "按钮、链接和表单控件不启动", history: "只持久化 UI 位置", recovery: "resize 约束；损坏存储回退默认", refs: [[FILES.controlPanel, ["startExportPanelDrag", "useDraggableFloatingPanel"]], [FILES.draggablePanel, ["startDrag", "saveStoredPosition"]]]
    }),
    hostDrag("DM-17", "文化 / 宗教树状浮层拖动", "floating-overlay-drag", treeHosts, {
      start: "标题调用共享 startDrag 并捕获", move: "window pointermove 更新视口内位置", complete: "pointerup 约束并在当前会话保留末位置", clickNoMove: "会话位置不变", cancel: "无独立回滚键", pointerCancel: "与 pointerup 相同，仅在会话内保留末位置", captureLost: "未监听 lostpointercapture", conflicts: "内部控件不启动拖动", history: "未传 storageKey，不持久化且不写地图历史", recovery: "卸载 stopDrag；重新创建组件回到调用方定位", refs: [[FILES.treePanel, ["useDraggableFloatingPanel(panel", "startDrag"]], [FILES.draggablePanel, ["if (!storageKey", "onBeforeUnmount"]]]
    }),
    hostDrag("DM-18", "高度图工作台拖动", "floating-overlay-drag", ["panel:height-panel"], {
      start: "标题主键 pointerdown 记录起点，按钮除外", move: "window pointermove 并约束视口", complete: "pointerup 保留会话位置", clickNoMove: "位置不变", cancel: "无独立回滚键", pointerCancel: "与 pointerup 相同，保留末位置", captureLost: "不使用捕获，依赖 window 监听", conflicts: "标题按钮不启动拖动", history: "不写地图历史", recovery: "停止时移除 window 监听", refs: [[FILES.heightPanel, ["startWorkbenchDrag", "onWorkbenchDrag", "stopWorkbenchDrag"]]]
    }),
    hostDrag("DM-19", "对象表格列宽拖动", "table-resize", ["shared:object-table", "shared:ui-object-table"], {
      hostLabels: tableHosts, hostCount: tableHosts.length,
      start: "列手柄 pointerdown 记录起点和宽度", move: "window pointermove clamp 后发出 column-resize", complete: "pointerup 保留最后一次宿主宽度", clickNoMove: "可保持相同宽度", cancel: "无键盘取消或起点回滚", pointerCancel: "与 pointerup 相同，保留最后宽度", captureLost: "不使用捕获，依赖 window 监听", conflicts: "手柄阻止默认与传播，避免表头排序", history: "保存到面板列表偏好，不写地图历史", recovery: "停止时移除 window 监听", refs: [[FILES.objectTable, ["startColumnResize", "handleColumnResizeMove", "stopColumnResize"]]]
    })
  ];
}

function canvasPan(id, label, evidenceToken) {
  return direct(id, label, "canvas-navigation", ["canvas:map-canvas"], 1, {
    start: "对应指针主序列进入 pan 并捕获", move: "按画布尺寸增量更新 camera offset", complete: "pointerup 清理并释放捕获", clickNoMove: "不改变相机且不触发选择", cancel: "pointercancel 清空 activePointer", pointerCancel: "停止平移，已产生相机增量保留", captureLost: "未监听 lostpointercapture", conflicts: "编辑锁放行鼠标中 / 右键，触控主键可能被活动工具拦截", history: "相机变化不写地图历史", recovery: "下一次从当前相机继续", refs: [[FILES.renderer, ["pointerInteractionMode", evidenceToken, "camera.offsetX"]], [FILES.runtime, ["isMouseButtonNavigationEvent"]]]
  });
}

function labelDrag(id, label, initialPlacement) {
  return direct(id, label, "map-overlay-drag", ["canvas:map-overlay"], 1, {
    start: initialPlacement ? "创建命令后在画布落点并立即建立 drag" : "已有 custom-label pointerdown 建立 drag 并捕获",
    move: "screenToWorld 后实时更新标签坐标和面板",
    complete: initialPlacement ? "pointerup 更新原创建命令的落点" : "pointerup 执行移动标签命令",
    clickNoMove: initialPlacement ? "保留首次落点" : "同点移动由命令 no-op 处理",
    cancel: "没有独立回滚入口", pointerCancel: "与 pointerup 共用 finishCustomLabelDrag，仍提交当前坐标", captureLost: "未监听 lostpointercapture", conflicts: "overlay 阻止事件传播；锁定标签只反馈不拖动", history: initialPlacement ? "沿用一条创建历史" : "有效移动写一条历史", recovery: "命令失败刷新标签；缺失标签时清理拖态", refs: [[FILES.runtime, ["startCustomLabelDrag", "finishCustomLabelDrag", initialPlacement ? "pendingCustomLabelPlacement" : "createMoveCustomLabelCommand"]]]
  });
}

function hostDrag(id, label, category, surfaces, values) {
  const hostLabels = values.hostLabels || surfaces;
  return direct(id, label, category, surfaces, values.hostCount || hostLabels.length, {...values, hostLabels});
}

function expandDirectRows(item) {
  return item.hostLabels.map((host, index) => ({
    directRowId: `${item.directId}-${String(index + 1).padStart(2, "0")}`,
    familyId: item.directId,
    label: item.label,
    host,
    category: item.category,
    clickNoMove: item.clickNoMove,
    pointerCancel: item.pointerCancel,
    captureLost: item.captureLost,
    conflicts: item.conflicts,
    history: item.history,
    recovery: item.recovery,
    evidenceStatus: item.evidenceStatus,
    browserEvidence: item.browserEvidence
  }));
}

function direct(id, label, category, surfaceIds, hostCount, values) {
  return {
    directId: id, label, category, hostSurfaceIds: surfaceIds, hostCount,
    start: values.start, move: values.move, complete: values.complete, clickNoMove: values.clickNoMove,
    cancel: values.cancel, pointerCancel: values.pointerCancel, captureLost: values.captureLost,
    conflicts: values.conflicts, history: values.history, recovery: values.recovery,
    hostLabels: values.hostLabels || surfaceIds,
    sourceRefs: values.refs.map(ref => Array.isArray(ref) ? sourceRef(ref[0], ref[1]) : ref),
    browserSteps: ["F1 / F2 构造目标状态", "执行点击未移动与实际拖动", "执行 pointercancel 或等价异常终止", "核对结果、历史、冲突和复位"]
  };
}

function verifyDirect(item, includedSurfaceIds) {
  item.sourceRefs.forEach(verifySourceRef);
  return {
    ...item,
    unresolvedSurfaceIds: item.hostSurfaceIds.filter(id => !includedSurfaceIds.has(id)),
    evidenceStatus: "E-C",
    browserEvidence: "pending-Q107",
    severity: "N/A",
    confidence: "代码确认",
    intB: false
  };
}

function findings(runtimeModeIds, legacyModes) {
  const legacyMissing = runtimeModeIds.filter(id => !legacyModes.includes(id));
  return [
    {
      findingId: "IA-103-001",
      title: "既有画布模式回归分母落后于运行时",
      behavior: `运行时有 ${runtimeModeIds.length} 个注册模式，既有回归仅冻结 ${legacyModes.length} 个，缺少 ${legacyMissing.join("、")}。`,
      impact: "旧门禁通过不能证明新增模式已经进入统一模式生命周期回归。",
      recommendation: "后续整改批次让既有回归从运行时真实清单派生或同步补齐；本批不修改旧门禁。",
      severity: "P1", confidence: "代码确认", intB: false,
      evidenceStatus: "E-C", browserEvidence: "not-required-test-contract",
      sourceRefs: [sourceRef(FILES.runtime, ["export const CANVAS_TOOL_MODE"]), sourceRef(FILES.oldRegression, ["const expectedModes = ["])]
    },
    {
      findingId: "IA-103-002",
      title: "Escape 只显式退出城镇移动模式",
      behavior: "selection.cancel 的可执行条件和 handler 只把 city:move 视为活动画布模式；其它活动模式不由该快捷键退出。",
      impact: "用户可能预期 Escape 先退出当前工具，但多数模式仍保持 active，退出方式依赖原面板入口或关闭面板。",
      recommendation: "第 107 项验证典型持续 / 一次性 / 草稿模式；若确认不合人类预期，另立 INT-B 任务设计统一优先级。",
      severity: "P2", confidence: "待验证", intB: true,
      evidenceStatus: "E-C", browserEvidence: "pending-Q107",
      sourceRefs: [sourceRef(FILES.shortcuts, ["selection.cancel", "binding(\"Escape\")"]), sourceRef(FILES.runtime, ["selection-or-editing", "CANVAS_TOOL_MODE.CITY_MOVE", "\"escape\""])]
    },
    {
      findingId: "IA-103-003",
      title: "手工标签 pointercancel 仍提交位置且切图未统一清理拖动",
      behavior: "pointerup 与 pointercancel 共用 finishCustomLabelDrag；loadMapIntoRuntime 的切图清理未显式终止 customLabelDrag / pendingCustomLabelPlacement 及其 window 监听。",
      impact: "系统级取消仍可能形成移动历史；若拖动跨越地图替换，旧监听可能继续作用到新 runtime 状态。",
      recommendation: "后续 INT-B 任务区分提交与取消，并在地图替换前统一终止标签拖动。",
      severity: "P1", confidence: "代码确认", intB: true,
      evidenceStatus: "E-C", browserEvidence: "pending-Q107",
      sourceRefs: [sourceRef(FILES.runtime, ["view.addEventListener(\"pointercancel\", end, true)", "finishCustomLabelDrag", "async function loadMapIntoRuntime"])]
    },
    {
      findingId: "IA-103-004",
      title: "测量控制点 pointercancel 不恢复拖动前坐标",
      behavior: "测量控制点的 pointerup 与 pointercancel 共用 drag.end；该函数只清理监听，不保存起点或回滚草稿坐标。",
      impact: "虽然未保存草稿尚未写历史，但取消手势与完成手势在可见结果上没有区别。",
      recommendation: "第 107 项验证用户可见取消结果；若需回滚，另立 INT-B 任务保存起点并区分结束原因。",
      severity: "P2", confidence: "待验证", intB: true,
      evidenceStatus: "E-C", browserEvidence: "pending-Q107",
      sourceRefs: [sourceRef(FILES.runtime, ["startMeasurementPointDrag", "view.addEventListener(\"pointercancel\", drag.end, true)", "cancelMeasurementDrag"])]
    },
    {
      findingId: "IA-103-005",
      title: "指针捕获路径没有 lostpointercapture 恢复消费者",
      behavior: "当前应用源码使用 setPointerCapture / releasePointerCapture，但没有注册 lostpointercapture。",
      impact: "浏览器或系统意外丢失捕获时，部分拖动态只能依赖 pointercancel，存在残留状态风险。",
      recommendation: "第 107 项覆盖可构造路径；后续统一拖动基础设施时补 lostpointercapture 收口。",
      severity: "P2", confidence: "代码确认", intB: true,
      evidenceStatus: "E-C", browserEvidence: "pending-Q107",
      sourceRefs: [sourceRef(FILES.panelManager, ["setPointerCapture", "releasePointerCapture"]), sourceRef(FILES.draggablePanel, ["setPointerCapture", "releasePointerCapture"])]
    },
    {
      findingId: "IA-103-006",
      title: "共享拖动的 pointercancel 结果不一致",
      behavior: "主面板回到起点；动作坞、高度工作台和未传 storageKey 的树状浮层仅在会话内保留末位置；项目导出浮层会持久化末位置；表格列宽保留最后一次 emit。",
      impact: "相同的系统取消手势在不同表面表现为回滚、保留或持久化，用户难以形成一致预期。",
      recommendation: "第 107 项记录实际可见差异；后续按交互类型决定统一语义，不在审计批次修改。",
      severity: "P3", confidence: "代码确认", intB: true,
      evidenceStatus: "E-C", browserEvidence: "pending-Q107",
      sourceRefs: [sourceRef(FILES.panelManager, ["pointercancel", "startLeft", "startTop"]), sourceRef(FILES.actionDock, ["pointercancel", "stopPanelDrag"]), sourceRef(FILES.draggablePanel, ["pointercancel", "constrainPanel({save: true})"]), sourceRef(FILES.objectTable, ["pointercancel", "stopColumnResize"])]
    },
    {
      findingId: "IA-103-007",
      title: "十九个拾取 / 创建 / 移动模式使用默认画布光标",
      behavior: "只有八个连续笔刷使用 brush overlay，measurement 使用 crosshair；其余十九个模式没有模式专属光标。",
      impact: "首次用户主要依赖面板按钮和状态文案理解下一步需要在画布操作。",
      recommendation: "第 107 项观察典型模式的可发现性；如不足，后续纯 UI 候选可增加 cursor / overlay 提示。",
      severity: "P2", confidence: "待验证", intB: false,
      evidenceStatus: "E-C", browserEvidence: "pending-Q107",
      sourceRefs: [sourceRef(FILES.runtime, ["function getActiveEditorKind", "CANVAS_TOOL_MODE.MEASUREMENT_DRAW"])]
    }
  ].map(item => ({...item, sourceRefs: item.sourceRefs.map(ref => (verifySourceRef(ref), ref))}));
}

function parseRuntimeModes() {
  const source = readText(FILES.runtime);
  const block = source.match(/export const CANVAS_TOOL_MODE = Object\.freeze\(\{([\s\S]*?)\n\}\);/)?.[1];
  if (!block) throw new Error("无法读取 CANVAS_TOOL_MODE 运行时分母");
  return [...block.matchAll(/^\s*([A-Z0-9_]+):\s*"([^"]+)",?$/gm)].map(match => ({key: match[1], modeId: match[2]}));
}

function parseRegisteredModes(runtimeModes) {
  const source = readText(FILES.runtime);
  const keys = [
    ...source.matchAll(/\bregister\(CANVAS_TOOL_MODE\.([A-Z0-9_]+)/g),
    ...source.matchAll(/registerCityOneShotMode\([\s\S]{0,100}?CANVAS_TOOL_MODE\.([A-Z0-9_]+)/g),
    ...source.matchAll(/modeId:\s*CANVAS_TOOL_MODE\.([A-Z0-9_]+)/g)
  ].map(match => match[1]);
  if (source.includes('registerSocialAssignmentMode(state, documentRef, register, "culture")')) keys.push("CULTURE_ASSIGN");
  if (source.includes('registerSocialAssignmentMode(state, documentRef, register, "religion")')) keys.push("RELIGION_ASSIGN");
  if (source.includes('registerSocialCenterMode(state, documentRef, register, "culture")')) keys.push("CULTURE_CENTER");
  if (source.includes('registerSocialCenterMode(state, documentRef, register, "religion")')) keys.push("RELIGION_CENTER");
  return modeIdsForKeys(runtimeModes, keys);
}

function parseEntryModes(runtimeModes) {
  const source = readText(FILES.runtime);
  const keys = [...source.matchAll(/enterCanvasToolMode\([\s\S]{0,100}?CANVAS_TOOL_MODE\.([A-Z0-9_]+)/g)].map(match => match[1]);
  if (source.includes("function startMarkerEditMode") && source.includes("CANVAS_TOOL_MODE.MARKER_ADD") && source.includes("CANVAS_TOOL_MODE.MARKER_MOVE")) keys.push("MARKER_ADD", "MARKER_MOVE");
  return modeIdsForKeys(runtimeModes, keys);
}

function modeIdsForKeys(runtimeModes, keys) {
  const byKey = new Map(runtimeModes.map(item => [item.key, item.modeId]));
  return [...new Set(keys)].sort().map(key => {
    const modeId = byKey.get(key);
    if (!modeId) throw new Error(`模式源码引用了未声明常量：${key}`);
    return modeId;
  }).sort();
}

function parseLegacyRegressionModes() {
  const source = readText(FILES.oldRegression);
  const block = source.match(/const expectedModes = \[([\s\S]*?)\n\];/)?.[1];
  if (!block) throw new Error("无法读取既有画布模式回归分母");
  return [...block.matchAll(/"([^"]+)"/g)].map(match => match[1]);
}

function componentHosts(token) {
  const root = join(REPO_ROOT, "app", "webgl-generator", "src", "ui", "vue", "components");
  const inventory = buildInteractionInventory();
  return inventory.rows
    .flatMap(row => row.sourceFiles || [])
    .filter(file => file.startsWith(relativePath(root)) && file.endsWith(".vue"))
    .filter(file => readText(file).includes(token))
    .map(file => basename(file))
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort();
}

function tableInstanceHosts() {
  const components = componentHosts("resizable-columns");
  return components.flatMap(file => {
    const source = readText(`app/webgl-generator/src/ui/vue/components/${file}`);
    const tags = (source.match(/<UiObjectTable\b[\s\S]*?>/g) || []).filter(tag => tag.includes("resizable-columns"));
    return tags.map((_, index) => `${file}#${index + 1}`);
  });
}

function sourceRef(file, tokens, options = {}) {
  return {file, tokens, ...(options.scope ? {scope: options.scope} : {}), ...(options.pattern ? {pattern: options.pattern} : {}), ...(options.supports ? {supports: options.supports} : {})};
}

function scopedRef(file, anchor, end, tokens, supports) {
  return sourceRef(file, tokens, {scope: {anchor, end}, supports});
}

function patternRef(file, pattern, supports) {
  return sourceRef(file, [], {pattern, supports});
}

function verifySourceRef(ref) {
  const fullSource = readText(ref.file);
  let source = fullSource;
  if (ref.scope?.anchor) {
    const start = fullSource.indexOf(ref.scope.anchor);
    if (start < 0) throw new Error(`${ref.file} 缺少静态证据范围起点：${ref.scope.anchor}`);
    const contentStart = start + ref.scope.anchor.length;
    const end = ref.scope.end ? fullSource.indexOf(ref.scope.end, contentStart) : -1;
    source = fullSource.slice(start, end >= 0 ? end : fullSource.length);
  }
  if (ref.pattern && !new RegExp(ref.pattern).test(fullSource)) throw new Error(`${ref.file} 缺少静态证据模式：${ref.pattern}`);
  for (const token of ref.tokens) if (!source.includes(token)) throw new Error(`${ref.file} 缺少静态证据：${token}`);
}

function digestFiles(files) {
  const hash = createHash("sha256");
  for (const file of files) hash.update(file).update("\0").update(readText(file)).update("\0");
  return hash.digest("hex");
}

function readText(file) {
  return readFileSync(join(REPO_ROOT, file), "utf8");
}

function relativePath(file) {
  return relative(REPO_ROOT, file).replaceAll("\\", "/");
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function renderMarkdown(report) {
  const lines = [
    "# 画布模式与直接操控审计",
    "",
    `- 运行时注册模式：${report.totals.runtimeModes}`,
    `- 模式契约：${report.totals.modeContracts}`,
    `- 非注册直接操控：${report.totals.directFamilies} 类 / ${report.totals.directManipulations} 行展开路径`,
    `- 未覆盖模式 / 未分类操控 / 未解析表面：${report.totals.missingModeContracts} / ${report.totals.missingDirectClassifications} / ${report.totals.unresolvedSurfaceRefs}`,
    `- 既有回归分母：${report.totals.legacyRegressionModes}，缺少 ${report.totals.legacyMissingModes}`,
    "",
    "## 静态发现",
    "",
    ...report.findings.flatMap(item => [`### ${item.findingId} ${item.title}`, "", `${item.behavior} 影响：${item.impact}`, ""]),
    "## 注册画布模式",
    "",
    "| 模式 | 面板 | 手势 | 完成 / 历史 | Esc |",
    "|---|---|---|---|---|",
    ...report.modeContracts.map(item => `| \`${item.modeId}\` | \`${item.panelId}\` | ${item.gesture} | ${item.complete}；${item.history} | ${item.escape} |`),
    "",
    "## 非注册直接操控",
    "",
    "| 编号 | 交互 | 宿主 | 完成 | pointercancel / 捕获丢失 | 历史 |",
    "|---|---|---:|---|---|---|",
    ...report.directManipulations.map(item => `| ${item.directId} | ${item.label} | ${item.hostCount} | ${item.complete} | ${item.pointerCancel}；${item.captureLost} | ${item.history} |`),
    "",
    "浏览器证据统一保留为 `pending-Q107`；本报告只形成 `E-C`，不修改正式事件路由。",
    ""
  ];
  return lines.join("\n");
}

function parseArgs(argv) {
  return {check: argv.includes("--check")};
}

function checkGenerated(report, outputRoot = OUTPUT_ROOT) {
  const expected = {
    "canvas-and-direct-manipulation.json": stableJson(report),
    "canvas-and-direct-manipulation.md": renderMarkdown(report)
  };
  for (const [name, content] of Object.entries(expected)) {
    const path = join(outputRoot, name);
    let actual = "";
    try { actual = readFileSync(path, "utf8"); } catch { throw new Error(`缺少生成报告：${relativePath(path)}`); }
    if (actual !== content) throw new Error(`生成报告已陈旧：${relativePath(path)}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const options = parseArgs(process.argv.slice(2));
  const report = buildDirectManipulationAudit();
  if (options.check) checkGenerated(report);
  else writeDirectManipulationAudit();
  console.log(JSON.stringify({totals: report.totals, legacyComparison: report.legacyComparison}, null, 2));
}
