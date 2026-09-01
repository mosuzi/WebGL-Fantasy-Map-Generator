import {createHash} from "node:crypto";
import {mkdirSync, readFileSync, readdirSync, writeFileSync} from "node:fs";
import {dirname, join, relative, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {buildInteractionInventory} from "./webgl-generator-interaction-surface-inventory.mjs";

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TOOL_DIR, "..");
const OUTPUT_ROOT = join(REPO_ROOT, "docs", "generated", "interaction-audit");

const FILES = Object.freeze({
  control: "app/webgl-generator/src/ui/vue/components/ControlPanel.vue",
  main: "app/webgl-generator/src/main.js",
  toolbar: "app/webgl-generator/src/ui/vue/components/MapToolbar.vue",
  panelBindings: "app/webgl-generator/src/ui/panel.js",
  panelManager: "app/webgl-generator/src/ui/panel-manager.js",
  runtime: "app/webgl-generator/src/runtime/app.js",
  browserStorage: "app/webgl-generator/src/runtime/browser-map-storage.js",
  history: "app/webgl-generator/src/runtime/edit-history.js",
  renderer: "app/webgl-generator/src/renderer/placeholder-renderer.js",
  viewportInput: "app/webgl-generator/src/renderer/viewport-input-controller.js",
  shortcuts: "app/webgl-generator/src/runtime/keyboard-shortcuts.js",
  selectionPolicy: "app/webgl-generator/src/runtime/selection-panel-policy.js",
  cityVue: "app/webgl-generator/src/ui/vue/components/CityPanel.vue",
  cityWrapper: "app/webgl-generator/src/ui/panels/city-panel.js",
  objectTable: "app/webgl-generator/src/ui/vue/components/base/UiObjectTable.vue",
  filterInput: "app/webgl-generator/src/ui/vue/components/base/UiFilterInput.vue",
  textEdit: "app/webgl-generator/src/ui/vue/components/base/UiTextEditField.vue",
  objectDetailsVue: "app/webgl-generator/src/ui/vue/components/ObjectDetailsPanel.vue",
  objectDetailsWrapper: "app/webgl-generator/src/ui/panels/object-details-panel.js",
  editCommands: "app/webgl-generator/src/runtime/object-edit-commands.js"
});

const DECISIONS = Object.freeze({
  loading: "docs/task-notes/initialization-loading-flow.md",
  selection: "docs/task-notes/selection-panel-policy.md",
  actions: "docs/task-notes/action-entry-and-icon-vocabulary.md",
  commands: "docs/task-notes/edit-command-contract.md",
  exports: "docs/task-notes/export-capability-matrix.md",
  dataCompatibility: "docs/task-notes/api-data-compatibility-matrix.md",
  keyboard: "docs/task-notes/keyboard-shortcuts.md",
  panels: "docs/task-notes/panel-layout-overlay-performance-plan.md",
  feedback: "docs/task-notes/ui-terminology-and-state-feedback.md",
  audit: "docs/task-notes/interaction-usability-audit-plan.md"
});

export function buildCoreFlowAudit() {
  const inventory = buildInteractionInventory();
  const includedSurfaceIds = new Set(inventory.rows.filter(row => row.included).map(row => row.surfaceId));
  const flows = definitions().map(item => verifyFlow(item, includedSurfaceIds));
  const findings = buildStaticFindings().map(verifyFinding);
  const unknownResults = flows.filter(item => item.evidenceStatus !== "E-C" || !item.expectedResult || !item.historyBehavior || !item.feedback).length;
  const missingDecisions = flows.filter(item => !item.existingDecisions.length).length;
  const sourceFiles = [...new Set([
    ...flows.flatMap(item => item.chain.map(step => step.file)),
    ...flows.flatMap(item => item.visibleActions.flatMap(action => action.sourceRefs.map(ref => ref.file))),
    ...findings.flatMap(item => item.sourceRefs.map(ref => ref.file))
  ])].sort();
  return {
    schemaVersion: 1,
    scope: "权威任务第 102 项：高频核心任务闭环静态审计",
    sourceDigest: digestFiles(sourceFiles),
    totals: {
      flows: flows.length,
      visibleActions: flows.reduce((sum, item) => sum + item.visibleActions.length, 0),
      codeConfirmed: flows.filter(item => item.evidenceStatus === "E-C").length,
      browserPending: flows.filter(item => item.browserEvidence === "pending-Q107").length,
      unknownResults,
      missingDecisions,
      findings: findings.length,
      unresolvedSurfaceRefs: flows.reduce((sum, item) => sum + item.surfaceIds.filter(id => !includedSurfaceIds.has(id)).length, 0)
    },
    mentalModelBasis: [
      "用户已明确要求按人类任务闭环审计交互",
      "项目已批准的加载、selection、动作入口、编辑命令和导出契约",
      "当前产品内共享组件与 runtime action 的一致行为"
    ],
    findings,
    flows
  };
}

