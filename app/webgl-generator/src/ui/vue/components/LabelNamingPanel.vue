<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="route-panel-summary" />

  <div class="route-panel-controls">
    <UiFilterInput :model-value="state.filter" placeholder="筛选标签 / id / 类型 / 归属" @update:model-value="callbacks.onFilter" />
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
    :selected-id="state.selectedLabelKey"
    row-id-key="key"
    :doubleClickAction="'edit'"
    empty-text="没有匹配的标签"
    :empty-action="labelEmptyAction"
    resizable-columns
    selectable-rows
    :selected-row-ids="selectedLabelKeys"
    @select="callbacks.onSelect"
    @locate="callbacks.onLocate"
    @edit="openRenameEditor"
    @empty-action="handleLabelManagementAction"
    @column-resize="callbacks.onColumnResize"
    @selection-change="selectedLabelKeys = $event"
  />

  <UiDetailGrid class-name="route-panel-details" empty-text="未选中标签" :rows="detailRows" />

  <UiPanelIoActions
    class-name="label-management-actions"
    label="标签新增删除"
    :actions="labelManagementActions"
    @action="handleLabelManagementAction"
  />

  <UiActionDock v-if="selected" v-model:active="activeAction" :actions="labelActions">
    <template #rename>
      <UiTextEditField
        class-name="label-name-editor"
        :label="selected.targetKind === LABEL_TARGET_KIND.STATE ? '国家名称' : selected.targetKind === LABEL_TARGET_KIND.PROVINCE ? '省份名称' : selected.targetKind === LABEL_TARGET_KIND.CUSTOM ? '标签文字' : '城市名称'"
        :model-value="selected.name"
        :max-length="48"
        @apply="name => callbacks.onRename(selected, name)"
      />
    </template>

    <template #note>
      <UiNoteField
        class-name="label-note-editor"
        :model-value="selected.noteBody"
        @apply="body => callbacks.onNoteChange(selected, body)"
        @clear="callbacks.onNoteChange(selected, '')"
      />
    </template>

    <template #display>
      <UiNumberField
        class-name="label-priority-editor"
        label="显示优先级"
        action-label="应用优先级"
        :model-value="selected.priority"
        :min="0"
        :max="100"
        :step="1"
        @apply="priority => callbacks.onPriorityChange(selected, priority)"
      />
      <div class="label-layout-actions">
        <UiButton variant="secondary" :disabled="!selected.manualPriority" @click="callbacks.onPriorityReset(selected)">恢复自动优先级</UiButton>
        <UiButton variant="secondary" @click="callbacks.onPositionToggle(selected)">{{ selected.positionLocked ? '解锁位置' : '锁定当前位置' }}</UiButton>
      </div>
      <p class="label-layout-help">优先级参与碰撞与缩放筛选，但不会强制所有冲突标签同时显示；锁定位置保存世界锚点。</p>
    </template>
  </UiActionDock>
</template>

<script setup>
import {computed, nextTick, ref, watch} from "vue";
import UiActionDock from "./base/UiActionDock.vue";
import UiButton from "./base/UiButton.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiNoteField from "./base/UiNoteField.vue";
import UiNumberField from "./base/UiNumberField.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiPanelIoActions from "./base/UiPanelIoActions.vue";
import UiTextEditField from "./base/UiTextEditField.vue";
import {LABEL_TARGET_KIND} from "../../../runtime/object-kinds.js";
import {resolveLabelLayout} from "../../../runtime/label-layout-registry.js";
import {readObjectNote} from "../../../runtime/object-notes.js";
import {formatNumber as formatDisplayNumber} from "../../display-units.js";
import {compareListValues, compareRowsByKey} from "../../sort-utils.js";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";
import {useVisibleRowSelection} from "../composables/use-visible-row-selection.js";

defineOptions({
  name: "LabelNamingPanel"
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
  {key: "priority", label: "优先级"},
  {key: "type", label: "类型"},
  {key: "name", label: "名称"},
  {key: "id", label: "ID"}
]);

const columns = Object.freeze([
  {key: "id", label: "ID", align: "right"},
  {key: "type", label: "类型"},
  {key: "name", label: "名称"},
  {key: "owner", label: "归属"},
  {key: "status", label: "状态"},
  {key: "priority", label: "优先级", align: "right", format: value => formatNumber(value)}
]);

