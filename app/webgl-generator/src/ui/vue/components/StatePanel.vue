<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="state-panel-summary" />

  <div class="state-panel-controls">
    <UiFilterInput :model-value="state.filter" placeholder="筛选名称 / id / 首都" @update:model-value="callbacks.onFilter" />
  </div>

  <UiSortBar class-name="state-panel-sort" :options="sortOptions" :active-key="state.sortKey" :direction="state.sortDir" @sort="callbacks.onSort" />

  <UiObjectTable
    :columns="columns"
    :rows="visibleRows"
    :selected-id="state.targetStateId"
    empty-text="没有匹配的国家"
    @select="callbacks.onSelect"
    @locate="callbacks.onLocate"
  />

  <UiDetailGrid class-name="state-panel-details" empty-text="未选中国家" :rows="detailRows" />

  <template v-if="selected">
    <UiTextEditField
      class-name="state-name-editor"
      :model-value="selected.rawName"
      :max-length="48"
      @apply="name => callbacks.onRename(selected.id, name)"
    />

    <UiButton variant="secondary" @click="callbacks.onEdit(selected)">编辑此国家</UiButton>

    <UiColorField
      class-name="state-color-field"
      :model-value="selected.color"
      @apply="color => callbacks.onColorChange(selected.id, color)"
    />

    <div class="state-capital-field">
      <label>
        <span>首都</span>
        <select :value="capitalDraft" :disabled="!capitalOptions.length" @change="capitalDraft = Number($event.target.value)">
          <option v-for="city in capitalOptions" :key="city.burgId" :value="city.burgId">{{ city.name }}</option>
        </select>
      </label>
      <UiButton variant="secondary" :disabled="!capitalOptions.length" @click="callbacks.onCapitalChange(selected.id, capitalDraft)">设为首都</UiButton>
    </div>
  </template>

  <UiButton :variant="state.active ? 'primary' : 'secondary'" @click="callbacks.onActiveChange(!state.active)">
    {{ state.active ? "停止国家编辑" : "启用国家编辑" }}
  </UiButton>

  <label class="state-select-field">
    <span>目标</span>
    <select :value="state.targetStateId ?? ''" @change="callbacks.onTargetStateId(Number($event.target.value))">
      <option v-for="item in stateOptions" :key="item.id" :value="item.id">{{ item.name }}</option>
    </select>
  </label>

  <div class="state-sample-actions">
    <UiButton variant="secondary" @click="callbacks.onSampleSelection">取选中</UiButton>
    <UiButton variant="secondary" @click="callbacks.onSampleHover">取悬停</UiButton>
  </div>

  <UiSliderField
    label="半径"
    field-class="state-range-field"
    :model-value="state.radius"
    :min="4"
    :max="120"
    :step="2"
    @input="callbacks.onRadius"
  />

  <UiHistoryActions class-name="state-history-actions" :history="state.history" :note-text="historyNote" @undo="callbacks.onUndo" @redo="callbacks.onRedo" />
</template>

<script setup>
import {computed, ref, watch} from "vue";
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
  name: "StatePanel"
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
  {key: "burgs", label: "城镇"},
  {key: "area", label: "面积"},
  {key: "id", label: "ID"}
]);

const columns = Object.freeze([
  {key: "id", label: "ID", align: "right"},
  {key: "name", label: "名称"},
  {key: "capitalName", label: "首都"},
  {key: "burgs", label: "城镇", align: "right"},
  {key: "population", label: "人口", align: "right", format: value => formatNumber(value)}
]);

const capitalDraft = ref(0);
const metrics = computed(() => buildStateMetrics(props.state.map));
const stateOptions = computed(() => stateRows(props.state.map));
const visibleRows = computed(() => sortRows(filterRows(metrics.value.rows, props.state.filter), props.state.sortKey, props.state.sortDir));
const selected = computed(() => metrics.value.rows.find(row => row.id === props.state.targetStateId) || null);
const capitalOptions = computed(() => stateCities(props.state.map, selected.value?.id));

