<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="river-panel-summary" />

  <div class="river-panel-controls">
    <UiFilterInput :model-value="state.filter" placeholder="筛选名称 / id / 类型 / 干流" @update:model-value="callbacks.onFilter" />
    <UiButton variant="danger" @click="callbacks.onRegenerate?.()">重新生成河流</UiButton>
  </div>
  <UiRegenerationLockActions v-bind="regenerationLocks.actionProps" v-on="regenerationLocks.actionListeners" />
  <UiObjectTable
    v-bind="regenerationLocks.tableProps"
    v-on="regenerationLocks.tableListeners"
    :columns="columns"
    :column-widths="state.columnWidths"
    :rows="visibleRows"
    :sort-key="state.sortKey"
    :sort-direction="state.sortDir"
    :sort-options="sortOptions"
    sortable
    @sort="callbacks.onSort"
    :selected-id="selectedId"
    :doubleClickAction="'edit'"
    empty-text="没有匹配的河流"
    :empty-action="filterEmptyAction"
    resizable-columns
    selectable-rows
    :selected-row-ids="selectedRiverIds"
    @select="callbacks.onSelect"
    @locate="callbacks.onLocate"
    @edit="openRenameEditor"
    @empty-action="handleEmptyAction"
    @column-resize="callbacks.onColumnResize"
    @selection-change="selectedRiverIds = $event"
  />

  <UiPanelIoActions
    class-name="river-panel-list-actions"
    label="河流列表操作"
    :actions="riverListActions"
    @action="handleRiverListAction"
  />

  <UiDetailGrid class-name="river-panel-details" empty-text="未选中河流" :rows="detailRows" />

  <template v-if="selected">
    <UiActionDock host-id="RiverPanel" v-model:active="activeAction" :actions="riverActions" @select="handleRiverActionSelect">
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

      <template #note>
        <UiNoteField
          class-name="river-note-editor"
          :model-value="selected.noteBody"
          @apply="body => callbacks.onNoteChange(selected.id, body)"
          @clear="callbacks.onNoteChange(selected.id, '')"
        />
      </template>
    </UiActionDock>
  </template>
</template>

<script setup>
import {computed, nextTick, ref, watch} from "vue";
import UiActionDock from "./base/UiActionDock.vue";
import UiButton from "./base/UiButton.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiNoteField from "./base/UiNoteField.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiPanelIoActions from "./base/UiPanelIoActions.vue";
import UiRegenerationLockActions from "./base/UiRegenerationLockActions.vue";
import UiSliderField from "./base/UiSliderField.vue";
import UiTextEditField from "./base/UiTextEditField.vue";
import {estimateRiverRunoffFlowRange, formatArea, formatDistance, formatNumber as formatDisplayNumber, formatPrecipitation, formatRiverFlow as formatDisplayRiverFlow, formatRiverRunoffFlowRange, riverFluxToCubicMetersPerSecond} from "../../display-units.js";
import {findByObjectId, sameObjectId} from "../../object-id.js";
import {compareRowsByKey} from "../../sort-utils.js";
import {readObjectNote} from "../../../runtime/object-notes.js";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";
import {useVisibleRowSelection} from "../composables/use-visible-row-selection.js";
import {useRegenerationLockSelection} from "../composables/use-regeneration-lock-selection.js";

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
  {key: "parentLabel", label: "干流"},
  {key: "length", label: "长度", align: "right", format: value => formatLength(value)},
  {key: "flux", label: "流量", align: "right", format: value => formatRiverFlow(value)}
]);

const unitPreferences = useUnitPreferences();
const activeAction = ref(null);
const renameRequestId = ref(null);
const widthDraft = ref(1);
const rows = computed(() => {
  props.state.version;
  return riverRows(props.state.map);
});
const selectedId = computed(() => props.state.selection?.object?.kind === "river" ? props.state.selection.object.id : null);
const selected = computed(() => findByObjectId(rows.value, selectedId.value));
const editing = computed(() => props.state.editingObject?.kind === "river" && sameObjectId(props.state.editingObject.id, selectedId.value));
const visibleRows = computed(() => sortRows(filterRows(rows.value, props.state.filter), props.state.sortKey, props.state.sortDir));
const regenerationLocks = useRegenerationLockSelection({panelId: "river-panel", kind: "river", rows: visibleRows});
const {selectedRowIds: selectedRiverIds} = useVisibleRowSelection(visibleRows);
const selectedRiverRows = regenerationLocks.selectedRows;
const filterEmptyAction = computed(() => String(props.state.filter || "").trim()
  ? {key: "clear-filter", label: "清空筛选", icon: "⌫"}
  : null);
