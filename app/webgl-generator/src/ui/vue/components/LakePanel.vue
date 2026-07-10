<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="lake-panel-summary" />

  <div class="lake-panel-controls">
    <UiFilterInput :model-value="state.filter" placeholder="筛选名称 / id / 类型" @update:model-value="callbacks.onFilter" />
  </div>
  <UiObjectTable
    :columns="columns"
    :rows="visibleRows"
    :sort-key="state.sortKey"
    :sort-direction="state.sortDir"
    :sort-options="sortOptions"
    sortable
    @sort="callbacks.onSort"
    :selected-id="selectedId"
    :doubleClickAction="'edit'"
    empty-text="没有匹配的湖泊"
    @select="callbacks.onSelect"
    @locate="callbacks.onLocate"
    @edit="openRenameEditor"
  />

  <UiPanelIoActions
    class-name="lake-panel-list-actions"
    label="湖泊列表操作"
    :actions="lakeListActions"
    @action="handleLakeListAction"
  />

  <UiDetailGrid class-name="lake-panel-details" empty-text="未选中湖泊" :rows="detailRows" />

  <template v-if="selected">
    <UiActionDock v-model:active="activeAction" :actions="lakeActions">
      <template #rename>
        <UiTextEditField
          class-name="lake-name-editor"
          :model-value="selected.name"
          :max-length="48"
          @apply="name => callbacks.onRename(selected.id, name)"
        />
      </template>
    </UiActionDock>

    <UiHistoryActions class-name="lake-history-actions" :history="state.history" label="最近命令" @undo="callbacks.onUndo" @redo="callbacks.onRedo" />
  </template>
</template>

<script setup>
import {computed, nextTick, ref, watch} from "vue";
import UiActionDock from "./base/UiActionDock.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiHistoryActions from "./base/UiHistoryActions.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiPanelIoActions from "./base/UiPanelIoActions.vue";
import UiTextEditField from "./base/UiTextEditField.vue";
import {formatArea, formatNumber as formatDisplayNumber} from "../../display-units.js";
import {findByObjectId, sameObjectId} from "../../object-id.js";
import {compareRowsByKey} from "../../sort-utils.js";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";

defineOptions({
  name: "LakePanel"
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

const sortOptions = Object.freeze([
  {key: "area", label: "面积"},
  {key: "cells", label: "规模"},
  {key: "flux", label: "补给"},
  {key: "evaporation", label: "蒸发"},
  {key: "id", label: "ID"}
]);

const columns = Object.freeze([
  {key: "id", label: "ID", width: 56, align: "right"},
  {key: "name", label: "名称", width: 112},
  {key: "type", label: "类型", width: 76},
  {key: "cells", label: "规模", width: 64, align: "right", format: value => formatNumber(value)},
  {key: "area", label: "面积", width: 84, align: "right", format: value => formatAreaValue(value)},
  {key: "flux", label: "补给", width: 64, align: "right", format: value => formatNumber(value)}
]);

const unitPreferences = useUnitPreferences();
const activeAction = ref(null);
const renameRequestId = ref(null);
const rows = computed(() => {
  props.state.version;
  return lakeRows(props.state.map);
});
const selectedId = computed(() => props.state.selection?.object?.kind === "lake" ? props.state.selection.object.id : null);
const selected = computed(() => findByObjectId(rows.value, selectedId.value));
const visibleRows = computed(() => sortRows(filterRows(rows.value, props.state.filter), props.state.sortKey, props.state.sortDir));
const totalArea = computed(() => rows.value.reduce((sum, row) => sum + row.area, 0));
const totalCells = computed(() => rows.value.reduce((sum, row) => sum + row.cells, 0));
const maxFlux = computed(() => rows.value.reduce((max, row) => Math.max(max, row.flux), 0));
const lakeActions = Object.freeze([
  {key: "rename", label: "重命名", icon: "✎"}
]);
const lakeListActions = computed(() => [
  {key: "rename-visible", label: "按名称库重命名筛选湖泊", icon: "名", disabled: !visibleRows.value.length},
  {key: "locate", label: "定位选中湖泊", icon: "⌖", disabled: !selected.value}
]);

const summaryMetrics = computed(() => [
  {label: "湖泊", value: formatNumber(rows.value.length)},
  {label: "总面积", value: formatAreaValue(totalArea.value)},
  {label: "水域 cells", value: formatNumber(totalCells.value)},
  {label: "筛选", value: formatNumber(visibleRows.value.length)}
]);

const detailRows = computed(() => selected.value ? [
  {label: "选中", value: `#${selected.value.id} / ${selected.value.type}`},
  {label: "面积", value: formatAreaValue(selected.value.area)},
  {label: "水域 cells", value: formatNumber(selected.value.cells)},
  {label: "水位", value: formatNumber(selected.value.height)},
  {label: "补给", value: formatNumber(selected.value.flux)},
  {label: "蒸发", value: formatNumber(selected.value.evaporation)},
  {label: "岸线 cells", value: formatNumber(selected.value.shorelineCells)},
  {label: "最大补给", value: formatNumber(maxFlux.value)}
] : []);

watch(() => selected.value?.id, id => {
  activeAction.value = null;
  if (!sameObjectId(renameRequestId.value, id)) return;
  renameRequestId.value = null;
  nextTick(() => {
    activeAction.value = "rename";
  });
});

function lakeRows(map) {
  return (map?.pack?.features || [])
    .filter(feature => feature?.type === "lake")
    .map(feature => {
      const id = Number(feature.i ?? feature.id);
      const rawType = feature.group || feature.type || "lake";
      return {
        id,
        name: feature.name || `湖泊 #${id}`,
        type: lakeTypeLabel(rawType),
        rawType,
        cells: Number(feature.cells) || 0,
        area: Number(feature.area) || 0,
        height: Number(feature.height) || 0,
        flux: Number(feature.flux) || 0,
        evaporation: Number(feature.evaporation) || 0,
        shorelineCells: Array.isArray(feature.shoreline) ? feature.shoreline.length : 0,
        firstCell: Number(feature.firstCell) || 0
      };
    });
}

function filterRows(sourceRows, filter) {
  const query = String(filter || "").trim().toLowerCase();
  if (!query) return sourceRows;
  return sourceRows.filter(row => [
    row.id,
    row.name,
    row.type,
    row.rawType
  ].some(value => String(value || "").toLowerCase().includes(query)));
}

function sortRows(sourceRows, key, direction) {
  return [...sourceRows].sort((a, b) => compareRowsByKey(a, b, key, direction));
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

function lakeTypeLabel(type) {
  return {
    lake: "湖泊",
    frozen: "冻湖",
    salt: "盐湖",
    lava: "熔岩湖",
    dry: "干湖",
    sinkhole: "陷穴湖"
  }[type] || type || "湖泊";
}

function handleLakeListAction(key) {
  if (key === "rename-visible") props.callbacks.onRenameVisibleFromNamebase?.(visibleRows.value.map(row => row.id));
  if (key === "locate" && selected.value) props.callbacks.onLocate?.(selected.value);
}

function formatAreaValue(value) {
  return formatArea(value, unitPreferences.value);
}

function formatNumber(value) {
  return formatDisplayNumber(value, unitPreferences.value);
}
</script>
