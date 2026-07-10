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

  <p v-if="battleEventsImportStatus" class="military-import-status">{{ battleEventsImportStatus }}</p>

  <section v-if="selected" class="military-overview" aria-label="选中军团概要">
    <div class="military-overview-heading">
      <div class="military-overview-title">
        <span class="military-overview-icon" aria-hidden="true">{{ overviewMilitaryIcon(selected) }}</span>
        <div>
          <strong>{{ selected.name }}</strong>
          <span>{{ selected.stateName }} / {{ selected.orderLabel }}</span>
        </div>
      </div>
      <span class="military-status-pill">{{ selected.statusLabel }}</span>
    </div>
    <div class="military-overview-stats">
      <span>
        <small>兵力</small>
        <b>{{ formatMilitaryValue(selected.troops) }}</b>
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

  <section v-if="selected" class="military-dossier" aria-label="军团静态档案">
    <div v-for="group in militaryDossierGroups" :key="group.title" class="military-dossier-group">
      <strong>{{ group.title }}</strong>
      <div>
        <span v-for="item in group.items" :key="item.label">
          <small>{{ item.label }}</small>
          <b>{{ item.value }}</b>
        </span>
      </div>
    </div>
  </section>

  <UiDetailGrid class-name="military-panel-details" empty-text="未选中军团" :rows="detailRows" />
  <UiObjectTable
    :columns="columns"
    :column-widths="state.columnWidths"
    :rows="visibleRows"
    :sort-key="state.sortKey"
    :sort-direction="state.sortDir"
    :sort-options="sortOptions"
    sortable
    @sort="callbacks.onSort"
    :selected-id="state.selectedRegimentId"
    :doubleClickAction="'edit'"
    empty-text="没有匹配的军团"
    :empty-action="filterEmptyAction"
    resizable-columns
    selectable-rows
    :selected-row-ids="selectedRegimentIds"
    @select="callbacks.onSelect"
    @locate="callbacks.onLocate"
    @edit="openRenameEditor"
    @empty-action="handleEmptyAction"
    @column-resize="callbacks.onColumnResize"
    @selection-change="selectedRegimentIds = $event"
  />

  <UiPanelIoActions
    class-name="military-panel-export-actions"
    label="军事导出"
    :export-actions="militaryExportActions"
    @export="handleMilitaryExport"
  />

  <section v-if="selected" class="military-event-list" aria-label="选中军团战报记录">
    <div class="military-event-list-heading">
      <strong>战报记录</strong>
      <span>{{ battleEventCountLabel }}</span>
    </div>
    <div v-if="selectedBattleEventTotal" class="military-event-chain" aria-label="战报档案摘要">
      <span>
        <small>链路</small>
        <b>{{ battleEventChainSummary.chainLabel }}</b>
      </span>
      <span>
        <small>记录</small>
        <b>{{ battleEventChainSummary.totalLabel }}</b>
      </span>
      <span>
        <small>已结算</small>
        <b>{{ battleEventChainSummary.appliedLabel }}</b>
      </span>
      <span>
        <small>未结算</small>
        <b>{{ battleEventChainSummary.pendingLabel }}</b>
      </span>
      <span>
        <small>累计损耗</small>
        <b>{{ battleEventChainSummary.casualtyLabel }}</b>
      </span>
      <span>
        <small>最近</small>
        <b>{{ battleEventChainSummary.latestLabel }}</b>
      </span>
    </div>
    <div v-if="battleEventChainSummary.chains.length" class="military-chain-overview" aria-label="战报档案概览">
      <button
        v-for="chain in battleEventChainSummary.chains"
        :key="chain.key"
        type="button"
        class="military-chain-chip"
        :class="{active: eventChainFilter === chain.key}"
        @click="setEventChainFilter(chain.key)"
      >
        <strong>{{ chain.label }}</strong>
        <span>{{ battleChainSideSummary(chain) }}</span>
        <small>{{ battleChainCountSummary(chain) }}</small>
      </button>
    </div>
    <div class="military-event-tools">
      <div class="military-event-filters">
        <UiSelectField
          input-id="military-event-chain-filter"
          class-name="military-event-filter"
          label="链路"
          :model-value="eventChainFilter"
          :options="selectedBattleChainOptions"
          @update:model-value="value => eventChainFilter = value"
        />
        <UiSelectField
          input-id="military-event-type-filter"
          class-name="military-event-filter"
          label="类型"
          :model-value="eventTypeFilter"
          :options="battleEventFilterTypeOptions"
          @update:model-value="value => eventTypeFilter = value"
        />
        <UiSelectField
          input-id="military-event-outcome-filter"
          class-name="military-event-filter"
          label="结果"
          :model-value="eventOutcomeFilter"
          :options="battleEventFilterOutcomeOptions"
          @update:model-value="value => eventOutcomeFilter = value"
        />
        <UiSelectField
          input-id="military-event-apply-filter"
          class-name="military-event-filter"
          label="结算"
          :model-value="eventApplyFilter"
          :options="battleEventApplyFilterOptions"
          @update:model-value="value => eventApplyFilter = value"
        />
        <UiSelectField
          input-id="military-event-export-scope"
          class-name="military-event-export-scope"
          label="导出"
          :model-value="eventExportScope"
          :options="battleEventExportScopeOptions"
          @update:model-value="callbacks.onEventExportScope"
        />
      </div>
      <div class="military-event-actions">
        <UiButton v-if="selectedBattleEventsCanExpand" variant="secondary" @click="toggleBattleEventDisplay">{{ battleEventDisplayToggleLabel }}</UiButton>
        <UiButton variant="secondary" :disabled="!selectedFilteredBattleEvents.length" @click="clearFilteredBattleEvents">{{ clearFilteredBattleEventsLabel }}</UiButton>
        <UiButton variant="secondary" :disabled="!selectedBattleEventTotal" @click="clearSelectedBattleEvents">{{ clearSelectedBattleEventsLabel }}</UiButton>
      </div>
    </div>
    <div class="military-event-scope-summary" aria-label="战报清理范围">
      <span v-for="item in battleEventScopeMetrics" :key="item.label">
        <small>{{ item.label }}</small>
        <b>{{ item.value }}</b>
      </span>
    </div>
    <p v-if="!selectedBattleEvents.length" class="military-event-empty">{{ selectedBattleEventTotal ? "没有匹配当前筛选的战报记录。" : "当前军团还没有战报记录。" }}</p>
    <ol v-else>
      <li v-for="event in selectedBattleEvents" :key="event.id || `${event.regimentObjectId}-${event.sequence}`" class="military-event-item">
        <div class="military-event-item-head">
          <strong>{{ event.typeLabel || event.type || "事件" }} / {{ event.outcomeLabel || event.outcome || "结果" }}</strong>
          <span>{{ formatEventDate(event.at) }}</span>
        </div>
        <div class="military-event-meta">
          <span>{{ battleEventChainLabel(event) }}</span>
          <span>{{ battleEventCampaignSideLabel(event) }}</span>
          <span>{{ battleEventSequenceLabel(event) }}</span>
          <span :class="battleEventAppliedClass(event)">{{ battleEventAppliedLabel(event) }}</span>
          <span>{{ battleEventLossLabel(event) }}</span>
        </div>
        <p>{{ event.description || "无说明" }}</p>
        <small v-if="event.resultApplied" class="military-event-result">{{ battleResultSummary(event) }}</small>
      </li>
    </ol>
    <UiPanelIoActions
      class-name="military-event-archive-actions"
      label="战报档案导入导出"
      :export-actions="battleEventExportActions"
      :import-actions="battleEventImportActions"
      @export="handleBattleEventExport"
      @import="handleBattleEventImport"
    />
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
      <div class="military-status-panel military-editor-panel">
        <div class="military-status-heading">
          <strong>{{ selected?.name || "未选中军团" }}</strong>
          <span>{{ selected?.stateName || "无所属国家" }}</span>
        </div>
        <div class="military-editor-context">
          <span>
            <small>当前态势</small>
            <b>{{ selected?.statusLabel || "无" }}</b>
          </span>
          <span>
            <small>当前命令</small>
            <b>{{ selected?.orderLabel || "无" }}</b>
          </span>
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
      <div class="military-status-panel military-editor-panel">
        <div class="military-status-heading">
          <strong>当前筛选 {{ formatNumber(visibleRows.length) }} 支</strong>
          <span>只影响当前表格中的可见军团</span>
        </div>
        <div class="military-editor-context">
          <span>
            <small>国家筛选</small>
            <b>{{ selectedStateFilterLabel }}</b>
          </span>
          <span>
            <small>态势筛选</small>
            <b>{{ selectedStatusFilterLabel }}</b>
          </span>
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
      <div class="military-status-panel military-editor-panel">
        <div class="military-status-heading">
          <strong>{{ selected?.name || "未选中军团" }}</strong>
          <span>驻地 {{ selected?.stationLabel || "未知" }} / 基地 {{ selected?.baseLabel || "未知" }}</span>
        </div>
        <div class="military-editor-context">
          <span>
            <small>当前驻地</small>
            <b>{{ selected?.stationLabel || "未知" }}</b>
          </span>
          <span>
            <small>固定基地</small>
            <b>{{ selected?.baseLabel || "未知" }}</b>
          </span>
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
      <div class="military-status-panel military-editor-panel">
        <div class="military-status-heading">
          <strong>{{ selected?.name || "未选中军团" }}</strong>
          <span>{{ selectedLatestBattleEventLabel }}</span>
        </div>
        <div class="military-editor-context">
          <span>
            <small>战报链</small>
            <b>{{ selected?.campaignLabel || "本地战报" }}</b>
          </span>
          <span>
            <small>记录数</small>
            <b>{{ formatNumber(selectedBattleEventTotal) }}</b>
          </span>
        </div>
        <UiSelectField
          input-id="military-battle-event-chain"
          class-name="military-status-editor"
          label="链路"
          :model-value="battleEventDraft.chainKey"
          :options="battleEventRecordChainOptions"
          :disabled="!selected || !battleEventRecordChainOptions.length"
          @update:model-value="setBattleEventChainDraft"
        />
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
          label="记录轻量结算"
          input-id="military-battle-apply-result"
          field-class="military-result-switch"
          :checked="battleEventDraft.applyResult"
          @change="value => battleEventDraft.applyResult = value"
        />
        <p v-if="battleEventDraft.applyResult" class="military-result-preview">{{ battleResultPreview }}</p>
        <UiNoteField
          class-name="military-battle-event-note"
          label="说明"
          :action-label="battleEventDraft.applyResult ? '记录并结算' : '记录战报'"
          :model-value="battleEventDraft.description"
          :rows="3"
          :max-length="180"
          @apply="applyBattleEvent"
          @clear="clearBattleEventDescription"
        />
      </div>
    </template>
    <template #ratios>
      <div class="military-ratio-panel military-editor-panel">
        <div class="military-ratio-heading">
          <strong>{{ selectedState.name }}</strong>
          <span>{{ ratioTotalLabel }}</span>
        </div>
        <div class="military-editor-context">
          <span>
            <small>国家</small>
            <b>{{ selectedState.name }}</b>
          </span>
          <span>
            <small>比例合计</small>
            <b>{{ ratioTotalLabel }}</b>
          </span>
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
import {computed, nextTick, reactive, ref, watch} from "vue";
import {MILITARY_STATUSES, MILITARY_UNITS, normalizeUnitRatios} from "../../../generator/military.js";
import UiActionDock from "./base/UiActionDock.vue";
import UiButton from "./base/UiButton.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiHistoryActions from "./base/UiHistoryActions.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiNoteField from "./base/UiNoteField.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiPanelIoActions from "./base/UiPanelIoActions.vue";
import UiSelectField from "./base/UiSelectField.vue";
import UiSliderField from "./base/UiSliderField.vue";
import UiSwitchField from "./base/UiSwitchField.vue";
import UiTextEditField from "./base/UiTextEditField.vue";
import {formatMilitary, formatNumber as formatDisplayNumber} from "../../display-units.js";
import {findByObjectId, sameObjectId} from "../../object-id.js";
import {compareRowsByKey} from "../../sort-utils.js";
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
  {key: "troops", label: "兵力", align: "right", format: value => formatMilitaryValue(value)},
  {key: "suitabilityScore", label: "适宜", align: "right", format: value => `${Math.round(Number(value || 0) * 100)}%`}
]);

