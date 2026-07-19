<template>
  <UiMetricGrid :metrics="summaryMetrics" class-name="feature-panel-summary" />

  <div class="feature-panel-controls">
    <UiFilterInput :model-value="state.filter" placeholder="筛选编号 / 类型 / 分组" @update:model-value="callbacks.onFilter" />
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
    :selected-id="state.selectedFeatureId"
    :show-locate-action="false"
    empty-text="没有匹配的地貌单元"
    :empty-action="filterEmptyAction"
    resizable-columns
    @select="callbacks.onSelect"
    @empty-action="handleEmptyAction"
    @column-resize="callbacks.onColumnResize"
  />

  <UiDetailGrid class-name="feature-panel-details" empty-text="未选中地貌单元" :rows="detailRows" :auto-wide="false" />

  <section class="feature-topology-editor" aria-label="海岸编辑">
    <h3>海岸编辑</h3>
    <UiSelectField
      input-id="feature-topology-mode"
      label="操作模式"
      :model-value="state.topologyMode"
      :options="topologyModeOptions"
      @update:model-value="callbacks.onTopologyMode"
    />
    <p class="feature-topology-selection">
      已选 {{ state.topologyGridCells.length }} 处地图区域
    </p>
    <p class="feature-topology-note">请在地图上连续选择需要修改的范围。整湖填平请使用湖泊面板的“填平并删除选中湖泊”。</p>
    <div class="feature-topology-actions">
      <UiButton variant="secondary" :active="state.topologySelectMode" @click="callbacks.onTopologySelectMode(!state.topologySelectMode)">
        {{ state.topologySelectMode ? "结束地图选择" : "在地图选择范围" }}
      </UiButton>
      <UiButton variant="secondary" :disabled="!state.topologyGridCells.length" @click="callbacks.onTopologyClear">清空选择</UiButton>
      <UiButton :disabled="!state.topologyGridCells.length" @click="callbacks.onTopologyApply">应用海岸修改</UiButton>
      <UiButton variant="secondary" @click="callbacks.onTopologyCancel">取消</UiButton>
    </div>
    <UiStateBanner
      :kind="topologyBannerKind"
      title="操作提示"
      :message="topologyBannerMessage"
    />
    <details v-if="debugEnabled" class="feature-topology-diagnostics">
      <summary>开发诊断</summary>
      <p>已选 grid cells：{{ topologyCellSummary || "无" }}</p>
      <UiButton variant="secondary" :disabled="!state.topologyGridCells.length" @click="callbacks.onTopologyInspect">运行拓扑预检</UiButton>
      <pre v-if="state.topologyInspection">{{ formattedTopologyInspection }}</pre>
    </details>
  </section>
</template>

<script setup>
import {computed} from "vue";
import UiButton from "./base/UiButton.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiFilterInput from "./base/UiFilterInput.vue";
import UiMetricGrid from "./base/UiMetricGrid.vue";
import UiObjectTable from "./base/UiObjectTable.vue";
import UiSelectField from "./base/UiSelectField.vue";
import UiStateBanner from "./base/UiStateBanner.vue";
import {formatArea, formatDistance, formatNumber as formatDisplayNumber} from "../../display-units.js";
import {findByObjectId} from "../../object-id.js";
import {compareRowsByKey} from "../../sort-utils.js";
import {useDebugMode} from "../composables/use-debug-mode.js";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";
import {buildFeatureDetailRows} from "./feature-detail-layout.js";

defineOptions({
  name: "FeaturePanel"
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
  {key: "cells", label: "采样格"},
  {key: "area", label: "面积"},
  {key: "shorelineCells", label: "岸线"},
  {key: "flux", label: "补给"},
  {key: "evaporation", label: "蒸发"},
  {key: "group", label: "分组"},
  {key: "id", label: "ID"}
]);

const columns = Object.freeze([
  {key: "id", label: "ID", align: "right", width: 56},
  {key: "typeLabel", label: "类型", width: 76},
  {key: "groupLabel", label: "分组", width: 96},
  {key: "cells", label: "采样格", align: "right", format: value => formatNumber(value)},
  {key: "area", label: "面积", align: "right", format: value => formatAreaValue(value)},
  {key: "shorelineCells", label: "岸线", align: "right", format: value => formatNumber(value)},
  {key: "havenCells", label: "港湾", align: "right", format: value => formatNumber(value)}
]);
const topologyModeOptions = Object.freeze([
  {value: "carve-coast", label: "雕刻海岸"},
  {value: "reclaim-coast", label: "填补海岸"},
  {value: "open-strait", label: "开辟海峡"},
  {value: "close-strait", label: "封闭海峡"},
  {value: "open-lake-to-sea", label: "连接湖泊与海洋"}
]);

