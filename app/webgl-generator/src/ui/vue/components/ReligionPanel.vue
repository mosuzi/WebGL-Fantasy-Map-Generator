<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="religion-panel-summary" />

  <div class="inheritance-tree-launcher religion-tree-overview" aria-label="宗教树总览">
    <div class="inheritance-tree-header">
      <span>宗教树总览</span>
      <strong>{{ formatNumber(treeOverview.length) }}</strong>
    </div>
    <ElButton
      class="inheritance-tree-open"
      @click="treePanelOpen = true"
    >
      打开树状面板
    </ElButton>
  </div>

  <UiTreeDisplayPanel
    v-model:open="treePanelOpen"
    title="宗教树总览"
    :nodes="treeOverview"
    :selected-id="state.selectedReligionId"
    @select="selectTreeNode"
  />

  <div class="religion-panel-controls">
    <UiFilterInput :model-value="state.filter" placeholder="筛选名称 / id / 类型 / 文化 / 国家" @update:model-value="callbacks.onFilter" />
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
    :selected-id="state.selectedReligionId"
    :doubleClickAction="'edit'"
    empty-text="没有匹配的宗教"
    :empty-action="religionEmptyAction"
    resizable-columns
    selectable-rows
    :selected-row-ids="selectedReligionIds"
    @select="callbacks.onSelect"
    @locate="callbacks.onLocate"
    @edit="openRenameEditor"
    @empty-action="handleListAction"
    @column-resize="callbacks.onColumnResize"
    @selection-change="selectedReligionIds = $event"
  />
  <UiPanelIoActions class-name="religion-panel-list-actions" label="宗教列表操作" :actions="religionListActions" @action="handleListAction" />

  <UiDetailGrid class-name="religion-panel-details" empty-text="未选中宗教" :rows="detailRows" />

  <UiSelectField
    input-id="religion-assignment-target"
    label="归属笔刷目标"
    :model-value="state.targetReligionId ?? 0"
    :options="assignmentOptions"
    @update:model-value="callbacks.onTargetReligionId"
  />
  <UiSliderField
    label="画笔大小"
    :model-value="state.assignmentRadius"
    :min="brushRadius.min"
    :max="brushRadius.max"
    :step="brushRadius.step"
    unit-label="地图单位"
    @input="callbacks.onAssignmentRadius"
  />

  <UiActionDock v-if="selected" host-id="ReligionPanel" v-model:active="activeAction" :actions="religionActions" @select="handleActionSelect">
    <template #rename>
      <UiTextEditField
        class-name="religion-name-editor"
        :model-value="selected.rawName"
        :max-length="64"
        @apply="name => callbacks.onRename(selected.id, name)"
      />
    </template>

    <template #color>
      <UiColorActionPanel
        class-name="religion-color-field"
        :model-value="selected.color"
        @apply="color => callbacks.onColorChange(selected.id, color)"
      />
    </template>

    <template #parent>
      <UiSelectField
        input-id="religion-parent-select"
        class-name="religion-parent-select"
        label="继承自"
        :model-value="selected.parentId"
        :options="parentOptions"
        @update:model-value="parentId => callbacks.onParentChange(selected.id, parentId)"
      />
    </template>

    <template #expansion>
      <div class="social-expansion-editor" aria-label="宗教中心与扩张编辑">
        <ElForm label-position="top" size="small">
          <ElFormItem label="中心 pack cell">
            <ElInputNumber v-model="expansionDraft.center" :min="0" :step="1" controls-position="right" />
            <ElButton @click="callbacks.onCenterPickActive?.(!state.centerPickActive)">
              {{ state.centerPickActive ? "取消拾取" : "从画布拾取一次" }}
            </ElButton>
          </ElFormItem>
          <ElFormItem label="扩张范围">
            <ElSelect v-model="expansionDraft.expansion" :disabled="isFolk">
              <ElOption v-for="scope in religionExpansionOptions" :key="scope" :label="scope" :value="scope" />
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="扩张系数（0.1～10）">
            <ElInputNumber v-model="expansionDraft.expansionism" :disabled="isFolk" :min="0.1" :max="10" :step="0.1" :precision="1" controls-position="right" />
          </ElFormItem>
          <ElAlert v-if="isFolk" type="info" :closable="false" title="Folk 固定为文化范围，扩张系数为 0" show-icon />
          <ElFormItem label="执行方式">
            <ElRadioGroup v-model="expansionDraft.mode">
              <ElRadioButton value="save">仅保存</ElRadioButton>
              <ElRadioButton value="reexpand">重新扩张</ElRadioButton>
            </ElRadioGroup>
          </ElFormItem>
        </ElForm>
        <ElAlert
          v-if="state.expansionPreview"
          :type="state.expansionPreview.valid ? 'info' : 'error'"
          :closable="false"
          :title="expansionPreviewText"
          show-icon
        />
        <div class="social-expansion-actions">
          <ElButton @click="inspectExpansion">只读预检</ElButton>
          <ElButton v-if="expansionDraft.mode === 'save'" type="primary" :disabled="!state.expansionPreview?.valid" @click="applyExpansion(false)">仅保存</ElButton>
          <ElButton v-else type="danger" :disabled="!state.expansionPreview?.valid" @click="applyExpansion(true)">确认并重新扩张</ElButton>
        </div>
      </div>
    </template>

    <template #note>
      <UiNoteField
        class-name="religion-note-editor"
        :model-value="selected.noteBody"
        @apply="body => callbacks.onNoteChange(selected.id, body)"
        @clear="callbacks.onNoteChange(selected.id, '')"
      />
    </template>
  </UiActionDock>
