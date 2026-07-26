import {createHash} from "node:crypto";
import {readFileSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {listCellActions} from "../app/webgl-generator/src/runtime/cell-action-inspector-registry.js";
import {buildDirectManipulationAudit} from "./webgl-generator-interaction-direct-manipulation-audit.mjs";
import {buildFullCapabilityMatrix} from "./webgl-generator-api-full-capability-matrix.mjs";

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TOOL_DIR, "..");
const OUTPUT_JSON = join(REPO_ROOT, "docs", "audits", "cell-action-replanning-matrix.json");
const OUTPUT_MD = join(REPO_ROOT, "docs", "audits", "cell-action-replanning-matrix.md");
const TASK_195_PHASES = Object.freeze({
  "cell.read": Object.freeze(["A"]),
  "cell.visual-diagnostics": Object.freeze(["B"]),
  "cell.action-inspection": Object.freeze(["C"]),
  "cell.controlled-write": Object.freeze(["C", "D"])
});
const REQUIRED_ROW_FIELDS = Object.freeze([
  "rowId",
  "sourceKind",
  "actionId",
  "title",
  "inputSpace",
  "inspectTarget",
  "executeTarget",
  "phase",
  "status",
  "historyAndRollback",
  "compatibility"
]);

const MODE_POLICIES = Object.freeze([
  mode("height:brush", "height.applyCells", "grid cell set + changes + range", "cells.inspectAction:height.applyCells", "edit.height.applyChanges", "沿用旧高度笔刷、语义高度 API 与派生更新契约"),
  mode("state:brush", "states.assignCells", "grid cell set + changes", "cells.inspectAction:states.assignCells", "edit.states.applyChanges", "旧国家归属笔刷与 applyChanges 保持可用"),
  mode("state:add", "states.createAtCell", "grid CellRef", "edit.states.inspectCreateAtCell", "edit.states.createAtCell", "edit.states.add(gridCell) 保持等价兼容"),
  mode("state:delete", "states.delete", "state ref or picked CellRef", "cells.inspectAction:states.delete", "edit.states.delete", "复用第 203 项危险动作预检与旧删除入口"),
  mode("province:brush", "provinces.assignCells", "grid cell set + changes", "cells.inspectAction:provinces.assignCells", "edit.provinces.applyChanges", "旧省份归属笔刷与 applyChanges 保持可用"),
  mode("province:add", "provinces.createAtCell", "grid CellRef", "edit.provinces.inspectCreateAtCell", "edit.provinces.createAtCell", "edit.provinces.add(gridCell) 保持等价兼容"),
  mode("province:delete", "provinces.delete", "province ref or picked CellRef", "cells.inspectAction:provinces.delete", "edit.provinces.delete", "复用第 203 项危险动作预检与旧删除入口"),
  mode("city:add", "cities.createAtCell", "grid CellRef", "edit.cities.inspectCreateAtCell", "edit.cities.createAtCell", "edit.cities.add(gridCell) 保持等价兼容"),
  mode("city:delete", "cities.delete", "city ref or picked CellRef", "cells.inspectAction:cities.delete", "edit.cities.delete", "复用第 203 项危险动作预检与旧删除入口"),
  mode("city:move", "cities.move", "city ref + grid or pack CellRef", "edit.cities.inspectMove", "edit.cities.move", "直接登记既有 inspectMove / move"),
  mode("culture:assign", "cultures.assignCells", "culture ref + grid cell set", "cells.inspectAction:cultures.assignCells", "edit.cultures.assignCells", "旧文化归属笔刷保持可用"),
  mode("religion:assign", "religions.assignCells", "religion ref + grid cell set", "cells.inspectAction:religions.assignCells", "edit.religions.assignCells", "旧宗教归属笔刷保持可用"),
  mode("culture:center", "cultures.setCenter", "culture ref + pack CellRef", "edit.cultures.inspectExpansion", "edit.cultures.applyExpansion", "中心输入并入既有扩张预检与提交"),
  mode("religion:center", "religions.setCenter", "religion ref + pack CellRef", "edit.religions.inspectExpansion", "edit.religions.applyExpansion", "中心输入并入既有扩张预检与提交"),
  mode("biome:assign", "biomes.assignCells", "biome ref + grid cell set", "cells.inspectAction:biomes.assignCells", "edit.biomes.assignCells", "旧生物群系归属笔刷保持可用"),
  mode("biome:suitability", "biomes.applySuitability", "grid cell set + changes", "edit.biomes.inspectSuitability", "edit.biomes.applySuitability", "直接登记既有适居度 inspector"),
  mode("economy:market-assign", "economy.assignMarketCells", "market ref + pack cell set", "edit.economy.inspectAssignment", "edit.economy.assignCells", "直接登记既有市场归属 inspector"),
  mode("measurement:draw", "measurements.savePath", "world point path", "cells.inspectAction:measurements.savePath", "edit.measurements.save", "既有测量草稿、保存和导入格式保持兼容"),
  mode("marker:add", "markers.createAtCell", "pack CellRef + marker options", "cells.inspectAction:markers.createAtCell", "edit.markers.add", "旧标记创建入口保持可用"),
  mode("marker:move", "markers.move", "marker ref + pack CellRef", "cells.inspectAction:markers.move", "edit.markers.move", "旧标记移动入口保持可用"),
  mode("route:draw", "routes.createPath", "pack-cell path or endpoint pair", "cells.inspectAction:routes.createPath", "edit.routes.create", "旧路线创建入口保持可用"),
  mode("route:edit-waypoint", "routes.editWaypoint", "route ref + pack CellRef", "edit.routes.inspectEdit", "edit.routes.update", "直接登记既有路线编辑 inspector"),
  mode("river:add", "rivers.createAtCell", "source pack CellRef", "cells.inspectAction:rivers.createAtCell", "edit.rivers.create", "旧河流创建入口保持可用"),
  mode("lake:excavate", "lakes.excavateAtCell", "pack CellRef + radius", "cells.inspectAction:lakes.excavateAtCell", "edit.lakes.create", "旧湖泊开挖入口保持可用"),
  mode("feature:patch-select", "features.applyPatch", "pack CellRef + radius + patch mode", "edit.features.inspectPatch", "edit.features.applyPatch", "直接登记既有 Feature 补丁 inspector"),
  mode("feature:topology-select", "features.applyTopology", "grid cell set + topology operation", "edit.features.inspectTopology", "edit.features.applyTopology", "直接登记既有 Feature 拓扑 inspector"),
  mode("zone:add", "zones.createAtCell", "center pack CellRef + radius", "cells.inspectAction:zones.createAtCell", "edit.zones.create", "旧地区创建入口保持可用"),
  mode("note:add", "notes.createAtCell", "pack CellRef or world point", "cells.inspectAction:notes.createAtCell", "edit.notes.createStandalone", "旧独立备注创建入口与存档字段保持兼容")
]);

