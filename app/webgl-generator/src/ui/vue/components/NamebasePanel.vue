<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="namebase-panel-summary" />

  <div v-if="bindingInvalidEntries.length" class="namebase-binding-warning">
    <strong>失效绑定引用</strong>
    <span>{{ bindingInvalidLabel }}</span>
  </div>

  <section class="namebase-binding-editor" aria-label="全局名称库绑定">
    <div class="namebase-binding-editor-header">
      <strong>全局绑定</strong>
      <span>只保存后续生成偏好，不改写当前地图名称。</span>
    </div>
    <div class="namebase-binding-fields">
      <UiSelectField
        v-for="target in globalBindingTargets"
        :key="target.key"
        :class-name="'namebase-binding-select'"
        :input-id="`namebase-binding-${target.key}`"
        :label="target.label"
        :model-value="globalBindings[target.key] || ''"
        :options="bindingOptions(target.key)"
        @update:model-value="value => callbacks.onSetGlobalBinding?.(target.key, value)"
      />
    </div>
  </section>

  <section class="namebase-binding-editor" aria-label="文化名称库绑定">
    <div class="namebase-binding-editor-header">
      <strong>文化绑定</strong>
      <span>覆盖指定文化的后续国家、城镇和水文命名。</span>
    </div>
    <UiSelectField
      class-name="namebase-culture-select"
      input-id="namebase-binding-culture"
      label="文化"
      :model-value="selectedCultureId"
      :options="cultureOptions"
      @update:model-value="value => selectedCultureId = value"
    />
    <div class="namebase-binding-fields">
      <UiSelectField
        v-for="target in globalBindingTargets"
        :key="`culture-${target.key}`"
        :class-name="'namebase-binding-select'"
        :input-id="`namebase-culture-binding-${target.key}`"
        :label="target.label"
        :model-value="selectedCultureBindings[target.key] || ''"
        :options="bindingOptions(target.key, selectedCultureBindings[target.key])"
        :disabled="!selectedCultureId"
        @update:model-value="value => callbacks.onSetCultureBinding?.(selectedCultureId, target.key, value)"
      />
    </div>
  </section>

  <div class="namebase-panel-controls">
    <UiFilterInput :model-value="state.filter" placeholder="筛选名称 / 分类 / 类型 / 样例" @update:model-value="callbacks.onFilter" />
  </div>
  <UiSelectField
    class-name="namebase-import-mode"
    input-id="namebase-import-mode"
    label="导入方式"
    :model-value="state.importMode"
    :options="importModeOptions"
    @update:model-value="callbacks.onImportMode"
  />

  <div v-if="state.importPreview" class="namebase-import-preview">
    <div class="namebase-import-preview-header">
      <strong>导入预览</strong>
      <span>{{ state.importPreview.filename }}</span>
    </div>
    <UiMetricGrid :metrics="importPreviewMetrics" class-name="namebase-import-preview-metrics" />
    <p class="namebase-import-preview-note">{{ importPreviewNote }}</p>
    <div v-if="state.importPreview.examples?.length" class="namebase-import-preview-list">
      <span
        v-for="item in state.importPreview.examples"
        :key="`${item.name}-${item.samples}`"
        :class="{conflict: item.conflict}"
      >
        {{ item.name }} · {{ formatNumber(item.samples) }}
      </span>
    </div>
    <div class="namebase-import-preview-actions">
      <UiButton variant="secondary" @click="callbacks.onCancelImport">取消</UiButton>
      <UiButton @click="callbacks.onConfirmImport">确认导入</UiButton>
    </div>
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
    :selected-id="state.selectedNamebaseId"
    row-id-key="id"
    empty-text="没有匹配的名称库"
    :empty-action="namebaseEmptyAction"
    :show-locate-action="false"
    resizable-columns
    selectable-rows
    :selected-row-ids="selectedNamebaseIds"
    @select="callbacks.onSelect"
    @empty-action="handleNamebaseAction"
    @column-resize="callbacks.onColumnResize"
    @selection-change="selectedNamebaseIds = $event"
  />

  <UiPanelIoActions
    class-name="namebase-panel-io-actions"
    label="名称库列表操作"
    :export-actions="namebaseExportActions"
    :import-actions="namebaseImportActions"
    :actions="namebaseListActions"
    @export="handleNamebaseExport"
    @import="handleNamebaseImport"
    @action="handleNamebaseAction"
  />

  <UiDetailGrid class-name="namebase-panel-details" empty-text="未选中名称库" :rows="detailRows" />

  <div v-if="selected" class="namebase-panel-preview">
    <div class="namebase-panel-preview-header">
      <strong>{{ generatedExamples.length ? "生成预览" : "样例" }}</strong>
      <UiButton variant="secondary" @click="generateExamples">{{ generatedExamples.length ? "换一组" : "生成预览" }}</UiButton>
    </div>
    <span class="namebase-panel-preview-text">{{ previewExamplesLabel }}</span>
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
    <p class="namebase-source-editor-note">每行可写“清河|3”提高抽样权重；重复样本也会合并为更高权重。未写权重时按 1 处理。</p>
    <UiButton variant="secondary" @click="callbacks.onUpdateSource(selectedUserRow, sourceDraft)">应用样本</UiButton>
  </div>

  <div v-if="selectedUserRow" class="namebase-options-editor">
    <div class="namebase-options-editor-header">
      <strong>生成参数</strong>
      <span>只影响后续预览、生成和显式改名。</span>
    </div>
    <div class="namebase-options-fields">
      <label>
        <span>最短</span>
        <input v-model.number="minLengthDraft" type="number" min="1" max="12" step="1" />
      </label>
      <label>
        <span>最长</span>
        <input v-model.number="maxLengthDraft" type="number" :min="minLengthDraft" max="12" step="1" />
      </label>
      <label>
        <span>允许连写</span>
        <input v-model.trim="duplicateCharsDraft" maxlength="24" placeholder="如：叠叠" />
      </label>
    </div>
    <p class="namebase-source-editor-note">未列入“允许连写”的相邻重复字符会被过滤，例如“清清”默认不会进入候选。</p>
    <UiButton variant="secondary" @click="applyOptions">应用参数</UiButton>
  </div>

