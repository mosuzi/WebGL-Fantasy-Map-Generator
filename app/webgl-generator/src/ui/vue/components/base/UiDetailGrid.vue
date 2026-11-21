<template>
  <UiKeyValueGrid
    ref="grid"
    :class-name="className"
    :items="rows"
    :empty-text="emptyText"
    variant="detail"
    :min-width="minWidth"
    :auto-wide="autoWide"
    :wide-value-length="wideValueLength"
  >
    <template v-for="(_, name) in $slots" #[name]="slotProps"><slot :name="name" v-bind="slotProps" /></template>
  </UiKeyValueGrid>
</template>

<script setup>
import UiKeyValueGrid from "./UiKeyValueGrid.vue";
import {ref} from "vue";
const grid = ref(null);
defineExpose({edit: label => grid.value?.edit(label)});

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