</template>

<script setup>
import {computed, nextTick, ref, watch} from "vue";
import UiActionDock from "./base/UiActionDock.vue";
import UiColorActionPanel from "./base/UiColorActionPanel.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiNoteField from "./base/UiNoteField.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiPanelIoActions from "./base/UiPanelIoActions.vue";
import UiRegenerationLockActions from "./base/UiRegenerationLockActions.vue";
import UiSelectField from "./base/UiSelectField.vue";
import UiSliderField from "./base/UiSliderField.vue";
import UiTextEditField from "./base/UiTextEditField.vue";
import UiTreeDisplayPanel from "./base/UiTreeDisplayPanel.vue";
import {formatArea, formatNumber as formatDisplayNumber, formatPopulation} from "../../display-units.js";
import {findByObjectId, sameObjectId} from "../../object-id.js";
import {compareRowsByKey} from "../../sort-utils.js";
import {readObjectNote} from "../../../runtime/object-notes.js";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";
import {useVisibleRowSelection} from "../composables/use-visible-row-selection.js";
import {useRegenerationLockSelection} from "../composables/use-regeneration-lock-selection.js";
import {BRUSH_RADIUS_ID, readBrushRadiusContract} from "../../../runtime/brush-radius-contract.js";

const brushRadius = readBrushRadiusContract(BRUSH_RADIUS_ID.RELIGION);

defineOptions({
  name: "ReligionPanel"
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
  {key: "cells", label: "cells"},
  {key: "population", label: "人口"},
  {key: "cities", label: "城市"},
  {key: "cultures", label: "文化"},
  {key: "states", label: "国家"},
  {key: "depth", label: "层级"},
  {key: "id", label: "ID"}
]);

const columns = Object.freeze([
  {key: "id", label: "ID", align: "right"},
  {key: "name", label: "名称"},
  {key: "type", label: "类型"},
  {key: "form", label: "形态"},
  {key: "parentName", label: "父级"},
  {key: "depth", label: "层", align: "right"},
  {key: "cells", label: "cells", align: "right", format: value => formatNumber(value)},
  {key: "population", label: "人口", align: "right", format: value => formatPopulationValue(value)}
]);

const unitPreferences = useUnitPreferences();
const activeAction = ref(null);
const renameRequestId = ref(null);
const treePanelOpen = computed({
  get: () => Boolean(props.state.treeOpen),
  set: value => props.callbacks.onTreeOpen?.(value)
});
const metrics = computed(() => {
  props.state.version;
  return buildReligionMetrics(props.state.map);
});
const treeOverview = computed(() => buildTreeOverview(metrics.value.rows, "根宗教"));
const visibleRows = computed(() => sortRows(filterRows(metrics.value.rows, props.state.filter), props.state.sortKey, props.state.sortDir));
const regenerationLocks = useRegenerationLockSelection({panelId: "religion-panel", kind: "religion", rows: visibleRows});
const {selectedRowIds: selectedReligionIds} = useVisibleRowSelection(visibleRows);
const selectedReligionRows = regenerationLocks.selectedRows;
const highlightableReligionRows = computed(() => selectedReligionRows.value.filter(row => Number(row.id) > 0));
const selected = computed(() => findByObjectId(metrics.value.rows, props.state.selectedReligionId));
const parentOptions = computed(() => buildParentOptions(metrics.value.rows, selected.value, "根宗教"));
const filterEmptyAction = computed(() => String(props.state.filter || "").trim()
  ? {key: "clear-filter", label: "清空筛选", icon: "⌫"}
  : null);
