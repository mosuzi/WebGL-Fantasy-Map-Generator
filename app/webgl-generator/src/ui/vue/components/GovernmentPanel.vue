<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="government-panel-summary" />

  <div class="government-panel-controls">
    <UiFilterInput :model-value="state.filter" placeholder="筛选政体 / 类型 / 国家" @update:model-value="callbacks.onFilter" />
    <UiSelectField
      input-id="government-family-filter"
      class-name="government-family-filter"
      label="家族"
      :model-value="state.familyFilter"
      :options="familyFilterOptions"
      @update:model-value="callbacks.onFamilyFilter"
    />
  </div>
  <UiObjectTable
    :columns="governmentColumns"
    :column-widths="governmentColumnWidths"
    :rows="visibleGovernmentRows"
    :sort-key="state.sortKey"
    :sort-direction="state.sortDir"
    :sort-options="sortOptions"
    sortable
    @sort="callbacks.onSort"
    :selected-id="selectedGovernmentKey"
    row-id-key="key"
    empty-text="没有匹配的政体"
    :show-locate-action="false"
    resizable-columns
    @select="callbacks.onSelectGovernment"
    @column-resize="payload => callbacks.onColumnResize?.({...payload, table: 'governments'})"
  />

  <UiPanelIoActions
    class-name="government-panel-export-actions"
    label="政体导出"
    :export-actions="governmentExportActions"
    @export="handleGovernmentExport"
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
    :column-widths="stateColumnWidths"
    :rows="selectedStateRows"
    :selected-id="state.selectedStateId"
    empty-text="该政体下没有国家"
    resizable-columns
    selectable-rows
    :selected-row-ids="selectedGovernmentStateIds"
    @select="callbacks.onSelectState"
    @locate="callbacks.onLocateState"
    @column-resize="payload => callbacks.onColumnResize?.({...payload, table: 'states'})"
    @selection-change="selectedGovernmentStateIds = $event"
  />

  <div class="government-panel-actions">
    <UiButton id="government-open-diplomacy" variant="secondary" :disabled="!selectedState" @click="callbacks.onOpenDiplomacy?.(selectedState)">外交视角</UiButton>
    <UiButton variant="secondary" :disabled="!selectedState" @click="callbacks.onOpenState?.(selectedState)">打开国家编辑</UiButton>
  </div>
</template>

<script setup>
import {computed, ref, watch} from "vue";
import {GOVERNMENT_OPTIONS, GOVERNMENT_TYPES} from "../../../generator/governments.js";
import {GOVERNMENT_FAMILY_LEGEND} from "../../../renderer/color-modes.js";
import UiButton from "./base/UiButton.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiPanelIoActions from "./base/UiPanelIoActions.vue";
import UiSelectField from "./base/UiSelectField.vue";
import {formatArea, formatMilitary, formatNumber as formatDisplayNumber, formatPopulation} from "../../display-units.js";
import {findByObjectId} from "../../object-id.js";
import {compareListValues} from "../../sort-utils.js";
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
const selectedGovernmentStateIds = ref([]);

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
  {key: "militaryPower", label: "军力", align: "right", format: value => formatMilitaryValue(value)}
]);

const stateColumns = Object.freeze([
  {key: "id", label: "ID", align: "right"},
  {key: "name", label: "国家"},
  {key: "population", label: "人口", align: "right", format: value => formatPopulationValue(value)},
  {key: "economicPower", label: "经济", align: "right", format: value => formatNumber(value)},
  {key: "militaryPower", label: "军力", align: "right", format: value => formatMilitaryValue(value)},
  {key: "capitalName", label: "首都"}
]);

const metrics = computed(() => {
  props.state.version;
  return buildGovernmentMetrics(props.state.map);
});
const familyFilterOptions = computed(() => [
  {value: "all", label: "全部家族"},
  ...Object.entries(metrics.value.familyCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => familyLabel(a[0]).localeCompare(familyLabel(b[0]), "zh-CN"))
    .map(([family, count]) => ({value: family, label: `${familyLabel(family)} ${formatNumber(count)}`}))
]);
const visibleGovernmentRows = computed(() => sortRows(filterGovernmentRows(
  metrics.value.governments,
  metrics.value.states,
  props.state.filter,
  props.state.familyFilter
), props.state.sortKey, props.state.sortDir));
const governmentColumnWidths = computed(() => tableColumnWidths("governments"));
const stateColumnWidths = computed(() => tableColumnWidths("states"));
const selectedGovernmentKey = computed(() => (
  visibleGovernmentRows.value.some(row => row.key === props.state.selectedGovernmentKey)
    ? props.state.selectedGovernmentKey
    : visibleGovernmentRows.value[0]?.key ?? null
));
const selectedGovernment = computed(() => visibleGovernmentRows.value.find(row => row.key === selectedGovernmentKey.value) || null);
const visibleGovernmentKeys = computed(() => new Set(visibleGovernmentRows.value.map(row => row.key)));
const exportStateRows = computed(() => metrics.value.states
  .filter(row => visibleGovernmentKeys.value.has(row.governmentKey))
  .sort((a, b) => a.governmentLabel.localeCompare(b.governmentLabel, "zh-CN") || b.population - a.population || a.id - b.id));
