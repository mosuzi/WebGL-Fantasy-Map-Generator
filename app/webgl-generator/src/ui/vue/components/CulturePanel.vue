<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="culture-panel-summary" />

  <div class="culture-panel-controls">
    <UiFilterInput :model-value="state.filter" placeholder="筛选名称 / id / 类型 / 国家" @update:model-value="callbacks.onFilter" />
  </div>

  <UiSortBar class-name="culture-panel-sort" :options="sortOptions" :active-key="state.sortKey" :direction="state.sortDir" @sort="callbacks.onSort" />

  <UiObjectTable
    :columns="columns"
    :rows="visibleRows"
    :selected-id="state.selectedCultureId"
    empty-text="没有匹配的文化"
    @select="callbacks.onSelect"
    @locate="callbacks.onLocate"
  />

  <UiDetailGrid class-name="culture-panel-details" empty-text="未选中文化" :rows="detailRows" />

  <template v-if="selected">
    <UiTextEditField
      class-name="culture-name-editor"
      :model-value="selected.rawName"
      :max-length="48"
      @apply="name => callbacks.onRename(selected.id, name)"
    />
    <UiColorField
      class-name="culture-color-field"
      :model-value="selected.color"
      @apply="color => callbacks.onColorChange(selected.id, color)"
    />
  </template>

  <UiHistoryActions class-name="culture-history-actions" :history="state.history" @undo="callbacks.onUndo" @redo="callbacks.onRedo" />
</template>

<script setup>
import {computed} from "vue";
import UiColorField from "./base/UiColorField.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiHistoryActions from "./base/UiHistoryActions.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiSortBar from "./base/UiSortBar.vue";
import UiTextEditField from "./base/UiTextEditField.vue";

defineOptions({
  name: "CulturePanel"
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
  {key: "population", label: "人口"},
  {key: "cities", label: "城市"},
  {key: "states", label: "国家"},
  {key: "id", label: "ID"}
]);

const columns = Object.freeze([
  {key: "id", label: "ID", align: "right"},
  {key: "name", label: "名称"},
  {key: "type", label: "类型"},
  {key: "cells", label: "cells", align: "right"},
  {key: "population", label: "人口", align: "right", format: value => formatNumber(value)},
  {key: "cities", label: "城市", align: "right"}
]);

const metrics = computed(() => buildCultureMetrics(props.state.map));
const visibleRows = computed(() => sortRows(filterRows(metrics.value.rows, props.state.filter), props.state.sortKey, props.state.sortDir));
const selected = computed(() => metrics.value.rows.find(row => row.id === props.state.selectedCultureId) || null);

const summaryMetrics = computed(() => [
  {label: "文化", value: metrics.value.total},
  {label: "筛选", value: visibleRows.value.length},
  {label: "覆盖 cells", value: metrics.value.cells},
  {label: "人口", value: formatNumber(metrics.value.population)},
  {label: "城市", value: metrics.value.cities}
]);

const detailRows = computed(() => selected.value ? [
  {label: "词根", value: selected.value.root},
  {label: "类型", value: selected.value.type},
  {label: "命名风格", value: selected.value.nameStyle},
  {label: "扩张", value: selected.value.expansionism},
  {label: "中心 pack cell", value: selected.value.centerCell},
  {label: "中心 grid cell", value: selected.value.gridCenterCell},
  {label: "覆盖 cells", value: selected.value.cells},
  {label: "面积", value: formatNumber(selected.value.area)},
  {label: "乡村人口", value: formatNumber(selected.value.rural)},
  {label: "城市人口", value: formatNumber(selected.value.urban)},
  {label: "城市", value: selected.value.cities},
  {label: "主要国家", value: selected.value.stateSummary}
] : []);

