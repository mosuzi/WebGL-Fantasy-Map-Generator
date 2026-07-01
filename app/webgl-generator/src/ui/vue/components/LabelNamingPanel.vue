<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="route-panel-summary" />

  <div class="route-panel-controls">
    <UiFilterInput :model-value="state.filter" placeholder="筛选标签 / id / 类型 / 归属" @update:model-value="callbacks.onFilter" />
  </div>

  <UiSortBar class-name="route-panel-sort" :options="sortOptions" :active-key="state.sortKey" :direction="state.sortDir" @sort="callbacks.onSort" />

  <UiObjectTable
    :columns="columns"
    :rows="visibleRows"
    :selected-id="state.selectedLabelKey"
    row-id-key="key"
    empty-text="没有匹配的标签"
    @select="callbacks.onSelect"
    @locate="callbacks.onLocate"
  />

  <UiDetailGrid class-name="route-panel-details" empty-text="未选中标签" :rows="detailRows" />

  <template v-if="selected">
    <UiTextEditField
      class-name="city-name-editor"
      :label="selected.targetKind === LABEL_TARGET_KIND.STATE ? '国家名称' : selected.targetKind === LABEL_TARGET_KIND.CUSTOM ? '标签文字' : '城市名称'"
      :model-value="selected.name"
      :max-length="48"
      @apply="name => callbacks.onRename(selected, name)"
    />
  </template>

  <div class="label-management-actions">
    <UiButton variant="secondary" @click="callbacks.onAdd">新增标签</UiButton>
    <UiButton v-if="selected && selected.hidden" variant="secondary" @click="callbacks.onRestore(selected)">恢复标签</UiButton>
    <UiButton v-else variant="secondary" :disabled="!selected" @click="callbacks.onDelete(selected)">删除标签</UiButton>
  </div>

  <UiHistoryActions class-name="city-history-actions" :history="state.history" label="最近命名" @undo="callbacks.onUndo" @redo="callbacks.onRedo" />
</template>

<script setup>
import {computed} from "vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiHistoryActions from "./base/UiHistoryActions.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiSortBar from "./base/UiSortBar.vue";
import UiTextEditField from "./base/UiTextEditField.vue";
import UiButton from "./base/UiButton.vue";
import {LABEL_TARGET_KIND} from "../../../runtime/object-kinds.js";
import {formatNumber as formatDisplayNumber} from "../../display-units.js";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";

defineOptions({
  name: "LabelNamingPanel"
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
  {key: "priority", label: "优先级"},
  {key: "type", label: "类型"},
  {key: "name", label: "名称"},
  {key: "id", label: "ID"}
]);

const columns = Object.freeze([
  {key: "id", label: "ID", align: "right"},
  {key: "type", label: "类型"},
  {key: "name", label: "名称"},
  {key: "owner", label: "归属"},
  {key: "status", label: "状态"},
  {key: "priority", label: "优先级", align: "right", format: value => formatNumber(value)}
]);

const rows = computed(() => {
  props.state.version;
  return labelRows(props.state.map);
});
const unitPreferences = useUnitPreferences();
const visibleRows = computed(() => sortRows(filterRows(rows.value, props.state.filter), props.state.sortKey, props.state.sortDir));
const selected = computed(() => rows.value.find(row => row.key === props.state.selectedLabelKey) || null);

const summaryMetrics = computed(() => [
  {label: "标签", value: formatNumber(rows.value.length)},
  {label: "城市", value: formatNumber(rows.value.filter(row => row.targetKind === LABEL_TARGET_KIND.CITY).length)},
  {label: "国家", value: formatNumber(rows.value.filter(row => row.targetKind === LABEL_TARGET_KIND.STATE).length)},
  {label: "手工", value: formatNumber(rows.value.filter(row => row.targetKind === LABEL_TARGET_KIND.CUSTOM).length)},
  {label: "筛选", value: formatNumber(visibleRows.value.length)}
]);

const detailRows = computed(() => selected.value ? [
  {label: "类型", value: selected.value.type},
  {label: "名称", value: selected.value.name},
  {label: "归属", value: selected.value.owner},
  {label: "显示策略", value: selected.value.visibility},
  {label: "状态", value: selected.value.status},
  {label: "中心", value: selected.value.center},
  {label: "目标 id", value: selected.value.targetId}
] : []);

function labelRows(map) {
  return [...customLabelRows(map), ...cityLabelRows(map), ...stateLabelRows(map)];
}

