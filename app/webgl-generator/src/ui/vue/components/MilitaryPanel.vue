<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="military-panel-summary" />

  <div class="military-panel-controls">
    <UiSelectField
      input-id="military-state-filter"
      class-name="military-state-select"
      label="国家"
      :model-value="state.selectedStateId"
      :options="stateOptions"
      @update:model-value="callbacks.onStateChange"
    />
    <UiFilterInput :model-value="state.filter" placeholder="筛选军团 / 国家 / 状态 / 兵种" @update:model-value="callbacks.onFilter" />
  </div>

  <div class="military-edit-toolbar">
    <UiButton variant="secondary" @click="exportCsv">导出 CSV</UiButton>
    <UiButton variant="secondary" @click="exportJson">导出 JSON</UiButton>
  </div>

  <UiSortBar class-name="military-panel-sort" :options="sortOptions" :active-key="state.sortKey" :direction="state.sortDir" @sort="callbacks.onSort" />

  <UiObjectTable
    :columns="columns"
    :rows="visibleRows"
    :selected-id="state.selectedRegimentId"
    empty-text="没有匹配的军团"
    @select="callbacks.onSelect"
    @locate="callbacks.onLocate"
  />

  <section v-if="selected" class="military-overview" aria-label="选中军团概要">
    <div class="military-overview-heading">
      <div>
        <strong>{{ selected.name }}</strong>
        <span>{{ selected.stateName }} / {{ selected.orderLabel }}</span>
      </div>
      <span class="military-status-pill">{{ selected.statusLabel }}</span>
    </div>
    <div class="military-overview-stats">
      <span>
        <small>兵力</small>
        <b>{{ formatNumber(selected.troops) }}</b>
      </span>
      <span>
        <small>主兵种</small>
        <b>{{ selected.dominantUnitLabel }}</b>
      </span>
      <span>
        <small>驻扎适宜</small>
        <b>{{ Math.round(selected.suitabilityScore * 100) }}%</b>
      </span>
    </div>
    <div class="military-unit-bars">
      <div v-for="unit in selectedUnitBreakdown" :key="unit.name" class="military-unit-bar">
        <div>
          <span>{{ unit.label }}</span>
          <small>{{ unit.valueLabel }} / {{ unit.percent }}%</small>
        </div>
        <i :style="{width: `${unit.percent}%`}"></i>
      </div>
    </div>
  </section>

  <UiDetailGrid class-name="military-panel-details" empty-text="未选中军团" :rows="detailRows" />

  <UiActionDock v-if="selectedState" v-model:active="activeAction" :actions="militaryActions">
    <template #ratios>
      <div class="military-ratio-panel">
        <div class="military-ratio-heading">
          <strong>{{ selectedState.name }}</strong>
          <span>{{ ratioTotalLabel }}</span>
        </div>
        <div class="military-ratio-list">
          <div v-for="unit in ratioBreakdown" :key="unit.name" class="military-ratio-item">
            <div class="military-ratio-item-head">
              <span>{{ unit.label }}</span>
              <small>{{ unit.value }}%</small>
            </div>
            <i :style="{width: `${unit.width}%`}"></i>
            <UiSliderField
              :label="unit.label"
              :input-id="`military-ratio-${unit.name}`"
              field-class="military-ratio-field"
              :model-value="ratioDraft[unit.name] ?? 0"
              :min="0"
              :max="100"
              :step="1"
              unit-label="%"
              @input="value => setRatio(unit.name, value)"
              @change="value => setRatio(unit.name, value)"
            />
          </div>
        </div>
        <UiButton class="military-ratio-apply" variant="secondary" @click="applyRatios">应用比例</UiButton>
      </div>
    </template>
  </UiActionDock>

  <UiHistoryActions class-name="military-history-actions" :history="state.history" @undo="callbacks.onUndo" @redo="callbacks.onRedo" />
</template>

<script setup>
import {computed, reactive, ref, watch} from "vue";
import {MILITARY_UNITS, normalizeUnitRatios} from "../../../generator/military.js";
import UiActionDock from "./base/UiActionDock.vue";
import UiButton from "./base/UiButton.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiHistoryActions from "./base/UiHistoryActions.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiSelectField from "./base/UiSelectField.vue";
import UiSliderField from "./base/UiSliderField.vue";
import UiSortBar from "./base/UiSortBar.vue";
import {formatNumber as formatDisplayNumber} from "../../display-units.js";
import {findByObjectId} from "../../object-id.js";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";

defineOptions({
  name: "MilitaryPanel"
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
  {key: "troops", label: "兵力"},
  {key: "stateName", label: "国家"},
  {key: "statusLabel", label: "状态"},
  {key: "suitabilityScore", label: "适宜"},
  {key: "movementSpeed", label: "速度"},
  {key: "id", label: "ID"}
]);