export function writeCoreFlowAudit(outputRoot = OUTPUT_ROOT) {
  const report = buildCoreFlowAudit();
  mkdirSync(outputRoot, {recursive: true});
  writeFileSync(join(outputRoot, "core-task-flows.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(outputRoot, "core-task-flows.md"), renderMarkdown(report));
  return report;
}

function definitions() {
  return [
    flow("HF-01", "启动时恢复浏览器地图，否则生成新地图", {
      surfaces: ["canvas:generation-feedback", "panel:generation-panel"],
      actions: [visibleAction("startup", "打开应用", [sourceRef(FILES.main, ["createGeneratorApp(document, {healthMonitor})", "startupFailureMessage(error)"])])],
      entry: "打开应用",
      preconditions: "浏览器可能有、没有或持有损坏存档",
      chain: [
        step("启动编排", FILES.runtime, ["restoreBrowserStoredMapOrGenerate", "restoreBrowserMap({confirm: true, startup: true, toast: false"]),
        step("恢复动作", FILES.runtime, ["restoreMapFromBrowserStorageViaApi", "正在读取浏览器保存的地图"]),
        step("运行时接入", FILES.runtime, ["loadMapIntoRuntime", "state.editHistory.clear()"]),
        step("反馈", FILES.runtime, ["已恢复浏览器保存的地图", "浏览器地图恢复失败，原存档已保留"])
      ],
      expectedResult: "有效存档替换当前地图；缺失或损坏存档进入固定的新图生成路径",
      history: "地图替换时清空编辑历史",
      feedback: "加载气泡、文件状态和可选 toast",
      exitRecovery: "损坏存档保留在 LocalStorage，当前会生成临时地图供继续使用",
      firstUse: "启动过程自动完成，状态文案应解释当前阶段",
      expertUse: "无需额外确认启动恢复；显式 API 恢复仍要求 confirm",
      decisions: [DECISIONS.loading, DECISIONS.dataCompatibility, DECISIONS.feedback, DECISIONS.audit],
      browser: ["F0 有效存档恢复", "F0 无存档生成", "F4 损坏存档保留后生成临时地图"]
    }),
    flow("HF-02", "生成并替换当前地图", {
      surfaces: ["panel:generation-panel", "canvas:generation-feedback"],
      actions: [
        visibleAction("generate-button", "生成地图", [sourceRef(FILES.control, ["id=\"generate-map\""])]),
        visibleAction("random-seed-button", "换种子并立即生成", [sourceRef(FILES.control, ["id=\"random-seed\""]), sourceRef(FILES.panelBindings, ["handlers.onRandomSeed"])])
      ],
      entry: "控制面板“生成地图”按钮",
      preconditions: "生成参数可读取；替换现有地图必须显式确认",
      chain: [
        step("入口", FILES.control, ["id=\"generate-map\"", "生成地图"]),
        step("DOM 接线", FILES.panelBindings, ["getElementById(\"generate-map\").addEventListener(\"click\", handlers.onGenerate)"]),
        step("runtime handler", FILES.runtime, ["onGenerate: () => requestGenerate", "function requestGenerate"]),
        step("公开动作", FILES.runtime, ["generate.newMap", "generateNewMapViaApi", "confirm: true"]),
        step("事务", FILES.runtime, ["const runMapReplace", "captureMapReplaceSnapshot", "restoreMapReplaceSnapshot"]),
        step("结果", FILES.runtime, ["generateMapViaApi", "effects: [\"replace-map\", \"clear-history\""]),
        step("失败反馈", FILES.runtime, ["reportGenerateError(documentRef, error)"])
      ],
      expectedResult: "以当前选项生成新地图并原子替换 runtime 地图",
      history: "替换后清空编辑历史，不写普通编辑命令",
      feedback: "生成中状态、分阶段 loading、完成 toast 或错误状态",
      exitRecovery: "新请求取代旧请求；失败关闭 loading 并保留错误反馈",
      firstUse: "主按钮名称直接对应用户目标",
      expertUse: "可通过稳定 API 提供参数与显式 confirm",
      decisions: [DECISIONS.loading, DECISIONS.actions, DECISIONS.audit],
      browser: ["F1 从控制面板生成", "F2 长任务阶段反馈"]
    }),
    flow("HF-03", "保存完整地图到本地文件", {
      surfaces: ["panel:generation-panel", "fixed-overlay:project-export"],
      actions: [visibleAction("save-local", "保存到本地", [sourceRef(FILES.control, ["command=\"local-file\""]), sourceRef(FILES.panelBindings, ["target === \"local-file\""])])],
      entry: "项目“保存”下拉中的“保存到本地”",
      preconditions: "地图已加载",
      chain: [
        step("入口", FILES.control, ["command=\"local-file\"", "保存到本地"]),
        step("Vue 事件", FILES.control, ["handleSaveCommand(target)", "project-map-save"]),
        step("DOM 接线", FILES.panelBindings, ["target === \"local-file\"", "handlers.onSaveLocalFile"]),
        step("runtime handler", FILES.runtime, ["onSaveLocalFile: () => {", "saveMapToLocalFile", "runtimeActions.data.exportCompressedAll"]),
        step("序列化与下载", FILES.runtime, ["exportAllMapData(state, documentRef", "download: true", "includeText: false"]),
        step("反馈", FILES.runtime, ["正在保存地图到本地", "地图已保存到本地文件"])
      ],
      expectedResult: "下载完整地图文件",
      history: "只读导出，不写历史",
      feedback: "文件状态显示进行中、成功或错误",
      exitRecovery: "失败由统一 file action error 状态呈现，地图不变",
      firstUse: "项目保存入口与目标位置一起呈现",
      expertUse: "完整地图格式可用于往返和备份",
      decisions: [DECISIONS.dataCompatibility, DECISIONS.exports, DECISIONS.feedback, DECISIONS.audit],
      browser: ["F1 保存本地文件并核对下载"]
    }),
    flow("HF-04", "保存完整地图到浏览器", {
      surfaces: ["panel:generation-panel"],
      actions: [
        visibleAction("save-browser-menu", "保存到浏览器", [sourceRef(FILES.control, ["id=\"save-browser-storage\""]), sourceRef(FILES.panelBindings, ["target === \"browser-storage\""])]),
        visibleAction("save-browser-shortcut", "Ctrl/Cmd+S", [sourceRef(FILES.shortcuts, ["file.save-browser", "binding(\"KeyS\", {mod: true})"])])
      ],
      entry: "项目“保存”下拉中的“保存到浏览器”或 Ctrl+S",
      preconditions: "地图已加载且 LocalStorage 可用",
      chain: [
        step("入口", FILES.control, ["id=\"save-browser-storage\"", "保存到浏览器"]),
        step("快捷键", FILES.shortcuts, ["file.save-browser", "data.saveBrowserMap"]),
        step("DOM 接线", FILES.panelBindings, ["target === \"browser-storage\"", "handlers.onSaveBrowserStorage"]),
        step("runtime handler", FILES.runtime, ["onSaveBrowserStorage", "saveMapToBrowserStorage"]),
        step("编码与持久化", FILES.browserStorage, ["writeBrowserMapStorage", "storage.setItem(BROWSER_MAP_STORAGE_KEY", "storageKey: BROWSER_MAP_STORAGE_KEY"]),
        step("反馈", FILES.runtime, ["showMapToast(documentRef, \"保存成功\")", "BROWSER_STORAGE_SAVE_ERROR_TOAST_DURATION_MS"])
      ],
      expectedResult: "把当前完整地图编码写入固定浏览器存储键",
      history: "保存不改变地图和编辑历史",
      feedback: "页面下方 toast 提示成功；失败显示原因并延长提示，控制面板不新增保存文案",
      exitRecovery: "存储失败返回明确错误；当前地图保持",
      firstUse: "入口明确区分浏览器与本地文件",
      expertUse: "Ctrl+S 复用相同 runtime action",
      decisions: [DECISIONS.loading, DECISIONS.dataCompatibility, DECISIONS.exports, DECISIONS.keyboard, DECISIONS.feedback, DECISIONS.audit],
      browser: ["F1 菜单保存", "F1 Ctrl+S 保存", "F0 重新载入恢复"]
    }),
    flow("HF-05", "导入完整地图并替换当前地图", {
      surfaces: ["panel:generation-panel", "canvas:generation-feedback"],
      actions: [
        visibleAction("import-map", "导入完整地图", [sourceRef(FILES.control, ["id=\"import-map-file\""]), sourceRef(FILES.panelBindings, ["handlers.onImportMapData"]) ]),
        visibleAction("import-geo", "导入 GEO 数据", [sourceRef(FILES.control, ["id=\"import-geo-file\""]), sourceRef(FILES.panelBindings, ["handlers.onImportGeoData"])], {
          variant: "edit-command-not-map-replace",
          result: "按 GEO 类型导入地形或测量数据，不沿用完整地图替换语义",
          historyEffect: "通过导入编辑命令写入可撤销历史",
          feedback: "成功摘要或结构化 GEO 导入诊断",
          recovery: "解析或预检失败不写命令，当前地图保持"
        })
      ],
      entry: "项目“打开地图”文件输入",
      preconditions: "选择 JSON / gzip 完整地图；替换要求确认",
      chain: [
        step("入口", FILES.control, ["id=\"import-map-file\"", "<span>导入</span>"]),
        step("DOM 接线", FILES.panelBindings, ["getElementById(\"import-map-file\")", "handlers.onImportMapData"]),
        step("runtime handler", FILES.runtime, ["onImportMapData: file => importMapData", "runtimeActions.data.importMap"]),
        step("解析与替换", FILES.runtime, ["async function importMapData", "importParsedMapDocumentViaApi"]),
        step("事务回滚", FILES.runtime, ["runMapReplace", "restoreMapReplaceSnapshot"]),
        step("历史与选择", FILES.runtime, ["state.editHistory.clear()", "state.selectionStore.clear()"]),
        step("反馈与诊断", FILES.runtime, ["reportMapImportError", "正在${sourceLabel}导入地图数据", "导入地图数据：seed"])
      ],
      expectedResult: "验证、迁移并替换当前地图，刷新 renderer、对象索引和面板",
      history: "地图替换清空旧编辑历史",
      feedback: "分阶段 loading、成功 seed 或结构化导入诊断",
      exitRecovery: "解析 / 迁移失败保留当前地图并提供诊断导出",
      firstUse: "入口位于项目文件区，接受格式在文件选择器中声明",
      expertUse: "v1 静态迁移与当前 v2 往返分开验证",
      decisions: [DECISIONS.loading, DECISIONS.dataCompatibility, DECISIONS.exports, DECISIONS.feedback, DECISIONS.audit],
      browser: ["F3 当前 v2 往返", "F4 unsupported-version 失败恢复"]
    }),
    flow("HF-06", "快速导出 PNG", {
      surfaces: ["fixed-overlay:project-export", "canvas:map-overlay"],
      actions: [
        visibleAction("quick-export-png", "图片", [sourceRef(FILES.control, ["id=\"export-map-image\""]), sourceRef(FILES.panelBindings, ["handlers.onExportImage"]) ]),
        visibleAction("quick-export-map", "地图数据", [sourceRef(FILES.control, ["id=\"export-map-data\""]), sourceRef(FILES.panelBindings, ["handlers.onExportMapData"]) ], {
          result: "下载完整地图 JSON 数据",
          historyEffect: "只读导出，不写历史",
          feedback: "显示导出文件名、大小与错误状态",
          recovery: "失败时地图与导出选项保持"
        }),
        visibleAction("quick-export-png-shortcut", "Ctrl/Cmd+Shift+E", [sourceRef(FILES.shortcuts, ["file.export-png", "binding(\"KeyE\", {mod: true, shift: true})"])])
      ],
      entry: "导出浮层“图片”按钮或 Ctrl+Shift+E",
      preconditions: "地图已加载；读取倍率、overlay 与透明背景选项",
      chain: [
        step("入口", FILES.control, ["id=\"export-map-image\"", "图片"]),
        step("快捷键", FILES.shortcuts, ["file.export-png", "data.exportPNG"]),
        step("DOM 接线", FILES.panelBindings, ["getElementById(\"export-map-image\")", "handlers.onExportImage"]),
        step("runtime handler", FILES.runtime, ["onExportImage: () => exportMapImage", "runtimeActions.data.exportPNG"]),
        step("导出与下载", FILES.runtime, ["exportAction({download: true", "图片已导出"]),
        step("地图数据变体", FILES.runtime, ["function exportMapData", "download: true", "地图数据已导出"]),
        step("反馈", FILES.runtime, ["正在导出图片", "图片已导出"])
      ],
      expectedResult: "下载与当前画布和所选 overlay 语义一致的 PNG",
      history: "只读导出，不写历史",
      feedback: "显示尺寸、倍率、overlay、背景与字节数",
      exitRecovery: "失败时地图和导出选项保持",
      firstUse: "导出浮层按结果类型组织",
      expertUse: "快捷键复用同一公开动作",
      decisions: [DECISIONS.exports, DECISIONS.audit],
      browser: ["F1 默认 PNG", "F1 快捷键 PNG"]
    }),
    flow("HF-07", "适配地图视图", {
      surfaces: ["resident:map-toolbar", "canvas:map-scale-bar"],
      actions: [
        visibleAction("fit-view-button", "适配视图", [sourceRef(FILES.toolbar, ["id=\"fit-view\""]), sourceRef(FILES.panelBindings, ["handlers.onFitView"]) ]),
        visibleAction("fit-view-shortcut", "Shift+Home", [sourceRef(FILES.shortcuts, ["selection.fit-view", "binding(\"Home\", {shift: true})"])])
      ],
      entry: "地图工具栏“适配视图”或 Shift+Home",
      preconditions: "地图已加载",
      chain: [
        step("入口", FILES.toolbar, ["id=\"fit-view\"", "适配视图"]),
        step("DOM 接线", FILES.panelBindings, ["getElementById(\"fit-view\").addEventListener(\"click\", handlers.onFitView)"]),
        step("快捷键", FILES.shortcuts, ["selection.fit-view", "layers.fitView"]),
        step("runtime action", FILES.runtime, ["onFitView: () => runtimeActions.layers.fitView", "fitRuntimeView"]),
        step("renderer", FILES.renderer, ["fitToView({quick", "this.camera.scale = 1"])
      ],
      expectedResult: "相机恢复适配地图并同步 overlay、比例尺与运行时摘要",
      history: "视图变化不写编辑历史",
      feedback: "画布、overlay 与比例尺共同变化",
      exitRecovery: "重复执行幂等；不改变 selection",
      firstUse: "常驻按钮使用地图软件常见名称",
      expertUse: "Shift+Home 复用相同 action",
      decisions: [DECISIONS.actions, DECISIONS.keyboard, DECISIONS.audit],
      browser: ["F1 从偏移缩放状态适配视图"]
    }),
    flow("HF-08", "平移和缩放地图", {
      surfaces: ["canvas:map-canvas", "canvas:map-overlay", "canvas:map-scale-bar"],
      actions: [
        visibleAction("pan-middle", "中键拖动平移", [sourceRef(FILES.viewportInput, ["event.button === 1 || event.button === 2", "return \"pan\""])]),
        visibleAction("pan-right", "右键拖动平移", [sourceRef(FILES.viewportInput, ["event.button === 1 || event.button === 2", "return \"pan\""])]),
        visibleAction("pan-primary", "空格加主键或触屏拖动平移", [sourceRef(FILES.viewportInput, ["spacePanActive ? \"pan\" : \"select\"", "pointer.mode = \"pan\""])]),
        visibleAction("pan-wheel", "触摸板滚动平移", [sourceRef(FILES.viewportInput, ["classifyViewportWheelIntent", "panCamera(-delta.x, -delta.y"])]),
        visibleAction("zoom-wheel", "滚轮或触摸板捏合锚点缩放", [sourceRef(FILES.viewportInput, ["zoomCameraAtClientPoint", "source: event.ctrlKey ? \"pinch\" : \"wheel\""])])
      ],
      entry: "中键 / 右键拖动、空格加主键、触屏拖动或滚轮 / 触摸板",
      preconditions: "指针位于画布且没有更高优先级工具消费事件",
      chain: [
        step("输入", FILES.viewportInput, ["[canvas, \"pointerdown\", handlePointerDown]", "[canvas, \"pointermove\", handlePointerMove]"]),
        step("平移", FILES.viewportInput, ["camera.offsetX +=", "camera.offsetY -="]),
        step("缩放", FILES.viewportInput, ["classifyViewportWheelIntent", "zoomCameraAtClientPoint"]),
        step("结束与取消", FILES.viewportInput, ["handlePointerUp", "handlePointerCancel", "handleLostPointerCapture"]),
        step("重绘", FILES.viewportInput, ["onChange({kind: \"pan\"", "onChange({kind: \"zoom\""])
      ],
      expectedResult: "相机变换并同步 WebGL 与 HTML / SVG overlay",
      history: "导航不写编辑历史",
      feedback: "画面位置、缩放和比例尺即时更新",
      exitRecovery: "pointerup / pointercancel 结束拖动；滚轮保持鼠标锚点",
      firstUse: "遵循桌面地图的拖动与滚轮习惯",
      expertUse: "连续导航不改变业务 selection",
      decisions: [DECISIONS.audit],
      browser: ["F1 中键平移", "F1 右键平移", "F1 滚轮锚点缩放"]
    }),
    flow("HF-09", "在地图选择对象并显示对象详情", {
      surfaces: ["canvas:map-canvas", "panel:object-details"],
      actions: [
        visibleAction("canvas-select", "画布左键选择", [sourceRef(FILES.renderer, ["this.onSelect(this.pickClientPoint"])]),
        visibleAction("details-locate", "对象详情：定位", [
          sourceRef(FILES.objectDetailsVue, ["@click=\"callbacks.onLocate\""]),
          sourceRef(FILES.objectDetailsWrapper, ["onLocate: () => callbacks.onLocate"]),
          sourceRef(FILES.runtime, ["onLocate:", "locateObjectFromDetails"], {anchor: "createObjectDetailsPanel(documentRef", end: "next-panel-factory"}),
          sourceRef(FILES.runtime, ["const locateAndSelectObject", "无法定位${kindLabel}", "return located"])
        ], {
          result: "相机定位当前对象并保持统一 selection",
          historyEffect: "不写历史",
          feedback: "相机移动与地图高亮；失败时显示领域可读状态",
          recovery: "定位失败返回 false，地图与 selection 不变，并显示稳定可见反馈"
        }),
        visibleAction("details-edit", "对象详情：进入编辑", [
          sourceRef(FILES.objectDetailsVue, ["editAction", "callbacks.onEdit?.()"]),
          sourceRef(FILES.objectDetailsWrapper, ["onEdit: () => callbacks.onEdit"]),
          sourceRef(FILES.runtime, ["describeObjectDetailsActions", "OBJECT_DETAILS_EDIT_MODE.INLINE_NAME", "openObjectEditorFromDetails"], {anchor: "createObjectDetailsPanel(documentRef", end: "next-panel-factory"})
        ], {
          result: "按显式能力进入行内名称编辑或真实领域面板；无真实动作时隐藏入口",
          historyEffect: "进入编辑入口本身不写历史，领域应用动作按各自命令写历史",
          feedback: "按钮直接说明将打开的领域编辑器；行内名称编辑可切换退出",
          recovery: "行内编辑可退出或关闭详情；领域面板按自身取消 / 关闭契约清理"
        }),
        visibleAction("details-cancel-edit", "对象详情：退出行内名称编辑", [
          sourceRef(FILES.objectDetailsVue, ["callbacks.onCancelEdit?.()"]),
          sourceRef(FILES.objectDetailsWrapper, ["onCancelEdit: () => callbacks.onCancelEdit"]),
          sourceRef(FILES.runtime, ["onCancelEdit:", "stopObjectEditing()"], {anchor: "createObjectDetailsPanel(documentRef", end: "next-panel-factory"})
        ], {
          result: "清除 editingObject 并解除交互锁",
          historyEffect: "退出编辑态本身不写历史",
          feedback: "编辑控件收起且按钮恢复进入编辑",
          recovery: "重复退出返回 false，不改变地图"
        }),
        visibleAction("details-rename", "对象详情：手工重命名", [
          sourceRef(FILES.objectDetailsVue, ["@apply=\"callbacks.onRename\""]),
          sourceRef(FILES.objectDetailsWrapper, ["onRename: name => callbacks.onRename"]),
          sourceRef(FILES.runtime, ["onRename:", "createRenameObjectCommand", "executeEditCommand"], {anchor: "createObjectDetailsPanel(documentRef", end: "next-panel-factory"})
        ], {
          result: "支持对象名称更新并刷新标签与对象面板",
          historyEffect: "成功执行一条可撤销重命名命令",
          feedback: "字段、地图标签、列表与历史按钮更新；no-op 反馈待验证",
          recovery: "非法或无变化名称不写历史；成功后可撤销 / 重做"
        }),
        visibleAction("details-namebase-rename", "对象详情：按名称库重命名", [
          sourceRef(FILES.objectDetailsVue, ["callbacks.onRenameFromNamebase?.()"]),
          sourceRef(FILES.objectDetailsWrapper, ["onRenameFromNamebase: () => callbacks.onRenameFromNamebase"]),
          sourceRef(FILES.runtime, ["onRenameFromNamebase:", "renameSelectedObjectFromNamebase"], {anchor: "createObjectDetailsPanel(documentRef", end: "next-panel-factory"}),
          sourceRef(FILES.runtime, ["createSelectedNamebaseRenameCommand", "executeEditCommand", "noopStatus", "status:"], {anchor: "function renameSelectedObjectFromNamebase", span: 2200})
        ], {
          result: "按对象绑定名称库生成并应用新名称",
          historyEffect: "成功执行一条可撤销名称库重命名命令",
          feedback: "对象名称、标签、列表与历史按钮更新",
          recovery: "不支持或无候选名称时不写历史并保留原名"
        })
      ],
      entry: "画布左键单击对象",
      preconditions: "没有活动画布工具消费点击；命中可解析对象",
      chain: [
        step("renderer 选择", FILES.renderer, ["this.onSelect(this.pickClientPoint", "setSelection(object"]),
        step("selection store", FILES.runtime, ["new SelectionStore", "renderer.setSelection"]),
        step("路由", FILES.runtime, ["handleSelectionPanel", "state.panels.objectDetails.show"]),
        step("默认详情策略", FILES.selectionPolicy, ["OBJECT_DETAILS", "decideSelectionPanelRoute"]),
        step("详情动作接线", FILES.objectDetailsWrapper, ["onLocate", "onEdit", "onCancelEdit", "onRename", "onRenameFromNamebase"])
      ],
      expectedResult: "renderer 高亮目标；没有已打开领域面板消费时显示对象详情",
      history: "选择和查看详情不写历史",
      feedback: "地图高亮、详情标题与对象字段",
      exitRecovery: "清除选择或关闭详情；Esc 由快捷键链审计",
      firstUse: "地图点击立即显示可读对象信息",
      expertUse: "selection store 保证 API、列表和地图路径一致",
      decisions: [DECISIONS.selection, DECISIONS.audit],
      browser: ["F1 地图选择国家 / 城市 / 河流并核对详情"]
    }),
    flow("HF-10", "选择对象时更新已打开的领域面板", {
      surfaces: ["panel:object-details", "panel:state-panel", "panel:city-panel"],
      actions: [
        ...domainPanelActions(),
        visibleAction("selection-update-open-panel", "选择对象时更新已打开领域面板", [
          sourceRef(FILES.selectionPolicy, ["UPDATE_OPEN_PANEL"]),
          sourceRef(FILES.runtime, ["routeSelectionToPanel", "state.panels.objectDetails.clear()"])
        ])
      ],
      entry: "领域面板打开时从地图或其它入口选择同领域对象",
      preconditions: "对象种类存在 selection binding，领域面板已经打开",
      chain: [
        step("可见入口", FILES.control, ["managementGroup", "open-state-panel", "open-city-panel"]),
        step("DOM 接线", FILES.panelBindings, ["handlers.onOpenStatePanel", "handlers.onOpenCityPanel"]),
        step("runtime 打开", FILES.runtime, ["onOpenStatePanel", "openSelectionAwarePanel", "state.panels.state.open"]),
        step("面板管理", FILES.panelManager, ["open(id", "closeOtherMainPanels"]),
        step("绑定表", FILES.selectionPolicy, ["SELECTION_PANEL_BINDINGS", "panelId"]),
        step("路由判定", FILES.selectionPolicy, ["panelOpen", "UPDATE_OPEN_PANEL"]),
        step("runtime 路由", FILES.runtime, ["routeSelectionToPanel", "state.panels.objectDetails.clear()"]),
        step("领域刷新", FILES.runtime, ["prepare?.()", "update?.()"])
      ],
      expectedResult: "更新已打开领域面板的当前对象，不额外打开第二个详情面板",
      history: "选择路由不写历史",
      feedback: "领域列表主选中和详情区域同步",
      exitRecovery: "面板关闭时后续选择回到对象详情；来源面板选择不重复刷新",
      firstUse: "同一次地图点击的目标界面取决于用户当前打开的工作区",
      expertUse: "避免领域面板与对象详情重复占用画布",
      decisions: [DECISIONS.selection, DECISIONS.panels, DECISIONS.audit],
      browser: ["F1 领域面板关闭 / 打开两种 selection 路由"]
    }),
    flow("HF-11", "筛选对象列表并清空空结果", {
      surfaces: ["panel:city-panel", "shared:ui-filter-input", "shared:ui-object-table"],
      actions: [
        visibleAction("city-filter", "城市列表即时筛选", [sourceRef(FILES.cityVue, ["callbacks.onFilter", "filterRows(metrics.value.rows"]) ]),
        visibleAction("city-filter-clear", "空结果清空筛选", [sourceRef(FILES.cityVue, ["clear-filter", "props.callbacks.onFilter?.(\"\")"]) ])
      ],
      entry: "对象面板筛选输入框",
      preconditions: "对象面板已打开",
      chain: [
        step("共享输入", FILES.filterInput, ["update:modelValue", "$emit"]),
        step("领域接线", FILES.cityVue, ["callbacks.onFilter", "filterRows(metrics.value.rows"]),
        step("状态保存", FILES.cityWrapper, ["panelState.filter = value", "updatePanelListPreferences"]),
        step("空结果恢复", FILES.cityVue, ["clear-filter", "props.callbacks.onFilter?.(\"\")"])
      ],
      expectedResult: "按名称 / ID / 关联字段过滤当前表格；空结果可一键清空筛选",
      history: "筛选属于视图偏好，不写地图编辑历史",
      feedback: "结果计数、空态与清空动作",
      exitRecovery: "清空筛选恢复完整可见集合；面板偏好保存筛选值",
      firstUse: "输入即筛选，空态提供直接恢复",
      expertUse: "筛选状态跨面板刷新保持",
      decisions: [DECISIONS.actions, DECISIONS.audit],
      browser: ["F1 城市列表命中筛选", "F6 固定空筛选并清空"]
    }),
    flow("HF-12", "从对象列表定位地图对象", {
      surfaces: ["shared:ui-object-table", "panel:city-panel", "canvas:map-canvas"],
      actions: locateHostActions(),
      entry: "对象表格每行定位图标",
      preconditions: "行对象可解析且 renderer 支持定位",
      chain: [
        step("共享表格", FILES.objectTable, ["aria-label=\"定位\"", "emit('locate', row)"]),
        step("领域 Vue", FILES.cityVue, ["@locate=\"callbacks.onLocate\""]),
        step("wrapper callback", FILES.cityWrapper, ["onLocate: row => callbacks.onLocate", "cityObject(row)"]),
        step("runtime handler", FILES.runtime, ["locateAndSelectObject(\"city-panel\"", "state.renderer.locateObject"]),
        step("结果", FILES.runtime, ["selectionStore.setSelection", "refreshRuntimeAndPickPanels"])
      ],
      expectedResult: "相机定位目标并设置统一 selection，领域面板继续保持上下文",
      history: "定位和选择不写历史",
      feedback: "相机移动、地图高亮和行主选中",
      exitRecovery: "无效对象返回 false，地图与 selection 不被错误替换",
      firstUse: "行内位置图标表达从列表到地图",
      expertUse: "与地图直接选择共享 selection 结果",
      decisions: [DECISIONS.actions, DECISIONS.selection, DECISIONS.audit],
      browser: ["F1 城市行定位并核对 selection / 相机"]
    }),
    flow("HF-13", "重命名选中对象", {
      surfaces: ["panel:city-panel", "shared:ui-text-edit-field"],
      actions: renameHostActions(),
      entry: "领域面板或对象详情中的名称字段“应用”",
      preconditions: "已选择可重命名对象且名称有效",
      chain: [
        step("字段组件", FILES.textEdit, ["defineEmits", "apply"]),
        step("领域 Vue", FILES.cityVue, ["@apply=\"name => callbacks.onRename(selected.id, name)\""]),
        step("wrapper callback", FILES.cityWrapper, ["onRename: (cityId, name) => callbacks.onRename"]),
        step("runtime handler", FILES.runtime, ["onRename: (cityId, name)", "createRenameObjectCommand"]),
        step("命令执行", FILES.runtime, ["executeEditCommand(state, documentRef, command", "state.editHistory.execute"]),
        step("领域命令", FILES.editCommands, ["createRenameObjectCommand", "effects"])
      ],
      expectedResult: "名称更新并刷新地图标签、对象面板和相关索引",
      history: "单次应用写一条可撤销编辑命令",
      feedback: "字段回显、地图标签和历史摘要更新",
      exitRecovery: "无变化视为 noop；失败不写历史；可撤销 / 重做",
      firstUse: "明确的应用动作表示提交字段",
      expertUse: "面板与稳定 API 共用命令语义",
      decisions: [DECISIONS.commands, DECISIONS.feedback, DECISIONS.audit],
      browser: ["F1 城市重命名、撤销、重做后恢复原名"]
    }),
    flow("HF-14", "撤销和重做最近编辑", {
      surfaces: ["global:app-webgl-generator-src-runtime-keyboard-shortcuts", "panel:city-panel"],
      actions: historyActions(),
      entry: "面板历史按钮或 Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y",
      preconditions: "对应 undo / redo 栈非空；输入控件焦点抑制按 registry 处理",
      chain: [
        step("面板按钮创建", FILES.panelManager, ["floating-panel-history-undo", "floating-panel-history-redo"]),
        step("面板按钮回调", FILES.panelManager, ["record.historyActions?.onUndo?.()", "record.historyActions?.onRedo?.()"]),
        step("快捷键", FILES.shortcuts, ["history.undo", "history.redo", "history.undo"]),
        step("runtime action", FILES.runtime, ["executeHistoryCommand", "state.editHistory.redo", "state.editHistory.undo"]),
        step("历史栈迁移", FILES.history, ["undoStack.pop()", "redoStack.push(command)", "redoStack.pop()", "undoStack.push(command)"]),
        step("刷新", FILES.runtime, ["refreshPanelsForEdit", "reconcilePersistentObjectHighlights"]),
        step("反馈", FILES.panelManager, ["没有可撤销操作", "没有可重做操作", "undo.disabled", "redo.disabled"])
      ],
      expectedResult: "按历史栈精确恢复或重放最近一条编辑命令并刷新依赖表面",
      history: "undo 在两栈间移动一条命令；redo 反向移动",
      feedback: "按钮可用态、历史摘要和操作状态",
      exitRecovery: "空栈返回 executed=false，不改变地图",
      firstUse: "面板按钮提供可发现入口",
      expertUse: "平台快捷键复用同一历史动作并抑制输入冲突",
      decisions: [DECISIONS.commands, DECISIONS.keyboard, DECISIONS.feedback, DECISIONS.audit],
      browser: ["F1 重命名后的 undo / redo", "F6 空栈动作"]
    })
  ];
}

function flow(id, userGoal, options) {
  return {
    flowId: id,
    userGoal,
    surfaceIds: options.surfaces,
    visibleActions: options.actions.map(action => ({
      ...action,
      result: action.result || options.expectedResult,
      historyEffect: action.historyEffect || options.history,
      feedback: action.feedback || options.feedback,
      recovery: action.recovery || options.exitRecovery,
      severity: action.severity || "N/A",
      confidence: action.confidence || "代码确认",
      intB: action.intB ?? false
    })),
    entryAndContext: options.entry,
    preconditions: options.preconditions,
    chain: options.chain,
    expectedResult: options.expectedResult,
    historyBehavior: options.history,
    feedback: options.feedback,
    exitAndRecovery: options.exitRecovery,
    userPerspectives: {firstUse: options.firstUse, expert: options.expertUse},
    existingDecisions: options.decisions,
    mentalModelBasis: "项目既有契约与产品内一致行为",
    severity: "N/A",
    confidence: "代码确认",
    intB: false,
    browserEvidence: "pending-Q107",
    browserSteps: options.browser
  };
}

function visibleAction(actionId, label, sourceRefs, options = {}) {
  return {
    actionId,
    label,
    sourceRefs,
    variant: options.variant || "shared-flow",
    result: options.result || "",
    historyEffect: options.historyEffect || "",
    feedback: options.feedback || "",
    recovery: options.recovery || "",
    severity: options.severity || "",
    confidence: options.confidence || "",
    intB: options.intB,
    evidenceStatus: "E-C",
    browserEvidence: "pending-Q107"
  };
}

function sourceRef(file, tokens, scope = null) {
  return {file, tokens, ...(scope ? {scope} : {})};
}

function domainPanelActions() {
  const source = readRepoFile(FILES.control);
  const matches = [...source.matchAll(/\["(open-([a-z-]+)-panel)",\s*"([^"]+)"\]/g)];
  return matches.map(([, id, name, label]) => {
    const handler = `onOpen${pascalCase(name)}Panel`;
    const panelKey = lowerFirst(pascalCase(name));
    const bindingTokens = ["height", "state"].includes(name)
      ? [`bindDelegatedButton(documentRef, "${id}"`, handler]
      : [name === "label-naming" ? "bindLabelNamingPanelTrigger" : `getElementById("${id}")`];
    return visibleAction(`open-${name}`, label, [
      sourceRef(FILES.control, [`["${id}", "${label}"]`]),
      sourceRef(FILES.panelBindings, bindingTokens),
      sourceRef(FILES.runtime, [`${handler}:`, `state.panels.${panelKey}.open`], {anchor: `${handler}:`, end: "next-open-handler"})
    ], {
      result: `打开${label}主面板，并按该面板既有 open 契约初始化内容`,
      historyEffect: "打开面板不写地图编辑历史",
      feedback: "面板显示；需要懒加载时显示加载或失败状态",
      recovery: "关闭按钮退出；同一时间只保留一个主面板"
    });
  });
}

function locateHostActions() {
  return discoverVueHosts("@locate").map(({file, name}) => {
    const componentSource = readRepoFile(file);
    const locateMatch = /@locate="callbacks\.([A-Za-z0-9_]+)"/.exec(componentSource);
    if (!locateMatch) throw new Error(`${name} 缺少可解析的定位 callback`);
    const callback = locateMatch[1];
    const base = name.replace(/Panel$/, "");
    const panelSlug = slug(base);
    const wrapper = `app/webgl-generator/src/ui/panels/${panelSlug}-panel.js`;
    const anchor = `create${base}Panel(documentRef`;
    const runtimeRefs = name === "MeasurementPanel"
      ? [
          sourceRef(FILES.runtime, [`${callback}:`, "locateMeasurement(state"], {anchor, end: "next-panel-factory"}),
          sourceRef(FILES.runtime, ["state.locateAndSelectObject(\"measurement-panel\""])
        ]
      : name === "OceanCurrentPanel"
        ? [sourceRef(FILES.runtime, [`${callback}: current`, "oceanCurrentBounds", "locateBounds", "无法定位洋流"], {anchor, end: "next-panel-factory"})]
      : [sourceRef(FILES.runtime, [`${callback}:`, `locateAndSelectObject(\"${panelSlug}-panel\"`], {anchor, end: "next-panel-factory"})];
    return visibleAction(`locate-${panelSlug}`, `${base} 列表定位`, [
      sourceRef(file, ["@locate", `callbacks.${callback}`]),
      sourceRef(FILES.objectTable, ["emit('locate', row)"]),
      sourceRef(wrapper, [`${callback}:`, `callbacks.${callback}`]),
      ...runtimeRefs
    ]);
  });
}

function renameHostActions() {
  const commandByBase = {
    City: "createRenameObjectCommand",
    Culture: "createRenameObjectCommand",
    LabelNaming: "createRenameCustomLabelCommand",
    Lake: "createRenameObjectCommand",
    Marker: "createRenameObjectCommand",
    Measurement: "createRenameMeasurementCommand",
    Military: "createRenameMilitaryRegimentCommand",
    Notes: "createRenameObjectCommand",
    ObjectDetails: "createRenameObjectCommand",
    Province: "createRenameObjectCommand",
    Religion: "createRenameObjectCommand",
    River: "createRenameObjectCommand",
    State: "createRenameObjectCommand",
    OceanCurrent: "createRenameOceanCurrentCommand"
  };
  return discoverVueHosts("UiTextEditField", {excludeBase: true}).map(({file, name}) => {
    const base = name.replace(/Panel$/, "");
    const panelSlug = slug(base);
    const wrapper = `app/webgl-generator/src/ui/panels/${panelSlug}-panel.js`;
    if (base === "Namebase") {
      return visibleAction("rename-namebase", "Namebase 用户名称库重命名", [
        sourceRef(file, ["UiTextEditField", "@apply=\"value => callbacks.onRenameUser"]),
        sourceRef(FILES.textEdit, ["submit.prevent", "$emit('apply'"]),
        sourceRef(wrapper, ["onRenameUser:", "callbacks.onRenameUser"]),
        sourceRef(FILES.runtime, ["onRenameUser:", "renameImportedNamebase"], {anchor: "createNamebasePanel(documentRef", end: "next-panel-factory"}),
        sourceRef(FILES.runtime, ["createRenameUserNamebaseCommand", "executeNamebaseEdit"], {anchor: "function renameImportedNamebase", span: 1800})
      ], {
        result: "更新用户名称库名称",
        historyEffect: "成功执行一条可撤销名称库命令",
        feedback: "成功、无变化、缺少目标与失败均写文件状态",
        recovery: "非法、内置或无变化目标不写历史；成功后可撤销 / 重做"
      });
    }
    const callback = "onRename";
    const anchor = `create${base}Panel(documentRef`;
    const commandToken = commandByBase[base];
    if (!commandToken) throw new Error(`缺少 ${base} 重命名命令映射`);
    if (base === "OceanCurrent") {
      return visibleAction("rename-ocean-current", "OceanCurrent 重命名", [
        sourceRef(file, ["UiTextEditField", "@apply"]),
        sourceRef(FILES.textEdit, ["submit.prevent", "$emit('apply'"]),
        sourceRef(wrapper, [`${callback}:`, `callbacks.${callback}`]),
        sourceRef(FILES.runtime, [`${callback}:`, "runtimeActions.oceanCurrents.rename"], {anchor, end: "next-panel-factory"}),
        sourceRef(FILES.runtime, ["function renameOceanCurrentViaApi", commandToken, "executeEditCommand"])
      ]);
    }
    return visibleAction(`rename-${panelSlug}`, `${base} 重命名`, [
      sourceRef(file, ["UiTextEditField", "@apply"]),
      sourceRef(FILES.textEdit, ["submit.prevent", "$emit('apply'"]),
      sourceRef(wrapper, [`${callback}:`, `callbacks.${callback}`]),
      sourceRef(FILES.runtime, [`${callback}:`, commandToken, "executeEditCommand"], {anchor, end: "next-panel-factory"})
    ]);
  });
}

function historyActions() {
  const panelDir = join(REPO_ROOT, "app", "webgl-generator", "src", "ui", "panels");
  const hosts = readdirSync(panelDir).filter(name => name.endsWith("-panel.js") && readFileSync(join(panelDir, name), "utf8").includes("historyActions:"));
  const actions = hosts.flatMap(name => {
    const file = `app/webgl-generator/src/ui/panels/${name}`;
    const host = name.replace(/\.js$/, "");
    const base = pascalCase(host.replace(/-panel$/, ""));
    const anchor = `create${base}Panel(documentRef`;
    const undoRuntimeToken = host === "namebase-panel" ? "undoNamebaseEdit" : "executeHistoryCommand";
    const redoRuntimeToken = host === "namebase-panel" ? "redoNamebaseEdit" : "executeHistoryCommand";
    return [
      visibleAction(`undo-${host}`, `${host} 标题栏撤销`, [
        sourceRef(file, ["historyActions:", "onUndo"]),
        sourceRef(FILES.panelManager, ["record.historyActions?.onUndo?.()"]),
        sourceRef(FILES.runtime, ["onUndo:", undoRuntimeToken], {anchor, end: "next-panel-factory"})
      ]),
      visibleAction(`redo-${host}`, `${host} 标题栏重做`, [
        sourceRef(file, ["historyActions:", "onRedo"]),
        sourceRef(FILES.panelManager, ["record.historyActions?.onRedo?.()"]),
        sourceRef(FILES.runtime, ["onRedo:", redoRuntimeToken], {anchor, end: "next-panel-factory"})
      ])
    ];
  });
  actions.push(
    visibleAction("undo-height-inline", "高度面板内容区撤销", [
      sourceRef("app/webgl-generator/src/ui/vue/components/HeightPanel.vue", ["callbacks.onUndo?.()", "撤销上次"]),
      sourceRef("app/webgl-generator/src/ui/panels/height-panel.js", ["onUndo:", "callbacks.onUndo"]),
      sourceRef(FILES.runtime, ["onUndo:", "executeHistoryCommand"], {anchor: "createHeightPanel(documentRef", end: "next-panel-factory"})
    ]),
    visibleAction("redo-height-inline", "高度面板内容区重做", [
      sourceRef("app/webgl-generator/src/ui/vue/components/HeightPanel.vue", ["callbacks.onRedo?.()", "重做上次"]),
      sourceRef("app/webgl-generator/src/ui/panels/height-panel.js", ["onRedo:", "callbacks.onRedo"]),
      sourceRef(FILES.runtime, ["onRedo:", "executeHistoryCommand"], {anchor: "createHeightPanel(documentRef", end: "next-panel-factory"})
    ]),
    visibleAction("undo-shortcut", "Ctrl/Cmd+Z", [sourceRef(FILES.shortcuts, ["history.undo", "path: \"history.undo\""])]),
    visibleAction("redo-shift-shortcut", "Ctrl/Cmd+Shift+Z", [sourceRef(FILES.shortcuts, ["history.redo", "path: \"history.redo\""])]),
    visibleAction("redo-y-shortcut", "Ctrl/Cmd+Y", [sourceRef(FILES.shortcuts, ["history.redo", "binding(\"KeyY\""])]));
  return actions;
}

function discoverVueHosts(token, {excludeBase = false} = {}) {
  const root = join(REPO_ROOT, "app", "webgl-generator", "src", "ui", "vue", "components");
  return readdirSync(root)
    .filter(name => name.endsWith(".vue"))
    .map(name => ({name: name.replace(/\.vue$/, ""), file: `app/webgl-generator/src/ui/vue/components/${name}`}))
    .filter(item => (!excludeBase || !item.file.includes("/base/")) && readRepoFile(item.file).includes(token));
}

function pascalCase(value) {
  return value.split("-").map(part => part.charAt(0).toUpperCase() + part.slice(1)).join("");
}

function slug(value) {
  return value.replace(/Panel$/, "").replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function lowerFirst(value) {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function step(layer, file, tokens) {
  return {layer, file, symbols: tokens};
}

function buildStaticFindings() {
  return [];
}

function verifyFlow(item, includedSurfaceIds) {
  const misses = [];
  for (const chainStep of item.chain) {
    const source = readRepoFile(chainStep.file);
    for (const token of chainStep.symbols) if (!source.includes(token)) misses.push(`${chainStep.file}: ${token}`);
  }
  for (const action of item.visibleActions) {
    for (const ref of action.sourceRefs) {
      const source = sourceForRef(ref);
      for (const token of ref.tokens) if (!source.includes(token)) misses.push(`${action.actionId} ${ref.file}: ${token}`);
    }
    if (!action.result || !action.historyEffect || !action.feedback || !action.recovery) misses.push(`${action.actionId} 缺少结果、历史、反馈或恢复结论`);
    if (action.severity !== "N/A" || action.confidence !== "代码确认" || typeof action.intB !== "boolean") misses.push(`${action.actionId} 严重度、信心或 INT-B 不符合正常结论枚举`);
  }
  for (const decision of item.existingDecisions) readRepoFile(decision);
  for (const surfaceId of item.surfaceIds) if (!includedSurfaceIds.has(surfaceId)) misses.push(`未知或排除的 surfaceId: ${surfaceId}`);
  if (!item.visibleActions.length) misses.push("没有可见动作分母");
  if (!item.expectedResult || !item.historyBehavior || !item.feedback || !item.exitAndRecovery) misses.push("结果、历史、反馈或恢复字段为空");
  if (misses.length) throw new Error(`${item.flowId} 作用链证据缺失：${misses.join("；")}`);
  return {...item, evidenceStatus: "E-C", codeEvidenceComplete: true};
}

function verifyFinding(item) {
  const misses = [];
  for (const ref of item.sourceRefs) {
    const source = sourceForRef(ref);
    for (const token of ref.tokens) if (!source.includes(token)) misses.push(`${ref.file}: ${token}`);
  }
  if (!["P0", "P1", "P2", "P3"].includes(item.severity) || !["代码确认", "浏览器复现", "用户反馈", "待验证"].includes(item.confidence) || typeof item.intB !== "boolean") misses.push("严重度、信心或 INT-B 不符合专题枚举");
  if (misses.length) throw new Error(`${item.findingId} 问题证据缺失：${misses.join("；")}`);
  return item;
}

function sourceForRef(ref) {
  const source = readRepoFile(ref.file);
  if (!ref.scope?.anchor) return source;
  const start = source.indexOf(ref.scope.anchor);
  if (start < 0) return "";
  if (ref.scope.end === "next-panel-factory") {
    const tail = source.slice(start + ref.scope.anchor.length);
    const match = /create[A-Z][a-zA-Z0-9]*Panel\(documentRef/.exec(tail);
    return source.slice(start, match ? start + ref.scope.anchor.length + match.index : source.length);
  }
  if (ref.scope.end === "next-open-handler") {
    const tail = source.slice(start + ref.scope.anchor.length);
    const match = /\n    onOpen[A-Z][a-zA-Z0-9]*Panel:/.exec(tail);
    return source.slice(start, match ? start + ref.scope.anchor.length + match.index : source.length);
  }
  return source.slice(start, start + (Number(ref.scope.span) || 12000));
}

function renderMarkdown(report) {
  const lines = [
    "# 高频核心任务闭环静态审计",
    "",
    `- source digest：\`${report.sourceDigest}\``,
    `- 任务链：\`${report.totals.flows}\``,
    `- 可见动作：\`${report.totals.visibleActions}\``,
    `- E-C / 浏览器待验：\`${report.totals.codeConfirmed} / ${report.totals.browserPending}\``,
    `- 未知结果 / 缺少既有决定：\`${report.totals.unknownResults} / ${report.totals.missingDecisions}\``,
    `- 静态问题候选 / 无效表面外键：\`${report.totals.findings} / ${report.totals.unresolvedSurfaceRefs}\``,
    "- 本报告不包含 E-S / E-F；统一浏览器证据由第 107 项补齐。",
    "",
    "| ID | 用户目标 | 入口 | 结果 | 历史 | 反馈 | 代码证据 | 浏览器 |",
    "|---|---|---|---|---|---|---:|---|"
  ];
  for (const item of report.flows) {
    lines.push(`| ${item.flowId} | ${escapeCell(item.userGoal)} | ${escapeCell(item.entryAndContext)} | ${escapeCell(item.expectedResult)} | ${escapeCell(item.historyBehavior)} | ${escapeCell(item.feedback)} | ${item.evidenceStatus} | ${item.browserEvidence} |`);
  }
  lines.push("", "## 作用链", "");
  for (const item of report.flows) {
    lines.push(`### ${item.flowId} ${item.userGoal}`, "");
    lines.push(`- 前置：${item.preconditions}`);
    lines.push(`- 退出与恢复：${item.exitAndRecovery}`);
    lines.push(`- 首次使用者：${item.userPerspectives.firstUse}`);
    lines.push(`- 熟练使用者：${item.userPerspectives.expert}`);
    lines.push(`- 既有决定：${item.existingDecisions.map(path => `\`${path}\``).join("、")}`);
    lines.push(`- 第 107 项步骤：${item.browserSteps.join("；")}`);
    lines.push(`- 结论：严重度 \`${item.severity}\`；信心 \`${item.confidence}\`；INT-B \`${item.intB}\``);
    lines.push(`- 可见动作（${item.visibleActions.length}）：`);
    for (const action of item.visibleActions) {
      lines.push(`  - \`${action.actionId}\` ${action.label}；结果：${action.result}；历史：${action.historyEffect}；反馈：${action.feedback}；恢复：${action.recovery}；严重度 / 信心 / INT-B：\`${action.severity} / ${action.confidence} / ${action.intB}\``);
    }
    for (const chainStep of item.chain) lines.push(`  - ${chainStep.layer}：\`${chainStep.file}\` → ${chainStep.symbols.map(symbol => `\`${symbol}\``).join("、")}`);
    lines.push("");
  }
  lines.push("## 静态问题候选", "");
  for (const finding of report.findings) {
    lines.push(`### ${finding.findingId} ${finding.title}`, "");
    lines.push(`- 严重度：\`${finding.severity}\``);
    lines.push(`- 信心：\`${finding.confidence}\``);
    lines.push(`- INT-B：\`${finding.intB}\``);
    lines.push(`- 证据：\`${finding.evidenceStatus}\`；浏览器：\`${finding.browserEvidence}\``);
    lines.push(`- 观察：${finding.observed}`);
    lines.push(`- 建议：${finding.recommendation}`, "");
  }
  return `${lines.join("\n")}\n`;
}

function digestFiles(files) {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file);
    hash.update("\0");
    hash.update(readRepoFile(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function readRepoFile(path) {
  return readFileSync(join(REPO_ROOT, ...path.split("/")), "utf8").replace(/\r\n/g, "\n");
}

function escapeCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function parseArgs(argv) {
  const args = {check: false, output: OUTPUT_ROOT};
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === "--check") args.check = true;
    if (argv[index] === "--output") args.output = resolve(REPO_ROOT, argv[++index]);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const first = buildCoreFlowAudit();
  if (first.totals.unknownResults || first.totals.missingDecisions || first.totals.unresolvedSurfaceRefs) throw new Error("高频核心任务链仍有未知结果、缺少既有决定或无效表面外键");
  if (args.check) {
    const expectedJson = Buffer.from(`${JSON.stringify(first, null, 2)}\n`);
    const expectedMarkdown = Buffer.from(renderMarkdown(first));
    const currentJson = readFileSync(join(args.output, "core-task-flows.json"));
    const currentMarkdown = readFileSync(join(args.output, "core-task-flows.md"));
    if (!expectedJson.equals(currentJson) || !expectedMarkdown.equals(currentMarkdown)) throw new Error("高频任务链报告已陈旧，请先重新生成再审查");
    const second = buildCoreFlowAudit();
    if (JSON.stringify(first) !== JSON.stringify(second) || renderMarkdown(first) !== renderMarkdown(second)) throw new Error("高频任务链报告连续生成不稳定");
  } else {
    writeCoreFlowAudit(args.output);
  }
  console.log(JSON.stringify({output: relative(REPO_ROOT, args.output).replaceAll("\\", "/"), totals: first.totals}, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
