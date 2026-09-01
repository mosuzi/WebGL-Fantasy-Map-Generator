import {createHash} from "node:crypto";
import {existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync} from "node:fs";
import {basename, dirname, extname, join, relative, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TOOL_DIR, "..");
const APP_ROOT = join(REPO_ROOT, "app", "webgl-generator");
const SRC_ROOT = join(APP_ROOT, "src");
const UI_ROOT = join(SRC_ROOT, "ui");
const PANEL_ROOT = join(UI_ROOT, "panels");
const VUE_COMPONENT_ROOT = join(UI_ROOT, "vue", "components");
const GENERATED_ROOT = join(REPO_ROOT, "docs", "generated", "interaction-audit");
const PLAN_PATH = "docs/task-notes/interaction-usability-audit-plan.md";

export const SOURCE_TYPES = Object.freeze([
  "vue-panel-detail",
  "non-vue-panel",
  "resident-readout",
  "fixed-overlay",
  "canvas-overlay",
  "shared-component",
  "global-event"
]);

const CANVAS_SURFACES = Object.freeze([
  {id: "map-canvas", selector: "#map-canvas", entry: "地图画布", condition: "地图已加载", sources: ["app/webgl-generator/index.html", "app/webgl-generator/src/renderer/placeholder-renderer.js", "app/webgl-generator/src/runtime/app.js"], events: "pointerdown / pointermove / pointerup / pointercancel / wheel / contextmenu", result: "选择、平移、缩放或画布工具结果"},
  {id: "map-overlay", selector: "#map-overlay", entry: "地图标签、图标与编辑 overlay", condition: "对应图层或编辑状态可见", sources: ["app/webgl-generator/index.html", "app/webgl-generator/src/renderer/placeholder-renderer.js", "app/webgl-generator/src/runtime/app.js"], events: "pointer drag / click / renderer refresh", result: "标签与图标显示、拖动或选择"},
  {id: "hover-overlay", selector: "#hover-overlay", entry: "地图悬停信息", condition: "悬停信息开启且命中地图对象", sources: ["app/webgl-generator/index.html", "app/webgl-generator/src/renderer/placeholder-renderer.js"], events: "pointermove / pointerleave", result: "悬停对象与 cell 信息"},
  {id: "map-legend", selector: "#map-legend", entry: "地图图例", condition: "当前视图存在图例", sources: ["app/webgl-generator/index.html", "app/webgl-generator/src/runtime/app.js"], events: "view refresh", result: "图例显示"},
  {id: "map-scale-bar", selector: "#map-scale-bar", entry: "地图比例尺", condition: "地图已加载", sources: ["app/webgl-generator/index.html", "app/webgl-generator/src/renderer/placeholder-renderer.js"], events: "camera change / resize", result: "比例尺显示"},
  {id: "measurement-overlay", selector: "#measurement-overlay / #measurement-svg", entry: "测量线与控制点", condition: "测量启用或已有测量对象", sources: ["app/webgl-generator/index.html", "app/webgl-generator/src/runtime/app.js"], events: "pointerdown / pointermove / pointerup / keydown", result: "测量绘制、控制点编辑与删除"},
  {id: "generation-feedback", selector: "#generation-loading / #map-toast / #shortcut-toast / #map-badge", entry: "全局状态反馈", condition: "生成、命令或快捷键反馈激活", sources: ["app/webgl-generator/index.html", "app/webgl-generator/src/runtime/app.js", "app/webgl-generator/src/runtime/keyboard-shortcuts.js"], events: "status update / timeout", result: "加载、成功、失败或快捷键反馈"}
]);

export function buildInteractionInventory() {
  const sourceFiles = collectFiles(APP_ROOT, file => [".js", ".vue", ".html"].includes(extname(file)));
  const rows = [
    ...buildPanelRows(),
    ...buildResidentRows(),
    ...buildFixedOverlayRows(),
    ...buildCanvasRows(),
    ...buildSharedComponentRows(),
    ...buildGlobalEventRows()
  ].sort((a, b) => a.surfaceId.localeCompare(b.surfaceId, "en"));
  const duplicateIds = duplicateValues(rows.map(row => row.surfaceId));
  if (duplicateIds.length) throw new Error(`交互表面 ID 重复：${duplicateIds.join(", ")}`);
  const sourceCounts = Object.fromEntries(SOURCE_TYPES.map(type => [type, rows.filter(row => row.sourceType === type).length]));
  const included = rows.filter(row => row.included).length;
  const excluded = rows.length - included;
  const unclassified = rows.filter(row => !SOURCE_TYPES.includes(row.sourceType)).length;
  const missingExclusionReason = rows.filter(row => !row.included && !row.exclusionReason).length;
  return {
    schemaVersion: 1,
    sourceDigest: digestFiles(sourceFiles),
    sourceRoots: ["app/webgl-generator/index.html", "app/webgl-generator/src/**/*.{js,vue}"],
    totals: {surfaces: rows.length, included, excluded, unclassified, missingExclusionReason, bySourceType: sourceCounts},
    rows
  };
}