const columns = Object.freeze([
  {key: "stateName", label: "国家"},
  {key: "name", label: "军团"},
  {key: "statusLabel", label: "态势"},
  {key: "dominantUnitLabel", label: "主兵种"},
  {key: "troops", label: "兵力", align: "right", format: value => formatNumber(value)},
  {key: "suitabilityScore", label: "适宜", align: "right", format: value => `${Math.round(Number(value || 0) * 100)}%`}
]);

const unitPreferences = useUnitPreferences();
const unitDefinitions = MILITARY_UNITS;
const activeAction = ref(null);
const ratioDraft = reactive({});

const metrics = computed(() => {
  props.state.version;
  return buildMilitaryMetrics(props.state.map);
});
const stateOptions = computed(() => [
  {value: "all", label: "全部国家"},
  ...metrics.value.states.map(state => ({value: state.id, label: state.name}))
]);
const filteredRows = computed(() => filterRows(metrics.value.rows, props.state.filter, props.state.selectedStateId));
const visibleRows = computed(() => sortRows(filteredRows.value, props.state.sortKey, props.state.sortDir));
const selected = computed(() => findByObjectId(metrics.value.rows, props.state.selectedRegimentId) || visibleRows.value[0] || null);
const selectedUnitBreakdown = computed(() => unitBreakdown(selected.value));
const selectedState = computed(() => selected.value ? metrics.value.states.find(state => state.id === selected.value.stateId) : metrics.value.states.find(state => state.id === Number(props.state.selectedStateId)) || null);
const ratioTotalLabel = computed(() => `${Math.round(Object.values(ratioDraft).reduce((sum, value) => sum + Number(value || 0), 0))}%`);
const ratioBreakdown = computed(() => unitDefinitions.map(unit => {
  const value = Math.round(Number(ratioDraft[unit.name] || 0));
  return {
    name: unit.name,
    label: unit.label,
    value,
    width: Math.max(3, Math.min(100, value))
  };
}));
const militaryActions = Object.freeze([
  {key: "ratios", label: "兵种比例", icon: "⚖"}
]);

const summaryMetrics = computed(() => [
  {label: "国家", value: formatNumber(metrics.value.states.length)},
  {label: "军团", value: formatNumber(metrics.value.rows.length)},
  {label: "总兵力", value: formatNumber(metrics.value.troops)},
  {label: "舰队", value: formatNumber(metrics.value.fleets)},
  {label: "战线", value: formatNumber(metrics.value.fronts)},
  {label: "筛选", value: formatNumber(visibleRows.value.length)}
]);

const detailRows = computed(() => selected.value ? [
  {label: "国家", value: selected.value.stateName},
  {label: "军团", value: selected.value.name},
  {label: "态势", value: selected.value.statusLabel},
  {label: "命令", value: selected.value.orderLabel},
  {label: "兵力", value: formatNumber(selected.value.troops)},
  {label: "兵种", value: selected.value.unitSummary},
  {label: "主兵种", value: selected.value.dominantUnitLabel},
  {label: "驻扎适宜度", value: `${Math.round(selected.value.suitabilityScore * 100)}%`},
  {label: "移动速度", value: formatNumber(selected.value.movementSpeed)},
  {label: "文明", value: selected.value.civilizationLabel},
  {label: "外交压力", value: formatNumber(selected.value.diplomacyPressure)},
  {label: "资源压力", value: formatNumber(selected.value.resourcePressure)},
  {label: "战争原因", value: selected.value.warCauseLabel || "无"}
] : []);

watch(() => selectedState.value?.id, syncRatioDraft, {immediate: true});
watch(() => props.state.version, syncRatioDraft);

function buildMilitaryMetrics(map) {
  const states = stateRows(map);
  const rows = states.flatMap(state => (state.state.military || []).map(regiment => {
    const id = regiment.id ?? `${state.id}:${regiment.i}`;
    const policy = state.state.militaryPolicy || {};
    return {
      id,
      regimentId: regiment.i,
      stateId: state.id,
      stateName: state.name,
      name: regiment.name || `军团 #${regiment.i}`,
      type: regiment.type,
      status: regiment.status,
      statusLabel: regiment.statusLabel || regiment.status || "未知",
      orderLabel: orderLabel(regiment.order),
      dominantUnit: regiment.dominantUnit,
      dominantUnitLabel: regiment.dominantUnitLabel || unitLabel(regiment.dominantUnit),
      troops: Number(regiment.a || 0),
      units: regiment.u || {},
      unitSummary: unitSummary(regiment.u),
      icon: regiment.icon,
      iconVariant: regiment.iconVariant,
      iconLabel: regiment.iconLabel,
      x: regiment.x,
      y: regiment.y,
      cell: regiment.cell,
      suitabilityScore: Number(regiment.suitability?.total || 0),
      movementSpeed: Number(regiment.movementSpeed || 0),
      civilizationLabel: policy.civilizationLabel || state.state.civilizationLabel || "未知",
      diplomacyPressure: Number(policy.diplomacyPressure || 1),
      resourcePressure: Number(policy.resourcePressure || 1),
      warCauseLabel: firstWarCause(state.state)
    };
  }));

  return {
    states,
    rows,
    troops: rows.reduce((sum, row) => sum + row.troops, 0),
    fleets: rows.filter(row => row.type === "fleet").length,
    fronts: map?.military?.metadata?.fronts || map?.military?.fronts?.length || 0
  };
}

