#!/usr/bin/env node
import {createHash} from "node:crypto";
import {existsSync, readFileSync, readdirSync, writeFileSync} from "node:fs";
import {dirname, join, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {API_METHODS} from "../app/webgl-generator/src/runtime/api-contract.js";
import {buildInteractionInventory} from "./webgl-generator-interaction-surface-inventory.mjs";

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TOOL_DIR, "..");
const RUNTIME_ROOT = join(REPO_ROOT, "app", "webgl-generator", "src", "runtime");
const APP_PATH = join(RUNTIME_ROOT, "app.js");
const CONSOLE_API_PATH = join(RUNTIME_ROOT, "console-api.js");
const OUTPUT_JSON = join(REPO_ROOT, "docs", "audits", "console-api-full-capability-matrix.json");
const OUTPUT_MD = join(REPO_ROOT, "docs", "audits", "console-api-full-capability-matrix.md");
const ALLOWED_STATUSES = new Set(["covered", "excluded", "deferred-owned", "gap"]);

const DOMAIN_API_PREFIXES = Object.freeze({
  biome: ["edit.biomes."],
  city: ["edit.cities.", "selection."],
  climate: ["climate."],
  culture: ["edit.cultures.", "namebases.", "selection."],
  data: ["data."],
  debug: ["debug.", "info.healthEvents", "info.runtimeStats"],
  diplomacy: ["edit.diplomacy.", "generate.regenerate", "selection."],
  economy: ["edit.economy.", "selection."],
  emblem: ["objects."],
  feature: ["edit.features.", "selection."],
  generation: ["generate.", "info.runtimeStats"],
  government: ["edit.states.", "objects.", "selection."],
  height: ["edit.height.", "generate.regenerate"],
  history: ["history."],
  label: ["edit.labels.", "selection."],
  lake: ["edit.lakes.", "edit.features.", "selection."],
  layers: ["layers.", "units."],
  marker: ["edit.markers.", "selection."],
  measurement: ["edit.measurements.", "units.", "selection."],
  military: ["edit.military.", "generate.regenerate", "selection."],
  namebase: ["namebases."],
  note: ["edit.notes.", "selection."],
  objects: ["objects.", "selection."],
  oceanCurrent: ["oceanCurrents.", "selection."],
  population: ["edit.population.", "selection."],
  province: ["edit.provinces.", "generate.regenerate", "selection."],
  religion: ["edit.religions.", "namebases.", "selection."],
  regenerationLocks: ["regenerationLocks."],
  river: ["edit.rivers.", "generate.regenerate", "selection."],
  route: ["edit.routes.", "generate.regenerate", "selection."],
  selection: ["selection.", "objects."],
  state: ["edit.states.", "generate.regenerate", "selection."],
  units: ["units."],
  visualTheme: ["layers."],
  zone: ["edit.zones.", "selection."]
});

const COMMAND_DOMAIN_BY_FILE = Object.freeze({
  "biome-edit-commands.js": "biome",
  "city-edit-commands.js": "city",
  "culture-edit-commands.js": "culture",
  "diplomacy-edit-commands.js": "diplomacy",
  "economy-edit-commands.js": "economy",
  "feature-topology-edit-commands.js": "feature",
  "height-edit-commands.js": "height",
  "label-edit-commands.js": "label",
  "label-layout-edit-commands.js": "label",
  "label-style-edit-commands.js": "label",
  "lake-edit-commands.js": "lake",
  "marker-edit-commands.js": "marker",
  "measurement-edit-commands.js": "measurement",
  "military-edit-commands.js": "military",
  "namebase-edit-commands.js": "namebase",
  "note-edit-commands.js": "note",
  "object-edit-commands.js": "objects",
  "ocean-current-edit-commands.js": "oceanCurrent",
  "population-adjustment-commands.js": "population",
  "province-edit-commands.js": "province",
  "regeneration-lock-commands.js": "regenerationLocks",
  "religion-edit-commands.js": "religion",
  "river-edit-commands.js": "river",
  "route-edit-commands.js": "route",
  "social-expansion-edit-commands.js": "culture",
  "social-ownership-edit-commands.js": "culture",
  "state-edit-commands.js": "state",
  "state-topology-commands.js": "state",
  "suitability-edit-commands.js": "biome",
  "visual-theme-edit-commands.js": "visualTheme",
  "zone-edit-commands.js": "zone",
  "height-brush.js": "height",
  "height-selection-smoothing.js": "height",
  "height-terrain-template-programs.js": "height",
  "height-terrain-templates.js": "height",
  "seafloor-reset.js": "height"
});

