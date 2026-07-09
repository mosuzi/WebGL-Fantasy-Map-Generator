<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="zone-panel-summary" />

  <section class="zone-pattern-legend" aria-labelledby="zone-pattern-legend-title">
    <h3 id="zone-pattern-legend-title">纹理含义</h3>
    <div class="zone-pattern-legend-grid">
      <div v-for="item in legendItems" :key="item.type" class="zone-pattern-legend-item">
        <span class="zone-pattern-swatch" :class="`pattern-${item.pattern}`" :style="{color: item.color}" aria-hidden="true"></span>
        <span class="zone-pattern-label">{{ item.label }}</span>
        <span class="zone-pattern-note">{{ item.patternLabel }}</span>
      </div>
    </div>
  </section>

  <div class="zone-panel-controls">
    <UiFilterInput :model-value="state.filter" placeholder="筛选名称 / 类型 / 国家 / 纹理" @update:model-value="callbacks.onFilter" />
  </div>
  <UiObjectTable
    :columns="columns"
    :rows="visibleRows"
    :sort-key="state.sortKey"
    :sort-direction="state.sortDir"
    :sort-options="sortOptions"
    sortable
    @sort="callbacks.onSort"
    :selected-id="selectedId"
    empty-text="没有匹配的地区"
    @select="callbacks.onSelect"
    @locate="callbacks.onLocate"
  />

  <UiDetailGrid class-name="zone-panel-details" empty-text="未选中地区" :rows="detailRows" />

  <UiActionDock v-if="selected" v-model:active="activeAction" :actions="zoneActions">
    <template #style>
      <div class="zone-style-editor">
        <UiColorActionPanel
          class-name="zone-color-field"
          :model-value="selected.color"
          @apply="color => callbacks.onStyleChange?.(selected.id, {hexColor: color})"
        />
        <div class="zone-pattern-editor">
          <UiSelectField
            class-name="zone-pattern-select"
            label="纹理"
            :model-value="styleDraft.pattern"
            :options="patternOptions"
            @update:model-value="styleDraft.pattern = $event"
          />
          <UiButton variant="secondary" @click="applyPattern">应用纹理</UiButton>
        </div>
      </div>
    </template>
  </UiActionDock>

  <UiHistoryActions class-name="zone-history-actions" :history="state.history" @undo="callbacks.onUndo" @redo="callbacks.onRedo" />
</template>

<script setup>
import {computed, reactive, ref, watch} from "vue";
import UiActionDock from "./base/UiActionDock.vue";
import UiButton from "./base/UiButton.vue";
import UiColorActionPanel from "./base/UiColorActionPanel.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiHistoryActions from "./base/UiHistoryActions.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiSelectField from "./base/UiSelectField.vue";
import {formatArea, formatNumber as formatDisplayNumber} from "../../display-units.js";
import {findByObjectId} from "../../object-id.js";
import {compareRowsByKey} from "../../sort-utils.js";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";

