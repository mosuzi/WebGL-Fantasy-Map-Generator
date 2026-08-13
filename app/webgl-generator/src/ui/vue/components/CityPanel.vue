<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="city-panel-summary" />

  <div class="city-panel-controls">
    <UiFilterInput :model-value="state.filter" placeholder="筛选名称 / id / 国家 / 省份" @update:model-value="callbacks.onFilter" />
    <UiButton variant="secondary" :disabled="!visibleRows.length" @click="callbacks.onRenameVisibleFromNamebase?.(visibleRows.map(row => row.id))">按名称库重命名筛选</UiButton>
    <UiButton variant="danger" @click="callbacks.onRegenerate?.()">重新生成城镇</UiButton>
  </div>
  <UiRegenerationLockActions v-bind="regenerationLocks.actionProps" v-on="regenerationLocks.actionListeners" />
  <UiObjectTable
    v-memo="[state.version, state.filter, state.sortKey, state.sortDir, state.columnWidths, state.selectedCityId, state.highlightCount, selectedCityIds]"
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
    :selected-id="state.selectedCityId"
    :doubleClickAction="'edit'"
    empty-text="没有匹配的城市"
    :empty-action="filterEmptyAction"
    resizable-columns
    selectable-rows
    :selected-row-ids="selectedCityIds"
    @select="handleCitySelect"
    @locate="callbacks.onLocate"
    @edit="openRenameEditor"
    @empty-action="handleEmptyAction"
    @column-resize="callbacks.onColumnResize"
    @selection-change="selectedCityIds = $event"
  />

  <UiPanelIoActions
    class-name="city-panel-list-actions"
    label="城市列表高亮"
    :actions="cityHighlightActions"
    @action="handleHighlightAction"
  />

  <UiDetailGrid class-name="city-panel-details" empty-text="未选中城市" :rows="detailRows" />

  <section v-if="state.moveMode || state.movePreview" class="city-move-preview" :data-valid="state.movePreview?.valid === true">
    <strong>{{ state.moveMode ? "连续拖动城市到目标位置" : "最近一次移动影响" }}</strong>
    <span>{{ state.movePreview?.summary || "请从地图上所选城市的橙色圆环内按下并拖动；提交后可继续拖动，点击别处或手动退出结束。" }}</span>
    <span v-if="state.movePreview?.owners">归属：国家 #{{ state.movePreview.owners.before.state }} → #{{ state.movePreview.owners.after.state }}；省份 #{{ state.movePreview.owners.before.province }} → #{{ state.movePreview.owners.after.province }}</span>
    <span v-if="state.movePreview?.port">港口：{{ state.movePreview.port.status }}；关联路线重寻 {{ state.movePreview.routes.rerouted }} / 删除 {{ state.movePreview.routes.deleted }}</span>
    <span v-if="state.movePreview?.reasons?.length" class="city-move-preview-error">拒绝：{{ state.movePreview.reasons.join("；") }}</span>
    <span v-if="state.movePreview?.warnings?.length" class="city-move-preview-warning">提示：{{ state.movePreview.warnings.join("；") }}</span>
  </section>

  <UiActionDock host-id="CityPanel" v-model:active="activeAction" :actions="cityActions" @select="handleActionSelect">
    <template #rename>
      <UiTextEditField
        class-name="city-name-editor"
        :model-value="selected.rawName"
        :max-length="48"
        @apply="name => callbacks.onRename(selected.id, name)"
      />
    </template>

    <template #population>
      <UiNumberField
        class-name="city-name-editor city-population-editor"
        label="人口"
        action-label="应用人口"
        :model-value="selected.population"
        :min="0"
        :step="0.001"
        @apply="population => callbacks.onPopulationChange(selected.id, population)"
      />
    </template>

    <template #owner>
      <div class="city-owner-sync">
        <span>归属操作</span>
        <UiButton variant="secondary" :disabled="!selected.canSyncOwner" @click="callbacks.onSyncOwnerToCell(selected.id)">按所在区域更新归属</UiButton>
      </div>
    </template>

    <template #visual>
      <div class="city-visual-editor">
        <UiSelectField class-name="city-visual-select" label="剪影" :model-value="visualDraft.silhouette" :options="silhouetteOptions" @update:model-value="visualDraft.silhouette = $event" />
        <UiButton variant="secondary" @click="applyVisual">应用剪影</UiButton>
        <UiButton variant="secondary" :disabled="!selected.manualVisual" @click="callbacks.onVisualReset(selected.id)">恢复自动</UiButton>
      </div>
    </template>

    <template #note>
      <UiNoteField
        class-name="city-note-editor"
        :model-value="selected.noteBody"
        @apply="body => callbacks.onNoteChange(selected.id, body)"
        @clear="callbacks.onNoteChange(selected.id, '')"
      />
    </template>
  </UiActionDock>
