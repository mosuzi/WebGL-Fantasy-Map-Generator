<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="feature-panel-summary" />

  <div class="feature-panel-controls">
    <UiFilterInput :model-value="state.filter" placeholder="筛选 id / 类型 / 分组" @update:model-value="callbacks.onFilter" />
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
    :selected-id="state.selectedFeatureId"
    :show-locate-action="false"
    empty-text="没有匹配的 feature"
    :empty-action="filterEmptyAction"
    resizable-columns
    @select="callbacks.onSelect"
    @empty-action="handleEmptyAction"
    @column-resize="callbacks.onColumnResize"
  />

  <UiDetailGrid class-name="feature-panel-details" empty-text="未选中 feature" :rows="detailRows" />
</template>

<script setup>
import {computed} from "vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import {formatArea, formatDistance, formatNumber as formatDisplayNumber} from "../../display-units.js";
import {findByObjectId} from "../../object-id.js";
import {compareRowsByKey} from "../../sort-utils.js";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";

defineOptions({
  name: "FeaturePanel"
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
  {key: "cells", label: "cells"},
  {key: "area", label: "面积"},
  {key: "shorelineCells", label: "岸线"},
  {key: "flux", label: "补给"},
  {key: "evaporation", label: "蒸发"},
  {key: "group", label: "分组"},
  {key: "id", label: "ID"}
]);

const columns = Object.freeze([
  {key: "id", label: "ID", align: "right", width: 56},
  {key: "typeLabel", label: "类型", width: 76},
  {key: "groupLabel", label: "分组", width: 96},
  {key: "cells", label: "cells", align: "right", format: value => formatNumber(value)},
  {key: "area", label: "面积", align: "right", format: value => formatAreaValue(value)},
  {key: "shorelineCells", label: "岸线", align: "right", format: value => formatNumber(value)},
  {key: "havenCells", label: "港湾", align: "right", format: value => formatNumber(value)}
]);

const unitPreferences = useUnitPreferences();
const metrics = computed(() => {
  props.state.version;
  return buildFeatureMetrics(props.state.map);
});
const visibleRows = computed(() => sortRows(filterRows(metrics.value.rows, props.state.filter), props.state.sortKey, props.state.sortDir));
const filterEmptyAction = computed(() => String(props.state.filter || "").trim()
  ? {key: "clear-filter", label: "清空筛选", icon: "⌫"}
  : null);
const selected = computed(() => findByObjectId(metrics.value.rows, props.state.selectedFeatureId));

const summaryMetrics = computed(() => [
  {label: "feature", value: formatNumber(metrics.value.total)},
  {label: "陆地", value: formatNumber(metrics.value.land)},
  {label: "水域", value: formatNumber(metrics.value.water)},
  {label: "湖泊", value: formatNumber(metrics.value.lakes)},
  {label: "海岸线段", value: formatNumber(metrics.value.coastlineSegments)},
  {label: "海岸长度", value: formatDistanceValue(metrics.value.coastlineLength)},
  {label: "湖岸长度", value: formatDistanceValue(metrics.value.lakeShoreLength)},
  {label: "港湾 cells", value: formatNumber(metrics.value.havenCells)},
  {label: "泊位强度", value: formatNumber(metrics.value.harborScore)},
  {label: "异常引用", value: formatNumber(metrics.value.invalidReferences)}
]);

const detailRows = computed(() => selected.value ? [
  {label: "ID", value: `#${selected.value.id}`},
  {label: "类型", value: selected.value.typeLabel},
  {label: "分组", value: selected.value.groupLabel},
  {label: "陆地", value: selected.value.land ? "是" : "否"},
  {label: "边界", value: selected.value.border ? "是" : "否"},
  {label: "cells", value: formatNumber(selected.value.cells)},
  {label: "面积", value: formatAreaValue(selected.value.area)},
  {label: "岸线 cells", value: formatNumber(selected.value.shorelineCells)},
  {label: "港湾 cells", value: formatNumber(selected.value.havenCells)},
  {label: "泊位强度", value: formatNumber(selected.value.harborScore)},
  {label: "高度 / 水位", value: formatNumber(selected.value.height)},
  {label: "补给", value: formatNumber(selected.value.flux)},
  {label: "蒸发", value: formatNumber(selected.value.evaporation)},
  {label: "first cell", value: formatNumber(selected.value.firstCell), debug: true}
] : []);