</template>

<script setup>
import {computed, ref, watch} from "vue";
import {createNamebaseGeneratedExamples} from "../../../generator/namebase-store.js";
import {formatNumber as formatDisplayNumber} from "../../display-units.js";
import {findByObjectId} from "../../object-id.js";
import UiButton from "./base/UiButton.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiPanelIoActions from "./base/UiPanelIoActions.vue";
import UiSelectField from "./base/UiSelectField.vue";
import UiTextEditField from "./base/UiTextEditField.vue";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";
import {compareListValues} from "../../sort-utils.js";

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
const minLengthDraft = ref(1);
const maxLengthDraft = ref(4);
const duplicateCharsDraft = ref("");
const generatedExamples = ref([]);
const previewNonce = ref(0);
const selectedNamebaseIds = ref([]);

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
const globalBindingTargets = Object.freeze([
  {key: "stateRoot", label: "国家根名"},
  {key: "place", label: "地名"},
  {key: "hydro", label: "水文"}
]);
const bindingCompatibleKinds = Object.freeze({
  stateRoot: new Set(["state-root", "generic"]),
  place: new Set(["place", "place-part", "generic"]),
  hydro: new Set(["hydro", "generic"])
});

const columns = Object.freeze([
  {key: "category", label: "分类", width: 76},
  {key: "origin", label: "来源", width: 60},
  {key: "name", label: "名称", width: 112},
  {key: "kind", label: "类型", width: 76},
  {key: "samples", label: "样本", width: 60, align: "right", format: value => formatNumber(value)},
  {key: "duplicateSamples", label: "重复", width: 60, align: "right", format: value => formatNumber(value)},
  {key: "lengthRange", label: "长度", width: 60},
  {key: "bindingUsageLabel", label: "绑定", width: 108}
]);

const rows = computed(() => {
  props.state.version;
  return (props.state.summaries || []).map(toRow);
});
const visibleRows = computed(() => sortRows(filterRows(rows.value, props.state.filter), props.state.sortKey, props.state.sortDir));
const selectedNamebaseIdSet = computed(() => new Set(selectedNamebaseIds.value.map(id => String(id))));
const selectedNamebaseRows = computed(() => visibleRows.value.filter(row => selectedNamebaseIdSet.value.has(String(row.id))));
const namebaseExportActions = computed(() => [
  {key: "json", label: "导出名称库", disabled: !rows.value.length},
  {key: "legacy", label: "导出原版文本", disabled: !rows.value.length},
  {key: "selected-json", label: `导出选中名称库 ${formatNumber(selectedNamebaseRows.value.length)}`, disabled: !selectedNamebaseRows.value.length},
  {key: "selected-legacy", label: `导出选中原版文本 ${formatNumber(selectedNamebaseRows.value.length)}`, disabled: !selectedNamebaseRows.value.length}
]);
const namebaseImportActions = Object.freeze([
  {key: "namebase", label: "导入名称库", accept: ".json,.txt,application/json,text/plain"}
]);
const userRows = computed(() => rows.value.filter(row => row.origin !== "内置"));
const selected = computed(() => findByObjectId(rows.value, props.state.selectedNamebaseId));
const selectedBuiltinRow = computed(() => selected.value?.builtin === true ? selected.value : null);
const selectedUserRow = computed(() => isUserNamebaseRow(selected.value) ? selected.value : null);
const filterEmptyAction = computed(() => String(props.state.filter || "").trim()
  ? {key: "clear-filter", label: "清空筛选", icon: "⌫"}
  : null);