</template>

<script setup>
import {computed, nextTick, reactive, ref, watch} from "vue";
import UiActionDock from "./base/UiActionDock.vue";
import UiButton from "./base/UiButton.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiNoteField from "./base/UiNoteField.vue";
import UiNumberField from "./base/UiNumberField.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiPanelIoActions from "./base/UiPanelIoActions.vue";
import UiRegenerationLockActions from "./base/UiRegenerationLockActions.vue";
import UiSelectField from "./base/UiSelectField.vue";
import UiTextEditField from "./base/UiTextEditField.vue";
import {
  CITY_SILHOUETTE_OPTIONS,
  cityCultureStyleLabel,
  cityRoleScaleLabel,
  cityScaleLabel,
  citySilhouetteLabel,
  createCityScaleContext,
  deriveCityScale,
  resolveCityVisual
} from "../../../runtime/city-visuals.js";
import {formatHeight, formatNumber, formatPopulation} from "../../display-units.js";
import {findByObjectId, sameObjectId} from "../../object-id.js";
import {compareRowsByKey} from "../../sort-utils.js";
import {readObjectNote} from "../../../runtime/object-notes.js";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";
import {useVisibleRowSelection} from "../composables/use-visible-row-selection.js";
import {useRegenerationLockSelection} from "../composables/use-regeneration-lock-selection.js";

defineOptions({
  name: "CityPanel"
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
  {key: "population", label: "人口"},
  {key: "resourceCells", label: "资源"},
  {key: "type", label: "类型"},
  {key: "stateName", label: "国家"},
  {key: "provinceName", label: "省份"},
  {key: "id", label: "ID"}
]);

const columns = Object.freeze([
  {key: "id", label: "ID", align: "right"},
  {key: "name", label: "名称"},
  {key: "type", label: "类型"},
  {key: "stateName", label: "国家"},
  {key: "provinceName", label: "省份"},
  {key: "resourceCells", label: "资源", align: "right", format: value => formatNumberValue(value)},
  {key: "population", label: "人口", align: "right", format: value => formatPopulationValue(value)}
]);

const unitPreferences = useUnitPreferences();
const activeAction = ref(null);
const renameRequestId = ref(null);
const lastCitySelect = {
  id: null,
  at: 0
};
const metrics = computed(() => {
  props.state.version;
  return buildCityMetrics(props.state.map);
});
const visibleRows = computed(() => sortRows(filterRows(metrics.value.rows, props.state.filter), props.state.sortKey, props.state.sortDir));
const regenerationLocks = useRegenerationLockSelection({panelId: "city-panel", kind: "city", rows: visibleRows});
const {selectedRowIds: selectedCityIds} = useVisibleRowSelection(visibleRows);
const selectedCityRows = regenerationLocks.selectedRows;
const filterEmptyAction = computed(() => String(props.state.filter || "").trim()
  ? {key: "clear-filter", label: "清空筛选", icon: "⌫"}
  : null);
