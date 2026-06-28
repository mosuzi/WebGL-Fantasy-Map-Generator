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
      <UiButton variant="secondary" @click="editing ? callbacks.onCancelEdit?.() : callbacks.onEdit?.()">
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
const canRename = computed(() => canRenameObject(props.state.object));
const editableName = computed(() => props.state.object?.name || props.state.object?.text || props.state.object?.targetName || "");
const detailRowsWithState = computed(() => [...detailRows(props.state.object), {label: "状态", value: editing.value ? "编辑" : "查看"}]);

function isSameObject(a, b) {
  return Boolean(a && b && a.kind === b.kind && a.id === b.id);
}

function formatObjectTitle(object) {
  if (!object) return "未知对象";
  if (object.kind === "city") return `城市 ${object.name}`;
  if (object.kind === "label") return `标签 ${object.text}`;
  if (object.kind === "marker") return `标记 ${object.name}`;
  if (object.kind === "route") return `路线 ${object.from} -> ${object.to}`;
  if (object.kind === "river") return `河流 ${object.name || `#${object.id}`}`;
  if (object.kind === "province") return `省份 ${object.name}`;
  if (object.kind === "region") return `区域 ${object.name}`;
  return "未知对象";
}

function detailRows(object) {
  if (!object) return [];
  if (object.kind === "city") {
    return [
      {label: "类型", value: object.type},
      {label: "人口", value: object.population},
      {label: "国家", value: object.state},
      {label: "省份", value: object.province},
      {label: "对象 id", value: object.id}
    ];
  }
  if (object.kind === "route") {
    return [
      {label: "类型", value: object.type},
      {label: "等级", value: object.level},
      {label: "起点", value: object.from},
      {label: "终点", value: object.to},
      {label: "命中距离", value: formatDistance(object.distance)},
      {label: "对象 id", value: object.id}
    ];
  }
  if (object.kind === "marker") {
    return [
      {label: "类型", value: object.type},
      {label: "cell", value: object.cell},
      {label: "数据", value: formatMarkerData(object.data)},
      {label: "对象 id", value: object.id}
    ];
  }
  if (object.kind === "label") {
    return [
      {label: "文本", value: object.text},
      {label: "目标类型", value: object.targetKind},
      {label: "目标名称", value: object.targetName},
      {label: "显示序位", value: object.rank},
      {label: "对象 id", value: object.id}
    ];
  }
  if (object.kind === "river") {
    return [
      {label: "名称", value: object.name || `#${object.id}`},
      {label: "类型", value: object.type},
      {label: "流量", value: object.flux},
      {label: "长度", value: object.length},
      {label: "命中距离", value: formatDistance(object.distance)},
      {label: "对象 id", value: object.id}
    ];
  }
  if (object.kind === "province") {
    return [
      {label: "所属国家", value: object.state},
      {label: "国家 id", value: object.stateId},
      {label: "中心 cell", value: object.centerCell},
      {label: "对象 id", value: object.id}
    ];
  }
  if (object.kind === "region") {
    return [
      {label: "类型", value: "region"},
      {label: "对象 id", value: object.id}
    ];
  }
  return [{label: "类型", value: object.kind || "unknown"}];
}

function canRenameObject(object) {
  return object?.kind === "city" || (object?.kind === "label" && object.targetKind === "city");
}

function formatMarkerData(data = {}) {
  return Object.entries(data).map(([key, value]) => `${key}: ${value}`).join(" / ") || "none";
}

function formatDistance(value) {
  return Number.isFinite(value) ? value.toFixed(1) : "n/a";
}
</script>