const defaultReligionEmptyAction = Object.freeze({key: "add", label: "新增空宗教", icon: "+"});
const religionEmptyAction = computed(() => filterEmptyAction.value || defaultReligionEmptyAction);
const religionListActions = computed(() => [
  {key: "rename-visible", label: `按名称库重命名筛选结果 ${formatNumber(visibleRows.value.length)}`, icon: "名", disabled: !visibleRows.value.length},
  {key: "highlight-selected", label: `高亮选中 ${formatNumber(highlightableReligionRows.value.length)}`, icon: "◉", disabled: !highlightableReligionRows.value.length},
  {key: "clear-highlights", label: `清除高亮 ${formatNumber(props.state.highlightCount || 0)}`, icon: "○", disabled: !props.state.highlightCount},
  defaultReligionEmptyAction,
  {
    key: "delete",
    label: "删除宗教并清除归属",
    icon: "×",
    disabled: !selected.value
  }
]);
const religionActions = computed(() => [
  {key: "assign", resultClass: "toggle-canvas-mode", label: props.state.assignmentActive ? "退出宗教归属笔刷" : "编辑宗教归属", icon: "◎", panel: false, active: props.state.assignmentActive},
  {key: "rename", resultClass: "open-secondary", label: "重命名", icon: "✎"},
  {key: "color", resultClass: "open-secondary", label: "调整颜色", icon: "◐"},
  {key: "parent", resultClass: "open-secondary", label: "调整继承", icon: "↳"},
  {key: "expansion", resultClass: "open-secondary", label: "中心与扩张", icon: "⊕"},
  {key: "note", resultClass: "open-secondary", label: "编辑备注", icon: "☰"}
]);
const assignmentOptions = computed(() => [
  {value: 0, label: "无宗教"},
  ...metrics.value.rows.map(row => ({value: row.id, label: row.name}))
]);
const religionExpansionOptions = Object.freeze(["culture", "state", "global"]);
const expansionDraft = ref({center: 0, expansion: "culture", expansionism: 1, mode: "save"});
const isFolk = computed(() => selected.value?.type === "Folk");
const expansionPreviewText = computed(() => {
  const preview = props.state.expansionPreview;
  if (!preview) return "";
  if (!preview.valid) return preview.reason || "预检失败";
  return preview.mode === "reexpand"
    ? `预计更新 ${formatNumber(preview.changedPackCells || 0)} 个 pack cells`
    : `仅保存中心与 ${formatNumber(preview.parameterChanges?.length || 0)} 个参数，不改变覆盖`;
});

const summaryMetrics = computed(() => [
  {label: "宗教", value: formatNumber(metrics.value.total)},
  {label: "根系", value: formatNumber(metrics.value.roots)},
  {label: "派生", value: formatNumber(metrics.value.derived)},
  {label: "层级", value: formatNumber(metrics.value.maxDepth)},
  {label: "人口", value: formatPopulationValue(metrics.value.population)},
  {label: "城市", value: formatNumber(metrics.value.cities)},
  {label: "归属笔刷", value: props.state.assignmentActive ? "启用" : "关闭"},
  {label: "本次影响", value: formatNumber(props.state.lastAffected || 0)},
  {label: "高亮", value: formatNumber(props.state.highlightCount || 0)}
]);

