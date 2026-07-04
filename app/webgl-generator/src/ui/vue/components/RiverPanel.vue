<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="river-panel-summary" />

  <div class="river-panel-controls">
    <UiFilterInput :model-value="state.filter" placeholder="筛选名称 / id / 类型" @update:model-value="callbacks.onFilter" />
    <UiButton variant="secondary" :disabled="!visibleRows.length" @click="callbacks.onRenameVisibleFromNamebase?.(visibleRows.map(row => row.id))">按名称库重命名筛选</UiButton>
  </div>

  <UiSortBar class-name="river-panel-sort" :options="sortOptions" :active-key="state.sortKey" :direction="state.sortDir" @sort="callbacks.onSort" />

  <UiObjectTable
    :columns="columns"
    :rows="visibleRows"
    :selected-id="selectedId"
    empty-text="没有匹配的河流"
    @select="callbacks.onSelect"
    @locate="callbacks.onLocate"
  />

  <UiDetailGrid class-name="river-panel-details" empty-text="未选中河流" :rows="detailRows" />

  <template v-if="selected">
    <UiActionDock v-model:active="activeAction" :actions="riverActions">
      <template #rename>
        <UiTextEditField
          class-name="river-name-editor"
          :model-value="selected.name"
          :max-length="48"
          @apply="name => callbacks.onRename(selected.id, name)"
        />
      </template>

      <template #width>
        <div class="river-width-editor">
          <UiSliderField
            label="宽度因子"
            field-class="river-width-field"
            :model-value="widthDraft"
            unit-label="x"
            :min="0.2"
            :max="3"
            :step="0.05"
            @input="value => widthDraft = normalizeWidth(value)"
          />
          <div class="river-width-actions">
            <UiButton variant="secondary" @click="callbacks.onSetWidthFactor(selected.id, widthDraft)">应用宽度</UiButton>
          </div>
        </div>
      </template>

      <template #edit>
        <UiButton variant="secondary" @click="callbacks.onEdit(selected)">{{ editing ? "退出河流编辑" : "进入河流编辑" }}</UiButton>
      </template>

      <template #note>
        <UiNoteField
          class-name="river-note-editor"
          :model-value="selected.noteBody"
          @apply="body => callbacks.onNoteChange(selected.id, body)"
          @clear="callbacks.onNoteChange(selected.id, '')"
        />
      </template>
    </UiActionDock>

    <UiHistoryActions class-name="river-history-note" :history="state.history" label="最近命令" @undo="callbacks.onUndo" @redo="callbacks.onRedo" />
  </template>
</template>

<script setup>
import {computed, ref, watch} from "vue";
import UiActionDock from "./base/UiActionDock.vue";
import UiButton from "./base/UiButton.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiHistoryActions from "./base/UiHistoryActions.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiNoteField from "./base/UiNoteField.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiSliderField from "./base/UiSliderField.vue";
import UiSortBar from "./base/UiSortBar.vue";
import UiTextEditField from "./base/UiTextEditField.vue";
import {formatDistance, formatNumber as formatDisplayNumber} from "../../display-units.js";
import {findByObjectId, sameObjectId} from "../../object-id.js";
import {readObjectNote} from "../../../runtime/object-notes.js";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";

defineOptions({
  name: "RiverPanel"
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
  {key: "flux", label: "流量"},
  {key: "length", label: "长度"},
  {key: "id", label: "ID"}
]);

const columns = Object.freeze([
  {key: "id", label: "ID", align: "right"},
  {key: "name", label: "名称"},
  {key: "type", label: "类型"},
  {key: "length", label: "长度", align: "right", format: value => formatLength(value)},
  {key: "flux", label: "流量", align: "right", format: value => formatNumber(value)}
]);

