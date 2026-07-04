<template>
  <div :class="['ui-detail-grid', className]">
    <template v-if="visibleRows.length">
      <div v-for="row in visibleRows" :key="row.label">
        <span>{{ row.label }}</span>
        <strong>{{ row.value }}</strong>
      </div>
    </template>
    <template v-else>{{ emptyText }}</template>
  </div>
</template>

<script setup>
import {computed} from "vue";
import {useDebugMode} from "../../composables/use-debug-mode.js";

defineOptions({
  name: "UiDetailGrid"
});

const props = defineProps({
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

const debugEnabled = useDebugMode();
const visibleRows = computed(() => props.rows.filter(row => !row?.debug || debugEnabled.value));
</script>
