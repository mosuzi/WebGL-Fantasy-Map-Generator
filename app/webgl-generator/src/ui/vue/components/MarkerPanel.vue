<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="marker-panel-summary" />

  <div class="marker-panel-controls">
    <UiSegmented label="标记范围" :options="scopeOptions" :model-value="state.scope" @select="callbacks.onScope" />
    <UiFilterInput :model-value="state.filter" placeholder="筛选名称 / id / 类型 / 国家 / 省份" @update:model-value="callbacks.onFilter" />
  </div>

  <div class="marker-edit-toolbar">
    <UiSelectField class-name="marker-resource-select" label="新增资源" :model-value="resourceDraft.type" :options="resourceTypeOptions" @update:model-value="resourceDraft.type = $event" />
    <UiButton variant="secondary" :disabled="!selected" :active="state.editMode === 'move'" @click="startMoveSelected">移动</UiButton>
    <UiButton variant="secondary" :disabled="!state.editMode" @click="callbacks.onCancelEdit?.()">取消</UiButton>
    <UiButton class="marker-regenerate-button" variant="secondary" @click="callbacks.onRegenerateResources?.()">重生成资源点</UiButton>
  </div>

  <div v-if="editStatus" class="marker-edit-status">{{ editStatus }}</div>
  <UiObjectTable
    :columns="columns"
    :column-widths="state.columnWidths"
    :rows="visibleRows"
    :sort-key="state.sortKey"
    :sort-direction="state.sortDir"
    :sort-options="sortOptions"
    sortable
    @sort="callbacks.onSort"
    :selected-id="activeSelectedMarkerId"
    :doubleClickAction="'edit'"
    empty-text="没有匹配的资源点或标记"
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
    label="资源标记列表操作"
    :actions="markerListActions"
    @action="handleMarkerListAction"
  />

  <UiDetailGrid class-name="marker-panel-details" empty-text="未选中资源点或标记" :rows="detailRows" />

  <UiActionDock v-if="selected" v-model:active="activeAction" :actions="markerActions">
    <template #rename>
      <UiTextEditField
        class-name="marker-name-editor"
        :model-value="selected.rawName"
        :max-length="48"
        @apply="name => callbacks.onRename(selected.id, name)"
      />
    </template>

    <template #visual>
      <div class="marker-visual-editor">
        <UiSelectField class-name="marker-visual-select" label="图形" :model-value="visualDraft.symbol" :options="symbolOptions" @update:model-value="visualDraft.symbol = $event" />
        <UiSelectField class-name="marker-visual-select" label="配色" :model-value="visualDraft.palette" :options="paletteOptions" @update:model-value="visualDraft.palette = $event" />
        <UiButton variant="secondary" @click="applyVisual">应用图标</UiButton>
      </div>
    </template>

    <template #note>
      <UiNoteField
        class-name="marker-note-editor"
        :model-value="selected.noteBody"
        @apply="body => callbacks.onNoteChange(selected.id, body)"
        @clear="callbacks.onNoteChange(selected.id, '')"
      />
    </template>
  </UiActionDock>
</template>

<script setup>
import {computed, nextTick, reactive, ref, watch} from "vue";
import {MARKER_RESOURCE_TYPE_OPTIONS} from "../../../generator/markers.js";
import UiActionDock from "./base/UiActionDock.vue";
import UiButton from "./base/UiButton.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiNoteField from "./base/UiNoteField.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiPanelIoActions from "./base/UiPanelIoActions.vue";
import UiSelectField from "./base/UiSelectField.vue";
import UiSegmented from "./base/UiSegmented.vue";
import UiTextEditField from "./base/UiTextEditField.vue";
import {formatNumber as formatDisplayNumber} from "../../display-units.js";
import {findByObjectId, sameObjectId} from "../../object-id.js";
import {compareRowsByKey} from "../../sort-utils.js";
import {readObjectNote} from "../../../runtime/object-notes.js";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";
import {useVisibleRowSelection} from "../composables/use-visible-row-selection.js";

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
  {value: "marker", label: "标记"}
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

const symbolOptions = Object.freeze([
  {value: "marker", label: "通用"},
  {value: "mine", label: "矿山"},
  {value: "salt", label: "盐晶"},
  {value: "life", label: "生物"},
  {value: "gem", label: "宝石"},
  {value: "spring", label: "温泉"},
  {value: "drop", label: "水源"},
  {value: "volcano", label: "火山"},
  {value: "bridge", label: "桥梁"},
  {value: "inn", label: "驿馆"},
  {value: "tower", label: "塔楼"},
  {value: "ruin", label: "遗迹"},
  {value: "book", label: "书卷"},
  {value: "market", label: "商贸"},
  {value: "danger", label: "危险"},
  {value: "star", label: "奇观"}
]);

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

const resourceTypeOptions = MARKER_RESOURCE_TYPE_OPTIONS;
const unitPreferences = useUnitPreferences();

const visualDraft = reactive({
  symbol: "marker",
  palette: "mystery"
});

const resourceDraft = reactive({
  type: resourceTypeOptions[0]?.value || "mines"
});

const activeAction = ref(null);
const renameRequestId = ref(null);
const metrics = computed(() => {
  props.state.version;
  return buildMarkerMetrics(props.state.map);
});
const scopedRows = computed(() => applyScope(metrics.value.rows, props.state.scope));
const visibleRows = computed(() => sortRows(filterRows(scopedRows.value, props.state.filter), props.state.sortKey, props.state.sortDir));
const {selectedRowIds: selectedMarkerIds, selectedRows: selectedMarkerRows} = useVisibleRowSelection(visibleRows);
const filterEmptyAction = computed(() => String(props.state.filter || "").trim()
  ? {key: "clear-filter", label: "清空筛选", icon: "⌫"}
  : null);
