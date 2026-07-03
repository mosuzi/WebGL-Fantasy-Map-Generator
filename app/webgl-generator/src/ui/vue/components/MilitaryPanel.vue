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
    <UiSelectField
      input-id="military-status-filter"
      class-name="military-status-select"
      label="态势"
      :model-value="state.selectedStatus"
      :options="statusOptions"
      @update:model-value="callbacks.onStatusChange"
    />
    <UiFilterInput :model-value="state.filter" placeholder="筛选军团 / 国家 / 兵种" @update:model-value="callbacks.onFilter" />
  </div>

  <div class="military-edit-toolbar">
    <UiButton variant="secondary" @click="exportCsv">导出 CSV</UiButton>
    <UiButton variant="secondary" @click="exportJson">导出 JSON</UiButton>
    <UiButton variant="secondary" :disabled="!allBattleEvents.length" @click="exportBattleEvents">导出事件</UiButton>
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

  <section v-if="selected" class="military-event-list" aria-label="选中军团战斗事件">
    <div class="military-event-list-heading">
      <strong>战斗事件</strong>
      <span>{{ selectedBattleEventTotal ? `${formatNumber(selectedBattleEventTotal)} 条` : "暂无" }}</span>
    </div>
    <p v-if="!selectedBattleEvents.length" class="military-event-empty">当前军团还没有战斗事件。</p>
    <ol v-else>
      <li v-for="event in selectedBattleEvents" :key="event.id || `${event.regimentObjectId}-${event.sequence}`" class="military-event-item">
        <div>
          <strong>{{ event.typeLabel || event.type || "事件" }} / {{ event.outcomeLabel || event.outcome || "结果" }}</strong>
          <span>{{ formatEventDate(event.at) }}</span>
        </div>
        <p>{{ event.description || "无说明" }}</p>
        <small v-if="event.resultApplied" class="military-event-result">{{ battleResultSummary(event) }}</small>
      </li>
    </ol>
  </section>

  <UiActionDock v-if="selectedState" v-model:active="activeAction" :actions="militaryActions">
    <template #rename>
      <UiTextEditField
        class-name="military-name-editor"
        label="军团"
        action-label="应用名称"
        :model-value="selected?.name || ''"
        :max-length="40"
        @apply="applyRename"
      />
    </template>
    <template #status>
      <div class="military-status-panel">
        <div class="military-status-heading">
          <strong>{{ selected?.name || "未选中军团" }}</strong>
          <span>{{ selected?.stateName || "无所属国家" }}</span>
        </div>
        <UiSelectField
          input-id="military-status-editor"
          class-name="military-status-editor"
          label="态势"
          :model-value="statusDraft"
          :options="statusEditOptions"
          :disabled="!selected"
          @update:model-value="setStatusDraft"
        />
        <UiButton class="military-status-apply" variant="secondary" :disabled="!selected || statusDraft === selected.status" @click="applyStatus">应用态势</UiButton>
      </div>
    </template>
    <template #batchStatus>
      <div class="military-status-panel">
        <div class="military-status-heading">
          <strong>当前筛选 {{ formatNumber(visibleRows.length) }} 支</strong>
          <span>只影响当前表格中的可见军团</span>
        </div>
        <UiSelectField
          input-id="military-batch-status-editor"
          class-name="military-status-editor"
          label="态势"
          :model-value="batchStatusDraft"
          :options="statusEditOptions"
          :disabled="!visibleRows.length"
          @update:model-value="setBatchStatusDraft"
        />
        <UiButton class="military-status-apply" variant="secondary" :disabled="!visibleRows.length" @click="applyBatchStatus">应用到筛选</UiButton>
      </div>
    </template>
    <template #station>
      <div class="military-status-panel">
        <div class="military-status-heading">
          <strong>{{ selected?.name || "未选中军团" }}</strong>
          <span>驻地 {{ selected?.stationLabel || "未知" }} / 基地 {{ selected?.baseLabel || "未知" }}</span>
        </div>
        <UiSelectField
          input-id="military-station-destination"
          class-name="military-status-editor"
          label="目标"
          :model-value="stationDestinationDraft"
          :options="stationDestinationOptions"
          :disabled="!selected || !stationDestinationOptions.length"
          @update:model-value="setStationDestinationDraft"
        />
        <UiButton class="military-status-apply" variant="secondary" :disabled="!selectedStationDestination" @click="applyStationMove">移动驻地</UiButton>
        <UiButton class="military-status-apply" variant="secondary" :disabled="!selected" @click="applySetBase">设当前位置为基地</UiButton>
      </div>
    </template>
    <template #battle>
      <div class="military-status-panel">
        <div class="military-status-heading">
          <strong>{{ selected?.name || "未选中军团" }}</strong>
          <span>{{ selected?.latestEventLabel || "暂无战斗事件" }}</span>
        </div>
        <UiSelectField
          input-id="military-battle-event-type"
          class-name="military-status-editor"
          label="类型"
          :model-value="battleEventDraft.type"
          :options="battleEventTypeOptions"
          :disabled="!selected"
          @update:model-value="value => battleEventDraft.type = value"
        />
        <UiSelectField
          input-id="military-battle-event-outcome"
          class-name="military-status-editor"
          label="结果"
          :model-value="battleEventDraft.outcome"
          :options="battleEventOutcomeOptions"
          :disabled="!selected"
          @update:model-value="value => battleEventDraft.outcome = value"
        />
        <UiSwitchField
          label="应用轻量结果"
          input-id="military-battle-apply-result"
          field-class="military-result-switch"
          :checked="battleEventDraft.applyResult"
          @change="value => battleEventDraft.applyResult = value"
        />
        <p v-if="battleEventDraft.applyResult" class="military-result-preview">{{ battleResultPreview }}</p>
        <UiNoteField
          class-name="military-battle-event-note"
          label="说明"
          :action-label="battleEventDraft.applyResult ? '记录并应用' : '记录事件'"
          :model-value="battleEventDraft.description"
          :rows="3"
          :max-length="180"
          @apply="applyBattleEvent"
          @clear="clearBattleEventDescription"
        />
      </div>
    </template>
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
import {MILITARY_STATUSES, MILITARY_UNITS, normalizeUnitRatios} from "../../../generator/military.js";
import UiActionDock from "./base/UiActionDock.vue";
import UiButton from "./base/UiButton.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiHistoryActions from "./base/UiHistoryActions.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiNoteField from "./base/UiNoteField.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiSelectField from "./base/UiSelectField.vue";
import UiSliderField from "./base/UiSliderField.vue";
import UiSortBar from "./base/UiSortBar.vue";
import UiSwitchField from "./base/UiSwitchField.vue";
import UiTextEditField from "./base/UiTextEditField.vue";
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
const statusDraft = ref("garrisoned");
const batchStatusDraft = ref("garrisoned");
const stationDestinationDraft = ref("capital");
const battleEventDraft = reactive({
  type: "skirmish",
  outcome: "victory",
  description: "",
  applyResult: false
});