const DIRECT_POLICIES = Object.freeze([
  direct("DM-01", "selection.selectAtPoint", "client or world point", "selection.pick", "selection.select", "P0", "existing-api", "选择不写地图历史；失败不改变选择", "复用第 200 项 selection，不新增 Cell 写入口"),
  excluded("DM-02", "camera.panMiddlePointer", "client pointer delta", "camera-control", "相机平移不属于地图数据 API"),
  excluded("DM-03", "camera.panRightPointer", "client pointer delta", "camera-control", "相机平移不属于地图数据 API"),
  excluded("DM-04", "camera.panTouchPointer", "client pointer delta", "camera-control", "相机平移不属于地图数据 API"),
  excluded("DM-05", "camera.zoomAtPoint", "client point + wheel delta", "camera-control", "相机缩放不属于地图数据 API"),
  excluded("DM-06", "browser.suppressCanvasContextMenu", "browser contextmenu event", "browser-shell", "浏览器默认事件抑制不是地图能力"),
  excluded("DM-07", "browser.suppressCanvasAuxClick", "browser auxclick event", "browser-shell", "浏览器默认事件抑制不是地图能力"),
  direct("DM-08", "labels.placeCustom", "world point + label options", "cells.inspectAction:labels.placeCustom", "edit.labels.addCustom + edit.labels.moveCustom", "C", "planned-registry", "创建与落点合并为单历史；异常完整回滚", "旧手工标签创建与拖动交互保持可用"),
  direct("DM-09", "labels.moveCustom", "label ref + world point", "cells.inspectAction:labels.moveCustom", "edit.labels.moveCustom", "C", "planned-registry", "成功一条移动历史；取消不提交", "直接登记既有 moveCustom"),
  direct("DM-10", "measurements.movePoint", "measurement ref + point index + world point", "cells.inspectAction:measurements.movePoint", "edit.measurements.updatePoints", "C", "planned-registry", "草稿不写历史，保存成功一条历史；失败保留原对象", "直接登记既有 updatePoints"),
  direct("DM-11", "measurements.deletePointByPointer", "measurement ref + point index", "cells.inspectAction:measurements.deletePointByPointer", "edit.measurements.updatePoints", "C", "planned-registry", "草稿不写历史，保存成功一条历史；失败保留原对象", "指针删除仍委托 updatePoints"),
  direct("DM-12", "measurements.deletePointByKeyboard", "measurement ref + point index", "cells.inspectAction:measurements.deletePointByKeyboard", "edit.measurements.updatePoints", "C", "planned-registry", "草稿不写历史，保存成功一条历史；失败保留原对象", "键盘删除仍委托 updatePoints"),
  direct("DM-13", "measurements.updatePath", "measurement ref + world point path", "cells.inspectAction:measurements.updatePath", "edit.measurements.updatePoints", "C", "planned-registry", "成功一条更新历史；失败保留原对象和可编辑草稿", "直接登记既有 updatePoints"),
  excluded("DM-14", "ui.dragPanel", "client pointer delta", "ui-shell", "面板位置不属于地图数据 API"),
  excluded("DM-15", "ui.dragActionDock", "client pointer delta", "ui-shell", "动作坞位置不属于地图数据 API"),
  excluded("DM-16", "ui.dragExportOverlay", "client pointer delta", "ui-shell", "导出浮层位置不属于地图数据 API"),
  excluded("DM-17", "ui.dragTreeOverlay", "client pointer delta", "ui-shell", "树状浮层位置不属于地图数据 API"),
  excluded("DM-18", "ui.dragHeightWorkbench", "client pointer delta", "ui-shell", "高度工作台位置不属于地图数据 API"),
  excluded("DM-19", "ui.resizeObjectTableColumn", "client pointer delta + column id", "ui-shell", "表格列宽不属于地图数据 API")
]);