const selected = computed(() => {
  props.state.relocationVersion;
  const row = findByObjectId(metrics.value.rows, props.state.selectedCityId);
  return refreshRelocatedSelectedCityRow(props.state.map, row, props.state.selectedCityId);
});
const modalActionActive = computed(() => Boolean(props.state.addMode || props.state.deleteMode || props.state.moveMode));
const visualDraft = reactive({
  silhouette: "town"
});
const silhouetteOptions = computed(() => {
  const baseValues = new Set(["city", "town", "village", "hamlet"]);
  const options = CITY_SILHOUETTE_OPTIONS.filter(option => baseValues.has(option.value));
  const current = CITY_SILHOUETTE_OPTIONS.find(option => option.value === visualDraft.silhouette);
  if (current && !baseValues.has(current.value)) options.push({...current, label: `兼容样式：${current.label}`});
  return options;
});
const cityActions = computed(() => [
  {key: "add", resultClass: "toggle-canvas-mode", label: props.state.addMode ? "取消新增城市" : "新增城市：下一次点击地图位置", icon: "+", panel: false, active: props.state.addMode, disabled: props.state.deleteMode || props.state.moveMode},
  {key: "delete", resultClass: "toggle-canvas-mode", label: props.state.deleteMode ? "取消删除城市" : "删除城市：下一次点击地图城市", icon: "×", panel: false, active: props.state.deleteMode, disabled: props.state.addMode || props.state.moveMode},
  {key: "move", resultClass: "toggle-canvas-mode", label: props.state.moveMode ? "退出移动城市" : "移动城市：在地图上拖动所选城市", icon: "↗", panel: false, active: props.state.moveMode, disabled: props.state.addMode || props.state.deleteMode || !selected.value},
  {key: "rename", resultClass: "open-secondary", label: "重命名", icon: "✎", disabled: modalActionActive.value || !selected.value},
  {key: "population", resultClass: "open-secondary", label: "调整人口", icon: "#", disabled: modalActionActive.value || !selected.value},
  {key: "owner", resultClass: "open-secondary", label: "同步归属", icon: "⇄", disabled: modalActionActive.value || !selected.value?.canSyncOwner},
  {key: "visual", resultClass: "open-secondary", label: "调整剪影", icon: "▣", disabled: modalActionActive.value || !selected.value},
  {key: "note", resultClass: "open-secondary", label: "编辑备注", icon: "☰", disabled: modalActionActive.value || !selected.value}
]);
const cityHighlightActions = computed(() => [
  {key: "highlight-selected", label: `高亮选中 ${formatNumberValue(selectedCityRows.value.length)}`, icon: "◉", disabled: !selectedCityRows.value.length},
  {key: "clear-highlights", label: `清除高亮 ${formatNumberValue(props.state.highlightCount || 0)}`, icon: "○", disabled: !props.state.highlightCount}
]);

const summaryMetrics = computed(() => [
  {label: "新增", value: props.state.addMode ? "等待点击" : "关闭"},
  {label: "删除", value: props.state.deleteMode ? "等待点击" : "关闭"},
  {label: "移动", value: props.state.moveMode ? "等待拖动" : "关闭"},
  {label: "城市", value: formatNumberValue(metrics.value.total)},
  {label: "首都", value: formatNumberValue(metrics.value.capitals)},
  {label: "港口", value: formatNumberValue(metrics.value.ports)},
  {label: "资源城镇", value: formatNumberValue(metrics.value.resourceCities)},
  {label: "人口", value: formatPopulationValue(metrics.value.totalPopulation)},
  {label: "高亮", value: formatNumberValue(props.state.highlightCount || 0)},
  {label: "筛选", value: formatNumberValue(visibleRows.value.length)}
]);

const detailRows = computed(() => selected.value ? [
  {label: "类型", value: selected.value.type},
  {label: "人口", value: formatPopulationValue(selected.value.population)},
  {label: "标记", value: selected.value.flags},
  {label: "资源区域", value: formatNumberValue(selected.value.resourceCells)},
  {label: "资源种类", value: selected.value.resourceGoodNames || "无"},
  {label: "所属国家", value: selected.value.stateName},
  {label: "所属省份", value: selected.value.provinceName},
  {label: "所在 cell 归属", value: selected.value.cellOwnerName, debug: true},
  {label: "归属一致性", value: selected.value.ownerConsistency, debug: true},
  {label: "落水检查", value: selected.value.waterStatus, debug: true},
  {label: "异常提示", value: selected.value.ownerWarnings.length ? selected.value.ownerWarnings.join("；") : "none", debug: true},
  {label: "grid cell", value: selected.value.cell, debug: true},
  {label: "pack cell", value: selected.value.packCell, debug: true},
  {label: "burg id", value: selected.value.burgId, debug: true},
  {label: "文化", value: selected.value.culture},
  {label: "宗教", value: selected.value.religion},
  {label: "剪影", value: selected.value.visualLabel},
  {label: "文化样式", value: selected.value.cultureStyleLabel},
  {label: "备注", value: selected.value.noteBody ? `有备注（${formatNumberValue(selected.value.noteBody.length)}字）` : "无"},
  {label: "手动剪影", value: selected.value.manualVisual ? "是" : "否"}
] : []);