const unitPreferences = useUnitPreferences();
const debugEnabled = useDebugMode();
const metrics = computed(() => {
  props.state.version;
  return buildFeatureMetrics(props.state.map);
});
const visibleRows = computed(() => sortRows(filterRows(metrics.value.rows, props.state.filter), props.state.sortKey, props.state.sortDir));
const filterEmptyAction = computed(() => String(props.state.filter || "").trim()
  ? {key: "clear-filter", label: "清空筛选", icon: "⌫"}
  : null);
const selected = computed(() => findByObjectId(metrics.value.rows, props.state.selectedFeatureId));
const topologyCellSummary = computed(() => {
  const cells = props.state.topologyGridCells || [];
  const visible = cells.slice(0, 12).map(cell => `#${cell}`).join("、");
  return cells.length > 12 ? `${visible} 等` : visible;
});
const topologyBannerKind = computed(() => {
  if (!props.state.topologyInspection) return "info";
  return props.state.topologyInspection.valid ? "preview" : "error";
});
const topologyBannerMessage = computed(() => {
  const inspection = props.state.topologyInspection;
  if (!inspection) return "应用时会自动检查水陆连通、城市、河流、港口和路线；成功后可撤销。";
  if (!inspection.valid) return playerTopologyError(inspection.code);
  return "所选范围可以安全修改；应用后可通过撤销恢复。";
});
const formattedTopologyInspection = computed(() => JSON.stringify(props.state.topologyInspection, null, 2));

const summaryMetrics = computed(() => [
  {label: "地貌单元", value: formatNumber(metrics.value.total)},
  {label: "陆地", value: formatNumber(metrics.value.land)},
  {label: "水域", value: formatNumber(metrics.value.water)},
  {label: "湖泊", value: formatNumber(metrics.value.lakes)},
  {label: "海岸线段", value: formatNumber(metrics.value.coastlineSegments)},
  {label: "海岸长度", value: formatDistanceValue(metrics.value.coastlineLength)},
  {label: "湖岸长度", value: formatDistanceValue(metrics.value.lakeShoreLength)},
  {label: "港湾采样格", value: formatNumber(metrics.value.havenCells)},
  {label: "泊位强度", value: formatNumber(metrics.value.harborScore)},
  {label: "异常引用", value: formatNumber(metrics.value.invalidReferences)}
]);

const detailRows = computed(() => buildFeatureDetailRows(selected.value, {
  formatNumber,
  formatArea: formatAreaValue
}));

function buildFeatureMetrics(map) {
  const rows = (map?.pack?.features || []).filter(feature => feature && !feature.removed).map(featureRow);
  attachHavenHarborMetrics(rows, map);
  const shoreline = map?.features?.shore || {};
  const invalidReferences = countInvalidReferences(map);
  return {
    rows,
    total: rows.length,
    land: rows.filter(row => row.land).length,
    water: rows.filter(row => !row.land).length,
    lakes: rows.filter(row => row.type === "lake").length,
    oceans: rows.filter(row => row.type === "ocean").length,
    islands: rows.filter(row => row.type === "island").length,
    coastlineSegments: shoreline.coastline?.length || 0,
    lakeShoreSegments: shoreline.lakeShore?.length || 0,
    coastlineLength: totalSegmentLength(shoreline.coastline),
    lakeShoreLength: totalSegmentLength(shoreline.lakeShore),
    havenCells: rows.reduce((sum, row) => sum + row.havenCells, 0),
    harborScore: rows.reduce((sum, row) => sum + row.harborScore, 0),
    invalidReferences
  };
}

function featureRow(feature) {
  const id = Number(feature.i ?? feature.id);
  const type = feature.type || "unknown";
  const group = feature.group || "none";
  return {
    id,
    type,
    typeLabel: typeLabel(type),
    group,
    groupLabel: groupLabel(group),
    land: Boolean(feature.land),
    border: Boolean(feature.border),
    cells: Number(feature.cells || 0),
    area: Number(feature.area || 0),
    shorelineCells: Array.isArray(feature.shoreline) ? feature.shoreline.length : 0,
    havenCells: 0,
    harborScore: 0,
    height: Number(feature.height || 0),
    flux: Number(feature.flux || 0),
    evaporation: Number(feature.evaporation || 0),
    firstCell: Number(feature.firstCell || 0)
  };
}

