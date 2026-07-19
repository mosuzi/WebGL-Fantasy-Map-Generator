<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="biome-panel-summary" />

  <div class="biome-panel-controls">
    <UiFilterInput :model-value="state.filter" placeholder="筛选名称 / id" @update:model-value="callbacks.onFilter" />
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
    :selected-id="state.selectedBiomeId"
    :show-locate-action="false"
    empty-text="没有匹配的生物群系"
    :empty-action="filterEmptyAction"
    resizable-columns
    @select="callbacks.onSelect"
    @empty-action="handleEmptyAction"
    @column-resize="callbacks.onColumnResize"
  />

  <UiDetailGrid class-name="biome-panel-details" empty-text="未选中生物群系" :rows="detailRows" />

  <UiActionDock v-if="selected" v-model:active="activeAction" :actions="biomeActions">
    <template #assign>
      <div class="biome-assignment-editor">
        <UiSelectField
          input-id="biome-assignment-target"
          label="目标生物群系"
          :model-value="state.selectedBiomeId"
          :options="biomeOptions"
          @update:model-value="callbacks.onAssignmentTarget"
        />
        <UiSelectField
          input-id="biome-assignment-scope"
          label="作用范围"
          :model-value="state.assignmentScope"
          :options="scopeOptions"
          @update:model-value="callbacks.onAssignmentScope"
        />
        <UiSliderField
          label="画笔大小"
          :model-value="state.assignmentRadius"
          :min="brushRadius.min"
          :max="brushRadius.max"
          :step="brushRadius.step"
          unit-label="地图单位"
          @input="callbacks.onAssignmentRadius"
        />
        <UiStateBanner
          :kind="assignmentBanner.kind"
          title="生物群系归属笔刷"
          :message="assignmentBanner.message"
        />
      </div>
    </template>
    <template #suitability>
      <div class="biome-assignment-editor">
        <UiSelectField
          input-id="biome-suitability-mode"
          label="编辑方式"
          :model-value="state.suitabilityMode"
          :options="suitabilityModeOptions"
          @update:model-value="callbacks.onSuitabilityMode"
        />
        <UiSliderField
          v-if="state.suitabilityMode === 'set'"
          label="目标适居度"
          :model-value="state.suitabilityValue"
          :min="suitabilityRange.min"
          :max="suitabilityRange.max"
          :step="suitabilityRange.step"
          @input="callbacks.onSuitabilityValue"
        />
        <UiSelectField
          input-id="biome-suitability-scope"
          label="作用范围"
          :model-value="state.suitabilityScope"
          :options="suitabilityScopeOptions"
          @update:model-value="callbacks.onSuitabilityScope"
        />
        <UiSliderField
          label="画笔大小"
          :model-value="state.suitabilityRadius"
          :min="suitabilityBrushRadius.min"
          :max="suitabilityBrushRadius.max"
          :step="suitabilityBrushRadius.step"
          unit-label="地图单位"
          @input="callbacks.onSuitabilityRadius"
        />
        <UiStateBanner
          :kind="suitabilityBanner.kind"
          title="数值适居度笔刷"
          :message="suitabilityBanner.message"
        />
      </div>
    </template>
  </UiActionDock>
</template>

<script setup>
import {computed, ref, watch} from "vue";
import UiActionDock from "./base/UiActionDock.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiSelectField from "./base/UiSelectField.vue";
import UiSliderField from "./base/UiSliderField.vue";
import UiStateBanner from "./base/UiStateBanner.vue";
import {formatArea, formatNumber as formatDisplayNumber, formatPopulation} from "../../display-units.js";
import {findByObjectId} from "../../object-id.js";
import {compareRowsByKey} from "../../sort-utils.js";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";
import {BRUSH_RADIUS_ID, readBrushRadiusContract} from "../../../runtime/brush-radius-contract.js";
import {resolveBiomeDescriptor} from "../../../generator/biome-registry.js";
import {SUITABILITY_VALUE_RANGE} from "../../../generator/suitability.js";

const brushRadius = readBrushRadiusContract(BRUSH_RADIUS_ID.BIOME);
const suitabilityBrushRadius = readBrushRadiusContract(BRUSH_RADIUS_ID.SUITABILITY);
const suitabilityRange = SUITABILITY_VALUE_RANGE;

defineOptions({
  name: "BiomePanel"
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
  {key: "population", label: "人口"},
  {key: "suitabilityAvg", label: "适居"},
  {key: "cities", label: "城市"},
  {key: "habitability", label: "基准"},
  {key: "id", label: "ID"}
]);