const TASK_195_CELL_CAPABILITIES = Object.freeze([
  {
    capabilityId: "cell.read",
    title: "Grid / Pack Cell 读取、映射、邻接与分页查询",
    inputSpace: "grid-cell-ref / pack-cell-ref / world-point / client-point",
    apiMethods: ["cells.get", "cells.getAtPoint", "cells.neighbors", "cells.query", "cells.scan"],
    preflight: "CellRef 归一化、地图 identity / revision 与分页 cursor 校验",
    undoOrRollback: "只读，不写历史；取消扫描不改变地图",
    async: true,
    evidence: [
      "app/webgl-generator/src/runtime/cell-query-api.js",
      "docs/task-notes/cell-diagnostics-and-ai-api-design.md"
    ]
  },
  {
    capabilityId: "cell.visual-diagnostics",
    title: "Grid Cells 共享边诊断层、ID 与诊断高亮",
    inputSpace: "grid-cell-ref / viewport",
    apiMethods: ["cells.locate", "layers.get", "layers.setVisible"],
    preflight: "CellRef 解析与 renderer 诊断能力检查",
    undoOrRollback: "只改变相机、图层与诊断高亮，不写地图历史",
    async: true,
    evidence: [
      "app/webgl-generator/src/renderer/grid-cell-diagnostics-layer.js",
      "app/webgl-generator/src/renderer/placeholder-renderer.js",
      "docs/task-notes/cell-diagnostics-and-ai-api-design.md"
    ]
  },
  {
    capabilityId: "cell.action-inspection",
    title: "按 Cell / Point / Path / Range 动作 registry 与只读预检",
    inputSpace: "grid-cell-ref / pack-cell-ref / point / path / range",
    apiMethods: [
      "cells.actions",
      "cells.inspectAction",
      "edit.cities.inspectCreateAtCell",
      "edit.provinces.inspectCreateAtCell",
      "edit.states.inspectCreateAtCell"
    ],
    preflight: "34 条编辑原语 registry、领域 inspector 与 revision-bound inspection token",
    undoOrRollback: "只读预检，不写历史；拒绝码稳定",
    async: false,
    evidence: [
      "app/webgl-generator/src/runtime/cell-action-inspector-registry.js",
      "app/webgl-generator/src/runtime/cell-inspection-token.js",
      "docs/task-notes/cell-diagnostics-and-ai-api-design.md"
    ]
  },
  {
    capabilityId: "cell.controlled-write",
    title: "国家、省份、城市等同族 createAtCell 与受控写入",
    inputSpace: "grid-cell-ref / inspection-token / expected-revision",
    apiMethods: [
      "edit.cities.createAtCell",
      "edit.provinces.createAtCell",
      "edit.states.createAtCell"
    ],
    preflight: "同 action、同输入、同 mapIdentity / mapRevision 的 inspection token 复核",
    undoOrRollback: "成功恰好一条历史与 revision +1；异常恢复集合快照且 revision 不变",
    async: false,
    evidence: [
      "app/webgl-generator/src/runtime/app.js",
      "app/webgl-generator/src/runtime/city-edit-commands.js",
      "app/webgl-generator/src/runtime/province-edit-commands.js",
      "app/webgl-generator/src/runtime/state-edit-commands.js",
      "docs/task-notes/cell-diagnostics-and-ai-api-design.md"
    ]
  }
]);

const EXPLICIT_EXCLUSIONS = Object.freeze([
  ["ui.panel-geometry", "面板拖动、尺寸、贴边收起和焦点返回属于 UI 壳层，不改变地图能力。"],
  ["ui.table-layout", "筛选输入、排序状态与列宽属于表格 UI 壳层，对象数据由 objects 与领域 API 提供。"],
  ["browser.native-file-picker", "原生文件选择器无法用纯参数稳定表达；导入导出 API 直接接收或返回可序列化 payload。"],
  ["browser.permissions", "下载、剪贴板和文件系统权限由浏览器管理，不属于地图 API。"],
  ["debug.fault-injection", "故障注入会绕过正式安全契约，仅允许专项回归直接使用测试夹具。"],
  ["remote.write-bridge", "远程写入 bridge 未获授权；页面内 API 与本地浏览器自动化已经覆盖当前控制面。"],
  ["ui.visual-transition", "加载动画、toast 时序和纯视觉过渡不改变地图数据或显示配置。"]
]);

