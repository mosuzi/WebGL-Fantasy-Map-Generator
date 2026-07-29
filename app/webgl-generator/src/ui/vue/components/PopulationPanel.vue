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

  <UiActionDock v-if="selected" host-id="PopulationPanel" v-model:active="activeAction" :actions="populationActions">
    <template #adjustment>
      <div class="population-adjustment-editor" aria-label="区域人口增减">
        <ElForm label-position="top" size="small">
          <ElFormItem label="人口增减量">
            <ElInputNumber
              :model-value="state.adjustmentDelta"
              :min="-1000000"
              :max="1000000"
              :step="1"
              controls-position="right"
              @update:model-value="callbacks.onAdjustmentDelta"
            />
          </ElFormItem>
        </ElForm>
        <div class="population-adjustment-actions">
          <UiButton variant="secondary" @click="callbacks.onInspectAdjustment">预检</UiButton>
          <UiButton v-if="state.adjustmentInspection?.valid" variant="primary" @click="callbacks.onApplyAdjustment">应用单次调整</UiButton>
        </div>
        <UiStateBanner
          v-if="adjustmentFeedback"
          :kind="adjustmentFeedback.kind"
          :title="adjustmentFeedback.title"
          :message="adjustmentFeedback.message"
        />
      </div>
    </template>
    <template #transfer>
      <div class="population-transfer-editor" aria-label="区域人口转移">
        <ElForm label-position="top" size="small">
          <ElFormItem label="目标区域">
            <ElSelect
              :model-value="state.transferTargetId"
              placeholder="选择同类型目标"
              @update:model-value="callbacks.onTransferTarget"
            >
              <ElOption v-for="row in transferTargets" :key="row.id" :label="row.name" :value="row.id" />
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="转移人口">
            <ElInputNumber
              :model-value="state.transferAmount"
              :min="1"
              :max="1000000"
              :step="1"
              controls-position="right"
              @update:model-value="callbacks.onTransferAmount"
            />
          </ElFormItem>
        </ElForm>
        <div class="population-adjustment-actions">
          <UiButton variant="secondary" @click="callbacks.onInspectTransfer">预检转移</UiButton>
          <UiButton v-if="state.transferInspection?.valid" variant="primary" @click="callbacks.onApplyTransfer">确认转移</UiButton>
        </div>
        <UiStateBanner
          v-if="transferFeedback"
          :kind="transferFeedback.kind"
          :title="transferFeedback.title"
          :message="transferFeedback.message"
        />
      </div>
    </template>
  </UiActionDock>
</template>

<script setup>
import {computed, ref} from "vue";
import UiActionDock from "./base/UiActionDock.vue";
import UiButton from "./base/UiButton.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiStateBanner from "./base/UiStateBanner.vue";
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
const activeAction = ref(null);
const populationActions = Object.freeze([
  {key: "adjustment", resultClass: "open-secondary", label: "区域人口增减", icon: "±", panelWidth: 360, panelHeight: 310},
  {key: "transfer", resultClass: "open-secondary", label: "区域人口转移", icon: "⇄", panelWidth: 380, panelHeight: 390}
]);
const metrics = computed(() => {
  props.state.version;
  return buildPopulationMetrics(props.state.map);
});
const visibleRows = computed(() => sortRows(filterRows(metrics.value.rows, props.state.filter), props.state.sortKey, props.state.sortDir));
const filterEmptyAction = computed(() => String(props.state.filter || "").trim()
  ? {key: "clear-filter", label: "清空筛选", icon: "⌫"}
  : null);
const selected = computed(() => findByObjectId(metrics.value.rows, props.state.selectedPopulationId));
const transferTargets = computed(() => {
  const source = selected.value;
  if (!source) return [];
  return metrics.value.rows.filter(row => row.scope === source.scope && row.id !== source.id);
});
const adjustmentFeedback = computed(() => {
  props.state.version;
  const inspection = props.state.adjustmentInspection;
  if (inspection) {
    if (!inspection.valid) return {kind: "error", title: "预检未通过", message: inspection.reason || "人口调整参数无效"};
    return {
      kind: "preview",
      title: `${inspection.targetName}：${signedPopulation(inspection.delta)}`,
      message: `总人口 ${formatPopulationValue(inspection.totalBefore)} → ${formatPopulationValue(inspection.totalAfter)}；乡村 ${formatPopulationValue(inspection.ruralAfter)}，城市 ${formatPopulationValue(inspection.urbanAfter)}。`
    };
  }
  const result = props.state.adjustmentResult;
  if (!result) return null;
  if (result.error) return {kind: "error", title: "调整失败", message: result.error.message || "人口调整事务没有提交"};
  if (!result.executed) return {kind: "empty", title: "人口没有变化", message: "本次调整未形成有效变更。"};
  return {
    kind: "selected",
    title: "人口调整已提交",
    message: `已更新 ${formatNumber(result.result?.packCells || 0)} 个人口 cells 和 ${formatNumber(result.result?.cities || 0)} 个城市，可通过历史撤销。`
  };
});
const transferFeedback = computed(() => {
  props.state.version;
  const inspection = props.state.transferInspection;
  if (inspection) {
    if (!inspection.valid) return {kind: "error", title: "转移预检未通过", message: inspection.reason || "人口转移参数无效"};
    return {
      kind: "preview",
      title: `${inspection.sourceName} → ${inspection.targetName}`,
      message: `实际转移 ${formatPopulationValue(inspection.actualAmount)}；来源可转移 ${formatPopulationValue(inspection.sourceTransferable)}，目标容量 ${formatPopulationValue(inspection.targetCapacity)}；双方保持各自现有城乡比例。`
    };
  }
  const result = props.state.transferResult;
  if (!result) return null;
  if (result.error) return {kind: "error", title: "转移失败", message: result.error.message || "人口转移事务没有提交"};
  if (!result.executed) return {kind: "empty", title: "人口没有变化", message: "本次转移未形成有效变更。"};
  return {
    kind: "selected",
    title: "人口转移已提交",
    message: `已守恒转移 ${formatPopulationValue(result.result?.amount || 0)}，可通过历史撤销。`
  };
});

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

function signedPopulation(value) {
  const number = Number(value) || 0;
  return `${number > 0 ? "+" : ""}${formatPopulationValue(number)}`;
}
</script>