const columns = Object.freeze([
  {key: "id", label: "ID", align: "right"},
  {key: "name", label: "名称"},
  {key: "cells", label: "cells", align: "right", format: value => formatNumber(value)},
  {key: "area", label: "面积", align: "right", format: value => formatAreaValue(value)},
  {key: "suitabilityAvg", label: "适居", align: "right", format: value => formatNumber(value)},
  {key: "population", label: "人口", align: "right", format: value => formatPopulationValue(value)}
]);

const unitPreferences = useUnitPreferences();
const activeAction = ref(null);
const metrics = computed(() => {
  props.state.version;
  return buildBiomeMetrics(props.state.map);
});
const visibleRows = computed(() => sortRows(filterRows(metrics.value.rows, props.state.filter), props.state.sortKey, props.state.sortDir));
const filterEmptyAction = computed(() => String(props.state.filter || "").trim()
  ? {key: "clear-filter", label: "清空筛选", icon: "⌫"}
  : null);
const selected = computed(() => findByObjectId(metrics.value.rows, props.state.selectedBiomeId));
const biomeActions = Object.freeze([
  {key: "assign", label: "归属笔刷", icon: "◉"},
  {key: "suitability", label: "数值适居度", icon: "∿"}
]);
const biomeOptions = computed(() => metrics.value.rows.map(row => ({value: row.id, label: `${row.name}（#${row.id}）`})));
const scopeOptions = Object.freeze([
  {value: "land", label: "陆地"},
  {value: "water", label: "水域"}
]);
const suitabilityModeOptions = Object.freeze([
  {value: "set", label: "直接设值"},
  {value: "reset", label: "恢复自动基准"}
]);
const suitabilityScopeOptions = Object.freeze([
  {value: "land", label: "陆地"},
  {value: "water", label: "水域"},
  {value: "all", label: "全部"}
]);
const assignmentBanner = computed(() => {
  const targetScope = Number(props.state.selectedBiomeId) === 0 ? "water" : "land";
  if (props.state.assignmentScope !== targetScope) return {kind: "error", message: targetScope === "water" ? "海洋群系只能用于水域。" : "陆地群系不能用于水域。"};
  const preview = props.state.assignmentPreview;
  if (!preview) return {kind: "info", message: `按住鼠标在地图上涂刷；抬手提交一条历史。最近影响 ${formatNumber(props.state.lastAffected || 0)} cells。`};
  if (!preview.valid) return {kind: "error", message: `${preview.code || "invalid"}：${preview.reason || "预览无效"}`};
  const warning = preview.warningCells ? `；${formatNumber(preview.warningCells)} cells 存在气候或高度异常：${preview.warnings.join("、")}` : "；没有气候高度异常";
  return {kind: preview.warningCells ? "preview" : "info", message: `预览 ${formatNumber(preview.changedGridCells?.length || 0)} grid cells${warning}`};
});
const suitabilityBanner = computed(() => {
  const preview = props.state.suitabilityPreview;
  if (preview && !preview.valid) return {kind: "error", message: `${preview.code || "invalid"}：${preview.reason || "预览无效"}`};
  if (preview?.valid) {
    const verb = preview.mode === "reset" ? "恢复基准" : `设为 ${preview.value}`;
    return {kind: "preview", message: `预览将 ${formatNumber(preview.changedPackCells?.length || 0)} 个 pack cells ${verb}；水域人口承载恒为 0。`};
  }
  const verb = props.state.suitabilityMode === "reset" ? "恢复自动生成的基准值" : `直接设为 ${formatNumber(props.state.suitabilityValue)}`;
  return {kind: "info", message: `按住鼠标涂刷，抬手提交一条历史；${verb}。最近影响 ${formatNumber(props.state.suitabilityLastAffected || 0)} 个 grid cells；水域人口承载恒为 0。`};
});

watch(activeAction, (next, previous) => {
  if (next === "assign") props.callbacks.onAssignmentActive?.(true);
  if (previous === "assign" && next !== "assign") props.callbacks.onAssignmentActive?.(false);
  if (next === "suitability") props.callbacks.onSuitabilityActive?.(true);
  if (previous === "suitability" && next !== "suitability") props.callbacks.onSuitabilityActive?.(false);
});

watch(() => props.state.assignmentActive, active => {
  if (!active && activeAction.value === "assign") activeAction.value = null;
});

watch(() => props.state.suitabilityActive, active => {
  if (!active && activeAction.value === "suitability") activeAction.value = null;
});

const summaryMetrics = computed(() => [
  {label: "群系", value: formatNumber(metrics.value.total)},
  {label: "陆地 cells", value: formatNumber(metrics.value.landCells)},
  {label: "适居 cells", value: formatNumber(metrics.value.positiveSuitabilityCells)},
  {label: "人口 cells", value: formatNumber(metrics.value.positivePopulationCells)},
  {label: "总人口", value: formatPopulationValue(metrics.value.population)},
  {label: "最高适居", value: formatNumber(metrics.value.maxSuitability)}
]);