const detailRows = computed(() => selected.value ? [
  {label: "类型", value: selected.value.type},
  {label: "形态", value: selected.value.form},
  {label: "父级", value: selected.value.parentName},
  {label: "子级", value: formatNumber(selected.value.childCount)},
  {label: "继承路径", value: selected.value.treePath},
  {label: "扩张范围", value: selected.value.expansion},
  {label: "扩张强度", value: formatNumber(selected.value.expansionism)},
  {label: "主神", value: selected.value.deity},
  {label: "所属文化", value: selected.value.cultureName},
  {label: "中心 pack cell", value: selected.value.centerCell, debug: true},
  {label: "中心 grid cell", value: selected.value.gridCenterCell, debug: true},
  {label: "覆盖 cells", value: formatNumber(selected.value.cells)},
  {label: "面积", value: formatAreaValue(selected.value.area)},
  {label: "乡村人口", value: formatPopulationValue(selected.value.rural)},
  {label: "城市人口", value: formatPopulationValue(selected.value.urban)},
  {label: "城市", value: formatNumber(selected.value.cities)},
  {label: "主要国家", value: selected.value.stateSummary},
  {label: "备注", value: selected.value.noteBody ? `有备注（${formatNumber(selected.value.noteBody.length)}字）` : "无"},
  {label: "主要文化", value: selected.value.cultureSummary}
] : []);

watch(() => selected.value?.id, id => {
  activeAction.value = null;
  resetExpansionDraft();
  if (!sameObjectId(renameRequestId.value, id)) return;
  renameRequestId.value = null;
  nextTick(() => {
    activeAction.value = "rename";
  });
}, {immediate: true});

watch(() => props.state.pickedExpansionCenter, center => {
  if (Number.isInteger(center)) expansionDraft.value.center = center;
});

watch(expansionDraft, () => props.callbacks.onExpansionDraftChange?.(), {deep: true});

function resetExpansionDraft() {
  const row = selected.value;
  if (!row) return;
  const folk = row.type === "Folk";
  expansionDraft.value = {
    center: Number(row.centerCell) || 0,
    expansion: folk ? "culture" : religionExpansionOptions.includes(row.expansion) ? row.expansion : "culture",
    expansionism: folk ? 0 : Number.isFinite(Number(row.expansionism)) ? Number(row.expansionism) : 1,
    mode: "save"
  };
}

function expansionOptions(confirm = false) {
  return {...expansionDraft.value, confirm};
}

function inspectExpansion() {
  props.callbacks.onInspectExpansion?.(expansionOptions(false));
}

function applyExpansion(confirm) {
  props.callbacks.onApplyExpansion?.(expansionOptions(confirm));
}