const unitPreferences = useUnitPreferences();
const unitDefinitions = MILITARY_UNITS;
const militaryOverviewIcons = Object.freeze({
  "fleet-large": "≋",
  "fleet-small": "≈",
  archers: "⌁",
  "archers-heavy": "⌁",
  cavalry: "◇",
  "cavalry-heavy": "◇",
  infantry: "△",
  "infantry-heavy": "△",
  mountain: "⌂",
  artillery: "✦"
});
const activeAction = ref(null);
const renameRequestId = ref(null);
const selectedRegimentIds = ref([]);
const ratioDraft = reactive({});
const statusDraft = ref("garrisoned");
const batchStatusDraft = ref("garrisoned");
const stationDestinationDraft = ref("capital");
const battleEventsImportStatus = ref("");
const eventChainFilter = ref("all");
const eventTypeFilter = ref("all");
const eventOutcomeFilter = ref("all");
const eventApplyFilter = ref("all");
const showAllSelectedBattleEvents = ref(false);
const battleEventDraft = reactive({
  chainKey: "",
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
const battleEventFilterTypeOptions = Object.freeze([
  {value: "all", label: "全部类型"},
  ...battleEventTypeOptions
]);
const battleEventFilterOutcomeOptions = Object.freeze([
  {value: "all", label: "全部结果"},
  ...battleEventOutcomeOptions
]);
const battleEventApplyFilterOptions = Object.freeze([
  {value: "all", label: "全部结算"},
  {value: "applied", label: "已结算"},
  {value: "pending", label: "未结算"}
]);
const battleEventExportScopeOptions = Object.freeze([
  {value: "all", label: "全部记录"},
  {value: "selected", label: "当前军团"},
  {value: "filtered", label: "当前筛选"}
]);
const battleResultRules = Object.freeze({
  victory: {lossRate: 0.04, statusLabel: "修整中", label: "小胜后整队"},
  defeat: {lossRate: 0.18, statusLabel: "败逃中", label: "受挫败退"},
  draw: {lossRate: 0.08, statusLabel: "修整中", label: "相持修整"},
  loss: {lossRate: 0.25, statusLabel: "败逃中", label: "损耗败退"},
  regroup: {lossRate: 0.02, statusLabel: "集结中", label: "重整集结"}
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
const selectedStateFilterLabel = computed(() => stateOptions.value.find(option => String(option.value) === String(props.state.selectedStateId))?.label || "全部国家");
const selectedStatusFilterLabel = computed(() => statusOptions.value.find(option => String(option.value) === String(props.state.selectedStatus))?.label || "全部态势");
const eventExportScope = computed(() => {
  const scope = props.state.eventExportScope;
  return scope === "selected" || scope === "filtered" ? scope : "all";
});
const filteredRows = computed(() => filterRows(metrics.value.rows, props.state.filter, props.state.selectedStateId, props.state.selectedStatus));
const visibleRows = computed(() => sortRows(filteredRows.value, props.state.sortKey, props.state.sortDir));
const filterEmptyAction = computed(() => String(props.state.filter || "").trim()
  ? {key: "clear-filter", label: "清空筛选", icon: "⌫"}
  : null);
const selectedRegimentIdSet = computed(() => new Set(selectedRegimentIds.value.map(id => String(id))));
const selectedRegimentRows = computed(() => visibleRows.value.filter(row => selectedRegimentIdSet.value.has(String(row.id))));
const selected = computed(() => findByObjectId(visibleRows.value, props.state.selectedRegimentId) || visibleRows.value[0] || null);
const selectedUnitBreakdown = computed(() => unitBreakdown(selected.value));
const allBattleEvents = computed(() => collectBattleEvents(props.state.map, metrics.value.rows));
const selectedBattleEventTotal = computed(() => countEventsForRegiment(allBattleEvents.value, selected.value));
const selectedBattleEventRows = computed(() => eventsForRegiment(allBattleEvents.value, selected.value));
const selectedBattleChainOptions = computed(() => battleEventChainFilterOptions(selectedBattleEventRows.value));
const selectedFilteredBattleEvents = computed(() => filterBattleEvents(eventsForRegiment(allBattleEvents.value, selected.value), eventChainFilter.value, eventTypeFilter.value, eventOutcomeFilter.value, eventApplyFilter.value));
const selectedLatestBattleEventLabel = computed(() => latestBattleEventLabel(selectedBattleEventRows.value, "暂无战报记录"));
const battleEventRecordChainOptions = computed(() => buildBattleEventRecordChainOptions(props.state.map, selectedState.value?.state, selected.value));
const selectedBattleEventRecordChain = computed(() => battleEventRecordChainOptions.value.find(option => option.value === battleEventDraft.chainKey) || battleEventRecordChainOptions.value[0] || null);
const selectedBattleEventsCanExpand = computed(() => selectedFilteredBattleEvents.value.length > 5);
const selectedBattleEvents = computed(() => showAllSelectedBattleEvents.value ? newestFirstBattleEvents(selectedFilteredBattleEvents.value) : latestBattleEvents(selectedFilteredBattleEvents.value, 5));
const battleEventChainSummary = computed(() => buildBattleEventChainSummary(selectedBattleEventRows.value));
const exportBattleEventRows = computed(() => battleEventRowsForExport(eventExportScope.value));
const militaryExportActions = computed(() => [
  {key: "csv", label: "导出 CSV", disabled: !visibleRows.value.length},
  {key: "json", label: "导出 JSON", disabled: !visibleRows.value.length},
  {key: "selected-csv", label: `导出选中 CSV ${formatNumber(selectedRegimentRows.value.length)}`, disabled: !selectedRegimentRows.value.length},
  {key: "selected-json", label: `导出选中 JSON ${formatNumber(selectedRegimentRows.value.length)}`, disabled: !selectedRegimentRows.value.length}
]);
const battleEventExportActions = computed(() => [
  {key: "json", label: "档案 JSON", disabled: !exportBattleEventRows.value.length},
  {key: "csv", label: "档案 CSV", disabled: !exportBattleEventRows.value.length}
]);
const battleEventImportActions = Object.freeze([
  {key: "json", label: "导入战报档案", accept: "application/json,.json"}
]);
const battleEventDisplayToggleLabel = computed(() => showAllSelectedBattleEvents.value ? "收起最近" : `展开全部 ${formatNumber(selectedFilteredBattleEvents.value.length)}`);
const battleEventCountLabel = computed(() => {
  if (!selectedBattleEventTotal.value) return "暂无";
  if (selectedFilteredBattleEvents.value.length === selectedBattleEventTotal.value) return `${formatNumber(selectedBattleEventTotal.value)} 条`;
  return `${formatNumber(selectedFilteredBattleEvents.value.length)} / ${formatNumber(selectedBattleEventTotal.value)} 条`;
});
const battleEventScopeMetrics = computed(() => [
  {label: "当前军团", value: `${formatNumber(selectedBattleEventTotal.value)} 条`},
  {label: "当前筛选", value: `${formatNumber(selectedFilteredBattleEvents.value.length)} 条`},
  {label: "当前显示", value: `${formatNumber(selectedBattleEvents.value.length)} 条`},
  {label: "导出范围", value: `${battleEventExportScopeLabel(eventExportScope.value)} ${formatNumber(exportBattleEventRows.value.length)} 条`}
]);
const clearFilteredBattleEventsLabel = computed(() => selectedFilteredBattleEvents.value.length ? `清空筛选 ${formatNumber(selectedFilteredBattleEvents.value.length)}` : "清空筛选");
const clearSelectedBattleEventsLabel = computed(() => selectedBattleEventTotal.value ? `清空当前 ${formatNumber(selectedBattleEventTotal.value)}` : "清空当前");
const battleResultPreview = computed(() => {
  const rule = battleResultRules[battleEventDraft.outcome] || battleResultRules.draw;
  const troops = Math.max(0, Math.round(Number(selected.value?.troops || 0)));
  if (!troops) return `${rule.label}：兵力约 -${Math.round(rule.lossRate * 100)}%，态势改为${rule.statusLabel}`;
  const casualties = battlePreviewCasualties(troops, rule.lossRate);
  const afterTroops = Math.max(troops > 0 ? 1 : 0, troops - casualties);
  return `${rule.label}：${formatMilitaryValue(troops)} -> ${formatMilitaryValue(afterTroops)}，预计损耗 ${formatMilitaryValue(casualties)}，态势改为${rule.statusLabel}`;
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
  {key: "battle", label: "记录战报", icon: "⚔", disabled: !selected.value},
  {key: "ratios", label: "兵种比例", icon: "⚖", panelWidth: 620, panelHeight: 620}
]);

const summaryMetrics = computed(() => [
  {label: "国家", value: formatNumber(metrics.value.states.length)},
  {label: "军团", value: formatNumber(metrics.value.rows.length)},
  {label: "总兵力", value: formatMilitaryValue(metrics.value.troops)},
  {label: "舰队", value: formatNumber(metrics.value.fleets)},
  {label: "战报链", value: formatNumber(metrics.value.campaigns)},
  {label: "战线", value: formatNumber(metrics.value.fronts)},
  {label: "记录", value: formatNumber(allBattleEvents.value.length)},
  {label: "筛选", value: formatNumber(visibleRows.value.length)},
  {label: "已选", value: formatNumber(selectedRegimentRows.value.length)}
]);

const militaryDossierGroups = computed(() => selected.value ? [
  {
    title: "驻防",
    items: [
      dossierItem("态势", selected.value.statusLabel),
      dossierItem("驻地", selected.value.stationLabel),
      dossierItem("基地", selected.value.baseLabel),
      dossierItem("命令", selected.value.orderLabel)
    ]
  },
  {
    title: "兵力",
    items: [
      dossierItem("总兵力", formatMilitaryValue(selected.value.troops)),
      dossierItem("主兵种", selected.value.dominantUnitLabel),
      dossierItem("驻扎适宜", `${Math.round(selected.value.suitabilityScore * 100)}%`),
      dossierItem("移动速度", formatNumber(selected.value.movementSpeed))
    ]
  },
  {
    title: "背景",
    items: [
      dossierItem("文明", selected.value.civilizationLabel),
      dossierItem("外交压力", `x${formatNumber(selected.value.diplomacyPressure)}`),
      dossierItem("资源压力", `x${formatNumber(selected.value.resourcePressure)}`),
      dossierItem("战争原因", selected.value.warCauseLabel || "无")
    ]
  },
  {
    title: "档案",
    items: [
      dossierItem("战报链", selected.value.campaignLabel),
      dossierItem("链路摘要", selected.value.campaignSummaryLabel),
      dossierItem("最近记录", selectedLatestBattleEventLabel.value),
      dossierItem("记录数", formatNumber(selectedBattleEventTotal.value))
    ]
  }
] : []);

const detailRows = computed(() => selected.value ? [
  {label: "国家", value: selected.value.stateName},
  {label: "军团", value: selected.value.name},
  {label: "态势", value: selected.value.statusLabel},
  {label: "命令", value: selected.value.orderLabel},
  {label: "兵力", value: formatMilitaryValue(selected.value.troops)},
  {label: "兵种", value: selected.value.unitSummary},
  {label: "主兵种", value: selected.value.dominantUnitLabel},
  {label: "驻地", value: selected.value.stationLabel},
  {label: "基地", value: selected.value.baseLabel},
  {label: "战报记录", value: selectedLatestBattleEventLabel.value},
  {label: "驻扎适宜度", value: `${Math.round(selected.value.suitabilityScore * 100)}%`},
  {label: "移动速度", value: formatNumber(selected.value.movementSpeed)},
  {label: "文明", value: selected.value.civilizationLabel},
  {label: "外交压力", value: formatNumber(selected.value.diplomacyPressure)},
  {label: "资源压力", value: formatNumber(selected.value.resourcePressure)},
  {label: "战报链", value: selected.value.campaignLabel},
  {label: "链路摘要", value: selected.value.campaignSummaryLabel},
  {label: "战争原因", value: selected.value.warCauseLabel || "无"}
] : []);
const stationDestinationOptions = computed(() => buildStationDestinationOptions(props.state.map, selected.value, selectedState.value?.state));
const selectedStationDestination = computed(() => stationDestinationOptions.value.find(option => String(option.value) === String(stationDestinationDraft.value)) || null);

watch(() => selectedState.value?.id, syncRatioDraft, {immediate: true});
watch(() => props.state.version, syncRatioDraft);
watch(() => selected.value?.id, syncStatusDraft, {immediate: true});
watch(() => selected.value?.id, id => {
  activeAction.value = null;
  if (!sameObjectId(renameRequestId.value, id)) return;
  renameRequestId.value = null;
  nextTick(() => {
    activeAction.value = "rename";
  });
});
watch(() => selected.value?.status, syncStatusDraft);
watch(() => selected.value?.id, syncStationDestinationDraft, {immediate: true});
watch(() => stationDestinationOptions.value.map(option => option.value).join("|"), syncStationDestinationDraft);
watch(() => `${selected.value?.id || ""}|${selectedBattleChainOptions.value.map(option => option.value).join("|")}`, syncBattleChainFilter, {immediate: true});
watch(() => `${selected.value?.id || ""}|${battleEventRecordChainOptions.value.map(option => option.value).join("|")}`, syncBattleEventChainDraft, {immediate: true});
watch(() => `${selected.value?.id || ""}|${eventChainFilter.value}|${eventTypeFilter.value}|${eventOutcomeFilter.value}|${eventApplyFilter.value}`, () => {
  showAllSelectedBattleEvents.value = false;
});
watch(visibleRows, nextRows => {
  const visibleIds = new Set(nextRows.map(row => String(row.id)));
  selectedRegimentIds.value = selectedRegimentIds.value.filter(id => visibleIds.has(String(id)));
});

function buildMilitaryMetrics(map) {
  const states = stateRows(map);
  const campaigns = militaryCampaigns(map);
  const rows = states.flatMap(state => (state.state.military || []).map(regiment => {
    const id = regiment.id ?? `${state.id}:${regiment.i}`;
    const policy = state.state.militaryPolicy || {};
    const stateCampaigns = campaignsForState(campaigns, state.id);
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
      campaigns: stateCampaigns,
      campaignLabel: campaignLabelForState(stateCampaigns),
      campaignSummaryLabel: campaignSummaryLabelForState(stateCampaigns),
      warCauseLabel: firstWarCause(state.state)
    };
  }));

  return {
    states,
    rows,
    troops: rows.reduce((sum, row) => sum + row.troops, 0),
    fleets: rows.filter(row => row.type === "fleet").length,
    campaigns: map?.military?.metadata?.campaigns || campaigns.length,
    fronts: map?.military?.metadata?.fronts || map?.military?.fronts?.length || 0
  };
}

function militaryCampaigns(map) {
  return Array.isArray(map?.military?.campaigns) ? map.military.campaigns : [];
}

function campaignsForState(campaigns = [], stateId) {
  const id = Number(stateId);
  return campaigns.filter(campaign => Number(campaign.attacker) === id || Number(campaign.defender) === id);
}

function campaignLabelForState(campaigns = []) {
  if (!campaigns.length) return "无";
  if (campaigns.length === 1) {
    const campaign = campaigns[0];
    const opponent = campaign.attackerName && campaign.defenderName ? `${campaign.attackerName} / ${campaign.defenderName}` : campaign.name;
    return `${campaign.name || "战役"}（${opponent}）`;
  }
  return `${formatNumber(campaigns.length)} 场`;
}

function campaignSummaryLabelForState(campaigns = []) {
  if (!campaigns.length) return "无";
  const events = campaigns.reduce((sum, campaign) => sum + Number(campaign.events || 0), 0);
  const phaseLabel = campaignPhaseLabelForState(campaigns);
  const progress = campaigns.reduce((sum, campaign) => sum + Number(campaign.progress || 0), 0);
  const progressLabel = campaigns.length === 1 ? campaigns[0].progressLabel || `${formatNumber(progress)}%` : `均值 ${formatNumber(progress / Math.max(1, campaigns.length))}%`;
  if (!events) return `${phaseLabel} / ${progressLabel}`;
  const applied = campaigns.reduce((sum, campaign) => sum + Number(campaign.appliedEvents || 0), 0);
  const casualties = campaigns.reduce((sum, campaign) => sum + Number(campaign.casualties || 0), 0);
  const attackerCasualties = campaigns.reduce((sum, campaign) => sum + Number(campaign.attackerCasualties || 0), 0);
  const defenderCasualties = campaigns.reduce((sum, campaign) => sum + Number(campaign.defenderCasualties || 0), 0);
  const momentum = campaignMomentumLabelForState(campaigns);
  const parts = [phaseLabel, progressLabel, momentum, `记录 ${formatNumber(events)}`, `已结算 ${formatNumber(applied)}`];
  if (attackerCasualties) parts.push(`攻方损耗 ${formatMilitaryValue(attackerCasualties)}`);
  if (defenderCasualties) parts.push(`守方损耗 ${formatMilitaryValue(defenderCasualties)}`);
  if (!attackerCasualties && !defenderCasualties && casualties) parts.push(`损耗 ${formatMilitaryValue(casualties)}`);
  return parts.join(" / ");
}

function campaignPhaseLabelForState(campaigns = []) {
  if (!campaigns.length) return "无战役";
  if (campaigns.length === 1) return campaigns[0].phaseLabel || "动员对峙";
  const active = campaigns.filter(campaign => Number(campaign.events || 0) > 0).length;
  return active ? `${formatNumber(active)} 场有战报` : `${formatNumber(campaigns.length)} 场待战`;
}

function campaignMomentumLabelForState(campaigns = []) {
  if (!campaigns.length) return "均势";
  if (campaigns.length === 1) return campaigns[0].momentumLabel || "均势";
  const counts = campaigns.reduce((map, campaign) => {
    const label = campaign.momentumLabel || "均势";
    map.set(label, Number(map.get(label) || 0) + 1);
    return map;
  }, new Map());
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "均势";
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
  return [...rows].sort((a, b) => compareRowsByKey(a, b, key, direction));
}

function handleEmptyAction(key) {
  if (key === "clear-filter") props.callbacks.onFilter?.("");
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

function setBattleEventChainDraft(value) {
  battleEventDraft.chainKey = value;
}

function setEventChainFilter(value) {
  eventChainFilter.value = value;
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
    ...battleEventRecordChainPayload(selectedBattleEventRecordChain.value),
    type: battleEventDraft.type,
    outcome: battleEventDraft.outcome,
    description,
    applyResult: battleEventDraft.applyResult
  });
  battleEventDraft.description = "";
  activeAction.value = null;
}

function clearSelectedBattleEvents() {
  if (!selected.value || !selectedBattleEventTotal.value) return;
  props.callbacks.onBattleEventsClear?.(militaryTarget(selected.value));
}

function clearFilteredBattleEvents() {
  if (!selected.value || !selectedFilteredBattleEvents.value.length) return;
  const eventIds = selectedFilteredBattleEvents.value.map(event => event.id).filter(Boolean);
  if (!eventIds.length) return;
  props.callbacks.onBattleEventsClear?.(militaryTarget(selected.value), eventIds);
}

function toggleBattleEventDisplay() {
  if (!selectedBattleEventsCanExpand.value) return;
  showAllSelectedBattleEvents.value = !showAllSelectedBattleEvents.value;
}

function clearBattleEventDescription() {
  battleEventDraft.description = "";
}

function syncBattleChainFilter() {
  if (selectedBattleChainOptions.value.some(option => option.value === eventChainFilter.value)) return;
  eventChainFilter.value = "all";
}

function syncBattleEventChainDraft() {
  if (battleEventRecordChainOptions.value.some(option => option.value === battleEventDraft.chainKey)) return;
  battleEventDraft.chainKey = battleEventRecordChainOptions.value[0]?.value || "";
}

function applyRename(name) {
  if (!selected.value) return;
  props.callbacks.onRename?.(militaryTarget(selected.value), name);
  activeAction.value = null;
}

function openRenameEditor(row) {
  renameRequestId.value = row?.id ?? null;
  props.callbacks.onSelect?.(row);
  nextTick(() => {
    if (!sameObjectId(selected.value?.id, row?.id)) return;
    renameRequestId.value = null;
    activeAction.value = "rename";
  });
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
      return value > 0 ? `${unit.label}${formatMilitaryValue(value)}` : "";
    })
    .filter(Boolean)
    .join(" / ") || "无";
}