const defaultNamebaseEmptyAction = Object.freeze({key: "create", label: "新建用户库", icon: "+"});
const namebaseEmptyAction = computed(() => filterEmptyAction.value || defaultNamebaseEmptyAction);
const namebaseListActions = computed(() => [
  defaultNamebaseEmptyAction,
  {key: "copy", label: "复制选中内置库", icon: "⧉", disabled: !selectedBuiltinRow.value},
  {key: "delete", label: "删除选中用户库", icon: "×", disabled: !selectedUserRow.value},
  {key: "clear", label: "清空用户库", icon: "⌫", disabled: !userRows.value.length}
]);
const selectedSourceFingerprint = computed(() => (selected.value?.source || []).join("\u0000"));
const previewExamplesLabel = computed(() => generatedExamples.value.length ? generatedExamples.value.join("、") : selected.value?.examplesLabel || "无样例");
const summaryMetrics = computed(() => [
  {label: "词池", value: formatNumber(rows.value.length)},
  {label: "样本", value: formatNumber(rows.value.reduce((sum, row) => sum + row.samples, 0))},
  {label: "唯一样本", value: formatNumber(rows.value.reduce((sum, row) => sum + row.uniqueSamples, 0))},
  {label: "重复", value: formatNumber(rows.value.reduce((sum, row) => sum + row.duplicateSamples, 0))},
  {label: "已选", value: formatNumber(selectedNamebaseRows.value.length)}
]);
const bindingInvalidEntries = computed(() => props.state.bindingStatus?.invalid || []);
const bindingInvalidLabel = computed(() => bindingInvalidEntries.value.map(item => `${item.label} -> ${item.id}`).join("；"));
const globalBindings = computed(() => props.state.bindingStatus?.bindings?.global || {});
const cultureBindings = computed(() => props.state.bindingStatus?.bindings?.cultures || {});
const cultures = computed(() => collectCultures(props.state.map));
const cultureOptions = computed(() => cultures.value.length
  ? cultures.value.map(culture => ({value: String(culture.id), label: culture.label}))
  : [{value: "", label: "暂无文化"}]
);
const selectedCultureId = ref("");
const selectedCultureBindings = computed(() => cultureBindings.value[String(selectedCultureId.value)] || {});
const importPreviewMetrics = computed(() => {
  const preview = props.state.importPreview;
  if (!preview) return [];
  return [
    {label: "可导入", value: formatNumber(preview.valid)},
    {label: "样本", value: formatNumber(preview.samples)},
    {label: "将替换", value: formatNumber(preview.replaceCount)},
    {label: "可能重名", value: formatNumber(preview.existingConflicts)}
  ];
});
const importPreviewNote = computed(() => {
  const preview = props.state.importPreview;
  if (!preview) return "";
  const notes = [];
  if (preview.mode === "replace" && preview.replaceCount) notes.push(`确认后会先替换当前 ${formatNumber(preview.replaceCount)} 个用户库`);
  if (preview.skipped) notes.push(`${formatNumber(preview.skipped)} 个空词池会跳过`);
  if (preview.builtinRecords) notes.push(`${formatNumber(preview.builtinRecords)} 个内置词池会作为用户库导入`);
  if (preview.existingConflicts) notes.push(`${formatNumber(preview.existingConflicts)} 个词池可能与现有用户库重名或同源，导入后会并存为新用户库`);
  if (preview.repeatedNames) notes.push(`文件内有 ${formatNumber(preview.repeatedNames)} 个重名词池`);
  if (!notes.length) notes.push("确认后只写入用户名称库，不会改写当前地图对象名称");
  return notes.join("；");
});
const detailRows = computed(() => selected.value ? [
  {label: "分类", value: selected.value.category},
  {label: "来源", value: selected.value.origin},
  {label: "名称", value: selected.value.name},
  {label: "类型", value: selected.value.kind},
  {label: "样本数", value: formatNumber(selected.value.samples)},
  {label: "样本权重", value: formatWeight(selected.value.weightedSamples)},
  {label: "加权样本", value: selected.value.weightedNameSamplesLabel},
  {label: "链路多样性", value: formatWeight(selected.value.chainDiversity)},
  {label: "唯一样本", value: formatNumber(selected.value.uniqueSamples)},
  {label: "重复样本", value: formatNumber(selected.value.duplicateSamples)},
  {label: "质量", value: selected.value.qualityLabel},
  {label: "绑定状态", value: selected.value.bindingUsageLabel},
  {label: "生成长度", value: `${formatNumber(selected.value.minLength)}-${formatNumber(selected.value.maxLength)}字`},
  {label: "样本长度", value: `${formatNumber(selected.value.sampleMinLength)}-${formatNumber(selected.value.sampleMaxLength)}字`},
  {label: "平均长度", value: `${formatWeight(selected.value.sampleMeanLength)}字`},
  {label: "中位长度", value: `${formatWeight(selected.value.sampleMedianLength)}字`},
  {label: "长度越界", value: selected.value.lengthOutlierLabel},
  {label: "连写风险", value: selected.value.repeatRiskLabel},
  {label: "特殊字符", value: selected.value.unusualCharsLabel},
  {label: "允许连写", value: selected.value.duplicateChars || "无"},
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
    weightedNameSamplesLabel: weightedNameSamplesLabel(summary),
    lengthOutlierLabel: listDiagnosticLabel(summary.lengthOutlierSamples, summary.lengthOutlierNames),
    repeatRiskLabel: repeatRiskLabel(summary),
    unusualCharsLabel: (summary.unusualChars || []).length ? summary.unusualChars.join("、") : "无",
    doubledCharsLabel: (summary.doubledChars || []).length ? summary.doubledChars.join("、") : "无",
    qualityLabel: qualityLabel(summary)
  };
}