const detailRows = computed(() => selected.value ? [
  {label: "名称", value: selected.value.name},
  {label: "生态说明", value: selected.value.description},
  {label: "颜色", value: selected.value.colorText},
  {label: "基准适居", value: formatNumber(selected.value.habitability)},
  {label: "pack cells", value: formatNumber(selected.value.cells)},
  {label: "陆地 cells", value: formatNumber(selected.value.landCells)},
  {label: "面积", value: formatAreaValue(selected.value.area)},
  {label: "平均适居", value: formatNumber(selected.value.suitabilityAvg)},
  {label: "最高适居", value: formatNumber(selected.value.suitabilityMax)},
  {label: "人口", value: formatPopulationValue(selected.value.population)},
  {label: "最高人口", value: formatPopulationValue(selected.value.populationMax)},
  {label: "城市", value: formatNumber(selected.value.cities)}
] : []);

function buildBiomeMetrics(map) {
  const biomes = map?.climate?.biomes || [];
  const rows = biomes.map(biome => createBiomeRow(map, biome));
  const metadata = map?.climate?.metadata || {};
  return {
    rows,
    total: rows.length,
    landCells: rows.reduce((sum, row) => sum + row.landCells, 0),
    positiveSuitabilityCells: metadata.positiveSuitabilityCells ?? rows.reduce((sum, row) => sum + row.positiveSuitabilityCells, 0),
    positivePopulationCells: metadata.positivePopulationCells ?? rows.reduce((sum, row) => sum + row.positivePopulationCells, 0),
    population: rows.reduce((sum, row) => sum + row.population, 0),
    maxSuitability: metadata.maxSuitability ?? rows.reduce((max, row) => Math.max(max, row.suitabilityMax), 0)
  };
}

function createBiomeRow(map, biome) {
  const id = biome.id;
  const descriptor = resolveBiomeDescriptor(biome, map?.climate?.biomes);
  const packCells = map?.pack?.cells;
  const cellIds = packCells?.i || [];
  let cells = 0;
  let landCells = 0;
  let area = 0;
  let suitability = 0;
  let suitabilityMax = 0;
  let positiveSuitabilityCells = 0;
  let population = 0;
  let populationMax = 0;
  let positivePopulationCells = 0;

  for (const cell of cellIds) {
    if (packCells.biome?.[cell] !== id) continue;
    const cellSuitability = Number(packCells.s?.[cell] || 0);
    const cellPopulation = Number(packCells.pop?.[cell] || 0);
    cells++;
    area += Number(packCells.area?.[cell] || 0);
    suitability += cellSuitability;
    suitabilityMax = Math.max(suitabilityMax, cellSuitability);
    population += cellPopulation;
    populationMax = Math.max(populationMax, cellPopulation);
    if ((packCells.h?.[cell] || 0) >= 20) landCells++;
    if (cellSuitability > 0) positiveSuitabilityCells++;
    if (cellPopulation > 0) positivePopulationCells++;
  }

  return {
    id,
    name: descriptor.name,
    canonicalName: descriptor.canonicalName,
    description: descriptor.description,
    colorText: formatBiomeColor(biome.color),
    habitability: Number(biome.habitability || 0),
    cells,
    landCells,
    area,
    suitabilityAvg: cells ? Math.round((suitability / cells) * 10) / 10 : 0,
    suitabilityMax,
    positiveSuitabilityCells,
    population,
    populationMax,
    positivePopulationCells,
    cities: countCitiesInBiome(map, id)
  };
}

function countCitiesInBiome(map, biomeId) {
  const packCells = map?.pack?.cells;
  if (!packCells?.biome) return 0;
  return (map?.settlements?.cities || []).filter(city => packCells.biome?.[city.cell] === biomeId).length;
}

function filterRows(sourceRows, filter) {
  const query = filter.trim().toLowerCase();
  if (!query) return sourceRows;
  return sourceRows.filter(row =>
    String(row.id).includes(query)
    || row.name.toLowerCase().includes(query)
    || row.canonicalName.toLowerCase().includes(query)
  );
}

function sortRows(sourceRows, key, direction) {
  return [...sourceRows].sort((a, b) => compareRowsByKey(a, b, key, direction));
}

function handleEmptyAction(key) {
  if (key === "clear-filter") props.callbacks.onFilter?.("");
}

function formatBiomeColor(color) {
  if (!Array.isArray(color)) return "未定义";
  return color.slice(0, 4).map(value => Number(value).toFixed(2)).join(", ");
}

function formatAreaValue(value) {
  return formatArea(value, unitPreferences.value);
}

function formatPopulationValue(value) {
  return formatPopulation(value, unitPreferences.value);
}

function formatNumber(value) {
  return formatDisplayNumber(value, unitPreferences.value);
}
</script>
