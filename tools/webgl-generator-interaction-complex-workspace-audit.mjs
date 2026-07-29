import {createHash} from "node:crypto";
import {existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from "node:fs";
import {basename, dirname, join, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TOOL_DIR, "..");
const COMPONENT_ROOT = "app/webgl-generator/src/ui/vue/components";
const OUTPUT_ROOT = join(REPO_ROOT, "docs", "generated", "interaction-audit");

const FILES = Object.freeze({
  objectTable: `${COMPONENT_ROOT}/base/UiObjectTable.vue`,
  actionDock: `${COMPONENT_ROOT}/base/UiActionDock.vue`,
  visibleSelection: "app/webgl-generator/src/ui/vue/composables/use-visible-row-selection.js",
  persistentHighlights: "app/webgl-generator/src/runtime/persistent-highlights.js",
  panelHighlightActions: "app/webgl-generator/src/ui/panels/panel-highlight-actions.js",
  runtime: "app/webgl-generator/src/runtime/app.js",
  styles: "app/webgl-generator/src/styles.css"
});

const SHARED_FIELD_FILES = Object.freeze([
  "UiTextEditField.vue", "UiNoteField.vue", "UiNumberField.vue", "UiSliderField.vue",
  "UiSelectField.vue", "UiSwitchField.vue", "UiColorField.vue", "UiSegmented.vue"
].map(name => `${COMPONENT_ROOT}/base/${name}`));

const SHARED_FIELDS = Object.freeze([
  "UiTextEditField", "UiNoteField", "UiNumberField", "UiSliderField",
  "UiSelectField", "UiSwitchField", "UiColorField", "UiSegmented"
]);

const COMPLEX_WORKSPACES = Object.freeze([
  workspace("HeightPanel.vue", 33, 2, "高度编辑与高度图导入工作台"),
  workspace("StatePanel.vue", 10, 2, "国家管理、合并与拆分"),
  workspace("ProvincePanel.vue", 4, 0, "省份管理与批量操作"),
  workspace("CulturePanel.vue", 5, 5, "文化属性、中心与扩张"),
  workspace("ReligionPanel.vue", 5, 4, "宗教属性、中心与扩张"),
  workspace("MilitaryPanel.vue", 17, 0, "军事、军团与战报"),
  workspace("EconomyPanel.vue", 8, 5, "商品、市场与交易"),
  workspace("DiplomacyPanel.vue", 3, 1, "外交关系与事件"),
  workspace("ClimatePanel.vue", 1, 1, "气候带与下游重算"),
  {workspaceId: "project-export", file: "ControlPanel.vue", label: "项目导出浮层", expectedSharedFields: 17, expectedExceptionFields: 11, exportWorkspace: true}
]);

const EXPECTED_GLOBAL_SELECTION_TABLES = new Set([
  "CityPanel.vue#1", "CulturePanel.vue#1", "DiplomacyPanel.vue#1", "EconomyPanel.vue#2", "FeaturePanel.vue#1", "GovernmentPanel.vue#2",
  "LabelNamingPanel.vue#1", "LakePanel.vue#1", "MarkerPanel.vue#1", "MeasurementPanel.vue#1", "OceanCurrentPanel.vue#1",
  "MilitaryPanel.vue#1", "NotesPanel.vue#1", "ProvincePanel.vue#1", "ReligionPanel.vue#1",
  "RiverPanel.vue#1", "RoutePanel.vue#1", "StatePanel.vue#1", "ZonePanel.vue#1"
]);

const EXPECTED_HIGHLIGHT_TABLES = new Set([
  "CityPanel.vue#1", "CulturePanel.vue#1", "DiplomacyPanel.vue#1", "EconomyPanel.vue#3",
  "GovernmentPanel.vue#2", "LabelNamingPanel.vue#1", "LakePanel.vue#1", "MarkerPanel.vue#1",
  "MeasurementPanel.vue#1", "MilitaryPanel.vue#1", "NotesPanel.vue#1", "ProvincePanel.vue#1",
  "ReligionPanel.vue#1", "RiverPanel.vue#1", "RoutePanel.vue#1", "StatePanel.vue#1", "ZonePanel.vue#1"
]);

const EXPECTED_SELECTED_EXPORT_TABLES = new Set([
  "DiplomacyPanel.vue#1", "EconomyPanel.vue#1", "EconomyPanel.vue#2", "EconomyPanel.vue#3",
  "GovernmentPanel.vue#2", "MeasurementPanel.vue#1", "MilitaryPanel.vue#1", "NamebasePanel.vue#1", "NotesPanel.vue#1"
]);

export function buildComplexWorkspaceAudit() {
  const panelFiles = panelComponentFiles();
  const panelProfiles = panelFiles.map(buildPanelProfile);
  const tableInstances = panelFiles.flatMap(buildTableInstances);
  verifyTableSemanticDenominators(tableInstances);
  const complexWorkspaces = COMPLEX_WORKSPACES.map(buildWorkspaceProfile);
  const fieldInstances = complexWorkspaces.flatMap(item => item.fields);
  const actionDockHosts = buildActionDockHosts(panelFiles);
  const actionDockActions = actionDockHosts.flatMap(item => item.actions);
  const findings = buildFindings();
  const sourceFiles = [...new Set([
    ...Object.values(FILES),
    ...SHARED_FIELD_FILES,
    ...panelFiles,
    ...panelFiles.map(panelWrapperFile).filter(file => existsSync(join(REPO_ROOT, file))),
    ...tableInstances.map(item => item.file)
  ])].sort();
  const unknownFields = fieldInstances.filter(item => !item.commitClass || !item.commitTiming || !item.effectClass || !item.historyBoundary || !item.historyEffect);
  const unresolvedTables = tableInstances.filter(item => !item.selectedId || !item.rows || item.resizable && !item.columnWidths || !item.emptyState || !item.selectionContract);
  const unresolvedActions = actionDockActions.filter(item => !item.resultClass || !item.historyBoundary || !item.sourceRef);

  return {
    schemaVersion: 1,
    scope: "权威任务第 104 项：复杂面板、表单、表格、批量任务与动作坞静态审计",
    sourceDigest: digestFiles(sourceFiles),
    totals: {
      panelProfiles: panelProfiles.length,
      complexWorkspaces: complexWorkspaces.length,
      complexWorkspaceFields: fieldInstances.length,
      sharedFields: fieldInstances.filter(item => item.fieldFamily === "shared").length,
      exceptionFields: fieldInstances.filter(item => item.fieldFamily === "native-or-element").length,
      exportParameterFields: fieldInstances.filter(item => item.fieldFamily === "export-parameter").length,
      fieldCommitClasses: Object.fromEntries([...new Set(fieldInstances.map(item => item.commitClass))].sort().map(commitClass => [commitClass, fieldInstances.filter(item => item.commitClass === commitClass).length])),
      fieldEffects: Object.fromEntries([...new Set(fieldInstances.map(item => item.effectClass))].sort().map(effectClass => [effectClass, fieldInstances.filter(item => item.effectClass === effectClass).length])),
      tableHosts: new Set(tableInstances.map(item => item.file)).size,
      tableInstances: tableInstances.length,
      independentlyFilterable: tableInstances.filter(item => item.independentlyFilterable).length,
      sortable: tableInstances.filter(item => item.sortable).length,
      primarySelection: tableInstances.filter(item => item.selectedId).length,
      globalSelection: tableInstances.filter(item => item.selectionContract === "global-selection").length,
      localSelection: tableInstances.filter(item => item.selectionContract === "panel-local").length,
      locate: tableInstances.filter(item => item.locate).length,
      doubleClickEdit: tableInstances.filter(item => item.doubleClickEdit).length,
      resizable: tableInstances.filter(item => item.resizable).length,
      virtualCapable: tableInstances.filter(item => item.virtualCapable).length,
      emptyState: tableInstances.filter(item => item.emptyState).length,
      actionableEmptyState: tableInstances.filter(item => item.actionableEmptyState).length,
      batchSelection: tableInstances.filter(item => item.batchSelection).length,
      persistentHighlight: tableInstances.filter(item => item.persistentHighlight).length,
      selectedExport: tableInstances.filter(item => item.selectedExport).length,
      actionDockHosts: actionDockHosts.length,
      actionDockActions: actionDockActions.length,
      uniqueActionKeys: new Set(actionDockActions.map(item => item.key)).size,
      toggleModeActions: actionDockActions.filter(item => item.resultClass === "toggle-canvas-mode").length,
      directActions: actionDockActions.filter(item => item.resultClass === "direct").length,
      secondaryPanelActions: actionDockActions.filter(item => item.resultClass === "open-secondary").length,
      otherPanelActions: actionDockActions.filter(item => item.resultClass === "open-other-panel").length,
      crossResultActionKeys: crossResultActionKeys(actionDockActions).length,
      findings: findings.length,
      unknownFields: unknownFields.length,
      unresolvedTables: unresolvedTables.length,
      unresolvedActions: unresolvedActions.length,
      browserPending: fieldInstances.length + tableInstances.length + actionDockActions.length
    },
    dictionaries: buildDictionaries(),
    visualEvidence: buildVisualEvidence(),
    findings,
    panelProfiles,
    complexWorkspaces: complexWorkspaces.map(({fields, ...item}) => item),
    fieldInstances,
    tableInstances,
    actionDockHosts,
    actionDockActions,
    coverage: {
      unknownFieldIds: unknownFields.map(item => item.fieldId),
      unresolvedTableIds: unresolvedTables.map(item => item.tableId),
      unresolvedActionIds: unresolvedActions.map(item => item.actionId)
    }
  };
}

export function writeComplexWorkspaceAudit(outputRoot = OUTPUT_ROOT) {
  const report = buildComplexWorkspaceAudit();
  mkdirSync(outputRoot, {recursive: true});
  writeFileSync(join(outputRoot, "complex-workspaces.json"), stableJson(report));
  writeFileSync(join(outputRoot, "complex-workspaces.md"), renderMarkdown(report));
  return report;
}

function workspace(file, expectedSharedFields, expectedExceptionFields, label) {
  return {workspaceId: basename(file, ".vue").replace(/Panel$/, "").toLowerCase(), file, label, expectedSharedFields, expectedExceptionFields, exportWorkspace: false};
}

function panelComponentFiles() {
  return readdirSync(join(REPO_ROOT, COMPONENT_ROOT))
    .filter(name => name.endsWith("Panel.vue"))
    .map(name => `${COMPONENT_ROOT}/${name}`)
    .sort();
}

function buildPanelProfile(file) {
  const source = readText(file);
  const template = templateSource(source);
  return {
    panelId: basename(file, ".vue").replace(/Panel$/, "").toLowerCase(),
    file,
    lines: source.split("\n").length,
    sharedFields: countMatches(template, new RegExp(`<(${SHARED_FIELDS.join("|")})\\b`, "g")),
    nativeOrElementFields: extractExceptionFieldTags(template).length,
    tables: countMatches(template, /<UiObjectTable\b/g),
    actionDocks: countMatches(template, /<UiActionDock\b/g),
    buttons: countMatches(template, /<(?:button|UiButton|ElButton)\b/g),
    details: countMatches(template, /<details\b/g),
    complexWorkspace: COMPLEX_WORKSPACES.some(item => `${COMPONENT_ROOT}/${item.file}` === file),
    evidenceStatus: "E-C",
    browserEvidence: "pending-Q107"
  };
}

function buildWorkspaceProfile(definition) {
  const file = `${COMPONENT_ROOT}/${definition.file}`;
  const source = readText(file);
  let fields;
  if (definition.exportWorkspace) {
    const exportTemplate = scopedSource(source, 'class="project-export-panel"', "</Teleport>");
    fields = [
      ...extractTags(exportTemplate, ["UiSwitchField"]).map((tag, index) => fieldRecord(file, "project-export", tag, index + 1, "export-parameter")),
      ...extractTags(exportTemplate, ["select"]).map((tag, index) => fieldRecord(file, "project-export", tag, index + 1, "export-parameter", "export-select")),
      ...extractTags(exportTemplate, ["input"]).filter(tag => /type="number"/.test(tag)).map((tag, index) => fieldRecord(file, "project-export", tag, index + 1, "export-parameter", "export-number"))
    ];
  } else {
    const template = templateSource(source);
    fields = [
      ...extractTags(template, SHARED_FIELDS).map((tag, index) => fieldRecord(file, definition.workspaceId, tag, index + 1, "shared")),
      ...extractExceptionFieldTags(template).map((tag, index) => fieldRecord(file, definition.workspaceId, tag, index + 1, "native-or-element"))
    ];
  }
  const sharedFields = definition.exportWorkspace ? fields.filter(item => item.component === "UiSwitchField").length : fields.filter(item => item.fieldFamily === "shared").length;
  const exceptionFields = definition.exportWorkspace ? fields.length - sharedFields : fields.filter(item => item.fieldFamily === "native-or-element").length;
  if (sharedFields !== definition.expectedSharedFields || exceptionFields !== definition.expectedExceptionFields) {
    throw new Error(`${definition.file} 字段分母漂移：shared ${sharedFields}/${definition.expectedSharedFields}，exception ${exceptionFields}/${definition.expectedExceptionFields}`);
  }
  return {
    workspaceId: definition.workspaceId,
    label: definition.label,
    file,
    sharedFields,
    exceptionFields,
    fieldTemplates: fields.length,
    dynamicMultiplicity: dynamicMultiplicity(definition.file),
    evidenceStatus: "E-C",
    browserEvidence: "pending-Q107",
    fields
  };
}

function fieldRecord(file, workspaceId, tag, ordinal, fieldFamily, forcedType = null) {
  const component = forcedType || tag.match(/^<([\w-]+)/)?.[1] || "unknown";
  const normalized = normalizeTag(tag);
  const commitClass = classifyFieldCommit(component, normalized, fieldFamily);
  const dictionary = buildDictionaries().fieldCommitClasses[commitClass];
  const effectClass = classifyFieldEffect(workspaceId, normalized, commitClass);
  const effect = buildDictionaries().fieldEffects[effectClass];
  const componentFile = SHARED_FIELDS.includes(component) ? `${COMPONENT_ROOT}/base/${component}.vue` : file;
  if (effectClass === "map-command") requireTokens(FILES.runtime, readText(FILES.runtime), [mapEffectToken(normalized), "executeEditCommand"]);
  return {
    fieldId: `field:${workspaceId}:${String(ordinal).padStart(3, "0")}:${component}`,
    workspaceId,
    file,
    component,
    fieldFamily,
    label: attributeValue(normalized, "label") || attributeValue(normalized, "input-id") || attributeValue(normalized, "id") || `${component}#${ordinal}`,
    bindings: [...normalized.matchAll(/(?:v-model(?::[\w-]+)?|@(?:apply|change|input|select|update:model-value)|:(?:model-value|checked|value))="([^"]+)"/g)].map(match => match[0]),
    commitClass,
    commitTiming: dictionary.commitTiming,
    effectClass,
    historyBoundary: effect.historyBoundary,
    historyEffect: effect.historyEffect,
    validationAndRecovery: dictionary.validationAndRecovery,
    evidenceStatus: "E-C",
    browserEvidence: "pending-Q107",
    sourceRefs: [
      {file, token: normalized.slice(0, 320)},
      {file: componentFile, token: component},
      ...(effectClass === "map-command" ? [{file: FILES.runtime, token: mapEffectToken(normalized)}] : [])
    ]
  };
}

function classifyFieldCommit(component, tag, fieldFamily) {
  if (fieldFamily === "export-parameter") return "draft-confirm";
  if (component === "export-select" || component === "export-number") return "draft-confirm";
  if (["UiTextEditField", "UiNoteField", "UiNumberField", "UiColorField"].includes(component)) return "explicit-apply";
  if (component === "UiSliderField") {
    if (/Draft|draft/.test(tag)) return "draft-confirm";
    return /@change=/.test(tag) ? "input-preview-change-commit" : "live-local-parameter";
  }
  if (/Draft|draft|v-model/.test(tag)) return "draft-confirm";
  if (["UiSelectField", "UiSwitchField", "UiSegmented"].includes(component)) return /@(?:change|select|update:model-value)=/.test(tag) ? "immediate-change" : "draft-confirm";
  if (/@(?:change|select|update:model-value)=/.test(tag)) return "immediate-change";
  return "draft-confirm";
}

function classifyFieldEffect(workspaceId, tag, commitClass) {
  if (/onParentChange|applyRelationChange|applyBattleEvent|onRename|applyRename|onNoteChange/.test(tag)) return "map-command";
  if (commitClass === "explicit-apply") return workspaceId === "climate" ? "ui-local" : "map-command";
  if (commitClass === "draft-confirm") return ["height", "project-export"].includes(workspaceId) ? "ui-local" : "deferred-command";
  return "ui-local";
}

function mapEffectToken(tag) {
  if (tag.includes("onParentChange")) return "onParentChange:";
  if (tag.includes("applyRelationChange")) return "onRelationChange:";
  if (tag.includes("applyBattleEvent")) return "onBattleEventApply:";
  if (/onNoteChange/.test(tag)) return "onNoteChange:";
  return "onRename:";
}

function buildTableInstances(file) {
  const source = readText(file);
  return extractTags(templateSource(source), ["UiObjectTable"]).map((tag, index) => {
    const tableId = `${basename(file)}#${index + 1}`;
    const normalized = normalizeTag(tag);
    const rows = boundProp(normalized, "rows");
    const batchSelection = hasBooleanProp(normalized, "selectable-rows");
    const independentlyFilterable = source.includes("<UiFilterInput") && /^visible/i.test(rows);
    const selectionContract = discoverSelectionContract(file, source, normalized);
    const persistentHighlight = discoverPersistentHighlight(file, source, rows, batchSelection);
    const selectedExport = batchSelection && /key:\s*"selected-(?:csv|json|legacy|measurements|notes)"/.test(source);
    const doubleClickEdit = /doubleClickAction|double-click-action/.test(normalized);
    if (batchSelection) verifyBatchSelectionSource(file, source);
    if (persistentHighlight) verifyHighlightSource(file, source);
    if (doubleClickEdit) verifyDoubleClickEditSource(file, source);
    const expectedGlobal = EXPECTED_GLOBAL_SELECTION_TABLES.has(tableId) ? "global-selection" : "panel-local";
    if (selectionContract !== expectedGlobal) throw new Error(`${tableId} 主选中路由漂移：${selectionContract}/${expectedGlobal}`);
    return {
      tableId,
      file,
      rows,
      selectedId: boundProp(normalized, "selected-id"),
      columnWidths: boundProp(normalized, "column-widths"),
      independentlyFilterable,
      sortable: hasBooleanProp(normalized, "sortable"),
      selectionContract,
      selectionNote: tableId === "NotesPanel.vue#1" ? "非 orphan 行才进入全局 Selection" : selectionContract === "global-selection" ? "行 click 经 Vue handler 与 wrapper callback 同步全局 Selection" : "行 click 只更新面板局部 selectedId",
      locate: !/:show-locate-action="false"/.test(normalized),
      doubleClickEdit,
      resizable: hasBooleanProp(normalized, "resizable-columns"),
      virtualCapable: true,
      emptyState: /empty-text=|:empty-text=/.test(normalized),
      actionableEmptyState: /:empty-action=/.test(normalized),
      batchSelection,
      batchContract: batchSelection ? batchSelectionContract(file) : "无 checkbox 批量集合",
      persistentHighlight,
      highlightContract: persistentHighlight ? "仅显式动作写入 persistent highlight；过滤无效对象并截到 100；不写 EditHistory 或地图 checksum" : "无显式地图高亮动作",
      selectedExport,
      locateHistory: "定位只移动视口 / selection，不写 EditHistory",
      editHistory: doubleClickEdit ? "双击只打开编辑入口；实际提交由二级表单 callback/command 划定历史" : "无双击编辑提交",
      evidenceStatus: "E-C",
      browserEvidence: "pending-Q107",
      sourceRefs: [
        {file, token: normalized.slice(0, 360)},
        {file: FILES.objectTable, tokens: ["handleRowClick", "handleRowDoubleClick", "handleSelectAllChange", "VIRTUAL_ROW_HEIGHT = 32"]},
        ...(doubleClickEdit ? [{file, pattern: "function openRenameEditor\\(row\\)[\\s\\S]*?if \\([^\\n]+\\) props\\.callbacks\\.onSelect\\?\\.\\(row\\)"}] : []),
        ...(batchSelection ? batchSelectionSourceRefs(file) : []),
        ...(persistentHighlight ? [{file, tokens: ['key: "highlight-selected"', "onHighlight"]}, {file: FILES.persistentHighlights, tokens: ["MAX_PERSISTENT_OBJECT_HIGHLIGHTS = 100", "normalizePersistentHighlights"]}, {file: FILES.runtime, tokens: ["requested.slice(0, MAX_PERSISTENT_OBJECT_HIGHLIGHTS)", "strictLimit === true"]}, {file: FILES.panelHighlightActions, tokens: ["callbacks.onHighlight"]}] : []),
        ...(selectedExport ? [{file, pattern: 'key:\\s*"selected-(?:csv|json|legacy|measurements|notes)"'}] : [])
      ]
    };
  });
}

function discoverSelectionContract(file, componentSource, tableTag) {
  const expression = attributeValue(tableTag, "@select");
  let callbackName = expression.match(/callbacks\.(on[A-Z]\w*)/)?.[1] || "";
  if (!callbackName && /^[A-Za-z_$][\w$]*$/.test(expression)) {
    const functionStart = componentSource.indexOf(`function ${expression}`);
    if (functionStart >= 0) {
      const brace = componentSource.indexOf("{", functionStart);
      const body = balancedSlice(componentSource, brace, "{", "}");
      callbackName = body.match(/props\.callbacks\.(on[A-Z]\w*)/)?.[1] || "";
    }
  }
  if (!callbackName) throw new Error(`${file} 无法解析表格 select handler：${expression}`);
  const wrapper = panelWrapperFile(file);
  if (!existsSync(join(REPO_ROOT, wrapper))) throw new Error(`${file} 缺少面板 wrapper：${wrapper}`);
  const wrapperSource = readText(wrapper);
  const callbackStart = wrapperSource.indexOf(`${callbackName}:`);
  if (callbackStart < 0) throw new Error(`${wrapper} 缺少 ${callbackName} 回调`);
  const arrow = wrapperSource.indexOf("=>", callbackStart);
  if (arrow < 0) throw new Error(`${wrapper} 的 ${callbackName} 不是可解析箭头回调`);
  const bodyStart = wrapperSource.slice(arrow + 2).search(/\S/) + arrow + 2;
  const callbackScope = wrapperSource[bodyStart] === "{"
    ? balancedSlice(wrapperSource, bodyStart, "{", "}")
    : wrapperSource.slice(bodyStart, wrapperSource.indexOf("\n", bodyStart));
  return /callbacks\.onSelect\w*\?\./.test(callbackScope) ? "global-selection" : "panel-local";
}

function discoverPersistentHighlight(file, source, rows, batchSelection) {
  if (!batchSelection || !source.includes('key: "highlight-selected"') || !source.includes("onHighlight")) return false;
  if (basename(file) !== "EconomyPanel.vue") return true;
  return /deal/i.test(rows);
}

function verifyBatchSelectionSource(file, source) {
  if (basename(file) === "NamebasePanel.vue") {
    requireTokens(file, source, ["selectedNamebaseIds = ref([])", "selectedNamebaseIds.value = selectedNamebaseIds.value.filter"]);
    return;
  }
  if (basename(file) === "OceanCurrentPanel.vue") {
    requireTokens(file, source, ["selectedRowIds = ref([])", "@selection-change=\"selectedRowIds = $event\""]);
    return;
  }
  requireTokens(file, source, ["useVisibleRowSelection"]);
}

function batchSelectionContract(file) {
  if (basename(file) === "OceanCurrentPanel.vue") {
    return "checkbox 只更新面板本地 selectedRowIds；不触发主选中；当前筛选变化不主动裁去不可见 id，不持久化";
  }
  if (basename(file) === "NamebasePanel.vue") {
    return "checkbox 只更新名称库本地批量集合；不触发主选中；可见行变化时裁去不可见 id，不持久化";
  }
  return "checkbox 只更新可见行批量集合；不触发主选中，筛选或排序后裁去不可见 id，不持久化";
}

function batchSelectionSourceRefs(file) {
  if (basename(file) === "OceanCurrentPanel.vue") {
    return [{file, tokens: ["selectedRowIds = ref([])", "@selection-change=\"selectedRowIds = $event\""]}];
  }
  if (basename(file) === "NamebasePanel.vue") {
    return [{file, tokens: ["selectedNamebaseIds = ref([])", "selectedNamebaseIds.value = selectedNamebaseIds.value.filter"]}];
  }
  return [{file: FILES.visibleSelection, tokens: ["watch(visibleRows", "selectedRowIds.value = selectedRowIds.value.filter"]}];
}

function verifyHighlightSource(file, source) {
  requireTokens(file, source, ["highlight-selected", "onHighlight"]);
}

function verifyDoubleClickEditSource(file, source) {
  const editor = source.match(/function openRenameEditor\(row\) \{[\s\S]*?\n\}/)?.[0] || "";
  if (!/if \([^\n]+\) props\.callbacks\.onSelect\?\.\(row\);/.test(editor)) {
    throw new Error(`${file} 双击编辑入口必须只在目标尚未选中时补选`);
  }
}

function verifyTableSemanticDenominators(tables) {
  compareIdSets("持久高亮表格", tables.filter(item => item.persistentHighlight).map(item => item.tableId), EXPECTED_HIGHLIGHT_TABLES);
  compareIdSets("选中导出表格", tables.filter(item => item.selectedExport).map(item => item.tableId), EXPECTED_SELECTED_EXPORT_TABLES);
}

function compareIdSets(label, discovered, expectedSet) {
  const actual = [...discovered].sort();
  const expected = [...expectedSet].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}源码推导与契约不一致：${JSON.stringify({actual, expected})}`);
}

function buildActionDockHosts(panelFiles) {
  return panelFiles.filter(file => readText(file).includes("<UiActionDock")).map(file => {
    const source = readText(file);
    const dockTags = extractTags(templateSource(source), ["UiActionDock"]);
    if (dockTags.length !== 1) throw new Error(`${file} 当前必须恰好包含一个 UiActionDock，实际 ${dockTags.length}`);
    const dockTag = normalizeTag(dockTags[0]);
    const hostId = attributeValue(dockTag, "host-id");
    const actionVariable = attributeValue(dockTag, "actions");
    if (!hostId || !actionVariable) throw new Error(`${file} 的 UiActionDock 缺少稳定 host-id 或 actions 绑定`);
    const arraySource = actionArraySource(file, source, actionVariable);
    const keys = [...arraySource.matchAll(/\bkey:\s*"([^"]+)"/g)].map(match => match[1]);
    const actions = keys.map(key => buildActionDockAction({file, arraySource, hostId, key}));
    return {hostId, file, actionCount: actions.length, actions};
  }).sort((left, right) => left.hostId.localeCompare(right.hostId));
}

function buildActionDockAction({file, arraySource, hostId, key}) {
  const source = readText(file);
  const objectSource = actionObjectSource(file, arraySource, key);
  const resultClass = objectSource.match(/\bresultClass:\s*"([^"]+)"/)?.[1];
  if (!["toggle-canvas-mode", "open-secondary", "direct", "open-other-panel"].includes(resultClass)) {
    throw new Error(`${file} 的动作 ${key} 缺少合法 resultClass`);
  }
  const hasSlot = source.includes(`<template #${key}>`);
  if (resultClass === "open-secondary" && !hasSlot) throw new Error(`${file} 的二级动作 ${key} 缺少同名 slot`);
  if (resultClass !== "open-secondary" && hasSlot) throw new Error(`${file} 的非二级动作 ${key} 不得持有同名 slot`);
  if (resultClass === "toggle-canvas-mode" && !objectSource.includes("panel: false")) throw new Error(`${file} 的模式动作 ${key} 缺少 panel:false`);
  return {
    actionId: `${hostId}:${key}`,
    hostId,
    file,
    key,
    resultClass,
    result: resultClass === "toggle-canvas-mode" ? "直接切换画布模式，不打开二级面板"
      : resultClass === "open-secondary" ? "切换同名二级编辑面板"
      : resultClass === "open-other-panel" ? "直接打开其它管理面板，不打开本宿主二级面板"
      : "立即执行，不打开二级面板",
    historyBoundary: resultClass === "open-secondary" ? "打开 / 关闭面板不写历史；面板内显式提交才进入 callback/command"
      : resultClass === "toggle-canvas-mode" ? "切换模式不写历史；合法画布提交由模式命令写历史"
      : "入口本身不写地图历史",
    evidenceStatus: "E-C",
    browserEvidence: "pending-Q107",
    sourceRef: {file, tokens: [`host-id="${hostId}"`, `key: "${key}"`, `resultClass: "${resultClass}"`]}
  };
}

