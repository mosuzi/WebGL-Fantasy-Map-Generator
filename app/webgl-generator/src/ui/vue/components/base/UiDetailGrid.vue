<template>
  <UiKeyValueGrid
    :class-name="className"
    :items="rows"
    :empty-text="emptyText"
    variant="detail"
    :min-width="minWidth"
    :auto-wide="autoWide"
    :wide-value-length="wideValueLength"
  />
</template>

<script setup>
import UiKeyValueGrid from "./UiKeyValueGrid.vue";

defineOptions({
  name: "UiDetailGrid"
});

defineProps({
  className: {
    type: String,
    required: true
  },
  rows: {
    type: Array,
    default: () => []
  },
  emptyText: {
    type: String,
    default: "未选中对象"
  },
  minWidth: {
    type: Number,
    default: 150
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
</script>
