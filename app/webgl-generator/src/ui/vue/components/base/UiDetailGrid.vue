<template>
  <div :class="className">
    <template v-if="rows.length">
      <div v-for="row in rows" :key="row.label">
        <span>{{ row.label }}</span>
        <strong>{{ row.value }}</strong>
      </div>
    </template>
    <template v-else>{{ emptyText }}</template>
  </div>
</template>

<script setup>
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
  }
});
</script>
