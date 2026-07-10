<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="province-panel-summary" />

  <div class="province-panel-controls">
    <UiFilterInput :model-value="state.filter" placeholder="筛选名称 / id / 国家" @update:model-value="callbacks.onFilter" />
  </div>
  <UiObjectTable
    :columns="columns"
    :rows="visibleRows"
    :sort-key="state.sortKey"
    :sort-direction="state.sortDir"
    :sort-options="sortOptions"
    sortable
    @sort="callbacks.onSort"
    :selected-id="state.selectedProvinceId"
    :doubleClickAction="'edit'"
    empty-text="没有匹配的省份"
    @select="callbacks.onSelect"
    @locate="callbacks.onLocate"
    @edit="openRenameEditor"
  />

  <UiDetailGrid class-name="province-panel-details" empty-text="未选中省份" :rows="detailRows" />

  <UiActionDock v-model:active="activeAction" :actions="provinceActions" @select="handleActionSelect">
    <template #rename>
      <UiTextEditField
        class-name="province-name-editor"
        :model-value="selected.rawName"
        :max-length="48"
        @apply="name => callbacks.onRename(selected.id, name)"
      />
    </template>

    <template #color>
      <UiColorActionPanel
        class-name="province-color-field"
        :model-value="selected.color"
        @apply="color => callbacks.onColorChange(selected.id, color)"
      />
    </template>

    <template #note>
      <UiNoteField
        class-name="province-note-editor"
        :model-value="selected.noteBody"
        @apply="body => callbacks.onNoteChange(selected.id, body)"
        @clear="callbacks.onNoteChange(selected.id, '')"
      />
    </template>
  </UiActionDock>

  <UiSelectField
    label="目标"
    class-name="province-select-field"
    :model-value="state.selectedProvinceId ?? ''"
    :options="provinceOptions"
    @update:model-value="callbacks.onTargetProvinceId(Number($event))"
  />

  <div class="province-sample-actions">
    <UiButton variant="secondary" @click="callbacks.onSampleSelection">取选中</UiButton>
    <UiButton variant="secondary" @click="callbacks.onSampleHover">取悬停</UiButton>
  </div>

  <UiSliderField
    label="半径"
    field-class="province-range-field"
    :model-value="state.radius"
    :min="4"
    :max="120"
    :step="2"
    @input="callbacks.onRadius"
  />

  <UiHistoryActions class-name="province-history-actions" :history="state.history" :note-text="historyNote" @undo="callbacks.onUndo" @redo="callbacks.onRedo" />
</template>

<script setup>
import {computed, nextTick, ref, watch} from "vue";
import UiActionDock from "./base/UiActionDock.vue";
import UiButton from "./base/UiButton.vue";
import UiColorActionPanel from "./base/UiColorActionPanel.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiHistoryActions from "./base/UiHistoryActions.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiNoteField from "./base/UiNoteField.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiSelectField from "./base/UiSelectField.vue";
import UiSliderField from "./base/UiSliderField.vue";
import UiTextEditField from "./base/UiTextEditField.vue";
import {formatArea, formatNumber as formatDisplayNumber, formatPopulation} from "../../display-units.js";
import {findByObjectId, sameObjectId} from "../../object-id.js";
import {compareRowsByKey} from "../../sort-utils.js";
import {readObjectNote} from "../../../runtime/object-notes.js";
import {formatHistoryStats} from "../../history-format.js";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";

defineOptions({
  name: "ProvincePanel"
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
  {key: "powerScore", label: "实力"},
  {key: "economicPower", label: "经济"},
  {key: "resourcePotential", label: "资源"},
  {key: "area", label: "面积"},
  {key: "cells", label: "cells"},
  {key: "stateName", label: "国家"},
  {key: "id", label: "ID"}
]);

const columns = Object.freeze([
  {key: "id", label: "ID", align: "right"},
  {key: "name", label: "名称"},
  {key: "stateName", label: "国家"},
  {key: "cells", label: "cells", align: "right", format: value => formatNumber(value)},
  {key: "area", label: "面积", align: "right", format: value => formatAreaValue(value)},
  {key: "economicPower", label: "经济", align: "right", format: value => formatNumber(value)},
  {key: "resourcePotential", label: "资源", align: "right", format: value => formatNumber(value)}
]);

