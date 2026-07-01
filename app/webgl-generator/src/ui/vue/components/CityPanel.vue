<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="city-panel-summary" />

  <div class="city-panel-controls">
    <UiFilterInput :model-value="state.filter" placeholder="筛选名称 / id / 国家 / 省份" @update:model-value="callbacks.onFilter" />
  </div>

  <UiSortBar class-name="city-panel-sort" :options="sortOptions" :active-key="state.sortKey" :direction="state.sortDir" @sort="callbacks.onSort" />

  <UiObjectTable
    :columns="columns"
    :rows="visibleRows"
    :selected-id="state.selectedCityId"
    empty-text="没有匹配的城市"
    @select="callbacks.onSelect"
    @locate="callbacks.onLocate"
  />

  <UiDetailGrid class-name="city-panel-details" empty-text="未选中城市" :rows="detailRows" />

  <UiActionDock v-if="selected" v-model:active="activeAction" :actions="cityActions">
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
        <UiButton variant="secondary" :disabled="!selected.canSyncOwner" @click="callbacks.onSyncOwnerToCell(selected.id)">同步归属到所在 cell</UiButton>
      </div>
    </template>

    <template #visual>
      <div class="city-visual-editor">
        <UiSelectField class-name="city-visual-select" label="剪影" :model-value="visualDraft.silhouette" :options="silhouetteOptions" @update:model-value="visualDraft.silhouette = $event" />
        <UiSelectField class-name="city-visual-select" label="配色" :model-value="visualDraft.palette" :options="paletteOptions" @update:model-value="visualDraft.palette = $event" />
        <UiButton variant="secondary" @click="applyVisual">应用剪影</UiButton>
        <UiButton variant="secondary" :disabled="!selected.manualVisual" @click="callbacks.onVisualReset(selected.id)">恢复自动</UiButton>
      </div>
    </template>
  </UiActionDock>

  <UiHistoryActions class-name="city-history-actions" :history="state.history" @undo="callbacks.onUndo" @redo="callbacks.onRedo" />
</template>

<script setup>
import {computed, reactive, ref, watch} from "vue";
import UiActionDock from "./base/UiActionDock.vue";
import UiButton from "./base/UiButton.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiHistoryActions from "./base/UiHistoryActions.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiNumberField from "./base/UiNumberField.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiSelectField from "./base/UiSelectField.vue";
import UiSortBar from "./base/UiSortBar.vue";
import UiTextEditField from "./base/UiTextEditField.vue";
import {
  CITY_PALETTE_OPTIONS,
  CITY_SILHOUETTE_OPTIONS,
  cityCultureStyleLabel,
  cityPaletteLabel,
  citySilhouetteLabel,
  resolveCityVisual
} from "../../../runtime/city-visuals.js";
import {formatPopulation} from "../../display-units.js";
import {findByObjectId} from "../../object-id.js";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";

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
  {key: "type", label: "类型"},
  {key: "stateName", label: "国家"},
  {key: "provinceName", label: "省份"},
  {key: "id", label: "ID"}
]);

const silhouetteOptions = CITY_SILHOUETTE_OPTIONS;
const paletteOptions = CITY_PALETTE_OPTIONS;

const columns = Object.freeze([
  {key: "id", label: "ID", align: "right"},
  {key: "name", label: "名称"},
  {key: "type", label: "类型"},
  {key: "stateName", label: "国家"},
  {key: "provinceName", label: "省份"},
  {key: "population", label: "人口", align: "right", format: value => formatPopulationValue(value)}
]);

const unitPreferences = useUnitPreferences();
const activeAction = ref(null);
const metrics = computed(() => buildCityMetrics(props.state.map));
const visibleRows = computed(() => sortRows(filterRows(metrics.value.rows, props.state.filter), props.state.sortKey, props.state.sortDir));
const selected = computed(() => findByObjectId(metrics.value.rows, props.state.selectedCityId));
const visualDraft = reactive({
  silhouette: "town",
  palette: "town"
});
const cityActions = computed(() => [
  {key: "rename", label: "重命名", icon: "✎"},
  {key: "population", label: "调整人口", icon: "#"},
  {key: "owner", label: "同步归属", icon: "⇄", disabled: !selected.value?.canSyncOwner},
  {key: "visual", label: "调整剪影", icon: "▣"}
]);