export function buildFixtureManifest() {
  const legacyFixture = "tools/fixtures/webgl-map-v1-minimal.json";
  const invalidFixture = "tools/fixtures/interaction-audit-invalid-map.json";
  const fixtures = [
    fixture("F0", "启动 / 加载", "使用固定延迟参数观察启动、恢复、生成中和无可交互地图状态；失败路径由 F4 独立承担", "启动恢复、生成中与无可交互地图", {
      evidenceFiles: ["app/webgl-generator/src/runtime/app.js", "tools/webgl-generator-panel-layout-audit.mjs"],
      query: "?debug=1&loadTrace=1&loadStepDelay=200",
      browserSteps: ["清除浏览器地图后打开固定 query", "记录自动生成前、生成中和完成状态", "重新载入同一 URL 验证恢复"],
      reset: "清除临时浏览器地图并重新载入同一 URL"
    }),
    fixture("F1", "标准地图", "以固定 seed、模板和 10k cells 生成，记录 mapSummary、history.stats 与对象计数", "高频选择、编辑、面板与快捷键", {
      evidenceFiles: ["tools/webgl-generator-panel-layout-audit.mjs", "tools/webgl-generator-api-browser-ready.mjs"],
      seed: "interaction-audit-f1", template: "continents", cells: 10000,
      browserSteps: ["输入固定 seed / template / cells 并生成", "调用 info.mapSummary 与 history.stats", "保存对象计数与地图摘要作为本次指纹"],
      reset: "重新以相同参数生成并适配视图"
    }),
    fixture("F2", "长列表 / 复杂地图", "以固定 seed、模板和 100k cells 生成，复用 panel layout 深状态入口", "虚拟表格、筛选、批量和复杂面板", {
      evidenceFiles: ["tools/webgl-generator-panel-layout-audit.mjs", "tools/webgl-generator-ui-system-audit.mjs"],
      seed: "interaction-audit-f2", template: "continents", cells: 100000,
      browserSteps: ["输入固定 seed / template / cells 并生成", "记录对象计数与地图摘要", "打开目标复杂面板并准备长列表状态"],
      reset: "重新以相同参数生成并适配视图"
    }),
    fixture("F3", "旧图 / 导入", `旧 schema 只由 ${legacyFixture} 和迁移回归做静态覆盖；真实浏览器仅验证从 F1 导出的当前 v2 往返，不把最小 v1 样本伪装成可渲染整图`, "旧 schema、缺省字段、浏览器缓存和当前格式往返", {
      evidenceFiles: [legacyFixture, "tools/webgl-generator-api-data-compatibility-regression.mjs", "tools/webgl-generator-api-roundtrip-regression.mjs"],
      files: [fileDescriptor(legacyFixture)],
      browserSteps: ["先运行旧 v1 静态迁移门禁", "从 F1 导出当前 v2 临时文件", "导入该 v2 并核对摘要、对象计数与诊断"],
      browserLimit: "最小 v1 文件只证明静态迁移，不声明可由 renderer 完整显示",
      reset: "重新载入 F1 后再执行单次导入"
    }),
    fixture("F4", "可控失败", `导入 ${invalidFixture}，固定触发 unsupported-version / migrate-document，并复用现有导入诊断回归`, "非法文件、失败恢复和错误详情", {
      evidenceFiles: [invalidFixture, "tools/webgl-generator-map-import-diagnostics-regression.mjs"],
      files: [fileDescriptor(invalidFixture)],
      expectedError: {reason: "unsupported-version", stage: "migrate-document", message: "暂不支持的地图格式版本：99"},
      browserSteps: ["从 F1 基线选择固定失败文件", "核对错误摘要、阶段与详情", "关闭诊断并核对地图摘要未变"],
      reset: "关闭错误详情并重新载入 F1"
    }),
    fixture("F5", "破坏性副本", "从 F1 导出临时完整地图作为基线副本；每条危险路径后先撤销核对指纹，失败则重新导入副本", "危险动作、历史和恢复", {
      evidenceFiles: ["tools/webgl-generator-delete-impact-regression.mjs", "tools/webgl-generator-state-topology-ui-api-regression.mjs", "tools/webgl-generator-lake-delete-regression.mjs"],
      seed: "interaction-audit-f1",
      browserSteps: ["从 F1 导出临时基线副本并记录摘要", "执行单条危险路径", "撤销后核对摘要；不支持完整撤销时重新导入副本"],
      reset: "撤销并核对摘要；无法撤销时重新导入临时副本"
    }),
    fixture("F6", "空态 / 边界", "从 F1 副本以明确步骤构造无选择、空筛选和孤儿备注；零结果逻辑复用现有固定回归", "无选择、空列表、孤儿对象、零结果和禁用条件", {
      evidenceFiles: ["tools/webgl-generator-visible-row-selection-regression.mjs", "tools/webgl-generator-note-import-regression.mjs"],
      seed: "interaction-audit-f1",
      browserSteps: ["清除 selection 与 editing 后记录无选择态", "在对象表格输入不可能命中的固定筛选串 __interaction_audit_empty__", "在 F1 临时副本导入指向不存在对象的固定备注并打开备注面板"],
      reset: "清空筛选、停止编辑、清除选择并重新载入 F1"
    })
  ];
  return {
    schemaVersion: 1,
    viewports: [
      {id: "desktop", width: 1280, height: 720, zoom: 1, rootFontPx: 16},
      {id: "narrow", width: 720, height: 720, zoom: 1, rootFontPx: 16},
      {id: "css-stress", width: 720, height: 720, zoom: 1.25, effectiveWidth: 576, effectiveHeight: 576, rootFontPx: 20}
    ],
    evidenceLevels: {
      "E-C": "代码链与静态契约已追踪；不能单独证明路径通过",
      "E-S": "完成 E-C 后，真实浏览器成功路径及结果通过",
      "E-F": "完成 E-C 后，真实浏览器失败、取消或边界路径及恢复通过",
      "E-N": "当前无法稳定构造；不得写成通过"
    },
    resetContract: [
      "恢复指定夹具并核对地图摘要、对象数量与历史基线",
      "清理 selection、editing、画布模式、未提交预览、固定浮层和非目标面板",
      "恢复适配视图、默认图层、主题、单位和面板位置",
      "记录 undo / redo 数量与当前目标",
      "破坏性路径完成后撤销核对指纹，无法完整撤销时重新载入夹具",
      "下一条证据不得复用上一条未确认的中间态"
    ],
    fixtures
  };
}

