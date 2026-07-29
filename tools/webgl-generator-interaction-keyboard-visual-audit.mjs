import {createHash} from "node:crypto";
import {mkdirSync, readFileSync, readdirSync, statSync, writeFileSync} from "node:fs";
import {dirname, extname, join, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {KEYBOARD_SHORTCUTS, shortcutBindingSignature, validateShortcutRegistry} from "../app/webgl-generator/src/runtime/keyboard-shortcuts.js";
import {buildFixtureManifest, buildInteractionInventory} from "./webgl-generator-interaction-surface-inventory.mjs";
import {buildComplexWorkspaceAudit} from "./webgl-generator-interaction-complex-workspace-audit.mjs";

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TOOL_DIR, "..");
const SRC_ROOT = join(REPO_ROOT, "app", "webgl-generator", "src");
const OUTPUT_ROOT = join(REPO_ROOT, "docs", "generated", "interaction-audit");

const FILES = Object.freeze({
  runtime: "app/webgl-generator/src/runtime/app.js",
  shortcuts: "app/webgl-generator/src/runtime/keyboard-shortcuts.js",
  overlay: "app/webgl-generator/src/ui/overlay-registry.js",
  panelManager: "app/webgl-generator/src/ui/panel-manager.js",
  lazyPanel: "app/webgl-generator/src/ui/panels/lazy-vue-panel.js",
  styles: "app/webgl-generator/src/styles.css",
  control: "app/webgl-generator/src/ui/vue/components/ControlPanel.vue",
  height: "app/webgl-generator/src/ui/vue/components/HeightPanel.vue",
  color: "app/webgl-generator/src/ui/vue/components/base/UiColorField.vue",
  actionDock: "app/webgl-generator/src/ui/vue/components/base/UiActionDock.vue",
  segmented: "app/webgl-generator/src/ui/vue/components/base/UiSegmented.vue",
  select: "app/webgl-generator/src/ui/vue/components/base/UiSelectField.vue",
  slider: "app/webgl-generator/src/ui/vue/components/base/UiSliderField.vue",
  switch: "app/webgl-generator/src/ui/vue/components/base/UiSwitchField.vue",
  tree: "app/webgl-generator/src/ui/vue/components/base/UiTreeDisplayPanel.vue",
  stateBanner: "app/webgl-generator/src/ui/vue/components/base/UiStateBanner.vue"
});

const FOCUS_ENTRIES = Object.freeze([
  focusEntry("overlay-open-focus", "浮层打开后聚焦容器", "programmatic-entry", FILES.overlay, "entry.element.focus({preventScroll: true})", "打开 managed overlay 后下一帧把焦点移入浮层"),
  focusEntry("overlay-return-focus", "浮层关闭后返回触发点", "programmatic-return", FILES.overlay, "target.focus({preventScroll: true})", "returnFocus 仍连接时恢复触发点"),
  focusEntry("managed-overlay-root-tabstop", "managed overlay 根容器焦点注入", "managed-root", FILES.overlay, "element.setAttribute(\"tabindex\", \"-1\")", "注册时为未声明 tabindex 的浮层根补负 tabindex，供程序聚焦但不进入自然 Tab 顺序"),
  focusEntry("panel-rerender-focus", "面板内容重绘后恢复控件焦点", "programmatic-restore", FILES.panelManager, "target.focus({preventScroll: true})", "按 childPath + tagName + type 恢复焦点；输入类控件另恢复 selection range，不恢复 scroll"),
  focusEntry("measurement-handle-tabstop", "测量控制点键盘入口", "natural-tabstop", FILES.runtime, "circle.setAttribute(\"tabindex\", \"0\")", "每个可编辑测量控制点进入自然 Tab 顺序"),
  focusEntry("project-export-dialog-root", "项目导出 dialog 根", "fixed-dialog-root", FILES.control, "tabindex=\"-1\"", "managed fixed overlay 的程序聚焦根；不进入自然 Tab 顺序"),
  focusEntry("heightmap-workbench-dialog-root", "高度图工作台 dialog 根", "fixed-dialog-root", FILES.height, "tabindex=\"-1\"", "managed fixed overlay 的程序聚焦根；不进入自然 Tab 顺序"),
  focusExclusion("segmented-native-proxy", "分段器原生代理输入", FILES.segmented, "tabindex=\"-1\"", "由 Element Plus 分段项承担键盘入口"),
  focusExclusion("select-native-proxy", "选择框原生代理输入", FILES.select, "tabindex=\"-1\"", "由 Element Plus 选择器承担键盘入口"),
  focusExclusion("slider-native-proxy", "滑杆原生代理输入", FILES.slider, "tabindex=\"-1\"", "由 Element Plus 滑杆承担键盘入口"),
  focusExclusion("switch-native-proxy", "开关原生代理输入", FILES.switch, "tabindex=\"-1\"", "由 Element Plus 开关承担键盘入口"),
  focusEntry("tree-dialog-container", "树状展示浮层容器", "negative-programmatic-entry", FILES.tree, "tabindex=\"-1\"", "managed overlay 可直接聚焦非自然 Tab 容器")
]);

const KEYBOARD_CONSUMERS = Object.freeze([
  keyboardConsumer("shortcut-dispatcher", "全局快捷键分派", "document-capture", FILES.shortcuts, "documentRef.addEventListener(\"keydown\", onKeydown, true)", "22 条注册快捷动作；输入、组合输入、重复键和独占 modal 被守卫", ["event.repeat", "isEditableShortcutTarget", "hasExclusiveKeyboardModal"]),
  keyboardConsumer("overlay-escape", "关闭最上层 managed overlay", "document-capture", FILES.overlay, "documentRef.addEventListener(\"keydown\", this.handleKeydown, true)", "Escape preventDefault + stopPropagation 后关闭当前最高 z-index 浮层", ["event.key !== \"Escape\"", "event.preventDefault()", "event.stopPropagation()"]),
  keyboardConsumer("measurement-handle-delete", "删除测量控制点", "svg-control", FILES.runtime, "circle.addEventListener(\"keydown\", event =>", "Delete / Backspace 删除当前测量点", ["event.key !== \"Delete\"", "event.key !== \"Backspace\""]),
  keyboardConsumer("color-field-enter", "提交十六进制颜色草稿", "field-local", FILES.color, "@keydown.enter.prevent=\"commitHexDraft\"", "Enter 提交当前颜色文本"),
  keyboardConsumer("lazy-preload-input-tracker", "懒加载预取输入时序追踪", "window-capture-passive", FILES.lazyPanel, "[\"pointerdown\", \"keydown\", \"wheel\", \"touchstart\"]", "只更新时间戳以等待安静输入窗口；不 preventDefault、不 stopPropagation，也不产生键盘动作", ["lastInputAt = currentTime(view)", "capture: true, passive: true"])
]);