function attachHavenHarborMetrics(rows, map) {
  const byId = new Map(rows.map(row => [row.id, row]));
  const cells = map?.pack?.cells;
  if (!cells?.haven || !cells?.f) return;
  for (const cell of cells.i || []) {
    const havenCell = cells.haven[cell];
    if (!Number.isInteger(havenCell) || havenCell <= 0) continue;
    const waterFeatureId = cells.f[havenCell];
    const row = byId.get(waterFeatureId);
    if (!row) continue;
    row.havenCells++;
    row.harborScore += Number(cells.harbor?.[cell] || 0);
  }
}

function countInvalidReferences(map) {
  let invalid = 0;
  const packFeatures = map?.pack?.features || [];
  for (const featureId of map?.pack?.cells?.f || []) if (featureId && (!packFeatures[featureId] || packFeatures[featureId].removed)) invalid++;
  const gridFeatures = map?.features?.features || [];
  for (const featureId of map?.grid?.cells?.f || []) if (featureId && (!gridFeatures[featureId] || gridFeatures[featureId].removed)) invalid++;
  return invalid;
}

function totalSegmentLength(segments) {
  return (segments || []).reduce((sum, segment) => sum + segmentLength(segment), 0);
}

function segmentLength(segment) {
  const [from, to] = segment || [];
  if (!Array.isArray(from) || !Array.isArray(to)) return 0;
  return Math.hypot(Number(to[0] || 0) - Number(from[0] || 0), Number(to[1] || 0) - Number(from[1] || 0));
}

function filterRows(sourceRows, filter) {
  const query = String(filter || "").trim().toLowerCase();
  if (!query) return sourceRows;
  return sourceRows.filter(row => [
    row.id,
    row.type,
    row.typeLabel,
    row.group,
    row.groupLabel
  ].some(value => String(value || "").toLowerCase().includes(query)));
}

function sortRows(sourceRows, key, direction) {
  return [...sourceRows].sort((a, b) => compareRowsByKey(a, b, key, direction));
}

function handleEmptyAction(key) {
  if (key === "clear-filter") props.callbacks.onFilter?.("");
}

function typeLabel(type) {
  return {
    island: "陆地",
    ocean: "海洋",
    lake: "湖泊"
  }[type] || type || "未知";
}

function groupLabel(group) {
  return {
    continent: "大陆",
    island: "岛屿",
    isle: "小岛",
    lake_island: "湖中岛",
    ocean: "大洋",
    sea: "海",
    gulf: "湾",
    freshwater: "淡水湖",
    salt: "盐湖",
    frozen: "冻湖",
    lava: "熔岩湖",
    dry: "干湖",
    sinkhole: "陷穴湖",
    none: "未分组"
  }[group] || group || "未分组";
}

function playerTopologyError(code) {
  if (["empty-selection", "invalid-cell"].includes(code)) return "请重新在地图上选择需要修改的连续范围。";
  if (code === "disconnected-selection") return "选择范围必须彼此相连，请缩小范围或补齐中间区域。";
  if (code === "mixed-source") return "当前操作不能混选陆地与水域，请只选择一种地表。";
  if (["remove-whole-land-feature", "remove-all-land"].includes(code)) return "不能让整座陆地完全沉没，请保留一部分陆地。";
  if (["fill-whole-open-ocean", "remove-last-open-ocean"].includes(code)) return "不能填平整片开放海洋，请缩小选择范围。";
  if (["not-open-coast", "component-count-changed"].includes(code)) return "当前范围不适合普通海岸修改，请改用海峡操作或调整范围。";
  if (code === "ambiguous-land-coast") return "填补范围需要紧邻同一片陆地，请调整选择范围。";
  if (String(code || "").startsWith("strait-")) return "所选范围还没有形成有效海峡，请让通道连接两侧水域或陆地。";
  if (String(code || "").startsWith("channel-")) return "所选通道需要同时连接湖泊与开放海洋。";
  if (String(code || "").startsWith("protected-")) return "选择范围内有城市、河流或路线关键点，请避开后再试。";
  if (code === "route-would-break") return "修改会截断现有路线，请避开路线或调整范围。";
  if (code === "port-would-be-invalid") return "修改会让现有港口失去有效港湾，请调整附近海岸。";
  if (code === "feature-mismatch") return "选择范围没有连接到目标水体或陆地，请重新选择。";
  return "当前范围无法安全修改，请调整选择范围后重试。";
}

function formatAreaValue(value) {
  return formatArea(value, unitPreferences.value);
}

function formatDistanceValue(value) {
  return formatDistance(value, unitPreferences.value);
}

function formatNumber(value) {
  return formatDisplayNumber(value, unitPreferences.value);
}
</script>