const rows = computed(() => {
  props.state.version;
  return labelRows(props.state.map);
});
const unitPreferences = useUnitPreferences();
const activeAction = ref(null);
const renameRequestKey = ref(null);
const labelActions = Object.freeze([
  {key: "rename", label: "重命名", icon: "✎"},
  {key: "note", label: "编辑备注", icon: "☰"},
  {key: "display", label: "显示布局", icon: "⌖"}
]);
const visibleRows = computed(() => sortRows(filterRows(rows.value, props.state.filter), props.state.sortKey, props.state.sortDir));
const {selectedRowIds: selectedLabelKeys, selectedRows: selectedLabelRows} = useVisibleRowSelection(visibleRows, {idKey: "key"});
const highlightableLabelRows = computed(() => selectedLabelRows.value.filter(row => !row.hidden));
const filterEmptyAction = computed(() => String(props.state.filter || "").trim()
  ? {key: "clear-filter", label: "清空筛选", icon: "⌫"}
  : null);
const defaultLabelEmptyAction = Object.freeze({key: "add", label: "新增标签", icon: "+"});
const labelEmptyAction = computed(() => filterEmptyAction.value || defaultLabelEmptyAction);
const selected = computed(() => rows.value.find(row => row.key === props.state.selectedLabelKey) || null);
const labelManagementActions = computed(() => [
  {key: "highlight-selected", label: `高亮可见标签 ${formatNumber(highlightableLabelRows.value.length)}`, icon: "◉", disabled: !highlightableLabelRows.value.length},
  {key: "clear-highlights", label: `清除高亮 ${formatNumber(props.state.highlightCount || 0)}`, icon: "○", disabled: !props.state.highlightCount},
  defaultLabelEmptyAction,
  {key: selected.value?.hidden ? "restore" : "delete", label: selected.value?.hidden ? "恢复标签" : "删除标签", icon: selected.value?.hidden ? "↺" : "×", disabled: !selected.value}
]);

const summaryMetrics = computed(() => [
  {label: "标签", value: formatNumber(rows.value.length)},
  {label: "城市", value: formatNumber(rows.value.filter(row => row.targetKind === LABEL_TARGET_KIND.CITY).length)},
  {label: "国家", value: formatNumber(rows.value.filter(row => row.targetKind === LABEL_TARGET_KIND.STATE).length)},
  {label: "省份", value: formatNumber(rows.value.filter(row => row.targetKind === LABEL_TARGET_KIND.PROVINCE).length)},
  {label: "手工", value: formatNumber(rows.value.filter(row => row.targetKind === LABEL_TARGET_KIND.CUSTOM).length)},
  {label: "高亮", value: formatNumber(props.state.highlightCount || 0)},
  {label: "筛选", value: formatNumber(visibleRows.value.length)}
]);

const detailRows = computed(() => selected.value ? [
  {label: "类型", value: selected.value.type},
  {label: "名称", value: selected.value.name},
  {label: "归属", value: selected.value.owner},
  {label: "显示策略", value: selected.value.visibility},
  {label: "状态", value: selected.value.status},
  {label: "优先级", value: `${selected.value.priority}（${selected.value.manualPriority ? "手工" : "自动"}）`},
  {label: "位置", value: selected.value.positionLocked ? `已锁定 ${formatPoint(selected.value.x, selected.value.y)}` : "自动世界锚点"},
  {label: "中心", value: selected.value.center},
  {label: "目标 id", value: selected.value.targetId},
  {label: "备注", value: selected.value.noteBody ? `有备注（${formatNumber(selected.value.noteBody.length)}字）` : "无"}
] : []);

watch(() => selected.value?.key, key => {
  activeAction.value = null;
  if (renameRequestKey.value !== key) return;
  renameRequestKey.value = null;
  nextTick(() => {
    activeAction.value = "rename";
  });
});

function handleLabelManagementAction(key) {
  if (key === "highlight-selected") {
    props.callbacks.onHighlight?.(highlightableLabelRows.value);
    return;
  }
  if (key === "clear-highlights") {
    props.callbacks.onClearHighlights?.();
    return;
  }
  if (key === "clear-filter") {
    props.callbacks.onFilter?.("");
    return;
  }
  if (key === "add") {
    props.callbacks.onAdd?.();
    return;
  }
  if (!selected.value) return;
  if (key === "restore") props.callbacks.onRestore?.(selected.value);
  if (key === "delete") props.callbacks.onDelete?.(selected.value);
}

