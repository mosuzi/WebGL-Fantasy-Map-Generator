<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="lake-panel-summary" />

  <div class="lake-panel-controls">
    <UiFilterInput :model-value="state.filter" placeholder="筛选名称 / id / 类型" @update:model-value="callbacks.onFilter" />
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
    :selected-id="selectedId"
    :doubleClickAction="'edit'"
    empty-text="没有匹配的湖泊"
    :empty-action="filterEmptyAction"
    resizable-columns
    selectable-rows
    :selected-row-ids="selectedLakeIds"
    @select="callbacks.onSelect"
    @locate="callbacks.onLocate"
    @edit="openRenameEditor"
    @empty-action="handleEmptyAction"
    @column-resize="callbacks.onColumnResize"
    @selection-change="selectedLakeIds = $event"
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
      <template #outlet>
        <div v-if="state.outletDraft" class="lake-outlet-editor">
          <UiSelectField
            input-id="lake-outlet-river"
            label="出口河流"
            :model-value="state.outletDraft.outletRiverId"
            :options="outletRiverOptions"
            @update:model-value="callbacks.onOutletDraft"
          />
          <UiStateBanner
            :kind="state.outletPreview?.valid ? 'preview' : 'error'"
            title="湖泊出口预检"
            :message="outletPreviewMessage"
            :action-label="state.outletPreview?.valid && state.outletPreview?.changed ? '应用出口修改' : ''"
            secondary-action-label="取消"
            @action="handleOutletApply"
            @secondary-action="activeAction = null"
          />
        </div>
      </template>
      <template #shore>
        <div v-if="state.patchDraft" class="lake-shore-editor">
          <UiSelectField
            input-id="lake-shore-target"
            label="修正方向"
            :model-value="state.patchDraft.target"
            :options="patchTargetOptions"
            @update:model-value="value => callbacks.onPatchDraft({target: value})"
          />
          <UiSelectField
            input-id="lake-shore-radius"
            label="修正半径"
            :model-value="state.patchDraft.radius"
            :options="patchRadiusOptions"
            @update:model-value="value => callbacks.onPatchDraft({radius: value})"
          />
          <UiButton variant="secondary" :active="state.patchSelectMode" @click="callbacks.onPatchSelectMode(!state.patchSelectMode)">
            {{ state.patchSelectMode ? "取消选择修正中心" : "在地图选择修正中心" }}
          </UiButton>
          <UiStateBanner
            :kind="state.patchPreview?.valid ? 'preview' : state.patchPreview ? 'error' : 'info'"
            title="局部水陆修正预检"
            :message="patchPreviewMessage"
            :action-label="state.patchPreview?.valid ? '应用局部修正' : ''"
            secondary-action-label="取消"
            @action="handlePatchApply"
            @secondary-action="activeAction = null"
          />
        </div>
      </template>
      <template #rename>
        <UiTextEditField
          class-name="lake-name-editor"
          :model-value="selected.name"
          :max-length="48"
          @apply="name => callbacks.onRename(selected.id, name)"
        />
      </template>
    </UiActionDock>
  </template>
</template>

<script setup>
import {computed, nextTick, ref, watch} from "vue";
import UiActionDock from "./base/UiActionDock.vue";
import UiButton from "./base/UiButton.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiPanelIoActions from "./base/UiPanelIoActions.vue";
import UiSelectField from "./base/UiSelectField.vue";
import UiStateBanner from "./base/UiStateBanner.vue";
import UiTextEditField from "./base/UiTextEditField.vue";
import {formatArea, formatNumber as formatDisplayNumber} from "../../display-units.js";
import {findByObjectId, sameObjectId} from "../../object-id.js";
import {compareRowsByKey} from "../../sort-utils.js";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";
import {useVisibleRowSelection} from "../composables/use-visible-row-selection.js";

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
const {selectedRowIds: selectedLakeIds, selectedRows: selectedLakeRows} = useVisibleRowSelection(visibleRows);
const filterEmptyAction = computed(() => String(props.state.filter || "").trim()
  ? {key: "clear-filter", label: "清空筛选", icon: "⌫"}
  : null);
