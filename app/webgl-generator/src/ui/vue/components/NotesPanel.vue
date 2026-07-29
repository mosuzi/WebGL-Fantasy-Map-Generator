<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="notes-panel-summary" />

  <div class="notes-panel-controls">
    <UiFilterInput :model-value="state.filter" placeholder="筛选类型 / 名称 / id / 正文" @update:model-value="callbacks.onFilter" />
  </div>
  <UiSelectField
    class-name="notes-import-mode"
    input-id="notes-import-mode"
    label="导入方式"
    :model-value="state.importMode"
    :options="importModeOptions"
    @update:model-value="callbacks.onImportMode"
  />

  <div v-if="state.importPreview" class="notes-import-preview namebase-import-preview is-previewing" data-ui-state="preview">
    <div class="namebase-import-preview-header">
      <strong>备注导入预检</strong>
      <span>{{ state.importPreview.filename }}</span>
    </div>
    <UiMetricGrid :metrics="importPreviewMetrics" class-name="namebase-import-preview-metrics" />
    <p class="namebase-import-preview-note">{{ importPreviewNote }}</p>
    <div v-if="state.importPreview.diagnostics?.length" class="namebase-import-preview-list">
      <span v-for="item in state.importPreview.diagnostics.slice(0, 8)" :key="`${item.index}-${item.code}-${item.id}`" :class="{conflict: item.severity === 'error'}">
        {{ item.code }} · {{ item.id || item.message }}
      </span>
    </div>
    <div class="namebase-import-preview-actions">
      <UiButton variant="secondary" @click="callbacks.onCancelImport">取消</UiButton>
      <UiButton :disabled="!state.importPreview.canImport" @click="callbacks.onConfirmImport">确认导入</UiButton>
    </div>
  </div>
  <UiObjectTable
    :columns="columns"
    :column-widths="state.columnWidths"
    :rows="visibleRows"
    :sort-key="state.sortKey"
    :sort-direction="state.sortDir"
    :sort-options="sortOptions"
    sortable
    @sort="callbacks.onSort"
    :selected-id="state.selectedNoteId"
    row-id-key="id"
    :empty-text="notesEmptyText"
    :empty-action="filterEmptyAction"
    resizable-columns
    selectable-rows
    :selected-row-ids="selectedNoteIds"
    @select="callbacks.onSelect"
    @locate="callbacks.onLocate"
    @empty-action="handleEmptyAction"
    @column-resize="callbacks.onColumnResize"
    @selection-change="selectedNoteIds = $event"
  />

  <UiPanelIoActions
    class-name="notes-panel-list-actions"
    label="备注列表操作"
    :export-actions="notesExportActions"
    :import-actions="notesImportActions"
    :actions="notesListActions"
    @export="handleNotesExport"
    @import="handleNotesImport"
    @action="handleNotesAction"
  />

  <UiDetailGrid class-name="notes-panel-details" empty-text="未选中备注" :rows="detailRows" />

  <UiStateBanner
    v-if="selected?.orphan"
    kind="orphan"
    title="原对象已不存在"
    message="这条备注仍可导出保留，但不能定位或继续编辑；如不再需要，可从当前地图删除。"
    action-label="删除这条孤儿备注"
    @action="callbacks.onDelete?.(selected)"
  />

  <div v-if="selected" class="notes-panel-preview">
    {{ selected.body || "空备注" }}
  </div>

  <UiActionDock v-if="selected && !selected.orphan" host-id="NotesPanel" v-model:active="activeAction" :actions="noteActions">
    <template #rename>
      <UiTextEditField :model-value="selected.name" :max-length="64" @apply="name => callbacks.onRename?.(selected, name)" />
    </template>
    <template #edit>
      <UiNoteField :model-value="selected.body" @apply="body => callbacks.onNoteChange?.(selected, body)" @clear="callbacks.onNoteChange?.(selected, '')" />
    </template>
  </UiActionDock>
</template>

<script setup>
import {computed, ref, watch} from "vue";
import {OBJECT_KIND_LABEL} from "../../../runtime/object-kinds.js";
import {isPersistentHighlightObjectKind} from "../../../runtime/persistent-highlights.js";
import {resolveObject} from "../../../runtime/object-resolver.js";
import {formatNumber as formatDisplayNumber} from "../../display-units.js";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiActionDock from "./base/UiActionDock.vue";
import UiButton from "./base/UiButton.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiNoteField from "./base/UiNoteField.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiPanelIoActions from "./base/UiPanelIoActions.vue";
import UiSelectField from "./base/UiSelectField.vue";
import UiTextEditField from "./base/UiTextEditField.vue";
import UiStateBanner from "./base/UiStateBanner.vue";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";
import {useVisibleRowSelection} from "../composables/use-visible-row-selection.js";
import {compareListValues} from "../../sort-utils.js";

defineOptions({
  name: "NotesPanel"
});

const props = defineProps({
  state: {
    type: Object,
    required: true
  },
  callbacks: {
    type: Object,
    default: () => ({})
  }
});