function openRenameEditor(row) {
  renameRequestKey.value = row?.key ?? null;
  props.callbacks.onSelect?.(row);
  nextTick(() => {
    if (selected.value?.key !== row?.key) return;
    renameRequestKey.value = null;
    activeAction.value = "rename";
  });
}

function labelRows(map) {
  return [...customLabelRows(map), ...cityLabelRows(map), ...stateLabelRows(map), ...provinceLabelRows(map)];
}

function customLabelRows(map) {
  return (map?.labels?.custom || [])
    .filter(label => label && Number.isInteger(label.id))
    .map(label => {
      const key = `${LABEL_TARGET_KIND.CUSTOM}:${label.id}`;
      const note = readObjectNote(map, {kind: "label", id: key});
      const layout = resolveLabelLayout(map, LABEL_TARGET_KIND.CUSTOM, label.id, null, {x: label.x, y: label.y, priority: 90000 - label.id, minScale: 0.25});
      return {
        key,
        id: label.id,
        targetId: label.id,
        targetKind: LABEL_TARGET_KIND.CUSTOM,
        type: "手工标签",
        name: label.text || `标签 #${label.id}`,
        owner: "手工",
        visibility: "随城市标签图层显示",
        status: layout.locked ? "显示 · 位置锁定" : "显示",
        hidden: false,
        center: formatPoint(layout.position.x, layout.position.y),
        x: layout.position.x,
        y: layout.position.y,
        priority: layout.priority,
        manualPriority: layout.manualPriority,
        positionLocked: layout.locked,
        rank: "custom",
        noteBody: note?.body || "",
        noteUpdatedAt: note?.updatedAt || ""
      };
    });
}

function cityLabelRows(map) {
  return (map?.settlements?.cities || [])
    .filter(city => city && Number.isInteger(city.id))
    .map(city => {
      const state = map?.politics?.states?.[city.state];
      const population = Number(city.population) || 0;
      const priority = (city.capital ? 100000 : 0) + (city.port ? 10000 : 0) + population;
      const key = `${LABEL_TARGET_KIND.CITY}:${city.id}`;
      const note = readObjectNote(map, {kind: "label", id: key});
      const layout = resolveLabelLayout(map, LABEL_TARGET_KIND.CITY, city.id, city, {x: city.x, y: city.y, priority, minScale: 0});
      return {
        key,
        id: city.id,
        targetId: city.id,
        targetKind: LABEL_TARGET_KIND.CITY,
        type: city.capital ? "首都标签" : city.port ? "港口标签" : "城市标签",
        name: city.name || `城市 #${city.id}`,
        owner: state?.name || "无国家",
        visibility: isHiddenLabel(map, LABEL_TARGET_KIND.CITY, city.id) ? "已隐藏，不在地图显示" : "随城市标签上限和缩放显示",
        status: isHiddenLabel(map, LABEL_TARGET_KIND.CITY, city.id) ? "隐藏" : layout.locked ? "显示 · 位置锁定" : "显示",
        hidden: isHiddenLabel(map, LABEL_TARGET_KIND.CITY, city.id),
        center: formatPoint(layout.position.x, layout.position.y),
        x: layout.position.x,
        y: layout.position.y,
        priority: layout.priority,
        manualPriority: layout.manualPriority,
        positionLocked: layout.locked,
        rank: city.capital ? "capital" : city.port ? "port" : "city",
        noteBody: note?.body || "",
        noteUpdatedAt: note?.updatedAt || ""
      };
    });
}

