<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="notes-panel-summary" />

  <div class="notes-panel-controls">
    <UiFilterInput :model-value="state.filter" placeholder="筛选类型 / 名称 / id / 正文" @update:model-value="callbacks.onFilter" />
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
    :actions="notesListActions"
    @export="handleNotesExport"
    @action="handleNotesAction"
  />

  <UiDetailGrid class-name="notes-panel-details" empty-text="未选中备注" :rows="detailRows" />

  <div v-if="selected" class="notes-panel-preview">
    {{ selected.body || "空备注" }}
  </div>
</template>

<script setup>
import {computed} from "vue";
import {OBJECT_KIND, OBJECT_KIND_LABEL} from "../../../runtime/object-kinds.js";
import {resolveObject} from "../../../runtime/object-resolver.js";
import {formatNumber as formatDisplayNumber} from "../../display-units.js";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiPanelIoActions from "./base/UiPanelIoActions.vue";
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
const HIGHLIGHTABLE_NOTE_KINDS = new Set([
  OBJECT_KIND.CITY,
  OBJECT_KIND.LABEL,
  OBJECT_KIND.MARKER,
  OBJECT_KIND.ROUTE,
  OBJECT_KIND.RIVER,
  OBJECT_KIND.LAKE,
  OBJECT_KIND.MILITARY,
  OBJECT_KIND.STATE,
  OBJECT_KIND.PROVINCE,
  OBJECT_KIND.CULTURE,
  OBJECT_KIND.RELIGION,
  OBJECT_KIND.REGION,
  OBJECT_KIND.ZONE
]);
const sortOptions = Object.freeze([
  {key: "updatedAt", label: "更新时间"},
  {key: "kindLabel", label: "类型"},
  {key: "name", label: "名称"},
  {key: "bodyLength", label: "字数"}
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
const highlightableNoteRows = computed(() => selectedNoteRows.value.filter(row => row.object && !row.orphan && HIGHLIGHTABLE_NOTE_KINDS.has(row.object.kind)));
const notesExportActions = computed(() => [
  {key: "notes", label: "导出备注摘要", disabled: !visibleRows.value.length},
  {key: "selected-notes", label: `导出选中 ${formatNumber(selectedNoteRows.value.length)}`, disabled: !selectedNoteRows.value.length}
]);
const selected = computed(() => rows.value.find(row => row.id === props.state.selectedNoteId) || null);
const notesListActions = computed(() => [
  {key: "highlight-selected", label: `高亮备注对象 ${formatNumber(highlightableNoteRows.value.length)}`, icon: "◉", disabled: !highlightableNoteRows.value.length},
  {key: "clear-highlights", label: `清除高亮 ${formatNumber(props.state.highlightCount || 0)}`, icon: "○", disabled: !props.state.highlightCount},
  {key: "locate", label: "定位备注对象", icon: "⌖", disabled: !selected.value || selected.value.orphan},
  {key: "delete", label: "删除选中备注", icon: "×", disabled: !selected.value}
]);
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

function handleNotesAction(key) {
  if (key === "highlight-selected") {
    props.callbacks.onHighlight?.(highlightableNoteRows.value);
    return;
  }
  if (key === "clear-highlights") {
    props.callbacks.onClearHighlights?.();
    return;
  }
  if (!selected.value) return;
  if (key === "locate" && !selected.value.orphan) props.callbacks.onLocate?.(selected.value);
  if (key === "delete") props.callbacks.onDelete?.(selected.value);
}

function formatNumber(value) {
  return formatDisplayNumber(value, unitPreferences.value);
}
</script>