const battleEventTypeOptions = Object.freeze([
  {value: "skirmish", label: "遭遇战"},
  {value: "siege", label: "攻城"},
  {value: "raid", label: "袭扰"},
  {value: "naval", label: "海战"},
  {value: "retreat", label: "撤退"},
  {value: "report", label: "战报"}
]);
const battleEventOutcomeOptions = Object.freeze([
  {value: "victory", label: "小胜"},
  {value: "defeat", label: "受挫"},
  {value: "draw", label: "相持"},
  {value: "loss", label: "损耗"},
  {value: "regroup", label: "重整"}
]);
const battleResultRules = Object.freeze({
  victory: {lossRate: 0.04, statusLabel: "修整中"},
  defeat: {lossRate: 0.18, statusLabel: "败逃中"},
  draw: {lossRate: 0.08, statusLabel: "修整中"},
  loss: {lossRate: 0.25, statusLabel: "败逃中"},
  regroup: {lossRate: 0.02, statusLabel: "集结中"}
});

const metrics = computed(() => {
  props.state.version;
  return buildMilitaryMetrics(props.state.map);
});
const stateOptions = computed(() => [
  {value: "all", label: "全部国家"},
  ...metrics.value.states.map(state => ({value: state.id, label: state.name}))
]);
const statusOptions = computed(() => {
  const options = new Map();
  for (const row of metrics.value.rows) options.set(statusValue(row), row.statusLabel || row.status || "未知");
  return [
    {value: "all", label: "全部态势"},
    ...[...options.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], "zh-CN"))
      .map(([value, label]) => ({value, label}))
  ];
});
const filteredRows = computed(() => filterRows(metrics.value.rows, props.state.filter, props.state.selectedStateId, props.state.selectedStatus));
const visibleRows = computed(() => sortRows(filteredRows.value, props.state.sortKey, props.state.sortDir));
const selected = computed(() => findByObjectId(visibleRows.value, props.state.selectedRegimentId) || visibleRows.value[0] || null);
const selectedUnitBreakdown = computed(() => unitBreakdown(selected.value));
const allBattleEvents = computed(() => collectBattleEvents(props.state.map, metrics.value.rows));
const selectedBattleEventTotal = computed(() => countEventsForRegiment(allBattleEvents.value, selected.value));
const selectedBattleEvents = computed(() => latestEventsForRegiment(allBattleEvents.value, selected.value, 5));
const battleResultPreview = computed(() => {
  const rule = battleResultRules[battleEventDraft.outcome] || battleResultRules.draw;
  return `兵力约 -${Math.round(rule.lossRate * 100)}%，态势改为${rule.statusLabel}`;
});
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
const statusEditOptions = computed(() => {
  const options = Object.values(MILITARY_STATUSES).map(status => ({value: status.value, label: status.label}));
  if (selected.value?.status && !options.some(option => option.value === selected.value.status)) {
    options.push({value: selected.value.status, label: selected.value.statusLabel || selected.value.status});
  }
  return options;
});
const militaryActions = computed(() => [
  {key: "rename", label: "重命名", icon: "✎", disabled: !selected.value},
  {key: "status", label: "调整态势", icon: "⇄", disabled: !selected.value},
  {key: "batchStatus", label: "批量态势", icon: "☷", disabled: !visibleRows.value.length},
  {key: "station", label: "驻地基地", icon: "⌖", disabled: !selected.value},
  {key: "battle", label: "战斗事件", icon: "⚔", disabled: !selected.value},
  {key: "ratios", label: "兵种比例", icon: "⚖"}
]);

