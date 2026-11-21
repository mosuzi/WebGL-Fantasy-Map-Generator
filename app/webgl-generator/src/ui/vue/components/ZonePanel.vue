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
  <div class="zone-panel-controls list-filter-toolbar">
    <UiSelectField label="新增地区类型" :model-value="zoneDraft.type" :options="ZONE_CREATION_TYPE_OPTIONS" @update:model-value="zoneDraft.type = $event" />
    <UiButton variant="secondary" :active="state.createMode" @click="toggleCreateMode">{{ state.createMode ? "取消放置" : "放置地区" }}</UiButton>
  </div>
  <div class="zone-panel-regeneration list-toolbar-actions">
    <UiButton variant="danger" :disabled="state.regenerating" @click="callbacks.onRegenerate">重新生成地区</UiButton>
    <span aria-live="polite">{{ state.regenerationStatus }}</span>
  </div>
  <UiRegenerationLockActions v-bind="regenerationLocks.actionProps" v-on="regenerationLocks.actionListeners" />
  <UiObjectTable
    v-bind="regenerationLocks.tableProps"
    v-on="regenerationLocks.tableListeners"
    :columns="columns"
    :column-widths="state.columnWidths"
    :rows="visibleRows"
    :hover-row="state.open ? callbacks.onHover : null"
    :sort-key="state.sortKey"
    :sort-direction="state.sortDir"
    :sort-options="sortOptions"
    sortable
    @sort="callbacks.onSort"
    :selected-id="selectedId"
    empty-text="没有匹配的地区"
    :empty-action="filterEmptyAction"
    resizable-columns
    selectable-rows
    :selected-row-ids="selectedZoneIds"
    @select="callbacks.onSelect"
    @locate="callbacks.onLocate"
    @empty-action="handleEmptyAction"
    @column-resize="callbacks.onColumnResize"
    @selection-change="selectedZoneIds = $event"
  />

  <UiPanelIoActions
    class-name="zone-panel-list-actions"
    label="地区列表操作"
    :actions="zoneListActions"
    @action="handleListAction"
  />

  <UiDetailGrid :key="selected?.id" class-name="zone-panel-details" empty-text="未选中地区" :rows="detailRows" />

</template>

<script setup>
import {Delete, Plus, RefreshLeft} from "@element-plus/icons-vue";
import {computed, reactive} from "vue";
import {ZONE_CREATION_TYPE_OPTIONS} from "../../../runtime/zone-edit-commands.js";
import {resolveZoneContext, zoneRoleLabel} from "../../../runtime/zone-context.js";
import {normalizeZoneTypeRecord, zoneCategoryLabel} from "../../../runtime/zone-types.js";
import UiButton from "./base/UiButton.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiPanelIoActions from "./base/UiPanelIoActions.vue";
import UiRegenerationLockActions from "./base/UiRegenerationLockActions.vue";
import UiSelectField from "./base/UiSelectField.vue";
import {formatListCount, formatArea, formatNumber as formatDisplayNumber} from "../../display-units.js";
import {findByObjectId} from "../../object-id.js";
import {compareRowsByKey} from "../../sort-utils.js";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";
import {useVisibleRowSelection} from "../composables/use-visible-row-selection.js";
import {useRegenerationLockSelection} from "../composables/use-regeneration-lock-selection.js";

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
  Tsunami: Object.freeze({label: "海啸区", pattern: "cross", color: "#4a9dbe", note: "海岸海啸影响地区"}),
  Wilderness: Object.freeze({label: "无人区", pattern: "diagonal", color: "#8a806f", note: "人烟稀少的自然地区"}),
  Desert: Object.freeze({label: "沙漠", pattern: "dots", color: "#d3ae63", note: "干旱沙漠地区"}),
  Swamp: Object.freeze({label: "沼泽", pattern: "dots", color: "#647c59", note: "湿地沼泽地区"}),
  DeepForest: Object.freeze({label: "密林", pattern: "cross", color: "#426b45", note: "茂密森林地区"}),
  Grassland: Object.freeze({label: "草原", pattern: "diagonal", color: "#91a85d", note: "开阔草原地区"}),
  Tundra: Object.freeze({label: "苔原 / 冰原", pattern: "dots", color: "#aab9b5", note: "寒冷苔原或冰原"}),
  Highland: Object.freeze({label: "高地 / 山地", pattern: "cross", color: "#847866", note: "高地与山地"}),
  Badlands: Object.freeze({label: "荒地", pattern: "diagonal", color: "#a47755", note: "贫瘠荒地"}),
  VolcanicLand: Object.freeze({label: "火山地带", pattern: "cross", color: "#8f4a3d", note: "火山地貌地区"}),
  Custom: Object.freeze({label: "自定义地区", pattern: "diagonal", color: "#777777", note: "完全自定义地区"})
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


const sortOptions = Object.freeze([
  {key: "id", label: "ID"},
  {key: "type", label: "类型"},
  {key: "cells", label: "规模"},
  {key: "area", label: "面积"},
  {key: "states", label: "国家"}
]);

const columns = Object.freeze([
  {key: "name", label: "名称", width: 150},
  {key: "id", label: "编号", width: 54, align: "right"},
  {key: "type", label: "类型", width: 80},
  {key: "patternLabel", label: "纹理", width: 82},
  {key: "cells", label: "规模", width: 64, align: "right", format: value => formatNumber(value)},
  {key: "statesLabel", label: "涉及国家", width: 130}
]);

