<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="notes-panel-summary" />

  <div class="notes-panel-controls">
    <UiFilterInput :model-value="state.filter" placeholder="筛选类型 / 名称 / id / 正文" @update:model-value="callbacks.onFilter" />
  </div>

  <UiSortBar class-name="notes-panel-sort" :options="sortOptions" :active-key="state.sortKey" :direction="state.sortDir" @sort="callbacks.onSort" />

  <UiObjectTable
    :columns="columns"
    :rows="visibleRows"
    :selected-id="state.selectedNoteId"
    row-id-key="id"
    empty-text="暂无备注"
    @select="callbacks.onSelect"
    @locate="callbacks.onLocate"
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

  <UiHistoryActions class-name="notes-history-actions" :history="state.history" @undo="callbacks.onUndo" @redo="callbacks.onRedo" />
</template>

<script setup>
import {computed} from "vue";
import {OBJECT_KIND_LABEL} from "../../../runtime/object-kinds.js";
import {resolveObject} from "../../../runtime/object-resolver.js";
import {formatNumber as formatDisplayNumber} from "../../display-units.js";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiHistoryActions from "./base/UiHistoryActions.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiPanelIoActions from "./base/UiPanelIoActions.vue";
import UiSortBar from "./base/UiSortBar.vue";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";
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
const notesExportActions = computed(() => [
  {key: "notes", label: "导出备注摘要", disabled: !visibleRows.value.length}
]);
const selected = computed(() => rows.value.find(row => row.id === props.state.selectedNoteId) || null);
const notesListActions = computed(() => [
  {key: "locate", label: "定位备注对象", icon: "⌖", disabled: !selected.value || selected.value.orphan},
  {key: "delete", label: "删除选中备注", icon: "×", disabled: !selected.value}
]);
const summaryMetrics = computed(() => [
  {label: "备注", value: formatNumber(rows.value.length)},
  {label: "可定位", value: formatNumber(rows.value.filter(row => !row.orphan).length)},
  {label: "孤儿备注", value: formatNumber(rows.value.filter(row => row.orphan).length)},
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
  if (key === "notes") callbacks.onExport?.(visibleRows.value);
}

function handleNotesAction(key) {
  if (!selected.value) return;
  if (key === "locate" && !selected.value.orphan) callbacks.onLocate?.(selected.value);
  if (key === "delete") callbacks.onDelete?.(selected.value);
}

function formatNumber(value) {
  return formatDisplayNumber(value, unitPreferences.value);
}
</script>
