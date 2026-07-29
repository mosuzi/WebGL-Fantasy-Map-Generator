<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="measurement-panel-summary" />

  <div class="measurement-panel-controls">
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
    :selected-id="state.selectedMeasurementId"
    row-id-key="id"
    :doubleClickAction="'edit'"
    :empty-text="measurementEmptyText"
    :empty-action="measurementEmptyAction"
    resizable-columns
    selectable-rows
    :selected-row-ids="selectedMeasurementIds"
    @select="callbacks.onSelect"
    @locate="callbacks.onLocate"
    @edit="openRenameEditor"
    @empty-action="handleEmptyAction"
    @column-resize="callbacks.onColumnResize"
    @selection-change="selectedMeasurementIds = $event"
  />

  <UiPanelIoActions
    class-name="measurement-panel-list-actions"
    label="测量对象列表操作"
    :export-actions="measurementExportActions"
    :actions="measurementListActions"
    @export="handleMeasurementExport"
    @action="handleMeasurementAction"
  />

  <UiDetailGrid class-name="measurement-panel-details" empty-text="未选中测量对象" :rows="detailRows" />

  <template v-if="selected">
    <UiActionDock host-id="MeasurementPanel" v-model:active="activeAction" :actions="measurementActions">
      <template #rename>
        <UiTextEditField
          class-name="measurement-name-editor"
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
import {
  MEASUREMENT_DRAW_AREA,
  MEASUREMENT_DRAW_CURVE,
  MEASUREMENT_DRAW_ROUTE,
  MEASUREMENT_DRAW_RULER,
  measurementArea,
  measurementBounds,
  measurementDisplayPoints,
  measurementDistance
} from "../../../runtime/measurement-objects.js";
import {MEASUREMENT_ROUTE_FIT_ROADS, normalizeMeasurementRouteFit} from "../../../runtime/measurement-route-fit.js";
import {formatArea, formatDistance, formatNumber as formatDisplayNumber} from "../../display-units.js";
import UiActionDock from "./base/UiActionDock.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiPanelIoActions from "./base/UiPanelIoActions.vue";
import UiTextEditField from "./base/UiTextEditField.vue";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";
import {useVisibleRowSelection} from "../composables/use-visible-row-selection.js";
import {compareListValues} from "../../sort-utils.js";

