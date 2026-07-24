<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="state-panel-summary" />

  <div class="state-panel-controls">
    <UiFilterInput :model-value="state.filter" placeholder="筛选名称 / id / 首都" @update:model-value="callbacks.onFilter" />
    <UiButton variant="secondary" :disabled="!renamableVisibleRows.length" @click="callbacks.onRenameVisibleFromNamebase?.(renamableVisibleRows.map(row => row.id))">按名称库重命名筛选</UiButton>
    <UiButton variant="danger" @click="callbacks.onRegenerate?.()">重新生成国家</UiButton>
  </div>
  <UiObjectTable
    :columns="columns"
    :column-widths="state.columnWidths"
    :rows="visibleRows"
    :sort-key="state.sortKey"
    :sort-direction="state.sortDir"
    :sort-options="sortOptions"
    sortable
    @sort="callbacks.onSort"
    :selected-id="state.targetStateId"
    :doubleClickAction="'edit'"
    empty-text="没有匹配的国家"
    :empty-action="filterEmptyAction"
    resizable-columns
    selectable-rows
    :selected-row-ids="selectedStateIds"
    @select="callbacks.onSelect"
    @locate="callbacks.onLocate"
    @edit="openRenameEditor"
    @empty-action="handleEmptyAction"
    @column-resize="callbacks.onColumnResize"
    @selection-change="selectedStateIds = $event"
  />

  <UiPanelIoActions
    class-name="state-panel-list-actions"
    label="国家列表高亮"
    :actions="stateHighlightActions"
    @action="handleHighlightAction"
  />

  <UiDetailGrid class-name="state-panel-details" empty-text="未选中国家" :rows="detailRows" />

  <UiActionDock v-model:active="activeAction" :actions="stateActions" @select="handleActionSelect">
    <template #rename>
      <UiTextEditField
        class-name="state-name-editor"
        :model-value="selected.rawName"
        :max-length="48"
        @apply="name => callbacks.onRename(selected.id, name)"
      />
    </template>

    <template #color>
      <UiColorActionPanel
        class-name="state-color-field"
        :model-value="selected.color"
        @apply="color => callbacks.onColorChange(selected.id, color)"
      />
    </template>

    <template #government>
      <div class="state-government-field">
        <UiSelectField
          label="政体"
          class-name="state-government-select"
          :model-value="governmentDraft"
          :options="governmentOptions"
          @update:model-value="governmentDraft = $event"
        />
        <UiSelectField
          label="国号后缀"
          class-name="state-government-suffix-select"
          :model-value="governmentSuffixDraft"
          :options="governmentSuffixOptions"
          @update:model-value="governmentSuffixDraft = $event"
        />
        <UiButton variant="secondary" @click="callbacks.onGovernmentChange(selected.id, governmentDraft, governmentSuffixDraft)">套用政体与国号</UiButton>
        <p class="state-government-note">{{ governmentNote }}</p>
      </div>
    </template>

    <template #capital>
      <div class="state-capital-field">
        <UiSelectField
          label="首都"
          class-name="state-capital-select"
          :model-value="capitalDraft"
          :options="capitalOptions"
          :disabled="!capitalOptions.length"
          @update:model-value="capitalDraft = Number($event)"
        />
        <UiButton variant="secondary" :disabled="!capitalOptions.length" @click="callbacks.onCapitalChange(selected.id, capitalDraft)">设为首都</UiButton>
      </div>
    </template>

    <template #note>
      <UiNoteField
        class-name="state-note-editor"
        :model-value="selected.noteBody"
        @apply="body => callbacks.onNoteChange(selected.id, body)"
        @clear="callbacks.onNoteChange(selected.id, '')"
      />
    </template>

    <template #merge>
      <div class="state-topology-editor">
        <p class="state-topology-anchor">配置基准：{{ topologySourceName }}</p>
        <UiSelectField
          label="相邻目标国"
          :model-value="mergeOtherStateId ?? ''"
          :options="mergeNeighborOptions"
          :disabled="!mergeNeighborOptions.length"
          @update:model-value="updateMergeOtherState"
        />
        <UiSelectField
          label="保留国家"
          :model-value="mergeSurvivorStateId ?? ''"
          :options="mergeSurvivorOptions"
          :disabled="mergeSurvivorOptions.length !== 2"
          @update:model-value="updateMergeSurvivorState"
        />
        <div class="state-topology-actions">
          <UiButton variant="secondary" :disabled="!canInspectMerge" @click="inspectMerge">预检合并</UiButton>
          <UiButton variant="danger" :disabled="!canSubmitTopology" @click="submitMerge">确认合并</UiButton>
        </div>
        <p v-if="topologyError" class="state-topology-error">{{ topologyError }}</p>
        <UiDetailGrid v-if="topologyPreviewRows.length" class-name="state-topology-preview" :rows="topologyPreviewRows" />
      </div>
    </template>

    <template #split>
      <div class="state-topology-editor">
        <p class="state-topology-anchor">配置基准：{{ topologySourceName }}</p>
        <fieldset class="state-topology-provinces">
          <legend>完整旧省份（可多选）</legend>
          <label v-for="province in splitProvinceOptions" :key="province.value">
            <input
              type="checkbox"
              :checked="splitProvinceIds.includes(province.value)"
              @change="toggleSplitProvince(province.value, $event.target.checked)"
            />
            <span>{{ province.label }}</span>
          </label>
        </fieldset>
        <UiSelectField
          label="新国首都"
          :model-value="splitCapitalCityId ?? ''"
          :options="splitCapitalOptions"
          :disabled="!splitCapitalOptions.length"
          @update:model-value="updateSplitCapitalCity"
        />
        <label class="state-topology-name">
          <span>新国名称（留空采用默认）</span>
          <ElInput v-model="splitNameDraft" type="text" maxlength="48" @input="invalidateTopologyPreview" />
        </label>
        <div class="state-topology-actions">
          <UiButton variant="secondary" :disabled="!canInspectSplit" @click="inspectSplit">预检拆分</UiButton>
          <UiButton variant="danger" :disabled="!canSubmitTopology" @click="submitSplit">确认拆分</UiButton>
        </div>
        <p v-if="topologyError" class="state-topology-error">{{ topologyError }}</p>
        <UiDetailGrid v-if="topologyPreviewRows.length" class-name="state-topology-preview" :rows="topologyPreviewRows" />
      </div>
    </template>
  </UiActionDock>

  <UiSelectField
    label="目标"
    class-name="state-select-field"
    :model-value="state.targetStateId ?? ''"
    :options="stateOptions"
    @update:model-value="callbacks.onTargetStateId(Number($event))"
  />

  <div class="state-sample-actions">
    <UiButton variant="secondary" @click="callbacks.onSampleSelection">取选中</UiButton>
    <UiButton variant="secondary" @click="callbacks.onSampleHover">取悬停</UiButton>
  </div>

  <UiSliderField
    label="画笔大小"
    field-class="state-range-field"
    :model-value="state.radius"
    :min="brushRadius.min"
    :max="brushRadius.max"
    :step="brushRadius.step"
    unit-label="地图单位"
    @input="callbacks.onRadius"
  />