export function buildCellActionReplanningMatrix() {
  const audit = buildDirectManipulationAudit();
  const apiMatrix = buildFullCapabilityMatrix();
  const task195Capabilities = apiMatrix.rows.filter(row => row.owner === "权威任务第 195 项");
  const task195CapabilityIds = task195Capabilities.map(row => row.capabilityId);
  const task195PolicyIds = Object.keys(TASK_195_PHASES);
  const missingTask195Policies = task195CapabilityIds.filter(id => !TASK_195_PHASES[id]);
  const extraTask195Policies = task195PolicyIds.filter(id => !task195CapabilityIds.includes(id));
  const modePolicies = new Map(MODE_POLICIES.map(item => [item.modeId, item]));
  const directPolicies = new Map(DIRECT_POLICIES.map(item => [item.directId, item]));
  const runtimeModeIds = audit.modeContracts.map(item => item.modeId);
  const directIds = audit.directManipulations.map(item => item.directId);
  const missingModePolicies = runtimeModeIds.filter(id => !modePolicies.has(id));
  const extraModePolicies = [...modePolicies.keys()].filter(id => !runtimeModeIds.includes(id));
  const missingDirectPolicies = directIds.filter(id => !directPolicies.has(id));
  const extraDirectPolicies = [...directPolicies.keys()].filter(id => !directIds.includes(id));

  const modeRows = audit.modeContracts.map(contract => buildModeRow(contract, modePolicies.get(contract.modeId)));
  const directRows = audit.directManipulations.map(contract => buildDirectRow(contract, directPolicies.get(contract.directId)));
  const rows = [...modeRows, ...directRows];
  const plannedRegistryActionIds = rows.filter(row => row.status === "planned-registry").map(row => row.actionId).sort();
  const implementedRegistryActionIds = listCellActions().map(item => item.actionId).sort();
  const missingRegistryActions = plannedRegistryActionIds.filter(id => !implementedRegistryActionIds.includes(id));
  const extraRegistryActions = implementedRegistryActionIds.filter(id => !plannedRegistryActionIds.includes(id));
  const actionIds = rows.map(row => row.actionId);
  const duplicateActionIds = [...new Set(actionIds.filter((id, index) => actionIds.indexOf(id) !== index))].sort();
  const unresolvedTargets = rows
    .filter(row => !row.inspectTarget || !row.executeTarget)
    .map(row => row.rowId);
  const unresolvedSourceEntries = rows
    .filter(row => !row.sourceEntries.length || !row.sourceRefs.length)
    .map(row => row.rowId);
  const requiredFieldGaps = rows
    .map(row => ({rowId: row.rowId, fields: REQUIRED_ROW_FIELDS.filter(field => typeof row[field] !== "string" || !row[field].trim())}))
    .filter(item => item.fields.length);

  const coverage = {
    missingTask195Policies,
    extraTask195Policies,
    missingModePolicies,
    extraModePolicies,
    missingDirectPolicies,
    extraDirectPolicies,
    missingRegistryActions,
    extraRegistryActions,
    duplicateActionIds,
    unresolvedTargets,
    unresolvedSourceEntries,
    requiredFieldGaps
  };
  const gapCount = Object.values(coverage).reduce((sum, values) => sum + values.length, 0);
  const sourceDigest = createHash("sha256")
    .update(audit.sourceDigest)
    .update(apiMatrix.sourceDigest)
    .update(JSON.stringify(task195Capabilities))
    .update(JSON.stringify(implementedRegistryActionIds))
    .update(JSON.stringify({modePolicies: MODE_POLICIES, directPolicies: DIRECT_POLICIES}))
    .digest("hex");
  const upstreamTask195Capabilities = task195Capabilities.map(row => ({
    capabilityId: row.capabilityId,
    title: row.title,
    inputSpace: row.inputSpace,
    owner: row.owner,
    status: row.status,
    apiMethods: [...row.apiMethods],
    phases: [...(TASK_195_PHASES[row.capabilityId] || [])],
    evidence: [...row.evidence]
  }));

  return {
    schemaVersion: 2,
    scope: "权威任务第 195 项 P0：Cell / Point / Path / Range 动作重编排矩阵",
    generatedFrom: [
      "tools/webgl-generator-api-full-capability-matrix.mjs",
      "tools/webgl-generator-interaction-direct-manipulation-audit.mjs",
      "app/webgl-generator/src/runtime/cell-action-inspector-registry.js"
    ],
    upstreamApiMatrixDigest: apiMatrix.sourceDigest,
    upstreamTask195Capabilities,
    sourceDigest,
    canonicalInspectorSignature: "cells.inspectAction(actionId, input, options = {})",
    actionIdConvention: "<domain>.<verb> 或 <domain>.<verb>AtCell；CANVAS_TOOL_MODE modeId 只作为映射元数据",
    revisionContract: {
      tokenBinding: ["mapIdentity", "mapRevision", "actionId", "normalizedInputFingerprint", "inspectorSchemaVersion"],
      successfulMapMutation: "mapRevision 恰好递增 1，并使旧 token 失效",
      rejectedCancelledRolledBack: "mapRevision 不变",
      undoRedo: "每次成功撤销或重做均递增 1，并使旧 token 失效",
      mapReplacement: "创建新 mapIdentity；无论 revision 数值是否相同，旧 token 均失效",
      asyncCommit: "提交前复核 mapIdentity 与 mapRevision；陈旧任务不得写图"
    },
    totals: {
      runtimeModes: runtimeModeIds.length,
      classifiedModes: modeRows.length,
      directFamilies: directIds.length,
      classifiedDirectFamilies: directRows.length,
      directInstances: audit.expandedDirectRows.length,
      classifiedDirectInstances: audit.expandedDirectRows.filter(row => directPolicies.has(row.familyId)).length,
      task195Capabilities: task195Capabilities.length,
      classifiedTask195Capabilities: upstreamTask195Capabilities.filter(item => item.phases.length).length,
      rows: rows.length,
      excludedDirectFamilies: directRows.filter(row => row.status === "excluded").length,
      plannedRegistryRows: rows.filter(row => row.status === "planned-registry").length,
      implementedRegistryRows: implementedRegistryActionIds.length,
      existingApiRows: rows.filter(row => row.status === "existing-api").length,
      gaps: gapCount
    },
    coverage,
    rows
  };
}