function selectTreeNode(node) {
  props.callbacks.onSelect?.(node);
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

function handleActionSelect(actionKey) {
  if (actionKey !== "assign") return;
  activeAction.value = null;
  props.callbacks.onAssignmentActive?.(!props.state.assignmentActive);
}

function handleListAction(actionKey) {
  if (actionKey === "rename-visible") {
    props.callbacks.onRenameVisibleFromNamebase?.(visibleRows.value.map(row => row.id));
    return;
  }
  if (actionKey === "highlight-selected") {
    props.callbacks.onHighlight?.(highlightableReligionRows.value);
    return;
  }
  if (actionKey === "clear-highlights") {
    props.callbacks.onClearHighlights?.();
    return;
  }
  if (actionKey === "clear-filter") {
    props.callbacks.onFilter?.("");
    return;
  }
  if (actionKey === "add") {
    props.callbacks.onAdd?.();
    return;
  }
  if (actionKey === "locate" && selected.value) props.callbacks.onLocate?.(selected.value);
  if (actionKey === "delete" && selected.value) props.callbacks.onDelete?.(selected.value);
}

function buildReligionMetrics(map) {
  const baseRows = religionRows(map);
  const tree = buildTreeFields(baseRows, "根宗教");
  const rows = baseRows.map(religion => {
    const cities = religionCities(map, religion.id);
    const stateStats = religionStateStats(map, cities);
    const cultureStats = religionCultureStats(map, cities);
    const stateOwners = religionStateOwnerCount(map, religion.id);
    const urban = cities.reduce((sum, city) => sum + (Number(city.population) || 0), 0);
    const rural = Number(religion.rural) || 0;
    const treeFields = tree.get(religion.id) || {};
    const note = readObjectNote(map, {kind: "religion", id: religion.id});
    return {
      ...religion,
      ...treeFields,
      cultureName: indexedName(map?.society?.cultures || map?.pack?.cultures, religion.cultureId),
      rural,
      urban,
      population: rural + urban,
      cities: cities.length,
      states: stateStats.length,
      cultures: cultureStats.length,
      stateSummary: stateStats.slice(0, 4).map(item => `${item.name} ${formatNumber(item.count)}`).join(" / ") || "none",
      cultureSummary: cultureStats.slice(0, 4).map(item => `${item.name} ${formatNumber(item.count)}`).join(" / ") || "none",
      canDelete: religion.cells === 0 && cities.length === 0 && stateStats.length === 0 && stateOwners === 0 && (treeFields.childCount || 0) === 0,
      noteBody: note?.body || "",
      noteUpdatedAt: note?.updatedAt || "",
      color: normalizeHexColor(religion.color) || fallbackReligionColor(religion.id)
    };
  });

  return {
    rows,
    total: rows.length,
    roots: rows.filter(row => row.parentId === 0).length,
    derived: rows.filter(row => row.parentId > 0).length,
    maxDepth: rows.reduce((max, row) => Math.max(max, row.depth), 0),
    cells: rows.reduce((sum, row) => sum + row.cells, 0),
    population: rows.reduce((sum, row) => sum + row.population, 0),
    cities: rows.reduce((sum, row) => sum + row.cities, 0)
  };
}

function religionRows(map) {
  return (map?.society?.religions || map?.pack?.religions || [])
    .filter(religion => religion && !religion.removed && Number.isInteger(religion.i ?? religion.id) && (religion.i ?? religion.id) > 0)
    .map(religion => ({
      id: religion.i ?? religion.id,
      name: religion.name || `宗教 #${religion.i ?? religion.id}`,
      rawName: religion.name || `宗教 #${religion.i ?? religion.id}`,
      type: religion.type || "Generic",
      form: religion.form || "none",
      expansion: religion.expansion || "none",
      expansionism: Number.isFinite(religion.expansionism) ? religion.expansionism : "none",
      deity: religion.deity || "none",
      cultureId: Number(religion.culture) || 0,
      parentId: Number(religion.parent) || 0,
      depth: Number(religion.depth) || 0,
      children: Array.isArray(religion.children) ? religion.children.filter(Number.isInteger) : [],
      centerCell: religion.center ?? "none",
      gridCenterCell: religion.gridCenter ?? "none",
      cells: Number(religion.cells) || 0,
      area: Number(religion.area) || 0,
      rural: Number(religion.rural) || 0,
      color: religion.color
    }));
}

function filterRows(rows, filter) {
  const query = filter.trim().toLowerCase();
  if (!query) return rows;
  return rows.filter(row =>
    String(row.id).includes(query)
    || row.name.toLowerCase().includes(query)
    || row.rawName.toLowerCase().includes(query)
    || row.type.toLowerCase().includes(query)
    || row.form.toLowerCase().includes(query)
    || row.parentName.toLowerCase().includes(query)
    || row.treePath.toLowerCase().includes(query)
    || row.cultureName.toLowerCase().includes(query)
    || row.stateSummary.toLowerCase().includes(query)
    || row.cultureSummary.toLowerCase().includes(query)
  );
}

function sortRows(rows, key, direction) {
  return [...rows].sort((a, b) => compareRowsByKey(a, b, key, direction));
}

function buildTreeFields(rows, rootLabel) {
  const names = new Map(rows.map(row => [row.id, row.name]));
  const parentById = new Map(rows.map(row => [row.id, normalizeParentId(row.parentId, row.id, names)]));
  const childCounts = new Map(rows.map(row => [row.id, 0]));
  for (const parentId of parentById.values()) {
    if (parentId > 0) childCounts.set(parentId, (childCounts.get(parentId) || 0) + 1);
  }

  return new Map(rows.map(row => {
    const parentId = parentById.get(row.id) || 0;
    const treePath = formatTreePath(row.id, parentById, names);
    return [row.id, {
      parentId,
      parentName: parentId ? names.get(parentId) || `#${parentId}` : rootLabel,
      childCount: childCounts.get(row.id) || 0,
      depth: Math.max(Number(row.depth) || 0, countAncestors(row.id, parentById)),
      treePath
    }];
  }));
}

function buildParentOptions(rows, selectedRow, rootLabel) {
  if (!selectedRow) return [];
  const descendants = descendantIds(selectedRow.id, rows);
  return [
    {value: 0, label: rootLabel},
    ...rows
      .filter(row => row.id !== selectedRow.id && !descendants.has(row.id))
      .sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name, "zh-CN") || a.id - b.id)
      .map(row => ({value: row.id, label: `${"  ".repeat(Math.min(row.depth, 4))}${row.name}`}))
  ];
}