const ESCAPE_CONTRACTS = Object.freeze([
  {
    id: "overlay-escape",
    included: true,
    priority: "先注册的 document capture",
    editableTarget: "仍执行",
    result: "关闭最高 managed overlay 并恢复 returnFocus",
    sourceRefs: [ref(FILES.overlay, ["event.key !== \"Escape\"", "event.preventDefault()", "event.stopPropagation()", "requestClose(topmost.id)"]), ref(FILES.runtime, ["new PanelManager", "installKeyboardShortcuts"])]
  },
  {
    id: "selection-cancel",
    included: true,
    priority: "后注册的同一 document capture；前序 stopPropagation 不会阻止它",
    editableTarget: "isEditableShortcutTarget 时跳过",
    result: "selection.stopEditing 后 selection.clear",
    sourceRefs: [ref(FILES.shortcuts, ["selection.cancel", "binding(\"Escape\")", "isEditableShortcutTarget(event.target)"])]
  },
  {
    id: "escape-key-label",
    included: false,
    exclusionReason: "只把 Escape 格式化为 Esc 标签，不消费键盘事件",
    sourceRefs: [ref(FILES.shortcuts, ["if (code === \"Escape\") return \"Esc\""])]
  }
]);

const LAYER_CONTRACTS = Object.freeze([
  visualContract("managed-overlays", "全部编辑面板与 managed fixed overlay", ">=900 且按激活顺序递增", FILES.overlay, ["this.nextZIndex = 900", "entry.element.style.zIndex = String(entry.zIndex)"]),
  visualContract("selection-marker", "对象选择标记", "8", FILES.styles, [".selection-marker", "z-index: 8"]),
  visualContract("map-toolbar", "地图工具栏", "6", FILES.styles, [".map-toolbar", "z-index: 6"]),
  visualContract("hover-and-scale", "悬停面板与比例尺", "5", FILES.styles, [".hover-overlay", ".map-scale-bar", "z-index: 5"]),
  visualContract("marker-icons", "普通标记图标", "5；与 hover / scale 相等，实际叠放还取决于 stacking context 与 DOM 顺序", FILES.styles, [".marker-map-icon", "z-index: 5"]),
  visualContract("measurement", "测量线与控制点", "4", FILES.styles, [".measurement-overlay", "z-index: 4"]),
  visualContract("city-custom-military-labels", "城市与自定义标签高于军事标签", "城市 / 自定义 3；军事 2", FILES.styles, [".city-label", ".custom-label", ".military-map-icon", "z-index: 3", "z-index: 2"]),
  visualContract("political-labels", "国家与省份标签", "2；省份碰撞降级为 1", FILES.styles, [".political-label", ".province-label", ".province-label.collision-fallback", "z-index: 2", "z-index: 1"])
]);

const TARGET_SIZE_CONTRACTS = Object.freeze([
  targetSize("panel-header-actions", ".floating-panel-history-button", "28×28；与 .floating-panel-close 共用规则", "shared-panel-header", ["width: 28px", "height: 28px"]),
  targetSize("icon-action", ".ui-icon-action.el-button", "32×32", "shared-action", ["width: 32px", "height: 32px"]),
  targetSize("secondary-close", ".ui-secondary-action-close", "视觉 26×26；透明命中 28×28", "compact-close", ["width: 26px", "height: 26px"], [cssRef(".ui-secondary-action-close::before", ["inset: -1px"])]),
  targetSize("table-row-action", ".table-icon-action", "28×28", "table-row", ["width: 28px", "height: 28px"]),
  targetSize("table-sort", ".object-table-sort-button", "min-height 28；宽度随表头", "table-header", ["min-height: 28px", "width: 100%"]),
  targetSize("table-resize", ".object-table-column-resize-handle", "透明命中 16×表头高度；视觉线 2px", "precision-drag", ["width: 16px", "height: 100%"], [cssRef(".object-table-column-resize-handle::after", ["width: 2px"])]),
  targetSize("table-checkbox", ".object-table-selection-hit", "视觉 14×14；透明命中 28×28", "checkbox", ["width: 28px", "height: 28px"], [cssRef(".object-table-selection-checkbox", ["width: 14px", "height: 14px"])]),
  targetSize("empty-action", ".object-table-empty-action", "视觉 min-height 26；透明命中 min-height 28", "empty-state", ["min-height: 26px"], [cssRef(".object-table-empty-action::before", ["inset: -1px 0"])])
]);

const FOCUS_STYLE_CONTRACTS = Object.freeze([
  visualContract("shared-focus-ring", "工具栏、图标动作、关闭、表格精密控件、风带与继承树", "统一 focus-visible token", FILES.styles, ["--ui-focus-color", "--ui-focus-width", "--ui-focus-offset", ":is(.map-toolbar .primary-action, .map-toolbar .secondary-action, .map-toolbar-edge-trigger):focus-visible", ".ui-secondary-action-close:focus-visible", ".object-table-column-resize-handle:focus-visible", ".object-table-sort-button:focus-visible", ".object-table-empty-action:focus-visible", ".wind-band-button.el-button:focus-visible", ".inheritance-tree-open.el-button:focus-visible"]),
  visualContract("field-focus", "Element 输入与文本域", "金色 1px inset 边框", FILES.styles, [".el-input__wrapper:focus-within", ".el-textarea__inner:focus", "#d7a84f"])
]);

const STATUS_STYLE_CONTRACTS = Object.freeze([
  visualContract("error", "错误", "红色", FILES.styles, [".climate-downstream-error", "color: #ff9b93"]),
  visualContract("warning-progress", "警告 / 运行中", "黄色", FILES.styles, [".climate-downstream-progress", "color: #ffd37a"]),
  visualContract("applied", "已应用", "绿色边框", FILES.styles, [".climate-downstream-result.is-applied", "rgba(94, 197, 143, 0.34)"])
]);