function stateRows(map) {
  return (map?.politics?.states || map?.pack?.states || [])
    .filter(state => state?.i && !state.removed)
    .map(state => ({
      id: state.i,
      name: state.fullName || state.name || `国家 #${state.i}`,
      state
    }));
}

function filterRows(rows, filter, stateId) {
  const filteredByState = stateId === "all" ? rows : rows.filter(row => row.stateId === Number(stateId));
  const query = filter.trim().toLowerCase();
  if (!query) return filteredByState;
  return filteredByState.filter(row =>
    row.id.toLowerCase().includes(query)
    || row.name.toLowerCase().includes(query)
    || row.stateName.toLowerCase().includes(query)
    || row.statusLabel.toLowerCase().includes(query)
    || row.dominantUnitLabel.toLowerCase().includes(query)
  );
}

function sortRows(rows, key, direction) {
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (a[key] === b[key]) return a.id.localeCompare(b.id);
    if (typeof a[key] === "string") return a[key].localeCompare(b[key], "zh-CN") * factor;
    return a[key] > b[key] ? factor : -factor;
  });
}

function syncRatioDraft() {
  const ratios = normalizeUnitRatios(selectedState.value?.state?.militaryPolicy?.unitRatios);
  for (const unit of unitDefinitions) ratioDraft[unit.name] = Math.round((ratios[unit.name] || 0) * 100);
}

function setRatio(unit, value) {
  ratioDraft[unit] = Number(value) || 0;
}

function applyRatios() {
  if (!selectedState.value) return;
  const ratios = {};
  for (const unit of unitDefinitions) ratios[unit.name] = Number(ratioDraft[unit.name] || 0);
  props.callbacks.onRatiosApply?.(selectedState.value.id, normalizeUnitRatios(ratios));
  activeAction.value = null;
}

function unitSummary(units = {}) {
  return unitDefinitions
    .map(unit => {
      const value = Number(units[unit.name] || 0);
      return value > 0 ? `${unit.label}${formatNumber(value)}` : "";
    })
    .filter(Boolean)
    .join(" / ") || "无";
}

function unitBreakdown(regiment) {
  if (!regiment) return [];
  const total = Math.max(1, Number(regiment.troops || 0));
  return unitDefinitions
    .map(unit => {
      const value = Number(regiment.units?.[unit.name] || 0);
      const percent = Math.max(1, Math.round((value / total) * 100));
      return value > 0 ? {
        name: unit.name,
        label: unit.label,
        value,
        valueLabel: formatNumber(value),
        percent: Math.min(100, percent)
      } : null;
    })
    .filter(Boolean);
}

function unitLabel(unitName) {
  return unitDefinitions.find(unit => unit.name === unitName)?.label || unitName || "未知";
}

function orderLabel(order = {}) {
  if (!order?.kind) return "无";
  const labels = {advance: "前往", muster: "集结", patrol: "巡逻", rest: "修整", retreat: "撤退", garrison: "驻防"};
  return `${labels[order.kind] || order.kind}${order.targetName ? `：${order.targetName}` : ""}`;
}

function firstWarCause(state) {
  return (state.campaigns || []).find(campaign => campaign.causeLabel)?.causeLabel || "";
}

function formatNumber(value) {
  return formatDisplayNumber(value, unitPreferences.value);
}

function exportCsv() {
  const seed = props.state.map?.metadata?.seed || "map";
  const header = ["国家", "军团", "态势", "主兵种", "兵力", "适宜度", "速度"];
  const body = visibleRows.value.map(row => [row.stateName, row.name, row.statusLabel, row.dominantUnitLabel, row.troops, row.suitabilityScore, row.movementSpeed]);
  downloadText(`fmg-military-${safeFilePart(seed)}.csv`, [header, ...body].map(values => values.map(csvEscape).join(",")).join("\r\n"), "text/csv;charset=utf-8");
}

function exportJson() {
  const map = props.state.map;
  const seed = map?.metadata?.seed || "map";
  const payload = {
    seed,
    metadata: map?.military?.metadata || {},
    fronts: map?.military?.fronts || [],
    regiments: visibleRows.value
  };
  downloadText(`fmg-military-${safeFilePart(seed)}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], {type});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function safeFilePart(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "map";
}
</script>
