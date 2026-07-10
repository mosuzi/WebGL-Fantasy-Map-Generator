<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="population-panel-summary" />

  <div class="population-panel-controls">
    <UiFilterInput :model-value="state.filter" placeholder="筛选范围 / 名称 / 所属" @update:model-value="callbacks.onFilter" />
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
    :selected-id="state.selectedPopulationId"
    row-id-key="id"
    :show-locate-action="false"
    empty-text="没有匹配的人口统计"
    :empty-action="filterEmptyAction"
    resizable-columns
    @select="callbacks.onSelect"
    @empty-action="handleEmptyAction"
    @column-resize="callbacks.onColumnResize"
  />

  <UiDetailGrid class-name="population-panel-details" empty-text="未选中人口统计" :rows="detailRows" />
</template>

<script setup>
import {computed} from "vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import {formatArea, formatNumber as formatDisplayNumber, formatPopulation} from "../../display-units.js";
import {findByObjectId} from "../../object-id.js";
import {compareRowsByKey} from "../../sort-utils.js";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";

defineOptions({
  name: "PopulationPanel"
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
  {key: "population", label: "人口"},
  {key: "rural", label: "乡村"},
  {key: "urban", label: "城市"},
  {key: "density", label: "密度"},
  {key: "cities", label: "城镇"},
  {key: "scope", label: "范围"}
]);

const columns = Object.freeze([
  {key: "scopeLabel", label: "范围"},
  {key: "name", label: "名称"},
  {key: "parentName", label: "所属"},
  {key: "population", label: "人口", align: "right", format: value => formatPopulationValue(value)},
  {key: "rural", label: "乡村", align: "right", format: value => formatPopulationValue(value)},
  {key: "urban", label: "城市", align: "right", format: value => formatPopulationValue(value)},
  {key: "density", label: "密度", align: "right", format: value => formatDensity(value)}
]);

const unitPreferences = useUnitPreferences();
const metrics = computed(() => {
  props.state.version;
  return buildPopulationMetrics(props.state.map);
});
const visibleRows = computed(() => sortRows(filterRows(metrics.value.rows, props.state.filter), props.state.sortKey, props.state.sortDir));
const filterEmptyAction = computed(() => String(props.state.filter || "").trim()
  ? {key: "clear-filter", label: "清空筛选", icon: "⌫"}
  : null);
const selected = computed(() => findByObjectId(metrics.value.rows, props.state.selectedPopulationId));

const summaryMetrics = computed(() => [
  {label: "总人口", value: formatPopulationValue(metrics.value.population)},
  {label: "乡村", value: formatPopulationValue(metrics.value.rural)},
  {label: "城市", value: formatPopulationValue(metrics.value.urban)},
  {label: "城镇", value: formatNumber(metrics.value.cities)},
  {label: "人口 cells", value: formatNumber(metrics.value.populationCells)},
  {label: "最高 cell", value: formatPopulationValue(metrics.value.maxCellPopulation)}
]);

const detailRows = computed(() => selected.value ? [
  {label: "范围", value: selected.value.scopeLabel},
  {label: "名称", value: selected.value.name},
  {label: "所属", value: selected.value.parentName || "无"},
  {label: "人口", value: formatPopulationValue(selected.value.population)},
  {label: "乡村人口", value: formatPopulationValue(selected.value.rural)},
  {label: "城市人口", value: formatPopulationValue(selected.value.urban)},
  {label: "城镇", value: formatNumber(selected.value.cities)},
  {label: "面积", value: formatAreaValue(selected.value.area)},
  {label: "密度", value: formatDensity(selected.value.density)},
  {label: "cells", value: formatNumber(selected.value.cells), debug: true}
] : []);

function buildPopulationMetrics(map) {
  const rows = [
    ...stateRows(map),
    ...provinceRows(map),
    ...cultureRows(map),
    ...religionRows(map)
  ];
  const rural = sumStates(map, "rural");
  const urban = sumCities(map?.settlements?.cities || []);
  const packPopulation = Array.from(map?.pack?.cells?.pop || []);
  return {
    rows,
    rural,
    urban,
    population: rural + urban,
    cities: (map?.settlements?.cities || []).filter(Boolean).length,
    populationCells: packPopulation.filter(value => value > 0).length,
    maxCellPopulation: packPopulation.reduce((max, value) => Math.max(max, Number(value) || 0), 0)
  };
}