function qualityLabel(summary) {
  const samples = summary.samples || 0;
  if (samples < 30) return "样本偏少";
  if ((summary.lengthOutlierSamples || 0) > 0) return "长度需校准";
  if ((summary.disallowedRepeatSamples || 0) > 0) return "连写需校准";
  if ((summary.unusualChars || []).length) return "含特殊字符";
  if (samples < 100) return "样本可用";
  if (samples > 400) return "样本过多";
  if ((summary.chainDiversity || 0) < 1.35) return "链路偏窄";
  if ((summary.duplicateSamples || 0) > 0) return "有重复样本";
  return "样本充足";
}

function weightedNameSamplesLabel(summary) {
  const count = summary.weightedNameSamples || 0;
  if (!count) return "无";
  return `${formatNumber(count)}个，最高 ${formatWeight(summary.maxSampleWeight || 1)}x`;
}

function listDiagnosticLabel(count, examples = []) {
  if (!count) return "无";
  const suffix = examples.length ? `：${examples.join("、")}` : "";
  return `${formatNumber(count)}个${suffix}`;
}

function repeatRiskLabel(summary) {
  const disallowed = summary.disallowedRepeatSamples || 0;
  if (disallowed) return listDiagnosticLabel(disallowed, summary.disallowedRepeatNames || []);
  const doubledChars = summary.doubledChars || [];
  if (doubledChars.length) return `已允许：${doubledChars.join("、")}`;
  return "无";
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
    row.bindingUsageLabel,
    row.examplesLabel,
    row.duplicateLabel,
    row.lengthOutlierLabel,
    row.repeatRiskLabel,
    row.unusualCharsLabel,
    row.doubledCharsLabel,
    row.weightedNameSamplesLabel
  ].some(value => String(value || "").toLowerCase().includes(query)));
}

function sortRows(sourceRows, key, dir) {
  const multiplier = dir === "asc" ? 1 : -1;
  return [...sourceRows].sort((a, b) => compareValue(a[key], b[key]) * multiplier || a.index - b.index);
}

function compareValue(a, b) {
  return compareListValues(a, b, "zh-Hans-CN");
}

function formatNumber(value) {
  return formatDisplayNumber(value, unitPreferences.value);
}

function formatWeight(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0";
  return number % 1 === 0 ? formatNumber(number) : String(Math.round(number * 10) / 10);
}