export function writeInteractionAuditInfrastructure(outputRoot = GENERATED_ROOT) {
  const inventory = buildInteractionInventory();
  const fixtureManifest = buildFixtureManifest();
  mkdirSync(outputRoot, {recursive: true});
  writeFileSync(join(outputRoot, "interaction-surfaces.json"), stableJson(inventory));
  writeFileSync(join(outputRoot, "interaction-surfaces.md"), renderInventoryMarkdown(inventory));
  writeFileSync(join(outputRoot, "fixture-manifest.json"), stableJson(fixtureManifest));
  writeFileSync(join(outputRoot, "fixture-manifest.md"), renderFixtureMarkdown(fixtureManifest));
  return {inventory, fixtureManifest, outputRoot};
}

function buildPanelRows() {
  const rows = [];
  const panelFiles = collectFiles(PANEL_ROOT, file => file.endsWith("-panel.js"));
  for (const file of panelFiles) {
    const rel = relativePath(file);
    const source = readText(file);
    if (["lazy-vue-panel.js", "panel-highlight-actions.js"].includes(basename(file))) {
      rows.push(surface({
        id: `panel-helper:${basename(file, ".js")}`,
        type: "non-vue-panel",
        files: [rel],
        entry: "无直接用户入口",
        condition: "由其它面板内部调用",
        events: eventSummary(source),
        result: "内部挂载或高亮桥接",
        included: false,
        exclusionReason: "内部面板基础设施，不是独立用户交互表面"
      }));
      continue;
    }
    const panelId = resolvePanelId(source, basename(file, ".js"));
    const vueName = resolveVueComponentName(source);
    if (vueName) {
      const vuePath = join(VUE_COMPONENT_ROOT, vueName);
      const vueRel = relativePath(vuePath);
      const vueSource = existsSync(vuePath) ? readText(vuePath) : "";
      rows.push(surface({
        id: `panel:${panelId}`,
        type: "vue-panel-detail",
        files: [rel, vueRel],
        selector: `.floating-panel[data-panel-id=\"${panelId}\"]`,
        entry: panelId === "object-details" ? "地图或列表选择对象后显示详情" : "控制面板、快捷键或对象上下文入口",
        condition: panelId === "object-details" ? "存在当前 selection" : "对应功能可用；部分面板要求地图已加载",
        events: eventSummary(`${source}\n${vueSource}`),
        result: panelId === "object-details" ? "对象详情、定位或编辑入口" : "面板状态、领域回调或命令入口",
        panelIdentity: panelIdentity(source, panelId, vueSource)
      }));
    } else {
      rows.push(surface({
        id: `panel:${panelId}`,
        type: "non-vue-panel",
        files: [rel],
        selector: `.floating-panel[data-panel-id=\"${panelId}\"]`,
        entry: panelId === "development-panel" ? "debug=1 或开发模式按钮" : "运行时面板入口",
        condition: panelId === "development-panel" ? "开发模式启用" : "对应功能可用",
        events: eventSummary(source),
        result: "非 Vue 面板状态或诊断反馈",
        panelIdentity: panelIdentity(source, panelId)
      }));
    }
  }
  return rows;
}

