<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="river-panel-summary" />

  <div class="river-panel-controls">
    <UiFilterInput :model-value="state.filter" placeholder="筛选名称 / id / 类型" @update:model-value="callbacks.onFilter" />
  </div>

  <UiSortBar class-name="river-panel-sort" :options="sortOptions" :active-key="state.sortKey" :direction="state.sortDir" @sort="callbacks.onSort" />

  <UiObjectTable
    :columns="columns"
    :rows="visibleRows"
    :selected-id="selectedId"
    empty-text="没有匹配的河流"
    @select="callbacks.onSelect"
    @locate="callbacks.onLocate"
  />

  <UiDetailGrid class-name="river-panel-details" empty-text="未选中河流" :rows="detailRows" />

  <template v-if="selected">
    <UiTextEditField
      class-name="river-name-editor"
      :model-value="selected.name"
      :max-length="48"
      @apply="name => callbacks.onRename(selected.id, name)"
    />

    <div class="river-width-editor">
      <UiSliderField
        label="宽度因子"
        field-class="river-width-field"
        :model-value="widthDraft"
        :min="0.2"
        :max="3"
        :step="0.05"
        @input="value => widthDraft = normalizeWidth(value)"
      />
      <div class="river-width-actions">
        <UiButton variant="secondary" @click="callbacks.onSetWidthFactor(selected.id, widthDraft)">应用宽度</UiButton>
        <UiButton variant="secondary" @click="callbacks.onEdit(selected)">{{ editing ? "退出河流编辑" : "进入河流编辑" }}</UiButton>
      </div>
    </div>

    <UiHistoryActions class-name="river-history-note" :history="state.history" label="最近命令" @undo="callbacks.onUndo" @redo="callbacks.onRedo" />
  </template>
</template>

<script setup>
import {computed, ref, watch} from "vue";
import UiButton from "./base/UiButton.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiHistoryActions from "./base/UiHistoryActions.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiSliderField from "./base/UiSliderField.vue";
import UiSortBar from "./base/UiSortBar.vue";
import UiTextEditField from "./base/UiTextEditField.vue";
import {formatDistance} from "../../display-units.js";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";

defineOptions({
  name: "RiverPanel"
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
  {key: "flux", label: "流量"},
  {key: "length", label: "长度"},
  {key: "id", label: "ID"}
]);

const columns = Object.freeze([
  {key: "id", label: "ID", align: "right"},
  {key: "name", label: "名称"},
  {key: "type", label: "类型"},
  {key: "length", label: "长度", align: "right", format: value => formatLength(value)},
  {key: "flux", label: "流量", align: "right", format: value => formatNumber(value)}
]);

const unitPreferences = useUnitPreferences();
const widthDraft = ref(1);
const rows = computed(() => riverRows(props.state.map));
const selectedId = computed(() => props.state.selection?.object?.kind === "river" ? props.state.selection.object.id : null);
const selected = computed(() => rows.value.find(row => row.id === selectedId.value) || null);
const editing = computed(() => props.state.editingObject?.kind === "river" && props.state.editingObject.id === selectedId.value);
const visibleRows = computed(() => sortRows(filterRows(rows.value, props.state.filter), props.state.sortKey, props.state.sortDir));
const totalLength = computed(() => rows.value.reduce((sum, row) => sum + row.length, 0));
const maxFlux = computed(() => rows.value.reduce((max, row) => Math.max(max, row.flux), 0));

const summaryMetrics = computed(() => [
  {label: "河流", value: rows.value.length},
  {label: "总长度", value: formatLength(totalLength.value)},
  {label: "最大流量", value: formatNumber(maxFlux.value)},
  {label: "筛选", value: visibleRows.value.length}
]);

const detailRows = computed(() => selected.value ? [
  {label: "选中", value: `#${selected.value.id} / ${selected.value.type}`},
  {label: "长度", value: formatLength(selected.value.length)},
  {label: "流量", value: formatNumber(selected.value.flux)},
  {label: "河段", value: selected.value.segments},
  {label: "宽度因子", value: selected.value.widthFactor.toFixed(2)}
] : []);

watch(() => selected.value?.id, () => {
  widthDraft.value = normalizeWidth(selected.value?.widthFactor ?? 1);
}, {immediate: true});

watch(() => selected.value?.widthFactor, next => {
  widthDraft.value = normalizeWidth(next ?? 1);
});

function riverRows(map) {
  return (map?.rivers?.rivers || []).map(river => {
    const length = riverLength(river);
    const flux = river.flux || river.discharge || river.width || 0;
    return {
      id: river.id,
      name: river.name || `#${river.id}`,
      type: river.parent ? "支流" : "主河",
      length,
      flux,
      widthFactor: Number.isFinite(river.widthFactor) ? river.widthFactor : 1,
      segments: Math.max(0, (river.points?.length || 0) - 1)
    };
  });
}

function filterRows(sourceRows, filter) {
  const query = filter.trim().toLowerCase();
  if (!query) return sourceRows;
  return sourceRows.filter(row => String(row.id).includes(query) || row.name.toLowerCase().includes(query) || row.type.toLowerCase().includes(query));
}

function sortRows(sourceRows, key, direction) {
  const factor = direction === "asc" ? 1 : -1;
  return [...sourceRows].sort((a, b) => {
    if (a[key] === b[key]) return a.id - b.id;
    return a[key] > b[key] ? factor : -factor;
  });
}

function riverLength(river) {
  const points = river.points || [];
  let length = 0;
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index];
    const b = points[index + 1];
    if (!isPoint(a) || !isPoint(b)) continue;
    length += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return length;
}

function formatLength(value) {
  return formatDistance(value, unitPreferences.value);
}

function formatNumber(value) {
  return Number.isFinite(value) ? Math.round(value).toLocaleString("zh-CN") : "0";
}

function normalizeWidth(value) {
  return Math.round((Number(value) || 1) * 100) / 100;
}

function isPoint(point) {
  return Number.isFinite(point?.[0]) && Number.isFinite(point?.[1]);
}
</script>