const summaryMetrics = computed(() => [
  {label: "国家", value: formatNumber(metrics.value.states.length)},
  {label: "军团", value: formatNumber(metrics.value.rows.length)},
  {label: "总兵力", value: formatNumber(metrics.value.troops)},
  {label: "舰队", value: formatNumber(metrics.value.fleets)},
  {label: "战线", value: formatNumber(metrics.value.fronts)},
  {label: "事件", value: formatNumber(allBattleEvents.value.length)},
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
  {label: "驻地", value: selected.value.stationLabel},
  {label: "基地", value: selected.value.baseLabel},
  {label: "战斗事件", value: selected.value.latestEventLabel},
  {label: "驻扎适宜度", value: `${Math.round(selected.value.suitabilityScore * 100)}%`},
  {label: "移动速度", value: formatNumber(selected.value.movementSpeed)},
  {label: "文明", value: selected.value.civilizationLabel},
  {label: "外交压力", value: formatNumber(selected.value.diplomacyPressure)},
  {label: "资源压力", value: formatNumber(selected.value.resourcePressure)},
  {label: "战争原因", value: selected.value.warCauseLabel || "无"}
] : []);
const stationDestinationOptions = computed(() => buildStationDestinationOptions(props.state.map, selected.value, selectedState.value?.state));
const selectedStationDestination = computed(() => stationDestinationOptions.value.find(option => String(option.value) === String(stationDestinationDraft.value)) || null);

watch(() => selectedState.value?.id, syncRatioDraft, {immediate: true});
watch(() => props.state.version, syncRatioDraft);
watch(() => selected.value?.id, syncStatusDraft, {immediate: true});
watch(() => selected.value?.status, syncStatusDraft);
watch(() => selected.value?.id, syncStationDestinationDraft, {immediate: true});
watch(() => stationDestinationOptions.value.map(option => option.value).join("|"), syncStationDestinationDraft);

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
      stationLabel: packCellLabel(map, regiment.cell),
      baseCell: baseCellForRegiment(map, regiment),
      baseX: Number(regiment.bx),
      baseY: Number(regiment.by),
      baseLabel: baseLabelForRegiment(map, regiment),
      events: Array.isArray(regiment.events) ? regiment.events : [],
      eventCount: Array.isArray(regiment.events) ? regiment.events.length : 0,
      latestEvent: latestBattleEvent(regiment.events),
      latestEventLabel: latestBattleEventLabel(regiment.events),
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

function filterRows(rows, filter, stateId, status = "all") {
  const filteredByState = stateId === "all" ? rows : rows.filter(row => row.stateId === Number(stateId));
  const filteredByStatus = status === "all" ? filteredByState : filteredByState.filter(row => statusValue(row) === status);
  const query = filter.trim().toLowerCase();
  if (!query) return filteredByStatus;
  return filteredByStatus.filter(row =>
    row.id.toLowerCase().includes(query)
    || row.name.toLowerCase().includes(query)
    || row.stateName.toLowerCase().includes(query)
    || row.statusLabel.toLowerCase().includes(query)
    || row.dominantUnitLabel.toLowerCase().includes(query)
  );
}