const unitPreferences = useUnitPreferences();
const activeAction = ref(null);
const noteActions = Object.freeze([
  {key: "rename", resultClass: "open-secondary", label: "重命名", icon: "✎"},
  {key: "edit", resultClass: "open-secondary", label: "编辑正文", icon: "☰"}
]);
const sortOptions = Object.freeze([
  {key: "updatedAt", label: "更新时间"},
  {key: "kindLabel", label: "类型"},
  {key: "name", label: "名称"},
  {key: "bodyLength", label: "字数"}
]);
const importModeOptions = Object.freeze([
  {value: "append", label: "追加并更新同 id"},
  {value: "replace", label: "替换全部备注"}
]);
const notesImportActions = Object.freeze([
  {key: "notes", label: "导入备注摘要", accept: ".json,application/json"}
]);

const columns = Object.freeze([
  {key: "kindLabel", label: "类型"},
  {key: "name", label: "名称"},
  {key: "excerpt", label: "摘要"},
  {key: "bodyLength", label: "字数", align: "right", format: value => formatNumber(value)}
]);

const rows = computed(() => {
  props.state.version;
  return noteRows(props.state.map);
});
const visibleRows = computed(() => sortRows(filterRows(rows.value, props.state.filter), props.state.sortKey, props.state.sortDir));
const {selectedRowIds: selectedNoteIds, selectedRows: selectedNoteRows} = useVisibleRowSelection(visibleRows);
const filterEmptyAction = computed(() => String(props.state.filter || "").trim()
  ? {key: "clear-filter", label: "清空筛选", icon: "⌫"}
  : null);
const notesEmptyText = computed(() => filterEmptyAction.value ? "没有匹配的备注" : "暂无备注");
const highlightableNoteRows = computed(() => selectedNoteRows.value.filter(row => row.object && !row.orphan && isPersistentHighlightObjectKind(row.object.kind)));
const notesExportActions = computed(() => [
  {key: "notes", label: "导出备注摘要", disabled: !visibleRows.value.length},
  {key: "selected-notes", label: `导出选中 ${formatNumber(selectedNoteRows.value.length)}`, disabled: !selectedNoteRows.value.length}
]);
const selected = computed(() => rows.value.find(row => row.id === props.state.selectedNoteId) || null);
const visibleOrphanRows = computed(() => visibleRows.value.filter(row => row.orphan));
const deleteTargetRows = computed(() => selectedNoteRows.value.length ? selectedNoteRows.value : selected.value ? [selected.value] : []);
const notesListActions = computed(() => [
  {key: "create-standalone", label: props.state.createMode ? "取消放置独立备注" : "放置独立备注", icon: "+"},
  {key: "select-orphans", label: `只选孤儿备注 ${formatNumber(visibleOrphanRows.value.length)}`, icon: "◎", disabled: !visibleOrphanRows.value.length},
  {key: "highlight-selected", label: `高亮备注对象 ${formatNumber(highlightableNoteRows.value.length)}`, icon: "◉", disabled: !highlightableNoteRows.value.length},
  {key: "clear-highlights", label: `清除高亮 ${formatNumber(props.state.highlightCount || 0)}`, icon: "○", disabled: !props.state.highlightCount},
  {key: "delete-batch", label: deleteTargetRows.value.length > 1 ? `批量删除已选 ${formatNumber(deleteTargetRows.value.length)}` : "删除选中备注", icon: "×", disabled: !deleteTargetRows.value.length}
]);
watch(() => selected.value?.id, () => { activeAction.value = null; });
const summaryMetrics = computed(() => [
  {label: "备注", value: formatNumber(rows.value.length)},
  {label: "可定位", value: formatNumber(rows.value.filter(row => !row.orphan).length)},
  {label: "孤儿备注", value: formatNumber(rows.value.filter(row => row.orphan).length)},
  {label: "已选", value: formatNumber(selectedNoteRows.value.length)},
  {label: "高亮", value: formatNumber(props.state.highlightCount || 0)},
  {label: "筛选", value: formatNumber(visibleRows.value.length)}
]);
const detailRows = computed(() => selected.value ? [
  {label: "类型", value: selected.value.kindLabel},
  {label: "名称", value: selected.value.name},
  {label: "备注 id", value: selected.value.id, debug: true},
  {label: "对象 id", value: selected.value.objectId, debug: true},
  {label: "状态", value: selected.value.orphan ? "对象缺失" : "可定位"},
  {label: "字数", value: `${formatNumber(selected.value.bodyLength)}字`},
  {label: "更新时间", value: formatDateTime(selected.value.updatedAt)}
] : []);
const importPreviewMetrics = computed(() => {
  const preview = props.state.importPreview;
  if (!preview) return [];
  return [
    {label: "可导入", value: formatNumber(preview.valid)},
    {label: "无效", value: formatNumber(preview.invalid)},
    {label: "重复 id", value: formatNumber(preview.duplicateIds)},
    {label: "孤儿", value: formatNumber(preview.missingObjects)},
    {label: "同 id 更新", value: formatNumber(preview.existingConflicts)},
    {label: "将替换", value: formatNumber(preview.replaceCount)}
  ];
});
const importPreviewNote = computed(() => {
  const preview = props.state.importPreview;
  if (!preview) return "";
  if (!preview.validDocument) return preview.diagnostics?.[0]?.message || "文档不可导入";
  const parts = [preview.mode === "replace"
    ? `确认后替换当前 ${formatNumber(preview.replaceCount)} 条备注`
    : "确认后追加新备注，并用导入内容更新同 id 备注"];
  if (preview.invalid) parts.push(`${formatNumber(preview.invalid)} 条无效记录会跳过`);
  if (preview.missingObjects) parts.push(`${formatNumber(preview.missingObjects)} 条对象缺失记录会作为孤儿备注保留`);
  return parts.join("；");
});