const governmentExportActions = computed(() => [
  {key: "csv", label: "导出 CSV", disabled: !exportStateRows.value.length},
  {key: "json", label: "导出 JSON", disabled: !visibleGovernmentRows.value.length},
  {key: "selected-csv", label: `导出选中国家 CSV ${formatNumber(selectedGovernmentStateRows.value.length)}`, disabled: !selectedGovernmentStateRows.value.length},
  {key: "selected-json", label: `导出选中国家 JSON ${formatNumber(selectedGovernmentStateRows.value.length)}`, disabled: !selectedGovernmentStateRows.value.length}
]);
const selectedStateRows = computed(() => metrics.value.states
  .filter(row => row.governmentKey === selectedGovernmentKey.value)
  .sort((a, b) => b.population - a.population || b.economicPower - a.economicPower || a.id - b.id));
const selectedGovernmentStateIdSet = computed(() => new Set(selectedGovernmentStateIds.value.map(id => String(id))));
const selectedGovernmentStateRows = computed(() => selectedStateRows.value.filter(row => selectedGovernmentStateIdSet.value.has(String(row.id))));
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
  {label: "筛选", value: formatNumber(visibleGovernmentRows.value.length)},
  {label: "已选国家", value: formatNumber(selectedGovernmentStateRows.value.length)}
]);

const detailRows = computed(() => selectedGovernment.value ? [
  {label: "政体", value: selectedGovernment.value.label},
  {label: "类型", value: selectedGovernment.value.category},
  {label: "时代", value: selectedGovernment.value.era},
  {label: "国家", value: formatNumber(selectedGovernment.value.count)},
  {label: "人口", value: formatPopulationValue(selectedGovernment.value.population)},
  {label: "面积", value: formatAreaValue(selectedGovernment.value.area)},
  {label: "国力", value: formatNumber(selectedGovernment.value.powerScore)},
  {label: "经济力", value: formatNumber(selectedGovernment.value.economicPower)},
  {label: "资源潜力", value: formatNumber(selectedGovernment.value.resourcePotential)},
  {label: "贸易修正", value: formatTradeModifier(selectedGovernment.value.tradeModifierAverage)},
  {label: "军力", value: formatMilitaryValue(selectedGovernment.value.militaryPower)},
  {label: "战争 / 宿敌", value: `${formatNumber(selectedGovernment.value.diplomacy.Enemy || 0)} / ${formatNumber(selectedGovernment.value.diplomacy.Rival || 0)}`},
  {label: "盟友 / 附庸", value: `${formatNumber(selectedGovernment.value.diplomacy.Ally || 0)} / ${formatNumber(selectedGovernment.value.diplomacy.Vassal || 0)}`},
  {label: "效果", value: selectedGovernment.value.effectSummary},
  {label: "代表国家", value: selectedGovernment.value.sampleStates}
] : []);

watch(selectedGovernmentKey, key => {
  if (key && key !== props.state.selectedGovernmentKey) callbacks.onSelectGovernment?.({key});
  syncBatchGovernmentKey();
});

watch(() => props.state.version, syncBatchGovernmentKey, {immediate: true});

watch(selectedStateRows, nextRows => {
  const visibleIds = new Set(nextRows.map(row => String(row.id)));
  selectedGovernmentStateIds.value = selectedGovernmentStateIds.value.filter(id => visibleIds.has(String(id)));
});