function statusValue(row) {
  return String(row.status || row.statusLabel || "unknown");
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

function syncStatusDraft() {
  statusDraft.value = selected.value?.status || "garrisoned";
}

function setStatusDraft(value) {
  statusDraft.value = value;
}

function setBatchStatusDraft(value) {
  batchStatusDraft.value = value;
}

function syncStationDestinationDraft() {
  if (stationDestinationOptions.value.some(option => String(option.value) === String(stationDestinationDraft.value))) return;
  stationDestinationDraft.value = stationDestinationOptions.value[0]?.value || "capital";
}

function setStationDestinationDraft(value) {
  stationDestinationDraft.value = value;
}

function applyStatus() {
  if (!selected.value) return;
  props.callbacks.onStatusApply?.({
    id: selected.value.id,
    stateId: selected.value.stateId,
    regimentId: selected.value.regimentId
  }, statusDraft.value);
  activeAction.value = null;
}

function applyBatchStatus() {
  const targets = visibleRows.value.map(row => ({
    id: row.id,
    stateId: row.stateId,
    regimentId: row.regimentId
  }));
  if (!targets.length) return;
  props.callbacks.onBatchStatusApply?.(targets, batchStatusDraft.value);
  activeAction.value = null;
}

function applyStationMove() {
  if (!selected.value || !selectedStationDestination.value) return;
  props.callbacks.onStationApply?.(militaryTarget(selected.value), selectedStationDestination.value.destination);
  activeAction.value = null;
}

function applySetBase() {
  if (!selected.value) return;
  props.callbacks.onBaseApply?.(militaryTarget(selected.value));
  activeAction.value = null;
}

function applyBattleEvent(description) {
  if (!selected.value) return;
  props.callbacks.onBattleEventApply?.(militaryTarget(selected.value), {
    type: battleEventDraft.type,
    outcome: battleEventDraft.outcome,
    description,
    applyResult: battleEventDraft.applyResult
  });
  battleEventDraft.description = "";
  activeAction.value = null;
}

function clearBattleEventDescription() {
  battleEventDraft.description = "";
}

function applyRename(name) {
  if (!selected.value) return;
  props.callbacks.onRename?.(militaryTarget(selected.value), name);
  activeAction.value = null;
}

function militaryTarget(row) {
  return {
    id: row.id,
    stateId: row.stateId,
    regimentId: row.regimentId
  };
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

function buildStationDestinationOptions(map, regiment, state) {
  if (!regiment) return [];
  const options = [];
  const capitalDestination = destinationForCell(map, state?.center, "国家中心");
  if (capitalDestination) options.push({
    value: "capital",
    label: `国家中心：${capitalDestination.label}`,
    destination: capitalDestination
  });
  const baseCell = regiment.baseCell ?? nearestPackCell(map, regiment.baseX, regiment.baseY);
  const baseDestination = destinationForCell(map, baseCell, "当前基地", regiment.baseX, regiment.baseY);
  if (baseDestination) options.push({
    value: "base",
    label: `当前基地：${baseDestination.label}`,
    destination: baseDestination
  });
  return options;
}

function destinationForCell(map, cell, fallbackName, x = null, y = null) {
  const normalizedCell = Number(cell);
  const point = map?.pack?.cells?.p?.[normalizedCell];
  if (!Number.isInteger(normalizedCell) || !point) return null;
  const destinationX = isProvidedNumber(x) ? Number(x) : point[0];
  const destinationY = isProvidedNumber(y) ? Number(y) : point[1];
  if (!Number.isFinite(destinationX) || !Number.isFinite(destinationY)) return null;
  const label = packCellLabel(map, normalizedCell);
  return {
    cell: normalizedCell,
    x: roundValue(destinationX, 2),
    y: roundValue(destinationY, 2),
    name: label || fallbackName,
    label
  };
}

function packCellLabel(map, cell) {
  const normalizedCell = Number(cell);
  if (!Number.isInteger(normalizedCell) || !map?.pack?.cells?.p?.[normalizedCell]) return "未知";
  const burgId = map.pack.cells.burg?.[normalizedCell];
  const provinceId = map.pack.cells.province?.[normalizedCell];
  const burgName = map.pack.burgs?.[burgId]?.name;
  const provinceName = map.pack.provinces?.[provinceId]?.name;
  if (burgName) return `${burgName} #${normalizedCell}`;
  if (provinceName) return `${provinceName} #${normalizedCell}`;
  return `cell #${normalizedCell}`;
}

function baseCellForRegiment(map, regiment = {}) {
  const direct = Number(regiment.baseCell ?? regiment.bcell);
  if (Number.isInteger(direct) && map?.pack?.cells?.p?.[direct]) return direct;
  return nearestPackCell(map, regiment.bx, regiment.by);
}

function baseLabelForRegiment(map, regiment = {}) {
  const cell = baseCellForRegiment(map, regiment);
  if (Number.isInteger(cell)) return packCellLabel(map, cell);
  if (Number.isFinite(Number(regiment.bx)) && Number.isFinite(Number(regiment.by))) return `坐标 ${roundValue(regiment.bx, 1)}, ${roundValue(regiment.by, 1)}`;
  return "未知";
}

function latestBattleEvent(events = []) {
  return [...(events || [])].filter(event => event?.kind === "battle").at(-1) || null;
}

function latestBattleEventLabel(events = []) {
  const event = latestBattleEvent(events);
  if (!event) return "无";
  const detail = event.description ? `：${event.description}` : "";
  return `${event.typeLabel || event.type || "事件"} / ${event.outcomeLabel || event.outcome || "结果"}${detail}`;
}

function collectBattleEvents(map, rows = []) {
  const byId = new Map();
  const militaryEvents = map?.military?.events || map?.pack?.military?.events || [];
  for (const event of militaryEvents) addBattleEvent(byId, event);
  for (const row of rows) {
    for (const event of row.events || []) addBattleEvent(byId, {
      ...event,
      stateId: event.stateId ?? row.stateId,
      stateName: event.stateName || row.stateName,
      regimentId: event.regimentId ?? row.regimentId,
      regimentObjectId: event.regimentObjectId || row.id,
      regimentName: event.regimentName || row.name
    });
  }
  return [...byId.values()].sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));
}