function stateLabelRows(map) {
  return (map?.politics?.states || [])
    .filter(state => state && (state.i || state.id) && !state.removed)
    .map(state => {
      const stateId = state.i ?? state.id;
      const capital = map?.pack?.burgs?.[state.capital];
      const point = stateLabelPoint(map, state);
      const key = `${LABEL_TARGET_KIND.STATE}:${stateId}`;
      const note = readObjectNote(map, {kind: "label", id: key});
      const autoPriority = Number(state.area || 0) + Number(state.burgs || 0) * 100;
      const layout = resolveLabelLayout(map, LABEL_TARGET_KIND.STATE, stateId, null, {x: point?.[0], y: point?.[1], priority: autoPriority, minScale: 0.5});
      return {
        key,
        id: stateId,
        targetId: stateId,
        targetKind: LABEL_TARGET_KIND.STATE,
        type: "国家名称",
        name: state.name || `国家 #${stateId}`,
        owner: capital?.name ? `首都 ${capital.name}` : "无首都",
        visibility: isHiddenLabel(map, LABEL_TARGET_KIND.STATE, stateId) ? "已隐藏，不在地图显示" : "国家视图下显示",
        status: isHiddenLabel(map, LABEL_TARGET_KIND.STATE, stateId) ? "隐藏" : layout.locked ? "显示 · 位置锁定" : "显示",
        hidden: isHiddenLabel(map, LABEL_TARGET_KIND.STATE, stateId),
        center: Number.isFinite(layout.position.x) ? formatPoint(layout.position.x, layout.position.y) : "none",
        x: layout.position.x,
        y: layout.position.y,
        priority: layout.priority,
        manualPriority: layout.manualPriority,
        positionLocked: layout.locked,
        rank: "state",
        noteBody: note?.body || "",
        noteUpdatedAt: note?.updatedAt || ""
      };
    });
}

function provinceLabelRows(map) {
  return (map?.politics?.provinces || [])
    .filter(province => province && (province.i || province.id) && !province.removed)
    .map(province => {
      const provinceId = province.i ?? province.id;
      const state = map?.politics?.states?.[province.state];
      const point = Array.isArray(province.pole) ? province.pole : map?.pack?.cells?.p?.[province.center];
      const key = `${LABEL_TARGET_KIND.PROVINCE}:${provinceId}`;
      const note = readObjectNote(map, {kind: "label", id: key});
      const hidden = isHiddenLabel(map, LABEL_TARGET_KIND.PROVINCE, provinceId);
      const autoPriority = Number(province.area || 0) + Number(province.burgs || 0) * 40;
      const layout = resolveLabelLayout(map, LABEL_TARGET_KIND.PROVINCE, provinceId, null, {x: point?.[0], y: point?.[1], priority: autoPriority, minScale: 0.8});
      return {
        key,
        id: provinceId,
        targetId: provinceId,
        targetKind: LABEL_TARGET_KIND.PROVINCE,
        type: "省份名称",
        name: province.name || `省份 #${provinceId}`,
        owner: state?.name || "无国家",
        visibility: hidden ? "已隐藏，不在地图显示" : "随省份名称图层和缩放显示",
        status: hidden ? "隐藏" : layout.locked ? "显示 · 位置锁定" : "显示",
        hidden,
        center: Number.isFinite(layout.position.x) ? formatPoint(layout.position.x, layout.position.y) : "none",
        x: layout.position.x,
        y: layout.position.y,
        priority: layout.priority,
        manualPriority: layout.manualPriority,
        positionLocked: layout.locked,
        rank: "province",
        noteBody: note?.body || "",
        noteUpdatedAt: note?.updatedAt || ""
      };
    });
}

function isHiddenLabel(map, targetKind, targetId) {
  return Array.isArray(map?.labels?.hidden?.[targetKind]) && map.labels.hidden[targetKind].includes(Number(targetId));
}

function stateLabelPoint(map, state) {
  const center = Number.isInteger(state.center) ? state.center : null;
  if (center !== null && map?.pack?.cells?.p?.[center]) return map.pack.cells.p[center];
  const gridCenter = Number.isInteger(state.gridCenter) ? state.gridCenter : null;
  if (gridCenter !== null) return map?.grid?.points?.[map.grid.cells.p?.[gridCenter]] || null;
  return null;
}

function filterRows(sourceRows, filter) {
  const query = filter.trim().toLowerCase();
  if (!query) return sourceRows;
  return sourceRows.filter(row =>
    String(row.id).includes(query)
    || row.type.toLowerCase().includes(query)
    || row.name.toLowerCase().includes(query)
    || row.owner.toLowerCase().includes(query)
  );
}

function sortRows(sourceRows, key, direction) {
  return [...sourceRows].sort((a, b) => (
    compareRowsByKey(a, b, key, direction, {fallbackKey: null})
    || compareListValues(a.targetKind, b.targetKind)
    || compareListValues(a.id, b.id)
  ));
}

function formatPoint(x, y) {
  return `${formatNumber(x)}, ${formatNumber(y)}`;
}

function formatNumber(value) {
  return formatDisplayNumber(value, unitPreferences.value);
}
</script>
