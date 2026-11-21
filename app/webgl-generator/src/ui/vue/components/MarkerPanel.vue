<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="marker-panel-summary" />

  <div class="marker-panel-controls list-filter-toolbar">
    <UiSegmented label="对象类型" :options="scopeOptions" :model-value="state.scope" @select="callbacks.onScope" />
    <UiFilterInput :model-value="state.filter" placeholder="筛选名称 / 编号 / 类型 / 国家 / 省份" @update:model-value="callbacks.onFilter" />
  </div>

  <div class="marker-edit-toolbar list-filter-toolbar">
    <UiSelectField class-name="marker-resource-select" label="新增通用标记" :model-value="markerDraft.type" :options="markerTypeOptions" @update:model-value="markerDraft.type = $event" />
    <div class="list-toolbar-actions">
      <UiButton variant="secondary" :disabled="!selected" :active="state.editMode === 'move'" @click="startMoveSelected">移动</UiButton>
      <UiButton variant="secondary" :disabled="!state.editMode" @click="callbacks.onCancelEdit?.()">取消</UiButton>
      <UiButton class="marker-regenerate-button" variant="danger" @click="callbacks.onRegenerateResources?.()">重新生成资源点</UiButton>
    </div>
  </div>

  <div v-if="editStatus" class="marker-edit-status">{{ editStatus }}</div>
  <UiRegenerationLockActions v-bind="regenerationLocks.actionProps" v-on="regenerationLocks.actionListeners" />
  <UiObjectTable
    v-bind="regenerationLocks.tableProps"
    v-on="regenerationLocks.tableListeners"
    :columns="columns"
    :column-widths="state.columnWidths"
    :rows="visibleRows"
    :hover-row="state.open ? callbacks.onHover : null"
    :sort-key="state.sortKey"
    :sort-direction="state.sortDir"
    :sort-options="sortOptions"
    sortable
    @sort="callbacks.onSort"
    :selected-id="activeSelectedMarkerId"
    :doubleClickAction="'edit'"
    empty-text="没有匹配的资源点或通用标记"
    :empty-action="markerEmptyAction"
    resizable-columns
    selectable-rows
    :selected-row-ids="selectedMarkerIds"
    @select="callbacks.onSelect"
    @locate="callbacks.onLocate"
    @edit="openRenameEditor"
    @empty-action="handleEmptyAction"
    @column-resize="callbacks.onColumnResize"
    @selection-change="selectedMarkerIds = $event"
  />

  <UiPanelIoActions
    class-name="marker-panel-list-actions"
    label="资源点与通用标记列表操作"
    :actions="markerListActions"
    @action="handleMarkerListAction"
  />

  <UiDetailGrid ref="detailGrid" :key="selected?.id" class-name="marker-panel-details" empty-text="未选中资源点或通用标记" :rows="detailRows" />

</template>

<script setup>
import {Delete, Plus, Rank, RefreshLeft} from "@element-plus/icons-vue";
import {computed, nextTick, reactive, ref, watch} from "vue";
import {MARKER_TYPE_OPTIONS} from "../../../generator/markers.js";
import {MARKER_SYMBOL_OPTIONS, resolveMarkerIconVisual} from "../../../renderer/canvas-icon-registry.js";
import UiButton from "./base/UiButton.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiPanelIoActions from "./base/UiPanelIoActions.vue";
import UiRegenerationLockActions from "./base/UiRegenerationLockActions.vue";
import UiSelectField from "./base/UiSelectField.vue";
import UiSegmented from "./base/UiSegmented.vue";
import {formatNumber as formatDisplayNumber} from "../../display-units.js";
import {findByObjectId, sameObjectId} from "../../object-id.js";
import {compareRowsByKey} from "../../sort-utils.js";
import {readObjectNote} from "../../../runtime/object-notes.js";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";
import {useVisibleRowSelection} from "../composables/use-visible-row-selection.js";
import {useRegenerationLockSelection} from "../composables/use-regeneration-lock-selection.js";