export function buildFullCapabilityMatrix({allowGaps = false} = {}) {
  const interaction = buildInteractionInventory();
  const apiMethods = flattenApiMethods(API_METHODS);
  const appSource = readFileSync(APP_PATH, "utf8");
  const consoleApiSource = readFileSync(CONSOLE_API_PATH, "utf8");
  const runtimeActions = discoverRuntimeActions(appSource);
  const rows = [
    ...buildSurfaceRows(interaction.rows, apiMethods),
    ...buildCanvasModeRows(appSource, apiMethods),
    ...buildRuntimeActionRows(runtimeActions, apiMethods),
    ...buildApiActionBindingRows(consoleApiSource, runtimeActions, apiMethods),
    ...buildCommandRows(apiMethods),
    ...buildApiRows(apiMethods),
    ...TASK_195_CELL_CAPABILITIES.map(buildTask195CellRow),
    ...EXPLICIT_EXCLUSIONS.map(buildExplicitExclusionRow)
  ].sort((a, b) => a.matrixId.localeCompare(b.matrixId, "en"));
  const totals = summarizeRows(rows, interaction);
  const matrix = {
    schemaVersion: 1,
    sourceDigest: buildSourceDigest(interaction.sourceDigest),
    sourceRoots: [
      "app/webgl-generator/index.html",
      "app/webgl-generator/src/**/*.{js,vue}",
      "app/webgl-generator/src/runtime/**/*-commands.js"
    ],
    denominator: {
      interactionSurfaces: interaction.totals.surfaces,
      includedInteractionSurfaces: interaction.totals.included,
      excludedInteractionSurfaces: interaction.totals.excluded,
      canvasModes: rows.filter(row => row.sourceKind === "canvas-mode").length,
      runtimeActions: rows.filter(row => row.sourceKind === "runtime-action").length,
      apiActionBindings: rows.filter(row => row.sourceKind === "api-action-binding").length,
      commandAndInspectorExports: rows.filter(row => row.sourceKind === "command-or-inspector").length,
      publicApiMethods: apiMethods.length
    },
    statusPolicy: {
      covered: "公共 API 已存在且与底层 action / command 或只读 helper 共路径",
      excluded: "纯 UI 壳层或安全边界，必须有非空理由",
      deferredOwned: "适合参数化，但已明确归属另一权威任务",
      gap: "适合参数化且没有公共 API，必须在第 200 项关闭"
    },
    totals,
    rows
  };
  validateCapabilityMatrix(matrix, {allowGaps});
  return matrix;
}

export function validateCapabilityMatrix(matrix, {allowGaps = false} = {}) {
  const rows = Array.isArray(matrix?.rows) ? matrix.rows : [];
  if (!rows.length) throw new Error("API 全量能力矩阵为空");
  const ids = new Set();
  for (const row of rows) {
    if (!row.matrixId || ids.has(row.matrixId)) throw new Error(`能力矩阵 ID 缺失或重复：${row.matrixId || "(empty)"}`);
    ids.add(row.matrixId);
    if (!ALLOWED_STATUSES.has(row.status)) throw new Error(`能力矩阵状态未知：${row.matrixId}=${row.status}`);
    if (!row.capabilityId || !row.title || !row.sourceKind) throw new Error(`能力矩阵基础字段缺失：${row.matrixId}`);
    if (row.status === "covered" && (!Array.isArray(row.apiMethods) || row.apiMethods.length === 0)) throw new Error(`covered 行缺少 API：${row.matrixId}`);
    if (row.status === "excluded" && !row.exclusionReason) throw new Error(`excluded 行缺少理由：${row.matrixId}`);
    if (row.status === "deferred-owned" && !row.owner) throw new Error(`deferred-owned 行缺少归属：${row.matrixId}`);
  }
  const totals = summarizeRows(rows, {
    totals: {
      surfaces: matrix?.denominator?.interactionSurfaces || 0,
      included: matrix?.denominator?.includedInteractionSurfaces || 0,
      excluded: matrix?.denominator?.excludedInteractionSurfaces || 0,
      unclassified: 0,
      missingExclusionReason: 0,
      bySourceType: {}
    }
  });
  if (totals.unknown !== 0 || totals.unclassified !== 0 || (!allowGaps && totals.unownedParameterizableGap !== 0)) {
    throw new Error(`API 能力矩阵仍有未知或未归属项目：${JSON.stringify(totals)}`);
  }
  if (!allowGaps && totals.gap !== 0) {
    const gaps = rows.filter(row => row.status === "gap").map(row => row.matrixId);
    throw new Error(`API 能力矩阵仍有真实 gap：${gaps.join(", ")}`);
  }
  return totals;
}

function buildSurfaceRows(surfaces, apiMethods) {
  return surfaces.map(surface => {
    const classification = classifySurface(surface, apiMethods);
    return createRow({
      matrixId: `surface:${surface.surfaceId}`,
      capabilityId: classification.capabilityId,
      title: surface.userEntry || surface.surfaceId,
      sourceKind: "interaction-surface",
      sourceFiles: surface.sourceFiles,
      uiEntry: surface.surfaceId,
      apiMethods: classification.apiMethods,
      inputSpace: classification.inputSpace,
      mutates: classification.mutates,
      preflight: classification.preflight,
      businessCodes: classification.businessCodes,
      confirm: classification.confirm,
      undoOrRollback: classification.undoOrRollback,
      async: classification.async,
      compatibility: classification.compatibility,
      evidence: ["tools/webgl-generator-interaction-surface-inventory.mjs"],
      status: classification.status,
      owner: classification.owner,
      exclusionReason: classification.exclusionReason
    });
  });
}