</template>

<script setup>
import {computed, nextTick, ref, watch} from "vue";
import UiActionDock from "./base/UiActionDock.vue";
import UiButton from "./base/UiButton.vue";
import UiColorActionPanel from "./base/UiColorActionPanel.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiNoteField from "./base/UiNoteField.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiPanelIoActions from "./base/UiPanelIoActions.vue";
import UiSelectField from "./base/UiSelectField.vue";
import UiSliderField from "./base/UiSliderField.vue";
import UiTextEditField from "./base/UiTextEditField.vue";
import {formatArea, formatMilitary, formatNumber as formatDisplayNumber, formatPopulation} from "../../display-units.js";
import {findByObjectId, sameObjectId} from "../../object-id.js";
import {compareRowsByKey} from "../../sort-utils.js";
import {buildStateCapitalOptions} from "../../state-capital-options.js";
import {GOVERNMENT_OPTIONS, governmentSuffixOptions as readGovernmentSuffixOptions} from "../../../generator/governments.js";
import {readObjectNote} from "../../../runtime/object-notes.js";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";
import {useVisibleRowSelection} from "../composables/use-visible-row-selection.js";
import {BRUSH_RADIUS_ID, readBrushRadiusContract} from "../../../runtime/brush-radius-contract.js";

const brushRadius = readBrushRadiusContract(BRUSH_RADIUS_ID.STATE);

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