export function buildKeyboardVisualAudit() {
  const shortcutValidation = validateShortcutRegistry(KEYBOARD_SHORTCUTS);
  const focusDiscovery = discoverFocusEntries();
  const keyboardDiscovery = discoverKeyboardConsumers();
  const localKeyboardActions = discoverLocalKeyboardActions();
  const escapeDiscovery = discoverEscapeLiterals();
  const fixtureManifest = buildFixtureManifest();
  const interactionInventory = buildInteractionInventory();
  const complexWorkspaceAudit = buildComplexWorkspaceAudit();
  const managedOverlay = buildManagedOverlayInstances(interactionInventory, complexWorkspaceAudit);
  const managedOverlayInstances = managedOverlay.instances;
  const stateBannerContracts = buildStateBannerContracts();
  const viewports = fixtureManifest.viewports.map(item => ({...item}));
  verifyViewportContract(viewports);
  verifySourceReferences([
    ...FOCUS_ENTRIES,
    ...KEYBOARD_CONSUMERS,
    ...localKeyboardActions,
    ...ESCAPE_CONTRACTS,
    ...LAYER_CONTRACTS,
    ...TARGET_SIZE_CONTRACTS,
    ...FOCUS_STYLE_CONTRACTS,
    ...STATUS_STYLE_CONTRACTS,
    ...stateBannerContracts
  ]);
  const findings = buildFindings();
  const browserMatrix = buildBrowserMatrix(viewports);
  const unresolved = [
    ...focusDiscovery.unknown,
    ...focusDiscovery.missing,
    ...keyboardDiscovery.unknown,
    ...keyboardDiscovery.missing,
    ...escapeDiscovery.unknown,
    ...escapeDiscovery.missing,
    ...managedOverlay.fixedOverlayDiff
  ];
  return {
    schemaVersion: 1,
    scope: "权威任务第 106 项：键盘、焦点、响应式与视觉表达静态审计",
    sourceDigest: digestFiles(Object.values(FILES)),
    totals: {
      shortcuts: shortcutValidation.shortcuts,
      shortcutBindings: shortcutValidation.bindings,
      shortcutConflicts: shortcutValidation.conflicts.length,
      keyboardListeners: KEYBOARD_CONSUMERS.length,
      keyboardActionConsumers: KEYBOARD_CONSUMERS.filter(item => item.id !== "lazy-preload-input-tracker").length,
      keyboardInputTrackers: KEYBOARD_CONSUMERS.filter(item => item.id === "lazy-preload-input-tracker").length,
      localKeyboardActions: localKeyboardActions.length,
      localKeyboardBindings: localKeyboardActions.reduce((total, item) => total + item.bindings.length, 0),
      focusDefinitions: FOCUS_ENTRIES.length,
      focusEntries: FOCUS_ENTRIES.filter(item => item.included).length,
      focusExcluded: FOCUS_ENTRIES.filter(item => !item.included).length,
      focusSinkDefinitions: FOCUS_ENTRIES.filter(item => item.kind.startsWith("programmatic")).length,
      managedOverlayInstances: managedOverlayInstances.length,
      managedDialogInstances: managedOverlayInstances.filter(item => item.role === "dialog").length,
      dynamicFocusableFactories: FOCUS_ENTRIES.filter(item => item.kind === "natural-tabstop").length,
      escapeConsumers: ESCAPE_CONTRACTS.filter(item => item.included).length,
      escapeExcluded: ESCAPE_CONTRACTS.filter(item => !item.included).length,
      responsiveBreakpoints: discoverMediaBreakpoints().length,
      responsiveContainerQueries: discoverContainerQueries().length,
      layerContracts: LAYER_CONTRACTS.length,
      targetSizeContracts: TARGET_SIZE_CONTRACTS.length,
      stateBannerKinds: stateBannerContracts.length,
      findings: findings.length,
      pureUiFindings: findings.filter(item => item.changeClass === "UI-only").length,
      behaviorFindings: findings.filter(item => item.changeClass === "INT-B").length,
      browserCases: browserMatrix.length,
      unresolved: unresolved.length
    },
    shortcuts: KEYBOARD_SHORTCUTS.map(item => ({
      id: item.id,
      label: item.label,
      group: item.group,
      scope: item.scope,
      when: item.when || "always",
      selector: item.selector || null,
      bindings: item.bindings.map(binding => ({default: shortcutBindingSignature(binding, "default"), mac: shortcutBindingSignature(binding, "mac")})),
      action: item.action,
      evidenceStatus: "E-C",
      browserEvidence: "pending-Q107"
    })),
    keyboardConsumers: KEYBOARD_CONSUMERS,
    localKeyboardActions,
    focusDefinitions: FOCUS_ENTRIES,
    managedOverlayInstances,
    escapeContracts: ESCAPE_CONTRACTS,
    responsive: {
      mediaBreakpoints: discoverMediaBreakpoints(),
      containerQueries: discoverContainerQueries(),
      cssInventory: discoverCssInventory(),
      runtimeGuards: [
        {id: "panel-constrain", result: "PanelManager 按 host 宽高和可见 header 约束面板", sourceRefs: [ref(FILES.panelManager, ["constrainPanelRuntimePosition", "PANEL_MIN_VISIBLE_HEADER_WIDTH"])]},
        {id: "fixed-safe-area", result: "fixed overlay 按 12/64/12/64 安全区与 viewport 重排", sourceRefs: [ref(FILES.overlay, ["placeFixedOverlay", "top: Number(safeArea.top ?? 64)", "bottom: Number(safeArea.bottom ?? 64)"])]},
        {id: "panel-scroll", result: "主面板 body 自身滚动，页面 body 保持 hidden", sourceRefs: [ref(FILES.styles, ["body {", "overflow: hidden", ".floating-panel-body", "overflow: auto"])]}
      ],
      viewports,
      variants: buildVisualVariants()
    },
    visualContracts: {
      layering: LAYER_CONTRACTS,
      targetSizes: TARGET_SIZE_CONTRACTS,
      focusStyles: FOCUS_STYLE_CONTRACTS,
      statusStyles: STATUS_STYLE_CONTRACTS,
      stateBanners: stateBannerContracts
    },
    browserChecklist: buildBrowserChecklist(),
    browserMatrix,
    findings,
    discovery: {
      focusCandidates: focusDiscovery.candidates,
      keyboardCandidates: keyboardDiscovery.candidates,
      escapeLiterals: escapeDiscovery.candidates,
      fixedOverlayInventory: managedOverlay.fixedOverlayInventory,
      fixedOverlaySemanticIds: managedOverlay.fixedOverlaySemanticIds
    },
    coverage: {
      unknownFocusCandidates: focusDiscovery.unknown,
      missingFocusEntries: focusDiscovery.missing,
      unknownKeyboardCandidates: keyboardDiscovery.unknown,
      missingKeyboardConsumers: keyboardDiscovery.missing,
      unknownEscapeLiterals: escapeDiscovery.unknown,
      missingEscapeContracts: escapeDiscovery.missing,
      fixedOverlayDiff: managedOverlay.fixedOverlayDiff,
      unresolved
    }
  };
}