function actionArraySource(file, source, variable) {
  const declaration = source.indexOf(`const ${variable} =`);
  if (declaration < 0) throw new Error(`${file} 缺少动作数组声明：${variable}`);
  const start = source.indexOf("[", declaration);
  if (start < 0) throw new Error(`${file} 的动作数组没有起始方括号：${variable}`);
  return balancedSlice(source, start, "[", "]");
}

function actionObjectSource(file, arraySource, key) {
  const keyIndex = arraySource.indexOf(`key: "${key}"`);
  const objectStart = arraySource.lastIndexOf("{", keyIndex);
  if (keyIndex >= 0 && objectStart >= 0) return balancedSlice(arraySource, objectStart, "{", "}");
  throw new Error(`${file} 缺少动作对象：${key}`);
}

function balancedSlice(source, start, open, close) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let cursor = start; cursor < source.length; cursor++) {
    const character = source[cursor];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === open) depth++;
    else if (character === close && --depth === 0) return source.slice(start, cursor + 1);
  }
  throw new Error(`无法解析配对范围：${open}${close}`);
}

function buildDictionaries() {
  return {
    fieldCommitClasses: {
      "explicit-apply": {commitTiming: "字段内部保留草稿，submit / apply 后才调用宿主", historyBoundary: "草稿输入不写历史；宿主 apply callback 的 command/API 是提交边界", validationAndRecovery: "组件或宿主在 apply 前校验；no-op 保持草稿并显示既有反馈"},
      "immediate-change": {commitTiming: "change / select / update:model-value 时立即调用宿主", historyBoundary: "每次有效变更是否写历史由宿主 callback/command 决定，不由字段组件自行写入", validationAndRecovery: "无效值由 options/validator 拒绝；恢复依赖宿主状态回灌"},
      "input-preview-change-commit": {commitTiming: "input 用于连续预览，change 是提交时机；仅监听 input 的宿主视为局部预览状态", historyBoundary: "input 不应逐帧写历史；change 对应的宿主 command 才是历史边界", validationAndRecovery: "min/max/step 约束输入；取消由宿主恢复预览前状态"},
      "live-local-parameter": {commitTiming: "input 立即更新笔刷、选区、预检或导入参数，由后续画布手势 / 应用动作消费；当前字段没有 change 提交", historyBoundary: "参数变化本身不写 EditHistory；后续合法画布手势或显式应用的 command 才形成历史", validationAndRecovery: "min/max/step 约束参数；取消后由拥有工作区保留或重置参数，不产生地图回滚"},
      "draft-confirm": {commitTiming: "v-model 或原生值只更新局部草稿 / 导出参数，显式预检、应用、确认或导出时才消费", historyBoundary: "草稿不写地图历史；确认 callback/command 决定历史，纯导出不写历史", validationAndRecovery: "确认前执行宿主预检；关闭或取消按宿主草稿重置契约恢复"}
    },
    fieldEffects: {
      "ui-local": {historyBoundary: "只更新工作区选择、筛选、笔刷 / 预检参数或导出参数", historyEffect: "0 条 EditHistory；不改变地图 checksum"},
      "deferred-command": {historyBoundary: "当前字段只更新局部草稿；后续显式预检 / 应用 / 确认才可调用地图命令", historyEffect: "字段变化为 0；后续有效命令至多 1 条，invalid / no-op 为 0"},
      "map-command": {historyBoundary: "当前 apply / change 经 Vue handler、panel wrapper 进入 runtime 编辑命令", historyEffect: "有效变更写 1 条 EditHistory；invalid / no-op 为 0"}
    },
    tableActions: {
      primary: "行 click 只改变单一 selectedId；是否同步全局 Selection 由宿主决定",
      batch: "checkbox 只改变批量集合，不触发行 select；是否随可见行裁剪由各宿主真实契约记录，均不持久化",
      highlight: "显式动作才写持久高亮，最多 100 个；不写 EditHistory 或 checksum",
      locate: "只定位视口 / 对象，不写 EditHistory",
      doubleClick: "浏览器 click 序列负责主选中，dblclick 只 emit edit；宿主仅在 selection 尚未同步时条件补选，编辑提交仍在二级表单",
      sortAndFilter: "只改变列表投影与偏好，不改地图业务数据",
      resize: "只持久化列宽偏好，不写地图历史",
      export: "读取当前可见或批量行生成文件，不写地图历史"
    },
    actionResults: {
      "toggle-canvas-mode": "直接进入 / 退出画布模式",
      direct: "直接执行动作",
      "open-secondary": "打开动作坞二级编辑面板",
      "open-other-panel": "打开其它管理工作区，不打开本宿主二级面板"
    }
  };
}