function addBattleEvent(byId, event) {
  if (!event || event.kind !== "battle") return;
  const key = event.id || `${event.stateId}:${event.regimentId}:${event.sequence || byId.size}`;
  if (!byId.has(key)) byId.set(key, event);
}

function latestEventsForRegiment(events = [], regiment, limit = 5) {
  if (!regiment) return [];
  return events
    .filter(event => eventBelongsToRegiment(event, regiment))
    .slice(-limit)
    .reverse();
}

function countEventsForRegiment(events = [], regiment) {
  if (!regiment) return 0;
  return events.filter(event => eventBelongsToRegiment(event, regiment)).length;
}

function eventBelongsToRegiment(event, regiment) {
  return event.regimentObjectId === regiment.id || (Number(event.stateId) === regiment.stateId && Number(event.regimentId) === regiment.regimentId);
}

function formatEventDate(value) {
  if (!value) return "未记录时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", {month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"});
}

function battleResultSummary(event) {
  const result = event?.result || {};
  const before = formatNumber(result.troopBefore || 0);
  const after = formatNumber(result.troopAfter || 0);
  const casualties = formatNumber(result.casualties || Math.abs(result.troopDelta || 0));
  const status = result.statusAfterLabel || result.statusAfter || "未知态势";
  return `已应用：${before} -> ${after}，损耗 ${casualties}，${status}`;
}

function nearestPackCell(map, x, y) {
  const targetX = Number(x);
  const targetY = Number(y);
  const points = map?.pack?.cells?.p;
  if (!Number.isFinite(targetX) || !Number.isFinite(targetY) || !points) return null;
  let bestCell = null;
  let bestDistance = Infinity;
  for (let cell = 0; cell < points.length; cell++) {
    const point = points[cell];
    if (!point) continue;
    const distance = (point[0] - targetX) ** 2 + (point[1] - targetY) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestCell = cell;
    }
  }
  return bestCell;
}

function roundValue(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function isProvidedNumber(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
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
    events: allBattleEvents.value,
    regiments: visibleRows.value
  };
  downloadText(`fmg-military-${safeFilePart(seed)}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
}

function exportBattleEvents() {
  const map = props.state.map;
  const seed = map?.metadata?.seed || "map";
  const payload = {
    seed,
    exportedAt: new Date().toISOString(),
    count: allBattleEvents.value.length,
    events: allBattleEvents.value
  };
  downloadText(`fmg-military-events-${safeFilePart(seed)}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
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
