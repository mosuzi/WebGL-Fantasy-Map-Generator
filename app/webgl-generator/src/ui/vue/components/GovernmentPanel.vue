<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="government-panel-summary" />

  <div class="government-panel-controls">
    <UiFilterInput :model-value="state.filter" placeholder="筛选政体 / 类型 / 国家" @update:model-value="callbacks.onFilter" />
  </div>

  <UiSortBar class-name="government-panel-sort" :options="sortOptions" :active-key="state.sortKey" :direction="state.sortDir" @sort="callbacks.onSort" />

  <UiObjectTable
    :columns="governmentColumns"
    :rows="visibleGovernmentRows"
    :selected-id="selectedGovernmentKey"
    row-id-key="key"
    empty-text="没有匹配的政体"
    :show-locate-action="false"
    @select="callbacks.onSelectGovernment"
  />

  <UiDetailGrid class-name="government-panel-details" empty-text="未选中政体" :rows="detailRows" />

  <section class="government-panel-batch" aria-label="批量调整政体">
    <div>
      <strong>批量套用</strong>
      <span>当前分组 {{ formatNumber(selectedStateRows.length) }} 国</span>
    </div>
    <UiSelectField
      class-name="government-panel-batch-select"
      label="目标政体"
      :model-value="batchGovernmentKey"
      :options="batchGovernmentOptions"
      :disabled="!batchGovernmentOptions.length"
      @update:model-value="batchGovernmentKey = $event"
    />
    <UiButton variant="secondary" :disabled="!canApplyBatchGovernment" @click="applyBatchGovernment">套用到当前分组</UiButton>
  </section>

  <UiObjectTable
    :columns="stateColumns"
    :rows="selectedStateRows"
    :selected-id="state.selectedStateId"
    empty-text="该政体下没有国家"
    @select="callbacks.onSelectState"
    @locate="callbacks.onLocateState"
  />

  <div class="government-panel-actions">
    <UiButton variant="secondary" :disabled="!selectedState" @click="callbacks.onOpenState?.(selectedState)">打开国家编辑</UiButton>
  </div>
</template>

<script setup>
import {computed, ref, watch} from "vue";
import {GOVERNMENT_OPTIONS, GOVERNMENT_TYPES} from "../../../generator/governments.js";
import UiButton from "./base/UiButton.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiSelectField from "./base/UiSelectField.vue";
import UiSortBar from "./base/UiSortBar.vue";
import {formatArea, formatNumber as formatDisplayNumber, formatPopulation} from "../../display-units.js";
import {findByObjectId} from "../../object-id.js";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";