const unitPreferences = useUnitPreferences();
const coverageOptions = Object.freeze([{value: "base", label: "底区"}, {value: "overlay", label: "覆盖区"}]);
const zoneDraft = reactive({type: props.state.createType || "Disaster"});
const rows = computed(() => {
  props.state.version;
  return zoneRows(props.state.map);
});
const selectedId = computed(() => props.state.selection?.object?.kind === "zone" ? props.state.selection.object.id : null);
const selected = computed(() => findByObjectId(rows.value, selectedId.value));
const visibleRows = computed(() => sortRows(filterRows(rows.value, props.state.filter), props.state.sortKey, props.state.sortDir));
const regenerationLocks = useRegenerationLockSelection({panelId: "zone-panel", kind: "zone", rows: visibleRows});
const {selectedRowIds: selectedZoneIds} = useVisibleRowSelection(visibleRows);
const filterEmptyAction = computed(() => String(props.state.filter || "").trim()
  ? {key: "clear-filter", label: "清空筛选", icon: RefreshLeft}
  : null);
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
const zoneListActions = computed(() => [
  {key: "create", label: props.state.createMode ? "取消放置地区" : "放置地区", icon: Plus},
  {key: "delete", label: "删除选中地区", icon: Delete, disabled: !selected.value || props.state.createMode}
]);

const summaryMetrics = computed(() => [
  {label: "地区", value: formatListCount(visibleRows.value.length, rows.value.length)},
  {label: "可见", value: formatNumber(visibleCount.value)},
  {label: "涉及区域", value: formatNumber(totalCells.value)},
  {label: "总面积", value: formatAreaValue(totalArea.value)},
]);

const detailRows = computed(() => selected.value ? [
  {label: "名称", value: selected.value.name, editor: {value: selected.value.name, maxLength: 64, apply: name => setProperty("name", name)}},
  {label: "类型", value: selected.value.customTypeName || selected.value.type, editor: selected.value.category === "custom" ? {value: selected.value.customTypeName, maxLength: 48, apply: type => setProperty("customTypeName", type)} : null},
  {label: "说明", value: selected.value.description || "无", editor: {type: "note", value: selected.value.description, maxLength: 240, apply: value => setProperty("description", value)}},
  {label: "含义", value: selected.value.note},
  {label: "类别", value: zoneCategoryLabel(selected.value.category)},
  {label: "覆盖方式", value: selected.value.coverage === "base" ? "底区" : "覆盖区", editor: {type: "select", value: selected.value.coverage, options: coverageOptions, disabled: selected.value.category !== "custom", apply: value => setProperty("coverage", value)}},
  ...[["宜居度修正", "habitability", -100, 100, 1], ["通行成本倍率", "movementCost", 0, 10, 0.1],
    ["经济产出倍率", "economy", 0, 10, 0.1], ["防守修正", "defense", -100, 100, 1]].map(([label, key, min, max, step]) => ({
    label, value: selected.value.effects[key], editor: {type: "number", value: selected.value.effects[key], min, max, step,
      apply: value => setProperty("effects", {...selected.value.effects, [key]: value})}
  })),
  {label: "事件摘要", value: selected.value.summary},
  {label: "事件状态", value: selected.value.statusLabel},
  ...selected.value.participants.map(participant => ({label: zoneRoleLabel(participant.role), value: participant.name})),
  {label: "纹理", value: selected.value.patternLabel, editor: {type: "select", value: selected.value.pattern, options: patternOptions, apply: pattern => props.callbacks.onStyleChange?.(selected.value.id, {pattern})}},
  {label: "颜色", value: selected.value.color, editor: {type: "color", value: selected.value.color, apply: hexColor => props.callbacks.onStyleChange?.(selected.value.id, {hexColor})}},
  {label: "涉及国家", value: selected.value.statesLabel},
  {label: "规模", value: `${formatNumber(selected.value.cells)} 个区域`},
  {label: "面积", value: formatAreaValue(selected.value.area)},
  {label: "状态", value: selected.value.hidden ? "隐藏" : "显示"}
] : []);

function setProperty(key, value) {
  return props.callbacks.onPropertiesChange?.(selected.value.id, {[key]: value});
}

function handleEmptyAction(key) {
  if (key === "clear-filter") props.callbacks.onFilter?.("");
}

function handleListAction(key) {
  if (key === "create") toggleCreateMode();
  if (key === "delete" && selected.value) props.callbacks.onDelete?.(selected.value.id);
}

function toggleCreateMode() {
  props.callbacks.onCreateMode?.(props.state.createMode ? null : zoneDraft.type);
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
      const context = resolveZoneContext(map, zone);
      const model = normalizeZoneTypeRecord(zone);
      const area = cells.reduce((sum, cell) => sum + Number(map?.pack?.cells?.area?.[cell] || 0), 0);
      return {
        id,
        name: zone.name || `${meta.label} #${id}`,
        rawType,
        type: meta.label || rawType,
        note: meta.note || "自定义地区",
        summary: context.summary,
        status: context.status,
        statusLabel: context.statusLabel,
        participants: context.participants,
        category: model.category,
        source: model.source,
        customTypeName: model.customTypeName,
        description: model.description,
        coverage: model.coverage,
        effects: model.effects,
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
    row.summary,
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