function buildResidentRows() {
  const bridgePath = join(UI_ROOT, "vue", "state-bridge.js");
  const bridge = readText(bridgePath);
  return [
    surface({id: "resident:map-toolbar", type: "resident-readout", files: [relativePath(bridgePath), "app/webgl-generator/src/ui/vue/components/MapToolbar.vue"], selector: "#map-toolbar", entry: "画布上方常驻地图工具栏", condition: "应用已挂载", events: eventSummary(`${bridge}\n${readText(join(VUE_COMPONENT_ROOT, "MapToolbar.vue"))}`), result: "导航、测量和常驻工具动作"}),
    surface({id: "resident:measurement-readout", type: "resident-readout", files: [relativePath(bridgePath), "app/webgl-generator/src/ui/vue/components/MeasurementReadout.vue"], selector: "#measurement-readout", entry: "测量模式读数条", condition: "测量激活或存在当前测量", events: eventSummary(`${bridge}\n${readText(join(VUE_COMPONENT_ROOT, "MeasurementReadout.vue"))}`), result: "测量状态、保存、导出与模式控制"}),
    surface({id: "resident:vue-state-bridge", type: "resident-readout", files: [relativePath(bridgePath), "app/webgl-generator/src/ui/vue/VueStateBridge.vue"], selector: "#vue-state-root", entry: "无直接用户入口", condition: "应用初始化", events: "store synchronization", result: "内部 Vue / runtime 状态桥接", included: false, exclusionReason: "隐藏内部桥接组件，不直接呈现或接收用户交互"})
  ];
}

function buildFixedOverlayRows() {
  const rows = [];
  const componentFiles = collectFiles(VUE_COMPONENT_ROOT, file => file.endsWith(".vue"));
  for (const file of componentFiles) {
    const source = readText(file);
    if (source.includes("<UiActionDock")) {
      const host = kebab(basename(file, ".vue"));
      const panelId = host === "control-panel" ? "generation-panel" : host;
      rows.push(surface({id: `fixed-overlay:action-dock:${host}`, type: "fixed-overlay", files: [relativePath(file), "app/webgl-generator/src/ui/vue/components/base/UiActionDock.vue"], selector: `.floating-panel[data-panel-id=\"${panelId}\"] .ui-secondary-action-panel`, entry: `${basename(file, ".vue")} 动作坞`, condition: "已选择对象且动作需要二级面板", events: "click / pointer drag / outside close / Escape", result: "打开、移动、提交或关闭二级动作面板"}));
    }
    if (source.includes("<UiTreeDisplayPanel")) {
      const host = kebab(basename(file, ".vue"));
      rows.push(surface({id: `fixed-overlay:tree:${host}`, type: "fixed-overlay", files: [relativePath(file), "app/webgl-generator/src/ui/vue/components/base/UiTreeDisplayPanel.vue"], selector: `.floating-panel[data-panel-id=\"${host}\"] .ui-tree-display-panel`, entry: `${basename(file, ".vue")} 树状总览`, condition: "用户打开树状总览", events: "click / pointer drag / Escape / close", result: "树状关系浏览、选择、移动或关闭"}));
    }
  }
  rows.push(surface({id: "fixed-overlay:project-export", type: "fixed-overlay", files: ["app/webgl-generator/src/ui/vue/components/ControlPanel.vue"], selector: ".project-export-panel", entry: "控制面板导出入口", condition: "导出浮层已打开", events: "click / pointer drag / Escape / close", result: "导出选项、下载或关闭"}));
  rows.push(surface({id: "fixed-overlay:heightmap-workbench", type: "fixed-overlay", files: ["app/webgl-generator/src/ui/vue/components/HeightPanel.vue"], selector: ".heightmap-import-workbench", entry: "高度面板图片导入工作台", condition: "高度图工作台已打开", events: "input / click / pointer drag / Escape / close", result: "高度图预览、参数调整、应用或关闭"}));
  return rows;
}