const RESOURCE_LABELS = Object.freeze({
  geothermal: "地热",
  ore: "矿产",
  salt: "盐",
  "rare-biota": "稀有生物",
  gems: "宝石"
});

const sortOptions = Object.freeze([
  {key: "powerScore", label: "国力"},
  {key: "economicPower", label: "经济"},
  {key: "resourcePotential", label: "资源"},
  {key: "population", label: "人口"},
  {key: "burgs", label: "城镇"},
  {key: "area", label: "面积"},
  {key: "id", label: "ID"}
]);

const columns = Object.freeze([
  {key: "id", label: "ID", align: "right"},
  {key: "name", label: "名称"},
  {key: "governmentLabel", label: "政体"},
  {key: "capitalName", label: "首都"},
  {key: "burgs", label: "城镇", align: "right", format: value => formatNumber(value)},
  {key: "population", label: "人口", align: "right", format: value => formatPopulationValue(value)},
  {key: "economicPower", label: "经济", align: "right", format: value => formatNumber(value)},
  {key: "resourcePotential", label: "资源", align: "right", format: value => formatNumber(value)}
]);

const unitPreferences = useUnitPreferences();
const activeAction = ref(null);
const renameRequestId = ref(null);
const capitalDraft = ref(0);
const governmentDraft = ref("monarchy");
const governmentSuffixDraft = ref("王国");
const topologySourceStateId = ref(null);
const mergeOtherStateId = ref(null);
const mergeSurvivorStateId = ref(null);
const splitProvinceIds = ref([]);
const splitCapitalCityId = ref(null);
const splitNameDraft = ref("");
const topologyInspection = ref(null);
const topologyError = ref("");
const metrics = computed(() => {
  props.state.version;
  return buildStateMetrics(props.state.map);
});
const stateOptions = computed(() => {
  props.state.version;
  return stateRows(props.state.map);
});
const visibleRows = computed(() => sortRows(filterRows(metrics.value.rows, props.state.filter), props.state.sortKey, props.state.sortDir));
const {selectedRowIds: selectedStateIds, selectedRows: selectedStateRows} = useVisibleRowSelection(visibleRows);
const highlightableStateRows = computed(() => selectedStateRows.value.filter(row => !row.neutral && Number(row.id) > 0));
const filterEmptyAction = computed(() => String(props.state.filter || "").trim()
  ? {key: "clear-filter", label: "清空筛选", icon: "⌫"}
  : null);
const renamableVisibleRows = computed(() => visibleRows.value.filter(row => !row.neutral));
const selected = computed(() => findByObjectId(metrics.value.rows, props.state.targetStateId));
const canDeleteSelected = computed(() => Boolean(selected.value && !selected.value.neutral));
const editActive = computed(() => Boolean(selected.value && props.state.active && selected.value.id === props.state.targetStateId));
const modalActionActive = computed(() => Boolean(props.state.addMode || props.state.deleteMode));
const capitalOptions = computed(() => buildStateCapitalOptions(props.state.map, selected.value?.id));
const governmentOptions = computed(() => GOVERNMENT_OPTIONS.map(option => ({
  value: option.value,
  label: `${option.label} / ${option.category}`
})));
const governmentSuffixOptions = computed(() => readGovernmentSuffixOptions(governmentDraft.value).map(value => ({value, label: value})));
const governmentNote = computed(() => selected.value?.governmentEffectSummary || "政体影响税收、外交倾向和军事动员；国号后缀可在当前政体允许范围内独立选择。");
const topologySourceName = computed(() => formatStateName(props.state.map, topologySourceStateId.value));
const mergeNeighborOptions = computed(() => activeStateNeighbors(props.state.map, topologySourceStateId.value));
const mergeSurvivorOptions = computed(() => [topologySourceStateId.value, mergeOtherStateId.value]
  .filter((id, index, values) => Number.isInteger(id) && id > 0 && values.indexOf(id) === index)
  .map(id => ({value: id, label: formatStateName(props.state.map, id)})));