export function writeCellActionReplanningMatrix() {
  const report = buildCellActionReplanningMatrix();
  writeFileSync(OUTPUT_JSON, stableJson(report));
  writeFileSync(OUTPUT_MD, renderMarkdown(report));
  return report;
}

function mode(modeId, actionId, inputSpace, inspectTarget, executeTarget, compatibility) {
  return {modeId, actionId, inputSpace, inspectTarget, executeTarget, phase: "C", status: "planned-registry", compatibility};
}

function direct(directId, actionId, inputSpace, inspectTarget, executeTarget, phase, status, historyAndRollback, compatibility) {
  return {directId, actionId, inputSpace, inspectTarget, executeTarget, phase, status, historyAndRollback, compatibility};
}

function excluded(directId, actionId, inputSpace, category, reason) {
  return direct(directId, actionId, inputSpace, `excluded:${category}`, `excluded:${category}`, "excluded", "excluded", "不写地图历史；无地图事务", `${reason}；沿用第 200 项排除理由`);
}

function buildModeRow(contract, policy) {
  if (!policy) return incompleteRow("mode", contract.modeId, contract);
  return {
    rowId: `mode:${contract.modeId}`,
    sourceKind: "canvas-mode",
    actionId: policy.actionId,
    modeId: contract.modeId,
    directId: "",
    title: contract.target,
    inputSpace: policy.inputSpace,
    sourceEntries: [`panel:${contract.panelId}`, "canvas:map-canvas"],
    sourceRefs: uniqueFiles(contract.sourceRefs),
    inspectTarget: policy.inspectTarget,
    executeTarget: policy.executeTarget,
    phase: policy.phase,
    status: policy.status,
    historyAndRollback: `${contract.history}；${contract.cancel}；${contract.recovery}`,
    compatibility: policy.compatibility
  };
}

