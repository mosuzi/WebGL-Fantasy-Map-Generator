<template>
  <div :class="className">
    <div v-for="metric in metrics" :key="metric.label">
      <span>{{ metric.label }}</span>
      <strong>{{ metric.value }}</strong>
    </div>
  </div>
</template>

<script setup>
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
  }
});
</script>