const unitPreferences = useUnitPreferences();
const activeAction = ref(null);
const renameRequestId = ref(null);
const metrics = computed(() => {
  props.state.version;
  return buildProvinceMetrics(props.state.map);
});
const provinceOptions = computed(() => provinceRows(props.state.map));
const visibleRows = computed(() => sortRows(filterRows(metrics.value.rows, props.state.filter), props.state.sortKey, props.state.sortDir));
const selected = computed(() => findByObjectId(metrics.value.rows, props.state.selectedProvinceId));
const canDeleteSelected = computed(() => Boolean(selected.value && !selected.value.neutral));
const editActive = computed(() => Boolean(selected.value && props.state.active && selected.value.id === props.state.selectedProvinceId));
const modalActionActive = computed(() => Boolean(props.state.addMode || props.state.deleteMode));
const provinceActions = computed(() => [
  {key: "add", label: props.state.addMode ? "取消新增省份" : "新增省份：下一次点击地图 cell 作为中心", icon: "+", panel: false, active: props.state.addMode, disabled: props.state.deleteMode || editActive.value},
  {key: "delete", label: props.state.deleteMode ? "取消删除省份" : "删除省份：下一次点击地图省份", icon: "×", panel: false, active: props.state.deleteMode, disabled: props.state.addMode || editActive.value},
  {key: "edit", label: editActive.value ? "退出省份编辑" : "进入省份编辑", icon: "◎", panel: false, disabled: modalActionActive.value || !canDeleteSelected.value, active: editActive.value},
  {key: "rename", label: "重命名", icon: "✎", disabled: modalActionActive.value || !canDeleteSelected.value},
  {key: "color", label: "调整颜色", icon: "◐", disabled: modalActionActive.value || !canDeleteSelected.value},
  {key: "note", label: "编辑备注", icon: "☰", disabled: modalActionActive.value || !canDeleteSelected.value}
]);

const summaryMetrics = computed(() => [
  {label: "状态", value: props.state.active ? "编辑中" : "未启用"},
  {label: "新增", value: props.state.addMode ? "等待点击" : "关闭"},
  {label: "删除", value: props.state.deleteMode ? "等待点击" : "关闭"},
  {label: "省份", value: formatNumber(metrics.value.total)},
  {label: "实力", value: formatNumber(metrics.value.powerScore)},
  {label: "资源", value: formatNumber(metrics.value.resourcePotential)},
  {label: "筛选", value: formatNumber(visibleRows.value.length)},
  {label: "目标省份", value: formatProvinceName(props.state.map, props.state.selectedProvinceId)},
  {label: "影响", value: formatNumber(props.state.lastAffected)}
]);

const detailRows = computed(() => selected.value ? [
  {label: "全称", value: selected.value.fullName},
  {label: "所属国家", value: selected.value.stateName},
  {label: "中心 pack cell", value: selected.value.centerCell, debug: true},
  {label: "中心 grid cell", value: selected.value.gridCenterCell, debug: true},
  {label: "pole", value: selected.value.pole, debug: true},
  {label: "面积", value: formatAreaValue(selected.value.area)},
  {label: "cells", value: formatNumber(selected.value.cells)},
  {label: "人口", value: formatPopulationValue(selected.value.population)},
  {label: "实力评分", value: formatNumber(selected.value.powerScore)},
  {label: "经济力", value: formatNumber(selected.value.economicPower)},
  {label: "资源潜力", value: formatNumber(selected.value.resourcePotential)},
  {label: "资源类型", value: selected.value.resourceSummary},
  {label: "邻接省份", value: formatNumber(selected.value.neighborCount)},
  {label: "城市", value: formatNumber(selected.value.cityCount)},
  {label: "文化", value: selected.value.culture},
  {label: "宗教", value: selected.value.religion},
  {label: "备注", value: selected.value.noteBody ? `有备注（${formatNumber(selected.value.noteBody.length)}字）` : "无"}
] : []);

const historyNote = computed(() => {
  const history = props.state.history;
  return `历史：${formatHistoryStats(history)}；来源：${formatProvinceName(props.state.map, props.state.sourceProvinceId)}`;
});

watch(() => selected.value?.id, id => {
  activeAction.value = null;
  if (!sameObjectId(renameRequestId.value, id) || selected.value?.neutral) return;
  renameRequestId.value = null;
  nextTick(() => {
    activeAction.value = "rename";
  });
});