export function writeKeyboardVisualAudit(outputRoot = OUTPUT_ROOT) {
  const report = buildKeyboardVisualAudit();
  mkdirSync(outputRoot, {recursive: true});
  writeFileSync(join(outputRoot, "keyboard-focus-responsive-visual.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(outputRoot, "keyboard-focus-responsive-visual.md"), renderMarkdown(report));
  return report;
}

function buildVisualVariants() {
  return [
    {id: "baseline", fixtureId: "F1", setup: "固定 F1；打开国家主面板并创建一个临时测量对象；layer 检查前由 runner 保存 inline style，再把真实 hover / scale / measurement / 标签代表元素对齐到同一探针点", reset: "恢复 runner 保存的 inline style，删除临时测量，关闭面板并重新载入 F1"},
    {id: "long-zh", fixtureId: "F1", stressText: "东南沿海联合自治特别行政协作发展示范共同体第三十二号超长名称", setup: "先用公开 rename 命令把临时国家、省份、城市和标签改为固定长中文；再由 runner 只在当前 case 临时替换代表性面板标题、按钮、字段标签、select 当前值 / 候选、表格单元格、状态 banner 和 toast 文本", reset: "恢复 runner 保存的 DOM 文本，按本 case 命令数 undo，再核对 F1 摘要"},
    {id: "expanded-options", fixtureId: "F1", setup: "选中真实国家并进入编辑；依次展开政体候选、名称库候选、导入 / 导出菜单和一个动作坞二级 dialog；每次只保留当前 popup，并分别把焦点置于 dialog 根、文本输入和候选项", reset: "逐层 Escape 关闭 popup 与二级面板，再停止编辑并清除 selection"},
    {id: "font-and-states", fixtureId: "F6", setup: "根节点 20px，并由 runner 临时把可见文本的 computed font-size 放大到 150%；构造 selected / editing / disabled / warning / error / empty，逐态单独采样", reset: "移除 runner 临时字体样式并恢复根字体 16px，清除筛选、selection、editing 与错误提示"}
  ];
}

function buildBrowserChecklist() {
  return [
    {id: "viewport-containment", method: "对每个可见 managed panel / fixed overlay 取 rect", pass: "left/top >= 0 且 right/bottom 不超过 CSS viewport 2px；超出部分必须存在可达滚动容器"},
    {id: "document-overflow", method: "记录 documentElement/body scrollWidth/Height 与 overflow", pass: "无意外页面级横向滚动；面板内容滚动不改变 window.scrollX/Y"},
    {id: "text-clipping", method: "遍历可见文本节点宿主，记录 scroll/client 几何与 computed overflow/white-space", pass: "截断必须有 title/aria-label/可展开候选或可滚动承载；否则登记问题，不自动判通过"},
    {id: "popup-containment", method: "展开候选后测量 popper 与 viewport、触发器和面板 rect", pass: "候选不出视口，最长项可完整读取或有明确换行 / tooltip"},
    {id: "layer-order", method: "同时打开编辑面板、hover、scale、measurement 与地图标签，记录 z-index、stacking context 与交叠点 hit-test", pass: "编辑面板 > hover = scale > measurement > 标签；非交叠元素不靠截图猜层级"},
    {id: "spacing-alignment", method: "同组控件记录 rect、gap、baseline/center 偏差", pass: "同一共享组件内主轴偏差 <= 2px；不同比例文字用几何而非肉眼描述"},
    {id: "focus-trace", method: "从真实入口 Tab / Shift+Tab，逐步记录 activeElement、可见性和 rect", pass: "无 tabindex>0、无离屏或被裁切焦点、无无法离开的非模态区域；tabindex=0 动态测量点按自然顺序记录；焦点返回真实入口"},
    {id: "escape-precedence", method: "分别在 panel container、文本输入、展开 select / dropdown 和画布编辑态按一次 Escape", pass: "逐次记录实际消费者、关闭对象、selection/editing 与 activeElement；不把多次 Escape 合并为通过"},
    {id: "focus-indicator", method: "对每个可见可聚焦元素截图前后 computed style 与像素差", pass: "键盘焦点与 hover/默认态有可辨差异；outline:none 项必须有替代证据"},
    {id: "target-size", method: "遍历可见 button/input/select/[role=button]/[tabindex=0]，记录 rect 与上下文", pass: "低于 28×28 的普通点击目标登记；精密 resize、原生 checkbox 和行级代理单独分类，不用平均值掩盖"},
    {id: "state-expression", method: "采样 default/hover/focus/selected/editing/disabled/warning/error 的文字、边框、背景与 aria", pass: "状态至少有一种非仅颜色线索；视觉 active 与 aria 状态相互一致"},
    {id: "health", method: "每 case 记录 console/page/health error 与 gl.getError", pass: "应用自身 console/page error=0，WebGL error=0；已知扩展噪声单列来源"}
  ];
}

function buildBrowserMatrix(viewports) {
  const variants = buildVisualVariants();
  return viewports.flatMap(viewport => variants.map(variant => ({
    caseId: `KV-106-${viewport.id}-${variant.id}`,
    viewportId: viewport.id,
    viewport: viewport.effectiveWidth ? `${viewport.width}x${viewport.height}@${viewport.zoom} => ${viewport.effectiveWidth}x${viewport.effectiveHeight} CSS` : `${viewport.width}x${viewport.height}`,
    rootFontPx: variant.id === "font-and-states" ? 20 : viewport.rootFontPx,
    fixtureId: variant.fixtureId,
    variantId: variant.id,
    setup: variant.setup,
    reset: variant.reset,
    checklistIds: checklistIdsForVariant(variant.id),
    evidenceStatus: "E-C",
    browserEvidence: "pending-Q107"
  })));
}

function checklistIdsForVariant(variantId) {
  const byVariant = {
    baseline: ["viewport-containment", "document-overflow", "layer-order", "spacing-alignment", "focus-trace", "target-size", "health"],
    "long-zh": ["viewport-containment", "document-overflow", "text-clipping", "spacing-alignment", "target-size", "health"],
    "expanded-options": ["viewport-containment", "popup-containment", "focus-trace", "escape-precedence", "focus-indicator", "target-size", "health"],
    "font-and-states": ["viewport-containment", "document-overflow", "text-clipping", "spacing-alignment", "focus-indicator", "target-size", "state-expression", "health"]
  };
  const ids = byVariant[variantId];
  if (!ids) throw new Error(`未知浏览器变体：${variantId}`);
  return ids;
}

function buildManagedOverlayInstances(interactionInventory, complexWorkspaceAudit) {
  const panelInstances = interactionInventory.rows
    .filter(item => item.surfaceId.startsWith("panel:"))
    .map(item => ({instanceId: item.surfaceId, kind: "panel-manager", role: "non-dialog-panel", source: "interaction-inventory"}));
  const fixedOverlayInventory = interactionInventory.rows.filter(item => item.sourceType === "fixed-overlay").map(item => item.surfaceId).sort();
  const actionDockIds = complexWorkspaceAudit.actionDockHosts.map(item => `fixed-overlay:action-dock:${toKebab(item.hostId)}`);
  const fixedOverlaySemanticIds = [...actionDockIds, "fixed-overlay:project-export", "fixed-overlay:heightmap-workbench", "fixed-overlay:tree:culture-panel", "fixed-overlay:tree:religion-panel"].sort();
  const fixedOverlayDiff = symmetricDiff(fixedOverlayInventory, fixedOverlaySemanticIds);
  if (fixedOverlayDiff.length) throw new Error(`fixed overlay inventory / 语义集合漂移：${fixedOverlayDiff.join(",")}`);
  const fixedInstances = fixedOverlayInventory.map(instanceId => ({
    instanceId,
    kind: instanceId.includes(":action-dock:") ? "action-dock" : instanceId.includes(":tree:") ? "tree-dialog" : "fixed-workbench",
    role: "dialog",
    source: "interaction-inventory+semantic-diff"
  }));
  const instances = [...panelInstances, ...fixedInstances];
  if (panelInstances.length !== 28 || fixedInstances.length !== 22 || new Set(instances.map(item => item.instanceId)).size !== 50) {
    throw new Error(`managed overlay 分母漂移：panel=${panelInstances.length}, fixed=${fixedInstances.length}`);
  }
  return {instances, fixedOverlayInventory, fixedOverlaySemanticIds, fixedOverlayDiff};
}

function buildFindings() {
  return [
    finding("IA-106-001", "P1", "同一次 Escape 可能同时关闭 managed overlay 并清除 selection / editing", "INT-B", "OverlayRegistry 先注册 document capture 并执行 preventDefault + stopPropagation；这不会阻止同一 document 节点上后注册的快捷键 listener。快捷键 listener 又不检查 defaultPrevented，所以非 editable target 下同一事件仍可继续执行 selection.cancel。", "建立单一 Escape 仲裁器或让后续消费者尊重 defaultPrevented，并冻结 popup、二级浮层、主面板、画布编辑的逐级优先级。", [ref(FILES.overlay, ["documentRef.addEventListener(\"keydown\"", "event.preventDefault()", "event.stopPropagation()"]), ref(FILES.shortcuts, ["documentRef.addEventListener(\"keydown\"", "if (event.repeat", "resolveShortcut"]), ref(FILES.runtime, ["new PanelManager", "installKeyboardShortcuts"])]),
    finding("IA-106-002", "P1", "Escape 结果随焦点是否位于可编辑控件而改变，内部 popup 还缺应用侧可证明优先级", "INT-B", "editable target 会让全局快捷键提前返回，但先注册的 overlay capture 仍会运行；Element Plus select / dropdown 的 Escape 位于依赖侧并晚于 document capture，静态源码不能证明一次按键只关闭候选。", "把 Escape 从普通快捷键守卫中单列，第107项分别记录 panel container、输入框和展开 popup 的单次实际消费者。", [ref(FILES.shortcuts, ["isEditableShortcutTarget(event.target)", "selection.cancel"]), ref(FILES.overlay, ["event.key !== \"Escape\"", "event.stopPropagation()"])]),
    finding("IA-106-005", "P2", "22 个 role=dialog 的 managed fixed overlay 都不会暂停全局快捷键", "INT-B", "18 个动作坞、项目导出、高度图工作台和 2 个树状展示均声明 role=dialog，但没有 aria-modal=true 或 data-keyboard-exclusive=true；全局快捷键只把后两种属性视为独占。", "逐类决定 dialog 是否非模态；若需独占，补明确属性并验证打开期间保存、视图和面板快捷键不误触。", [ref(FILES.shortcuts, ["hasExclusiveKeyboardModal", "[aria-modal=\"true\"]", "[data-keyboard-exclusive=\"true\"]"]), ref(FILES.actionDock, ["role=\"dialog\"", "useManagedOverlay"]), ref(FILES.control, ["class=\"project-export-panel\"", "role=\"dialog\""]), ref(FILES.height, ["class=\"heightmap-import-workbench\"", "role=\"dialog\""]), ref(FILES.tree, ["role=\"dialog\"", "useManagedOverlay"])])
  ];
}

function discoverFocusEntries() {
  const candidates = collectSourceLines(line => /\.focus\s*\(|setAttribute\(["']tabindex["']|\btabindex\s*=/.test(line));
  return matchCandidates(candidates, FOCUS_ENTRIES, item => item.token, "focusId");
}

function discoverKeyboardConsumers() {
  const candidates = collectSourceLines(line => /addEventListener\s*\(\s*["']key(?:down|up)["']|@key(?:down|up)(?:\.|\s*=)|\bonkey(?:down|up)\b|\[["']pointerdown["'],\s*["']keydown["']/.test(line));
  return matchCandidates(candidates, KEYBOARD_CONSUMERS, item => item.token, "consumerId");
}

function discoverLocalKeyboardActions() {
  const runtime = readText(FILES.runtime);
  const measurementStart = runtime.indexOf("circle.addEventListener(\"keydown\"");
  if (measurementStart < 0) throw new Error("缺少测量点键盘 handler");
  const measurementBlock = runtime.slice(measurementStart, runtime.indexOf("});", measurementStart) + 3);
  const measurementBindings = [...measurementBlock.matchAll(/event\.key\s*!==\s*["']([^"']+)["']/g)].map(item => item[1]);
  const color = readText(FILES.color);
  const colorMatch = color.match(/@keydown\.([\w.]+)\.prevent="commitHexDraft"/);
  if (!colorMatch) throw new Error("缺少颜色草稿键盘提交 directive");
  const colorBindings = colorMatch[1].split(".").filter(Boolean).map(item => item === "enter" ? "Enter" : item);
  return [
    {id: "measurement-handle-delete", bindings: measurementBindings, result: "删除当前测量点", sourceRefs: [ref(FILES.runtime, ["circle.addEventListener(\"keydown\"", ...measurementBindings.map(item => `event.key !== \"${item}\"`)])]},
    {id: "color-field-enter", bindings: colorBindings, result: "提交十六进制颜色草稿", sourceRefs: [ref(FILES.color, [colorMatch[0]])]}
  ];
}

function discoverEscapeLiterals() {
  const candidates = collectSourceLines(line => /["']Escape["']/.test(line));
  const mapped = candidates.map(candidate => {
    let contractId = null;
    if (candidate.file === FILES.overlay && candidate.text.includes("event.key")) contractId = "overlay-escape";
    else if (candidate.file === FILES.shortcuts && candidate.text.includes("selection.cancel")) contractId = "selection-cancel";
    else if (candidate.file === FILES.shortcuts && candidate.text.includes("return \"Esc\"")) contractId = "escape-key-label";
    return {...candidate, contractId};
  });
  const discovered = new Set(mapped.map(item => item.contractId).filter(Boolean));
  return {
    candidates: mapped,
    unknown: mapped.filter(item => !item.contractId),
    missing: ESCAPE_CONTRACTS.filter(item => !discovered.has(item.id)).map(item => item.id)
  };
}

function matchCandidates(candidates, expected, tokenOf, idKey) {
  const mapped = candidates.map(candidate => {
    const matches = expected.filter(item => item.sourceRefs[0].file === candidate.file && candidate.text.includes(tokenOf(item)));
    return {...candidate, [idKey]: matches.length === 1 ? matches[0].id : null, matchCount: matches.length};
  });
  const discovered = new Set(mapped.map(item => item[idKey]).filter(Boolean));
  return {
    candidates: mapped,
    unknown: mapped.filter(item => !item[idKey] || item.matchCount !== 1),
    missing: expected.filter(item => !discovered.has(item.id)).map(item => item.id)
  };
}

function symmetricDiff(left, right) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return [...new Set([...left.filter(item => !rightSet.has(item)), ...right.filter(item => !leftSet.has(item))])].sort();
}

function toKebab(value) {
  return String(value).replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Z])([A-Z][a-z])/g, "$1-$2").toLowerCase();
}

function collectSourceLines(predicate) {
  const files = collectFiles(SRC_ROOT, file => [".js", ".vue"].includes(extname(file)));
  const rows = [];
  for (const absolute of files) {
    const file = relative(REPO_ROOT, absolute).replaceAll("\\", "/");
    const lines = readFileSync(absolute, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      if (predicate(line)) rows.push({file, line: index + 1, text: line.trim()});
    });
  }
  return rows.sort((a, b) => a.file.localeCompare(b.file, "en") || a.line - b.line);
}

function discoverMediaBreakpoints() {
  const styles = readText(FILES.styles);
  return [...styles.matchAll(/@media\s*\(max-width:\s*(\d+)px\)/g)].map(match => ({maxWidthPx: Number(match[1]), source: FILES.styles}));
}

function discoverContainerQueries() {
  const styles = readText(FILES.styles);
  return [...styles.matchAll(/@container\s*\(max-width:\s*(\d+)px\)/g)].map(match => ({maxWidthPx: Number(match[1]), source: FILES.styles}));
}

function discoverCssInventory() {
  const styles = readText(FILES.styles);
  const count = pattern => [...styles.matchAll(pattern)].length;
  return {
    zIndexDeclarations: count(/z-index\s*:/g),
    baseOverflowDeclarations: count(/^\s*overflow\s*:/gm),
    axisOverflowDeclarations: count(/^\s*overflow-[xy]\s*:/gm),
    nowrapDeclarations: count(/white-space\s*:\s*nowrap/g),
    ellipsisDeclarations: count(/text-overflow\s*:\s*ellipsis/g),
    wrapDeclarations: count(/(?:overflow-wrap|word-break)\s*:/g)
  };
}

function discoverStateBannerKinds() {
  const source = readText(FILES.stateBanner);
  const match = source.match(/validator:\s*value\s*=>\s*\[([^\]]+)\]\.includes\(value\)/);
  if (!match) throw new Error("无法发现 UiStateBanner kind 分母");
  return [...match[1].matchAll(/["']([^"']+)["']/g)].map(item => item[1]);
}

function buildStateBannerContracts() {
  const kinds = discoverStateBannerKinds();
  return kinds.map(kind => ({
    kind,
    role: ["error", "orphan"].includes(kind) ? "alert" : "status",
    visualFamily: kind === "preview" ? "purple" : kind === "stale" || kind === "editing" ? "amber" : ["error", "orphan"].includes(kind) ? "red" : "shared-blue-base",
    evidenceStatus: "E-C",
    browserEvidence: "pending-Q107",
    sourceRefs: [
      ref(FILES.stateBanner, [`${kind}:`, `kind === 'error' || kind === 'orphan' ? 'alert' : 'status'`]),
      stateBannerCssRef(kind)
    ]
  }));
}

function stateBannerCssRef(kind) {
  if (kind === "preview") return cssRef(".ui-state-banner.is-preview", ["border-color:", "background:"]);
  if (kind === "stale") return cssRef(".ui-state-banner.is-stale", ["border-color:", "background:"]);
  if (kind === "editing") return cssRef(".is-editing .ui-state-token", ["color:", "background:"]);
  if (["error", "orphan"].includes(kind)) return cssRef(".ui-state-banner.is-error,\n.ui-state-banner.is-orphan", ["border-color:", "background:"]);
  return cssRef(".ui-state-banner", ["border:", "background:"]);
}

function verifyViewportContract(viewports) {
  const normalized = viewports.map(item => [item.id, item.width, item.height, item.effectiveWidth || null, item.effectiveHeight || null, item.rootFontPx]);
  const expected = [["desktop", 1280, 720, null, null, 16], ["narrow", 720, 720, null, null, 16], ["css-stress", 720, 720, 576, 576, 20]];
  if (JSON.stringify(normalized) !== JSON.stringify(expected)) throw new Error(`第101项视口 manifest 漂移：${JSON.stringify(normalized)}`);
}

function verifySourceReferences(items) {
  for (const item of items) {
    for (const sourceRef of item.sourceRefs || []) {
      const source = readText(sourceRef.file);
      const evidenceSource = sourceRef.cssSelector ? cssRuleBlock(source, sourceRef.cssSelector) : source;
      for (const token of sourceRef.tokens || []) {
        if (!evidenceSource.includes(token)) throw new Error(`${item.id || "visual"} 缺少源码证据：${sourceRef.file}${sourceRef.cssSelector ? ` :: ${sourceRef.cssSelector}` : ""} :: ${token}`);
      }
    }
  }
}

function cssRuleBlock(source, selector) {
  const start = source.indexOf(selector);
  if (start < 0) throw new Error(`CSS selector 不存在：${selector}`);
  const open = source.indexOf("{", start);
  if (open < 0) throw new Error(`CSS selector 缺少声明块：${selector}`);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`CSS selector 声明块未闭合：${selector}`);
}

function focusEntry(id, label, kind, file, token, behavior) {
  return {id, label, kind, token, behavior, included: true, evidenceStatus: "E-C", browserEvidence: "pending-Q107", sourceRefs: [ref(file, [token])]};
}

function focusExclusion(id, label, file, token, exclusionReason) {
  return {id, label, kind: "hidden-bridge-exclusion", token, behavior: exclusionReason, included: false, exclusionReason, evidenceStatus: "E-C", browserEvidence: "not-applicable", sourceRefs: [ref(file, [token])]};
}

function keyboardConsumer(id, label, scope, file, token, behavior, evidenceTokens = []) {
  return {id, label, scope, token, behavior, evidenceStatus: "E-C", browserEvidence: "pending-Q107", sourceRefs: [ref(file, [token, ...evidenceTokens])]};
}

function visualContract(id, label, value, file, tokens) {
  const sourceRefs = file === FILES.styles ? visualCssRefs(id) : [ref(file, tokens)];
  return {id, label, value, evidenceStatus: "E-C", browserEvidence: "pending-Q107", sourceRefs};
}

function targetSize(id, selector, declaredSize, context, tokens, extraSourceRefs = []) {
  const ruleSelector = ({
    "panel-header-actions": ".floating-panel-history-button,\n.floating-panel-close",
    "icon-action": ".ui-icon-action.el-button",
    "secondary-close": ".ui-secondary-action-close",
    "table-row-action": ".table-icon-action",
    "table-sort": ".object-table-sort-button",
    "table-resize": ".object-table-column-resize-handle",
    "table-checkbox": ".object-table-selection-hit",
    "empty-action": ".object-table-empty-action"
  })[id];
  if (!ruleSelector) throw new Error(`未知目标尺寸契约：${id}`);
  return {id, selector, declaredSize, context, evidenceStatus: "E-C", browserEvidence: "pending-Q107", sourceRefs: [cssRef(ruleSelector, tokens), ...extraSourceRefs]};
}

function finding(id, severity, title, changeClass, evidence, recommendation, sourceRefs) {
  return {id, severity, title, changeClass, intB: changeClass === "INT-B", confidence: id === "IA-106-002" ? "medium" : "high", evidence, recommendation, evidenceStatus: "E-C", browserEvidence: "pending-Q107", sourceRefs};
}

function ref(file, tokens) {
  return {file, tokens};
}

function cssRef(cssSelector, tokens) {
  return {file: FILES.styles, cssSelector, tokens};
}

function visualCssRefs(id) {
  const refs = ({
    "selection-marker": [cssRef(".selection-marker", ["z-index: 8"])],
    "map-toolbar": [cssRef(".map-toolbar", ["z-index: 6"])],
    "hover-and-scale": [cssRef("\n.hover-overlay {", ["z-index: 5"]), cssRef("\n.map-scale-bar {", ["z-index: 5"])],
    "marker-icons": [cssRef(".marker-map-icon", ["z-index: 5"])],
    measurement: [cssRef("\n\n.measurement-overlay {", ["z-index: 4"])],
    "city-custom-military-labels": [cssRef("\n.city-label {", ["z-index: 3"]), cssRef("\n\n.custom-label {", ["z-index: 3"]), cssRef(".military-map-icon", ["z-index: 2"])],
    "political-labels": [cssRef("\n\n.state-label,\n.province-label {", ["z-index: 2"]), cssRef(".province-label.collision-fallback", ["z-index: 1"])],
    "shared-focus-ring": [
      cssRef(":root", ["--ui-focus-color", "--ui-focus-width", "--ui-focus-offset", "--ui-focus-shadow"]),
      cssRef(":is(.map-toolbar .primary-action, .map-toolbar .secondary-action, .map-toolbar-edge-trigger):focus-visible", [
        ".ui-icon-action.el-button:focus-visible",
        ".object-table-selection-checkbox:focus-visible",
        ".ui-secondary-action-close:focus-visible",
        ".object-table-column-resize-handle:focus-visible",
        ".object-table-sort-button:focus-visible",
        ".object-table-empty-action:focus-visible",
        ".wind-band-button.el-button:focus-visible",
        ".inheritance-tree-open.el-button:focus-visible",
        "outline: var(--ui-focus-width) solid var(--ui-focus-color)",
        "outline-offset: var(--ui-focus-offset)",
        "box-shadow: var(--ui-focus-shadow)"
      ])
    ],
    "field-focus": [cssRef(".el-input.is-focus .el-input__wrapper,\n.el-input__wrapper:focus-within,\n.el-input__wrapper.is-focus", ["#d7a84f"]), cssRef(".el-textarea__inner:focus", ["#d7a84f"])],
    error: [cssRef(".climate-downstream-error", ["color: #ff9b93"])],
    "warning-progress": [cssRef(".climate-downstream-progress", ["color: #ffd37a"])],
    applied: [cssRef(".climate-downstream-result.is-applied", ["rgba(94, 197, 143, 0.34)"])]
  })[id];
  if (!refs) throw new Error(`缺少 selector 级视觉证据映射：${id}`);
  return refs;
}

function readText(file) {
  return readFileSync(join(REPO_ROOT, file), "utf8");
}

function collectFiles(root, include) {
  const files = [];
  for (const name of readdirSync(root)) {
    const file = join(root, name);
    const stats = statSync(file);
    if (stats.isDirectory()) files.push(...collectFiles(file, include));
    else if (!include || include(file)) files.push(file);
  }
  return files;
}

function digestFiles(files) {
  const hash = createHash("sha256");
  for (const file of [...new Set(files)].sort()) {
    hash.update(file);
    hash.update("\0");
    hash.update(readText(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function renderMarkdown(report) {
  const lines = [
    "# 键盘、焦点、响应式与视觉表达审计", "",
    `- 范围：${report.scope}`,
    `- 源码摘要：\`${report.sourceDigest}\``,
    `- 快捷键：${report.totals.shortcuts} 条 / ${report.totals.shortcutBindings} 个 binding / 冲突 ${report.totals.shortcutConflicts}；注册表外控件动作 ${report.totals.localKeyboardActions} 条 / ${report.totals.localKeyboardBindings} 个 binding；键盘 listener ${report.totals.keyboardListeners}（动作消费者 ${report.totals.keyboardActionConsumers} / 输入时序 tracker ${report.totals.keyboardInputTrackers}）；Esc 消费者 ${report.totals.escapeConsumers}。`,
    `- 焦点：源码定义 ${report.totals.focusDefinitions}（纳入 ${report.totals.focusEntries} / 排除桥接 ${report.totals.focusExcluded}）；显式 focus 落点 ${report.totals.focusSinkDefinitions}，managed overlay 实例 ${report.totals.managedOverlayInstances}（role=dialog ${report.totals.managedDialogInstances}），动态 tabindex=0 工厂 ${report.totals.dynamicFocusableFactories}。`,
    `- 响应式：${report.totals.responsiveBreakpoints} 个 CSS media breakpoint / ${report.totals.responsiveContainerQueries} 个 container query；${report.totals.browserCases} 个浏览器待验 case；未知 / 未分类 ${report.totals.unresolved}。`, "",
    "## 静态问题", "", "| 编号 | 严重度 | 类型 / 信心 | 结论 | 证据 | 建议 |", "|---|---|---|---|---|---|",
    ...report.findings.map(item => `| ${item.id} | ${item.severity} | ${item.changeClass} / ${item.confidence} | ${escapeCell(item.title)} | ${escapeCell(item.evidence)} | ${escapeCell(item.recommendation)} |`), "",
    "## 快捷键与消费者", "", "| ID | 标签 | when | binding | 结果 |", "|---|---|---|---|---|",
    ...report.shortcuts.map(item => `| ${item.id} | ${item.label} | ${item.when} | ${item.bindings.map(binding => binding.default).join(" / ")} | ${escapeCell(item.action.type === "api-sequence" ? item.action.paths.join(" -> ") : item.action.path || item.action.handler || item.action.layer)} |`), "",
    "### 项目内键盘监听边界", "", "| 消费者 | 作用域 | 行为 |", "|---|---|---|",
    ...report.keyboardConsumers.map(item => `| ${item.id} | ${item.scope} | ${escapeCell(item.behavior)} |`), "",
    "### Escape 优先级", "", "| ID | 纳入 | 优先级 | 可编辑目标 | 结果 / 排除理由 |", "|---|---:|---|---|---|",
    ...report.escapeContracts.map(item => `| ${item.id} | ${item.included ? "是" : "否"} | ${item.priority || "-"} | ${item.editableTarget || "-"} | ${escapeCell(item.result || item.exclusionReason)} |`), "",
    "## 焦点入口", "", "| ID | 类型 | 行为 |", "|---|---|---|",
    ...report.focusDefinitions.map(item => `| ${item.id} | ${item.included ? item.kind : "排除"} | ${escapeCell(item.behavior)} |`), "",
    "## 响应式与视觉静态契约", "", `- CSS media breakpoint：${report.responsive.mediaBreakpoints.map(item => `${item.maxWidthPx}px`).join("、")}；container query：${report.responsive.containerQueries.map(item => `${item.maxWidthPx}px`).join("、")}；面板与 fixed overlay 另有运行时几何约束。`,
    `- CSS 声明分母：z-index ${report.responsive.cssInventory.zIndexDeclarations}；overflow ${report.responsive.cssInventory.baseOverflowDeclarations} + axis ${report.responsive.cssInventory.axisOverflowDeclarations}；nowrap ${report.responsive.cssInventory.nowrapDeclarations}；ellipsis ${report.responsive.cssInventory.ellipsisDeclarations}；wrap / word-break ${report.responsive.cssInventory.wrapDeclarations}。`,
    `- 层级：${report.visualContracts.layering.map(item => `${item.label}=${item.value}`).join("；")}。`,
    `- 目标尺寸样本：${report.visualContracts.targetSizes.map(item => `${item.selector} ${item.declaredSize}`).join("；")}。`,
    `- 状态语义：${report.visualContracts.stateBanners.map(item => `${item.kind}=${item.visualFamily}/${item.role}`).join("；")}；其它过程色样本：${report.visualContracts.statusStyles.map(item => `${item.label}=${item.value}`).join("；")}。`, "",
    "## 第 107 项统一浏览器矩阵", "", "| case | viewport | 夹具 / 变体 | 根字体 | 复位 |", "|---|---|---|---:|---|",
    ...report.browserMatrix.map(item => `| ${item.caseId} | ${item.viewport} | ${item.fixtureId} / ${item.variantId} | ${item.rootFontPx}px | ${escapeCell(item.reset)} |`), "",
    "### 每档视口四个变体合并后的统一检查表", "", "| 检查 | 方法 | 通过口径 |", "|---|---|---|",
    ...report.browserChecklist.map(item => `| ${item.id} | ${escapeCell(item.method)} | ${escapeCell(item.pass)} |`), "",
    "> 本报告只固化 E-C 与第107项浏览器步骤；未启动浏览器，也未修改正式应用的键盘、焦点、响应式或视觉行为。", ""
  ];
  return `${lines.join("\n")}\n`;
}

function escapeCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function checkGenerated(report) {
  const jsonPath = join(OUTPUT_ROOT, "keyboard-focus-responsive-visual.json");
  const markdownPath = join(OUTPUT_ROOT, "keyboard-focus-responsive-visual.md");
  const expectedJson = `${JSON.stringify(report, null, 2)}\n`;
  const expectedMarkdown = renderMarkdown(report);
  if (readFileSync(jsonPath, "utf8") !== expectedJson || readFileSync(markdownPath, "utf8") !== expectedMarkdown) throw new Error("键盘与视觉审计报告已陈旧，请先运行生成模式");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const report = buildKeyboardVisualAudit();
  if (check) checkGenerated(report);
  else writeKeyboardVisualAudit();
  console.log(JSON.stringify(report.totals, null, 2));
}