defineOptions({
  name: "MarkerPanel"
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

const scopeOptions = Object.freeze([
  {value: "all", label: "全部"},
  {value: "resource", label: "资源点"},
  {value: "marker", label: "通用标记"}
]);

const sortOptions = Object.freeze([
  {key: "economicValue", label: "潜力"},
  {key: "categoryLabel", label: "类别"},
  {key: "stateName", label: "国家"},
  {key: "id", label: "ID"}
]);

const columns = Object.freeze([
  {key: "id", label: "ID", align: "right"},
  {key: "name", label: "名称"},
  {key: "categoryLabel", label: "类别"},
  {key: "resourceLabel", label: "资源"},
  {key: "stateName", label: "国家"},
  {key: "economicValue", label: "潜力", align: "right", format: value => formatNumber(value)}
]);

const symbolOptions = MARKER_SYMBOL_OPTIONS;

const paletteOptions = Object.freeze([
  {value: "natural", label: "自然"},
  {value: "water", label: "水文"},
  {value: "resource", label: "资源"},
  {value: "infrastructure", label: "设施"},
  {value: "trade", label: "商旅"},
  {value: "hazard", label: "危险"},
  {value: "culture", label: "文化"},
  {value: "settlement", label: "活动"},
  {value: "mystery", label: "异象"}
]);

const markerTypeOptions = MARKER_TYPE_OPTIONS;
const unitPreferences = useUnitPreferences();

const visualDraft = reactive({
  symbol: "marker",
  palette: "mystery"
});

const markerDraft = reactive({
  type: markerTypeOptions.find(option => option.value === "encounters")?.value || markerTypeOptions[0]?.value || "encounters"
});

const detailGrid = ref(null);
const renameRequestId = ref(null);
const metrics = computed(() => {
  props.state.version;
  return buildMarkerMetrics(props.state.map);
});
const scopedRows = computed(() => applyScope(metrics.value.rows, props.state.scope));
const visibleRows = computed(() => sortRows(filterRows(scopedRows.value, props.state.filter), props.state.sortKey, props.state.sortDir));
const regenerationLocks = useRegenerationLockSelection({panelId: "marker-panel", kind: "marker", rows: visibleRows});
const {selectedRowIds: selectedMarkerIds} = useVisibleRowSelection(visibleRows);
const filterEmptyAction = computed(() => String(props.state.filter || "").trim()
  ? {key: "clear-filter", label: "清空筛选", icon: RefreshLeft}
  : null);
const defaultMarkerEmptyAction = Object.freeze({key: "add", label: "放置通用标记", icon: Plus});
const markerEmptyAction = computed(() => filterEmptyAction.value || defaultMarkerEmptyAction);
const activeSelectedMarkerId = computed(() => {
  const selectionId = props.state.selection?.object?.kind === "marker" ? props.state.selection.object.id : null;
  return selectionId !== null && selectionId !== undefined ? selectionId : props.state.selectedMarkerId;
});
const selected = computed(() => findByObjectId(metrics.value.rows, activeSelectedMarkerId.value));
const isAutomaticVisualDraft = computed(() => visualDraft.symbol.startsWith("type:"));
const visualSymbolOptions = computed(() => {
  if (!isAutomaticVisualDraft.value) return symbolOptions;
  return [{value: visualDraft.symbol, label: symbolLabel(visualDraft.symbol)}, ...symbolOptions];
});
const markerListActions = computed(() => [
  {...defaultMarkerEmptyAction, active: props.state.editMode === "add", disabled: props.state.editMode === "move"},
  {key: "move", label: "移动选中对象", icon: Rank, active: props.state.editMode === "move", disabled: !selected.value || props.state.editMode === "add"},
  {key: "delete", label: "删除选中对象", icon: Delete, disabled: !selected.value || Boolean(props.state.editMode)}
]);

const summaryMetrics = computed(() => [
  {label: "标记", value: formatNumber(metrics.value.total)},
  {label: "资源点", value: formatNumber(metrics.value.resources)},
  {label: "资源潜力", value: formatNumber(metrics.value.resourcePotential)},
  {label: "筛选", value: formatNumber(visibleRows.value.length)}
]);

const detailRows = computed(() => selected.value ? [
  {label: "配色", value: paletteLabel(visualDraft.palette),
    editor: {type: "select", value: visualDraft.palette, options: paletteOptions, disabled: isAutomaticVisualDraft.value, apply: palette => applyVisual({palette})}},
  {label: "名称", value: selected.value.rawName,
    editor: {value: selected.value.rawName, maxLength: 48, apply: value => props.callbacks.onRename?.(selected.value.id, value)}},
  {label: "类型", value: selected.value.typeLabel},
  {label: "类别", value: selected.value.categoryLabel},
  {label: "资源", value: selected.value.resourceLabel},
  {label: "经济潜力", value: formatNumber(selected.value.economicValue)},
  {label: "所属国家", value: selected.value.stateName},
  {label: "所属省份", value: selected.value.provinceName},
  {label: "grid cell", value: selected.value.cell, debug: true},
  {label: "pack cell", value: selected.value.packCell, debug: true},
  {label: "图形", value: symbolLabel(visualDraft.symbol),
    editor: {type: "select", value: visualDraft.symbol, options: visualSymbolOptions.value, apply: symbol => applyVisual({symbol})}},
  {label: "备注", value: selected.value.noteBody || "无",
    editor: {type: "note", value: selected.value.noteBody, maxLength: 1000, apply: body => props.callbacks.onNoteChange(selected.value.id, body)}},
  {label: "手动图标", value: selected.value.manual ? "是" : "否"}
] : []);

const editStatus = computed(() => {
  if (props.state.editMode === "add") return `放置：${markerTypeLabel(props.state.editType || markerDraft.type)}`;
  if (props.state.editMode === "move") return `移动：#${props.state.editMarkerId ?? selected.value?.id ?? "none"}`;
  return "";
});

watch(() => selected.value?.id, syncVisualDraft, {immediate: true});
watch(() => selected.value?.id, id => {
  if (!sameObjectId(renameRequestId.value, id)) return;
  renameRequestId.value = null;
  nextTick(() => {
    detailGrid.value?.edit("名称");
  });
});
watch(() => selected.value?.symbol, syncVisualDraft);
watch(() => selected.value?.palette, syncVisualDraft);

function buildMarkerMetrics(map) {
  const rows = markerRows(props.state.markers).map(marker => {
    const stateId = marker.data?.state ?? 0;
    const provinceId = marker.data?.province ?? 0;
    const storedVisual = marker.visual || marker.data?.visual || {};
    const visual = resolveMarkerIconVisual(marker.type, storedVisual);
    const note = readObjectNote(map, {kind: "marker", id: marker.id});
    return {
      id: marker.id,
      name: marker.name || marker.label || `标记 #${marker.id}`,
      rawName: marker.name || marker.label || `标记 #${marker.id}`,
      type: marker.type,
      typeLabel: marker.label || marker.type || "标记",
      category: marker.category || "mystery",
      categoryLabel: marker.categoryLabel || marker.category || "未知",
      resourceKey: marker.resourceKey || null,
      resourceLabel: marker.resourceLabel || (marker.category === "resource" ? marker.label || "资源" : "none"),
      economicValue: Number(marker.economicValue || 0),
      stateId,
      stateName: indexedName(map?.politics?.states, stateId),
      provinceId,
      provinceName: indexedName(map?.politics?.provinces || map?.pack?.provinces, provinceId),
      cell: marker.cell ?? "none",
      packCell: marker.packCell ?? "none",
      symbol: visual.symbol || "marker",
      palette: visual.palette || marker.category || "mystery",
      manual: Boolean(visual.manual),
      visualLabel: `${symbolLabel(visual.symbol || "marker")} / ${paletteLabel(visual.palette || marker.category || "mystery")}`,
      noteBody: note?.body || "",
      noteUpdatedAt: note?.updatedAt || ""
    };
  });

  return {
    rows,
    total: rows.length,
    resources: rows.filter(row => row.category === "resource").length,
    resourcePotential: rows.filter(row => row.category === "resource").reduce((sum, row) => sum + row.economicValue, 0)
  };
}

function markerRows(markers) {
  return (markers || []).filter(marker => marker && Number.isInteger(marker.id));
}

function applyScope(rows, scope) {
  if (scope === "resource") return rows.filter(row => row.category === "resource");
  if (scope === "marker") return rows.filter(row => row.category !== "resource");
  return rows;
}

function filterRows(rows, filter) {
  const query = filter.trim().toLowerCase();
  if (!query) return rows;
  return rows.filter(row =>
    String(row.id).includes(query)
    || row.name.toLowerCase().includes(query)
    || row.typeLabel.toLowerCase().includes(query)
    || row.categoryLabel.toLowerCase().includes(query)
    || row.resourceLabel.toLowerCase().includes(query)
    || row.stateName.toLowerCase().includes(query)
    || row.provinceName.toLowerCase().includes(query)
  );
}

function sortRows(rows, key, direction) {
  return [...rows].sort((a, b) => compareRowsByKey(a, b, key, direction));
}

function applyVisual(patch) {
  if (!selected.value || isAutomaticVisualDraft.value && !patch.symbol) return;
  Object.assign(visualDraft, patch);
  if (isAutomaticVisualDraft.value) return;
  if (visualDraft.symbol === selected.value.symbol && visualDraft.palette === selected.value.palette) return;
  props.callbacks.onVisualChange?.(selected.value.id, {
    symbol: visualDraft.symbol,
    palette: visualDraft.palette
  });
}

function openRenameEditor(row) {
  renameRequestId.value = row?.id ?? null;
  if (!sameObjectId(selected.value?.id, row?.id)) props.callbacks.onSelect?.(row);
  nextTick(() => {
    if (!sameObjectId(selected.value?.id, row?.id)) return;
    renameRequestId.value = null;
    detailGrid.value?.edit("名称");
  });
}

function startAddResource() {
  props.callbacks.onAddResourceMode?.(markerDraft.type);
}

function startMoveSelected() {
  if (!selected.value) return;
  props.callbacks.onMoveMode?.(selected.value.id);
}

function handleMarkerListAction(key) {
  if (key === "add") {
    startAddResource();
    return;
  }
  if (key === "move") {
    startMoveSelected();
    return;
  }
  if (key === "delete" && selected.value) props.callbacks.onDelete?.(selected.value.id);
}

function handleEmptyAction(key) {
  if (key === "clear-filter") props.callbacks.onFilter?.("");
  if (key === "add") startAddResource();
}

function syncVisualDraft() {
  visualDraft.symbol = selected.value?.symbol || "marker";
  visualDraft.palette = selected.value?.palette || selected.value?.category || "mystery";
}

function indexedName(items, id) {
  const item = items?.[id];
  return item?.fullName || item?.name || (id === undefined || id === null || id === 0 ? "none" : `#${id}`);
}

function symbolLabel(value) {
  if (String(value || "").startsWith("type:")) return `自动：${markerTypeLabel(String(value).slice(5))}`;
  return symbolOptions.find(option => option.value === value)?.label || value || "通用";
}

function paletteLabel(value) {
  return paletteOptions.find(option => option.value === value)?.label || value || "异象";
}

function markerTypeLabel(value) {
  return markerTypeOptions.find(option => option.value === value)?.label || value || "标记";
}

function formatNumber(value) {
  return formatDisplayNumber(value, unitPreferences.value);
}
</script>