function bindingOptions(targetKey, value = globalBindings.value[targetKey]) {
  const current = String(value || "");
  const candidates = rows.value.filter(row => isBindingCandidate(row, targetKey));
  const options = [
    {value: "", label: "使用内置策略"},
    ...candidates.map(row => ({
      value: row.id,
      label: `${row.name}（${row.origin} / ${row.kind}）`
    }))
  ];
  if (current && !options.some(option => String(option.value) === current)) {
    const currentRow = rows.value.find(row => String(row.id) === current);
    options.splice(1, 0, {
      value: current,
      label: currentRow ? `${currentRow.name}（当前不匹配 / ${currentRow.kind}）` : `失效引用：${current}`
    });
  }
  return options;
}

function isBindingCandidate(row, targetKey) {
  const compatibleKinds = bindingCompatibleKinds[targetKey];
  if (!compatibleKinds) return true;
  return compatibleKinds.has(String(row?.kind || "").trim());
}

function collectCultures(map) {
  const cultures = map?.pack?.cultures || map?.society?.cultures || [];
  return cultures
    .filter(culture => culture && (culture.i || culture.id))
    .map(culture => {
      const id = culture.i ?? culture.id;
      const name = culture.name || culture.root || `文化 #${id}`;
      return {
        id,
        label: `${name} #${id}`
      };
    });
}

function handleNamebaseExport(key) {
  if (key === "json") props.callbacks.onExport?.();
  if (key === "legacy") props.callbacks.onExportLegacy?.();
  if (key === "selected-json") props.callbacks.onExport?.(selectedNamebaseRows.value);
  if (key === "selected-legacy") props.callbacks.onExportLegacy?.(selectedNamebaseRows.value);
}

function handleNamebaseImport({file}) {
  if (file) {
    if (props.callbacks.onImportPreview) props.callbacks.onImportPreview(file);
    else props.callbacks.onImport?.(file);
  }
}

function handleNamebaseAction(key) {
  if (key === "clear-filter") {
    props.callbacks.onFilter?.("");
    return;
  }
  if (key === "create") props.callbacks.onCreateUser?.();
  if (key === "copy" && selectedBuiltinRow.value) props.callbacks.onCopyBuiltin?.(selectedBuiltinRow.value);
  if (key === "delete" && selectedUserRow.value) props.callbacks.onDeleteUser?.(selectedUserRow.value);
  if (key === "clear" && userRows.value.length) props.callbacks.onClearUser?.();
}

function generateExamples() {
  if (!selected.value) return;
  previewNonce.value += 1;
  generatedExamples.value = createNamebaseGeneratedExamples(selected.value, {
    count: 16,
    seed: selected.value.id,
    salt: previewNonce.value
  });
}

function applyOptions() {
  if (!selectedUserRow.value) return;
  props.callbacks.onUpdateOptions?.(selectedUserRow.value, {
    minLength: minLengthDraft.value,
    maxLength: maxLengthDraft.value,
    duplicateChars: duplicateCharsDraft.value
  });
}

watch(() => [selected.value?.id, selectedSourceFingerprint.value, selected.value?.minLength, selected.value?.maxLength, selected.value?.duplicateChars], () => {
  sourceDraft.value = selectedUserRow.value?.source?.join("\n") || "";
  minLengthDraft.value = selectedUserRow.value?.minLength || 1;
  maxLengthDraft.value = selectedUserRow.value?.maxLength || Math.max(minLengthDraft.value, 4);
  duplicateCharsDraft.value = selectedUserRow.value?.duplicateChars || "";
  generatedExamples.value = [];
}, {immediate: true});

watch(() => props.state.focusCultureNonce, () => {
  const cultureId = String(props.state.focusCultureId || "");
  if (cultureId && cultures.value.some(culture => String(culture.id) === cultureId)) {
    selectedCultureId.value = cultureId;
  }
}, {immediate: true});

watch(cultures, value => {
  if (!value.length) {
    selectedCultureId.value = "";
    return;
  }
  if (!value.some(culture => String(culture.id) === String(selectedCultureId.value))) {
    selectedCultureId.value = String(value[0].id);
  }
}, {immediate: true});

watch(visibleRows, nextRows => {
  const visibleIds = new Set(nextRows.map(row => String(row.id)));
  selectedNamebaseIds.value = selectedNamebaseIds.value.filter(id => visibleIds.has(String(id)));
});
</script>