function buildCultureMetrics(map) {
  const rows = cultureRows(map).map(culture => {
    const cities = cultureCities(map, culture.id);
    const stateStats = cultureStateStats(map, culture.id);
    const urban = cities.reduce((sum, city) => sum + (Number(city.population) || 0), 0);
    const rural = Number(culture.rural) || 0;
    return {
      ...culture,
      urban,
      rural,
      population: rural + urban,
      cities: cities.length,
      states: stateStats.length,
      stateSummary: stateStats.slice(0, 4).map(item => `${item.name} ${item.count}`).join(" / ") || "none",
      color: normalizeHexColor(culture.color) || fallbackCultureColor(culture.id)
    };
  });

  return {
    rows,
    total: rows.length,
    cells: rows.reduce((sum, row) => sum + row.cells, 0),
    population: rows.reduce((sum, row) => sum + row.population, 0),
    cities: rows.reduce((sum, row) => sum + row.cities, 0)
  };
}

function cultureRows(map) {
  return (map?.society?.cultures || map?.pack?.cultures || [])
    .filter(culture => culture && !culture.removed && Number.isInteger(culture.i ?? culture.id) && (culture.i ?? culture.id) > 0)
    .map(culture => ({
      id: culture.i ?? culture.id,
      name: culture.name || `文化 #${culture.i ?? culture.id}`,
      rawName: culture.name || `文化 #${culture.i ?? culture.id}`,
      root: culture.root || (culture.name || "").replace(/文化$/, "") || "none",
      type: culture.type || "Generic",
      nameStyle: culture.nameStyle || "default",
      expansionism: Number.isFinite(culture.expansionism) ? culture.expansionism : "none",
      centerCell: culture.center ?? "none",
      gridCenterCell: culture.gridCenter ?? "none",
      cells: Number(culture.cells) || 0,
      area: Number(culture.area) || 0,
      rural: Number(culture.rural) || 0,
      color: culture.color
    }));
}

function filterRows(rows, filter) {
  const query = filter.trim().toLowerCase();
  if (!query) return rows;
  return rows.filter(row =>
    String(row.id).includes(query)
    || row.name.toLowerCase().includes(query)
    || row.rawName.toLowerCase().includes(query)
    || row.type.toLowerCase().includes(query)
    || row.nameStyle.toLowerCase().includes(query)
    || row.stateSummary.toLowerCase().includes(query)
  );
}

function sortRows(rows, key, direction) {
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (a[key] === b[key]) return a.id - b.id;
    if (typeof a[key] === "string") return a[key].localeCompare(b[key], "zh-CN") * factor;
    return a[key] > b[key] ? factor : -factor;
  });
}

function cultureCities(map, cultureId) {
  return (map?.settlements?.cities || []).filter(city => Number(city?.culture) === cultureId);
}

function cultureStateStats(map, cultureId) {
  const counts = new Map();
  for (const city of cultureCities(map, cultureId)) {
    const stateId = Number(city.state) || 0;
    counts.set(stateId, (counts.get(stateId) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([stateId, count]) => ({
      stateId,
      count,
      name: map?.politics?.states?.[stateId]?.name || (stateId ? `#${stateId}` : "none")
    }))
    .sort((a, b) => b.count - a.count || a.stateId - b.stateId);
}

function normalizeHexColor(color) {
  if (typeof color !== "string") return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}

function fallbackCultureColor(cultureId) {
  const hue = ((Number(cultureId) || 0) * 0.61803398875 + 0.31) % 1;
  const [r, g, b] = hslToRgb(hue, 0.42, 0.56);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hslToRgb(h, s, l) {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hueToRgb(p, q, h + 1 / 3), hueToRgb(p, q, h), hueToRgb(p, q, h - 1 / 3)];
}

function hueToRgb(p, q, t) {
  let value = t;
  if (value < 0) value += 1;
  if (value > 1) value -= 1;
  if (value < 1 / 6) return p + (q - p) * 6 * value;
  if (value < 1 / 2) return q;
  if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
  return p;
}

function toHex(channel) {
  return Math.round(Math.max(0, Math.min(1, channel)) * 255).toString(16).padStart(2, "0");
}

function formatNumber(value) {
  return Number.isFinite(value) ? roundNumber(value).toLocaleString("zh-CN") : "0";
}

function roundNumber(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}
</script>