const unitPreferences = useUnitPreferences();
const activeAction = ref(null);
const widthDraft = ref(1);
const rows = computed(() => {
  props.state.version;
  return riverRows(props.state.map);
});
const selectedId = computed(() => props.state.selection?.object?.kind === "river" ? props.state.selection.object.id : null);
const selected = computed(() => findByObjectId(rows.value, selectedId.value));
const editing = computed(() => props.state.editingObject?.kind === "river" && sameObjectId(props.state.editingObject.id, selectedId.value));
const visibleRows = computed(() => sortRows(filterRows(rows.value, props.state.filter), props.state.sortKey, props.state.sortDir));
const totalLength = computed(() => rows.value.reduce((sum, row) => sum + row.length, 0));
const maxFlux = computed(() => rows.value.reduce((max, row) => Math.max(max, row.flux), 0));
const riverActions = computed(() => [
  {key: "rename", label: "重命名", icon: "✎"},
  {key: "width", label: "调整宽度", icon: "↔"},
  {key: "edit", label: editing.value ? "退出编辑" : "进入编辑", icon: "◎"},
  {key: "note", label: "编辑备注", icon: "☰"}
]);

const summaryMetrics = computed(() => [
  {label: "河流", value: formatNumber(rows.value.length)},
  {label: "总长度", value: formatLength(totalLength.value)},
  {label: "最大流量", value: formatNumber(maxFlux.value)},
  {label: "筛选", value: formatNumber(visibleRows.value.length)}
]);

const detailRows = computed(() => selected.value ? [
  {label: "选中", value: `#${selected.value.id} / ${selected.value.type}`},
  {label: "长度", value: formatLength(selected.value.length)},
  {label: "流量", value: formatNumber(selected.value.flux)},
  {label: "河段", value: formatNumber(selected.value.segments)},
  {label: "宽度因子", value: selected.value.widthFactor.toFixed(2)},
  {label: "备注", value: selected.value.noteBody ? `有备注（${formatNumber(selected.value.noteBody.length)}字）` : "无"}
] : []);

watch(() => selected.value?.id, () => {
  widthDraft.value = normalizeWidth(selected.value?.widthFactor ?? 1);
  activeAction.value = null;
}, {immediate: true});

watch(() => selected.value?.widthFactor, next => {
  widthDraft.value = normalizeWidth(next ?? 1);
});

function riverRows(map) {
  return (map?.rivers?.rivers || []).map(river => {
    const length = riverLength(river);
    const flux = river.flux || river.discharge || river.width || 0;
    const note = readObjectNote(map, {kind: "river", id: river.id});
    return {
      id: river.id,
      name: river.name || `#${river.id}`,
      type: river.parent ? "支流" : "主河",
      length,
      flux,
      widthFactor: Number.isFinite(river.widthFactor) ? river.widthFactor : 1,
      segments: Math.max(0, (river.points?.length || 0) - 1),
      noteBody: note?.body || "",
      noteUpdatedAt: note?.updatedAt || ""
    };
  });
}

function filterRows(sourceRows, filter) {
  const query = filter.trim().toLowerCase();
  if (!query) return sourceRows;
  return sourceRows.filter(row => String(row.id).includes(query) || row.name.toLowerCase().includes(query) || row.type.toLowerCase().includes(query));
}

function sortRows(sourceRows, key, direction) {
  const factor = direction === "asc" ? 1 : -1;
  return [...sourceRows].sort((a, b) => {
    if (a[key] === b[key]) return a.id - b.id;
    return a[key] > b[key] ? factor : -factor;
  });
}

function riverLength(river) {
  const points = river.points || [];
  let length = 0;
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index];
    const b = points[index + 1];
    if (!isPoint(a) || !isPoint(b)) continue;
    length += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return length;
}

function formatLength(value) {
  return formatDistance(value, unitPreferences.value);
}

function formatNumber(value) {
  return formatDisplayNumber(value, unitPreferences.value);
}

function normalizeWidth(value) {
  return Math.round((Number(value) || 1) * 100) / 100;
}

function isPoint(point) {
  return Number.isFinite(point?.[0]) && Number.isFinite(point?.[1]);
}
</script>
