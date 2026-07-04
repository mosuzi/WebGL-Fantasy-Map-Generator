<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="measurement-panel-summary" />

  <div class="measurement-panel-controls">
    <UiFilterInput :model-value="state.filter" placeholder="筛选名称 / id / 类型" @update:model-value="callbacks.onFilter" />
  </div>

  <UiSortBar class-name="measurement-panel-sort" :options="sortOptions" :active-key="state.sortKey" :direction="state.sortDir" @sort="callbacks.onSort" />

  <UiObjectTable
    :columns="columns"
    :rows="visibleRows"
    :selected-id="state.selectedMeasurementId"
    row-id-key="id"
    empty-text="暂无保存的测量对象"
    @select="callbacks.onSelect"
    @locate="callbacks.onLocate"
  />

  <UiDetailGrid class-name="measurement-panel-details" empty-text="未选中测量对象" :rows="detailRows" />

  <template v-if="selected">
    <UiActionDock v-model:active="activeAction" :actions="measurementActions">
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

  <div class="measurement-panel-actions">
    <UiButton v-if="selected" variant="secondary" @click="callbacks.onEdit(selected)">编辑形状</UiButton>
    <UiButton v-if="selected" variant="secondary" @click="callbacks.onLocate(selected)">定位测量</UiButton>
    <UiButton v-if="selected" variant="secondary" @click="callbacks.onDelete(selected)">删除测量</UiButton>
    <UiButton variant="secondary" :disabled="!visibleRows.length" @click="callbacks.onExport(visibleRows)">导出测量</UiButton>
  </div>

  <UiHistoryActions class-name="measurement-history-actions" :history="state.history" @undo="callbacks.onUndo" @redo="callbacks.onRedo" />
</template>

<script setup>
import {computed, ref, watch} from "vue";
import {
  measurementArea,
  measurementBounds,
  measurementDistance
} from "../../../runtime/measurement-objects.js";
import {MEASUREMENT_ROUTE_FIT_ROADS, normalizeMeasurementRouteFit} from "../../../runtime/measurement-route-fit.js";
import {formatArea, formatDistance, formatNumber as formatDisplayNumber} from "../../display-units.js";
import UiActionDock from "./base/UiActionDock.vue";
import UiButton from "./base/UiButton.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiHistoryActions from "./base/UiHistoryActions.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiSortBar from "./base/UiSortBar.vue";
import UiTextEditField from "./base/UiTextEditField.vue";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";

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
  {key: "rename", label: "重命名", icon: "✎"}
]);

const rows = computed(() => {
  props.state.version;
  return measurementRows(props.state.map);
});
const visibleRows = computed(() => sortRows(filterRows(rows.value, props.state.filter), props.state.sortKey, props.state.sortDir));
const selected = computed(() => rows.value.find(row => row.id === props.state.selectedMeasurementId) || null);
const totalDistance = computed(() => rows.value.reduce((sum, row) => sum + row.distance, 0));
const totalArea = computed(() => rows.value.reduce((sum, row) => sum + row.area, 0));
const summaryMetrics = computed(() => [
  {label: "测量", value: formatNumber(rows.value.length)},
  {label: "总长度", value: formatDistanceValue(totalDistance.value)},
  {label: "总面积", value: formatAreaValue(totalArea.value)},
  {label: "筛选", value: formatNumber(visibleRows.value.length)}
]);
const detailRows = computed(() => selected.value ? [
  {label: "名称", value: selected.value.name},
  {label: "类型", value: selected.value.typeLabel},
  {label: "模式", value: selected.value.routeFitLabel},
  {label: "点数", value: formatNumber(selected.value.pointCount)},
  {label: "路线点", value: formatNumber(selected.value.routeStopCount), debug: true},
  {label: "长度", value: formatDistanceValue(selected.value.distance)},
  {label: "面积", value: selected.value.area ? formatAreaValue(selected.value.area) : "-"},
  {label: "范围", value: selected.value.boundsLabel},
  {label: "测量 id", value: selected.value.id, debug: true},
  {label: "更新时间", value: formatDateTime(selected.value.updatedAt)}
] : []);

watch(() => selected.value?.id, () => {
  activeAction.value = null;
});

function measurementRows(map) {
  return (map?.measurements?.items || [])
    .filter(item => item?.id)
    .map(item => {
      const points = Array.isArray(item.points) ? item.points : [];
      const distance = Number(item.summary?.distanceMapUnits) || measurementDistance(points);
      const area = Number(item.summary?.areaMapUnits) || (points.length >= 3 ? measurementArea(points) : 0);
      const routeFit = normalizeMeasurementRouteFit(item.routeFit);
      const cellStops = Array.isArray(item.cellStops) ? item.cellStops : [];
      return {
        id: String(item.id),
        name: item.name || item.id,
        type: item.type || (item.closed ? "polygon" : "polyline"),
        typeLabel: item.closed || item.type === "polygon" ? "面积" : "折线",
        routeFit,
        routeFitLabel: routeFit === MEASUREMENT_ROUTE_FIT_ROADS ? "贴路" : "自由",
        cellStops,
        routeStopCount: cellStops.filter(Boolean).length,
        pointCount: points.length,
        distance,
        area,
        points,
        bounds: measurementBounds(item, 0),
        boundsLabel: formatBounds(measurementBounds(item, 0)),
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
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""), "zh-Hans-CN", {numeric: true});
}

function formatBounds(bounds) {
  if (!bounds) return "-";
  const width = Math.max(0, bounds.maxX - bounds.minX);
  const height = Math.max(0, bounds.maxY - bounds.minY);
  return `${formatNumber(width)} x ${formatNumber(height)}`;
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

function formatNumber(value) {
  return formatDisplayNumber(value, unitPreferences.value);
}
</script>
