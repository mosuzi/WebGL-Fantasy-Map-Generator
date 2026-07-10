<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="emblem-panel-summary" />

  <div class="emblem-panel-controls">
    <UiFilterInput :model-value="state.filter" placeholder="筛选对象 / 纹章 / 颜色" @update:model-value="callbacks.onFilter" />
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
    :selected-id="state.selectedEmblemId"
    row-id-key="id"
    :show-locate-action="false"
    empty-text="没有匹配的纹章"
    resizable-columns
    @select="callbacks.onSelect"
    @column-resize="callbacks.onColumnResize"
  />

  <UiDetailGrid class-name="emblem-panel-details" empty-text="未选中纹章" :rows="detailRows" />
</template>

<script setup>
import {computed} from "vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import {formatNumber as formatDisplayNumber} from "../../display-units.js";
import {findByObjectId} from "../../object-id.js";
import {compareRowsByKey} from "../../sort-utils.js";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";

defineOptions({
  name: "EmblemPanel"
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
  {key: "scope", label: "范围"},
  {key: "name", label: "名称"},
  {key: "shield", label: "盾形"},
  {key: "chargeCount", label: "图案"},
  {key: "hasCoa", label: "完整"}
]);

const columns = Object.freeze([
  {key: "scopeLabel", label: "范围"},
  {key: "name", label: "对象"},
  {key: "shield", label: "盾形"},
  {key: "fieldColor", label: "底色"},
  {key: "chargeSummary", label: "图案"},
  {key: "status", label: "状态"}
]);

const unitPreferences = useUnitPreferences();
const metrics = computed(() => {
  props.state.version;
  return buildEmblemMetrics(props.state.map);
});
const visibleRows = computed(() => sortRows(filterRows(metrics.value.rows, props.state.filter), props.state.sortKey, props.state.sortDir));
const selected = computed(() => findByObjectId(metrics.value.rows, props.state.selectedEmblemId));

const summaryMetrics = computed(() => [
  {label: "对象", value: formatNumber(metrics.value.total)},
  {label: "有纹章", value: formatNumber(metrics.value.withCoa)},
  {label: "缺失", value: formatNumber(metrics.value.missing)},
  {label: "国家", value: formatNumber(metrics.value.states)},
  {label: "城市", value: formatNumber(metrics.value.cities)},
  {label: "盾形", value: formatNumber(metrics.value.shields)}
]);

const detailRows = computed(() => selected.value ? [
  {label: "范围", value: selected.value.scopeLabel},
  {label: "对象", value: selected.value.name},
  {label: "所属", value: selected.value.parentName || "无"},
  {label: "状态", value: selected.value.status},
  {label: "盾形", value: selected.value.shield},
  {label: "底色", value: selected.value.fieldColor},
  {label: "图案", value: selected.value.chargeSummary},
  {label: "图案色", value: selected.value.chargeColor},
  {label: "尺寸", value: formatNumber(selected.value.size)},
  {label: "坐标", value: selected.value.position, debug: true}
] : []);

function buildEmblemMetrics(map) {
  const rows = [...stateRows(map), ...cityRows(map)];
  return {
    rows,
    total: rows.length,
    withCoa: rows.filter(row => row.hasCoa).length,
    missing: rows.filter(row => !row.hasCoa).length,
    states: rows.filter(row => row.scope === "state").length,
    cities: rows.filter(row => row.scope === "city").length,
    shields: new Set(rows.filter(row => row.hasCoa).map(row => row.shield)).size
  };
}

function stateRows(map) {
  return (map?.politics?.states || [])
    .filter(item => item && !item.removed && (item.i ?? item.id) > 0)
    .map(item => emblemRow({
      scope: "state",
      scopeLabel: "国家",
      idNumber: item.i ?? item.id,
      name: item.fullName || item.name || `国家 #${item.i ?? item.id}`,
      parentName: "",
      coa: item.coa
    }));
}

function cityRows(map) {
  const states = map?.politics?.states || [];
  return (map?.settlements?.cities || [])
    .filter(item => item && (item.i ?? item.id ?? item.burgId) !== undefined)
    .map(item => {
      const stateId = Number(item.state || 0);
      return emblemRow({
        scope: "city",
        scopeLabel: "城市",
        idNumber: item.i ?? item.id ?? item.burgId,
        name: item.name || `城市 #${item.i ?? item.id ?? item.burgId}`,
        parentName: states[stateId]?.fullName || states[stateId]?.name || (stateId > 0 ? `国家 #${stateId}` : ""),
        coa: item.coa
      });
    });
}

function emblemRow({scope, scopeLabel, idNumber, name, parentName, coa}) {
  const charge = coa?.charges?.[0] || null;
  const hasCoa = Boolean(coa?.shield && coa?.tinctures?.field && charge);
  return {
    id: `${scope}:${idNumber}`,
    scope,
    scopeLabel,
    idNumber,
    name,
    parentName,
    hasCoa,
    status: hasCoa ? "完整" : "缺失",
    shield: coa?.shield || "none",
    fieldColor: coa?.tinctures?.field || "none",
    chargeColor: charge?.tincture || coa?.tinctures?.charge || "none",
    chargeSummary: charge?.charge || "none",
    chargeCount: coa?.charges?.length || 0,
    size: Number(coa?.size || 0),
    position: `${coa?.x ?? "auto"}, ${coa?.y ?? "auto"}`
  };
}

function filterRows(sourceRows, filter) {
  const query = filter.trim().toLowerCase();
  if (!query) return sourceRows;
  return sourceRows.filter(row =>
    row.scopeLabel.toLowerCase().includes(query)
    || row.name.toLowerCase().includes(query)
    || row.parentName.toLowerCase().includes(query)
    || row.shield.toLowerCase().includes(query)
    || row.fieldColor.toLowerCase().includes(query)
    || row.chargeSummary.toLowerCase().includes(query)
  );
}

function sortRows(sourceRows, key, direction) {
  return [...sourceRows].sort((a, b) => compareRowsByKey(a, b, key, direction));
}

function formatNumber(value) {
  return formatDisplayNumber(value, unitPreferences.value);
}
</script>