defineOptions({
  name: "MeasurementPanel"
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
const renameRequestId = ref(null);

const sortOptions = Object.freeze([
  {key: "updatedAt", label: "更新时间"},
  {key: "name", label: "名称"},
  {key: "distance", label: "长度"},
  {key: "area", label: "面积"},
  {key: "pointCount", label: "点数"}
]);

const columns = Object.freeze([
  {key: "name", label: "名称", width: 132},
  {key: "typeLabel", label: "类型", width: 76},
  {key: "routeFitLabel", label: "模式", width: 70},
  {key: "pointCount", label: "点数", width: 70, align: "right", format: value => formatNumber(value)},
  {key: "distance", label: "长度", width: 102, align: "right", format: value => formatDistanceValue(value)},
  {key: "area", label: "面积", width: 102, align: "right", format: value => value ? formatAreaValue(value) : "-"}
]);

const measurementActions = Object.freeze([
  {key: "rename", resultClass: "open-secondary", label: "重命名", icon: "✎"}
]);
const startMeasurementAction = Object.freeze({key: "start", label: "开始测量", icon: "+"});

const rows = computed(() => {
  props.state.version;
  return measurementRows(props.state.map);
});
const visibleRows = computed(() => sortRows(filterRows(rows.value, props.state.filter), props.state.sortKey, props.state.sortDir));
const filterEmptyAction = computed(() => String(props.state.filter || "").trim()
  ? {key: "clear-filter", label: "清空筛选", icon: "⌫"}
  : null);
const measurementEmptyAction = computed(() => filterEmptyAction.value || startMeasurementAction);
const measurementEmptyText = computed(() => filterEmptyAction.value ? "没有匹配的测量对象" : "暂无保存的测量对象");
const {selectedRowIds: selectedMeasurementIds, selectedRows: selectedMeasurementRows} = useVisibleRowSelection(visibleRows);
const measurementExportActions = computed(() => [
  {key: "measurement", label: "导出测量", disabled: !visibleRows.value.length},
  {key: "selected-measurements", label: `导出选中 ${formatNumber(selectedMeasurementRows.value.length)}`, disabled: !selectedMeasurementRows.value.length}
]);
const selected = computed(() => rows.value.find(row => row.id === props.state.selectedMeasurementId) || null);
const measurementListActions = computed(() => [
  startMeasurementAction,
  {key: "highlight-selected", label: `高亮选中 ${formatNumber(selectedMeasurementRows.value.length)}`, icon: "◉", disabled: !selectedMeasurementRows.value.length},
  {key: "clear-highlights", label: `清除高亮 ${formatNumber(props.state.highlightCount || 0)}`, icon: "○", disabled: !props.state.highlightCount},
  {key: "edit", label: "编辑测量形状", icon: "◎", disabled: !selected.value},
  {key: "delete", label: "删除测量", icon: "×", disabled: !selected.value}
]);
const totalDistance = computed(() => rows.value.reduce((sum, row) => sum + row.distance, 0));
const totalArea = computed(() => rows.value.reduce((sum, row) => sum + row.area, 0));
const summaryMetrics = computed(() => [
  {label: "测量", value: formatNumber(rows.value.length)},
  {label: "总长度", value: formatDistanceValue(totalDistance.value)},
  {label: "总面积", value: formatAreaValue(totalArea.value)},
  {label: "已选", value: formatNumber(selectedMeasurementRows.value.length)},
  {label: "高亮", value: formatNumber(props.state.highlightCount || 0)},
  {label: "筛选", value: formatNumber(visibleRows.value.length)}
]);
const detailRows = computed(() => selected.value ? [
  {label: "名称", value: selected.value.name},
  {label: "类型", value: selected.value.typeLabel},
  {label: "模式", value: selected.value.routeFitLabel},
  {label: "闭合", value: selected.value.closureLabel},
  {label: "采样", value: selected.value.samplingLabel},
  {label: "点数", value: formatNumber(selected.value.pointCount)},
  {label: "原始采样", value: formatNumber(selected.value.rawPointCount), debug: true},
  {label: "显示点", value: formatNumber(selected.value.displayPointCount), debug: true},
  {label: "路线点", value: formatNumber(selected.value.routeStopCount), debug: true},
  {label: "长度", value: formatDistanceValue(selected.value.distance)},
  {label: "面积", value: selected.value.area ? formatAreaValue(selected.value.area) : "-"},
  {label: "范围", value: selected.value.boundsLabel},
  {label: "测量 id", value: selected.value.id, debug: true},
  {label: "更新时间", value: formatDateTime(selected.value.updatedAt)}
] : []);

watch(() => selected.value?.id, id => {
  activeAction.value = null;
  if (renameRequestId.value !== id) return;
  renameRequestId.value = null;
  nextTick(() => {
    activeAction.value = "rename";
  });
});

function measurementRows(map) {
  return (map?.measurements?.items || [])
    .filter(item => item?.id)
    .map(item => {
      const points = Array.isArray(item.points) ? item.points : [];
      const routeFit = normalizeMeasurementRouteFit(item.routeFit);
      const drawMode = routeFit === MEASUREMENT_ROUTE_FIT_ROADS ? MEASUREMENT_DRAW_ROUTE : item.drawMode || (item.closed ? MEASUREMENT_DRAW_AREA : MEASUREMENT_DRAW_RULER);
      const displayPoints = measurementDisplayPoints(item, map);
      const distance = Number(item.summary?.distanceMapUnits) || measurementDistance(displayPoints, {closed: Boolean(item.closed)});
      const area = Number(item.summary?.areaMapUnits) || (item.closed && displayPoints.length >= 3 ? measurementArea(displayPoints) : 0);
      const cellStops = Array.isArray(item.cellStops) ? item.cellStops : [];
      const bounds = measurementBounds(item, 0, map);
      return {
        id: String(item.id),
        name: item.name || item.id,
        type: item.type || (item.closed ? "polygon" : "polyline"),
        drawMode,
        typeLabel: measurementDrawModeLabel(drawMode, item.type),
        routeFit,
        routeFitLabel: routeFit === MEASUREMENT_ROUTE_FIT_ROADS ? "贴路" : "自由",
        closureLabel: item.closed ? item.smooth ? "平滑闭合" : "直线闭合" : "开放",
        samplingLabel: item.sampling?.mode === "continuous" ? "连续" : "点击",
        cellStops,
        routeStopCount: cellStops.filter(Boolean).length,
        pointCount: points.length,
        rawPointCount: Number(item.summary?.rawPointCount || item.sampling?.rawPointCount) || points.length,
        displayPointCount: displayPoints.length,
        distance,
        area,
        points,
        bounds,
        boundsLabel: formatBounds(bounds),
        createdAt: item.createdAt || "",
        updatedAt: item.updatedAt || item.createdAt || ""
      };
    });
}

function filterRows(sourceRows, filter) {
  const query = String(filter || "").trim().toLowerCase();
  if (!query) return sourceRows;
  return sourceRows.filter(row => [
    row.id,
    row.name,
    row.typeLabel,
    row.routeFitLabel
  ].some(value => String(value || "").toLowerCase().includes(query)));
}

function sortRows(sourceRows, key, dir) {
  const multiplier = dir === "asc" ? 1 : -1;
  return [...sourceRows].sort((a, b) => compareValue(a[key], b[key]) * multiplier);
}

function compareValue(a, b) {
  return compareListValues(a, b, "zh-Hans-CN");
}

function formatBounds(bounds) {
  if (!bounds) return "-";
  const width = Math.max(0, bounds.maxX - bounds.minX);
  const height = Math.max(0, bounds.maxY - bounds.minY);
  return `${formatNumber(width)} x ${formatNumber(height)}`;
}

function measurementDrawModeLabel(drawMode, type) {
  if (type === "point") return "点";
  if (drawMode === MEASUREMENT_DRAW_ROUTE) return "路线";
  if (drawMode === MEASUREMENT_DRAW_CURVE) return "曲线";
  if (drawMode === MEASUREMENT_DRAW_AREA) return "面积";
  return "折线";
}

function formatDateTime(value) {
  if (!value) return "未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {hour12: false});
}

function formatDistanceValue(value) {
  return formatDistance(value, unitPreferences.value);
}

function formatAreaValue(value) {
  return formatArea(value, unitPreferences.value);
}

function handleMeasurementExport(key) {
  if (key === "selected-measurements") {
    props.callbacks.onExport?.(selectedMeasurementRows.value);
    return;
  }
  if (key === "measurement") props.callbacks.onExport?.(visibleRows.value);
}

function openRenameEditor(row) {
  renameRequestId.value = row?.id ?? null;
  if (selected.value?.id !== row?.id) props.callbacks.onSelect?.(row);
  nextTick(() => {
    if (selected.value?.id !== row?.id) return;
    renameRequestId.value = null;
    activeAction.value = "rename";
  });
}

function handleMeasurementAction(key) {
  if (key === "start") {
    props.callbacks.onStart?.();
    return;
  }
  if (key === "highlight-selected") {
    props.callbacks.onHighlight?.(selectedMeasurementRows.value);
    return;
  }
  if (key === "clear-highlights") {
    props.callbacks.onClearHighlights?.();
    return;
  }
  if (!selected.value) return;
  if (key === "edit") props.callbacks.onEdit?.(selected.value);
  if (key === "locate") props.callbacks.onLocate?.(selected.value);
  if (key === "delete") props.callbacks.onDelete?.(selected.value);
}

function handleEmptyAction(key) {
  if (key === "clear-filter") {
    props.callbacks.onFilter?.("");
    return;
  }
  if (key === "start") props.callbacks.onStart?.();
}

function formatNumber(value) {
  return formatDisplayNumber(value, unitPreferences.value);
}
</script>