const totalLength = computed(() => rows.value.reduce((sum, row) => sum + row.length, 0));
const maxFlux = computed(() => rows.value.reduce((max, row) => Math.max(max, row.flux), 0));
const riverActions = computed(() => [
  {key: "edit", resultClass: "toggle-canvas-mode", label: editing.value ? "退出河流编辑" : "进入河流编辑", icon: "◎", panel: false, active: editing.value},
  {key: "rename", resultClass: "open-secondary", label: "重命名", icon: "✎"},
  {key: "width", resultClass: "open-secondary", label: "调整宽度", icon: "↔"},
  {key: "note", resultClass: "open-secondary", label: "编辑备注", icon: "☰"}
]);
const riverListActions = computed(() => [
  {key: "create", label: props.state.createMode ? "取消新增河流" : "新增河流", icon: "+", active: props.state.createMode},
  {key: "highlight-selected", label: `高亮选中 ${formatNumber(selectedRiverRows.value.length)}`, icon: "◉", disabled: !selectedRiverRows.value.length},
  {key: "clear-highlights", label: `清除高亮 ${formatNumber(props.state.highlightCount || 0)}`, icon: "○", disabled: !props.state.highlightCount},
  {key: "rename-visible", label: "按名称库重命名筛选河流", icon: "名", disabled: !visibleRows.value.length},
  {key: "edit", label: editing.value ? "退出河流编辑" : "进入河流编辑", icon: "◎", active: editing.value, disabled: !selected.value},
  {key: "delete-selected", label: `批量删除选中 ${formatNumber(selectedRiverRows.value.length)}`, icon: "删", disabled: !selectedRiverRows.value.length},
  {key: "delete", label: "删除选中河流及支流", icon: "删", disabled: !selected.value}
]);

const summaryMetrics = computed(() => [
  {label: "河流", value: formatNumber(rows.value.length)},
  {label: "总长度", value: formatLength(totalLength.value)},
  {label: "最大流量", value: formatRiverFlow(maxFlux.value)},
  {label: "高亮", value: formatNumber(props.state.highlightCount || 0)},
  {label: "筛选", value: formatNumber(visibleRows.value.length)}
]);

const detailRows = computed(() => selected.value ? [
  {label: "选中", value: `#${selected.value.id} / ${selected.value.type}`},
  {label: "汇入干流", value: selected.value.parentLabel},
  {label: "流域主河", value: selected.value.basinLabel},
  {label: "河网状态", value: selected.value.networkStatusLabel},
  {label: "汇流 cell", value: selected.value.confluence >= 0 ? `#${selected.value.confluence}` : "—"},
  {label: "长度", value: formatLength(selected.value.length)},
  {label: "流量", value: formatRiverFlow(selected.value.flux)},
  {label: "汇水面积", value: formatHydrologyArea(selected.value.hydrology)},
  {label: "汇水格子", value: formatHydrologyCells(selected.value.hydrology)},
  {label: "流域均降水", value: formatHydrologyPrecipitation(selected.value.hydrology)},
  {label: "物理估算", value: formatHydrologyFlowRange(selected.value.hydrology)},
  {label: "模型 / 估算", value: formatHydrologyFlowRatio(selected.value)},
  {label: "诊断方式", value: formatHydrologyMethod(selected.value.hydrology)},
  {label: "河段", value: formatNumber(selected.value.segments)},
  {label: "宽度因子", value: selected.value.widthFactor.toFixed(2)},
  {label: "备注", value: selected.value.noteBody ? `有备注（${formatNumber(selected.value.noteBody.length)}字）` : "无"}
] : []);

watch(() => selected.value?.id, id => {
  widthDraft.value = normalizeWidth(selected.value?.widthFactor ?? 1);
  activeAction.value = null;
  if (!sameObjectId(renameRequestId.value, id)) return;
  renameRequestId.value = null;
  nextTick(() => {
    activeAction.value = "rename";
  });
}, {immediate: true});

watch(() => selected.value?.widthFactor, next => {
  widthDraft.value = normalizeWidth(next ?? 1);
});

