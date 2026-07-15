<template>
  <template v-if="state.object">
    <div class="object-details-title">{{ title }}</div>
    <UiDetailGrid class-name="object-details-list" :rows="detailRowsWithState" />
    <UiTextEditField
      v-if="editing && canRename"
      :model-value="editableName"
      class-name="object-name-editor"
      @apply="callbacks.onRename"
    />
    <div class="object-details-actions">
      <UiButton variant="secondary" @click="callbacks.onLocate">定位</UiButton>
      <UiButton
        v-if="canRenameFromNamebase"
        variant="secondary"
        title="按当前名称库重命名这个对象"
        @click="callbacks.onRenameFromNamebase?.()"
      >
        名称库改名
      </UiButton>
      <UiButton v-if="canEdit" variant="secondary" @click="editing ? callbacks.onCancelEdit?.() : callbacks.onEdit?.()">
        {{ editing ? "退出编辑" : "编辑" }}
      </UiButton>
    </div>
  </template>
</template>

<script setup>
import {computed} from "vue";
import UiButton from "./base/UiButton.vue";
import UiDetailGrid from "./base/UiDetailGrid.vue";
import UiTextEditField from "./base/UiTextEditField.vue";
import {formatArea, formatDistance, formatMilitary, formatNumber, formatPopulation, formatPrecipitation, formatRiverFlow, formatRiverRunoffFlowRange} from "../../display-units.js";
import {useUnitPreferences} from "../composables/use-unit-preferences.js";
import {LABEL_TARGET_KIND, OBJECT_KIND, OBJECT_KIND_LABEL} from "../../../runtime/object-kinds.js";

