<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="ocean-current-panel-summary" />

  <div class="ocean-current-panel-controls">
    <UiFilterInput :model-value="state.filter" placeholder="筛选洋流名称 / 冷暖类型" @update:model-value="callbacks.onFilter" />
    <UiButton variant="secondary" @click="callbacks.onRegenerate?.()">重新计算洋流</UiButton>
  </div>

  <UiObjectTable
    :columns="columns"
    :rows="visibleRows"
    :selected-id="state.selectedId"
    empty-text="当前地图没有洋流"
    selectable-rows
    :selected-row-ids="selectedRowIds"
    @select="callbacks.onSelect"
    @locate="callbacks.onLocate"
    @selection-change="selectedRowIds = $event"
  />

  <div class="ocean-current-panel-actions">
    <UiButton variant="secondary" :disabled="!selectedRows.length" @click="callbacks.onHighlight?.(selectedRows.map(row => row.id))">高亮选中</UiButton>
    <UiButton variant="secondary" :disabled="!state.highlightedIds.length" @click="callbacks.onClearHighlights?.()">清除高亮</UiButton>
  </div>

  <UiDetailGrid class-name="ocean-current-panel-details" empty-text="未选中洋流" :rows="detailRows" />

  <UiTextEditField
    v-if="selected"
    class-name="ocean-current-name-editor"
    :model-value="selected.name"
    :max-length="80"
    @apply="name => callbacks.onRename?.(selected.id, name)"
  />
</template>

<script setup>
import {computed, ref} from "vue";
import UiButton from "./base/UiButton.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiTextEditField from "./base/UiTextEditField.vue";

defineOptions({name: "OceanCurrentPanel"});

const props = defineProps({
  state: {type: Object, required: true},
  callbacks: {type: Object, default: () => ({})}
});

const selectedRowIds = ref([]);
const columns = Object.freeze([
  {key: "name", label: "名称"},
  {key: "temperatureLabel", label: "性质"},
  {key: "hemisphereLabel", label: "位置"},
  {key: "strengthLabel", label: "强度", align: "right"}
]);
const rows = computed(() => {
  props.state.version;
  return (props.state.map?.oceanCurrents?.currents || []).map(current => ({
    ...current,
    temperatureLabel: current.temperature === "warm" ? "暖流" : current.temperature === "cold" ? "寒流" : "中性漂流",
    hemisphereLabel: current.hemisphere === "north" ? "北半球" : current.hemisphere === "south" ? "南半球" : "赤道附近",
    circulationLabel: current.circulation === "counterclockwise" ? "逆时针" : "顺时针",
    strengthLabel: `${Math.round(Number(current.strength || 0) * 100)}%`
  }));
});
const visibleRows = computed(() => {
  const query = String(props.state.filter || "").trim().toLowerCase();
  if (!query) return rows.value;
  return rows.value.filter(row => `${row.name} ${row.temperatureLabel} ${row.hemisphereLabel}`.toLowerCase().includes(query));
});
const selected = computed(() => rows.value.find(row => String(row.id) === String(props.state.selectedId)) || null);
const selectedRows = computed(() => rows.value.filter(row => selectedRowIds.value.map(String).includes(String(row.id))));
const warmCount = computed(() => rows.value.filter(row => row.temperature === "warm").length);
const coldCount = computed(() => rows.value.filter(row => row.temperature === "cold").length);
const algorithmLabel = computed(() => {
  const algorithm = props.state.map?.oceanCurrents?.algorithm;
  if (!algorithm) return "未生成";
  return algorithm === "surface-gyres-v1" ? "简化表层环流" : algorithm;
});
const summaryMetrics = computed(() => [
  {label: "主要洋流", value: rows.value.length},
  {label: "暖流", value: warmCount.value},
  {label: "寒流", value: coldCount.value},
  {label: "模型", value: algorithmLabel.value}
]);
const detailRows = computed(() => selected.value ? [
  {label: "海盆", value: `#${selected.value.basinFeatureId}`},
  {label: "性质", value: selected.value.temperatureLabel},
  {label: "半球", value: selected.value.hemisphereLabel},
  {label: "环流", value: selected.value.circulationLabel},
  {label: "强度", value: selected.value.strengthLabel},
  {label: "西边界增强", value: selected.value.westernBoundary ? "是" : "否"}
] : []);
</script>