function riverRows(map) {
  const rivers = map?.rivers?.rivers || [];
  const byId = new Map(rivers.map(river => [Number(river.id ?? river.i), river]));
  return rivers.map(river => {
    const length = riverLength(river);
    const flux = river.flux || river.discharge || river.width || 0;
    const note = readObjectNote(map, {kind: "river", id: river.id});
    const parentId = Number(river.parent || 0);
    const parent = byId.get(parentId);
    const basinId = Number(river.basin || river.id);
    const basin = byId.get(basinId);
    const networkStatus = river.networkStatus || (parentId && !parent ? "orphaned" : "valid");
    return {
      id: river.id,
      name: river.name || `#${river.id}`,
      type: networkStatus === "orphaned" ? (parentId ? "支流（无出口）" : "主河（无出口）") : parentId ? "支流" : river.outletKind === "lake" ? "入湖河流" : "主河",
      parentId,
      parentLabel: networkStatus === "orphaned"
        ? parentId && parent ? `无有效出口（→ #${parentId} ${parent.name || ""}）` : "无有效出口"
        : parentId ? `#${parentId} ${parent?.name || "未知干流"}` : "—",
      basinLabel: `#${basinId} ${basin?.name || river.name || ""}`,
      confluence: Number.isInteger(Number(river.confluence)) ? Number(river.confluence) : -1,
      networkStatus,
      networkIssue: river.networkIssue || "",
      networkStatusLabel: formatNetworkStatus(networkStatus, river.networkIssue),
      length,
      flux,
      hydrology: normalizeHydrology(river.hydrology),
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
  return sourceRows.filter(row => String(row.id).includes(query) || row.name.toLowerCase().includes(query) || row.type.toLowerCase().includes(query) || row.parentLabel.toLowerCase().includes(query));
}

function formatNetworkStatus(status, issue = "") {
  if (status === "orphaned") {
    return {
      "disconnected-path": "河道 cell 不连续",
      "invalid-water-outlet": "水体出口无效",
      "invalid-border-outlet": "出界位置无效",
      "invalid-downstream-basin": "下游根河无有效出口",
      "parent-cycle": "父河链循环",
      "missing-outlet": "根河无有效出口"
    }[issue] || "无有效出口水系";
  }
  return {
    valid: "河网正常",
    "lake-inlet": "入湖",
    "ocean-mouth": "入海",
    "border-outlet": "出界",
    orphaned: "无有效出口水系"
  }[status] || status || "河网正常";
}

function sortRows(sourceRows, key, direction) {
  return [...sourceRows].sort((a, b) => compareRowsByKey(a, b, key, direction));
}

function handleRiverActionSelect(key) {
  if (key === "edit" && selected.value) props.callbacks.onEdit?.(selected.value);
}

function openRenameEditor(row) {
  renameRequestId.value = row?.id ?? null;
  if (!sameObjectId(selected.value?.id, row?.id)) props.callbacks.onSelect?.(row);
  nextTick(() => {
    if (!sameObjectId(selected.value?.id, row?.id)) return;
    renameRequestId.value = null;
    activeAction.value = "rename";
  });
}

function handleRiverListAction(key) {
  if (key === "create") props.callbacks.onCreateMode?.(!props.state.createMode);
  if (key === "highlight-selected") props.callbacks.onHighlight?.(selectedRiverRows.value);
  if (key === "clear-highlights") props.callbacks.onClearHighlights?.();
  if (key === "rename-visible") props.callbacks.onRenameVisibleFromNamebase?.(visibleRows.value.map(row => row.id));
  if (key === "locate" && selected.value) props.callbacks.onLocate?.(selected.value);
  if (key === "edit" && selected.value) props.callbacks.onEdit?.(selected.value);
  if (key === "delete-selected") props.callbacks.onDeleteMany?.(selectedRiverRows.value.map(row => row.id));
  if (key === "delete" && selected.value) props.callbacks.onDelete?.(selected.value.id);
}

function handleEmptyAction(key) {
  if (key === "clear-filter") props.callbacks.onFilter?.("");
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

function formatRiverFlow(value) {
  return formatDisplayRiverFlow(value, unitPreferences.value);
}

function formatHydrologyArea(hydrology) {
  if (!hasHydrology(hydrology)) return "未知";
  return formatArea(hydrology.catchmentArea, unitPreferences.value);
}

function formatHydrologyCells(hydrology) {
  if (!hasHydrology(hydrology)) return "未知";
  return formatNumber(hydrology.catchmentCells);
}

function formatHydrologyPrecipitation(hydrology) {
  if (!hasHydrology(hydrology)) return "未知";
  return formatPrecipitation(hydrology.averagePrecipitation, unitPreferences.value);
}

function formatHydrologyFlowRange(hydrology) {
  if (!hasHydrology(hydrology)) return "未知";
  return `${formatRiverRunoffFlowRange(hydrology, unitPreferences.value)}（径流系数 0.2-0.5）`;
}

function formatHydrologyFlowRatio(row) {
  if (!hasHydrology(row?.hydrology)) return "未知";
  const current = estimateRiverRunoffFlowRange(row.hydrology, unitPreferences.value).medium;
  if (!Number.isFinite(current) || current <= 0) return "未知";
  const actual = riverFluxToCubicMetersPerSecond(row.flux, unitPreferences.value);
  return `${formatNumber(actual / current)}x（相对 0.3 径流）`;
}

function formatHydrologyMethod(hydrology) {
  if (!hasHydrology(hydrology)) return "未知";
  return hydrology.method === "river-path-fallback" ? "河道近似" : "汇水累计";
}

function normalizeHydrology(hydrology = {}) {
  const catchmentArea = Number(hydrology.catchmentArea);
  const catchmentCells = Number(hydrology.catchmentCells);
  const averagePrecipitation = Number(hydrology.averagePrecipitation);
  return {
    catchmentArea: Number.isFinite(catchmentArea) ? catchmentArea : 0,
    catchmentCells: Number.isFinite(catchmentCells) ? catchmentCells : 0,
    averagePrecipitation: Number.isFinite(averagePrecipitation) ? averagePrecipitation : 0,
    method: String(hydrology.method || "")
  };
}

function hasHydrology(hydrology) {
  return Number.isFinite(hydrology?.catchmentArea) && hydrology.catchmentArea > 0 && Number.isFinite(hydrology.averagePrecipitation);
}

function normalizeWidth(value) {
  return Math.round((Number(value) || 1) * 100) / 100;
}

function isPoint(point) {
  return Number.isFinite(point?.[0]) && Number.isFinite(point?.[1]);
}
</script>