function classifySurface(surface, apiMethods) {
  if (!surface.included) return excludedSurface(surface.exclusionReason || "交互清单已确认该表面没有独立地图能力。");
  const id = surface.surfaceId;
  if (id.startsWith("shared:") || id.startsWith("panel-helper:")) {
    return excludedSurface("共享组件只承载输入、布局或面板生命周期；对应地图能力由宿主领域 API 登记。");
  }
  if (id.startsWith("fixed-overlay:action-dock:") || id.startsWith("fixed-overlay:tree:")) {
    return excludedSurface("动作坞或树状浮层属于宿主面板的 UI 壳层；提交动作由对应领域 API 登记。");
  }
  if (id.startsWith("global:")) {
    if (id.includes("health-monitor")) return coveredSurface("debug", apiMethods, "runtime-event");
    if (id === "global:worker-generation") return coveredSurface("generation", apiMethods, "generation-options");
    return excludedSurface("全局事件负责快捷键、拖动、焦点或组件桥接，不形成独立地图参数能力。");
  }
  if (id === "fixed-overlay:heightmap-workbench") return coveredSurface("data", apiMethods, "serialized-image-payload");
  if (id === "fixed-overlay:project-export") return coveredSurface("data", apiMethods, "export-options");
  if (id === "canvas:generation-feedback") return coveredSurface("generation", apiMethods, "runtime-status");
  if (id === "canvas:hover-overlay") return coveredSurface("selection", apiMethods, "client-point / object-ref");
  if (id === "canvas:map-canvas" || id === "canvas:map-overlay") return coveredSurface("selection", apiMethods, "client-point / object-ref / parameterized-edit");
  if (id === "canvas:measurement-overlay" || id === "resident:measurement-readout") return coveredSurface("measurement", apiMethods, "world-point-list / measurement-ref");
  if (id === "canvas:map-legend" || id === "canvas:map-scale-bar" || id === "resident:map-toolbar") return coveredSurface("layers", apiMethods, "display-options");
  if (id === "resident:vue-state-bridge") return excludedSurface("Vue 状态桥只同步 UI 快照，不是独立地图能力。");
  if (id.startsWith("panel:")) {
    const panelId = id.slice("panel:".length);
    const domain = domainForPanel(panelId);
    if (!domain) return gapSurface(`未登记面板领域：${panelId}`);
    return coveredSurface(domain, apiMethods, "object-ref / options");
  }
  return gapSurface(`未分类交互表面：${id}`);
}

function domainForPanel(panelId) {
  if (panelId === "development-panel") return "debug";
  if (panelId === "emblem-panel") return "emblem";
  if (panelId === "generation-panel") return "generation";
  if (panelId === "government-panel") return "government";
  if (panelId === "object-details") return "objects";
  return {
    "biome-panel": "biome",
    "city-panel": "city",
    "climate-panel": "climate",
    "culture-panel": "culture",
    "diplomacy-panel": "diplomacy",
    "economy-panel": "economy",
    "feature-panel": "feature",
    "height-panel": "height",
    "label-naming-panel": "label",
    "lake-panel": "lake",
    "marker-panel": "marker",
    "measurement-panel": "measurement",
    "military-panel": "military",
    "namebase-panel": "namebase",
    "notes-panel": "note",
    "ocean-current-panel": "oceanCurrent",
    "population-panel": "population",
    "province-panel": "province",
    "religion-panel": "religion",
    "river-panel": "river",
    "route-panel": "route",
    "state-panel": "state",
    "zone-panel": "zone"
  }[panelId] || null;
}