function buildCanvasRows() {
  return CANVAS_SURFACES.map(item => surface({id: `canvas:${item.id}`, type: "canvas-overlay", files: item.sources, selector: item.selector, entry: item.entry, condition: item.condition, events: item.events, result: item.result}));
}

function buildSharedComponentRows() {
  const files = [
    ...collectFiles(join(VUE_COMPONENT_ROOT, "base"), file => file.endsWith(".vue")),
    ...collectFiles(join(UI_ROOT, "components"), file => file.endsWith(".js"))
  ];
  return files.map(file => {
    const source = readText(file);
    const name = basename(file, extname(file));
    const interactive = /@(click|dblclick|change|input|keydown|pointer)|addEventListener\(|defineEmits|v-model|<button|<ElButton|<input|<select|<textarea/.test(source);
    return surface({
      id: `shared:${kebab(name)}`,
      type: "shared-component",
      files: [relativePath(file)],
      entry: interactive ? "由领域面板或固定浮层复用" : "无独立用户入口",
      condition: "宿主组件已渲染",
      events: eventSummary(source),
      result: interactive ? "共享字段、表格、按钮、页签、拖动或反馈行为" : "共享只读布局",
      included: interactive,
      exclusionReason: interactive ? "" : "纯展示或布局组件，没有独立交互事件"
    });
  });
}

function buildGlobalEventRows() {
  const definitions = [
    {path: "app/webgl-generator/src/runtime/keyboard-shortcuts.js", entry: "全局与焦点内快捷键", result: "快捷键执行、提示和输入抑制", included: true},
    {path: "app/webgl-generator/src/ui/overlay-registry.js", entry: "固定浮层全局 Esc 与 resize", result: "最内层浮层关闭、重排和焦点返回", included: true},
    {path: "app/webgl-generator/src/ui/panel-manager.js", entry: "浮动面板全局 resize", result: "面板越界恢复与布局更新", included: true},
    {path: "app/webgl-generator/src/ui/panel.js", entry: "控制面板 document 自定义事件总线", result: "主题、标签样式、文件和高度图动作路由", included: true},
    {path: "app/webgl-generator/src/runtime/health-monitor.js", entry: "内部健康监测 document 事件", result: "诊断采样", included: false, reason: "健康监测只记录诊断，不是用户交互表面"},
    {path: "app/webgl-generator/src/runtime/regeneration-lock-ui-session.js", entry: "重生成锁面板关闭清理事件", result: "取消地图多选并清理临时集合", included: false, reason: "用户入口已归入 14 个对象列表与共享画布模式，不重复计入全局分母"},
    {path: "app/webgl-generator/src/ui/brush-cursor-preview.js", entry: "画笔控件 document 委托监听", result: "画笔 cursor 刷新", included: false, reason: "局部委托行为已归入 canvas:map-canvas，不重复计入全局分母"},
    {path: "app/webgl-generator/src/ui/label-naming-panel-trigger.js", entry: "标签面板 document 委托监听", result: "标签面板打开", included: false, reason: "局部委托行为已归入对应面板，不重复计入全局分母"},
    {path: "app/webgl-generator/src/ui/panels/development-panel.js", entry: "开发面板 AI 桥按钮监听", result: "连接、授权、确认或断开本地桥", included: false, reason: "局部按钮行为已归入开发面板，不重复计入全局分母"},
    {path: "app/webgl-generator/src/ui/vue/composables/use-debug-mode.js", entry: "内部 debug 状态同步", result: "Vue debug 状态", included: false, reason: "内部状态同步，不是直接用户交互表面"},
    {path: "app/webgl-generator/src/ui/vue/composables/use-draggable-floating-panel.js", entry: "局部浮层拖动 window 捕获", result: "浮层拖动", included: false, reason: "拖动生命周期已归入 shared / fixed-overlay，不重复计入全局分母"},
    {path: "app/webgl-generator/src/ui/vue/components/base/UiActionDock.vue", entry: "动作坞 document 外部点击", result: "二级面板关闭", included: false, reason: "局部行为已按 18 个 fixed-overlay 宿主展开，不重复计入全局分母"},
    {path: "app/webgl-generator/src/ui/vue/components/RoutePanel.vue", entry: "道路面板运行时操作状态同步", result: "道路重生成按钮忙碌态", included: false, reason: "局部运行时状态已归入道路面板，不重复计入全局分母"},
    {path: "app/webgl-generator/src/ui/vue/components/ControlPanel.vue", entry: "导出浮层 document / window 监听", result: "外部关闭与重排", included: false, reason: "局部行为已归入 fixed-overlay:project-export，不重复计入全局分母"},
    {path: "app/webgl-generator/src/runtime/app.js", id: "worker-generation", entry: "生成 worker message / error / messageerror", result: "内部生成消息与主线程回退", included: false, reason: "worker 内部桥接事件不直接呈现为用户交互表面；用户可见加载反馈已归入 canvas:generation-feedback"}
  ];
  const discovered = discoverGlobalEventSources();
  const definitionsByPath = new Map(definitions.map(item => [item.path, item]));
  const unmatched = [...discovered.keys()].filter(path => !definitionsByPath.has(path));
  if (unmatched.length) throw new Error(`发现未分类的全局监听来源：${unmatched.join(", ")}`);
  const staleDefinitions = definitions.filter(item => !discovered.has(item.path));
  if (staleDefinitions.length) throw new Error(`全局监听分类已失效：${staleDefinitions.map(item => item.path).join(", ")}`);
  return [...discovered.entries()].map(([path, eventNames]) => {
    const item = definitionsByPath.get(path);
    const file = join(REPO_ROOT, ...item.path.split("/"));
    const source = readText(file);
    return surface({
      id: `global:${item.id || kebab(item.path.replace(/\.(js|vue)$/i, ""))}`,
      type: "global-event",
      files: [item.path],
      entry: item.entry,
      condition: "对应全局监听器已安装",
      events: [...new Set(eventNames)].sort().join(" / ") || eventSummary(source),
      result: item.result,
      included: item.included,
      exclusionReason: item.reason || ""
    });
  });
}

function discoverGlobalEventSources() {
  const discovered = new Map();
  const files = collectFiles(SRC_ROOT, file => [".js", ".vue"].includes(extname(file)));
  for (const file of files) {
    const events = [];
    for (const line of readText(file).split("\n")) {
      if (!/(?:document(?:Ref)?|window|defaultView|worker)[^\n]*addEventListener\(/.test(line)) continue;
      const name = line.match(/addEventListener\(\s*["']([^"']+)["']/)?.[1] || "dynamic";
      events.push(name);
    }
    if (events.length) discovered.set(relativePath(file), [...new Set(events)].sort());
  }
  return discovered;
}

function surface({id, type, files, selector = "", entry, condition, events, result, included = true, exclusionReason = "", panelIdentity = null}) {
  return {
    surfaceId: id,
    sourceType: type,
    sourceFiles: [...new Set(files)].sort(),
    selector,
    userEntry: entry,
    conditionState: condition,
    eventOrCallback: events || "未发现直接事件；后续静态作用链复核",
    resultType: result,
    existingDecisions: [],
    decisionStatus: included ? "pending" : "not-applicable",
    evidenceStatus: included ? "pending" : "excluded",
    requiresIntB: included ? null : false,
    included,
    exclusionReason: included ? "" : exclusionReason,
    panelIdentity
  };
}

function panelIdentity(source, panelId, vueSource = "") {
  const role = source.match(/\brole:\s*["']([^"']+)["']/)?.[1] || "main";
  const persistOpen = !/\bpersistOpen:\s*false\b/.test(source);
  const hasOnClose = /\bonClose\s*:/.test(source);
  const wrapperState = extractReactiveKeys(source);
  const componentState = extractVueStateKeys(vueSource);
  let mainState = [...new Set([...wrapperState, ...componentState])].slice(0, 40);
  let stateSource = wrapperState.length ? "panel wrapper reactive state" : componentState.length ? "Vue component refs / reactive / computed" : "panel lifecycle";
  if (panelId === "generation-panel") {
    stateSource = "ControlPanel refs / computed + Pinia global-config and editor stores";
    mainState = componentState.length ? componentState : ["activeTab", "exportPanelOpen", "selectedRegenerationKind", "visualThemePresetOptions"];
  }
  if (panelId === "development-panel") {
    stateSource = "development-panel closure state";
    mainState = ["enabled", "collapsed", "loadTrace", "healthEvents"];
  }
  return {
    panelId,
    role,
    persistOpen,
    closeBehavior: hasOnClose ? "存在领域 onClose；第 102～106 项继续追踪具体结果" : "PanelManager 默认关闭；第 102～106 项继续核对",
    stateSource,
    mainState
  };
}

function extractReactiveKeys(source) {
  const body = source.match(/(?:shallowReactive|reactive)\(\s*\{([\s\S]*?)\n\s*\}\s*\)/)?.[1] || "";
  return [...body.matchAll(/^\s{4}([A-Za-z_$][\w$]*)\s*:/gm)].map(match => match[1]).slice(0, 40);
}

function extractVueStateKeys(source) {
  return [...source.matchAll(/^const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:ref|reactive|computed)\(/gm)].map(match => match[1]).slice(0, 40);
}

function resolvePanelId(source, fallback) {
  const literal = source.match(/registerPanel\(\s*["']([^"']+)["']/)?.[1];
  if (literal) return literal;
  const constantName = source.match(/registerPanel\(\s*([A-Z][A-Z0-9_]*)/)?.[1];
  if (constantName) {
    const pattern = new RegExp(`const\\s+${constantName}\\s*=\\s*["']([^"']+)["']`);
    const value = source.match(pattern)?.[1];
    if (value) return value;
  }
  return fallback;
}

function resolveVueComponentName(source) {
  return source.match(/(?:import\s+[A-Za-z0-9_$]+\s+from\s+|import\()\s*["'][^"']*\/([A-Za-z0-9_-]+\.vue)["']/)?.[1] || "";
}

function eventSummary(source) {
  const vueEvents = [...source.matchAll(/@([a-zA-Z][\w-]*)/g)].map(match => match[1]);
  const domEvents = [...source.matchAll(/addEventListener\(\s*["']([^"']+)["']/g)].map(match => match[1]);
  const callbacks = [...source.matchAll(/\b(on[A-Z][A-Za-z0-9_]*)\??\s*(?:\.|:)/g)].map(match => match[1]);
  const tokens = [...new Set([...vueEvents, ...domEvents, ...callbacks])].sort();
  return tokens.slice(0, 18).join(" / ") || "component props / state";
}

function fixture(id, label, construct, purpose, extra) {
  const evidence = (extra.evidenceFiles || []).map(fileDescriptor);
  const missingEvidence = evidence.filter(item => !item.exists).map(item => item.path);
  const staticReady = missingEvidence.length === 0;
  const browserPrepared = staticReady && Array.isArray(extra.browserSteps) && extra.browserSteps.length > 0;
  const stableKey = createHash("sha256").update(stableJson({id, label, construct, purpose, extra, evidence})).digest("hex");
  return {
    id,
    label,
    construct,
    purpose,
    staticReady,
    browserPrepared,
    browserVerified: false,
    verificationTarget: "第 107 项统一浏览器验证",
    gap: missingEvidence.length ? `缺少证据文件：${missingEvidence.join(", ")}` : "",
    stableKey,
    evidence,
    ...extra
  };
}

function fileDescriptor(repoPath) {
  const fullPath = join(REPO_ROOT, ...repoPath.split("/"));
  return {path: repoPath, exists: existsSync(fullPath), sha256: existsSync(fullPath) ? sha256(readFileSync(fullPath)) : "missing"};
}

function renderInventoryMarkdown(inventory) {
  const lines = [
    "# 交互表面清单",
    "",
    `- source digest：\`${inventory.sourceDigest}\``,
    `- 表面总数：\`${inventory.totals.surfaces}\``,
    `- included / excluded：\`${inventory.totals.included} / ${inventory.totals.excluded}\``,
    `- 未分类 / 缺少排除理由：\`${inventory.totals.unclassified} / ${inventory.totals.missingExclusionReason}\``,
    "",
    "| surfaceId | 来源类型 | included | 入口 / selector | 事件或回调 | 结果 | 排除理由 |",
    "|---|---|---:|---|---|---|---|"
  ];
  for (const row of inventory.rows) {
    lines.push(`| \`${escapeCell(row.surfaceId)}\` | ${row.sourceType} | ${row.included ? "是" : "否"} | ${escapeCell(row.userEntry)}${row.selector ? `<br>\`${escapeCell(row.selector)}\`` : ""} | ${escapeCell(row.eventOrCallback)} | ${escapeCell(row.resultType)} | ${escapeCell(row.exclusionReason || "—")} |`);
  }
  return `${lines.join("\n")}\n`;
}

function renderFixtureMarkdown(manifest) {
  const lines = [
    "# 交互审计固定场景 manifest",
    "",
    "## 场景",
    "",
    "| 场景 | 用途 | 构造方式 | 静态已备 | 浏览器步骤已备 | 浏览器已验证 | gap | stable key |",
    "|---|---|---|---:|---:|---:|---|---|"
  ];
  for (const item of manifest.fixtures) lines.push(`| ${item.id} ${item.label} | ${escapeCell(item.purpose)} | ${escapeCell(item.construct)} | ${item.staticReady ? "是" : "否"} | ${item.browserPrepared ? "是" : "否"} | ${item.browserVerified ? "是" : "否"} | ${escapeCell(item.gap || "—")} | \`${item.stableKey.slice(0, 12)}\` |`);
  lines.push("", "## 视口", "", "| ID | 视口 | zoom | 根字号 |", "|---|---:|---:|---:|");
  for (const viewport of manifest.viewports) lines.push(`| ${viewport.id} | ${viewport.width}×${viewport.height} | ${viewport.zoom} | ${viewport.rootFontPx}px |`);
  lines.push("", "## 状态复位契约", "");
  manifest.resetContract.forEach((item, index) => lines.push(`${index + 1}. ${item}`));
  return `${lines.join("\n")}\n`;
}

function collectFiles(root, predicate) {
  if (!existsSync(root)) return [];
  const files = [];
  for (const name of readdirSync(root).sort()) {
    const path = join(root, name);
    if (statSync(path).isDirectory()) files.push(...collectFiles(path, predicate));
    else if (predicate(path)) files.push(path);
  }
  return files;
}

function digestFiles(files) {
  const hash = createHash("sha256");
  for (const file of files.sort()) {
    hash.update(relativePath(file));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) seen.has(value) ? duplicates.add(value) : seen.add(value);
  return [...duplicates].sort();
}

function readText(path) {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

function relativePath(path) {
  return relative(REPO_ROOT, path).replaceAll("\\", "/");
}

function kebab(value) {
  return String(value).replaceAll("\\", "/").replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

function escapeCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function parseArgs(argv) {
  const args = {check: false, output: GENERATED_ROOT};
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === "--check") args.check = true;
    if (argv[index] === "--output") args.output = resolve(REPO_ROOT, argv[++index]);
  }
  return args;
}

function validate({inventory, fixtureManifest}) {
  const errors = [];
  if (inventory.totals.unclassified) errors.push(`未分类表面 ${inventory.totals.unclassified}`);
  if (inventory.totals.missingExclusionReason) errors.push(`排除理由缺失 ${inventory.totals.missingExclusionReason}`);
  for (const type of SOURCE_TYPES) if (!inventory.totals.bySourceType[type]) errors.push(`来源类型为空：${type}`);
  const fixtureIds = fixtureManifest.fixtures.map(item => item.id).join(",");
  if (fixtureIds !== "F0,F1,F2,F3,F4,F5,F6") errors.push(`固定场景不完整：${fixtureIds}`);
  if (fixtureManifest.fixtures.some(item => !item.staticReady)) errors.push("存在静态证据未就绪的固定场景");
  if (fixtureManifest.fixtures.some(item => !item.browserPrepared)) errors.push("存在未准备浏览器步骤的固定场景");
  if (fixtureManifest.fixtures.some(item => item.browserVerified)) errors.push("第 101 项不得提前声明浏览器已验证");
  for (const item of fixtureManifest.fixtures.flatMap(entry => entry.files || [])) if (!item.exists) errors.push(`夹具不存在：${item.path}`);
  if (errors.length) throw new Error(errors.join("；"));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const first = writeInteractionAuditInfrastructure(args.output);
  validate(first);
  if (args.check) {
    const firstBytes = ["interaction-surfaces.json", "interaction-surfaces.md", "fixture-manifest.json", "fixture-manifest.md"].map(name => readFileSync(join(args.output, name)));
    writeInteractionAuditInfrastructure(args.output);
    const secondBytes = ["interaction-surfaces.json", "interaction-surfaces.md", "fixture-manifest.json", "fixture-manifest.md"].map(name => readFileSync(join(args.output, name)));
    if (firstBytes.some((value, index) => !value.equals(secondBytes[index]))) throw new Error("连续生成结果不稳定");
  }
  console.log(JSON.stringify({
    output: relativePath(args.output),
    surfaces: first.inventory.totals,
    fixtures: first.fixtureManifest.fixtures.map(item => item.id),
    deterministic: args.check
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