function buildFeatureMetrics(map) {
  const rows = (map?.pack?.features || []).filter(Boolean).map(featureRow);
  attachHavenHarborMetrics(rows, map);
  const shoreline = map?.features?.shore || {};
  const invalidReferences = countInvalidReferences(map);
  return {
    rows,
    total: rows.length,
    land: rows.filter(row => row.land).length,
    water: rows.filter(row => !row.land).length,
    lakes: rows.filter(row => row.type === "lake").length,
    oceans: rows.filter(row => row.type === "ocean").length,
    islands: rows.filter(row => row.type === "island").length,
    coastlineSegments: shoreline.coastline?.length || 0,
    lakeShoreSegments: shoreline.lakeShore?.length || 0,
    coastlineLength: totalSegmentLength(shoreline.coastline),
    lakeShoreLength: totalSegmentLength(shoreline.lakeShore),
    havenCells: rows.reduce((sum, row) => sum + row.havenCells, 0),
    harborScore: rows.reduce((sum, row) => sum + row.harborScore, 0),
    invalidReferences
  };
}

function featureRow(feature) {
  const id = Number(feature.i ?? feature.id);
  const type = feature.type || "unknown";
  const group = feature.group || "none";
  return {
    id,
    type,
    typeLabel: typeLabel(type),
    group,
    groupLabel: groupLabel(group),
    land: Boolean(feature.land),
    border: Boolean(feature.border),
    cells: Number(feature.cells || 0),
    area: Number(feature.area || 0),
    shorelineCells: Array.isArray(feature.shoreline) ? feature.shoreline.length : 0,
    havenCells: 0,
    harborScore: 0,
    height: Number(feature.height || 0),
    flux: Number(feature.flux || 0),
    evaporation: Number(feature.evaporation || 0),
    firstCell: Number(feature.firstCell || 0)
  };
}

function attachHavenHarborMetrics(rows, map) {
  const byId = new Map(rows.map(row => [row.id, row]));
  const cells = map?.pack?.cells;
  if (!cells?.haven || !cells?.f) return;
  for (const cell of cells.i || []) {
    const havenCell = cells.haven[cell];
    if (!Number.isInteger(havenCell) || havenCell <= 0) continue;
    const waterFeatureId = cells.f[havenCell];
    const row = byId.get(waterFeatureId);
    if (!row) continue;
    row.havenCells++;
    row.harborScore += Number(cells.harbor?.[cell] || 0);
  }
}

function countInvalidReferences(map) {
  let invalid = 0;
  const packFeatures = map?.pack?.features || [];
  for (const featureId of map?.pack?.cells?.f || []) if (featureId && !packFeatures[featureId]) invalid++;
  const gridFeatures = map?.features?.features || [];
  for (const featureId of map?.grid?.cells?.f || []) if (featureId && !gridFeatures[featureId]) invalid++;
  return invalid;
}

function totalSegmentLength(segments) {
  return (segments || []).reduce((sum, segment) => sum + segmentLength(segment), 0);
}

function segmentLength(segment) {
  const [from, to] = segment || [];
  if (!Array.isArray(from) || !Array.isArray(to)) return 0;
  return Math.hypot(Number(to[0] || 0) - Number(from[0] || 0), Number(to[1] || 0) - Number(from[1] || 0));
}

function filterRows(sourceRows, filter) {
  const query = String(filter || "").trim().toLowerCase();
  if (!query) return sourceRows;
  return sourceRows.filter(row => [
    row.id,
    row.type,
    row.typeLabel,
    row.group,
    row.groupLabel
  ].some(value => String(value || "").toLowerCase().includes(query)));
}

function sortRows(sourceRows, key, direction) {
  return [...sourceRows].sort((a, b) => compareRowsByKey(a, b, key, direction));
}

function handleEmptyAction(key) {
  if (key === "clear-filter") props.callbacks.onFilter?.("");
}

function typeLabel(type) {
  return {
    island: "陆地",
    ocean: "海洋",
    lake: "湖泊"
  }[type] || type || "未知";
}

function groupLabel(group) {
  return {
    continent: "大陆",
    island: "岛屿",
    isle: "小岛",
    lake_island: "湖中岛",
    ocean: "大洋",
    sea: "海",
    gulf: "湾",
    freshwater: "淡水湖",
    salt: "盐湖",
    frozen: "冻湖",
    lava: "熔岩湖",
    dry: "干湖",
    sinkhole: "陷穴湖",
    none: "未分组"
  }[group] || group || "未分组";
}

function formatAreaValue(value) {
  return formatArea(value, unitPreferences.value);
}

function formatDistanceValue(value) {
  return formatDistance(value, unitPreferences.value);
}

function formatNumber(value) {
  return formatDisplayNumber(value, unitPreferences.value);
}
</script>