watch(() => selected.value?.id, syncVisualDraft, {immediate: true});
watch(() => selected.value?.id, id => {
  activeAction.value = null;
  if (!sameObjectId(renameRequestId.value, id)) return;
  renameRequestId.value = null;
  nextTick(() => {
    activeAction.value = "rename";
  });
});
watch(() => selected.value?.silhouette, syncVisualDraft);

function buildCityMetrics(map) {
  const scaleContext = createCityScaleContext(map?.settlements?.cities, map?.pack?.burgs);
  const rows = cityRows(map).map(city => {
    const burg = findBurgForCity(map, city);
    const stateId = numberOrFallback(city.state, burg?.state, 0);
    const provinceId = numberOrFallback(city.province, null, 0);
    const packCell = numberOrFallback(city.packCell, burg?.cell, null);
    const gridCell = numberOrFallback(city.cell, map?.pack?.cells?.g?.[packCell], null);
    const cultureId = numberOrFallback(city.culture, burg?.culture, map?.pack?.cells?.culture?.[packCell]);
    const religionId = numberOrFallback(city.religion, burg?.religion, map?.pack?.cells?.religion?.[packCell]);
    const population = Number(city.population ?? burg?.population ?? 0) || 0;
    const flags = cityFlags(city, burg);
    const owner = cityOwnerInfo(map, city, burg, {stateId, provinceId, packCell, gridCell});
    const culture = map?.society?.cultures?.[cultureId] || map?.pack?.cultures?.[cultureId] || null;
    const scale = deriveCityScale(city, scaleContext, burg);
    const visual = resolveCityVisual(city, culture, burg?.visual, scaleContext, burg);
    const note = readObjectNote(map, {kind: "city", id: city.id});

    return {
      id: city.id,
      burgId: city.burgId ?? burg?.i ?? "none",
      name: city.name || burg?.name || `城市 #${city.id}`,
      rawName: city.name || burg?.name || `城市 #${city.id}`,
      type: cityRoleScaleLabel(city, scaleContext, burg),
      scale,
      scaleLabel: cityScaleLabel(scale),
      flags: flags.join(" / ") || "普通",
      population,
      resourceCells: numberOrFallback(city.resourceCells, burg?.resourceCells, 0),
      markerResourceCells: numberOrFallback(city.markerResourceCells, burg?.markerResourceCells, 0),
      resourceGoodIds: city.resourceGoodIds || burg?.resourceGoodIds || [],
      resourceGoodNames: cityResourceGoodNames(map, city.resourceGoodIds || burg?.resourceGoodIds || []),
      resourceScore: Number(city.resourceScore ?? burg?.resourceScore ?? 0) || 0,
      stateId,
      stateName: indexedName(map?.politics?.states, stateId),
      provinceId,
      provinceName: indexedName(map?.politics?.provinces || map?.pack?.provinces, provinceId),
      cellOwnerName: owner.cellOwnerName,
      ownerConsistency: owner.ownerConsistency,
      waterStatus: owner.waterStatus,
      ownerWarnings: owner.warnings,
      canSyncOwner: owner.canSyncOwner,
      cell: gridCell ?? "none",
      packCell: packCell ?? "none",
      culture: indexedName(map?.society?.cultures, cultureId),
      religion: indexedName(map?.society?.religions, religionId),
      silhouette: visual.silhouette,
      palette: visual.palette,
      cultureStyle: visual.cultureStyle,
      cultureStyleLabel: cityCultureStyleLabel(visual.cultureStyle),
      visualLabel: citySilhouetteLabel(visual.silhouette),
      noteBody: note?.body || "",
      noteUpdatedAt: note?.updatedAt || "",
      manualVisual: Boolean(visual.manual),
      capital: Boolean(city.capital || burg?.capital),
      provincial: Boolean(city.provincial),
      port: Boolean(city.port || burg?.port)
    };
  });

  return {
    rows,
    total: rows.length,
    capitals: rows.filter(row => row.capital).length,
    ports: rows.filter(row => row.port).length,
    resourceCities: rows.filter(row => row.resourceCells > 0).length,
    totalPopulation: rows.reduce((sum, row) => sum + row.population, 0)
  };
}