function buildDirectRow(contract, policy) {
  if (!policy) return incompleteRow("direct", contract.directId, contract);
  return {
    rowId: `direct:${contract.directId}`,
    sourceKind: "direct-manipulation",
    actionId: policy.actionId,
    modeId: "",
    directId: contract.directId,
    title: contract.label,
    inputSpace: policy.inputSpace,
    sourceEntries: [...contract.hostSurfaceIds],
    sourceRefs: uniqueFiles(contract.sourceRefs),
    inspectTarget: policy.inspectTarget,
    executeTarget: policy.executeTarget,
    phase: policy.phase,
    status: policy.status,
    historyAndRollback: `${policy.historyAndRollback}；源码现状：${contract.history}；${contract.recovery}`,
    compatibility: policy.compatibility
  };
}

function incompleteRow(kind, id, contract) {
  return {
    rowId: `${kind}:${id}`,
    sourceKind: kind === "mode" ? "canvas-mode" : "direct-manipulation",
    actionId: "",
    modeId: kind === "mode" ? id : "",
    directId: kind === "direct" ? id : "",
    title: contract.target || contract.label || id,
    inputSpace: "",
    sourceEntries: [],
    sourceRefs: uniqueFiles(contract.sourceRefs || []),
    inspectTarget: "",
    executeTarget: "",
    phase: "",
    status: "unclassified",
    historyAndRollback: "",
    compatibility: ""
  };
}