function overviewMilitaryIcon(regiment) {
  const variant = regiment?.iconVariant || regiment?.icon || regiment?.dominantUnit || "infantry";
  return militaryOverviewIcons[variant] || militaryOverviewIcons[regiment?.dominantUnit] || "◆";
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

function buildBattleEventRecordChainOptions(map, state, regiment) {
  if (!state?.i || !regiment) return [];
  const campaignOptions = (state.campaigns || [])
    .map(campaign => battleCampaignRecordOption(map, state, campaign))
    .filter(Boolean);
  const localKey = `regiment:${state.i}:${regiment.regimentId}:local`;
  return [
    ...campaignOptions,
    {
      value: localKey,
      label: "本地战报",
      chainKey: localKey,
      chainLabel: "本地战报",
      chainSide: "local",
      chainSideLabel: "本地",
      opponentStateId: null,
      opponentStateName: "",
      attackerStateId: null,
      attackerStateName: "",
      defenderStateId: null,
      defenderStateName: ""
    }
  ];
}

function battleCampaignRecordOption(map, state, campaign = {}) {
  if (!campaign || (!campaign.attacker && !campaign.defender && !campaign.name)) return null;
  const attacker = map?.pack?.states?.[campaign.attacker] || map?.politics?.states?.[campaign.attacker];
  const defender = map?.pack?.states?.[campaign.defender] || map?.politics?.states?.[campaign.defender];
  const side = Number(state.i) === Number(campaign.attacker) ? "attacker" : Number(state.i) === Number(campaign.defender) ? "defender" : "participant";
  const opponent = side === "attacker" ? defender : side === "defender" ? attacker : null;
  const key = campaign.id ?? campaign.i ?? campaign.key ?? `${campaign.attacker}:${campaign.defender}:${campaign.start || ""}:${campaign.cause || campaign.causeLabel || campaign.name || "campaign"}`;
  const chainLabel = campaign.name || campaign.label || campaign.causeLabel || campaign.cause || "战争战报";
  const chainSideLabel = battleChainSideLabel(side);
  const opponentStateName = stateDisplayName(opponent);
  const label = opponentStateName ? `${chainLabel} / ${chainSideLabel} / 对手 ${opponentStateName}` : `${chainLabel} / ${chainSideLabel}`;
  return {
    value: `campaign:${slugText(key)}`,
    label,
    chainKey: `campaign:${slugText(key)}`,
    chainLabel,
    chainSide: side,
    chainSideLabel,
    opponentStateId: opponent?.i ?? null,
    opponentStateName,
    attackerStateId: attacker?.i ?? campaign.attacker ?? null,
    attackerStateName: stateDisplayName(attacker),
    defenderStateId: defender?.i ?? campaign.defender ?? null,
    defenderStateName: stateDisplayName(defender)
  };
}

function battleEventRecordChainPayload(option) {
  if (!option) return {};
  return {
    chainKey: option.chainKey,
    chainLabel: option.chainLabel,
    chainSide: option.chainSide,
    chainSideLabel: option.chainSideLabel,
    opponentStateId: option.opponentStateId,
    opponentStateName: option.opponentStateName,
    attackerStateId: option.attackerStateId,
    attackerStateName: option.attackerStateName,
    defenderStateId: option.defenderStateId,
    defenderStateName: option.defenderStateName
  };
}

function stateDisplayName(state) {
  return state?.fullName || state?.name || (state?.i ? `国家 #${state.i}` : "");
}

function slugText(value) {
  return String(value || "chain").trim().replace(/\s+/g, "-").replace(/[^\w\u4e00-\u9fa5:-]/g, "").slice(0, 48) || "chain";
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

function latestBattleEventLabel(events = [], emptyLabel = "无") {
  const event = latestBattleEvent(events);
  if (!event) return emptyLabel;
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
  if (!byId.has(key)) byId.set(key, normalizeBattleEventForPanel(event));
}

function eventsForRegiment(events = [], regiment) {
  if (!regiment) return [];
  return events
    .filter(event => eventBelongsToRegiment(event, regiment));
}

function eventsForRegiments(events = [], regiments = []) {
  if (!regiments.length) return [];
  return events.filter(event => regiments.some(regiment => eventBelongsToRegiment(event, regiment)));
}

function filterBattleEvents(events = [], chainKey = "all", type = "all", outcome = "all", applyStatus = "all") {
  return events.filter(event =>
    (chainKey === "all" || event.chainKey === chainKey)
    && (type === "all" || event.type === type)
    && (outcome === "all" || event.outcome === outcome)
    && (applyStatus === "all" || (applyStatus === "applied" ? Boolean(event.resultApplied) : !event.resultApplied))
  );
}

function normalizeBattleEventForPanel(event) {
  const chainKey = String(event.chainKey || event.chainId || event.campaignKey || `regiment:${event.stateId || "unknown"}:${event.regimentId || "unknown"}:local`);
  return {
    ...event,
    chainKey,
    chainLabel: event.chainLabel || event.campaignLabel || event.chainName || "本地战报",
    chainSide: event.chainSide || event.side || "local",
    chainSideLabel: event.chainSideLabel || event.sideLabel || battleChainSideLabel(event.chainSide || event.side || "local"),
    opponentStateId: event.opponentStateId ?? event.opponentId ?? null,
    opponentStateName: event.opponentStateName || event.opponentName || "",
    attackerStateId: event.attackerStateId ?? event.attacker ?? null,
    attackerStateName: event.attackerStateName || event.attackerName || "",
    defenderStateId: event.defenderStateId ?? event.defender ?? null,
    defenderStateName: event.defenderStateName || event.defenderName || ""
  };
}

function battleEventChainFilterOptions(events = []) {
  const chains = summarizeBattleEventChains(events);
  return [
    {value: "all", label: "全部链路"},
    ...chains.map(chain => ({
      value: chain.key,
      label: `${chain.label}（${formatNumber(chain.count)}）`
    }))
  ];
}

function latestBattleEvents(events = [], limit = 5) {
  return newestFirstBattleEvents(events).slice(0, limit);
}

function newestFirstBattleEvents(events = []) {
  return [...events].reverse();
}

function buildBattleEventChainSummary(events = []) {
  const appliedEvents = events.filter(event => event?.resultApplied);
  const pendingEvents = events.filter(event => !event?.resultApplied);
  const chains = summarizeBattleEventChains(events);
  const casualties = appliedEvents.reduce((sum, event) => sum + battleEventCasualties(event), 0);
  const sideCasualties = summarizeBattleEventSideCasualties(appliedEvents);
  const latest = events.at(-1);
  return {
    total: events.length,
    chainCount: chains.length,
    chains,
    applied: appliedEvents.length,
    pending: pendingEvents.length,
    casualties,
    sideCasualties,
    attackerCasualties: sideCasualties.attacker,
    defenderCasualties: sideCasualties.defender,
    participantCasualties: sideCasualties.participant,
    localCasualties: sideCasualties.local,
    manualCasualties: sideCasualties.manual,
    latest: latest ? {
      id: latest.id || "",
      sequence: latest.sequence || null,
      type: latest.type || "",
      typeLabel: latest.typeLabel || latest.type || "事件",
      outcome: latest.outcome || "",
      outcomeLabel: latest.outcomeLabel || latest.outcome || "结果",
      at: latest.at || ""
    } : null,
    chainLabel: chains.length === 1 ? chains[0].label : `${formatNumber(chains.length)} 条`,
    totalLabel: `${formatNumber(events.length)} 条`,
    appliedLabel: appliedEvents.length ? `${formatNumber(appliedEvents.length)} 条` : "无",
    pendingLabel: pendingEvents.length ? `${formatNumber(pendingEvents.length)} 条` : "无",
    casualtyLabel: casualties ? formatMilitaryValue(casualties) : "无",
    latestLabel: latest ? `${latest.typeLabel || latest.type || "事件"} / ${latest.outcomeLabel || latest.outcome || "结果"}` : "无"
  };
}

function summarizeBattleEventChains(events = []) {
  const chains = new Map();
  for (const event of events) {
    const key = event.chainKey || "unknown";
    if (!chains.has(key)) chains.set(key, {key, label: event.chainLabel || key || "本地战报", count: 0});
    const chain = chains.get(key);
    const casualties = event.resultApplied ? battleEventCasualties(event) : 0;
    chain.count += 1;
    chain.applied = Number(chain.applied || 0) + (event.resultApplied ? 1 : 0);
    chain.pending = Number(chain.pending || 0) + (event.resultApplied ? 0 : 1);
    chain.casualties = Number(chain.casualties || 0) + casualties;
    if (casualties) addBattleEventSideCasualties(chain, event, casualties);
    if (event.opponentStateName) chain.opponentStateName = event.opponentStateName;
    if (event.chainSideLabel) chain.chainSideLabel = event.chainSideLabel;
    chain.latest = {
      id: event.id || "",
      sequence: event.sequence || null,
      type: event.type || "",
      typeLabel: event.typeLabel || event.type || "事件",
      outcome: event.outcome || "",
      outcomeLabel: event.outcomeLabel || event.outcome || "结果",
      at: event.at || ""
    };
  }
  return [...chains.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-CN"));
}

function summarizeBattleEventSideCasualties(events = []) {
  const summary = createEmptyBattleSideCasualties();
  for (const event of events) {
    const sideCasualties = normalizeBattleSideCasualties(event?.result?.sideCasualties);
    const sideTotal = sumBattleSideCasualties(sideCasualties);
    if (sideTotal > 0) {
      for (const [side, casualties] of Object.entries(sideCasualties)) summary[side] += casualties;
      continue;
    }
    const casualties = battleEventCasualties(event);
    if (casualties) summary[normalizeBattleChainSide(event.chainSide || event.side || "local")] += casualties;
  }
  return summary;
}

function addBattleEventSideCasualties(chain, event, casualties) {
  chain.sideCasualties ||= createEmptyBattleSideCasualties();
  const sideCasualties = normalizeBattleSideCasualties(event?.result?.sideCasualties);
  const sideTotal = sumBattleSideCasualties(sideCasualties);
  if (sideTotal > 0) {
    for (const [side, value] of Object.entries(sideCasualties)) chain.sideCasualties[side] += value;
  } else {
    const side = normalizeBattleChainSide(event.chainSide || event.side || "local");
    chain.sideCasualties[side] += casualties;
  }
  chain.attackerCasualties = chain.sideCasualties.attacker;
  chain.defenderCasualties = chain.sideCasualties.defender;
  chain.participantCasualties = chain.sideCasualties.participant;
  chain.localCasualties = chain.sideCasualties.local;
  chain.manualCasualties = chain.sideCasualties.manual;
}

function createEmptyBattleSideCasualties() {
  return {attacker: 0, defender: 0, participant: 0, local: 0, manual: 0};
}

function normalizeBattleChainSide(side) {
  if (side === "attacker" || side === "defender" || side === "participant" || side === "manual") return side;
  return "local";
}

function battleEventCasualties(event) {
  const result = event?.result || {};
  const sideTotal = sumBattleSideCasualties(result.sideCasualties);
  if (sideTotal > 0) return sideTotal;
  const direct = Number(result.casualties);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const delta = Math.abs(Number(result.troopDelta || 0));
  return Number.isFinite(delta) ? delta : 0;
}

function normalizeBattleSideCasualties(sideCasualties = {}) {
  const result = createEmptyBattleSideCasualties();
  for (const side of Object.keys(result)) {
    const value = Number(sideCasualties?.[side] || 0);
    result[side] = Number.isFinite(value) && value > 0 ? value : 0;
  }
  return result;
}

function sumBattleSideCasualties(sideCasualties = {}) {
  return Object.values(sideCasualties || {}).reduce((sum, value) => sum + Math.max(0, Number(value || 0)), 0);
}

function battleEventRowsForExport(scope) {
  if (scope === "filtered") return selectedFilteredBattleEvents.value;
  if (scope === "selected") return selectedBattleEventRows.value;
  return allBattleEvents.value;
}

function battleEventExportScopeLabel(scope) {
  return battleEventExportScopeOptions.find(option => option.value === scope)?.label || "全部记录";
}

function battleEventExportFilters() {
  return {
    chainKey: eventChainFilter.value,
    chainLabel: selectOptionLabel(selectedBattleChainOptions.value, eventChainFilter.value),
    type: eventTypeFilter.value,
    typeLabel: selectOptionLabel(battleEventFilterTypeOptions, eventTypeFilter.value),
    outcome: eventOutcomeFilter.value,
    outcomeLabel: selectOptionLabel(battleEventFilterOutcomeOptions, eventOutcomeFilter.value),
    applyStatus: eventApplyFilter.value,
    applyStatusLabel: selectOptionLabel(battleEventApplyFilterOptions, eventApplyFilter.value)
  };
}

function selectOptionLabel(options, value) {
  return options.find(option => String(option.value) === String(value))?.label || String(value || "");
}

function battleEventExportScopeSuffix(scope) {
  if (scope === "filtered") return "filtered";
  if (scope === "selected") return "selected";
  return "all";
}

function countEventsForRegiment(events = [], regiment) {
  if (!regiment) return 0;
  return events.filter(event => eventBelongsToRegiment(event, regiment)).length;
}

function eventBelongsToRegiment(event, regiment) {
  if ((event.affectedRegiments || []).some(item =>
    item?.regimentObjectId === regiment.id
    || (Number(item?.stateId) === regiment.stateId && Number(item?.regimentId) === regiment.regimentId)
  )) return true;
  return event.regimentObjectId === regiment.id || (Number(event.stateId) === regiment.stateId && Number(event.regimentId) === regiment.regimentId);
}

function formatEventDate(value) {
  if (!value) return "未记录时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", {month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"});
}

function battleEventSequenceLabel(event) {
  const sequence = Number(event?.sequence);
  return Number.isFinite(sequence) && sequence > 0 ? `序号 #${formatNumber(sequence)}` : "序号未编号";
}

function battleEventChainLabel(event) {
  return event?.chainLabel || event?.chainKey || "本地战报";
}

function battleChainSideSummary(chain = {}) {
  const side = chain.chainSideLabel || "本地";
  return chain.opponentStateName ? `${side} / 对手 ${chain.opponentStateName}` : side;
}

function battleChainCountSummary(chain = {}) {
  const parts = [`记录 ${formatNumber(chain.count || 0)}`];
  if (chain.applied) parts.push(`已结算 ${formatNumber(chain.applied)}`);
  if (chain.pending) parts.push(`未结算 ${formatNumber(chain.pending)}`);
  const sideLossParts = battleChainSideLossParts(chain);
  parts.push(...sideLossParts);
  if (chain.casualties && !sideLossParts.length) parts.push(`损耗 ${formatMilitaryValue(chain.casualties)}`);
  return parts.join(" / ");
}

function battleChainSideLossParts(chain = {}) {
  const parts = [];
  if (chain.attackerCasualties) parts.push(`攻方损耗 ${formatMilitaryValue(chain.attackerCasualties)}`);
  if (chain.defenderCasualties) parts.push(`守方损耗 ${formatMilitaryValue(chain.defenderCasualties)}`);
  if (chain.participantCasualties) parts.push(`参战损耗 ${formatMilitaryValue(chain.participantCasualties)}`);
  if (chain.localCasualties) parts.push(`本地损耗 ${formatMilitaryValue(chain.localCasualties)}`);
  if (chain.manualCasualties) parts.push(`手动损耗 ${formatMilitaryValue(chain.manualCasualties)}`);
  return parts;
}

function battleEventCampaignSideLabel(event) {
  const side = event?.chainSideLabel || battleChainSideLabel(event?.chainSide || "local");
  return event?.opponentStateName ? `${side} / 对手 ${event.opponentStateName}` : side;
}

function battleChainSideLabel(side) {
  if (side === "attacker") return "进攻方";
  if (side === "defender") return "防守方";
  if (side === "participant") return "参战方";
  if (side === "manual") return "手动";
  return "本地";
}

function battleEventAppliedLabel(event) {
  return event?.resultApplied ? "已结算" : "未结算";
}

function battleEventAppliedClass(event) {
  return event?.resultApplied ? "applied" : "pending";
}

function battleEventLossLabel(event) {
  if (!event?.resultApplied) return "损耗未计入";
  const casualties = battleEventCasualties(event);
  return casualties ? `损耗 ${formatMilitaryValue(casualties)}` : "无兵力损耗";
}

function battleResultSummary(event) {
  const result = event?.result || {};
  if (result.summary) {
    const unitLoss = result.unitLossSummary && result.unitLossSummary !== "无兵种损耗" ? `；${result.unitLossSummary}` : "";
    return `${result.summary}${unitLoss}`;
  }
  const before = formatMilitaryValue(result.troopBefore || 0);
  const after = formatMilitaryValue(result.troopAfter || 0);
  const casualties = formatMilitaryValue(result.casualties || Math.abs(result.troopDelta || 0));
  const status = result.statusAfterLabel || result.statusAfter || "未知态势";
  return `已结算：${before} -> ${after}，损耗 ${casualties}，${status}`;
}

function battlePreviewCasualties(troops, lossRate) {
  if (troops <= 1 || lossRate <= 0) return 0;
  return Math.min(troops - 1, Math.max(1, Math.round(troops * lossRate)));
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

function dossierItem(label, value) {
  return {label, value: value || "无"};
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
        valueLabel: formatMilitaryValue(value),
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

function formatMilitaryValue(value) {
  return formatMilitary(value, unitPreferences.value);
}

function militaryExportSummary(seed, map, rows, events, {selectedOnly = false} = {}) {
  const eventSummary = buildBattleEventChainSummary(events);
  return {
    seed,
    exportMode: selectedOnly ? "selected-regiments" : "current-filter",
    exportedAt: new Date().toISOString(),
    filters: {
      state: selectedStateFilterLabel.value,
      status: selectedStatusFilterLabel.value,
      text: props.state.filter || "",
      sort: props.state.sortKey,
      direction: props.state.sortDir
    },
    totals: {
      states: metrics.value.states.length,
      allRegiments: metrics.value.rows.length,
      exportedRegiments: rows.length,
      troops: rows.reduce((sum, row) => sum + Number(row.troops || 0), 0),
      fleets: rows.filter(row => row.type === "fleet").length,
      campaigns: map?.military?.metadata?.campaigns || militaryCampaigns(map).length,
      fronts: map?.military?.metadata?.fronts || map?.military?.fronts?.length || 0,
      battleEvents: events.length,
      battleEventChains: eventSummary.chainCount,
      appliedBattleEvents: eventSummary.applied,
      pendingBattleEvents: eventSummary.pending,
      casualties: eventSummary.casualties
    }
  };
}

function militaryStateSummaries(rows) {
  const byState = new Map();
  for (const row of rows) {
    const summary = byState.get(row.stateId) || {
      stateId: row.stateId,
      stateName: row.stateName,
      regiments: 0,
      troops: 0,
      fleets: 0,
      landRegiments: 0,
      campaigns: row.campaignLabel || "无",
      latestBattleEvent: "无",
      statuses: new Map(),
      dominantUnits: new Map()
    };
    summary.regiments++;
    summary.troops += Number(row.troops || 0);
    if (row.type === "fleet") summary.fleets++;
    else summary.landRegiments++;
    incrementCount(summary.statuses, row.statusLabel || "未知");
    incrementCount(summary.dominantUnits, row.dominantUnitLabel || "未知");
    if (row.latestEventLabel && row.latestEventLabel !== "无") summary.latestBattleEvent = row.latestEventLabel;
    byState.set(row.stateId, summary);
  }
  return [...byState.values()]
    .sort((a, b) => b.troops - a.troops || a.stateName.localeCompare(b.stateName, "zh-CN"))
    .map(summary => ({
      ...summary,
      statuses: countMapLabel(summary.statuses),
      dominantUnits: countMapLabel(summary.dominantUnits)
    }));
}

function militaryRegimentExportRows(rows) {
  return rows.map(row => ({
    id: row.id,
    stateId: row.stateId,
    stateName: row.stateName,
    regimentId: row.regimentId,
    name: row.name,
    type: row.type || "",
    status: row.status || "",
    statusLabel: row.statusLabel,
    order: row.orderLabel,
    dominantUnit: row.dominantUnit || "",
    dominantUnitLabel: row.dominantUnitLabel,
    troops: row.troops,
    units: row.units,
    unitSummary: row.unitSummary,
    station: row.stationLabel,
    stationCell: row.cell,
    base: row.baseLabel,
    baseCell: row.baseCell,
    suitabilityScore: row.suitabilityScore,
    movementSpeed: row.movementSpeed,
    civilization: row.civilizationLabel,
    diplomacyPressure: row.diplomacyPressure,
    resourcePressure: row.resourcePressure,
    campaign: row.campaignLabel,
    campaignSummary: row.campaignSummaryLabel,
    warCause: row.warCauseLabel || "无",
    battleEvents: row.eventCount,
    latestBattleEvent: row.latestEventLabel
  }));
}

function militaryCampaignExportRows(map) {
  return militaryCampaigns(map).map(campaign => ({
    id: campaign.id || campaign.key || "",
    name: campaign.name || "战役",
    attacker: campaign.attackerName || campaign.attacker || "",
    defender: campaign.defenderName || campaign.defender || "",
    cause: campaign.causeLabel || campaign.cause || "",
    phase: campaign.phaseLabel || "",
    momentum: campaign.momentumLabel || "",
    progress: campaign.progressLabel || campaign.progress || "",
    events: Number(campaign.events || 0),
    appliedEvents: Number(campaign.appliedEvents || 0),
    pendingEvents: Math.max(0, Number(campaign.events || 0) - Number(campaign.appliedEvents || 0)),
    casualties: Number(campaign.casualties || 0),
    attackerCasualties: Number(campaign.attackerCasualties || 0),
    defenderCasualties: Number(campaign.defenderCasualties || 0),
    attackerTroops: Number(campaign.attackerTroops || 0),
    defenderTroops: Number(campaign.defenderTroops || 0),
    fronts: Array.isArray(campaign.fronts) ? campaign.fronts.length : 0
  }));
}

function militaryFrontExportRows(map) {
  return (map?.military?.fronts || []).map(front => ({
    id: front.id || "",
    attacker: front.attackerName || front.attacker || front.from || "",
    defender: front.defenderName || front.defender || front.to || "",
    length: roundValue(front.length ?? front.points?.length ?? 0, 2),
    maxLength: roundValue(front.maxLength || 0, 2),
    borderSegments: Array.isArray(front.borderCellPairs) ? front.borderCellPairs.length : 0,
    points: Array.isArray(front.points) ? front.points.length : 0
  }));
}

function incrementCount(map, key) {
  map.set(key, Number(map.get(key) || 0) + 1);
}

function countMapLabel(map) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
    .map(([label, count]) => `${label} ${formatNumber(count)}`)
    .join(" / ") || "无";
}

function appendCsvSection(rows, title, records) {
  rows.push([title]);
  rows.push(...records);
  rows.push([]);
}

function exportCsv(rows = visibleRows.value, {selectedOnly = false} = {}) {
  const map = props.state.map;
  const seed = map?.metadata?.seed || "map";
  const events = selectedOnly ? eventsForRegiments(allBattleEvents.value, rows) : allBattleEvents.value;
  const summary = militaryExportSummary(seed, map, rows, events, {selectedOnly});
  const stateSummaries = militaryStateSummaries(rows);
  const regimentRows = militaryRegimentExportRows(rows);
  const csvRows = [];
  appendCsvSection(csvRows, "军事导出摘要", [
    ["字段", "值"],
    ["seed", seed],
    ["导出模式", selectedOnly ? "选中军团" : "当前筛选"],
    ["导出时间", summary.exportedAt],
    ["国家筛选", summary.filters.state],
    ["态势筛选", summary.filters.status],
    ["文本筛选", summary.filters.text],
    ["导出军团", summary.totals.exportedRegiments],
    ["总军团", summary.totals.allRegiments],
    ["导出兵力", summary.totals.troops],
    ["舰队", summary.totals.fleets],
    ["战役", summary.totals.campaigns],
    ["战线", summary.totals.fronts],
    ["战报记录", summary.totals.battleEvents],
    ["战报链", summary.totals.battleEventChains],
    ["已结算战报", summary.totals.appliedBattleEvents],
    ["未结算战报", summary.totals.pendingBattleEvents],
    ["累计损耗", summary.totals.casualties]
  ]);
  appendCsvSection(csvRows, "国家军事汇总", [
    ["国家ID", "国家", "军团", "陆军", "舰队", "兵力", "态势分布", "主兵种分布", "战役", "最近战报"],
    ...stateSummaries.map(row => [row.stateId, row.stateName, row.regiments, row.landRegiments, row.fleets, row.troops, row.statuses, row.dominantUnits, row.campaigns, row.latestBattleEvent])
  ]);
  appendCsvSection(csvRows, "军团明细", [
    ["对象ID", "国家ID", "国家", "军团ID", "军团", "类型", "态势", "命令", "主兵种", "兵力", "兵种构成", "驻地", "驻地cell", "基地", "基地cell", "适宜度", "速度", "文明", "外交压力", "资源压力", "战役", "链路摘要", "战争原因", "战报记录", "最近战报"],
    ...regimentRows.map(row => [row.id, row.stateId, row.stateName, row.regimentId, row.name, row.type, row.statusLabel, row.order, row.dominantUnitLabel, row.troops, row.unitSummary, row.station, row.stationCell, row.base, row.baseCell, row.suitabilityScore, row.movementSpeed, row.civilization, row.diplomacyPressure, row.resourcePressure, row.campaign, row.campaignSummary, row.warCause, row.battleEvents, row.latestBattleEvent])
  ]);
  appendCsvSection(csvRows, "战役摘要", [
    ["ID", "战役", "进攻方", "防守方", "原因", "阶段", "优势", "进展", "记录", "已结算", "未结算", "累计损耗", "攻方损耗", "守方损耗", "攻方兵力", "守方兵力", "战线"],
    ...militaryCampaignExportRows(map).map(row => [row.id, row.name, row.attacker, row.defender, row.cause, row.phase, row.momentum, row.progress, row.events, row.appliedEvents, row.pendingEvents, row.casualties, row.attackerCasualties, row.defenderCasualties, row.attackerTroops, row.defenderTroops, row.fronts])
  ]);
  appendCsvSection(csvRows, "战线摘要", [
    ["ID", "进攻方", "防守方", "长度", "上限", "边界段", "点数"],
    ...militaryFrontExportRows(map).map(row => [row.id, row.attacker, row.defender, row.length, row.maxLength, row.borderSegments, row.points])
  ]);
  const suffix = selectedOnly ? "-selected" : "";
  downloadText(`fmg-military-${safeFilePart(seed)}${suffix}.csv`, csvRows.map(values => values.map(csvEscape).join(",")).join("\r\n"), "text/csv;charset=utf-8");
}

function exportJson(rows = visibleRows.value, {selectedOnly = false} = {}) {
  const map = props.state.map;
  const seed = map?.metadata?.seed || "map";
  const events = selectedOnly ? eventsForRegiments(allBattleEvents.value, rows) : allBattleEvents.value;
  const eventSummary = buildBattleEventChainSummary(events);
  const payload = {
    type: "webgl-generator-military-summary",
    version: 1,
    exportMode: selectedOnly ? "selected-regiments" : "current-filter",
    seed,
    exportedAt: new Date().toISOString(),
    metadata: map?.military?.metadata || {},
    summary: militaryExportSummary(seed, map, rows, events, {selectedOnly}),
    states: militaryStateSummaries(rows),
    regiments: militaryRegimentExportRows(rows),
    campaigns: militaryCampaignExportRows(map),
    fronts: militaryFrontExportRows(map),
    battleEvents: {
      count: events.length,
      summary: eventSummary,
      events
    }
  };
  const suffix = selectedOnly ? "-selected" : "";
  downloadText(`fmg-military-${safeFilePart(seed)}${suffix}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
}

function exportBattleEvents() {
  const map = props.state.map;
  const seed = map?.metadata?.seed || "map";
  const events = exportBattleEventRows.value;
  const scope = eventExportScope.value;
  const payload = {
    seed,
    scope,
    scopeLabel: battleEventExportScopeLabel(scope),
    filters: battleEventExportFilters(),
    exportedAt: new Date().toISOString(),
    count: events.length,
    summary: buildBattleEventChainSummary(events),
    events
  };
  downloadText(`fmg-military-events-${safeFilePart(seed)}-${battleEventExportScopeSuffix(scope)}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
}

function exportBattleEventsCsv() {
  const map = props.state.map;
  const seed = map?.metadata?.seed || "map";
  const events = exportBattleEventRows.value;
  const scope = eventExportScope.value;
  const header = [
    "事件ID",
    "序号",
    "链路",
    "阵营",
    "对手",
    "时间",
    "国家",
    "军团",
    "类型",
    "结果",
    "说明",
    "已结算",
    "结算状态",
    "损耗状态",
    "结果摘要",
    "兵力前",
    "兵力后",
    "损耗",
    "态势前",
    "态势后"
  ];
  const body = events.map(event => {
    const result = event.result || {};
    return [
      event.id || "",
      event.sequence || "",
      battleEventChainLabel(event),
      event.chainSideLabel || "",
      event.opponentStateName || "",
      event.at || "",
      event.stateName || event.stateId || "",
      event.regimentName || event.regimentObjectId || event.regimentId || "",
      event.typeLabel || event.type || "",
      event.outcomeLabel || event.outcome || "",
      event.description || "",
      event.resultApplied ? "是" : "否",
      battleEventAppliedLabel(event),
      battleEventLossLabel(event),
      event.resultApplied ? battleResultSummary(event) : "",
      result.troopBefore ?? "",
      result.troopAfter ?? "",
      (result.casualties ?? Math.abs(result.troopDelta || 0)) || "",
      result.statusBeforeLabel || result.statusBefore || "",
      result.statusAfterLabel || result.statusAfter || ""
    ];
  });
  downloadText(`fmg-military-events-${safeFilePart(seed)}-${battleEventExportScopeSuffix(scope)}.csv`, [header, ...body].map(values => values.map(csvEscape).join(",")).join("\r\n"), "text/csv;charset=utf-8");
}

function handleMilitaryExport(key) {
  if (key === "csv") exportCsv();
  if (key === "json") exportJson();
  if (key === "selected-csv") exportCsv(selectedRegimentRows.value, {selectedOnly: true});
  if (key === "selected-json") exportJson(selectedRegimentRows.value, {selectedOnly: true});
}

function handleBattleEventExport(key) {
  if (key === "json") exportBattleEvents();
  if (key === "csv") exportBattleEventsCsv();
}

async function handleBattleEventImport({file}) {
  if (!file) return;
  battleEventsImportStatus.value = "正在导入战报记录...";
  const result = await props.callbacks.onBattleEventsImport?.(file);
  battleEventsImportStatus.value = result
    ? `已导入 ${formatNumber(result.imported)} 条，跳过 ${formatNumber(result.skipped)} 条`
    : "战报记录导入失败";
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