function buildGovernmentMetrics(map) {
  const states = stateRows(map);
  const groups = new Map();
  for (const row of states) {
    const group = ensureGovernmentGroup(groups, row.governmentKey);
    group.count += 1;
    group.population += row.population;
    group.area += row.area;
    group.economicPower += row.economicPower;
    group.resourcePotential += row.resourcePotential;
    group.powerScore += row.powerScore;
    group.militaryPower += row.militaryPower;
    group.tradeModifierTotal += row.governmentTradeModifier;
    mergeDiplomacyCounts(group.diplomacy, row.diplomacyCounts);
    if (group.samples.length < 4) group.samples.push(row.name);
  }
  const governments = Array.from(groups.values()).map(group => ({
    ...group,
    tradeModifierAverage: group.count ? roundExportNumber(group.tradeModifierTotal / group.count, 3) : 1,
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

function tableColumnWidths(table) {
  const source = props.state.columnWidths || {};
  const prefix = `${table}.`;
  return Object.fromEntries(
    Object.entries(source)
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, width]) => [key.slice(prefix.length), width])
  );
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

function exportCsv(rows = exportStateRows.value, {selectedOnly = false} = {}) {
  if (!rows.length) return;
  const header = [
    "国家ID",
    "国家",
    "政体Key",
    "政体",
    "类型",
    "时代",
    "家族",
    "首都",
    "人口",
    "面积",
    "国力",
    "经济力",
    "资源潜力",
    "贸易修正",
    "军力",
    "盟友",
    "战争",
    "宿敌",
    "附庸",
    "城镇"
  ];
  const body = rows.map(row => [
    row.id,
    row.name,
    row.governmentKey,
    row.governmentLabel,
    row.governmentCategory,
    row.governmentEra,
    row.governmentFamily,
    row.capitalName,
    roundExportNumber(row.population),
    roundExportNumber(row.area),
    roundExportNumber(row.powerScore),
    roundExportNumber(row.economicPower),
    roundExportNumber(row.resourcePotential),
    roundExportNumber(row.governmentTradeModifier),
    roundExportNumber(row.militaryPower),
    row.diplomacyCounts.Ally || 0,
    row.diplomacyCounts.Enemy || 0,
    row.diplomacyCounts.Rival || 0,
    row.diplomacyCounts.Vassal || 0,
    row.burgs
  ]);
  const text = [header, ...body].map(values => values.map(csvEscape).join(",")).join("\r\n");
  const suffix = selectedOnly ? "-selected-states" : "";
  downloadText(`fmg-governments-${safeFilePart(props.state.map?.metadata?.seed)}${suffix}.csv`, text, "text/csv;charset=utf-8");
}

function exportJson(rows = exportStateRows.value, {selectedOnly = false} = {}) {
  if (!visibleGovernmentRows.value.length || !rows.length) return;
  const exportedGovernmentKeys = new Set(rows.map(row => row.governmentKey));
  const payload = {
    type: "fmg-government-summary",
    exportMode: selectedOnly ? "selected-government-states" : "current-government-filter",
    exportedAt: new Date().toISOString(),
    seed: props.state.map?.metadata?.seed || "",
    filter: props.state.filter || "",
    familyFilter: props.state.familyFilter || "all",
    selectedGovernmentKey: selectedGovernmentKey.value,
    summary: {
      totalStates: metrics.value.totalStates,
      exportedStates: rows.length,
      governments: selectedOnly ? exportedGovernmentKeys.size : visibleGovernmentRows.value.length,
      dominantGovernmentLabel: metrics.value.dominantGovernmentLabel,
      familyCounts: metrics.value.familyCounts
    },
    governments: visibleGovernmentRows.value
      .filter(row => !selectedOnly || exportedGovernmentKeys.has(row.key))
      .map(row => exportGovernmentRow(row)),
    states: rows.map(row => exportStateRow(row))
  };
  const suffix = selectedOnly ? "-selected-states" : "";
  downloadText(`fmg-governments-${safeFilePart(props.state.map?.metadata?.seed)}${suffix}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
}

function handleGovernmentExport(key) {
  if (key === "csv") exportCsv();
  if (key === "json") exportJson();
  if (key === "selected-csv") exportCsv(selectedGovernmentStateRows.value, {selectedOnly: true});
  if (key === "selected-json") exportJson(selectedGovernmentStateRows.value, {selectedOnly: true});
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
      resourcePotential: 0,
      powerScore: 0,
      militaryPower: 0,
      tradeModifierTotal: 0,
      diplomacy: {},
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
      const governmentType = GOVERNMENT_BY_KEY.get(stateItem.governmentKey) || null;
      return {
        id: stateItem.i ?? stateItem.id,
        name: stateItem.fullName || stateItem.name || `国家 #${stateItem.i ?? stateItem.id}`,
        rawName: stateItem.name || stateItem.fullName || `国家 #${stateItem.i ?? stateItem.id}`,
        governmentKey: stateItem.governmentKey || "unknown",
        governmentLabel: stateItem.governmentLabel || governmentType?.label || "未知政体",
        governmentCategory: stateItem.governmentCategory || governmentType?.category || "未归类",
        governmentEra: stateItem.governmentEra || governmentType?.era || "未标注",
        governmentFamily: stateItem.governmentFamily || governmentType?.family || "unknown",
        population: Number(stateItem.urban || 0) + Number(stateItem.rural || 0),
        area: Number(stateItem.area || stateItem.cells || 0),
        economicPower: Number(stateItem.economicPower || 0),
        resourcePotential: Number(stateItem.resourcePotential || 0),
        powerScore: Number(stateItem.powerScore || 0),
        governmentTradeModifier: Number(stateItem.governmentTradeModifier || stateItem.government?.effects?.tradeMultiplier || 1),
        diplomacyCounts: normalizeDiplomacyCounts(stateItem.diplomacySummary),
        militaryPower: sumMilitaryPower(stateItem.military),
        capitalName: capital?.name || "无",
        centerCell: stateItem.center ?? stateItem.gridCenter ?? null,
        burgs: stateItem.burgs || 0
      };
    });
}