function stateRows(map) {
  return (map?.politics?.states || [])
    .filter(item => item && !item.removed && (item.i ?? item.id) > 0)
    .map(item => populationRow({
      scope: "state",
      scopeLabel: "国家",
      idNumber: item.i ?? item.id,
      name: item.fullName || item.name || `国家 #${item.i ?? item.id}`,
      parentName: "",
      rural: Number(item.rural || 0),
      urban: sumCities(citiesByField(map, "state", item.i ?? item.id)),
      cities: citiesByField(map, "state", item.i ?? item.id).length,
      area: Number(item.area || 0),
      cells: Number(item.cells || 0)
    }));
}

function provinceRows(map) {
  const states = map?.politics?.states || [];
  return (map?.politics?.provinces || map?.pack?.provinces || [])
    .filter(item => item && !item.removed && (item.i ?? item.id) > 0)
    .map(item => {
      const stateId = Number(item.state || 0);
      return populationRow({
        scope: "province",
        scopeLabel: "省份",
        idNumber: item.i ?? item.id,
        name: item.fullName || item.name || `省份 #${item.i ?? item.id}`,
        parentName: states[stateId]?.fullName || states[stateId]?.name || (stateId > 0 ? `国家 #${stateId}` : ""),
        rural: Number(item.rural || 0),
        urban: sumCities(citiesByField(map, "province", item.i ?? item.id)),
        cities: citiesByField(map, "province", item.i ?? item.id).length,
        area: Number(item.area || 0),
        cells: Number(item.cells || 0)
      });
    });
}

function cultureRows(map) {
  return (map?.society?.cultures || map?.pack?.cultures || [])
    .filter(item => item && !item.removed && (item.i ?? item.id) > 0)
    .map(item => {
      const cities = citiesByField(map, "culture", item.i ?? item.id);
      return populationRow({
        scope: "culture",
        scopeLabel: "文化",
        idNumber: item.i ?? item.id,
        name: item.name || `文化 #${item.i ?? item.id}`,
        parentName: parentName(map?.society?.cultures || map?.pack?.cultures || [], item.parent, "文化"),
        rural: Number(item.rural || 0),
        urban: sumCities(cities),
        cities: cities.length,
        area: Number(item.area || 0),
        cells: Number(item.cells || 0)
      });
    });
}

function religionRows(map) {
  return (map?.society?.religions || map?.pack?.religions || [])
    .filter(item => item && !item.removed && (item.i ?? item.id) > 0)
    .map(item => {
      const cities = citiesByField(map, "religion", item.i ?? item.id);
      return populationRow({
        scope: "religion",
        scopeLabel: "宗教",
        idNumber: item.i ?? item.id,
        name: item.name || `宗教 #${item.i ?? item.id}`,
        parentName: parentName(map?.society?.religions || map?.pack?.religions || [], item.parent, "宗教"),
        rural: Number(item.rural || 0),
        urban: sumCities(cities),
        cities: cities.length,
        area: Number(item.area || 0),
        cells: Number(item.cells || 0)
      });
    });
}

function populationRow(row) {
  const population = row.rural + row.urban;
  return {
    ...row,
    id: `${row.scope}:${row.idNumber}`,
    population,
    density: row.area > 0 ? population / row.area : 0
  };
}

function citiesByField(map, field, value) {
  return (map?.settlements?.cities || []).filter(city => Number(city?.[field]) === Number(value));
}

function sumCities(cities) {
  return cities.reduce((sum, city) => sum + (Number(city?.population) || 0), 0);
}

function sumStates(map, field) {
  return (map?.politics?.states || []).reduce((sum, item) => sum + (item && !item.removed ? Number(item[field] || 0) : 0), 0);
}

function parentName(items, parentId, fallback) {
  parentId = Number(parentId || 0);
  if (!parentId) return "根";
  return items[parentId]?.name || `${fallback} #${parentId}`;
}

function filterRows(sourceRows, filter) {
  const query = filter.trim().toLowerCase();
  if (!query) return sourceRows;
  return sourceRows.filter(row =>
    row.scopeLabel.toLowerCase().includes(query)
    || row.name.toLowerCase().includes(query)
    || row.parentName.toLowerCase().includes(query)
  );
}

function sortRows(sourceRows, key, direction) {
  return [...sourceRows].sort((a, b) => compareRowsByKey(a, b, key, direction));
}

function handleEmptyAction(key) {
  if (key === "clear-filter") props.callbacks.onFilter?.("");
}

function formatAreaValue(value) {
  return formatArea(value, unitPreferences.value);
}

function formatPopulationValue(value) {
  return formatPopulation(value, unitPreferences.value);
}

function formatDensity(value) {
  return `${formatNumber(value)}/面积`;
}

function formatNumber(value) {
  return formatDisplayNumber(value, unitPreferences.value);
}
</script>