function buildProvinceMetrics(map) {
  const rows = provinceRows(map).map(row => {
    const province = getProvince(map, row.id);
    const state = map?.politics?.states?.[province?.state];
    const centerCell = province?.center ?? 0;
    const cultureId = map?.pack?.cells?.culture?.[centerCell];
    const religionId = province?.religion ?? map?.pack?.cells?.religion?.[centerCell];
    const cityCount = (map?.settlements?.cities || []).filter(city => city?.province === row.id).length;
    const neutral = row.id === 0;
    const neutralStats = neutral ? neutralProvinceStats(map) : null;
    const population = Number(province?.rural || 0) + Number(province?.urban || 0);
    const note = readObjectNote(map, {kind: "province", id: row.id});

    return {
      id: row.id,
      neutral,
      name: neutral ? "中立" : province?.fullName || province?.name || row.name,
      rawName: neutral ? "中立" : province?.name || row.name,
      fullName: neutral ? "中立" : province?.fullName || province?.name || row.name,
      stateId: neutral ? 0 : province?.state || 0,
      stateName: neutral ? "无所属国家" : state?.fullName || state?.name || (province?.state ? `#${province.state}` : "none"),
      centerCell: neutral ? "none" : centerCell,
      gridCenterCell: neutral ? "none" : province?.gridCenter ?? map?.pack?.cells?.g?.[centerCell] ?? "none",
      pole: neutral ? "none" : formatPole(province?.pole),
      area: neutral ? neutralStats.area : province?.area || 0,
      cells: neutral ? neutralStats.cells : province?.cells || 0,
      population: neutral ? neutralStats.population : population,
      economicPower: neutral ? 0 : Number(province?.economicPower || 0),
      resourcePotential: neutral ? 0 : Number(province?.resourcePotential || 0),
      powerScore: neutral ? 0 : Number(province?.powerScore || 0),
      resourceSummary: neutral ? "无" : formatResourceTypes(province?.resourceTypes),
      neighborCount: province?.neighbors?.length || 0,
      cityCount: neutral ? neutralStats.cityCount : cityCount,
      culture: neutral ? "混合" : indexedName(map?.society?.cultures, cultureId),
      religion: neutral ? "混合" : indexedName(map?.society?.religions, religionId),
      noteBody: note?.body || "",
      noteUpdatedAt: note?.updatedAt || "",
      color: neutral ? "#a6adb3" : normalizeHexColor(province?.color) || normalizeHexColor(state?.color) || fallbackProvinceColor(row.id)
    };
  });
  const totalArea = rows.reduce((sum, row) => sum + row.area, 0);
  const maxArea = rows.reduce((max, row) => Math.max(max, row.area), 0);
  return {
    rows,
    total: rows.length,
    totalArea,
    maxArea,
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
    || row.stateName.toLowerCase().includes(query)
  );
}

function sortRows(rows, key, direction) {
  return [...rows].sort((a, b) => compareRowsByKey(a, b, key, direction));
}

function handleActionSelect(key) {
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

function provinceRows(map) {
  const rows = (map?.politics?.provinces || map?.pack?.provinces || [])
    .filter(province => province && !province.removed && Number.isInteger(province.i ?? province.id))
    .map(province => ({
      id: province.i ?? province.id,
      name: province.fullName || province.name || `省份 #${province.i ?? province.id}`
    }));
  return [{id: 0, name: "中立"}, ...rows];
}

function getProvince(map, provinceId) {
  return map?.politics?.provinces?.[provinceId] || map?.pack?.provinces?.[provinceId] || null;
}

function formatProvinceName(map, provinceId) {
  if (provinceId === 0) return "中立";
  const province = getProvince(map, provinceId);
  return province?.fullName || province?.name || (provinceId ? `#${provinceId}` : "none");
}

function neutralProvinceStats(map) {
  const cells = map?.pack?.cells;
  let area = 0;
  let cellCount = 0;
  let population = 0;
  if (cells?.province) {
    for (const cell of cells.i || []) {
      if (cells.h?.[cell] < 20 || (cells.province[cell] || 0) !== 0) continue;
      area += cells.area?.[cell] || 0;
      population += cells.pop?.[cell] || 0;
      cellCount++;
    }
  } else {
    for (const cell of map?.grid?.cells?.i || []) {
      if (map.grid.cells.h?.[cell] < 20 || (map.grid.cells.province?.[cell] || 0) !== 0) continue;
      area += 1;
      population += map.grid.cells.pop?.[cell] || 0;
      cellCount++;
    }
  }
  const cityCount = (map?.settlements?.cities || []).filter(city => city && (city.province || 0) === 0).length;
  return {area, cells: cellCount, cityCount, population};
}

function indexedName(items, id) {
  const item = items?.[id];
  return item?.name || item?.fullName || (id === undefined || id === null ? "none" : String(id));
}

function formatPole(pole) {
  return Array.isArray(pole) ? pole.map(value => roundNumber(value)).join(", ") : "none";
}

function formatResourceTypes(types) {
  const entries = Object.entries(types || {})
    .filter(([, value]) => Number(value) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 4);
  if (!entries.length) return "无";
  return entries.map(([key, value]) => `${RESOURCE_LABELS[key] || key} ${formatNumber(Number(value))}`).join(" / ");
}

function normalizeHexColor(color) {
  if (typeof color !== "string") return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}

function fallbackProvinceColor(provinceId) {
  const hue = ((Number(provinceId) || 0) * 0.61803398875 + 0.3) % 1;
  const [r, g, b] = hslToRgb(hue, 0.3, 0.73);
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

function roundNumber(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}
</script>