function cityResourceGoodNames(map, ids) {
  if (!ids?.length) return "";
  return ids
    .map(id => map?.economy?.goods?.[id]?.name || map?.pack?.goods?.[id]?.name || `#${id}`)
    .slice(0, 5)
    .join("、");
}

function refreshRelocatedSelectedCityRow(map, row, cityId) {
  if (!row) return null;
  const city = cityRows(map).find(item => sameObjectId(item.id, cityId));
  if (!city) return row;
  const burg = findBurgForCity(map, city);
  const stateId = numberOrFallback(city.state, burg?.state, 0);
  const provinceId = numberOrFallback(city.province, null, 0);
  const packCell = numberOrFallback(city.packCell, burg?.cell, null);
  const gridCell = numberOrFallback(city.cell, map?.pack?.cells?.g?.[packCell], null);
  const cultureId = numberOrFallback(city.culture, burg?.culture, map?.pack?.cells?.culture?.[packCell]);
  const religionId = numberOrFallback(city.religion, burg?.religion, map?.pack?.cells?.religion?.[packCell]);
  const owner = cityOwnerInfo(map, city, burg, {stateId, provinceId, packCell, gridCell});
  const scaleContext = createCityScaleContext(map?.settlements?.cities, map?.pack?.burgs);
  return {
    ...row,
    type: cityRoleScaleLabel(city, scaleContext, burg),
    flags: cityFlags(city, burg).join(" / ") || "普通",
    stateId,
    stateName: indexedName(map?.politics?.states, stateId),
    provinceId,
    provinceName: indexedName(map?.politics?.provinces || map?.pack?.provinces, provinceId),
    cellOwnerName: owner.cellOwnerName,
    ownerConsistency: owner.ownerConsistency,
    waterStatus: owner.waterStatus,
    ownerWarnings: owner.warnings,
    canSyncOwner: owner.canSyncOwner,
    cell: gridCell ?? "none",
    packCell: packCell ?? "none",
    culture: indexedName(map?.society?.cultures, cultureId),
    religion: indexedName(map?.society?.religions, religionId),
    capital: Boolean(city.capital || burg?.capital),
    provincial: Boolean(city.provincial),
    port: Boolean(city.port || burg?.port)
  };
}

function handleEmptyAction(key) {
  if (key === "clear-filter") props.callbacks.onFilter?.("");
}

function handleHighlightAction(key) {
  if (key === "highlight-selected") props.callbacks.onHighlight?.(selectedCityRows.value);
  if (key === "clear-highlights") props.callbacks.onClearHighlights?.();
}

function cityRows(map) {
  return (map?.settlements?.cities || []).filter(city => city && !city.removed && Number.isInteger(city.id));
}