function buildVisualEvidence() {
  const tableSource = readText(FILES.objectTable);
  const styles = readText(FILES.styles);
  requireTokens(FILES.objectTable, tableSource, ["const VIRTUAL_ROW_HEIGHT = 32", "const VIRTUAL_THRESHOLD = 120", "const VIRTUAL_OVERSCAN_ROWS = 8"]);
  requireTokens(FILES.styles, styles, [".object-table-native th,", "padding: 6px 8px;", "line-height: 1.35;", "--el-font-size-small: 12px;", ".table-icon-action", "height: 28px;"]);
  return {
    tokenBasis: ["--el-font-size-small: 12px", "--ui-segmented-height: 28px", "--ui-segmented-font-size: 12px"],
    sharedComponentBasis: [FILES.objectTable, FILES.actionDock],
    geometryBasis: {
      virtualRowHeight: 32,
      virtualThreshold: 120,
      virtualOverscanRows: 8,
      tableCellPadding: "6px 8px",
      tableLineHeight: 1.35,
      locateButtonHeight: 28,
      locateRowMinimumHeight: 41,
      fixedCssRowHeight: false
    },
    evidenceStatus: "E-C",
    browserEvidence: "pending-Q107"
  };
}

function buildFindings() {
  return [
    finding("IA-104-003", "表格虚拟行高与 CSS 几何模型不一致", "UiObjectTable 固定按 32px 计算 spacer 和居中；19 个带定位列的表格行至少包含 28px 高按钮、上下各 6px 的 td padding 和 1px border，最小行高约 41px，其余 7 个表格也没有固定 32px CSS。", "长表超过 120 行启用虚拟化后，窗口起点、spacer 和选中居中会产生累计偏差。", "第 215 项用统一行高 token 与真实浏览器测量收口。", "P1", "代码确认", false, [FILES.objectTable, FILES.styles])
  ];
}

