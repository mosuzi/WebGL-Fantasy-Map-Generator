<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="province-panel-summary" />

  <div class="province-panel-controls">
    <UiFilterInput :model-value="state.filter" placeholder="筛选名称 / id / 国家" @update:model-value="callbacks.onFilter" />
  </div>

  <UiSortBar class-name="province-panel-sort" :options="sortOptions" :active-key="state.sortKey" :direction="state.sortDir" @sort="callbacks.onSort" />

  <UiObjectTable
    :columns="columns"
    :rows="visibleRows"
    :selected-id="state.selectedProvinceId"
    empty-text="没有匹配的省份"
    @select="callbacks.onSelect"
    @locate="callbacks.onLocate"
  />

  <UiDetailGrid class-name="province-panel-details" empty-text="未选中省份" :rows="detailRows" />

  <template v-if="selected">
    <UiTextEditField
      class-name="province-name-editor"
      :model-value="selected.rawName"
      :max-length="48"
      @apply="name => callbacks.onRename(selected.id, name)"
    />

    <UiColorField
      class-name="province-color-field"
      :model-value="selected.color"
      @apply="color => callbacks.onColorChange(selected.id, color)"
    />

    <UiButton variant="secondary" @click="callbacks.onEdit(selected)">编辑此省份</UiButton>
  </template>

  <UiButton :variant="state.active ? 'primary' : 'secondary'" @click="callbacks.onActiveChange(!state.active)">
    {{ state.active ? "停止省份编辑" : "启用省份编辑" }}
  </UiButton>

  <label class="province-select-field">
    <span>目标</span>
    <select :value="state.selectedProvinceId ?? ''" @change="callbacks.onTargetProvinceId(Number($event.target.value))">
      <option v-for="province in provinceOptions" :key="province.id" :value="province.id">{{ province.name }}</option>
    </select>
  </label>

  <div class="province-sample-actions">
    <UiButton variant="secondary" @click="callbacks.onSampleSelection">取选中</UiButton>
    <UiButton variant="secondary" @click="callbacks.onSampleHover">取悬停</UiButton>
  </div>

  <UiSliderField
    label="半径"
    field-class="province-range-field"
    :model-value="state.radius"
    :min="4"
    :max="120"
    :step="2"
    @input="callbacks.onRadius"
  />

  <UiHistoryActions class-name="province-history-actions" :history="state.history" :note-text="historyNote" @undo="callbacks.onUndo" @redo="callbacks.onRedo" />
</template>

<script setup>
import {computed} from "vue";
import UiButton from "./base/UiButton.vue";
import UiColorField from "./base/UiColorField.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiHistoryActions from "./base/UiHistoryActions.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiSliderField from "./base/UiSliderField.vue";
import UiSortBar from "./base/UiSortBar.vue";
import UiTextEditField from "./base/UiTextEditField.vue";

defineOptions({
  name: "ProvincePanel"
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
  {key: "area", label: "面积"},
  {key: "cells", label: "cells"},
  {key: "stateName", label: "国家"},
  {key: "id", label: "ID"}
]);

const columns = Object.freeze([
  {key: "id", label: "ID", align: "right"},
  {key: "name", label: "名称"},
  {key: "stateName", label: "国家"},
  {key: "cells", label: "cells", align: "right"},
  {key: "area", label: "面积", align: "right", format: value => formatNumber(value)}
]);

const metrics = computed(() => buildProvinceMetrics(props.state.map));
const provinceOptions = computed(() => provinceRows(props.state.map));
const visibleRows = computed(() => sortRows(filterRows(metrics.value.rows, props.state.filter), props.state.sortKey, props.state.sortDir));
const selected = computed(() => metrics.value.rows.find(row => row.id === props.state.selectedProvinceId) || null);

const summaryMetrics = computed(() => [
  {label: "状态", value: props.state.active ? "编辑中" : "未启用"},
  {label: "省份", value: metrics.value.total},
  {label: "筛选", value: visibleRows.value.length},
  {label: "目标省份", value: formatProvinceName(props.state.map, props.state.selectedProvinceId)},
  {label: "影响", value: props.state.lastAffected}
]);