const totalArea = computed(() => rows.value.reduce((sum, row) => sum + row.area, 0));
const totalCells = computed(() => rows.value.reduce((sum, row) => sum + row.cells, 0));
const maxFlux = computed(() => rows.value.reduce((max, row) => Math.max(max, row.flux), 0));
const lakeActions = Object.freeze([
  {key: "outlet", label: "编辑湖泊出口", icon: "⇢"},
  {key: "shore", label: "局部水陆修正", icon: "◒"},
  {key: "rename", label: "重命名", icon: "✎"}
]);
const patchTargetOptions = Object.freeze([
  {value: "water", label: "扩展为湖泊水域"},
  {value: "land", label: "收回为相邻陆地"}
]);
const patchRadiusOptions = Object.freeze([
  {value: 0, label: "单个 grid cell"},
  {value: 1, label: "半径 1"},
  {value: 2, label: "半径 2"}
]);
const outletRiverOptions = computed(() => [
  {value: 0, label: "无出口（闭合湖泊）"},
  ...(props.state.map?.rivers?.rivers || props.state.map?.pack?.rivers || []).map(river => {
    const id = Number(river?.i ?? river?.id);
    return {value: id, label: `${river?.name || `河流 #${id}`}（#${id}）`};
  })
]);
const outletPreviewMessage = computed(() => {
  const preview = props.state.outletPreview;
  if (!preview) return "选择一条真实穿过该湖并流向陆地的河流，或设为无出口。";
  if (!preview.valid) return `${preview.code || "invalid"}：${preview.reason || "出口修改无效"}`;
  return `${preview.changed ? "可应用" : "没有变化"}；出口河流 ${preview.outletRiverId ? `#${preview.outletRiverId}` : "无"}；联动 ${formatNumber(preview.affectedInlets || 0)} 条入湖河流`;
});
const patchPreviewMessage = computed(() => {
  const preview = props.state.patchPreview;
  if (!preview) return "先选择修正方向和半径，再到地图上选择中心。预览不会写入历史。";
  if (!preview.valid) return `${preview.code || "invalid"}：${preview.reason || "局部修正无效"}`;
  return `可应用；${formatNumber(preview.packCells?.length || 0)} pack cells / ${formatNumber(preview.gridCells?.length || 0)} grid cells；目标 feature #${preview.packTargetFeature}`;
});
const lakeListActions = computed(() => [
  {key: "create", label: props.state.createMode ? "取消开挖湖泊" : "开挖湖泊", icon: "+", active: props.state.createMode},
  {key: "highlight-selected", label: `高亮选中 ${formatNumber(selectedLakeRows.value.length)}`, icon: "◉", disabled: !selectedLakeRows.value.length},
  {key: "clear-highlights", label: `清除高亮 ${formatNumber(props.state.highlightCount || 0)}`, icon: "○", disabled: !props.state.highlightCount},
  {key: "rename-visible", label: "按名称库重命名筛选湖泊", icon: "名", disabled: !visibleRows.value.length},
  {key: "delete-selected", label: `批量填平选中 ${formatNumber(selectedLakeRows.value.length)}`, icon: "删", disabled: !selectedLakeRows.value.length},
  {key: "delete", label: "填平并删除选中湖泊", icon: "删", disabled: !selected.value}
]);

const summaryMetrics = computed(() => [
  {label: "湖泊", value: formatNumber(rows.value.length)},
  {label: "总面积", value: formatAreaValue(totalArea.value)},
  {label: "水域 cells", value: formatNumber(totalCells.value)},
  {label: "高亮", value: formatNumber(props.state.highlightCount || 0)},
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

watch(activeAction, (next, previous) => {
  if (next === "outlet" && selected.value) props.callbacks.onOutletStart?.(selected.value.id);
  if (next === "shore" && selected.value) props.callbacks.onPatchStart?.(selected.value.id);
  if (previous === "outlet" && next !== "outlet") props.callbacks.onEditCancel?.("outlet");
  if (previous === "shore" && next !== "shore") props.callbacks.onEditCancel?.("patch");
});

function handleOutletApply() {
  if (!props.state.outletPreview?.valid || !props.state.outletPreview?.changed) return;
  const result = props.callbacks.onOutletApply?.();
  if (result?.executed) activeAction.value = null;
}

function handlePatchApply() {
  if (!props.state.patchPreview?.valid) return;
  const result = props.callbacks.onPatchApply?.();
  if (result?.executed) activeAction.value = null;
}

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
  if (key === "create") props.callbacks.onCreateMode?.(!props.state.createMode);
  if (key === "highlight-selected") props.callbacks.onHighlight?.(selectedLakeRows.value);
  if (key === "clear-highlights") props.callbacks.onClearHighlights?.();
  if (key === "rename-visible") props.callbacks.onRenameVisibleFromNamebase?.(visibleRows.value.map(row => row.id));
  if (key === "locate" && selected.value) props.callbacks.onLocate?.(selected.value);
  if (key === "delete-selected") props.callbacks.onDeleteMany?.(selectedLakeRows.value.map(row => row.id));
  if (key === "delete" && selected.value) props.callbacks.onDelete?.(selected.value.id);
}

function handleEmptyAction(key) {
  if (key === "clear-filter") props.callbacks.onFilter?.("");
}

function formatAreaValue(value) {
  return formatArea(value, unitPreferences.value);
}

function formatNumber(value) {
  return formatDisplayNumber(value, unitPreferences.value);
}
</script>