function crossResultActionKeys(actions) {
  const results = new Map();
  for (const action of actions) {
    if (!results.has(action.key)) results.set(action.key, new Set());
    results.get(action.key).add(action.resultClass);
  }
  return [...results.entries()].filter(([, classes]) => classes.size > 1).map(([key]) => key).sort();
}

function finding(findingId, title, behavior, impact, recommendation, severity, confidence, intB, sourceFiles) {
  return {findingId, title, behavior, impact, recommendation, severity, confidence, intB, evidenceStatus: "E-C", browserEvidence: "pending-Q107", sourceFiles};
}

function dynamicMultiplicity(file) {
  if (file === "HeightPanel.vue") return ["调色板行与批量调色板项按导入颜色桶 v-for 展开：模板计 1，运行时数量不固定"];
  if (file === "StatePanel.vue") return ["拆分省份候选按当前国家省份 v-for 展开：模板计 1，运行时数量不固定"];
  if (file === "ClimatePanel.vue") return ["下游重算候选按当前 stale 系统展开：模板计 1，运行时数量不固定"];
  return [];
}

function panelWrapperFile(componentFile) {
  const name = basename(componentFile, ".vue").replace(/Panel$/, "");
  const kebab = name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  return `app/webgl-generator/src/ui/panels/${kebab}-panel.js`;
}