function customLabelRows(map) {
  return (map?.labels?.custom || [])
    .filter(label => label && Number.isInteger(label.id))
    .map(label => ({
      key: `${LABEL_TARGET_KIND.CUSTOM}:${label.id}`,
      id: label.id,
      targetId: label.id,
      targetKind: LABEL_TARGET_KIND.CUSTOM,
      type: "手工标签",
      name: label.text || `标签 #${label.id}`,
      owner: "手工",
      visibility: "随城市标签图层显示",
      status: "显示",
      hidden: false,
      center: formatPoint(label.x, label.y),
      priority: 90000 - label.id,
      rank: "custom"
    }));
}

function cityLabelRows(map) {
  return (map?.settlements?.cities || [])
    .filter(city => city && Number.isInteger(city.id))
    .map(city => {
      const state = map?.politics?.states?.[city.state];
      const population = Number(city.population) || 0;
      const priority = (city.capital ? 100000 : 0) + (city.port ? 10000 : 0) + population;
      return {
        key: `${LABEL_TARGET_KIND.CITY}:${city.id}`,
        id: city.id,
        targetId: city.id,
        targetKind: LABEL_TARGET_KIND.CITY,
        type: city.capital ? "首都标签" : city.port ? "港口标签" : "城市标签",
        name: city.name || `城市 #${city.id}`,
        owner: state?.name || "无国家",
        visibility: isHiddenLabel(map, LABEL_TARGET_KIND.CITY, city.id) ? "已隐藏，不在地图显示" : "随城市标签上限和缩放显示",
        status: isHiddenLabel(map, LABEL_TARGET_KIND.CITY, city.id) ? "隐藏" : "显示",
        hidden: isHiddenLabel(map, LABEL_TARGET_KIND.CITY, city.id),
        center: formatPoint(city.x, city.y),
        priority,
        rank: city.capital ? "capital" : city.port ? "port" : "city"
      };
    });
}

function stateLabelRows(map) {
  return (map?.politics?.states || [])
    .filter(state => state && (state.i || state.id) && !state.removed)
    .map(state => {
      const stateId = state.i ?? state.id;
      const capital = map?.pack?.burgs?.[state.capital];
      const point = stateLabelPoint(map, state);
      return {
        key: `${LABEL_TARGET_KIND.STATE}:${stateId}`,
        id: stateId,
        targetId: stateId,
        targetKind: LABEL_TARGET_KIND.STATE,
        type: "国家名称",
        name: state.name || `国家 #${stateId}`,
        owner: capital?.name ? `首都 ${capital.name}` : "无首都",
        visibility: isHiddenLabel(map, LABEL_TARGET_KIND.STATE, stateId) ? "已隐藏，不在地图显示" : "国家视图下显示",
        status: isHiddenLabel(map, LABEL_TARGET_KIND.STATE, stateId) ? "隐藏" : "显示",
        hidden: isHiddenLabel(map, LABEL_TARGET_KIND.STATE, stateId),
        center: point ? formatPoint(point[0], point[1]) : "none",
        priority: Number(state.area || 0) + Number(state.burgs || 0) * 100,
        rank: "state"
      };
    });
}

function isHiddenLabel(map, targetKind, targetId) {
  return Array.isArray(map?.labels?.hidden?.[targetKind]) && map.labels.hidden[targetKind].includes(Number(targetId));
}

function stateLabelPoint(map, state) {
  const center = Number.isInteger(state.center) ? state.center : null;
  if (center !== null && map?.pack?.cells?.p?.[center]) return map.pack.cells.p[center];
  const gridCenter = Number.isInteger(state.gridCenter) ? state.gridCenter : null;
  if (gridCenter !== null) return map?.grid?.points?.[map.grid.cells.p?.[gridCenter]] || null;
  return null;
}

function filterRows(sourceRows, filter) {
  const query = filter.trim().toLowerCase();
  if (!query) return sourceRows;
  return sourceRows.filter(row =>
    String(row.id).includes(query)
    || row.type.toLowerCase().includes(query)
    || row.name.toLowerCase().includes(query)
    || row.owner.toLowerCase().includes(query)
  );
}

function sortRows(sourceRows, key, direction) {
  const factor = direction === "asc" ? 1 : -1;
  return [...sourceRows].sort((a, b) => {
    if (a[key] === b[key]) return a.targetKind.localeCompare(b.targetKind, "zh-CN") || a.id - b.id;
    if (typeof a[key] === "string") return a[key].localeCompare(b[key], "zh-CN") * factor;
    return a[key] > b[key] ? factor : -factor;
  });
}

function formatPoint(x, y) {
  return `${formatNumber(x)}, ${formatNumber(y)}`;
}

function formatNumber(value) {
  return formatDisplayNumber(value, unitPreferences.value);
}
</script>