function filterRows(rows, filter) {
  const query = filter.trim().toLowerCase();
  if (!query) return rows;
  return rows.filter(row =>
    String(row.id).includes(query)
    || row.name.toLowerCase().includes(query)
    || row.rawName.toLowerCase().includes(query)
    || row.stateName.toLowerCase().includes(query)
    || row.provinceName.toLowerCase().includes(query)
    || row.type.toLowerCase().includes(query)
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
  if (key === "move") {
    props.callbacks.onMoveMode?.(!props.state.moveMode, selected.value?.id);
    return;
  }
  if (!key) activeAction.value = null;
}

function applyVisual() {
  if (!selected.value) return;
  props.callbacks.onVisualChange?.(selected.value.id, {
    silhouette: visualDraft.silhouette
  });
}

function handleCitySelect(row) {
  const now = currentTime();
  const repeated = sameObjectId(lastCitySelect.id, row?.id) && now - lastCitySelect.at <= 900;
  lastCitySelect.id = row?.id ?? null;
  lastCitySelect.at = now;
  if (repeated) {
    openRenameEditor(row);
    return;
  }
  props.callbacks.onSelect?.(row);
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

function currentTime() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function syncVisualDraft() {
  visualDraft.silhouette = selected.value?.silhouette || "town";
}

function cityFlags(city, burg) {
  const flags = [];
  if (city.capital || burg?.capital) flags.push("首都");
  if (city.provincial) flags.push("省会");
  if (city.port || burg?.port) flags.push("港口");
  if (city.citadel || burg?.citadel) flags.push("堡垒");
  if (city.walls || burg?.walls) flags.push("城墙");
  if (city.plaza || burg?.plaza) flags.push("广场");
  if (city.temple || burg?.temple) flags.push("神庙");
  return flags;
}

function cityOwnerInfo(map, city, burg, {stateId, provinceId, packCell, gridCell}) {
  const cellStateId = normalizeOwnerId(numberOrFallback(map?.pack?.cells?.state?.[packCell], map?.grid?.cells?.state?.[gridCell], 0));
  const cellProvinceId = normalizeOwnerId(numberOrFallback(map?.pack?.cells?.province?.[packCell], map?.grid?.cells?.province?.[gridCell], 0));
  const normalizedStateId = normalizeOwnerId(stateId);
  const normalizedProvinceId = normalizeOwnerId(provinceId);
  const burgStateId = normalizeOwnerId(burg?.state);
  const burgProvinceId = hasOwn(burg, "province") ? normalizeOwnerId(burg.province) : null;
  const warnings = [];

  if (normalizedStateId !== cellStateId) warnings.push(`国家不一致：城市 #${normalizedStateId} / cell #${cellStateId}`);
  if (burg && burgStateId !== cellStateId) warnings.push(`burg 国家不一致：burg #${burgStateId} / cell #${cellStateId}`);
  if (normalizedProvinceId !== cellProvinceId) warnings.push(`省份不一致：城市 #${normalizedProvinceId} / cell #${cellProvinceId}`);
  if (burgProvinceId !== null && burgProvinceId !== cellProvinceId) warnings.push(`burg 省份不一致：burg #${burgProvinceId} / cell #${cellProvinceId}`);

  const waterStatus = cityWaterStatus(map, packCell, gridCell);
  if (waterStatus !== "正常" && waterStatus !== "未知") warnings.push(waterStatus);

  return {
    cellOwnerName: `${indexedName(map?.politics?.states, cellStateId)} / ${indexedName(map?.politics?.provinces || map?.pack?.provinces, cellProvinceId)}`,
    ownerConsistency: warnings.some(item => item.includes("不一致")) ? "不一致" : "一致",
    waterStatus,
    warnings,
    canSyncOwner: Number.isInteger(packCell) && warnings.some(item => item.includes("不一致"))
  };
}

function cityWaterStatus(map, packCell, gridCell) {
  if (Number.isInteger(packCell)) {
    const height = map?.pack?.cells?.h?.[packCell];
    if (Number.isFinite(height) && height < 20) return `落水：pack cell #${packCell} 高度 ${formatHeightValue(height)}`;
    const featureId = map?.pack?.cells?.f?.[packCell];
    const feature = map?.pack?.features?.[featureId] || map?.features?.features?.[featureId];
    if (feature && feature.land === false) return `落水：pack cell #${packCell} 位于水体 feature #${featureId}`;
    return "正常";
  }
  if (Number.isInteger(gridCell)) {
    const height = map?.grid?.cells?.h?.[gridCell];
    if (Number.isFinite(height) && height < 20) return `落水：grid cell #${gridCell} 高度 ${formatHeightValue(height)}`;
    return "正常";
  }
  return "未知";
}

function findBurgForCity(map, city) {
  return map?.pack?.burgs?.[city.burgId] || (map?.pack?.burgs || []).find(burg => burg?.cityId === city.id) || null;
}

function indexedName(items, id) {
  const item = items?.[id];
  return item?.fullName || item?.name || (id === undefined || id === null || id === 0 ? "none" : `#${id}`);
}

function numberOrFallback(...values) {
  for (const value of values) {
    if (Number.isInteger(value)) return value;
  }
  return null;
}

function normalizeOwnerId(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? Math.max(0, numeric) : 0;
}

function hasOwn(object, key) {
  return Boolean(object && Object.prototype.hasOwnProperty.call(object, key));
}

function formatPopulationValue(value) {
  return formatPopulation(value, unitPreferences.value);
}

function formatHeightValue(value) {
  return formatHeight(value, unitPreferences.value);
}

function formatNumberValue(value) {
  return formatNumber(value, unitPreferences.value);
}
</script>