const detailRows = computed(() => selected.value ? [
  {label: "全称", value: selected.value.fullName},
  {label: "所属国家", value: selected.value.stateName},
  {label: "中心 pack cell", value: selected.value.centerCell},
  {label: "中心 grid cell", value: selected.value.gridCenterCell},
  {label: "pole", value: selected.value.pole},
  {label: "面积", value: formatNumber(selected.value.area)},
  {label: "cells", value: selected.value.cells},
  {label: "邻接省份", value: selected.value.neighborCount},
  {label: "城市", value: selected.value.cityCount},
  {label: "文化", value: selected.value.culture},
  {label: "宗教", value: selected.value.religion}
] : []);

const historyNote = computed(() => {
  const history = props.state.history;
  const historyText = history ? `undo ${history.undo} / redo ${history.redo} / ${history.lastLabel}` : "none";
  return `历史：${historyText}；来源：${formatProvinceName(props.state.map, props.state.sourceProvinceId)}`;
});

function buildProvinceMetrics(map) {
  const rows = provinceRows(map).map(row => {
    const province = getProvince(map, row.id);
    const state = map?.politics?.states?.[province?.state];
    const centerCell = province?.center ?? 0;
    const cultureId = map?.pack?.cells?.culture?.[centerCell];
    const religionId = province?.religion ?? map?.pack?.cells?.religion?.[centerCell];
    const cityCount = (map?.settlements?.cities || []).filter(city => city?.province === row.id).length;

    return {
      id: row.id,
      name: province?.fullName || province?.name || row.name,
      rawName: province?.name || row.name,
      fullName: province?.fullName || province?.name || row.name,
      stateId: province?.state || 0,
      stateName: state?.fullName || state?.name || (province?.state ? `#${province.state}` : "none"),
      centerCell,
      gridCenterCell: province?.gridCenter ?? map?.pack?.cells?.g?.[centerCell] ?? "none",
      pole: formatPole(province?.pole),
      area: province?.area || 0,
      cells: province?.cells || 0,
      neighborCount: province?.neighbors?.length || 0,
      cityCount,
      culture: indexedName(map?.society?.cultures, cultureId),
      religion: indexedName(map?.society?.religions, religionId),
      color: normalizeHexColor(province?.color) || normalizeHexColor(state?.color) || fallbackProvinceColor(row.id)
    };
  });
  const totalArea = rows.reduce((sum, row) => sum + row.area, 0);
  const maxArea = rows.reduce((max, row) => Math.max(max, row.area), 0);
  return {rows, total: rows.length, totalArea, maxArea};
}

function filterRows(rows, filter) {
  const query = filter.trim().toLowerCase();
  if (!query) return rows;
  return rows.filter(row =>
    String(row.id).includes(query)
    || row.name.toLowerCase().includes(query)
    || row.rawName.toLowerCase().includes(query)
    || row.stateName.toLowerCase().includes(query)
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

function provinceRows(map) {
  return (map?.politics?.provinces || map?.pack?.provinces || [])
    .filter(province => province && !province.removed && Number.isInteger(province.i ?? province.id))
    .map(province => ({
      id: province.i ?? province.id,
      name: province.fullName || province.name || `省份 #${province.i ?? province.id}`
    }));
}

function getProvince(map, provinceId) {
  return map?.politics?.provinces?.[provinceId] || map?.pack?.provinces?.[provinceId] || null;
}

function formatProvinceName(map, provinceId) {
  const province = getProvince(map, provinceId);
  return province?.fullName || province?.name || (provinceId ? `#${provinceId}` : "none");
}

function indexedName(items, id) {
  const item = items?.[id];
  return item?.name || item?.fullName || (id === undefined || id === null ? "none" : String(id));
}

function formatPole(pole) {
  return Array.isArray(pole) ? pole.map(value => roundNumber(value)).join(", ") : "none";
}

function normalizeHexColor(color) {
  if (typeof color !== "string") return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}

function fallbackProvinceColor(provinceId) {
  const hue = ((Number(provinceId) || 0) * 0.61803398875 + 0.3) % 1;
  const [r, g, b] = hslToRgb(hue, 0.38, 0.58);
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