const defaultMarkerEmptyAction = Object.freeze({key: "add", label: "放置资源标记", icon: "+"});
const markerEmptyAction = computed(() => filterEmptyAction.value || defaultMarkerEmptyAction);
const activeSelectedMarkerId = computed(() => {
  const selectionId = props.state.selection?.object?.kind === "marker" ? props.state.selection.object.id : null;
  return selectionId !== null && selectionId !== undefined ? selectionId : props.state.selectedMarkerId;
});
const selected = computed(() => findByObjectId(metrics.value.rows, activeSelectedMarkerId.value));
const markerActions = Object.freeze([
  {key: "rename", label: "重命名", icon: "✎"},
  {key: "visual", label: "调整图标", icon: "▣"},
  {key: "note", label: "编辑备注", icon: "☰"}
]);
const markerListActions = computed(() => [
  {...defaultMarkerEmptyAction, active: props.state.editMode === "add", disabled: props.state.editMode === "move"},
  {key: "highlight-selected", label: `高亮选中 ${formatNumber(selectedMarkerRows.value.length)}`, icon: "◉", disabled: !selectedMarkerRows.value.length},
  {key: "clear-highlights", label: `清除高亮 ${formatNumber(props.state.highlightCount || 0)}`, icon: "○", disabled: !props.state.highlightCount},
  {key: "move", label: "移动选中资源标记", icon: "⌖", active: props.state.editMode === "move", disabled: !selected.value || props.state.editMode === "add"},
  {key: "delete", label: "删除选中资源标记", icon: "×", disabled: !selected.value || Boolean(props.state.editMode)}
]);

const summaryMetrics = computed(() => [
  {label: "标记", value: formatNumber(metrics.value.total)},
  {label: "资源点", value: formatNumber(metrics.value.resources)},
  {label: "资源潜力", value: formatNumber(metrics.value.resourcePotential)},
  {label: "高亮", value: formatNumber(props.state.highlightCount || 0)},
  {label: "筛选", value: formatNumber(visibleRows.value.length)}
]);

const detailRows = computed(() => selected.value ? [
  {label: "类型", value: selected.value.typeLabel},
  {label: "类别", value: selected.value.categoryLabel},
  {label: "资源", value: selected.value.resourceLabel},
  {label: "经济潜力", value: formatNumber(selected.value.economicValue)},
  {label: "所属国家", value: selected.value.stateName},
  {label: "所属省份", value: selected.value.provinceName},
  {label: "grid cell", value: selected.value.cell, debug: true},
  {label: "pack cell", value: selected.value.packCell, debug: true},
  {label: "图形", value: selected.value.visualLabel},
  {label: "备注", value: selected.value.noteBody ? `有备注（${formatNumber(selected.value.noteBody.length)}字）` : "无"},
  {label: "手动图标", value: selected.value.manual ? "是" : "否"}
] : []);

const editStatus = computed(() => {
  if (props.state.editMode === "add") return `放置：${resourceTypeLabel(props.state.editType || resourceDraft.type)}`;
  if (props.state.editMode === "move") return `移动：#${props.state.editMarkerId ?? selected.value?.id ?? "none"}`;
  return "";
});

watch(() => selected.value?.id, syncVisualDraft, {immediate: true});
watch(() => selected.value?.id, id => {
  activeAction.value = null;
  if (!sameObjectId(renameRequestId.value, id)) return;
  renameRequestId.value = null;
  nextTick(() => {
    activeAction.value = "rename";
  });
});
watch(() => selected.value?.symbol, syncVisualDraft);
watch(() => selected.value?.palette, syncVisualDraft);

function buildMarkerMetrics(map) {
  const rows = markerRows(map).map(marker => {
    const stateId = marker.data?.state ?? 0;
    const provinceId = marker.data?.province ?? 0;
    const visual = marker.visual || marker.data?.visual || {};
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

function markerRows(map) {
  return (map?.markers?.markers || []).filter(marker => marker && Number.isInteger(marker.id));
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

function applyVisual() {
  if (!selected.value) return;
  props.callbacks.onVisualChange?.(selected.value.id, {
    symbol: visualDraft.symbol,
    palette: visualDraft.palette
  });
}

function openRenameEditor(row) {
  renameRequestId.value = row?.id ?? null;
  props.callbacks.onSelect?.(row);
  nextTick(() => {
    if (!sameObjectId(selected.value?.id, row?.id)) return;
    renameRequestId.value = null;
    activeAction.value = "rename";
  });
}

function startAddResource() {
  props.callbacks.onAddResourceMode?.(resourceDraft.type);
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
  if (key === "highlight-selected") {
    props.callbacks.onHighlight?.(selectedMarkerRows.value);
    return;
  }
  if (key === "clear-highlights") {
    props.callbacks.onClearHighlights?.();
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
  return symbolOptions.find(option => option.value === value)?.label || value || "通用";
}

function paletteLabel(value) {
  return paletteOptions.find(option => option.value === value)?.label || value || "异象";
}

function resourceTypeLabel(value) {
  return resourceTypeOptions.find(option => option.value === value)?.label || value || "资源";
}

function formatNumber(value) {
  return formatDisplayNumber(value, unitPreferences.value);
}
</script>