function extractExceptionFieldTags(template) {
  return extractTags(template, ["input", "select", "textarea", "ElInput", "ElInputNumber", "ElSelect", "ElRadioGroup", "ElCheckbox", "ElSwitch", "ElSlider"])
    .filter(tag => !/type="hidden"/.test(tag));
}

function extractTags(source, names) {
  const allowed = new Set(names);
  const tags = [];
  for (let index = 0; index < source.length; index++) {
    if (source[index] !== "<" || source[index + 1] === "/" || source[index + 1] === "!" || source[index + 1] === "?") continue;
    const name = source.slice(index + 1).match(/^([A-Za-z][\w-]*)/)?.[1];
    if (!allowed.has(name)) continue;
    let quote = "";
    let cursor = index + name.length + 1;
    for (; cursor < source.length; cursor++) {
      const character = source[cursor];
      if (quote) {
        if (character === quote && source[cursor - 1] !== "\\") quote = "";
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
        continue;
      }
      if (character === ">") break;
    }
    if (cursor >= source.length) throw new Error(`标签未闭合：${name}`);
    tags.push(source.slice(index, cursor + 1));
    index = cursor;
  }
  return tags;
}

function templateSource(source) {
  return source.split("<script setup>")[0];
}

function scopedSource(source, anchor, endToken) {
  const start = source.indexOf(anchor);
  if (start < 0) throw new Error(`缺少范围起点：${anchor}`);
  const end = source.indexOf(endToken, start);
  if (end < 0) throw new Error(`缺少范围终点：${endToken}`);
  return source.slice(start, end);
}