const summaryMetrics = computed(() => [
  {label: "状态", value: props.state.active ? "编辑中" : "未启用"},
  {label: "国家", value: metrics.value.total},
  {label: "筛选", value: visibleRows.value.length},
  {label: "目标国家", value: formatStateName(props.state.map, props.state.targetStateId)},
  {label: "影响", value: props.state.lastAffected}
]);

const detailRows = computed(() => selected.value ? [
  {label: "全称", value: selected.value.fullName},
  {label: "首都", value: selected.value.capitalName},
  {label: "文化", value: selected.value.culture},
  {label: "宗教", value: selected.value.religion},
  {label: "中心 cell", value: selected.value.centerCell},
  {label: "面积", value: formatNumber(selected.value.area)},
  {label: "城镇", value: selected.value.burgs},
  {label: "人口", value: formatNumber(selected.value.population)},
  {label: "邻国", value: selected.value.neighborCount}
] : []);

const historyNote = computed(() => {
  const history = props.state.history;
  const historyText = history ? `undo ${history.undo} / redo ${history.redo} / ${history.lastLabel}` : "none";
  return `历史：${historyText}；来源：${formatStateName(props.state.map, props.state.sourceStateId)}`;
});

watch(() => selected.value?.capitalBurgId, next => {
  capitalDraft.value = Number(next) || capitalOptions.value[0]?.burgId || 0;
}, {immediate: true});

function buildStateMetrics(map) {
  const rows = stateRows(map).map(row => {
    const stateItem = map?.politics?.states?.[row.id];
    const capitalCity = findCapitalCity(map, stateItem?.capital);
    const population = (stateItem?.urban || 0) + (stateItem?.rural || 0);
    return {
      id: row.id,
      name: stateItem?.fullName || stateItem?.name || row.name,
      rawName: stateItem?.name || row.name,
      fullName: stateItem?.fullName || stateItem?.name || row.name,
      capitalName: capitalCity?.name || "none",
      capitalBurgId: stateItem?.capital || capitalCity?.burgId || null,
      culture: indexedName(map?.society?.cultures, stateItem?.culture),
      religion: indexedName(map?.society?.religions, stateItem?.religion),
      centerCell: stateItem?.center ?? stateItem?.gridCenter ?? "none",
      area: stateItem?.area || stateItem?.cells || 0,
      burgs: stateItem?.burgs || stateCities(map, row.id).length,
      population,
      neighborCount: stateItem?.neighbors?.length || 0,
      color: normalizeHexColor(stateItem?.color) || fallbackStateColor(row.id)
    };
  });
  return {rows, total: rows.length};
}

function filterRows(rows, filter) {
  const query = filter.trim().toLowerCase();
  if (!query) return rows;
  return rows.filter(row =>
    String(row.id).includes(query)
    || row.name.toLowerCase().includes(query)
    || row.rawName.toLowerCase().includes(query)
    || row.capitalName.toLowerCase().includes(query)
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

function stateRows(map) {
  return (map?.politics?.states || []).filter(stateItem => stateItem?.i || stateItem?.id).map(stateItem => ({
    id: stateItem.id ?? stateItem.i,
    name: stateItem.fullName || stateItem.name || `国家 #${stateItem.id ?? stateItem.i}`
  }));
}

function stateCities(map, stateId) {
  return (map?.settlements?.cities || [])
    .filter(city => city?.burgId && city.state === stateId)
    .sort((a, b) => Number(b.capital) - Number(a.capital) || b.population - a.population || a.id - b.id);
}

function findCapitalCity(map, burgId) {
  return (map?.settlements?.cities || []).find(city => city?.burgId === burgId) || null;
}

function indexedName(items, id) {
  const item = items?.[id];
  return item?.name || item?.fullName || (id === undefined || id === null ? "none" : String(id));
}

function formatStateName(map, stateId) {
  const stateItem = map?.politics?.states?.[stateId];
  if (!stateItem) return "none";
  return stateItem.fullName || stateItem.name || `#${stateId}`;
}

function normalizeHexColor(color) {
  if (typeof color !== "string") return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}

function fallbackStateColor(stateId) {
  const hue = ((Number(stateId) || 0) * 0.61803398875 + 0.12) % 1;
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
