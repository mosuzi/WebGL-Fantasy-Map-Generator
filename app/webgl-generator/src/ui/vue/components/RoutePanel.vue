<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="route-panel-summary" />

  <div class="route-panel-controls">
    <UiFilterInput :model-value="state.filter" placeholder="筛选类型 / id / 起点 / 终点" @update:model-value="callbacks.onFilter" />
  </div>

  <UiSortBar class-name="route-panel-sort" :options="sortOptions" :active-key="state.sortKey" :direction="state.sortDir" @sort="callbacks.onSort" />

  <UiObjectTable
    :columns="columns"
    :rows="visibleRows"
    :selected-id="state.selectedRouteId"
    empty-text="没有匹配的路线"
    @select="callbacks.onSelect"
    @locate="callbacks.onLocate"
  />

  <UiDetailGrid class-name="route-panel-details" empty-text="未选中路线" :rows="detailRows" />
</template>

<script setup>
import {computed} from "vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiSortBar from "./base/UiSortBar.vue";
import {formatDistance} from "../../display-units.js";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";

defineOptions({
  name: "RoutePanel"
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
  {key: "length", label: "长度"},
  {key: "segments", label: "段数"},
  {key: "type", label: "类型"},
  {key: "id", label: "ID"}
]);

const columns = Object.freeze([
  {key: "id", label: "ID", align: "right"},
  {key: "typeLabel", label: "类型"},
  {key: "fromName", label: "起点"},
  {key: "toName", label: "终点"},
  {key: "length", label: "长度", align: "right", format: value => formatRouteLength(value)}
]);

const unitPreferences = useUnitPreferences();
const rows = computed(() => routeRows(props.state.map));
const visibleRows = computed(() => sortRows(filterRows(rows.value, props.state.filter), props.state.sortKey, props.state.sortDir));
const selected = computed(() => rows.value.find(row => row.id === props.state.selectedRouteId) || null);
const totalLength = computed(() => rows.value.reduce((sum, row) => sum + row.length, 0));

const summaryMetrics = computed(() => [
  {label: "路线", value: rows.value.length},
  {label: "筛选", value: visibleRows.value.length},
  {label: "总长度", value: formatRouteLength(totalLength.value)},
  {label: "海路", value: rows.value.filter(row => row.type === "searoute").length}
]);

const detailRows = computed(() => selected.value ? [
  {label: "类型", value: selected.value.typeLabel},
  {label: "等级", value: selected.value.level},
  {label: "起点", value: selected.value.fromName},
  {label: "终点", value: selected.value.toName},
  {label: "长度", value: formatRouteLength(selected.value.length)},
  {label: "段数", value: selected.value.segments},
  {label: "grid cells", value: selected.value.cellCount},
  {label: "pack cells", value: selected.value.packCellCount},
  {label: "feature", value: selected.value.feature}
] : []);

function routeRows(map) {
  return (map?.settlements?.routes || []).map(route => {
    const from = map?.settlements?.cities?.[route.from];
    const to = map?.settlements?.cities?.[route.to];
    return {
      id: route.id,
      type: route.type || "route",
      typeLabel: routeTypeLabel(route.type),
      level: route.level || route.type || "none",
      fromId: route.from,
      toId: route.to,
      fromName: from?.name || (route.from >= 0 ? `#${route.from}` : "unknown"),
      toName: to?.name || (route.to >= 0 ? `#${route.to}` : "unknown"),
      length: routeLength(route),
      segments: Math.max(0, (route.points || []).length - 1),
      cellCount: route.cells?.length || 0,
      packCellCount: route.packCells?.length || 0,
      feature: route.feature ?? "none"
    };
  });
}

function filterRows(sourceRows, filter) {
  const query = filter.trim().toLowerCase();
  if (!query) return sourceRows;
  return sourceRows.filter(row =>
    String(row.id).includes(query)
    || row.typeLabel.toLowerCase().includes(query)
    || row.type.toLowerCase().includes(query)
    || row.fromName.toLowerCase().includes(query)
    || row.toName.toLowerCase().includes(query)
  );
}

function sortRows(sourceRows, key, direction) {
  const factor = direction === "asc" ? 1 : -1;
  return [...sourceRows].sort((a, b) => {
    if (a[key] === b[key]) return a.id - b.id;
    if (typeof a[key] === "string") return a[key].localeCompare(b[key], "zh-CN") * factor;
    return a[key] > b[key] ? factor : -factor;
  });
}

function routeLength(route) {
  let length = 0;
  const points = route.points || [];
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index];
    const b = points[index + 1];
    if (!isPoint(a) || !isPoint(b)) continue;
    length += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return length;
}

function isPoint(point) {
  return Number.isFinite(point?.[0]) && Number.isFinite(point?.[1]);
}

function routeTypeLabel(type) {
  if (type === "road") return "道路";
  if (type === "trail") return "小径";
  if (type === "searoute") return "海路";
  return type || "路线";
}

function formatRouteLength(value) {
  return formatDistance(value, unitPreferences.value);
}
</script>