const summaryMetrics = computed(() => [
  {label: "城市", value: metrics.value.total},
  {label: "首都", value: metrics.value.capitals},
  {label: "港口", value: metrics.value.ports},
  {label: "人口", value: formatPopulationValue(metrics.value.totalPopulation)},
  {label: "筛选", value: visibleRows.value.length}
]);

const detailRows = computed(() => selected.value ? [
  {label: "类型", value: selected.value.type},
  {label: "人口", value: formatPopulationValue(selected.value.population)},
  {label: "标记", value: selected.value.flags},
  {label: "所属国家", value: selected.value.stateName},
  {label: "所属省份", value: selected.value.provinceName},
  {label: "所在 cell 归属", value: selected.value.cellOwnerName},
  {label: "归属一致性", value: selected.value.ownerConsistency},
  {label: "落水检查", value: selected.value.waterStatus},
  {label: "异常提示", value: selected.value.ownerWarnings.length ? selected.value.ownerWarnings.join("；") : "none"},
  {label: "grid cell", value: selected.value.cell},
  {label: "pack cell", value: selected.value.packCell},
  {label: "burg id", value: selected.value.burgId},
  {label: "文化", value: selected.value.culture},
  {label: "宗教", value: selected.value.religion},
  {label: "剪影", value: selected.value.visualLabel},
  {label: "文化样式", value: selected.value.cultureStyleLabel},
  {label: "手动剪影", value: selected.value.manualVisual ? "是" : "否"}
] : []);

watch(() => selected.value?.id, syncVisualDraft, {immediate: true});
watch(() => selected.value?.id, () => {
  activeAction.value = null;
});
watch(() => selected.value?.silhouette, syncVisualDraft);
watch(() => selected.value?.palette, syncVisualDraft);

function buildCityMetrics(map) {
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
    const visual = resolveCityVisual(city, culture, burg?.visual);

    return {
      id: city.id,
      burgId: city.burgId ?? burg?.i ?? "none",
      name: city.name || burg?.name || `城市 #${city.id}`,
      rawName: city.name || burg?.name || `城市 #${city.id}`,
      type: formatCityType(city, burg, population),
      flags: flags.join(" / ") || "普通",
      population,
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
      visualLabel: `${citySilhouetteLabel(visual.silhouette)} / ${cityPaletteLabel(visual.palette)}`,
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
    totalPopulation: rows.reduce((sum, row) => sum + row.population, 0)
  };
}

function cityRows(map) {
  return (map?.settlements?.cities || []).filter(city => city && Number.isInteger(city.id));
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
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (a[key] === b[key]) return a.id - b.id;
    if (typeof a[key] === "string") return a[key].localeCompare(b[key], "zh-CN") * factor;
    return a[key] > b[key] ? factor : -factor;
  });
}

function formatCityType(city, burg, population) {
  if (city.capital || burg?.capital) return "首都";
  if (city.provincial) return "省会";
  if (city.port || burg?.port) return "港口";
  if (city.group === "hamlet" || burg?.group === "hamlet") return "村镇";
  if (population >= 5 || city.group === "city" || burg?.group === "city") return "城市";
  return "城镇";
}

function applyVisual() {
  if (!selected.value) return;
  props.callbacks.onVisualChange?.(selected.value.id, {
    silhouette: visualDraft.silhouette,
    palette: visualDraft.palette
  });
}

function syncVisualDraft() {
  visualDraft.silhouette = selected.value?.silhouette || "town";
  visualDraft.palette = selected.value?.palette || "town";
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
    if (Number.isFinite(height) && height < 20) return `落水：pack cell #${packCell} 高度 ${height}`;
    const featureId = map?.pack?.cells?.f?.[packCell];
    const feature = map?.pack?.features?.[featureId] || map?.features?.features?.[featureId];
    if (feature && feature.land === false) return `落水：pack cell #${packCell} 位于水体 feature #${featureId}`;
    return "正常";
  }
  if (Number.isInteger(gridCell)) {
    const height = map?.grid?.cells?.h?.[gridCell];
    if (Number.isFinite(height) && height < 20) return `落水：grid cell #${gridCell} 高度 ${height}`;
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
</script>