const splitProvinceOptions = computed(() => stateProvinces(props.state.map, topologySourceStateId.value));
const splitCapitalOptions = computed(() => stateCities(props.state.map, topologySourceStateId.value)
  .filter(city => splitProvinceIds.value.includes(Number(city.province)))
  .map(city => ({value: city.id, label: `${city.name || `城市 #${city.id}`}（省 #${city.province}）`})));
const canInspectMerge = computed(() => mergeSurvivorOptions.value.length === 2 && mergeSurvivorOptions.value.some(option => option.value === mergeSurvivorStateId.value));
const canInspectSplit = computed(() => splitProvinceIds.value.length > 0 && Number.isInteger(splitCapitalCityId.value));
const canSubmitTopology = computed(() => Boolean(topologyInspection.value?.valid));
const topologyPreviewRows = computed(() => topologyInspection.value?.preview?.rows || []);
const stateActions = computed(() => [
  {key: "add", label: props.state.addMode ? "取消新增国家" : "新增国家：下一次点击地图 cell 作为首都", icon: "+", panel: false, active: props.state.addMode, disabled: props.state.deleteMode || editActive.value},
  {key: "delete", label: props.state.deleteMode ? "取消删除国家" : "删除国家：下一次点击地图国家", icon: "×", panel: false, active: props.state.deleteMode, disabled: props.state.addMode || editActive.value},
  {key: "edit", label: editActive.value ? "退出国家编辑" : "进入国家编辑", icon: "◎", panel: false, disabled: modalActionActive.value || !canDeleteSelected.value, active: editActive.value},
  {key: "rename", label: "重命名", icon: "✎", disabled: modalActionActive.value || !canDeleteSelected.value},
  {key: "color", label: "调整颜色", icon: "◐", disabled: modalActionActive.value || !canDeleteSelected.value},
  {key: "government", label: "调整政体", icon: "⚖", panelWidth: 620, disabled: modalActionActive.value || !canDeleteSelected.value},
  {key: "capital", label: "设置首都", icon: "♛", disabled: modalActionActive.value || !canDeleteSelected.value || !capitalOptions.value.length},
  {key: "note", label: "编辑备注", icon: "☰", disabled: modalActionActive.value || !canDeleteSelected.value},
  {key: "merge", label: "合并相邻国家", icon: "⇄", panelWidth: 380, panelHeight: 390, disabled: modalActionActive.value || !canDeleteSelected.value || !activeStateNeighbors(props.state.map, selected.value?.id).length},
  {key: "split", label: "按完整省份拆分国家", icon: "⑂", panelWidth: 420, panelHeight: 560, disabled: modalActionActive.value || !canDeleteSelected.value || stateProvinces(props.state.map, selected.value?.id).length < 2}
]);
const stateHighlightActions = computed(() => [
  {key: "highlight-selected", label: `高亮选中 ${formatNumber(highlightableStateRows.value.length)}`, icon: "◉", disabled: !highlightableStateRows.value.length},
  {key: "clear-highlights", label: `清除高亮 ${formatNumber(props.state.highlightCount || 0)}`, icon: "○", disabled: !props.state.highlightCount}
]);

const summaryMetrics = computed(() => [
  {label: "状态", value: props.state.active ? "编辑中" : "未启用"},
  {label: "新增", value: props.state.addMode ? "等待点击" : "关闭"},
  {label: "删除", value: props.state.deleteMode ? "等待点击" : "关闭"},
  {label: "国家", value: formatNumber(metrics.value.total)},
  {label: "国力", value: formatNumber(metrics.value.powerScore)},
  {label: "资源", value: formatNumber(metrics.value.resourcePotential)},
  {label: "筛选", value: formatNumber(visibleRows.value.length)},
  {label: "高亮", value: formatNumber(props.state.highlightCount || 0)},
  {label: "目标国家", value: formatStateName(props.state.map, props.state.targetStateId)},
  {label: "影响", value: formatNumber(props.state.lastAffected)}
]);

const detailRows = computed(() => selected.value ? [
  {label: "全称", value: selected.value.fullName},
  {label: "政体", value: selected.value.governmentLabel},
  {label: "国号后缀", value: selected.value.formName},
  {label: "政体影响", value: selected.value.governmentEffectSummary},
  {label: "首都", value: selected.value.capitalName},
  {label: "文化", value: selected.value.culture},
  {label: "宗教", value: selected.value.religion},
  {label: "中心 cell", value: selected.value.centerCell, debug: true},
  {label: "面积", value: formatAreaValue(selected.value.area)},
  {label: "城镇", value: formatNumber(selected.value.burgs)},
  {label: "人口", value: formatPopulationValue(selected.value.population)},
  {label: "国力评分", value: formatNumber(selected.value.powerScore)},
  {label: "经济力", value: formatNumber(selected.value.economicPower)},
  {label: "资源潜力", value: formatNumber(selected.value.resourcePotential)},
  {label: "资源类型", value: selected.value.resourceSummary},
  {label: "军力", value: formatMilitaryValue(selected.value.militaryPower)},
  {label: "外交", value: selected.value.diplomacySummary},
  {label: "备注", value: selected.value.noteBody ? `有备注（${formatNumber(selected.value.noteBody.length)}字）` : "无"},
  {label: "邻国", value: formatNumber(selected.value.neighborCount)}
] : []);

watch(() => selected.value?.capitalBurgId, next => {
  capitalDraft.value = Number(next) || capitalOptions.value[0]?.value || 0;
}, {immediate: true});

watch(() => [selected.value?.id, selected.value?.governmentKey, selected.value?.formName], ([, nextGovernmentKey, nextFormName]) => {
  governmentDraft.value = nextGovernmentKey || "monarchy";
  const suffixes = readGovernmentSuffixOptions(governmentDraft.value);
  governmentSuffixDraft.value = suffixes.includes(nextFormName) ? nextFormName : suffixes[0];
}, {immediate: true});

watch(governmentDraft, governmentKey => {
  const suffixes = readGovernmentSuffixOptions(governmentKey);
  if (suffixes.includes(governmentSuffixDraft.value)) return;
  governmentSuffixDraft.value = suffixes[0];
});

watch(() => props.state.map, () => {
  activeAction.value = null;
  resetTopologyDraft();
});

watch(() => selected.value?.id, id => {
  if (!topologyActionActive()) activeAction.value = null;
  if (!sameObjectId(renameRequestId.value, id) || selected.value?.neutral) return;
  renameRequestId.value = null;
  nextTick(() => {
    activeAction.value = "rename";
  });
});

function buildStateMetrics(map) {
  const rows = stateRows(map).map(row => {
    const stateItem = map?.politics?.states?.[row.id];
    const capitalCity = findCapitalCity(map, stateItem?.capital);
    const population = (stateItem?.urban || 0) + (stateItem?.rural || 0);
    const neutral = row.id === 0;
    const neutralStats = neutral ? neutralStateStats(map) : null;
    const note = readObjectNote(map, {kind: "state", id: row.id});
    return {
      id: row.id,
      neutral,
      name: neutral ? "中立" : stateItem?.fullName || stateItem?.name || row.name,
      rawName: neutral ? "中立" : stateItem?.name || row.name,
      fullName: neutral ? "中立" : stateItem?.fullName || stateItem?.name || row.name,
      formName: neutral ? "无" : stateItem?.formName || "国",
      governmentKey: neutral ? "" : stateItem?.governmentKey || "monarchy",
      governmentLabel: neutral ? "无" : stateItem?.governmentLabel || "君主制",
      governmentEffectSummary: neutral ? "无" : formatGovernmentEffects(stateItem),
      capitalName: neutral ? "无" : capitalCity?.name || "none",
      capitalBurgId: stateItem?.capital || capitalCity?.burgId || null,
      culture: neutral ? "混合" : indexedName(map?.society?.cultures, stateItem?.culture),
      religion: neutral ? "混合" : indexedName(map?.society?.religions, stateItem?.religion),
      centerCell: neutral ? "none" : stateItem?.center ?? stateItem?.gridCenter ?? "none",
      area: neutral ? neutralStats.area : stateItem?.area || stateItem?.cells || 0,
      burgs: neutral ? neutralStats.burgs : stateItem?.burgs || stateCities(map, row.id).length,
      population: neutral ? neutralStats.population : population,
      economicPower: neutral ? 0 : Number(stateItem?.economicPower || 0),
      resourcePotential: neutral ? 0 : Number(stateItem?.resourcePotential || 0),
      powerScore: neutral ? 0 : Number(stateItem?.powerScore || 0),
      militaryPower: neutral ? 0 : sumMilitaryPower(stateItem?.military),
      resourceSummary: neutral ? "无" : formatResourceTypes(stateItem?.resourceTypes),
      diplomacySummary: neutral ? "无" : formatDiplomacyCounts(stateItem?.diplomacySummary),
      noteBody: note?.body || "",
      noteUpdatedAt: note?.updatedAt || "",
      neighborCount: stateItem?.neighbors?.length || 0,
      color: neutral ? "#a6adb3" : normalizeHexColor(stateItem?.color) || fallbackStateColor(row.id)
    };
  });
  return {
    rows,
    total: rows.length,
    powerScore: rows.reduce((sum, row) => sum + row.powerScore, 0),
    economicPower: rows.reduce((sum, row) => sum + row.economicPower, 0),
    resourcePotential: rows.reduce((sum, row) => sum + row.resourcePotential, 0)
  };
}

function filterRows(rows, filter) {
  const query = filter.trim().toLowerCase();
  if (!query) return rows;
  return rows.filter(row =>
    String(row.id).includes(query)
    || row.name.toLowerCase().includes(query)
    || row.rawName.toLowerCase().includes(query)
    || row.governmentLabel.toLowerCase().includes(query)
    || row.capitalName.toLowerCase().includes(query)
  );
}

function sortRows(rows, key, direction) {
  return [...rows].sort((a, b) => compareRowsByKey(a, b, key, direction));
}

function handleActionSelect(key) {
  if (key === "merge" || key === "split") {
    beginTopologyDraft(key);
    return;
  }
  if (topologySourceStateId.value !== null) resetTopologyDraft();
  if (key === "add") {
    props.callbacks.onAddMode?.(!props.state.addMode);
    return;
  }
  if (key === "delete") {
    props.callbacks.onDeleteMode?.(!props.state.deleteMode);
    return;
  }
  if (key === "edit" && selected.value) {
    props.callbacks.onEdit?.(selected.value);
    return;
  }
  if (!key) activeAction.value = null;
}

function beginTopologyDraft(kind) {
  if (!topologyActionActive() || topologySourceStateId.value === null) {
    topologySourceStateId.value = Number(selected.value?.id) || null;
    mergeOtherStateId.value = activeStateNeighbors(props.state.map, topologySourceStateId.value)[0]?.value ?? null;
    mergeSurvivorStateId.value = topologySourceStateId.value;
    splitProvinceIds.value = [];
    splitCapitalCityId.value = null;
    splitNameDraft.value = "";
  }
  invalidateTopologyPreview();
  if (kind === "merge" && !mergeNeighborOptions.value.some(option => option.value === mergeOtherStateId.value)) {
    mergeOtherStateId.value = mergeNeighborOptions.value[0]?.value ?? null;
  }
}

function topologyActionActive() {
  return activeAction.value === "merge" || activeAction.value === "split";
}

function updateMergeSurvivorState(value) {
  mergeSurvivorStateId.value = Number(value);
  invalidateTopologyPreview();
}

function updateSplitCapitalCity(value) {
  splitCapitalCityId.value = Number(value);
  invalidateTopologyPreview();
}

function updateMergeOtherState(value) {
  mergeOtherStateId.value = Number(value);
  if (!mergeSurvivorOptions.value.some(option => option.value === mergeSurvivorStateId.value)) {
    mergeSurvivorStateId.value = topologySourceStateId.value;
  }
  invalidateTopologyPreview();
}

function toggleSplitProvince(provinceId, checked) {
  splitProvinceIds.value = checked
    ? [...new Set([...splitProvinceIds.value, Number(provinceId)])].sort((a, b) => a - b)
    : splitProvinceIds.value.filter(id => id !== Number(provinceId));
  if (!splitCapitalOptions.value.some(option => option.value === splitCapitalCityId.value)) {
    splitCapitalCityId.value = splitCapitalOptions.value[0]?.value ?? null;
  }
  invalidateTopologyPreview();
}

function mergeInput() {
  const survivorStateId = mergeSurvivorStateId.value;
  const other = [topologySourceStateId.value, mergeOtherStateId.value].find(id => id !== survivorStateId);
  return {survivorStateId, victimStateId: other};
}

function splitInput() {
  return {
    sourceStateId: topologySourceStateId.value,
    selectedProvinceIds: [...splitProvinceIds.value],
    newCapitalCityId: splitCapitalCityId.value,
    ...(splitNameDraft.value.trim() ? {name: splitNameDraft.value.trim()} : {})
  };
}

function inspectMerge() {
  inspectTopology(() => props.callbacks.onInspectMerge?.(mergeInput()));
}

function inspectSplit() {
  inspectTopology(() => props.callbacks.onInspectSplit?.(splitInput()));
}

function inspectTopology(readInspection) {
  topologyError.value = "";
  try {
    topologyInspection.value = readInspection?.() || null;
    if (!topologyInspection.value?.valid) topologyError.value = topologyInspection.value?.rejection?.reason || topologyInspection.value?.summary || "预检未通过";
  } catch (error) {
    topologyInspection.value = null;
    topologyError.value = error?.message || String(error);
  }
}

function submitMerge() {
  submitTopology(() => props.callbacks.onMerge?.(mergeInput()));
}

function submitSplit() {
  submitTopology(() => props.callbacks.onSplit?.(splitInput()));
}

function submitTopology(execute) {
  if (!topologyInspection.value?.valid) return;
  try {
    const result = execute?.();
    if (!result?.executed) {
      topologyError.value = result?.error?.message || "国家拓扑操作未执行";
      return;
    }
    activeAction.value = null;
    resetTopologyDraft();
  } catch (error) {
    topologyError.value = error?.message || String(error);
  }
}

function invalidateTopologyPreview() {
  topologyInspection.value = null;
  topologyError.value = "";
}

function resetTopologyDraft() {
  topologySourceStateId.value = null;
  mergeOtherStateId.value = null;
  mergeSurvivorStateId.value = null;
  splitProvinceIds.value = [];
  splitCapitalCityId.value = null;
  splitNameDraft.value = "";
  topologyInspection.value = null;
  topologyError.value = "";
}

function openRenameEditor(row) {
  if (!row || row.neutral) return;
  renameRequestId.value = row.id ?? null;
  props.callbacks.onSelect?.(row);
  nextTick(() => {
    if (!sameObjectId(selected.value?.id, row.id) || selected.value?.neutral) return;
    renameRequestId.value = null;
    activeAction.value = "rename";
  });
}

function handleEmptyAction(key) {
  if (key === "clear-filter") props.callbacks.onFilter?.("");
}

function handleHighlightAction(key) {
  if (key === "highlight-selected") props.callbacks.onHighlight?.(highlightableStateRows.value);
  if (key === "clear-highlights") props.callbacks.onClearHighlights?.();
}

function stateRows(map) {
  const rows = (map?.politics?.states || []).filter(stateItem => stateItem && !stateItem.removed && (stateItem.i || stateItem.id)).map(stateItem => ({
    id: stateItem.id ?? stateItem.i,
    name: stateItem.fullName || stateItem.name || `国家 #${stateItem.id ?? stateItem.i}`
  }));
  return map?.politics?.states?.[0] ? [{id: 0, name: "中立"}, ...rows] : rows;
}

function stateCities(map, stateId) {
  return (map?.settlements?.cities || [])
    .filter(city => city?.burgId && city.state === stateId)
    .sort((a, b) => Number(b.capital) - Number(a.capital) || b.population - a.population || a.id - b.id);
}

function activeStateNeighbors(map, stateId) {
  const stateItem = map?.politics?.states?.[stateId];
  return (stateItem?.neighbors || [])
    .map(Number)
    .filter(id => id > 0 && map?.politics?.states?.[id] && !map.politics.states[id].removed)
    .map(id => ({value: id, label: formatStateName(map, id)}));
}

function stateProvinces(map, stateId) {
  return (map?.politics?.provinces || [])
    .filter(province => province && !province.removed && Number(province.state) === Number(stateId))
    .sort((a, b) => Number(a.i ?? a.id) - Number(b.i ?? b.id))
    .map(province => {
      const id = Number(province.i ?? province.id);
      return {value: id, label: `${province.name || `省份 #${id}`}（#${id}）`};
    });
}

function findCapitalCity(map, burgId) {
  return (map?.settlements?.cities || []).find(city => city?.burgId === burgId) || null;
}

function indexedName(items, id) {
  const item = items?.[id];
  return item?.name || item?.fullName || (id === undefined || id === null ? "none" : String(id));
}

function formatStateName(map, stateId) {
  if (stateId === 0) return "中立";
  const stateItem = map?.politics?.states?.[stateId];
  if (!stateItem) return "none";
  return stateItem.fullName || stateItem.name || `#${stateId}`;
}

function neutralStateStats(map) {
  const cells = map?.pack?.cells;
  let area = 0;
  let population = 0;
  if (cells?.state) {
    for (const cell of cells.i || []) {
      if (cells.h?.[cell] < 20 || (cells.state[cell] || 0) !== 0) continue;
      area += cells.area?.[cell] || 0;
      population += cells.pop?.[cell] || 0;
    }
  } else {
    for (const cell of map?.grid?.cells?.i || []) {
      if (map.grid.cells.h?.[cell] < 20 || (map.grid.cells.state?.[cell] || 0) !== 0) continue;
      area += 1;
      population += map.grid.cells.pop?.[cell] || 0;
    }
  }
  const burgs = (map?.settlements?.cities || []).filter(city => city && (city.state || 0) === 0).length;
  return {area, population, burgs};
}

function sumMilitaryPower(regiments) {
  return (regiments || []).reduce((sum, regiment) => sum + Number(regiment?.a || regiment?.t || 0), 0);
}

function formatResourceTypes(types) {
  const entries = Object.entries(types || {})
    .filter(([, value]) => Number(value) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 4);
  if (!entries.length) return "无";
  return entries.map(([key, value]) => `${RESOURCE_LABELS[key] || key} ${formatNumber(Number(value))}`).join(" / ");
}

function formatDiplomacyCounts(counts = {}) {
  const parts = [
    ["Ally", "盟友"],
    ["Enemy", "战争"],
    ["Rival", "宿敌"],
    ["Vassal", "附庸"],
    ["Suzerain", "宗主"]
  ]
    .map(([key, label]) => Number(counts[key] || 0) ? `${label} ${formatNumber(counts[key])}` : "")
    .filter(Boolean);
  return parts.join(" / ") || "中立";
}

function formatGovernmentEffects(stateItem) {
  const effects = stateItem?.government?.effects || {};
  const parts = [
    formatSignedPercent("经济", effects.economyMultiplier),
    formatSignedPercent("贸易", effects.tradeMultiplier),
    formatSignedPercent("征兵", effects.militaryRecruitment)
  ].filter(Boolean);
  const family = stateItem?.government?.sizeLabel || "";
  return [family, ...parts].filter(Boolean).join(" / ") || "无";
}

function formatSignedPercent(label, value) {
  const numeric = Number(value || 1);
  if (!Number.isFinite(numeric) || Math.abs(numeric - 1) < 0.005) return "";
  const percent = Math.round((numeric - 1) * 100);
  return `${label}${percent > 0 ? "+" : ""}${percent}%`;
}

function normalizeHexColor(color) {
  if (typeof color !== "string") return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}

function fallbackStateColor(stateId) {
  const hue = ((Number(stateId) || 0) * 0.61803398875 + 0.12) % 1;
  const [r, g, b] = hslToRgb(hue, 0.32, 0.72);
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
  return formatDisplayNumber(value, unitPreferences.value);
}

function formatAreaValue(value) {
  return formatArea(value, unitPreferences.value);
}

function formatPopulationValue(value) {
  return formatPopulation(value, unitPreferences.value);
}

function formatMilitaryValue(value) {
  return formatMilitary(value, unitPreferences.value);
}

</script>