function buildCanvasModeRows(appSource, apiMethods) {
  const block = sourceBlock(appSource, "export const CANVAS_TOOL_MODE = Object.freeze({", "});");
  const matches = [...block.matchAll(/^\s+[A-Z0-9_]+:\s*"([^"]+)",?$/gm)];
  return matches.map(match => {
    const mode = match[1];
    const domain = domainForMode(mode);
    const methods = methodsForDomain(domain, apiMethods);
    return createRow({
      matrixId: `mode:${mode}`,
      capabilityId: `canvas-mode.${mode}`,
      title: `画布模式 ${mode}`,
      sourceKind: "canvas-mode",
      sourceFiles: ["app/webgl-generator/src/runtime/app.js"],
      uiEntry: "canvas:map-canvas",
      action: "",
      commandOrInspector: "",
      apiMethods: methods,
      inputSpace: "object-ref / grid-cell-id / pack-cell-id / world-point / point-list / changes",
      mutates: "map-or-runtime-state",
      preflight: "领域 inspector 或参数校验",
      businessCodes: [],
      confirm: "按领域方法元数据",
      undoOrRollback: "EditHistory 或运行时状态取消",
      async: false,
      compatibility: "画布手势继续可用，API 不模拟指针轨迹",
      evidence: ["app/webgl-generator/src/runtime/canvas-tool-mode-manager.js"],
      status: methods.length ? "covered" : "gap",
      exclusionReason: methods.length ? "" : `画布模式 ${mode} 没有等价参数 API`
    });
  });
}

function domainForMode(mode) {
  const prefix = mode.split(":")[0];
  return {
    biome: "biome",
    city: "city",
    culture: "culture",
    economy: "economy",
    feature: "feature",
    height: "height",
    lake: "lake",
    marker: "marker",
    measurement: "measurement",
    note: "note",
    province: "province",
    religion: "religion",
    "regeneration-lock": "regenerationLocks",
    river: "river",
    route: "route",
    state: "state",
    zone: "zone"
  }[prefix] || null;
}

function buildRuntimeActionRows(runtimeActions, apiMethods) {
  return runtimeActions.map(action => {
    const publicMethods = apiMethods.includes(action) ? [action] : [];
    return createRow({
      matrixId: `action:${action}`,
      capabilityId: action,
      title: `Runtime action ${action}`,
      sourceKind: "runtime-action",
      sourceFiles: ["app/webgl-generator/src/runtime/app.js"],
      action,
      apiMethods: publicMethods,
      inputSpace: "method-schema",
      mutates: actionMutation(action),
      preflight: /inspect|get|list|export/.test(action.split(".").at(-1)) ? "readonly" : "按方法描述",
      businessCodes: [],
      confirm: "按 API 确认清单",
      undoOrRollback: actionMutation(action) === "none" ? "not-applicable" : "按方法元数据",
      async: /rebuildWorld|applyDownstreamRebuild|importMap|importHeightmap|exportPNG|exportCompressedAll|saveBrowserMap|restoreBrowserMap|newMap|rerollSeed/.test(action),
      compatibility: "UI 与 API 共用同一 runtime action",
      evidence: ["app/webgl-generator/src/runtime/console-api.js"],
      status: publicMethods.length ? "covered" : "gap",
      exclusionReason: publicMethods.length ? "" : `runtime action ${action} 尚未进入公共 API`
    });
  });
}