function uniqueFiles(refs) {
  return [...new Set(refs.map(ref => ref.file).filter(Boolean))].sort();
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function renderMarkdown(report) {
  return [
    "# 第 195 项 Cell 动作重编排矩阵",
    "",
    `- 注册画布模式：${report.totals.classifiedModes} / ${report.totals.runtimeModes}`,
    `- 非注册直接操控：${report.totals.classifiedDirectFamilies} / ${report.totals.directFamilies}`,
    `- 非注册直接操控宿主实例：${report.totals.classifiedDirectInstances} / ${report.totals.directInstances}`,
    `- 第 195 项四类 Cell 能力：${report.totals.classifiedTask195Capabilities} / ${report.totals.task195Capabilities}`,
    `- planned-registry / 实际 registry：${report.totals.plannedRegistryRows} / ${report.totals.implementedRegistryRows}`,
    `- 总行数：${report.totals.rows}`,
    `- 排除直接操控：${report.totals.excludedDirectFamilies}`,
    `- 双向差集、重复 actionId、空目标和空来源合计：${report.totals.gaps}`,
    `- 唯一 inspector 签名：\`${report.canonicalInspectorSignature}\``,
    "",
    "## 第 200 项上游归属与第 195 项收口",
    "",
    "| capabilityId | 输入空间 | 第 195 项阶段 |",
    "|---|---|---|",
    ...report.upstreamTask195Capabilities.map(item => `| \`${item.capabilityId}\` | ${item.inputSpace} | ${item.phases.join(" → ")}（${item.status}） |`),
    "",
    "## 动作映射",
    "",
    "| 来源 | actionId | 输入空间 | inspect | execute | 阶段 / 状态 | 旧兼容 |",
    "|---|---|---|---|---|---|---|",
    ...report.rows.map(row => `| \`${row.modeId || row.directId}\` | \`${row.actionId}\` | ${row.inputSpace} | \`${row.inspectTarget}\` | \`${row.executeTarget}\` | ${row.phase} / ${row.status} | ${row.compatibility} |`),
    "",
    "## Revision / Token 冻结契约",
    "",
    `- Token 绑定：${report.revisionContract.tokenBinding.map(item => `\`${item}\``).join("、")}。`,
    `- 成功地图写入：${report.revisionContract.successfulMapMutation}。`,
    `- 拒绝、取消、完整回滚：${report.revisionContract.rejectedCancelledRolledBack}。`,
    `- 撤销 / 重做：${report.revisionContract.undoRedo}。`,
    `- 换图：${report.revisionContract.mapReplacement}。`,
    `- 异步提交：${report.revisionContract.asyncCommit}。`,
    ""
  ].join("\n");
}

function checkGenerated(report) {
  const expected = new Map([
    [OUTPUT_JSON, stableJson(report)],
    [OUTPUT_MD, renderMarkdown(report)]
  ]);
  for (const [path, content] of expected) {
    let actual = "";
    try {
      actual = readFileSync(path, "utf8");
    } catch {
      throw new Error(`缺少生成报告：${path}`);
    }
    if (actual !== content) throw new Error(`生成报告已陈旧：${path}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const report = process.argv.includes("--check") ? buildCellActionReplanningMatrix() : writeCellActionReplanningMatrix();
  if (process.argv.includes("--check")) checkGenerated(report);
  console.log(JSON.stringify({totals: report.totals, coverage: report.coverage}, null, 2));
}
