<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="climate-panel-summary" />

  <div class="climate-panel-controls">
    <UiFilterInput :model-value="state.filter" placeholder="筛选温度带 / id" @update:model-value="callbacks.onFilter" />
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
    :selected-id="state.selectedBandId"
    row-id-key="id"
    :show-locate-action="false"
    empty-text="没有匹配的温度带"
    :empty-action="filterEmptyAction"
    resizable-columns
    @select="callbacks.onSelect"
    @empty-action="handleEmptyAction"
    @column-resize="callbacks.onColumnResize"
  />

  <section class="climate-downstream-rebuild" aria-label="更新受气候影响的内容">
    <header class="climate-downstream-heading">
      <strong>更新受气候影响的内容</strong>
      <span>气候变化后，可按需更新相关地图内容</span>
    </header>
    <UiNumberField
      v-if="debugEnabled"
      class-name="climate-downstream-seed"
      label="固定 seed"
      action-label="设置 seed"
      :model-value="Number(state.downstreamSeed) || 0"
      :min="0"
      :step="1"
      @apply="callbacks.onDownstreamSeed"
    />
    <div class="climate-downstream-candidates">
      <label
        v-for="candidate in downstreamCandidates"
        :key="candidate.id"
        class="climate-downstream-candidate"
        :class="{'is-selected': candidate.selected, 'is-required': candidate.required}"
      >
        <input
          type="checkbox"
          :checked="candidate.requested"
          @change="event => callbacks.onDownstreamSystem(candidate.id, event.target.checked)"
        />
        <span>
          <strong>{{ candidate.label }}</strong>
          <small>预计 {{ formatNumber(candidate.estimatedAffected) }} 对象</small>
        </span>
        <em v-if="candidate.required">将一并更新</em>
        <em v-else-if="candidate.coveredBy && candidate.coveredBy !== candidate.id">已包含在 {{ systemLabel(candidate.coveredBy) }} 中</em>
        <em v-else>{{ candidate.stale ? "建议更新" : "当前已更新" }}</em>
      </label>
    </div>
    <p class="climate-downstream-dependencies">{{ dependencyHint }}</p>
    <div class="climate-downstream-actions">
      <UiButton variant="secondary" :disabled="state.downstreamRunning" @click="callbacks.onInspectDownstream">查看更新范围</UiButton>
      <UiButton :disabled="!canApplyDownstream || state.downstreamRunning" @click="callbacks.onApplyDownstream">
        {{ state.downstreamRunning ? "更新中…" : "更新所选内容" }}
      </UiButton>
    </div>
    <p v-if="state.downstreamRunning" class="climate-downstream-progress">正在更新相关地图内容，完成后会统一刷新。</p>
    <p v-if="state.downstreamError" class="climate-downstream-error">{{ downstreamErrorText }}</p>
    <p v-if="state.downstreamPreview" class="climate-downstream-result">{{ previewSummary }}</p>
    <p v-if="state.downstreamResult" class="climate-downstream-result is-applied">{{ resultSummary }}</p>
    <details v-if="debugEnabled" class="climate-downstream-diagnostics">
      <summary>开发诊断</summary>
      <pre v-if="state.downstreamError" class="climate-downstream-result">{{ state.downstreamError }}</pre>
      <pre v-if="state.downstreamPreview" class="climate-downstream-result">{{ formattedPreview }}</pre>
      <pre v-if="state.downstreamResult" class="climate-downstream-result is-applied">{{ formattedResult }}</pre>
    </details>
  </section>

  <UiDetailGrid class-name="climate-panel-details" empty-text="未选中温度带" :rows="detailRows" />
</template>

<script setup>
import {computed} from "vue";
import UiButton from "./base/UiButton.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiNumberField from "./base/UiNumberField.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import {formatNumber as formatDisplayNumber, formatPrecipitation} from "../../display-units.js";
import {findByObjectId} from "../../object-id.js";
import {compareRowsByKey} from "../../sort-utils.js";
import {useDebugMode} from "../composables/use-debug-mode.js";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";