function filterGovernmentRows(governments, states, filter, familyFilter = "all") {
  const query = String(filter || "").trim().toLowerCase();
  const family = String(familyFilter || "all");
  const matchedGovernmentKeys = new Set(states
    .filter(row => row.name.toLowerCase().includes(query) || String(row.id).includes(query))
    .map(row => row.governmentKey));
  return governments
    .filter(row => family === "all" || row.family === family)
    .filter(row => !query
      || row.label.toLowerCase().includes(query)
      || row.category.toLowerCase().includes(query)
      || row.era.toLowerCase().includes(query)
      || familyLabel(row.family).toLowerCase().includes(query)
      || row.key.toLowerCase().includes(query)
      || matchedGovernmentKeys.has(row.key));
}

function sortRows(rows, key, direction) {
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    return compareListValues(a[key], b[key]) * factor || compareListValues(a.label, b.label);
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

function formatMilitaryValue(value) {
  return formatMilitary(value, unitPreferences.value);
}

function familyLabel(family) {
  return GOVERNMENT_FAMILY_LEGEND[family]?.label || family || "未归类";
}

function formatTradeModifier(value) {
  const numeric = Number(value || 1);
  if (!Number.isFinite(numeric)) return "基准";
  const percent = Math.round((numeric - 1) * 100);
  return percent ? `${percent > 0 ? "+" : ""}${percent}%` : "基准";
}

function exportGovernmentRow(row) {
  return {
    key: row.key,
    label: row.label,
    category: row.category,
    era: row.era,
    family: row.family,
    count: row.count,
    population: roundExportNumber(row.population),
    area: roundExportNumber(row.area),
    powerScore: roundExportNumber(row.powerScore),
    economicPower: roundExportNumber(row.economicPower),
    resourcePotential: roundExportNumber(row.resourcePotential),
    tradeModifierAverage: roundExportNumber(row.tradeModifierAverage),
    militaryPower: roundExportNumber(row.militaryPower),
    diplomacy: {...row.diplomacy},
    effectSummary: row.effectSummary,
    sampleStates: row.sampleStates
  };
}

function exportStateRow(row) {
  return {
    id: row.id,
    name: row.name,
    rawName: row.rawName,
    governmentKey: row.governmentKey,
    governmentLabel: row.governmentLabel,
    governmentCategory: row.governmentCategory,
    governmentEra: row.governmentEra,
    governmentFamily: row.governmentFamily,
    capitalName: row.capitalName,
    population: roundExportNumber(row.population),
    area: roundExportNumber(row.area),
    powerScore: roundExportNumber(row.powerScore),
    economicPower: roundExportNumber(row.economicPower),
    resourcePotential: roundExportNumber(row.resourcePotential),
    governmentTradeModifier: roundExportNumber(row.governmentTradeModifier),
    militaryPower: roundExportNumber(row.militaryPower),
    diplomacySummary: {...row.diplomacyCounts},
    burgs: row.burgs,
    centerCell: row.centerCell
  };
}

function roundExportNumber(value, digits = 3) {
  const numeric = Number(value) || 0;
  const factor = 10 ** digits;
  return Math.round(numeric * factor) / factor;
}

function normalizeDiplomacyCounts(counts = {}) {
  return {
    Ally: Number(counts.Ally || 0),
    Friendly: Number(counts.Friendly || 0),
    Neutral: Number(counts.Neutral || 0),
    Suspicion: Number(counts.Suspicion || 0),
    Rival: Number(counts.Rival || 0),
    Enemy: Number(counts.Enemy || 0),
    Vassal: Number(counts.Vassal || 0),
    Suzerain: Number(counts.Suzerain || 0),
    Unknown: Number(counts.Unknown || 0)
  };
}

function mergeDiplomacyCounts(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
    target[key] = (target[key] || 0) + Number(value || 0);
  }
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function safeFilePart(value) {
  return String(value || "map").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "map";
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], {type});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
</script>
