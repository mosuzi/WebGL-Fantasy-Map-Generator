<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="marker-panel-summary" />

  <div class="marker-panel-controls">
    <UiSegmented label="标记范围" :options="scopeOptions" :model-value="state.scope" @select="callbacks.onScope" />
    <UiFilterInput :model-value="state.filter" placeholder="筛选名称 / id / 类型 / 国家 / 省份" @update:model-value="callbacks.onFilter" />
  </div>

  <UiSortBar class-name="marker-panel-sort" :options="sortOptions" :active-key="state.sortKey" :direction="state.sortDir" @sort="callbacks.onSort" />

  <UiObjectTable
    :columns="columns"
    :rows="visibleRows"
    :selected-id="state.selectedMarkerId"
    empty-text="没有匹配的资源点或标记"
    @select="callbacks.onSelect"
    @locate="callbacks.onLocate"
  />

  <UiDetailGrid class-name="marker-panel-details" empty-text="未选中资源点或标记" :rows="detailRows" />

  <template v-if="selected">
    <UiTextEditField
      class-name="marker-name-editor"
      :model-value="selected.rawName"
      :max-length="48"
      @apply="name => callbacks.onRename(selected.id, name)"
    />

    <div class="marker-visual-editor">
      <label>
        <span>图形</span>
        <select v-model="visualDraft.symbol">
          <option v-for="option in symbolOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </label>
      <label>
        <span>配色</span>
        <select v-model="visualDraft.palette">
          <option v-for="option in paletteOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </label>
      <UiButton variant="secondary" @click="applyVisual">应用图标</UiButton>
    </div>
  </template>

  <UiHistoryActions class-name="marker-history-actions" :history="state.history" @undo="callbacks.onUndo" @redo="callbacks.onRedo" />
</template>

<script setup>
import {computed, reactive, watch} from "vue";
import UiButton from "./base/UiButton.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiHistoryActions from "./base/UiHistoryActions.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiSegmented from "./base/UiSegmented.vue";
import UiSortBar from "./base/UiSortBar.vue";
import UiTextEditField from "./base/UiTextEditField.vue";