defineOptions({
  name: "GovernmentPanel"
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
const callbacks = props.callbacks;

const GOVERNMENT_BY_KEY = new Map(GOVERNMENT_TYPES.map(type => [type.key, type]));
const unitPreferences = useUnitPreferences();
const batchGovernmentKey = ref("");

const sortOptions = Object.freeze([
  {key: "count", label: "国家"},
  {key: "population", label: "人口"},
  {key: "economicPower", label: "经济"},
  {key: "militaryPower", label: "军力"},
  {key: "label", label: "名称"},
  {key: "category", label: "类型"}
]);

const governmentColumns = Object.freeze([
  {key: "label", label: "政体"},
  {key: "category", label: "类型"},
  {key: "count", label: "国家", align: "right", format: value => formatNumber(value)},
  {key: "population", label: "人口", align: "right", format: value => formatPopulationValue(value)},
  {key: "economicPower", label: "经济", align: "right", format: value => formatNumber(value)},
  {key: "militaryPower", label: "军力", align: "right", format: value => formatNumber(value)}
]);

const stateColumns = Object.freeze([
  {key: "id", label: "ID", align: "right"},
  {key: "name", label: "国家"},
  {key: "population", label: "人口", align: "right", format: value => formatPopulationValue(value)},
  {key: "economicPower", label: "经济", align: "right", format: value => formatNumber(value)},
  {key: "militaryPower", label: "军力", align: "right", format: value => formatNumber(value)},
  {key: "capitalName", label: "首都"}
]);

const metrics = computed(() => {
  props.state.version;
  return buildGovernmentMetrics(props.state.map);
});
const visibleGovernmentRows = computed(() => sortRows(filterGovernmentRows(metrics.value.governments, metrics.value.states, props.state.filter), props.state.sortKey, props.state.sortDir));
const selectedGovernmentKey = computed(() => (
  visibleGovernmentRows.value.some(row => row.key === props.state.selectedGovernmentKey)
    ? props.state.selectedGovernmentKey
    : visibleGovernmentRows.value[0]?.key ?? null
));
const selectedGovernment = computed(() => visibleGovernmentRows.value.find(row => row.key === selectedGovernmentKey.value) || null);
const selectedStateRows = computed(() => metrics.value.states
  .filter(row => row.governmentKey === selectedGovernmentKey.value)
  .sort((a, b) => b.population - a.population || b.economicPower - a.economicPower || a.id - b.id));
const selectedState = computed(() => findByObjectId(selectedStateRows.value, props.state.selectedStateId) || selectedStateRows.value[0] || null);
const batchGovernmentOptions = computed(() => GOVERNMENT_OPTIONS
  .filter(option => option.value !== selectedGovernmentKey.value)
  .map(option => ({
    value: option.value,
    label: `${option.label} / ${option.category}`
  })));
const canApplyBatchGovernment = computed(() => Boolean(
  selectedStateRows.value.length
  && batchGovernmentKey.value
  && batchGovernmentKey.value !== selectedGovernmentKey.value
  && batchGovernmentOptions.value.some(option => option.value === batchGovernmentKey.value)
));

const summaryMetrics = computed(() => [
  {label: "政体", value: formatNumber(metrics.value.governments.length)},
  {label: "国家", value: formatNumber(metrics.value.totalStates)},
  {label: "主流政体", value: metrics.value.dominantGovernmentLabel},
  {label: "共和系", value: formatNumber(metrics.value.familyCounts.republic || 0)},
  {label: "君主系", value: formatNumber((metrics.value.familyCounts.monarchy || 0) + (metrics.value.familyCounts.autocracy || 0))},
  {label: "筛选", value: formatNumber(visibleGovernmentRows.value.length)}
]);

const detailRows = computed(() => selectedGovernment.value ? [
  {label: "政体", value: selectedGovernment.value.label},
  {label: "类型", value: selectedGovernment.value.category},
  {label: "时代", value: selectedGovernment.value.era},
  {label: "国家", value: formatNumber(selectedGovernment.value.count)},
  {label: "人口", value: formatPopulationValue(selectedGovernment.value.population)},
  {label: "面积", value: formatAreaValue(selectedGovernment.value.area)},
  {label: "经济力", value: formatNumber(selectedGovernment.value.economicPower)},
  {label: "军力", value: formatNumber(selectedGovernment.value.militaryPower)},
  {label: "效果", value: selectedGovernment.value.effectSummary},
  {label: "代表国家", value: selectedGovernment.value.sampleStates}
] : []);

watch(selectedGovernmentKey, key => {
  if (key && key !== props.state.selectedGovernmentKey) callbacks.onSelectGovernment?.({key});
  syncBatchGovernmentKey();
});

watch(() => props.state.version, syncBatchGovernmentKey, {immediate: true});

function buildGovernmentMetrics(map) {
  const states = stateRows(map);
  const groups = new Map();
  for (const row of states) {
    const group = ensureGovernmentGroup(groups, row.governmentKey);
    group.count += 1;
    group.population += row.population;
    group.area += row.area;
    group.economicPower += row.economicPower;
    group.militaryPower += row.militaryPower;
    if (group.samples.length < 4) group.samples.push(row.name);
  }
  const governments = Array.from(groups.values()).map(group => ({
    ...group,
    sampleStates: group.samples.join(" / ") || "无"
  }));
  const dominant = governments.reduce((best, row) => row.count > (best?.count || 0) ? row : best, null);
  const familyCounts = governments.reduce((counts, row) => {
    counts[row.family] = (counts[row.family] || 0) + row.count;
    return counts;
  }, {});
  return {
    states,
    governments,
    totalStates: states.length,
    dominantGovernmentLabel: dominant?.label || "无",
    familyCounts
  };
}

function syncBatchGovernmentKey() {
  if (!batchGovernmentOptions.value.length) {
    batchGovernmentKey.value = "";
    return;
  }
  if (batchGovernmentOptions.value.some(option => option.value === batchGovernmentKey.value)) return;
  batchGovernmentKey.value = batchGovernmentOptions.value[0].value;
}

function applyBatchGovernment() {
  if (!canApplyBatchGovernment.value) return;
  callbacks.onBatchGovernmentChange?.(selectedStateRows.value.map(row => row.id), batchGovernmentKey.value);
}

function ensureGovernmentGroup(groups, key) {
  const type = GOVERNMENT_BY_KEY.get(key) || null;
  const normalizedKey = key || "unknown";
  if (!groups.has(normalizedKey)) {
    groups.set(normalizedKey, {
      key: normalizedKey,
      label: type?.label || "未知政体",
      category: type?.category || "未归类",
      era: type?.era || "未标注",
      family: type?.family || "unknown",
      effectSummary: formatGovernmentTypeEffects(type),
      count: 0,
      population: 0,
      area: 0,
      economicPower: 0,
      militaryPower: 0,
      samples: []
    });
  }
  return groups.get(normalizedKey);
}

function stateRows(map) {
  return (map?.politics?.states || [])
    .filter(stateItem => stateItem?.i && !stateItem.removed)
    .map(stateItem => {
      const capital = findCapitalCity(map, stateItem.capital);
      return {
        id: stateItem.i ?? stateItem.id,
        name: stateItem.fullName || stateItem.name || `国家 #${stateItem.i ?? stateItem.id}`,
        rawName: stateItem.name || stateItem.fullName || `国家 #${stateItem.i ?? stateItem.id}`,
        governmentKey: stateItem.governmentKey || "unknown",
        governmentLabel: stateItem.governmentLabel || GOVERNMENT_BY_KEY.get(stateItem.governmentKey)?.label || "未知政体",
        population: Number(stateItem.urban || 0) + Number(stateItem.rural || 0),
        area: Number(stateItem.area || stateItem.cells || 0),
        economicPower: Number(stateItem.economicPower || 0),
        militaryPower: sumMilitaryPower(stateItem.military),
        capitalName: capital?.name || "无",
        centerCell: stateItem.center ?? stateItem.gridCenter ?? null,
        burgs: stateItem.burgs || 0
      };
    });
}

function filterGovernmentRows(governments, states, filter) {
  const query = String(filter || "").trim().toLowerCase();
  if (!query) return governments;
  const matchedGovernmentKeys = new Set(states
    .filter(row => row.name.toLowerCase().includes(query) || String(row.id).includes(query))
    .map(row => row.governmentKey));
  return governments.filter(row =>
    row.label.toLowerCase().includes(query)
    || row.category.toLowerCase().includes(query)
    || row.era.toLowerCase().includes(query)
    || row.key.toLowerCase().includes(query)
    || matchedGovernmentKeys.has(row.key)
  );
}

function sortRows(rows, key, direction) {
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (a[key] === b[key]) return a.label.localeCompare(b.label, "zh-CN");
    if (typeof a[key] === "string") return a[key].localeCompare(b[key], "zh-CN") * factor;
    return a[key] > b[key] ? factor : -factor;
  });
}