defineOptions({
  name: "ClimatePanel"
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

const TEMPERATURE_BANDS = Object.freeze([
  {id: "frozen", name: "严寒", min: -Infinity, max: -6},
  {id: "cold", name: "寒冷", min: -6, max: 5},
  {id: "temperate", name: "温和", min: 5, max: 18},
  {id: "warm", name: "暖热", min: 18, max: 25},
  {id: "hot", name: "炎热", min: 25, max: Infinity}
]);

const sortOptions = Object.freeze([
  {key: "cells", label: "cells"},
  {key: "landCells", label: "陆地"},
  {key: "avgTemp", label: "均温"},
  {key: "avgPrec", label: "降水"},
  {key: "dryCells", label: "干旱"},
  {key: "wetCells", label: "湿润"},
  {key: "avgSuitability", label: "适居"}
]);

const columns = Object.freeze([
  {key: "name", label: "温度带"},
  {key: "cells", label: "cells", align: "right", format: value => formatNumber(value)},
  {key: "landCells", label: "陆地", align: "right", format: value => formatNumber(value)},
  {key: "avgTemp", label: "均温", align: "right", format: value => formatTemperature(value)},
  {key: "avgPrec", label: "降水", align: "right", format: value => formatPrecipitationValue(value)},
  {key: "avgSuitability", label: "适居", align: "right", format: value => formatNumber(value)}
]);

const unitPreferences = useUnitPreferences();
const debugEnabled = useDebugMode();
const metrics = computed(() => {
  props.state.version;
  return buildClimateMetrics(props.state.map);
});
const visibleRows = computed(() => sortRows(filterRows(metrics.value.rows, props.state.filter), props.state.sortKey, props.state.sortDir));
const filterEmptyAction = computed(() => String(props.state.filter || "").trim()
  ? {key: "clear-filter", label: "清空筛选", icon: "⌫"}
  : null);
const selected = computed(() => findByObjectId(metrics.value.rows, props.state.selectedBandId));
const downstreamCandidates = computed(() => {
  props.state.version;
  return props.state.downstreamPreview?.candidates || [];
});
const canApplyDownstream = computed(() => Boolean(props.state.downstreamPreview?.requestedSystems?.length));
const dependencyHint = computed(() => {
  const preview = props.state.downstreamPreview;
  if (!preview?.requestedSystems?.length) return "请选择要更新的内容；未选择的内容不会改变。";
  const selected = preview.selectedSystems?.map(systemLabel).join("、") || "无";
  return `将更新：${selected}。相关内容会按安全顺序一并处理。`;
});
const previewSummary = computed(() => {
  const preview = props.state.downstreamPreview;
  if (!preview?.requestedSystems?.length) return "尚未选择需要更新的内容。";
  return `预计影响 ${formatNumber(preview.estimatedAffected || 0)} 个对象。`;
});
const resultSummary = computed(() => {
  const result = props.state.downstreamResult;
  if (!result?.executed) return "未执行更新。";
  const updated = result.selectedSystems?.map(systemLabel).join("、") || "相关地图内容";
  const remaining = result.staleSystems?.map(systemLabel).filter(Boolean) || [];
  return remaining.length
    ? `已更新：${updated}。仍建议更新：${remaining.join("、")}。`
    : `已更新：${updated}。所有相关内容均为最新状态。`;
});
const downstreamErrorText = computed(() => {
  const message = String(props.state.downstreamError || "");
  const failedSystem = message.match(/未完成：([^\s]+)/)?.[1];
  if (failedSystem) return `未能更新${systemLabel(failedSystem)}，地图已恢复到更新前状态。`;
  return "更新未完成，地图已恢复到更新前状态，请重试。";
});
const formattedPreview = computed(() => JSON.stringify({
  seed: props.state.downstreamPreview?.seed,
  requested: props.state.downstreamPreview?.requestedSystems || [],
  required: props.state.downstreamPreview?.requiredSystems || [],
  selected: props.state.downstreamPreview?.selectedSystems || [],
  executionOrder: props.state.downstreamPreview?.executionOrder || [],
  estimatedAffected: props.state.downstreamPreview?.estimatedAffected || 0
}, null, 2));
const formattedResult = computed(() => JSON.stringify({
  executed: props.state.downstreamResult?.executed,
  seed: props.state.downstreamResult?.seed,
  executionOrder: props.state.downstreamResult?.executionOrder || [],
  checksum: props.state.downstreamResult?.checksum || "",
  staleSystems: props.state.downstreamResult?.staleSystems || [],
  history: props.state.downstreamResult?.history || null
}, null, 2));

const summaryMetrics = computed(() => [
  {label: "温度范围", value: `${formatTemperature(metrics.value.temperatureMin)} .. ${formatTemperature(metrics.value.temperatureMax)}`},
  {label: "平均温度", value: formatTemperature(metrics.value.avgTemp)},
  {label: "降水范围", value: `${formatPrecipitationValue(metrics.value.precipitationMin)} .. ${formatPrecipitationValue(metrics.value.precipitationMax)}`},
  {label: "平均降水", value: formatPrecipitationValue(metrics.value.avgPrec)},
  {label: "干旱陆地", value: formatNumber(metrics.value.dryLandCells)},
  {label: "湿润陆地", value: formatNumber(metrics.value.wetLandCells)}
]);

const detailRows = computed(() => selected.value ? [
  {label: "温度带", value: selected.value.name},
  {label: "温度范围", value: selected.value.rangeLabel},
  {label: "cells", value: formatNumber(selected.value.cells)},
  {label: "陆地 cells", value: formatNumber(selected.value.landCells)},
  {label: "水域 cells", value: formatNumber(selected.value.waterCells)},
  {label: "平均温度", value: formatTemperature(selected.value.avgTemp)},
  {label: "平均降水", value: formatPrecipitationValue(selected.value.avgPrec)},
  {label: "干旱陆地", value: formatNumber(selected.value.dryCells)},
  {label: "湿润陆地", value: formatNumber(selected.value.wetCells)},
  {label: "平均适居", value: formatNumber(selected.value.avgSuitability)},
  {label: "纬度", value: metrics.value.latitudeLabel},
  {label: "大气方向", value: metrics.value.atmosphereLabel}
] : []);

function buildClimateMetrics(map) {
  const rows = TEMPERATURE_BANDS.map(band => createEmptyBandRow(band));
  const grid = map?.grid;
  const features = map?.features?.features || [];
  const temp = grid?.cells?.temp || [];
  const prec = grid?.cells?.prec || [];
  const suitability = grid?.cells?.s || [];
  let tempSum = 0;
  let precSum = 0;
  let dryLandCells = 0;
  let wetLandCells = 0;
  let counted = 0;

  for (const cell of grid?.cells?.i || []) {
    const temperature = Number(temp[cell] || 0);
    const precipitation = Number(prec[cell] || 0);
    const feature = features[grid.cells.f?.[cell]];
    const land = Boolean(feature?.land);
    const row = bandForTemperature(rows, temperature);
    row.cells++;
    row.tempSum += temperature;
    row.precSum += precipitation;
    row.suitabilitySum += Number(suitability[cell] || 0);
    if (land) {
      row.landCells++;
      if (precipitation < 24) {
        row.dryCells++;
        dryLandCells++;
      }
      if (precipitation > 72) {
        row.wetCells++;
        wetLandCells++;
      }
    } else {
      row.waterCells++;
    }
    tempSum += temperature;
    precSum += precipitation;
    counted++;
  }

  for (const row of rows) finalizeBandRow(row);
  const metadata = map?.climate?.metadata || {};
  return {
    rows,
    temperatureMin: metadata.temperatureMin ?? minValue(temp),
    temperatureMax: metadata.temperatureMax ?? maxValue(temp),
    precipitationMin: metadata.precipitationMin ?? minValue(prec),
    precipitationMax: metadata.precipitationMax ?? maxValue(prec),
    avgTemp: counted ? tempSum / counted : 0,
    avgPrec: counted ? precSum / counted : 0,
    dryLandCells,
    wetLandCells,
    latitudeLabel: climateLatitudeLabel(map),
    atmosphereLabel: metadata.atmosphereLabel || map?.climate?.mapCoordinates?.atmosphereLabel || "自动风带"
  };
}

function createEmptyBandRow(band) {
  return {
    ...band,
    cells: 0,
    landCells: 0,
    waterCells: 0,
    dryCells: 0,
    wetCells: 0,
    tempSum: 0,
    precSum: 0,
    suitabilitySum: 0,
    avgTemp: 0,
    avgPrec: 0,
    avgSuitability: 0,
    rangeLabel: bandRangeLabel(band)
  };
}

function finalizeBandRow(row) {
  if (!row.cells) return;
  row.avgTemp = row.tempSum / row.cells;
  row.avgPrec = row.precSum / row.cells;
  row.avgSuitability = row.suitabilitySum / row.cells;
}

function bandForTemperature(rows, temperature) {
  return rows.find(row => temperature >= row.min && temperature < row.max) || rows.at(-1);
}

function filterRows(sourceRows, filter) {
  const query = String(filter || "").trim().toLowerCase();
  if (!query) return sourceRows;
  return sourceRows.filter(row =>
    row.id.toLowerCase().includes(query)
    || row.name.toLowerCase().includes(query)
    || row.rangeLabel.toLowerCase().includes(query)
  );
}

function sortRows(sourceRows, key, direction) {
  return [...sourceRows].sort((a, b) => compareRowsByKey(a, b, key, direction));
}

function handleEmptyAction(key) {
  if (key === "clear-filter") props.callbacks.onFilter?.("");
}

function bandRangeLabel(band) {
  if (band.min === -Infinity) return `< ${formatTemperature(band.max)}`;
  if (band.max === Infinity) return `>= ${formatTemperature(band.min)}`;
  return `${formatTemperature(band.min)} .. ${formatTemperature(band.max)}`;
}

function climateLatitudeLabel(map) {
  const metadata = map?.climate?.metadata || {};
  const coordinates = map?.climate?.mapCoordinates || {};
  const label = metadata.latitudeLabel || coordinates.latitudeLabel || "自动纬度";
  const north = Number(coordinates.latN ?? 0);
  const south = Number(coordinates.latS ?? 0);
  return `${label} / ${formatLatitude(south)} 至 ${formatLatitude(north)}`;
}

function formatLatitude(value) {
  const numeric = Number(value) || 0;
  if (numeric > 0) return `${formatNumber(numeric)}°N`;
  if (numeric < 0) return `${formatNumber(Math.abs(numeric))}°S`;
  return "0°";
}

function minValue(values) {
  let min = Infinity;
  for (const value of values || []) if (Number(value) < min) min = Number(value);
  return min === Infinity ? 0 : min;
}

function maxValue(values) {
  let max = -Infinity;
  for (const value of values || []) if (Number(value) > max) max = Number(value);
  return max === -Infinity ? 0 : max;
}

function formatTemperature(value) {
  return `${formatNumber(value)}°C`;
}

function formatPrecipitationValue(value) {
  return formatPrecipitation(value, unitPreferences.value);
}

function formatNumber(value) {
  return formatDisplayNumber(value, unitPreferences.value);
}

function systemLabel(systemId) {
  return downstreamCandidates.value.find(item => item.id === systemId)?.label || "相关内容";
}
</script>