defineOptions({
  name: "ZonePanel"
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

const TYPE_META = Object.freeze({
  Warzone: Object.freeze({label: "战区", pattern: "cross", color: "#d65a42", note: "交战边界附近的军事态势区"}),
  Invasion: Object.freeze({label: "入侵区", pattern: "diagonal", color: "#d98238", note: "跨境进攻或受威胁地区"}),
  Rebels: Object.freeze({label: "叛乱区", pattern: "cross", color: "#c79735", note: "国内叛乱或边境不稳地区"}),
  Proselytism: Object.freeze({label: "传教区", pattern: "dots", color: "#9b76d6", note: "宗教扩张或改宗压力区"}),
  Crusade: Object.freeze({label: "圣战区", pattern: "cross", color: "#b48be2", note: "宗教冲突或圣战地区"}),
  Disease: Object.freeze({label: "疫病区", pattern: "dots", color: "#668f5a", note: "瘟疫或卫生危机地区"}),
  Disaster: Object.freeze({label: "灾害区", pattern: "diagonal", color: "#b26852", note: "一般灾害影响地区"}),
  Eruption: Object.freeze({label: "喷发区", pattern: "cross", color: "#c85b38", note: "火山喷发影响地区"}),
  Avalanche: Object.freeze({label: "雪崩区", pattern: "diagonal", color: "#c4ced2", note: "高山雪崩风险地区"}),
  Fault: Object.freeze({label: "断层区", pattern: "diagonal", color: "#8d7d70", note: "地质断层或地震风险区"}),
  Flood: Object.freeze({label: "洪水区", pattern: "dots", color: "#4e9ac9", note: "沿河洪水影响地区"}),
  Tsunami: Object.freeze({label: "海啸区", pattern: "cross", color: "#4a9dbe", note: "海岸海啸影响地区"})
});

const PATTERN_LABELS = Object.freeze({
  diagonal: "斜线",
  cross: "交叉线",
  dots: "圆点阵列"
});

const patternOptions = Object.freeze([
  {value: "diagonal", label: "斜线"},
  {value: "cross", label: "交叉线"},
  {value: "dots", label: "圆点阵列"}
]);

const zoneActions = Object.freeze([
  {key: "style", label: "调整样式", icon: "▧", panelWidth: 360, panelHeight: 420}
]);

const sortOptions = Object.freeze([
  {key: "id", label: "ID"},
  {key: "type", label: "类型"},
  {key: "cells", label: "规模"},
  {key: "area", label: "面积"},
  {key: "states", label: "国家"}
]);

const columns = Object.freeze([
  {key: "id", label: "ID", width: 54, align: "right"},
  {key: "name", label: "名称", width: 150},
  {key: "type", label: "类型", width: 80},
  {key: "patternLabel", label: "纹理", width: 82},
  {key: "cells", label: "规模", width: 64, align: "right", format: value => formatNumber(value)},
  {key: "statesLabel", label: "涉及国家", width: 130}
]);

const unitPreferences = useUnitPreferences();
const activeAction = ref(null);
const styleDraft = reactive({
  pattern: "diagonal"
});
const rows = computed(() => {
  props.state.version;
  return zoneRows(props.state.map);
});
const selectedId = computed(() => props.state.selection?.object?.kind === "zone" ? props.state.selection.object.id : null);
const selected = computed(() => findByObjectId(rows.value, selectedId.value));
const visibleRows = computed(() => sortRows(filterRows(rows.value, props.state.filter), props.state.sortKey, props.state.sortDir));
const visibleCount = computed(() => rows.value.filter(row => !row.hidden).length);
const totalCells = computed(() => rows.value.reduce((sum, row) => sum + row.cells, 0));
const totalArea = computed(() => rows.value.reduce((sum, row) => sum + row.area, 0));
const legendItems = computed(() => {
  const present = new Set(rows.value.map(row => row.rawType));
  const source = rows.value.length ? Object.entries(TYPE_META).filter(([type]) => present.has(type)) : Object.entries(TYPE_META);
  return source.map(([type, meta]) => ({
    type,
    label: meta.label,
    pattern: meta.pattern,
    patternLabel: PATTERN_LABELS[meta.pattern] || meta.pattern,
    color: meta.color
  }));
});

const summaryMetrics = computed(() => [
  {label: "地区", value: formatNumber(rows.value.length)},
  {label: "可见", value: formatNumber(visibleCount.value)},
  {label: "涉及 cells", value: formatNumber(totalCells.value)},
  {label: "总面积", value: formatAreaValue(totalArea.value)}
]);

const detailRows = computed(() => selected.value ? [
  {label: "选中", value: `#${selected.value.id} / ${selected.value.type}`},
  {label: "含义", value: selected.value.note},
  {label: "纹理", value: `${selected.value.patternLabel} / ${selected.value.color}`},
  {label: "涉及国家", value: selected.value.statesLabel},
  {label: "规模", value: `${formatNumber(selected.value.cells)} cells`},
  {label: "面积", value: formatAreaValue(selected.value.area)},
  {label: "状态", value: selected.value.hidden ? "隐藏" : "显示"}
] : []);

watch(() => selected.value?.id, () => {
  activeAction.value = null;
  syncStyleDraft();
}, {immediate: true});

watch(() => selected.value?.pattern, syncStyleDraft);

function syncStyleDraft() {
  styleDraft.pattern = selected.value?.pattern || "diagonal";
}

function applyPattern() {
  if (!selected.value) return;
  props.callbacks.onStyleChange?.(selected.value.id, {pattern: styleDraft.pattern});
}

function zoneRows(map) {
  const zones = map?.zones?.zones || map?.pack?.zones || [];
  return zones
    .filter(Boolean)
    .map(zone => {
      const id = Number(zone.i ?? zone.id);
      const rawType = zone.type || "Disaster";
      const meta = TYPE_META[rawType] || TYPE_META.Disaster;
      const pattern = normalizePattern(zone.pattern || meta.pattern);
      const cells = (zone.cells || []).filter(Number.isInteger);
      const stateNames = zoneStateNames(map, cells);
      const area = cells.reduce((sum, cell) => sum + Number(map?.pack?.cells?.area?.[cell] || 0), 0);
      return {
        id,
        name: zone.name || `${meta.label} #${id}`,
        rawType,
        type: meta.label || rawType,
        note: meta.note || "自定义地区",
        pattern,
        patternLabel: PATTERN_LABELS[pattern] || pattern,
        color: normalizeHexColor(zone.hexColor || zone.fill || zone.color) || meta.color,
        cells: cells.length,
        area,
        states: stateNames,
        statesLabel: stateNames.length ? stateNames.slice(0, 3).join(" / ") + (stateNames.length > 3 ? ` 等 ${stateNames.length}` : "") : "中立 / 无归属",
        hidden: Boolean(zone.hidden)
      };
    });
}

function zoneStateNames(map, cells) {
  const names = new Map();
  for (const cell of cells) {
    const stateId = Number(map?.pack?.cells?.state?.[cell] || 0);
    if (!stateId || names.has(stateId)) continue;
    const state = map?.politics?.states?.[stateId] || map?.pack?.states?.[stateId];
    names.set(stateId, state?.fullName || state?.name || `国家 #${stateId}`);
  }
  return [...names.values()];
}

function filterRows(sourceRows, filter) {
  const query = String(filter || "").trim().toLowerCase();
  if (!query) return sourceRows;
  return sourceRows.filter(row => [
    row.id,
    row.name,
    row.type,
    row.rawType,
    row.patternLabel,
    row.color,
    row.statesLabel,
    row.note
  ].some(value => String(value || "").toLowerCase().includes(query)));
}

function sortRows(sourceRows, key, direction) {
  return [...sourceRows].sort((a, b) => compareRowsByKey(a, b, key, direction));
}

function normalizePattern(value) {
  return PATTERN_LABELS[value] ? value : "diagonal";
}

function normalizeHexColor(color) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(color || "").trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}

function formatAreaValue(value) {
  return formatArea(value, unitPreferences.value);
}

function formatNumber(value) {
  return formatDisplayNumber(value, unitPreferences.value);
}
</script>