function findCapitalCity(map, burgId) {
  return (map?.settlements?.cities || []).find(city => city?.burgId === burgId) || null;
}

function sumMilitaryPower(regiments) {
  return (regiments || []).reduce((sum, regiment) => sum + Number(regiment?.a || regiment?.t || 0), 0);
}

function formatGovernmentTypeEffects(type) {
  const effects = type?.effects || {};
  const parts = [
    formatSignedPercent("经济", effects.economyMultiplier),
    formatSignedPercent("贸易", effects.tradeMultiplier),
    formatSignedPercent("征兵", effects.militaryRecruitment),
    formatSignedNumber("军额", effects.militaryCapAdd, 1000)
  ].filter(Boolean);
  return parts.join(" / ") || "基准";
}

function formatSignedPercent(label, value) {
  const numeric = Number(value || 1);
  if (!Number.isFinite(numeric) || Math.abs(numeric - 1) < 0.005) return "";
  const percent = Math.round((numeric - 1) * 100);
  return `${label}${percent > 0 ? "+" : ""}${percent}%`;
}

function formatSignedNumber(label, value, multiplier = 1) {
  const numeric = Number(value || 0) * multiplier;
  if (!Number.isFinite(numeric) || Math.abs(numeric) < 0.005) return "";
  const rounded = Math.round(numeric * 10) / 10;
  return `${label}${rounded > 0 ? "+" : ""}${rounded}`;
}

function formatNumber(value) {
  return formatDisplayNumber(value, unitPreferences.value);
}

function formatPopulationValue(value) {
  return formatPopulation(value, unitPreferences.value);
}

function formatAreaValue(value) {
  return formatArea(value, unitPreferences.value);
}
</script>
