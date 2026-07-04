<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="culture-panel-summary" />

  <div class="inheritance-tree-launcher culture-tree-overview" aria-label="文化树总览">
    <div class="inheritance-tree-header">
      <span>文化树总览</span>
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
    title="文化树总览"
    :nodes="treeOverview"
    :selected-id="state.selectedCultureId"
    @select="selectTreeNode"
  />

  <div class="culture-panel-controls">
    <UiFilterInput :model-value="state.filter" placeholder="筛选名称 / id / 类型 / 国家" @update:model-value="callbacks.onFilter" />
  </div>

  <UiSortBar class-name="culture-panel-sort" :options="sortOptions" :active-key="state.sortKey" :direction="state.sortDir" @sort="callbacks.onSort" />

  <UiObjectTable
    :columns="columns"
    :rows="visibleRows"
    :selected-id="state.selectedCultureId"
    empty-text="没有匹配的文化"
    @select="callbacks.onSelect"
    @locate="callbacks.onLocate"
  />

  <UiDetailGrid class-name="culture-panel-details" empty-text="未选中文化" :rows="detailRows" />

  <UiActionDock v-if="selected" v-model:active="activeAction" :actions="cultureActions" @select="handleActionSelect">
    <template #rename>
      <UiTextEditField
        class-name="culture-name-editor"
        :model-value="selected.rawName"
        :max-length="48"
        @apply="name => callbacks.onRename(selected.id, name)"
      />
    </template>

    <template #color>
      <UiColorActionPanel
        class-name="culture-color-field"
        :model-value="selected.color"
        @apply="color => callbacks.onColorChange(selected.id, color)"
      />
    </template>

    <template #parent>
      <UiSelectField
        input-id="culture-parent-select"
        class-name="culture-parent-select"
        label="继承自"
        :model-value="selected.parentId"
        :options="parentOptions"
        @update:model-value="parentId => callbacks.onParentChange(selected.id, parentId)"
      />
    </template>

    <template #note>
      <UiNoteField
        class-name="culture-note-editor"
        :model-value="selected.noteBody"
        @apply="body => callbacks.onNoteChange(selected.id, body)"
        @clear="callbacks.onNoteChange(selected.id, '')"
      />
    </template>
  </UiActionDock>

  <UiHistoryActions class-name="culture-history-actions" :history="state.history" @undo="callbacks.onUndo" @redo="callbacks.onRedo" />
</template>

<script setup>
import {computed, ref, watch} from "vue";
import UiActionDock from "./base/UiActionDock.vue";
import UiColorActionPanel from "./base/UiColorActionPanel.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiHistoryActions from "./base/UiHistoryActions.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiNoteField from "./base/UiNoteField.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiSelectField from "./base/UiSelectField.vue";
import UiSortBar from "./base/UiSortBar.vue";
import UiTextEditField from "./base/UiTextEditField.vue";
import UiTreeDisplayPanel from "./base/UiTreeDisplayPanel.vue";
import {formatArea, formatNumber as formatDisplayNumber, formatPopulation} from "../../display-units.js";
import {findByObjectId} from "../../object-id.js";
import {readObjectNote} from "../../../runtime/object-notes.js";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";

defineOptions({
  name: "CulturePanel"
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
  {key: "states", label: "国家"},
  {key: "depth", label: "层级"},
  {key: "id", label: "ID"}
]);

const columns = Object.freeze([
  {key: "id", label: "ID", align: "right"},
  {key: "name", label: "名称"},
  {key: "type", label: "类型"},
  {key: "parentName", label: "父级"},
  {key: "depth", label: "层", align: "right"},
  {key: "cells", label: "cells", align: "right", format: value => formatNumber(value)},
  {key: "population", label: "人口", align: "right", format: value => formatPopulationValue(value)},
  {key: "cities", label: "城市", align: "right", format: value => formatNumber(value)}
]);

const unitPreferences = useUnitPreferences();
const activeAction = ref(null);
const treePanelOpen = ref(false);
const metrics = computed(() => {
  props.state.version;
  return buildCultureMetrics(props.state.map);
});
const treeOverview = computed(() => buildTreeOverview(metrics.value.rows, "根文化"));
const visibleRows = computed(() => sortRows(filterRows(metrics.value.rows, props.state.filter), props.state.sortKey, props.state.sortDir));
const selected = computed(() => findByObjectId(metrics.value.rows, props.state.selectedCultureId));
const parentOptions = computed(() => buildParentOptions(metrics.value.rows, selected.value, "根文化"));
const cultureActions = Object.freeze([
  {key: "rename", label: "重命名", icon: "✎"},
  {key: "color", label: "调整颜色", icon: "◐"},
  {key: "parent", label: "调整继承", icon: "↳"},
  {key: "namebase", label: "名称库绑定", icon: "名"},
  {key: "note", label: "编辑备注", icon: "☰"}
]);

const summaryMetrics = computed(() => [
  {label: "文化", value: formatNumber(metrics.value.total)},
  {label: "根系", value: formatNumber(metrics.value.roots)},
  {label: "派生", value: formatNumber(metrics.value.derived)},
  {label: "层级", value: formatNumber(metrics.value.maxDepth)},
  {label: "人口", value: formatPopulationValue(metrics.value.population)},
  {label: "城市", value: formatNumber(metrics.value.cities)}
]);