function buildTreeOverview(rows, rootLabel) {
  const childrenByParent = new Map();
  const rowById = new Map(rows.map(row => [row.id, row]));
  for (const row of rows) {
    const parentId = rowById.has(row.parentId) ? row.parentId : 0;
    const children = childrenByParent.get(parentId) || [];
    children.push(row);
    childrenByParent.set(parentId, children);
  }
  for (const children of childrenByParent.values()) {
    children.sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name, "zh-CN") || a.id - b.id);
  }

  const ordered = [];
  const visited = new Set();
  const visit = (row, depth) => {
    if (!row || visited.has(row.id)) return;
    visited.add(row.id);
    ordered.push({...row, depth, branch: depth ? "↳".repeat(Math.min(depth, 4)) : rootLabel});
    for (const child of childrenByParent.get(row.id) || []) visit(child, depth + 1);
  };

  for (const root of childrenByParent.get(0) || []) visit(root, 0);
  for (const row of rows) visit(row, 0);
  return ordered;
}

function descendantIds(id, rows) {
  const parentById = new Map(rows.map(row => [row.id, row.parentId]));
  const descendants = new Set();
  for (const row of rows) {
    let current = parentById.get(row.id) || 0;
    const visited = new Set();
    while (current && !visited.has(current)) {
      if (current === id) {
        descendants.add(row.id);
        break;
      }
      visited.add(current);
      current = parentById.get(current) || 0;
    }
  }
  return descendants;
}

function normalizeParentId(parentId, itemId, names) {
  const parsed = Number(parentId) || 0;
  return parsed && parsed !== itemId && names.has(parsed) ? parsed : 0;
}

function countAncestors(id, parentById) {
  let depth = 0;
  let current = parentById.get(id) || 0;
  const visited = new Set([id]);
  while (current && !visited.has(current)) {
    depth++;
    visited.add(current);
    current = parentById.get(current) || 0;
  }
  return depth;
}

function formatTreePath(id, parentById, names) {
  const path = [names.get(id) || `#${id}`];
  let current = parentById.get(id) || 0;
  const visited = new Set([id]);
  while (current && !visited.has(current)) {
    path.push(names.get(current) || `#${current}`);
    visited.add(current);
    current = parentById.get(current) || 0;
  }
  return path.reverse().join(" / ");
}

function religionCities(map, religionId) {
  return (map?.settlements?.cities || []).filter(city => Number(city?.religion) === religionId);
}

function religionStateStats(map, cities) {
  return countBy(cities, city => Number(city.state) || 0)
    .map(([stateId, count]) => ({
      stateId,
      count,
      name: indexedName(map?.politics?.states, stateId)
    }))
    .sort((a, b) => b.count - a.count || a.stateId - b.stateId);
}

function religionStateOwnerCount(map, religionId) {
  return (map?.politics?.states || map?.pack?.states || [])
    .filter(state => state?.i && !state.removed && Number(state.religion) === religionId)
    .length;
}

function religionCultureStats(map, cities) {
  return countBy(cities, city => Number(city.culture) || 0)
    .map(([cultureId, count]) => ({
      cultureId,
      count,
      name: indexedName(map?.society?.cultures || map?.pack?.cultures, cultureId)
    }))
    .sort((a, b) => b.count - a.count || a.cultureId - b.cultureId);
}

function countBy(items, getKey) {
  const counts = new Map();
  for (const item of items) {
    const key = getKey(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()];
}

function indexedName(items, id) {
  return items?.[id]?.name || (id ? `#${id}` : "none");
}

function normalizeHexColor(color) {
  if (typeof color !== "string") return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}

function fallbackReligionColor(religionId) {
  const hue = ((Number(religionId) || 0) * 0.61803398875 + 0.63) % 1;
  const [r, g, b] = hslToRgb(hue, 0.34, 0.7);
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

function formatAreaValue(value) {
  return formatArea(value, unitPreferences.value);
}

function formatPopulationValue(value) {
  return formatPopulation(value, unitPreferences.value);
}

function formatNumber(value) {
  return formatDisplayNumber(value, unitPreferences.value);
}

</script>
