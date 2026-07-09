<template>
  <div
    :class="['ui-key-value-grid', `ui-key-value-grid--${variant}`, className]"
    :style="gridStyle"
  >
    <template v-if="visibleItems.length">
      <div
        v-for="item in visibleItems"
        :key="item.key"
        :class="['ui-key-value-item', {'is-wide': item.wide}]"
      >
        <span class="ui-key-value-label">{{ item.label }}</span>
        <strong class="ui-key-value-value">{{ item.value }}</strong>
      </div>
    </template>
    <p v-else class="ui-key-value-empty">{{ emptyText }}</p>
  </div>
</template>

<script setup>
import {computed} from "vue";
import {useDebugMode} from "../../composables/use-debug-mode.js";

defineOptions({
  name: "UiKeyValueGrid"
});

const props = defineProps({
  className: {
    type: String,
    default: ""
  },
  items: {
    type: Array,
    default: () => []
  },
  emptyText: {
    type: String,
    default: "暂无数据"
  },
  variant: {
    type: String,
    default: "detail",
    validator: value => ["metric", "detail", "compact"].includes(value)
  },
  minWidth: {
    type: Number,
    default: 0
  },
  autoWide: {
    type: Boolean,
    default: true
  },
  wideValueLength: {
    type: Number,
    default: 18
  }
});

const debugEnabled = useDebugMode();
const gridStyle = computed(() => props.minWidth > 0 ? {"--ui-key-value-min": `${props.minWidth}px`} : {});
const visibleItems = computed(() => props.items
  .filter(item => !item?.debug || debugEnabled.value)
  .map((item, index) => normalizeItem(item, index)));

function normalizeItem(item, index) {
  const label = formatCellText(item?.label, "未命名");
  const value = formatCellText(item?.value, "无");
  return {
    key: item?.key ?? `${label}-${index}`,
    label,
    value,
    wide: shouldUseWideCell(item, value)
  };
}

function shouldUseWideCell(item, value) {
  if (item?.wide === true) return true;
  if (item?.wide === false || !props.autoWide || props.variant === "metric") return false;
  return String(value).length >= props.wideValueLength || /[；,，、/]/.test(String(value));
}

function formatCellText(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}
</script>