function noteRows(map) {
  return (map?.notes?.notes || [])
    .filter(note => note?.id)
    .map(note => {
      const object = objectFromNote(note);
      const resolved = object ? resolveObject(map, object) : null;
      const body = String(note.body || "");
      return {
        id: String(note.id),
        kind: note.kind || object?.kind || "",
        kindLabel: OBJECT_KIND_LABEL[note.kind] || note.kind || "备注",
        objectId: note.objectId ?? object?.id ?? "",
        object,
        name: note.name || resolved?.name || resolved?.fullName || note.id,
        body,
        bodyLength: body.length,
        excerpt: excerpt(body),
        updatedAt: note.updatedAt || note.createdAt || "",
        createdAt: note.createdAt || "",
        orphan: Boolean(!object || !resolved)
      };
    });
}

function objectFromNote(note) {
  const kind = String(note.kind || "").trim();
  if (!kind) return null;
  if (kind === "label") return labelObjectFromNote(note);
  const id = parseObjectId(note.objectId ?? suffixAfterKind(note.id, kind));
  if (id === null || id === "") return null;
  return {kind, id};
}

function labelObjectFromNote(note) {
  const objectId = String(note.objectId || suffixAfterKind(note.id, "label") || "");
  const [targetKind, rawTargetId] = objectId.split(":");
  if (!targetKind || rawTargetId === undefined) return null;
  const targetId = parseObjectId(rawTargetId);
  if (targetId === null || targetId === "") return null;
  return {
    kind: "label",
    id: targetId,
    targetKind,
    targetId,
    targetName: note.name || ""
  };
}

function suffixAfterKind(id, kind) {
  const prefix = `${kind}:`;
  return String(id || "").startsWith(prefix) ? String(id).slice(prefix.length) : "";
}

function parseObjectId(value) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value);
  return /^\d+$/.test(text) ? Number(text) : text;
}

function filterRows(sourceRows, filter) {
  const query = String(filter || "").trim().toLowerCase();
  if (!query) return sourceRows;
  return sourceRows.filter(row => [
    row.id,
    row.kindLabel,
    row.name,
    row.objectId,
    row.body
  ].some(value => String(value || "").toLowerCase().includes(query)));
}

function sortRows(sourceRows, key, dir) {
  const multiplier = dir === "asc" ? 1 : -1;
  return [...sourceRows].sort((a, b) => compareValue(a[key], b[key]) * multiplier);
}

function compareValue(a, b) {
  return compareListValues(a, b, "zh-Hans-CN");
}

function handleEmptyAction(key) {
  if (key === "clear-filter") props.callbacks.onFilter?.("");
}

function excerpt(body) {
  const text = String(body || "").replace(/\s+/g, " ").trim();
  if (!text) return "空备注";
  return text.length > 28 ? `${text.slice(0, 28)}...` : text;
}

function formatDateTime(value) {
  if (!value) return "未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {hour12: false});
}

function handleNotesExport(key) {
  if (key === "selected-notes") {
    props.callbacks.onExport?.(selectedNoteRows.value);
    return;
  }
  if (key === "notes") props.callbacks.onExport?.(visibleRows.value);
}

function handleNotesImport({file}) {
  if (file) props.callbacks.onImportPreview?.(file);
}

function handleNotesAction(key) {
  if (key === "create-standalone") {
    props.callbacks.onCreateStandaloneMode?.(!props.state.createMode);
    return;
  }
  if (key === "select-orphans") {
    selectedNoteIds.value = visibleOrphanRows.value.map(row => row.id);
    return;
  }
  if (key === "highlight-selected") {
    props.callbacks.onHighlight?.(highlightableNoteRows.value);
    return;
  }
  if (key === "clear-highlights") {
    props.callbacks.onClearHighlights?.();
    return;
  }
  if (key === "delete-batch") {
    if (typeof window.confirm === "function" && !window.confirm(`确定批量删除 ${deleteTargetRows.value.length} 条备注？确认后可通过一次撤销恢复。`)) return;
    props.callbacks.onDeleteBatch?.(deleteTargetRows.value);
    selectedNoteIds.value = [];
    return;
  }
  if (!selected.value) return;
  if (key === "locate" && !selected.value.orphan) props.callbacks.onLocate?.(selected.value);
}

function formatNumber(value) {
  return formatDisplayNumber(value, unitPreferences.value);
}
</script>