const detailRows = computed(() => selected.value ? [
  {label: "词根", value: selected.value.root},
  {label: "类型", value: selected.value.type},
  {label: "父级", value: selected.value.parentName},
  {label: "子级", value: formatNumber(selected.value.childCount)},
  {label: "继承路径", value: selected.value.treePath},
  {label: "命名风格", value: selected.value.nameStyle},
  {label: "扩张", value: formatNumber(selected.value.expansionism)},
  {label: "中心 pack cell", value: selected.value.centerCell, debug: true},
  {label: "中心 grid cell", value: selected.value.gridCenterCell, debug: true},
  {label: "覆盖 cells", value: formatNumber(selected.value.cells)},
  {label: "面积", value: formatAreaValue(selected.value.area)},
  {label: "乡村人口", value: formatPopulationValue(selected.value.rural)},
  {label: "城市人口", value: formatPopulationValue(selected.value.urban)},
  {label: "城市", value: formatNumber(selected.value.cities)},
  {label: "备注", value: selected.value.noteBody ? `有备注（${formatNumber(selected.value.noteBody.length)}字）` : "无"},
  {label: "主要国家", value: selected.value.stateSummary}
] : []);

watch(() => selected.value?.id, () => {
  activeAction.value = null;
});

function selectTreeNode(node) {
  props.callbacks.onSelect?.(node);
}

function handleActionSelect(actionKey) {
  if (actionKey !== "namebase" || !selected.value) return;
  activeAction.value = null;
  props.callbacks.onNamebaseBinding?.(selected.value.id);
}

function buildCultureMetrics(map) {
  const baseRows = cultureRows(map);
  const tree = buildTreeFields(baseRows, "根文化");
  const rows = baseRows.map(culture => {
    const cities = cultureCities(map, culture.id);
    const stateStats = cultureStateStats(map, culture.id);
    const urban = cities.reduce((sum, city) => sum + (Number(city.population) || 0), 0);
    const rural = Number(culture.rural) || 0;
    const treeFields = tree.get(culture.id) || {};
    const note = readObjectNote(map, {kind: "culture", id: culture.id});
    return {
      ...culture,
      ...treeFields,
      urban,
      rural,
      population: rural + urban,
      cities: cities.length,
      states: stateStats.length,
      stateSummary: stateStats.slice(0, 4).map(item => `${item.name} ${formatNumber(item.count)}`).join(" / ") || "none",
      noteBody: note?.body || "",
      noteUpdatedAt: note?.updatedAt || "",
      color: normalizeHexColor(culture.color) || fallbackCultureColor(culture.id)
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

function cultureRows(map) {
  return (map?.society?.cultures || map?.pack?.cultures || [])
    .filter(culture => culture && !culture.removed && Number.isInteger(culture.i ?? culture.id) && (culture.i ?? culture.id) > 0)
    .map(culture => ({
      id: culture.i ?? culture.id,
      name: culture.name || `文化 #${culture.i ?? culture.id}`,
      rawName: culture.name || `文化 #${culture.i ?? culture.id}`,
      root: culture.root || (culture.name || "").replace(/文化$/, "") || "none",
      type: culture.type || "Generic",
      nameStyle: culture.nameStyle || "default",
      expansionism: Number.isFinite(culture.expansionism) ? culture.expansionism : "none",
      parentId: Number(culture.parent) || 0,
      depth: Number(culture.depth) || 0,
      children: Array.isArray(culture.children) ? culture.children.filter(Number.isInteger) : [],
      centerCell: culture.center ?? "none",
      gridCenterCell: culture.gridCenter ?? "none",
      cells: Number(culture.cells) || 0,
      area: Number(culture.area) || 0,
      rural: Number(culture.rural) || 0,
      color: culture.color
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
    || row.nameStyle.toLowerCase().includes(query)
    || row.parentName.toLowerCase().includes(query)
    || row.treePath.toLowerCase().includes(query)
    || row.stateSummary.toLowerCase().includes(query)
  );
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

function sortRows(rows, key, direction) {
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (a[key] === b[key]) return a.id - b.id;
    if (typeof a[key] === "string") return a[key].localeCompare(b[key], "zh-CN") * factor;
    return a[key] > b[key] ? factor : -factor;
  });
}

function cultureCities(map, cultureId) {
  return (map?.settlements?.cities || []).filter(city => Number(city?.culture) === cultureId);
}

function cultureStateStats(map, cultureId) {
  const counts = new Map();
  for (const city of cultureCities(map, cultureId)) {
    const stateId = Number(city.state) || 0;
    counts.set(stateId, (counts.get(stateId) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([stateId, count]) => ({
      stateId,
      count,
      name: map?.politics?.states?.[stateId]?.name || (stateId ? `#${stateId}` : "none")
    }))
    .sort((a, b) => b.count - a.count || a.stateId - b.stateId);
}

function normalizeHexColor(color) {
  if (typeof color !== "string") return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}

function fallbackCultureColor(cultureId) {
  const hue = ((Number(cultureId) || 0) * 0.61803398875 + 0.31) % 1;
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