defineOptions({
  name: "ObjectDetailsPanel"
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

const editing = computed(() => isSameObject(props.state.object, props.state.editingObject));
const title = computed(() => formatObjectTitle(props.state.object));
const canEdit = computed(() => canEditObject(props.state.object));
const canRename = computed(() => canRenameObject(props.state.object));
const canRenameFromNamebase = computed(() => canRenameObjectFromNamebase(props.state.object));
const editableName = computed(() => props.state.object?.name || props.state.object?.text || props.state.object?.targetName || "");
const detailRowsWithState = computed(() => [...detailRows(props.state.object), {label: "状态", value: editing.value ? "编辑" : "查看"}]);
const unitPreferences = useUnitPreferences();

const OBJECT_TITLE_FORMATTERS = Object.freeze({
  [OBJECT_KIND.CITY]: object => `城市 ${object.name}`,
  [OBJECT_KIND.LABEL]: object => `标签 ${object.text}`,
  [OBJECT_KIND.MARKER]: object => `标记 ${formatMarkerTitle(object)}`,
  [OBJECT_KIND.ROUTE]: object => `路线 ${object.from} -> ${object.to}`,
  [OBJECT_KIND.TRADE_FLOW]: object => `贸易流 ${object.goodName || `#${object.id}`}`,
  [OBJECT_KIND.RIVER]: object => `河流 ${object.name || `#${object.id}`}`,
  [OBJECT_KIND.LAKE]: object => `湖泊 ${object.name || `#${object.id}`}`,
  [OBJECT_KIND.MILITARY]: object => `军团 ${object.name || `#${object.id}`}`,
  [OBJECT_KIND.PROVINCE]: object => `省份 ${object.name}`,
  [OBJECT_KIND.REGION]: object => `区域 ${object.name}`
});

const OBJECT_DETAIL_ROWS = Object.freeze({
  [OBJECT_KIND.CITY]: object => [
    {label: "类型", value: object.type},
    {label: "人口", value: formatPopulationValue(object.population)},
    {label: "国家", value: object.state},
    {label: "省份", value: object.province},
    {label: "对象 id", value: object.id, debug: true}
  ],
  [OBJECT_KIND.ROUTE]: object => [
    {label: "类型", value: object.type},
    {label: "等级", value: object.level},
    {label: "起点", value: object.from},
    {label: "终点", value: object.to},
    {label: "命中距离", value: formatDistanceValue(object.distance), debug: true},
    {label: "对象 id", value: object.id, debug: true}
  ],
  [OBJECT_KIND.TRADE_FLOW]: object => [
    {label: "商品", value: object.goodName || `商品 #${object.goodId}`},
    {label: "卖方", value: object.sellerName || `${object.sellerType} #${object.sellerId}`},
    {label: "买方", value: object.buyerName || `${object.buyerType} #${object.buyerId}`},
    {label: "来源", value: object.sourceLabel || object.source || "计划交易"},
    {label: "贸易距离", value: formatOptionalDistanceValue(object.tradeDistance)},
    {label: "数量", value: formatNumberValue(object.units)},
    {label: "基础单价", value: formatNumberValue(object.basePrice)},
    {label: "单价", value: formatNumberValue(object.price)},
    {label: "有效价", value: formatNumberValue(object.effectivePrice)},
    {label: "价差信号", value: object.priceSignalLabel || "平稳"},
    {label: "价差", value: formatSignedNumberValue(object.priceDelta)},
    {label: "价格压力", value: formatSignedNumberValue(object.pricePressure)},
    {label: "运距成本", value: formatNumberValue(object.distanceCost)},
    {label: "距离倍率", value: `${formatNumberValue(object.distanceMultiplier || 1)}x`},
    {label: "金额", value: formatNumberValue(object.value)},
    {label: "税额", value: formatNumberValue(object.tax)},
    {label: "命中距离", value: formatDistanceValue(object.distance), debug: true},
    {label: "deal id", value: object.id, debug: true}
  ],
  [OBJECT_KIND.MARKER]: object => [
    {label: "类型", value: `${object.label || object.type} / ${object.type}`},
    {label: "类别", value: object.categoryLabel || object.category || "未知"},
    {label: "资源", value: object.resourceLabel || "无"},
    {label: "经济潜力", value: formatNumberValue(object.economicValue)},
    {label: "国家", value: object.state || object.data?.state || "none"},
    {label: "省份", value: object.province || object.data?.province || "none"},
    {label: "cell", value: `${object.cell} / pack ${object.packCell ?? object.data?.packCell ?? "none"}`, debug: true},
    {label: "数据", value: formatMarkerData(object.data), debug: true},
    {label: "对象 id", value: object.id, debug: true}
  ],
  [OBJECT_KIND.LABEL]: object => [
    {label: "文本", value: object.text},
    {label: "目标类型", value: object.targetKind},
    {label: "目标名称", value: object.targetName},
    {label: "显示序位", value: object.rank},
    {label: "对象 id", value: object.id, debug: true}
  ],
  [OBJECT_KIND.RIVER]: object => [
    {label: "名称", value: object.name || `#${object.id}`},
    {label: "类型", value: object.type},
    {label: "流量", value: formatRiverFlowValue(object.flux)},
    {label: "长度", value: formatDistanceValue(object.length)},
    {label: "汇水面积", value: formatHydrologyArea(object.hydrology)},
    {label: "流域均降水", value: formatHydrologyPrecipitation(object.hydrology)},
    {label: "物理估算", value: formatHydrologyFlowRange(object.hydrology)},
    {label: "诊断方式", value: formatHydrologyMethod(object.hydrology)},
    {label: "命中距离", value: formatDistanceValue(object.distance), debug: true},
    {label: "对象 id", value: object.id, debug: true}
  ],
  [OBJECT_KIND.LAKE]: object => [
    {label: "名称", value: object.name || `#${object.id}`},
    {label: "类型", value: lakeTypeLabel(object.type)},
    {label: "面积", value: formatNumberValue(object.area)},
    {label: "水位", value: formatNumberValue(object.height)},
    {label: "补给", value: formatNumberValue(object.flux)},
    {label: "蒸发", value: formatNumberValue(object.evaporation)},
    {label: "cell", value: object.firstCell, debug: true},
    {label: "对象 id", value: object.id, debug: true}
  ],
  [OBJECT_KIND.MILITARY]: object => [
    {label: "国家", value: object.state || object.stateId || "none"},
    {label: "态势", value: object.statusLabel || object.status || "未知"},
    {label: "主兵种", value: object.dominantUnitLabel || object.dominantUnit || "未知"},
    {label: "兵力", value: formatMilitaryValue(object.troops)},
    {label: "cell", value: object.cell ?? "none", debug: true},
    {label: "对象 id", value: object.id, debug: true}
  ],
  [OBJECT_KIND.PROVINCE]: object => [
    {label: "所属国家", value: object.state},
    {label: "国家 id", value: object.stateId},
    {label: "中心 cell", value: object.centerCell, debug: true},
    {label: "对象 id", value: object.id, debug: true}
  ],
  [OBJECT_KIND.REGION]: object => [
    {label: "类型", value: "region"},
    {label: "对象 id", value: object.id, debug: true}
  ]
});

function isSameObject(a, b) {
  return Boolean(a && b && a.kind === b.kind && a.id === b.id);
}

function formatObjectTitle(object) {
  if (!object) return "未知对象";
  return OBJECT_TITLE_FORMATTERS[object.kind]?.(object) || `${OBJECT_KIND_LABEL[object.kind] || "对象"} ${object.name || object.fullName || object.text || `#${object.id}`}`;
}

function detailRows(object) {
  if (!object) return [];
  return OBJECT_DETAIL_ROWS[object.kind]?.(object) || [{label: "类型", value: object.kind || "unknown"}];
}

function canRenameObject(object) {
  return object?.kind === OBJECT_KIND.CITY || object?.kind === OBJECT_KIND.LAKE || (object?.kind === OBJECT_KIND.LABEL && (object.targetKind === LABEL_TARGET_KIND.CITY || object.targetKind === LABEL_TARGET_KIND.STATE));
}

function canRenameObjectFromNamebase(object) {
  if (object?.kind === OBJECT_KIND.CITY || object?.kind === OBJECT_KIND.RIVER || object?.kind === OBJECT_KIND.LAKE) return Number(object.id) >= 0;
  if (object?.kind === OBJECT_KIND.STATE) return Number(object.id) > 0;
  if (object?.kind !== OBJECT_KIND.LABEL) return false;
  if (object.targetKind === LABEL_TARGET_KIND.CITY) return Number(object.targetId ?? object.id) >= 0;
  if (object.targetKind === LABEL_TARGET_KIND.STATE) return Number(object.targetId ?? object.id) > 0;
  return false;
}

function canEditObject(object) {
  return object?.kind !== OBJECT_KIND.TRADE_FLOW;
}

function formatMarkerTitle(object) {
  const icon = object.icon ? `${object.icon} ` : "";
  return `${icon}${object.name || object.label || object.type || "unknown"}`;
}

function formatMarkerData(data = {}) {
  return Object.entries(data).map(([key, value]) => `${key}: ${value}`).join(" / ") || "none";
}

function lakeTypeLabel(type) {
  return {
    lake: "湖泊",
    frozen: "冰湖",
    lava: "熔岩湖",
    dry: "干湖",
    sinkhole: "落水洞",
    salt: "盐湖",
    fresh: "淡水湖"
  }[type] || type || "湖泊";
}

function formatDistanceValue(value) {
  return formatDistance(value, unitPreferences.value);
}

function formatOptionalDistanceValue(value) {
  return Number.isFinite(value) ? formatDistance(value, unitPreferences.value) : "未知";
}

function formatPopulationValue(value) {
  return formatPopulation(value, unitPreferences.value);
}

function formatMilitaryValue(value) {
  return formatMilitary(value, unitPreferences.value);
}

function formatNumberValue(value) {
  return formatNumber(value, unitPreferences.value);
}

function formatRiverFlowValue(value) {
  return formatRiverFlow(value, unitPreferences.value);
}

function formatHydrologyArea(hydrology) {
  if (!hasHydrology(hydrology)) return "未知";
  return formatArea(hydrology.catchmentArea, unitPreferences.value);
}

function formatHydrologyPrecipitation(hydrology) {
  if (!hasHydrology(hydrology)) return "未知";
  return formatPrecipitation(hydrology.averagePrecipitation, unitPreferences.value);
}

function formatHydrologyFlowRange(hydrology) {
  if (!hasHydrology(hydrology)) return "未知";
  return `${formatRiverRunoffFlowRange(hydrology, unitPreferences.value)}（径流系数 0.2-0.5）`;
}

function formatHydrologyMethod(hydrology) {
  if (!hasHydrology(hydrology)) return "未知";
  return hydrology.method === "river-path-fallback" ? "河道近似" : "汇水累计";
}

function hasHydrology(hydrology) {
  return Number.isFinite(hydrology?.catchmentArea) && hydrology.catchmentArea > 0 && Number.isFinite(hydrology.averagePrecipitation);
}

function formatSignedNumberValue(value) {
  const numeric = Number(value || 0);
  return `${numeric > 0 ? "+" : ""}${formatNumber(numeric, unitPreferences.value)}`;
}
</script>