function normalizeTag(tag) {
  return tag.replace(/\s+/g, " ").trim();
}

function attributeValue(tag, name) {
  return tag.match(new RegExp(`(?:^|\\s):?${name}="([^"]+)"`))?.[1] || "";
}

function boundProp(tag, name) {
  return attributeValue(tag, name);
}

function hasBooleanProp(tag, name) {
  return new RegExp(`(?:^|\\s)${name}(?:\\s|/?>|=)`).test(tag) && !new RegExp(`:${name}="false"`).test(tag);
}

function requireTokens(file, source, tokens) {
  for (const token of tokens) if (!source.includes(token)) throw new Error(`${file} 缺少静态证据：${token}`);
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function digestFiles(files) {
  const hash = createHash("sha256");
  for (const file of files) hash.update(file).update("\0").update(readText(file)).update("\0");
  return hash.digest("hex");
}

function readText(file) {
  return readFileSync(join(REPO_ROOT, file), "utf8");
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function renderMarkdown(report) {
  const t = report.totals;
  return [
    "# 复杂工作区、表格与批量任务审计",
    "",
    `- 面板分母：${t.panelProfiles}；复杂工作区：${t.complexWorkspaces}`,
    `- 复杂工作区字段模板：${t.complexWorkspaceFields}（共享 ${t.sharedFields} / 原生与 Element 例外 ${t.exceptionFields} / 导出参数 ${t.exportParameterFields}）`,
    `- 对象表格：${t.tableHosts} 个宿主 / ${t.tableInstances} 个实例；独立筛选 ${t.independentlyFilterable}；排序 ${t.sortable}`,
    `- 主选中：${t.primarySelection}（全局 ${t.globalSelection} / 面板局部 ${t.localSelection}）；批量集合 ${t.batchSelection}；持久高亮 ${t.persistentHighlight}`,
    `- 定位 ${t.locate}；双击编辑 ${t.doubleClickEdit}；列宽 ${t.resizable}；虚拟列表 ${t.virtualCapable}；可恢复空态 ${t.actionableEmptyState}`,
    `- 动作坞：${t.actionDockHosts} 个宿主 / ${t.actionDockActions} 个动作（${t.uniqueActionKeys} 个 unique key）= 模式 ${t.toggleModeActions} + 直接 ${t.directActions} + 二级面板 ${t.secondaryPanelActions} + 其它面板 ${t.otherPanelActions}`,
    `- 未分类字段 / 未解析表格 / 未解析动作：${t.unknownFields} / ${t.unresolvedTables} / ${t.unresolvedActions}`,
    "",
    "## 静态发现",
    "",
    ...report.findings.flatMap(item => [`### ${item.findingId} ${item.title}`, "", `${item.behavior} 影响：${item.impact}`, ""]),
    "## 复杂工作区",
    "",
    "| 工作区 | 字段模板 | 动态实例说明 |",
    "|---|---:|---|",
    ...report.complexWorkspaces.map(item => `| ${item.label} | ${item.fieldTemplates} | ${item.dynamicMultiplicity.join("；") || "无动态倍增"} |`),
    "",
    "## 表格实例",
    "",
    "| 表格 | 筛选 / 排序 | 主选中 | 批量 / 高亮 | 定位 / 双击 |",
    "|---|---|---|---|---|",
    ...report.tableInstances.map(item => `| \`${item.tableId}\` | ${item.independentlyFilterable ? "是" : "否"} / ${item.sortable ? "是" : "否"} | ${item.selectionContract} | ${item.batchSelection ? "是" : "否"} / ${item.persistentHighlight ? "是" : "否"} | ${item.locate ? "是" : "否"} / ${item.doubleClickEdit ? "是" : "否"} |`),
    "",
    "浏览器证据统一保留为 `pending-Q107`；本报告只形成 `E-C`，不修改正式应用业务或交互。",
    ""
  ].join("\n");
}

function checkGenerated(report, outputRoot = OUTPUT_ROOT) {
  const expected = {
    "complex-workspaces.json": stableJson(report),
    "complex-workspaces.md": renderMarkdown(report)
  };
  for (const [name, content] of Object.entries(expected)) {
    const path = join(outputRoot, name);
    let actual = "";
    try { actual = readFileSync(path, "utf8"); } catch { throw new Error(`缺少生成报告：${path}`); }
    if (actual !== content) throw new Error(`生成报告已陈旧：${path}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const report = buildComplexWorkspaceAudit();
  if (process.argv.includes("--check")) checkGenerated(report);
  else writeComplexWorkspaceAudit();
  console.log(JSON.stringify({totals: report.totals, findings: report.findings.map(item => item.findingId)}, null, 2));
}
