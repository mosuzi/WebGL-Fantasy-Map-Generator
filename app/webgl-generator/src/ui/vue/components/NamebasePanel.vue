<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="namebase-panel-summary" />

  <div class="namebase-panel-controls">
    <UiFilterInput :model-value="state.filter" placeholder="筛选名称 / 分类 / 类型 / 样例" @update:model-value="callbacks.onFilter" />
  </div>

  <UiSortBar class-name="namebase-panel-sort" :options="sortOptions" :active-key="state.sortKey" :direction="state.sortDir" @sort="callbacks.onSort" />

  <UiSelectField
    class-name="namebase-import-mode"
    input-id="namebase-import-mode"
    label="导入方式"
    :model-value="state.importMode"
    :options="importModeOptions"
    @update:model-value="callbacks.onImportMode"
  />

  <UiObjectTable
    :columns="columns"
    :rows="visibleRows"
    :selected-id="state.selectedNamebaseId"
    row-id-key="id"
    empty-text="没有匹配的名称库"
    :show-locate-action="false"
    @select="callbacks.onSelect"
  />

  <UiDetailGrid class-name="namebase-panel-details" empty-text="未选中名称库" :rows="detailRows" />

  <div v-if="selected" class="namebase-panel-preview">
    <strong>样例</strong>
    <span>{{ selected.examplesLabel }}</span>
  </div>

  <div v-if="selected?.duplicateLabel" class="namebase-panel-preview">
    <strong>重复样本</strong>
    <span>{{ selected.duplicateLabel }}</span>
  </div>

  <UiTextEditField
    v-if="selectedUserRow"
    :model-value="selectedUserRow.name"
    label="名称"
    action-label="重命名"
    :max-length="48"
    @apply="value => callbacks.onRenameUser(selectedUserRow, value)"
  />

  <div v-if="selectedUserRow" class="namebase-source-editor">
    <label>
      <span>样本</span>
      <ElInput v-model="sourceDraft" type="textarea" :rows="5" resize="vertical" />
    </label>
    <UiButton variant="secondary" @click="callbacks.onUpdateSource(selectedUserRow, sourceDraft)">应用样本</UiButton>
  </div>

  <div class="namebase-panel-actions">
    <UiButton variant="secondary" :disabled="!rows.length" @click="callbacks.onExport()">导出名称库</UiButton>
    <label class="secondary-action file-import-action namebase-import-action" for="namebase-import-file">导入名称库</label>
    <input id="namebase-import-file" type="file" accept=".json,application/json" hidden @change="handleImportFile" />
    <UiButton variant="secondary" :disabled="!selectedBuiltinRow" @click="callbacks.onCopyBuiltin(selectedBuiltinRow)">复制内置</UiButton>
    <UiButton variant="secondary" :disabled="!selectedUserRow" @click="callbacks.onDeleteUser(selectedUserRow)">删除选中</UiButton>
    <UiButton variant="secondary" :disabled="!userRows.length" @click="callbacks.onClearUser()">清空用户库</UiButton>
  </div>
</template>

<script setup>
import {computed, ref, watch} from "vue";
import {formatNumber as formatDisplayNumber} from "../../display-units.js";
import {findByObjectId} from "../../object-id.js";
import UiButton from "./base/UiButton.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiSelectField from "./base/UiSelectField.vue";
import UiSortBar from "./base/UiSortBar.vue";
import UiTextEditField from "./base/UiTextEditField.vue";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";