defineOptions({
  name: "MarkerPanel"
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

const scopeOptions = Object.freeze([
  {value: "all", label: "全部"},
  {value: "resource", label: "资源点"},
  {value: "marker", label: "标记"}
]);

const sortOptions = Object.freeze([
  {key: "economicValue", label: "潜力"},
  {key: "categoryLabel", label: "类别"},
  {key: "stateName", label: "国家"},
  {key: "id", label: "ID"}
]);

const columns = Object.freeze([
  {key: "id", label: "ID", align: "right"},
  {key: "name", label: "名称"},
  {key: "categoryLabel", label: "类别"},
  {key: "resourceLabel", label: "资源"},
  {key: "stateName", label: "国家"},
  {key: "economicValue", label: "潜力", align: "right", format: value => formatNumber(value)}
]);

const symbolOptions = Object.freeze([
  {value: "marker", label: "通用"},
  {value: "mine", label: "矿山"},
  {value: "salt", label: "盐晶"},
  {value: "life", label: "生物"},
  {value: "gem", label: "宝石"},
  {value: "spring", label: "温泉"},
  {value: "drop", label: "水源"},
  {value: "volcano", label: "火山"},
  {value: "bridge", label: "桥梁"},
  {value: "inn", label: "驿馆"},
  {value: "tower", label: "塔楼"},
  {value: "ruin", label: "遗迹"},
  {value: "book", label: "书卷"},
  {value: "market", label: "商贸"},
  {value: "danger", label: "危险"},
  {value: "star", label: "奇观"}
]);

const paletteOptions = Object.freeze([
  {value: "natural", label: "自然"},
  {value: "water", label: "水文"},
  {value: "resource", label: "资源"},
  {value: "infrastructure", label: "设施"},
  {value: "trade", label: "商旅"},
  {value: "hazard", label: "危险"},
  {value: "culture", label: "文化"},
  {value: "settlement", label: "活动"},
  {value: "mystery", label: "异象"}
]);

const visualDraft = reactive({
  symbol: "marker",
  palette: "mystery"
});

const metrics = computed(() => buildMarkerMetrics(props.state.map));
const scopedRows = computed(() => applyScope(metrics.value.rows, props.state.scope));
const visibleRows = computed(() => sortRows(filterRows(scopedRows.value, props.state.filter), props.state.sortKey, props.state.sortDir));
const selected = computed(() => metrics.value.rows.find(row => row.id === props.state.selectedMarkerId) || null);

const summaryMetrics = computed(() => [
  {label: "标记", value: metrics.value.total},
  {label: "资源点", value: metrics.value.resources},
  {label: "资源潜力", value: formatNumber(metrics.value.resourcePotential)},
  {label: "筛选", value: visibleRows.value.length}
]);

const detailRows = computed(() => selected.value ? [
  {label: "类型", value: selected.value.typeLabel},
  {label: "类别", value: selected.value.categoryLabel},
  {label: "资源", value: selected.value.resourceLabel},
  {label: "经济潜力", value: formatNumber(selected.value.economicValue)},
  {label: "所属国家", value: selected.value.stateName},
  {label: "所属省份", value: selected.value.provinceName},
  {label: "grid cell", value: selected.value.cell},
  {label: "pack cell", value: selected.value.packCell},
  {label: "图形", value: selected.value.visualLabel},
  {label: "手动图标", value: selected.value.manual ? "是" : "否"}
] : []);

watch(() => selected.value?.id, syncVisualDraft, {immediate: true});
watch(() => selected.value?.symbol, syncVisualDraft);
watch(() => selected.value?.palette, syncVisualDraft);

function buildMarkerMetrics(map) {
  const rows = markerRows(map).map(marker => {
    const stateId = marker.data?.state ?? 0;
    const provinceId = marker.data?.province ?? 0;
    const visual = marker.visual || marker.data?.visual || {};
    return {
      id: marker.id,
      name: marker.name || marker.label || `标记 #${marker.id}`,
      rawName: marker.name || marker.label || `标记 #${marker.id}`,
      type: marker.type,
      typeLabel: marker.label || marker.type || "标记",
      category: marker.category || "mystery",
      categoryLabel: marker.categoryLabel || marker.category || "未知",
      resourceKey: marker.resourceKey || null,
      resourceLabel: marker.resourceLabel || (marker.category === "resource" ? marker.label || "资源" : "none"),
      economicValue: Number(marker.economicValue || 0),
      stateId,
      stateName: indexedName(map?.politics?.states, stateId),
      provinceId,
      provinceName: indexedName(map?.politics?.provinces || map?.pack?.provinces, provinceId),
      cell: marker.cell ?? "none",
      packCell: marker.packCell ?? "none",
      symbol: visual.symbol || "marker",
      palette: visual.palette || marker.category || "mystery",
      manual: Boolean(visual.manual),
      visualLabel: `${symbolLabel(visual.symbol || "marker")} / ${paletteLabel(visual.palette || marker.category || "mystery")}`
    };
  });

  return {
    rows,
    total: rows.length,
    resources: rows.filter(row => row.category === "resource").length,
    resourcePotential: rows.filter(row => row.category === "resource").reduce((sum, row) => sum + row.economicValue, 0)
  };
}

function markerRows(map) {
  return (map?.markers?.markers || []).filter(marker => marker && Number.isInteger(marker.id));
}

function applyScope(rows, scope) {
  if (scope === "resource") return rows.filter(row => row.category === "resource");
  if (scope === "marker") return rows.filter(row => row.category !== "resource");
  return rows;
}

function filterRows(rows, filter) {
  const query = filter.trim().toLowerCase();
  if (!query) return rows;
  return rows.filter(row =>
    String(row.id).includes(query)
    || row.name.toLowerCase().includes(query)
    || row.typeLabel.toLowerCase().includes(query)
    || row.categoryLabel.toLowerCase().includes(query)
    || row.resourceLabel.toLowerCase().includes(query)
    || row.stateName.toLowerCase().includes(query)
    || row.provinceName.toLowerCase().includes(query)
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

function applyVisual() {
  if (!selected.value) return;
  props.callbacks.onVisualChange?.(selected.value.id, {
    symbol: visualDraft.symbol,
    palette: visualDraft.palette
  });
}

function syncVisualDraft() {
  visualDraft.symbol = selected.value?.symbol || "marker";
  visualDraft.palette = selected.value?.palette || selected.value?.category || "mystery";
}

function indexedName(items, id) {
  const item = items?.[id];
  return item?.fullName || item?.name || (id === undefined || id === null || id === 0 ? "none" : `#${id}`);
}

function symbolLabel(value) {
  return symbolOptions.find(option => option.value === value)?.label || value || "通用";
}

function paletteLabel(value) {
  return paletteOptions.find(option => option.value === value)?.label || value || "异象";
}

function formatNumber(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : "0";
}
</script>