function buildApiActionBindingRows(consoleApiSource, runtimeActions, apiMethods) {
  const bindings = [...consoleApiSource.matchAll(/requireApiAction\([^\r\n]*?"([^"]+)"\)/g)].map(match => match[1]);
  return [...new Set(bindings)].sort().map(action => {
    const actionExists = runtimeActions.includes(action);
    const apiExists = apiMethods.includes(action);
    return createRow({
      matrixId: `api-action-binding:${action}`,
      capabilityId: action,
      title: `API action 绑定 ${action}`,
      sourceKind: "api-action-binding",
      sourceFiles: [
        "app/webgl-generator/src/runtime/console-api.js",
        "app/webgl-generator/src/runtime/app.js"
      ],
      action,
      apiMethods: apiExists ? [action] : [],
      inputSpace: "method-schema",
      mutates: actionMutation(action),
      preflight: "公共 API 绑定必须能解析到真实 runtime action",
      businessCodes: [],
      confirm: "按 API 确认清单",
      undoOrRollback: actionMutation(action) === "none" ? "not-applicable" : "按方法元数据",
      async: false,
      compatibility: "旧 API action 路径保持可调用",
      evidence: ["tools/webgl-generator-api-action-convergence-regression.mjs"],
      status: actionExists && apiExists ? "covered" : "gap",
      exclusionReason: actionExists && apiExists
        ? ""
        : `API action 绑定不完整：runtime=${actionExists} api=${apiExists}`
    });
  });
}

function discoverRuntimeActions(appSource) {
  const block = sourceBlock(appSource, "function createRuntimeActions", "\nfunction measureHealthOperation");
  const paths = [];
  let namespace = "";
  let subgroup = "";
  for (const line of block.split(/\r?\n/)) {
    let match = line.match(/^ {4}([A-Za-z][A-Za-z0-9]*): \{$/);
    if (match) {
      namespace = match[1];
      subgroup = "";
      continue;
    }
    match = line.match(/^ {6}([A-Za-z][A-Za-z0-9]*): \{$/);
    if (match && namespace === "edit") {
      subgroup = match[1];
      continue;
    }
    match = line.match(/^ {6}([A-Za-z][A-Za-z0-9]*):/);
    if (match && namespace && namespace !== "edit") {
      paths.push(`${namespace}.${match[1]}`);
      continue;
    }
    match = line.match(/^ {8}([A-Za-z][A-Za-z0-9]*):/);
    if (match && namespace === "edit" && subgroup) paths.push(`edit.${subgroup}.${match[1]}`);
  }
  return [...new Set(paths)].sort();
}

function buildCommandRows(apiMethods) {
  const rows = [];
  for (const [filename, domain] of Object.entries(COMMAND_DOMAIN_BY_FILE)) {
    const path = join(RUNTIME_ROOT, filename);
    if (!existsSync(path)) throw new Error(`命令 / inspector 审计文件不存在：${filename}`);
    const source = readFileSync(path, "utf8");
    const names = [...source.matchAll(/^export function ((?:create|inspect|build|get|apply|normalize|restore|parse|stringify|load|save|clear)[A-Za-z0-9_]*)/gm)].map(match => match[1]);
    for (const name of names) {
      const methods = methodsForDomain(domain, apiMethods);
      rows.push(createRow({
        matrixId: `command:${filename}:${name}`,
        capabilityId: `${domain}.${name}`,
        title: `${filename} / ${name}`,
        sourceKind: "command-or-inspector",
        sourceFiles: [`app/webgl-generator/src/runtime/${filename}`],
        commandOrInspector: name,
        apiMethods: methods,
        inputSpace: "domain-options / object-ref / cell-ids / changes",
        mutates: /^inspect|^build|^get|^normalize|^parse|^stringify|^load/.test(name) ? "none" : "domain-data-or-preview",
        preflight: /^inspect/.test(name) ? name : "由领域 API 参数校验或 inspector 提供",
        businessCodes: [],
        confirm: "按领域 API 确认清单",
        undoOrRollback: /^create/.test(name) ? "EditHistory / transaction" : "not-applicable-or-domain-contract",
        async: false,
        compatibility: "领域 API 复用该 command / inspector 或同一纯 helper",
        evidence: [`app/webgl-generator/src/runtime/${filename}`],
        status: methods.length ? "covered" : "gap",
        exclusionReason: methods.length ? "" : `${filename} 没有登记领域 API`
      }));
    }
  }
  return rows;
}

function buildApiRows(apiMethods) {
  return apiMethods.map(method => createRow({
    matrixId: `api:${method}`,
    capabilityId: method,
    title: `公共 API ${method}`,
    sourceKind: "public-api",
    sourceFiles: [
      "app/webgl-generator/src/runtime/api-contract.js",
      "app/webgl-generator/src/runtime/console-api.js"
    ],
    action: method,
    apiMethods: [method],
    inputSpace: "info.describe(method)",
    mutates: actionMutation(method),
    preflight: "由 info.describe(method) 与领域 inspector 发现",
    businessCodes: [],
    confirm: "由 methodMetadata.requiresConfirm 发现",
    undoOrRollback: "由 methodMetadata.undoable 与结果 metadata 发现",
    async: false,
    compatibility: "受 API 主版本和方法稳定性契约保护",
    evidence: [
      "tools/webgl-generator-api-capabilities-regression.mjs",
      "tools/webgl-generator-api-stability-contract-regression.mjs"
    ],
    status: "covered"
  }));
}

function buildTask195CellRow(item) {
  return createRow({
    matrixId: `task-195:${item.capabilityId}`,
    capabilityId: item.capabilityId,
    title: item.title,
    sourceKind: "task-195-cell-capability",
    sourceFiles: item.evidence,
    apiMethods: item.apiMethods,
    inputSpace: item.inputSpace,
    mutates: item.capabilityId.endsWith("write") ? "map-data" : "none-or-runtime-display",
    preflight: item.preflight,
    businessCodes: item.capabilityId === "cell.action-inspection" || item.capabilityId === "cell.controlled-write"
      ? ["ok", "action-not-inspectable", "cell-not-found", "inspection-stale", "inspection-token-invalid", "inspection-token-mismatch"]
      : [],
    confirm: false,
    undoOrRollback: item.undoOrRollback,
    async: item.async,
    compatibility: "保留旧数字 gridCell 入参与旧图兼容",
    evidence: item.evidence,
    status: "covered",
    owner: "权威任务第 195 项"
  });
}

function buildExplicitExclusionRow([capabilityId, reason]) {
  return createRow({
    matrixId: `excluded:${capabilityId}`,
    capabilityId,
    title: capabilityId,
    sourceKind: "explicit-boundary",
    sourceFiles: ["docs/current-plan.md"],
    inputSpace: "not-applicable",
    mutates: "none-or-browser-shell",
    preflight: "not-applicable",
    businessCodes: [],
    confirm: "not-applicable",
    undoOrRollback: "not-applicable",
    async: false,
    compatibility: "不改变地图 schema 与现有 API",
    evidence: ["docs/task-notes/console-api-full-audit-and-gap-closure-2026-07-25.md"],
    status: "excluded",
    exclusionReason: reason
  });
}

function coveredSurface(domain, apiMethods, inputSpace) {
  const methods = methodsForDomain(domain, apiMethods);
  if (!methods.length) return gapSurface(`领域 ${domain} 没有公共 API`);
  return {
    capabilityId: `surface-domain.${domain}`,
    apiMethods: methods,
    inputSpace,
    mutates: "按方法元数据",
    preflight: "按领域 inspector / method schema",
    businessCodes: [],
    confirm: "按方法元数据",
    undoOrRollback: "按方法元数据",
    async: false,
    compatibility: "UI 与 API 使用同一领域入口",
    status: "covered",
    owner: "",
    exclusionReason: ""
  };
}

function excludedSurface(reason) {
  return {
    capabilityId: "ui-shell",
    apiMethods: [],
    inputSpace: "not-applicable",
    mutates: "ui-shell",
    preflight: "not-applicable",
    businessCodes: [],
    confirm: "not-applicable",
    undoOrRollback: "not-applicable",
    async: false,
    compatibility: "不改变地图 schema",
    status: "excluded",
    owner: "",
    exclusionReason: reason
  };
}

function gapSurface(reason) {
  return {
    capabilityId: "unclassified-parameterizable-capability",
    apiMethods: [],
    inputSpace: "unknown",
    mutates: "unknown",
    preflight: "unknown",
    businessCodes: [],
    confirm: "unknown",
    undoOrRollback: "unknown",
    async: false,
    compatibility: "unknown",
    status: "gap",
    owner: "",
    exclusionReason: reason
  };
}

function methodsForDomain(domain, apiMethods) {
  const prefixes = DOMAIN_API_PREFIXES[domain] || [];
  return apiMethods.filter(method => prefixes.some(prefix => prefix.endsWith(".") ? method.startsWith(prefix) : method === prefix));
}

function createRow(row) {
  return {
    matrixId: row.matrixId,
    capabilityId: row.capabilityId,
    title: row.title,
    sourceKind: row.sourceKind,
    sourceFiles: [...new Set(row.sourceFiles || [])],
    uiEntry: row.uiEntry || "",
    action: row.action || "",
    commandOrInspector: row.commandOrInspector || "",
    apiMethods: [...new Set(row.apiMethods || [])].sort(),
    inputSpace: row.inputSpace || "none",
    mutates: row.mutates || "none",
    preflight: row.preflight || "none",
    businessCodes: [...new Set(row.businessCodes || [])],
    confirm: row.confirm ?? false,
    undoOrRollback: row.undoOrRollback || "not-applicable",
    async: Boolean(row.async),
    compatibility: row.compatibility || "",
    evidence: [...new Set(row.evidence || [])],
    status: row.status,
    owner: row.owner || "",
    exclusionReason: row.exclusionReason || ""
  };
}

function summarizeRows(rows, interaction) {
  const statusCounts = Object.fromEntries([...ALLOWED_STATUSES].map(status => [status, rows.filter(row => row.status === status).length]));
  return {
    rows: rows.length,
    ...statusCounts,
    unknown: rows.filter(row => !ALLOWED_STATUSES.has(row.status)).length,
    unclassified: Number(interaction?.totals?.unclassified || 0),
    missingExclusionReason: rows.filter(row => row.status === "excluded" && !row.exclusionReason).length,
    unownedParameterizableGap: rows.filter(row => row.status === "gap" && !row.owner).length
  };
}

function flattenApiMethods(methods) {
  return Object.entries(methods).flatMap(([namespace, names]) => names.map(name => `${namespace}.${name}`)).sort();
}

function actionMutation(action) {
  if (/(^|\.)(get|list|inspect|describe|version|capabilities|mapSummary|runtimeStats|healthEvents|stats|peek|resolve|export)/.test(action)) return "none";
  if (action.startsWith("selection.") || action.startsWith("layers.") || action.startsWith("units.")) return "runtime-or-display-state";
  return "map-or-persistent-data";
}

function sourceBlock(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`源码块起点不存在：${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`源码块终点不存在：${endMarker}`);
  return source.slice(start, end + endMarker.length);
}

function buildSourceDigest(interactionDigest) {
  const hash = createHash("sha256");
  hash.update(interactionDigest);
  for (const file of [APP_PATH, join(RUNTIME_ROOT, "api-contract.js"), CONSOLE_API_PATH]) hash.update(readFileSync(file));
  for (const filename of Object.keys(COMMAND_DOMAIN_BY_FILE).sort()) hash.update(readFileSync(join(RUNTIME_ROOT, filename)));
  for (const file of [
    join(RUNTIME_ROOT, "cell-action-inspector-registry.js"),
    join(RUNTIME_ROOT, "cell-inspection-token.js"),
    join(RUNTIME_ROOT, "cell-query-api.js"),
    join(REPO_ROOT, "app", "webgl-generator", "src", "renderer", "grid-cell-diagnostics-layer.js"),
    join(REPO_ROOT, "app", "webgl-generator", "src", "renderer", "placeholder-renderer.js")
  ]) hash.update(readFileSync(file));
  return hash.digest("hex");
}

function renderMarkdown(matrix) {
  const gaps = matrix.rows.filter(row => row.status === "gap");
  const deferred = matrix.rows.filter(row => row.status === "deferred-owned");
  const exclusions = matrix.rows.filter(row => row.status === "excluded");
  const runtimeGaps = matrix.rows.filter(row => row.sourceKind === "runtime-action" && row.status === "gap");
  return [
    "# 控制台 API 全量能力矩阵",
    "",
    "> 本报告由 `tools/webgl-generator-api-full-capability-matrix.mjs` 从当前源码生成。权威任务状态仍以 `docs/current-plan.md` 为准。",
    "",
    "## 当前分母",
    "",
    `- 交互表面：${matrix.denominator.interactionSurfaces}（纳入 ${matrix.denominator.includedInteractionSurfaces}，交互审计排除 ${matrix.denominator.excludedInteractionSurfaces}）`,
    `- 画布模式：${matrix.denominator.canvasModes}`,
    `- runtime actions：${matrix.denominator.runtimeActions}`,
    `- API action 绑定：${matrix.denominator.apiActionBindings}`,
    `- command / inspector 导出：${matrix.denominator.commandAndInspectorExports}`,
    `- 公共 API 方法：${matrix.denominator.publicApiMethods}`,
    `- 矩阵总行数：${matrix.totals.rows}`,
    "",
    "## 分类结果",
    "",
    `- covered：${matrix.totals.covered}`,
    `- excluded：${matrix.totals.excluded}`,
    `- deferred-owned：${matrix.totals["deferred-owned"]}`,
    `- gap：${matrix.totals.gap}`,
    `- unknown：${matrix.totals.unknown}`,
    `- unclassified：${matrix.totals.unclassified}`,
    `- unownedParameterizableGap：${matrix.totals.unownedParameterizableGap}`,
    "",
    "## 真实缺口",
    "",
    ...(gaps.length ? gaps.map(row => `- \`${row.matrixId}\`：${row.exclusionReason || row.title}`) : ["- 无。"]),
    "",
    "## runtime action 差集",
    "",
    ...(runtimeGaps.length ? runtimeGaps.map(row => `- \`${row.action}\``) : ["- 无。"]),
    "",
    "## 第 195 项 Cell 能力收口",
    "",
    ...matrix.rows
      .filter(row => row.owner === "权威任务第 195 项")
      .map(row => `- \`${row.capabilityId}\`：${row.title}（${row.status}；${row.apiMethods.join("、")}）`),
    "",
    "## 保留排除项",
    "",
    ...exclusions.map(row => `- \`${row.matrixId}\`：${row.exclusionReason}`),
    ""
  ].join("\n");
}

function writeOrCheck(path, content, check) {
  if (check) {
    if (!existsSync(path)) throw new Error(`能力矩阵产物不存在：${relative(REPO_ROOT, path)}`);
    const current = readFileSync(path, "utf8");
    if (current !== content) throw new Error(`能力矩阵产物已陈旧：${relative(REPO_ROOT, path)}`);
    return;
  }
  writeFileSync(path, content);
}

function runCli() {
  const check = process.argv.includes("--check");
  const allowGaps = process.argv.includes("--allow-gaps");
  const matrix = buildFullCapabilityMatrix({allowGaps});
  const json = `${JSON.stringify(matrix, null, 2)}\n`;
  const markdown = renderMarkdown(matrix);
  writeOrCheck(OUTPUT_JSON, json, check);
  writeOrCheck(OUTPUT_MD, markdown, check);
  console.log(JSON.stringify({
    ok: true,
    check,
    allowGaps,
    outputs: [relative(REPO_ROOT, OUTPUT_JSON), relative(REPO_ROOT, OUTPUT_MD)],
    denominator: matrix.denominator,
    totals: matrix.totals
  }, null, 2));
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) runCli();
