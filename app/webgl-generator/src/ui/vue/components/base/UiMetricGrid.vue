<template>
  <UiKeyValueGrid
    :class-name="className"
    :items="metrics"
    variant="metric"
    :min-width="minWidth"
    :auto-wide="false"
  />
</template>

<script setup>
import UiKeyValueGrid from "./UiKeyValueGrid.vue";

defineOptions({
  name: "UiMetricGrid"
});

defineProps({
  metrics: {
    type: Array,
    required: true
  },
  className: {
    type: String,
    default: "height-panel-summary"
  },
  minWidth: {
    type: Number,
    default: 112
  }
});
</script>