defineOptions({
  name: "NamebasePanel"
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

const unitPreferences = useUnitPreferences();
const sourceDraft = ref("");

const sortOptions = Object.freeze([
  {key: "category", label: "分类"},
  {key: "name", label: "名称"},
  {key: "samples", label: "样本"},
  {key: "duplicateSamples", label: "重复"}
]);
const importModeOptions = Object.freeze([
  {value: "append", label: "追加到用户库"},
  {value: "replace", label: "替换用户库"}
]);

const columns = Object.freeze([
  {key: "category", label: "分类"},
  {key: "origin", label: "来源"},
  {key: "name", label: "名称"},
  {key: "kind", label: "类型"},
  {key: "samples", label: "样本", align: "right", format: value => formatNumber(value)},
  {key: "duplicateSamples", label: "重复", align: "right", format: value => formatNumber(value)},
  {key: "lengthRange", label: "长度"}
]);

const rows = computed(() => {
  props.state.version;
  return (props.state.summaries || []).map(toRow);
});
const visibleRows = computed(() => sortRows(filterRows(rows.value, props.state.filter), props.state.sortKey, props.state.sortDir));
const userRows = computed(() => rows.value.filter(row => row.origin !== "内置"));
const selected = computed(() => findByObjectId(rows.value, props.state.selectedNamebaseId));
const selectedBuiltinRow = computed(() => selected.value?.builtin === true ? selected.value : null);
const selectedUserRow = computed(() => isUserNamebaseRow(selected.value) ? selected.value : null);
const summaryMetrics = computed(() => [
  {label: "词池", value: formatNumber(rows.value.length)},
  {label: "样本", value: formatNumber(rows.value.reduce((sum, row) => sum + row.samples, 0))},
  {label: "唯一样本", value: formatNumber(rows.value.reduce((sum, row) => sum + row.uniqueSamples, 0))},
  {label: "重复", value: formatNumber(rows.value.reduce((sum, row) => sum + row.duplicateSamples, 0))}
]);
const detailRows = computed(() => selected.value ? [
  {label: "分类", value: selected.value.category},
  {label: "来源", value: selected.value.origin},
  {label: "名称", value: selected.value.name},
  {label: "类型", value: selected.value.kind},
  {label: "样本数", value: formatNumber(selected.value.samples)},
  {label: "唯一样本", value: formatNumber(selected.value.uniqueSamples)},
  {label: "重复样本", value: formatNumber(selected.value.duplicateSamples)},
  {label: "质量", value: selected.value.qualityLabel},
  {label: "最短", value: `${formatNumber(selected.value.minLength)}字`},
  {label: "最长", value: `${formatNumber(selected.value.maxLength)}字`},
  {label: "说明", value: selected.value.note || "内置词池"}
] : []);

function toRow(summary) {
  const examples = summary.examples || [];
  const duplicateNames = summary.duplicateNames || [];
  return {
    ...summary,
    lengthRange: `${summary.minLength}-${summary.maxLength}`,
    examplesLabel: examples.length ? examples.join("、") : "无样例",
    duplicateLabel: duplicateNames.length ? duplicateNames.join("、") : "",
    qualityLabel: qualityLabel(summary)
  };
}

function qualityLabel(summary) {
  const samples = summary.samples || 0;
  if (samples < 30) return "样本偏少";
  if (samples < 100) return "样本可用";
  if (samples > 400) return "样本过多";
  if ((summary.duplicateSamples || 0) > 0) return "有重复样本";
  return "样本充足";
}

function isUserNamebaseRow(row) {
  return Boolean(row && row.origin !== "内置" && row.builtin !== true);
}

function filterRows(sourceRows, filter) {
  const query = String(filter || "").trim().toLowerCase();
  if (!query) return sourceRows;
  return sourceRows.filter(row => [
    row.id,
    row.name,
    row.kind,
    row.origin,
    row.category,
    row.note,
    row.qualityLabel,
    row.examplesLabel,
    row.duplicateLabel
  ].some(value => String(value || "").toLowerCase().includes(query)));
}

function sortRows(sourceRows, key, dir) {
  const multiplier = dir === "asc" ? 1 : -1;
  return [...sourceRows].sort((a, b) => compareValue(a[key], b[key]) * multiplier || a.index - b.index);
}

function compareValue(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""), "zh-Hans-CN", {numeric: true});
}

function formatNumber(value) {
  return formatDisplayNumber(value, unitPreferences.value);
}

function handleImportFile(event) {
  const file = event.target.files?.[0];
  if (file) props.callbacks.onImport?.(file);
  event.target.value = "";
}

watch(() => selected.value?.id, () => {
  sourceDraft.value = selectedUserRow.value?.source?.join("\n") || "";
}, {immediate: true});
</script>
