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
    resizable-columns
    @select="callbacks.onSelect"
    @column-resize="callbacks.onColumnResize"
  />

  <UiDetailGrid class-name="climate-panel-details" empty-text="未选中温度带" :rows="detailRows" />
</template>

<script setup>
import {computed} from "vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import {formatNumber as formatDisplayNumber, formatPrecipitation} from "../../display-units.js";
import {findByObjectId} from "../../object-id.js";
import {compareRowsByKey} from "../../sort-utils.js";
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
const metrics = computed(() => {
  props.state.version;
  return buildClimateMetrics(props.state.map);
});
const visibleRows = computed(() => sortRows(filterRows(metrics.value.rows, props.state.filter), props.state.sortKey, props.state.sortDir));
const selected = computed(() => findByObjectId(metrics.value.rows, props.state.selectedBandId));

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
</script>
