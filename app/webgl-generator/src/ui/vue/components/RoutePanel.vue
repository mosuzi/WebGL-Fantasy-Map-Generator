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

  <UiActionDock v-if="selected" v-model:active="activeAction" :actions="routeActions">
    <template #note>
      <UiNoteField
        class-name="route-note-editor"
        :model-value="selected.noteBody"
        @apply="body => callbacks.onNoteChange(selected.id, body)"
        @clear="callbacks.onNoteChange(selected.id, '')"
      />
    </template>
  </UiActionDock>

  <UiHistoryActions class-name="route-history-actions" :history="state.history" @undo="callbacks.onUndo" @redo="callbacks.onRedo" />
</template>

<script setup>
import {computed, ref, watch} from "vue";
import UiActionDock from "./base/UiActionDock.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiHistoryActions from "./base/UiHistoryActions.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiNoteField from "./base/UiNoteField.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiSortBar from "./base/UiSortBar.vue";
import {formatDistance, formatNumber} from "../../display-units.js";
import {findByObjectId} from "../../object-id.js";
import {compareRowsByKey} from "../../sort-utils.js";
import {readObjectNote} from "../../../runtime/object-notes.js";
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
  {key: "resourceCells", label: "资源"},
  {key: "type", label: "类型"},
  {key: "id", label: "ID"}
]);

const columns = Object.freeze([
  {key: "id", label: "ID", align: "right"},
  {key: "typeLabel", label: "类型"},
  {key: "fromName", label: "起点"},
  {key: "toName", label: "终点"},
  {key: "resourceCells", label: "资源", align: "right", format: value => formatNumberValue(value)},
  {key: "length", label: "长度", align: "right", format: value => formatRouteLength(value)}
]);

const unitPreferences = useUnitPreferences();
const activeAction = ref(null);
const routeActions = Object.freeze([
  {key: "note", label: "编辑备注", icon: "☰"}
]);
const rows = computed(() => {
  props.state.version;
  return routeRows(props.state.map);
});
const visibleRows = computed(() => sortRows(filterRows(rows.value, props.state.filter), props.state.sortKey, props.state.sortDir));
const selected = computed(() => findByObjectId(rows.value, props.state.selectedRouteId));
const totalLength = computed(() => rows.value.reduce((sum, row) => sum + row.length, 0));

const summaryMetrics = computed(() => [
  {label: "路线", value: formatNumberValue(rows.value.length)},
  {label: "筛选", value: formatNumberValue(visibleRows.value.length)},
  {label: "总长度", value: formatRouteLength(totalLength.value)},
  {label: "资源路线", value: formatNumberValue(rows.value.filter(row => row.resourceCells > 0).length)},
  {label: "海路", value: formatNumberValue(rows.value.filter(row => row.type === "searoute").length)}
]);

const detailRows = computed(() => selected.value ? [
  {label: "类型", value: selected.value.typeLabel},
  {label: "等级", value: selected.value.level},
  {label: "起点", value: selected.value.fromName},
  {label: "终点", value: selected.value.toName},
  {label: "长度", value: formatRouteLength(selected.value.length)},
  {label: "段数", value: formatNumberValue(selected.value.segments)},
  {label: "资源 cells", value: formatNumberValue(selected.value.resourceCells)},
  {label: "资源种类", value: selected.value.resourceGoodNames || "无"},
  {label: "grid cells", value: formatNumberValue(selected.value.cellCount), debug: true},
  {label: "pack cells", value: formatNumberValue(selected.value.packCellCount), debug: true},
  {label: "feature", value: selected.value.feature, debug: true},
  {label: "备注", value: selected.value.noteBody ? `有备注（${formatNumberValue(selected.value.noteBody.length)}字）` : "无"}
] : []);

watch(() => selected.value?.id, () => {
  activeAction.value = null;
});

function routeRows(map) {
  return (map?.settlements?.routes || []).map(route => {
    const from = map?.settlements?.cities?.[route.from];
    const to = map?.settlements?.cities?.[route.to];
    const note = readObjectNote(map, {kind: "route", id: route.id});
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
      resourceCells: Number(route.resourceCells || 0),
      markerResourceCells: Number(route.markerResourceCells || 0),
      resourceGoodNames: routeResourceGoodNames(map, route),
      cellCount: route.cells?.length || 0,
      packCellCount: route.packCells?.length || 0,
      feature: route.feature ?? "none",
      noteBody: note?.body || "",
      noteUpdatedAt: note?.updatedAt || ""
    };
  });
}

function routeResourceGoodNames(map, route) {
  const ids = route.resourceGoodIds || [];
  if (!ids.length) return "";
  return ids
    .map(id => map?.economy?.goods?.[id]?.name || map?.pack?.goods?.[id]?.name || `#${id}`)
    .slice(0, 5)
    .join("、");
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
  return [...sourceRows].sort((a, b) => compareRowsByKey(a, b, key, direction));
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

function formatNumberValue(value) {
  return formatNumber(value, unitPreferences.value);
}
</script>
